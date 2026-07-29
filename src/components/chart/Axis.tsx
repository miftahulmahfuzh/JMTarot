/**
 * The plot frame and its axes. **HTML positioned by percent, never SVG `<text>`** (§3).
 *
 * `PlotFrame` is the element every SVG chart fills and every HTML overlay is positioned
 * against: one known box, so a point at index `i` sits at `left: (i/(n-1))*100%` and
 * `top: (1 - v/yMax)*100%` with no measurement at all. `Line`, `Area`, `Trajectory` and
 * `ChartHover` all agree about geometry because they all divide by the same box.
 *
 * **Y ALWAYS INCLUDES 0** (I-8) -- `niceTicks` has no option to switch it off, and every
 * metric in this release is a count or a sum of counts. A truncated baseline on a count
 * exaggerates a change with nothing on screen to say so.
 *
 * Both tick arrays are REQUIRED props. A chart with no y-axis is a chart whose scale is
 * a secret, and `AxisY` renders the gridlines too, so omitting it would silently remove
 * them.
 */
import type { ReactNode } from 'react';
import type { AxisTick } from './types';
import styles from './Axis.module.css';

/** The box every plot and every overlay shares. */
export function PlotFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.plotFrame}>
      <div className={styles.plot}>{children}</div>
    </div>
  );
}

/**
 * Y ticks and their gridlines. `at` is a fraction from the BOTTOM (`niceTicks` returns it
 * that way), so nothing here inverts anything -- the one place an off-by-one-axis bug
 * could hide is the one place it is not written twice.
 *
 * The 0 tick draws no gridline: `PlotFrame`'s baseline is already there, and two 1px
 * rules at the same y read as a 2px one.
 */
export function AxisY({ ticks }: { ticks: AxisTick[] }) {
  return (
    <>
      {ticks.map((t) => (
        <span key={t.label} className={styles.yTick} style={{ bottom: `${t.at * 100}%` }}>
          {t.label}
        </span>
      ))}
      {ticks
        .filter((t) => t.at > 0)
        .map((t) => (
          <span
            key={`grid-${t.label}`}
            className={styles.gridline}
            style={{ bottom: `${t.at * 100}%` }}
            aria-hidden="true"
          />
        ))}
    </>
  );
}

/**
 * X ticks. **Selective, never one per point** -- the caller picks indices with
 * `tickIndices`, because `marks-and-anatomy.md` forbids a number on every point and at
 * 320px there is room for about four.
 *
 * The first and last are anchored inward rather than centred, so they cannot hang off
 * the plot at a phone width -- which is what makes `tickIndices`'s "always include both
 * ends" safe rather than a source of overflow. Loop 4 measures it.
 */
export function AxisX({ ticks }: { ticks: AxisTick[] }) {
  return (
    <>
      {ticks.map((t, i) => {
        const edge = t.at <= 0 ? ` ${styles.first}` : t.at >= 1 ? ` ${styles.last}` : '';
        return (
          <span
            key={`${t.label}-${i}`}
            className={`${styles.xTick}${edge}`}
            style={edge ? undefined : { left: `${t.at * 100}%` }}
          >
            {t.label}
          </span>
        );
      })}
    </>
  );
}
