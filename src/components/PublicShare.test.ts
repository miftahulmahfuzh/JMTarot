import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import id from '@/lib/i18n/locales/id';

const SOURCE = readFileSync(join(process.cwd(), 'src/components/PublicShare.tsx'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('PublicShare', () => {
  it('takes the URL as a PROP and never builds one', () => {
    /*
     * S-D8: the control shares the canonical URL of the page you are standing on.
     * That URL comes from the server, because `siteOrigin()`'s chain reads
     * `AUTH_URL` and both Vercel variables -- none of which carries a
     * `NEXT_PUBLIC_` prefix, so in a browser bundle they inline as `undefined` and
     * the chain silently collapses to `http://localhost:3001`.
     *
     * That is not hypothetical: `resolve.ts`'s header records
     * `localeSwitcherEnabled()` making exactly this mistake and living in
     * `LocaleSwitch.tsx` for about ten minutes.
     */
    expect(CODE).not.toContain('@/lib/seo/origin');
    expect(CODE).not.toContain('process.env');
    expect(CODE).toContain('url: string');
  });

  it('never touches /api/share or the share library', () => {
    /*
     * S-D8. Minting a `/s/<slug>` for a page whose URL is ALREADY public and
     * already canonical would manufacture a `noindex` duplicate of a page we are
     * trying to get indexed -- the opposite of this release's purpose -- and would
     * spend a rate-limit budget to do it.
     */
    expect(CODE).not.toContain('/api/share');
    expect(CODE).not.toContain('@/lib/share');
    expect(CODE).not.toContain('SHARE_ENTITIES');
  });

  it('reports which affordance worked, and `manual` when neither did', () => {
    // `share.copied`'s precedent: `navigator.share` is what "send it to WhatsApp"
    // is on a phone, clipboard is the desktop path, and `manual` means the querent
    // was left selecting the address bar. Without the third value the failure is
    // invisible.
    expect(CODE).toContain("'webshare'");
    expect(CODE).toContain("'clipboard'");
    expect(CODE).toContain("'manual'");
    expect(CODE).toContain('public.link_shared');
  });

  it('is a CLIENT component and uses the client tracker', () => {
    // `track` from `@/lib/analytics/track` in a client component drags
    // `node:async_hooks` and `next/server` into the browser bundle and fails the
    // build. Both share one `TrackFn` type, so only the import line differs.
    expect(CODE).toMatch(/^\s*(['"])use client\1/m);
    expect(CODE).toContain('@/lib/analytics/track.client');
    expect(CODE).not.toContain("from '@/lib/analytics/track'");
  });

  it('uses only keys that exist in the source catalog', () => {
    const used = [...CODE.matchAll(/'(public\.[a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
    const keys = used.filter((k) => !k.startsWith('public.link_'));
    expect(keys.length).toBeGreaterThan(2);
    for (const key of keys) expect(Object.keys(id), key).toContain(key);
  });

  it('introduces no new design token', () => {
    const tokens = readFileSync(join(process.cwd(), 'src/theme/tokens.css'), 'utf8');
    const css = readFileSync(join(process.cwd(), 'src/components/PublicShare.module.css'), 'utf8');
    const vars = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
    expect(vars.length).toBeGreaterThan(3);
    for (const v of vars) expect(tokens, v).toContain(v);
  });
});
