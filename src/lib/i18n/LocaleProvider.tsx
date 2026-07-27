'use client';

/**
 * The catalog, handed to client components.
 *
 * I9: MOUNTED IN THE ROOT LAYOUT AND GIVEN THE ALREADY-RESOLVED CATALOG. Not the
 * locale — the catalog. The alternative is a client component that imports both
 * catalogs and picks one, which ships the language the user did not choose and
 * grows every time a workstream adds copy. That is also why `catalogFor` lives in
 * `catalog.ts` and why nothing under `'use client'` may import it.
 *
 * The catalog crosses the RSC boundary as JSON, once per full page load, and is
 * reused across client navigations inside this layout. The whole catalog goes,
 * including keys the current page never reads; at a hundred-odd short strings that
 * is nothing. IF IT EVER STOPS BEING NOTHING, the escape hatch is to pass only the
 * namespaces a subtree needs, keyed by the namespace table in the plan's §4. Do
 * not build that now.
 *
 * NO LOCALE PROP IS DRILLED ANYWHERE. If you find yourself adding `locale` to a
 * component's props, you either want `useT()` or you are in a server component and
 * want `getT()`.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { makeT, type Catalog, type TFunction } from './format';
import type { Locale } from './locale';

type Value = { locale: Locale; messages: Catalog };

const Ctx = createContext<Value | null>(null);

export function LocaleProvider({
  locale,
  messages,
  children,
}: Value & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The lookup, in a client component.
 *
 * THROWS A NAMED ERROR WHEN THE PROVIDER IS MISSING. An unnamed
 * `undefined is not a function` from an absent context costs an hour, and the
 * situation is genuinely reachable: a component rendered outside the root layout —
 * a portal target, a future `global-error.tsx`, a Vitest render — has no provider.
 * Next's `global-error.tsx` in particular REPLACES the root layout, so if one is
 * ever added it must not call this.
 */
export function useT(): TFunction {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error(
      'useT() was called outside LocaleProvider. The provider is mounted in ' +
        'src/app/layout.tsx; a component rendered outside that tree (global-error.tsx ' +
        'replaces the root layout) must take its copy from tFor(locale) instead.',
    );
  }
  // Memoized on the value, so `t` is stable across renders and safe in a
  // dependency array.
  return useMemo(() => makeT(v.locale, v.messages), [v]);
}

/** The locale itself, for the rare caller that needs it and not a string. */
export function useLocale(): Locale {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLocale() was called outside LocaleProvider.');
  return v.locale;
}
