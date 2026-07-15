import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { db } from '@/lib/db';
import { trackers, customers } from '@/db/schema';
import { eq } from 'drizzle-orm';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const trackerSyncQueue = new Queue('tracker-sync', { connection: redisConnection as any });
export const trackerSyncQueueEvents = new QueueEvents('tracker-sync', { connection: redisConnection as any });

let worker: Worker | null = null;

// Mock external Tracker API data for MVP
const getMockExternalTrackers = () => [
  {
    externalTrackerId: 'ext-track-001',
    label: 'Cargo Pallet GPS Alpha',
    trackerType: 'gps' as const,
    status: 'active' as const,
  },
  {
    externalTrackerId: 'ext-track-002',
    label: 'IoT BLE Temperature Tag Beta',
    trackerType: 'iot_ble' as const,
    status: 'inactive' as const,
  },
  {
    externalTrackerId: 'ext-track-003',
    label: 'RFID Gate Tracker Gamma',
    trackerType: 'rfid_gps' as const,
    status: 'idle' as const,
  },
];

export function initTrackerSyncWorker() {
  if (worker) return;

  worker = new Worker(
    'tracker-sync',
    async (job) => {
      const { customerId: requestedCustomerId } = job.data;
      let targetCustomerId = requestedCustomerId;

      // Fallback to the first customer in the database if customerId is not specified
      if (!targetCustomerId) {
        const firstCust = await db
          .select({ id: customers.id })
          .from(customers)
          .limit(1)
          .then((res) => res[0]);

        if (firstCust) {
          targetCustomerId = firstCust.id;
        } else {
          throw new Error('No customers found in database. Cannot create new trackers without a customer assignment.');
        }
      } else {
        // Verify requested customer exists
        const custExists = await db
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.id, targetCustomerId))
          .limit(1)
          .then((res) => res[0]);

        if (!custExists) {
          throw new Error(`Assigned customer with ID ${targetCustomerId} does not exist`);
        }
      }

      const externalTrackers = getMockExternalTrackers();
      let created = 0;
      let updated = 0;

      for (const ext of externalTrackers) {
        // Check if tracker already exists by externalTrackerId
        const existingTracker = await db
          .select()
          .from(trackers)
          .where(eq(trackers.externalTrackerId, ext.externalTrackerId))
          .limit(1)
          .then((res) => res[0]);

        if (existingTracker) {
          // Update tracker details
          await db
            .update(trackers)
            .set({
              label: ext.label,
              trackerType: ext.trackerType,
              status: ext.status,
              updatedAt: new Date(),
            })
            .where(eq(trackers.id, existingTracker.id));
          updated++;
        } else {
          // Create new tracker
          await db.insert(trackers).values({
            externalTrackerId: ext.externalTrackerId,
            customerId: targetCustomerId,
            label: ext.label,
            trackerType: ext.trackerType,
            status: ext.status,
          });
          created++;
        }
      }

      return {
        synced: externalTrackers.length,
        created,
        updated,
      };
    },
    { connection: redisConnection as any }
  );

  worker.on('failed', (job, err) => {
    console.error(`Tracker Sync Worker: Job ${job?.id} failed:`, err);
  });
}
