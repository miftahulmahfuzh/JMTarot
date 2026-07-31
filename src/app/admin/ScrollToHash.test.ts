/**
 * The drill-down's landing arithmetic, and the fence that keeps the link and its target in step.
 *
 * `AdminScrollToHash` itself is a `useEffect` against a real document and `npm test` has neither,
 * so what is unit-testable is the offset maths -- exported for exactly that reason -- plus the
 * two source-level facts that make the feature work and that a refactor can quietly break:
 * the league row's href, and the component being mounted INSIDE the suspended subtree.
 *
 * **The browser half was measured rather than tested** (see the component's header, and
 * `docs/workstream-notes.md`): with no component the page answered
 * `{ hash: '#token', scrollY: 0, tokenTop: 2699 }`. No unit test can see that, which is why the
 * greps below are worth having.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANCHOR_OFFSET_VAR, stickyOffsetIn } from './ScrollToHash';

const HERE = join(process.cwd(), 'src/app/admin');
const read = (p: string) => readFileSync(join(HERE, p), 'utf8');

/** The sticky table of contents as measured on the real page at 390px: fourteen links, wrapped. */
const TOC = { position: 'sticky', top: '0px', boxTop: 402, height: 191 };
/** `AdminTabs`, which scrolls away and must never be counted. */
const TABS = { position: 'relative', top: '0px', boxTop: 0, height: 59 };

describe('stickyOffsetIn -- what is actually covering the anchor', () => {
  it('counts a sticky bar pinned to the top, even before it is stuck', () => {
    // At mount the page is at y=0, so the TOC is still in flow several hundred px down. It is
    // nonetheless what will be covering the target once the scroll lands, so it counts.
    expect(stickyOffsetIn([TABS, TOC])).toBe(191);
  });

  it('ignores everything that is not sticky, whatever it is called', () => {
    expect(stickyOffsetIn([TABS])).toBe(0);
    expect(stickyOffsetIn([])).toBe(0);
  });

  it('ignores a sticky element further down that is not pinned to the top', () => {
    // `top: auto` and below the fold: it is sticky, and it is not in the way.
    expect(stickyOffsetIn([{ position: 'sticky', top: 'auto', boxTop: 900, height: 40 }])).toBe(0);
  });

  it('counts one already stuck at the top even with a non-zero `top`', () => {
    expect(stickyOffsetIn([{ position: 'sticky', top: '8px', boxTop: 0, height: 44 }])).toBe(44);
  });

  it('takes the tallest rather than the sum, because they overlap at the top', () => {
    expect(stickyOffsetIn([TOC, { position: 'fixed', top: '0px', boxTop: 0, height: 60 }])).toBe(191);
  });
});

describe('the league row is a drill-down that carries the range AND the fragment', () => {
  const tokens = read('tokens/page.tsx');

  it('builds `/admin/users/<id>?<range>#token`, never a bare user path', () => {
    // All three parts in one template, because each is separately deletable and each failure is
    // silent: no range shows a different total than the row clicked, no `#token` lands the
    // operator on `Identitas` fourteen panels up.
    expect(tokens).toContain('`/admin/users/${r.userId}?${query}#token`');
    expect(tokens).toContain('rangeQuery(range)');
  });

  it('makes the ROW the anchor, not a label inside it', () => {
    // The report was that the row looks clickable and only the eight hex characters are.
    expect(tokens).toMatch(/<a\s+key=\{r\.key\}\s+className=\{`\$\{styles\.inlineRow\}/);
    // And the dead `.inlineLink` rule is gone rather than left to rot in the stylesheet.
    expect(read('page.module.css')).not.toContain('.inlineLink {');
  });

  it('gives a linked row an accessible name, because its visible text is a hex prefix', () => {
    expect(tokens).toContain('TOKENS.leagueRowLink(');
    expect(read('copy.ts')).toContain('leagueRowLink:');
  });
});

describe('AdminScrollToHash is mounted where the target exists', () => {
  const detail = readFileSync(join(process.cwd(), 'src/app/admin/users/[id]/page.tsx'), 'utf8');

  it('is mounted by the user detail page', () => {
    expect(detail).toContain('<AdminScrollToHash />');
  });

  /**
   * **THE MOUNT POINT IS THE CONTRACT.** Mounted beside `<Suspense>` in the page shell the
   * effect runs against the fallback, finds no `#token`, and returns having done nothing -- a
   * failure that looks exactly like the bug it was written to fix. So assert it sits after
   * `Body`'s declaration rather than in the exported page component.
   */
  it('is inside the suspended subtree and NOT in the shell', () => {
    const shellAt = detail.indexOf('export default async function');
    const bodyAt = detail.indexOf('async function Body(');
    const mountAt = detail.indexOf('<AdminScrollToHash />');
    expect(shellAt).toBeGreaterThan(-1);
    expect(bodyAt).toBeGreaterThan(shellAt);
    expect(mountAt).toBeGreaterThan(bodyAt);
  });

  it('reads matchMedia itself rather than calling the hook that starts false', () => {
    // `usePrefersReducedMotion` corrects in an effect, so at this component's one-shot mount it
    // still reports `false` -- the glide would ship to an operator who asked for less motion.
    const src = read('ScrollToHash.tsx');
    expect(src).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
    // The IMPORT, not the word: the header names the hook in order to explain why it is not
    // called, and a grep for the bare name fails on its own documentation.
    expect(src).not.toMatch(/^import .*usePrefersReducedMotion/m);
    // And `data-still`, for the trap SwipeDeck predicted by name: a JS `scrollTo({ behavior })`
    // OVERRIDES CSS `scroll-behavior` rather than defaulting from it.
    expect(src).toContain("hasAttribute('data-still')");
  });

  it('runs once -- an empty dependency list, which is the feature', () => {
    expect(read('ScrollToHash.tsx')).toContain('}, []);');
  });
});

/**
 * **THE `scroll-margin-top` HALF IS THE ONE THAT MAKES THIS DETERMINISTIC**, and it is the half
 * that reads as cosmetic and gets deleted. Chrome's native fragment scroll fires only sometimes
 * on this page and lands somewhere different from `scrollIntoView`; both honour
 * `scroll-margin-top`, which is what collapses the two outcomes into one.
 */
describe('the anchor offset is published by JS and consumed by CSS', () => {
  it('the component writes the variable the stylesheet reads', () => {
    expect(ANCHOR_OFFSET_VAR).toBe('--admin-anchor-offset');
    expect(read('ScrollToHash.tsx')).toContain('setProperty(ANCHOR_OFFSET_VAR');
  });

  it('`.panel` consumes it as scroll-margin-top, with a 0px fallback', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/app/admin/users/[id]/detail.module.css'),
      'utf8',
    );
    expect(css).toContain(`scroll-margin-top: var(${ANCHOR_OFFSET_VAR}, 0px)`);
  });

  it('scrolls with scrollIntoView, so CSS owns the offset rather than arithmetic here', () => {
    // A hand-rolled `scrollTo(top - bar)` cannot be honoured by Chrome's own scroll, so the two
    // paths would sit one bar-height apart -- which is the bug this rewrite fixed.
    const src = read('ScrollToHash.tsx');
    expect(src).toContain('target.scrollIntoView({');
    expect(src).not.toContain('window.scrollTo(');
  });
});
