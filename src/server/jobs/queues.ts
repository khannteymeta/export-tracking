import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Setup single shared Redis connection with BullMQ-recommended settings
export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Configure standardized job options
export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  timeout: 60000, // 1 minute timeout
  removeOnComplete: true,
};

// Define queues
export const messageQueue = new Queue('message-delivery', {
  connection: redisConnection as any,
  defaultJobOptions,
});

export const syncQueue = new Queue('tracker-sync', {
  connection: redisConnection as any,
  defaultJobOptions,
});

export const exportGeofenceQueue = new Queue('export-geofence-check', {
  connection: redisConnection as any,
  defaultJobOptions,
});

export const cleanupQueue = new Queue('cleanup-logs', {
  connection: redisConnection as any,
  defaultJobOptions,
});

// Define matching QueueEvents for completion/error hook listeners
export const messageQueueEvents = new QueueEvents('message-delivery', { connection: redisConnection as any });
export const syncQueueEvents = new QueueEvents('tracker-sync', { connection: redisConnection as any });
export const exportGeofenceQueueEvents = new QueueEvents('export-geofence-check', { connection: redisConnection as any });
export const cleanupQueueEvents = new QueueEvents('cleanup-logs', { connection: redisConnection as any });

// ============================================================================
// QUEUE MANAGEMENT OPERATIONS
// ============================================================================

/**
 * Enqueues a message delivery task with optional priority LIFO.
 */
export async function enqueueMessage(
  shipmentExportId: string,
  alertType: string,
  priority?: 'high' | 'normal'
) {
  // In BullMQ LIFO (last-in-first-out) or LIFO options can be used for priority message queuing
  const isLifo = priority === 'high';
  await messageQueue.add(
    'send',
    { shipmentExportId, alertType },
    { lifo: isLifo }
  );
}

/**
 * Enqueues an external tracker sync task.
 */
export async function enqueueSyncTrackers(customerId?: string) {
  await syncQueue.add('sync', { customerId });
}

/**
 * Enqueues a cargo position geofence check.
 */
export async function enqueueGeofenceCheck(
  trackerId: string,
  lat: number,
  lng: number,
  recordedAt: Date
) {
  await exportGeofenceQueue.add('geofence-check', {
    trackerId,
    lat,
    lng,
    recordedAt: recordedAt.toISOString(),
  });
}
