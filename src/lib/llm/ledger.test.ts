/**
 * `ledger.ts`'s two pure-ish helpers. The sink's three branches live in
 * `track.test.ts`, where the ALS store and the mocked `after()` are.
 *
 * `usageOrNulls` is the bound invariant 2 names: **a ledger row with null tokens is a
 * fact; a request held open for a token count is a bug.** All three properties are
 * invisible until they cost something in production -- it always settles, it never
 * rejects, and it gives up on time -- so all three are asserted here.
 */
import { describe, expect, it, vi } from 'vitest';
import { USAGE_TIMEOUT_MS, resolvedModel, usageOrNulls } from './ledger';
import type { ReadingUsage } from './types';

const NULLS: ReadingUsage = { inputTokens: null, outputTokens: null };

describe('usageOrNulls', () => {
  it('returns the counts when the provider settles in time', async () => {
    const usage = Promise.resolve({ inputTokens: 1200, outputTokens: 340 });
    expect(await usageOrNulls(usage)).toEqual({ inputTokens: 1200, outputTokens: 340 });
  });

  it('gives up with NULLS rather than hanging, and does not reject', async () => {
    vi.useFakeTimers();
    try {
      // A provider that never settles. Without the bound this parks the request's
      // after() callback for as long as the platform allows, per model call.
      const race = usageOrNulls(new Promise<ReadingUsage>(() => {}), 50);
      await vi.advanceTimersByTimeAsync(50);
      await expect(race).resolves.toEqual(NULLS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('RESOLVES rather than rejects when a provider breaks the never-reject contract', async () => {
    /*
     * `types.ts` says `usage` must never reject, and both adapters honour it. If one
     * ever stops, the right answer is two null columns -- an unhandled rejection is a
     * process warning today and a crash under some configurations, for a token count.
     */
    const usage = Promise.reject(new Error('provider broke its contract'));
    await expect(usageOrNulls(usage)).resolves.toEqual(NULLS);
  });

  it('clears its timer, so a settled call leaves nothing pending', async () => {
    vi.useFakeTimers();
    try {
      await usageOrNulls(Promise.resolve({ inputTokens: 5, outputTokens: 5 }));
      // A leaked 2000ms timer per model call keeps a serverless invocation alive for
      // no reason, which is the whole thing the bound exists to prevent.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('defaults to tee.ts\'s two seconds', () => {
    // Equal by intent rather than by import: `tee.ts` keeps its own private copy and
    // A2 may not edit that file (reconciliation R2). If one moves, move both.
    expect(USAGE_TIMEOUT_MS).toBe(2000);
  });
});

describe('resolvedModel', () => {
  it('prefers the per-call override, which is how MODERATION_MODEL lands', () => {
    vi.stubEnv('LLM_MODEL', 'glm-4.6');
    expect(resolvedModel({ model: 'glm-4.5-flash' })).toBe('glm-4.5-flash');
    vi.unstubAllEnvs();
  });

  it('falls back to LLM_MODEL, exactly as the adapters do', () => {
    vi.stubEnv('LLM_MODEL', 'glm-4.6');
    expect(resolvedModel({})).toBe('glm-4.6');
    vi.unstubAllEnvs();
  });

  it("is 'unknown' with nothing set, and NEVER 'fallback'", () => {
    /*
     * `readings.model` uses `'fallback'` for the stub paths. It can never be right
     * here: a template written by no model makes no call and therefore has no row, so
     * a `'fallback'` row in this table would be a model call that did not happen.
     */
    vi.stubEnv('LLM_MODEL', undefined);
    expect(resolvedModel({})).toBe('unknown');
    vi.unstubAllEnvs();
  });

  it('treats an EMPTY model as absent, because `requireEnv` does', () => {
    /*
     * Both adapters resolve the model with `requireEnv('LLM_MODEL')`, whose test is
     * `!value` -- so `LLM_MODEL=''` throws before a provider is reached. A `??` here
     * would have written `model: ''`, a ledger row naming a model that cannot exist.
     * This case is why the function uses `||`.
     */
    vi.stubEnv('LLM_MODEL', '');
    expect(resolvedModel({})).toBe('unknown');
    expect(resolvedModel({ model: '' })).toBe('unknown');
    vi.unstubAllEnvs();
  });
});
