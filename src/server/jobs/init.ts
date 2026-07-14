import { initMessageWorker, initSyncWorker } from './workers';
import { initExportGeofenceWorker } from './exportGeofenceWorker';
import { exportGeofenceQueue } from './queues';
import { logger } from '@/lib/logger';

/**
 * Initializes all BullMQ workers and registers repeatable scheduled tasks.
 * Called once during application boot/server start.
 */
export async function initBackgroundJobs() {
  logger.info('[BullMQ Background Jobs] Initializing background queue workers...');

  // 1. Initialize message, tracker sync, and geofence evaluation workers
  initMessageWorker();
  initSyncWorker();
  initExportGeofenceWorker();

  // 2. Add the repeatable exception check job (runs every 30 minutes)
  try {
    await exportGeofenceQueue.add(
      'exception-check',
      {},
      {
        repeat: {
          pattern: '*/30 * * * *', // every 30 minutes cron pattern
        },
      }
    );
    logger.info('[BullMQ Background Jobs] Repeatable exception checks successfully scheduled (every 30 minutes).');
  } catch (err: any) {
    logger.error('[BullMQ Background Jobs] Failed to schedule repeatable exception check job', err);
  }
}
