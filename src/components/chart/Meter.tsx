/**
 * The fuel gauge. One ratio against a limit -- which is the one part-to-whole job
 * `choosing-a-form.md` gives a meter rather than a bar, and the reason A4 declines the
 * donut §5.3 permits (I-14: that ratio IS this meter, and there is already one).
 *
 * ── THE ICON AND THE WORD ARE REQUIRED PROPS, NOT OPTIONS ────────────────────
 *
 * The severity ramp's adjacent normal-vision ΔE is 7.5, so **colour cannot carry the
 * state**. Making them required is the difference between a rule and a habit: a caller
 * cannot construct a gauge whose only signal is a hue.
 *
 * ── `meterFill` IS EXPORTED AND TESTED, BECAUSE THE THRESHOLDS ARE A CLAIM ───
 *
 * The fill's colour is a function of utilisation, and Task 10's acceptance is that 0%,
 * 65%, 80%, 90% and 100% produce five distinct `(fill, icon, word)` triples. That is a
 * property of a pure function, so it is one -- the component only positions things.
 *
 * The thresholds themselves are stated here and nowhere else. They are a JUDGEMENT and not
 * a measurement: 65% of a rolling five-hour quota is where a day's growth starts to matter,
 * 80% is where somebody should look, 90% is where the app is one busy evening from
 * revocation. Written down so they can be argued with rather than discovered.
 */
import { SEVERITY, STATUS } from '@/theme/chart';
import styles from './Meter.module.css';

/** Utilisation bands, in ascending order. The last one that a value clears wins. */
export const METER_THRESHOLDS = [0, 0.65, 0.8, 0.9] as const;

export type MeterState = 0 | 1 | 2 | 3;

/**
 * Which band a utilisation falls in. `used / ceiling`, clamped -- **above the ceiling is
 * the top band, not a fifth one**, because the ceiling is where enforcement happens and
 * there is nothing worse to say.
 */
export function meterState(used: number, ceiling: number): MeterState {
  if (!Number.isFinite(used) || !Number.isFinite(ceiling) || ceiling <= 0) return 0;
  const ratio = used / ceiling;
  let state: MeterState = 0;
  for (let i = 0; i < METER_THRESHOLDS.length; i += 1) {
    if (ratio >= METER_THRESHOLDS[i]) state = i as MeterState;
  }
  return state;
}

/**
 * The fill colour for a band. **`STATUS.good` at rest, then the severity ramp** -- §1.8's
 * departure. Note the ramp is entered at step 1, not step 0: `SEVERITY[0]` (`#e0a49c`) is
 * the pale pink that would make a healthy gauge look worried, and it is used only as the
 * scale's own light end elsewhere.
 */
export function meterFill(state: MeterState): string {
  return state === 0 ? STATUS.good : SEVERITY[state];
}

export type MeterProps = {
  used: number;
  ceiling: number;
  /** A glyph. Required: colour may not carry the state alone. */
  icon: string;
  /** A word. Required, for the same reason. */
  stateLabel: string;
  /** `238 / 280`, pre-formatted (I-16). */
  ratioLabel: string;
  /** R26's optimism sentence. **Required, because it must reach the page.** */
  caveat: string;
};

export function Meter({ used, ceiling, icon, stateLabel, ratioLabel, caveat }: MeterProps) {
  const state = meterState(used, ceiling);
  const pct = ceiling > 0 ? Math.max(0, Math.min(1, used / ceiling)) : 0;

  return (
    <div className={styles.meter}>
      <div
        className={styles.track}
        role="meter"
        aria-valuenow={Number.isFinite(used) ? used : 0}
        aria-valuemin={0}
        aria-valuemax={Number.isFinite(ceiling) ? ceiling : 0}
        aria-label={`${stateLabel} ${ratioLabel}`}
      >
        <span
          className={styles.fill}
          style={{ width: `${pct * 100}%`, background: meterFill(state) }}
        />
      </div>
      <div className={styles.readout}>
        <span className={styles.state}>
          {/* The state's colour lives on the GLYPH, never on the word (I-11). */}
          <span className={styles.icon} style={{ color: meterFill(state) }} aria-hidden="true">
            {icon}
          </span>
          {stateLabel}
        </span>
        <span className={styles.ratio}>{ratioLabel}</span>
      </div>
      <p className={styles.caveat}>{caveat}</p>
    </div>
  );
}
