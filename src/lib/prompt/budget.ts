import type { Locale, ReaderId, ServiceId } from '@/data/types';

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
 * THE 40-WORD DEFAULT IS WHAT TWO OF THE THREE READERS FIT. Margaret does not, and
 * `READER_OVERRIDE` below is why -- see its comment; that is measurement, not a
 * widened band.
 *
 * `daily` AND `yesno` WERE UNVERIFIED GUESSES IN TASK 9 AND ARE MEASURED NOW, and the
 * measurement found a defect rather than a number: those two prompts stated a SENTENCE
 * COUNT and no word ceiling at all, so the first `--all` run with the budget asserted
 * for every service produced 27 failures -- the check demanding something the prompt
 * had never asked for. Observed before the fix: daily paragraphs 41-123 words against
 * a 4-sentence limit, yesno 46-130 against 3-4.
 *
 * That is the Indonesian calibration's lesson arriving a third time: A SENTENCE COUNT
 * DOES NOT BIND AND A WORD CEILING DOES. Both prompts now interpolate
 * `maxParagraphWords` and say the word limit wins over the sentence count, exactly as
 * `spread3` does. The numbers below are what two paragraphs and one paragraph of that
 * ceiling come to.
 */
export const LENGTH_BUDGET: Record<Locale, Record<ServiceId, LengthBudget>> = {
  id: {
    // Two paragraphs x 55 = 110; the floor allows a genuinely terse day.
    daily: { maxParagraphWords: 55, minTotalWords: 50, maxTotalWords: 115 },
    spread3: { maxParagraphWords: 40, minTotalWords: 105, maxTotalWords: 155 },
    // One paragraph, so the total IS the paragraph and the band cannot exceed the
    // ceiling. Being short is the shape of the service.
    yesno: { maxParagraphWords: 70, minTotalWords: 30, maxTotalWords: 72 },
  },
  en: {
    daily: { maxParagraphWords: 55, minTotalWords: 50, maxTotalWords: 115 },
    spread3: { maxParagraphWords: 40, minTotalWords: 105, maxTotalWords: 155 },
    yesno: { maxParagraphWords: 70, minTotalWords: 30, maxTotalWords: 72 },
  },
};

/**
 * Per-reader overrides on the default budget.
 *
 * MARGARET IS THE ONLY ENTRY AND SHE IS HERE BECAUSE OF MEASUREMENT, NOT MERCY.
 *
 * Five `--all --fixed` runs across both locales put her spread3 totals at 157, 159,
 * 163, 199 and 200, with individual paragraphs at 38-55. She sits ON the 40-word
 * ceiling and crosses it about half the time, in BOTH languages, which is the
 * signature of a persona doing what it is told rather than a prompt failing: her
 * voice rules mandate "long sentences that carry clauses inside them", and those do
 * not fit 40 words. She is the only reader whose voice mandates them -- Thessaly
 * writes short declaratives and Adrian runs 99-135, consistently UNDER.
 *
 * All three of §4.4's techniques were applied first and are still in the prompt: the
 * limit stated as "N sentences AND M words, whichever comes first", bound explicitly
 * on the long-sentence reader (now licensing ONE sentence rather than two), and
 * restated after the thing that invites elaboration. Those took her from 199 to 157
 * and fixed a consistent paragraph-4 overrun for all three readers. What they did not
 * do -- and cannot -- is make a subordinated English or Indonesian sentence fit in 40
 * words.
 *
 * SO THE CHOICE WAS: keep one shared ceiling and let her fail the check half the
 * time, or say out loud that her budget is different. A check that fails on correct
 * behaviour is a check people learn to ignore, and the smoke script's whole value is
 * that its FAILs mean something. This is the honest version.
 *
 * DELIBERATELY NOT PER-LOCALE. The evidence is symmetric -- 159/200 in Indonesian,
 * 157/163/199 in English -- so one override covers both. A per-locale override would
 * be two numbers where the measurement supports one.
 *
 * DELIBERATELY SPARSE. Two readers use the default and must keep using it: an
 * override per reader is a budget that constrains nobody, and the ceiling is the
 * length control.
 */
const READER_OVERRIDE: Partial<Record<ReaderId, Partial<Record<ServiceId, Partial<LengthBudget>>>>> =
  {
    margaret: {
      // 55 is her observed per-paragraph ceiling across five runs, not a round
      // number. 210 is 4 x 55 rounded down to what she has actually produced.
      spread3: { maxParagraphWords: 55, maxTotalWords: 210 },
    },
  };

/**
 * The budget for one (locale, service, reader), overrides applied.
 *
 * THE ONE FUNCTION BOTH THE PROMPT AND THE CHECK CALL. That is the whole point of
 * this module: the number interpolated into the prose and the number the smoke script
 * asserts against are the same resolved object, so a reader-specific ceiling cannot
 * be in the prompt and absent from the check.
 */
export function budgetFor(locale: Locale, service: ServiceId, reader: ReaderId): LengthBudget {
  return { ...LENGTH_BUDGET[locale][service], ...READER_OVERRIDE[reader]?.[service] };
}
