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
import { z } from 'zod';
import { DEV_PASSWORD_LOGIN_ENABLED } from '@/lib/auth/auth';
import { SESSION_COOKIE_NAME } from '@/lib/auth/config';
import { encodeSessionToken } from '@/lib/auth/mint';
import { db } from '@/lib/db/client';
import { upsertUserOnSignIn } from '@/lib/db/queries/profile';
import { LOCALE_COOKIE, LOCALE_HEADER, resolveForSignIn } from '@/lib/i18n/resolve';

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

  /*
   * VD11, AND THIS IS ALSO HOW THE REAL THING GETS VERIFIED (V2 Task 17). The one
   * claim in the sign-in chain that cannot be unit-tested is whether `headers()`
   * resolves inside @auth/core's jwt callback -- and this route runs the SAME upsert
   * through the same resolution, so
   *
   *   curl -X POST localhost:3001/api/auth/dev-session \
   *        -H 'accept-language: en-GB,en;q=0.9' -d '{"username":"v2test"}'
   *
   * followed by a look at the row is the measurement. Expect `locale = 'en'` and
   * `locale_source = 'negotiated'`.
   */
  const negotiated = resolveForSignIn(
    request.headers.get(LOCALE_HEADER),
    /*
     * Read off the raw request rather than `cookies()`, because this route is
     * reached by `fetch` from the iframe harnesses as well as by curl, and it is a
     * dev tool -- the fewer Next request-scope APIs it depends on, the fewer ways it
     * can fail for a reason that has nothing to do with what is being tested.
     */
    cookieFrom(request.headers.get('cookie'), LOCALE_COOKIE),
    request.headers.get('accept-language'),
  );

  // The real upsert, so `uid` is a real users.id and `onb` reflects the real
  // profiles row. This is what makes the harness's session indistinguishable from
  // one Google produced.
  const row = await upsertUserOnSignIn(db, {
    googleSub: `dev:${username}`,
    email: `${username}@localhost`,
    emailVerified: true,
    displayName: username,
    avatarUrl: null,
    negotiatedLocale: negotiated.locale,
    localeSource: negotiated.source,
  });

  /*
   * **THE ENCODE MOVED TO `@/lib/auth/mint.ts` (2026-08-09) AND THE REASON IT GAVE
   * IS UNCHANGED**, which is why the paragraph moved with it rather than being
   * summarised here: `salt` is the COOKIE NAME, @auth/core uses it as the HKDF
   * salt, and encoding with the wrong one produces a cookie that decrypts to
   * nothing and reads exactly like a wrong `AUTH_SECRET`.
   *
   * The second caller is `POST /api/auth/handoff`, which mints a session for the
   * installed home-screen app. Two hand-rolled copies would be two ways to get
   * that salt wrong; the cookie ATTRIBUTES stay here, because this route's are
   * deliberately not production's.
   */
  const { token, maxAge } = await encodeSessionToken({
    sub: `dev:${username}`,
    uid: row.id,
    email: `${username}@localhost`,
    name: username,
    onb: row.onboardingComplete,
    loc: row.locale,
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

/**
 * One cookie out of a raw `Cookie` header.
 *
 * Six lines rather than `cookies()` because this is a dev tool: it is reached by
 * curl and by the iframe harnesses under `public/cards/`, and the fewer Next
 * request-scope APIs it depends on, the fewer ways it fails for a reason unrelated
 * to whatever is being tested.
 */
function cookieFrom(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
