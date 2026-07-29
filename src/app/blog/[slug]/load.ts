import { cache } from 'react';
import type { Locale } from '@/data/types';
import { loadArticle } from '@/lib/db/queries/blog';
import { db } from '@/lib/db/client';
import type { LoadedArticle } from '@/lib/content/blogRow';

/**
 * One read per request, shared by `generateMetadata` and the page body.
 * **v0.5.0 / A6, §9.3, task 12.**
 *
 * ── WHY THIS FILE EXISTS AT ALL ────────────────────────────────────────────
 *
 * Next calls `generateMetadata` and the default export as two separate functions in
 * one render, and both need the document, the facts and the locale set. The registry
 * made that free — `blogArticle()` was an array lookup. **A row is a query**, and two
 * queries per article page on a cold lambda with a suspended Neon compute is the
 * `POST /api/locale` shape of problem: not slow warm, and a truncation cold.
 *
 * `React.cache()` is the sanctioned mechanism and `getLocale()` is the precedent —
 * `Prose.tsx:71-77` records it: *"`getLocale()` is `cache()`d, so N calls in one render
 * are one `headers()` read."* Same here, one `SELECT`.
 *
 * ── IT IS A SEPARATE MODULE BECAUSE `queries/blog.ts` MAY NOT IMPORT `react` ─
 *
 * `queries/contract.test.ts` forbids `react`, `next/*` and `server-only` in
 * `src/lib/db/**`, **transitively**, and its header says why: those modules run in
 * route handlers, in `after()`, in `scripts/db-seed.ts` and in Vitest, and three of
 * those four have no React runtime. *"Caching is the caller's decision, made where
 * the caller knows the request context."* This is that place — a thin server module
 * inside the route, which is also where the `server-only` singleton may be named.
 *
 * ── A6-24. `null` MEANS "NO SUCH PUBLISHED ROW". A DRIVER ERROR PROPAGATES ──
 *
 * **THE RULE MOST LIKELY TO BE LOST IN A `try { … } catch { notFound() }`**, and the
 * temptation is real because a 404 looks tidier than a 500. It is not: **a transient
 * outage answering 404 on indexable URLs is a de-indexing event; a 500 is a retry.**
 * There is no `catch` in this file and there must not be one. `sitemap.ts` inverts
 * this deliberately and says so (A6-29) — a page is one URL, the sitemap is the
 * crawler's entry point to fifty-six.
 */
export const loadCachedArticle = cache(
  async (slug: string, locale: Locale): Promise<LoadedArticle | null> =>
    loadArticle(db, slug, locale),
);
