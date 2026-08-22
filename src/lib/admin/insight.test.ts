/**
 * The impure half of A7: the two-attempt loop, and the four things only it can get
 * wrong. **Card #2.**
 *
 * ── `insightPrompt.test.ts` SAYS THIS FILE "CANNOT EXIST", AND IT CAN ───────
 *
 * That header reads: *"`insight.ts` HAS NO TEST HERE AND CANNOT, for
 * `flagCoverage.test.ts`'s reason: it reaches `@/lib/llm`, which starts with
 * `import 'server-only'`."* The premise is true and the conclusion is not —
 * `vi.mock` intercepts the specifier before the module is ever evaluated, so
 * `server-only` never runs. **`src/lib/translate/translate.test.ts` has been doing
 * exactly this since V2**, on a server-only module reaching the same provider, which is
 * what makes it a pattern here rather than a new idea. The sibling comment is corrected
 * rather than left standing.
 *
 * The split it describes is still right and is untouched: everything that is a string
 * transform stayed next door, and what is asserted here is only what needs a provider.
 *
 * ── WHAT IS WORTH ASSERTING, AND WHY EACH ONE DECIDES SOMETHING ─────────────
 *
 *   - A BAD FIRST ANSWER IS RETRIED AND THE PRESS SUCCEEDS. On the CALL COUNT, because
 *     this is the whole of card #2: ten presses becoming one.
 *   - A CACHE HIT MAKES NO CALL AT ALL. The arm that makes a double-tap free.
 *   - `ceiling` IS NOT RETRIED. A retry there spends quota the limiter just refused, on
 *     the one call class that exists to be shed before a querent's reading.
 *   - THE ELAPSED GUARD REFUSES THE SECOND CALL. Its whole purpose is that a slow press
 *     degrades to A7's behaviour rather than to an aborted request whose outcome the
 *     operator cannot read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PanelFacts } from './insightPrompt';

const complete = vi.fn();
vi.mock('@/lib/llm', () => ({ getProvider: () => ({ complete }) }));

const { generateInsight } = await import('./insight');

const RANGE = { from: '2026-07-01', to: '2026-07-30', days: 30 };

/** A panel whose notes carry an op name, which is the shape card #2 was reported on. */
const FACTS: PanelFacts = {
  title: 'Panggilan model per hari',
  purpose: 'Deret panggilan model per hari UTC.',
  headline: [{ label: 'Total panggilan', value: '1.204' }],
  columns: ['Hari', 'Panggilan'],
  rows: [
    ['2026-07-01', '40'],
    ['2026-07-02', '52'],
  ],
  notes: ['Empat op tidak diakibatkan penanya: insight, blog_format, chat_plan, chat_turn.'],
};

const GOOD = 'Panggilan chat_turn naik tajam sejak akhir bulan. Layak dilihat di rentang yang lebih panjang.';
const BULLETED = '- Panggilan naik.\n- Token turun.';

/** How much fake time each mocked call consumes. Set per test. */
let callCostMs = 0;

/** Bodies handed back in order, one per call. */
let queue: string[] = [];

function ceilingError(): Error {
  /* A NAME MATCH, matching `isCeiling` — the real class lives in `@/lib/llm/meter`,
   * which `insight.ts` deliberately does not import. */
  const err = new Error('window spent');
  err.name = 'ModelCeilingError';
  return err;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-22T03:00:00Z'));
  callCostMs = 0;
  queue = [];
  complete.mockReset();
  complete.mockImplementation(async () => {
    /* Advancing the SYSTEM time rather than the timers: the guard reads `Date.now()`,
     * and no code under test waits on a timer. */
    vi.setSystemTime(new Date(Date.now() + callCostMs));
    const text = queue.shift();
    if (text === undefined) throw new Error('provider called more times than the test allows');
    return { text };
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('generateInsight: the cache arm', () => {
  it('makes NO call when the stored hash already matches', async () => {
    queue = [GOOD];
    const first = await generateInsight(FACTS, RANGE);
    expect(first.kind).toBe('generated');
    complete.mockClear();

    const again = await generateInsight(FACTS, RANGE, { cachedHash: first.inputHash });
    expect(again.kind).toBe('unchanged');
    expect(complete).not.toHaveBeenCalled();
  });

  it('calls anyway when the operator forces it', async () => {
    queue = [GOOD, GOOD];
    const first = await generateInsight(FACTS, RANGE);
    const forced = await generateInsight(FACTS, RANGE, {
      cachedHash: first.inputHash,
      force: true,
    });
    expect(forced.kind).toBe('generated');
    expect(complete).toHaveBeenCalledTimes(2);
  });
});

describe('generateInsight: the retry', () => {
  it('rescues a press whose first answer was a bulleted list', async () => {
    /*
     * **THIS IS CARD #2.** Before the retry, this press reported `format` and the
     * operator pressed again — ten times, on a panel that produced the same shape every
     * time. Now one press costs two calls and stores prose.
     */
    queue = [BULLETED, GOOD];

    const result = await generateInsight(FACTS, RANGE);

    expect(result).toEqual({
      kind: 'generated',
      body: GOOD,
      inputHash: expect.any(String),
      model: expect.any(String),
    });
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('shows the rejected body back to the model, fenced', async () => {
    queue = [BULLETED, GOOD];
    await generateInsight(FACTS, RANGE);

    const [{ user: firstUser }] = complete.mock.calls[0];
    const [{ user: retryUser }] = complete.mock.calls[1];

    expect(firstUser).not.toContain('contoh_salah');
    expect(retryUser).toContain('<contoh_salah>');
    expect(retryUser).toContain('- Panggilan naik.');
  });

  it('keeps op and callClass on BOTH calls', async () => {
    /*
     * Two calls are two ledger rows and two ceiling decrements, which is honest and is
     * also the only instrument this feature has: two `insight` rows seconds apart
     * followed by a stored insight is a rescued press. `deferred` on the retry matters
     * most — an operator's second attempt must still be shed before a querent's reading.
     */
    queue = [BULLETED, GOOD];
    await generateInsight(FACTS, RANGE);

    for (const [, opts] of complete.mock.calls) {
      expect(opts).toMatchObject({ op: 'insight', callClass: 'deferred' });
    }
  });

  it('reports the SECOND reason when the retry is also bad', async () => {
    // The newer truth. Both values already have a sentence in `INSIGHT.error`.
    queue = [BULLETED, 'A naik ke 40. B turun ke 52. C datar di 12.'];

    const result = await generateInsight(FACTS, RANGE);

    expect(result).toEqual({
      kind: 'failed',
      reason: 'tally',
      inputHash: expect.any(String),
    });
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('retries an empty first answer without a fenced example', async () => {
    queue = ['   ', GOOD];
    const result = await generateInsight(FACTS, RANGE);

    expect(result.kind).toBe('generated');
    const [{ user: retryUser }] = complete.mock.calls[1];
    expect(retryUser).toContain('PERCOBAAN SEBELUMNYA');
    expect(retryUser).not.toContain('<contoh_salah>');
  });

  it('does NOT retry a shed call', async () => {
    complete.mockRejectedValueOnce(ceilingError());

    const result = await generateInsight(FACTS, RANGE);

    expect(result).toEqual({
      kind: 'failed',
      reason: 'ceiling',
      inputHash: expect.any(String),
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a provider failure', async () => {
    // No text was produced, so there is no wrong example to give.
    complete.mockRejectedValueOnce(new Error('bad gateway'));

    const result = await generateInsight(FACTS, RANGE);

    expect(result).toEqual({
      kind: 'failed',
      reason: 'failed',
      inputHash: expect.any(String),
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('reports `ceiling` when the RETRY is the call that gets shed', async () => {
    // The newer and the more actionable fact: the ceiling chart will show it.
    queue = [BULLETED];
    complete.mockImplementationOnce(async () => ({ text: BULLETED }));
    complete.mockRejectedValueOnce(ceilingError());

    const result = await generateInsight(FACTS, RANGE);

    expect(result).toEqual({
      kind: 'failed',
      reason: 'ceiling',
      inputHash: expect.any(String),
    });
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('reports the FIRST reason when the retry dies at the provider', async () => {
    /*
     * A 500 on the second call leaves the first attempt's shape failure as the truest
     * thing known about this press — and it is what tells the operator to press again
     * rather than to go and read the ceiling chart.
     */
    complete.mockImplementationOnce(async () => ({ text: BULLETED }));
    complete.mockRejectedValueOnce(new Error('bad gateway'));

    const result = await generateInsight(FACTS, RANGE);

    expect(result).toEqual({
      kind: 'failed',
      reason: 'format',
      inputHash: expect.any(String),
    });
  });
});

describe('generateInsight: the elapsed guard', () => {
  it('skips the retry when the first call already ate the budget', async () => {
    /*
     * A slow press degrades to exactly A7's behaviour: one call, one named reason, and
     * an operator who can press again. The alternative is a second call that pushes the
     * pair past `InsightBox`'s abort, where the copy says the work MAY have completed —
     * and on this path nothing did.
     */
    callCostMs = 30_000;
    queue = [BULLETED];

    const result = await generateInsight(FACTS, RANGE);

    expect(result).toEqual({
      kind: 'failed',
      reason: 'format',
      inputHash: expect.any(String),
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('allows the retry when the first call was quick', async () => {
    callCostMs = 4_000;
    queue = [BULLETED, GOOD];

    const result = await generateInsight(FACTS, RANGE);

    expect(result.kind).toBe('generated');
    expect(complete).toHaveBeenCalledTimes(2);
  });
});
