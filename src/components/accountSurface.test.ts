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
  /**
   * **TWO IMPORTS ARE A MOUNT SINCE 2026-08-30, AND MISSING THE SECOND WOULD HAVE
   * MADE THIS FILE GREEN AND BLIND.** `ReadingActions` mounts `AccountButton` under a
   * finished reading, so a page that imports the ROW mounts the BUTTON -- and the
   * draw screen imports only the row. A denylist that follows one import edge is not
   * a general solution; it is the one edge that exists, named, and it fails loudly if
   * a third intermediary appears, because that intermediary's importers will not be
   * on this list.
   */
  const DIRECT = importers(/from '@\/components\/AccountButton'/);
  const VIA_ROW = importers(/from '@\/components\/ReadingActions'/);
  const MOUNTS = [...new Set([...DIRECT, ...VIA_ROW])].sort();

  it('is mounted somewhere, so the denylist below is not vacuously passing', () => {
    expect(MOUNTS.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * **THE DRAW SCREEN LEFT THIS LIST ON 2026-08-30, AND THE REASON IT WAS ON IT IS
   * STILL TRUE.** Roadmap §7 trap 4: a language flip after a reading -- `router.refresh()`
   * keeps client state -- leaves the prose in one language and the chrome in another,
   * and `readings.locale` is permanent.
   *
   * What changed is which resolution is in force. `AccountButton`'s header rejected
   * *"suppress only the Language row"* because a suppression that holds only WHILE
   * STREAMING re-enables itself the instant the stream ends. `ReadingActions`
   * suppresses it PERMANENTLY for `surface === 'draw'`, reads no streaming state, and
   * is asserted by name in the next describe. **That assertion is now the load-bearing
   * one; if it is ever deleted, put `app/[reader]/[service]/` back on this list.**
   *
   * The rest have no session by design (`isPublic()`), except `/s/` -- which has
   * no session BECAUSE IT IS A STRANGER'S PAGE (V7, VD9).
   */
  it('is not mounted on any page without a session', () => {
    const FORBIDDEN = [
      'app/login/',
      'app/terms/',
      'app/privacy/',
      'app/onboarding/',
      'app/s/', // V7's public share page. Named before it exists.
      // S1's signed-out homepage. No session BY CONSTRUCTION: `page.tsx` renders
      // it only when `currentUser()` is null, so an account circle here would be
      // a control with nothing behind it.
      'app/Landing.tsx',
      'app/layout.tsx', // the mount seam is the owning page, never the root layout
    ];
    for (const prefix of FORBIDDEN) {
      expect({ [prefix]: MOUNTS.filter((p) => p.startsWith(prefix)) }).toEqual({
        [prefix]: [],
      });
    }
  });

  /**
   * The draw screen may reach the account control THROUGH THE ROW AND ONLY THROUGH
   * IT. A direct import there would be the un-suppressed button, which is the bug the
   * denylist above was written for.
   */
  it('never reaches the draw screen directly', () => {
    expect(DIRECT.filter((p) => p.startsWith('app/[reader]/[service]/'))).toEqual([]);
  });
});

describe('the reading action row', () => {
  const SOURCE = FILES.find((f) => f.path === 'components/ReadingActions.tsx');

  it('exists', () => {
    expect(SOURCE).toBeDefined();
  });

  /**
   * **ROADMAP §7 TRAP 4, AS AN ASSERTION.** This one line is the whole reason the
   * account control is allowed on the draw screen at all. Deleting it is a two-token
   * edit that looks like a simplification and strands a finished Indonesian reading
   * under English chrome, with nothing on screen looking wrong.
   */
  it('suppresses the language row on the draw screen, in code', () => {
    expect(SOURCE!.source).toMatch(/surface !== 'draw'/);
  });

  /** Both reading surfaces, and nothing else. R1b is half the requirement. */
  it('is mounted on exactly the two screens that render a whole reading', () => {
    expect(importers(/from '@\/components\/ReadingActions'/)).toEqual([
      'app/[reader]/[service]/Draw.tsx',
      'app/history/[id]/HistoryDetail.tsx',
    ]);
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
