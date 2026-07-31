/**
 * What the two `/api/admin/blog/**` routes actually decide. **v0.5.0 / A6.**
 *
 * **HANDLE FIRST, NO `next/*`, NO `server-only`, AND THAT IS THE WHOLE REASON THIS
 * FILE EXISTS.** A5 established the shape with `@/lib/admin/reveal.ts` and wrote down
 * why: *"a route handler cannot be driven by that test (it imports `next/server` and
 * the `server-only` singleton), and an ordering asserted only by grep is the weakest
 * instrument available for the one control that fails silently."*
 *
 * The same argument binds here for a different control. Task 9's acceptance is *"a
 * body with `tempoh` in the `id` half is 422 **and stores nothing**"* and task 10's is
 * *"`publish(en)` before `id` is 422 with a named reason"* — and *stores nothing* is a
 * claim about the database that only a database can check. Driving the route would
 * mean a running Next server; driving this means `withRollback`.
 *
 * ── WHAT STAYS IN THE ROUTE, AND WHY IT IS EXACTLY TWO THINGS ──────────────
 *
 *   1. **The gate.** `requireAdmin()` reaches `currentUser()` reaches the driver.
 *   2. **The events.** `track()` is registered through `withAnalytics`, which needs a
 *      request scope; this module returns WHAT to record and the route records it.
 *      `track()` returns `void` and is never awaited.
 *
 * Everything else — the parse, the lint, the resolution, the state machine, the
 * transaction — is here, where a test can reach it.
 */
import type { Locale } from '@/data/types';
import { documentSchema } from '@/lib/content/blockSchema';
import { resolveViolations } from '@/lib/content/blogResolve';
import { heroAltFor } from '@/lib/content/heroAlt';
import { canTransition, isBlogStatus, type BlogStatus, type TransitionRefusal } from '@/lib/content/blogStatus';
import { hasErrors, lintDocument, rulesFor, type LintDoc, type LintViolation } from '@/lib/content/lint';
import { getForEdit, idStatusOf, setStatus, upsertDocument } from '@/lib/db/queries/admin/blog';
import { publishedSlugs } from '@/lib/db/queries/blog';
import { isLocale } from '@/lib/i18n/locale';
import type { Db, DbOrTx } from '@/lib/db/types';

export type SaveResult =
  | {
      kind: 'ok';
      slug: string;
      locale: Locale;
      action: 'create' | 'update';
      /** The WARNINGS that did not block. `admin.blog_saved.lint_violations` counts these. */
      violations: LintViolation[];
    }
  | { kind: 'invalid'; violations: LintViolation[] }
  | { kind: 'exists' }
  | { kind: 'not-found' };

/**
 * Create or update one document. **THE THREE GATES RUN BEFORE ANY WRITE.**
 *
 *   zod          is this the shape `Prose` can render? `.strict()`, five kinds, no sixth.
 *   lint         is this prose we are willing to publish? The word lists, the spans.
 *   resolution   does what it names exist? `@/data/deck`, which the lint may not import.
 *
 * None subsumes another, and **a refusal at any of them writes nothing** — not a
 * draft, not a partial row, not a `blog_posts` row with no document under it (A-D14:
 * *a stored `Block[]` the renderer cannot render is a 500 on a public page, and the
 * row would already be committed*).
 *
 * **AN ERROR REFUSES THE SAVE; A WARNING DOES NOT** (A6-17). A word-list violation is
 * a mistake at the moment it is typed. A word floor, a description band and a title
 * length are properties of a FINISHED article, and refusing to save a 200-word draft
 * is refusing to let somebody write — what they do then is paste the whole thing in at
 * the end, unreviewed, which is the failure the gate exists to prevent, arrived at by
 * the gate. The publish gate takes both classes; that is `changeStatus`.
 *
 * `db` is a `Db` rather than a `DbOrTx` because it opens its own transaction. The
 * integration suite passes its rolled-back one, which nests as a savepoint.
 */
export async function saveDocument(
  db: Db,
  intent: 'create' | 'update',
  raw: unknown,
): Promise<SaveResult> {
  const parsed = documentSchema.safeParse(raw);
  if (!parsed.success) {
    /*
     * zod's issues become violations rather than being passed through, so the editor
     * has ONE thing to render. `path` is the block index, which is the only locator a
     * structured editor can act on. Capped at twenty: a paste of the wrong JSON
     * produces hundreds and the useful line is the first.
     */
    return {
      kind: 'invalid',
      violations: parsed.error.issues.slice(0, 20).map(
        (i): LintViolation => ({
          rule: 'markup',
          cls: 'error',
          locale: isLocale((raw as { locale?: unknown })?.locale) ? (raw as { locale: Locale }).locale : 'id',
          field: 'body',
          detail: i.path.join('.') || 'body',
          excerpt: i.message.slice(0, 60),
        }),
      ),
    };
  }
  /*
   * **THE `alt` IS DERIVED HERE, BEFORE THE LINT, AND THE ORDER IS THE POINT.**
   *
   * `heroAltFor()` reads the card's own lore document — see that module's header for the
   * four indexed pages that shipped `alt: 'The World'`, and for why `hero-pair` could
   * not catch it. Deriving before `lintDocument` means the lint inspects the string that
   * will actually be stored and rendered, so `hero-pair` becomes a check on the LORE
   * documents rather than on an admin's typing, and it can no longer fire for anything
   * saved through this path.
   *
   * **A CARD WITH NO LORE DOCUMENT IS AN ERROR-CLASS REFUSAL, NOT AN EMPTY `alt`.** All
   * twenty-two have one today, so this cannot fire — and identical-today is exactly when
   * somebody simplifies one of two lists (R2's argument). The alternative degradations
   * are both worse than a refusal: `''` lies to a screen reader on a
   * perfectly-normal-looking page (A6-11), and the card name is the defect being fixed.
   */
  const heroAlt =
    parsed.data.hero !== null ? heroAltFor(parsed.data.hero.cardUrlSlug, parsed.data.locale) : null;

  if (parsed.data.hero !== null && heroAlt === null) {
    return {
      kind: 'invalid',
      violations: [
        {
          rule: 'hero-pair',
          cls: 'error',
          locale: parsed.data.locale,
          field: 'hero',
          detail: 'that card has no lore document, so there is no alt text to derive',
          excerpt: parsed.data.hero.cardUrlSlug,
        },
      ],
    };
  }

  const doc: LintDoc = {
    ...parsed.data,
    hero:
      parsed.data.hero !== null && heroAlt !== null
        ? { cardUrlSlug: parsed.data.hero.cardUrlSlug, alt: heroAlt }
        : null,
  };

  /*
   * **`rulesFor(slug)`, NOT `ARTICLE_RULES`** (R44). The two launch slugs keep the
   * orientation anchors and the word floor by name; nothing else acquires them, so an
   * article about one card is not asked to carry `#what-tarot-is`.
   */
  const violations = lintDocument(doc, rulesFor(doc.slug));
  const [known, existing] = await Promise.all([publishedSlugs(db), getForEdit(db, doc.slug)]);
  violations.push(...resolveViolations(doc, known));

  if (hasErrors(violations)) return { kind: 'invalid', violations };

  /*
   * The verb is checked AFTER the content gates on purpose: an author who mistypes it
   * should be told what is wrong with the prose first, not sent away with a conflict
   * they have to resolve before they can even see the lint.
   */
  const alreadyThere = existing?.locales.some((l) => l.locale === doc.locale) ?? false;
  if (intent === 'create' && alreadyThere) return { kind: 'exists' };
  if (intent === 'update' && !alreadyThere) return { kind: 'not-found' };

  const result = await db.transaction((tx) =>
    upsertDocument(tx, {
      slug: doc.slug,
      locale: doc.locale,
      title: doc.title,
      description: doc.description,
      // Resolved above, so the slug names a real card.
      hero: doc.hero,
      /*
       * `LintDoc.body` is `readonly Block[]` -- the lint must not be able to mutate a
       * document it is inspecting -- and the column is `Block[]`. A copy rather than a
       * cast, so the stored row is never an alias of the parsed value.
       */
      body: [...doc.body],
    }),
  );

  return { kind: 'ok', slug: doc.slug, locale: doc.locale, action: result.action, violations };
}

export type StatusResult =
  | { kind: 'ok'; slug: string; locale: Locale; from: BlogStatus; to: BlogStatus; noop: boolean; violations: LintViolation[] }
  | { kind: 'invalid'; violations: LintViolation[] }
  | { kind: 'refused'; reason: TransitionRefusal }
  | { kind: 'not-found' };

/**
 * Run one status transition. **THE LINT RUNS HERE TOO, AND ROADMAP §4.1 SAYS SO
 * NOWHERE** (§20 defect 14).
 *
 * *"Lint runs here"* is written only against `/api/admin/blog`, and it has to be true
 * of this path as well: a warning-class violation is exactly what a publish must
 * refuse, and a route that publishes without asking makes the warning class
 * decorative.
 *
 * **ON THE PUBLISH PATH ONLY.** Withdrawing something from publication must never be
 * refused for a violation — the article that most needs pulling is the one with
 * something wrong in it — so `canTransition` ignores `violations` for
 * `to: 'unpublished'`, and running the lint anyway would cost a read of the deck for
 * an answer nobody uses.
 */
export async function changeStatus(
  db: Db,
  slug: string,
  rawLocale: unknown,
  rawTo: unknown,
): Promise<StatusResult> {
  /*
   * **A MALFORMED `locale` OR `to` IS `not-found`, NOT A 400.** An unparseable target
   * status on an admin path is a URL that should not resolve, and every refusal in
   * this tree is byte-identical so that *"does this surface exist"* is unanswerable
   * from the outside. The editor only ever sends the three values.
   */
  if (!isLocale(rawLocale) || !isBlogStatus(rawTo)) return { kind: 'not-found' };
  const locale: Locale = rawLocale;
  const to: BlogStatus = rawTo;

  const [article, idStatus, known] = await Promise.all([
    getForEdit(db, slug),
    idStatusOf(db, slug),
    publishedSlugs(db),
  ]);
  const row = article?.locales.find((l) => l.locale === locale);
  if (!row) return { kind: 'not-found' };

  /*
   * **THE PUBLISH GATE LINTS THE DERIVED `alt`, NOT THE STORED ONE**, for the same
   * reason `saveDocument` does: the derivation is what a save writes, so linting the
   * stored string would judge this transition against a value the next save replaces.
   *
   * It also means a row written BEFORE the derivation landed can still be published. The
   * four launch rows are exactly that case — `scripts/blog-import.ts` wrote them with the
   * card name as `alt` and set `status: 'published'` directly, bypassing this gate — and
   * refusing to publish an article because of a defect this change already fixed on the
   * write path would be the gate punishing somebody for the old bug.
   *
   * **THE RESIDUAL IS NAMED RATHER THAN HIDDEN:** such a row renders its STORED `alt`
   * until something saves it. Re-running the import script, or one press of Simpan,
   * fixes it. Deriving on READ instead would fix it everywhere at once and would cost
   * `blogRow.ts` its purity — it would have to import all forty-four lore documents —
   * and that module is A6-35's byte-identity oracle.
   */
  const derivedAlt = row.heroCardSlug !== null ? heroAltFor(row.heroCardSlug, locale) : null;

  const doc: LintDoc = {
    locale,
    slug,
    title: row.title,
    description: row.description,
    hero:
      row.heroCardSlug !== null && derivedAlt !== null
        ? { cardUrlSlug: row.heroCardSlug, alt: derivedAlt }
        : null,
    body: row.body,
  };
  const violations =
    to === 'published'
      ? [...lintDocument(doc, rulesFor(slug)), ...resolveViolations(doc, known)]
      : [];

  const verdict = canTransition({
    from: row.status,
    to,
    locale,
    idStatus,
    bodyBlocks: row.body.length,
    violations,
  });

  if (!verdict.ok) {
    /*
     * **A CONTENT REFUSAL AND A STATE REFUSAL ARE DIFFERENT ANSWERS**, and the
     * difference is what the operator has to do about it. A lint refusal is fixed in
     * the editor; a `no-path-back-to-draft` or an `id-not-published` is fixed by a
     * different action entirely, and rendering it in the lint panel would send
     * somebody looking for a word to change.
     */
    return verdict.reason === 'lint-violations'
      ? { kind: 'invalid', violations }
      : { kind: 'refused', reason: verdict.reason };
  }

  // §8.1: `X → X` writes nothing and fires no event, so a double tap is not two decisions.
  if (verdict.noop) {
    return { kind: 'ok', slug, locale, from: row.status, to, noop: true, violations };
  }

  const written = await db.transaction((tx) => setStatus(tx, slug, locale, to));
  if (!written) return { kind: 'not-found' };
  return { kind: 'ok', slug, locale, from: written.from, to, noop: false, violations };
}

/**
 * The editor's read. Exported here rather than re-exported from the query module so
 * the page has one import for the whole admin blog surface.
 */
export async function articleForEditor(db: DbOrTx, slug: string) {
  return getForEdit(db, slug);
}
