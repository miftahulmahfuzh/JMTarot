/**
 * F6, task 1. What a bubble needs to draw an attached reading, and nothing else.
 *
 * ── PURE, AND CLIENT-IMPORTABLE, AND THAT IS THE WHOLE REASON THIS FILE EXISTS ──
 *
 * NO `server-only`, no prompt prose, no `process.env`, no `@/lib/db/**`. Its only
 * imports are `@/data/types` and `@/lib/history/types`, and both are type-only.
 *
 * `ReadingAttachment` is a `'use client'` component and has to name
 * `AttachmentPreview`. `clientBoundary.test.ts`'s import regex is
 * `(?:from|import)\s+['"]([^'"]+)['"]` — **it does not know the `type` keyword**, so
 * even an import erased at build time fails the fence. That is the identical
 * argument that put `HistoryItem` in `src/lib/history/types.ts` rather than in the
 * query module, one release earlier, and it is why the projection lives here and the
 * PROMPT block lives in `attachmentBlock.ts` beside it.
 *
 * The two files form the pair `@/lib/translate/keys` and `@/lib/translate/contract`
 * already form: the shape crosses the client boundary, the prose does not.
 *
 * ── WHAT IS DELIBERATELY ABSENT FROM `AttachmentPreview` ────────────────────────
 *
 * No `verdict`, no `choice`, no `status`, no `sharedAt`, no `body`. Each absence is a
 * decision and each is recorded on the type below. The sharpest is `body`: `[F6-8]`
 * is `HistoryItem`'s H10 rule with a chat log's multiplier on it — a bubble draws two
 * lines, so shipping 1,600 characters per bubble to draw two of them is the same
 * waste `HistoryItem` already refuses, once per message instead of once per row.
 */
import type { Locale, ReaderId, ReadingStatus, ServiceId } from '@/data/types';
import type { ReadingDetail } from '@/lib/history/types';

/**
 * How much prose a bubble carries. `[F6-8]`.
 *
 * 140 because the card clamps the snippet to two lines by CSS as well, and at
 * `--fs-hint` inside a 254px bubble (320px viewport, the binding width) two lines is
 * roughly 90 characters. The cap is therefore generous rather than tight: it bounds
 * the PAYLOAD, and the clamp bounds what is drawn. Both are needed — a CSS clamp
 * still shipped the bytes, and a payload cap alone would let a long first paragraph
 * push the card to four lines on a wide screen.
 *
 * **A CHARACTER COUNT OF PROSE, NOT OF THE RETURNED STRING.** The ellipsis is one
 * character past it, on purpose: making the total 140 would mean the cut moved
 * whenever somebody changed the marker, and the test asserts the prose half.
 */
export const ATTACHMENT_SNIPPET_MAX_CHARS = 140;

/** Appended when the snippet was cut. A single character, not three dots. */
const ELLIPSIS = '…';

/**
 * One card of the attached draw.
 *
 * **IDS, NEVER RESOLVED CARD OBJECTS** — H1's rule, which the history payload
 * already follows. A `Card` carries its name, its keywords and both meaning lines in
 * both locales; three of them per bubble in a scrolling log is kilobytes of data the
 * client can derive from an integer, and `cardById` is how it derives it.
 */
export type AttachmentCard = {
  /** 0..21. */
  cardId: number;
  reversed: boolean;
  /** 0-based slot in the spread. The renderer sorts by it; the payload may not be. */
  position: number;
};

/**
 * Everything the bubble draws. A projection of `readings`, and never more.
 *
 * ONE FIELD PER THING ON SCREEN, which is what makes §9's privacy paragraph
 * reviewable rather than believable: there is no field here whose presence is not
 * visible in the card.
 */
export type AttachmentPreview = {
  /** `readings.id`. The bubble's link target, and the POST body's field. */
  readingId: string;
  readerId: ReaderId;
  serviceId: ServiceId;
  /**
   * `'YYYY-MM-DD'`. **THE QUERENT'S calendar day, and A STRING, NEVER A `Date`.**
   * A `Date` renders in the server's zone and is a day out for anyone in Jakarta
   * between midnight and 07:00 — the trap `local_date` exists to prevent, and the
   * same rule `HistoryItem` states one layer down.
   */
  localDate: string;
  /**
   * **THE LANGUAGE THE PROSE CAME OUT IN.** Not the viewer's, not the run's.
   *
   * It decides the `lang` attribute on the snippet and whether the language chip
   * renders at all (§7.1). It is NOT the language of `question` — see that field.
   */
  locale: Locale;
  /**
   * The querent's own typed text, or null. **Never translated, on any surface.**
   *
   * And **never `lang`-attributed either**, which is `ReadingView`'s ruling and
   * CLAUDE.md's: `locale` above is the language the PROSE came out in, and a
   * querent may perfectly well type Indonesian into the English app. Labelling
   * their words with the model's language is a claim we cannot make.
   */
  question: string | null;
  /**
   * At most `ATTACHMENT_SNIPPET_MAX_CHARS` of the stripped body, plus an ellipsis.
   * `[F6-8]`. Built by `attachmentSnippet`, which is the only place the cut lives.
   */
  snippet: string;
  cards: AttachmentCard[];
};

/**
 * The first `ATTACHMENT_SNIPPET_MAX_CHARS` of a body, cut on a word boundary.
 *
 * **WHITESPACE IS COLLAPSED FIRST, AND THAT IS NOT COSMETIC.** A reading body is
 * paragraphs separated by blank lines, so the first 140 characters of the raw column
 * can spend four of them on a `\n\n` that renders as one space anyway. Collapsing
 * first means the budget buys words. It also makes the cut deterministic across the
 * two services: `daily`'s two paragraphs and `spread3`'s four produce the same shape.
 *
 * **A MID-WORD CUT IS AVOIDED THE WAY `memory.ts` AVOIDS IT** — `lastIndexOf(' ')`,
 * but only when the boundary is past 60% of the budget, so a body that is one very
 * long word is cut hard rather than returned empty. That threshold is copied
 * deliberately rather than invented: two functions in this repo cut prose to a
 * ceiling and they should behave the same way.
 *
 * **IT DOES NOT STRIP A `PILIHAN:` MARKER, AND THE COLUMN IS WHY.** `persistReading`
 * stores the body *after* `splitChoiceMarker` removed it (`## The choice verdict`),
 * so the column is the authority. `attachmentBlock` keeps a belt for that anyway —
 * because a marker reaching a MODEL gets quoted back at the querent in a reader's
 * voice, which is a worse failure than a marker reaching a bubble, and because that
 * module already imports the splitter for its own reasons. Adding the import here
 * would buy a second copy of a guarantee the write path already makes.
 */
export function attachmentSnippet(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  if (flat.length <= ATTACHMENT_SNIPPET_MAX_CHARS) return flat;

  const cut = flat.slice(0, ATTACHMENT_SNIPPET_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  const prose =
    lastSpace > ATTACHMENT_SNIPPET_MAX_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut;

  return `${prose.replace(/[\s,;:.\-–—]+$/, '')}${ELLIPSIS}`;
}

/**
 * `ReadingDetail` -> `AttachmentPreview`. The one place the projection lives.
 *
 * **IT TAKES THE TYPE `readingWithCards` ALREADY RETURNS**, so the query layer's
 * shape and the bubble's cannot drift — the argument `ReadingView.test.tsx` makes in
 * the other direction for `ReadingViewData`. §5.1 is the consequence: **F6 adds no
 * function to `src/lib/db/queries/**` and touches neither `chat.ts` nor
 * `history.ts`.** `readingWithCards` already takes its handle first, already
 * validates the uuid, already filters `blocked`, and already makes ownership a
 * `where` predicate (`[F6-6]`).
 *
 * A null `body` yields an empty snippet rather than throwing. It cannot happen for
 * an attachable reading — `attachable()` is the guard and the route applies it — and
 * a function on the render path that throws on a state its caller has excluded is a
 * 500 where there could have been an empty line.
 */
export function toAttachmentPreview(r: ReadingDetail): AttachmentPreview {
  return {
    readingId: r.id,
    readerId: r.readerId,
    serviceId: r.serviceId,
    localDate: r.localDate,
    locale: r.locale,
    question: r.question,
    snippet: r.body ? attachmentSnippet(r.body) : '',
    // Sorted here rather than in the renderer: a spread read out of order is the
    // reading rearranged, and `position` is the only thing that says which slot a
    // card was drawn into. The renderer sorts again, because a renderer that trusts
    // its props is one prop-drilling refactor from drawing the future first.
    cards: [...r.cards]
      .sort((a, b) => a.position - b.position)
      .map((c, i) => ({ cardId: c.cardId, reversed: c.reversed, position: i })),
  };
}

/**
 * May this reading be carried into the room? `[F6-12]`, the UI half.
 *
 * **`ok` ONLY, AND THE SERVER ACCEPTS `partial` TOO. THE ASYMMETRY IS DELIBERATE AND
 * IS THE ONLY SHAPE THAT IS NOT A LIE** (§2.3):
 *
 *   - `/history/[id]` KNOWS the status, and a `partial` body is prose that stops
 *     mid-sentence. `ShareFooter` refuses it because *"a stranger could not tell
 *     'the stream died' from 'this reader is incoherent'"* — three readers cannot
 *     tell either, and one of them will say so in a bubble.
 *   - The draw screen CANNOT know: its `done` means *"the stream ended normally as
 *     far as the browser is concerned"*, and the tee may independently have written
 *     `partial`. So the route accepts `partial`, or the button would be correctly
 *     offered and then refused — a control that works on most readings and fails on
 *     the ones where the app already went wrong once.
 *
 * **THE UI IS NEVER WIDER THAN THE SERVER**, which is the rule that makes the
 * asymmetry safe: a control that is offered always posts successfully.
 *
 * `failed` and `aborted` are refused everywhere — there is nothing for a reader to
 * talk about except the cards, and a room discussing readings that did not happen is
 * a room discussing the app. `blocked` is unreachable here (`readingWithCards`
 * filters it and `/history/[id]` 404s), and is refused by the same predicate anyway.
 *
 * **AND AN EMPTY BODY IS REFUSED, NOT ONLY A NULL ONE.** `status = 'ok'` with a body
 * of whitespace is not a state this app produces, and it is one `trim()` to make the
 * predicate say what it means rather than what the column happens to hold.
 *
 * A `Pick` rather than the whole row so `/history/[id]` and the route guard call the
 * same function without either of them having to hold a full `ReadingDetail`.
 */
export function attachable(r: Pick<ReadingDetail, 'status' | 'body'>): boolean {
  return r.status === 'ok' && r.body !== null && r.body.trim() !== '';
}

/**
 * The statuses the SERVER accepts, named so the route guard and the test that keeps
 * the two halves of `[F6-12]` in step can both read them from one place.
 *
 * F1 owns `POST /api/chat/message` and its guard; this is F6's half of D2, exported
 * rather than described in prose so the route cannot narrow or widen it by accident.
 */
export const ATTACHABLE_STATUSES: readonly ReadingStatus[] = ['ok', 'partial'];

/**
 * The server's predicate. Wider than `attachable()` by exactly `partial`.
 *
 * The pair is asserted in `attachmentView.test.ts`: every status `attachable()`
 * admits must be admitted here too, which is *"the UI is never wider than the
 * server"* written as a test rather than as a paragraph.
 */
export function attachablePosted(r: Pick<ReadingDetail, 'status' | 'body'>): boolean {
  return ATTACHABLE_STATUSES.includes(r.status) && r.body !== null && r.body.trim() !== '';
}
