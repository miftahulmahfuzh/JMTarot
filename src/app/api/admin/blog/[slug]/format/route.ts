/**
 * `POST /api/admin/blog/[slug]/format` — Auto Format. **v0.5.0, the markdown editor, §5.**
 *
 * Four phases, and phases 1, 3 and 4 always run:
 *
 *   1. PARSE   `parseMarkdown(konten)` -> `Block[]`. Pure, no model, no network.
 *   2. JUDGE   ONE model call, and only when `adviceNeeded()` has something to ask.
 *   3. GATE    `saveDocument` — the same zod `.strict()`, lint and resolution a
 *              hand-typed save goes through. **Machine output gets no shortcut.**
 *   4. WRITE   the draft row, so the preview stops being one save behind (R5).
 *
 * ── IT WRITES, WHICH IS THE ONE PLACE IT DIVERGES FROM `translate` ──────────
 *
 * `POST …/translate` stores nothing and its header says why: what is at risk is unsaved
 * FORM state the server has never seen. **Auto Format is the opposite by design.** The
 * preview pane renders through the real `Prose`, which is a SERVER component (A6-32), so
 * there is no live preview to have — and the design's R5 buys immediacy by making the
 * button that changes the structure also the button that commits it. One round trip, and
 * the pane below is never stale.
 *
 * That is safe only because phase 3 is `saveDocument` rather than a bespoke write: a
 * refusal at any gate writes nothing, including a refusal caused by the model's own
 * headings, which is the point of running them through the same door.
 *
 * ── THE BODY CARRIES MARKDOWN AND THE ROUTE RE-DERIVES EVERYTHING ELSE ──────
 *
 * A7's rule, applied to a different payload: *the route re-derives the numbers and never
 * trusts the posted body.* Here the body is `{ locale, title, description, heroCardSlug,
 * markdown }` and **carries no `Block[]` and no `hero.alt`** — the blocks come from the
 * parser and the alt from the card's lore document, so a caller cannot post a document
 * shape the editor could not have produced.
 *
 * ── A MODEL CALL ON AN ADMIN ROUTE ─────────────────────────────────────────
 *
 * VD7's rule is about the PUBLIC page — no session, no per-user budget. This has
 * `requireAdmin()` in front of it and one operator behind it. `maxDuration = 60` matches
 * the translate route, paired with a client bound in the editor (§4.2 rule 2), because a
 * bigger ceiling with no bound only makes a hang longer.
 */
import { adviseFormat } from '@/lib/admin/blogFormat';
import { saveDocument } from '@/lib/admin/blogSave';
import { track, withAnalytics } from '@/lib/analytics/track';
import { adviceNeeded, applyAdvice } from '@/lib/content/formatAdvice';
import { parseMarkdown, serializeMarkdown, slugify } from '@/lib/content/markdown';
import { db } from '@/lib/db/client';
import { getForEdit } from '@/lib/db/queries/admin/blog';
import { isLocale, type Locale } from '@/lib/i18n/locale';
import {
  adminNotFound,
  errorClass,
  logBlogFailure,
  ok,
  refused,
  refuseMethod,
  requireAdmin,
  unavailable,
  type ErrorFacts,
} from '../../shared';

export const runtime = 'nodejs';
/** Sixty, matching the translate route: this is the other admin request that waits on a model. */
export const maxDuration = 60;

/** A-D2: an unimplemented verb answers 404, not 405. */
export const GET = refuseMethod;
export const PUT = refuseMethod;
export const PATCH = refuseMethod;
export const DELETE = refuseMethod;

type Body = {
  locale?: unknown;
  title?: unknown;
  description?: unknown;
  heroCardSlug?: unknown;
  markdown?: unknown;
};

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
  const input = (raw ?? {}) as Body;
  if (!isLocale(input.locale)) return adminNotFound();
  const locale: Locale = input.locale;

  const title = typeof input.title === 'string' ? input.title : '';
  const description = typeof input.description === 'string' ? input.description : '';
  const heroCardSlug = typeof input.heroCardSlug === 'string' && input.heroCardSlug !== ''
    ? input.heroCardSlug
    : null;
  const markdown = typeof input.markdown === 'string' ? input.markdown : '';

  /* ── 1. PARSE ─────────────────────────────────────────────────────────── */
  const parsed = parseMarkdown(markdown);
  /*
   * **AN EMPTY PASTE IS A REFUSAL, NOT A MODEL CALL.** `bodySchema` is `.min(1)` and would
   * refuse it three lines later anyway; catching it here means an empty press never
   * reaches a provider, which is the difference between a wasted quota unit and none.
   */
  if (parsed.length === 0 || markdown.trim() === '') {
    return ok({
      ok: false,
      reason: 'empty',
      detail: 'Kolom Konten masih kosong. Tempelkan tulisannya dulu.',
    });
  }

  /*
   * Which headings got a `slugify`d id rather than an explicit `{#…}`? Recomputed from the
   * parse rather than reported by it: `parseMarkdown` returns a `Block[]` and nothing else,
   * and an extra return channel for a fact derivable in one line is a second thing to keep
   * correct. See `formatAdvice.adviceNeeded`'s `derived-anchors`.
   */
  const derivedAnchorAt = parsed.flatMap((b, i) =>
    b.kind === 'heading' && b.id === slugify(b.text) ? [i] : [],
  );

  /* ── 2. JUDGE, only if there is something to ask ───────────────────────── */
  const reasons = adviceNeeded({ body: parsed, title, description, derivedAnchorAt });
  const advised = await adviseFormat(parsed, locale, reasons);

  if (advised.kind === 'failed') {
    /*
     * **THE PARSE IS NOT DISCARDED WHEN THE MODEL FAILS.** `parseMarkdown`'s output is
     * already a valid document, so the honest answer is a 200 saying what the model could
     * not do — `translate`'s rule that a refusal is `ok: false` with its own sentence,
     * because every failure here is something the operator has to read.
     *
     * It does NOT fall through and save anyway: the operator asked for formatting, and
     * silently storing an unsectioned document under a button labelled Auto Format would
     * be the press appearing to have worked.
     *
     * **AND IT FIRES NO EVENT.** `admin.blog_saved` means a row was stored and none was —
     * the same reason the translate route fires nothing. The `llm_calls` row is the record
     * that a model call happened and failed, which is the only fact here worth keeping.
     */
    return ok({ ok: false, reason: advised.reason, detail: advised.detail });
  }

  const advice = advised.kind === 'advised' ? advised.advice : null;
  const rejected = advised.kind === 'advised' ? advised.rejected : [];
  const body = advice ? applyAdvice(parsed, advice) : parsed;
  const finalDescription =
    advice && advice.description !== '' ? advice.description : description;

  /*
   * **THE MODEL'S TITLE IS USED ONLY WHEN THE FIELD IS EMPTY, AND THE CHECK IS HERE AS WELL
   * AS IN `adviceNeeded`.** The predicate decides whether to ASK; this decides whether to
   * USE, and they are different questions — an advice object could arrive carrying a title
   * nobody asked for, from a model that ignored *"kembalikan title sebagai string kosong"*.
   *
   * A typed title is an editorial decision. Overwriting it is V8's `user-edit` failure: the
   * mechanism that regenerates something a person just changed by hand.
   */
  const finalTitle = title.trim() !== '' ? title : (advice?.title ?? '');

  /*
   * **AN EMPTY TITLE IS ITS OWN SENTENCE RATHER THAN A ZOD 422.** `documentSchema` requires
   * `title.min(1)`, so before this branch existed pressing Auto Format on a pasted body with
   * no title produced `markup / title / Too small: expected string to have >=1 characters` in
   * the lint panel — technically accurate and useless to the person reading it.
   */
  if (finalTitle.trim() === '') {
    return ok({
      ok: false,
      reason: 'no-title',
      detail:
        advised.kind === 'advised'
          ? 'Model tidak mengembalikan judul yang bisa dipakai. Tulis Judul sendiri, lalu tekan Format otomatis lagi.'
          : 'Kolom Judul masih kosong dan model tidak dipanggil. Tulis Judul dulu.',
    });
  }

  /* ── 3 + 4. GATE AND WRITE, through the one door ───────────────────────── */
  const existing = await readExisting(slug, locale);
  if (typeof existing === 'object') return unavailable('read', existing);

  let result: Awaited<ReturnType<typeof saveDocument>>;
  try {
    result = await saveDocument(db, existing ? 'update' : 'create', {
      slug,
      locale,
      title: finalTitle,
      description: finalDescription,
      // `alt` is derived inside `saveDocument` from the card's lore document (§7).
      hero: heroCardSlug !== null ? { cardUrlSlug: heroCardSlug } : null,
      body,
    });
  } catch (err) {
    logBlogFailure('format save', err, { slug, locale });
    return unavailable('save', errorClass(err));
  }

  if (result.kind === 'invalid') {
    /*
     * **A 422 WITH THE VIOLATIONS, THE SAME SHAPE THE SAVE ROUTE RETURNS**, so the editor
     * renders them in the one `LintPanel` it already has. Nothing was written — which is
     * `saveDocument`'s guarantee rather than this route's — so no event fires, exactly as
     * on the save route's own refusal path.
     */
    return refused(result.violations);
  }
  if (result.kind === 'exists' || result.kind === 'not-found') return adminNotFound();

  /*
   * **`admin.blog_saved` WITH `via: 'auto_format'`, AND NOT A NAME OF ITS OWN.** This route
   * stores a row through the same `saveDocument` the form does, so a separate event name
   * would have left the save metric undercounting every automated save. `events.ts`'s
   * header records the four props that were drafted and dropped to get here.
   */
  await withAnalytics(
    {
      userId: gate.user.id,
      sessionId: null,
      locale: result.locale,
      /*
       * **THE ADMIN HAS NO `local_date`** — the operator's browser sends no
       * `x-jm-local-date` to an admin fetch, so UTC is the honest answer, the same rule
       * `llm_calls.local_date` states for a call with no querent behind it.
       */
      localDate: new Date().toISOString().slice(0, 10),
    },
    async () => {
      track('admin.blog_saved', {
        slug: result.slug,
        locale: result.locale,
        action: result.action,
        blocks: body.length,
        lint_violations: result.violations.length,
        via: 'auto_format',
        model_called: advised.kind === 'advised',
      });
    },
  );

  /*
   * **THE SERIALIZED MARKDOWN GOES BACK.** The editor replaces its textarea with it, so
   * what the operator sees is the round trip of what was stored — headings the model added
   * appear as `## …`, and the `{#id}` suffixes are visible where an anchor is not the
   * heading's own words. A response that echoed the submitted markdown instead would hide
   * exactly the change the button was pressed to make.
   */
  return ok({
    ok: true,
    slug: result.slug,
    locale: result.locale,
    action: result.action,
    markdown: serializeMarkdown(body),
    description: finalDescription,
    // Echoed so the editor can fill the field it left empty. See `finalTitle`.
    title: finalTitle,
    titleGenerated: title.trim() === '' && finalTitle !== '',
    modelCalled: advised.kind === 'advised',
    headingsAdded: advice?.headings.length ?? 0,
    rejected,
    violations: result.violations,
  });
}

/**
 * Is there already a row for this `(slug, locale)`?
 *
 * **AN OBJECT IS THE FAILURE ARM**, so a caller cannot confuse it with `false`. It carries the
 * error's CLASS and never its message — see `unavailable()`'s header for why that distinction
 * is the whole rule.
 */
async function readExisting(slug: string, locale: Locale): Promise<boolean | ErrorFacts> {
  try {
    const article = await getForEdit(db, slug);
    return (article?.locales ?? []).some((l) => l.locale === locale);
  } catch (err) {
    logBlogFailure('format read', err, { slug, locale });
    return errorClass(err);
  }
}
