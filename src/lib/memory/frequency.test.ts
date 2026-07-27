/**
 * The pure half of the frequency verdict: the M3 comparator, the M4 gate and
 * the fingerprint. No database -- the scan itself is covered by
 * `frequency.integration.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  FREQUENCY_GATE,
  dominanceOf,
  fingerprintOf,
  passesGate,
  rankCounts,
  verdictCacheState,
  type CardCount,
  type FrequencyResult,
} from './frequency';
import { shadowFor } from './shadow';
import { reduce } from '@/lib/numerology';

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

/**
 * V3 Task 3. THE FINGERPRINT IS STILL SUFFICIENT AFTER V3, AND THIS IS THE
 * PROOF RATHER THAN THE COMMENT.
 *
 * V3 derives three new values from the ranked pair -- the Shadow Arcana, the
 * pulse and the dominance bucket -- and every input to all three (`a.cardId`,
 * `b.cardId`, `m`, `n`) is already inside `fingerprintOf`. So:
 *
 *     fingerprint unchanged  =>  (a.cardId, b.cardId, m, n) unchanged
 *                            =>  shadow, pulse and dominance unchanged.
 *
 * THE IMPLICATION HOLDS BECAUSE ALL THREE ARE PURE FUNCTIONS OF HASHED INPUTS
 * AND FOR NO OTHER REASON, which is why this is a test and not a sentence in a
 * header. `reversedCount` and `lastSeen` are both sitting on `CardCount`,
 * neither is hashed, and the old prompt used `reversedCount` -- so deriving
 * anything from either would silently start serving a cached line that
 * describes a fact which has since changed. The negative control below is that
 * trap, written down.
 */
describe('the fingerprint covers V3’s derived values', () => {
  const derive = (a: number, m: number, b: number, n: number) => ({
    shadow: shadowFor(a, b).card.id,
    pulse: reduce(m + n),
    dominance: dominanceOf(m, n),
  });

  it('equal fingerprints imply equal shadow, pulse and dominance', () => {
    const seen = new Map<string, ReturnType<typeof derive>>();
    let checked = 0;

    for (let i = 0; i < 240; i += 1) {
      // A deterministic spread over the space -- no Math.random, so a failure
      // reproduces. Coprime strides keep the four fields from moving in step.
      const a = i % 22;
      const b = (i * 7 + 3) % 22;
      if (a === b) continue;
      const m = 3 + (i % 9);
      const n = 2 + (i % 5);
      if (n > m) continue;
      const readings = 5 + (i % 30);
      const window = (['week', 'month', 'year'] as const)[i % 3];

      const ranked: CardCount[] = [
        card(a, m, '2026-07-25', i % 3),
        card(b, n, '2026-07-24', 0),
      ];
      const fp = fingerprintOf(window, readings, ranked);
      const values = derive(a, m, b, n);

      const before = seen.get(fp);
      if (before) expect(values, fp).toEqual(before);
      else seen.set(fp, values);
      checked += 1;
    }

    expect(checked).toBeGreaterThan(150);
  });

  it('NEGATIVE CONTROL: a value derived from reversedCount survives a fingerprint change', () => {
    /*
     * `reversedCount` is on `CardCount`, is a live temptation (the pre-V3 prompt
     * printed it), and is NOT in the hash. Two results that differ only there
     * fingerprint identically -- so anything derived from it would be cached
     * against a fact that has moved. That is the failure this whole describe
     * block exists to make loud, and it is asserted here rather than described.
     */
    const a = [card(8, 5, '2026-07-25', 0), card(12, 3, '2026-07-24', 0)];
    const b = [card(8, 5, '2026-07-25', 4), card(12, 3, '2026-07-24', 2)];

    expect(fingerprintOf('week', 7, a)).toBe(fingerprintOf('week', 7, b));
    // ...while the tempting derived value plainly differs.
    expect(a[0].reversedCount).not.toBe(b[0].reversedCount);
  });

  it('a change to either count or either card DOES move the fingerprint', () => {
    const base = [card(8, 5, '2026-07-25'), card(12, 3, '2026-07-24')];
    const fp = fingerprintOf('week', 7, base);
    expect(fingerprintOf('week', 7, [card(8, 6, '2026-07-25'), base[1]])).not.toBe(fp);
    expect(fingerprintOf('week', 7, [base[0], card(12, 4, '2026-07-24')])).not.toBe(fp);
    expect(fingerprintOf('week', 7, [card(9, 5, '2026-07-25'), base[1]])).not.toBe(fp);
  });
});

/**
 * V3 Task 4. The cache-validity bug, which was live and which the bump alone
 * would not have fixed.
 *
 * `route.ts` used to write `fresh || stillTrue` with the version check on the
 * SECOND operand only. These cases are the ones that failed before the fix; the
 * first of them is the entire release, because a user whose window has not
 * moved since their last visit is the common case by design and was being served
 * a `memory-v1` tally forever.
 */
describe('verdictCacheState', () => {
  const V = 'memory-v2';
  const r = result({
    ranked: [card(8, 5, '2026-07-25'), card(12, 3, '2026-07-24')],
    fingerprint: 'fp-now',
  });
  const row = (over: Partial<Parameters<typeof verdictCacheState>[0] & object> = {}) => ({
    fingerprint: 'fp-now',
    promptVersion: V,
    topCardId: 8,
    secondCardId: 12,
    ...over,
  });

  it('serves a row whose fingerprint and version both match, with no model call', () => {
    expect(verdictCacheState(row(), r, V)).toBe('fresh');
  });

  it('DOES NOT SERVE A MATCHING-FINGERPRINT ROW FROM THE PREVIOUS PROMPT VERSION', () => {
    // The bug, named. Before the fix this returned the equivalent of `fresh`.
    expect(verdictCacheState(row({ promptVersion: 'memory-v1' }), r, V)).toBe('stale');
  });

  it('does not fall back to still-true for an old-version row that names the right pair', () => {
    /*
     * The `still-true` branch exists because "the sentence is still TRUE, just
     * slightly out of date". A `memory-v1` sentence is not still true -- it is
     * the tally this release exists to delete -- so it must not be served even
     * once, not even while a replacement generates behind it.
     */
    expect(
      verdictCacheState(row({ promptVersion: 'memory-v1', fingerprint: 'fp-old' }), r, V),
    ).toBe('stale');
  });

  it('serves the cached line and regenerates when only the counts moved', () => {
    expect(verdictCacheState(row({ fingerprint: 'fp-old' }), r, V)).toBe('still-true');
  });

  it('refuses a row naming a pair the window no longer has at the top', () => {
    expect(verdictCacheState(row({ fingerprint: 'fp-old', secondCardId: 3 }), r, V)).toBe('stale');
  });

  it('is stale when there is no row', () => {
    expect(verdictCacheState(null, r, V)).toBe('stale');
  });
});
