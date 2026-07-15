import { SettingsService, DEFAULT_SETTINGS } from '@/server/services/settingsService';
import { getCurrentUser, validateAdmin } from '@/lib/auth';
import { UnauthorizedError, ForbiddenError, handleApiError, ValidationError } from '@/lib/errors';
import type { ApiResponse } from '@/types';

// GET /api/settings/[key] - Retrieve specific setting (Admin only, secrets masked)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateAdmin(currentUser)) {
      throw new ForbiddenError('Admin access required to read settings');
    }

    const { key } = await params;

    // Check if key exists in defaults list
    if (!(key in DEFAULT_SETTINGS)) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Setting key '${key}' is not supported`,
          },
        },
        { status: 404 }
      );
    }

    let value = await SettingsService.getSetting(key);
    if (value === null) {
      value = DEFAULT_SETTINGS[key] || '';
    }

    // Mask secret
    if (key === 'DEFAULT_BOT_TOKEN') {
      value = '*****';
    }

    const response: ApiResponse<{ key: string; value: string }> = {
      success: true,
      data: { key, value },
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT /api/settings/[key] - Update specific setting value (Admin only)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      throw new UnauthorizedError();
    }
    if (!validateAdmin(currentUser)) {
      throw new ForbiddenError('Admin access required to update settings');
    }

    const { key } = await params;

    let body;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError({ _form: ['Invalid JSON body'] });
    }

    if (body === null || typeof body !== 'object' || !('value' in body)) {
      throw new ValidationError({ value: ['Setting value is required'] });
    }

    const { value } = body;
    if (typeof value !== 'string') {
      throw new ValidationError({ value: ['Setting value must be a string'] });
    }

    // Call service to validate and update the key
    await SettingsService.updateSetting(key, value, currentUser.id);

    const response: ApiResponse<{ success: true }> = {
      success: true,
      data: { success: true },
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
