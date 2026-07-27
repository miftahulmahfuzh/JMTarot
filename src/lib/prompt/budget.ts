import type { Locale, ServiceId } from '@/data/types';

/**
 * The length control, as ONE constant that both the prompt and the check read.
 *
 * WHY THIS IS A MODULE AND NOT A CONST IN `services.ts`: `services.id.ts` and
 * `services.en.ts` interpolate it into their prose, and `services.ts` is the facade
 * that imports both. Putting the type in the facade would make the two locale files
 * import their own importer.
 *
 * THE POINT OF IT EXISTING AT ALL. The Indonesian spread3 prompt used to carry `40`
 * typed in twice and `130` once, and Task 11's smoke assertion would have carried a
 * fourth copy. Four copies of a number that has to be tuned by measurement is how
 * "re-verify the English word counts" becomes a thing nobody does. Now the prompt
 * interpolates these and the smoke script asserts against them, so a mis-calibrated
 * locale shows up as FAILs rather than as long readings nobody measured.
 */
export type LengthBudget = {
  /**
   * The ceiling the model can count as it writes.
   *
   * THIS IS THE LENGTH CONTROL AND `MAX_TOKENS` IS NOT. A whole-reading word budget
   * was tried and did not work: Margaret's persona mandates long sentences with
   * subordinate clauses, and she ran 238-298 words against a stated 140-180 while
   * Adrian obeyed at 128. A per-paragraph ceiling the model can count landed all
   * three at 128-169. If a reader runs over, the fix is this number, not the
   * sentence count -- that is the lesson the Indonesian calibration already paid
   * for.
   */
  maxParagraphWords: number;
  minTotalWords: number;
  maxTotalWords: number;
};

/**
 * "sekitar N kata" / "about N words", for the prose.
 *
 * Derived rather than stored, so there is no fourth number to keep in step with the
 * other three. The Indonesian spread3 prompt said "sekitar 130 kata" and 110-150
 * gives exactly that back, which the fork snapshot proves.
 */
export function midpoint(b: LengthBudget): number {
  return Math.round((b.minTotalWords + b.maxTotalWords) / 2);
}

/**
 * ENGLISH STARTS AT THE SAME NUMBERS AND IS THEN MEASURED (§9.3). It is not a
 * translation of a calibration.
 *
 * None of the Indonesian arithmetic is about English, and it can move in two
 * directions. Indonesian's affixation (`menuliskan`, `pertanyaanmu`) and its lack of
 * contractions mean English is typically 5-15% shorter in WORDS for the same
 * content -- so a 40-word English ceiling is LOOSER, and a model will spend the
 * slack on content rather than stopping early. And Margaret is the one who blew the
 * Indonesian budget, while English gives her more room to run: relative clauses,
 * appositives and semicolons are cheaper in English than their Indonesian
 * equivalents.
 *
 * So: same 40, then measure. If English lands consistently under, tighten to 35 and
 * write down that it was measured.
 *
 * THE INDONESIAN `spread3` BAND IS THE STATED INTENT, NOT THE OBSERVED BEHAVIOUR.
 * CLAUDE.md records Margaret running 312 words there in a control run, against the
 * 128-169 the calibration achieved when it landed. That is a pre-existing regression
 * W5 found and did not own; W6 owns these files, so Task 10 tunes the Indonesian
 * prompt back into this band rather than widening the band to match the drift.
 * Writing the honest target here is what makes the smoke script say so.
 *
 * `daily` and `yesno` are derived from what their prompts already ask for -- two
 * paragraphs of 2-4 sentences, and one of 3-4 -- and are UNVERIFIED until Task 11
 * measures them. They are marked as such rather than presented as calibrated.
 */
export const LENGTH_BUDGET: Record<Locale, Record<ServiceId, LengthBudget>> = {
  id: {
    daily: { maxParagraphWords: 55, minTotalWords: 55, maxTotalWords: 110 },
    spread3: { maxParagraphWords: 40, minTotalWords: 110, maxTotalWords: 150 },
    yesno: { maxParagraphWords: 70, minTotalWords: 35, maxTotalWords: 80 },
  },
  en: {
    daily: { maxParagraphWords: 55, minTotalWords: 55, maxTotalWords: 110 },
    spread3: { maxParagraphWords: 40, minTotalWords: 110, maxTotalWords: 150 },
    yesno: { maxParagraphWords: 70, minTotalWords: 35, maxTotalWords: 80 },
  },
};
