/**
 * `moderation.ts` against a real Postgres, and against real AES-256-GCM.
 * v0.5.0 / A5, task 3.
 *
 * **THE FOUR STATES ARE THE SUBJECT, AND THE FOURTH IS THE ONE THAT NEEDED A REAL KEY.**
 * `undecryptable` cannot be produced by nullity — it is what happens when the ciphertext is
 * there and will not open — so the case is seeded by encrypting under a **different AAD**,
 * which is exactly the shape of a key rotation and of a user id that moved.
 *
 * The second subject is A5-9: `moderationFlagsForAdmin`'s rows must have no `question` key
 * AT ALL, so that `'question' in row === false` is assertable. A `question: null` field
 * would make that unwritable, and *the binding reason is VD8, not bytes*.
 */
import { globSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encryptField, moderationFlagAad } from '@/lib/db/crypto';
import { moderationFlags, users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { flagQuestionState, moderationFlagsForAdmin, revealFlagQuestion } from './moderation';

afterAll(closeTestDb);

beforeAll(() => {
  // A real 32-byte key, so the encrypt/decrypt round trip is real. `crypto.ts` caches the
  // key at first use, which is why this is set before any test runs rather than per test.
  process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
});

let n = 0;

async function seedUser(tx: Tx): Promise<string> {
  n += 1;
  const [row] = await tx
    .insert(users)
    .values({ googleSub: `a5mod:${n}`, email: `a5mod-${n}@example.com` })
    .returning({ id: users.id });
  return row.id;
}

async function seedFlag(
  tx: Tx,
  userId: string,
  over: Partial<{ question: string | null; redactedAt: Date | null; category: string }> = {},
): Promise<string> {
  const [row] = await tx
    .insert(moderationFlags)
    .values({
      userId,
      question: over.question ?? null,
      questionHmac: `hmac${n}abcdefghijklmnop`,
      category: over.category ?? 'self_harm',
      source: 'blocklist',
      action: 'blocked',
      locale: 'id',
      patternId: 'id.self_harm.method',
      confidence: 0.9,
      redactedAt: over.redactedAt ?? null,
    })
    .returning({ id: moderationFlags.id });
  return row.id;
}

describe('the four states (§6.3, plan §4.12)', () => {
  it('available -> the plaintext, through the one decrypt site', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const flagId = await seedFlag(tx, user, {
        question: encryptField('haruskah aku pergi', moderationFlagAad(user)),
      });

      expect(await flagQuestionState(tx, user, flagId)).toEqual({ state: 'available' });
      expect(await revealFlagQuestion(tx, user, flagId)).toEqual({
        flagId,
        state: 'available',
        question: 'haruskah aku pergi',
      });
    }));

  it('redacted -> the date, and NO plaintext anywhere in the result object', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const flagId = await seedFlag(tx, user, { question: null, redactedAt: new Date() });

      const state = await flagQuestionState(tx, user, flagId);
      expect(state?.state).toBe('redacted');
      const revealed = await revealFlagQuestion(tx, user, flagId);
      expect(revealed?.state).toBe('redacted');
      // Not merely absent from a field: absent from the whole serialisation.
      expect(JSON.stringify(revealed)).not.toContain('question"');
      expect(JSON.stringify(revealed)).not.toContain('v1.');
    }));

  it('never_stored -> both columns NULL, which is sexual_minor or no question', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const flagId = await seedFlag(tx, user, {
        question: null,
        redactedAt: null,
        category: 'sexual_minor',
      });

      expect(await flagQuestionState(tx, user, flagId)).toEqual({ state: 'never_stored' });
      expect(await revealFlagQuestion(tx, user, flagId)).toEqual({ flagId, state: 'never_stored' });
    }));

  it('undecryptable -> a WRONG AAD is not the same fact as a redaction', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const other = await seedUser(tx);
      // Encrypted under somebody else's AAD: the shape of a rotated key, and of a user id
      // that moved. `decryptField` returns null rather than throwing.
      const flagId = await seedFlag(tx, user, {
        question: encryptField('teks', moderationFlagAad(other)),
      });

      // The STATE read still says available -- it reads nullity, and the column is not
      // null. That is why the reveal re-reads and why the union has a fourth member.
      expect(await flagQuestionState(tx, user, flagId)).toEqual({ state: 'available' });
      expect(await revealFlagQuestion(tx, user, flagId)).toEqual({
        flagId,
        state: 'undecryptable',
      });
    }));
});

describe('the presence list carries no question key at all (A5-8, A5-9)', () => {
  it('returns the state and a 12-char hmac prefix, and never the column', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      await seedFlag(tx, user, { question: encryptField('teks', moderationFlagAad(user)) });

      const [row] = await moderationFlagsForAdmin(tx, user);
      expect('question' in row).toBe(false);
      expect('questionHmac' in row).toBe(false);
      expect(row.hmacPrefix).toHaveLength(12);
      expect(row.state).toBe('available');
      expect(row.patternId).toBe('id.self_harm.method');
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(JSON.stringify(row)).not.toContain('v1.');
    }));

  it('labels the three nullity states without decrypting anything', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      await seedFlag(tx, user, { question: encryptField('a', moderationFlagAad(user)) });
      await seedFlag(tx, user, { question: null, redactedAt: new Date() });
      await seedFlag(tx, user, { question: null, redactedAt: null });

      const states = (await moderationFlagsForAdmin(tx, user)).map((r) => r.state).sort();
      expect(states).toEqual(['available', 'never_stored', 'redacted']);
    }));
});

describe('ownership is a predicate, even for an admin (A5-16)', () => {
  it('a flag belonging to another user is null, not another user data', () =>
    withRollback(async (tx) => {
      const mine = await seedUser(tx);
      const theirs = await seedUser(tx);
      const flagId = await seedFlag(tx, theirs, {
        question: encryptField('rahasia', moderationFlagAad(theirs)),
      });

      expect(await flagQuestionState(tx, mine, flagId)).toBeNull();
      expect(await revealFlagQuestion(tx, mine, flagId)).toBeNull();
      expect(await moderationFlagsForAdmin(tx, mine)).toEqual([]);
    }));

  it('is null for a malformed uuid rather than raising 22P02 (A5-17)', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      expect(await flagQuestionState(tx, user, 'banana')).toBeNull();
      expect(await revealFlagQuestion(tx, 'banana', 'banana')).toBeNull();
    }));
});

/** The file with its comments removed. See the assertion below for why. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('A5-7 -- one column, one encryptor, one decryptor', () => {
  it('names moderationFlagAad in exactly three files repo-wide', () => {
    /*
     * `crypto.ts` defines it, `moderation/log.ts` encrypts with it, this directory's
     * `moderation.ts` decrypts with it. **A fourth file is the defect this asserts
     * against** -- a second decrypt site makes the audit two files instead of one, and a
     * mismatched AAD is indistinguishable from data loss.
     *
     * Test files are excluded: this file necessarily names it to seed the four states.
     *
     * **COMMENTS ARE STRIPPED, AND THIS PROJECT HAS PAID FOR THAT TWICE.**
     * `queries/contract.test.ts` parses import specifiers rather than grepping because its
     * first version failed against the sentence *"Never import from '../client'"* in a doc
     * comment; `adminSurface.test.ts` strips for the same reason. Here it is `schema.ts`,
     * whose `moderation_flags.question` column says *"Write it only through encryptField()
     * with moderationFlagAad(userId)"* — the rule stated where somebody will read it, which
     * an un-stripped grep counts as a fourth site. **A rule that fires on prose describing
     * the rule is a rule people delete.**
     */
    const hits = globSync('src/**/*.{ts,tsx}')
      .filter((f) => !f.includes('.test.'))
      .filter((f) => code(f).includes('moderationFlagAad'))
      .map((f) => f.replaceAll('\\', '/'))
      .sort();

    expect(hits).toEqual([
      'src/lib/db/crypto.ts',
      'src/lib/db/queries/admin/moderation.ts',
      'src/lib/moderation/log.ts',
    ]);
  });
});
