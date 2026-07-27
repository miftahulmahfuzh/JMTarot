import 'server-only';

import type { Locale, ReaderId, ServiceId, YesNo } from '@/data/types';
import { budgetFor } from './budget';
import { servicePromptEn, VERDICT_WORD_EN } from './services.en';
import { servicePromptId, VERDICT_WORD_ID } from './services.id';

export { budgetFor, LENGTH_BUDGET, midpoint, type LengthBudget } from './budget';

/**
 * The task layer's facade.
 *
 * The two locale modules are HANDED a resolved budget rather than importing one, so
 * the number in the prompt and the number the smoke script asserts against are
 * provably the same object. `budgetFor` is re-exported here because `services.ts` is
 * what everything already imports.
 *
 * IT TAKES THE READER, WHICH THE PLAN'S §4 SIGNATURE DID NOT. The budget became
 * per-reader when measurement showed Margaret sitting on the 40-word ceiling in both
 * locales; see `READER_OVERRIDE` in `budget.ts`. Passing the reader is what keeps the
 * resolution in one place -- the alternative was for `build.ts` to resolve the budget
 * and pass a number, which puts the override logic in the caller and lets the smoke
 * script resolve it differently.
 */
const BY_LOCALE = {
  id: servicePromptId,
  en: servicePromptEn,
} satisfies Record<Locale, typeof servicePromptId>;

export function servicePrompt(
  service: ServiceId,
  locale: Locale,
  reader: ReaderId,
  verdict?: YesNo,
): string {
  return BY_LOCALE[locale](service, budgetFor(locale, service, reader), verdict);
}

/**
 * How the code-derived verdict is spelled, per locale.
 *
 * THE VERDICT IS DERIVED IN CODE AND NEVER BY THE MODEL. `effectiveYesNo()` decides
 * it, including the reversal flip, and the prompt hands the model the word and tells
 * it to open with it. Letting the model choose produced answers that contradicted
 * the card's own orientation, which is the one thing a yes/no reading cannot do.
 */
export const VERDICT_WORD: Record<Locale, Record<YesNo, string>> = {
  id: VERDICT_WORD_ID,
  en: VERDICT_WORD_EN,
};

/**
 * Output budget per service. LOCALE-FREE, on purpose.
 *
 * Generous relative to the word counts, because a reading cut off mid-sentence is
 * far worse than a few unused tokens. These are runaway guards; `LENGTH_BUDGET` is
 * the length control.
 *
 * spread3 was 1100, for a four-paragraph reading of 3-5 sentences each. That came
 * back at ~330 words, which is more than anyone reads on a phone; the task now asks
 * for far less and the ceiling came down with it.
 *
 * NOT LOWERED FOR ENGLISH, and do not lower them: English is CHEAPER per word than
 * Indonesian in any BPE tokenizer, so these are already generous there.
 */
export const MAX_TOKENS: Record<ServiceId, number> = {
  daily: 500,
  spread3: 650,
  yesno: 350,
};
