import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Every model call in the app, and which half of the window ceiling it draws on.
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
  why: string;
}> = [
  {
    file: 'src/lib/moderation/classify.ts',
    expect: 'interactive',
    marker: "callClass: 'interactive'",
    why: 'gates a reading a person is waiting for; shedding it early is blocklist-only moderation arrived at by accident',
  },
  {
    file: 'src/lib/memory/gist.generate.ts',
    expect: 'deferred',
    marker: "callClass: 'deferred'",
    why: "runs in the reading's after(); a shed gist falls through to the reading's own last sentence",
  },
  {
    file: 'src/app/api/memory/frequency/route.ts',
    expect: 'deferred',
    marker: "callClass: 'deferred'",
    why: 'FrequencyLine renders nothing until there is something and has no error copy (M14), so a 204 is invisible',
  },
  {
    file: 'src/lib/prompt/lotus.generate.ts',
    expect: 'interactive',
    marker: "callClass: CallClass = 'interactive'",
    why: 'threads a callClass parameter defaulting to interactive; only scheduleLotusRefresh passes deferred',
  },
];

/**
 * `streamReading()` call sites, which the decorator does NOT wrap -- so each must
 * reserve for itself or it is a model call outside the ceiling altogether.
 */
const STREAM_CALLS: Array<{ file: string; reserves: string; why: string }> = [
  {
    file: 'src/app/api/reading/route.ts',
    reserves: "reserveModelCall('interactive')",
    why: 'the querent is watching a spinner, and this is the only place that can turn a refusal into a 429',
  },
  {
    file: 'src/app/api/memory/summary/route.ts',
    reserves: "reserveModelCall('deferred')",
    why: 'DaySummary has a 204 path and no error copy, so shedding it is indistinguishable from no summary yet',
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

  for (const { file, expect: cls, marker, why } of COMPLETE_CALLS) {
    it(`${file} is ${cls} -- ${why}`, () => {
      expect(read(file)).toContain(marker);
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

  for (const { file, reserves, why } of STREAM_CALLS) {
    it(`${file} calls ${reserves} -- ${why}`, () => {
      expect(read(file)).toContain(reserves);
    });
  }
});
