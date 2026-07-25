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
import { togglePick } from '@/lib/draw';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import { MAX_QUESTION_LENGTH } from '@/lib/prompt/sanitize';
import { motion } from '@/theme/tokens';
import styles from './page.module.css';

export function Draw({ reader, service }: { reader: Reader; service: Service }) {
  const router = useRouter();
  const cardCount = service.cardCount;
  const labels = slotLabels(service, reader);

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
  const tapCard = useCallback(
    (index: number) => {
      if (picks.includes(index)) {
        setDetail(index);
        return;
      }
      if (reading.status !== 'idle') return;
      setPicks((prev) => togglePick(prev, index, cardCount));
    },
    [cardCount, picks, reading.status],
  );

  const returnCard = useCallback(
    (index: number) => {
      setDetail(null);
      if (reading.status !== 'idle') return;
      setPicks((prev) => togglePick(prev, index, cardCount));
    },
    [cardCount, reading.status],
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

      try {
        const res = await fetch('/api/reading', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
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
            question: q.trim() || undefined,
          }),
        });

        if (res.status === 401) {
          // The cookie expired mid-session. Nothing to show; send them back.
          router.replace('/login');
          return;
        }
        if (res.status === 429) {
          setReading({
            status: 'error',
            message: 'Terlalu banyak bacaan. Coba lagi nanti.',
          });
          return;
        }
        if (!res.ok || !res.body) {
          setReading({
            status: 'error',
            message: 'Bacaan tidak bisa dimulai. Coba lagi.',
          });
          return;
        }

        const decoder = new TextDecoder();
        const readerStream = res.body.getReader();
        let text = '';

        for (;;) {
          const { done, value } = await readerStream.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          setReading({ status: 'streaming', text });
        }
        text += decoder.decode();
        setReading({ status: 'done', text });
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        setReading({
          status: 'error',
          message: 'Koneksi terputus. Coba lagi.',
        });
      }
    },
    [reader.id, service.id, router],
  );

  /*
   * Fire when the draw completes, after holding motion.settle so the last
   * flip lands before the page starts changing underneath it.
   */
  useEffect(() => {
    if (!complete || reading.status !== 'idle') return;
    const timer = setTimeout(
      () => requestReading(picks, question),
      reduceMotion ? 0 : motion.settle,
    );
    return () => clearTimeout(timer);
  }, [complete, reading.status, picks, deck, question, requestReading, reduceMotion]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = () => {
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
        &larr; {reader.name}
      </Link>

      <h1 className={styles.title}>{service.name}</h1>
      <p className={styles.hint}>
        {complete
          ? 'Kartumu sudah terbuka. Ketuk salah satu untuk melihatnya lebih besar.'
          : cardCount === 1
            ? 'Ketuk satu kartu, atau tarik ke atas.'
            : `Ketuk ${cardCount} kartu, atau tarik ke atas.`}
      </p>

      <div className={styles.questionField}>
        <label className={styles.questionLabel} htmlFor="question">
          Pertanyaan (boleh dikosongkan)
        </label>
        <input
          id="question"
          className={styles.question}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={MAX_QUESTION_LENGTH}
          placeholder="Ada yang mau kamu tanyakan?"
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
        onRetry={() => requestReading(picks, question)}
      />

      <div className={styles.footer}>
        <span className={styles.counter}>
          {picks.length} / {cardCount} kartu
        </span>
        <button type="button" className={styles.reset} onClick={reset} disabled={busy}>
          Kocok ulang
        </button>
      </div>
    </main>
  );
}
