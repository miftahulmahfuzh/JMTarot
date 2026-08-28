import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { LLMOp } from './types';

/**
 * Every model call in the app: which half of the window ceiling it draws on, and
 * **since A2, which `op` it records itself as.**
 *
 * **A GREP OVER THE SOURCE, IN THE `clientBoundary.test.ts` IDIOM, AND THAT IS
 * THE POINT.** `meter.test.ts` proves what the tiers do and `metered.test.ts`
 * proves the decorator applies them; neither can notice a NEW call site that
 * quietly took the default. This one fails when the set of call sites changes, so
 * adding one is a decision rather than an omission.
 *
 * The default is `interactive`, which is the safe direction -- the failure of
 * forgetting is "shed too late", never "shed a reading early" -- but a *deferred*
 * call that forgets to say costs real headroom, silently, and that is what this
 * catches.
 *
 * ── THE `op` HALF (A2, v0.5.0) ──────────────────────────────────────────────
 *
 * `op` has no safe default: it is REQUIRED on `CompleteOpts`, so a buffered site that
 * forgets it is a compile error. What the compiler cannot catch is a site that
 * declares the WRONG one, or a tenth value appearing in `llm_calls.op` -- **and A3
 * groups its whole cost breakdown by that column** (roadmap seam 3: nine, closed, no
 * tenth and no alias). So this file asserts three things the type system does not:
 *
 *   1. every call site's `op` marker is present in its own source;
 *   2. the `op` values used anywhere under `src/**` are exactly `LLMOp`'s ten;
 *   3. a value in `LLMOp` with NO call site is a failure too -- a dead `op` reads as a
 *      cost category that exists and is permanently empty, which is worse than absent.
 *
 * **`translate.ts`'s marker is an EXPRESSION, not a literal**, because that one site
 * serves two ops. Same trick its `callClass` marker already uses, and the same reason:
 * a test that guessed the form would pass on a file that merely mentioned the word.
 */

/** Every `complete()` call site outside this directory, and its expected class. */
const COMPLETE_CALLS: Array<{
  file: string;
  expect: 'interactive' | 'deferred';
  /** The exact source text that declares it. Not derived from `expect`, because
   *  lotus.generate.ts declares its class as a defaulted PARAMETER rather than a
   *  literal at the call site -- and a test that guessed the form would pass on a
   *  file that had merely mentioned the word. */
  marker: string;
  /** A2. The `op`s this site records, and the exact source text that declares them --
   *  `translate.ts`'s is an expression serving two, not a literal. */
  op: LLMOp[];
  opMarker: string;
  why: string;
}> = [
  {
    /*
     * **A6's BLOG AUTO-TRANSLATE, ADDED 2026-07-30, AND THIS ROW IS THE DECISION THIS
     * TABLE EXISTS TO FORCE.** It reuses `op: 'translation'` rather than proposing a
     * tenth value -- roadmap seam 3: *nine, closed, no tenth and no alias* -- and the
     * attribution caveat is recorded in `blogAutoTranslate.ts`: one article is ~3,000
     * tokens each way against a reading translation's ~150 words, so A3's *cost per
     * `translation`* mixes two very different quantities. `llm_calls.user_id` is what
     * tells them apart today, an operator against a querent.
     */
    file: 'src/lib/admin/blogAutoTranslate.ts',
    op: ['translation'],
    opMarker: "op: 'translation'",
    expect: 'deferred',
    marker: "callClass: 'deferred'",
    why: 'an ADMIN convenience, and the ceiling is fleet-wide -- an operator seeding an English draft must be shed before a querent waiting on a reading is, so `interactive` would be exactly backwards',
  },
  {
    /*
     * **A7's DASHBOARD INSIGHT, ADDED 2026-07-31, AND IT SPENT THE TENTH `op`.** The
     * row above it reused `translation` rather than proposing one and recorded the cost
     * of doing so; this one did the opposite and the argument is in `@/lib/llm/types`:
     * the insight button is a new RECURRING call with no querent behind it, and
     * `/admin/tokens`' own *Biaya per keperluan* table is the surface that has to be
     * able to say what it costs. Folding it in would make the dashboard hide the price
     * of its own newest feature.
     *
     * `deferred` for `blogAutoTranslate`'s reason verbatim — the operator is waiting,
     * and must still be shed before a querent's reading is.
     */
    file: 'src/lib/admin/insight.ts',
    op: ['insight'],
    opMarker: "op: 'insight'",
    expect: 'deferred',
    marker: "callClass: 'deferred'",
    why: 'an ADMIN convenience on a fleet-wide ceiling; the tier is also its kill switch, which is why flagCoverage.test.ts exempts it',
  },
  {
    /*
     * **AUTO FORMAT, 2026-07-31, AND IT SPENT THE ELEVENTH `op`.** The row above spent the
     * tenth and the row above THAT reused `translation` and recorded the cost of doing so
     * — three admin-only sites, three different answers to the same question, and the
     * spread is the evidence that each was decided rather than defaulted.
     *
     * This one earns a value on `insight`'s argument: a recurring call with no querent
     * behind it whose price `/admin/tokens` has to be able to state. Reusing `translation`
     * would have put a third unrelated feature behind one cost row, which is the failure
     * `blogAutoTranslate`'s header names as its own known caveat.
     *
     * `deferred` for the same reason as the other two: the operator is waiting, and must
     * still be shed before a querent's reading is.
     *
     * **THIS IS THE SECOND `flagCoverage` EXEMPTION IN THE ADMIN-ONLY CLASS AND THE LAST
     * FREE ONE.** A third gets a single `ADMIN_MODEL_CALLS_ENABLED` covering the class.
     */
    file: 'src/lib/admin/blogFormat.ts',
    op: ['blog_format'],
    // `model: adminModel()` joined it on 2026-08-01 — `ADMIN_MODEL` covers all three
    // admin-only sites, and this marker is exact source text, so it moved with the call.
    opMarker: "{ op: 'blog_format', callClass: 'deferred', model: adminModel() }",
    expect: 'deferred',
    marker: "callClass: 'deferred'",
    why: 'an ADMIN convenience on a fleet-wide ceiling, and skipped entirely on an already-sectioned paste; the tier is its kill switch',
  },
  {
    /*
     * **v0.7.0's DIRECTOR, AND IT SPENT THE TWELFTH `op`.** `C-D5`, asked and granted
     * through the same process `insight` and `blog_format` went through: Miftah asked
     * for the chat's token consumption to be visible in `/admin`, and a cost table
     * cannot say what the chat costs if the chat's calls are filed under `reading`.
     *
     * **TWO OPS AND NOT ONE**, because the director is a large prompt with a tiny JSON
     * reply and a voice is a large prompt with a two-sentence reply — averaging them
     * makes both figures meaningless.
     *
     * **`deferred` IS THE ONE ROW IN THIS TABLE WHERE A QUERENT IS WATCHING AND THE
     * ANSWER IS STILL `deferred`.** The three admin rows above are `deferred` because
     * nobody but an operator is waiting; this one is `deferred` in spite of somebody
     * waiting, and the reason is arithmetic rather than taxonomy: **a run is 2–5 calls,
     * sixty runs exhaust the app's whole five-hour quota, and the next thing refused
     * would be somebody's reading.** `C-D6` is the ruling; `chat/budget.ts` is the
     * sub-budget that keeps the chat inside its own half of it.
     */
    file: 'src/lib/chat/direct/plan.ts',
    op: ['chat_plan'],
    opMarker: "op: 'chat_plan'",
    expect: 'deferred',
    marker: "callClass: 'deferred'",
    why: 'a chat run is 2-5 calls and sixty runs exhaust the fleet quota; when the chat and a reading compete the reading wins (C-D6)',
  },
  {
    /*
     * **v0.7.0's VOICE, THE THIRTEENTH `op`.** Same grant, same tier, same argument.
     * The row above carries it in full.
     *
     * **NEITHER SITE PASSES A `readingId`, AND THAT IS `[R8]`.** `readingCostsFor` and
     * `callsForReading` fold every `reading_id`-bearing ledger row into a reading's
     * *Biaya generasi* with no `op` predicate, and a chat run has two plausible reading
     * pointers — `chat_runs.trigger_reading_id`, and an attachment's
     * `attached_reading_id`. Passing one would make **a chat run inflate the cost of
     * the reading that triggered it, silently.**
     */
    file: 'src/lib/chat/voices/turn.ts',
    op: ['chat_turn'],
    opMarker: "op: 'chat_turn'",
    expect: 'deferred',
    marker: "callClass: 'deferred'",
    why: 'the same promise to the reading as the planner, and a proactive turn is this op too -- what made it proactive is chat_runs.trigger',
  },
  {
    file: 'src/lib/moderation/classify.ts',
    op: ['moderation'],
    opMarker: "op: 'moderation'",
    expect: 'interactive',
    marker: "callClass: 'interactive'",
    why: 'gates a reading a person is waiting for; shedding it early is blocklist-only moderation arrived at by accident',
  },
  {
    file: 'src/lib/memory/gist.generate.ts',
    op: ['gist'],
    opMarker: "{ op: 'gist', callClass: 'deferred' }",
    expect: 'deferred',
    marker: "callClass: 'deferred'",
    why: "runs in the reading's after(); a shed gist falls through to the reading's own last sentence",
  },
  {
    file: 'src/app/api/memory/frequency/route.ts',
    op: ['frequency'],
    opMarker: "op: 'frequency'",
    expect: 'deferred',
    marker: "callClass: 'deferred'",
    why: 'FrequencyLine renders nothing until there is something and has no error copy (M14), so a 204 is invisible',
  },
  {
    file: 'src/lib/prompt/lotus.generate.ts',
    op: ['lotus'],
    opMarker: "{ op: 'lotus', model, callClass }",
    expect: 'interactive',
    marker: "callClass: CallClass = 'interactive'",
    why: 'threads a callClass parameter defaulting to interactive; only scheduleLotusRefresh passes deferred',
  },
  {
    /*
     * V2. THE ONE CALL SITE IN THE APP THAT IS BOTH, and the condition is what
     * declares it rather than a literal — so the marker is the expression.
     *
     * A body translation is `interactive`: a viewer is watching it arrive, and
     * shedding it means an English reader gets Indonesian prose with no explanation.
     * The GIST is `deferred` — it is prompt input for a later reading's `<riwayat>`
     * block, nobody ever sees it, and its absence is a slightly less specific chain
     * block. So is the REPAIR pass, which runs in `after()` and whose absence is a
     * cache that stays empty for one more view.
     */
    file: 'src/lib/translate/translate.ts',
    op: ['translation', 'translation_repair'],
    opMarker: "op: repairing ? 'translation_repair' : 'translation'",
    expect: 'interactive',
    marker: "repairing || !spec.stream ? 'deferred' : 'interactive'",
    why: 'a body translation is watched; the gist and the deferred repair pass are not',
  },
  {
    /*
     * V8. A THREADED PARAMETER, like `lotus.generate.ts`, and for the same reason:
     * two callers with genuinely different answers.
     *
     * `/account`'s FIRST visit is `interactive` -- the querent is looking at a
     * heading with a placeholder under it and there is nothing true to show them
     * instead, so shedding costs them the fallback rather than costing them nothing.
     * The serve-stale branch passes `deferred`: a true paragraph is already on
     * screen, and a shed refresh leaves it exactly as slightly-out-of-date as it
     * already was. The facts editor's regeneration is interactive, because somebody
     * just renamed themselves and the whole point is that the persona moves.
     */
    file: 'src/lib/persona/generate.ts',
    op: ['persona'],
    opMarker: "{ op: 'persona', model, callClass }",
    expect: 'interactive',
    marker: "callClass: CallClass = 'interactive'",
    why: "the first /account visit has nothing to show instead; only the serve-stale branch passes deferred",
  },
];

/**
 * `streamReading()` call sites, which the decorator does NOT wrap -- so each must
 * reserve for itself or it is a model call outside the ceiling altogether.
 */
const STREAM_CALLS: Array<{
  file: string;
  reserves: string;
  /** A2. A stream writes its OWN row -- the decorator does not -- so the marker is a
   *  `recordCall({ op: ... })` and not an options key. */
  op: LLMOp;
  opMarker: string;
  why: string;
}> = [
  {
    file: 'src/app/api/reading/route.ts',
    op: 'reading',
    opMarker: "op: 'reading',",
    reserves: "reserveModelCall('interactive')",
    why: 'the querent is watching a spinner, and this is the only place that can turn a refusal into a 429',
  },
  {
    /*
     * PHASE 3 OF THE RETRY WORK. The SECOND `op: 'reading'` streaming site, and
     * the only one that writes over a row that already exists. It reserves
     * `interactive` for `/api/reading`'s exact reason -- a person pressed a button
     * and is watching a spinner -- and a refusal here becomes the same 429.
     */
    file: 'src/app/api/reading/retry/[id]/route.ts',
    op: 'reading',
    opMarker: "op: 'reading',",
    reserves: "reserveModelCall('interactive')",
    why: 'the querent pressed retry and is watching a spinner, exactly as on the draw screen',
  },
  {
    file: 'src/app/api/memory/summary/route.ts',
    op: 'day_summary',
    opMarker: "op: 'day_summary',",
    reserves: "reserveModelCall('deferred')",
    why: 'DaySummary has a 204 path and no error copy, so shedding it is indistinguishable from no summary yet',
  },
  {
    /*
     * V2, AND THE THIRD MEMBER OF THIS LIST. `translateStream` is the one place a
     * translation reaches `streamReading`, and a refusal there falls back to the
     * SOURCE prose rather than to nothing — which is honest and legible: the reading
     * really is in the other language.
     */
    file: 'src/lib/translate/translate.ts',
    op: 'translation',
    opMarker: "op: 'translation',",
    reserves: "reserveModelCall('interactive')",
    why: 'a viewer is waiting for it; a refusal falls back to the untranslated source',
  },
];

const read = (f: string) => readFileSync(f, 'utf8');

/** Every non-test file under src/ that reaches a model. */
function callSites(pattern: string): string[] {
  const out = execSync(
    `grep -rl "${pattern}" src --include=*.ts --include=*.tsx || true`,
    { encoding: 'utf8' },
  );
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.includes('.test.'))
    .filter((f) => !f.startsWith('src/lib/llm/'))
    .sort();
}

describe('every complete() call site declares its class', () => {
  it('the set of call sites is exactly the one this table describes', () => {
    /*
     * The assertion that makes the rest meaningful. A new `complete()` call site
     * silently takes `interactive`; if it should have been deferred, nothing else
     * in the suite would ever say so.
     */
    expect(callSites('getProvider()\\.complete')).toEqual(
      COMPLETE_CALLS.map((c) => c.file).sort(),
    );
  });

  for (const { file, expect: cls, marker, opMarker, op, why } of COMPLETE_CALLS) {
    it(`${file} is ${cls} -- ${why}`, () => {
      expect(read(file)).toContain(marker);
    });

    it(`${file} declares op ${op.join(' | ')}`, () => {
      // A2. The marker is the exact source text, so deleting the `op` from the call
      // site turns this red rather than leaving a row with no purpose.
      expect(read(file)).toContain(opMarker);
    });
  }

  it('the classifier is NEVER marked deferred', () => {
    /*
     * Stated as its own assertion because it is the one a future session is most
     * likely to "optimise". Shedding the classifier at the soft ceiling moves the
     * app into blocklist-only moderation for the busy half of every day -- which is
     * `MODERATION_CLASSIFIER_ENABLED=0`, reached by accident, with nothing saying so.
     */
    expect(read('src/lib/moderation/classify.ts')).not.toContain("callClass: 'deferred'");
  });

  it('only the speculative Lotus repair is deferred, not the onboarding writes', () => {
    // A user pressed a button on three of the four paths, and the distillation is
    // what their next reading is built from.
    const src = read('src/lib/prompt/lotus.generate.ts');
    expect(src).toContain("generateLotus(userId, 'deferred')");
    expect(src).toContain("callClass: CallClass = 'interactive'");
  });
});

describe('every streamReading() call site reserves for itself', () => {
  it('the set of streaming call sites is exactly the one this table describes', () => {
    /*
     * **THE GAP THIS TABLE EXISTS FOR.** The decorator wraps `complete()` only, so
     * a `streamReading` call site that does not reserve is a model call outside the
     * ceiling entirely -- invisible, and worth two of the six calls a single visit
     * can make. The plan's Task 16 listed the day summary among the `complete()`
     * sites; it streams.
     */
    expect(callSites('getProvider()\\.streamReading')).toEqual(
      STREAM_CALLS.map((c) => c.file).sort(),
    );
  });

  for (const { file, reserves, op, opMarker, why } of STREAM_CALLS) {
    it(`${file} calls ${reserves} -- ${why}`, () => {
      expect(read(file)).toContain(reserves);
    });

    it(`${file} records its own row as op ${op}`, () => {
      /*
       * A2. **A STREAM WRITES ITS OWN ROW AND THE DECORATOR DOES NOT**, which is the
       * same asymmetry this table already exists for one level up: the decorator cannot
       * know a stream's outcome, so a `streamReading` site that never calls
       * `recordCall` is a model call absent from the ledger entirely -- invisible, in
       * the table whose whole purpose is that nothing is.
       */
      const src = read(file);
      expect(src).toContain('recordCall(');
      expect(src).toContain(opMarker);
    });
  }
});

/**
 * THE `op` SET IS CLOSED, IN BOTH DIRECTIONS.
 *
 * A3 groups its entire cost breakdown by `llm_calls.op` and roadmap seam 3 says: nine
 * values, closed, no tenth and no alias. **A7 asked for the tenth and Miftah granted it
 * on 2026-07-31**, `blog_format` took the eleventh the same day, and **v0.7.0's group
 * chat took the twelfth and thirteenth on 2026-08-07** (`C-D5`) — every one through the
 * process the seam demands rather than around it. **The rule was never that ten is a
 * magic number: a new value is a question for Miftah.** The arguments are in
 * `@/lib/llm/types`.
 *
 * The compiler enforces the set for a `CompleteOpts` literal; it enforces nothing about
 * a `recordCall` at a streaming site, and nothing at all about a value that exists in
 * the union with no producer.
 */
describe('the op set is exactly LLMOp, in both directions', () => {
  /** Kept as a literal, NOT derived from the tables -- a set derived from the thing it
   *  checks cannot disagree with it. This is the twelfth and thirteenth values' only home. */
  const LLM_OPS: LLMOp[] = [
    'reading',
    'moderation',
    'gist',
    'day_summary',
    'frequency',
    'lotus',
    'persona',
    'translation',
    'translation_repair',
    'insight',
    'blog_format',
    'chat_plan',
    'chat_turn',
  ];

  it('the union in types.ts is exactly these thirteen', () => {
    // Parsed off the source, so widening `LLMOp` without touching this list is red.
    const src = read('src/lib/llm/types.ts');
    const block = src.slice(src.indexOf('export type LLMOp'));
    const declared = [...block.slice(0, block.indexOf(';')).matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1],
    );
    expect(declared.sort()).toEqual([...LLM_OPS].sort());
  });

  it('every declared op has at least one call site', () => {
    /*
     * **A DEAD `op` IS WORSE THAN A MISSING ONE.** It reads as a cost category that
     * exists and is permanently empty, so an operator concludes the feature is unused
     * rather than that the value is unreachable -- and A3 renders a row of zeroes with
     * no way to tell the two apart.
     */
    const declared = new Set([
      ...COMPLETE_CALLS.flatMap((c) => c.op),
      ...STREAM_CALLS.map((c) => c.op),
    ]);
    expect([...declared].sort()).toEqual([...LLM_OPS].sort());
  });

  it('no op string appears at ANY ledger-writing site that is not one of the ten', () => {
    /*
     * The grep half, and the one that catches a tenth value invented at a NEW site --
     * including one added by A3 or A5, who read this column and do not own it. The two
     * "set of call sites is exactly this table" assertions above cannot: a file that
     * calls `recordCall` without calling `getProvider()` is invisible to both.
     *
     * **SCOPED TO FILES THAT DECLARE A LEDGER `op`, NOT TO ALL OF `src/**`.** The first
     * version grepped every file and failed on `src/lib/ratelimit/index.ts`'s
     * `op: 'consume' | 'peek'` -- an unrelated property in a type annotation. A check
     * that fires on a field that merely shares a name is a check somebody widens the
     * allowlist for, and then it is asserting nothing.
     */
    const files = execSync(
      `grep -rlE "recordCall\\(|getProvider\\(\\)" src --include=*.ts --include=*.tsx || true`,
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)
      // Not the declaration, and not this file's own list of the ten.
      .filter((f) => f !== 'src/lib/llm/types.ts' && !f.includes('.test.'));

    expect(files.length).toBeGreaterThan(5);

    const used = new Set<string>();
    for (const f of files) {
      for (const m of read(f).matchAll(/\bop: '([a-z_]+)'/g)) used.add(m[1]);
    }

    // Every value written at a site that can reach the ledger must be one of the ten.
    // The reverse direction is the test above; this one is about strangers.
    expect([...used].filter((v) => !LLM_OPS.includes(v as LLMOp)).sort()).toEqual([]);
    // And the scan must have found real values, or it is vacuous.
    expect(used.size).toBeGreaterThan(5);
  });
});
