/**
 * `GET /api/persona` — the Inner Heavenly Lotus, read or written (VD15/VD16).
 *
 *   GET
 *     -> 200 { body, locale, cached, fallback, facts, updatedAt }
 *     -> 401 no session
 *     -> 403 onboarding not finished
 *     -> 429 rate limited
 *     -> 500 nothing to serve and nothing could be written
 *
 * **IT BUFFERS AND DOES NOT STREAM** (A7, reconciliation §5.8, amending roadmap
 * §6). A safety check that must run before the first byte reaches a browser means
 * the response is buffered regardless — declaring it a stream would be a lie in the
 * type and an invitation to delete the check. You cannot un-send a banned word, and
 * this string is additionally going onto a public page. `/api/memory/frequency`
 * made the same call for the same second reason: with headers unsent, a failed
 * generation can still fall back.
 *
 * THE STATE MACHINE, in the order the branches are written below:
 *
 *   row, not stale     -> serve it. No model call. Most page loads.
 *   row, stale         -> serve THE OLD BODY, regenerate in after().
 *   no row             -> generate synchronously. A failed generation still 200s,
 *                         because the fallback is a real body (A9).
 *
 * **SERVE STALE, REFRESH BEHIND THE RESPONSE**, which is `/api/memory/frequency`'s
 * `still-true` branch. Making somebody wait five seconds to replace a true
 * paragraph with a slightly truer one is the wrong trade on a page they opened to
 * look at.
 *
 * **`await getLocale()`, NEVER `user.locale`.** They agree for a real user because
 * the `loc` claim is first in the resolution chain; they diverge under `?lang=`,
 * which is exactly when a screenshot harness is watching. `/api/reading` and both
 * `/api/memory/*` routes each learned this separately and this route must not learn
 * it a fourth time.
 */
import { NextResponse, after } from 'next/server';

import {
  LOCAL_DATE_HEADER,
  parseLocalDate,
  SESSION_HEADER,
  validSessionId,
} from '@/lib/analytics/localdate';
import { track, withAnalytics, type AnalyticsContext } from '@/lib/analytics/track';
import { requireUser } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { getPersona } from '@/lib/db/queries/persona';
import { getLocale } from '@/lib/i18n/t';
import {
  generatePersona,
  isPersonaStale,
  personaMaterial,
  personaMinAgeSeconds,
} from '@/lib/persona/generate';
import { PERSONA_SOURCE_VERSION } from '@/lib/persona/prompt';
import { hit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/**
 * One model call plus six reads. `/api/memory/frequency` declares 30 for one model
 * call and this is the same shape of work — plus, on a cold lambda, a Neon compute
 * that may be suspended. Vercel's Hobby default of ten seconds is what killed
 * `POST /api/locale`.
 */
export const maxDuration = 30;

/**
 * Per user per hour. Generous, because most requests are a cached read and the
 * throttle in `isPersonaStale` is what actually bounds the model calls — this is
 * the backstop for a client stuck in a retry loop.
 *
 * `hit()` prefixes `read:`, so the effective key is `read:persona:<uid>`: its own
 * namespace, so refreshing this page cannot spend the budget that lets somebody
 * take a reading.
 */
const PERSONA_MAX = 60;
const HOUR_MS = 3_600_000;

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  // AWAITED. `hit()` is async since V9 and an un-awaited Promise is truthy.
  const gate = await hit(`persona:${user.id}`, Date.now(), PERSONA_MAX, HOUR_MS);
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'too many requests' },
      { status: 429, headers: { 'retry-after': String(gate.retryAfterSeconds) } },
    );
  }

  const locale = await getLocale();

  return withAnalytics(await context(request, user.id, locale), async () => {
    /*
     * The six reads and the hash, ONCE. `generatePersona` accepts them back as
     * `preread` so the staleness decision and the generation do not each pay for
     * them — which on this page would be twelve queries for one paragraph.
     */
    const material = await personaMaterial(user.id, locale).catch((err) => {
      logFailure(err);
      return null;
    });

    if (!material) {
      /*
       * `requireUser()` already required completed onboarding, so reaching here is
       * either a race with the completion route or a database that is down. 500,
       * and the client renders its retry affordance: unlike `FrequencyLine`, this
       * block has a heading above it that the querent came to read, so silence
       * would look like a broken page.
       */
      return NextResponse.json({ error: 'unavailable' }, { status: 500 });
    }

    const row = await getPersona(db, user.id).catch((err) => {
      logFailure(err);
      return null;
    });

    /*
     * THE LOCALE IS CHECKED HERE AND NOT INSIDE `isPersonaStale`, and the
     * difference matters: a foreign-locale body is not STALE, it is UNTRANSLATED.
     * Regenerating it would overwrite the original that V2's translation is derived
     * from, and `personas.locale` would then record a language the querent never
     * chose as an intentional fact.
     *
     * V8 serves the stored body with its own `locale` and lets the CLIENT decide.
     * `PersonaBlock` renders `lang={locale}` so a screen reader is told the truth,
     * and V2's translator is the next step whoever wires it takes. Until then a
     * viewer who switched language sees the persona in the language it was written
     * in, labelled — which is `ReadingView`'s `{ kind: 'as-written' }` decision,
     * made for the same reason.
     */
    const stale =
      row === null || isPersonaStale(row, material.inputHash, personaMinAgeSeconds());

    if (row && !stale) {
      track('persona.viewed', {
        cached: true,
        locale: row.locale,
        fallback: row.model === 'fallback',
        chars: row.body.length,
      });
      return json(row, true);
    }

    if (row) {
      /*
       * Serve the OLD body and refresh behind the response. `'deferred'`, because a
       * true paragraph is already on screen and shedding this costs nothing that is
       * not already absent — unlike the branch below, where there is nothing to
       * show.
       */
      after(() =>
        generatePersona(user.id, locale, 'deferred', material).then((outcome) =>
          trackGenerated(outcome),
        ),
      );

      track('persona.viewed', {
        cached: true,
        locale: row.locale,
        fallback: row.model === 'fallback',
        chars: row.body.length,
      });
      return json(row, true);
    }

    /*
     * No row at all. Generate now: this is the querent's first visit and there is
     * nothing true to show them instead. `'interactive'`, because somebody is
     * waiting and the fallback — not silence — is what a shed call would cost.
     */
    const outcome = await generatePersona(user.id, locale, 'interactive', material);
    trackGenerated(outcome);

    const written = await getPersona(db, user.id).catch((err) => {
      logFailure(err);
      return null;
    });

    if (!written) {
      // Only reachable when the WRITE failed, which `generatePersona` reports as
      // `error` — it never throws, so there is nothing to catch here, only nothing
      // to serve.
      return NextResponse.json({ error: 'unavailable' }, { status: 500 });
    }

    track('persona.viewed', {
      cached: false,
      locale: written.locale,
      fallback: written.model === 'fallback',
      chars: written.body.length,
    });
    return json(written, false);
  });
}

function trackGenerated(outcome: {
  model: string;
  locale: string;
  facets: string[];
  readingCount: number;
  ms: number;
  fallback: boolean;
  reason?: string;
}): void {
  if (outcome.reason === 'unchanged') return;
  track('persona.generated', {
    model: outcome.model,
    source_version: PERSONA_SOURCE_VERSION,
    locale: outcome.locale,
    // THREE PROPS, NOT AN ARRAY: `sanitizeProps()` drops non-scalars, so
    // `facets: string[]` would arrive as an absent key with nothing thrown.
    facet_a: outcome.facets[0] ?? '',
    facet_b: outcome.facets[1] ?? '',
    facet_c: outcome.facets[2] ?? '',
    reading_count: outcome.readingCount,
    latency_ms: outcome.ms,
    fallback: outcome.fallback,
    reject_reason: outcome.reason ?? null,
  });
}

/**
 * JSON, not `text/plain`, because the block needs the facts alongside the body:
 * the card art, the arcana name and the captions under the numbers all come from
 * them, and a second round trip for data the generator already had would be a
 * second failure mode.
 *
 * `private, no-store`. It is per-user and it moves.
 */
function json(
  row: { body: string; locale: string; facts: unknown; model: string; updatedAt: Date },
  cached: boolean,
): NextResponse {
  return NextResponse.json(
    {
      body: row.body,
      locale: row.locale,
      cached,
      fallback: row.model === 'fallback',
      facts: row.facts,
      updatedAt: row.updatedAt.toISOString(),
    },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}

/**
 * `localDate` IS THE QUERENT'S CALENDAR DAY AND THE SERVER CANNOT COMPUTE IT
 * (roadmap §7). Repaired rather than rejected, like `/api/share` and unlike
 * `/api/memory/*`: the persona is not windowed by day at all, so a fallback costs
 * an analytics dimension one day of accuracy while refusing would cost the querent
 * their page over a missing header.
 */
async function context(
  request: Request,
  userId: string,
  locale: 'id' | 'en',
): Promise<AnalyticsContext> {
  return {
    userId,
    sessionId: validSessionId(request.headers.get(SESSION_HEADER)),
    locale,
    localDate: parseLocalDate(request.headers.get(LOCAL_DATE_HEADER)).date,
  };
}

/**
 * NEVER LOG THE DRIVER ERROR IN PRODUCTION.
 *
 * `/api/memory/frequency`'s rule, and it binds harder here: a postgres error quotes
 * its bound parameters, and an LLM client error can carry the prompt — which carries
 * this querent's Lotus summary, the distillation of the most sensitive thing they
 * typed. Development prints the whole thing, because there is nobody to leak it to.
 */
function logFailure(err: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.error('[persona] read failed', err);
  } else {
    console.error('[persona] read failed', {
      name: err instanceof Error ? err.name : typeof err,
    });
  }
}
