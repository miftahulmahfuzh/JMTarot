import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/JsonLd';
import { Prose } from '@/components/Prose';
import { PublicPageViewed } from '@/components/PublicPageViewed';
import { PublicShare } from '@/components/PublicShare';
import { PublicShell } from '@/components/PublicShell';
import { blogArticle, blogDoc, blogSlugs } from '@/content/blog';
import { cardByUrlSlug, cardImage } from '@/data/deck';
import { headingIds, readingMinutes, wordCount } from '@/lib/content/doc';
import { formatLocalDate } from '@/lib/i18n/format';
import { localePath } from '@/lib/i18n/prefix';
import { getLocale, getT } from '@/lib/i18n/t';
import { contentAlternates } from '@/lib/seo/alternates';
import { blogPostingGraph } from '@/lib/seo/blog';
import { siteOrigin } from '@/lib/seo/origin';
import styles from './page.module.css';

/**
 * `/blog/<slug>` — and `/en/blog/<slug>`, which is the SAME route (S-D2: the prefix is a
 * middleware REWRITE, not a duplicated tree). One file, locale-agnostic, rendering
 * whatever `x-jmt-locale` says.
 *
 * ── THE FOUR FENCES THAT STOP EXISTING HERE ────────────────────────────────────
 *
 * The discipline is `/s/[slug]`'s, applied to a page that is *meant* to be indexed, and
 * `blog.contract.test.ts` fences all four across the subtree:
 *
 *   1. **NO SESSION.** `requireUser()` never runs and nothing here may assume a user. A
 *      page whose output varies by session is a page whose cache key varies by session —
 *      and a client component reaching for a session context renders correct HTML on the
 *      server and throws during hydration, so `curl` reports 200 with the article in the
 *      body while the page is dead in a browser.
 *   2. **NO COOKIE, read or written** (S-D10, §4.1). On a content route the URL is the
 *      only input to the locale: `contentRewrite()` pins `x-jmt-locale` from the path in
 *      both directions, so a cookie, an `Accept-Language` and `?lang=` are all inert.
 *      This page depends on that rather than implementing it, and `await getT()` is the
 *      sanctioned door.
 *   3. **NO DATABASE.** So there is no version of a database outage that makes this page
 *      500 (roadmap §10), and no fourth route joining the three that already return 500
 *      instead of 204. Every byte comes from `src/content/blog/`.
 *   4. **NO MODEL CALL** (S-D7). The article is committed source, read by a human before
 *      it shipped.
 *
 * ── `generateStaticParams` DOES NOT MAKE THIS PAGE STATIC ──────────────────────
 *
 * `app/layout.tsx` awaits `getLocale()` for `<html lang>` and `## Localization` rule 5
 * forbids "fixing" that, so `headers()` is read above every page and the whole tree
 * renders per request. **The build output shows `ƒ` and that is the symptom of the rule
 * working, not a defect.** What `generateStaticParams` + `dynamicParams = false` buys is a
 * **404 at the routing layer** for any slug outside the registry, before this module runs.
 * The TTFB story is entirely S1's `Cache-Control`.
 *
 * `maxDuration` IS DECLARED even though nothing here is slow. `POST /api/locale` was the
 * only database-writing route declaring neither `runtime` nor `maxDuration`, and Hobby's
 * default ten seconds truncated it cold. This page has no database and no model, so ten
 * seconds would very likely be enough — *"very likely"* is exactly the reasoning that trap
 * punished, and the declaration costs nothing.
 *
 * ── NO NESTED `LocaleProvider`, UNLIKE `/s/<slug>` ─────────────────────────────
 *
 * That page needs one because its language comes from a database row while `<html lang>`
 * follows the viewer. Here the URL pins the locale, middleware forwards it and the root
 * layout already follows it — so the mechanism `/s/` needed is exactly what this route
 * does not need, and mounting it anyway would ship a second catalog (+3.3KB gzipped,
 * measured on `/s/`) for nothing.
 */

export const runtime = 'nodejs';
export const maxDuration = 15;
export const dynamicParams = false;

export function generateStaticParams() {
  return blogSlugs().map((slug) => ({ slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const doc = blogDoc(slug, locale);
  const entry = blogArticle(slug);
  if (!doc || !entry) return {};

  const card = doc.hero ? cardByUrlSlug(doc.hero.cardUrlSlug) : undefined;

  return {
    title: doc.title,
    description: doc.description,
    /*
     * ONE HELPER, NEVER HAND-WRITTEN (S-D15). `entry.locales` and not `LOCALES` is what
     * makes the pair RECIPROCAL (R2): an `hreflang` naming a locale this article was
     * never written in points at a 404, and **Google discards the whole set silently**
     * when one side does not point back. Both articles ship in both locales today, which
     * is exactly when somebody simplifies this to `LOCALES` and nothing fails until the
     * next partial release.
     */
    alternates: contentAlternates({
      origin: siteOrigin(),
      path: `/blog/${slug}`,
      locale,
      locales: entry.locales,
    }),
    openGraph: {
      type: 'article',
      title: doc.title,
      description: doc.description,
      locale: locale === 'en' ? 'en_US' : 'id_ID',
      publishedTime: entry.datePublished,
      modifiedTime: entry.revisions[locale]?.dateModified,
      /*
       * **THE CARD ART IS 2:3 AND MESSENGERS WANT ~1.91:1, SO MOST WILL CROP IT
       * PORTRAIT. Accepted rather than overlooked** (reconciliation R20): S-D9 forbids
       * new derived art in this workstream and S5 owns the pipeline. R20's ruling is that
       * a site-level `openGraph` default resolved through `metadataBase` is the fix, and
       * adding one 1200x630 blog card to S5's scope is the fallback if the default looks
       * wrong. Naming the hero here is still better than naming nothing: a preview with
       * the article's own painting beats one with the site's logo.
       */
      ...(card ? { images: [{ url: cardImage(card.slug), width: 800, height: 1200 }] } : {}),
    },
    /*
     * NO `robots` FIELD. The default is indexable and that is the point of the release;
     * S-D12's trap runs the other way — a broadly-matching `x-robots-tag` that silently
     * `noindex`es content. `headers.test.ts` is the only thing that would notice.
     */
  };
}

export default async function BlogArticlePage({ params }: Params) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getT();

  const entry = blogArticle(slug);
  const doc = blogDoc(slug, locale);
  /*
   * `notFound()` FOR "EXISTS BUT NOT IN THIS LANGUAGE" TOO. Roadmap §1 permits an
   * Indonesian-only article, and the alternative — serving the Indonesian body under
   * `/en/blog/x` — is the half-translated page Miftah's `/s/` ruling rejected, at a URL
   * whose `hreflang` claims it is English. **NO CROSS-LOCALE FALLBACK**, which is I3's
   * argument applied to content.
   */
  if (!entry || !doc) notFound();

  const origin = siteOrigin();
  const path = `/blog/${slug}`;
  const canonical = contentAlternates({
    origin,
    path,
    locale,
    locales: entry.locales,
  }).canonical;

  const sections = doc.body.filter((b) => b.kind === 'heading' && b.level === 2);
  const anchors = headingIds(doc.body, 2);
  const minutes = readingMinutes(wordCount(doc.body));
  const revision = entry.revisions[locale];
  const card = doc.hero ? cardByUrlSlug(doc.hero.cardUrlSlug) : undefined;

  return (
    <PublicShell surface="blog_post" path={path}>
      <PublicPageViewed page="blog_post" locale={locale} slug={slug} />

      <a className={styles.back} href={localePath(locale, '/blog')}>
        {t('blog.backToIndex')}
      </a>

      <article className={styles.page}>
        {card && doc.hero ? (
          /*
           * A plain `<img>`, never `next/image`. `cardImage()` appends `?v=` and
           * `next/image` refuses a local `src` with a query string when no
           * `images.localPatterns` is configured — the constraint `AccountCard` records,
           * satisfied rather than dodged. `width`/`height` are set so there is no layout
           * shift, and the art is already an optimised WebP, so the optimiser has nothing
           * to improve and would only add a serverless invocation per article.
           */
          // eslint-disable-next-line @next/next/no-img-element -- see above.
          <img
            className={styles.hero}
            src={cardImage(card.slug)}
            alt={doc.hero.alt}
            width={800}
            height={1200}
            fetchPriority="high"
            decoding="async"
          />
        ) : null}

        {/* THE SINGLE `<h1>`. `Prose` emits h2 and h3 only, and a test asserts it. */}
        <h1 className={styles.h1}>{doc.title}</h1>

        <p className={styles.meta}>
          {t('blog.published', { date: formatLocalDate(entry.datePublished, locale, true) })}
          {revision && revision.dateModified !== entry.datePublished
            ? ` · ${t('blog.updated', { date: formatLocalDate(revision.dateModified, locale, true) })}`
            : ''}
          {` · ${t.plural('blog.readingTime', minutes)}`}
        </p>

        {anchors.length > 2 ? (
          <nav className={styles.toc} aria-labelledby="toc-title">
            <p className={styles.tocTitle} id="toc-title">
              {t('blog.inThisArticle')}
            </p>
            {/*
              A real list of real anchors. It works with JavaScript off, a crawler reads it
              as the document's outline, and the three orientation sections a reader who
              arrived knowing nothing needs are its first three rows.

              `<ol>`, because an article's sections are in an order the author chose.
            */}
            <ol className={styles.tocList}>
              {sections.map((block) =>
                block.kind === 'heading' && block.id ? (
                  <li key={block.id}>
                    <a href={`#${block.id}`}>{block.text}</a>
                  </li>
                ) : null,
              )}
            </ol>
          </nav>
        ) : null}

        {/* `data-article-body` is loop 4's hook — `public/cards/_blogfit.html` measures
            the rendered character count and `scrollWidth > clientWidth` inside it. It is
            an attribute rather than a class so a CSS-module rename cannot break the
            harness silently. */}
        <div className={styles.body} data-article-body>
          <Prose blocks={doc.body} />
        </div>

        {/*
          S-D8's control, and it is S1's `PublicShare` rather than one of S6's own. **The
          canonical arrives as a PROP** — `siteOrigin()` reads three variables with no
          `NEXT_PUBLIC_` prefix, so in a browser bundle the chain collapses to
          `http://localhost:3001` and the reader shares a link to their own laptop. It is
          also the same string `generateMetadata` put in `<link rel="canonical">`, which
          `window.location.href` would not be: that carries whatever query string a
          campaign appended.
        */}
        <PublicShare url={canonical} title={doc.title} surface="blog_post" slug={slug} />

        {/*
          §8.3, and `common.disclaimer.long` rather than `.short`: a 2,000-word how-to is
          exactly where a reader could mistake an article for instruction. (`PublicShell`'s
          footer carries `.short` on every public page; this is the article's own, adjacent
          to the prose.)
        */}
        <aside className={styles.disclaimer}>{t('common.disclaimer.long')}</aside>
      </article>

      <JsonLd
        node={blogPostingGraph({
          origin,
          doc,
          entry,
          locale,
          canonical,
          homeLabel: t('public.crumb.home'),
          homeUrl: `${origin}${localePath(locale, '/')}`,
          indexLabel: t('public.crumb.blog'),
        })}
      />
    </PublicShell>
  );
}
