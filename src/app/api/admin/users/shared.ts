/**
 * What all four `/api/admin/users/**` routes share. v0.5.0 / A5, task 5.
 *
 * Written once so four handlers cannot drift on the four things that must not drift: the
 * gate, the shape of a refusal, the uuid guard and the cache header.
 *
 * ── EVERY REFUSAL IS A 404 WITH AN EMPTY BODY, INCLUDING A LEGITIMATE MISS ───
 *
 * A-D2 / A5-1. A 403 confirms the surface exists; a 404 does not, and the whole tree is
 * then indistinguishable from a typo. **`adminNotFound()` is A1's and A5 never
 * constructs a 404 of its own**, because a 404 whose body differs from the refusal's body
 * is a 404 that still confirms the surface — so an unknown user id, an unknown question
 * key and an unauthorised caller all get the same bytes. Byte-identity with Next's own
 * response for an unmatched `/api/` path is explicitly NOT claimed (R35): a route handler
 * cannot render it, and `tools/admin/probe.sh` measures the residual difference.
 *
 * **This is a deliberate departure from `requireUser()`**, which answers 401/403 so that
 * *a caller cannot tell whether middleware or the handler refused it* — there the goal is
 * symmetry, here it is invisibility. A reader who does not find this sentence will "fix"
 * it back for consistency, and `adminSurface.test.ts` asserts no admin route names either
 * status.
 *
 * A signed-OUT caller never reaches any of this: `decide()` answers 401 for anything
 * under `/api/` before the handler runs. **R36: the acceptance script therefore expects
 * TWO codes for two callers** — 401 signed out, 404 signed in and not an admin — and one
 * that treats 401 as a failure reds on correct behaviour, which is how an acceptance test
 * gets disabled.
 *
 * ── AND A QUERY FAILURE IS A 503 WITH NO DIAGNOSIS IN IT (A5-18) ────────────
 *
 * `unavailable()` carries a two-word body and the caller logs the error's **class** and
 * the resource ids. A postgres error quotes the failing statement *and its bound
 * parameters*, and on these paths those parameters are a subject id, a question key and a
 * flag id — with `onboarding_answers.answer_text`, `moderation_flags.question` and
 * `readings.question` all columns in statements these routes issue. The rule is applied
 * without exception because this is not the file in which to reason about one.
 */
import { NextResponse } from 'next/server';
import { adminNotFound, requireAdmin } from '@/lib/admin/identity';

export { adminNotFound, requireAdmin };

/** `queries/share.ts`'s guard. A malformed uuid raises SQLSTATE `22P02`, and an
 *  unhandled one 500s and **puts the failing statement in the platform log** (A5-17).
 *  Every `[id]`, `[flagId]` and `[readingId]` passes through it before a query does. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The one cache header on this surface. `private, no-store` — no shared cache, no disk,
 * no history entry. Three of these four routes return the most sensitive strings this
 * application holds, and the fourth returns an email list.
 */
export const NO_STORE = { 'cache-control': 'private, no-store' } as const;

/** A read failed. **Never a 500 with a body**, and never the driver's words. */
export function unavailable(): NextResponse {
  return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
}

/** A JSON 200 with the header attached, so no handler can forget it. */
export function ok(body: unknown): NextResponse {
  return NextResponse.json(body, { headers: NO_STORE });
}

/**
 * What every handler logs on a failure: the error's CLASS, the ids, and nothing else.
 *
 * Exported so all four spell it the same way, and so the absence of the error object is
 * one decision rather than four. `err.name` on an `Error` is `'Error'`, `'TypeError'`,
 * `'PostgresError'` — enough to tell a timeout from a type bug — and it cannot carry a
 * bound parameter.
 */
export function logAdminFailure(
  what: string,
  err: unknown,
  ids: Record<string, string | null>,
): void {
  console.error(`admin read failed: ${what}`, {
    ...ids,
    name: err instanceof Error ? err.name : typeof err,
  });
}
