import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(process.cwd(), 'src/components/Prose.tsx'), 'utf8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('the prose renderer', () => {
  it('reads the file, so nothing below passes vacuously', () => {
    expect(SRC).toContain('export async function Prose');
    expect(code.length).toBeGreaterThan(400);
  });

  it('NEVER uses dangerouslySetInnerHTML', () => {
    expect(code).not.toContain('dangerouslySetInnerHTML');
  });

  it('is a server component and drills no locale prop', () => {
    expect(SRC).not.toMatch(/^\s*(['"])use client\1/m);
    expect(code).toContain('await getLocale()');
    // No `locale` in the props type, and no local binding called `locale` that a
    // future edit could promote into one. `LocaleProvider`'s header: NO LOCALE
    // PROP IS DRILLED ANYWHERE.
    expect(code).not.toMatch(/locale\s*[,}:]/);
  });

  it('handles every block kind and proves exhaustiveness with `never`', () => {
    for (const kind of ['heading', 'paragraph', 'list', 'quote', 'cardRef']) {
      expect({ kind, handled: code.includes(`case '${kind}'`) })
        .toMatchObject({ handled: true });
    }
    // A sixth kind added to the union must be a COMPILE error, not a blank render.
    expect(code).toContain('never');
  });

  it('emits h2 and h3 only, never h1', () => {
    expect(code).not.toMatch(/<h1[\s>]/);
    expect(code).toContain('<h2');
    expect(code).toContain('<h3');
  });

  it('builds a cardRef href through the locale path helper, never by hand', () => {
    // Forty-four pages hand-writing the prefix is forty-four chances to emit the
    // wrong tree. S2 owns the one helper; this file calls it.
    expect(code).toContain('localePath');
    expect(code).not.toMatch(/['"`]\/en\/arcana/);
  });

  it('renders the three things reconciliation R16 granted, and not the one it refused', () => {
    /*
     * S6's four field-level asks on S4's union. `heading.id`, `list.ordered` and
     * inline spans are here; **`callout` was refused** and the `switch` still has five
     * arms. The failure mode of a refused ask is somebody granting it quietly, so the
     * absence is asserted rather than assumed.
     */
    expect(code).toContain('id={block.id}');
    expect(code).toContain("block.ordered ? 'ol' : 'ul'");
    expect(code).toContain('function spans(');
    expect(code).not.toContain("case 'callout'");
  });

  it('never inserts whitespace between two spans', () => {
    /*
     * THE CONDITION R16 ATTACHED TO GRANTING `Inline[]`: the copy lint reads
     * `plainText()`, which joins spans with the empty string, so the renderer must too
     * or the lint is checking a string the reader never sees. A `join(' ')` or a
     * `{' '}` in here breaks that silently -- and `blog.content.test.ts`'s adjacency
     * case is what catches the authoring half of the same bug.
     */
    expect(code).not.toContain("join(' ')");
    expect(code).not.toContain("{' '}");
  });

  it('leaves an in-page anchor unprefixed', () => {
    // `localePath('en', '#next')` would be `/en/#next` -- a navigation to another page
    // rather than a jump inside this one. The `#` branch is what stops it.
    expect(code).toContain("startsWith('#')");
  });

  it('prefetches nothing', () => {
    // Ten prefetches per page, on CDN-cached content, for a visitor who will
    // follow at most one link.
    expect(code).toContain('prefetch={false}');
  });
});
