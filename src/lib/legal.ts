/**
 * The terms version, in one place.
 *
 * Compared against `users.terms_version`, so a bump forces re-acceptance for
 * every existing user. That makes it a **user-visible action**, not a
 * housekeeping value: change it for a material change to `/terms`, and not for a
 * typo fix.
 *
 * Date-shaped so the version and the day it shipped are the same fact. Read
 * through a function rather than exported as a constant because `process.env` is
 * not populated at module-evaluation time in every runtime this is imported
 * from, and a module-scope read would freeze the fallback into the bundle.
 *
 * NOT `server-only`: `/terms` and `/privacy` render it, and a version string is
 * not a secret.
 */
export const TERMS_VERSION_FALLBACK = '2026-07-27';

export function termsVersion(): string {
  return process.env.TERMS_VERSION || TERMS_VERSION_FALLBACK;
}
