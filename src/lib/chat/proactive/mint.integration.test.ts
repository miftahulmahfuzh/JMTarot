/**
 * The mint (Task 4). **The day counter, the constraint, the soft delete, and §9.6's
 * counter assertion.**
 *
 * The two cases that matter most are the ones that fail by ACCEPTING: a second run for
 * one material, and a counter that moved on a mint that never happened. Both are
 * invisible in a green suite otherwise — the first shows up as a reader saying the same
 * thing twice, the second as a querent whose readers go quiet for the rest of the day.
 */
import { config } from 'dotenv';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  chatMessages,
  chatRuns,
  chatThreads,
  readingCards,
  readings,
  users,
} from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Db, Tx } from '@/lib/db/types';
import { upsertThread } from '@/lib/db/queries/chat';
import { bumpProactiveCount, mintProactiveRun } from './mint';
import { mintOnReadingCompleted } from './onReading';

config({ path: '.env.local', quiet: true });

afterAll(closeTestDb);

const TODAY = '2026-08-07';
let n = 0;

beforeEach(() => {
  delete process.env.CHAT_PROACTIVE_ENABLED;
  delete process.env.CHAT_ENABLED;
  delete process.env.CHAT_PROACTIVE_MAX_PER_DAY;
});

async function makeUser(tx: Tx | Db): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `f5m:${n}`, email: `f5m${n}@example.com`, locale: 'id' })
    .returning({ id: users.id });
  return user.id;
}

async function makeReading(tx: Tx | Db, userId: string): Promise<string> {
  const [row] = await tx
    .insert(readings)
    .values({
      userId,
      readerId: 'thessaly',
      serviceId: 'spread3',
      locale: 'id',
      status: 'ok',
      body: 'empat paragraf',
      gist: 'kerjaan numpuk',
      model: 'test',
      promptVersion: 'test',
      localDate: TODAY,
    })
    .returning({ id: readings.id });
  await tx
    .insert(readingCards)
    .values({ readingId: row.id, userId, cardId: 18, reversed: false, position: 0, localDate: TODAY });
  return row.id;
}

async function threadOf(tx: Tx | Db, userId: string) {
  const [row] = await tx
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.userId, userId))
    .limit(1);
  return row ?? null;
}

async function runsOf(tx: Tx | Db, userId: string) {
  return tx.select().from(chatRuns).where(eq(chatRuns.userId, userId));
}

describe('mintProactiveRun', () => {
  it('mints a reading_completed run and stamps the day counter', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx);
      const readingId = await makeReading(tx, userId);

      const result = await mintProactiveRun({
        userId,
        source: 'reading',
        localDate: TODAY,
        readingId,
        handle: tx,
      });

      expect(result).toMatchObject({ minted: true, trigger: 'reading_completed', kind: 'reading' });
      const [run] = await runsOf(tx, userId);
      expect(run.trigger).toBe('reading_completed');
      expect(run.status).toBe('pending');
      expect(run.triggerReadingId).toBe(readingId);
      expect(run.materialKey).toBe(`reading:${readingId}`);

      const thread = await threadOf(tx, userId);
      expect(thread?.proactiveCountToday).toBe(1);
      /* **A STRING, NEVER A `Date`** — the querent's calendar day (`[F5-3]`). */
      expect(thread?.proactiveCountDate).toBe(TODAY);
      expect(typeof thread?.proactiveCountDate).toBe('string');
      expect(thread?.lastProactiveAt).not.toBeNull();
    }));

  it('creates the thread row when the querent has never opened the room', () =>
    withRollback(async (tx) => {
      /*
       * The first proactive run of a querent's life is usually the one minted by their
       * first reading, **before they have ever opened the room** — so a bare `UPDATE`
       * would match zero rows and be indistinguishable from a spent cap. The feature
       * would never start.
       */
      const userId = await makeUser(tx);
      const readingId = await makeReading(tx, userId);
      expect(await threadOf(tx, userId)).toBeNull();

      const result = await mintProactiveRun({
        userId,
        source: 'reading',
        localDate: TODAY,
        readingId,
        handle: tx,
      });
      expect(result.minted).toBe(true);
      expect((await threadOf(tx, userId))?.proactiveCountToday).toBe(1);
    }));

  it('NEVER MINTS FOR A SOFT-DELETED ACCOUNT ([F5-15])', () =>
    withRollback(async (tx) => {
      /* The thirty-day grace exists so somebody can change their mind. Messaging them
       * during it is the app arguing with a decision they made. */
      const userId = await makeUser(tx);
      const readingId = await makeReading(tx, userId);
      await tx.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));

      const result = await mintProactiveRun({
        userId,
        source: 'reading',
        localDate: TODAY,
        readingId,
        handle: tx,
      });
      expect(result).toEqual({ minted: false, reason: 'erased' });
      expect(await runsOf(tx, userId)).toHaveLength(0);
      /* AND THE COUNTER DID NOT MOVE. */
      expect(await threadOf(tx, userId)).toBeNull();
    }));

  it('refuses while a run is in flight, and the counter does not move', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx);
      await makeReading(tx, userId);
      await tx
        .insert(chatRuns)
        .values({ userId, trigger: 'user_message', locale: 'id', status: 'running' });

      const result = await mintProactiveRun({
        userId,
        source: 'tick',
        localDate: TODAY,
        handle: tx,
      });
      expect(result).toEqual({ minted: false, reason: 'open_run' });
      expect(await threadOf(tx, userId)).toBeNull();
    }));

  it('refuses with no material and writes nothing (C-N2e)', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx);
      const result = await mintProactiveRun({
        userId,
        source: 'tick',
        localDate: TODAY,
        handle: tx,
      });
      expect(result).toEqual({ minted: false, reason: 'no_material' });
      expect(await runsOf(tx, userId)).toHaveLength(0);
    }));

  it('refuses when CHAT_PROACTIVE_ENABLED is exactly "0", and not for "false"', () =>
    withRollback(async (tx) => {
      /*
       * `ANALYTICS_ENABLED`'s rule: **only the exact string `'0'` disables**, so a typo
       * leaves the feature ON rather than silently costing every querent a feature with
       * nothing anywhere reporting it.
       */
      const userId = await makeUser(tx);
      const readingId = await makeReading(tx, userId);

      process.env.CHAT_PROACTIVE_ENABLED = 'false';
      expect(
        (await mintProactiveRun({ userId, source: 'reading', localDate: TODAY, readingId, handle: tx }))
          .minted,
      ).toBe(true);

      await tx.delete(chatRuns).where(eq(chatRuns.userId, userId));
      process.env.CHAT_PROACTIVE_ENABLED = '0';
      expect(
        await mintProactiveRun({ userId, source: 'reading', localDate: TODAY, readingId, handle: tx }),
      ).toEqual({ minted: false, reason: 'flag_off' });
    }));
});

describe('the daily cap ([F5-13], §6.4)', () => {
  it('spends the cap and then refuses, with the counter as the arbiter', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx);
      process.env.CHAT_PROACTIVE_MAX_PER_DAY = '1';
      const readingId = await makeReading(tx, userId);

      expect(
        (await mintProactiveRun({ userId, source: 'reading', localDate: TODAY, readingId, handle: tx }))
          .minted,
      ).toBe(true);
      /* Finish the run so `open_run` is not the refusal we measure. */
      await tx.update(chatRuns).set({ status: 'done' }).where(eq(chatRuns.userId, userId));

      const second = await makeReading(tx, userId);
      expect(
        await mintProactiveRun({
          userId,
          source: 'reading',
          localDate: TODAY,
          readingId: second,
          handle: tx,
        }),
      ).toEqual({ minted: false, reason: 'daily_cap' });
      expect(await runsOf(tx, userId)).toHaveLength(1);
    }));

  it('rolls the counter over on the querent’s next calendar day', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx);
      process.env.CHAT_PROACTIVE_MAX_PER_DAY = '1';
      await upsertThread(tx, userId, {
        proactiveCountToday: 9,
        proactiveCountDate: '2026-08-06',
      });
      const readingId = await makeReading(tx, userId);

      const result = await mintProactiveRun({
        userId,
        source: 'reading',
        localDate: TODAY,
        readingId,
        handle: tx,
      });
      expect(result.minted).toBe(true);
      const thread = await threadOf(tx, userId);
      expect(thread?.proactiveCountToday).toBe(1);
      expect(thread?.proactiveCountDate).toBe(TODAY);
    }));

  it('checks and increments in ONE statement, which is the lease’s shape', () =>
    withRollback(async (tx) => {
      /*
       * `[F5-13]`'s race, stated: *two `after()` callbacks on two lambdas both read
       * `count = 1`, both mint, and the cap is 3.* The `where` clause is the enforcement
       * and the predicate's own `daily_cap` branch is only an optimisation.
       */
      const userId = await makeUser(tx);
      const args = { userId, localDate: TODAY, maxPerDay: 2, now: new Date() };
      expect(await bumpProactiveCount(tx, args)).toBe(1);
      expect(await bumpProactiveCount(tx, args)).toBe(2);
      /* Zero rows returned. Not an error — the mint is abandoned and logged. */
      expect(await bumpProactiveCount(tx, args)).toBeNull();
    }));
});

describe('the material_key constraint', () => {
  it('FAILS BY ACCEPTING A SECOND ROW: one material, one run, forever', () =>
    withRollback(async (tx) => {
      /*
       * §4.5: **a unique constraint and not a check-then-insert**, because the mint runs
       * from three entry points on three lambdas and *"has this material been used"*
       * asked before an insert is a race with a millisecond window. This test is the
       * negative control and it is named for the outcome.
       */
      const userId = await makeUser(tx);
      await upsertThread(tx, userId, {});
      await tx
        .insert(chatRuns)
        .values({
          userId,
          trigger: 'cron',
          locale: 'id',
          status: 'done',
          materialKey: 'occasion:birthday:2026',
        });

      await expect(
        tx.insert(chatRuns).values({
          userId,
          trigger: 'cron',
          locale: 'id',
          status: 'done',
          materialKey: 'occasion:birthday:2026',
        }),
      ).rejects.toThrow();
    }));

  it('leaves NULL keys distinct, so a querent may post more than once', () =>
    withRollback(async (tx) => {
      /*
       * **DO NOT "FIX" THE INDEX TO `nulls not distinct`.** V7's `share_links` trap points
       * the other way here: every `user_message` run has a NULL key, and treating NULLs as
       * equal would permit exactly one per querent forever — presenting as the chat
       * silently refusing to answer anybody after their first message.
       */
      const userId = await makeUser(tx);
      for (let i = 0; i < 3; i += 1) {
        await tx
          .insert(chatRuns)
          .values({ userId, trigger: 'user_message', locale: 'id', status: 'done' });
      }
      expect(await runsOf(tx, userId)).toHaveLength(3);
    }));
});

describe('mintOnReadingCompleted — source 1 (§8, §9.6)', () => {
  it('does not fire for a blocked reading and costs no queries to say so', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx);
      const readingId = await makeReading(tx, userId);
      const result = await mintOnReadingCompleted({
        userId,
        readingId,
        status: 'blocked',
        localDate: TODAY,
        locale: 'id',
      });
      expect(result).toEqual({ minted: false, reason: 'no_material' });
      expect(await runsOf(tx, userId)).toHaveLength(0);
    }));

  it('MINTS NOTHING AND MOVES NO COUNTER for a reading the querent attached (§9.6)', () =>
    withRollback(async (tx) => {
      /*
       * **THE COUNTER ASSERTION IS THE ONE THAT CATCHES A PRE-CHECK PLACED AFTER THE
       * INCREMENT.** A mint that refuses correctly but has already spent the day's budget
       * silences the readers for the rest of the day, and nothing on screen says why.
       */
      const userId = await makeUser(tx);
      const readingId = await makeReading(tx, userId);
      await tx.insert(chatMessages).values({
        userId,
        author: 'user',
        body: 'nih bacaanku barusan',
        locale: 'id',
        attachedReadingId: readingId,
      });

      const result = await mintProactiveRun({
        userId,
        source: 'reading',
        localDate: TODAY,
        readingId,
        handle: tx,
      });
      expect(result).toEqual({ minted: false, reason: 'no_material' });
      expect(
        await tx
          .select()
          .from(chatRuns)
          .where(and(eq(chatRuns.userId, userId), eq(chatRuns.trigger, 'reading_completed'))),
      ).toHaveLength(0);
      expect(await threadOf(tx, userId)).toBeNull();
    }));
});
