import { CustomerService } from '@/server/services/customerService';
import { getCurrentUser, validateManager } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import { db } from '@/lib/db';
import { auditLogs } from '@/db/schema';
import type { ApiResponse } from '@/types';

// GET /api/customers/[id] - Retrieve customer details
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
    const customer = await CustomerService.getById(id, currentUser);

    const response: ApiResponse<typeof customer> = {
      success: true,
      data: customer,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/customers/[id] - Update customer details (Manager+ only)
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

    // Fetch old record for audit logging
    const oldCustomer = await CustomerService.getById(id, currentUser);

    // Perform update
    const updatedCustomer = await CustomerService.update(id, body, currentUser);

    // Retrieve client IP for audit logging
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    // Log update action to audit logs
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'update_customer',
      entity: 'customer',
      entityId: id,
      oldValue: oldCustomer,
      newValue: updatedCustomer,
      ipAddress,
    });

    const response: ApiResponse<typeof updatedCustomer> = {
      success: true,
      data: updatedCustomer,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/customers/[id] - Soft deactivate a customer (Manager+ only)
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

    // Apply soft delete
    await CustomerService.delete(id, currentUser);

    // Retrieve client IP for audit logging
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    // Log deactivation action to audit logs
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'deactivate_customer',
      entity: 'customer',
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
