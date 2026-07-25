import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
