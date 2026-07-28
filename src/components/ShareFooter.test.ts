/**
 * `previewReadingView`, which is the share sheet's whole promise reduced to one
 * pure function.
 *
 * **THE SHEET SAYS "THIS IS EXACTLY WHAT THEY WILL SEE", AND SINCE DESIGN A THAT
 * SENTENCE HAS A WAY TO BECOME FALSE THAT IT DID NOT HAVE BEFORE.** The link now
 * pins the locale the sharer was reading, so the public page renders the
 * translation — while this preview, until it was given the host's prose, rendered
 * `reading.body`, which is the ORIGINAL. Indonesian in the sheet, English on the
 * page, and nothing failing.
 *
 * So the mapping below is not a convenience: it is the same decision
 * `resolveShare` + `adaptSharedReading` make on the server, restated on the client
 * against the data the host already has on screen. The two must agree, and this
 * file is where that agreement is written down.
 */
import { describe, expect, it } from 'vitest';

import type { ReadingProse, ReadingViewData } from './ReadingView';
import { effectiveIncludeNickname, previewReadingView } from './ShareFooter';

const READING: ReadingViewData = {
  id: '11111111-1111-4111-8111-111111111111',
  readerId: 'thessaly',
  serviceId: 'spread3',
  localDate: '2026-07-28',
  createdAtIso: '2026-07-28T12:00:00.000Z',
  locale: 'id',
  status: 'ok',
  verdict: null,
  question: 'haruskah aku pindah kerja',
  body: 'Kartu pertama berbicara tentang ambang.',
  sharedAt: null,
  cards: [
    { cardId: 16, reversed: false, position: 0 },
    { cardId: 9, reversed: true, position: 1 },
    { cardId: 6, reversed: false, position: 2 },
  ],
};

const TRANSLATED: ReadingProse = {
  kind: 'translated',
  locale: 'en',
  text: 'The first card speaks of a threshold.',
};

describe('previewReadingView', () => {
  it('previews the TRANSLATION when that is what the sharer is reading', () => {
    /*
     * THE ASSERTION THIS FILE EXISTS FOR. The sharer is reading English; the link
     * will pin `en`; the public page will render the English row. A preview showing
     * the Indonesian source would be a preview of a different page.
     */
    expect(previewReadingView(READING, true, TRANSLATED).prose).toEqual(TRANSLATED);
  });

  it('previews as-written when the host is showing the original', () => {
    expect(previewReadingView(READING, true, { kind: 'original' }).prose).toEqual({
      kind: 'as-written',
    });
    expect(previewReadingView(READING, true, { kind: 'as-written' }).prose).toEqual({
      kind: 'as-written',
    });
  });

  it('previews as-written for every state that will NOT have a row to read', () => {
    /*
     * **THE THREE STATES THAT ARE NOT ANSWERS**, mapped to what the public page
     * will actually do rather than to what the sharer is looking at:
     *
     *   - `translating` — mid-stream. V2 persists on completion, so there may be no
     *     row yet.
     *   - `unavailable` — the translation failed. V2 never persists an unverified
     *     generation (`REPAIR, DO NOT BUFFER`), so there is certainly no row.
     *
     * In both cases the resolver misses and the page falls back to the source, so
     * the source is what the preview must show. Passing the host's state straight
     * through would put a spinner or an error in a preview of a page that renders
     * prose perfectly well.
     */
    expect(previewReadingView(READING, true, { kind: 'translating', text: 'The fir' }).prose).toEqual(
      { kind: 'as-written' },
    );
    expect(previewReadingView(READING, true, { kind: 'unavailable' }).prose).toEqual({
      kind: 'as-written',
    });
  });

  it('still nulls the question when the caller excludes it', () => {
    // No caller passes false since Miftah's ruling; the parameter is the mechanism
    // if that is revisited, so it stays tested rather than trusted.
    expect(previewReadingView(READING, false, { kind: 'original' }).reading.question).toBeNull();
    expect(previewReadingView(READING, true, { kind: 'original' }).reading.question).toBe(
      'haruskah aku pindah kerja',
    );
  });

  it('still hides sharedAt, because a stranger never sees the badge', () => {
    const withBadge: ReadingViewData = { ...READING, sharedAt: new Date().toISOString() };
    expect(previewReadingView(withBadge, true, { kind: 'original' }).reading.sharedAt).toBeNull();
  });

  it('never mutates the reading it was handed', () => {
    // The host owns that object and is rendering it behind the sheet.
    previewReadingView(READING, false, TRANSLATED);
    expect(READING.question).toBe('haruskah aku pindah kerja');
    expect(READING.body).toBe('Kartu pertama berbicara tentang ambang.');
  });
});

describe('effectiveIncludeNickname', () => {
  /*
   * **THE CONSENT RULE, AND IT IS WHY THIS IS A FUNCTION RATHER THAN THE RAW
   * `includeNickname` STATE.**
   *
   * The draw screen mounted `ShareFooter` with no `nickname` prop for two
   * workstreams. The toggle read `disabled={... || !nickname}` and so was dead —
   * but the STATE stayed `true`, so `create()` posted `include_nickname: true`, the
   * resolver projected the column, and the public page rendered a nickname that the
   * sharer could not switch off and that `nicknameLine` (`includeNickname &&
   * nickname`) had left out of the preview entirely.
   *
   * Fetching the nickname on the draw screen fixes the visible half. This function
   * is the other half: **what the sharer could not see, they did not consent to**,
   * so a disabled toggle sends `false` rather than its default. Both fixes, because
   * either alone leaves the wire able to claim a consent that never happened.
   */
  it('is false whenever there is no nickname to have consented to', () => {
    expect(effectiveIncludeNickname(true, null)).toBe(false);
    expect(effectiveIncludeNickname(true, undefined)).toBe(false);
    expect(effectiveIncludeNickname(true, '')).toBe(false);
    expect(effectiveIncludeNickname(true, '   ')).toBe(false);
  });

  it('honours the toggle when there IS a nickname', () => {
    expect(effectiveIncludeNickname(true, 'Mif')).toBe(true);
    expect(effectiveIncludeNickname(false, 'Mif')).toBe(false);
  });

  it('agrees with the blank-handling the public page already uses', () => {
    // `sharedNickname` treats blank and whitespace as absent. If these two
    // disagreed, the sheet would offer a switch for a line that cannot render.
    expect(effectiveIncludeNickname(true, '  Mif  ')).toBe(true);
  });
});
