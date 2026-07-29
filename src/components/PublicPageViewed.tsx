'use client';

/**
 * `public.page_viewed`, from the browser, with a REAL `referrer_kind`.
 *
 * ── WHY THIS EXISTS, AND IT IS A BUG FIX RATHER THAN A COMPONENT ─────────────
 *
 * **`referrer_kind` IS THE ONE PROP v0.4.0 IS MEASURED BY**, and both public pages
 * that shipped before this file hardcoded it to `'direct'`: `Landing.tsx` (S1) and
 * `/arcana/[slug]` (S4). `external` on a page in the sitemap is an organic arrival
 * and `internal` is somebody who was already here -- without the distinction the
 * event answers "was the page looked at" and not "did forty-four indexable pages
 * bring anybody", which is the question the release exists to answer. A constant
 * `'direct'` is worse than a missing prop, because it reads as data.
 *
 * The reason both got it wrong is structural, not carelessness: **`TrackView` takes
 * its props from whatever renders it**, and on a content page that is a server
 * component, where `document.referrer` does not exist. `ShareViewed` hit the same
 * wall on `/s/` in v0.3.0 and solved it the same way. So this is `TrackView`'s
 * shape with one value computed on the client instead of passed in.
 *
 * ── NO `user_id`, NO `session_id` ────────────────────────────────────────────
 *
 * The same shape and the same reason as `share.viewed`: these are public,
 * CDN-cacheable pages that set no cookie (S-D10), so there is nothing to correlate
 * on and the row is a COUNT rather than a tracker. `/privacy` §4.4 says so in
 * words, and `/api/events` is already public for exactly this.
 *
 * ── THE UNION IS SPELLED OUT, NOT IMPORTED ──────────────────────────────────
 *
 * `PublicShell` exports a `PublicSurface` with the same five members, and this file
 * deliberately does not import it: `PublicShell` is an async server component, and
 * a client component reaching into it for a type is one refactor away from
 * reaching into it for a value. `events.ts` spells its unions out for the same
 * reason -- it is the data dictionary and has no imports at all.
 */
import { useEffect, useRef } from 'react';

import type { Locale } from '@/data/types';
import { referrerKind } from '@/lib/analytics/referrer';
import { track } from '@/lib/analytics/track.client';

export function PublicPageViewed({
  page,
  locale,
  slug = null,
}: {
  page: 'landing' | 'gallery' | 'arcana' | 'blog_index' | 'blog_post';
  /** The language the PAGE was rendered in -- after S2, the one the URL names. */
  locale: Locale;
  /** The card's or article's URL slug, or `null` where the page has no artifact.
   *  A closed set of committed values, which is what makes it legal in `props`. */
  slug?: string | null;
}) {
  const fired = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects, so without this the number is wrong
    // exactly where somebody is looking at it. `TrackView`'s header says the same.
    if (fired.current) return;
    fired.current = true;
    track('public.page_viewed', { page, locale, slug, referrer_kind: referrerKind() });
  }, [page, locale, slug]);

  return null;
}
