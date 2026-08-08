/**
 * `POST /api/chat/message` — the querent speaks.
 *
 *   -> 200 { message, runId }        stored, and a run minted (or `runId: null`)
 *   -> 400 empty, over-cap, or a sanitizer refusal
 *   -> 401 / 403 (onboarding) / 429
 *   -> 403 RefusalPayload            W7's, verbatim. **NEVER a bubble** (`C-D13`)
 *
 * ── IT MAKES NO GENERATIVE MODEL CALL (`C-R1`, `[F1-8]`) ───────────────────
 *
 * It gates, it stores, it mints, it returns — fast. **The querent's own bubble must
 * appear instantly**, and making them wait for a director before their own words render
 * is the most obviously wrong thing this design could do. The one model call is the
 * classifier, already bounded at `MODERATION_TIMEOUT_MS`.
 *
 * ── `moderate()`, NOT `gateReading()` (`F1-D8`, seam S8) ───────────────────
 *
 * `gateReading()` exists to RACE a classifier against a stream that is already in
 * flight. `C-R1` forbids a generative call here, so there is no stream to race and
 * `gateReading` is the wrong function. `moderate()` is exported separately for exactly
 * this — *"so a future caller … has the decision without the machinery"* — and
 * **`src/lib/moderation/gate.ts` gets ZERO LINES.**
 *
 * The cost is visible and accepted: the classifier's measured p95 is 903ms and
 * `MODERATION_TIMEOUT_MS` bounds it at 1500. **That is the whole latency of a post.**
 *
 * **THE GATE REFUSES HARM, NOT SENSITIVITY, AND IT IS NOT "TIGHTENED" FOR THIS
 * SURFACE** (`C-D13`). Grief, illness, a dying parent and a frightening partner are
 * what the room is *for*.
 *
 * ── F4's OBLIGATION, STATED HERE BECAUSE THIS ROUTE CREATES IT ─────────────
 *
 * The querent's bubble is rendered **optimistically**, before this resolves (`C-R1`),
 * and is **withdrawn on a 403** in favour of `RefusalNotice`. **A route that can refuse
 * and a client that cannot withdraw is how a refused message ends up on screen looking
 * stored.**
 */
import { NextResponse, after } from 'next/server';
import { z } from 'zod';

import {
  LOCAL_DATE_HEADER,
  SESSION_HEADER,
  parseLocalDate,
  validSessionId,
} from '@/lib/analytics/localdate';
import { track, withAnalytics, type AnalyticsContext } from '@/lib/analytics/track';
import { requireUser } from '@/lib/auth/server';
import { ATTACHABLE_STATUSES } from '@/lib/chat/attachmentView';
import { logChatFailure } from '@/lib/chat/log';
import { mintRun } from '@/lib/chat/run';
import { MAX_CHAT_MESSAGE_LENGTH } from '@/lib/chat/types';
import { db } from '@/lib/db/client';
import { insertMessage, messageByClientKey, upsertThread } from '@/lib/db/queries/chat';
import { readings } from '@/lib/db/schema';
import { getLocale } from '@/lib/i18n/t';
import { chatEnabled } from '@/lib/llm/flags';
import { moderate, refusalPayload } from '@/lib/moderation/gate';
import { recordModerationFlag } from '@/lib/moderation/log';
import { sanitizeAnswer } from '@/lib/prompt/sanitize';
import { hit, hitRefusal, refusalsExhausted } from '@/lib/ratelimit';
import { and, eq, sql } from 'drizzle-orm';

export const runtime = 'nodejs';

/**
 * The classifier (p95 903ms, bounded at 1500) plus one transaction. **NOT `default`**
 * — `[R5]`, and this route WRITES, which `POST /api/locale`'s first rule names as one
 * of the few things likely to be the request that wakes a suspended Neon compute.
 */
export const maxDuration = 20;

const HOUR_MS = 3_600_000;
/** Per querent per hour. A runaway-client guard; `LLM_WINDOW_CHAT_CEILING` is the real
 *  bound on what a conversation costs. */
const POST_MAX = 60;

const Body = z.object({
  body: z.string().max(MAX_CHAT_MESSAGE_LENGTH),
  reply_to_message_id: z.string().uuid().nullish(),
  attached_reading_id: z.string().uuid().nullish(),
  /** F4's ONE permitted timeout retry (`POST /api/locale`'s rule 3). */
  client_key: z.string().min(8).max(64).nullish(),
  attached_from: z.enum(['history', 'draw']).nullish(),
});

export async function POST(request: Request) {
  // 1. `[F1-10]`. `requireUser()` requires completed onboarding by default, which is
  //    what the chat needs: the readers' context is the six answers and the Lotus, and
  //    a half-onboarded querent has neither.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const user = auth.user;

  /*
   * 2. THE TWO BUDGETS, CONCURRENTLY. `hit()` records unconditionally and
   *    `refusalsExhausted()` is a read, so neither's outcome can change the other's
   *    effect — the reading route's own argument for the `Promise.all`.
   *
   *    **`hitGlobal()` IS DELIBERATELY NOT CALLED**: its budget is the reading path's
   *    and a post spends no generative call. **`reserveModelCall()` IS NOT CALLED
   *    EITHER** — the classifier reserves for itself inside `metered()`.
   *
   *    `refusalsExhausted` applies here for W7-D13's reason: **probing the blocklist
   *    through a chat box is the same probing**, and the chat is a far more inviting
   *    box to probe than a question field under a spread.
   */
  const [perUser, probing] = await Promise.all([
    hit(`chat:post:${user.id}`, Date.now(), POST_MAX, HOUR_MS),
    refusalsExhausted(user.id),
  ]);
  if (!perUser.ok) return tooMany(perUser.retryAfterSeconds);
  if (probing) return tooMany(probing.retryAfterSeconds);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad body' }, { status: 400 });
  const input = parsed.data;

  /*
   * 4. **THE STRING THAT IS MODERATED IS BYTE-FOR-BYTE THE STRING THAT IS STORED AND
   *    LATER PROMPTED** (`[F1-9]`, `F1-D9`). The reading route's rule verbatim —
   *    *"moderating one string and prompting another is the classic bypass"* — and
   *    here it has a longer tail: this string enters EVERY subsequent prompt in the
   *    room (`C-R5`), so a delimiter that survives storage is a delimiter in every
   *    future prompt rather than in one.
   *
   *    `sanitizeAnswer` REJECTS rather than truncating, and it is idempotent, so one
   *    call at the top of the handler is what makes the bypass unavailable.
   */
  const clean = sanitizeAnswer(input.body, MAX_CHAT_MESSAGE_LENGTH);

  /*
   * **AN EMPTY MESSAGE IS LEGAL IF SOMETHING IS ATTACHED**, and that is F6's: an
   * attachment with no text is a perfectly good conversational move and must produce a
   * run. Empty AND unattached is a 400.
   */
  const body = clean ?? '';
  if (body.length === 0 && !input.attached_reading_id) {
    return NextResponse.json({ error: 'empty' }, { status: 400 });
  }

  const locale = await getLocale();

  try {
    /*
     * 5a. **THE RETRY, ANSWERED BEFORE ANYTHING ELSE.** A client repeating a timed-out
     *     POST gets the row it already made, not a second one — because a double post
     *     is not merely a duplicate bubble: **both copies become context for every
     *     future turn in the room** (`C-R5`), so one dropped packet is quoted back at
     *     the querent forever. The unique index is the arbiter; this read is what turns
     *     the second attempt into a 200 rather than a 409 the client must interpret.
     */
    if (input.client_key) {
      const already = await messageByClientKey(db, user.id, input.client_key);
      if (already) return NextResponse.json({ message: already, runId: null });
    }

    /*
     * 5b. **`attached_reading_id` MUST BELONG TO THE CALLER** (`[F1-11]`). F6 owns the
     *     bubble; F1 owns the route, so F1 owns this check. Without it a querent posts a
     *     stranger's reading id and **three readers read a stranger's reading aloud, in
     *     a room, from a body the attacker never had access to.**
     *
     *     A `WHERE user_id = $caller` on the existence check and not a 403 branch on a
     *     separate read: one statement, one truth.
     */
    if (input.attached_reading_id) {
      /*
       * **AND IT MUST BE ATTACHABLE, WHICH IS WIDER THAN WHAT THE UI OFFERS**
       * (`[F6-12]`, F6's D2). `ATTACHABLE_STATUSES` is imported rather than spelled,
       * so the two halves of the predicate cannot drift: `attachable()` — `ok` only —
       * is what `/history/[id]` offers, and this set adds `partial` because **the draw
       * screen cannot know.** Its `done` means *"the stream ended normally as far as
       * the browser is concerned"* and the tee may independently have written
       * `partial`; refusing it here would mean a control correctly offered and then
       * refused, which is a button that works on most readings and fails on the ones
       * where the app already went wrong once.
       *
       * `failed` and `aborted` are refused on both sides: there is nothing for a
       * reader to talk about except the cards, and a room discussing readings that did
       * not happen is a room discussing the app. A hand-typed `?attach=` is the only
       * way to reach this branch, which is exactly why it is a `where` clause and not
       * a UI decision.
       *
       * **`hasBody` IN SQL AND `Boolean()` ON THE WAY OUT** — `readingsForDay`'s rule:
       * `sql<boolean>` is an assertion the driver is not obliged to honour, and a
       * truthy string would silently reverse a guard. `body` itself is NOT selected:
       * this handler already refuses to log a driver error for exactly the reason a
       * reading body should not be bound into one.
       */
      const [owned] = await db
        .select({
          id: readings.id,
          status: readings.status,
          hasBody: sql<boolean>`length(btrim(coalesce(${readings.body}, ''))) > 0`,
        })
        .from(readings)
        .where(and(eq(readings.id, input.attached_reading_id), eq(readings.userId, user.id)))
        .limit(1);
      const attachable =
        owned && ATTACHABLE_STATUSES.includes(owned.status) && Boolean(owned.hasBody);
      if (!attachable) return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
  } catch (err) {
    logChatFailure('post.precheck', err, { user: user.id });
    return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  }

  const ctx = await context(request, user.id, locale);

  return withAnalytics(ctx, async () => {
    /*
     * 6. **THE GATE.** Blocklist plus classifier, under `MODERATION_TIMEOUT_MS`, on the
     *    SANITIZED string.
     */
    const verdict = await moderate(body.length ? body : null, locale);

    if (verdict.category !== null) {
      /*
       * The flag row, off the response path. Registered for BOTH a refusal and a
       * near-miss — `recordModerationFlag` returns early with no category, so a clean
       * message writes nothing.
       *
       * **`after()` AND NOT `defer()`**: `defer()`'s queue is drained by W4's analytics
       * callback, and a refusal has no stream to wait on.
       */
      const flagged = body;
      after(() =>
        recordModerationFlag({
          userId: user.id,
          question: flagged,
          verdict,
          locale,
          action: verdict.blocked ? 'blocked' : 'allowed_flagged',
        }),
      );
    }

    if (verdict.source === 'timeout') {
      track('moderation.timeout', {
        failed_open: !verdict.blocked,
        reason: 'timeout',
        surface: 'chat',
        reader_id: null,
        service_id: null,
      });
    }
    if (!verdict.blocked && verdict.category !== null) {
      track('moderation.allowed_flagged', {
        category: verdict.category,
        confidence_bucket: bucket(verdict.confidence),
        surface: 'chat',
        reader_id: null,
        service_id: null,
      });
    }

    if (verdict.blocked) {
      /*
       * **THE REFUSAL CONSUMES ITS OWN BUDGET** (W7-D13), recorded here because only
       * now is it known that a refusal happened. **INSIDE `after()`, NOT `await`ed**,
       * and **NOT `defer()`** — `defer()` opens with `if (!enabled()) return`, so with
       * `ANALYTICS_ENABLED=0` the refusal would never record: **an analytics kill
       * switch must not be able to disable a security control.** And not a bare
       * `void`, because a floating promise in a serverless function may be frozen
       * before it resolves.
       */
      after(() => hitRefusal(user.id));

      track('moderation.refused', {
        source: verdict.source,
        category: verdict.category ?? 'unclear',
        confidence_bucket: bucket(verdict.confidence),
        surface: 'chat',
        reader_id: null,
        service_id: null,
      });

      /*
       * **NO `chat_messages` ROW IS WRITTEN** (`C-D13`), and **the 403 is the app
       * speaking, never Thessaly**: a reader who refuses you is a friend who refuses
       * you. `RefusalNotice` renders this payload; a bubble would put the refusal in
       * the transcript, where every future turn would read it as something a reader
       * said.
       */
      return NextResponse.json(refusalPayload(verdict), {
        status: 403,
        headers: { 'cache-control': 'no-store' },
      });
    }

    try {
      /*
       * 7 & 8. **STORE, MINT AND TOUCH THE THREAD IN ONE TRANSACTION**, so that a
       *        stored message with no run — a room that silently never answers — is
       *        unreachable.
       *
       *        **`CHAT_ENABLED=0` STORES THE MESSAGE AND SKIPS ONLY THE MINT**
       *        (`[F1-19]`): off means "write nothing NEW", and a querent's own words
       *        are not new generation. The reply carries `runId: null` and F4 leaves
       *        the bubble where it is.
       */
      const { message, runId } = await db.transaction(async (tx) => {
        const stored = await insertMessage(tx, {
          userId: user.id,
          author: 'user',
          body,
          locale,
          replyToMessageId: input.reply_to_message_id ?? null,
          attachedReadingId: input.attached_reading_id ?? null,
          clientKey: input.client_key ?? null,
        });

        await upsertThread(tx, user.id, { lastUserMessageAt: new Date() });

        const minted = chatEnabled()
          ? await mintRun(
              {
                userId: user.id,
                trigger: 'user_message',
                locale,
                triggerMessageId: stored.id,
              },
              tx,
            )
          : null;

        return { message: stored, runId: minted?.runId ?? null };
      });

      track('chat.message_sent', {
        /* `length` AND NEVER THE BODY (rule 1). */
        length: body.length,
        locale,
        reply_to: Boolean(input.reply_to_message_id),
        /* F6's folded declaration (`chat.attachment_added` became this prop). */
        attached_from: input.attached_from ?? null,
        reading_id: input.attached_reading_id ?? null,
        minted_run: runId !== null,
      });

      return NextResponse.json({ message, runId }, { headers: { 'cache-control': 'no-store' } });
    } catch (err) {
      /*
       * **`[F1-23]`. THE ERROR IS NEVER LOGGED WHOLE FROM HERE**, and this is the
       * handler the rule was written for: the failing statement binds
       * `chat_messages.body`, which is text a person typed into a room where they were
       * invited to talk about the worst thing they have seen.
       */
      logChatFailure('post', err, { user: user.id, length: body.length });
      return NextResponse.json({ error: 'unavailable' }, { status: 500 });
    }
  });
}

function tooMany(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: 'too many requests' },
    { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
  );
}

/** W7's bucketing, so a confidence never reaches `events.props` as a float. */
function bucket(c: number | null): 'low' | 'medium' | 'high' | null {
  if (c === null) return null;
  return c < 0.4 ? 'low' : c < 0.75 ? 'medium' : 'high';
}

async function context(
  request: Request,
  userId: string,
  locale: Awaited<ReturnType<typeof getLocale>>,
): Promise<AnalyticsContext> {
  const parsedDate = parseLocalDate(request.headers.get(LOCAL_DATE_HEADER));
  if (parsedDate.source === 'fallback') {
    track('analytics.local_date_fallback', {
      reason: parsedDate.reason,
      received: parsedDate.received,
      surface: 'chat.message',
    });
  }
  return {
    userId,
    sessionId: validSessionId(request.headers.get(SESSION_HEADER)),
    locale,
    localDate: parsedDate.date,
  };
}
