import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * R2's extractor against a real `user_memory` row.
 *
 * **THE PROVIDER IS MOCKED AND THE DATABASE IS NOT.** The properties worth proving
 * here are the ones a unit test cannot see: that the row is written, that a second
 * call is `unchanged`, that the flag writes NOTHING, and that a rejected reply leaves
 * `input_hash` where it was so the failure self-heals. `prompt.test.ts` owns
 * everything the model's reply is judged by.
 *
 * `resetDb()` rather than `withRollback`, and the two mocks below, for
 * `lotus.generate.integration.test.ts`'s reason: the module under test reaches the
 * `db` singleton and cannot be handed a transaction.
 */

const complete = vi.fn();
vi.mock('@/lib/llm', () => ({ getProvider: () => ({ complete }) }));

/**
 * **THE BUDGET IS STUBBED OPEN.** `reserveChatCall` reaches Upstash or the in-memory
 * limiter, and neither is this file's subject: a shed extraction is `budget.ts`'s
 * property and `[F1-6]`'s, tested there. What matters here is what happens when the
 * call IS made.
 */
vi.mock('@/lib/chat/budget', () => ({ reserveChatCall: async () => ({ ok: true }) }));

/**
 * THE `db` SINGLETON, POINTED AT THE TEST DATABASE. `@/lib/db/client` reads
 * `DATABASE_URL` -- the DEV database -- and this suite calls `resetDb()`.
 */
vi.mock('@/lib/db/client', async () => {
  const { testDb } = await import('@/lib/db/testing/harness');
  return { db: testDb };
});

const { closeTestDb, resetDb, testDb } = await import('@/lib/db/testing/harness');
const { users } = await import('@/lib/db/schema');
const { insertMessage } = await import('@/lib/db/queries/chat');
const { getUserMemory, upsertUserMemory, dismissUserMemoryItems } = await import(
  '@/lib/db/queries/memory'
);
const { USER_MEMORY_SOURCE_VERSION } = await import('./types');
const { PROFILE_MEMORY_MIN_MESSAGES, userMemoryItemId } = await import('./prompt');
const { extractProfileMemory, scheduleProfileExtraction } = await import('./generate');

afterAll(closeTestDb);

/** One reply in the contract's real shape: a bare JSON array, nothing else. */
const LARI = '[{"kind":"habit","text":"lari pagi, idealnya jam lima"}]';
const NASI = '[{"kind":"taste","text":"suka nasi padang buat makan malam"}]';

let n = 0;

async function seedUser(): Promise<string> {
  n += 1;
  const [user] = await testDb
    .insert(users)
    .values({ googleSub: `pm:${n}`, email: `pm${n}@example.com` })
    .returning({ id: users.id });
  return user.id;
}

/** `count` messages the querent typed. A user message belongs to no run, so no
 *  `chat_runs` row is needed and nothing here depends on the engine. */
async function say(userId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await insertMessage(testDb, {
      userId,
      author: 'user',
      body: `pesan nomor ${n}-${i}`,
      locale: 'id',
    });
  }
}

beforeEach(async () => {
  complete.mockReset();
  delete process.env.PROFILE_MEMORY_ENABLED;
  delete process.env.PROFILE_MEMORY_MIN_AGE_SECONDS;
  await resetDb();
});

afterAll(() => {
  delete process.env.PROFILE_MEMORY_ENABLED;
  delete process.env.PROFILE_MEMORY_MIN_AGE_SECONDS;
});

describe('extractProfileMemory', () => {
  it('writes a row from a fixture transcript', async () => {
    const userId = await seedUser();
    await say(userId, PROFILE_MEMORY_MIN_MESSAGES);
    complete.mockResolvedValue({ text: LARI, usage: {} });

    const outcome = await extractProfileMemory(userId, 'id');
    expect({ ok: outcome.ok, items: outcome.items, returned: outcome.returned }).toEqual({
      ok: true,
      items: 1,
      returned: 1,
    });

    const row = await getUserMemory(testDb, userId);
    expect(row?.items.map((i) => i.kind)).toEqual(['habit']);
    expect(row?.sourceVersion).toBe(USER_MEMORY_SOURCE_VERSION);
    expect(row?.inputHash).not.toBe('');
    expect(row?.dismissedIds).toEqual([]);
  });

  it('returns `unchanged` on a second call with no new message, and makes NO model call', async () => {
    const userId = await seedUser();
    await say(userId, PROFILE_MEMORY_MIN_MESSAGES);
    complete.mockResolvedValue({ text: LARI, usage: {} });

    await extractProfileMemory(userId, 'id');
    const second = await extractProfileMemory(userId, 'id');

    expect(second.reason).toBe('unchanged');
    expect(second.items).toBe(1);
    // Idempotence is what makes a call from the end of every run affordable.
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('regenerates once a new message moves the hash', async () => {
    const userId = await seedUser();
    await say(userId, PROFILE_MEMORY_MIN_MESSAGES);
    complete.mockResolvedValue({ text: LARI, usage: {} });
    await extractProfileMemory(userId, 'id');

    await say(userId, 1);
    complete.mockResolvedValue({ text: NASI, usage: {} });
    const again = await extractProfileMemory(userId, 'id');

    expect(again.ok).toBe(true);
    expect(complete).toHaveBeenCalledTimes(2);
    const row = await getUserMemory(testDb, userId);
    expect(row?.items.map((i) => i.kind)).toEqual(['taste']);
  });

  it('does not extract below PROFILE_MEMORY_MIN_MESSAGES', async () => {
    const userId = await seedUser();
    await say(userId, PROFILE_MEMORY_MIN_MESSAGES - 1);

    const outcome = await extractProfileMemory(userId, 'id');
    expect(outcome.reason).toBe('too_early');
    expect(complete).not.toHaveBeenCalled();
    expect(await getUserMemory(testDb, userId)).toBeNull();
  });

  it('WRITES NOTHING with PROFILE_MEMORY_ENABLED=0, and reads nothing either', async () => {
    process.env.PROFILE_MEMORY_ENABLED = '0';
    const userId = await seedUser();
    await say(userId, PROFILE_MEMORY_MIN_MESSAGES);

    const outcome = await extractProfileMemory(userId, 'id');
    expect(outcome).toMatchObject({ ok: true, reason: 'disabled', items: 0 });
    expect(complete).not.toHaveBeenCalled();
    /*
     * **THE THIRD SHAPE.** The hash MOVES here, so storing a fallback would have been
     * safe -- but nothing 500s on a missing row and there is no honest template
     * version of a memory, so nothing is written. `flags.ts`'s header carries the
     * table; this is the assertion under it.
     */
    expect(await getUserMemory(testDb, userId)).toBeNull();
  });

  it('leaves an EXISTING memory untouched with the flag off', async () => {
    const userId = await seedUser();
    await say(userId, PROFILE_MEMORY_MIN_MESSAGES);
    complete.mockResolvedValue({ text: LARI, usage: {} });
    await extractProfileMemory(userId, 'id');
    const before = await getUserMemory(testDb, userId);

    process.env.PROFILE_MEMORY_ENABLED = '0';
    await say(userId, 1); // the hash has moved; the flag must still write nothing
    await extractProfileMemory(userId, 'id');

    expect(await getUserMemory(testDb, userId)).toEqual(before);
  });

  it('leaves `input_hash` alone when the reply is rejected, so the next run retries', async () => {
    const userId = await seedUser();
    await say(userId, PROFILE_MEMORY_MIN_MESSAGES);
    complete.mockResolvedValue({ text: LARI, usage: {} });
    await extractProfileMemory(userId, 'id');
    const before = await getUserMemory(testDb, userId);

    await say(userId, 1);
    complete.mockResolvedValue({ text: 'not json', usage: {} });
    const bad = await extractProfileMemory(userId, 'id');

    expect(bad).toMatchObject({ ok: false, reason: 'unparseable' });
    // Nothing written at all -- the hash still names the OLD newest message, so the
    // next completed run finds the same drift and tries again.
    expect(await getUserMemory(testDb, userId)).toEqual(before);
  });

  it('never replaces a stored memory with an empty one', async () => {
    const userId = await seedUser();
    await say(userId, PROFILE_MEMORY_MIN_MESSAGES);
    complete.mockResolvedValue({ text: LARI, usage: {} });
    await extractProfileMemory(userId, 'id');

    await say(userId, 1);
    complete.mockResolvedValue({ text: '[]', usage: {} });
    const empty = await extractProfileMemory(userId, 'id');

    expect(empty).toMatchObject({ ok: false, reason: 'would_empty' });
    const row = await getUserMemory(testDb, userId);
    expect(row?.items).toHaveLength(1);
  });

  it('carries the suppression list forward across a regeneration, and never writes it', async () => {
    const userId = await seedUser();
    await say(userId, PROFILE_MEMORY_MIN_MESSAGES);

    const nasiId = userMemoryItemId('taste', 'suka nasi padang buat makan malam');
    await upsertUserMemory(testDb, {
      userId,
      items: [{ id: nasiId, kind: 'taste', text: 'suka nasi padang buat makan malam', lastSeen: '2026-08-30' }],
      inputHash: 'stale',
      sourceVersion: USER_MEMORY_SOURCE_VERSION,
      model: 'glm-5.3',
      promptVersion: 'pm-1',
    });
    await dismissUserMemoryItems(testDb, userId, [nasiId]);

    // The model re-derives the deleted fact AND one new one.
    complete.mockResolvedValue({
      text: `[{"kind":"taste","text":"suka nasi padang buat makan malam"},{"kind":"habit","text":"lari pagi, idealnya jam lima"}]`,
      usage: {},
    });
    const outcome = await extractProfileMemory(userId, 'id');

    expect(outcome.ok).toBe(true);
    const row = await getUserMemory(testDb, userId);
    /*
     * **THE DELETION STUCK.** The extractor mechanically drops any produced item whose
     * id is in `dismissed_ids` -- and `dropped` reports it: the model returned two and
     * one survived.
     */
    expect(row?.items.map((i) => i.kind)).toEqual(['habit']);
    expect({ returned: outcome.returned, items: outcome.items }).toEqual({ returned: 2, items: 1 });
    /*
     * **AND THE COLUMN SURVIVED THE WRITE.** `upsertUserMemory`'s `set` list does not
     * name `dismissed_ids`, so this is a property of the SQL rather than of the
     * extractor's discipline.
     */
    expect(row?.dismissedIds).toEqual([nasiId]);
  });

  it('reads chat_messages and nothing else', () => {
    /*
     * `C-D8` condition 5 -- a skipped onboarding answer stays skipped -- enforced by
     * CONSTRUCTION rather than by prompting, `A5`'s mechanism. Asserted on the import
     * list, the way `clientBoundary.test.ts` asserts a boundary: a grep, because the
     * property is "nobody decided to add one".
     */
    const src = readFileSync('src/lib/memory/profile/generate.ts', 'utf8');
    for (const forbidden of [
      'queries/onboarding',
      'queries/lotus',
      'queries/profile',
      'queries/history',
      'queries/allTime',
    ]) {
      expect({ forbidden, present: src.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
  });
});

describe('scheduleProfileExtraction', () => {
  it('respects the caller-side floor, which the generator itself does not have (A13)', async () => {
    process.env.PROFILE_MEMORY_MIN_AGE_SECONDS = '86400';
    const userId = await seedUser();
    await say(userId, PROFILE_MEMORY_MIN_MESSAGES);
    complete.mockResolvedValue({ text: LARI, usage: {} });

    await scheduleProfileExtraction(userId, 'id');
    await say(userId, 1);
    const throttled = await scheduleProfileExtraction(userId, 'id');

    expect(throttled.reason).toBe('unchanged');
    expect(complete).toHaveBeenCalledTimes(1);

    /*
     * **AND THE GENERATOR IGNORES IT.** The floor is the CALLER's -- W3's trap, where
     * `scheduleLotusRefresh`'s cooldown swallowed a user-caused edit. A future
     * "refresh my memory now" control calls this one and must not be throttled.
     */
    const forced = await extractProfileMemory(userId, 'id');
    expect(forced.ok).toBe(true);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('writes nothing and reads nothing with the flag off, before any query', async () => {
    process.env.PROFILE_MEMORY_ENABLED = '0';
    const userId = await seedUser();
    await say(userId, PROFILE_MEMORY_MIN_MESSAGES);

    expect(await scheduleProfileExtraction(userId, 'id')).toMatchObject({
      ok: true,
      reason: 'disabled',
    });
    expect(await getUserMemory(testDb, userId)).toBeNull();
  });
});
