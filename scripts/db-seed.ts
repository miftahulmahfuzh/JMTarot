/**
 * The development seed: two users and two weeks of plausible history.
 *
 * W5 has to build card-frequency verdicts, chained readings and per-day
 * summaries. Against empty tables all three render as their empty state and
 * the actual features are unverifiable, so this produces data with the shape
 * those features need -- including a deliberately rigged card distribution
 * (see RIGGED below) so an assertion can be exact rather than loose.
 *
 * Run it as often as you like: it deletes the two dev users before inserting,
 * so it is idempotent by deletion rather than by upsert.
 */
import { createHash, randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { inArray, like, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { CARDS, effectiveYesNo } from '@/data/deck';
import type { Locale, ReaderId, ServiceId } from '@/data/types';
import { answerAad, encryptField } from '@/lib/db/crypto';
import { insertReading, type ReadingCardInput } from '@/lib/db/queries/history';
import * as schema from '@/lib/db/schema';
import {
  events,
  lotusAvatars,
  moderationFlags,
  onboardingAnswers,
  profiles,
  users,
  type NewReading,
} from '@/lib/db/schema';
import { todayKey } from '@/lib/storage';

config({ path: '.env.local', quiet: true });

// ---------------------------------------------------------------------------
// Guard rails, before anything else. This script DELETES before it inserts and
// both failure modes it prevents are unrecoverable.
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === 'production') {
  throw new Error('refusing to seed production');
}
if (!process.env.DATABASE_URL?.includes('127.0.0.1')) {
  throw new Error('refusing to seed a non-local DATABASE_URL');
}

/**
 * mulberry32. A FIXED seed, so the seeded history is byte-identical on every
 * machine and every run -- which is what lets W5 assert an EXACT top-two card
 * pair instead of "some pair". `Math.random()` would make the frequency
 * feature testable only loosely, and loosely is how an off-by-one window bound
 * survives.
 *
 * This file is a script, so CLAUDE.md's rule about never shuffling in a
 * useState initialiser does not apply -- but the reasoning behind it does. An
 * impure seed is a seed you cannot write an assertion against.
 */
function mulberry32(seed: number) {
  return function next(): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0x4a4d5441); // 'JMTA'
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

// ---------------------------------------------------------------------------
// The fixtures
// ---------------------------------------------------------------------------

const READERS: readonly ReaderId[] = ['thessaly', 'margaret', 'adrian'];

/**
 * Every session id this script writes starts with it, so the seeded rows can
 * be found again without a user id. That matters for `events`, which is the
 * one seeded table that legitimately holds rows with `user_id IS NULL`.
 */
const SESSION_PREFIX = 'seed-session-';

/** Card counts per service, so a spread3 writes three rows and a yesno one. */
const CARDS_PER_SERVICE: Record<ServiceId, number> = { daily: 1, spread3: 3, yesno: 1 };

const STRENGTH = 8;
const HANGED_MAN = 12;

/**
 * RIGGED. Over the last seven days the top two cards must be Strength (8) then
 * The Hanged Man (12), in that order and with a clear margin, because that is
 * the pair in the roadmap's own worked sentence:
 *
 *   "Minggu ini semesta membacamu sebagai Strength di atas The Hanged Man."
 *
 * W5 can therefore assert a known answer. The random pool excludes both cards
 * so nothing can drift into a tie, and the counts are re-derived and checked
 * at the end of this script rather than trusted.
 */
const RIG_STRENGTH_COUNT = 6;
const RIG_HANGED_COUNT = 4;
const RANDOM_POOL = CARDS.map((c) => c.id).filter(
  (id) => id !== STRENGTH && id !== HANGED_MAN,
);

/**
 * Readings per day, indexed by days ago. Three days carry two or more so the
 * per-day summary has something to summarize, and day 9 is EMPTY so the
 * "nothing today" branch is reachable -- roadmap §5 says an empty state that
 * announces itself destroys the effect, and W5 cannot verify that against a
 * history with no gaps in it.
 */
const READINGS_PER_DAY = [2, 1, 3, 1, 1, 2, 1, 1, 2, 0, 1, 1, 2, 1];
const RIG_WINDOW_DAYS = 7;

const QUESTIONS_ID = [
  'Apakah aku sebaiknya pindah kerja tahun ini?',
  'Kenapa aku merasa jalan di tempat?',
  'Apa yang perlu aku lepaskan bulan ini?',
  null,
  'Apakah dia masih memikirkan aku?',
  null,
];

const BODIES_ID = [
  'Kartu ini datang seperti napas yang tertahan lalu dilepas. Ada sesuatu yang sudah kamu tahu jawabannya.',
  'Yang kamu sebut kebuntuan sebenarnya jeda. Semesta sedang menata ulang urutannya, bukan membatalkannya.',
  'Ada yang kamu genggam terlalu lama. Melepas bukan kalah, itu memberi ruang pada yang berikutnya.',
];

const GISTS_ID = [
  'disuruh berhenti menunda keputusan kerja',
  'jeda dibaca sebagai penataan ulang, bukan kegagalan',
  'diminta melepas sesuatu yang sudah selesai',
  'diyakinkan bahwa arah yang dipilih sudah benar',
];

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

// ---------------------------------------------------------------------------

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  try {
    const devSubs = ['dev:miftah', 'dev:jodith'];

    // ---- Idempotency by deletion ----------------------------------------
    //
    // ON DELETE CASCADE clears profiles, onboarding_answers, lotus_avatars,
    // readings, reading_cards, daily_summaries and frequency_verdicts.
    // `events` and `moderation_flags` are ON DELETE SET NULL, so their rows
    // would SURVIVE as orphans -- delete those by user_id first, explicitly.
    //
    // `events` additionally needs the session-prefix clause, and this is not
    // belt-and-braces: the anonymous event below is written with user_id NULL
    // on purpose, so an id-only delete never matches it and the table grows by
    // one row on every run. Caught by the idempotency check, which is what
    // that check is for.
    //
    // This also happens to exercise the erasure path roadmap §8 promises in
    // the privacy policy, which makes `npm run db:seed` the cheapest test that
    // cascade deletion actually works.
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.googleSub, devSubs));
    const staleIds = existing.map((u) => u.id);

    await db
      .delete(events)
      .where(
        staleIds.length > 0
          ? or(inArray(events.userId, staleIds), like(events.sessionId, `${SESSION_PREFIX}%`))
          : like(events.sessionId, `${SESSION_PREFIX}%`),
      );
    if (staleIds.length > 0) {
      await db.delete(moderationFlags).where(inArray(moderationFlags.userId, staleIds));
    }
    await db.delete(users).where(inArray(users.googleSub, devSubs));

    // ---- The two dev users ----------------------------------------------
    //
    // `dev:` cannot collide with a real Google `sub`, which is a decimal
    // string of digits, and it is greppable -- `delete from users where
    // google_sub like 'dev:%'` is a safe and obvious cleanup. Created HERE and
    // never by a migration: a migration that inserts application rows runs in
    // production too, and the entire point of these accounts is that they do
    // not exist there.
    //
    // One 'id' and one 'en' locale, so W6 has an English user to look at
    // without editing a row by hand.
    const [miftah, jodith] = await db
      .insert(users)
      .values([
        {
          googleSub: 'dev:miftah',
          email: 'miftah@dev.local',
          emailVerified: false,
          displayName: 'Miftah',
          locale: 'id' as Locale,
        },
        {
          googleSub: 'dev:jodith',
          email: 'jodith@dev.local',
          emailVerified: false,
          displayName: 'Jodith',
          locale: 'en' as Locale,
        },
      ])
      .returning();

    // ---- Profiles --------------------------------------------------------
    //
    // Miftah's is complete; Jodith's has completed_at NULL and no answers at
    // all, which is the "onboarding started, not finished" state W3 needs to
    // build the resume path against.
    await db.insert(profiles).values([
      {
        userId: miftah.id,
        fullName: 'Miftahul Mahfuzh',
        nickname: 'Mif',
        birthDate: '1994-11-02',
        completedAt: daysAgo(20),
      },
      {
        userId: jodith.id,
        fullName: 'Jodith Ayu',
        nickname: 'Jo',
        birthDate: '1996-06-18',
        completedAt: null,
      },
    ]);

    // ---- Onboarding answers, for Miftah only -----------------------------
    //
    // The free-text answers go through encryptField, deliberately: a seed that
    // writes plaintext into answer_text makes the §8 audit query fail and
    // teaches the next person the wrong thing. `worst_thing` is SKIPPED,
    // because roadmap §8 requires the skip path to work and a state that is
    // required to work has to be represented in the fixtures.
    const answer = (key: schema.QuestionKey, text: string) => ({
      userId: miftah.id,
      questionKey: key,
      answerText: encryptField(text, answerAad(miftah.id, key)),
      skipped: false,
    });

    await db.insert(onboardingAnswers).values([
      answer('best_thing', 'Waktu ibu bilang dia bangga, tanpa aku minta.'),
      {
        userId: miftah.id,
        questionKey: 'worst_thing' as const,
        answerText: null,
        skipped: true,
      },
      answer('most_loved', 'Seseorang yang bukan keluarga, yang selalu menunggu tanpa mengeluh.'),
      answer('willow_wish', 'Ingin tahu apakah arah yang aku pilih ini benar.'),
      { userId: miftah.id, questionKey: 'introversion' as const, answerChoice: '65' },
      { userId: miftah.id, questionKey: 'color' as const, answerChoice: 'black' },
    ]);

    // ---- The Lotus avatar, for Miftah only -------------------------------
    //
    // Written to respect the no-therapy rule (roadmap §8's last bullet):
    // "membawa ingatan yang berat", never "trauma". And per reconciliation
    // §7.5 it carries RELATIONS, never the third-party name from `most_loved`.
    const lotusSummary = {
      id:
        'Seseorang yang menimbang lama sebelum bicara, lebih tenang di ruang kecil daripada ' +
        'di keramaian. Membawa satu kebanggaan lama dari orang tua dan satu ingatan yang berat ' +
        'yang ia pilih untuk tidak ceritakan. Menyimpan kasih pada seseorang di luar keluarga ' +
        'yang selalu menunggu. Yang ia cari bukan jawaban, melainkan kepastian arah.',
      en:
        'Someone who weighs things a long time before speaking, steadier in a small room than ' +
        'in a crowd. Carries one old pride from a parent and one heavy memory they chose not to ' +
        'tell. Holds affection for someone outside the family who always waits. What they want ' +
        'is not an answer but confirmation of a direction.',
    };

    await db.insert(lotusAvatars).values({
      userId: miftah.id,
      summary: lotusSummary,
      traits: { color: 'black', introversion: 65 },
      sourceVersion: 1,
      // W3 computes this over the sanitized answer set; the seed just needs a
      // stable value of the right shape.
      inputHash: createHash('sha256').update(JSON.stringify(lotusSummary)).digest('hex'),
      model: 'seed',
    });

    // ---- Fourteen days of readings ---------------------------------------

    // The rigged slots, consumed in order across the last-7-day readings.
    const riggedCards: number[] = [
      ...Array<number>(RIG_STRENGTH_COUNT).fill(STRENGTH),
      ...Array<number>(RIG_HANGED_COUNT).fill(HANGED_MAN),
    ];
    let rigCursor = 0;

    let readingIndex = 0;
    /** The most recent seeded reading, for the reading.completed event below. */
    let lastReading: { id: string; readerId: string; serviceId: string } | null = null;

    for (let d = READINGS_PER_DAY.length - 1; d >= 0; d -= 1) {
      const localDate = todayKey(daysAgo(d));
      const inRigWindow = d < RIG_WINDOW_DAYS;

      for (let n = 0; n < READINGS_PER_DAY[d]; n += 1) {
        const serviceId = (['daily', 'spread3', 'yesno'] as const)[readingIndex % 3];
        const readerId = READERS[readingIndex % READERS.length];

        const cards: ReadingCardInput[] = [];
        for (let position = 0; position < CARDS_PER_SERVICE[serviceId]; position += 1) {
          // Inside the rig window, spend the rigged cards first and fall back
          // to a pool that excludes both of them, so nothing can drift into a
          // tie. Outside it, anything goes.
          const cardId =
            inRigWindow && rigCursor < riggedCards.length
              ? riggedCards[rigCursor++]
              : pick(inRigWindow ? RANDOM_POOL : CARDS.map((c) => c.id));

          cards.push({ cardId, reversed: rand() < 0.3, position });
        }

        // A couple of non-'ok' rows, so W4 has stream-failure data and W5 can
        // see that reconciliation R7 holds: a failed reading still contributed
        // its cards to the frequency verdict.
        const status =
          readingIndex === 4 ? 'partial' : readingIndex === 11 ? 'failed' : 'ok';

        const first = CARDS.find((c) => c.id === cards[0].cardId)!;
        const reading: NewReading = {
          userId: miftah.id,
          readerId,
          serviceId,
          locale: 'id',
          question: QUESTIONS_ID[readingIndex % QUESTIONS_ID.length],
          status,
          verdict:
            serviceId === 'yesno'
              ? effectiveYesNo({ card: first, reversed: cards[0].reversed })
              : null,
          body: status === 'failed' ? null : pick(BODIES_ID),
          gist: status === 'failed' ? null : pick(GISTS_ID),
          model: 'seed',
          // Reconciliation R5's format: <locale>-v1.<sha8>.
          promptVersion: 'id-v1.5eed0000',
          latencyMs: 900 + Math.floor(rand() * 2600),
          tokenInput: 700 + Math.floor(rand() * 400),
          tokenOutput: 120 + Math.floor(rand() * 120),
          sessionId: `${SESSION_PREFIX}${d}`,
          localDate,
          createdAt: new Date(daysAgo(d).setHours(9 + n * 4, 12, 0, 0)),
        };

        // Through the query module, not by direct insert: otherwise the seed
        // is not evidence that insertReading works.
        const stored = await insertReading(db, reading, cards);
        // Kept so the reading.completed event below can name a reading that
        // really exists -- see the comment on that event.
        lastReading = { id: stored.id, readerId, serviceId };
        readingIndex += 1;
      }
    }

    // ---- v0.7.0 / F6: two readings that exist only to be ATTACHED ---------
    //
    // The attachment card is the widest thing in the room and `_chatfit.html` is
    // the only loop that answers width, so the two fixtures F6 §13 asks for are
    // seeded rather than described:
    //
    //   1. **The widest meta stack.** An `en` `spread3` — three thumbnails, so the
    //      card row is at its widest — with a question at `MAX_QUESTION_LENGTH`
    //      and a body long enough that the snippet is CUT. Its locale is `en` on
    //      purpose: in the harness's `id` run the language chip renders, and chip
    //      + question + snippet together is the tallest, widest stack the card can
    //      produce. `Thessaly` is the longest reader name and rides with it.
    //   2. **The thinnest.** An `id` `daily` — ONE thumbnail — attached with NO
    //      TEXT AT ALL (§3.3), which is both a legal conversational move and the
    //      case where the card must not look like an empty box.
    //
    // Their `local_date` is months back, so the meta line carries a year and the
    // date is the long form rather than "hari ini".
    const ATTACH_QUESTION_EN = (
      'should i take the offer in another city or stay where my family is, ' +
      'because the money is better there but everyone i know is here and i keep ' +
      'going back and forth about it every single night'
    ).slice(0, 200);

    const attachedSpread = await insertReading(
      db,
      {
        userId: miftah.id,
        readerId: 'thessaly',
        serviceId: 'spread3',
        locale: 'en',
        question: ATTACH_QUESTION_EN,
        status: 'ok',
        verdict: null,
        body:
          'What has passed is The Tower reversed — the collapse you keep bracing for ' +
          'already happened, quietly, and you were the only one who did not call it that.\n\n' +
          'What moves now is The Hermit. You have been alone with this on purpose.\n\n' +
          'What comes is The Lovers, and it is not about romance. It is about choosing ' +
          'one thing and letting the other one go.\n\n' +
          'So: the road is not the question. The staying is.',
        gist: 'weighing a move against the people already here',
        model: 'seed',
        promptVersion: 'en-v1.5eed0000',
        latencyMs: 4200,
        tokenInput: 900,
        tokenOutput: 240,
        sessionId: `${SESSION_PREFIX}attach`,
        localDate: '2026-06-14',
        createdAt: new Date('2026-06-14T09:20:00Z'),
      },
      [
        { cardId: 16, reversed: true, position: 0 },
        { cardId: 9, reversed: false, position: 1 },
        { cardId: 6, reversed: false, position: 2 },
      ],
    );

    const attachedDaily = await insertReading(
      db,
      {
        userId: miftah.id,
        readerId: 'margaret',
        serviceId: 'daily',
        locale: 'id',
        question: null,
        status: 'ok',
        verdict: null,
        body: 'Hari ini tidak menuntut apa-apa darimu. Itu bukan kekosongan, itu jeda.',
        gist: 'diminta membiarkan hari berjalan pelan',
        model: 'seed',
        promptVersion: 'id-v1.5eed0000',
        latencyMs: 1800,
        tokenInput: 700,
        tokenOutput: 90,
        sessionId: `${SESSION_PREFIX}attach`,
        localDate: '2026-07-02',
        createdAt: new Date('2026-07-02T02:10:00Z'),
      },
      [{ cardId: 2, reversed: false, position: 0 }],
    );

    // ---- v0.7.0: one chat thread, for the width harness -------------------
    //
    // **`public/cards/_chatfit.html` DRIVES THE REAL `/chat`**, because inlining
    // the CSS would measure a snapshot of the stylesheet and drift from it
    // silently -- `_slotfit.html`'s own stated failure mode. So the room has to
    // CONTAIN the pathological content, and the only way to put it there without
    // a model call per harness run is here (reconciliation §4 assigns this to
    // F4).
    //
    // Dev-only by construction: this script refuses a non-local DATABASE_URL and
    // CLAUDE.md forbids a migration that inserts rows, so production pays
    // nothing for any of it.
    //
    // FOUR HARD CASES, one per thing loop 4 measures:
    //   1. a 400-character single-paragraph bubble whose longest token has no
    //      spaces -- `overflow-wrap: anywhere` is what stops a pasted URL blowing
    //      the row, and nothing else in this app has ever needed it;
    //   2. a quote stub of that bubble, which is the widest stub obtainable;
    //   3. all three readers, since `Margaret` is the longest name and Cinzel at
    //      --ls-button is wider than it looks;
    //   4. a MIDNIGHT CROSSING, so the day separator is exercised in the
    //      querent's own zone rather than in UTC.
    //
    // `last_read_at` is deliberately BEHIND the last reader bubble, so the badge
    // has something to show: a dot at zero is unmeasurable, and `C-N2b`'s red dot
    // is half of this release's acceptance criteria.
    const chatRunId = randomUUID();
    await db.insert(schema.chatRuns).values({
      id: chatRunId,
      userId: miftah.id,
      trigger: 'user_message',
      status: 'done',
      locale: 'id' as Locale,
      beats: { v: 1, beats: [] },
      beatsDone: 0,
      planSource: 'model',
    });

    const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
    /** Yesterday at 23:50 and today at 00:05 IN THE MACHINE's zone -- the crossing
     *  has to be local, because that is the only thing the separator reads. */
    const localAt = (dayOffset: number, h: number, m: number) => {
      const d = new Date();
      d.setDate(d.getDate() + dayOffset);
      d.setHours(h, m, 0, 0);
      return d;
    };

    /* A single paragraph, no line breaks, and one 96-character unbroken token. */
    const LONG_BUBBLE =
      'ini yang aku maksud kemarin, soal kerjaan yang bikin aku mikir terus sampai kebawa mimpi, ' +
      'dan aku juga sempat baca sesuatu di ' +
      'https://contoh.example.com/artikel/tentang-arah-hidup-dan-pekerjaan-yang-panjang-sekali-sampai-tidak-muat ' +
      'yang bikin makin bingung, jadi sebenarnya aku pengen tahu menurut kalian bertiga gimana';

    const bigId = randomUUID();
    const chatRows: schema.NewChatMessage[] = [
      {
        userId: miftah.id,
        author: 'thessaly',
        body: 'kamu masih kepikiran yang kemarin itu, mif?',
        locale: 'id' as Locale,
        runId: chatRunId,
        beatIndex: 0,
        intent: 'ask',
        model: 'seed',
        createdAt: localAt(-1, 19, 40),
      },
      {
        id: bigId,
        userId: miftah.id,
        author: 'user',
        body: LONG_BUBBLE,
        locale: 'id' as Locale,
        createdAt: localAt(-1, 23, 50),
      },
      {
        userId: miftah.id,
        author: 'margaret',
        body: 'mulai dari yang paling kecil. yang lain menyusul sendiri.',
        locale: 'id' as Locale,
        replyToMessageId: bigId,
        runId: chatRunId,
        beatIndex: 1,
        intent: 'answer',
        model: 'seed',
        // 00:05 -- the other side of the crossing.
        createdAt: localAt(0, 0, 5),
      },
      {
        userId: miftah.id,
        author: 'adrian',
        body: 'wkwk',
        locale: 'id' as Locale,
        runId: chatRunId,
        beatIndex: 2,
        intent: 'react',
        model: 'seed',
        createdAt: minutesAgo(90),
      },
      {
        userId: miftah.id,
        author: 'user',
        body: 'iya sih',
        locale: 'id' as Locale,
        createdAt: minutesAgo(80),
      },
      {
        userId: miftah.id,
        author: 'adrian',
        body: 'emang kenapa? kalau kamu udah tahu jawabannya, kenapa masih nanya ke kami bertiga.',
        locale: 'id' as Locale,
        runId: chatRunId,
        beatIndex: 3,
        intent: 'tease',
        model: 'seed',
        createdAt: minutesAgo(20),
      },
      /*
       * F6's two fixtures. A CAPTIONED attachment and a bare one, in that order,
       * so the harness can measure both without scrolling: the card on top and
       * the querent's text under it is ONE bubble — one `chat_messages` row with
       * both `body` and `attached_reading_id`, exactly as WhatsApp renders a
       * captioned image. Two bubbles would need two rows and the schema has one
       * column.
       */
      {
        userId: miftah.id,
        author: 'user',
        body: 'ini gimana menurut kalian? masih kepikiran sampai sekarang.',
        locale: 'id' as Locale,
        attachedReadingId: attachedSpread.id,
        createdAt: minutesAgo(14),
      },
      {
        userId: miftah.id,
        author: 'user',
        /* **EMPTY, AND `''` RATHER THAN NULL** (§3.3). The column is `text not
           null`, and a second representation of "nothing typed" is how two code
           paths start disagreeing about what an attachment with no words is. */
        body: '',
        locale: 'id' as Locale,
        attachedReadingId: attachedDaily.id,
        createdAt: minutesAgo(12),
      },
    ];
    await db.insert(schema.chatMessages).values(chatRows);

    await db.insert(schema.chatThreads).values({
      userId: miftah.id,
      /* Behind Adrian's LAST bubble and ahead of his first, so `unread` is 1 --
         verified in a browser: the button reads "Buka grup, 1 pesan baru" and grows
         its dot. `unreadCount` counts reader rows after this instant, so moving it
         moves the badge. */
      lastReadAt: minutesAgo(85),
      lastUserMessageAt: minutesAgo(80),
      lastReaderMessageAt: minutesAgo(20),
    });

    // ---- A handful of events ---------------------------------------------
    //
    // NAMES FROM W4's CLOSED TAXONOMY (src/lib/analytics/events.ts). They were
    // placeholders of the right shape -- `reader_selected`, `login_viewed` --
    // written before that file existed and explicitly pending it; leaving them
    // would have made `where name like 'reading.%'` miss the seeded rows and
    // handed the next person two naming conventions to choose between.
    //
    // Props are scalars by construction. Reconciliation R9 makes that a runtime
    // rule, because it is what allows `events` to survive account erasure with
    // user_id nulled.
    await db.insert(events).values([
      {
        userId: miftah.id,
        sessionId: `${SESSION_PREFIX}0`,
        name: 'reader.chosen',
        props: { reader_id: 'thessaly' },
        locale: 'id' as Locale,
        localDate: todayKey(),
      },
      {
        userId: miftah.id,
        sessionId: `${SESSION_PREFIX}0`,
        name: 'service.chosen',
        props: { reader_id: 'thessaly', service_id: 'spread3' },
        locale: 'id' as Locale,
        localDate: todayKey(),
      },
      {
        userId: miftah.id,
        sessionId: `${SESSION_PREFIX}0`,
        /*
         * NAMES A READING THAT REALLY EXISTS, and that is not a detail.
         * docs/analytics-queries.md's first query -- the alarm -- looks for a
         * client `reading.completed` with no matching `readings` row, which is
         * how a lost after() write is detected. A seeded event pointing at a
         * fabricated uuid would make that alarm fire on a fresh database and
         * teach whoever runs it to ignore the result.
         */
        name: 'reading.completed',
        props: {
          reading_id: lastReading?.id ?? '',
          reader_id: lastReading?.readerId ?? 'thessaly',
          service_id: lastReading?.serviceId ?? 'spread3',
          latency_ms: 2140,
          total_ms: 5120,
          chars: 812,
          token_input: null,
          token_output: 168,
          truncated: false,
          status: 'ok',
          source: 'client',
        },
        locale: 'id' as Locale,
        localDate: todayKey(),
      },
      {
        userId: jodith.id,
        sessionId: `${SESSION_PREFIX}jo`,
        name: 'reader.chosen',
        props: { reader_id: 'margaret' },
        locale: 'en' as Locale,
        localDate: todayKey(),
      },
      {
        // An anonymous event, so the SET NULL shape is represented too -- and
        // app.launched genuinely has no user, which is why /api/events is
        // public at all.
        userId: null,
        sessionId: `${SESSION_PREFIX}anon`,
        name: 'app.launched',
        props: { standalone: false, referrer_kind: 'direct' },
        locale: 'id' as Locale,
        localDate: todayKey(),
      },
    ]);

    // moderation_flags is left EMPTY on purpose. W7 owns that table and its
    // content is sensitive by definition; empty is the correct starting state.

    // ---- Verify the rig held ---------------------------------------------
    //
    // Re-derived rather than trusted. The whole value of a fixed PRNG seed is
    // that W5 can assert an exact answer, and that is worth nothing if the
    // fixture quietly drifts into a tie.
    const counts = new Map<number, number>();
    const since = todayKey(daysAgo(RIG_WINDOW_DAYS - 1));
    const rows = await db.select().from(schema.readingCards);
    for (const row of rows) {
      if (row.localDate >= since) {
        counts.set(row.cardId, (counts.get(row.cardId) ?? 0) + 1);
      }
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const [top, second, third] = ranked;

    if (top?.[0] !== STRENGTH || second?.[0] !== HANGED_MAN) {
      throw new Error(
        `the rigged distribution drifted: expected ${STRENGTH} then ${HANGED_MAN}, ` +
          `got ${JSON.stringify(ranked.slice(0, 3))}`,
      );
    }
    if (top[1] <= second[1] || (third && second[1] <= third[1])) {
      throw new Error(`the rigged margin collapsed into a tie: ${JSON.stringify(ranked.slice(0, 3))}`);
    }

    const name = (id: number) => CARDS.find((c) => c.id === id)!.name;
    console.log(
      `seeded: 2 users, ${readingIndex} readings, ${rows.length} cards\n` +
        `last ${RIG_WINDOW_DAYS} days: ${name(top[0])} x${top[1]} over ` +
        `${name(second[0])} x${second[1]}` +
        (third ? ` (next: ${name(third[0])} x${third[1]})` : ''),
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('\nseed failed:', err);
  process.exit(1);
});
