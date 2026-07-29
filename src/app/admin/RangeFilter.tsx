/**
 * The date range filter. **A SERVER COMPONENT** -- there is no `'use client'` in this file and
 * there must not be.
 *
 * ── A `<form method="get">`, SO A RANGE CHANGE IS A NAVIGATION (I-20, R21) ────
 *
 * Every control here submits a GET to the page's own path, so the new range arrives as a fresh
 * server render with no JavaScript involved at all. That is what let A4 delete
 * `/api/admin/metrics/[metric]` -- an unowned route §4.1 assigned to "A3/A4" and R21 struck --
 * and it is why neither page needs hydration.
 *
 * The presets are `<button name="d" value="7">` inside one form: a submit button's own
 * name/value pair is what gets sent, so four presets need one form and no script. The custom
 * range's two date inputs share it, and `from`/`to` take precedence over `d` in `parseRange`.
 *
 * **`action` IS THE PAGE'S OWN PATH, PASSED IN**, because the two pages must submit to
 * themselves: a shared `action="/admin"` would silently move an operator off `/admin/tokens`
 * every time they changed the range.
 */
import { COMMON } from './copy';
import { dayWithYear } from './format';
import { RANGE_PARAM, RANGE_PRESETS, type ParsedRange } from './range';
import styles from './RangeFilter.module.css';

export function RangeFilter({
  action,
  parsed,
}: {
  /** The page's own pathname -- `/admin` or `/admin/tokens`. See the header. */
  action: string;
  parsed: ParsedRange;
}) {
  const { range, preset, fellBack } = parsed;

  return (
    <form className={styles.filter} method="get" action={action}>
      <span className={styles.label}>{COMMON.rangeLabel}</span>

      <span className={styles.presets}>
        {RANGE_PRESETS.map((n) => (
          <button
            key={n}
            type="submit"
            name={RANGE_PARAM.days}
            value={String(n)}
            className={`${styles.preset}${preset === n ? ` ${styles.active}` : ''}`}
            // Not colour alone: `aria-current` is what tells a screen reader which range is
            // on screen, and the gold wash is the sighted half of the same fact.
            aria-current={preset === n ? 'true' : undefined}
          >
            {COMMON.rangeDays(n)}
          </button>
        ))}
      </span>

      <span className={styles.custom}>
        <label className={styles.label} htmlFor="admin-range-from">
          {COMMON.rangeFrom}
        </label>
        <input
          id="admin-range-from"
          className={styles.date}
          type="date"
          name={RANGE_PARAM.from}
          defaultValue={range.from}
        />
        <label className={styles.label} htmlFor="admin-range-to">
          {COMMON.rangeTo}
        </label>
        <input
          id="admin-range-to"
          className={styles.date}
          type="date"
          name={RANGE_PARAM.to}
          defaultValue={range.to}
        />
        <button type="submit" className={styles.apply}>
          {COMMON.rangeApply}
        </button>
      </span>

      {/* Which range is actually on screen. A filter showing four presets and no dates leaves
          an operator guessing whether "30 hari" ended today or yesterday. */}
      <span className={styles.shown}>
        {COMMON.rangeShown(dayWithYear(range.from), dayWithYear(range.to))}
      </span>

      {fellBack ? <p className={styles.fellBack}>{COMMON.rangeFellBack}</p> : null}
    </form>
  );
}
