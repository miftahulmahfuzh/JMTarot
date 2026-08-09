import type { MetadataRoute } from 'next';
import { cookies } from 'next/headers';

import { START_URL } from '@/lib/auth/handoff';
import { tFor } from '@/lib/i18n/catalog';
import { isLocale, DEFAULT_LOCALE } from '@/lib/i18n/locale';
import { LOCALE_COOKIE } from '@/lib/i18n/resolve';

/**
 * The web app manifest.
 *
 * `display: standalone` is the whole point of this task. The original ask was
 * a bookmark that opens in Safari; a manifest gets something better for free,
 * because iOS launches an installed standalone app with no address bar and no
 * tab strip. That is what "so it looks like we have JMTarot installed" was
 * reaching for.
 *
 * The trade is that standalone mode has no browser chrome and therefore no
 * back button and no back gesture, which is why every screen below the root
 * carries its own back control.
 *
 * W6 MADE IT DYNAMIC, AND IT READS THE COOKIE AND NOT THE HEADER (I13). This path
 * is excluded from the middleware matcher — deliberately, because gating
 * `/manifest.webmanifest` breaks Add to Home Screen and looks like missing
 * artwork rather than an auth problem — so `x-jmt-locale` is simply not here. The
 * cost is one uncached small JSON at install time, which is exactly when the
 * home-screen name and language are decided, so it is the one request where
 * paying for freshness is obviously right.
 *
 * `name` and `short_name` stay `JMTarot`: the brand is not translated.
 *
 * ── `start_url` CARRIES A MARKER SINCE 2026-08-09, AND IT IS LOAD-BEARING ────
 *
 * **IT IS THE ONLY WAY THE SERVER CAN TELL A HOME-SCREEN LAUNCH FROM A TAB**, and
 * without that it cannot fix the bug that made the installed app unable to sign
 * in at all — see `src/lib/auth/handoff.ts`. Measured on an iPhone (§1, finding 1
 * of the design document): iOS honours `start_url` on Add to Home Screen, so the
 * marker really does arrive.
 *
 * **A QUERY PARAMETER AND NEVER A SECOND PATH.** `/` is a canonical, indexed
 * address carrying an `hreflang` set; a `/app` twin would be a duplicate of the
 * landing page in the search index. `contentRewrite` is handed a pathname alone,
 * so the parameter is invisible to the locale machinery by construction.
 *
 * **THE STRING LIVES IN `handoff.ts`**, because middleware has to recognise
 * exactly what this file emits, and two literals that must agree are two literals
 * that will not.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie) ? cookie : DEFAULT_LOCALE;
  const t = tFor(locale);

  return {
    name: 'JMTarot',
    short_name: 'JMTarot',
    description: t('meta.description'),
    lang: locale,
    start_url: START_URL,
    /*
     * **`scope` DOES NOT DO WHAT EVERY DOCUMENT SAYS IT DOES ON iOS**, and finding
     * 6 of the design's §1 is the measurement: a navigation to any path on this
     * origin stays inside the standalone app however far outside `scope` it is,
     * and only a CROSS-ORIGIN hop is handed to `SFSafariViewController`. That is
     * what makes `/handoff` and the claim POST reachable from inside the installed
     * app, and it is the opposite of the assumption the first probe was built on.
     */
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0812',
    theme_color: '#0a0812',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
