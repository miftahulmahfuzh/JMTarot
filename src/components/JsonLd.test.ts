import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { breadcrumbList, graph, organization, website } from '@/lib/seo/jsonld';
import { JsonLd } from './JsonLd';

/**
 * **`.ts` AND `createElement`, NOT `.tsx` AND JSX, AND THAT IS NOT A STYLE
 * CHOICE.** `vitest.config.ts`'s unit project globs `src/**` + `/*.test.ts`
 * ONLY — a `.test.tsx` file is silently never collected, so a suite written that
 * way reports "No test files found" if you name it explicitly and reports nothing
 * at all if you do not. Widening the glob would change discovery for every other
 * workstream to save two `createElement` calls here.
 */

const SOURCE = readFileSync(join(process.cwd(), 'src/components/JsonLd.tsx'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ORIGIN = 'https://www.jmtarot.site';

/** The text between the tags of the one script element this renders. */
function payloadOf(html: string): string {
  const m = /<script type="application\/ld\+json">([\s\S]*)<\/script>/.exec(html);
  if (!m) throw new Error(`no ld+json script in: ${html.slice(0, 200)}`);
  return m[1];
}

describe('the JSON-LD mount', () => {
  it('is a SERVER component -- no directive, no hook', () => {
    /*
     * Structured data is decided entirely on the server and read only by
     * crawlers. A `'use client'` here would ship a hydration bundle for a block
     * nobody interacts with, on the one route strangers open over mobile data --
     * the same argument `Legal.tsx` makes for the terms documents.
     */
    expect(CODE).not.toMatch(/^\s*(['"])use client\1/m);
    expect(CODE).not.toContain('useT(');
  });

  it('serializes through the hardened function, and never a raw JSON.stringify', () => {
    expect(CODE).toContain('serializeJsonLd');
    expect(CODE).not.toContain('JSON.stringify');
  });

  it('uses NO dangerouslySetInnerHTML -- roadmap §5 rule 3, upheld by R1', () => {
    /*
     * **THIS ASSERTION IS THE REFUSED EXCEPTION.** S1's plan wrote
     * `dangerouslySetInnerHTML` here on the premise that React HTML-escapes a
     * text child of `<script>`; the reconciliation measured it and the premise is
     * false on react-dom 19.2.8. Rule 3 therefore stands with no exception at
     * all, and the next test proves the plain child actually works rather than
     * trusting that finding.
     */
    expect(CODE).not.toContain('dangerouslySetInnerHTML');
  });

  it('ROUND-TRIPS through a real render -- THE MEASUREMENT, NOT THE MEMORY (R1)', () => {
    /*
     * Render it, strip the tags, `JSON.parse` the result, and assert a value
     * containing `&`, `"`, `<` and the literal `</script>` comes back
     * byte-identical.
     *
     * **This test fails on BOTH agents' predicted failure modes and on a future
     * React that starts HTML-escaping raw-text children** -- which is exactly why
     * it renders rather than inspecting the source. It is the whole reason the
     * exception could be refused instead of argued about.
     */
    const name = 'Syarat & Ketentuan, a "quoted" thing, </script><img src=x>';
    const html = renderToStaticMarkup(
      createElement(JsonLd, { node: breadcrumbList([{ name, url: `${ORIGIN}/` }]) }),
    );

    // Nothing closed the element early, so the whole payload is still inside it.
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).not.toContain('<img');

    const parsed = JSON.parse(payloadOf(html));
    expect(parsed.itemListElement[0].name).toBe(name);
  });

  it('renders a whole @graph a crawler could read', () => {
    const html = renderToStaticMarkup(
      createElement(JsonLd, {
        node: graph([
          organization({ origin: ORIGIN, name: 'JMTarot', logo: '/icon.png' }),
          website({ origin: ORIGIN, name: 'JMTarot', description: 'x', inLanguage: 'id' }),
        ]),
      }),
    );
    const parsed = JSON.parse(payloadOf(html));
    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@graph'].map((n: { '@type': string }) => n['@type'])).toEqual([
      'Organization',
      'WebSite',
    ]);
  });

  it('is the ONLY place in src/ that writes an ld+json script tag', () => {
    /*
     * S-D16 has four more node types arriving from S3, S4 and S6. If any of them
     * writes its own `<script>`, the day `script-src` gets a nonce is the day
     * somebody has to find all five.
     */
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(full);
      }
      return out;
    };
    const offenders = walk(join(process.cwd(), 'src'))
      .filter((p) => !p.endsWith(join('components', 'JsonLd.tsx')))
      .filter((p) => readFileSync(p, 'utf8').includes('application/ld+json'));
    expect(offenders).toEqual([]);
  });
});
