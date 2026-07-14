import { UserService } from '@/server/services/userService';
import { getCurrentUser, validateAdmin } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError } from '@/lib/errors';
import { db } from '@/lib/db';
import { auditLogs } from '@/db/schema';
import type { ApiResponse } from '@/types';

// POST /api/users/[id]/reset-password - Administratively reset password (Admin only)
export async function POST(
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

    // Reset password in service
    const { newPassword } = await UserService.resetPassword(id);

    // Log the change
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'reset_password',
      entity: 'user',
      entityId: id,
      ipAddress,
    });

    const response: ApiResponse<{ newPassword: string }> = {
      success: true,
      data: { newPassword },
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
