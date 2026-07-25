'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks `prefers-reduced-motion` as a boolean.
 *
 * A CSS media query cannot do this job on its own: the reduced-motion path
 * swaps in a different component (FanGrid for Fan) and changes what the slots
 * render, not just how things are styled.
 *
 * Starts `false` so the server render and the first client render agree, then
 * corrects in an effect. That means one frame of the animated layout for a
 * user who asked for less motion -- unavoidable without reading the preference
 * on the server, and cheaper than a hydration mismatch.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduce;
}
