/**
 * `refillReading`, against a real database.
 *
 * **ITS OWN FILE, NOT AN APPENDIX TO `history.v6.integration.test.ts`**, which is
 * about the three READS and shares a fixture built for them. This is about one
 * WRITE, and nearly every assertion here is about what did NOT change -- which is
 * a different kind of test and reads badly interleaved with the other kind.
 *
 * ON CONCURRENCY, HONESTLY: `withRollback` runs inside ONE transaction on ONE
 * connection, so a true race cannot be staged here. What IS staged is the
 * double-submit -- the same predicate resolving the same way twice -- which is
 * the mechanism a real race resolves with. The test that matters is
 * 'writes once for two attempts'.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { readingCards, readings, users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { ReadingStatus } from '@/data/types';
import type { Tx } from '@/lib/db/types';
import { insertReading, refillReading, type ReadingRefill } from './history';

afterAll(closeTestDb);

const DAY = '2026-08-28';

async function makeUser(tx: Tx, sub: string): Promise<string> {
  const [u] = await tx
    .insert(users)
    .values({ googleSub: sub, email: `${sub}@example.com` })
    .returning();
  return u.id;
}

/** An unfinished reading with a real three-card draw, unless told otherwise. */
async function unfinished(
  tx: Tx,
  userId: string,
  o: { body?: string | null; status?: ReadingStatus; cards?: [number, boolean, number][] } = {},
): Promise<string> {
  const row = await insertReading(
    tx,
    {
      userId,
      readerId: 'thessaly',
      serviceId: 'spread3',
      locale: 'id',
      model: 'first-attempt',
      promptVersion: 'id-v1.aaaaaaaa',
      localDate: DAY,
      question: 'apakah aku harus pindah kerja?',
      status: o.status ?? 'failed',
      body: o.body === undefined ? null : o.body,
    },
    (
      o.cards ?? [
        [16, false, 0],
        [9, true, 1],
        [6, false, 2],
      ]
    ).map(([cardId, reversed, position]) => ({ cardId, reversed, position })),
  );
  return row.id;
}

const FILL: ReadingRefill = {
  status: 'ok',
  body: 'Kartu-kartu berbicara tentang perpindahan.',
  choice: null,
  verdict: null,
  model: 'second-attempt',
  promptVersion: 'id-v1.bbbbbbbb',
  latencyMs: 1234,
  tokenInput: 900,
  tokenOutput: 300,
};

async function readRow(tx: Tx, id: string) {
  const [row] = await tx.select().from(readings).where(eq(readings.id, id)).limit(1);
  return row;
}

describe('refillReading', () => {
  it('fills a failed reading and moves ONLY the generated columns', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:refill-ok');
      const id = await unfinished(tx, userId);
      const before = await readRow(tx, id);

      expect(await refillReading(tx, userId, id, FILL)).toBe(1);

      const after = await readRow(tx, id);

      // Moved.
      expect(after.body).toBe(FILL.body);
      expect(after.status).toBe('ok');
      expect(after.model).toBe('second-attempt');
      expect(after.promptVersion).toBe('id-v1.bbbbbbbb');
      expect(after.latencyMs).toBe(1234);
      expect(after.tokenInput).toBe(900);
      expect(after.tokenOutput).toBe(300);

      // Did not move (invariant 7), column by column. `created_at` is on this
      // list because a bumped one silently reorders the querent's own history
      // around a retry.
      expect(after.id).toBe(before.id);
      expect(after.userId).toBe(before.userId);
      expect(after.readerId).toBe(before.readerId);
      expect(after.serviceId).toBe(before.serviceId);
      expect(after.question).toBe(before.question);
      expect(after.locale).toBe(before.locale);
      expect(after.localDate).toBe(before.localDate);
      expect(after.sessionId).toBe(before.sessionId);
      expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
      expect(after.sharedAt).toBe(before.sharedAt);
      expect(after.gist).toBe(before.gist);
    });
  });

  it('never touches reading_cards', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:refill-cards');
      const id = await unfinished(tx, userId);

      const read = async () =>
        tx
          .select({
            cardId: readingCards.cardId,
            reversed: readingCards.reversed,
            position: readingCards.position,
            localDate: readingCards.localDate,
          })
          .from(readingCards)
          .where(eq(readingCards.readingId, id))
          .orderBy(readingCards.position);

      const before = await read();
      expect(before).toEqual([
        { cardId: 16, reversed: false, position: 0, localDate: DAY },
        { cardId: 9, reversed: true, position: 1, localDate: DAY },
        { cardId: 6, reversed: false, position: 2, localDate: DAY },
      ]);

      await refillReading(tx, userId, id, FILL);

      expect(await read()).toEqual(before);
    });
  });

  it('refuses a reading that already has prose', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:refill-hasbody');
      const id = await unfinished(tx, userId, { body: 'sudah ada prosa', status: 'partial' });

      expect(await refillReading(tx, userId, id, FILL)).toBe(0);

      const row = await readRow(tx, id);
      expect(row.body).toBe('sudah ada prosa');
      expect(row.status).toBe('partial');
      expect(row.model).toBe('first-attempt');
    });
  });

  it('refuses a soft-deleted reading', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:refill-deleted');
      const id = await unfinished(tx, userId);
      await tx.update(readings).set({ deletedAt: new Date() }).where(eq(readings.id, id));

      expect(await refillReading(tx, userId, id, FILL)).toBe(0);
      expect((await readRow(tx, id)).body).toBeNull();
    });
  });

  it('refuses a blocked reading, which also has no prose', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:refill-blocked');
      const id = await unfinished(tx, userId, { status: 'blocked', cards: [] });

      expect(await refillReading(tx, userId, id, FILL)).toBe(0);

      const row = await readRow(tx, id);
      expect(row.body).toBeNull();
      expect(row.status).toBe('blocked');
    });
  });

  it("refuses another user's reading", async () => {
    await withRollback(async (tx) => {
      const owner = await makeUser(tx, 'dev:refill-owner');
      const stranger = await makeUser(tx, 'dev:refill-stranger');
      const id = await unfinished(tx, owner);

      expect(await refillReading(tx, stranger, id, FILL)).toBe(0);
      expect((await readRow(tx, id)).body).toBeNull();
    });
  });

  it('writes once for two attempts', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:refill-twice');
      const id = await unfinished(tx, userId);

      const first = await refillReading(tx, userId, id, FILL);
      const second = await refillReading(tx, userId, id, {
        ...FILL,
        body: 'bacaan kedua yang berbeda',
        model: 'third-attempt',
      });

      expect([first, second]).toEqual([1, 0]);

      const row = await readRow(tx, id);
      expect(row.body).toBe(FILL.body);
      expect(row.model).toBe('second-attempt');
    });
  });

  it('leaves the row retryable when the retry also produced nothing', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:refill-failed-again');
      const id = await unfinished(tx, userId);

      expect(
        await refillReading(tx, userId, id, {
          ...FILL,
          status: 'failed',
          body: null,
          latencyMs: null,
          tokenInput: null,
          tokenOutput: null,
        }),
      ).toBe(1);

      const row = await readRow(tx, id);
      expect(row.body).toBeNull();
      expect(row.status).toBe('failed');

      // Still eligible: the guard is `body is null`, which still holds.
      expect(await refillReading(tx, userId, id, FILL)).toBe(1);
    });
  });

  it('answers a malformed uuid with zero and no driver error', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:refill-badid');
      await expect(refillReading(tx, userId, 'banana', FILL)).resolves.toBe(0);
    });
  });

  it('answers an absent reading with zero', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:refill-absent');
      expect(
        await refillReading(tx, userId, '00000000-0000-4000-8000-000000000000', FILL),
      ).toBe(0);
    });
  });
});
