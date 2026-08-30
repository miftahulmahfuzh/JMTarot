/**
 * `GET /api/account/memory` — what the room has noted about the querent.
 * `DELETE /api/account/memory` — forget all of it.
 *
 *   GET     -> 200 { items: [{ id, text }] }   `private, no-store`
 *           -> 401 no session
 *           -> 403 onboarding not finished
 *           -> 429 rate limited
 *           -> 500 the read failed
 *   DELETE  -> 200 { ok: true }
 *           -> 404 there was nothing stored
 *           -> 401 / 403 / 429 / 500 as above
 *
 * ── WHY THE WHOLE LIST COMES BACK IN ONE REQUEST ─────────────────────────────
 *
 * **THIS IS NOT `/api/onboarding/answer/<key>`'s RULE BEING RELAXED. IT IS THE SAME
 * RULE APPLIED TO A PAYLOAD WITH NO LABELS.** That route is one key per request and
 * says there must never be a bulk variant, because `/account` can render six rows
 * labelled by QUESTION while decrypting nothing — so the plaintext of `worst_thing`
 * genuinely can wait for a tap on the row that names it.
 *
 * A memory item has no question above it. Its text is its identity. Twelve rows
 * reading "Catatan 1 … Catatan 12", each needing its own tap and its own request,
 * would cost the querent twelve taps and protect nothing at all.
 *
 * What the rule is FOR survives untouched, and it is the property to protect if
 * this route is ever changed: **the sensitive text is never in the response to
 * merely opening a page.** `/account` reads nothing here on the server, the notes
 * are absent from its HTML, and this handler runs only because somebody pressed
 * `Lihat catatannya`. That press is the asking, which is reconciliation §7.3's
 * standard and V8's *"a tap on a question is asking"* one section up.
 *
 * ── NO ANALYTICS, DELIBERATELY ───────────────────────────────────────────────
 *
 * `withAnalytics`, `track()`, `x-jm-session` and `x-jm-local-date` are all absent,
 * and that is a decision recorded in this phase's plan rather than an omission:
 * this phase declares ZERO new event names. `events.test.ts`'s ceiling is at its
 * bound and the register's own guidance is to FOLD rather than add — and every
 * available fold here is one that register has already refused twice
 * (`history.item_opened` gaining an `action`, `moderation.refused` aside). A
 * look-and-close changes no decision (`account.answer_revealed`'s precedent), and a
 * deletion is visible in the row itself. If an operator later needs the number, it
 * belongs beside phase 4's extractor event, with the ceiling moved ONCE and the
 * accounting written down.
 */
import { NextResponse } from 'next/server';

import { memoryItems } from '@/lib/account/memoryView';
import { requireUser } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { dismissUserMemoryItems, getUserMemory } from '@/lib/db/queries/memory';
import { hit } from '@/lib/ratelimit';

/** Reads and writes the database. Never the edge. */
export const runtime = 'nodejs';

/**
 * One indexed read, or one small write. Milliseconds warm — and nothing like that
 * on a cold lambda in front of a suspended Neon compute, which is what killed
 * `POST /api/locale` at Vercel's Hobby default of ten seconds. The DELETE is a user
 * action that WRITES, which is one of the few requests likely to be the one that
 * wakes the compute.
 */
export const maxDuration = 20;

/**
 * Per user per hour, its own namespace. `hit()` prefixes `read:`, so the effective
 * key is `read:account:memory:<uid>` and a burst here cannot spend the budget that
 * lets somebody take a reading. Sixty is generous for a screen with one button on
 * it; it exists because this is reachable with a session, not because anybody reads
 * their notes sixty times an hour.
 */
const MEMORY_MAX = 60;
const HOUR_MS = 3_600_000;

type Gate = { ok: true; userId: string } | { ok: false; response: NextResponse };

/**
 * The two verbs' shared opening. `requireUser()`'s fail-closed default is KEPT —
 * unlike `/api/onboarding/*` and `DELETE /api/account`, there is nothing to read or
 * erase here before onboarding is finished, because the room does not open until
 * then.
 */
async function gate(): Promise<Gate> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, response: auth.response };

  // AWAITED. `hit()` is async since V9 and an un-awaited Promise is truthy, i.e.
  // never refuses.
  const limit = await hit(`account:memory:${auth.user.id}`, Date.now(), MEMORY_MAX, HOUR_MS);
  if (!limit.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'too many requests' },
        { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
      ),
    };
  }

  return { ok: true, userId: auth.user.id };
}

export async function GET() {
  const g = await gate();
  if (!g.ok) return g.response;

  let row;
  try {
    row = await getUserMemory(db, g.userId);
  } catch (err) {
    logFailure('read', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  }

  /*
   * A MISSING ROW IS AN EMPTY LIST AND A 200, NOT A 404. Nobody has a row until the
   * extractor first runs, so "nothing noted yet" is the ordinary resting state of
   * this feature and the component renders real copy for it. A 404 would put the
   * failure affordance on screen for a querent who has simply not talked yet.
   */
  return NextResponse.json(
    { items: memoryItems(row) },
    {
      /*
       * `private, no-store`. Per-user, and it is a machine's inferences about a
       * person: no shared cache, no disk, no history entry.
       */
      headers: { 'cache-control': 'private, no-store' },
    },
  );
}

export async function DELETE() {
  const g = await gate();
  if (!g.ok) return g.response;

  let cleared: boolean;
  try {
    /*
     * **FORGET EVERYTHING IS A TOMBSTONING DELETE, NOT `redactUserMemory`.** Every
     * current item id goes into `dismissed_ids` in the same statement that empties
     * `items`, because the transcript that produced every one of these facts is still
     * in `chat_messages` and a non-tombstoning clear is a button that lies until the
     * next extraction (`lotus_avatars.input_hash`'s rule). `redactUserMemory` is the
     * ERASURE path's function and deliberately does NOT tombstone — a restored
     * account is meant to rebuild. Two buttons, two verbs, one mechanism, no new
     * query.
     */
    const before = await getUserMemory(db, g.userId);
    const ids = memoryItems(before).map((item) => item.id);
    const after = ids.length === 0 ? before : await dismissUserMemoryItems(db, g.userId, ids);
    cleared = ids.length > 0 && memoryItems(after).length === 0;
  } catch (err) {
    logFailure('clear', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  }

  if (!cleared) {
    /*
     * 404 rather than a cheerful 200, `DELETE /api/onboarding/answer/[key]`'s rule:
     * reporting success for an erasure that erased nothing is the wrong answer to
     * give about somebody's data. The client reports it as a failure, which is the
     * safe direction.
     */
    return NextResponse.json({ error: 'nothing to forget' }, { status: 404 });
  }

  /*
   * NOTHING ELSE HAPPENS HERE, AND THAT IS THE POINT OF READING THE ROW RATHER THAN
   * A COPY OF IT. Phase 5 reads `user_memory` when it assembles the chat context, so
   * the next prompt is built without what was just removed — no cache to invalidate,
   * no regeneration to schedule, no second table to reach into. Neither call touches
   * `input_hash`, which is what stops the deletion triggering an immediate
   * regeneration (phase 4, Decision B).
   */
  return NextResponse.json({ ok: true });
}

/**
 * NEVER LOG THE DRIVER ERROR IN PRODUCTION.
 *
 * A postgres error quotes the failing statement AND its bound parameters, and on
 * the write path one of those is the memory payload — sentences a model wrote about
 * this person's life. `flush.ts`, `moderation/log.ts` and `auth.ts` all carry this
 * rule and `auth.ts` earned it in production on 2026-07-28. Development prints the
 * whole thing, because there is nobody to leak it to.
 */
function logFailure(what: 'read' | 'clear', err: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[memory] ${what} failed`, err);
  } else {
    console.error(`[memory] ${what} failed`, {
      name: err instanceof Error ? err.name : typeof err,
    });
  }
}
