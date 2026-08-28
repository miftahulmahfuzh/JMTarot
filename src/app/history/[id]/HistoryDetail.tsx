'use client';

/**
 * The thin client wrapper that owns the TRANSLATION and, since 2026-08-28, the
 * REFILL — and nothing else.
 *
 * WHY IT EXISTS AT ALL: `ReadingView` takes prose as data (H2) so V7 can mount
 * it on a page with no session, and a streaming translation needs client state.
 * Everything visual is in `ReadingView`, which is the point of VD10.
 *
 * ── TWO ASYNC SOURCES OF PROSE, AND ONE LINE KEEPS THEM APART ────────────────
 *
 * V2's translation streams the prose this reading ALREADY HAS into the viewer's
 * language. The refill streams prose into a reading that never got any. Both
 * write to this component's state, and they must never fight:
 *
 *   - `needs` IS COMPUTED FROM THE SERVER PROP `reading`, NEVER FROM THE
 *     REFILLED VIEW. A refilled row has a body; deriving `needs` from the view
 *     would start a translation of prose that arrived seconds ago in the
 *     language the querent is already reading.
 *   - **THERE IS NO `router.refresh()` ANYWHERE IN THIS FILE, AND THERE MUST
 *     NEVER BE.** Two independent reasons, either one sufficient: (a) a refresh
 *     makes `reading.body` non-null, which makes `needs` true, which sets the
 *     translation effect off against the refill; (b) the retry route writes its
 *     row inside the response's own `defer()`, so a refresh fired at stream end
 *     races that write and repaints `history.detail.noBody` over prose the
 *     querent just watched arrive. `ShareFooter`'s three 250ms attempts exist
 *     because of the same race. `useRouter` is imported for exactly one thing:
 *     `router.replace('/login')` on a 401.
 *
 * ── RULE 4 IS HELD BY `refillView`, NOT BY THIS COMPONENT'S CARE ─────────────
 *
 * See that function's own header. It is exported and unit-tested because
 * `ReadingView`'s fourth rule is an INVARIANT of the renderer rather than the
 * caller's discipline, and the refill is the one path that hands `ReadingView` a
 * body it did not have when the page was served.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AttachReadingLink } from '@/components/AttachReadingLink';
import { ReadingView, type ReadingProse, type ReadingViewData } from '@/components/ReadingView';
import { RefusalNotice } from '@/components/RefusalNotice';
import { ShareFooter } from '@/components/ShareFooter';
import { LOCAL_DATE_HEADER, SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId, track } from '@/lib/analytics/track.client';
import { attachable } from '@/lib/chat/attachmentView';
import { dayOffset } from '@/lib/history/dates';
import { useT } from '@/lib/i18n/LocaleProvider';
import { isLocale } from '@/lib/i18n/locale';
import type { RefusalPayload } from '@/lib/moderation/types';
import { splitChoiceMarker, validateChoice } from '@/lib/reading/choice';
import { isRetryable } from '@/lib/reading/retryable';
import { todayKey } from '@/lib/storage';
import type { Locale } from '@/data/types';

import styles from './HistoryDetail.module.css';

/** What came back from `POST /api/reading/retry/<id>`, once the stream closed. */
type Refill = {
  text: string;
  /**
   * `readings.locale`, off `x-reading-locale` — the language the prose was
   * GENERATED in, which a retry never moves. Defaulted to `reading.locale` when
   * the header is absent or malformed, which is what the route's own comment
   * tells every client to do.
   */
  locale: Locale;
  choice: string | null;
};

type RetryState =
  | { kind: 'idle' }
  /** `painted` is true once prose is on screen, so the waiting label can go. */
  | { kind: 'running'; painted: boolean }
  | { kind: 'done' }
  | { kind: 'error'; message: string }
  /**
   * 404 and 409. **TERMINAL, AND ITS OWN MEMBER FOR EXACTLY THAT REASON**: the
   * button is removed rather than re-offered, because the server has said this
   * row can never be refilled and pressing again would ask the same question and
   * get the same answer.
   */
  | { kind: 'stale' }
  | { kind: 'blocked'; payload: RefusalPayload };

export function HistoryDetail({
  reading,
  cachedTranslation,
  nickname,
}: {
  reading: ReadingViewData;
  /** Read on the server from `translations`, so a second view has no spinner. */
  cachedTranslation: string | null;
  /**
   * V7. `profiles.nickname`, for the share sheet's preview of the
   * "A reading for {nickname}" line the public page renders.
   *
   * Passed in rather than fetched: this is a client component, and the page above
   * it is already doing one primary-key read.
   */
  nickname: string | null;
}) {
  const t = useT();
  const router = useRouter();
  /*
   * FROM THE SERVER PROP, AND THAT IS THE LOAD-BEARING WORD IN THIS FILE. See
   * the header: computing it from the refilled view sets the two streams against
   * each other.
   */
  const needs = reading.locale !== t.locale && reading.body !== null;

  const [prose, setProse] = useState<ReadingProse>(() => {
    if (!needs) return { kind: 'original' };
    if (cachedTranslation) return { kind: 'translated', locale: t.locale, text: cachedTranslation };
    return { kind: 'translating', text: '' };
  });

  const [refill, setRefill] = useState<Refill | null>(null);
  const [retry, setRetry] = useState<RetryState>({ kind: 'idle' });
  const retryAbort = useRef<AbortController | null>(null);
  /**
   * `reading.retried.attempt`, and it counts PRESSES WITHIN ONE PAGE VIEW —
   * nothing persists it. See the prop shape's comment in `events.ts`: the number
   * means something slightly different on each surface, and that is written down
   * rather than normalised.
   */
  const attempt = useRef(0);
  const refusalRef = useRef<HTMLDivElement | null>(null);

  const started = useRef(false);

  useEffect(() => {
    if (!needs || cachedTranslation) return;
    // StrictMode mounts, unmounts and remounts. EACH RUN HERE IS A MODEL CALL.
    if (started.current) return;
    started.current = true;

    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [SESSION_HEADER]: getSessionId(),
            [LOCAL_DATE_HEADER]: todayKey(),
          },
          signal: controller.signal,
          /*
           * NO `targetLocale` IN THE BODY. V2's route resolves the target from
           * `await getLocale()` and never from anything the client says --
           * deliberately, because that is the only way the dev-only `?lang=`
           * override and the session claim cannot disagree. Sending one would be
           * ignored, which is worse than not sending it: it would read as though
           * this component chose the language.
           */
          body: JSON.stringify({ entity: 'reading', entityId: reading.id, field: 'body' }),
        });

        /*
         * 204 IS A REAL ANSWER FROM THIS ROUTE, NOT AN EMPTY 200. V2 returns it
         * when the source is already in the viewer's locale -- unreachable here,
         * since `needs` gated the call -- and when the translation produced
         * nothing at all. `res.ok` is TRUE for a 204, so checking only that would
         * leave the screen on a spinner forever.
         */
        if (!res.ok || res.status === 204 || !res.body) {
          setProse({ kind: 'unavailable' });
          return;
        }

        const stream = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let acc = '';
        for (;;) {
          const { done, value } = await stream.read();
          if (done) break;
          acc += value;
          /*
           * Set the accumulated string, never `setProse(p => ...)`. StrictMode
           * double-invokes updaters and would duplicate every chunk in
           * development -- the same trap `DaySummary` records.
           */
          setProse({ kind: 'translating', text: acc });
        }

        setProse(resolveStreamed(acc, reading.body, t.locale));
      } catch {
        if (!controller.signal.aborted) setProse({ kind: 'unavailable' });
      }
    })();

    return () => controller.abort();
  }, [needs, cachedTranslation, reading.id, reading.body, t.locale]);

  /*
   * Leaving the page mid-refill aborts it, which is what turns the catch below
   * into `reading.aborted { reason: 'user' }` rather than a failure. The empty
   * dependency list is deliberate: this is unmount, not a reaction to state.
   */
  useEffect(() => () => retryAbort.current?.abort(), []);

  /*
   * THE REFUSAL SCROLLS ITSELF INTO VIEW, ONCE. It renders ABOVE the reading and
   * the press that produced it may have happened at the bottom of a long scroll,
   * so without this the querent presses a button and nothing appears to happen.
   * Keyed on `retry.kind` and not on the payload, so a second refusal for the
   * same reason does not re-scroll a page the querent has since moved.
   */
  useEffect(() => {
    if (retry.kind !== 'blocked') return;
    refusalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [retry.kind]);

  const runRetry = useCallback(async () => {
    retryAbort.current?.abort();
    const controller = new AbortController();
    retryAbort.current = controller;

    attempt.current += 1;
    track('reading.retried', {
      reader_id: reading.readerId,
      service_id: reading.serviceId,
      attempt: attempt.current,
      surface: 'history',
      /*
       * NOT NULL HERE, unlike the draw screen's. A refill keeps the id it is
       * refilling; a draw-screen retry mints a new one that does not exist when
       * the button is pressed.
       */
      reading_id: reading.id,
      prior_status: reading.status,
      age_days: dayOffset(todayKey(), reading.localDate),
    });

    setRetry({ kind: 'running', painted: false });

    const requestedAt = Date.now();
    let firstByteMs: number | null = null;

    try {
      const res = await fetch(`/api/reading/retry/${reading.id}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: getSessionId(),
          // The device's own calendar day. The server cannot compute it, and
          // getting it wrong dates a third of every Jakarta evening to the day
          // before -- roadmap §7.
          [LOCAL_DATE_HEADER]: todayKey(),
        },
        signal: controller.signal,
        /*
         * **NO PICKS AND NO QUESTION.** The route reads the hand from
         * `reading_cards` and the question from `readings.question`, so a
         * tampered client cannot re-draw or re-ask — which is why the handler
         * never calls `request.json()` at all. The empty object is sent only so
         * the `content-type` above is not a lie.
         */
        body: '{}',
      });

      if (res.status === 401) {
        // The cookie expired while the page was open. Nothing to show.
        track('auth.session_expired', { at_path: window.location.pathname });
        router.replace('/login');
        return;
      }
      if (res.status === 429) {
        track('reading.rate_limited', {
          reader_id: reading.readerId,
          service_id: reading.serviceId,
          retry_after_s: Number(res.headers.get('retry-after') ?? 0),
          /*
           * `'unknown'` because the browser IS NOT TOLD which ceiling it hit,
           * deliberately: all of them answer with identical copy so that telling
           * the querent does not tell a prober which one to work around.
           */
          limit: 'unknown',
        });
        setRetry({ kind: 'error', message: t('reading.error.rateLimit') });
        return;
      }
      /*
       * THE MODERATION REFUSAL (W7). **THIS BRANCH MUST STAY ABOVE THE `!res.ok`
       * CHECK BELOW**, which would otherwise swallow it as `http_403` and show
       * the generic "could not start" error -- losing the clause link, the crisis
       * resources, and any sign that the app made a deliberate decision rather
       * than falling over.
       *
       * **A REFUSAL ON A RETRY IS A CORRECT OUTCOME, NOT A CONTRADICTION.** The
       * question was classified once, before the first attempt, possibly months
       * ago; the classifier is allowed to have moved since. One `glm-4.5-flash`
       * call per refill is the price of not regenerating a stored question with
       * no gate on it. The row is left untouched, so the control comes back.
       *
       * `403` is also what an un-onboarded caller gets from middleware, so the
       * BODY is what distinguishes them: a refusal carries
       * `error: 'moderation_blocked'`, and anything else 403-shaped falls through
       * to the generic path on purpose.
       */
      if (res.status === 403) {
        const payload = await res.json().catch(() => null);
        if (payload?.error === 'moderation_blocked') {
          /*
           * No `track()` here. The SERVER already emitted `moderation.refused`
           * with the source, the category and the confidence bucket -- it is the
           * only side that knows them -- and a client copy would double every row
           * in the one table whose counts decide whether the gate is too tight.
           */
          setRetry({ kind: 'blocked', payload: payload as RefusalPayload });
          return;
        }
      }
      /*
       * 404 AND 409 ARE THE SAME TERMINAL ANSWER, AND NEITHER IS AN ERROR TO
       * RETRY. 404 collapses five causes (absent, not yours, blocked,
       * soft-deleted, not a uuid) and 409 means the row is no longer retryable —
       * most likely another tab already refilled it. In both cases the page in
       * front of the querent is stale, so the honest move is to take the control
       * away and say to reload. Deliberately NOT distinguished on screen: the
       * route does not tell us which, on purpose.
       *
       * **500 and 503 are absent from this branch and stay in the generic one
       * below** — those are transient, the row is untouched, and pressing again
       * is the correct thing to do.
       */
      if (res.status === 404 || res.status === 409) {
        setRetry({ kind: 'stale' });
        return;
      }

      if (!res.ok || !res.body) {
        track('reading.failed', {
          reading_id: reading.id,
          reader_id: reading.readerId,
          service_id: reading.serviceId,
          stage: 'connect',
          chars_before_failure: 0,
          // A short classifier, never a message: rule 2 of the taxonomy.
          error_kind: `http_${res.status}`,
          source: 'client',
        });
        setRetry({ kind: 'error', message: t('reading.error.start') });
        return;
      }

      /*
       * `readings.locale`, UNCHANGED — a retry never moves it. **DEFAULTED TO
       * `reading.locale` ON AN ABSENT OR MALFORMED HEADER**, which is what the
       * route's own comment instructs every client to do, and the branch that
       * carries the whole feature if the header is ever dropped.
       */
      const raw = res.headers.get('x-reading-locale');
      const generated: Locale = isLocale(raw) ? raw : reading.locale;
      /*
       * PAINTED WHILE STREAMING ONLY WHEN IT IS ALREADY IN THE VIEWER'S LANGUAGE.
       * Rule 4 forbids showing foreign prose with no translation, and there is no
       * translation of something that does not exist yet — so the mismatch case
       * is delivered whole, held behind `history.retry.otherLanguage`, and picked
       * up as a cached translation on the next view of this page.
       */
      const paintable = generated === t.locale;

      const decoder = new TextDecoder();
      const readerStream = res.body.getReader();
      /*
       * `wire` IS THE WIRE AND `text` IS THE SCREEN. The reader may open — or, as
       * of 2026-08-20, close — with `PILIHAN: Ayam`, a protocol line rather than
       * prose, arriving split across chunks at an arbitrary byte.
       * `splitChoiceMarker` takes the text accumulated SO FAR, not the delta,
       * which is what makes it pure and idempotent. `pending` is why the paint is
       * conditional: while the leading bytes could still become the marker,
       * nothing is shown, so it cannot appear for one frame and then vanish.
       */
      let wire = '';
      let text = '';

      for (;;) {
        const { done, value } = await readerStream.read();
        if (done) break;
        if (firstByteMs === null) firstByteMs = Date.now() - requestedAt;
        wire += decoder.decode(value, { stream: true });
        const split = splitChoiceMarker(wire, false, reading.question);
        if (split.pending) continue;
        text = split.body;
        if (paintable) {
          setRefill({ text, locale: generated, choice: null });
          setRetry({ kind: 'running', painted: true });
        }
      }
      wire += decoder.decode();

      /*
       * `done: true` IS THE FLUSH. A stream that died four characters into the
       * marker must still show what it managed to send, so nothing may be held
       * back here -- and it is also the call that yields the choice.
       */
      const finalSplit = splitChoiceMarker(wire, true, reading.question);
      text = finalSplit.body;
      /*
       * VALIDATED ON THIS SIDE TOO, against the same stored question the server
       * validated against. NOT the authority -- the server's row is -- but
       * rendering the model's unvalidated word would put model-controlled text in
       * a highlighted box on the querent's screen.
       */
      const choice = validateChoice(finalSplit.choice, reading.question);

      setRefill({ text, locale: generated, choice });
      setRetry({ kind: 'done' });

      /*
       * The client cannot know the token counts or whether the stored copy was
       * truncated, and it deliberately does not guess. `source: 'client'` and the
       * same `reading_id` as the server's copy: that independence is the loss
       * detector, and for a refill it is also what makes the SECOND
       * `reading.completed` on one id identifiable — `reading.retried` with
       * `surface: 'history'` is the discriminator.
       */
      track('reading.completed', {
        reading_id: reading.id,
        reader_id: reading.readerId,
        service_id: reading.serviceId,
        latency_ms: firstByteMs ?? -1,
        total_ms: Date.now() - requestedAt,
        chars: text.length,
        token_input: null,
        token_output: null,
        truncated: false,
        status: 'ok',
        source: 'client',
        choice: finalSplit.choice === null ? 'none' : choice === null ? 'invalid' : 'valid',
        choice_length: finalSplit.choice?.length ?? 0,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        // Unmount and a second press both abort, and both are the querent's.
        track('reading.aborted', {
          reading_id: reading.id,
          chars_before_abort: 0,
          reason: 'user',
          source: 'client',
        });
        return;
      }
      console.error(err);
      track('reading.failed', {
        reading_id: reading.id,
        reader_id: reading.readerId,
        service_id: reading.serviceId,
        stage: firstByteMs === null ? 'connect' : 'stream',
        chars_before_failure: 0,
        error_kind: 'network',
        source: 'client',
      });
      setRetry({ kind: 'error', message: t('reading.error.network') });
    }
  }, [reading, router, t]);

  const { view, prose: refillProse } = refillView(reading, refill, t.locale);
  /*
   * THE REFILL'S DECISION WINS WHEN THERE IS ONE. `prose` is V2's answer about
   * the SERVER's body; once a refill has landed, the body on screen is the
   * refill's and `refillView` is the only thing that may speak for it.
   */
  const shownProse = refillProse ?? prose;

  /*
   * FROM THE SERVER ROW, NOT FROM `view` — so a successful refill takes the
   * button away for the life of the page without a refetch.
   *
   * **`deletedAt` IS NOT PASSED, AND THE OMISSION IS THE POINT.** It is optional
   * on `RetryCandidate` precisely so a client can omit it: `readingWithCards`
   * already filtered `deleted_at IS NULL` server-side, and hardcoding `null`
   * here would be this file asserting a server fact it cannot observe.
   *
   * **`cardCount` IS REQUIRED, NOT DECORATION.** A `blocked` reading has
   * `body IS NULL` and no `reading_cards` rows at all, so `hasBody` alone would
   * admit it.
   */
  const canRetry = isRetryable({
    status: reading.status,
    hasBody: reading.body !== null,
    cardCount: reading.cards.length,
  });

  return (
    <>
      {/*
        THE REFUSAL RENDERS ABOVE THE READING, AND **NEVER IN `ReadingView`'s
        `footer` SLOT**. That slot renders directly under
        `common.disclaimer.long`, and a self-harm refusal placed under "this is
        for entertainment only" is the one arrangement of these two blocks that is
        actually obscene. Above the reading it is the first thing on screen, which
        is also what the scroll effect above is for.
      */}
      {retry.kind === 'blocked' ? (
        <div ref={refusalRef}>
          <RefusalNotice payload={retry.payload} />
        </div>
      ) : null}

      <ReadingView
        reading={view}
        prose={shownProse}
        /*
         * V7's SECOND MOUNT (VD10). Offered only for a reading a stranger could
         * actually read: `ok` and a body. `/history` deliberately SHOWS `partial`,
         * `failed` and `aborted` rows -- the querent drew those cards -- and none of
         * them is shareable, so the condition here is narrower than the list's on
         * purpose rather than by omission. `createShareLink` refuses the same set
         * server-side, which is what makes this a UI decision rather than the
         * enforcement.
         *
         * **BOTH CONDITIONS BELOW READ `view`, NOT `reading`.** A refilled reading
         * is a reading with prose, and both routes re-check server-side from the
         * stored row -- so offering the controls on the strength of what is on
         * screen is a UI decision the server still gets to refuse.
         *
         * IN THE `footer` SLOT, not appended after the component: that is the slot's
         * whole reason for existing, and it keeps the disclaimer the last thing above
         * the share control in every mount.
         */
        footer={
          <>
          {/*
            F6's TASK 7. *Bahas di grup*, and this page's ONLY route into the room —
            `C-D17` puts the chat button on `/history` and deliberately NOT on
            `/history/[id]`, whose whole affordance is the back link and a reading that
            may be mid-translation (F6's D7). Recorded so nobody "fixes" it by adding a
            `ChatButton` here.

            **`attachable()` AND NOT A SECOND COPY OF THE CONDITION BELOW**, although the
            two happen to admit the same rows today. It is a pure predicate with a unit
            test, it says `[F6-12]`'s UI half in one place, and it is one `trim()` wider
            than `status === 'ok' && body !== null` — a body of whitespace is not a state
            this app produces, and a predicate should say what it means rather than what
            the column happens to hold. `partial` is refused HERE and accepted by the
            route, which is the asymmetry §2.3 argues at length: this page KNOWS the
            status, and a `partial` body is prose that stops mid-sentence — three readers
            cannot tell "the stream died" from "this reader is incoherent" any better than
            `ShareFooter`'s stranger could, and one of them will say so in a bubble.

            **ABOVE `ShareFooter`.** The private action above the public one: attaching
            shows a reading to three characters who already hold the querent's six
            onboarding answers; sharing puts it on the public internet (`[F6-11]`). They
            are adjacent on screen and must never converge.
          */}
          {attachable(view) ? (
            <AttachReadingLink readingId={view.id} from="history" />
          ) : null}
          {view.status === 'ok' && view.body !== null ? (
            <ShareFooter
              entity="reading"
              entityId={view.id}
              preview={view}
              /*
               * **THE SAME `prose` THIS COMPONENT IS RENDERING, and it is what makes
               * the sheet's "exactly what they will see" true rather than nearly
               * true.** Since design A the link pins the locale being read and the
               * public page renders that translation, so a sheet given only
               * `preview` would show `reading.body` -- the Indonesian source --
               * under a link that will show English. `previewReadingView` maps the
               * five states; this mount just has to be honest about which one it is
               * in.
               */
              prose={shownProse}
              nickname={nickname}
            />
          ) : null}
          {/*
            THE REFILL CONTROL, LAST IN THE FOOTER — which costs nothing, because
            for exactly the rows `canRetry` admits the two blocks above render
            nothing at all (no body means nothing to attach and nothing to share).

            `'stale'`, `'running'` and `'done'` are ABSENT from the button's own
            branch on purpose, and `'stale'` being its own state rather than an
            `'error'` with different copy is the whole reason for that member: the
            server has said this row can never be refilled, so re-offering the
            press would be offering a refusal.
          */}
          {canRetry ? (
            <div className={styles.retryBlock}>
              {retry.kind === 'running' && !retry.painted ? (
                <p className={styles.waiting}>{t('history.retry.waiting')}</p>
              ) : null}
              {retry.kind === 'error' ? <p className={styles.error}>{retry.message}</p> : null}
              {retry.kind === 'stale' ? (
                <p className={styles.error}>{t('history.retry.stale')}</p>
              ) : null}
              {retry.kind === 'done' && refill !== null && refill.locale !== t.locale ? (
                <p className={styles.otherLanguage}>{t('history.retry.otherLanguage')}</p>
              ) : null}
              {retry.kind === 'idle' || retry.kind === 'error' ? (
                <>
                  <button
                    type="button"
                    className={styles.retry}
                    onClick={() => void runRetry()}
                  >
                    {t('history.retry.action')}
                  </button>
                  <p className={styles.hint}>{t('history.retry.hint')}</p>
                </>
              ) : null}
            </div>
          ) : null}
          </>
        }
        onCardOpened={(c) =>
          track('draw.card_detail_opened', {
            card_id: c.cardId,
            reversed: c.reversed,
            slot: c.position,
            /*
             * FALSE, AND IT IS NOT A LIE. `during_reading` asks whether the stream
             * was live when the card was opened. In history it never is -- a REFILL
             * does not change that either: the querent is looking at a card on a
             * history page. Reusing the existing event rather than minting a tenth
             * name keeps "how often does anyone look at a card properly" one query.
             */
            during_reading: false,
          })
        }
      />
    </>
  );
}

/**
 * THE REFILLED READING, AND THE PROSE DECISION THAT GOES WITH IT.
 *
 * **THIS FUNCTION IS WHERE `ReadingView`'s RULE 4 SURVIVES THE REFILL, AND IT IS
 * EXPORTED AND UNIT-TESTED FOR EXACTLY THAT REASON.** Rule 4 — never render
 * `reading.body` when `reading.locale` differs from the viewer's and no
 * translation was supplied — is the RENDERER's invariant rather than the
 * caller's discipline, and the refill is the one path that hands the renderer a
 * body the server did not send. A truth table in `HistoryDetail.test.ts` holds
 * it, because the component itself is unreachable from the unit project.
 *
 * ── WHY A COPY OF THE READING AND NOT JUST THE `prose` PROP ──────────────────
 *
 * `resolveProse` short-circuits to `{ kind: 'unavailable' }` whenever
 * `reading.body === null`, WHATEVER the caller passed — deliberately, so an
 * empty row can never be dressed up as prose. So a refill handed in through
 * `prose` alone paints nothing at all. The body has to move onto the reading.
 *
 * ── WHY `as-written` AND NEVER `original` ────────────────────────────────────
 *
 * On a language mismatch this returns V7's `{ kind: 'as-written' }`: a NAMED
 * decision to show the prose in the language it came out in, which `ReadingView`
 * renders with a `lang` attribute. It must NEVER return `{ kind: 'original' }` —
 * `resolveProse` treats that identically to an omitted prop, so it would put
 * Indonesian prose in the English app through the very function written to stop
 * that. It never returns `translated` either: nothing was translated.
 *
 * `status: 'ok'` on the copy is the same claim `Draw.tsx` makes when its stream
 * ends normally, and `attachable()` and `ShareFooter`'s condition both read it.
 * `choice` falls back to the stored one, so a refill that produced no marker
 * does not erase a verdict the row already carried.
 */
export function refillView(
  reading: ReadingViewData,
  refill: Refill | null,
  viewer: Locale,
): { view: ReadingViewData; prose: ReadingProse | null } {
  // IDENTITY, not a copy. Nothing has happened yet, so nothing should re-render.
  if (refill === null) return { view: reading, prose: null };

  const view: ReadingViewData = {
    ...reading,
    body: refill.text,
    locale: refill.locale,
    status: 'ok',
    choice: refill.choice ?? reading.choice,
  };

  return { view, prose: refill.locale === viewer ? null : { kind: 'as-written' } };
}

/**
 * WHAT THE STREAM ACTUALLY DELIVERED, AND THE ONE CASE THE WIRE CANNOT TELL US.
 *
 * `translateStream` **yields the source verbatim on every failure it knows
 * about** — that is V2's deliberate choice, so a viewer sees prose rather than
 * nothing, and it is documented on `TranslateResult.fellBack`. The route then
 * returns it as an ordinary 200, so a fallback and a success are byte-identical
 * on the wire.
 *
 * For `/history/[id]` that would be a direct breach of H3: the English app would
 * show the Indonesian body, arriving through the very path that exists to
 * prevent exactly that. We can detect it exactly and for free, because this
 * component is holding the source — if what came back IS the source, no
 * translation happened.
 *
 * Compared after trimming and nothing else. A translation that happened to equal
 * its source would be a translation into the same language, which the route's
 * own 204 branch and the table's `source_locale <> locale` check both forbid.
 */
function resolveStreamed(streamed: string, source: string | null, target: Locale): ReadingProse {
  const text = streamed.trim();
  if (!text) return { kind: 'unavailable' };
  if (source !== null && text === source.trim()) return { kind: 'unavailable' };
  return { kind: 'translated', locale: target, text: streamed };
}
