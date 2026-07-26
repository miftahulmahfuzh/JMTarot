'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { EventName, EventProps } from '@/lib/analytics/events';
import { track } from '@/lib/analytics/track.client';

/**
 * A `next/link` that records the choice it represents.
 *
 * STILL A REAL `Link`, so prefetching and client-side navigation are unchanged
 * -- the alternative, an onClick that calls `router.push`, would quietly turn
 * every picker entry into a slower navigation for the sake of one event.
 *
 * The event is buffered, not sent: `track()` returns void and the batcher's
 * `visibilitychange`/`pagehide` handlers cover the case where the navigation
 * tears the page down before the two-second debounce fires.
 */
export function TrackLink<N extends EventName>({
  href,
  name,
  props,
  className,
  children,
}: {
  href: string;
  name: N;
  props: EventProps<N>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => track(name, props)}>
      {children}
    </Link>
  );
}
