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
    const timeRangeParam = searchParams.get('timeRange');
    let timeRange: 'today' | 'week' | 'month' | undefined = undefined;
    if (timeRangeParam === 'today' || timeRangeParam === 'week' || timeRangeParam === 'month') {
      timeRange = timeRangeParam;
    }

    const summary = await DashboardService.getSummary(timeRange);

    const response: ApiResponse<typeof summary> = {
      success: true,
      data: summary,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
