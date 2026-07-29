/*
 * Loop 4's measurement for `/admin` and `/admin/tokens`, evaluated in a real Chrome by
 * `tools/seo/chartfit.sh`. `__WIDTH__` is substituted before it is sent.
 *
 * ── IT IS A FILE AND NOT A HEREDOC, FOR ONE MEASURED REASON ──────────────────
 *
 * `galleryfit.js`'s header records it: the same JavaScript inside a double-quoted bash
 * argument HUNG the harness -- no error, no output, a three-minute timeout that looks
 * exactly like Chrome being wedged -- while every fragment of it worked when sent alone.
 * Backticks, `??`, regex literals and `${}` through bash quoting is a class of bug with no
 * useful diagnostics. One `sed` substitution, no quoting.
 *
 * ── WHAT IT MEASURES, AND WHY EACH NUMBER IS A CLAIM SOMEBODY MADE ───────────
 *
 * Loop 4 is THE loop for width (CLAUDE.md, and roadmap §10.1). Neither Chrome in this image
 * gives a real phone viewport -- both floor at ~500px -- so a narrow screenshot is a ~500px
 * layout cropped to look narrow. Constraining a container and reading
 * `getBoundingClientRect` is exact for anything whose only input is its container's inline
 * size, which is every number below.
 *
 * Each corresponds to a written commitment:
 *
 *   overflow / offenders  nothing may scroll the page body sideways (`## Styling`)
 *   kpiCols               `auto-fit minmax(150px, 1fr)` must give ONE column at 320
 *   plotH                 the container query: 200px at <=520px inline size, 240 above
 *   barH / meterH         `--chart-bar` 20px under the 24px cap; the meter track 12px
 *   tickPx                every axis tick >= 11px rendered (I-12's contrast argument
 *                         assumes 11px; a scaled `<text>` would break it, and §3's whole
 *                         architecture exists so this number is a constant)
 *   targets               every interactive row >= 44px (the iOS floor `PublicShare`'s
 *                         known 36px defect is measured against)
 *   heatCols / heatCell   7 columns on a phone, cells big enough to hit
 *   labelClip             the stacked bar's label column must wrap, never clip
 *
 * ── THE CONTAINER IT CONSTRAINS IS THE SHELL, NOT THE GRID ──────────────────
 *
 * `galleryfit.js`'s reason, and it applies unchanged: the grid's width is DERIVED from the
 * shell's content box, and the shell is what a phone varies. A1's `.shell` carries 20px of
 * side padding, so the content box comes out at WIDTH - 40.
 */
(() => {
  const WIDTH = __WIDTH__;

  const frame = document.getElementById('app');
  const doc = frame && frame.contentDocument;
  if (!doc) return JSON.stringify({ error: 'no iframe document' });

  const shell = doc.querySelector('main');
  const grid = doc.querySelector('main div[class*=grid]');
  if (!shell || !grid) return JSON.stringify({ error: 'no shell or grid -- is the page a 404?' });

  /* Constrain the SHELL. A1's layout sets `max-width: 1200px`, so an override is needed on
     both properties or the shell keeps its own floor. */
  const prev = { w: shell.style.width, mw: shell.style.maxWidth };
  shell.style.width = WIDTH + 'px';
  shell.style.maxWidth = WIDTH + 'px';
  void shell.offsetWidth;

  const r2 = (n) => Math.round(n * 100) / 100;
  const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;

  /*
   * Overflow, at every level under the shell.
   *
   * A `<details>` table scroller is EXCLUDED and it is not a cheat: `TableView.module.css`
   * sets `overflow-x: auto` on it deliberately, so `scrollWidth > clientWidth` is TRUE BY
   * DESIGN for a nine-column table at 320px -- that is the rule from `## Styling` being
   * obeyed (wide content scrolls inside its own container), not broken. Identified by
   * computed `overflow-x`, not by class name, so a renamed class does not silently
   * re-include it.
   */
  const offenders = [];
  const markBleed = [];
  for (const el of shell.querySelectorAll('*')) {
    const over = el.scrollWidth - el.clientWidth;
    if (over <= 1) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
    const cls = el.className ? String(el.className).split(' ')[0].split('__').pop() : '';
    const name = el.tagName.toLowerCase() + (cls ? '.' + cls : '') + ' ' + el.scrollWidth + '>' + el.clientWidth;
    /*
     * ── A <=4px BLEED IS A CENTRED END MARK, NOT AN OVERFLOW ────────────────
     *
     * An end-dot is `--chart-mark` (8px) centred ON its data point, so at the last x half of
     * it sits outside the plot by 4px BY DESIGN -- that is what "anchored to the data" means,
     * and the SVG carries `overflow: visible` for the same reason. It makes
     * `scrollWidth > clientWidth` true for `.plot`, `.plotFrame` and `.body` by exactly 4,
     * and nothing scrolls: there is no `overflow: auto` on any of them.
     *
     * Reported SEPARATELY rather than excluded silently -- `galleryfit.js` does the same with
     * `.srOnly`, whose 1px box overflows by design, and its reason applies: counting them puts
     * permanent offenders in every run and **the real one becomes invisible.** A bleed above
     * 4px is NOT this and stays an offender.
     */
    if (over <= 4) {
      markBleed.push(name);
      continue;
    }
    offenders.push(name);
  }

  /* KPI columns, by grouping tile lefts on the first KPI row. One column at 320 is the
     claim `minmax(150px, 1fr)` makes. */
  const kpiRow = doc.querySelector('main div[class*=row]');
  const kpiCols = kpiRow
    ? new Set(Array.from(kpiRow.children).map((c) => Math.round(c.getBoundingClientRect().left))).size
    : 0;

  /* Plot height: the container query's whole observable. */
  const plot = doc.querySelector('div[class*=plot]:not([class*=plotFrame])');
  const plotH = plot ? Math.round(plot.getBoundingClientRect().height) : 0;

  /* Bar and meter thickness -- both are pixel counts in the mark spec, which is why they are
     CSS and not SVG (§3). */
  const bar = doc.querySelector('span[class*=bar]');
  const barH = bar ? r2(bar.getBoundingClientRect().height) : 0;
  const track = doc.querySelector('div[class*=track]');
  const meterH = track ? r2(track.getBoundingClientRect().height) : 0;

  /* Every axis tick's RENDERED font size. In an SVG `<text>` this would scale with the
     container; the whole point of §3's split is that it does not. */
  const ticks = Array.from(doc.querySelectorAll('span[class*=Tick]'));
  const tickPx = Array.from(new Set(ticks.map((t) => r2(px(t, 'fontSize'))))).sort();

  /* Interactive targets. The iOS floor is 44px and this surface may well be read on a phone
     by somebody finding out why something broke. */
  /*
   * A HEAT CELL IS EXCLUDED HERE AND MEASURED SEPARATELY, and the exclusion is a claim rather
   * than a convenience. There are 210 of them; they are a GRID OF READOUTS whose activation
   * does nothing (the readout appears on `:hover` and `:focus-visible`, in CSS), not a row of
   * controls. Counting them puts 210 permanent entries in `under44` and **the real one becomes
   * invisible** -- `galleryfit.js`'s `.srOnly` reason, applied. `heatCell` below is the number
   * that governs them.
   *
   * The first version of this file said in a comment that heat cells were excluded and then
   * selected `button` anyway, so `under44` came back with two of them and the note read as
   * false. Loop 4 caught the harness's own defect before the page's.
   */
  const interactive = Array.from(doc.querySelectorAll('button, a[href], summary, input')).filter(
    (el) => !/cell/i.test(String(el.className || '')),
  );
  const short = interactive
    .map((el) => ({ el, h: el.getBoundingClientRect().height }))
    .filter((x) => x.h > 0 && x.h < 44)
    .map((x) => {
      const cls = x.el.className ? String(x.el.className).split(' ')[0].split('__').pop() : '';
      return x.el.tagName.toLowerCase() + (cls ? '.' + cls : '') + ' ' + r2(x.h);
    });

  /* The heatmap: 7 columns on a phone, and a cell big enough to aim at. A heat cell is
     deliberately EXCLUDED from the 44px check above -- there are 210 of them and they are a
     grid of readouts, not a row of controls -- so its size is reported separately. */
  const heat = doc.querySelector('div[class*=grid][role=grid]');
  const heatCells = heat ? Array.from(heat.children) : [];
  const heatCols = heatCells.length
    ? new Set(heatCells.slice(0, 40).map((c) => Math.round(c.getBoundingClientRect().left))).size
    : 0;
  const heatCell = heatCells.length ? r2(heatCells[0].getBoundingClientRect().width) : 0;

  /* The stacked bar's label column must WRAP, never clip: a clipped category name is a chart
     that cannot be read. */
  const labels = Array.from(doc.querySelectorAll('span[class*=label]'));
  const labelClip = labels.filter((l) => l.scrollWidth > l.clientWidth + 1).length;

  const out = {
    w: WIDTH,
    content: Math.round(shell.getBoundingClientRect().width - 40),
    cards: doc.querySelectorAll('main figure').length,
    kpiCols: kpiCols,
    plotH: plotH,
    barH: barH,
    meterH: meterH,
    tickPx: tickPx,
    heatCols: heatCols,
    heatCell: heatCell,
    labelClip: labelClip,
    /*
     * **THE CLAIM IS ABOUT THE PAGE BODY**, which is what `## Styling` actually commits to:
     * *wide content scrolls inside its own container and the page body never scrolls
     * horizontally.* So this is measured on the shell, and `offenders` is the diagnostic that
     * says which descendant caused it.
     */
    overflow: shell.scrollWidth > shell.clientWidth + 1,
    offenders: offenders.slice(0, 6),
    markBleed: markBleed.slice(0, 4),
    under44: short.slice(0, 6),
    /* The one thing a screenshot cannot tell you and a fence cannot either: is the panel
       actually opaque? R8's whole invariant, read off the rendered element. */
    panelBg: (() => {
      const fig = doc.querySelector('main figure');
      return fig ? getComputedStyle(fig).backgroundColor : 'none';
    })(),
  };

  shell.style.width = prev.w;
  shell.style.maxWidth = prev.mw;
  return JSON.stringify(out);
})()
