import { db } from '@/lib/db';
import { trackers, trackerEvents, shipmentExports, templates } from '@/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { NotFoundError } from '@/lib/errors';
import {
  trackerWebhookSchema,
  type TrackerWebhookInput,
} from '@/lib/validation';
import { TrackerService } from '../services/trackerService';
import { exportGeofenceQueue, messageQueue } from '../jobs/queues';
import { logger } from '@/lib/logger';

export const TrackerHandler = {
  /**
   * Parses the webhook JSON payload using the Zod schema.
   */
  parseEvent(payload: unknown): TrackerWebhookInput {
    const result = trackerWebhookSchema.safeParse(payload);
    if (!result.success) {
      throw new Error('Invalid payload');
    }
    return result.data;
  },

  /**
   * Validates coordinate integrity ranges and tracker properties.
   */
  validateEventIntegrity(event: TrackerWebhookInput): boolean {
    if (!event.externalTrackerId || event.externalTrackerId.trim() === '') {
      return false;
    }
    if (event.lat < -90 || event.lat > 90) return false;
    if (event.lng < -180 || event.lng > 180) return false;
    // coordinates are not zero placeholder values
    if (event.lat === 0 && event.lng === 0) return false;

    return true;
  },

  /**
   * Stores the tracker position event in the database and updates tracker's lastSeenAt.
   */
  async storeEvent(event: TrackerWebhookInput): Promise<string> {
    // 1. Resolve tracker by its external identifier
    const tracker = await TrackerService.getByExternalId(event.externalTrackerId);
    if (!tracker) {
      throw new NotFoundError(`Tracker with External ID ${event.externalTrackerId}`);
    }

    // 2. Insert the event record
    const [inserted] = await db
      .insert(trackerEvents)
      .values({
        trackerId: tracker.id,
        lat: event.lat,
        lng: event.lng,
        recordedAt: event.recordedAt,
        rawPayload: event.raw || {},
      })
      .returning();

    // 3. Update lastSeenAt timestamp on the tracker device
    await db
      .update(trackers)
      .set({
        lastSeenAt: event.recordedAt,
        updatedAt: new Date(),
      })
      .where(eq(trackers.id, tracker.id));

    return inserted.id;
  },

  /**
   * Enqueues background jobs for geofence evaluation and template message dispatching.
   */
  async enqueueExportGeofenceCheck(
    trackerId: string,
    lat: number,
    lng: number,
    recordedAt: Date
  ): Promise<void> {
    // 1. Enqueue export geofence check
    await exportGeofenceQueue.add('geofence-check-job', {
      trackerId,
      lat,
      lng,
      recordedAt: recordedAt.toISOString(),
    });

    // 2. Fetch any active shipment export linked to this tracker
    const shipment = await db
      .select()
      .from(shipmentExports)
      .where(
        and(
          eq(shipmentExports.trackerId, trackerId),
          ne(shipmentExports.status, 'export_confirmed'),
          ne(shipmentExports.status, 'exception')
        )
      )
      .limit(1)
      .then((res) => res[0]);

    if (!shipment) return; // No active shipment, nothing else to do

    // 3. If a message template is configured for customer milestone alerts, enqueue it
    const template = await db
      .select()
      .from(templates)
      .where(eq(templates.customerId, shipment.customerId))
      .limit(1)
      .then((res) => res[0]);

    if (template) {
      await messageQueue.add('send-message-job', {
        templateId: template.id,
        shipmentExportId: shipment.id,
      });
      logger.info(`[TrackerHandler] Enqueued message job for template ${template.id} and shipment ${shipment.id}`);
    }
  },
};
