import { auth } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';

export async function POST(req: Request) {
  try {
    const response = await auth.api.signOut({
      headers: req.headers,
      asResponse: true,
    });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
