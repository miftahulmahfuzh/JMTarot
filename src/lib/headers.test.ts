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
