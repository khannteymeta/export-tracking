import { DashboardService } from '@/server/services/dashboardService';
import { getCurrentUser } from '@/lib/auth';
import { UnauthorizedError, handleApiError } from '@/lib/errors';
import type { ApiResponse } from '@/types';

export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId') || undefined;
    const timeRange = searchParams.get('timeRange') || undefined;

    const metrics = await DashboardService.getTrackerMetrics(customerId, timeRange);

    const response: ApiResponse<typeof metrics> = {
      success: true,
      data: metrics,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
