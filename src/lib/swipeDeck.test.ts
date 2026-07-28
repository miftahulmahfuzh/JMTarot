import { describe, expect, it } from 'vitest';
import { panelIndexAt } from './swipeDeck';

describe('panelIndexAt', () => {
  it('rounds to the nearest panel, because a snap container settles between them', () => {
    expect(panelIndexAt(0, 390, 2)).toBe(0);
    expect(panelIndexAt(194, 390, 2)).toBe(0);
    expect(panelIndexAt(196, 390, 2)).toBe(1);
    expect(panelIndexAt(390, 390, 2)).toBe(1);
  });

  it('clamps, because iOS rubber-banding reports a negative and an over-scrolled left', () => {
    expect(panelIndexAt(-40, 390, 2)).toBe(0);
    expect(panelIndexAt(1200, 390, 2)).toBe(1);
  });

  it('answers 0 for a container that has not laid out yet', () => {
    // clientWidth is 0 between mount and first layout, and x/0 is Infinity.
    expect(panelIndexAt(0, 0, 2)).toBe(0);
    expect(panelIndexAt(100, 0, 0)).toBe(0);
  });
});
