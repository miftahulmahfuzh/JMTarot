/**
 * THE DETERMINISTIC FALLBACK. **PURE: no model call, no database read, no
 * `Math.random`.**
 *
 * It fires when the `chat_plan` call throws or when `checkPlan` refuses — `parse`,
 * `shape` or `no_usable_beat`. `plan.ts` (F1's) is the only caller.
 *
 * ── `[F2-13]` EXACTLY ONE BEAT, NEVER TWO, AND NEVER THREE ─────────────────
 *
 * The roadmap's own words: *"a fallback that is louder than the real thing is the wrong
 * failure."* Two consequences worth stating, because both are counter-intuitive:
 *
 *  - **A three-beat fallback would fire on exactly the runs where the model was
 *    confused**, which are disproportionately the odd, hard or hostile messages. Three
 *    readers piling onto the message the director could not parse is the worst available
 *    behaviour in this release.
 *  - **It is one beat and not zero.** Zero would be indistinguishable, from the room,
 *    from a deliberate silence — and here the silence would be caused by an outage rather
 *    than by judgement. `C-R6` says silence must be a *decision*; a failure that borrows
 *    it is dishonest to the querent and invisible in the data. (`chat_runs.plan_source`
 *    and `chat.run_planned.outcome` record it either way, per `[F2-7]` — but the querent
 *    should still get a bubble.)
 *
 * ── AND `angle` IS ALWAYS NULL ─────────────────────────────────────────────
 *
 * A deterministic angle is a template, and a template angle handed to three different
 * voices across three different failures produces three variants of one sentence — the
 * flattening `[F2-2]` exists to prevent, arriving through the failure path. A voice handed
 * a null angle writes from the run's own context, which is `C-R5`'s material and what it
 * should be writing from anyway.
 */
import { DEFAULT_READER } from '@/data/readers';
import type { ReaderId } from '@/data/types';
import type { Beat, RunTrigger } from '../types';

export type FallbackInput = {
  trigger: RunTrigger;
  /** What a `user_message` fallback quotes. Null for every proactive trigger. */
  triggerMessageId: string | null;
  /** `affinityFor`'s single `strong` reader, or null on a tie or no match. */
  lead: ReaderId | null;
  /** `awaitingReader`: whose question is still hanging. */
  awaiting: ReaderId | null;
  /** The reader of the querent's most recent reading. Best guess with no model. */
  lastReadingReader: ReaderId | null;
  /**
   * `C-N2e`: **a proactive run with nothing to be about produces *"hai, apa kabar?"***,
   * which the roadmap names as the emptiest thing this feature could ship. F5 guarantees
   * material, so the false arm below is BELT — and it is the correct belt.
   */
  hasMaterial: boolean;
};

export function fallbackSheet(input: FallbackInput): Beat[] {
  const one = (reader: ReaderId, intent: 'answer' | 'ask', replyTo: string | null): Beat[] => [
    { reader, to: 'user', replyTo, intent, angle: null },
  ];

  if (input.trigger === 'user_message') {
    /*
     * **`lastReadingReader` IS NOT A ROTATION** — a rotation is a rota, and a rota is a
     * switchboard (§4). It is the best available guess with no model and no new query:
     * the reader this querent last chose to sit with.
     */
    const reader = input.lead ?? input.awaiting ?? input.lastReadingReader ?? DEFAULT_READER.id;
    return one(reader, 'answer', input.triggerMessageId);
  }

  if (!input.hasMaterial) return [];

  /*
   * **`intent: 'ask'` ON THE PROACTIVE ARM**, because an unprompted `answer` answers
   * nothing. A reader who opens with a question has a reason to have spoken; a reader who
   * opens with a statement about nothing is a notification.
   */
  return one(input.awaiting ?? input.lastReadingReader ?? DEFAULT_READER.id, 'ask', null);
}
