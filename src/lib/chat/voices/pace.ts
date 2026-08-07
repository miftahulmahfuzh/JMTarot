// F3 REPLACES THE BODY OF THIS FILE. See `docs/plans/2026-08-07-chat-voices.md`.
/**
 * How long the typing indicator runs before the next bubble. **Seam S3, `[R11]`: F3
 * computes it, F1 returns it in `AdvanceReply.next`, F4 waits it out.** Three files,
 * one number.
 *
 * ── PURE, AND THAT IS WHY IT IS ITS OWN FILE ──────────────────────────────
 *
 * `voices/prompt.ts` is F3's and reaches the context assembler and therefore the
 * database; this must stay drivable by `npm test`, because the property worth checking
 * — *is it a function of anything at all?* — is exactly the one a mocked integration
 * test would not notice.
 *
 * ── `C-R4`: A CONSTANT IS A METRONOME, AND A METRONOME READS AS A BOT ─────
 *
 * The delay is a function of **the previous bubble's length** (a person who has just
 * read four sentences takes longer to start typing than one who read *"hm"*) and **the
 * next reader's temperament**. Both inputs are here in the placeholder, deliberately:
 * a stub that returned `1200` would be the metronome, and the first thing anybody
 * would do with it is ship it.
 *
 * **F4 HONOURS IT UNDER `prefers-reduced-motion` TOO**, where the indicator does not
 * animate **but the delay still applies** — it is conversational pacing, not
 * decoration.
 *
 * ── WHAT F3 OWNS AND WHAT IT MUST KEEP ────────────────────────────────────
 *
 *  - The numbers, the curve, and whatever it measures them against.
 *  - **The signature**, which is `Pace` in `../types` and which `run.ts` calls.
 *  - **A floor above zero.** A bubble that arrives with no pause at all is two
 *    messages rendering in one frame, which reads as one long message split by a
 *    layout bug rather than as two people speaking.
 */
import { READERS } from '@/data/readers';
import type { Pace } from '../types';

/**
 * A rough reading speed, in characters per millisecond — the *previous* bubble is what
 * the next reader is reacting to, so the wait is mostly "time to have read it".
 */
const CHARS_PER_MS = 0.06;

/** Nobody replies instantly, and nobody in a group waits half a minute. */
const FLOOR_MS = 700;
const CEILING_MS = 6000;

/**
 * **A PLACEHOLDER SHAPED LIKE THE REAL THING.** The temperament term is derived from
 * the reader's position in `READERS` rather than from a table F3 has not written yet —
 * so it is stable, distinct per reader, and obviously provisional.
 */
export const pace: Pace = ({ next, previousChars }) => {
  const reading = (previousChars ?? 0) / CHARS_PER_MS / 10;
  const temperament = 1 + READERS.findIndex((r) => r.id === next.reader) * 0.25;
  const ms = (FLOOR_MS + reading) * temperament;
  return Math.round(Math.min(CEILING_MS, Math.max(FLOOR_MS, ms)));
};
