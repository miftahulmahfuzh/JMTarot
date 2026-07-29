/**
 * One range in, every fleet metric out. **The composite, so a cold `/admin` is a
 * bounded number of round trips rather than one per tile.**
 *
 * A3, v0.5.0.
 *
 * ── IT COMPOSES THE M-FUNCTIONS AND DOES NOT RE-WRITE THEIR SQL ─────────────
 *
 * One definition per metric, or the dashboard and the documented query drift -- which
 * is the whole failure `docs/analytics-queries.md`'s opening rule is about. The cost is
 * one round trip per metric instead of a hand-tuned single statement; the benefit is
 * that `tokenLedgerDrift` on the page and query 16 in the document are the same
 * predicate, forever.
 *
 * **THE ROUND-TRIP COUNT IS ASSERTED BY A TEST WITH A COUNTING WRAPPER**, so a later
 * "just add one more metric" is visible as a regression rather than as a slightly
 * slower page nobody measures. Every admin request is a COLD one -- one admin, no warm
 * instance -- so the first query of a session also wakes a suspended Neon compute, and
 * roadmap §4.2 calls that the single most likely live failure in v0.5.0.
 *
 * ── AND THIS FILE IS NOT `src/lib/analytics/rollup.ts` ──────────────────────
 *
 * Same name, different jobs, and it is not duplication: `queries/contract.test.ts`
 * enforces handle-first on every export under `/queries/`, and **a pure fold has no
 * handle to take**, so the folds (`foldOps`, `priceRollup`, `burstiness`,
 * `dailyEquivalentCeiling`) live next door where `npm test` can reach them with no
 * database at all. This file is the part that touches the world.
 */
import type { DbOrTx } from '@/lib/db/types';
import {
  callsByOp,
  callsByUtcDay,
  modelsSeen,
  peakWindow5h,
  readingsByLocalDate,
  tokensByBucketAndModel,
  ttftByService,
  type ModelRow,
  type OpTotals,
  type PeakWindow,
  type Range,
  type ReadingDayRow,
  type TokenRow,
  type TtftRow,
  type UtcDayRow,
} from './metrics';
import { activeUsers } from './metrics';

export type FleetRollup = {
  range: Range;
  /** M1. **The only series that may be compared to the ceiling.** */
  callsByUtcDay: UtcDayRow[];
  /** M5. `null` means *no data*, which is not the same answer as *no calls*. */
  peak5h: PeakWindow | null;
  /** M4, nine rows at most. */
  byOp: OpTotals[];
  /** M3, per `(day, model)` -- the only priceable shape. */
  tokens: TokenRow[];
  /** M10, the unpriced denominator's raw material. */
  models: ModelRow[];
  /** M6. From `readings`, so a blocked reading is counted. */
  readings: ReadingDayRow[];
  /** M7. **Never `sum(M6.users)`.** */
  activeUsers: number;
  /** M8's TTFT half. Never plotted on one chart with `byOp`'s `total_ms`. */
  ttft: TtftRow[];
};

/**
 * How many statements `fleetRollup` issues, not counting `withAdminRead`'s two
 * `SET LOCAL`s and its savepoint pair. **The test asserts this exact number.**
 */
export const FLEET_ROLLUP_QUERIES = 8;

/**
 * Everything `/admin` and `/admin/tokens` need for one range.
 *
 * **NOT CACHED, AND A3 SHIPS NO CACHE AT ALL.** Every number is computed on read from
 * a small ledger, because a stale aggregate is worse than a slow one on a surface with
 * one reader -- and a cache here would be the second mechanism through which the
 * dashboard could disagree with the database.
 *
 * The eight run **concurrently**: they share one connection through the caller's
 * transaction, so postgres.js pipelines them rather than overlapping them, and the
 * ordering is irrelevant because every one is a read inside a read-only block.
 */
export async function fleetRollup(db: DbOrTx, range: Range): Promise<FleetRollup> {
  const [
    utc,
    peak,
    byOp,
    tokens,
    models,
    readings,
    actives,
    ttft,
  ] = await Promise.all([
    callsByUtcDay(db, range),
    peakWindow5h(db, range),
    callsByOp(db, range),
    tokensByBucketAndModel(db, range),
    modelsSeen(db, range),
    readingsByLocalDate(db, range),
    activeUsers(db, range),
    ttftByService(db, range),
  ]);

  return {
    range,
    callsByUtcDay: utc,
    peak5h: peak,
    byOp,
    tokens,
    models,
    readings,
    activeUsers: actives,
    ttft,
  };
}
