import { ExportTrackingService } from '@/server/services/exportTrackingService';
import { getCurrentUser, validateAdmin } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import type { ApiResponse } from '@/types';

// POST /api/shipment-exports/[id]/confirm - Manually confirm export (Admin only)
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
      throw new ForbiddenError('Admin access required to manually confirm exports');
    }

    const { id } = await params;

    let notes: string | undefined = undefined;
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await req.json();
        if (body && typeof body === 'object') {
          notes = body.notes || undefined;
        }
      } catch {
        throw new ValidationError({ _form: ['Invalid JSON body'] });
      }
    }

    const updatedShipment = await ExportTrackingService.confirmExport(id, currentUser.id, notes);

    const response: ApiResponse<typeof updatedShipment> = {
      success: true,
      data: updatedShipment,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
