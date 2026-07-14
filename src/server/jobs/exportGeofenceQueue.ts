import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { ExportTrackingService } from '../services/exportTrackingService';
import { logger } from '@/lib/logger';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const exportGeofenceQueue = new Queue('export-geofence-check', { connection: redisConnection });
export const exportGeofenceQueueEvents = new QueueEvents('export-geofence-check', { connection: redisConnection });

let worker: Worker | null = null;

export function initExportGeofenceWorker() {
  if (worker) return;

  worker = new Worker(
    'export-geofence-check',
    async (job) => {
      const { trackerId, lat, lng, recordedAt } = job.data;
      logger.info(`[ExportGeofenceWorker] Running geofence evaluation for tracker ${trackerId} at (${lat}, ${lng})`);
      await ExportTrackingService.evaluatePosition(trackerId, lat, lng, new Date(recordedAt));
    },
    { connection: redisConnection }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[ExportGeofenceWorker] Job ${job?.id} failed: ${err.message}`, err);
  });
}
