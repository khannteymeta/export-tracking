import { CustomerService } from '@/server/services/customerService';
import { getCurrentUser, validateManager } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import { db } from '@/lib/db';
import { auditLogs } from '@/db/schema';
import type { ApiResponse } from '@/types';

// POST /api/customers/import - Bulk import customers from CSV (Manager+ only)
export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateManager(currentUser)) {
      throw new ForbiddenError('Manager access required');
    }

    let csvData = '';
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      let formData;
      try {
        formData = await req.formData();
      } catch {
        throw new ValidationError({ _form: ['Failed to parse multipart form data'] });
      }
      
      const file = formData.get('file') as File | null;
      if (!file) {
        throw new ValidationError({ file: ['No CSV file provided in the upload'] });
      }
      csvData = await file.text();
    } else {
      csvData = await req.text();
    }

    if (!csvData.trim()) {
      throw new ValidationError({ csv: ['CSV data cannot be empty'] });
    }

    // Call service to process bulk import
    const summary = await CustomerService.bulkImport(csvData);

    // Retrieve client IP for audit logging
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    // Log action to audit logs
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'import_customers',
      entity: 'customer',
      newValue: {
        successCount: summary.success,
        failedCount: summary.failed,
        errorCount: summary.errors.length,
      },
      ipAddress,
    });

    const response: ApiResponse<typeof summary> = {
      success: true,
      data: summary,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
