'use client';

/**
 * The filter (H8). No dependency, and there must not be one — VD17's argument
 * against a carousel library applies to a date picker with more force, because
 * the platform ships one.
 *
 * TWO CONTROLS, AND EACH DOES SOMETHING THE OTHER CANNOT:
 *
 *   - A scroll-snap strip of the days that ACTUALLY HAVE READINGS, newest first.
 *     Every chip is guaranteed non-empty, which is the thing a month grid cannot
 *     promise without a request per month. This is the control people will use.
 *   - A native `<input type="date">`, bounded by the first reading and today, for
 *     jumping to a specific old date. On iOS this is the system wheel, which is
 *     better than anything we would build and costs nothing.
 *
 * TODAY IS ALWAYS THE FIRST CHIP, even when it has no readings. The default
 * selection must be visible and re-selectable; a strip whose selected item is
 * not in it reads as broken.
 */
import { DAY_CHIP_LIMIT } from '@/lib/history/dates';
import { formatLocalDate } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './DateFilter.module.css';

export function DateFilter({
  today,
  selected,
  days,
  onChoose,
}: {
  today: string;
  selected: string;
  /** Newest first, as `historyDays` returns it. */
  days: string[];
  onChoose: (date: string, via: 'chip' | 'picker') => void;
}) {
  const t = useT();

  /*
   * Today, then every day with readings, then the selected day if the querent
   * reached an empty one through the picker. Deduped, then sorted newest-first
   * so an inserted selected day lands in its right place rather than at the end.
   */
  const chips = [...new Set([today, ...days, selected])]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .slice(0, DAY_CHIP_LIMIT);

  const thisYear = today.slice(0, 4);
  const withReadings = new Set(days);

  return (
    <div className={styles.filter}>
      <div className={styles.strip} role="group" aria-label={t('history.filter.aria')}>
        {chips.map((day) => (
          <button
            key={day}
            type="button"
            className={`${styles.chip}${day === selected ? ` ${styles.on}` : ''}${
              withReadings.has(day) ? '' : ` ${styles.bare}`
            }`}
            aria-pressed={day === selected}
            onClick={() => onChoose(day, 'chip')}
          >
            {day === today
              ? t('history.filter.today')
              : /* The year only when it is not this one -- otherwise every chip
                   carries four redundant characters on a 390px strip. */
                formatLocalDate(day, t.locale, day.slice(0, 4) !== thisYear)}
          </button>
        ))}
      </div>

      <label className={styles.pickerRow}>
        <span className={styles.pickerLabel}>{t('history.filter.label')}</span>
        <input
          type="date"
          className={styles.picker}
          value={selected}
          /*
           * `days` is newest-first, so the last entry is the OLDEST reading.
           * Bounding the input means the wheel cannot land on a day that could
           * not possibly have anything -- and `max={today}` is the client half of
           * the check `isHistoryDate` makes on the server.
           */
          min={days.length > 0 ? days[days.length - 1] : today}
          max={today}
          onChange={(e) => {
            const v = e.target.value;
            /* Clearing the field fires with an empty string. Ignoring it keeps
               the current day rather than resetting to an unfiltered state that
               this screen does not have. */
            if (v) onChoose(v, 'picker');
          }}
        />
      </label>
    </div>
  );
}
