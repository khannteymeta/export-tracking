import { TrackerService } from '@/server/services/trackerService';
import { getCurrentUser } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import { db } from '@/lib/db';
import { auditLogs, shipmentExports, trackers } from '@/db/schema';
import { eq, and, inArray, desc, or } from 'drizzle-orm';
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

// GET /api/trackers - List trackers with customer filter and role restrictions
export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId') || undefined;

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const offset = (page - 1) * limit;

    let trackersList = [];

    if (customerId) {
      // 1. If customer filter is provided, check if user is authorized to view this customer
      const assigned = await isCustomerAssigned(
        customerId,
        currentUser.id,
        currentUser.role,
        currentUser.permissions
      );
      if (!assigned) {
        throw new ForbiddenError('You are not authorized to view trackers for this customer');
      }

      // Query trackers for customer
      trackersList = await TrackerService.getByCustomer(customerId, { page, limit });
    } else {
      // 2. If no customer filter is provided:
      if (currentUser.role === 'admin' || currentUser.role === 'manager') {
        // Managers/Admins can see all trackers
        trackersList = await db
          .select()
          .from(trackers)
          .orderBy(desc(trackers.createdAt))
          .limit(limit)
          .offset(offset);
      } else {
        // Viewers (user role) can only see trackers for assigned customers
        const assignedIds: string[] = [];
        if (currentUser.permissions) {
          try {
            const perms = typeof currentUser.permissions === 'string'
              ? JSON.parse(currentUser.permissions)
              : currentUser.permissions;
            if (Array.isArray(perms)) {
              assignedIds.push(...perms.filter((id) => typeof id === 'string'));
            }
          } catch {
            if (typeof currentUser.permissions === 'string') {
              assignedIds.push(...currentUser.permissions.split(',').map((p) => p.trim()));
            }
          }
        }

        const shipmentsSubQuery = db
          .select({ customerId: shipmentExports.customerId })
          .from(shipmentExports)
          .where(eq(shipmentExports.createdBy, currentUser.id));

        const conditions = [];
        if (assignedIds.length > 0) {
          conditions.push(
            or(
              inArray(trackers.customerId, assignedIds),
              inArray(trackers.customerId, shipmentsSubQuery)
            )
          );
        } else {
          conditions.push(inArray(trackers.customerId, shipmentsSubQuery));
        }

        trackersList = await db
          .select()
          .from(trackers)
          .where(and(...conditions))
          .orderBy(desc(trackers.createdAt))
          .limit(limit)
          .offset(offset);
      }
    }

    const response: ApiResponse<typeof trackersList> = {
      success: true,
      data: trackersList,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/trackers - Create a new tracker
export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    let body;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError({ _form: ['Invalid JSON body'] });
    }

    const newTracker = await TrackerService.create(body);

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    // Log action to audit logs
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'create_tracker',
      entity: 'tracker',
      entityId: newTracker.id,
      newValue: newTracker,
      ipAddress,
    });

    const response: ApiResponse<typeof newTracker> = {
      success: true,
      data: newTracker,
    };

    return Response.json(response, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
