# Phase 2 — One spacing value in the reading tail

**Plan set:** `READING_ACTION_ROW_PLAN.md`
**Satisfies:** R2 (prompt items 2, 2a)
**Depends on:** phase 1 — it creates `ReadingActions.module.css` and this phase edits it
**Worktree:** `/home/miftah/.worktrees/tarot_app/reading-action-row`, branch `feature/reading-action-row`
**Difficulty:** EASY

---

## The measurement this phase is fixing

Four numbers, taken off the source and confirmed against the screenshot. Both screens agree today because both parents gap at 18px — the draw shell (`[reader]/[service]/page.module.css:9`) and `ReadingView`'s `.view` (`ReadingView.module.css:23`).

| Distance the querent sees | Today | Where it comes from |
|---|---|---|
| hairline → *"Bacaan ini untuk hiburan semata…"* | **14px** | `.disclaimer { padding-top: 14px }` |
| *"…atau keuangan."* → next hairline | **40px** | parent `gap: 18px` + `.wrap { margin-top: 22px }` |
| hairline → `BAHAS DI GRUP` | **18px** | `.wrap { padding-top: 18px }` |
| *"…Margaret dan Adrian."* → next hairline | **40px** | parent `gap: 18px` + `.row { margin-top: 22px }` (phase 1; `ShareFooter`'s `.footer` before it) |

**The bottom distance is not owned by the block that appears to have it.** It is the *next* sibling's `margin-top` added to the parent's `gap` — which is why it reads as one number in the screenshot and is two numbers in four files, and why nobody noticed it was 40 while the top was 14.

**Target: 18px, everywhere, top and bottom.** 18 because R2 names the `Bahas di grup` block's top spacing as the reference (*"use the same value as the top separator spacing"*), and that value is `.wrap`'s `padding-top: 18px`. R2a then says *"use the same spacing value accross all texts"*, so the disclaimer's 14 comes **up** to 18 rather than the row coming down to 14.

## The mechanism

Every parent in the tail gaps at **18px**, on both screens. So:

- the space **above** a hairline is `parent gap + that block's margin-top` → the margin must be **0** (`.wrap`, `.row`), or **4px** where the parent gaps at 14 (`ReadingPanel`'s `.panel`).
- the space **below** a hairline is that block's `padding-top` → **18px** everywhere.

That is the whole change: four declarations, in four files, plus a test that keeps them equal.

## Why there is no `--space-*` token

`tokens.css` has no spacing family, and `tokens.ts` is the single source of truth for everything in it — so introducing one means adding a scale to `tokens.ts` for a single value, in a file with one owner, in a phase whose whole subject is *"do not let four copies of one number drift"*. The cheaper honest answer is the one this repo already reaches for: **four literals and a source-level test that reads all four stylesheets and asserts they agree.** `chatSurface.test.ts` holding `AccountButton.module.css`'s `44px` against `corner` in `tokens.ts` is the precedent, and it exists for exactly this reason.

If a fourth surface ever needs the number, promote it to a token then — the test is what will make that safe.

---

## Step 1 — `src/components/ReadingPanel.module.css`

`.disclaimer` sits inside `.panel`, which gaps at **14px**, so its `margin-top` is 4 rather than 0.

```css
/*
 * ── ONE SPACING VALUE ABOVE AND BELOW (2026-08-30, R2/R2a) ─────────────────
 *
 * `padding-top` is the distance from the hairline DOWN to this sentence;
 * `margin-top` plus `.panel`'s 14px `gap` is the distance from the prose UP to the
 * hairline. Both are 18px, and every other hairline in the reading tail is 18px on
 * both sides too -- `ReadingView.module.css`, `AttachReadingLink.module.css` and
 * `ReadingActions.module.css` carry the same number and `readingRhythm.test.ts`
 * fails if any of the four moves alone.
 *
 * It was `padding-top: 14px; margin: 6px 0 0`, which gave 14px above the sentence
 * and **40px** below it -- the 22px `margin-top` of whatever block came next, plus
 * the shell's own 18px gap. The asymmetry was invisible in this file because half of
 * it lives in another one.
 */
.disclaimer {
  font-family: var(--font-body), Georgia, serif;
  font-style: italic;
  font-size: 13px;
  color: var(--faint);
  border-top: 1px solid var(--gold-hairline);
  padding-top: 18px;
  /* 4 + `.panel`'s `gap: 14px` = 18. See above. */
  margin: 4px 0 0;
}
```

## Step 2 — `src/components/ReadingView.module.css`

Identical role, different parent: `.disclaimer` is a child of `.view`, which gaps at **18px**, so the margin goes to 0.

```css
/*
 * ── ONE SPACING VALUE ABOVE AND BELOW (2026-08-30, R2/R2a) ─────────────────
 *
 * `ReadingPanel.module.css`'s `.disclaimer` is the same sentence on the other
 * screen and carries the same rule; read that one for the argument. The ONLY
 * difference is the margin: this element's parent (`.view`) already gaps at 18px,
 * where `.panel` gaps at 14 -- so 0 here and 4 there produce the same 18px on
 * screen. **The two files are not byte-identical and that is correct**; what has to
 * match is the number the querent measures.
 */
.disclaimer {
  font-family: var(--font-body), Georgia, serif;
  font-style: italic;
  font-size: 13px;
  color: var(--faint);
  border-top: 1px solid var(--gold-hairline);
  padding-top: 18px;
  /* `.view` gaps at 18px, which is the whole distance. See above. */
  margin: 0;
}
```

## Step 3 — `src/components/AttachReadingLink.module.css`

Phase 1 left `.wrap` untouched. Quote it as phase 1 leaves it and change the one declaration:

```css
.wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  /*
   * **ZERO, AND THE 18px COMES FROM THE PARENT'S `gap` (2026-08-30, R2).** It was
   * 22, which the draw shell's and `ReadingView`'s own 18px gap then added to -- so
   * the hairline sat 40px below the disclaimer while sitting 18px above this
   * button. The block looked top-tight and bottom-loose, and the reason was in a
   * different file from the symptom.
   *
   * A `margin-top` here is now redundant BY CONSTRUCTION: both parents gap at 18,
   * which is the number this whole tail uses. `readingRhythm.test.ts` asserts it
   * stays 0 -- reinstating a margin is the single-line change that undoes R2.
   */
  margin-top: 0;
  padding-top: 18px;
  border-top: 1px solid var(--gold-hairline);
}
```

`.action`, `.action:focus-visible` and `.hint` — including phase 1's fill — are unchanged.

## Step 4 — `src/components/ReadingActions.module.css`

Phase 1 shipped `.row` with `margin-top: 22px`, deliberately copying `ShareFooter`'s old `.footer` so that phase's diff moved nothing. Zero it:

```css
.row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--corner-gap);
  /*
   * **ZERO SINCE 2026-08-30 (R2).** Phase 1 shipped this as 22 -- `ShareFooter`'s
   * `.footer` verbatim -- so that phase changed no vertical rhythm at all. The 18px
   * above this hairline now comes entirely from the parent's `gap`, which is 18 on
   * both mounting screens. See `AttachReadingLink.module.css`'s `.wrap`, which is
   * the same rule one block up, and `readingRhythm.test.ts`.
   */
  margin-top: 0;
  padding-top: 18px;
  border-top: 1px solid var(--gold-hairline);
}
```

## Step 5 — `src/components/readingRhythm.test.ts` (new)

```ts
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

/** `.selector { … }`, comments and all. Enough for a declaration lookup. */
function rule(source: string, selector: string): string {
  const start = source.indexOf(`\n${selector} {`);
  expect({ selector, found: start !== -1 }).toEqual({ selector, found: true });
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
```

---

## Verification

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
cd /home/miftah/.worktrees/tarot_app/reading-action-row

npm run typecheck
npm test -- readingRhythm
npm test
npm run build
```

**Then measure it, because no test in this repo can see a pixel.** Loop 4 is the right loop and it is exact for this: the tail's spacing has no input but its container's inline width.

```sh
npm run db:up && npm run dev     # http://localhost:3001
```

Take a completed reading, then read the four gaps off the live DOM at 320/360/390 — the `tools/seo/fit.sh` technique, or in the browser console on the draw screen:

```js
const line = (el) => el.getBoundingClientRect();
const d = document.querySelector('[class*="disclaimer"]');
const w = document.querySelector('[class*="wrap"]');
const r = document.querySelector('[class*="row"]');
// each of these must read 18
console.log(getComputedStyle(d).paddingTop, getComputedStyle(w).paddingTop, getComputedStyle(r).paddingTop);
console.log(line(w).top - line(d).bottom, line(r).top - line(w).bottom);
```

Both printed lines must be `18px 18px 18px` and `18 18`. Repeat on `/history/<id>`, where the same two numbers must come out identical — the two screens have always agreed and R2 must not be the change that splits them.

Finally, look at it: the point of R2 was that the block read top-tight and bottom-loose, and 18px is a judgement about a phone. **Loop 6 is the gate** — three hairlines inside 60px is the kind of thing only hardware answers, which `AttachReadingLink.module.css` already says in its own header.

## Rollback

`git revert` this phase's commit. It touches only stylesheets and one new test; phase 1's row, share sheet and account menu are unaffected and the tail returns to `main`'s spacing.
