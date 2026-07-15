import { Worker } from 'bullmq';
import { redisConnection } from './queues';
import { db } from '@/lib/db';
import { trackers, customers, jobLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { TelegramService } from '../services/telegramService';

// Mock external Tracker API data for MVP (same as trackerSyncQueue.ts)
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

/**
 * Attaches unified database lifecycle logging listeners to a BullMQ worker.
 */
export function registerWorkerLogger(worker: Worker) {
  worker.on('active', async (job) => {
    try {
      const [logRecord] = await db
        .insert(jobLogs)
        .values({
          jobName: `${worker.name}:${job.name}`,
          status: 'running',
          payload: job.data,
          startedAt: new Date(),
        })
        .returning();

      if (logRecord) {
        (job as any).customLogId = logRecord.id;
      }
    } catch (err: any) {
      logger.error(`[WorkerLogger] Failed to create active log for job ${job.id}: ${err.message}`, err);
    }
  });

  worker.on('completed', async (job, result) => {
    const logId = (job as any).customLogId;
    if (!logId) return;

    try {
      await db
        .update(jobLogs)
        .set({
          status: 'completed',
          result: result || null,
          completedAt: new Date(),
        })
        .where(eq(jobLogs.id, logId));
    } catch (err: any) {
      logger.error(`[WorkerLogger] Failed to write complete log for job ${job.id}: ${err.message}`, err);
    }
  });

  worker.on('failed', async (job, err) => {
    const logId = job ? (job as any).customLogId : null;

    try {
      if (logId) {
        await db
          .update(jobLogs)
          .set({
            status: 'failed',
            errorMessage: err.message,
            completedAt: new Date(),
          })
          .where(eq(jobLogs.id, logId));
      } else if (job) {
        // Fallback write if active event was skipped
        await db.insert(jobLogs).values({
          jobName: `${worker.name}:${job.name}`,
          status: 'failed',
          payload: job.data,
          errorMessage: err.message,
          startedAt: new Date(),
          completedAt: new Date(),
        });
      }
    } catch (logErr: any) {
      logger.error(`[WorkerLogger] Failed to write fail log for job ${job?.id}: ${logErr.message}`, logErr);
    }
  });
}

// Workers instances
let messageWorker: Worker | null = null;
let syncWorker: Worker | null = null;

export function initMessageWorker() {
  if (messageWorker) return messageWorker;

  messageWorker = new Worker(
    'message-delivery',
    async (job) => {
      if (job.name === 'send' || job.name === 'tracker-sync-message') {
        const { shipmentExportId, alertType } = job.data;
        logger.info(`[MessageWorker] Dispatching alert ${alertType} for shipment ${shipmentExportId}`);
        await TelegramService.sendExportAlert(shipmentExportId, alertType);
        return { status: 'alert_sent', shipmentExportId, alertType };
      } else if (job.name === 'send-message-job') {
        const { templateId, shipmentExportId } = job.data;
        logger.info(`[MessageWorker] Dispatching rendered template ${templateId} for shipment ${shipmentExportId}`);
        await TelegramService.renderAndSend(templateId, shipmentExportId);
        return { status: 'template_sent', templateId, shipmentExportId };
      }
      throw new Error(`Unknown job type: ${job.name}`);
    },
    { connection: redisConnection as any }
  );

  registerWorkerLogger(messageWorker);
  return messageWorker;
}

export function initSyncWorker() {
  if (syncWorker) return syncWorker;

  syncWorker = new Worker(
    'tracker-sync',
    async (job) => {
      const { customerId: requestedCustomerId } = job.data;
      let targetCustomerId = requestedCustomerId;

      // 1. Resolve customer assignment fallback
      if (!targetCustomerId) {
        const firstCust = await db
          .select({ id: customers.id })
          .from(customers)
          .limit(1)
          .then((res) => res[0]);

        if (firstCust) {
          targetCustomerId = firstCust.id;
        } else {
          throw new Error('No customers found in database. Cannot assign synced trackers.');
        }
      } else {
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

      // 2. Fetch mock external trackers
      const externalTrackers = getMockExternalTrackers();
      let created = 0;
      let updated = 0;

      for (const ext of externalTrackers) {
        const existingTracker = await db
          .select()
          .from(trackers)
          .where(eq(trackers.externalTrackerId, ext.externalTrackerId))
          .limit(1)
          .then((res) => res[0]);

        if (existingTracker) {
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
    {
      connection: redisConnection as any,
      concurrency: 1, // Concurrency 1 to run sequentially and avoid database race conditions
    }
  );

  registerWorkerLogger(syncWorker);
  return syncWorker;
}
