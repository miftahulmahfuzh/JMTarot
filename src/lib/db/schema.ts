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
/**
 * A6's `blog_post_locales.body`. **A TYPE-ONLY IMPORT OF A SHAPE, NOT A VALUE
 * SET**, so it does not breach this file's narrowing rule: `Block` is S4's union
 * in `src/content/types.ts`, which is PURE and CLIENT-IMPORTABLE and imports only
 * `@/data/types` -- the same leaf everything above imports. The rule forbids
 * schema.ts depending on a module that depends on schema.ts, and nothing under
 * `src/content/**` does or ever will. `status` stays bare `text` for exactly that
 * reason, because `BlogStatus` lives beside a module that will.
 */
import type { Block } from '@/content/types';

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
    /**
     * The option the cards chose, when the querent's question offered a choice.
     * NULL otherwise, which is almost every reading.
     *
     * **A SLICE OF `question`, NOT THE MODEL'S OUTPUT, AND NEVER A CATALOG KEY.**
     * The two facts about this column that everything else follows from:
     *
     *   1. `verdict` above stores a machine token (`yes`/`no`/`maybe`) precisely
     *      so the displayed word can be localised. This column CANNOT do that: the
     *      option is `ayam`, a word the querent typed, and there is no closed set
     *      to tokenise it into. So it stores display text -- the only column in
     *      this table that does -- and `validateChoice` is what makes that safe by
     *      refusing anything that is not a word-bounded substring of `question`.
     *   2. **IT IS THEREFORE NEVER TRANSLATED.** `body` is; `question` is not, on
     *      every surface. A fragment of the question follows the question. See
     *      `ReadingView`.
     *
     * Not `notNull` and no default: a reading without a choice question genuinely
     * has none, and an empty string would be a third state nothing wants.
     */
    choice: text('choice'),
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
    /**
     * First time a share link was minted for this reading (roadmap §4, VD9).
     *
     * DENORMALIZED FROM `share_links` ON PURPOSE, so V6's history list can show a
     * share badge without a join per row -- which is the exact justification §4
     * gives for the column existing at all.
     *
     * ADDED BY V6'S MIGRATION AND WRITTEN BY V7 (reconciliation §3). The build
     * order puts V6 first and V6 only ever READS it; a column a shipped query
     * names has to exist by then, and splitting one column across two migrations
     * to match the ownership of the writer would be ceremony.
     *
     * NULL MEANS NEVER SHARED, AND IT STAYS NULL AFTER A REVOKE. "Was this ever
     * public" is a different question from "is it public now", and
     * `share_links.revoked_at` answers the second. A reader who conflates them
     * will make the badge disappear on revoke, which is a lie about the past.
     */
    sharedAt: tsCol('shared_at'),
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
// share_links  (V7, roadmap v0.3.0 §4 / VD9)
//
// The only table in this schema whose primary key is not the thing that
// authorizes a read. `slug` IS the authorization: `/s/<slug>` is public, so
// `requireUser()` never runs above a row from here and the onboarding gate never
// runs. Read `src/lib/share/slug.ts`'s header before touching the column.
// ---------------------------------------------------------------------------

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * VD9's opaque token. 12 Crockford base32 characters, 60 bits.
     *
     * UNIQUE, NOT PARTIAL-UNIQUE. A revoked slug must never be re-issued, and a
     * unique index excluding revoked rows would free it -- which would let a URL
     * somebody deliberately killed come back to life pointing at somebody else's
     * reading. Re-sharing ROTATES the slug on the same row instead; see
     * `insertOrRotateShareLink`.
     */
    slug: text('slug').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * `'reading' | 'persona'`. BARE `text`, not narrowed with `.$type<>()`.
     *
     * This file's header sets the rule: a column is narrowed only when W1 is the
     * only module that defines its value set. V7 owns `ShareEntity`
     * (`src/lib/share/slug.ts`), so narrowing here would make `schema.ts` depend
     * on a workstream that depends on `schema.ts` -- the same reason
     * `moderation_flags.category` and `frequency_verdicts.window_key` are bare.
     */
    entity: text('entity').notNull(),
    /**
     * POLYMORPHIC, NO FOREIGN KEY (roadmap §4). Postgres cannot declare one, so
     * orphans are possible and the resolver checks the artifact exists AFTER it
     * resolves the slug. A missing artifact must 404 and never 500, and must be
     * indistinguishable from a slug that never existed -- otherwise a stranger
     * holding one slug learns that the account behind it still exists.
     *
     * `on delete cascade` FROM `users` DOES NOT SAVE THIS. That cascade fires at
     * the HARD delete, thirty days after an erasure request, which is why V8's
     * deletion transaction calls `revokeAllForUser` in the same transaction that
     * sets `deleted_at`.
     */
    entityId: uuid('entity_id').notNull(),
    /**
     * **DEFAULTS TO TRUE, WHICH REVERSES VD9, AND THE REVERSAL IS MIFTAH'S
     * RULING RATHER THAN A DRIFT.**
     *
     * VD9 made the question opt-in and defaulted this column to `false`, on the
     * ground that `readings.question` is the querent's own typed text and a shared
     * page is public forever. Miftah's decision on 2026-07-28: **the question is
     * part of the reading**, because a stranger who sees three cards and four
     * paragraphs with no question cannot tell what any of it is about, and a
     * shared reading nobody can follow is not worth sharing.
     *
     * What that costs, recorded here because the column is where somebody will
     * look: the roadmap's risk table calls a leaked question "the single
     * highest-consequence bug in this release", and the four independent
     * mechanisms V7 built against it are now one mechanism (informed consent at
     * mint time) plus three that are merely still WIRED. Specifically:
     *   - `publicReadingQuery` still builds the projection conditionally, so the
     *     capability to exclude the column is intact and tested. Nothing calls it
     *     with `false` any more except the tests.
     *   - The share sheet no longer offers a switch. It shows the question inside
     *     the preview instead, so the querent reads the exact text that is about
     *     to be public before the link exists.
     *   - **THE OG PREVIEW IMAGE STILL CARRIES NEITHER THE QUESTION NOR THE
     *     PROSE** (VD18), and that is NOT part of this reversal: a link preview is
     *     cached by every messenger that sees the URL, before anybody clicks.
     *
     * The column stays rather than being dropped, because it is the mechanism if
     * this is ever revisited and because roadmap §4 fixes its name.
     */
    includeQuestion: boolean('include_question').notNull().default(true),
    includeNickname: boolean('include_nickname').notNull().default(true),
    /**
     * **THE LANGUAGE THE SHARER WAS READING WHEN THEY MINTED THE LINK.** The
     * public page looks up `translations` for this locale and renders that prose,
     * so a stranger sees what the sharer saw rather than what the model generated.
     *
     * **NULLABLE, WITH NO DEFAULT, AND `NULL` MEANS "AS-WRITTEN".** Both halves
     * are load-bearing:
     *
     *   - Every link minted before this column existed is NULL, and the honest
     *     behaviour for those is exactly what they showed yesterday — the prose
     *     verbatim in `readings.locale`. An integration test named for the
     *     guarantee asserts it.
     *   - There is deliberately no `default`. The only correct default would be
     *     `readings.locale`, which a migration cannot know without a join it has
     *     no business doing, and any *constant* default would silently rewrite
     *     what some historic subset of links renders.
     *
     * **IT IS NOT THE VIEWER'S LOCALE AND MUST NEVER BECOME IT.** Serving each
     * stranger their own language would make the page vary by state the sharer
     * cannot see, and the share sheet promises *"this is exactly what they will
     * see"*. `src/app/s/[slug]/adapt.ts` carries that argument in full.
     *
     * A miss is ordinary, not an error: V2 never persists an unverified
     * translation and the nightly sweep deletes orphans, so the resolver falls
     * back to as-written and the page renders the source with `lang` set to the
     * source's locale. **It used to add `share.public.otherLanguage` on top and no
     * longer does** — that notice is deleted (Miftah's ruling, 2026-07-28), so a miss
     * is now visible only as prose in the other language, correctly tagged. See
     * `src/app/s/[slug]/page.tsx`'s header.
     *
     * ── SINCE 2026-07-28 THIS IS PART OF THE ROW'S IDENTITY, NOT AN ATTRIBUTE ───
     *
     * It is in the unique key below, so **a language is a row and re-sharing in a
     * second language mints a second address rather than replacing the first.**
     * `insertOrRotateShareLink`'s `set` clause therefore no longer writes it: a
     * conflict now means "same locale", where re-pinning would be a no-op. That
     * clause used to carry a comment insisting the line was load-bearing; the
     * argument inverted and the comment is inverted with it rather than deleted.
     *
     * One consequence worth stating, because it is what the mint now guarantees:
     * **a non-NULL value here always has a `translations` row behind it.**
     * `createShareLink` calls `translateOrCached` and pins NULL if it falls back,
     * because a row claiming `en` with no English body is a link that lies about
     * its own language — and the notice that used to explain a mismatch is gone.
     */
    locale: text('locale').$type<Locale>(),
    /**
     * Renders, crawlers included. A LOAD AND ABUSE SIGNAL, NOT AN AUDIENCE
     * METRIC -- `share.viewed` is the audience metric, and the pair disagreeing
     * is the diagnosis: far above means a crawler storm, far below means a broken
     * beacon. Query 10 in `docs/analytics-queries.md`.
     *
     * **APPROXIMATE, DELIBERATELY.** It is the one unauthenticated write in this
     * release, so it is incremented in `after()` behind the per-IP limiter and a
     * failure is swallowed. Do not build anything on it that has to be exact.
     */
    viewCount: integer('view_count').notNull().default(0),
    revokedAt: tsCol('revoked_at'),
    createdAt: tsCol('created_at').notNull().defaultNow(),
    updatedAt: tsCol('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    /*
     * One live link per artifact **PER LANGUAGE** (VD9, narrowed 2026-07-28). A
     * revoked row KEEPS its slot, which is what makes rotation rather than
     * un-revocation the only way to re-share an address.
     *
     * **`locale` IS IN THIS KEY AND `NULLS NOT DISTINCT` IS NOT OPTIONAL.** Both
     * halves were paid for; see
     * `docs/plans/2026-07-28-share-per-locale-links-design.md`.
     *
     * The key used to be `(user_id, entity, entity_id)`, so a reading had exactly
     * one address and re-sharing it in a second language REPLACED that address.
     * The querent's English link, already sent to somebody, stopped resolving —
     * reported 2026-07-28. Nothing was overwritten: `readings.body` is immutable
     * and the `translations` row survived. Only the address was lost.
     *
     * **AND THE NAIVE FOUR-COLUMN VERSION IS WORSE THAN THE THREE-COLUMN ONE.**
     * Postgres `UNIQUE` treats NULLs as DISTINCT, and every link minted before this
     * column existed has `locale = NULL`. So without `nullsNotDistinct()`:
     *
     *   - unlimited NULL rows per artifact would be permitted, and
     *   - `onConflictDoUpdate`'s target would never MATCH a legacy NULL row, so
     *     re-sharing a pre-2026-07-28 link would INSERT a second row instead of
     *     rotating — leaving the old slug live and unreachable from the UI. That is
     *     exactly the capability resurrection rotation exists to prevent, arriving
     *     through the back door and with a green suite.
     *
     * With the clause, NULL is a single value for uniqueness: a reading holds at
     * most one `en`, one `id` and one legacy NULL row, each a permanent address,
     * and the conflict target reaches all three. Two integration tests are the
     * negative control — one at the upsert level, one on a raw insert — and both
     * fail by ACCEPTING a second row rather than by throwing.
     *
     * Widening a unique key needs no backfill: anything unique on three columns is
     * unique on four.
     */
    unique('share_links_user_entity_locale_uq')
      .on(t.userId, t.entity, t.entityId, t.locale)
      .nullsNotDistinct(),
    /** The public read path, and the only index a stranger's request touches. */
    index('share_links_live_slug_idx')
      .on(t.slug)
      .where(sql`revoked_at is null`),
  ],
);

// ---------------------------------------------------------------------------
// personas (V8)
// ---------------------------------------------------------------------------

/**
 * The Inner Heavenly Lotus persona (VD15). A NEW TABLE, NOT A WIDENING OF
 * `lotus_avatars`, and the distinction is the point: that block is short,
 * abstracted and INJECTED INTO EVERY READING PROMPT; this one is long, specific,
 * user-facing and names a life-path number and a sun sign. Merging them puts
 * astrology into nine reading prompts a day and flattens the three readers --
 * the exact risk v0.2.0's §10 logged against the Lotus block.
 *
 * `locale` IS "GENERATED IN", NOT "DISPLAYED IN", AND THERE IS NO jsonb HERE ON
 * PURPOSE (VD5/VD6). `lotus_avatars.summary` is jsonb keyed by locale because it
 * is distilled per locale from the same answers and is never shown to anybody, so
 * it can afford for the two halves to differ. The persona is generated ONCE and
 * translated on demand into `translations` keyed
 * `('persona', <user_id>, 'body', <locale>)`, for three reasons and the third
 * decides it: a translation carries its own `model`, `prompt_version` and
 * `created_at`, which a jsonb value cannot and which are the audit trail for
 * something that goes on a public page; five artifacts needing translation would
 * be five jsonb columns and five places to forget `updated_at`; and **two
 * independent distillations of a persona would produce two different people** --
 * V7's share page resolves its locale from the VIEWER, so a stranger in Jakarta
 * and a stranger in London opening the same link would read two different
 * characterisations of one person. See V8's plan §7 before "fixing" this.
 *
 * ONE ROW PER USER, so `user_id` IS the primary key and there is no `id` column.
 * That is a deliberate exception to this file's "every table has `id`"
 * convention, and it is the same exception `lotus_avatars` and `profiles` take:
 * a surrogate key on a table whose natural key is already a uuid buys nothing and
 * costs a second unique index. It also makes `user_id` the `entity_id` for
 * `share_links` and `translations`, which is unusual and correct.
 */
export const personas = pgTable('personas', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** 3-4 sentences, house voice (VD16). Never a reader's. */
  body: text('body').notNull(),
  locale: text('locale').$type<Locale>().notNull(),
  /**
   * The ENGINE's output, structured (VD1). The model sets none of it, and it is
   * the row's audit trail: if a persona ever says something impossible, the first
   * question is whether the engine or the model produced it, and this column
   * answers it without a rerun.
   *
   * V1's `PersonNumbers` plus V8's all-time facts. LOCALE-FREE by V1's own rule,
   * which is what stops `input_hash` churning on a language switch.
   */
  facts: jsonb('facts').$type<Record<string, unknown>>().notNull(),
  /**
   * Profile facts + sanitized answers + closed values + the last ten reading ids
   * + `PERSONA_SOURCE_VERSION`. THE READING IDS ARE THE INTERESTING PART: they are
   * what makes the persona MOVE as the querent reads, which is why it regenerates
   * naturally instead of needing a cron -- and why the staleness check needs a
   * time floor on the read path (`PERSONA_MIN_AGE_SECONDS`).
   */
  inputHash: text('input_hash').notNull(),
  sourceVersion: integer('source_version').notNull(),
  /** `'fallback'` when the body is the template, so an operator asking "why does
   *  this read like a template" looks at the right thing. */
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
  createdAt: tsCol('created_at').notNull().defaultNow(),
  /**
   * SET BY HAND IN EVERY UPSERT. `$onUpdate()` does not fire inside
   * `onConflictDoUpdate`, and for this table that column is load-bearing twice:
   * it is what `isPersonaStale`'s throttle compares against, so a frozen column
   * means the throttle never releases and the persona never regenerates, AND it is
   * the comparand for V2's translation staleness rule (`translations.updated_at <
   * source.updated_at`), so a frozen column also serves a stale translation
   * forever.
   */
  updatedAt: tsCol('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// admin_access_log  (v0.5.0 / A1, roadmap §3.1)
// ---------------------------------------------------------------------------

/**
 * One row per privileged read of another person's data. APPEND-ONLY.
 *
 * **THERE IS NO `updated_at` AND THAT IS THE ENFORCEMENT, NOT AN OVERSIGHT.**
 * Every other mutable table here carries one; a column that exists invites a
 * write, and A-D16 plus roadmap §9.14 say this table has no update path and no
 * delete path. `queries/admin/audit.ts` exports no writer other than the insert,
 * and `audit.contract.test.ts` asserts the absence of `.update(` and `.delete(`.
 * The sweep must never learn this table either (roadmap §6), and `/privacy`
 * clause 6 now promises *kept indefinitely* in both locales.
 *
 * **BOTH FOREIGN KEYS ARE NULLABLE WITH `on delete set null`, AND ROADMAP §3.1
 * ORIGINALLY SAID `admin_user_id` IS NOT NULL. IT WAS WRONG AND THE FAILURE IS
 * NOT COSMETIC** (plan §1.1, resolving open question §12.1; reconciliation R3
 * patched §3.1). `ON DELETE SET NULL` against a NOT NULL column raises `23502`
 * *at delete time*, so the hard delete of any user an admin had ever looked at
 * would abort -- the erasure `/privacy` clause 8 promises, failing for exactly
 * the population most likely to have asked for it, visible only in a cron log.
 * `events.user_id` is the precedent for the shape and for the cost: a deleted
 * admin's rows lose their attribution, and a deleted subject's rows can no longer
 * tell that subject what was read about them. Clause 8.1 says the second half out
 * loud. `audit.integration.test.ts` proves the delete SUCCEEDS, which is the
 * assertion that fails against §3.1's original text.
 *
 * `resource` and `resource_key` are BARE `text`, per this file's rule: A1 owns the
 * value set and exports it from `queries/admin/audit.ts` as `ADMIN_RESOURCES`, so
 * narrowing it here would make schema.ts depend on a module that depends on
 * schema.ts. The set is:
 *   `onboarding_answer` | `moderation_question` | `user_detail` | `reading_body`
 *
 * **`resource_key` IS A QUESTION KEY OR A FLAG ID AND NEVER A DECRYPTED VALUE.**
 * A plaintext answer in an append-only table that survives account erasure would
 * be the worst row in this database. `audit.contract.test.ts` fences the module
 * away from `@/lib/db/crypto` for exactly this.
 */
export const adminAccessLog = pgTable(
  'admin_access_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id').references(() => users.id, { onDelete: 'set null' }),
    subjectUserId: uuid('subject_user_id').references(() => users.id, { onDelete: 'set null' }),
    resource: text('resource').notNull(),
    resourceKey: text('resource_key'),
    createdAt: tsCol('created_at').notNull().defaultNow(),
  },
  (t) => [
    /** "What has been read about this person" -- the query a subject access
     *  request needs, and the only reason the subject column is indexed first. */
    index('admin_access_log_subject_created_idx').on(t.subjectUserId, t.createdAt.desc()),
    /** "What has this admin read" -- the review query. */
    index('admin_access_log_admin_created_idx').on(t.adminUserId, t.createdAt.desc()),
  ],
);

// ---------------------------------------------------------------------------
// llm_calls  (v0.5.0 / A2, roadmap §3.2 with amendments A2-D4 and A2-D6)
// ---------------------------------------------------------------------------

/**
 * ONE ROW PER MODEL CALL. The fact table v0.5.0 exists for.
 *
 * Before A2 this application made nine distinct LLM calls and recorded the token
 * cost of exactly one of them: `/api/reading` threaded `usage` into
 * `readings.token_input` / `token_output` and the other eight destructured it away.
 * Until this table existed there was no answer to *"what does a user cost"*, which
 * is the question a public release starts asking every day -- and no answer to
 * *"which user burned the rolling five-hour window"*, which is the one that precedes
 * a key revocation.
 *
 * **IT IS NOT `events`, AND THE REASONS ARE STRUCTURAL** (A-D4). `events.props` is
 * `jsonb` behind `sanitizeProps()`, which drops non-scalars, caps at 24 keys and
 * truncates strings to 120 characters -- so `sum((props->>'token_input')::int)` over
 * millions of rows is a cast per row on an unindexed field. `events.user_id` is
 * `on delete set null` because events survive erasure, and that bargain is only
 * honest because props are provably scalar. And `events.name` is a closed 70-name
 * taxonomy people read as a data dictionary; a row per model call is not an event in
 * that sense, it is a fact. **A-D18 dropped `llm.call_recorded` for the same reason:
 * a fact table and an event stream recording the same fact is how they drift.**
 *
 * **THERE IS NO `cost_usd` COLUMN AND THERE MUST NOT BE** (A-D7). It would be a lie
 * the day a price changed, and back-filling it would rewrite history. Tokens and the
 * resolved model are the facts; `src/lib/llm/prices.ts` is a committed, versioned,
 * zero-import price table read at query time, and **an unknown model prices as
 * `null`, never as zero** -- a zero silently understates the bill where a null shows
 * up on screen as "unpriced" and gets fixed.
 *
 * **NO `updated_at`.** A ledger row is a fact about a moment. The column would
 * invite an update, and `$onUpdate()` not firing inside `onConflictDoUpdate` is a
 * trap this table has no reason to be anywhere near.
 *
 * **THE DUPLICATION WITH `readings.token_input` / `token_output` IS DELIBERATE**
 * (A-D17). Those columns are read by `docs/analytics-queries.md` and by the
 * `reading.completed` event; removing them is a destructive migration for no gain.
 * `reading_cards.user_id` and `readings.shared_at` are the precedents. The
 * consistency check between them lives in `docs/analytics-queries.md` and **must use
 * `IS DISTINCT FROM`** (R15): both sides are nullable and `a <> b` is NULL rather
 * than true when either is, so a `<>` spelling returns zero rows unconditionally and
 * is indistinguishable from a passing check.
 */
export const llmCalls = pgTable(
  'llm_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * NULL for a call with no querent behind it -- a cron-driven repair pass -- and
     * also, in v0.5.0, for the three W3 onboarding routes that have a real querent
     * and no `withAnalytics` scope (reconciliation R49 accepted that gap rather than
     * spending A2's diff on three W3 handlers). `docs/analytics-queries.md` carries
     * the query that names it.
     */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /**
     * `op: 'reading'` and `op: 'gist'` only, and the second half is R51's doing:
     * **a per-reading TOTAL including moderation is not achievable**, because the
     * classifier runs before the `readings` row exists and can never carry this.
     * The figure on screen is therefore "generation cost", not "this reading's cost".
     */
    readingId: uuid('reading_id').references(() => readings.id, { onDelete: 'set null' }),
    /**
     * WHICH CALL THIS WAS. Bare `text`, per this file's rule: **A2 owns the value
     * set** and exports it as `LLMOp` from the import-free `@/lib/llm/types`, so
     * narrowing it here would make schema.ts depend on a module that depends on
     * schema.ts -- the `events.name` / `frequency_verdicts.window_key` precedent.
     *
     *   `reading` | `moderation` | `gist` | `day_summary` | `frequency`
     *   `lotus` | `persona` | `translation` | `translation_repair`
     *
     * **NINE VALUES, CLOSED.** A3 groups by this column and must not invent a tenth
     * or an alias (roadmap seam 3); `callClass.test.ts` makes that mechanical.
     */
    op: text('op').notNull(),
    /**
     * The RESOLVED model string, never an env var name. `MODERATION_MODEL`,
     * `LOTUS_MODEL`, `PERSONA_MODEL` and `TRANSLATION_MODEL` land here as whatever
     * they resolved to, because pricing is keyed on the model that ran.
     */
    model: text('model').notNull(),
    /** `'interactive' | 'deferred'`, mirroring `CallClass`. Bare, same rule as `op`. */
    callClass: text('call_class').notNull(),
    /** No default: the caller knows, and a default would let a site not say. */
    streamed: boolean('streamed').notNull(),
    /**
     * **NULL, NEVER 0, WHEN THE PROVIDER REPORTS NOTHING** -- on the buffered path
     * too, which is what A2-D5 fixed in `anthropic.ts`. A literal zero here is
     * indistinguishable from a real zero in a dump and makes every average
     * silently wrong.
     *
     * **`input_tokens` IS THE TOTAL, `cache_read_tokens` INCLUDED. NEVER ADD THEM.**
     *
     * **AND IT IS NULL FOR EVERY STREAMED ROW WRITTEN BEFORE 2026-07-30**, which
     * is not a data-quality problem to be backfilled but the record of when this
     * app started measuring. `anthropic.ts` read the count from `message_start`,
     * where this wire always reports 0, so readings, day summaries and streamed
     * translations stored nothing while moderation, gist, lotus and persona --
     * all buffered -- stored real numbers throughout. **Any average over
     * `input_tokens` spanning that date is two different measurements.**
     */
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    /**
     * The cached subset of `input_tokens`. **THREE STATES, ALL MEANINGFUL.**
     *
     *   - `NULL`  -- nothing was reported: a timeout, a dead stream, or a provider
     *                that does not report caching.
     *   - `0`     -- usage WAS reported and nothing came from cache. A measurement.
     *   - `> 0`   -- a cache hit of that size.
     *
     * **THE `0` IS THE POINT AND IT DIFFERS FROM `input_tokens`'s RULE**, where a
     * reported zero becomes NULL because a prompt cannot really cost nothing. A
     * cache-hit rate computed over "rows that happened to have a number" would
     * exclude every genuine miss and read near 100%.
     *
     * Worth watching because a prompt-layer change can destroy cache locality
     * without moving the token chart at all -- and on a per-token provider a cache
     * read is billed at a fraction of a fresh one, so the split is what makes
     * `notionalUsd()` honest. Measured on z.ai 2026-07-30: 1344 of a 1364-token
     * prompt came from cache on the second send.
     *
     * No index: it is only ever summed beside `input_tokens`, which the existing
     * `local_date` and `op` indexes already serve.
     */
    cacheReadTokens: integer('cache_read_tokens'),
    /**
     * **`total_ms`, AND IT TIMES THE CALL RATHER THAN THE REQUEST** (A2-D4,
     * reconciliation R5). `readings.latency_ms` is time to FIRST TOKEN; two columns
     * named `latency_ms` meaning two different measurements in one schema is the
     * trap, and `reading.completed` already distinguishes the two words. Six of the
     * nine ops are buffered and have no TTFT at all.
     *
     * For `op: 'reading'` it is measured from a timestamp taken immediately above
     * `gateReading`, **not** from `outcome.totalMs`, which starts at the top of the
     * handler and includes four budget round trips plus the classifier. **Expect
     * `llm_calls.total_ms < reading.completed.total_ms` for the same reading, and A3
     * must NOT reconcile them** -- they are honest about two different subjects.
     */
    totalMs: integer('total_ms'),
    /**
     * `'ok' | 'partial' | 'failed' | 'aborted'` -- `tee.ts`'s vocabulary verbatim.
     * Bare, same rule as `op`.
     *
     * **`'refused'` WAS IN ROADMAP §3.2 AND IS STRUCK** (A2-D6, reconciliation R4).
     * A `reserveModelCall()` refusal never reaches a provider, so there is no call
     * to record -- and a row for it would destroy `count(*)` as "calls made", which
     * is the quantity `LLM_WINDOW_CALL_CEILING=280` is expressed in and the one A3's
     * meter reconstructs. Every A3 query would need `where status <> 'refused'` and
     * the first to forget it under-reports headroom. The refusal is already recorded
     * by `llm.ceiling_reached`, with a user id and a tier.
     */
    status: text('status').notNull(),
    /**
     * `classifyStreamError()`'s output: `aborted`, `timeout`, `connect`,
     * `disconnected`, `upstream_5xx`, `upstream_429`, `upstream_4xx`, `unknown`.
     *
     * **NEVER A MESSAGE AND NEVER A DRIVER ERROR.** An `error_kind` with unbounded
     * cardinality makes every `group by` useless, and a message can carry a URL, a
     * prompt fragment or a key.
     */
    errorKind: text('error_kind'),
    locale: text('locale').$type<Locale>(),
    /**
     * **THE QUERENT'S CALENDAR DAY, sent by the client, never recomputed from
     * `created_at`** -- the Jakarta trap, which is why `dateCol` is a string. For a
     * call with no querent it is the UTC date, so **a fleet-wide daily bucket over
     * this column sums two calendar systems** and R25 requires A3 to say so on
     * screen rather than leave it to be discovered.
     */
    localDate: dateCol('local_date').notNull(),
    createdAt: tsCol('created_at').notNull().defaultNow(),
  },
  (t) => [
    /** The fleet time series, and the `where created_at > now() - interval '5 hours'`
     *  reconstruction of the rolling window Redis holds. */
    index('llm_calls_created_idx').on(t.createdAt.desc()),
    /** A5's per-user cost page. */
    index('llm_calls_user_created_idx').on(t.userId, t.createdAt.desc()),
    /** Cost by purpose -- the whole reason `op` exists. */
    index('llm_calls_op_created_idx').on(t.op, t.createdAt.desc()),
    /** The day bucket A3 groups on. */
    index('llm_calls_local_date_idx').on(t.localDate),
    /**
     * **AN FK IS NOT AN INDEX AND POSTGRES WILL NOT MAKE ONE FOR YOU.** The
     * `reading_cards_reading_idx` lesson: without it, the referential action
     * performs one sequential scan PER deleted parent row. `set null` scans exactly
     * as `cascade` does.
     */
    index('llm_calls_reading_idx').on(t.readingId),
  ],
);

// ---------------------------------------------------------------------------
// blog_posts + blog_post_locales  (A6, v0.5.0 §3.3, migration 0011)
//
// **TWO TABLES, BECAUSE AN ARTICLE IS ONE THING PUBLISHED ONCE AND N LOCALE
// DOCUMENTS WITH INDEPENDENT BODIES, STATUSES AND TIMESTAMPS.** One table with
// `..._id` / `..._en` column pairs is the shape R6 of v0.3.0 already rejected
// for `lotus_avatars.summary`, and it gets worse here: `status` and
// `updated_at` are per locale, so the pair form would be six columns that must
// be kept in step by hand.
//
// **NOTHING IN THIS PROJECT'S SCHEMA HAD PROSE IN IT BEFORE THIS.** Every other
// text column is either the querent's (encrypted, redacted, retained on a
// clock) or a model's. These two hold PUBLIC content the operator authored, so
// they carry no retention policy and never will: an unpublished article's prose
// is the operator's own, and A-D16's redaction sweep has nothing to do here.
// ---------------------------------------------------------------------------

export const blogPosts = pgTable(
  'blog_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * The URL slug. Hyphenated lowercase ASCII, English, **identical in both
     * locales** -- the same ruling that kept `/history` from becoming `/jejak`,
     * and the thing that makes `/blog/X` <-> `/en/blog/X` a clean mapping
     * `contentAlternates()` can derive without a per-locale path table.
     */
    slug: text('slug').notNull().unique(),
    /**
     * `'YYYY-MM-DD'`, **NULL until the first publish of ANY locale**, and
     * locale-invariant: the article was published once.
     *
     * NOT rewritten by a re-publish. An unpublished article that comes back is
     * the same article, and moving its publication date would tell every
     * crawler it is new.
     */
    datePublished: dateCol('date_published'),
    createdAt: tsCol('created_at').notNull().defaultNow(),
    /**
     * **THIS IS NOT `dateModified`.** `blog_post_locales.updated_at` is
     * (reconciliation R6). This column moves when the SLUG or the PUBLICATION
     * DATE changes, which is a fact about the article and not about either
     * document's prose.
     *
     * Two columns with one name and two meanings is the `llm_calls.latency_ms`
     * trap one table over; R6's ruling is that both keep the name -- they are
     * genuinely the same kind of thing at different grains -- and that the other
     * one carries a comment saying which it is.
     */
    updatedAt: tsCol('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    /**
     * **THE CHECK IS NOT BELT-AND-BRACES OVER THE ZOD SCHEMA. IT IS THE HALF
     * THAT SURVIVES `db:studio`** (reconciliation R6). Without it,
     * `What-Tarot-Is` and `what-tarot-is` are two rows, two URLs and two
     * `hreflang` groups, and the only thing that would notice is a crawler.
     * There is no redirect table in this project and building one is not in
     * scope.
     */
    check('blog_posts_slug_shape_ck', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

export const blogPostLocales = pgTable(
  'blog_post_locales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => blogPosts.id, { onDelete: 'cascade' }),
    locale: text('locale').$type<Locale>().notNull(),
    /**
     * `'draft' | 'published' | 'unpublished'`. **Bare `text`, per this file's
     * rule**: A6 owns the union (`BlogStatus` in `@/lib/content/blogStatus`),
     * and narrowing it here would make schema.ts depend on a module that
     * depends on schema.ts. Same shape as `moderation_flags.category` and
     * `events.name`.
     *
     * **THREE VALUES, AND `'unpublished'` IS NOT `'draft'`** (A6-9). A draft was
     * never public. An unpublished article WAS, may be in Google's index, may be
     * in somebody's group chat, and its URL must now answer 404. They differ in
     * the sitemap, in `hreflang`, in `blogIndexNode.blogPost`, and in whether
     * the transition is reversible without a new `date_published`. Collapsing
     * them to a boolean `published` loses the distinction A-D15's whole
     * reciprocity argument is built on, and `blogStatus.ts` forbids the
     * transition that would launder one into the other.
     */
    status: text('status').notNull().default('draft'),
    /** The `<h1>` and the `<title>`. Under 110 chars **by lint, not by column**. */
    title: text('title').notNull(),
    /** The meta description. 80-158 chars **by lint, not by column**. */
    description: text('description').notNull(),
    /** A committed card's URL slug, resolved through `cardByUrlSlug` ON SAVE. */
    heroCardSlug: text('hero_card_slug'),
    heroAlt: text('hero_alt'),
    /**
     * The existing FIVE block kinds. Validated by zod on save
     * (`@/lib/content/blockSchema`), never on read -- a parse on the read path
     * would sit in front of the pages this release exists to get indexed, and a
     * page that threw on a row it could not parse would 500 on a sitemapped URL
     * for a defect that is already committed.
     */
    body: jsonb('body').$type<Block[]>().notNull(),
    createdAt: tsCol('created_at').notNull().defaultNow(),
    /**
     * **THIS COLUMN IS `dateModified`** (reconciliation R6), and that is why it
     * carries a comment where an ordinary `updated_at` would not.
     *
     * A-D13 DELETED `bodyHash` and the hand-written per-locale date it kept
     * honest. The reason those existed is a reason about FILES -- *"a filesystem
     * mtime is a checkout artefact on Vercel, `git log` is unavailable at
     * request time, and either moves on a whitespace change"* -- and every
     * clause of it is false of a row. This column is written by the request that
     * changed the prose, in the same transaction, and is readable at request
     * time. It is the truthful source that did not exist, and it feeds
     * `BlogPosting.dateModified` AND `sitemap.xml`'s per-URL `lastModified`.
     *
     * **EVERY UPSERT IN `queries/admin/blog.ts` SETS THIS BY HAND, AND THE
     * REASON USUALLY GIVEN IS NOT TRUE OF THE INSTALLED DRIZZLE.** CLAUDE.md
     * says in capitals that `$onUpdate()` does not fire inside
     * `onConflictDoUpdate`; **on drizzle-orm 0.45.2 it does**, measured
     * 2026-07-30 by printing `.toSQL()` here, on `translations` and on
     * `personas` -- all three emit `do update set … "updated_at" = $n` with no
     * by-hand line. The rule stands anyway: three PUBLIC claims
     * (`BlogPosting.dateModified`, `sitemap.xml`'s `lastModified`, and V2's
     * `translations.updated_at < source.updated_at` staleness, which has no
     * `source_hash` column behind it) must not rest on an undocumented
     * behaviour of a pinned dependency. The evidence is in
     * `docs/workstream-notes.md`; amending CLAUDE.md is the reconciliation's.
     */
    updatedAt: tsCol('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('blog_post_locales_post_locale_uq').on(t.postId, t.locale),
    /** The public list filters on it. */
    index('blog_post_locales_status_idx').on(t.status),
    /**
     * **AN FK NEEDS ITS OWN INDEX AND POSTGRES DOES NOT CREATE ONE** (R6). The
     * unique above leads with `post_id` and covers most plans, but a cascade
     * from `blog_posts` is not guaranteed to use it -- the
     * `reading_cards_reading_idx` lesson, where a cascade performed one
     * sequential scan per deleted parent row. `llm_calls.reading_id` states the
     * rule in capitals one table over and §3.3 omitted it here.
     */
    index('blog_post_locales_post_idx').on(t.postId),
    /**
     * **BOTH NULL OR BOTH PRESENT.** `BlogDoc.hero` is
     * `{ cardUrlSlug, alt } | null`, so a half-set pair is a shape the type
     * cannot express and the transform would have to guess at -- and the guess
     * somebody writes is `alt: row.heroAlt ?? ''`, which is an accessibility
     * failure that renders as a perfectly normal-looking page.
     */
    check(
      'blog_post_locales_hero_pair_ck',
      sql`(${t.heroCardSlug} IS NULL) = (${t.heroAlt} IS NULL)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// admin_insights -- A7, 2026-07-31
// ---------------------------------------------------------------------------

/**
 * One model-written reading of one dashboard panel, over one range.
 *
 * `docs/plans/2026-07-31-admin-panel-insights-design.md` §4. The `Insight` button on
 * each subpanel of `/admin` and `/admin/tokens` writes exactly one row here, and the
 * page reads them back in its own `withAdminRead` so **R21 survives: every number on
 * those pages is still queried server-side and there is still no fetch for one.**
 *
 * ── NO `user_id`, AND THAT IS NOT AN OMISSION ───────────────────────────────
 *
 * An insight is about the FLEET, not about who pressed the button, and there is one
 * operator. A `user_id` here would be an identifier in a table that account erasure
 * has no reason to reach, which is the shape `events` had to justify at length. There
 * is nothing to justify if the column is absent.
 *
 * The same argument covers the prose: it cannot contain querent text, because the
 * facts block it is generated from has none. The closest thing any panel carries is
 * the league table's eight-character `user_id` prefixes -- already what that panel
 * renders on screen, already A5's `§1.11` ruling, and `llm_calls.user_id` is
 * `on delete set null` so a prefix that outlives its user names nobody.
 *
 * ── THE KEY IS (panel, range), AND `input_hash` IS A SEPARATE QUESTION ──────
 *
 * Changing the RANGE gives a different key and therefore no row, which renders the
 * empty state -- correct, because prose about seven days is not prose about thirty.
 * What the hash catches is the *same* range whose numbers have since moved, which is
 * every range ending today. Without it the box would keep asserting yesterday's
 * reading of a chart that has changed, under a timestamp that makes it look current.
 * **The stale case still RENDERS the prose** and adds a line saying so: hiding it
 * would be a kill switch blanking a screen, which this project rules against
 * everywhere else it comes up.
 */
export const adminInsights = pgTable(
  'admin_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * `'overview.calls'`, `'tokens.trajectory'` -- a key from A7's panel registry.
     *
     * **Bare `text`, per this file's rule.** `PanelId` is owned by
     * `src/app/admin/insight/panels.ts`, which reaches `copy.ts` and the admin query
     * modules; narrowing it here would make schema.ts depend on a module that
     * depends on schema.ts. Same shape as `events.name` and `llm_calls.op`.
     *
     * A row whose panel no longer exists is harmless: nothing selects it, and the
     * registry test fails first anyway.
     */
    panelId: text('panel_id').notNull(),
    /** The range the insight describes. **`date`, string mode** -- `dateCol`'s rule. */
    rangeFrom: dateCol('range_from').notNull(),
    rangeTo: dateCol('range_to').notNull(),
    /** The prose. 2-4 sentences, Indonesian, no markdown -- `validateInsight` is what
     *  keeps that true, and an output that fails it is never stored. */
    body: text('body').notNull(),
    /**
     * A hash over the exact facts block the model was given. **This is the whole of
     * the staleness mechanism** -- see the header. Never compared across panels.
     */
    inputHash: text('input_hash').notNull(),
    /** The RESOLVED model string, `llm_calls.model`'s rule: pricing and provenance
     *  are keyed on what actually ran, never on the env var that chose it. */
    model: text('model').notNull(),
    createdAt: tsCol('created_at').notNull().defaultNow(),
    /**
     * **WHAT THE BUTTON'S TIMESTAMP RENDERS.** `queries/admin/insights.ts` sets it by
     * hand inside `onConflictDoUpdate`, and that line is load-bearing in the way
     * `translations.updated_at` is: it is the only thing on screen claiming when this
     * prose was written, so it must not be able to freeze at the first insert. See
     * `blog_post_locales.updated_at` for why the by-hand rule is kept even though the
     * pinned drizzle happens to emit the column anyway.
     */
    updatedAt: tsCol('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    /**
     * ONE INSIGHT PER PANEL PER RANGE, so pressing the button again ROTATES rather
     * than accumulating. **All three columns are `not null`, so this needs no
     * `nulls not distinct`** -- V7's `share_links` trap does not reach here, and the
     * clause is omitted deliberately rather than forgotten.
     */
    unique('admin_insights_panel_range_uq').on(t.panelId, t.rangeFrom, t.rangeTo),
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
export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;
export type Persona = typeof personas.$inferSelect;
export type NewPersona = typeof personas.$inferInsert;
/** `AdminAccessLogRow`, not `AdminAccessLog` -- the `EventRow` precedent above.
 *  `AdminAccessLog` reads like a service, and the suffix makes every call site
 *  say which of the two it means. */
export type AdminAccessLogRow = typeof adminAccessLog.$inferSelect;
export type NewAdminAccessLogRow = typeof adminAccessLog.$inferInsert;
export type LlmCall = typeof llmCalls.$inferSelect;
export type NewLlmCall = typeof llmCalls.$inferInsert;
export type BlogPost = typeof blogPosts.$inferSelect;
export type NewBlogPost = typeof blogPosts.$inferInsert;
/** `BlogPostLocale`, singular, though the table is plural: one row is one document. */
export type BlogPostLocale = typeof blogPostLocales.$inferSelect;
export type NewBlogPostLocale = typeof blogPostLocales.$inferInsert;
export type AdminInsight = typeof adminInsights.$inferSelect;
export type NewAdminInsight = typeof adminInsights.$inferInsert;
