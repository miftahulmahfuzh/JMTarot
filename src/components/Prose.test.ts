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

  it('prefetches nothing', () => {
    // Ten prefetches per page, on CDN-cached content, for a visitor who will
    // follow at most one link.
    expect(code).toContain('prefetch={false}');
  });
});
