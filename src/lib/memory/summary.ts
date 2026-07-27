/**
 * The staleness rule behind the per-day reader summary (M13).
 *
 * Pure, and separate from `queries/summary.ts` for the usual reason:
 * `contract.test.ts` requires the handle first in that directory, and this
 * takes a row rather than a connection.
 *
 * It imports `MEMORY_PROMPT_VERSION` rather than restating it. The first draft
 * held a local `'memory-v1'` behind a test seam to avoid the import; that is a
 * duplicated constant that nothing checks, and the failure it produces is
 * silent -- bump the prompt, forget the copy, and every cached summary stays
 * valid forever against a prompt that no longer exists.
 */
import { MEMORY_PROMPT_VERSION } from '@/lib/prompt/summary';

/**
 * The regeneration throttle, in seconds.
 *
 * An environment variable rather than a constant because it is a COST knob, not
 * a product threshold (M15): if the model bill or the visible rewriting becomes
 * a problem it must be adjustable without a deploy.
 *
 * Defensive parsing, like `MEMORY_CHAIN_COUNT`: `Number('')` is 0, which would
 * turn the throttle off entirely for anyone with an empty variable in their
 * `.env` and regenerate on every page load.
 */
export const SUMMARY_MIN_AGE_SECONDS = (() => {
  const raw = process.env.SUMMARY_MIN_AGE_SECONDS;
  if (raw === undefined || raw.trim() === '') return 300;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 300;
})();

export type StaleCheckRow = {
  sourceReadingIds: string[];
  updatedAt: Date;
  promptVersion: string;
};

/**
 * Should this cached summary be regenerated (M13)?
 *
 * TWO CONDITIONS, AND BOTH MUST HOLD: the day now contains a reading the row
 * did not summarize, AND the row is older than the throttle.
 *
 * WHY NOT STALE-WHILE-REVALIDATE, which is the reflex here. The moment the user
 * is watching this component is RIGHT AFTER A READING -- they finish a spread,
 * go back, pick a reader, and the greeting is the first thing they see. A
 * summary that omits the reading they just did reads as forgetful, and
 * forgetful is the single failure a feature whose entire claim is "it remembers
 * you" cannot afford. Serving the stale copy while fixing it behind the
 * response would hit exactly that case every time.
 *
 * The throttle bounds the cost of that choice: at most one generation per
 * (user, reader, day, locale) per `SUMMARY_MIN_AGE_SECONDS`. For a human doing
 * readings minutes apart the summary is current almost always, and the
 * pathological case is twelve calls per reader per day.
 *
 * A PROMPT VERSION CHANGE BYPASSES THE THROTTLE ENTIRELY. The throttle exists to
 * stop the same prompt being re-run over barely-changed inputs; a new prompt is
 * a different question, and every cached answer is to the old one.
 */
export function isStale(row: StaleCheckRow, currentIds: string[], now: Date): boolean {
  if (row.promptVersion !== MEMORY_PROMPT_VERSION) return true;

  const known = new Set(row.sourceReadingIds);
  const hasNew = currentIds.some((id) => !known.has(id));
  if (!hasNew) return false;

  const ageSeconds = (now.getTime() - row.updatedAt.getTime()) / 1000;
  return ageSeconds >= SUMMARY_MIN_AGE_SECONDS;
}
