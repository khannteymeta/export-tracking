import { SettingsService } from '@/server/services/settingsService';
import { getCurrentUser, validateAdmin } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import type { ApiResponse } from '@/types';

// POST /api/settings/bot-token/test - Test bot token (Admin only)
export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateAdmin(currentUser)) {
      throw new ForbiddenError('Admin access required to test bot tokens');
    }

    let body;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError({ _form: ['Invalid JSON body'] });
    }

    if (body === null || typeof body !== 'object' || !('token' in body)) {
      throw new ValidationError({ token: ['Bot token is required'] });
    }

    const { token } = body;
    if (typeof token !== 'string') {
      throw new ValidationError({ token: ['Bot token must be a string'] });
    }

    // Call validation method in SettingsService
    const valid = await SettingsService.validateBotToken(token);

    const response: ApiResponse<{ valid: boolean }> = {
      success: true,
      data: { valid },
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
