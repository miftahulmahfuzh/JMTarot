/**
 * "Who is this, on the server." NODE ONLY -- never import from middleware.
 *
 * EVERY OTHER WORKSTREAM USES THIS FILE AND NOTHING ELSE. `requireUser()` in a
 * route handler, `currentUser()` in a server component. Do not call `auth()`
 * directly and do not read the cookie: both are how two different notions of "the
 * current user" end up in one codebase.
 *
 * Both functions are DATABASE-FREE. They decode the session cookie and return what
 * is in it, which is the property roadmap §6's first non-negotiable protects.
 *
 * `handlers` is deliberately NOT re-exported. Its only importer is the
 * `[...nextauth]` route, and keeping them apart means a page that imports
 * `requireUser` does not drag the whole OAuth machine into its module graph.
 */
import { NextResponse } from 'next/server';
import type { Locale } from '@/data/types';
import { auth } from './auth';
import { readToken } from './token';

export type { Locale };

export type CurrentUser = {
  /** users.id. THE only key any table in the schema is joined on. */
  id: string;
  /**
   * Google's OIDC `sub`, or `dev:<name>` under DEV_PASSWORD_LOGIN.
   * Stable, but NEVER a foreign key. Use `id`.
   */
  googleSub: string;
  email: string;
  displayName: string | null;
  locale: Locale;
  onboardingComplete: boolean;
};

/**
 * The current user, or null. Never throws.
 *
 * Safe in a server component, a route handler or a server action.
 *
 * NOT SAFE IN `src/app/layout.tsx`, and that is a rule rather than a preference:
 * calling this in the root layout makes the entire app dynamic, including `/terms`
 * and `/privacy` -- the two pages a stranger loads, the two Google's Branding page
 * will link to, and the two that should stay static. Call it in the server page
 * that owns the subtree.
 */
export async function currentUser(): Promise<CurrentUser | null> {
  const session = await auth();

  /*
   * The SAME narrowing the cookie gets, deliberately. `auth.ts`'s session callback
   * copies `uid`/`sub`/`onb`/`loc` onto `session.user` under exactly those names,
   * so `readToken` is the right shape -- and reusing it means there is one place
   * that decides what a valid identity looks like instead of two that can drift.
   *
   * What it buys: a token from a previous deploy with no `uid`, or a `uid` that is
   * not uuid-shaped, becomes "no session" rather than a CurrentUser whose `id` is
   * `undefined`. The second one reaches a SQL query as a foreign key.
   */
  const t = readToken(session?.user);
  if (!t) return null;

  return {
    id: t.uid,
    googleSub: t.sub,
    email: t.email,
    displayName: t.name,
    locale: t.loc,
    onboardingComplete: t.onb,
  };
}

export type AuthGate =
  | { ok: true; user: CurrentUser }
  | { ok: false; response: NextResponse };

/**
 * The route-handler form.
 *
 * The `{ ok }` shape deliberately mirrors `hit()` in `src/lib/ratelimit.ts`, so
 * the two guards at the top of a handler read identically:
 *
 *     const gate = await requireUser();
 *     if (!gate.ok) return gate.response;
 *     const rl = hit(gate.user.id);
 *     if (!rl.ok) return ...
 *
 * `requireOnboarding` DEFAULTS TO TRUE. Fail closed: a handler whose author did
 * not think about onboarding gets the safe behaviour, and the one place that wants
 * the other behaviour has to say so.
 *
 * The two statuses and their bodies match `gate.decide()` exactly, so a caller
 * cannot tell whether middleware or the handler refused it -- which matters,
 * because middleware's matcher excludes paths a handler still has to defend.
 */
export async function requireUser(opts?: { requireOnboarding?: boolean }): Promise<AuthGate> {
  const user = await currentUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (opts?.requireOnboarding !== false && !user.onboardingComplete) {
    // 403, not 401. The client needs to tell "your session died, sign in again"
    // from "finish onboarding first": they lead to different screens.
    return {
      ok: false,
      response: NextResponse.json({ error: 'Onboarding required' }, { status: 403 }),
    };
  }

  return { ok: true, user };
}

/** What a client component is allowed to know. See `viewer.tsx`. */
export type Viewer = {
  id: string;
  displayName: string | null;
  locale: Locale;
  onboardingComplete: boolean;
};

/**
 * Narrow a CurrentUser to what is safe to hand a client component.
 *
 * `email` and `googleSub` are deliberately absent. The email is the one field with
 * a real disclosure cost if it leaks into a bundle or a screenshot, and the
 * `googleSub` is an identifier nothing on the client should ever key on. If a
 * client component needs either, that is a conversation, not a field addition.
 */
export function toViewer(u: CurrentUser | null): Viewer | null {
  if (!u) return null;
  return {
    id: u.id,
    displayName: u.displayName,
    locale: u.locale,
    onboardingComplete: u.onboardingComplete,
  };
}
