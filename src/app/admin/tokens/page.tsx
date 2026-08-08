/**
 * `/admin/tokens` -- "where is this going."
 *
 * Same route rules as `/admin` and **the same `RangeFilter` submitting the same search param**,
 * so the two pages cannot disagree about the range an operator is looking at. The only
 * difference in the form is its `action`, which is this page's own path -- a shared
 * `action="/admin"` would silently move somebody off this page every time they changed the
 * range.
 *
 * **NO HERO HERE, DELIBERATELY.** `Hero` is *exactly one per view* and the trajectory is this
 * page's lead. Two heroes on two pages of one dashboard is neither.
 *
 * ── THE TRAJECTORY IS THE ONE CHART THAT MAY NOT BE SIMPLIFIED ───────────────
 *
 * A-D8: *a forecast is NEVER rendered without its band and its `n`*, and below the minimum n it
 * is **not rendered at all** -- the empty state says how many more days it needs, rather than
 * drawing a line through nine points. `Trajectory` enforces the first half by taking A3's
 * `Forecast` union whole; this page enforces the second by always passing the footnote.
 *
 * **AND THE CROSSING IS A RANGE OF DATES, NEVER ONE DATE** (R26). `crossing()` returns
 * `earliest` (where the upper band reaches the ceiling) and `central` (where the point estimate
 * does), and rendering `central` alone is *the chart lying with a straight face*. `k` --
 * measured burstiness -- travels with it, because one abusive script shifts `k` with no visible
 * change in the daily series at all: the ceiling then arrives early while the chart looks
 * unchanged.
 */
import { Suspense, type ReactNode } from 'react';
import { requireAdminPage } from '@/lib/admin/identity';
import { db } from '@/lib/db/client';
import { callsByOp, modelsSeen, tokensByBucketAndModel, peakWindow5h, callsByUtcDay } from '@/lib/db/queries/admin/metrics';
import { insightsForRange } from '@/lib/db/queries/admin/insights';
import { userCostLeague } from '@/lib/db/queries/admin/users';
import { withAdminRead } from '@/lib/db/queries/admin/timeout';
import { burstiness, meanCallsPerDay } from '@/lib/analytics/rollup';
import { MIN_FORECAST_DAYS, crossing, forecast, horizon } from '@/lib/analytics/forecast';
import { dayCount } from '@/lib/analytics/series';
import { track } from '@/lib/analytics/track';
import { _ceilings } from '@/lib/llm/meter';
import { priceFor } from '@/lib/llm/prices';
import { DIRECTION_SLOT, SEQUENTIAL, slotColor } from '@/theme/chart';
import { AxisX, AxisY, PlotFrame } from '@/components/chart/Axis';
import { ChartError, ChartSkeleton } from '@/components/chart/ChartError';
import { ChartFrame } from '@/components/chart/ChartFrame';
import { ChartHover } from '@/components/chart/ChartHover';
import { Heatmap } from '@/components/chart/Heatmap';
import { Line } from '@/components/chart/Line';
import { StatTile } from '@/components/chart/StatTile';
import { Trajectory } from '@/components/chart/Trajectory';
import { domainMax, niceTicks, tickIndices } from '@/components/chart/geometry';
import type { Readout, TableSpec } from '@/components/chart/types';
import { AdminPageViewed } from '../AdminPageViewed';
import { AdminTabs } from '../AdminTabs';
import { InsightBox } from '../InsightBox';
import { RangeFilter } from '../RangeFilter';
import {
  TOKEN_PANEL_IDS,
  tokenInsightStates,
  type TokenPanelId,
} from '../insight/panels';
import { COMMON, TOKENS } from '../copy';
import { compact, day, dayWithYear, int, ms, oneDp, pct, shortId } from '../format';
import { assertDense, callSeries, league, opRows, tokenSeries, weekdayHeat } from '../metrics';
import { parseRange, rangeQuery, type ParsedRange } from '../range';
import styles from '../page.module.css';

export const runtime = 'nodejs';
export const maxDuration = 30;

export default async function AdminTokensPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const params = await searchParams;
  /* Once per request -- see `/admin/page.tsx`'s copy of this. */
  const today = todayUtc();
  const parsed = parseRange(params, today);

  return (
    <div className={styles.page}>
      <AdminTabs active="/admin/tokens" />
      <AdminPageViewed page="/admin/tokens" />
      {/* Hidden, not deleted -- see `/admin/page.tsx`. */}
      <h1 className={styles.srOnly}>{TOKENS.title}</h1>
      <RangeFilter action="/admin/tokens" parsed={parsed} />
      <Suspense fallback={<Loading />}>
        <Body parsed={parsed} today={today} />
      </Suspense>
    </div>
  );
}

function Loading() {
  return (
    <div className={styles.grid}>
      <div className={styles.wide}>
        <ChartSkeleton height={240} label={COMMON.loading} />
      </div>
      <div className={styles.wide}>
        <ChartSkeleton height={240} label={COMMON.loading} />
      </div>
    </div>
  );
}

async function Body({ parsed, today }: { parsed: ParsedRange; today: string }) {
  track('admin.page_viewed', { page: '/admin/tokens' });

  let data: {
    tokens: Awaited<ReturnType<typeof tokensByBucketAndModel>>;
    utc: Awaited<ReturnType<typeof callsByUtcDay>>;
    ops: Awaited<ReturnType<typeof callsByOp>>;
    models: Awaited<ReturnType<typeof modelsSeen>>;
    leagueRows: Awaited<ReturnType<typeof userCostLeague>>;
    peak: Awaited<ReturnType<typeof peakWindow5h>>;
    stored: Awaited<ReturnType<typeof insightsForRange>>;
  } | null = null;

  try {
    data = await withAdminRead(db, async (tx) => {
      /*
       * SIX statements rather than `fleetRollup`'s eight, and they are not the same six: this
       * page needs the per-model token grouping and the league, and does not need the readings
       * series or TTFT. Composing `fleetRollup` here would issue two of its queries for
       * nothing on the page whose queries are the heaviest.
       */
      const [tokens, utc, ops, models, leagueRows, peak, stored] = await Promise.all([
        tokensByBucketAndModel(tx, parsed.range),
        callsByUtcDay(tx, parsed.range),
        callsByOp(tx, parsed.range),
        modelsSeen(tx, parsed.range),
        userCostLeague(tx, parsed.range),
        peakWindow5h(tx, parsed.range),
        /*
         * A7. **A SEVENTH STATEMENT, AND IT IS NOT ONE OF THE SIX THE COMMENT ABOVE
         * COUNTS** -- those are the page's numbers, this is the cached prose about
         * them. One statement for all seven panels, read here so the box's first frame
         * is server-rendered and R21 survives: the only fetch on this page is the one a
         * button press causes.
         */
        insightsForRange(tx, parsed.range, TOKEN_PANEL_IDS),
      ]);
      return { tokens, utc, ops, models, leagueRows, peak, stored };
    });
  } catch {
    // No driver error is logged: every `catch` that touches the database is a potential PII
    // sink, and the rule is absolute rather than case-by-case.
    return <ChartError message={COMMON.chartFailed} detail={COMMON.chartFailedDetail} />;
  }

  const { tokens, utc, ops, models, leagueRows, peak, stored } = data;
  const density = assertDense(utc.map((r) => r.bucket), parsed.range.from, parsed.range.to);
  if (!density.dense) {
    return <ChartError message={COMMON.chartFailed} detail={COMMON.chartFailedDetail} />;
  }

  const series = tokenSeries(tokens, parsed.range.from, parsed.range.to);

  /* A7. Pure, and it only hashes panels that already have a row -- `insight/panels.ts`. */
  const insights = tokenInsightStates(
    { tokens, utc, ops, models, leagueRows, peak },
    { from: parsed.range.from, to: parsed.range.to, days: parsed.days },
    stored,
    today,
  );
  const box = (panel: TokenPanelId) => (
    <InsightBox
      panel={panel}
      from={parsed.range.from}
      to={parsed.range.to}
      initial={insights[panel]}
    />
  );

  return (
    <div className={styles.grid}>
      <div className={styles.wide}>
        <InputVsOutput series={series} insight={box('tokens.io')} />
      </div>
      <CacheHitRate series={series} insight={box('tokens.cache')} />
      <div className={styles.wide}>
        <TrajectoryCard
          utc={utc}
          peakCalls={peak?.calls ?? null}
          days={parsed.days}
          insight={box('tokens.trajectory')}
        />
      </div>
      <OpTable ops={ops} insight={box('tokens.ops')} />
      <LeagueTable rows={leagueRows} range={parsed.range} insight={box('tokens.league')} />
      <ModelTable models={models} rangeEnd={parsed.range.to} insight={box('tokens.models')} />
      <div className={styles.wide}>
        <WhenBusy utc={utc} insight={box('tokens.heat')} />
      </div>
    </div>
  );
}

/** The `insight` slot every panel below takes. See `/admin/page.tsx`'s copy of this. */
type WithInsight = { insight: ReactNode };

/**
 * **Input against output: two series, ONE axis** (A-D11, I-7). They share a unit, so this is
 * the case where two series on one scale is correct -- and `Line` takes a single `yMax`, so
 * there is no shape in which a second scale could arrive.
 *
 * The null-token count rides in the footnote rather than being hidden, because **a reader who
 * is not told what a series could not see will conclude it is complete.**
 *
 * **THAT FOOTNOTE USED TO BLAME THE PROVIDER AND IT WAS WRONG** (corrected 2026-07-30). It
 * said `input_tokens` was NULL for very nearly every row because z.ai reports `0`; in fact
 * `anthropic.ts` read the count from `message_start`, where that wire always sends `0`, while
 * the real figure arrived in `message_delta`. The count stays on screen — it is still the
 * honest denominator — but it now reads as ordinary rather than as structural.
 *
 * **Rows before that date keep NULL and there is no backfill**, so a range spanning it mixes
 * two measurements. `CacheHitRate` below solves the same problem for its own denominator, in
 * the only way that works: by counting only the rows that were measured.
 */
function InputVsOutput({
  series,
  insight,
}: { series: ReturnType<typeof tokenSeries> } & WithInsight) {
  const chartSeries = [
    { key: 'input', slot: DIRECTION_SLOT.input, label: TOKENS.ioInput, values: series.input },
    { key: 'output', slot: DIRECTION_SLOT.output, label: TOKENS.ioOutput, values: series.output },
  ];
  const { ticks, yMax } = niceTicks(domainMax(chartSeries));

  const readouts: Readout[] = series.buckets.map((b, i) => ({
    heading: day(b),
    rows: chartSeries.map((s) => ({
      label: s.label,
      value: compact(s.values[i]),
      swatch: slotColor(s.slot),
    })),
  }));

  const table: TableSpec = {
    caption: TOKENS.ioTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: COMMON.dayColumn },
      { label: TOKENS.ioInput, numeric: true },
      { label: TOKENS.ioOutput, numeric: true },
    ],
    rows: series.buckets.map((b, i) => ({
      cells: [day(b), int(series.input[i]), int(series.output[i])],
    })),
  };

  return (
    <ChartFrame
      title={TOKENS.ioTitle}
      subtitle={TOKENS.ioSubtitle}
      series={chartSeries}
      table={table}
      footnote={TOKENS.ioNullNote(int(series.nullInputCalls))}
      legendMark="line"
      insight={insight}
    >
      <PlotFrame>
        <AxisY ticks={ticks.map((t) => ({ at: t.at, label: compact(t.value) }))} />
        {/* Two series, direct-labelled at their ends (I-10), so identity is never
            colour-alone -- and since the palette is four wide, EVERY multi-series chart in
            this release is direct-labelled. */}
        <Line series={chartSeries} yMax={yMax} />
        <AxisX ticks={xTicks(series.buckets)} />
        <ChartHover
          count={series.buckets.length}
          readouts={readouts}
          label={TOKENS.ioHoverLabel}
        />
      </PlotFrame>
    </ChartFrame>
  );
}

/**
 * **How much of the prompt the provider served from its own cache.**
 *
 * ── THE DENOMINATOR IS THE ONLY INTERESTING THING HERE ───────────────────────
 *
 * `cachedBasisTokens`, not `totalInput`. `cache_read_tokens` is NULL for every
 * streamed row written before 2026-07-30 and for every call that died before
 * reporting usage -- and many of those rows carry a real `input_tokens`, because the
 * buffered path was never broken. Rating against total input would put a measured
 * numerator over an unmeasurable denominator and print a figure that only ever falls.
 *
 * **AND A RANGE WITH NOTHING MEASURED GETS AN EMPTY STATE, NEVER 0%.** "No calls
 * reported a cache figure" and "caching is not working" are different claims, and an
 * operator would act on the second one.
 *
 * Worth a tile at all because a prompt-layer edit can destroy cache locality while
 * the token chart barely moves -- and on a per-token provider that is most of the
 * input bill.
 */
function CacheHitRate({
  series,
  insight,
}: { series: ReturnType<typeof tokenSeries> } & WithInsight) {
  const measured = series.cachedBasisTokens > 0;
  return (
    /*
     * **THE ONE PANEL WITH NO CARD OF ITS OWN**, so the insight row needs the opaque
     * surface `.panel` paints -- R8: this tile can sit high in the viewport where
     * `Backdrop`'s radial is `#221a3a`, and a bare `StatTile` was already relying on the
     * grid cell around it. `styles.panel` is the same class the KPI row uses on `/admin`.
     */
    <div className={styles.panel}>
      <StatTile
        label={TOKENS.cacheTitle}
        value={measured ? pct(series.cacheReadTokens / series.cachedBasisTokens) : COMMON.emptyCell}
        note={
          measured
            ? TOKENS.cacheBasis(compact(series.cachedBasisTokens))
            : TOKENS.cacheUnmeasured
        }
      />
      {insight}
    </div>
  );
}

/**
 * The trajectory to the ceiling.
 *
 * ── THE BRIDGE FROM A DAILY SERIES TO A ROLLING-5h CEILING IS MEASURED ───────
 *
 * R26, and A3's analysis is the release's best piece of reasoning. The daily series and the 280
 * ceiling are in different units, and **both obvious conversions are wrong**: comparing
 * calls/day to 280 directly is wrong by 4.8x in the ALARMIST direction, and dividing by a flat
 * 4.8 assumes uniform traffic -- which a consumer app with an evening certainly is not -- and is
 * wrong in the DANGEROUS direction, because the real five-hour peak crosses the ceiling while
 * the figure still reads comfortable.
 *
 * So `k = peak5h / (meanCallsPerDay x 5/24)` is MEASURED, and the ceiling is expressed in the
 * daily series' own units as `dailyEquivalentCeiling = 280 x (24/5) / k`. **`k` is displayed**,
 * because one abusive script shifts it with no visible change in the daily series at all.
 *
 * When `k` cannot be measured -- no peak, or an empty range -- the ceiling line is simply not
 * drawn. An unconvertible ceiling drawn at 280 on a calls-per-day axis would be the alarmist
 * error, printed.
 */
function TrajectoryCard({
  utc,
  peakCalls,
  days,
  insight,
}: {
  utc: Awaited<ReturnType<typeof callsByUtcDay>>;
  peakCalls: number | null;
  days: number;
} & WithInsight) {
  const values = callSeries(utc);
  const buckets = utc.map((r) => r.bucket);
  const fit = forecast(values.map((v, t) => ({ t, y: v ?? 0 })));

  const perDay = meanCallsPerDay(
    values.reduce<number>((a, v) => a + (v ?? 0), 0),
    dayCount(buckets[0] ?? '', buckets[buckets.length - 1] ?? ''),
  );
  const k = burstiness(peakCalls, perDay);
  const windowCeiling = _ceilings().hard;
  const dailyCeiling = k === null || k <= 0 ? null : (windowCeiling * (24 / 5)) / k;

  // 30 days of projection: enough to see a slope, short enough that the band does not
  // dominate the plot. `crossing` walks up to 365 and reports a date range beyond it.
  const projection = horizon(fit, buckets[buckets.length - 1] ?? '', 30);
  const cross =
    dailyCeiling === null
      ? null
      : crossing(fit, dailyCeiling, buckets[buckets.length - 1] ?? '');

  const yMax = niceTicks(
    Math.max(
      domainMax([{ values }]),
      ...projection.map((p) => p.upper),
      dailyCeiling ?? 0,
    ),
  );

  const table: TableSpec = {
    caption: TOKENS.trajectoryTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: COMMON.dayColumn },
      { label: TOKENS.opColumns.calls, numeric: true },
    ],
    rows: [
      ...buckets.map((b, i) => ({ cells: [day(b), int(values[i])] })),
      ...projection.map((p) => ({
        cells: [`${day(p.day)} (proyeksi)`, `${int(Math.round(p.lower))}–${int(Math.round(p.upper))}`],
      })),
    ],
  };

  return (
    <ChartFrame
      title={TOKENS.trajectoryTitle}
      subtitle={TOKENS.trajectorySubtitle}
      series={[]}
      table={table}
      footnote={footnoteFor(fit, k, cross)}
      insight={insight}
    >
      <PlotFrame>
        <AxisY ticks={yMax.ticks.map((t) => ({ at: t.at, label: compact(t.value) }))} />
        <Trajectory
          actual={values}
          fit={fit}
          projection={fit.kind === 'trend' ? projection : []}
          ceiling={dailyCeiling ?? 0}
          yMax={yMax.yMax}
          ceilingLabel={`${TOKENS.ceilingLabel} ${compact(dailyCeiling === null ? null : Math.round(dailyCeiling))}`}
          insufficientText={TOKENS.trajectoryInsufficient(MIN_FORECAST_DAYS, days)}
        />
        <AxisX ticks={xTicks(buckets)} />
      </PlotFrame>
    </ChartFrame>
  );
}

/** `n`, R² and `k` (A-D8, R26), plus the crossing as a RANGE of dates and never one date. */
function footnoteFor(
  fit: ReturnType<typeof forecast>,
  k: number | null,
  cross: ReturnType<typeof crossing> | null,
): string {
  if (fit.kind === 'insufficient') return TOKENS.trajectoryInsufficient(fit.need, fit.have);
  if (fit.kind === 'flat') return TOKENS.trajectoryFlat;

  const head = TOKENS.trajectoryFootnote(fit.n, oneDp(fit.r2), oneDp(k));
  if (cross === null) return head;
  switch (cross.kind) {
    case 'crossing':
      return `${head} ${
        cross.central
          ? TOKENS.trajectoryCrossing(dayWithYear(cross.earliest.day), dayWithYear(cross.central.day))
          : TOKENS.trajectoryCrossingEarliestOnly(dayWithYear(cross.earliest.day))
      }`;
    case 'already-above':
      return `${head} ${TOKENS.trajectoryAlreadyAbove}`;
    case 'beyond-horizon':
      return `${head} ${TOKENS.trajectoryBeyond(cross.days)}`;
    default:
      return `${head} ${TOKENS.trajectoryNotApproaching}`;
  }
}

/**
 * Cost by purpose. **A TABLE with an inline bar, because thirteen `op` values is thirteen** --
 * §5.3's own rule that more than ~7 meaningful classes is a table, and R11 resolving the
 * roadmap's disagreement with itself in the table's favour. (Nine when this shipped; ten and
 * eleven on 2026-07-31, thirteen with v0.7.0's `chat_plan` and `chat_turn`.)
 *
 * The bar is a LENGTH encoding in one hue (sequential), which is a different thing from a
 * value-ramp on a nominal category: `op` has no natural order, so nothing here is
 * darker-where-bigger.
 *
 * ── FOUR OF THE THIRTEEN HAVE NO QUERENT BEHIND THEM, AND THE TABLE STILL SHOWS THEM ──
 *
 * `insight`, `blog_format`, `chat_plan`, `chat_turn` -- `src/lib/admin/ops.ts` is the
 * machine-checked list. **Deliberately unfiltered: showing what they cost is the entire
 * argument that earned each of those four values**, and `panels.ts:653` already records
 * excluding `insight` from the metric queries as a REJECTED fix for a different problem.
 * What their existence forbids is a *cost per reading* computed by dividing anything on this
 * page by `Bacaan selesai`, which is why the rule now lives in `ops.ts` rather than in four
 * paragraphs.
 */
function OpTable({
  ops,
  insight,
}: { ops: Awaited<ReturnType<typeof callsByOp>> } & WithInsight) {
  const rows = opRows(ops);
  const max = rows.reduce((a, r) => Math.max(a, r.calls), 0);

  const table: TableSpec = {
    caption: TOKENS.opTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: TOKENS.opColumns.op },
      { label: TOKENS.opColumns.calls, numeric: true },
      { label: TOKENS.opColumns.input, numeric: true },
      { label: TOKENS.opColumns.output, numeric: true },
      { label: TOKENS.opColumns.p95, numeric: true },
    ],
    rows: rows.map((r) => ({
      cells: [r.op, int(r.calls), compact(r.inputTokens), compact(r.outputTokens), ms(r.p95Ms)],
    })),
  };

  return (
    <ChartFrame
      title={TOKENS.opTitle}
      subtitle={TOKENS.opSubtitle}
      series={[]}
      table={table}
      insight={insight}
    >
      <InlineBars
        rows={rows.map((r) => ({
          key: r.op,
          label: r.op,
          value: r.calls,
          valueLabel: int(r.calls),
          share: max > 0 ? r.calls / max : 0,
        }))}
      />
    </ChartFrame>
  );
}

/**
 * The per-user league. **An id prefix and a link, no email and no nickname** (§1.11).
 *
 * Identity display belongs to A5's audited surface: an email here would owe an
 * `admin_access_log` row per RENDERED ROW, which is absurd, and omitting the audit would breach
 * A-D16. Eight hex characters is enough to tell two rows apart and to recognise one you have
 * seen, and the link goes to the page where identity is legitimately shown -- and audited.
 *
 * **The unattributed row is never dropped.** `llm_calls.user_id` is `on delete set null`, so a
 * hard-deleted user's tokens survive with the attribution gone, and they were still spent. A3
 * adds the consequence this page must state, and the footnote states it: cost-per-user
 * denominators shift over time.
 *
 * ── THE DRILL-DOWN CARRIES THE RANGE AND LANDS ON `#token` (2026-07-31) ──────
 *
 * **The range travels, because a drill-down that resets it is a drill-down to a different
 * number.** An operator reading this table over 7 days and clicking a row wants that person's
 * 7 days -- landing on `/admin/users/<id>`'s default 30 shows a token total that does not match
 * the row just clicked, and nothing on either screen says why. `rangeQuery` emits `from`/`to`
 * rather than `d` for the reason its own header gives.
 *
 * **And the fragment is `#token`, because the question this row asks is about tokens.** The
 * destination is fourteen panels deep and `#token` is the sixth; without it the operator lands
 * on `Identitas` and scrolls -- the same complaint that moved `Bacaan` to the bottom and made
 * `#bacaan` load-bearing on that page's own paging link. `AdminScrollToHash` on the destination
 * is what makes it work through `<Suspense>`; see that file.
 */
function LeagueTable({
  rows,
  range,
  insight,
}: {
  rows: Awaited<ReturnType<typeof userCostLeague>>;
  /** The window on screen, forwarded into every row's href. See the header. */
  range: ParsedRange['range'];
} & WithInsight) {
  const top = league(rows, 10);
  const max = top.reduce((a, r) => Math.max(a, r.tokens), 0);
  const query = rangeQuery(range);

  const table: TableSpec = {
    caption: TOKENS.leagueTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: TOKENS.leagueColumns.user },
      { label: TOKENS.leagueColumns.model },
      { label: TOKENS.leagueColumns.calls, numeric: true },
      { label: TOKENS.leagueColumns.tokens, numeric: true },
    ],
    rows: top.map((r) => ({
      cells: [
        shortId(r.userId, COMMON.unattributed),
        r.model,
        int(r.calls),
        compact(r.tokens),
      ],
    })),
  };

  return (
    <ChartFrame
      title={TOKENS.leagueTitle}
      subtitle={TOKENS.leagueSubtitle}
      series={[]}
      table={table}
      footnote={TOKENS.leagueCaveat}
      insight={insight}
    >
      <InlineBars
        rows={top.map((r) => ({
          key: `${r.userId ?? 'null'}-${r.model}`,
          label: shortId(r.userId, COMMON.unattributed),
          href: r.userId ? `/admin/users/${r.userId}?${query}#token` : undefined,
          linkLabel: r.userId
            ? TOKENS.leagueRowLink(shortId(r.userId, COMMON.unattributed), r.model)
            : undefined,
          value: r.tokens,
          valueLabel: compact(r.tokens),
          share: max > 0 ? r.tokens / max : 0,
        }))}
      />
    </ChartFrame>
  );
}

/** Which models ran, and which of them have no price row. The list that turns "why is the cost
 *  figure null" into a five-minute fix rather than an investigation. */
function ModelTable({
  models,
  rangeEnd,
  insight,
}: {
  models: Awaited<ReturnType<typeof modelsSeen>>;
  rangeEnd: string;
} & WithInsight) {
  const table: TableSpec = {
    caption: TOKENS.modelsTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: TOKENS.modelsColumns.model },
      { label: TOKENS.modelsColumns.calls, numeric: true },
      { label: TOKENS.modelsColumns.firstSeen },
      { label: TOKENS.modelsColumns.priced },
    ],
    rows: models.map((m) => ({
      cells: [
        m.model,
        int(m.calls),
        m.firstSeen.slice(0, 10),
        // `priceFor` is A2's and is PURE, so asking it here costs nothing and needs no query.
        priceFor(m.model, rangeEnd) ? TOKENS.modelPriced : TOKENS.modelUnpriced,
      ],
    })),
  };

  return (
    <ChartFrame
      title={TOKENS.modelsTitle}
      subtitle={TOKENS.modelsSubtitle}
      series={[]}
      table={table}
      insight={insight}
    >
      <InlineBars
        rows={models.map((m) => ({
          key: m.model,
          label: m.model,
          value: m.calls,
          valueLabel: int(m.calls),
          share: models[0] && models[0].calls > 0 ? m.calls / models[0].calls : 0,
        }))}
      />
    </ChartFrame>
  );
}

/**
 * When the app is used: **weekday x ISO week**, folded from the daily series.
 *
 * §5.3 asked for weekday x hour and §1.7 established that the hour half is not derivable from
 * `llm_calls` -- `local_date` has no time, `created_at` is UTC. A3 shipped no hour query and
 * `queries/admin/**` is A3's, so what ships is the axis §1.7 itself calls exact: *"weekday comes
 * from `local_date`, correct, no zone involved."* No pinning, no approximation and no label
 * narrowing a claim. `copy.ts` says so on the card.
 */
function WhenBusy({
  utc,
  insight,
}: { utc: Awaited<ReturnType<typeof callsByUtcDay>> } & WithInsight) {
  const heat = weekdayHeat(utc.map((r) => r.bucket), callSeries(utc));

  const table: TableSpec = {
    caption: TOKENS.heatTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: COMMON.dayColumn },
      { label: TOKENS.opColumns.calls, numeric: true },
    ],
    rows: heat.cells.map((c) => ({ cells: [day(c.day), int(c.value)] })),
  };

  return (
    <ChartFrame
      title={TOKENS.heatTitle}
      subtitle={TOKENS.heatSubtitle}
      series={[]}
      table={table}
      insight={insight}
    >
      <Heatmap
        cells={heat.cells.map((c) => ({
          row: c.row,
          col: c.col,
          value: c.value,
          readout: TOKENS.heatCell(day(c.day), day(c.week), int(c.value)),
        }))}
        rowLabels={[...TOKENS.heatWeekdays]}
        colLabels={heat.weeks.map((w) => day(w))}
        max={heat.max}
        scale={{
          caption: TOKENS.heatTitle,
          minLabel: TOKENS.heatScaleMin,
          maxLabel: int(heat.max),
        }}
      />
    </ChartFrame>
  );
}

/**
 * A table's inline bar column, rendered as rows of label + bar + value.
 *
 * **SEQUENTIAL, ONE HUE, AND IT IS A LENGTH ENCODING** -- the bar's width carries the number
 * and its colour carries nothing, which is what makes it legal on a nominal category where a
 * value-ramp would not be. It spends no categorical slot, which is the other half of why the
 * nine `op` values can be shown at all.
 *
 * Local to this page rather than a chart primitive, because it is table furniture: it takes
 * pre-formatted strings and a share, has no axis, no domain and no legend, and a primitive
 * would invite somebody to use it as a bar chart.
 *
 * ── A LINKED ROW IS AN ANCHOR, NOT A `<div>` CONTAINING ONE (2026-07-31) ─────
 *
 * The operator's report was that the league's rows *look* clickable and only the eight hex
 * characters are. The bar and the token count are the two things an operator is actually
 * pointing at when they decide to drill in, and both were dead. So the anchor **is** the grid
 * row when `href` is set, and the label/bar/value are its children.
 *
 * That also settles the tap target for good rather than by agreement: `page.module.css`'s note
 * records that `.inlineRow`'s 44px did NOT make the old inline anchor 44px -- measured at 16 --
 * and the fix was `display: flex; min-height: 44px` on the anchor. **Now the anchor and the row
 * are the same box**, so there is no second element whose height could drift from the row's.
 */
function InlineBars({
  rows,
}: {
  rows: {
    key: string;
    label: string;
    href?: string;
    /** The link's accessible name. Required WITH `href`: the visible label is an id prefix and
     *  a number, which tells a screen-reader operator nothing about where the row goes. */
    linkLabel?: string;
    value: number;
    valueLabel: string;
    share: number;
  }[];
}) {
  return (
    <div className={styles.inlineRows}>
      {rows.map((r) => {
        const cells = (
          <>
            <span className={styles.inlineLabel}>{r.label}</span>
            <span className={styles.inlineTrack}>
              <span
                className={styles.inlineFill}
                style={{
                  width: `${Math.max(0, Math.min(1, r.share)) * 100}%`,
                  // The middle step of the sequential ramp: dark enough to read as a mark at
                  // 4.02:1's neighbour, light enough not to compete with the numbers beside it.
                  background: SEQUENTIAL[2],
                }}
              />
            </span>
            <span className={styles.inlineValue}>{r.valueLabel}</span>
          </>
        );

        // `prefetch={false}` is not available on a plain anchor and is not needed: this is a
        // link an operator clicks, not one on a hot path. A5 owns the target.
        return r.href ? (
          <a
            key={r.key}
            className={`${styles.inlineRow} ${styles.inlineRowLink}`}
            href={r.href}
            aria-label={r.linkLabel}
          >
            {cells}
          </a>
        ) : (
          <div key={r.key} className={styles.inlineRow}>
            {cells}
          </div>
        );
      })}
    </div>
  );
}

function xTicks(buckets: string[]): { at: number; label: string }[] {
  return tickIndices(buckets.length, 4).map((i) => ({
    at: buckets.length <= 1 ? 0 : i / (buckets.length - 1),
    label: day(buckets[i]),
  }));
}

/** See `/admin`'s copy of this: once per request, never during a component's render. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
