import { PublicShell } from '@/components/PublicShell';
import { getLocale, getT } from '@/lib/i18n/t';
import { localePath } from '@/lib/i18n/prefix';
import styles from './page.module.css';

/**
 * A 404 in the reader's language, with a way onward. No session, no database, no model.
 *
 * **IT IS REACHED FOR TWO DIFFERENT REASONS AND SAYS SO IN ONE SENTENCE.** Either the
 * address is wrong, or the article exists and not in this language — roadmap §1 permits an
 * Indonesian-only article, and `page.tsx` calls `notFound()` for that case rather than
 * falling back to the other locale's body. `blog.notFound.body` names both, because a
 * reader cannot tell them apart and the second one has a remedy: switch language.
 *
 * `path` IS `/blog`, not the missing article's address. `PublicShell` passes it to
 * `ContentLocaleLink`, and `contentAlternates()` **throws** on a path with no document —
 * which is correct behaviour that would turn this 404 into a 500.
 */
export default async function BlogArticleNotFound() {
  const locale = await getLocale();
  const t = await getT();

  return (
    <PublicShell surface="blog_index" path="/blog">
      <article className={styles.page}>
        <h1 className={styles.h1}>{t('blog.notFound.title')}</h1>
        <p className={styles.meta}>{t('blog.notFound.body')}</p>
        <a className={styles.back} href={localePath(locale, '/blog')}>
          {t('blog.backToIndex')}
        </a>
      </article>
    </PublicShell>
  );
}
