/**
 * `DELETE /api/account/memory/<id>` — forget one note.
 *
 *   -> 200 { ok: true, id }
 *   -> 400 the id is not one this app issues
 *   -> 401 / 403 / 429 as on the parent route
 *   -> 404 nothing matched — already forgotten, or never written
 *   -> 500 the write failed
 *
 * **THE ID IS A PATH SEGMENT, NOT A QUERY PARAMETER**, which is
 * `/api/onboarding/answer/[key]`'s call: it is part of the resource's identity, and
 * it means a bulk operation is a route somebody has to write deliberately rather
 * than a filter somebody widens.
 *
 * **AND IT IS NARROWED BEFORE IT REACHES A QUERY.** An id the app never issued
 * would otherwise match nothing and return a cheerful 404 — which reads as "already
 * deleted" and hides a client bug. `isMemoryItemId` is the same shape of guard as
 * `isOnboardingQuestionKey`, and it is shared with the component that rendered the
 * button, so a row this app displays can never carry an id this route refuses.
 *
 * **NO REGENERATION IS SCHEDULED, UNLIKE THE ANSWER DELETE.** That route calls
 * `generateLotus` in an `after()` because the deleted material is also PARAPHRASED
 * into `lotus_avatars.summary`, which every reading prompt reads — nulling one
 * column there would be half an erasure. This artifact has no paraphrase anywhere:
 * phase 5 reads `user_memory` directly at prompt-assembly time, so removing the item
 * IS the erasure and the next prompt is built without it. **If a future phase ever
 * caches or distils this payload into a second table, this route grows an `after()`
 * in the same commit or the delete button becomes a lie.**
 */
import { NextResponse } from 'next/server';

import { isMemoryItemId, memoryItems } from '@/lib/account/memoryView';
import { requireUser } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { dismissUserMemoryItems, getUserMemory } from '@/lib/db/queries/memory';
import { hit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 20;

/** The SAME namespace as the parent route, so one budget covers the whole screen. */
const MEMORY_MAX = 60;
const HOUR_MS = 3_600_000;

export async function DELETE(_request: Request, ctx: { params: Promise<{ item: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // AWAITED. `hit()` is async since V9; an un-awaited Promise never refuses.
  const limit = await hit(`account:memory:${auth.user.id}`, Date.now(), MEMORY_MAX, HOUR_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'too many requests' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  const { item } = await ctx.params;
  if (!isMemoryItemId(item)) {
    // Deliberately opaque. The client is our own component, which does not read the
    // message, and a validation detail is a free description of the id scheme.
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  let existed: boolean;
  try {
    /*
     * **ONE STATEMENT, AND THAT IS PHASE 3's DELIBERATE SHAPE**: filter `items` and
     * append to `dismissed_ids` together, correlated against the row being updated,
     * so this cannot lose a race with the extractor's `after()` in another tab. It
     * does not touch `input_hash`, which is what stops the deletion triggering an
     * immediate regeneration (phase 4, Decision B).
     *
     * "Did anything change" is a LENGTH COMPARISON rather than a boolean from the
     * query, because `dismissUserMemoryItems` returns the row as it now stands: a
     * second read would race the same `after()` this statement was shaped to beat.
     */
    const before = await getUserMemory(db, auth.user.id);
    const after = await dismissUserMemoryItems(db, auth.user.id, [item]);
    existed = memoryItems(before).length !== memoryItems(after).length;
  } catch (err) {
    /*
     * THE ERROR OBJECT IS NOT LOGGED IN PRODUCTION. The bound parameters of this
     * statement include the payload being rewritten, which is prose about this
     * person's life.
     */
    if (process.env.NODE_ENV === 'development') {
      console.error('[memory] forget failed', err);
    } else {
      console.error('[memory] forget failed', {
        name: err instanceof Error ? err.name : typeof err,
      });
    }
    return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  }

  if (!existed) {
    // 404 rather than a cheerful 200: claiming an erasure that did not happen is
    // the wrong answer to give about somebody's data.
    return NextResponse.json({ error: 'nothing to forget' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: item });
}
