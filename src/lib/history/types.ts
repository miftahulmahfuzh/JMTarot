/**
 * The history row shapes, reachable from the client.
 *
 * WHY THEY ARE NOT DECLARED IN `queries/history.ts`, WHICH IS WHERE THEY ARE
 * CONSTRUCTED. `src/lib/clientBoundary.test.ts` forbids ANY `@/lib/db/`
 * specifier in a `'use client'` file, and its regex is
 * `(?:from|import)\s+['"]([^'"]+)['"]` -- it does not know about the `type`
 * keyword, so even an import that is erased at build time fails it.
 * `HistoryItemRow` and `HistoryBrowser` are client components and both have to
 * name `HistoryItem`.
 *
 * Declaring the shapes here and having `queries/history.ts` import THEM keeps one
 * definition and one fence. The query module remains the only place that
 * constructs one; this file is types and nothing else, so it costs the browser
 * bundle nothing at all.
 *
 * This module imports only `@/data/types`, which itself has no imports.
 */
import type { Locale, ReaderId, ReadingStatus, ServiceId, YesNo } from '@/data/types';

/** One card of a past draw, as `reading_cards` stores it. */
export type HistoryCard = {
  /** 0..21. */
  cardId: number;
  reversed: boolean;
  /** 0-based slot in the spread. */
  position: number;
};

/**
 * One row of the history list.
 *
 * **NO `body` AND NO `gist`, AND THAT ABSENCE IS THE POINT (H10).** This object
 * lands in the browser, and shipping Indonesian prose into an English client is
 * what VD8 forbids whether or not anything renders it. It is also kilobytes per
 * row for text no row draws, and it keeps a reading out of any log that ever
 * quotes this response. `hasBody` is the boolean the row actually needs, and it
 * is computed in SQL.
 *
 * `localDate` IS A STRING AND `createdAtIso` IS A STRING, for two different
 * reasons that are both worth knowing:
 *
 *   - `localDate` is the QUERENT'S calendar day (roadmap §7). A `Date` renders in
 *     the server's zone and is a day out for anyone in Jakarta between midnight
 *     and 07:00. There is an integration test that fails if anyone "fixes" the
 *     column to `mode: 'date'`, and this type is the same rule one layer up.
 *   - `createdAtIso` is a real instant and a `Date` would be defensible -- but
 *     this object arrives over JSON from `/api/history` on one path and out of an
 *     RSC payload on the other, and one shape for both paths is worth more than
 *     the type. Parse it at the point of formatting.
 */
export type HistoryItem = {
  id: string;
  readerId: ReaderId;
  serviceId: ServiceId;
  /** `'YYYY-MM-DD'`. The querent's own day. */
  localDate: string;
  /** ISO 8601. */
  createdAtIso: string;
  /** The language the PROSE came out in. Immutable (VD7). NOT the viewer's. */
  locale: Locale;
  status: ReadingStatus;
  /** `effectiveYesNo()`'s machine verdict, stored at draw time. Never re-derived. */
  verdict: YesNo | null;
  /** The querent's own typed text, or null. */
  question: string | null;
  /**
   * The option the cards chose, when the question offered one. A word-bounded
   * SLICE of `question`, validated at draw time and never re-derived.
   *
   * **DISPLAY TEXT, UNLIKE `verdict` DIRECTLY ABOVE IT**, because there is no
   * closed set to tokenise `ayam` into — and therefore **never translated**, since
   * `question` is not translated on any surface either. `ReadingView` renders it
   * verbatim. See `readings.choice` in `schema.ts`.
   */
  choice: string | null;
  /** `body is not null`, computed in SQL. See the header for why not the body. */
  hasBody: boolean;
  /** ISO 8601, or null. V7 writes the column; V6 only reads it. */
  sharedAt: string | null;
  cards: HistoryCard[];
};

/**
 * The detail payload: the same row plus the prose.
 *
 * Structurally assignable to `ReadingViewData`, and there is a type-level
 * assertion in `ReadingView.test.tsx` that says so -- if these two drift, the
 * detail page stops compiling in a file that explains why.
 */
export type ReadingDetail = Omit<HistoryItem, 'hasBody'> & { body: string | null };
