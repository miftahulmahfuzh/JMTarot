/**
 * The stated failure state (I-24) and the skeleton (I-21).
 *
 * ── WHY A CARD RENDERS AN ERROR RATHER THAN THROWING ─────────────────────────
 *
 * §4.2: **every admin request is a cold one** -- there is one admin, so there is never a warm
 * instance, and the first query of a session also wakes a suspended Neon compute. A3 bounds
 * every query with a 10s statement timeout and throws a typed error; if that reached the page
 * uncaught, one slow aggregate would 500 the whole dashboard, on exactly the surface somebody
 * opens when something is already wrong.
 *
 * So each card catches, and this is what it renders: the card keeps its height, the other five
 * are unaffected, and the message says which number is missing rather than "something went
 * wrong". **`tally.ts`'s rule: a heuristic may fail a build; it may not fail a person.**
 *
 * Every string is a prop (I-16). `copy.ts` owns the Indonesian.
 */
import styles from './ChartError.module.css';

export function ChartError({ message, detail }: { message: string; detail?: string }) {
  return (
    <div className={styles.error} role="status">
      <span>
        <span className={styles.errorGlyph} aria-hidden="true">
          ⚠
        </span>{' '}
        {message}
      </span>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

/**
 * A skeleton that reserves the **exact** height its chart will occupy, so a slow card delays
 * one card and never moves the others (I-21). The height is a prop rather than a default,
 * because the two plot heights (200px / 240px) are a container-query decision the page knows
 * and this component cannot see.
 *
 * The pulse is off under `html[data-still]`, which is what makes a 1440px screenshot
 * reproducible -- `_accountshot.html`'s ruling: measure the resting state, do not wait for an
 * animation headless Chrome will not advance.
 */
export function ChartSkeleton({ height, label }: { height: number; label: string }) {
  return (
    <div>
      <div className={styles.skeleton} style={{ height }} aria-hidden="true" />
      <span className={styles.skeletonLabel}>{label}</span>
    </div>
  );
}
