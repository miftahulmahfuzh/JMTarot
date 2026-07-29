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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { ReadingProse, ReadingViewData } from './ReadingView';
import { effectiveIncludeNickname, previewReadingView } from './ShareFooter';

/**
 * The component source, for the per-language properties below.
 *
 * There is no React renderer in this project (`npm test` is logic only), and the
 * sheet's list behaviour is not extractable into a pure function without inventing
 * an abstraction nothing else needs. So the assertions are at the source level, the
 * same tool `api/share/route.contract.test.ts` uses and for the same reason: each
 * one is a decision that is one deleted line from a real hole, and loop 5 is the
 * only other thing that could see it.
 */
const SOURCE = readFileSync(
  join(process.cwd(), 'src', 'components', 'ShareFooter.tsx'),
  'utf8',
);
/** Comments stripped, so a negative assertion cannot fire on prose describing it. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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
  choice: null,
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

// ---------------------------------------------------------------------------
// the per-language list (2026-07-28)
// ---------------------------------------------------------------------------

describe('the share sheet, at the source level', () => {
  it('reads the component at all, so nothing below passes vacuously', () => {
    expect(SOURCE).toContain('export function ShareFooter');
    expect(CODE).toContain('function openSheet');
    expect(CODE.length).toBeGreaterThan(2000);
  });

  it('COPIES THE LINK IT WAS GIVEN, never one read out of state', () => {
    /*
     * **THE WORST FAILURE THIS COMPONENT CAN HAVE NOW.** With one link, `copy()`
     * reading state was correct. With a list, a `copy()` that reached for `links[0]`
     * would send the wrong language's address from the second button down — and the
     * querent would find out from the chat they had already sent it to, with nothing
     * on screen ever having looked wrong.
     */
    expect(CODE).toMatch(/async function copy\(link: LiveLink\)/);
    expect(CODE).toMatch(/onClick=\{\(\) => void copy\(l\)\}/);
    // Never re-deriving it from the array inside the handler.
    expect(CODE).not.toMatch(/function copy\([^)]*\)\s*\{[\s\S]{0,200}links\[0\]/);
  });

  it('offers exactly ONE revoke control, and it is artifact-wide', () => {
    /*
     * Miftah's consent ruling. A per-link kill would let the querent tap the wrong
     * one, believe the reading is private, and leave an address serving the public
     * internet. `revoke()` therefore takes no argument -- the shape is the
     * enforcement, because a `revoke(l)` inside the `links.map` is how the per-link
     * version would arrive.
     */
    expect(CODE).toMatch(/async function revoke\(\)\s*\{/);
    expect([...CODE.matchAll(/void revoke\(\)/g)]).toHaveLength(1);
    expect(CODE).not.toMatch(/void revoke\(l\)/);
    // The DELETE body names one anchor id; the SERVER expands it to the artifact.
    expect(CODE).toMatch(/JSON\.stringify\(\{ id: anchor\.id \}\)/);
  });

  it('LABELS a link from the STORED pin, never from the viewing locale', () => {
    /*
     * The mint falls back to a `null` pin when it cannot produce a translation, so
     * labelling from `viewing` would put "English" under an address that renders
     * Indonesian — the exact class of lie the deleted other-language notice used to
     * paper over.
     */
    expect(CODE).toMatch(/languageName\(l\.locale\)/);
    expect(CODE).not.toMatch(/languageName\(viewing\)\s*\}<\/p>/);
    expect(CODE).toMatch(/locale: body\.locale \?\? null/);
  });

  it('offers the mint for the current language ONLY when it has no address', () => {
    // Otherwise the sheet invites a rotation of the link the querent is looking at,
    // which is the behaviour the whole change removes.
    expect(CODE).toMatch(/!currentLink \?/);
    expect(CODE).toMatch(/share\.sheet\.createIn/);
  });

  it('BOUNDS EVERY REQUEST ON THE CLIENT, because maxDuration went up', () => {
    /*
     * CLAUDE.md, from `POST /api/locale` on a real iPhone: *"a bigger `maxDuration`
     * MUST be paired with a bound on the client, or you have only made the hang
     * longer."* The mint can now reach a model, so its server budget is 30s. Three
     * fetches, three signals -- asserted as a COUNT, because the failure mode is a
     * fourth fetch added without one.
     */
    const fetches = [...CODE.matchAll(/fetch\(/g)];
    const signals = [...CODE.matchAll(/signal: AbortSignal\.timeout\(REQUEST_TIMEOUT_MS\)/g)];
    expect(fetches).toHaveLength(3);
    expect(signals).toHaveLength(3);
  });

  it('reads the links on OPEN and not on mount', () => {
    /*
     * This component renders under every completed reading and on every history
     * detail page, so a fetch on mount would put a request on screens the querent
     * never shares from.
     *
     * **NOT `not.toContain('useEffect')`** — that was the first version of this
     * assertion and it was simply false: `ShareSheet` uses effects for the Tab trap,
     * the body-scroll lock and the `returnFocusTo` restore, all of which have to run
     * on mount. The property is that no EFFECT reads the links, so the assertion is
     * about `fetchLinks`'s call sites: exactly one, inside `openSheet`, which is a
     * click handler.
     */
    expect(CODE).toMatch(/onClick=\{\(\) => void openSheet\(\)\}/);
    // `await fetchLinks()`, so the DECLARATION does not count as a call site.
    expect([...CODE.matchAll(/await fetchLinks\(\)/g)]).toHaveLength(1);
    const openBody = CODE.slice(CODE.indexOf('async function openSheet'));
    expect(openBody.slice(0, openBody.indexOf('}'))).toContain('await fetchLinks()');
    // And no effect reaches for it.
    for (const [, body] of CODE.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n {2}\}/g)) {
      expect(body).not.toContain('fetchLinks');
    }
  });

  it('falls through to the create flow when the read fails', () => {
    // The querent's goal is a link. An outage in the new read path must not break
    // the feature that worked before it existed.
    expect(CODE).toMatch(/async function fetchLinks\(\): Promise<LiveLink\[\]>/);
    expect(CODE).toMatch(/return \[\];/);
  });
});
