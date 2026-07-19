import { getCurrentUser } from '@/lib/auth';
import { handleApiError, UnauthorizedError } from '@/lib/errors';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      throw new UnauthorizedError();
    }
    return Response.json({ success: true, data: user });
  } catch (error) {
    return handleApiError(error);
  }
}
