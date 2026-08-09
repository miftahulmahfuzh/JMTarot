'use client';

import { useEffect, useRef } from 'react';

/**
 * The installed app asking, *"did a sign-in finish while I was not looking?"*
 *
 * Renders nothing, ever. `src/lib/auth/handoff.ts` carries the whole mechanism;
 * this is step 4 of it, and it exists because the querent's sign-in completed in
 * a browser overlay whose cookie jar this app cannot read. The fix is not to move
 * a cookie — nothing can — but to make one request from inside the app that the
 * server answers with a session cookie of its own.
 *
 * ── THREE TRIGGERS, AND EACH ONE COVERS A CASE THE OTHERS DO NOT ────────────
 *
 *   - **On mount.** Covers the app having been evicted from memory while the
 *     overlay was open: it relaunches cold at `start_url` with no event to hear.
 *   - **`visibilitychange` → `visible`.** The ordinary path. Finding 4 of the
 *     design's §1 measured that pressing `Done` really does fire it.
 *   - **`pageshow` with `persisted`.** Finding 5: the page comes back from the
 *     back/forward cache, and a bfcache restore fires no `visibilitychange` on
 *     every engine. **This is also why the bug could not be fixed by "just
 *     reloading"** — a replayed page is not a re-fetched one, which is exactly
 *     the alternative explanation §1 had to rule out before any of this was
 *     built.
 *
 * ── WHY IT RELOADS RATHER THAN CALLING `router.refresh()` ───────────────────
 *
 * A claimed session may belong to somebody who has never onboarded, in which
 * case `/` is not their destination — middleware's gate is. A full navigation is
 * the one thing guaranteed to go through it, and this whole feature is verified
 * on hardware rather than in a test, so the more boring mechanism wins. It is one
 * navigation, once, after a sign-in the querent has just watched happen.
 *
 * ── AND WHY IT IS SILENT ────────────────────────────────────────────────────
 *
 * There is no spinner and no message. From inside the room the querent pressed
 * `Done` and the app is signed in; announcing the machinery would be describing a
 * bug they were never told about. §6 of the design records this as untested on a
 * person, which it still is.
 */
export function HandoffClaim() {
  /*
   * ONE CLAIM IN FLIGHT AND ONE SUCCESS EVER. Both matter: `pageshow` and
   * `visibilitychange` can fire together on a bfcache restore, and without the
   * second guard a slow reload would let a second claim run against a row the
   * first one already spent.
   */
  const busy = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    /** Belt to the route's own `maxDuration`: a hung fetch must not wedge the ref. */
    const TIMEOUT_MS = 20_000;

    async function claim() {
      if (busy.current || done.current) return;
      busy.current = true;

      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
      try {
        const res = await fetch('/api/auth/handoff', {
          method: 'POST',
          // The device secret is httpOnly, so it rides the request and nothing
          // here can see it. `same-origin` rather than `include`: this endpoint
          // is only ever on our own origin, and the narrower value says so.
          credentials: 'same-origin',
          signal: abort.signal,
        });
        // 204 is the ordinary answer and means "nothing was waiting". Only a 200
        // carries a session, and only then is there any reason to navigate.
        if (res.status !== 200) return;
        done.current = true;
        window.location.replace('/');
      } catch {
        /*
         * Offline, aborted, or a lambda that never answered. Silence is correct:
         * the next foreground tries again, and the row is good for five minutes.
         * A failed claim is indistinguishable from no claim, which is the state
         * the querent is already in.
         */
      } finally {
        clearTimeout(timer);
        busy.current = false;
      }
    }

    function onVisible() {
      if (document.visibilityState === 'visible') void claim();
    }
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) void claim();
    }

    void claim();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  return null;
}
