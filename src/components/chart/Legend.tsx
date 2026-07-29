/**
 * The legend. **Imported by `ChartFrame` and by nothing else** (I-9), asserted in
 * `chart.contract.test.ts`.
 *
 * There is no toggle-to-isolate. It is the obvious feature and it needs a client
 * component, and I-17 caps this directory at exactly one (`ChartHover`) -- because
 * *server-rendered SVG needs no hydration at all* is the whole reason the dashboard can
 * be fast on a cold lambda, and that is lost one component at a time. The filter that
 * would isolate a series already exists as the range filter's own navigation, and a
 * reader who wants one series has the table view.
 *
 * `slotColor` resolves every swatch, so a legend cannot colour a series by its position
 * in the array even here (I-5).
 */
import { slotColor } from '@/theme/chart';
import type { ChartSeries } from './types';
import styles from './Legend.module.css';

export function Legend({ series, mark }: { series: ChartSeries[]; mark: 'rect' | 'line' }) {
  return (
    <ul className={styles.legend}>
      {series.map((s) => (
        <li key={s.key} className={styles.item}>
          <span
            className={mark === 'line' ? styles.line : styles.rect}
            style={{ background: slotColor(s.slot) }}
            aria-hidden="true"
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}
