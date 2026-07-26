/**
 * The nine things onboarding asks, and the pure functions that decide what an
 * answer means.
 *
 * PURE, AND WITH NO IMPORTS OUTSIDE `@/data`. That is a hard constraint, not a
 * preference: `isOnboarded` is the completion predicate, W2's gate reasons about
 * the same fact on the EDGE runtime, and anything this module imported would be
 * dragged there with it. No zod, no crypto, no `@/lib/**`. The route handlers
 * layer validation on top (W3 plan Task 6); this file is what they validate
 * against.
 *
 * WHERE THE SANITIZER IS, AND WHY IT IS NOT HERE. `sanitizeAnswer()` lives in
 * `@/lib/prompt/sanitize` because it knows which delimiters the prompt layer
 * uses, and importing it here would put the whole prompt layer on the edge. The
 * order at the boundary is: zod checks the raw length -> `sanitizeAnswer` strips
 * delimiters and control characters -> `normaliseAnswer` decides skip-vs-answer
 * and validates the closed sets. `normaliseAnswer` re-checks the cap anyway,
 * because it is the last thing between a request body and the database.
 */
import type { Profile } from './types';

/** Mirrors `profiles.onboarding_version`. Bump when the question set changes. */
export const ONBOARDING_VERSION = 1;

/**
 * The cap on one free-text answer, in characters.
 *
 * Chosen against the distillation budget rather than against a database limit:
 * four answers at 500 characters is ~2000 characters of raw material, which is
 * a comfortable input for a call whose output is capped at 600
 * (`LOTUS_MAX_CHARS`). It is also about as much as anyone types into a phone
 * textarea without a reason to.
 *
 * REJECTED, NEVER TRUNCATED. Silently cutting someone off mid-sentence in the
 * middle of describing the worst thing they have witnessed is the wrong
 * failure; the client counts characters and the server refuses.
 */
export const ONBOARDING_MAX_ANSWER_CHARS = 500;

/**
 * The six, in asking order (W3 plan §3).
 *
 * The ORDER IS LOAD-BEARING in two places: `nextUnansweredKey` derives the
 * resume point from it, and `willow_wish` is deliberately last because it
 * points forward, which is where you want someone facing when they walk into a
 * reading.
 *
 * These strings are also `onboarding_answers.question_key`, which carries a
 * CHECK constraint on exactly this set, and they are the second component of
 * the encryption AAD -- so a typo here writes a row nothing can ever decrypt.
 */
export const ONBOARDING_QUESTION_KEYS = [
  'best_thing',
  'worst_thing',
  'most_loved',
  'introversion',
  'color',
  'willow_wish',
] as const;

export type OnboardingQuestionKey = (typeof ONBOARDING_QUESTION_KEYS)[number];

/** The closed set for `color`. Three plates, three taps. */
export const LOTUS_COLORS = ['black', 'white', 'grey'] as const;
export type LotusColor = (typeof LOTUS_COLORS)[number];

/**
 * What the willow wish was FOR, as a closed set the model picks from.
 *
 * Closed rather than free text because this field is for analytics and for
 * grounding, and an open string would be a second copy of the wish itself --
 * which is the one thing the Lotus block must not carry (L11 / §7.5).
 */
export const WISH_KINDS = [
  'kembali',
  'lepas',
  'aman',
  'diakui',
  'bertemu',
  'tahu',
  'lain',
] as const;
export type WishKind = (typeof WISH_KINDS)[number];

/**
 * The introversion scale's step.
 *
 * Exported so `ScaleStep` and `normaliseAnswer` cannot disagree about it. They
 * would: the component needs it for the `<input type="range">` step attribute
 * and the server needs it to round, and a hardcoded 5 in two files is how the
 * slider comes to offer values the server silently moves.
 *
 * 0 is "menyendiri", 100 is "di antara orang. 21 stops is fine on a phone;
 * 101 would make the value meaningless and 5 would make it a radio group.
 */
export const INTROVERSION_STEP = 5;
export const INTROVERSION_MIN = 0;
export const INTROVERSION_MAX = 100;

export type OnboardingAnswer = {
  key: OnboardingQuestionKey;
  /**
   * Plaintext. Only ever exists server-side, between decrypt and distil -- and
   * on the way in, between the request body and `encryptField()`. It is never
   * sent back to a browser, not even to pre-fill a resumed step.
   */
  text: string | null;
  /** Closed-set value: `'black'|'white'|'grey'`, or `'0'`..`'100'` step 5. */
  choice: string | null;
  skipped: boolean;
};

/**
 * Is this question answered with prose the user typed?
 *
 * The distinction matters three times: only free-text answers are encrypted,
 * only free-text answers are wrapped in `<jawaban>` delimiters for the
 * distiller, and roadmap §8 requires only free-text answers to be skippable
 * (the closed two are skippable anyway, per L5).
 */
export function isFreeText(key: OnboardingQuestionKey): boolean {
  return key !== 'introversion' && key !== 'color';
}

/**
 * THE completion predicate (L3).
 *
 * ROW PRESENCE IS NOT COMPLETION. A `profiles` row exists as soon as the facts
 * step is submitted, which is step 1 of 9, and a half-written answer set must
 * never count as onboarded and must never be distilled. `completed_at` is the
 * only thing that says the rite finished.
 *
 * Takes the profile rather than a user id because it must stay callable from
 * the edge and from a client component. The DB read is the caller's.
 */
export function isOnboarded(profile: Profile | null): boolean {
  return profile !== null && profile.completedAt !== null;
}

/**
 * Where a resumed stepper picks up: the first key with no row at all.
 *
 * DERIVED, NEVER STORED. There is no cursor column and there must not be --
 * a stored cursor and the rows it points at are two facts that can disagree,
 * and the disagreement is invisible until someone resumes.
 *
 * "First hole" and not "after the last row": a user who goes back and answers
 * something they skipped leaves a set with a gap, and resuming after the
 * highest index would silently skip the gap forever.
 *
 * Returns null when all six have rows, skipped or not -- which is the signal to
 * show the closing card.
 */
export function nextUnansweredKey(
  recorded: readonly OnboardingQuestionKey[],
): OnboardingQuestionKey | null {
  const have = new Set(recorded);
  return ONBOARDING_QUESTION_KEYS.find((k) => !have.has(k)) ?? null;
}

/** Narrowing guard, for a `question_key` that arrived over the wire. */
export function isOnboardingQuestionKey(value: unknown): value is OnboardingQuestionKey {
  return (
    typeof value === 'string' &&
    (ONBOARDING_QUESTION_KEYS as readonly string[]).includes(value)
  );
}

export type RawAnswer = {
  text?: string | null;
  choice?: string | null;
  skipped?: boolean;
};

/**
 * Turn what the client sent into the row that will be written.
 *
 * THROWS on anything invalid rather than coercing it. This is the boundary
 * where an unparseable closed value has to become a 400: coercing `'merah'` to
 * a colour, or a missing slider value to 50, writes a plausible lie into
 * `traits` that nothing downstream can detect.
 *
 * WHITESPACE-ONLY FREE TEXT IS A SKIP, NOT AN EMPTY STRING (§5). The two are
 * different facts and the difference is visible in a database dump: a skip is
 * `answer_text IS NULL`, and an encrypted empty string is indistinguishable
 * from an encrypted answer. Recording "they declined" as "they answered with
 * nothing" would defeat the point of recording the skip at all.
 */
export function normaliseAnswer(key: OnboardingQuestionKey, raw: RawAnswer): OnboardingAnswer {
  const skip: OnboardingAnswer = { key, text: null, choice: null, skipped: true };

  /*
   * An explicit skip wins over any value that arrived with it. The client should
   * never send both; if it does, honouring the value would store text the user
   * asked not to keep, and that is the one error here with a cost.
   */
  if (raw.skipped === true) return skip;

  if (isFreeText(key)) {
    if (raw.choice != null && raw.choice !== '') {
      throw new Error(`${key} is a free-text question and takes no choice`);
    }

    const text = (raw.text ?? '').trim();
    if (text.length === 0) return skip;
    if (text.length > ONBOARDING_MAX_ANSWER_CHARS) {
      throw new Error(
        `${key} is ${text.length} characters, over the ${ONBOARDING_MAX_ANSWER_CHARS} cap`,
      );
    }
    return { key, text, choice: null, skipped: false };
  }

  // Closed questions carry no prose. Accepting some would put unencrypted
  // user text in `answer_choice`, which is the one column the schema does not
  // treat as sensitive.
  if (raw.text != null && raw.text !== '') {
    throw new Error(`${key} is a closed question and takes no text`);
  }

  const choice = raw.choice;
  if (choice == null || choice === '') {
    throw new Error(`${key} needs a value or an explicit skip`);
  }

  if (key === 'color') {
    if (!(LOTUS_COLORS as readonly string[]).includes(choice)) {
      throw new Error(`unknown colour: ${choice}`);
    }
    return { key, text: null, choice, skipped: false };
  }

  // introversion. Rounded to the step and clamped, so a hand-rolled request
  // cannot put 37 or 250 in a column the distiller reads as a scale position.
  const n = Number(choice);
  if (!Number.isFinite(n)) throw new Error(`introversion is not a number: ${choice}`);
  const stepped = Math.round(n / INTROVERSION_STEP) * INTROVERSION_STEP;
  const clamped = Math.min(INTROVERSION_MAX, Math.max(INTROVERSION_MIN, stepped));
  return { key, text: null, choice: String(clamped), skipped: false };
}
