import { UserService } from '@/server/services/userService';
import { getCurrentUser, validateAdmin, validateManager } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import { validateInput, updateUserSchema } from '@/lib/validation';
import { db } from '@/lib/db';
import { auditLogs } from '@/db/schema';
import type { ApiResponse } from '@/types';

// GET /api/users/[id] - Retrieve user details (Self or Manager+ only)
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

    // Enforce access: Self or Manager+
    if (currentUser.id !== id && !validateManager(currentUser)) {
      throw new ForbiddenError('You are not authorized to view this user');
    }

    const user = await UserService.getById(id);

    const response: ApiResponse<typeof user> = {
      success: true,
      data: user,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/users/[id] - Update user details (Self or Admin only)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    const { id } = await params;

    let body;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError({ _form: ['Invalid JSON body'] });
    }

    // Validate inputs
    const validationResult = validateInput(updateUserSchema, body);
    if (!validationResult.success) {
      throw new ValidationError(validationResult.error);
    }

    // Query old value first for audit logging comparison
    const oldUser = await UserService.getById(id);

    // Call service to authorize role edits, verify existence, and apply updates
    const updatedUser = await UserService.update(id, validationResult.data, currentUser);

    // Log the change
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'update_user',
      entity: 'user',
      entityId: id,
      oldValue: oldUser,
      newValue: updatedUser,
      ipAddress,
    });

    const response: ApiResponse<typeof updatedUser> = {
      success: true,
      data: updatedUser,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/users/[id] - Soft deactivate a user (Admin only)
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
      throw new ForbiddenError('Admin access required');
    }

    const { id } = await params;

    // Call service to deactivate user and delete all their active sessions
    await UserService.deactivate(id);

    // Log action to audit logs
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'deactivate_user',
      entity: 'user',
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
