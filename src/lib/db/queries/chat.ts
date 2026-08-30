/**
 * `chat_threads`, `chat_messages` and `chat_runs` — the whole data layer of the
 * group chat (v0.7.0, F1).
 *
 * The four rules of this directory, applied:
 *
 *  1. **The handle comes FIRST** (`[F1-13]`), so the message route's transaction, the
 *     integration suite's rolled-back one, and the lease test's SECOND CONNECTION can
 *     all be passed in.
 *  2. Nothing here imports `../client`, `react`, `next/*` or `server-only` — not even
 *     transitively. It may import `@/lib/chat/types` **only because that file is a
 *     LEAF** whose one import is `@/data/types`; `types.contract.test.ts` is what
 *     keeps that true, and `queries/contract.test.ts` walks the graph.
 *  3. No caching. The room is read once per open and then appended to.
 *  4. One file per read concern — and the chat is one concern with three tables,
 *     because every read of any of them is keyed on `user_id` and half of them are
 *     one transaction with a read of another.
 *
 * ── EVERY PROJECTION IS EXPLICIT, AND THAT IS `[F1-12]` ────────────────────
 *
 * **`chat_messages.model` MUST NEVER REACH THE BROWSER** (§0.3 non-negotiable 2), and
 * `scripts/audit-secrets.ts` greps the built bundle for env VALUES — it cannot see a
 * column a route JSON-serialised. So there is **no bare `db.select()` in this file**:
 * every read names its columns, `model` is in none of them, and
 * `chat.contract.test.ts` fails on a projection that grows one.
 *
 * ── NEVER LOG A DRIVER ERROR FROM HERE OR FROM A CALLER (`[F1-23]`) ────────
 *
 * A postgres error quotes the failing statement **and its bound parameters**, and
 * `chat_messages.body` is one of them — text a person typed into a room where they
 * were invited to talk about the worst thing they have seen. This module throws its
 * driver errors unchanged and **every caller catches them through `logChatFailure()`**
 * in `@/lib/chat/log`. The generalisation `CLAUDE.md` states is the audit: *"which of
 * my bound parameters came from a person."*
 */
import { and, desc, eq, gt, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import type { Locale } from '@/data/types';
import type {
  BeatSheet,
  ChatAuthor,
  ChatMessageDto,
  ReplyStub,
  RunStatus,
  RunTrigger,
} from '@/lib/chat/types';
import { REPLY_SNIPPET_CHARS } from '@/lib/chat/types';
import type { DbOrTx } from '../types';
import {
  chatMessages,
  chatRuns,
  chatThreads,
  type ChatRun,
  type ChatThread,
} from '../schema';

/**
 * `queries/share.ts`'s guard, for its reason: `user_id` is a uuid column, and postgres
 * raises `22P02` on a malformed literal rather than returning nothing. A read that
 * 500s on a bad id turns a caller's bug into an outage — and here it would turn it
 * into an outage on the busiest polled route in the app.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The columns a route may see. **`model` IS ABSENT AND THAT IS THE ENFORCEMENT**
 * (`[F1-12]`). Declared once so the three read paths cannot drift apart, and so the
 * contract test has one thing to check rather than three.
 */
const DTO_COLUMNS = {
  id: chatMessages.id,
  author: chatMessages.author,
  body: chatMessages.body,
  locale: chatMessages.locale,
  replyToMessageId: chatMessages.replyToMessageId,
  attachedReadingId: chatMessages.attachedReadingId,
  runId: chatMessages.runId,
  beatIndex: chatMessages.beatIndex,
  intent: chatMessages.intent,
  createdAt: chatMessages.createdAt,
} as const;

type DtoRow = {
  id: string;
  author: ChatAuthor;
  body: string;
  locale: Locale;
  replyToMessageId: string | null;
  attachedReadingId: string | null;
  runId: string | null;
  beatIndex: number | null;
  intent: ChatMessageDto['intent'];
  createdAt: Date;
};

/** A row as it crosses the wire. `replyTo` is filled in by `withReplyStubs`. */
function toDto(row: DtoRow, replyTo: ReplyStub | null = null): ChatMessageDto {
  return {
    id: row.id,
    author: row.author,
    body: row.body,
    locale: row.locale,
    replyToMessageId: row.replyToMessageId,
    replyTo,
    attachedReadingId: row.attachedReadingId,
    runId: row.runId,
    beatIndex: row.beatIndex,
    intent: row.intent,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Resolve every `reply_to_message_id` in a page into an inline stub (`[R10]`).
 *
 * **WITHOUT THIS THE RELEASE'S MOST DISTINCTIVE MECHANIC SILENTLY DISAPPEARS.** A page
 * is 40 rows and `C-D11`'s whole point is a beat quoting an hour-old message, which is
 * usually off the page — so a client resolving stubs from what it already has would
 * render the quote as nothing, on exactly the bubbles the feature exists for.
 *
 * ONE extra query per page, by primary key, and only when the page contains a quote.
 * **The snippet is cut server-side**: a client that received whole bodies to truncate
 * would have a second copy of every quoted message, which is a longer answer to
 * *"what does this endpoint disclose"* for no gain.
 */
async function withReplyStubs(db: DbOrTx, rows: DtoRow[]): Promise<ChatMessageDto[]> {
  const wanted = [...new Set(rows.map((r) => r.replyToMessageId).filter((v): v is string => !!v))];
  if (wanted.length === 0) return rows.map((r) => toDto(r));

  const quoted = await db
    .select({
      id: chatMessages.id,
      author: chatMessages.author,
      snippet: sql<string>`left(${chatMessages.body}, ${REPLY_SNIPPET_CHARS})`,
    })
    .from(chatMessages)
    .where(inArray(chatMessages.id, wanted));

  const byId = new Map(quoted.map((q) => [q.id, q as ReplyStub]));
  return rows.map((r) => toDto(r, (r.replyToMessageId && byId.get(r.replyToMessageId)) || null));
}

// ---------------------------------------------------------------------------
// chat_threads
// ---------------------------------------------------------------------------

/** NULL IS NORMAL. Nobody has a thread until they first post or are first messaged. */
export async function getThread(db: DbOrTx, userId: string): Promise<ChatThread | null> {
  if (!UUID_RE.test(userId)) return null;
  const [row] = await db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * The querent's UTC offset, or null. **THE ONE READ R1 ADDED** (`[R17]`, closed).
 *
 * `[R17]` folded `utc_offset_minutes` into `0014` while nothing read it, so that
 * ruling the other way later would be one line rather than a migration. This is
 * that line.
 *
 * **NULL IS A FIRST-CLASS ANSWER AND NEVER ZERO** — no thread row, no offset
 * ever reported, or a malformed header that was refused rather than coerced.
 * `resolveChatClock` turns it into a `known: false` clock and the room is as
 * timeless as it was before, which is a degradation rather than a wrong answer.
 *
 * Its own projection rather than `getThread`, because the engine calls it once
 * per beat on the path of a model call: five columns this caller does not want
 * is five columns crossing a Neon link in `sin1` for nothing.
 *
 * **AND `getThread`'s OWN `.select()` IS NOT NARROWED, DELIBERATELY.** Phases 7
 * and 8 both read `thread?.utcOffsetMinutes` off it — the material detectors and
 * the quiet-hours gate — and both state they compile on `main` because that
 * projection is a bare `select()`. Adding a second, narrower reader is free;
 * narrowing the existing one would break two later phases with a green
 * typecheck in this one.
 */
export async function threadOffsetMinutes(db: DbOrTx, userId: string): Promise<number | null> {
  if (!UUID_RE.test(userId)) return null;
  const [row] = await db
    .select({ utcOffsetMinutes: chatThreads.utcOffsetMinutes })
    .from(chatThreads)
    .where(eq(chatThreads.userId, userId))
    .limit(1);
  return row?.utcOffsetMinutes ?? null;
}

/**
 * What a caller may move on a thread. Every field optional; absent means untouched.
 *
 * **NOT `Partial<NewChatThread>`**, which would let a caller write `userId`,
 * `createdAt` or — worse — `lastReadAt`, which has its own monotonic writer for the
 * reason `markRead` states.
 */
export type ThreadTouch = {
  lastUserMessageAt?: Date;
  lastReaderMessageAt?: Date;
  lastProactiveAt?: Date;
  proactiveCountToday?: number;
  /** `'YYYY-MM-DD'`, the QUERENT'S day. **Never a `Date`** (`[F1-21]`). */
  proactiveCountDate?: string;
  utcOffsetMinutes?: number;
};

/**
 * Create the thread if it is absent, and move whatever the caller named.
 *
 * **`updatedAt` IS SET BY HAND** (`[F1-22]`). `$onUpdate()` applies to `db.update()`
 * only and does NOT fire inside `onConflictDoUpdate`; drop the line and the column
 * freezes at the first insert, silently, while every other assertion about the row
 * still passes. For this table it is the only thing that can say when the cursors last
 * moved.
 */
export async function upsertThread(
  db: DbOrTx,
  userId: string,
  touch: ThreadTouch = {},
): Promise<void> {
  const now = new Date();
  await db
    .insert(chatThreads)
    .values({ userId, ...touch, updatedAt: now })
    .onConflictDoUpdate({
      target: chatThreads.userId,
      set: { ...touch, updatedAt: now },
    });
}

/**
 * Move the read cursor, and answer with the count AFTER the move so F4 needs no
 * second call.
 *
 * **`greatest(last_read_at, $2)`: THE CURSOR NEVER MOVES BACKWARDS.** Four pages of
 * the app poll `/api/chat/state` and any of their tabs may post here late; an
 * out-of-order request from a slow one must not resurrect a dot the querent already
 * cleared. `greatest` ignores NULLs rather than propagating them, which is the
 * behaviour wanted on a thread whose cursor has never been set.
 *
 * **THE TIMESTAMP IS BOUND AS AN ISO STRING WITH AN EXPLICIT CAST, AND THAT IS NOT
 * FUSS.** Inside a raw `sql` template there is no column for drizzle to hang an
 * encoder on, so a JS `Date` reaches postgres.js's serializer untouched and throws
 * `ERR_INVALID_ARG_TYPE` — at runtime, on a green typecheck. Same family as
 * `answersUpdatedAt`'s *"`sql<T>` is an assertion the driver is not obliged to
 * honour"*: **inside a template, do the conversion yourself.**
 */
export async function markRead(db: DbOrTx, userId: string, upTo: Date): Promise<number> {
  const now = new Date();
  await db
    .insert(chatThreads)
    .values({ userId, lastReadAt: upTo, updatedAt: now })
    .onConflictDoUpdate({
      target: chatThreads.userId,
      set: {
        lastReadAt: sql`greatest(${chatThreads.lastReadAt}, ${upTo.toISOString()}::timestamptz)`,
        updatedAt: now,
      },
    });
  return unreadCount(db, userId);
}

/**
 * Reader messages the querent has not seen. **THE DOT IS LIT BY A STORED BUBBLE AND
 * NEVER BY A PENDING RUN** (`[R6]`).
 *
 * `C-R6` makes a zero-beat plan valid and desirable, so a dot lit by a pending run can
 * lead the querent to a room with nothing new in it — the exact opposite of what the
 * dot is for. `/api/chat/state` returns this count and the pending flag as two
 * separate fields: **the count drives the dot, the flag drives the warm.**
 *
 * `author <> 'user'` rather than an enumeration of the three readers, so a fourth
 * reader would be counted the day it lands rather than the day somebody remembers this
 * line.
 */
export async function unreadCount(db: DbOrTx, userId: string): Promise<number> {
  if (!UUID_RE.test(userId)) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.userId, userId),
        sql`${chatMessages.author} <> 'user'`,
        /*
         * A thread with no `last_read_at` has never been opened, so EVERY reader
         * message is unread. The subquery is a primary-key lookup and keeps this one
         * statement — a caller reading the thread first would have to decide what an
         * absent row means, and two callers would decide differently.
         */
        sql`${chatMessages.createdAt} > coalesce(
              (select ${chatThreads.lastReadAt} from ${chatThreads}
                where ${chatThreads.userId} = ${userId}),
              '-infinity'::timestamptz)`,
      ),
    );
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// chat_messages
// ---------------------------------------------------------------------------

export type InsertMessageInput = {
  userId: string;
  author: ChatAuthor;
  body: string;
  locale: Locale;
  replyToMessageId?: string | null;
  attachedReadingId?: string | null;
  runId?: string | null;
  beatIndex?: number | null;
  intent?: ChatMessageDto['intent'];
  clientKey?: string | null;
  /** The RESOLVED model, `chatModelName()`. NULL for `author = 'user'`. */
  model?: string | null;
  /**
   * Overrides the column default. **THE ONLY CALLER IS `completeBeat`, AND IT NEEDS
   * IT BECAUSE `now()` IS FROZEN INSIDE A TRANSACTION.**
   *
   * `defaultNow()` is `transaction_timestamp()`, so two bubbles written for one beat
   * (`[R19]`) land on the *identical* microsecond — and every ordering in this module
   * then falls through to `id desc`, which is a random uuid. **The room would render
   * a reader's two sentences in either order, differently on each page load.** Found
   * by the keyset-pagination test, which is the only place five rows are ever written
   * in one transaction.
   */
  createdAt?: Date;
};

/**
 * The one writer. **IT IS ALSO WHERE THE PAIRING RULES LIVE** (`F1-D7`, `[R7]`).
 *
 * `(author = 'user') = (run_id IS NULL)` and `(run_id IS NULL) = (beat_index IS NULL)`
 * are the obvious CHECK constraints and both are refused, because `run_id` carries
 * `ON DELETE SET NULL`: the referential action fires DURING a delete, and a CHECK it
 * lands on the wrong side of makes the DELETE raise — the erasure `/privacy` clause 8
 * promises, failing for exactly the population most likely to have asked for it,
 * visible only in a cron log. That is A1's `23502` lesson generalised.
 *
 * So they are **insert-time rules a route can violate**, enforced here, rather than
 * delete-time landmines. `chat.integration.test.ts` proves both, and
 * `delete.integration.test.ts` proves the erasure they protect.
 */
export async function insertMessage(
  db: DbOrTx,
  input: InsertMessageInput,
): Promise<ChatMessageDto> {
  if (input.author === 'user') {
    if (input.runId != null || input.beatIndex != null) {
      throw new Error('a user message belongs to no run');
    }
  } else if (input.runId == null || input.beatIndex == null) {
    throw new Error('a reader message must name its run and its beat');
  }

  const [row] = await db
    .insert(chatMessages)
    .values({
      userId: input.userId,
      author: input.author,
      body: input.body,
      locale: input.locale,
      replyToMessageId: input.replyToMessageId ?? null,
      attachedReadingId: input.attachedReadingId ?? null,
      runId: input.runId ?? null,
      beatIndex: input.beatIndex ?? null,
      intent: input.intent ?? null,
      clientKey: input.clientKey ?? null,
      model: input.model ?? null,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    })
    .returning(DTO_COLUMNS);

  return toDto(row as DtoRow);
}

/**
 * One page of the room, **newest first**, keyset-paginated on `(created_at, id)` and
 * served index-ordered by `chat_messages_user_created_idx`.
 *
 * **KEYSET AND NOT OFFSET, BECAUSE THE LOG IS APPEND-ONLY.** A run inserting three
 * bubbles while the querent scrolls shifts every offset and duplicates a bubble on
 * screen. `before` and `beforeId` are both-or-neither for the same reason — a
 * timestamp alone is not unique enough to be a cursor when a run writes two rows in
 * one transaction.
 */
export async function listMessages(
  db: DbOrTx,
  userId: string,
  opts: { before?: Date | null; beforeId?: string | null; limit?: number } = {},
): Promise<{ messages: ChatMessageDto[]; hasMore: boolean }> {
  if (!UUID_RE.test(userId)) return { messages: [], hasMore: false };

  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 50);
  const cursor =
    opts.before && opts.beforeId
      ? or(
          lt(chatMessages.createdAt, opts.before),
          and(eq(chatMessages.createdAt, opts.before), lt(chatMessages.id, opts.beforeId)),
        )
      : undefined;

  const rows = await db
    .select(DTO_COLUMNS)
    .from(chatMessages)
    .where(and(eq(chatMessages.userId, userId), cursor))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    // One extra row is how `hasMore` is answered without a second `count(*)` over a
    // table that only ever grows.
    .limit(limit + 1);

  const page = rows.slice(0, limit) as DtoRow[];
  return { messages: await withReplyStubs(db, page), hasMore: rows.length > limit };
}

/**
 * Every bubble this run has already written, oldest first.
 *
 * **`C-R5`: EVERY BEAT SEES EVERY EARLIER BEAT OF ITS OWN RUN, AS ACTUAL PROSE.**
 * Adrian replying to Thessaly must have Thessaly's words, not the director's summary
 * of what she was going to say — which is why beats execute serially and never in
 * parallel, and why the beat sheet carries no `topic` field.
 *
 * Free: the rows are already being written, and `chat_messages_run_idx` is the FK's
 * own index doing double duty.
 */
export async function messagesForRun(db: DbOrTx, runId: string): Promise<ChatMessageDto[]> {
  if (!UUID_RE.test(runId)) return [];
  const rows = await db
    .select(DTO_COLUMNS)
    .from(chatMessages)
    .where(eq(chatMessages.runId, runId))
    .orderBy(chatMessages.beatIndex, chatMessages.createdAt, chatMessages.id);
  return (rows as DtoRow[]).map((r) => toDto(r));
}

/**
 * Has this querent already posted under this client key? F4's ONE permitted timeout
 * retry (`POST /api/locale`'s rule 3), answered before the insert.
 *
 * The unique index is what actually prevents the double post — this read is what turns
 * the second attempt into a 200 carrying the first attempt's row, rather than a 409 the
 * client would have to interpret.
 */
export async function messageByClientKey(
  db: DbOrTx,
  userId: string,
  clientKey: string,
): Promise<ChatMessageDto | null> {
  if (!UUID_RE.test(userId)) return null;
  const [row] = await db
    .select(DTO_COLUMNS)
    .from(chatMessages)
    .where(and(eq(chatMessages.userId, userId), eq(chatMessages.clientKey, clientKey)))
    .limit(1);
  return row ? toDto(row as DtoRow) : null;
}

// ---------------------------------------------------------------------------
// chat_runs — the state machine
// ---------------------------------------------------------------------------

/** The three statuses a run can still be advanced from. */
const LIVE_STATUSES = ['pending', 'planning', 'running'] as const;

export type InsertRunInput = {
  userId: string;
  trigger: RunTrigger;
  locale: Locale;
  triggerMessageId?: string | null;
  triggerReadingId?: string | null;
  /** F5's proactive de-duplication key. NULL for a run with a querent behind it. */
  materialKey?: string | null;
};

/**
 * Mint a run.
 *
 * **IT RETURNS `null` ON A `materialKey` COLLISION RATHER THAN THROWING**, which is
 * what makes F5's suppression rule (seam S5) a read of the return value rather than a
 * second query. The partial unique index is the arbiter — a check-then-insert is a race
 * two tabs and a cron will win.
 */
export async function insertRun(db: DbOrTx, input: InsertRunInput): Promise<ChatRun | null> {
  const [row] = await db
    .insert(chatRuns)
    .values({
      userId: input.userId,
      trigger: input.trigger,
      locale: input.locale,
      triggerMessageId: input.triggerMessageId ?? null,
      triggerReadingId: input.triggerReadingId ?? null,
      materialKey: input.materialKey ?? null,
      status: 'pending',
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

/** The oldest run this querent still has in flight, if any. Reads nothing else. */
export async function activeRunFor(db: DbOrTx, userId: string): Promise<ChatRun | null> {
  if (!UUID_RE.test(userId)) return null;
  const [row] = await db
    .select()
    .from(chatRuns)
    .where(and(eq(chatRuns.userId, userId), inArray(chatRuns.status, [...LIVE_STATUSES])))
    .orderBy(chatRuns.createdAt)
    .limit(1);
  return row ?? null;
}

export type ClaimedRun = {
  id: string;
  /** Carried back so the engine never has to trust the caller's copy: the claim
   *  statement selects BY `user_id`, so this is the row's own answer to whose room
   *  this is, and it is what `completeBeat` writes into every bubble. */
  userId: string;
  status: RunStatus;
  trigger: RunTrigger;
  triggerMessageId: string | null;
  triggerReadingId: string | null;
  locale: Locale;
  beats: BeatSheet | null;
  beatsDone: number;
};

/**
 * **TAKE THE LEASE IN THE SAME STATEMENT THAT READS THE RUN** (`[F1-2]`, `C-R3`).
 *
 * A read-then-update is a race with a window the width of a network round trip, and
 * this engine is reached concurrently by two tabs, an `after()` and a cron **by
 * design**.
 *
 * ── WHY BOTH PREDICATES, AND NEITHER IS REDUNDANT ─────────────────────────
 *
 *   `for update skip locked`  skips a row another transaction currently holds — the
 *                             two-tabs-in-the-same-millisecond case.
 *   `lease_until < now()`     excludes a row whose holder has already COMMITTED — the
 *                             two-tabs-a-second-apart case, which is far more common
 *                             and which `skip locked` alone does NOT cover, because a
 *                             lease held by a committed transaction is not a locked
 *                             row.
 *
 * Drop either and the second tab executes the same beat: **the same bubble in the room
 * twice**, which is the failure `C-R3` names as real and visible.
 *
 * `order by created_at asc` so a querent with a stale abandoned-looking run and a fresh
 * one drains the old first, **in the order the room happened**.
 *
 * **THE LEASE IS ~90 SECONDS AND RECLAIMABLE** (`[F1-3]`). Shorter than `maxDuration`
 * and a slow beat's own lease expires under it, letting a second executor in while the
 * first is still writing — which `[F1-1]`'s `beats_done` predicate would catch, but
 * only after paying for two model calls. Much longer, and a dead lambda locks the room
 * past a querent's patience.
 */
export async function claimRun(
  db: DbOrTx,
  userId: string,
  owner: string,
  leaseSeconds = 90,
): Promise<ClaimedRun | null> {
  if (!UUID_RE.test(userId)) return null;

  const rows = await db.execute<{
    id: string;
    user_id: string;
    status: RunStatus;
    trigger: RunTrigger;
    trigger_message_id: string | null;
    trigger_reading_id: string | null;
    locale: Locale;
    beats: BeatSheet | null;
    beats_done: number;
  }>(sql`
    update chat_runs
       set lease_until = now() + make_interval(secs => ${leaseSeconds}),
           lease_owner = ${owner},
           status      = case when status = 'pending' then 'planning' else status end,
           updated_at  = now()
     where id = (
             select id
               from chat_runs
              where user_id = ${userId}
                and status in ('pending', 'planning', 'running')
                and (lease_until is null or lease_until < now())
              order by created_at asc
              limit 1
              for update skip locked
           )
    returning id, user_id, status, trigger, trigger_message_id, trigger_reading_id,
              locale, beats, beats_done`);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    trigger: row.trigger,
    triggerMessageId: row.trigger_message_id,
    triggerReadingId: row.trigger_reading_id,
    locale: row.locale,
    beats: row.beats,
    beatsDone: row.beats_done,
  };
}

/**
 * Write the beat sheet and flip the status. **ONE UPDATE** (`[F1-4]`).
 *
 * So `status = 'planning' AND beats IS NOT NULL` is unrepresentable, and a reclaimed
 * `planning` run is provably one that has no sheet and must be planned again. Two
 * statements, and a reclaimed run with a sheet gets a **second** sheet — six bubbles
 * where the querent was promised three.
 *
 * **`and beats_done = 0` IS THE BELT TO THAT BRACE** (`[F1-5]`). A sheet overwritten
 * after a beat has executed makes `beats_done` index into a different array, so the run
 * resumes at the wrong beat and re-posts one it already posted. **The guard is in the
 * `WHERE`, not in TypeScript.**
 *
 * Zero rows means somebody else planned it. **That is not an error** — the route
 * answers `{ state: 'busy' }` and the client retries.
 *
 * An empty sheet flips straight to `done` (`C-R6`), in the same statement, so no turn
 * call is ever made for it.
 */
export async function writeBeatSheet(
  db: DbOrTx,
  args: {
    runId: string;
    owner: string;
    sheet: BeatSheet;
    planModel: string;
    planSource: 'model' | 'fallback';
    locale: Locale;
  },
): Promise<RunStatus | null> {
  const rows = await db.execute<{ status: RunStatus }>(sql`
    update chat_runs
       set beats       = ${JSON.stringify(args.sheet)}::jsonb,
           beats_done  = 0,
           plan_model  = ${args.planModel},
           plan_source = ${args.planSource},
           locale      = ${args.locale},
           status      = case when ${args.sheet.beats.length} = 0 then 'done' else 'running' end,
           lease_until = null,
           lease_owner = null,
           updated_at  = now()
     where id = ${args.runId}
       and lease_owner = ${args.owner}
       and beats_done = 0
       and beats is null
    returning status`);

  return rows[0]?.status ?? null;
}

/**
 * Store this beat's bubbles and advance `beats_done`. **ONE TRANSACTION** (`[F1-1]`).
 *
 * **THIS SINGLE PAIRING IS THE WHOLE OF `C-R3`.** If the UPDATE matches zero rows —
 * because another executor took the lease in between — the transaction rolls back and
 * **no message is stored**. Split them, or drop the `lease_owner` predicate, and the
 * failure is the one `C-R3` names as real and visible: **the same bubble in the room
 * twice**, from two tabs or from a tab racing the cron.
 *
 * **`and beats_done = $expected` IS THE SECOND HALF OF THE GUARANTEE.** The lease
 * predicate stops a second executor; this stops the *same* executor replaying a beat it
 * already committed after a retry at a higher layer.
 *
 * **`bodies` MAY HOLD TWO, AND `beats_done` STILL ADVANCES BY ONE** (`[R19]`). Miftah
 * granted F3's ask that one beat may produce two bubbles — *"a person who has more to
 * say sends a second message rather than a longer one"* — and it is built now because
 * the accounting cannot acquire it cheaply later.
 *
 * `chat.integration.test.ts` asserts the message COUNT and not the run's status, for
 * `tee.ts`'s reason: **a run at `beats_done = 1` with two messages is the exact bug
 * `C-R3` names, and only the count sees it.**
 */
export async function completeBeat(
  db: DbOrTx,
  args: {
    runId: string;
    userId: string;
    owner: string;
    expectedBeatsDone: number;
    totalBeats: number;
    beatIndex: number;
    author: ChatAuthor;
    locale: Locale;
    /** One or two (`[R19]`). Never empty. */
    bodies: string[];
    replyToMessageId?: string | null;
    intent?: ChatMessageDto['intent'];
    model: string;
  },
): Promise<{ messages: ChatMessageDto[]; beatsDone: number; status: RunStatus }> {
  if (args.bodies.length === 0) throw new Error('a beat with no bubble stores nothing');

  return db.transaction(async (tx) => {
    const messages: ChatMessageDto[] = [];
    /*
     * **STAMPED EXPLICITLY, ONE MILLISECOND APART, BECAUSE `now()` IS FROZEN INSIDE A
     * TRANSACTION.** See `InsertMessageInput.createdAt`: without this the room renders
     * a reader's two sentences in either order, differently on each page load, and
     * nothing anywhere looks broken. A millisecond is also honest — the second bubble
     * genuinely is sent after the first, which is the whole point of `[R19]`.
     */
    const base = Date.now();
    for (const [i, body] of args.bodies.entries()) {
      messages.push(
        await insertMessage(tx, {
          userId: args.userId,
          author: args.author,
          body,
          locale: args.locale,
          // Only the FIRST bubble of a beat quotes: two bubbles quoting one message
          // renders the same stub twice, which reads as the reader repeating himself.
          replyToMessageId: i === 0 ? (args.replyToMessageId ?? null) : null,
          runId: args.runId,
          beatIndex: args.beatIndex,
          intent: args.intent,
          model: args.model,
          createdAt: new Date(base + i),
        }),
      );
    }

    const rows = await tx.execute<{ beats_done: number; status: RunStatus }>(sql`
      update chat_runs
         set beats_done  = beats_done + 1,
             status      = case when beats_done + 1 >= ${args.totalBeats}
                                then 'done' else 'running' end,
             lease_until = null,
             lease_owner = null,
             updated_at  = now()
       where id = ${args.runId}
         and lease_owner = ${args.owner}
         and beats_done = ${args.expectedBeatsDone}
      returning beats_done, status`);

    /*
     * **THROW, AND LET THE TRANSACTION ROLL BACK, DISCARDING THE INSERTS.** The
     * driver's empty `returning` is the only signal that another executor got here
     * first, and a caller that logged and continued would have stored the bubble
     * anyway. The route answers `{ state: 'busy' }`.
     */
    const row = rows[0];
    if (!row) throw new LeaseLostError(args.runId);

    /*
     * The thread's denormalised cursor, in the SAME transaction as the message that
     * moved it — `readings.shared_at`'s rule. F5's eligibility predicate reads this
     * instead of joining, so a cursor that could lag its own message would make a
     * proactive run fire against a room that had just been spoken in.
     */
    await upsertThread(tx, args.userId, { lastReaderMessageAt: new Date() });

    return { messages, beatsDone: row.beats_done, status: row.status };
  });
}

/**
 * Another executor holds the lease, or this one is replaying a beat it already
 * committed. **NOT AN ERROR CONDITION THE QUERENT SEES** — the route answers
 * `{ state: 'busy' }` and the client retries after the declared delay.
 *
 * Its own class so the route can tell it from a driver failure **without reading an
 * error message**, which is `[F1-23]`'s rule wearing a different hat: a postgres error
 * quotes its bound parameters, and one of them is a person's sentence.
 */
export class LeaseLostError extends Error {
  constructor(readonly runId: string) {
    super('chat run lease lost');
    this.name = 'LeaseLostError';
  }
}

/**
 * Release the lease without advancing anything — a shed, a busy, a failed plan.
 *
 * **`[F1-6]`: A SHED MODEL CALL LEAVES THE RUN EXACTLY AS IT WAS.** No `beats_done`
 * increment, no `error_kind`, no `abandoned`, no 500, no bubble. The querent's next
 * visit delivers the rest, and **that is the single best argument for the run engine.**
 */
export async function releaseLease(db: DbOrTx, runId: string, owner: string): Promise<void> {
  await db
    .update(chatRuns)
    .set({ leaseUntil: null, leaseOwner: null, updatedAt: new Date() })
    .where(and(eq(chatRuns.id, runId), eq(chatRuns.leaseOwner, owner)));
}

/**
 * End a run that produced nothing usable.
 *
 * **`abandoned` AND A ZERO-BEAT `done` ARE INDISTINGUISHABLE FROM THE ROOM, AND THAT IS
 * DELIBERATE** (`C-R7`). They are distinguishable HERE, which is the whole reason
 * `chat.run_finished` exists as an event rather than being folded into
 * `chat.run_planned`.
 *
 * `errorKind` is **a short classifier, never a message**: unbounded cardinality makes
 * every `group by` useless, and a message can carry a prompt fragment or a key. And it
 * must be **snapshotted before any `await`** — `tee.ts`'s trap, where `finish()` read
 * its fields after `await source.usage` and every abandoned reading was recorded as
 * failing for an unknown reason.
 */
export async function finishRun(
  db: DbOrTx,
  runId: string,
  status: 'done' | 'abandoned',
  errorKind: string | null = null,
): Promise<void> {
  await db
    .update(chatRuns)
    .set({ status, errorKind, leaseUntil: null, leaseOwner: null, updatedAt: new Date() })
    .where(eq(chatRuns.id, runId));
}

/**
 * F5's suppression read (seam S5): has a run already been minted for this reading?
 *
 * **IF THE QUERENT ATTACHES READING X THEMSELVES, THE `reading_completed` RUN FOR X
 * MUST NOT ALSO FIRE** — two runs about one reading, one of which nobody asked for.
 */
export async function runExistsForReading(
  db: DbOrTx,
  userId: string,
  readingId: string,
): Promise<boolean> {
  if (!UUID_RE.test(userId) || !UUID_RE.test(readingId)) return false;
  const [row] = await db
    .select({ id: chatRuns.id })
    .from(chatRuns)
    .where(and(eq(chatRuns.userId, userId), eq(chatRuns.triggerReadingId, readingId)))
    .limit(1);
  return !!row;
}

/**
 * The last message in the room, whoever wrote it. F5 reads it for silence
 * measurement; `/api/chat/state` reports it so F4 can decide whether to scroll.
 */
export async function lastMessageAt(db: DbOrTx, userId: string): Promise<Date | null> {
  if (!UUID_RE.test(userId)) return null;
  const [row] = await db
    .select({ at: chatMessages.createdAt })
    .from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  return row?.at ?? null;
}

/**
 * A reader question the querent never answered — F5's `unanswered` material.
 *
 * **IT READS THE DECLARED `intent`, NOT A `?`** (reconciliation §2.1). Inferring a
 * question from punctuation is `CLAUDE.md`'s bare-`lagi` trap in a new place: a pattern
 * that fires on most sentences of casual writing and reports a rate that is entirely
 * noise — and here the noise would decide whether somebody gets messaged.
 */
export async function lastUnansweredAsk(
  db: DbOrTx,
  userId: string,
): Promise<ChatMessageDto | null> {
  if (!UUID_RE.test(userId)) return null;

  const [ask] = await db
    .select(DTO_COLUMNS)
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.userId, userId),
        eq(chatMessages.intent, 'ask'),
        isNotNull(chatMessages.runId),
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  if (!ask) return null;

  const [answered] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.userId, userId),
        eq(chatMessages.author, 'user'),
        gt(chatMessages.createdAt, (ask as DtoRow).createdAt),
      ),
    )
    .limit(1);

  return answered ? null : toDto(ask as DtoRow);
}

/**
 * The newest `limit` messages, oldest first, for R2's profile-memory extractor.
 *
 * **NOT `listMessages`, AND THE TWO MUST NOT BE MERGED.** That one is the ROOM's
 * pagination: it caps at 50, hydrates reply stubs with a second query, and returns a
 * `ChatMessageDto` because a client renders it. This is an EXTRACTION read -- three
 * columns, no stubs, no attachment hydration, and a window an order of magnitude
 * wider, because `PROFILE_MEMORY_WINDOW` is bounded by nothing but the model's
 * context where `CHAT_CONTEXT_MESSAGES` is bounded by `memory.ts`'s dilution
 * argument. Merging them would put one of those two bounds on the other.
 *
 * **`body` IS TEXT A PERSON TYPED** (`C-D20`). Nothing that catches an error around
 * this call may log the driver error -- a postgres error quotes its bound parameters.
 *
 * Oldest-first is the caller's contract: the extractor reads a conversation forwards.
 * The query is `desc` because that is the index's direction and where the newest rows
 * are; the reverse is one pass over at most a few hundred rows.
 *
 * **THE NEWEST ROW's `id` IS WHAT `profileMemoryInputHash` DIGESTS**, so the tie-break
 * on `id` is load-bearing rather than tidy: two messages sharing a `created_at` to the
 * microsecond would otherwise let the "newest" alternate between two values and the
 * hash oscillate, extracting on every run for ever.
 */
export async function messagesForExtraction(
  db: DbOrTx,
  userId: string,
  limit: number,
): Promise<Array<{ id: string; author: ChatAuthor; body: string }>> {
  if (!UUID_RE.test(userId)) return [];

  const capped = Math.min(Math.max(Math.trunc(limit) || 0, 1), 500);

  const rows = await db
    .select({
      id: chatMessages.id,
      author: chatMessages.author,
      body: chatMessages.body,
    })
    .from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(capped);

  return rows.reverse();
}
