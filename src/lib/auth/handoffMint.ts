import 'server-only';

/**
 * The one DB-touching half of the handoff that a COMPONENT calls.
 *
 * **NODE-ONLY, AND SEPARATE FROM `handoff.ts` FOR THE REASON `auth.ts` IS
 * SEPARATE FROM `config.ts`.** `src/middleware.ts` imports the names and the
 * randomness from `handoff.ts` and runs them on the edge; this file reaches
 * `@/lib/db/client`, which begins with `import 'server-only'`. One module holding
 * both would put the Postgres driver in the edge bundle — a loud failure, and one
 * that is tempting to silence with `runtime = 'nodejs'` on the middleware, which
 * would instantiate a pool inside a function that runs on nearly every request.
 *
 * `mintHandoff()` is called from `SignInForm`'s server action, which is the only
 * place in this application that calls `signIn('google')` and is fenced there by
 * `SignInForm.test.ts`.
 */
import { cookies } from 'next/headers';
import { db } from '@/lib/db/client';
import { createHandoff } from '@/lib/db/queries/handoff';
import {
  HANDOFF_TTL_SECONDS,
  PWA_COOKIE,
  deviceHash,
  handoffPath,
  newSecret,
} from './handoff';

/**
 * Where Google should return to for this sign-in.
 *
 * Returns `fallback` — the caller's ordinary `redirectTo` — for every browser
 * that is not the installed app, which is to say for every request carrying no
 * {@link PWA_COOKIE}. **That branch does no I/O at all**, which is what makes the
 * design's blast-radius claim true rather than merely likely: Safari, Chrome and
 * every desktop session take a byte-identical path to the one they took before
 * this shipped.
 *
 * ── IT NEVER THROWS, AND THAT IS THE LOAD-BEARING PROPERTY ───────────────────
 *
 * `chain.ts`'s rule, on a path where the consequence is worse. This runs one
 * statement in front of a sign-in, and a sign-in that 500s because a handoff row
 * could not be written would have turned a bug that only affects the home-screen
 * app into an outage that affects everybody. A failure here degrades to exactly
 * the behaviour of yesterday: Google returns to the ordinary destination, the
 * standalone app stays signed out, and the querent is no worse off than they were
 * before this feature existed.
 *
 * The error's CLASS only. This statement binds a challenge and a hash and no
 * personal data at all, but *a `catch` that is an exception to the rule is a
 * `catch` somebody copies* — the sweep route's own words.
 */
export async function handoffRedirect(fallback: string): Promise<string> {
  try {
    const secret = (await cookies()).get(PWA_COOKIE)?.value;
    if (!secret) return fallback;

    const challenge = newSecret();
    await createHandoff(db, {
      challenge,
      deviceHash: await deviceHash(secret),
      expiresAt: new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000),
    });

    return handoffPath(challenge);
  } catch (err) {
    console.error(
      '[auth] could not mint a standalone handoff; signing in normally',
      err instanceof Error ? err.name : 'unknown',
    );
    return fallback;
  }
}
