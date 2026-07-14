import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ExportGeofenceService, isPointInPolygon, distanceToSegment, getDistanceInMeters } from '@/server/services/exportGeofenceService';
import { db } from '@/lib/db';
import { exportGeofences } from '@/db/schema';
import { NotFoundError } from '@/lib/errors';

// Valid UUID strings
const VALID_GEOFENCE_ID = 'e56807cd-4567-6543-dc54-654321098765';

// Helper to create a chainable mock for Drizzle ORM
const makeChainableMock = (finalValue?: any) => {
  const mock: any = {};
  const methods = ['select', 'from', 'where', 'limit', 'insert', 'values', 'returning', 'update', 'set'];
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

describe('ExportGeofenceService Unit Tests', () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    vi.mocked(db.insert).mockReset();
    vi.mocked(db.update).mockReset();
  });

  describe('isPointInPolygon', () => {
    // Simple square polygon from longitude -10 to 10 and latitude -10 to 10
    const mockPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-10, 10],  // [lng, lat]
          [10, 10],
          [10, -10],
          [-10, -10],
          [-10, 10], // closed
        ],
      ],
    };

    it('should return true if point is inside the polygon', () => {
      // (lat: 0, lng: 0) is inside square
      expect(isPointInPolygon(0, 0, mockPolygon)).toBe(true);
    });

    it('should return false if point is outside the polygon', () => {
      // (lat: 20, lng: 0) is outside square
      expect(isPointInPolygon(20, 0, mockPolygon)).toBe(false);
    });
  });

  describe('isPointInGeofence with Buffering', () => {
    // A simple port geofence polygon (centered near port of Singapore lat 1.2, lng 103.8)
    const mockGeofence = {
      id: VALID_GEOFENCE_ID,
      name: 'Singapore Port Zone',
      type: 'port_zone' as const,
      countryCode: 'SG',
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [103.80, 1.25],
            [103.85, 1.25],
            [103.85, 1.20],
            [103.80, 1.20],
            [103.80, 1.25],
          ],
        ],
      },
      bufferMeters: 500, // 500 meter buffer
      isActive: true,
    };

    it('should return true if point is inside the geofence', () => {
      // (lat: 1.22, lng: 103.82) is inside the polygon
      expect(ExportGeofenceService.isPointInGeofence(1.22, 103.82, mockGeofence)).toBe(true);
    });

    it('should return true if point is outside polygon but within the buffer distance', () => {
      // Point (lat: 1.252, lng: 103.82) is slightly north of the top edge (lat 1.25)
      // Distance is ~222 meters (which is <= 500 meters buffer)
      expect(ExportGeofenceService.isPointInGeofence(1.252, 103.82, mockGeofence)).toBe(true);
    });

    it('should return false if point is outside polygon and exceeds the buffer distance', () => {
      // Point (lat: 1.30, lng: 103.82) is ~5.5 km north of boundary (well exceeds 500m buffer)
      expect(ExportGeofenceService.isPointInGeofence(1.30, 103.82, mockGeofence)).toBe(false);
    });
  });

  describe('CRUD operations', () => {
    it('should create geofence successfully', async () => {
      const input = {
        name: 'US Border Buffer',
        type: 'checkpoint_buffer' as const,
        countryCode: 'US',
        polygon: {
          type: 'Polygon' as const,
          coordinates: [[[-106.6, 31.8], [-106.3, 31.8], [-106.3, 31.6], [-106.6, 31.6], [-106.6, 31.8]]],
        },
        bufferMeters: 250,
      };

      const mockReturned = { id: VALID_GEOFENCE_ID, ...input, isActive: true };
      vi.mocked(db.insert).mockReturnValueOnce(makeChainableMock([mockReturned]));

      const result = await ExportGeofenceService.create(input);
      expect(result).toEqual(mockReturned);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should soft delete geofence by updating isActive flag to false', async () => {
      // 1. Mock find exists
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([{ id: VALID_GEOFENCE_ID }]));
      // 2. Mock update
      vi.mocked(db.update).mockReturnValueOnce(makeChainableMock([]));

      await ExportGeofenceService.delete(VALID_GEOFENCE_ID);
      expect(db.update).toHaveBeenCalled();
    });

    it('should throw NotFoundError on delete if geofence is missing', async () => {
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([]));

      await expect(ExportGeofenceService.delete('missing')).rejects.toThrow(NotFoundError);
    });
  });
});
