/*
 * Loop 4 over `/account`'s answer list and the sheet one row opens.
 *
 * THE MEASUREMENT IS A FILE RATHER THAN A HEREDOC for `blogfit.js`'s reason: this is
 * a hundred lines of JavaScript inside a shell string, and every `$` and backtick in
 * it would need escaping against the shell before Chrome ever sees it. A file is
 * `sed`-substituted for one token and passed whole.
 *
 * EXACT RATHER THAN APPROXIMATE, and that is the whole point of loop 4 here. Neither
 * Chrome in this WSL image gives a real phone width -- both floor at ~500px, so
 * `--window-size=320` lays out at 500 and merely CROPS. The row and the sheet are
 * container-driven (the label wraps, the mark keeps its column, the buttons wrap), so
 * constraining the section to a known inline size gives the answer a phone would.
 *
 * WHAT IT ANSWERS, in order of what would actually ship broken:
 *
 *   1. `overflow` — does anything stick out sideways at 320px? Six question titles
 *      are full sentences in both locales and `Hal paling berat yang pernah kamu
 *      saksikan` is the long one.
 *   2. `smallTargets` — is every control at least 44px tall? `PublicShare`'s 36px
 *      button is this release's counter-example, on twenty-three pages.
 *   3. `markWidths` — do the answered and unanswered marks occupy ONE column? If they
 *      differ, the six titles wrap at two widths and the list reads as ragged. That
 *      is the property `.markEmpty` exists for and it is invisible by eye when five
 *      of six rows are answered.
 */
(() => {
  const W = __WIDTH__;

  /* The section holding the six rows. Found by its heading rather than by a hashed
     CSS-module class name, which changes on every build. */
  const section = [...document.querySelectorAll('section')].find((s) =>
    s.querySelector('ul li button'),
  );
  if (!section) return { error: 'answers section not found — is there a session?' };

  const prev = section.style.width;
  section.style.width = `${W}px`;
  /* Forces layout before anything is read. Without it the first width measured is
     the pre-constraint one and every number is a lie. */
  void section.offsetWidth;

  const rows = [...section.querySelectorAll('ul li')];
  const buttons = [...section.querySelectorAll('ul li button')];

  const offenders = [];
  const smallTargets = [];
  const markWidths = new Set();

  for (const el of [section, ...rows, ...buttons]) {
    if (el.scrollWidth > el.clientWidth + 1) {
      offenders.push(`${el.tagName.toLowerCase()} ${el.scrollWidth}>${el.clientWidth}`);
    }
  }

  for (const b of buttons) {
    const r = b.getBoundingClientRect();
    if (r.height < 44) smallTargets.push(`row ${Math.round(r.height)}px`);
  }

  for (const b of buttons) {
    const mark = b.lastElementChild;
    if (mark) markWidths.add(Math.round(mark.getBoundingClientRect().width));
  }

  /* Every rendered question title, so a locale whose labels are longer is visible as
     a number rather than as a hunch. */
  const titleLines = buttons.map((b) => {
    const label = b.firstElementChild;
    const r = label.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(label).lineHeight) || 24;
    return Math.round(r.height / lh);
  });

  const out = {
    width: W,
    rows: rows.length,
    overflow: offenders.length > 0,
    offenders,
    smallTargets,
    /* ONE VALUE MEANS ONE COLUMN. More than one and the marks are not aligned. */
    markWidths: [...markWidths],
    maxTitleLines: Math.max(...titleLines),
    titleLines,
  };

  section.style.width = prev;
  return out;
})();
