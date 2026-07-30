/**
 * The card-frequency verdict (W5 §3.4, §3.7).
 *
 * `204` IS THE COMMON RESPONSE AND THE CHEAPEST ONE. Most users, most of the
 * time, have not drawn enough for a pattern to exist, and M14 says an app that
 * announces "you haven't read enough yet" has told the user the feature exists
 * and that they are not interesting enough for it. So: no body, no copy, and
 * the client renders nothing.
 *
 * THE STATE MACHINE (§3.4), in the order the branches are written below:
 *
 *   gate fails               -> 204, and DELETE any cached row for those windows
 *   row exists, fp matches   -> serve it. No model call. Most page loads.
 *   row exists, pair same    -> serve the cached line, regenerate in after().
 *                               The counts moved but the line is still true.
 *   row exists, pair changed -> do NOT serve it; it names the wrong cards now
 *   no row                   -> generate
 *
 * NOTHING HERE IS ON A PAGE'S RENDER PATH. The reader picker is a server
 * component that renders without this and a client component fetches it
 * afterwards, so a slow model call costs a line appearing late rather than a
 * page appearing late (roadmap §6).
 */
import { NextResponse, after } from 'next/server';
import { requireUser } from '@/lib/auth/server';
import { getLocale } from '@/lib/i18n/t';
import { db } from '@/lib/db/client';
import {
  deleteVerdicts,
  getVerdict,
  upsertVerdict,
} from '@/lib/db/queries/frequency';
import { getProfile } from '@/lib/db/queries/profile';
import { getProvider } from '@/lib/llm';
import { frequencyVerdictEnabled } from '@/lib/llm/flags';
import { parseLocalDate, SESSION_HEADER, validSessionId } from '@/lib/analytics/localdate';
import { track, withAnalytics, type AnalyticsContext } from '@/lib/analytics/track';
import {
  cardFrequency,
  firstPassingWindow,
  passesGate,
  verdictCacheState,
  type FrequencyResult,
} from '@/lib/memory/frequency';
import { VERDICT_LADDER, WINDOWS, type WindowKey } from '@/lib/memory/windows';
import {
  buildFrequencyPrompt,
  frequencyFacts,
  MEMORY_PROMPT_VERSION,
} from '@/lib/prompt/summary';

export const runtime = 'nodejs';

/** One short sentence. The model call is the only slow part. */
export const maxDuration = 30;

const NO_CONTENT = new NextResponse(null, { status: 204 });

function isWindowKey(v: string | null): v is WindowKey {
  return v !== null && Object.hasOwn(WINDOWS, v);
}

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  /*
   * THE RESOLVED UI LOCALE, NOT `locale`. Same reasoning as `/api/reading`, and
   * this route is where the bug was actually VISIBLE: a screenshot of the English
   * reader picker showed an Indonesian frequency verdict sitting under an English hint.
   *
   * `locale` is the `loc` claim, which is D6's "profile" and first in the chain, so
   * for a real user the two agree. The dev-only `?lang=` override skips the claim on
   * purpose -- and these two endpoints are the ones a screenshot harness reaches, so
   * reading the claim here made the whole English-screenshot loop lie.
   *
   * `frequency_verdicts` and `daily_summaries` are BOTH keyed on locale already (W5 got
   * that right), so the cache was never the problem: the wrong key was being looked up.
   */
  const locale = await getLocale();

  const url = new URL(request.url);

  /*
   * THE DATE COMES FROM THE CLIENT AND IS REJECTED, NOT REPAIRED (roadmap §7).
   * `parseLocalDate` falls back to the server's UTC date, which is the right
   * behaviour for a reading -- a bad header must never cost someone their
   * reading. It is the WRONG behaviour here: a verdict computed over the wrong
   * "this week" is a false statement about the querent, and silence is strictly
   * better than that. The ±1 day bound inside `parseLocalDate` is reused as-is,
   * because UTC-12..+14 means one day either side covers every timezone on
   * earth and nothing else.
   */
  const parsed = parseLocalDate(url.searchParams.get('date'));
  if (parsed.source === 'fallback') {
    return NextResponse.json({ error: 'bad date' }, { status: 400 });
  }
  const today = parsed.date;

  const requested = url.searchParams.get('window');
  if (requested !== null && !isWindowKey(requested)) {
    return NextResponse.json({ error: 'unknown window' }, { status: 400 });
  }

  const ctx: AnalyticsContext = {
    userId: user.id,
    sessionId: validSessionId(request.headers.get(SESSION_HEADER)),
    locale: locale,
    localDate: today,
  };

  return withAnalytics(ctx, async () => {
    /*
     * THE PROFILE IS READ ONLY FOR THE `birthday` WINDOW, which is the only one
     * whose bounds need a birth date. It is not on VERDICT_LADDER, so the
     * release UI never triggers this read at all -- roadmap §6's "no DB read on
     * the request path unless the page cannot exist without it", applied to the
     * one window that genuinely cannot.
     */
    const birthDate =
      requested === 'birthday' ? ((await getProfile(db, user.id))?.birthDate ?? null) : null;

    let result: FrequencyResult | null;
    let evaluated: readonly WindowKey[];

    if (requested) {
      result = await cardFrequency(db, requested, { userId: user.id, today, birthDate });
      evaluated = [requested];
      if (result && !passesGate(result)) result = null;
    } else {
      result = await firstPassingWindow(db, { userId: user.id, today });
      evaluated = VERDICT_LADDER;
    }

    if (!result) {
      /*
       * Every window we just rejected loses its cached line. One statement, on
       * the path that is already doing no other work. See `deleteVerdicts`.
       */
      await deleteVerdicts(db, user.id, evaluated, locale);
      return NO_CONTENT;
    }

    const top = result.ranked[0];
    const second = result.ranked[1];
    const cached = await getVerdict(db, user.id, result.window, locale);

    /*
     * ONE DECISION, MADE IN ONE PURE FUNCTION (V3 §6.2). This used to be two
     * booleans and an `||` here, and the `||` short-circuited past the prompt
     * version -- so a bump invalidated nothing for the users who had a cached
     * row and an unchanged window, which is most of them. `verdictCacheState`
     * hoists the version check above both branches; see its header.
     *
     * `still-true` means the pair is unchanged and only the counts moved: the
     * cached line names two cards and puts one above the other, so the sentence
     * is still TRUE, just slightly out of date. Serve it and fix it behind the
     * response, rather than making the user wait for a model call that replaces
     * a correct line with a correct line.
     */
    const state = verdictCacheState(cached, result, MEMORY_PROMPT_VERSION);

    if (cached && state !== 'stale') {
      track('memory.frequency_shown', {
        window: result.window,
        top_card_id: top.cardId,
        second_card_id: second.cardId,
        sample: result.readings,
        cached: true,
      });

      if (state === 'still-true' && frequencyVerdictEnabled()) {
        // Counts moved. Regenerate behind the response; nothing waits for it.
        // Skipped entirely when switched off -- the line on screen is still TRUE,
        // which is what `still-true` means, so there is nothing to protect here.
        after(() => generate(user.id, locale, result).catch(logFailure));
      }

      return text(cached.body);
    }

    /*
     * THE KILL SWITCH. Reached only after the cache has been consulted, so
     * **`FREQUENCY_VERDICT_ENABLED=0` COSTS NOBODY THE LINE THEY ALREADY HAVE** --
     * `sharingEnabled()`'s rule ("it gates minting only; existing links keep
     * resolving") applied to a cached sentence. A kill switch that blanks a screen
     * is a worse outage than the quota it was protecting.
     *
     * 204 IS NOT AN ERROR PATH HERE, IT IS THIS ROUTE'S COMMON ANSWER -- most
     * users, most days, have no pattern worth naming. `FrequencyLine` renders
     * nothing until it has something and nothing forever if it never does (M14),
     * so there is no empty state to design, no error copy to write and nothing on
     * the reader picker that moves. Which is also why the querent cannot tell this
     * from an ordinary quiet day, deliberately.
     *
     * BELOW `deleteVerdicts`, ABOVE `generate`. The gate-failure branch above
     * still prunes stale rows: that is one statement on a path already doing no
     * other work, it reaches no model, and skipping it would leave a line naming a
     * pair the querent's window no longer has -- a false statement about them,
     * which is the one thing worse than silence.
     */
    if (!frequencyVerdictEnabled()) return NO_CONTENT;

    /*
     * No row, or a row naming the wrong pair. Generate now: serving a line that
     * names cards this querent's window no longer has at the top is worse than
     * a second of delay on a component that started empty.
     */
    const body = await generate(user.id, locale, result).catch((err) => {
      logFailure(err);
      return null;
    });

    // M14 all the way down: a failed generation renders nothing, not an error.
    if (!body) return NO_CONTENT;

    track('memory.frequency_shown', {
      window: result.window,
      top_card_id: top.cardId,
      second_card_id: second.cardId,
      sample: result.readings,
      cached: false,
    });

    return text(body);
  });
}

/**
 * One model call, one upsert, and the `memory.frequency_generated` event.
 *
 * `complete()` AND NOT A STREAM, which §3.4 calls "generate synchronously and
 * stream". The line is one sentence of at most 25 words: streaming it buys
 * about a second of a half-written sentence on a component whose whole job is
 * to be read as one clause, and it costs the route the ability to fall back to
 * 204 when the call fails -- headers are already sent by then. The user-visible
 * behaviour M14 asks for ("render nothing until there is something") is
 * identical either way. The per-day summary in Task 9 is a different call, and
 * gets weighed separately.
 */
async function generate(
  userId: string,
  locale: 'id' | 'en',
  result: FrequencyResult,
): Promise<string | null> {
  const startedAt = performance.now();

  /*
   * ONE ASSEMBLY, AND THE FACTS COME OFF THE SAME OBJECT THE PROMPT WAS BUILT
   * FROM. `frequencyFacts` used to be exported and called by nothing while this
   * function computed `angleIndexFor` itself; V3 needs four more derived values
   * for the event and wiring them by hand here would be a second place for the
   * mechanic to be computed differently from the prompt's.
   *
   * A null mechanic means an ungated result or a card id outside the deck. M14
   * all the way down: render nothing rather than a confidently wrong card.
   */
  const facts = frequencyFacts(result, locale);
  const prompt = buildFrequencyPrompt({ result, locale });
  if (prompt === null || facts.mechanic === null) return null;

  const { text: raw } = await getProvider().complete(prompt, {
    op: 'frequency',
    /*
     * DEFERRED, on BOTH of this function's call paths -- the `after()`
     * regeneration and the awaited first generation.
     *
     * A querent IS waiting on the second one, so the classification deserves its
     * argument: the tier is about what SHEDDING costs, and there is no spinner
     * here to shed. `FrequencyLine` renders nothing until there is something and
     * has no error copy by design (M14), so a 204 is indistinguishable from a
     * window with no verdict in it. Both callers already `.catch()`, so a
     * ModelCeilingError degrades to exactly that.
     */
    callClass: 'deferred',
  });

  /*
   * One line, whatever the model did with the newline rule. Collapsing rather
   * than rejecting: a two-line answer to a one-sentence prompt is still a
   * usable sentence, and this renders into a single `<p>`.
   */
  const body = raw.replace(/\s+/g, ' ').trim();
  if (!body) return null;

  const top = result.ranked[0];
  const second = result.ranked[1];

  await upsertVerdict(db, {
    userId,
    windowKey: result.window,
    locale,
    fingerprint: result.fingerprint,
    topCardId: top.cardId,
    secondCardId: second.cardId,
    body,
    model: process.env.LLM_MODEL ?? 'unknown',
    promptVersion: MEMORY_PROMPT_VERSION,
  });

  const mechanic = facts.mechanic;
  track('memory.frequency_generated', {
    window: result.window,
    top_card_id: top.cardId,
    second_card_id: second.cardId,
    sample: result.readings,
    angle: facts.angle,
    total_ms: Math.round(performance.now() - startedAt),
    // `(top + second) % 22` is recoverable from the two columns above, but the
    // prop is what makes the distribution query trivial and a column
    // unnecessary. See `## Schema deltas` in V3's plan.
    shadow_card_id: mechanic.shadowCardId,
    shadow_collision: mechanic.shadowCollision ?? 'none',
    dominance: mechanic.dominance,
    pulse: mechanic.pulseNumber,
  });

  return body;
}

function text(body: string): NextResponse {
  return new NextResponse(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // Per-user and it changes as they draw. A shared cache must never hold it.
      'cache-control': 'private, no-store',
    },
  });
}

/**
 * NEVER LOG THE DRIVER ERROR IN PRODUCTION.
 *
 * CLAUDE.md's rule, and it reaches here: a postgres error quotes the failing
 * statement AND its bound parameters. Nothing in `frequency_verdicts` is the
 * querent's own text, but `generate` also calls the model, and an LLM client
 * error can carry the prompt -- which carries their card history. Development
 * prints the whole thing, because there is nobody to leak it to.
 */
function logFailure(err: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.error('[memory] frequency generation failed', err);
  } else {
    console.error('[memory] frequency generation failed', {
      name: err instanceof Error ? err.name : typeof err,
    });
  }
}
