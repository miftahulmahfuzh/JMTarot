import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

/**
 * The security headers, asserted from `next.config.ts` itself.
 *
 * **THE POINT OF THIS FILE IS THE TWO VALUES A SECURITY CHECKLIST WILL TELL THE
 * NEXT PERSON TO TIGHTEN**, both of which would break this project's only way of
 * driving its own UI. Everything else here is a cheap guard on values that are
 * easy to typo.
 *
 * Verified on the wire on 2026-07-27 against `npm start`, not only here: all
 * eight headers present on `/terms`, and `/cards/*` correctly receiving BOTH the
 * immutable cache rule and the security block, which is what confirms Next
 * applies every matching entry rather than only the first.
 *
 * **A TRAP THAT COST REAL TIME DURING THAT CHECK, RECORDED SO IT DOES NOT AGAIN:**
 * `pkill -f "next start"` does not kill the server. The process renames itself
 * to `next-server (vX.Y.Z)`, so a stale instance keeps the port and every
 * subsequent `curl` silently tests an OLD BUILD. It looked exactly like "Next
 * ignores the headers config", and nearly bought a pointless rewrite that moved
 * these into middleware. Kill `next-server`, or check `ss -lptn | grep <port>`.
 */

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

async function rules(): Promise<HeaderRule[]> {
  const fn = nextConfig.headers;
  if (!fn) throw new Error('next.config.ts declares no headers()');
  return (await fn()) as HeaderRule[];
}

/** The catch-all block, found by the header it carries rather than by index. */
async function securityBlock(): Promise<Record<string, string>> {
  const all = await rules();
  const block = all.find((r) => r.headers.some((h) => h.key === 'x-frame-options'));
  if (!block) throw new Error('no security header block');
  return Object.fromEntries(block.headers.map((h) => [h.key, h.value]));
}

describe('the security headers', () => {
  it('applies to every path', async () => {
    const all = await rules();
    const block = all.find((r) => r.headers.some((h) => h.key === 'x-frame-options'));
    // `/(.*)` and `/:path*` are both documented catch-alls; either is fine, a
    // narrower source is not.
    expect(['/(.*)', '/:path*']).toContain(block!.source);
  });

  it('sets the six §6.5 headers', async () => {
    const h = await securityBlock();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toContain('camera=()');
    expect(h['cross-origin-opener-policy']).toBe('same-origin');
  });

  it('sets HSTS for two years WITHOUT preload', async () => {
    /*
     * Preload is a one-way door: removal takes months and a browser release.
     * `jmtarot.site` was bought on 2026-07-27. Add it when the domain has
     * settled, not before.
     */
    const h = await securityBlock();
    expect(h['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');
    expect(h['strict-transport-security']).not.toContain('preload');
  });

  it('uses SAMEORIGIN, never DENY', async () => {
    /*
     * **THIS IS THE ONE.** CLAUDE.md documents the iframe harness under
     * `public/cards/` as the project's only way to drive its own UI -- Chromium
     * cannot launch in this WSL image, and that technique caught the two worst
     * bugs in the project's history. W7's refusal screenshots were taken with
     * it, under this very header.
     *
     * `DENY` kills it and buys nothing: the threat is framing from ANOTHER
     * origin, which SAMEORIGIN already blocks.
     */
    const h = await securityBlock();
    expect(h['x-frame-options']).toBe('SAMEORIGIN');
  });

  it("enforces frame-ancestors 'self', never 'none'", async () => {
    /*
     * The modern equivalent, and the one browsers honour when both are present
     * -- so `'none'` here would kill the harness even with SAMEORIGIN above.
     * Same reasoning, different header, and it has to be asserted separately
     * because tightening one without the other is the likely half-fix.
     */
    const h = await securityBlock();
    expect(h['content-security-policy']).toContain("frame-ancestors 'self'");
    expect(h['content-security-policy']).not.toContain("frame-ancestors 'none'");
  });

  it('enforces the four no-nonce directives', async () => {
    const h = await securityBlock();
    for (const directive of [
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
    ]) {
      expect(h['content-security-policy']).toContain(directive);
    }
  });

  it('keeps script-src in the REPORT-ONLY policy only', async () => {
    /*
     * Next inlines bootstrap scripts and RSC flight data, so an enforced
     * `script-src` needs a per-request nonce generated in middleware -- and W2
     * owns middleware. Enforcing it without the nonce would white-screen the
     * app, which is a worse outcome than not having it yet.
     */
    const h = await securityBlock();
    expect(h['content-security-policy']).not.toContain('script-src');
    expect(h['content-security-policy-report-only']).toContain("script-src 'self'");
  });

  it('ships no report-uri, because reconciliation §7.9a cut it', async () => {
    // "A report endpoint that nothing reads." Violations surface in the browser
    // console; an empty directive would be worse than an absent one.
    const h = await securityBlock();
    expect(h['content-security-policy-report-only']).not.toContain('report-uri');
    expect(h['content-security-policy']).not.toContain('report-uri');
  });

  it('does not allow the Google avatar host, because nothing renders it', async () => {
    /*
     * Reconciliation R21 dropped the avatar DELIBERATELY, and `auth.ts`'s own
     * comment says the CSP exception was part of the reason. If a future design
     * renders it, `img-src` changes here and that comment stops being true.
     */
    const h = await securityBlock();
    expect(h['content-security-policy-report-only']).toContain("img-src 'self' data:");
    expect(h['content-security-policy-report-only']).not.toContain('googleusercontent');
  });

  it('leaves the two immutable cache rules intact', async () => {
    // Both rules apply to /cards/* -- verified on the wire. A future edit that
    // collapses them into the catch-all would drop the year-long cache on 22
    // images the fan pulls on first draw.
    const all = await rules();
    const cards = all.find((r) => r.source.startsWith('/cards'));
    expect(cards?.headers[0]).toEqual({
      key: 'cache-control',
      value: 'public, max-age=31536000, immutable',
    });
  });
});

describe('the /s/ block (V7)', () => {
  /** V7's public-page block, found by the header only it carries. */
  async function shareBlock(): Promise<HeaderRule> {
    const all = await rules();
    const block = all.find((r) => r.headers.some((h) => h.key === 'x-robots-tag'));
    if (!block) throw new Error('no /s/ header block');
    return block;
  }

  it('matches the share prefix and nothing wider', async () => {
    const block = await shareBlock();
    expect(block.source).toBe('/s/:path*');
    // A catch-all here would put `no-referrer` on the whole app, which breaks
    // nothing visibly and silently loses same-origin referrer analytics.
    expect(['/(.*)', '/:path*']).not.toContain(block.source);
  });

  it('tells every crawler not to index, follow or archive a shared reading', async () => {
    /*
     * A 60-BIT SLUG IS UNGUESSABLE; IT IS NOT UNINDEXABLE. One link posted
     * anywhere a crawler reaches turns "I sent this to one friend" into a
     * permanent search result whose cache survives revocation. `noarchive`
     * because an index entry is recoverable and a cached copy is not.
     */
    const h = Object.fromEntries((await shareBlock()).headers.map((x) => [x.key, x.value]));
    expect(h['x-robots-tag']).toContain('noindex');
    expect(h['x-robots-tag']).toContain('nofollow');
    expect(h['x-robots-tag']).toContain('noarchive');
  });

  it('sends NO referrer from the one page whose URL is the secret', async () => {
    // The slug is in the URL, so any outbound navigation leaks the capability
    // itself in a `Referer` header. `/terms` and `/privacy` are linked from the
    // footer and any future outbound link inherits the leak.
    const h = Object.fromEntries((await shareBlock()).headers.map((x) => [x.key, x.value]));
    expect(h['referrer-policy']).toBe('no-referrer');
  });

  it('comes AFTER the catch-all, which is what makes the override work', async () => {
    /*
     * **THIS IS THE ASSERTION THAT WOULD OTHERWISE BE A SILENT NO-OP.** Next
     * applies every matching entry and a LATER one with the same key wins, so
     * `referrer-policy: no-referrer` only beats the global
     * `strict-origin-when-cross-origin` because this block is further down the
     * array. Reversing the two entries looks identical in review and quietly
     * restores referrer leakage on the exact page that must not leak.
     */
    const all = await rules();
    const security = all.findIndex((r) => r.headers.some((h) => h.key === 'x-frame-options'));
    const share = all.findIndex((r) => r.headers.some((h) => h.key === 'x-robots-tag'));
    expect(security).toBeGreaterThanOrEqual(0);
    expect(share).toBeGreaterThan(security);
  });

  it('does NOT tighten x-frame-options or frame-ancestors for /s/', async () => {
    /*
     * A security review of a newly public page will say `DENY` and `'none'`. Both
     * would kill the same-origin iframe harnesses under `public/cards/` while
     * blocking nothing that SAMEORIGIN does not -- including
     * `_shareshot.html`, which is the ONLY check that catches a client component
     * reaching for a session that is not there.
     */
    const h = Object.fromEntries((await shareBlock()).headers.map((x) => [x.key, x.value]));
    expect(h['x-frame-options']).toBeUndefined();
    expect(h['content-security-policy']).toBeUndefined();
  });
});

describe('the content cache rules (S1, S-D10)', () => {
  const CONTENT = 'public, s-maxage=3600, stale-while-revalidate=86400';

  async function ruleFor(source: string) {
    return (await rules()).find((r) => r.source === source);
  }

  it('caches every session-invariant content route, in both locales', async () => {
    /*
     * **BOTH LOCALES ARE LISTED, AND THAT IS NOT REDUNDANT.** Next's `headers()`
     * matches the INCOMING request path, before middleware's rewrite -- the
     * ordering is headers -> redirects -> middleware -> rewrites -- so
     * `/en/gallery` never matches the `/gallery` entry.
     */
    for (const source of [
      '/gallery',
      '/en/gallery',
      '/arcana/:slug',
      '/en/arcana/:slug',
      '/blog',
      '/en/blog',
      '/blog/:slug',
      '/en/blog/:slug',
    ]) {
      const rule = await ruleFor(source);
      expect(rule, source).toBeDefined();
      expect(rule!.headers).toEqual([{ key: 'cache-control', value: CONTENT }]);
    }
  });

  it('gives / NO cache entry, and that is S-D5s price', async () => {
    /*
     * `/` dual-renders by session, middleware writes `jmt_locale` on it (so the
     * response carries a Set-Cookie and is uncacheable at the edge regardless), and
     * its LANGUAGE follows D6's chain because the signed-in arm is an app route.
     * A shared CDN entry would serve the landing to a signed-in user or the picker
     * to a stranger.
     *
     * Asserted as an ABSENCE, because the tempting edit is to add `/` to the list
     * above and it would look symmetrical. MEASURED 2026-07-29 against a real
     * `next start`: `/` answers `private, no-cache, no-store, max-age=0,
     * must-revalidate`, which is Next's dynamic default and is correct here.
     */
    expect(await ruleFor('/')).toBeUndefined();
    expect(await ruleFor('/en')).toBeUndefined();
  });

  it('carries cache-control and NOTHING else on those entries (S-D12)', async () => {
    /*
     * An entry carrying `x-robots-tag` that matched broadly would silently
     * `noindex` the whole site, and this file is the only thing that would notice.
     * A `referrer-policy` here would fight `/s/`'s override.
     */
    for (const rule of await rules()) {
      if (rule.source.startsWith('/s/') || rule.source === '/(.*)') continue;
      const keys = rule.headers.map((h) => h.key);
      expect({ [rule.source]: keys }).toEqual({ [rule.source]: ['cache-control'] });
    }
  });

  it('serves /wallpapers/* for a DAY, not a year of immutable (S-D9, W-D4)', async () => {
    /*
     * S5 declares this header and S1 writes it (§6.4). **A NEW ASSET CLASS GETS ITS
     * OWN ENTRY** rather than joining `/cards/*`, so its lifecycle can change
     * independently -- and this is the assertion that the lifecycle actually DID
     * change, which is the whole reason for the separate path.
     *
     * IT SHIPPED FOR ONE COMMIT AS `max-age=31536000, immutable`, WRITTEN FROM
     * `/cards/*`'s REASONING RATHER THAN FROM S5's DECLARATION, AND THIS TEST
     * ASSERTED IT. `immutable` on a non-content-hashed filename is what makes
     * regenerating the art a year-long staleness problem; a wallpaper is fetched
     * ONCE by somebody who tapped a button, so it buys nothing here. If this ever
     * reads `immutable` again, somebody has "made it consistent" with the entry
     * above it.
     */
    const rule = await ruleFor('/wallpapers/:path*');
    expect(rule?.headers).toEqual([
      { key: 'cache-control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
    ]);
    expect(rule?.headers[0].value).not.toContain('immutable');
  });

  it('sets no x-robots-tag and no content-disposition on /wallpapers/*', async () => {
    // The first is S-D12: `/s/`'s noindex must not spread to art we WANT indexed --
    // 22 pieces of original art in Google Images is upside. The second is W-D10:
    // `attachment` forces a download and closes iOS's long-press -> Add to Photos,
    // which is the fallback path when the Web Share sheet is unavailable.
    const keys = (await ruleFor('/wallpapers/:path*'))!.headers.map((h) => h.key);
    expect(keys).not.toContain('x-robots-tag');
    expect(keys).not.toContain('content-disposition');
  });

  it('leaves /cards/* on a year of immutable', async () => {
    // The negative control. Correcting S5's entry must not have touched the
    // neighbour whose traffic shape genuinely wants a year.
    const rule = await ruleFor('/cards/:path*');
    expect(rule?.headers[0].value).toBe('public, max-age=31536000, immutable');
  });

  it('adds every new entry AFTER the catch-all (S-D12)', async () => {
    const all = await rules();
    const security = all.findIndex((r) => r.headers.some((h) => h.key === 'x-frame-options'));
    for (const source of ['/gallery', '/wallpapers/:path*']) {
      expect(all.findIndex((r) => r.source === source), source).toBeGreaterThan(security);
    }
  });

  it('leaves /s/ as the ONLY entry carrying x-robots-tag', async () => {
    /*
     * Restated from S1's side, because this release adds nine entries to a file
     * whose ordering is load-bearing and whose most important property is that
     * `noindex` does NOT spread. One broadly-matching new entry with that key
     * would de-index the whole site and this file is the only thing that would
     * notice.
     */
    const tagged = (await rules()).filter((r) => r.headers.some((h) => h.key === 'x-robots-tag'));
    expect(tagged.map((r) => r.source)).toEqual(['/s/:path*']);
    const h = Object.fromEntries(tagged[0].headers.map((x) => [x.key, x.value]));
    expect(h['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    expect(h['referrer-policy']).toBe('no-referrer');
  });
});
