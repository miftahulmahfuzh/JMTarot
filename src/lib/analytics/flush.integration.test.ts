/**
 * The two writers, against a real Postgres. `npm run db:up` first.
 *
 * Every test passes the harness's rolled-back transaction in as the third
 * argument, which is why the writers take one: `flush.ts` reaches for the
 * `server-only` singleton otherwise, and nothing here could substitute a
 * handle it can roll back.
 */
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { events, readingCards, readings, users } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import { flushEvents, persistReading, type ReadingRow } from './flush';
import type { AnalyticsContext } from './track';

afterAll(closeTestDb);

const READING_ID = '99999999-9999-4999-8999-999999999999';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const LOCAL_DATE = '2026-07-26';

async function seedUser(tx: DbOrTx): Promise<string> {
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `test:w4:${crypto.randomUUID()}`, email: 'w4@example.com' })
    .returning();
  return user.id;
}

function row(userId: string, over: Partial<ReadingRow> = {}): ReadingRow {
  return {
    id: READING_ID,
    userId,
    readerId: 'adrian',
    serviceId: 'spread3',
    locale: 'id',
    question: 'apakah dia serius',
    status: 'ok',
    body: 'Kartu pertama bicara soal jeda.',
    model: 'glm-4.6',
    promptVersion: 'id-v1.3f9a2c71',
    latencyMs: 2495,
    tokenInput: null,
    tokenOutput: 300,
    sessionId: SESSION_ID,
    localDate: LOCAL_DATE,
    ...over,
  };
}

const CARDS = [
  { cardId: 18, reversed: true, position: 0 },
  { cardId: 7, reversed: false, position: 1 },
  { cardId: 13, reversed: true, position: 2 },
];

describe('persistReading', () => {
  it('writes the reading and its cards, with local_date on both', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await persistReading(row(userId), CARDS, tx);

      const [stored] = await tx.select().from(readings).where(eq(readings.id, READING_ID));
      expect(stored.status).toBe('ok');
      expect(stored.localDate).toBe(LOCAL_DATE);
      expect(stored.sessionId).toBe(SESSION_ID);
      expect(stored.tokenInput).toBe(null);
      expect(stored.tokenOutput).toBe(300);

      const cards = await tx
        .select()
        .from(readingCards)
        .where(eq(readingCards.readingId, READING_ID))
        .orderBy(readingCards.position);

      expect(cards.map((c) => c.cardId)).toEqual([18, 7, 13]);
      expect(cards.map((c) => c.reversed)).toEqual([true, false, true]);
      /*
       * Delta D-C. The card-frequency window is the QUERENT'S calendar, so
       * local_date has to be on this table or "this week" is computed against a
       * day boundary that is seven hours wrong in Jakarta -- the specific bug
       * roadmap §7 is about. Copied from the parent, never passed separately.
       */
      expect(cards.every((c) => c.localDate === LOCAL_DATE)).toBe(true);
      expect(cards.every((c) => c.userId === userId)).toBe(true);
    });
  });

  it('rolls the reading back when a card fails to insert', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      // A not-null violation on the cards insert: deterministic, so the retry
      // classifier refuses it and one attempt is made.
      await persistReading(
        row(userId),
        [{ cardId: 18, reversed: true, position: 0 }, { cardId: undefined, reversed: false, position: 1 }] as never,
        tx,
      );

      /*
       * ZERO, not one. An orphaned reading is the worst of both worlds: invisible
       * in the frequency query and visible in the chain query, so W5 would show
       * the querent a reading that drew no cards.
       */
      const stored = await tx.select().from(readings).where(eq(readings.id, READING_ID));
      expect(stored).toHaveLength(0);
      error.mockRestore();
    });
  });

  it('is idempotent on the id, so a retry after a lost acknowledgement cannot duplicate', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await persistReading(row(userId), CARDS, tx);
      await persistReading(row(userId), CARDS, tx);

      expect(await tx.select().from(readings).where(eq(readings.id, READING_ID))).toHaveLength(1);
      expect(
        await tx.select().from(readingCards).where(eq(readingCards.readingId, READING_ID)),
      ).toHaveLength(3);
    });
  });

  it('writes a blocked reading with NO cards at all', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      // Plan A17. A refused question is a reading attempt and belongs in
      // history, but writing its cards would mean the frequency query needs a
      // filter -- and it is a single-table scan precisely because it does not.
      await persistReading(row(userId, { status: 'blocked', body: null, verdict: null }), [], tx);

      const [stored] = await tx.select().from(readings).where(eq(readings.id, READING_ID));
      expect(stored.status).toBe('blocked');
      expect(stored.body).toBe(null);
      expect(
        await tx.select().from(readingCards).where(eq(readingCards.readingId, READING_ID)),
      ).toHaveLength(0);
    });
  });

  it('writes nothing when ANALYTICS_ENABLED=0, and does not throw', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      process.env.ANALYTICS_ENABLED = '0';
      try {
        await persistReading(row(userId), CARDS, tx);
        expect(await tx.select().from(readings).where(eq(readings.id, READING_ID))).toHaveLength(0);
      } finally {
        // The harness sets this to '1' for the whole project (R20); put it back.
        process.env.ANALYTICS_ENABLED = '1';
      }
    });
  });
});

describe('flushEvents', () => {
  const ctx = (userId: string | null): AnalyticsContext => ({
    userId,
    sessionId: SESSION_ID,
    locale: 'id',
    localDate: LOCAL_DATE,
  });

  it('writes twelve rows in ONE insert', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);

      /*
       * Counting drizzle `insert()` calls rather than rows: the claim is one
       * STATEMENT, and twelve rows would be twelve statements if somebody ever
       * "simplified" the values array into a loop. Counting rows would pass
       * either way.
       */
      let inserts = 0;
      const counting = new Proxy(tx, {
        get(target, prop, receiver) {
          if (prop === 'insert') inserts += 1;
          return Reflect.get(target, prop, receiver);
        },
      }) as DbOrTx;

      const rows = Array.from({ length: 12 }, (_, i) => ({
        name: 'draw.card_picked' as const,
        props: { card_id: i, reversed: false, slot: i % 3 },
      }));
      await flushEvents(ctx(userId), rows, counting);

      expect(inserts).toBe(1);
      const stored = await tx.select().from(events).where(eq(events.userId, userId));
      expect(stored).toHaveLength(12);
      expect(stored[0].sessionId).toBe(SESSION_ID);
      expect(stored[0].localDate).toBe(LOCAL_DATE);
      expect(stored[0].locale).toBe('id');
    });
  });

  it('sanitizes on the way in, so the collector route cannot bypass the rule', async () => {
    await withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await flushEvents(
        ctx(userId),
        [
          {
            name: 'question.typed',
            props: {
              reader_id: 'adrian',
              length: 17,
              // Everything below is what must never reach the column.
              leaked: { question: 'the thing they typed' },
              long: 'x'.repeat(500),
            } as never,
          },
        ],
        tx,
      );

      const [stored] = await tx.select().from(events).where(eq(events.userId, userId));
      expect(stored.props).toEqual({ reader_id: 'adrian', length: 17, long: 'x'.repeat(120) });
      expect(JSON.stringify(stored.props)).not.toContain('the thing they typed');
    });
  });

  it('accepts a null user id, which is why the collector route can be public', async () => {
    await withRollback(async (tx) => {
      await flushEvents(ctx(null), [{ name: 'terms.viewed', props: { version: '2026-07-26', from: 'login' } }], tx);
      const stored = await tx.select().from(events).where(eq(events.name, 'terms.viewed'));
      expect(stored).toHaveLength(1);
      expect(stored[0].userId).toBe(null);
    });
  });

  it('writes nothing for an empty batch', async () => {
    await withRollback(async (tx) => {
      let inserts = 0;
      const counting = new Proxy(tx, {
        get(target, prop, receiver) {
          if (prop === 'insert') inserts += 1;
          return Reflect.get(target, prop, receiver);
        },
      }) as DbOrTx;
      await flushEvents(ctx(null), [], counting);
      expect(inserts).toBe(0);
    });
  });
});
