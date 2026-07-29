'use client';

import { referrerKind } from '@/lib/analytics/referrer';
import { TrackView } from './TrackView';

/**
 * `app.launched`, once per page load, from the root layout.
 *
 * `standalone` is the first data anyone will have about whether Add to Home
 * Screen is actually being used -- which is the delivery model this whole
 * project is built around and which nothing currently measures.
 *
 * Mounted in a SERVER layout and safe there: a client component does not make
 * its parent dynamic, so `/terms` and `/privacy` stay statically renderable
 * (W2's constraint) and nothing above them calls `auth()`.
 */
export function AppLaunched() {
  return (
    <TrackView
      name="app.launched"
      props={{ standalone: isStandalone(), referrer_kind: referrerKind() }}
    />
  );
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // The media query is the web standard; `navigator.standalone` is the iOS
  // Safari original and is still what an older iPhone home-screen app reports.
  const legacy = (window.navigator as { standalone?: boolean }).standalone === true;
  return legacy || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/* `referrerKind` MOVED to `@/lib/analytics/referrer` when S3 became its third
   caller (R19). The header there records the inversion of `ShareViewed`'s
   argument for copying it, rather than deleting it. */
