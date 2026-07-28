/**
 * `PATCH /api/account/facts` — the three facts, editable (A10).
 *
 *   PATCH { fullName, nickname, birthDate }
 *     -> 200 { saved: true }
 *     -> 400 malformed body or an implausible birth date
 *     -> 401 no session
 *     -> 403 onboarding not finished
 *     -> 429 rate limited
 *     -> 500 the write failed
 *
 * **IT MUST NOT GO THROUGH `upsertProfile`, AND THAT IS THE WHOLE REASON
 * `upsertProfileFacts` EXISTS.** That function sets `completedAt: input.completedAt`
 * in its conflict branch, so a facts-only edit carries `undefined` into the one
 * column that decides whether onboarding is finished — and the querent who fixed a
 * typo in their name is sent back through the questionnaire. `upsertProfileFacts`'s
 * own comment names this route and that exact bug; **this handler is the first
 * caller it has ever had.**
 *
 * **THE ZOD SCHEMA IS REUSED, NOT REWRITTEN.** `FactsBody` in
 * `@/app/api/onboarding/shared` already carries the length caps and the birth-date
 * validator — including the one-day slack that stops a Jakarta querent's own
 * birthday being rejected as being in the future. A second schema here would be a
 * second answer to "is this a plausible birth date".
 *
 * ── TWO DECISIONS THAT LOOK LIKE ONE AND ARE NOT ─────────────────────────────
 *
 * The regeneration goes in `after()` **because nobody should wait for a model call
 * after renaming themselves**. That is a LATENCY decision.
 *
 * It calls `generatePersona` (and `generateLotus`) **DIRECTLY, through no cooldown
 * or throttle**, and that is a CORRECTNESS decision — A13, and it is W3's trap
 * verbatim. `scheduleLotusRefresh`'s ten minutes were armed by the first of six
 * onboarding writes, and an answer EDIT minutes later was silently swallowed with
 * `input_hash` byte-identical and `updated_at` frozen: the delete button being a
 * lie. `PERSONA_MIN_AGE_SECONDS` is a READ-path floor and must never guard a
 * user-caused regeneration.
 *
 * Both are stated because they look like the same decision.
 */
import { NextResponse, after } from 'next/server';

import {
  LOCAL_DATE_HEADER,
  parseLocalDate,
  SESSION_HEADER,
  validSessionId,
} from '@/lib/analytics/localdate';
import { withAnalytics, type AnalyticsContext } from '@/lib/analytics/track';
import { requireUser } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { upsertProfileFacts } from '@/lib/db/queries/profile';
import { getLocale } from '@/lib/i18n/t';
import { generatePersona } from '@/lib/persona/generate';
import { generateLotus } from '@/lib/prompt/lotus.generate';
import { hit } from '@/lib/ratelimit';
import { FactsBody, readJson } from '../../onboarding/shared';

export const runtime = 'nodejs';

/** One upsert. The model calls are in `after()` and run on their own budget. */
export const maxDuration = 20;

/** Per user per hour. A name is not edited often; this is the retry-loop bound. */
const FACTS_MAX = 20;
const HOUR_MS = 3_600_000;

export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const gate = await hit(`account:facts:${user.id}`, Date.now(), FACTS_MAX, HOUR_MS);
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'too many requests' },
      { status: 429, headers: { 'retry-after': String(gate.retryAfterSeconds) } },
    );
  }

  const parsed = FactsBody.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: 'bad body' }, { status: 400 });

  const locale = await getLocale();

  return withAnalytics(await context(request, user.id, locale), async () => {
    try {
      await upsertProfileFacts(db, user.id, parsed.data);
    } catch (err) {
      /*
       * NEVER LOG THE DRIVER ERROR. `profiles.full_name` and `nickname` are the
       * querent's own typed text and a postgres error quotes its bound parameters —
       * this statement binds all three. Same rule as `flush.ts`, and `auth.ts`
       * earned it in production by logging an email and a real name.
       */
      if (process.env.NODE_ENV === 'development') {
        console.error('[account] facts write failed', err);
      } else {
        console.error('[account] facts write failed', {
          name: err instanceof Error ? err.name : typeof err,
        });
      }
      return NextResponse.json({ error: 'save failed' }, { status: 500 });
    }

    /*
     * BOTH ARTIFACTS DEPEND ON THE FACTS AND BOTH REGENERATE.
     *
     * The persona obviously: `input_hash` covers the profile facts, so a typo in
     * the full name produces a wrong Expression number FOREVER otherwise — which is
     * worse than a regeneration, and A10's whole argument.
     *
     * The Lotus less obviously, and it is easy to miss: `lotusInputHash` covers the
     * BIRTH YEAR, so editing the birth date across a year boundary changes it. Both
     * are idempotent and both return early when nothing actually differs, so calling
     * them when only the nickname moved costs one indexed read each.
     *
     * DIRECTLY, through no cooldown. See the header.
     */
    after(async () => {
      await generateLotus(user.id).catch(() => {});
      await generatePersona(user.id, locale).catch(() => {});
    });

    return NextResponse.json({ saved: true }, { headers: { 'cache-control': 'no-store' } });
  });
}

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
