/**
 * `/admin/blog/new` — name the article, then write it. **v0.5.0 / A6, task 20.**
 *
 * ── ONE FIELD, AND IT IS A NAVIGATION RATHER THAN A WRITE ──────────────────
 *
 * This page creates nothing. It takes a slug, validates its SHAPE, and redirects to
 * `/admin/blog/<slug>?locale=id`, where the first save creates both rows in one
 * transaction. **A "new" page that inserted an empty `blog_posts` row would leave an
 * article with no document behind every abandoned tab** — visible in the list, editable,
 * never publishable, and impossible to remove because there is no delete (A6-21).
 *
 * ── `id` FIRST, AND THAT IS NOT A DEFAULT — IT IS A6-7 ────────────────────
 *
 * The redirect names `locale=id` because publishing `en` first is refused:
 * `contentAlternates()` **throws** without an Indonesian document, which is a 500 on a
 * URL in the sitemap. Starting an author in English would let them write a whole article
 * they cannot publish. The tabs on the editor still offer both.
 *
 * ── THE SHAPE CHECK IS THE SAME REGEX IN ALL THREE PLACES ─────────────────
 *
 * `SLUG_RE` here, `documentSchema` on the save path, and a CHECK constraint on the
 * column. The third is the one that survives `db:studio`, which is R6's point: without
 * it `What-Tarot-Is` and `what-tarot-is` are two rows, two URLs and two `hreflang`
 * groups, and the only thing that would notice is a crawler.
 *
 * ── A PLAIN FORM, WORKING WITHOUT JAVASCRIPT ──────────────────────────────
 *
 * §11.4: the list and the status control are the two operations that matter when
 * something is wrong in production. This is a third for free — a `<form>` with a server
 * action and a `redirect()`.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/identity';
import { SLUG_RE } from '@/lib/content/lint';
import { DEFAULT_LOCALE } from '@/lib/i18n/locale';
import { AdminPageViewed } from '../../AdminPageViewed';
import { AdminTabs } from '../../AdminTabs';
import { BLOG } from '../copy';
import styles from '../blog.module.css';

export const runtime = 'nodejs';
/** A literal, for `adminSurface.test.ts`'s source-level match. */
export const maxDuration = 30;

export default async function AdminBlogNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const bad = sp.bad === '1';

  async function start(form: FormData) {
    'use server';
    /*
     * **THE ACTION GATES ITSELF.** A server action is a public HTTP endpoint with a
     * generated id; it is not protected by the page that renders the form and it runs
     * under no layout. `requireAdminPage()` answers a non-admin with `notFound()`.
     */
    await requireAdminPage();
    const slug = String(form.get('slug') ?? '').trim();
    if (!SLUG_RE.test(slug)) redirect('/admin/blog/new?bad=1');
    redirect(`/admin/blog/${slug}?locale=${DEFAULT_LOCALE}`);
  }

  return (
    <div className={styles.page}>
      <AdminTabs active="/admin/blog/new" />
      <AdminPageViewed page="/admin/blog/new" />

      <header className={styles.header}>
        <div>
          <Link className={styles.link} href="/admin/blog" prefetch={false}>
            {BLOG.backToList}
          </Link>
          {/* DEMOTED RATHER THAN HIDDEN, and the distinction is whether the tab already
              says it. `Tulisan` does not say `Tulisan baru`, so this stays on screen -- as
              a line beside the back link, not a display title competing with the tab row. */}
          <h1 className={styles.subject}>{BLOG.newArticle}</h1>
        </div>
      </header>

      <form action={start} className={styles.pane}>
        <label className={styles.field}>
          <span className={styles.label}>{BLOG.editor.slug}</span>
          <input
            className={styles.input}
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            autoComplete="off"
          />
          <span className={styles.hint}>{BLOG.editor.slugHint}</span>
          {bad ? (
            <span className={styles.bad} role="alert">
              {BLOG.editor.slugHint}
            </span>
          ) : null}
        </label>
        <button className={styles.primary} type="submit">
          {BLOG.newArticle}
        </button>
      </form>
    </div>
  );
}
