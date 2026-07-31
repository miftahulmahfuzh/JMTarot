/**
 * `admin_insights` against a real Postgres. **A7, 2026-07-31.**
 *
 * Three claims a unit test cannot make, each of which is a defect that would look like
 * the feature working:
 *
 *   1. **A second press ROTATES.** Two rows for one `(panel, range)` would make
 *      `insightsForRange`'s `Map` keep whichever the planner returned last — a silent
 *      coin flip between two paragraphs, on every page load.
 *   2. **`updated_at` actually MOVES.** It is the whole of the visible promise, and
 *      `blog_post_locales.updated_at` records why the by-hand line is kept even though
 *      the pinned drizzle happens to emit the column: three public claims already rest
 *      on a timestamp, and a fourth must not rest on an undocumented behaviour.
 *   3. **A different range is a different row**, so changing the filter cannot serve
 *      prose about seven days under a thirty-day chart.
 */
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import { insightsForRange, putInsight } from './insights';

afterAll(closeTestDb);

const RANGE = { from: '2026-07-01', to: '2026-07-30' };
const OTHER = { from: '2026-06-01', to: '2026-06-30' };

const row = (over: Partial<Parameters<typeof putInsight>[1]> = {}) => ({
  panelId: 'overview.calls',
  range: RANGE,
  body: 'Panggilan naik.',
  inputHash: 'aaaa1111',
  model: 'glm-4.6',
  ...over,
});

describe('putInsight', () => {
  it('inserts, then ROTATES rather than adding a second row', () =>
    withRollback(async (tx) => {
      await putInsight(tx, row());
      await putInsight(tx, row({ body: 'Panggilan turun.', inputHash: 'bbbb2222' }));

      const all = await tx.execute(
        sql`select body, input_hash from admin_insights where panel_id = 'overview.calls'`,
      );
      expect(all).toHaveLength(1);
      expect((all[0] as Record<string, unknown>).body).toBe('Panggilan turun.');
      expect((all[0] as Record<string, unknown>).input_hash).toBe('bbbb2222');
    }));

  it('moves updated_at on the rotation, and leaves created_at alone', () =>
    withRollback(async (tx) => {
      await putInsight(tx, row());
      const first = await insightsForRange(tx, RANGE, ['overview.calls']);
      const before = first.get('overview.calls')!.updatedAt;

      /*
       * The two writes are in one transaction, so `now()` is IDENTICAL for both — which
       * is precisely why `putInsight` stamps a JS `Date` rather than leaning on the
       * database clock. A test against `now()` here would pass on a column that never
       * moved. **`.getTime()`, not `>`**: the `answersUpdatedAt` lesson — a Date and a
       * string compare with `>` by coercing, and answer something.
       */
      await putInsight(tx, row({ body: 'Lain.', inputHash: 'cccc3333' }));
      const second = await insightsForRange(tx, RANGE, ['overview.calls']);
      const after = second.get('overview.calls')!.updatedAt;

      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());

      const created = await tx.execute(
        sql`select created_at = updated_at as same from admin_insights where panel_id = 'overview.calls'`,
      );
      // The row was inserted and then updated, so the two timestamps have parted.
      expect((created[0] as Record<string, unknown>).same).toBe(false);
    }));

  it('keeps a second RANGE as its own row', () =>
    withRollback(async (tx) => {
      await putInsight(tx, row());
      await putInsight(tx, row({ range: OTHER, body: 'Bulan lalu.' }));

      const a = await insightsForRange(tx, RANGE, ['overview.calls']);
      const b = await insightsForRange(tx, OTHER, ['overview.calls']);
      expect(a.get('overview.calls')?.body).toBe('Panggilan naik.');
      expect(b.get('overview.calls')?.body).toBe('Bulan lalu.');
    }));

  it('keeps a second PANEL as its own row', () =>
    withRollback(async (tx) => {
      await putInsight(tx, row());
      await putInsight(tx, row({ panelId: 'overview.ttft', body: 'TTFT stabil.' }));

      const found = await insightsForRange(tx, RANGE, ['overview.calls', 'overview.ttft']);
      expect(found.size).toBe(2);
      expect(found.get('overview.ttft')?.body).toBe('TTFT stabil.');
    }));
});

describe('insightsForRange', () => {
  it('returns only the panels it was asked for', () =>
    withRollback(async (tx) => {
      /*
       * The bound is not a convenience. A row left behind by a panel that has since been
       * removed must not arrive at a page that has no component for it — the same reason
       * `ADMIN_PAGES` is a closed list rather than a glob.
       */
      await putInsight(tx, row());
      await putInsight(tx, row({ panelId: 'overview.ttft' }));

      const found = await insightsForRange(tx, RANGE, ['overview.ttft']);
      expect([...found.keys()]).toEqual(['overview.ttft']);
    }));

  it('is an empty map for a range nobody has pressed a button on', () =>
    withRollback(async (tx) => {
      await putInsight(tx, row());
      const found = await insightsForRange(tx, OTHER, ['overview.calls']);
      expect(found.size).toBe(0);
    }));

  it('asks the database nothing when the panel list is empty', () =>
    withRollback(async (tx) => {
      // A guard rather than an `IN ()`, which postgres rejects outright — and the page
      // would hit it on the day somebody removes the last panel from a tab.
      const found = await insightsForRange(tx, RANGE, []);
      expect(found.size).toBe(0);
    }));

  it('stores the dates as STRINGS, never as a Date', () =>
    withRollback(async (tx) => {
      /*
       * `local_date`'s rule reaching a new table: `date` in `mode: 'string'`. A `Date`
       * here renders in the server's zone and is a day out for anyone in Jakarta between
       * midnight and 07:00 — which for a range endpoint means a row keyed to the wrong
       * day, silently, and an insight that never matches the filter that wrote it.
       */
      await putInsight(tx, row());
      const stored = await tx.execute(
        sql`select range_from, range_to from admin_insights where panel_id = 'overview.calls'`,
      );
      const r = stored[0] as Record<string, unknown>;
      expect(r.range_from).toBe('2026-07-01');
      expect(r.range_to).toBe('2026-07-30');
    }));
});
