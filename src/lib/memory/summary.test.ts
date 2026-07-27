/**
 * The M13 staleness rule (W5 plan Task 9).
 *
 * The three-way choice this encodes is the interesting part: never regenerate
 * (the summary says "you drew once today" when you drew four times), always
 * regenerate (one model call per reading per reader, and a summary that visibly
 * rewrites itself every time you tab back), or regenerate on read with a
 * throttle. These tests pin the third.
 */
import { describe, expect, it } from 'vitest';
import { MEMORY_PROMPT_VERSION } from '@/lib/prompt/summary';
import { SUMMARY_MIN_AGE_SECONDS, isStale, type StaleCheckRow } from './summary';

const NOW = new Date('2026-07-26T12:00:00Z');

/** A row written `ageSeconds` ago that summarized `ids`. */
function row(ids: string[], ageSeconds: number, promptVersion = MEMORY_PROMPT_VERSION): StaleCheckRow {
  return {
    sourceReadingIds: ids,
    updatedAt: new Date(NOW.getTime() - ageSeconds * 1000),
    promptVersion,
  };
}

describe('isStale', () => {
  it('is FALSE when there are no new readings, however old the row', () => {
    // Nothing has changed, so there is nothing to regenerate. A summary of an
    // unchanged day does not improve by being written again.
    expect(isStale(row(['a', 'b'], 0), ['a', 'b'], NOW)).toBe(false);
    expect(isStale(row(['a', 'b'], 86_400), ['a', 'b'], NOW)).toBe(false);
  });

  it('is FALSE when there are new readings but the row is inside the throttle', () => {
    // The cost bound. At most one generation per (user, reader, day, locale)
    // per SUMMARY_MIN_AGE_SECONDS.
    expect(isStale(row(['a'], 10), ['a', 'b'], NOW)).toBe(false);
    expect(isStale(row(['a'], SUMMARY_MIN_AGE_SECONDS - 1), ['a', 'b'], NOW)).toBe(false);
  });

  it('is TRUE when there are new readings and the row is outside the throttle', () => {
    expect(isStale(row(['a'], SUMMARY_MIN_AGE_SECONDS), ['a', 'b'], NOW)).toBe(true);
    expect(isStale(row(['a'], SUMMARY_MIN_AGE_SECONDS + 1), ['a', 'b'], NOW)).toBe(true);
  });

  it('needs BOTH conditions, not either', () => {
    // Old but unchanged: not stale. Changed but recent: not stale.
    expect(isStale(row(['a'], 100_000), ['a'], NOW)).toBe(false);
    expect(isStale(row(['a'], 1), ['a', 'b'], NOW)).toBe(false);
  });

  it('is TRUE on a prompt version change, BYPASSING the throttle', () => {
    /*
     * The throttle exists to stop the same prompt being re-run over
     * barely-changed inputs. A new prompt is a different question, and every
     * cached answer is to the old one -- so it must not be held back by a
     * timer, and it must fire even when the day has not changed at all.
     */
    expect(isStale(row(['a'], 0, 'memory-v0'), ['a'], NOW)).toBe(true);
  });

  it('ignores an id the row knows that the day no longer has', () => {
    // Readings are never deleted, so this should not arise -- but a shrinking
    // set is not a reason to regenerate, and treating it as one would loop.
    expect(isStale(row(['a', 'b', 'c'], 100_000), ['a', 'b'], NOW)).toBe(false);
  });

  it('treats an empty cached set with a new reading as stale, once past the throttle', () => {
    expect(isStale(row([], SUMMARY_MIN_AGE_SECONDS), ['a'], NOW)).toBe(true);
  });

  it('does not go stale from clock skew alone', () => {
    // A row written "in the future" by a skewed clock has a negative age. It
    // must not read as older than the throttle.
    expect(isStale(row(['a'], -600), ['a', 'b'], NOW)).toBe(false);
  });

  it('defaults the throttle to five minutes', () => {
    // Asserted so an empty `SUMMARY_MIN_AGE_SECONDS=` in someone's .env, which
    // `Number('')` would turn into 0, is caught here rather than as a surprise
    // model bill.
    expect(SUMMARY_MIN_AGE_SECONDS).toBe(300);
  });
});
