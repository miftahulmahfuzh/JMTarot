/**
 * The adapter between A3's rows and A4's chart props.
 *
 * Every fold here is testable with no database because the module is pure and takes structural
 * shapes -- which is the whole reason I-15 keeps `@/lib/db/**` out of the components and puts
 * the mapping in one file.
 */
import { describe, expect, it } from 'vitest';
import type {
  LocalDateRow,
  OpTotals,
  TokenRow,
  TtftRow,
  UtcDayRow,
} from '@/lib/db/queries/admin/metrics';
import type { LeagueRow } from '@/lib/db/queries/admin/users';
import { OP_ORDER, OTHER } from '@/lib/analytics/rollup';
import { CATEGORICAL, OTHER_SLOT, slotColor } from '@/theme/chart';
import {
  assertDense,
  callSeries,
  foldedOps,
  league,
  localCallSeries,
  opRows,
  tail,
  tokenSeries,
  ttftOverall,
  ttftServices,
  weekdayHeat,
} from './metrics';

const utcDay = (bucket: string, calls: number): UtcDayRow => ({ bucket, calls, streamedCalls: 0 });

const tokenRow = (bucket: string, model: string, over: Partial<TokenRow> = {}): TokenRow => ({
  bucket,
  model,
  calls: 1,
  inputTokens: 0,
  outputTokens: 0,
  nullInputCalls: 0,
  nullOutputCalls: 0,
  ...over,
});

const opTotals = (op: OpTotals['op'], calls: number): OpTotals => ({
  op,
  calls,
  inputTokens: 0,
  outputTokens: 0,
  failed: 0,
  aborted: 0,
  p50Ms: null,
  p95Ms: null,
});

describe('assertDense -- A4 REPORTS a sparse series, it does not fill one', () => {
  it('passes a series with one row per day, in order', () => {
    const rows = [utcDay('2026-07-28', 1), utcDay('2026-07-29', 0), utcDay('2026-07-30', 4)];
    expect(assertDense(rows.map((r) => r.bucket), '2026-07-28', '2026-07-30')).toEqual({ dense: true });
  });

  it('reports a missing day with both counts, rather than filling it', () => {
    /*
     * **FILLING A GAP INVENTS DATA.** A3 zero-fills in TypeScript and promises one row per
     * calendar day; if that promise breaks -- a query rewritten to group in SQL, a
     * `generate_series` handing back `timestamptz` -- the honest answer is `ChartError`. A
     * chart missing its left-hand side that says nothing about it is the failure that
     * survives review.
     */
    const rows = [utcDay('2026-07-28', 1), utcDay('2026-07-30', 4)];
    expect(assertDense(rows.map((r) => r.bucket), '2026-07-28', '2026-07-30')).toEqual({
      dense: false,
      expected: 3,
      got: 2,
    });
  });

  it('reports an out-of-order series too, not just a short one', () => {
    // Same length, wrong order: every value would be plotted on the wrong day, and the chart
    // would look entirely normal.
    const buckets = ['2026-07-30', '2026-07-29', '2026-07-28'];
    expect(assertDense(buckets, '2026-07-28', '2026-07-30')).toMatchObject({ dense: false });
  });

  it('reports an unusable range rather than claiming density over nothing', () => {
    expect(assertDense([], '2026-07-30', '2026-07-01')).toMatchObject({ dense: false });
  });
});

describe('callSeries / localCallSeries / tail', () => {
  it('maps rows to values in order', () => {
    expect(callSeries([utcDay('a', 1), utcDay('b', 0), utcDay('c', 9)])).toEqual([1, 0, 9]);
  });

  it('keeps a zero as a zero, never as a gap', () => {
    // A zero is a measurement -- "no calls that day" -- and `linePath` draws through it. A
    // gap is the absence of one and breaks the path. A3 zero-fills precisely so that the
    // chart can tell them apart.
    expect(callSeries([utcDay('a', 0)])).toEqual([0]);
  });

  it('maps the querent-day series the same way', () => {
    const rows: LocalDateRow[] = [{ bucket: 'a', calls: 3, users: 1 }];
    expect(localCallSeries(rows)).toEqual([3]);
  });

  it('trims a sparkline to its last twelve, HERE and not in the component', () => {
    // A component that reshaped its input would make a tile and its table row disagree about
    // which days they describe.
    const values = Array.from({ length: 30 }, (_, i) => i);
    expect(tail(values)).toHaveLength(12);
    expect(tail(values)[11]).toBe(29);
    // Shorter than twelve is returned whole rather than padded: padding would invent days.
    expect(tail([1, 2])).toEqual([1, 2]);
  });
});

describe('tokenSeries -- folds ACROSS models and carries the half-blindness through', () => {
  it('sums two models on one day into one column', () => {
    /*
     * A3 groups by `(day, model)` because **a single `sum(output_tokens)` for a day that
     * spanned two models is unpriceable** (A-D7 prices per model per period). The CHART does
     * not price anything, so it may sum.
     */
    const rows = [
      tokenRow('2026-07-30', 'glm-4.6', { inputTokens: 100, outputTokens: 200 }),
      tokenRow('2026-07-30', 'glm-4.5-flash', { inputTokens: 5, outputTokens: 7 }),
    ];
    const s = tokenSeries(rows, '2026-07-30', '2026-07-30');
    expect(s.input).toEqual([105]);
    expect(s.output).toEqual([207]);
  });

  it('SUMS the null-token counts rather than losing them in the fold', () => {
    /*
     * z.ai returns `input_tokens: 0`, which both adapters store as NULL, so on the current
     * provider this count is nearly every row and `input_tokens` is structurally half-blind.
     * **A token chart that does not carry the null count invites the reader to conclude the
     * app has no prompt cost.**
     */
    const rows = [
      tokenRow('2026-07-30', 'a', { nullInputCalls: 3, nullOutputCalls: 1 }),
      tokenRow('2026-07-30', 'b', { nullInputCalls: 4, nullOutputCalls: 0 }),
    ];
    const s = tokenSeries(rows, '2026-07-30', '2026-07-30');
    expect(s.nullInputCalls).toBe(7);
    expect(s.nullOutputCalls).toBe(1);
  });

  it('zero-fills from the RANGE, because A3 cannot zero-fill a per-model grouping', () => {
    // The one series A3 does not zero-fill, zero-filled here -- so a day with no calls is a
    // 0 column and not a missing one.
    const s = tokenSeries([tokenRow('2026-07-30', 'a', { inputTokens: 9 })], '2026-07-28', '2026-07-30');
    expect(s.buckets).toEqual(['2026-07-28', '2026-07-29', '2026-07-30']);
    expect(s.input).toEqual([0, 0, 9]);
  });

  it('is empty for an unusable range rather than throwing', () => {
    expect(tokenSeries([], '2026-07-30', '2026-07-01').buckets).toEqual([]);
  });
});

describe('foldedOps -- top-3 + Other (R11), never "4 + Other"', () => {
  it('keeps three and folds the rest, with Other in slot 3', () => {
    /*
     * The categorical palette is four wide and **slot 4 IS Other**, so the roadmap's *"folded
     * to 4 + Other"* needed five slots and there are four.
     */
    const rows = OP_ORDER.map((op, i) => ({ op, value: (9 - i) * 10 }));
    const folded = foldedOps(rows);
    expect(folded).toHaveLength(4);
    expect(folded[3].op).toBe(OTHER);
    expect(folded[3].slot).toBe(OTHER_SLOT);
    expect(slotColor(folded[3].slot)).toBe(CATEGORICAL[OTHER_SLOT]);
  });

  it('returns the kept rows in OP_ORDER, never in rank order', () => {
    // A3's rule: an order that changes with the data reads as the data changing.
    const folded = foldedOps([
      { op: 'persona', value: 100 },
      { op: 'moderation', value: 90 },
      { op: 'reading', value: 80 },
    ]);
    expect(folded.map((r) => r.op)).toEqual(['moderation', 'reading', 'persona']);
  });

  it('emits no Other row when there is nothing to fold', () => {
    // An empty Other slot is a legend entry for nothing -- V5's M14 rule.
    const folded = foldedOps([{ op: 'reading', value: 5 }]);
    expect(folded.map((r) => r.op)).toEqual(['reading']);
  });

  it('never hands slotColor a value it would throw on', () => {
    // The fold is the only producer of slots for this chart, so if it can produce a 4 the
    // dashboard 500s. Four rows maximum, slots 0..3.
    const folded = foldedOps(OP_ORDER.map((op) => ({ op, value: 1 })));
    for (const r of folded) expect(() => slotColor(r.slot)).not.toThrow();
  });
});

describe('opRows -- stable order, and the ops that did not run are omitted', () => {
  it('orders by OP_ORDER and drops absent ops', () => {
    // Nine rows of which three are zero reads as a broken query; a rank order that moves
    // between page loads reads as the data changing.
    const rows = opRows([opTotals('persona', 3), opTotals('moderation', 40)]);
    expect(rows.map((r) => r.op)).toEqual(['moderation', 'persona']);
  });

  it('is empty for an empty range', () => {
    expect(opRows([])).toEqual([]);
  });
});

describe('weekdayHeat -- §1.7s honest half, with no zone in it', () => {
  it('puts Monday in row 0 and groups by ISO week', () => {
    /*
     * `weekStart` is A3's and using it is load-bearing: its header records that **the naive
     * `getUTCDay()` puts Sunday in the following week**, wrong for one day in seven and
     * invisible for about a month.
     *
     * 2026-07-27 is a Monday; 2026-08-02 is the Sunday of the same ISO week.
     */
    const buckets = ['2026-07-27', '2026-07-28', '2026-08-02', '2026-08-03'];
    const heat = weekdayHeat(buckets, [1, 2, 3, 4]);
    const cell = (day: string) => heat.cells.find((c) => c.day === day)!;
    expect(cell('2026-07-27').row).toBe(0); // Monday
    expect(cell('2026-08-02').row).toBe(6); // Sunday -- SAME week as the Monday above
    expect(cell('2026-08-02').col).toBe(cell('2026-07-27').col);
    expect(cell('2026-08-03').col).toBe(cell('2026-07-27').col + 1); // the next Monday
  });

  it('reports the max for the bucket scale', () => {
    const heat = weekdayHeat(['2026-07-27', '2026-07-28'], [1, 9]);
    expect(heat.max).toBe(9);
  });

  it('treats a gap as 0 for the grid, because a cell must exist to be outlined', () => {
    // `bucketFor(0)` returns null and `Heatmap` renders that as the outlined surface -- which
    // is the "nothing here" state. A missing CELL would collapse the grid instead.
    const heat = weekdayHeat(['2026-07-27'], [null]);
    expect(heat.cells[0].value).toBe(0);
  });

  it('skips a malformed day rather than throwing', () => {
    const heat = weekdayHeat(['nope', '2026-07-27'], [5, 1]);
    expect(heat.cells).toHaveLength(1);
  });
});

describe('league -- biggest first, and a null userId is a REAL row', () => {
  const row = (userId: string | null, output: number): LeagueRow => ({
    userId,
    model: 'glm-4.6',
    calls: 1,
    inputTokens: 0,
    outputTokens: output,
  });

  it('sorts by total tokens and caps', () => {
    const out = league([row('a', 1), row('b', 9), row('c', 5)], 2);
    expect(out.map((r) => r.userId)).toEqual(['b', 'c']);
    expect(out[0].tokens).toBe(9);
  });

  it('NEVER drops the unattributed row', () => {
    /*
     * `llm_calls.user_id` is `on delete set null`, so a hard-deleted user's history survives
     * with the attribution gone -- **and the tokens were still spent.** Dropping it would make
     * the league's total disagree with the KPI tile's, which is how a dashboard loses its
     * reader. A3 says the same thing at `LeagueRow.userId` and adds the consequence the page
     * must state: cost-per-user denominators shift over time.
     */
    const out = league([row(null, 100), row('a', 1)]);
    expect(out[0].userId).toBeNull();
    expect(out).toHaveLength(2);
  });

  it('breaks a tie deterministically, so two page loads agree', () => {
    const out = league([row('b', 5), row('a', 5)]);
    expect(out.map((r) => r.userId)).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// TTFT -- the fleet row and the per-service rows
// ---------------------------------------------------------------------------

const ttft = (serviceId: string | null, over: Partial<TtftRow> = {}): TtftRow => ({
  serviceId,
  readings: 1,
  p50Ms: 100,
  p95Ms: 200,
  ...over,
});

describe('ttftServices', () => {
  it('excludes the fleet total row', () => {
    const out = ttftServices([ttft('daily'), ttft(null, { readings: 9 })]);
    expect(out.map((r) => r.serviceId)).toEqual(['daily']);
  });

  it('orders by SERVICE_SLOT and NOT by readings, so a table does not reshuffle', () => {
    /*
     * A3 returns `readings desc`. Rank order means two services swap places between page
     * loads as counts move, and it reads as the data changing -- the reason `opRows` takes
     * `OP_ORDER` and `foldedOps` never sorts by magnitude. Colour already follows the
     * entity through `slotFor`, so only the ROW order was left to pin.
     */
    const out = ttftServices([
      ttft('yesno', { readings: 90 }),
      ttft('daily', { readings: 2 }),
      ttft('spread3', { readings: 50 }),
    ]);
    expect(out.map((r) => r.serviceId)).toEqual(['daily', 'spread3', 'yesno']);
  });

  it('drops a service id that has no slot, exactly as ServiceShare already did', () => {
    // `slotFor` has three slots and an unknown id has no colour. Matching the shipped
    // filter rather than inventing a fourth entity keeps the two cards consistent.
    expect(ttftServices([ttft('tarot-roulette'), ttft('daily')]).map((r) => r.serviceId)).toEqual([
      'daily',
    ]);
  });

  it('is empty for an empty range', () => {
    expect(ttftServices([])).toEqual([]);
  });
});

describe('ttftOverall', () => {
  it('returns the fleet row', () => {
    const out = ttftOverall([ttft('daily'), ttft(null, { readings: 4, p50Ms: 250, p95Ms: 895 })]);
    expect(out).toEqual({ serviceId: null, readings: 4, p50Ms: 250, p95Ms: 895 });
  });

  it('is null when the range produced no rows at all', () => {
    expect(ttftOverall([])).toBeNull();
  });

  it('NEVER falls back to a service row when the total is absent', () => {
    /*
     * The whole reason the query grew a `rollup()` is that **a fleet percentile is not
     * derivable from the per-service rows.** A fold that returned the only service row, or
     * the largest one, would put a single service's p95 under a tile labelled for the
     * fleet -- and with one service live it would even look right. `null` renders the
     * empty cell, which is the honest answer.
     */
    expect(ttftOverall([ttft('daily', { readings: 7, p95Ms: 6000 })])).toBeNull();
  });
});
