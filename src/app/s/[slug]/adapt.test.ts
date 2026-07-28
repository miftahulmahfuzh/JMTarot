/**
 * The adapter, which is the one file a `ReadingView` prop change costs.
 *
 * The assignability assertion at the bottom is the important one: it is what makes
 * a mismatch between V6's component and V7's page a COMPILE error rather than a
 * runtime `undefined` on the only page in the app a stranger can open.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ReadingViewProps } from '@/components/ReadingView';
import type { PublicReading } from '@/lib/share/types';
import {
  adaptSharedReading,
  renderedLocale,
  sharedNickname,
  type SharedTranslation,
} from './adapt';

const BASE = {
  id: '11111111-1111-4111-8111-111111111111',
  readerId: 'thessaly',
  serviceId: 'spread3',
  localDate: '2026-07-28',
  createdAtIso: '2026-07-28T12:00:00.000Z',
  locale: 'id',
  verdict: null,
  body: 'Kartu pertama berbicara tentang ambang.',
  cards: [
    { cardId: 16, reversed: false, position: 0 },
    { cardId: 9, reversed: true, position: 1 },
    { cardId: 6, reversed: false, position: 2 },
  ],
} satisfies PublicReading;

describe('adaptSharedReading', () => {
  it('carries the draw through unchanged', () => {
    const { reading } = adaptSharedReading(BASE, null);
    expect(reading.id).toBe(BASE.id);
    expect(reading.readerId).toBe('thessaly');
    expect(reading.serviceId).toBe('spread3');
    expect(reading.localDate).toBe('2026-07-28');
    expect(reading.createdAtIso).toBe(BASE.createdAtIso);
    expect(reading.locale).toBe('id');
    expect(reading.body).toBe(BASE.body);
    expect(reading.cards).toEqual(BASE.cards);
  });

  it('ALWAYS passes prose explicitly, and `as-written` WITH NO PINNED TRANSLATION', () => {
    /*
     * THE ASSERTION THIS FILE EXISTS FOR, AND `as-written` RATHER THAN `original`
     * IS THE PART THAT COST SOMETHING TO LEARN.
     *
     * `ReadingView`'s rule 4 turns an OMITTED `prose` on a foreign-locale reading
     * into the translating state -- forever, because nothing on the public page can
     * fetch a translation. **AND AN EXPLICIT `{ kind: 'original' }` DOES EXACTLY
     * THE SAME THING**, deliberately, with a test in `ReadingView.test.ts` named
     * for it -- so reconciliation §5.5's literal instruction would have shipped the
     * spinner it was written to prevent. `as-written` is the state that says the
     * decision out loud. See `adapt.ts`'s header.
     *
     * `null` IS STILL THE COMMON CASE and this test is what protects it: a link
     * minted before `share_links.locale` existed has no pinned locale, and V2 never
     * persists an unverified translation, so a miss is ordinary rather than
     * exceptional. Both locales render it the same way, and since the other-language
     * notice was deleted they now differ in NOTHING but the `lang` attribute -- which
     * is why the deletion has its own describe block further down.
     */
    expect(adaptSharedReading(BASE, null).prose).toEqual({ kind: 'as-written' });
    expect(adaptSharedReading({ ...BASE, locale: 'en' }, null).prose).toEqual({
      kind: 'as-written',
    });
  });

  it('reports status ok, because the query guaranteed it', () => {
    expect(adaptSharedReading(BASE, null).reading.status).toBe('ok');
  });

  it('never leaks sharedAt to a stranger', () => {
    // Real on the row, useless to a viewer, and a fact about the sharer's
    // behaviour. It renders nothing here, so it goes nowhere.
    expect(adaptSharedReading(BASE, null).reading.sharedAt).toBeNull();
  });

  it('turns an ABSENT question key into null, not undefined', () => {
    /*
     * `PublicReading` omits the KEY when the link excludes the question, and
     * `ReadingDetail.question` is `string | null`. `reading.question ?? null` on an
     * object with no such key gives `undefined` under a `?.` chain, which
     * typechecks in some shapes and renders as nothing while being the wrong type.
     */
    const { reading } = adaptSharedReading(BASE, null);
    expect('question' in BASE).toBe(false);
    expect(reading.question).toBeNull();
    expect(Object.hasOwn(reading, 'question')).toBe(true);
  });

  it('carries the question through when the link opted in', () => {
    const withQ: PublicReading = { ...BASE, question: 'haruskah aku pindah kerja' };
    expect(adaptSharedReading(withQ, null).reading.question).toBe('haruskah aku pindah kerja');
  });

  it('does not put the question in the payload when the key is absent', () => {
    const serialized = JSON.stringify(adaptSharedReading(BASE, null));
    expect(serialized).not.toContain('haruskah');
  });
});

/**
 * The pinned translation the sharer was reading. `BASE` is `id`, so this is the
 * English the sharer saw before they minted the link.
 */
const PINNED_EN: SharedTranslation = {
  body: 'The first card speaks of a threshold.',
  locale: 'en',
};

describe('adaptSharedReading with a pinned translation', () => {
  it('renders the translation the sharer was reading, as `translated`', () => {
    /*
     * DESIGN A. The link recorded the locale the sharer was viewing and the
     * resolver found that row, so the stranger reads what the sharer read.
     *
     * `'translated'` AND NOT `'as-written'`, because a translation genuinely
     * happened -- it is a row in `translations`. V7's warning is against the
     * opposite mistake (claiming `translated` when nothing was translated), and
     * `ReadingProse`'s comment says so in capitals.
     */
    expect(adaptSharedReading(BASE, PINNED_EN).prose).toEqual({
      kind: 'translated',
      locale: 'en',
      text: PINNED_EN!.body,
    });
  });

  it('leaves `reading.body` and `reading.locale` as the ORIGINAL', () => {
    /*
     * The translation rides in `prose`, never over the top of the source. Two
     * reasons: `resolveProse` reads `reading.locale` to decide rule 4, so
     * overwriting it would make the component's own invariant unverifiable; and
     * VD7 says `readings.body` is immutable, which a renderer should not be able
     * to contradict even locally.
     */
    const { reading } = adaptSharedReading(BASE, PINNED_EN);
    expect(reading.locale).toBe('id');
    expect(reading.body).toBe(BASE.body);
  });

  it('is `as-written` when the pinned locale MATCHES the source', () => {
    /*
     * A reading drawn in the viewer's own language pins its own locale, so there
     * is nothing to translate and the resolver passes null. This is every share
     * from the draw screen.
     */
    expect(adaptSharedReading({ ...BASE, locale: 'en' }, null).prose).toEqual({
      kind: 'as-written',
    });
  });
});

describe('renderedLocale', () => {
  it('is the pinned locale when a translation was found, the source otherwise', () => {
    expect(renderedLocale(BASE, PINNED_EN)).toBe('en');
    expect(renderedLocale(BASE, null)).toBe('id');
    expect(renderedLocale({ ...BASE, locale: 'en' }, null)).toBe('en');
  });
});

describe('the other-language notice is gone', () => {
  /**
   * **THE NEGATIVE CONTROL FOR A DELETION.** `isForeignProse` and
   * `share.public.otherLanguage` were removed on Miftah's ruling (2026-07-28), and
   * three tests here used to assert the notice's behaviour — including one named for
   * keeping it alive. Deleting them silently would leave the codebase with no record
   * that the comparison ever existed, and the next person to notice foreign prose
   * under English chrome would write it again.
   *
   * So the deletion is asserted instead of merely performed: neither the adapter nor
   * the page may reacquire a viewer-versus-prose comparison, and the catalog key must
   * stay absent. What survives is `renderedLocale`, tested above — the `lang`
   * attribute is now the only thing declaring the prose's language, which is why the
   * assertion below is on the page's source rather than only on this module's exports.
   */
  it('exports no viewer-versus-prose comparison from the adapter', async () => {
    const mod = await import('./adapt');
    expect(Object.keys(mod).sort()).toEqual([
      'adaptSharedReading',
      'renderedLocale',
      'sharedNickname',
    ]);
  });

  it('leaves no catalog key for it in either locale', async () => {
    const [{ default: id }, { default: en }] = await Promise.all([
      import('@/lib/i18n/locales/id'),
      import('@/lib/i18n/locales/en'),
    ]);
    expect('share.public.otherLanguage' in id).toBe(false);
    expect('share.public.otherLanguage' in en).toBe(false);
  });

  it('keeps the `lang` attribute, which is what replaced it', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(process.cwd(), 'src/app/s/[slug]/page.tsx'), 'utf8');
    expect(source).toContain('lang={shownLocale}');
    expect(source).not.toContain('otherLanguage');
  });
});

describe('sharedNickname', () => {
  it('is null unless the link opted in AND the column came back', () => {
    expect(sharedNickname(BASE, true)).toBeNull(); // opted in, no key: the query said no
    expect(sharedNickname(BASE, false)).toBeNull();
    expect(sharedNickname({ ...BASE, nickname: 'Mif' }, true)).toBe('Mif');
    /*
     * THE SECOND FENCE. The query already refuses to SELECT the column when the
     * toggle is off; this is what keeps the toggle governing the pixel even if a
     * future query change starts fetching it unconditionally.
     */
    expect(sharedNickname({ ...BASE, nickname: 'Mif' }, false)).toBeNull();
  });

  it('treats blank and null as absent', () => {
    expect(sharedNickname({ ...BASE, nickname: '' }, true)).toBeNull();
    expect(sharedNickname({ ...BASE, nickname: '   ' }, true)).toBeNull();
    expect(sharedNickname({ ...BASE, nickname: null }, true)).toBeNull();
  });
});

describe('the seam holds', () => {
  it("is assignable to ReadingView's props", () => {
    /*
     * A TYPE-LEVEL ASSERTION, and it is the whole point of the file. If V6 changes
     * `ReadingViewProps`, this fails at `npm run typecheck` in a file whose header
     * explains what to do about it -- rather than at runtime, on the public page,
     * as an `undefined` a stranger sees.
     */
    const props = adaptSharedReading(BASE, null);
    expectTypeOf(props).toExtend<Omit<ReadingViewProps, 'footer' | 'onCardOpened'>>();
  });
});
