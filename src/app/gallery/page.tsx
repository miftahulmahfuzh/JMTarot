/**
 * `/gallery` -- and `/en/gallery`, which is the SAME route (S-D2: the prefix is a
 * middleware REWRITE, not a duplicated tree). There is one file for both locales
 * and it is locale-agnostic: it renders whatever `x-jmt-locale` says.
 *
 * ── THE FOUR THINGS THIS PAGE MUST NOT DO ──────────────────────────────────
 *
 * 1. **NO SESSION.** No `currentUser()`, no `requireUser()`, no `ViewerProvider`,
 *    no `@/lib/auth/*`, no `cookies()` of its own. A page whose output varies by
 *    session is a page whose cache key varies by session, and
 *    `page.contract.test.ts` fences every one of those names -- `/s/[slug]`'s
 *    fence, for `/s/[slug]`'s reason: a client component reaching for a session
 *    context renders correct HTML on the server and throws during hydration, so
 *    `curl` reports 200 and the page is dead in a browser.
 * 2. **NO DATABASE.** Roadmap §10: a public page must not be able to 500 on a
 *    database outage, because there is no database on its path at all. Everything
 *    here comes from `cards.json`.
 * 3. **NO MODEL CALL, at request time or build time** (S-D7). There is nothing on
 *    this page a model could produce: the glosses, the keywords and the numerals
 *    are committed data.
 * 4. **NO COOKIE SET** (S-D10). A `Set-Cookie` makes the response uncacheable at
 *    the edge, on the pages whose TTFB a crawler measures. Middleware skips the
 *    `jmt_locale` write for the content routes and the outer wrapper strips what
 *    the `auth()` wrapper appends after it -- both S1/S2's, and this page depends
 *    on them rather than implementing them.
 *
 * ── AND THE ONE THING MIDDLEWARE MUST DO, OR THIS PAGE IS A CACHE-POISONING BUG
 *
 * Roadmap §4.1: on a content route THE URL WINS AND IT IS THE ONLY INPUT.
 * `getLocale()` is `localeFromHeaders(x-jmt-locale, jmt_locale)`, header first --
 * so this is only true because `contentRewrite()` PINS the header for content
 * routes in BOTH directions: `/gallery` -> `id` regardless of session claim,
 * cookie or `Accept-Language`, and `/en/gallery` -> `en`. If the bare path were
 * left to `resolveForMiddleware`'s ordinary chain, an `en-GB` browser or a
 * `jmt_locale=en` cookie would get English chrome at the Indonesian canonical URL,
 * and a CDN in front of that serves whichever language warmed the cache to
 * everybody -- under a canonical tag and an `hreflang` pair that both claim
 * otherwise. **Nothing in the unit suite can see it**; `tools/seo/crawl.sh`'s
 * hostile-cookie and hostile-`Accept-Language` checks can, and do.
 *
 * NO NESTED `LocaleProvider` AND NO `<main lang>`, unlike `/s/<slug>`. That page
 * needs both because its language comes from a database row while `<html lang>`
 * follows the viewer. Here the URL pins the locale, middleware forwards it and the
 * root layout's `<html lang>` already follows it -- so the mechanism `/s/` needed
 * is exactly what this route does not need, and mounting it anyway would ship a
 * second catalog (+3.3KB gzipped, measured on `/s/`) for nothing.
 */
import type { Metadata } from 'next';

import { Eyebrow } from '@/components/Eyebrow';
import { JsonLd } from '@/components/JsonLd';
import { PublicPageViewed } from '@/components/PublicPageViewed';
import { PublicShell } from '@/components/PublicShell';
import { CARDS, cardUrlSlug } from '@/data/deck';
import { LOCALES } from '@/lib/i18n/locale';
/* S2's module is `prefix.ts`, NOT `resolve.ts`: `gate.ts` imports the prefix leaf
   and `resolve.ts` carries a `next/server` type (R11). Nothing here builds a
   locale-prefixed path by hand. */
import { localePath } from '@/lib/i18n/prefix';
import { getLocale, getT } from '@/lib/i18n/t';
import { contentAlternates } from '@/lib/seo/alternates';
import { breadcrumbList, graph, imageGallery } from '@/lib/seo/jsonld';
import { absoluteUrl, siteOrigin } from '@/lib/seo/origin';
import { GalleryGrid } from './GalleryGrid';
import { galleryImages } from './images';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getT();
  return {
    title: t('gallery.meta.title'),
    description: t('gallery.meta.description'),
    /*
     * ONE HELPER, NEVER HAND-WRITTEN (S-D15). `hreflang` must be reciprocal and
     * must include `x-default`, and Google discards a non-reciprocal set
     * SILENTLY -- the whole tag group stops working and nothing reports it.
     *
     * `path` IS THE BARE PATH -- `/gallery`, never `/en/gallery`. Both helpers
     * throw on an already-prefixed argument, because a request path passed
     * through would emit `/en/en/gallery` inside a canonical tag, and a canonical
     * naming a page that does not exist de-indexes the page that does.
     *
     * `locales: LOCALES` is honest here and is NOT R2's trap: both addresses of
     * `/gallery` exist by construction -- one route, one file, middleware
     * rewrites the prefix -- so neither alternate can name a 404. The 22 lore
     * pages pass `localesFor(slug)` instead, because a card's English document is
     * a thing that might not be written.
     */
    alternates: contentAlternates({
      origin: siteOrigin(),
      path: '/gallery',
      locale,
      locales: LOCALES,
    }),
    /*
     * NO `openGraph` BLOCK, AND IT IS A DECISION. A gallery-specific preview image
     * means a satori route, and twenty-four of those across `/`, `/gallery`,
     * `/blog` and the 22 lore pages is twenty-four lambda invocations drawing
     * nearly the same picture. The site-level default resolved through
     * `metadataBase` covers it.
     */
  };
}

export default async function GalleryPage() {
  const locale = await getLocale();
  const t = await getT();
  const origin = siteOrigin();

  /*
   * SORTED BY ID, NEVER `CARDS` AS IT COMES.
   *
   * `cardById`'s comment records the reason: indexing `CARDS` is correct only
   * while the array happens to be in id order, and nothing enforces that --
   * `cards.json` is GENERATED. A generator that ever emitted a different order
   * would silently reorder a page whose whole structure is "the Fool's Journey, 0
   * to 21", and it would look fine. Two lines, once, on the server.
   */
  const cards = [...CARDS].sort((a, b) => a.id - b.id);

  /* Built HERE and passed down: a client component may not compute a
     locale-prefixed path, because it would need the locale and no locale prop is
     drilled anywhere (`LocaleProvider`'s header). */
  const loreHrefs: Record<number, string> = Object.fromEntries(
    cards.map((c) => [c.id, localePath(locale, `/arcana/${cardUrlSlug(c)}`)]),
  );

  const path = localePath(locale, '/gallery');

  /*
   * THE TWENTY-TWO IMAGE NODES, BUILT IN `images.ts` RATHER THAN HERE, BECAUSE
   * THEIR `@id` AND `url` MUST AGREE WITH THE ONES `/arcana/<slug>` EMITS. That is
   * a cross-page invariant, it was broken the first time it shipped, and it is
   * only testable if the list is a pure function -- see `imageJoin.test.ts`.
   */
  const images = galleryImages({
    cards,
    loreHrefs,
    locale,
    t,
    abs: absoluteUrl,
    creator: `${origin}/#organization`,
  });

  return (
    /*
     * `surface="gallery"` makes S1's footer omit its own gallery link, and `path`
     * is what mounts `ContentLocaleLink` -- a real `<a href>` to `/en/gallery`,
     * because that is the only form a crawler follows and it is how the other
     * locale tree gets discovered at all (§4.2, R17).
     *
     * THE DISCLAIMER IS THE SHELL'S, NOT THE PAGE'S (§8.3). An earlier draft of
     * S3's plan rendered a second copy here. `_galleryfit.html` asserts it appears
     * EXACTLY ONCE, which is what catches the duplicate the moment either side
     * changes its mind.
     */
    <PublicShell surface="gallery" path="/gallery">
      <main className={styles.shell}>
        <PublicPageViewed page="gallery" locale={locale} />

        <Eyebrow>{t('gallery.eyebrow')}</Eyebrow>
        {/* THE SINGLE `<h1>`. Nothing else on this page may emit one. */}
        <h1 className={styles.title}>{t('gallery.title')}</h1>
        <p className={styles.hint}>{t('gallery.hint')}</p>

        <GalleryGrid cards={cards} loreHrefs={loreHrefs} />

        <JsonLd
          node={graph([
            imageGallery({
              url: absoluteUrl(path),
              name: t('gallery.title'),
              description: t('gallery.meta.description'),
              inLanguage: locale,
              origin,
              /*
               * TWO RUNGS, AND THE SECOND IS THIS PAGE. `/arcana` is a deliberate
               * 404 (§3.1, R6) and never appears in a trail; the lore pages'
               * middle rung is `/gallery` for the same reason, so the two
               * breadcrumbs agree about the shape of the site.
               */
              breadcrumb: breadcrumbList([
                { name: t('public.crumb.home'), url: absoluteUrl(localePath(locale, '/')) },
                { name: t('public.crumb.gallery'), url: absoluteUrl(path) },
              ]),
              images,
            }),
          ])}
        />
      </main>
    </PublicShell>
  );
}
