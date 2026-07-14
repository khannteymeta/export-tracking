import { ExportTrackingService } from '@/server/services/exportTrackingService';
import { getCurrentUser, validateManager } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import type { ApiResponse } from '@/types';

// GET /api/shipment-exports - List exports with filters and pagination
export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const customerId = searchParams.get('customerId') || undefined;
    const destinationCountry = searchParams.get('destinationCountry') || undefined;
    const productCategory = searchParams.get('productCategory') || undefined;

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);

    const exports = await ExportTrackingService.listShipmentExports(
      { status, customerId, destinationCountry, productCategory },
      { page, limit },
      currentUser
    );

    const response: ApiResponse<typeof exports> = {
      success: true,
      data: exports,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/shipment-exports - Create a new shipment export (Manager+ only)
export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateManager(currentUser)) {
      throw new ForbiddenError('Manager access required');
    }

    let body;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError({ _form: ['Invalid JSON body'] });
    }

    const newShipment = await ExportTrackingService.createShipmentExport(body, currentUser.id);

    const response: ApiResponse<typeof newShipment> = {
      success: true,
      data: newShipment,
    };

    return Response.json(response, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
