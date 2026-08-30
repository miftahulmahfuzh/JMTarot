/**
 * The chat's share of the five-hour window, and the promise it makes to the reading.
 *
 * ── WHY THE CHAT NEEDS ITS OWN SUB-BUDGET AT ALL (`C-D6` consequence 2) ────
 *
 * `LLM_WINDOW_CALL_CEILING` is **280 model calls per rolling five hours,
 * fleet-wide.** **A chat run is 2–9 calls since 2026-08-30** — one `chat_plan` plus one
 * `chat_turn` per beat, at `CHAT_MAX_BEATS = 8` — where it was 2–5 at a four-beat cap.
 * **Roughly THIRTY chat runs now exhaust the entire app's five-hour quota**, where the
 * figure this paragraph carried was sixty; the next thing to be refused would be somebody's
 * reading.
 *
 * **THAT MAKES THIS FILE MORE LOAD-BEARING, NOT LESS, AND IT IS WHY THE NATURALNESS
 * RULING DID NOT REACH IT.** *"i don't care about glm 5.3 token consumption"* is a ruling
 * about spend; `C-D6` is a ruling about **who is shed first when the quota runs out**, and
 * the answer stays "the chat". `LLM_WINDOW_CHAT_CEILING` and `callClass: 'deferred'` are
 * unchanged, deliberately: a louder room that can take a querent's reading away from them
 * is not the room that was asked for.
 *
 * `callClass: 'deferred'` already says the reading wins (see `chatCall`'s tier in
 * `direct/plan.ts` and `voices/turn.ts`), but `deferred` is a fleet-wide tier and not
 * a per-feature one: **without this ceiling a single enthusiastic querent's afternoon
 * reaches the soft line and every deferred feature in the app — the gist, the day
 * summary, the frequency verdict, the persona refresh — goes quiet with them.**
 *
 * ── THE FLEET CEILING IS RE-DERIVED AND UNCHANGED AT 280 (`F1-D4`, `[R16]`) ─
 *
 * ```
 *   280 = ~400 prompts per rolling 5 hours (z.ai Coding Plan, Pro tier) x 70%
 * ```
 *
 * `C-D6` consequence 1 demanded a re-derivation before this ships and the answer is
 * **no change**, on three facts that point the same way:
 *
 *   1. **The denominator is a property of the plan, not of the app.** The chat does
 *      not create quota. **A bigger number does not create quota** — raising 280
 *      raises what this app is willing to spend, not what the plan will serve.
 *   2. **`## The z.ai plan` makes the slack more valuable, not less.** The balance
 *      was read on 2026-08-01 and is **zero**. There is no wallet, so there is **no
 *      soft landing**: the failure past the plan's limits is `1113 Insufficient
 *      Balance` on the first call, instantly, for everybody. A ceiling that sits
 *      closer to the provider's own limit converts a graceful internal refusal into a
 *      provider-side outage.
 *   3. **The correct instrument for "the chat multiplies calls 5–10x" is this file**,
 *      not the ceiling. All three mechanisms — the sub-budget, the `deferred` tier,
 *      and `[F1-6]`'s free shed — exist precisely so the fleet ceiling does not move.
 *
 * **THE ONE THING THAT DOES CHANGE IT** is the ~February 2027 migration
 * `## The z.ai plan` describes: on a credit-metered plan, 280 loses its units
 * entirely — a four-paragraph `spread3` and a one-line classifier reply stop being
 * one unit each, and at a 24x output multiplier they are very far apart.
 * **Re-derive against credits then; do not raise the number now.**
 */
import { consume, peek } from '@/lib/ratelimit';
import { MODEL_WINDOW_MS, reserveModelCall, _ceilings } from '@/lib/llm/meter';

/**
 * The chat's key. **NO DATE IN IT**, matching `llm:window`: the provider's quota is
 * not a property of anybody's calendar, and the cleanest way to say so is to not
 * write a date down.
 *
 * **IT GOES THROUGH `consume`/`peek` AND NEVER `hit`** (`F1-D5`). `hit()` applies a
 * `read:` namespace before the backend sees the key, so `hit('llm:chat:window')`
 * would record into `read:llm:chat:window` while the peek read the bare key — **the
 * two halves working perfectly on two different counters**, which is the failure
 * `ratelimit/index.ts` documents by name and which killed `meter.ts`'s soft tier in
 * draft. `budget.test.ts` asserts the pairing.
 */
export const CHAT_WINDOW_KEY = 'llm:chat:window';

/**
 * **HALF THE HARD CEILING — 140 of 280** (`[R16]`), read at call time (`[F1-17]`).
 *
 * **THE NUMBER IS RESOLVED IN `meter.ts` AND THIS DELEGATES**, rather than the other
 * way round, for two reasons: this module already imports that one (and the reverse
 * would be a cycle), and `_ceilings()` is the ONE answer to *"what are this app's
 * model-call limits"* — which is what F7's panel reads and what an operator reads at
 * 4am. `[F1-18]`'s rule is applied there: **a garbage value falls back rather than
 * becoming zero**, because a chat ceiling of `0` refuses every chat call in the app,
 * which is a typo taking a feature down with nothing reporting it.
 */
export function chatCeiling(): number {
  return _ceilings().chat;
}

export type ChatReservation =
  | { ok: true }
  /**
   * **A SHED CHAT CALL IS NOT AN ERROR** (`[F1-6]`, `C-D6` consequence 3). The run is
   * left exactly as it was with beats remaining, the lease is released, nothing is
   * written, and the querent's next visit delivers the rest. `reason` exists so the
   * `chat.run_planned` / `chat.turn_generated` events can say which budget said no —
   * the chat's own share, or the fleet's.
   */
  | { ok: false; reason: 'chat_window' | 'soft' | 'hard' };

/**
 * Reserve one chat model call. **PEEK FIRST, CONSUME LAST** (`F1-D5`).
 *
 * ```
 *   1. peek  llm:chat:window            -> at or over ceiling ? SHED, nothing charged
 *   2. reserveModelCall('deferred')     -> soft or hard refusal ? SHED, chat window untouched
 *   3. consume llm:chat:window          -> record the call that is about to be made
 * ```
 *
 * **THE ORDERING IS THE POINT AND IT IS `meter.ts`'s OWN ARGUMENT FOR `peek()`
 * EXISTING:** *"Consuming and then deciding to refuse would charge the window for a
 * call that was never made — which, sustained across an afternoon at the soft line,
 * walks the counter into the hard ceiling on work that was already being declined.
 * The refusals would cause the outage."*
 *
 * **HERE IT IS WORSE**, because a chat run makes two to five calls and the refusals
 * would compound per run: a querent whose every advance is being shed would spend the
 * chat's whole share on being told no, and then spend the fleet's.
 *
 * Step 3 runs only when both gates passed, so **a fleet refusal leaves the chat window
 * untouched** — the chat is not charged for a budget the whole app had already spent.
 */
export async function reserveChatCall(now = Date.now()): Promise<ChatReservation> {
  const ceiling = chatCeiling();

  const seen = await peek(CHAT_WINDOW_KEY, ceiling, MODEL_WINDOW_MS, now);
  if (!seen.ok) return { ok: false, reason: 'chat_window' };

  const fleet = await reserveModelCall('deferred', now);
  if (!fleet.ok) return { ok: false, reason: fleet.tier };

  /*
   * The fleet ceiling has already been charged by `reserveModelCall`, so this call is
   * happening whatever this line answers. A refusal here would be a call made and not
   * counted, which is worse than a count that is occasionally one high — so the result
   * is deliberately not checked.
   */
  await consume(CHAT_WINDOW_KEY, ceiling, MODEL_WINDOW_MS, now);
  return { ok: true };
}
