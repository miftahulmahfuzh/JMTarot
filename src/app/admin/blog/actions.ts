'use server';

/**
 * The status control's server action. **v0.5.0 / A6, task 19.**
 *
 * ── WHY A SERVER ACTION AND NOT A `fetch` TO THE API ROUTE ─────────────────
 *
 * §11.4: *"the LIST page and the STATUS control are plain forms and work without
 * JavaScript, because those are the two operations that matter when something is wrong
 * in production."* A plain `<form>` cannot usefully POST to
 * `/api/admin/blog/[slug]/status` — the body would be form-encoded and the response
 * would be raw JSON in the browser's window. **A server action is a real form
 * submission with a real redirect, and Next progressively enhances it.**
 *
 * **THE DECISION IS NOT DUPLICATED.** Both this and the route call `changeStatus()` in
 * `@/lib/admin/blogSave`, which is why that module takes its handle first and imports no
 * `next/*`. Two transports, one state machine: a second implementation of A6-7's refusal
 * is exactly the drift that would let one of them publish `en` before `id`.
 *
 * ── IT GATES ITSELF ────────────────────────────────────────────────────────
 *
 * **A SERVER ACTION IS A PUBLIC HTTP ENDPOINT** — Next gives it an id and anybody who
 * can guess it can POST to it. It is not protected by the page that renders the form,
 * and it renders under no layout. `requireAdminPage()` here answers a non-admin with
 * `notFound()`, on A-D2's terms.
 */
import { revalidatePath } from 'next/cache';
import { requireAdminPage } from '@/lib/admin/identity';
import { changeStatus } from '@/lib/admin/blogSave';
import { track, withAnalytics } from '@/lib/analytics/track';
import { db } from '@/lib/db/client';
import type { TransitionRefusal } from '@/lib/content/blogStatus';

export type StatusActionState = {
  slug?: string;
  locale?: string;
  ok?: boolean;
  refusal?: TransitionRefusal;
  /** Rule names only. The panel turns them into sentences; see `copy.ts`. */
  violations?: string[];
  notFound?: boolean;
};

/**
 * Publish or unpublish one `(slug, locale)`.
 *
 * Returns state rather than throwing, so the list page can render the refusal beside
 * the row it belongs to. **A refusal must say what happened AND what to do**, because
 * *"the toggle did nothing"* is the state in which somebody opens `db:studio` — which
 * is precisely what A6-7's second defence exists to survive.
 */
export async function setBlogStatus(
  _prev: StatusActionState,
  form: FormData,
): Promise<StatusActionState> {
  const admin = await requireAdminPage();

  const slug = String(form.get('slug') ?? '');
  const locale = String(form.get('locale') ?? '');
  const to = String(form.get('to') ?? '');

  const result = await changeStatus(db, slug, locale, to);

  if (result.kind === 'not-found') return { slug, locale, notFound: true };
  if (result.kind === 'refused') return { slug, locale, refusal: result.reason };
  if (result.kind === 'invalid') {
    return { slug, locale, violations: [...new Set(result.violations.map((v) => v.rule))] };
  }

  // §8.1: a no-op writes nothing and fires no event, so a double tap is not two decisions.
  if (!result.noop) {
    await withAnalytics(
      {
        userId: admin.id,
        sessionId: null,
        locale: result.locale,
        localDate: todayUtc(),
      },
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

  /*
   * **THE PUBLIC PAGES TOO, NOT ONLY THE ADMIN LIST.** A publish changes `/blog`,
   * `/en/blog`, both article addresses and `sitemap.xml`, and R21 of v0.4.0 measured
   * that none of them is CDN-cached today — so this is belt rather than mechanism, and
   * it is here because the day a cache header changes, the person who changes it will
   * not be reading this file.
   */
  revalidatePath('/admin/blog');
  revalidatePath('/blog');
  revalidatePath(`/blog/${slug}`);
  revalidatePath('/sitemap.xml');

  return { slug, locale, ok: true };
}

/**
 * `'YYYY-MM-DD'` in UTC, read ONCE, in the one place named for it.
 *
 * `adminCopy.test.ts` allows exactly one argument-less `new Date()` per admin file and
 * only inside a helper spelled this way, and the rule it carries is CLAUDE.md's:
 * **`todayKey()` is never called during render**, because it reads the clock and the
 * clock differs between a server render and hydration. This is a server action rather
 * than a render, so the hydration half does not bite — but a second clock read in one
 * request would still be two different days at midnight, and the fence is cheaper to
 * satisfy than to argue with.
 *
 * UTC because **there is no querent behind an admin request**: nothing sends an
 * `x-jm-local-date`, and `llm_calls.local_date` states the same rule for a call with
 * nobody behind it.
 */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
