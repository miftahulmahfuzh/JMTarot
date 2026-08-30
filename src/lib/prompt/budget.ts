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
/**
 * EVERY NUMBER HERE CAME DOWN 30% ON 2026-07-29, AND IT IS MIFTAH'S RULING ON A
 * PHONE: the readings were too long to read on the device this app is built for.
 *
 * The previous values are kept in the table below rather than only in git,
 * because the calibration comments above and in `READER_MULTIPLIER` cite them by
 * value -- "she sits ON the 40-word ceiling", "157, 159, 163, 199 and 200" -- and
 * a reader who cannot find 40 anywhere concludes those comments are stale.
 *
 *            was  ->  now        was      ->  now         was      ->  now
 *   daily     55  ->   39      50-115     ->  35-81
 *   spread3   40  ->   28     105-155     ->  74-109
 *   yesno     70  ->   49      30-72      ->  21-50
 *
 * **THE FLOOR SCALED TOO, AND IT HAD TO.** Leaving `spread3` at a 105-word floor
 * under a 4 x 28 = 112 ceiling leaves a seven-word band, so the smoke script
 * would FAIL on output that obeyed the prompt exactly -- which `READER_MULTIPLIER`
 * below says in its own words is the one thing a check must never do. Scaling one
 * end of a band is not shortening it, it is narrowing it.
 *
 * **FOUR PARAGRAPHS SURVIVED, WHICH WAS THE ACTUAL DECISION.** Dropping the
 * synthesis paragraph would have bought `spread3` ~36 words each instead of 28
 * and was offered and refused: `services.id.ts` forbids it in its own voice --
 * *"EMPAT paragraf, bukan tiga. Paragraf keempat wajib ada; tanpa penyatuan itu,
 * bacaan ini cuma tiga keterangan kartu yang berdiri sendiri."* A shorter reading
 * that is three unconnected card notes is not a shorter reading, it is a
 * different and worse one.
 *
 * **THE SENTENCE COUNTS CAME DOWN WITH THEM**, in `services.{id,en}.ts` -- spread3
 * 2-3 to 1-2, daily 2-4 to 2-3, yesno 3-4 to 2-3. A sentence count that cannot be
 * met inside the word ceiling is noise in the prompt, and this file's whole
 * argument is that the ceiling is the control.
 *
 * `MAX_TOKENS` IS DELIBERATELY UNCHANGED -- see `services.ts`. Those are runaway
 * guards at roughly double the target, and lowering them buys nothing while making
 * the `gpt-5.6-luna` blank-reading failure worse.
 *
 * **28 MAY READ CLIPPED AND THAT IS THE OPEN QUESTION, not whether the ruling was
 * right.** The English `spread3` calibration was already unconverged at 157-243
 * words; this moved the target without converging it. The instrument is the blind
 * read at the end of `npm run smoke -- --all`: if the three readers stop being
 * distinguishable at 28 words, the fix is the persona paragraphs, not this number.
 */
export const LENGTH_BUDGET: Record<Locale, Record<ServiceId, LengthBudget>> = {
  id: {
    // Two paragraphs x 39 = 78; the floor allows a genuinely terse day.
    daily: { maxParagraphWords: 39, minTotalWords: 35, maxTotalWords: 81 },
    spread3: { maxParagraphWords: 28, minTotalWords: 74, maxTotalWords: 109 },
    // One paragraph, so the total IS the paragraph and the band barely exceeds
    // the ceiling. Being short is the shape of the service.
    yesno: { maxParagraphWords: 49, minTotalWords: 21, maxTotalWords: 50 },
  },
  en: {
    daily: { maxParagraphWords: 39, minTotalWords: 35, maxTotalWords: 81 },
    spread3: { maxParagraphWords: 28, minTotalWords: 74, maxTotalWords: 109 },
    yesno: { maxParagraphWords: 49, minTotalWords: 21, maxTotalWords: 50 },
  },
};

/**
 * MARGARET MAY BE 30% LONGER THAN THE OTHER TWO (VD19, Miftah's ruling).
 *
 * THIS CLOSES THE OPEN QUESTION THIS FILE HAS CARRIED SINCE W6 — "whether
 * Margaret is allowed to be longer than the other two" — and it closes it in the
 * one place a ceiling is written, because V3 reopened the same question from a
 * second direction with the day summary.
 *
 * A MULTIPLIER AND NOT A SECOND HAND-SET NUMBER, and the difference is the
 * reason rather than the arithmetic. Her extra length is a fact about the
 * READER: her voice rules mandate "long sentences that carry clauses inside
 * them", and that is equally true in every service she speaks in. A hand-set
 * `spread3: 55` said it about one service and left `daily` and `yesno` claiming
 * she fits 55 and 70 with no evidence either way.
 *
 * 1.3 IS CLOSE TO WHAT WAS ALREADY MEASURED, which is why it is credible rather
 * than round: the old override was 55 against a base of 40, i.e. 37.5%, derived
 * from five `--all --fixed` runs putting her spread3 paragraphs at 38-55 in both
 * locales. So `spread3` moved 55 -> 52 and the other two gained a ceiling that
 * matches how she actually writes.
 *
 * **THE MULTIPLIER DID NOT MOVE IN THE 30% CUT AND MUST NOT.** Her extra length is
 * a fact about the READER, so it scales WITH the base rather than against it:
 * `spread3` is now 28 x 1.3 = 36, `daily` 51, `yesno` 64, and her spread3 total
 * ceiling 142. Scaling 1.3 down as well would cut her twice and make her the only
 * reader shortened by more than the ruling asked for -- which, since she is the
 * one reader whose voice rules mandate subordinated sentences, is the reader it
 * would break first. **36 IS THE NUMBER TO WATCH** in the next `--all` run.
 *
 * IT APPLIES TO CEILINGS ONLY. `minTotalWords` is a floor and a floor scaled by
 * a reader's verbosity would demand length rather than permit it.
 *
 * THE FREQUENCY VERDICT IS HOUSE VOICE AND IS UNAFFECTED (VD19). The day
 * summary is NOT house voice — it is `readerPrompt()` verbatim — so
 * `SUMMARY_MAX_WORDS` in `prompt/summary.ts` reads this constant too, and 50
 * becomes 65 for her and nobody else.
 *
 * THIS FIXES WHAT THE CEILING SHOULD BE, NOT WHETHER SHE OBEYS IT. The English
 * spread3 calibration is still unconverged at 157-243 words across runs.
 */
export const MARGARET_MULTIPLIER = 1.3;

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
 *
 * V3 REPLACED THE HAND-SET NUMBERS WITH `MARGARET_MULTIPLIER` (VD19). The table
 * is kept because the next override may well not be a scalar -- but it is empty,
 * and an empty table is the honest way to say "one rule covers the only case".
 */
const READER_MULTIPLIER: Partial<Record<ReaderId, number>> = {
  margaret: MARGARET_MULTIPLIER,
};

/**
 * The budget for one (locale, service, reader), the reader's multiplier applied.
 *
 * THE ONE FUNCTION BOTH THE PROMPT AND THE CHECK CALL. That is the whole point of
 * this module: the number interpolated into the prose and the number the smoke script
 * asserts against are the same resolved object, so a reader-specific ceiling cannot
 * be in the prompt and absent from the check.
 *
 * `Math.round` and not `Math.ceil`, so the multiplier is a scaling and not a
 * quiet extra word. `minTotalWords` is untouched: see `MARGARET_MULTIPLIER`.
 */
export function budgetFor(locale: Locale, service: ServiceId, reader: ReaderId): LengthBudget {
  const base = LENGTH_BUDGET[locale][service];
  const k = READER_MULTIPLIER[reader];
  if (k === undefined) return { ...base };
  return {
    maxParagraphWords: Math.round(base.maxParagraphWords * k),
    minTotalWords: base.minTotalWords,
    maxTotalWords: Math.round(base.maxTotalWords * k),
  };
}

/**
 * THE CHAT BUBBLE'S CEILING (`C-D19`, v0.7.0). A SECOND TABLE, NOT A ROW IN
 * `LENGTH_BUDGET`, because `ServiceId` is a closed union tied to `SERVICES` — every
 * member has a card count, a picker tile and a task prompt, and a chat bubble has
 * none of the three. `LengthBudget.maxParagraphWords` is also meaningless for
 * something that is one paragraph by definition.
 *
 * `C-D19` says *"chat budgets join that table"*; they join the FILE, and the file is
 * what the decision is actually about. **WHAT DOES JOIN IS THE MECHANISM:** one place
 * a ceiling is written, interpolated into the prompt, asserted by the smoke script,
 * with `MARGARET_MULTIPLIER` applied by one resolver — so the number in the prose and
 * the number in the check cannot drift.
 */
export type ChatLengthBudget = {
  /** THE LENGTH CONTROL. The model can count it as it writes. */
  maxWords: number;
  /**
   * THE FLOOR, AND IT IS ZERO IN BOTH LOCALES ON PURPOSE (`C-D19`, `[F3-10]`).
   *
   * **`validateTurn` HAS NO FLOOR BRANCH AT ALL.** *"wkwk"*, *"iya sih"* and *"hm"*
   * are how a group chat actually reads, and a floor that forbids them makes three
   * readers who each deliver a paragraph — **the single most chatbot-like failure
   * available to this release.** The constant exists at `0` rather than being absent
   * so that raising it is a visible edit rather than an addition nobody reviews.
   */
  minWords: 0;
  /**
   * A RUNAWAY GUARD FOR `validateTurn`, IN CHARACTERS. Not the length control — the
   * same relationship `PERSONA_MAX_CHARS` has to `PERSONA_MAX_WORDS`.
   *
   * **THE TWO LOCALES DIFFER HERE AND NOT IN `maxWords`**: Indonesian affixation
   * makes the same word count longer in characters, and the character-per-word ratio
   * is the one thing that genuinely differs between the two languages.
   */
  maxChars: number;
};

/**
 * **WHY 22.** `spread3`'s per-paragraph ceiling is 28 after the 2026-07-29 cut, and
 * that is one of four paragraphs of a *reading* — denser than a chat message and read
 * as prose. A 28-word bubble at 390px is four lines and reads as a paragraph, which
 * is the tell `C-D19` names. 22 is roughly two lines. `daily`'s 39 and `yesno`'s 49
 * are further away still.
 *
 * **WHY ENGLISH STARTS AT THE SAME 22.** This file's own rule, verbatim: *"ENGLISH
 * STARTS AT THE SAME NUMBERS AND IS THEN MEASURED. It is not a translation of a
 * calibration."*
 *
 * **UNCALIBRATED UNTIL `npm run smoke -- --chat` HAS RUN THREE TIMES**, and the rule
 * above applies: if the first run fails on a band, that is data, not a bug. The
 * number moves once, on evidence, and the evidence is written into
 * `docs/workstream-notes.md`.
 *
 * ── IT RAN THREE TIMES ON 2026-08-09, AND `en` MOVED 24 → 27 ────────────────
 *
 * **THE EVIDENCE IS MARGARET AND ONLY MARGARET.** Her English bubbles across three
 * runs of the release gate came in at **25, 26, 27, 29, 31, 31 words against a
 * resolved ceiling of 31** — and **two of the three runs LOST a bubble to it**,
 * `too_long`, refused twice and dropped. The two casualties were the
 * reader-to-reader probe and a `push_back`: `C-N1a`'s *"they answer each other"*,
 * which is the most distinctive mechanic this release has. The `id` half never
 * failed once and its maximum was 21.
 *
 * So this is `validateTurn`'s own bias arriving as a measurement: **a false
 * rejection costs a bubble and makes the room quieter, which is the failure this
 * release cannot afford.** 27 resolves Margaret to 35, which clears every observed
 * bubble including the two refused ones (~32–35).
 *
 * **`maxChars` DID NOT MOVE, BECAUSE IT WAS NEVER THE BINDING CONSTRAINT** — her
 * longest stored English bubble was 164 characters against 312. The refusals were on
 * WORDS, and moving both would have been a change with evidence for half of it.
 *
 * **AND `id` DID NOT MOVE EITHER.** The two locales are allowed to differ here now,
 * which the header above said they would not — *"the two locales differ in `maxChars`
 * and not in `maxWords`"* was a prediction about where the difference would show up,
 * and the measurement put it in the other column. English carries the same thought in
 * more, shorter words; the ratio the header names is real and points this way.
 * **Nothing about the `id` band is a reason to touch it, and scaling it "to match"
 * would be exactly the unevidenced half this note refuses.**
 *
 * ── THE ROOM GETS LOUDER BY BEATS, NEVER BY WORDS (2026-08-30) ─────────────
 *
 * The naturalness card asked for jokes, insight, mutual support and *"whatever means
 * necessary"*, under a ruling that says to spend tokens freely — and the obvious place to
 * spend them is here. **It was refused, deliberately, and this paragraph is the record.**
 *
 *  1. **A longer bubble is the chatbot tell this budget exists to prevent.** `C-D19` and
 *     `[F3-25]`: three readers each delivering a paragraph is the named worst outcome, and
 *     `--chat`'s brevity floor is the only check in this repository that FAILS on output
 *     being consistently too long rather than once. Raising `maxWords` would move that
 *     floor's ceiling and switch the instrument off in the same commit.
 *  2. **`CHAT_MAX_BEATS` is the correct lever and it moved instead**, 6 -> 8. Eight
 *     twenty-four-word bubbles is far more room than four thirty-six-word ones AND it is
 *     more people, which is the actual ask.
 *  3. **The last movement here was evidenced and this one would not be.** `en` went 24 ->
 *     27 on six measured Margaret bubbles and two lost to `too_long`; there is no
 *     equivalent measurement for 2026-08-30, and this file's own rule is that a band moves
 *     once, on evidence, written into `docs/workstream-notes.md`.
 *
 * **If a future run shows bubbles being refused `too_long` at a rate that costs the room
 * its beats, that is the evidence — move `en` or `id` then, one at a time, and never
 * "to match".**
 */
export const CHAT_LENGTH_BUDGET: Record<Locale, ChatLengthBudget> = {
  id: { maxWords: 24, minWords: 0, maxChars: 260 },
  en: { maxWords: 27, minWords: 0, maxChars: 240 },
};

/**
 * THE ONE FUNCTION BOTH THE CHAT PROMPT AND `validateTurn` CALL. `budgetFor`'s rule,
 * and the reason is the same: a reader-specific ceiling cannot be in the prompt and
 * absent from the check.
 *
 * **`MARGARET_MULTIPLIER` REACHES THE CEILINGS AND NOT THE FLOOR** (`[F3-11]`, VD19).
 * Her extra length is a fact about the READER — *"long sentences that carry clauses
 * inside them"* — and that is equally true in a group chat, so 22 becomes 29 and 260
 * becomes 338. **It reaches the pace too**, through the resolved `maxChars`, so she is
 * visibly slower without a second number claiming it.
 *
 * The non-application to `minWords` is currently vacuous because the floor is zero,
 * **and writing the rule anyway is the point**: the day somebody raises the floor
 * they will otherwise scale it, which `MARGARET_MULTIPLIER`'s header says would
 * *"demand length rather than permit it"*.
 */
export function chatBudgetFor(locale: Locale, reader: ReaderId): ChatLengthBudget {
  const base = CHAT_LENGTH_BUDGET[locale];
  const k = READER_MULTIPLIER[reader];
  if (k === undefined) return { ...base };
  return {
    maxWords: Math.round(base.maxWords * k),
    minWords: 0,
    maxChars: Math.round(base.maxChars * k),
  };
}

/**
 * The output ceiling for one `chat_turn` call. `MAX_TOKENS`' relationship to
 * `LENGTH_BUDGET`, in the chat: **a runaway guard, not the length control.**
 *
 * Deliberately generous relative to the target so a model finishes its sentence rather
 * than being cut mid-clause — the `gpt-5.6-luna` blank-reading failure is what a tight
 * output ceiling buys — and deliberately tiny in absolute terms, because `C-D6` makes the
 * chat's call budget scarce and the output half is the only half this layer controls.
 *
 * ── 220 SINCE 2026-08-30. IT WAS 90, AND 90 WAS THE LENGTH CONTROL ────────
 *
 * **THE "ROUGHLY DOUBLE MARGARET'S WORDS" ARITHMETIC WAS DONE IN ENGLISH AND IS FALSE IN
 * INDONESIAN, WHICH IS THE SOURCE LOCALE.** English runs about 1.4 tokens to the word, so
 * Margaret's resolved `en` ceiling of 35 words is ~49 tokens and 90 genuinely was double.
 * **`id` runs 2.2–3.1 tokens to the word on `glm-5.2`** (measured over one `--chat` run:
 * 15w/33t, 8w/18t, 17w/52t), so her resolved `id` ceiling of 31 words is 68–96 tokens —
 * **at or above the old ceiling for ONE bubble, and `[R19]` lets a beat write TWO.**
 *
 * **IT WAS CAUGHT BY OUTPUT, NOT BY READING.** The 2026-08-30 naturalness rewrite told
 * Margaret to stay long even when she agrees, and the very next run stored
 * *"…karena dua hal yang kat"* — `out=90`, cut mid-WORD, at THIRTEEN words against a
 * thirty-one-word ceiling. Adrian's next beat then joked about her being cut off, so the
 * defect propagated into the room as content.
 *
 * **AND A TOKEN CEILING IS STRICTLY WORSE THAN A WORD CEILING, WHICH IS THE WHOLE POINT.**
 * `validateTurn`'s `too_long` refuses an over-long bubble and `C-R7` retries it; a bubble
 * cut here is never refused, because it arrives short. **The word ceiling is the length
 * control and it works; this number must never be close enough to bind before it.**
 *
 * 220 is two full-ceiling `id` Margaret bubbles (~192) plus headroom, and still under a
 * quarter of `PLAN_MAX_TOKENS`. **`PLAN_MAX_TOKENS`' rule, in a second place: a cap on
 * length and a cap on output tokens are the same edit — grep for the second whenever the
 * first moves**, and 2026-08-30 moved both.
 */
export const CHAT_MAX_TOKENS = 220;
