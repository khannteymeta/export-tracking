import { db } from '@/lib/db';
import {
  shipmentExports,
  exportBorderEvents,
  trackers,
  trackerEvents,
  auditLogs,
  type ShipmentExport,
  type ExportBorderEvent,
  type User,
} from '@/db/schema';
import { eq, and, ne, desc, inArray, or } from 'drizzle-orm';
import { NotFoundError, ConflictError, ValidationError } from '@/lib/errors';
import {
  validateInput,
  createShipmentExportSchema,
  type CreateShipmentExportInput,
} from '@/lib/validation';
import { TrackerService } from './trackerService';
import { ExportGeofenceService } from './exportGeofenceService';
import { TelegramService } from './telegramService';
import { SettingsService } from './settingsService';

/**
 * Hook to settle billing/monitoring fees and reduce tracker ping rate.
 */
async function triggerSettlementHook(shipment: ShipmentExport, details: string) {
  console.log(
    `[Settlement Hook] Stopping in-country monitoring billing flag for shipment: ${shipment.id} (${details})`
  );
  try {
    // Reduce tracker ping rate/frequency by deactivating tracker device state
    await TrackerService.updateStatus(shipment.trackerId, 'inactive');
  } catch (err: any) {
    console.error(`[Settlement Hook Error] Failed to reduce tracker ping frequency: ${err.message}`);
  }
}

export const ExportTrackingService = {
  /**
   * Creates a new shipment export, setting origin baseline lat/lng from tracker's last known location.
   */
  async createShipmentExport(data: CreateShipmentExportInput, createdBy: string): Promise<ShipmentExport> {
    const validationResult = validateInput(createShipmentExportSchema, data);
    if (!validationResult.success) {
      throw new ValidationError(validationResult.error);
    }

    const payload = validationResult.data;

    // 1. Verify tracker exists
    const tracker = await db
      .select()
      .from(trackers)
      .where(eq(trackers.id, payload.trackerId))
      .limit(1)
      .then((res) => res[0]);

    if (!tracker) {
      throw new NotFoundError(`Tracker with ID ${payload.trackerId}`);
    }

    // 2. Verify tracker has no other active shipment exports
    const activeShipment = await db
      .select({ id: shipmentExports.id })
      .from(shipmentExports)
      .where(
        and(
          eq(shipmentExports.trackerId, payload.trackerId),
          ne(shipmentExports.status, 'export_confirmed'),
          ne(shipmentExports.status, 'exception')
        )
      )
      .limit(1)
      .then((res) => res[0]);

    if (activeShipment) {
      throw new ConflictError('Tracker already has an active shipment export');
    }

    // 3. Fetch latest position event to set baseline origin lat/lng
    const latestEvent = await db
      .select()
      .from(trackerEvents)
      .where(eq(trackerEvents.trackerId, payload.trackerId))
      .orderBy(desc(trackerEvents.recordedAt))
      .limit(1)
      .then((res) => res[0]);

    if (!latestEvent) {
      throw new ValidationError({
        trackerId: ['Cannot start shipment export: Tracker has no recorded position events to establish origin baseline'],
      });
    }

    // 4. Create the shipment export record
    const [newShipment] = await db
      .insert(shipmentExports)
      .values({
        trackerId: payload.trackerId,
        customerId: payload.customerId,
        productCategory: payload.productCategory,
        productDescription: payload.productDescription,
        quantity: payload.quantity || null,
        weightKg: payload.weightKg ? payload.weightKg.toString() : null,
        shipmentReference: payload.shipmentReference || null,
        containerNumber: payload.containerNumber || null,
        destinationCountry: payload.destinationCountry,
        shippingMethod: payload.shippingMethod,
        status: 'pending_export',
        originLat: latestEvent.lat,
        originLng: latestEvent.lng,
        originCapturedAt: latestEvent.recordedAt,
        expectedExportDate: payload.expectedExportDate || null,
        createdBy,
      })
      .returning();

    // 5. Log to audit_logs
    await db.insert(auditLogs).values({
      userId: createdBy,
      action: 'create_shipment_export',
      entity: 'shipment_export',
      entityId: newShipment.id,
      newValue: newShipment,
    });

    return newShipment;
  },

  /**
   * Processes live position updates and evaluates geofence conditions (buffer entry, boundary crossing, re-entry).
   */
  async evaluatePosition(trackerId: string, lat: number, lng: number, recordedAt: Date): Promise<void> {
    // 1. Fetch active shipment export linked to this tracker
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

    if (!shipment) return; // No active shipment, nothing to evaluate

    // 2. Load active geofences for the shipment's destinationCountry
    const geofences = await ExportGeofenceService.list({
      countryCode: shipment.destinationCountry,
      isActive: true,
    });

    if (geofences.length === 0) return;

    // Filter exit zone geofence based on shipment's shippingMethod
    const getTargetExitGeofenceType = (method: string): string => {
      switch (method) {
        case 'sea_freight':
          return 'port_zone';
        case 'air_freight':
          return 'airport_zone';
        case 'land_border':
        case 'courier':
        default:
          return 'checkpoint_buffer';
      }
    };

    const targetExitType = getTargetExitGeofenceType(shipment.shippingMethod);
    const exitGeofences = geofences.filter((g) => g.type === targetExitType);
    const borderGeofences = geofences.filter((g) => g.type === 'country_border');

    // ==========================================
    // CHECK EXIT ZONES / BUFFERS
    // ==========================================
    if (shipment.status === 'pending_export' || shipment.status === 'in_transit') {
      for (const exitGeofence of exitGeofences) {
        const isInsideBuffer = ExportGeofenceService.isPointInGeofence(lat, lng, exitGeofence);
        if (isInsideBuffer) {
          // Advance status to approaching_exit
          await db
            .update(shipmentExports)
            .set({ status: 'approaching_exit', updatedAt: new Date() })
            .where(eq(shipmentExports.id, shipment.id));

          // Log border event
          await db.insert(exportBorderEvents).values({
            shipmentExportId: shipment.id,
            geofenceId: exitGeofence.id,
            eventType: 'entered_buffer',
            lat,
            lng,
            occurredAt: recordedAt,
            source: 'gps',
          });

          // Log status update to audit logs
          await db.insert(auditLogs).values({
            action: 'update_shipment_status',
            entity: 'shipment_export',
            entityId: shipment.id,
            newValue: { status: 'approaching_exit', reason: 'Entered buffer zone' },
          });

          // Notify customer telegram chats
          await TelegramService.sendExportAlert(shipment.id, 'approaching_exit');

          // Break loop on first matching entry to prevent duplicate evaluations
          return;
        }
      }
    }

    // ==========================================
    // CHECK COUNTRY BOUNDARIES
    // ==========================================
    const borderGeofence = borderGeofences[0];
    if (!borderGeofence) return;

    const isInsideCountry = ExportGeofenceService.isPointInGeofence(lat, lng, borderGeofence);

    if (!isInsideCountry) {
      // Point is OUTSIDE the country border
      if (shipment.status !== 'exited_pending_confirmation' && shipment.status !== 'export_confirmed') {
        // First cross boundary transition: set status to exited_pending_confirmation
        await db
          .update(shipmentExports)
          .set({ status: 'exited_pending_confirmation', updatedAt: new Date() })
          .where(eq(shipmentExports.id, shipment.id));

        await db.insert(exportBorderEvents).values({
          shipmentExportId: shipment.id,
          geofenceId: borderGeofence.id,
          eventType: 'crossed_boundary',
          lat,
          lng,
          occurredAt: recordedAt,
          source: 'gps',
        });

        await db.insert(auditLogs).values({
          action: 'update_shipment_status',
          entity: 'shipment_export',
          entityId: shipment.id,
          newValue: { status: 'exited_pending_confirmation', reason: 'Crossed country border' },
        });

        // Notify Ops/Admin chats
        await TelegramService.sendExportAlert(shipment.id, 'crossed_boundary');
      } else if (shipment.status === 'exited_pending_confirmation') {
        // Debounce logic: check if consecutive pings are all outside the boundary
        const debouncePingsSetting = await SettingsService.getSetting('EXPORT_EXIT_DEBOUNCE_PINGS');
        const debounceLimit = debouncePingsSetting ? parseInt(debouncePingsSetting, 10) : 3;

        const lastThreePings = await db
          .select()
          .from(trackerEvents)
          .where(eq(trackerEvents.trackerId, trackerId))
          .orderBy(desc(trackerEvents.recordedAt))
          .limit(debounceLimit);

        if (lastThreePings.length >= debounceLimit) {
          const allOutside = lastThreePings.every(
            (ping) => !ExportGeofenceService.isPointInGeofence(ping.lat, ping.lng, borderGeofence)
          );

          if (allOutside) {
            // Auto-advance to export_confirmed
            await db
              .update(shipmentExports)
              .set({ status: 'export_confirmed', updatedAt: new Date() })
              .where(eq(shipmentExports.id, shipment.id));

            await db.insert(exportBorderEvents).values({
              shipmentExportId: shipment.id,
              geofenceId: borderGeofence.id,
              eventType: 'confirmed_exit',
              lat,
              lng,
              occurredAt: recordedAt,
              source: 'gps',
            });

            await db.insert(auditLogs).values({
              action: 'update_shipment_status',
              entity: 'shipment_export',
              entityId: shipment.id,
              newValue: { status: 'export_confirmed', reason: 'Confirmed exit (3 consecutive outside pings)' },
            });

            // Trigger settlement hook and send alert
            await triggerSettlementHook(shipment, 'auto-confirmed via GPS debounce');
            await TelegramService.sendExportAlert(shipment.id, 'confirmed');
          }
        }
      }
    } else {
      // Point is INSIDE the country border
      if (shipment.status === 'exited_pending_confirmation') {
        // Re-entry alert and status revert to in_transit
        await db
          .update(shipmentExports)
          .set({ status: 'in_transit', updatedAt: new Date() })
          .where(eq(shipmentExports.id, shipment.id));

        await db.insert(exportBorderEvents).values({
          shipmentExportId: shipment.id,
          geofenceId: borderGeofence.id,
          eventType: 're_entered',
          lat,
          lng,
          occurredAt: recordedAt,
          source: 'gps',
        });

        await db.insert(auditLogs).values({
          action: 'update_shipment_status',
          entity: 'shipment_export',
          entityId: shipment.id,
          newValue: { status: 'in_transit', reason: 'Re-entered country boundary' },
        });

        // Notify Ops/Admin chats
        await TelegramService.sendExportAlert(shipment.id, 're_entered');
      }
    }
  },

  /**
   * Manually overrides and confirms the export (Admin only).
   */
  async confirmExport(shipmentExportId: string, confirmedBy: string, notes?: string): Promise<ShipmentExport> {
    // 1. Verify shipment exists
    const shipment = await db
      .select()
      .from(shipmentExports)
      .where(eq(shipmentExports.id, shipmentExportId))
      .limit(1)
      .then((res) => res[0]);

    if (!shipment) {
      throw new NotFoundError(`Shipment with ID ${shipmentExportId}`);
    }

    if (shipment.status === 'export_confirmed') {
      throw new ConflictError('Shipment export is already confirmed');
    }

    // 2. Find any destination country border geofence for the event record
    const geofences = await ExportGeofenceService.list({
      countryCode: shipment.destinationCountry,
      type: 'country_border',
      isActive: true,
    });
    const geofenceId = geofences[0]?.id || null;

    // 3. Update status to export_confirmed
    const [updatedShipment] = await db
      .update(shipmentExports)
      .set({ status: 'export_confirmed', updatedAt: new Date() })
      .where(eq(shipmentExports.id, shipmentExportId))
      .returning();

    // 4. Log border event
    await db.insert(exportBorderEvents).values({
      shipmentExportId,
      geofenceId: geofenceId as any, // nullable
      eventType: 'confirmed_exit',
      lat: shipment.originLat, // Use baseline origin as placeholder coordinate
      lng: shipment.originLng,
      occurredAt: new Date(),
      source: 'manual_admin',
      confirmedBy,
      notes: notes || null,
    });

    // 5. Log audit event
    await db.insert(auditLogs).values({
      userId: confirmedBy,
      action: 'confirm_shipment_export',
      entity: 'shipment_export',
      entityId: shipmentExportId,
      newValue: updatedShipment,
    });

    // 6. Trigger settlement hook and send alert
    await triggerSettlementHook(shipment, `manually confirmed by Admin User ID ${confirmedBy}`);
    await TelegramService.sendExportAlert(shipmentExportId, 'confirmed');

    return updatedShipment;
  },

  /**
   * Flags a shipment export as exception.
   */
  async flagException(shipmentExportId: string, reason: string, flaggedBy?: string): Promise<void> {
    // 1. Verify existence
    const shipment = await db
      .select()
      .from(shipmentExports)
      .where(eq(shipmentExports.id, shipmentExportId))
      .limit(1)
      .then((res) => res[0]);

    if (!shipment) {
      throw new NotFoundError(`Shipment with ID ${shipmentExportId}`);
    }

    // 2. Set status to exception
    await db
      .update(shipmentExports)
      .set({ status: 'exception', updatedAt: new Date() })
      .where(eq(shipmentExports.id, shipmentExportId));

    // 3. Log audit event
    await db.insert(auditLogs).values({
      userId: flaggedBy || null,
      action: 'flag_shipment_exception',
      entity: 'shipment_export',
      entityId: shipmentExportId,
      newValue: { status: 'exception', reason },
    });

    // 4. Notify ops/admin chats via Telegram
    await TelegramService.sendExportAlert(shipmentExportId, 'exception', { reason });
  },

  /**
   * Retrieves shipment export details.
   */
  async getShipmentExport(id: string): Promise<ShipmentExport> {
    const shipment = await db
      .select()
      .from(shipmentExports)
      .where(eq(shipmentExports.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!shipment) {
      throw new NotFoundError(`Shipment with ID ${id}`);
    }

    return shipment;
  },

  /**
   * Lists shipment exports with filtering, pagination, and Viewer permissions enforcement.
   */
  async listShipmentExports(
    filters?: { status?: string; customerId?: string; destinationCountry?: string; productCategory?: string },
    pagination?: { page?: number; limit?: number },
    requestingUser?: User
  ): Promise<ShipmentExport[]> {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 25;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filters?.status) {
      conditions.push(eq(shipmentExports.status, filters.status as any));
    }
    if (filters?.customerId) {
      conditions.push(eq(shipmentExports.customerId, filters.customerId));
    }
    if (filters?.destinationCountry) {
      conditions.push(eq(shipmentExports.destinationCountry, filters.destinationCountry));
    }
    if (filters?.productCategory) {
      conditions.push(eq(shipmentExports.productCategory, filters.productCategory as any));
    }

    // Role visibility logic: Viewers can only list shipments for customers they are assigned to
    if (requestingUser && requestingUser.role !== 'admin' && requestingUser.role !== 'manager') {
      const assignedIds: string[] = [];
      if (requestingUser.permissions) {
        try {
          const perms = typeof requestingUser.permissions === 'string'
            ? JSON.parse(requestingUser.permissions)
            : requestingUser.permissions;
          if (Array.isArray(perms)) {
            assignedIds.push(...perms.filter((id) => typeof id === 'string'));
          }
        } catch {
          if (typeof requestingUser.permissions === 'string') {
            assignedIds.push(...requestingUser.permissions.split(',').map((p) => p.trim()));
          }
        }
      }

      if (assignedIds.length > 0) {
        conditions.push(
          or(
            inArray(shipmentExports.customerId, assignedIds),
            eq(shipmentExports.createdBy, requestingUser.id)
          )
        );
      } else {
        conditions.push(eq(shipmentExports.createdBy, requestingUser.id));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return await db
      .select()
      .from(shipmentExports)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(shipmentExports.createdAt));
  },

  /**
   * Retrieves Border Event History (Timeline) chronologically.
   */
  async getTimeline(shipmentExportId: string): Promise<ExportBorderEvent[]> {
    // Verify shipment exists
    const exists = await db
      .select({ id: shipmentExports.id })
      .from(shipmentExports)
      .where(eq(shipmentExports.id, shipmentExportId))
      .limit(1)
      .then((res) => res[0]);

    if (!exists) {
      throw new NotFoundError(`Shipment with ID ${shipmentExportId}`);
    }

    return await db
      .select()
      .from(exportBorderEvents)
      .where(eq(exportBorderEvents.shipmentExportId, shipmentExportId))
      .orderBy(exportBorderEvents.occurredAt);
  },
};
