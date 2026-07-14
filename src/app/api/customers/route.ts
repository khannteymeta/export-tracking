import { CustomerService } from '@/server/services/customerService';
import { getCurrentUser } from '@/lib/auth';
import { UnauthorizedError, handleApiError, ValidationError } from '@/lib/errors';
import { db } from '@/lib/db';
import { auditLogs } from '@/db/schema';
import type { ApiResponse } from '@/types';

// GET /api/customers - List customers with search, filter, and pagination
export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;

    const isActiveParam = searchParams.get('isActive');
    let isActive: boolean | undefined = undefined;
    if (isActiveParam === 'true') isActive = true;
    if (isActiveParam === 'false') isActive = false;

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);

    const result = await CustomerService.list(
      { search, isActive },
      { page, limit },
      currentUser
    );

    const response: ApiResponse<{
      customers: typeof result.customers;
      total: number;
      page: number;
      limit: number;
    }> = {
      success: true,
      data: {
        customers: result.customers,
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

// POST /api/customers - Create a new customer
export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }

    let body;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError({ _form: ['Invalid JSON body'] });
    }

    const newCustomer = await CustomerService.create(body);

    // Retrieve client IP for audit logging
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    // Log action to audit logs
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'create_customer',
      entity: 'customer',
      entityId: newCustomer.id,
      newValue: newCustomer,
      ipAddress,
    });

    const response: ApiResponse<typeof newCustomer> = {
      success: true,
      data: newCustomer,
    };

    return Response.json(response, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
