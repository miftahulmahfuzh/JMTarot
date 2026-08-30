/**
 * `refillView`'s TRUTH TABLE — the unit test that holds `ReadingView`'s rule 4
 * across the refill.
 *
 * WHY THIS FILE EXISTS AS A UNIT TEST OF A FUNCTION RATHER THAN A COMPONENT
 * TEST: the unit project runs `environment: 'node'`, so `HistoryDetail` itself —
 * the effect, the stream, the button — is unreachable here. That is not a gap to
 * apologise for, it is the reason the prose decision was extracted into an
 * exported pure function in the first place. Rule 4 is the renderer's invariant,
 * and the refill is the one path that hands the renderer a body the server did
 * not send; so the decision gets a truth table rather than the component's care.
 *
 * **IT MOVED TO ITS OWN MODULE ON 2026-08-30 AND THIS IMPORT MOVED WITH IT.**
 * `HistoryDetail.tsx` gained `ReadingActions`, which reaches `next-auth` through
 * `AccountMenu`, and importing the component here died on `next/server`. See
 * `refillView.ts`'s header -- the separation is the one this paragraph asked for,
 * taken one file further.
 *
 * **THE ASSERTIONS GO THROUGH THE REAL `resolveProse`, NOT THROUGH A RESTATEMENT
 * OF WHAT IT DOES.** A test asserting `{ kind: 'as-written' }` and stopping there
 * would pass even if `resolveProse` later stopped honouring that member; feeding
 * the pair into the actual function is what makes case 5 a regression test
 * instead of a description.
 */
import { describe, expect, it } from 'vitest';

import { resolveProse, type ReadingViewData } from '@/components/ReadingView';

import { refillView } from './refillView';

/**
 * A `failed` reading exactly as `readingWithCards` returns one: a real hand, a
 * real question, and `body: null`. This is the only row shape `refillView` is
 * ever handed in production, because `isRetryable` admits no other.
 */
const EMPTY: ReadingViewData = {
  id: '11111111-1111-4111-8111-111111111111',
  readerId: 'thessaly',
  serviceId: 'spread3',
  localDate: '2026-08-20',
  createdAtIso: '2026-08-20T04:00:00.000Z',
  locale: 'id',
  status: 'failed',
  verdict: null,
  question: 'mending makan ayam atau ikan?',
  choice: null,
  sharedAt: null,
  cards: [{ cardId: 0, reversed: false, position: 0 }],
  body: null,
};

describe('refillView', () => {
  it('returns the reading itself when nothing has been refilled', () => {
    const { view, prose } = refillView(EMPTY, null, 'id');
    // IDENTITY, not a structural copy: no refill means no re-render.
    expect(view).toBe(EMPTY);
    expect(prose).toBeNull();
  });

  it('moves the body onto the reading and claims ok, keeping the row intact', () => {
    const { view } = refillView(
      EMPTY,
      { text: 'Tiga kartu terbuka.', locale: 'id', choice: 'ayam' },
      'id',
    );
    expect(view.body).toBe('Tiga kartu terbuka.');
    expect(view.status).toBe('ok');
    expect(view.choice).toBe('ayam');
    // Everything the refill has no business touching.
    expect(view.id).toBe(EMPTY.id);
    expect(view.cards).toBe(EMPTY.cards);
    expect(view.question).toBe(EMPTY.question);
    expect(view.localDate).toBe(EMPTY.localDate);
    expect(view.createdAtIso).toBe(EMPTY.createdAtIso);
    expect(view.verdict).toBeNull();
  });

  it('keeps a stored choice when the refill produced no marker', () => {
    const stored: ReadingViewData = { ...EMPTY, choice: 'ikan' };
    const { view } = refillView(stored, { text: 'Tanpa penanda.', locale: 'id', choice: null }, 'id');
    expect(view.choice).toBe('ikan');
  });

  it('supplies no prose when the refill is already in the viewer language', () => {
    const { view, prose } = refillView(EMPTY, { text: 'Prosa.', locale: 'id', choice: null }, 'id');
    expect(prose).toBeNull();
    expect(resolveProse(view, prose ?? undefined, 'id')).toEqual({ kind: 'original' });
  });

  /*
   * THE REGRESSION. `resolveProse` treats an explicit `{ kind: 'original' }`
   * exactly like an omitted prop, so returning it here would put Indonesian
   * prose in the English app through the function written to prevent that.
   * `as-written` is V7's member: a named decision, rendered with a `lang`
   * attribute.
   */
  it('supplies as-written and never original when the refill is in the other language', () => {
    const { view, prose } = refillView(EMPTY, { text: 'Prosa.', locale: 'id', choice: null }, 'en');
    expect(prose).toEqual({ kind: 'as-written' });
    expect(prose).not.toEqual({ kind: 'original' });
    expect(resolveProse(view, prose ?? undefined, 'en')).toEqual({ kind: 'as-written' });
  });

  it('never lets resolveProse land on original unless the prose is in the viewer language', () => {
    const locales = ['id', 'en'] as const;
    for (const viewer of locales) {
      for (const generated of locales) {
        const { view, prose } = refillView(
          EMPTY,
          { text: 'Prosa.', locale: generated, choice: null },
          viewer,
        );
        const shown = resolveProse(view, prose ?? undefined, viewer);
        if (shown.kind === 'original') expect(view.locale).toBe(viewer);
        else expect(shown).toEqual({ kind: 'as-written' });
      }
    }
  });

  it('never claims a translation happened', () => {
    for (const generated of ['id', 'en'] as const) {
      const { prose } = refillView(EMPTY, { text: 'Prosa.', locale: generated, choice: null }, 'en');
      expect(prose?.kind).not.toBe('translated');
    }
  });
});
