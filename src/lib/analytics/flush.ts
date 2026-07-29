/**
 * The `after()`-side writer. Everything in this file runs AFTER the response
 * has been flushed, and nothing in it may fail a request.
 *
 * TWO FAILURE POLICIES, ON PURPOSE (roadmap §6, plan A10). Events fail
 * silently and log: a dropped event is invisible. The `readings` write gets a
 * bounded retry: a missing row breaks a user-facing memory feature in W5, not
 * a dashboard.
 *
 * WHY `@/lib/db/client` IS IMPORTED DYNAMICALLY AND NOT AT THE TOP. That module
 * starts with `import 'server-only'`, which throws outside a Next server
 * bundle -- CLAUDE.md names it as a trap. A static import here would make this
 * file, and `track.ts` above it, impossible to load in Vitest, so the retry
 * classifier and the privacy-critical `sanitizeProps` would have no unit tests
 * at all. Deferring it costs one already-resolved module lookup on the write
 * path and buys the whole test story; the integration tests pass the harness's
 * rolled-back transaction in instead, which is also why every writer here takes
 * an optional handle.
 */
import { events } from '@/lib/db/schema';
import { insertCalls } from '@/lib/db/queries/admin/calls';
import { insertReading, type ReadingCardInput } from '@/lib/db/queries/history';
import { touchLastSeen as touchLastSeenQuery } from '@/lib/db/queries/profile';
import type { DbOrTx } from '@/lib/db/types';
import type { NewReading } from '@/lib/db/schema';
import type { LlmCallRecord } from '@/lib/llm/ledger';
import type { EventPropValue, PendingEvent } from './events';
import type { AnalyticsContext } from './track';

/** Mirrors `readings`, camelCase. Not redefined here: one shape, one owner. */
export type ReadingRow = NewReading;
/** `readingId`, `userId` and `localDate` are copied from the parent by W1's
 *  `insertReading`, which is what stops the denormalization drifting. */
export type ReadingCardRow = ReadingCardInput;

function enabled(): boolean {
  return process.env.ANALYTICS_ENABLED !== '0';
}

/**
 * Ids, counts, SQLSTATEs and the error's CLASS. Never its message.
 *
 * This is a privacy obligation (plan §11), not a style preference, and it is
 * sharper than it first looks: a driver error routinely quotes the failing
 * statement and its bound parameters, and `readings.question` is one of those
 * parameters. Logging `err` would put the querent's typed question into
 * Vercel's log, which has a different audience and a different retention story
 * from the column it was meant to live in.
 *
 * In development the whole error is printed as well, because there is nobody to
 * leak it to and a stack trace is the difference between a five-minute fix and
 * an hour. `JSON.stringify` rather than the raw object because Next's dev
 * logger renders a bare object argument as `{}` -- which is how this was found.
 */
function logFailure(where: string, err: unknown, extra?: object): void {
  try {
    const kind = err instanceof Error ? err.name : typeof err;
    const detail = JSON.stringify({ ...extra, sqlstate: sqlstate(err), kind });
    if (process.env.NODE_ENV === 'production') {
      console.error(`[analytics] ${where} failed`, detail);
    } else {
      console.error(`[analytics] ${where} failed`, detail, err);
    }
  } catch {
    /* a logger that throws must not take the invocation with it */
  }
}

async function handle(injected?: DbOrTx): Promise<DbOrTx> {
  if (injected) return injected;
  const { db } = await import('@/lib/db/client');
  return db;
}

// ---------------------------------------------------------------------------
// sanitizeProps -- THE PRIVACY GUARANTEE, IN CODE
// ---------------------------------------------------------------------------

const MAX_PROP_KEYS = 24;
const MAX_STRING_CHARS = 120;
const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;

/**
 * `__proto__` already fails KEY_RE on its leading underscore. `constructor` and
 * `prototype` do NOT -- they are ordinary lowercase words -- and assigning them
 * onto the accumulator shadows real object properties. Named explicitly rather
 * than folded into the pattern, because a future reader tightening the regex
 * should not have to rediscover which three words matter.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Scalars only, short, and lower_snake keys.
 *
 * `events` rows SURVIVE ACCOUNT ERASURE with `user_id` nulled (reconciliation
 * R9), and the privacy policy says so in those words: *"We keep anonymous usage
 * counts -- which reader, which service, when -- after your account is deleted.
 * They contain no text you wrote."* That claim is only honest because of this
 * function, so it runs at the LAST POSSIBLE MOMENT, on the way to the database,
 * where it also covers events that arrived from the collector route rather than
 * from a typed `track()` call.
 *
 * DO NOT RELAX IT FOR CONVENIENCE. If an event needs text, the text belongs in
 * a real column with a real retention story.
 */
export function sanitizeProps(raw: unknown): Record<string, EventPropValue> {
  const out: Record<string, EventPropValue> = {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out;

  let kept = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (kept >= MAX_PROP_KEYS) break;
    // Rejects `__proto__` and `camelCase`: the pattern requires a lowercase
    // letter first and allows nothing but [a-z0-9_] after it.
    if (!KEY_RE.test(key) || FORBIDDEN_KEYS.has(key)) continue;

    if (typeof value === 'string') {
      out[key] = value.slice(0, MAX_STRING_CHARS);
    } else if (typeof value === 'number') {
      // NaN and Infinity are not JSON. Postgres would take `null` for them via
      // the driver's serializer or reject the statement; neither is a number.
      if (!Number.isFinite(value)) continue;
      out[key] = value;
    } else if (typeof value === 'boolean' || value === null) {
      out[key] = value;
    } else {
      // Objects, arrays, functions, symbols, bigints, undefined: dropped. An
      // object is where free text hides.
      continue;
    }
    kept += 1;
  }

  return out;
}

// ---------------------------------------------------------------------------
// The retry classifier
// ---------------------------------------------------------------------------

function sqlstate(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** postgres.js' own connection-level codes, which are not SQLSTATEs. */
const DRIVER_TRANSIENT = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ECONNREFUSED',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  'CONNECT_TIMEOUT',
]);

/**
 * Retry only what can succeed next time.
 *
 * Keys off the SQLSTATE, never the message. Retrying a `not null` violation is
 * pure waste -- it will fail identically forever -- and it costs three seconds
 * of a paid invocation while logging the real error twice over.
 *
 *   08*            connection exception            retry
 *   40001, 40P01   serialization failure, deadlock retry
 *   53*            insufficient resources          retry
 *   57P01, 57P03   admin shutdown, cannot connect  retry
 *   23*            integrity violation             NO -- deterministic
 *   22*            data exception                  NO -- the row is malformed
 *   42*            syntax / undefined column       NO -- a migration is missing
 *   anything else  unknown                         NO -- do not spend the
 *                                                  invocation guessing
 */
export function isTransient(err: unknown): boolean {
  const code = sqlstate(err);
  if (!code) return false;
  if (DRIVER_TRANSIENT.has(code)) return true;
  if (code.startsWith('08') || code.startsWith('53')) return true;
  if (code === '40001' || code === '40P01') return true;
  if (code === '57P01' || code === '57P03') return true;
  return false;
}

const DELAYS = [0, 250, 1000]; // ms, plus +/- 50ms of jitter

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type RetryOpts = {
  budgetMs?: number;
  /** For the log line. Never user text. */
  label?: string;
  context?: object;
};

/**
 * Three attempts, 0/250/1000ms plus jitter, inside a wall-clock budget.
 *
 * Returns `undefined` rather than throwing when it gives up: the caller is an
 * `after()` callback with nothing useful to do with an error, and an unhandled
 * rejection there is a process warning in a serverless invocation nobody is
 * watching.
 *
 * `after()` is not infinite and holding an invocation open costs money, hence
 * the budget as well as the attempt count.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOpts,
): Promise<T | undefined> {
  const label = opts?.label ?? 'write';
  const budgetMs = Number(opts?.budgetMs ?? process.env.ANALYTICS_RETRY_BUDGET_MS ?? 5000);
  const deadline = Date.now() + budgetMs;

  for (let attempt = 0; attempt < DELAYS.length; attempt++) {
    if (attempt > 0) {
      const wait = DELAYS[attempt] + Math.floor(Math.random() * 100) - 50;
      // Do not start what cannot be finished: a sleep past the deadline just
      // burns the invocation and then fails anyway.
      if (Date.now() + wait > deadline) break;
      await sleep(Math.max(0, wait));
    }

    try {
      return await fn();
    } catch (err) {
      if (!isTransient(err)) {
        logFailure(`${label}.permanent`, err, { ...opts?.context, attempt });
        return undefined;
      }
      if (attempt === DELAYS.length - 1) {
        logFailure(`${label}.exhausted`, err, { ...opts?.context, attempt });
      }
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// The two writers
// ---------------------------------------------------------------------------

/**
 * One `insert ... values (...), (...), ...` for the whole buffer.
 *
 * NOT RETRIED (plan A10). Wrapped, logs, returns.
 */
export async function flushEvents(
  ctx: AnalyticsContext,
  rows: PendingEvent[],
  injected?: DbOrTx,
): Promise<void> {
  if (!enabled() || rows.length === 0) return;

  const db = await handle(injected);
  await db.insert(events).values(
    rows.map((row) => ({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      name: row.name,
      props: sanitizeProps(row.props),
      locale: ctx.locale,
      localDate: ctx.localDate,
    })),
  );
}

/**
 * A2's ledger rows, in one multi-row insert per request.
 *
 * **NOT RETRIED, and the failure policy is `flushEvents`'s rather than
 * `persistReading`'s.** This file's two policies exist because the two writes cost
 * different things: a missing `readings` row breaks a user-facing memory feature, and
 * a missing ledger row breaks a dashboard. A ledger that can fail a reading is worse
 * than no ledger, and the acceptance test is W4's verbatim -- stop the database and
 * take a reading; nothing but `[analytics]` lines.
 *
 * `user_id`, `locale` and `local_date` come off `ctx` at THIS moment and not from the
 * call site (A2-D3), which is what makes A-D5's *"no caller edits beyond passing
 * `op`"* literally true. It also means `local_date` is the querent's own calendar day,
 * sent by the client -- **never recomputed from `created_at`**, which is a day out for
 * anyone in Jakarta between midnight and 07:00.
 *
 * **`sanitizeProps()` DOES NOT AND MUST NOT REACH THIS TABLE.** It exists because
 * `events.props` is free-shaped jsonb and *"an object is where free text hides"*. Every
 * column here is a real typed column and none of them is prose: nine scalars, a model
 * name and two ids. Running the sanitizer over them would truncate a model string at
 * 120 characters for no reason and would suggest this table holds something it does
 * not. **The guarantee here is the schema, not a function.**
 */
export async function flushCalls(
  ctx: AnalyticsContext,
  rows: LlmCallRecord[],
  injected?: DbOrTx,
): Promise<void> {
  if (!enabled() || rows.length === 0) return;

  const db = await handle(injected);
  await insertCalls(
    db,
    rows.map((row) => ({
      userId: ctx.userId,
      readingId: row.readingId ?? null,
      op: row.op,
      model: row.model,
      callClass: row.callClass,
      streamed: row.streamed,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalMs: row.totalMs,
      status: row.status,
      errorKind: row.errorKind,
      locale: ctx.locale,
      localDate: ctx.localDate,
    })),
  );
}

/**
 * The reading and its cards, in ONE transaction, with a bounded retry.
 *
 * The transaction is W1's `insertReading`: a `readings` row with no
 * `reading_cards` is not a partial success, it is a silent hole in the
 * frequency feature that every query still answers plausibly.
 *
 * IDEMPOTENT ON THE ID. The retry exists for the case where the commit
 * succeeded and the acknowledgement was lost to a connection reset, and a
 * second attempt would otherwise duplicate the whole draw. A duplicate primary
 * key comes back as SQLSTATE 23505, which `isTransient` already refuses to
 * retry -- this turns that refusal from "logged as a permanent failure" into
 * "already written, nothing to do", which is what it actually is.
 *
 * `status: 'blocked'` passes an EMPTY cards array (plan A17): a refused
 * question is a reading attempt and belongs in history, but writing its cards
 * would mean the frequency query needs a filter, and it is a single-table scan
 * precisely because it does not.
 */
export async function persistReading(
  row: ReadingRow,
  cards: ReadingCardRow[],
  injected?: DbOrTx,
): Promise<void> {
  if (!enabled()) return;

  await withRetry(
    async () => {
      const db = await handle(injected);
      try {
        await insertReading(db, row, cards);
      } catch (err) {
        if (sqlstate(err) === '23505') return; // already written by a lost-ack attempt
        throw err;
      }
    },
    { label: 'readings', context: { readingId: row.id, userId: row.userId } },
  );
}

/**
 * Fire and log. Never retried: `last_seen_at` is a nicety, and it is written
 * again by the user's next request anyway.
 */
export async function touchLastSeen(userId: string, injected?: DbOrTx): Promise<void> {
  if (!enabled()) return;
  try {
    await touchLastSeenQuery(await handle(injected), userId);
  } catch (err) {
    logFailure('last_seen', err, { userId });
  }
}
