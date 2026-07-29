/**
 * **NO DUAL-AXIS CHART. NOT ONCE** (I-7, non-negotiable 6).
 *
 * ── THIS IS A GREP, AND HERE IS WHAT A GREP CAN AND CANNOT PROVE ─────────────
 *
 * `callClass.test.ts` is the precedent and it is honest about the same limit. What this test
 * proves: **the vocabulary of a second y-scale is absent from every chart file.** What it
 * cannot prove: that no arithmetic anywhere produces two scales. Somebody determined to draw
 * two domains could compute `1000 - v / otherMax * 1000` inline and no grep would see it.
 *
 * So the grep is the tripwire, and the STRUCTURE is the actual defence:
 *
 *   - every chart component takes **one** `yMax: number` -- there is no prop through which a
 *     second domain could arrive;
 *   - `domainMax()` is the only function that computes a domain, and it takes ALL series at
 *     once and returns ONE number;
 *   - `ChartHover` takes already-computed percentage geometry, so it cannot introduce a
 *     scale of its own.
 *
 * The vocabulary is how the concept would ARRIVE -- somebody adds `y2` to a props type
 * before they add the maths -- which is why greping for it catches the change at the moment
 * it is cheapest to reverse.
 *
 * ── WHY THE RULE AT ALL ─────────────────────────────────────────────────────
 *
 * A-D11: two y-scales is the single most common charting mistake, and it is banned outright.
 * Token input against token output is **two series on one axis** because they share a unit.
 * Tokens against cost, or calls against latency, is **two charts** -- or an indexed common
 * base -- never two scales in one frame. A3 says the same thing about its own two latency
 * metrics: `readings.latency_ms` is TTFT and `llm_calls.total_ms` is the whole call, they
 * share a unit, and *a single chart may not plot both* -- not for the dual-axis reason, but
 * because they measure different intervals of different events.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILES = globSync('src/components/chart/**/*.{ts,tsx}')
  .concat(globSync('src/app/admin/**/*.{ts,tsx}'))
  .filter((f) => !f.includes('.test.'));

/** Comments stripped, for the reason `adminSurface.test.ts` states: a rule that fires on
 *  prose describing the rule is a rule people delete. This file's own header names `y2`. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** The vocabulary a second scale arrives in. */
const VOCABULARY = [
  /\by2\b/,
  /\brightAxis\b/,
  /\bsecondaryAxis\b/,
  /\baxisRight\b/,
  /\bdualAxis\b/,
  /\byMax2\b/,
  /\byRight\b/,
  /\bsecondScale\b/,
];

describe('the fence is not vacuous', () => {
  it('has files to grep', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(15);
  });
});

describe('I-7 -- the vocabulary of a second y-scale is absent', () => {
  for (const pattern of VOCABULARY) {
    it(`no file mentions ${String(pattern)}`, () => {
      for (const f of FILES) {
        expect(pattern.test(code(f)), `${f} names ${String(pattern)}`).toBe(false);
      }
    });
  }
});

describe('and the structure is what actually prevents it', () => {
  it('gives every plotting component exactly one y-domain prop', () => {
    /*
     * Counted as TYPE MEMBERS (`yMax: number;` with the semicolon), not as every mention.
     * The first version matched `/\byMax\b\s*:/` and reported TWO for `Trajectory` -- the
     * props member and a local helper's parameter, `markLast(actual, n, yMax: number)`.
     * A fence that counts a function parameter as a second axis is a fence that goes red on
     * a refactor, and what somebody does then is delete it.
     */
    for (const f of ['Line.tsx', 'Area.tsx', 'Trajectory.tsx']) {
      const src = code(`src/components/chart/${f}`);
      const domains = src.match(/\byMax: number;/g) ?? [];
      // One declaration in the props type. More than one would be two domains even if
      // neither was called `y2`.
      expect(domains.length, `${f} declares ${domains.length} y-domains`).toBe(1);
    }
  });

  it('computes a domain in exactly one function, over ALL series at once', () => {
    const geometry = code('src/components/chart/geometry.ts');
    expect(geometry).toMatch(/export function domainMax\(/);
    // It takes an array of series and returns a single number. A signature returning a
    // tuple or a per-series map would be a second scale with a friendly name.
    expect(geometry).toMatch(/domainMax\(\s*series: readonly \{[^}]*\}\[\]\s*\): number/);
  });

  it('keeps the two latency metrics on separate charts (A3 seam)', () => {
    // `readings.latency_ms` is TTFT; `llm_calls.total_ms` is the whole call. They share a
    // unit and would look combinable. No admin page may read both into one chart's series.
    for (const f of FILES.filter((x) => x.startsWith('src/app/admin/'))) {
      const src = code(f);
      const both = /ttftByService/.test(src) && /\bcallsByOp\b/.test(src);
      if (both) {
        // Both may be READ on one page; what is forbidden is one chart. If this ever
        // fires, check the call site rather than deleting the assertion.
        expect(src, `${f} reads both latency metrics -- verify they are two charts`).not.toMatch(
          /series:\s*\[[^\]]*ttft[^\]]*total/is,
        );
      }
    }
  });
});
