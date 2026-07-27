import 'server-only';

import type { Locale } from '@/data/types';
import type { LLMStream } from '@/lib/llm/types';
import { checkBlocklist, type BlocklistResult } from './blocklist';
import { classifyQuestion, ClassifierError, OTHER_CONFIDENCE_THRESHOLD } from './classify';
import {
  CLAUSE_FOR,
  type BlockedVerdict,
  type ModerationCategory,
  type ModerationVerdict,
  type RefusalPayload,
} from './types';

/**
 * The orchestration: blocklist, prime, race, decide.
 *
 * **RETURNS DATA, NEVER A `Response`.** W4 owns `/api/reading`'s response and
 * its `after()` write path; if the gate built the `Response` the two
 * workstreams would fight over one object. The gate hands back a verdict plus
 * either a stream or a refusal payload, and the route assembles it.
 *
 * ---
 *
 * **THE TRAP THIS MODULE EXISTS FOR.** Calling an async generator function does
 * not execute its body, so this looks concurrent and is strictly sequential:
 *
 *     const it = provider.streamReading(prompt);   // has started NOTHING
 *     const verdict = await classify(...);         // classifier runs ALONE
 *     for await (const chunk of it) { ... }        // reading starts NOW
 *
 * Total latency becomes `classifier + reading`, which is the exact opposite of
 * D8's premise. Nothing breaks, nothing logs, every reading is just slower. The
 * fix is one line -- pull `.next()` before awaiting the verdict -- and it is why
 * this is a module with a timing test rather than ten lines inline in the route.
 * `gate.test.ts`'s concurrency test is what stops someone "simplifying" the
 * priming away.
 */

/** Milliseconds the classifier gets. Measured; see `classify.ts`'s header. */
function timeoutMs(): number {
  const raw = Number(process.env.MODERATION_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 1500;
}

/**
 * The kill switch. `0` runs the blocklist only.
 *
 * Named `MODERATION_CLASSIFIER_ENABLED` and not `MODERATION_ENABLED` so it
 * cannot be misread as "moderation off" -- Tier A stays terminal either way. It
 * exists because the alternative, when the classifier provider breaks at 2am, is
 * a deploy. Only an explicit `'0'` disables, so a typo fails toward moderating.
 */
function classifierEnabled(): boolean {
  return process.env.MODERATION_CLASSIFIER_ENABLED !== '0';
}

const TIMED_OUT = Symbol('classifier-timeout');

/**
 * Race a promise against a timer.
 *
 * `.unref()` on the timer, so a pending classifier cannot hold a Node process
 * open past the response -- the same reason `route.ts`'s `streamTimeout` does
 * it. Under the edge/serverless runtime `unref` is absent, hence the `?.`.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    (timer as unknown as { unref?: () => void }).unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function blockedVerdict(
  source: BlockedVerdict['source'],
  category: ModerationCategory,
  extra: { confidence?: number | null; patternId?: string | null; latencyMs: number },
): BlockedVerdict {
  return {
    blocked: true,
    source,
    category,
    confidence: extra.confidence ?? null,
    patternId: extra.patternId ?? null,
    clause: CLAUSE_FOR[category],
    latencyMs: extra.latencyMs,
  };
}

/**
 * Blocklist plus classifier. No streaming, no provider reading call.
 *
 * Exported separately from `gateReading` so the whole policy is testable with
 * stubs and no stream in sight -- and so a future caller (a moderation dry-run
 * script, a backfill over historic questions) has the decision without the
 * machinery.
 */
export async function moderate(
  question: string | null,
  locale: Locale,
  signal?: AbortSignal,
): Promise<ModerationVerdict> {
  const startedAt = performance.now();
  const screen = screenSync(question, locale, startedAt);
  if (screen.settled) return screen.verdict;
  return classifyPhase(question as string, locale, screen.list, startedAt, signal);
}

/**
 * The synchronous half: everything decidable without a network call.
 *
 * SPLIT OUT SO `gateReading` CAN RUN IT *BEFORE* IT TOUCHES THE PROVIDER. That
 * ordering is what makes the zero-cost property literally true instead of nearly
 * true -- a Tier-A deny must not even construct a client, let alone open a
 * socket. `gate.test.ts` asserts `start` was never called, and it caught this:
 * the first version primed the stream and then screened, which cost a client
 * construction on every abusive request.
 */
function screenSync(
  question: string | null,
  locale: Locale,
  startedAt: number,
):
  | { settled: true; verdict: ModerationVerdict }
  | { settled: false; list: BlocklistResult } {
  const elapsed = () => Math.round(performance.now() - startedAt);

  /*
   * **NO QUESTION MEANS NO GATE**, and this is not an optimisation footnote --
   * it is most of the classifier's cost budget. `sanitizeQuestion` returns null
   * for the daily card and for anyone who left the box empty, which is the
   * common case, and there is nothing to moderate in a draw.
   */
  if (question === null || question.length === 0) {
    return {
      settled: true,
      verdict: { blocked: false, source: 'none', category: null, confidence: null, latencyMs: 0 },
    };
  }

  const list = checkBlocklist(question, locale);

  /*
   * **A TIER-A HIT NEVER TOUCHES THE NETWORK.** Zero tokens, zero latency, zero
   * cost -- which means an abusive user hammering obvious phrases costs nothing,
   * and that property is worth preserving as the list grows.
   */
  if (list.tier === 'deny') {
    return {
      settled: true,
      verdict: blockedVerdict('blocklist', list.category, {
        patternId: list.patternId,
        latencyMs: elapsed(),
      }),
    };
  }

  if (!classifierEnabled()) {
    /*
     * Loud, every request, on purpose. A kill switch nobody remembers flipping
     * is how an app runs for a month with half its moderation off.
     */
    console.warn('[moderation] classifier DISABLED by MODERATION_CLASSIFIER_ENABLED=0');
    return {
      settled: true,
      verdict: { blocked: false, source: 'none', category: null, confidence: null, latencyMs: elapsed() },
    };
  }

  return { settled: false, list };
}

/** The network half. Reached only when `screenSync` did not settle it. */
async function classifyPhase(
  question: string,
  locale: Locale,
  list: BlocklistResult,
  startedAt: number,
  signal?: AbortSignal,
): Promise<ModerationVerdict> {
  const elapsed = () => Math.round(performance.now() - startedAt);

  let classification;
  try {
    classification = await withTimeout(classifyQuestion(question, locale, signal), timeoutMs());
  } catch (err) {
    /*
     * Logs the failure KIND and never the input. A `console.error(err)` here
     * would put the querent's question into the platform log via the provider
     * SDK's own error message, which is a second copy of the most sensitive text
     * in the product living entirely outside `moderation_flags`' retention
     * policy (W7 §3.7).
     */
    const failure = err instanceof ClassifierError ? err.failure : 'call_failed';
    console.warn(`[moderation] classifier ${failure}`);
    classification = TIMED_OUT;
  }

  if (classification === TIMED_OUT) return onNoVerdict(list, elapsed());

  const { category, confidence } = classification;

  if (category === 'none') {
    return { blocked: false, source: 'classifier', category: null, confidence, latencyMs: elapsed() };
  }

  /*
   * **THE THRESHOLD APPLIES TO `other` ALONE.** It is the "something is off and
   * I cannot name it" bucket, which is precisely where a low-confidence block
   * would be an accusation delivered on a hunch. Every named category blocks
   * regardless of confidence -- a classifier that says `sexual_minor` at 0.4 is
   * still saying `sexual_minor`.
   *
   * A near-miss is NOT discarded. It comes back as a clean verdict that still
   * carries its category, and `log.ts` writes it with `action:
   * 'allowed_flagged'`. Without that row every record in the table is a block
   * and the false-negative side of tuning is invisible forever.
   */
  if (category === 'other' && confidence < OTHER_CONFIDENCE_THRESHOLD) {
    return { blocked: false, source: 'classifier', category, confidence, latencyMs: elapsed() };
  }

  return blockedVerdict('classifier', category, { confidence, latencyMs: elapsed() });
}

/**
 * **THE ASYMMETRIC TIMEOUT POLICY** (W7-D7, upheld by reconciliation §7.7).
 *
 *   classifier silent + blocklist CLEAN    -> fail OPEN, the reading proceeds
 *   classifier silent + blocklist SUSPECT  -> fail CLOSED, refuse as `unclear`
 *
 * Flat fail-closed is wrong because the classifier is a network call to the same
 * provider the reading uses: when it hiccups, *everyone* gets refused, and they
 * get refused with an accusation attached. Flat fail-open is wrong because a
 * timeout you can induce is a bypass. The blocklist has already told us, for
 * free, which side of that trade we are on -- so use it.
 *
 * The cost of being wrong is deliberately asymmetric too: failing open costs one
 * reading that the base contract already constrains; failing closed costs one
 * wrongly-refused question that already contained a signal word.
 */
function onNoVerdict(list: BlocklistResult, latencyMs: number): ModerationVerdict {
  if (list.tier === 'suspect') {
    return blockedVerdict('timeout', 'unclear', { patternId: list.patternId, latencyMs });
  }
  return { blocked: false, source: 'timeout', category: null, confidence: null, latencyMs };
}

/** The `403` body. Keys and a clause, never prose (W7-D8). */
export function refusalPayload(verdict: BlockedVerdict): RefusalPayload {
  return {
    error: 'moderation_blocked',
    category: verdict.category,
    clause: verdict.clause,
    /*
     * **WHICH OF THE TWO DOCUMENTS TO RENDER, NOT WHICH CATEGORY.** W7 §3.5
     * designs exactly one generic refusal and one self-harm refusal; the
     * category decides only which of those two and which clause the link points
     * at. A per-category key (`moderation.blocked.extremism`) would mean twenty
     * near-identical catalog strings per locale, and I3 renders a missing key AS
     * THE KEY -- so the first category anyone forgot would put
     * `moderation.blocked.hate_targeted.body` on a real screen.
     *
     * The SERVER picks, rather than the client deriving it from `category`,
     * because that is what D8 means by the refusal carrying keys: the decision
     * is data, and only the rendering is the browser's.
     *
     * `patternId` is deliberately absent from this payload (W7-D13): telling the
     * client which rule fired turns the refusal into a free oracle for mapping
     * the blocklist.
     */
    messageKey:
      verdict.category === 'self_harm'
        ? 'moderation.blocked.selfHarm'
        : 'moderation.blocked.generic',
    /*
     * A flag rather than the client re-deriving `category === 'self_harm'`,
     * because the ordering it controls is a product decision (W7-D10) and should
     * be changeable in one place if a second category ever earns the same
     * treatment.
     */
    showCrisisResources: verdict.category === 'self_harm',
  };
}

/**
 * Thrown when the reading call fails while the gate is still awaiting a verdict.
 *
 * A distinguishable type because the route has to turn it into a real `500`.
 * That is the honest status: nothing has been written to the wire yet, so a
 * clean `500` with a generic message beats a `200` whose body is an apology.
 * Once the gate passes and bytes are flowing, this class is unreachable and the
 * existing mid-stream `[Bacaan terputus…]` path owns every failure.
 */
export class ReadingStartError extends Error {
  constructor(readonly cause: unknown) {
    super('reading failed before the moderation verdict');
    this.name = 'ReadingStartError';
  }
}

export type GateResult =
  | { blocked: false; verdict: ModerationVerdict; stream: LLMStream }
  | { blocked: true; verdict: BlockedVerdict; payload: RefusalPayload };

/**
 * Moderate a question while the reading is already in flight.
 *
 * **RETURNS AN `LLMStream`, NOT A `ReadableStream`, AND THAT IS A DELIBERATE
 * DEPARTURE FROM W7'S PLAN.** The plan predates W4: `route.ts` now pipes the
 * provider stream through `teeReading`, which is what fills `readings.body`,
 * `token_output` and every `reading.*` event. A gate that returned a finished
 * `ReadableStream` would have to be spliced in either before the tee (making
 * the return type wrong) or after it (making the abort useless), and the
 * simplest reading of "the gate returns data" is that it returns the same shape
 * it was given. So it takes an `LLMStream` and hands one back, replayed from the
 * primed chunk, and the route feeds that to `teeReading` exactly as before.
 *
 * `start` receives the `AbortSignal`. Passing it on is not optional: a refused
 * reading that is not aborted means paying for a full generation nobody will
 * ever see and holding the socket open while it arrives.
 */
export async function gateReading(args: {
  /** ALREADY SANITIZED. Must be byte-for-byte the string the model will see. */
  question: string | null;
  locale: Locale;
  start: (signal: AbortSignal) => LLMStream;
}): Promise<GateResult> {
  const { question, locale, start } = args;

  const startedAt = performance.now();

  /*
   * **SCREEN BEFORE PRIMING.** A Tier-A deny returns here having called neither
   * `start` nor the classifier: no client constructed, no socket opened, no
   * tokens spent. Reversing these two statements is invisible in behaviour and
   * quietly puts a provider client construction on every abusive request.
   */
  const screen = screenSync(question, locale, startedAt);
  if (screen.settled && screen.verdict.blocked) {
    return { blocked: true, verdict: screen.verdict, payload: refusalPayload(screen.verdict) };
  }

  const controller = new AbortController();
  const source = start(controller.signal);
  const iterator = source[Symbol.asyncIterator]();

  /*
   * **THE PRIME. `next()` IS CALLED AND THE PROMISE IS NOT AWAITED.**
   *
   * This single line is the difference between the classifier running BESIDE
   * the reading and running BEFORE it. Pulling the first value executes the
   * generator body, which issues the HTTP request to the provider; holding the
   * pending promise means both round trips are in flight at once. Deleting the
   * `.next()` and moving it below the `await` would look like a tidy-up, break
   * nothing, and silently double every reading's latency.
   */
  const first = iterator.next();

  /*
   * Catch the rejection NOW, not later.
   *
   * `first` is unawaited for the duration of the verdict, and an unhandled
   * rejection in that window is a process warning in Node today and a crash
   * under some configurations. Parking the error in a variable and checking it
   * after the verdict costs at most one classifier round trip of delay on a
   * failure path, which is not worth racing for.
   */
  let startError: unknown = null;
  const primed = first.catch((err: unknown) => {
    startError = err;
    return { done: true, value: undefined } as IteratorResult<string>;
  });

  let verdict: ModerationVerdict;
  try {
    verdict = screen.settled
      ? screen.verdict
      : await classifyPhase(question as string, locale, screen.list, startedAt, controller.signal);
  } catch (err) {
    controller.abort();
    void primed;
    throw err;
  }

  if (verdict.blocked) {
    /*
     * Abort first, then discard. The order matters only for the socket: aborting
     * tells the provider to stop generating tokens we are about to throw away.
     */
    controller.abort();
    void primed;
    return { blocked: true, verdict, payload: refusalPayload(verdict) };
  }

  if (startError !== null) throw new ReadingStartError(startError);

  return { blocked: false, verdict, stream: replay(primed, iterator, source.usage) };
}

/**
 * Re-assemble the stream from the chunk we already pulled plus the rest.
 *
 * The "buffer" D8 asks for is exactly one pending chunk in this design, not an
 * array -- moving the wait to before the response headers (W7-D6) means there is
 * nothing to accumulate. Worth stating so nobody adds a size cap for a buffer
 * that cannot grow.
 *
 * `usage` is passed through from the ORIGINAL stream rather than re-created,
 * because that promise is what `teeReading` awaits to fill
 * `readings.token_output`, and a fresh one would never settle.
 */
function replay(
  primed: Promise<IteratorResult<string>>,
  iterator: AsyncIterator<string>,
  usage: LLMStream['usage'],
): LLMStream {
  async function* iterate(): AsyncGenerator<string> {
    const head = await primed;
    if (head.done) return;
    yield head.value;

    for (;;) {
      const next = await iterator.next();
      if (next.done) return;
      yield next.value;
    }
  }

  // Object.assign rather than a class, matching `anthropic.ts`: the return value
  // IS the generator, so every existing `for await` consumer is unchanged.
  return Object.assign(iterate(), { usage });
}
