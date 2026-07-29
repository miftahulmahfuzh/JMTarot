/**
 * `POST /api/admin/blog/[slug]/status` — publish and unpublish. **v0.5.0 / A6, task 10.**
 *
 * **THE LINT RUNS HERE TOO, AND ROADMAP §4.1 SAYS SO NOWHERE** (§20 defect 14).
 * *"Lint runs here"* is written only against `/api/admin/blog`, and it has to be true
 * of this route as well: **a warning-class violation is exactly what a publish must
 * refuse** (A6-17). A description outside the band and a title over 110 characters are
 * properties of a FINISHED article, and this is the request that claims it is finished.
 *
 * The state machine and the lint are in `@/lib/admin/blogSave` and
 * `@/lib/content/blogStatus`, for the reason the sibling route's header gives: a
 * handler cannot be driven by a test, and A6-7's refusal is the one that must be seen
 * to work.
 *
 * ── A6-7 / R42. DEFENCE ONE OF TWO ────────────────────────────────────────
 *
 * `canTransition` refuses `publish(en)` while `id` is not published, because
 * `contentAlternates()` **throws** without an `id` document — so that state is a 500
 * on a URL in the sitemap. The second defence is `queries/blog.ts`'s `idIsLive`
 * `EXISTS`, which makes the state not-found rather than fatal if it is reached some
 * other way. **Two defences because one of them is a validation somebody will route
 * around** — a direct `db:studio` edit, a future bulk tool — and the loader is the one
 * that holds then.
 *
 * ── `409` FOR A STATE REFUSAL, `422` FOR A CONTENT ONE ────────────────────
 *
 * The difference is what the operator has to do about it. A lint refusal is fixed in
 * the editor; a `no-path-back-to-draft` or an `id-not-published` is fixed by a
 * different action entirely, and rendering it in the lint panel would send somebody
 * looking for a word to change. **`reason` is a closed set the editor turns into one
 * Indonesian sentence** — *"the toggle did nothing"* is the state in which somebody
 * reaches for `db:studio`, which is precisely what the second defence exists to
 * survive.
 */
import { changeStatus } from '@/lib/admin/blogSave';
import { track, withAnalytics } from '@/lib/analytics/track';
import { db } from '@/lib/db/client';
import { adminNotFound, logBlogFailure, ok, refused, requireAdmin, unavailable } from '../../shared';

export const runtime = 'nodejs';
/** A literal, for `adminSurface.test.ts`'s source-level match. See the sibling route. */
export const maxDuration = 30;

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { slug } = await ctx.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return refused([]);
  }
  const input = (raw ?? {}) as { locale?: unknown; to?: unknown };

  let result: Awaited<ReturnType<typeof changeStatus>>;
  try {
    result = await changeStatus(db, slug, input.locale, input.to);
  } catch (err) {
    logBlogFailure('status', err, { slug });
    return unavailable();
  }

  if (result.kind === 'not-found') return adminNotFound();
  if (result.kind === 'invalid') return refused(result.violations);
  if (result.kind === 'refused') {
    return ok({ error: 'refused', reason: result.reason, violations: [] }, 409);
  }

  /*
   * §8.1: a no-op writes nothing and **fires no event**, because a double-tapped
   * toggle would otherwise read as two decisions.
   */
  if (!result.noop) {
    await withAnalytics(
      { userId: gate.user.id, sessionId: null, locale: result.locale, localDate: utcToday() },
      async () => {
        track('admin.blog_status_changed', {
          slug: result.slug,
          locale: result.locale,
          from: result.from,
          to: result.to,
        });
      },
    );
  }

  return ok(result);
}

/** UTC, because there is no querent behind an admin request. See the sibling route. */
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}
