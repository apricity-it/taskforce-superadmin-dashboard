import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';

const PUBLIC_PATHS = new Set(['/login']);

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  const isPublicPath = PUBLIC_PATHS.has(pathname);

  if (!session && !isPublicPath) {
    const loginUrl = new URL('/login', request.url);
    const nextPath = `${pathname}${search}`;
    if (nextPath !== '/login') {
      loginUrl.searchParams.set('next', nextPath);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (session && isPublicPath) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/auth|api/generate-summary|api/image-proxy|_next/static|_next/image|favicon.ico).*)'],
};
