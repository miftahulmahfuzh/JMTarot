import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **ONE NUMBER, FOUR STYLESHEETS (2026-08-30, R2/R2a).**
 *
 * Every hairline in the tail of a reading must sit the same distance from the text
 * above it as from the text below it, on both screens that render a reading. That
 * distance is 18px, and it is written in four files -- because the space BELOW a
 * hairline is one block's `padding-top` while the space ABOVE it is the NEXT block's
 * `margin-top` plus the parent's `gap`. Half of every measurement lives in a
 * different file from the symptom, which is exactly how it came to be 14px above and
 * 40px below without anyone noticing.
 *
 * There is no spacing token to point at: `tokens.css` has no spacing family and
 * `tokens.ts` is its single source of truth, so introducing one for a single value
 * would be a scale invented for one number. `chatSurface.test.ts` -- which holds
 * `AccountButton.module.css`'s literals against `corner` in `tokens.ts` -- is the
 * precedent for doing it this way instead.
 *
 * **THIS IS A SOURCE-LEVEL TEST AND IT CANNOT SEE THE SCREEN.** `npm test` is logic
 * only; there is no renderer and no browser. What it can do is fail when one of the
 * four numbers moves alone, which is the only way this regresses. The real
 * instrument is loop 4 -- `tools/seo/fit.sh`'s technique, a fixed-width container
 * and `getBoundingClientRect` -- and, for the row itself, a phone.
 */

const CSS = (name: string) =>
  readFileSync(join(process.cwd(), 'src', 'components', name), 'utf8');

/** The number every hairline in the reading tail is spaced by, top and bottom. */
const RHYTHM = 18;

/**
 * `.selector { … }`, comments and all. Enough for a declaration lookup.
 *
 * **ANCHORED TO A LINE START, NOT TO A PRECEDING NEWLINE.** The obvious spelling is
 * `indexOf('\n' + selector + ' {')`, and it is wrong for exactly two of the five
 * rules this file looks up: `.panel` and `.shell` are the FIRST rule in their
 * stylesheets, so there is no newline in front of them and the lookup silently
 * reports "not found" for a selector that is plainly there. The newline was never
 * the point -- what it was buying is that `.row` must not match `.actionRow {` --
 * and `^` under the `m` flag buys that at a line start OR at the start of the file.
 */
function rule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const at = new RegExp(`^${escaped} \\{$`, 'm').exec(source);
  expect({ selector, found: at !== null }).toEqual({ selector, found: true });
  const start = at!.index;
  const end = source.indexOf('\n}', start);
  return source.slice(start, end);
}

function decl(source: string, selector: string, property: string): string {
  const body = rule(source, selector);
  const m = new RegExp(`(?:^|\\n)\\s*${property}:\\s*([^;]+);`).exec(body);
  expect({ selector, property, found: m !== null }).toEqual({
    selector,
    property,
    found: true,
  });
  return m![1].trim();
}

describe('the reading tail spaces every hairline by one number', () => {
  /**
   * The distance from a hairline DOWN to the first text under it. Four blocks, one
   * value: the two disclaimers, `Bahas di grup`, and the action row.
   */
  it('puts 18px below every hairline', () => {
    const cases: Array<[string, string]> = [
      ['ReadingPanel.module.css', '.disclaimer'],
      ['ReadingView.module.css', '.disclaimer'],
      ['AttachReadingLink.module.css', '.wrap'],
      ['ReadingActions.module.css', '.row'],
    ];
    for (const [file, selector] of cases) {
      expect({ file, selector, paddingTop: decl(CSS(file), selector, 'padding-top') }).toEqual({
        file,
        selector,
        paddingTop: `${RHYTHM}px`,
      });
    }
  });

  /**
   * The distance from the text ABOVE a hairline UP to it, which is this block's
   * `margin-top` plus its PARENT's `gap`. The parents are:
   *
   *   - `ReadingPanel`'s `.panel`  -> `gap: 14px`, so the disclaimer needs 4
   *   - `ReadingView`'s `.view`    -> `gap: 18px`, so its disclaimer needs 0
   *   - the draw shell and `.view` -> `gap: 18px`, so `.wrap` and `.row` need 0
   *
   * **A 22px margin here is what R2 removed**, and reinstating one is a one-line
   * change that puts the tail back to 40px below and 18px above.
   */
  it('makes every margin the parent gap complement, so the total is 18px', () => {
    const panelGap = decl(CSS('ReadingPanel.module.css'), '.panel', 'gap');
    expect(panelGap).toBe('14px');
    expect(decl(CSS('ReadingPanel.module.css'), '.disclaimer', 'margin')).toBe('4px 0 0');

    const viewGap = decl(CSS('ReadingView.module.css'), '.view', 'gap');
    expect(viewGap).toBe(`${RHYTHM}px`);
    expect(decl(CSS('ReadingView.module.css'), '.disclaimer', 'margin')).toBe('0');

    expect(decl(CSS('AttachReadingLink.module.css'), '.wrap', 'margin-top')).toBe('0');
    expect(decl(CSS('ReadingActions.module.css'), '.row', 'margin-top')).toBe('0');
  });

  /**
   * The other half of the sum, and the one that lives OUTSIDE `src/components`.
   * The draw screen's shell is what makes `.wrap`'s and `.row`'s zero margins add up
   * to 18 on that screen; if somebody retunes that gap, the tail silently stops
   * matching `/history/[id]` and this is the only thing that says so.
   */
  it('is backed by an 18px gap on the draw shell', () => {
    const shell = readFileSync(
      join(process.cwd(), 'src', 'app', '[reader]', '[service]', 'page.module.css'),
      'utf8',
    );
    expect(decl(shell, '.shell', 'gap')).toBe(`${RHYTHM}px`);
  });
});
