import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { absoluteUrl, siteOrigin } from './origin';

const KEYS = [
  'NEXT_PUBLIC_SITE_ORIGIN',
  'AUTH_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL',
] as const;

let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('siteOrigin', () => {
  it('prefers NEXT_PUBLIC_SITE_ORIGIN', () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://www.jmtarot.site';
    process.env.AUTH_URL = 'https://wrong.example';
    expect(siteOrigin()).toBe('https://www.jmtarot.site');
  });

  it('takes AUTH_URL next, and its ORIGIN rather than its string', () => {
    // AUTH_URL is allowed to carry a path. `shareOrigin()` learned this the hard
    // way -- concatenation would give `https://host/some/path/sitemap.xml`.
    process.env.AUTH_URL = 'https://www.jmtarot.site/some/path';
    expect(siteOrigin()).toBe('https://www.jmtarot.site');
  });

  it('adds the scheme Vercel omits', () => {
    // BOTH Vercel variables are bare hosts. A canonical of `www.jmtarot.site`
    // with no scheme is not a URL and `new URL()` throws on it.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'www.jmtarot.site';
    expect(siteOrigin()).toBe('https://www.jmtarot.site');
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.VERCEL_URL = 'jmtarot-abc123.vercel.app';
    expect(siteOrigin()).toBe('https://jmtarot-abc123.vercel.app');
  });

  it('prefers the PRODUCTION url over the per-deployment one', () => {
    // VERCEL_URL is the immutable per-deployment host. A canonical pointing at
    // it de-indexes the real page, which is the worst class of SEO bug.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'www.jmtarot.site';
    process.env.VERCEL_URL = 'jmtarot-abc123.vercel.app';
    expect(siteOrigin()).toBe('https://www.jmtarot.site');
  });

  it('falls back to the dev origin, which is 3001 and not 3000', () => {
    expect(siteOrigin()).toBe('http://localhost:3001');
  });

  it('never returns a trailing slash, for any rung', () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://www.jmtarot.site/';
    expect(siteOrigin()).toBe('https://www.jmtarot.site');
  });

  it('always returns something `new URL()` accepts', () => {
    // `metadataBase` is `new URL(siteOrigin())`. A throw there is a 500 on every
    // page in the app, so the leaf must be total.
    for (const bad of ['', '   ', 'not a url', '///']) {
      process.env.NEXT_PUBLIC_SITE_ORIGIN = bad;
      expect(() => new URL(siteOrigin())).not.toThrow();
    }
  });

  it('is read at CALL time, not module scope', () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://a.example';
    expect(siteOrigin()).toBe('https://a.example');
    process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://b.example';
    expect(siteOrigin()).toBe('https://b.example');
  });

  it('imports nothing', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/seo/origin.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Comments stripped first: the header names `@/lib/share/links` and
    // `server-only` while explaining why neither may be imported, and a rule that
    // fires on prose describing the rule is a rule people delete.
    // (`queries/contract.test.ts` records the same lesson.)
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).toContain('VERCEL_PROJECT_PRODUCTION_URL'); // not vacuous
  });
});

describe('absoluteUrl', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://www.jmtarot.site';
  });

  it('joins without doubling the slash', () => {
    expect(absoluteUrl('/gallery')).toBe('https://www.jmtarot.site/gallery');
    expect(absoluteUrl('gallery')).toBe('https://www.jmtarot.site/gallery');
  });

  it('renders the root as a bare origin plus one slash', () => {
    // `https://host` and `https://host/` are the same page and DIFFERENT strings.
    // A sitemap and a canonical that disagree about the slash are a self-referential
    // canonical that does not match, which Google reports as a duplicate.
    expect(absoluteUrl('/')).toBe('https://www.jmtarot.site/');
  });

  it('refuses to build a URL from an absolute one', () => {
    expect(() => absoluteUrl('https://evil.example/x')).toThrow(/relative path/);
    expect(() => absoluteUrl('//evil.example/x')).toThrow(/relative path/);
  });
});
