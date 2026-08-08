/**
 * SOURCE 1. **A finished reading mints a `reading_completed` run.** §3 and §8.
 *
 * The one function `src/app/api/reading/route.ts` imports, so that the diff in that file
 * is one import and one awaited call. **If a diff there appears to change any of the
 * four invariants in its header, it is wrong.**
 *
 * ── WHERE IT GOES, AND WHY LAST (§8.3) ────────────────────────────────────
 *
 * Inside the existing `defer()`, as the **last** statement, after `touchLastSeen`.
 *
 *  1. **After `persistReading` is mandatory.** `chat_runs.trigger_reading_id` is an FK to
 *     `readings.id` and the row does not exist before it. Minting first is a constraint
 *     violation, and it would present as *"the chat never reacts to readings"* with an
 *     error in a log nobody reads.
 *  2. **Last is a statement about priority.** Deferred jobs run in registration order
 *     inside one callback, so whatever is last is the first thing lost when the platform
 *     cuts the invocation short. **A lost mint costs one proactive message; a lost
 *     `persistReading` costs the querent's history and every memory feature that reads
 *     it.** The Lotus repair's header makes this argument, the gist's makes it again, and
 *     A2's ledger a third time — *a dashboard row may never be in front of the querent's
 *     own history*, and a proactive message is further back than a dashboard row.
 *  3. **It is self-healing, which is what makes losing it acceptable.** M1's detection is
 *     *"a reading since the last proactive run"* and not *"the reading in this request"*,
 *     so the next open tick picks up a reading whose mint was lost. **That is the reason
 *     the material catalogue is a scan and not a queue.**
 *
 * **NOT ITS OWN `after()`.** The Lotus repair takes one because it must not sit behind
 * `persistReading` in the queue; this must sit behind it, so the queue is exactly right —
 * and a separate `after()` would have an ordering against the queue that is Next's
 * business rather than ours.
 *
 * ── WHAT IT COSTS (§8.2) ──────────────────────────────────────────────────
 *
 * Four to six round trips, **no model call, no transaction of its own beyond the counter
 * and the insert**. Against a warm Neon compute in `sin1` that is tens of milliseconds;
 * against a cold one the wake-up was already paid for by `persistReading` four steps
 * earlier. **It fits, and the reason it fits is `[F5-4]`.** A design in which the reading
 * route *planned* the chat run — one `chat_plan` call, 3–8 seconds — would not, and would
 * be competing with `extractGist` for the tail of an invocation whose own header declines
 * to guarantee it.
 *
 * ── IF IT TURNS OUT NOT TO FIT (§8.4) ─────────────────────────────────────
 *
 * **Nothing moves; the mint goes.** If `reading.completed` latency or a rise in lost
 * `readings` rows is ever traced here, delete source 1 and let the open tick do it —
 * which costs nothing, because M1's scan already finds the reading. Source 1 exists to
 * make the reaction arrive *sooner*, not to make it arrive. Written down so that the fix
 * under pressure is obvious rather than *"make the mint async"*, which is a floating
 * promise in a serverless function and is the thing `after()` exists to prevent.
 */
import 'server-only';

import type { Locale, ReadingStatus } from '@/data/types';
import { mintProactiveRun, type MintResult } from './mint';

export type OnReadingArgs = {
  userId: string;
  readingId: string;
  /** `outcome.status`. A blocked or bodyless reading is not material — see below. */
  status: ReadingStatus;
  /** `localDate.date`. **A STRING** (`[F5-3]`). */
  localDate: string;
  locale: Locale;
};

/**
 * Mint for the reading that just finished, or answer why not. **Never throws.**
 *
 * `status` is checked here as well as in `detect.ts` so the common refusal costs no
 * queries at all: a blocked reading is W7 having refused the question, the reader never
 * spoke, and **a proactive run about it would be the app volunteering that it refused
 * you.** An `aborted` one has no prose to react to — the querent walked away mid-stream,
 * which is the opposite of a conversational opening.
 */
export async function mintOnReadingCompleted(args: OnReadingArgs): Promise<MintResult> {
  if (args.status === 'blocked' || args.status === 'aborted' || args.status === 'failed') {
    return { minted: false, reason: 'no_material' };
  }

  return mintProactiveRun({
    userId: args.userId,
    source: 'reading',
    localDate: args.localDate,
    locale: args.locale,
    readingId: args.readingId,
  });
}
