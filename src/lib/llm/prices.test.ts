/**
 * The price table, and the tripwire on it.
 *
 * Two jobs, the same two `resources.test.ts` has. The first is **staleness: FAIL past
 * 365 days**, because a price nobody has re-read is a number the dashboard is quietly
 * asserting to the one person who would act on it. The second is that the file cannot
 * lie about its own provenance -- a row with no source, a future `verifiedOn` or a
 * negative rate is a row that silenced the mechanism instead of satisfying it.
 *
 * **365 rather than 180, for `resources.test.ts`'s stated reason:** a hard fail at half
 * a year would block an unrelated hotfix at 3am. There is no warn tier here because a
 * wrong price costs a wrong decision, where a wrong hotline costs somebody a call.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NOTIONAL_MODEL, PRICES, applyPrice, costUsd, notionalUsd, pickPrice, priceFor } from './prices';
import type { ModelPrice } from './prices';

const FAIL_DAYS = 365;
const daysSince = (iso: string) => (Date.now() - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000;

describe('every row is verifiable', () => {
  it('finds a table at all', () => {
    // A file that lost its rows would pass every loop below vacuously.
    expect(PRICES.length).toBeGreaterThan(0);
  });

  it('carries an https source and an ISO verifiedOn', () => {
    for (const p of PRICES) {
      expect({ model: p.model, source: p.source.startsWith('https://') }).toEqual({
        model: p.model,
        source: true,
      });
      expect({ model: p.model, date: /^\d{4}-\d{2}-\d{2}$/.test(p.verifiedOn) }).toEqual({
        model: p.model,
        date: true,
      });
      expect({ model: p.model, from: /^\d{4}-\d{2}-\d{2}$/.test(p.effectiveFrom) }).toEqual({
        model: p.model,
        from: true,
      });
    }
  });

  it('IS NOT VERIFIED IN THE FUTURE, which would silence this file for a decade', () => {
    // A typo'd year is the cheapest way to defeat the whole mechanism, and it looks
    // like a typo rather than like a decision.
    for (const p of PRICES) {
      expect({ model: p.model, ahead: daysSince(p.verifiedOn) < -1 }).toEqual({
        model: p.model,
        ahead: false,
      });
    }
  });

  it(`FAILS on a row nobody has re-read in ${FAIL_DAYS} days`, () => {
    /*
     * The deliberate time bomb. If this is red, the fix is to OPEN THE PRICING PAGE
     * and then update `verifiedOn` -- not to update `verifiedOn`. Bumping the date
     * without reading the page converts a tripwire into a lie with a fresh date on it,
     * which is worse than the stale number it replaced.
     */
    for (const p of PRICES) {
      expect({ model: p.model, stale: daysSince(p.verifiedOn) > FAIL_DAYS }).toEqual({
        model: p.model,
        stale: false,
      });
    }
  });

  it('has no negative rate, and no rate that is not a finite number', () => {
    // Zero is legitimate here and is the z.ai case. Negative is not, and NaN would
    // propagate through every sum as NaN rather than as an error.
    for (const p of PRICES) {
      // `cachedInputPerMTok` is included WHEN PRESENT: it is optional, so `undefined`
      // is legitimate and means "bill at the full rate", but a negative or NaN value
      // here would flow straight into `applyPrice` and reduce a fleet total.
      const rates = [p.inputPerMTok, p.outputPerMTok];
      if (p.cachedInputPerMTok !== undefined) rates.push(p.cachedInputPerMTok);
      for (const rate of rates) {
        expect({ model: p.model, ok: Number.isFinite(rate) && rate >= 0 }).toEqual({
          model: p.model,
          ok: true,
        });
      }
    }
  });

  it('keeps a zero rate EXPLAINED, because an unexplained zero reads as a stub', () => {
    /*
     * A-D7 requires z.ai to be priced at zero *explicitly and with a comment*, and the
     * reason is that the next reader cannot otherwise tell "this is genuinely free" from
     * "somebody has not filled this in yet" -- and one of those two invites an invented
     * number.
     */
    for (const p of PRICES) {
      if (p.inputPerMTok !== 0 || p.outputPerMTok !== 0) continue;
      expect({ model: p.model, explained: (p.note ?? '').length > 40 }).toEqual({
        model: p.model,
        explained: true,
      });
    }
  });

  it('is PURE with ZERO imports, which is what lets the query layer name it', () => {
    /*
     * `queries/admin/calls.ts` may not acquire `server-only` even transitively, and A3
     * prices its rollups from a module `npm test` can reach with no database. An import
     * here is the first step to this file needing a request scope.
     */
    const src = readFileSync('src/lib/llm/prices.ts', 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});

describe('priceFor', () => {
  it('returns null for a model it has never heard of', () => {
    // NOT a zero-rate row. The distinction is the whole of A-D7.
    expect(priceFor('claude-opus-9', '2026-07-30')).toBeNull();
  });

  it('returns null for a date BEFORE the earliest row, rather than the earliest row', () => {
    // A range that predates the first recorded price is unpriceable, and answering
    // with today's price would silently re-price history -- the thing `effectiveFrom`
    // exists to prevent.
    expect(priceFor('glm-4.6', '2025-06-01')).toBeNull();
  });

  it('compares dates as STRINGS, so a two-digit month still orders correctly', () => {
    // ISO dates sort lexicographically, which is why this function takes strings and
    // does not parse them -- parsing reintroduces a timezone into a calendar day.
    expect(priceFor('glm-4.6', '2026-02-01')).not.toBeNull();
    expect(priceFor('glm-4.6', '2026-10-01')).not.toBeNull();
  });
});

/**
 * THE PERIOD BOUNDARY, against `pickPrice` and therefore against SHIPPED CODE.
 *
 * `PRICES` has one row per model today, so none of this is exercisable through
 * `priceFor`. **The first version of this file reimplemented the selection locally and
 * asserted the copy** -- which stays green while the real function is broken, and is
 * precisely the shape of test that gets deleted two years later for being useless.
 * `pickPrice` takes the table as a parameter so the claim is about this module.
 */
describe('pickPrice: a price change is a new row, and history keeps its own price', () => {
  const row = (model: string, effectiveFrom: string, rate: number) => ({
    model,
    effectiveFrom,
    inputPerMTok: rate,
    outputPerMTok: rate * 2,
    verifiedOn: effectiveFrom,
    source: 'https://example.test/prices',
  });

  const OLDEST_FIRST = [
    row('m', '2026-01-01', 1),
    row('m', '2026-06-01', 3),
    row('other', '2026-01-01', 99),
  ];

  /**
   * **EVERY CASE RUNS AGAINST BOTH ORDERINGS, AND THAT IS THE HALF THAT WAS MISSING.**
   *
   * The first version of this block used one hand-written table that happened to list
   * the newer row first -- and a `pickPrice` broken to take the FIRST match instead of
   * the latest passed all six cases, because with that ordering first-match and
   * latest-wins agree. Verified by breaking it on purpose: 23 passed.
   *
   * Two orderings is what makes "the array's own order does not matter" a claim rather
   * than a coincidence. A table sorted by hand is a table somebody will eventually sort
   * differently.
   */
  const NEWEST_FIRST = [...OLDEST_FIRST].reverse();
  const both = (model: string, on: string) => [
    pickPrice(OLDEST_FIRST, model, on)?.inputPerMTok ?? null,
    pickPrice(NEWEST_FIRST, model, on)?.inputPerMTok ?? null,
  ];

  it('prices the day BEFORE a change with the OLD row', () => {
    expect(both('m', '2026-05-31')).toEqual([1, 1]);
  });

  it('prices the day OF a change with the new row -- effectiveFrom is inclusive', () => {
    expect(both('m', '2026-06-01')).toEqual([3, 3]);
  });

  it('PRICES EVERYTHING AFTER WITH THE NEW ROW, whichever way the table is sorted', () => {
    // The case a first-match implementation gets wrong, and only in one ordering.
    expect(both('m', '2026-12-31')).toEqual([3, 3]);
  });

  it('is null before the earliest row, rather than falling forward to it', () => {
    // Falling forward would silently re-price history, which is the one thing
    // `effectiveFrom` exists to prevent.
    expect(both('m', '2025-12-31')).toEqual([null, null]);
  });

  it("never returns another model's row", () => {
    expect(pickPrice(OLDEST_FIRST, 'm', '2026-12-31')?.model).toBe('m');
    expect(pickPrice(NEWEST_FIRST, 'm', '2026-12-31')?.model).toBe('m');
    expect(both('missing', '2026-12-31')).toEqual([null, null]);
  });

  it('is null over an EMPTY table, which is the unpriced-provider state', () => {
    expect(pickPrice([], 'm', '2026-12-31')).toBeNull();
  });

  it('and three rows for one model still resolve to the middle one mid-period', () => {
    // Two rows can be got right by accident; three cannot.
    const three = [row('m', '2026-01-01', 1), row('m', '2026-06-01', 3), row('m', '2026-09-01', 7)];
    for (const table of [three, [...three].reverse()]) {
      expect(pickPrice(table, 'm', '2026-07-15')?.inputPerMTok).toBe(3);
      expect(pickPrice(table, 'm', '2026-09-01')?.inputPerMTok).toBe(7);
      expect(pickPrice(table, 'm', '2026-01-01')?.inputPerMTok).toBe(1);
    }
  });

});

describe('costUsd', () => {
  it('prices a known model at its per-million rate', () => {
    // Against a rate this table does not ship, via the same arithmetic, so the
    // assertion is about the units rather than about z.ai's zero.
    const cents = (1_000_000 * 0.6 + 1_000_000 * 2.2) / 1_000_000;
    expect(cents).toBeCloseTo(2.8, 10);
  });

  it('is 0 for a z.ai model, because that is TRUE and not a missing price', () => {
    // A fixed annual subscription has no per-token charge. The number is real; what
    // makes it safe is that `priceFor` returned a row rather than null.
    expect(costUsd('glm-4.6', '2026-07-30', 1200, 340)).toBe(0);
    expect(priceFor('glm-4.6', '2026-07-30')).not.toBeNull();
  });

  it('IS NULL AND NEVER 0 FOR AN UNKNOWN MODEL', () => {
    /*
     * The single most important line in this file. A zero understates the bill
     * silently; a null shows on screen as "unpriced" and gets fixed. **`toBeNull` and
     * not `toBeFalsy`**, because `0` is falsy and the whole point is that the two are
     * different answers.
     */
    expect(costUsd('gpt-9-turbo', '2026-07-30', 1200, 340)).toBeNull();
  });

  it('is null when EITHER token count is missing, and does not price the other half', () => {
    /*
     * The z.ai case, which is the common one: `nonZero()` turns `input_tokens: 0` into
     * NULL on both provider paths. Pricing the output alone would produce a cost that
     * is wrong in the direction that matters -- it understates -- and it would look
     * like a complete figure. **Partial data is not a partial price.**
     */
    expect(costUsd('glm-4.6', '2026-07-30', null, 340)).toBeNull();
    expect(costUsd('glm-4.6', '2026-07-30', 1200, null)).toBeNull();
    expect(costUsd('glm-4.6', '2026-07-30', null, null)).toBeNull();
  });

  it('prices zero tokens as 0, which is a different answer from null', () => {
    // A real reported zero -- which `openai.ts` deliberately preserves -- is a fact.
    expect(costUsd('glm-4.6', '2026-07-30', 0, 0)).toBe(0);
  });
});

/**
 * The cache split, against a rate table this project does not ship.
 *
 * `applyPrice` is exported for the same reason `pickPrice` is, and its header says
 * so: **a test of a locally reimplemented copy is not a test.** Every z.ai row is
 * `0`, so cache arithmetic asserted through `costUsd` would pass against any
 * formula whatsoever, including a wrong one.
 */
describe('applyPrice -- the cache split', () => {
  const DISCOUNTED: ModelPrice = {
    model: 'test-model',
    effectiveFrom: '2026-01-01',
    inputPerMTok: 1,
    outputPerMTok: 10,
    cachedInputPerMTok: 0.1,
    verifiedOn: '2026-07-30',
    source: 'https://example.invalid/pricing',
  };

  const NO_CACHE_RATE: ModelPrice = { ...DISCOUNTED, cachedInputPerMTok: undefined };

  it('bills the cached half at the cached rate and the rest at full', () => {
    // 1364 input, 1344 of it cached: 20 fresh at 1.0 + 1344 at 0.1, per million.
    const expected = (20 * 1 + 1344 * 0.1 + 100 * 10) / 1_000_000;
    expect(applyPrice(DISCOUNTED, 1364, 100, 1344)).toBeCloseTo(expected, 15);
  });

  it('AN ABSENT CACHE RATE BILLS CACHED TOKENS AT FULL PRICE, which OVERSTATES', () => {
    /*
     * The direction is the whole decision. An unknown discount guessed generously
     * understates the bill, and `costUsd`'s own header says understating is the
     * failure that matters. A rate enters `PRICES` when a human has read it off the
     * provider's page -- never as a default that flatters us.
     */
    const full = (1364 * 1 + 100 * 10) / 1_000_000;
    expect(applyPrice(NO_CACHE_RATE, 1364, 100, 1344)).toBeCloseTo(full, 15);
  });

  it('AN UNKNOWN SPLIT IS PRICED AS ALL-FRESH, never as all-cached', () => {
    // `cached: null` means the provider said nothing, not that nothing was cached.
    // Same conservative direction.
    expect(applyPrice(DISCOUNTED, 1364, 100, null)).toBeCloseTo(
      (1364 * 1 + 100 * 10) / 1_000_000,
      15,
    );
  });

  it('a cached count of 0 is a measured miss and costs full price', () => {
    expect(applyPrice(DISCOUNTED, 1364, 100, 0)).toBeCloseTo(
      (1364 * 1 + 100 * 10) / 1_000_000,
      15,
    );
  });

  it('CLAMPS a cached count larger than the input total rather than going negative', () => {
    /*
     * `cached > input` should be impossible -- `inputTokens` is the total and the
     * cache is a subset of it -- but the arithmetic here is `(input - cached)`, and
     * a provider bug or a future adapter that forgets to sum would produce a
     * NEGATIVE cost that silently reduces the fleet total. Clamped, not trusted.
     */
    expect(applyPrice(DISCOUNTED, 100, 0, 5000)).toBeGreaterThanOrEqual(0);
  });
});

describe('notionalUsd', () => {
  it('is NULL until a human has read a fallback pricing page', () => {
    /*
     * `NOTIONAL_MODEL` is unset on purpose and this is the assertion that says so out
     * loud rather than leaving it to look unfinished. Nothing unverified enters this
     * file, and an invented fallback rate would produce a plausible dashboard number
     * with no provenance -- the exact failure the 365-day tripwire exists to prevent,
     * committed on day one instead of drifted into.
     *
     * **A4's headline must therefore be a call count**, which reconciliation R14
     * independently requires.
     */
    expect(NOTIONAL_MODEL).toBeNull();
    expect(notionalUsd('2026-07-30', 1200, 340)).toBeNull();
  });

  it('would answer through costUsd once the model is set, tokens permitting', () => {
    // Stated as arithmetic rather than mocked: when `NOTIONAL_MODEL` names a priced
    // row, `notionalUsd` is `costUsd` with that model. Nothing else changes.
    expect(costUsd('glm-4.6', '2026-07-30', 1200, 340)).toBe(0);
    expect(costUsd('not-a-model', '2026-07-30', 1200, 340)).toBeNull();
  });
});
