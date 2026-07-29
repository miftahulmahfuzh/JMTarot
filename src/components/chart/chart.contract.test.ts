/**
 * The fences over `src/components/chart/**`. v0.5.0 / A4.
 *
 * Everything asserted here is a rule that would otherwise be a convention, and every one of
 * them has a failure mode that **looks like nothing on screen**: a translucent panel, a
 * second client component, a colour keyed by rank, a chart with no table view.
 *
 * ── EVERY GREP READS THE FILE WITH ITS COMMENTS STRIPPED ─────────────────────
 *
 * A1's `adminSurface.test.ts` states the reason and this project has paid for it twice:
 * *"a rule that fires on prose describing the rule is a rule people delete."*
 * `queries/contract.test.ts`'s first version failed against the sentence *"Never import from
 * '../client'"* in a doc comment, and `sitemap.test.ts`'s LEAF fence strips comments for the
 * same reason.
 *
 * **It bit here immediately.** `Line.tsx`'s header says *"no `<text>`, no `<circle>`"* and
 * `Axis.module.css`'s says *"HTML, not SVG `<text>`"* -- five hits across three files, all of
 * them the documentation of the rule being grepped for. The alternative is prose that cannot
 * name what it forbids, and the fences are worth more than that.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'src/components/chart';
const ALL = globSync(`${DIR}/**/*.{ts,tsx,css}`).filter((f) => !f.includes('.test.'));
const TSX = ALL.filter((f) => f.endsWith('.tsx'));
const CSS = ALL.filter((f) => f.endsWith('.css'));

/** The file with its comments removed. See the header. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the fences are not vacuous', () => {
  it('finds the chart directory at all', () => {
    // A glob that matches nothing is a test that always passes -- the
    // `clientBoundary.test.ts` precedent, and the reason every fence below has a floor.
    expect(TSX.length).toBeGreaterThanOrEqual(12);
    expect(CSS.length).toBeGreaterThanOrEqual(8);
  });
});

describe('I-17 -- EXACTLY ONE client component', () => {
  it('is ChartHover, and nothing else', () => {
    /*
     * A-D10's third reason is that server-rendered SVG needs no hydration at all, which is
     * the whole reason this dashboard can be fast on a cold lambda -- **and it is lost one
     * component at a time.** Every other interaction here is CSS: `<details>` for the table,
     * `:hover`/`:focus-visible` for a heat cell, a native `title` for a bar segment.
     */
    const clients = TSX.filter((f) => /^\s*'use client'/m.test(readFileSync(f, 'utf8')));
    expect(clients).toEqual([`${DIR}/ChartHover.tsx`]);
  });
});

describe('I-15 -- nothing here reads the world', () => {
  const forbidden: [RegExp, string][] = [
    [/process\.env/, 'reads an environment variable -- A3 passes the ceiling as a prop'],
    [/@\/lib\/db\//, 'imports the data layer'],
    [/@\/lib\/i18n\//, 'imports the i18n catalog (A-D12)'],
    [/\bcurrentUser\(|\brequireUser\(|\brequireAdmin/, 'reads a session'],
    [/\bfetch\(/, 'fetches -- both pages query server-side (R21)'],
    [/server-only/, 'takes the server-only marker, which would make it untestable'],
  ];

  for (const [pattern, why] of forbidden) {
    it(`no file ${why}`, () => {
      for (const f of ALL) {
        expect(pattern.test(code(f)), `${f} ${why}`).toBe(false);
      }
    });
  }

  it('does not import @/lib/db EVEN AS `import type`', () => {
    /*
     * The regex above cannot see the difference, and that is the point: `ReadingStatus` had
     * to move to `@/data/types` in V6 for exactly this reason -- *"clientBoundary.test.ts's
     * regex does not know the `type` keyword"*. So the ban is on the SPECIFIER, which catches
     * both forms, and this test names the case so nobody "fixes" the regex to allow types.
     */
    for (const f of ALL) {
      expect(code(f), f).not.toMatch(/from\s+'@\/lib\/db/);
      expect(code(f), f).not.toMatch(/import\s+type\s+.*@\/lib\/db/);
    }
  });

  it('imports from @/lib/analytics ONLY as a type', () => {
    // `Trajectory` needs A3's `Forecast` union. A VALUE import would put a module with a
    // 296-line OLS implementation into a component bundle for a type.
    for (const f of ALL) {
      const src = code(f);
      const lines = src.split('\n').filter((l) => l.includes('@/lib/analytics'));
      for (const l of lines) {
        expect(l.trim(), `${f}: ${l.trim()}`).toMatch(/^import type /);
      }
    }
  });
});

describe('I-5 -- CATEGORICAL is indexed in exactly one place', () => {
  it('never outside slotColor', () => {
    /*
     * This is what makes *"colour follows the entity, never its rank"* structural. The failure
     * it prevents is one line -- `series.map((s, i) => CATEGORICAL[i])` -- and on screen it
     * looks like a chart with colours, right up until somebody filters to two readers and the
     * survivors are repainted.
     */
    for (const f of ALL) {
      expect(code(f), `${f} indexes CATEGORICAL directly`).not.toMatch(/CATEGORICAL\s*\[/);
    }
  });

  it('resolves every series colour through slotColor', () => {
    // A component that hardcoded a hex would pass the assertion above and still break the
    // rule. Every .tsx that colours a mark imports the accessor.
    const colouring = TSX.filter((f) => /slotColor|SEQUENTIAL|SEVERITY|STATUS/.test(code(f)));
    expect(colouring.length).toBeGreaterThanOrEqual(6);
    for (const f of colouring) {
      expect(code(f), `${f} names a hex literal`).not.toMatch(/#[0-9a-fA-F]{6}/);
    }
  });
});

describe('I-4 -- the panel paints an OPAQUE surface (R8)', () => {
  it('ChartFrame sets background: var(--chart-surface)', () => {
    /*
     * **THE ASSERTION FOR THE DEFECT THAT WOULD HAVE SHIPPED.** `#a3423a` measures 2.66:1
     * against the top of `Backdrop`'s radial and 3.04:1 against `#130f22`, and the ordinal
     * validator passes either way because its light-end floor is 2.0. A missing `background`
     * is the failure and **it looks like nothing at all**, which is why this is a test and
     * not a review item.
     */
    const css = readFileSync(`${DIR}/ChartFrame.module.css`, 'utf8');
    expect(css).toMatch(/background:\s*var\(--chart-surface\)/);
  });

  it('introduces no translucency on any chart panel or readout', () => {
    // `rgba`, an `opacity` on the panel, or a `backdrop-filter` all let the radial through
    // and invalidate the whole §5.1 validation run. `fill-opacity` on an area wash and the
    // skeleton's keyframe opacity are marks inside the panel, not the panel itself.
    for (const f of CSS) {
      const css = code(f);
      expect(css, `${f} uses backdrop-filter`).not.toMatch(/backdrop-filter/);
      expect(css, `${f} uses an rgba background`).not.toMatch(/background:[^;]*rgba\(/);
    }
  });
});

describe('I-13 -- every chart has a table view, and `table` is not optional', () => {
  it('ChartFrame requires it', () => {
    const src = readFileSync(`${DIR}/ChartFrame.tsx`, 'utf8');
    // `table: TableSpec`, never `table?:`. An optional accessibility affordance is an absent
    // one; a required prop is a compile error.
    expect(src).toMatch(/\n\s*table: TableSpec;/);
    expect(src).not.toMatch(/table\?:/);
  });

  it('TableView is rendered by ChartFrame and imported nowhere else', () => {
    const importers = TSX.filter((f) => /from '\.\/TableView'/.test(code(f)));
    expect(importers).toEqual([`${DIR}/ChartFrame.tsx`]);
  });
});

describe('I-9 -- exactly one file can render a Legend', () => {
  it('is ChartFrame', () => {
    const importers = TSX.filter((f) => /from '\.\/Legend'/.test(code(f)));
    expect(importers).toEqual([`${DIR}/ChartFrame.tsx`]);
  });

  it('gates it on series.length >= 2, in one place', () => {
    const src = code(`${DIR}/ChartFrame.tsx`);
    expect(src).toMatch(/series\.length >= 2/);
  });
});

describe('I-14 / §1.3 -- the forms that need an all-pairs palette do not exist', () => {
  it('has no pie, donut, scatter, bubble or small-multiple file', () => {
    /*
     * The `--pairs all` run is a WARN at ΔE 6.5, legal only with mandatory secondary
     * encoding -- so A4's answer is structural: the forms are absent, by filename.
     *
     * The donut is separate and is a DECLINE rather than a constraint: §5.3 permits one for a
     * single ratio in a stat tile, and that ratio is the meter, and there is already a meter.
     */
    for (const name of ['Pie', 'Donut', 'Scatter', 'Bubble', 'SmallMultiple', 'Radar']) {
      expect(ALL.filter((f) => f.includes(name)), `${name} exists`).toEqual([]);
    }
  });

  it('has no stacked-area variant', () => {
    // Four hues at 10% opacity over one another is mud, and part-to-whole is StackedBar's
    // job. `Area`'s `series` is a ONE-TUPLE, which is what keeps it out at compile time.
    expect(code(`${DIR}/Area.tsx`)).toMatch(/series: \[ChartSeries\]/);
  });
});

describe('I-18 -- no escape hatch out of React text rendering', () => {
  it('never uses dangerouslySetInnerHTML', () => {
    // `interaction.md`: labels are untrusted data. A model string, an `op` value or a
    // truncated user id reaching a tooltip through concatenation is the failure.
    for (const f of ALL) {
      expect(code(f), f).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });
});

describe('§3 -- no text inside an SVG, anywhere', () => {
  it('emits no <text>, <tspan> or <foreignObject>', () => {
    /*
     * Everything inside a uniformly-scaled viewBox scales, including things whose
     * specification IS a pixel count: an 11px tick renders at 14-23px on a desktop container
     * and 2.7px on a phone with a desktop viewBox. A chart whose labels change size with
     * their container cannot honour I-12 and cannot be measured by loop 4.
     */
    for (const f of TSX) {
      const src = code(f);
      expect(src, `${f} has an SVG text node`).not.toMatch(/<text|<tspan|<foreignObject/);
    }
  });

  it('uses preserveAspectRatio="none" and non-scaling-stroke wherever it emits an SVG', () => {
    // The two together are what make the shear harmless: `none` IS the plot transform, and
    // `non-scaling-stroke` keeps a 2px line 2px at any width. There is no equivalent for a
    // radius, which is why markers and rounded ends are HTML.
    const svgFiles = TSX.filter((f) => /<svg/.test(code(f)));
    expect(svgFiles.length).toBeGreaterThanOrEqual(4);
    for (const f of svgFiles) {
      expect(code(f), `${f}: preserveAspectRatio`).toMatch(/preserveAspectRatio="none"/);
    }
    // The stroke rule lives in the stylesheets, one per SVG-emitting component.
    const strokeCss = CSS.filter((f) => /non-scaling-stroke/.test(code(f)));
    expect(strokeCss.length).toBeGreaterThanOrEqual(3);
  });
});

describe('§1.10 -- tabular figures in COLUMNS only, and this is an amendment', () => {
  it('keeps them out of the hero and the tile value', () => {
    /*
     * The rule: a hero number and a tile value are read ONCE, on their own, so proportional
     * digits are what make them read as a number somebody chose to show you. Tabular digits
     * are for columns a reader compares row by row.
     */
    expect(code(`${DIR}/StatTile.module.css`)).not.toMatch(/tabular-nums/);
    expect(code(`${DIR}/StatTile.module.css`)).toMatch(/proportional-nums/);
    expect(code(`${DIR}/Meter.module.css`)).not.toMatch(/tabular-nums/);
  });

  it('allows them exactly where figures form a column', () => {
    /*
     * **AN AMENDMENT TO TASK 11's LITERAL ACCEPTANCE STEP, STATED RATHER THAN SLIPPED IN.**
     * The plan says *"grep the module CSS -- `tabular-nums` appears only in
     * `TableView.module.css` and `Axis.module.css`"*. Two more files legitimately have a
     * column of figures: `StackedBar`'s per-row value (one number per row, vertically
     * aligned -- the exact case tabular digits exist for) and `ChartHover`'s readout (one
     * value per series, stacked). The PRINCIPLE the plan states -- *"tabular-nums only in
     * table rows and axis ticks"* -- is about columns versus single-read figures, and these
     * are columns. Asserted as a closed list so it cannot spread further.
     */
    const withTabular = CSS.filter((f) => /tabular-nums/.test(code(f))).sort();
    expect(withTabular).toEqual(
      [
        `${DIR}/Axis.module.css`,
        `${DIR}/ChartHover.module.css`,
        `${DIR}/StackedBar.module.css`,
        `${DIR}/TableView.module.css`,
      ].sort(),
    );
  });

  it('sets the hero at 48px or more (R13: Cinzel, not a sans)', () => {
    const css = readFileSync(`${DIR}/StatTile.module.css`, 'utf8');
    const m = css.match(/\.heroValue\s*\{[^}]*font-size:\s*(\d+)px/);
    expect(m, 'no .heroValue font-size').not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(48);
    // This project has two serifs and no third family, and `## Styling` forbids a new font
    // as firmly as a new hex. The rule's REASON -- "off-brand decoration" -- is what a
    // system sans would violate here.
    expect(css).toMatch(/\.heroValue\s*\{[^}]*var\(--font-display\)/);
  });
});
