import { auth } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return Response.json({ error: 'Invalid credentials' }, { status: 400 });
    }

    const response = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    return response;
  } catch (error) {
    console.error('LOGIN ERROR:', error);
    return Response.json({ error: 'Invalid credentials' }, { status: 400 });
  }
}
