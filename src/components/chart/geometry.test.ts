/**
 * The chart maths, which is the part of A4 a unit test can actually own. Every
 * assertion here corresponds to a claim a chart makes about a number on screen.
 */
import { describe, expect, it } from 'vitest';
import {
  VIEW,
  areaPath,
  bandPath,
  bucketFor,
  domainMax,
  linePath,
  nearestIndex,
  niceTicks,
  stackSegments,
  tickIndices,
  xAt,
  yAt,
} from './geometry';

describe('xAt / yAt', () => {
  it('spans the view space end to end', () => {
    expect(xAt(0, 5)).toBe(0);
    expect(xAt(4, 5)).toBe(VIEW);
    expect(xAt(2, 5)).toBe(VIEW / 2);
  });

  it('puts a one-point series at the left edge rather than dividing by zero', () => {
    // A3's `readingsByLocalDate` legitimately returns one row for a one-day range.
    expect(xAt(0, 1)).toBe(0);
    expect(Number.isNaN(xAt(0, 1))).toBe(false);
  });

  it('inverts y, because SVG y grows downward', () => {
    expect(yAt(0, 100)).toBe(VIEW);
    expect(yAt(100, 100)).toBe(0);
    expect(yAt(50, 100)).toBe(VIEW / 2);
  });

  it('puts an all-zero series on the baseline instead of emitting NaN', () => {
    // A NaN path renders as NOTHING AT ALL, with no error anywhere -- the worst
    // available failure for a chart, because the card looks like an empty state.
    expect(yAt(0, 0)).toBe(VIEW);
    expect(yAt(5, 0)).toBe(VIEW);
  });
});

describe('linePath -- a null is a GAP, never an interpolation', () => {
  it('emits two M commands for a value missing in the middle', () => {
    const d = linePath([1, null, 3], 3);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.startsWith('M')).toBe(true);
  });

  it('draws one continuous subpath when nothing is missing', () => {
    const d = linePath([1, 2, 3], 3);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.match(/L/g)).toHaveLength(2);
  });

  it('treats NaN and undefined as gaps too, not as zero', () => {
    // A zero is a measurement -- "no calls that day" -- and a gap is the absence of
    // one. Drawing a NaN as 0 would put a visible dip in the line on a day nobody
    // measured, which is the same lie as bridging it.
    expect(linePath([1, Number.NaN, 3], 3).match(/M/g)).toHaveLength(2);
    expect(linePath([1, 0, 3], 3).match(/M/g)).toHaveLength(1);
  });

  it('emits nothing for an entirely absent series', () => {
    expect(linePath([null, null], 10)).toBe('');
  });

  it('emits a bare M for a lone point between gaps, which the component must mark', () => {
    // `M x y` with no `L` renders as nothing, so `Line` draws an HTML marker at every
    // point. Asserted here so the component's reason is discoverable from the maths.
    const d = linePath([null, 5, null], 5);
    expect(d).toMatch(/^M[\d.]+ [\d.]+$/);
  });
});

describe('areaPath -- one polygon per run, so a gap is a gap in the fill too', () => {
  it('closes to the baseline', () => {
    const d = areaPath([1, 2], 2);
    expect(d).toContain(`L${VIEW}`);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('emits two polygons across a gap rather than shading the missing days', () => {
    const d = areaPath([1, null, 3], 3);
    expect(d.match(/Z/g)).toHaveLength(2);
  });

  it('emits nothing when there is nothing to fill', () => {
    expect(areaPath([null], 1)).toBe('');
  });
});

describe('bandPath', () => {
  it('goes up the lower edge and back along the upper, so the winding cannot punch a hole', () => {
    const d = bandPath([1, 1], [3, 3], 3);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.match(/L/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('returns nothing on a length mismatch rather than drawing HALF a band', () => {
    // Half a band reads as a NARROWER band, which is a forecast claiming more
    // confidence than it has -- the exact thing A-D8's band exists to prevent.
    expect(bandPath([1], [1, 2], 3)).toBe('');
    expect(bandPath([], [], 3)).toBe('');
  });
});

describe('stackSegments -- the stack ALWAYS closes at exactly 100', () => {
  const pcts = (rows: number[]) =>
    stackSegments(rows.map((value, i) => ({ datum: i, value }))).segments.map((s) => s.pct);
  const sum = (rows: number[]) => pcts(rows).reduce((a, b) => a + b, 0);

  it('sums to exactly 100 for the adversarial thirds', () => {
    // A naive per-segment round leaves a sub-pixel sliver of SURFACE at the end of the
    // bar, and on a 20px row against a dark panel that sliver reads as a fifth
    // category. The last segment takes the remainder.
    expect(sum([1, 1, 1])).toBe(100);
    expect(sum([33.333, 33.333, 33.334])).toBe(100);
    expect(sum([1, 2, 3, 4, 5, 6, 7])).toBe(100);
    expect(sum([999_999, 1])).toBe(100);
  });

  it('drops zero segments rather than rendering them at 0%', () => {
    // A zero-width flex child still takes its 2px gap, so four of them would draw 8px
    // of nothing at the end of a bar.
    expect(pcts([0, 0, 100])).toEqual([100]);
    expect(sum([0, 0, 100])).toBe(100);
  });

  it('drops a non-finite value rather than poisoning the total', () => {
    // One NaN makes the whole bar render empty with nothing on screen to say why --
    // the same reason `foldOps` drops one.
    const { segments, total } = stackSegments([
      { datum: 'a', value: 10 },
      { datum: 'b', value: Number.NaN },
    ]);
    expect(segments).toHaveLength(1);
    expect(total).toBe(10);
    expect(segments[0].pct).toBe(100);
  });

  it('returns an empty stack, not a full one, when everything is zero', () => {
    expect(stackSegments([{ datum: 'a', value: 0 }])).toEqual({ segments: [], total: 0 });
  });

  it('keeps the original value beside the percentage, for the table view', () => {
    const { segments } = stackSegments([{ datum: 'x', value: 7 }, { datum: 'y', value: 3 }]);
    expect(segments.map((s) => s.value)).toEqual([7, 3]);
    expect(segments.map((s) => s.datum)).toEqual(['x', 'y']);
  });
});

describe('bucketFor -- 0 is EMPTY, never the lowest step', () => {
  it('returns null for zero', () => {
    // A cell painted the lowest bucket CLAIMS DATA. On a weekday x hour grid most
    // cells are genuinely empty, so this distinction is the chart's whole information
    // content.
    expect(bucketFor(0, 100)).toBeNull();
  });

  it('returns null when nothing was measured at all', () => {
    expect(bucketFor(5, 0)).toBeNull();
    expect(bucketFor(Number.NaN, 100)).toBeNull();
  });

  it('spreads 1..max over five equal-width steps, with max in the top one', () => {
    expect(bucketFor(1, 100)).toBe(0);
    expect(bucketFor(20, 100)).toBe(1);
    expect(bucketFor(50, 100)).toBe(2);
    expect(bucketFor(100, 100)).toBe(4);
    expect(bucketFor(500, 100)).toBe(4);
  });

  it('does not put a single call in the top bucket', () => {
    // The failure a quantile scale would produce over mostly-empty data: it is the
    // same lie as painting an empty cell, in the other direction.
    expect(bucketFor(1, 50)).toBe(0);
  });
});

describe('niceTicks -- the domain always includes 0 (I-8)', () => {
  it('starts at 0 and ends at or above the max', () => {
    const { ticks, yMax } = niceTicks(87);
    expect(ticks[0].value).toBe(0);
    expect(yMax).toBeGreaterThanOrEqual(87);
    expect(ticks[ticks.length - 1].value).toBe(yMax);
  });

  it('rounds to a 1-2-5 progression, measured', () => {
    /*
     * The first draft of this test asserted `niceTicks(9).yMax === 12` on the reflex
     * that four ticks means four equal parts of the data. It does not: the progression
     * governs the STEP, and there is no 3 in 1-2-5. Measured, `9/4 = 2.25` takes step 5
     * and lands on 10.
     *
     * **AND 2.5 IS DELIBERATELY NOT IN THE PROGRESSION**, though the textbook nice-number
     * set includes it and it would give tighter axes here (87 would land on 100 with five
     * even ticks instead of three). Every y-axis in this release is a COUNT, and a step of
     * 2.5 prints `2.5 calls` on an axis tick. A little headroom on a count is harmless --
     * marks stop short of the frame -- and a fractional tick on a count is a chart that
     * cannot be read literally.
     */
    expect(niceTicks(87)).toMatchObject({ yMax: 100 }); // raw 21.75 -> step 50
    expect(niceTicks(9)).toMatchObject({ yMax: 10 }); // raw 2.25  -> step 5
    expect(niceTicks(1200)).toMatchObject({ yMax: 1500 }); // raw 300 -> step 500
  });

  it('keeps every tick an integer on a count axis', () => {
    for (const max of [1, 3, 9, 87, 250, 1200, 45_678]) {
      for (const t of niceTicks(max).ticks) {
        expect(Number.isInteger(t.value), `${max} produced a tick at ${t.value}`).toBe(true);
      }
    }
  });

  it('gives a single 0 tick for an empty series rather than inventing a scale', () => {
    expect(niceTicks(0).ticks).toEqual([{ at: 0, value: 0 }]);
    expect(niceTicks(-5).yMax).toBe(1);
  });

  it('reports `at` as a fraction from the BOTTOM, so a caller never inverts', () => {
    const { ticks } = niceTicks(100);
    expect(ticks[0].at).toBe(0);
    expect(ticks[ticks.length - 1].at).toBe(1);
  });
});

describe('tickIndices -- selective labels, never one per point', () => {
  it('labels every index when they all fit', () => {
    expect(tickIndices(4, 5)).toEqual([0, 1, 2, 3]);
  });

  it('always includes both ends of the range', () => {
    const out = tickIndices(90, 4);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(89);
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it('is empty for an empty series', () => {
    expect(tickIndices(0, 4)).toEqual([]);
  });
});

describe('nearestIndex -- the crosshair finds an X, not a point', () => {
  it('snaps to the nearest index', () => {
    expect(nearestIndex(0, 5)).toBe(0);
    expect(nearestIndex(1, 5)).toBe(4);
    expect(nearestIndex(0.49, 5)).toBe(2);
  });

  it('clamps rather than returning nothing, so a pointer in the axis band still reads', () => {
    expect(nearestIndex(-0.2, 5)).toBe(0);
    expect(nearestIndex(1.4, 5)).toBe(4);
    expect(nearestIndex(Number.NaN, 5)).toBe(0);
  });
});

describe('domainMax -- ONE scale for every series, which is what makes I-7 structural', () => {
  it('takes the max across all series', () => {
    expect(domainMax([{ values: [1, 9] }, { values: [4, 2] }])).toBe(9);
  });

  it('ignores gaps', () => {
    expect(domainMax([{ values: [null, 3, Number.NaN] }])).toBe(3);
  });

  it('is 0 for nothing at all, which `yAt` then floors', () => {
    expect(domainMax([])).toBe(0);
    expect(domainMax([{ values: [null] }])).toBe(0);
  });
});
