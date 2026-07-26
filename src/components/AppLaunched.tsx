'use client';

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

/**
 * A CLASS, never the referrer itself.
 *
 * Rule 2 of the taxonomy: a URL is unbounded cardinality, and an external
 * referrer is somebody else's page in our analytics table.
 */
function referrerKind(): 'direct' | 'internal' | 'external' {
  if (typeof document === 'undefined' || !document.referrer) return 'direct';
  try {
    return new URL(document.referrer).origin === window.location.origin
      ? 'internal'
      : 'external';
  } catch {
    return 'direct';
  }
}
