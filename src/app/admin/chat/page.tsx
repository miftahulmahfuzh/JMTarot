/**
 * `/admin/chat` -- "is the room alive". **F7, v0.7.0.**
 *
 * Nine panels, one `withAdminRead`, one `Hero`, and **no control of any kind**
 * (`[F7-1]`): no pause button, no ceiling editor, no per-user throttle. v0.5.0 §9's
 * non-negotiable 2 forbids a write surface over querent data in as many words, and a
 * button here would answer Miftah's requirement 9 with exactly the stinting he forbade.
 * The flags (`CHAT_ENABLED`, `CHAT_PROACTIVE_ENABLED`) are environment variables and
 * `docs/DEPLOY-VERCEL.md` §2d is their runbook.
 *
 * ── THE HERO IS THE PROACTIVE REPLY RATE, AND IT IS THE ONLY ONE (`[F7-12]`) ──
 *
 * *Hero is exactly one per view.* `/admin` has one (calls-in-window over the ceiling),
 * `/admin/tokens` has none because the trajectory is its lead, and this page has one
 * because roadmap §10.3 names the reply rate **the only continuous measurement of the
 * release once it has shipped.** R14 refused notional spend for `/admin`'s hero on the
 * ground that *"a hero figure needing two disclaimers is a KPI tile"*; this one needs
 * exactly one, and it goes in `sub` where `heroSub` already puts a denominator.
 *
 * ── R21 SURVIVES: THIS PAGE FETCHES NOTHING (`[F7-18]`) ────────────────────
 *
 * Every number is queried server-side inside one `withAdminRead`, the range is a GET
 * param, a range change is a NAVIGATION, and the insight box's first frame is
 * server-rendered from the same transaction. The only request this page ever makes is
 * the one an `Insight` press causes. A `/api/admin/chat/[metric]` route is precisely
 * the unowned route R21 struck once already.
 *
 * ── AND NOTHING HERE RENDERS A MESSAGE BODY (`[F7-13]`) ────────────────────
 *
 * Not a snippet, not a first line, not a nickname, not an email. `chat_messages.body`
 * is plaintext (`C-D20`) — it is not even behind `FIELD_ENCRYPTION_KEY` the way the six
 * onboarding answers are — and the protection is that nothing reads it.
 * `queries/admin/chat.ts` never selects it, so this page could not render one.
 */
import { Suspense, type ReactNode } from 'react';
import { requireAdminPage } from '@/lib/admin/identity';
import { db } from '@/lib/db/client';
import { chatRollup } from '@/lib/db/queries/admin/chat';
import { insightsForRange } from '@/lib/db/queries/admin/insights';
import { withAdminRead } from '@/lib/db/queries/admin/timeout';
import { priceRollup, slotFor } from '@/lib/analytics/rollup';
import { track } from '@/lib/analytics/track';
import { _ceilings } from '@/lib/llm/meter';
import { NOTIONAL_MODEL, priceFor } from '@/lib/llm/prices';
import { SEQUENTIAL, slotColor } from '@/theme/chart';
import { AxisX, AxisY, PlotFrame } from '@/components/chart/Axis';
import { ChartError, ChartSkeleton } from '@/components/chart/ChartError';
import { ChartFrame } from '@/components/chart/ChartFrame';
import { ChartHover } from '@/components/chart/ChartHover';
import { Line } from '@/components/chart/Line';
import { Meter } from '@/components/chart/Meter';
import { StackedBar, type StackRow } from '@/components/chart/StackedBar';
import { Hero, KpiRow, StatTile } from '@/components/chart/StatTile';
import { domainMax, niceTicks, tickIndices } from '@/components/chart/geometry';
import type { Readout, TableSpec } from '@/components/chart/types';
import { AdminPageViewed } from '../AdminPageViewed';
import { AdminTabs } from '../AdminTabs';
import { InsightBox } from '../InsightBox';
import { RangeFilter } from '../RangeFilter';
import { CHAT_PANEL_IDS, chatInsightStates, type ChatPanelId } from '../insight/panels';
import { CHAT, COMMON, OVERVIEW } from '../copy';
import { compact, day, int, ms, oneDp, pct, usd } from '../format';
import { parseRange, type ParsedRange } from '../range';
import styles from '../page.module.css';
import {
  beatFold,
  castFold,
  fleetShare,
  healthFold,
  intentFold,
  latencyFold,
  replyFold,
  runFold,
  tokenFold,
} from './series';
import { CHAT_OP_ORDER, REPLY_ORDER, RUN_KIND_ORDER, TARGET_ORDER } from './slots';

export const runtime = 'nodejs';
export const maxDuration = 30;

export default async function AdminChatPage({
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
      <AdminTabs active="/admin/chat" />
      <AdminPageViewed page="/admin/chat" />
      {/* Hidden, not deleted -- see `/admin/page.tsx`. */}
      <h1 className={styles.srOnly}>{CHAT.title}</h1>
      <RangeFilter action="/admin/chat" parsed={parsed} />
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

/**
 * `/admin/page.tsx`'s `notionalLookup`, copied for its stated reason: **every model is
 * priced at `NOTIONAL_MODEL`'s rate, not at its own**, because every z.ai row is priced
 * at zero on purpose and a real figure under the word "notional" reads as *we are
 * spending nothing*. `NOTIONAL_MODEL` is unset, so this returns `null` today and the
 * tile says *belum berharga* beside a call count (`[F7-7]`).
 *
 * `[F7-8]`: `CHAT_MODEL=glm-5.2` makes this page the first place a non-zero price could
 * appear, **and the page must not presume it.** `prices.ts` carries a `glm-5.2` row at
 * zero, verified 2026-08-01, for the same plan reason as `glm-4.6` — "correcting" those
 * zeros because the chat runs a newer model is exactly the inference `## The z.ai plan`
 * exists to prevent, and it has already been drawn once.
 */
function notionalLookup(_model: string, on: string) {
  return NOTIONAL_MODEL === null ? null : priceFor(NOTIONAL_MODEL, on);
}

async function Body({ parsed, today }: { parsed: ParsedRange; today: string }) {
  track('admin.page_viewed', { page: '/admin/chat' });

  let data: Awaited<ReturnType<typeof chatRollup>> | null = null;
  let stored: Awaited<ReturnType<typeof insightsForRange>> | null = null;

  try {
    const loaded = await withAdminRead(db, async (tx) => {
      const [rollup, insights] = await Promise.all([
        chatRollup(tx, parsed.range),
        /*
         * A7. The cached prose about the numbers, read here so the box's first frame is
         * server-rendered and R21 survives: the only fetch on this page is the one a
         * button press causes.
         */
        insightsForRange(tx, parsed.range, CHAT_PANEL_IDS),
      ]);
      return { rollup, insights };
    });
    data = loaded.rollup;
    stored = loaded.insights;
  } catch {
    /*
     * **NO DRIVER ERROR IS LOGGED** (`[F7-20]`, roadmap §9's non-negotiable 6). A
     * postgres error quotes the failing statement and its bound parameters, and this
     * page's queries touch a table whose `body` column is a person's conversation. The
     * rule is absolute rather than case-by-case.
     */
    return <ChartError message={COMMON.chartFailed} detail={COMMON.chartFailedDetail} />;
  }

  const insights = chatInsightStates(
    data,
    { from: parsed.range.from, to: parsed.range.to, days: parsed.days },
    stored,
    today,
  );
  const box = (panel: ChatPanelId) => (
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
        <ReplyRate data={data} insight={box('chat.reply')} />
      </div>
      <div className={styles.wide}>
        <RunsPerDay data={data} range={parsed.range} insight={box('chat.runs')} />
      </div>
      <BeatsPerRun data={data} insight={box('chat.beats')} />
      <Cast data={data} insight={box('chat.cast')} />
      <Intents data={data} insight={box('chat.intent')} />
      <div className={styles.wide}>
        <Tokens data={data} range={parsed.range} insight={box('chat.tokens')} />
      </div>
      <div className={styles.wide}>
        <Latency data={data} range={parsed.range} insight={box('chat.latency')} />
      </div>
      <Health data={data} insight={box('chat.health')} />
      <div className={styles.wide}>
        <Quota data={data} insight={box('chat.quota')} />
      </div>
    </div>
  );
}

/** The `insight` slot every panel below takes. See `/admin/page.tsx`'s copy of this. */
type WithInsight = { insight: ReactNode };
type Data = { data: Awaited<ReturnType<typeof chatRollup>> };

// ---------------------------------------------------------------------------
// P1 -- the scorecard
// ---------------------------------------------------------------------------

/**
 * **THE RELEASE'S OWN SCORECARD**, first on the page and carrying its one `Hero`.
 *
 * `C-N2f` verbatim: *did the querent answer a message they did not ask for, within 24
 * hours?* The colour dimension is the REPLY and the row axis is the TRIGGER
 * (`[F7-11]`), so *which trigger gets answered* is readable off the axis and the
 * two-value outcome is what colour carries.
 *
 * **`valueLabel` IS THE ROW'S DELIVERED COUNT**, so the denominator is printed on every
 * bar — A-D7's rule generalised from a cost to a rate.
 *
 * **NEVER A LINE OF THE RATE PER DAY.** A daily rate over a handful of runs is the *"big
 * percentage over a small base"* that `INSIGHT_SYSTEM` already lists as not-a-problem;
 * a chart of it would manufacture the finding the prompt forbids.
 */
function ReplyRate({ data, insight }: Data & WithInsight) {
  const fold = replyFold(data.reply);

  const rows: StackRow[] = fold.rows.map((r) => ({
    key: r.trigger,
    label: r.trigger,
    valueLabel: int(r.delivered),
    segments: [
      {
        key: 'replied',
        slot: slotFor('replied', REPLY_ORDER),
        value: r.replied,
        readout: `${CHAT.replySeries.replied}: ${int(r.replied)}`,
      },
      {
        key: 'silent',
        slot: slotFor('silent', REPLY_ORDER),
        value: r.delivered - r.replied,
        readout: `${CHAT.replySeries.silent}: ${int(r.delivered - r.replied)}`,
      },
    ],
  }));

  const table: TableSpec = {
    caption: CHAT.replyTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: CHAT.replyColumns.trigger },
      { label: CHAT.replyColumns.delivered, numeric: true },
      { label: CHAT.replyColumns.replied, numeric: true },
      { label: CHAT.replyColumns.pending, numeric: true },
      { label: CHAT.replyColumns.rate, numeric: true },
    ],
    rows: fold.rows.map((r) => ({
      cells: [r.trigger, int(r.delivered), int(r.replied), int(r.pending), pct(r.rate)],
    })),
  };

  return (
    <div className={styles.panel}>
      <div className={styles.lead}>
        <Hero
          value={pct(fold.rate, COMMON.emptyCell)}
          label={CHAT.replyHeroLabel}
          sub={CHAT.replyHeroSub(int(fold.replied), int(fold.delivered), pct(fold.rate))}
        />
        <KpiRow>
          <StatTile label={CHAT.replyDelivered} value={int(fold.delivered)} />
          <StatTile label={CHAT.replyReplied} value={int(fold.replied)} />
          {/* `[F7-3]`: pending runs are in NEITHER the numerator nor the denominator,
              and they are reported here so a low rate on a young range is legible as a
              young range rather than as a quiet room. */}
          <StatTile label={CHAT.replyPending} value={int(fold.pending)} />
        </KpiRow>
      </div>
      <ChartFrame
        title={CHAT.replyTitle}
        subtitle={CHAT.replySubtitle}
        series={[
          { key: 'replied', slot: slotFor('replied', REPLY_ORDER), label: CHAT.replySeries.replied, values: [] },
          { key: 'silent', slot: slotFor('silent', REPLY_ORDER), label: CHAT.replySeries.silent, values: [] },
        ]}
        table={table}
        footnote={CHAT.replyNotes[1]}
        insight={insight}
      >
        <StackedBar rows={rows} />
      </ChartFrame>
    </div>
  );
}

// ---------------------------------------------------------------------------
// P2 -- runs per day
// ---------------------------------------------------------------------------

/**
 * Two series, one axis, both counts — direct-labelled at the endpoint (I-10).
 *
 * **THE FIVE-WAY TRIGGER SPLIT LIVES IN THE TABLE, NOT IN THE CHART** (`[F7-10]`). Five
 * entities against four slots is the wall, and §5.3's own ruling for the nine ops is
 * the precedent: *more than ~7 meaningful classes is a table, not more colours* — and
 * at five it is still the right instinct when four hues are all there are.
 */
function RunsPerDay({
  data,
  range,
  insight,
}: Data & { range: ParsedRange['range'] } & WithInsight) {
  const fold = runFold(data.runs, range.from, range.to);
  const series = [
    {
      key: 'reactive',
      slot: slotFor('reactive', RUN_KIND_ORDER),
      label: CHAT.runsSeries.reactive,
      values: fold.reactive,
    },
    {
      key: 'proactive',
      slot: slotFor('proactive', RUN_KIND_ORDER),
      label: CHAT.runsSeries.proactive,
      values: fold.proactive,
    },
  ];
  const { ticks, yMax } = niceTicks(domainMax(series));

  const readouts: Readout[] = fold.buckets.map((b, i) => ({
    heading: day(b),
    rows: series.map((s) => ({
      label: s.label,
      value: int(s.values[i]),
      swatch: slotColor(s.slot),
    })),
  }));

  const table: TableSpec = {
    caption: CHAT.runsTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: COMMON.dayColumn },
      { label: CHAT.triggerLabels.user_message, numeric: true },
      { label: CHAT.triggerLabels.reading_completed, numeric: true },
      { label: CHAT.triggerLabels.idle_nudge, numeric: true },
      { label: CHAT.triggerLabels.unanswered, numeric: true },
      { label: CHAT.triggerLabels.cron, numeric: true },
    ],
    rows: fold.buckets.map((b, i) => ({
      cells: [
        day(b),
        int(fold.byTrigger.user_message[i]),
        int(fold.byTrigger.reading_completed[i]),
        int(fold.byTrigger.idle_nudge[i]),
        int(fold.byTrigger.unanswered[i]),
        int(fold.byTrigger.cron[i]),
      ],
    })),
  };

  return (
    <ChartFrame
      title={CHAT.runsTitle}
      subtitle={CHAT.runsSubtitle}
      series={series}
      table={table}
      footnote={CHAT.runsNotes[1]}
      legendMark="line"
      insight={insight}
    >
      <PlotFrame>
        <AxisY ticks={ticks.map((t) => ({ at: t.at, label: compact(t.value) }))} />
        <Line series={series} yMax={yMax} />
        <AxisX ticks={xTicks(fold.buckets)} />
        <ChartHover count={fold.buckets.length} readouts={readouts} label={CHAT.runsSubtitle} />
      </PlotFrame>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// P3 -- beats per run
// ---------------------------------------------------------------------------

/**
 * A horizontal histogram — **`InlineBars`, NOT `StackedBar`, and a screenshot is why.**
 *
 * `[F7-10]` said a histogram is a `StackedBar` with one segment per row. Measured at
 * 1440 on 2026-08-08: `stackSegments` normalises every row to 100% of its OWN total, so
 * a one-segment row is always full width — `0 beat` rendered as a full bar beside five
 * empty outlines and the distribution encoded nothing at all. `slots.ts` carries the
 * whole account. This is a **length encoding against the row maximum in one sequential
 * hue**, which spends no categorical slot and is the same furniture `/admin/tokens`
 * uses for the thirteen ops.
 *
 * The emphasis the plan wanted on `0 beat` is the `Kesenyapan` tile below, which is a
 * number rather than a hue somebody has to decode: `C-R6` makes a zero silence rate a
 * FINDING — *"a rate of zero means the director is not really deciding"* — and the copy
 * says so in capitals.
 */
function BeatsPerRun({ data, insight }: Data & WithInsight) {
  const fold = beatFold(data.beats);
  const max = fold.buckets.reduce((a, b) => Math.max(a, b.runs), 0);

  const table: TableSpec = {
    caption: CHAT.beatsTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: CHAT.beatsColumns.bucket },
      { label: CHAT.beatsColumns.runs, numeric: true },
      { label: CHAT.beatsColumns.share, numeric: true },
    ],
    rows: fold.buckets.map((b) => ({
      cells: [CHAT.beatsBucket(b.bucket), int(b.runs), pct(fold.total > 0 ? b.share : null)],
    })),
  };

  return (
    <ChartFrame
      title={CHAT.beatsTitle}
      subtitle={CHAT.beatsSubtitle}
      series={[]}
      table={table}
      footnote={CHAT.beatsNotes[1]}
      insight={insight}
    >
      <InlineBars
        rows={fold.buckets.map((b) => ({
          key: String(b.bucket),
          label: CHAT.beatsBucket(b.bucket),
          valueLabel: int(b.runs),
          share: max > 0 ? b.runs / max : 0,
        }))}
      />
      <div className={styles.panelTiles}>
        <KpiRow>
          {/* `null` prints the em dash, never `0%`: a zero silence rate is the finding and
              an empty range must not fabricate it. */}
          <StatTile label={CHAT.beatsSilence} value={pct(fold.silence, COMMON.emptyCell)} />
          <StatTile label={CHAT.beatsMean} value={oneDp(fold.mean, COMMON.emptyCell)} />
        </KpiRow>
      </div>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// P4 -- the cast
// ---------------------------------------------------------------------------

/**
 * Three rows (the readers) x three segments (who the beat was aimed at).
 *
 * **`READER_SLOT` IS DELIBERATELY NOT USED HERE** (`[F7-11]`, I-6: one entity dimension
 * per chart). The readers are named on the axis, so colour carries the TARGET. Keying
 * colour to the reader instead gives three one-segment bars in three colours — a legend
 * restating three axis labels — and the question the panel exists for, *does anybody
 * talk to anybody else*, becomes invisible.
 */
function Cast({ data, insight }: Data & WithInsight) {
  const fold = castFold(data.cast);

  const rows: StackRow[] = fold.rows.map((r) => ({
    key: r.author,
    label: r.author,
    valueLabel: int(r.total),
    segments: TARGET_ORDER.map((target) => ({
      key: target,
      slot: slotFor(target, TARGET_ORDER),
      value: r[target],
      readout: `${CHAT.castSeries[target]}: ${int(r[target])}`,
    })),
  }));

  const table: TableSpec = {
    caption: CHAT.castTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: CHAT.castColumns.reader },
      { label: CHAT.castColumns.querent, numeric: true },
      { label: CHAT.castColumns.reader2, numeric: true },
      { label: CHAT.castColumns.none, numeric: true },
      { label: CHAT.castColumns.total, numeric: true },
    ],
    rows: fold.rows.map((r) => ({
      cells: [r.author, int(r.querent), int(r.reader), int(r.none), int(r.total)],
    })),
  };

  return (
    <ChartFrame
      title={CHAT.castTitle}
      subtitle={CHAT.castSubtitle}
      series={TARGET_ORDER.map((target) => ({
        key: target,
        slot: slotFor(target, TARGET_ORDER),
        label: CHAT.castSeries[target],
        values: [],
      }))}
      table={table}
      footnote={CHAT.castNotes[0]}
      insight={insight}
    >
      <StackedBar rows={rows} />
      <div className={styles.panelTiles}>
        <KpiRow>
          <StatTile label={CHAT.castTopShare} value={pct(fold.topShare, COMMON.emptyCell)} />
        </KpiRow>
      </div>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// P5 -- beat intents
// ---------------------------------------------------------------------------

/**
 * A histogram in `INTENT_ORDER` and **never by rank** — `opRows`' rule, because an
 * order that changes with the data reads as the data changing. `InlineBars` for
 * `BeatsPerRun`'s measured reason.
 *
 * The tile is `C-N1d`'s number: *they ask questions*, one of the two things this
 * release is measured by. **This reads the director's PLAN, not the prose that
 * shipped**, and the footnote says so.
 */
function Intents({ data, insight }: Data & WithInsight) {
  const fold = intentFold(data.intents);
  const label = (intent: string | null) => intent ?? CHAT.intentUnrecorded;
  const max = fold.rows.reduce((a, r) => Math.max(a, r.beats), 0);

  const table: TableSpec = {
    caption: CHAT.intentTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: CHAT.intentColumns.intent },
      { label: CHAT.intentColumns.beats, numeric: true },
      { label: CHAT.intentColumns.share, numeric: true },
    ],
    rows: fold.rows.map((r) => ({
      cells: [label(r.intent), int(r.beats), pct(fold.total > 0 ? r.share : null)],
    })),
  };

  return (
    <ChartFrame
      title={CHAT.intentTitle}
      subtitle={CHAT.intentSubtitle}
      series={[]}
      table={table}
      footnote={CHAT.intentNotes[0]}
      insight={insight}
    >
      <InlineBars
        rows={fold.rows.map((r) => ({
          key: r.intent ?? 'unrecorded',
          label: label(r.intent),
          valueLabel: int(r.beats),
          share: max > 0 ? r.beats / max : 0,
        }))}
      />
      <div className={styles.panelTiles}>
        <KpiRow>
          <StatTile label={CHAT.intentAskShare} value={pct(fold.askShare, COMMON.emptyCell)} />
        </KpiRow>
      </div>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// P6 -- tokens
// ---------------------------------------------------------------------------

/**
 * Miftah's requirement 9, literally: what is the chat consuming, and how does that sit
 * against the rest of the app? **This panel answers it and restrains nothing**
 * (`[F7-1]`).
 *
 * Two series, one axis, both tokens. `C-D5`'s argument is the form's justification:
 * *"the director is a large prompt and a tiny JSON reply, a voice is a large prompt and
 * a two-sentence reply — averaging them makes both figures meaningless."*
 *
 * **COST NEVER ENTERS THE CHART** (A-D11, `[F7-17]`). Tokens per day is a `Line`, cost
 * is a tile. A dual axis is the single most common charting mistake and
 * `noDualAxis.test.ts` is a grep over a vocabulary, so the concept arrives by a word.
 */
function Tokens({
  data,
  range,
  insight,
}: Data & { range: ParsedRange['range'] } & WithInsight) {
  const fold = tokenFold(data.tokens, range.from, range.to);
  /*
   * `chatCallTotals` is `PriceableRow`-shaped, so A3's fold prices the chat with **no
   * edit to A3's or A2's code** — the whole reason this workstream needs no `op` field
   * on `PriceableRow`, and the whole reason `[F7-6]` holds.
   */
  const cost = priceRollup(data.callTotals, notionalLookup);
  const share = fleetShare(fold, data.fleetByOp);

  const series = CHAT_OP_ORDER.map((op) => ({
    key: op,
    slot: slotFor(op, CHAT_OP_ORDER),
    label: CHAT.tokensSeries[op],
    values: fold.byOp[op],
  }));
  const { ticks, yMax } = niceTicks(domainMax(series));

  const readouts: Readout[] = fold.buckets.map((b, i) => ({
    heading: day(b),
    rows: series.map((s) => ({
      label: s.label,
      value: compact(s.values[i]),
      swatch: slotColor(s.slot),
    })),
  }));

  const table: TableSpec = {
    caption: CHAT.tokensTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: COMMON.dayColumn },
      { label: CHAT.tokensColumns.plan, numeric: true },
      { label: CHAT.tokensColumns.turn, numeric: true },
    ],
    rows: fold.buckets.map((b, i) => ({
      cells: [day(b), int(fold.byOp.chat_plan[i]), int(fold.byOp.chat_turn[i])],
    })),
  };

  return (
    <ChartFrame
      title={CHAT.tokensTitle}
      subtitle={CHAT.tokensSubtitle}
      series={series}
      table={table}
      footnote={CHAT.tokensNotes[1]}
      legendMark="line"
      insight={insight}
    >
      <PlotFrame>
        <AxisY ticks={ticks.map((t) => ({ at: t.at, label: compact(t.value) }))} />
        <Line series={series} yMax={yMax} />
        <AxisX ticks={xTicks(fold.buckets)} />
        <ChartHover count={fold.buckets.length} readouts={readouts} label={CHAT.tokensSubtitle} />
      </PlotFrame>
      <div className={styles.panelTiles}>
        <KpiRow>
          <StatTile
            label={CHAT.tokensKpi.tokens}
            value={compact(fold.tokens)}
            // A-D7: the count of what could not be measured travels with the total, or a
            // token figure with no denominator beside it reads as complete.
            note={CHAT.tokensUnpriced(int(fold.untokenized))}
          />
          {/*
           * `[F7-7]`: **every cost figure renders beside the count of calls it could not
           * price.** `costUsd` is null today because `NOTIONAL_MODEL` is unset, so this
           * prints the em dash and the reason, never `US$0,00` — which would read as *we
           * are spending nothing* rather than as *nobody has read a price page*.
           */}
          <StatTile
            label={CHAT.tokensKpi.cost}
            value={usd(cost.costUsd, COMMON.emptyCell)}
            note={CHAT.tokensUnpriced(int(cost.unpricedCalls))}
          />
          <StatTile label={CHAT.tokensKpi.callShare} value={pct(share.calls, COMMON.emptyCell)} />
          <StatTile label={CHAT.tokensKpi.tokenShare} value={pct(share.tokens, COMMON.emptyCell)} />
        </KpiRow>
      </div>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// P7 -- latency
// ---------------------------------------------------------------------------

/**
 * p95 per day, two series, same slot order as the token panel **so the two agree about
 * which colour is the director.**
 *
 * Calls and latency never share a frame with tokens (`[F7-17]`), and this is time the
 * MODEL took, not time the querent felt: F3 computes the typing delay, F1 returns it and
 * F4 waits it out in the browser, and it is recorded nowhere.
 */
function Latency({
  data,
  range,
  insight,
}: Data & { range: ParsedRange['range'] } & WithInsight) {
  const fold = latencyFold(data.latency, range.from, range.to);

  const series = CHAT_OP_ORDER.map((op) => ({
    key: op,
    slot: slotFor(op, CHAT_OP_ORDER),
    label: CHAT.tokensSeries[op],
    values: fold.p95[op],
  }));
  const { ticks, yMax } = niceTicks(domainMax(series));

  const table: TableSpec = {
    caption: CHAT.latencyTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: COMMON.dayColumn },
      { label: CHAT.latencyColumns.plan, numeric: true },
      { label: CHAT.latencyColumns.turn, numeric: true },
    ],
    rows: fold.buckets.map((b, i) => ({
      cells: [day(b), ms(fold.p95.chat_plan[i]), ms(fold.p95.chat_turn[i])],
    })),
  };

  return (
    <ChartFrame
      title={CHAT.latencyTitle}
      subtitle={CHAT.latencySubtitle}
      series={series}
      table={table}
      footnote={CHAT.latencyNotes[0]}
      legendMark="line"
      insight={insight}
    >
      <PlotFrame>
        <AxisY ticks={ticks.map((t) => ({ at: t.at, label: compact(t.value) }))} />
        <Line series={series} yMax={yMax} />
        <AxisX ticks={xTicks(fold.buckets)} />
      </PlotFrame>
      <div className={styles.panelTiles}>
        <KpiRow>
          {CHAT_OP_ORDER.map((op) => (
            <StatTile
              key={op}
              label={`${CHAT.tokensSeries[op]} ${CHAT.latencyTiles.p95}`}
              value={ms(fold.overall[op].p95Ms)}
              note={`${CHAT.latencyTiles.p50} ${ms(fold.overall[op].p50Ms)}`}
            />
          ))}
        </KpiRow>
      </div>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// P8 -- run health
// ---------------------------------------------------------------------------

/**
 * **THE ONLY PLACE A DROPPED BEAT AND A DELIBERATE SILENCE CAN BE TOLD APART.**
 *
 * `C-R7`: there is no error bubble in this release — a failure is silence — so from
 * inside the room the two look identical. `InlineBars` for `BeatsPerRun`'s measured
 * reason; the emphasis on `abandoned` lives in the copy, which says out loud that
 * *"abandoned" here means every beat failed* — the OPPOSITE of what the word means on
 * the readings panel.
 */
function Health({ data, insight }: Data & WithInsight) {
  const fold = healthFold(data.health);
  const max = fold.statuses.reduce((a, s) => Math.max(a, s.runs), 0);

  const table: TableSpec = {
    caption: CHAT.healthTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: CHAT.healthColumns.status },
      { label: CHAT.healthColumns.runs, numeric: true },
      { label: CHAT.healthColumns.stuck, numeric: true },
    ],
    rows: fold.statuses.map((s) => ({ cells: [s.status, int(s.runs), int(s.stuck)] })),
  };

  return (
    <ChartFrame
      title={CHAT.healthTitle}
      subtitle={CHAT.healthSubtitle}
      series={[]}
      table={table}
      footnote={CHAT.healthNotes[0]}
      insight={insight}
    >
      <InlineBars
        rows={fold.statuses.map((s) => ({
          key: s.status,
          label: s.status,
          valueLabel: int(s.runs),
          share: max > 0 ? s.runs / max : 0,
        }))}
      />
      <div className={styles.panelTiles}>
        <KpiRow>
          <StatTile label={CHAT.healthKpi.dropped} value={int(fold.dropped)} />
          <StatTile
            label={CHAT.healthKpi.fallback}
            value={pct(fold.fallbackRate, COMMON.emptyCell)}
            note={int(fold.fallbackPlans)}
          />
          <StatTile label={CHAT.healthKpi.stuck} value={int(fold.stuck)} />
        </KpiRow>
      </div>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// P9 -- the quota
// ---------------------------------------------------------------------------

/**
 * `C-D6`'s promise made checkable: **a chat run must never be the reason a reading
 * fails.** Seam S11 assigns F1 the ceiling's new value and F7 the panel that shows
 * whether it was right.
 *
 * ── TWO METERS ARE NOT A DUAL-AXIS CHART ──────────────────────────────────
 *
 * They are two marks against two limits, each in its own frame. What A-D11 forbids is
 * two SCALES in ONE frame. The right-hand meter is the same number `/admin`'s hero
 * prints, from the same query — **if the two disagree, one of them is wrong**, and the
 * footnote says so.
 *
 * `Meter` takes an icon and a word as REQUIRED props precisely because §5.2 measured
 * that a four-hue traffic light is unbuildable on this canvas: the severity ramp is one
 * hue and colour alone may never carry the state.
 *
 * **THE CEILINGS COME FROM `_ceilings()`, NEVER `process.env`** (`[F7-15]`), and
 * `adminCopy.test.ts` bans both the literal and the variable read across this tree.
 */
function Quota({ data, insight }: Data & WithInsight) {
  const ceilings = _ceilings();
  const chatUsed = data.chatPeak?.calls ?? 0;
  const fleetUsed = data.fleetPeak?.calls ?? 0;
  const state = (used: number, ceiling: number) => {
    const ratio = ceiling > 0 ? used / ceiling : 0;
    return OVERVIEW.meterStates[ratio >= 0.9 ? 3 : ratio >= 0.8 ? 2 : ratio >= 0.65 ? 1 : 0];
  };
  const chatState = state(chatUsed, ceilings.chat);
  const fleetState = state(fleetUsed, ceilings.hard);

  const table: TableSpec = {
    caption: CHAT.quotaTitle,
    toggleLabel: COMMON.tableToggle,
    emptyCell: COMMON.emptyCell,
    columns: [
      { label: CHAT.quotaColumns.meter },
      { label: CHAT.quotaColumns.used, numeric: true },
      { label: CHAT.quotaColumns.ceiling, numeric: true },
      { label: CHAT.quotaColumns.pct, numeric: true },
    ],
    rows: [
      {
        cells: [
          CHAT.quotaChatLabel,
          int(data.chatPeak?.calls ?? null),
          int(ceilings.chat),
          pct(ceilings.chat > 0 && data.chatPeak ? chatUsed / ceilings.chat : null),
        ],
      },
      {
        cells: [
          CHAT.quotaFleetLabel,
          int(data.fleetPeak?.calls ?? null),
          int(ceilings.hard),
          pct(ceilings.hard > 0 && data.fleetPeak ? fleetUsed / ceilings.hard : null),
        ],
      },
    ],
  };

  return (
    <ChartFrame
      title={CHAT.quotaTitle}
      subtitle={CHAT.quotaSubtitle}
      series={[]}
      table={table}
      /* `OVERVIEW.meterCaveat` reused rather than restated: two spellings of *"angka ini
         batas bawah"* would drift, and it is the same fact about the same
         reconstruction. */
      footnote={OVERVIEW.meterCaveat}
      insight={insight}
    >
      <div className={styles.meterPair}>
        <Meter
          used={chatUsed}
          ceiling={ceilings.chat}
          icon={chatState.icon}
          stateLabel={chatState.label}
          ratioLabel={`${int(chatUsed)} / ${int(ceilings.chat)}`}
          caveat={CHAT.quotaNotes[0]}
        />
        <Meter
          used={fleetUsed}
          ceiling={ceilings.hard}
          icon={fleetState.icon}
          stateLabel={fleetState.label}
          ratioLabel={`${int(fleetUsed)} / ${int(ceilings.hard)}`}
          caveat={CHAT.quotaNotes[1]}
        />
      </div>
      <div className={styles.panelTiles}>
        <KpiRow>
          <StatTile
            label={CHAT.quotaShare}
            value={pct(fleetUsed > 0 ? chatUsed / fleetUsed : null, COMMON.emptyCell)}
          />
        </KpiRow>
      </div>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/**
 * A distribution as rows of label + bar + value.
 *
 * ── A SECOND LOCAL COPY OF `/admin/tokens`' `InlineBars`, AND THAT IS THE TRADE ──
 *
 * **SEQUENTIAL, ONE HUE, AND IT IS A LENGTH ENCODING** — the bar's width carries the
 * number and its colour carries nothing, which is what makes it legal on a nominal
 * category where a value-ramp would not be. It spends no categorical slot, which is
 * what lets thirteen ops be shown there and six intents here.
 *
 * **NOT PROMOTED TO `src/components/chart/**`**, and that is the existing copy's own
 * ruling rather than laziness: *"Local to this page rather than a chart primitive,
 * because it is table furniture: it takes pre-formatted strings and a share, has no
 * axis, no domain and no legend, and a primitive would invite somebody to use it as a
 * bar chart."* `[F7-16]` also forbids F7 adding a chart primitive outright. Forty lines
 * duplicated against a fence both pages want is the cheaper side.
 *
 * The other copy additionally supports a linked row; this one has nothing to link to,
 * so it does not, and the 44px tap-target argument that shaped that one does not arise.
 */
function InlineBars({
  rows,
}: {
  rows: { key: string; label: string; valueLabel: string; share: number }[];
}) {
  return (
    <div className={styles.inlineRows}>
      {rows.map((r) => (
        <div key={r.key} className={styles.inlineRow}>
          <span className={styles.inlineLabel}>{r.label}</span>
          <span className={styles.inlineTrack}>
            <span
              className={styles.inlineFill}
              style={{
                width: `${Math.max(0, Math.min(1, r.share)) * 100}%`,
                // The middle step of the sequential ramp, exactly as `/admin/tokens`
                // uses it: dark enough to read as a mark, light enough not to compete
                // with the numbers beside it.
                background: SEQUENTIAL[2],
              }}
            />
          </span>
          <span className={styles.inlineValue}>{r.valueLabel}</span>
        </div>
      ))}
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
