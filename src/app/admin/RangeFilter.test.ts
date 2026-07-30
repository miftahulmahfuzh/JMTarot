import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RangeFilter } from './RangeFilter';
import { parseRange, RANGE_PRESETS } from './range';

/**
 * The range filter's SUBMITTED FIELDS, not its looks. v0.5.0.
 *
 * ── THE BUG THIS FILE EXISTS FOR ─────────────────────────────────────────────
 *
 * The reported symptom was *"I clicked 14 hari and the date range didn't do shit"*, and the
 * cause was one `<form>` too few. The presets and the two date inputs shared a single GET
 * form, so a preset submit carried `d=14` **and** the `from`/`to` pair already on screen --
 * and `parseRange` gives an explicit pair PRECEDENCE over `d`. So every preset navigated to a
 * URL that re-selected the range it was already showing: no change to the dates, and no
 * change to the pressed state either, because `preset` is derived from the range that won.
 *
 * **Nothing about the pressed state or the date values was broken.** They were both correct
 * renderings of a range the button had failed to change, which is why the fix is in the form
 * structure and this file asserts what a browser would SEND.
 *
 * A render test cannot press a button, so the assertion is the one a submit is a function of:
 * **the set of named fields inside the form that owns the button.** `fieldsByForm` is that
 * reading, and `no form carries both a preset and a date input` is the regression test --
 * it fails again the moment somebody merges the two forms back into one.
 */
const TODAY = '2026-07-30';

function markup(params: Record<string, string | string[] | undefined>): string {
  return renderToStaticMarkup(
    createElement(RangeFilter, { action: '/admin', parsed: parseRange(params, TODAY) }),
  );
}

/** Each `<form>` in the markup, as its own chunk of HTML. */
function forms(html: string): string[] {
  return html
    .split(/<form\b/)
    .slice(1)
    .map((chunk) => chunk.split('</form>')[0] ?? '');
}

/** The `name` of every submittable field in each form -- what a submit sends. */
function fieldsByForm(html: string): string[][] {
  return forms(html).map((f) => [...f.matchAll(/name="([^"]+)"/g)].map((m) => m[1]));
}

describe('what a preset actually submits', () => {
  it('never puts a preset button and a date input in the same form', () => {
    /*
     * THE REGRESSION TEST. One form holding both is the whole bug: `from`/`to` ride along
     * with `d` and win. Named for the shape rather than for the count, so splitting the
     * filter differently still passes and merging it back does not.
     */
    for (const html of [markup({}), markup({ d: '14' }), markup({ from: '2026-07-01', to: '2026-07-20' })]) {
      for (const fields of fieldsByForm(html)) {
        const hasPreset = fields.includes('d');
        const hasDates = fields.includes('from') || fields.includes('to');
        expect(hasPreset && hasDates).toBe(false);
      }
    }
  });

  it('sends d alone from the preset form', () => {
    const groups = fieldsByForm(markup({}));
    const presets = groups.find((f) => f.includes('d'));
    expect(presets).toBeDefined();
    // One `d` per preset, and nothing else. A hidden `q` or `offset` added here would be a
    // deliberate change to what a preset means; today it means "just the range".
    expect(new Set(presets)).toEqual(new Set(['d']));
    expect(presets).toHaveLength(RANGE_PRESETS.length);
  });

  it('sends from and to alone from the custom form', () => {
    const custom = fieldsByForm(markup({})).find((f) => f.includes('from'));
    expect(custom).toEqual(['from', 'to']);
  });

  it('submits both forms to the page that rendered them', () => {
    // A shared `action="/admin"` would move an operator off `/admin/tokens` on every range
    // change -- the reason `action` is a prop. Both forms have to honour it.
    const html = renderToStaticMarkup(
      createElement(RangeFilter, { action: '/admin/tokens', parsed: parseRange({}, TODAY) }),
    );
    const actions = [...html.matchAll(/action="([^"]+)"/g)].map((m) => m[1]);
    expect(actions).toHaveLength(2);
    expect(new Set(actions)).toEqual(new Set(['/admin/tokens']));
  });
});

describe('the filter says which range is on screen', () => {
  it('marks exactly the active preset, for both eyes and a screen reader', () => {
    const html = markup({ d: '14' });
    const buttons = [...html.matchAll(/<button[^>]*value="(\d+)"[^>]*>/g)];
    expect(buttons).toHaveLength(RANGE_PRESETS.length);

    for (const [tag, value] of buttons.map((m) => [m[0], m[1]] as const)) {
      const active = value === '14';
      expect(tag.includes('aria-current="true"')).toBe(active);
      // `aria-current` is not the sighted half. Colour alone would leave the operator
      // guessing, which is the second half of the report.
      expect(/class="[^"]*\bactive\b/.test(tag.replace(/_/g, ' '))).toBe(active);
    }
  });

  it('shows the preset window in Dari and Sampai', () => {
    // The other half of the report: the dates must AGREE with the pressed preset. 14 days
    // inclusive ending today, so `from` is today - 13.
    const html = markup({ d: '14' });
    expect(html).toContain('name="from" value="2026-07-17"');
    expect(html).toContain('name="to" value="2026-07-30"');
  });

  it('marks no preset for a custom range that matches none', () => {
    const html = markup({ from: '2026-07-01', to: '2026-07-20' });
    expect(html).not.toContain('aria-current');
    expect(html).toContain('name="from" value="2026-07-01"');
  });
});
