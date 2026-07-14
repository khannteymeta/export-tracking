import { NextRequest, NextResponse } from 'next/server';
import { auth } from './lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip protection for public/webhook and auth API routes
  if (
    pathname.startsWith('/api/auth') || 
    pathname.startsWith('/api/webhook')
  ) {
    return NextResponse.next();
  }

  // 2. Query session state using the request headers
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  
  const isAuthenticated = !!session;

  // 3. Route guarding logic
  // Protect routes under /dashboard/*
  if (pathname.startsWith('/dashboard')) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      // Optional: forward the next path destination
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Redirect authenticated users trying to access login page to dashboard
  if (pathname === '/login') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  runtime: 'nodejs', // Required for BetterAuth direct API database calls
  matcher: [
    '/dashboard/:path*',
    '/login',
    '/api/auth/:path*',
    '/api/webhook/:path*',
  ],
};
