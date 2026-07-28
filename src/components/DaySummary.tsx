'use client';

import { useEffect, useState } from 'react';
import { SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId } from '@/lib/analytics/track.client';
import { todayKey } from '@/lib/storage';
import styles from './DaySummary.module.css';

/**
 * What this reader remembers about the querent's day (W5 §5.4), as a hook and a
 * paragraph.
 *
 * SPLIT BY V5, AND THE M14 CONTRACT MOVED UP ONE LEVEL RATHER THAN AWAY. This
 * used to be one component that returned `null` until the first byte and
 * nothing at all if there was nothing to say -- no skeleton, no reserved
 * height, no "you haven't read today" -- because roadmap §5 is explicit that an
 * empty state destroys the effect: it announces that the feature exists and
 * that this user has not earned it.
 *
 * That rule is UNCHANGED and is now enforced by `ReaderDeck`, which asks
 * `useDaySummary()` and builds a ONE-panel deck while the text is empty. A
 * second panel is never rendered blank, so there is still no empty state -- and
 * a deck with one panel has no dots and no affordance, so a first-time visitor
 * still never knows the component was here.
 *
 * WHY THE SPLIT AT ALL: the deck has to know whether a second panel exists
 * BEFORE deciding what to render, and a component that answers that by
 * returning `null` cannot be asked. The state had to be lifted; nothing else
 * about it changed.
 *
 * WHY IT IS STILL A CLIENT COMPONENT. An `await`ed database read plus a possible
 * model call in `src/app/[reader]/page.tsx` BLOCKS THE FIRST BYTE, and roadmap
 * §6 forbids that regardless of how the route renders. (The old canary --
 * `/thessaly` listed as prerendered -- died with W6, which made every route ƒ
 * for `<html lang>`. Plan §8 said to expect it.) So this still mounts empty and
 * fills in.
 *
 * IT STREAMS, unlike `FrequencyLine`. The endpoint sends 45 words in the
 * reader's own voice and watching them arrive reads as the reader speaking.
 * V5 leans on that: the deck slides on the FIRST BYTE so the querent is present
 * for it, not after `done` (D-V5-2).
 */
export function useDaySummary(readerId: string): string {
  const [text, setText] = useState('');

  useEffect(() => {
    /*
     * Aborted on unmount. StrictMode mounts, unmounts and remounts every effect
     * in development, and each request here can cost a model call on a route
     * whose entire design is about not paying for one twice.
     */
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `/api/memory/summary?reader=${encodeURIComponent(readerId)}&date=${todayKey()}`,
          {
            headers: { [SESSION_HEADER]: getSessionId() },
            signal: controller.signal,
          },
        );

        // 204 is the common answer and is not a failure: nothing read today.
        if (res.status !== 200 || !res.body) return;

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let acc = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += value;
          /*
           * Set the accumulated string rather than appending in the updater.
           * StrictMode double-invokes updaters, and `setText(t => t + value)`
           * would duplicate every chunk in development -- the same class of
           * mistake as the side-effect-in-updater trap CLAUDE.md records for
           * the fan.
           */
          setText(acc);
        }
      } catch {
        /*
         * Silence, covering the abort and a real failure alike. There is no
         * error copy for this component by design (M14), so W6 has no string to
         * translate and there is no decision to make here. Whatever arrived
         * before the failure stays on screen; the endpoint stores it too.
         */
      }
    })();

    return () => controller.abort();
  }, [readerId]);

  return text;
}

/**
 * The paragraph. NOT NAMED -- and that is deliberate, not an omission.
 *
 * This used to carry `aria-label={t('memory.summary.a11yLabel', ...)}`, because a
 * paragraph that appears seconds after load with no heading is disorienting.
 * That is still true and the name still exists; it moved to the panel that wraps
 * this, so there is exactly ONE naming layer instead of a group and a paragraph
 * announcing the same sentence twice. The catalog key is unchanged and
 * `ReaderDeck` passes it.
 *
 * IF YOU EVER MOUNT THIS OUTSIDE A DECK, name it at the mount. `t()` is not
 * called here any more precisely so that the caller cannot forget to.
 */
export function DaySummary({ text }: { text: string }) {
  /* Belt and braces. `ReaderDeck` never builds a summary panel for empty text,
     so this is unreachable -- and it is the M14 rule stated where somebody
     grepping for it will find it. */
  if (!text) return null;
  return <p className={styles.summary}>{text}</p>;
}
