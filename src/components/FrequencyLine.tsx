'use client';

import { useEffect, useState } from 'react';
import { getSessionId } from '@/lib/analytics/track.client';
import { SESSION_HEADER } from '@/lib/analytics/localdate';
import { useT } from '@/lib/i18n/LocaleProvider';
import { todayKey } from '@/lib/storage';
import styles from './FrequencyLine.module.css';

/**
 * The card-frequency verdict on the reader picker (W5 §3.7).
 *
 * IT RENDERS NOTHING UNTIL IT HAS SOMETHING, AND NOTHING FOREVER IF IT NEVER
 * DOES (M14). No skeleton, no reserved height, no "you haven't read enough yet".
 * An empty state here would announce that the feature exists and that this user
 * is not interesting enough for it, which is worse than the feature being
 * invisible -- and invisible is the correct state for most users most days,
 * because the gate wants five readings before it will say anything.
 *
 * WHY THE PAGE MUST NOT WAIT FOR IT. `src/app/page.tsx` is a server component
 * that renders the three readers instantly. Fetching this on the server would
 * put a database read and possibly a model call in front of the whole picker
 * for a decorative line, which is exactly the shape roadmap §6 forbids. So it
 * mounts empty and fills in.
 *
 * THE CONTAINER PUSHES, IT DOES NOT OVERLAY, and it has no height when empty.
 * `position: static` and no min-height mean the reader list sits identically
 * whether the line is there or not -- verified by screenshot, because "the list
 * does not jump" is the kind of claim that is easy to believe and easy to get
 * wrong.
 *
 * THE LOCAL DATE COMES FROM HERE, not from the server (roadmap §7). `todayKey()`
 * is the device's own calendar day; the server cannot compute it, and "this
 * week" computed in the server's zone is a day out for a third of every Jakarta
 * evening.
 */
export function FrequencyLine() {
  const t = useT();
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    /*
     * Aborted on unmount. React StrictMode mounts, unmounts and remounts every
     * effect in development, so without this the picker fires two requests --
     * and each one can cost a model call, on a route whose whole design is
     * about not paying for one twice.
     */
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/memory/frequency?date=${todayKey()}`, {
          headers: { [SESSION_HEADER]: getSessionId() },
          signal: controller.signal,
        });

        // 204 is the common answer and is not a failure: no pattern to name.
        if (res.status !== 200) return;

        const body = (await res.text()).trim();
        if (body) setLine(body);
      } catch {
        /*
         * Silence, deliberately, and it covers the abort as well as a real
         * network failure. There is no error copy for this component (M14), so
         * W6 has no string to translate and there is nothing to decide here.
         */
      }
    })();

    return () => controller.abort();
  }, []);

  if (!line) return null;

  /*
   * `aria-label` because a paragraph that appears seconds after load, with no
   * heading above it, is disorienting to a screen reader -- it arrives as
   * unannounced prose in the middle of a list of readers.
   *
   * NOT `aria-live`. The line is ambient background about the querent's own
   * history, not a notification, and interrupting whatever the user is reading
   * to announce it would be the accessibility equivalent of the callback tic
   * §10 warns about.
   */
  /*
   * W6 landed and the hardcoded 'id' is gone. The KEY did not change, which is
   * why this was a one-line migration and why the string was in a catalog
   * rather than inline in the first place.
   */
  return (
    <p className={styles.line} aria-label={t('memory.frequency.a11yLabel')}>
      {line}
    </p>
  );
}
