/**
 * A global ceiling on model calls over a rolling window, in two tiers.
 *
 * **THIS REPLACES THE Z.AI SPEND CAP, WHICH DOES NOT EXIST.** See
 * `src/lib/ratelimit/index.ts`'s header for why. The subscription is a prepaid
 * quota; exhausting it does not produce a bill, it produces an app that stops
 * answering, for everybody, with no billing alert to notice it by.
 *
 * ── WHY A ROLLING FIVE HOURS, AND NOT A CALENDAR DAY ────────────────────────
 *
 * **BECAUSE THAT IS THE SHAPE OF THE QUOTA IT IS PROTECTING.** Verified against
 * z.ai's own FAQ on 2026-07-27: the Coding Plan meters *prompts per rolling
 * 5-hour cycle* (plus a rolling 7-day one), and when a cycle is spent you wait
 * for the next one -- *"the system will not deduct from your account balance"*.
 *
 * The plan originally specified a UTC-day bucket. That could not have done the
 * job: **a script can burn the whole 5-hour quota in five minutes while a daily
 * counter still reads 400/4000**, so the ceiling would never fire before the
 * provider's own limit did, which is exactly the outage it exists to prevent.
 * Matching the provider's window is the consequence of that, not the motive.
 *
 * Two things this shape DELETES rather than solves, so nobody re-adds them:
 *
 *   1. **There is no date in the key**, so there is no UTC-versus-`local_date`
 *      question at all. `local_date` is the querent's calendar day and that is
 *      load-bearing everywhere else in this codebase -- `todayKey()`'s comment,
 *      the `string` column type, an integration test that fails if anyone
 *      "fixes" it. A provider quota is not a property of anybody's calendar, and
 *      the cleanest way to say so is to not write a date down.
 *   2. **There is no reset boundary**, so there is no six-hour band each day in
 *      which two people in two zones would disagree about which bucket to
 *      increment. The window slides; `meter.test.ts` asserts that it does.
 *
 * The 7-day quota is deliberately NOT modelled. 280 per 5h is 1344/week against
 * a ~2000 weekly quota, so the 5-hour ceiling already holds the weekly one --
 * **and that arithmetic is only true at the Pro tier.** If the plan changes,
 * re-derive it here before assuming the weekly limit is still covered. Two
 * windows would double the meter's share of the Upstash command budget and double
 * the surface of the one control that has to be simple enough to trust at 4am.
 *
 * ── WHY TWO TIERS ───────────────────────────────────────────────────────────
 *
 * Not everything that calls a model is something a person is watching. Shedding
 * the deferred half first buys hours of headroom that the querent cannot feel,
 * and the app already degrades gracefully for every one of them by
 * construction: `chain.ts` returns null and never throws, `daily_summaries` and
 * `frequency_verdicts` have cache-miss paths, and the Lotus has a template
 * fallback. So the soft tier costs a *slightly worse* reading; the hard tier
 * costs a 429.
 *
 * ── WHAT HAPPENS WHEN THE CLASSIFIER IS SHED ────────────────────────────────
 *
 * Nothing new. `complete()` throws, `classifyQuestion` surfaces it as a
 * `ClassifierError`, and W7's gate applies its existing asymmetric rule: a clean
 * blocklist fails OPEN, a Tier-B suspicion fails CLOSED as `unclear`. That
 * composition is why the classifier is `interactive` and not `deferred` -- it is
 * shed only at the hard ceiling, when readings are being refused anyway.
 */
import { track } from '@/lib/analytics/track';
import { consume, peek } from '@/lib/ratelimit';

/**
 * The budget's key. **NO DATE IN IT, ON PURPOSE** -- see the header.
 *
 * It goes through `consume`/`peek` rather than `hit`/`hitGlobal`, because those
 * three apply a namespace of their own: `hit('llm:window')` would record into
 * `read:llm:window` while the soft tier's peek read `llm:window`, so the peek
 * would report zero used forever and the soft tier would never fire. Both halves
 * would work perfectly, on two different counters.
 */
export const MODEL_WINDOW_KEY = 'llm:window';

/** Five hours, matching the provider's own cycle. */
export const MODEL_WINDOW_MS = 5 * 60 * 60 * 1000;

/**
 * Interactive = a person is looking at a spinner. Deferred = it happens in
 * `after()`, or its absence is a cache miss nobody can name.
 *
 * THE RULE, for whoever adds the next model call: if a user is waiting for the
 * bytes, it is interactive. Everything else is deferred, including work that
 * feels important.
 *
 * **DECLARED IN `types.ts` AND RE-EXPORTED HERE.** That file has no imports and
 * must keep none -- `LLMCallOpts` names this type, and every consumer of
 * `LLMCallOpts` would otherwise pull `next/server` in through this module. See
 * the comment there.
 */
import type { CallClass } from './types';
export type { CallClass };
export type { ReasoningEffort } from './types';

export class ModelCeilingError extends Error {
  constructor(readonly tier: 'soft' | 'hard') {
    super(`model call ceiling reached (${tier})`);
    this.name = 'ModelCeilingError';
  }
}

/**
 * **280, DERIVED FROM A MEASUREMENT AND NOT A GUESS** -- unlike the 4000 the plan
 * shipped as a placeholder.
 *
 * The key is on the GLM Coding Plan's Pro tier: ~400 prompts per rolling 5 hours.
 * 400 x 70% = 280, with the soft tier at 70% of that (196). The remaining ~120
 * prompts of headroom are the price of z.ai fact (4): **we could not observe what
 * quota exhaustion looks like on the wire without causing it**, so the ceiling
 * stays clear of the boundary rather than sitting on it.
 *
 * If the plan tier changes, change this and re-check the weekly arithmetic in the
 * header. Put the derivation in the commit message either way -- the next person
 * needs to know what was chosen and why, not merely whether anything was.
 */
function hardCeiling(): number {
  return positive(process.env.LLM_WINDOW_CALL_CEILING, 280);
}

/** Defaults to 70% of hard. Below this, deferred work still runs. */
function softCeiling(): number {
  return positive(process.env.LLM_WINDOW_CALL_SOFT, Math.floor(hardCeiling() * 0.7));
}

/**
 * The group chat's share of the same window (`C-D6` consequence 2, v0.7.0).
 * **HALF THE HARD CEILING — 140 of 280.**
 *
 * ── WHY THE NUMBER LIVES HERE AND THE ENFORCEMENT LIVES IN `chat/budget.ts` ──
 *
 * `reserveChatCall()` peeks its own counter, calls `reserveModelCall('deferred')`,
 * and only then consumes — so it imports this module and this module must not import
 * it back. Resolving the number here rather than there keeps `_ceilings()` the ONE
 * answer to *"what are this app's model-call limits"*, which is what F7's panel needs
 * (`adminCopy.test.ts` forbids reading a ceiling from `process.env` in that tree) and
 * what an operator reads at 4am.
 *
 * **DERIVED FROM `hardCeiling()` AND NOT WRITTEN AS A LITERAL**, so that the day the
 * February 2027 credit migration moves 280 this moves with it. A hardcoded 140 beside
 * a ceiling that had moved would be a sub-budget that is suddenly the whole budget,
 * or a tenth of it, with nothing saying which.
 *
 * **WITHOUT IT a single enthusiastic querent's afternoon reaches the soft line and
 * every deferred feature in the app — the gist, the day summary, the frequency
 * verdict — goes quiet with them.**
 */
function chatCeiling(): number {
  return positive(process.env.LLM_WINDOW_CHAT_CEILING, Math.floor(hardCeiling() / 2));
}

/**
 * A garbage value falls back rather than becoming zero. Same defensiveness and
 * same reason as `auth/ttl.ts`: a ceiling of 0 refuses every model call in the
 * app, which is a typo taking the product down.
 */
function positive(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Test seam, and **since v0.7.0 also F7's accessor**: the three numbers as resolved
 * from the environment. `adminCopy.test.ts` bans reading a ceiling out of
 * `process.env` in the admin tree, so a panel that wants to show what the limits are
 * asks here.
 */
export function _ceilings() {
  return { hard: hardCeiling(), soft: softCeiling(), chat: chatCeiling() };
}

export type Reservation =
  | { ok: true }
  /**
   * A soft refusal NEVER REACHES A USER -- deferred work simply does not run --
   * so it carries no `retryAfterSeconds`. Putting one there would be a number
   * nobody can act on, and the union shape is what makes the route's access to
   * `retryAfterSeconds` type-safe without a fallback.
   */
  | { ok: false; tier: 'soft' }
  | { ok: false; tier: 'hard'; retryAfterSeconds: number };

export async function reserveModelCall(cls: CallClass, now = Date.now()): Promise<Reservation> {
  const hard = hardCeiling();

  /*
   * Deferred work checks the soft line with a READ FIRST, and this ordering is
   * the point of `peek()` existing. Consuming and then deciding to refuse would
   * charge the window for a call that was never made -- which, sustained across
   * an afternoon at the soft line, walks the counter into the hard ceiling on
   * work that was already being declined. The refusals would cause the outage.
   * Two round trips, off the response path by construction.
   */
  if (cls === 'deferred') {
    const seen = await peek(MODEL_WINDOW_KEY, hard, MODEL_WINDOW_MS, now);
    const used = seen.ok ? hard - seen.remaining : hard;
    if (used >= softCeiling()) {
      track('llm.ceiling_reached', { tier: 'soft', call_class: cls, used, ceiling: hard });
      return { ok: false, tier: 'soft' };
    }
  }

  const gate = await consume(MODEL_WINDOW_KEY, hard, MODEL_WINDOW_MS, now);
  if (!gate.ok) {
    track('llm.ceiling_reached', { tier: 'hard', call_class: cls, used: hard, ceiling: hard });
    return { ok: false, tier: 'hard', retryAfterSeconds: gate.retryAfterSeconds };
  }
  return { ok: true };
}
