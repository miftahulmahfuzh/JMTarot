/**
 * What the two `/api/admin/blog/**` routes share. **v0.5.0 / A6.**
 *
 * A5 wrote the same four decisions for `/api/admin/users/**` and put them in
 * `users/shared.ts`; this is the blog tree's copy of the ones that are genuinely
 * shared across the whole `/api/admin/**` surface, plus two that are A6's alone (the
 * `422` shape and the resolution half of `bare-path`).
 *
 * **IT IS A SECOND FILE RATHER THAN AN IMPORT ACROSS TWO ROUTE TREES**, and that is a
 * judgement rather than an oversight: `users/shared.ts` carries a `UUID_RE` guard and
 * a header about decrypting the most sensitive string in the product, neither of
 * which has anything to do with a blog post, and a route under `blog/` importing from
 * `../users/shared` reads as a coupling that does not exist. The genuinely common
 * parts -- `requireAdmin`, `adminNotFound` -- come from A1's `@/lib/admin/identity`,
 * which is where they belong and where both trees already get them.
 *
 * ── EVERY REFUSAL IS A 404 WITH AN EMPTY BODY (A-D2) ────────────────────────
 *
 * A 403 confirms the surface exists; a 404 does not. **`adminNotFound()` is A1's and
 * A6 never constructs a 404 of its own**, because a 404 whose body differs from the
 * refusal's is a 404 that still confirms the surface. A signed-OUT caller never
 * reaches any of this -- `decide()` answers 401 for anything under `/api/` before the
 * handler runs, and R36 makes that explicit so an acceptance script does not red on
 * correct behaviour. **This is a deliberate departure from `requireUser()`, which
 * answers 401/403 so a caller cannot tell whether middleware or the handler refused
 * it; here the goal is invisibility rather than symmetry.**
 *
 * ── A `422` CARRIES THE VIOLATIONS AND NOTHING ELSE ─────────────────────────
 *
 * The editor renders them grouped by field with the excerpt (A6-14), which is the
 * whole reason `lintDocument` returns an array rather than a boolean. **The response
 * carries `detail` and `excerpt` and never the submitted body**: this is admin-authored
 * public content rather than a querent's text, so it is not the "no free text" rule
 * that binds -- it is that echoing a 4000-word body back on every refusal makes the
 * one useful line unreadable.
 */
import { NextResponse } from 'next/server';
import { adminNotFound, requireAdmin } from '@/lib/admin/identity';
import type { LintViolation } from '@/lib/content/lint';

export { adminNotFound, requireAdmin };

/** No shared cache, no disk, no history entry. Draft prose is not public yet. */
export const NO_STORE = { 'cache-control': 'private, no-store' } as const;

export function ok(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** The lint (or zod) refused. **Nothing was written** -- not a draft, not a partial row. */
export function refused(violations: readonly LintViolation[], status = 422): NextResponse {
  return NextResponse.json({ error: 'invalid', violations }, { status, headers: NO_STORE });
}

/** A read or a write failed. **Never a 500 with a body, and never the driver's words.** */
export function unavailable(): NextResponse {
  return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
}

/**
 * What a failure logs: the error's CLASS, the ids, and nothing else.
 *
 * **A postgres error quotes the failing statement AND its bound parameters**, and on
 * this path those parameters are a whole article body. That is not a querent's text
 * and it is not a secret -- but it is four thousand words in a platform log, and the
 * rule is applied without exception because this is not the file in which to reason
 * about one. `err.name` tells a timeout from a type bug and cannot carry a parameter.
 */
export function logBlogFailure(what: string, err: unknown, ids: Record<string, string>): void {
  console.error(`admin blog ${what} failed`, {
    ...ids,
    name: err instanceof Error ? err.name : typeof err,
  });
}

/**
 * **A METHOD MISMATCH MUST 404, NOT 405, AND THIS IS A-D2's FIRST NON-NEGOTIABLE.**
 * v0.5.0 / A6, found by `tools/admin/probe.sh`'s own comparison extended to methods.
 *
 * *"A non-admin never learns `/admin` exists. 404, never 403."* A 405 confirms it
 * exactly as a 403 would — and **Next answers 405 at the ROUTING layer, from the set of
 * exported verbs, before the handler runs**, so `requireAdmin()` never executes and no
 * gate can prevent it. Measured against a signed-in, onboarded, non-allowlisted session:
 *
 *     GET  /api/admin/blog                    405     <- the route exists
 *     GET  /api/admin/definitely-not-a-route  404     <- it does not
 *
 * One bit, reliably, for every unimplemented verb on every admin route. So each route
 * exports the complement of its real verbs and answers them with the identical empty
 * 404 an unauthorised caller gets.
 *
 * **A `HEAD` IS NOT IN THE LIST BECAUSE NEXT DERIVES IT FROM `GET`**, and a route with
 * no `GET` gets the same 405 for both — which this covers by exporting `GET`.
 */
export const refuseMethod = async (): Promise<NextResponse> => adminNotFound();
