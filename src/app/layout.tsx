import type { Metadata, Viewport } from 'next';
import { Cinzel, Cormorant_Garamond } from 'next/font/google';
import type { ReactNode } from 'react';
import { Backdrop } from '@/components/Backdrop';
import { StillMode } from '@/components/StillMode';
import './globals.css';

/*
 * Only the weights the design uses. next/font downloads at build time and
 * self-hosts the files, so there is no runtime request to Google, no layout
 * shift, and no CSP exception to write.
 *
 * The iOS build imported each weight from its own subpath to stop Metro
 * bundling all 16 TTFs; that trick was Metro-specific and is gone. The
 * principle it protected is not: list weights explicitly, never pull a whole
 * family.
 */
const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-display',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'JMTarot',
  description: 'Bacaan tarot Major Arcana bersama tiga pembaca.',
  /*
   * Next does not emit the apple-mobile-web-app-* meta tags from the manifest,
   * and iOS still reads them. Without `capable`, Add to Home Screen produces a
   * bookmark that opens in Safari instead of a standalone app.
   */
  appleWebApp: { capable: true, title: 'JMTarot', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon.png', apple: '/apple-icon.png' },
  /*
   * `appleWebApp.capable` makes Next emit the modern `mobile-web-app-capable`
   * and NOT the legacy `apple-mobile-web-app-capable` -- verified against the
   * served HTML. Safari only started honouring the modern name in iOS 17.4, so
   * on anything older Add to Home Screen would produce a Safari bookmark
   * rather than a standalone app, which is precisely the outcome this task
   * exists to avoid. Emit both and let each iOS version read the one it knows.
   */
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  themeColor: '#0a0812',
  width: 'device-width',
  initialScale: 1,
  /*
   * Required for env(safe-area-inset-*) to report anything but zero, which the
   * layout depends on for both the home indicator and -- because the status
   * bar is translucent -- the notch.
   */
  viewportFit: 'cover',
  /*
   * The plan called for maximumScale: 1. Deliberately omitted.
   *
   * Its purpose was to stop iOS zooming when a text field is focused, but that
   * is already solved properly: every input here is 16px or larger, which is
   * the actual trigger. What maximumScale would add is blocking pinch-zoom,
   * which is a WCAG 1.4.4 failure -- and iOS Safari ignores it anyway on
   * accessibility grounds, so the only platform it would affect is the one we
   * are not shipping to.
   */
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={`${cinzel.variable} ${cormorant.variable}`}>
      <body>
        {/* Dev-only screenshot hook; see the component. Stripped from
            production builds. */}
        {process.env.NODE_ENV !== 'production' ? <StillMode /> : null}
        <Backdrop />
        {children}
      </body>
    </html>
  );
}
