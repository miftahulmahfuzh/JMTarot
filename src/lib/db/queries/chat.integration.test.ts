import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import * as schema from '@/lib/db/schema';
import { chatMessages, chatRuns, chatThreads, readings, users } from '@/lib/db/schema';
import { closeTestDb, resetDb, testDb, withRollback } from '@/lib/db/testing/harness';
import type { BeatSheet } from '@/lib/chat/types';
import type { Db, Tx } from '@/lib/db/types';
import {
  activeRunFor,
  claimRun,
  completeBeat,
  finishRun,
  getThread,
  insertMessage,
  insertRun,
  lastMessageAt,
  lastUnansweredAsk,
  LeaseLostError,
  listMessages,
  markRead,
  messageByClientKey,
  messagesForRun,
  releaseLease,
  runExistsForReading,
  unreadCount,
  upsertThread,
  writeBeatSheet,
} from './chat';

config({ path: '.env.local', quiet: true });

let n = 0;

async function makeUser(tx: Tx | Db, tag: string): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `chat:${tag}:${n}`, email: `c${tag}${n}@example.com` })
    .returning({ id: users.id });
  return user.id;
}

const SHEET = (count: number): BeatSheet => ({
  v: 1,
  beats: Array.from({ length: count }, (_, i) => ({
    reader: (['thessaly', 'margaret', 'adrian'] as const)[i % 3],
    to: 'user' as const,
    replyTo: null,
    intent: 'answer' as const,
    angle: null,
  })),
});

afterAll(closeTestDb);

describe('chat_threads', () => {
  it('is absent until something writes it, and that is normal', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'thread');
      expect(await getThread(tx, userId)).toBeNull();
      // NULL means never opened, which is not zero unread — M14's distinction.
      expect(await unreadCount(tx, userId)).toBe(0);
    }));

  it('moves updatedAt by hand inside the upsert ([F1-22])', () =>
    withRollback(async (tx) => {
      /*
       * **`$onUpdate()` DOES NOT FIRE INSIDE `onConflictDoUpdate`** — it applies to
       * `db.update()` only. Drop the by-hand line and this column freezes at the first
       * insert, silently, while every other assertion about the row still passes. For
       * this table it is the only thing that can say when the cursors last moved.
       */
      const userId = await makeUser(tx, 'touch');
      await upsertThread(tx, userId, { lastUserMessageAt: new Date() });
      const first = (await getThread(tx, userId))!.updatedAt;

      await new Promise((r) => setTimeout(r, 5));
      await upsertThread(tx, userId, { lastReaderMessageAt: new Date() });
      const second = (await getThread(tx, userId))!.updatedAt;

      expect(second.getTime()).toBeGreaterThan(first.getTime());
    }));

  it('keeps proactive_count_date a STRING, never a Date ([F1-21])', () =>
    withRollback(async (tx) => {
      /*
       * `local_date`'s trap verbatim. This column decides whether a reader is allowed
       * to message somebody today, and a `Date` renders in the server's zone — a day
       * out for anyone in Jakarta between midnight and 07:00. **This test fails if
       * anyone "fixes" the column to `mode: 'date'`.**
       */
      const userId = await makeUser(tx, 'date');
      await upsertThread(tx, userId, { proactiveCountDate: '2026-08-07', proactiveCountToday: 2 });

      const row = await getThread(tx, userId);
      expect(typeof row?.proactiveCountDate).toBe('string');
      expect(row?.proactiveCountDate).toBe('2026-08-07');
    }));

  it('carries utc_offset_minutes though nothing reads it yet ([R17])', () =>
    withRollback(async (tx) => {
      // Folded into 0014 so that ruling the other way on quiet hours later is one
      // line rather than a migration, and because /api/cron/nudge has no client and
      // therefore no `x-jm-local-date` header.
      const userId = await makeUser(tx, 'offset');
      await upsertThread(tx, userId, { utcOffsetMinutes: 420 });
      expect((await getThread(tx, userId))?.utcOffsetMinutes).toBe(420);
    }));
});

describe('the badge count', () => {
  it('counts reader messages after last_read_at, and NEVER a pending run ([R6])', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'badge');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;

      // A pending run with no bubble contributes NOTHING. `C-R6` makes a zero-beat
      // plan valid, so a dot lit by a pending run leads the querent to an empty room.
      expect(await unreadCount(tx, userId)).toBe(0);

      await insertMessage(tx, { userId, author: 'user', body: 'halo', locale: 'id' });
      expect(await unreadCount(tx, userId), 'my own words are not unread').toBe(0);

      await insertMessage(tx, {
        userId,
        author: 'adrian',
        body: 'halo juga',
        locale: 'id',
        runId: run.id,
        beatIndex: 0,
      });
      expect(await unreadCount(tx, userId)).toBe(1);
    }));

  it('clears on markRead and answers with the count after the move', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'read');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      await insertMessage(tx, {
        userId,
        author: 'margaret',
        body: 'hm',
        locale: 'id',
        runId: run.id,
        beatIndex: 0,
      });

      expect(await unreadCount(tx, userId)).toBe(1);
      expect(await markRead(tx, userId, new Date())).toBe(0);
    }));

  it('never moves the cursor BACKWARDS', () =>
    withRollback(async (tx) => {
      /*
       * Four pages of the app poll `/api/chat/state` and any of their tabs may post
       * to `/read` late. An out-of-order request from a slow one must not resurrect a
       * dot the querent already cleared — `greatest(last_read_at, $2)` is the whole
       * mechanism.
       */
      const userId = await makeUser(tx, 'monotonic');
      const now = new Date();
      const anHourAgo = new Date(now.getTime() - 3_600_000);

      await markRead(tx, userId, now);
      await markRead(tx, userId, anHourAgo);

      expect((await getThread(tx, userId))!.lastReadAt!.getTime()).toBe(now.getTime());
    }));
});

describe('chat_messages', () => {
  it('pairs author with run_id in insertMessage, not in a CHECK ([R7])', () =>
    withRollback(async (tx) => {
      /*
       * **THE CHECK WOULD DETONATE DURING ERASURE.** `run_id` carries
       * `ON DELETE SET NULL`, the referential action fires DURING a delete, and a
       * CHECK it lands on the wrong side of makes the DELETE raise — A1's `23502`
       * lesson. So the rule is enforced at insert time, where a route can violate it
       * and be told, rather than at delete time where a querent's erasure fails.
       */
      const userId = await makeUser(tx, 'pair');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;

      await expect(
        insertMessage(tx, {
          userId,
          author: 'user',
          body: 'x',
          locale: 'id',
          runId: run.id,
          beatIndex: 0,
        }),
      ).rejects.toThrow(/belongs to no run/);

      await expect(
        insertMessage(tx, { userId, author: 'adrian', body: 'x', locale: 'id' }),
      ).rejects.toThrow(/must name its run/);
    }));

  it('survives the deletion of a quoted message with `set null`, not a cascade', () =>
    withRollback(async (tx) => {
      // Deleting a quoted message must not delete the reply. The bubble stays; the
      // stub goes.
      const userId = await makeUser(tx, 'reply');
      const first = await insertMessage(tx, {
        userId,
        author: 'user',
        body: 'pertanyaan',
        locale: 'id',
      });
      const second = await insertMessage(tx, {
        userId,
        author: 'user',
        body: 'lanjutannya',
        locale: 'id',
        replyToMessageId: first.id,
      });

      await tx.delete(chatMessages).where(sql`id = ${first.id}`);

      const { messages } = await listMessages(tx, userId);
      expect(messages.map((m) => m.id)).toEqual([second.id]);
      expect(messages[0].replyToMessageId).toBeNull();
      expect(messages[0].replyTo).toBeNull();
    }));

  it('inlines the reply stub, without which C-D11 disappears ([R10])', () =>
    withRollback(async (tx) => {
      /*
       * A page is 40 rows and the whole point of `replyTo` is a beat quoting an
       * hour-old message — usually off the page. A client resolving stubs from what it
       * already holds would render the quote as nothing, on exactly the bubbles the
       * feature exists for.
       */
      const userId = await makeUser(tx, 'stub');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      const old = await insertMessage(tx, {
        userId,
        author: 'adrian',
        body: 'x'.repeat(400),
        locale: 'id',
        runId: run.id,
        beatIndex: 0,
      });
      await insertMessage(tx, {
        userId,
        author: 'user',
        body: 'iya',
        locale: 'id',
        replyToMessageId: old.id,
      });

      const { messages } = await listMessages(tx, userId);
      const reply = messages.find((m) => m.body === 'iya')!;
      expect(reply.replyTo).toEqual({ id: old.id, author: 'adrian', snippet: 'x'.repeat(120) });
    }));

  it('never selects `model` into anything a route returns ([F1-12])', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'model');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      await insertMessage(tx, {
        userId,
        author: 'thessaly',
        body: 'hm',
        locale: 'id',
        runId: run.id,
        beatIndex: 0,
        model: 'glm-5.2',
      });

      const { messages } = await listMessages(tx, userId);
      expect('model' in messages[0]).toBe(false);
      expect(JSON.stringify(messages)).not.toContain('glm-5.2');

      // ...and the column really was written, so the assertion is not vacuous.
      const [row] = await tx
        .select({ model: chatMessages.model })
        .from(chatMessages)
        .where(sql`user_id = ${userId}`);
      expect(row.model).toBe('glm-5.2');
    }));

  it('pages newest-first on the (created_at, id) keyset', () =>
    withRollback(async (tx) => {
      /*
       * **KEYSET AND NOT OFFSET, BECAUSE THE LOG IS APPEND-ONLY.** A run inserting
       * three bubbles while the querent scrolls shifts every offset and duplicates a
       * bubble on screen.
       */
      /*
       * **THE EXPLICIT `createdAt` IS NOT TEST SUGAR — IT IS WHAT FOUND THE BUG.**
       * `defaultNow()` is `transaction_timestamp()`, so five rows written inside one
       * transaction share a microsecond and the ordering falls through to `id desc`,
       * which is a random uuid. That is a test artefact here and a REAL defect in
       * `completeBeat`, which writes two bubbles per beat in one transaction; it now
       * stamps them a millisecond apart for exactly this reason.
       */
      const userId = await makeUser(tx, 'page');
      const t0 = Date.now();
      for (let i = 0; i < 5; i++) {
        await insertMessage(tx, {
          userId,
          author: 'user',
          body: `m${i}`,
          locale: 'id',
          createdAt: new Date(t0 + i * 1000),
        });
      }

      const first = await listMessages(tx, userId, { limit: 2 });
      expect(first.messages.map((m) => m.body)).toEqual(['m4', 'm3']);
      expect(first.hasMore).toBe(true);

      const last = first.messages[1];
      const second = await listMessages(tx, userId, {
        limit: 2,
        before: new Date(last.createdAt),
        beforeId: last.id,
      });
      expect(second.messages.map((m) => m.body)).toEqual(['m2', 'm1']);
      expect(second.hasMore).toBe(true);
    }));

  it('answers a duplicate client_key with the FIRST row, never a second insert', () =>
    withRollback(async (tx) => {
      /*
       * F4's ONE permitted timeout retry (`POST /api/locale`'s rule 3). Without the
       * key the retry double-posts the querent's sentence — and **both copies are
       * context for every future turn in the room** (`C-R5`), so one dropped packet is
       * quoted back at them forever.
       */
      const userId = await makeUser(tx, 'idem');
      const stored = await insertMessage(tx, {
        userId,
        author: 'user',
        body: 'sekali saja',
        locale: 'id',
        clientKey: 'k1',
      });

      expect((await messageByClientKey(tx, userId, 'k1'))?.id).toBe(stored.id);

      await expect(
        insertMessage(tx, {
          userId,
          author: 'user',
          body: 'sekali saja',
          locale: 'id',
          clientKey: 'k1',
        }),
      ).rejects.toThrow();
    }));

  it('lets TWO querents use the same client_key, because the index is per user', () =>
    withRollback(async (tx) => {
      const a = await makeUser(tx, 'idemA');
      const b = await makeUser(tx, 'idemB');
      await insertMessage(tx, { userId: a, author: 'user', body: 'x', locale: 'id', clientKey: 'same' });
      await insertMessage(tx, { userId: b, author: 'user', body: 'x', locale: 'id', clientKey: 'same' });
      expect(await unreadCount(tx, a)).toBe(0);
    }));

  it('lets every reader message share a NULL client_key ([R7]s inverse)', () =>
    withRollback(async (tx) => {
      /*
       * **THE PARTIAL INDEX IS NOT `nulls not distinct`, AND INVERTING IT IS THE
       * MISTAKE.** V7's `share_links` trap points the other way here: every reader
       * message has a NULL key, so treating NULLs as equal would collapse the whole
       * room into one row.
       */
      const userId = await makeUser(tx, 'nullkeys');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      for (let i = 0; i < 3; i++) {
        await insertMessage(tx, {
          userId,
          author: 'adrian',
          body: `b${i}`,
          locale: 'id',
          runId: run.id,
          beatIndex: i,
        });
      }
      expect((await listMessages(tx, userId)).messages).toHaveLength(3);
    }));

  it('refuses an empty reader bubble at the column ([C-R7])', () =>
    withRollback(async (tx) => {
      // `C-R7` says a failed beat stores nothing; an empty string is that failure
      // arriving as data and being read aloud by the next beat as a message.
      const userId = await makeUser(tx, 'empty');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      await expect(
        insertMessage(tx, {
          userId,
          author: 'thessaly',
          body: '',
          locale: 'id',
          runId: run.id,
          beatIndex: 0,
        }),
      ).rejects.toThrow();
    }));

  it("allows an EMPTY user message, because F6's attachment carries it", () =>
    withRollback(async (tx) => {
      // An attachment with no text is a perfectly good conversational move.
      const userId = await makeUser(tx, 'attach');
      await insertMessage(tx, { userId, author: 'user', body: '', locale: 'id' });
      expect((await listMessages(tx, userId)).messages).toHaveLength(1);
    }));
});

describe('the run lifecycle', () => {
  it('mints pending, plans to running, and finishes on the last beat', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'life');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      expect(run.status).toBe('pending');

      const claimed = await claimRun(tx, userId, 'owner-1');
      expect(claimed?.status).toBe('planning');

      expect(
        await writeBeatSheet(tx, {
          runId: run.id,
          owner: 'owner-1',
          sheet: SHEET(2),
          planModel: 'glm-5.2',
          planSource: 'model',
          locale: 'id',
        }),
      ).toBe('running');

      const second = await claimRun(tx, userId, 'owner-2');
      expect(second?.beatsDone).toBe(0);

      const one = await completeBeat(tx, {
        runId: run.id,
        userId,
        owner: 'owner-2',
        expectedBeatsDone: 0,
        totalBeats: 2,
        beatIndex: 0,
        author: 'thessaly',
        locale: 'id',
        bodies: ['hm.'],
        model: 'glm-5.2',
      });
      expect(one.status).toBe('running');
      expect(one.beatsDone).toBe(1);

      await claimRun(tx, userId, 'owner-3');
      const two = await completeBeat(tx, {
        runId: run.id,
        userId,
        owner: 'owner-3',
        expectedBeatsDone: 1,
        totalBeats: 2,
        beatIndex: 1,
        author: 'adrian',
        locale: 'id',
        bodies: ['iya sih.'],
        model: 'glm-5.2',
      });
      expect(two.status).toBe('done');
      expect(await activeRunFor(tx, userId)).toBeNull();
    }));

  it('flips an EMPTY sheet straight to done, with no turn call ([C-R6])', () =>
    withRollback(async (tx) => {
      /*
       * **A ZERO-BEAT PLAN IS VALID AND IS THE COMMON GOOD OUTCOME.** The querent's
       * message sits there unanswered, which is what happens in a real group chat and
       * is one of the strongest naturalness signals available. F7 measures the rate;
       * a rate of zero means the director is not really deciding.
       */
      const userId = await makeUser(tx, 'silent');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      await claimRun(tx, userId, 'o');

      expect(
        await writeBeatSheet(tx, {
          runId: run.id,
          owner: 'o',
          sheet: SHEET(0),
          planModel: 'glm-5.2',
          planSource: 'model',
          locale: 'id',
        }),
      ).toBe('done');
      expect(await activeRunFor(tx, userId)).toBeNull();
    }));

  it('refuses a SECOND beat sheet, so a reclaimed run cannot get six bubbles ([F1-4]/[F1-5])', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'resheet');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      await claimRun(tx, userId, 'o');
      await writeBeatSheet(tx, {
        runId: run.id,
        owner: 'o',
        sheet: SHEET(3),
        planModel: 'glm-5.2',
        planSource: 'model',
        locale: 'id',
      });

      await claimRun(tx, userId, 'o2');
      expect(
        await writeBeatSheet(tx, {
          runId: run.id,
          owner: 'o2',
          sheet: SHEET(3),
          planModel: 'glm-5.2',
          planSource: 'model',
          locale: 'id',
        }),
        'a run that already has a sheet must not get a second one',
      ).toBeNull();
    }));

  it('records plan_source so validatePlan`s refusal rate is visible ([R9]/F7)', () =>
    withRollback(async (tx) => {
      // F2's fallback is never zero-beat and is otherwise indistinguishable from a
      // real plan, so without this column the panel measuring the director measures
      // nothing.
      const userId = await makeUser(tx, 'source');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      await claimRun(tx, userId, 'o');
      await writeBeatSheet(tx, {
        runId: run.id,
        owner: 'o',
        sheet: SHEET(1),
        planModel: 'glm-5.2',
        planSource: 'fallback',
        locale: 'id',
      });

      const [row] = await tx
        .select({ src: chatRuns.planSource })
        .from(chatRuns)
        .where(sql`id = ${run.id}`);
      expect(row.src).toBe('fallback');
    }));

  it('writes ONE beat as TWO bubbles and still advances beats_done by one ([R19])', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'twobubbles');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      await claimRun(tx, userId, 'o');
      await writeBeatSheet(tx, {
        runId: run.id,
        owner: 'o',
        sheet: SHEET(1),
        planModel: 'glm-5.2',
        planSource: 'model',
        locale: 'id',
      });
      await claimRun(tx, userId, 'o2');

      const out = await completeBeat(tx, {
        runId: run.id,
        userId,
        owner: 'o2',
        expectedBeatsDone: 0,
        totalBeats: 1,
        beatIndex: 0,
        author: 'adrian',
        locale: 'id',
        bodies: ['eh bentar', 'lo laper ya?'],
        model: 'glm-5.2',
      });

      expect(out.messages).toHaveLength(2);
      expect(out.beatsDone).toBe(1);
      expect(out.status).toBe('done');
      expect((await messagesForRun(tx, run.id)).map((m) => m.body)).toEqual([
        'eh bentar',
        'lo laper ya?',
      ]);
    }));

  it('quotes on the FIRST bubble of a beat only', () =>
    withRollback(async (tx) => {
      // Two bubbles quoting one message renders the same stub twice, which reads as
      // the reader repeating himself.
      const userId = await makeUser(tx, 'quoteonce');
      const asked = await insertMessage(tx, {
        userId,
        author: 'user',
        body: 'ayam atau ikan?',
        locale: 'id',
      });
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      await claimRun(tx, userId, 'o');
      await writeBeatSheet(tx, {
        runId: run.id,
        owner: 'o',
        sheet: SHEET(1),
        planModel: 'glm-5.2',
        planSource: 'model',
        locale: 'id',
      });
      await claimRun(tx, userId, 'o2');

      const out = await completeBeat(tx, {
        runId: run.id,
        userId,
        owner: 'o2',
        expectedBeatsDone: 0,
        totalBeats: 1,
        beatIndex: 0,
        author: 'adrian',
        locale: 'id',
        bodies: ['ayam.', 'jelas.'],
        replyToMessageId: asked.id,
        model: 'glm-5.2',
      });

      expect(out.messages.map((m) => m.replyToMessageId)).toEqual([asked.id, null]);
    }));

  it("moves the thread's reader cursor in the SAME transaction as the bubble", () =>
    withRollback(async (tx) => {
      /*
       * `readings.shared_at`'s rule. F5's eligibility predicate reads the denormalised
       * cursor instead of joining, so a cursor that could lag its own message would
       * make a proactive run fire against a room that had just been spoken in.
       */
      const userId = await makeUser(tx, 'cursor');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      await claimRun(tx, userId, 'o');
      await writeBeatSheet(tx, {
        runId: run.id,
        owner: 'o',
        sheet: SHEET(1),
        planModel: 'glm-5.2',
        planSource: 'model',
        locale: 'id',
      });
      await claimRun(tx, userId, 'o2');
      await completeBeat(tx, {
        runId: run.id,
        userId,
        owner: 'o2',
        expectedBeatsDone: 0,
        totalBeats: 1,
        beatIndex: 0,
        author: 'margaret',
        locale: 'id',
        bodies: ['ya.'],
        model: 'glm-5.2',
      });

      expect((await getThread(tx, userId))?.lastReaderMessageAt).not.toBeNull();
    }));

  it('rolls the insert back when beats_done is stale, storing NOTHING', () =>
    withRollback(async (tx) => {
      /*
       * **THE SECOND ASSERTION IS THE ONE THAT MATTERS.** Without it the test passes
       * on an implementation that inserts and then throws — which is exactly the bug:
       * a bubble in the room from a beat the run does not think it executed.
       */
      const userId = await makeUser(tx, 'stale');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      await claimRun(tx, userId, 'o');
      await writeBeatSheet(tx, {
        runId: run.id,
        owner: 'o',
        sheet: SHEET(2),
        planModel: 'glm-5.2',
        planSource: 'model',
        locale: 'id',
      });
      await claimRun(tx, userId, 'o2');
      await completeBeat(tx, {
        runId: run.id,
        userId,
        owner: 'o2',
        expectedBeatsDone: 0,
        totalBeats: 2,
        beatIndex: 0,
        author: 'thessaly',
        locale: 'id',
        bodies: ['satu'],
        model: 'glm-5.2',
      });

      await claimRun(tx, userId, 'o3');
      await expect(
        completeBeat(tx, {
          runId: run.id,
          userId,
          owner: 'o3',
          expectedBeatsDone: 0, // stale: the row already reads 1
          totalBeats: 2,
          beatIndex: 1,
          author: 'adrian',
          locale: 'id',
          bodies: ['dua'],
          model: 'glm-5.2',
        }),
      ).rejects.toBeInstanceOf(LeaseLostError);

      expect((await messagesForRun(tx, run.id)).map((m) => m.body)).toEqual(['satu']);
    }));

  it('abandons without a bubble, indistinguishably from silence ([C-R7])', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'abandon');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      await finishRun(tx, run.id, 'abandoned', 'all_beats_failed');

      const [row] = await tx
        .select({ status: chatRuns.status, kind: chatRuns.errorKind })
        .from(chatRuns)
        .where(sql`id = ${run.id}`);
      expect(row).toEqual({ status: 'abandoned', kind: 'all_beats_failed' });
      expect(await messagesForRun(tx, run.id)).toEqual([]);
    }));

  it('de-duplicates a proactive run on material_key, as a CONSTRAINT', () =>
    withRollback(async (tx) => {
      /*
       * A check-then-insert is a race two tabs and a cron will win. `insertRun`
       * returns `null` on the collision rather than throwing, which is what makes
       * F5's suppression rule a read of the return value rather than a second query.
       */
      const userId = await makeUser(tx, 'material');
      const first = await insertRun(tx, {
        userId,
        trigger: 'idle_nudge',
        locale: 'id',
        materialKey: 'card:the-moon:w32',
      });
      expect(first).not.toBeNull();

      const second = await insertRun(tx, {
        userId,
        trigger: 'idle_nudge',
        locale: 'id',
        materialKey: 'card:the-moon:w32',
      });
      expect(second).toBeNull();
    }));

  it('lets many runs share a NULL material_key', () =>
    withRollback(async (tx) => {
      // **DO NOT "FIX" THE INDEX TO `nulls not distinct`** — that would collapse every
      // non-proactive run into one row. V7's `share_links` trap points the other way.
      const userId = await makeUser(tx, 'nullmaterial');
      for (let i = 0; i < 3; i++) {
        const r = await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' });
        expect(r).not.toBeNull();
        await finishRun(tx, r!.id, 'done');
      }
    }));

  it("answers F5's suppression question (seam S5)", () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'suppress');
      const [reading] = await tx
        .insert(readings)
        .values({
          userId,
          readerId: 'adrian',
          serviceId: 'spread3',
          locale: 'id',
          localDate: '2026-08-07',
          status: 'ok',
          promptVersion: 'x',
          model: 'glm-4.6',
        })
        .returning({ id: readings.id });

      expect(await runExistsForReading(tx, userId, reading.id)).toBe(false);
      await insertRun(tx, {
        userId,
        trigger: 'reading_completed',
        locale: 'id',
        triggerReadingId: reading.id,
      });
      expect(await runExistsForReading(tx, userId, reading.id)).toBe(true);
    }));
});

describe("F5's unanswered-ask material reads the DECLARED intent", () => {
  it('finds a reader ask nobody answered', () =>
    withRollback(async (tx) => {
      /*
       * **INFERRING A QUESTION FROM A `?` IS THE BARE-`lagi` TRAP IN A NEW PLACE** — a
       * pattern that fires on most sentences of casual writing and reports a rate that
       * is entirely noise. Here the noise would decide whether somebody gets messaged.
       */
      const userId = await makeUser(tx, 'ask');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      await insertMessage(tx, {
        userId,
        author: 'thessaly',
        body: 'emang nenek kamu meninggalnya kapan',
        locale: 'id',
        runId: run.id,
        beatIndex: 0,
        intent: 'ask',
      });

      expect((await lastUnansweredAsk(tx, userId))?.intent).toBe('ask');
    }));

  it('goes quiet once the querent has said anything at all', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'answered');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      await insertMessage(tx, {
        userId,
        author: 'thessaly',
        body: 'kapan?',
        locale: 'id',
        runId: run.id,
        beatIndex: 0,
        intent: 'ask',
      });
      await insertMessage(tx, { userId, author: 'user', body: 'tahun lalu', locale: 'id' });

      expect(await lastUnansweredAsk(tx, userId)).toBeNull();
    }));

  it('ignores a reader bubble that merely ends in a question mark', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'noask');
      const run = (await insertRun(tx, { userId, trigger: 'user_message', locale: 'id' }))!;
      await insertMessage(tx, {
        userId,
        author: 'adrian',
        body: 'lah kok gitu?',
        locale: 'id',
        runId: run.id,
        beatIndex: 0,
        intent: 'react',
      });
      expect(await lastUnansweredAsk(tx, userId)).toBeNull();
    }));
});

describe('lastMessageAt', () => {
  it('is null in an empty room and moves with the newest bubble', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'last');
      expect(await lastMessageAt(tx, userId)).toBeNull();
      await insertMessage(tx, { userId, author: 'user', body: 'halo', locale: 'id' });
      expect(await lastMessageAt(tx, userId)).toBeInstanceOf(Date);
    }));
});

/**
 * ── THE LEASE RACE. THE ONE TEST IN THIS WORKSTREAM THAT MUST NOT BE SIMPLIFIED ──
 *
 * **IT CANNOT USE `withRollback`.** The harness's rolled-back transaction is a SINGLE
 * transaction, and a lease race needs **two connections that can see each other's
 * commits**. So this block uses `resetDb()` — the documented escape hatch *"for code
 * that commits its own transaction"* — and opens a second postgres.js handle against
 * `TEST_DATABASE_URL`.
 *
 * **IT ASSERTS THE MESSAGE COUNT, NOT THE RUN'S STATUS**, for `tee.ts`'s reason: the
 * cancel test asserts `errorKind` and not only `status` precisely because the status
 * is the thing that looks right while the interesting fact is wrong. **A run at
 * `beats_done = 1` with TWO messages is the exact bug `C-R3` names, and only the count
 * sees it.**
 */
describe('the lease, across two real connections', () => {
  const url = process.env.TEST_DATABASE_URL!;
  const second = postgres(url, { max: 3, onnotice: () => {} });
  const otherDb = drizzle(second, { schema }) as unknown as Db;

  afterAll(async () => {
    await second.end();
  });

  /** A committed user, thread and running two-beat run. Returns its ids. */
  async function seedRunningRun(tag: string) {
    await resetDb();
    const userId = await makeUser(testDb, tag);
    const [run] = await testDb
      .insert(chatRuns)
      .values({
        userId,
        trigger: 'user_message',
        locale: 'id',
        status: 'running',
        beats: SHEET(2),
        beatsDone: 0,
      })
      .returning({ id: chatRuns.id });
    return { userId, runId: run.id };
  }

  it('lets exactly ONE of two concurrent claims through, and stores ONE message', async () => {
    const { userId, runId } = await seedRunningRun('race');

    const [a, b] = await Promise.all([
      claimRun(testDb, userId, 'owner-A'),
      claimRun(otherDb, userId, 'owner-B'),
    ]);

    const winners = [a, b].filter(Boolean);
    expect(winners, 'exactly one claim may return a row').toHaveLength(1);

    const owner = a ? 'owner-A' : 'owner-B';
    const handle = a ? testDb : otherDb;
    const loser = a ? otherDb : testDb;
    const loserOwner = a ? 'owner-B' : 'owner-A';

    await completeBeat(handle, {
      runId,
      userId,
      owner,
      expectedBeatsDone: 0,
      totalBeats: 2,
      beatIndex: 0,
      author: 'thessaly',
      locale: 'id',
      bodies: ['aku duluan'],
      model: 'glm-5.2',
    });

    // The loser holds no lease, so its write must roll back entirely.
    await expect(
      completeBeat(loser, {
        runId,
        userId,
        owner: loserOwner,
        expectedBeatsDone: 0,
        totalBeats: 2,
        beatIndex: 0,
        author: 'adrian',
        locale: 'id',
        bodies: ['aku juga'],
        model: 'glm-5.2',
      }),
    ).rejects.toBeInstanceOf(LeaseLostError);

    const [{ n: count }] = await testDb
      .select({ n: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(sql`run_id = ${runId}`);
    expect(count, 'THE SAME BUBBLE MUST NOT APPEAR TWICE').toBe(1);

    const [row] = await testDb
      .select({ done: chatRuns.beatsDone, status: chatRuns.status })
      .from(chatRuns)
      .where(sql`id = ${runId}`);
    expect(row).toEqual({ done: 1, status: 'running' });
  });

  it('reclaims an EXPIRED lease', async () => {
    const { userId, runId } = await seedRunningRun('expired');
    await testDb.execute(
      sql`update chat_runs set lease_until = now() - interval '1 minute',
                               lease_owner = 'dead-lambda' where id = ${runId}`,
    );

    // A lambda killed mid-beat must not lock the room until somebody notices, and
    // `[F1-1]` is what makes reclaiming safe: at worst a beat whose message was never
    // committed runs again.
    expect(await claimRun(testDb, userId, 'fresh')).not.toBeNull();
  });

  it('does NOT reclaim a LIVE lease held by a COMMITTED holder', async () => {
    /*
     * **THIS IS THE CASE `for update skip locked` ALONE DOES NOT COVER**, and it is
     * the common one: two tabs a second apart rather than in the same millisecond. A
     * lease held by a committed transaction is not a locked row.
     *
     * **DELETING THE `lease_until < now()` PREDICATE MUST TURN THIS RED.**
     */
    const { userId, runId } = await seedRunningRun('live');
    await testDb.execute(
      sql`update chat_runs set lease_until = now() + interval '90 seconds',
                               lease_owner = 'still-working' where id = ${runId}`,
    );

    expect(await claimRun(otherDb, userId, 'interloper')).toBeNull();
  });

  it('releases without advancing, which is what a shed does ([F1-6])', async () => {
    const { userId, runId } = await seedRunningRun('shed');
    const claimed = await claimRun(testDb, userId, 'shedder');
    expect(claimed).not.toBeNull();

    await releaseLease(testDb, runId, 'shedder');

    // Nothing was written, nothing was abandoned, and the next visit picks it up.
    const [row] = await testDb
      .select({ done: chatRuns.beatsDone, status: chatRuns.status, kind: chatRuns.errorKind })
      .from(chatRuns)
      .where(sql`id = ${runId}`);
    expect(row).toEqual({ done: 0, status: 'running', kind: null });
    expect(await claimRun(otherDb, userId, 'next-visit')).not.toBeNull();
  });

  it('drains the OLDEST run first, in the order the room happened', async () => {
    await resetDb();
    const userId = await makeUser(testDb, 'order');
    const [older] = await testDb
      .insert(chatRuns)
      .values({
        userId,
        trigger: 'reading_completed',
        locale: 'id',
        status: 'pending',
        createdAt: new Date(Date.now() - 60_000),
      })
      .returning({ id: chatRuns.id });
    await testDb
      .insert(chatRuns)
      .values({ userId, trigger: 'user_message', locale: 'id', status: 'pending' });

    expect((await claimRun(testDb, userId, 'o'))?.id).toBe(older.id);
  });

  it('cascades the whole room away with the account', async () => {
    /*
     * `[F1-D10]`'s audit, at the table level. **`chat_messages.user_id` MUST STAY
     * `on delete cascade`** — the day somebody changes it to `set null` "to keep the
     * analytics", a redaction obligation arrives with it and `/privacy` clause 8
     * stops being true. `delete.integration.test.ts` carries the same assertion named
     * for the promise rather than for the mechanism.
     */
    const { userId } = await seedRunningRun('cascade');
    await insertMessage(testDb, { userId, author: 'user', body: 'halo', locale: 'id' });
    await upsertThread(testDb, userId, { lastUserMessageAt: new Date() });

    await testDb.delete(users).where(sql`id = ${userId}`);

    for (const table of [chatThreads, chatMessages, chatRuns]) {
      const [{ n: left }] = await testDb
        .select({ n: sql<number>`count(*)::int` })
        .from(table)
        .where(sql`user_id = ${userId}`);
      expect(left).toBe(0);
    }
  });
});
