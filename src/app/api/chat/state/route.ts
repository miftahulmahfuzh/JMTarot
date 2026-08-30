/**
 * `GET /api/chat/state` — the badge, the warm, and the proactive tick.
 *
 *   -> 200 { unread, lastReadAt, lastMessageAt, pendingRun, chatEnabled }
 *   -> 401 no session
 *   -> 403 onboarding not finished
 *   -> 429 rate limited
 *
 * **THE CHEAPEST ROUTE IN THE RELEASE AND THE MOST OFTEN CALLED.** `C-D17` puts the
 * chat button on `/`, `/[reader]`, `/account` and `/history`, and `C-D18` makes its
 * badge a CLIENT FETCH from every one of them: *render nothing until you have
 * something, and nothing forever if you never do* (`M14`). The alternative — reading
 * `chat_threads` in four server pages — would put a database read on the render path of
 * the busiest screen in the app, which §0.3 forbids, and would make the button flash a
 * stale dot on a cached render.
 *
 * ── `unread` AND `pendingRun` ARE TWO FIELDS, AND `[R6]` IS WHY ────────────
 *
 * **THE COUNT DRIVES THE DOT; THE FLAG DRIVES THE WARM.** `C-D7` originally said a
 * pending run lights the dot — but `C-R6` makes a zero-beat plan valid and desirable,
 * so **a dot lit by a pending run can lead the querent to a room with nothing new in
 * it**, which is the exact opposite of what the dot is for. Unread is counted over
 * stored bubbles only.
 *
 * ── IT NEVER MOVES `last_read_at`, AND THAT IS `F1-D3` ─────────────────────
 *
 * This GET is called from four pages that do not show a single message. **If it moved
 * the cursor, the badge would clear itself from a page where the querent never saw the
 * message** — and `C-N2b`'s red dot, half of this release's acceptance criteria, would
 * be extinguished by the very request that renders it. A second reason that would be
 * sufficient alone: Next's router prefetch issues GETs the querent did not cause.
 * `POST /api/chat/read` is the writer.
 *
 * **THE ASYMMETRY TO KEEP:** this route's `after()` MAY write bookkeeping the querent
 * did not cause — that is `C-D18`'s proactive tick and F5 owns it. It may not write a
 * fact that claims the querent looked.
 */
import { NextResponse, after } from 'next/server';

import { LOCAL_DATE_HEADER, parseLocalDate } from '@/lib/analytics/localdate';
import { UTC_OFFSET_HEADER, parseUtcOffset } from '@/lib/analytics/utcoffset';
import { requireUser } from '@/lib/auth/server';
import { beatsRemaining } from '@/lib/chat/types';
import type { ChatStateReply } from '@/lib/chat/types';
import { logChatFailure } from '@/lib/chat/log';
import { proactiveTick } from '@/lib/chat/run';
import { db } from '@/lib/db/client';
import {
  activeRunFor,
  getThread,
  lastMessageAt,
  unreadCount,
  upsertThread,
} from '@/lib/db/queries/chat';
import { getLocale } from '@/lib/i18n/t';
import { chatEnabled, chatProactiveEnabled } from '@/lib/llm/flags';
import { hit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/**
 * **NOT `default`.** §4.1's table said so for three routes and its own next paragraph
 * contradicted it; `[R5]` ruled the paragraph right. `default` is Vercel's ten-second
 * Hobby value — **the one that killed `POST /api/locale`** on a cold lambda plus a
 * suspended Neon compute, and was diagnosed as an LLM call on a path that reaches no
 * model. Three indexed reads plus F5's `after()`, on a compute that may be asleep.
 */
export const maxDuration = 30;

/**
 * Four pages poll this, so the budget is generous — it is a runaway-client guard, not
 * a product limit. `hit()` prefixes `read:`, so the effective key is
 * `read:chat:state:<uid>`: its own namespace, so polling the badge cannot spend the
 * budget that lets somebody take a reading.
 */
const STATE_MAX = 240;
const HOUR_MS = 3_600_000;

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const gate = await hit(`chat:state:${user.id}`, Date.now(), STATE_MAX, HOUR_MS);
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'too many requests' },
      { status: 429, headers: { 'retry-after': String(gate.retryAfterSeconds) } },
    );
  }

  /*
   * **AN EMPTY STATE IS A 200, NEVER A 500** (§4.2). A querent who has never opened
   * the room has no `chat_threads` row, and that is the normal case rather than an
   * error — the property `/api/persona` and both `/api/memory/*` routes lack, and the
   * reason all three 500 when the database is down. **THIS RELEASE MUST NOT ADD A
   * FOURTH.**
   *
   * So every read is caught individually and degrades to its empty value: with the
   * database down the button renders with no dot, which is exactly what it renders for
   * a querent with nothing unread.
   */
  const [thread, unread, lastAt, pending] = await Promise.all([
    getThread(db, user.id).catch(quiet('state.thread', user.id, null)),
    unreadCount(db, user.id).catch(quiet('state.unread', user.id, 0)),
    lastMessageAt(db, user.id).catch(quiet('state.last', user.id, null)),
    activeRunFor(db, user.id).catch(quiet('state.run', user.id, null)),
  ]);

  const body: ChatStateReply = {
    unread: unread ?? 0,
    lastReadAt: thread?.lastReadAt?.toISOString() ?? null,
    lastMessageAt: lastAt?.toISOString() ?? null,
    pendingRun: pending
      ? { id: pending.id, status: pending.status, beatsRemaining: beatsRemaining(pending) }
      : null,
    /* `[F1-19]`. A boolean, not a model name — it reaches the browser deliberately, and
     * `audit-secrets.ts` greps for env VALUES, which `'0'`/`'1'` are not. */
    chatEnabled: chatEnabled(),
  };

  /*
   * **THE PROACTIVE TICK (`C-D18`, `C-N2a` source 2).** This is the one request the app
   * can rely on a returning querent making, so it is where `C-D7`'s minting happens —
   * and it costs the querent nothing, because `after()` runs once the response has
   * flushed.
   *
   * **F1 SHIPS `proactiveTick` RETURNING `null` UNCONDITIONALLY** and F5 fills it in.
   * The route is complete and inert until then, which is deliberate: the alternative is
   * F5 editing a route file F1 owns.
   */
  /*
   * **THE QUERENT'S CLOCK, WRITTEN ONLY WHEN IT MOVED** (R1). `getThread` has already
   * run above, so the comparison costs nothing and the write happens on a first
   * poll, on a DST change and on a flight — not on every badge fetch from four
   * pages. **This is the busiest route in the app and it stays a read.**
   *
   * It is `null` when the header was absent or refused, and the key is then never
   * written: **absent means "do not touch", never "unset"** — one old tab must not
   * be able to erase what every other tab reports.
   *
   * This is bookkeeping the querent did not ask for, which this route's header
   * already permits in `after()`. It is not a fact claiming the querent LOOKED,
   * which is the thing `F1-D3` forbids here.
   */
  const offset = parseUtcOffset(request.headers.get(UTC_OFFSET_HEADER)).offsetMinutes;
  const movedOffset =
    offset !== null && offset !== (thread?.utcOffsetMinutes ?? null) ? offset : null;
  const tick = chatProactiveEnabled();

  if (movedOffset !== null || tick) {
    const localDate = parseLocalDate(request.headers.get(LOCAL_DATE_HEADER)).date;
    const locale = await getLocale();
    /*
     * **ONE `after()`, TWO STEPS, IN ORDER.** Next makes no promise that two
     * separately registered callbacks run in sequence, and the order matters: the
     * proactive tick is where a run is minted, and phase 8's quiet-hours gate reads
     * the very column the first step writes. Two `after()`s would be a race that is
     * green on every machine that runs them fast enough.
     */
    after(async () => {
      if (movedOffset !== null) {
        try {
          await upsertThread(db, user.id, { utcOffsetMinutes: movedOffset });
        } catch (err) {
          logChatFailure('state.offset', err, { user: user.id });
        }
      }
      if (tick) {
        try {
          await proactiveTick({ userId: user.id, locale, localDate });
        } catch (err) {
          logChatFailure('state.tick', err, { user: user.id });
        }
      }
    });
  }

  return NextResponse.json(body, { headers: { 'cache-control': 'private, no-store' } });
}

/**
 * Swallow a read failure into its empty value, logging without the bound parameters.
 *
 * **`[F1-23]`: a postgres error quotes its bound parameters**, and on this path one of
 * them is `users.id`. That is not the querent's text, but the helper is used for every
 * read here so that the one that binds a body cannot be the exception somebody forgets.
 */
function quiet<T>(where: string, userId: string, fallback: T) {
  return (err: unknown): T => {
    logChatFailure(where, err, { user: userId });
    return fallback;
  };
}
