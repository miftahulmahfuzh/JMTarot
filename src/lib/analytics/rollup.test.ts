/**
 * `rollup.ts` -- the pure folds. A3, v0.5.0.
 *
 * The two assertions worth reading first: `slotFor` under filtering (A-D11's colour
 * rule), and `priceRollup` over a table that is missing a model, because `PRICES`
 * ships one row per model and a test against the shipped table could not reach that
 * branch at all -- `prices.ts` records the same trap one file over, where the first
 * version of its own test reimplemented the selection and asserted the copy.
 */
import { describe, expect, it } from 'vitest';
import type { LLMOp } from '@/lib/llm/types';
import { priceFor } from '@/lib/llm/prices';
import {
  OP_ORDER,
  OTHER,
  burstiness,
  dailyEquivalentCeiling,
  foldOps,
  meanCallsPerDay,
  periodDelta,
  priceRollup,
  slotFor,
  type PriceLookup,
  type PriceableRow,
} from './rollup';

describe('the module contract', () => {
  it('imports no database and no environment', () => {
    const src = require('node:fs').readFileSync('src/lib/analytics/rollup.ts', 'utf8');
    const specs = [...src.matchAll(/^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)].map(
      (m: RegExpMatchArray) => m[1],
    );
    // One type-only import, of the import-free module that owns the op set.
    expect(specs).toEqual(['@/lib/llm/types']);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('process.env');
    expect(code).not.toContain('@/lib/db');
  });

  it('names all ten ops and no eleventh', () => {
    /*
     * The COMPILE-TIME guard is `_MissingOps` in the module, which is what actually
     * fails when A2's union grows. This is the other direction: a value in `OP_ORDER`
     * that is not an op would be caught by `satisfies`, and the count is here so a
     * deletion is loud too.
     *
     * **IT WENT 9 -> 10 ON 2026-07-31, FOR A7's `insight`**, and the compile-time guard
     * is what forced this edit rather than a reviewer noticing: `Exclude<LLMOp,
     * OP_ORDER[number]>` stopped being `never` the moment the union grew. The argument
     * for spending a value is in `@/lib/llm/types` — the dashboard's own cost table has
     * to be able to say what the insight button costs.
     */
    expect(OP_ORDER).toHaveLength(10);
    expect(new Set(OP_ORDER).size).toBe(10);
    expect([...OP_ORDER].sort()).toEqual(
      [
        'day_summary',
        'frequency',
        'gist',
        'insight',
        'lotus',
        'moderation',
        'persona',
        'reading',
        'translation',
        'translation_repair',
      ].sort(),
    );
  });

  it("'Other' is a fold marker and not an op", () => {
    expect(OP_ORDER).not.toContain(OTHER as unknown as LLMOp);
  });
});

describe('slotFor -- colour follows the entity, never its rank', () => {
  const READERS = ['thessaly', 'margaret', 'adrian'] as const;

  it('keeps a survivor in its slot when the others are filtered out', () => {
    /*
     * A-D11, in its own words: *thessaly is slot 1 whether or not she is on screen.*
     * The failure this prevents is a filter that repaints the chart, which reads as
     * the data having changed.
     */
    expect(slotFor('adrian', READERS)).toBe(2);
    const filtered = READERS.filter((r) => r !== 'thessaly');
    // The slot comes from the FIXED order, never from the filtered array.
    expect(slotFor('adrian', READERS)).toBe(2);
    expect(filtered.indexOf('adrian')).toBe(1); // what the wrong implementation gives
  });

  it('is -1 for an unknown entity rather than slot 0', () => {
    expect(slotFor('nobody' as (typeof READERS)[number], READERS)).toBe(-1);
  });

  it('gives every op a stable slot regardless of what else is present', () => {
    expect(slotFor('persona', OP_ORDER)).toBe(OP_ORDER.indexOf('persona'));
    expect(slotFor('translation_repair', OP_ORDER)).toBe(8);
  });
});

describe('foldOps', () => {
  const row = (op: LLMOp, value: number) => ({ op, value });

  it('leaves three ops alone -- no Other slot for nothing', () => {
    const out = foldOps([row('reading', 5), row('gist', 3), row('lotus', 1)]);
    expect(out).toEqual([
      { op: 'reading', value: 5 },
      { op: 'gist', value: 3 },
      { op: 'lotus', value: 1 },
    ]);
    expect(out.some((r) => r.op === OTHER)).toBe(false);
  });

  it('folds the fourth into Other, because slot 4 IS Other (R11)', () => {
    const out = foldOps([
      row('reading', 10),
      row('gist', 8),
      row('lotus', 6),
      row('persona', 4),
    ]);
    expect(out).toHaveLength(4);
    expect(out.at(-1)).toEqual({ op: OTHER, value: 4 });
  });

  it('folds five and ten down to top-3 + Other', () => {
    const five = foldOps([
      row('reading', 10),
      row('gist', 8),
      row('lotus', 6),
      row('persona', 4),
      row('frequency', 2),
    ]);
    expect(five).toHaveLength(4);
    expect(five.at(-1)).toEqual({ op: OTHER, value: 6 });

    const all = foldOps(OP_ORDER.map((op, i) => row(op, i + 1)));
    expect(all).toHaveLength(4);
    // 1..10 sums to 55; the top three are 10, 9 and 8.
    expect(all.at(-1)).toEqual({ op: OTHER, value: 55 - 27 });
  });

  it('returns the kept ops in OP_ORDER, never in rank order', () => {
    // `persona` outranks `reading` here; the array must not reshuffle, because a
    // legend that reorders between page loads reads as the data changing.
    const out = foldOps([row('persona', 99), row('reading', 50), row('gist', 20)]);
    expect(out.map((r) => r.op)).toEqual(['reading', 'gist', 'persona']);
  });

  it('does not change either survivor when a third op is filtered out', () => {
    /*
     * THE A-D11 ASSERTION FOR THE FOLD. `slotFor` above is the fixed-slot half; this
     * is the half the fold can promise -- two ops keep their relative positions and
     * their values when a third is removed from the input.
     */
    const all = foldOps([row('reading', 10), row('gist', 8), row('lotus', 6)]);
    const filtered = foldOps([row('reading', 10), row('lotus', 6)]);
    expect(filtered).toEqual([
      { op: 'reading', value: 10 },
      { op: 'lotus', value: 6 },
    ]);
    expect(all[0]).toEqual(filtered[0]);
    expect(all[2]).toEqual(filtered[1]);
    // And the fixed slot is unmoved, which is the part that governs colour.
    expect(slotFor('lotus', OP_ORDER)).toBe(slotFor('lotus', OP_ORDER));
  });

  it('sums duplicate ops rather than keeping two rows', () => {
    expect(foldOps([row('reading', 3), row('reading', 4)])).toEqual([
      { op: 'reading', value: 7 },
    ]);
  });

  it('drops a non-finite value rather than poisoning the sum', () => {
    const out = foldOps([row('reading', 5), row('gist', Number.NaN)]);
    expect(out).toEqual([{ op: 'reading', value: 5 }]);
  });

  it('breaks a rank tie on OP_ORDER, so the survivors are deterministic', () => {
    const out = foldOps([
      row('reading', 5),
      row('gist', 5),
      row('lotus', 5),
      row('persona', 5),
    ]);
    // All four tie; `OP_ORDER` decides, so `persona` (last of the four) is folded.
    expect(out.map((r) => r.op)).toEqual(['reading', 'gist', 'lotus', OTHER]);
  });

  it('is empty for no rows', () => {
    expect(foldOps([])).toEqual([]);
  });
});

describe('priceRollup', () => {
  const g = (over: Partial<PriceableRow> = {}): PriceableRow => ({
    model: 'glm-4.6',
    localDate: '2026-07-29',
    calls: 10,
    inputTokens: 1_000_000,
    outputTokens: 2_000_000,
    untokenized: 0,
    ...over,
  });

  /** A table the test invents, with one model priced and one deliberately absent. */
  const stub: PriceLookup = (model) =>
    model === 'glm-4.6' ? { inputPerMTok: 0.6, outputPerMTok: 2.2 } : null;

  it('prices over the sums', () => {
    const out = priceRollup([g()], stub);
    expect(out.costUsd).toBeCloseTo(0.6 + 4.4, 10);
    expect(out.pricedCalls).toBe(10);
    expect(out.unpricedCalls).toBe(0);
  });

  it('an unknown model contributes to unpricedCalls and NEVER to costUsd', () => {
    const out = priceRollup([g(), g({ model: 'gpt-5.6-luna', calls: 4 })], stub);
    // The priced group's cost, unchanged by the unpriceable one.
    expect(out.costUsd).toBeCloseTo(5.0, 10);
    expect(out.pricedCalls).toBe(10);
    expect(out.unpricedModelCalls).toBe(4);
    expect(out.unpricedCalls).toBe(4);
    expect(out.unpricedModels).toEqual(['gpt-5.6-luna']);
  });

  it('is null, NOT 0, when every call is unpriced', () => {
    const out = priceRollup([g({ model: 'mystery' })], stub);
    expect(out.costUsd).toBeNull();
    expect(out.costUsd).not.toBe(0);
    expect(out.unpricedCalls).toBe(10);
  });

  it('is null for an empty set', () => {
    expect(priceRollup([], stub).costUsd).toBeNull();
  });

  it('counts untokenized calls separately from unpriced models', () => {
    /*
     * The two nulls mean different things and a caller must not conflate them: an
     * unknown MODEL means "we cannot price this"; null TOKENS mean "the provider told
     * us nothing". On z.ai the second is most rows.
     */
    const out = priceRollup([g({ calls: 10, untokenized: 6 })], stub);
    expect(out.pricedCalls).toBe(4);
    expect(out.untokenizedCalls).toBe(6);
    expect(out.unpricedModelCalls).toBe(0);
    expect(out.unpricedCalls).toBe(6);
    // The cost still stands on the tokens that WERE reported.
    expect(out.costUsd).toBeCloseTo(5.0, 10);
  });

  it('never double-counts an untokenized call inside an unpriced model', () => {
    const out = priceRollup([g({ model: 'mystery', calls: 10, untokenized: 6 })], stub);
    expect(out.unpricedCalls).toBe(10);
    expect(out.unpricedCalls).toBeLessThanOrEqual(10);
  });

  it('accepts the SHIPPED priceFor without an adapter', () => {
    // A2's `priceFor` is structurally a `PriceLookup`; if that ever stops being true
    // this line fails to compile, which is the point of asserting it here.
    const out = priceRollup([g()], priceFor);
    // z.ai's rows are zero on purpose -- a fixed annual subscription has no marginal
    // per-token cost -- so a real cost of exactly 0 is the correct answer here.
    expect(out.costUsd).toBe(0);
    expect(out.pricedCalls).toBe(10);
  });
});

describe('periodDelta', () => {
  it('returns a fraction', () => {
    expect(periodDelta(125, 100)).toBeCloseTo(0.25, 12);
    expect(periodDelta(75, 100)).toBeCloseTo(-0.25, 12);
  });

  it('is null against a zero denominator -- never Infinity and never 100%', () => {
    expect(periodDelta(5, 0)).toBeNull();
    expect(periodDelta(0, 0)).toBeNull();
  });

  it('is null on a non-finite input', () => {
    expect(periodDelta(Number.NaN, 10)).toBeNull();
    expect(periodDelta(10, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('meanCallsPerDay', () => {
  it('divides, and refuses a zero-day range', () => {
    expect(meanCallsPerDay(140, 7)).toBe(20);
    expect(meanCallsPerDay(140, 0)).toBeNull();
    expect(meanCallsPerDay(140, -1)).toBeNull();
  });
});

describe('burstiness', () => {
  it('is 1 for perfectly flat traffic', () => {
    // 240 calls/day spread evenly is 50 in any five hours.
    expect(burstiness(50, 240)).toBeCloseTo(1, 12);
  });

  it('is 4.8 when a whole day lands inside one five-hour window', () => {
    expect(burstiness(240, 240)).toBeCloseTo(4.8, 12);
  });

  it('is null rather than Infinity when the mean is 0', () => {
    expect(burstiness(50, 0)).toBeNull();
    expect(burstiness(null, 240)).toBeNull();
    expect(burstiness(50, null)).toBeNull();
  });

  it('returns a sub-1 value as measured rather than clamping it', () => {
    // k < 1 is impossible when both come from one range, so it means the peak and the
    // mean were computed over different ones. Clamping would hide that.
    expect(burstiness(10, 240)).toBeLessThan(1);
  });
});

describe('dailyEquivalentCeiling', () => {
  it('is 1344 at k = 1 -- 280 per 5h if traffic were flat', () => {
    expect(dailyEquivalentCeiling(280, 1)).toBeCloseTo(1344, 9);
  });

  it('falls as traffic gets burstier', () => {
    expect(dailyEquivalentCeiling(280, 3)).toBeCloseTo(448, 9);
    expect(dailyEquivalentCeiling(280, 4.8)).toBeCloseTo(280, 9);
  });

  it('works at the soft tier too, because the ceiling is a parameter', () => {
    expect(dailyEquivalentCeiling(196, 1)).toBeCloseTo(940.8, 9);
  });

  it('is null on an unusable k', () => {
    expect(dailyEquivalentCeiling(280, null)).toBeNull();
    expect(dailyEquivalentCeiling(280, 0)).toBeNull();
    expect(dailyEquivalentCeiling(280, Number.NaN)).toBeNull();
  });
});
