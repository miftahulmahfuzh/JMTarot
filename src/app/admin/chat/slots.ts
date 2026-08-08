/**
 * `/admin/chat`'s fixed orders. **PURE: no React, no query, no `process.env`.**
 *
 * ── A SLOT IS RESOLVED FROM A DECLARED ORDER, NEVER FROM AN ARRAY INDEX (I-5) ──
 *
 * `slotColor` is the only indexer of `CATEGORICAL` in this repository and
 * `chart.contract.test.ts` asserts it. Everything here is an ORDER; the caller turns
 * one into a slot with `slotFor(entity, ORDER)`, which is what makes *"colour follows
 * the entity, never its rank"* structural rather than a convention. **It throws above
 * slot 3 rather than wrapping**, so a fifth category is a 500 rather than two entities
 * silently sharing a hue — A-D9's *"a fifth categorical hue is a reconciliation
 * question, not an authoring convenience"*, in code.
 *
 * ── THREE OF THE NINE PANELS NEED NO ORDER AT ALL, AND `[F7-10]`'s PREMISE WAS
 *    WRONG — MEASURED 2026-08-08 ─────────────────────────────────────────────
 *
 * The plan said a histogram is *"a `StackedBar` with one segment per row, and the
 * identity is carried by the row label"*. **It is not, and a 1440px screenshot is what
 * showed it.** `stackSegments` normalises every row to 100% of its OWN total, so a
 * one-segment row is ALWAYS full width: the beat histogram rendered `0 beat` as a full
 * bar beside five empty outlines, and the intent histogram rendered six identical empty
 * outlines. **The distribution — the entire content of those panels — encoded nothing.**
 *
 * That is the same property `/admin/page.tsx` already documents for durations
 * (*"three bars of duration would all fill the width and be mutually uncomparable"*),
 * and F7's plan asserted past it. **Only a screenshot shows this**, which is the third
 * time this dashboard has been told so.
 *
 * So the three distributions render as `InlineBars` — the page-local table furniture
 * `/admin/tokens` already uses for the thirteen ops: **a LENGTH encoding against the
 * row maximum, in ONE sequential hue, spending no categorical slot at all.** That is a
 * better fit than the plan's design rather than a concession: `[F7-16]` forbids a new
 * chart primitive, A-D9 forbids a fifth categorical hue, and a bar whose colour carries
 * nothing is legal on a nominal category where a value-ramp would not be.
 *
 * **THE EMPHASIS SLOTS ARE GONE WITH IT.** `0 beat`, `abandoned` and `ask` were each to
 * wear a second colour; the emphasis now lives where it was always going to be read —
 * in the `StatTile` beside each panel (`Kesenyapan`, `Rencana ditolak`, `Beat
 * bertanya`), which is a number rather than a hue somebody has to decode.
 */

/**
 * P1's colour dimension. **The reply is the colour and the TRIGGER is the row axis**
 * (`[F7-11]`, I-6: one entity dimension per chart): the question the panel answers is
 * *which trigger gets answered*, so the trigger has to be readable off the axis and the
 * two-value outcome is what colour can carry.
 */
export const REPLY_ORDER = ['replied', 'silent'] as const;

/** P2's two series. `reactive` is `trigger = 'user_message'`; `proactive` is the other
 *  four SUMMED, with the five-way split in the table (`[F7-10]`'s wall: five entities
 *  against four slots). */
export const RUN_KIND_ORDER = ['reactive', 'proactive'] as const;

/**
 * P4's colour dimension: **who the beat was aimed at.**
 *
 * `READER_SLOT` is deliberately NOT used here (`[F7-11]`). Keying colour to the reader
 * and the row to the target gives three one-segment bars in three colours — a legend
 * restating three axis labels — and the question the panel exists for (*does anybody
 * talk to anybody else?*) becomes invisible.
 */
export const TARGET_ORDER = ['querent', 'reader', 'none'] as const;

/** P6 and P7 share this order so the two panels agree about which colour is the
 *  director. Two lines on one axis is what un-averages `C-D5`'s two token shapes. */
export const CHAT_OP_ORDER = ['chat_plan', 'chat_turn'] as const;

/**
 * The five triggers, in the order the tables print them. **Not by rank** — `opRows`'
 * rule, because an order that changes with the data reads as the data changing.
 *
 * `user_message` first because it is the only reactive one; the four proactive sources
 * follow in the order F5's plan lists them.
 */
export const TRIGGER_ORDER = [
  'user_message',
  'reading_completed',
  'idle_nudge',
  'unanswered',
  'cron',
] as const;

/** The run lifecycle, in lifecycle order rather than in rank order. `pending` →
 *  `planning` → `running` → `done`, with `abandoned` last because it is the one the
 *  operator is looking for. */
export const STATUS_ORDER = ['pending', 'planning', 'running', 'done', 'abandoned'] as const;

/**
 * `BeatIntent`'s six members, **in F2's declared order and never by rank** (P5).
 *
 * A copy of `BEAT_INTENTS` rather than an import of it, and the duplication is the
 * point: `@/lib/chat/types` is a leaf F1 owns, and this is a RENDER order — the day
 * somebody wants `ask` printed first because it is the number the release is measured
 * by, that is a decision about this page and not about the union. `series.test.ts`
 * asserts the two sets are equal, so a seventh intent cannot render as nothing.
 */
export const INTENT_ORDER = [
  'answer',
  'ask',
  'react',
  'tease',
  'agree',
  'push_back',
] as const;

/**
 * The beat-count buckets, `0` through `4+`. Declared rather than derived from the query
 * so a bucket with no runs still gets a row: **a histogram missing its `0` bar is the
 * one shape this page must never render**, because a zero silence rate is the finding
 * (`C-R6`: *"a rate of zero means the director is not really deciding"*) and an absent
 * bar reads as no data.
 */
export const BEAT_BUCKETS = [0, 1, 2, 3, 4] as const;
