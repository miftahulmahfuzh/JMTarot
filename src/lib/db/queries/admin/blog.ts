/**
 * The ADMIN blog reads and writes. **v0.5.0 / A6, §9.1.**
 *
 * The four rules of this directory, applied: the handle comes FIRST; nothing here
 * imports `../../client`, `react`, `next/*` or `server-only`, not even transitively
 * (`contract.test.ts` walks the graph); no caching; one file per concern.
 *
 * ── IT SEES EVERY STATUS, WHICH IS WHY IT IS A SEPARATE FILE (A6-25) ────────
 *
 * `queries/blog.ts` **cannot return an unpublished row at all** and the public pages
 * import that one. The cost of merging them is one edit away at all times: somebody
 * adds `status` to a shared projection for the admin list, and a draft becomes
 * reachable on `/blog`.
 *
 * ── A6-8. `updatedAt` IS SET BY HAND IN EVERY UPSERT — AND THE TRAP BEHIND THE
 *    RULE IS **NOT TRUE OF THE INSTALLED DRIZZLE**, MEASURED 2026-07-30 ────────
 *
 * The rule stands. The reason it is usually given does not, and saying so is the
 * point: CLAUDE.md states in capitals that *"Drizzle's `$onUpdate()` does not fire
 * inside `onConflictDoUpdate`"*, and `schema.ts` repeats it at `translations`, at
 * `personas` and (on that authority) at both of A6's tables.
 *
 * **ON drizzle-orm 0.45.2 IT FIRES.** The emitted SQL for this upsert is
 * `… on conflict ("post_id","locale") do update set "title" = $7, "updated_at" = $8`
 * with the by-hand line REMOVED — measured by printing `.toSQL()`, and reproduced
 * identically on `translations` and `personas`. **The negative control for the
 * integration test below therefore passed with the line deleted**, which is the same
 * shape of defect A5 reported one workstream ago: *inside `withRollback`, an
 * instrument that cannot distinguish two causes is an instrument that proves
 * nothing.*
 *
 * **THE LINE STAYS, FOR REASONS THAT DO NOT DEPEND ON THE LIBRARY:**
 *
 *   - This column is `dateModified` -- a claim in structured data -- and
 *     `sitemap.xml`'s per-URL `lastModified`. Resting three public claims on a
 *     transitive behaviour of a dependency, undocumented at the version we pin, is
 *     not a thing to do on purpose.
 *   - `V2`'s translation staleness is `translations.updated_at < source.updated_at`
 *     with **no `source_hash` column**, so the same behaviour is load-bearing there
 *     for a mechanism nothing else backs up.
 *   - Every upsert in `src/lib/db/queries/**` spells it. One that does not reads as
 *     an oversight to the next person, and *"the others are wrong"* is not what they
 *     will conclude.
 *
 * **WHAT THE TEST BELOW ACTUALLY FENCES**, stated because the first draft claimed
 * more: it asserts the column MOVES on the second write, which is the property that
 * matters and is currently satisfied twice over. It cannot tell which mechanism did
 * it. The finding is recorded in `docs/workstream-notes.md`; **CLAUDE.md's trap is
 * the reconciliation's to amend, not A6's.**
 *
 * ── ONE TRANSACTION PER SAVE, AND A `422` WRITES NOTHING ────────────────────
 *
 * `upsertDocument` does the post and the locale row together. The lint and the zod
 * parse run **before** it in the route handler, so a refusal writes nothing -- not a
 * draft, not a partial row. A stored `Block[]` the renderer cannot render is a 500
 * on a public page with the row already committed (A-D14).
 *
 * ── NO `admin_access_log` ROW, AND THAT IS A DECISION ───────────────────────
 *
 * A1's audit primitive records privileged reads of **another person's** data
 * (A-D16). A blog save is an admin writing public content the admin authored;
 * `admin.blog_saved` and `admin.blog_status_changed` are the record, and
 * `blog_post_locales.updated_at` is the timestamp. Written down because *"audit
 * everything"* is the reflex and **an audit table that fills with routine writes is
 * an audit table nobody reads.**
 *
 * ── THERE IS NO DELETE, IN THIS FILE OR ANYWHERE (A6-21) ────────────────────
 *
 * `unpublished` is the removal path. A hard delete of an article whose URL was
 * public leaves no record of what was there, and `draft` -- which would be the other
 * way to hide it -- means NEVER PUBLIC and must stay unreachable from either public
 * state.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Locale } from '@/data/types';
import type { Block } from '@/content/types';
import type { BlogStatus } from '@/lib/content/blogStatus';
import { blogPostLocales, blogPosts } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';

/** One `(slug, locale)` row as the admin list and the editor see it. */
export type AdminLocaleRow = {
  locale: Locale;
  status: BlogStatus;
  title: string;
  description: string;
  heroCardSlug: string | null;
  heroAlt: string | null;
  body: Block[];
  updatedAt: Date;
};

/** One article with every locale row it has, whatever the status. */
export type AdminArticle = {
  id: string;
  slug: string;
  datePublished: string | null;
  updatedAt: Date;
  locales: AdminLocaleRow[];
};

/**
 * Every article, every status, newest first.
 *
 * **NO PAGING, DELIBERATELY, AND THE NUMBER IS THE REASON.** A5's user list is
 * offset-paged because it lists people; this lists articles the operator wrote, and
 * there are two. A5-13's ceiling logic applies in reverse: paging a two-row table is
 * a control nobody exercises and a `nextOffset` nobody reads. **Revisit past roughly
 * fifty**, which is the same threshold `src/content/blog/index.ts` set for lazy
 * imports and did not reach either.
 *
 * `body` comes back because the list renders a word count. That is the one thing
 * making it non-trivial, and it is worth it: a draft's length is the operator's only
 * signal of whether it is nearly done.
 */
export async function listAllArticles(db: DbOrTx): Promise<AdminArticle[]> {
  const rows = await db
    .select({
      id: blogPosts.id,
      slug: blogPosts.slug,
      datePublished: blogPosts.datePublished,
      postUpdatedAt: blogPosts.updatedAt,
      locale: blogPostLocales.locale,
      status: blogPostLocales.status,
      title: blogPostLocales.title,
      description: blogPostLocales.description,
      heroCardSlug: blogPostLocales.heroCardSlug,
      heroAlt: blogPostLocales.heroAlt,
      body: blogPostLocales.body,
      updatedAt: blogPostLocales.updatedAt,
    })
    .from(blogPosts)
    .leftJoin(blogPostLocales, eq(blogPostLocales.postId, blogPosts.id))
    .orderBy(sql`${blogPosts.datePublished} desc nulls first`, asc(blogPosts.slug));

  const bySlug = new Map<string, AdminArticle>();
  for (const r of rows) {
    const article = bySlug.get(r.slug) ?? {
      id: r.id,
      slug: r.slug,
      datePublished: r.datePublished,
      updatedAt: r.postUpdatedAt,
      locales: [],
    };
    /*
     * `leftJoin` so an article with no locale row at all still lists. That state is
     * reachable -- `POST /api/admin/blog` writes the post and the first document in
     * one transaction, but a future bulk tool need not -- and an article invisible in
     * the only UI that could fix it is worse than an empty row.
     */
    if (r.locale !== null) {
      article.locales.push({
        locale: r.locale,
        status: r.status as BlogStatus,
        title: r.title!,
        description: r.description!,
        heroCardSlug: r.heroCardSlug,
        heroAlt: r.heroAlt,
        body: r.body as Block[],
        updatedAt: r.updatedAt!,
      });
    }
    bySlug.set(r.slug, article);
  }
  return [...bySlug.values()];
}

/** One article for the editor, every status. `null` for an unknown slug. */
export async function getForEdit(db: DbOrTx, slug: string): Promise<AdminArticle | null> {
  const all = await listAllArticles(db);
  return all.find((a) => a.slug === slug) ?? null;
}

/** The sibling `id` row's status, or `'draft'` when there is no row (A6-7's input). */
export async function idStatusOf(db: DbOrTx, slug: string): Promise<BlogStatus> {
  const [row] = await db
    .select({ status: blogPostLocales.status })
    .from(blogPosts)
    .innerJoin(blogPostLocales, eq(blogPostLocales.postId, blogPosts.id))
    .where(and(eq(blogPosts.slug, slug), eq(blogPostLocales.locale, 'id')));
  return (row?.status as BlogStatus | undefined) ?? 'draft';
}

export type UpsertInput = {
  slug: string;
  locale: Locale;
  title: string;
  description: string;
  hero: { cardUrlSlug: string; alt: string } | null;
  body: Block[];
};

/**
 * Create or update one `(slug, locale)` document. **ONE TRANSACTION.**
 *
 * Returns whether the LOCALE ROW was created or updated -- `admin.blog_saved.action`
 * -- which is not the same question as whether the POST was. Creating the `en`
 * document of an existing article is a `create` for that document and touches an
 * article that already existed.
 *
 * **`status` IS NOT WRITABLE HERE.** A save never changes publication state; that is
 * `setStatus`, which runs the state machine. Two paths that can both publish is how
 * one of them ends up without the gate.
 */
export async function upsertDocument(
  db: DbOrTx,
  input: UpsertInput,
): Promise<{ action: 'create' | 'update'; postId: string }> {
  const now = new Date();

  const [post] = await db
    .insert(blogPosts)
    .values({ slug: input.slug, updatedAt: now })
    .onConflictDoUpdate({
      target: blogPosts.slug,
      /*
       * A6-8. `$onUpdate()` does not fire in here. On `blog_posts` this column is
       * row bookkeeping rather than `dateModified` (R6), so the cost of forgetting
       * it is smaller -- which is exactly why it would be forgotten, and why both
       * tables spell it the same way.
       */
      set: { updatedAt: now },
    })
    .returning({ id: blogPosts.id });

  const existing = await db
    .select({ id: blogPostLocales.id })
    .from(blogPostLocales)
    .where(and(eq(blogPostLocales.postId, post.id), eq(blogPostLocales.locale, input.locale)));

  await db
    .insert(blogPostLocales)
    .values({
      postId: post.id,
      locale: input.locale,
      title: input.title,
      description: input.description,
      heroCardSlug: input.hero?.cardUrlSlug ?? null,
      heroAlt: input.hero?.alt ?? null,
      body: input.body,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [blogPostLocales.postId, blogPostLocales.locale],
      set: {
        title: input.title,
        description: input.description,
        heroCardSlug: input.hero?.cardUrlSlug ?? null,
        heroAlt: input.hero?.alt ?? null,
        body: input.body,
        /*
         * **THIS LINE IS `dateModified`** -- and see the header: on drizzle 0.45.2
         * `$onUpdate()` fires here too, so this is currently the SECOND of two
         * mechanisms rather than the only one. It stays because three public claims
         * should not rest on an undocumented behaviour of a pinned dependency, and
         * because every other upsert in this directory spells it.
         */
        updatedAt: now,
      },
    });

  return { action: existing.length > 0 ? 'update' : 'create', postId: post.id };
}

/**
 * Write a status transition. **THE CALLER HAS ALREADY RUN `canTransition`.**
 *
 * Sets `date_published` on the first publish of any locale and **never rewrites it**
 * (§8.1): an unpublished article that comes back is the same article, and moving its
 * publication date would tell every crawler it is new.
 *
 * Returns the previous status, so the route can fire `admin.blog_status_changed`
 * with a truthful `from` -- read inside the same transaction as the write, because
 * a `from` read before the transaction is a `from` another request could have moved.
 */
export async function setStatus(
  db: DbOrTx,
  slug: string,
  locale: Locale,
  to: BlogStatus,
): Promise<{ from: BlogStatus } | null> {
  const [row] = await db
    .select({
      localeRowId: blogPostLocales.id,
      postId: blogPosts.id,
      status: blogPostLocales.status,
      datePublished: blogPosts.datePublished,
    })
    .from(blogPosts)
    .innerJoin(blogPostLocales, eq(blogPostLocales.postId, blogPosts.id))
    .where(and(eq(blogPosts.slug, slug), eq(blogPostLocales.locale, locale)));
  if (!row) return null;

  const now = new Date();
  /*
   * `db.update()` DOES fire `$onUpdate()`, so `updatedAt` would move on its own
   * here -- and it is set by hand anyway, because a status change IS a change to
   * the document's public state and `lastModified` should say so, and because two
   * spellings of "how does this column get written" in one file is how the upsert
   * loses its line during a tidy-up.
   */
  await db
    .update(blogPostLocales)
    .set({ status: to, updatedAt: now })
    .where(eq(blogPostLocales.id, row.localeRowId));

  if (to === 'published' && row.datePublished === null) {
    await db
      .update(blogPosts)
      .set({ datePublished: now.toISOString().slice(0, 10), updatedAt: now })
      .where(eq(blogPosts.id, row.postId));
  }

  return { from: row.status as BlogStatus };
}

/**
 * Every published document, for the sweep's lint pass (R43's third caller).
 *
 * **THIS IS THE READ THAT KEEPS A-D13 HONEST.** Once the prose is in Postgres, CI
 * lints nothing that ships -- all thirty-six of `blog.content.test.ts`'s cases derive
 * from `BLOG_ARTICLES`. Without a caller over the ROWS, *"the lint survives the move
 * to Postgres"* is true of new writes and false of everything already published, and
 * the failure is invisible because **the lint would be passing on an empty set.**
 *
 * It lives here rather than in `queries/blog.ts` because the sweep is operator
 * machinery, and because this one deliberately does NOT apply A6-7's `idIsLive`
 * gate: an `en` row that is published but unreachable is still prose somebody wrote
 * and still has to pass the lint before `id` comes back and makes it live.
 */
export async function publishedDocumentsForLint(
  db: DbOrTx,
): Promise<{ slug: string; row: AdminLocaleRow }[]> {
  const rows = await db
    .select({
      slug: blogPosts.slug,
      locale: blogPostLocales.locale,
      status: blogPostLocales.status,
      title: blogPostLocales.title,
      description: blogPostLocales.description,
      heroCardSlug: blogPostLocales.heroCardSlug,
      heroAlt: blogPostLocales.heroAlt,
      body: blogPostLocales.body,
      updatedAt: blogPostLocales.updatedAt,
    })
    .from(blogPosts)
    .innerJoin(blogPostLocales, eq(blogPostLocales.postId, blogPosts.id))
    .where(eq(blogPostLocales.status, 'published'))
    .orderBy(asc(blogPosts.slug), asc(blogPostLocales.locale));

  return rows.map((r) => ({
    slug: r.slug,
    row: {
      locale: r.locale,
      status: r.status as BlogStatus,
      title: r.title,
      description: r.description,
      heroCardSlug: r.heroCardSlug,
      heroAlt: r.heroAlt,
      body: r.body as Block[],
      updatedAt: r.updatedAt,
    },
  }));
}
