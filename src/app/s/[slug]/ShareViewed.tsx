'use client';

/**
 * `share.viewed`, from the browser.
 *
 * **WHY NOT `TrackView`:** `referrer_kind` can only be computed where
 * `document.referrer` and `window.location` exist, and `TrackView` takes its props
 * from whatever renders it — which here is a server component. This is
 * `AppLaunched`'s shape for the same reason.
 *
 * **IT COUNTS SOMETHING DIFFERENT FROM `share_links.view_count`, ON PURPOSE.**
 * That column is incremented in `after()` on every rendered GET, crawlers
 * included, and is a LOAD AND ABUSE signal. This is a browser that ran
 * JavaScript, and is the AUDIENCE metric. The same shape as `reading.completed`
 * existing twice from two sides, and the same payoff: `view_count` far above this
 * is a crawler storm, and the reverse is a broken beacon.
 *
 * **NO `user_id` AND NO `session_id`.** `/api/events` is already public for
 * exactly this — `terms.viewed` predates it — and `/s/` is excluded from
 * middleware's `jmt_locale` write, so a stranger leaves with nothing in their jar
 * and there is nothing to correlate on anyway. The row is a COUNT, not a tracker,
 * and `/privacy` §4.4 says so in words.
 */
import { useEffect, useRef } from 'react';

import { referrerKind } from '@/lib/analytics/referrer';
import { track } from '@/lib/analytics/track.client';
import type { ShareEntity } from '@/lib/share/slug';

export function ShareViewed({
  shareId,
  entity,
  hasQuestion,
}: {
  /** `share_links.id`. NEVER the slug — the slug is a capability and this row
   *  survives account erasure with `user_id` nulled. */
  shareId: string;
  entity: ShareEntity;
  /** Whether the sharer opted the question in. A boolean, never the text. */
  hasQuestion: boolean;
}) {
  const fired = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects, so without this the number is wrong
    // exactly where somebody is looking at it. `TrackView`'s header says the same.
    if (fired.current) return;
    fired.current = true;
    track('share.viewed', {
      share_id: shareId,
      entity,
      has_question: hasQuestion,
      referrer_kind: referrerKind(),
    });
  }, [shareId, entity, hasQuestion]);

  return null;
}

/* `referrerKind` MOVED to `@/lib/analytics/referrer` when S3 became its third
   caller (R19). The comment that used to sit here argued for COPYING it -- "the
   two are four lines and putting them in a module would give `track.client`'s
   import graph a reason to grow" -- and that argument is INVERTED in the new
   module's header rather than deleted, because the failure mode of removing a
   comment is somebody restoring the duplication in six months. The stated cost
   never applied: the leaf has no imports and `track.client` does not import it. */
