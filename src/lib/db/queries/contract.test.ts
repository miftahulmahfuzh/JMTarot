/**
 * The query-module contract, enforced (plan §4.6). No database, no Docker --
 * this reads the files off disk and belongs in the fast `unit` project.
 *
 * Six workstreams will add functions to `queries/`. These are the rules that
 * are cheap to break by accident and expensive to discover.
 */
import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

  /*
   * THE SAME RULE, ONE HOP FURTHER, AND V2 IS WHY IT EXISTS.
   *
   * The check above catches a DIRECT `import 'server-only'`. V2's
   * `queries/translations.ts` needed `TRANSLATABLE_ENTITIES` from
   * `@/lib/translate/contract`, which imports `@/lib/prompt/base`, which carries the
   * marker — so the query module acquired it TRANSITIVELY and the direct check saw
   * nothing. It did not fail anything either, because W7's `vitest.config.ts`
   * aliases the package away, so the first symptom would have been
   * `scripts/db-seed.ts` throwing at some later date on an unrelated change.
   *
   * V2 fixed its own case by splitting `@/lib/translate/keys.ts` out as a leaf. This
   * is what stops V6, V7 and V8 doing the same thing again — each of them adds a
   * query module and each of them owns a `@/lib/<workstream>/` directory that a
   * prompt or a provider could reach.
   *
   * WALKED ONLY THROUGH `@/lib/**` and `../` SPECIFIERS, which is the whole reachable
   * surface: an npm package cannot carry `server-only` into us, and `@/data/**` is
   * import-free by its own rule. Node builtins and packages are simply not followed.
   *
   * ── ONE KNOWN EXCEPTION, AND IT IS A PRE-EXISTING DEFECT, NOT A DESIGN ───────
   *
   * `queries/lotus.ts` imports `LOTUS_SOURCE_VERSION` from `@/lib/prompt/lotus`,
   * which carries the marker. Found by this check on its first run, so it predates
   * V2 and belongs to W3. It is excluded BY NAME rather than by loosening the rule —
   * the `client.ts` precedent above — so that a SECOND module doing it is a failure
   * and not a shrug.
   *
   * THE FIX IS SMALL AND IS NOT V2's TO MAKE: `LOTUS_SOURCE_VERSION` is one integer,
   * and it wants the treatment V2 gave `@/lib/translate/keys.ts` — a dependency-free
   * leaf beside the server-only module. Nothing is broken today because W7's
   * `vitest.config.ts` aliases `server-only` away and the route bundles are real
   * server bundles; the exposure is `scripts/db-seed.ts`, which imports
   * `queries/**` and has no React runtime, and which does not currently reach this
   * module. That is one import away from being a confusing throw.
   */
  const TRANSITIVE_EXCEPTIONS = ['src/lib/db/queries/lotus.ts'];

  it('does not acquire React, Next or server-only TRANSITIVELY either', () => {
    const FORBIDDEN = (spec: string) =>
      spec === 'react' || spec === 'server-only' || spec.startsWith('next/');

    /** `@/lib/x/y` or `./y` -> the file on disk, or null if it is not ours. */
    function resolve(spec: string, from: string): string | null {
      if (!spec.startsWith('@/') && !spec.startsWith('.')) return null;
      const base = spec.startsWith('@/')
        ? join('src', spec.slice(2))
        : join(dirname(from), spec);
      for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
        if (existsSync(candidate)) return candidate;
      }
      return null;
    }

    let checked = 0;
    for (const entry of queryModules) {
      if (TRANSITIVE_EXCEPTIONS.includes(entry.replaceAll('\\', '/'))) continue;
      checked += 1;
      const seen = new Set<string>();
      /** `entry` -> … -> the offending specifier, for a message worth reading. */
      const trail: string[] = [];

      const walk = (file: string): string | null => {
        if (seen.has(file)) return null;
        seen.add(file);
        for (const spec of importsOf(readFileSync(file, 'utf8'))) {
          if (FORBIDDEN(spec)) return `${file} imports ${spec}`;
          const next = resolve(spec, file);
          if (!next) continue;
          const found = walk(next);
          if (found) {
            trail.unshift(file);
            return found;
          }
        }
        return null;
      };

      const offence = walk(entry);
      expect({ entry, offence, via: trail }).toEqual({ entry, offence: null, via: [] });
    }

    // An exception list that grew to cover everything would make this vacuous.
    expect(checked).toBeGreaterThan(queryModules.length - 2);
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
