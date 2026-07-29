import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isAdminEmail, parseAdminAllowlist } from './allowlist';

describe('parseAdminAllowlist -- unset and empty mean NOBODY (A1-3)', () => {
  /*
   * A-D1 and roadmap §8: this is the RATELIMIT_BACKEND direction, not the
   * ANALYTICS_ENABLED one. There, a typo must over-collect. Here, a typo must not
   * open a door -- so every degenerate input is the empty list and there is no
   * input for which the parse "gives up" and admits everyone.
   */
  it('yields the empty list for every degenerate input', () => {
    for (const raw of [undefined, null, '', '   ', ',', ',,', ' , , ', '\n\t']) {
      expect(parseAdminAllowlist(raw)).toEqual([]);
    }
  });
});

describe('parseAdminAllowlist -- the shape of a real value', () => {
  it('trims, lowercases and drops empties', () => {
    expect(parseAdminAllowlist(' A@X.com , b@y.CO ,, ')).toEqual(['a@x.com', 'b@y.co']);
  });

  it('de-duplicates, so a doubled entry does not double the scan', () => {
    expect(parseAdminAllowlist('a@x.com,A@X.COM')).toEqual(['a@x.com']);
  });

  it('keeps order, because the list is read by a human in a dashboard', () => {
    expect(parseAdminAllowlist('b@y.co,a@x.com')).toEqual(['b@y.co', 'a@x.com']);
  });

  it('does not accept a semicolon or a space as a separator', () => {
    // A comma is the documented separator. Accepting more of them means an
    // `a@x.com b@y.co` typo silently grants b@y.co.
    expect(parseAdminAllowlist('a@x.com;b@y.co')).toEqual(['a@x.com;b@y.co']);
    expect(parseAdminAllowlist('a@x.com b@y.co')).toEqual(['a@x.com b@y.co']);
  });
});

describe('isAdminEmail', () => {
  const LIST = parseAdminAllowlist('a@x.com, b@y.co, c@z.io');

  it('matches case-insensitively, both sides', () => {
    expect(isAdminEmail('a@x.com', LIST)).toBe(true);
    expect(isAdminEmail('A@X.COM', LIST)).toBe(true);
    expect(isAdminEmail('  a@x.com  ', LIST)).toBe(true);
  });

  it('matches an entry in ANY position, including the last', () => {
    // The whole-list scan (A1-4) is what makes position irrelevant. A version
    // that returned early would pass this and fail the source assertion below.
    expect(isAdminEmail('c@z.io', LIST)).toBe(true);
  });

  it('admits nobody against an empty list -- INCLUDING the empty email', () => {
    expect(isAdminEmail('a@x.com', [])).toBe(false);
    expect(isAdminEmail('', [])).toBe(false);
    expect(isAdminEmail('', LIST)).toBe(false);
    expect(isAdminEmail(null, LIST)).toBe(false);
    expect(isAdminEmail(undefined, LIST)).toBe(false);
  });

  it('is EXACT -- no substring, no suffix, no prefix', () => {
    expect(isAdminEmail('a@x.com.evil.io', LIST)).toBe(false);
    expect(isAdminEmail('evil.io/a@x.com', LIST)).toBe(false);
    expect(isAdminEmail('aa@x.com', LIST)).toBe(false);
    expect(isAdminEmail('a@x.co', LIST)).toBe(false);
    expect(isAdminEmail('a@x.com\n', LIST)).toBe(true); // trimmed, and that IS exact
  });

  it('does NOT normalise Gmail dots or plus-addressing (A1-4)', () => {
    /*
     * `a.b@gmail.com` and `ab@gmail.com` are the same Google mailbox, and
     * normalising them would make the allowlist match an address NOBODY WROTE IN
     * IT. That is a privilege grant by helpfulness, and the fail-closed answer is
     * "write the address you actually sign in with".
     */
    const gmail = parseAdminAllowlist('a.b@gmail.com');
    expect(isAdminEmail('ab@gmail.com', gmail)).toBe(false);
    expect(isAdminEmail('a.b+admin@gmail.com', gmail)).toBe(false);
    expect(isAdminEmail('a.b@gmail.com', gmail)).toBe(true);
  });
});

describe('the compare is written to be constant-time (A1-4)', () => {
  /*
   * A BEHAVIOURAL TEST CANNOT SEE THIS, so it is asserted against the source. The
   * property is "no early return, and the loop count does not depend on where the
   * first differing character is" -- `.includes()` and `.indexOf()` both break it
   * and both are what a tidy-up reaches for.
   *
   * **AND THE HONEST CAVEAT, WRITTEN HERE SO NOBODY OVERSELLS IT:** a JS string
   * compare in a JIT is not rigorously constant-time and cannot be made so
   * without leaving the language. The threat this defends against is thin anyway
   * -- the value is an email address, not a secret, and an attacker learns "is X
   * an admin" from the 404-vs-200 they get for free. It is here because A-D1
   * requires it and because the cost is four lines; it is NOT here because the
   * email is a credential. Do not delete it, and do not cite it as one.
   */
  const SRC = readFileSync('src/lib/admin/allowlist.ts', 'utf8');

  it('folds every comparison into an accumulator instead of returning early', () => {
    expect(SRC).toMatch(/diff \|=/);
  });

  it('does not reach for includes/indexOf/some on the allowlist', () => {
    expect(SRC).not.toMatch(/\.includes\(/);
    expect(SRC).not.toMatch(/\.indexOf\(/);
    expect(SRC).not.toMatch(/\.some\(/);
  });

  it('imports nothing at all, and reads no environment (A1-6)', () => {
    expect(SRC).not.toMatch(/^\s*import\s/m);
    expect(SRC).not.toMatch(/process\.env/);
  });
});
