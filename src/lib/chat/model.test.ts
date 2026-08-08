/**
 * `CHAT_MODEL`'s resolution, both halves, plus `CHAT_ANSWERS_ENABLED`.
 *
 * **THE POINT OF THE FIRST TWO SUITES IS THAT THE TWO FUNCTIONS AGREE** (`[F1-15]`).
 * `chatModel()` is what the provider is told and `chatModelName()` is what
 * `chat_runs.plan_model` and `chat_messages.model` record, and they resolve the same
 * chain in two places — `chatModelName()` restating `ledger.ts`'s `||` rather than
 * importing it, because that module reaches `server-only`. A drift between them
 * writes a stored row naming a different model from the `llm_calls` row beside it,
 * and nothing on screen would show it.
 *
 * `admin/model.test.ts` is the file this one is a structural copy of, deliberately.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatAnswersEnabled, chatModel, chatModelName } from './model';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('chatModel', () => {
  it('returns the override when it is set', () => {
    vi.stubEnv('CHAT_MODEL', 'glm-5.2');
    expect(chatModel()).toBe('glm-5.2');
  });

  it('returns undefined when unset, so LLM_MODEL stays in charge', () => {
    /*
     * **`undefined`, NEVER `'unknown'`.** `LLMCallOpts.model` is optional and both
     * adapters read `opts?.model ?? requireEnv('LLM_MODEL')` — a string here would be
     * sent to the provider verbatim, and `model: "unknown"` is a 400 that reads like
     * a bad key.
     */
    vi.stubEnv('CHAT_MODEL', undefined);
    vi.stubEnv('LLM_MODEL', 'glm-4.6');
    expect(chatModel()).toBeUndefined();
  });

  it('treats an EMPTY string as unset ([F1-16])', () => {
    // A Vercel variable added and then cleared looks exactly like this.
    vi.stubEnv('CHAT_MODEL', '');
    expect(chatModel()).toBeUndefined();
  });
});

describe('chatModelName', () => {
  it('prefers CHAT_MODEL', () => {
    vi.stubEnv('CHAT_MODEL', 'glm-5.2');
    vi.stubEnv('LLM_MODEL', 'glm-4.6');
    expect(chatModelName()).toBe('glm-5.2');
  });

  it('falls back to LLM_MODEL, exactly as the ledger does', () => {
    vi.stubEnv('CHAT_MODEL', undefined);
    vi.stubEnv('LLM_MODEL', 'glm-4.6');
    expect(chatModelName()).toBe('glm-4.6');
  });

  it("is 'unknown' only when both are absent, which is a broken deployment", () => {
    vi.stubEnv('CHAT_MODEL', undefined);
    vi.stubEnv('LLM_MODEL', undefined);
    expect(chatModelName()).toBe('unknown');
  });

  it('names the SAME model the provider would resolve, on every branch', () => {
    /*
     * The agreement, asserted as one property rather than four coincidences.
     * `resolvedByLedger` is `ledger.ts`'s line copied verbatim; if either side moves,
     * this goes red rather than `chat_runs.plan_model` quietly disagreeing with the
     * `llm_calls` row beside it.
     */
    const resolvedByLedger = (override: string | undefined) =>
      override || process.env.LLM_MODEL || 'unknown';

    for (const [chat, llm] of [
      ['glm-5.2', 'glm-4.6'],
      [undefined, 'glm-4.6'],
      ['', 'glm-4.6'],
      [undefined, undefined],
    ] as const) {
      vi.stubEnv('CHAT_MODEL', chat);
      vi.stubEnv('LLM_MODEL', llm);
      expect({ chat, llm, name: chatModelName() }).toEqual({
        chat,
        llm,
        name: resolvedByLedger(chatModel()),
      });
    }
  });

  it('restates the ledger line verbatim, in source', () => {
    // The two files are one line apart and there is no import between them, so the
    // only thing that can keep them identical is somebody noticing. This is that.
    const ledger = readFileSync('src/lib/llm/ledger.ts', 'utf8');
    expect(ledger).toContain("opts.model || process.env.LLM_MODEL || 'unknown'");
    expect(readFileSync('src/lib/chat/model.ts', 'utf8')).toContain(
      "chatModel() || process.env.LLM_MODEL || 'unknown'",
    );
  });
});

describe('chatAnswersEnabled', () => {
  /**
   * `C-D8`, granted by `[R14]` **on condition it be reversible without redeploying
   * the prompt layer.** The two onboarding hints amended in this same release
   * promised the opposite of `C-D8` while the querent was typing the answer, and this
   * switch is what makes that promise re-keepable in one dashboard edit.
   */
  it('is ON by default, because the feature is the release', () => {
    vi.stubEnv('CHAT_ANSWERS_ENABLED', undefined);
    expect(chatAnswersEnabled()).toBe(true);
  });

  it("is disabled by the exact string '0' and by nothing else", () => {
    vi.stubEnv('CHAT_ANSWERS_ENABLED', '0');
    expect(chatAnswersEnabled()).toBe(false);
  });

  it("treats 'false', 'off', 'no' and '' as ENABLED", () => {
    // `ANALYTICS_ENABLED`'s rule: a typo must not silently cost every querent the
    // thing the release was built for, with nothing anywhere reporting it.
    for (const v of ['false', 'off', 'no', '', 'FALSE', '0 ']) {
      vi.stubEnv('CHAT_ANSWERS_ENABLED', v);
      expect(chatAnswersEnabled(), `${JSON.stringify(v)} must not disable`).toBe(true);
    }
  });

  it('is NOT a flags.ts entry, and the distinction is deliberate', () => {
    /*
     * Every member of `DEFERRABLE_FLAGS` gates a model CALL and has a call site
     * `flagCoverage.test.ts` names. This gates an INPUT to a prompt. Adding it there
     * would make *"the set of model call sites is exactly its two tables"* answerable
     * in two incompatible ways.
     */
    expect(readFileSync('src/lib/llm/flags.ts', 'utf8')).not.toContain(
      'CHAT_ANSWERS_ENABLED',
    );
  });
});
