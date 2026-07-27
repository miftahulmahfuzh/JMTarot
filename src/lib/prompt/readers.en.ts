import type { ReaderId } from '@/data/types';

/**
 * The English personas. PLACEHOLDER -- Task 10 writes these, and the plan calls it
 * the single highest-value task in the whole workstream.
 *
 * THE METHOD IS §9.4 AND IT IS NOT OPTIONAL. Each English worked example uses a
 * DIFFERENT CARD AND A DIFFERENT SITUATION from its Indonesian counterpart, and that
 * is the enforcement mechanism rather than a stylistic preference: if the English
 * Thessaly example is about The Tower and a job, it was produced by translating,
 * because that is what the Indonesian one is about. A reviewer can check it in five
 * seconds.
 *
 * The voice RULES are written natively too. Adrian's Indonesian rules license
 * `nggak`, `kayak`, `banget`, `sih`; the English equivalent is not a word list, it
 * is contractions, sentence fragments and the register of a friend texting.
 * Margaret's Indonesian rules forbid slang and abbreviations; her English rules
 * forbid slang, contractions and exclamation marks, and license semicolons and
 * subordination. Each reader keeps their SIGNATURE MOVE and changes its content:
 * Adrian closes on an aphorism in both languages, and it is a different aphorism.
 *
 * The forbidden lists are what hold the three apart at the edges. Without them all
 * three drift to the same mid-register mystic, because that is the average tarot
 * voice in any training set -- and English has far more of that average in it than
 * Indonesian does.
 */
export const READER_PROMPTS_EN: Record<ReaderId, string> = {
  thessaly: `TODO(W6 Task 10): Thessaly's English persona is not written yet.`,
  margaret: `TODO(W6 Task 10): Margaret's English persona is not written yet.`,
  adrian: `TODO(W6 Task 10): Adrian's English persona is not written yet.`,
};
