/**
 * The stat tile, the KPI row and the hero figure. Server components, all three.
 *
 * ── EVERY COST FIGURE CARRIES ITS UNPRICED COUNT, AND THE TYPE IS WHY ────────
 *
 * A-D7: *a cost is never quoted over an incomplete denominator.* `note` is where that
 * count rides, and `metrics.ts` returns `{ usd, unpricedCalls }` as ONE required object so
 * a caller cannot render the figure and forget the caveat. `usd: null` renders the words
 * for "not yet priced" rather than `0` -- a zero silently understates the bill; a null
 * shows up on screen and gets fixed.
 *
 * ── THE DELTA IS SIGNED, NAMES ITS PERIOD, AND ITS COLOUR IS ON THE GLYPH ────
 *
 * A bare `+12%` invites the question "since when", and the honest answer is "against the
 * previous equal-length period", which is what `periodDelta` computes. `null` -- a previous
 * period of zero -- renders NOTHING rather than `+100%` or `∞%`: A3's own note says the two
 * plausible wrong answers are both worse than an empty state, because `100%` reads as
 * "doubled" when the truth is "started".
 *
 * `direction` is a prop rather than derived from the sign, because **up is not always
 * good**: tokens rising is neutral, failures rising is bad, and a component that coloured
 * by sign would need to know which metric it is showing. The caller knows.
 */
import type { ReactNode } from 'react';
import { STATUS } from '@/theme/chart';
import { Sparkline } from './Sparkline';
import type { Maybe } from './types';
import styles from './StatTile.module.css';

export type StatTileProps = {
  label: string;
  /** Pre-formatted (I-16, I-25): `Intl.NumberFormat('id-ID')` lives in `format.ts`. */
  value: string;
  unit?: string;
  /** Pre-formatted and signed, e.g. `+12% vs 30 hari sebelumnya`. Omit for no delta. */
  delta?: string;
  /**
   * What the delta MEANS, not which way it points. `'neutral'` leaves the glyph uncoloured
   * -- which is the right answer for most of this dashboard, where more tokens is neither
   * good nor bad.
   */
  deltaKind?: 'good' | 'bad' | 'neutral';
  /** `↑` / `↓`. A prop so a caller cannot get the arrow and the sign out of step. */
  deltaGlyph?: string;
  /** The unpriced count, the two-calendar warning, `belum berharga`. */
  note?: string;
  /** Twelve points, trimmed by the caller. Omit for a tile with no history. */
  spark?: { values: Maybe[]; slot: number };
};

export function StatTile({
  label,
  value,
  unit,
  delta,
  deltaKind = 'neutral',
  deltaGlyph,
  note,
  spark,
}: StatTileProps) {
  const glyphColour =
    deltaKind === 'good' ? STATUS.good : deltaKind === 'bad' ? STATUS.critical : undefined;

  return (
    <div className={styles.tile}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        {value}
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </span>
      {delta ? (
        <span className={styles.delta}>
          {deltaGlyph ? (
            // I-11: the colour is on the GLYPH. `#a3423a` is 3.04:1 -- a legal mark and
            // illegal text -- so the number stays `--text`.
            <span className={styles.deltaGlyph} style={{ color: glyphColour }} aria-hidden="true">
              {deltaGlyph}
            </span>
          ) : null}
          {delta}
        </span>
      ) : null}
      {note ? <span className={styles.note}>{note}</span> : null}
      {spark ? (
        <span className={styles.spark}>
          <Sparkline values={spark.values} slot={spark.slot} />
        </span>
      ) : null}
    </div>
  );
}

/** The KPI row. One column at 320, five at 1440, and no media query -- `auto-fit` plus
 *  `minmax(150px, 1fr)` does the whole job, which loop 4 measures at three widths. */
export function KpiRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}

/**
 * The one hero figure. **Exactly one per view** -- `/admin` has it and `/admin/tokens`
 * deliberately does not, because the trajectory is that page's lead and two heroes is
 * neither.
 *
 * **IT IS CALLS-IN-WINDOW OVER 280, NOT NOTIONAL SPEND** (R14). Five reasons in §7, and the
 * strongest is that a headline number should be the one that can hurt you: z.ai is a fixed
 * annual subscription, so its marginal cost per token is genuinely zero and a dollar figure
 * is a counterfactual with no denominator. What can hurt is quota exhaustion and key
 * revocation, and that is metered in model calls per rolling five hours. `238 / 280` tells
 * you whether you are fine; `$4.20` does not.
 */
export function Hero({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className={styles.hero}>
      <span className={styles.heroLabel}>{label}</span>
      <span className={styles.heroValue}>{value}</span>
      {sub ? <span className={styles.heroSub}>{sub}</span> : null}
    </div>
  );
}
