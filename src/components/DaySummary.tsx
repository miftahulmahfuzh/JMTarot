'use client';

import { useEffect, useState } from 'react';
import { SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId } from '@/lib/analytics/track.client';
import { useT } from '@/lib/i18n/LocaleProvider';
import { todayKey } from '@/lib/storage';
import styles from './DaySummary.module.css';

/**
 * What this reader remembers about the querent's day (W5 §5.4).
 *
 * IT RENDERS NOTHING UNTIL THE FIRST BYTE, AND NOTHING AT ALL IF THERE IS
 * NOTHING TO SAY (M14). No skeleton, no reserved height, no "you haven't read
 * today" -- roadmap §5 is explicit that the empty state destroys the effect,
 * because it announces the feature exists and that this user has not earned it.
 * A first-time visitor gets a 204 and never knows the component was here.
 *
 * WHY IT IS A CLIENT COMPONENT, and this is the §6 constraint that shapes the
 * whole design. This used to read "`src/app/[reader]/page.tsx` is STATICALLY
 * PRERENDERED via `generateStaticParams`", with the build output listing
 * `/thessaly`, `/margaret` and `/adrian` as the canary. W6 ENDED THAT: the root
 * layout awaits `getLocale()` for `<html lang>`, so every route is now ƒ and
 * there is no prerendering left to protect. Plan §8 says to expect it.
 *
 * The constraint that outlived the canary is the one that was always the point:
 * an `await`ed database read plus a possible model call in that page BLOCKS THE
 * FIRST BYTE, and roadmap §6 forbids that regardless of how the route is
 * rendered. So this still mounts empty and fills in.
 *
 * IT STREAMS, unlike `FrequencyLine`. The endpoint sends 45 words in the
 * reader's own voice, and watching them arrive reads as the reader speaking --
 * the same treatment the reading result already gets. The frequency verdict is
 * one clause meant to be read whole and is fetched in one piece; the difference
 * is deliberate.
 */
export function DaySummary({ readerId, readerName }: { readerId: string; readerName: string }) {
  const t = useT();
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

  if (!text) return null;

  /*
   * `aria-label` because a paragraph that appears seconds after load, with no
   * heading, is disorienting to a screen reader -- and unlike the frequency
   * line, this one is in a named reader's voice, so the label says whose.
   *
   * W6 landed; the hardcoded 'id' is gone and the key is unchanged.
   */
  return (
    <p className={styles.summary} aria-label={t('memory.summary.a11yLabel', { reader: readerName })}>
      {text}
    </p>
  );
}
