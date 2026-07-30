/**
 * The persona generator's wiring, against a real database and a fake provider.
 *
 * WHY THIS IS AN INTEGRATION TEST RATHER THAN A UNIT ONE. `generatePersona` reads
 * from six query modules and writes to a seventh; mocking all of them would assert
 * that the function calls the mocks, which is the one thing that cannot be wrong in
 * a way anybody cares about. What CAN be wrong -- and what this catches -- is that
 * the reads compose against the actual schema, that the upsert's conflict target is
 * the one the table has, and that `updated_at` moves.
 *
 * WHAT IS ASSERTED, and each of them decides something real:
 *
 *   - A MATCHING STORED ROW MAKES NO MODEL CALL. Asserted on the CALL COUNT,
 *     because it is what makes calling this from a write path affordable.
 *   - A CHANGED FACT REGENERATES. Without it the facts editor is a lie.
 *   - A BANNED WORD WRITES THE FALLBACK AND `model = 'fallback'`. The safety gate
 *     is the whole reason the persona can go on a public page.
 *   - `PERSONA_STUB=1` MAKES NO NETWORK CALL.
 *   - A THROWING PROVIDER DOES NOT THROW OUT. The caller may be an `after()`.
 *
 * `resetDb()` rather than `withRollback`, because the module under test reaches the
 * `db` singleton -- which is mocked to the test handle below -- and cannot be handed
 * a transaction. `resetDb` is the escape hatch the harness documents for exactly
 * this shape.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const complete = vi.fn();
vi.mock('@/lib/llm', () => ({ getProvider: () => ({ complete }) }));

/**
 * THE `db` SINGLETON, POINTED AT THE TEST DATABASE.
 *
 * `@/lib/db/client` starts with `import 'server-only'` and reads `DATABASE_URL` --
 * the DEV database. Letting this suite reach it would mean a test that TRUNCATEs
 * somebody's local data, which is the exact mistake `TEST_DATABASE_URL`'s separate
 * variable and the `_test` suffix guard exist to prevent.
 */
vi.mock('@/lib/db/client', async () => {
  const { testDb } = await import('@/lib/db/testing/harness');
  return { db: testDb };
});

const { closeTestDb, resetDb, testDb } = await import('@/lib/db/testing/harness');
const { profiles, users } = await import('@/lib/db/schema');
const { upsertAnswer } = await import('@/lib/db/queries/onboarding');
const { getPersona } = await import('@/lib/db/queries/persona');
const { generatePersona, personaMaterial } = await import('./generate');
const { PERSONA_PROMPT_VERSION, PERSONA_SOURCE_VERSION } = await import('./prompt');

afterAll(closeTestDb);

/** A clean, complete, English-answering user. */
async function seed(): Promise<string> {
  const [user] = await testDb
    .insert(users)
    .values({ googleSub: 'dev:persona-gen', email: 'pg@example.com' })
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
  await upsertAnswer(testDb, user.id, {
    key: 'color',
    choice: 'grey',
    text: null,
    skipped: false,
  } as never);

  return user.id;
}

const CLEAN =
  'Angka jalan hidupmu enam, dan wujudnya The Lovers: pilihan yang tidak bisa dibagi dua. Kamu cenderung menimbang lama lalu bertahan pada hasilnya. Kekuatanmu dan bebanmu satu benda yang sama.';

beforeEach(async () => {
  await resetDb();
  complete.mockReset();
  delete process.env.PERSONA_STUB;
  delete process.env.PERSONA_GENERATION_ENABLED;
  process.env.PERSONA_MODEL = 'test-model';
});

describe('generatePersona', () => {
  it('refuses a user with no completed profile, without calling the model', async () => {
    const [user] = await testDb
      .insert(users)
      .values({ googleSub: 'dev:incomplete', email: 'i@example.com' })
      .returning({ id: users.id });

    const out = await generatePersona(user.id, 'id');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('not_completed');
    expect(complete).not.toHaveBeenCalled();
  });

  it('writes a row on the first call, with the model and prompt version', async () => {
    const userId = await seed();
    complete.mockResolvedValue({ text: CLEAN, usage: {} });

    const out = await generatePersona(userId, 'id');
    expect(out.ok).toBe(true);
    expect(out.fallback).toBe(false);
    expect(out.facets).toHaveLength(3);

    const row = await getPersona(testDb, userId);
    expect(row?.body).toBe(CLEAN);
    expect(row?.model).toBe('test-model');
    expect(row?.locale).toBe('id');
    expect(row?.sourceVersion).toBe(PERSONA_SOURCE_VERSION);
    expect(row?.promptVersion).toBe(PERSONA_PROMPT_VERSION);
    // The engine's output, stored verbatim as the row's audit trail.
    expect(row?.facts).toHaveProperty('numbers');
  });

  it('returns unchanged on an immediate second call and makes NO provider call', async () => {
    const userId = await seed();
    complete.mockResolvedValue({ text: CLEAN, usage: {} });

    await generatePersona(userId, 'id');
    expect(complete).toHaveBeenCalledTimes(1);

    const second = await generatePersona(userId, 'id');
    expect(second.reason).toBe('unchanged');
    // The property that makes calling this from a write path affordable.
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('regenerates when a profile fact changes', async () => {
    const { upsertProfileFacts } = await import('@/lib/db/queries/profile');
    const userId = await seed();
    complete.mockResolvedValue({ text: CLEAN, usage: {} });
    await generatePersona(userId, 'id');

    await upsertProfileFacts(testDb, userId, {
      fullName: 'Miftahul Mahfuzh',
      nickname: 'Fuzh',
      birthDate: '1994-03-14',
    });

    complete.mockResolvedValue({ text: `${CLEAN} Yang lain menyusul.`, usage: {} });
    const out = await generatePersona(userId, 'id');
    // Not `unchanged`: a typo in a name produces a wrong Expression number
    // forever, and the regeneration is what makes the editor honest.
    expect(out.reason).toBeUndefined();
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('regenerates when the SAME hash is stored under a different locale', async () => {
    /*
     * Idempotence is checked on the hash AND the locale. Without the locale clause a
     * stored `id` body would satisfy a request to write the `en` one, and the wrong
     * language would stay stored forever -- while `readings.locale`'s whole lesson is
     * that "which language is this" must never be guessable.
     */
    const userId = await seed();
    complete.mockResolvedValue({ text: CLEAN, usage: {} });
    await generatePersona(userId, 'id');

    complete.mockResolvedValue({
      text: 'Your life-path number is six and its form is The Lovers: a choice that cannot be halved.',
      usage: {},
    });
    const out = await generatePersona(userId, 'en');
    expect(out.reason).toBeUndefined();
    expect((await getPersona(testDb, userId))?.locale).toBe('en');
  });

  it('writes the fallback and model=fallback when the model uses a banned word', async () => {
    const userId = await seed();
    complete.mockResolvedValue({
      text: 'Kamu sedang dalam penyembuhan yang panjang dan sabar.',
      usage: {},
    });

    const out = await generatePersona(userId, 'id');
    expect(out.ok).toBe(true);
    expect(out.fallback).toBe(true);
    expect(out.reason).toBe('banned_word');

    const row = await getPersona(testDb, userId);
    expect(row?.model).toBe('fallback');
    expect(row?.body).not.toContain('penyembuhan');
    // Not a degraded mode: the fallback is a real body a brand-new user is shown.
    expect(row!.body.length).toBeGreaterThan(40);
  });

  it('writes the fallback and never a leaked nickname', async () => {
    const userId = await seed();
    complete.mockResolvedValue({
      text: 'Mifta, angka jalan hidupmu enam dan wujudnya The Lovers.',
      usage: {},
    });

    const out = await generatePersona(userId, 'id');
    expect(out.reason).toBe('nickname_leak');
    // The guarantee V7 relies on for `include_nickname: false`.
    expect((await getPersona(testDb, userId))?.body).not.toContain('Mifta');
  });

  it('makes no provider call under PERSONA_STUB=1', async () => {
    process.env.PERSONA_STUB = '1';
    const userId = await seed();

    const out = await generatePersona(userId, 'id');
    expect(complete).not.toHaveBeenCalled();
    expect(out.fallback).toBe(true);
    expect((await getPersona(testDb, userId))?.model).toBe('fallback');
  });

  /*
   * PERSONA_GENERATION_ENABLED (2026-07-30). Three assertions, and the second is a
   * REGRESSION TEST for a bug the first draft shipped: `/api/persona`'s `drift`
   * branch calls this in an `after()` behind a response that has already served a
   * true paragraph, so a guard that reused `stubbed()`'s unconditional store would
   * have replaced every querent's real persona with a template the moment an
   * operator set the flag to `0`.
   */
  describe('PERSONA_GENERATION_ENABLED=0', () => {
    it('makes no provider call and writes the template on a first visit', async () => {
      process.env.PERSONA_GENERATION_ENABLED = '0';
      const userId = await seed();

      const out = await generatePersona(userId, 'id');

      expect(complete).not.toHaveBeenCalled();
      expect(out.reason).toBe('disabled');
      expect(out.fallback).toBe(true);
      /*
       * IT MUST WRITE. `/api/persona`'s no-row branch reads the row straight back
       * and answers 500 when there is nothing there, so a generator that wrote
       * nothing would turn this flag into a broken `/account` for every querent who
       * had not opened it yet.
       */
      expect((await getPersona(testDb, userId))?.model).toBe('fallback');
    });

    it('NEVER overwrites a paragraph that is already stored', async () => {
      const userId = await seed();
      complete.mockResolvedValue({ text: CLEAN, usage: {} });
      await generatePersona(userId, 'id');
      expect((await getPersona(testDb, userId))?.body).toBe(CLEAN);

      /*
       * A fact changes, so `input_hash` moves and this is no longer `unchanged` --
       * which is what makes the assertion meaningful rather than vacuous. This is
       * the `drift` shape: the route would call exactly this, in an `after()`.
       */
      const { upsertProfileFacts } = await import('@/lib/db/queries/profile');
      process.env.PERSONA_GENERATION_ENABLED = '0';
      await upsertProfileFacts(testDb, userId, {
        fullName: 'Miftahul Mahfuzh',
        nickname: 'Fuzh',
        birthDate: '1994-03-14',
      });
      complete.mockClear();

      const out = await generatePersona(userId, 'id');

      expect(complete).not.toHaveBeenCalled();
      expect(out.reason).toBe('disabled');
      // THE ASSERTION. A kill switch that degrades stored prose is worse than the
      // quota it protects.
      expect((await getPersona(testDb, userId))?.body).toBe(CLEAN);
      expect((await getPersona(testDb, userId))?.model).toBe('test-model');
    });

    /*
     * **THE FLAG FLIPPING BACK IS NOT BY ITSELF ENOUGH, AND THAT IS WORTH A TEST
     * RATHER THAN A COMMENT.** The first-visit write stores the template under the
     * CURRENT `input_hash`, so until that hash moves the `unchanged` check matches
     * and returns early -- exactly the mechanism that makes the same write
     * permanent in `generateLotus`, whose hash never moves at all.
     *
     * What rescues it here is that `personaInputHash` ends with `readings:<ids>`:
     * any reading, or any facts edit, moves it. So the template survives at most
     * until the querent's next reading, which is the claim these two tests pin
     * down. A first draft asserted the flag flip alone was sufficient; it is not,
     * and believing it would have left a comment in `flags.ts` that was false.
     */
    it('still serves the template while nothing has moved the hash', async () => {
      process.env.PERSONA_GENERATION_ENABLED = '0';
      const userId = await seed();
      await generatePersona(userId, 'id');
      expect((await getPersona(testDb, userId))?.model).toBe('fallback');

      delete process.env.PERSONA_GENERATION_ENABLED;
      complete.mockResolvedValue({ text: CLEAN, usage: {} });

      const out = await generatePersona(userId, 'id');

      // Idempotence wins: no model call, and the template is still what is stored.
      expect(complete).not.toHaveBeenCalled();
      expect(out.reason).toBe('unchanged');
      expect((await getPersona(testDb, userId))?.model).toBe('fallback');
    });

    it('regenerates for real once the hash moves, with no backfill', async () => {
      process.env.PERSONA_GENERATION_ENABLED = '0';
      const userId = await seed();
      await generatePersona(userId, 'id');
      expect((await getPersona(testDb, userId))?.model).toBe('fallback');

      /*
       * A facts edit stands in for the commoner trigger -- a reading, which appends
       * to `readings:<ids>`. Either moves the hash, and that is the whole
       * self-healing mechanism: nobody runs a backfill.
       */
      const { upsertProfileFacts } = await import('@/lib/db/queries/profile');
      delete process.env.PERSONA_GENERATION_ENABLED;
      await upsertProfileFacts(testDb, userId, {
        fullName: 'Miftahul Mahfuzh',
        nickname: 'Fuzh',
        birthDate: '1994-03-14',
      });
      complete.mockResolvedValue({ text: CLEAN, usage: {} });

      const out = await generatePersona(userId, 'id');

      expect(complete).toHaveBeenCalledTimes(1);
      expect(out.fallback).toBe(false);
      expect((await getPersona(testDb, userId))?.body).toBe(CLEAN);
      expect((await getPersona(testDb, userId))?.model).toBe('test-model');
    });
  });

  it('does not throw when the provider throws', async () => {
    const userId = await seed();
    complete.mockRejectedValue(new Error('upstream is down'));

    const out = await generatePersona(userId, 'id');
    // NEVER THROWS. The caller may be an after() with nothing to do with an error.
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('error');
    // And nothing was written: an `error` is not a fallback, so a later attempt
    // still has a missing row to notice rather than a template to leave alone.
    expect(await getPersona(testDb, userId)).toBeNull();
  });

  it('moves updated_at on a regeneration', async () => {
    const { sql } = await import('drizzle-orm');
    const userId = await seed();
    complete.mockResolvedValue({ text: CLEAN, usage: {} });
    await generatePersona(userId, 'id');

    await testDb.execute(
      sql`update personas set updated_at = updated_at - interval '1 hour' where user_id = ${userId}`,
    );
    const before = (await getPersona(testDb, userId))!.updatedAt;

    complete.mockResolvedValue({ text: `${CLEAN} Sisanya nanti.`, usage: {} });
    await generatePersona(userId, 'en');

    // `$onUpdate()` does not fire inside `onConflictDoUpdate`, and this column is
    // what the read-path throttle compares.
    expect((await getPersona(testDb, userId))!.updatedAt.getTime()).toBeGreaterThan(
      before.getTime(),
    );
  });
});

describe('personaMaterial', () => {
  it('returns null for an incomplete profile', async () => {
    const [user] = await testDb
      .insert(users)
      .values({ googleSub: 'dev:mat-incomplete', email: 'mi@example.com' })
      .returning({ id: users.id });
    await testDb.insert(profiles).values({
      userId: user.id,
      fullName: 'Half Way',
      nickname: 'Half',
      birthDate: '1990-01-01',
      // completedAt deliberately absent: row presence is not completion (L3).
    });

    expect(await personaMaterial(user.id, 'id')).toBeNull();
  });

  it('carries no raw answer text in its facts', async () => {
    const userId = await seed();
    const material = await personaMaterial(userId, 'id');
    expect(JSON.stringify(material?.facts)).not.toContain('sister');
    // But it DOES carry the raw answers separately, for the safety check's
    // anti-quotation pass. A5's structural rule is about the PROMPT.
    expect(material?.rawAnswers.join(' ')).toContain('sister');
  });

  it('narrows an unrecognised jsonb colour to null rather than passing it through', async () => {
    const { upsertLotusAvatar } = await import('@/lib/db/queries/lotus');
    const userId = await seed();
    await upsertLotusAvatar(testDb, {
      userId,
      summary: { id: 'Latar singkat.', en: 'A short background.' },
      // jsonb is not validated by postgres, and schema.ts types `color` as
      // `string | null` on purpose. A value outside the closed set must not reach
      // `COLOUR_LABEL[locale][colour]` and interpolate `undefined` into a prompt.
      traits: { color: 'chartreuse', introversion: 25 },
      sourceVersion: 1,
      inputHash: 'x'.repeat(64),
      model: 'test',
    });

    const material = await personaMaterial(userId, 'id');
    expect(material?.colour).toBeNull();
    expect(material?.introversion).toBe(25);
    expect(material?.lotusSummary).toBe('Latar singkat.');
  });
});
