import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/JsonLd';
import { Prose } from '@/components/Prose';
import { PublicPageViewed } from '@/components/PublicPageViewed';
import { PublicShare } from '@/components/PublicShare';
import { PublicShell } from '@/components/PublicShell';
import { cardByUrlSlug, cardImage } from '@/data/deck';
import { headingIds, readingMinutes, wordCount } from '@/lib/content/doc';
import { formatLocalDate } from '@/lib/i18n/format';
import { localePath } from '@/lib/i18n/prefix';
import { getLocale, getT } from '@/lib/i18n/t';
import { contentAlternates } from '@/lib/seo/alternates';
import { blogPostingGraph } from '@/lib/seo/blog';
import { siteOrigin } from '@/lib/seo/origin';
import { loadCachedArticle } from './load';
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
 *   3. **ONE DATABASE MODULE, NAMED: `@/lib/db/queries/blog`** (v0.5.0 / A6, §9.4).
 *      `@/lib/db/client`, `@/lib/db/schema`, `@/lib/db/queries/admin/**` and every other
 *      `@/lib/db/**` specifier stay forbidden, **named by path exactly as
 *      `queries/contract.test.ts` excludes `client.ts` by name rather than by loosening
 *      the rule** — so a second database import is a test failure and not a shrug. (The
 *      `db` singleton is named in `load.ts`, which is where a request-scoped cache
 *      belongs and where `react` may be imported.)
 *
 *      **THE ORIGINAL RATIONALE HAS EXPIRED AND IS REWRITTEN RATHER THAN DELETED**
 *      (A6-27, R40). It said: *"there is no version of a database outage that makes this
 *      page 500 (roadmap §10), and no fourth route joining the three that already return
 *      500 instead of 204."* The honest replacement: **an outage makes `/blog/<slug>`
 *      unavailable, deliberately, with a 500 rather than a 404** — because a 404 on an
 *      indexable URL is a de-indexing event and a 500 is a retry (A6-24). The three
 *      routes that return 500 where they should return 204 (`/api/memory/frequency`,
 *      `/api/memory/summary`, `/api/persona`) are a DIFFERENT bug: those are 204-shaped
 *      endpoints where an empty answer is correct. **There is no empty article.**
 *      `sitemap.xml` is the one place that inverts this, and §10.2 says why.
 *   4. **NO MODEL CALL** (S-D7). The article is committed source, read by a human before
 *      it shipped.
 *
 * ── `generateStaticParams` AND `dynamicParams` ARE DELETED (A6-26, R41) ────────
 *
 * **KEEPING THEM WOULD BREAK THE ONE FEATURE THIS WORKSTREAM EXISTS TO BUILD.**
 * `generateStaticParams` runs at BUILD time, so `dynamicParams = false` closes the slug
 * space to the slugs that existed when the deploy was built — an article created
 * afterwards would 404 at the routing layer, before this module runs, with no fix but a
 * redeploy. Publishing would still require a deploy.
 *
 * **NOTHING IS LOST, AND THAT IS MEASURED RATHER THAN ASSUMED.** Three citations:
 *
 *   - This header used to say it, correctly: *"`generateStaticParams` DOES NOT MAKE THIS
 *     PAGE STATIC"*, because `app/layout.tsx` awaits `getLocale()` for `<html lang>` and
 *     `## Localization` rule 5 forbids "fixing" that. **The build output shows `ƒ` and
 *     that is the symptom of the rule working.** What the pair bought was a 404 at the
 *     routing layer, and `notFound()` below is already the belt for it.
 *   - **R21 of v0.4.0 is closed and the answer was "none of it"** — measured against the
 *     real Vercel CDN on 2026-07-29, all four blog URLs answer
 *     `private, no-cache, no-store` with `x-vercel-cache: MISS` on two consecutive
 *     fetches. All eight content entries in `next.config.ts` are inert. **There is no
 *     cache to lose.**
 *   - **ISR was never available**: it needs a static root layout, and S-D10 already
 *     refused multiple root layouts by route group.
 *
 * `blog.contract.test.ts` asserted both strings were PRESENT, so it was red on the
 * correct implementation (R40). It is **inverted**, with the reason in the test, so that
 * re-adding them is a failure rather than a tidy-up — a future session will otherwise
 * "restore" the static params and re-break publishing.
 *
 * `runtime` and `maxDuration` STAY, and matter more than they did: this page has
 * acquired a database and a Neon compute that sleeps, so a `POST /api/locale`-class cold
 * truncation is now reachable here.
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

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  /*
   * ONE READ PER REQUEST, shared with the body below through `React.cache()` (§9.3).
   * A driver error PROPAGATES from here — see `load.ts` and A6-24.
   */
  const loaded = await loadCachedArticle(slug, locale);
  if (!loaded) return {};
  const { doc, facts } = loaded;

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
      locales: facts.locales,
    }),
    openGraph: {
      type: 'article',
      title: doc.title,
      description: doc.description,
      locale: locale === 'en' ? 'en_US' : 'id_ID',
      publishedTime: facts.datePublished,
      modifiedTime: facts.dateModified,
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

  /*
   * `notFound()` FOR "EXISTS BUT NOT IN THIS LANGUAGE" TOO. Roadmap §1 permits an
   * Indonesian-only article, and the alternative — serving the Indonesian body under
   * `/en/blog/x` — is the half-translated page Miftah's `/s/` ruling rejected, at a URL
   * whose `hreflang` claims it is English. **NO CROSS-LOCALE FALLBACK**, which is I3's
   * argument applied to content.
   *
   * **AND IT IS NOW ALSO A6-7's SECOND DEFENCE** (R42): the query returns `null` for
   * *"`en` published, `id` not"*, so a row hand-edited in `db:studio` produces a 404
   * here rather than an unhandled throw out of `contentAlternates()` — which would be a
   * 500 on a URL in the sitemap. **`null` MEANS NO SUCH PUBLISHED ROW AND NOTHING
   * ELSE**; a driver error propagates (A6-24), because a 404 on an indexable URL is a
   * de-indexing event and a 500 is a retry.
   */
  const loaded = await loadCachedArticle(slug, locale);
  if (!loaded) notFound();
  const { doc, facts } = loaded;

  const origin = siteOrigin();
  const path = `/blog/${slug}`;
  const canonical = contentAlternates({
    origin,
    path,
    locale,
    locales: facts.locales,
  }).canonical;

  const sections = doc.body.filter((b) => b.kind === 'heading' && b.level === 2);
  const anchors = headingIds(doc.body, 2);
  const minutes = readingMinutes(wordCount(doc.body));
  const card = doc.hero ? cardByUrlSlug(doc.hero.cardUrlSlug) : undefined;

  /*
   * `locales` IS THE ARTICLE'S OWN SET (R45). Every other `PublicShell` caller omits
   * it, because their two addresses are one route file that cannot 404 in either
   * language; an article's `en` document can be unpublished between two page views,
   * and the footer would otherwise offer *English* to a page that answers 404 -- a
   * reader-facing dead link A6 creates. It is the same array `contentAlternates()`
   * received above, so the anchor and the `hreflang` tag cannot disagree.
   */
  return (
    <PublicShell surface="blog_post" path={path} locales={facts.locales}>
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
          {t('blog.published', { date: formatLocalDate(facts.datePublished, locale, true) })}
          {facts.dateModified !== facts.datePublished
            ? ` · ${t('blog.updated', { date: formatLocalDate(facts.dateModified, locale, true) })}`
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
          article: facts,
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
