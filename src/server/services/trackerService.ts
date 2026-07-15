import { db } from '@/lib/db';
import {
  trackers,
  customers,
  trackerEvents,
  trackerStatusHistory,
  shipmentExports,
  type Tracker,
  type ShipmentExport,
} from '@/db/schema';
import { eq, and, ne, desc } from 'drizzle-orm';
import { NotFoundError, ConflictError, ValidationError } from '@/lib/errors';
import {
  validateInput,
  createTrackerSchema,
  updateTrackerSchema,
  type CreateTrackerInput,
  type UpdateTrackerInput,
} from '@/lib/validation';
import { syncQueue, syncQueueEvents } from '../jobs/queues';
import { initSyncWorker } from '../jobs/workers';
import { ExportTrackingService } from './exportTrackingService';

/**
 * Publisher helper to simulate sending realtime WebSocket events to connected clients.
 */
export function publishTrackerStatusUpdate(trackerId: string, status: string) {
  console.log(`[WebSocket Publish] Realtime event: Tracker ${trackerId} status changed to ${status}`);
}

export const TrackerService = {
  /**
   * Retrieves a tracker by ID.
   * Includes the last event timestamp and any active shipment export.
   */
  async getById(
    id: string
  ): Promise<Tracker & { lastEventTimestamp: Date | null; activeShipmentExport: ShipmentExport | null }> {
    // 1. Fetch tracker details
    const tracker = await db
      .select()
      .from(trackers)
      .where(eq(trackers.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!tracker) {
      throw new NotFoundError(`Tracker with ID ${id}`);
    }

    // 2. Fetch last event timestamp
    const latestEvent = await db
      .select({ recordedAt: trackerEvents.recordedAt })
      .from(trackerEvents)
      .where(eq(trackerEvents.trackerId, id))
      .orderBy(desc(trackerEvents.recordedAt))
      .limit(1)
      .then((res) => res[0]);

    // 3. Fetch active shipment export (status !== 'export_confirmed')
    const activeShipment = await db
      .select()
      .from(shipmentExports)
      .where(and(eq(shipmentExports.trackerId, id), ne(shipmentExports.status, 'export_confirmed')))
      .limit(1)
      .then((res) => res[0]);

    return {
      ...tracker,
      lastEventTimestamp: latestEvent ? latestEvent.recordedAt : null,
      activeShipmentExport: activeShipment || null,
    };
  },

  /**
   * Finds a tracker by its external identifier.
   */
  async getByExternalId(externalTrackerId: string): Promise<Tracker | null> {
    const result = await db
      .select()
      .from(trackers)
      .where(eq(trackers.externalTrackerId, externalTrackerId))
      .limit(1)
      .then((res) => res[0]);

    return result || null;
  },

  /**
   * Validates input schema, verifies customer existence, and creates a tracker.
   */
  async create(data: CreateTrackerInput): Promise<Tracker> {
    const validationResult = validateInput(createTrackerSchema, data);
    if (!validationResult.success) {
      throw new ValidationError(validationResult.error);
    }

    const { externalTrackerId, customerId, label, trackerType } = validationResult.data;

    // Verify customer exists
    const customerExists = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1)
      .then((res) => res[0]);

    if (!customerExists) {
      throw new NotFoundError(`Customer with ID ${customerId}`);
    }

    // Verify external tracker ID is unique
    const existing = await db
      .select()
      .from(trackers)
      .where(eq(trackers.externalTrackerId, externalTrackerId))
      .limit(1)
      .then((res) => res[0]);

    if (existing) {
      throw new ConflictError(`External Tracker ID ${externalTrackerId} is already in use`);
    }

    const [newTracker] = await db
      .insert(trackers)
      .values({
        externalTrackerId,
        customerId,
        label,
        trackerType,
        status: 'inactive',
      })
      .returning();

    return newTracker;
  },

  /**
   * Updates an existing tracker. Logs history and publishes WS event on status change.
   */
  async update(id: string, data: UpdateTrackerInput): Promise<Tracker> {
    const validationResult = validateInput(updateTrackerSchema, data);
    if (!validationResult.success) {
      throw new ValidationError(validationResult.error);
    }

    // Verify tracker exists
    const existing = await db
      .select()
      .from(trackers)
      .where(eq(trackers.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!existing) {
      throw new NotFoundError(`Tracker with ID ${id}`);
    }

    const { label, status } = validationResult.data;

    // If status changes, handle the lifecycle event
    if (status && status !== existing.status) {
      await this.updateStatus(id, status);
    }

    const updatePayload: Partial<typeof trackers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (label !== undefined) {
      updatePayload.label = label;
    }
    if (status !== undefined) {
      updatePayload.status = status;
    }

    const [updated] = await db
      .update(trackers)
      .set(updatePayload)
      .where(eq(trackers.id, id))
      .returning();

    return updated;
  },

  /**
   * Updates the status of a tracker, writes the history record, and publishes the event to WS.
   */
  async updateStatus(id: string, newStatus: string): Promise<void> {
    const existing = await db
      .select({ status: trackers.status })
      .from(trackers)
      .where(eq(trackers.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!existing) {
      throw new NotFoundError(`Tracker with ID ${id}`);
    }

    const previousStatus = existing.status;

    if (previousStatus !== newStatus) {
      // 1. Update in trackers table
      await db
        .update(trackers)
        .set({
          status: newStatus as any,
          updatedAt: new Date(),
        })
        .where(eq(trackers.id, id));

      // 2. Insert into tracker status history
      await db.insert(trackerStatusHistory).values({
        trackerId: id,
        previousStatus: previousStatus,
        newStatus: newStatus as any,
      });

      // 3. Publish update to WebSocket clients
      publishTrackerStatusUpdate(id, newStatus);
    }
  },

  /**
   * Retrieves all trackers for a customer with optional pagination.
   */
  async getByCustomer(customerId: string, pagination?: { page?: number; limit?: number }): Promise<Tracker[]> {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 25;
    const offset = (page - 1) * limit;

    let query = db
      .select()
      .from(trackers)
      .where(eq(trackers.customerId, customerId))
      .orderBy(desc(trackers.createdAt))
      .limit(limit)
      .offset(offset);

    return await query;
  },

  /**
   * Triggers an asynchronous synchronization job from the external Tracker API using BullMQ.
   */
  async syncFromTrackerApi(customerId?: string): Promise<{ synced: number; created: number; updated: number }> {
    // Start worker lazy
    initSyncWorker();

    // Enqueue sync job
    const job = await syncQueue.add('sync', { customerId });

    // Await job completion and return synchronization metrics
    const result = await job.waitUntilFinished(syncQueueEvents);

    return result as { synced: number; created: number; updated: number };
  },

  /**
   * Inserts a tracker event, updates lastSeenAt, and calls position evaluation hook if an active shipment exists.
   */
  async recordPosition(trackerId: string, lat: number, lng: number, recordedAt: Date): Promise<void> {
    // 1. Verify tracker exists
    const tracker = await db
      .select({ id: trackers.id })
      .from(trackers)
      .where(eq(trackers.id, trackerId))
      .limit(1)
      .then((res) => res[0]);

    if (!tracker) {
      throw new NotFoundError(`Tracker with ID ${trackerId}`);
    }

    // 2. Insert position event into trackerEvents
    await db.insert(trackerEvents).values({
      trackerId,
      lat,
      lng,
      recordedAt,
      rawPayload: { lat, lng, recordedAt: recordedAt.toISOString(), source: 'device' },
    });

    // 3. Update tracker lastSeenAt and updatedAt fields
    await db
      .update(trackers)
      .set({
        lastSeenAt: recordedAt,
        updatedAt: new Date(),
      })
      .where(eq(trackers.id, trackerId));

    // 4. Hook into live export control if an active shipment export exists
    const activeShipment = await db
      .select({ id: shipmentExports.id })
      .from(shipmentExports)
      .where(and(eq(shipmentExports.trackerId, trackerId), ne(shipmentExports.status, 'export_confirmed')))
      .limit(1)
      .then((res) => res[0]);

    if (activeShipment) {
      await ExportTrackingService.evaluatePosition(trackerId, lat, lng, recordedAt);
    }
  },
};
