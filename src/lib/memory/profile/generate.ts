import 'server-only';

/**
 * The impure half of the profile memory: the read, the model call, the write.
 *
 * ── THREE ABSOLUTES, STATED AS ABSOLUTES ─────────────────────────────────────
 *
 * 1. **`extractProfileMemory` NEVER THROWS.** Its only caller is an `after()` at the
 *    end of a chat run, and an `after()` that rejects is an unhandled rejection in a
 *    serverless invocation nobody is watching. Every failure returns an outcome.
 * 2. **IDEMPOTENT.** If the stored row already matches the current hash and source
 *    version it returns `unchanged` after one indexed read and one lookup. That is
 *    what makes calling it from the end of every completed run affordable.
 * 3. **NO COOLDOWN, AND THE ABSENCE IS DELIBERATE (A13).** The floor lives in
 *    `scheduleProfileExtraction`, which is the CALLER -- exactly where
 *    `personaStaleness`'s floor lives, and for W3's reason: `scheduleLotusRefresh`'s
 *    ten minutes swallowed a user-caused edit and froze `updated_at`, "which is the
 *    delete button being a lie". **A future "refresh my memory now" control must call
 *    `extractProfileMemory` DIRECTLY**, never the scheduler.
 *
 * ── IT READS `chat_messages` AND NOTHING ELSE, BY CONSTRUCTION ─────────────
 *
 * No `onboarding_answers`, no `lotus_avatars`, no `profiles`. That import list IS the
 * enforcement of `C-D8` condition 5 -- **a skipped onboarding answer stays skipped** --
 * and it is `A5`'s mechanism rather than a promise: the persona prompt cannot leak a
 * raw answer because it never receives one, and this cannot reintroduce a declined
 * fact because it cannot see one. `generate.integration.test.ts` asserts the import
 * list.
 *
 * ── THE FLAG WRITES NOTHING, AND THAT IS A THIRD SHAPE ────────────────────
 *
 * `flags.ts`'s header carries the table. Short form: the hash MOVES (so storing a
 * fallback would be safe) but nothing 500s on a missing row (so it is not necessary),
 * and there is no honest deterministic memory to write anyway -- there is no template
 * version of *"usually has nasi padang for dinner"*. Self-healing on
 * `lotusGenerationEnabled()`'s pattern: the next completed run after the flag returns
 * to `1` finds a hash that has moved and extracts normally.
 *
 * ── AND IT NEVER WRITES `dismissed_ids` ───────────────────────────────────
 *
 * `upsertUserMemory`'s `set` list does not name that column, so the extractor
 * *cannot* clobber a querent's deletion. That is the single-writer rule enforced by
 * SQL rather than by discipline, and it is why `profileMemoryStaleness` needs no
 * `user-edit` arm.
 */
import type { Locale } from '@/data/types';
import { track } from '@/lib/analytics/track';
import { reserveChatCall } from '@/lib/chat/budget';
import { resolveChatClock } from '@/lib/chat/clock';
import { chatModel, chatModelName } from '@/lib/chat/model';
import { db } from '@/lib/db/client';
import { messagesForExtraction, threadOffsetMinutes } from '@/lib/db/queries/chat';
import { getUserMemory, upsertUserMemory } from '@/lib/db/queries/memory';
import { getProvider } from '@/lib/llm';
import { profileMemoryEnabled } from '@/lib/llm/flags';
import { isUserMemoryItem, USER_MEMORY_SOURCE_VERSION, type UserMemoryItem } from './types';
import {
  buildProfileMemoryPrompt,
  PROFILE_MEMORY_MIN_MESSAGES,
  PROFILE_MEMORY_PROMPT_VERSION,
  PROFILE_MEMORY_WINDOW_DEFAULT,
  profileMemoryInputHash,
  profileMemoryStaleness,
  validateExtraction,
  type ExtractionRejectReason,
  type ProfileMemoryStaleness,
} from './prompt';

/** What actually happened, for the log and for `memory.profile_written`. */
export type ProfileMemoryOutcome = {
  ok: boolean;
  reason?:
    | ExtractionRejectReason
    /** Fewer than `PROFILE_MEMORY_MIN_MESSAGES` in the room. */
    | 'too_early'
    /** Hash and source version already match, or the floor has not passed. */
    | 'unchanged'
    /** `PROFILE_MEMORY_ENABLED=0`. Nothing was read and nothing was written. */
    | 'disabled'
    /** The chat sub-budget or the fleet ceiling said no. NOT an error (`[F1-6]`). */
    | 'shed'
    | 'call_failed'
    | 'error';
  /** How many facts are stored after this run. */
  items: number;
  /**
   * How many entries the MODEL returned, **before** the mechanical filters --
   * so `returned - items` is what `validateExtraction` threw away.
   *
   * **IT IS ZERO ON EVERY PATH THAT MADE NO CALL** (`disabled`, `too_early`,
   * `unchanged`, `shed`, `call_failed`, `error`), which is honest rather than
   * missing: nothing was returned because nothing was asked.
   */
  returned: number;
  ms: number;
  model: string;
};

/**
 * The read-path floor under regeneration, in seconds.
 *
 * **READ HERE AND PASSED IN**, so `prompt.ts` stays free of `process.env` --
 * `personaMinAgeSeconds`'s shape and `summary.ts`'s `isStale`'s. Defensive parse: a
 * non-numeric value must not become `NaN`, which would make every comparison false and
 * silently disable the floor.
 *
 * **600 IS A GUESS, NOT A MEASUREMENT** -- `PERSONA_MIN_AGE_SECONDS`' precedent, and
 * recorded so whoever finds it wrong knows it was never a finding. The hash moves on
 * every message, so without a floor an active afternoon would extract after every
 * single completed run. Ten minutes is roughly "a conversation"; Miftah's cost ruling
 * means the honest direction to move it is DOWN, not up.
 */
export function profileMemoryMinAgeSeconds(): number {
  const raw = Number(process.env.PROFILE_MEMORY_MIN_AGE_SECONDS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 600;
}

/** How many messages the extractor reads. Falls back rather than becoming zero. */
function windowSize(): number {
  const raw = Number(process.env.PROFILE_MEMORY_WINDOW);
  return Number.isFinite(raw) && raw >= PROFILE_MEMORY_MIN_MESSAGES
    ? Math.trunc(raw)
    : PROFILE_MEMORY_WINDOW_DEFAULT;
}

/**
 * The querent's calendar day, `advance()`'s mechanism exactly (phase 1).
 *
 * **SWALLOWED, LIKE EVERY OTHER READ ON A DEFERRED PATH.** A failed clock read means
 * `known: false`, whose `localDate` is the server's UTC day, and a `lastSeen` one day
 * out is a slightly wrong age marker rather than a wrong bubble. `[F1-23]`: never the
 * error object -- this statement binds `users.id`.
 */
async function querentDay(userId: string): Promise<string> {
  const offsetMinutes = await threadOffsetMinutes(db, userId).catch(() => null);
  return resolveChatClock({ offsetMinutes }).localDate;
}

/** Pre-read material, so the scheduler's reads are not paid twice. */
export type ExtractionMaterial = {
  messages: Array<{ id: string; author: string; body: string }>;
  inputHash: string;
  existing: { items: UserMemoryItem[]; dismissed: string[] };
  /**
   * **THE QUERENT'S CALENDAR DAY, `'YYYY-MM-DD'`, AND IT IS REQUIRED.**
   *
   * It stamps each accepted item's `lastSeen`. Phase 3's docblock is explicit that
   * the field is *the querent's* calendar day for `local_date`'s reason, so the
   * server's UTC date is not an acceptable stand-in: it is a day out for anyone in
   * Jakarta between midnight and 07:00, which is a large fraction of the hours this
   * room is quiet in.
   *
   * It is derived exactly the way `advance()` derives its clock (phase 1) --
   * `threadOffsetMinutes` then `resolveChatClock` -- so the browser path, the cron
   * path and a backfill script all answer it the same way, and an unknown offset
   * degrades to `known: false`'s `localDate` rather than to an error.
   */
  localDate: string;
};

/**
 * **THE CALLER-SIDE THROTTLE. `run.ts` CALLS THIS; NOTHING ELSE SHOULD.**
 *
 * It exists so the floor is not inside the generator (absolute 3). It reads the row
 * and the transcript once, asks `profileMemoryStaleness`, and either stops or hands
 * the material it already has to `extractProfileMemory` so the read is not paid twice.
 *
 * **NEVER THROWS**, for `extractProfileMemory`'s reason: it is called from an
 * `after()`.
 */
export async function scheduleProfileExtraction(
  userId: string,
  locale: Locale,
): Promise<ProfileMemoryOutcome> {
  const started = Date.now();
  const done = (o: Omit<ProfileMemoryOutcome, 'ms' | 'model'>): ProfileMemoryOutcome => ({
    ...o,
    ms: Date.now() - started,
    model: chatModelName(),
  });

  /*
   * **THE FLAG IS CHECKED FIRST, BEFORE ANY READ.** `lotusGenerationEnabled()`'s
   * shape: off means the feature costs nothing at all, not even a query. It writes
   * NOTHING -- see this file's header and `flags.ts`'s table.
   */
  if (!profileMemoryEnabled()) return done({ ok: true, reason: 'disabled', items: 0, returned: 0 });

  try {
    const messages = await messagesForExtraction(db, userId, windowSize());
    if (messages.length < PROFILE_MEMORY_MIN_MESSAGES) {
      return done({ ok: true, reason: 'too_early', items: 0, returned: 0 });
    }

    const newestId = messages[messages.length - 1].id;
    const inputHash = profileMemoryInputHash(newestId);

    const row = await getUserMemory(db, userId);
    const staleness: ProfileMemoryStaleness = profileMemoryStaleness(
      row,
      inputHash,
      profileMemoryMinAgeSeconds(),
    );

    if (staleness === 'fresh') {
      return done({
        ok: true,
        reason: 'unchanged',
        items: row ? row.items.filter(isUserMemoryItem).length : 0,
        returned: 0,
      });
    }

    return await extractProfileMemory(userId, locale, {
      messages,
      inputHash,
      existing: {
        items: row ? row.items.filter(isUserMemoryItem) : [],
        dismissed: row?.dismissedIds ?? [],
      },
      localDate: await querentDay(userId),
    });
  } catch (err) {
    logFailure(userId, err);
    return done({ ok: false, reason: 'error', items: 0, returned: 0 });
  }
}

/**
 * Write one querent's profile memory. **THE GENERATOR. NO COOLDOWN, EVER.**
 *
 * Call it directly from any path that must not be throttled -- a future "refresh now"
 * control, a backfill script. It is idempotent and it never throws.
 */
export async function extractProfileMemory(
  userId: string,
  locale: Locale,
  preread?: ExtractionMaterial,
): Promise<ProfileMemoryOutcome> {
  const started = Date.now();
  const model = chatModelName();
  const done = (o: Omit<ProfileMemoryOutcome, 'ms' | 'model'>): ProfileMemoryOutcome => ({
    ...o,
    ms: Date.now() - started,
    model,
  });

  if (!profileMemoryEnabled()) return done({ ok: true, reason: 'disabled', items: 0, returned: 0 });

  try {
    let material = preread;
    if (!material) {
      const messages = await messagesForExtraction(db, userId, windowSize());
      if (messages.length < PROFILE_MEMORY_MIN_MESSAGES) {
        return done({ ok: true, reason: 'too_early', items: 0, returned: 0 });
      }
      const row = await getUserMemory(db, userId);

      /*
       * **IDEMPOTENCE, and it is what makes a call from the end of every run
       * affordable.** Checked on the hash AND the source version, and NOT on a
       * locale -- there is no locale on this artifact (`types.ts`). It is inside the
       * no-preread branch because a caller that pre-read has already asked
       * `profileMemoryStaleness` the stronger question, floor included.
       */
      const inputHash = profileMemoryInputHash(messages[messages.length - 1].id);
      if (
        row &&
        row.sourceVersion === USER_MEMORY_SOURCE_VERSION &&
        row.inputHash === inputHash
      ) {
        return done({
          ok: true,
          reason: 'unchanged',
          items: row.items.filter(isUserMemoryItem).length,
          returned: 0,
        });
      }

      material = {
        messages,
        inputHash,
        existing: {
          items: row ? row.items.filter(isUserMemoryItem) : [],
          dismissed: row?.dismissedIds ?? [],
        },
        localDate: await querentDay(userId),
      };
    }

    /*
     * **RESERVED THROUGH THE CHAT'S OWN SUB-BUDGET** (`C-D6`, `[F1-6]`). This call is
     * caused by the room, so it draws on the room's share -- otherwise the chat's
     * ceiling would bound the director and the voices while a third call slipped past
     * it, which is the accounting `budget.ts` exists to prevent.
     *
     * **A SHED IS NOT AN ERROR.** Nothing is written, the hash stays where it was, and
     * the next completed run tries again. Same property as a shed beat.
     */
    const reservation = await reserveChatCall();
    if (!reservation.ok) {
      return done({ ok: true, reason: 'shed', items: material.existing.items.length, returned: 0 });
    }

    let raw: string;
    try {
      const { text } = await getProvider().complete(
        buildProfileMemoryPrompt({
          locale,
          existing: material.existing,
          messages: material.messages.map((m) => ({ author: m.author, body: m.body })),
        }),
        { op: 'profile_memory', callClass: 'deferred', model: chatModel() },
      );
      raw = text;
    } catch (err) {
      /*
       * **THE ERROR OBJECT IS NOT LOGGED** -- `voices/turn.ts`'s rule verbatim. The
       * request body on this path is a transcript of a person's own sentences, and an
       * LLM SDK error can quote the request.
       */
      logFailure(userId, err);
      return done({
        ok: false,
        reason: 'call_failed',
        items: material.existing.items.length,
        returned: 0,
      });
    }

    const verdict = validateExtraction(raw, {
      dismissed: material.existing.dismissed,
      hadItems: material.existing.items.length > 0,
      localDate: material.localDate,
    });

    if (!verdict.ok) {
      /*
       * **NOTHING IS WRITTEN, AND THAT INCLUDES `input_hash`.** Leaving the hash where
       * it was is what makes the failure self-healing: the next completed run finds the
       * same drift and tries again, so a bad reply costs one call rather than a stale
       * memory under a current-looking hash. That is the property `lotusInputHash`'s
       * comment warns is impossible for a static hash and available here.
       *
       * The REASON is logged, never the reply: a rejected extraction is prose about a
       * person, and the platform log is not where it belongs.
       */
      console.warn('[memory] profile extraction rejected', {
        user: userId,
        reason: verdict.reason,
      });
      return done({
        ok: false,
        reason: verdict.reason,
        items: material.existing.items.length,
        returned: verdict.returned,
      });
    }

    /*
     * **THE WRITE IS THE ITEM ARRAY AND NOTHING ELSE.** `dismissed_ids` is its own
     * column and `upsertUserMemory`'s `set` list cannot carry it -- the single-writer
     * rule enforced by SQL rather than by discipline (phase 3).
     */
    await upsertUserMemory(db, {
      userId,
      items: verdict.items,
      inputHash: material.inputHash,
      sourceVersion: USER_MEMORY_SOURCE_VERSION,
      model,
      promptVersion: PROFILE_MEMORY_PROMPT_VERSION,
    });

    return done({ ok: true, items: verdict.items.length, returned: verdict.returned });
  } catch (err) {
    logFailure(userId, err);
    return done({ ok: false, reason: 'error', items: 0, returned: 0 });
  }
}

/**
 * **NEVER LOG THE DRIVER ERROR IN PRODUCTION** (`C-D20`, `[F1-23]`). A postgres error
 * quotes the failing statement and its bound parameters, and on this path the
 * parameters are `chat_messages.body` -- text a person typed -- and the extracted
 * memory itself. Development prints the whole thing, because there is nobody to leak
 * it to.
 *
 * A local copy rather than `logChatFailure`, because this module is not `chat/**` and
 * an import purely for a prefix would give `memory/` an edge into `chat/` that
 * nothing else needs. The rule is the shared thing, not the function.
 */
function logFailure(userId: string, err: unknown): void {
  if (process.env.NODE_ENV !== 'production') {
    console.error('[memory] profile extraction failed', { user: userId }, err);
    return;
  }
  console.error('[memory] profile extraction failed', {
    user: userId,
    name: err instanceof Error ? err.name : typeof err,
    sqlstate:
      typeof (err as { code?: unknown })?.code === 'string' &&
      /^[0-9A-Z]{5}$/.test((err as { code: string }).code)
        ? (err as { code: string }).code
        : null,
  });
}

/**
 * Fire the analytics event. **Separated from the outcome so `run.ts` decides when**,
 * and so `extractProfileMemory` stays callable from a script with no analytics scope.
 *
 * `sanitizeProps()` drops non-scalars, so every field here is a scalar or a CLOSED
 * token. **No prose, no item text, no user id in the props** (`events.props` rule 1).
 */
export function trackProfileWritten(outcome: ProfileMemoryOutcome): void {
  track('memory.profile_written', {
    outcome: outcome.ok ? 'ok' : 'failed',
    reason: outcome.reason ?? null,
    items: outcome.items,
    returned: outcome.returned,
    dropped: Math.max(0, outcome.returned - outcome.items),
    model: outcome.model,
    total_ms: outcome.ms,
  });
}
