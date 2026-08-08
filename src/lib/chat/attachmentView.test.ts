import { describe, expect, it } from 'vitest';

import type { ReadingDetail } from '@/lib/history/types';
import {
  ATTACHABLE_STATUSES,
  ATTACHMENT_SNIPPET_MAX_CHARS,
  attachable,
  attachablePosted,
  attachedIdsIn,
  attachmentSnippet,
  attachmentsFrom,
  toAttachmentPreview,
} from './attachmentView';

/**
 * F6, task 1. The projection and the two predicates.
 *
 * Every function here is pure, which is why the workstream is shaped this way: the
 * bubble is a renderer, the block is a string, and the only interesting decisions are
 * a cut, a sort and two predicates that must not disagree with each other.
 */

const reading = (over: Partial<ReadingDetail> = {}): ReadingDetail => ({
  id: 'r1',
  readerId: 'margaret',
  serviceId: 'spread3',
  localDate: '2026-08-02',
  createdAtIso: '2026-08-02T12:40:00.000Z',
  locale: 'id',
  status: 'ok',
  verdict: null,
  question: 'mending resign apa bertahan tahun depan?',
  choice: 'bertahan',
  sharedAt: null,
  body: 'Yang udah lewat — The Tower terbalik.\n\nYang lagi jalan — The Hermit.',
  cards: [
    { cardId: 9, reversed: false, position: 1 },
    { cardId: 16, reversed: true, position: 0 },
    { cardId: 6, reversed: false, position: 2 },
  ],
  ...over,
});

describe('attachmentSnippet', () => {
  it('returns a short body unchanged', () => {
    expect(attachmentSnippet('cukup begitu saja')).toBe('cukup begitu saja');
  });

  it('collapses the paragraph breaks rather than spending the budget on them', () => {
    // The raw column is paragraphs separated by blank lines. Four characters of
    // `\n\n` render as one space and must not cost four of the 140.
    expect(attachmentSnippet('satu\n\ndua\n\ntiga')).toBe('satu dua tiga');
    expect(attachmentSnippet('  spasi   berlebih\t\tdi mana-mana ')).toBe(
      'spasi berlebih di mana-mana',
    );
  });

  it('cuts on a word boundary and appends one ellipsis', () => {
    const body = `${'kata '.repeat(60)}akhir`;
    const out = attachmentSnippet(body);

    expect(out.endsWith('…')).toBe(true);
    // The prose half is inside the cap; the ellipsis is the one character past it.
    expect(out.length - 1).toBeLessThanOrEqual(ATTACHMENT_SNIPPET_MAX_CHARS);
    // A word boundary, so nothing is cut mid-word.
    expect(out.slice(0, -1).endsWith('kata')).toBe(true);
    expect(out).not.toContain('kat…');
  });

  it('cuts a single very long word hard rather than returning nothing', () => {
    /*
     * The 60% threshold is what makes this work: with no space past character 84
     * there is no boundary worth honouring, and returning the empty string to avoid
     * a mid-word cut would give a bubble with no snippet at all.
     */
    const out = attachmentSnippet('a'.repeat(400));
    expect(out.length - 1).toBe(ATTACHMENT_SNIPPET_MAX_CHARS);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns the empty string for an empty body', () => {
    expect(attachmentSnippet('')).toBe('');
    expect(attachmentSnippet('   \n\n  ')).toBe('');
  });

  it('leaves no dangling punctuation before the ellipsis', () => {
    const body = `${'satu dua, '.repeat(30)}akhir`;
    const out = attachmentSnippet(body);
    expect(out).not.toMatch(/[,;:.\s]…$/);
  });
});

describe('toAttachmentPreview', () => {
  it('carries exactly the eight fields the bubble draws', () => {
    // Asserted on the KEY SET, not on a few values: the absences are the point
    // (`[F6-8]`, and no verdict / choice / status / sharedAt), and a new field
    // arriving silently is how a projection stops being one.
    expect(Object.keys(toAttachmentPreview(reading())).sort()).toEqual([
      'cards',
      'localDate',
      'locale',
      'question',
      'readerId',
      'readingId',
      'serviceId',
      'snippet',
    ]);
  });

  it('ships no body, no verdict, no choice, no status and no sharedAt', () => {
    const preview = toAttachmentPreview(reading({ verdict: 'yes', sharedAt: '2026-08-02' }));
    expect('body' in preview).toBe(false);
    expect('verdict' in preview).toBe(false);
    expect('choice' in preview).toBe(false);
    expect('status' in preview).toBe(false);
    expect('sharedAt' in preview).toBe(false);
  });

  it('sorts the cards into spread order and renumbers position from zero', () => {
    // The row arrives in whatever order the join produced. A spread read out of
    // order is the reading rearranged.
    expect(toAttachmentPreview(reading()).cards).toEqual([
      { cardId: 16, reversed: true, position: 0 },
      { cardId: 9, reversed: false, position: 1 },
      { cardId: 6, reversed: false, position: 2 },
    ]);
  });

  it('keeps the prose locale, which is not the viewer’s and not the question’s', () => {
    expect(toAttachmentPreview(reading({ locale: 'en' })).locale).toBe('en');
  });

  it('keeps `localDate` a string', () => {
    // A `Date` here is a day out for anyone in Jakarta between midnight and 07:00.
    expect(toAttachmentPreview(reading()).localDate).toBe('2026-08-02');
  });

  it('yields an empty snippet for a null body rather than throwing', () => {
    expect(toAttachmentPreview(reading({ body: null })).snippet).toBe('');
  });

  it('does not mutate the row it was handed', () => {
    const row = reading();
    const before = row.cards.map((c) => c.position);
    toAttachmentPreview(row);
    expect(row.cards.map((c) => c.position)).toEqual(before);
  });
});

describe('attachable, and the two halves of [F6-12]', () => {
  it('offers an `ok` reading with prose', () => {
    expect(attachable(reading())).toBe(true);
  });

  it('refuses `partial` in the UI and accepts it on the server', () => {
    // The asymmetry of §2.3, asserted rather than described: `/history/[id]` knows
    // the status and a `partial` body stops mid-sentence; the draw screen cannot
    // know, so refusing it at the route would mean a button offered and then
    // refused.
    const partial = reading({ status: 'partial' });
    expect(attachable(partial)).toBe(false);
    expect(attachablePosted(partial)).toBe(true);
  });

  it('refuses `failed`, `aborted` and `blocked` everywhere', () => {
    for (const status of ['failed', 'aborted', 'blocked'] as const) {
      const row = reading({ status });
      expect({ status, ui: attachable(row), server: attachablePosted(row) }).toEqual({
        status,
        ui: false,
        server: false,
      });
    }
  });

  it('refuses a null body and a whitespace-only one', () => {
    for (const body of [null, '', '   \n\n ']) {
      expect({ body, ok: attachable(reading({ body })) }).toEqual({ body, ok: false });
      expect({ body, ok: attachablePosted(reading({ body })) }).toEqual({ body, ok: false });
    }
  });

  it('IS NEVER WIDER THAN THE SERVER, for every status in the union', () => {
    /*
     * The invariant, mechanically. This is the assertion that catches somebody
     * widening the history control to `partial` without widening the route, or —
     * far worse — narrowing the route below what the draw screen offers.
     */
    for (const status of ['ok', 'partial', 'failed', 'aborted', 'blocked'] as const) {
      const row = reading({ status });
      if (attachable(row)) expect({ status, server: attachablePosted(row) }).toEqual({
        status,
        server: true,
      });
    }
  });

  it('keeps `ATTACHABLE_STATUSES` the server predicate’s own list', () => {
    expect([...ATTACHABLE_STATUSES]).toEqual(['ok', 'partial']);
  });
});

/**
 * The page-level pair, added with the UI half of F6 (tasks 6–8).
 *
 * They exist so the route's fan-out is a thing `npm test` can reach: the dedupe is
 * what makes a querent who attached one reading to eight messages cost one lookup,
 * and the map is what keeps `chat/types.ts` a leaf.
 */
describe('attachedIdsIn', () => {
  it('is empty for a page with no attachment, which is nearly every page', () => {
    expect(attachedIdsIn([{ attachedReadingId: null }, { attachedReadingId: null }])).toEqual([]);
  });

  it('dedupes, because the same reading may be attached twice (O3)', () => {
    const page = [
      { attachedReadingId: 'r1' },
      { attachedReadingId: null },
      { attachedReadingId: 'r2' },
      { attachedReadingId: 'r1' },
    ];
    expect(attachedIdsIn(page)).toEqual(['r1', 'r2']);
  });
});

describe('attachmentsFrom', () => {
  it('keys by reading id and projects through toAttachmentPreview', () => {
    const map = attachmentsFrom([reading({ id: 'r1' }), reading({ id: 'r2' })]);
    expect(Object.keys(map).sort()).toEqual(['r1', 'r2']);
    expect(map.r1).toEqual(toAttachmentPreview(reading({ id: 'r1' })));
  });

  it('drops a null — gone, or never this querent’s — rather than storing one', () => {
    /*
     * `[F6-6]` plus `[F6-7]`: `readingWithCards` answers null for a row that does not
     * exist AND for one that is not the caller's, indistinguishably and on purpose. An
     * absent key is what §8's table reads as "no preview", and the bubble decides from
     * its own body what to draw. A null VALUE in the map would be a third state that
     * every reader of it would have to know about.
     */
    const map = attachmentsFrom([null, reading({ id: 'r9' }), null]);
    expect(Object.keys(map)).toEqual(['r9']);
  });
});
