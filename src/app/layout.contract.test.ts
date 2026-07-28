/**
 * The root layout, checked at the source level.
 *
 * **EVERY FIELD IN `generateMetadata` HAS A RECORDED REASON AND §6.3 GIVES S1 EXACTLY
 * ONE ADDITION.** `other: { 'apple-mobile-web-app-capable': 'yes' }` is the one most
 * likely to be dropped in an edit, and losing it turns Add to Home Screen into a
 * Safari bookmark on iOS below 17.4 — a regression nothing in WSL can see, on the
 * one platform this app is built for.
 *
 * The file is not rendered here for the same reason `/s/`'s contract test does not
 * render its page: `next/headers` and React `cache()` do not belong in Vitest, and
 * the properties worth protecting are all one deleted line away from being gone.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the root layout', () => {
  it('reads the file at all, so nothing below passes vacuously', () => {
    expect(CODE).toContain('export async function generateMetadata');
    expect(CODE).toContain('export default async function RootLayout');
  });

  it('sets metadataBase from the origin leaf, never from process.env directly', () => {
    // Every canonical, every `og:image` and every `hreflang` in the app resolves
    // against this. Reading `process.env` here would be the second function that
    // decides the origin, which is the whole thing S-D11 forbids.
    expect(CODE).toContain('metadataBase');
    expect(CODE).toContain("from '@/lib/seo/origin'");
    expect(CODE).not.toContain('process.env.NEXT_PUBLIC_SITE_ORIGIN');
  });

  it('keeps the four fields whose loss is invisible in WSL', () => {
    expect(CODE).toContain("'apple-mobile-web-app-capable': 'yes'");
    expect(CODE).toContain('appleWebApp');
    expect(CODE).toContain("icon: '/icon.png'");
    expect(CODE).toContain('export const viewport');
    expect(CODE).toContain("viewportFit: 'cover'");
  });

  it('still resolves the locale per request, so <html lang> is right on first paint', () => {
    // `## Localization` rule 5. The build output flipping to ƒ is this working.
    expect(CODE).toContain('getLocaleBundle');
    expect(CODE).toContain('<html lang={locale}');
  });

  it('NEVER calls currentUser() — the mount seam is the owning page', () => {
    // `src/lib/auth/server.ts` says so in as many words: calling it here makes
    // `/terms` and `/privacy` dynamic too. S-D5's dual render lives in
    // `src/app/page.tsx`, and this assertion is what keeps it there.
    expect(CODE).not.toContain('currentUser');
    expect(CODE).not.toContain('requireUser');
  });
});
