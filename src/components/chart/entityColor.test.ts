/**
 * **COLOUR FOLLOWS THE ENTITY, NEVER ITS RANK** (A-D11, I-5).
 *
 * The failure this names: filter a chart to two readers and the survivors are REPAINTED --
 * `margaret` was teal and becomes gold because she is now first in the array. Nothing errors,
 * nothing looks broken, and two screenshots of the same data disagree about who is who. On a
 * dashboard whose whole job is to be trusted, that is worse than a missing chart.
 *
 * A3's `slotFor` and A4's `slotColor` are the two halves, and the test exercises them
 * TOGETHER -- because each is correct alone and the bug lives in the join.
 */
import { describe, expect, it } from 'vitest';
import { slotFor } from '@/lib/analytics/rollup';
import {
  CATEGORICAL,
  DIRECTION_SLOT,
  OTHER_SLOT,
  READER_SLOT,
  SERVICE_SLOT,
  slotColor,
} from '@/theme/chart';

/** The fixed orders A3's `slotFor` is called with, and A4's maps agree with them by key. */
const READERS = ['thessaly', 'margaret', 'adrian'] as const;
const SERVICES = ['daily', 'spread3', 'yesno'] as const;

describe('a reader keeps her colour when the others are filtered out', () => {
  it('paints margaret and adrian teal and violet, never gold and teal', () => {
    /*
     * **THE EXACT FAILURE, NAMED.** With three readers on screen the slots are 0, 1, 2. Filter
     * to two and a rank-based renderer hands out 0 and 1 -- gold and teal -- so `margaret`
     * changes colour and `adrian` takes the colour `margaret` had. This is the assertion that
     * would go red.
     */
    const filtered = ['margaret', 'adrian'] as const;
    const colours = filtered.map((r) => slotColor(slotFor(r, READERS)));
    expect(colours).toEqual([CATEGORICAL[1], CATEGORICAL[2]]);
    expect(colours[0]).not.toBe(CATEGORICAL[0]);
  });

  it('is unchanged for every subset of the three readers', () => {
    // Not just the one case above: every subset, so the property is the claim rather than an
    // example of it.
    const full = new Map(READERS.map((r) => [r, slotColor(slotFor(r, READERS))]));
    const subsets: readonly (typeof READERS[number])[][] = [
      ['thessaly'],
      ['margaret'],
      ['adrian'],
      ['thessaly', 'adrian'],
      ['margaret', 'adrian'],
      ['thessaly', 'margaret'],
      ['thessaly', 'margaret', 'adrian'],
    ];
    for (const subset of subsets) {
      for (const r of subset) {
        expect(slotColor(slotFor(r, READERS)), `${r} in [${subset.join(',')}]`).toBe(full.get(r));
      }
    }
  });

  it('holds for services and for the two token directions too', () => {
    expect(slotColor(slotFor('yesno', SERVICES))).toBe(CATEGORICAL[2]);
    expect(slotColor(slotFor('spread3', SERVICES))).toBe(CATEGORICAL[1]);
    // Input is slot 0 and output slot 1, on the SAME chart and the same axis -- they share a
    // unit, which is why that is two series and not two scales (I-7).
    expect(slotColor(DIRECTION_SLOT.input)).toBe(CATEGORICAL[0]);
    expect(slotColor(DIRECTION_SLOT.output)).toBe(CATEGORICAL[1]);
  });
});

describe("A4's slot maps and A3's fixed orders cannot disagree", () => {
  it('agrees on every reader and every service', () => {
    /*
     * Two files hold the same fact: `READER_SLOT` in `chart.ts` and the order A4's pages pass
     * to `slotFor`. This is the assertion that makes the duplication safe -- and the reason
     * the duplication exists at all is R22's split, which keeps a pure fold out of
     * `queries/**` and a palette out of the analytics layer.
     */
    READERS.forEach((r, i) => {
      expect(READER_SLOT[r]).toBe(i);
      expect(slotFor(r, READERS)).toBe(i);
    });
    SERVICES.forEach((s, i) => {
      expect(SERVICE_SLOT[s]).toBe(i);
      expect(slotFor(s, SERVICES)).toBe(i);
    });
  });

  it('sends an unknown entity to Other rather than to slot 0', () => {
    // `slotFor` answers -1 for an entity it does not know -- a reader slug added to
    // `readers.json` without a palette slot, or a service renamed. Slot 0 would silently
    // give it Thessaly's gold; Other is the honest answer and does not lie about identity.
    expect(slotFor('nobody', READERS)).toBe(-1);
    expect(slotColor(-1)).toBe(CATEGORICAL[OTHER_SLOT]);
  });
});

describe('the palette is never cycled', () => {
  it('throws on a fifth series rather than reusing slot 0', () => {
    // A-D9: a fifth categorical hue is *"a reconciliation question, not an authoring
    // convenience"*. A modulo here is how two entities silently become one colour, and on
    // screen it looks like a chart with colours.
    expect(() => slotColor(4)).toThrow(/never cycled/);
    expect(CATEGORICAL).toHaveLength(4);
  });
});
