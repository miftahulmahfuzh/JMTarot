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
import { adaptSharedReading, isForeignProse, sharedNickname } from './adapt';

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
    const { reading } = adaptSharedReading(BASE);
    expect(reading.id).toBe(BASE.id);
    expect(reading.readerId).toBe('thessaly');
    expect(reading.serviceId).toBe('spread3');
    expect(reading.localDate).toBe('2026-07-28');
    expect(reading.createdAtIso).toBe(BASE.createdAtIso);
    expect(reading.locale).toBe('id');
    expect(reading.body).toBe(BASE.body);
    expect(reading.cards).toEqual(BASE.cards);
  });

  it('ALWAYS passes prose explicitly, and always as `as-written`', () => {
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
     * The SAME state for both locales, deliberately: VD7 makes the prose immutable
     * and VD8 forbids the public route generating anything, so "already in the
     * viewer's language" and "not" render the same way and differ only in the one
     * line of chrome `isForeignProse` decides.
     */
    expect(adaptSharedReading(BASE).prose).toEqual({ kind: 'as-written' });
    expect(adaptSharedReading({ ...BASE, locale: 'en' }).prose).toEqual({ kind: 'as-written' });
  });

  it('reports status ok, because the query guaranteed it', () => {
    expect(adaptSharedReading(BASE).reading.status).toBe('ok');
  });

  it('never leaks sharedAt to a stranger', () => {
    // Real on the row, useless to a viewer, and a fact about the sharer's
    // behaviour. It renders nothing here, so it goes nowhere.
    expect(adaptSharedReading(BASE).reading.sharedAt).toBeNull();
  });

  it('turns an ABSENT question key into null, not undefined', () => {
    /*
     * `PublicReading` omits the KEY when the link excludes the question, and
     * `ReadingDetail.question` is `string | null`. `reading.question ?? null` on an
     * object with no such key gives `undefined` under a `?.` chain, which
     * typechecks in some shapes and renders as nothing while being the wrong type.
     */
    const { reading } = adaptSharedReading(BASE);
    expect('question' in BASE).toBe(false);
    expect(reading.question).toBeNull();
    expect(Object.hasOwn(reading, 'question')).toBe(true);
  });

  it('carries the question through when the link opted in', () => {
    const withQ: PublicReading = { ...BASE, question: 'haruskah aku pindah kerja' };
    expect(adaptSharedReading(withQ).reading.question).toBe('haruskah aku pindah kerja');
  });

  it('does not put the question in the payload when the key is absent', () => {
    const serialized = JSON.stringify(adaptSharedReading(BASE));
    expect(serialized).not.toContain('haruskah');
  });
});

describe('isForeignProse', () => {
  it('is true exactly when the viewer reads the other language', () => {
    expect(isForeignProse(BASE, 'id')).toBe(false);
    expect(isForeignProse(BASE, 'en')).toBe(true);
    expect(isForeignProse({ ...BASE, locale: 'en' }, 'en')).toBe(false);
    expect(isForeignProse({ ...BASE, locale: 'en' }, 'id')).toBe(true);
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
    const props = adaptSharedReading(BASE);
    expectTypeOf(props).toExtend<Omit<ReadingViewProps, 'footer' | 'onCardOpened'>>();
  });
});
