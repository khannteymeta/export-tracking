import { CustomerService } from '@/server/services/customerService';
import { getCurrentUser, validateManager } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import { db } from '@/lib/db';
import { auditLogs } from '@/db/schema';
import type { ApiResponse } from '@/types';

// POST /api/customers/[id]/assign-chat - Link a telegram chat to the customer (Manager+ only)
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
      throw new ForbiddenError('Manager access required');
    }

    const { id: customerId } = await params;

    let body;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError({ _form: ['Invalid JSON body'] });
    }

    const telegramChatId = body.telegramChatId || body.chatId;
    if (!telegramChatId || typeof telegramChatId !== 'string') {
      throw new ValidationError({ telegramChatId: ['telegramChatId must be a valid string'] });
    }

    // Call service to assign chat
    await CustomerService.assignTelegramChat(customerId, telegramChatId);

    // Retrieve client IP for audit logging
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    // Log action to audit logs
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'assign_telegram_chat',
      entity: 'customer',
      entityId: customerId,
      newValue: { telegramChatId },
      ipAddress,
    });

    const response: ApiResponse<{ success: true }> = {
      success: true,
      data: { success: true },
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
