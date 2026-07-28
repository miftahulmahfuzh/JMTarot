/**
 * THE MINT-TIME PIN, WHICH IS THE ONE INVARIANT THE PER-LOCALE SHARE LINK RESTS ON.
 *
 *   **A non-NULL `share_links.locale` always has a `translations` row behind it.**
 *
 * `/s/` cannot generate (VD7 — no session, no per-user budget), so it reads the
 * pinned translation and on a miss silently renders the source. Once a querent can
 * hold an "English link" and a "Bahasa link" as separate addresses, a pin with no
 * row behind it is a link that lies about its own language — and the notice that
 * used to explain a mismatch was deleted on 2026-07-28, so there is nothing on the
 * page to soften it.
 *
 * ── WHY THIS IS A UNIT TEST AND NOT AN INTEGRATION ONE ──────────────────────────
 *
 * The decision being tested is *which locale gets written*, and its inputs are the
 * source locale and `TranslateResult.fellBack`. A real Postgres can prove the row
 * came out with `locale = 'en'`; only a mocked translator can prove it came out
 * NULL **because the translation fell back**, since a real one succeeds. The
 * integration suite covers the other half — that two locales are two rows.
 *
 * `resolvePin` is deliberately NOT exported. Testing through `createShareLink`
 * means the mocks sit where the real dependencies are and the test cannot pass
 * against a function nothing calls.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TranslateResult } from '@/lib/translate/translate';

const ownsShareableReading = vi.fn();
const shareableReadingSource = vi.fn();
const anyShareLinkFor = vi.fn();
const insertOrRotateShareLink = vi.fn();
const translateOrCached = vi.fn();

vi.mock('@/lib/db/client', () => ({ db: {} }));

vi.mock('@/lib/db/queries/share', () => ({
  ownsShareableReading: (...a: unknown[]) => ownsShareableReading(...a),
  shareableReadingSource: (...a: unknown[]) => shareableReadingSource(...a),
  anyShareLinkFor: (...a: unknown[]) => anyShareLinkFor(...a),
  insertOrRotateShareLink: (...a: unknown[]) => insertOrRotateShareLink(...a),
  publicPersonaForShare: vi.fn(async () => null),
  publicReadingForShare: vi.fn(async () => null),
  markReadingShared: vi.fn(async () => undefined),
  revokeShareLink: vi.fn(async () => 0),
  shareLinkById: vi.fn(async () => null),
  shareLinkBySlug: vi.fn(async () => null),
}));

vi.mock('@/lib/translate/translate', () => ({
  translateOrCached: (...a: unknown[]) => translateOrCached(...a),
}));

vi.mock('@/lib/db/queries/translations', () => ({
  getTranslation: vi.fn(async () => null),
}));

const { createShareLink } = await import('./links');

const READING = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

/** The pin the statement was actually given. */
function writtenPin(): unknown {
  return insertOrRotateShareLink.mock.calls[0]?.[1]?.locale;
}

function source(locale: 'id' | 'en') {
  return {
    body: 'sebuah bacaan yang utuh, empat paragraf',
    locale,
    readerId: 'thessaly',
    serviceId: 'spread3',
    createdAt: new Date('2026-07-28T00:00:00Z'),
  };
}

function result(o: Partial<TranslateResult>): TranslateResult {
  return { body: 'a whole reading', outcome: 'ok', fellBack: false, ...o };
}

async function mint(locale: 'id' | 'en') {
  return createShareLink({
    userId: USER,
    entity: 'reading',
    entityId: READING,
    includeQuestion: true,
    includeNickname: false,
    locale,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ownsShareableReading.mockResolvedValue(true);
  anyShareLinkFor.mockResolvedValue(null);
  insertOrRotateShareLink.mockImplementation(async (_db: unknown, values: { locale?: unknown }) => ({
    id: '33333333-3333-4333-8333-333333333333',
    slug: 'abcdefghijkm',
    includeQuestion: true,
    includeNickname: false,
    locale: values.locale ?? null,
  }));
});

describe('the mint-time pin', () => {
  it('pins the target and calls NO model when the reading is already in that language', async () => {
    shareableReadingSource.mockResolvedValue(source('id'));

    const out = await mint('id');

    expect(out.ok).toBe(true);
    expect(writtenPin()).toBe('id');
    /*
     * THE ASSERTION THAT MATTERS HERE IS THE NEGATIVE ONE. Nothing translates `id`
     * into `id`, so the resolver will find no row and fall through to as-written —
     * which renders the same prose. Reaching for a model to discover that would put
     * a model call on every same-language share in the app.
     */
    expect(translateOrCached).not.toHaveBeenCalled();
  });

  it('pins the target when the translation succeeded', async () => {
    shareableReadingSource.mockResolvedValue(source('id'));
    translateOrCached.mockResolvedValue(result({ outcome: 'ok', fellBack: false }));

    const out = await mint('en');

    expect(out.ok && out.locale).toBe('en');
    expect(writtenPin()).toBe('en');
    expect(translateOrCached).toHaveBeenCalledTimes(1);
    // The immutable-source contract: `created_at` is the staleness comparand.
    expect(translateOrCached.mock.calls[0][0]).toMatchObject({
      entity: 'reading',
      entityId: READING,
      field: 'body',
      sourceLocale: 'id',
      target: 'en',
      sourceUpdatedAt: new Date('2026-07-28T00:00:00Z'),
    });
  });

  it('pins the target on a CACHE HIT, which is the common case and costs nothing', async () => {
    shareableReadingSource.mockResolvedValue(source('id'));
    translateOrCached.mockResolvedValue(result({ outcome: 'cached', fellBack: false }));

    await mint('en');

    expect(writtenPin()).toBe('en');
  });

  it('PINS NULL WHEN THE TRANSLATION FELL BACK, rather than claiming a language', async () => {
    /*
     * **THE HEADLINE TEST.** `translateStream`/`translateOrCached` return the SOURCE
     * VERBATIM on failure with `fellBack: true`. Pinning `en` here would produce a
     * row asserting an English body that does not exist, and `/s/` would serve
     * Indonesian prose under an English link with nothing to explain it. NULL means
     * as-written, which is true.
     */
    shareableReadingSource.mockResolvedValue(source('id'));
    translateOrCached.mockResolvedValue(result({ outcome: 'failed', fellBack: true }));

    const out = await mint('en');

    expect(out.ok).toBe(true);
    expect(out.ok && out.locale).toBeNull();
    expect(writtenPin()).toBeNull();
  });

  it('pins the target for outcome `invalid`, because that body WAS translated', async () => {
    /*
     * **`fellBack` IS THE CHECK AND `outcome` IS NOT A SUBSTITUTE**, in both
     * directions. `invalid` is prose in the target language that failed the
     * contract: the viewer sees it once and V2's deferred repair pass fixes the
     * cache. Keying the pin on `outcome === 'ok'` would refuse a pin for a
     * translation that exists, and the querent would get an as-written link while
     * reading English.
     */
    shareableReadingSource.mockResolvedValue(source('id'));
    translateOrCached.mockResolvedValue(result({ outcome: 'invalid', fellBack: false }));

    await mint('en');

    expect(writtenPin()).toBe('en');
  });

  it('asks about a prior row AT THE PIN, not at the requested locale', async () => {
    /*
     * `rotated` counts "an address was replaced". The row a fallback could conflict
     * with is the NULL one, so asking `anyShareLinkFor` about `en` would report a
     * rotation of a row the statement is not going to touch — and miss the one it
     * is.
     */
    shareableReadingSource.mockResolvedValue(source('id'));
    translateOrCached.mockResolvedValue(result({ fellBack: true }));

    await mint('en');

    expect(anyShareLinkFor).toHaveBeenCalledWith({}, USER, 'reading', READING, null);
  });

  it('pins NULL when the source row vanished between two statements', async () => {
    // `ownsShareableReading` already said yes, so this is a real race, not garbage
    // input. The mint is about to fail on the artifact anyway; do not claim a pin.
    shareableReadingSource.mockResolvedValue(null);

    await mint('en');

    expect(writtenPin()).toBeNull();
    expect(translateOrCached).not.toHaveBeenCalled();
  });
});
