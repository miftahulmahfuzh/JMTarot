/**
 * The shapes that cross the wire on `/admin/users` and `/admin/users/[id]`.
 * v0.5.0 / A5, task 1.
 *
 * ── ZERO IMPORTS, FOR THE `@/data/types` REASON AND ONE MORE ─────────────────
 *
 * `AdminReveal` is a client component and it consumes three of the response types
 * below, so this module ends up in the browser bundle. A single import of
 * `@/lib/db/schema` here would drag drizzle into it; a single import of
 * `@/lib/i18n/locale` would trip `adminCopy.test.ts`'s grep, which forbids **any**
 * `@/lib/i18n/` specifier anywhere under `src/app/admin/**` and
 * `src/components/chart/**`. So: no imports at all, and `Locale` is spelled as its
 * two values.
 *
 * **`AdminLocale` IS NOT A SECOND SOURCE OF TRUTH AND MUST NOT GROW A THIRD VALUE.**
 * `LOCALES` in `@/lib/i18n/locale` is the source; this is that union restated in a
 * module that may not import it, exactly as `@/data/types` restates `ReadingStatus`
 * for `ReadingView`'s client fence. `types.contract.test.ts` asserts the two agree,
 * so adding `'ms'` to one is a red test rather than a silent divergence.
 *
 * ── NO PROSE FIELD EXISTS ON THE LIST ITEM, NOT EVEN A NULLABLE ONE (A5-8) ───
 *
 * V6's rule, and *the binding reason is VD8, not bytes*: a query that fetched
 * `readings.body` and set it to null has already put the prose in the payload. The
 * fence asserts `'body' in item === false` on the returned OBJECT, so absence has to
 * be STRUCTURAL — which is what this type is for. A `body: null` here would make
 * that assertion unwritable.
 */

/** `Locale`, restated. See the header: this file may not import it. */
export type AdminLocale = 'id' | 'en';

/**
 * One row of `/admin/users`.
 *
 * `readings` comes from A3's `adminUserList`; `calls`, `inputTokens`, `outputTokens`
 * and `notionalUsd` come from A3's `userCostLeague` folded per user, and are `null`
 * for a user outside that query's cap — **`null` means "not in the top rows of this
 * range", never zero.** The page says so above the table, because a zero there would
 * read as "this person costs nothing".
 */
export type AdminUserListItem = {
  id: string;
  email: string;
  displayName: string | null;
  nickname: string | null;
  locale: string;
  /** ISO instants, formatted by the caller. */
  createdAt: string;
  lastSeenAt: string;
  /** Non-null means soft-deleted. A5-14: visible AND labelled. */
  deletedAt: string | null;
  deleted: boolean;
  /** `profiles.completed_at`. NULL is "onboarding belum selesai", not "no name". */
  onboardedAt: string | null;
  readings: number;
  calls: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** **NOTIONAL** (A-D7): what these tokens would cost at the fallback provider's
   *  rate. `null` while `NOTIONAL_MODEL` is unset, which is today. */
  notionalUsd: number | null;
};

/** `GET /api/admin/users`. */
export type AdminUserListResponse = {
  items: AdminUserListItem[];
  /** Opaque to the UI. `<iso>|<uuid>`; see `cursor.ts`. */
  nextCursor: string | null;
  /** True when the aggregate query hit its cap, so some rows carry `null` figures. */
  aggregateCapped: boolean;
};

/**
 * `GET /api/admin/users/[id]/answer/[key]`. **The most sensitive response this
 * application produces**, alongside its `/account` twin.
 *
 * `text: null` is a SKIP — or a row whose ciphertext will not open, which reads as a
 * skip because there is no answer to be had from it (`decryptField`'s documented
 * asymmetry). A missing row is a 404 and not a member of this type: the stepper never
 * reached that question, which after completion is a bug worth seeing.
 */
export type AdminAnswerReveal = {
  key: string;
  freeText: boolean;
  text: string | null;
  choice: string | null;
  skipped: boolean;
};

/**
 * `GET /api/admin/users/[id]/moderation/[flagId]`, as a discriminated union.
 *
 * **FOUR MEMBERS, AND THE FOURTH IS NOT A SHRUG.** A rotated key is not the same
 * fact as a redaction: rendering `'undecryptable'` as `'redacted'` would claim the
 * 30-day retention promise was kept when it may not have been.
 *
 * Only `'available'` writes an `admin_access_log` row (A5-11) — padding the log with
 * no-op reads makes the subject-access answer wrong in the alarming direction.
 */
export type AdminFlagReveal =
  | { flagId: string; state: 'available'; question: string }
  | { flagId: string; state: 'redacted'; redactedAt: string }
  | { flagId: string; state: 'never_stored' }
  | { flagId: string; state: 'undecryptable' };

/** `GET /api/admin/users/[id]/reading/[readingId]`. Audited on every 200. */
export type AdminReadingReveal = {
  readingId: string;
  question: string | null;
  body: string | null;
  gist: string | null;
  choice: string | null;
  locale: AdminLocale;
  status: string;
};

/**
 * The client bound on every reveal fetch, paired with the routes' `maxDuration = 15`
 * (§4.2 rule 2: *a bigger `maxDuration` must be paired with a bound on the client, or
 * you have only made the hang longer*).
 *
 * **12s SITS BETWEEN A3's 10s STATEMENT TIMEOUT AND THE ROUTE'S 15s FUNCTION LIMIT**,
 * which is the ordering `queries/admin/timeout.ts` requires: the database gives up
 * first with a diagnosable error, then the client, then the platform. It is NOT
 * `ADMIN_CLIENT_ABORT_MS` — that constant is 15s against a 30s page budget and lives
 * in a module that imports drizzle, so a client component cannot reach it.
 */
export const REVEAL_ABORT_MS = 12_000;
