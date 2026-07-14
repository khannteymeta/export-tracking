import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TrackerService } from '@/server/services/trackerService';
import { db } from '@/lib/db';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '@/lib/errors';
import { trackers, customerTelegramChats, shipmentExports, trackerEvents, trackerStatusHistory } from '@/db/schema';
import { ExportTrackingService } from '@/server/services/exportTrackingService';

// Valid UUID strings for schema validations
const VALID_CUSTOMER_ID = 'c34685ab-2345-4321-ba32-432109876543';
const VALID_TRACKER_ID = 'd45796bc-3456-5432-cb43-543210987654';
const VALID_SHIPMENT_ID = 'f67918de-5678-7654-ed65-765432109876';

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
      delete: vi.fn(),
    },
  };
});

// Mock ioredis to prevent connection attempts in tests
vi.mock('ioredis', () => {
  return {
    Redis: vi.fn().mockImplementation(function (this: any) {
      this.incr = vi.fn().mockResolvedValue(1);
      this.expire = vi.fn().mockResolvedValue(true);
      this.on = vi.fn();
      return this;
    }),
  };
});

// Mock the BullMQ/Redis queues and workers dependencies
vi.mock('@/server/jobs/queues', () => {
  return {
    syncQueue: {
      add: vi.fn().mockResolvedValue({
        id: 'sync-job-id',
        waitUntilFinished: vi.fn().mockResolvedValue({
          synced: 3,
          created: 2,
          updated: 1,
        }),
      }),
    },
    syncQueueEvents: {},
  };
});

vi.mock('@/server/jobs/workers', () => {
  return {
    initSyncWorker: vi.fn(),
  };
});

// Mock ExportTrackingService
vi.mock('@/server/services/exportTrackingService', () => {
  return {
    ExportTrackingService: {
      evaluatePosition: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('TrackerService Unit Tests', () => {
  beforeEach(() => {
    // Reset database mocks to clear mock queues and histories between tests
    vi.mocked(db.select).mockReset();
    vi.mocked(db.insert).mockReset();
    vi.mocked(db.update).mockReset();
    vi.mocked(db.delete).mockReset();
    vi.mocked(ExportTrackingService.evaluatePosition).mockClear();
  });

  describe('getById', () => {
    it('should retrieve tracker with last event and active shipment export', async () => {
      const mockTracker = { id: VALID_TRACKER_ID, externalTrackerId: 'ext-1', customerId: VALID_CUSTOMER_ID, label: 'T1', trackerType: 'gps', status: 'active' };
      const mockLatestEvent = { recordedAt: new Date('2026-07-14T12:00:00Z') };
      const mockActiveShipment = { id: VALID_SHIPMENT_ID, trackerId: VALID_TRACKER_ID, status: 'in_transit' };

      // 1. Mock tracker fetch
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockTracker]));
      // 2. Mock latest event fetch
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockLatestEvent]));
      // 3. Mock active shipment fetch
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockActiveShipment]));

      const result = await TrackerService.getById(VALID_TRACKER_ID);

      expect(result).toEqual({
        ...mockTracker,
        lastEventTimestamp: mockLatestEvent.recordedAt,
        activeShipmentExport: mockActiveShipment,
      });
      expect(db.select).toHaveBeenCalledTimes(3);
    });

    it('should throw NotFoundError if tracker is not found', async () => {
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([]));

      await expect(TrackerService.getById(VALID_TRACKER_ID)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getByExternalId', () => {
    it('should retrieve tracker by external ID', async () => {
      const mockTracker = { id: VALID_TRACKER_ID, externalTrackerId: 'ext-1' };
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockTracker]));

      const result = await TrackerService.getByExternalId('ext-1');
      expect(result).toEqual(mockTracker);
    });

    it('should return null if tracker is not found', async () => {
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([]));

      const result = await TrackerService.getByExternalId('ext-nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create tracker successfully if customer exists and externalId is unique', async () => {
      const createInput = {
        externalTrackerId: 'ext-new',
        customerId: VALID_CUSTOMER_ID,
        label: 'New Tracker',
        trackerType: 'gps' as const,
      };

      // 1. Mock customer exists check
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([{ id: VALID_CUSTOMER_ID }]));
      // 2. Mock unique externalTrackerId check
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([]));
      // 3. Mock insertion
      const mockReturnedTracker = { id: VALID_TRACKER_ID, ...createInput, status: 'inactive' };
      vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([mockReturnedTracker]));

      const result = await TrackerService.create(createInput);

      expect(result).toEqual(mockReturnedTracker);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should throw NotFoundError if customer does not exist', async () => {
      const createInput = {
        externalTrackerId: 'ext-new',
        customerId: VALID_CUSTOMER_ID,
        label: 'New Tracker',
        trackerType: 'gps' as const,
      };

      // Mock customer exists check (returns empty list)
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([]));

      await expect(TrackerService.create(createInput)).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError if externalTrackerId is already in use', async () => {
      const createInput = {
        externalTrackerId: 'ext-duplicate',
        customerId: VALID_CUSTOMER_ID,
        label: 'New Tracker',
        trackerType: 'gps' as const,
      };

      // 1. Mock customer check
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([{ id: VALID_CUSTOMER_ID }]));
      // 2. Mock external ID check (returns existing tracker)
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([{ id: 'existing-id' }]));

      await expect(TrackerService.create(createInput)).rejects.toThrow(ConflictError);
    });
  });

  describe('update', () => {
    it('should update tracker details and trigger status change logic if status is changed', async () => {
      const existingTracker = { id: VALID_TRACKER_ID, externalTrackerId: 'ext-1', status: 'inactive' };
      const updatedTracker = { ...existingTracker, label: 'New Label', status: 'active' };

      // 1. Mock select tracker (check existence inside update)
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([existingTracker]));
      // 2. Mock select tracker (check existence inside updateStatus)
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([existingTracker]));
      // 3. Mock update (in updateStatus table update)
      vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([]));
      // 4. Mock insert (in updateStatus history insert)
      vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([]));
      // 5. Mock update (in update fields update)
      vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([updatedTracker]));

      const spyStatus = vi.spyOn(TrackerService, 'updateStatus');

      const result = await TrackerService.update(VALID_TRACKER_ID, { label: 'New Label', status: 'active' });

      expect(result.status).toBe('active');
      expect(spyStatus).toHaveBeenCalledWith(VALID_TRACKER_ID, 'active');
      expect(db.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateStatus', () => {
    it('should change status, insert status history, and publish event', async () => {
      const existingTracker = { id: VALID_TRACKER_ID, status: 'inactive' };

      // 1. Mock select
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([existingTracker]));
      // 2. Mock update
      vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([]));
      // 3. Mock insert history
      vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([]));

      const consoleSpy = vi.spyOn(console, 'log');

      await TrackerService.updateStatus(VALID_TRACKER_ID, 'active');

      expect(db.update).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[WebSocket Publish]'));
    });
  });

  describe('getByCustomer', () => {
    it('should retrieve customer trackers list', async () => {
      const mockTrackers = [{ id: 't1', customerId: VALID_CUSTOMER_ID }, { id: 't2', customerId: VALID_CUSTOMER_ID }];
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock(mockTrackers));

      const result = await TrackerService.getByCustomer(VALID_CUSTOMER_ID);

      expect(result).toEqual(mockTrackers);
      expect(db.select).toHaveBeenCalled();
    });
  });

  describe('syncFromTrackerApi', () => {
    it('should trigger sync job and return results', async () => {
      const result = await TrackerService.syncFromTrackerApi(VALID_CUSTOMER_ID);
      expect(result).toEqual({ synced: 3, created: 2, updated: 1 });
    });
  });

  describe('recordPosition', () => {
    it('should log position and update lastSeenAt', async () => {
      const tracker = { id: VALID_TRACKER_ID };
      const recordedAt = new Date();

      // 1. Mock tracker existence
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([tracker]));
      // 2. Mock insert into trackerEvents
      vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([]));
      // 3. Mock update tracker lastSeenAt
      vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([]));
      // 4. Mock select active shipment (returns null -> no hook trigger)
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([]));

      await TrackerService.recordPosition(VALID_TRACKER_ID, 37.7749, -122.4194, recordedAt);

      expect(db.insert).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
      expect(ExportTrackingService.evaluatePosition).not.toHaveBeenCalled();
    });

    it('should trigger evaluatePosition hook if tracker has an active shipment export', async () => {
      const tracker = { id: VALID_TRACKER_ID };
      const recordedAt = new Date();
      const mockActiveShipment = { id: VALID_SHIPMENT_ID };

      // 1. Mock tracker existence
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([tracker]));
      // 2. Mock insert into trackerEvents
      vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([]));
      // 3. Mock update tracker lastSeenAt
      vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([]));
      // 4. Mock select active shipment (returns active shipment)
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockActiveShipment]));

      await TrackerService.recordPosition(VALID_TRACKER_ID, 37.7749, -122.4194, recordedAt);

      expect(db.insert).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
      expect(ExportTrackingService.evaluatePosition).toHaveBeenCalledWith(VALID_TRACKER_ID, 37.7749, -122.4194, recordedAt);
    });
  });
});
