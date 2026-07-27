'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CardDetail } from '@/components/CardDetail';
import { Fan } from '@/components/Fan';
import { ReadingPanel, type ReadingState } from '@/components/ReadingPanel';
import { Slots } from '@/components/Slots';
import { CARDS, shuffleDeck } from '@/data/deck';
import { slotLabels } from '@/data/services';
import type { Draw as DrawnCard, Reader, Service } from '@/data/types';
import { useT } from '@/lib/i18n/LocaleProvider';
import { togglePick } from '@/lib/draw';
import { LOCAL_DATE_HEADER, SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId, track } from '@/lib/analytics/track.client';
import { todayKey } from '@/lib/storage';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import { MAX_QUESTION_LENGTH } from '@/lib/prompt/sanitize';
import { motion } from '@/theme/tokens';
import styles from './page.module.css';

export function Draw({ reader, service }: { reader: Reader; service: Service }) {
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
          });
          setReading({
            status: 'error',
            message: t('reading.error.rateLimit'),
          });
          return;
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
        let text = '';

        for (;;) {
          const { done, value } = await readerStream.read();
          if (done) break;
          if (firstByteMs === null) firstByteMs = Date.now() - requestedAt;
          text += decoder.decode(value, { stream: true });
          setReading({ status: 'streaming', text });
        }
        text += decoder.decode();
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
          });
          requestReading(picks, question);
        }}
      />

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
