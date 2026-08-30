/**
 * THE ENGINE. One entry point, one thing per call, and a lease.
 *
 * ── WHY A RUN ENGINE AND NOT A REQUEST THAT STREAMS THE EXCHANGE (`C-D1`) ──
 *
 * A three-beat run is 4 model calls and 15–30 seconds. Vercel's function ceiling is
 * 60s and the reading route already spends `maxDuration = 60`. A run that overran
 * would lose messages the querent had already seen appear. **One beat per request**
 * keeps every request short, makes the run resumable, and — this is the load-bearing
 * part — **makes an abandoned run and a proactive run the same thing** (`C-D7`).
 *
 * So: the querent closing the tab mid-run does not cancel it; the run stays `running`
 * with beats left and the next open delivers the rest. A proactive run is simply a run
 * nobody posted a message for. **There is one engine and one delivery path, and F5
 * builds triggers rather than a second pipeline.** A design in which proactive
 * messages have their own route, their own table or their own renderer is wrong.
 *
 * ── THE STATE MACHINE ─────────────────────────────────────────────────────
 *
 * | status              | event                       | → status            | reply     |
 * |---------------------|-----------------------------|---------------------|-----------|
 * | —                   | mint                        | `pending`           | —         |
 * | `pending`           | advance, lease taken        | `planning`          | —         |
 * | `planning`          | plan ≥ 1 beat               | `running`           | `planned` |
 * | `planning`          | plan 0 beats (`C-R6`)       | `done`              | `silent`  |
 * | `planning`          | call failed / plan refused  | `running`           | `planned` |
 * | `planning`/`running`| shed or `CHAT_ENABLED=0`    | unchanged           | `shed`    |
 * | `running`           | beat valid                  | `running` \| `done` | `spoke`   |
 * | `running`           | beat invalid twice          | `running` \| `done` | `skipped` |
 * | `running`           | every beat skipped          | `abandoned`         | `silent`  |
 * | `planning`/`running`| lease held by someone else  | unchanged           | `busy`    |
 * | `done`/`abandoned`  | advance                     | unchanged           | `idle`    |
 * | —                   | advance, no active run      | —                   | `idle`    |
 *
 * **`abandoned` AND `silent` ARE INDISTINGUISHABLE FROM THE ROOM, DELIBERATELY**
 * (`C-R7`). They are distinguishable in `chat_runs.status` and in
 * `chat.run_finished.status`, which is the whole reason that event is not folded into
 * `chat.run_planned`.
 *
 * ── THE DECISION IS A PURE FUNCTION AND THE EFFECTS ARE NOT ───────────────
 *
 * This module is `server-only` by way of its imports and **cannot be imported under
 * Vitest at all** — it reaches `@/lib/db/client`, which dies on
 * `Missing required environment variable: DATABASE_URL` before a single assertion
 * runs. So the state machine's decision lives in `./machine.ts`, pure, and
 * `run.test.ts` drives it with a table in `gate.decide()`'s idiom. That is the same
 * separation `swipeDeck.ts`, `choice.ts` and `rollup.ts` make, and the reason is always
 * the same: **the pure part is what tests can reach.**
 */
import 'server-only';

import { after } from 'next/server';
import { randomUUID } from 'node:crypto';

import type { Locale } from '@/data/types';
import { track } from '@/lib/analytics/track';
import { db } from '@/lib/db/client';
import {
  activeRunFor,
  claimRun,
  completeBeat,
  finishRun,
  insertRun,
  LeaseLostError,
  messagesForRun,
  releaseLease,
  runExistsForReading,
  threadOffsetMinutes,
  writeBeatSheet,
  type ClaimedRun,
} from '@/lib/db/queries/chat';
import type { DbOrTx } from '@/lib/db/types';
import { chatEnabled, chatProactiveEnabled } from '@/lib/llm/flags';
import { resolveChatClock } from './clock';
import { plan } from './direct/plan';
import { nextAction } from './machine';
import { logChatFailure } from './log';
import { pace } from './voices/pace';
import { speak } from './voices/turn';
import type {
  AdvanceReply,
  Beat,
  BeatSheet,
  ChatClock,
  ChatMessageDto,
  RunTrigger,
} from './types';

/** `[F1-3]`. Long enough that a slow beat does not lose its own lease under
 *  `maxDuration = 60`; short enough that a dead lambda does not lock the room past a
 *  querent's patience. */
const LEASE_SECONDS = 90;

/**
 * What the client is told to expect next: who speaks, and for how long the indicator
 * runs. `null` when the sheet is exhausted.
 *
 * **SEAM S3, `[R11]`: F3 COMPUTES THE NUMBER, F1 RETURNS IT, F4 HONOURS IT.** Three
 * files, one number. `C-R4`: *a constant is a metronome and a metronome is the thing
 * that reads as a bot* — so `pace()` is a function of the previous bubble's length and
 * the next reader's temperament, and F4 honours it under `prefers-reduced-motion` too,
 * where the indicator does not animate **but the delay still applies**.
 */
function nextOf(sheet: BeatSheet, done: number, previousChars: number | null) {
  const beat = sheet.beats[done];
  if (!beat) return null;
  return { reader: beat.reader, delayMs: pace({ next: beat, previousChars }) };
}

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

export type MintArgs = {
  userId: string;
  trigger: RunTrigger;
  locale: Locale;
  triggerMessageId?: string | null;
  triggerReadingId?: string | null;
  /** F5's proactive de-duplication key. Omitted for a run with a querent behind it. */
  materialKey?: string | null;
};

/**
 * Mint a run, or answer `null`.
 *
 * **AN OPTIONAL HANDLE AS THE LAST ARGUMENT, NOT THE FIRST**, because this is a
 * WRITER like `persistReading` and `flushEvents` rather than a query module — and the
 * optional handle is how the message route passes its own transaction in, so that a
 * stored message with no run (a room that silently never answers) is unreachable.
 *
 * **IT RETURNS `null` RATHER THAN THROWING, ON FOUR ORDINARY OUTCOMES**, which is what
 * makes F5's suppression rule (seam S5) a read of the return value rather than a
 * second query:
 *
 *   - `CHAT_ENABLED=0` — nothing is written, and `[F1-20]` makes that self-healing.
 *   - `CHAT_PROACTIVE_ENABLED=0` and the trigger is not `'user_message'`.
 *   - a live run already exists — one room, one conversation at a time.
 *   - the `material_key` collided, which the partial unique index arbitrates rather
 *     than a check-then-insert race two tabs and a cron would win.
 */
export async function mintRun(args: MintArgs, handle?: DbOrTx): Promise<{ runId: string } | null> {
  if (!chatEnabled()) return null;

  /*
   * **THE PROACTIVE FLAG GATES A MINT RATHER THAN A CALL**, which is why
   * `flagCoverage.test.ts` grew a `GATES` table (`[R13]`): there is no
   * `getProvider()` line behind it to name. A posted message still gets answered.
   */
  if (args.trigger !== 'user_message' && !chatProactiveEnabled()) return null;

  const h = handle ?? db;

  try {
    /*
     * **ONE ROOM, ONE RUN AT A TIME.** Two live runs would interleave beats from two
     * beat sheets, and `C-R5`'s *"every beat sees every earlier beat of its own run"*
     * would become "every beat sees half of two conversations". `claimRun` drains
     * oldest-first, so a second trigger arriving mid-run is dropped rather than
     * queued — deliberately: a queue would deliver a reply to a message the room has
     * moved on from.
     */
    if (await activeRunFor(h, args.userId)) return null;

    if (args.triggerReadingId && (await runExistsForReading(h, args.userId, args.triggerReadingId))) {
      // Seam S5, F5's suppression rule: if the querent attached reading X themselves,
      // the `reading_completed` run for X must not also fire.
      return null;
    }

    const row = await insertRun(h, {
      userId: args.userId,
      trigger: args.trigger,
      locale: args.locale,
      triggerMessageId: args.triggerMessageId ?? null,
      triggerReadingId: args.triggerReadingId ?? null,
      materialKey: args.materialKey ?? null,
    });
    return row ? { runId: row.id } : null;
  } catch (err) {
    /*
     * A mint that fails is a room that does not answer this once. It is not an error
     * the querent should see — their own message is already stored, and `C-R6` makes
     * an unanswered message an ordinary outcome the room is designed to produce.
     */
    logChatFailure('mint', err, { user: args.userId, trigger: args.trigger });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Advancing
// ---------------------------------------------------------------------------

/**
 * **THE ONE ENGINE ENTRY POINT.** Plan, or execute exactly one beat. Never both, never
 * two beats (`C-R2`).
 *
 * The reply tells the client what is about to happen next — which reader, and for how
 * long the typing indicator should run — so the client can render the pause **before**
 * it asks for the bubble.
 *
 * **IT NEVER THROWS.** Every failure is an arm of `AdvanceReply`, because the client's
 * only reasonable response to a 500 is a retry, and a retry is right for exactly one
 * of these outcomes (`busy`) and wrong for the rest. `POST /api/locale`'s third rule
 * in a new place: *a timeout is the one outcome that means UNKNOWN, so it is the only
 * one retried.*
 */
export async function advance(args: { userId: string; locale: Locale }): Promise<AdvanceReply> {
  /*
   * **AN OPAQUE PER-REQUEST TOKEN, NEVER A SESSION ID** (§3.3). A session id in a row
   * F7 may render is an identifier with no reason to be there, and it would outlive
   * the request that made it.
   */
  const owner = randomUUID();

  let run: ClaimedRun | null;
  try {
    run = await claimRun(db, args.userId, owner, LEASE_SECONDS);
  } catch (err) {
    logChatFailure('advance.claim', err, { user: args.userId });
    return { state: 'busy', runId: null, done: false };
  }

  /*
   * **NO RUN, OR SOMEBODY ELSE HOLDS THE LEASE.** These are one answer from the
   * client's point of view and two from the engine's, and the difference does not
   * survive the claim statement: it selects by `user_id` over the three live statuses,
   * so a null means either. `idle` stops the loop, which is right for both — if a
   * beat is being executed elsewhere, the message it produces arrives on the next
   * `state` poll, and the alternative is two tabs racing each other's indicators.
   */
  if (!run) return { state: 'idle', runId: null, done: true };

  /*
   * **THE CLOCK, READ FROM THE THREAD RATHER THAN FROM THIS REQUEST'S HEADERS** (R1).
   *
   * One indexed primary-key read per advance, against a request that is about to
   * spend two to five seconds in a model call — so the cost is noise, and what it
   * buys is that **the cron, the idle tick and the browser all get their clock the
   * same way.** `/api/cron/nudge` has no client and therefore no header; a design
   * in which the browser path reads a header and the cron path reads a column is
   * two mechanisms, and the second one is the one nobody tests.
   *
   * The column is kept fresh by the two routes that DO have a client:
   * `POST /api/chat/message` writes it inside the transaction it already opens, and
   * `GET /api/chat/state` writes it in `after()` when it has changed.
   *
   * **SWALLOWED, LIKE EVERY OTHER READ ON THIS PATH.** A failed clock read is a
   * timeless room, not a failed beat — and `[F1-23]`: never the error object, this
   * statement binds `users.id`.
   */
  const offsetMinutes = await threadOffsetMinutes(db, args.userId).catch((err) => {
    logChatFailure('advance.clock', err, { user: args.userId });
    return null;
  });
  const clock = resolveChatClock({ offsetMinutes });

  const action = nextAction(run);

  try {
    switch (action.kind) {
      case 'idle':
        await releaseLease(db, run.id, owner);
        return { state: 'idle', runId: null, done: true };

      case 'finish':
        return await finish(run, owner, 'done');

      case 'plan':
        return await doPlan(run, owner, args.locale, clock);

      case 'execute':
        return await doBeat(run, owner, action.beat, action.index, action.total, clock);
    }
  } catch (err) {
    /*
     * **A LOST LEASE IS `busy`, NOT AN ERROR**, and it is told apart from a driver
     * failure by its TYPE rather than by a message — `[F1-23]`'s rule wearing a
     * different hat, since a postgres error message quotes its bound parameters and
     * one of them is a person's sentence.
     */
    if (err instanceof LeaseLostError) return { state: 'busy', runId: run.id, done: false };

    logChatFailure('advance', err, { run: run.id, user: args.userId });
    /*
     * The lease is released on a best-effort basis. If THAT fails too the lease simply
     * expires in ninety seconds, which is the property `[F1-3]` exists to provide.
     */
    await releaseLease(db, run.id, owner).catch(() => {});
    return { state: 'busy', runId: run.id, done: false };
  }
}

/** The director. One `chat_plan` call, and one UPDATE that writes the sheet. */
async function doPlan(
  run: ClaimedRun,
  owner: string,
  fallbackLocale: Locale,
  clock: ChatClock,
): Promise<AdvanceReply> {
  const startedAt = Date.now();

  const outcome = await plan({
    runId: run.id,
    /* The ROW's answer to whose room this is, never the caller's copy. The claim
     * statement selects by `user_id`, so these cannot disagree — and if they ever
     * could, this is the one that decides whose six answers enter a prompt. */
    userId: run.userId,
    trigger: run.trigger,
    triggerMessageId: run.triggerMessageId,
    triggerReadingId: run.triggerReadingId,
    fallbackLocale: run.locale ?? fallbackLocale,
    /* Resolved once in `advance()`, so every beat of a run reads the same clock —
     * a run is serial and one beat must not be four seconds "later" than the plan
     * that ordered it. */
    clock,
  });

  if (outcome.kind === 'shed') {
    /*
     * **`[F1-6]`: A SHED LEAVES THE RUN EXACTLY AS IT WAS.** No `beats_done`
     * increment, no `error_kind`, no `abandoned`, no 500, no bubble. The querent's
     * next visit delivers the rest, and **that is the single best argument for the run
     * engine.** F4 must not retry this arm — retrying a soft-ceiling refusal is a
     * client hammering a budget that is already out.
     */
    await releaseLease(db, run.id, owner);
    return { state: 'shed', runId: run.id, done: false };
  }

  const result = outcome.result;
  const sheet: BeatSheet = { v: 1, beats: result.beats };

  const status = await writeBeatSheet(db, {
    runId: run.id,
    owner,
    sheet,
    planModel: result.model,
    planSource: result.outcome === 'fallback' ? 'fallback' : 'model',
    locale: result.locale,
  });

  after(() =>
    track('chat.run_planned', {
      trigger: run.trigger,
      locale: result.locale,
      beats: result.beats.length,
      /* Counted rather than listed: **`sanitizeProps()` DROPS NON-SCALARS**, so an
       * array prop arrives as an ABSENT KEY with nothing logged and nothing thrown —
       * W5's `recalled_ids` and V8's `facets` were both flattened for this. */
      cast: new Set(result.beats.map((b) => b.reader)).size,
      asks: result.beats.filter((b) => b.intent === 'ask').length,
      replies_to_old: result.beats.filter((b) => b.replyTo !== null).length,
      outcome: result.outcome,
      reject_reason: result.rejectReason,
      total_ms: Date.now() - startedAt,
    }),
  );

  // Zero rows: somebody else planned it between the claim and the write. Not an error.
  if (status === null) return { state: 'busy', runId: run.id, done: false };

  if (status === 'done') {
    // `C-R6`. The querent's message sits there unanswered, which is what happens in a
    // real group chat and is one of the strongest naturalness signals available.
    after(() =>
      track('chat.run_finished', {
        trigger: run.trigger,
        status: 'done',
        beats_planned: 0,
        beats_delivered: 0,
        error_kind: null,
        total_ms: Date.now() - startedAt,
      }),
    );
    return { state: 'silent', runId: run.id, done: true };
  }

  const next = nextOf(sheet, 0, null)!;
  return { state: 'planned', runId: run.id, next, done: false };
}

/** One beat. One `chat_turn` call, retried once inside this request (`F1-D2`). */
async function doBeat(
  run: ClaimedRun,
  owner: string,
  beat: Beat,
  index: number,
  total: number,
  clock: ChatClock,
): Promise<AdvanceReply> {
  const startedAt = Date.now();
  const sheet = run.beats!;

  /*
   * **`C-R5`: EVERY BEAT SEES EVERY EARLIER BEAT OF ITS OWN RUN, AS ACTUAL PROSE.**
   * Adrian replying to Thessaly must have Thessaly's words, not the director's summary
   * of what she was going to say — which is why the beat sheet carries no `topic`
   * field and why beats execute serially and never in parallel.
   */
  const runSoFar = await messagesForRun(db, run.id);
  const previousChars = runSoFar.length ? runSoFar[runSoFar.length - 1].body.length : null;

  const outcome = await speak({
    runId: run.id,
    userId: run.userId,
    beat,
    beatIndex: index,
    locale: run.locale,
    trigger: run.trigger,
    runSoFar,
    attempt: 1,
    clock,
  });

  if (outcome.kind === 'shed') {
    await releaseLease(db, run.id, owner);
    return { state: 'shed', runId: run.id, done: false };
  }

  if (outcome.kind === 'failed') {
    /*
     * **`C-R7`: THE BEAT ADVANCES AND STORES NOTHING.** The run continues, the room is
     * quieter, and nothing on screen says a reader failed. **There is no error bubble
     * in this release** — in a chat every message is stored and is context for the
     * next one, so a stored notice would be quoted back at the querent by the next
     * beat as if a reader had said it.
     */
    return await skipBeat(run, owner, beat, index, total, outcome.rejectReason, startedAt, outcome.totalMs);
  }

  const written = await completeBeat(db, {
    runId: run.id,
    userId: run.userId,
    owner,
    expectedBeatsDone: index,
    totalBeats: total,
    beatIndex: index,
    author: beat.reader,
    locale: run.locale,
    bodies: outcome.result.bodies,
    replyToMessageId: beat.replyTo,
    intent: beat.intent,
    model: outcome.result.model,
  });

  const chars = outcome.result.bodies.reduce((n, b) => n + b.length, 0);
  const next = nextOf(sheet, written.beatsDone, chars);

  after(() => {
    track('chat.turn_generated', {
      reader_id: beat.reader,
      intent: beat.intent,
      trigger: run.trigger,
      beat_index: index,
      attempt: outcome.attempt,
      outcome: 'ok',
      reject_reason: null,
      replied_to_reader: beat.to !== 'user',
      address_form: outcome.result.addressForm,
      /* `chars`, NEVER the body (rule 1). */
      chars,
      /* What the SERVER told the client to wait — **the only way to tell a metronome
       * from a pace** (`C-R4`). */
      delay_ms: next?.delayMs ?? 0,
      total_ms: outcome.result.totalMs,
    });
    if (written.status === 'done') {
      track('chat.run_finished', {
        trigger: run.trigger,
        status: 'done',
        beats_planned: total,
        beats_delivered: written.beatsDone,
        error_kind: null,
        total_ms: Date.now() - startedAt,
      });
    }
  });

  return {
    state: 'spoke',
    runId: run.id,
    messages: written.messages,
    next,
    done: written.status === 'done',
  };
}

/**
 * A beat that failed twice. `beats_done` advances, **nothing is stored** (`C-R7`).
 *
 * **A RUN WHOSE EVERY BEAT FAILED ENDS `abandoned`** and the querent sees no bubble —
 * indistinguishable, from the room, from `C-R6`'s silence. That is deliberate: the two
 * are told apart in `chat_runs.status` and in `chat.run_finished`, which is where an
 * operator can act on the difference and a querent cannot.
 */
async function skipBeat(
  run: ClaimedRun,
  owner: string,
  beat: Beat,
  index: number,
  total: number,
  rejectReason: string,
  startedAt: number,
  turnMs: number,
): Promise<AdvanceReply> {
  const sheet = run.beats!;
  const done = index + 1;
  const delivered = (await messagesForRun(db, run.id)).length;

  after(() =>
    track('chat.turn_generated', {
      reader_id: beat.reader,
      intent: beat.intent,
      trigger: run.trigger,
      beat_index: index,
      attempt: 2,
      outcome: 'skipped',
      reject_reason: rejectReason,
      replied_to_reader: beat.to !== 'user',
      address_form: 'none',
      chars: 0,
      delay_ms: 0,
      total_ms: turnMs,
    }),
  );

  if (done >= total) {
    /*
     * **EVERY BEAT FAILED IS `abandoned`; SOME FAILED IS `done`.** `delivered === 0`
     * is the test rather than a counter, because the two-bubble rule (`[R19]`) makes
     * "beats delivered" and "messages written" different numbers and only one of them
     * answers *"did the room see anything?"*
     */
    const status = delivered === 0 ? 'abandoned' : 'done';
    await finishRun(db, run.id, status, delivered === 0 ? 'all_beats_failed' : null);
    after(() =>
      track('chat.run_finished', {
        trigger: run.trigger,
        status,
        beats_planned: total,
        beats_delivered: delivered,
        error_kind: delivered === 0 ? 'all_beats_failed' : null,
        total_ms: Date.now() - startedAt,
      }),
    );
    return { state: 'skipped', runId: run.id, next: null, done: true };
  }

  /*
   * The skip is recorded by moving `beats_done` past this beat. **It goes through the
   * same guarded UPDATE the successful path uses**, minus the insert, so a lost lease
   * is caught here too rather than silently advancing a run somebody else owns.
   */
  await advanceWithoutStoring(run.id, owner, index, total);
  await releaseLease(db, run.id, owner);

  return {
    state: 'skipped',
    runId: run.id,
    next: nextOf(sheet, done, null),
    done: false,
  };
}

/** `completeBeat`'s UPDATE without the insert. Guarded identically. */
async function advanceWithoutStoring(
  runId: string,
  owner: string,
  expected: number,
  total: number,
): Promise<void> {
  const { sql } = await import('drizzle-orm');
  const rows = await db.execute<{ beats_done: number }>(sql`
    update chat_runs
       set beats_done  = beats_done + 1,
           status      = case when beats_done + 1 >= ${total} then 'done' else 'running' end,
           lease_until = null,
           lease_owner = null,
           updated_at  = now()
     where id = ${runId}
       and lease_owner = ${owner}
       and beats_done = ${expected}
    returning beats_done`);
  if (!rows[0]) throw new LeaseLostError(runId);
}

/** A run whose sheet is exhausted but whose status still says `running`. */
async function finish(run: ClaimedRun, owner: string, status: 'done'): Promise<AdvanceReply> {
  await finishRun(db, run.id, status);
  void owner;
  return { state: 'silent', runId: run.id, done: true };
}

/**
 * F5's proactive tick, called from `GET /api/chat/state`'s `after()`.
 *
 * **F1 SHIPPED IT RETURNING `null` UNCONDITIONALLY** so the route was complete and inert
 * until F5 landed; that was deliberate rather than a stub left lying, because the
 * alternative is F5 editing a route file F1 owns. **F5 has landed and this is now the
 * one line of that seam** — the whole of source 2 lives in
 * `@/lib/chat/proactive/onTick`, which mints and then warms at most one step of one open
 * run (§12, seam S-new-2).
 *
 * **THE IMPORT IS DYNAMIC**, and not for bundling: it keeps `run.ts`'s module graph free
 * of `proactive/**`, which imports `run.ts` back for `mintRun` and `advance`. A static
 * pair would be a cycle, and the failure mode of a cycle here is one of the two modules
 * evaluating with half its exports undefined — at runtime, in an `after()`, on the
 * app's most-called endpoint.
 *
 * **`state`'s `after()` MAY WRITE BOOKKEEPING THE QUERENT DID NOT CAUSE; IT MAY NOT
 * WRITE A FACT THAT CLAIMS THE QUERENT LOOKED** (`F1-D3`). That asymmetry is why
 * `POST /api/chat/read` exists as a separate route: `state` is polled from four pages
 * that show no messages, and a GET that moved `last_read_at` would clear the badge from
 * a page where the querent never saw the message — extinguishing `C-N2b`'s red dot with
 * the very request that renders it. **A mint and a warm write no such fact**: the dot is
 * lit by a stored bubble (`[R6]`), which is what this call exists to produce.
 */
export async function proactiveTick(args: {
  userId: string;
  locale: Locale;
  localDate: string;
}): Promise<{ runId: string } | null> {
  const { tickProactive } = await import('./proactive/onTick');
  return tickProactive(args);
}

/** Re-exported so routes have one import for the reply type they serialise. */
export type { AdvanceReply, ChatMessageDto };
