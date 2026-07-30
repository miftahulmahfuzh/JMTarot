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
 * The presets are `<button name="d" value="7">`: a submit button's own name/value pair is what
 * gets sent, so four presets need one form and no script.
 *
 * ── TWO FORMS, AND THAT IS THE WHOLE BUG FIX. DO NOT MERGE THEM ───────────────
 *
 * **The presets and the two date inputs were one form, and it made every preset a no-op.** A
 * submit sends EVERY field in its form, so pressing `14 hari` sent `d=14` together with the
 * `from`/`to` pair already on screen -- and `parseRange` gives an explicit pair PRECEDENCE
 * over `d`. So the URL re-selected the range it was already showing: the dates did not move,
 * and neither did the pressed state, because `preset` is derived from whichever input won.
 * Reported as *"I clicked 14 hari and the date range didn't do shit"*.
 *
 * So the presets own one form and the custom range owns another, sharing `action`. A preset
 * now sends `d` ALONE, the next render computes the window from it, and the date inputs --
 * whose `defaultValue` is the resolved range, not the submitted params -- show the window the
 * preset just chose. **Nothing about the pressed state or the date values needed fixing**;
 * both were faithful renderings of a range the button had failed to change.
 *
 * The alternatives, for the next person who wants one form back: clearing the date inputs on
 * a preset press needs JavaScript on a page that deliberately has none, and flipping the
 * precedence in `parseRange` would leave `?d=14&from=…&to=…` in the bar with `from`/`to`
 * naming a range nobody is looking at. `RangeFilter.test.ts` asserts no form holds both.
 *
 * **`action` IS THE PAGE'S OWN PATH, PASSED IN**, because the two pages must submit to
 * themselves: a shared `action="/admin"` would silently move an operator off `/admin/tokens`
 * every time they changed the range. Both forms take it, for the same reason.
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
    <div className={styles.filter}>
      <form className={styles.group} method="get" action={action}>
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
      </form>

      <form className={styles.custom} method="get" action={action}>
        {/* `defaultValue` is the RESOLVED range, never the submitted params, which is what
            makes these two inputs follow a preset press. A `d=14` render puts the 14-day
            window in them, so the operator can read the exact dates the preset chose -- and
            can then nudge one end without retyping the other. */}
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
      </form>

      {/* Which range is actually on screen. A filter showing four presets and no dates leaves
          an operator guessing whether "30 hari" ended today or yesterday. Outside both forms:
          it is a statement, not a field, and a field in the wrong form is what broke this. */}
      <span className={styles.shown}>
        {COMMON.rangeShown(dayWithYear(range.from), dayWithYear(range.to))}
      </span>

      {fellBack ? <p className={styles.fellBack}>{COMMON.rangeFellBack}</p> : null}
    </div>
  );
}
