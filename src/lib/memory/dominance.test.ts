/**
 * V3 Task 2. The dominance bucket (V3-5), which is a RATIO and not a difference.
 */
import { describe, expect, it } from 'vitest';
import { dominanceOf, FREQUENCY_GATE } from './frequency';

describe('dominanceOf', () => {
  it('is tied when the two counts are equal', () => {
    expect(dominanceOf(3, 3)).toBe('tied');
    expect(dominanceOf(9, 9)).toBe('tied');
  });

  it.each([
    [3, 2, 'narrow'],
    [4, 3, 'narrow'],
    [4, 2, 'overwhelming'],
    [5, 3, 'clear'],
    [5, 2, 'overwhelming'],
    [7, 5, 'clear'],
    [6, 4, 'clear'],
    [10, 8, 'narrow'],
    [12, 4, 'overwhelming'],
  ] as const)('%i over %i is %s', (m, n, expected) => {
    expect(dominanceOf(m, n)).toBe(expected);
  });

  it('IS A RATIO AND NOT A DIFFERENCE — 10:8 is narrow while 4:2 is overwhelming', () => {
    /*
     * Both in one test on purpose. A refactor back to `m - n` passes every other
     * case in this file and fails exactly here: 10 - 8 = 2 would call the first
     * pair the wider of the two, and "twice as often" means the same thing at
     * 4:2 as at 20:10.
     */
    expect(dominanceOf(10, 8)).toBe('narrow');
    expect(dominanceOf(4, 2)).toBe('overwhelming');
  });

  it('treats one extra appearance as narrow however large the counts are not', () => {
    // The absolute floor. 3 over 2 is a ratio of 1.5, which the ratio alone
    // would call `clear`, and one extra appearance out of five readings is not a
    // clear anything.
    expect(dominanceOf(3, 2)).toBe('narrow');
    expect(dominanceOf(6, 5)).toBe('narrow');
  });

  it('returns a bucket for every pair the gate can admit', () => {
    const buckets = new Set<string>();
    for (let m = FREQUENCY_GATE.minTopCount; m <= 12; m += 1) {
      for (let n = FREQUENCY_GATE.minSecondCount; n <= m; n += 1) {
        const d = dominanceOf(m, n);
        expect(d, `${m}:${n}`).toBeDefined();
        expect(['tied', 'narrow', 'clear', 'overwhelming'], `${m}:${n}`).toContain(d);
        buckets.add(d);
      }
    }
    // And all four are reachable, so none of them is dead product judgement.
    expect(buckets.size).toBe(4);
  });
});
