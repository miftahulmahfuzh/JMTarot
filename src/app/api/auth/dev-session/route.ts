/**
 * Mint a real session cookie without Google. LOCAL DEVELOPMENT ONLY.
 *
 * THIS ROUTE IS NOT OPTIONAL, and the reason is in CLAUDE.md. Two of the worst bugs
 * in this project were invisible to unit tests and to screenshots -- the page looked
 * correct and the outgoing request was wrong -- and the only technique that caught
 * them was a scratch HTML file under `public/cards/` (a path the middleware matcher
 * excludes) that plants a session cookie, loads the app in a same-origin iframe,
 * dispatches real PointerEvents, and diffs the request body against the rendered
 * `alt` text. That harness needs a cookie it can plant. The password login used to
 * supply one; it is gone, so this replaces it.
 *
 * It produces a GENUINE Auth.js JWE against a GENUINE `users` row, by way of the
 * same upsert the Google callback uses. A fake cookie would defeat the purpose: the
 * harness exists to exercise the real gate, and a session the real code would reject
 * proves nothing.
 *
 * IT MUST 404 WHEN THE FLAG IS OFF. Unlike the Credentials provider -- which simply
 * is not registered, so Auth.js refuses a path that does not exist -- this is a
 * route file we wrote, and a route we wrote that authenticates anybody must not be
 * merely inert in production. It must be absent.
 */
import { NextResponse } from 'next/server';
import { encode } from '@auth/core/jwt';
import { z } from 'zod';
import { DEV_PASSWORD_LOGIN_ENABLED } from '@/lib/auth/auth';
import { SESSION_COOKIE_NAME } from '@/lib/auth/config';
import { absoluteCapSeconds, sessionMaxAgeSeconds } from '@/lib/auth/ttl';
import { nowSeconds } from '@/lib/auth/token';
import { db } from '@/lib/db/client';
import { upsertUserOnSignIn } from '@/lib/db/queries/profile';
import { requireEnv } from '@/lib/env';

export const runtime = 'nodejs';

const Body = z.object({
  /** Becomes `google_sub = 'dev:<username>'`, exactly as the dev provider does. */
  username: z
    .string()
    .min(1)
    .max(32)
    // Kept to a boring alphabet because it lands in a `google_sub` and in an
    // email-shaped string, and neither wants a surprise.
    .regex(/^[a-z0-9_-]+$/, 'lowercase letters, digits, _ and - only'),
});

export async function POST(request: Request) {
  /*
   * The same predicate as the Credentials provider: the flag AND
   * NODE_ENV !== 'production'. Vercel builds every deployment as production, so
   * this is unreachable there even with the flag set in the dashboard.
   */
  if (!DEV_PASSWORD_LOGIN_ENABLED) {
    return new NextResponse('Not Found', { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'bad body' }, { status: 400 });
  }

  const username = parsed.data.username;

  // The real upsert, so `uid` is a real users.id and `onb` reflects the real
  // profiles row. This is what makes the harness's session indistinguishable from
  // one Google produced.
  const row = await upsertUserOnSignIn(db, {
    googleSub: `dev:${username}`,
    email: `${username}@localhost`,
    emailVerified: true,
    displayName: username,
    avatarUrl: null,
  });

  const maxAge = sessionMaxAgeSeconds(process.env.SESSION_TTL_HOURS);
  const cap = absoluteCapSeconds(process.env.SESSION_ABSOLUTE_TTL_DAYS);

  /*
   * `salt` is the COOKIE NAME. @auth/core uses it as the HKDF salt when deriving
   * the encryption key from AUTH_SECRET, so the name and the ciphertext are bound
   * together: encode with the wrong salt and the cookie decrypts to nothing, which
   * reads exactly like a wrong secret and sends you looking in the wrong place.
   * That is why the name comes from config.ts rather than being written out here.
   */
  const token = await encode({
    salt: SESSION_COOKIE_NAME,
    secret: requireEnv('AUTH_SECRET'),
    maxAge,
    token: {
      sub: `dev:${username}`,
      uid: row.id,
      email: `${username}@localhost`,
      name: username,
      onb: row.onboardingComplete,
      loc: row.locale,
      ...(cap > 0 ? { abs: nowSeconds() + cap } : {}),
    },
  });

  const response = NextResponse.json({
    ok: true,
    userId: row.id,
    outcome: row.outcome,
    onboardingComplete: row.onboardingComplete,
  });

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    // Never `secure` here: this route only exists on http://localhost, and a
    // secure cookie would be set and then never sent back, which looks like the
    // mint failed.
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  return response;
}
