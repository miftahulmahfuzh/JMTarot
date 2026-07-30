/**
 * `/admin/blog` — the list. **v0.5.0 / A6, task 19.**
 *
 * One table, every status, both locales per row: slug · `date_published` · a status chip
 * and control per locale · `updated_at` per locale · word count · block count · a lint
 * badge.
 *
 * ── NO DELETE CONTROL, ANYWHERE (A6-21) ────────────────────────────────────
 *
 * `unpublished` is the removal path. A hard delete of an article whose URL was public
 * leaves no record of what was there, and `draft` — the other way to hide it — means
 * NEVER PUBLIC and must stay unreachable from either public state, or an admin can
 * launder a public URL into a private one with nothing recording the change. The reason
 * is on screen, not only here: an operator looking for a delete button should find the
 * argument rather than conclude the feature is missing.
 *
 * ── IT WORKS WITH JAVASCRIPT OFF (§11.4) ───────────────────────────────────
 *
 * The list is a server-rendered table and the status control is a `<form action={…}>`
 * over a server action. **Those are the two operations that matter when something is
 * wrong in production**, which is exactly when a hydration failure is likeliest.
 *
 * ── THE LINT BADGE IS COMPUTED HERE AND IS NOT A SECOND LINT ───────────────
 *
 * Same `lintDocument` + `rulesFor`, same `resolveViolations`, one call per document. It
 * is a COUNT rather than a list because the row cannot hold sentences; the editor
 * renders the array grouped by field. Nothing is cached: a stale lint badge on a page
 * whose whole purpose is to say what needs attention is worse than a second query.
 *
 * ── NO AUDIT ROW (A-D16) ───────────────────────────────────────────────────
 *
 * A1's primitive records privileged reads of *another person's* data. Blog prose is the
 * operator's own public content; `admin.blog_saved` and `admin.blog_status_changed` are
 * the record, and `blog_post_locales.updated_at` is the timestamp.
 */
import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/identity';
import { resolveViolations } from '@/lib/content/blogResolve';
import { isReachable, type BlogStatus } from '@/lib/content/blogStatus';
import { wordCount } from '@/lib/content/doc';
import { lintDocument, rulesFor, type LintDoc } from '@/lib/content/lint';
import { db } from '@/lib/db/client';
import { listAllArticles } from '@/lib/db/queries/admin/blog';
import { publishedSlugs } from '@/lib/db/queries/blog';
import { LOCALES, type Locale } from '@/lib/i18n/locale';
import { AdminPageViewed } from '../AdminPageViewed';
import { AdminTabs } from '../AdminTabs';
import { BLOG } from './copy';
import { StatusControl } from './StatusControl';
import styles from './blog.module.css';

export const runtime = 'nodejs';
/** A literal, for `adminSurface.test.ts`'s source-level match. Equal to A3's 30. */
export const maxDuration = 30;

export default async function AdminBlogListPage() {
  await requireAdminPage();

  /*
   * **NOT `withAdminRead`.** That wrapper sets `transaction_read_only = on`, which is
   * right for A3's dashboards and wrong here for a reason worth stating: this page is
   * one hop from the status control, and a read-only transaction leaking into a write
   * is the failure `timeout.ts`'s savepoint comment describes at length. The reads here
   * are two indexed selects over a table with single-digit rows.
   */
  const [articles, known] = await Promise.all([listAllArticles(db), publishedSlugs(db)]);

  const rows = articles.map((article) => {
    const idStatus =
      (article.locales.find((l) => l.locale === 'id')?.status as BlogStatus | undefined) ?? 'draft';
    return {
      ...article,
      idStatus,
      byLocale: LOCALES.map((locale) => {
        const row = article.locales.find((l) => l.locale === locale) ?? null;
        if (!row) return { locale, row: null, violations: 0, errors: 0, words: 0 };
        const doc: LintDoc = {
          locale,
          slug: article.slug,
          title: row.title,
          description: row.description,
          hero:
            row.heroCardSlug !== null && row.heroAlt !== null
              ? { cardUrlSlug: row.heroCardSlug, alt: row.heroAlt }
              : null,
          body: row.body,
        };
        const v = [...lintDocument(doc, rulesFor(article.slug)), ...resolveViolations(doc, known)];
        return {
          locale,
          row,
          violations: v.length,
          errors: v.filter((x) => x.cls === 'error').length,
          words: wordCount(row.body),
        };
      }),
    };
  });

  return (
    <div className={styles.page}>
      <AdminTabs active="/admin/blog" />
      <AdminPageViewed page="/admin/blog" />

      <header className={styles.header}>
        <div>
          {/* Hidden, not deleted -- see `/admin/page.tsx`. The lede stays visible: it says
              something the tab does not. */}
          <h1 className={styles.srOnly}>{BLOG.title}</h1>
          <p className={styles.lede}>{BLOG.lede}</p>
        </div>
        <Link className={styles.primary} href="/admin/blog/new" prefetch={false}>
          {BLOG.newArticle}
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className={styles.empty}>{BLOG.empty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{BLOG.colSlug}</th>
                <th scope="col">{BLOG.colPublished}</th>
                {LOCALES.map((l) => (
                  <th scope="col" key={l}>
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((article) => (
                <tr key={article.slug}>
                  <th scope="row" className={styles.slugCell}>
                    <code>{article.slug}</code>
                  </th>
                  <td className={styles.num}>{article.datePublished ?? '—'}</td>
                  {article.byLocale.map(({ locale, row, violations, errors, words }) => (
                    <td key={locale} className={styles.localeCell}>
                      {row ? (
                        <>
                          <StatusControl
                            slug={article.slug}
                            locale={locale}
                            status={row.status}
                            /*
                             * A6-22. The row says `published` and the URL 404s anyway,
                             * because reachability is DERIVED from `id` rather than
                             * cascaded — the safe direction, since the derived answer
                             * is less public rather than more.
                             */
                            unreachable={
                              row.status === 'published' &&
                              !isReachable(locale as Locale, row.status, article.idStatus)
                            }
                          />
                          <p className={styles.meta}>
                            {BLOG.colUpdated} {row.updatedAt.toISOString().slice(0, 10)} ·{' '}
                            {words} {BLOG.colWords.toLowerCase()} · {row.body.length}{' '}
                            {BLOG.colBlocks.toLowerCase()}
                          </p>
                          <p className={styles.meta} data-lint={errors > 0 ? 'error' : 'ok'}>
                            lint: {errors > 0 ? `${errors} ✕` : '✓'}
                            {violations - errors > 0 ? ` · ${violations - errors} !` : ''}
                          </p>
                          <Link
                            className={styles.link}
                            href={`/admin/blog/${article.slug}?locale=${locale}`}
                            prefetch={false}
                          >
                            {BLOG.edit(locale)}
                          </Link>
                        </>
                      ) : (
                        <Link
                          className={styles.link}
                          href={`/admin/blog/${article.slug}?locale=${locale}`}
                          prefetch={false}
                        >
                          {BLOG.create(locale)}
                        </Link>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.note}>{BLOG.noDelete}</p>
    </div>
  );
}
