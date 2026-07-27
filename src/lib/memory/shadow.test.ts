/**
 * V3 Task 1. The adapter over V1's engine, and the exact-key-set assertion
 * inherited from V1 (reconciliation §5.4).
 */
import { describe, expect, it } from 'vitest';
import { CARDS } from '@/data/deck';
import {
  dayShadowFor,
  frequencyMechanic,
  pulseFor,
  shadowFor,
  type FrequencyMechanic,
} from './shadow';

describe('shadowFor', () => {
  it('adds the two ids and folds mod 22', () => {
    expect(shadowFor(3, 7).card).toBe(CARDS[10]);
  });

  it('ACTUALLY FOLDS past 22 rather than indexing off the end', () => {
    // 16 + 12 = 28 -> 6, The Lovers. A naive `n < 22 ? n : n - 22` happens to
    // agree here and does not at a day's card-id sum; see dayShadowFor below.
    expect(shadowFor(16, 12).card).toBe(CARDS[6]);
    expect(shadowFor(21, 20).card).toBe(CARDS[19]);
  });

  it('reports a collision when The Fool is the second card', () => {
    const s = shadowFor(5, 0);
    expect(s.card.id).toBe(5);
    expect(s.collision).toBe('top');
  });

  it('reports a collision when The Fool is the top card', () => {
    const s = shadowFor(0, 5);
    expect(s.card.id).toBe(5);
    expect(s.collision).toBe('second');
  });

  it('COLLIDES IF AND ONLY IF THE FOOL IS IN THE PAIR — all 462 ordered pairs', () => {
    /*
     * V3-2's whole argument, proved rather than asserted. `x + 0 ≡ x (mod 22)`
     * and 0 is that congruence's only solution in 0..21, so the collision branch
     * in the prompt covers exactly one pair in twenty-two and nothing else can
     * reach it. Cheap to prove; expensive to be wrong about, because the
     * fallback is a prompt demanding three card names when only two exist.
     */
    let pairs = 0;
    for (let a = 0; a < 22; a += 1) {
      for (let b = 0; b < 22; b += 1) {
        if (a === b) continue;
        pairs += 1;
        const collided = shadowFor(a, b).collision !== null;
        expect(collided, `${a},${b}`).toBe(a === 0 || b === 0);
      }
    }
    expect(pairs).toBe(462);
  });
});

describe('pulseFor', () => {
  it('returns a written line per locale, and they are different lines', () => {
    const id = pulseFor(3, 2, 'id');
    const en = pulseFor(3, 2, 'en');
    expect(id?.gloss).toBeTruthy();
    expect(en?.gloss).toBeTruthy();
    expect(id?.gloss).not.toBe(en?.gloss);
    expect(id?.number).toBe(5);
  });

  it('keeps every gloss inside twenty words', () => {
    /*
     * V3 interpolates this into a prompt with a 32-word OUTPUT ceiling and tells
     * the model to say it in its own words. A three-sentence gloss gets pasted
     * back and blows the ceiling on its own — so a long gloss must fail V3's
     * tests rather than V3's smoke run, which costs a model call to discover.
     */
    for (let m = 3; m <= 20; m += 1) {
      for (let n = 2; n <= m; n += 1) {
        for (const locale of ['id', 'en'] as const) {
          const p = pulseFor(m, n, locale);
          expect(p, `${m}/${n}/${locale}`).not.toBeNull();
          const words = p!.gloss.split(/\s+/).filter(Boolean).length;
          expect(words, `${m}/${n}/${locale}: ${p!.gloss}`).toBeLessThanOrEqual(20);
        }
      }
    }
  });

  it('is total over the master numbers the gate can reach', () => {
    // m + n = 11 and 22 are ordinary pairs (6:5 and 12:10), and a gloss table
    // covering 1-9 only would return undefined into a prompt.
    expect(pulseFor(6, 5, 'id')?.number).toBe(11);
    expect(pulseFor(12, 10, 'en')?.number).toBe(22);
  });
});

describe('dayShadowFor', () => {
  it('sums every card drawn and folds', () => {
    // 18 + 16 + 12 + 17 + 18 = 81; 81 % 22 = 15, The Devil. The sum exceeds 43,
    // which is the case a naive single subtraction would get wrong.
    expect(dayShadowFor([18, 16, 12, 17, 18])).toBe(CARDS[15]);
  });

  it('is omitted when it collides with a card actually drawn', () => {
    expect(dayShadowFor([7])).toBeNull();
  });

  it('is null for a day with no cards', () => {
    expect(dayShadowFor([])).toBeNull();
  });

  it('a one-card day ALWAYS collides', () => {
    for (let id = 0; id < 22; id += 1) expect(dayShadowFor([id]), `${id}`).toBeNull();
  });
});

describe('the composed mechanic', () => {
  const mech = frequencyMechanic({ cardId: 3, count: 5 }, { cardId: 7, count: 2 }, 'id');

  it('CARRIES NO COUNT-BEARING FIELD OF ANY KIND', () => {
    /*
     * VD2's mechanical enforcement, inherited from V1 (reconciliation §5.4).
     * Without this assertion VD2 degrades from "impossible" back to "merely
     * forbidden": the way a tally gets back into the prompt is somebody adding
     * `topCount` here for a reason that looks good at the time.
     *
     * `pulseNumber` is the one number and it is not a count — it is
     * `reduce(m + n)`, it exists for the analytics event, and the prompt
     * interpolates `pulseGloss` instead. `summary.test.ts` asserts the assembled
     * user turn holds no digit at all, which is the check that makes that
     * distinction real rather than stated.
     */
    expect(Object.keys(mech!).sort()).toEqual(
      [
        'dominance',
        'pulseGloss',
        'pulseNumber',
        'secondName',
        'shadowCardId',
        'shadowCollision',
        'shadowName',
        'topName',
      ].sort(),
    );
  });

  it('resolves the three names and the bucket', () => {
    expect(mech).toMatchObject({
      topName: 'The Empress',
      secondName: 'The Chariot',
      shadowName: CARDS[10].name,
      shadowCardId: 10,
      shadowCollision: null,
      dominance: 'overwhelming',
    });
    expect(mech!.pulseGloss).toBeTruthy();
  });

  it('declines rather than wrapping a card id the deck does not have', () => {
    // The ids come from a scan over `reading_cards`. Out of range means the deck
    // moved under the data, and a confidently wrong card is worse than no line.
    expect(frequencyMechanic({ cardId: 22, count: 5 }, { cardId: 7, count: 2 }, 'id')).toBeNull();
    expect(frequencyMechanic({ cardId: 3, count: 5 }, { cardId: -1, count: 2 }, 'id')).toBeNull();
  });

  it('types the mechanic as the prompt consumes it', () => {
    // A compile-time check that the exported type is the one above; if a field
    // is renamed, this line and the key-set test disagree loudly.
    const typed: FrequencyMechanic = mech!;
    expect(typed.topName).toBe('The Empress');
  });
});
