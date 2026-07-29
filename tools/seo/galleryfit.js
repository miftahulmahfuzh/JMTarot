/*
 * Loop 4's measurement for `/gallery`, evaluated in a real Chrome by
 * `tools/seo/galleryfit.sh`. `__WIDTH__` is substituted before it is sent.
 *
 * ── IT IS A FILE AND NOT A HEREDOC IN THE SHELL SCRIPT, FOR ONE MEASURED REASON
 *
 * The first version lived inside a double-quoted bash argument and HUNG the harness
 * -- no error, no output, a three-minute timeout that looks exactly like Chrome
 * being wedged. Every fragment of it worked when sent on its own. Passing
 * JavaScript containing backticks, `??`, regex literals and `${}` through bash
 * quoting is a class of bug with no useful diagnostics, and a harness that fails
 * mysteriously is a harness nobody runs. One `sed` substitution, no quoting.
 *
 * ── WHAT IT MEASURES, AND THE ONE METRIC THAT WAS WRONG FIRST ────────────────
 *
 * `nameLines` is counted with a `Range` over the text node, NOT as
 * `height / lineHeight`. The first version did the division and reported THREE
 * lines for every card at every width -- `CardFace`'s `.name` carries padding, so
 * that ratio measures the box and not the text. A metric that is confidently wrong
 * is worse than no metric: the number it produced would have failed the "no card
 * name wraps past two lines" check on a page where nothing wraps at all.
 * `getClientRects()` on a Range returns one rect per LINE BOX, which is the thing
 * being claimed.
 */
(() => {
  const WIDTH = __WIDTH__;

  const shell = document.querySelector('main[class*=shell]');
  const grid = document.querySelector('main ul[class*=grid]');
  if (!shell || !grid) return JSON.stringify({ error: 'no shell or grid' });

  /* Constrain the SHELL, not the grid: the grid's width is DERIVED from the
     shell's content box, and the shell is what a phone varies. The 16px of side
     padding is already in the stylesheet, so the content box comes out at
     WIDTH - 32 exactly as S3's table predicts. */
  const prev = { w: shell.style.width, mw: shell.style.maxWidth };
  shell.style.width = WIDTH + 'px';
  shell.style.maxWidth = WIDTH + 'px';
  void shell.offsetWidth;

  const r2 = (n) => Math.round(n * 100) / 100;
  const tiles = Array.from(grid.children);
  const cardRect = tiles[0].querySelector('div[class*=card]').getBoundingClientRect();
  const loreH = Math.round(
    tiles[0].querySelector('a[class*=lore]').getBoundingClientRect().height,
  );

  /* Rows, by grouping tile tops. ELEVEN GROUPS OF EXACTLY TWO is the whole of
     "every row full, nothing spilling below" -- and it is a different claim from
     "nothing overflows", which is why both are here. */
  const rows = new Map();
  for (const t of tiles) {
    const top = Math.round(t.getBoundingClientRect().top);
    rows.set(top, (rows.get(top) || 0) + 1);
  }

  /* One rect per LINE BOX. See the header: the division this replaced was wrong. */
  const lineCount = (el) => {
    if (!el || !el.firstChild) return 0;
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getClientRects().length;
  };
  const nameLines = tiles.map((t) => lineCount(t.querySelector('div[class*=name]')));

  /*
   * Overflow, at every level under the shell.
   *
   * `.srOnly` IS EXCLUDED AND IT IS NOT A CHEAT. It is a 1px box with
   * `white-space: nowrap` holding the card's name -- so `scrollWidth >
   * clientWidth` is TRUE BY DESIGN for all 22 of them, and it is what makes 22
   * lore links distinguishable to a screen reader without breaking Label in Name.
   * Counting them would put 22 permanent offenders in every run and the real one
   * would be invisible. Identified by computed `position: absolute` + `clip-path`,
   * not by class name, so a renamed class does not silently re-include them.
   */
  const offenders = [];
  for (const el of shell.querySelectorAll('*')) {
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'absolute' && cs.clipPath !== 'none') continue;
    const cls = el.className ? String(el.className).split(' ')[0].split('__').pop() : '';
    offenders.push(el.tagName.toLowerCase() + (cls ? '.' + cls : '') +
      ' ' + el.scrollWidth + '>' + el.clientWidth);
  }

  /* `innerText`, NEVER `textContent`: V6 paid for this. `textContent` includes
     script contents, and the RSC flight payload carries the whole serialised
     catalog on every page in this app, so it matches every key. */
  const text = document.body.innerText;
  const disclaimers = (text.match(/Untuk hiburan semata|For entertainment only/g) || []).length;

  const out = {
    w: WIDTH,
    tiles: tiles.length,
    rows: rows.size,
    perRow: Array.from(new Set(rows.values())),
    col: r2(cardRect.width),
    cardH: r2(cardRect.height),
    ratio: r2(cardRect.height / cardRect.width),
    gridH: Math.round(grid.getBoundingClientRect().height),
    loreH: loreH,
    nameLines: Array.from(new Set(nameLines)).sort(),
    overflow: grid.scrollWidth > grid.clientWidth + 1,
    offenders: offenders.slice(0, 6),
    hrefs: new Set(
      tiles.map((t) => t.querySelector('a[class*=lore]').getAttribute('href')),
    ).size,
    alts: new Set(tiles.map((t) => t.querySelector('img').getAttribute('alt'))).size,
    disclaimers: disclaimers,
  };

  shell.style.width = prev.w;
  shell.style.maxWidth = prev.mw;
  return JSON.stringify(out);
})()
