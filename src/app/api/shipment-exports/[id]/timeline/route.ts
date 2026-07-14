import { ExportTrackingService } from '@/server/services/exportTrackingService';
import { getCurrentUser } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError } from '@/lib/errors';
import { db } from '@/lib/db';
import { shipmentExports } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import type { ApiResponse } from '@/types';

/**
 * Checks if a customer is explicitly or implicitly assigned to a Viewer user.
 */
async function isCustomerAssigned(customerId: string, userId: string, role: string, permissions: any): Promise<boolean> {
  if (role === 'admin' || role === 'manager') return true;

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

  const shipments = await db
    .select({ id: shipmentExports.id })
    .from(shipmentExports)
    .where(and(eq(shipmentExports.customerId, customerId), eq(shipmentExports.createdBy, userId)))
    .limit(1);

  return shipments.length > 0;
}

// GET /api/shipment-exports/[id]/timeline - Retrieve timeline/event history for a shipment
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

    // Fetch shipment first to verify authorization
    const shipment = await ExportTrackingService.getShipmentExport(id);

    const assigned = await isCustomerAssigned(
      shipment.customerId,
      currentUser.id,
      currentUser.role,
      currentUser.permissions
    );
    const isCreator = shipment.createdBy === currentUser.id;

    if (!assigned && !isCreator) {
      throw new ForbiddenError('You are not authorized to view the timeline for this shipment');
    }

    // Fetch chronological timeline events
    const timeline = await ExportTrackingService.getTimeline(id);

    const response: ApiResponse<typeof timeline> = {
      success: true,
      data: timeline,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
