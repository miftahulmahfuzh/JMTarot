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

/**
 * A read or a write failed. **Never a 500 with a body, and never the driver's words.**
 *
 * ── `stage` AND `errorClass` ARE OURS TO GIVE AND THE DRIVER'S WORDS ARE NOT ─
 *
 * Added 2026-07-31, because `{ error: 'unavailable' }` with nothing else made every failure
 * on this surface render the same generic sentence and told the operator nothing about which
 * half broke. **That is not a privacy win, it is an absent diagnostic**: the rule this file
 * already states is *never the driver's words*, because a postgres error quotes the failing
 * statement AND its bound parameters — and on this path those are a whole article body.
 *
 * `stage` is a literal we wrote (`'read'`, `'save'`). `errorClass` is `err.name` and
 * `errorCode` is the driver's `code` — **neither can carry a bound parameter**, and they are
 * exactly what CLAUDE.md already permits to be recorded: production logs *"ids, attempt,
 * SQLSTATE and the error's class"*. So the facts a person needs to start looking are safe, and
 * the message body still never appears.
 *
 * **`errorCode` IS THE ONE THAT ACTUALLY TELLS YOU ANYTHING**, and it was added after
 * measuring: with the database unreachable, postgres.js throws a plain `Error`, so
 * `errorClass` reads `"Error"` and says nothing. `code` reads `ECONNREFUSED`, which answers
 * the question in one word. `flush.ts`'s own `DRIVER_TRANSIENT` set is the precedent — those
 * connection-level codes are not SQLSTATEs and are the useful half here.
 *
 * Admin-only either way: `requireAdmin()` is in front of every caller.
 */
export function unavailable(stage?: string, facts?: ErrorFacts): NextResponse {
  return NextResponse.json(
    { error: 'unavailable', stage, ...facts },
    { status: 503, headers: NO_STORE },
  );
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
  console.error(`admin blog ${what} failed`, { ...ids, ...errorClass(err) });
}

/** What may be told to an operator about a failure: a class and a code, never a message. */
export type ErrorFacts = { errorClass: string; errorCode?: string };

/**
 * The error's CLASS and CODE, never its message. **The two diagnostics that cannot leak a
 * bound parameter.**
 *
 * Exported so `unavailable()`'s callers pass the same thing they log, rather than one of them
 * inventing a second spelling of "what went wrong". The `code` extraction is `flush.ts`'s
 * `sqlstate()` in one line — not imported, because that module is `@/lib/analytics` and this
 * one must not acquire an analytics import for three lines (`auth.ts`'s precedent, which
 * duplicates `sqlstate` for exactly this reason).
 */
export function errorClass(err: unknown): ErrorFacts {
  return {
    /*
     * **`DrizzleQueryError` REPORTS `name: 'Error'`**, so the class alone is worthless on this
     * path. Its constructor name is the useful string, and it is read defensively because a
     * non-Error can reach here.
     */
    errorClass:
      (err as { constructor?: { name?: string } } | null)?.constructor?.name ??
      (err instanceof Error ? err.name : typeof err),
    errorCode: driverCode(err),
  };
}

/**
 * The driver's short code — `ECONNREFUSED`, `ETIMEDOUT`, a SQLSTATE like `23505`.
 *
 * **IT LOOKS AT `cause` AS WELL AS AT THE ERROR, AND THAT WAS MEASURED RATHER THAN ASSUMED.**
 * The first version read `err.code` only and returned `undefined` for every real failure,
 * because **drizzle wraps the driver error in a `DrizzleQueryError` and the `code` is on
 * `.cause`.** Probed against a closed port:
 *
 *     name: 'Error'   constructor: 'DrizzleQueryError'   code: undefined
 *     own keys: query, params, cause
 *     cause.code: 'ECONNREFUSED'
 *
 * **THOSE `own keys` ARE ALSO THE REASON THIS FUNCTION PICKS FIELDS INSTEAD OF PASSING THE
 * ERROR ON.** `DrizzleQueryError` carries `query` AND `params` — the bound values — so
 * returning or logging the object itself is exactly the leak *"never log a driver error"*
 * exists to prevent, and drizzle makes it easier to do by accident than the raw driver did.
 *
 * One level of `cause` only. A deeper chain is a shape nobody has seen here, and walking an
 * arbitrary chain is how a logger acquires a cycle.
 */
function driverCode(err: unknown): string | undefined {
  const own = (err as { code?: unknown } | null)?.code;
  if (typeof own === 'string') return own;
  const cause = (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof cause === 'string' ? cause : undefined;
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
