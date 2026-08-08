/**
 * THE SIX DETECTORS. *"Is there anything worth speaking up about?"*
 *
 * ── HANDLE FIRST, THOUGH THIS IS NOT `queries/**` ─────────────────────────
 *
 * `queries/contract.test.ts` walks `src/lib/db/queries/**` only, so this file is outside
 * its reach — and it takes the handle first anyway, for the reason that rule exists:
 * the integration suite runs inside an always-rolled-back transaction and the cron
 * passes the singleton. `flush.ts` is the precedent for a writer that lives outside the
 * directory; this is the same shape one workstream later.
 *
 * It is **not** in `queries/chat.ts` because that file is F1's and these six reads span
 * `readings`, `reading_cards`, `chat_messages`, `chat_runs`, `profiles`, `users` and
 * `lotus_avatars` — a query module per read concern would make this six files, and the
 * concern here is one question asked six ways.
 *
 * ── DETECTION IS LAZY AND STOPS AT THE FIRST HIT (§4.3) ───────────────────
 *
 * `firstPassingWindow`'s pattern and its stated reason: *"the overwhelming majority of
 * users pass on `week` and stop after one pair of index scans. Fanning all four out
 * would quadruple the database work for the common case."* Here the common case is M1 or
 * nothing, so the common cost is one indexed query.
 *
 * ── A USED KEY FALLS THROUGH RATHER THAN ENDING THE RUN ───────────────────
 *
 * Each candidate's `material_key` is checked against `chat_runs` before it is accepted.
 * **That is an optimisation and not the enforcement** — `chat_runs_user_material_uq`
 * arbitrates, because three entry points on three lambdas make a check-then-insert a
 * race with a millisecond window (§4.5). What the check buys is behavioural: without it,
 * a recurring card whose key was spent yesterday would refuse today's run outright
 * (`duplicate`) instead of letting M3 or M6 answer, and the querent would hear nothing
 * for as long as `firstPassingWindow` kept returning the same pair — **which is days,
 * by design.**
 *
 * ── IT NEVER THROWS FROM THE CALLER'S POINT OF VIEW ───────────────────────
 *
 * It does throw; `mint.ts` is the one caller and it catches everything through
 * `logChatFailure` (`[F5-17]`, `[F5-18]`). The split is deliberate: a detector that
 * swallowed its own errors would report *"no material"* for a broken database, and
 * `skipped/no_material` is the rate `C-N2e` asks F7 to chart — *"a high rate means the
 * eligibility rules are wrong, not that the querent is boring."* A silent database
 * failure showing up there would make that sentence unreadable.
 */
import 'server-only';

import { and, desc, eq, gt, gte, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';

import type { Locale, ReaderId, ServiceId, YesNo } from '@/data/types';
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
import type { DbOrTx } from '@/lib/db/types';
import { firstPassingWindow } from '@/lib/memory/frequency';
import { arcanaFor } from '@/lib/numerology';
import { frequencyMechanic } from '@/lib/memory/shadow';
import {
  MATERIAL_ORDER,
  materialKey,
  type Material,
  type MaterialKind,
  type OccasionKind,
} from './material';

/**
 * How long a querent may be away before coming back is itself the news. Fourteen days,
 * and it is a judgement rather than a measurement: shorter and it fires on an ordinary
 * quiet fortnight, longer and *"long time no see"* stops being true for the person
 * receiving it.
 */
const RETURN_AFTER_DAYS = 14;

/**
 * How far back M1 will look when there is no `last_proactive_at` to start from. Thirty
 * days is `CHAT_READING_LOOKBACK_DAYS_DEFAULT`, deliberately the same number, so that a
 * material naming a reading and a context block quoting it cannot disagree about which
 * readings still exist.
 */
const READING_LOOKBACK_DAYS = 30;

/**
 * **AN ASK OLDER THAN THIS IS NOT "STILL UNANSWERED", IT IS "OVER"** (§7.3, false
 * positive 4). Following up on something asked last Tuesday reads as a cron job that
 * found a row. Read at call time; falls back rather than becoming zero, per
 * `auth/ttl.ts` — a zero here would make every ask instantly dead and delete M2.
 */
export function unansweredMaxAgeHours(): number {
  const raw = Number(process.env.UNANSWERED_MAX_AGE_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 48;
}

export type DetectArgs = {
  userId: string;
  locale: Locale;
  /** The querent's calendar day. A STRING (`[F5-3]`). */
  localDate: string;
  /** `chat_threads.last_proactive_at`, or null. */
  lastProactiveAt: Date | null;
  /** `chat_threads.last_user_message_at`, or null. */
  lastUserMessageAt: Date | null;
  /** Injected, `[F5-2]`'s rule extended to the queries so ages are testable. */
  now: Date;
  /** `profiles.birth_date`, a STRING. */
  birthDate: string | null;
  /** `users.last_seen_at`. */
  lastSeenAt: Date | null;
  /** Source 1 only. `selectReadingMaterial` sets it; the ladder never does. */
  restrictReadingId?: string;
};

/**
 * Walk `MATERIAL_ORDER`, stop at the first unused hit, answer `null` if there is none.
 *
 * `null` is `C-N2e`'s **no material, no run**, and `mint.ts` records it as
 * `chat.proactive_skipped` with `reason: 'no_material'`.
 */
export async function selectMaterial(db: DbOrTx, args: DetectArgs): Promise<Material | null> {
  for (const kind of MATERIAL_ORDER) {
    const found = await DETECTORS[kind](db, args);
    if (!found) continue;
    if (await materialKeyUsed(db, args.userId, materialKey(found))) continue;
    return found;
  }
  return null;
}

/**
 * SOURCE 1's SELECTOR. **One reading, named by the caller, and no ladder.**
 *
 * §3: *"Material: always M1 (the reading that just finished). The selector is not
 * consulted — the material is the trigger."* The named reading still has to pass every
 * one of M1's guards, and if it fails one the answer is `null` rather than *"some other
 * reading will do"*: §9.6's counter assertion is what that protects. A reading the
 * querent attached themselves must not cause a run about a **different** reading, and
 * must not spend the day's budget on its way to finding one.
 */
export async function selectReadingMaterial(
  db: DbOrTx,
  args: DetectArgs,
  readingId: string,
): Promise<Material | null> {
  const found = await detectReading(db, { ...args, restrictReadingId: readingId });
  if (!found) return null;
  return (await materialKeyUsed(db, args.userId, materialKey(found))) ? null : found;
}

/** One index probe on `chat_runs_user_material_uq`. */
async function materialKeyUsed(db: DbOrTx, userId: string, key: string): Promise<boolean> {
  const [row] = await db
    .select({ id: chatRuns.id })
    .from(chatRuns)
    .where(and(eq(chatRuns.userId, userId), eq(chatRuns.materialKey, key)))
    .limit(1);
  return !!row;
}

type Detector = (db: DbOrTx, args: DetectArgs) => Promise<Material | null>;

const DETECTORS: Record<MaterialKind, Detector> = {
  occasion: detectOccasion,
  reading: detectReading,
  unanswered: detectUnanswered,
  recurring: detectRecurring,
  orphan: detectOrphan,
  lotus: detectLotus,
};

// ---------------------------------------------------------------------------
// M5 — a date that matters
// ---------------------------------------------------------------------------

/**
 * Three occasions, checked in the order §4.1 states.
 *
 * **THE BIRTHDAY IS COMPARED STRING-TO-STRING ON THE `MM-DD` SLICE**, and never through
 * a `Date`. `profiles.birth_date` is a `dateCol` (a string) and `localDate` is the
 * querent's own day; `getMonth()` on a server in UTC wishes somebody in Jakarta a happy
 * birthday a day early, which is `local_date`'s trap arriving on the one day of the year
 * it is least forgivable.
 *
 * **NO AGE IS COMPUTED.** A reader who knows how old you are is a reader who read your
 * file. `years` is filled only for the anniversary, where it is a fact about the app.
 */
async function detectOccasion(db: DbOrTx, args: DetectArgs): Promise<Material | null> {
  const make = (occasion: OccasionKind, years: number | null): Material => ({
    kind: 'occasion',
    occasion,
    years,
    localDate: args.localDate,
  });

  if (args.birthDate && args.birthDate.slice(5, 10) === args.localDate.slice(5, 10)) {
    return make('birthday', null);
  }

  const [first] = await db
    .select({ day: sql<string>`min(${readings.localDate})::text` })
    .from(readings)
    .where(eq(readings.userId, args.userId));
  const firstDay = first?.day ?? null;
  if (firstDay && firstDay.slice(5, 10) === args.localDate.slice(5, 10)) {
    const years = Number(args.localDate.slice(0, 4)) - Number(firstDay.slice(0, 4));
    if (years >= 1) return make('first_reading_anniversary', years);
  }

  /*
   * **THE ONLY MATERIAL THAT FIRES FOR SOMEBODY WITH NO READINGS, NO MESSAGES AND NO
   * RECENT ACTIVITY** — i.e. the exact person a proactive feature is for. Declared as a
   * roadmap deviation in §14 D6 rather than assumed.
   *
   * It cannot fire from the reading route: `touchLastSeen` runs four statements before
   * the mint, so `last_seen_at` is already now. That is correct — somebody who has just
   * taken a reading has not *come back*, they are here.
   */
  if (args.lastSeenAt) {
    const awayDays = (args.now.getTime() - args.lastSeenAt.getTime()) / 86_400_000;
    if (awayDays >= RETURN_AFTER_DAYS) return make('return', null);
  }

  return null;
}

// ---------------------------------------------------------------------------
// M1 — a reading since the last proactive run
// ---------------------------------------------------------------------------

/**
 * The most recent finished reading the readers have not already been given.
 *
 * Four conditions beyond the obvious, each of which is a bug if dropped:
 *
 *   - **`status <> 'blocked'`.** W7 refused the question and no reader ever spoke, so a
 *     run about it would be the app volunteering that it refused you.
 *   - **`body is not null`.** A stream that died left no reading to react to.
 *   - **not already a `chat_runs.trigger_reading_id`.** Belt to `material_key`'s brace.
 *   - **not already a `chat_messages.attached_reading_id`** (`[F5-14]`, seam S5). The
 *     querent bringing the reading into the room *is* the conversational move; a reader
 *     saying *"eh, aku lihat bacaanmu barusan"* three seconds later is two people
 *     talking over each other about the same object.
 *
 * `order by created_at desc, id desc` — the `id` tiebreak is `recallableReadings`'
 * stated reason: `now()` is transaction-start time, so two rows written in one
 * transaction share a timestamp and `created_at desc` alone is not a total order.
 */
async function detectReading(db: DbOrTx, args: DetectArgs): Promise<Material | null> {
  const floor =
    args.lastProactiveAt ??
    new Date(args.now.getTime() - READING_LOOKBACK_DAYS * 86_400_000);

  const [row] = await db
    .select({
      id: readings.id,
      readerId: readings.readerId,
      serviceId: readings.serviceId,
      gist: readings.gist,
      verdict: readings.verdict,
      choice: readings.choice,
      /* **THE BOOLEAN AND NEVER THE QUESTION** — `RecalledReading`'s M11. */
      hadQuestion: sql<boolean>`${readings.question} is not null`,
      localDate: readings.localDate,
    })
    .from(readings)
    .where(
      and(
        eq(readings.userId, args.userId),
        /* Source 1 names its reading and skips the lookback: the row was written
         * seconds ago, and `last_proactive_at` may be newer than it if a tick raced. */
        args.restrictReadingId
          ? eq(readings.id, args.restrictReadingId)
          : gt(readings.createdAt, floor),
        ne(readings.status, 'blocked'),
        isNotNull(readings.body),
        sql`not exists (select 1 from ${chatRuns}
                         where ${chatRuns.userId} = ${args.userId}
                           and ${chatRuns.triggerReadingId} = ${readings.id})`,
        sql`not exists (select 1 from ${chatMessages}
                         where ${chatMessages.userId} = ${args.userId}
                           and ${chatMessages.attachedReadingId} = ${readings.id})`,
      ),
    )
    .orderBy(desc(readings.createdAt), desc(readings.id))
    .limit(1);

  if (!row) return null;
  return {
    kind: 'reading',
    readingId: row.id,
    readerId: row.readerId as ReaderId,
    serviceId: row.serviceId as ServiceId,
    cards: await cardsFor(db, row.id),
    gist: row.gist,
    verdict: row.verdict as YesNo | null,
    choice: row.choice,
    hadQuestion: Boolean(row.hadQuestion),
    localDate: row.localDate,
  };
}

/**
 * The hand, in dealt order. **The NAME is looked up from the deck server-side**, never
 * carried from anywhere else: `CLAUDE.md`'s standing rule for the reading route's own
 * header — *the client sends card ids and orientation; every word of card text is looked
 * up here.*
 */
export async function cardsFor(db: DbOrTx, readingId: string) {
  const rows = await db
    .select({ cardId: readingCards.cardId, reversed: readingCards.reversed })
    .from(readingCards)
    .where(eq(readingCards.readingId, readingId))
    .orderBy(readingCards.position);
  return rows
    .filter((r) => Number.isInteger(r.cardId) && r.cardId >= 0 && r.cardId < 22)
    .map((r) => ({ cardId: r.cardId, name: arcanaFor(r.cardId).name, reversed: r.reversed }));
}

// ---------------------------------------------------------------------------
// M2 — a reader question the querent never answered (§7)
// ---------------------------------------------------------------------------

/**
 * **THE SIGNAL IS DECLARED, NEVER DETECTED FROM THE TEXT** (§7.1).
 *
 * Do not look for a question mark. Adrian's register is full of *"kan?"* and *"iya
 * nggak?"* and Margaret's of the reflective kind addressed to nobody; a text heuristic
 * here is `CLAUDE.md`'s bare-`lagi` trap in a new costume — a pattern that fires on most
 * sentences of casual Indonesian and reports a rate that is entirely noise, and **that
 * rate is what decides whether the feature is cut or tightened.**
 *
 * The beat sheet already declared it, and `chat_messages.intent` is that declaration
 * denormalised onto the message it produced (reconciliation §2.1). F5 reads the column
 * and **never `chat_runs.beats`** (seam S-new-4): the JSON shape is F2's, and reading
 * into it would make F5 a consumer of a contract it cannot see changing — a rename would
 * break this material silently, with a green typecheck, because JSON is `unknown`.
 *
 * Four false positives and what refuses each (§7.3):
 *   1. three asks in one run → **only the single most recent ask is ever material**;
 *   2. nagging twice about one → `material_key = ask:<id>` and the unique index;
 *   3. chasing four minutes later → the gap gate, which does **not** exempt this source;
 *   4. resurrecting a dead question → `UNANSWERED_MAX_AGE_HOURS`.
 *
 * And the two nothing can refuse are named in §7.4 rather than faked: the querent who
 * answered elsewhere, and the querent who replied *"nanti aku cerita"*. The second is
 * read as answered, which is the **safe** direction — a missed follow-up costs a bubble;
 * a spurious one costs the querent's patience.
 */
async function detectUnanswered(db: DbOrTx, args: DetectArgs): Promise<Material | null> {
  const maxAgeMs = unansweredMaxAgeHours() * 3_600_000;

  const [ask] = await db
    .select({
      id: chatMessages.id,
      author: chatMessages.author,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.userId, args.userId),
        eq(chatMessages.intent, 'ask'),
        ne(chatMessages.author, 'user'),
        gte(chatMessages.createdAt, new Date(args.now.getTime() - maxAgeMs)),
      ),
    )
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(1);

  if (!ask) return null;

  /*
   * ANY user message after the ask counts as an answer. The denormalised cursor is used
   * rather than a second scan when it is available — `completeBeat` and the message
   * route both move it inside the transaction that writes the row, so it cannot lag its
   * own message.
   */
  if (args.lastUserMessageAt && args.lastUserMessageAt > ask.createdAt) return null;

  return {
    kind: 'unanswered',
    messageId: ask.id,
    readerId: ask.author as ReaderId,
    askedAgoHours: Math.floor((args.now.getTime() - ask.createdAt.getTime()) / 3_600_000),
  };
}

// ---------------------------------------------------------------------------
// M4 — a recurring card
// ---------------------------------------------------------------------------

/**
 * V3's ladder, walked by V3's own function, and **nothing is rebuilt here**.
 *
 * `firstPassingWindow` walks `VERDICT_LADDER` narrowest-first and stops at the first
 * window that passes `passesGate()`; `frequencyMechanic` composes the Shadow Arcana, the
 * pulse and the dominance word from the ranked top two.
 *
 * **`tally.ts` IS NEVER RUN AT REQUEST TIME** (V3-11, `[F5-2]`'s reason): a false
 * positive in the route would delete the feature for that querent with nothing on
 * screen. The smoke script is where it runs (§11.2), over the prose that came out.
 */
async function detectRecurring(db: DbOrTx, args: DetectArgs): Promise<Material | null> {
  const result = await firstPassingWindow(db, {
    userId: args.userId,
    today: args.localDate,
    birthDate: args.birthDate,
  });
  if (!result) return null;

  const [top, second] = result.ranked;
  if (!top || !second) return null;

  const mechanic = frequencyMechanic(
    { cardId: top.cardId, count: top.count },
    { cardId: second.cardId, count: second.count },
    args.locale,
  );
  if (!mechanic) return null;

  return {
    kind: 'recurring',
    window: result.window,
    fingerprint: result.fingerprint,
    mechanic,
  };
}

// ---------------------------------------------------------------------------
// M3 — a bubble nobody replied to
// ---------------------------------------------------------------------------

/**
 * The last thing said in the room was said by a reader, it was not a question (that is
 * M2), and the querent has not spoken since.
 *
 * **`intent <> 'ask'` MUST BE NULL-SAFE.** A reader turn whose beat carried no intent
 * stores NULL, and `intent <> 'ask'` is NULL rather than true for those rows — so the
 * common case would silently never match. `is distinct from` is the operator that means
 * what this sentence means.
 */
async function detectOrphan(db: DbOrTx, args: DetectArgs): Promise<Material | null> {
  const [last] = await db
    .select({
      id: chatMessages.id,
      author: chatMessages.author,
      intent: chatMessages.intent,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.userId, args.userId))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(1);

  if (!last || last.author === 'user') return null;
  if (last.intent === 'ask') return null;

  /*
   * The run must be finished. A bubble from a run still mid-flight is not orphaned —
   * the next beat is about to answer it, and `open_run` would have refused anyway.
   */
  const [live] = await db
    .select({ id: chatRuns.id })
    .from(chatRuns)
    .where(
      and(
        eq(chatRuns.userId, args.userId),
        sql`${chatRuns.status} in ('pending', 'planning', 'running')`,
      ),
    )
    .limit(1);
  if (live) return null;

  return {
    kind: 'orphan',
    messageId: last.id,
    readerId: last.author as ReaderId,
    ageHours: Math.floor((args.now.getTime() - last.createdAt.getTime()) / 3_600_000),
  };
}

// ---------------------------------------------------------------------------
// M6 — a Lotus fact newly relevant
// ---------------------------------------------------------------------------

/**
 * The querent edited an onboarding answer since the readers last spoke, and the
 * distillation has been rebuilt.
 *
 * **IT MUST NOT FIRE WHEN THE EDIT WAS A DELETION.** `C-D8` condition 5: *"a reader who
 * asks about the thing you refused to answer is the worst possible version of this
 * feature"*, and a reader remarking on something you just cleared is that failure
 * arriving through the back door.
 *
 * §4.1 proposed comparing `answerPresence` against what the Lotus's traits imply. **This
 * is stronger and cheaper**: it asks whether the most recently touched answer is still
 * present. That is exact for the case that matters — the edit that rebuilt the Lotus was
 * an addition or a change rather than a clear — and it decrypts nothing, which is the
 * property that keeps `C-D8` condition 1 true (*the decryption happens in exactly one
 * new place*, and this is not it).
 */
async function detectLotus(db: DbOrTx, args: DetectArgs): Promise<Material | null> {
  const floor = args.lastProactiveAt ?? new Date(0);

  const [lotus] = await db
    .select({ summary: lotusAvatars.summary, updatedAt: lotusAvatars.updatedAt })
    .from(lotusAvatars)
    .where(and(eq(lotusAvatars.userId, args.userId), gt(lotusAvatars.updatedAt, floor)))
    .limit(1);

  const summary = lotus?.summary?.[args.locale]?.trim();
  if (!lotus || !summary) return null;

  /*
   * The most recently touched answer, and whether it survived the touch.
   * `answer_text IS NULL` is a skip — never an encrypted empty string — so this is the
   * same test the audit query in `schema.ts` makes, asked of one row.
   */
  const [latest] = await db
    .select({ cleared: sql<boolean>`${onboardingAnswers.answerText} is null` })
    .from(onboardingAnswers)
    .where(eq(onboardingAnswers.userId, args.userId))
    .orderBy(desc(onboardingAnswers.updatedAt))
    .limit(1);
  if (!latest || latest.cleared) return null;

  return { kind: 'lotus', summary, updatedAtIso: lotus.updatedAt.toISOString() };
}

// ---------------------------------------------------------------------------
// The reads the predicate needs, which are not material
// ---------------------------------------------------------------------------

/**
 * Everything `checkEligibility` wants about the querent that does not live on the
 * thread. One row, by primary key.
 *
 * `deleted_at` is read here rather than trusted to the session, because `[F5-15]` has to
 * hold on the cron path too — and there is no session there at all.
 */
export async function readQuerent(
  db: DbOrTx,
  userId: string,
): Promise<{ locale: Locale; erased: boolean; lastSeenAt: Date | null; birthDate: string | null } | null> {
  const [row] = await db
    .select({
      locale: users.locale,
      deletedAt: users.deletedAt,
      lastSeenAt: users.lastSeenAt,
      birthDate: profiles.birthDate,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;
  return {
    locale: row.locale,
    erased: row.deletedAt !== null,
    lastSeenAt: row.lastSeenAt,
    birthDate: row.birthDate ?? null,
  };
}

/**
 * THE CRON'S CANDIDATE QUERY (§3, source 3).
 *
 * Querents who have opened the room at least once, are not erased, have no run in
 * flight, and have not been messaged unprompted today. **The eligibility predicate runs
 * per candidate afterwards and is the authority** — this is the cheap filter that keeps
 * the fan-out bounded, not a second copy of the rules.
 *
 * `order by last_read_at desc` and not by id: `[F5-Q5]` names the failure mode of a
 * bounded fan-out as *"the nudge stopped working for people whose ids sort late"*, and
 * ordering by recency at least makes the population it serves the one still using the
 * app rather than an arbitrary prefix of a uuid.
 */
export async function nudgeCandidates(
  db: DbOrTx,
  args: { localDate: string; limit: number },
): Promise<Array<{ userId: string; locale: Locale }>> {
  const { chatThreads } = await import('@/lib/db/schema');
  return db
    .select({ userId: chatThreads.userId, locale: users.locale })
    .from(chatThreads)
    .innerJoin(users, eq(users.id, chatThreads.userId))
    .where(
      and(
        isNull(users.deletedAt),
        isNotNull(chatThreads.lastReadAt),
        sql`not exists (select 1 from ${chatRuns}
                         where ${chatRuns.userId} = ${chatThreads.userId}
                           and ${chatRuns.status} in ('pending', 'planning', 'running'))`,
        sql`(${chatThreads.proactiveCountDate} is distinct from ${args.localDate}::date
             or ${chatThreads.proactiveCountToday} = 0)`,
      ),
    )
    .orderBy(desc(chatThreads.lastReadAt))
    .limit(args.limit);
}

/**
 * `[F5-5]`. **ABANDON RUNS OLDER THAN THE TTL, AND DO IT BEFORE MINTING ANYTHING.**
 *
 * Under quota pressure the app accumulates pending runs rather than losing them (`C-D6`
 * consequence 3), and that is the single best argument for the run engine — but an
 * unbounded backlog delivers seven-day-old greetings the moment the ceiling clears,
 * which is worse than never having spoken.
 *
 * First, because a room with a stale open run is ineligible for a fresh one, and reaping
 * after minting would leave those querents skipped for another day. `sweep`'s header
 * makes the same argument for running erasure first.
 *
 * **THE LEASE PREDICATE IS `C-R3`'s, REUSED RATHER THAN REINVENTED:** a run somebody is
 * holding right now is not ours to abandon.
 */
export async function abandonExpiredRuns(
  db: DbOrTx,
  args: { olderThan: Date; now: Date },
): Promise<number> {
  const rows = await db
    .update(chatRuns)
    .set({ status: 'abandoned', errorKind: 'expired', updatedAt: args.now })
    .where(
      and(
        sql`${chatRuns.status} in ('pending', 'planning', 'running')`,
        lt(chatRuns.createdAt, args.olderThan),
        sql`(${chatRuns.leaseUntil} is null or ${chatRuns.leaseUntil} < ${args.now.toISOString()}::timestamptz)`,
      ),
    )
    .returning({ id: chatRuns.id });
  return rows.length;
}
