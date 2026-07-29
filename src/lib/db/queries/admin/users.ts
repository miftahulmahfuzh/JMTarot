/**
 * Per-user reads for the admin surface. **Handle first, and NO `deleted_at` FILTER.**
 *
 * A3, v0.5.0. Reconciliation R29 and roadmap §13: **A5 must not write its own per-user
 * aggregates** -- roadmap §7 gives A5 "per-user token series" and A3 this file, which
 * is one metric with two owners and a seam §11 does not list.
 *
 * ── `getUserById` FILTERS `isNull(deleted_at)` AND NOTHING HERE MAY REUSE IT ─
 *
 * ```
 * src/lib/db/queries/profile.ts:68
 *   .where(and(eq(users.id, userId), isNull(users.deletedAt)))
 * ```
 *
 * That is correct for the querent's own profile and **wrong for the operator's page**.
 * Roadmap §7 requires a soft-deleted user to be *"visible AND LABELLED"*, because
 * hiding them is how the thirty-day restore window becomes invisible -- and if A3
 * reused `getUserById` or `findUserByGoogleSub` the requirement would fail **silently**:
 * the page would 404 and read like a bad id. So `adminUserById` and `adminUserList`
 * return deleted rows with a `deleted` flag, and an integration test seeds one and
 * asserts it comes back flagged.
 *
 * **A5 must then render that state honestly rather than as empty.** V8's
 * `redactForUser()` and `revokeAllForUser()` already ran inside the delete transaction,
 * so much of the data is genuinely gone -- *"deleted, and redacted on <date>"* is the
 * truth and blank panels are not.
 *
 * ── THE UUID GUARD, WHICH IS NOT DEFENSIVE PROGRAMMING ──────────────────────
 *
 * Postgres raises `22P02` on a malformed uuid literal, so a bad id in a URL becomes a
 * 500 rather than an empty page. `queries/share.ts` and `allTime.ts` both carry this
 * check and **A3 copies it rather than importing across modules** -- five lines against
 * a new coupling between query files, which is the trade both of those already made.
 *
 * ── AND EVERY AGGREGATE IS `unknown` ────────────────────────────────────────
 *
 * See `metrics.ts`'s header. `min(local_date)`/`max(local_date)` in particular: the
 * column is `date` with `mode: 'string'`, but **`mode: 'string'` is a Drizzle-side
 * mapping and there is no mapper inside a raw aggregate** -- so it is a string either
 * way and the type must say so. `topCardAllTime`'s `lastSeen: sql<string>` is the
 * precedent and it is already right.
 */
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db/types';
import { isUsableRange } from '@/lib/analytics/series';

/** An inclusive `'YYYY-MM-DD'` range. Same shape as `metrics.ts`'s. */
export type Range = { from: string; to: string };

/** `queries/share.ts`'s guard: postgres raises 22P02 on a malformed uuid literal. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The hard cap on any top-N. **Applied in TypeScript, so a caller cannot ask for the
 * whole fleet through a query shaped for a league table.**
 */
export const USER_LIST_MAX = 200;

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function strOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function clamp(n: unknown, fallback: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.floor(v), max);
}

// ---------------------------------------------------------------------------
// M11 -- userTotals: one person, one range
// ---------------------------------------------------------------------------

export type UserTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** `'YYYY-MM-DD'` **strings**, or null when the user made no calls in the range. */
  firstLocalDate: string | null;
  lastLocalDate: string | null;
};

const NO_TOTALS: UserTotals = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  firstLocalDate: null,
  lastLocalDate: null,
};

/** What one querent's calls came to over a range. Zeroes -- never a throw -- for a
 *  malformed id, and zeroes for a user with nothing in the range. */
export async function userTotals(
  db: DbOrTx,
  userId: string,
  range: Range,
): Promise<UserTotals> {
  if (!UUID_RE.test(userId) || !isUsableRange(range.from, range.to)) return NO_TOTALS;
  const rows = await db.execute(sql`
    select count(*)                          as calls,
           coalesce(sum(input_tokens),  0)    as input_tokens,
           coalesce(sum(output_tokens), 0)    as output_tokens,
           min(local_date)::text              as first_local_date,
           max(local_date)::text              as last_local_date
      from llm_calls
     where user_id = ${userId}::uuid
       and created_at >= ${range.from}::date
       and created_at <  (${range.to}::date + 1)
  `);
  const r = (rows as unknown as Array<Record<string, unknown>>)[0];
  if (!r) return NO_TOTALS;
  return {
    calls: num(r.calls),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    firstLocalDate: strOrNull(r.first_local_date),
    lastLocalDate: strOrNull(r.last_local_date),
  };
}

// ---------------------------------------------------------------------------
// M12 -- userCostLeague: the table, per (user, model)
// ---------------------------------------------------------------------------

export type LeagueRow = {
  /**
   * **NULL IS A REAL ROW, NOT A GAP.** `llm_calls.user_id` is `on delete set null`, so
   * a hard-deleted user's history survives with the attribution gone -- and the tokens
   * were still spent. The caller labels it `'(deleted or system)'` and never drops it.
   *
   * **A consequence the page has to state:** a hard delete moves history from an
   * attributed row to an unattributed one, so **cost-per-user denominators shift over
   * time.** A monotonically-falling "cost per user" with no explanation is a metric
   * that gets trusted.
   */
  userId: string | null;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Tokens per `(user, model)`, biggest first. **Roadmap §5.3 renders this as a TABLE
 * with an inline bar, not a chart** -- more than ~7 meaningful classes is a table, and
 * this has as many classes as there are users.
 *
 * Per `(user, model)` for A9's reason: a sum across models is unpriceable, because
 * A-D7 prices per model per period.
 */
export async function userCostLeague(
  db: DbOrTx,
  range: Range,
  limit = 50,
): Promise<LeagueRow[]> {
  if (!isUsableRange(range.from, range.to)) return [];
  const n = clamp(limit, 50, USER_LIST_MAX);
  const rows = await db.execute(sql`
    select user_id::text                     as user_id,
           model,
           count(*)                          as calls,
           coalesce(sum(input_tokens),  0)    as input_tokens,
           coalesce(sum(output_tokens), 0)    as output_tokens
      from llm_calls
     where created_at >= ${range.from}::date
       and created_at <  (${range.to}::date + 1)
     group by 1, 2
     order by output_tokens desc, user_id nulls last, model
     limit ${n}
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    userId: strOrNull(r.user_id),
    model: String(r.model),
    calls: num(r.calls),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
  }));
}

// ---------------------------------------------------------------------------
// M13 -- userCallsByLocalDate: the per-user sparkline
// ---------------------------------------------------------------------------

export type UserDayRow = { bucket: string; calls: number };

/**
 * M2 with a `user_id` predicate.
 *
 * **SERVED BY `llm_calls_user_created_idx`'s LEADING COLUMN PLUS A FILTER, AND THERE IS
 * NO `(user_id, local_date)` INDEX ON `llm_calls`.** Recorded because it is the obvious
 * thing to reach for after reading `reading_cards_user_date_card_idx`; the difference
 * is that this query is one user's page load, not a per-request feature.
 *
 * **NOT zero-filled**, unlike M2: a sparkline for one person over a long range is
 * mostly zeroes, and the caller knows the range it asked for. `zeroFill` is one call
 * away if A5 wants it.
 */
export async function userCallsByLocalDate(
  db: DbOrTx,
  userId: string,
  range: Range,
): Promise<UserDayRow[]> {
  if (!UUID_RE.test(userId) || !isUsableRange(range.from, range.to)) return [];
  const rows = await db.execute(sql`
    select local_date::text as bucket,
           count(*)         as calls
      from llm_calls
     where user_id = ${userId}::uuid
       and local_date >= ${range.from}
       and local_date <= ${range.to}
     group by 1
     order by 1
  `);
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    bucket: String(r.bucket),
    calls: num(r.calls),
  }));
}

// ---------------------------------------------------------------------------
// R29 -- the admin's view of an account, soft-deleted ones included
// ---------------------------------------------------------------------------

export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string | null;
  nickname: string | null;
  locale: string;
  createdAt: string;
  lastSeenAt: string;
  /** **The label R29 requires.** `null` for a live account. */
  deletedAt: string | null;
  deleted: boolean;
  /** `profiles.completed_at`, so a half-onboarded account is visible as one. */
  onboardedAt: string | null;
  readings: number;
};

/**
 * **SCALARS ONLY. NO `body`, NO `gist`, NO DECRYPTED ANSWER, EVER.**
 *
 * V6's precedent and its binding reason: the list payload's fence is VD8, not bytes.
 * A5 asserts it on the returned object (`'body' in item` is false), and this function
 * is where that has to be true. **A decrypted onboarding answer reaches a browser only
 * through `GET /api/admin/users/<id>/answer/<key>`, one key per request, audited** --
 * there must never be a bulk variant, and a list query is exactly the shape one would
 * arrive as.
 */
export async function adminUserList(
  db: DbOrTx,
  opts: { search?: string; limit?: number; offset?: number } = {},
): Promise<AdminUserRow[]> {
  const limit = clamp(opts.limit, 50, USER_LIST_MAX);
  const offset = Number.isFinite(Number(opts.offset)) && Number(opts.offset) > 0
    ? Math.floor(Number(opts.offset))
    : 0;
  // A substring match on the one handle an operator actually has. `%` and `_` are
  // escaped so a search for `a_b` does not silently match everything.
  const term = (opts.search ?? '').trim();
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  const rows = await db.execute(sql`
    select u.id::text                        as id,
           u.email                           as email,
           u.display_name                    as display_name,
           p.nickname                        as nickname,
           u.locale                          as locale,
           u.created_at::text                as created_at,
           u.last_seen_at::text              as last_seen_at,
           u.deleted_at::text                as deleted_at,
           p.completed_at::text              as onboarded_at,
           (select count(*) from readings r where r.user_id = u.id) as readings
      from users u
      left join profiles p on p.user_id = u.id
     -- NO deleted_at FILTER (R29). See this file's header. (No backticks in a
     -- SQL comment inside a template literal: one ends the template.)
     ${term ? sql`where u.email ilike ${like} escape '\\'` : sql``}
     order by u.last_seen_at desc, u.id
     limit ${limit} offset ${offset}
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map(toAdminUserRow);
}

/**
 * One account, **including a soft-deleted one** (R29). `null` for an unknown id and
 * for a malformed one -- never a throw, so a bad URL is a 404 rather than a 500.
 */
export async function adminUserById(db: DbOrTx, userId: string): Promise<AdminUserRow | null> {
  if (!UUID_RE.test(userId)) return null;
  const rows = await db.execute(sql`
    select u.id::text                        as id,
           u.email                           as email,
           u.display_name                    as display_name,
           p.nickname                        as nickname,
           u.locale                          as locale,
           u.created_at::text                as created_at,
           u.last_seen_at::text              as last_seen_at,
           u.deleted_at::text                as deleted_at,
           p.completed_at::text              as onboarded_at,
           (select count(*) from readings r where r.user_id = u.id) as readings
      from users u
      left join profiles p on p.user_id = u.id
     -- NO deleted_at FILTER (R29). getUserById has one and is right to; reusing it
     -- here would 404 the page that exists to show a deleted account.
     where u.id = ${userId}::uuid
  `);
  const r = (rows as unknown as Array<Record<string, unknown>>)[0];
  return r ? toAdminUserRow(r) : null;
}

function toAdminUserRow(r: Record<string, unknown>): AdminUserRow {
  const deletedAt = strOrNull(r.deleted_at);
  return {
    id: String(r.id),
    email: String(r.email),
    displayName: strOrNull(r.display_name),
    nickname: strOrNull(r.nickname),
    locale: String(r.locale),
    createdAt: String(r.created_at),
    lastSeenAt: String(r.last_seen_at),
    deletedAt,
    deleted: deletedAt !== null,
    onboardedAt: strOrNull(r.onboarded_at),
    readings: num(r.readings),
  };
}
