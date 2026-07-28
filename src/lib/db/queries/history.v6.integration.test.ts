/**
 * V6's three reads against a real Postgres.
 *
 * ONE FILE FOR THE THREE, not three, because they share a fixture builder and
 * every one of the interesting assertions is about how the three DIFFER — the
 * `blocked` filter, the `id desc` tiebreak, the absent `body` key, ownership as a
 * predicate. Splitting them would mean three copies of `reading()` and a reader
 * who has to open three files to see that `historyDays` filters what
 * `readingsForDay` filters.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { ReaderId, ReadingStatus, ServiceId, YesNo } from '@/data/types';
import type { Tx } from '@/lib/db/types';
import { historyDays, insertReading, readingsForDay, readingWithCards } from './history';

afterAll(closeTestDb);

const DAY = '2026-07-27';

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
  body?: string | null;
  status?: ReadingStatus;
  question?: string | null;
  verdict?: YesNo | null;
  readerId?: ReaderId;
  serviceId?: ServiceId;
  locale?: 'id' | 'en';
  /** `[cardId, reversed, position]`, so a test can insert out of slot order. */
  cards?: [number, boolean, number][];
};

async function reading(tx: Tx, userId: string, o: Opts = {}): Promise<string> {
  const row = await insertReading(
    tx,
    {
      userId,
      readerId: o.readerId ?? 'thessaly',
      serviceId: o.serviceId ?? 'daily',
      locale: o.locale ?? 'id',
      model: 'test',
      promptVersion: 'id-v1.testtest',
      localDate: o.localDate ?? DAY,
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
      body: o.body === undefined ? 'sebuah bacaan' : o.body,
      status: o.status ?? 'ok',
      question: o.question ?? null,
      verdict: o.verdict ?? null,
    },
    (o.cards ?? [[8, false, 0]]).map(([cardId, reversed, position]) => ({
      cardId,
      reversed,
      position,
    })),
  );
  return row.id;
}

// ---------------------------------------------------------------------------
// readingsForDay
// ---------------------------------------------------------------------------

describe('readingsForDay', () => {
  it('returns the day newest first', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:day-order');
      await reading(tx, user, { createdAt: new Date('2026-07-27T01:00:00Z') });
      await reading(tx, user, { createdAt: new Date('2026-07-27T09:00:00Z') });
      await reading(tx, user, { createdAt: new Date('2026-07-27T05:00:00Z') });

      const items = await readingsForDay(tx, user, DAY);
      expect(items.map((i) => i.createdAtIso)).toEqual([
        '2026-07-27T09:00:00.000Z',
        '2026-07-27T05:00:00.000Z',
        '2026-07-27T01:00:00.000Z',
      ]);
    });
  });

  /**
   * THE TIEBREAK, AND IT FAILS WITHOUT `desc(id)`.
   *
   * `created_at` defaults to `now()`, which in Postgres is TRANSACTION-START
   * time, so two rows written in one transaction share a timestamp EXACTLY.
   * Production never hits it -- two readings are two requests -- but
   * `withRollback` wraps every test in one transaction, so this is the normal
   * case here. Without the tiebreak the order is whatever the planner returns.
   */
  it('is a total order for two rows written in one transaction', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:day-tiebreak');
      const a = await reading(tx, user);
      const b = await reading(tx, user);

      const items = await readingsForDay(tx, user, DAY);
      expect(items).toHaveLength(2);
      // Both share created_at, so `id desc` decides -- and it is deterministic.
      const expected = [a, b].sort((x, y) => (x < y ? 1 : -1));
      expect(items.map((i) => i.id)).toEqual(expected);
    });
  });

  it('hides a blocked reading', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:day-blocked');
      await reading(tx, user, { status: 'ok' });
      await reading(tx, user, {
        status: 'blocked',
        body: null,
        question: 'something W7 refused',
        cards: [],
      });

      const items = await readingsForDay(tx, user, DAY);
      expect(items).toHaveLength(1);
      expect(items[0].status).toBe('ok');
    });
  });

  /**
   * The other half of the H5 decision, and the one that keeps two features
   * agreeing about the same past: R7 already counts a failed draw toward the
   * frequency verdict.
   */
  it('shows a failed reading, with hasBody false and its cards intact', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:day-failed');
      await reading(tx, user, { status: 'failed', body: null, cards: [[3, true, 0]] });

      const [item] = await readingsForDay(tx, user, DAY);
      expect(item.status).toBe('failed');
      expect(item.hasBody).toBe(false);
      expect(item.cards).toEqual([{ cardId: 3, reversed: true, position: 0 }]);
    });
  });

  it('shows aborted and partial too', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:day-statuses');
      await reading(tx, user, { status: 'aborted', body: null });
      await reading(tx, user, { status: 'partial' });

      const items = await readingsForDay(tx, user, DAY);
      expect(items.map((i) => i.status).sort()).toEqual(['aborted', 'partial']);
    });
  });

  it('reports hasBody true when there is prose', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:day-hasbody');
      await reading(tx, user, { body: 'ada teksnya' });
      const [item] = await readingsForDay(tx, user, DAY);
      expect(item.hasBody).toBe(true);
    });
  });

  it("cannot see another user's reading on the same day", async () => {
    await withRollback(async (tx) => {
      const mine = await makeUser(tx, 'dev:day-mine');
      const theirs = await makeUser(tx, 'dev:day-theirs');
      await reading(tx, theirs);

      expect(await readingsForDay(tx, mine, DAY)).toEqual([]);
    });
  });

  /**
   * H10, asserted on the OBJECT and not on the query. `expect(item.body).toBeNull()`
   * would pass for a select that fetched the column and dropped it -- by which
   * point the prose is already in the response payload.
   */
  it('returns objects with no body and no gist key at all', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:day-nobody');
      await reading(tx, user, { body: 'prosa yang panjang sekali' });

      const [item] = await readingsForDay(tx, user, DAY);
      expect('body' in item).toBe(false);
      expect('gist' in item).toBe(false);
      expect(JSON.stringify(item)).not.toContain('prosa');
    });
  });

  it('returns cards sorted by position however they were inserted', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:day-cardorder');
      await reading(tx, user, {
        serviceId: 'spread3',
        cards: [
          [12, false, 2],
          [0, true, 0],
          [7, false, 1],
        ],
      });

      const [item] = await readingsForDay(tx, user, DAY);
      expect(item.cards.map((c) => c.position)).toEqual([0, 1, 2]);
      expect(item.cards.map((c) => c.cardId)).toEqual([0, 7, 12]);
      expect(item.cards.map((c) => c.reversed)).toEqual([true, false, false]);
    });
  });

  /**
   * THE COLUMN IS THE QUERENT'S CALENDAR DAY, NOT A DERIVED ONE. A reading taken
   * at 23:00 in Jakarta on the 26th has `created_at` on the 27th in UTC and
   * `local_date` of `'2026-07-26'`; it must appear under the 26th and not the
   * 27th. This is the whole reason the column exists.
   */
  it('filters on local_date and never on created_at', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:day-localdate');
      await reading(tx, user, {
        localDate: '2026-07-26',
        createdAt: new Date('2026-07-27T02:00:00Z'), // 09:00 Jakarta on the 27th
      });

      expect(await readingsForDay(tx, user, '2026-07-27')).toEqual([]);
      const yesterday = await readingsForDay(tx, user, '2026-07-26');
      expect(yesterday).toHaveLength(1);
      expect(yesterday[0].localDate).toBe('2026-07-26');
    });
  });

  it('carries sharedAt as null until V7 writes it', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:day-shared');
      await reading(tx, user);
      const [item] = await readingsForDay(tx, user, DAY);
      expect(item.sharedAt).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// historyDays
// ---------------------------------------------------------------------------

describe('historyDays', () => {
  it('returns distinct days, newest first', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:days-basic');
      await reading(tx, user, { localDate: '2026-07-25' });
      await reading(tx, user, { localDate: '2026-07-27' });
      await reading(tx, user, { localDate: '2026-07-27' });

      expect(await historyDays(tx, user, 10)).toEqual(['2026-07-27', '2026-07-25']);
    });
  });

  /**
   * Or the strip would offer a chip that leads straight to the empty state,
   * which is worse than no chip.
   */
  it('omits a day whose only reading is blocked', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:days-blocked');
      await reading(tx, user, { localDate: '2026-07-27' });
      await reading(tx, user, { localDate: '2026-07-20', status: 'blocked', cards: [] });

      expect(await historyDays(tx, user, 10)).toEqual(['2026-07-27']);
    });
  });

  it('truncates from the newest end', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:days-limit');
      for (const d of ['2026-07-20', '2026-07-25', '2026-07-27']) {
        await reading(tx, user, { localDate: d });
      }
      expect(await historyDays(tx, user, 2)).toEqual(['2026-07-27', '2026-07-25']);
    });
  });

  it('returns [] for a limit of zero without querying', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:days-zero');
      await reading(tx, user);
      expect(await historyDays(tx, user, 0)).toEqual([]);
      expect(await historyDays(tx, user, -1)).toEqual([]);
    });
  });

  it("cannot see another user's days", async () => {
    await withRollback(async (tx) => {
      const mine = await makeUser(tx, 'dev:days-mine');
      const theirs = await makeUser(tx, 'dev:days-theirs');
      await reading(tx, theirs, { localDate: '2026-07-27' });

      expect(await historyDays(tx, mine, 10)).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// readingWithCards
// ---------------------------------------------------------------------------

describe('readingWithCards', () => {
  it('returns the reading, its prose and its cards in position order', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:detail-ok');
      const id = await reading(tx, user, {
        serviceId: 'yesno',
        verdict: 'no',
        question: 'haruskah aku pindah kerja',
        body: 'jawabannya tidak, dan ini alasannya',
        cards: [
          [15, true, 1],
          [1, false, 0],
        ],
      });

      const row = await readingWithCards(tx, user, id);
      expect(row).not.toBeNull();
      expect(row!.body).toBe('jawabannya tidak, dan ini alasannya');
      expect(row!.question).toBe('haruskah aku pindah kerja');
      expect(row!.verdict).toBe('no');
      expect(row!.cards).toEqual([
        { cardId: 1, reversed: false, position: 0 },
        { cardId: 15, reversed: true, position: 1 },
      ]);
    });
  });

  /**
   * OWNERSHIP IS A PREDICATE. Fetching by id and comparing owners afterwards is
   * one forgotten `if` away from serving a stranger's reading, and the forgotten
   * `if` is invisible in review.
   */
  it("returns null for another user's reading id", async () => {
    await withRollback(async (tx) => {
      const mine = await makeUser(tx, 'dev:detail-mine');
      const theirs = await makeUser(tx, 'dev:detail-theirs');
      const id = await reading(tx, theirs);

      expect(await readingWithCards(tx, mine, id)).toBeNull();
      // ...and the owner can still read it, so the test is not passing because
      // the row is missing.
      expect(await readingWithCards(tx, theirs, id)).not.toBeNull();
    });
  });

  it('returns null for a blocked reading', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:detail-blocked');
      const id = await reading(tx, user, { status: 'blocked', body: null, cards: [] });
      expect(await readingWithCards(tx, user, id)).toBeNull();
    });
  });

  /**
   * SQLSTATE 22P02. `where id = 'banana'` raises it from the driver, and an
   * unhandled one 500s a page that should 404 AND puts the failing statement in
   * the platform log. The shape check runs before the query.
   */
  it('returns null for a malformed uuid rather than throwing', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:detail-banana');
      for (const bad of ['banana', '', '../../etc/passwd', '1234', 'not-a-uuid-at-all']) {
        await expect(readingWithCards(tx, user, bad)).resolves.toBeNull();
      }
    });
  });

  it('returns null for a well-formed uuid that does not exist', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:detail-absent');
      const row = await readingWithCards(tx, user, '11111111-1111-4111-8111-111111111111');
      expect(row).toBeNull();
    });
  });

  it('round-trips createdAtIso', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:detail-iso');
      const at = new Date('2026-07-27T13:41:07.000Z');
      const id = await reading(tx, user, { createdAt: at });

      const row = await readingWithCards(tx, user, id);
      expect(new Date(row!.createdAtIso).getTime()).toBe(at.getTime());
    });
  });

  it('returns a reading with no cards without failing', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:detail-nocards');
      const id = await reading(tx, user, { cards: [] });
      const row = await readingWithCards(tx, user, id);
      expect(row!.cards).toEqual([]);
    });
  });
});
