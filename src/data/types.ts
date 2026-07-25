/** Where a card sits on the Fool's Journey. Feeds the combination rule engine. */
export type Stage = 'beginning' | 'trial' | 'reckoning';

/** Reversing a card flips light <-> shadow; neutral stays neutral. */
export type Polarity = 'light' | 'shadow' | 'neutral';

export type Element = 'fire' | 'earth' | 'air' | 'water';

export type YesNo = 'yes' | 'no' | 'maybe';

export type Card = {
  /** 0-21, the card's position in the Major Arcana. */
  id: number;
  /** Matches the art filename, e.g. `13_death`. */
  slug: string;
  /** Roman numeral as printed on the card. */
  numeral: string;
  /** English, because the artwork has its title rendered into the image. */
  name: string;
  /** Astrological correspondence, e.g. the Moon's crescent. */
  glyph: string;
  element: Element;
  stage: Stage;
  polarity: Polarity;
  yesno: YesNo;
  /** Indonesian, like all reader-facing copy. */
  keywords: string[];
};

/** A card as it came out of the deck: identity plus orientation. */
export type Draw = {
  card: Card;
  reversed: boolean;
};

export type ServiceId = 'daily' | 'spread3' | 'yesno';

export type ReaderId = 'thessaly' | 'margaret' | 'adrian';
