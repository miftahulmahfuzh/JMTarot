import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session';

/**
 * The gate. Every route needs a session except the ones listed below.
 *
 * Only signature verification happens here, using jose, because middleware
 * runs on the edge runtime and bcryptjs cannot. Password checking lives in
 * /api/auth/login, which is pinned to Node.
 */

/*
 * Paths that must stay reachable without a session.
 *
 * /api/auth is the important one and is easy to get wrong. The obvious matcher
 * -- exclude `login` and the static prefixes -- still gates /api/auth/login,
 * because that path does not begin with "login". The result is a login
 * endpoint that returns 401 to everyone and an app nobody can get into, with
 * the failure looking like a wrong password. Deciding it here in code rather
 * than in a regex makes it visible.
 */
function isPublic(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/api/auth/');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const username = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (username) return NextResponse.next();

  // An API caller wants a status code, not a login page. Returning the HTML
  // redirect here would make a fetch() look like it succeeded and then fail on
  // JSON parsing, which is a confusing way to learn the cookie expired.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  /*
   * Static assets are excluded here rather than in isPublic, because
   * middleware should not run for them at all.
   *
   * Getting this wrong is expensive to diagnose: gating /cards or
   * /manifest.webmanifest does not look like an auth problem, it looks like
   * missing artwork and a broken Add to Home Screen.
   */
  matcher: [
    '/((?!_next/|cards/|dukuns/|favicon|icon|apple-icon|manifest|sitemap|robots).*)',
  ],
};
