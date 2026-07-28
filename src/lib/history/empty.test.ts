import { describe, expect, it } from 'vitest';
import { emptyState } from './empty';

const SELECTED = '2026-07-27';

describe('emptyState', () => {
  it('tells someone who has never read that there is nothing here yet', () => {
    expect(emptyState([], SELECTED)).toEqual({ kind: 'never', nearest: null });
  });

  it('offers the nearest earlier day to someone who has read before', () => {
    expect(emptyState(['2026-07-25', '2026-07-20'], SELECTED)).toEqual({
      kind: 'day-with-nearest',
      nearest: '2026-07-25',
    });
  });

  /**
   * Reached by the native picker: the querent jumped to a day older than
   * anything they have. "Go to your latest reading" is still the useful tap, so
   * the newest day is offered rather than nothing.
   */
  it('falls back to the most recent day when every reading is later', () => {
    expect(emptyState(['2026-07-29', '2026-07-28'], SELECTED)).toEqual({
      kind: 'day-with-nearest',
      nearest: '2026-07-29',
    });
  });

  /**
   * **THE ONE THAT MATTERS. `null` IS THE NETWORK, `[]` IS THE QUERENT.**
   * Rendering "you have never read here" because a fetch has not landed yet is a
   * false statement about somebody's own past, and it would appear for a fraction
   * of a second on every single visit.
   */
  it('says nothing about never having read while the days query is in flight', () => {
    expect(emptyState(null, SELECTED)).toEqual({ kind: 'day-alone', nearest: null });
  });

  /**
   * FOUND BY THIS TEST, NOT BY REVIEW. The fallback used to be `days[0]`, which
   * offers the selected day back to itself whenever `days` is `[selected]` --
   * reachable when the strip is stale against the list, which is what happens if
   * the list request 503s while the days request succeeds, or if the day's only
   * reading was blocked between the two. The querent gets a button to the empty
   * page they are already looking at.
   */
  it('does not offer the selected day back to itself', () => {
    expect(emptyState([SELECTED], SELECTED)).toEqual({ kind: 'day-alone', nearest: null });
  });

  it('still offers a real other day when the selected one is also listed', () => {
    expect(emptyState([SELECTED, '2026-07-20'], SELECTED)).toEqual({
      kind: 'day-with-nearest',
      nearest: '2026-07-20',
    });
  });
});
