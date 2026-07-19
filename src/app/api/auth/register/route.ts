import { UserService } from '@/server/services/userService';
import { handleApiError } from '@/lib/errors';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const user = await UserService.create(body);
    return Response.json({ success: true, data: user }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
