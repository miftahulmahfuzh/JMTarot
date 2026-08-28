/**
 * The soft delete, against a real Postgres.
 *
 * ONE FILE FOR THE WRITER AND EVERY READ IT HAS TO REACH, not one per query
 * module: the interesting assertion is never "this `where` clause works", it is
 * "the reading is gone from ALL of these at once", and that is a property of the
 * set. `history.v6.integration.test.ts` makes the same call for V6's three reads
 * and its fixture builder is the model for this one.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { ReaderId, ReadingStatus, ServiceId } from '@/data/types';
import { dailySummaries, shareLinks, users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { cardCounts, readingsInWindow } from './frequency';
import {
  historyDays,
  insertReading,
  readingsForDay,
  readingWithCards,
  recallableReadings,
  softDeleteReading,
} from './history';
import { ownsShareableReading, publicReadingForShare } from './share';
import { readingsOnDay } from './summary';

afterAll(closeTestDb);

const DAY = '2026-08-27';

async function makeUser(tx: Tx, sub: string): Promise<string> {
  const [u] = await tx
    .insert(users)
    .values({ googleSub: sub, email: `${sub}@example.com` })
    .returning();
  return u.id;
}

type Opts = {
  localDate?: string;
  body?: string | null;
  gist?: string | null;
  status?: ReadingStatus;
  question?: string | null;
  readerId?: ReaderId;
  serviceId?: ServiceId;
  cards?: [number, boolean, number][];
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
      localDate: o.localDate ?? DAY,
      body: o.body === undefined ? 'sebuah bacaan' : o.body,
      gist: o.gist === undefined ? 'sebuah inti' : o.gist,
      status: o.status ?? 'ok',
      question: o.question ?? null,
      verdict: null,
    },
    (o.cards ?? [[8, false, 0]]).map(([cardId, reversed, position]) => ({
      cardId,
      reversed,
      position,
    })),
  );
  return row.id;
}

/** A live share link for one reading, in one language. */
async function shareLink(tx: Tx, userId: string, readingId: string, locale: 'id' | 'en' | null) {
  const [row] = await tx
    .insert(shareLinks)
    .values({
      userId,
      entity: 'reading',
      entityId: readingId,
      slug: `${locale ?? 'as'}${readingId.slice(0, 9)}`,
      locale,
      includeQuestion: true,
      includeNickname: false,
    })
    .returning({ id: shareLinks.id });
  return row.id;
}

describe('softDeleteReading', () => {
  it('marks the reading and its cards, and reports what it did', () =>
    withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:sd-basic');
      const id = await reading(tx, user, { cards: [[3, false, 0], [7, true, 1]] });

      const out = await softDeleteReading(tx, user, id);
      expect(out.deleted).toBe(true);
      expect(out.cardsMarked).toBe(2);

      const rows = await tx.execute(
        sql`select deleted_at from readings where id = ${id}::uuid`,
      );
      expect(rows[0].deleted_at).not.toBeNull();

      const cards = await tx.execute(
        sql`select deleted_at from reading_cards where reading_id = ${id}::uuid`,
      );
      expect(cards).toHaveLength(2);
      for (const c of cards) expect(c.deleted_at).not.toBeNull();
    }));

  /**
   * ONE ASSERTION PER SURFACE, IN ONE TEST, because the requirement is the
   * conjunction. A reading that vanishes from the list and survives in recall has
   * not been deleted; it has been hidden from the screen the querent was looking
   * at, which is the failure this feature is about.
   */
  it('is invisible to every read a querent can reach', () =>
    withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:sd-invisible');
      const kept = await reading(tx, user);
      const gone = await reading(tx, user, { localDate: '2026-08-26' });

      await softDeleteReading(tx, user, gone);

      expect((await readingsForDay(tx, user, '2026-08-26')).map((i) => i.id)).toEqual([]);
      expect(await historyDays(tx, user, 10)).toEqual([DAY]);
      expect(await readingWithCards(tx, user, gone)).toBeNull();
      expect(await readingWithCards(tx, user, kept)).not.toBeNull();

      const recalled = await recallableReadings(tx, {
        userId: user,
        limit: 10,
        sinceLocalDate: '2026-01-01',
      });
      expect(recalled.map((r) => r.id)).toEqual([kept]);

      expect((await readingsOnDay(tx, user, '2026-08-26')).map((r) => r.id)).toEqual([]);
    }));

  it('stops feeding the frequency scan, which reads reading_cards with no join', () =>
    withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:sd-frequency');
      await reading(tx, user, { cards: [[5, false, 0]] });
      const gone = await reading(tx, user, { cards: [[5, false, 0], [5, true, 1]] });

      expect(await readingsInWindow(tx, user, '2026-01-01', '2026-12-31')).toBe(2);

      await softDeleteReading(tx, user, gone);

      const counts = await cardCounts(tx, user, '2026-01-01', '2026-12-31');
      expect(counts).toEqual([
        { cardId: 5, count: 1, reversedCount: 0, lastSeen: DAY },
      ]);
      expect(await readingsInWindow(tx, user, '2026-01-01', '2026-12-31')).toBe(1);
    }));

  it('revokes every live share link for the reading, in every language', () =>
    withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:sd-share');
      const id = await reading(tx, user);
      const other = await reading(tx, user);
      await shareLink(tx, user, id, 'id');
      await shareLink(tx, user, id, 'en');
      await shareLink(tx, user, other, 'id');

      const out = await softDeleteReading(tx, user, id);
      expect(out.linksRevoked).toBe(2);

      expect(await publicReadingForShare(tx, id, true)).toBeNull();
      expect(await ownsShareableReading(tx, id, user)).toBe(false);

      const mine = await tx.execute(
        sql`select revoked_at from share_links where entity_id = ${id}::uuid`,
      );
      for (const r of mine) expect(r.revoked_at).not.toBeNull();

      // THE CONTROL: the other reading's link is untouched.
      const theirs = await tx.execute(
        sql`select revoked_at from share_links where entity_id = ${other}::uuid`,
      );
      expect(theirs[0].revoked_at).toBeNull();
    }));

  /**
   * `isStale` FIRES ON A NEW SOURCE ID AND NOT ON A REMOVED ONE, so the read
   * filter alone leaves yesterday's paragraph standing. This is the assertion
   * that `clearDaySummaries` is what closes it.
   */
  it('clears the day summary that named it and leaves one that did not', () =>
    withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:sd-summary');
      const id = await reading(tx, user);
      const other = await reading(tx, user);

      await tx.insert(dailySummaries).values([
        {
          userId: user,
          readerId: 'thessaly',
          localDate: DAY,
          locale: 'id',
          body: 'hari yang menyebut bacaan itu',
          sourceReadingIds: [id, other],
          promptVersion: 'test',
        },
        {
          userId: user,
          readerId: 'margaret',
          localDate: DAY,
          locale: 'id',
          body: 'hari yang tidak menyebutnya',
          sourceReadingIds: [other],
          promptVersion: 'test',
        },
      ]);

      const out = await softDeleteReading(tx, user, id);
      expect(out.summariesCleared).toBe(1);

      const left = await tx.execute(
        sql`select reader_id from daily_summaries where user_id = ${user}::uuid`,
      );
      expect(left.map((r) => r.reader_id)).toEqual(['margaret']);
    }));

  it('is idempotent and does not move the timestamp', () =>
    withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:sd-idempotent');
      const id = await reading(tx, user);

      const first = await softDeleteReading(tx, user, id);
      expect(first.deleted).toBe(true);
      const [before] = await tx.execute(
        sql`select deleted_at from readings where id = ${id}::uuid`,
      );

      const second = await softDeleteReading(tx, user, id);
      expect(second).toEqual({
        deleted: false,
        cardsMarked: 0,
        linksRevoked: 0,
        summariesCleared: 0,
      });

      const [after] = await tx.execute(
        sql`select deleted_at from readings where id = ${id}::uuid`,
      );
      expect(after.deleted_at).toEqual(before.deleted_at);
    }));

  it('refuses a reading that is not the caller own, and writes nothing', () =>
    withRollback(async (tx) => {
      const mine = await makeUser(tx, 'dev:sd-mine');
      const theirs = await makeUser(tx, 'dev:sd-theirs');
      const id = await reading(tx, theirs);
      await shareLink(tx, theirs, id, 'id');

      const out = await softDeleteReading(tx, mine, id);
      expect(out.deleted).toBe(false);

      const rows = await tx.execute(
        sql`select deleted_at from readings where id = ${id}::uuid`,
      );
      expect(rows[0].deleted_at).toBeNull();
      const links = await tx.execute(
        sql`select revoked_at from share_links where entity_id = ${id}::uuid`,
      );
      expect(links[0].revoked_at).toBeNull();
    }));

  it('treats a malformed uuid as a no-op rather than a driver error', () =>
    withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:sd-uuid');
      await expect(softDeleteReading(tx, user, 'banana')).resolves.toEqual({
        deleted: false,
        cardsMarked: 0,
        linksRevoked: 0,
        summariesCleared: 0,
      });
    }));

  /**
   * THE BOUNDARY TEST, copied from `src/lib/account/delete.integration.test.ts`.
   * A trigger created inside the test transaction makes the FLAG fail;
   * `share_links.revoked_at` must still be null afterwards. Without it, "the same
   * transaction" is a claim in a comment.
   *
   * `softDeleteReading` opens a SAVEPOINT inside `withRollback`'s transaction, so
   * the abort unwinds to the savepoint and the outer test transaction survives to
   * make its assertion.
   */
  it('leaves the share link live when the flag fails', () =>
    withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:sd-boundary');
      const id = await reading(tx, user);
      await shareLink(tx, user, id, 'id');

      await tx.execute(sql`
        create function pg_temp.boom() returns trigger language plpgsql as
          $$ begin raise exception 'boom'; end $$`);
      await tx.execute(sql`
        create trigger t_boom before update on readings
          for each row execute function pg_temp.boom()`);

      await expect(softDeleteReading(tx, user, id)).rejects.toThrow();

      await tx.execute(sql`drop trigger t_boom on readings`);

      const links = await tx.execute(
        sql`select revoked_at from share_links where entity_id = ${id}::uuid`,
      );
      expect(links[0].revoked_at).toBeNull();

      const cards = await tx.execute(
        sql`select deleted_at from reading_cards where reading_id = ${id}::uuid`,
      );
      expect(cards[0].deleted_at).toBeNull();
    }));
});
