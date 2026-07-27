import type { Locale } from '@/data/types';
import { BASE_CONTRACT_EN, FORMAT_RULES_EN } from './base.en';
import { BASE_CONTRACT_ID, FORMAT_RULES_ID } from './base.id';

/**
 * The base layer's facade. `build.ts` and the three side prompts import this and
 * nothing else, so the import graph did not change when W6 forked the file.
 *
 * `Record<Locale, string>` IS THE POINT OF THE SHAPE. Forgetting a locale is a
 * compile error rather than a runtime `undefined` handed to a model -- which would
 * not throw, would not log, and would produce a reading generated with no contract
 * at all. A third locale is two files and one entry in each map below.
 *
 * The prose lives in `base.id.ts` and `base.en.ts` along with the comments
 * explaining why each rule is there, because those comments are the reason the rules
 * survive somebody's tidying pass.
 */

/**
 * Format, language and content limits, WITHOUT the reading framing or the delimiter
 * clauses.
 *
 * THIS IS WHAT `src/lib/prompt/side.ts` WAS, AND W6 DELETED THAT FILE. The three
 * side prompts -- the gist, the frequency verdict, the per-day summary -- need these
 * rules and must NOT be told they are a tarot reader writing one reading in one
 * pass, because telling a model that while asking for a 15-word gist produces a
 * reading. The frequency verdict in particular is explicitly not in any reader's
 * voice: it sits on the reader picker, before a reader has been chosen.
 */
export const FORMAT_RULES: Record<Locale, string> = {
  id: FORMAT_RULES_ID,
  en: FORMAT_RULES_EN,
};

const BY_LOCALE: Record<Locale, string> = {
  id: BASE_CONTRACT_ID,
  en: BASE_CONTRACT_EN,
};

/** The full contract for a reading, in one locale. */
export function baseContract(locale: Locale): string {
  return BY_LOCALE[locale];
}
