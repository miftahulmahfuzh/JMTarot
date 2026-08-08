/**
 * `/admin/chat`'s read layer against a real Postgres. **F7, v0.7.0.**
 *
 * ── THE REPLY RATE IS THE ONE THING NO UNIT TEST CAN PROVE ─────────────────
 *
 * `[F7-3]` — *the denominator is runs whose 24-hour window has CLOSED* — is a
 * predicate over `now()` inside SQL. A unit test would have to reimplement it to
 * assert it, which is the shape of test that agrees with a bug. Four cases here are
 * the whole measurement:
 *
 *   1. a bubble, and a user message 22 hours later → **replied**
 *   2. the same, 26 hours later → **delivered, not replied**
 *   3. a bubble two hours old → **pending**, in NEITHER the numerator nor the
 *      denominator
 *   4. a proactive run with zero bubbles → **absent from `delivered` entirely**
 *
 * The fourth is `C-R6` and `C-R7` reaching this file: a run that planned no beats and
 * a run that lost all of them said nothing, so there was nothing for the querent to
 * answer. Counting them would make the release's own scorecard fall every time the
 * director correctly stayed quiet.
 *
 * ── AND EVERY RETURNED FIELD IS ASSERTED `typeof === 'number'` ─────────────
 *
 * `metrics.integration.test.ts`'s rule, for V8's reason: `count()` is a bigint and
 * `sum()` is a numeric, both arrive as strings, and `sql<number>` is an assertion the
 * driver is not obliged to honour.
 */
import { afterAll, describe, expect, it } from 'vitest';
import {
  chatMessages,
  chatRuns,
  chatThreads,
  llmCalls,
  users,
  type NewChatMessage,
  type NewChatRun,
  type NewLlmCall,
} from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import type { BeatSheet } from '@/lib/chat/types';
import {
  CHAT_ROLLUP_QUERIES,
  beatHistogram,
  beatIntents,
  castByTarget,
  chatCallTotals,
  chatLatency,
  chatRollup,
  chatSummaryForAdmin,
  chatTokensByUtcDay,
  proactiveReplyRate,
  runHealth,
  runsByUtcDay,
} from './chat';

afterAll(closeTestDb);

let n = 0;

async function seedUser(tx: Tx): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `adminchat:${n}`, email: `adminchat-${n}@example.com` })
    .returning({ id: users.id });
  return user.id;
}

/** Hours before now, as a `Date`. The reply rate's whole subject is `now()`, so the
 *  fixtures have to be relative to it rather than to a pinned calendar day. */
function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600_000);
}

/** `'YYYY-MM-DD'` for a `Date`, UTC — the range endpoints these queries take. */
function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** A range wide enough to hold everything the fixtures below place in the last four
 *  days, and it ENDS TODAY on purpose: that is the operator's default filter and the
 *  one `[F7-3]` is about. */
const RECENT = { from: utcDay(hoursAgo(96)), to: utcDay(new Date()) };

async function seedRun(tx: Tx, userId: string, over: Partial<NewChatRun> = {}): Promise<string> {
  const [run] = await tx
    .insert(chatRuns)
    .values({
      userId,
      trigger: 'idle_nudge',
      locale: 'id',
      status: 'done',
      createdAt: hoursAgo(30),
      ...over,
    } satisfies NewChatRun)
    .returning({ id: chatRuns.id });
  return run.id;
}

async function seedMessage(
  tx: Tx,
  userId: string,
  over: Partial<NewChatMessage> = {},
): Promise<string> {
  const [message] = await tx
    .insert(chatMessages)
    .values({
      userId,
      author: 'thessaly',
      // Short and dull on purpose: nothing in this file reads a body, and a fixture
      // that looked like a conversation would invite somebody to assert on one.
      body: 'x',
      locale: 'id',
      createdAt: hoursAgo(30),
      ...over,
    } satisfies NewChatMessage)
    .returning({ id: chatMessages.id });
  return message.id;
}

function sheet(intents: string[]): BeatSheet {
  return {
    v: 1,
    beats: intents.map((intent, i) => ({
      reader: (['thessaly', 'margaret', 'adrian'] as const)[i % 3],
      to: 'user' as const,
      replyTo: null,
      intent: intent as BeatSheet['beats'][number]['intent'],
      angle: null,
    })),
  };
}

function ledger(over: Partial<NewLlmCall> & Pick<NewLlmCall, 'op' | 'localDate'>): NewLlmCall {
  return {
    model: 'glm-5.2',
    callClass: 'deferred',
    streamed: false,
    status: 'ok',
    locale: 'id',
    createdAt: new Date(`${over.localDate}T12:00:00Z`),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// P1 -- the scorecard
// ---------------------------------------------------------------------------

describe('proactiveReplyRate -- C-N2f, and [F7-3]s settled window', () => {
  it('counts a reply 22 hours after the bubble', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const run = await seedRun(tx, user, { trigger: 'idle_nudge', createdAt: hoursAgo(30) });
      await seedMessage(tx, user, { runId: run, createdAt: hoursAgo(30) });
      // 22 hours after the bubble, and 30 hours after it means the window has closed.
      await seedMessage(tx, user, { author: 'user', createdAt: hoursAgo(8) });

      const [row] = await proactiveReplyRate(tx, RECENT);
      expect(row.trigger).toBe('idle_nudge');
      expect(row.delivered).toBe(1);
      expect(row.replied).toBe(1);
      expect(row.pending).toBe(0);
      for (const v of [row.delivered, row.replied, row.pending]) expect(typeof v).toBe('number');
    }));

  it('does NOT count a reply 26 hours after the bubble', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const run = await seedRun(tx, user, { createdAt: hoursAgo(30) });
      await seedMessage(tx, user, { runId: run, createdAt: hoursAgo(30) });
      // 26 hours later: the querent came back, but not to this.
      await seedMessage(tx, user, { author: 'user', createdAt: hoursAgo(4) });

      const [row] = await proactiveReplyRate(tx, RECENT);
      expect(row.delivered).toBe(1);
      expect(row.replied).toBe(0);
    }));

  it('[F7-3] a two-hour-old bubble is PENDING, in neither numerator nor denominator', () =>
    withRollback(async (tx) => {
      /*
       * **THE FAILURE THIS PREVENTS IS THE SCORECARD READING AS DECLINING ON EVERY
       * PAGE LOAD.** A run that produced a bubble four hours before the range's right
       * edge has not failed to get a reply; it has not finished being asked — and the
       * default filter always ends today, so the newest runs are always unsettled.
       */
      const user = await seedUser(tx);
      const run = await seedRun(tx, user, { createdAt: hoursAgo(2) });
      await seedMessage(tx, user, { runId: run, createdAt: hoursAgo(2) });

      const [row] = await proactiveReplyRate(tx, RECENT);
      expect(row.pending).toBe(1);
      expect(row.delivered).toBe(0);
      expect(row.replied).toBe(0);
    }));

  it('drops a proactive run that produced NO bubble -- C-R6 and C-R7 are both silence', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      // A zero-beat plan (valid and desirable) and a run whose every beat was dropped
      // look identical from inside the room. Neither said anything to answer.
      await seedRun(tx, user, { status: 'done', beats: sheet([]) });
      await seedRun(tx, user, { status: 'abandoned' });

      expect(await proactiveReplyRate(tx, RECENT)).toEqual([]);
    }));

  it('ignores a user_message run entirely -- the querent asked for that one', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const run = await seedRun(tx, user, { trigger: 'user_message', createdAt: hoursAgo(30) });
      await seedMessage(tx, user, { runId: run, createdAt: hoursAgo(30) });

      expect(await proactiveReplyRate(tx, RECENT)).toEqual([]);
    }));

  it("does not credit another person's reply", () =>
    withRollback(async (tx) => {
      const mine = await seedUser(tx);
      const theirs = await seedUser(tx);
      const run = await seedRun(tx, mine, { createdAt: hoursAgo(30) });
      await seedMessage(tx, mine, { runId: run, createdAt: hoursAgo(30) });
      await seedMessage(tx, theirs, { author: 'user', createdAt: hoursAgo(8) });

      const [row] = await proactiveReplyRate(tx, RECENT);
      expect(row.delivered).toBe(1);
      expect(row.replied).toBe(0);
    }));
});

// ---------------------------------------------------------------------------
// P2 -- runsByUtcDay
// ---------------------------------------------------------------------------

describe('runsByUtcDay', () => {
  it('groups by UTC day and trigger, and counts RUNS rather than bubbles', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const day = new Date(`${utcDay(hoursAgo(30))}T10:00:00Z`);
      const run = await seedRun(tx, user, { trigger: 'cron', createdAt: day });
      // Four bubbles on one run. This series must still read 1.
      for (let i = 0; i < 4; i += 1) {
        await seedMessage(tx, user, { runId: run, beatIndex: i, createdAt: day });
      }
      await seedRun(tx, user, { trigger: 'user_message', createdAt: day });

      const rows = await runsByUtcDay(tx, RECENT);
      const byTrigger = Object.fromEntries(rows.map((r) => [r.trigger, r.runs]));
      expect(byTrigger).toEqual({ cron: 1, user_message: 1 });
      expect(typeof rows[0].runs).toBe('number');
      expect(rows[0].bucket).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }));

  it('is empty for an unusable range rather than throwing', () =>
    withRollback(async (tx) => {
      expect(await runsByUtcDay(tx, { from: '2026-08-30', to: '2026-08-01' })).toEqual([]);
    }));
});

// ---------------------------------------------------------------------------
// P3 -- beatHistogram
// ---------------------------------------------------------------------------

describe('beatHistogram -- the silence rate, and the two zeros', () => {
  it('buckets terminal runs by beat count and caps at 4', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      await seedRun(tx, user, { status: 'done', beats: sheet([]) });
      await seedRun(tx, user, { status: 'done', beats: sheet(['answer']) });
      await seedRun(tx, user, { status: 'done', beats: sheet(['answer', 'ask']) });
      await seedRun(tx, user, {
        status: 'abandoned',
        beats: sheet(['answer', 'ask', 'react', 'tease']),
      });

      const rows = await beatHistogram(tx, RECENT);
      expect(rows).toEqual([
        { bucket: 0, runs: 1 },
        { bucket: 1, runs: 1 },
        { bucket: 2, runs: 1 },
        { bucket: 4, runs: 1 },
      ]);
      expect(typeof rows[0].runs).toBe('number');
    }));

  it('puts a RUNNING run in no bucket at all', () =>
    withRollback(async (tx) => {
      /*
       * A `running` run's sheet is a PLAN, not an outcome. Counting it would put every
       * open tab in the `0` bucket beside deliberate silence — the two things this
       * panel exists to separate. `pending` and `planning` have no sheet, so they
       * would land there too.
       */
      const user = await seedUser(tx);
      await seedRun(tx, user, { status: 'running', beats: sheet(['answer', 'ask']) });
      await seedRun(tx, user, { status: 'pending' });
      await seedRun(tx, user, { status: 'planning' });

      expect(await beatHistogram(tx, RECENT)).toEqual([]);
    }));

  it('counts a done run with a NULL sheet as zero beats', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      await seedRun(tx, user, { status: 'abandoned', beats: null });
      expect(await beatHistogram(tx, RECENT)).toEqual([{ bucket: 0, runs: 1 }]);
    }));
});

// ---------------------------------------------------------------------------
// P4 -- castByTarget
// ---------------------------------------------------------------------------

describe('castByTarget -- is this a group, or three monologues?', () => {
  it('separates a reply to the querent from a reply to another reader', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const mine = await seedMessage(tx, user, { author: 'user' });
      const hers = await seedMessage(tx, user, { author: 'thessaly', replyToMessageId: mine });
      await seedMessage(tx, user, { author: 'adrian', replyToMessageId: hers });
      await seedMessage(tx, user, { author: 'margaret' });

      const rows = await castByTarget(tx, RECENT);
      expect(rows).toEqual(
        expect.arrayContaining([
          { author: 'thessaly', target: 'querent', messages: 1 },
          { author: 'adrian', target: 'reader', messages: 1 },
          { author: 'margaret', target: 'none', messages: 1 },
        ]),
      );
      // The querent's own message is never a row here.
      expect(rows.some((r) => (r.author as string) === 'user')).toBe(false);
      expect(typeof rows[0].messages).toBe('number');
    }));

  it("counts a reply whose target was deleted as 'none' rather than dropping it", () =>
    withRollback(async (tx) => {
      // `reply_to_message_id` is `on delete set null`: the reply happened, and what it
      // replied to is gone. That is the honest answer, and it is not an omission.
      const user = await seedUser(tx);
      await seedMessage(tx, user, { author: 'adrian', replyToMessageId: null });
      expect(await castByTarget(tx, RECENT)).toEqual([
        { author: 'adrian', target: 'none', messages: 1 },
      ]);
    }));
});

// ---------------------------------------------------------------------------
// P5 -- beatIntents
// ---------------------------------------------------------------------------

describe('beatIntents -- C-N1ds ask rate', () => {
  it('counts beats, not runs, and reads the intent by its pinned key', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      await seedRun(tx, user, { status: 'done', beats: sheet(['answer', 'ask', 'answer']) });
      await seedRun(tx, user, { status: 'done', beats: sheet(['tease']) });

      const rows = await beatIntents(tx, RECENT);
      expect(Object.fromEntries(rows.map((r) => [r.intent, r.beats]))).toEqual({
        answer: 2,
        ask: 1,
        tease: 1,
      });
      expect(typeof rows[0].beats).toBe('number');
    }));

  it('reports a beat with no intent key as NULL, not as an absent row', () =>
    withRollback(async (tx) => {
      /*
       * `(tidak tercatat)` on the panel. **An empty panel and a mis-keyed query must
       * not look alike**: if `[R9]`'s `intent` key ever moved, every beat would land
       * here and the panel would be visibly wrong rather than invisibly empty.
       */
      const user = await seedUser(tx);
      await seedRun(tx, user, {
        status: 'done',
        beats: { v: 1, beats: [{ reader: 'adrian', to: 'user', replyTo: null, angle: null }] } as never,
      });

      expect(await beatIntents(tx, RECENT)).toEqual([{ intent: null, beats: 1 }]);
    }));

  it('is empty rather than throwing when a done run has no sheet', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      await seedRun(tx, user, { status: 'done', beats: null });
      expect(await beatIntents(tx, RECENT)).toEqual([]);
    }));
});

// ---------------------------------------------------------------------------
// P6 / P7 -- the ledger
// ---------------------------------------------------------------------------

describe('the chat ledger queries', () => {
  it('splits chat_plan from chat_turn and ignores every other op', () =>
    withRollback(async (tx) => {
      const day = utcDay(hoursAgo(30));
      await tx.insert(llmCalls).values([
        ledger({ op: 'chat_plan', localDate: day, inputTokens: 2400, outputTokens: 90, totalMs: 1800 }),
        ledger({ op: 'chat_turn', localDate: day, inputTokens: 3100, outputTokens: 140, totalMs: 2600 }),
        ledger({ op: 'chat_turn', localDate: day, inputTokens: null, outputTokens: null, totalMs: 900 }),
        // Not the chat's. If this appeared, the panel would be measuring the app.
        ledger({ op: 'reading', localDate: day, model: 'glm-4.6', inputTokens: 9999, outputTokens: 999 }),
      ]);

      const rows = await chatTokensByUtcDay(tx, RECENT);
      const byOp = Object.fromEntries(rows.map((r) => [r.op, r]));
      expect(byOp.chat_plan.calls).toBe(1);
      expect(byOp.chat_plan.inputTokens).toBe(2400);
      expect(byOp.chat_turn.calls).toBe(2);
      expect(byOp.chat_turn.inputTokens).toBe(3100);
      // A-D7: the provider reported nothing on one of them, and that count is not hidden.
      expect(byOp.chat_turn.untokenized).toBe(1);
      for (const r of rows) {
        for (const v of [r.calls, r.inputTokens, r.outputTokens, r.untokenized]) {
          expect(typeof v).toBe('number');
        }
      }
    }));

  it('returns a PriceableRow shape per (model, local_date)', () =>
    withRollback(async (tx) => {
      const day = utcDay(hoursAgo(30));
      await tx.insert(llmCalls).values([
        ledger({ op: 'chat_plan', localDate: day, inputTokens: 100, outputTokens: 10 }),
        ledger({ op: 'chat_turn', localDate: day, inputTokens: 200, outputTokens: 20 }),
      ]);

      const [row] = await chatCallTotals(tx, RECENT);
      // Both ops fold into ONE row: the price table is keyed by model and day, not by
      // op, which is what makes `priceRollup` take this unchanged.
      expect(row).toMatchObject({
        model: 'glm-5.2',
        localDate: day,
        calls: 2,
        inputTokens: 300,
        outputTokens: 30,
        untokenized: 0,
      });
    }));

  it('reports a range-wide latency row per op, computed over the whole population', () =>
    withRollback(async (tx) => {
      const day = utcDay(hoursAgo(30));
      await tx.insert(llmCalls).values([
        ledger({ op: 'chat_turn', localDate: day, totalMs: 1000 }),
        ledger({ op: 'chat_turn', localDate: day, totalMs: 3000 }),
        // A failed call has a duration, but not a duration producing anything.
        ledger({ op: 'chat_turn', localDate: day, totalMs: 60_000, status: 'failed' }),
      ]);

      const rows = await chatLatency(tx, RECENT);
      const overall = rows.find((r) => r.bucket === null && r.op === 'chat_turn')!;
      expect(overall.calls).toBe(2);
      expect(overall.p50Ms).toBe(2000);
      expect(typeof overall.p95Ms).toBe('number');
      expect(rows.some((r) => r.bucket !== null)).toBe(true);
    }));

  it('leaves a percentile NULL when nothing was measured, never 0', () =>
    withRollback(async (tx) => {
      const day = utcDay(hoursAgo(30));
      await tx.insert(llmCalls).values([ledger({ op: 'chat_plan', localDate: day, totalMs: null })]);
      const overall = (await chatLatency(tx, RECENT)).find((r) => r.bucket === null)!;
      expect(overall.calls).toBe(1);
      expect(overall.p50Ms).toBeNull();
    }));
});

// ---------------------------------------------------------------------------
// P8 -- runHealth
// ---------------------------------------------------------------------------

describe('runHealth -- the dropped beat, which is invisible from inside the room', () => {
  it('computes dropped beats exactly: three beats planned, two bubbles stored', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const run = await seedRun(tx, user, {
        status: 'done',
        beats: sheet(['answer', 'ask', 'react']),
      });
      await seedMessage(tx, user, { runId: run, beatIndex: 0 });
      await seedMessage(tx, user, { runId: run, beatIndex: 1 });

      const health = await runHealth(tx, RECENT);
      expect(health.terminalRuns).toBe(1);
      expect(health.beatsPlanned).toBe(3);
      expect(health.bubbles).toBe(2);
      for (const v of [health.terminalRuns, health.beatsPlanned, health.bubbles, health.fallbackPlans]) {
        expect(typeof v).toBe('number');
      }
    }));

  it('excludes a RUNNING run, because a shed beat leaves the run running', () =>
    withRollback(async (tx) => {
      /*
       * `C-D6` consequence 3 is what makes the subtraction exact: a beat shed at the
       * chat ceiling is not a dropped beat, it is a postponed one, and it leaves the
       * run `running` with beats remaining. Counting it would report the sub-budget
       * working as validation failing.
       */
      const user = await seedUser(tx);
      await seedRun(tx, user, { status: 'running', beats: sheet(['answer', 'ask', 'react']) });
      const health = await runHealth(tx, RECENT);
      expect(health.terminalRuns).toBe(0);
      expect(health.beatsPlanned).toBe(0);
    }));

  it("counts the director's fallback, which is otherwise indistinguishable from a plan", () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      await seedRun(tx, user, { status: 'done', planSource: 'fallback', beats: sheet(['answer']) });
      await seedRun(tx, user, { status: 'done', planSource: 'model', beats: sheet(['answer']) });

      const health = await runHealth(tx, RECENT);
      expect(health.terminalRuns).toBe(2);
      expect(health.fallbackPlans).toBe(1);
    }));

  it('flags a run whose lease expired long ago as stuck', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      await seedRun(tx, user, {
        status: 'running',
        leaseUntil: hoursAgo(3),
        leaseOwner: 'dead-lambda',
      });
      // Freshly leased: in flight, not stuck.
      await seedRun(tx, user, {
        status: 'running',
        leaseUntil: new Date(Date.now() + 60_000),
        leaseOwner: 'live-lambda',
      });

      const running = (await runHealth(tx, RECENT)).statuses.find((s) => s.status === 'running')!;
      expect(running.runs).toBe(2);
      expect(running.stuck).toBe(1);
    }));
});

// ---------------------------------------------------------------------------
// The per-user summary, and the composite
// ---------------------------------------------------------------------------

describe('chatSummaryForAdmin -- counts and no text ([R15])', () => {
  it('returns per-author counts, run breakdowns and the throttle state', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const run = await seedRun(tx, user, { trigger: 'cron', createdAt: hoursAgo(30) });
      await seedMessage(tx, user, { runId: run, author: 'thessaly', createdAt: hoursAgo(30) });
      await seedMessage(tx, user, { author: 'user', createdAt: hoursAgo(8) });
      await tx.insert(chatThreads).values({
        userId: user,
        lastReadAt: hoursAgo(1),
        proactiveCountToday: 2,
        proactiveCountDate: '2026-08-07',
        utcOffsetMinutes: 420,
      });

      const summary = await chatSummaryForAdmin(tx, user);
      expect(Object.fromEntries(summary.byAuthor.map((a) => [a.author, a.messages]))).toEqual({
        thessaly: 1,
        user: 1,
      });
      expect(summary.runsByTrigger).toEqual([{ trigger: 'cron', runs: 1 }]);
      expect(summary.runsByStatus).toEqual([{ status: 'done', runs: 1 }]);
      expect(summary.reply).toEqual([
        { trigger: 'cron', delivered: 1, replied: 1, pending: 0 },
      ]);
      // A `'YYYY-MM-DD'` STRING, never a Date — the querent's calendar day.
      expect(summary.thread?.proactiveCountDate).toBe('2026-08-07');
      expect(typeof summary.thread?.proactiveCountToday).toBe('number');
      expect(summary.thread?.utcOffsetMinutes).toBe(420);
    }));

  it('carries no message body anywhere in its return shape', () =>
    withRollback(async (tx) => {
      /*
       * `[F7-13]`. `chat_messages.body` is PLAINTEXT (`C-D20`) — not even behind
       * `FIELD_ENCRYPTION_KEY` the way the six onboarding answers are — and the whole
       * protection is that nothing reads it. Serialising the return value and
       * searching for the fixture is a fence a future field would have to defeat
       * deliberately.
       */
      const user = await seedUser(tx);
      await seedMessage(tx, user, { author: 'user', body: 'kalimat-rahasia-penanya' });
      const summary = await chatSummaryForAdmin(tx, user);
      expect(JSON.stringify(summary)).not.toContain('kalimat-rahasia-penanya');
    }));

  it('returns a null thread for somebody who has never opened the room', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const summary = await chatSummaryForAdmin(tx, user);
      expect(summary.thread).toBeNull();
      expect(summary.byAuthor).toEqual([]);
    }));
});

describe('chatRollup', () => {
  it('issues exactly CHAT_ROLLUP_QUERIES statements', async () => {
    /*
     * `fleetRollup`'s counting wrapper, so a later "just add one more panel" is a
     * visible regression rather than a slightly slower page nobody measures. **Every
     * admin request is a cold one** — one admin, no warm instance — so the first query
     * of a session also wakes a suspended Neon compute.
     */
    let count = 0;
    await withRollback(async (tx) => {
      const counting = new Proxy(tx, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (prop !== 'execute' || typeof value !== 'function') return value;
          return (...args: unknown[]) => {
            count += 1;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        },
      });
      await chatRollup(counting as typeof tx, RECENT);
    });
    expect(count).toBe(CHAT_ROLLUP_QUERIES);
  });

  it('returns every panel a shape, on a range with nothing in it', () =>
    withRollback(async (tx) => {
      // The renderers run against an empty range on every first visit, and three of
      // them do arithmetic. A throw here is a 500 on the whole page.
      const rollup = await chatRollup(tx, RECENT);
      expect(rollup.reply).toEqual([]);
      expect(rollup.health.statuses).toEqual([]);
      expect(rollup.fleetByOp).toEqual([]);
      expect(rollup.chatPeak).toBeNull();
      expect(rollup.fleetPeak).toBeNull();
    }));
});
