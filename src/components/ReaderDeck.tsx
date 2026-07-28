'use client';

import { useCallback } from 'react';
import { track } from '@/lib/analytics/track.client';
import { useT } from '@/lib/i18n/LocaleProvider';
import { DaySummary, useDaySummary } from './DaySummary';
import { SwipeDeck, type PanelChangeSource, type SwipePanel } from './SwipeDeck';
import styles from './ReaderDeck.module.css';

/**
 * The reader's bio and today's summary, side by side (V5, roadmap §1.5).
 *
 * THIS IS WHERE THE M14 CONTRACT IS ENFORCED. `panels` has ONE entry until the
 * summary's first byte, so a querent who has not read today gets one panel, no
 * dots, no affordance and a deck exactly as tall as the bio -- indistinguishable
 * from the stacked layout that shipped before V5, which is the point. A deck
 * that rendered two panels and left the second blank would be precisely the
 * empty state roadmap §5 forbids: it announces that the feature exists and that
 * this user has not earned it.
 *
 * `arrivedPanel` IS 'summary' FROM THE FIRST BYTE ONWARD, NOT ONLY ON THE
 * TRANSITION. It is derived from the text rather than latched, and `SwipeDeck`
 * is what makes it fire once -- its `slidTo` set. Latching it here as well would
 * be two mechanisms for one rule, and the one nobody tests would rot.
 *
 * WHY FIRST BYTE AND NOT `done`: D-V5-2. Short version -- a late steal is worse
 * than an early one, the route pulls the first chunk before the headers so the
 * first byte is real prose, and the cached path (the common one for anyone who
 * HAS a summary) is not streamed at all and arrives whole.
 *
 * `bio` IS PASSED IN, RESOLVED. It is DATA, not copy: `reader.bio` is a
 * `Localized<string>` in readers.json, and the page already picks the locale's
 * side of it. Copy comes from `useT()` here, as everywhere -- no locale prop is
 * drilled.
 */
export function ReaderDeck({
  readerId,
  readerName,
  bio,
}: {
  readerId: string;
  readerName: string;
  bio: string;
}) {
  const t = useT();
  const text = useDaySummary(readerId);

  const panels: SwipePanel[] = [
    {
      key: 'bio',
      label: t('picker.reader.bio.a11yLabel', { name: readerName }),
      node: <p className={styles.bio}>{bio}</p>,
    },
  ];

  if (text) {
    panels.push({
      key: 'summary',
      // The name that used to sit on DaySummary's <p>. Same key, one layer up.
      label: t('memory.summary.a11yLabel', { reader: readerName }),
      node: (
        <div className={styles.summaryPanel}>
          <DaySummary text={text} />
        </div>
      ),
    });
  }

  const onPanelChange = useCallback(
    (key: string, source: PanelChangeSource) => {
      /*
       * `track()` returns void and is NEVER awaited (CLAUDE.md). The client
       * import, not `@/lib/analytics/track`, which would drag node:async_hooks
       * and next/server into the browser bundle and fail the build.
       *
       * The cast is safe and narrow: this deck's keys are the two literals
       * above, and the taxonomy declares exactly those two.
       */
      track('reader.panel_swiped', {
        reader_id: readerId,
        panel: key as 'bio' | 'summary',
        source,
      });
    },
    [readerId],
  );

  return (
    <SwipeDeck panels={panels} arrivedPanel={text ? 'summary' : null} onPanelChange={onPanelChange} />
  );
}
