/**
 * `recallChain`'s gist-translation substitution (V2 Task 19 / T12).
 *
 * THREE PROPERTIES, AND THE THIRD IS THE ONE THAT MATTERS MOST:
 *
 *   - a cached translation is preferred when the recalled reading is in the other
 *     language;
 *   - the ORIGINAL is used when there is none, because the base contract already
 *     says "write in ENGLISH even if the text you are reading is written in another
 *     language" — the whole path is opportunistic;
 *   - **IT NEVER AWAITS A MODEL CALL.** The gist is prompt input for a reading the
 *     querent is watching arrive, and roadmap §6 forbids a model call in front of a
 *     byte anybody is waiting for. The generation goes through `defer()`.
 *
 * And the property that is older than this workstream and must survive it:
 * `recallChain` NEVER THROWS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recallableReadings = vi.fn();
vi.mock('@/lib/db/queries/history', () => ({ recallableReadings }));

/*
 * The parameters are DECLARED even though the body ignores them, because
 * `vi.fn(async () => …)` infers a zero-argument signature and `mock.calls[0][1]` then
 * fails to typecheck against a tuple of length 0. Naming them is what makes the
 * "only the foreign one was asked about" assertion below expressible.
 */
const gistTranslations = vi.fn(
  async (_db: unknown, _ids: readonly string[], _locale: string) => new Map<string, string>(),
);
vi.mock('@/lib/db/queries/translations', () => ({ gistTranslations }));

vi.mock('@/lib/db/client', () => ({ db: {} }));

const deferred: Array<() => Promise<void>> = [];
vi.mock('@/lib/analytics/track', () => ({
  defer: (fn: () => Promise<void>) => {
    deferred.push(fn);
  },
  track: vi.fn(),
}));

/**
 * The translator is mocked at the module the deferred callback dynamically imports,
 * so "was a model call made on the request path" is answerable by call count.
 */
const translateOrCached = vi.fn(async (_args: Record<string, unknown>) => ({
  body: 'the old patch is holding nothing',
  outcome: 'ok' as const,
  fellBack: false,
}));
vi.mock('@/lib/translate/translate', () => ({ translateOrCached }));

import { recallChain } from './chain';

const ID_A = '00000000-0000-4000-8000-00000000000a';

function recalled(over: Record<string, unknown> = {}) {
  return {
    id: ID_A,
    localDate: '2026-07-26',
    readerId: 'margaret',
    serviceId: 'spread3',
    cards: [{ cardId: 16, reversed: false }],
    gist: 'tambalan lama sudah tidak menahan apa-apa',
    hadQuestion: true,
    locale: 'id',
    ...over,
  };
}

/** Shares a card with the recall, so the gate returns `reason: 'repeat'`. */
const args = (locale: 'id' | 'en') => ({
  userId: '11111111-1111-4111-8111-111111111111',
  currentCardIds: [16, 9, 6],
  currentHasQuestion: true,
  localDate: '2026-07-27',
  locale,
});

beforeEach(() => {
  deferred.length = 0;
  gistTranslations.mockResolvedValue(new Map());
});

afterEach(() => vi.clearAllMocks());

describe('recallChain and the recalled gist’s language', () => {
  it('does not look anything up when every recalled gist is already in the target', async () => {
    recallableReadings.mockResolvedValue([recalled({ locale: 'id' })]);

    const out = await recallChain(args('id'));

    expect(out?.recalled[0].gist).toBe('tambalan lama sudah tidak menahan apa-apa');
    // Not even the cheap read: same-locale recall is the common case and must cost
    // nothing at all.
    expect(gistTranslations).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(0);
  });

  it('prefers a cached translation when the recalled reading is in the other language', async () => {
    recallableReadings.mockResolvedValue([recalled({ locale: 'id' })]);
    gistTranslations.mockResolvedValue(new Map([[ID_A, 'the old patch is holding nothing']]));

    const out = await recallChain(args('en'));

    expect(out?.recalled[0].gist).toBe('the old patch is holding nothing');
    // Nothing to generate: the cache had it.
    expect(deferred).toHaveLength(0);
  });

  /*
   * THE ASSERTION THAT DECIDES WHETHER THIS PATH IS ACCEPTABLE AT ALL.
   *
   * On a miss the block uses the ORIGINAL and the generation is deferred. If this
   * awaited instead, every language switch would add a model call to the front of a
   * reading the querent is watching — which is the thing roadmap §6 exists to
   * prevent, and it would be invisible except as latency.
   */
  it('uses the original on a miss and NEVER awaits the model call', async () => {
    recallableReadings.mockResolvedValue([recalled({ locale: 'id' })]);

    const out = await recallChain(args('en'));

    expect(out?.recalled[0].gist).toBe('tambalan lama sudah tidak menahan apa-apa');
    expect(translateOrCached).not.toHaveBeenCalled();

    // ...but it IS scheduled, or the cache would never fill and the read above
    // would be dead code forever.
    expect(deferred).toHaveLength(1);
    await deferred[0]();
    expect(translateOrCached).toHaveBeenCalledTimes(1);
    expect(translateOrCached.mock.calls[0][0]).toMatchObject({
      entity: 'reading',
      entityId: ID_A,
      field: 'gist',
      sourceLocale: 'id',
      target: 'en',
    });
  });

  /*
   * `readings` IS IMMUTABLE (VD7), so a gist translation can never go stale — and
   * `sourceUpdatedAt` must therefore be a fixed past instant. `new Date()` here would
   * make every cached row look older than its source on the next read, and turn an
   * opportunistic one-off into one model call per reading forever.
   */
  it('passes a fixed sourceUpdatedAt, so the cached row is never treated as stale', async () => {
    recallableReadings.mockResolvedValue([recalled({ locale: 'id' })]);
    await recallChain(args('en'));
    await deferred[0]();

    const passed = translateOrCached.mock.calls[0][0] as unknown as { sourceUpdatedAt: Date };
    expect(passed.sourceUpdatedAt.getTime()).toBe(0);
  });

  it('returns null rather than throwing when the recall query fails', async () => {
    recallableReadings.mockRejectedValue(new Error('database down'));
    await expect(recallChain(args('en'))).resolves.toBeNull();
  });

  /*
   * The property is older than this workstream: a reading without the block is a
   * valid reading. A failure in the NEW code must not change that.
   */
  it('returns null rather than throwing when the translation lookup fails', async () => {
    recallableReadings.mockResolvedValue([recalled({ locale: 'id' })]);
    gistTranslations.mockRejectedValue(new Error('database down'));
    await expect(recallChain(args('en'))).resolves.toBeNull();
  });

  it('substitutes per reading, leaving same-locale recalls alone', async () => {
    const ID_B = '00000000-0000-4000-8000-00000000000b';
    recallableReadings.mockResolvedValue([
      recalled({ locale: 'id' }),
      recalled({ id: ID_B, locale: 'en', gist: 'the wheel came round again' }),
    ]);
    gistTranslations.mockResolvedValue(new Map([[ID_A, 'the old patch is holding nothing']]));

    const out = await recallChain(args('en'));

    expect(out?.recalled.map((r) => r.gist)).toEqual([
      'the old patch is holding nothing',
      'the wheel came round again',
    ]);
    // Only the foreign one was even asked about.
    expect(gistTranslations.mock.calls[0][1]).toEqual([ID_A]);
  });
});
