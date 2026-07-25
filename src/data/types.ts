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
  /**
   * The one-line gloss the card detail overlay shows, in Indonesian.
   *
   * Two lines, not one with a negation bolted on: an upright card and the same
   * card reversed say different things, and showing the upright line under a
   * card that is visibly upside-down contradicts the card on screen. Pick with
   * `cardMeaning()`, never by reading `.upright` directly.
   */
  meaning: { upright: string; reversed: string };
};

/** A card as it came out of the deck: identity plus orientation. */
export type Draw = {
  card: Card;
  reversed: boolean;
};

export type ServiceId = 'daily' | 'spread3' | 'yesno';

export type ReaderId = 'thessaly' | 'margaret' | 'adrian';

export type Reader = {
  id: ReaderId;
  name: string;
  /** English, like the card names -- it reads as a title, not a translation. */
  title: string;
  bio: string;
  specialties: string[];
  /** Past / present / future, in this reader's own register. */
  positionFraming: [string, string, string];
};

export type Service = {
  id: ServiceId;
  name: string;
  tagline: string;
  cardCount: number;
  /** Slot caption for single-card services; null for the three-card spread. */
  singleLabel: string | null;
  oncePerDay: boolean;
};

/** What the Daily Card gate persists, so re-entry shows the same card all day. */
export type DailyPull = {
  /** Device-local calendar date, `YYYY-MM-DD`. */
  date: string;
  cardId: number;
  reversed: boolean;
  readerId: ReaderId;
};

export type Profile = {
  name: string;
  /** ISO `YYYY-MM-DD`. Personalises the greeting and derives the birth card. */
  birthDate: string;
};
