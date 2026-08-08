/**
 * SOURCE 2. **THE OPEN TICK — the mechanism, where the cron is the enhancement.**
 *
 * `C-D18`: *"That same call is the proactive tick. It is the one request this app can
 * rely on a returning querent making."* `ChatButton` mounts on `/`, `/[reader]`,
 * `/account` and `/history` (`C-D17`), so it fires on every page the querent actually
 * lands on — and it costs them nothing, because `after()` runs once the response has
 * flushed.
 *
 * **THIS DESIGN DOES NOT DEPEND ON THE CRON.** With `/api/cron/nudge` deleted every run
 * here is still minted and still delivered, just later. §3.
 *
 * ── IT MUST NEVER DELAY THE RESPONSE, AND `after()` IS ONLY HALF OF THAT ──
 *
 * `/api/chat/state` is the app's most-called endpoint. The eligibility read is one
 * `chat_threads` row by primary key plus one open-run check — **both of which F1's route
 * is already issuing to answer the request** — and material detection runs only when the
 * cheap gates have otherwise passed (§4.6). The overwhelming majority of ticks cost the
 * two reads the response paid for anyway.
 *
 * ── THE COLD-OPEN PROBLEM, AND HOW IT IS RESOLVED (§12, seam S-new-2) ─────
 *
 * `[F5-6]`: **the dot is lit by a stored bubble and never by a `pending` run.** A run
 * minted here or by a reading has no bubbles, so something has to advance it before the
 * querent can see anything. Left alone, sources 1 and 2 are invisible to anyone who does
 * not open `/chat` voluntarily — **the whole population this feature exists for.**
 *
 * §12 offered two resolutions and neither had been taken when F5 arrived: F4's
 * `ChatButton` reads only `unread` off the state response and fires nothing. So the tick
 * takes it — **at most ONE step of ONE open run, per tick** — and the blocker §12 named
 * for that option is already gone:
 *
 *   - §12 objected that `/api/chat/state`'s `maxDuration` was `default`, *"which on
 *     Hobby is ten seconds"*, and that this is `POST /api/locale`'s trap exactly. **F1
 *     declared 30** (`[R5]` ruled the roadmap's table wrong and its paragraph right), and
 *     this work runs after the response has flushed, so a ~6s beat has the budget.
 *   - The remaining cost is real and is bounded exactly as §12 enumerates: **only while
 *     a run is open, one step per tick, and `callClass: 'deferred'`** — so the soft
 *     ceiling sheds it before any reading is touched, which is `C-D6`'s whole promise.
 *
 * A normal session is 2–4 ticks: the plan lands on one, the first bubble on the next, and
 * **the dot appears while the querent is still in the app.** `C-R3`'s lease is what makes
 * that safe against `/chat`'s own loop and against the cron. The overnight case is the
 * cron's step 3.
 */
import 'server-only';

import type { Locale } from '@/data/types';
import { advance } from '../run';
import { logChatFailure } from '../log';
import { mintProactiveRun } from './mint';

/**
 * One mint attempt for a querent who is in the app right now.
 *
 * **AT MOST ONE RUN PER TICK.** `mintProactiveRun` refuses when a run is already in
 * flight, so a querent navigating four pages in a minute produces one run and three
 * `open_run` refusals — the cheapest possible outcome, and the one the gate ordering in
 * `eligibility.ts` is arranged to reach first.
 *
 * Returns the run id when one was minted, so that `run.ts`'s `proactiveTick` keeps the
 * signature F1 published. **Never throws** (`[F5-18]`).
 */
export async function tickProactive(args: {
  userId: string;
  locale: Locale;
  localDate: string;
}): Promise<{ runId: string } | null> {
  const result = await mintProactiveRun({
    userId: args.userId,
    source: 'tick',
    localDate: args.localDate,
    locale: args.locale,
  });

  /*
   * **THE WARM.** One step, and only when there is provably something to step: either
   * this tick minted a run, or the mint was refused *because a run is already open* —
   * which is the same fact the response's `pendingRun` field carries, read for free from
   * a refusal we already have rather than from a second query.
   *
   * Every other refusal (`gap`, `daily_cap`, `no_material`, `flag_off`) means there is
   * no run at all, and advancing would be one `claimRun` round trip to be told `idle` on
   * every page view in the app.
   */
  const shouldWarm = result.minted || result.reason === 'open_run';
  if (shouldWarm) {
    try {
      /*
       * `advance` NEVER THROWS by contract — every failure is an arm of `AdvanceReply` —
       * so this `catch` is for the one thing that contract does not cover: the module
       * itself failing to reach the database at all. `[F5-18]`, and the log carries ids
       * and never the error.
       */
      await advance({ userId: args.userId, locale: args.locale });
    } catch (err) {
      logChatFailure('proactive.warm', err, { user: args.userId });
    }
  }

  return result.minted ? { runId: result.runId } : null;
}
