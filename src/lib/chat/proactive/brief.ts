/**
 * THE SEAM WITH F2. **The one line the director reads about why it was woken up.**
 *
 * `assemble.ts`'s `PlanInput.material` is annotated *"F5's closed material token, plus
 * deck card names when the material is a reading… Null on a `user_message` run **and
 * until F5 lands**"*, and `prompt.ts` says in as many words: *"When F5 lands,
 * `PlanInput.material` is the input and this derivation goes."* This is that input.
 *
 * ── WHY IT REHYDRATES FROM `material_key` RATHER THAN CARRYING A BRIEF ────
 *
 * The mint and the plan are **two requests, minutes or hours apart** (`C-D1`: one beat
 * per request, and a run may sit `pending` across a shed ceiling or a closed tab). The
 * only thing that survives between them is the `chat_runs` row, and the only column on
 * it that says what the run is about is `material_key`. The alternatives were both
 * worse: a `material_brief` column is migration `0015`, *the one number §0.4 reserves and
 * asks us not to spend*, for prose that would go stale in the row anyway; and re-running
 * the selector at plan time would let a run **change what it is about** between being
 * minted and being planned, which is how a querent gets a birthday message about their
 * tarot habits.
 *
 * So the key is the identity and this file re-reads the thing it names. One indexed read
 * for the run, and one for the subject — on a path (`buildPlanPrompt`) that is already
 * six.
 *
 * ── IT NEVER THROWS, AND `null` IS AN ORDINARY ANSWER ─────────────────────
 *
 * `prompt.ts`'s own rule for a missing memo: *"a miss is a degradation here, where it is
 * a refusal for a voice."* A material line that could not be rebuilt costs the `BAHAN:`
 * header line and nothing else — the director still has the transcript, the affinity
 * hint and the trigger word, and `planFallback`'s own `hasMaterial` derivation is the
 * belt underneath. **Refusing instead would turn a cold Neon compute into a silent room.**
 */
import 'server-only';

import { and, eq } from 'drizzle-orm';

import type { Locale, ReaderId, ServiceId, YesNo } from '@/data/types';
import { getUserMemory } from '@/lib/db/queries/memory';
import { chatMessages, chatRuns, lotusAvatars, readings } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';
import { firstPassingWindow } from '@/lib/memory/frequency';
import { isUserMemoryItem } from '@/lib/memory/profile/types';
import { frequencyMechanic } from '@/lib/memory/shadow';
import { VERDICT_LADDER, type WindowKey } from '@/lib/memory/windows';
import type { DayPart } from '../types';
import { logChatFailure } from '../log';
import { cardsFor } from './detect';
import {
  describeMaterial,
  materialLine,
  timeOfDayMaterial,
  type Material,
  type OccasionKind,
} from './material';

/**
 * `chat_runs.material_key` -> the `BAHAN:` line, or null.
 *
 * The one caller is F2's `buildPlanPrompt`. A `user_message` run has no key and gets
 * `null` in one indexed read, which is the common path.
 */
export async function materialLineForRun(
  db: DbOrTx,
  args: { runId: string; userId: string; locale: Locale; now?: Date },
): Promise<string | null> {
  try {
    const [run] = await db
      .select({ key: chatRuns.materialKey })
      .from(chatRuns)
      .where(and(eq(chatRuns.id, args.runId), eq(chatRuns.userId, args.userId)))
      .limit(1);

    if (!run?.key) return null;

    const material = await rehydrate(db, args.userId, run.key, args.locale, args.now ?? new Date());
    if (!material) return null;

    return materialLine(describeMaterial(material, args.locale));
  } catch (err) {
    logChatFailure('proactive.brief', err, { run: args.runId, user: args.userId });
    return null;
  }
}

/**
 * The key's grammar, read back. **`materialKey()` is the writer and this is the only
 * reader**, so the two live one file apart and `material.test.ts` round-trips every kind.
 *
 * An unrecognised prefix answers `null` rather than throwing: a key written by a future
 * material this deploy does not know about is a run it cannot describe, not a run it
 * should fail.
 */
async function rehydrate(
  db: DbOrTx,
  userId: string,
  key: string,
  locale: Locale,
  now: Date,
): Promise<Material | null> {
  const cut = key.indexOf(':');
  if (cut < 0) return null;
  const prefix = key.slice(0, cut);
  const rest = key.slice(cut + 1);

  switch (prefix) {
    case 'reading':
      return readingMaterial(db, userId, rest);
    case 'ask':
      return messageMaterial(db, userId, rest, 'unanswered', now);
    case 'orphan':
      return messageMaterial(db, userId, rest, 'orphan', now);
    case 'freq':
      return recurringMaterial(db, userId, rest, locale, now);
    case 'occasion':
      return occasionMaterial(rest);
    case 'lotus':
      return lotusMaterial(db, userId, locale);
    case 'profile':
      return profileMaterial(db, userId, rest);
    case 'tod':
      return timeOfDayFromKey(rest);
    default:
      return null;
  }
}

/**
 * **NO `not exists` GUARDS HERE, UNLIKE `detect.ts`.** Those guards answer *"may this
 * reading still be chosen"*; this answers *"what is the reading this run was already
 * minted for"*, and the run's own existence is what would fail the first question. Same
 * table, opposite question — which is why the two queries are not shared.
 */
async function readingMaterial(
  db: DbOrTx,
  userId: string,
  readingId: string,
): Promise<Material | null> {
  const [row] = await db
    .select({
      id: readings.id,
      readerId: readings.readerId,
      serviceId: readings.serviceId,
      gist: readings.gist,
      verdict: readings.verdict,
      choice: readings.choice,
      /* The BOOLEAN and never the question — `RecalledReading`'s M11, and F5 §4.1. */
      hadQuestion: readings.question,
      localDate: readings.localDate,
    })
    .from(readings)
    .where(and(eq(readings.id, readingId), eq(readings.userId, userId)))
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
    hadQuestion: row.hadQuestion !== null,
    localDate: row.localDate,
  };
}

/** M2 and M3 differ only in which question they answer; the row they name is the same. */
async function messageMaterial(
  db: DbOrTx,
  userId: string,
  messageId: string,
  kind: 'unanswered' | 'orphan',
  now: Date,
): Promise<Material | null> {
  const [row] = await db
    .select({ author: chatMessages.author, createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.userId, userId)))
    .limit(1);

  if (!row || row.author === 'user') return null;
  const hours = Math.floor((now.getTime() - row.createdAt.getTime()) / 3_600_000);
  return kind === 'unanswered'
    ? { kind, messageId, readerId: row.author as ReaderId, askedAgoHours: hours }
    : { kind, messageId, readerId: row.author as ReaderId, ageHours: hours };
}

/**
 * `freq:<window>:<fingerprint>`.
 *
 * **THE FINGERPRINT IS CHECKED AND A MISMATCH IS `null`.** V3's fingerprint moves when
 * the card counts move, so a mismatch means the pattern the run was minted about no
 * longer holds — and describing today's pattern under yesterday's key would make
 * `material_key`'s self-expiry meaningless in exactly the direction that matters: the
 * readers would talk about a card that has stopped recurring.
 *
 * **AND NO COUNTS CROSS INTO THE MATERIAL** (V3's ruling): the mechanic carries the
 * Shadow Arcana, the pulse gloss and the dominance bucket, and never `m` or `n`.
 */
async function recurringMaterial(
  db: DbOrTx,
  userId: string,
  rest: string,
  locale: Locale,
  now: Date,
): Promise<Material | null> {
  const cut = rest.indexOf(':');
  if (cut < 0) return null;
  const window = rest.slice(0, cut) as WindowKey;
  const fingerprint = rest.slice(cut + 1);
  if (!(VERDICT_LADDER as readonly string[]).includes(window)) return null;

  const result = await firstPassingWindow(db, {
    userId,
    /* The day is only the window's right-hand bound; `local_date`'s trap does not bite
     * because nothing here RENDERS a date to a person. `prompt.ts` makes the same call
     * one file over, for the same reason and in the same words. */
    today: now.toISOString().slice(0, 10),
  });
  if (!result || result.window !== window || result.fingerprint !== fingerprint) return null;

  const [top, second] = result.ranked;
  if (!top || !second) return null;
  const mechanic = frequencyMechanic(
    { cardId: top.cardId, count: top.count },
    { cardId: second.cardId, count: second.count },
    locale,
  );
  if (!mechanic) return null;

  return { kind: 'recurring', window, fingerprint, mechanic };
}

/**
 * `occasion:<kind>:<yyyy or yyyy-mm-dd>`. **The only material that needs no query** — the
 * key carries the whole fact, which is what `materialKey`'s occasion arm was shaped for.
 *
 * `years` is not recoverable from the key and is left null: it is one word in a note
 * about the app's own anniversary, and inventing a second query to recover it would cost
 * a round trip on every plan of an anniversary run.
 */
function occasionMaterial(rest: string): Material | null {
  const cut = rest.indexOf(':');
  if (cut < 0) return null;
  const occasion = rest.slice(0, cut) as OccasionKind;
  const stamp = rest.slice(cut + 1);
  if (!['birthday', 'first_reading_anniversary', 'return'].includes(occasion)) return null;
  /* A year-only stamp is padded so `localDate` keeps its documented `YYYY-MM-DD` shape
   * for every consumer, including a note that slices it. */
  const localDate = stamp.length === 4 ? `${stamp}-01-01` : stamp;
  return { kind: 'occasion', occasion, years: null, localDate };
}

/**
 * The Lotus summary as it stands **now**, not as it stood at the mint.
 *
 * The key carries the timestamp for de-duplication and the row carries the prose, and
 * re-reading is the honest direction: if the querent edited an answer again between the
 * mint and the plan, the readers should be reacting to what they would see today. `A5`
 * is untouched — this is model output that already passed `lotusSafetyCheck`, and **F5
 * decrypts nothing** (`C-D8` condition 1).
 */
async function lotusMaterial(
  db: DbOrTx,
  userId: string,
  locale: Locale,
): Promise<Material | null> {
  const [row] = await db
    .select({ summary: lotusAvatars.summary, updatedAt: lotusAvatars.updatedAt })
    .from(lotusAvatars)
    .where(eq(lotusAvatars.userId, userId))
    .limit(1);

  const summary = row?.summary?.[locale]?.trim();
  if (!row || !summary) return null;
  return { kind: 'lotus', summary, updatedAtIso: row.updatedAt.toISOString() };
}

/**
 * `profile:<itemId>:<YYYY-MM>`.
 *
 * **THE ITEM IS RE-READ RATHER THAN TRUSTED TO THE KEY**, which is `lotusMaterial`'s
 * argument and buys one property this release needs: **a memory line the querent deleted on
 * `/account` between the mint and the plan is gone from the material at plan time**, not
 * merely blocked from being minted again. Phase 5's `<ingatan>` will have lost it too — both
 * filter through `isUserMemoryItem` over the same column — so a run that still named the
 * subject would be pointing a reader at a fact they can no longer see.
 *
 * **SPLIT FROM THE RIGHT.** The month contains no `:` and `USER_MEMORY_ITEM_ID_RE` makes an
 * id that does impossible, so `lastIndexOf` is the split that cannot be confused by a future
 * extractor with a different id scheme.
 *
 * **AND THE TEXT STILL DOES NOT CROSS.** It is read here only to establish that the item is
 * real, exactly as in `detectProfile`; `ProfileMaterial` has no field for it.
 */
async function profileMaterial(
  db: DbOrTx,
  userId: string,
  rest: string,
): Promise<Material | null> {
  const cut = rest.lastIndexOf(':');
  if (cut < 0) return null;
  const itemId = rest.slice(0, cut);
  const month = rest.slice(cut + 1);
  if (itemId === '' || !/^\d{4}-\d{2}$/.test(month)) return null;

  const memory = await getUserMemory(db, userId);
  const items: unknown[] = Array.isArray(memory?.items) ? [...memory.items] : [];

  for (const raw of items) {
    if (!isUserMemoryItem(raw) || raw.id !== itemId) continue;
    if (raw.text.trim() === '') return null;
    return { kind: 'profile', itemId, itemKind: raw.kind, month };
  }
  return null;
}

/**
 * `tod:<YYYY-MM-DD>:<part>`. **The second material that needs no query** —
 * `occasionMaterial`'s shape, and for the same reason: the key carries the whole fact.
 *
 * **AND IT REBUILDS THROUGH `timeOfDayMaterial`, NOT BY HAND.** The weekday and the shape
 * are derived rather than stored, so deriving them a second way here is two chances for the
 * plan to disagree with the mint about which day it is — which is the failure this file's
 * header names: *a run must not change what it is about between being minted and being
 * planned.*
 *
 * **THE CLOCK IS NOT CONSULTED.** A run minted on Sunday afternoon and planned on Monday
 * morning is still a run about Sunday afternoon; re-deriving from `now` would silently make
 * it a different run. `lotusMaterial` re-reads because the Lotus is a fact that moves; **a
 * moment does not move.**
 */
function timeOfDayFromKey(rest: string): Material | null {
  const cut = rest.lastIndexOf(':');
  if (cut < 0) return null;
  return timeOfDayMaterial(rest.slice(0, cut), rest.slice(cut + 1) as DayPart);
}
