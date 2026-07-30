/**
 * The impure half of the gist: the model call, the fallback ladder, and the
 * write.
 *
 * SPLIT FROM `src/lib/prompt/memory.ts` the way W3 split `lotus.generate.ts`
 * from `lotus.ts`, and for the same reason: everything in `memory.ts` is pure
 * and unit-testable with no provider and no database, and the moment a model
 * call lives beside it that stops being true. The prompt, the sanitizer and the
 * deterministic fallback are the parts with the interesting failure modes, and
 * they are the parts a test can reach for free.
 *
 * THE DATABASE HANDLE ARRIVES BY DYNAMIC IMPORT, matching W4's `flush.ts`. A
 * static `import { db } from '@/lib/db/client'` pulls in `server-only`, which
 * throws under Vitest -- and then `sanitizeGist`, which is the function the
 * whole `<riwayat>` injection story rests on, would have no unit test. The
 * optional handle is how the integration suite passes its rolled-back
 * transaction in.
 */
import type { Locale } from '@/data/types';
import type { DbOrTx } from '@/lib/db/types';
import { getProvider } from '@/lib/llm';
import { gistEnabled } from '@/lib/llm/flags';
import { track } from '@/lib/analytics/track';
import { fallbackGist, gistPrompt, gistUserTurn, sanitizeGist } from '@/lib/prompt/memory';

/**
 * Extract and store the gist for one finished reading.
 *
 * NEVER THROWS, and never rethrows. It runs inside the `after()` that has
 * already written the `readings` row; an exception here would abort the rest of
 * that callback, which at the time of writing is `touchLastSeen` and would
 * later be anything else anyone adds. A missing gist costs this reading its
 * place in a future `<riwayat>` block and nothing else.
 *
 * THE FALLBACK LADDER, in order, because each rung fails differently:
 *
 *   1. the model's clause, sanitized      -- what we want
 *   2. `fallbackGist(body)`               -- the call threw, timed out, or came
 *                                            back with nothing usable after
 *                                            sanitizing. Deterministic, free,
 *                                            and roughly right.
 *   3. null                               -- even the body had no usable last
 *                                            sentence. Excluded from recall.
 *
 * Rung 2 is why `memory.gist_failed` carries `fell_back`: the difference between
 * "the model is failing and the feature is quietly running on last sentences"
 * and "the feature has stopped producing gists" is invisible without it, and
 * they need different responses.
 */
export async function extractGist(
  args: { readingId: string; body: string | null; locale: Locale },
  handle?: DbOrTx,
): Promise<void> {
  const { readingId, body, locale } = args;

  /*
   * No body, nothing to distil. A stream that died writes `body: null`, and
   * `readings.gist` is already null, so there is nothing to do and nothing to
   * report -- the failed reading is its own event.
   */
  if (!body) return;

  /*
   * THE KILL SWITCH, AND IT IS THE HIGHEST-VOLUME ONE IN THE APP -- one model
   * call per reading, so it tracks reading count rather than user count or day
   * count. `GIST_ENABLED=0` is the largest reduction available short of switching
   * off readings themselves, which is why `docs/DEPLOY-VERCEL.md` §2d tells an
   * operator to reach for it FIRST of the five.
   *
   * ABOVE THE `try`, BELOW THE `!body` CHECK, AND RETURNING RATHER THAN FALLING
   * THROUGH TO `fallbackGist`. The ladder in this file's header has three rungs
   * and a switch is none of them: rung 2 exists to report that THE MODEL is
   * failing, via `memory.gist_failed.fell_back`, and an operator's deliberate
   * choice arriving as that same event makes the one signal that distinguishes
   * "the provider is broken" from "we turned it off" unreadable. So this writes
   * nothing and reports nothing -- `readings.gist` stays null, which
   * `recallableReadings` already treats as "excluded from recall".
   *
   * WHAT IT COSTS, PERMANENTLY: a reading taken while this is off never becomes
   * material for a later reading's `<riwayat>` callback, because nothing
   * backfills. Accepted deliberately (Miftah, 2026-07-30) as the price of the
   * biggest lever.
   */
  if (!gistEnabled()) return;

  let gist: string | null = null;
  let reason: 'call_failed' | 'empty' | 'unusable' | null = null;

  try {
    const { system, maxTokens } = gistPrompt(locale);
    const { text } = await getProvider().complete(
      { system, user: gistUserTurn(body), maxTokens },
      /*
       * DEFERRED. This runs in the reading's `after()`, after the last byte has
       * reached the querent, and a shed gist falls through to `fallbackGist` --
       * the reading's own last sentence -- which is a slightly less specific
       * chain block next time and nothing else. Exactly what the soft tier is for.
       */
      { op: 'gist', callClass: 'deferred' },
    );
    gist = sanitizeGist(text);
    if (!gist) reason = text.trim() ? 'unusable' : 'empty';
  } catch (err) {
    reason = 'call_failed';
    logFailure(err);
  }

  if (!gist) {
    gist = fallbackGist(body) || null;
    track('memory.gist_failed', {
      reading_id: readingId,
      reason: reason ?? 'unusable',
      fell_back: gist !== null,
    });
  }

  try {
    const db = handle ?? (await import('@/lib/db/client')).db;
    const { setReadingGist } = await import('@/lib/db/queries/history');
    await setReadingGist(db, readingId, gist);
  } catch (err) {
    logFailure(err);
  }
}

/**
 * NEVER LOG THE DRIVER ERROR IN PRODUCTION.
 *
 * CLAUDE.md's rule, and this is the sharpest place in W5 for it: a postgres
 * error quotes the failing statement AND its bound parameters, and the
 * parameter here is the gist -- a distillation of a reading that answered the
 * querent's typed question. An LLM client error is worse still, because it can
 * carry the whole prompt, which contains the reading body verbatim. Development
 * prints everything, because there is nobody to leak it to.
 */
function logFailure(err: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.error('[memory] gist extraction failed', err);
  } else {
    console.error('[memory] gist extraction failed', {
      name: err instanceof Error ? err.name : typeof err,
    });
  }
}
