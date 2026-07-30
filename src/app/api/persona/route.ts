/**
 * `GET /api/persona` — the Inner Heavenly Lotus, read or written (VD15/VD16).
 *
 *   GET
 *     -> 200 { body, locale, cached, fallback, facts, updatedAt,
 *              entityId, translation }
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
 * THE STATE MACHINE, in the order the branches are written below. **IT GREW A FOURTH
 * ARM ON 2026-07-29** — see `personaStaleness`:
 *
 *   fresh                  -> serve it. No model call. Most page loads.
 *   drift / source-version -> serve THE OLD BODY, regenerate in after().
 *   user-edit              -> regenerate IN FRONT of the response, serve the result.
 *   no row                 -> generate synchronously. A failed generation still 200s,
 *                             because the fallback is a real body (A9).
 *
 * **SERVE STALE, REFRESH BEHIND THE RESPONSE**, which is `/api/memory/frequency`'s
 * `still-true` branch. Making somebody wait five seconds to replace a true
 * paragraph with a slightly truer one is the wrong trade on a page they opened to
 * look at.
 *
 * **AND THE ONE CASE WHERE IT IS THE WRONG TRADE: A USER EDIT.** The answer routes
 * stopped calling `generatePersona` on 2026-07-29 (Miftah's ruling — one model call
 * per edit instead of two, and none at all for a querent who fixes three answers
 * before reopening the page), so this route is now where an answer edit is honoured.
 * A querent who just changed an answer and refreshed did it **to see the paragraph
 * change**; serving them the old one means refreshing twice, which is W3's swallowed
 * answer-edit bug arriving from the read side. A13's rule that
 * `PERSONA_MIN_AGE_SECONDS` must never guard a user-caused regeneration is intact —
 * only its enforcement point moved, from the write path to `personaStaleness`.
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
import { getPersona, touchPersona } from '@/lib/db/queries/persona';
import { getTranslation } from '@/lib/db/queries/translations';
import { getLocale } from '@/lib/i18n/t';
import {
  generatePersona,
  personaMaterial,
  personaMinAgeSeconds,
  personaStaleness,
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
 * throttle in `personaStaleness` is what actually bounds the model calls — this is
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
     * chose as an intentional fact. **THAT DISTINCTION IS WHY THE FIX FOR AN
     * UNTRANSLATED PERSONA IS A TRANSLATION AND NEVER A REGENERATION**, and it is
     * the whole reason `personaInputHash` carries no locale.
     *
     * The route serves the stored body with its own `locale` and lets the CLIENT
     * translate — `PersonaBlockClient` posts to `/api/translate`, exactly as
     * `HistoryDetail` does for a reading. This route hands it the two things that
     * save a round trip: `entityId`, and any translation already in the table.
     */
    /*
     * **WHY, NOT WHETHER (2026-07-29).** This used to be a boolean, and a boolean was
     * enough while every user-caused regeneration was performed by the WRITE path.
     * Since the answer routes stopped calling `generatePersona` — Miftah's ruling, to
     * spend one model call per edit instead of two — the two kinds of staleness need
     * opposite treatment here, and only `personaStaleness` can tell them apart.
     */
    const staleness = personaStaleness(
      row,
      material.inputHash,
      personaMinAgeSeconds(),
      material.answersTouchedAt,
    );

    if (row && staleness === 'fresh') {
      track('persona.viewed', {
        cached: true,
        locale: row.locale,
        fallback: row.model === 'fallback',
        chars: row.body.length,
      });
      return json(row, true, user.id, locale);
    }

    /*
     * **`drift` AND `source-version` SERVE STALE; `user-edit` DOES NOT.** The whole
     * point of the split.
     *
     * Drift means ten more readings have moved `input_hash` while the stored
     * paragraph is still true, so making somebody wait five seconds to replace a true
     * paragraph with a slightly truer one is the wrong trade on a page they opened to
     * look at. A user edit is the opposite: the querent changed what the persona is
     * built from and refreshed **specifically to see it change**, so serving the old
     * body means they refresh twice and the feature reads as broken. That is W3's
     * swallowed answer-edit bug wearing a different hat — the edit lands, and the
     * screen keeps saying otherwise.
     */
    if (row && staleness !== 'user-edit') {
      /*
       * `'deferred'`, because a true paragraph is already on screen and shedding this
       * costs nothing that is not already absent — unlike the branches below, where
       * there is either nothing to show or something known to be wrong.
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
      return json(row, true, user.id, locale);
    }

    if (row) {
      /*
       * A USER EDIT, WITH A BODY ALREADY STORED. Regenerate IN FRONT of the response
       * and serve the result. `'interactive'`, because somebody is waiting on the
       * screen they came to look at — the same argument the no-row branch below makes.
       *
       * **THE `unchanged` BRANCH IS NOT DEAD CODE AND `touchPersona` IS WHAT MAKES
       * THIS TERMINATE.** A querent who edits an answer back to the value it already
       * had leaves `input_hash` byte-identical, so `generatePersona` returns
       * `unchanged` and writes nothing — which would leave
       * `max(onboarding_answers.updated_at)` permanently ahead of
       * `personas.updated_at` and this branch re-entered on every page view forever.
       * It costs two indexed reads and no model call, so it is cheap rather than
       * expensive, and it is still a flag that cannot clear. One `update` closes it.
       */
      const outcome = await generatePersona(user.id, locale, 'interactive', material);
      trackGenerated(outcome);

      /*
       * **`'disabled'` JOINS `'unchanged'` HERE, AND FOR THE SAME REASON.** Both
       * mean "nothing was written", so both leave
       * `max(onboarding_answers.updated_at)` permanently ahead of
       * `personas.updated_at` -- which re-enters this branch on every page view
       * forever. That is cheap (two indexed reads, no model call) but it is still a
       * flag that cannot clear, and with `PERSONA_GENERATION_ENABLED=0` it is
       * *guaranteed* rather than incidental: every visit by every querent who has
       * edited an answer. One `update` closes it.
       */
      if (outcome.reason === 'unchanged' || outcome.reason === 'disabled') {
        await touchPersona(db, user.id).catch(logFailure);
      }

      const written = await getPersona(db, user.id).catch((err) => {
        logFailure(err);
        return null;
      });

      /*
       * FALLING BACK TO THE OLD ROW RATHER THAN 500ing, which the no-row branch
       * cannot do. `generatePersona` never throws and always writes something, so
       * reaching here with nothing means the READ failed — and a paragraph that is
       * one edit out of date is strictly better than an error on a page whose other
       * four blocks rendered.
       */
      const serve = written ?? row;
      track('persona.viewed', {
        cached: written === null,
        locale: serve.locale,
        fallback: serve.model === 'fallback',
        chars: serve.body.length,
      });
      return json(serve, written === null, user.id, locale);
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
    return json(written, false, user.id, locale);
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
  /*
   * **`'disabled'` IS SILENT HERE, AND LEAVING IT OUT WAS A REAL BUG FOR ONE
   * DRAFT.** `persona.generated` means a model was reached; with
   * `PERSONA_GENERATION_ENABLED=0` none was, and the `drift` branch calls this on
   * EVERY `/account` view -- so emitting it would inflate exactly the metric an
   * operator scans to confirm the flag took effect, with `fallback: false` and a
   * `model` naming a model that was never asked. Worse than absent: it reads as
   * the switch not working.
   *
   * The operator's real instruments are unaffected and are better: `llm_calls`
   * records what actually reached a provider (query 9), and `persona.viewed`
   * still fires on every branch carrying `fallback`, which goes true for a
   * querent served the template. Same reason `'unchanged'` has always been silent.
   */
  if (outcome.reason === 'unchanged' || outcome.reason === 'disabled') return;
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
 *
 * ── THE TWO FIELDS V2's WIRING ADDED ────────────────────────────────────────
 *
 * **`entityId` IS THE QUERENT'S OWN `users.id`, AND THAT IS NOT A LEAK.**
 * `personas.user_id` is the primary key, so the persona's entity id *is* the user
 * id — that is what `resolveTranslatable`'s persona arm matches on. The client needs
 * it to post `{ entity: 'persona', entityId, field: 'body' }`, and `/api/translate`
 * independently requires `p.user_id = <session user>`, so holding your own id grants
 * nothing you did not already have. The alternative was mounting `ViewerProvider` on
 * `/account` for one string, which `viewer.tsx`'s header argues against.
 *
 * **`translation` SAVES THE SECOND VIEW ITS SPINNER**, which is `/history/[id]`'s
 * `cachedTranslation` prop doing the same job. Null when there is nothing cached, or
 * when what is cached is stale.
 */
async function json(
  row: { body: string; locale: string; facts: unknown; model: string; updatedAt: Date },
  cached: boolean,
  userId: string,
  viewerLocale: 'id' | 'en',
): Promise<NextResponse> {
  return NextResponse.json(
    {
      body: row.body,
      locale: row.locale,
      cached,
      fallback: row.model === 'fallback',
      facts: row.facts,
      updatedAt: row.updatedAt.toISOString(),
      entityId: userId,
      translation: await freshTranslation(row, userId, viewerLocale),
    },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}

/**
 * A cached translation of this persona into the viewer's language, or null.
 *
 * **STALENESS IS CHECKED HERE AND `/history/[id]` DELIBERATELY DOES NOT CHECK IT.**
 * That is not an inconsistency, it is the difference between the two artifacts:
 * `readings.body` is IMMUTABLE (VD7), so `translations.updated_at <
 * readings.created_at` can never become true and the comparison would be dead code.
 * **A persona is regenerated every time the querent draws** — `input_hash` covers the
 * last ten reading ids — so its translation goes stale routinely, and serving one
 * without this check would show English prose describing a person the Indonesian
 * original has since stopped describing. `translations.updated_at` is the entire
 * mechanism and `putTranslation` maintains it by hand for exactly this.
 *
 * **A FAILED READ IS A CACHE MISS, NEVER AN ERROR** (V2's rule, and the reason its
 * database-down check is "open a translated reading"). Returning null costs the
 * querent a model call they were going to be offered anyway; propagating would cost
 * them the page.
 */
async function freshTranslation(
  row: { locale: string; updatedAt: Date },
  userId: string,
  viewerLocale: 'id' | 'en',
): Promise<string | null> {
  if (row.locale === viewerLocale) return null;
  try {
    const cached = await getTranslation(db, {
      entity: 'persona',
      entityId: userId,
      field: 'body',
      locale: viewerLocale,
    });
    if (!cached) return null;
    return cached.updatedAt < row.updatedAt ? null : cached.body;
  } catch (err) {
    logFailure(err);
    return null;
  }
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
