/*
 * Loop 4's measurement for S5's download control, evaluated in a real Chrome by
 * `tools/seo/wallpaperfit.sh`. `__WIDTH__` is substituted before it is sent.
 *
 * ── WHY LOOP 4 AND NOT A SCREENSHOT ─────────────────────────────────────────
 *
 * CLAUDE.md `## How to verify things here`: neither Chrome available in this image
 * gives a real phone width. Both floor at ~500px, so `--window-size=320` lays out
 * at 500 and CROPS -- a shot that looks like a phone is not one, and that mistake
 * has been made in this project twice. This control's only input is its
 * container's inline size, which is exactly the case loop 4 answers exactly.
 *
 * A FILE AND NOT A HEREDOC, for `galleryfit.js`'s measured reason: the same
 * JavaScript inside a double-quoted bash argument hung the harness with no error
 * and no output.
 *
 * ── WHAT IT CONSTRAINS, AND WHY THAT IS THE HONEST NUMBER ───────────────────
 *
 * The SCRIM, not the sheet. `CardDetail.module.css` gives the scrim
 * `padding: … 20px` and the sheet `width: 100%; max-width: 340px`, so the sheet's
 * width is DERIVED -- `min(340, WIDTH - 40)`. Constraining the sheet directly
 * would measure a number no phone produces.
 *
 * ── THE METRIC THAT MATTERS ─────────────────────────────────────────────────
 *
 * `labelLines`, counted with a `Range` over the anchor's own text nodes and NOT as
 * `height / lineHeight` -- `galleryfit.js` records why: that division measures the
 * box's padding and reported three lines on a page where nothing wrapped. Here the
 * risk is real and specific: `Wallpaper ponsel` plus `1440×3120` on one 44px line
 * at 280px of sheet. Two lines is not a failure; the anchor is a flex row and a
 * wrapped `.dims` is legible. What would be a failure is horizontal overflow, and
 * that is `scrollWidth > clientWidth` on every element under the scrim.
 */
(() => {
  const WIDTH = __WIDTH__;

  const scrim = document.querySelector('div[class*=scrim]');
  const block = document.querySelector('section[class*=WallpaperDownload]');
  if (!scrim || !block) {
    return JSON.stringify({
      error: 'no scrim or no download block -- is the zoom sheet open?',
      scrim: !!scrim,
      block: !!block,
    });
  }

  const prev = { w: scrim.style.width, mw: scrim.style.maxWidth };
  scrim.style.width = WIDTH + 'px';
  scrim.style.maxWidth = WIDTH + 'px';
  void scrim.offsetWidth;

  const r2 = (n) => Math.round(n * 100) / 100;
  const sheet = scrim.querySelector('div[class*=sheet]');
  const links = Array.from(block.querySelectorAll('a[href*="/wallpapers/"]'));

  /*
   * VISUAL LINES: distinct rect TOPS across every text node under `el`.
   *
   * **`range.getClientRects().length` IS NOT A LINE COUNT HERE, AND THE FIRST
   * VERSION OF THIS FILE USED IT AND REPORTED NONSENSE.** It returns one rect per
   * line box PER FRAGMENT, so a range spanning several text nodes or elements
   * counts fragments, not lines. Measured on this control: a one-line anchor
   * reported `5` (label text + `<span>` + three text nodes inside it) and
   * `1440×3120` reported `3` (`{width}`, `×`, `{height}` are three text nodes).
   * `.licence` reported 5, 7, 8 and 9 lines at INCREASING widths -- the tell, since
   * a wider box cannot wrap more.
   *
   * `galleryfit.js` records the sibling failure -- `height / lineHeight` measured
   * padding and confidently reported three lines where nothing wrapped. Same
   * lesson: a metric that is confidently wrong is worse than no metric, and the way
   * to catch it is to check that it moves the way physics says it must.
   *
   * **CLUSTERED WITH A TOLERANCE, NOT ROUNDED INTO BUCKETS**, and that distinction
   * cost one wrong reading too. Rounding `top / 2` reported the English anchor as
   * TWO lines: measured tops are 424 for `The card image` and 425 for the 9px
   * `.dims` beside it -- same visual line, `align-items: center`, one pixel apart --
   * and 424 and 425 fall either side of a bucket boundary. A bucket edge is not a
   * distance. So: sort, and start a new line only on a gap wider than 4px.
   */
  const lineCount = (el) => {
    if (!el) return 0;
    const tops = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent || !n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const rect of range.getClientRects()) {
        if (rect.width === 0 && rect.height === 0) continue;
        tops.push(rect.top);
      }
    }
    tops.sort((a, b) => a - b);
    let lines = 0;
    let last = -Infinity;
    for (const top of tops) {
      if (top - last > 4) lines++;
      last = top;
    }
    return lines;
  };

  /*
   * Overflow under the scrim.
   *
   * `.srOnly`-style boxes are excluded the way `galleryfit.js` excludes them --
   * by computed `position: absolute` plus a `clip-path`, never by class name, so a
   * renamed class does not silently re-include them. There are none inside this
   * control today; the filter is here so the first one added does not read as a
   * regression.
   */
  const offenders = [];
  for (const el of scrim.querySelectorAll('*')) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'absolute' && cs.clipPath && cs.clipPath !== 'none') continue;
    offenders.push(
      `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} ${el.scrollWidth}>${el.clientWidth}`,
    );
  }

  const out = {
    w: WIDTH,
    sheetW: r2(sheet.getBoundingClientRect().width),
    links: links.length,
    linkW: links.map((a) => r2(a.getBoundingClientRect().width)),
    linkH: links.map((a) => Math.round(a.getBoundingClientRect().height)),
    labelLines: links.map((a) => lineCount(a)),
    dimsLines: links.map((a) => lineCount(a.querySelector('span'))),
    /* One column, always: two 1440x3120 labels do not fit side by side at 280px of
       sheet, and the stylesheet says so with `grid-template-columns: 1fr`. Asserted
       by geometry rather than by reading the CSS: same top, and they must not be. */
    sameRow:
      links.length === 2 &&
      Math.round(links[0].getBoundingClientRect().top) ===
        Math.round(links[1].getBoundingClientRect().top),
    hrefs: links.map((a) => a.getAttribute('href')),
    downloads: links.map((a) => a.getAttribute('download')),
    /* The licence line links to the clause that now grants the licence (S5-5b). */
    licenceHref: block.querySelector('p a')?.getAttribute('href') ?? null,
    hintLines: lineCount(block.querySelector('p[class*=hint]')),
    licenceLines: lineCount(block.querySelector('p[class*=licence]')),
    blockH: Math.round(block.getBoundingClientRect().height),
    overflow: offenders.length > 0,
    offenders,
  };

  scrim.style.width = prev.w;
  scrim.style.maxWidth = prev.mw;
  return JSON.stringify(out);
})()
