import { ExportGeofenceService } from '@/server/services/exportGeofenceService';
import { getCurrentUser, validateAdmin } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import { db } from '@/lib/db';
import { auditLogs } from '@/db/schema';
import type { ApiResponse } from '@/types';

// GET /api/export-geofences - List geofences with optional filters
export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    const { searchParams } = new URL(req.url);
    const countryCode = searchParams.get('countryCode') || undefined;
    const type = searchParams.get('type') || undefined;

    const isActiveParam = searchParams.get('isActive');
    let isActive: boolean | undefined = undefined;
    if (isActiveParam === 'true') isActive = true;
    if (isActiveParam === 'false') isActive = false;

    const geofences = await ExportGeofenceService.list({ countryCode, type, isActive });

    const response: ApiResponse<typeof geofences> = {
      success: true,
      data: geofences,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/export-geofences - Create a new geofence (Admin only)
export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateAdmin(currentUser)) {
      throw new ForbiddenError('Admin access required to create geofences');
    }

    let body;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError({ _form: ['Invalid JSON body'] });
    }

    const newGeofence = await ExportGeofenceService.create(body);

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    // Log action to audit logs
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'create_geofence',
      entity: 'export_geofence',
      entityId: newGeofence.id,
      newValue: newGeofence,
      ipAddress,
    });

    const response: ApiResponse<typeof newGeofence> = {
      success: true,
      data: newGeofence,
    };

    return Response.json(response, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
