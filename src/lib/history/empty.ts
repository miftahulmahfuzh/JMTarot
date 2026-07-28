/**
 * WHICH EMPTY STATE, AND WHICH DAY TO OFFER. Pure, so the decision §4.8 argues
 * for does not need a DOM to check.
 *
 * `DaySummary` and `FrequencyLine` render NOTHING when there is nothing, and
 * CLAUDE.md records the reason: "an empty state announces that the feature
 * exists and that this user has not earned it." Both are AMBIENT — the querent
 * did not ask for them, so silence costs nothing and speaking costs the illusion.
 *
 * **HISTORY IS NOT AMBIENT. THE QUERENT TAPPED A MENU ITEM CALLED HISTORY.**
 * Silence there is not tact, it is a broken page: no list, no explanation and
 * nothing to do next. So it speaks — and it says two different things, because
 * conflating them produces a lie.
 */

/**
 * `'never'`            they have never read at all. A different sentence and a
 *                      link to the reader picker. Telling a first-time visitor
 *                      "nothing on 27 July" implies other days might have
 *                      something and sends them hunting through an empty
 *                      calendar.
 * `'day-with-nearest'` they have read, just not on this day, and there is a day
 *                      to offer. The most likely reason today is empty is that
 *                      they read yesterday, and the days query already knows
 *                      which day that was — so the dead end becomes one tap.
 * `'day-alone'`        this day is empty and there is no better one to offer.
 *                      Also the state WHILE THE DAYS QUERY IS STILL IN FLIGHT:
 *                      a user mid-load must not be told they have never read.
 */
export type EmptyKind = 'never' | 'day-with-nearest' | 'day-alone';

export type EmptyState = { kind: EmptyKind; nearest: string | null };

/**
 * `days` is newest-first, as `historyDays` returns it.
 *
 * `null` MEANS STILL LOADING AND IS NOT THE SAME AS `[]`. That distinction is
 * the whole reason this returns three values rather than two: `[]` is a fact
 * about the querent and `null` is a fact about the network, and rendering
 * "you have never read here" because a fetch has not landed yet is a false
 * statement about somebody's own past.
 */
export function emptyState(days: string[] | null, selected: string): EmptyState {
  if (days === null) return { kind: 'day-alone', nearest: null };
  if (days.length === 0) return { kind: 'never', nearest: null };

  /*
   * The first day BEFORE the selected one is the nearest earlier one, because
   * the array is newest-first. Failing that — the querent picked a day older
   * than everything they have — offer the most recent of all rather than
   * nothing, since "go to your latest reading" is still the useful next tap.
   *
   * BOTH LOOKUPS EXCLUDE `selected`, AND THE SECOND ONE IS NOT OBVIOUSLY
   * NECESSARY UNTIL IT IS. `days[0]` as the fallback offers the selected day
   * back to itself whenever `days` is `[selected]` — reachable when the strip is
   * stale against the list, which is exactly what happens if the list request
   * 503s while the days request succeeds, or if the day's only reading was
   * blocked between the two. The button would then be a button to the page you
   * are already looking at, still empty. A test names this case.
   */
  const nearest =
    days.find((d) => d < selected) ?? days.find((d) => d !== selected) ?? null;
  return nearest ? { kind: 'day-with-nearest', nearest } : { kind: 'day-alone', nearest: null };
}
