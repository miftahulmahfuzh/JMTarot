/**
 * **NOTHING W7 ADDS PUTS A SECRET OR A CANARY INTO SOMETHING A USER CAN SEE.**
 *
 * The rule (§6.4) is one sentence: never put `err.message`, `String(err)`, a
 * stack, a provider response body or a zod issue list into a response. It is
 * easy to hold for an afternoon and easy to break at 11pm with
 * `{ error: err.message }` "temporarily for debugging", so it is a test rather
 * than a convention.
 *
 * **PROVIDER ERRORS ARE THE DANGEROUS ONES.** An Anthropic-SDK error carries the
 * REQUEST BODY, and for a reading that body is the entire system prompt; for the
 * classifier it is the querent's question. Both are modelled here: every stubbed
 * failure carries a `LEAK_CANARY_…` and a copy of the real base contract, and
 * every user-visible surface W7 introduced is asserted clean.
 *
 * The surfaces: the `403` refusal payload, the `ClassifierError` a route might
 * log, the `ReadingStartError` the route turns into a `500`, and everything
 * `console.*` receives on the way.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { classifyQuestion } = vi.hoisted(() => ({ classifyQuestion: vi.fn() }));
vi.mock('./classify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./classify')>();
  return { ...actual, classifyQuestion };
});

const complete = vi.fn();
vi.mock('@/lib/llm', () => ({ getProvider: () => ({ complete, streamReading: vi.fn() }) }));

import { BASE_CONTRACT_ID } from '@/lib/prompt/base.id';
import { ClassifierError } from './classify';

/*
 * **THE REAL `classifyQuestion`, NOT THE MOCK.** `./classify` is mocked above so
 * the gate tests can drive verdicts, and a plain import here would have handed
 * these two tests the stub -- which resolves `undefined` instead of throwing, so
 * they would have passed while asserting nothing. Caught on the first run.
 */
const realClassify = async (...args: Parameters<typeof import('./classify').classifyQuestion>) =>
  (await vi.importActual<typeof import('./classify')>('./classify')).classifyQuestion(...args);
import { gateReading, moderate, ReadingStartError, refusalPayload } from './gate';
import { recordModerationFlag } from './log';
import type { LLMStream } from '@/lib/llm/types';

const CANARY = 'LEAK_CANARY_7f3c1e9a-4b21-4d0f-9c66-2a5e8d17bb04';
const QUESTION = 'CANARY_QUESTION_aku_pengen_mati_aja';

/**
 * An error shaped like a real provider failure: it quotes the request body,
 * which means it quotes the system prompt AND the user turn.
 */
function providerError(): Error {
  const err = new Error(
    `400 Bad Request {"system":${JSON.stringify(BASE_CONTRACT_ID.slice(0, 400))},` +
      `"messages":[{"content":"<pertanyaan>${QUESTION}</pertanyaan>"}],"trace":"${CANARY}"}`,
  );
  err.stack = `${err.message}\n    at provider (${CANARY})`;
  return err;
}

/** Every needle that must not appear anywhere a user or a log can reach. */
const NEEDLES = [CANARY, QUESTION, BASE_CONTRACT_ID.slice(0, 60), 'pembaca tarot'];

function assertClean(label: string, text: string) {
  for (const needle of NEEDLES) {
    expect({ label, needle: needle.slice(0, 32), leaked: text.includes(needle) }).toEqual({
      label,
      needle: needle.slice(0, 32),
      leaked: false,
    });
  }
}

let logged: string[] = [];

beforeEach(() => {
  vi.stubEnv('MODERATION_CLASSIFIER_ENABLED', '1');
  vi.stubEnv('MODERATION_TIMEOUT_MS', '1500');
  vi.stubEnv('FIELD_ENCRYPTION_KEY', Buffer.alloc(32, 5).toString('base64url'));
  logged = [];
  for (const level of ['log', 'warn', 'error', 'info', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(
        args
          .map((a) => (a instanceof Error ? `${a.name} ${a.message} ${a.stack}` : String(a)))
          .join(' '),
      );
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('the classifier error path', () => {
  it('carries neither the question nor the prompt', async () => {
    complete.mockRejectedValue(providerError());

    let caught: ClassifierError | null = null;
    try {
      await realClassify(QUESTION, 'id');
    } catch (err) {
      caught = err as ClassifierError;
    }

    expect(caught).toBeInstanceOf(ClassifierError);
    assertClean('ClassifierError.message', caught!.message);
    assertClean('ClassifierError.raw', caught!.raw ?? '');
    assertClean('console', logged.join('\n'));
  });

  it('carries no prompt when the MODEL returns nonsense', async () => {
    /*
     * `raw` is the model's OUTPUT, not the user's input -- but a model that has
     * been successfully injected can echo whatever it was told to, so the clip
     * bound matters as much as the source.
     */
    complete.mockResolvedValue({ text: `garbage ${CANARY} ${BASE_CONTRACT_ID.slice(0, 300)}` });

    try {
      await realClassify(QUESTION, 'id');
    } catch (err) {
      expect((err as ClassifierError).raw!.length).toBeLessThanOrEqual(121);
    }
  });
});

describe('the gate', () => {
  it('logs a classifier failure without the question', async () => {
    classifyQuestion.mockRejectedValue(providerError());
    await moderate(QUESTION, 'id');
    assertClean('console', logged.join('\n'));
  });

  it('puts nothing but keys in the refusal payload', () => {
    /*
     * The `403` body is the ONE thing here a user reads directly. W7-D8 says
     * keys and a clause, never prose -- so there is nothing in it that COULD
     * carry a secret, and this asserts that stays true.
     */
    const payload = refusalPayload({
      blocked: true,
      source: 'blocklist',
      category: 'self_harm',
      confidence: null,
      patternId: 'id.self_harm.method',
      clause: '6.2',
      latencyMs: 4,
    });

    const body = JSON.stringify(payload);
    assertClean('refusal payload', body);
    // And not the pattern id either -- W7-D13, the anti-oracle rule.
    expect(body).not.toContain('id.self_harm.method');
  });

  it('raises a ReadingStartError that names no prompt', async () => {
    /*
     * The route turns this into a `500` with a fixed catalog string. If the
     * error itself carried the prompt, the temptation to `err.message` it into
     * the response would be one keystroke away.
     */
    classifyQuestion.mockImplementation(
      () => new Promise((r) => setTimeout(() => r({ category: 'none', confidence: 1 }), 40)),
    );

    const start = (): LLMStream => {
      async function* iterate(): AsyncGenerator<string> {
        throw providerError();
      }
      return Object.assign(iterate(), {
        usage: Promise.resolve({ inputTokens: null, outputTokens: null, cachedInputTokens: null }),
      });
    };

    let caught: ReadingStartError | null = null;
    try {
      await gateReading({ question: 'apakah dia jodohku', locale: 'id', start });
    } catch (err) {
      caught = err as ReadingStartError;
    }

    expect(caught).toBeInstanceOf(ReadingStartError);
    assertClean('ReadingStartError.message', caught!.message);
    /*
     * `cause` DOES hold the provider error, deliberately -- the route logs it
     * server-side, which is where a stack belongs. What must never happen is
     * that string reaching a response, and the route answers with
     * `t('reading.error.start')`, a catalog constant.
     */
    expect(String((caught!.cause as Error).message)).toContain(CANARY);
  });
});

describe('the moderation flag writer', () => {
  it('logs nothing from the question when the insert fails', async () => {
    const db = {
      insert: () => {
        throw providerError();
      },
      execute: vi.fn(),
    };

    await recordModerationFlag(
      {
        userId: 'u1',
        question: QUESTION,
        verdict: {
          blocked: true,
          source: 'blocklist',
          category: 'self_harm',
          confidence: null,
          patternId: 'p',
          clause: '6.2',
          latencyMs: 1,
        },
        locale: 'id',
        action: 'blocked',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
    );

    assertClean('console', logged.join('\n'));
  });
});
