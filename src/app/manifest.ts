import type { MetadataRoute } from 'next';

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
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'JMTarot',
    short_name: 'JMTarot',
    description: 'Bacaan tarot Major Arcana bersama tiga pembaca.',
    lang: 'id',
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
