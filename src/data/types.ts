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
  /**
   * Three per locale. Grounding for the model in the user turn, and the chips on
   * the reader picker.
   *
   * `Localized<string[]>` and not a `keywords_en` flat field (I18): one place a
   * card's data lives, and `Record<Locale, T>` makes a missing locale a compile
   * error, which a suffixed field cannot. Read it through `cardKeywords(card,
   * locale)`.
   */
  keywords: Localized<string[]>;
  /**
   * The one-line gloss the card detail overlay shows, per locale.
   *
   * TWO LINES PER LOCALE, not one with a negation bolted on: an upright card and
   * the same card reversed say different things, and showing the upright line
   * under a card that is visibly upside-down contradicts the card on screen. Pick
   * with `cardMeaning()`, never by reading `.upright` directly — which now guards
   * the locale as well as the orientation, so reading it by hand can get two
   * things wrong instead of one.
   *
   * The English is WRITTEN, not translated, and `tools/generate_cards.py` asserts
   * per card that the two locales differ. See `MEANINGS_EN`'s header there for
   * what it was written up from.
   */
  meaning: Localized<CardMeaning>;
};

/** One card's pair of glosses, in one locale. */
export type CardMeaning = { upright: string; reversed: string };

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

/**
 * A value that exists once per locale. A missing locale is a compile error.
 *
 * Declared beside `Locale` for the same reason `Locale` is here: `src/data/**` and
 * `src/lib/db/schema.ts` both need it and neither may depend on
 * `@/lib/i18n/**`. `src/lib/i18n/locale.ts` re-exports it; it must not redefine
 * it.
 */
export type Localized<T> = Record<Locale, T>;

export type ServiceId = 'daily' | 'spread3' | 'yesno';

export type ReaderId = 'thessaly' | 'margaret' | 'adrian';

export type Reader = {
  id: ReaderId;
  /** Identical in both locales. A name is not translated. */
  name: string;
  /**
   * English, like the card names -- it reads as a title, not a translation, and
   * it is identical in both locales. Changing that would touch the data, both
   * prompt forks and the portrait alt text (plan §7.13, open question 6).
   */
  title: string;
  /** UI only. Localized anyway, because it is the longest prose on the picker. */
  bio: Localized<string>;
  specialties: Localized<string[]>;
  /**
   * Past / present / future, in this reader's own register.
   *
   * DUAL-ROLE COPY (I14): slot captions on the draw screen AND input to the
   * three-card prompt, which tells the model to open each paragraph with the
   * position name as written. That is why it lives here rather than in the message
   * catalog -- splitting one string across two systems guarantees the screen and
   * the prompt eventually disagree about what the middle slot is called.
   */
  positionFraming: Localized<[string, string, string]>;
};

export type Service = {
  id: ServiceId;
  /** Dual-role, like `positionFraming`: a heading AND the prompt's `Layanan:` line. */
  name: Localized<string>;
  tagline: Localized<string>;
  cardCount: number;
  /** Slot caption for single-card services; null for the three-card spread. */
  singleLabel: Localized<string> | null;
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
