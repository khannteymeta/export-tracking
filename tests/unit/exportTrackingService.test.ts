import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ExportTrackingService } from '@/server/services/exportTrackingService';
import { db } from '@/lib/db';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '@/lib/errors';
import { shipmentExports, trackers, trackerEvents, exportBorderEvents, customerTelegramChats, telegramChats, auditLogs } from '@/db/schema';
import { TrackerService } from '@/server/services/trackerService';
import { ExportGeofenceService } from '@/server/services/exportGeofenceService';
import { TelegramService } from '@/server/services/telegramService';

// Strictly valid version 4 UUID strings
const VALID_CUSTOMER_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const VALID_TRACKER_ID = '8b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const VALID_SHIPMENT_ID = '7b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const VALID_USER_ID = '6b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const VALID_GEOFENCE_ID = '5b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

// Helper to create a chainable mock for Drizzle ORM
const makeChainableMock = (finalValue?: any) => {
  const mock: any = {};
  const methods = [
    'select',
    'from',
    'where',
    'limit',
    'offset',
    'orderBy',
    'leftJoin',
    'innerJoin',
    'groupBy',
    'as',
    'insert',
    'values',
    'returning',
    'update',
    'set',
    'delete',
  ];
  methods.forEach((method) => {
    mock[method] = vi.fn().mockReturnValue(mock);
  });
  if (finalValue !== undefined) {
    mock.then = vi.fn((resolve) => resolve(finalValue));
  }
  return mock;
};

// Mock the db dependency
vi.mock('@/lib/db', () => {
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    },
  };
});

// Mock TrackerService
vi.mock('@/server/services/trackerService', () => {
  return {
    TrackerService: {
      updateStatus: vi.fn().mockResolvedValue(undefined),
    },
  };
});

// Mock ExportGeofenceService
vi.mock('@/server/services/exportGeofenceService', () => {
  return {
    ExportGeofenceService: {
      list: vi.fn().mockResolvedValue([]),
      isPointInGeofence: vi.fn().mockReturnValue(false),
    },
  };
});

// Mock TelegramService
vi.mock('@/server/services/telegramService', () => {
  return {
    TelegramService: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      sendExportAlert: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('ExportTrackingService Unit Tests', () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    vi.mocked(db.insert).mockReset();
    vi.mocked(db.update).mockReset();
    vi.mocked(TrackerService.updateStatus).mockClear();
    vi.mocked(TelegramService.sendExportAlert).mockClear();
    vi.mocked(ExportGeofenceService.list).mockReset();
    vi.mocked(ExportGeofenceService.isPointInGeofence).mockReset();
  });

  describe('createShipmentExport', () => {
    const createInput = {
      trackerId: VALID_TRACKER_ID,
      customerId: VALID_CUSTOMER_ID,
      productCategory: 'electronics' as const,
      productDescription: 'High-end microchips',
      destinationCountry: 'SG',
      shippingMethod: 'air_freight' as const,
    };

    it('should create shipment export successfully', async () => {
      const mockTracker = { id: VALID_TRACKER_ID };
      const mockLatestEvent = { lat: 37.7, lng: -122.4, recordedAt: new Date() };
      const mockReturnedShipment = { id: VALID_SHIPMENT_ID, ...createInput, status: 'pending_export' };

      // 1. Mock select tracker (existence check)
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockTracker]));
      // 2. Mock select active shipment (active check - returns empty)
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([]));
      // 3. Mock select trackerEvents (latest position)
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockLatestEvent]));
      // 4. Mock insert shipment
      vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([mockReturnedShipment]));
      // 5. Mock insert audit log
      vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([]));

      const result = await ExportTrackingService.createShipmentExport(createInput, VALID_USER_ID);

      expect(result).toEqual(mockReturnedShipment);
      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it('should throw ConflictError if tracker has an active shipment', async () => {
      const mockTracker = { id: VALID_TRACKER_ID };
      const activeShipment = { id: 'active-ship' };

      // 1. Mock select tracker
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockTracker]));
      // 2. Mock select active shipment (returns active shipment)
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([activeShipment]));

      await expect(
        ExportTrackingService.createShipmentExport(createInput, VALID_USER_ID)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('confirmExport', () => {
    it('should manually confirm export, log manuals, and reduce tracker rate', async () => {
      const mockShipment = {
        id: VALID_SHIPMENT_ID,
        trackerId: VALID_TRACKER_ID,
        destinationCountry: 'SG',
        originLat: 1.2,
        originLng: 103.8,
        status: 'pending_export',
      };
      const mockUpdatedShipment = { ...mockShipment, status: 'export_confirmed' };

      // 1. Mock select shipment
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockShipment]));
      // 2. Mock select geofences (loads country border)
      vi.mocked(ExportGeofenceService.list).mockResolvedValueOnce([{ id: VALID_GEOFENCE_ID } as any]);
      // 3. Mock update status
      vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([mockUpdatedShipment]));
      // 4. Mock insert border event
      vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([]));
      // 5. Mock insert audit log
      vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([]));

      const result = await ExportTrackingService.confirmExport(VALID_SHIPMENT_ID, VALID_USER_ID, 'Manual notes');

      expect(result.status).toBe('export_confirmed');
      expect(db.update).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalledTimes(2);
      expect(TrackerService.updateStatus).toHaveBeenCalledWith(VALID_TRACKER_ID, 'inactive');
      expect(TelegramService.sendExportAlert).toHaveBeenCalledWith(VALID_SHIPMENT_ID, 'confirmed');
    });
  });

  describe('flagException', () => {
    it('should flag exception and send telegram message', async () => {
      const mockShipment = { id: VALID_SHIPMENT_ID, shipmentReference: 'REF-123' };

      // 1. Mock select shipment existence
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockShipment]));
      // 2. Mock update status
      vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([]));
      // 3. Mock insert audit log
      vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([]));

      await ExportTrackingService.flagException(VALID_SHIPMENT_ID, 'Delayed past target date', VALID_USER_ID);

      expect(db.update).toHaveBeenCalled();
      expect(TelegramService.sendExportAlert).toHaveBeenCalledWith(VALID_SHIPMENT_ID, 'exception', { reason: 'Delayed past target date' });
    });
  });

  describe('evaluatePosition', () => {
    const mockShipment = {
      id: VALID_SHIPMENT_ID,
      trackerId: VALID_TRACKER_ID,
      customerId: VALID_CUSTOMER_ID,
      shipmentReference: 'S1',
      status: 'pending_export',
      shippingMethod: 'air_freight',
      destinationCountry: 'SG',
    };

    const mockAirportGeofence = {
      id: 'geo-airport',
      name: 'Changi Cargo Buffer',
      type: 'airport_zone' as const,
      countryCode: 'SG',
    };

    const mockBorderGeofence = {
      id: 'geo-border',
      name: 'Singapore Boundary',
      type: 'country_border' as const,
      countryCode: 'SG',
    };

    it('should trigger entered_buffer when inside exit geofence buffer zone', async () => {
      // 1. Mock select active shipment
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockShipment]));
      // 2. Mock list active geofences
      vi.mocked(ExportGeofenceService.list).mockResolvedValueOnce([mockAirportGeofence, mockBorderGeofence] as any);
      // 3. Mock point-in-geofence check for airport (inside -> returns true)
      vi.mocked(ExportGeofenceService.isPointInGeofence).mockReturnValueOnce(true);

      // 4. Mock db operations (update, insert border event, insert audit log)
      vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([]));
      vi.mocked(db.insert).mockReturnValue(makeChainableMock([]));

      await ExportTrackingService.evaluatePosition(VALID_TRACKER_ID, 1.25, 103.85, new Date());

      expect(db.update).toHaveBeenCalled();
      expect(TelegramService.sendExportAlert).toHaveBeenCalledWith(VALID_SHIPMENT_ID, 'approaching_exit');
    });

    it('should trigger crossed_boundary when outside country border geofence', async () => {
      // 1. Mock select active shipment
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockShipment]));
      // 2. Mock list active geofences
      vi.mocked(ExportGeofenceService.list).mockResolvedValueOnce([mockBorderGeofence] as any);
      // 3. Mock point-in-geofence check for border (outside -> returns false)
      vi.mocked(ExportGeofenceService.isPointInGeofence).mockReturnValueOnce(false);

      // 4. Mock db operations
      vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([]));
      vi.mocked(db.insert).mockReturnValue(makeChainableMock([]));

      await ExportTrackingService.evaluatePosition(VALID_TRACKER_ID, 1.40, 103.85, new Date());

      expect(db.update).toHaveBeenCalled();
      expect(TelegramService.sendExportAlert).toHaveBeenCalledWith(VALID_SHIPMENT_ID, 'crossed_boundary');
    });

    it('should trigger re_entered when shipment goes back inside country boundary', async () => {
      const mockExitedShipment = { ...mockShipment, status: 'exited_pending_confirmation' };

      // 1. Mock select active shipment
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockExitedShipment]));
      // 2. Mock list active geofences
      vi.mocked(ExportGeofenceService.list).mockResolvedValueOnce([mockBorderGeofence] as any);
      // 3. Mock point-in-geofence check for border (inside -> returns true)
      vi.mocked(ExportGeofenceService.isPointInGeofence).mockReturnValueOnce(true);

      // 4. Mock db operations
      vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([]));
      vi.mocked(db.insert).mockReturnValue(makeChainableMock([]));

      await ExportTrackingService.evaluatePosition(VALID_TRACKER_ID, 1.22, 103.82, new Date());

      expect(db.update).toHaveBeenCalled();
      expect(TelegramService.sendExportAlert).toHaveBeenCalledWith(VALID_SHIPMENT_ID, 're_entered');
    });

    it('should auto-confirm export on the 3rd consecutive outside boundary ping (debounce)', async () => {
      const mockExitedShipment = { ...mockShipment, status: 'exited_pending_confirmation' };
      const mockPings = [
        { lat: 1.40, lng: 103.85, recordedAt: new Date() },
        { lat: 1.41, lng: 103.85, recordedAt: new Date() },
        { lat: 1.42, lng: 103.85, recordedAt: new Date() },
      ];

      // 1. Mock select active shipment
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockExitedShipment]));
      // 2. Mock list active geofences
      vi.mocked(ExportGeofenceService.list).mockResolvedValueOnce([mockBorderGeofence] as any);
      // 3. Mock point-in-geofence check for the current ping (outside -> returns false)
      vi.mocked(ExportGeofenceService.isPointInGeofence).mockReturnValueOnce(false);
      // 4. Mock select latest 3 position pings from database
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock(mockPings));
      // 5. Mock point-in-geofence checks for the 3 pings inside the loop (all outside -> return false, false, false)
      vi.mocked(ExportGeofenceService.isPointInGeofence).mockReturnValueOnce(false);
      vi.mocked(ExportGeofenceService.isPointInGeofence).mockReturnValueOnce(false);
      vi.mocked(ExportGeofenceService.isPointInGeofence).mockReturnValueOnce(false);

      // 6. Mock db operations
      vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([]));
      vi.mocked(db.insert).mockReturnValue(makeChainableMock([]));

      await ExportTrackingService.evaluatePosition(VALID_TRACKER_ID, 1.40, 103.85, new Date());

      expect(db.update).toHaveBeenCalled();
      expect(TrackerService.updateStatus).toHaveBeenCalledWith(VALID_TRACKER_ID, 'inactive');
      expect(TelegramService.sendExportAlert).toHaveBeenCalledWith(VALID_SHIPMENT_ID, 'confirmed');
    });
  });
});
