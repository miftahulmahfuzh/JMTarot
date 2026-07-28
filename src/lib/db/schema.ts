/**
 * The tables of the public release. Ten at W1; v0.3.0 adds to them.
 *
 * SOURCE OF TRUTH, in precedence order:
 *   1. docs/plans/2026-07-26-RECONCILIATION.md §3 -- the folded delta set
 *   2. PUBLIC_RELEASE_ROADMAP.md §3               -- the canonical nine tables
 *
 * §3 of the roadmap fixed the names; the reconciliation folded in the deltas
 * every workstream proposed. Both are canonical and this file is their
 * physical realisation. **If you need a column that is not here, it goes in
 * your workstream plan's `## Schema deltas` section and reconciliation folds
 * it in.** Do not add one directly: seven agents inventing user_id / userId /
 * uid is the single most likely way this project becomes a mess, and §3 exists
 * to stop it. The full rules are in `migrations/README`.
 *
 * Conventions, all from §3: snake_case, plural tables, every table has `id`
 * and `created_at`, timestamps are timestamptz and never bare, foreign keys
 * are `<singular>_id` and are declared with references() so the relations come
 * out typed.
 *
 * WHY THERE IS NO pgEnum ANYWHERE. `ALTER TYPE ... ADD VALUE` cannot be used
 * in the same transaction that adds it, which makes adding a locale or a
 * reader a two-migration dance. `text` narrowed with `.$type<...>()` gives
 * identical compile-time safety at zero migration cost, and W6 will add
 * locales.
 *
 * WHICH COLUMNS ARE NARROWED, AND WHICH ARE BARE `text`. A column is narrowed
 * here only when W1 is the only module that will ever define its value set.
 * Where another workstream already exports the union -- `moderation_flags`
 * .category/.source/.action (W7), `frequency_verdicts.window_key` (W5),
 * `events.name` (W4) -- the column stays bare `text` with the set written in
 * its comment, because narrowing it here would make schema.ts depend on a
 * workstream that depends on schema.ts.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  Locale,
  LocaleSource,
  ReaderId,
  ReadingStatus,
  ServiceId,
  YesNo,
} from '@/data/types';

/** Every timestamp in this schema. timestamptz, UTC, never a bare `timestamp`. */
const tsCol = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * Every DATE in this schema, as a `'YYYY-MM-DD'` string -- never a Date.
 *
 * Roadmap §7: `local_date` is the QUERENT'S calendar day, sent by the client,
 * and it must never be recomputed from `created_at`. A JS Date invites exactly
 * that, because it renders in the server's zone and looks plausible while
 * being a day out for anyone in Jakarta between midnight and 07:00. A string
 * cannot be accidentally re-derived.
 */
const dateCol = (name: string) => date(name, { mode: 'string' });

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** The OIDC `sub`. THE identity -- not email, which can change. */
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  /** From Google. NOT the onboarding answer -- that is profiles.full_name. */
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  locale: text('locale').$type<Locale>().notNull().default('id'),
  /**
   * WHERE `locale` CAME FROM (V2, roadmap VD11).
   *
   * 'default' | 'negotiated' | 'chosen'. NULLABLE WITH NO DEFAULT, and NULL is
   * read as `'chosen'` -- the conservative reading. Read it through
   * `effectiveLocaleSource()` and never raw; `raw ?? 'default'` is what a
   * reasonable person writes otherwise, and it would license the sign-in path to
   * overwrite the preference of every user who predates v0.3.0.
   *
   * Without this column a sign-in cannot tell "this row says id because the column
   * above defaults to id" from "this row says id because the querent pressed ID".
   * The first should be re-stamped with whatever the browser negotiated; the second
   * must never be. `locale` alone makes them the same row.
   *
   * WRITTEN AT ROW CREATION ONLY, in both creation paths (`upsertUserOnSignIn`'s
   * CTE and `purgeAndRecreate`), and NEVER in the conflict branch -- or a sign-in
   * from a foreign browser silently reverts a choice. `setUserLocale` is the only
   * other writer and it always writes `'chosen'`.
   */
  localeSource: text('locale_source').$type<LocaleSource>(),
  createdAt: tsCol('created_at').notNull().defaultNow(),
  lastSeenAt: tsCol('last_seen_at').notNull().defaultNow(),
  /**
   * Soft delete, for the T&C erasure right. Every read filters on it.
   *
   * Reconciliation §7.8: a soft-deleted row is HARD deleted at 30 days, which
   * frees the google_sub so that Google account can sign up again as a
   * stranger. That is why there is no partial unique index on google_sub
   * excluding soft-deleted rows -- no such row outlives 30 days.
   */
  deletedAt: tsCol('deleted_at'),
  /** T&C clause 2 (W7). Acceptance is a fact in the database, not an assumption. */
  termsAcceptedAt: tsCol('terms_accepted_at'),
  /** Compared against TERMS_VERSION; a mismatch forces re-acceptance. */
  termsVersion: text('terms_version'),
  /**
   * T&C clause 3, minimum age 18 (reconciliation §7.6). Separate from
   * terms_accepted_at even though one checkbox sets both, because the age bar
   * and the terms version change on different schedules.
   */
  ageConfirmedAt: tsCol('age_confirmed_at'),
});

// ---------------------------------------------------------------------------
// profiles
// ---------------------------------------------------------------------------

export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  nickname: text('nickname').notNull(),
  birthDate: dateCol('birth_date').notNull(),
  onboardingVersion: integer('onboarding_version').notNull().default(1),
  /** THE completion marker. NULL means onboarding was started, not finished. */
  completedAt: tsCol('completed_at'),
  createdAt: tsCol('created_at').notNull().defaultNow(),
  updatedAt: tsCol('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// onboarding_answers
// ---------------------------------------------------------------------------

/** The six mysterious questions. W3 owns what they ask; W1 owns that these are the keys. */
export const QUESTION_KEYS = [
  'best_thing',
  'worst_thing',
  'most_loved',
  'introversion',
  'color',
  'willow_wish',
] as const;
export type QuestionKey = (typeof QUESTION_KEYS)[number];

export const onboardingAnswers = pgTable(
  'onboarding_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionKey: text('question_key').$type<QuestionKey>().notNull(),
    /**
     * ENCRYPTED (roadmap §8/D11). NULL when skipped.
     *
     * The stored value is `v1.<iv>.<ciphertext>.<tag>`, base64url. NEVER write
     * this column except through encryptField() in ../crypto.ts, and never
     * read it except through decryptField(). The audit query is:
     *   select count(*) from onboarding_answers
     *    where answer_text is not null and answer_text not like 'v1.%';
     * It must return 0.
     */
    answerText: text('answer_text'),
    /** Closed questions: 'black'|'white'|'grey', and the introversion scale value. */
    answerChoice: text('answer_choice'),
    skipped: boolean('skipped').notNull().default(false),
    createdAt: tsCol('created_at').notNull().defaultNow(),
    /**
     * Per-step writes upsert and a deletion rewrites the row, so created_at
     * stops describing the answer that is actually there. "When did they
     * change it?" has to be answerable for the erasure right.
     */
    updatedAt: tsCol('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('onboarding_answers_user_question_uq').on(t.userId, t.questionKey),
    /**
     * A CHECK rather than a pgEnum, for the reason in this file's header. It is
     * cheap insurance: `question_key` is the AAD's second component, so a typo
     * writes a row nothing can ever decrypt.
     */
    check(
      'onboarding_answers_question_key_ck',
      sql`${t.questionKey} in ('best_thing', 'worst_thing', 'most_loved', 'introversion', 'color', 'willow_wish')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// lotus_avatars
// ---------------------------------------------------------------------------

/**
 * The distilled persona block, one entry per locale.
 *
 * ONE jsonb column, not summary_id/summary_en (reconciliation R6). The roadmap
 * declared `summary_id` twenty lines after stating that `<singular>_id` means a
 * foreign key -- the `_id` there was the ISO 639-1 code for Indonesian, and
 * anyone skimming would have read it as a uuid reference and written a join
 * against it. One column removes the collision instead of relocating it, and
 * extends to a third locale for free.
 */
export type LotusSummary = Record<Locale, string>;

/** Structured, for analytics. W3 owns the rest of the keys. */
export type LotusTraits = {
  color: string | null;
  introversion: number | null;
  [key: string]: unknown;
};

export const lotusAvatars = pgTable('lotus_avatars', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /**
   * `{"id": "...", "en": "..."}`. The reading path reads `summary[locale]`.
   *
   * GRANDFATHERED, AND THE ASYMMETRY WITH `translations` IS DELIBERATE (VD6).
   * Every other piece of derived prose in v0.3.0 is keyed by locale in its own
   * table or translated through `translations`; this one is jsonb and stays jsonb.
   *
   * It is not translated. It is DISTILLED PER LOCALE FROM THE SAME SOURCE
   * ANSWERS, which produces better prose than translating one into the other,
   * and it is already built and shipped. Widening `translations` to cover it
   * would mean rewriting a working W3 path for symmetry alone.
   *
   * Said here in these words because VD6 asks for it: the asymmetry looks like an
   * oversight to anyone who arrives at this column from `translations`.
   */
  summary: jsonb('summary').$type<LotusSummary>().notNull(),
  traits: jsonb('traits').$type<LotusTraits>().notNull(),
  /** Bump to force regeneration (roadmap D10). */
  sourceVersion: integer('source_version').notNull(),
  /**
   * SHA-256 over the sanitized answer set, the closed values and
   * LOTUS_SOURCE_VERSION. `source_version` alone catches "we changed the
   * prompt"; this catches "the user deleted an answer". Without it, deleted
   * material stays paraphrased inside a current-looking block and the delete
   * button is a lie.
   */
  inputHash: text('input_hash').notNull(),
  /** Which model distilled it. */
  model: text('model').notNull(),
  createdAt: tsCol('created_at').notNull().defaultNow(),
  /**
   * Regeneration upserts on the primary key, which leaves created_at at the
   * original value -- correct, and it means without this column there is no
   * column at all saying when the current text was produced.
   */
  updatedAt: tsCol('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// readings
// ---------------------------------------------------------------------------

/**
 * Fixed by reconciliation §3, which also dropped the `question_blocked`
 * boolean that used to sit beside it: that column said the same thing as
 * `status = 'blocked'`, and one fact needs one column.
 *
 * MOVED TO `@/data/types` BY V6 AND RE-EXPORTED HERE, so every existing importer
 * keeps working. Not cosmetic: `clientBoundary.test.ts` forbids any `@/lib/db/`
 * specifier in a client component and its regex matches `import type` too, so
 * `ReadingView` could not name the union at this address. `data/types.ts` has no
 * imports, which is what makes it reachable from both sides.
 */
export type { ReadingStatus };

export const readings = pgTable(
  'readings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readerId: text('reader_id').$type<ReaderId>().notNull(),
    serviceId: text('service_id').$type<ServiceId>().notNull(),
    locale: text('locale').$type<Locale>().notNull(),
    /**
     * The querent's text, already sanitized. May be NULL. Stored in PLAINTEXT
     * -- unlike onboarding_answers.answer_text -- and the privacy policy (W7)
     * must name it as stored user text.
     */
    question: text('question'),
    status: text('status').$type<ReadingStatus>().notNull().default('ok'),
    /**
     * The MACHINE verdict from effectiveYesNo(): 'yes' | 'no' | 'maybe'.
     * Never the displayed word. 'Ya'/'Tidak'/'Belum jelas' are Indonesian, and
     * storing them would make the analytics untranslatable the moment W6 lands.
     */
    verdict: text('verdict').$type<YesNo>(),
    /** The generated prose. NULL if the stream died before a token arrived. */
    body: text('body'),
    /**
     * The one-clause distillation W5 recalls in a later reading's prompt, so
     * chaining never has to carry the full prose. Nullable: extraction can
     * fail, and every row written before that feature ships has none. A null
     * gist excludes the reading from recall and nothing else.
     *
     * NO LOCALE OF ITS OWN, AND IT DOES NOT NEED ONE: it inherits
     * `readings.locale` (V2 §7). `extractGist` is called with the reading's own
     * locale and `gistPrompt` is locale-forked, so the gist is BY CONSTRUCTION in
     * the same language as the body it was distilled from. A second column would
     * be a second place for one fact to be recorded and the first place for the
     * two to disagree.
     *
     * Written down because the absence looks like an oversight from
     * `translations`, where `reading.gist` is a translatable field in its own
     * right -- and the next person to notice would add the column.
     */
    gist: text('gist'),
    model: text('model').notNull(),
    /**
     * `<locale>-v1.<sha8>`, e.g. `id-v1.3f9a2c71` (reconciliation R5). The
     * locale prefix because you cannot interpret a reading without knowing
     * which prompt fork produced it; the hash so that a prompt change is
     * visible in the data with no discipline required.
     */
    promptVersion: text('prompt_version').notNull(),
    latencyMs: integer('latency_ms'),
    tokenInput: integer('token_input'),
    tokenOutput: integer('token_output'),
    /**
     * The browser session id, NOT the auth session. Nullable, because a
     * reading can legitimately arrive without the header and a missing
     * analytics field must never fail a reading. With it,
     * `events.session_id = readings.session_id` reconstructs the whole
     * interaction that produced the reading.
     */
    sessionId: text('session_id'),
    /** The QUERENT'S own calendar day, sent by the client. Roadmap §7. */
    localDate: dateCol('local_date').notNull(),
    createdAt: tsCol('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('readings_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('readings_user_local_date_idx').on(t.userId, t.localDate),
  ],
);

// ---------------------------------------------------------------------------
// reading_cards
// ---------------------------------------------------------------------------

export const readingCards = pgTable(
  'reading_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    readingId: uuid('reading_id')
      .notNull()
      .references(() => readings.id, { onDelete: 'cascade' }),
    /** Denormalized on purpose (§3): the frequency query filters on it directly. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cardId: integer('card_id').notNull(), // 0..21
    reversed: boolean('reversed').notNull(),
    /**
     * 0-based slot in the spread. `position` is a non-reserved SQL keyword
     * (`POSITION(x IN y)`); Drizzle quotes every identifier, so it is fine
     * unless you hand-write SQL without quotes.
     */
    position: integer('position').notNull(),
    /**
     * Copied from the parent reading at insert time, in the same transaction,
     * so the two can never disagree. Denormalized for the same reason user_id
     * is: the card-frequency query must be a single-table scan, and its window
     * is the querent's calendar, not UTC. Joining instead would nested-loop
     * over every reading in a 666-day window.
     */
    localDate: dateCol('local_date').notNull(),
    createdAt: tsCol('created_at').notNull().defaultNow(),
  },
  (t) => [
    /**
     * The FK Postgres does not index for you. Two things need it: W5's
     * chained-reading feature fetches cards by reading_id, and the ON DELETE
     * CASCADE from readings performs one sequential scan of this table PER
     * DELETED READING -- which makes erasing a heavy user O(readings x cards).
     */
    index('reading_cards_reading_idx').on(t.readingId),
    /**
     * The card-frequency verdict, as an index-only scan.
     *
     * This SUPERSEDES roadmap §3's `(user_id, card_id)`, which reconciliation
     * §3 explicitly left to W1 to decide on ("it probably does not [earn its
     * keep]"). It does not: every frequency query bounds local_date, so this
     * index serves them all, and a leading-column-only prefix of it serves
     * anything `(user_id, card_id)` would have. Two indexes on the same table
     * for one query is write amplification for nothing.
     */
    index('reading_cards_user_date_card_idx').on(t.userId, t.localDate, t.cardId),
  ],
);

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * SET NULL, not CASCADE. Reconciliation R9: `events` survives account
     * erasure with user_id nulled, which is only honest because its props are
     * scalars-only and enforced at runtime by W4's sanitizeProps.
     */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Per browser session, NOT the auth session. */
    sessionId: text('session_id'),
    /**
     * Deliberately not narrowed: W4 owns the taxonomy and narrows it in
     * track(). Narrowing it here would make schema.ts depend on a workstream
     * that depends on schema.ts.
     */
    name: text('name').notNull(),
    props: jsonb('props').$type<Record<string, unknown>>().notNull().default({}),
    locale: text('locale').$type<Locale>(),
    localDate: dateCol('local_date').notNull(),
    createdAt: tsCol('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('events_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('events_name_created_idx').on(t.name, t.createdAt.desc()),
    /**
     * Session reconstruction -- the query you actually run when someone
     * reports "the app did something weird" -- filters on session_id and would
     * otherwise table-scan the firehose.
     */
    index('events_session_created_idx').on(t.sessionId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// daily_summaries
// ---------------------------------------------------------------------------

export const dailySummaries = pgTable(
  'daily_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readerId: text('reader_id').$type<ReaderId>().notNull(),
    localDate: dateCol('local_date').notNull(),
    locale: text('locale').$type<Locale>().notNull(),
    /** 1-3 sentences, in that reader's own voice. */
    body: text('body').notNull(),
    /** What it summarized, so staleness is detectable. No FK is possible on an array. */
    sourceReadingIds: uuid('source_reading_ids').array().notNull(),
    /** A prompt change must be able to invalidate a cached summary. */
    promptVersion: text('prompt_version').notNull(),
    /** How many times it has been regenerated. Makes "is the throttle set right?"
     *  one query instead of an events aggregation. */
    generationCount: integer('generation_count').notNull().default(0),
    createdAt: tsCol('created_at').notNull().defaultNow(),
    /** Regeneration upserts onto the unique key below, so created_at stops
     *  describing when the text was written. This is what the throttle compares. */
    updatedAt: tsCol('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('daily_summaries_user_reader_date_locale_uq').on(
      t.userId,
      t.readerId,
      t.localDate,
      t.locale,
    ),
  ],
);

// ---------------------------------------------------------------------------
// moderation_flags
// ---------------------------------------------------------------------------

export const moderationFlags = pgTable(
  'moderation_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /**
     * ENCRYPTED, exactly like onboarding_answers.answer_text (reconciliation
     * R15) -- this column holds the text of questions classified as self-harm,
     * violence or worse, and it lands here BECAUSE it is sensitive. Write it
     * only through encryptField() with moderationFlagAad(userId).
     *
     * NULLABLE for two distinct reasons: the 30-day redaction nulls it in
     * place while keeping the row's tuning value, and the `sexual_minor`
     * category must never store it at all. `redacted_at` is what tells those
     * two apart.
     */
    question: text('question'),
    /**
     * HMAC-SHA256 of the normalized question, keyed with FIELD_ENCRYPTION_KEY.
     * Survives redaction, so repeat probing stays detectable after the text is
     * gone. KEYED rather than a bare hash because a bare SHA-256 of a
     * 200-character phrase is reversible by guessing. This is a dedupe key,
     * NOT anonymization -- do not treat it as if the question were erased.
     */
    questionHmac: text('question_hmac').notNull(),
    /**
     * W7's closed set, left bare so schema.ts does not depend on W7:
     * self_harm | violence_others | extremism | sexual_minor | illegal_harm
     * | hate_targeted | nonconsent | system_abuse | other | unclear.
     * `unclear` is the fail-closed-on-timeout value.
     */
    category: text('category').notNull(),
    /** 'blocklist' | 'classifier' | 'timeout'. W7 owns the union. */
    source: text('source').notNull(),
    /**
     * 'blocked' | 'allowed_flagged'. Near-misses are logged too; without this
     * every row is a block and the false-negative side of tuning is invisible
     * forever.
     */
    action: text('action').notNull().default('blocked'),
    /** The blocklist has per-locale pattern sets; you cannot tune them without it. */
    locale: text('locale').$type<Locale>().notNull(),
    /**
     * Which Tier-A/B pattern fired; NULL for classifier verdicts. Turns "the
     * blocklist has false positives" into "pattern `id.self_harm.method` has
     * eleven false positives". Never returned to the client.
     */
    patternId: text('pattern_id'),
    confidence: real('confidence'),
    /**
     * Distinguishes "no text because we redacted it" from "no text because we
     * never stored it". Without it the retention policy is unverifiable from
     * the data itself.
     */
    redactedAt: tsCol('redacted_at'),
    createdAt: tsCol('created_at').notNull().defaultNow(),
  },
  (t) => [
    /** Repeat-offender lookups, the erasure SET NULL scan, and the T&C clause 8
     *  evidence trail. */
    index('moderation_flags_user_created_idx').on(t.userId, t.createdAt.desc()),
    /** The lazy redaction sweep. Partial, because it only ever visits rows that
     *  still have text to redact. */
    index('moderation_flags_created_idx')
      .on(t.createdAt)
      .where(sql`question is not null`),
  ],
);

// ---------------------------------------------------------------------------
// frequency_verdicts
// ---------------------------------------------------------------------------

export const frequencyVerdicts = pgTable(
  'frequency_verdicts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * 'week'|'d3'|'d13'|'d666'|'month'|'quarter'|'year'|'birthday'. W5 owns
     * the union (its `WindowKey`) and the bounds each one resolves to; the
     * windows are configuration, not code.
     */
    windowKey: text('window_key').notNull(),
    locale: text('locale').$type<Locale>().notNull(),
    /** sha256 of the ranked top two plus totals. The validity key. */
    fingerprint: text('fingerprint').notNull(),
    /** 0..21. Stored beside the fingerprint so "the pair changed" vs "the counts
     *  moved" is a two-integer comparison rather than a re-derivation. */
    topCardId: integer('top_card_id').notNull(),
    secondCardId: integer('second_card_id').notNull(),
    /** The generated line. Generated, never templated -- a template reads
     *  identically the fourth time you see it. */
    body: text('body').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    createdAt: tsCol('created_at').notNull().defaultNow(),
    updatedAt: tsCol('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('frequency_verdicts_user_window_locale_uq').on(t.userId, t.windowKey, t.locale),
  ],
);

// ---------------------------------------------------------------------------
// translations
// ---------------------------------------------------------------------------

/**
 * Every piece of derived prose that had to be re-rendered in the other language
 * (V2, roadmap VD5).
 *
 * ONE GENERIC TABLE, not a jsonb column per artifact. A translation carries its
 * own `model`, `prompt_version` and timestamps, which a jsonb value cannot -- and
 * a column per artifact is a migration, an upsert path and a place to forget
 * `updated_at` per artifact.
 *
 * ── TWO ENTITIES, NOT FOUR, AND THAT NARROWING IS THE INTERESTING PART ───────
 *
 * Roadmap §4 listed `reading`, `daily_summary`, `frequency_verdict` and
 * `persona`. Reconciliation §5.1 cut it to `reading` and `persona`.
 * `daily_summaries` is unique on `(user_id, reader_id, local_date, locale)` and
 * `frequency_verdicts` on `(user_id, window_key, locale)` -- BOTH ARE ALREADY
 * KEYED BY LOCALE, so a language switch there is an ordinary cache miss followed
 * by a regeneration IN THE TARGET LANGUAGE: one model call, exactly what a
 * translation would have cost, and better prose than translating a 45-word
 * greeting could be. That is VD6's own argument about `lotus_avatars.summary`,
 * noticed to reach two more tables.
 *
 * The two that are here cannot do that. `readings.body` is immutable (VD7) --
 * the prose IS the artifact, and regenerating it would mean the querent's memory
 * of the reading and the app's disagree. `personas.user_id` is a primary key with
 * a single `locale` column, so a switch would OVERWRITE the persona rather than
 * sit beside it.
 *
 * ── `entity_id` HAS NO FOREIGN KEY, AND THAT IS A DELIBERATE COST ────────────
 *
 * Postgres cannot declare a polymorphic FK. Orphans are therefore possible:
 * deleting a reading leaves its translations behind. Three shapes were weighed --
 * four nullable typed FK columns, four separate tables, or this -- and this wins
 * because the alternative to one orphan-cleanup statement is a migration per
 * future artifact. **The daily sweep's fourth delete is the answer**
 * (`deleteOrphanTranslations`, written by V2 and reviewed by V7).
 */
export const translations = pgTable(
  'translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * `'reading' | 'persona'`.
     *
     * Bare `text`, per this file's header rule: V2 owns the union
     * (`TranslatableEntity` in `@/lib/translate/contract`), and narrowing it here
     * would make `schema.ts` depend on a module that depends on `schema.ts`.
     */
    entity: text('entity').notNull(),
    /** NO FK. Polymorphic -- see the header. `readings.id`, or `personas.user_id`. */
    entityId: uuid('entity_id').notNull(),
    /** `'body' | 'gist'`. Bare text for the same reason as `entity`. */
    field: text('field').notNull(),
    /**
     * What it was translated FROM.
     *
     * STORED, NEVER DERIVED. It is the only thing that keeps the row auditable
     * after the source is gone, and it is what the check constraint below compares
     * -- a row translated into its own source language is a bug, not data.
     */
    sourceLocale: text('source_locale').$type<Locale>().notNull(),
    /** What it was translated INTO. The lookup key, with the three above. */
    locale: text('locale').$type<Locale>().notNull(),
    body: text('body').notNull(),
    model: text('model').notNull(),
    /**
     * `TRANSLATION_PROMPT_VERSION`. HAND-BUMPED, NOT HASHED.
     *
     * `MEMORY_PROMPT_VERSION`'s reasoning exactly. `readings.prompt_version` is a
     * hash because a reading's prompt is three independently-changing layers and
     * nobody would remember to bump a constant; the translation prompt is one
     * function in one file, and this column is read to decide whether a CACHED ROW
     * is stale. A hash would invalidate every translation in the table on a
     * whitespace edit.
     */
    promptVersion: text('prompt_version').notNull(),
    createdAt: tsCol('created_at').notNull().defaultNow(),
    /**
     * THE STALENESS MECHANISM, AND THE REASON THERE IS NO `source_hash` COLUMN.
     *
     * Roadmap §4 shipped this table with no staleness key at all, which reconciliation
     * §5.2 closed with no new column: a translation is stale iff
     *
     *     translations.updated_at < source.updated_at
     *
     * `personas` maintains `updated_at` by hand inside `onConflictDoUpdate`, and
     * `readings` is immutable so `created_at` is its comparand.
     *
     * `$onUpdate()` IS DECLARED HERE AND IS NOT ENOUGH. It fires on `db.update()`
     * and NOT inside `onConflictDoUpdate`, so `putTranslation` sets this by hand.
     * Drop that line and the column freezes at the first insert -- which for this
     * table is the entire staleness mechanism, so every regenerated source would
     * serve its first translation forever.
     */
    updatedAt: tsCol('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('translations_entity_entity_id_field_locale_uq').on(
      t.entity,
      t.entityId,
      t.field,
      t.locale,
    ),
    /** The orphan sweep, and V6/V7's per-artifact reads and deletes. */
    index('translations_entity_lookup_idx').on(t.entity, t.entityId),
    /** A row translated into its own source language is a bug, not data. */
    check('translations_locale_differs_ck', sql`${t.sourceLocale} <> ${t.locale}`),
  ],
);

// ---------------------------------------------------------------------------
// Row types
//
// `X` is what a select returns; `NewX` is what an insert accepts (columns with
// a default become optional).
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type OnboardingAnswer = typeof onboardingAnswers.$inferSelect;
export type NewOnboardingAnswer = typeof onboardingAnswers.$inferInsert;
export type LotusAvatar = typeof lotusAvatars.$inferSelect;
export type NewLotusAvatar = typeof lotusAvatars.$inferInsert;
export type Reading = typeof readings.$inferSelect;
export type NewReading = typeof readings.$inferInsert;
export type ReadingCard = typeof readingCards.$inferSelect;
export type NewReadingCard = typeof readingCards.$inferInsert;
/** `EventRow`, not `Event` -- `Event` is a DOM global and lib.dom is in this
 *  project's tsconfig, so shadowing it produces confusing errors in unrelated files. */
export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
export type DailySummary = typeof dailySummaries.$inferSelect;
export type NewDailySummary = typeof dailySummaries.$inferInsert;
export type ModerationFlag = typeof moderationFlags.$inferSelect;
export type NewModerationFlag = typeof moderationFlags.$inferInsert;
export type FrequencyVerdict = typeof frequencyVerdicts.$inferSelect;
export type NewFrequencyVerdict = typeof frequencyVerdicts.$inferInsert;
export type Translation = typeof translations.$inferSelect;
export type NewTranslation = typeof translations.$inferInsert;
