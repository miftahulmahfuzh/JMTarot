'use client';

import { useEffect } from 'react';

/**
 * Land a `#fragment` navigation on its section, on a page whose sections arrive through
 * `<Suspense>` and under a `sticky` table of contents. 2026-07-31.
 *
 * ── THE BROWSER'S OWN FRAGMENT SCROLL IS A RACE HERE, AND IT WAS MEASURED ────
 *
 * `/admin/users/[id]` streams its whole body inside a `<Suspense>` boundary, so React sends the
 * real markup down in a `<div hidden id="S:0">` and reveals it with an inline script ~70KB later.
 * A hidden element has no scroll box, so when the parser meets `id="token"` there is nothing to
 * scroll to; the reveal is a DOM mutation rather than a parse, and mutations do not re-run
 * fragment scrolling. **But Chrome sometimes gets there anyway**, depending on how the reveal
 * lands against the load event. Two consecutive loads of the same URL, component disabled,
 * 2026-07-31:
 *
 *     run 1 -> { y: 0,    tokenAbs: 2699 }     // never scrolled
 *     run 2 -> { y: 2699, tokenAbs: 2699 }     // scrolled, and ignored the sticky bar
 *
 * **SO THE JOB IS NOT TO WIN THAT RACE, IT IS TO MAKE BOTH OUTCOMES THE SAME.** The first
 * version of this file only scrolled, and lost: it landed on 2508 and Chrome's late scroll
 * then moved the page to 2699, putting the panel heading back under the bar. Chasing that with
 * a later scroll, a timeout or a `scrollend` listener is a fight with the platform that a
 * future Chrome wins.
 *
 * The fix is `scroll-margin-top`, which **both** paths honour: Chrome's native fragment scroll
 * respects it, and so does `scrollIntoView`. Whoever scrolls, the result is identical, and the
 * race stops mattering. This component therefore does two things:
 *
 *   1. publishes the measured sticky height as `--admin-anchor-offset`, which
 *      `detail.module.css` turns into `scroll-margin-top` on every panel; and
 *   2. performs the scroll itself, once, for the runs where Chrome does not.
 *
 * **THE VARIABLE IS THE LOAD-BEARING HALF. Deleting it and keeping the scroll reinstates the
 * bug**, intermittently, which is the worst way to have it.
 *
 * ── WHY THE OFFSET IS MEASURED AND NOT A NUMBER IN THE STYLESHEET ────────────
 *
 * `.toc` is `position: sticky; top: 0` and holds **fourteen** links. Measured at **191px at
 * 390px wide**, where they wrap to five rows, against a single row on a desktop. There is no one
 * number, so a literal `scroll-margin-top` is wrong at one width or the other -- and it would go
 * stale the moment somebody adds a fifteenth section. It is re-measured on resize for the same
 * reason.
 *
 * ── MOUNT IT INSIDE THE SUSPENDED SUBTREE, NEVER IN THE SHELL ────────────────
 *
 * The target must exist when the effect runs. An effect fires after commit, so a mount inside
 * `Body` is ordered after the content it looks for; a mount beside `<Suspense>` in the shell runs
 * against the fallback, finds nothing, and returns having silently done nothing -- which looks
 * exactly like the bug it was written to fix.
 *
 * ── IT READS `matchMedia` ITSELF RATHER THAN CALLING THE HOOK ────────────────
 *
 * `usePrefersReducedMotion` starts `false` and corrects in an effect, deliberately, so the server
 * and first client render agree. That is right for a component that keeps rendering and **wrong
 * for one that acts once at mount**: this effect runs while the hook still reports `false`, so an
 * operator who asked for less motion would get the glide anyway.
 *
 * **And `data-still` is read here for the reason `SwipeDeck` predicted by name** -- *"the same
 * trap will catch the next component that auto-scrolls"*, and `ScrollTop` is the other one that
 * did. **A JS scroll's `behavior` option OVERRIDES CSS `scroll-behavior` rather than defaulting
 * from it**, so `html[data-still]` in a stylesheet has no say over this call and every screenshot
 * taken after a drill-down would photograph the page mid-glide.
 *
 * There is no copy in this file and there must not be (A-D12): it renders nothing.
 */

/** The custom property `detail.module.css` reads. Named here because this file is its only
 *  writer, and a stylesheet reading a variable nobody sets silently falls back to `0px`. */
export const ANCHOR_OFFSET_VAR = '--admin-anchor-offset';

/**
 * The height of whatever is stuck to the top of the viewport.
 *
 * PURE apart from the DOM it is handed, and exported so a test can drive it with fakes -- the
 * `top > 0` clause is the part that is easy to get backwards and impossible to see in a
 * screenshot.
 *
 * It walks landmarks rather than naming a CSS module class, because the class name is hashed per
 * build and the element belongs to another component. Anything actually `sticky`/`fixed` **and**
 * pinned to the top is in the way; a sticky bar further down the page is not.
 */
export function stickyOffsetIn(
  elements: Iterable<{ position: string; top: string; boxTop: number; height: number }>,
): number {
  let offset = 0;
  for (const el of elements) {
    if (el.position !== 'sticky' && el.position !== 'fixed') continue;
    // Either already stuck, or declared to stick at the very top -- which is the state it will
    // be in once the scroll lands, and the state that matters.
    if (el.boxTop > 0 && el.top !== '0px') continue;
    offset = Math.max(offset, el.height);
  }
  return offset;
}

function measureSticky(): number {
  return stickyOffsetIn(
    [...document.querySelectorAll<HTMLElement>('nav, header')].map((el) => {
      const style = window.getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return { position: style.position, top: style.top, boxTop: box.top, height: box.height };
    }),
  );
}

export function AdminScrollToHash() {
  /*
   * ── 1. PUBLISH THE OFFSET, AND KEEP IT TRUE ────────────────────────────────
   *
   * Its own effect, with its own listener, because it is not a one-shot: the bar's height is a
   * function of viewport width and this must stay correct for the fourteen in-page table of
   * contents links long after the drill-down landed. rAF-coalesced for `ScrollTop`'s reason --
   * this reads layout, and resize fires far more often than a frame.
   */
  useEffect(() => {
    let frame = 0;

    const publish = () => {
      frame = 0;
      document.documentElement.style.setProperty(ANCHOR_OFFSET_VAR, `${measureSticky()}px`);
    };

    const onResize = () => {
      if (frame === 0) frame = requestAnimationFrame(publish);
    };

    publish();
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      document.documentElement.style.removeProperty(ANCHOR_OFFSET_VAR);
    };
  }, []);

  /*
   * ── 2. SCROLL, ONCE ───────────────────────────────────────────────────────
   *
   * The empty dependency list is the feature, again V5's rule: this fires on mount and never
   * again. A list that re-ran it would yank an operator who has since scrolled somewhere else
   * back to the anchor, which is the failure mode of an auto-scroll that thinks it is helping.
   */
  useEffect(() => {
    /*
     * No hash, nothing to do -- and the early return matters rather than being tidy: a browser
     * restores a scroll position on reload, and a component that scrolled on every mount would
     * fight it on every ordinary refresh of this page.
     */
    const raw = window.location.hash.slice(1);
    if (!raw) return;

    // A fragment is percent-encoded in the URL and `getElementById` wants it decoded. Our own
    // anchors are ASCII, so this only matters for a hand-typed URL -- where a stray `%` throws
    // a `URIError` that would otherwise take the whole effect out.
    let id: string;
    try {
      id = decodeURIComponent(raw);
    } catch {
      id = raw;
    }

    const target = document.getElementById(id);
    if (!target) return;

    const still = document.documentElement.hasAttribute('data-still');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /*
     * `scrollIntoView`, not `scrollTo`, and that is the whole point of the rewrite: it honours
     * the `scroll-margin-top` the effect above published, so this scroll and Chrome's own
     * late fragment scroll land on the same pixel. Doing the arithmetic here instead would put
     * the two paths one bar-height apart, which is the bug.
     */
    target.scrollIntoView({
      // See the header: the stylesheet cannot govern this, so both attributes are read here.
      behavior: reduce || still ? 'auto' : 'smooth',
      block: 'start',
    });
  }, []);

  return null;
}
