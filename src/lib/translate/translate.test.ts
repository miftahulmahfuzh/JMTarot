/**
 * The translator's wiring: the cache, the verification, the repair pass, and what
 * does and does not get persisted.
 *
 * Everything with prose in it is in `contract.test.ts`. What is asserted here is the
 * four things only the impure half can get wrong, and each of them decides something
 * real:
 *
 *   - A FRESH CACHED ROW MAKES NO MODEL CALL. Asserted on the CALL COUNT, because
 *     this is what decides whether the feature costs one model call or one per view.
 *   - A DIRTY GENERATION IS NOT PERSISTED. An unverified row in `translations` is
 *     exactly the failure the prompt hardening exists to prevent, and the cache
 *     would serve it forever.
 *   - A THROWING PROVIDER FALLS BACK TO THE SOURCE AND NEVER THROWS. The caller is
 *     a render path.
 *   - A ROW OLDER THAN ITS SOURCE IS STALE (T8), which is the whole reason
 *     `updated_at` is written by hand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const complete = vi.fn();
const streamReading = vi.fn();
vi.mock('@/lib/llm', () => ({ getProvider: () => ({ complete, streamReading }) }));

/**
 * THE STREAMED PATH RESERVES EXPLICITLY, because V9's decorator wraps `complete()`
 * only. Mocked so the reservation is both assertable and refusable — a `streamReading`
 * call site that forgot to reserve would be a model call outside the ceiling, and
 * there is a test below asserting a refusal produces the source rather than a stream.
 */
const reserveModelCall = vi.fn(async () => ({ ok: true }) as { ok: boolean; tier?: string });
vi.mock('@/lib/llm/meter', () => ({ reserveModelCall }));

/**
 * `track` and `defer` are replaced rather than exercised.
 *
 * `defer` in production hands work to the request's `after()`; here it RUNS the
 * callback and hands back its promise, so the repair pass is awaitable. That is a
 * fair substitution for what is being tested — that the repair happens off the
 * response path and that its result is what gets persisted — and it is the only way
 * to assert the second half without a Next request.
 */
const tracked: Array<{ name: string; props: Record<string, unknown> }> = [];
const deferred: Array<Promise<void>> = [];
vi.mock('@/lib/analytics/track', () => ({
  track: (name: string, props: Record<string, unknown>) => {
    tracked.push({ name, props });
  },
  defer: (fn: () => Promise<void>) => {
    deferred.push(fn());
  },
}));

import { fakeStream } from '@/lib/llm/fake';
import { TRANSLATABLE } from './keys';
import { translateOrCached, translateStream } from './translate';

/** A minimal in-memory stand-in for the two query functions the translator uses. */
type Row = {
  entity: string;
  entityId: string;
  field: string;
  locale: string;
  sourceLocale: string;
  body: string;
  model: string;
  promptVersion: string;
  updatedAt: Date;
  createdAt: Date;
};

let rows: Row[] = [];

vi.mock('@/lib/db/queries/translations', () => ({
  getTranslation: async (
    _db: unknown,
    key: { entity: string; entityId: string; field: string; locale: string },
  ) =>
    rows.find(
      (r) =>
        r.entity === key.entity &&
        r.entityId === key.entityId &&
        r.field === key.field &&
        r.locale === key.locale,
    ) ?? null,
  putTranslation: async (_db: unknown, input: Omit<Row, 'updatedAt' | 'createdAt'>) => {
    const now = new Date();
    const existing = rows.findIndex(
      (r) =>
        r.entity === input.entity &&
        r.entityId === input.entityId &&
        r.field === input.field &&
        r.locale === input.locale,
    );
    const row: Row = { ...input, updatedAt: now, createdAt: now };
    if (existing === -1) rows.push(row);
    else rows[existing] = row;
    return row;
  },
}));

/** The handle. Never touched — every query function above is mocked. */
const DB = {} as never;

const SOURCE = [
  'Yang sudah berjalan: The Tower jatuh di posisi pertama.',
  'Yang sedang berjalan: The Hermit meminta kamu diam dulu.',
].join('\n\n');

const CLEAN = [
  'What has passed: The Tower landed first.',
  'What is moving: The Hermit asks you to sit still a while.',
].join('\n\n');

const args = () =>
  ({
    entity: 'reading' as const,
    entityId: '11111111-1111-4111-8111-111111111111',
    field: 'body' as const,
    source: SOURCE,
    sourceLocale: 'id' as const,
    sourceUpdatedAt: new Date('2026-07-27T00:00:00Z'),
    target: 'en' as const,
    readerId: 'adrian' as const,
    serviceId: 'spread3' as const,
  });

beforeEach(() => {
  rows = [];
  tracked.length = 0;
  deferred.length = 0;
  vi.stubEnv('ANALYTICS_ENABLED', '1');
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const eventOf = () => tracked.find((t) => t.name === 'translation.generated')?.props;

describe('translateOrCached', () => {
  it('generates, verifies, persists and reports ok', async () => {
    complete.mockResolvedValue({ text: CLEAN, usage: { inputTokens: null, outputTokens: 40 } });

    const out = await translateOrCached(args(), DB);

    expect(out).toEqual({ body: CLEAN, outcome: 'ok', fellBack: false });
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe(CLEAN);
    expect(rows[0].sourceLocale).toBe('id');
    expect(eventOf()).toMatchObject({ outcome: 'ok', violation: null, streamed: false });
  });

  /*
   * THE ASSERTION THAT DECIDES THE COST OF THE FEATURE. A fresh cached row must
   * short-circuit before the provider is reached — not merely return the cached body
   * after generating a second one and throwing it away.
   */
  it('serves a fresh cached row with NO provider call at all', async () => {
    complete.mockResolvedValue({ text: CLEAN, usage: {} });
    await translateOrCached(args(), DB);
    expect(complete).toHaveBeenCalledTimes(1);

    complete.mockClear();
    tracked.length = 0;

    const out = await translateOrCached(args(), DB);
    expect(out).toEqual({ body: CLEAN, outcome: 'cached', fellBack: false });
    expect(complete).not.toHaveBeenCalled();
    expect(eventOf()).toMatchObject({ outcome: 'cached' });
  });

  /*
   * T8. A source regenerated in place underneath a cached translation makes that
   * translation stale, and `updated_at` is the comparison. For a reading this never
   * fires — VD7 makes the prose immutable — but the mechanism has to be right before
   * V8's `personas`, which regenerates on every tenth reading.
   */
  it('treats a row older than its source as stale and regenerates', async () => {
    complete.mockResolvedValue({ text: CLEAN, usage: {} });
    await translateOrCached(args(), DB);

    // The source moved after the translation was written.
    complete.mockClear();
    const NEWER = new Date(rows[0].updatedAt.getTime() + 60_000);
    complete.mockResolvedValue({ text: CLEAN, usage: {} });

    const out = await translateOrCached({ ...args(), sourceUpdatedAt: NEWER }, DB);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(out.outcome).toBe('ok');
  });

  it('treats a row whose prompt version has moved as stale', async () => {
    complete.mockResolvedValue({ text: CLEAN, usage: {} });
    await translateOrCached(args(), DB);

    rows[0].promptVersion = 'translate-v0';
    complete.mockClear();
    complete.mockResolvedValue({ text: CLEAN, usage: {} });

    await translateOrCached(args(), DB);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  /*
   * T5, AND THE SHARPEST TRADE IN THE WORKSTREAM.
   *
   * A dirty generation is NOT persisted — an unverified row would be served from the
   * cache forever, and the whole point of re-enforcing the base contract on the
   * translation is that this table never holds prose that failed it. The repair pass
   * runs behind the response and ITS result is what lands.
   */
  it('does not persist a dirty generation, and repairs behind the response', async () => {
    // "Pulan" for The Moon, in the shape CLAUDE.md records: the card name is gone.
    const dirty = CLEAN.replace('The Hermit', 'Si Pertapa');
    complete.mockResolvedValueOnce({ text: dirty, usage: {} });
    complete.mockResolvedValueOnce({ text: CLEAN, usage: {} });

    const out = await translateOrCached(args(), DB);

    // The viewer sees the failed attempt ONCE. That is the stated residual cost.
    expect(out.body).toBe(dirty);
    expect(out.outcome).toBe('invalid');
    expect(eventOf()).toMatchObject({ outcome: 'invalid', violation: 'card_name' });

    // Nothing was written on the response path.
    expect(rows).toHaveLength(0);

    await Promise.all(deferred);

    // ...and the repair is what got persisted, so the SECOND view is right.
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe(CLEAN);
    expect(tracked.filter((t) => t.name === 'translation.generated')).toHaveLength(2);
    expect(tracked.at(-1)?.props).toMatchObject({ outcome: 'repaired' });
  });

  it('persists nothing when the repair also fails', async () => {
    const dirty = CLEAN.replace('The Hermit', 'Si Pertapa');
    complete.mockResolvedValue({ text: dirty, usage: {} });

    const out = await translateOrCached(args(), DB);
    await Promise.all(deferred);

    expect(out.outcome).toBe('invalid');
    expect(rows).toHaveLength(0);
    // Two events: the response-path 'invalid' and the repair's own 'invalid'.
    expect(tracked.filter((t) => t.name === 'translation.generated')).toHaveLength(2);
  });

  /*
   * NEVER THROWS. The caller is a render path or a route handler, and a translation
   * that could throw would take a page with it. A failure falls back to the SOURCE,
   * which is honest — the prose really is in the other language — and `fellBack` is
   * how the caller knows to render it as-is with a `lang` attribute.
   */
  it('falls back to the source when the provider throws, and never throws itself', async () => {
    complete.mockRejectedValue(new Error('upstream died'));

    const out = await translateOrCached(args(), DB);

    expect(out).toEqual({ body: SOURCE, outcome: 'failed', fellBack: true });
    expect(rows).toHaveLength(0);
    expect(eventOf()).toMatchObject({ outcome: 'failed' });
  });

  it('treats an empty completion as a failure rather than an empty translation', async () => {
    complete.mockResolvedValue({ text: '   ', usage: {} });

    const out = await translateOrCached(args(), DB);

    expect(out.fellBack).toBe(true);
    expect(out.body).toBe(SOURCE);
    expect(rows).toHaveLength(0);
  });

  /*
   * A source already in the target language is a caller bug, and the check
   * constraint would reject the row — so it is caught here rather than in the
   * driver, because a 500 from a constraint is a worse answer than the prose.
   */
  it('returns the source unchanged when it is already in the target locale', async () => {
    const out = await translateOrCached({ ...args(), sourceLocale: 'en' }, DB);
    expect(out).toEqual({ body: SOURCE, outcome: 'cached', fellBack: true });
    expect(complete).not.toHaveBeenCalled();
  });

  it('declares the gist deferred to the model-call ceiling', async () => {
    complete.mockResolvedValue({ text: CLEAN, usage: {} });
    await translateOrCached({ ...args(), field: 'gist' }, DB);
    /*
     * The GIST is deferred: it is prompt input for a later reading and its absence
     * is a cache miss nobody can name. A reading body a person is waiting for is
     * `interactive`. `meter.ts`'s soft tier sheds the first and never the second.
     */
    expect(complete.mock.calls[0][1]).toMatchObject({ callClass: 'deferred' });
  });

  it('declares a buffered body translation interactive too', async () => {
    complete.mockResolvedValue({ text: CLEAN, usage: {} });
    await translateOrCached(args(), DB);
    expect(complete.mock.calls[0][1]).toMatchObject({ callClass: 'interactive' });
  });
});

describe('translateStream', () => {
  /**
   * The real provider shape: chunks in order, arriving one at a time.
   *
   * `mockImplementation` and not `mockReturnValue`, because a generator is consumed
   * once — a single instance handed to two calls leaves the second with an exhausted
   * iterator, which presents as "the stream died before its first token" and sends
   * the test down a completely different branch.
   */
  const streams = (text: string) =>
    streamReading.mockImplementation(() => fakeStream(text.match(/.{1,24}/gs) ?? []));

  it('yields the model’s chunks as they arrive, and resolves the same result', async () => {
    streams(CLEAN);

    const stream = translateStream(args(), DB);
    const chunks: string[] = [];
    for await (const chunk of stream) chunks.push(chunk);

    expect(chunks.join('')).toBe(CLEAN);
    // MORE THAN ONE, which is the assertion that this is a stream and not a
    // buffered body handed out in one piece. T5 refused the buffered design.
    expect(chunks.length).toBeGreaterThan(1);
    await expect(stream.result).resolves.toMatchObject({ outcome: 'ok', fellBack: false });
    expect(rows).toHaveLength(1);
  });

  /*
   * V9. `streamReading` is NOT wrapped by the metering decorator — `llm/index.ts`
   * spends a page on why — so a call site that does not reserve is a model call
   * outside the ceiling. There were two such sites before this one.
   */
  it('reserves against the model-call ceiling, and falls back when refused', async () => {
    streams(CLEAN);
    const stream = translateStream(args(), DB);
    for await (const _ of stream) void _;
    await stream.result;
    expect(reserveModelCall).toHaveBeenCalledWith('interactive');

    reserveModelCall.mockResolvedValueOnce({ ok: false, tier: 'hard' });
    streamReading.mockClear();

    /*
     * A DIFFERENT ENTITY, because the stream above just populated the cache for the
     * first one. Reusing it made this test assert a refusal against a cache hit --
     * which passed the reservation by never reaching it, and left the queued `once`
     * value for the NEXT test to consume. That is how one bad fixture failed two
     * tests in different places.
     */
    const refused = translateStream(
      { ...args(), entityId: '22222222-2222-4222-8222-222222222222' },
      DB,
    );
    let seen = '';
    for await (const chunk of refused) seen += chunk;

    expect(seen).toBe(SOURCE);
    expect(streamReading).not.toHaveBeenCalled();
    await expect(refused.result).resolves.toMatchObject({ outcome: 'failed', fellBack: true });
  });

  /*
   * T2: ONE CODE PATH FOR THE CALLER. A cache hit yields the cached body as a single
   * chunk rather than taking a different shape, so the route writes one reader and
   * the branch nobody exercises does not exist.
   */
  it('yields a cache hit as ONE chunk, so the caller has one code path', async () => {
    streams(CLEAN);
    const first = translateStream(args(), DB);
    for await (const _ of first) void _;
    await first.result;
    expect(rows).toHaveLength(1);

    streamReading.mockClear();

    const stream = translateStream(args(), DB);
    const chunks: string[] = [];
    for await (const chunk of stream) chunks.push(chunk);

    expect(chunks).toEqual([CLEAN]);
    expect(streamReading).not.toHaveBeenCalled();
    await expect(stream.result).resolves.toMatchObject({ outcome: 'cached' });
  });

  /*
   * THE FIRST CHUNK IS PULLED BEFORE ANYTHING IS YIELDED, so a call that dies before
   * its first token is a clean fallback to the source rather than a stream that
   * yields nothing. `/api/memory/summary` learned this and kept its 204 available.
   */
  it('yields the SOURCE when the call dies before its first token', async () => {
    streamReading.mockImplementation(() => fakeStream([], { failAfter: 0 }));

    const stream = translateStream(args(), DB);
    let seen = '';
    for await (const chunk of stream) seen += chunk;

    expect(seen).toBe(SOURCE);
    await expect(stream.result).resolves.toMatchObject({ outcome: 'failed', fellBack: true });
    expect(rows).toHaveLength(0);
  });

  /*
   * A MID-STREAM FAILURE STOPS RATHER THAN DISCARDING. The viewer has already read
   * part of it, and replacing that with untranslated Indonesian is worse than a short
   * translation. What arrived is still verified — and a truncated body fails the
   * paragraph check, so it is NOT persisted, which is the outcome that matters.
   */
  it('keeps what arrived when the stream dies mid-way, and persists none of it', async () => {
    streamReading.mockImplementation(() =>
      fakeStream(['What has passed: The Tower', ' landed'], { failAfter: 2 }),
    );

    const stream = translateStream(args(), DB);
    let seen = '';
    for await (const chunk of stream) seen += chunk;

    expect(seen).toBe('What has passed: The Tower landed');
    await expect(stream.result).resolves.toMatchObject({ outcome: 'invalid' });
    expect(rows).toHaveLength(0);
  });

  it('marks the event as streamed, which the buffered path does not', async () => {
    streams(CLEAN);
    const stream = translateStream(args(), DB);
    for await (const _ of stream) void _;
    await stream.result;
    expect(eventOf()).toMatchObject({ streamed: true });

    tracked.length = 0;
    rows = [];
    complete.mockResolvedValue({ text: CLEAN, usage: {} });
    await translateOrCached(args(), DB);
    expect(eventOf()).toMatchObject({ streamed: false });
  });

  /*
   * The promise must settle even for a consumer that stops pulling — the route's
   * `after()` awaits it, and an unsettled promise parks that callback on its timeout
   * for every abandoned translation. Same property, same reason, as
   * `LLMStream.usage`.
   */
  it('settles `result` even when the consumer abandons the iterator', async () => {
    streams(CLEAN);

    const stream = translateStream(args(), DB);
    const it = stream[Symbol.asyncIterator]();
    await it.next();
    await it.return?.(undefined);

    await expect(stream.result).resolves.toMatchObject({ fellBack: true });
  });
});

describe('the registry decides which shape a caller gets', () => {
  it('agrees with TRANSLATABLE about what streams', () => {
    // The route reads `TRANSLATABLE[key].stream` to choose. This is the assertion
    // that the registry is the thing making the decision rather than a second
    // opinion inside the translator.
    expect(TRANSLATABLE['reading.body'].stream).toBe(true);
    expect(TRANSLATABLE['reading.gist'].stream).toBe(false);
  });
});
