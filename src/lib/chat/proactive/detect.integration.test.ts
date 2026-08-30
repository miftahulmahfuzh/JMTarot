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
  userMemory,
  users,
} from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Db, Tx } from '@/lib/db/types';
import type { UserMemoryItem } from '@/lib/memory/profile/types';
import { resolveChatClock } from '../clock';
import { materialLineForRun } from './brief';
import {
  abandonExpiredRuns,
  nudgeCandidates,
  readQuerent,
  selectMaterial,
  selectReadingMaterial,
} from './detect';
import { materialKey, type Material } from './material';
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
    /*
     * **NULL BY DEFAULT, AND EVERY EXISTING NEGATIVE IN THIS FILE DEPENDS ON IT.** M8 is
     * last in `MATERIAL_ORDER` and is available in every part of every day, so with an
     * offset set it would answer *every* case here that asserts `selectMaterial` finds
     * nothing — turning a suite full of honest negatives green for the wrong reason. It is
     * also the production default until a browser has reported: no time material, never an
     * error.
     */
    clock: resolveChatClock({ offsetMinutes: null, now: NOW }),
    ...over,
  };
}

/** A clock that knows where the querent is. Jakarta, `+420`, the release's own example. */
function jakarta(now: Date = NOW) {
  return resolveChatClock({ offsetMinutes: 420, now });
}

/**
 * A `user_memory` row, written directly. **The generator is phase 4's and this suite must
 * not depend on a model call** — `frequencyMechanic`'s rule one workstream over: the
 * detector's job is to find the row, not to have produced it.
 *
 * **THE IDS ARE REAL TWELVE-HEX IDS AND THAT IS NOT COSMETIC.** `detectProfile` filters
 * through `isUserMemoryItem`, the same predicate phase 5's `<ingatan>` and phase 6's
 * `/account` list use, so an item this helper writes with a readable id would be one the
 * rest of the release cannot see. The constants below say which is which.
 *
 * The column names follow phase 3's table; if they move, this helper is the one place.
 */
async function putMemory(tx: Tx | Db, userId: string, items: UserMemoryItem[]): Promise<void> {
  const now = new Date();
  await tx
    .insert(userMemory)
    .values({
      userId,
      items,
      inputHash: 'test',
      sourceVersion: 1,
      model: 'test',
      promptVersion: 'test',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({ target: userMemory.userId, set: { items, updatedAt: now } });
}

/** The dinner line. `f00d…`, so a failing assertion says which item it meant. */
const ID_FOOD = 'f00d5a1ad00d';
/** The annoying colleague. */
const ID_WORK = 'b055c0ffee11';

function item(id: string, kind: UserMemoryItem['kind'], text: string): UserMemoryItem {
  return { id, kind, text, lastSeen: TODAY };
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

// ---------------------------------------------------------------------------
// M7 — something the room already knows about the querent
// ---------------------------------------------------------------------------

describe('M7 — a remembered fact', () => {
  it('finds the first item whose key is free this month, and carries no text', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm7');
      await putMemory(tx, userId, [
        item(ID_FOOD, 'taste', 'biasanya makan malam nasi padang'),
        item(ID_WORK, 'situation', 'ada orang di kantornya yang bikin kesal'),
      ]);

      const found = await selectMaterial(tx, args(userId));
      expect(found?.kind).toBe('profile');
      expect(materialKey(found as Material)).toBe(`profile:${ID_FOOD}:2026-08`);
      /* **The seam, asserted from the database end**: nothing the extractor stored as
       * prose is anywhere in the material the director will be handed. */
      expect(JSON.stringify(found)).not.toContain('nasi padang');
    }));

  it('moves to the next item once this month’s key is spent, and not to the same one again', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm7b');
      await putMemory(tx, userId, [
        item(ID_FOOD, 'taste', 'nasi padang'),
        item(ID_WORK, 'person', 'si bonjeng'),
      ]);
      await makeRun(tx, userId, { materialKey: `profile:${ID_FOOD}:2026-08` });

      const found = await selectMaterial(tx, args(userId));
      expect(materialKey(found as Material)).toBe(`profile:${ID_WORK}:2026-08`);
    }));

  it('comes back to a spent item NEXT MONTH, which is what stops a once-ever opener', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm7c');
      await putMemory(tx, userId, [item(ID_FOOD, 'taste', 'nasi padang')]);
      await makeRun(tx, userId, { materialKey: `profile:${ID_FOOD}:2026-08` });

      expect(await selectMaterial(tx, args(userId))).toBeNull();
      const next = await selectMaterial(tx, args(userId, { localDate: '2026-09-04' }));
      expect(materialKey(next as Material)).toBe(`profile:${ID_FOOD}:2026-09`);
    }));

  it('says nothing when an item has no text — an id alone is not a fact', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm7d');
      await putMemory(tx, userId, [item(ID_FOOD, 'taste', '   ')]);
      expect(await selectMaterial(tx, args(userId))).toBeNull();
    }));

  it('is blind to an item the rest of the release is blind to, and to nothing else', () =>
    withRollback(async (tx) => {
      /*
       * **THE NARROWER IS `isUserMemoryItem`, THE ONE PHASE 5 AND PHASE 6 USE.** A row with
       * a kind outside `USER_MEMORY_KINDS` cannot be written by phase 4's parser at all —
       * it drops the element — and if one somehow existed it would be missing from
       * `<ingatan>` and from `/account` too. So the honest behaviour here is to skip it,
       * not to file it under `other`: the alternative casts the director on a subject the
       * voice cannot see and the querent cannot delete.
       */
      const userId = await makeUser(tx, 'm7e');
      await putMemory(tx, userId, [
        { id: 'not-an-id', kind: 'taste', text: 'sesuatu', lastSeen: TODAY } as never,
        { id: ID_WORK, kind: 'astrology', text: 'sesuatu', lastSeen: TODAY } as never,
        item(ID_FOOD, 'taste', 'nasi padang'),
      ]);
      const found = await selectMaterial(tx, args(userId));
      expect(found).toMatchObject({ kind: 'profile', itemId: ID_FOOD, itemKind: 'taste' });
    }));

  it('rehydrates from the key alone, and loses the subject once the querent deletes it', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm7f');
      await putMemory(tx, userId, [item(ID_FOOD, 'taste', 'nasi padang')]);
      const runId = await makeRun(tx, userId, {
        trigger: 'idle_nudge',
        status: 'pending',
        materialKey: `profile:${ID_FOOD}:2026-08`,
      });

      const line = await materialLineForRun(tx, { runId, userId, locale: 'id', now: NOW });
      expect(line).toContain('profile — ');
      expect(line).toContain('kind=taste');
      expect(line).not.toContain('nasi padang');
      /* The month is in the key and out of the prompt. */
      expect(line).not.toContain('2026-08');

      /* Phase 6's per-item delete, from the material's point of view. */
      await putMemory(tx, userId, []);
      expect(await materialLineForRun(tx, { runId, userId, locale: 'id', now: NOW })).toBeNull();
    }));
});

// ---------------------------------------------------------------------------
// M8 — what time it is where the querent is
// ---------------------------------------------------------------------------

describe('M8 — the clock', () => {
  it('says nothing at all when nobody has reported an offset', () =>
    withRollback(async (tx) => {
      /*
       * **THE NEAREST NEGATIVE, AND THE MOST IMPORTANT ONE IN THE FILE.** An ice-breaker
       * whose entire content is *"it is Monday morning where you are"* is a false statement
       * when we do not know where you are, and being confidently wrong about the clock is
       * the bug R1 exists to delete rather than to move.
       */
      const userId = await makeUser(tx, 'm8a');
      expect(await selectMaterial(tx, args(userId))).toBeNull();
    }));

  it('is the last thing tried, and it is what is left when nothing happened', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm8b');
      const found = await selectMaterial(tx, args(userId, { clock: jakarta() }));
      /* NOW is 2026-08-07T12:00Z; +7h is 19:00 on the Friday. */
      expect(found).toMatchObject({
        kind: 'time_of_day',
        localDate: '2026-08-07',
        weekday: 'fri',
        part: 'evening',
        shape: 'ordinary',
      });
      expect(materialKey(found as Material)).toBe('tod:2026-08-07:evening');
    }));

  it('loses to anything that actually happened', () =>
    withRollback(async (tx) => {
      /* The monopoly argument, as a test: M8 has unlimited supply, so the only thing
       * keeping it from eating every run is its position. */
      const userId = await makeUser(tx, 'm8c');
      await makeReading(tx, userId);
      const found = await selectMaterial(tx, args(userId, { clock: jakarta() }));
      expect(found?.kind).toBe('reading');
    }));

  it('speaks about the day ONCE, however many parts of it are left', () =>
    withRollback(async (tx) => {
      /*
       * **RANKING IS `MATERIAL_ORDER`'s JOB AND VOLUME IS THIS BRAKE'S** (reconciliation
       * ruling 5). Being last stops unlimited supply STARVING the ladder; it does not stop
       * the room mentioning the calendar five times on a quiet day, which is what phase 8's
       * cap of five would otherwise allow — and phase 8's defence of that number rests on
       * `no_material` being the binding gate, which a material available in every part of
       * every day falsifies. The morning key is spent here and the EVENING one is refused,
       * which a `materialKeyUsed` probe alone would not do.
       */
      const userId = await makeUser(tx, 'm8g');
      await makeRun(tx, userId, { materialKey: 'tod:2026-08-07:morning' });
      expect(await selectMaterial(tx, args(userId, { clock: jakarta() }))).toBeNull();

      /* And tomorrow is a new day, so the brake is a brake and not an off switch. */
      const tomorrow = jakarta(new Date('2026-08-08T12:00:00.000Z'));
      const next = await selectMaterial(tx, args(userId, { clock: tomorrow }));
      expect(materialKey(next as Material)).toBe('tod:2026-08-08:evening');
    }));

  it('reads the querent’s own day and not the caller’s, across the date line', () =>
    withRollback(async (tx) => {
      /*
       * The cron passes `utcDateString()`, which at 23:30 UTC is YESTERDAY for a Jakarta
       * querent already having breakfast. The one derivation is phase 1's
       * `resolveChatClock`, read for its `localDate`, so the material follows the person
       * rather than the caller. **`args.localDate` stays the CALLER's day and only
       * `detectTimeOfDay` reads `clock.localDate`** — two day values in one args object,
       * deliberately; see reconciliation ruling 6.
       */
      const userId = await makeUser(tx, 'm8d');
      const found = await selectMaterial(
        tx,
        args(userId, {
          now: new Date('2026-08-30T23:30:00.000Z'),
          localDate: '2026-08-30',
          clock: jakarta(new Date('2026-08-30T23:30:00.000Z')),
        }),
      );
      expect(found).toMatchObject({
        kind: 'time_of_day',
        localDate: '2026-08-31',
        weekday: 'mon',
        part: 'morning',
        shape: 'week_start',
      });
    }));

  it('rehydrates the moment it was minted for, and NOT the moment it is planned in', () =>
    withRollback(async (tx) => {
      /* `brief.ts`'s rule: a run must not change what it is about between mint and plan.
       * `lotusMaterial` re-reads because the Lotus is a fact that moves; a moment does not. */
      const userId = await makeUser(tx, 'm8e');
      const runId = await makeRun(tx, userId, {
        trigger: 'cron',
        status: 'pending',
        materialKey: 'tod:2026-08-09:afternoon',
      });
      const line = await materialLineForRun(tx, {
        runId,
        userId,
        locale: 'id',
        now: new Date('2026-08-10T03:00:00.000Z'),
      });
      expect(line).toContain('time_of_day — ');
      expect(line).toContain('weekday=sun');
      expect(line).toContain('part=afternoon');
      expect(line).toContain('shape=weekend_close');
      /* The date is in the key and out of the prompt. */
      expect(line).not.toContain('2026-08-09');
    }));

  it('answers null on a key it cannot parse rather than failing the run', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx, 'm8f');
      const runId = await makeRun(tx, userId, {
        trigger: 'cron',
        status: 'pending',
        materialKey: 'tod:2026-08-09:teatime',
      });
      expect(await materialLineForRun(tx, { runId, userId, locale: 'id', now: NOW })).toBeNull();
    }));
});
