import 'server-only';

/**
 * The impure half of the Lotus feature: the cached read, the model call, the
 * write, and the cooldown.
 *
 * EVERYTHING STATEFUL ABOUT THE LOTUS IS IN THIS ONE FILE, and that is where the
 * query-module contract put it rather than a preference. `queries/lotus.ts` holds
 * three pure queries that each take the handle first; rule 3 of that directory
 * says "caching is the caller's decision, made where the caller knows the request
 * context", and rule 1 makes a cache invalidator keyed by user id impossible to
 * express there. `contract.test.ts` failed on exactly that when the cache lived
 * beside the queries.
 *
 * CALL FROM `after()` ONLY, AND NEVER AWAIT IT FROM A HANDLER. The whole point of
 * D10/L7 is that the user never waits for a model call -- not at the end of a
 * nine-step questionnaire, which is exactly where abandonment costs the most
 * because the data is already collected, and not on the reading path either.
 *
 * `generateLotus` NEVER THROWS. An `after()` callback that rejects is an
 * unhandled rejection in a serverless invocation nobody is watching, and there is
 * nothing useful for the caller to do about it anyway: every failure path already
 * writes the deterministic fallback, so the user ends up with a block regardless.
 *
 * The pure half -- the contract, the parser, the safety checks, the fallback --
 * is `lotus.ts`, and it is where every rule worth testing lives.
 */
import { isFreeText } from '@/data/onboarding';
import type { Locale } from '@/data/types';
import { db } from '@/lib/db/client';
import { getAnswers } from '@/lib/db/queries/onboarding';
import {
  getLotusAvatar,
  readLotusBlock,
  upsertLotusAvatar,
  type LotusBlock,
} from '@/lib/db/queries/lotus';
import { getProfile } from '@/lib/db/queries/profile';
import { getProvider } from '@/lib/llm';
import type { CallClass } from '@/lib/llm/meter';
import {
  LOTUS_SOURCE_VERSION,
  buildLotusPrompt,
  fallbackLotus,
  lotusInputHash,
  lotusSafetyCheck,
  parseLotusResponse,
  type LotusInput,
  type LotusRejectReason,
  type LotusResult,
} from './lotus';

/** What actually happened, for the log and for W4's `lotus_generated` event. */
export type LotusOutcome = {
  ok: boolean;
  /** True when the stored block is the template rather than the model's. */
  fallback: boolean;
  reason?: LotusRejectReason | 'no_profile' | 'not_completed' | 'unchanged' | 'error';
  ms: number;
  model: string;
};

/**
 * The distillation is a different job from writing prose -- it runs once per
 * user rather than nine times a day, and it may want a cheaper or a stricter
 * model. Defaulting to `LLM_MODEL` means nobody has to set it.
 */
function lotusModel(): string {
  return process.env.LOTUS_MODEL || process.env.LLM_MODEL || 'unknown';
}

/** Dev and test: write the template, make no network call. NEVER in production. */
function stubbed(): boolean {
  return process.env.LOTUS_STUB === '1' && process.env.NODE_ENV !== 'production';
}

/**
 * Distil one user's answers into their Lotus block, and store it.
 *
 * Idempotent and cheap to call repeatedly: if the stored row already matches the
 * current answers and contract version, it returns without calling the model.
 * That is what makes the lazy repair (L15) affordable -- scheduling a refresh
 * that turns out to be unnecessary costs one indexed read.
 */
export async function generateLotus(
  userId: string,
  /**
   * **`interactive` BY DEFAULT, AND THE DEFAULT IS THE POINT.** Three of the four
   * call sites are onboarding writes -- a user just pressed a button and the
   * distillation is what their next reading is built from -- so a quota running
   * low must not silently stop distilling for people who are actively signing up.
   * Only `scheduleLotusRefresh`'s SPECULATIVE repair passes `'deferred'`, because
   * that one is a guess made behind somebody else's reading and its absence costs
   * nothing that is not already absent.
   */
  callClass: CallClass = 'interactive',
): Promise<LotusOutcome> {
  const started = Date.now();
  const model = lotusModel();
  const done = (o: Omit<LotusOutcome, 'ms' | 'model'>): LotusOutcome => ({
    ...o,
    ms: Date.now() - started,
    model,
  });

  try {
    const profile = await getProfile(db, userId);
    if (!profile) return done({ ok: false, fallback: false, reason: 'no_profile' });

    /*
     * A HALF-WRITTEN ANSWER SET MUST NEVER BE DISTILLED (L3). Row presence is not
     * completion, and a user who abandoned at step 4 has two answers stored --
     * distilling those would build a block from a third of a questionnaire and
     * then look current forever.
     */
    if (!profile.completedAt) return done({ ok: false, fallback: false, reason: 'not_completed' });

    const answers = await getAnswers(db, userId);
    const input: LotusInput = {
      // The YEAR only. `birth_date` is a 'YYYY-MM-DD' string on purpose -- see
      // schema.ts's dateCol -- so this is a slice, never a Date.
      birthYear: Number(profile.birthDate.slice(0, 4)),
      answers,
    };

    const inputHash = lotusInputHash(input);

    /*
     * THE `input_hash` CHECK LIVES HERE, and this is where the plan's two
     * staleness triggers are actually compared.
     *
     * `getLotusBlock` deliberately checks only `source_version`, because
     * comparing the hash requires the ANSWERS -- reading and decrypting six rows
     * -- which is precisely the request-path work roadmap §6 forbids. Here the
     * answers are already in hand, so it costs nothing, and the read path is left
     * clean.
     */
    const existing = await getLotusAvatar(db, userId);
    if (existing && existing.sourceVersion === LOTUS_SOURCE_VERSION && existing.inputHash === inputHash) {
      return done({ ok: true, fallback: false, reason: 'unchanged' });
    }

    const rawAnswers = answers
      .filter((a) => isFreeText(a.key) && !a.skipped && a.text)
      .map((a) => a.text as string);

    /*
     * L9: NO MODEL CALL AT ALL when there is nothing to distil.
     *
     * "Skip everything" is a first-class path rather than a degraded one -- it
     * saves a call, removes a failure mode, and the template it produces is what
     * `fallbackLotus` was written to read like on its own.
     */
    if (rawAnswers.length === 0 || stubbed()) {
      return await store(userId, fallbackLotus(input), inputHash, model, done, true, undefined);
    }

    const prompt = buildLotusPrompt(input);
    const { text } = await getProvider().complete(prompt, { op: 'lotus', model, callClass });

    let parsed: LotusResult;
    try {
      parsed = parseLotusResponse(text, input);
    } catch {
      // Unparseable output is not worth a retry: the contract asks for bare JSON
      // and a model that ignored it once will ignore it again in the same second.
      return await store(userId, fallbackLotus(input), inputHash, model, done, true, 'unparseable');
    }

    const verdict = lotusSafetyCheck({ id: parsed.summaryId, en: parsed.summaryEn }, rawAnswers);
    if (!verdict.ok) {
      /*
       * ANY failure discards the model output ENTIRELY (L10) -- no partial
       * acceptance, no "keep the English half". The checks exist because nobody
       * re-reads this string after it is written, and a block that failed one of
       * them is a block whose other rules are suspect too.
       */
      console.warn('lotus rejected by safety check', { userId, reason: verdict.reason });
      return await store(userId, fallbackLotus(input), inputHash, model, done, true, verdict.reason);
    }

    return await store(userId, parsed, inputHash, model, done, false, undefined);
  } catch (err) {
    /*
     * NEVER THROWS. The caller is an `after()` with nothing useful to do with an
     * error, and the next reading's repair will try again -- bounded by the
     * cooldown below, so a persistently failing user costs one attempt per ten
     * minutes rather than one per reading.
     */
    console.error('lotus distillation failed', { userId, err });
    return done({ ok: false, fallback: false, reason: 'error' });
  }
}

/** The one write, shared by the four paths that reach it. */
async function store(
  userId: string,
  result: LotusResult,
  inputHash: string,
  model: string,
  done: (o: Omit<LotusOutcome, 'ms' | 'model'>) => LotusOutcome,
  fallback: boolean,
  reason: LotusRejectReason | undefined,
): Promise<LotusOutcome> {
  await upsertLotusAvatar(db, {
    userId,
    summary: { id: result.summaryId, en: result.summaryEn },
    traits: result.traits,
    sourceVersion: LOTUS_SOURCE_VERSION,
    inputHash,
    /*
     * The MODEL column records what produced the stored text. A fallback was
     * produced by no model at all, and saying `glm-4.6` there would make an
     * operator investigating "why does this block read like a template" look at
     * the wrong thing.
     */
    model: fallback ? 'fallback' : model,
  });

  /*
   * Drop this instance's cached copy of what we just overwrote. Only THIS
   * instance -- serverless workers do not share memory -- which is why the TTL
   * below is short enough to cover the ones that never hear about it.
   */
  invalidateLotusBlock(userId);

  return done({ ok: true, fallback, reason });
}

// ---------------------------------------------------------------------------
// The lazy repair (L15)
// ---------------------------------------------------------------------------

/**
 * One SPECULATIVE repair attempt per user per ten minutes.
 *
 * WHAT THE COOLDOWN IS FOR, AND WHAT IT IS NOT FOR. It bounds the LAZY REPAIR
 * (L15): the read path notices a missing or out-of-date block and schedules a
 * regeneration, and for a user whose generation keeps failing that would
 * otherwise fire on every single reading. Nothing else needs throttling.
 *
 * IT MUST NOT BE USED FOR A REGENERATION THE USER ACTUALLY CAUSED, and this was
 * a live bug rather than a hypothetical. The onboarding answer route originally
 * called this on every write; the first of the six armed the cooldown, and an
 * answer EDIT minutes later was silently swallowed. Measured: `input_hash` was
 * byte-identical after changing `willow_wish` from skipped to answered, and
 * `updated_at` never moved -- which is the delete button being a lie, the exact
 * failure `input_hash` exists to prevent. Those paths call `generateLotus`
 * directly now: it is idempotent, and it returns `unchanged` after one indexed
 * read when nothing actually differs.
 *
 * THE SAME HONEST CAVEAT `src/lib/ratelimit.ts` CARRIES: serverless instances do
 * not share memory and cold starts reset this, so it is best-effort throttling
 * and not a guarantee. The worst case is a few duplicate distillations for a user
 * whose generation keeps failing -- a cost problem bounded by how often that user
 * reads, which is itself rate-limited.
 *
 * There is deliberately NO status or attempt-count column on `lotus_avatars`.
 * Absence of the row is the "needs generation" signal, and a `failed_at` column
 * would need a cron to act on it. There is no cron.
 */
const COOLDOWN_MS = 10 * 60 * 1000;
const lastAttempt = new Map<string, number>();

/**
 * Hand this to the caller's existing `after()`.
 *
 * Returns the promise so a caller inside `after()` can await it; the CALLER is
 * what must never be awaited by a handler. Resolves immediately when the cooldown
 * is in force.
 */
export function scheduleLotusRefresh(userId: string, now = Date.now()): Promise<void> {
  const previous = lastAttempt.get(userId);
  if (previous !== undefined && now - previous < COOLDOWN_MS) return Promise.resolve();

  lastAttempt.set(userId, now);

  /*
   * Bound the map on a long-lived instance. Two users make this theoretical, but
   * a map that only ever grows is free to prevent and expensive to notice.
   */
  if (lastAttempt.size > 1000) {
    for (const [key, at] of lastAttempt) {
      if (now - at >= COOLDOWN_MS) lastAttempt.delete(key);
    }
  }

  /*
   * **THE ONLY DEFERRED LOTUS CALL.** This is the speculative repair fired from
   * the reading path's `after()`: nobody asked for it, nobody is waiting for it,
   * and its absence leaves the block exactly as absent as it already was. So it
   * is the first thing shed when the model-call window runs low. The onboarding
   * write paths call `generateLotus` directly and stay `interactive`.
   */
  return generateLotus(userId, 'deferred').then(
    (outcome) => {
      if (outcome.fallback) {
        /*
         * The operationally interesting line. If this trends toward every user,
         * the safety checks are rejecting everything and the fix is the contract
         * -- W4's `lotus_generated.fallback` is the metric version of it.
         */
        console.warn('lotus stored the fallback', { userId, reason: outcome.reason });
      }
    },
    () => {
      // Unreachable: generateLotus never rejects. Belt and braces, because this
      // promise may be handed to an after() that does not await it.
    },
  );
}

/** Test seam. */
export function _resetLotusCooldown(): void {
  lastAttempt.clear();
}

// ---------------------------------------------------------------------------
// The cached read (roadmap §6)
// ---------------------------------------------------------------------------

type CacheEntry = { value: LotusBlock | null; expires: number };

/**
 * Keyed by `<userId>:<locale>`, holding the RENDERED INPUT rather than the row,
 * so a cache hit does no work at all per request.
 *
 * BE CLEAR ABOUT WHAT THIS IS, in the same terms `src/lib/ratelimit.ts` uses:
 * serverless instances do not share memory and a cold start empties it, so this
 * is a latency optimisation and never a consistency mechanism. Correctness comes
 * from the TTL being short and from `generateLotus` invalidating the entry it
 * just overwrote.
 */
const cache = new Map<string, CacheEntry>();

/**
 * Sixty seconds.
 *
 * Long enough that a burst of readings costs one lookup; short enough that a
 * regeneration written by a background `after()` on ANOTHER instance -- which
 * cannot invalidate this one -- becomes visible within a minute. A block one
 * minute stale is invisible; a block one hour stale is the delete button not
 * working.
 */
const CACHE_TTL_MS = 60_000;

/** Drop a user's entries. Called after a write on this instance. */
export function invalidateLotusBlock(userId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}

/**
 * What the reading route calls. One indexed lookup on a miss, nothing on a hit.
 *
 * Roadmap §6 names this read as one of the two the request path is allowed, and
 * says in the same breath that putting the block in the JWT is tempting and
 * wrong -- it is too large and it goes stale. Hence a cache with the database as
 * the miss path, rather than a claim.
 *
 * NULL IS NORMAL. Never treat a missing Lotus block as an error.
 */
export async function getLotusBlock(
  userId: string,
  locale: Locale,
  now = Date.now(),
): Promise<LotusBlock | null> {
  const key = `${userId}:${locale}`;

  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;

  let value: LotusBlock | null = null;
  try {
    value = await readLotusBlock(db, userId, locale);
  } catch (err) {
    /*
     * A DATABASE HICCUP MUST NOT COST THE USER THEIR READING. A reading without
     * the block is a valid reading -- it is the one a fully-skipped user gets --
     * so this degrades rather than throwing, and deliberately does NOT cache the
     * failure.
     */
    console.error('lotus block read failed', { userId, err });
    return null;
  }

  cache.set(key, { value, expires: now + CACHE_TTL_MS });
  return value;
}

/** Test seam, and the escape hatch if an instance ever needs a cold read. */
export function _resetLotusCache(): void {
  cache.clear();
}
