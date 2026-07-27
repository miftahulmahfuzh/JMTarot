import 'server-only';

/**
 * `t` for server components and route handlers.
 *
 * THE `server-only` MARKER IS ON THIS FILE AND NOT ON `resolve.ts`, which is
 * where the plan's §4 put it. The reason is the trap CLAUDE.md records for
 * `@/lib/db/client`: the package throws anywhere the `react-server` condition is
 * absent, which includes Vitest and would make `resolveForMiddleware` untestable.
 * Everything that genuinely cannot leave the server — `next/headers`, React
 * `cache()` — is here; everything the edge and the tests need is there.
 *
 * `getLocale()` reads the header middleware forwarded, then the cookie. It does
 * NOT parse `Accept-Language`: middleware already did that exactly once (I10),
 * and a server component redoing the chain is how two surfaces end up disagreeing
 * about the same request.
 */
import { cookies, headers } from 'next/headers';
import { cache } from 'react';

import { catalogFor, tFor } from './catalog';
import type { TFunction } from './format';
import { type Locale } from './locale';
import { LOCALE_COOKIE, LOCALE_HEADER, localeFromHeaders } from './resolve';

/**
 * The request's locale, memoized per request.
 *
 * `cache()` so a page that asks in three places pays for one header read. It also
 * makes the answer stable within a render, which matters more than the cost: a
 * layout and a nested server component resolving differently would put two
 * languages on one screen.
 *
 * CALLING THIS IN THE ROOT LAYOUT OPTS THE WHOLE TREE INTO DYNAMIC RENDERING, and
 * that is expected rather than a regression. `generateStaticParams` on `[reader]`
 * and `[reader]/[service]` still enumerates nine routes; they render per request.
 * The app was going there anyway — W2 put auth on every page — so this is paying
 * early, not paying extra. The build output flipping from ● to ƒ is the expected
 * symptom. Do NOT "fix" it by pinning `lang="id"` static and patching it on the
 * client: that ships the wrong language to a screen reader on first paint and to
 * the SSR'd markup Next streams before hydration.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  return localeFromHeaders(h.get(LOCALE_HEADER), jar.get(LOCALE_COOKIE)?.value);
});

/** The lookup, for a server component or a route handler. */
export async function getT(): Promise<TFunction> {
  return tFor(await getLocale());
}

/**
 * The locale AND its catalog, for the root layout.
 *
 * One call rather than `getLocale()` then `catalogFor()`, because the layout needs
 * both and passing the catalog to `LocaleProvider` is the only reason `catalogFor`
 * is reachable from a page at all (I9).
 */
export async function getLocaleBundle() {
  const locale = await getLocale();
  return { locale, messages: catalogFor(locale) };
}
