import type { MetadataRoute } from 'next';
import { cookies } from 'next/headers';

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
    start_url: '/',
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
