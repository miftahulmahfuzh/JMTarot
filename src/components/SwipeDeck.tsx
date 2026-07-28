'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { panelIndexAt, shouldAutoSlide } from '@/lib/swipeDeck';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import styles from './SwipeDeck.module.css';

/**
 * Two or more panels on one horizontal snap track (V5, VD17).
 *
 * GENERIC ON PURPOSE. It knows nothing about readers, summaries, fetching or
 * analytics: it takes panels, it scrolls, and it reports. `ReaderDeck` owns all
 * of that, and V6/V7 can mount this without inheriting any of it.
 *
 * THE CALLER DECIDES HOW MANY PANELS THERE ARE, and that is the M14 contract:
 * with one panel this renders one unadorned `<div role="group">` inside a track
 * that cannot scroll and NO dots, which is visually and dimensionally identical
 * to rendering the child directly. There is no empty second panel and no
 * placeholder, ever. See `ReaderDeck` and D-V5-1.
 *
 * IT MOVES ITSELF AT MOST ONCE PER KEY, and only when nobody has touched
 * anything -- `shouldAutoSlide()` in `src/lib/swipeDeck.ts` holds the whole
 * policy and is the only part of this file that is unit-tested.
 *
 * NEITHER PANEL IS `aria-hidden` (D-V5-4). Hiding the off-screen one would make
 * the summary permanently unreachable to a screen reader, because a VoiceOver
 * swipe moves to the next element rather than scrolling a snap container
 * sideways. Each panel is a NAMED `group` instead, which is what stops the two
 * from reading as one run of prose. There is no live region: the summary is
 * ambient, and announcing an automatic slide would be the accessibility
 * equivalent of the callback tic W5 warns about.
 */

export type SwipePanel = {
  /** Stable, machine-side. Also the value reported to `onPanelChange`. */
  key: string;
  /** The panel's accessible name, and its dot's label. Already localized. */
  label: string;
  node: ReactNode;
};

export type PanelChangeSource = 'auto' | 'user';

export type SwipeDeckProps = {
  panels: SwipePanel[];
  /**
   * A panel that has JUST APPEARED and should be shown without being asked for.
   * Honoured at most once per distinct key, and never once the querent has
   * touched the deck. `null` (the default) means never move on your own.
   */
  arrivedPanel?: string | null;
  onPanelChange?: (key: string, source: PanelChangeSource) => void;
};

export function SwipeDeck({ panels, arrivedPanel = null, onPanelChange }: SwipeDeckProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const reduce = usePrefersReducedMotion();

  /* Refs, not state, for every one of these: none of them should re-render
     anything, and `interacted` in particular must survive the re-render that
     the summary's next chunk causes. */
  const interacted = useRef(false);
  const slidTo = useRef<Set<string>>(new Set());
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReported = useRef(0);

  /* The current props, reachable from an effect that must not depend on them.
     `panels` is a fresh array on every render -- listing it as a dependency
     would re-run the auto-slide effect on every streamed chunk. */
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const notify = useRef(onPanelChange);
  notify.current = onPanelChange;

  const many = panels.length > 1;

  const goTo = useCallback(
    (index: number, source: PanelChangeSource) => {
      const el = scroller.current;
      if (!el) return;
      const target = el.children[index] as HTMLElement | undefined;
      if (!target) return;
      /*
       * `offsetLeft` and not `index * clientWidth`: the track is
       * `position: relative`, so a panel's offsetLeft is its position inside the
       * track's padding box, independent of the current scroll. It is correct
       * even mid-glide, which `index * clientWidth` also is -- but offsetLeft
       * stays correct if a future deck ever gains a gap, and the failure mode of
       * the other one is silent.
       *
       * AN EXPLICIT `behavior`, AND THAT IS WHY `data-still` HAS TO BE READ
       * HERE RATHER THAN LEFT TO THE STYLESHEET. A JS `scrollTo({behavior})`
       * beats CSS `scroll-behavior` -- the option is not a default, it is an
       * override -- so `html[data-still] .scroller { scroll-behavior: auto }`
       * in SwipeDeck.module.css governs a keyboard or scrollbar scroll and has
       * no say at all over this call. The rule is kept because it covers those;
       * this line is what makes the screenshot hook true for the auto-slide.
       *
       * FOUND BY THE HARNESS, NOT BY READING. `_swipeshot.html?case=auto`
       * settled at scrollLeft 2 instead of 358: under Chrome's
       * `--virtual-time-budget` the smooth-scroll animation advances one frame
       * and then stops, because it is driven by the compositor clock rather
       * than by the task queue. A capture or a driven assertion would have
       * photographed every deck mid-glide, and the CSS alone could never have
       * prevented it.
       */
      const still =
        typeof document !== 'undefined' && document.documentElement.hasAttribute('data-still');
      el.scrollTo({ left: target.offsetLeft, behavior: reduce || still ? 'auto' : 'smooth' });
      lastReported.current = index;
      setActive(index);
      const key = panelsRef.current[index]?.key;
      if (key) notify.current?.(key, source);
    },
    [reduce],
  );

  /* Any of these means the querent has an intention. Once true, never false. */
  const markInteracted = useCallback(() => {
    interacted.current = true;
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    const keys = panelsRef.current.map((p) => p.key);
    const focusIsElsewhere =
      document.activeElement !== null &&
      document.activeElement !== document.body &&
      !el.contains(document.activeElement);

    if (
      !shouldAutoSlide({
        arrived: arrivedPanel,
        panelKeys: keys,
        alreadySlidTo: slidTo.current,
        interacted: interacted.current,
        focusIsElsewhere,
      })
    ) {
      return;
    }

    const index = keys.indexOf(arrivedPanel as string);
    slidTo.current.add(arrivedPanel as string);

    /*
     * TWO FRAMES because the panel being scrolled to was appended in this very
     * commit: the first frame is where it has been laid out, the second is where
     * its first chunk of text has painted. Scrolling in the effect body targets
     * an element with no width yet.
     *
     * AND NO `cancelAnimationFrame` IN A CLEANUP, even though every lint
     * instinct says to add one. A stray frame after unmount is harmless -- `goTo`
     * returns early on a null ref -- and a cleanup is actively dangerous the
     * moment this effect re-runs while the stream is still open: it cancels the
     * pending frame, the effect re-enters, finds the key already in `slidTo`,
     * and the deck NEVER SLIDES AT ALL, silently, with nothing in the log.
     *
     * ---------------------------------------------------------------------
     * WHAT THE NEGATIVE CONTROLS ACTUALLY SHOWED (2026-07-28), AND IT IS NOT
     * WHAT THIS COMMENT CLAIMED BEFORE THEY WERE RUN.
     * `_swipeshot.html?case=auto`, five runs, counting `source:'auto'` events:
     *
     *   deps                    slidTo    cleanup   slides
     *   [arrivedPanel, goTo]    absent    absent      1     <- plan expected 3
     *   [arrivedPanel, goTo]    present   present     1
     *   + panels                absent    absent      3
     *   + panels                present   absent      1
     *   + panels                present   present     0
     *
     * THE DEPENDENCY LIST IS THE PRIMARY MECHANISM, not `slidTo`. The plan's
     * premise -- "the summary streams, so `ReaderDeck` re-renders on every chunk
     * and this effect runs again each time" -- is false. `panels` is a fresh
     * array per chunk but it is not a dependency, and `arrivedPanel` is the
     * constant string 'summary' from the first byte onward. React simply never
     * re-runs the effect, so with the shipped deps BOTH guards are unobservable.
     *
     * They are kept because rows 3 and 5 are what happens on one plausible edit.
     * Adding `panels` to the list is exactly what someone does while making the
     * deck do something new, and `react-hooks/exhaustive-deps` will never argue
     * either way -- the body reads `panelsRef.current`, not `panels`. At that
     * moment these two lines go from unobservable to the only thing standing
     * between the querent and three slides, or none. Change none of the three
     * without re-running the harness.
     */
    requestAnimationFrame(() => requestAnimationFrame(() => goTo(index, 'auto')));
  }, [arrivedPanel, goTo]);

  /*
   * The settled position, debounced. A snap scroll fires a scroll event per
   * frame for the whole decay; only the resting place is a fact worth
   * recording, and only a CHANGE in it is worth reporting.
   */
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const index = panelIndexAt(el.scrollLeft, el.clientWidth, panelsRef.current.length);
      setActive(index);
      if (index === lastReported.current) return;
      lastReported.current = index;
      const key = panelsRef.current[index]?.key;
      /*
       * 'user' unconditionally. The automatic path reports itself inside `goTo`
       * and sets `lastReported` before its own scroll events arrive, so its
       * settle is filtered out by the equality check above and cannot be
       * double-counted as a swipe.
       */
      if (key) notify.current?.(key, 'user');
    }, 120);
  }, []);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  return (
    <div className={styles.deck}>
      <div
        ref={scroller}
        className={styles.scroller}
        onScroll={onScroll}
        onPointerDown={markInteracted}
        onTouchStart={markInteracted}
        onWheel={markInteracted}
        onKeyDown={markInteracted}
      >
        {panels.map((panel) => (
          /* `role="group"`, not `<section aria-label>`: a named section is a
             `region` LANDMARK, and a reader's bio is not a landmark. `group`
             names without promoting. */
          <div key={panel.key} role="group" aria-label={panel.label} className={styles.panel}>
            {panel.node}
          </div>
        ))}
      </div>

      {many && (
        <div className={styles.dots}>
          {panels.map((panel, i) => (
            <button
              key={panel.key}
              type="button"
              className={styles.dot}
              aria-label={panel.label}
              aria-current={i === active ? 'true' : undefined}
              onClick={() => {
                markInteracted();
                goTo(i, 'user');
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
