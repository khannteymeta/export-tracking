import { TrackerService } from '@/server/services/trackerService';
import { getCurrentUser, validateAdmin } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import { db } from '@/lib/db';
import { auditLogs } from '@/db/schema';
import type { ApiResponse } from '@/types';

// POST /api/trackers/sync - Sync trackers from external API (Admin only)
export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateAdmin(currentUser)) {
      throw new ForbiddenError('Admin access required to trigger synchronization');
    }

    let customerId: string | undefined = undefined;

    // Check if JSON body is provided and read customerId
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await req.json();
        if (body && typeof body === 'object') {
          customerId = body.customerId || undefined;
        }
      } catch {
        throw new ValidationError({ _form: ['Invalid JSON body'] });
      }
    }

    // Call service to run async tracker sync
    const summary = await TrackerService.syncFromTrackerApi(customerId);

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    // Log action to audit logs
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'sync_trackers',
      entity: 'tracker',
      newValue: summary,
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
