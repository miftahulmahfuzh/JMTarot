/**
 * The bridge from a card's `glyph` to the correspondence engine (S4, v0.4.0).
 *
 * **`Card.glyph` HAS BEEN IN `cards.json` SINCE THE FIRST RELEASE AND NOTHING HAD
 * EVER READ IT.** Twenty-two committed astrological attributions, unused: before
 * this file, `grep -rn glyph src` found the type declaration and nothing else. The
 * lore pages are the first surface that needs them, and the reason this module
 * exists rather than a lookup inline in the page is that the join is checkable and
 * the check is worth having.
 *
 * PURE and CLIENT-IMPORTABLE. Imports `@/data/*` and `@/lib/numerology` -- the
 * FACADE, never a leaf, because `purity.test.ts` fails on a deep import. It must
 * not acquire `server-only`: S3's gallery zoom is a client component and may want
 * the attribution label.
 *
 * **IT IS NOT IN `src/data/` AND CANNOT BE.** `@/lib/numerology/arcana.ts` imports
 * `CARDS` from `@/data/deck`, so a `@/data/**` module importing the engine is a
 * cycle -- and `src/data/onboarding.ts`'s "NO IMPORTS OUTSIDE @/data" rule exists
 * because that tree has to stay reachable from the edge middleware.
 *
 * **IT IS NOT IN `src/content/` AND CANNOT BE**, because roadmap §5 rule 1 fences
 * that tree from client components.
 */
import type { Card, Locale, Localized } from '@/data/types';
import { CARDS } from '@/data/deck';
import {
  type ZodiacSign,
  SIGNS,
  arcanaFor,
  elementGloss,
  modalityGloss,
  reduceToGloss,
  signGloss,
} from '@/lib/numerology';

/** What kind of thing the glyph names. Decides which glosses exist. */
export type AttributionKind = 'sign' | 'planet' | 'element';

export type Attribution = {
  /** The character as it appears in `cards.json`. The lookup key. */
  glyph: string;
  kind: AttributionKind;
  /**
   * The name, per locale. **PROPER NOUNS, NOT COPY**, which is why they live
   * beside the table rather than in the message catalog: `Pisces` is `Pisces` in
   * Indonesian and `Mercury` is `Merkurius`, and neither is a translator's
   * decision. Same argument `## Localization` rule 1 makes about card names, one
   * level out.
   */
  label: Localized<string>;
  /**
   * The `ZodiacSign` for the twelve sign cards, `null` for the other ten.
   *
   * NON-NULL IS WHAT UNLOCKS `signGloss` AND `modalityGloss`. The ten remaining
   * cards get neither and the fact strip is shorter for them; inventing nine
   * planet glosses to even it up is the "vague cosmic language" the v0.3.0 risk
   * table logs against exactly this kind of page.
   */
  sign: ZodiacSign | null;
};

/**
 * Keyed by the glyph character, not by card id, and the test asserts both
 * directions.
 *
 * A glyph is one non-ASCII character in a source file, so the realistic failure is
 * a key that got mangled in an editor and matches nothing -- which renders a gap
 * rather than an error. Keying by the character means the test can compare
 * `Object.keys(ATTRIBUTIONS)` against `CARDS.map(c => c.glyph)` and fail with the
 * two sets printed.
 *
 * **CHECKED AGAINST THE GOLDEN DAWN'S ATTRIBUTIONS ON 2026-07-29** and all
 * twenty-two agree. For the twelve signs, `SIGNS[sign].element === card.element`
 * with no exceptions, which `correspondence.test.ts` asserts card by card.
 *
 * **`✧` IS THE ONE THAT IS NOT A PLANET OR A SIGN, AND IT IS CORRECT.** The Fool's
 * authentic Golden Dawn attribution is the ELEMENT Air -- Uranus is a modern
 * addition the sources themselves flag as outside the original system -- so the
 * aether mark is right and `♅` would be the anachronism. The Hanged Man (`♆`) and
 * Judgement (`♇`) are the two places this deck DID take the modern planets, and
 * they are labelled as such rather than back-dated to Water and Fire.
 */
export const ATTRIBUTIONS: Record<string, Attribution> = {
  '✧': { glyph: '✧', kind: 'element', label: { id: 'Udara (eter)', en: 'Air (aether)' }, sign: null },
  '☿': { glyph: '☿', kind: 'planet', label: { id: 'Merkurius', en: 'Mercury' }, sign: null },
  /*
   * `Luna`, not `The Moon`: the label must never collide with a card name, and on
   * `/arcana/the-moon` the naive spelling renders "The Moon: The Moon". `Sol` is
   * the same case for card 19. Both are the standard astrological names and both
   * are proper nouns, so neither is translated copy.
   */
  '☾': { glyph: '☾', kind: 'planet', label: { id: 'Bulan', en: 'Luna' }, sign: null },
  '♀': { glyph: '♀', kind: 'planet', label: { id: 'Venus', en: 'Venus' }, sign: null },
  '♈': { glyph: '♈', kind: 'sign', label: { id: 'Aries', en: 'Aries' }, sign: 'aries' },
  '♉': { glyph: '♉', kind: 'sign', label: { id: 'Taurus', en: 'Taurus' }, sign: 'taurus' },
  '♊': { glyph: '♊', kind: 'sign', label: { id: 'Gemini', en: 'Gemini' }, sign: 'gemini' },
  '♋': { glyph: '♋', kind: 'sign', label: { id: 'Cancer', en: 'Cancer' }, sign: 'cancer' },
  '♌': { glyph: '♌', kind: 'sign', label: { id: 'Leo', en: 'Leo' }, sign: 'leo' },
  '♍': { glyph: '♍', kind: 'sign', label: { id: 'Virgo', en: 'Virgo' }, sign: 'virgo' },
  '♃': { glyph: '♃', kind: 'planet', label: { id: 'Jupiter', en: 'Jupiter' }, sign: null },
  '♎': { glyph: '♎', kind: 'sign', label: { id: 'Libra', en: 'Libra' }, sign: 'libra' },
  '♆': { glyph: '♆', kind: 'planet', label: { id: 'Neptunus', en: 'Neptune' }, sign: null },
  '♏': { glyph: '♏', kind: 'sign', label: { id: 'Scorpio', en: 'Scorpio' }, sign: 'scorpio' },
  '♐': { glyph: '♐', kind: 'sign', label: { id: 'Sagittarius', en: 'Sagittarius' }, sign: 'sagittarius' },
  '♑': { glyph: '♑', kind: 'sign', label: { id: 'Capricorn', en: 'Capricorn' }, sign: 'capricorn' },
  '♂': { glyph: '♂', kind: 'planet', label: { id: 'Mars', en: 'Mars' }, sign: null },
  '♒': { glyph: '♒', kind: 'sign', label: { id: 'Aquarius', en: 'Aquarius' }, sign: 'aquarius' },
  '♓': { glyph: '♓', kind: 'sign', label: { id: 'Pisces', en: 'Pisces' }, sign: 'pisces' },
  '☉': { glyph: '☉', kind: 'planet', label: { id: 'Matahari', en: 'Sol' }, sign: null },
  '♇': { glyph: '♇', kind: 'planet', label: { id: 'Pluto', en: 'Pluto' }, sign: null },
  '♄': { glyph: '♄', kind: 'planet', label: { id: 'Saturnus', en: 'Saturn' }, sign: null },
};

/** `null` only if the deck ever gains a glyph this table does not know. */
export function attributionFor(card: Card): Attribution | null {
  return ATTRIBUTIONS[card.glyph] ?? null;
}

/**
 * The card a card's number folds to, or `null` when there is nothing to say.
 *
 * **THREE NULL CASES AND ONE OF THEM IS A TRAP.**
 *
 *   - The Fool: `reduce(0)` is 0 and `reduceToGloss(0)` is null, because zero is
 *     not a numerological quality (`reduce.ts`'s `GlossNumber` comment).
 *   - Cards 1-9: their own root. "The Hermit reduces to The Hermit" is not a
 *     correspondence.
 *   - **JUSTICE, and only because of v0.3.0 reconciliation §5.3.** `reduce(11)` is
 *     11 -- the master numbers are FIXED POINTS since that amendment -- so
 *     `arcanaFor` maps eleven back to Justice. Suppressed HERE and not in the page,
 *     so the next consumer inherits it. Anyone who "restores" the block renders
 *     "Justice reduces to Justice"; anyone who instead changes `reduce` silently
 *     rewrites every stored `frequency_verdicts` and `personas` row.
 *
 * Eleven cards have a root: 10 and 12 through 21. Wheel of Fortune folds to The
 * Magician, which is the traditional "the Wheel is the Magician at a higher
 * octave", and The Moon folds to The Hermit -- the card that carries its own lamp
 * standing behind the card whose light was not its choice. These are real internal
 * links, not filler ones.
 */
export function rootCardFor(card: Card): Card | null {
  const n = reduceToGloss(card.id);
  if (n === null) return null;
  const root = arcanaFor(n);
  return root.id === card.id ? null : root;
}

/** Everything the page's fact strip and lore need, in one locale. */
export type ArcanaFacts = {
  card: Card;
  urlSlug: string;
  attribution: Attribution;
  /** Non-null for the twelve sign cards only. */
  signGloss: string | null;
  /** Non-null for the twelve sign cards only. `cardinal` / `fixed` / `mutable`. */
  modality: 'cardinal' | 'fixed' | 'mutable' | null;
  modalityGloss: string | null;
  /** Always present -- every card has an element. */
  elementGloss: string;
  root: Card | null;
};

export function arcanaFactsFor(card: Card, locale: Locale, urlSlug: string): ArcanaFacts {
  const attribution = attributionFor(card);
  if (attribution === null) {
    throw new Error(`no attribution for glyph ${JSON.stringify(card.glyph)} (${card.name})`);
  }
  const sign = attribution.sign;
  return {
    card,
    urlSlug,
    attribution,
    signGloss: sign === null ? null : signGloss(sign, locale),
    modality: sign === null ? null : SIGNS[sign].modality,
    modalityGloss: sign === null ? null : modalityGloss(SIGNS[sign].modality, locale),
    elementGloss: elementGloss(card.element, locale),
    root: rootCardFor(card),
  };
}

/**
 * Up to `n` other cards sharing a field, chosen DETERMINISTICALLY by walking ids
 * upward and wrapping.
 *
 * **DETERMINISTIC MATTERS MORE THAN INTERESTING HERE.** These are the internal
 * links a crawler sees, and a link set that differs between two builds is crawl
 * churn on forty-four pages for no editorial gain. Walking ids and wrapping gives
 * the same answer forever and spreads the inbound links evenly instead of pointing
 * every fire card at The Sun.
 *
 * Capped because fire has six members and stage `reckoning` has seven; an
 * eleven-link row at 320px is a wall.
 */
export function relatedByElement(card: Card, n = 3): Card[] {
  return walkFrom(card, (c) => c.element === card.element, n);
}

export function relatedByStage(card: Card, n = 3): Card[] {
  return walkFrom(card, (c) => c.stage === card.stage, n);
}

function walkFrom(card: Card, keep: (c: Card) => boolean, n: number): Card[] {
  const out: Card[] = [];
  for (let step = 1; step < CARDS.length && out.length < n; step++) {
    const candidate = CARDS[(card.id + step) % CARDS.length];
    if (candidate.id !== card.id && keep(candidate)) out.push(candidate);
  }
  return out;
}

/**
 * The card before and after, WRAPPING at both ends.
 *
 * The Fool's previous is The World and The World's next is The Fool, which is both
 * traditionally true -- the Fool's Journey closes -- and gives all twenty-two pages
 * the same outbound link degree. A ragged link graph with two pages at half the
 * degree of the rest is worse for no reason.
 */
export function neighboursOf(card: Card): { previous: Card; next: Card } {
  const n = CARDS.length;
  return {
    previous: CARDS[(card.id - 1 + n) % n],
    next: CARDS[(card.id + 1) % n],
  };
}
