/**
 * Digit reduction and the master-number rule (roadmap §5 as amended by
 * reconciliation §5.3, V1 plan §2.2).
 *
 * Every row of the trace table in the plan is a named test here, because the
 * halt placement is invisible in the implementation and load-bearing for every
 * number the app derives.
 *
 * THE PLAN'S TABLE ASSERTED `reduce(11) === 2` AND RECONCILIATION §5.3 INVERTED
 * IT. The roadmap originally said master numbers survive only as a *sum*, never
 * as an input; V1 implemented that literally and surfaced what it costs —
 * November would contribute 2 to a life path while the 29th contributes 11, so
 * no November-born person could reach a master life path through their month.
 * The rule is now: repeatedly sum the digits, halting at 11, 22 or 33. `reduce`
 * is idempotent and the masters are fixed points.
 */
import { describe, expect, it } from 'vitest';
import { MASTER_NUMBERS, isGlossNumber, isMaster, reduce, reduceToGloss } from './reduce';

describe('reduce', () => {
  it('passes single digits through untouched', () => {
    for (let n = 0; n <= 9; n++) expect(reduce(n)).toBe(n);
  });

  it('halts on 11 when a summing step lands there: reduce(29) === 11', () => {
    expect(reduce(29)).toBe(11);
    expect(reduce(38)).toBe(11);
    expect(reduce(92)).toBe(11);
  });

  it('does NOT halt on 12, so reduce(39) === 3', () => {
    // 39 -> 12 -> 3. Twelve is not a master number and the loop must continue.
    expect(reduce(39)).toBe(3);
  });

  it('halts on 22 and on 33', () => {
    expect(reduce(499)).toBe(22);
    expect(reduce(6999)).toBe(33);
  });

  it('reduce(0) is 0 — there is nothing to sum (N2)', () => {
    expect(reduce(0)).toBe(0);
  });

  it('KEEPS A MASTER NUMBER GIVEN AS AN INPUT (reconciliation §5.3). November is 11.', () => {
    // The amended rule: 11, 22 and 33 are FIXED POINTS. The plan's original
    // table said 2, 4 and 6 here, and reconciliation §5.3 killed that wording
    // because it made a November birth month unable to reach a master life
    // path. This is the test that stops someone restoring the old asymmetry.
    expect(reduce(11)).toBe(11);
    expect(reduce(22)).toBe(22);
    expect(reduce(33)).toBe(33);
    // And the half that never changed, so the pair is visible together:
    expect(reduce(29)).toBe(11);
  });

  it('is idempotent everywhere, masters included', () => {
    for (let n = 0; n < 2000; n++) {
      const once = reduce(n);
      expect(reduce(once)).toBe(once);
    }
  });

  it('never returns anything outside 0..9 plus the masters', () => {
    const allowed = new Set<number>([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, ...MASTER_NUMBERS]);
    for (let n = 0; n < 5000; n++) expect(allowed.has(reduce(n))).toBe(true);
  });

  it('throws a RangeError on anything that is not a non-negative safe integer (N3)', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => reduce(bad)).toThrow(RangeError);
    }
  });
});

describe('reduceToGloss', () => {
  it('is null only for 0', () => {
    expect(reduceToGloss(0)).toBeNull();
    for (let n = 1; n < 500; n++) expect(reduceToGloss(n)).not.toBeNull();
  });

  it('agrees with reduce everywhere it is not null', () => {
    for (let n = 1; n < 500; n++) expect(reduceToGloss(n)).toBe(reduce(n));
  });

  it('isGlossNumber rejects 0 and 10 and accepts the masters', () => {
    expect(isGlossNumber(0)).toBe(false);
    expect(isGlossNumber(10)).toBe(false);
    expect(isGlossNumber(11)).toBe(true);
    expect(isGlossNumber(33)).toBe(true);
  });

  it('isMaster is exactly the three', () => {
    for (let n = 0; n <= 40; n++) {
      expect(isMaster(n)).toBe(n === 11 || n === 22 || n === 33);
    }
  });
});
