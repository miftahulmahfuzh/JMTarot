/**
 * `POST /api/admin/blog/[slug]/translate` — seed one locale from another with a model.
 * **v0.5.0 / A6, added 2026-07-30 on Miftah's request.**
 *
 * ── IT PUSHES, IT DOES NOT PULL, AND THAT IS A CORRECTION (2026-07-31) ──────
 *
 * **THE FIRST VERSION HAD THE WORKFLOW UPSIDE DOWN.** It was mounted on the TARGET tab and
 * pulled from the other locale, so using it meant: finish the Indonesian, navigate to an
 * empty English tab, press a button that fills the form, press Simpan. Miftah's actual
 * workflow is *"from nothing, i click a translation TO the other language"* — **the starting
 * point is that the other article does not exist yet**, and nobody navigates to a blank tab
 * to create it.
 *
 * So the button now lives on the SOURCE tab and names the destination. The route needed no
 * new parameter for that: `to` was always the parameter and `from` was always derived as the
 * locale that is not `to`, so the caller simply passes the OTHER locale.
 *
 * ── IT WRITES NOW, BECAUSE NOBODY IS STANDING ON THE TARGET TAB ─────────────
 *
 * Returning a document for a form to hold only worked while the operator was ON that form.
 * Pushing means the target row has to be stored here or the translation is lost the moment
 * the response lands. **It writes through `saveDocument` like everything else** — the same
 * zod parse, the same lint, the same resolution, the same derived `hero_alt` — so machine
 * output still gets no shortcut past the gates, and a refusal writes nothing.
 *
 * It is stored as a **draft**. `changeStatus` is a separate decision and `id`-before-`en`
 * still binds, so a translated article is never published as a side effect of translating.
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
import { saveDocument } from '@/lib/admin/blogSave';
import { track, withAnalytics } from '@/lib/analytics/track';
import type { LintDoc } from '@/lib/content/lint';
import { db } from '@/lib/db/client';
import { getForEdit } from '@/lib/db/queries/admin/blog';
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/locale';
import {
  adminNotFound,
  errorClass,
  logBlogFailure,
  ok,
  refuseMethod,
  requireAdmin,
  unavailable,
} from '../../shared';

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
    return unavailable('read', errorClass(err));
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
   * **THE TRANSLATION GOES THROUGH `saveDocument`, NOT INTO THE RESPONSE.** See the header:
   * the operator is on the SOURCE tab and will not be standing on the target form to press
   * Simpan. `hero.alt` is dropped rather than forwarded — the schema is `.strict()` and the
   * save path derives it from the card's lore document in the TARGET locale (§7), which is
   * the whole reason it left the segment walk.
   */
  const targetExists = (article?.locales ?? []).some((l) => l.locale === to);
  let saved: Awaited<ReturnType<typeof saveDocument>>;
  try {
    saved = await saveDocument(db, targetExists ? 'update' : 'create', {
      slug,
      locale: to,
      title: result.doc.title,
      description: result.doc.description,
      hero: result.doc.hero ? { cardUrlSlug: result.doc.hero.cardUrlSlug } : null,
      body: result.doc.body,
    });
  } catch (err) {
    logBlogFailure('translate save', err, { slug, to });
    return unavailable('save', errorClass(err));
  }

  /*
   * **A LINT REFUSAL ON A TRANSLATION IS A 200 WITH `ok: false`, NOT A 422.** The operator did
   * not type this text and cannot fix it in the field they are looking at — they are on the
   * SOURCE tab. So it reads as *"the translation was refused, here is why"* with the
   * violations attached, rather than as a validation error against the form on screen.
   */
  if (saved.kind === 'invalid') {
    return ok({ ok: false, reason: 'invalid', detail: '', violations: saved.violations });
  }
  if (saved.kind === 'exists' || saved.kind === 'not-found') return adminNotFound();

  /*
   * **`via: 'auto_translate'` — A THIRD VALUE ON A PROP, NOT A THIRD EVENT NAME.** This route
   * now stores a row, so it has to fire the save event or the metric undercounts; and
   * `events.ts`'s rule is to fold rather than add. `model_called` is always true here.
   */
  await withAnalytics(
    {
      userId: gate.user.id,
      sessionId: null,
      locale: to,
      // The admin has no `local_date`; UTC is the honest answer for a call with no querent.
      localDate: new Date().toISOString().slice(0, 10),
    },
    async () => {
      track('admin.blog_saved', {
        slug,
        locale: to,
        action: saved.kind === 'ok' ? saved.action : 'update',
        blocks: result.doc.body.length,
        lint_violations: saved.kind === 'ok' ? saved.violations.length : 0,
        via: 'auto_translate',
        model_called: true,
      });
    },
  );

  return ok({
    ok: true,
    from,
    to,
    segments: result.segments,
    violations: [...result.violations, ...(saved.kind === 'ok' ? saved.violations : [])],
    action: saved.kind === 'ok' ? saved.action : 'update',
  });
}
