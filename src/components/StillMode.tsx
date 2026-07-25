'use client';

import { useEffect } from 'react';

/**
 * Development-only screenshot hook: `?still=1` disables every transition so a
 * headless capture shows the settled state instead of a frozen mid-transition
 * frame. See the rule in globals.css.
 *
 * The attribute is set in an effect, AFTER hydration, on purpose. The first
 * version was an inline script in the body that set it before React hydrated,
 * which changed an attribute on <html> out from under React and produced a
 * hydration mismatch on every page. Screenshots wait several seconds, so
 * running one frame later costs nothing.
 */
export function StillMode() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('still') === '1') {
      document.documentElement.setAttribute('data-still', '');
      return () => document.documentElement.removeAttribute('data-still');
    }
  }, []);

  return null;
}
