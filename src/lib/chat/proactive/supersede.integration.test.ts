/**
 * Seam `S5` (§9.6). **The four negative controls FAIL BY ACCEPTING**, which is V7's
 * `unique nulls not distinct` tests' shape: each is named for the outcome rather than for
 * the mechanism, because a suppression rule that suppresses too much is invisible in a
 * green suite and shows up as a room that stopped answering.
 */
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { chatRuns, readingCards, readings, users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Db, Tx } from '@/lib/db/types';
import { supersedeReadingRun } from './supersede';

config({ path: '.env.local', quiet: true });

afterAll(closeTestDb);

const NOW = new Date('2026-08-07T12:00:00.000Z');
let n = 0;

async function makeUser(tx: Tx | Db): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `f5s:${n}`, email: `f5s${n}@example.com` })
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
      model: 'test',
      promptVersion: 'test',
      localDate: '2026-08-07',
      createdAt: NOW,
    })
    .returning({ id: readings.id });
  await tx
    .insert(readingCards)
    .values({ readingId: row.id, userId, cardId: 18, reversed: false, position: 0, localDate: '2026-08-07' });
  return row.id;
}

async function makeRun(
  tx: Tx | Db,
  userId: string,
  over: Partial<typeof chatRuns.$inferInsert> = {},
): Promise<string> {
  const [row] = await tx
    .insert(chatRuns)
    .values({ userId, trigger: 'reading_completed', locale: 'id', status: 'pending', ...over })
    .returning({ id: chatRuns.id });
  return row.id;
}

async function statusOf(tx: Tx | Db, runId: string): Promise<string> {
  const [row] = await tx
    .select({ status: chatRuns.status })
    .from(chatRuns)
    .where(eq(chatRuns.id, runId))
    .limit(1);
  return row.status;
}

describe('supersedeReadingRun', () => {
  it('abandons a pending reading_completed run for that reading', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx);
      const readingId = await makeReading(tx, userId);
      const runId = await makeRun(tx, userId, { triggerReadingId: readingId });

      expect(await supersedeReadingRun(tx, userId, readingId)).toBe(1);
      expect(await statusOf(tx, runId)).toBe('abandoned');
    }));

  it('DOES NOT abandon a run that is already speaking (§9.5)', () =>
    withRollback(async (tx) => {
      /*
       * A bubble that has been stored cannot be un-said — `chat_messages` is append-only,
       * and deleting one would be the first delete path into that table. The querent then
       * attaches a reading a reader is already talking about, **which reads as them
       * joining a conversation already underway, because that is what it is.**
       */
      const userId = await makeUser(tx);
      const readingId = await makeReading(tx, userId);
      const runId = await makeRun(tx, userId, { triggerReadingId: readingId, status: 'running' });

      expect(await supersedeReadingRun(tx, userId, readingId)).toBe(0);
      expect(await statusOf(tx, runId)).toBe('running');
    }));

  it('DOES NOT abandon a run somebody is holding the lease on (C-R3)', () =>
    withRollback(async (tx) => {
      /* A `planning` run is mid-`chat_plan`; killing it leaves a model call in flight
       * whose result writes to an abandoned row. */
      const userId = await makeUser(tx);
      const readingId = await makeReading(tx, userId);
      const runId = await makeRun(tx, userId, {
        triggerReadingId: readingId,
        leaseUntil: new Date(Date.now() + 60_000),
        leaseOwner: 'somebody-else',
      });

      expect(await supersedeReadingRun(tx, userId, readingId)).toBe(0);
      expect(await statusOf(tx, runId)).toBe('pending');
    }));

  it('DOES NOT abandon a run for a DIFFERENT reading', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx);
      const attached = await makeReading(tx, userId);
      const other = await makeReading(tx, userId);
      const runId = await makeRun(tx, userId, { triggerReadingId: other });

      expect(await supersedeReadingRun(tx, userId, attached)).toBe(0);
      expect(await statusOf(tx, runId)).toBe('pending');
    }));

  it('DOES NOT abandon a run belonging to a DIFFERENT querent', () =>
    withRollback(async (tx) => {
      /*
       * **The security shape of this query**, and the reason `user_id` is in the `WHERE`
       * at all even though `trigger_reading_id` is already unique enough. Without it, a
       * posted reading id would reach into a stranger's room and silence a run they were
       * waiting on.
       */
      const mine = await makeUser(tx);
      const theirs = await makeUser(tx);
      const readingId = await makeReading(tx, theirs);
      const runId = await makeRun(tx, theirs, { triggerReadingId: readingId });

      expect(await supersedeReadingRun(tx, mine, readingId)).toBe(0);
      expect(await statusOf(tx, runId)).toBe('pending');
    }));

  it('DOES NOT abandon a user_message run for the same reading', () =>
    withRollback(async (tx) => {
      /* The attach's OWN run is a `user_message` run, and it must survive the call made
       * moments before it is minted. */
      const userId = await makeUser(tx);
      const readingId = await makeReading(tx, userId);
      const runId = await makeRun(tx, userId, {
        trigger: 'user_message',
        triggerReadingId: readingId,
      });

      expect(await supersedeReadingRun(tx, userId, readingId)).toBe(0);
      expect(await statusOf(tx, runId)).toBe('pending');
    }));
});
