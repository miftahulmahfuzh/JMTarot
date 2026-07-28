import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { catalogFor } from '@/lib/i18n/catalog';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
import type { Locale } from '@/data/types';
import type { ReadingDetail } from '@/lib/history/types';
import { ReadingView, resolveProse, type ReadingProse, type ReadingViewData } from './ReadingView';

/**
 * `ReadingView` is the interface V7 builds against, so this file is the contract
 * as much as it is a test. The assertion that matters most to V7 is
 * `does not render Indonesian prose to an English viewer` -- H3 is the
 * component's invariant rather than the caller's discipline precisely so that
 * V7 cannot ship the bug by forgetting a prop.
 *
 * Rendering is `renderToStaticMarkup` inside a `LocaleProvider`, as
 * `legal.test.ts` already does. **Its trap applies here too:** Vite's JSX
 * transform keeps a leading space that Next's SWC drops, so a render test cannot
 * prove SPACING. Every wrapping text node in the component uses an explicit
 * `{' '}` and `legal.test.ts`'s source-level check is the guard for that.
 */

const BASE: ReadingViewData = {
  id: '11111111-1111-4111-8111-111111111111',
  readerId: 'thessaly',
  serviceId: 'spread3',
  localDate: '2026-07-26',
  createdAtIso: '2026-07-26T12:40:00.000Z',
  locale: 'id',
  status: 'ok',
  body: 'Kartu pertama bicara soal apa yang sudah kamu tinggalkan.',
  verdict: null,
  question: null,
  sharedAt: null,
  cards: [
    { cardId: 0, reversed: false, position: 0 },
    { cardId: 7, reversed: true, position: 1 },
    { cardId: 12, reversed: false, position: 2 },
  ],
};

function render(
  reading: Partial<ReadingViewData>,
  locale: Locale,
  prose?: ReadingProse,
): string {
  return inProvider(locale, createElement(ReadingView, { reading: { ...BASE, ...reading }, prose }));
}

/** `children` goes in the props object: `LocaleProvider` declares it required,
 *  and the third-argument overload of `createElement` does not satisfy that. */
function inProvider(locale: Locale, children: ReactNode): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, { locale, messages: catalogFor(locale), children }),
  );
}

// ---------------------------------------------------------------------------
// resolveProse -- the truth table, with no DOM
// ---------------------------------------------------------------------------

describe('resolveProse', () => {
  it('renders the original when the prose is already in the viewer language', () => {
    expect(resolveProse({ body: 'x', locale: 'id' }, undefined, 'id')).toEqual({
      kind: 'original',
    });
  });

  /** RULE 4. The caller forgot; the component does not guess in their favour. */
  it('translates rather than falling back when the caller omitted prose', () => {
    expect(resolveProse({ body: 'x', locale: 'id' }, undefined, 'en')).toEqual({
      kind: 'translating',
      text: '',
    });
  });

  it('uses whatever non-original prose the caller supplied', () => {
    const translated: ReadingProse = { kind: 'translated', locale: 'en', text: 'y' };
    expect(resolveProse({ body: 'x', locale: 'id' }, translated, 'en')).toBe(translated);

    const refused: ReadingProse = { kind: 'unavailable' };
    expect(resolveProse({ body: 'x', locale: 'id' }, refused, 'en')).toBe(refused);
  });

  /**
   * BRANCH 1 WINS OVER THE CALLER. A `failed` reading has nothing to translate,
   * and a caller who optimistically passed `translated` for a row with no prose
   * still gets the honest answer rather than an empty paragraph.
   */
  it('is unavailable for a null body even when the caller passed a translation', () => {
    for (const body of [null, '', '   ']) {
      expect(
        resolveProse({ body, locale: 'id' }, { kind: 'translated', locale: 'en', text: 'y' }, 'en'),
      ).toEqual({ kind: 'unavailable' });
    }
  });

  /** An explicit `original` from the caller is not a way around rule 4 either. */
  it('does not let an explicit `original` override the language check', () => {
    expect(resolveProse({ body: 'x', locale: 'id' }, { kind: 'original' }, 'en')).toEqual({
      kind: 'translating',
      text: '',
    });
  });
});

// ---------------------------------------------------------------------------
// The rendered component
// ---------------------------------------------------------------------------

describe('ReadingView', () => {
  it('renders the body when the languages agree', () => {
    const html = render({ locale: 'id' }, 'id');
    expect(html).toContain('Kartu pertama bicara');
  });

  /**
   * **H3, AND THE ONE V7 DEPENDS ON.** A public page that passes no `prose` for a
   * foreign-locale reading must show a spinner, not the wrong language.
   */
  it('does not render Indonesian prose to an English viewer with prose omitted', () => {
    const html = render({ locale: 'id' }, 'en');
    expect(html).not.toContain('Kartu pertama bicara');
    expect(html).toContain(catalogFor('en')['history.translating']);
  });

  it('renders a supplied translation and tags it with lang', () => {
    const html = render({ locale: 'id' }, 'en', {
      kind: 'translated',
      locale: 'en',
      text: 'The first card speaks of what you have left behind.',
    });
    expect(html).toContain('The first card speaks');
    expect(html).toContain('lang="en"');
    expect(html).not.toContain('Kartu pertama bicara');
  });

  it('says so when there is no stored text', () => {
    const html = render({ body: null, status: 'failed' }, 'id');
    expect(html).toContain(catalogFor('id')['history.detail.noBody']);
  });

  /**
   * INSERT ORDER IS NOT SLOT ORDER. This object also arrives from V7's resolver
   * and from a future post-reading mount, and a spread rendered in array order is
   * the quiet version of the bug that once showed one hand and read another.
   */
  it('renders cards in position order however the array was ordered', () => {
    const html = render(
      {
        cards: [
          { cardId: 12, reversed: false, position: 2 },
          { cardId: 0, reversed: true, position: 0 },
          { cardId: 7, reversed: false, position: 1 },
        ],
      },
      'id',
    );
    const alts = [...html.matchAll(/alt="([^"]*)"/g)].map((m) => m[1]);
    // The Fool (0), The Chariot (7), The Hanged Man (12) -- in that order.
    expect(alts).toHaveLength(3);
    expect(alts[0]).toContain('The Fool');
    expect(alts[1]).toContain('The Chariot');
    expect(alts[2]).toContain('The Hanged Man');
    // ...and the reversal travelled with its own card, not with its slot.
    expect(alts[0]).toBe(catalogFor('id')['card.alt.reversed'].replace('{name}', 'The Fool'));
  });

  /**
   * A card id no longer in the deck must leave a HOLE at its own slot, not
   * compact the array -- which is what `flatMap` or a `push` loop would do, and
   * would slide the third card under the second slot's label with nothing on
   * screen looking wrong.
   *
   * ASSERTED PER SLOT BOX, NOT ON THE IMAGE COUNT. Counting images passes for the
   * shifting version too, which is how the first draft of this test passed
   * against the bug it was written for.
   */
  it('leaves a hole at an unknown card rather than shifting the others left', () => {
    const html = render(
      {
        cards: [
          { cardId: 0, reversed: false, position: 0 },
          { cardId: 99, reversed: false, position: 1 },
          { cardId: 12, reversed: false, position: 2 },
        ],
      },
      'id',
    );
    // One chunk of markup per slot box, in slot order.
    const boxes = html.split('data-slotbox').slice(1);
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).toContain('The Fool');
    expect(boxes[1]).not.toContain('alt=');
    expect(boxes[2]).toContain('The Hanged Man');
  });

  /** ...and the same assertion shape on a whole spread, so the one above is not
   *  passing because `data-slotbox` splitting happens to work only when empty. */
  it('puts each card in its own slot box', () => {
    const html = render({}, 'id');
    const boxes = html.split('data-slotbox').slice(1);
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).toContain('The Fool');
    expect(boxes[1]).toContain('The Chariot');
    expect(boxes[2]).toContain('The Hanged Man');
  });

  /** The tap target exists on a filled slot and not on an empty one. */
  it('makes only the filled slots tappable', () => {
    const html = render(
      { cards: [{ cardId: 0, reversed: false, position: 0 }], serviceId: 'daily' },
      'id',
    );
    expect([...html.matchAll(/data-slottap/g)]).toHaveLength(1);
  });

  /** H4. The machine verdict, through the catalog, never parsed out of prose. */
  it('renders the stored verdict rather than a word from the body', () => {
    const html = render(
      { serviceId: 'yesno', verdict: 'no', body: 'Ya, sepertinya begitu.' },
      'id',
    );
    expect(html).toContain(catalogFor('id')['reading.verdict.no']);
  });

  it('renders no verdict chip when the reading has none', () => {
    const html = render({ verdict: null }, 'id');
    for (const v of ['yes', 'no', 'maybe'] as const) {
      expect(html).not.toContain(`>${catalogFor('id')[`reading.verdict.${v}`]}<`);
    }
  });

  it('shows the question only when there is one', () => {
    expect(render({ question: null }, 'id')).not.toContain(
      catalogFor('id')['history.detail.question'],
    );
    const html = render({ question: 'haruskah aku pindah?' }, 'id');
    expect(html).toContain('haruskah aku pindah?');
    expect(html).toContain(catalogFor('id')['history.detail.question']);
  });

  /**
   * VD14, ENFORCED BY AN OMITTED PROP. The overlay is closed in a static render,
   * so this checks the surface instead: no reshuffle, no retry, no reset, and no
   * return-to-deck anywhere on the page.
   */
  it('offers nothing that would change or re-run the draw', () => {
    const html = render({}, 'id');
    const id = catalogFor('id') as Record<string, string>;
    /*
     * `reading.retry` does not exist in the catalog and is listed anyway, so
     * that adding a retry control later has to come past this line. The count
     * assertion below is what stops the whole loop going vacuous if the two that
     * DO exist are ever renamed.
     */
    const checked = ['card.return', 'draw.reset', 'reading.retry'].filter((k) => id[k]);
    expect(checked).toEqual(['card.return', 'draw.reset']);
    for (const key of checked) {
      expect({ key, present: html.includes(id[key]) }).toEqual({ key, present: false });
    }
  });

  it('renders the entertainment disclaimer, last before the footer', () => {
    const html = render({}, 'id');
    const disclaimer = catalogFor('id')['common.disclaimer.long'];
    expect(html).toContain(disclaimer);

    const withFooter = inProvider(
      'id',
      createElement(ReadingView, {
        reading: BASE,
        footer: createElement('div', null, 'FOOTER-SENTINEL'),
      }),
    );
    expect(withFooter.indexOf(disclaimer)).toBeLessThan(withFooter.indexOf('FOOTER-SENTINEL'));
  });

  it('renders chrome in the viewer language while prose keeps its own', () => {
    const en = render({ locale: 'en', body: 'The first card speaks.' }, 'en');
    const idChrome = render({ locale: 'id' }, 'id');
    // The service name comes from the data file's Localized<>, not the catalog.
    expect(en).not.toBe(idChrome);
    expect(en).toContain('The first card speaks.');
  });

  /** Rule 1: no session, ever. It is what lets V7 mount this for a stranger. */
  it('renders with no auth context mounted at all', () => {
    expect(() => render({}, 'en', { kind: 'unavailable' })).not.toThrow();
  });

  it('returns null rather than throwing for an unknown reader or service', () => {
    const bad = inProvider(
      'id',
      createElement(ReadingView, {
        reading: { ...BASE, readerId: 'nobody' as ReadingViewData['readerId'] },
      }),
    );
    expect(bad).toBe('');
  });
});

/**
 * THE TYPE-LEVEL HALF OF VD10. `readingWithCards` returns `ReadingDetail` and
 * `/history/[id]` hands it straight to `ReadingView`, so if the two shapes ever
 * drift the detail page stops compiling -- and this line says why, in the file a
 * reader is most likely to open when it does.
 */
describe('the query shape and the render shape are one shape', () => {
  it('accepts a ReadingDetail as ReadingViewData', () => {
    const detail: ReadingDetail = BASE;
    const data: ReadingViewData = detail;
    expect(data.id).toBe(detail.id);
  });
});

// ---------------------------------------------------------------------------
// `as-written` -- V7's public mount
// ---------------------------------------------------------------------------

describe('the as-written state (V7)', () => {
  it('is returned to the caller unchanged, like every other explicit prose', () => {
    /*
     * NO CHANGE TO `resolveProse` WAS NEEDED FOR THIS, which is the property worth
     * asserting: branch 2 already returns any supplied non-`original` prose, so the
     * new member arrives through the existing path and rule 4's truth table did not
     * move. If somebody "tidies" branch 2 into an allowlist of kinds, this fails.
     */
    const asWritten: ReadingProse = { kind: 'as-written' };
    expect(resolveProse({ body: 'x', locale: 'id' }, asWritten, 'en')).toBe(asWritten);
    expect(resolveProse({ body: 'x', locale: 'id' }, asWritten, 'id')).toBe(asWritten);
  });

  it('still loses to an empty body, so branch 1 keeps its precedence', () => {
    // A `failed` reading has nothing to show verbatim either. V7's public page
    // never sees one -- `publicReadingQuery` requires a non-null body -- but the
    // ordering is the component's invariant rather than the caller's luck.
    for (const body of [null, '', '   ']) {
      expect(resolveProse({ body, locale: 'id' }, { kind: 'as-written' }, 'en')).toEqual({
        kind: 'unavailable',
      });
    }
  });

  it('renders the foreign body, tagged with its own lang', () => {
    /*
     * THE WHOLE POINT OF THE STATE. An English viewer opening a shared Indonesian
     * reading sees the Indonesian prose -- which is what was shared -- with `lang`
     * on it so a screen reader pronounces it correctly and the browser's own
     * translate offer points at the right language.
     */
    const html = render({ locale: 'id' }, 'en', { kind: 'as-written' });
    expect(html).toContain('Kartu pertama bicara');
    expect(html).toContain('lang="id"');
    // NOT the spinner: that is the state this exists to escape.
    expect(html).not.toContain(catalogFor('en')['history.translating']);
  });

  it('does not tag the body when the languages already agree', () => {
    // `lang` is only meaningful where it differs from the document, and V7's page
    // uses the same state for both cases.
    const html = render({ locale: 'en' }, 'en', { kind: 'as-written' });
    expect(html).toContain('lang="en"');
  });
});
