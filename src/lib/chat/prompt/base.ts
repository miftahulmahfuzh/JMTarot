import 'server-only';

import type { Locale } from '@/data/types';
import type { ChatLengthBudget } from '@/lib/prompt/budget';
import { CHAT_BASE_EN } from './base.en';
import { CHAT_BASE_ID } from './base.id';

/**
 * The chat base layer's facade. W6's rule in its fourth application (`base.ts`,
 * `readers.ts`, `services.ts`, and now this).
 *
 * **`Record<Locale, …>` IS THE POINT OF THE SHAPE.** Forgetting a locale is a compile
 * error rather than a runtime `undefined` handed to a model — which would not throw,
 * would not log, and would produce a *bubble generated with no contract at all*. In
 * this room that is worse than it is on the reading path: the contract is what forbids
 * quoting a person's own answer back at them.
 *
 * The prose lives in `base.id.ts` and `base.en.ts` along with the comments explaining
 * why each rule is there, **because those comments are the reason the rules survive
 * somebody's tidying pass.**
 */
const BY_LOCALE: Record<Locale, (b: ChatLengthBudget, self: string) => string> = {
  id: CHAT_BASE_ID,
  en: CHAT_BASE_EN,
};

/**
 * The chat contract for one locale, one reader, with that reader's resolved ceiling
 * interpolated.
 *
 * `self` IS THE READER'S OWN NAME AND IT IS NOT DECORATION: the contract tells them
 * not to sign a message with it (*"nama pengirim sudah kelihatan di grup"*), and a
 * model that does not know which of the three it is cannot obey a rule about the other
 * two.
 */
export function chatBaseContract(locale: Locale, budget: ChatLengthBudget, self: string): string {
  return BY_LOCALE[locale](budget, self);
}

/** For `prompt.test.ts`, which asserts over both contracts as strings. */
export const CHAT_BASE: Record<Locale, (b: ChatLengthBudget, self: string) => string> = BY_LOCALE;
