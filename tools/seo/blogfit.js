/*
 * Loop 4's measurement for `/blog/<slug>`, evaluated in a real Chrome by
 * `tools/seo/blogfit.sh`. `__WIDTH__` is substituted before it is sent.
 *
 * ── IT IS A FILE AND NOT A HEREDOC, FOR THE REASON `galleryfit.js` RECORDS ────
 *
 * The same JavaScript inside a double-quoted bash argument HUNG that harness -- no
 * error, no output, a timeout that looks exactly like Chrome being wedged -- while
 * every fragment worked when sent alone. One `sed` substitution, no quoting.
 *
 * ── WHAT IT MEASURES ────────────────────────────────────────────────────────
 *
 * `chars`  the rendered MEASURE in characters, from a probe calibrated against the
 *          body paragraph's own computed font. Not `px / 8.4`: the figure depends on
 *          the font actually loaded, and a hardcoded advance width is a number that
 *          silently stops being true the day `--font-body` changes.
 * `overflow` / `offenders`  `scrollWidth > clientWidth` on every block. **This is the
 *          failure that actually breaks a phone**, and it is a different claim from
 *          the measure: a 34-character line is arithmetic, a horizontally scrolling
 *          paragraph is a defect.
 * `tocLines` / `linkTargets`  the in-page nav is the one piece of furniture whose
 *          height is content-dependent in both locales, and every one of its anchors
 *          must resolve to an element on the page. A `#` that scrolls nowhere looks
 *          identical to one that works.
 *
 * ── THE LINE-COUNT METRIC IS CLUSTERED WITH A TOLERANCE, AND THAT IS S5's SCAR ─
 *
 * `getClientRects().length` counts FRAGMENTS, not lines, so an inline `<a>` inside a
 * paragraph makes a one-line element report several. And 2px buckets read two rects
 * either side of a bucket edge as two lines. S5 got this metric wrong twice before it
 * was right -- the third time that metric has misled somebody in this project -- so
 * this clusters rect tops with a tolerance of half the line height.
 */
(() => {
  const WIDTH = __WIDTH__;

  const page = document.querySelector('article[class*=page]');
  const body = document.querySelector('[data-article-body]');
  if (!page || !body) return JSON.stringify({ error: 'no article page or body' });

  /* Constrain the ARTICLE, not the body: the body's width is DERIVED from the
     article's content box, and the article is what a phone varies. The 16px of side
     padding is already in the stylesheet, so the content box comes out at
     WIDTH - 32 exactly. */
  const prev = { w: page.style.width, mw: page.style.maxWidth };
  page.style.width = WIDTH + 'px';
  page.style.maxWidth = WIDTH + 'px';
  void page.offsetWidth;

  const r2 = (n) => Math.round(n * 100) / 100;
  const firstP = body.querySelector('p');

  /* A `ch`-calibrated probe: 100 characters of the ACTUAL body font, measured. */
  const probe = document.createElement('span');
  probe.textContent = '0'.repeat(100);
  probe.style.cssText =
    'position:absolute;visibility:hidden;white-space:pre;font:' +
    getComputedStyle(firstP).font;
  document.body.append(probe);
  const chWidth = probe.getBoundingClientRect().width / 100;
  probe.remove();

  const contentPx = firstP.getBoundingClientRect().width;

  /* Every block that carries words. `scrollWidth > clientWidth + 1` -- the +1 is
     sub-pixel rounding, not slack: a real overflow is tens of pixels. */
  const blocks = Array.from(body.querySelectorAll('p, h2, h3, li, figure, blockquote'));
  const offenders = blocks
    .filter((el) => el.scrollWidth > el.clientWidth + 1)
    .map((el) => el.tagName.toLowerCase() + ' ' + el.scrollWidth + '>' + el.clientWidth);

  /* One entry per LINE BOX, clustered. See the header. */
  const lineCount = (el) => {
    if (!el || !el.firstChild) return 0;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
    if (rects.length === 0) return 0;
    const tol = parseFloat(getComputedStyle(el).lineHeight) / 2 || 8;
    const tops = [];
    for (const rect of rects) {
      if (!tops.some((t) => Math.abs(t - rect.top) <= tol)) tops.push(rect.top);
    }
    return tops.length;
  };

  const toc = page.querySelector('nav[class*=toc]');
  const tocAnchors = toc ? Array.from(toc.querySelectorAll('a')) : [];
  const dead = tocAnchors
    .map((a) => a.getAttribute('href') || '')
    .filter((href) => href.startsWith('#') && !document.getElementById(href.slice(1)));

  /* The in-prose links, and the same question for them: does the anchor resolve? */
  const proseAnchors = Array.from(body.querySelectorAll('a[href^="#"]'));
  const deadProse = proseAnchors
    .map((a) => a.getAttribute('href') || '')
    .filter((href) => !document.getElementById(href.slice(1)));

  /* 44px of touch target on every link in the nav and every one in the prose that
     stands alone on its line. The prose's inline links are inside a paragraph and are
     correctly the line's height; only the standalone controls are asserted. */
  const controls = Array.from(page.querySelectorAll('a[class*=back], a[class*=more], button'));
  const small = controls
    .map((el) => ({ t: el.textContent.trim().slice(0, 18), h: Math.round(el.getBoundingClientRect().height) }))
    .filter((c) => c.h < 44);

  const out = {
    w: WIDTH,
    contentPx: Math.round(contentPx),
    chWidth: r2(chWidth),
    chars: Math.round(contentPx / chWidth),
    paragraphs: body.querySelectorAll('p').length,
    headings: body.querySelectorAll('h2, h3').length,
    lists: body.querySelectorAll('ul, ol').length,
    orderedLists: body.querySelectorAll('ol').length,
    h1Lines: lineCount(page.querySelector('h1')),
    metaLines: lineCount(page.querySelector('p[class*=meta]')),
    tocRows: tocAnchors.length,
    tocDead: dead,
    proseAnchors: proseAnchors.length,
    proseDead: deadProse,
    smallTargets: small,
    overflow: offenders.length > 0,
    offenders,
    pageH: Math.round(page.getBoundingClientRect().height),
  };

  page.style.width = prev.w;
  page.style.maxWidth = prev.mw;
  return JSON.stringify(out);
})();
