/**
 * Markdown <-> `Block[]`. **PURE. NO MODEL, NO DEPENDENCY, NO `server-only`.**
 *
 * v0.5.0 / the markdown editor, `docs/plans/2026-07-31-blog-markdown-editor-design.md`
 * §4. This module is what lets `/admin/blog` become three fields and a paste box.
 *
 * ── MARKDOWN IS A PROJECTION OF THE DOCUMENT, NEVER THE RECORD OF IT ────────
 *
 * **THE LOAD-BEARING SENTENCE, AND THE ONLY REASON DELETING `BlockEditor` IS SAFE.**
 * Nothing stores markdown. `blog_post_locales.body` stays `Block[]`, `Prose` stays the
 * one renderer, and the text in the editor's `<textarea>` is reconstructed from the
 * stored blocks by `serializeMarkdown` on every page load.
 *
 * So A-D10's CSP argument is untouched: there is **no `markdown` block kind, no `raw`,
 * no `html`, and no `dangerouslySetInnerHTML`** anywhere on this path. A markup-carrying
 * block is *"a permanent new reason the policy can never be enforced"*, and an admin
 * page is not an exception to it. And the copy lint keeps its guarantee, because
 * `plainText()` still reads the stored blocks and still joins spans with the empty
 * string.
 *
 * ── NO `server-only`, AND NO MARKDOWN LIBRARY ───────────────────────────────
 *
 * No marker, because the editor is a client component and the parse must run on paste
 * with no round trip — the whole point is that a well-formed paste needs no server and
 * no model at all. The fence that still applies is `clientBoundary.test.ts`'s over
 * `@/content/**`; this file imports only the TYPES from there, which is the same split
 * `content/types.ts` documents: **the SHAPE crosses the boundary, the CONTENT does not.**
 *
 * A markdown *library* is refused twice over. §9.7 already forbids one as a new runtime
 * dependency. The second reason is worse: a general parser produces constructs this
 * union has no home for — tables, images, HTML blocks, footnotes, reference links,
 * setext headings — and every one of them would have to be silently dropped on the way
 * in. **A parser that knows five block kinds refuses nothing silently, because anything
 * it cannot classify is a paragraph**, which is a visible outcome in the preview.
 *
 * ── THE PROPERTY THAT IS ASSERTED, AND THE ONE THAT IS NOT ──────────────────
 *
 *   parseMarkdown ∘ serializeMarkdown   IS identity, up to `normalizePhrasing`.
 *   serializeMarkdown ∘ parseMarkdown   is NOT, and must not be forced to be.
 *
 * The second direction normalises formatting — `_em_` becomes `*em*`, `2.` becomes the
 * next ordinal, a run of blank lines becomes one. Forcing it would mean preserving the
 * author's whitespace, which is a second representation of the document to keep
 * correct.
 *
 * The first direction is the safety net for deleting the block editor, and it is
 * asserted over the four committed articles as fixtures (`markdown.test.ts`). **They
 * use every span kind and every block kind except `quote`, contain zero bare-string
 * paragraphs and zero newlines inside a span** — measured, not assumed — so for those
 * four `normalizePhrasing` is the identity and the round trip is exact.
 *
 * ── `normalizePhrasing` IS THE ONE THING THE ROUND TRIP CHANGES ─────────────
 *
 * `Phrasing` is `string | Inline[]`, and both forms render the same bytes: `Prose`'s
 * `spans()` handles each, and React emits `{'abc'}` and `{['abc']}` identically. The
 * plain string is what the forty-four lore documents use and `blocks.ts` is right that
 * it is not legacy — but **markdown cannot tell the two apart**, because they serialize
 * to the same characters.
 *
 * So the parser always emits `Inline[]`, and a stored bare-string paragraph is promoted
 * the first time it passes through here. That is a real change to a stored row and it is
 * declared rather than hidden: `markdown.test.ts` asserts it changes no rendered byte
 * and no linted string, by comparing `plainText()` across the promotion. **Promoting is
 * the safe direction; collapsing is not** — a paragraph of one `text` span may be one
 * the author is about to add emphasis to, and `Inline[]` is the shape the editor
 * produces for everything else anyway.
 *
 * ── THE SPAN-ADJACENCY TRAP IS MOSTLY RETIRED BY THIS FILE ──────────────────
 *
 * A6-31's middle-dot strip exists because an HTML form field shows a trailing space no
 * more than it trims one, so `para(s('Lihat '), link('/gallery', 'galeri'))` renders
 * `Lihatgaleri` when the space is dropped and nothing on screen says so. **In markdown
 * the space is in the text, in the position a diff would show it** — `Lihat [galeri](…)`
 * — and `parseMarkdown` cannot produce a glued pair from it at all.
 *
 * `spansSeparate` and the save-time refusal are untouched. This file does not import
 * them: it has no opinion to express, because the shape it produces cannot trip them.
 */
import type { Block, Inline, Phrasing } from '@/content/types';

/**
 * The `{#anchor-id}` suffix on a heading. **NOT DECORATION, AND THE FOUR COMMITTED
 * ARTICLES ARE THE PROOF.**
 *
 * They are written `h2('what-tarot-is', 'Tarot itu apa')` — English ids on Indonesian
 * headings, which `slugify` cannot produce from the text. An anchor is an INTERFACE:
 * `/blog/x#myths-and-facts` is linked from elsewhere, `blogSegments.walk` copies
 * `heading.id` through untouched so both locales share one anchor set, and
 * `LAUNCH_ARTICLE_RULES`'s `orientation-anchors` refuses a publish without three of them
 * by name.
 *
 * **A markdown form that could not express a manual id would make every existing
 * article unopenable without losing its anchors**, which is the round trip failing on
 * the only documents that exist.
 */
const HEADING_RE = /^(#{2,3})\s+(.*?)(?:\s*\{#([a-z0-9-]+)\})?\s*$/;

/** `- item`. A `*` bullet is accepted on input and never emitted. */
const UL_RE = /^[-*]\s+(.*)$/;
/** `1. item`. The number is read for nothing but the fact that it is a number. */
const OL_RE = /^\d+\.\s+(.*)$/;
/** `> text`. */
const BQ_RE = /^>\s?(.*)$/;

/**
 * The characters a backslash may escape. **THE ROUND TRIP DOES NOT HOLD WITHOUT THEM,
 * AND THE FIRST DRAFT OF THIS FILE USED A REGEX AND SHIPPED TWO HOLES.**
 *
 * A `text` span is allowed to contain any character, and two of them are markdown:
 *
 *   1. **`a * b * c`** — a regex `\*([^*]+)\*` reads `* b *` as emphasis, so a stored
 *      paragraph about multiplication comes back with an `em` span in it.
 *   2. **a paragraph beginning `- ` or `## ` or `1. `** — serialized at the start of a
 *      line it becomes a list, a heading or an ordered list on the way back.
 *
 * Neither is likely in an article and both are silent, which is the combination that
 * makes them worth code rather than a caveat: the failure is a document quietly
 * changing shape when the author opens it, and the author's evidence that it happened is
 * the preview they are not looking at yet.
 *
 * `.` is here for the ordered-list case, which escapes as `1\.` — markdown's own
 * spelling. Escaping the digit instead would be inventing a syntax.
 */
const ESCAPABLE = new Set(['\\', '*', '_', '[', ']', '(', ')', '#', '>', '-', '.']);

/** What `serializeSpans` escapes inside a `text` span. A subset of `ESCAPABLE`. */
const ESCAPE_IN_TEXT = /[\\*_[\]]/g;

/**
 * A `cardRef`, recognised EXACTLY rather than heuristically.
 *
 * `Prose` renders `cardRef` as a whole `<p>` containing one link to
 * `/arcana/<slug>` — so a paragraph whose *entire* content is such a link is
 * byte-identically what `cardRef` produces, and reading it back as one loses nothing. A
 * paragraph containing that link **plus other text** stays a paragraph with a `link`
 * span, which is also exactly what it renders as. **Neither reading is lossy, and the
 * near-miss is a test case** — the tempting heuristic is "contains an `/arcana/` link",
 * which would swallow the six `/arcana/…` links inside the launch articles' prose.
 */
const ARCANA_RE = /^\/arcana\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * Lowercase-hyphens from a heading's own words. **The same function the block editor
 * had**, moved here because the parser is now the thing that needs it: a heading with no
 * id is a section missing from its own table of contents, with nothing on screen looking
 * wrong.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * A bare string becomes one `text` span; an `Inline[]` is returned as-is.
 *
 * Exported because the round-trip test states its property in terms of this, and
 * because a caller comparing a stored row against a parsed one needs the same
 * normalisation the parser applies. See the header.
 */
export function normalizePhrasing(p: Phrasing): Inline[] {
  return typeof p === 'string' ? [{ kind: 'text', text: p }] : p;
}

/** Every `Phrasing` in a document, normalised. For the round-trip assertion. */
export function normalizeBlocks(blocks: readonly Block[]): Block[] {
  return blocks.map((b): Block => {
    switch (b.kind) {
      case 'paragraph':
        return { kind: 'paragraph', text: normalizePhrasing(b.text) };
      case 'list':
        return { ...b, items: b.items.map(normalizePhrasing) };
      default:
        return b;
    }
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * PARSE
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Markdown to blocks. **NEVER THROWS, AND NEVER DROPS A LINE.**
 *
 * A paste is the author's work and a parser that refuses it loses it. Anything this
 * function cannot classify becomes a paragraph, which is a visible outcome in the
 * preview rather than a silent omission — the same instinct as `chain.ts` returning null
 * on the request path instead of throwing.
 *
 * **`\r\n` IS NORMALISED FIRST.** A paste from a browser on Windows carries them, and a
 * `\r` surviving into a `text` span would sit in the stored JSON while rendering as
 * nothing — so `plainText()` and the rendered page would disagree about a string the
 * copy lint reads, which is the one guarantee R16 granted `Inline[]` on.
 */
export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const text = heading[2].trim();
      out.push({
        kind: 'heading',
        level: heading[1].length === 3 ? 3 : 2,
        // An explicit `{#id}` wins; otherwise derived, and never left empty.
        id: heading[3] ?? slugify(text),
        text,
      });
      i++;
      continue;
    }

    const bq = BQ_RE.exec(line);
    if (bq) {
      const run: string[] = [];
      while (i < lines.length) {
        const m = BQ_RE.exec(lines[i]);
        if (!m) break;
        run.push(m[1]);
        i++;
      }
      out.push(quoteFrom(run));
      continue;
    }

    const ul = UL_RE.exec(line);
    const ol = OL_RE.exec(line);
    if (ul || ol) {
      const ordered = ol !== null;
      const items: Phrasing[] = [];
      while (i < lines.length) {
        const m = ordered ? OL_RE.exec(lines[i]) : UL_RE.exec(lines[i]);
        if (!m) break;
        items.push(parseSpans(m[1]));
        i++;
      }
      /*
       * **`ordered: false` IS WRITTEN EXPLICITLY, NOT OMITTED.** The field is optional
       * and absent means unordered, but `blocks.ts`'s `bullets()` writes it so a reader
       * of the data sees it — and the round trip has to reproduce what is stored, not a
       * defensible equivalent of it.
       */
      out.push({ kind: 'list', ordered, items });
      continue;
    }

    /*
     * A PARAGRAPH IS A RUN OF LINES UP TO A BLANK ONE OR THE NEXT BLOCK OPENER.
     * `splitRun` decides whether that run is ONE paragraph or several — see its header.
     */
    const run: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !opensABlock(lines[i])) {
      run.push(lines[i].trim());
      i++;
    }
    for (const para of splitRun(run)) out.push(paragraphFrom(para));
  }

  return out;
}

const opensABlock = (line: string): boolean =>
  HEADING_RE.test(line) || BQ_RE.test(line) || UL_RE.test(line) || OL_RE.test(line);

/**
 * A line that ends where a sentence ends. `.`, `!`, `?`, `…`, optionally closed by a quote
 * or a bracket — `… diri sendiri.`, `… (RWS).`, `… "Rider-Waite".`
 */
const SENTENCE_END = /[.!?…]["'”’)\]]*$/;

/**
 * One run of consecutive non-blank lines → one paragraph, or several.
 *
 * ── THE BUG THIS EXISTS TO FIX, AND IT WAS FOUND ON REAL PASTED CONTENT ─────
 *
 * **A PASTE OUT OF GEMINI OR CHATGPT SEPARATES PARAGRAPHS WITH ONE NEWLINE, NOT A BLANK
 * ONE.** Markdown says a single newline CONTINUES a paragraph, so the first version of this
 * parser joined the whole article into one block: measured on a real three-paragraph paste,
 * **3 lines and 0 blank lines became ONE paragraph of 2,292 characters.**
 *
 * That is not a cosmetic defect, it is what made Auto Format useless on the exact input it
 * exists for. `applyAdvice` can only insert a heading BETWEEN blocks, so a document with one
 * block has exactly two legal positions — **the model was being asked to find the sections of
 * a document that had no internal boundaries**, and what came back was repeated headings
 * around one blob. The model was not the problem; it was handed an impossible task.
 *
 * ── THE DISCRIMINATOR, AND WHY IT IS NOT A GUESS ────────────────────────────
 *
 * Both shapes are common and they are distinguishable:
 *
 *   HARD-WRAPPED prose (a text editor at 80 columns) breaks mid-sentence, so its interior
 *   lines do NOT end with sentence punctuation. Only the last one does.
 *
 *   PARAGRAPHS-PER-LINE (a chat UI, a CMS textarea) end every line with a full stop, because
 *   each line is a complete paragraph.
 *
 * So: **if EVERY line in the run ends a sentence, each line is its own paragraph; otherwise
 * the run is joined.** A hard-wrapped paragraph cannot satisfy that unless every one of its
 * wrapped lines happens to break exactly on a full stop, which does not happen in prose.
 *
 * A one-line run is returned unchanged either way, so the common case is untouched.
 */
function splitRun(run: readonly string[]): string[] {
  if (run.length < 2) return [run.join(' ')];
  return run.every((line) => SENTENCE_END.test(line)) ? [...run] : [run.join(' ')];
}

/**
 * A `>` run becomes a `quote`. **The em-dash last line is the attribution.**
 *
 * `source` is REQUIRED by the union, for the reason `types.ts` gives: a quotation with
 * no attribution on a page making claims about a tradition is what reads as invented. So
 * a `>` run with no `—` line still has to produce one, and it produces the empty string
 * — which the union accepts, zod's `.min(1)` refuses, and the lint reports as
 * whitespace. **Three layers, and this is the one that must not guess**: inventing a
 * plausible source would be this file writing prose, which is the line R1 draws.
 */
function quoteFrom(run: readonly string[]): Block {
  const last = run.at(-1)?.trim() ?? '';
  const attributed = /^—\s*(.+)$/.exec(last);
  const bodyLines = attributed ? run.slice(0, -1) : run;
  return {
    kind: 'quote',
    text: bodyLines
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .join(' '),
    source: attributed ? attributed[1].trim() : '',
  };
}

/**
 * A paragraph, or a `cardRef` when it is nothing but an `/arcana/<slug>` link.
 * See `ARCANA_RE`.
 */
function paragraphFrom(text: string): Block {
  const spans = parseSpans(text);
  if (spans.length === 1 && spans[0].kind === 'link') {
    const card = ARCANA_RE.exec(spans[0].path);
    if (card) return { kind: 'cardRef', slug: card[1], text: spans[0].text };
  }
  return { kind: 'paragraph', text: spans };
}

/**
 * One line of inline markdown to spans. **Always at least one span.**
 *
 * **A HAND-ROLLED SCANNER RATHER THAN A REGEX, AND `ESCAPABLE` IS WHY.** A regex
 * alternation cannot be taught to skip an escaped delimiter without the placeholder
 * substitution that is itself a second escaping scheme to keep correct. Fifty lines that
 * read in one direction are the cheaper thing to own.
 *
 * An empty run returns one empty `text` span rather than `[]`: the block editor's
 * `emptySpan()` did the same, and an empty `Inline[]` is a paragraph that renders
 * nothing while satisfying every type.
 *
 * **AN UNCLOSED DELIMITER IS LITERAL TEXT, NEVER A REFUSAL.** `2 * 3` with one asterisk,
 * a `[` with no `](`, a `**` with no partner — all stay as typed. A parser that threw
 * here would lose a paste, and a parser that guessed would invent emphasis the author
 * did not write.
 *
 * **A LINK'S `path` IS NEVER TOUCHED HERE.** `badPath()` on the save path is what
 * decides whether it is allowed — an absolute URL, an uppercase segment, a `/en/`
 * prefix. This function's job is to find it, not to judge it, and a parser that
 * rewrote a path would be changing an address the author typed.
 */
export function parseSpans(text: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  let i = 0;

  const flush = () => {
    if (buf !== '') {
      out.push({ kind: 'text', text: buf });
      buf = '';
    }
  };

  while (i < text.length) {
    const c = text[i];

    if (c === '\\' && i + 1 < text.length && ESCAPABLE.has(text[i + 1])) {
      buf += text[i + 1];
      i += 2;
      continue;
    }

    if (c === '[') {
      const close = findUnescaped(text, ']', i + 1);
      if (close !== -1 && text[close + 1] === '(') {
        const end = findUnescaped(text, ')', close + 2);
        if (end !== -1) {
          flush();
          out.push({
            kind: 'link',
            path: unescapeText(text.slice(close + 2, end)),
            text: unescapeText(text.slice(i + 1, close)),
          });
          i = end + 1;
          continue;
        }
      }
    }

    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end !== -1 && end > i + 2) {
        flush();
        out.push({ kind: 'strong', text: unescapeText(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (c === '*' || c === '_') {
      const end = findUnescaped(text, c, i + 1);
      if (end !== -1 && end > i + 1) {
        flush();
        out.push({ kind: 'em', text: unescapeText(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    buf += c;
    i++;
  }

  flush();
  return out.length > 0 ? out : [{ kind: 'text', text: '' }];
}

/** The next `needle` at or after `from` that is not preceded by a backslash. */
function findUnescaped(text: string, needle: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === needle) return i;
  }
  return -1;
}

/** Drop one level of backslash escaping. The inverse of `ESCAPE_IN_TEXT`. */
function unescapeText(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\' && i + 1 < raw.length && ESCAPABLE.has(raw[i + 1])) {
      out += raw[i + 1];
      i++;
      continue;
    }
    out += raw[i];
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * SERIALIZE
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Blocks to markdown. **BLANK-LINE SEPARATED, ONE BLOCK PER PARAGRAPH RUN.**
 *
 * `{#id}` is emitted only when the id is NOT what `slugify` would derive, so a heading
 * whose anchor is already its own words stays clean in the textarea — and the four
 * committed articles, whose ids are English against Indonesian headings, all carry the
 * suffix. That asymmetry is the visible evidence of the rule, in the editor, where the
 * author can act on it.
 */
export function serializeMarkdown(blocks: readonly Block[]): string {
  return blocks.map(serializeBlock).join('\n\n').trimEnd() + '\n';
}

function serializeBlock(block: Block): string {
  switch (block.kind) {
    case 'heading': {
      const hashes = '#'.repeat(block.level);
      const id = block.id;
      const suffix = id !== undefined && id !== slugify(block.text) ? ` {#${id}}` : '';
      return `${hashes} ${block.text}${suffix}`;
    }
    case 'paragraph':
      // The ONLY block whose first character is ambiguous -- see `escapeLeading`. A list
      // item and a quote line already carry a marker that says what they are.
      return escapeLeading(serializeSpans(block.text));
    case 'list':
      return block.items
        .map((item, i) => `${block.ordered ? `${i + 1}.` : '-'} ${serializeSpans(item)}`)
        .join('\n');
    case 'quote': {
      const body = `> ${serializeSpans(block.text)}`;
      // The attribution line is emitted only when there is one, so an empty `source`
      // round-trips to an empty `source` rather than to a bare em dash.
      return block.source.trim() === '' ? body : `${body}\n> — ${block.source}`;
    }
    case 'cardRef':
      // The exact shape `paragraphFrom` reads back as a `cardRef`.
      return `[${block.text}](/arcana/${block.slug})`;
    default: {
      /* A sixth kind is a compile error here, never a silently unserialized block. */
      const unhandled: never = block;
      return unhandled;
    }
  }
}

export function serializeSpans(p: Phrasing): string {
  return normalizePhrasing(p)
    .map((span) => {
      switch (span.kind) {
        case 'text':
          return esc(span.text);
        /*
         * **THE EMPHASISED TEXT IS ESCAPED AND THE DELIMITERS ARE NOT.** `em`, `strong`
         * and a link's `text` are plain runs in this union -- there is no nesting -- so a
         * `*` inside one is a literal asterisk and has to survive as one.
         */
        case 'em':
          return `*${esc(span.text)}*`;
        case 'strong':
          return `**${esc(span.text)}**`;
        /*
         * `path` IS ESCAPED FOR `)` ALONE. `badPath()` already refuses uppercase, a
         * query, an absolute URL and a prefix, so the shapes that reach here are bare
         * lowercase paths and `#anchor`s -- but escaping nothing at all would make a
         * hypothetical `)` in a path unparseable, and this is the cheaper half of that
         * pair to get right.
         */
        case 'link':
          return `[${esc(span.text)}](${span.path.replace(/([\\)])/g, '\\$1')})`;
      }
    })
    .join('');
}

/** Backslash-escape the four characters that would otherwise be read as markup. */
const esc = (text: string): string => text.replace(ESCAPE_IN_TEXT, (c) => `\\${c}`);

/**
 * Escape a paragraph's first character when it would open a different block.
 *
 * **THE PARAGRAPH IS THE ONLY BLOCK THAT NEEDS THIS**, because it is the only one whose
 * markdown form carries no marker of its own: a stored paragraph reading *"- lima
 * kesalahan"* or *"1. tarik satu kartu"* or *"## bukan judul"* comes back as a list, an
 * ordered list or a heading. The block changes kind, the preview shows it, and nobody is
 * looking at the preview at the moment they open an article to fix a typo.
 */
function escapeLeading(line: string): string {
  if (/^#{1,6}(\s|$)/.test(line)) return `\\${line}`;
  if (/^[-*](\s|$)/.test(line)) return `\\${line}`;
  if (line.startsWith('>')) return `\\${line}`;
  // `1\. foo` -- markdown's own spelling. Escaping the digit would invent a syntax.
  return line.replace(/^(\d+)\.(\s|$)/, '$1\\.$2');
}
