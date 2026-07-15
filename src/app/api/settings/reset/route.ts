import { SettingsService } from '@/server/services/settingsService';
import { getCurrentUser, validateAdmin } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError } from '@/lib/errors';
import type { ApiResponse } from '@/types';

// POST /api/settings/reset - Reset all settings to defaults (Admin only)
export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateAdmin(currentUser)) {
      throw new ForbiddenError('Admin access required to reset settings');
    }

    // Call reset method in SettingsService
    await SettingsService.resetToDefaults(currentUser.id);

    const response: ApiResponse<{ success: true }> = {
      success: true,
      data: { success: true },
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
