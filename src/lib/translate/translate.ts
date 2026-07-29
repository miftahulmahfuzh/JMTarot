import 'server-only';

/**
 * The impure half of the translator: the model call, the verification, the repair
 * pass, the upsert and the event.
 *
 * THE MARKER IS HERE AND NOT ON `contract.ts`, deliberately. `contract.ts` is
 * imported by `scripts/smoke-llm.ts` for `npm run smoke -- --translate`, and
 * `server-only` throws outside a Next server bundle — so it goes on the file where
 * the provider and the database actually are. Same split as `lotus.ts` against
 * `lotus.generate.ts`.
 *
 * THE DATABASE HANDLE ARRIVES BY DYNAMIC IMPORT, matching W4's `flush.ts` and W5's
 * `gist.generate.ts`. A static `import { db } from '@/lib/db/client'` would pull
 * `server-only` into anything importing this module for a type. The optional handle,
 * LAST, is how a test or the integration suite passes its own in — this is not a
 * query module, so the handle-first rule does not apply and would be wrong here.
 *
 * ── THE FLOW, AND THE ONE TRADE IT MAKES (T5) ────────────────────────────────
 *
 *   cached & fresh            -> return it, 'cached', NO model call
 *   generate -> verify clean  -> persist, 'ok'
 *            -> verify dirty  -> DO NOT PERSIST, 'invalid', and defer() one repair
 *                               pass naming the violations; if THAT verifies, it is
 *                               what gets persisted, 'repaired'
 *   throws / empty            -> DO NOT PERSIST, 'failed', return the SOURCE
 *
 * **THE RESIDUAL COST, STATED OUT LOUD: on a streamed field the first viewer of a
 * failed translation sees the failed translation once.** The stream is already on
 * the wire by the time the body is complete enough to check, and both alternatives
 * are worse — buffering to verify before the first byte trades VD8 away for every
 * translation in order to protect the failing minority, and caching an unverified
 * body trades the whole prompt-hardening story away permanently. Repairing behind
 * the response means the cache is never poisoned and the second view is correct.
 *
 * **IF THE MEASURED `invalid` RATE IS ABOVE ABOUT 2%, FIX THE PROMPT, NOT THE
 * ARCHITECTURE.** `translation.generated`'s `outcome` prop is how that rate is
 * knowable at all; a design where these failures were invisible is the one that
 * would have justified buffering.
 */
import type { Locale, ReaderId, ServiceId } from '@/data/types';
import { bindAnalyticsScope, defer, track } from '@/lib/analytics/track';
import type { DbOrTx } from '@/lib/db/types';
import { getProvider } from '@/lib/llm';
import {
  buildTranslationPrompt,
  verifyTranslation,
  type Violation,
} from './contract';
import {
  TRANSLATABLE,
  TRANSLATION_PROMPT_VERSION,
  type FieldSpec,
  type TranslatableEntity,
  type TranslatableField,
} from './keys';

export type TranslateOutcome = 'cached' | 'ok' | 'repaired' | 'invalid' | 'failed';

export type TranslateResult = {
  /** The translation, or the SOURCE when it fell back. Never null, never empty. */
  body: string;
  outcome: TranslateOutcome;
  /** True when `body` is the untranslated source. Render it as-is, with `lang`. */
  fellBack: boolean;
};

export type TranslateArgs = {
  entity: TranslatableEntity;
  entityId: string;
  field: TranslatableField;
  source: string;
  sourceLocale: Locale;
  /**
   * What a cached row's `updated_at` is compared against (T8).
   *
   * For a reading this is `created_at`, because VD7 makes the prose immutable and
   * the row has no `updated_at`. That is not a shortcut: an immutable source cannot
   * go stale, so its creation time is the correct and permanent comparand.
   */
  sourceUpdatedAt: Date;
  target: Locale;
  readerId: ReaderId | null;
  serviceId: ServiceId | null;
};

/**
 * The one call V3/V6/V7/V8 make. Cache-first, generates on a miss, verifies,
 * persists only what verified, and **NEVER THROWS** — a failure returns the source.
 *
 * The never-throwing part is not politeness: every caller is a render path or a
 * route handler, and a translation that could throw would take a page with it. The
 * same property `chain.ts` has, for the same reason.
 */
export async function translateOrCached(
  args: TranslateArgs,
  handle?: DbOrTx,
): Promise<TranslateResult> {
  return core(args, { handle, streamed: false });
}

/**
 * Everything both entry points do.
 *
 * `streamed` is threaded through rather than derived, because it describes HOW THE
 * BODY WAS DELIVERED and only the caller knows that: the same field, the same cache,
 * the same verification can be handed to a viewer progressively or in one piece. It
 * exists on the event so that `outcome: 'invalid'` can be read against the delivery
 * shape — the residual cost of T5 is paid only on the streamed path, and a rate that
 * cannot be split by it would not tell you whether anyone actually saw a bad
 * translation.
 */
async function core(
  args: TranslateArgs,
  ctx: { handle?: DbOrTx; streamed: boolean },
): Promise<TranslateResult> {
  const { handle, streamed } = ctx;
  const startedAt = performance.now();

  /*
   * The source is already in the target language. A caller bug — but the check
   * constraint would reject the row, and a 500 from a constraint is a worse answer
   * than simply handing back the prose. `fellBack` is true because the body is not a
   * translation, which is exactly what it means.
   */
  if (args.sourceLocale === args.target) {
    return { body: args.source, outcome: 'cached', fellBack: true };
  }

  const cached = await readCache(args, handle);
  if (cached) {
    report(args, {
      outcome: 'cached',
      violation: null,
      chars: cached.length,
      streamed,
      startedAt,
    });
    return { body: cached, outcome: 'cached', fellBack: false };
  }

  const generated = await generate(args);
  if (!generated) {
    report(args, { outcome: 'failed', violation: null, chars: 0, streamed, startedAt });
    return { body: args.source, outcome: 'failed', fellBack: true };
  }

  return await settle(args, generated, { streamed, startedAt, handle });
}

/**
 * The streamed form. Yields the model's chunks as they arrive and resolves `result`
 * when the stream ends.
 *
 * IT REALLY STREAMS, and that is T5's decision rather than an implementation
 * detail. Buffering the whole body in order to verify it before the first byte was
 * considered and REFUSED: it would trade VD8 away for every translation in order to
 * protect the failing minority, and VD8's whole point is that prose arrives the way
 * a reading arrives. So verification happens on the ACCUMULATED body once the stream
 * ends, and the residual cost is the one in the file header — the first viewer of a
 * failed translation sees it once, and the repair pass makes the second view right.
 *
 * A CACHE HIT YIELDS AS ONE CHUNK (T2), so the caller writes one reader. Two
 * response shapes in one route means two client paths and the one nobody exercises
 * is the one that breaks. The same is true of a failure, which yields the source.
 *
 * **THE RESERVATION IS EXPLICIT HERE AND IMPLICIT ON THE BUFFERED PATH.** V9's
 * decorator wraps `complete()` only — see `llm/index.ts` for why a stream is not
 * wrapped — so a `streamReading` call site that does not reserve is a model call
 * that bypasses the ceiling entirely. There were exactly two of those in the app
 * (the reading and the day summary); this is the third.
 */
export function translateStream(
  args: TranslateArgs,
  handle?: DbOrTx,
): AsyncIterable<string> & { result: Promise<TranslateResult> } {
  let settleResult!: (r: TranslateResult) => void;
  const result = new Promise<TranslateResult>((resolve) => {
    settleResult = resolve;
  });

  /*
   * ── CAPTURED HERE, BECAUSE HERE IS THE ONLY MOMENT WE ARE IN THE REQUEST ────
   *
   * **THE GENERATOR BODY BELOW DOES NOT RUN IN THE REQUEST SCOPE, AND EVERY
   * `track()` AND `defer()` IN IT WAS SILENTLY FAILING** (found live 2026-07-28).
   * `translateStream()` itself is called by the route inside `withAnalytics`, but an
   * `async *` generator's body runs when something PULLS it — and after the first
   * chunk that is the `ReadableStream`'s `pull()`, which Next runs outside any
   * request scope. So `report()` fell through to `track()`'s unbatched path and
   * `after()` threw:
   *
   *     [analytics] track failed  `after` was called outside a request scope
   *         at report → settle → iterate → Object.pull
   *     [analytics] defer failed  `after` was called outside a request scope
   *         at defer → settle → iterate → Object.pull
   *
   * Consequence: **no `translation.generated` event for any streamed field, and the
   * repair pass never ran** — so V2's own instruction "if the measured `invalid` rate
   * is above about 2%, fix the prompt" could not be followed, because the measurement
   * was not being recorded, and an invalid translation was never repaired.
   *
   * `bindAnalyticsScope()` is called SYNCHRONOUSLY here, which is the whole trick: it
   * is the last line of `translateStream` that is guaranteed to be inside the
   * handler. It also registers the request's `after()` eagerly, so a later `track()`
   * cannot be the first one and re-throw from `ensureRegistered`.
   *
   * **EVERY REPORTING SITE IN `iterate()` GOES THROUGH IT, INCLUDING THE TWO THAT DO
   * NOT NEED IT TODAY.** The cached branch and the failed-to-open branch both run
   * during the route's `await iterator.next()`, which IS in scope — so wrapping them
   * is currently redundant. It is deliberate: "the first pull happens to be in scope"
   * is an ordering fact about the caller, not a property of this file, and the next
   * person to add a chunk before them would break it with nothing red.
   */
  const inScope = bindAnalyticsScope();

  async function* iterate(): AsyncGenerator<string> {
    const startedAt = performance.now();
    let out: TranslateResult = { body: args.source, outcome: 'failed', fellBack: true };

    try {
      /* Already in the target language. One chunk, nothing generated. */
      if (args.sourceLocale === args.target) {
        out = { body: args.source, outcome: 'cached', fellBack: true };
        yield out.body;
        return;
      }

      const cached = await readCache(args, handle);
      if (cached) {
        out = { body: cached, outcome: 'cached', fellBack: false };
        inScope(() =>
          report(args, {
            outcome: 'cached',
            violation: null,
            chars: cached.length,
            streamed: true,
            startedAt,
          }),
        );
        // ONE chunk. T2.
        yield out.body;
        return;
      }

      const streamed = await openStream(args);
      if (!streamed) {
        inScope(() =>
          report(args, {
            outcome: 'failed',
            violation: null,
            chars: 0,
            streamed: true,
            startedAt,
          }),
        );
        yield args.source;
        return;
      }

      /*
       * The first chunk was already pulled by `openStream`, for the reason
       * `/api/memory/summary` gives: `streamReading` is an `async *` generator, so
       * calling it starts nothing, and pulling before the caller commits to a
       * response means a call that dies before its first token becomes a clean
       * fallback rather than a 200 with an empty body.
       */
      let body = streamed.first;
      yield streamed.first;

      for (;;) {
        let next: IteratorResult<string>;
        try {
          next = await streamed.iterator.next();
        } catch (err) {
          /*
           * A MID-STREAM FAILURE STOPS, IT DOES NOT DISCARD. The viewer has already
           * seen part of the prose; replacing it with the untranslated source would
           * be worse than a short translation. What arrived is then verified like
           * anything else — and a truncated body fails the paragraph check, so it is
           * NOT persisted, which is exactly right.
           */
          logFailure(err);
          break;
        }
        if (next.done) break;
        body += next.value;
        yield next.value;
      }

      /*
       * THE ONE THAT WAS ACTUALLY BROKEN. `settle()` both reports and `defer()`s the
       * repair pass, and it always runs after the first chunk -- so it always ran
       * inside `pull()`, outside the scope.
       */
      out = await inScope(() => settle(args, body.trim(), { streamed: true, startedAt, handle }));
    } finally {
      /*
       * `finally`, so a consumer that abandons the iterator mid-way still settles
       * the promise. An unsettled one parks the route's `after()` on its timeout —
       * the same property `LLMStream.usage` has, for the same reason.
       */
      settleResult(out);
    }
  }

  return Object.assign(iterate(), { result });
}

/**
 * Reserve, open the provider stream, and pull the first chunk.
 *
 * Null means "nothing usable started": the ceiling refused, the call threw, or the
 * stream closed before a token. All three are the caller's `failed` path.
 */
async function openStream(
  args: TranslateArgs,
): Promise<{ iterator: AsyncIterator<string>; first: string } | null> {
  const spec = specFor(args);
  try {
    /*
     * `interactive`: somebody is watching a spinner for these bytes. Only the gist
     * and the repair pass are deferred, and neither reaches this function — the gist
     * does not stream and the repair runs in `after()`.
     */
    const { reserveModelCall } = await import('@/lib/llm/meter');
    const quota = await reserveModelCall('interactive');
    if (!quota.ok) return null;

    const prompt = buildTranslationPrompt({
      source: args.source,
      sourceLocale: args.sourceLocale,
      target: args.target,
      spec,
      readerId: args.readerId,
      serviceId: args.serviceId,
    });

    /*
     * `streamReading` takes a `ReadingPrompt`, which carries a `promptVersion`. This
     * is not a reading and nothing writes it to `readings.prompt_version` — but
     * `translations.prompt_version` is real and the cache compares against it, so
     * the value is the same constant either way and nothing is invented here. The
     * day summary does exactly this.
     */
    /*
     * `getProvider().streamReading` ON ONE LINE, deliberately. `callClass.test.ts`
     * greps the source for exactly that string to enumerate the call sites that must
     * reserve for themselves — splitting it across lines hides this file from the one
     * check that would notice a stream reaching a model outside the ceiling.
     */
    const stream = getProvider().streamReading({
      ...prompt,
      promptVersion: TRANSLATION_PROMPT_VERSION,
    });
    const iterator = stream[Symbol.asyncIterator]();

    const first = await iterator.next();
    if (first.done || !first.value) return null;
    return { iterator, first: first.value };
  } catch (err) {
    logFailure(err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

/**
 * A cached body, if there is one and it is fresh.
 *
 * FRESH MEANS TWO THINGS, and the second is easy to forget: the row's
 * `prompt_version` still matches, AND `updated_at >= source.updated_at` (T8). The
 * first is why the constant is hand-bumped rather than hashed; the second is why
 * `putTranslation` writes `updatedAt` by hand.
 */
async function readCache(args: TranslateArgs, handle?: DbOrTx): Promise<string | null> {
  try {
    const db = handle ?? (await import('@/lib/db/client')).db;
    const { getTranslation } = await import('@/lib/db/queries/translations');

    const row = await getTranslation(db, {
      entity: args.entity,
      entityId: args.entityId,
      field: args.field,
      locale: args.target,
    });
    if (!row) return null;
    if (row.promptVersion !== TRANSLATION_PROMPT_VERSION) return null;
    if (row.updatedAt.getTime() < args.sourceUpdatedAt.getTime()) return null;
    return row.body;
  } catch (err) {
    /*
     * A DATABASE HICCUP IS A CACHE MISS, NOT A FAILURE. The feature degrades to one
     * model call per view, which is expensive and correct; throwing here would take
     * the page down over a cache read. This is the "stop the database and open a
     * translated reading" check.
     */
    logFailure(err);
    return null;
  }
}

/** One model call. Returns null on anything unusable — never throws. */
async function generate(
  args: TranslateArgs,
  repairing?: Violation[],
): Promise<string | null> {
  const spec = specFor(args);
  try {
    const prompt = buildTranslationPrompt({
      source: args.source,
      sourceLocale: args.sourceLocale,
      target: args.target,
      spec,
      readerId: args.readerId,
      serviceId: args.serviceId,
      repairing,
    });

    const { text } = await getProvider().complete(prompt, {
      /*
       * **THE ONE `op` IN THE APP THAT IS AN EXPRESSION, and it is the same shape
       * this file's `callClass` already is.** A repair pass is a second call the
       * querent never waited for, so it is counted apart from the translation it
       * repairs -- folding them would hide the cost of the repair architecture,
       * which is the one thing this file's header asks to be able to measure.
       */
      op: repairing ? 'translation_repair' : 'translation',
      /*
       * THE BODY IS `interactive` AND THE GIST IS `deferred`, and the difference is
       * whether a person is watching a spinner for these bytes. `meter.ts`'s soft
       * tier sheds deferred work first, so a quota running low costs a chained
       * reading some specificity rather than costing a viewer their translation.
       *
       * The REPAIR pass is always deferred: it runs in `after()` and its absence is
       * a cache that stays empty, which is one more model call next view.
       */
      callClass: repairing || !spec.stream ? 'deferred' : 'interactive',
    });

    return text.trim() || null;
  } catch (err) {
    logFailure(err);
    return null;
  }
}

/**
 * Verify, persist what verified, and schedule the repair for what did not.
 */
async function settle(
  args: TranslateArgs,
  output: string,
  ctx: { streamed: boolean; startedAt: number; handle?: DbOrTx },
): Promise<TranslateResult> {
  const spec = specFor(args);
  const violations = verifyTranslation({
    source: args.source,
    output,
    spec,
    target: args.target,
    readerId: args.readerId,
    serviceId: args.serviceId,
  });

  if (violations.length === 0) {
    await persist(args, output, ctx.handle);
    report(args, {
      outcome: 'ok',
      violation: null,
      chars: output.length,
      streamed: ctx.streamed,
      startedAt: ctx.startedAt,
    });
    return { body: output, outcome: 'ok', fellBack: false };
  }

  report(args, {
    outcome: 'invalid',
    // The FIRST kind, not a list. A classifier, never a message — `violation`
    // has to be groupable, which is rule 2 of the taxonomy.
    violation: violations[0].kind,
    chars: output.length,
    streamed: ctx.streamed,
    startedAt: ctx.startedAt,
  });

  /*
   * THE REPAIR PASS, BEHIND THE RESPONSE. `defer()` and never `await` — the viewer
   * has already been handed `output`, and the only thing left to fix is what the
   * NEXT view gets. Nothing here is on the path of a byte anybody is waiting for.
   */
  defer(async () => {
    const startedAt = performance.now();
    const repaired = await generate(args, violations);
    if (!repaired) {
      report(args, {
        outcome: 'failed',
        violation: violations[0].kind,
        chars: 0,
        streamed: false,
        startedAt,
      });
      return;
    }

    const still = verifyTranslation({
      source: args.source,
      output: repaired,
      spec,
      target: args.target,
      readerId: args.readerId,
      serviceId: args.serviceId,
    });

    if (still.length > 0) {
      // Both passes failed. NOTHING is persisted: the cache stays empty and the
      // next view pays for another attempt, which is strictly better than serving
      // prose that failed the contract forever.
      report(args, {
        outcome: 'invalid',
        violation: still[0].kind,
        chars: repaired.length,
        streamed: false,
        startedAt,
      });
      return;
    }

    await persist(args, repaired, ctx.handle);
    report(args, {
      outcome: 'repaired',
      violation: violations[0].kind,
      chars: repaired.length,
      streamed: false,
      startedAt,
    });
  });

  /*
   * The viewer gets the unverified body ONCE. See the file header for why this is
   * the trade rather than buffering or caching it.
   */
  return { body: output, outcome: 'invalid', fellBack: false };
}

/** The write. Never throws — a failed cache write costs one model call next view. */
async function persist(args: TranslateArgs, body: string, handle?: DbOrTx): Promise<void> {
  try {
    const db = handle ?? (await import('@/lib/db/client')).db;
    const { putTranslation } = await import('@/lib/db/queries/translations');

    await putTranslation(db, {
      entity: args.entity,
      entityId: args.entityId,
      field: args.field,
      sourceLocale: args.sourceLocale,
      locale: args.target,
      body,
      model: process.env.TRANSLATION_MODEL || process.env.LLM_MODEL || 'unknown',
      promptVersion: TRANSLATION_PROMPT_VERSION,
    });
  } catch (err) {
    logFailure(err);
  }
}

function specFor(args: TranslateArgs): FieldSpec {
  const spec = TRANSLATABLE[`${args.entity}.${args.field}` as keyof typeof TRANSLATABLE];
  /*
   * The route guards the key with `isTranslatableKey` before reaching here, so this
   * is unreachable through the app. Stated rather than asserted because the
   * alternative is `undefined.stream`, and a `TypeError` deep in a stream is a worse
   * diagnostic than a named fallback.
   */
  return spec ?? { stream: false, voiced: false, budget: 'gist' };
}

function report(
  args: TranslateArgs,
  o: {
    outcome: TranslateOutcome;
    violation: string | null;
    chars: number;
    streamed: boolean;
    startedAt: number;
  },
): void {
  track('translation.generated', {
    entity: args.entity,
    entity_id: args.entityId,
    field: args.field,
    source_locale: args.sourceLocale,
    locale: args.target,
    outcome: o.outcome,
    violation: o.violation,
    chars: o.chars,
    streamed: o.streamed,
    total_ms: Math.round(performance.now() - o.startedAt),
  });
}

/**
 * NEVER LOG THE DRIVER ERROR, AND NEVER LOG THE LLM CLIENT ERROR.
 *
 * CLAUDE.md's rule, and this is one of the two sharpest places for it. A postgres
 * error quotes the failing statement AND its bound parameters, and one of those is
 * the translated body — a rendering of a reading that answered the querent's typed
 * question. An LLM client error is worse still: it can carry the whole prompt, which
 * contains the source verbatim. Development prints everything, because there is
 * nobody to leak it to.
 */
function logFailure(err: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.error('[translate] failed', err);
  } else {
    console.error('[translate] failed', {
      name: err instanceof Error ? err.name : typeof err,
    });
  }
}
