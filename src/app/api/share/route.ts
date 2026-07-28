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
import { createShareLink, revokeShare, sharingEnabled } from '@/lib/share/links';
import { isShareEntity } from '@/lib/share/slug';

export const runtime = 'nodejs';

/**
 * One insert plus, on the draw screen, up to two 250ms waits for a row that is
 * still being written in the reading response's own `after()`.
 *
 * **MEASURED WARM THIS IS A FEW MILLISECONDS AND THAT IS NOT WHAT THIS NUMBER IS
 * FOR.** A mint is a user action that WRITES, which CLAUDE.md records as one of
 * the few things likely to be the request that wakes a suspended Neon compute --
 * and Vercel's Hobby default is ten seconds, which is what killed
 * `POST /api/locale`. 20 leaves room for a cold lambda, a compute wake and the
 * artifact retry without the retry being the thing that gets truncated.
 */
export const maxDuration = 20;

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
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  });
}

/**
 * Turn a link off.
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

    track('share.revoked', {
      share_id: parsed.data.id,
      entity: result.entity,
      // Both read BEFORE the update: they are facts about the link's life.
      age_hours: result.ageHours,
      view_count: result.viewCount,
    });

    return NextResponse.json({ revoked: true }, { headers: { 'cache-control': 'no-store' } });
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
