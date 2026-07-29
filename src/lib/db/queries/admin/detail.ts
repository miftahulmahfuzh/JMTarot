/**
 * The per-user reads that no other module owns. v0.5.0 / A5, task 2.
 *
 * `/admin/users/[id]` renders fourteen sections about one person. Six of them have no
 * query anywhere else in the project, because no querent-facing surface ever wanted
 * them: the Lotus in full, every day summary, every frequency verdict, every
 * translation with its staleness, every share link, and the raw event stream. They are
 * here.
 *
 * **THE SPLIT IN THIS DIRECTORY IS BY FILE, NEVER BY FUNCTION.** A3 owns `users.ts`,
 * `metrics.ts`, `rollup.ts`, `calls.ts` and `timeout.ts`; A1 owns `audit.ts`; A5 owns
 * this file, `moderation.ts` and `readings.ts`. Two workstreams editing one file in
 * here is a reconciliation defect (plan §7).
 *
 * ── THE FOUR RULES OF THIS DIRECTORY, AND THE FIFTH THAT BIT V8 ──────────────
 *
 * `queries/contract.test.ts` enforces the first four and will fail on any of them:
 * the handle is the FIRST parameter of every exported function; nothing here imports
 * `react`, `next/*` or `server-only`, directly **or transitively**; `../client` is
 * never imported; and a malformed uuid returns empty rather than reaching the driver.
 *
 * The fifth is `answersUpdatedAt`'s: **`sql<T>` is an assertion the driver is not
 * obliged to honour.** Drizzle maps a timestamp to a `Date` when it knows the COLUMN;
 * inside a raw `sql` template there is no mapper and postgres.js returns a STRING.
 * V8's first version asserted `Date`, the compiler believed it, and `personaStaleness`
 * compared a string to a Date with `>` — which coerces and answers *something*, so
 * every answer edit was judged wrongly **with a green typecheck and a green unit
 * suite.** Only an integration test calling `.getTime()` saw it.
 *
 * **So this file uses the QUERY BUILDER over named columns wherever it can**, which is
 * everywhere except `max(updated_at)`, and that one is typed `unknown` and converted
 * by hand. `detail.integration.test.ts` asserts the JavaScript type of every timestamp
 * it returns, not just the value.
 *
 * ── NO `deleted_at` FILTER, ANYWHERE IN THIS FILE (R29) ──────────────────────
 *
 * `getUserById` filters `isNull(users.deletedAt)` and is right to for the querent's own
 * profile. Roadmap §7 requires a soft-deleted user to be *visible AND LABELLED*,
 * because hiding them is how the thirty-day restore window becomes invisible — and
 * reusing `getUserById` here would fail that requirement **silently**: the page would
 * 404 and read like a bad id.
 *
 * ── OWNERSHIP IS A PREDICATE, NEVER AN ASSERTION AFTERWARDS (A5-16) ──────────
 *
 * Every read below filters `user_id = :subjectId` inside the `where`. Fetching by id
 * and comparing owners in JavaScript is one forgotten `if` away from serving the wrong
 * person's data, and the forgotten `if` is invisible in review. It matters MORE here
 * than in V6: the caller is an admin and every row *is* readable, so the failure mode
 * is not a 403 — it is the wrong person's page under the right person's URL.
 *
 * ── AND NOTHING HERE DECRYPTS ANYTHING (A5-6, A5-9) ─────────────────────────
 *
 * `answerStatesForAdmin` reads `answer_text IS NOT NULL` and never the column, which
 * is the same predicate as the encryption audit in `schema.ts`. The decrypt sites in
 * this release are exactly two and neither is here: `queries/onboarding.ts` for the
 * six answers, `queries/admin/moderation.ts` for a flagged question.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { ONBOARDING_QUESTION_KEYS, type OnboardingQuestionKey } from '@/data/onboarding';
import {
  dailySummaries,
  events,
  frequencyVerdicts,
  lotusAvatars,
  onboardingAnswers,
  personas,
  readings,
  shareLinks,
  translations,
  users,
  type DailySummary,
  type EventRow,
  type FrequencyVerdict,
  type LotusAvatar,
  type ShareLink,
} from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';
import { effectiveLocaleSource, type Locale, type LocaleSource } from '@/lib/i18n/locale';

/** `queries/share.ts`'s guard, copied rather than imported — the trade `users.ts` and
 *  `allTime.ts` both already made. Postgres raises `22P02` on a malformed uuid
 *  literal, so a bad id in a URL would be a 500 rather than an empty page. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nothing on this page is a feed. Every list read is capped, and the page says so. */
export const DETAIL_ROW_CAP = 200;

// ---------------------------------------------------------------------------
// §4.1 -- identity, every column of `users`
// ---------------------------------------------------------------------------

export type AdminIdentity = {
  id: string;
  googleSub: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  locale: Locale;
  /** **Resolved, never raw.** `NULL` means `'chosen'`; `raw ?? 'default'` is what a
   *  reasonable person writes without the helper, and it would tell the operator that
   *  a preference nobody set can be overwritten — for every pre-v0.3.0 row. */
  localeSource: LocaleSource;
  createdAt: Date;
  lastSeenAt: Date;
  deletedAt: Date | null;
  termsAcceptedAt: Date | null;
  termsVersion: string | null;
  ageConfirmedAt: Date | null;
};

/**
 * One account, every column, soft-deleted ones included.
 *
 * **A3's `adminUserById` IS NOT A SUBSTITUTE AND THIS IS NOT A DUPLICATE OF IT.** That
 * function returns the LIST's projection — eleven fields plus a readings count — and
 * §4.1 of A5's plan requires all fifteen `users` columns, including `google_sub`,
 * `email_verified`, `avatar_url`, `locale_source`, `terms_*` and `age_confirmed_at`.
 * Widening A3's row would edit A3's file for A5's page, which §7 forbids; calling both
 * would be two reads for one row. So the LIST calls A3's and the DETAIL page calls
 * this, and each returns exactly what its own surface renders.
 *
 * `null` for an unknown id and for a malformed one — never a throw, so a bad URL is a
 * 404 rather than a 500 (A5-17).
 */
export async function userIdentityForAdmin(
  db: DbOrTx,
  userId: string,
): Promise<AdminIdentity | null> {
  if (!UUID_RE.test(userId)) return null;
  const [row] = await db
    .select({
      id: users.id,
      googleSub: users.googleSub,
      email: users.email,
      emailVerified: users.emailVerified,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      locale: users.locale,
      localeSource: users.localeSource,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
      deletedAt: users.deletedAt,
      termsAcceptedAt: users.termsAcceptedAt,
      termsVersion: users.termsVersion,
      ageConfirmedAt: users.ageConfirmedAt,
    })
    .from(users)
    // NO `deleted_at` FILTER (R29). See this file's header.
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;
  return { ...row, localeSource: effectiveLocaleSource(row.localeSource) };
}

/** The admin's own email, for `admin_access_log`'s attribution column (§4.14).
 *  One statement for the whole log rather than one per row. */
export async function adminEmailsByIds(
  db: DbOrTx,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id) => UUID_RE.test(id)))];
  if (wanted.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.email]));
}

// ---------------------------------------------------------------------------
// §4.3 -- the six answers, as PRESENCE (A5-D4)
// ---------------------------------------------------------------------------

export type AdminAnswerState = {
  key: OnboardingQuestionKey;
  /** There is a row at all. `false` is *belum ditanya* — the stepper never got there. */
  asked: boolean;
  /** A real answer: unskipped, and either encrypted text or a closed-set choice. */
  answered: boolean;
  skipped: boolean;
  /** Free-text answers only. The CHOICE value is not encrypted and is shown inline. */
  hasText: boolean;
  choice: string | null;
  updatedAt: Date | null;
};

/**
 * Which of the six have an answer, which are a skip, and when each last changed.
 * **DECRYPTS NOTHING, AND SELECTS NO CIPHERTEXT** (A5-9).
 *
 * **WHY NOT `answerPresence` FROM `queries/onboarding.ts`:** it returns
 * `{ key, answered }` and this page needs `updated_at` per row — §4.4's honest
 * staleness signal is the Lotus's `updated_at` beside the answers' — plus `skipped`
 * and `asked` told apart, which `answerPresence` folds together. Widening it would
 * edit a W3/V8 module for an A5 page, and plan §7 lists it as CONSUMED, NOT EDITED.
 * **This is a second NULLITY read, not a second decrypt site: A5-6 is intact** and
 * `queries/onboarding.ts` remains the only module that touches that column's value.
 *
 * Returned in CATALOG order and not row order, so the six rows are always in the order
 * the querent was asked — the same reason `lotusInputHash` iterates it.
 */
export async function answerStatesForAdmin(
  db: DbOrTx,
  userId: string,
): Promise<AdminAnswerState[]> {
  const blank = ONBOARDING_QUESTION_KEYS.map((key) => ({
    key,
    asked: false,
    answered: false,
    skipped: false,
    hasText: false,
    choice: null,
    updatedAt: null,
  }));
  if (!UUID_RE.test(userId)) return blank;

  const rows = await db
    .select({
      questionKey: onboardingAnswers.questionKey,
      skipped: onboardingAnswers.skipped,
      // `sql<boolean>` WRAPPED IN `Boolean(...)` AT THE BOUNDARY -- the
      // `readingsForDay` `hasBody` precedent. postgres.js returns a real boolean for
      // `is not null` today; the wrap is what makes that not matter.
      hasText: sql<boolean>`${onboardingAnswers.answerText} is not null`,
      choice: onboardingAnswers.answerChoice,
      updatedAt: onboardingAnswers.updatedAt,
    })
    .from(onboardingAnswers)
    .where(eq(onboardingAnswers.userId, userId));

  const byKey = new Map(rows.map((r) => [r.questionKey, r]));
  return ONBOARDING_QUESTION_KEYS.map((key) => {
    const row = byKey.get(key);
    if (!row) {
      return { key, asked: false, answered: false, skipped: false, hasText: false, choice: null, updatedAt: null };
    }
    const hasText = Boolean(row.hasText);
    const hasChoice = row.choice !== null && row.choice !== '';
    return {
      key,
      asked: true,
      answered: !row.skipped && (hasText || hasChoice),
      skipped: row.skipped,
      hasText,
      choice: row.choice,
      updatedAt: row.updatedAt,
    };
  });
}

/**
 * When any of the six was last written. **Typed `unknown` and converted by hand — do
 * NOT "tidy" it into `sql<Date>`.**
 *
 * `answersUpdatedAt` in `queries/onboarding.ts` is the same statement and is deliberately
 * not called here: that module's copy exists for `personaStaleness` on the READ path of
 * `/account`, and importing it would put a W3/V8 module on this page's critical read for
 * one aggregate. The comment above it is the one that matters and it is repeated here
 * because the trap is the type, not the location.
 */
export async function answersLastChanged(db: DbOrTx, userId: string): Promise<Date | null> {
  if (!UUID_RE.test(userId)) return null;
  const [row] = await db
    .select({ at: sql<unknown>`max(${onboardingAnswers.updatedAt})` })
    .from(onboardingAnswers)
    .where(eq(onboardingAnswers.userId, userId));
  const raw = row?.at ?? null;
  if (raw === null) return null;
  // postgres.js hands back a STRING for `max(timestamptz)`. A `Date` here is a
  // conversion, not a cast.
  const at = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(at.getTime()) ? null : at;
}

// ---------------------------------------------------------------------------
// §4.4 -- the Lotus, in full and in both locales
// ---------------------------------------------------------------------------

/**
 * The distillation, whole.
 *
 * Shown in full on purpose: it is model output `lotusSafetyCheck` already passed, it is
 * **injected into every reading prompt**, and *"why do this querent's readings feel like
 * that"* is answerable from nowhere else. It is also the abstraction that stands between
 * the six raw answers and the persona — D10's rule enforced by construction — so an
 * operator reading it is reading the safe layer, not the sensitive one. It has no reveal
 * because it is not a secret; the six answers underneath it are, and they have one.
 */
export async function lotusForAdmin(db: DbOrTx, userId: string): Promise<LotusAvatar | null> {
  if (!UUID_RE.test(userId)) return null;
  const [row] = await db
    .select()
    .from(lotusAvatars)
    .where(eq(lotusAvatars.userId, userId))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// §4.8 -- day summaries
// ---------------------------------------------------------------------------

/**
 * Every day summary, newest day first.
 *
 * `generation_count` and `updated_at` are both rendered and they sit next to each other,
 * because the throttle compares exactly those two — `generation_count` exists to make
 * *"is the throttle set right?"* one query instead of an events aggregation, and this
 * page is where that question gets asked.
 */
export async function dailySummariesForAdmin(
  db: DbOrTx,
  userId: string,
  limit = DETAIL_ROW_CAP,
): Promise<DailySummary[]> {
  if (!UUID_RE.test(userId)) return [];
  return db
    .select()
    .from(dailySummaries)
    .where(eq(dailySummaries.userId, userId))
    .orderBy(desc(dailySummaries.localDate), desc(dailySummaries.createdAt))
    .limit(cap(limit));
}

// ---------------------------------------------------------------------------
// §4.9 -- frequency verdicts
// ---------------------------------------------------------------------------

/**
 * Every frequency verdict.
 *
 * **The page renders no count and derives no tally.** V3 deleted `m` and `n` from both
 * prompts rather than forbidding them, on the ground that *a model cannot recite a count
 * it was never given*; a dashboard that puts them on screen beside the verdict is not a
 * breach of that, but it is the arithmetic the feature exists to stop doing out loud, and
 * it invites somebody to "surface" it in the product. Two card ids, the fingerprint prefix
 * and the prose. Nothing else.
 */
export async function frequencyVerdictsForAdmin(
  db: DbOrTx,
  userId: string,
  limit = DETAIL_ROW_CAP,
): Promise<FrequencyVerdict[]> {
  if (!UUID_RE.test(userId)) return [];
  return db
    .select()
    .from(frequencyVerdicts)
    .where(eq(frequencyVerdicts.userId, userId))
    .orderBy(desc(frequencyVerdicts.updatedAt))
    .limit(cap(limit));
}

// ---------------------------------------------------------------------------
// §4.10 -- translations, with the staleness flag
// ---------------------------------------------------------------------------

export type AdminTranslation = {
  id: string;
  entity: string;
  entityId: string;
  field: string;
  sourceLocale: Locale;
  locale: Locale;
  body: string;
  model: string;
  promptVersion: string;
  createdAt: Date;
  updatedAt: Date;
  /** `translations.updated_at < source.updated_at`. **This comparison IS the entire
   *  mechanism** — there is no `source_hash` column — and `putTranslation` setting
   *  `updatedAt` by hand inside `onConflictDoUpdate` is what keeps it working. */
  stale: boolean;
  /** What it was compared against, on screen, so a frozen column is visible as one. */
  sourceUpdatedAt: Date;
};

/**
 * Every translation belonging to this person, from both arms.
 *
 * **IT JOINS NOTHING AND IT CANNOT.** `translations.entity_id` has no foreign key and
 * orphans are possible by design (the daily sweep's fourth delete is the answer), so
 * ownership is established per arm instead:
 *
 *   - `entity = 'reading'` rows are matched against **this user's reading ids**;
 *   - `entity = 'persona'` rows are matched against `user_id` itself, because
 *     `personas.user_id` IS the primary key — one persona per person, which is why
 *     `resolvePersona`'s `where` reads as a tautology and must not be "simplified".
 *
 * An orphan row is therefore unreachable from a user page. Stated so the absence is not
 * read as a bug.
 *
 * **The staleness comparand differs by arm and both are correct.** A reading's source is
 * `readings.created_at`, because a reading is immutable once written — its creation time
 * is the correct and permanent comparand (`resolveTranslatable` says so). A persona's is
 * `personas.updated_at`, because it is regenerated.
 */
export async function translationsForAdmin(
  db: DbOrTx,
  userId: string,
  limit = DETAIL_ROW_CAP,
): Promise<AdminTranslation[]> {
  if (!UUID_RE.test(userId)) return [];
  const n = cap(limit);

  const readingRows = await db
    .select({
      id: translations.id,
      entity: translations.entity,
      entityId: translations.entityId,
      field: translations.field,
      sourceLocale: translations.sourceLocale,
      locale: translations.locale,
      body: translations.body,
      model: translations.model,
      promptVersion: translations.promptVersion,
      createdAt: translations.createdAt,
      updatedAt: translations.updatedAt,
      sourceUpdatedAt: readings.createdAt,
    })
    .from(translations)
    .innerJoin(readings, eq(readings.id, translations.entityId))
    .where(and(eq(translations.entity, 'reading'), eq(readings.userId, userId)))
    .orderBy(desc(translations.updatedAt))
    .limit(n);

  const personaRows = await db
    .select({
      id: translations.id,
      entity: translations.entity,
      entityId: translations.entityId,
      field: translations.field,
      sourceLocale: translations.sourceLocale,
      locale: translations.locale,
      body: translations.body,
      model: translations.model,
      promptVersion: translations.promptVersion,
      createdAt: translations.createdAt,
      updatedAt: translations.updatedAt,
      sourceUpdatedAt: personas.updatedAt,
    })
    .from(translations)
    .innerJoin(personas, eq(personas.userId, translations.entityId))
    .where(and(eq(translations.entity, 'persona'), eq(personas.userId, userId)))
    .orderBy(desc(translations.updatedAt))
    .limit(n);

  return [...readingRows, ...personaRows]
    .map((r) => ({
      ...r,
      // Both are real `Date`s: they came from named COLUMNS, which is the case Drizzle
      // maps. The comparison is `getTime()` rather than `<` on the objects so that a
      // string arriving here from a future refactor fails loudly rather than coercing.
      stale: r.updatedAt.getTime() < r.sourceUpdatedAt.getTime(),
    }))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, n);
}

// ---------------------------------------------------------------------------
// §4.11 -- share links
// ---------------------------------------------------------------------------

export type AdminShareLink = ShareLink & {
  /** `revoked_at IS NULL`. Derived here so the page does not spell the rule twice. */
  live: boolean;
};

/**
 * Every share link this person ever minted, live or revoked, newest first.
 *
 * **`locale = NULL` MEANS AS-WRITTEN AND NEVER "UNKNOWN"** — every link minted before
 * that column existed is NULL, and the honest behaviour for those is the prose verbatim
 * in `readings.locale`. A non-NULL value always has a `translations` row behind it,
 * because the mint resolves the pin rather than trusting it.
 *
 * **No revoke control anywhere above this function**, and that is §1's rule rather than
 * an omission: revocation is per-artifact, kills every language, and re-sharing rotates
 * the slug — so an admin revoke button is a write to querent data with no consent path
 * and no undo.
 */
export async function shareLinksForAdmin(
  db: DbOrTx,
  userId: string,
  limit = DETAIL_ROW_CAP,
): Promise<AdminShareLink[]> {
  if (!UUID_RE.test(userId)) return [];
  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.userId, userId))
    .orderBy(desc(shareLinks.createdAt))
    .limit(cap(limit));
  return rows.map((r) => ({ ...r, live: r.revokedAt === null }));
}

// ---------------------------------------------------------------------------
// §4.13 -- the event stream
// ---------------------------------------------------------------------------

/**
 * The last N events for this person, newest first. Served by
 * `events_user_created_idx`.
 *
 * `props` is safe to render because `sanitizeProps()` provably strips non-scalars,
 * truncates strings to 120 characters, caps at 24 keys and rejects `__proto__`,
 * `constructor` and `prototype` by name — the property that makes `events` rows honest
 * survivors of account erasure, and the property that makes this section renderable at
 * all. **The cap is stated on screen**, so 200 is not read as "that is all there ever
 * was".
 *
 * **A purged user's events are unreachable from here** (`user_id` is `on delete set
 * null`), so an empty stream beside a live account is a bug and an empty stream beside a
 * hard-deleted one is correct. The page says which.
 */
export async function eventsForAdmin(
  db: DbOrTx,
  userId: string,
  limit = DETAIL_ROW_CAP,
): Promise<EventRow[]> {
  if (!UUID_RE.test(userId)) return [];
  return db
    .select()
    .from(events)
    .where(eq(events.userId, userId))
    .orderBy(desc(events.createdAt))
    .limit(cap(limit));
}

/** Every list read here is capped in TypeScript, so a caller cannot ask for the whole
 *  table through a query shaped for a panel. `users.ts`'s `clamp` precedent. */
function cap(limit: number): number {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return DETAIL_ROW_CAP;
  return Math.min(Math.floor(n), DETAIL_ROW_CAP);
}
