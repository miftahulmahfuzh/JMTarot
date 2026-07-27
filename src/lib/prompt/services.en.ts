import type { ServiceId, YesNo } from '@/data/types';
import { type LengthBudget } from './budget';

/**
 * The English verdict words (I26).
 *
 * `Not yet` and not "Not yet clear". It reads fine as an opener, which is what the
 * yesno task needs -- the reading must OPEN with this word -- and it keeps the
 * smoke script's self-contradiction check tractable: that check greps for the OTHER
 * two verdicts, and a bare `No` collides with ordinary English prose (`no reason`,
 * `there is no`, `no one`) often enough that a hard FAIL would be noise. Task 11
 * downgrades that one check to a sentence-initial WARN for `en` and says why.
 *
 * REAL AND SHIPPED, unlike `servicePromptEn` below: it is three words, there is no
 * risk of a persona regression hiding in them, and `VERDICT_WORD` is a
 * `Record<Locale, ...>` so leaving it as a placeholder would put `TODO` in front of
 * an English reading rather than in front of nothing.
 */
export const VERDICT_WORD_EN: Record<YesNo, string> = {
  yes: 'Yes',
  no: 'No',
  maybe: 'Not yet',
};

/**
 * PLACEHOLDER. Task 10 writes this, from `services.id.ts`, KEEPING THE STRUCTURE
 * EXACTLY: the same paragraph count, the same "start each paragraph with the
 * position name as written", the same explicit instruction to name the card in the
 * first sentence, and the same ceiling interpolated from `LENGTH_BUDGET`.
 *
 * The card-naming instruction is not boilerplate. Under compression pressure
 * Thessaly stopped naming cards at all in Indonesian, which is why the task says so
 * explicitly -- and there is no reason to expect an English model to behave better
 * about it.
 *
 * Deliberately not prose: if this reaches a model, the reading is wrong in a way
 * somebody must notice immediately. An English-looking paragraph here would produce
 * a plausible reading nobody checked.
 */
export function servicePromptEn(
  service: ServiceId,
  budget: Record<ServiceId, LengthBudget>,
  verdict?: YesNo,
): string {
  void budget;
  void verdict;
  return `TODO(W6 Task 10): the English task layer for ${service} is not written yet.`;
}
