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
import { parseLocalDate, SESSION_HEADER, validSessionId } from '@/lib/analytics/localdate';
import { track, withAnalytics, type AnalyticsContext } from '@/lib/analytics/track';
import {
  cardFrequency,
  firstPassingWindow,
  passesGate,
  type FrequencyResult,
} from '@/lib/memory/frequency';
import { VERDICT_LADDER, WINDOWS, type WindowKey } from '@/lib/memory/windows';
import {
  angleIndexFor,
  buildFrequencyPrompt,
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

    const fresh = cached?.fingerprint === result.fingerprint;
    /*
     * "The pair is unchanged, only the counts moved." The cached line names two
     * cards and puts one above the other; if those two cards and their order
     * are the same, the sentence is still TRUE, just slightly out of date. Serve
     * it and fix it behind the response -- the alternative is making the user
     * wait for a model call to replace a correct line with a correct line.
     */
    const stillTrue =
      cached !== null &&
      cached.promptVersion === MEMORY_PROMPT_VERSION &&
      cached.topCardId === top.cardId &&
      cached.secondCardId === second.cardId;

    if (cached && (fresh || stillTrue)) {
      track('memory.frequency_shown', {
        window: result.window,
        top_card_id: top.cardId,
        second_card_id: second.cardId,
        sample: result.readings,
        cached: true,
      });

      if (!fresh) {
        // Counts moved. Regenerate behind the response; nothing waits for it.
        after(() => generate(user.id, locale, result).catch(logFailure));
      }

      return text(cached.body);
    }

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
  const prompt = buildFrequencyPrompt({ result, locale });
  const { text: raw } = await getProvider().complete(prompt);

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

  track('memory.frequency_generated', {
    window: result.window,
    top_card_id: top.cardId,
    second_card_id: second.cardId,
    sample: result.readings,
    angle: angleIndexFor(result.fingerprint, locale),
    total_ms: Math.round(performance.now() - startedAt),
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
