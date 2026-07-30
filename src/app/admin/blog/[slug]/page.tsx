/**
 * `/admin/blog/[slug]` — the per-locale document editor. **v0.5.0 / A6, tasks 20–22.**
 *
 * Two panes on a desktop width, stacked below it. Left: the field editor, the block
 * list, the span rows and the lint panel. Right: the real `Prose` renderer.
 *
 * ── A6-32 IS AMENDED, AND THE AMENDMENT IS BIGGER THAN THE ONE IT PLANNED ──
 *
 * The plan says *"the right pane mounts `Prose` with the parsed blocks"* and then
 * reasons only about hrefs: `Prose` calls `getLocale()` itself, so an `en` document
 * previewed by an Indonesian admin shows `/arcana/the-moon` where the live page shows
 * `/en/arcana/the-moon`. That is accepted, unchanged, and the line of admin copy saying
 * so is on screen.
 *
 * **WHAT THE PLAN DID NOT NOTICE IS THAT `Prose` IS A SERVER COMPONENT AND THE BLOCK
 * EDITOR IS A CLIENT ONE.** `Prose` imports `@/lib/i18n/t`, and `clientBoundary.test.ts`
 * fences `src/content/**` from client components *"because `Prose` is a SERVER component
 * and importing `@/lib/i18n/t` is what makes that permanent"*. So a client editor
 * **cannot** hand it live state, and there is no live preview to have.
 *
 * The three ways out, and why this one:
 *
 *   1. **Render the SAVED row through the real `Prose`, server-side.** The preview is one
 *      save behind while typing. **Chosen.**
 *   2. Reimplement the renderer in a client component. That is a second definition of
 *      the thing A6-35's whole byte-identity argument rests on being single —
 *      *"deep-equality of `body` is byte-identity of the rendered prose, and this is
 *      checkable precisely because `Prose.tsx` is unchanged"*. A preview rendered by a
 *      different component would agree with the page right up until it did not.
 *   3. A preview endpoint returning server-rendered HTML. That is `dangerouslySetInnerHTML`
 *      on an admin page, which A-D10's CSP argument refuses on prose we wrote.
 *
 * **What the preview is FOR survives option 1 intact**: it is the real renderer, so the
 * structure, the emphasis, the list semantics and the span joining are exactly what will
 * ship. What it costs is immediacy, and the span strip (A6-31) covers the one thing that
 * needs to be immediate — a boundary space is invisible in a form field and visible in
 * the strip as you type.
 *
 * ── THE 22 SLUGS ARE RESOLVED HERE, ON THE SERVER ─────────────────────────
 *
 * `cardByUrlSlug` lives in `@/data/deck`, and the editor gets a plain `string[]` rather
 * than the deck. A `<select>` means a free-text slug is not reachable through the UI
 * (A6-20); `resolveViolations` on the save path is what covers everything that is not
 * the UI, which is every other caller this route will ever have.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Prose } from '@/components/Prose';
import { CARD_URL_SLUGS } from '@/data/deck';
import { requireAdminPage } from '@/lib/admin/identity';
import { db } from '@/lib/db/client';
import { getForEdit } from '@/lib/db/queries/admin/blog';
import { isLocale, DEFAULT_LOCALE } from '@/lib/i18n/locale';
import { SLUG_RE } from '@/lib/content/lint';
import { AdminPageViewed } from '../../AdminPageViewed';
import { AdminTabs } from '../../AdminTabs';
import { BlockEditor } from '../BlockEditor';
import { BLOG } from '../copy';
import styles from '../blog.module.css';

export const runtime = 'nodejs';
/** A literal, for `adminSurface.test.ts`'s source-level match. */
export const maxDuration = 30;

export default async function AdminBlogEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const { slug } = await params;
  const sp = await searchParams;

  /*
   * **A MALFORMED SLUG IS A 404, NOT A 400** — every refusal in this tree is
   * byte-identical so that *"does this exist"* is unanswerable from the outside, and a
   * slug that cannot satisfy the CHECK constraint could never name a row anyway.
   */
  if (!SLUG_RE.test(slug)) notFound();

  const raw = sp.locale;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  const article = await getForEdit(db, slug);
  const row = article?.locales.find((l) => l.locale === locale) ?? null;

  /*
   * A6-30. **THE SLUG IS FROZEN THE MOMENT ANY LOCALE IS PUBLISHED**, not when THIS one
   * is: the address is the article's, and `contentAlternates()` derives the `/en/` twin
   * from the one path.
   */
  const slugFrozen = (article?.locales ?? []).some((l) => l.status !== 'draft');

  /*
   * Is there a document in the OTHER locale to seed this one from? Resolved here because
   * the editor only ever holds one locale's row, and a button that offers to translate
   * from nothing is a button that answers with an error.
   *
   * **A BODY, NOT MERELY A ROW.** A row with an empty body would spend a model call to
   * produce an empty document.
   */
  const canTranslate = (article?.locales ?? []).some(
    (l) => l.locale !== locale && l.body.length > 0,
  );

  return (
    <div className={styles.page}>
      <AdminTabs active="/admin/blog/[slug]" />
      <AdminPageViewed page="/admin/blog/[slug]" />

      <header className={styles.header}>
        <div>
          <Link className={styles.link} href="/admin/blog" prefetch={false}>
            {BLOG.backToList}
          </Link>
          {/* DEMOTED RATHER THAN HIDDEN: the slug is the only thing on this page that says
              WHICH article is being edited, and no tab can carry it. See `new/page.tsx`. */}
          <h1 className={styles.subject}>
            <code>{slug}</code>
          </h1>
        </div>
        <nav className={styles.localeTabs} aria-label="Bahasa">
          {(['id', 'en'] as const).map((l) => (
            <Link
              key={l}
              className={styles.tab}
              data-active={l === locale}
              href={`/admin/blog/${slug}?locale=${l}`}
              prefetch={false}
            >
              {BLOG.editor.localeTab(l)}
            </Link>
          ))}
        </nav>
      </header>

      <div className={styles.twoPane}>
        <BlockEditor
          slug={slug}
          locale={locale}
          slugFrozen={slugFrozen}
          canTranslate={canTranslate}
          initial={
            row
              ? {
                  title: row.title,
                  description: row.description,
                  heroCardSlug: row.heroCardSlug,
                  heroAlt: row.heroAlt,
                  body: row.body,
                }
              : null
          }
          cardSlugs={CARD_URL_SLUGS}
        />

        <section className={styles.pane}>
          <h2 className={styles.h2}>{BLOG.editor.previewTitle}</h2>
          {/*
            **THE REAL RENDERER, ON THE SAVED ROW.** See the header: `Prose` is a server
            component and the editor is a client one, so there is no live preview to
            have — and a second renderer would be a second definition of the thing
            A6-35's byte-identity argument rests on being single.
          */}
          <p className={styles.hint}>{BLOG.editor.previewStale}</p>
          <p className={styles.hint}>{BLOG.editor.previewHref}</p>
          {row ? (
            <article className={styles.preview}>
              <h3 className={styles.previewTitle}>{row.title}</h3>
              <p className={styles.previewDesc}>{row.description}</p>
              <Prose blocks={row.body} />
            </article>
          ) : (
            <p className={styles.empty}>{BLOG.editor.previewEmpty}</p>
          )}
        </section>
      </div>
    </div>
  );
}
