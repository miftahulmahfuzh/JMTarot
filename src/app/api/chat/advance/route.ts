/**
 * `POST /api/chat/advance` — **THE ONE ENGINE ENTRY POINT** (`C-D1`).
 *
 *   -> 200 AdvanceReply     a seven-arm discriminated union; see `@/lib/chat/types`
 *   -> 401 / 403 / 429
 *
 * Plan, or execute exactly one beat. **Never both, never two beats** (`C-R2`). The
 * reply tells the client what is about to happen next — which reader, and for how long
 * the typing indicator should run — so the client can render the pause BEFORE it asks
 * for the bubble.
 *
 * ── THE CLIENT SAYS IT WANTS TO ADVANCE; IT NEVER SAYS WHICH BEAT ─────────
 *
 * `runId` is accepted, and **not trusted**: the claim statement selects by `user_id`
 * over the three live statuses. A client naming a finished run, or a run that is not
 * theirs, gets `{ state: 'idle' }`. **That is W3's completion-route rule applied to a
 * run** — *the client is trusted to say what it answered, never that it finished.*
 *
 * ── IT DOES NOT 500, AND THAT IS THE POINT OF THE UNION ───────────────────
 *
 * The client's only reasonable response to a 500 is a retry, and a retry is right for
 * exactly one of these outcomes. `POST /api/locale`'s third rule in a new place: **a
 * timeout is the one outcome that means UNKNOWN, so it is the only one retried.**
 *
 *   `busy`  -> retry after the declared delay. Somebody else holds the lease.
 *   `shed`  -> **DO NOT RETRY** (`[F1-6]`). The budget is out; retrying is a client
 *              hammering a budget that is already out. The run keeps its beats and the
 *              querent's next visit delivers them.
 *   `idle`  -> stop. There is nothing in flight.
 *   `silent`/`skipped` with `done: true` -> stop. The room saw nothing, deliberately.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/lib/auth/server';
import { logChatFailure } from '@/lib/chat/log';
import { advance } from '@/lib/chat/run';
import type { AdvanceReply } from '@/lib/chat/types';
import { getLocale } from '@/lib/i18n/t';
import { hit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/**
 * **SIXTY, AND IT MUST COVER TWO `chat_turn` CALLS PLUS THE LEASE ROUND TRIPS**
 * (`F1-D2`): the retry is a second model call INSIDE this request, not a second
 * request, so there is no `attempt` column and no way for a client to lose count of
 * retries by closing a tab. A chat turn is one to three sentences; two of them at
 * z.ai's measured latency is comfortably inside sixty seconds, **and the lease is
 * ninety** — deliberately longer, so a slow beat cannot lose its own lease while it is
 * still writing.
 */
export const maxDuration = 60;

const HOUR_MS = 3_600_000;
/**
 * Sixty posts x (1 plan + up to 4 beats + slack). **A RUNAWAY-CLIENT GUARD, NOT A
 * PRODUCT LIMIT** — the real bound on what a conversation costs is
 * `LLM_WINDOW_CHAT_CEILING`, and this exists so that a client stuck in a retry loop
 * cannot spend it.
 */
const ADVANCE_MAX = 400;

const Body = z.object({
  /** Advisory. Logged and NOT trusted — the engine claims by `user_id` regardless. */
  runId: z.string().uuid().nullish(),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const gate = await hit(`chat:advance:${user.id}`, Date.now(), ADVANCE_MAX, HOUR_MS);
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'too many requests' },
      { status: 429, headers: { 'retry-after': String(gate.retryAfterSeconds) } },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad body' }, { status: 400 });

  const locale = await getLocale();

  try {
    const reply: AdvanceReply = await advance({ userId: user.id, locale });
    return NextResponse.json(reply, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    /*
     * `advance()` is written not to throw — every failure is an arm of the union — so
     * reaching here means something outside the engine broke. **Answered as `busy`
     * rather than as a 500**, because that is the one arm whose meaning is *"try again
     * shortly"* and a 500 would make F4 choose between hammering and giving up.
     *
     * **`[F1-23]`: never the error object.** This path runs a statement that binds a
     * person's sentence.
     */
    logChatFailure('advance.route', err, { user: user.id });
    const busy: AdvanceReply = { state: 'busy', runId: null, done: false };
    return NextResponse.json(busy, { headers: { 'cache-control': 'no-store' } });
  }
}
