/**
 * Translate one artifact into the viewer's language (V2 §5).
 *
 *   POST { entity, entityId, field }
 *   ->  200 text/plain     the translation, streamed iff TRANSLATABLE[key].stream
 *   ->  204                the source is ALREADY in the viewer's locale — render it
 *   ->  400                unknown entity/field pair, or a malformed uuid
 *   ->  404                no such artifact, OR not yours (T9 — the same answer)
 *   ->  429                rate limited
 *
 * ── THREE THINGS HERE ARE EASY TO GET WRONG AND WERE GOT WRONG BEFORE ────────
 *
 * **THE LOCALE COMES FROM `getLocale()`, NEVER FROM `user.locale`** (T10). They agree
 * for a real user, because the `loc` claim is first in the resolution chain — and
 * they diverge under the dev-only `?lang=`, which is exactly when a screenshot loop
 * is watching. `/api/reading` and both `/api/memory/*` routes each learned this
 * separately.
 *
 * **OWNERSHIP IS RESOLVED IN THE QUERY, AND "NOT YOURS" IS A 404.** Without it this
 * endpoint is an oracle: POST a uuid, get somebody else's reading back in your
 * language. Distinguishing 403 from 404 would confirm the uuid exists, which is the
 * reasoning V7 applies to share slugs.
 *
 * **THE FIRST CHUNK IS PULLED BEFORE THE HEADERS GO OUT**, exactly as
 * `/api/memory/summary` does, so a call that dies before its first token becomes a
 * clean fallback rather than a 200 with an empty body the client has to special-case.
 *
 * **V7's PUBLIC SHARE PAGE MUST NOT CALL THIS ROUTE** (reconciliation §5.5). It has
 * no session, so `requireUser()` would 401 it — and loosening that would hand the
 * world an endpoint that spends model calls. `/s/[slug]` renders `readings.body`
 * verbatim and does not translate at all.
 */
import { NextResponse, after } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/lib/auth/server';
import {
  LOCAL_DATE_HEADER,
  parseLocalDate,
  SESSION_HEADER,
  validSessionId,
} from '@/lib/analytics/localdate';
import { withAnalytics, type AnalyticsContext } from '@/lib/analytics/track';
import { db } from '@/lib/db/client';
import { resolveTranslatable } from '@/lib/db/queries/translations';
import { getLocale } from '@/lib/i18n/t';
import { hit, hitGlobal } from '@/lib/ratelimit';
import { isTranslatableKey, TRANSLATABLE } from '@/lib/translate/keys';
import { translateOrCached, translateStream } from '@/lib/translate/translate';
import type { TranslatableEntity, TranslatableField } from '@/lib/translate/keys';

export const runtime = 'nodejs';

/** One model call plus one upsert. The `/api/memory/summary` ceiling. */
export const maxDuration = 30;

/**
 * `zod`, exactly as `/api/onboarding/*` and `/api/auth/dev-session` already do.
 *
 * The uuid shape is checked BEFORE it reaches a query, so a malformed id is a 400
 * and not a driver error carrying the parameter into a log — which is the same rule
 * `flush.ts` and `log.ts` follow from the other end.
 */
const Body = z.object({
  entity: z.string(),
  entityId: z.string().uuid(),
  field: z.string(),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  /*
   * BOTH BUDGETS, BOTH CHECKED, BEFORE ANY READ (T11). `hit` bounds one person and
   * `hitGlobal` bounds a crowd of throwaway accounts; `ratelimit.ts`'s own header
   * says to call both and never one instead of the other.
   *
   * NAMESPACED `translate:`, so a history page being read does not eat the budget
   * that lets the same querent take a reading. `hit()` prefixes `read:` itself, so
   * the effective key is `read:translate:<uid>` — one namespace deeper than the
   * reading's, which is what keeps the two apart.
   */
  const [perUser, perFleet] = await Promise.all([hit(`translate:${user.id}`), hitGlobal()]);
  if (!perUser.ok) return tooMany(perUser.retryAfterSeconds);
  if (!perFleet.ok) return tooMany(perFleet.retryAfterSeconds);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'bad body' }, { status: 400 });

  const key = `${parsed.data.entity}.${parsed.data.field}`;
  if (!isTranslatableKey(key)) {
    return NextResponse.json({ error: 'not translatable' }, { status: 400 });
  }
  const spec = TRANSLATABLE[key];
  const entity = parsed.data.entity as TranslatableEntity;
  const field = parsed.data.field as TranslatableField;

  // T10. The RESOLVED UI locale, not the claim and not the column.
  const locale = await getLocale();

  /*
   * `localDate` IS THE QUERENT'S CALENDAR DAY AND THE SERVER CANNOT COMPUTE IT
   * (roadmap §7). It arrives on `x-jm-local-date`, which the client tracker already
   * sends, and `parseLocalDate` bounds it to UTC-12..+14 and fires
   * `analytics.local_date_fallback` when it has to invent one.
   *
   * REPAIRED HERE RATHER THAN REJECTED, unlike `/api/memory/*`. Those two 400 on a
   * bad date because a summary of the wrong day is a false statement about what the
   * querent did. A translation is not dated at all — the column exists so every
   * event in one request shares a day — so a fallback costs an analytics dimension
   * one day of accuracy and refusing would cost the viewer their translation.
   */
  const ctx: AnalyticsContext = {
    userId: user.id,
    sessionId: validSessionId(request.headers.get(SESSION_HEADER)),
    locale,
    localDate: parseLocalDate(request.headers.get(LOCAL_DATE_HEADER)).date,
  };

  return withAnalytics(ctx, async () => {
    /*
     * ONE query, filtering on `user_id` in the same statement. Null means "does not
     * exist" AND "not yours", and the caller cannot tell which — deliberately.
     */
    const source = await resolveTranslatable(db, {
      entity,
      entityId: parsed.data.entityId,
      field,
      userId: user.id,
    });
    if (!source) return NextResponse.json({ error: 'not found' }, { status: 404 });

    /*
     * ALREADY IN THE VIEWER'S LANGUAGE. 204 rather than echoing the source back:
     * the client already has the prose it is looking at, and a 200 carrying it
     * unchanged would make "did this get translated?" unanswerable from the wire.
     */
    if (source.sourceLocale === locale) return new NextResponse(null, { status: 204 });

    const args = {
      entity,
      entityId: parsed.data.entityId,
      field,
      source: source.body,
      sourceLocale: source.sourceLocale,
      sourceUpdatedAt: source.sourceUpdatedAt,
      target: locale,
      readerId: source.readerId,
      serviceId: source.serviceId,
    };

    if (!spec.stream) {
      const result = await translateOrCached(args);
      return text(result.body);
    }

    const stream = translateStream(args);
    const iterator = stream[Symbol.asyncIterator]();

    /*
     * PULLED BEFORE THE HEADERS. `translateStream` is an `async *` generator, so
     * calling it starts nothing until something pulls — and pulling here is what
     * keeps a fallback available for a call that dies before its first token.
     * Without it the response is a 200 whose body turns out to be empty.
     */
    const first = await iterator.next();
    if (first.done || !first.value) {
      /*
       * Nothing arrived at all, which `translateStream` only does when it could not
       * even fall back — it yields the source on every failure it knows about. Treat
       * it as the 204 case: the client renders what it already has.
       */
      return new NextResponse(null, { status: 204 });
    }

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(first.value));
      },
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) {
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(next.value));
        } catch {
          /*
           * CLOSE, DO NOT ERROR. The viewer has already read part of the
           * translation; tearing the response down replaces it with nothing.
           * `translateStream` has already logged whatever went wrong, without the
           * error object — the prose is a bound parameter and the prompt carries the
           * source verbatim.
           */
          controller.close();
        }
      },
      cancel() {
        // The viewer navigated away. `stream.result` still settles, so the after()
        // below cannot park on its timeout.
        void iterator.return?.();
      },
    });

    /*
     * THE WRITE IS ALREADY INSIDE `translateStream`, and this only waits for it so
     * the request's analytics batch is flushed with the outcome in it. Nothing about
     * persistence is on the path of a byte.
     */
    after(async () => {
      await stream.result;
    });

    return new NextResponse(body, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'private, no-store',
        'x-accel-buffering': 'no',
      },
    });
  });
}

/**
 * T2. ONE CONTENT TYPE FOR BOTH SHAPES — a buffered response is a stream that
 * arrived in one chunk, so the caller writes one reader. Two response shapes in one
 * route means two client paths and the one nobody exercises is the one that breaks.
 */
function text(body: string): NextResponse {
  return new NextResponse(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });
}

/**
 * `retry-after` comes from the limiter and is never zero.
 *
 * No `track()` here: `reading.rate_limited` is the reading's event and this is not a
 * reading. A translation refused by the limiter is visible as the absence of a
 * `translation.generated` row against the `hit` it consumed, and inventing a
 * sixteenth event name would break reconciliation §4's register.
 */
function tooMany(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'too many requests' },
    { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
  );
}
