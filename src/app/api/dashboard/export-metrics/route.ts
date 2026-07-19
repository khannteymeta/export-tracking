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
    const destinationCountry = searchParams.get('destinationCountry') || undefined;
    const productCategory = searchParams.get('productCategory') || undefined;
    const timeRange = searchParams.get('timeRange') || undefined;

    const metrics = await DashboardService.getExportMetrics(destinationCountry, productCategory, timeRange);

    const response: ApiResponse<typeof metrics> = {
      success: true,
      data: metrics,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
