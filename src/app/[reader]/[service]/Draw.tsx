'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AttachReadingLink } from '@/components/AttachReadingLink';
import { CardDetail } from '@/components/CardDetail';
import { Fan } from '@/components/Fan';
import { ReadingActions } from '@/components/ReadingActions';
import { ReadingPanel, type ReadingState } from '@/components/ReadingPanel';
import { Slots } from '@/components/Slots';
import { CARDS, effectiveYesNo, shuffleDeck } from '@/data/deck';
import { splitChoiceMarker, validateChoice } from '@/lib/reading/choice';
import { slotLabels } from '@/data/services';
import type { Draw as DrawnCard, Reader, Service, YesNo } from '@/data/types';
import { useT } from '@/lib/i18n/LocaleProvider';
import { togglePick } from '@/lib/draw';
import { LOCAL_DATE_HEADER, SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId, track } from '@/lib/analytics/track.client';
import { todayKey } from '@/lib/storage';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import { MAX_QUESTION_LENGTH } from '@/lib/prompt/sanitize';
import { motion } from '@/theme/tokens';
import styles from './page.module.css';

export function Draw({
  reader,
  service,
  nickname,
}: {
  reader: Reader;
  service: Service;
  /**
   * `profiles.nickname`, for the share sheet's toggle and its preview line.
   *
   * **THIS PROP IS A BUG FIX, NOT A FEATURE.** Without it the sheet's
   * "Include my nickname" switch is permanently disabled on this screen while its
   * state stays `true`, so the mint claims a consent the querent was never asked
   * for. The page's comment has the full account. Null is legitimate — a querent
   * who set no nickname — and disables the toggle honestly, because
   * `effectiveIncludeNickname` makes the wire agree with the dead control.
   */
  nickname: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const cardCount = service.cardCount;
  const labels = slotLabels(service, reader, t.locale);

  /*
   * The deck starts in a FIXED order and is shuffled in an effect, after
   * hydration. This looks like an unnecessary two-step and is not.
   *
   * Shuffling in the useState initialiser -- the obvious way -- runs
   * shuffleDeck() on the server AND again on the client, producing two
   * different decks. React cannot patch up attribute mismatches during
   * hydration, so the DOM keeps the SERVER's cards while component state holds
   * the CLIENT's. The querent then sees one set of cards and is read a
   * different set, with nothing on screen to suggest anything is wrong. That
   * is a production bug, not a dev-mode artefact.
   *
   * Starting fixed makes the server and client agree exactly, and the shuffle
   * lands before anyone can touch a card. Nothing flashes, because every card
   * is face down until it is picked.
   */
  const [deck, setDeck] = useState<DrawnCard[]>(() =>
    CARDS.map((card) => ({ card, reversed: false })),
  );

  useEffect(() => {
    setDeck(shuffleDeck());
  }, []);
  const [picks, setPicks] = useState<number[]>([]);
  const [question, setQuestion] = useState('');
  const [reading, setReading] = useState<ReadingState>({ status: 'idle' });
  /**
   * V7. What the share footer needs about the reading that just finished.
   *
   * **A REF AND NOT STATE, DELIBERATELY.** `requestReading` writes these while the
   * stream is running, and a `setState` in that function would re-render mid-stream
   * -- which is the whole reason `readingId` was a local variable in the first
   * place. The footer only reads them once `reading.status === 'done'`, i.e. after
   * the last `setReading`, so the ref's value is always current by the time
   * anything renders it.
   *
   * `id` COMES OFF THE `x-reading-id` HEADER and is `'unknown'` until the headers
   * land. The footer is only offered when it is a real id, because minting a link
   * for `'unknown'` is a 404 the sharer caused.
   *
   * `atIso` and `localDate` are captured HERE rather than read during render:
   * `new Date()` and `todayKey()` differ between the server render and the client
   * hydration, and React cannot patch a mismatch -- the same class as
   * `shuffleDeck()` in a `useState` initialiser, which the deck above exists to
   * avoid.
   */
  const finished = useRef<{
    id: string;
    atIso: string;
    localDate: string;
    question: string | null;
    /**
     * The option the cards chose, validated against the question — or null, which
     * is almost every reading.
     *
     * **CAPTURED HERE FOR THE SAME REASON `verdict` IS DERIVED IN `verdictFor`:**
     * the share preview must show what the public page will show. It cannot be
     * derived, though — a choice is a word out of the querent's own question and no
     * pure function of the cards can produce it — so it is lifted off the stream and
     * kept, which is the one fact on this screen that arrives only from the model.
     */
    choice: string | null;
    cards: DrawnCard[];
  } | null>(null);
  /** Index into `deck` of the card whose detail overlay is open, if any. */
  const [detail, setDetail] = useState<number | null>(null);

  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const reduceMotion = usePrefersReducedMotion();

  /** When this draw began, for `draw.completed.elapsed_ms`. Reset by a reshuffle. */
  const drawStartedAt = useRef(Date.now());
  /** `reading.retried.attempt`, so a retry loop is visible as one. */
  const attempt = useRef(0);
  /**
   * StrictMode double-invokes effects. Without this guard every draw is counted
   * twice in development and once in production -- the worst kind of
   * measurement bug, because the numbers are wrong only where you look at them.
   */
  const startedFired = useRef(false);

  useEffect(() => {
    if (startedFired.current) return;
    startedFired.current = true;
    drawStartedAt.current = Date.now();
    track('draw.started', {
      reader_id: reader.id,
      service_id: service.id,
      card_count: cardCount,
      reduced_motion: reduceMotion,
    });
    // Mount only: `reduceMotion` is recorded as it stood when the draw began,
    // which is the layout the querent actually got.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * A mirror of `deck`, refreshed on every render, so the request is always
   * built from the same array the screen is showing.
   *
   * This is load-bearing. The first version passed `deck` into the request
   * through the effect's closure, and under StrictMode the closure and the
   * rendered array could be two different shuffles -- shuffleDeck() is
   * impure, so double-invocation produces two decks. The result was the worst
   * possible failure: the screen showed The Fool, The Empress and Strength
   * while the request sent ids 15, 17 and 3, so the reader confidently
   * interpreted three cards the querent never drew. Everything looked fine.
   * Caught only by diffing the request body against the rendered alt text.
   */
  const deckRef = useRef(deck);
  deckRef.current = deck;

  const complete = picks.length === cardCount;
  const busy = reading.status === 'waiting' || reading.status === 'streaming';

  /*
   * A tap means one of two things.
   *
   * On a card still in the fan it is a pick. On a card already picked it opens
   * the detail overlay rather than returning the card -- at 88x132 the art is
   * too small to read, so the first thing anyone wants after drawing is a
   * proper look at what they drew. Returning a card is still possible, from a
   * button inside that overlay.
   *
   * Only picking is gated on the reading being idle. Once a reading is under
   * way the draw is settled -- changing it would leave the cards on screen
   * disagreeing with the text below them -- but looking at a card is exactly
   * what the querent is doing while they read.
   */
  /*
   * TWO ANALYTICS RULES APPLY TO EVERYTHING BELOW, and both are CLAUDE.md traps
   * that already cost this project a debugging session in their non-analytics
   * form:
   *
   *   1. READ THE CARD FROM `deckRef.current`, NEVER FROM `deck`. Under
   *      StrictMode the closure's deck and the rendered deck can be two
   *      different shuffles, and an event that names the wrong card is the
   *      SILENT version of the bug that made the screen and the request
   *      disagree.
   *   2. NEVER CALL track() INSIDE A setState UPDATER. Updaters are
   *      double-invoked, so the event would fire twice and the count would be
   *      wrong in development only. The call goes in the callback body, before
   *      setPicks.
   */
  const tapCard = useCallback(
    (index: number) => {
      const drawn = deckRef.current[index];
      if (!drawn) return;

      if (picks.includes(index)) {
        track('draw.card_detail_opened', {
          card_id: drawn.card.id,
          reversed: drawn.reversed,
          slot: picks.indexOf(index),
          during_reading: reading.status !== 'idle',
        });
        setDetail(index);
        return;
      }
      if (reading.status !== 'idle') return;
      // togglePick no-ops past cardCount, so a stray tap on a full spread must
      // not record a pick that did not happen.
      if (picks.length >= cardCount) return;

      track('draw.card_picked', {
        reader_id: reader.id,
        service_id: service.id,
        card_id: drawn.card.id,
        reversed: drawn.reversed,
        slot: picks.length,
      });
      setPicks((prev) => togglePick(prev, index, cardCount));
    },
    [cardCount, picks, reading.status, reader.id, service.id],
  );

  const returnCard = useCallback(
    (index: number) => {
      setDetail(null);
      if (reading.status !== 'idle') return;

      const drawn = deckRef.current[index];
      if (drawn) {
        track('draw.card_returned', { card_id: drawn.card.id, slot: picks.indexOf(index) });
      }
      setPicks((prev) => togglePick(prev, index, cardCount));
    },
    [cardCount, picks, reading.status],
  );

  const requestReading = useCallback(
    async (chosen: number[], q: string) => {
      const deckNow = deckRef.current;
      // Indices come from a render that may predate a reshuffle. Refuse rather
      // than send a card the querent did not draw.
      if (chosen.some((i) => !deckNow[i])) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setReading({ status: 'waiting' });

      const trimmed = q.trim();
      if (!trimmed) {
        track('question.skipped', { reader_id: reader.id, service_id: service.id });
      }

      /*
       * The client's own view of the request, reported through /api/events --
       * a DIFFERENT route, a different request and a different after() from the
       * server's copy. That independence is the entire loss-detection mechanism
       * (plan §10): a client `reading.completed` with no matching `readings` row
       * means an invocation was killed before it could write.
       *
       * `reading_id` comes off the `x-reading-id` response header, so it does
       * not exist until the headers land -- which is why there is no client-side
       * `reading.requested`, and why a pre-headers failure reports 'unknown'.
       */
      let readingId = 'unknown';
      const requestedAt = Date.now();
      let firstByteMs: number | null = null;

      try {
        const res = await fetch('/api/reading', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [SESSION_HEADER]: getSessionId(),
            // The device's own calendar day. The server cannot compute it, and
            // getting it wrong dates a third of every Jakarta evening to the
            // day before -- roadmap §7.
            [LOCAL_DATE_HEADER]: todayKey(),
          },
          signal: controller.signal,
          body: JSON.stringify({
            reader: reader.id,
            service: service.id,
            // Ids and orientation only. The server re-derives every word of
            // card text from cards.json.
            picks: chosen.map((i) => ({
              id: deckNow[i].card.id,
              reversed: deckNow[i].reversed,
            })),
            question: trimmed || undefined,
          }),
        });

        readingId = res.headers.get('x-reading-id') ?? readingId;

        if (res.status === 401) {
          // The cookie expired mid-session. Nothing to show; send them back.
          track('auth.session_expired', { at_path: window.location.pathname });
          router.replace('/login');
          return;
        }
        if (res.status === 429) {
          track('reading.rate_limited', {
            reader_id: reader.id,
            service_id: service.id,
            retry_after_s: Number(res.headers.get('retry-after') ?? 0),
            /*
             * `'unknown'` because the browser IS NOT TOLD which of the four
             * ceilings it hit, deliberately: all four answer with identical copy
             * so that telling the querent does not tell a prober which one to work
             * around. The server's own copy of this event carries the real value.
             */
            limit: 'unknown',
          });
          setReading({
            status: 'error',
            message: t('reading.error.rateLimit'),
          });
          return;
        }
        /*
         * THE MODERATION REFUSAL (W7). **THIS BRANCH MUST STAY ABOVE THE
         * `!res.ok` CHECK BELOW**, which would otherwise swallow it as
         * `http_403` and show the generic "could not start" error -- losing the
         * clause link, the crisis resources, and any sign that the app made a
         * deliberate decision rather than falling over.
         *
         * `403` is also what an un-onboarded caller gets from middleware, so the
         * body is what distinguishes them: a refusal carries
         * `error: 'moderation_blocked'`, and anything else 403-shaped falls
         * through to the generic path on purpose.
         */
        if (res.status === 403) {
          const payload = await res.json().catch(() => null);
          if (payload?.error === 'moderation_blocked') {
            /*
             * No `track()` here. The SERVER already emitted `moderation.refused`
             * with the source, the category and the confidence bucket -- it is
             * the only side that knows them -- and a client copy would double
             * every row in the one table whose counts decide whether the gate is
             * too tight.
             */
            setReading({ status: 'blocked', payload });
            /*
             * **THE DRAW IS NOT RESET** (§3.5). Refusing the reading is not
             * refusing the draw: the fan and the picked cards stay exactly as
             * they are, so the existing return-card affordance is available
             * again and the querent can pull a card back, rewrite the question
             * and try something else. Calling the reset here would look tidy and
             * would take the recovery path away.
             */
            return;
          }
        }

        if (!res.ok || !res.body) {
          track('reading.failed', {
            reading_id: readingId,
            reader_id: reader.id,
            service_id: service.id,
            stage: 'connect',
            chars_before_failure: 0,
            // A short classifier, never a message: rule 2 of the taxonomy.
            error_kind: `http_${res.status}`,
            source: 'client',
          });
          setReading({
            status: 'error',
            message: t('reading.error.start'),
          });
          return;
        }

        const decoder = new TextDecoder();
        const readerStream = res.body.getReader();
        /*
         * `raw` IS THE WIRE AND `text` IS THE SCREEN, AND KEEPING THEM APART IS THE
         * WHOLE OF THE CHOICE MARKER'S CLIENT SIDE.
         *
         * The reader may open with `PILIHAN: Ayam\n\n` — a protocol line, not prose
         * — and it arrives split across chunks at an arbitrary byte.
         * `splitChoiceMarker` is handed the text accumulated SO FAR, not the delta,
         * which is what makes it pure and idempotent: there is no state to carry
         * between chunks and nothing to reset between readings. The server runs the
         * same function once over the finished body.
         *
         * **`pending` IS WHY THERE IS AN `if` AND NOT AN UNCONDITIONAL
         * `setReading`.** While the leading bytes could still become the marker,
         * nothing is painted, so the marker cannot appear for one frame and then
         * vanish. For an ordinary reading the very first chunk decides — `Y` is not
         * `P` — so this costs nothing and the behaviour is byte-identical to before.
         *
         * `firstByteMs` is still the FIRST BYTE off the wire, deliberately: it feeds
         * `latency_ms`, whose documented meaning is time to first token, and
         * re-pointing it at the first PROSE byte would make one column mean two
         * things depending on whether a reading had a marker.
         */
        let raw = '';
        let text = '';

        for (;;) {
          const { done, value } = await readerStream.read();
          if (done) break;
          if (firstByteMs === null) firstByteMs = Date.now() - requestedAt;
          raw += decoder.decode(value, { stream: true });
          /*
           * `trimmed` is passed because the marker turned up on the LAST line once
           * (2026-08-20, `glm-4.6`), and stripping it there is only safe when the
           * candidate is one of the querent's own options -- see
           * `splitTrailingMarker`. The leading marker needs no question and never did.
           */
          const split = splitChoiceMarker(raw, false, trimmed || null);
          if (!split.pending) {
            text = split.body;
            setReading({ status: 'streaming', text });
          }
        }
        raw += decoder.decode();

        /*
         * `done: true` IS THE FLUSH. A stream that died four characters into the
         * marker must still show what it managed to send, so nothing may be held
         * back here — and it is also the call that yields the choice for the share
         * preview below.
         */
        const finalSplit = splitChoiceMarker(raw, true, trimmed || null);
        text = finalSplit.body;
        /*
         * VALIDATED ON THIS SIDE TOO, against the same sanitized-ish question the
         * server validated against. This is NOT the authority — the server's row is,
         * and it revalidates from `readings.question` — but rendering the model's
         * unvalidated word here would put model-controlled text in a highlighted box
         * on the querent's screen, which is the thing `validateChoice` exists to make
         * impossible on every surface rather than on the persisted ones.
         */
        const choice = validateChoice(finalSplit.choice, trimmed || null);

        /*
         * V7. CAPTURED HERE, BEFORE THE LAST `setReading`, so the footer that
         * renders on the next paint already has everything it needs. `Date.now()`
         * and `todayKey()` are read on this line rather than during a render, for
         * the reason the ref's own comment gives.
         *
         * `chosen` rather than `picks` and `deckNow` rather than `deck`: both were
         * snapshotted at the top of this function against exactly the hand that was
         * SENT, which is the same discipline the `picks` body uses. Reading them off
         * state here would be reading a render that may predate a reshuffle.
         */
        finished.current = {
          id: readingId,
          atIso: new Date().toISOString(),
          localDate: todayKey(),
          question: trimmed || null,
          choice,
          cards: chosen.map((i) => deckNow[i]!),
        };

        setReading({ status: 'done', text });

        /*
         * The client cannot know the token counts or whether the stored copy was
         * truncated, and it deliberately does not guess: those are the server's
         * to record. `status: 'ok'` here means "the stream ended normally as far
         * as the browser is concerned" -- if the server appended its interrupted
         * notice, ITS row and ITS event say `partial`, and the disagreement
         * between the two copies is information rather than a contradiction.
         */
        track('reading.completed', {
          reading_id: readingId,
          reader_id: reader.id,
          service_id: service.id,
          latency_ms: firstByteMs ?? -1,
          total_ms: Date.now() - requestedAt,
          chars: text.length,
          token_input: null,
          token_output: null,
          truncated: false,
          status: 'ok',
          source: 'client',
          /*
           * THE CLIENT'S OWN VERDICT ON THE MARKER, not a copy of the server's --
           * which it could not be, since the two never exchange it. The browser
           * validates against the question in its own textarea and the server
           * against the stored `readings.question`; those are the same string, so
           * the two copies of this event must agree, and this pair is the only
           * place a divergence would surface. That is the same argument the header
           * makes about `status`.
           *
           * `chars: text.length` above is the PROSE length here, because `text` is
           * already the stripped body -- the server's copy counts what the tee saw
           * on the wire. The two were always allowed to disagree; now they disagree
           * by the length of a marker line on the readings that have one.
           */
          choice: finalSplit.choice === null ? 'none' : choice === null ? 'invalid' : 'valid',
          choice_length: finalSplit.choice?.length ?? 0,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          // Draw.tsx aborts on reset, on unmount and on every fresh request, so
          // this is a normal path. `reason` is 'user' because all three are.
          track('reading.aborted', {
            reading_id: readingId,
            chars_before_abort: 0,
            reason: 'user',
            source: 'client',
          });
          return;
        }
        console.error(err);
        track('reading.failed', {
          reading_id: readingId,
          reader_id: reader.id,
          service_id: service.id,
          stage: firstByteMs === null ? 'connect' : 'stream',
          chars_before_failure: 0,
          error_kind: 'network',
          source: 'client',
        });
        setReading({
          status: 'error',
          message: t('reading.error.network'),
        });
      }
    },
    /*
     * `t` is in here because the callback now closes over it. It is memoized on
     * the provider's context value, so in practice it is stable for the life of
     * the page and this changes nothing -- but a locale switch calls
     * `router.refresh()`, which hands the provider a new catalog object and
     * therefore a new `t`, and a callback holding the old one would set an error
     * message in the language the querent just left.
     */
    [reader.id, service.id, router, t],
  );

  /*
   * Fire when the draw completes, after holding motion.settle so the last
   * flip lands before the page starts changing underneath it.
   */
  useEffect(() => {
    if (!complete || reading.status !== 'idle') return;
    track('draw.completed', {
      reader_id: reader.id,
      service_id: service.id,
      elapsed_ms: Date.now() - drawStartedAt.current,
    });
    const timer = setTimeout(
      () => requestReading(picks, question),
      reduceMotion ? 0 : motion.settle,
    );
    return () => clearTimeout(timer);
  }, [
    complete,
    reading.status,
    picks,
    deck,
    question,
    requestReading,
    reduceMotion,
    reader.id,
    service.id,
  ]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = () => {
    track('draw.reshuffled', {
      reader_id: reader.id,
      service_id: service.id,
      picks_discarded: picks.length,
    });
    drawStartedAt.current = Date.now();
    attempt.current = 0;
    abortRef.current?.abort();
    setReading({ status: 'idle' });
    // V7: the footer is gone with the reading, so the snapshot behind it goes too.
    // Leaving it would let a mint fire for the PREVIOUS reading after a reshuffle.
    finished.current = null;
    setPicks([]);
    // Close the overlay before the reshuffle: `detail` is an index into the
    // old deck, and after shuffleDeck() it points at some other card.
    setDetail(null);
    setDeck(shuffleDeck());
  };

  const detailDraw = detail !== null ? deck[detail] : undefined;
  const detailSlot = detail !== null ? picks.indexOf(detail) : -1;

  return (
    <main className={styles.shell}>
      <Link href={`/${reader.id}`} className={styles.back}>
        {t('nav.back.reader', { name: reader.name })}
      </Link>

      <h1 className={styles.title}>{service.name[t.locale]}</h1>
      {/*
        THE COUNT CHECK IS CORRECT HERE AND IS NOT A MISSING `t.plural`.
        `Intl.PluralRules` answers whether the noun inflects, and for `id` the
        answer is always no -- so a `.one`/`.other` family would render
        `Ketuk 1 kartu` at every count, and Indonesian spells that number out.
        "Digit or word" is a different question in a different language and CLDR
        has no opinion about it. English gets its article from the same split:
        `.single` is "Tap a card", not "Tap 1 card". There is a test asserting
        `draw.hint.tap.one` does not exist, so folding this into a plural family
        fails rather than silently regressing the Indonesian.
      */}
      <p className={styles.hint}>
        {complete
          ? t('draw.hint.complete')
          : cardCount === 1
            ? t('draw.hint.tap.single')
            : t('draw.hint.tap.many', { count: cardCount })}
      </p>

      <div className={styles.questionField}>
        <label className={styles.questionLabel} htmlFor="question">
          {t('draw.question.label')}
        </label>
        <input
          id="question"
          className={styles.question}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          /*
           * ON BLUR, NOT ON CHANGE, and the LENGTH, never the text. onChange
           * would be one event per keystroke -- a request per keystroke once the
           * batcher fills -- and the question itself is exactly what rule 1 of
           * the taxonomy forbids in props.
           */
          onBlur={() => {
            if (question.trim().length === 0) return;
            track('question.typed', {
              reader_id: reader.id,
              service_id: service.id,
              length: question.trim().length,
            });
          }}
          maxLength={MAX_QUESTION_LENGTH}
          placeholder={t('draw.question.placeholder')}
          /* Locked once the request is in flight: editing it afterwards would
             imply the reading is answering something it never saw. */
          disabled={reading.status !== 'idle'}
          autoComplete="off"
        />
      </div>

      <Slots
        labels={labels}
        picks={picks.map((i) => deck[i])}
        boxRefs={slotRefs}
        showFaces={reduceMotion}
      />

      <div className={styles.bleed}>
        <Fan
          deck={deck}
          picks={picks}
          cardCount={cardCount}
          onCardTap={tapCard}
          slotRefs={slotRefs}
        />
      </div>

      {detail !== null && detailDraw && detailSlot >= 0 ? (
        <CardDetail
          draw={detailDraw}
          position={labels[detailSlot] ?? labels[0]}
          onClose={() => setDetail(null)}
          onReturn={reading.status === 'idle' ? () => returnCard(detail) : undefined}
        />
      ) : null}

      <ReadingPanel
        state={reading}
        onRetry={() => {
          attempt.current += 1;
          track('reading.retried', {
            reader_id: reader.id,
            service_id: service.id,
            attempt: attempt.current,
            /*
             * `surface` SINCE 2026-08-28, when `/history/[id]` grew a refill and
             * this event stopped having one call site. **The three null-or-zero
             * values below are not fillers.** This retry mints a NEW `readings.id`
             * that does not exist yet, so there is nothing to name; there is no
             * stored row to have had a `prior_status`; and the reading is seconds
             * old, so `age_days` is genuinely 0. See the prop shape in `events.ts`.
             */
            surface: 'draw',
            reading_id: null,
            prior_status: null,
            age_days: 0,
          });
          requestReading(picks, question);
        }}
      />

      {/*
        V7. THE SHARE FOOTER, AND ONLY ON A COMPLETED READING.
        `blocked`, `error` and `aborted` are absent from this condition on purpose:
        a refusal must not be shareable, and a `partial` body is prose that simply
        stops -- a stranger could not tell "the stream died" from "this reader is
        incoherent". The state machine is the first enforcement; `createShareLink`'s
        `status = 'ok'` check is the backstop, and the resolver's `where` is the
        third.

        `finished.current.id !== 'unknown'` because `x-reading-id` may not have
        landed -- minting for a placeholder is a 404 the sharer caused.

        THE MINT MAY BEAT ITS OWN ROW INTO THE TABLE, and that is the SERVER's
        problem rather than this component's: `readings` is written in the reading
        response's own `after()`, so `POST /api/share` retries the artifact lookup
        three times 250ms apart. The footer therefore renders immediately.
      */}
      {reading.status === 'done' && finished.current && finished.current.id !== 'unknown' ? (
        <>
        {/*
          F6's TASK 6. *Bahas di grup*, ABOVE THE SHARE CONTROL AND INSIDE THE SAME
          CONDITION.

          **THE CONDITION IS NOT WIDENED BY ONE CHARACTER, AND ALL THREE CLAUSES ARE
          LOAD-BEARING FOR THIS CONTROL TOO** (`[F6-3]`):

            - `status === 'done'` is `AccountButton`'s reason 2, restated by `C-D17`:
              **a one-tap exit in the corner of a STREAMING page aborts the reading.**
              This component aborts on unmount and records
              `reading.aborted { reason: 'user' }`, so a control that navigated to
              `/chat` mid-stream would destroy the thing it was offering to talk about
              AND book it as the querent's choice — a spike in `reading.aborted` that
              reads as impatience and is one button. `error` and `blocked` are excluded
              for `ShareFooter`'s reason plus one more: a refused question must not
              become a chat message with a reading behind it, because the refusal is
              `RefusalNotice`'s and it is the app speaking, never Thessaly (`C-D13`).
            - `finished.current` is the snapshot `reset()` clears, so a reshuffle takes
              the control with it rather than offering the PREVIOUS reading.
            - `id !== 'unknown'` because `x-reading-id` may not have landed;
              `/chat?attach=unknown` is a 404 the querent caused.

          **ABOVE `ShareFooter`, and outlined where that one is filled.** The private
          action goes above the public one: a thumb scanning downward meets *"show three
          characters who already know me"* before *"put this on the internet"*, and two
          filled gold buttons under a reading is two primaries.

          **`partial` IS INVISIBLE FROM HERE AND THAT IS WHY THE ROUTE ACCEPTS IT.**
          `ReadingState.done` means *"the stream ended normally as far as the browser is
          concerned"*; the tee may independently have written `partial`. Refusing it
          server-side would mean a control correctly offered and then refused — which is
          why `attachablePosted()` is wider than `attachable()` by exactly that value
          (§2.3, `[F6-12]`).
        */}
        <AttachReadingLink readingId={finished.current.id} from="draw" />
        {/*
          2026-08-30. THE SAME SHARE SHEET, NOW ONE ICON IN A ROW OF THREE.

          **`showLanguage` IS NOT PASSED AND MUST NOT BE**, so this file does not
          acquire a `localeSwitcherEnabled()` prop it could only ever pass as `false`.
          `ReadingActions` suppresses the Language row for `surface === 'draw'` in
          code -- roadmap §7 trap 4, whose whole point is that `readings.locale` is
          permanent and `router.refresh()` keeps the finished prose in state. See that
          component's header, and `accountSurface.test.ts` for the assertion.

          The row inherits this block's three clauses exactly. A Home tap unmounts
          `Draw`, which aborts an in-flight reading and records
          `reading.aborted { reason: 'user' }` -- so a row one character wider than
          `status === 'done'` is a button that destroys the thing it sits under.
        */}
        <ReadingActions
          surface="draw"
          share={{
            entity: 'reading',
            entityId: finished.current.id,
            preview: {
              id: finished.current.id,
              readerId: reader.id,
              serviceId: service.id,
              localDate: finished.current.localDate,
              createdAtIso: finished.current.atIso,
              locale: t.locale,
              status: 'ok',
              /*
               * DERIVED WITH THE SAME PURE FUNCTION THE SERVER USES, not guessed and
               * not parsed out of the prose. `effectiveYesNo` is what stored
               * `readings.verdict` at draw time, including the reversal flip, so the
               * preview and the public page cannot disagree -- and `null` for every
               * service that is not `yesno`, which is what the column holds.
               */
              verdict: verdictFor(service, finished.current.cards),
              question: finished.current.question,
              /*
               * LIFTED OFF THE STREAM AND NOT DERIVED, which is the one asymmetry with
               * `verdict` directly above. There is no pure function of the cards that
               * yields `ayam`: the option is a word out of this querent's question and
               * only the model chose between them. Already validated against the
               * question when it was captured.
               */
              choice: finished.current.choice,
              body: reading.text,
              sharedAt: null,
              cards: finished.current.cards.map((d, i) => ({
                cardId: d.card.id,
                reversed: d.reversed,
                position: i,
              })),
            },
            /*
             * `{ kind: 'original' }` AND NOT A GUESS. A reading generated on this
             * screen came out in `t.locale` -- the language the querent is reading
             * right now -- so the pin will equal the source, there is nothing to
             * translate and nothing to look up. `previewReadingView` maps this to
             * `as-written`, which is exactly what the public page will render.
             */
            prose: { kind: 'original' },
            nickname,
          }}
        />
        </>
      ) : null}

      <div className={styles.footer}>
        <span className={styles.counter}>
          {t.plural('draw.counter', picks.length, { picked: picks.length, total: cardCount })}
        </span>
        <button type="button" className={styles.reset} onClick={reset} disabled={busy}>
          {t('draw.reset')}
        </button>
      </div>
    </main>
  );
}

/**
 * The stored verdict, derived rather than guessed.
 *
 * **`effectiveYesNo` IS THE FUNCTION THE SERVER ALREADY USED**, including the
 * reversal flip, so the share preview and the public page cannot disagree about the
 * one fact that survives translation untouched. Deriving it here rather than
 * threading it back out of the response is what makes that true: there is one
 * implementation and it is pure.
 *
 * `null` for every service that is not `yesno`, which is exactly what
 * `readings.verdict` holds -- the column is nullable for this reason and
 * `ReadingView` renders the line only when it is set.
 */
function verdictFor(service: Service, cards: DrawnCard[]): YesNo | null {
  if (service.id !== 'yesno') return null;
  const first = cards[0];
  return first ? effectiveYesNo(first) : null;
}
