import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import id from '@/lib/i18n/locales/id';

/**
 * Where the account shell is allowed to appear, and where the language switcher
 * is allowed to live after v0.3.0 R1.
 *
 * BOTH ASSERTIONS ARE DENY-SHAPED, and that is deliberate. An allowlist would
 * have to be edited by V6, V7 and V8 as they land, and an allowlist somebody has
 * to edit to make their branch green is an allowlist somebody widens without
 * reading it. A denylist names the pages where the answer is NO and stays out of
 * everybody else's way -- and `app/s/` is on it before V7 has written that page,
 * so V7 learns the rule from a red test rather than from a review.
 */

const ROOT = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(ROOT).map((path) => ({
  path: path.slice(ROOT.length + 1).replaceAll('\\', '/'),
  source: readFileSync(path, 'utf8'),
}));

const importers = (re: RegExp) =>
  FILES.filter((f) => re.test(f.source)).map((f) => f.path).sort();

describe('the account button', () => {
  const MOUNTS = importers(/from '@\/components\/AccountButton'/);

  it('is mounted somewhere, so the denylist below is not vacuously passing', () => {
    expect(MOUNTS.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * **THE DRAW SCREEN IS THE IMPORTANT ENTRY** (roadmap §7 trap 4).
   *
   * A language flip mid-reading -- or after it, since `router.refresh()` keeps
   * client state -- leaves the prose in one language and the chrome in another,
   * and `readings.locale` records the language the prose came out in. The other
   * menu items navigate away and abort the stream, and one of them ends the
   * session. So the whole button is suppressed there, not just the Language row,
   * and the suppression is the ABSENCE OF AN IMPORT rather than a runtime flag
   * that can desync.
   *
   * The rest have no session by design (`isPublic()`), except `/s/` -- which has
   * no session BECAUSE IT IS A STRANGER'S PAGE (V7, VD9).
   */
  it('is not mounted on the draw screen or on any page without a session', () => {
    const FORBIDDEN = [
      'app/[reader]/[service]/', // THE DRAW SCREEN. See above.
      'app/login/',
      'app/terms/',
      'app/privacy/',
      'app/onboarding/',
      'app/s/', // V7's public share page. Named before it exists.
      'app/layout.tsx', // the mount seam is the owning page, never the root layout
    ];
    for (const prefix of FORBIDDEN) {
      expect({ [prefix]: MOUNTS.filter((p) => p.startsWith(prefix)) }).toEqual({
        [prefix]: [],
      });
    }
  });
});

describe('LocaleSwitch after R1', () => {
  /**
   * v0.3.0 R1: the reader-picker footer no longer carries it. Two importers,
   * and the test names them, because "one place plus login" is a claim the
   * component's header now makes and a claim in a comment is not enforcement.
   */
  it('lives in exactly two places: the login footer and the account menu', () => {
    expect(importers(/from '(?:\.|@\/components)\/LocaleSwitch'/)).toEqual([
      'app/login/page.tsx',
      'components/AccountMenu.tsx',
    ]);
  });
});

describe('sign out', () => {
  /**
   * R7.1 gave V4 the sign-out control, and the amendment's rule with it: ONE
   * session-clearing path, which is @auth/core's `signOut`.
   *
   * W2 deleted `/api/auth/logout` on purpose (reconciliation R13). A second path
   * is the shape that makes holes -- two places that must agree about the cookie
   * name, the `secure` flag, chunking and the JWE -- so assert the route stays
   * deleted rather than trusting that nobody re-adds the obvious thing.
   */
  it('has no hand-rolled logout route', () => {
    const offending = FILES.filter((f) => /^app\/api\/auth\/(logout|signout)\//.test(f.path));
    expect(offending.map((f) => f.path)).toEqual([]);
  });

  /**
   * And nothing outside `@/lib/auth/**` deletes a session cookie by hand. The
   * cookie's name and shape are @auth/core's to know; a manual `delete` that
   * gets any of it wrong leaves a live session behind while telling the user
   * they have left, which is the worst possible failure for this control.
   */
  it('clears the session through @auth/core and nowhere else', () => {
    const offending = FILES.filter(
      (f) =>
        !f.path.startsWith('lib/auth/') &&
        /cookies\(\)[\s\S]{0,40}\.delete\(|\.delete\(\s*['"][^'"]*authjs/.test(f.source),
    ).map((f) => f.path);
    expect(offending).toEqual([]);
  });

  /**
   * `auth.signed_out` has been in the closed taxonomy since W4 with nothing
   * firing it. That is now false, and this is the assertion that keeps it false
   * -- V4's whole reason for owning this control.
   */
  it('fires the event that has been declared and unfired since W4', () => {
    expect(importers(/track\('auth\.signed_out'/)).toEqual(['components/AccountMenu.tsx']);
  });
});

describe('the account shell copy', () => {
  /**
   * I3: an unknown key renders THE KEY, on purpose. That is a good rule and a bad
   * failure mode for a typo, so check the literal keys these two files ask for
   * really exist. Template-literal keys are skipped -- `LocaleSwitch`'s
   * `locale.code.${locale}` is covered by the type lock instead.
   */
  it('asks the catalog for keys that exist', () => {
    for (const name of ['components/AccountButton.tsx', 'components/AccountMenu.tsx']) {
      const file = FILES.find((f) => f.path === name);
      expect(file, name).toBeDefined();
      const keys = [...file!.source.matchAll(/\bt\('([a-z][\w.]*)'\)/g)].map((m) => m[1]);
      expect({ [name]: keys.length }).not.toEqual({ [name]: 0 });
      for (const key of keys) {
        expect({ [name]: key, present: key in id }).toEqual({ [name]: key, present: true });
      }
    }
  });
});
