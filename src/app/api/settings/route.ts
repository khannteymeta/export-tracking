import { SettingsService } from '@/server/services/settingsService';
import { getCurrentUser, validateAdmin } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError } from '@/lib/errors';
import type { ApiResponse } from '@/types';

// GET /api/settings - Retrieve all settings (Admin only, secrets masked)
export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateAdmin(currentUser)) {
      throw new ForbiddenError('Admin access required to read settings');
    }

    const settings = await SettingsService.getAllSettings();

    // Mask secrets before returning
    if (settings.DEFAULT_BOT_TOKEN) {
      settings.DEFAULT_BOT_TOKEN = '*****';
    }

    const response: ApiResponse<typeof settings> = {
      success: true,
      data: settings,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
