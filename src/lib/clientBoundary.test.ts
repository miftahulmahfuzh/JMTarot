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

  /*
   * v0.4.0 / S1's Task 12. **`@/lib/seo/origin` READS `AUTH_URL`, `VERCEL_URL` AND
   * `VERCEL_PROJECT_PRODUCTION_URL`, NONE OF WHICH CARRIES A `NEXT_PUBLIC_`
   * PREFIX** -- so a client component calling `siteOrigin()` would silently get
   * `http://localhost:3001` in production and hand a visitor a canonical, a share
   * URL or an `hreflang` pointing at their own machine.
   *
   * Unlike `@/lib/share/links` this module has NO `server-only` marker, on purpose
   * -- it is imported by `robots.ts` and `sitemap.ts`, and `server-only` throws
   * under Vitest for anything `vitest.config.ts` does not alias. **So the two
   * fences are this test and `scripts/audit-secrets.ts`'s FORBIDDEN walk**, and
   * the second one is transitive where this one is direct. Neither is redundant:
   * this fails in a second, that one catches a helper in between.
   *
   * `@/lib/seo/jsonld` is deliberately NOT matched: it is pure, takes the origin as
   * an argument, and reads no environment. Same split as `moderation/types.ts`
   * against `blocklist.ts`.
   */
  it('lets no client component import the origin leaf', () => {
    for (const file of CLIENT) {
      const offending = importsOf(file.source).filter((spec) => spec === '@/lib/seo/origin');
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

  /*
   * V8's Task 22. **`@/lib/persona/prompt.ts` CARRIES BOTH CONTRACTS IN FULL** --
   * the format rules, the forbidden vocabulary for each locale, the two worked
   * examples -- so it falls under rule 1 for exactly the same reason
   * `@/lib/prompt/**` and `@/lib/translate/**` do. `generate.ts` additionally
   * carries the database and the provider.
   *
   * **`lines.ts` IS THE ONE EXCEPTION, AND THE NEXT TEST IS WHAT KEEPS IT HONEST.**
   * It composes message-catalog strings into the two templated sentences on
   * `/account`, which is display copy a server component renders and which a
   * client component may legitimately want. Same shape as the prompt layer's
   * `sanitize` exception and `share/slug`'s.
   */
  it('lets no client component import the persona prompt or generator', () => {
    for (const file of CLIENT) {
      const offending = importsOf(file.source).filter(
        (spec) => spec.startsWith('@/lib/persona/') && !spec.endsWith('/lines'),
      );
      expect({ [file.path]: offending }).toEqual({ [file.path]: [] });
    }
  });

  it('keeps `@/lib/persona/lines` free of contract prose, so the exception stays earned', () => {
    /*
     * Asserted on the SOURCE rather than trusted to the filename, exactly as the
     * `sanitize` exception is. Comments are stripped first, because `lines.ts`'s own
     * header explains at length why it must not carry the marker -- the lesson
     * `queries/contract.test.ts` and `share/slug`'s check both record.
     */
    const raw = readFileSync(join(ROOT, 'lib/persona/lines.ts'), 'utf8');
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(source).not.toContain("import 'server-only'");
    expect(source).not.toContain('process.env');
    for (const sentinel of [
      'ATURAN', // the Indonesian contract's section headings
      'CONTENT RULES', // its English counterpart
      'Kamu menulis', // how the persona contract opens
      'You are writing',
      'DILARANG', // the forbidden-vocabulary clause
      'NEVER use these',
    ]) {
      expect({ sentinel, present: source.includes(sentinel) }).toEqual({
        sentinel,
        present: false,
      });
    }
  });

  it('lets no client component import the database', () => {
    // Not W6's rule, but the same class and the check is free.
    for (const file of CLIENT) {
      const offending = importsOf(file.source).filter((spec) => spec.startsWith('@/lib/db/'));
      expect({ [file.path]: offending }).toEqual({ [file.path]: [] });
    }
  });

  /*
   * V7's Task 20. **`@/lib/share/links` READS `SHARE_BASE_URL`, WHICH HAS NO
   * `NEXT_PUBLIC_` PREFIX** -- so a client component calling `shareUrl()` would
   * build a URL against `undefined` and hand the querent a broken address for a
   * link that is perfectly live. That is not a hypothetical shape: `resolve.ts`'s
   * header records `localeSwitcherEnabled()` making exactly this mistake and
   * living in `LocaleSwitch.tsx` for about ten minutes.
   *
   * It carries `server-only` as well, so this would be a build error rather than a
   * silent leak -- but a named failure beats a stack trace, and the value of the
   * fence is that it says WHY.
   *
   * `@/lib/share/slug` and `@/lib/share/types` are deliberately NOT matched:
   * `slug.ts` is env-free by rule and its own header says so, and both are imported
   * by `ShareFooter`, `TryItYourself` and the route's zod schema. Same split as
   * `moderation/types.ts` against `blocklist.ts`.
   */
  it('lets no client component import the share URL builder', () => {
    for (const file of CLIENT) {
      const offending = importsOf(file.source).filter((spec) => spec === '@/lib/share/links');
      expect({ [file.path]: offending }).toEqual({ [file.path]: [] });
    }
  });

  it('keeps `@/lib/share/slug` free of process.env, so the exception stays earned', () => {
    /*
     * The other half of the rule above, asserted on the source rather than trusted
     * to the filename -- exactly the shape the `sanitize` exception uses. The moment
     * somebody moves `SHARE_BASE_URL` into `slug.ts` "so the client can build the
     * URL", the exception becomes the bug it was written to prevent.
     */
    const raw = readFileSync(join(ROOT, 'lib/share/slug.ts'), 'utf8');
    /*
     * COMMENTS STRIPPED FIRST, and the first draft of this test did not do that and
     * FAILED -- because `slug.ts`'s header explains at length that `SHARE_BASE_URL`
     * must not be read there. `queries/contract.test.ts` records the same lesson
     * after grepping for `from '../client'` and matching a sentence saying never to
     * write it: a rule that fires on prose describing the rule is a rule people
     * delete.
     */
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code.includes('process.env')).toBe(false);
    expect(code.includes('SHARE_BASE_URL')).toBe(false);
    // The stripper must not have eaten the code it is checking.
    expect(code).toContain('SLUG_ALPHABET');
  });

  /*
   * S4, v0.4.0. **`src/content/**` IS TENS OF THOUSANDS OF WORDS OF PROSE PER
   * LOCALE** and roadmap §5 rule 1 fences it from client components. A client
   * component importing a lore document serialises the whole document into the RSC
   * payload of whatever page mounts it -- which is the same failure S-D6 keeps out
   * of the message catalog, arriving through a different door. `Prose` is a SERVER
   * component and importing `@/lib/i18n/t` is what makes that permanent.
   *
   * **`@/content/types` IS THE ONE EXCEPTION**, and it is the same split
   * `moderation/types.ts` has against `blocklist.ts` and `share/types.ts` against
   * `share/links.ts`: the SHAPE crosses the boundary, the CONTENT does not. The
   * next test is what keeps the exception earned.
   */
  it('lets no client component import a content module', () => {
    for (const file of CLIENT) {
      const offending = importsOf(file.source).filter(
        (spec) => spec.startsWith('@/content/') && spec !== '@/content/types',
      );
      expect({ [file.path]: offending }).toEqual({ [file.path]: [] });
    }
  });

  it('keeps `@/content/types` free of prose, so the exception stays earned', () => {
    /*
     * Asserted on the SOURCE with comments stripped -- `types.ts`'s own header
     * explains at length why prose may not live there, and a fence that fires on
     * prose describing the rule is a fence people delete
     * (`queries/contract.test.ts` records the lesson).
     *
     * The threshold is a type name's worth of characters. Every legitimate literal
     * in that file is an anchor name, a block kind or one import specifier.
     *
     * **NO NEWLINE INSIDE THE MATCH, AND THE FIRST DRAFT WITHOUT THAT FAILED.**
     * The block kinds sit one per line, so `[^']{40,}` happily paired the CLOSING
     * quote of `'heading'` with the OPENING quote of `'paragraph'` two lines down
     * and reported the type declaration between them as a forty-character string.
     * A single-line bound is what makes this fire on prose and nothing else.
     */
    const raw = readFileSync(join(ROOT, 'content/types.ts'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of code.matchAll(/'([^'\n]{40,})'/g)) {
      expect({ literal: m[1] }).toMatchObject({ literal: '' });
    }
    // The stripper must not have eaten the code it is checking.
    expect(code).toContain('LORE_ANCHORS');
  });
});

/**
 * And the ORDER of the two decisions inside W7's own boundary walk.
 *
 * `scripts/audit-secrets.ts` is the stronger sibling this file's header points at,
 * and V4 had to fix a real bug in it (`6c9ac21`): the `isServerAction` exemption
 * sat BELOW the FORBIDDEN-prefix verdict, so it was unreachable for every server
 * action in the app -- server actions live under a fenced prefix by definition.
 * `lib/auth/actions.ts` was the first one to exist and it failed the build with
 * two findings that were both the sanctioned pattern.
 *
 * THE FIX LANDED WITHOUT A TEST, which is the gap this closes. Asserted here
 * rather than in the script because `checkClientBoundary` is not exported and
 * running the real scanner needs a build. Same shape as `dominance.test.ts`: name
 * the ordering, so a refactor back fails HERE and says why.
 */
describe("the scanner's own ordering", () => {
  const scanner = readFileSync(join(process.cwd(), 'scripts/audit-secrets.ts'), 'utf8');
  const walk = scanner.slice(scanner.indexOf('while (stack.length > 0)'));

  it('exempts a server action BEFORE it applies the forbidden-prefix verdict', () => {
    const exemption = walk.indexOf('isServerAction(source)');
    const verdict = walk.indexOf("fail('boundary'");
    expect(exemption, 'isServerAction call not found in the walk').toBeGreaterThan(-1);
    expect(verdict, 'the boundary fail() not found in the walk').toBeGreaterThan(-1);
    expect(exemption).toBeLessThan(verdict);
  });

  /**
   * Not vacuous: there really is a `'use server'` module under a fenced prefix, so
   * the exemption is load-bearing today rather than hypothetically. And it must
   * stay exempt BY DIRECTIVE -- an allowlist entry would exempt the whole file for
   * every reason, not just for being an RPC boundary.
   */
  it('still has a real server action under a fenced prefix to exempt', () => {
    const action = readFileSync(join(process.cwd(), 'src/lib/auth/actions.ts'), 'utf8');
    expect(action).toMatch(/^\s*(['"])use server\1/);
    const rule = scanner.match(/\{ prefix: 'lib\/auth\/', allow: \[([^\]]*)\] \}/);
    expect(rule, "the lib/auth/ rule's shape changed").not.toBeNull();
    expect(rule![1], 'actions.ts must be exempt by DIRECTIVE, never by allowlist').not.toMatch(
      /actions\.ts/,
    );
  });
});
