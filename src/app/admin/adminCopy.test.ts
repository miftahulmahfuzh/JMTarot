/**
 * Admin copy never enters the i18n catalog (A-D12), and the primitives spell nothing (I-16).
 *
 * ── THIS GREP IS THE WHOLE ENFORCEMENT (R33), NOT DEFENCE IN DEPTH ───────────
 *
 * A-D12 justified the rule partly by *"the catalog is shipped to the browser as JSON on every
 * page"*. **That saving does not exist**: `LocaleProvider` is mounted in the root layout, so the
 * catalog already ships on admin pages. R33's ruling is that the rule stands and its reason is
 * replaced -- the authoring cost of ~150 strings in two locales for a surface with exactly one
 * reader, and that `id.ts` owns the key set, so every admin string would force an English twin.
 *
 * **So this test must not be described as a belt on a stronger argument**, because that is how a
 * reviewer concludes it is redundant and deletes it. `adminSurface.test.ts` (A1's) carries the
 * same grep over the same tree; this one adds the CHART directory and I-16's literal fence,
 * which A1 could not have written because the components did not exist.
 *
 * The reflex to reach for `useT()` in a new component is strong and the failure is silent:
 * nothing breaks, the catalog just grows.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ADMIN = globSync('src/app/admin/**/*.{ts,tsx}').filter((f) => !f.includes('.test.'));
const CHART = globSync('src/components/chart/**/*.{ts,tsx}').filter((f) => !f.includes('.test.'));
const ALL = [...ADMIN, ...CHART];

/** Comments stripped -- `adminSurface.test.ts`'s reason, and this file's own header names
 *  `useT` three times. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the fence is not vacuous', () => {
  it('has both trees to grep', () => {
    // A glob that matches nothing always passes -- the `clientBoundary.test.ts` precedent.
    expect(ADMIN.length).toBeGreaterThanOrEqual(8);
    expect(CHART.length).toBeGreaterThanOrEqual(12);
  });
});

describe('A-D12 -- no translation machinery anywhere in either tree', () => {
  const forbidden: [RegExp, string][] = [
    [/\bgetT\(/, 'getT()'],
    [/\buseT\(/, 'useT()'],
    [/\btFor\(/, 'tFor()'],
    /*
     * **ONE NAMED EXCEPTION SINCE v0.5.0 / A6: `@/lib/i18n/locale`.**
     *
     * A-D12 is about the CATALOG -- ~150 strings in two locales for a surface with one
     * reader, and `id.ts` owning the key set so every admin string forces an English
     * twin. `locale.ts` is none of that: it is a LEAF whose only imports are types from
     * `@/data/**`, it holds no prose, no key set and no `t`, and what it exports is the
     * two locale CODES and `isLocale`.
     *
     * A6's blog surface edits per-locale documents, so it needs to name the locales. The
     * alternative is a hardcoded `['id', 'en']` under `src/app/admin/**`, which is a
     * SECOND DEFINITION of `LOCALES` in the tree least likely to be updated when a third
     * locale lands -- strictly worse than the import.
     *
     * **EXCLUDED BY NAME RATHER THAN BY LOOSENING THE PATTERN**, which is
     * `queries/contract.test.ts`'s move with `client.ts`: `@/lib/i18n/t`,
     * `@/lib/i18n/catalog`, `@/lib/i18n/locales` and every other specifier still fail,
     * so a SECOND exception is a test failure and not a shrug. R33 stands -- this grep is
     * the whole enforcement, and it is narrowed rather than weakened.
     */
    [/@\/lib\/i18n\/(?!locale['"])/, 'an @/lib/i18n import other than locale'],
    [/\bLocaleProvider\b/, 'LocaleProvider'],
    [/\bLocaleSwitch\b/, 'LocaleSwitch'],
    [/\bContentLocaleLink\b/, 'ContentLocaleLink'],
  ];

  for (const [pattern, name] of forbidden) {
    it(`no file uses ${name}`, () => {
      for (const f of ALL) {
        expect(pattern.test(code(f)), `${f} uses ${name}`).toBe(false);
      }
    });
  }

  it('keeps the `locale` exception EARNED: nothing else from @/lib/i18n gets in', () => {
    /*
     * The exception above is worth having only while it stays one module. This asserts
     * the shape of every i18n specifier in the tree, so `@/lib/i18n/locales` (the
     * CATALOGS, one letter apart from the leaf) cannot arrive by autocomplete.
     */
    const specs = new Set<string>();
    for (const f of ALL) {
      for (const m of code(f).matchAll(/from '(@\/lib\/i18n\/[^']+)'/g)) specs.add(m[1]);
    }
    expect([...specs].sort()).toEqual(['@/lib/i18n/locale']);
  });

  it('formats numbers with a hardcoded id-ID, not the shared formatter', () => {
    // I-25. `Intl` is in the platform, so this adds no dependency -- and `@/lib/i18n/format`
    // would pull the locale machinery in through the back door.
    const fmt = code('src/app/admin/format.ts');
    expect(fmt).toContain("Intl.NumberFormat('id-ID'");
    expect(fmt).not.toMatch(/@\/lib\/i18n/);
  });
});

describe('I-16 -- the chart primitives hardcode no user-visible string', () => {
  /**
   * Every long string literal in a component is a candidate label, and a label belongs to
   * `copy.ts`. The bound is on a SINGLE LINE, deliberately: `types.contract.test.ts`'s header
   * records that a newline inside the regex broke the first draft of the same fence -- a
   * multi-line match swallows an entire block comment and then matches nothing else.
   *
   * 24 characters is the threshold. Below it live class names, `'use client'`, CSS values and
   * `'nodejs'`; above it, prose.
   */
  /**
   * The file's string literals, by SCANNING rather than by regex.
   *
   * ── A REGEX CANNOT LEX QUOTES, AND THE THIRD DRAFT PROVED IT ────────────────
   *
   * `/(['"`])((?:(?!\1)[^\n\\]|\\.){24,})\1/g` matched the text BETWEEN two adjacent literals:
   * in `deltaKind === 'good' ? STATUS.good : deltaKind === 'bad'` it paired the closing quote of
   * `'good'` with the opening quote of `'bad'` and reported ` ? STATUS.good : deltaKind === ` as
   * a user-visible string. Every quote-pairing regex has that failure; it is not fixable by
   * making the pattern cleverer.
   *
   * So this walks the source once, tracking quote state and escapes -- the same move
   * `queries/contract.test.ts` makes when it *"parses import specifiers rather than grepping"*,
   * for the same reason: **a fence that fires on correct code gets deleted.** Twenty lines of
   * scanner is cheaper than that.
   */
  function stringLiterals(src: string): string[] {
    const out: string[] = [];
    let quote: string | null = null;
    let buf = '';
    for (let i = 0; i < src.length; i += 1) {
      const c = src[i];
      if (quote === null) {
        if (c === "'" || c === '"' || c === '`') {
          quote = c;
          buf = '';
        }
        continue;
      }
      if (c === '\\') {
        // Skip the escaped character, so `\'` does not close the literal.
        i += 1;
        buf += 'x';
        continue;
      }
      if (c === quote) {
        out.push(buf);
        quote = null;
        continue;
      }
      // An unterminated single- or double-quoted literal means the scan lost sync; a newline is
      // where that shows up, and abandoning the literal is safer than swallowing the file.
      if (c === '\n' && quote !== '`') {
        quote = null;
        continue;
      }
      buf += c;
    }
    return out;
  }

  /**
   * Every `${…}` removed, innermost first, until nothing changes.
   *
   * ── THE ORDER MATTERS AND THE FIRST TWO DRAFTS GOT IT WRONG ─────────────────
   *
   * Draft 1 filtered candidate literals by prefix and grew one exclusion per false positive:
   * CSS-module class composition, SVG path builders, an `aria-label` composed from two props.
   * **A fence maintained that way is a list of the things somebody happened to write**, and it
   * fails on the next correct line.
   *
   * Draft 2 found the right discriminator -- *what is left when the interpolations are gone* --
   * but applied it per literal, AFTER a regex had extracted them. That regex cannot parse a
   * NESTED template literal: in
   *
   *     `${styles.cell}${bucket === null ? ` ${styles.empty}` : ''}`
   *
   * the inner backtick ends the outer match early, leaving a fragment with a dangling `${` that
   * no amount of stripping can clean. So the stripping happens FIRST, over the whole file, and
   * the literal matcher then runs on text with no interpolations left in it.
   *
   * A composed string carries no words of its own; prose has a run of letters. **Three is the
   * threshold**: an SVG path's `M`, `L` and `Z` survive stripping and must not count, and no
   * Indonesian label is shorter than three letters.
   */
  function stripInterpolations(src: string): string {
    let out = src;
    let prev = '';
    while (out !== prev) {
      prev = out;
      out = out.replace(/\$\{[^{}]*\}/g, '');
    }
    return out;
  }

  function isProse(literal: string): boolean {
    return /[A-Za-z]{3,}/.test(literal);
  }

  /**
   * What to test for prose, given one literal: the literal with its interpolations removed,
   * **plus every string literal found INSIDE those interpolations.**
   *
   * ── THE HOLE THE NEGATIVE CONTROL FOUND, WHICH IS WHY IT WAS RUN ────────────
   *
   * Draft 4 stripped interpolations and tested the remainder -- so a label hidden inside one was
   * invisible to the fence. The control injected exactly that:
   *
   *     aria-label={`${stateLabel ?? "Kuota hampir habis sekarang"} ${ratioLabel}`}
   *
   * The fence stayed GREEN, on a hardcoded 27-character Indonesian sentence in a chart
   * primitive: precisely what I-16 exists to forbid, wearing the one shape the fence could not
   * see. **A fence whose red state has never been produced is a fence nobody can trust** --
   * `galleryfit.sh`'s header says the same thing about a harness -- and this is the fourth draft
   * because running the control kept being cheaper than reasoning about it.
   */
  function candidates(literal: string): string[] {
    const inner = [...literal.matchAll(/\$\{([^{}]*)\}/g)].flatMap((m) => stringLiterals(m[1]));
    return [stripInterpolations(literal), ...inner];
  }

  /*
   * **`.tsx` ONLY, AND `geometry.ts` IS WHY.** The first draft globbed `.ts` too and flagged
   * five SVG path builders -- `` `${cmd}${r(xAt(i, n))} ${r(yAt(v, yMax))}` `` -- which are
   * path DATA, not prose, in the one module in this directory that renders nothing at all.
   *
   * Narrowing to the files that emit DOM is the right scope rather than a concession: the fence
   * exists to keep a LABEL out of a component, and a module with no JSX in it cannot hold one.
   * Widening it back would fail on correct code, and what somebody does then is delete the
   * fence -- the failure mode `EN_TICS`'s scope note describes in `src/content/types.ts`.
   */
  const RENDERS = CHART.filter((f) => f.endsWith('.tsx'));

  it('has no long string literal in any chart component', () => {
    expect(RENDERS.length).toBeGreaterThanOrEqual(12);
    for (const f of RENDERS) {
      const hits = stringLiterals(code(f))
        .flatMap(candidates)
        .filter((s) => s.length >= 24)
        // An import specifier and a CSS custom-property reference are not prose either, and
        // neither survives `isProse` on its own -- but naming them keeps the failure message
        // readable when one does show up.
        .filter((s) => !s.startsWith('@/') && !s.startsWith('./') && !s.includes('var(--'))
        .filter(isProse);
      expect(hits, `${f} spells a user-visible string: ${JSON.stringify(hits)}`).toEqual([]);
    }
  });

  it('and the strings all live in copy.ts, which is where A-D12 puts them', () => {
    // The positive control for the fence above: if the copy is not somewhere, the fence is
    // passing because nothing renders any text at all.
    const copy = readFileSync('src/app/admin/copy.ts', 'utf8');
    expect(copy).toContain('export const COMMON');
    expect(copy).toContain('export const OVERVIEW');
    expect(copy).toContain('export const TOKENS');
    // A rough floor on the amount of prose, so an emptied `copy.ts` fails here rather than
    // silently making every card blank.
    expect(copy.length).toBeGreaterThan(4000);
  });
});

describe('the admin pages honour §4.2 and A-D2', () => {
  const PAGES = globSync('src/app/admin/**/page.tsx');

  it('declares runtime and maxDuration in every page', () => {
    /*
     * §4.2 calls this *"the single most likely live failure in v0.5.0"*: `POST /api/locale` was
     * the only database-writing route declaring neither, and Vercel's Hobby default of ten
     * seconds lost the write on a cold lambda plus a suspended Neon compute. **There is one
     * admin, so every admin request is the cold one**, and a dashboard query is slower than a
     * locale write.
     *
     * A1's `adminSurface.test.ts` asserts the same thing over the same glob. Duplicated on
     * purpose: A4's two pages are the first ones with real queries behind them, and the pairing
     * rule -- a bigger `maxDuration` must be paired with a bound on the client -- is discharged
     * here by A3's 10s statement timeout plus `ChartError`.
     */
    expect(PAGES.length).toBeGreaterThanOrEqual(2);
    for (const f of PAGES) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f}: runtime`).toContain("export const runtime = 'nodejs'");
      expect(src, `${f}: maxDuration`).toMatch(/export const maxDuration = \d+/);
    }
  });

  it('calls the gate in every page, and the layout is not trusted to do it', () => {
    // A layout renders above a page and is NOT a security boundary: partial rendering, route
    // interception and any future parallel route can reach a page without a parent layout's
    // promise holding, and none of those look like a security change in a diff.
    for (const f of PAGES) {
      expect(code(f), f).toMatch(/requireAdminPage\(\)/);
    }
  });

  it('renders no <main> and declares no robots field outside the layout', () => {
    for (const f of PAGES) {
      expect(code(f), `${f} renders a <main>`).not.toMatch(/<main/);
      expect(code(f), `${f} declares robots`).not.toMatch(/robots\s*:/);
    }
  });

  it('exports exactly one Hero across both pages, on /admin', () => {
    // `Hero` is *exactly one per view*, and `/admin/tokens` deliberately has none because the
    // trajectory is its lead. Two heroes on two pages of one dashboard is neither.
    const overview = code('src/app/admin/page.tsx');
    const tokens = code('src/app/admin/tokens/page.tsx');
    expect(overview).toMatch(/<Hero\b/);
    expect(tokens).not.toMatch(/<Hero\b/);
  });

  it('reads the ceiling from meter.ts rather than duplicating 280', () => {
    /*
     * §10: *"`ceiling` is read from `LLM_WINDOW_CALL_CEILING` by A3, because I-15 forbids
     * `process.env` in a chart component and a hardcoded 280 in a `.tsx` is the number that
     * goes stale."* A3 shipped no `windowCalls`, so the page resolves it -- through the module
     * that owns the constant and its derivation (400 prompts x 70%), never by copying either.
     */
    const overview = code('src/app/admin/page.tsx');
    expect(overview).toMatch(/_ceilings\(\)/);
    for (const f of ADMIN) {
      expect(code(f), `${f} hardcodes the ceiling`).not.toMatch(/\b280\b/);
      /*
       * **`process.env.` AND NOT THE BARE NAME.** `copy.ts` names the variable in prose --
       * *"Dibandingkan langsung dengan LLM_WINDOW_CALL_CEILING"* -- which is the copy telling an
       * operator what the number is compared against, and comment-stripping does not remove a
       * STRING. What is forbidden is READING it here, and that is what the fence now says.
       */
      expect(code(f), `${f} reads the ceiling env var directly`).not.toMatch(
        /process\.env\.LLM_WINDOW_CALL_CEILING/,
      );
    }
  });

  it('never calls new Date() outside the one per-request helper', () => {
    /*
     * CLAUDE.md: **`todayKey()` IS NEVER CALLED DURING RENDER** -- it reads `new Date()`, which
     * differs between a server render and hydration, and `HistoryBrowser` already pays for the
     * rule. Each page resolves `today` ONCE at the top and threads it into `parseRange`.
     *
     * `format.ts` constructs `Date`s from explicit `'YYYY-MM-DDT00:00:00Z'` strings, which is
     * the opposite thing -- a parse, not a clock read -- so the assertion is on the argument-less
     * form only.
     */
    for (const f of ADMIN) {
      const src = code(f);
      const clockReads = [...src.matchAll(/new Date\(\s*\)/g)];
      const inHelper = /function todayUtc\(\): string \{\s*return new Date\(\)/.test(src);
      const allowed = inHelper ? 1 : 0;
      expect(clockReads.length, `${f} reads the clock ${clockReads.length} times`).toBe(allowed);
    }
  });
});
