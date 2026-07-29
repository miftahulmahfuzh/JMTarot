/**
 * The per-user token fold. v0.5.0 / A5, task 14. PURE, so `npm test` reaches it.
 */
import { describe, expect, it } from 'vitest';
import type { CallTotals } from '@/lib/db/queries/admin/calls';
import { callsByOpForUser, userTokenSeries } from './series';

function row(over: Partial<CallTotals>): CallTotals {
  return {
    model: 'glm-4.6',
    localDate: '2026-07-20',
    op: 'reading',
    calls: 1,
    inputTokens: 0,
    outputTokens: 0,
    untokenized: 0,
    ...over,
  };
}

describe('userTokenSeries', () => {
  it('buckets on local_date and zero-fills from the RANGE, not from the rows', () => {
    /*
     * The bucket list comes from the range, so a day with no calls is a `0` rather than a missing
     * column -- **a chart missing its left-hand side says nothing about it.**
     */
    const s = userTokenSeries(
      [row({ localDate: '2026-07-20', inputTokens: 100, outputTokens: 50 })],
      '2026-07-19',
      '2026-07-21',
    );
    expect(s.buckets).toEqual(['2026-07-19', '2026-07-20', '2026-07-21']);
    expect(s.input).toEqual([0, 100, 0]);
    expect(s.output).toEqual([0, 50, 0]);
    expect(s.calls).toEqual([0, 1, 0]);
  });

  it('folds across models and ops within a day', () => {
    const s = userTokenSeries(
      [
        row({ model: 'glm-4.6', op: 'reading', calls: 1, inputTokens: 100, outputTokens: 40 }),
        row({ model: 'glm-4.5-flash', op: 'gist', calls: 2, inputTokens: 10, outputTokens: 5 }),
      ],
      '2026-07-20',
      '2026-07-20',
    );
    expect(s.input).toEqual([110]);
    expect(s.output).toEqual([45]);
    expect(s.calls).toEqual([3]);
    expect(s.totalCalls).toBe(3);
  });

  it('sums untokenized rather than recomputing it', () => {
    // A-D7's denominator: rows whose provider reported nothing at all. On `LLM_PROVIDER=zai`
    // this is very nearly every row, which is exactly why it may not be hidden.
    const s = userTokenSeries(
      [row({ calls: 3, untokenized: 3 }), row({ calls: 1, inputTokens: 90, outputTokens: 10 })],
      '2026-07-20',
      '2026-07-20',
    );
    expect(s.untokenized).toBe(3);
    expect(s.totalCalls).toBe(4);
  });

  it('is empty-but-shaped for a user with no calls', () => {
    const s = userTokenSeries([], '2026-07-20', '2026-07-22');
    expect(s.buckets).toHaveLength(3);
    expect(s.input).toEqual([0, 0, 0]);
    expect(s.totalCalls).toBe(0);
    expect(s.untokenized).toBe(0);
  });

  it('ignores a row outside the range rather than inventing a bucket for it', () => {
    // The range is the authority. A row from outside it cannot create a fourth column.
    const s = userTokenSeries(
      [row({ localDate: '2026-06-01', calls: 9, outputTokens: 9999 })],
      '2026-07-20',
      '2026-07-21',
    );
    expect(s.buckets).toEqual(['2026-07-20', '2026-07-21']);
    expect(s.output).toEqual([0, 0]);
    // The TOTALS still count it, because the caller asked for these rows -- and a KPI that
    // disagreed with its own chart would be worse than one that includes an off-range row.
    // In practice the query is already filtered to the range.
    expect(s.totalCalls).toBe(9);
  });
});

describe('callsByOpForUser', () => {
  it('folds by op, biggest first, breaking ties on the op name', () => {
    // A stable order: **not by rank alone**, or a legend reshuffles when two ops draw level.
    const rows = callsByOpForUser([
      row({ op: 'gist', calls: 2 }),
      row({ op: 'reading', calls: 5 }),
      row({ op: 'moderation', calls: 2 }),
      row({ op: 'reading', calls: 1 }),
    ]);
    expect(rows).toEqual([
      { op: 'reading', calls: 6 },
      { op: 'gist', calls: 2 },
      { op: 'moderation', calls: 2 },
    ]);
  });

  it('is empty for no rows', () => {
    expect(callsByOpForUser([])).toEqual([]);
  });
});
