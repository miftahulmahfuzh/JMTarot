/**
 * The six detectors, each with **its positive and its nearest negative** (Task 3).
 *
 * A detector's positive case is easy and nearly worthless on its own: what decides
 * whether this feature reads as somebody thinking of you is which rooms it *declines* to
 * speak in. So every block below pairs the hit with the case one field away from it, and
 * the negatives are named for the outcome rather than for the mechanism.
 */
import { config } from 'dotenv';
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import {
  chatMessages,
  chatRuns,
  lotusAvatars,
  onboardingAnswers,
  profiles,
  readingCards,
  readings,
  users,
} from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Db, Tx } from '@/lib/db/types';
import {
  abandonExpiredRuns,
  nudgeCandidates,
  readQuerent,
  selectMaterial,
  selectReadingMaterial,
} from './detect';
import { upsertThread } from '@/lib/db/queries/chat';

config({ path: '.env.local', quiet: true });

afterAll(closeTestDb);

const NOW = new Date('2026-08-07T12:00:00.000Z');
const TODAY = '2026-08-07';

let n = 0;

async function makeUser(tx: Tx | Db, tag: string): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `f5:${tag}:${n}`, email: `f5${tag}${n}@example.com`, locale: 'id' })
    .returning({ id: users.id });
  return user.id;
}

function args(userId: string, over: Partial<Parameters<typeof selectMaterial>[1]> = {}) {
  return {
    userId,
    locale: 'id' as const,
    localDate: TODAY,
    lastProactiveAt: null,
    lastUserMessageAt: null,
    now: NOW,
    birthDate: null,
    lastSeenAt: null,
    ...over,
  };
}

async function makeReading(
  tx: Tx | Db,
  userId: string,
  over: Partial<typeof readings.$inferInsert> = {},
): Promise<string> {
  const [row] = await tx
    .insert(readings)
    .values({
      userId,
      readerId: 'thessaly',
      serviceId: 'spread3',
      locale: 'id',
      status: 'ok',
      body: 'empat paragraf',
      gist: 'kerjaan numpuk',
      model: 'test',
      promptVersion: 'test',
      localDate: TODAY,
      /* Pinned to the fixture clock, not to `now()`: the lookback floor is derived from
       * `NOW`, so a row stamped with the real wall clock would sit AFTER a floor the test
       * placed in the future and the negative case would silently pass for the wrong
       * reason. */
      createdAt: NOW,
      ...over,
    })
    .returning({ id: readings.id });
  const localDate = (over.localDate as string) ?? TODAY;
  await tx.insert(readingCards).values([
    { readingId: row.id, userId, cardId: 18, reversed: false, position: 0, localDate },
    { readingId: row.id, userId, cardId: 16, reversed: true, position: 1, localDate },
  ]);
  return row.id;
}

async function makeRun(
  tx: Tx | Db,
  userId: string,
  over: Partial<typeof chatRuns.$inferInsert> = {},
): Promise<string> {
  const [row] = await tx
    .insert(chatRuns)
    .values({ userId, trigger: 'user_message', locale: 'id', status: 'done', ...over })
    .returning({ id: chatRuns.id });
  return row.id;
}

// ---------------------------------------------------------------------------
// M1 — a reading
// ---------------------------------------------------------------------------

describe('M1 — a reading since the last proactive run', () => {
  it('finds the reading, with its cards looked up server-side', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm1');
      const readingId = await makeReading(tx, userId);

      const found = await selectMaterial(tx, args(userId));
      expect(found?.kind).toBe('reading');
      if (found?.kind !== 'reading') throw new Error('unreachable');
      expect(found.readingId).toBe(readingId);
      /* Every word of card text is looked up here, never carried. */
      expect(found.cards.map((c) => c.name)).toEqual(['The Moon', 'The Tower']);
      expect(found.cards[1].reversed).toBe(true);
      expect(found.hadQuestion).toBe(false);
    }));

  it('DOES NOT fire for a blocked reading', () =>
    withRollback(async (tx) => {
      /*
       * **W7 refused the question and the reader never spoke**, so a proactive run about
       * it would be the app volunteering that it refused you. It is also the one row
       * whose `question` column holds text the classifier flagged.
       */
      const userId = await makeUser(tx, 'm1blocked');
      await makeReading(tx, userId, { status: 'blocked', body: null, gist: null });
      expect(await selectMaterial(tx, args(userId))).toBeNull();
    }));

  it('DOES NOT fire for a reading whose stream died', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm1nobody');
      await makeReading(tx, userId, { status: 'failed', body: null, gist: null });
      expect(await selectMaterial(tx, args(userId))).toBeNull();
    }));

  it('DOES NOT fire for a reading a run already exists for', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm1again');
      const readingId = await makeReading(tx, userId);
      await makeRun(tx, userId, { trigger: 'reading_completed', triggerReadingId: readingId });
      expect(await selectMaterial(tx, args(userId))).toBeNull();
    }));

  it('DOES NOT fire for a reading the querent attached themselves ([F5-14], mechanism A)', () =>
    withRollback(async (tx) => {
      /*
       * **The querent bringing the reading into the room IS the conversational move.** A
       * reader saying *"eh, aku lihat bacaanmu barusan"* three seconds after they said
       * *"nih bacaanku barusan"* is two people talking over each other about one object.
       */
      const userId = await makeUser(tx, 'm1attached');
      const readingId = await makeReading(tx, userId);
      await tx.insert(chatMessages).values({
        userId,
        author: 'user',
        body: 'nih bacaanku barusan',
        locale: 'id',
        attachedReadingId: readingId,
      });
      expect(await selectMaterial(tx, args(userId))).toBeNull();
    }));

  it('DOES NOT fire for a reading older than the last proactive run', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm1old');
      await makeReading(tx, userId);
      const after = new Date(NOW.getTime() + 60_000);
      expect(await selectMaterial(tx, args(userId, { lastProactiveAt: after }))).toBeNull();
    }));
});

describe('selectReadingMaterial — source 1 names its reading', () => {
  it('answers null for THIS reading rather than finding another one (§9.6)', () =>
    withRollback(async (tx) => {
      /*
       * The failure this prevents: the querent attaches reading X, and the mint quietly
       * produces a run about reading W instead — spending the day's budget on a reading
       * nobody mentioned.
       */
      const userId = await makeUser(tx, 'src1');
      const older = await makeReading(tx, userId);
      const attached = await makeReading(tx, userId);
      await tx.insert(chatMessages).values({
        userId,
        author: 'user',
        body: 'ini',
        locale: 'id',
        attachedReadingId: attached,
      });

      expect(await selectReadingMaterial(tx, args(userId), attached)).toBeNull();
      /* The ladder WOULD have found the older one, which is exactly why source 1 does not
       * use the ladder. */
      const ladder = await selectMaterial(tx, args(userId));
      expect(ladder?.kind === 'reading' && ladder.readingId).toBe(older);
    }));
});

// ---------------------------------------------------------------------------
// M2 — an unanswered ask
// ---------------------------------------------------------------------------

describe('M2 — a reader question the querent never answered (§7)', () => {
  async function ask(
    tx: Tx | Db,
    userId: string,
    minutesAgo: number,
    intent: 'ask' | 'react' = 'ask',
  ) {
    const runId = await makeRun(tx, userId);
    const [row] = await tx
      .insert(chatMessages)
      .values({
        userId,
        author: 'thessaly',
        body: 'Berapa yang benar-benar harus minggu ini?',
        locale: 'id',
        runId,
        beatIndex: 0,
        intent,
        createdAt: new Date(NOW.getTime() - minutesAgo * 60_000),
      })
      .returning({ id: chatMessages.id });
    return row.id;
  }

  it('finds the most recent ask, and only the most recent', () =>
    withRollback(async (tx) => {
      /* §7.3, false positive 1: a run of three beats can contain three asks, and
       * following up on all three is an interrogation. */
      const userId = await makeUser(tx, 'm2');
      await ask(tx, userId, 300);
      const newest = await ask(tx, userId, 240);

      const found = await selectMaterial(tx, args(userId));
      expect(found?.kind).toBe('unanswered');
      if (found?.kind !== 'unanswered') throw new Error('unreachable');
      expect(found.messageId).toBe(newest);
      expect(found.askedAgoHours).toBe(4);
    }));

  it('DOES NOT fire once the querent has said anything at all', () =>
    withRollback(async (tx) => {
      /*
       * §7.4: they may have replied *"nanti aku cerita"* and the question is still open.
       * The detection calls that answered, **which is the safe direction** — a missed
       * follow-up costs a bubble; a spurious one costs the querent's patience.
       */
      const userId = await makeUser(tx, 'm2answered');
      await ask(tx, userId, 300);
      await tx.insert(chatMessages).values({
        userId,
        author: 'user',
        body: 'nanti aku cerita',
        locale: 'id',
        createdAt: new Date(NOW.getTime() - 120 * 60_000),
      });
      const found = await selectMaterial(
        tx,
        args(userId, { lastUserMessageAt: new Date(NOW.getTime() - 120 * 60_000) }),
      );
      expect(found?.kind).not.toBe('unanswered');
    }));

  it('DOES NOT fire at 49 hours (§7.3, false positive 4)', () =>
    withRollback(async (tx) => {
      /* An ask older than the ceiling is not *"still unanswered"*, it is **over**.
       * Following up on something asked last Tuesday reads as a cron job that found a
       * row. */
      const userId = await makeUser(tx, 'm2dead');
      await ask(tx, userId, 49 * 60);
      const found = await selectMaterial(tx, args(userId));
      expect(found?.kind).not.toBe('unanswered');
    }));

  it('READS THE DECLARED INTENT AND NEVER A QUESTION MARK (§7.1)', () =>
    withRollback(async (tx) => {
      /*
       * `CLAUDE.md`'s bare-`lagi` trap in a new costume: Adrian's register is full of
       * *"kan?"* and *"iya nggak?"*, so a `?` heuristic fires on most sentences of casual
       * Indonesian and reports a rate that is entirely noise — **and that rate is what
       * decides whether the feature is cut or tightened.** The bubble below ends in a
       * question mark and its beat declared `react`.
       */
      const userId = await makeUser(tx, 'm2punct');
      await ask(tx, userId, 300, 'react');
      const found = await selectMaterial(tx, args(userId));
      expect(found?.kind).not.toBe('unanswered');
    }));
});

// ---------------------------------------------------------------------------
// M3 — an orphaned bubble
// ---------------------------------------------------------------------------

describe('M3 — a bubble nobody replied to', () => {
  it('fires when the last word in the room was a reader’s and was not a question', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm3');
      const runId = await makeRun(tx, userId);
      const [row] = await tx
        .insert(chatMessages)
        .values({
          userId,
          author: 'adrian',
          body: 'itu dua daftar yang beda sih',
          locale: 'id',
          runId,
          beatIndex: 0,
          intent: 'answer',
          createdAt: new Date(NOW.getTime() - 9 * 3_600_000),
        })
        .returning({ id: chatMessages.id });

      const found = await selectMaterial(tx, args(userId));
      expect(found?.kind).toBe('orphan');
      if (found?.kind !== 'orphan') throw new Error('unreachable');
      expect(found.messageId).toBe(row.id);
      expect(found.ageHours).toBe(9);
    }));

  it('fires for a reader turn with NO declared intent, which is the common case', () =>
    withRollback(async (tx) => {
      /*
       * `intent <> 'ask'` is NULL rather than true for a turn whose beat carried none, so
       * a naive predicate would silently never match the majority of rows. `is distinct
       * from` is the operator that means what the sentence means.
       */
      const userId = await makeUser(tx, 'm3null');
      const runId = await makeRun(tx, userId);
      await tx.insert(chatMessages).values({
        userId,
        author: 'margaret',
        body: 'Hm.',
        locale: 'id',
        runId,
        beatIndex: 0,
        createdAt: new Date(NOW.getTime() - 4 * 3_600_000),
      });
      expect((await selectMaterial(tx, args(userId)))?.kind).toBe('orphan');
    }));

  it('DOES NOT fire when the querent spoke last', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm3user');
      await tx.insert(chatMessages).values({
        userId,
        author: 'user',
        body: 'oke',
        locale: 'id',
        createdAt: new Date(NOW.getTime() - 3_600_000),
      });
      expect(await selectMaterial(tx, args(userId))).toBeNull();
    }));

  it('DOES NOT fire while a run is still in flight', () =>
    withRollback(async (tx) => {
      /* The next beat is about to answer it, so the bubble is not orphaned. */
      const userId = await makeUser(tx, 'm3live');
      const runId = await makeRun(tx, userId, { status: 'running' });
      await tx.insert(chatMessages).values({
        userId,
        author: 'adrian',
        body: 'eh',
        locale: 'id',
        runId,
        beatIndex: 0,
        createdAt: new Date(NOW.getTime() - 3_600_000),
      });
      expect(await selectMaterial(tx, args(userId))).toBeNull();
    }));
});

// ---------------------------------------------------------------------------
// M5 — an occasion, and M6 — the Lotus
// ---------------------------------------------------------------------------

describe('M5 — a date that matters', () => {
  it('fires on the birthday, comparing MM-DD as a string', () =>
    withRollback(async (tx) => {
      /*
       * **A server-side `getMonth()` wishes somebody in Jakarta a happy birthday a day
       * early** — `local_date`'s trap arriving on the one day of the year it is least
       * forgivable. The birth YEAR never leaves the row.
       */
      const userId = await makeUser(tx, 'm5bday');
      await tx
        .insert(profiles)
        .values({ userId, fullName: 'Miftahul', nickname: 'Mifta', birthDate: '1994-08-07' });
      const found = await selectMaterial(tx, args(userId, { birthDate: '1994-08-07' }));
      expect(found).toEqual({
        kind: 'occasion',
        occasion: 'birthday',
        years: null,
        localDate: TODAY,
      });
      /* NO AGE, EVER. */
      expect(JSON.stringify(found)).not.toContain('1994');
    }));

  it('beats a reading, because the order is fixed rather than scored (§4.2)', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm5first');
      await makeReading(tx, userId);
      const found = await selectMaterial(tx, args(userId, { birthDate: '1994-08-07' }));
      expect(found?.kind).toBe('occasion');
    }));

  it('fires for a querent who came back after a fortnight', () =>
    withRollback(async (tx) => {
      /* **The only material that fires for somebody with no readings, no messages and no
       * recent activity** — i.e. the exact person a proactive feature is for. */
      const userId = await makeUser(tx, 'm5back');
      const away = new Date(NOW.getTime() - 20 * 86_400_000);
      const found = await selectMaterial(tx, args(userId, { lastSeenAt: away }));
      expect(found?.kind === 'occasion' && found.occasion).toBe('return');
    }));

  it('DOES NOT fire for a querent who was here yesterday', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm5here');
      const yesterday = new Date(NOW.getTime() - 86_400_000);
      expect(await selectMaterial(tx, args(userId, { lastSeenAt: yesterday }))).toBeNull();
    }));
});

describe('M6 — a Lotus fact newly relevant', () => {
  async function seedLotus(tx: Tx | Db, userId: string, updatedAt: Date) {
    await tx.insert(lotusAvatars).values({
      userId,
      summary: { id: 'orang yang menahan banyak hal sendirian', en: 'someone who carries a lot alone' },
      traits: { color: null, introversion: null, answered: [], skipped: [], themes: [], anchor: null },
      sourceVersion: 1,
      inputHash: 'h',
      model: 'test',
      updatedAt,
    });
  }

  it('fires when the distillation was rebuilt after the last proactive run', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm6');
      await seedLotus(tx, userId, new Date(NOW.getTime() - 3_600_000));
      await tx.insert(onboardingAnswers).values({
        userId,
        questionKey: 'worst_thing',
        answerText: 'v1.aaa.bbb.ccc',
        updatedAt: new Date(NOW.getTime() - 3_700_000),
      });

      const found = await selectMaterial(
        tx,
        args(userId, { lastProactiveAt: new Date(NOW.getTime() - 7_200_000) }),
      );
      expect(found?.kind).toBe('lotus');
      if (found?.kind !== 'lotus') throw new Error('unreachable');
      /* **F5 DECRYPTS NOTHING** — this is the Lotus summary, model output that already
       * passed `lotusSafetyCheck`. */
      expect(found.summary).toBe('orang yang menahan banyak hal sendirian');
    }));

  it('DOES NOT fire when the edit was a DELETION (C-D8 condition 5)', () =>
    withRollback(async (tx) => {
      /*
       * *"A reader who asks about the thing you refused to answer is the worst possible
       * version of this feature."* A reader remarking on something you just cleared is
       * that failure arriving through the back door — and a skip is `answer_text IS
       * NULL`, never an encrypted empty string.
       */
      const userId = await makeUser(tx, 'm6cleared');
      await seedLotus(tx, userId, new Date(NOW.getTime() - 3_600_000));
      await tx.insert(onboardingAnswers).values({
        userId,
        questionKey: 'worst_thing',
        answerText: null,
        updatedAt: new Date(NOW.getTime() - 3_500_000),
      });
      expect(await selectMaterial(tx, args(userId, { lastProactiveAt: new Date(0) }))).toBeNull();
    }));

  it('DOES NOT fire for a Lotus that predates the last proactive run', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm6stale');
      await seedLotus(tx, userId, new Date(NOW.getTime() - 86_400_000));
      await tx.insert(onboardingAnswers).values({
        userId,
        questionKey: 'worst_thing',
        answerText: 'v1.aaa.bbb.ccc',
      });
      expect(await selectMaterial(tx, args(userId, { lastProactiveAt: NOW }))).toBeNull();
    }));
});

// ---------------------------------------------------------------------------
// De-duplication, and the reads that are not material
// ---------------------------------------------------------------------------

describe('a used material key falls through to the next detector', () => {
  it('offers the orphan when the reading has already been spoken about', () =>
    withRollback(async (tx) => {
      /*
       * **The behavioural reason the check exists at all.** Without it a spent key would
       * refuse the whole run as a duplicate, and the querent would hear nothing while
       * the ladder kept returning the same thing — which for a recurring card is days,
       * by design.
       */
      const userId = await makeUser(tx, 'dedupe');
      const readingId = await makeReading(tx, userId);
      /* A run about that reading, keyed — but pointed at no reading, so only the KEY can
       * refuse it. */
      await makeRun(tx, userId, { trigger: 'cron', materialKey: `reading:${readingId}` });
      const runId = await makeRun(tx, userId);
      await tx.insert(chatMessages).values({
        userId,
        author: 'adrian',
        body: 'itu dua daftar yang beda',
        locale: 'id',
        runId,
        beatIndex: 0,
        intent: 'answer',
        createdAt: new Date(NOW.getTime() - 5 * 3_600_000),
      });

      expect((await selectMaterial(tx, args(userId)))?.kind).toBe('orphan');
    }));
});

describe('readQuerent', () => {
  it('reports the soft delete, which the session cannot ([F5-15])', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'erased');
      expect((await readQuerent(tx, userId))?.erased).toBe(false);
      await tx.update(users).set({ deletedAt: NOW }).where(eqUser(userId));
      expect((await readQuerent(tx, userId))?.erased).toBe(true);
    }));

  it('answers null for a user that is not there', async () => {
    await withRollback(async (tx) => {
      expect(await readQuerent(tx, '00000000-0000-4000-8000-000000000000')).toBeNull();
    });
  });
});

describe('the cron’s reads', () => {
  it('offers only querents who have opened the room, are alive, and are idle', () =>
    withRollback(async (tx) => {
      const opened = await makeUser(tx, 'cand-open');
      const never = await makeUser(tx, 'cand-never');
      const busy = await makeUser(tx, 'cand-busy');
      const gone = await makeUser(tx, 'cand-gone');

      for (const id of [opened, busy, gone]) {
        await tx
          .insert(chatMessages)
          .values({ userId: id, author: 'user', body: 'hai', locale: 'id' });
      }
      await markOpened(tx, opened);
      await markOpened(tx, busy);
      await markOpened(tx, gone);
      await upsertThread(tx, never, {});
      await makeRun(tx, busy, { status: 'pending' });
      await tx.update(users).set({ deletedAt: NOW }).where(eqUser(gone));

      const ids = (await nudgeCandidates(tx, { localDate: TODAY, limit: 10 })).map((c) => c.userId);
      expect(ids).toContain(opened);
      /* **The one source with nobody present must not cold-call a room nobody has seen.** */
      expect(ids).not.toContain(never);
      expect(ids).not.toContain(busy);
      expect(ids).not.toContain(gone);
    }));

  it('abandons an expired run and leaves a leased one alone ([F5-5])', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'ttl');
      const old = new Date(NOW.getTime() - 72 * 3_600_000);
      const expired = await makeRun(tx, userId, { status: 'pending', createdAt: old });
      const leased = await makeRun(tx, userId, {
        status: 'running',
        createdAt: old,
        leaseUntil: new Date(NOW.getTime() + 60_000),
        leaseOwner: 'somebody',
      });
      const fresh = await makeRun(tx, userId, { status: 'pending', createdAt: NOW });

      const count = await abandonExpiredRuns(tx, {
        olderThan: new Date(NOW.getTime() - 48 * 3_600_000),
        now: NOW,
      });
      expect(count).toBe(1);
      expect(await statusOf(tx, expired)).toBe('abandoned');
      /* `C-R3`'s predicate, reused: **a run somebody is holding is not ours to abandon.** */
      expect(await statusOf(tx, leased)).toBe('running');
      expect(await statusOf(tx, fresh)).toBe('pending');
    }));
});

// --- small helpers, kept at the bottom so the cases read as prose ------------

function eqUser(userId: string) {
  return eq(users.id, userId);
}

async function markOpened(tx: Tx | Db, userId: string) {
  await upsertThread(tx, userId, {});
  await tx.execute(
    sql`update chat_threads set last_read_at = now() where user_id = ${userId}::uuid`,
  );
}

async function statusOf(tx: Tx | Db, runId: string): Promise<string> {
  const [row] = await tx
    .select({ status: chatRuns.status })
    .from(chatRuns)
    .where(eq(chatRuns.id, runId))
    .limit(1);
  return row.status;
}
