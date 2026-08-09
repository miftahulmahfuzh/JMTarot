import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { HANDOFF_TTL_SECONDS, deviceHash, newSecret } from '@/lib/auth/handoff';
import { authHandoffs, users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { bindHandoff, claimHandoff, createHandoff, deleteExpiredHandoffs } from './handoff';

/**
 * `auth_handoffs`, against a real Postgres.
 *
 * **THE PROPERTIES HERE ARE THE ONES A UNIT TEST CANNOT HAVE AN OPINION ABOUT**,
 * because all four of them are `where` clauses: single use under concurrency,
 * expiry against the SERVER's clock, refusing an unbound row, and refusing
 * another device's. The one thing none of it can see is whether an installed
 * iPhone web app can sign in — that is loop 6, and it is loop 6 because loop 5
 * has one cookie jar and iOS has two.
 *
 * `src/lib/auth/handoff.ts` carries the mechanism; the design is
 * `docs/plans/2026-08-09-standalone-signin-handoff-design.md`.
 */
afterAll(closeTestDb);

let n = 0;

async function seedUser(tx: Tx): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `handoff:${n}`, email: `h${n}@example.com` })
    .returning({ id: users.id });
  return user.id;
}

/** A device, and a live handoff started from it. Returns both halves. */
async function startHandoff(tx: Tx): Promise<{ secret: string; hash: string; challenge: string }> {
  const secret = newSecret();
  const hash = await deviceHash(secret);
  const challenge = newSecret();
  await createHandoff(tx, {
    challenge,
    deviceHash: hash,
    expiresAt: new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000),
  });
  return { secret, hash, challenge };
}

/** `now() - interval` in SQL, so the row's age is measured against the same
 *  clock every `where` clause in this module uses. */
async function expire(tx: Tx, challenge: string): Promise<void> {
  await tx.execute(
    sql`update auth_handoffs set expires_at = now() - interval '1 second'
         where challenge = ${challenge}`,
  );
}

describe('the happy path', () => {
  it('mints, binds, and hands the session to the device that started it', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const { hash, challenge } = await startHandoff(tx);

      expect(await bindHandoff(tx, challenge, userId)).toBe(true);
      expect(await claimHandoff(tx, hash)).toBe(userId);
    }));

  it('marks the row claimed rather than deleting it', () =>
    withRollback(async (tx) => {
      /*
       * The row survives its own use, and that is what makes single use
       * enforceable at all: a delete would make a replay indistinguishable from a
       * handoff that never existed, and the sweep is what removes it later.
       */
      const userId = await seedUser(tx);
      const { hash, challenge } = await startHandoff(tx);
      await bindHandoff(tx, challenge, userId);
      await claimHandoff(tx, hash);

      const rows = await tx.execute(
        sql`select claimed_at is not null as spent from auth_handoffs where challenge = ${challenge}`,
      );
      expect((rows as unknown as Array<{ spent: boolean }>)[0].spent).toBe(true);
    }));
});

describe('single use', () => {
  it('answers the second claim with nothing', () =>
    withRollback(async (tx) => {
      /**
       * **THE ASSERTION THE WHOLE DESIGN RESTS ON.** A capability that survives
       * its own first use is a capability, not a handoff — and the claim fires
       * from a `visibilitychange` handler, which is the class of caller that runs
       * far more often than anybody expects.
       */
      const userId = await seedUser(tx);
      const { hash, challenge } = await startHandoff(tx);
      await bindHandoff(tx, challenge, userId);

      expect(await claimHandoff(tx, hash)).toBe(userId);
      expect(await claimHandoff(tx, hash)).toBeNull();
    }));

  it('is enforced by the statement, not by the order the caller happens to use', () =>
    withRollback(async (tx) => {
      /*
       * Two claims issued without awaiting between them. This cannot exercise TRUE
       * concurrency — the harness is one transaction, deliberately, so the test
       * rolls back — but it does prove the read and the write are ONE statement:
       * a check-then-update implementation returns the same user id twice here,
       * and this one does not.
       */
      const userId = await seedUser(tx);
      const { hash, challenge } = await startHandoff(tx);
      await bindHandoff(tx, challenge, userId);

      const results = [await claimHandoff(tx, hash), await claimHandoff(tx, hash)];
      expect(results.filter((r) => r !== null)).toEqual([userId]);
    }));
});

describe('what is refused', () => {
  it('refuses a handoff nobody ever bound', () =>
    withRollback(async (tx) => {
      // The querent tapped the button and abandoned the consent screen. The
      // ordinary shape of an unfinished sign-in, and it must hand out nothing.
      const { hash } = await startHandoff(tx);
      expect(await claimHandoff(tx, hash)).toBeNull();
    }));

  it('refuses an expired handoff even though it is bound', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const { hash, challenge } = await startHandoff(tx);
      await bindHandoff(tx, challenge, userId);
      await expire(tx, challenge);

      expect(await claimHandoff(tx, hash)).toBeNull();
    }));

  it('refuses to BIND an expired handoff, so the overlay cannot revive one', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const { challenge } = await startHandoff(tx);
      await expire(tx, challenge);

      expect(await bindHandoff(tx, challenge, userId)).toBe(false);
    }));

  it('refuses another device’s handoff', () =>
    withRollback(async (tx) => {
      /*
       * **THE CHALLENGE ALONE IS NOT A CAPABILITY**, which is the property that
       * lets it travel in a URL. A second device that somehow knows the challenge
       * still holds no session, because the claim is keyed on the secret it does
       * not have.
       */
      const userId = await seedUser(tx);
      const { challenge } = await startHandoff(tx);
      await bindHandoff(tx, challenge, userId);

      const stranger = await deviceHash(newSecret());
      expect(await claimHandoff(tx, stranger)).toBeNull();
    }));

  it('refuses to RE-BIND a row that already has a user', () =>
    withRollback(async (tx) => {
      /**
       * **THE LOGIN-CSRF CASE, AND IT IS THE ONE WORTH WRITING DOWN.** The
       * challenge is the only value this mechanism ever puts in a URL. Without
       * `user_id is null` in the bind's `where`, somebody who came by it could
       * re-point the row at their OWN account — and the querent's installed app
       * would collect a session belonging to a stranger, silently, on a screen
       * that says they are signed in.
       */
      const mine = await seedUser(tx);
      const theirs = await seedUser(tx);
      const { hash, challenge } = await startHandoff(tx);

      expect(await bindHandoff(tx, challenge, mine)).toBe(true);
      expect(await bindHandoff(tx, challenge, theirs)).toBe(false);
      expect(await claimHandoff(tx, hash)).toBe(mine);
    }));

  it('refuses to bind a challenge that never existed', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      expect(await bindHandoff(tx, newSecret(), userId)).toBe(false);
    }));
});

describe('a device with more than one handoff', () => {
  it('claims the NEWEST eligible row', () =>
    withRollback(async (tx) => {
      /*
       * A querent who taps sign-in, abandons the consent screen, and taps again
       * leaves two rows on one device. The second attempt is the one they are
       * waiting on, and an `order by created_at desc` is what says so — without it
       * the claim would collect whichever row Postgres happened to reach first.
       */
      const userId = await seedUser(tx);
      const secret = newSecret();
      const hash = await deviceHash(secret);
      const expiresAt = new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000);

      const first = newSecret();
      await createHandoff(tx, { challenge: first, deviceHash: hash, expiresAt });
      // Age the first row so the ordering is a fact rather than a coincidence of
      // insert order at identical `now()`.
      await tx.execute(
        sql`update auth_handoffs set created_at = now() - interval '1 minute'
             where challenge = ${first}`,
      );
      const second = newSecret();
      await createHandoff(tx, { challenge: second, deviceHash: hash, expiresAt });

      await bindHandoff(tx, first, userId);
      await bindHandoff(tx, second, userId);

      expect(await claimHandoff(tx, hash)).toBe(userId);
      const rows = await tx.execute(
        sql`select challenge from auth_handoffs
             where claimed_at is not null and device_hash = ${hash}`,
      );
      expect((rows as unknown as Array<{ challenge: string }>).map((r) => r.challenge)).toEqual([
        second,
      ]);
    }));

  it('falls back to the older row when the newest is unbound', () =>
    withRollback(async (tx) => {
      // The inner select filters on `user_id is not null`, so an abandoned second
      // attempt must not shadow a first one that actually completed.
      const userId = await seedUser(tx);
      const secret = newSecret();
      const hash = await deviceHash(secret);
      const expiresAt = new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000);

      const completed = newSecret();
      await createHandoff(tx, { challenge: completed, deviceHash: hash, expiresAt });
      await tx.execute(
        sql`update auth_handoffs set created_at = now() - interval '1 minute'
             where challenge = ${completed}`,
      );
      await bindHandoff(tx, completed, userId);
      await createHandoff(tx, { challenge: newSecret(), deviceHash: hash, expiresAt });

      expect(await claimHandoff(tx, hash)).toBe(userId);
    }));
});

describe('the cascade and the sweep', () => {
  it('takes a purged account’s handoffs with it', () =>
    withRollback(async (tx) => {
      /*
       * `cascade` and not `set null`. A handoff for a user who no longer exists is
       * a row that can never be claimed and can never be explained, and the
       * nightly purge is where accounts actually go.
       */
      const userId = await seedUser(tx);
      const { challenge } = await startHandoff(tx);
      await bindHandoff(tx, challenge, userId);

      await tx.execute(sql`delete from users where id = ${userId}`);

      const rows = await tx.execute(
        sql`select count(*)::int as c from auth_handoffs where challenge = ${challenge}`,
      );
      expect((rows as unknown as Array<{ c: number }>)[0].c).toBe(0);
    }));

  it('sweeps what has expired and keeps what is still live', () =>
    withRollback(async (tx) => {
      /**
       * The sixth statement of the nightly sweep. **A live row surviving is the
       * half worth asserting**: a sweep that took the current minute's handoffs
       * with it would break sign-in for whoever was mid-consent at 10:17 WIB, once
       * a day, for one person, which is the hardest kind of bug to be told about.
       */
      const live = await startHandoff(tx);
      const stale = await startHandoff(tx);
      await expire(tx, stale.challenge);

      expect(await deleteExpiredHandoffs(tx)).toBe(1);

      const rows = await tx.execute(sql`select challenge from auth_handoffs`);
      const left = (rows as unknown as Array<{ challenge: string }>).map((r) => r.challenge);
      expect(left).toContain(live.challenge);
      expect(left).not.toContain(stale.challenge);
    }));

  it('sweeps a spent row too, once it is past its window', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const { hash, challenge } = await startHandoff(tx);
      await bindHandoff(tx, challenge, userId);
      await claimHandoff(tx, hash);
      await expire(tx, challenge);

      expect(await deleteExpiredHandoffs(tx)).toBe(1);
    }));
});

describe('what the table stores', () => {
  it('holds the HASH and never the device secret', () =>
    withRollback(async (tx) => {
      /**
       * **A DUMP OF THIS TABLE MUST NOT BE REPLAYABLE INTO A SESSION.** Asserted
       * against the row rather than against the code, because the failure mode of
       * storing the secret is invisible until somebody has the dump.
       */
      const secret = newSecret();
      const challenge = newSecret();
      await createHandoff(tx, {
        challenge,
        deviceHash: await deviceHash(secret),
        expiresAt: new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000),
      });

      const rows = await tx.execute(
        sql`select * from auth_handoffs where challenge = ${challenge}`,
      );
      expect(JSON.stringify(rows)).not.toContain(secret);
    }));

  it('starts unbound and unclaimed', () =>
    withRollback(async (tx) => {
      const { challenge } = await startHandoff(tx);
      const [row] = await tx
        .select()
        .from(authHandoffs)
        .where(sql`${authHandoffs.challenge} = ${challenge}`);
      expect(row.userId).toBeNull();
      expect(row.claimedAt).toBeNull();
      expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
    }));
});
