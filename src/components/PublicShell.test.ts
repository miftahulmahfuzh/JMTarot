import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import id from '@/lib/i18n/locales/id';

const SOURCE = readFileSync(join(process.cwd(), 'src/components/PublicShell.tsx'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('PublicShell', () => {
  it('is a SERVER component with no session and no fetch', () => {
    /*
     * It wraps the routes a stranger reaches first. `currentUser()` here would
     * make every content page's cache key vary by session -- S-D10 -- and a
     * `'use client'` would ship a hydration bundle for a footer.
     */
    expect(CODE).not.toMatch(/^\s*(['"])use client\1/m);
    expect(CODE).not.toContain('currentUser');
    expect(CODE).not.toContain('requireUser');
    expect(CODE).not.toContain('useViewer');
    expect(CODE).not.toContain('fetch(');
    expect(CODE).not.toContain('@/lib/db');
  });

  it('drills no locale prop, and resolves the language itself', () => {
    // LocaleProvider's header: NO LOCALE PROP IS DRILLED ANYWHERE. `path` is a
    // route, which is a different thing from a language choice.
    expect(CODE).toContain('getT');
    expect(CODE).not.toMatch(/locale\s*:\s*Locale/);
    expect(CODE).not.toContain('LocaleProvider');
  });

  it('takes a `path` and NOT an `alternate` prop (R17)', () => {
    /*
     * S1's plan gave this an `alternate: { href, label } | null` that S2 never
     * defined and that four content pages would each have had to fill from
     * `contentAlternates()`. R17 deleted it: the shell takes the path and mounts
     * `ContentLocaleLink` itself, so the anchor and the `hreflang` tag come out of
     * one function and cannot drift.
     *
     * Asserted as an ABSENCE as well as a presence, because the tempting edit
     * while S2's component is still missing is to add the prop back "just for the
     * href".
     */
    expect(CODE).toContain('path: string');
    expect(CODE).not.toContain('alternate');
    expect(CODE).not.toMatch(/hrefLang/);
  });

  it('mounts S2s ContentLocaleLink and writes no anchor of its own', () => {
    /*
     * **INVERTED, NOT DELETED (v0.4.0 S2).** This assertion used to require the
     * mount point to be a COMMENT -- `expect(CODE).not.toContain('ContentLocaleLink')`
     * -- because while S2 was unlanded a local `<a>` written here "for now" would
     * have been the second definition of the other-language link that R17 exists
     * to prevent, and it is the one nobody deletes, because it works. S2 landed
     * the component, so the hole is filled and the half of the rule that still
     * binds is the second half: **the shell mounts, it does not implement.**
     *
     * ONE mount, so `path` reaches one place and the anchor cannot come from two.
     * And still no bare `<a` here: the two anchors on this page are `/terms` and
     * `/privacy` through `next/link`, neither of which is locale-aware.
     */
    expect(CODE.match(/<ContentLocaleLink\b/g) ?? []).toHaveLength(1);
    expect(CODE).toContain('path={path}');
    expect(CODE.match(/<a\s/g) ?? []).toHaveLength(0);
  });

  it('carries the entertainment-only disclaimer (§8.3)', () => {
    /*
     * W7's constraint is a disclaimer under every reading and on both pickers.
     * §8.3 extends it to the pages a stranger reaches FIRST, where the legal
     * exposure is higher rather than lower because the reader has no account.
     */
    expect(CODE).toContain('common.disclaimer.short');
  });

  it('uses only keys that exist in the source catalog', () => {
    // A `t()` on a missing key renders THE KEY (I3), on purpose, and on a public
    // page that is a bug report in a search result.
    const used = [...CODE.matchAll(/t\('([a-z][a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
    const keys = [...used, ...[...CODE.matchAll(/key: '([a-z][a-zA-Z0-9_.]+)'/g)].map((m) => m[1])];
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) expect(Object.keys(id), key).toContain(key);
  });

  it('never links to the page it is mounted on', () => {
    /*
     * The mechanism, source-level. It used to be a `filter` over a table of three
     * cross-links; those moved into the account menu (2026-07-29, see the
     * component's header) and the ONE remaining link is `/`, so the suppression is
     * a `surface === 'landing'` guard instead.
     *
     * **THIS ASSERTION EARNED ITS KEEP THE DAY THE LINKS MOVED.** The first version
     * of that change deleted the filter along with the table, and the landing
     * page's footer silently grew a link to itself -- caught here, not by eye.
     */
    expect(CODE).toContain('surface');
    expect(CODE).toMatch(/filter|!==\s*surface|surface\s*!==|surface === 'landing'/);
  });

  it('introduces no new design token', () => {
    // `## Styling`: change `tokens.ts` first, then mirror. Every custom property
    // used here must already exist in `src/theme/tokens.css`.
    const tokens = readFileSync(join(process.cwd(), 'src/theme/tokens.css'), 'utf8');
    const css = readFileSync(
      join(process.cwd(), 'src/components/PublicShell.module.css'),
      'utf8',
    );
    const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(3);
    for (const v of used) expect(tokens, v).toContain(v);
  });
});
