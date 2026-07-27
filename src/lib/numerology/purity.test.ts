/**
 * The correspondence engine is PURE and it must stay importable from anywhere.
 *
 * Roadmap §6: "V1. PURE. No React, no next/*, no DB, no server-only." Three
 * consumers depend on that being true and each breaks differently if it stops:
 * V8's `/account` renders glosses in a client component; V3 calls it from a
 * route handler; and `personNumbers` feeds `personas.input_hash`, which is
 * computed in a script-shaped path with no Next runtime — exactly where
 * `server-only`'s throw would fire (CLAUDE.md: "Never import `@/lib/db/client`
 * from a script or a test").
 *
 * SOURCE-LEVEL, like `clientBoundary.test.ts`, and weaker than a build for the
 * same reason: it catches the direct import, which is how it would actually
 * happen. It runs in one second, which is why people see it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const DIR = join(SRC, 'lib/numerology');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.ts'));

/**
 * Comments stripped, because this fence reads CODE.
 *
 * Every file here explains in prose why it may not import `server-only` or
 * `next/*`, and a fence that greps the raw text fails on its own documentation
 * — which teaches the next person to delete the explanation rather than keep
 * the rule. Found immediately: `index.ts`'s header says the words.
 */
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const read = (f: string) => codeOf(readFileSync(join(DIR, f), 'utf8'));

const SOURCES = FILES.filter((f) => !f.endsWith('.test.ts'))
  .map((f) => ({ f, src: read(f) }));

const importsOf = (src: string) =>
  [...src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('src/lib/numerology is pure', () => {
  it('found the six modules, so the fence is not vacuously passing', () => {
    expect(SOURCES.map((s) => s.f).sort()).toEqual(
      ['arcana.ts', 'astrology.ts', 'gematria.ts', 'glosses.ts', 'index.ts', 'reduce.ts'],
    );
  });

  it('imports nothing outside @/data and its own directory', () => {
    for (const { f, src } of SOURCES) {
      const bad = importsOf(src).filter(
        (spec) => !spec.startsWith('./') && !spec.startsWith('@/data'),
      );
      expect({ [f]: bad }).toEqual({ [f]: [] });
    }
  });

  it('carries no `server-only` marker and no framework import', () => {
    for (const { f, src } of SOURCES) {
      expect({ [f]: /server-only|from ['"]next|from ['"]react/.test(src) })
        .toEqual({ [f]: false });
    }
  });

  it('is nearly the same rule for the tests, because a test import becomes a source import', () => {
    /*
     * ONE EXCEPTION, AND IT IS THE ONE RECONCILIATION §5 GRANTED.
     * `glosses.test.ts` imports the Malay / therapy / en-tic lists from
     * `@/lib/copy/vocab` rather than copying them a fourth time. That module is
     * plain, pure, importable from `scripts/**` and carries no `server-only`
     * marker — it is data, not machinery, and the reason the source rule stays
     * `@/data`-only is that a SOURCE file here has no business reading word
     * lists. Nothing else is allowed in, including from a test.
     */
    const ALLOWED_IN_TESTS = ['@/data', '@/lib/copy/vocab'];
    for (const f of FILES.filter((x) => x.endsWith('.test.ts'))) {
      const bad = importsOf(read(f)).filter(
        (spec) => spec.startsWith('@/') && !ALLOWED_IN_TESTS.some((ok) => spec.startsWith(ok)),
      );
      expect({ [f]: bad }).toEqual({ [f]: [] });
    }
  });

  it('only `index.ts` is imported from outside the directory', () => {
    /*
     * Nothing outside imports it yet at V1 time; the assertion exists so that
     * V3's and V8's first deep import fails here rather than in review. The
     * facade is what lets the five-file split change without a cross-workstream
     * edit, and a deep import is how that freedom is lost silently.
     */
    const offenders: string[] = [];
    for (const path of walk(SRC)) {
      if (path.startsWith(DIR)) continue;
      for (const spec of importsOf(codeOf(readFileSync(path, 'utf8')))) {
        if (/^@\/lib\/numerology\/.+/.test(spec)) offenders.push(`${path.slice(SRC.length + 1)} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
