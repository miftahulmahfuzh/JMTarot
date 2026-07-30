/**
 * `GIST_ENABLED`, against a real Postgres and a fake provider. `npm run db:up`
 * first.
 *
 * **THIS IS THE FLAG DEPLOY-VERCEL §2d TELLS AN OPERATOR TO REACH FOR FIRST**, so
 * "off actually skips the call" is worth proving rather than grepping. It is the
 * only one of the five whose volume tracks READING COUNT rather than user count or
 * day count, which makes it worth more than the other four together on any busy
 * day — and also makes it the one whose guard, if it were misplaced by a line,
 * would cost the most while looking correct.
 *
 * `withRollback` and no `@/lib/db/client` mock, unlike the persona and Lotus
 * suites: `extractGist` takes an OPTIONAL HANDLE as its last argument (W4's
 * writer convention), so the harness's rolled-back transaction goes straight in.
 * Only the provider is mocked.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbOrTx } from '@/lib/db/types';

const complete = vi.fn();
vi.mock('@/lib/llm', () => ({ getProvider: () => ({ complete }) }));

const { readings, users } = await import('@/lib/db/schema');
const { closeTestDb, withRollback } = await import('@/lib/db/testing/harness');
const { extractGist } = await import('./gist.generate');

afterAll(closeTestDb);

const READING_ID = '88888888-8888-4888-8888-888888888888';

const BODY =
  'Kartu pertama bicara soal jeda yang kamu ambil. Yang kedua soal orang yang menunggu kabar. Yang ketiga bilang kamu sudah tahu jawabannya.';

async function seedReading(tx: DbOrTx): Promise<void> {
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `test:gist:${crypto.randomUUID()}`, email: 'g@example.com' })
    .returning();

  await tx.insert(readings).values({
    id: READING_ID,
    userId: user.id,
    readerId: 'adrian',
    serviceId: 'spread3',
    locale: 'id',
    question: 'apakah dia serius',
    status: 'ok',
    body: BODY,
    model: 'glm-4.6',
    promptVersion: 'id-v1.3f9a2c71',
    localDate: '2026-07-30',
  });
}

beforeEach(() => {
  complete.mockReset();
  delete process.env.GIST_ENABLED;
});

describe('GIST_ENABLED=0', () => {
  it('makes no provider call and leaves readings.gist null', async () => {
    await withRollback(async (tx) => {
      process.env.GIST_ENABLED = '0';
      await seedReading(tx);

      await extractGist({ readingId: READING_ID, body: BODY, locale: 'id' }, tx);

      expect(complete).not.toHaveBeenCalled();
      const [stored] = await tx.select().from(readings).where(eq(readings.id, READING_ID));
      /*
       * NULL, NOT `fallbackGist(body)`. Degrading to the reading's own last
       * sentence was the alternative and it was declined: `memory.gist_failed`
       * carries `fell_back` to tell an operator THE MODEL is failing, and a
       * deliberate switch arriving as that same event makes the one signal that
       * separates "the provider is broken" from "we turned it off" unreadable.
       */
      expect(stored.gist).toBeNull();
    });
  });

  it('writes nothing at all — not even an empty row update', async () => {
    await withRollback(async (tx) => {
      /*
       * The guard returns BEFORE the write block, so `setReadingGist` is never
       * reached. Asserted by pre-seeding a gist and checking it survives: a guard
       * placed one block lower would null it out, which is a silent data loss on
       * every reading taken while the flag was off.
       */
      await seedReading(tx);
      await tx
        .update(readings)
        .set({ gist: 'sudah tahu jawabannya' })
        .where(eq(readings.id, READING_ID));

      process.env.GIST_ENABLED = '0';
      await extractGist({ readingId: READING_ID, body: BODY, locale: 'id' }, tx);

      const [stored] = await tx.select().from(readings).where(eq(readings.id, READING_ID));
      expect(stored.gist).toBe('sudah tahu jawabannya');
    });
  });
});

describe('GIST_ENABLED unset or mistyped', () => {
  it('extracts normally when unset', async () => {
    await withRollback(async (tx) => {
      await seedReading(tx);
      complete.mockResolvedValue({ text: 'kamu sudah tahu jawabannya', usage: {} });

      await extractGist({ readingId: READING_ID, body: BODY, locale: 'id' }, tx);

      expect(complete).toHaveBeenCalledTimes(1);
      const [stored] = await tx.select().from(readings).where(eq(readings.id, READING_ID));
      expect(stored.gist).toBe('kamu sudah tahu jawabannya');
    });
  });

  it('extracts normally on a mistyped value — only "0" disables', async () => {
    await withRollback(async (tx) => {
      /*
       * The direction that matters: somebody meaning to disable this and typing
       * `false` must leave it ON. `flags.test.ts` owns the predicate; this owns the
       * wiring, so an inverted guard cannot pass both.
       */
      process.env.GIST_ENABLED = 'false';
      await seedReading(tx);
      complete.mockResolvedValue({ text: 'kamu sudah tahu jawabannya', usage: {} });

      await extractGist({ readingId: READING_ID, body: BODY, locale: 'id' }, tx);

      expect(complete).toHaveBeenCalledTimes(1);
    });
  });
});
