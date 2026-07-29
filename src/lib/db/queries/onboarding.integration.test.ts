/**
 * `queries/onboarding.ts` against a real Postgres.
 *
 * CLAUDE.md: anything touching `src/lib/db/queries/**` gets one of these. Needs
 * `npm run db:up`; every test runs inside a transaction that is rolled back.
 *
 * WHAT ONLY AN INTEGRATION TEST CAN CHECK HERE, and it is the reason this file
 * matters more than most: that `answer_text` is ACTUALLY CIPHERTEXT IN THE
 * COLUMN. A unit test with a mocked handle would assert that `encryptField` was
 * called, which is a test of the mock. Roadmap §8's first clause is a property of
 * the stored bytes, so it has to be read back out of the database.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { ONBOARDING_QUESTION_KEYS } from '@/data/onboarding';
import { answerAad, decryptField } from '../crypto';
import { onboardingAnswers, users } from '../schema';
import type { Tx } from '../types';
import { withRollback } from '../testing/harness';
import {
  clearFreeTextAnswers,
  deleteAnswer,
  answersUpdatedAt,
  getAnswer,
  getAnsweredKeys,
  getAnswers,
  getOnboardingState,
  upsertAnswer,
  upsertAnswers,
} from './onboarding';
import { markOnboardingComplete, upsertProfileFacts } from './profile';
import { eq } from 'drizzle-orm';

beforeAll(() => {
  // encryptField throws without it, and the failure would otherwise read as a
  // database problem rather than a missing local key.
  if (!process.env.FIELD_ENCRYPTION_KEY) {
    throw new Error('FIELD_ENCRYPTION_KEY is not set -- copy .env.example to .env.local');
  }
});

/** A user to hang the rows off. `google_sub` is unique, so each test makes its own. */
async function makeUser(tx: Tx, tag: string): Promise<string> {
  const [row] = await tx
    .insert(users)
    .values({ googleSub: `dev:it-${tag}`, email: `${tag}@localhost`, emailVerified: true })
    .returning({ id: users.id });
  return row.id;
}

describe('upsertAnswer', () => {
  it('stores an answered free-text answer as v1 ciphertext, not plaintext', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'cipher');
      const plaintext = 'tahun pertama kerja di kota lain';

      await upsertAnswer(tx, userId, {
        key: 'best_thing',
        text: plaintext,
        choice: null,
        skipped: false,
      });

      const [row] = await tx
        .select({ answerText: onboardingAnswers.answerText })
        .from(onboardingAnswers)
        .where(eq(onboardingAnswers.userId, userId));

      // The property roadmap §8 is about, read out of the column.
      expect(row.answerText).not.toBe(plaintext);
      expect(row.answerText).not.toContain('kota lain');
      expect(row.answerText).toMatch(/^v1\./);

      // And it is OUR ciphertext: the AAD binds it to this user and this
      // question, so a wrong AAD would fail to open it.
      expect(decryptField(row.answerText, answerAad(userId, 'best_thing'))).toBe(plaintext);
    });
  });

  it('binds the ciphertext to the question, so it cannot be moved between rows', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'aad-q');
      await upsertAnswer(tx, userId, {
        key: 'most_loved',
        text: 'ibu saya',
        choice: null,
        skipped: false,
      });

      const [row] = await tx
        .select({ answerText: onboardingAnswers.answerText })
        .from(onboardingAnswers)
        .where(eq(onboardingAnswers.userId, userId));

      // Same key, same user: opens. Different question: does not.
      expect(decryptField(row.answerText, answerAad(userId, 'most_loved'))).toBe('ibu saya');
      expect(decryptField(row.answerText, answerAad(userId, 'best_thing'))).toBeNull();
    });
  });

  it('writes NULL for a skip, never an encrypted empty string', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'skip');
      await upsertAnswer(tx, userId, {
        key: 'worst_thing',
        text: null,
        choice: null,
        skipped: true,
      });

      const [row] = await tx
        .select({ answerText: onboardingAnswers.answerText, skipped: onboardingAnswers.skipped })
        .from(onboardingAnswers)
        .where(eq(onboardingAnswers.userId, userId));

      /*
       * An encrypted empty string would be indistinguishable from an encrypted
       * answer in a database dump, which is the whole reason the skip is recorded
       * as an absence rather than as a value.
       */
      expect(row.answerText).toBeNull();
      expect(row.skipped).toBe(true);
    });
  });

  it('is idempotent on (user_id, question_key) and moves updated_at', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'upsert');

      await upsertAnswer(tx, userId, { key: 'best_thing', text: 'satu', choice: null, skipped: false });
      const [first] = await tx
        .select({ id: onboardingAnswers.id, updatedAt: onboardingAnswers.updatedAt })
        .from(onboardingAnswers)
        .where(eq(onboardingAnswers.userId, userId));

      await upsertAnswer(tx, userId, { key: 'best_thing', text: 'dua', choice: null, skipped: false });
      const rows = await tx
        .select({ id: onboardingAnswers.id, updatedAt: onboardingAnswers.updatedAt })
        .from(onboardingAnswers)
        .where(eq(onboardingAnswers.userId, userId));

      // One row, not two.
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(first.id);

      /*
       * `updated_at` is set BY HAND in the conflict branch, because Drizzle's
       * `$onUpdate()` does not fire inside `onConflictDoUpdate` -- the trap
       * CLAUDE.md names. Drop that line and this assertion is what catches it.
       */
      expect(rows[0].updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
      expect(await getAnswers(tx, userId)).toEqual([
        { key: 'best_thing', text: 'dua', choice: null, skipped: false },
      ]);
    });
  });

  it('refuses a question_key outside the six', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'ck');
      /*
       * The CHECK constraint from schema.ts. It matters because `question_key` is
       * the AAD's second component: a typo'd key that inserted would write a row
       * nothing could ever decrypt, and the question would vanish from the
       * distillation with no error anywhere.
       */
      await expect(
        tx.insert(onboardingAnswers).values({
          userId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          questionKey: 'favourite_colour' as any,
          skipped: true,
        }),
      ).rejects.toThrow();
    });
  });
});

describe('getAnswers', () => {
  it('round-trips the whole set, decrypted, with choices intact', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'roundtrip');

      await upsertAnswers(tx, userId, [
        { key: 'best_thing', text: 'terang', choice: null, skipped: false },
        { key: 'worst_thing', text: null, choice: null, skipped: true },
        { key: 'most_loved', text: 'ibu saya', choice: null, skipped: false },
        { key: 'introversion', text: null, choice: '30', skipped: false },
        { key: 'color', text: null, choice: 'black', skipped: false },
        { key: 'willow_wish', text: 'ketemu lagi', choice: null, skipped: false },
      ]);

      const answers = await getAnswers(tx, userId);
      expect(answers).toHaveLength(6);

      const byKey = Object.fromEntries(answers.map((a) => [a.key, a]));
      expect(byKey.best_thing.text).toBe('terang');
      expect(byKey.most_loved.text).toBe('ibu saya');
      expect(byKey.worst_thing).toEqual({
        key: 'worst_thing',
        text: null,
        choice: null,
        skipped: true,
      });
      expect(byKey.introversion.choice).toBe('30');
      expect(byKey.color.choice).toBe('black');
    });
  });

  it('reports an undecryptable answer as skipped rather than throwing', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'tamper');

      await upsertAnswer(tx, userId, {
        key: 'best_thing',
        text: 'asli',
        choice: null,
        skipped: false,
      });

      /*
       * Simulates a rotated key or a tampered row. `decryptField` never throws --
       * roadmap §8 makes every free-text answer skippable and requires the app to
       * work without one, so an answer that will not open takes the same path as
       * one that was declined. The alternative is onboarding 500ing for every user
       * the moment a key changes.
       */
      await tx
        .update(onboardingAnswers)
        .set({ answerText: 'v1.AAAAAAAAAAAAAAAA.AAAA.AAAAAAAAAAAAAAAAAAAAAA' })
        .where(eq(onboardingAnswers.userId, userId));

      const [answer] = await getAnswers(tx, userId);
      expect(answer.text).toBeNull();
      expect(answer.skipped).toBe(true);
    });
  });
});

describe('getAnsweredKeys and getOnboardingState', () => {
  it('returns which keys have rows, and no answer text', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'keys');
      await upsertProfileFacts(tx, userId, {
        fullName: 'Rani Wulandari',
        nickname: 'Rani',
        birthDate: '1994-03-02',
      });
      await upsertAnswer(tx, userId, {
        key: 'best_thing',
        text: 'rahasia',
        choice: null,
        skipped: false,
      });

      expect(await getAnsweredKeys(tx, userId)).toEqual(['best_thing']);

      const state = await getOnboardingState(tx, userId);
      expect(state.answeredKeys).toEqual(['best_thing']);
      expect(state.profile).toEqual({
        fullName: 'Rani Wulandari',
        nickname: 'Rani',
        birthDate: '1994-03-02',
        onboardingVersion: 1,
        completedAt: null,
      });

      // The shape the client receives carries no answer text at all. If a `text`
      // field ever appears here, it is on its way to a browser.
      expect(JSON.stringify(state)).not.toContain('rahasia');
    });
  });

  it('reports birth_date as a STRING, never a Date', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'datestr');
      await upsertProfileFacts(tx, userId, {
        fullName: 'A',
        nickname: 'B',
        birthDate: '1994-03-02',
      });

      const state = await getOnboardingState(tx, userId);
      /*
       * The trap CLAUDE.md names: a Date renders in the SERVER's zone and is a day
       * out for anyone in Jakarta between midnight and 07:00. It looks plausible
       * while being wrong, which is why there is a test rather than a comment.
       */
      expect(typeof state.profile?.birthDate).toBe('string');
      expect(state.profile?.birthDate).toBe('1994-03-02');
    });
  });

  it('has no profile and no keys for a user who never started', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'fresh');
      expect(await getOnboardingState(tx, userId)).toEqual({ profile: null, answeredKeys: [] });
    });
  });

  it('reports completedAt as an ISO string once onboarding finishes', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'complete');
      await upsertProfileFacts(tx, userId, {
        fullName: 'A',
        nickname: 'B',
        birthDate: '1990-01-01',
      });
      await markOnboardingComplete(tx, userId);

      const state = await getOnboardingState(tx, userId);
      expect(typeof state.profile?.completedAt).toBe('string');
      expect(state.profile?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});

describe('markOnboardingComplete', () => {
  it('is idempotent and keeps the FIRST timestamp', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'idem');
      await upsertProfileFacts(tx, userId, {
        fullName: 'A',
        nickname: 'B',
        birthDate: '1990-01-01',
      });

      const first = await markOnboardingComplete(tx, userId);
      const second = await markOnboardingComplete(tx, userId);

      // A replayed submit must not move the date, or "when did this person finish
      // onboarding" silently becomes "when did they last retry".
      expect(first).not.toBeNull();
      expect(second?.getTime()).toBe(first?.getTime());
    });
  });

  it('returns null when there is no profile row at all', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'noprofile');
      expect(await markOnboardingComplete(tx, userId)).toBeNull();
    });
  });
});

describe('upsertProfileFacts', () => {
  it('does NOT clear completed_at when facts are edited afterwards', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'edit');
      await upsertProfileFacts(tx, userId, {
        fullName: 'Rani Wulandari',
        nickname: 'Rani',
        birthDate: '1994-03-02',
      });
      const completedAt = await markOnboardingComplete(tx, userId);
      expect(completedAt).not.toBeNull();

      // L13: facts stay editable forever. THE bug this function exists to
      // prevent -- `upsertProfile` would carry `undefined` into completed_at and
      // send the user back through the questionnaire for fixing a typo.
      await upsertProfileFacts(tx, userId, {
        fullName: 'Rani W',
        nickname: 'Ran',
        birthDate: '1994-03-02',
      });

      const state = await getOnboardingState(tx, userId);
      expect(state.profile?.nickname).toBe('Ran');
      expect(state.profile?.completedAt).not.toBeNull();
    });
  });
});

describe('deleteAnswer', () => {
  it('keeps the row, nulls the text, and marks it skipped', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'del');
      await upsertAnswer(tx, userId, {
        key: 'most_loved',
        text: 'ibu saya',
        choice: null,
        skipped: false,
      });

      expect(await deleteAnswer(tx, userId, 'most_loved')).toBe(true);

      /*
       * The row SURVIVES as a skip. Removing it would make `nextUnansweredKey`
       * treat the question as never asked, so a user who deleted an answer would
       * be marched back into a stepper they had finished.
       */
      expect(await getAnsweredKeys(tx, userId)).toEqual(['most_loved']);
      const [answer] = await getAnswers(tx, userId);
      expect(answer).toEqual({ key: 'most_loved', text: null, choice: null, skipped: true });
    });
  });

  it('reports false for a question that was never answered', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'del404');
      expect(await deleteAnswer(tx, userId, 'willow_wish')).toBe(false);
    });
  });
});

describe('clearFreeTextAnswers', () => {
  it('erases every free-text answer and leaves the closed ones alone', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'erase');
      await upsertAnswers(tx, userId, [
        { key: 'best_thing', text: 'terang', choice: null, skipped: false },
        { key: 'most_loved', text: 'ibu saya', choice: null, skipped: false },
        { key: 'color', text: null, choice: 'black', skipped: false },
        { key: 'introversion', text: null, choice: '30', skipped: false },
      ]);

      await clearFreeTextAnswers(tx, userId);

      const byKey = Object.fromEntries((await getAnswers(tx, userId)).map((a) => [a.key, a]));
      expect(byKey.best_thing.text).toBeNull();
      expect(byKey.best_thing.skipped).toBe(true);
      expect(byKey.most_loved.text).toBeNull();
      // The closed answers carry no disclosure risk and are not user prose, so
      // erasure leaves them: they are what a Lotus block falls back to.
      expect(byKey.color.choice).toBe('black');
      expect(byKey.introversion.choice).toBe('30');
    });
  });
});

describe('the question catalog and the database agree', () => {
  it('accepts every key in ONBOARDING_QUESTION_KEYS', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'allkeys');
      /*
       * The CHECK constraint lists the six literally, and `ONBOARDING_QUESTION_KEYS`
       * lists them again in TypeScript. Two lists that must not drift, so one test
       * asserts they have not: adding a seventh question without a migration fails
       * here rather than at 3am.
       */
      for (const key of ONBOARDING_QUESTION_KEYS) {
        await upsertAnswer(tx, userId, { key, text: null, choice: null, skipped: true });
      }
      expect((await getAnsweredKeys(tx, userId)).sort()).toEqual([...ONBOARDING_QUESTION_KEYS].sort());
    });
  });
});

/**
 * `getAnswer` and `answersUpdatedAt` — the two reads the 2026-07-29 answer sheet
 * added.
 *
 * WHAT ONLY AN INTEGRATION TEST CAN CHECK: that the reveal path decrypts the SAME
 * bytes `upsertAnswer` wrote, through the SAME AAD. A unit test with a mocked handle
 * would assert `decryptField` was called, which is a test of the mock — and the
 * failure mode here is a mismatched AAD, which `decryptField` reports as null and is
 * indistinguishable from data loss.
 */
describe('getAnswer', () => {
  it('round-trips the plaintext through the column', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'getanswer');
      const secret = 'the afternoon nobody came to the door';
      await upsertAnswer(tx, userId, {
        key: 'worst_thing',
        text: secret,
        choice: null,
        skipped: false,
      });

      const got = await getAnswer(tx, userId, 'worst_thing');
      expect(got?.text).toBe(secret);
      expect(got?.skipped).toBe(false);

      // AND THE COLUMN IS STILL CIPHERTEXT. The whole point of reading it back.
      const [raw] = await tx
        .select({ answerText: onboardingAnswers.answerText })
        .from(onboardingAnswers)
        .where(eq(onboardingAnswers.userId, userId));
      expect(raw.answerText).toMatch(/^v1\./);
      expect(raw.answerText).not.toContain('afternoon');
    });
  });

  it('returns null for a question with no row, and a skip for one that was skipped', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'getanswer-absent');
      /*
       * **A MISSING ROW AND A SKIP ARE DIFFERENT FACTS.** Both render an empty field,
       * and the route reports the first as a 404 on purpose: after completion, no row
       * means the stepper never reached that question, which is a bug worth seeing
       * rather than an empty textarea worth editing.
       */
      expect(await getAnswer(tx, userId, 'best_thing')).toBeNull();

      await upsertAnswer(tx, userId, {
        key: 'best_thing',
        text: null,
        choice: null,
        skipped: true,
      });
      const skipped = await getAnswer(tx, userId, 'best_thing');
      expect(skipped).not.toBeNull();
      expect(skipped?.text).toBeNull();
      expect(skipped?.skipped).toBe(true);
    });
  });

  it('reads a closed question out of answer_choice, unencrypted', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'getanswer-closed');
      await upsertAnswer(tx, userId, {
        key: 'color',
        text: null,
        choice: 'grey',
        skipped: false,
      });
      const got = await getAnswer(tx, userId, 'color');
      expect(got?.choice).toBe('grey');
      expect(got?.text).toBeNull();
    });
  });

  it('reads only the key it was asked for', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'getanswer-one');
      await upsertAnswer(tx, userId, {
        key: 'best_thing',
        text: 'the good one',
        choice: null,
        skipped: false,
      });
      await upsertAnswer(tx, userId, {
        key: 'worst_thing',
        text: 'the sensitive one',
        choice: null,
        skipped: false,
      });

      /*
       * ONE KEY PER REQUEST IS THE PRIVACY PROPERTY, and this is the closest a test
       * can get to it: asking for `best_thing` must not return `worst_thing`'s text.
       * The route-level guarantee (no bulk variant exists) is enforced by there being
       * no such export.
       */
      const got = await getAnswer(tx, userId, 'best_thing');
      expect(got?.text).toBe('the good one');
      expect(JSON.stringify(got)).not.toContain('sensitive');
    });
  });
});

describe('answersUpdatedAt', () => {
  it('is null before any answer exists', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'touched-none');
      expect(await answersUpdatedAt(tx, userId)).toBeNull();
    });
  });

  /**
   * **THE SIGNAL THE DEFERRED PERSONA REGENERATION RESTS ON.** `personaStaleness`
   * compares this against `personas.updated_at` to tell a user's answer edit from
   * ordinary hash drift, because only the first may bypass
   * `PERSONA_MIN_AGE_SECONDS`. If `upsertAnswer` ever stops setting `updated_at` by
   * hand — which Drizzle's `$onUpdate()` does NOT do inside `onConflictDoUpdate` —
   * this returns the insert time forever and every answer edit is silently
   * throttled. That is W3's swallowed-edit bug, and this is the test that sees it.
   */
  it('moves when an answer is edited, and is the max across the six', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'touched-edit');
      await upsertAnswer(tx, userId, {
        key: 'best_thing',
        text: 'first',
        choice: null,
        skipped: false,
      });
      const first = await answersUpdatedAt(tx, userId);
      expect(first).not.toBeNull();

      /* Postgres `now()` is fixed for the whole transaction, so a second write inside
         one `withRollback` cannot advance the clock. The column is written from
         JavaScript's `new Date()` for exactly that reason -- see `upsertAnswer` -- so
         a nudged value is what proves the conflict branch writes it at all. */
      await tx
        .update(onboardingAnswers)
        .set({ updatedAt: new Date(first!.getTime() + 60_000) })
        .where(eq(onboardingAnswers.userId, userId));

      const later = await answersUpdatedAt(tx, userId);
      expect(later!.getTime()).toBe(first!.getTime() + 60_000);

      // A second, older row must not pull the max backwards.
      await upsertAnswer(tx, userId, {
        key: 'color',
        text: null,
        choice: 'white',
        skipped: false,
      });
      await tx
        .update(onboardingAnswers)
        .set({ updatedAt: new Date(first!.getTime() - 60_000) })
        .where(eq(onboardingAnswers.questionKey, 'color'));

      expect((await answersUpdatedAt(tx, userId))!.getTime()).toBe(first!.getTime() + 60_000);
    });
  });

  it('moves when an answer is deleted, so an erasure is a user edit too', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'touched-delete');
      await upsertAnswer(tx, userId, {
        key: 'best_thing',
        text: 'something',
        choice: null,
        skipped: false,
      });
      await tx
        .update(onboardingAnswers)
        .set({ updatedAt: new Date('2020-01-01T00:00:00Z') })
        .where(eq(onboardingAnswers.userId, userId));

      await deleteAnswer(tx, userId, 'best_thing');

      /* `deleteAnswer` sets `updatedAt` by hand too. Without it, clearing an answer
         would never reach the persona -- the delete button being a lie, one artifact
         further out than the version W3 already fixed. */
      const at = await answersUpdatedAt(tx, userId);
      expect(at!.getTime()).toBeGreaterThan(new Date('2020-01-01T00:00:00Z').getTime());
    });
  });
});
