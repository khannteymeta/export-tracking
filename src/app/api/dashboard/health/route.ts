import { DashboardService } from '@/server/services/dashboardService';
import { getCurrentUser, validateAdmin } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError } from '@/lib/errors';
import type { ApiResponse } from '@/types';

export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateAdmin(currentUser)) {
      throw new ForbiddenError('Admin access required to view health status');
    }

    const health = await DashboardService.getSystemHealth();

    const response: ApiResponse<typeof health> = {
      success: true,
      data: health,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
