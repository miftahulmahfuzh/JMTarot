/**
 * Mint and revoke a share link (V7).
 *
 *   POST   { entity, entity_id, include_question, include_nickname }
 *     -> 200 { id, slug, url, include_question, include_nickname, rotated }
 *     -> 400 malformed body, or an `entity_id` that is not a uuid
 *     -> 401 no session
 *     -> 403 { error: 'not_shareable' }
 *     -> 404 sharing is switched off
 *     -> 429 rate limited
 *
 *   DELETE { id }
 *     -> 200 { revoked: true }
 *     -> 404 not yours, does not exist, or already off -- ONE answer for all three
 *
 * **BOTH BOOLEANS ARE REQUIRED, NOT OPTIONAL WITH DEFAULTS.** The share sheet
 * always sends them, and a required field is what keeps the column defaults a
 * safety net rather than a second place the product rule is written. A body that
 * omits `include_question` is a bug in a caller, and answering 400 is how that
 * caller finds out instead of silently getting a default and appearing to work.
 *
 * **`include_question` IS NOW ALWAYS `true` FROM THE SHEET** (Miftah, 2026-07-28,
 * reversing VD9): a stranger who sees three cards and four paragraphs with no
 * question cannot tell what any of it is about. The route still ACCEPTS either
 * value, because the field is the mechanism if that is revisited and because V8's
 * persona mint goes through the same handler. `schema.ts`'s comment on the column
 * records what the reversal costs and what still guards it.
 *
 * **THIS ROUTE IS NOT PUBLIC AND `isPublic()` MUST NEVER LEARN IT.** `/s/` is a
 * prefix in that function and `startsWith('/s/')` does not reach `/api/share`;
 * the slug authorizes a READ and nothing else. There is a test in
 * `gate.test.ts` asserting exactly this pair.
 *
 * **THE 404 FOR A DISABLED FEATURE IS DELIBERATE, NOT A 503.** A feature that is
 * off should look ABSENT rather than broken -- a 503 invites a retry loop and
 * reads as an outage. `sharingEnabled()` gates minting only; existing links keep
 * resolving, for the reason in `links.ts`'s header.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  LOCAL_DATE_HEADER,
  parseLocalDate,
  SESSION_HEADER,
  validSessionId,
} from '@/lib/analytics/localdate';
import { withAnalytics, track, type AnalyticsContext } from '@/lib/analytics/track';
import { requireUser } from '@/lib/auth/server';
import { getLocale } from '@/lib/i18n/t';
import { hit } from '@/lib/ratelimit';
import { createShareLink, liveSharesFor, revokeShare, sharingEnabled } from '@/lib/share/links';
import { isShareEntity } from '@/lib/share/slug';

export const runtime = 'nodejs';

/**
 * One insert plus, on the draw screen, up to two 250ms waits for a row that is
 * still being written in the reading response's own `after()` -- **and since
 * 2026-07-28 a possible model call**, because the mint now resolves the pinned
 * locale rather than trusting it (`resolvePin`).
 *
 * **MEASURED WARM THIS IS A FEW MILLISECONDS AND THAT IS NOT WHAT THIS NUMBER IS
 * FOR.** A mint is a user action that WRITES, which CLAUDE.md records as one of
 * the few things likely to be the request that wakes a suspended Neon compute --
 * and Vercel's Hobby default is ten seconds, which is what killed
 * `POST /api/locale`. 20 left room for a cold lambda, a compute wake and the
 * artifact retry; 30 leaves room for a translation on top.
 *
 * **THE COMMON CASE DOES NOT PAY IT.** The sharer is reading in the locale they
 * are sharing, so the translation is cached and `resolvePin` is one indexed read.
 *
 * **AND A BIGGER BUDGET HERE IS ONLY SAFE BECAUSE THE CLIENT BOUNDS ITSELF.**
 * That is `POST /api/locale`'s lesson in full: raising `maxDuration` without a
 * client-side timeout does not fix a hang, it lengthens one. `ShareFooter.create()`
 * carries an `AbortController`; the lambda runs to its own budget either way, so a
 * mint that outlives the client's patience still lands its row and the next open of
 * the sheet reads it back through `GET`.
 */
export const maxDuration = 30;

/** Mints per user per hour. Keyed on the session, so this is the normal case. */
const CREATE_MAX = 20;
const HOUR_MS = 3_600_000;

const CreateBody = z.object({
  entity: z.string().refine(isShareEntity, 'unknown entity'),
  entity_id: z.string().uuid(),
  include_question: z.boolean(),
  include_nickname: z.boolean(),
});

const RevokeBody = z.object({ id: z.string().uuid() });

/**
 * `GET`'s query. Read off `searchParams`, so both values arrive as `string | null`
 * and zod is what turns a missing parameter into a 400 rather than a lookup for
 * `entity_id = "null"`.
 */
const ListQuery = z.object({
  entity: z.string().refine(isShareEntity, 'unknown entity'),
  entity_id: z.string().uuid(),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (!sharingEnabled()) return notFound();

  /*
   * NAMESPACED `share:create:`, and `hit()` prefixes `read:` itself, so the
   * effective key is `read:share:create:<uid>` -- one namespace deeper than the
   * reading's, which is what stops a querent who shares a lot from losing the
   * budget that lets them take a reading.
   *
   * **AWAITED.** `hit()` is async since V9 and a forgotten `await` here would
   * evaluate a Promise as truthy, i.e. never refuse. `hitGlobal()` is deliberately
   * NOT called: its budget is the reading path's, and a mint spends no model call.
   */
  const gate = await hit(`share:create:${user.id}`, Date.now(), CREATE_MAX, HOUR_MS);
  if (!gate.ok) return tooMany(gate.retryAfterSeconds);

  const parsed = CreateBody.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: 'bad body' }, { status: 400 });
  const body = parsed.data;
  if (!isShareEntity(body.entity)) {
    return NextResponse.json({ error: 'bad body' }, { status: 400 });
  }

  return withAnalytics(await context(request, user.id), async () => {
    const result = await createShareLink({
      userId: user.id,
      entity: body.entity,
      entityId: body.entity_id,
      includeQuestion: body.include_question,
      includeNickname: body.include_nickname,
      /*
       * **THE PINNED LOCALE, RESOLVED ON THE SERVER AND NEVER TAKEN FROM THE
       * BODY.** This is what the shared page will render, so it is the language
       * the sharer is reading right now — and `getLocale()` is the only thing that
       * knows it, because it is the one resolution the session claim, the cookie
       * and the dev `?lang=` override all agree on. `CreateBody` deliberately has
       * no locale field: a client that could name it could pin a language the
       * sharer was not looking at, and the preview would stop matching the page.
       */
      locale: await getLocale(),
    });

    if (!result.ok) {
      /*
       * 403 AND NOT 404, and the difference is honest here in a way it is not on
       * the public page: the caller holds a session and owns the artifact they are
       * naming, so telling them "this one cannot be shared" leaks nothing and is
       * the only way `share.error.notShareable` can ever be shown. The resolver's
       * one-answer rule is about a STRANGER.
       */
      const status = result.reason === 'not_shareable' ? 403 : 500;
      return NextResponse.json({ error: result.reason }, { status });
    }

    track('share.created', {
      // THE ID, NEVER THE SLUG. See events.ts.
      share_id: result.id,
      entity: body.entity,
      include_question: result.includeQuestion,
      include_nickname: result.includeNickname,
      rotated: result.rotated,
      /*
       * THE PIN THAT WAS WRITTEN, which is not always the one asked for -- see
       * `resolvePin`. Reading it off `result` rather than re-resolving `getLocale()`
       * is the whole point: the fallback to as-written is otherwise invisible.
       */
      pinned_locale: result.locale,
    });

    /*
     * THE FINISHED URL IS IN THE RESPONSE BECAUSE THE CLIENT MUST NEVER BUILD ONE.
     * `SHARE_BASE_URL` carries no `NEXT_PUBLIC_` prefix, so a client component
     * assembling the URL would read `undefined` for the origin -- the trap
     * `localeSwitcherEnabled()`'s header records.
     */
    return NextResponse.json(
      {
        id: result.id,
        slug: result.slug,
        url: result.url,
        include_question: result.includeQuestion,
        include_nickname: result.includeNickname,
        rotated: result.rotated,
        /*
         * THE STORED PIN, so the sheet labels the link with the language it will
         * actually render. `null` is as-written and the sheet must say so rather
         * than assuming the locale it was displaying when the querent tapped.
         */
        locale: result.locale,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  });
}

/**
 * List the live addresses for one artifact.
 *
 *   GET /api/share?entity=reading&entity_id=<uuid>
 *     -> 200 { links: [{ id, url, locale }] }   -- `locale: null` is as-written
 *     -> 400 unknown entity, or an entity_id that is not a uuid
 *     -> 401 no session
 *
 * **THE SHEET HAD NO READ PATH AND THAT IS WHY THE 2026-07-28 BUG ARRIVED SILENTLY.**
 * `ShareFooter` only knew about a link it had minted in that mount, so a reading
 * shared yesterday looked unshared, and minting replaced the old address with
 * nothing on screen having warned. See `liveSharesFor`.
 *
 * **NOT RATE LIMITED, DELIBERATELY.** It is a session-scoped read of one row set on
 * an indexed predicate, fired when the querent OPENS the sheet — the same shape as
 * the reads `/history` does per navigation, none of which carry a budget. The mint
 * keeps its `share:create:` limit because it writes and can now reach a model.
 *
 * **NO `withAnalytics` AND NO EVENT.** Opening the sheet is already `share.*`'s
 * funnel entry on the client, and an event here would double-count it. `context()`
 * exists for the two writers.
 *
 * `sharingEnabled()` is NOT consulted, for `DELETE`'s reason.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const parsed = ListQuery.safeParse({
    entity: params.get('entity'),
    entity_id: params.get('entity_id'),
  });
  if (!parsed.success) return NextResponse.json({ error: 'bad query' }, { status: 400 });
  if (!isShareEntity(parsed.data.entity)) {
    return NextResponse.json({ error: 'bad query' }, { status: 400 });
  }

  const links = await liveSharesFor(auth.user.id, parsed.data.entity, parsed.data.entity_id);
  /*
   * `no-store`, like the mint's response. A capability URL must never sit in a
   * shared cache, and this one is scoped to a session that a CDN cannot see.
   */
  return NextResponse.json({ links }, { headers: { 'cache-control': 'no-store' } });
}

/**
 * Stop sharing an artifact — **every language of it**.
 *
 * **THE BODY NAMES ONE `id` AND THE EFFECT IS ARTIFACT-WIDE** (Miftah's ruling,
 * 2026-07-28). Once a reading can hold two addresses, a revoke that killed one of
 * them would let the querent believe the reading is private while a URL is still
 * live. `revokeShare` resolves the artifact from the row and turns off all of it;
 * there is deliberately no per-locale revoke anywhere in the app.
 *
 * **ONE `share.revoked` PER ADDRESS, NOT ONE PER REQUEST.** `age_hours` and
 * `view_count` are facts about an address's life, so collapsing two addresses into
 * one event would silently average them — and the funnel would stop being able to
 * say how much reach a revoke actually took away.
 *
 * **NEVER DISTINGUISHES "NOT YOURS" FROM "DOES NOT EXIST" FROM "ALREADY OFF".**
 * All three are a 404, for the same reason the public resolver collapses five
 * failures into one: `share_links.id` reaches the browser as an analytics prop, so
 * a distinguishable response would turn that prop into an existence oracle for
 * other people's links.
 *
 * `sharingEnabled()` is NOT consulted. Turning the feature off must never take
 * away the off switch for links that are already out there -- that would be the
 * kill switch making the thing it is killing unkillable.
 */
export async function DELETE(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const parsed = RevokeBody.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: 'bad body' }, { status: 400 });

  return withAnalytics(await context(request, user.id), async () => {
    const result = await revokeShare(parsed.data.id, user.id);
    if (!result.ok) return notFound();

    for (const address of result.revoked) {
      track('share.revoked', {
        // THE ROW'S OWN ID, not the one in the request: with two addresses the
        // request names an anchor and the event has to describe each address.
        share_id: address.id,
        entity: address.entity,
        // Both read BEFORE the update: they are facts about the link's life.
        age_hours: address.ageHours,
        view_count: address.viewCount,
      });
    }

    return NextResponse.json(
      { revoked: true, count: result.revoked.length },
      { headers: { 'cache-control': 'no-store' } },
    );
  });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/**
 * `localDate` IS THE QUERENT'S CALENDAR DAY AND THE SERVER CANNOT COMPUTE IT
 * (roadmap §7). Repaired rather than rejected, like `/api/translate` and unlike
 * `/api/memory/*`: a share link is not dated at all, so a fallback costs an
 * analytics dimension one day of accuracy, while refusing would cost the querent
 * their link.
 */
async function context(request: Request, userId: string): Promise<AnalyticsContext> {
  return {
    userId,
    sessionId: validSessionId(request.headers.get(SESSION_HEADER)),
    // The RESOLVED UI locale, not `user.locale` -- they diverge under `?lang=`.
    locale: await getLocale(),
    localDate: parseLocalDate(request.headers.get(LOCAL_DATE_HEADER)).date,
  };
}

function notFound(): NextResponse {
  return NextResponse.json({ error: 'not found' }, { status: 404 });
}

/** `retry-after` comes from the limiter and is never zero. */
function tooMany(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'too many requests' },
    { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
  );
}
