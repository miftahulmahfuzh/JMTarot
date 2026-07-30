/**
 * `POST /api/admin/blog/[slug]/translate` — seed one locale from another with a model.
 * **v0.5.0 / A6, added 2026-07-30 on Miftah's request.**
 *
 * ── IT STORES NOTHING, AND THAT IS THE DESIGN RATHER THAN A LIMITATION ─────
 *
 * It reads the SOURCE row, calls the model, and returns a document as JSON. The editor
 * puts it in the form; **`POST /api/admin/blog` is still the only thing that writes**, so
 * machine output goes through the same zod parse, the same lint and the same resolution
 * as a hand-typed save. Nothing reaches `blog_post_locales` that the editor would refuse.
 *
 * The overwrite confirmation lives in the editor for the same reason: what is at risk is
 * unsaved FORM state, which the server has never seen.
 *
 * ── §8.2 SURVIVES BECAUSE THE OUTPUT IS A DRAFT ────────────────────────────
 *
 * `## Localization` rule 3 and S6 §8.2 say the English is **rewritten, not translated**.
 * `blogTranslate.ts`'s header states the tension plainly; what resolves it is that the
 * admin edits afterwards and `divergenceAdvisory()` still reports at publish time.
 *
 * ── A MODEL CALL ON AN ADMIN ROUTE, AND WHAT IS BEHIND IT ──────────────────
 *
 * VD7's rule is about the PUBLIC page: *"the one route with no session and no per-user
 * budget, so a model call there is `LLM_WINDOW_CALL_CEILING` with no gate on it."* This
 * one has `requireAdmin()` in front of it and one operator behind it, which is a tighter
 * gate than any querent path has. It draws on the fleet-wide ceiling like everything
 * else, and `callClass: 'deferred'` is what makes it shed BEFORE a querent's reading.
 *
 * `maxDuration = 60`, above every other admin route: this is the only one that waits on
 * a model, and a 2,000-word article is a large completion. Paired with a client bound in
 * the editor (§4.2 rule 2) — a bigger `maxDuration` with no bound only makes a hang
 * longer.
 */
import { autoTranslateDocument } from '@/lib/admin/blogAutoTranslate';
import type { LintDoc } from '@/lib/content/lint';
import { db } from '@/lib/db/client';
import { getForEdit } from '@/lib/db/queries/admin/blog';
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/locale';
import { adminNotFound, logBlogFailure, ok, refuseMethod, requireAdmin, unavailable } from '../../shared';

export const runtime = 'nodejs';
/**
 * Sixty, and it is the only admin route above thirty. A model call on a 2,000-word
 * article is the one request on this surface that legitimately takes tens of seconds.
 */
export const maxDuration = 60;

/** A-D2: an unimplemented verb answers 404, not 405. See `refuseMethod`. */
export const GET = refuseMethod;
export const PUT = refuseMethod;
export const PATCH = refuseMethod;
export const DELETE = refuseMethod;

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { slug } = await ctx.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return adminNotFound();
  }
  const input = (raw ?? {}) as { to?: unknown };
  if (!isLocale(input.to)) return adminNotFound();
  const to: Locale = input.to;

  /*
   * **THE SOURCE IS THE OTHER LOCALE, AND WITH TWO LOCALES THAT IS UNAMBIGUOUS.** It is
   * derived rather than taken from the request so a caller cannot ask for `id` -> `id`,
   * which would spend a model call to produce the document it was given.
   */
  const from = LOCALES.find((l) => l !== to);
  if (!from) return adminNotFound();

  let article: Awaited<ReturnType<typeof getForEdit>>;
  try {
    article = await getForEdit(db, slug);
  } catch (err) {
    logBlogFailure('translate read', err, { slug, to });
    return unavailable();
  }

  const row = article?.locales.find((l) => l.locale === from);
  if (!row) return adminNotFound();

  const source: LintDoc = {
    locale: from,
    slug,
    title: row.title,
    description: row.description,
    hero:
      row.heroCardSlug !== null && row.heroAlt !== null
        ? { cardUrlSlug: row.heroCardSlug, alt: row.heroAlt }
        : null,
    body: row.body,
  };

  const result = await autoTranslateDocument(source, to);

  /*
   * **A REFUSAL IS A 200 WITH `ok: false`, NOT AN ERROR STATUS.** Every failure here is
   * an answer the operator has to read — *the reply was truncated*, *the model
   * translated a card name*, *this article is too long* — and a 4xx/5xx would make the
   * editor render its generic failure state instead of the sentence that says what to do.
   * The refusals that ARE status codes on this surface (404, 503) are the ones with
   * nothing to say.
   */
  if (!result.ok) return ok({ ok: false, reason: result.reason, detail: result.detail });

  /*
   * **NO EVENT.** `admin.blog_saved` fires when something is stored, and nothing is.
   * A-D18's register went 66 -> 67 by FOLDING rather than adding, and a name for
   * "an admin pressed a button and may discard the result" answers no question anybody
   * has — the ledger row in `llm_calls` is the record that a model call happened, which
   * is the only fact here worth keeping.
   */
  return ok({
    ok: true,
    from,
    to,
    segments: result.segments,
    violations: result.violations,
    doc: {
      title: result.doc.title,
      description: result.doc.description,
      hero: result.doc.hero,
      body: result.doc.body,
    },
  });
}
