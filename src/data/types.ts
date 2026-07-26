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

/**
 * The two supported locales.
 *
 * Declared here, beside ReaderId and ServiceId, rather than in `src/lib/i18n/`
 * so that the Drizzle schema can reach it without `@/lib/db/**` depending on
 * `@/lib/i18n/**`. This module has no imports, which is what makes that safe.
 * W6 re-exports this type from `@/lib/i18n/locale`; it must not redefine it.
 */
export type Locale = 'id' | 'en';

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

/**
 * The querent, as the app knows them. Reshaped by W3 from `{ name, birthDate }`.
 *
 * THE THREE FACTS ONBOARDING ASKS FOR, PLUS THE COMPLETION MARKER. It mirrors
 * the `profiles` table's user-facing columns and nothing else -- no `userId`, no
 * timestamps -- because this shape crosses to the client, where a foreign key is
 * useless and `created_at` is nobody's business.
 *
 * `completedAt` IS A STRING, NOT A DATE, and both halves of that matter:
 *
 *   - a string survives the server/client serialization boundary unchanged,
 *     which a Date does not; the stepper is a client component
 *   - it is only ever compared against null (`isOnboarded`), never rendered and
 *     never arithmetic, so a Date would buy nothing and cost the timezone
 *     question that `local_date` already exists to answer
 *
 * NOT THE SAME TYPE AS `Profile` IN `@/lib/db/schema`. That one is Drizzle's
 * inferred row -- Dates, `userId`, `createdAt`, `updatedAt` -- and it stays
 * server-side. The query layer converts. Two names would be worse: they describe
 * the same thing at two boundaries, and the compiler keeps them apart.
 */
export type Profile = {
  /** As given. `Nama lengkap` in the copy. */
  fullName: string;
  /** What the reader calls you. `Nama panggilan`. */
  nickname: string;
  /** ISO `YYYY-MM-DD`. A distillation input, and the birth card's basis when
   *  that ships. Deliberately promised nothing in the onboarding copy. */
  birthDate: string;
  onboardingVersion: number;
  /** ISO timestamp. Null until onboarding finishes. THE completion marker --
   *  row presence is not completion. See `isOnboarded` in `./onboarding`. */
  completedAt: string | null;
};
