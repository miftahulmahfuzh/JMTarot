'use client';

/**
 * The one mount for `admin.page_viewed`. A1-18, reconciliation R32.
 *
 * A CLIENT COMPONENT WITH A CLOSED PROP, and the closure is the whole point: the
 * `page` prop is typed `AdminPagePath`, so a resolved pathname cannot be passed
 * without a compile error. `TrackView` is the general precedent; this is the
 * narrowed one, and `PublicPageViewed` is the precedent for "a purpose-built
 * tracker beats a general one when the general one cannot get a prop right".
 *
 * `track` comes from `@/lib/analytics/track.client` and NEVER from
 * `@/lib/analytics/track` -- the second drags `node:async_hooks` and `next/server`
 * into the browser bundle and fails the build. The `void` return is the enforcement
 * against an `await`.
 */
import { useEffect } from 'react';
import { track } from '@/lib/analytics/track.client';
import type { AdminPagePath } from './pages';

export function AdminPageViewed({ page }: { page: AdminPagePath }) {
  useEffect(() => {
    track('admin.page_viewed', { page });
  }, [page]);
  return null;
}
