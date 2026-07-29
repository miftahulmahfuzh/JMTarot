/**
 * §4.7 — per-user token consumption. v0.5.0 / A5, task 14.
 *
 * ── TWO SERIES, ONE AXIS, AND THERE IS NO SHAPE IN WHICH A SECOND COULD ARRIVE ─
 *
 * Input against output share a unit, so this is the case where two series on one scale is
 * correct (A-D11) — and `Line` takes a single `yMax`, which is what makes a dual axis
 * unbuildable rather than merely forbidden. **Tokens against cost would be two charts.**
 *
 * ── EVERY BUCKET IS `local_date` (A5-15) ────────────────────────────────────
 *
 * The querent's own calendar day, never `created_at` in the server's zone. The integration
 * test seeds two calls on one UTC day with different `local_date`s and asserts the buckets move
 * with the second and not the first.
 *
 * ── EVERY COST FIGURE TRAVELS WITH ITS UNPRICED COUNT (A-D7) ────────────────
 *
 * z.ai is a fixed annual subscription whose marginal cost per token is genuinely zero, so the
 * number worth watching is what these calls WOULD cost at the fallback provider's rate — priced
 * at `NOTIONAL_MODEL` and not at each row's own model, which is the difference A4 found at
 * 1440px when the tile read `US$0,00` under the word "notional". `NOTIONAL_MODEL` is unset
 * today, so the tile prints the honest empty state and says why.
 *
 * ── AND THERE IS NO FORECAST HERE (§11.3, A-D8) ─────────────────────────────
 *
 * A per-user trajectory over one person's readings is below any honest minimum n. **A point
 * estimate from nine days of data, shown alone, is the chart lying with a straight face.** The
 * fleet trajectory is A4's, on `/admin/tokens`, where the n exists.
 */
import { AxisX, AxisY, PlotFrame } from '@/components/chart/Axis';
import { ChartFrame } from '@/components/chart/ChartFrame';
import { ChartHover } from '@/components/chart/ChartHover';
import { Line } from '@/components/chart/Line';
import { StackedBar } from '@/components/chart/StackedBar';
import { KpiRow, StatTile } from '@/components/chart/StatTile';
import { domainMax, niceTicks, tickIndices } from '@/components/chart/geometry';
import type { Readout, TableSpec } from '@/components/chart/types';
import { OTHER } from '@/lib/analytics/rollup';
import { NOTIONAL_MODEL, notionalUsd } from '@/lib/llm/prices';
import { DIRECTION_SLOT, OTHER_SLOT, slotColor } from '@/theme/chart';
import { compact, day, int, usd } from '../../../format';
import { foldedOps } from '../../../metrics';
import type { callsByOpForUser, UserTokenSeries } from '../../series';
import { DETAIL, U } from '../../copy';
import styles from '../detail.module.css';
import { Empty, Panel, DataTable } from './kit';

/**
 * Would the two end labels collide? See the call site.
 *
 * "Collide" is measured in the chart's own y units: the labels are ~12px of type in a plot whose
 * height is fixed, so two series whose last values are within a twentieth of the domain put their
 * baselines within a line of each other. A twentieth is the smallest gap worth trusting; below it
 * the legend is the identity.
 */
function endLabelsFit(series: Array<{ values: Array<number | null> }>, yMax: number): boolean {
  const ends = series.map((s) => s.values.at(-1) ?? 0).map((v) => v ?? 0);
  if (ends.length < 2 || yMax <= 0) return true;
  return Math.abs(ends[0] - ends[1]) / yMax > 0.05;
}

export function Tokens({
  series,
  byOp,
  rangeEnd,
}: {
  series: UserTokenSeries;
  byOp: ReturnType<typeof callsByOpForUser>;
  /** The range's last day: what the notional price is looked up AT. */
  rangeEnd: string;
}) {
  const c = DETAIL.tokens;
  const cost = notionalUsd(rangeEnd, series.totalInput, series.totalOutput);

  const chartSeries = [
    { key: 'input', slot: DIRECTION_SLOT.input, label: c.inputLabel, values: series.input },
    { key: 'output', slot: DIRECTION_SLOT.output, label: c.outputLabel, values: series.output },
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
    caption: c.seriesTitle,
    toggleLabel: c.tableToggle,
    emptyCell: U.empty,
    columns: [
      { label: c.dayColumn },
      { label: c.inputColumn, numeric: true },
      { label: c.outputColumn, numeric: true },
      { label: c.callsColumn, numeric: true },
    ],
    rows: series.buckets.map((b, i) => ({
      cells: [day(b), int(series.input[i]), int(series.output[i]), int(series.calls[i])],
    })),
  };

  // Top-3 + Other (R11): the categorical palette is four wide and **slot 4 IS Other**, so
  // "four plus Other" would need five slots and there are four.
  const folded = foldedOps(byOp.map((r) => ({ op: r.op, value: r.calls })));

  return (
    <Panel id="token" heading={c.heading} note={c.bucketNote}>
      <KpiRow>
        <StatTile label={c.kpiCalls} value={int(series.totalCalls)} />
        <StatTile label={c.kpiInput} value={compact(series.totalInput)} />
        <StatTile label={c.kpiOutput} value={compact(series.totalOutput)} />
        {/*
          * **THE COST TILE CARRIES NO `note`, AND THE 1440px SHOT IS WHY.** The first draft put
          * `unpricedNote` here as well as in the chart's footnote, so the same three-line sentence
          * rendered twice on one screen -- once wrapping over the KPI row, once under the chart.
          * A-D7 requires the unpriced count to travel WITH every cost figure, and the tile
          * immediately to the right of this one is that count. The sentence stays in the footnote,
          * once.
          */}
        <StatTile label={c.kpiCost} value={usd(cost)} />
        <StatTile label={c.kpiUnpriced} value={int(series.untokenized)} />
      </KpiRow>

      {series.totalCalls === 0 ? (
        <Empty>{U.none}</Empty>
      ) : (
        <>
          <ChartFrame
            title={c.seriesTitle}
            subtitle={c.seriesSubtitle}
            series={chartSeries}
            table={table}
            footnote={c.unpricedNote(series.untokenized)}
            legendMark="line"
          >
            <PlotFrame>
              <AxisY ticks={ticks.map((t) => ({ at: t.at, label: compact(t.value) }))} />
              {/*
                * **END LABELS ONLY WHEN THE TWO SERIES DO NOT END ON THE SAME VALUE.**
                * §5.4 obliges direct labels for ≤4 series *as well as* a legend, and the legend
                * is always there. But `Line` places each label at its own last point, so on a
                * range whose final day has no calls both series end at 0 and the two words
                * render on top of each other -- measured at 1440px, "INPUT" and "OUTPUT"
                * overlapping into one unreadable string. **A collided label communicates less
                * than no label**, and the obligation is met by the legend in that case.
                *
                * The underlying nudge belongs in `Line`, which is A4's file (§6). Flagged in
                * `docs/workstream-notes.md` rather than edited here.
                */}
              <Line series={chartSeries} yMax={yMax} showEndLabels={endLabelsFit(chartSeries, yMax)} />
              <AxisX
                ticks={tickIndices(series.buckets.length, 4).map((i) => ({
                  at: series.buckets.length <= 1 ? 0 : i / (series.buckets.length - 1),
                  label: day(series.buckets[i]),
                }))}
              />
              <ChartHover
                count={series.buckets.length}
                readouts={readouts}
                label={c.seriesTitle}
              />
            </PlotFrame>
          </ChartFrame>

          <h3 className={styles.h3}>{c.byOpTitle}</h3>
          <p className={styles.note}>{c.byOpSubtitle}</p>
          <StackedBar
            rows={[
              {
                key: 'ops',
                label: c.callsColumn,
                valueLabel: int(series.totalCalls),
                segments: folded.map((f) => ({
                  key: String(f.op),
                  slot: f.op === OTHER ? OTHER_SLOT : f.slot,
                  value: f.value,
                  readout: `${String(f.op)}: ${int(f.value)}`,
                })),
              },
            ]}
          />
          {/* The full nine, as a TABLE: >7 meaningful classes is a table and not more colours
              (§5.3), and the stacked bar above is the folded view of the same numbers. */}
          <DataTable
            caption={c.byOpTitle}
            columns={[{ label: c.opColumn }, { label: c.callsColumn, numeric: true }]}
            rows={byOp.map((r) => [r.op, int(r.calls)])}
          />
        </>
      )}
      <p className={styles.note}>{c.noForecast}</p>
    </Panel>
  );
}
