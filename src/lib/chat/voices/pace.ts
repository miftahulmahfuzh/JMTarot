import type { ReaderId } from '@/data/types';
import { CHAT_LENGTH_BUDGET, MARGARET_MULTIPLIER } from '@/lib/prompt/budget';
import type { Beat, Pace } from '../types';

/**
 * How long the typing indicator runs before the next bubble. **Seam S3, `[R11]`: F3
 * computes it, F1 returns it in `AdvanceReply.next`, F4 waits it out.** Three files, one
 * number.
 *
 * ── `C-R4`: A CONSTANT IS A METRONOME, AND A METRONOME READS AS A BOT ──────
 *
 * Three bubbles exactly 2000ms apart is something no group chat has ever produced, and a
 * person notices it inside four bubbles without being able to say why. So the delay is a
 * function of **the previous bubble's length** — somebody who has just read four
 * sentences takes longer to start typing than somebody who read *"hm"* — **the next
 * reader's temperament**, and **how much that reader is about to write.**
 *
 * ── PURE, AND ITS JITTER IS DERIVED (`[F3-14]`) ────────────────────────────
 *
 * No `Math.random()`. A deterministic jitter still reads as irregular to a person while
 * keeping two smoke runs diffable — `fixedPicks`' argument, and `angleIndexFor`'s. The
 * seed is the beat itself, so the same beat after the same bubble always waits the same
 * time and `npm test` can assert something about the pacing at all.
 *
 * ── WHAT `Pace`'s SIGNATURE DOES NOT CARRY, AND HOW EACH IS RECOVERED ──────
 *
 * F1 owns the signature (`{ next, previousChars }`), and F3's plan §11 wanted three
 * inputs it does not have. Each is recoverable and the recovery is written down, because
 * the alternative was asking F1 to widen a type five files consume:
 *
 *  - **`beatIndex`** — `previousChars === null` IS beat zero. There is no earlier bubble
 *    only when nothing has been said yet, which is exactly when the querent has just
 *    pressed send and is watching.
 *  - **`seed`** — the beat's own fields. Same beat, same wait; different reader, intent,
 *    angle or preceding bubble, different wait.
 *  - **`locale`** — absent, so the expected-length term uses a locale-free base rather
 *    than `chatBudgetFor(locale, reader).maxChars`. The two locales differ by 260 against
 *    240 characters, which is 8% — **inside the ±20% jitter**, and the term it feeds is
 *    an *expectation* of how much the next reader will type, not a ceiling anybody
 *    checks. `MARGARET_MULTIPLIER` is applied here directly so `[F3-11]`'s *"it reaches
 *    `delayMs` too"* stays true.
 */

/** Somebody who was already reading the room replies faster than somebody arriving. */
const BASE_MS = 400;
/** Beat zero: the querent just pressed send and is watching the indicator. */
const FIRST_BEAT_BASE_MS = 250;
/** They had to read the previous bubble before they could react to it. */
const MS_PER_CHAR_READ = 12;

/**
 * **NOT A TYPING RATE, AND SAY SO OR SOMEBODY WILL "CORRECT" IT.** A real phone typist is
 * nearer 300ms a character, and a 120-character bubble would then be thirty-six seconds.
 * This number is tuned so the pause *reads as* somebody typing, which is the only thing
 * the indicator is for.
 */
const MS_PER_CHAR_TYPE = 18;

/** A reader is expected to use about this share of their ceiling. */
const EXPECTED_SHARE = 0.6;

/**
 * The locale-free stand-in for `chatBudgetFor(locale, reader).maxChars`. The mean of the
 * two locales' character guards, because `Pace` carries no locale — see the header.
 */
const EXPECTED_CHARS_BASE = Math.round((CHAT_LENGTH_BUDGET.id.maxChars + CHAT_LENGTH_BUDGET.en.maxChars) / 2);

/**
 * **A SECOND NUMBER ABOUT THE SAME THREE READERS, AND IT IS ALLOWED TO DIFFER FROM
 * `MARGARET_MULTIPLIER`.** *"Writes longer"* and *"answers slower"* are different claims
 * about a person, and collapsing them would tie a pacing decision to a length
 * calibration. Margaret's extra length already reaches this function through her ceiling;
 * this is the additional claim, and `readers.{id,en}.ts` is where it comes from —
 * *"you speak least often and slowest"*, *"you are not competing for a turn"*.
 */
const READER_TEMPO: Record<ReaderId, number> = {
  thessaly: 0.8,
  adrian: 1.0,
  margaret: 1.35,
};

/**
 * **NEVER ZERO.** A bubble that arrives with no pause at all is two messages rendering in
 * one frame, which reads as one long message split by a layout bug rather than as two
 * people speaking — the tell `C-D3` bought the buffering to avoid.
 */
const MIN_MS = 700;
/** Nobody in a group waits half a minute, and the client is holding an indicator. */
const MAX_MS = 6000;

/** ±20%, derived. `[F3-14]`. */
const JITTER = 0.2;

/** FNV-1a, so the jitter is a function of the beat and of nothing else. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Unsigned, then folded into [0, 1).
  return (h >>> 0) / 0x100000000;
}

function seedOf(beat: Beat, previousChars: number | null): string {
  return [beat.reader, beat.to, beat.intent, beat.angle ?? '', beat.replyTo ?? '', previousChars ?? -1].join('|');
}

/**
 * The wait, in milliseconds.
 *
 * **F4 HONOURS IT UNDER `prefers-reduced-motion` TOO**, where the indicator does not
 * animate **but the delay still applies** — it is conversational pacing, not decoration.
 */
export const pace: Pace = ({ next, previousChars }) => {
  const first = previousChars === null;
  const ceiling =
    EXPECTED_CHARS_BASE * (next.reader === 'margaret' ? MARGARET_MULTIPLIER : 1);

  let ms =
    (first ? FIRST_BEAT_BASE_MS : BASE_MS) +
    (previousChars ?? 0) * MS_PER_CHAR_READ +
    ceiling * EXPECTED_SHARE * MS_PER_CHAR_TYPE;

  ms *= READER_TEMPO[next.reader];
  ms *= 1 + JITTER * (hash(seedOf(next, previousChars)) * 2 - 1);

  return Math.round(Math.min(MAX_MS, Math.max(MIN_MS, ms)));
};
