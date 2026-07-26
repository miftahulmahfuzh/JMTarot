'use client';

import { TrackView } from './TrackView';

/**
 * `reader.viewed`, from the service picker.
 *
 * `from` is derived in the browser because the server cannot know it: a
 * Next client-side navigation sends no `Referer` header the server sees, and
 * the same page reached from the picker, from a bookmark and from the back
 * button is three different things about the funnel.
 */
export function ReaderViewed({ readerId }: { readerId: string }) {
  return <TrackView name="reader.viewed" props={{ reader_id: readerId, from: from(readerId) }} />;
}

function from(readerId: string): 'picker' | 'direct' | 'back' {
  if (typeof document === 'undefined' || !document.referrer) return 'direct';
  try {
    const url = new URL(document.referrer);
    if (url.origin !== window.location.origin) return 'direct';
    if (url.pathname === '/') return 'picker';
    // `/thessaly/spread3` -> this page is where the back gesture lands.
    if (url.pathname.startsWith(`/${readerId}/`)) return 'back';
    return 'direct';
  } catch {
    return 'direct';
  }
}
