import { Worker } from 'bullmq';
import { redisConnection } from './queues';
import { db } from '@/lib/db';
import { shipmentExports, trackers } from '@/db/schema';
import { eq, and, inArray, or, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { ExportTrackingService } from '../services/exportTrackingService';
import { registerWorkerLogger } from './workers';
import { SettingsService } from '../services/settingsService';

/**
 * Sweeps active shipments to detect and flag signal loss exceptions.
 * Identifies shipments where no tracker ping has been recorded in the last 24 hours.
 */
async function runSignalLossCheck(): Promise<number> {
  let hours = 24;
  try {
    const setting = await SettingsService.getSetting('EXPORT_SIGNAL_LOSS_HOURS');
    if (setting) {
      hours = parseInt(setting, 10);
    }
  } catch (err: any) {
    logger.warn(`[SignalLossCheck] Failed to load EXPORT_SIGNAL_LOSS_HOURS: ${err.message}`);
  }

  const thresholdDate = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const signalLossShipments = await db
    .select({ id: shipmentExports.id })
    .from(shipmentExports)
    .innerJoin(trackers, eq(shipmentExports.trackerId, trackers.id))
    .where(
      and(
        inArray(shipmentExports.status, ['pending_export', 'in_transit', 'approaching_exit']),
        or(
          sql`${trackers.lastSeenAt} is null`,
          sql`${trackers.lastSeenAt} < ${thresholdDate}`
        )
      )
    );

  let count = 0;
  for (const s of signalLossShipments) {
    try {
      await ExportTrackingService.flagException(s.id, 'signal_loss');
      count++;
    } catch (err: any) {
      logger.error(`[SignalLossCheck] Failed to flag exception for shipment ${s.id}: ${err.message}`, err);
    }
  }

  return count;
}

/**
 * Sweeps active shipments to detect and flag overdue exceptions.
 * Identifies shipments whose expected export date is in the past and are still not confirmed or flagged.
 */
async function runOverdueCheck(): Promise<number> {
  const overdueShipments = await db
    .select({ id: shipmentExports.id })
    .from(shipmentExports)
    .where(
      and(
        inArray(shipmentExports.status, ['pending_export', 'in_transit', 'approaching_exit', 'exited_pending_confirmation']),
        sql`${shipmentExports.expectedExportDate} is not null`,
        sql`${shipmentExports.expectedExportDate} < ${new Date()}`
      )
    );

  let count = 0;
  for (const s of overdueShipments) {
    try {
      await ExportTrackingService.flagException(s.id, 'overdue');
      count++;
    } catch (err: any) {
      logger.error(`[OverdueCheck] Failed to flag exception for shipment ${s.id}: ${err.message}`, err);
    }
  }

  return count;
}

let exportGeofenceWorker: Worker | null = null;

export function initExportGeofenceWorker() {
  if (exportGeofenceWorker) return exportGeofenceWorker;

  exportGeofenceWorker = new Worker(
    'export-geofence-check',
    async (job) => {
      if (job.name === 'geofence-check') {
        const { trackerId, lat, lng, recordedAt } = job.data;
        logger.info(`[ExportGeofenceWorker] Checking geofences for tracker ${trackerId}`);
        await ExportTrackingService.evaluatePosition(trackerId, lat, lng, new Date(recordedAt));
        return { status: 'geofence_evaluated', trackerId };
      } else if (job.name === 'exception-check') {
        logger.info('[ExportGeofenceWorker] Running scheduled overdue and signal loss checks sweep...');
        const signalLossCount = await runSignalLossCheck();
        const overdueCount = await runOverdueCheck();
        return { status: 'exception_checks_run', signalLossCount, overdueCount };
      }
      throw new Error(`Unknown job type: ${job.name}`);
    },
    { connection: redisConnection as any }
  );

  registerWorkerLogger(exportGeofenceWorker);
  return exportGeofenceWorker;
}
