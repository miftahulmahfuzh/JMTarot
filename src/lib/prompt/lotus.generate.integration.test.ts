/**
 * `LOTUS_GENERATION_ENABLED`, against a real database and a fake provider.
 *
 * **THIS FILE EXISTS FOR ONE ASSERTION: THE DISABLED PATH WRITES NOTHING.**
 *
 * The obvious implementation of this flag was to reuse `LOTUS_STUB`'s branch and
 * store `fallbackLotus(input)`, and it is a trap that survives a green suite,
 * a green typecheck and a manual test. `store()` writes `input_hash` and
 * `source_version`, and `lotusInputHash` digests the birth year and the six
 * onboarding answers -- **nothing else, so it never moves again**. The row would
 * therefore match its own hash forever, `generateLotus`'s `unchanged` check would
 * return early for good, and every querent who onboarded while the flag was off
 * would feed a TEMPLATE into every reading they ever took, after the flag went
 * back to `1`, with nothing anywhere reporting it.
 *
 * That is the same failure CLAUDE.md forbids `LOTUS_STUB` in production for, and a
 * production-legal flag has to be better than the variable it replaces rather than
 * a rename of it. The third test is the one that fails if somebody "simplifies"
 * the guard back into the `stubbed()` branch.
 *
 * `resetDb()` rather than `withRollback`, and the two mocks below, for the reasons
 * `generate.integration.test.ts` sets out: the module under test reaches the `db`
 * singleton and cannot be handed a transaction.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const complete = vi.fn();
vi.mock('@/lib/llm', () => ({ getProvider: () => ({ complete }) }));

/**
 * THE `db` SINGLETON, POINTED AT THE TEST DATABASE. `@/lib/db/client` reads
 * `DATABASE_URL` -- the DEV database -- and this suite calls `resetDb()`.
 */
vi.mock('@/lib/db/client', async () => {
  const { testDb } = await import('@/lib/db/testing/harness');
  return { db: testDb };
});

const { closeTestDb, resetDb, testDb } = await import('@/lib/db/testing/harness');
const { profiles, users } = await import('@/lib/db/schema');
const { upsertAnswer } = await import('@/lib/db/queries/onboarding');
const { getLotusAvatar } = await import('@/lib/db/queries/lotus');
const { generateLotus } = await import('./lotus.generate');

afterAll(closeTestDb);

/** A clean, complete user with one free-text answer, so there is something to distil. */
async function seed(): Promise<string> {
  const [user] = await testDb
    .insert(users)
    .values({ googleSub: 'dev:lotus-flag', email: 'lf@example.com' })
    .returning({ id: users.id });

  await testDb.insert(profiles).values({
    userId: user.id,
    fullName: 'Miftahul Mahfuzh',
    nickname: 'Mifta',
    birthDate: '1994-03-14',
    completedAt: new Date(),
  });

  await upsertAnswer(testDb, user.id, {
    key: 'best_thing',
    text: 'the morning my sister called to say she had arrived',
    skipped: false,
  } as never);

  return user.id;
}

/**
 * Bare JSON in the contract's real shape: SNAKE_CASE summary keys and `traits` as
 * an OBJECT, not an array. `parseLotusResponse` throws on anything else and
 * `generateLotus` catches that into the fallback with `reason: 'unparseable'` --
 * which is how a first draft of this file "passed" the disabled tests while every
 * enabled one silently exercised the fallback path instead of the model path.
 *
 * The English half carries NO GENDERED PRONOUN (safety rule 2) and neither half
 * shares a six-word run with the seeded answer (rule 5, anti-quotation), or the
 * safety check would store the template and `model` would read `fallback`.
 */
const MODEL_JSON = JSON.stringify({
  summary_id:
    'Seseorang yang menimbang lama sebelum memutuskan, dan bertahan pada pilihannya setelah itu.',
  summary_en:
    'Someone who weighs a decision for a long time, and then holds to what was chosen.',
  traits: { themes: ['ketekunan', 'kehati-hatian'], anchor: 'saudara', wish_kind: 'bertemu' },
});

beforeEach(async () => {
  await resetDb();
  complete.mockReset();
  delete process.env.LOTUS_STUB;
  delete process.env.LOTUS_GENERATION_ENABLED;
  process.env.LOTUS_MODEL = 'test-model';
});

describe('LOTUS_GENERATION_ENABLED=0', () => {
  it('makes no provider call', async () => {
    process.env.LOTUS_GENERATION_ENABLED = '0';
    const userId = await seed();

    const out = await generateLotus(userId);

    expect(complete).not.toHaveBeenCalled();
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('disabled');
  });

  it('WRITES NOTHING — no row, not even the template', async () => {
    /*
     * THE ASSERTION THIS FILE EXISTS FOR. `fallback: false` is part of it: a
     * `fallback: true` outcome would mean a template was produced and stored, which
     * is exactly the poisoning this flag must not do.
     */
    process.env.LOTUS_GENERATION_ENABLED = '0';
    const userId = await seed();

    const out = await generateLotus(userId);

    expect(out.fallback).toBe(false);
    expect(await getLotusAvatar(testDb, userId)).toBeNull();
  });

  it('distils for real the moment the flag comes back, with no backfill', async () => {
    /*
     * SELF-HEALING, AND THE REGRESSION TEST FOR THE TRAP. Nothing about this user
     * changes between the two calls -- no reading, no answer edit, no facts edit --
     * because `lotusInputHash` would not notice any of them anyway. The ONLY reason
     * the second call reaches the model is that the first wrote no row for the
     * `unchanged` check to match.
     *
     * Reuse `stubbed()`'s store here and this test fails while every other test in
     * the repo stays green. That is the whole point of it.
     */
    process.env.LOTUS_GENERATION_ENABLED = '0';
    const userId = await seed();
    await generateLotus(userId);
    expect(await getLotusAvatar(testDb, userId)).toBeNull();

    delete process.env.LOTUS_GENERATION_ENABLED;
    complete.mockResolvedValue({ text: MODEL_JSON, usage: {} });

    const out = await generateLotus(userId);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(true);
    expect(out.fallback).toBe(false);
    const stored = await getLotusAvatar(testDb, userId);
    expect(stored?.model).toBe('test-model');
    // `model: 'test-model'` rather than `'fallback'` IS the assertion that the
    // model's own output was stored -- `store()` writes the literal `'fallback'`
    // for anything the parser or the safety check rejected.
    expect(stored?.traits).toMatchObject({ themes: ['ketekunan', 'kehati-hatian'] });
  });

  it('leaves an already-distilled block alone rather than degrading it', async () => {
    /*
     * The other half of "writes nothing": a querent who HAS a real block keeps it.
     * The guard sits above every read, so this is structural rather than lucky --
     * but it is the property an operator is relying on, so it is asserted.
     */
    const userId = await seed();
    complete.mockResolvedValue({ text: MODEL_JSON, usage: {} });
    await generateLotus(userId);
    expect((await getLotusAvatar(testDb, userId))?.model).toBe('test-model');

    process.env.LOTUS_GENERATION_ENABLED = '0';
    complete.mockClear();

    const out = await generateLotus(userId);

    expect(complete).not.toHaveBeenCalled();
    expect(out.reason).toBe('disabled');
    expect((await getLotusAvatar(testDb, userId))?.model).toBe('test-model');
  });
});

describe('LOTUS_GENERATION_ENABLED unset', () => {
  it('distils normally — the flag defaults to ON', async () => {
    /*
     * The direction that matters for a typo: `ANALYTICS_ENABLED`'s rule means only
     * the literal `'0'` disables, so a mistyped value must leave the Lotus running.
     * `flags.test.ts` covers the predicate; this covers the wiring, so that an
     * inverted guard (`if (lotusGenerationEnabled()) return`) cannot pass.
     */
    process.env.LOTUS_GENERATION_ENABLED = 'false';
    const userId = await seed();
    complete.mockResolvedValue({ text: MODEL_JSON, usage: {} });

    const out = await generateLotus(userId);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(true);
    expect((await getLotusAvatar(testDb, userId))?.model).toBe('test-model');
  });
});
