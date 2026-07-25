import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from '@/lib/auth/session';
import { verifyCredentials } from '@/lib/auth/users';

/*
 * bcryptjs will not run on the edge, so this route is pinned to Node. Only
 * signature verification is edge-safe, which is what middleware does.
 */
export const runtime = 'nodejs';

const Body = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

/*
 * One message for every failure. Not politeness -- a distinct "no such user"
 * would enumerate which of the two accounts exist. The unknown-user and
 * wrong-password paths are also the same code and the same duration; see the
 * decoy hash in lib/auth/users.ts.
 */
const GENERIC_FAILURE = 'Nama pengguna atau kata sandi salah.';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 400 });
  }

  let username: string | null;
  try {
    username = await verifyCredentials(parsed.data.username, parsed.data.password);
  } catch (err) {
    // parseUsers throws when AUTH_USERS is missing or malformed. That is a
    // deployment fault, not a bad password: say so in the log and fail closed
    // with a 500 rather than telling the user their password is wrong.
    console.error('AUTH_USERS is unusable', err);
    return NextResponse.json({ error: 'Konfigurasi server bermasalah.' }, { status: 500 });
  }

  if (!username) {
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401 });
  }

  const token = await signSession(username);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  return NextResponse.json({ ok: true });
}
