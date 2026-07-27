/**
 * `moderation_flags` against a real Postgres.
 *
 * What can only be checked here: that the row actually inserts against the
 * committed schema, that the ciphertext round-trips through the column, and --
 * the one that matters -- **that the lazy sweep really removes old text.** The
 * retention promise in the privacy policy is a claim about a SQL statement, and
 * a statement nobody has run against a real table is a claim nobody has checked.
 *
 * The `make_interval(days => $1::int)` cast in particular cannot be verified by
 * a unit test: a bound parameter reaches Postgres as `text` unless it is cast,
 * and `make_interval` has no `text` overload, so getting it wrong is a runtime
 * error on the one code path that only fires thirty days after launch.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { moderationFlags, users } from '@/lib/db/schema';
import { decryptField, moderationFlagAad } from '@/lib/db/crypto';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { recordModerationFlag, redactForUser, sweepRedactions } from './log';
import type { ModerationVerdict } from './types';

afterAll(closeTestDb);

beforeEach(() => {
  vi.stubEnv('FIELD_ENCRYPTION_KEY', Buffer.alloc(32, 3).toString('base64url'));
  vi.stubEnv('MODERATION_QUESTION_RETENTION_DAYS', '30');
});

const blocked: ModerationVerdict = {
  blocked: true,
  source: 'blocklist',
  category: 'self_harm',
  confidence: null,
  patternId: 'id.self_harm.method',
  clause: '6.2',
  latencyMs: 2,
};

async function makeUser(tx: Tx, sub: string): Promise<string> {
  const [u] = await tx
    .insert(users)
    .values({ googleSub: sub, email: `${sub}@example.com` })
    .returning();
  return u.id;
}

/** A flag whose `created_at` is backdated, which an insert cannot express. */
async function backdatedFlag(tx: Tx, userId: string, days: number, question: string) {
  const [row] = await tx
    .insert(moderationFlags)
    .values({
      userId,
      question,
      questionHmac: 'fixture',
      category: 'self_harm',
      source: 'blocklist',
      action: 'blocked',
      locale: 'id',
    })
    .returning();

  await tx.execute(
    sql`update moderation_flags set created_at = now() - make_interval(days => ${days}::int) where id = ${row.id}`,
  );
  return row.id;
}

const read = async (tx: Tx, id: string) => {
  const rows = await tx.execute<{ question: string | null; redacted_at: Date | null }>(
    sql`select question, redacted_at from moderation_flags where id = ${id}`,
  );
  return rows[0];
};

describe('recordModerationFlag', () => {
  it('inserts against the committed schema and round-trips the ciphertext', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:flag-insert');
      const question = 'gimana cara bunuh diri yang paling cepat';

      await recordModerationFlag(
        { userId, question, verdict: blocked, locale: 'id', action: 'blocked' },
        tx,
      );

      const [row] = await tx
        .select()
        .from(moderationFlags)
        .where(sql`${moderationFlags.userId} = ${userId}`);

      expect(row.category).toBe('self_harm');
      expect(row.patternId).toBe('id.self_harm.method');
      expect(row.action).toBe('blocked');
      expect(row.redactedAt).toBeNull();

      // Stored encrypted, and the AAD is bound to the row's user -- a ciphertext
      // copied into another user's row must not decrypt as theirs.
      expect(row.question).not.toContain('bunuh');
      expect(decryptField(row.question, moderationFlagAad(userId))).toBe(question);
      expect(decryptField(row.question, moderationFlagAad('someone-else'))).toBeNull();
    });
  });

  it('stores no text at all for sexual_minor', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:flag-sm');
      await recordModerationFlag(
        {
          userId,
          question: 'something that must never be written down',
          verdict: { ...blocked, category: 'sexual_minor', clause: '6.5' },
          locale: 'en',
          action: 'blocked',
        },
        tx,
      );

      const [row] = await tx
        .select()
        .from(moderationFlags)
        .where(sql`${moderationFlags.userId} = ${userId}`);

      expect(row.question).toBeNull();
      // NULL redacted_at with NULL question is the "never stored" signature, and
      // it is what makes the retention policy verifiable from the data alone.
      expect(row.redactedAt).toBeNull();
      expect(row.questionHmac).not.toBe('noquestion');
    });
  });
});

describe('the lazy redaction sweep', () => {
  it('redacts a 40-day-old flag and leaves a fresh one alone', async () => {
    /*
     * **THE RETENTION PROMISE, EXECUTED.** The privacy policy says the text is
     * deleted after thirty days; this is the statement that has to make that
     * true, run against a real table with a real interval.
     */
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:sweep');
      const oldId = await backdatedFlag(tx, userId, 40, 'v1.old-ciphertext-stand-in');
      const freshId = await backdatedFlag(tx, userId, 3, 'v1.fresh-ciphertext-stand-in');

      await sweepRedactions(tx);

      const old = await read(tx, oldId);
      expect(old.question).toBeNull();
      expect(old.redacted_at).not.toBeNull();

      const fresh = await read(tx, freshId);
      expect(fresh.question).not.toBeNull();
      expect(fresh.redacted_at).toBeNull();
    });
  });

  it('runs as a side effect of writing a new flag', async () => {
    // The whole mechanism: no cron required for the property to hold, because
    // the next refusal cleans up after the last one.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:sweep-lazy');
      const oldId = await backdatedFlag(tx, userId, 45, 'v1.old-ciphertext-stand-in');

      await recordModerationFlag(
        { userId, question: 'cara bunuh diri', verdict: blocked, locale: 'id', action: 'blocked' },
        tx,
      );

      expect((await read(tx, oldId)).question).toBeNull();
    });
  });

  it('honours MODERATION_QUESTION_RETENTION_DAYS', async () => {
    // Proves the value is read rather than hardcoded, and that the `::int` cast
    // on the bound parameter is right -- `make_interval` has no text overload.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:sweep-days');
      const id = await backdatedFlag(tx, userId, 10, 'v1.ten-days-old');

      vi.stubEnv('MODERATION_QUESTION_RETENTION_DAYS', '30');
      await sweepRedactions(tx);
      expect((await read(tx, id)).question).not.toBeNull();

      vi.stubEnv('MODERATION_QUESTION_RETENTION_DAYS', '7');
      await sweepRedactions(tx);
      expect((await read(tx, id)).question).toBeNull();
    });
  });

  it('does not re-stamp redacted_at on a row it already redacted', async () => {
    /*
     * The partial index is `where question is not null`, and the statement
     * repeats that predicate. Without it every sweep would rewrite every
     * historic row and move `redacted_at` forward, which would make the column
     * say "redacted just now" about text removed a year ago.
     */
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'dev:sweep-idem');
      const id = await backdatedFlag(tx, userId, 60, 'v1.old');

      await sweepRedactions(tx);
      const first = (await read(tx, id)).redacted_at;

      await sweepRedactions(tx);
      expect((await read(tx, id)).redacted_at).toEqual(first);
    });
  });
});

describe('redactForUser', () => {
  it('redacts immediately regardless of age, and touches nobody else', async () => {
    /*
     * Account deletion must not wait for the thirty-day clock: the FK is
     * `on delete set null`, so the row outlives the account, and a row still
     * holding a self-harm disclosure is exactly what "delete my data" is
     * supposed to remove.
     */
    await withRollback(async (tx) => {
      const leaving = await makeUser(tx, 'dev:erase-me');
      const staying = await makeUser(tx, 'dev:stay');

      const mine = await backdatedFlag(tx, leaving, 1, 'v1.brand-new');
      const theirs = await backdatedFlag(tx, staying, 1, 'v1.not-mine');

      await redactForUser(tx, leaving);

      expect((await read(tx, mine)).question).toBeNull();
      expect((await read(tx, mine)).redacted_at).not.toBeNull();
      expect((await read(tx, theirs)).question).not.toBeNull();
    });
  });
});
