/**
 * `recallableReadings` and `setReadingGist` against a real Postgres
 * (W5 plan Task 6).
 *
 * The five filters are the whole point of this file. Each one excludes a
 * reading that would produce a bad callback, and each is a `where` clause that
 * no unit test can reach.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { ReaderId, ServiceId } from '@/data/types';
import type { ReadingStatus } from '@/lib/db/schema';
import type { Tx } from '@/lib/db/types';
import { insertReading, recallableReadings, setReadingGist } from './history';

afterAll(closeTestDb);

const SINCE = '2026-07-12';

async function makeUser(tx: Tx, sub: string): Promise<string> {
  const [u] = await tx
    .insert(users)
    .values({ googleSub: sub, email: `${sub}@example.com` })
    .returning();
  return u.id;
}

type Opts = {
  localDate?: string;
  createdAt?: Date;
  gist?: string | null;
  body?: string | null;
  status?: ReadingStatus;
  question?: string | null;
  readerId?: ReaderId;
  serviceId?: ServiceId;
  cards?: [number, boolean][];
};

async function reading(tx: Tx, userId: string, o: Opts = {}): Promise<string> {
  const row = await insertReading(
    tx,
    {
      userId,
      readerId: o.readerId ?? 'thessaly',
      serviceId: o.serviceId ?? 'daily',
      locale: 'id',
      model: 'test',
      promptVersion: 'id-v1.testtest',
      localDate: o.localDate ?? '2026-07-25',
      /*
       * SET EXPLICITLY WHEN ORDER MATTERS. `created_at` defaults to `now()`,
       * which is TRANSACTION-START time -- and `withRollback` puts the whole
       * test in one transaction, so every row would otherwise share a
       * timestamp and an order-by-created_at assertion would be testing
       * insertion order rather than the query.
       */
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
      body: o.body === undefined ? 'sebuah bacaan' : o.body,
      gist: o.gist === undefined ? 'sesuatu sudah bergeser' : o.gist,
      status: o.status ?? 'ok',
      question: o.question ?? null,
    },
    (o.cards ?? [[8, false]]).map(([cardId, reversed], position) => ({
      cardId,
      reversed,
      position,
    })),
  );
  return row.id;
}

const recall = (tx: Tx, userId: string, over: Partial<Parameters<typeof recallableReadings>[1]> = {}) =>
  recallableReadings(tx, { userId, limit: 2, sinceLocalDate: SINCE, ...over });

describe('the five recall filters', () => {
  it('excludes a reading whose stream died (body is null)', async () => {
    // Nothing was said, so there is nothing to refer back to.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'recall-nobody');
      await reading(tx, userId, { body: null, gist: null });
      expect(await recall(tx, userId)).toEqual([]);
    });
  });

  it('excludes a reading whose gist extraction failed (gist is null)', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'recall-nogist');
      await reading(tx, userId, { gist: null });
      expect(await recall(tx, userId)).toEqual([]);
    });
  });

  it('excludes a blocked reading', async () => {
    // W7 refused the question; the reader never spoke.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'recall-blocked');
      await reading(tx, userId, { status: 'blocked' });
      expect(await recall(tx, userId)).toEqual([]);
    });
  });

  it('excludes anything older than the lookback', async () => {
    // A callback to a reading from five weeks ago is not memory, it is
    // surveillance.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'recall-old');
      await reading(tx, userId, { localDate: '2026-06-01' });
      expect(await recall(tx, userId)).toEqual([]);
    });
  });

  it('excludes the reading being written right now', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'recall-self');
      const id = await reading(tx, userId);
      expect(await recall(tx, userId)).toHaveLength(1);
      expect(await recall(tx, userId, { excludeReadingId: id })).toEqual([]);
    });
  });

  it('keeps a failed reading that still produced a body and a gist', async () => {
    // Reconciliation R7's sibling: a partial reading said something, and what
    // it said is recallable. Only `blocked` is excluded by status.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'recall-partial');
      await reading(tx, userId, { status: 'partial' });
      expect(await recall(tx, userId)).toHaveLength(1);
    });
  });

  it('never sees another user’s readings', async () => {
    await withRollback(async (tx) => {
      const mine = await makeUser(tx, 'recall-mine');
      const theirs = await makeUser(tx, 'recall-theirs');
      await reading(tx, theirs, {});
      expect(await recall(tx, mine)).toEqual([]);
    });
  });
});

describe('what recall returns', () => {
  it('returns the cards, in position order', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'recall-cards');
      await reading(tx, userId, {
        serviceId: 'spread3',
        cards: [
          [16, false],
          [17, true],
          [9, false],
        ],
      });
      const [r] = await recall(tx, userId);
      expect(r.cards).toEqual([
        { cardId: 16, reversed: false },
        { cardId: 17, reversed: true },
        { cardId: 9, reversed: false },
      ]);
    });
  });

  it('reduces the question to a boolean and NEVER returns the text (M11)', async () => {
    /*
     * The recalled question does not reach the prompt layer, and this is where
     * it stops. The gate needs to know whether there WAS one; nothing needs to
     * know what it said.
     */
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'recall-question');
      await reading(tx, userId, { question: 'apakah dia serius denganku' });
      const [r] = await recall(tx, userId);

      expect(r.hadQuestion).toBe(true);
      expect(Object.keys(r)).not.toContain('question');
      expect(JSON.stringify(r)).not.toContain('serius');
    });
  });

  it('treats a whitespace-only question as no question', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'recall-blankq');
      await reading(tx, userId, { question: '   ' });
      expect((await recall(tx, userId))[0].hadQuestion).toBe(false);
    });
  });

  it('returns the most recent first, and honours the limit', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'recall-order');
      await reading(tx, userId, {
        localDate: '2026-07-20',
        gist: 'paling lama',
        createdAt: new Date('2026-07-20T10:00:00Z'),
      });
      await reading(tx, userId, {
        localDate: '2026-07-22',
        gist: 'tengah',
        createdAt: new Date('2026-07-22T10:00:00Z'),
      });
      await reading(tx, userId, {
        localDate: '2026-07-25',
        gist: 'paling baru',
        createdAt: new Date('2026-07-25T10:00:00Z'),
      });

      const two = await recall(tx, userId);
      expect(two).toHaveLength(2);
      expect(two[0].gist).toBe('paling baru');
      expect(two[1].gist).toBe('tengah');
    });
  });

  it('returns nothing for limit 0, without querying', async () => {
    // MEMORY_CHAIN_COUNT=0 is the kill switch, and it must not cost a round
    // trip on every reading.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'recall-zero');
      await reading(tx, userId);
      expect(await recall(tx, userId, { limit: 0 })).toEqual([]);
    });
  });

  it('is cross-reader, and says which reader it was (M12)', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'recall-cross');
      await reading(tx, userId, {
        readerId: 'margaret',
        localDate: '2026-07-24',
        createdAt: new Date('2026-07-24T10:00:00Z'),
      });
      await reading(tx, userId, {
        readerId: 'adrian',
        localDate: '2026-07-25',
        createdAt: new Date('2026-07-25T10:00:00Z'),
      });

      const two = await recall(tx, userId);
      expect(two.map((r) => r.readerId)).toEqual(['adrian', 'margaret']);
    });
  });

  it('returns local_date as a YYYY-MM-DD string, not a Date', async () => {
    // Roadmap §7. The block renders this date, and a Date renders in the
    // server's zone.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'recall-date');
      await reading(tx, userId, { localDate: '2026-07-25' });
      expect((await recall(tx, userId))[0].localDate).toBe('2026-07-25');
    });
  });

  it('includes a reading dated exactly on the lookback bound', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'recall-bound');
      await reading(tx, userId, { localDate: SINCE });
      expect(await recall(tx, userId)).toHaveLength(1);
    });
  });
});

describe('setReadingGist', () => {
  it('writes the gist onto an existing row', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'gist-write');
      const id = await reading(tx, userId, { gist: null });
      expect(await recall(tx, userId)).toEqual([]);

      await setReadingGist(tx, id, 'sudah tidak menahan apa-apa');
      const [r] = await recall(tx, userId);
      expect(r.gist).toBe('sudah tidak menahan apa-apa');
    });
  });

  it('writes null, which drops the reading back out of recall', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'gist-null');
      const id = await reading(tx, userId);
      await setReadingGist(tx, id, null);
      expect(await recall(tx, userId)).toEqual([]);
    });
  });

  it('touches no other reading', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'gist-scoped');
      const a = await reading(tx, userId, { localDate: '2026-07-24', gist: 'a' });
      await reading(tx, userId, { localDate: '2026-07-25', gist: 'b' });

      await setReadingGist(tx, a, 'diubah');
      const two = await recall(tx, userId);
      expect(two.map((r) => r.gist).sort()).toEqual(['b', 'diubah']);
    });
  });
});
