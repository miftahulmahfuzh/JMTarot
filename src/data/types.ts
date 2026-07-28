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
  /**
   * English in both locales, deliberately -- see CLAUDE.md `## Localization`.
   * This used to say "because the artwork has its title rendered into the
   * image", which was the reason until the deck was regenerated without any
   * text in it. The rule outlived its original justification: `CardFace` now
   * draws this string over the art at small sizes, so translating it would put
   * an Indonesian name on a card the reading calls by its English one.
   */
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

/**
 * Where `users.locale` came from (V2, roadmap VD11).
 *
 * Declared here for the third time for the same reason: `schema.ts` narrows the
 * column with `$type<LocaleSource>()` and `@/lib/db/**` may not depend on
 * `@/lib/i18n/**`.
 *
 * WHY THE COLUMN EXISTS AT ALL. `users.locale` is `not null default 'id'`, and the
 * `loc` session claim is FIRST in the resolution chain — ahead of the cookie and
 * `Accept-Language`. So an `en-GB` browser negotiated English on `/login`, signed
 * in, took the column default, and was snapped to Indonesian by a value that had
 * never been anybody's decision. That is the real bug behind "the language
 * resets".
 *
 * Stamping the negotiated locale over a default is right. Stamping it over an
 * explicit choice is a silent overwrite every time someone signs in from a foreign
 * browser — and without this column those two are the same row.
 *
 *   'default'     no signal reached the sign-in at all. Honest, and not the same
 *                 thing as negotiating and landing on `id`; see `resolveForSignIn`.
 *   'negotiated'  a header, a cookie or an Accept-Language decided it.
 *   'chosen'      the querent pressed the toggle. Never overwritten.
 *
 * NULL on pre-v0.3.0 rows and READ AS `'chosen'` — the conservative reading, via
 * `effectiveLocaleSource()`. Never read the column raw.
 */
export type LocaleSource = 'default' | 'negotiated' | 'chosen';

/**
 * How a reading ended. Fixed by reconciliation §3.
 *
 * `partial` has real prose and a fake ending; `failed` has none. W5's chain
 * query treats them differently, which is why one nullable `body` was not
 * enough. `blocked` writes no `reading_cards` rows at all (R7), which is why
 * V6's history hides it: there is no draw to reconstruct.
 *
 * DECLARED HERE AND NOT IN `schema.ts`, WHICH RE-EXPORTS IT (V6). `schema.ts` is
 * where it was born and where it still belongs conceptually, but
 * `src/lib/clientBoundary.test.ts` forbids ANY `@/lib/db/` specifier in a
 * `'use client'` file and its regex does not know about the `type` keyword — so
 * a client component cannot name the union at its old home even with an import
 * that is erased at build time. `ReadingView` is that component. This is the same
 * move `Locale`, `ReaderId`, `ServiceId` and `YesNo` already made, for the same
 * reason: this file has no imports, which is what makes it a safe leaf for both
 * the Drizzle schema and the browser.
 */
export type ReadingStatus = 'ok' | 'partial' | 'failed' | 'aborted' | 'blocked';

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
  /**
   * **FIXED, AND FIXED HERE BECAUSE IT IS A FACT ABOUT A CHARACTER RATHER THAN
   * COPY** (Miftah's ruling, 2026-07-28): Thessaly female, Margaret female, Adrian
   * male. It does not vary by locale, so it is not `Localized<>` and it is not in the
   * message catalog -- the WORDS are, at `reader.pronoun.female`/`.male`, and
   * `readerPronoun()` in `@/lib/persona/lines` is the only thing that joins the two.
   *
   * It was not recorded anywhere for three releases, and the bios were the only place
   * it existed: `bio.en` has said `She works…`, `Her way…` and `He is mostly here…`
   * since the first release, while `account.reader.line` said `they`. So the app
   * disagreed with itself about the same three people, and the fix is a column rather
   * than a fourth hand-written sentence.
   *
   * TWO VALUES, NOT AN OPEN STRING. These are three authored characters with settled
   * biographies, not user-supplied profiles -- the pronoun lookup is exhaustive over
   * this union, so adding a reader whose gender is neither is a compile error and a
   * decision somebody has to make deliberately rather than a `?? 'they'` fallback.
   */
  gender: 'female' | 'male';
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
