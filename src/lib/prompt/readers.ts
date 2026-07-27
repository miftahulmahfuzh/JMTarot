import type { Locale, ReaderId } from '@/data/types';
import { READER_PROMPTS_EN } from './readers.en';
import { READER_PROMPTS_ID } from './readers.id';

/**
 * The persona layer's facade.
 *
 * `Record<Locale, Record<ReaderId, string>>`, so a locale missing a reader is a
 * compile error. That matters more here than anywhere else in the fork: a reading
 * generated with an empty persona block still comes back fluent and readable, it
 * just is not Margaret -- and nothing about the response says so.
 *
 * IF THE THREE READERS EVER STOP BEING DISTINGUISHABLE WITH THE NAMES COVERED, FIX
 * THE PARAGRAPHS IN `readers.id.ts` / `readers.en.ts`, NOT THE CODE. That
 * instruction is in CLAUDE.md, in the rewrite plan's risk table and in roadmap §10,
 * and it is right all three times.
 */
const BY_LOCALE: Record<Locale, Record<ReaderId, string>> = {
  id: READER_PROMPTS_ID,
  en: READER_PROMPTS_EN,
};

export function readerPrompt(reader: ReaderId, locale: Locale): string {
  return BY_LOCALE[locale][reader];
}
