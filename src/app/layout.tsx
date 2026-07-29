import type { Metadata, Viewport } from 'next';
import { Cinzel, Cormorant_Garamond } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppLaunched } from '@/components/AppLaunched';
import { Backdrop } from '@/components/Backdrop';
import { StillMode } from '@/components/StillMode';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
import { getLocaleBundle, getT } from '@/lib/i18n/t';
import { siteOrigin } from '@/lib/seo/origin';
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

/**
 * W6 turned this from a constant into a function, because `description` is copy.
 *
 * EVERY OTHER FIELD CAME ACROSS UNCHANGED AND MUST STAY. `appleWebApp`, `icons`,
 * the `other` entry and the separate `viewport` export below are each here for a
 * reason recorded in their own comments; `other` is the one most likely to be
 * dropped in an edit, and losing it turns Add to Home Screen into a Safari
 * bookmark on iOS below 17.4.
 *
 * `title` and `appleWebApp.title` stay hardcoded: the brand is not translated.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    /*
     * v0.4.0 / S1 (S-D11). **EVERY CANONICAL, EVERY `og:image` AND EVERY
     * `hreflang` IN THE APP RESOLVES AGAINST THIS**, so a relative
     * `alternates.canonical` in a page's `generateMetadata` becomes an absolute
     * URL at the right host — which is what makes S-D15's one helper possible at
     * all.
     *
     * WITHOUT IT, NEXT WARNS AND GUESSES. The guess is `VERCEL_URL` (the
     * immutable per-deployment host) or `http://localhost:3000`, and a canonical
     * at either de-indexes the real page. Nothing reports it.
     *
     * `new URL()` and not a string: that is the type Next wants, and
     * `siteOrigin()` is total by construction precisely so this line cannot
     * throw — a throw here is a 500 on every page in the app. `origin.test.ts`
     * asserts it.
     *
     * THIS ALSO REACHES `/s/`, which the v0.4.0 route table calls unchanged, and
     * the change there is strictly an improvement rather than an exception: its
     * `opengraph-image` stops resolving against Next's guess and starts
     * resolving against the real host. VD18 is untouched — the image still draws
     * only `MAJOR ARCANA` and carries neither the question nor the prose.
     */
    metadataBase: new URL(siteOrigin()),
    title: t('app.title'),
    description: t('meta.description'),
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
}

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

export default async function RootLayout({ children }: { children: ReactNode }) {
  /*
   * `<html lang>` IS RESOLVED PER REQUEST, and this is what opts the tree into
   * dynamic rendering — expected, not a regression. `getLocale()`'s comment has
   * the full argument; the short version is that pinning `lang="id"` and patching
   * it on the client ships the wrong language to a screen reader on first paint,
   * and the app was going dynamic anyway now that auth is on every page.
   *
   * The build output flipping ● -> ƒ is the symptom of this working. Do not
   * "fix" it.
   */
  const { locale, messages } = await getLocaleBundle();

  return (
    <html lang={locale} className={`${cinzel.variable} ${cormorant.variable}`}>
      <body>
        {/* Dev-only screenshot hook; see the component. Stripped from
            production builds. */}
        {process.env.NODE_ENV !== 'production' ? <StillMode /> : null}
        {/* One event per page load. A client component here does not make the
            layout dynamic, so /terms and /privacy stay statically renderable. */}
        <AppLaunched />
        {/* Outside the provider on purpose: neither has copy, and Backdrop is
            the one component on every screen whose render should not depend on
            a context. */}
        <Backdrop />
        {/* Above the error boundary, so `error.tsx` can use useT(). Verified,
            not assumed -- an error boundary that throws on a missing context is
            a bad day. */}
        <LocaleProvider locale={locale} messages={messages}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
