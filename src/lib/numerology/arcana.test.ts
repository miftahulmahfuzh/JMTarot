/**
 * Numbers to cards, and the Shadow Arcana (roadmap §5, plan §4.4).
 *
 * DOMINANCE IS NOT HERE AND MUST NOT COME BACK. Reconciliation §5.4 moved
 * `Dominance`, `dominanceFor` and the composed frequency type to V3
 * (`src/lib/memory/frequency.ts` and `src/lib/memory/shadow.ts`), because the
 * thresholds are frequency-specific product judgement that V3 tunes against
 * real output — and a constant one workstream owns while another tunes it is
 * the wrong seam. V8 imports this directory and has no use for a bucket.
 */
import { describe, expect, it } from 'vitest';
import { CARDS } from '@/data/deck';
import { arcanaFor, shadowArcana } from './arcana';

describe('arcanaFor', () => {
  it('the deck is index-addressable: CARDS[i].id === i for all 22', () => {
    // The whole mapping rests on this and `cards.json` is GENERATED, so it is
    // asserted rather than assumed.
    expect(CARDS).toHaveLength(22);
    CARDS.forEach((c, i) => expect(c.id).toBe(i));
  });

  it('maps 0..21 to themselves', () => {
    for (let n = 0; n < 22; n++) expect(arcanaFor(n).id).toBe(n);
  });

  it('wraps at 22: arcanaFor(22) is The Fool', () => {
    expect(arcanaFor(22).name).toBe('The Fool');
    expect(arcanaFor(23).name).toBe('The Magician');
    expect(arcanaFor(41).id).toBe(19);
  });

  it('maps a master number through its own value (roadmap §5)', () => {
    expect(arcanaFor(11).name).toBe('Justice');
    expect(arcanaFor(22).name).toBe('The Fool');
    expect(arcanaFor(33).id).toBe(11);
  });

  it('never indexes off the end, even for a negative', () => {
    for (let n = -50; n < 100; n++) expect(arcanaFor(n), String(n)).toBeDefined();
    expect(arcanaFor(-1).id).toBe(21);
  });
});

describe('the Shadow Arcana', () => {
  it('is arcanaFor(a.id + b.id)', () => {
    // The Empress (3) and The Chariot (7) -> 10, Wheel of Fortune.
    const r = shadowArcana({ cardId: 3, count: 5 }, { cardId: 7, count: 2 });
    expect(r?.shadow.name).toBe('Wheel of Fortune');
    expect(r?.top.name).toBe('The Empress');
    expect(r?.second.name).toBe('The Chariot');
  });

  it('carries the pulse, reduce(m + n)', () => {
    expect(shadowArcana({ cardId: 3, count: 5 }, { cardId: 7, count: 2 })?.pulse).toBe(7);
    // 8 + 3 = 11, and 11 is a fixed point since reconciliation §5.3 — the plan
    // expected 2 here. Written out because it is the confusing case.
    expect(shadowArcana({ cardId: 1, count: 8 }, { cardId: 2, count: 3 })?.pulse).toBe(11);
  });

  it('CARRIES NO COUNT-BEARING FIELD OF ANY KIND (VD2, N11)', () => {
    /*
     * VD2's mechanical enforcement, and the half of it V1 keeps. The prompt is
     * handed this object and never `m` or `n`, so the model cannot recite a
     * tally it was never given — which is stronger than any instruction.
     *
     * V3 carries the same obligation for its composed type in
     * `src/lib/memory/shadow.ts` (reconciliation §5.4); that assertion must not
     * have been lost in the move.
     */
    const r = shadowArcana({ cardId: 3, count: 5 }, { cardId: 7, count: 2 });
    expect(Object.keys(r ?? {}).sort()).toEqual(
      ['pulse', 'second', 'shadow', 'shadowIsInPair', 'top'],
    );
    expect(JSON.stringify(r)).not.toMatch(/"(count|topCount|secondCount|m|n|dominance)":/);
  });

  it('flags shadowIsInPair EXACTLY when The Fool is one of the pair (N12)', () => {
    for (let a = 0; a < 22; a++) {
      for (let b = a + 1; b < 22; b++) {
        const r = shadowArcana({ cardId: a, count: 3 }, { cardId: b, count: 2 });
        expect(r?.shadowIsInPair, `${a}+${b}`).toBe(a === 0 || b === 0);
      }
    }
  });

  it('is null for a card id outside 0..21 rather than wrapping silently', () => {
    expect(shadowArcana({ cardId: 22, count: 3 }, { cardId: 2, count: 2 })).toBeNull();
    expect(shadowArcana({ cardId: -1, count: 3 }, { cardId: 2, count: 2 })).toBeNull();
  });

  it('is null when the counts sum to zero, rather than glossing a 0', () => {
    // Unreachable through W5's gate (m >= 3, n >= 2), and the type stays total
    // anyway: `pulse` is a GlossNumber and 0 is not one.
    expect(shadowArcana({ cardId: 3, count: 0 }, { cardId: 7, count: 0 })).toBeNull();
  });
});
