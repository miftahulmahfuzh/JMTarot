'use client';

import { useEffect, useRef } from 'react';
import type { EventName, EventProps } from '@/lib/analytics/events';
import { track } from '@/lib/analytics/track.client';

/**
 * Fire one event on mount and render nothing.
 *
 * WHY A COMPONENT AND NOT A CALL IN THE PAGE. The reader picker and the service
 * picker are SERVER components and should stay that way -- they are static, they
 * hold no state, and turning either into a client component to record a view
 * would ship their whole tree to the browser for one event.
 *
 * THE REF GUARD IS NOT OPTIONAL. React StrictMode double-invokes effects in
 * development, so without it every view is recorded twice locally and once in
 * production -- which is the worst kind of measurement bug, because the numbers
 * are wrong only where you are looking at them. Same family as CLAUDE.md's
 * "no side effects inside a setState updater".
 */
export function TrackView<N extends EventName>({
  name,
  props,
}: {
  name: N;
  props: EventProps<N>;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(name, props);
    // Deliberately empty: this is a mount event. `props` is a fresh object on
    // every render and listing it would re-fire on any parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
