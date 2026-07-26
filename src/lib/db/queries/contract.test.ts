/**
 * The query-module contract, enforced (plan §4.6). No database, no Docker --
 * this reads the files off disk and belongs in the fast `unit` project.
 *
 * Six workstreams will add functions to `queries/`. These are the rules that
 * are cheap to break by accident and expensive to discover.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const files = globSync('src/lib/db/**/*.ts')
  .filter((f) => !f.endsWith('.test.ts'))
  // The ONE file that must import server-only. Excluded by name rather than by
  // loosening the rule, so that a SECOND file acquiring server-only is a test
  // failure and not a shrug.
  .filter((f) => !f.endsWith('/client.ts'));

const queryModules = files.filter((f) => f.includes('/queries/'));

/**
 * Every module specifier a file imports.
 *
 * Parsing the specifiers rather than grepping the whole source, because the
 * first version of this test grepped for `from '../client'` and failed against
 * the sentence "Never import from '../client'" in a doc comment. A rule that
 * fires on prose describing the rule is a rule people delete.
 *
 * Handles `import 'x'`, `import y from 'x'`, `import type { y } from 'x'` and
 * the multi-line form.
 */
function importsOf(source: string): string[] {
  return [...source.matchAll(/^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)].map(
    (m) => m[1],
  );
}

describe('the query-module contract', () => {
  it('finds the data layer and its imports at all', () => {
    // A glob that silently matches nothing, or a parser that finds no imports,
    // is a test that always passes.
    expect(files.length).toBeGreaterThan(6);
    expect(queryModules.length).toBeGreaterThanOrEqual(4);
    expect(importsOf(readFileSync(queryModules[0], 'utf8')).length).toBeGreaterThan(0);
  });

  it('never imports React, Next or server-only from the data layer', () => {
    // These modules run in route handlers, in after(), in scripts/db-seed.ts
    // and in Vitest. Three of those four have no React runtime. Caching is the
    // caller's decision, made where the caller knows the request context.
    for (const f of files) {
      for (const spec of importsOf(readFileSync(f, 'utf8'))) {
        expect(
          spec === 'react' || spec === 'server-only' || spec.startsWith('next/'),
          `${f} imports ${spec}`,
        ).toBe(false);
      }
    }
  });

  it('imports the db handle only as a type', () => {
    // `import { db } from '../client'` in a query module makes it untestable
    // -- the harness cannot substitute a rolled-back transaction -- and unable
    // to participate in a caller's transaction.
    for (const f of queryModules) {
      const src = readFileSync(f, 'utf8');
      expect(importsOf(src), f).not.toContain('../client');
      expect(src, f).not.toMatch(/^import\s+\{[^}]*\bdb\b/m);
    }
  });

  it('takes the handle as the first parameter of every exported function', () => {
    // Rule 1 of §4.6, and the one everything else rests on. A function that
    // reaches for a singleton instead cannot be rolled back and cannot join a
    // transaction.
    let checked = 0;
    for (const f of queryModules) {
      const src = readFileSync(f, 'utf8');
      for (const [, name, firstParam] of src.matchAll(
        /export\s+(?:async\s+)?function\s+(\w+)\s*\(\s*(\w+)/g,
      )) {
        expect(firstParam, `${f}: ${name}()`).toBe('db');
        checked += 1;
      }
    }
    expect(checked, 'the function regex matched nothing').toBeGreaterThan(8);
  });
});
