/**
 * `/admin/blog/[slug]` — the per-locale document editor. **v0.5.0 / A6, tasks 20–22,
 * rewritten 2026-07-31 by the markdown editor.**
 *
 * Two panes on a desktop width, stacked below it. Left: three fields, two model buttons and
 * the lint panel. Right: the real `Prose` renderer, plus the table of contents the public
 * page builds.
 *
 * ── A6-32 SURVIVES, AND ITS COST IS NOW PAID DIFFERENTLY ───────────────────
 *
 * A6's plan said *"the right pane mounts `Prose` with the parsed blocks"* and then noticed
 * a problem it had not planned for: **`Prose` is a SERVER component and the editor is a
 * client one.** It imports `@/lib/i18n/t`, and `clientBoundary.test.ts` fences
 * `src/content/**` from client components *"because `Prose` is a SERVER component and
 * importing `@/lib/i18n/t` is what makes that permanent"*. So a client editor cannot hand
 * it live state, and there is no live preview to have.
 *
 * The three ways out were: render the SAVED row server-side and be one save behind
 * (chosen); reimplement the renderer in a client component, which is a second definition of
 * the thing A6-35's byte-identity argument rests on being single; or a preview endpoint
 * returning HTML, which is `dangerouslySetInnerHTML` on an admin page and A-D10 refuses it.
 *
 * **THE CHOICE IS UNCHANGED AND THE STALENESS IS GONE** (design R5). `Format otomatis`
 * WRITES the draft row and then navigates, so the pane below always shows what is stored.
 * `BLOG.editor.previewStale` is deleted rather than kept, because a hint that says *"satu
 * simpan di belakang"* when it no longer is teaches somebody to distrust the preview.
 *
 * **`previewHref` STAYS.** `Prose` resolves the locale itself, so an `en` document previewed
 * by an Indonesian admin shows `/arcana/the-moon` where the live page shows
 * `/en/arcana/the-moon`. Accepted, unchanged, still on screen.
 *
 * ── THE 22 SLUGS ARE RESOLVED HERE, ON THE SERVER ─────────────────────────
 *
 * `cardByUrlSlug` lives in `@/data/deck`, and the editor gets a plain `string[]` rather
 * than the deck. A `<select>` means a free-text slug is not reachable through the UI
 * (A6-20); `resolveViolations` on the save path covers every other caller.
 *
 * **THE HERO `alt` IS NOT PASSED AND THERE IS NO FIELD FOR IT** (design §7). It is derived
 * from the card's own `LoreDoc.imageAlt` inside `saveDocument`, because all four committed
 * articles answered that field with the bare card name — the one thing `LoreDoc.imageAlt`
 * forbids in its own words.
 */import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArticleToc } from '@/components/ArticleToc';
import { Prose } from '@/components/Prose';
import { CARD_URL_SLUGS } from '@/data/deck';
import { requireAdminPage } from '@/lib/admin/identity';
import { db } from '@/lib/db/client';
import { getForEdit } from '@/lib/db/queries/admin/blog';
import { isLocale, DEFAULT_LOCALE } from '@/lib/i18n/locale';
import { SLUG_RE } from '@/lib/content/lint';
import { AdminPageViewed } from '../../AdminPageViewed';
import { AdminTabs } from '../../AdminTabs';
import { MarkdownEditor } from '../MarkdownEditor';
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
        {/*
          **`key={locale}` IS THE DIFFERENCE BETWEEN THE LOCALE TABS WORKING AND THE
          LOCALE TABS DESTROYING A PUBLISHED ARTICLE, AND IT WAS MISSING.**

          It survived the block editor's deletion because the defect is not the block
          editor's: a `<textarea>` seeded from a prop has it identically.

          The tabs above are `<Link>`s, so pressing one is a SOFT navigation within this
          same route segment. The server re-renders and the preview pane below updates —
          which is exactly how the defect was reported, *"clicking one of these only
          changes Pratinjau konten"* — but React reconciles the editor as the same
          element, and every field inside it is `useState(initial?.… ?? '')`. **An
          initialiser runs on mount and never again**, so the form keeps the document of
          the locale you just navigated AWAY from.

          Then `save()` posts `{ slug, locale }` with the NEW locale. Open `?locale=id`,
          press `English`, press `Simpan`, and the Indonesian body is written into the
          `en` row — silent content loss behind a screen where nothing looks wrong.

          This is the class of bug CLAUDE.md already records twice under different
          names: `shuffleDeck()` in a `useState` initialiser, and `todayKey()` during
          render. **State seeded from a prop that later changes.** The key makes the
          remount the navigation already implies, and it survives the markdown editor —
          a `<textarea>` seeded from a prop has the identical defect.
        */}
        <MarkdownEditor
          key={locale}
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
                  // `heroAlt` is NOT passed: the editor has no field for it and the save
                  // path derives it from the card's lore document. See §7 of the design.
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
            A6-35's byte-identity argument rests on being single. What changed on
            2026-07-31 is that both buttons now navigate, so the row on screen is the row
            in the database and `previewStale` is deleted rather than reworded.
          */}
          <p className={styles.hint}>{BLOG.editor.previewHref}</p>
          {row ? (
            <article className={styles.preview}>
              <h3 className={styles.previewTitle}>{row.title}</h3>
              <p className={styles.previewDesc}>{row.description}</p>
              {/*
                **THE OUTLINE THE PUBLIC PAGE BUILDS, IN THE PANE THE OPERATOR WATCHES.**
                It has existed since S6 and no operator had ever seen it, because this pane
                mounted `Prose` alone. One component, two mounts (§9) — the label is a prop
                so nothing here reaches for `t()`, which `adminCopy.test.ts` forbids across
                this whole tree.
              */}
              <ArticleToc blocks={row.body} label={BLOG.editor.previewToc} />
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
