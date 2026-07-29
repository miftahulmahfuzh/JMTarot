/**
 * The chart palette's validation run, as a committed test. A-D9's requirement:
 * *"the validator run is a committed test … a palette that passed once and drifted is
 * the failure this prevents."*
 *
 * ── READ THIS BEFORE CHANGING A HEX ──────────────────────────────────────────
 *
 * Every number below was measured, not chosen. If one of these goes red, the palette
 * changed and the change is wrong until re-derived with the commands in the roadmap's
 * §5.1 (and this plan's §4.3), **which are PER SET**: three of the five sets require
 * `--ordinal` and FAIL by design without it (R9). An implementer who runs one command
 * over all five sets writes a red test over shipped-correct values, concludes the
 * palette is broken, and re-derives it -- which is exactly what A-D9 exists to stop.
 *
 * ── THE THRESHOLDS ARE ASSERTED TOO, AND THAT IS NOT PARANOIA ────────────────
 *
 * **The cheapest way to make a palette test pass is to loosen the ruler.** So the last
 * describe block reads the vendored validator's own source and pins its five thresholds
 * and the dark lightness band. Manual bookkeeping with a stated reason: the `prices.ts`
 * / `bodyHash` precedent, where a number with no automatic source is guarded by a test
 * that names it.
 *
 * ── WHY IT IMPORTS A `.js` FILE FROM `tools/` ────────────────────────────────
 *
 * I-22. The skill's copy lives under a session-scoped `/tmp/claude-1000/bundled-skills/
 * <version>/` path, so shelling out is not reproducible and this test would go red
 * tomorrow for a reason that has nothing to do with colour. `tools/dataviz/
 * validate_palette.js` is the byte-identical vendored copy; its header is the argument.
 */
/*
 * A vendored, dev-only ESM `.js` with no type declarations. `tsconfig.json` sets
 * `allowJs: true`, so TypeScript infers its exports from the source and this needs no
 * `@ts-expect-error` -- the first draft had one and `tsc` flagged it as UNUSED, which
 * is a better outcome than suppressing an error that does not exist. It is NOT typed
 * by hand: I-22 keeps the file byte-identical to the standard's own implementation, and
 * a `.d.ts` beside it would be a second thing to keep in step.
 */
import { contrast, validate, validateOrdinal } from '../../tools/dataviz/validate_palette.js';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CATEGORICAL,
  CHART_SURFACE,
  DEEMPH,
  DIVERGING,
  OTHER_SLOT,
  READER_SLOT,
  SEQUENTIAL,
  SEVERITY,
  STATUS,
  slotColor,
} from './chart';
import { color } from './tokens';

const DARK = { mode: 'dark' as const, surface: CHART_SURFACE };

/**
 * The validator's own row shape: `[check, state, detail]`, where `state` is a BOOLEAN
 * for the two set-membership checks and a STRING for the graded ones
 * (`'pass' | 'floor' | 'fail'`, and `'relief'` for contrast). Normalised below rather
 * than asserted raw, because the mixture is the validator's business and a test that
 * pins it would break on a cosmetic change there.
 */
type Row = [string, boolean | string, string];
type Report = { report: Row[]; ok: boolean };

/** `{ check: 'pass' | 'fail' | 'floor' | 'relief' }`, so an assertion names its check. */
function states(rep: Report): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [check, state] of rep.report) {
    out[check] = typeof state === 'boolean' ? (state ? 'pass' : 'fail') : state;
  }
  return out;
}

/** The detail string for one check, which is where the measured ΔE lives. */
function detail(rep: Report, check: string): string {
  const row = rep.report.find((r) => r[0] === check);
  expect(row, `no "${check}" row in the report -- the validator's own shape changed`).toBeDefined();
  return row![2];
}

/** The run's verdict. `ok === false` is the CLI's `EXIT=1`; a WARN keeps `ok === true`,
 *  which is R10's whole point. */
function failed(rep: Report): boolean {
  return rep.ok === false;
}

/**
 * The ΔE out of a detail string.
 *
 * **IT MATCHES THE LABEL, NOT "THE FIRST NUMBER", AND THE FIRST DRAFT DID THE LATTER.**
 * The details read `worst adjacent #c2703f↔#a3423a ΔE 12.9 (normal)` -- so a bare
 * `\d+(\.\d+)?` lands inside a HEX CODE and returns `2703`. Every one of these
 * assertions passed on the two sets whose hexes happen to start with a letter and
 * failed on the ones that do not, which reads exactly like a palette defect and is a
 * defect in the ruler. Pinning the labelled number and not the sentence also means a
 * reworded validator does not fail this suite.
 */
function deltaE(s: string): number {
  const m = s.match(/ΔE\s+(-?\d+(?:\.\d+)?)/);
  expect(m, `no "ΔE <n>" in "${s}"`).not.toBeNull();
  return Number(m![1]);
}

describe('1. categorical, adjacent pairs -- the pairlist for stacks, bars and lines', () => {
  const report = validate([...CATEGORICAL], { ...DARK }) as Report;

  it('passes all six checks', () => {
    expect(failed(report)).toBe(false);
    expect(states(report)).toEqual({
      'Lightness band': 'pass',
      'Chroma floor': 'pass',
      'CVD separation': 'pass',
      'Normal-vision floor': 'pass',
      'Contrast vs surface': 'pass',
    });
  });

  it('keeps the worst adjacent CVD pair above the 8.0 target, at 10.5', () => {
    // violet<->teal under deutanopia. Comfortable: the WARN band starts at 8.0 and the
    // hard floor is 6.0.
    expect(deltaE(detail(report, 'CVD separation'))).toBeCloseTo(10.5, 1);
  });

  it('keeps the worst adjacent normal-vision pair above the 15 floor, at 17.2', () => {
    expect(deltaE(detail(report, 'Normal-vision floor'))).toBeCloseTo(17.2, 1);
  });

  it('is the token gold DARKENED into the dark band, not the token itself', () => {
    // `#c9a227` measures L=0.728, outside `[0.48, 0.67]`. That is the whole delta
    // between slot 0 and `--gold`, and it is why the chart palette is a new file
    // rather than a reuse.
    expect(CATEGORICAL[0]).toBe('#ab8b20');
    expect(failed(validate([color.gold, CATEGORICAL[1]], { ...DARK }) as Report)).toBe(true);
  });
});

describe('2. categorical, ALL pairs -- a WARN, and the run still PASSES (§1.3, R10)', () => {
  const report = validate([...CATEGORICAL], { ...DARK, pairs: 'all' }) as Report;

  it('does not FAIL, and the CVD row is a WARN at 6.5', () => {
    /*
     * §5.1 called this "a WARN, not a pass". **A WARN exits 0** -- the distinction it
     * drew does not exist at the exit code, and a test written from that wording
     * (`expect(fail).toBe(true)`) would be RED ON CORRECT DATA. The hard gate is the
     * normal-vision floor and it passes at 15.8.
     */
    expect(failed(report)).toBe(false);
    expect(states(report)['CVD separation']).toBe('floor');
    expect(deltaE(detail(report, 'CVD separation'))).toBeCloseTo(6.5, 1);
    expect(deltaE(detail(report, 'Normal-vision floor'))).toBeCloseTo(15.8, 1);
  });

  it('discharges the WARN structurally: no all-pairs form ships (§1.3)', () => {
    /*
     * A WARN in the 6-8 band is legal ONLY with mandatory secondary encoding. A4's
     * answer is not a cap on series -- it is that the forms which need an all-pairs
     * palette do not exist. `chart.contract.test.ts` owns the filename assertion; this
     * is the one that ties it to the measurement, so deleting either leaves the other
     * looking arbitrary.
     */
    const files = globChart();
    for (const forbidden of ['Scatter', 'Bubble', 'SmallMultiple', 'Pie', 'Donut']) {
      expect(files.filter((f) => f.includes(forbidden)), `${forbidden} form exists`).toEqual([]);
    }
  });
});

describe('3. sequential -- `--ordinal` IS REQUIRED, and bare it FAILS on purpose (§1.1)', () => {
  it('passes the four ordinal checks', () => {
    const report = validateOrdinal([...SEQUENTIAL], { ...DARK }) as Report;
    expect(failed(report)).toBe(false);
    expect(states(report)).toEqual({
      'Lightness monotone': 'pass',
      'Adjacent ΔL': 'pass',
      'Light-end contrast': 'pass',
      'Single hue': 'pass',
    });
  });

  it('clears the surface at its DIMMEST step, 4.02:1 -- the opposite of the light-mode intuition', () => {
    // On a dark canvas the dimmest step is the one at risk. §5.1 records a first
    // attempt ending at `#3d3272` that failed at 1.70:1.
    expect(contrast(SEQUENTIAL[SEQUENTIAL.length - 1], CHART_SURFACE)).toBeCloseTo(4.02, 1);
    expect(contrast('#3d3272', CHART_SURFACE)).toBeLessThan(2);
  });

  it('FAILS the categorical six, and that failure is correct (do not "fix" the ramp)', () => {
    /*
     * `color-formula.md`: *"running the categorical validator on a sequential ramp will
     * FAIL by design … don't 'fix' a good ramp to satisfy it."* Asserted rather than
     * commented, because the roadmap printed one command for all five sets and this is
     * the set an implementer would have "repaired".
     */
    const wrong = validate([...SEQUENTIAL], { ...DARK }) as Report;
    expect(failed(wrong)).toBe(true);
    expect(states(wrong)['Lightness band']).toBe('fail');
    expect(states(wrong)['Chroma floor']).toBe('fail');
    expect(states(wrong)['Normal-vision floor']).toBe('fail');
  });
});

describe('4. severity -- ordinal, four steps, terminating on the app one destructive colour', () => {
  it('passes the four ordinal checks', () => {
    const report = validateOrdinal([...SEVERITY], { ...DARK }) as Report;
    expect(failed(report)).toBe(false);
    expect(Object.values(states(report)).every((s) => s === 'pass')).toBe(true);
  });

  it('ends on `color.danger`, so the app has one destructive colour and not two', () => {
    expect(SEVERITY[3]).toBe(color.danger);
    expect(STATUS.critical).toBe(color.danger);
  });

  it('is UNUSABLE as a categorical set -- adjacent ΔE 7.5 -- which is why it is ordinal', () => {
    // The number behind `Meter`'s mandatory icon and word: four severity steps cannot
    // be told apart by colour, so colour never carries the state alone.
    const asCategorical = validate([...SEVERITY], { ...DARK }) as Report;
    expect(failed(asCategorical)).toBe(true);
    expect(deltaE(detail(asCategorical, 'Normal-vision floor'))).toBeCloseTo(7.5, 1);
  });
});

describe('5. binary status -- good vs critical, with an icon and a label', () => {
  it('passes at ΔE 24.7 normal, 11.8 deutan', () => {
    const report = validate([STATUS.good, STATUS.critical], { ...DARK }) as Report;
    expect(failed(report)).toBe(false);
    expect(deltaE(detail(report, 'Normal-vision floor'))).toBeCloseTo(24.7, 1);
    expect(deltaE(detail(report, 'CVD separation'))).toBeCloseTo(11.8, 1);
  });
});

describe('6. diverging -- the POLES pass; the midpoint MUST fail the chroma floor (§1.2, R10)', () => {
  it('passes on the two poles at ΔE 27.2', () => {
    const poles = validate([DIVERGING.down, DIVERGING.up], { ...DARK }) as Report;
    expect(failed(poles)).toBe(false);
    expect(deltaE(detail(poles, 'Normal-vision floor'))).toBeCloseTo(27.2, 1);
  });

  it('FAILS the chroma floor on the midpoint, at C=0.051, AND THAT IS THE REQUIREMENT', () => {
    /*
     * §5.1 quoted "ALL CHECKS PASS, ΔE 27.2" for this set; that was the poles alone.
     * The trio fails, and **the failure is the design**: `color-formula.md` demands
     * *"two hues + a neutral gray midpoint"*, and a neutral gray is BY DEFINITION below
     * the chroma floor. CLAUDE.md already records `muted` and `label` as
     * *"lavender-grays below the chroma floor"*, so the codebase and the rule agree.
     *
     * The midpoint is validated as a text/neutral token and NEVER as a categorical
     * slot. A test asserting the trio passes would be wrong about the design, and the
     * fix somebody would reach for -- giving the midpoint a hue -- destroys the one
     * property a diverging scale needs.
     */
    const trio = validate([DIVERGING.down, DIVERGING.mid, DIVERGING.up], { ...DARK }) as Report;
    expect(failed(trio)).toBe(true);
    expect(states(trio)['Chroma floor']).toBe('fail');
    expect(detail(trio, 'Chroma floor')).toContain('0.051');
    // Every other check on the trio passes: it is neutral, not broken.
    expect(states(trio)['Lightness band']).toBe('pass');
    expect(states(trio)['Contrast vs surface']).toBe('pass');
  });

  it('spends no new value on the midpoint', () => {
    expect(DIVERGING.mid).toBe(color.label);
    expect(DEEMPH).toBe(color.label);
  });
});

describe('I-4 -- THE PANEL MUST BE OPAQUE, and this is the negative control (R8)', () => {
  it('is `color.bgRadial[1]`, by construction rather than by a literal', () => {
    expect(CHART_SURFACE).toBe(color.bgRadial[1]);
    expect(CHART_SURFACE).toBe('#130f22');
  });

  it('clears the 3:1 mark floor on the panel by 0.04 -- 3.04:1', () => {
    expect(contrast(SEVERITY[3], CHART_SURFACE)).toBeCloseTo(3.04, 2);
    expect(contrast(SEVERITY[3], CHART_SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it('FAILS the mark floor against the TOP OF THE RADIAL, at 2.66:1', () => {
    /*
     * **THE ONE THAT WOULD HAVE SHIPPED.** `Backdrop` is `position: fixed; inset: 0`
     * painting `radial-gradient(… #221a3a 0%, #130f22 42%, #08060f 100%)`, so a
     * TRANSPARENT panel at the top of the viewport -- where the KPI row and the hero
     * figure go -- sits on `#221a3a` and not on the surface every number here was
     * validated against.
     *
     * And the ordinal check would have stayed GREEN, because its light-end floor is
     * 2.0. So the only thing standing between a validated palette and an
     * under-contrast mark on screen is that the panel actually paints its surface.
     * `ChartFrame.module.css` sets `background: var(--chart-surface)` and
     * `chart.contract.test.ts` asserts no chart CSS introduces translucency.
     */
    expect(contrast(SEVERITY[3], color.bgRadial[0])).toBeCloseTo(2.66, 2);
    expect(contrast(SEVERITY[3], color.bgRadial[0])).toBeLessThan(3);
  });

  it('is the reason I-12 exists: `--label` fails 4.5:1 text where `--muted` clears it', () => {
    // Same hex, two verdicts. Legal as a 2px mark at 4.11:1; illegal as an 11px tick.
    expect(contrast(color.label, CHART_SURFACE)).toBeCloseTo(4.11, 1);
    expect(contrast(color.label, CHART_SURFACE)).toBeLessThan(4.5);
    expect(contrast(color.muted, CHART_SURFACE)).toBeCloseTo(6.47, 1);
    expect(contrast(color.muted, CHART_SURFACE)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('§5.2 -- the four-hue traffic light is UNBUILDABLE, re-measured', () => {
  /*
   * Each of these is a HARD FAIL and the numbers are pinned, **so "adding a warning
   * colour" fails a test that names the number it fails on.** The dark band
   * `[0.48, 0.67]` plus the 0.10 chroma floor leaves too little room between amber,
   * orange, gold and green: anybody who tries will produce one of these three pairs.
   */
  const cases: [string, string, number][] = [
    ['amber vs orange', '#d4813c', 8.0],
    ['gold vs green', '#4f9d6b', 12.3],
  ];

  for (const [name, other, dE] of cases) {
    it(`FAILS: ${name} at ΔE ${dE} normal vision`, () => {
      const report = validate([CATEGORICAL[0], other], { ...DARK }) as Report;
      expect(failed(report)).toBe(true);
      expect(deltaE(detail(report, 'Normal-vision floor'))).toBeCloseTo(dE, 1);
    });
  }

  it('FAILS: amber vs orange collapses to ΔE 2.3 under PROTANOPIA', () => {
    // The worst of the three, and the one a normal-vision reviewer cannot see.
    const report = validate([CATEGORICAL[0], '#d4813c'], { ...DARK }) as Report;
    expect(detail(report, 'CVD separation')).toContain('2.3');
    expect(detail(report, 'CVD separation')).toContain('protan');
  });

  it('FAILS: brick vs orange at ΔE 12.9 normal vision', () => {
    const report = validate([SEVERITY[3], '#c2703f'], { ...DARK }) as Report;
    expect(failed(report)).toBe(true);
    expect(deltaE(detail(report, 'Normal-vision floor'))).toBeCloseTo(12.9, 1);
  });
});

describe('slotColor -- the only indexer, and it throws rather than wrapping', () => {
  it('resolves an entity through its map, never through a rank', () => {
    expect(slotColor(READER_SLOT.thessaly)).toBe('#ab8b20');
    expect(slotColor(READER_SLOT.margaret)).toBe('#2fa4a0');
    expect(slotColor(READER_SLOT.adrian)).toBe('#8b7bd8');
    expect(slotColor(OTHER_SLOT)).toBe('#d2707f');
  });

  it('THROWS above slot 3 -- a modulo is how a fifth series silently reuses slot 0', () => {
    expect(() => slotColor(4)).toThrow(/never cycled/);
    expect(() => slotColor(1.5)).toThrow();
    expect(() => slotColor(-2)).toThrow();
  });

  it('maps `slotFor`s -1 to Other rather than crashing a dashboard', () => {
    // A3's `slotFor` answers -1 for an unknown entity. A caller that could not identify
    // a reader slug has an "Other", and a 500 over an unrecognised slug would be the
    // worse failure -- `tally.ts`'s rule: a heuristic may fail a build, not a person.
    expect(slotColor(-1)).toBe('#d2707f');
  });
});

describe('I-22 -- the RULER itself is pinned, because loosening it is the cheap fix', () => {
  const src = readFileSync('tools/dataviz/validate_palette.js', 'utf8');

  it('keeps the five thresholds and the dark lightness band', () => {
    expect(src).toContain('const CHROMA_FLOOR = 0.10');
    expect(src).toContain('const CVD_TARGET = 8.0, CVD_FLOOR = 6.0');
    expect(src).toContain('const NORMAL_FLOOR = 15.0');
    expect(src).toContain('const CONTRAST_MIN = 3.0');
    expect(src).toMatch(/dark:\s*\[0\.48,\s*0\.67\]/);
  });

  it('keeps its provenance header, which is what makes it re-derivable', () => {
    expect(src).toContain('VENDORED VERBATIM');
    expect(src).toContain('Machado');
  });
});

/** Chart component filenames, for the "no all-pairs form" consequence above. */
function globChart(): string[] {
  const { globSync } = require('node:fs') as typeof import('node:fs');
  return globSync('src/components/chart/**/*.tsx');
}
