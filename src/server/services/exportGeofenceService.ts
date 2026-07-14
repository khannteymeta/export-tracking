import { db } from '@/lib/db';
import { exportGeofences, type ExportGeofence } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '@/lib/errors';
import {
  validateInput,
  createExportGeofenceSchema,
  updateExportGeofenceSchema,
  type CreateExportGeofenceInput,
  type UpdateExportGeofenceInput,
} from '@/lib/validation';

/**
 * Standard Ray-Casting algorithm for point-in-polygon checks.
 * GeoJSON polygon coordinates are in [longitude, latitude] format.
 */
export function isPointInPolygon(lat: number, lng: number, polygon: any): boolean {
  if (!polygon || !polygon.coordinates || polygon.coordinates.length === 0) {
    return false;
  }
  const coords = polygon.coordinates[0]; // exterior boundary ring
  let inside = false;

  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0]; // longitude
    const yi = coords[i][1]; // latitude
    const xj = coords[j][0]; // longitude
    const yj = coords[j][1]; // latitude

    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Calculates Haversine distance in meters between two lat/lng coordinates.
 */
export function getDistanceInMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates the shortest distance in meters from a point to a line segment AB.
 */
export function distanceToSegment(
  lat: number,
  lng: number,
  latA: number,
  lngA: number,
  latB: number,
  lngB: number
): number {
  const dx = lngB - lngA;
  const dy = latB - latA;

  if (dx === 0 && dy === 0) {
    return getDistanceInMeters(lat, lng, latA, lngA);
  }

  // Calculate project parameter t, clamped between 0 and 1
  let t = ((lng - lngA) * dx + (lat - latA) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));

  const projLng = lngA + t * dx;
  const projLat = latA + t * dy;

  return getDistanceInMeters(lat, lng, projLat, projLng);
}

export const ExportGeofenceService = {
  /**
   * Validates and creates a new geofence.
   */
  async create(data: CreateExportGeofenceInput): Promise<ExportGeofence> {
    const validationResult = validateInput(createExportGeofenceSchema, data);
    if (!validationResult.success) {
      throw new ValidationError(validationResult.error);
    }

    const [newGeofence] = await db
      .insert(exportGeofences)
      .values({
        ...validationResult.data,
        isActive: true,
      })
      .returning();

    return newGeofence;
  },

  /**
   * Updates an existing geofence.
   */
  async update(id: string, data: UpdateExportGeofenceInput): Promise<ExportGeofence> {
    const validationResult = validateInput(updateExportGeofenceSchema, data);
    if (!validationResult.success) {
      throw new ValidationError(validationResult.error);
    }

    const existing = await db
      .select()
      .from(exportGeofences)
      .where(eq(exportGeofences.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!existing) {
      throw new NotFoundError(`Geofence with ID ${id}`);
    }

    const [updated] = await db
      .update(exportGeofences)
      .set({
        ...validationResult.data,
      })
      .where(eq(exportGeofences.id, id))
      .returning();

    return updated;
  },

  /**
   * Lists geofences with optional filters (countryCode, type, isActive).
   * Defaults to listing active geofences only if isActive is not provided.
   */
  async list(filters?: { countryCode?: string; type?: string; isActive?: boolean }): Promise<ExportGeofence[]> {
    const conditions = [];

    const activeFilter = filters?.isActive !== undefined ? filters.isActive : true;
    conditions.push(eq(exportGeofences.isActive, activeFilter));

    if (filters?.countryCode) {
      conditions.push(eq(exportGeofences.countryCode, filters.countryCode.toUpperCase().trim()));
    }
    if (filters?.type) {
      conditions.push(eq(exportGeofences.type, filters.type as any));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return await db.select().from(exportGeofences).where(whereClause);
  },

  /**
   * Soft deletes a geofence by setting isActive = false.
   */
  async delete(id: string): Promise<void> {
    const existing = await db
      .select()
      .from(exportGeofences)
      .where(eq(exportGeofences.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!existing) {
      throw new NotFoundError(`Geofence with ID ${id}`);
    }

    await db
      .update(exportGeofences)
      .set({ isActive: false })
      .where(eq(exportGeofences.id, id));
  },

  /**
   * Checks if a point is inside the geofence (including buffer distance checks for segment edges).
   */
  isPointInGeofence(lat: number, lng: number, geofence: ExportGeofence): boolean {
    const polygon: any = geofence.polygon;
    if (!polygon || polygon.type !== 'Polygon') return false;

    // 1. Ray casting point-in-polygon check
    const isInside = isPointInPolygon(lat, lng, polygon);
    if (isInside) return true;

    // 2. Buffer zone check (distance to segment edge checks)
    const buffer = geofence.bufferMeters;
    if (buffer && buffer > 0) {
      const coords = polygon.coordinates[0];
      for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
        const lngA = coords[i][0];
        const latA = coords[i][1];
        const lngB = coords[j][0];
        const latB = coords[j][1];

        const distance = distanceToSegment(lat, lng, latA, lngA, latB, lngB);
        if (distance <= buffer) {
          return true;
        }
      }
    }

    return false;
  },
};
