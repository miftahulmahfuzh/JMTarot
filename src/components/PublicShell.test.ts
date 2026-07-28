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

  it('leaves S2 a HOLE, not a placeholder anchor', () => {
    /*
     * The mount point for `ContentLocaleLink` is a comment. A local `<a>` written
     * here while S2 is unlanded would be the second definition of the
     * other-language link -- exactly what R17 exists to prevent -- and it is the
     * one nobody deletes, because it works.
     *
     * The two anchors that ARE here are `/terms` and `/privacy`, which are
     * `next/link` and not locale-aware.
     */
    expect(SOURCE).toContain('ContentLocaleLink');
    expect(CODE).not.toContain('ContentLocaleLink'); // still only in a comment
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
    // Cheap source-level check on the mechanism: the footer link list is built by
    // filtering on `surface`, not written out five times.
    expect(CODE).toContain('surface');
    expect(CODE).toMatch(/filter|!==\s*surface|surface\s*!==/);
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
