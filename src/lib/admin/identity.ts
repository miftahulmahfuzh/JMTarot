/**
 * "Is this the operator?" -- the admin gate. v0.5.0 / A1, decisions A-D1 and A-D2.
 *
 * NODE-ONLY. Never import this from `src/middleware.ts` and never from a client
 * component: it reaches `currentUser()`, which reaches `@/lib/auth/auth`, which
 * reaches the Postgres driver. The pure half is `./allowlist`, and that is the half
 * `npm test` covers.
 *
 * ── EVERY PAGE AND EVERY ROUTE CALLS THIS ITSELF. THE LAYOUT IS NOT THE GATE ──
 *
 * `src/app/admin/layout.tsx` calls it too, and that is defence in depth rather than
 * the mechanism. A layout renders above its pages but is not a security boundary --
 * partial rendering, route interception and any future parallel route can reach a
 * page without a parent layout's promise holding, and none of those changes look
 * like a security change in a diff. The cost of the double call is one extra JWE
 * decrypt on a dashboard with one user. `adminSurface.test.ts` asserts the per-file
 * call, and that assertion is the one to protect.
 *
 * ── IT ANSWERS 404, AND THAT IS A DELIBERATE DEPARTURE FROM `requireUser()` ───
 *
 * `src/lib/auth/server.ts` refuses with 401 and 403, and its header explains why:
 * *"a caller cannot tell whether middleware or the handler refused it"*. **A-D2
 * wants the opposite property.** A 403 confirms the surface exists; a 404 does not,
 * and the whole tree is then indistinguishable from a typo. So:
 *
 *   - `requireAdminPage()` calls `notFound()`. Next renders `src/app/not-found.tsx`
 *     -- the same 404 an unknown reader id produces.
 *   - `requireAdmin()` returns a 404 with **no body**. Not a JSON error object:
 *     that is a body no unmatched route in this app produces, and the body is the
 *     tell. Byte-identity with Next's own response for an unmatched `/api/` path is
 *     NOT claimed (reconciliation R35) -- a route handler cannot render it -- and
 *     `tools/admin/probe.sh` prints both so the residual difference is a measured
 *     fact rather than an assumption.
 *
 * **DO NOT "FIX" THIS BACK TO 401/403 FOR CONSISTENCY WITH `requireUser()`.**
 * That sentence is here because the inconsistency is the feature and
 * `src/lib/auth/server.ts` is the file people copy from.
 *
 * A signed-OUT caller never reaches this file: middleware answers them first, with
 * a redirect to `/login` for a page and 401 for an `/api/` path. Reconciliation R36
 * makes that explicit because a probe script treating 401 as a failure would red on
 * correct behaviour, which is how an acceptance test gets disabled.
 *
 * ── ONBOARDING IS NOT CHECKED, AND THAT IS A DECISION ────────────────────────
 *
 * `requireUser()` requires it by default and fails closed, which is right there.
 * Here it is orthogonal: nothing on `/admin` reads the admin's own `profiles` row,
 * and middleware already redirects a signed-in un-onboarded visitor away from
 * `/admin` before this function runs. Requiring it would make a fresh admin
 * account's first visit present as *"the allowlist is wrong"* -- the least
 * debuggable failure available here, and indistinguishable from the failure the
 * requirement would be protecting against.
 *
 * **AND THE COROLLARY IS A KNOWN, DELIBERATE ROUGH EDGE (reconciliation R34):** an
 * admin who has not completed onboarding cannot reach `/admin` at all, because the
 * middleware chain bounces them to `/onboarding` above any admin check -- and that
 * redirect reads exactly like a misspelt `ADMIN_EMAILS`. Not fixed: exempting
 * `/admin` would mean `isOnboardingExempt` learning an admin path, and S-D5's whole
 * argument is that this chain must not acquire special cases. The cost is one
 * confusing five minutes, once, for one person, and `.env.example` says so where
 * somebody will actually be looking.
 *
 * ── NO DATABASE READ, SO A SOFT-DELETED ADMIN KEEPS ACCESS ───────────────────
 *
 * Identity stays database-free (roadmap §6's first non-negotiable), and a read here
 * would lock the operator out of the dashboard during exactly the outage they need
 * it for. A-D1 accepts that **revocation is a redeploy**; this file records the
 * sentence A-D1 does not say -- **self-deletion is not revocation either**
 * (reconciliation R38), because `currentUser()` reads the token and
 * `users.deleted_at` is in the row. The bound is `SESSION_TTL_HOURS`.
 */
import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { currentUser, type CurrentUser } from '@/lib/auth/server';
import { isAdminEmail, parseAdminAllowlist } from './allowlist';

/**
 * Parsed on every call, not memoised at module scope.
 *
 * The parse is a split over a string of one or two addresses, on a route nobody
 * but the operator loads. Caching it in a module-level `const` would freeze the
 * value for the lifetime of a warm lambda -- so a redeploy that REMOVED an admin
 * would take effect on a cold start and not before, which is a revocation
 * mechanism that sometimes does not revoke. A-D1 already accepts that revocation
 * costs a redeploy; it must not also be a lottery.
 */
function allowlist(): readonly string[] {
  return parseAdminAllowlist(process.env.ADMIN_EMAILS);
}

/** The current user IF they are the operator, else null. Never throws. */
export async function currentAdmin(): Promise<CurrentUser | null> {
  const user = await currentUser();
  if (!user) return null;
  return isAdminEmail(user.email, allowlist()) ? user : null;
}

/**
 * The server-component form. Throws Next's not-found signal on refusal.
 *
 * `notFound()` never returns, so the call site reads
 * `const admin = await requireAdminPage();` with no null check -- which is what
 * stops a page from having a "signed in but not admin" branch to get wrong.
 */
export async function requireAdminPage(): Promise<CurrentUser> {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return admin;
}

export type AdminGate = { ok: true; user: CurrentUser } | { ok: false; response: NextResponse };

/**
 * The route-handler form. `{ ok }` mirrors `requireUser()` and `hit()`, so the
 * guards at the top of a handler read alike:
 *
 *     const gate = await requireAdmin();
 *     if (!gate.ok) return gate.response;
 *
 * The SHAPE matches `requireUser()`. The STATUS deliberately does not. See the
 * header.
 */
export async function requireAdmin(): Promise<AdminGate> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, response: adminNotFound() };
  return { ok: true, user: admin };
}

/**
 * The refusal, and the only 404 in this project that is a security answer.
 *
 * Empty body on purpose (§1.2). Exported so A5 and A6 can answer a *legitimate*
 * miss -- an unknown user id, an unknown slug -- with the same response an
 * unauthorised caller gets, which is what makes "does this user exist" unanswerable
 * from the outside.
 */
export function adminNotFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}
