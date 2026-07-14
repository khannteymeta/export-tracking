import { ExportGeofenceService } from '@/server/services/exportGeofenceService';
import { getCurrentUser, validateAdmin } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import { db } from '@/lib/db';
import { auditLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { ApiResponse } from '@/types';

// PATCH /api/export-geofences/[id] - Update geofence details (Admin only)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateAdmin(currentUser)) {
      throw new ForbiddenError('Admin access required to update geofences');
    }

    const { id } = await params;

    let body;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError({ _form: ['Invalid JSON body'] });
    }

    // Retrieve old details for audit logging
    const geofences = await ExportGeofenceService.list({ isActive: true });
    const oldGeofence = geofences.find((g) => g.id === id);
    if (!oldGeofence) {
      throw new NotFoundError(`Geofence with ID ${id}`);
    }

    // Apply update
    const updatedGeofence = await ExportGeofenceService.update(id, body);

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    // Log update action to audit logs
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'update_geofence',
      entity: 'export_geofence',
      entityId: id,
      oldValue: oldGeofence,
      newValue: updatedGeofence,
      ipAddress,
    });

    const response: ApiResponse<typeof updatedGeofence> = {
      success: true,
      data: updatedGeofence,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/export-geofences/[id] - Soft delete/deactivate a geofence (Admin only)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateAdmin(currentUser)) {
      throw new ForbiddenError('Admin access required to deactivate geofences');
    }

    const { id } = await params;

    // Apply soft delete
    await ExportGeofenceService.delete(id);

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    // Log action to audit logs
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'deactivate_geofence',
      entity: 'export_geofence',
      entityId: id,
      ipAddress,
    });

    const response: ApiResponse<{ success: true }> = {
      success: true,
      data: { success: true },
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
