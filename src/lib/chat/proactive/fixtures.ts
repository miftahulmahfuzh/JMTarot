/**
 * THE EIGHT FIXTURES `npm run smoke -- --chat --proactive` DRIVES. §11.
 *
 * ── WHY THEY ARE DATA IN `src/` AND NOT IN THE SCRIPT ─────────────────────
 *
 * Because `material.test.ts` reads them too. The unit suite and the live run must be
 * looking at the **same** six materials, or the run that a person reads blind is not the
 * run the tests describe — which is the split `pastedArticle.ts` closed for the blog
 * editor one release earlier, for the same reason.
 *
 * ── PURE, AND CAREFULLY SO ────────────────────────────────────────────────
 *
 * No `server-only`, no database, no clock. `runProactive` supplies `now` and the module
 * returns ages in minutes, so the same fixture produces the same prompt on any machine
 * at any hour — which is what makes two runs diffable, and diffing two runs is how the
 * prompt gets calibrated at all.
 *
 * ── TWO ROOMS, NOT ONE, AND NOT SIX ───────────────────────────────────────
 *
 * A proactive run happens in a room that already exists, so each fixture needs a
 * transcript behind it. **One shared room cannot be honest for all six**: M2 needs the
 * last word to be a reader's question, and M3 needs the last word to be a reader's
 * ordinary bubble — the same transcript cannot be both. Six rooms would be six pieces of
 * authored prose nobody re-reads. So there are two, and every fixture names the one it
 * belongs in.
 *
 * **THE ENGLISH ROOM IS A REWRITE, NOT A TRANSLATION** — different subject, different
 * week — which is `## Localization` rule 3's enforcement shape: *a reviewer can see it in
 * five seconds.* If a future version of this file has the querent worrying about their
 * workload in both languages, somebody translated it.
 */
import type { Locale, ReaderId } from '@/data/types';
import { frequencyMechanic } from '@/lib/memory/shadow';
import type { BeatIntent, RunTrigger } from '../types';
import { timeOfDayMaterial, type Material, type MaterialKind } from './material';

/** One canned line. `minutesAgo` is relative to the runner's clock. */
export type FixtureMessage = {
  id: string;
  author: 'user' | ReaderId;
  body: string;
  minutesAgo: number;
  /** Declared, exactly as `chat_messages.intent` is. **Never inferred from a `?`.** */
  intent?: BeatIntent;
};

export type RoomKey = 'quiet' | 'ask';

/**
 * `quiet` — the room said its last thing nine hours ago and nobody picked it up.
 * `ask` — a reader asked something ten hours ago and the querent never came back.
 */
export const PROACTIVE_ROOMS: Record<Locale, Record<RoomKey, FixtureMessage[]>> = {
  id: {
    quiet: [
      { id: 'p1', author: 'user', body: 'kemarin aku akhirnya ngomong ke bos soal beban kerja', minutesAgo: 700 },
      { id: 'p2', author: 'adrian', body: 'nah gitu dong. gimana rasanya?', minutesAgo: 695, intent: 'ask' },
      { id: 'p3', author: 'user', body: 'lega sih, tapi habis itu aku mikirin terus semaleman', minutesAgo: 690 },
      { id: 'p4', author: 'margaret', body: 'Yang kamu pikirkan semalaman itu biasanya bukan percakapannya.', minutesAgo: 540, intent: 'answer' },
    ],
    ask: [
      { id: 'p1', author: 'user', body: 'aku belum bales chat adek aku dari minggu lalu', minutesAgo: 640 },
      { id: 'p2', author: 'margaret', body: 'Seminggu itu panjang untuk satu pesan.', minutesAgo: 635, intent: 'answer' },
      { id: 'p3', author: 'user', body: 'iya aku tau. bingung mau mulai dari mana', minutesAgo: 630 },
      { id: 'p4', author: 'thessaly', body: 'Kalau kamu bales sekarang, kalimat pertamanya apa?', minutesAgo: 600, intent: 'ask' },
    ],
  },
  en: {
    quiet: [
      { id: 'p1', author: 'user', body: 'i put the deposit down on the flat this morning', minutesAgo: 700 },
      { id: 'p2', author: 'thessaly', body: 'That is a real decision. Congratulations.', minutesAgo: 695, intent: 'answer' },
      { id: 'p3', author: 'user', body: 'thanks. feels bigger than i expected honestly', minutesAgo: 690 },
      { id: 'p4', author: 'adrian', body: 'bigger stuff usually lands a day late, yeah', minutesAgo: 540, intent: 'answer' },
    ],
    ask: [
      { id: 'p1', author: 'user', body: 'i turned down the freelance thing in the end', minutesAgo: 640 },
      { id: 'p2', author: 'adrian', body: 'ok. was that the money or the people?', minutesAgo: 635, intent: 'answer' },
      { id: 'p3', author: 'user', body: 'bit of both i think', minutesAgo: 630 },
      { id: 'p4', author: 'margaret', body: 'Which of the two would you have said out loud to them?', minutesAgo: 600, intent: 'ask' },
    ],
  },
};

export type ProactiveFixture = {
  kind: MaterialKind;
  /**
   * The trigger a real mint would have written for this material (§6.2's table). **It
   * is stated rather than derived** so the smoke run's `PEMICU:` line is the one
   * production would show — a fixture that always said `idle_nudge` would never
   * exercise the four trigger phrases the director actually reads.
   */
  trigger: RunTrigger;
  room: RoomKey;
  material: Material;
};

/**
 * The eight, in `MATERIAL_ORDER`. **One per kind, and the run prints all eight** — the blind
 * read's first question is *"guess what this run is about"*, and it cannot be asked of a
 * sample.
 */
export function proactiveFixtures(locale: Locale): ProactiveFixture[] {
  const mechanic = frequencyMechanic({ cardId: 18, count: 4 }, { cardId: 16, count: 2 }, locale);
  if (!mechanic) throw new Error('the recurring fixture no longer computes');

  /*
   * **BUILT THROUGH THE REAL CONSTRUCTOR, NEVER WRITTEN OUT BY HAND.** `weekday` and
   * `shape` are derivations, and a fixture that stated them would be able to disagree with
   * the code the blind read is supposed to be judging. `2026-08-09` is a Sunday — the
   * querent's own example, *"kamu weekend ini kemana aja?"*.
   */
  const sundayAfternoon = timeOfDayMaterial('2026-08-09', 'afternoon');
  if (!sundayAfternoon) throw new Error('the time-of-day fixture no longer computes');

  return [
    {
      kind: 'occasion',
      /* An occasion is the one material the daily job exists for. */
      trigger: 'cron',
      room: 'quiet',
      material: {
        kind: 'occasion',
        occasion: 'birthday',
        years: null,
        localDate: '2026-08-07',
      },
    },
    {
      kind: 'reading',
      trigger: 'reading_completed',
      room: 'quiet',
      material: {
        kind: 'reading',
        readingId: '11111111-1111-4111-8111-111111111111',
        readerId: 'thessaly',
        serviceId: 'spread3',
        cards: [
          { cardId: 18, name: 'The Moon', reversed: false },
          { cardId: 16, name: 'The Tower', reversed: true },
          { cardId: 17, name: 'The Star', reversed: false },
        ],
        gist:
          locale === 'id'
            ? 'dia menunda satu percakapan dan tahu dia menundanya'
            : 'they are holding off on one conversation and they know it',
        verdict: null,
        choice: null,
        hadQuestion: true,
        localDate: '2026-08-07',
      },
    },
    {
      kind: 'unanswered',
      trigger: 'unanswered',
      room: 'ask',
      /* The id is `p4` of the `ask` room, which is what makes `replyTo` renderable. */
      material: {
        kind: 'unanswered',
        messageId: 'p4',
        readerId: locale === 'id' ? 'thessaly' : 'margaret',
        askedAgoHours: 10,
      },
    },
    {
      kind: 'profile',
      /*
       * A tick, so its trigger is `idle_nudge` — `triggerFor`'s table: only `unanswered`
       * material renames a tick's trigger.
       */
      trigger: 'idle_nudge',
      room: 'quiet',
      /*
       * **THE FIXTURE CARRIES NO REMEMBERED SENTENCE BECAUSE THE TYPE HAS NOWHERE TO PUT
       * ONE.** The blind read will therefore show a director casting on a topic and a
       * reader saying nothing specific — which is the correct picture of **this material
       * alone**. The *"nasi padang lagi kan?"* half arrives through phase 5's fenced
       * `<ingatan>`, which the smoke script does not stage; this run is the half that says
       * which subject it is about.
       */
      material: {
        kind: 'profile',
        /* Twelve lowercase hex, `USER_MEMORY_ITEM_ID_RE`'s shape. */
        itemId: 'f00d5a1ad00d',
        itemKind: 'taste',
        month: '2026-08',
      },
    },
    {
      kind: 'recurring',
      trigger: 'idle_nudge',
      room: 'quiet',
      material: {
        kind: 'recurring',
        window: 'month',
        fingerprint: 'month:9:18-4,16-2',
        mechanic,
      },
    },
    {
      kind: 'orphan',
      trigger: 'idle_nudge',
      room: 'quiet',
      material: {
        kind: 'orphan',
        messageId: 'p4',
        readerId: locale === 'id' ? 'margaret' : 'adrian',
        ageHours: 9,
      },
    },
    {
      kind: 'lotus',
      trigger: 'idle_nudge',
      room: 'quiet',
      material: {
        kind: 'lotus',
        summary:
          locale === 'id'
            ? 'orang yang menahan banyak hal sendirian dan baru mulai bilang'
            : 'someone who carries a lot quietly and has just started saying so',
        updatedAtIso: '2026-08-07T04:00:00.000Z',
      },
    },
    {
      kind: 'time_of_day',
      /*
       * The daily job is the source that most often finds nothing else, which is exactly
       * when this material is what is left. Stated rather than derived, per this type's own
       * note, so the run prints the `PEMICU:` line production would show.
       */
      trigger: 'cron',
      room: 'quiet',
      material: sundayAfternoon,
    },
  ];
}
