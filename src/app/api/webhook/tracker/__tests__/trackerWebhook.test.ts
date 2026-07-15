import { vi, describe, it, expect, beforeEach } from 'vitest';
import { POST } from '@/app/api/webhook/tracker/route';
import { TrackerService } from '@/server/services/trackerService';
import { db } from '@/lib/db';
import { redisConnection, exportGeofenceQueue, messageQueue } from '@/server/jobs/queues';

// Valid UUID strings
const VALID_CUSTOMER_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const VALID_TRACKER_ID = '8b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const VALID_EVENT_ID = '7b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

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
      getByExternalId: vi.fn(),
    },
  };
});

// Mock the BullMQ queues
vi.mock('@/server/jobs/queues', () => {
  return {
    redisConnection: {
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(true),
    },
    exportGeofenceQueue: {
      add: vi.fn().mockResolvedValue({ id: 'geofence-job' }),
    },
    messageQueue: {
      add: vi.fn().mockResolvedValue({ id: 'message-job' }),
    },
  };
});

describe('Tracker Webhook API Endpoints', () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    vi.mocked(db.insert).mockReset();
    vi.mocked(db.update).mockReset();
    vi.mocked(redisConnection.incr).mockReset();
    vi.mocked(redisConnection.expire).mockReset();
    vi.mocked(TrackerService.getByExternalId).mockReset();
    vi.mocked(exportGeofenceQueue.add).mockClear();
    vi.mocked(messageQueue.add).mockClear();
  });

  const validPayload = {
    externalTrackerId: 'ext-trk-001',
    lat: 37.7749,
    lng: -122.4194,
    recordedAt: '2026-07-14T12:00:00Z',
    raw: { status: 'moving', battery: 85 },
  };

  it('should return 401 if x-api-key header is invalid or missing', async () => {
    const request = new Request('http://localhost/api/webhook/tracker', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'invalid-key',
      },
      body: JSON.stringify(validPayload),
    });

    vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([])); // for webhookLogs

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(db.insert).toHaveBeenCalled(); // logs unauthorized attempts
  });

  it('should return 429 if rate limit is exceeded', async () => {
    // Mock Redis returning > 1000 count (e.g. 1005)
    vi.mocked(redisConnection.incr).mockResolvedValueOnce(1005);

    const request = new Request('http://localhost/api/webhook/tracker', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'tracker-webhook-secret-key-development',
      },
      body: JSON.stringify(validPayload),
    });

    vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([]));

    const response = await POST(request);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Rate limit exceeded' });
  });

  it('should return 400 if payload is invalid (Zod checks fail)', async () => {
    const invalidPayload = {
      externalTrackerId: '', // invalid
      lat: 200, // invalid lat
      lng: -122.4194,
      recordedAt: 'invalid-date',
    };

    const request = new Request('http://localhost/api/webhook/tracker', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'tracker-webhook-secret-key-development',
      },
      body: JSON.stringify(invalidPayload),
    });

    vi.mocked(redisConnection.incr).mockResolvedValueOnce(1);
    vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([]));

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid payload' });
  });

  it('should process valid payload successfully, store event, and trigger background jobs', async () => {
    const mockTracker = { id: VALID_TRACKER_ID, externalTrackerId: 'ext-trk-001' };
    const mockShipment = { id: 'ship-uuid', customerId: VALID_CUSTOMER_ID };
    const mockTemplate = { id: 'tmpl-uuid' };

    vi.mocked(redisConnection.incr).mockResolvedValueOnce(1);
    // 1. Resolve tracker
    vi.mocked(TrackerService.getByExternalId).mockResolvedValue(mockTracker as any);
    // 2. Insert event returning Event ID
    vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([{ id: VALID_EVENT_ID }]));
    // 3. Update tracker lastSeenAt
    vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([]));
    // 4. Check active shipment (finds mockShipment)
    vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockShipment]));
    // 5. Check template configurations (finds mockTemplate)
    vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockTemplate]));
    // 6. Log webhook logs insert
    vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([]));

    const request = new Request('http://localhost/api/webhook/tracker', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'tracker-webhook-secret-key-development',
      },
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.trackerEventId).toBe(VALID_EVENT_ID);

    // Verify background jobs enqueued
    expect(exportGeofenceQueue.add).toHaveBeenCalled();
    expect(messageQueue.add).toHaveBeenCalled();
  });

  it('should return 200 immediately and skip db inserts for duplicate event IDs within 5 seconds', async () => {
    const mockTracker = { id: VALID_TRACKER_ID, externalTrackerId: 'ext-trk-001' };

    vi.mocked(redisConnection.incr).mockResolvedValueOnce(1);
    vi.mocked(TrackerService.getByExternalId).mockResolvedValue(mockTracker as any);
    vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([{ id: VALID_EVENT_ID }]));
    vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([]));
    vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([])); // no shipment
    vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([])); // logs success

    const request1 = new Request('http://localhost/api/webhook/tracker', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'tracker-webhook-secret-key-development',
      },
      body: JSON.stringify({ ...validPayload, eventId: 'duplicate-1' }),
    });

    const response1 = await POST(request1);
    expect(response1.status).toBe(200);
    expect(db.insert).toHaveBeenCalledTimes(2); // 1 tracker event, 1 webhook log

    // Clear db mocks history to check if second POST bypasses inserts
    vi.mocked(db.insert).mockClear();

    // Trigger second POST with same eventId
    const request2 = new Request('http://localhost/api/webhook/tracker', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'tracker-webhook-secret-key-development',
      },
      body: JSON.stringify({ ...validPayload, eventId: 'duplicate-1' }),
    });

    vi.mocked(redisConnection.incr).mockResolvedValueOnce(1);

    const response2 = await POST(request2);
    expect(response2.status).toBe(200);
    expect(await response2.json()).toEqual({ success: true, duplicated: true });
    expect(db.insert).not.toHaveBeenCalled(); // Inserts bypassed for duplicate!
  });
});
