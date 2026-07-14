import { ExportTrackingService } from '@/server/services/exportTrackingService';
import { getCurrentUser, validateManager } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import { validateInput, flagExceptionSchema } from '@/lib/validation';
import type { ApiResponse } from '@/types';

// POST /api/shipment-exports/[id]/flag-exception - Flag shipment exception (Manager+ only)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateManager(currentUser)) {
      throw new ForbiddenError('Manager access required to flag exceptions');
    }

    const { id } = await params;

    let body;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError({ _form: ['Invalid JSON body'] });
    }

    // Validate request schema
    const validationResult = validateInput(flagExceptionSchema, body);
    if (!validationResult.success) {
      throw new ValidationError(validationResult.error);
    }

    const { reason, details } = validationResult.data;
    const reasonMessage = `${reason}${details ? ' - ' + details : ''}`;

    // Call service to apply exception
    await ExportTrackingService.flagException(id, reasonMessage, currentUser.id);

    const response: ApiResponse<{ success: true }> = {
      success: true,
      data: { success: true },
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
