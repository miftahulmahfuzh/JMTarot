/**
 * The three sweep statements, against a real Postgres.
 *
 * **THE ROUTE ITSELF IS NOT EXERCISED HERE** -- it reaches the `server-only`
 * singleton and a Next `Request`, neither of which belongs in a test. What is
 * tested is the thing that can actually be wrong: **the SQL**. Three `DELETE`s
 * and an `UPDATE` against real tables, with real intervals, on rows old enough
 * to match.
 *
 * That is the half that cannot be reasoned about. `make_interval(days => $1)`
 * fails at runtime without an explicit `::int` cast, because a bound parameter
 * arrives as `text` and there is no `text` overload -- and the failure would
 * first appear thirty days after launch, in a job nobody watches, on the code
 * path that makes the privacy policy true.
 *
 * The statements are duplicated from `route.ts` rather than imported, and that
 * is a real cost paid deliberately: importing the route pulls `next/server` and
 * the db singleton into Vitest. The duplication is guarded by
 * `sweep.contract.test.ts`, which asserts the route still contains each
 * statement's distinguishing clause.
 */
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { events, moderationFlags, readings, users } from '@/lib/db/schema';
import { ERASURE_GRACE_DAYS } from '@/lib/db/queries/profile';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';

afterAll(closeTestDb);

const PURGE_USERS = (days: number) => sql`
  delete from users
   where deleted_at is not null
     and deleted_at < now() - make_interval(days => ${days}::int)
`;

const REDACT_FLAGS = (days: number) => sql`
  update moderation_flags
     set question = null, redacted_at = now()
   where question is not null
     and created_at < now() - make_interval(days => ${days}::int)
`;

const EXPIRE_EVENTS = (days: number) => sql`
  delete from events
   where created_at < now() - make_interval(days => ${days}::int)
`;

async function makeUser(tx: Tx, sub: string, deletedDaysAgo?: number): Promise<string> {
  const [u] = await tx
    .insert(users)
    .values({ googleSub: sub, email: `${sub}@example.com` })
    .returning();
  if (deletedDaysAgo !== undefined) {
    await tx.execute(
      sql`update users set deleted_at = now() - make_interval(days => ${deletedDaysAgo}::int) where id = ${u.id}`,
    );
  }
  return u.id;
}

const countUsers = async (tx: Tx, id: string) =>
  (await tx.execute<{ n: string }>(sql`select count(*)::text as n from users where id = ${id}`))[0]
    .n;

describe('the expired-soft-delete purge (reconciliation §7.8)', () => {
  it('hard-deletes past the grace period and leaves the rest alone', async () => {
    /*
     * §7.8's promise is "gone at 30 days", not "gone at 30 days if you come
     * back". `upsertUserOnSignIn`'s lazy purge only fires for a returning user;
     * this statement is what makes the promise true for everybody else.
     */
    await withRollback(async (tx) => {
      const expired = await makeUser(tx, 'dev:sweep-expired', ERASURE_GRACE_DAYS + 1);
      const inGrace = await makeUser(tx, 'dev:sweep-grace', ERASURE_GRACE_DAYS - 1);
      const active = await makeUser(tx, 'dev:sweep-active');

      await tx.execute(PURGE_USERS(ERASURE_GRACE_DAYS));

      expect(await countUsers(tx, expired)).toBe('0');
      expect(await countUsers(tx, inGrace)).toBe('1');
      expect(await countUsers(tx, active)).toBe('1');
    });
  });

  it('cascades the readings away with the account', async () => {
    // W1's schema does this, not the statement -- but the erasure promise names
    // readings specifically, so it is asserted where the promise is kept.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:sweep-cascade', ERASURE_GRACE_DAYS + 5);
      await tx.insert(readings).values({
        userId,
        readerId: 'thessaly',
        serviceId: 'daily',
        locale: 'id',
        status: 'ok',
        model: 'test',
        promptVersion: 'id-v1.deadbeef',
        localDate: '2026-07-01',
      });

      await tx.execute(PURGE_USERS(ERASURE_GRACE_DAYS));

      const left = await tx.execute<{ n: string }>(
        sql`select count(*)::text as n from readings where user_id = ${userId}`,
      );
      expect(left[0].n).toBe('0');
    });
  });

  it('frees the google_sub, so that account can sign up again as a stranger', async () => {
    /*
     * The trap R23 found: under the strict design the dead row held the
     * `google_sub` forever, so a user who rage-quit could never come back EVEN
     * AS A NEW USER. The identity is released when the data is.
     */
    await withRollback(async (tx) => {
      await makeUser(tx, 'dev:sweep-reuse', ERASURE_GRACE_DAYS + 1);
      await tx.execute(PURGE_USERS(ERASURE_GRACE_DAYS));
      // The unique constraint would reject this if the row survived.
      await expect(makeUser(tx, 'dev:sweep-reuse')).resolves.toEqual(expect.any(String));
    });
  });
});

describe('the events TTL (reconciliation §7.9b)', () => {
  it('deletes past 180 days and keeps the rest', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:sweep-events');

      const insertEvent = async (daysAgo: number) => {
        const [row] = await tx
          .insert(events)
          .values({ userId, name: 'app.launched', localDate: '2026-01-01', props: {} })
          .returning();
        await tx.execute(
          sql`update events set created_at = now() - make_interval(days => ${daysAgo}::int) where id = ${row.id}`,
        );
        return row.id;
      };

      const old = await insertEvent(200);
      const fresh = await insertEvent(10);

      await tx.execute(EXPIRE_EVENTS(180));

      const remaining = await tx.execute<{ id: string }>(
        sql`select id::text as id from events where user_id = ${userId}`,
      );
      const ids = remaining.map((r) => r.id);
      expect(ids).toContain(fresh);
      expect(ids).not.toContain(old);
    });
  });

  it('does NOT touch readings, which are kept for the life of the account', async () => {
    /*
     * §7.9b, stated in the privacy policy in those words. Every memory feature
     * reads `readings`, so putting it on the analytics clock would silently
     * amputate the app's memory at six months.
     */
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:sweep-readings-kept');
      const [row] = await tx
        .insert(readings)
        .values({
          userId,
          readerId: 'adrian',
          serviceId: 'yesno',
          locale: 'en',
          status: 'ok',
          model: 'test',
          promptVersion: 'en-v1.deadbeef',
          localDate: '2025-01-01',
        })
        .returning();
      await tx.execute(
        sql`update readings set created_at = now() - make_interval(days => 400::int) where id = ${row.id}`,
      );

      await tx.execute(EXPIRE_EVENTS(180));

      expect(
        (
          await tx.execute<{ n: string }>(
            sql`select count(*)::text as n from readings where id = ${row.id}`,
          )
        )[0].n,
      ).toBe('1');
    });
  });
});

describe('the moderation redaction, from the cron side', () => {
  it('runs the same statement the lazy sweep runs', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:sweep-mod');
      const [row] = await tx
        .insert(moderationFlags)
        .values({
          userId,
          question: 'v1.some-ciphertext',
          questionHmac: 'fixture',
          category: 'self_harm',
          source: 'blocklist',
          action: 'blocked',
          locale: 'id',
        })
        .returning();
      await tx.execute(
        sql`update moderation_flags set created_at = now() - make_interval(days => 45::int) where id = ${row.id}`,
      );

      await tx.execute(REDACT_FLAGS(30));

      const after = await tx.execute<{ question: string | null; redacted_at: Date | null }>(
        sql`select question, redacted_at from moderation_flags where id = ${row.id}`,
      );
      expect(after[0].question).toBeNull();
      expect(after[0].redacted_at).not.toBeNull();
    });
  });
});
