/**
 * DELETE one reading. The querent's own row, gone from every screen.
 *
 *   DELETE /api/history/<uuid>
 *     -> 204 deleted, already deleted, not yours, or never existed -- ONE answer
 *     -> 400 the path segment is not a uuid
 *     -> 401 no session
 *     -> 403 onboarding not finished
 *     -> 503 the database is unreachable
 *
 * **ONE ANSWER FOR FOUR OUTCOMES, AND NO BODY ON IT.** `readingWithCards`'s rule:
 * a distinguishable "exists but is not yours" turns a uuid guess into an existence
 * oracle, and a reading id is a value that reaches the browser. A JSON body saying
 * `{ deleted: true | false }` would reintroduce exactly that, wearing the label of
 * a convenience for the client. The client does not need it: 204 means "it is
 * gone", which is true in all four cases and is the only thing the row's removal
 * from the list depends on.
 *
 * **THE 400 IS NOT AN ORACLE.** A malformed uuid is a malformed request rather
 * than an answer about anybody's data -- every uuid-SHAPED id gets the same 204 --
 * and refusing it is what tells a broken caller it is broken instead of silently
 * succeeding at nothing.
 *
 * **NO `withAnalytics`, NO `track()`, NO EVENT FROM HERE.** All the history events
 * fire from the CLIENT (H11), which is where `history.item_deleted` belongs too;
 * firing one from the server would put it on a different request from its
 * siblings for no gain, and `events.ts` has one owner per release.
 *
 * **NO RATE LIMIT, THE SAME CALL AS `../route.ts` AND `../days/route.ts`.**
 * `src/lib/ratelimit.ts`'s budget is sized for MODEL CALLS, and this spends none.
 * What it costs is one short transaction against the caller's own rows on indexed
 * predicates, it is idempotent, and every replay after the first writes nothing --
 * so a loop gains an authenticated attacker nothing they could not get from
 * `GET /api/history`, which also carries no budget. If that is ever revisited the
 * shape is `hit('history:delete:<uid>', ...)`, one namespace deeper, so it cannot
 * cost somebody a reading (H12).
 *
 * **`maxDuration` IS DECLARED AND IS BIGGER THAN THE SIBLINGS' 15.** This is the
 * first WRITE in this directory, and CLAUDE.md records that a user action that
 * writes is one of the few things likely to be the request that wakes a suspended
 * Neon compute -- which is what killed `POST /api/locale` at Vercel's ten-second
 * Hobby default. 20 leaves room for a cold lambda plus a compute wake on a
 * four-statement transaction. **AND A BIGGER BUDGET HERE IS ONLY SAFE BECAUSE THE
 * CLIENT BOUNDS ITSELF**: raising it without an `AbortController` on the caller
 * does not fix a hang, it lengthens one. The caller is Phase 2's trash control and
 * it must carry one.
 *
 * **`logHistoryFailure`, NEVER `console.error(err)`.** The rule with no
 * exceptions; this path happens to bind only uuids, and that is not a reason to
 * make an exception in the file where the next statement gets added.
 */
import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { softDeleteReading } from '@/lib/db/queries/history';
import { logHistoryFailure } from '../log';

export const runtime = 'nodejs';
export const maxDuration = 20;

/**
 * `queries/share.ts`'s guard, not `queries/history.ts`'s stricter one. Postgres
 * raises SQLSTATE 22P02 on a malformed uuid literal and an unhandled one 500s a
 * request that should be a 400 -- and puts the failing statement in the platform
 * log. `softDeleteReading` guards again; this one is what makes the 400 possible
 * at all, because from inside the query a bad uuid and a missing row look alike.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 });
  }

  try {
    /*
     * THE RETURN VALUE IS DELIBERATELY DISCARDED. `deleted` is the difference
     * between "we just deleted it" and "it was already gone", and that difference
     * is the oracle. It exists for the integration tests, which have a session and
     * a fixture and no threat model.
     */
    await softDeleteReading(db, auth.user.id, id);
    return new NextResponse(null, {
      status: 204,
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch (err) {
    logHistoryFailure('delete', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
