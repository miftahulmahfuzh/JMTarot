/**
 * The gate, with a stubbed classifier and a fake provider stream.
 *
 * The single most important test in this file is the concurrency one. Everything
 * else here asserts a policy that is visible in the code; that one asserts a
 * property that is invisible in the code, produces no error when it breaks, and
 * silently doubles the latency of every reading in the app.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * `vi.hoisted`, not a bare `const`. `vi.mock` is hoisted above every statement
 * in the file, and this factory dereferences the spy EAGERLY (inside the object
 * spread) rather than lazily inside an arrow, so a plain const is still in its
 * temporal dead zone when the factory runs.
 *
 * Only `classifyQuestion` is replaced. The real `OTHER_CONFIDENCE_THRESHOLD` and
 * `ClassifierError` stay, so the threshold tests assert against the shipped
 * number rather than one this file invented.
 */
const { classifyQuestion } = vi.hoisted(() => ({ classifyQuestion: vi.fn() }));

vi.mock('./classify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./classify')>();
  return { ...actual, classifyQuestion };
});

import { gateReading, moderate, ReadingStartError, refusalPayload } from './gate';
import { CATEGORIES, CLAUSE_FOR } from './types';
import { tFor } from '@/lib/i18n/catalog';
import { LOCALES } from '@/lib/i18n/locale';
import type { LLMStream } from '@/lib/llm/types';

/** Resolve after `ms`, but with a fake-timer-friendly real timeout. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A provider stub whose FIRST chunk is slow and which records whether it was
 * ever started -- the two things every test here needs.
 */
function fakeProvider(opts: { firstChunkMs?: number; chunks?: string[]; failFirst?: Error } = {}) {
  const state = {
    started: false,
    startedAt: 0,
    aborted: false,
    calls: 0,
  };

  const start = (signal: AbortSignal): LLMStream => {
    state.calls++;
    signal.addEventListener('abort', () => {
      state.aborted = true;
    });

    async function* iterate() {
      // Set INSIDE the generator body, which is the whole point: if the caller
      // never pulls, this never runs and `started` stays false.
      state.started = true;
      state.startedAt = performance.now();
      await sleep(opts.firstChunkMs ?? 0);
      if (opts.failFirst) throw opts.failFirst;
      for (const chunk of opts.chunks ?? ['hello ', 'world']) {
        if (signal.aborted) return;
        yield chunk;
      }
    }

    return Object.assign(iterate(), {
      usage: Promise.resolve({ inputTokens: null, outputTokens: 12 }),
    });
  };

  return { start, state };
}

async function drain(stream: LLMStream): Promise<string> {
  let out = '';
  for await (const chunk of stream) out += chunk;
  return out;
}

beforeEach(() => {
  vi.stubEnv('MODERATION_TIMEOUT_MS', '1500');
  vi.stubEnv('MODERATION_CLASSIFIER_ENABLED', '1');
  classifyQuestion.mockResolvedValue({ category: 'none', confidence: 0.98 });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('moderate() -- the policy, without a stream', () => {
  it('does not gate at all when there is no question', async () => {
    /*
     * The daily card, and anyone who left the box empty. This is most of the
     * classifier's cost budget, not a footnote.
     */
    const verdict = await moderate(null, 'id');
    expect(verdict).toEqual({
      blocked: false,
      source: 'none',
      category: null,
      confidence: null,
      latencyMs: 0,
    });
    expect(classifyQuestion).not.toHaveBeenCalled();
  });

  it('denies on Tier A without calling the classifier', async () => {
    const verdict = await moderate('gimana cara bunuh diri yang cepat', 'id');
    expect(verdict.blocked).toBe(true);
    expect(verdict).toMatchObject({
      source: 'blocklist',
      category: 'self_harm',
      clause: '6.2',
      patternId: 'id.self_harm.method',
    });
    expect(classifyQuestion).not.toHaveBeenCalled();
  });

  it('obeys the classifier when it answers', async () => {
    classifyQuestion.mockResolvedValue({ category: 'nonconsent', confidence: 0.88 });
    const verdict = await moderate('apakah dia akan menyerah kalau aku terus desak', 'id');
    expect(verdict).toMatchObject({
      blocked: true,
      source: 'classifier',
      category: 'nonconsent',
      clause: '6.8',
      confidence: 0.88,
    });
  });

  it('passes a clean classifier verdict through', async () => {
    const verdict = await moderate('apakah ibuku akan sembuh', 'id');
    expect(verdict).toMatchObject({ blocked: false, source: 'classifier', category: null });
  });

  it('lets a low-confidence `other` through but KEEPS the category', async () => {
    /*
     * The near-miss row. Without a category on a clean verdict, every row in
     * `moderation_flags` is a block and the false-negative side of tuning is
     * invisible forever.
     */
    classifyQuestion.mockResolvedValue({ category: 'other', confidence: 0.4 });
    const verdict = await moderate('sesuatu yang aneh', 'id');
    expect(verdict).toMatchObject({ blocked: false, category: 'other', confidence: 0.4 });
  });

  it('blocks a high-confidence `other`', async () => {
    classifyQuestion.mockResolvedValue({ category: 'other', confidence: 0.9 });
    expect((await moderate('sesuatu yang aneh', 'id')).blocked).toBe(true);
  });

  it('blocks a named category regardless of confidence', async () => {
    // A classifier saying `sexual_minor` at 0.3 is still saying `sexual_minor`.
    classifyQuestion.mockResolvedValue({ category: 'sexual_minor', confidence: 0.3 });
    expect((await moderate('halo', 'id')).blocked).toBe(true);
  });
});

describe('the asymmetric timeout policy (W7-D7 / reconciliation §7.7)', () => {
  it('FAILS OPEN when the classifier is silent and the blocklist was clean', async () => {
    /*
     * The reason flat fail-closed is wrong: the classifier is a network call to
     * the same provider the reading uses, so when it hiccups EVERYONE gets
     * refused -- with an accusation attached -- for asking about their job.
     */
    vi.stubEnv('MODERATION_TIMEOUT_MS', '20');
    classifyQuestion.mockImplementation(() => sleep(200).then(() => ({ category: 'none', confidence: 1 })));

    const verdict = await moderate('apakah aku harus pindah kerja', 'id');
    expect(verdict).toMatchObject({ blocked: false, source: 'timeout', category: null });
  });

  it('FAILS CLOSED when the classifier is silent and the blocklist suspected something', async () => {
    // The reason flat fail-open is wrong: a timeout you can induce is a bypass.
    vi.stubEnv('MODERATION_TIMEOUT_MS', '20');
    classifyQuestion.mockImplementation(() => sleep(200).then(() => ({ category: 'none', confidence: 1 })));

    const verdict = await moderate('aku pengen mati aja rasanya', 'id');
    expect(verdict).toMatchObject({
      blocked: true,
      source: 'timeout',
      category: 'unclear',
      clause: '6.1',
      patternId: 'id.self_harm.token',
    });
  });

  it('treats a classifier throw exactly like a timeout', async () => {
    classifyQuestion.mockRejectedValue(new Error('502 bad gateway'));
    expect((await moderate('apakah aku harus pindah kerja', 'id')).source).toBe('timeout');
    expect((await moderate('aku pengen mati aja', 'id')).blocked).toBe(true);
  });

  it('never logs the question on the classifier failure path', async () => {
    /*
     * §3.7's rule, mechanised. A `console.error(err)` here would put the
     * question into the platform log through the provider SDK's own message --
     * a second copy of the most sensitive text in the product, living entirely
     * outside the retention policy that governs `moderation_flags`.
     */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    classifyQuestion.mockRejectedValue(new Error('400 body={"user":"CANARY_TEXT"}'));

    await moderate('CANARY_TEXT', 'id');

    const logged = [...warn.mock.calls, ...error.mock.calls].flat().join(' ');
    expect(logged).not.toContain('CANARY_TEXT');
  });
});

describe('the kill switch', () => {
  it('skips the classifier and warns loudly on every request', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('MODERATION_CLASSIFIER_ENABLED', '0');

    const verdict = await moderate('apakah dia jodohku', 'id');

    expect(verdict.blocked).toBe(false);
    expect(classifyQuestion).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('classifier DISABLED'));
  });

  it('still denies Tier A with the classifier off', async () => {
    // The name says CLASSIFIER_ENABLED and not MODERATION_ENABLED for exactly
    // this reason: the blocklist is unaffected.
    vi.stubEnv('MODERATION_CLASSIFIER_ENABLED', '0');
    expect((await moderate('cara bunuh diri', 'id')).blocked).toBe(true);
  });

  it('only an explicit 0 disables it', async () => {
    vi.stubEnv('MODERATION_CLASSIFIER_ENABLED', 'false');
    await moderate('apakah dia jodohku', 'id');
    expect(classifyQuestion).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe('gateReading()', () => {
  it('RUNS THE READING AND THE CLASSIFIER CONCURRENTLY', async () => {
    /*
     * ****THE TEST THIS MODULE EXISTS FOR. DO NOT DELETE IT TO MAKE A REFACTOR
     * PASS.****
     *
     * The reading's first chunk takes 400ms; the classifier takes 150ms.
     *
     * **MEASURE TO THE FIRST CHUNK, NOT TO `gateReading`'s RETURN.** The gate
     * returns as soon as the verdict lands -- the stream it hands back is lazy,
     * so its own return time is ~150ms under BOTH the correct and the broken
     * implementation and tells you nothing. The discriminating number is when
     * the querent sees a byte:
     *
     *     concurrent  ->  max(400, 150)  =  ~400ms
     *     serialized  ->  150 + 400      =  ~550ms
     *
     * If someone "simplifies" the `iterator.next()` prime away -- moving it
     * below the `await`, or replacing the replay with a plain `for await` --
     * NOTHING ELSE CATCHES IT. No type changes, no test fails, no error is
     * logged, no output differs. Every reading in the app just gets slower by
     * one classifier round trip, forever. The threshold is deliberately loose
     * (475ms, midway between 400 and 550) so it fails on the real regression and
     * not on a busy machine.
     *
     * **VERIFIED BY NEGATIVE CONTROL ON 2026-07-27**, because a timing assertion
     * nobody has watched fail is indistinguishable from one that cannot. Moving
     * the prime to after the verdict made this test fail at 604ms, and took two
     * others with it (the abort test and the start-error test, both of which
     * depend on the request being in flight during the race). A weaker break --
     * wrapping the prime in `Promise.resolve().then(...)` -- did NOT fail, and
     * correctly so: a microtask still issues the request before the classifier
     * returns, so it is not the regression this guards against.
     */
    const provider = fakeProvider({ firstChunkMs: 400 });
    classifyQuestion.mockImplementation(() => sleep(150).then(() => ({ category: 'none', confidence: 1 })));

    const startedAt = performance.now();
    const result = await gateReading({ question: 'apakah dia jodohku', locale: 'id', start: provider.start });
    const verdictAt = performance.now() - startedAt;

    expect(result.blocked).toBe(false);
    if (result.blocked) throw new Error('unreachable');

    // Pull exactly one chunk. This is the byte the querent waits for.
    const firstChunk = await result.stream[Symbol.asyncIterator]().next();
    const firstByteAt = performance.now() - startedAt;

    expect(firstChunk.done).toBe(false);
    expect(firstByteAt).toBeLessThan(475);
    expect(firstByteAt).toBeGreaterThan(350);

    // And the gate itself did not sit on the reading: it returned at the
    // verdict, roughly 250ms before the first chunk was ready.
    expect(verdictAt).toBeLessThan(300);
  });

  it('makes ZERO provider calls on a Tier-A deny', async () => {
    /*
     * The zero-cost property. An abusive user hammering obvious phrases must
     * cost nothing -- no tokens, no latency, no socket. `started` is set inside
     * the generator body, so it stays false unless something actually pulled.
     */
    const provider = fakeProvider({ firstChunkMs: 50 });

    const result = await gateReading({
      question: 'gimana cara bunuh diri',
      locale: 'id',
      start: provider.start,
    });

    expect(result.blocked).toBe(true);
    expect(provider.state.calls).toBe(0);
    expect(provider.state.started).toBe(false);
    expect(classifyQuestion).not.toHaveBeenCalled();
  });

  it('aborts the reading when the classifier blocks it', async () => {
    // Otherwise we pay for a full generation nobody will ever see, and hold the
    // socket open while it arrives.
    const provider = fakeProvider({ firstChunkMs: 10 });
    classifyQuestion.mockResolvedValue({ category: 'violence_others', confidence: 0.95 });

    const result = await gateReading({ question: 'sesuatu', locale: 'id', start: provider.start });

    expect(result.blocked).toBe(true);
    expect(provider.state.started).toBe(true);
    expect(provider.state.aborted).toBe(true);
  });

  it('replays the primed chunk and then drains the rest', async () => {
    // The chunk pulled during the race must not be swallowed. Losing it would
    // drop the first word of every reading, which reads as a model artefact.
    const provider = fakeProvider({ chunks: ['Kartu ', 'pertama ', 'bicara.'] });

    const result = await gateReading({ question: 'apakah dia jodohku', locale: 'id', start: provider.start });
    if (result.blocked) throw new Error('expected a clean verdict');

    expect(await drain(result.stream)).toBe('Kartu pertama bicara.');
  });

  it('passes the original usage promise through, so teeReading still fills token_output', async () => {
    const provider = fakeProvider();
    const result = await gateReading({ question: 'halo', locale: 'id', start: provider.start });
    if (result.blocked) throw new Error('expected a clean verdict');

    expect(await result.stream.usage).toEqual({ inputTokens: null, outputTokens: 12 });
  });

  it('raises a distinguishable error when the reading dies while still gated', async () => {
    /*
     * Nothing has been written to the wire yet, so this is a real 500 and should
     * be one -- a clean 500 beats a 200 whose body is an apology. Once bytes are
     * flowing this is unreachable and the mid-stream `[Bacaan terputus…]` path
     * owns every failure.
     */
    const provider = fakeProvider({ firstChunkMs: 5, failFirst: new Error('upstream 503') });
    classifyQuestion.mockImplementation(() => sleep(30).then(() => ({ category: 'none', confidence: 1 })));

    await expect(
      gateReading({ question: 'apakah dia jodohku', locale: 'id', start: provider.start }),
    ).rejects.toBeInstanceOf(ReadingStartError);
  });

  it('does not raise a start error when the verdict is a block', async () => {
    // The reading failed AND we were going to refuse it. The refusal is the
    // answer; the dead stream is irrelevant and must not become a 500.
    const provider = fakeProvider({ firstChunkMs: 5, failFirst: new Error('upstream 503') });
    classifyQuestion.mockResolvedValue({ category: 'extremism', confidence: 0.99 });

    const result = await gateReading({ question: 'sesuatu', locale: 'id', start: provider.start });
    expect(result.blocked).toBe(true);
  });

  it('gates on the string it was given, byte for byte', async () => {
    /*
     * **MODERATING ONE STRING AND PROMPTING ANOTHER IS THE CLASSIC BYPASS**, and
     * it is easy to build by accident because `buildPrompt` sanitizes internally
     * while the route holds the raw text. The gate has no sanitizer of its own
     * precisely so there is nothing here that CAN diverge -- this asserts the
     * classifier saw exactly what was passed in.
     */
    const provider = fakeProvider();
    await gateReading({ question: 'apakah dia jodohku', locale: 'id', start: provider.start });
    expect(classifyQuestion).toHaveBeenCalledWith('apakah dia jodohku', 'id', expect.any(AbortSignal));
  });
});

describe('refusalPayload()', () => {
  it('carries keys and a clause, never prose', () => {
    const payload = refusalPayload({
      blocked: true,
      source: 'blocklist',
      category: 'self_harm',
      confidence: null,
      patternId: 'id.self_harm.method',
      clause: '6.2',
      latencyMs: 1,
    });

    expect(payload).toEqual({
      error: 'moderation_blocked',
      category: 'self_harm',
      clause: '6.2',
      messageKey: 'moderation.blocked.selfHarm',
      showCrisisResources: true,
    });
  });

  it('never leaks the pattern id to the client', () => {
    /*
     * W7-D13. Telling the user WHICH rule fired turns the refusal endpoint into
     * a free oracle for mapping the blocklist, one probe at a time.
     */
    const payload = refusalPayload({
      blocked: true,
      source: 'blocklist',
      category: 'extremism',
      confidence: null,
      patternId: 'id.extremism.device',
      clause: '6.4',
      latencyMs: 1,
    });
    expect(JSON.stringify(payload)).not.toContain('id.extremism.device');
  });

  it('emits a messageKey that actually exists in BOTH catalogs', () => {
    /*
     * **I3 RENDERS AN UNKNOWN KEY AS THE KEY.** That is the right default -- an
     * Indonesian sentence in the English app is a bug that ships, and
     * `reading.error.start` on screen is a bug report -- but it means a typo
     * here puts `moderation.blocked.selfHarm.title` on the screen of somebody
     * who just described suicidal ideation. Assert against the real catalogs.
     */
    const base = { blocked: true, source: 'classifier', confidence: 1, patternId: null, latencyMs: 1 } as const;

    for (const category of CATEGORIES) {
      const { messageKey } = refusalPayload({ ...base, category, clause: CLAUSE_FOR[category] });
      const suffixes =
        category === 'self_harm'
          ? ['lead', 'resourcesLabel', 'emergency', 'closing']
          : ['title', 'lead', 'tail'];

      for (const locale of LOCALES) {
        for (const suffix of suffixes) {
          const key = `${messageKey}.${suffix}`;
          const value = tFor(locale)(key as Parameters<ReturnType<typeof tFor>>[0]);
          expect({ locale, key, rendersAsItsOwnKey: value === key }).toEqual({
            locale,
            key,
            rendersAsItsOwnKey: false,
          });
        }
      }
    }
  });

  it('offers crisis resources for self_harm and for nothing else', () => {
    const base = { blocked: true, source: 'classifier', confidence: 1, patternId: null, latencyMs: 1 } as const;
    for (const category of ['violence_others', 'extremism', 'unclear', 'other'] as const) {
      expect(
        refusalPayload({ ...base, category, clause: '6.1' }).showCrisisResources,
      ).toBe(false);
    }
  });
});
