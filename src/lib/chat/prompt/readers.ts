import 'server-only';

import type { Locale, ReaderId } from '@/data/types';
import { CHAT_READER_PROMPTS_EN } from './readers.en';
import { CHAT_READER_PROMPTS_ID } from './readers.id';

/**
 * The chat persona layer's facade.
 *
 * `Record<Locale, Record<ReaderId, string>>`, so a locale missing a reader is a
 * compile error. **That matters more here than on the reading path**, and the reading
 * path's own facade already says why: a reading generated with an empty persona block
 * comes back fluent and readable, it just is not Margaret. A *bubble* generated with
 * an empty persona block is worse — it is one of three voices in a room whose whole
 * measurable objective is that the three are three people (`C-N1`), and nothing about
 * the response says which one wrote it.
 *
 * **IF THE THREE READERS EVER STOP BEING DISTINGUISHABLE WITH THE NAMES COVERED, FIX
 * THE PARAGRAPHS IN `readers.id.ts` / `readers.en.ts`, NOT THE CODE.** The instrument
 * is `npm run smoke -- --chat`'s blind read, and it is the release gate.
 */
const BY_LOCALE: Record<Locale, Record<ReaderId, string>> = {
  id: CHAT_READER_PROMPTS_ID,
  en: CHAT_READER_PROMPTS_EN,
};

export function chatReaderPrompt(reader: ReaderId, locale: Locale): string {
  return BY_LOCALE[locale][reader];
}

/** For `prompt.test.ts`, which asserts over all six blocks. */
export const CHAT_READER_PROMPTS: Record<Locale, Record<ReaderId, string>> = BY_LOCALE;
