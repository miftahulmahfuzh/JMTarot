import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Source-level assertions over `DELETE /api/account`, in the register
 * `legal.test.ts` uses.
 *
 * They earn their place for that file's reason. The runtime proof that the
 * transaction rolls back is `src/lib/account/delete.integration.test.ts`; these
 * are what stop somebody keeping that test green by other means — moving the
 * redaction out of the transaction, dropping the cookie clear because "signOut()
 * handles it", or letting `requireUser`'s fail-closed default bar the one user
 * who most needs this route.
 *
 * COMMENTS ARE STRIPPED FIRST for the lesson `contract.test.ts` and
 * `clientBoundary.test.ts` both record and `delete.integration.test.ts` re-learned
 * an hour ago: a rule that fires on the prose describing the rule is a rule people
 * delete.
 */
const RAW = readFileSync('src/app/api/account/route.ts', 'utf8');
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('DELETE /api/account', () => {
  it('read the file at all, so nothing below passes vacuously', () => {
    expect(SRC.length).toBeGreaterThan(500);
    expect(SRC).toContain('export async function DELETE');
  });

  it('does not require completed onboarding (A4)', () => {
    // Somebody who signed in, saw the questionnaire and wants out has a `users`
    // row and a right to erase it.
    expect(SRC).toContain('requireOnboarding: false');
  });

  it('clears the session cookie by name, not by a typed literal (A3)', () => {
    /*
     * Auth.js prefixes the cookie name with `__Secure-` on https, so a typed
     * literal clears the wrong cookie in production only — the session survives
     * behind a page saying the account is gone, and it looks correct locally.
     */
    expect(SRC).toContain('SESSION_COOKIE_NAME');
    expect(SRC).toMatch(/maxAge:\s*0/);
    expect(SRC).not.toMatch(/authjs\.session-token['"]/);
  });

  it('exports no GET and no PATCH', () => {
    // The facts editor is its own route. A handler that both reads the account
    // and destroys it is one typo away from a very bad afternoon.
    expect(SRC).not.toMatch(/export\s+async\s+function\s+GET/);
    expect(SRC).not.toMatch(/export\s+async\s+function\s+PATCH/);
  });

  it('rate limits, and awaits the limiter', () => {
    // `hit()` is async since V9; an un-awaited Promise is truthy, i.e. never
    // refuses.
    expect(SRC).toMatch(/await\s+hit\(/);
  });

  it('declares runtime and maxDuration', () => {
    /*
     * `POST /api/locale` was the only database-writing route declaring neither and
     * it was killed at Vercel's Hobby default of ten seconds, cold. A deletion is
     * a user action that WRITES, which is one of the few things likely to be the
     * request that wakes a suspended Neon compute.
     */
    expect(SRC).toContain("export const runtime = 'nodejs'");
    expect(SRC).toMatch(/export const maxDuration = \d+/);
  });

  it('never logs a raw error object in production', () => {
    /*
     * `moderation_flags` is one of the tables in this transaction and its
     * `question` column holds text W7's classifier flagged; a postgres error
     * quotes its bound parameters. `auth.ts` earned this rule in production on
     * 2026-07-28 by logging a querent's email and real name.
     */
    const production = SRC.slice(SRC.indexOf('function logFailure'));
    const elseArm = production.slice(production.indexOf('} else {'));
    expect(elseArm).toContain('name:');
    expect(elseArm).not.toMatch(/console\.error\([^)]*,\s*err\s*\)/);
  });

  it('fires account.deleted from after(), never inline', () => {
    // A tracked erasure that rolled back is worse than an untracked one.
    const track = SRC.indexOf("track('account.deleted'");
    expect(track).toBeGreaterThan(-1);
    const before = SRC.slice(0, track);
    expect(before.lastIndexOf('after(')).toBeGreaterThan(before.lastIndexOf('return NextResponse'));
  });

  it('reads the analytics facts BEFORE the delete', () => {
    /*
     * `readings` and `personas` both cascade at the hard delete. Reading them
     * afterwards works today, because the delete is soft, and would silently start
     * reporting zeroes the day anybody makes it hard.
     */
    expect(SRC.indexOf('preDeleteFacts(')).toBeLessThan(SRC.indexOf('deleteAccount('));
  });
});
