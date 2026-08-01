/**
 * `ADMIN_MODEL`'s resolution, both halves.
 *
 * **THE POINT OF THIS FILE IS THAT THE TWO FUNCTIONS AGREE.** `adminModel()` is what the
 * provider is told and `adminModelName()` is what the row records, and they resolve the
 * same chain in two places — `adminModelName()` restating `ledger.ts`'s `||` rather than
 * importing it, because that module reaches `server-only`. A drift between them writes a
 * stored `insights.model` that names a different model from the `llm_calls` row beside
 * it, and nothing on screen would show it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminModel, adminModelName } from './model';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('adminModel', () => {
  it('returns the override when it is set', () => {
    vi.stubEnv('ADMIN_MODEL', 'glm-5.2');
    expect(adminModel()).toBe('glm-5.2');
  });

  it('returns undefined when unset, so LLM_MODEL stays in charge', () => {
    /*
     * **`undefined`, NEVER `'unknown'`.** `LLMCallOpts.model` is optional and both
     * adapters read `opts?.model ?? requireEnv('LLM_MODEL')` — a string here would be
     * sent to the provider verbatim.
     */
    vi.stubEnv('ADMIN_MODEL', undefined);
    vi.stubEnv('LLM_MODEL', 'glm-4.6');
    expect(adminModel()).toBeUndefined();
  });

  it('treats an EMPTY string as unset', () => {
    // A Vercel variable added and then cleared looks exactly like this, and `''` reaching
    // an adapter is a 400 that reads like a bad key.
    vi.stubEnv('ADMIN_MODEL', '');
    expect(adminModel()).toBeUndefined();
  });
});

describe('adminModelName', () => {
  it('prefers ADMIN_MODEL', () => {
    vi.stubEnv('ADMIN_MODEL', 'glm-5.2');
    vi.stubEnv('LLM_MODEL', 'glm-4.6');
    expect(adminModelName()).toBe('glm-5.2');
  });

  it('falls back to LLM_MODEL, exactly as the ledger does', () => {
    vi.stubEnv('ADMIN_MODEL', undefined);
    vi.stubEnv('LLM_MODEL', 'glm-4.6');
    expect(adminModelName()).toBe('glm-4.6');
  });

  it("is 'unknown' only when both are absent, which is a broken deployment", () => {
    vi.stubEnv('ADMIN_MODEL', undefined);
    vi.stubEnv('LLM_MODEL', undefined);
    expect(adminModelName()).toBe('unknown');
  });

  it('names the SAME model the provider would resolve, on every branch', () => {
    /*
     * The agreement, asserted as one property rather than three coincidences.
     * `resolvedByLedger` is `ledger.ts`'s line copied verbatim; if either side moves,
     * this goes red rather than a stored row quietly disagreeing with the ledger.
     */
    const resolvedByLedger = (override: string | undefined) =>
      override || process.env.LLM_MODEL || 'unknown';

    for (const [admin, llm] of [
      ['glm-5.2', 'glm-4.6'],
      [undefined, 'glm-4.6'],
      ['', 'glm-4.6'],
      [undefined, undefined],
    ] as const) {
      vi.stubEnv('ADMIN_MODEL', admin);
      vi.stubEnv('LLM_MODEL', llm);
      expect({ admin, llm, name: adminModelName() }).toEqual({
        admin,
        llm,
        name: resolvedByLedger(adminModel()),
      });
    }
  });
});
