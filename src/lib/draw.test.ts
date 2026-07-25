import { describe, expect, it } from 'vitest';
import { togglePick } from './draw';

describe('togglePick', () => {
  it('appends a card in pick order', () => {
    expect(togglePick(togglePick([], 5, 3), 2, 3)).toEqual([5, 2]);
  });

  it('refuses to pick past the service card count', () => {
    const full = [5, 2, 9];
    expect(togglePick(full, 7, 3)).toBe(full); // same reference: no re-render
  });

  it('still returns a card from a full spread', () => {
    expect(togglePick([5, 2, 9], 2, 3)).toEqual([5, 9]);
  });

  it('closes the gap when the middle card is returned', () => {
    // The card that was in slot 3 must slide into slot 2, not strand itself.
    const afterReturn = togglePick([5, 2, 9], 2, 3);
    expect(afterReturn).toEqual([5, 9]);
    expect(afterReturn.indexOf(9)).toBe(1);
  });

  it('re-picks into the now-open last slot', () => {
    expect(togglePick(togglePick([5, 2, 9], 2, 3), 7, 3)).toEqual([5, 9, 7]);
  });

  it('handles a one-card service', () => {
    expect(togglePick([4], 11, 1)).toEqual([4]);
    expect(togglePick([4], 4, 1)).toEqual([]);
  });

  it('never mutates the array it was given', () => {
    const picks = [5, 2];
    togglePick(picks, 9, 3);
    togglePick(picks, 5, 3);
    expect(picks).toEqual([5, 2]);
  });
});
