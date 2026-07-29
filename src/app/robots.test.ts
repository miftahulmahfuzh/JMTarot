import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import robots from './robots';

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://www.jmtarot.site';
});

describe('robots.txt', () => {
  it('still disallows /s/ and /api/ -- THE LINE THAT MATTERS', () => {
    // V7's three halves: this `Disallow`, the `x-robots-tag` header, and the
    // `<meta>` twin. None of the three is redundant; a `Disallow` is the only
    // one that prevents the fetch at all.
    const rule = robots().rules;
    const first = Array.isArray(rule) ? rule[0] : rule;
    expect(first.disallow).toContain('/s/');
    expect(first.disallow).toContain('/api/');
    expect(first.allow).toBe('/');
  });

  it('names the sitemap ABSOLUTELY, because the directive requires it', () => {
    expect(robots().sitemap).toBe('https://www.jmtarot.site/sitemap.xml');
  });

  it('imports the ORIGIN LEAF and nothing heavier', () => {
    /*
     * This file's header refused `shareOrigin()` because it pulls `server-only`,
     * `queries/share.ts` and the whole Drizzle schema into a route whose output
     * is four lines of text. That refusal STANDS. `@/lib/seo/origin` exists so
     * the refusal does not also mean "no origin at all".
     */
    const source = readFileSync(join(process.cwd(), 'src/app/robots.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain("from '@/lib/seo/origin'");
    expect(code).not.toContain('@/lib/share');
    expect(code).not.toContain('@/lib/db');
    expect(code).not.toContain('server-only');
  });
});
