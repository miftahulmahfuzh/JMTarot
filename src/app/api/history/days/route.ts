/**
 * The days the querent has readings on, newest first. The filter strip's source.
 *
 * FETCHED ONCE PER VISIT, not per filter change, and it earns that a second time
 * on the empty day: the same array answers "your nearest reading was…" with no
 * request. See `historyDays`.
 *
 * No `withAnalytics`, no rate limit, and no date parameter at all — the same
 * reasoning as `../route.ts`, whose header has it.
 */
import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { historyDays } from '@/lib/db/queries/history';
import { HISTORY_DAY_LIMIT } from '@/lib/history/dates';
import { logHistoryFailure } from '../log';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const days = await historyDays(db, auth.user.id, HISTORY_DAY_LIMIT);
    return NextResponse.json(
      { days },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (err) {
    /*
     * The bound parameters here are a `user_id` and nothing else, so this one is
     * the least dangerous of the three — logged through the same helper anyway,
     * because the value of the rule is that it has no exceptions to remember.
     */
    logHistoryFailure('days', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
