/**
 * `readings` + `reading_cards` + the per-reading ledger, for the operator.
 * v0.5.0 / A5, task 4.
 *
 * ── THE LIST CARRIES NO `body` AND NO `gist`, AND ABSENCE IS STRUCTURAL (A5-8) ─
 *
 * `AdminReadingRow` declares neither field. The integration test asserts
 * `'body' in item === false` on the returned OBJECT and not `item.body === null`,
 * because **the binding reason is VD8, not bytes**: a query that fetched the column and
 * dropped it has already put four paragraphs of prose in the payload of a page that
 * renders fourteen sections. `hasBody` and `hasGist` are the nullity of those columns,
 * read in SQL and wrapped in `Boolean(...)` at the boundary.
 *
 * The prose is reachable one row at a time through `readingWithBodyForAdmin`, behind an
 * audit row — which is what gives `admin_access_log`'s `reading_body` resource value
 * something to be (R28: *a dead audit value reads as a capability that exists*).
 *
 * ── `question` IS INLINE AND `body` IS NOT, AND THE ASYMMETRY IS THE DECISION ─
 *
 * `readings.question` is plaintext in the table by design — `schema.ts` says so and
 * `/privacy` names it as stored user text. An audited reveal over an unencrypted column
 * would suggest a protection that does not exist, and it would make the list unusable
 * for the one thing a list is for: telling readings apart. `body` is the artifact.
 *
 * ── V6's `blocked` FILTER IS DELIBERATELY ABSENT (A5-22) ─────────────────────
 *
 * `queries/history.ts` filters `status <> 'blocked'` and CLAUDE.md calls that filter
 * security-adjacent: a blocked reading's `question` is text W7's classifier flagged, and
 * *a permanently browsable copy under another column name undoes a retention promise*.
 * On `/admin` the ask is "everything" and the operator is the person who tunes the
 * blocklist, so blocked rows ARE returned, with no cards, labelled on screen. Three
 * things make that honest rather than a regression: the surface is 404 to everyone else;
 * opening the page writes `resource = 'user_detail'`; and **A1's `/privacy` amendment
 * says an operator can read questions including refused ones.**
 *
 * ── `latency_ms` IS TTFT AND `total_ms` IS NOT (roadmap seam 2) ──────────────
 *
 * `readings.latency_ms` is **time to first token**. `llm_calls.total_ms` times the CALL,
 * from a timestamp above `gateReading`. Two columns, two meanings, one schema — and a
 * dashboard is exactly where they get confused, which is why the column header on screen
 * says `TTFT` in those letters and `costsForReadings` returns `totalMs` under its own
 * name.
 *
 * ── AND THE PER-READING FIGURE IS "GENERATION COST", NOT "COST" (R51) ───────
 *
 * `llm_calls.reading_id` is set for the `reading` op and for `gist`. The moderation
 * classifier runs **before** the `readings` row exists, so it can never carry the id — a
 * per-reading total including moderation would need a request id threaded through both,
 * which nobody asked for. **A number labelled "the cost of this reading" that omits one
 * of the three calls is a wrong number wearing a right label**, so the label says
 * *biaya generasi* and the complete total lives in the per-op table.
 */
import { and, asc, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { llmCalls, readingCards, readings } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';
import type { Locale } from '@/lib/i18n/locale';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One page of readings. Fifty is the operator's screenful; the page pages. */
export const READINGS_PAGE = 50;
export const READINGS_MAX = 200;

/** A card as it was drawn. **Sorted by `position`** — see `readingCardsFor`. */
export type AdminCard = { cardId: number; reversed: boolean; position: number };

export type AdminReadingRow = {
  id: string;
  createdAt: Date;
  /** A `'YYYY-MM-DD'` STRING, the querent's own calendar day (A5-15). Never a `Date`. */
  localDate: string;
  readerId: string;
  serviceId: string;
  locale: Locale;
  status: string;
  verdict: string | null;
  /** A slice of the querent's question, never the model's copy. Never translated. */
  choice: string | null;
  question: string | null;
  hasBody: boolean;
  hasGist: boolean;
  model: string;
  promptVersion: string;
  /** **TIME TO FIRST TOKEN.** See the header. */
  latencyMs: number | null;
  tokenInput: number | null;
  tokenOutput: number | null;
  /** The BROWSER session, not the auth session. Joins `events.session_id`. */
  sessionId: string | null;
  sharedAt: Date | null;
  cards: AdminCard[];
};

/**
 * The keyset cursor. **`createdAt` IS A FULL-PRECISION TEXT TIMESTAMP, NOT A `Date`, AND
 * THAT IS THE WHOLE REASON THIS TYPE EXISTS.**
 *
 * ── MEASURED, 2026-07-29: A `Date` CURSOR RETURNS AN EMPTY SECOND PAGE ──────
 *
 * `timestamptz` holds MICROseconds and a JavaScript `Date` holds MILLIseconds. Round-trip
 * `created_at` through a `Date` and you get `21:14:28.123` for a row stored at
 * `21:14:28.123456` — so `created_at = $cursor` is FALSE and `created_at < $cursor` is
 * FALSE too, and the tiebreak arm of the keyset matches nothing. The integration test
 * seeded five readings inside one transaction (where `now()` is fixed, so all five share a
 * timestamp and the tiebreak is the ONLY thing paging them) and page two came back empty:
 * **two unique ids across three pages instead of five.**
 *
 * In production the timestamps differ, so the failure is subtler and worse: paging stops
 * one row early at every page boundary whose microseconds are non-zero, and the operator
 * sees a list that quietly ends. Nothing about that looks like a bug.
 *
 * So the cursor carries `created_at::text` and the comparison casts it back. The value is
 * opaque to the UI either way.
 */
export type ReadingCursor = { createdAt: string; id: string };

/**
 * One page of this person's readings, newest first, with their cards.
 *
 * **KEYSET, NEVER `OFFSET`** (A5-D2): `(created_at desc, id desc)`. `OFFSET 400`
 * re-reads four hundred rows per page and shifts under concurrent writes, so a row can
 * appear on two consecutive pages or on neither. Served by `readings_user_created_idx`.
 *
 * A malformed cursor is treated as ABSENT rather than as an error, because a broken
 * cursor must show page one rather than a 400 (§5.3's rule, applied to the same codec).
 */
export async function readingsForAdmin(
  db: DbOrTx,
  userId: string,
  opts: { limit?: number; before?: ReadingCursor } = {},
): Promise<{ rows: AdminReadingRow[]; nextCursor: ReadingCursor | null }> {
  if (!UUID_RE.test(userId)) return { rows: [], nextCursor: null };
  const limit = clamp(opts.limit, READINGS_PAGE, READINGS_MAX);

  // A cursor whose id is not a uuid is treated as absent: a broken cursor must show page
  // one rather than a 400.
  const before = opts.before && UUID_RE.test(opts.before.id) ? opts.before : undefined;
  const at = before ? sql`${before.createdAt}::timestamptz` : null;
  const keyset = before
    ? or(
        sql`${readings.createdAt} < ${at}`,
        and(sql`${readings.createdAt} = ${at}`, lt(readings.id, before.id)),
      )
    : undefined;

  const rows = await db
    .select({
      id: readings.id,
      createdAt: readings.createdAt,
      localDate: readings.localDate,
      readerId: readings.readerId,
      serviceId: readings.serviceId,
      locale: readings.locale,
      status: readings.status,
      verdict: readings.verdict,
      choice: readings.choice,
      question: readings.question,
      // NULLITY, NOT THE COLUMN (A5-8/A5-D4).
      hasBody: sql<boolean>`${readings.body} is not null`,
      hasGist: sql<boolean>`${readings.gist} is not null`,
      model: readings.model,
      promptVersion: readings.promptVersion,
      latencyMs: readings.latencyMs,
      tokenInput: readings.tokenInput,
      tokenOutput: readings.tokenOutput,
      sessionId: readings.sessionId,
      sharedAt: readings.sharedAt,
      /** Full precision, for the cursor. See `ReadingCursor`. */
      createdAtText: sql<string>`${readings.createdAt}::text`,
    })
    .from(readings)
    // NO `status <> 'blocked'` FILTER. See the header (A5-22).
    .where(keyset ? and(eq(readings.userId, userId), keyset) : eq(readings.userId, userId))
    .orderBy(desc(readings.createdAt), desc(readings.id))
    // One more than asked for, so "is there a next page" is an observation rather than a
    // second `count(*)` over a growing table.
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const cards = await readingCardsFor(db, page.map((r) => r.id));

  const out = page.map(({ createdAtText: _drop, ...r }) => ({
    ...r,
    hasBody: Boolean(r.hasBody),
    hasGist: Boolean(r.hasGist),
    cards: cards.get(r.id) ?? [],
  }));

  const last = page.at(-1);
  return {
    rows: out,
    nextCursor:
      rows.length > limit && last ? { createdAt: String(last.createdAtText), id: last.id } : null,
  };
}

/**
 * The cards for a page of readings, grouped by reading and **ordered by `position`**.
 *
 * The order is the `ReadingView` lesson: `flatMap` compacts, a renderer reads
 * `picks[i]`, and a missing middle card lands the third under the second slot's label
 * with nothing on screen looking wrong. The page assigns these into a SPARSE array by
 * `position`, and this function's job is only to keep the rows together and in order.
 *
 * A `blocked` reading has zero card rows, which is why the map may not have an entry for
 * every id and why the caller defaults to `[]` rather than asserting.
 */
export async function readingCardsFor(
  db: DbOrTx,
  readingIds: readonly string[],
): Promise<Map<string, AdminCard[]>> {
  const ids = [...new Set(readingIds.filter((id) => UUID_RE.test(id)))];
  const out = new Map<string, AdminCard[]>();
  if (ids.length === 0) return out;

  const rows = await db
    .select({
      readingId: readingCards.readingId,
      cardId: readingCards.cardId,
      reversed: readingCards.reversed,
      position: readingCards.position,
    })
    .from(readingCards)
    .where(inArray(readingCards.readingId, ids))
    .orderBy(asc(readingCards.readingId), asc(readingCards.position));

  for (const r of rows) {
    const list = out.get(r.readingId) ?? [];
    list.push({ cardId: r.cardId, reversed: r.reversed, position: r.position });
    out.set(r.readingId, list);
  }
  return out;
}

/**
 * The generation cost of each reading on the page, from the ledger.
 *
 * One `group by reading_id` over `llm_calls_reading_idx` — the index roadmap §3.2
 * required for exactly this, because *Postgres does not index an FK for you* (the
 * `reading_cards_reading_idx` lesson, where a cascade performed one sequential scan per
 * deleted parent row).
 *
 * **`untokenized` TRAVELS WITH THE TOKENS** (A-D7): a reading whose provider reported
 * nothing has real calls and no token counts, and a zero there would silently understate
 * it. Every aggregate is typed `unknown` and converted by hand — `count()` is a bigint
 * and `sum()` is a numeric, and both arrive as strings that a `sql<number>` would make
 * the compiler believe.
 */
export type ReadingCost = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  untokenized: number;
  /** **TOTAL, not TTFT** — and it times the CALL, not the request (R5). */
  totalMs: number | null;
};

export async function readingCostsFor(
  db: DbOrTx,
  readingIds: readonly string[],
): Promise<Map<string, ReadingCost>> {
  const ids = [...new Set(readingIds.filter((id) => UUID_RE.test(id)))];
  const out = new Map<string, ReadingCost>();
  if (ids.length === 0) return out;

  const rows = await db
    .select({
      readingId: llmCalls.readingId,
      calls: sql<unknown>`count(*)`,
      inputTokens: sql<unknown>`coalesce(sum(${llmCalls.inputTokens}), 0)`,
      outputTokens: sql<unknown>`coalesce(sum(${llmCalls.outputTokens}), 0)`,
      untokenized: sql<unknown>`count(*) filter (
        where ${llmCalls.inputTokens} is null and ${llmCalls.outputTokens} is null
      )`,
      totalMs: sql<unknown>`sum(${llmCalls.totalMs})`,
    })
    .from(llmCalls)
    .where(inArray(llmCalls.readingId, ids))
    .groupBy(llmCalls.readingId);

  for (const r of rows) {
    if (r.readingId === null) continue;
    out.set(r.readingId, {
      calls: num(r.calls),
      inputTokens: num(r.inputTokens),
      outputTokens: num(r.outputTokens),
      untokenized: num(r.untokenized),
      // `sum()` over a group whose every `total_ms` is NULL is itself NULL, and
      // `Number(null)` is 0 BY ACCIDENT rather than on purpose. A null latency is a
      // fact; a zero is a claim.
      totalMs: r.totalMs === null || r.totalMs === undefined ? null : num(r.totalMs),
    });
  }
  return out;
}

export type AdminReadingBody = {
  readingId: string;
  question: string | null;
  body: string | null;
  gist: string | null;
  choice: string | null;
  locale: Locale;
  status: string;
};

/**
 * One reading's prose. **The audited read** — `src/lib/admin/reveal.ts` writes the
 * `admin_access_log` row before calling this, and there is no other caller.
 *
 * `null` when the reading is not this user's: *"does not exist"* and *"not theirs"* are
 * the same answer (V7's share-slug reasoning), and ownership is a PREDICATE in the same
 * statement rather than a comparison afterwards (A5-16) — which matters more here than
 * anywhere else on the surface, because the caller is an admin and every row *is*
 * readable, so the failure mode is the wrong person's prose under the right person's URL.
 *
 * A `failed` reading with `body IS NULL` still returns its `question`, which is why the
 * reveal is audited unconditionally: that is plaintext the operator has now read.
 */
export async function readingWithBodyForAdmin(
  db: DbOrTx,
  userId: string,
  readingId: string,
): Promise<AdminReadingBody | null> {
  if (!UUID_RE.test(userId) || !UUID_RE.test(readingId)) return null;
  const [row] = await db
    .select({
      readingId: readings.id,
      question: readings.question,
      body: readings.body,
      gist: readings.gist,
      choice: readings.choice,
      locale: readings.locale,
      status: readings.status,
    })
    .from(readings)
    .where(and(eq(readings.id, readingId), eq(readings.userId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * Does this reading belong to this user? **Reads no prose at all.**
 *
 * The reveal's ordering needs this: an `admin_access_log` row must not be written for a
 * reading id that is somebody else's or does not exist — a 404 that logged an access
 * would let anybody with the admin's session salt the subject's own audit trail. So the
 * ownership probe comes first, then the audit, then the read.
 */
export async function readingExistsForUser(
  db: DbOrTx,
  userId: string,
  readingId: string,
): Promise<boolean> {
  if (!UUID_RE.test(userId) || !UUID_RE.test(readingId)) return false;
  const [row] = await db
    .select({ id: readings.id })
    .from(readings)
    .where(and(eq(readings.id, readingId), eq(readings.userId, userId)))
    .limit(1);
  return row !== undefined;
}

function clamp(n: unknown, fallback: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.floor(v), max);
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
