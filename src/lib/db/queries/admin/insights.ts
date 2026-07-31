/**
 * `admin_insights` — read the cached panel insights for a range, write one back.
 * **A7, 2026-07-31.**
 *
 * `docs/plans/2026-07-31-admin-panel-insights-design.md` §4.
 *
 * ── THE READ IS ONE STATEMENT FOR THE WHOLE PAGE, NOT ONE PER PANEL ─────────
 *
 * Seven panels on `/admin/tokens` would be seven round trips inside a 10s statement
 * budget, on a surface where **every request is a cold one** — one admin, no warm
 * instance, and the first query also wakes a suspended Neon compute. `insightsForRange`
 * returns a map keyed by `panel_id` and the page indexes into it, which is also what
 * lets it join the existing `Promise.all` rather than adding a second await.
 *
 * ── THE WRITE CANNOT RUN INSIDE `withAdminRead` ────────────────────────────
 *
 * That wrapper sets `transaction_read_only = on`, so an upsert inside it fails at the
 * database with `25006` — which is the wrapper working, exactly as its header says. The
 * route reads the panel's numbers inside the block and calls `putInsight` outside it.
 * **Do not "tidy" the two into one transaction.**
 *
 * ── `updatedAt` IS SET BY HAND, AND IT IS THE ONLY THING ON SCREEN ─────────
 *
 * `blog_post_locales.updated_at` records the measurement that CLAUDE.md's blanket rule
 * predates: on the pinned drizzle, `$onUpdate()` *does* fire inside
 * `onConflictDoUpdate`. The rule is kept anyway and for the same reason — the button's
 * whole visible promise is *"terakhir diperbarui &lt;when&gt;"*, and a claim a person reads
 * must not rest on an undocumented behaviour of a dependency that could be bumped.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { adminInsights } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';
import type { Range } from './metrics';

/** One cached insight, in the shape a page hands to `InsightBox`. */
export type StoredInsight = {
  panelId: string;
  body: string;
  inputHash: string;
  model: string;
  updatedAt: Date;
};

/**
 * Every stored insight for this exact range, keyed by panel.
 *
 * **A `Map` rather than an array, because every caller does a lookup by panel id** and
 * an array would put a `.find()` in thirteen render sites. Panels with no row are
 * simply absent — which is the empty state, and is what the first visit to any range
 * looks like.
 *
 * `panelIds` is required and is not a convenience: it bounds the read to the panels the
 * page actually renders, so a row left behind by a panel that has since been removed
 * cannot arrive at a component that has no idea what to do with it.
 */
export async function insightsForRange(
  db: DbOrTx,
  range: Range,
  panelIds: readonly string[],
): Promise<Map<string, StoredInsight>> {
  if (panelIds.length === 0) return new Map();

  const rows = await db
    .select({
      panelId: adminInsights.panelId,
      body: adminInsights.body,
      inputHash: adminInsights.inputHash,
      model: adminInsights.model,
      updatedAt: adminInsights.updatedAt,
    })
    .from(adminInsights)
    .where(
      and(
        eq(adminInsights.rangeFrom, range.from),
        eq(adminInsights.rangeTo, range.to),
        inArray(adminInsights.panelId, [...panelIds]),
      ),
    );

  return new Map(rows.map((r) => [r.panelId, r]));
}

/**
 * Store one insight, rotating whatever was there for the same `(panel, range)`.
 *
 * **AN UPSERT AND NOT AN INSERT, so the button is idempotent under a double tap** — two
 * rows for one panel would make `insightsForRange`'s `Map` keep whichever the planner
 * returned last, which is a silent coin flip between two paragraphs.
 *
 * There is deliberately no delete: an insight is superseded, never withdrawn, and a row
 * for a range nobody looks at costs a few hundred bytes.
 */
export async function putInsight(
  db: DbOrTx,
  row: {
    panelId: string;
    range: Range;
    body: string;
    inputHash: string;
    model: string;
  },
): Promise<void> {
  const now = new Date();
  await db
    .insert(adminInsights)
    .values({
      panelId: row.panelId,
      rangeFrom: row.range.from,
      rangeTo: row.range.to,
      body: row.body,
      inputHash: row.inputHash,
      model: row.model,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [adminInsights.panelId, adminInsights.rangeFrom, adminInsights.rangeTo],
      set: {
        body: row.body,
        inputHash: row.inputHash,
        model: row.model,
        // BY HAND. See the header — this column is the timestamp the operator reads.
        updatedAt: now,
      },
    });
}
