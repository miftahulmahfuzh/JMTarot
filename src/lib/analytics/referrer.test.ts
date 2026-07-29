import { afterEach, describe, expect, it, vi } from 'vitest';
import { referrerKind } from './referrer';

afterEach(() => vi.unstubAllGlobals());

/**
 * The five branches, and the SSR one is the default in this environment.
 *
 * `environment: 'node'` -- there is no jsdom in this project, and
 * `vitest.config.ts`'s unit project includes only `src/**\/*.test.ts`, so naming
 * this file `.test.tsx` would make it silently never run.
 */
describe('referrerKind', () => {
  it("is 'direct' where there is no document at all (SSR)", () => {
    expect(typeof document).toBe('undefined');
    expect(referrerKind()).toBe('direct');
  });

  it("is 'direct' for an empty referrer", () => {
    vi.stubGlobal('document', { referrer: '' });
    vi.stubGlobal('window', { location: { origin: 'https://www.jmtarot.site' } });
    expect(referrerKind()).toBe('direct');
  });

  it("is 'internal' for our own origin", () => {
    vi.stubGlobal('document', { referrer: 'https://www.jmtarot.site/blog' });
    vi.stubGlobal('window', { location: { origin: 'https://www.jmtarot.site' } });
    expect(referrerKind()).toBe('internal');
  });

  it("is 'external' for anybody else, including our own apex", () => {
    /*
     * `https://jmtarot.site/` is the APEX, which 308-redirects to `www`. It is
     * `external` by origin comparison and that is correct rather than a bug: a
     * visitor arriving from the apex arrived from a redirect, not from a page.
     */
    vi.stubGlobal('window', { location: { origin: 'https://www.jmtarot.site' } });
    for (const r of ['https://www.google.com/', 'https://jmtarot.site/', 'https://t.co/x']) {
      vi.stubGlobal('document', { referrer: r });
      expect(referrerKind()).toBe('external');
    }
  });

  it("is 'direct' rather than throwing on a malformed referrer", () => {
    // A referrer arrives from the platform, not from us. A throw inside an effect
    // that fires on every public page view is not a tradeoff worth taking for a
    // value whose whole purpose is a rough class.
    vi.stubGlobal('document', { referrer: 'not a url' });
    vi.stubGlobal('window', { location: { origin: 'https://www.jmtarot.site' } });
    expect(referrerKind()).toBe('direct');
  });

  it('never returns the referrer itself, under any input (rule 2)', () => {
    // The property the taxonomy actually needs: three closed values, and no
    // possible input leaks somebody else's URL into `events.props`.
    vi.stubGlobal('window', { location: { origin: 'https://www.jmtarot.site' } });
    for (const r of ['', 'https://x.test/a?b=c#d', 'not a url', 'https://www.jmtarot.site/x']) {
      vi.stubGlobal('document', { referrer: r });
      expect(['direct', 'internal', 'external']).toContain(referrerKind());
    }
  });
});
