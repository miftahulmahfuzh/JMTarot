import { describe, expect, it } from 'vitest';
import { panelIndexAt, shouldAutoSlide, type AutoSlideInput } from './swipeDeck';

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

const base: AutoSlideInput = {
  arrived: 'summary',
  panelKeys: ['bio', 'summary'],
  alreadySlidTo: new Set<string>(),
  interacted: false,
  focusIsElsewhere: false,
};

describe('shouldAutoSlide', () => {
  it('slides when a second panel arrives and nobody has touched anything', () => {
    expect(shouldAutoSlide(base)).toBe(true);
  });

  it('does not slide when there is nothing to slide to', () => {
    expect(shouldAutoSlide({ ...base, arrived: null })).toBe(false);
    expect(shouldAutoSlide({ ...base, panelKeys: ['bio'] })).toBe(false);
  });

  it('does not slide to panel 0, which is already showing', () => {
    expect(shouldAutoSlide({ ...base, arrived: 'bio' })).toBe(false);
  });

  it('does not slide to a key that is not in the deck', () => {
    expect(shouldAutoSlide({ ...base, arrived: 'persona' })).toBe(false);
  });

  it('FIRES EXACTLY ONCE. The summary re-renders on every chunk.', () => {
    expect(shouldAutoSlide({ ...base, alreadySlidTo: new Set(['summary']) })).toBe(false);
  });

  it('never steals a scroll the querent started', () => {
    expect(shouldAutoSlide({ ...base, interacted: true })).toBe(false);
  });

  it('never moves the page out from under a keyboard user who has gone elsewhere', () => {
    expect(shouldAutoSlide({ ...base, focusIsElsewhere: true })).toBe(false);
  });
});
