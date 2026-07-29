/**
 * The fences over the whole `/admin` tree. v0.5.0 / A1.
 *
 * **A1's HIGHEST-LEVERAGE ARTEFACT AFTER THE AUDIT PRIMITIVE: it is written once
 * and turns four of the release's rules into a red test in somebody else's
 * workstream.** `src/components/accountSurface.test.ts` and
 * `src/lib/clientBoundary.test.ts` are the precedents for the shape.
 *
 * A3, A4, A5 and A6 all add files under `src/app/admin/**` or
 * `src/app/api/admin/**`. Every one of them inherits every assertion below.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PAGES = globSync('src/app/admin/**/page.tsx');
const ROUTES = globSync('src/app/api/admin/**/route.ts');
const ALL = globSync('src/app/admin/**/*.{ts,tsx}')
  .concat(globSync('src/app/api/admin/**/*.{ts,tsx}'))
  .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));

/**
 * The file with its comments removed.
 *
 * **EVERY ABSENCE FENCE BELOW READS THIS AND NOT THE RAW SOURCE, AND THE REASON IS
 * THIS PROJECT'S OWN, WRITTEN TWICE.** `queries/contract.test.ts` parses import
 * specifiers rather than grepping, because *"a rule that fires on prose describing
 * the rule is a rule people delete"* -- its first version failed against the
 * sentence "Never import from '../client'" in a doc comment. `sitemap.test.ts`'s
 * LEAF fence strips comments for the same reason.
 *
 * It bit immediately here: `layout.tsx`'s header explains why it never calls
 * `getT()`, `page.tsx`'s explains that it renders no `<main>`, and `pages.ts`
 * explains that `usePathname()` is the wrong implementation -- three files whose
 * documentation of a rule would have failed that rule. **The alternative is prose
 * that cannot name what it forbids, and the fences are worth more than that.**
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the fences are not vacuous', () => {
  it('finds the admin tree at all', () => {
    // A glob that matches nothing is a test that always passes. A1 ships one page
    // and no route; the floor rises as A3-A6 land.
    expect(PAGES.length).toBeGreaterThanOrEqual(1);
    expect(ALL.length).toBeGreaterThanOrEqual(4);
  });
});

describe('EVERY page and EVERY route calls the gate for itself (A1-8)', () => {
  it('names requireAdminPage or requireAdmin in every one', () => {
    /*
     * **THE LAYOUT IS NOT THE GATE.** It renders above these files and is not a
     * security boundary: partial rendering, route interception and any future
     * parallel route can reach a page without a parent layout's promise holding,
     * and none of those look like a security change in a diff. This assertion is
     * the fence, and "the layout already does it" is the argument that removes it.
     */
    for (const f of [...PAGES, ...ROUTES]) {
      const src = code(f);
      expect(/requireAdmin(Page)?\(/.test(src), `${f} does not call the admin gate`).toBe(true);
    }
  });

  it('never answers 401 or 403 from an admin route (A-D2)', () => {
    // A 403 confirms the surface exists. Every refusal in this tree is a 404, and
    // `adminNotFound()` is the only shape of it. (A signed-OUT caller does get a
    // 401 -- from middleware, not from these files. R36.)
    for (const f of ROUTES) {
      expect(code(f), f).not.toMatch(/status:\s*40[13]/);
    }
  });
});

describe('EVERY admin route declares runtime and maxDuration (A1-16, §4.2)', () => {
  it('declares both, in every route and every page', () => {
    /*
     * Roadmap §4.2 calls this *"the single most likely live failure in v0.5.0"*.
     * `POST /api/locale` was the only database-writing route declaring neither and
     * Vercel's Hobby default of ten seconds lost the write on a cold lambda plus a
     * suspended Neon compute. **There is one admin, so there is never a warm
     * instance and every admin request is the cold one.** A dashboard query is
     * slower than a locale write.
     *
     * And the pairing rule from the same postmortem: a bigger `maxDuration` is not
     * a latency regression, but it must be paired with a bound on the client, or
     * you have only made the hang longer. That half is A3's and A4's.
     */
    for (const f of [...ROUTES, ...PAGES]) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f}: no runtime`).toContain("export const runtime = 'nodejs'");
      expect(src, `${f}: no maxDuration`).toMatch(/export const maxDuration = \d+/);
    }
  });
});

describe('admin copy never enters the i18n catalog (A-D12, A1-17)', () => {
  it('calls no translation function anywhere in the tree', () => {
    /*
     * **THIS GREP IS THE WHOLE ENFORCEMENT AND MUST NOT BE DESCRIBED AS DEFENCE IN
     * DEPTH** (reconciliation R33). A-D12 justified the rule partly by "the catalog
     * ships to the browser on every page" -- but `LocaleProvider` is mounted in the
     * root layout, so it already ships on admin pages and that saving does not
     * exist. What is real: ~150 strings in two locales for a surface with one
     * reader, and `id.ts` owns the key set, so every admin string would force an
     * English twin.
     *
     * The reflex to reach for `useT()` in a new component is strong and the failure
     * is silent -- nothing breaks, the catalog just grows.
     */
    for (const f of ALL) {
      const src = code(f);
      expect(src, f).not.toMatch(/\bgetT\(|\buseT\(|\btFor\(/);
      expect(src, f).not.toMatch(/@\/lib\/i18n\/(t|catalog|locales)/);
      expect(src, f).not.toMatch(/LocaleSwitch|ContentLocaleLink/);
    }
  });
});

describe('the shell owns the only <main> and the only robots field (§1.4, A-D3)', () => {
  it('renders exactly one <main>, in the layout', () => {
    const withMain = ALL.filter((f) => code(f).includes('<main'));
    expect(withMain).toEqual(['src/app/admin/layout.tsx']);
  });

  it('declares `robots` only in the layout', () => {
    // Next merges layout metadata into children, but a child that sets `robots`
    // OVERRIDES it -- so a page copying a metadata block from `/arcana/[slug]`
    // would silently un-noindex itself.
    const withRobots = ALL.filter((f) => /robots\s*:/.test(code(f)));
    expect(withRobots).toEqual(['src/app/admin/layout.tsx']);
  });

  it('takes the page name from the closed template list, never from usePathname()', () => {
    // A1-18 / R32 at the call site: a resolved pathname on `/admin/users/<uuid>`
    // would put a subject's uuid into `events.props`, which survives that
    // subject's erasure with `user_id` nulled.
    for (const f of ALL) {
      expect(code(f), f).not.toMatch(/usePathname/);
    }
  });
});
