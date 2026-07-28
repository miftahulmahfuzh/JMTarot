'use server';

/**
 * Sign out. The one server action W2's neighbourhood owns, added by V4.
 *
 * ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────
 *
 * IT DID NOT, UNTIL v0.3.0. `auth.signed_out` has been in the closed taxonomy
 * since W4 and nothing has ever fired it, because there was no control to fire
 * it from -- a user who installed the app to their home screen had no way to
 * leave. Roadmap R7.1 assigns it to V4, next to the account menu it belongs in.
 *
 * ── WHY A SERVER ACTION, AND NOT A ROUTE ─────────────────────────────────────
 *
 * `POST /api/auth/logout` is the shape a future session will reach for and it is
 * WRONG HERE. W2 deleted that route deliberately (reconciliation R13) when
 * Auth.js took ownership of sessions, and a second session-clearing path is
 * exactly the shape that makes holes: two places that must agree about cookie
 * names, about the JWE, and about what "signed out" means. There is one
 * `signOut`, it is @auth/core's, and this is a thin wrapper over it.
 *
 * DO NOT HAND-CLEAR THE COOKIE either. The session cookie's name, `secure`
 * flag, chunking and path are @auth/core's to know, and a manual `delete` that
 * gets any of them wrong leaves a live session behind while telling the user
 * they have left.
 *
 * ── WHY NOT `next-auth/react`'s CLIENT HELPER ────────────────────────────────
 *
 * It works, and it would pull the whole `next-auth/react` runtime plus a CSRF
 * round trip into the browser bundle for one button. `/login` already makes the
 * opposite trade explicitly -- "no next-auth/react, no SessionProvider, it ships
 * zero auth JavaScript" -- and the account menu is a client component only
 * because it is a bottom sheet, not because it needs an auth client.
 */

import { signOut } from './auth';

/**
 * Clear the session and land on `/login`.
 *
 * `redirectTo` and not a bare `signOut()`: the default sends the user to `/`,
 * which middleware immediately 307s to `/login` anyway -- one extra round trip
 * to arrive at the same page. Naming the destination also means the redirect is
 * a fact in this file rather than an emergent property of the gate.
 *
 * THIS NEVER RETURNS. `signOut` throws `NEXT_REDIRECT`, which Next unwinds into
 * a navigation. The caller must therefore have already flushed anything it
 * wanted recorded -- see `AccountMenu`'s `flushNow()` and the comment above it.
 */
export async function signOutAction(): Promise<never> {
  await signOut({ redirectTo: '/login' });
  /* Unreachable: `signOut` throws NEXT_REDIRECT above. Present so the return
     type is `never` rather than `void`, which tells a caller not to write code
     after the await. */
  throw new Error('unreachable');
}
