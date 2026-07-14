import { TrackerService } from '@/server/services/trackerService';
import { getCurrentUser, validateManager } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import { db } from '@/lib/db';
import { auditLogs, shipmentExports, trackers } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import type { ApiResponse } from '@/types';

/**
 * Checks if a customer is explicitly or implicitly assigned to a Viewer user.
 */
async function isCustomerAssigned(customerId: string, userId: string, role: string, permissions: any): Promise<boolean> {
  if (role === 'admin' || role === 'manager') return true;

  // 1. Check explicit permissions
  if (permissions) {
    try {
      const perms = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
      if (Array.isArray(perms) && perms.includes(customerId)) {
        return true;
      }
    } catch {
      if (typeof permissions === 'string') {
        const perms = permissions.split(',').map((p: string) => p.trim());
        if (perms.includes(customerId)) return true;
      }
    }
  }

  // 2. Check implicit assignment (user created a shipment for this customer)
  const shipments = await db
    .select({ id: shipmentExports.id })
    .from(shipmentExports)
    .where(and(eq(shipmentExports.customerId, customerId), eq(shipmentExports.createdBy, userId)))
    .limit(1);

  return shipments.length > 0;
}

// GET /api/trackers/[id] - Retrieve tracker details with last event and active shipment
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    const { id } = await params;
    const tracker = await TrackerService.getById(id);

    // Enforce role authorization: Viewers can only view trackers assigned to their customers
    const assigned = await isCustomerAssigned(
      tracker.customerId,
      currentUser.id,
      currentUser.role,
      currentUser.permissions
    );
    if (!assigned) {
      throw new ForbiddenError('You are not authorized to view details for this tracker');
    }

    const response: ApiResponse<typeof tracker> = {
      success: true,
      data: tracker,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/trackers/[id] - Update tracker details (Manager+ only)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateManager(currentUser)) {
      throw new ForbiddenError('Manager access required');
    }

    const { id } = await params;

    let body;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError({ _form: ['Invalid JSON body'] });
    }

    // Retrieve old details for audit logging
    const oldTracker = await TrackerService.getById(id);

    // Apply update
    const updatedTracker = await TrackerService.update(id, body);

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    // Log update action to audit logs
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'update_tracker',
      entity: 'tracker',
      entityId: id,
      oldValue: oldTracker,
      newValue: updatedTracker,
      ipAddress,
    });

    const response: ApiResponse<typeof updatedTracker> = {
      success: true,
      data: updatedTracker,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/trackers/[id] - Hard delete a tracker (Manager+ only)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateManager(currentUser)) {
      throw new ForbiddenError('Manager access required');
    }

    const { id } = await params;

    // Check existence first
    const tracker = await TrackerService.getById(id);

    // Hard delete
    await db.delete(trackers).where(eq(trackers.id, id));

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    // Log action to audit logs
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'delete_tracker',
      entity: 'tracker',
      entityId: id,
      oldValue: tracker,
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
