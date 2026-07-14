import { CustomerService } from '@/server/services/customerService';
import { getCurrentUser, validateManager } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError } from '@/lib/errors';
import { db } from '@/lib/db';
import { auditLogs } from '@/db/schema';
import type { ApiResponse } from '@/types';

// DELETE /api/customers/[id]/chats/[chatId] - Unlink a telegram chat from the customer (Manager+ only)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; chatId: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateManager(currentUser)) {
      throw new ForbiddenError('Manager access required');
    }

    const { id: customerId, chatId: telegramChatId } = await params;

    // Call service to remove telegram chat assignment
    await CustomerService.removeTelegramChat(customerId, telegramChatId);

    // Retrieve client IP for audit logging
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');

    // Log action to audit logs
    await db.insert(auditLogs).values({
      userId: currentUser.id,
      action: 'remove_telegram_chat',
      entity: 'customer',
      entityId: customerId,
      oldValue: { telegramChatId },
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
