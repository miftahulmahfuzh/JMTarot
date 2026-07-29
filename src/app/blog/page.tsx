import type { Metadata } from 'next';

import { JsonLd } from '@/components/JsonLd';
import { PublicPageViewed } from '@/components/PublicPageViewed';
import { PublicShell } from '@/components/PublicShell';
import { TrackLink } from '@/components/TrackLink';
import { blogEntries } from '@/content/blog';
import { LOCALES } from '@/lib/i18n/locale';
import { readingMinutes, wordCount } from '@/lib/content/doc';
import { formatLocalDate } from '@/lib/i18n/format';
import { localePath } from '@/lib/i18n/prefix';
import { getLocale, getT } from '@/lib/i18n/t';
import { contentAlternates } from '@/lib/seo/alternates';
import { blogIndexGraph } from '@/lib/seo/blog';
import { siteOrigin } from '@/lib/seo/origin';
import styles from './page.module.css';

/**
 * `/blog` — the index. **PUBLIC, SESSION-LESS, DATABASE-FREE, CDN-CACHEABLE.**
 *
 * Every fence in `[slug]/page.tsx`'s header binds here identically and
 * `blog.contract.test.ts` walks this whole subtree. Two things specific to this page:
 *
 * **THE LIST IS FILTERED BY LOCALE, NOT MERELY LABELLED.** Roadmap §1 permits an
 * Indonesian-only article; listing one on `/en/blog` would be a link to a 404 in the one
 * place a crawler is most likely to follow every link on the page. It filters on
 * `entry.locales` — the same field `blogIndexNode` filters on and the same field
 * `hreflang` enumerates — so the visible list, the JSON-LD and the tag set cannot
 * disagree.
 *
 * **`LOCALES` IS CORRECT IN `generateMetadata` HERE AND NOWHERE ELSE ON THIS ROUTE.**
 * `contentAlternates` takes the locales that actually have a document (R2), and for the
 * index that is both, always: it is chrome, not an article, and there is one route file
 * that middleware rewrites — so neither `/blog` nor `/en/blog` can 404. An *article*
 * passes `entry.locales`, which is the answer that differs the day something ships in one
 * language.
 */

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getT();
  const origin = siteOrigin();

  return {
    title: t('blog.index.title'),
    description: t('blog.index.description'),
    alternates: contentAlternates({ origin, path: '/blog', locale, locales: LOCALES }),
    openGraph: {
      type: 'website',
      title: t('blog.index.title'),
      description: t('blog.index.description'),
      locale: locale === 'en' ? 'en_US' : 'id_ID',
    },
  };
}

export default async function BlogIndexPage() {
  const locale = await getLocale();
  const t = await getT();
  const origin = siteOrigin();
  const entries = blogEntries().filter((entry) => entry.locales.includes(locale));

  return (
    <PublicShell surface="blog_index" path="/blog">
      <main className={styles.page}>
        <PublicPageViewed page="blog_index" locale={locale} />

        {/* THE SINGLE `<h1>`. Each article's title below is an `<h2>`. */}
        <h1 className={styles.h1}>{t('blog.index.title')}</h1>
        <p className={styles.lede}>{t('blog.index.lede')}</p>

        <ul className={styles.list}>
          {entries.map((entry) => {
            const doc = entry.docs[locale]!;
            const href = localePath(locale, `/blog/${entry.slug}`);
            return (
              <li key={entry.slug} className={styles.item}>
                {/*
                  `<h2>` inside the link, not a `<div>` styled large: the list of articles
                  IS the index's structure, and a heading used for size is a heading lying.
                  One anchor wrapping the heading and one *Read the article* link below it,
                  both to the same href — two targets for one destination is deliberate on
                  a phone, where the title is the obvious tap and the labelled link is the
                  discoverable one.
                */}
                <a className={styles.itemLink} href={href}>
                  <h2 className={styles.itemTitle}>{doc.title}</h2>
                </a>
                <p className={styles.itemMeta}>
                  {t('blog.published', {
                    date: formatLocalDate(entry.datePublished, locale, true),
                  })}
                  {` · ${t.plural('blog.readingTime', readingMinutes(wordCount(doc.body)))}`}
                </p>
                <p className={styles.itemDescription}>{doc.description}</p>
                <a className={styles.more} href={href}>
                  {t('blog.readMore')}
                </a>
              </li>
            );
          })}
        </ul>

        {/*
          **TWO ARTICLES IS A THIN INDEX AND THE ANSWER IS NOT A FILLER CARD.** These three
          links are the answer: a reader who lands here from a search for "apa itu tarot"
          should leave with somewhere to go even if neither article is it. They are also
          the internal linking the blog exists to do in a release whose structural bet is
          44 card pages.

          `TrackLink` and a LITERAL `to`, never `linkKind()`'s value: `public.link_clicked`
          is S1's event and its `to` union is closed (`events.ts` rules 1 and 2). The lore
          pages' gallery link does exactly this.
        */}
        <nav className={styles.orient} aria-labelledby="orient-title">
          <p className={styles.orientTitle} id="orient-title">
            {t('blog.orient.title')}
          </p>
          <ul className={styles.orientList}>
            <li>
              <TrackLink
                href={localePath(locale, '/gallery')}
                name="public.link_clicked"
                props={{ from: 'blog_index', to: 'gallery', slug: null }}
              >
                {t('blog.orient.gallery')}
              </TrackLink>
            </li>
            <li>
              <TrackLink
                href={localePath(locale, '/arcana/the-fool')}
                name="public.link_clicked"
                props={{ from: 'blog_index', to: 'arcana', slug: 'the-fool' }}
              >
                {t('blog.orient.firstCard')}
              </TrackLink>
            </li>
            <li>
              <TrackLink
                href={localePath(locale, '/arcana/death')}
                name="public.link_clicked"
                props={{ from: 'blog_index', to: 'arcana', slug: 'death' }}
              >
                {t('blog.orient.feared')}
              </TrackLink>
            </li>
          </ul>
        </nav>

        <p className={styles.disclaimer}>{t('common.disclaimer.short')}</p>

        <JsonLd
          node={blogIndexGraph({
            origin,
            locale,
            name: t('blog.index.title'),
            description: t('blog.index.description'),
            entries,
            homeLabel: t('public.crumb.home'),
            homeUrl: `${origin}${localePath(locale, '/')}`,
          })}
        />
      </main>
    </PublicShell>
  );
}
