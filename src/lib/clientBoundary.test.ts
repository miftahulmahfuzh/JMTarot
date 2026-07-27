import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What a client component may not import.
 *
 * THE PLAN ASKED FOR AN ESLINT `no-restricted-imports` RULE. This project has no
 * ESLint — no config, no dependency, no script — and adding one to enforce two
 * rules would be a large new toolchain for a small fence. A test does the same job,
 * runs in `npm test`, and has one property the lint rule does not: it can also
 * assert that the single allowed exception still deserves to be one.
 *
 * It is a source-level check, so it is weaker than W7's built-output grep of
 * `.next/static` for `ATURAN FORMAT` and its English sentinel. That grep is the one
 * that cannot be fooled, and it is still W7's to write. This one fails in one
 * second instead of after a build, which is what makes it the one people actually
 * see.
 *
 * TWO RULES, BOTH FROM THE ROADMAP RATHER THAN FROM TASTE:
 *
 *   1. No prompt text reaches the browser. Roadmap §1's third non-negotiable: the
 *      client sends card ids and orientation and receives prose. Breaking it ships
 *      the system prompt to anyone who opens devtools, now in two languages.
 *   2. No client file imports `@/lib/i18n/catalog`. Plan §8. That module holds both
 *      catalogs, and a client component that picks a locale itself has shipped the
 *      language the user did not choose — which is the entire reason
 *      `LocaleProvider` is handed a resolved catalog instead of a locale string.
 */

const ROOT = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(ROOT).map((path) => ({
  path: path.slice(ROOT.length + 1),
  source: readFileSync(path, 'utf8'),
}));

/**
 * `'use client'` in the first few lines, before any import.
 *
 * Transitive reachability is NOT covered: a client component importing a plain
 * module that imports the prompt layer would pass this and still bundle it. That is
 * a real gap, and it is the gap W7's built-output grep closes. What this catches is
 * the direct import, which is how it would actually happen.
 */
const CLIENT = FILES.filter((f) => /^\s*(['"])use client\1/m.test(f.source.split('import')[0]));

const importsOf = (source: string) =>
  [...source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

describe('the client boundary', () => {
  it('found the client components, so the test is not vacuously passing', () => {
    // If a refactor moves the directive or changes the quoting, this number drops
    // and every assertion below starts passing for the wrong reason.
    expect(CLIENT.length).toBeGreaterThan(8);
  });

  it('lets no client component import the prompt layer', () => {
    /*
     * `sanitize` IS THE ONE EXCEPTION, and the next test is what keeps it honest.
     * `Draw.tsx` reads `MAX_QUESTION_LENGTH` from it for the input's `maxLength`,
     * and that constant has to be the SAME one the server rejects against —
     * splitting it into a client copy is how the two silently disagree about 200.
     */
    for (const file of CLIENT) {
      const offending = importsOf(file.source).filter(
        (spec) => spec.startsWith('@/lib/prompt/') && !spec.endsWith('/sanitize'),
      );
      expect({ [file.path]: offending }).toEqual({ [file.path]: [] });
    }
  });

  it('keeps the one exception free of prompt text, so the exception stays earned', () => {
    /*
     * `sanitize.ts` is constants and regexes: `MAX_QUESTION_LENGTH`, the delimiter
     * alternation, the control and format character classes. No persona, no
     * contract, no task description. The moment somebody adds a sentence of prompt
     * prose to it, the exception above becomes a leak — so assert the absence
     * rather than trusting the filename.
     */
    const source = readFileSync(join(ROOT, 'lib/prompt/sanitize.ts'), 'utf8');
    /*
     * `<pertanyaan>` was tried as a sentinel and removed: `sanitize.ts` mentions the
     * tag a dozen times in its own doc comments, which is the module documenting
     * what it strips rather than carrying a prompt. A sentinel that fires on
     * correct code is worse than no sentinel, because the fix people reach for is
     * deleting the assertion. What is actually dangerous is prompt PROSE — a
     * section heading, a persona opening, a task instruction — so that is what
     * these match.
     */
    for (const sentinel of [
      'ATURAN', // the Indonesian base contract's section headings
      'FORMAT RULES', // its English counterpart
      'Kamu adalah', // "You are..." -- how every persona block opens
      'You are a',
      'Tulis ', // the task layer's imperatives
      'Write one',
    ]) {
      expect({ sentinel, present: source.includes(sentinel) }).toEqual({
        sentinel,
        present: false,
      });
    }
  });

  it('lets no client component import the catalog module', () => {
    for (const file of CLIENT) {
      const offending = importsOf(file.source).filter((spec) =>
        /^@\/lib\/i18n\/catalog$/.test(spec),
      );
      expect({ [file.path]: offending }).toEqual({ [file.path]: [] });
    }
  });

  it('lets no client component import the server-only i18n module', () => {
    // `t.ts` starts with `import 'server-only'`, so this would be a build error
    // rather than a silent leak -- but a named failure beats a stack trace.
    for (const file of CLIENT) {
      const offending = importsOf(file.source).filter((spec) => spec === '@/lib/i18n/t');
      expect({ [file.path]: offending }).toEqual({ [file.path]: [] });
    }
  });

  /*
   * V2's Task 6. THE FENCE GOES UP BEFORE THE WALL, and it passing today is the
   * point rather than a weakness: `@/lib/translate/contract.ts` carries prompt
   * prose — the target locale's format rules, the reader's voice block, the
   * card-name instruction — so it falls under rule 1 above for exactly the same
   * reason `@/lib/prompt/**` does.
   *
   * NO EXCEPTION, unlike the prompt layer's `sanitize`. Nothing in there is a
   * constant a client needs: V6's history detail and V7's share page both talk to
   * `POST /api/translate` or to a server component, never to the translator.
   */
  it('lets no client component import the translation layer', () => {
    for (const file of CLIENT) {
      const offending = importsOf(file.source).filter((spec) =>
        spec.startsWith('@/lib/translate/'),
      );
      expect({ [file.path]: offending }).toEqual({ [file.path]: [] });
    }
  });

  it('lets no client component import the database', () => {
    // Not W6's rule, but the same class and the check is free.
    for (const file of CLIENT) {
      const offending = importsOf(file.source).filter((spec) => spec.startsWith('@/lib/db/'));
      expect({ [file.path]: offending }).toEqual({ [file.path]: [] });
    }
  });
});
