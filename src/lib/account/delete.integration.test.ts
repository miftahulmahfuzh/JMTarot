import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  chatMessages,
  chatRuns,
  chatThreads,
  moderationFlags,
  shareLinks,
  userMemory,
  users,
} from '@/lib/db/schema';
import { closeTestDb, testDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { deleteAccount } from './delete';

afterAll(closeTestDb);

let n = 0;

/**
 * A user, one moderation flag that still holds text, one live share link, and
 * one `user_memory` row with a line in it and a tombstone beside it.
 *
 * The flag's `question` is a placeholder rather than real ciphertext: nothing
 * under test decrypts it, and the only property that matters is "there is text
 * here and afterwards there is not". The memory row is there for the same
 * reason, plus one more -- the tombstone is what proves the erasure REDACTS
 * rather than DELETES.
 */
async function seedUserWithFlag(tx: Tx): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `del:${n}`, email: `del${n}@example.com` })
    .returning({ id: users.id });

  await tx.insert(moderationFlags).values({
    userId: user.id,
    question: 'v1.ciphertext-placeholder',
    questionHmac: `hmac-${n}`,
    category: 'self_harm',
    source: 'classifier',
    locale: 'id',
  });

  await tx.insert(shareLinks).values({
    slug: `SLUG${String(n).padStart(8, '0')}`,
    userId: user.id,
    entity: 'reading',
    entityId: user.id,
  });

  await tx.insert(userMemory).values({
    userId: user.id,
    items: [
      { id: '0a1b2c3d4e5f', kind: 'taste', text: 'suka nasi padang', lastSeen: '2026-08-30' },
    ],
    dismissedIds: ['aabbccddeeff'],
    inputHash: 'hash-1',
    sourceVersion: 1,
    model: 'glm-5.3',
    promptVersion: 'um-1',
  });

  return user.id;
}

describe('deleteAccount', () => {
  it('sets deleted_at, redacts moderation text and revokes links in one transaction', () =>
    withRollback(async (tx) => {
      const userId = await seedUserWithFlag(tx);
      const out = await deleteAccount(tx, userId);

      expect(out.deleted).toBe(true);
      expect(out.flagsRedacted).toBe(1);
      expect(out.linksRevoked).toBe(1);

      const rows = await tx.execute(
        sql`select deleted_at from users where id = ${userId}`,
      );
      expect(rows[0].deleted_at).not.toBeNull();

      const flags = await tx.execute(
        sql`select question, redacted_at from moderation_flags where user_id = ${userId}`,
      );
      expect(flags[0].question).toBeNull();
      expect(flags[0].redacted_at).not.toBeNull();

      const links = await tx.execute(
        sql`select revoked_at from share_links where user_id = ${userId}`,
      );
      expect(links[0].revoked_at).not.toBeNull();
    }));

  it('returns a restorableUntil ERASURE_GRACE_DAYS in the future', () =>
    withRollback(async (tx) => {
      const userId = await seedUserWithFlag(tx);
      const out = await deleteAccount(tx, userId);
      const days = (Date.parse(out.restorableUntil) - Date.now()) / 86_400_000;
      // 30, within a second of clock drift either way.
      expect(days).toBeGreaterThan(29.99);
      expect(days).toBeLessThan(30.01);
    }));

  it('reports deleted: false for an already-deleted account and touches nothing', () =>
    withRollback(async (tx) => {
      const userId = await seedUserWithFlag(tx);
      await deleteAccount(tx, userId);

      const second = await deleteAccount(tx, userId);
      expect(second.deleted).toBe(false);
      /*
       * The redaction is idempotent by its own `question is not null` clause, so
       * the second pass finds nothing left to null. That is the honest count and
       * it is what lets the route tell "we just erased you" from "you were
       * already gone" without a second read.
       */
      expect(second.flagsRedacted).toBe(0);
      expect(second.linksRevoked).toBe(0);
    }));

  it('reports deleted: false for a user id that does not exist', () =>
    withRollback(async (tx) => {
      const out = await deleteAccount(tx, '00000000-0000-4000-8000-000000000000');
      expect(out.deleted).toBe(false);
    }));

  /**
   * THE BOUNDARY TEST. A trigger created inside the test transaction makes the
   * redaction fail; `deleted_at` must still be null afterwards. Without this,
   * "same transaction" is a claim in a comment.
   *
   * `deleteAccount` opens a SAVEPOINT inside `withRollback`'s open transaction,
   * so the abort unwinds to the savepoint and the outer test transaction
   * survives to make its assertion.
   */
  it('leaves deleted_at unset when the redaction fails', () =>
    withRollback(async (tx) => {
      const userId = await seedUserWithFlag(tx);

      await tx.execute(sql`
        create function pg_temp.boom() returns trigger language plpgsql as
          $$ begin raise exception 'boom'; end $$`);
      await tx.execute(sql`
        create trigger t_boom before update on moderation_flags
          for each row execute function pg_temp.boom()`);

      await expect(deleteAccount(tx, userId)).rejects.toThrow();

      await tx.execute(sql`drop trigger t_boom on moderation_flags`);

      const rows = await tx.execute(
        sql`select deleted_at from users where id = ${userId}`,
      );
      expect(rows[0].deleted_at).toBeNull();

      /*
       * The revocation ran BEFORE the redaction, so this is the assertion that
       * proves the whole thing rolled back rather than that the failing statement
       * simply came first.
       */
      const links = await tx.execute(
        sql`select revoked_at from share_links where user_id = ${userId}`,
      );
      expect(links[0].revoked_at).toBeNull();
    }));

  it('does not touch another user rows', () =>
    withRollback(async (tx) => {
      const mine = await seedUserWithFlag(tx);
      const theirs = await seedUserWithFlag(tx);

      await deleteAccount(tx, mine);

      const flags = await tx.execute(
        sql`select question from moderation_flags where user_id = ${theirs}`,
      );
      expect(flags[0].question).not.toBeNull();

      const links = await tx.execute(
        sql`select revoked_at from share_links where user_id = ${theirs}`,
      );
      expect(links[0].revoked_at).toBeNull();

      const rows = await tx.execute(
        sql`select deleted_at from users where id = ${theirs}`,
      );
      expect(rows[0].deleted_at).toBeNull();
    }));
});

/**
 * ── R2's ERASURE DUTY (v0.8.0, 2026-08-30) ────────────────────────────────────
 *
 * **`user_memory` IS ON `moderation_flags`' SIDE OF `delete.ts`'s ASYMMETRY EVEN
 * THOUGH ITS FOREIGN KEY IS ON `readings`' SIDE**, and that is an amendment
 * rather than an oversight. The foreign key answers "does it survive"; it does
 * not answer "is this the thing they meant". `items` is a model's dossier about
 * a person, assembled from a conversation they were having for another reason --
 * the only row in this database of which that is true -- and thirty more days of
 * it is exactly what the button is supposed to prevent.
 *
 * It costs the restore nothing, which is what makes it cheap enough to do: the
 * inputs are `chat_messages` and `readings`, both of which cascade and therefore
 * SURVIVE the soft delete, so a restored account has its memory rebuilt on the
 * next run. `clearFreeTextAnswers()` stays out because `onboarding_answers` is
 * the only copy of text a person typed. `delete.ts`'s header carries the whole
 * argument, including why this does not license adding `personas`.
 */
describe('the user memory and the erasure promise', () => {
  const memoryOf = async (tx: Tx, userId: string) => {
    const [row] = await tx.execute(
      sql`select items, dismissed_ids, input_hash from user_memory where user_id = ${userId}`,
    );
    return row;
  };

  it('EMPTIES the memory in the same transaction that sets deleted_at', () =>
    withRollback(async (tx) => {
      const userId = await seedUserWithFlag(tx);
      const out = await deleteAccount(tx, userId);

      expect(out.deleted).toBe(true);
      expect(out.memoryRedacted).toBe(1);

      const row = await memoryOf(tx, userId);
      expect(row.items).toEqual([]);
      /*
       * `input_hash` BLANKED IN THE SAME STATEMENT. An emptied list beside a
       * matching hash means the extractor reports `unchanged` and never writes
       * again -- the feature dead after any erasure, with nothing logged.
       */
      expect(row.input_hash).toBe('');
      /*
       * TOMBSTONES KEPT. This is a REDACTION, not a delete. Dropping the row
       * would resurrect, on a day-three restore, exactly the facts the querent
       * had individually deleted.
       */
      expect(row.dismissed_ids).toEqual(['aabbccddeeff']);
    }));

  it('leaves deleted_at unset when the memory redaction fails', () =>
    withRollback(async (tx) => {
      /*
       * THE BOUNDARY TEST, for the new statement. `redactUserMemory` runs AFTER
       * the revocation and the flag redaction and BEFORE `deleted_at`, so a
       * failure here must unwind all three. Without this, "same transaction" is
       * a claim in a comment.
       */
      const userId = await seedUserWithFlag(tx);

      await tx.execute(sql`
        create function pg_temp.boom_mem() returns trigger language plpgsql as
          $$ begin raise exception 'boom'; end $$`);
      await tx.execute(sql`
        create trigger t_boom_mem before update on user_memory
          for each row execute function pg_temp.boom_mem()`);

      await expect(deleteAccount(tx, userId)).rejects.toThrow();

      await tx.execute(sql`drop trigger t_boom_mem on user_memory`);

      const rows = await tx.execute(sql`select deleted_at from users where id = ${userId}`);
      expect(rows[0].deleted_at).toBeNull();

      /*
       * Both EARLIER statements rolled back too, which is the assertion that
       * proves the whole thing unwound rather than that the failing statement
       * simply came last.
       */
      const flags = await tx.execute(
        sql`select question from moderation_flags where user_id = ${userId}`,
      );
      expect(flags[0].question).not.toBeNull();
      const links = await tx.execute(
        sql`select revoked_at from share_links where user_id = ${userId}`,
      );
      expect(links[0].revoked_at).toBeNull();
    }));

  it('does not touch another account memory', () =>
    withRollback(async (tx) => {
      const mine = await seedUserWithFlag(tx);
      const theirs = await seedUserWithFlag(tx);

      await deleteAccount(tx, mine);

      expect((await memoryOf(tx, theirs)).items).toHaveLength(1);
    }));
});

describe('the transaction boundary, asserted on the source', () => {
  /*
   * A source-level guard in `legal.test.ts`'s register, and it earns its place
   * for that file's reason: the runtime test above proves the rollback happens
   * TODAY, and this one proves nobody moved the redaction out of the transaction
   * while keeping the runtime test green by other means -- which is exactly what
   * "refactor the deletion into three awaited helpers" would do.
   */
  it('calls revokeAllForUser and redactForUser inside the transaction, before the flag', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/account/delete.ts', 'utf8');

    const open = src.indexOf('.transaction(');
    expect(open).toBeGreaterThan(-1);

    const body = src.slice(open);
    const revoke = body.indexOf('revokeAllForUser(');
    const redact = body.indexOf('redactForUser(');
    const memory = body.indexOf('redactUserMemory(');
    const flag = body.indexOf('deletedAt:');

    expect(revoke).toBeGreaterThan(-1);
    expect(redact).toBeGreaterThan(-1);
    expect(memory).toBeGreaterThan(-1);
    expect(flag).toBeGreaterThan(-1);

    // Reconciliation §5.6's order, plus R2's: revoke -> redact -> memory -> flag.
    // Every statement that actually removes something comes before the flag, so a
    // failure in any of them aborts rather than marking an account deleted with
    // its contents intact.
    expect(revoke).toBeLessThan(redact);
    expect(redact).toBeLessThan(memory);
    expect(memory).toBeLessThan(flag);
  });

  it('does not call clearFreeTextAnswers, which is deliberate (A1)', async () => {
    const { readFileSync } = await import('node:fs');
    /*
     * COMMENTS STRIPPED FIRST, and the first draft did not do that and FAILED --
     * because `delete.ts`'s header explains at length WHY `clearFreeTextAnswers()`
     * is absent, parentheses and all. `queries/contract.test.ts` and
     * `clientBoundary.test.ts` both record the same lesson: a rule that fires on
     * prose describing the rule is a rule people delete.
     */
    const src = readFileSync('src/lib/account/delete.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    // `onboarding_answers` is `on delete cascade`; clearing it now would break
    // the thirty-day restore the confirmation copy promises.
    expect(/clearFreeTextAnswers\s*\(/.test(src)).toBe(false);
  });
});

/**
 * ── v0.7.0's ERASURE AUDIT (`F1-D10`, `C-D20`) ────────────────────────────
 *
 * `C-D20` requires this written down **even if the answer is "the cascade covers
 * it"**, and it is not quite trivial, so here it is both written and asserted.
 *
 * **THE CHAT IS ON `readings`' SIDE OF `delete.ts`'s ASYMMETRY, NOT
 * `moderation_flags`'.** That header states the rule that decides it: *"the asymmetry
 * with `moderation_flags` IS the asymmetry in the foreign keys: `set null` outlives the
 * account, `cascade` does not."* `moderation_flags.user_id` is `set null`, so a
 * self-harm disclosure would sit there for thirty more days and is therefore redacted
 * inside the erasure transaction. `chat_threads`, `chat_messages` and `chat_runs` all
 * CASCADE, so they are gone at the hard delete — **and clearing them at the soft delete
 * would break the thirty-day restore the confirmation copy promises**, which is
 * precisely why `clearFreeTextAnswers()` is deliberately absent from that transaction.
 *
 * **SO `deleteAccount()` GAINS ZERO LINES AND `redactForUser` IS NOT EXTENDED.** These
 * two cases are the audit; the first is named for the PROMISE rather than for the
 * mechanism, per `C-D20`.
 */
describe("the group chat and the erasure promise", () => {
  /** A thread, a run, a user message and a reader message, all committed to `tx`. */
  async function seedRoom(tx: Tx, userId: string) {
    await tx.insert(chatThreads).values({ userId, lastUserMessageAt: new Date() });
    const [run] = await tx
      .insert(chatRuns)
      .values({ userId, trigger: 'user_message', locale: 'id', status: 'done' })
      .returning({ id: chatRuns.id });
    await tx.insert(chatMessages).values([
      { userId, author: 'user', body: 'hal paling berat yang pernah aku lihat', locale: 'id' },
      { userId, author: 'adrian', body: 'kapan itu?', locale: 'id', runId: run.id, beatIndex: 0 },
    ]);
  }

  const counts = async (tx: Tx, userId: string) => {
    const one = async (table: typeof chatThreads | typeof chatMessages | typeof chatRuns) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(table)
        .where(sql`user_id = ${userId}`);
      return row.n;
    };
    return {
      threads: await one(chatThreads),
      messages: await one(chatMessages),
      runs: await one(chatRuns),
    };
  };

  it('THE WHOLE ROOM GOES WITH THE ACCOUNT, at the hard delete', () =>
    withRollback(async (tx) => {
      /*
       * **NAMED FOR THE PROMISE**: `/privacy` clause 8 says the room is removed from
       * the database within thirty days, and this is the only thing that makes that
       * sentence true. The mechanism is the cascade on `user_id`.
       *
       * **`chat_messages.user_id` MUST STAY `on delete cascade`.** The day somebody
       * changes it to `set null` "to keep the analytics", a redaction obligation
       * arrives with it and this paragraph becomes false — silently, because the
       * account would still look deleted.
       */
      const userId = await seedUserWithFlag(tx);
      await seedRoom(tx, userId);
      expect(await counts(tx, userId)).toEqual({ threads: 1, messages: 2, runs: 1 });

      await tx.delete(users).where(sql`id = ${userId}`);

      expect(await counts(tx, userId)).toEqual({ threads: 0, messages: 0, runs: 0 });
    }));

  it('the SOFT delete keeps it, because the restore window has to mean something', () =>
    withRollback(async (tx) => {
      /*
       * **NOT AN OVERSIGHT — THE SAME RULING `clearFreeTextAnswers()` IS ABSENT
       * UNDER.** The confirmation copy promises thirty days in which signing back in
       * undoes everything, and a room cleared at the soft delete would make that
       * promise false in the one way the querent would notice most.
       */
      const userId = await seedUserWithFlag(tx);
      await seedRoom(tx, userId);

      const out = await deleteAccount(tx, userId);
      expect(out.deleted).toBe(true);

      expect(await counts(tx, userId)).toEqual({ threads: 1, messages: 2, runs: 1 });
    }));

  it('deleteAccount gains zero lines for the chat, asserted on the source', async () => {
    /*
     * `F1-D10`'s conclusion, made mechanical. If a future session "helpfully" adds a
     * chat redaction here, this fails and sends them to the paragraph above — where
     * the reason it must not exist is written down.
     */
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/account/delete.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/chat_?[Mm]essages|chatThreads|chatRuns/);
  });
});

describe('testDb is reachable', () => {
  it('answers a trivial query, so a red suite means the code and not the container', async () => {
    const rows = await testDb.execute(sql`select 1 as one`);
    expect(rows[0].one).toBe(1);
  });
});
