/**
 * `POST /api/chat/read` — move the badge's cursor.
 *
 *   -> 200 { unread }   the count AFTER the move, so F4 needs no second call
 *   -> 400 / 401 / 403 / 429
 *
 * ── IT EXISTS RATHER THAN FOLDING INTO `state`, AND THAT IS `F1-D3` ────────
 *
 * Roadmap §7 left the question to F1. The answer is **no fold**, and the reason is not
 * tidiness:
 *
 * **`GET /api/chat/state` IS CALLED FROM `/`, `/[reader]`, `/account` AND `/history` —
 * FOUR PAGES THAT DO NOT SHOW A SINGLE MESSAGE.** `C-D17` puts the button on all four
 * and `C-D18` makes the badge a client fetch from each. If that GET moved
 * `last_read_at`, **the badge would clear itself from a page where the querent never
 * saw the message**, and the proactive dot — `C-N2b`, half of this release's acceptance
 * criteria — would be extinguished by the very request that renders it.
 *
 * A second reason that would be sufficient alone: **Next's router prefetch issues GETs
 * the querent did not cause.** A GET that writes a fact meaning *"the querent saw
 * this"* is wrong on the same grounds `POST /api/locale` is a POST.
 *
 * ── THE CURSOR NEVER MOVES BACKWARDS ──────────────────────────────────────
 *
 * `markRead` writes `greatest(last_read_at, $2)`. Several tabs may post here, and an
 * out-of-order request from a slow one must not resurrect a dot the querent already
 * cleared.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/lib/auth/server';
import { logChatFailure } from '@/lib/chat/log';
import { db } from '@/lib/db/client';
import { markRead } from '@/lib/db/queries/chat';
import { hit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/**
 * **IT WRITES, AND A USER ACTION THAT WRITES IS ONE OF THE FEW THINGS LIKELY TO BE THE
 * REQUEST THAT WAKES A SUSPENDED NEON COMPUTE.** That is `POST /api/locale`'s first
 * rule, and this route has its exact shape: one small write, no model, reported as a
 * hang the first time somebody opens the app cold on a phone. **NOT `default`**
 * (`[R5]`).
 */
export const maxDuration = 15;

const HOUR_MS = 3_600_000;
/** Shared with `GET /api/chat/messages` — see that file. */
const READ_MAX = 300;

const Body = z.object({
  /** ISO. Absent means now, which is what a querent who scrolled to the bottom means. */
  upTo: z.string().datetime().nullish(),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const gate = await hit(`chat:read:${user.id}`, Date.now(), READ_MAX, HOUR_MS);
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'too many requests' },
      { status: 429, headers: { 'retry-after': String(gate.retryAfterSeconds) } },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad body' }, { status: 400 });

  try {
    const unread = await markRead(db, user.id, parsed.data.upTo ? new Date(parsed.data.upTo) : new Date());
    return NextResponse.json({ unread }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (err) {
    logChatFailure('read', err, { user: user.id });
    return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  }
}
