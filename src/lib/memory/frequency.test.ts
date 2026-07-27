/**
 * The pure half of the frequency verdict: the M3 comparator, the M4 gate and
 * the fingerprint. No database -- the scan itself is covered by
 * `frequency.integration.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  FREQUENCY_GATE,
  fingerprintOf,
  passesGate,
  rankCounts,
  type CardCount,
  type FrequencyResult,
} from './frequency';

function card(cardId: number, count: number, lastSeen: string, reversedCount = 0): CardCount {
  return { cardId, count, lastSeen, reversedCount };
}

/** A result that passes the gate, so each test can break exactly one thing. */
function result(over: Partial<FrequencyResult> = {}): FrequencyResult {
  const ranked = over.ranked ?? [card(8, 5, '2026-07-25'), card(12, 3, '2026-07-24')];
  return {
    window: 'week',
    from: '2026-07-20',
    to: '2026-07-26',
    readings: 7,
    ranked,
    fingerprint: 'unused',
    ...over,
  };
}

describe('the M3 comparator', () => {
  it('ranks by count, descending', () => {
    const ranked = rankCounts([card(1, 2, '2026-07-20'), card(2, 5, '2026-07-20'), card(3, 3, '2026-07-20')]);
    expect(ranked.map((c) => c.cardId)).toEqual([2, 3, 1]);
  });

  it('breaks a count tie by the most recent occurrence', () => {
    // Recency is the tiebreak a human would use.
    const ranked = rankCounts([card(1, 3, '2026-07-20'), card(2, 3, '2026-07-25')]);
    expect(ranked.map((c) => c.cardId)).toEqual([2, 1]);
  });

  it('breaks a three-way tie by card id, ascending', () => {
    // The tiebreak that makes the order TOTAL. Without it the top two can swap
    // between calls, and the fingerprint would then invalidate a cache
    // describing a fact that did not change.
    const ranked = rankCounts([card(9, 3, '2026-07-25'), card(2, 3, '2026-07-25'), card(5, 3, '2026-07-25')]);
    expect(ranked.map((c) => c.cardId)).toEqual([2, 5, 9]);
  });

  it('is deterministic across repeated calls on shuffled input', () => {
    const counts = [card(9, 3, '2026-07-25'), card(2, 3, '2026-07-25'), card(5, 4, '2026-07-20')];
    const a = rankCounts(counts).map((c) => c.cardId);
    const b = rankCounts([...counts].reverse()).map((c) => c.cardId);
    expect(a).toEqual(b);
  });

  it('does not mutate its input', () => {
    // `.sort()` sorts in place; the copy is what stops a caller's array being
    // reordered under it.
    const counts = [card(1, 2, '2026-07-20'), card(2, 5, '2026-07-20')];
    rankCounts(counts);
    expect(counts.map((c) => c.cardId)).toEqual([1, 2]);
  });

  it('handles an empty window', () => {
    expect(rankCounts([])).toEqual([]);
  });
});

describe('the M4 gate', () => {
  it('passes a real pattern', () => {
    expect(passesGate(result())).toBe(true);
  });

  it('fails a user with four readings', () => {
    // Readings, not cards. The negative fixture the plan asks the seed for.
    expect(passesGate(result({ readings: 4 }))).toBe(false);
  });

  it('passes at exactly the minimum reading count', () => {
    expect(passesGate(result({ readings: FREQUENCY_GATE.minReadings }))).toBe(true);
  });

  it('fails when every card appears once', () => {
    const ranked = [card(1, 1, '2026-07-25'), card(2, 1, '2026-07-24'), card(3, 1, '2026-07-23')];
    expect(passesGate(result({ ranked }))).toBe(false);
  });

  it('fails when the top card recurred only twice', () => {
    // Two is a coincidence.
    expect(passesGate(result({ ranked: [card(8, 2, '2026-07-25'), card(12, 2, '2026-07-24')] }))).toBe(false);
  });

  it('fails when the runner-up was seen only once', () => {
    // A "pair" needs a real runner-up. This is the case that would otherwise
    // produce "Strength above The Hanged Man" off a single Hanged Man.
    expect(passesGate(result({ ranked: [card(8, 5, '2026-07-25'), card(12, 1, '2026-07-24')] }))).toBe(false);
  });

  it('fails with only one distinct card, however often it recurred', () => {
    // Implied by minSecondCount, asserted separately so the failure has its own
    // name: a verdict names a PAIR, and one card is a sentence this feature
    // does not write.
    expect(passesGate(result({ ranked: [card(8, 9, '2026-07-25')] }))).toBe(false);
  });

  it('fails an empty window', () => {
    expect(passesGate(result({ readings: 0, ranked: [] }))).toBe(false);
  });
});

describe('the fingerprint', () => {
  const ranked = [card(8, 5, '2026-07-25'), card(12, 3, '2026-07-24')];

  it('is stable for the same facts', () => {
    // The cache depends on this and nothing else.
    expect(fingerprintOf('week', 7, ranked)).toBe(fingerprintOf('week', 7, ranked));
  });

  it('ignores everything below the top two', () => {
    // A third card moving is not a change to a verdict that names two.
    const withTail = [...ranked, card(3, 1, '2026-07-21')];
    expect(fingerprintOf('week', 7, withTail)).toBe(fingerprintOf('week', 7, ranked));
  });

  it('ignores reversedCount and lastSeen', () => {
    // Both are grounding for the prose, not part of the claim being cached.
    const shifted = [card(8, 5, '2026-07-20', 4), card(12, 3, '2026-07-19', 1)];
    expect(fingerprintOf('week', 7, shifted)).toBe(fingerprintOf('week', 7, ranked));
  });

  it('changes when a count moves', () => {
    const moved = [card(8, 6, '2026-07-25'), card(12, 3, '2026-07-24')];
    expect(fingerprintOf('week', 7, moved)).not.toBe(fingerprintOf('week', 7, ranked));
  });

  it('changes when the pair changes', () => {
    const swapped = [card(8, 5, '2026-07-25'), card(13, 3, '2026-07-24')];
    expect(fingerprintOf('week', 7, swapped)).not.toBe(fingerprintOf('week', 7, ranked));
  });

  it('changes when the reading total moves', () => {
    // "Strength five times out of seven readings" and "out of forty" are
    // different claims about the same two cards.
    expect(fingerprintOf('week', 40, ranked)).not.toBe(fingerprintOf('week', 7, ranked));
  });

  it('changes with the window key', () => {
    // The row is keyed by window; without this a `week` fingerprint would
    // validate a `year` row that happens to have the same top two.
    expect(fingerprintOf('year', 7, ranked)).not.toBe(fingerprintOf('week', 7, ranked));
  });

  it('does not collide across a delimiter shift', () => {
    // `8:5,12:3` and `8:5,1:23` must not hash alike -- the separators are what
    // stop counts and ids running together.
    const a = fingerprintOf('week', 7, [card(8, 5, 'x'), card(12, 3, 'x')]);
    const b = fingerprintOf('week', 7, [card(8, 5, 'x'), card(1, 23, 'x')]);
    expect(a).not.toBe(b);
  });

  it('is a hex sha-256', () => {
    expect(fingerprintOf('week', 7, ranked)).toMatch(/^[0-9a-f]{64}$/);
  });
});
