/**
 * `GET /api/chat/messages` — one page of the room, newest first.
 *
 *   -> 200 { messages, hasMore }
 *   -> 400 a cursor with only half of itself
 *   -> 401 / 403 / 429
 *
 * **KEYSET PAGINATION, NOT OFFSET, BECAUSE THE LOG IS APPEND-ONLY.** A run inserting
 * three bubbles while the querent scrolls shifts every offset and duplicates a bubble
 * on screen. `before` and `beforeId` are BOTH-OR-NEITHER for the same reason: a
 * timestamp alone is not a unique cursor when a beat writes two rows a millisecond
 * apart.
 *
 * **IT IS UNTOUCHED BY `CHAT_ENABLED`** (`[F1-19]`). The flag gates generation, never
 * the read: with it off the room still opens and every past message still renders. **A
 * kill switch that blanks a screen is a worse outage than the quota it protects.**
 *
 * **NO `withAnalytics` AND NO EVENT.** V6's history routes set the precedent — the
 * three history events fire from the CLIENT, because `history.filtered` needs to know
 * chip-versus-picker and the server cannot. `chat.opened` is F4's, from the browser,
 * for the same reason: only the client knows whether the querent arrived by the button,
 * by a link, or from an attachment.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/lib/auth/server';
import { logChatFailure } from '@/lib/chat/log';
import type { ChatMessagesReply } from '@/lib/chat/types';
import { db } from '@/lib/db/client';
import { listMessages } from '@/lib/db/queries/chat';
import { hit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/** Two indexed reads. **NOT `default`** — `[R5]`, and `POST /api/locale`'s lesson: the
 *  ten-second Hobby value on a cold lambda plus a suspended Neon compute. */
export const maxDuration = 15;

const HOUR_MS = 3_600_000;
/** Shared with `POST /api/chat/read`: reading the room and marking it read are one
 *  activity, and two budgets would let a scroll loop exhaust the cursor's. */
const READ_MAX = 300;

const Query = z
  .object({
    before: z.string().datetime().nullish(),
    beforeId: z.string().uuid().nullish(),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  })
  /*
   * **BOTH OR NEITHER.** Half a cursor is not a cursor: `before` alone would drop
   * every row sharing the boundary timestamp, which is exactly the pair of bubbles one
   * beat writes (`[R19]`). A 400 rather than a silent coercion, because a client that
   * sends half a cursor has a bug worth learning about.
   */
  .refine((q) => Boolean(q.before) === Boolean(q.beforeId), {
    message: 'before and beforeId are both-or-neither',
  });

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const parsed = Query.safeParse({
    before: url.searchParams.get('before'),
    beforeId: url.searchParams.get('beforeId'),
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'bad query' }, { status: 400 });

  try {
    const page: ChatMessagesReply = await listMessages(db, user.id, {
      before: parsed.data.before ? new Date(parsed.data.before) : null,
      beforeId: parsed.data.beforeId ?? null,
      limit: parsed.data.limit,
    });
    return NextResponse.json(page, { headers: { 'cache-control': 'private, no-store' } });
  } catch (err) {
    /*
     * **`[F1-23]`: THE ERROR IS NEVER LOGGED WHOLE.** A postgres error quotes the
     * failing statement and its bound parameters, and this statement binds a cursor
     * beside a `user_id` — but the same handler shape is copied to the route that binds
     * a body, so the rule is applied here rather than reasoned about per route.
     */
    logChatFailure('messages', err, { user: user.id });
    return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  }
}
