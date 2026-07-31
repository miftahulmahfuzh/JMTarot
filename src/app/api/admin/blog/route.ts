/**
 * `POST` and `PUT /api/admin/blog` — create and update one document. **v0.5.0 / A6,
 * task 9. THE LINT RUNS HERE** (roadmap §4.1).
 *
 * ── THIS FILE IS THE GATE, THE MAPPING AND THE EVENT. NOTHING ELSE ─────────
 *
 * Every decision is in `@/lib/admin/blogSave`, and A5's `reveal.ts` records the
 * reason: *"a route handler cannot be driven by that test (it imports `next/server`
 * and the `server-only` singleton), and an ordering asserted only by grep is the
 * weakest instrument available."* Task 9's acceptance is *"a body with `tempoh` in
 * the `id` half is 422 **and stores nothing**"* — and *stores nothing* is a claim
 * about the database that only a database can check, which means `withRollback`,
 * which means a handle-first module rather than a handler.
 *
 * What is left here:
 *
 *   - `requireAdmin()`, which reaches the driver and cannot move.
 *   - The status mapping. **`404` ON REFUSAL, NEVER `403`** (A-D2): a 403 confirms
 *     the surface exists and a 404 does not. *"A deliberate departure from
 *     `requireUser()`, which returns 401/403"* — the comment goes at the call site or
 *     somebody restores consistency.
 *   - `track()`, which needs a request scope through `withAnalytics`.
 *
 * ── §4.2. `runtime` AND `maxDuration`, PAIRED WITH A CLIENT BOUND ──────────
 *
 * *"Every admin request is a cold one, because there is one admin and no warm
 * instance"*, and **a write is one of the few things likely to be the request that
 * wakes a suspended Neon compute** — the `POST /api/locale` postmortem exactly. The
 * editor's fetch carries `AbortSignal.timeout(SAVE_ABORT_MS)` and a stated failure
 * state, because a bigger `maxDuration` unpaired with a client bound has only made
 * the hang longer.
 *
 * ── NO `withAdminRead`, AND NO `admin_access_log` ROW ──────────────────────
 *
 * A3's wrapper sets `transaction_read_only = on`; wrapping a WRITE in it fails at the
 * database with `25006`, which is the wrapper working. And A1's audit primitive
 * records privileged reads of *another person's* data (A-D16) — a blog save is an
 * admin writing public content the admin authored. `admin.blog_saved` is the record.
 * Written down because *"audit everything"* is the reflex and an audit table that
 * fills with routine writes is an audit table nobody reads.
 */
import { saveDocument } from '@/lib/admin/blogSave';
import { track, withAnalytics } from '@/lib/analytics/track';
import { db } from '@/lib/db/client';
import {
  adminNotFound,
  errorClass,
  logBlogFailure,
  ok,
  refused,
  refuseMethod,
  requireAdmin,
  unavailable,
} from './shared';

export const runtime = 'nodejs';
/**
 * **A LITERAL, NOT AN IMPORTED CONSTANT**, and A5's route records why:
 * `adminSurface.test.ts` matches `/export const maxDuration = \d+/` against the
 * SOURCE, because Next reads these exports from the module's static shape at build
 * time and an imported identifier can be right in TypeScript and absent in the build
 * manifest.
 */
export const maxDuration = 30;

/**
 * **THE UNIMPLEMENTED VERBS ANSWER 404, NOT 405** — see `refuseMethod`. Next derives the
 * 405 from the exported verb set at the routing layer, so the gate never runs and a
 * method mismatch would otherwise tell a signed-in non-admin that this route exists.
 */
export const GET = refuseMethod;
export const PATCH = refuseMethod;
export const DELETE = refuseMethod;

export async function POST(request: Request) {
  return save(request, 'create');
}

export async function PUT(request: Request) {
  return save(request, 'update');
}

async function save(request: Request, intent: 'create' | 'update') {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    /*
     * A malformed body is a 422 with an empty violation list rather than a 400: every
     * refusal on this surface has one shape, and the editor renders `violations` — a
     * second error shape is a second rendering path it would have to grow.
     */
    return refused([]);
  }

  let result: Awaited<ReturnType<typeof saveDocument>>;
  try {
    result = await saveDocument(db, intent, raw);
  } catch (err) {
    logBlogFailure('save', err, { intent });
    return unavailable('save', errorClass(err));
  }

  if (result.kind === 'invalid') return refused(result.violations);
  if (result.kind === 'exists') return ok({ error: 'exists', violations: [] }, 409);
  /*
   * **A 404 FOR AN UNKNOWN `(slug, locale)`, NOT A 409.** Every refusal in this tree
   * is byte-identical (A5-1) so that *"does this exist"* is unanswerable from the
   * outside, and an unknown document on an admin path is a URL that should not
   * resolve.
   */
  if (result.kind === 'not-found') return adminNotFound();

  /*
   * **`lint_violations` COUNTS THE WARNINGS THAT DID NOT BLOCK THE SAVE** (§14, and
   * A6's resolution of A-D18's ambiguity). A refused save writes no row and fires no
   * event, so the prop is only meaningful for accepted saves — and it is the number
   * worth watching, because it says how often somebody saves over a warning.
   *
   * **`slug` IN `props` LOOKS LIKE A VIOLATION OF "NO FREE TEXT, EVER" AND IS NOT**:
   * that rule is about QUERENT text, and a blog slug is admin-authored public content
   * already in a URL and already in `sitemap.xml`. Its cardinality is bounded by the
   * number of articles, which satisfies the second rule too. `events.ts` says the
   * same thing at the declaration site, as A-D18 asked.
   */
  const blocks = Array.isArray((raw as { body?: unknown }).body)
    ? (raw as { body: unknown[] }).body.length
    : 0;
  await withAnalytics(
    { userId: gate.user.id, sessionId: null, locale: result.locale, localDate: utcToday() },
    async () => {
      track('admin.blog_saved', {
        slug: result.slug,
        locale: result.locale,
        action: result.action,
        blocks,
        lint_violations: result.violations.length,
        /*
         * **`via` AND `model_called`, ADDED 2026-07-31 WITH THE MARKDOWN EDITOR.** Auto
         * Format writes through `saveDocument` on its own route, so without these two the
         * save metric would either undercount every automated save or blend two very
         * different actions into one number. `model_called` is always `false` here: a
         * hand-typed save reaches no provider, and saying so is what makes the `true`
         * rows on the other path mean something.
         */
        via: 'form',
        model_called: false,
      });
    },
  );

  return ok(
    {
      slug: result.slug,
      locale: result.locale,
      action: result.action,
      violations: result.violations,
    },
    intent === 'create' ? 201 : 200,
  );
}

/**
 * `'YYYY-MM-DD'` in UTC. **THE ADMIN HAS NO `local_date`.**
 *
 * Every querent-facing route takes the day from the client, because a `Date` rendered
 * in the server's zone is a day out for anyone in Jakarta between midnight and 07:00.
 * There is no querent here and the operator's browser sends no `x-jm-local-date` to
 * an admin fetch, so UTC is the honest answer — the same rule `llm_calls.local_date`
 * states for a call with no querent behind it.
 */
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}
