/**
 * What Auto Format asks a model for, and what code does with the answer. **PURE.**
 *
 * v0.5.0 / the markdown editor,
 * `docs/plans/2026-07-31-blog-markdown-editor-design.md` §5. No `server-only`, no
 * provider, no prompt prose — this module is the VALIDATION half, and it is pure so its
 * every refusal is a unit test rather than a mock.
 *
 * ── THE MODEL RETURNS METADATA. IT NEVER RETURNS THE AUTHOR'S WORDS ─────────
 *
 * **THE LOAD-BEARING DECISION, AND IT IS THIS REPO'S EXISTING INSTINCT RATHER THAN A NEW
 * ONE.** `effectiveYesNo()` derives the verdict in code because letting the model choose
 * produced answers that contradicted the card. `validateChoice` returns *a slice of the
 * question, never the model's copy* — which is why it returns a string rather than a
 * boolean, *because a caller handed `true` would render the model's text*.
 * `blogSegments.ts` hides the structure from the model entirely so it cannot invent a
 * sixth kind, drop a `heading.id` or translate a `link.path`.
 *
 * Auto Format runs the other way — the model is being asked to ADD structure — so the
 * same protection has to be spelled differently: **the reply carries headings, anchors
 * and a description, and no prose that will be rendered as the article's body.** A
 * `parseMarkdown` result is already a valid document before the model is consulted, so
 * every arm of a failure here degrades to *that* rather than to a mangled one.
 *
 * ── WHAT IT REFUSES IS SHAPE, AND IT SAYS SO ────────────────────────────────
 *
 * `validateInsight`'s rule, verbatim in intent: *"a refusal is the good outcome"*, and
 * there is no cheap test for **"is this a good section heading"**. What is checkable is
 * that an index is in range, that it points at a heading, that an id is a slug, that a
 * description is inside the band the lint will judge it by, and that nothing arrives as
 * markdown. The honest instruments for the rest are the preview directly underneath the
 * button and the publish gate.
 *
 * ── WHY `adviceNeeded` EXISTS AT ALL ────────────────────────────────────────
 *
 * §5.3: content pasted out of Gemini or ChatGPT is already `##`-sectioned, so the common
 * case must cost **no model call**. `adviceNeeded` is the predicate that decides, and it
 * is pure and here rather than in the route so the decision is testable without a
 * provider. **`model_called` on `admin.blog_formatted` is the measurement that says
 * whether this predicate is earning its keep**: if it is true on nearly every press, the
 * parser is missing something and that is the fix rather than a bigger prompt.
 */
import type { Block } from '@/content/types';

/** The band `lint.ts`'s `description-band` judges by. Duplicated nowhere: imported below. */
export const DESCRIPTION_MIN = 80;
export const DESCRIPTION_MAX = 158;

/**
 * `lint.ts`'s `title-length` boundary, and `BlogDoc.title`'s *"under 110 characters —
 * Google's headline cap"*.
 *
 * **THE HARD LIMIT IS THE LINT'S, AND THE PROMPT ASKS FOR MUCH SHORTER.** Accepting up to
 * 110 means a title the lint would not warn about; asking for ~70 means a title that fits a
 * search result. Validating at the prompt's target instead would refuse titles that are
 * merely long, which costs the operator a title they could have shortened themselves.
 */
export const TITLE_MAX = 110;

/** A heading longer than this is a paragraph somebody mislabelled. */
const MAX_HEADING_CHARS = 90;

/** Above this many sections a model is restructuring rather than sectioning. */
const MAX_HEADINGS_ADDED = 12;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * What the model may return. **Metadata only — no `Block`, no `Phrasing`, no body text.**
 *
 * `at` is an index into the CURRENT body, and a heading is inserted BEFORE it. That is an
 * absolute position rather than a delta, so the model cannot express "shift everything
 * after here" and a mis-indexed entry damages one insertion rather than the document.
 */
export type FormatAdvice = {
  /** Insert a level-2 heading before `body[at]`. */
  headings: { at: number; text: string; id: string }[];
  /** Give the heading already at `body[at]` an English anchor id. */
  anchors: { at: number; id: string }[];
  /** The meta description, 80–158 characters. */
  description: string;
  /**
   * The article's `<h1>` and `<title>`, **in the article's own language**.
   *
   * Empty when none was asked for or none survived validation. **The caller uses it ONLY
   * when the title field is empty** — see the route. An admin who typed a title has made an
   * editorial decision, and a model overwriting it is the `user-edit` failure V8 records
   * against `personaStaleness`.
   */
  title: string;
};

/** Why the model is being consulted, or `null` when it is not. */
export type AdviceReason = 'no-title' | 'no-sections' | 'no-description' | 'derived-anchors';

/**
 * Which questions the parse left open. `[]` means **do not call a model.**
 *
 * Each reason is a thing code cannot answer:
 *
 *   `no-title`         the Judul field is empty. **The most common state there is**, because
 *                      an operator asks Gemini for an article and pastes the body — the
 *                      title is a separate question nobody thought to copy. Code cannot
 *                      answer it: a title is a reading of the whole article, and the first
 *                      heading is not one (it names section one, not the piece).
 *   `no-sections`      a wall of text has no `##` in it, and where the sections are is a
 *                      reading of the prose. Fewer than two level-2 headings, because one
 *                      heading is not an outline and the public page's own table of
 *                      contents needs more than two before it renders at all.
 *   `no-description`   the two lines Google prints. Absent or outside the band.
 *   `derived-anchors`  a heading whose id came from `slugify` rather than from a `{#…}`.
 *                      The four committed articles are `h2('what-tarot-is', 'Tarot itu
 *                      apa')` — English ids on Indonesian headings, which slugify cannot
 *                      produce and a human chose. An anchor is a permanent address.
 */
export function adviceNeeded(input: {
  body: readonly Block[];
  title: string;
  description: string;
  derivedAnchorAt: readonly number[];
}): AdviceReason[] {
  const out: AdviceReason[] = [];
  /*
   * **A TITLE IS ASKED FOR ONLY WHEN THE FIELD IS EMPTY**, never when it is merely long or
   * odd. The admin pastes an article and presses one button; a title they typed is a
   * decision, and the reason list is what stops the model being invited to revisit it.
   */
  if (input.title.trim() === '') out.push('no-title');
  const sections = input.body.filter((b) => b.kind === 'heading' && b.level === 2).length;
  if (sections < 2) out.push('no-sections');
  const d = input.description.trim().length;
  if (d < DESCRIPTION_MIN || d > DESCRIPTION_MAX) out.push('no-description');
  if (input.derivedAnchorAt.length > 0) out.push('derived-anchors');
  return out;
}

export type AdviceValidation = {
  /** Everything that survived. Never null, possibly empty on every field. */
  advice: FormatAdvice;
  /** What was thrown away, for the operator and for `admin.blog_formatted`. */
  rejected: string[];
};

/**
 * Keep the entries that are usable and name the ones that are not.
 *
 * **IT NEVER THROWS AND NEVER RETURNS `null`.** A malformed reply degrades to *no
 * advice*, and no advice leaves the parsed document exactly as `parseMarkdown` produced
 * it — which is already valid. That asymmetry is the whole reason this is safe: the
 * model's contribution is additive, so discarding all of it is a correct outcome rather
 * than a broken one.
 *
 * **BIASED TOWARDS REJECTING**, `validateChoice`'s rule: a false rejection costs a
 * heading the operator can type, and a false acceptance writes a permanent anchor or a
 * heading in the middle of a sentence.
 */
export function validateAdvice(raw: unknown, body: readonly Block[]): AdviceValidation {
  const rejected: string[] = [];
  const advice: FormatAdvice = { headings: [], anchors: [], description: '', title: '' };

  if (raw === null || typeof raw !== 'object') {
    return { advice, rejected: ['the reply was not an object'] };
  }
  const r = raw as Record<string, unknown>;

  /* ── headings ──────────────────────────────────────────────────────────── */
  const seenAt = new Set<number>();
  /*
   * **AN ANCHOR ID MUST BE UNIQUE IN THE DOCUMENT, AND A REAL MODEL BROKE THIS.** Handed a
   * document it could not section, glm-4.6 returned the SAME heading three times — `##
   * Three Septenaries` with one id — and the first version of this function accepted all
   * three because it only refused a repeated `at`.
   *
   * Two things go wrong and both are silent. `id` becomes a duplicate DOM id, which is
   * invalid HTML; and `blog/[slug]/page.tsx` builds its table of contents from
   * `headingIds`, so the reader gets three identical rows that all jump to the first one.
   *
   * The existing ids are seeded from the body, not just from this reply: a model adding a
   * section that collides with a heading the author already wrote is the same defect.
   */
  const seenIds = new Set(
    body.flatMap((b) => (b.kind === 'heading' && b.id !== undefined ? [b.id] : [])),
  );
  const seenText = new Set(
    body.flatMap((b) => (b.kind === 'heading' ? [b.text.trim().toLowerCase()] : [])),
  );
  for (const entry of Array.isArray(r.headings) ? r.headings : []) {
    if (advice.headings.length >= MAX_HEADINGS_ADDED) {
      rejected.push(`more than ${MAX_HEADINGS_ADDED} headings`);
      break;
    }
    if (entry === null || typeof entry !== 'object') {
      rejected.push('a heading that was not an object');
      continue;
    }
    const e = entry as Record<string, unknown>;
    const at = e.at;
    const text = typeof e.text === 'string' ? e.text.trim() : '';
    const id = typeof e.id === 'string' ? e.id.trim() : '';

    /*
     * **`body.length` IS REFUSED, AND THE FIRST VERSION OF THIS COMMENT ARGUED THE
     * OPPOSITE.** It said *"a heading appended after the last block is legitimate"*. It is
     * not: a heading is the title of the content that FOLLOWS it, so one at the very end
     * introduces nothing and renders as an empty section.
     *
     * **Measured on a live call.** Given the real three-paragraph paste, glm-4.6 returned
     * `at: 1, 2, 3` — and `3` is `body.length`, so the stored document ended
     * `…paragraph, heading` with a section that had no body. A reader sees a heading and then
     * the disclaimer. The valid range is therefore `[0, body.length - 1]`: every heading has
     * at least one block under it.
     */
    if (typeof at !== 'number' || !Number.isInteger(at) || at < 0 || at >= body.length) {
      rejected.push(`heading at an out-of-range index (${JSON.stringify(at)})`);
      continue;
    }
    if (text === '' || text.length > MAX_HEADING_CHARS) {
      rejected.push(`heading at ${at} is empty or longer than ${MAX_HEADING_CHARS} characters`);
      continue;
    }
    if (looksLikeMarkup(text)) {
      rejected.push(`heading at ${at} carries markdown`);
      continue;
    }
    if (!SLUG_RE.test(id)) {
      rejected.push(`heading at ${at} has a malformed anchor id (${JSON.stringify(e.id)})`);
      continue;
    }
    /*
     * **TWO HEADINGS AT ONE INDEX IS REFUSED RATHER THAN ORDERED.** Both are plausible
     * and the resulting order would be the model's array order, which is not a decision
     * it was asked to make. One heading per position, and the second is dropped by name.
     */
    if (seenAt.has(at)) {
      rejected.push(`a second heading at index ${at}`);
      continue;
    }
    /*
     * **THE DUPLICATE CHECK IS ON BOTH THE ID AND THE TEXT.** The id is the mechanical
     * failure — an anchor and a DOM id — and the text is the readable one: two sections
     * named the same thing is a document nobody would publish, and refusing it here is
     * cheaper than an operator noticing it in the preview and having to fix it by hand.
     */
    if (seenIds.has(id)) {
      rejected.push(`heading at ${at} repeats the anchor id "${id}"`);
      continue;
    }
    if (seenText.has(text.toLowerCase())) {
      rejected.push(`heading at ${at} repeats the title "${text}"`);
      continue;
    }
    seenAt.add(at);
    seenIds.add(id);
    seenText.add(text.toLowerCase());
    advice.headings.push({ at, text, id });
  }

  /* ── anchors ───────────────────────────────────────────────────────────── */
  for (const entry of Array.isArray(r.anchors) ? r.anchors : []) {
    if (entry === null || typeof entry !== 'object') {
      rejected.push('an anchor that was not an object');
      continue;
    }
    const e = entry as Record<string, unknown>;
    const at = e.at;
    const id = typeof e.id === 'string' ? e.id.trim() : '';
    if (typeof at !== 'number' || !Number.isInteger(at) || at < 0 || at >= body.length) {
      rejected.push(`anchor at an out-of-range index (${JSON.stringify(at)})`);
      continue;
    }
    /*
     * **AN ANCHOR MUST POINT AT A HEADING.** `heading.id` is the only place the union has
     * for one, so an index naming a paragraph is discarded rather than coerced — which is
     * `validateChoice`'s *refuse rather than reinterpret*.
     */
    if (body[at].kind !== 'heading') {
      rejected.push(`anchor at ${at} names a ${body[at].kind}, not a heading`);
      continue;
    }
    if (!SLUG_RE.test(id)) {
      rejected.push(`anchor at ${at} is malformed (${JSON.stringify(e.id)})`);
      continue;
    }
    advice.anchors.push({ at, id });
  }

  /* ── description ───────────────────────────────────────────────────────── */
  const description = typeof r.description === 'string' ? r.description.trim() : '';
  if (description !== '') {
    /*
     * **THE BAND IS THE LINT'S OWN, AND ACCEPTING OUTSIDE IT WOULD BE POINTLESS**: the
     * save would carry a `description-band` warning and the publish gate would refuse it.
     * A model that writes 40 characters has not written a meta description.
     */
    if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
      rejected.push(`description is ${description.length} characters, outside ${DESCRIPTION_MIN}–${DESCRIPTION_MAX}`);
    } else if (looksLikeMarkup(description)) {
      rejected.push('description carries markdown');
    } else if (description.includes('\n')) {
      rejected.push('description spans more than one line');
    } else {
      advice.description = description;
    }
  }

  /* ── title ─────────────────────────────────────────────────────────────── */
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  if (title !== '') {
    /*
     * **`TITLE_MAX` IS THE LINT'S BOUNDARY, NOT THE PROMPT'S TARGET.** See its declaration:
     * refusing at ~70 would reject a title that is merely long, which the operator can
     * shorten, and the whole point is to remove the blank field rather than to be fussy.
     *
     * **A NEWLINE IS REFUSED**, because this string is the `<h1>` AND the `<title>` tag: a
     * line break renders as a space in one and as nothing in the other, so the two would
     * disagree about a string `blog.content.test.ts` reads.
     */
    if (title.length > TITLE_MAX) {
      rejected.push(`title is ${title.length} characters, over ${TITLE_MAX}`);
    } else if (looksLikeMarkup(title)) {
      rejected.push('title carries markdown');
    } else if (title.includes('\n')) {
      rejected.push('title spans more than one line');
    } else {
      advice.title = title;
    }
  }

  return { advice, rejected };
}

/**
 * A heading or a description that arrived as markdown source.
 *
 * `insightPrompt`'s `format` refusal, narrowed to one line of text: these characters
 * render as literal punctuation in an `<h2>` or in a `<meta>` tag, which reads as a bug
 * in the site rather than as a model's habit. **`_` is deliberately absent** — it is
 * ordinary punctuation inside a URL-ish word and a heading is not parsed for emphasis
 * anyway; `#` is absent for the same reason mid-string, and caught by the leading test.
 */
function looksLikeMarkup(text: string): boolean {
  return (
    text.includes('**') ||
    text.includes('```') ||
    text.includes('|') ||
    /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>)/.test(text)
  );
}

/**
 * Splice validated advice into a parsed body. **CODE OWNS EVERY WORD OF PROSE.**
 *
 * Insertions are applied from the HIGHEST index down, so an earlier `at` is not shifted
 * by a later insertion. Doing it the other way round is the off-by-one that would put a
 * heading in the middle of the paragraph it was meant to introduce — and it would look
 * plausible in the preview, which is why the direction is stated rather than discovered.
 */
export function applyAdvice(body: readonly Block[], advice: FormatAdvice): Block[] {
  const out: Block[] = [...body];

  for (const a of advice.anchors) {
    const block = out[a.at];
    // Re-checked rather than trusted: `validateAdvice` took the same `body`, but this
    // function is exported and a second caller is a matter of time.
    if (block?.kind === 'heading') out[a.at] = { ...block, id: a.id };
  }

  for (const h of [...advice.headings].sort((x, y) => y.at - x.at)) {
    out.splice(h.at, 0, { kind: 'heading', level: 2, id: h.id, text: h.text });
  }

  return out;
}
