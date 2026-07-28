/**
 * One day of history, as metadata (H10). NO PROSE, EVER, IN THIS RESPONSE.
 *
 * NO `withAnalytics` AND NO RATE LIMIT, both on purpose.
 *
 *   - All three history events fire from the CLIENT (H11), because
 *     `history.filtered` needs to know chip-vs-picker and the server cannot.
 *     Firing two of three from the client and one from here would put one event
 *     on a different request from its siblings for no gain.
 *   - `src/lib/ratelimit.ts`'s budget is sized for MODEL CALLS. Charging a
 *     history scroll against it would mean browsing your own past costs you a
 *     reading (H12), which is a worse outcome than the thing it protects
 *     against: two indexed reads by an authenticated user against their own rows.
 */
import { NextResponse } from 'next/server';

import { LOCAL_DATE_HEADER, parseLocalDate } from '@/lib/analytics/localdate';
import { requireUser } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { readingsForDay } from '@/lib/db/queries/history';
import { isHistoryDate } from '@/lib/history/dates';
import { logHistoryFailure } from './log';

export const runtime = 'nodejs';

/**
 * Two indexed reads and no model call. Well inside Hobby's ten-second default,
 * but DECLARED rather than defaulted — `POST /api/locale` was the only
 * database-writing route in the app declaring neither, and it was killed at ten
 * seconds on a cold lambda over a suspended Neon compute. This one only reads,
 * so it cannot lose a write; the declaration is here so the next person adding a
 * route in this directory copies a file that has one.
 */
export const maxDuration = 15;

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  /*
   * `parseLocalDate` FOR *TODAY* AND `isHistoryDate` FOR THE FILTER, and the
   * split is the point rather than an inconsistency. The header answers "what
   * day is it where the querent is", and its +/-1 bound covers UTC-12..+14 which
   * is the whole range of real answers. The query parameter asks about the PAST,
   * where that bound would reject every interesting request as a 400 that reads
   * like a client bug. Same column, same format, opposite question --
   * `src/lib/history/dates.ts`'s header has the long version.
   *
   * A missing or malformed header falls back rather than refusing: the fallback
   * is the server's UTC date, which only ever makes the upper bound stricter by a
   * day, and refusing would deny the querent their own history over a header.
   */
  const today = parseLocalDate(request.headers.get(LOCAL_DATE_HEADER)).date;
  const date = new URL(request.url).searchParams.get('date');
  if (!isHistoryDate(date, today)) {
    return NextResponse.json({ error: 'bad date' }, { status: 400 });
  }

  try {
    const items = await readingsForDay(db, auth.user.id, date);
    return NextResponse.json(
      { items },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (err) {
    logHistoryFailure('list', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
