import { describe, expect, it } from 'vitest';
import { breadcrumbList, graph, organization, serializeJsonLd, website } from './jsonld';

const ORIGIN = 'https://www.jmtarot.site';

describe('organization', () => {
  it('names the operator and the logo, both absolute', () => {
    const o = organization({
      origin: ORIGIN,
      name: 'JMTarot',
      legalName: 'PT Citra Suka Buana',
      logo: '/icon.png',
      description: 'Bacaan tarot Major Arcana bersama tiga pembaca.',
    });
    expect(o['@type']).toBe('Organization');
    expect(o['@id']).toBe(`${ORIGIN}/#organization`);
    expect(o.url).toBe(`${ORIGIN}/`);
    expect(o.logo).toBe(`${ORIGIN}/icon.png`);
    expect(o.legalName).toBe('PT Citra Suka Buana');
  });

  it('omits sameAs rather than emitting an empty array', () => {
    // There are no social accounts. `sameAs: []` is a claim about nothing and
    // Google's validator flags it; an absent field is the honest shape.
    const o = organization({ origin: ORIGIN, name: 'JMTarot', logo: '/icon.png' });
    expect('sameAs' in o).toBe(false);
    expect('legalName' in o).toBe(false);
    expect('description' in o).toBe(false);
  });
});

describe('website', () => {
  it('links itself to the organization by @id, not by repeating it', () => {
    const w = website({ origin: ORIGIN, name: 'JMTarot', description: 'x', inLanguage: 'id' });
    expect(w['@type']).toBe('WebSite');
    expect(w['@id']).toBe(`${ORIGIN}/#website`);
    expect(w.publisher).toEqual({ '@id': `${ORIGIN}/#organization` });
  });

  it('takes the BARE language tag, never intlTag() (R15)', () => {
    /*
     * `intlTag('en')` is `en-GB` and V6 chose that deliberately for date and time
     * formats. `inLanguage` is a different question: it is a factual claim a
     * crawler believes, nothing here was written as British English, and the bare
     * tag is what `<html lang>` already emits.
     *
     * The failure this prevents is `id-ID` on the WebSite node beside `id` on the
     * 22 ImageObjects S3 will add to the same `@graph`. Asserted here because
     * this is the first builder to take the argument and the convention it sets
     * binds S3, S4 and S6.
     */
    const w = website({ origin: ORIGIN, name: 'x', description: 'x', inLanguage: 'en' });
    expect(w.inLanguage).toBe('en');
    expect(String(w.inLanguage)).not.toContain('-');
  });

  it('EMITS NO SearchAction, EVER (S-D16)', () => {
    /*
     * There is no site search. Marking up one we do not have is a lie a crawler
     * can check by following the `target` template and getting a 404 -- and the
     * only outcome is that every other claim in our markup is trusted less.
     *
     * Asserted on the serialized string as well as on the object, because the
     * shape somebody reaches for is a nested `potentialAction`.
     */
    const w = website({ origin: ORIGIN, name: 'x', description: 'x', inLanguage: 'id' });
    expect('potentialAction' in w).toBe(false);
    expect(serializeJsonLd(w)).not.toContain('SearchAction');
  });
});

describe('breadcrumbList', () => {
  it('numbers positions from 1', () => {
    const b = breadcrumbList([
      { name: 'JMTarot', url: `${ORIGIN}/` },
      { name: 'Galeri', url: `${ORIGIN}/gallery` },
      { name: 'The Moon', url: `${ORIGIN}/arcana/the-moon` },
    ]);
    expect(b['@type']).toBe('BreadcrumbList');
    const items = b.itemListElement as { position: number; name: string }[];
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items[2].name).toBe('The Moon');
  });

  it('refuses an empty trail', () => {
    // A BreadcrumbList with no items is invalid markup and the caller that
    // produced it has a bug worth failing on rather than shipping.
    expect(() => breadcrumbList([])).toThrow(/at least one/);
  });

  it('refuses a relative url, so a crumb cannot be half-absolute', () => {
    expect(() => breadcrumbList([{ name: 'x', url: '/gallery' }])).toThrow(/absolute/);
  });
});

describe('graph', () => {
  it('carries exactly one @context, at the top', () => {
    // Two nodes each with their own @context is valid and doubles the bytes on
    // the one public route strangers open over mobile data.
    const g = graph([
      organization({ origin: ORIGIN, name: 'x', logo: '/icon.png' }),
      website({ origin: ORIGIN, name: 'x', description: 'x', inLanguage: 'id' }),
    ]);
    expect(g['@context']).toBe('https://schema.org');
    expect((g['@graph'] as unknown[]).length).toBe(2);
    expect(serializeJsonLd(g).match(/@context/g)).toHaveLength(1);
  });
});

describe('serializeJsonLd', () => {
  it('cannot be closed out of its own script tag -- THE CANARY', () => {
    /*
     * `</script>` inside a JSON string ENDS THE SCRIPT ELEMENT as far as the HTML
     * parser is concerned, regardless of the JSON quoting -- the parser does not
     * know it is inside a string. Everything after it is parsed as markup.
     *
     * Every input today is authored or derived, so this is defence in depth. It is
     * here because the day somebody passes an article title through is the day it
     * stops being.
     */
    const s = serializeJsonLd(
      breadcrumbList([{ name: '</script><img src=x onerror=alert(1)>', url: `${ORIGIN}/` }]),
    );
    expect(s).not.toContain('</script');
    expect(s).not.toContain('<img');
    expect(s).toContain('\\u003c');
    // And it is still valid JSON afterwards -- an escape that broke the parse
    // would trade an injection for a silently ignored block.
    expect(JSON.parse(s)['@type']).toBe('BreadcrumbList');
  });

  it('escapes the two line separators that break inline JS', () => {
    // Legal in a JSON string and line terminators in JavaScript, so an unescaped
    // one is a syntax error in an inline block. Built with `\u2028` ESCAPES in
    // this source, never the literal characters -- they are invisible, and an
    // editor that normalises them would make this test pass vacuously.
    const name = 'a\u2028b\u2029c';
    const s = serializeJsonLd(breadcrumbList([{ name, url: `${ORIGIN}/` }]));
    expect(s).not.toMatch(/[\u2028\u2029]/);
    expect(s).toContain('\\u2028');
    expect(s).toContain('\\u2029');
    expect(JSON.parse(s).itemListElement[0].name).toBe(name);
  });

  it('round-trips & and " and < byte-identically (R1)', () => {
    /*
     * **THE TEST RECONCILIATION R1 ASKS FOR, MINUS THE RENDER** -- the render
     * half is in `JsonLd.test.ts`, which is where the component is.
     *
     * R1's measurement: on react-dom 19.2.8 a plain text child of `<script>`
     * round-trips through `JSON.parse` intact, and BOTH agents who reasoned about
     * it from memory were wrong, in opposite directions. The escaping here exists
     * so the output is correct whether or not that behaviour holds -- so what
     * this asserts is that pre-escaping did not itself corrupt anything.
     */
    const name = 'Syarat & Ketentuan, a "quoted" thing, </script>';
    const parsed = JSON.parse(serializeJsonLd(breadcrumbList([{ name, url: `${ORIGIN}/` }])));
    expect(parsed.itemListElement[0].name).toBe(name);
  });
});
