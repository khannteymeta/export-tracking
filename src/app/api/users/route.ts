import { UserService } from '@/server/services/userService';
import { getCurrentUser, validateAdmin, validateManager } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import { db } from '@/lib/db';
import { auditLogs } from '@/db/schema';
import type { ApiResponse } from '@/types';

// GET /api/users - List users with optional filters & pagination (Manager+ only)
export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateManager(currentUser)) {
      throw new ForbiddenError('Manager access required');
    }

    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role') || undefined;
    
    const isActiveParam = searchParams.get('isActive');
    let isActive: boolean | undefined = undefined;
    if (isActiveParam === 'true') isActive = true;
    if (isActiveParam === 'false') isActive = false;

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);

    const result = await UserService.list({ role, isActive }, { page, limit });

    const response: ApiResponse<{
      users: typeof result.users;
      total: number;
      page: number;
      limit: number;
    }> = {
      success: true,
      data: {
        users: result.users,
        total: result.total,
        page,
        limit,
      },
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/users - Create new user (Admin only)
export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateAdmin(currentUser)) {
      throw new ForbiddenError('Admin access required');
    }

    let body;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError({ _form: ['Invalid JSON body'] });
    }

    // Call service to validate input, check email duplicates, and create database records
    const newUser = await UserService.create(body);

    // Retrieve client IP for audit logging
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    // Log action to audit logs
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'create_user',
      entity: 'user',
      entityId: newUser.id,
      newValue: newUser,
      ipAddress,
    });

    const response: ApiResponse<typeof newUser> = {
      success: true,
      data: newUser,
    };

    return Response.json(response, { status: 201 }); // 201 Created
  } catch (error) {
    return handleApiError(error);
  }
}
