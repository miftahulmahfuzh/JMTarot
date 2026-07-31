/**
 * `/admin` -- the overview. "Is anything wrong right now."
 *
 * A1 shipped this file and A4 owns what is inside it. **The four things A4 must not delete**,
 * all asserted by `adminSurface.test.ts`: `requireAdminPage()` here as well as in the layout
 * (the layout renders above a page and is NOT a security boundary), `runtime`, `maxDuration`,
 * and the absence of a `<main>` and of a `robots` field.
 *
 * ── EVERY NUMBER IS QUERIED SERVER-SIDE. THERE IS NO FETCH (R21) ─────────────
 *
 * The range comes from `searchParams` and a change of range is a NAVIGATION, so this page has
 * no client fetch, no skeleton flash on a filter change and no stale-frame requirement. That is
 * what let A4 delete `/api/admin/metrics/[metric]`, which §4.1 assigned to "A3/A4" and R21
 * struck as a route nobody needed and two workstreams might have built.
 *
 * ── ONE ROLLUP, ONE READ-ONLY TRANSACTION ───────────────────────────────────
 *
 * `fleetRollup` is A3's composite and `FLEET_ROLLUP_QUERIES` is asserted by A3's own test with
 * a counting wrapper, so *"just one more metric"* shows up as a regression rather than as a
 * slightly slower page nobody measures. **Every admin request is a cold one** -- there is one
 * admin, so there is never a warm instance, and the first query also wakes a suspended Neon
 * compute, which §4.2 calls the single most likely live failure in v0.5.0. `withAdminRead`
 * bounds the database at 10s and `maxDuration` bounds the function at 30.
 *
 * ── A CARD MAY FAIL; THE PAGE MAY NOT (I-24) ────────────────────────────────
 *
 * The rollup is awaited inside a `<Suspense>` and a failure renders `ChartError` rather than
 * throwing, because a page that 500s tells an operator nothing on the one occasion they came
 * looking. `tally.ts`'s rule: a heuristic may fail a build; it may not fail a person.
 *
 * ── WHAT §6.1 ASKED FOR THAT IS NOT HERE, AND WHY ───────────────────────────
 *
 * §6.1 row 5 is *"which reader is consuming the calls"*, a stacked bar over three readers.
 * **A3's catalogue has no per-reader aggregate at all** -- `readings.reader_id` exists and no
 * shipped query groups by it. `src/lib/db/queries/admin/**` is A3's by §7, so A4 does not add
 * one: same ruling as §1.7's hour axis, same precedent (A1 declining `audit-secrets.ts` and
 * flagging it instead). The SERVICE dimension is answerable, from `ttftByService`, and ships
 * **labelled as readings rather than as calls**, because that is what it counts.
 */
import { Suspense, type ReactNode } from 'react';
import { requireAdminPage } from '@/lib/admin/identity';
import { db } from '@/lib/db/client';
import { callTotals } from '@/lib/db/queries/admin/calls';
import { insightsForRange } from '@/lib/db/queries/admin/insights';
import { fleetRollup, type FleetRollup } from '@/lib/db/queries/admin/rollup';
import { withAdminRead } from '@/lib/db/queries/admin/timeout';
import { periodDelta, priceRollup, slotFor } from '@/lib/analytics/rollup';
import { track } from '@/lib/analytics/track';
import { _ceilings } from '@/lib/llm/meter';
import { NOTIONAL_MODEL, priceFor } from '@/lib/llm/prices';
import { DIRECTION_SLOT, SERVICE_SLOT, slotColor } from '@/theme/chart';
import { Area } from '@/components/chart/Area';
import { AxisX, AxisY, PlotFrame } from '@/components/chart/Axis';
import { ChartError, ChartSkeleton } from '@/components/chart/ChartError';
import { ChartFrame } from '@/components/chart/ChartFrame';
import { ChartHover } from '@/components/chart/ChartHover';
import { Meter } from '@/components/chart/Meter';
import { StackedBar } from '@/components/chart/StackedBar';
import { Hero, KpiRow, StatTile } from '@/components/chart/StatTile';
import { domainMax, niceTicks, tickIndices } from '@/components/chart/geometry';
import type { Readout, TableSpec } from '@/components/chart/types';
import { AdminPageViewed } from './AdminPageViewed';
import { AdminTabs } from './AdminTabs';
import { InsightBox } from './InsightBox';
import { RangeFilter } from './RangeFilter';
import {
  OVERVIEW_PANEL_IDS,
  overviewInsightStates,
  type OverviewPanelId,
} from './insight/panels';
import { COMMON, OVERVIEW } from './copy';
import { compact, day, deltaGlyph, int, ms, pct, signedPct, usd } from './format';
import {
  assertDense,
  callSeries,
  tail,
  tokenSeries,
  ttftOverall,
  ttftServices,
} from './metrics';
import { parseRange, previousPeriod, type ParsedRange } from './range';
import styles from './page.module.css';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** The three services, in the fixed order `SERVICE_SLOT` keys. Colour follows the entity. */
const SERVICES = ['daily', 'spread3', 'yesno'] as const;

/**
 * The price lookup for the KPI tile. **EVERY model is priced at `NOTIONAL_MODEL`'s rate, not at
 * its own, and the 1440px shot is what caught the difference.**
 *
 * The tile is labelled *"Biaya notional"* (A-D7, R14): **what these tokens WOULD cost if the
 * fallback provider had to serve them** -- the number worth watching, because a z.ai key
 * revocation lands there and turns a subscription into a bill overnight.
 *
 * The first version passed A2's `priceFor` straight in, which prices each model at ITS OWN rate.
 * Every z.ai row is priced at **zero on purpose** (`prices.ts`: the Coding Plan is a fixed annual
 * subscription with no per-token charge), so the tile rendered `US$0,00` under the word
 * "notional" -- a real figure wearing a counterfactual's label, and the one reading an operator
 * must not take from it: *we are spending nothing.* Nothing about that is visible in a test; it
 * is visible in a screenshot, once, immediately.
 *
 * `NOTIONAL_MODEL` is deliberately unset today, so this returns `null` for every model, the
 * rollup's `costUsd` is `null`, and the tile renders the honest empty state plus the reason. When
 * a human fills that constant in, this starts answering with no other change.
 */
function notionalLookup(_model: string, on: string) {
  return NOTIONAL_MODEL === null ? null : priceFor(NOTIONAL_MODEL, on);
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const params = await searchParams;
  /* ONCE PER REQUEST, at the top of the page -- never inside a component's render.
     `Body` needs it too, for A7's staleness rule, so it is threaded rather than
     re-read. See `todayUtc` at the foot of this file. */
  const today = todayUtc();
  const parsed = parseRange(params, today);

  return (
    <div className={styles.page}>
      <AdminTabs active="/admin" />
      <AdminPageViewed page="/admin" />
      {/* HIDDEN, NOT DELETED: the tab row carries this word visibly now, and it was a
          character-for-character copy of the tab. A page with no level-1 heading leaves a
          screen-reader operator with no "where am I" -- see `AdminTabs.tsx`. */}
      <h1 className={styles.srOnly}>{OVERVIEW.title}</h1>
      <RangeFilter action="/admin" parsed={parsed} />
      <Suspense fallback={<Loading />}>
        <Body parsed={parsed} today={today} />
      </Suspense>
    </div>
  );
}

/** Reserves the height the first three cards will occupy, so nothing jumps (I-21). */
function Loading() {
  return (
    <div className={styles.grid}>
      <div className={styles.wide}>
        <ChartSkeleton height={96} label={COMMON.loading} />
      </div>
      <ChartSkeleton height={240} label={COMMON.loading} />
      <ChartSkeleton height={240} label={COMMON.loading} />
    </div>
  );
}

async function Body({ parsed, today }: { parsed: ParsedRange; today: string }) {
  // `track()` returns void and is NEVER awaited (I-23). The void return is the enforcement:
  // a function that cannot usefully be awaited does not acquire an `await` at 11pm.
  track('admin.page_viewed', { page: '/admin' });

  let data:
    | {
        rollup: FleetRollup;
        prev: FleetRollup;
        cost: ReturnType<typeof priceRollup>;
        stored: Awaited<ReturnType<typeof insightsForRange>>;
      }
    | null = null;

  try {
    const previous = previousPeriod(parsed.range);
    data = await withAdminRead(db, async (tx) => {
      const [rollup, prev, totals, stored] = await Promise.all([
        fleetRollup(tx, parsed.range),
        // The previous EQUAL-LENGTH period, immediately before. Equal length is what makes
        // `periodDelta` compare like with like.
        fleetRollup(tx, previous),
        callTotals(tx, parsed.range),
        /*
         * A7. **THE CACHED INSIGHTS ARE READ HERE, WITH THE NUMBERS, AND R21 SURVIVES:**
         * the box's first frame is server-rendered like everything else on this page and
         * the only fetch on it is the one a button press causes. One statement for all
         * six panels — see `queries/admin/insights.ts`.
         */
        insightsForRange(tx, parsed.range, OVERVIEW_PANEL_IDS),
      ]);
      return { rollup, prev, cost: priceRollup(totals, notionalLookup), stored };
    });
  } catch {
    /*
     * **NOTHING FROM THE DRIVER IS LOGGED HERE.** CLAUDE.md's rule: a postgres error quotes the
     * failing statement AND its bound parameters, and *every `catch` that touches the database
     * is a potential PII sink*. This page's parameters are two dates today; the rule is absolute
     * because the next query added here may not be. `withAdminRead`'s timeout path is where a
     * diagnosis belongs.
     */
    return <ChartError message={COMMON.chartFailed} detail={COMMON.chartFailedDetail} />;
  }

  const { rollup, prev, cost, stored } = data;

  // A sparse series is an ERROR, not a gap to fill: filling one invents data, and a chart
  // missing its left-hand side says nothing about it.
  const density = assertDense(
    rollup.callsByUtcDay.map((r) => r.bucket),
    parsed.range.from,
    parsed.range.to,
  );
  if (!density.dense) {
    return <ChartError message={COMMON.chartFailed} detail={COMMON.chartFailedDetail} />;
  }

  /*
   * A7. **PURE, AND IT ONLY HASHES PANELS THAT HAVE A ROW** — see
   * `insight/panels.ts`. The staleness question ("do these numbers still match the
   * prose?") cannot be asked in SQL, because the hash is over facts that exist only
   * once the rollup has been rendered, and the rollup is right here.
   */
  const insights = overviewInsightStates(
    { rollup, prev, cost },
    { from: parsed.range.from, to: parsed.range.to, days: parsed.days },
    stored,
    today,
  );
  const box = (panel: OverviewPanelId) => (
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
        <QuotaLead rollup={rollup} insight={box('overview.quota')} />
      </div>
      {/* The KPI row's tiles carry SPARKLINES, which are palette marks -- so the row needs an
          opaque panel of its own or they sit on the radial (R8). See `page.module.css`. */}
      <div className={`${styles.wide} ${styles.panel}`}>
        <Kpis
          rollup={rollup}
          prev={prev}
          cost={cost}
          days={parsed.days}
          insight={box('overview.kpis')}
        />
      </div>
      <div className={styles.wide}>
        <CallsPerDay rollup={rollup} insight={box('overview.calls')} />
      </div>
      <ServiceShare rollup={rollup} insight={box('overview.services')} />
      <TtftCard rollup={rollup} insight={box('overview.ttft')} />
      <StatusCard rollup={rollup} insight={box('overview.status')} />
    </div>
  );
}

/** The `insight` slot every panel below takes. Named so the six signatures read alike
 *  and so a panel that forgot one is visible at the call site rather than only here. */
type WithInsight = { insight: ReactNode };

/**
 * The hero and the meter: **calls in the worst rolling five-hour window against 280** (R14).
 *
 * Not notional spend. §7 gives five reasons and the strongest is that a headline number should
 * be the one that can hurt you -- z.ai's marginal cost per token is genuinely zero, so a dollar
 * figure is a counterfactual with no denominator. What can hurt is quota exhaustion and key
 * revocation, and that is metered in model calls per rolling five hours. `238 / 280` tells you
 * whether you are fine; `US$4,20` does not.
 *
 * **THE CEILING COMES FROM `meter.ts`, THE MODULE THAT OWNS IT.** §10 asked A3's `windowCalls`
 * to read `LLM_WINDOW_CALL_CEILING`; A3 shipped no such function, so the page resolves it --
 * through `_ceilings()`, the one exported accessor, and **not** by re-reading the env var with
 * a duplicated `280` fallback, which is exactly *"the number that goes stale"* §10 warned
 * about. `_ceilings` is labelled a test seam and using it beats copying the constant, because
 * the derivation of 280 (400 prompts x 70%) lives beside it.
 *
 * **`peak5h === null` MEANS NO DATA, WHICH IS NOT NO CALLS.** A3 is explicit: *a fuel gauge
 * reading empty because nothing was measured is the worst available failure for a surface whose
 * whole job is early warning.* So the hero prints the em dash and the meter reads 0 with its
 * "Aman" word -- the ratio text beside it is what distinguishes the two states.
 */
function QuotaLead({ rollup, insight }: { rollup: FleetRollup } & WithInsight) {
  const ceiling = _ceilings().hard;
  const used = rollup.peak5h?.calls ?? 0;
  const ratio = ceiling > 0 ? used / ceiling : 0;
  const state = ratio >= 0.9 ? 3 : ratio >= 0.8 ? 2 : ratio >= 0.65 ? 1 : 0;
  const { icon, label } = OVERVIEW.meterStates[state];

  return (
    <div className={styles.lead}>
      <Hero
        value={int(rollup.peak5h?.calls ?? null, COMMON.emptyCell)}
        label={OVERVIEW.heroLabel}
        sub={OVERVIEW.heroSub(int(used), int(ceiling), pct(ceiling > 0 ? ratio : null))}
      />
      <Meter
        used={used}
        ceiling={ceiling}
        icon={icon}
        stateLabel={label}
        ratioLabel={`${int(used)} / ${int(ceiling)}`}
        caveat={OVERVIEW.meterCaveat}
      />
      {/* Spans both columns above 520px. A third grid child would otherwise land in the
          hero's `max-content` column and wrap a paragraph to nothing. */}
      <div className={styles.leadInsight}>{insight}</div>
    </div>
  );
}

/** The five headline numbers, each against the previous equal-length period. */
function Kpis({
  rollup,
  prev,
  cost,
  days,
  insight,
}: {
  rollup: FleetRollup;
  prev: FleetRollup;
  cost: ReturnType<typeof priceRollup>;
  days: number;
} & WithInsight) {
  const calls = sum(rollup.callsByUtcDay.map((r) => r.calls));
  const prevCalls = sum(prev.callsByUtcDay.map((r) => r.calls));
  const tokens = tokenSeries(rollup.tokens, rollup.range.from, rollup.range.to);
  const prevTokens = tokenSeries(prev.tokens, prev.range.from, prev.range.to);
  const tokenTotal = sum(tokens.input) + sum(tokens.output);
  const prevTokenTotal = sum(prevTokens.input) + sum(prevTokens.output);
  const readings = sum(rollup.readings.map((r) => r.ok + r.partial));
  const prevReadings = sum(prev.readings.map((r) => r.ok + r.partial));
  const p95 = rollup.byOp.find((r) => r.op === 'reading')?.p95Ms ?? null;
  // The FLEET row, from the rollup -- never folded from the per-service rows, because the mean
  // of three p95s is not a p95. `null` when the range produced no measured reading at all.
  const ttftP95 = ttftOverall(rollup.ttft)?.p95Ms ?? null;

  const callsDelta = periodDelta(calls, prevCalls);
  const tokenDelta = periodDelta(tokenTotal, prevTokenTotal);
  const readingDelta = periodDelta(readings, prevReadings);

  return (
    <>
    <KpiRow>
      {/*
       * TILE 1 IS NOTIONAL SPEND, DEMOTED FROM THE HERO BY R14 -- and it keeps both
       * disclaimers A-D7 requires: the word "notional" in its label and a denominator beside
       * the figure. `costUsd` is null today because `NOTIONAL_MODEL` is deliberately unset
       * (nobody has read a current price page for the fallback provider), so this renders the
       * honest empty state and the reason, rather than `US$0,00` -- which would understate a
       * bill rather than admit to not knowing it.
       */}
      <StatTile
        label={OVERVIEW.kpi.spend}
        value={usd(cost.costUsd, COMMON.emptyCell)}
        note={
          cost.costUsd === null
            ? OVERVIEW.kpi.spendUnset
            : OVERVIEW.kpi.spendUnpriced(int(cost.unpricedCalls))
        }
      />
      <StatTile
        label={OVERVIEW.kpi.calls}
        value={compact(calls)}
        delta={
          callsDelta === null ? undefined : `${signedPct(callsDelta)} ${OVERVIEW.kpi.deltaVs(days)}`
        }
        deltaGlyph={deltaGlyph(callsDelta)}
        spark={{ values: tail(callSeries(rollup.callsByUtcDay)), slot: DIRECTION_SLOT.input }}
      />
      <StatTile
        label={OVERVIEW.kpi.tokens}
        value={compact(tokenTotal)}
        delta={
          tokenDelta === null ? undefined : `${signedPct(tokenDelta)} ${OVERVIEW.kpi.deltaVs(days)}`
        }
        deltaGlyph={deltaGlyph(tokenDelta)}
        // The unmeasured calls, RENDERED rather than hidden: a token total with no count of
        // what it could not see invites the reader to treat it as complete. This was nearly
        // every row until 2026-07-30, when the adapter started reading the right SSE event.
        note={OVERVIEW.kpi.tokensNullNote(int(tokens.nullInputCalls))}
      />
      <StatTile
        label={OVERVIEW.kpi.readings}
        value={compact(readings)}
        delta={
          readingDelta === null
            ? undefined
            : `${signedPct(readingDelta)} ${OVERVIEW.kpi.deltaVs(days)}`
        }
        deltaGlyph={deltaGlyph(readingDelta)}
        spark={{ values: tail(rollup.readings.map((r) => r.readings)), slot: SERVICE_SLOT.spread3 }}
      />
      {/*
       * TWO DURATION TILES, IN THIS ORDER, AND THE ORDER IS THE ARGUMENT. TTFT first because
       * it is the number about a PERSON -- the wait a querent sat through -- and the call
       * duration second because it is a number about a call. Before this pair shipped, the
       * only duration on the overview was `llm_calls.total_ms` for the `reading` op, whose
       * note denied being TTFT while nothing on the page rendered TTFT at all.
       *
       * They are never plotted together and never reconciled (R5): `total_ms` is timed from
       * above `gateReading`, so it is legitimately SMALLER than `reading.completed.total_ms`
       * and unrelated to the moment the first byte reached a phone.
       */}
      <StatTile
        label={OVERVIEW.kpi.ttftP95}
        value={ms(ttftP95)}
        note={OVERVIEW.kpi.ttftNote}
      />
      <StatTile
        label={OVERVIEW.kpi.p95}
        value={ms(p95)}
        // `llm_calls.total_ms` is the whole call; `readings.latency_ms` is time to first token.
        // One word, two meanings, one schema (R5) -- so the tile says which one this is.
        note={OVERVIEW.kpi.p95Note}
      />
    </KpiRow>
    {insight}
    </>
  );
}

/** Model calls per UTC day -- the one daily series that may be related to the quota. */
function CallsPerDay({ rollup, insight }: { rollup: FleetRollup } & WithInsight) {
  const values = callSeries(rollup.callsByUtcDay);
  const buckets = rollup.callsByUtcDay.map((r) => r.bucket);
  const { ticks, yMax } = niceTicks(domainMax([{ values }]));
  const series = [{ key: 'calls', slot: DIRECTION_SLOT.input, label: OVERVIEW.callsSeries, values }];

  const readouts: Readout[] = buckets.map((b, i) => ({
    heading: day(b),
    rows: [
      {
        label: OVERVIEW.callsSeries,
        value: int(values[i]),
        swatch: slotColor(DIRECTION_SLOT.input),
      },
    ],
  }));

  const table: TableSpec = {
    caption: OVERVIEW.callsTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [{ label: COMMON.dayColumn }, { label: OVERVIEW.callsSeries, numeric: true }],
    rows: buckets.map((b, i) => ({ cells: [day(b), int(values[i])] })),
  };

  return (
    <ChartFrame
      title={OVERVIEW.callsTitle}
      subtitle={OVERVIEW.callsSubtitle}
      series={series}
      table={table}
      insight={insight}
    >
      <PlotFrame>
        <AxisY ticks={ticks.map((t) => ({ at: t.at, label: compact(t.value) }))} />
        {/* ONE series, so no legend renders -- the title names it (I-9). */}
        <Area series={[series[0]]} yMax={yMax} />
        <AxisX ticks={xTicks(buckets)} />
        <ChartHover count={buckets.length} readouts={readouts} label={OVERVIEW.callsHoverLabel} />
      </PlotFrame>
    </ChartFrame>
  );
}

/**
 * Readings per service, as a horizontal stacked bar.
 *
 * **IT COUNTS READINGS AND SAYS SO.** §6.1 asked "which service is consuming the CALLS", and
 * the only per-service aggregate A3 ships is `ttftByService`, which counts rows in `readings`.
 * Those are different quantities in both directions -- a blocked reading makes no model call at
 * all, and one reading makes several -- so the card is titled and subtitled for what it
 * measures rather than for what was asked. A3 makes the same point about its own two series:
 * *"a readings-per-day series built from `llm_calls` would silently exclude exactly the
 * population the moderation gate exists for."*
 */
function ServiceShare({ rollup, insight }: { rollup: FleetRollup } & WithInsight) {
  // `ttftServices` drops the rollup's fleet row and pins the order to `SERVICE_SLOT`, which is
  // the same filter this card used to spell inline -- and the only thing that kept the fleet
  // row out of a stacked bar as a fourth, colourless segment.
  const known = ttftServices(rollup.ttft);
  const total = sum(known.map((r) => r.readings));
  const slot = (id: string) => slotFor(id as (typeof SERVICES)[number], SERVICES);

  const rows = [
    {
      key: 'services',
      label: OVERVIEW.kpi.readings,
      valueLabel: int(total),
      segments: known.map((r) => ({
        key: r.serviceId,
        slot: slot(r.serviceId),
        value: r.readings,
        readout: `${r.serviceId} — ${int(r.readings)}`,
      })),
    },
  ];

  const series = known.map((r) => ({
    key: r.serviceId,
    slot: slot(r.serviceId),
    label: r.serviceId,
    values: [r.readings],
  }));

  /*
   * ── THIS TABLE COUNTS READINGS AND NOTHING ELSE, SINCE 2026-07-30 ───────────
   *
   * It used to carry a third column of `r.p95Ms` -- a TTFT value from `readings.latency_ms` --
   * under `OVERVIEW.kpi.p95`, whose own text reads *"Total waktu panggilan, bukan waktu ke
   * token pertama."* **So the one place TTFT reached the overview declared itself to be the
   * thing it explicitly is not**, which is the merge M8 and R5 exist to prevent, and no test
   * could see it: a label and the provenance of the number beneath it are not comparable by
   * grep.
   *
   * The column is DELETED rather than relabelled, because `TtftCard` now owns per-service
   * TTFT with both percentiles. One owner per number: two cards printing one figure under two
   * labels is how the next reader decides the dashboard cannot be trusted.
   */
  const table: TableSpec = {
    caption: OVERVIEW.serviceTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: OVERVIEW.statusColumns.op },
      { label: OVERVIEW.kpi.readings, numeric: true },
    ],
    rows: known.map((r) => ({
      cells: [r.serviceId, int(r.readings)],
      swatch: slotColor(slot(r.serviceId)),
    })),
  };

  return (
    <ChartFrame
      title={OVERVIEW.serviceTitle}
      subtitle={OVERVIEW.readingsSubtitle}
      series={series}
      table={table}
      insight={insight}
    >
      <StackedBar rows={rows} />
    </ChartFrame>
  );
}

/**
 * **Time to first token — the wait a querent actually sat through.** From
 * `readings.latency_ms`, per service, plus the rollup's fleet row.
 *
 * ── WHY THIS CARD EXISTS ────────────────────────────────────────────────────
 *
 * A reading STREAMS, so its `llm_calls.total_ms` is not a measure of anybody's experience:
 * the querent starts reading at the first token and the call keeps running for seconds
 * afterwards. TTFT is the number that moves with how the app FEELS, and until 2026-07-30 the
 * overview rendered p50 nowhere and p95 only in `ServiceShare`'s table, mislabelled as total
 * call time. Smaller is better, which is the opposite direction from every other number on
 * this page and the reason the tile's note says so in words.
 *
 * ── A TABLE, AND TWO PRIMITIVES WERE DECLINED FOR CAUSE ─────────────────────
 *
 * `StackedBar` sends every row through `stackSegments`, which normalises each row to 100% of
 * **its own** total -- so three bars of duration would each fill the width and could not be
 * compared, which is the one thing this card is for. `Meter` would need a `ceiling`: a TTFT
 * target, which nobody has set, feeding a good→warning→critical ramp. Inventing one to earn a
 * colour is `NOTIONAL_MODEL` rendering `US$0,00` under the word "notional", and the same
 * discipline applies -- when the number would be a judgement, print the measurement and no
 * hue. `StatusCard` is the precedent for the form.
 *
 * **THE FLEET ROW IS `ttftOverall`, NEVER A SUM OR A MEAN OF THE THREE ABOVE IT.** That is the
 * entire reason `ttftByService` grew a `rollup()`; see its header. `null` prints the em dash.
 */
function TtftCard({ rollup, insight }: { rollup: FleetRollup } & WithInsight) {
  const services = ttftServices(rollup.ttft);
  const overall = ttftOverall(rollup.ttft);
  const slot = (id: string) => slotFor(id as (typeof SERVICES)[number], SERVICES);

  const rows = services.map((r) => ({
    cells: [r.serviceId, int(r.readings), ms(r.p50Ms), ms(r.p95Ms)],
    swatch: slotColor(slot(r.serviceId)),
  }));

  const table: TableSpec = {
    caption: OVERVIEW.ttftTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: OVERVIEW.ttftColumns.service },
      { label: OVERVIEW.ttftColumns.readings, numeric: true },
      { label: OVERVIEW.ttftColumns.p50, numeric: true },
      { label: OVERVIEW.ttftColumns.p95, numeric: true },
    ],
    // The fleet row is appended LAST and carries no swatch -- it is not an entity in the
    // palette, and giving it one would read as a fourth service.
    rows: overall
      ? [
          ...rows,
          {
            cells: [
              OVERVIEW.ttftTotal,
              int(overall.readings),
              ms(overall.p50Ms),
              ms(overall.p95Ms),
            ],
          },
        ]
      : rows,
  };

  return (
    <ChartFrame
      title={OVERVIEW.ttftTitle}
      subtitle={OVERVIEW.ttftSubtitle}
      series={[]}
      table={table}
      insight={insight}
    >
      <KpiRow>
        <StatTile label={OVERVIEW.ttftP50} value={ms(overall?.p50Ms ?? null)} />
        <StatTile label={OVERVIEW.ttftP95} value={ms(overall?.p95Ms ?? null)} />
      </KpiRow>
    </ChartFrame>
  );
}

/**
 * How calls end. **A TABLE, and §1.6 is the reason**: `llm_calls.status` has four values,
 * §5.1's palette has four slots of which one is Other, and §5.2 measured that a four-hue
 * good/warning/serious/critical ramp is unbuildable on this canvas -- amber against orange is
 * ΔE 2.3 under protanopia. So this card gets no colour at all, and `error_kind` (an open
 * vocabulary from `tee.ts`) would get none either.
 *
 * `series: []` is what tells `ChartFrame` to render no legend, which is correct for a table.
 * The three visible tiles are the summary; the per-op breakdown is in the table view, because a
 * card whose whole content lives inside a closed `<details>` is a card that looks empty.
 */
function StatusCard({ rollup, insight }: { rollup: FleetRollup } & WithInsight) {
  const calls = sum(rollup.byOp.map((r) => r.calls));
  const failed = sum(rollup.byOp.map((r) => r.failed));
  const aborted = sum(rollup.byOp.map((r) => r.aborted));

  const table: TableSpec = {
    caption: OVERVIEW.statusTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: OVERVIEW.statusColumns.op },
      { label: OVERVIEW.statusColumns.calls, numeric: true },
      { label: OVERVIEW.statusColumns.failed, numeric: true },
      { label: OVERVIEW.statusColumns.aborted, numeric: true },
    ],
    rows: rollup.byOp.map((r) => ({
      cells: [r.op, int(r.calls), int(r.failed), int(r.aborted)],
    })),
  };

  return (
    <ChartFrame
      title={OVERVIEW.statusTitle}
      subtitle={OVERVIEW.statusSubtitle}
      series={[]}
      table={table}
      insight={insight}
    >
      <KpiRow>
        <StatTile label={OVERVIEW.statusColumns.calls} value={int(calls)} />
        <StatTile label={OVERVIEW.statusColumns.failed} value={int(failed)} />
        <StatTile label={OVERVIEW.statusColumns.aborted} value={int(aborted)} />
      </KpiRow>
    </ChartFrame>
  );
}

/** Four x labels at most, both ends always included -- `marks-and-anatomy.md` forbids a number
 *  on every point, and at 320px there is room for about four. */
function xTicks(buckets: string[]): { at: number; label: string }[] {
  return tickIndices(buckets.length, 4).map((i) => ({
    at: buckets.length <= 1 ? 0 : i / (buckets.length - 1),
    label: day(buckets[i]),
  }));
}

function sum(values: readonly (number | null)[]): number {
  return values.reduce<number>((a, v) => (v === null || !Number.isFinite(v) ? a : a + v), 0);
}

/**
 * Today, in UTC, as `'YYYY-MM-DD'`.
 *
 * **CALLED ONCE PER REQUEST, AT THE TOP OF THE PAGE.** CLAUDE.md: *`todayKey()` IS NEVER
 * CALLED DURING RENDER* -- it reads `new Date()`, which differs between a server render and
 * hydration. Nothing on this page hydrates, so that half cannot fire; the rule is kept because
 * it is the one this project broke twice, and because one value per request is also what makes
 * the two admin pages agree about which day "today" is.
 *
 * **UTC rather than a querent's day, deliberately.** This is the default RANGE's endpoint and a
 * range is a fleet-wide question; the querent-day distinction belongs to the buckets inside it,
 * where A3 keeps it and labels it.
 */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
