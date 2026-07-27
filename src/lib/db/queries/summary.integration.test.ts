/**
 * `readingsOnDay` and the `daily_summaries` upsert against a real Postgres
 * (W5 plan Task 9).
 *
 * The upsert is the interesting half. It writes onto a unique key, which means
 * `created_at` stops describing when the text was written -- and `updated_at`
 * is what the M13 throttle compares against, so a frozen column would make the
 * throttle permanent and the summary never regenerate.
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { ReaderId, ServiceId, YesNo } from '@/data/types';
import { users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { insertReading } from './history';
import { getDailySummary, putDailySummary, readingsOnDay } from './summary';

afterAll(closeTestDb);

const DAY = '2026-07-26';

/*
 * `source_reading_ids` is `uuid[]`, not `text[]`, so a placeholder like 'a' is
 * rejected by Postgres rather than stored. Discovered by these tests failing --
 * which is the column doing its job.
 */
const RID_A = '11111111-1111-4111-8111-111111111111';
const RID_B = '22222222-2222-4222-8222-222222222222';

async function makeUser(tx: Tx, sub: string): Promise<string> {
  const [u] = await tx
    .insert(users)
    .values({ googleSub: sub, email: `${sub}@example.com` })
    .returning();
  return u.id;
}

async function reading(
  tx: Tx,
  userId: string,
  o: {
    localDate?: string;
    readerId?: ReaderId;
    serviceId?: ServiceId;
    cards?: [number, boolean][];
    gist?: string | null;
    verdict?: YesNo | null;
    body?: string | null;
    createdAt?: Date;
  } = {},
): Promise<string> {
  const row = await insertReading(
    tx,
    {
      userId,
      readerId: o.readerId ?? 'thessaly',
      serviceId: o.serviceId ?? 'daily',
      locale: 'id',
      model: 'test',
      promptVersion: 'id-v1.testtest',
      localDate: o.localDate ?? DAY,
      gist: o.gist === undefined ? 'sesuatu bergeser' : o.gist,
      verdict: o.verdict ?? null,
      body: o.body === undefined ? 'sebuah bacaan' : o.body,
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
    },
    (o.cards ?? [[18, false]]).map(([cardId, reversed], position) => ({
      cardId,
      reversed,
      position,
    })),
  );
  return row.id;
}

describe('readingsOnDay', () => {
  it('returns every reading on that local date, with its cards', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'day-basic');
      await reading(tx, userId, {
        serviceId: 'spread3',
        cards: [
          [16, false],
          [12, false],
          [17, true],
        ],
        verdict: null,
      });

      const [r] = await readingsOnDay(tx, userId, DAY);
      expect(r.cards).toEqual([
        { cardId: 16, reversed: false },
        { cardId: 12, reversed: false },
        { cardId: 17, reversed: true },
      ]);
      expect(r.gist).toBe('sesuatu bergeser');
    });
  });

  it('is CROSS-READER (M12): every reading that day, whoever gave it', async () => {
    /*
     * The row is keyed by reader because the VOICE differs, not the source set.
     * This is what makes switching readers give three different tellings of one
     * day -- the best demonstration in the product that the readers are not
     * interchangeable.
     */
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'day-cross');
      await reading(tx, userId, { readerId: 'thessaly' });
      await reading(tx, userId, { readerId: 'margaret' });
      await reading(tx, userId, { readerId: 'adrian' });

      expect(await readingsOnDay(tx, userId, DAY)).toHaveLength(3);
    });
  });

  it('does NOT filter out a dead stream or a missing gist', async () => {
    /*
     * The opposite of `recallableReadings`, deliberately. Recall feeds a
     * callback, so a reading that said nothing has nothing to quote. A day
     * summary is a COUNT and a shape of the day: "you drew three times today"
     * is true whether or not the third finished, and dropping it would make the
     * summary disagree with what the querent remembers doing.
     */
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'day-nofilter');
      await reading(tx, userId, { body: null, gist: null });
      const [r] = await readingsOnDay(tx, userId, DAY);
      expect(r).toBeDefined();
      expect(r.gist).toBeNull();
    });
  });

  it('carries the verdict for a yes/no reading', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'day-verdict');
      await reading(tx, userId, { serviceId: 'yesno', verdict: 'yes' });
      expect((await readingsOnDay(tx, userId, DAY))[0].verdict).toBe('yes');
    });
  });

  it('never crosses a day boundary, and never derives the day from created_at', async () => {
    // Roadmap §7. A reading taken at 23:00 Jakarta is created_at tomorrow in
    // UTC and belongs to today for the querent.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'day-bounds');
      await reading(tx, userId, {
        localDate: DAY,
        createdAt: new Date('2026-07-27T02:00:00Z'),
      });
      await reading(tx, userId, { localDate: '2026-07-25' });

      expect(await readingsOnDay(tx, userId, DAY)).toHaveLength(1);
    });
  });

  it('returns the day in the order it happened', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'day-order');
      await reading(tx, userId, {
        gist: 'pagi',
        createdAt: new Date('2026-07-26T01:00:00Z'),
      });
      await reading(tx, userId, {
        gist: 'sore',
        createdAt: new Date('2026-07-26T10:00:00Z'),
      });

      expect((await readingsOnDay(tx, userId, DAY)).map((r) => r.gist)).toEqual(['pagi', 'sore']);
    });
  });

  it('never sees another user’s day', async () => {
    await withRollback(async (tx) => {
      const mine = await makeUser(tx, 'day-mine');
      const theirs = await makeUser(tx, 'day-theirs');
      await reading(tx, theirs);
      expect(await readingsOnDay(tx, mine, DAY)).toEqual([]);
    });
  });

  it('returns an empty array for a day with no readings', async () => {
    // The 204 path, and the common one for a first-time visitor.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'day-empty');
      expect(await readingsOnDay(tx, userId, DAY)).toEqual([]);
    });
  });
});

describe('the daily_summaries upsert', () => {
  const put = (tx: Tx, userId: string, over: Record<string, unknown> = {}) =>
    putDailySummary(tx, {
      userId,
      readerId: 'margaret',
      localDate: DAY,
      locale: 'id',
      body: 'Sejak pagi kartumu berdiri di ambang yang sama.',
      sourceReadingIds: [RID_A],
      promptVersion: 'memory-v1',
      ...over,
    });

  it('round-trips a summary', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'sum-rt');
      expect(await getDailySummary(tx, userId, 'margaret', DAY, 'id')).toBeNull();

      await put(tx, userId);
      const got = await getDailySummary(tx, userId, 'margaret', DAY, 'id');
      expect(got?.body).toContain('ambang yang sama');
      expect(got?.sourceReadingIds).toEqual([RID_A]);
      expect(got?.generationCount).toBe(0);
    });
  });

  it('INCREMENTS generation_count and MOVES updated_at on regeneration', async () => {
    /*
     * Both halves matter and both are hand-written in the query, because
     * Drizzle's `$onUpdate()` fires on `db.update()` and NOT inside
     * `onConflictDoUpdate` (CLAUDE.md). `updated_at` is what the M13 throttle
     * compares against -- freeze it and the throttle becomes permanent and the
     * summary never regenerates again. `generation_count` is how "is the
     * throttle set right?" is answered with one query instead of an events
     * aggregation.
     */
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'sum-regen');
      await put(tx, userId);
      const first = await getDailySummary(tx, userId, 'margaret', DAY, 'id');

      await new Promise((r) => setTimeout(r, 5));
      await put(tx, userId, { body: 'baris baru', sourceReadingIds: [RID_A, RID_B] });

      const second = await getDailySummary(tx, userId, 'margaret', DAY, 'id');
      expect(second?.body).toBe('baris baru');
      expect(second?.sourceReadingIds).toEqual([RID_A, RID_B]);
      expect(second?.generationCount).toBe(1);
      expect(second!.updatedAt.getTime()).toBeGreaterThan(first!.updatedAt.getTime());
      // One row, not two.
      expect(second?.id).toBe(first?.id);
    });
  });

  it('counts generations rather than trusting the caller', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'sum-count');
      for (let i = 0; i < 4; i += 1) await put(tx, userId, { body: `v${i}` });
      expect((await getDailySummary(tx, userId, 'margaret', DAY, 'id'))?.generationCount).toBe(3);
    });
  });

  it('keys by reader, day AND locale, so none of them collide', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'sum-key');
      await put(tx, userId, { readerId: 'margaret', body: 'm' });
      await put(tx, userId, { readerId: 'adrian', body: 'a' });
      await put(tx, userId, { localDate: '2026-07-25', body: 'kemarin' });
      await put(tx, userId, { locale: 'en', body: 'english' });

      expect((await getDailySummary(tx, userId, 'margaret', DAY, 'id'))?.body).toBe('m');
      expect((await getDailySummary(tx, userId, 'adrian', DAY, 'id'))?.body).toBe('a');
      expect((await getDailySummary(tx, userId, 'margaret', '2026-07-25', 'id'))?.body).toBe(
        'kemarin',
      );
      expect((await getDailySummary(tx, userId, 'margaret', DAY, 'en'))?.body).toBe('english');
    });
  });

  it('stores prompt_version, which is what invalidates a cached summary', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'sum-pv');
      await put(tx, userId, { promptVersion: 'memory-v2' });
      expect((await getDailySummary(tx, userId, 'margaret', DAY, 'id'))?.promptVersion).toBe(
        'memory-v2',
      );
    });
  });
});
