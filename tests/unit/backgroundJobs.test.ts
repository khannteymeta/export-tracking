import { vi, describe, it, expect, beforeEach } from 'vitest';

// Capture worker handlers during initialization
const capturedHandlers: Record<string, Function> = {};
const capturedListeners: Record<string, Record<string, Function>> = {};

// Mock ioredis to prevent network connection attempts when local Redis is offline
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

// Mock BullMQ completely to inspect job options and extract handlers using constructable classes
vi.mock('bullmq', () => {
  class MockQueue {
    name: string;
    add: any;
    constructor(name: string) {
      this.name = name;
      this.add = vi.fn().mockResolvedValue({ id: `${name}-job-id` });
    }
  }

  class MockWorker {
    name: string;
    on: any;
    constructor(name: string, handler: Function) {
      this.name = name;
      capturedHandlers[name] = handler;
      capturedListeners[name] = {};
      this.on = vi.fn().mockImplementation((event: string, callback: Function) => {
        capturedListeners[name][event] = callback;
      });
    }
  }

  return {
    Queue: MockQueue,
    Worker: MockWorker,
    QueueEvents: vi.fn(),
  };
});

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

// Mock service dependencies
vi.mock('@/server/services/telegramService', () => {
  return {
    TelegramService: {
      sendExportAlert: vi.fn().mockResolvedValue(undefined),
      renderAndSend: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('@/server/services/trackerService', () => {
  return {
    TrackerService: {
      syncFromTrackerApi: vi.fn().mockResolvedValue({ synced: 3 }),
    },
  };
});

vi.mock('@/server/services/exportTrackingService', () => {
  return {
    ExportTrackingService: {
      evaluatePosition: vi.fn().mockResolvedValue(undefined),
      flagException: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import {
  enqueueMessage,
  enqueueSyncTrackers,
  enqueueGeofenceCheck,
  messageQueue,
  syncQueue,
  exportGeofenceQueue,
} from '@/server/jobs/queues';
import { initMessageWorker, initSyncWorker } from '@/server/jobs/workers';
import { initExportGeofenceWorker } from '@/server/jobs/exportGeofenceWorker';
import { TelegramService } from '@/server/services/telegramService';
import { TrackerService } from '@/server/services/trackerService';
import { ExportTrackingService } from '@/server/services/exportTrackingService';
import { db } from '@/lib/db';

// Valid UUID strings
const VALID_CUSTOMER_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const VALID_TRACKER_ID = '8b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const VALID_SHIPMENT_ID = '7b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const VALID_LOG_ID = '5b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

// Helper to create a chainable mock for Drizzle ORM
const makeChainableMock = (finalValue?: any) => {
  const mock: any = {};
  const methods = ['select', 'from', 'where', 'limit', 'leftJoin', 'innerJoin', 'insert', 'values', 'returning', 'update', 'set'];
  methods.forEach((method) => {
    mock[method] = vi.fn().mockReturnValue(mock);
  });
  if (finalValue !== undefined) {
    mock.then = vi.fn((resolve) => resolve(finalValue));
  }
  return mock;
};

describe('Background Processing Unit Tests', () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    vi.mocked(db.insert).mockReset();
    vi.mocked(db.update).mockReset();
    vi.mocked(TelegramService.sendExportAlert).mockClear();
    vi.mocked(TelegramService.renderAndSend).mockClear();
    vi.mocked(TrackerService.syncFromTrackerApi).mockClear();
    vi.mocked(ExportTrackingService.evaluatePosition).mockClear();
    vi.mocked(ExportTrackingService.flagException).mockClear();

    // Trigger worker initializations to capture handlers
    initMessageWorker();
    initSyncWorker();
    initExportGeofenceWorker();
  });

  describe('Queue Enqueue dispatches', () => {
    it('should add standard alert with LIFO options if priority is high', async () => {
      const spyAdd = vi.spyOn(messageQueue, 'add');
      await enqueueMessage(VALID_SHIPMENT_ID, 'confirmed', 'high');
      expect(spyAdd).toHaveBeenCalledWith('send', { shipmentExportId: VALID_SHIPMENT_ID, alertType: 'confirmed' }, { lifo: true });
    });

    it('should add sync task with optional customer', async () => {
      const spyAdd = vi.spyOn(syncQueue, 'add');
      await enqueueSyncTrackers(VALID_CUSTOMER_ID);
      expect(spyAdd).toHaveBeenCalledWith('sync', { customerId: VALID_CUSTOMER_ID });
    });

    it('should add geofence coordinates task with parsed ISO timestamp', async () => {
      const spyAdd = vi.spyOn(exportGeofenceQueue, 'add');
      const recordedAt = new Date('2026-07-14T12:00:00Z');
      await enqueueGeofenceCheck(VALID_TRACKER_ID, 1.25, 103.85, recordedAt);
      expect(spyAdd).toHaveBeenCalledWith('geofence-check', { trackerId: VALID_TRACKER_ID, lat: 1.25, lng: 103.85, recordedAt: '2026-07-14T12:00:00.000Z' });
    });
  });

  describe('Worker Job Actions', () => {
    it('Message worker should handle standard sends', async () => {
      const handler = capturedHandlers['message-delivery'];
      expect(handler).toBeDefined();

      const mockJob = { name: 'send', data: { shipmentExportId: VALID_SHIPMENT_ID, alertType: 'confirmed' } };
      const result = await handler(mockJob);

      expect(result.status).toBe('alert_sent');
      expect(TelegramService.sendExportAlert).toHaveBeenCalledWith(VALID_SHIPMENT_ID, 'confirmed');
    });

    it('Message worker should handle rendered template sends', async () => {
      const handler = capturedHandlers['message-delivery'];
      const mockJob = { name: 'send-message-job', data: { templateId: 'template-1', shipmentExportId: VALID_SHIPMENT_ID } };
      const result = await handler(mockJob);

      expect(result.status).toBe('template_sent');
      expect(TelegramService.renderAndSend).toHaveBeenCalledWith('template-1', VALID_SHIPMENT_ID);
    });

    it('Geofence worker should evaluate position for standard coordinate pings', async () => {
      const handler = capturedHandlers['export-geofence-check'];
      expect(handler).toBeDefined();

      const mockJob = {
        name: 'geofence-check',
        data: { trackerId: VALID_TRACKER_ID, lat: 1.25, lng: 103.85, recordedAt: '2026-07-14T12:00:00.000Z' },
      };
      const result = await handler(mockJob);

      expect(result.status).toBe('geofence_evaluated');
      expect(ExportTrackingService.evaluatePosition).toHaveBeenCalledWith(
        VALID_TRACKER_ID,
        1.25,
        103.85,
        new Date('2026-07-14T12:00:00.000Z')
      );
    });
  });

  describe('Scheduled Repeatable Checks Handler', () => {
    it('Geofence worker exception check should flag signal loss and overdue active shipments', async () => {
      const handler = capturedHandlers['export-geofence-check'];
      const mockJob = { name: 'exception-check', data: {} };

      // Mock Signal Loss check: returns 1 shipment
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([{ id: 'ship-signal-loss' }]));
      // Mock Overdue check: returns 1 shipment
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([{ id: 'ship-overdue' }]));

      const result = await handler(mockJob);

      expect(result).toEqual({
        status: 'exception_checks_run',
        signalLossCount: 1,
        overdueCount: 1,
      });

      expect(ExportTrackingService.flagException).toHaveBeenCalledWith('ship-signal-loss', 'signal_loss');
      expect(ExportTrackingService.flagException).toHaveBeenCalledWith('ship-overdue', 'overdue');
    });
  });

  describe('Database Job Logger Lifecycle Listeners', () => {
    it('should log running record on active event and complete on completion', async () => {
      const activeListener = capturedListeners['message-delivery']['active'];
      const completedListener = capturedListeners['message-delivery']['completed'];

      expect(activeListener).toBeDefined();
      expect(completedListener).toBeDefined();

      const mockJob: any = { name: 'send', data: { shipmentExportId: 'ship-1' } };

      // Mock active insert returning logId
      vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([{ id: VALID_LOG_ID }]));
      await activeListener(mockJob);

      expect(db.insert).toHaveBeenCalled();
      expect(mockJob.customLogId).toBe(VALID_LOG_ID);

      // Mock completed update
      vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([]));
      await completedListener(mockJob, { status: 'alert_sent' });

      expect(db.update).toHaveBeenCalled();
    });

    it('should log failure on failed event', async () => {
      const failedListener = capturedListeners['message-delivery']['failed'];
      expect(failedListener).toBeDefined();

      const mockJob: any = { name: 'send', data: { shipmentExportId: 'ship-1' }, customLogId: VALID_LOG_ID };

      // Mock failed update
      vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([]));
      await failedListener(mockJob, new Error('Network Timeout'));

      expect(db.update).toHaveBeenCalled();
    });
  });
});
