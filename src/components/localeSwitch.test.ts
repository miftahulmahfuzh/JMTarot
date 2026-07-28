import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The language switch must not be able to hang, and the switch must reach the
 * prose as well as the chrome.
 *
 * ── WHY THESE ARE SOURCE-LEVEL ASSERTIONS ────────────────────────────────────
 *
 * There is no testing-library here and there must not be one: the unit project
 * includes `src/**\/*.test.ts` only, `environment: 'node'`, and CLAUDE.md's
 * verification ladder puts component behaviour on the iframe harnesses rather
 * than on a renderer. So these are shaped like `accountSurface.test.ts` and
 * `legal.test.ts` -- they read the source and assert the property that the
 * comment in the source claims.
 *
 * `public/cards/_localehang.html` is the behavioural half. It drives the real
 * account sheet with real PointerEvents and reports whether the control comes
 * back; that is what found the stale-prose defect these tests now fence.
 *
 * ── WHAT THE MEASUREMENTS WERE ───────────────────────────────────────────────
 *
 * Locally, warm, against Postgres in Docker: `POST /api/locale` is 22ms and the
 * RSC refresh behind it is 53ms. There is no LLM call anywhere on that path --
 * the only callers of `translateOrCached`/`translateStream` are `/api/translate`
 * (no UI caller yet) and `chain.ts` (already deferred). So the hang reported on
 * Vercel is NOT a translation blocking the switch, and the fix is not to move a
 * model call off the path. It is the cold path: Hobby's default function budget
 * against a Neon free-plan compute that has scaled to zero.
 */

const SRC = join(process.cwd(), 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/**
 * Source with comments removed.
 *
 * NEEDED, and the first version of this file proved it: the assertion below
 * forbids a `setLine(null)` reset, and the comment in `FrequencyLine.tsx`
 * explaining WHY it is forbidden contains the literal string `setLine(null)`.
 * A grep over raw source fails on the documentation of the very rule it checks
 * -- which would teach the next person to delete the explanation to get green.
 */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

/**
 * The dependency arrays of every `useEffect` in a file, as raw source text.
 *
 * Matches the `}, [deps]);` tail rather than trying to parse the hook, which is
 * enough to answer "is `locale` in there" and does not need a JS parser.
 */
function effectDeps(source: string): string[] {
  return [...source.matchAll(/\}\s*,\s*\[([^\]]*)\]\s*\)\s*;/g)].map((m) => m[1].trim());
}

describe('POST /api/locale survives a cold serverless path', () => {
  const source = read('app/api/locale/route.ts');

  /**
   * **THIS IS THE ROUTE THE REPORTED HANG BELONGS TO, AND IT WAS THE ONLY
   * DATABASE-WRITING ROUTE IN THE APP WITH NEITHER DECLARATION.**
   *
   * `docs/DEPLOY-VERCEL.md` puts functions on Hobby in `sin1` and Neon on the
   * free plan in `ap-southeast-1`. Vercel's Hobby default function budget is 10
   * seconds. A free-plan Neon compute suspends when idle, so the FIRST write
   * after a quiet spell pays the wake, and this route is one of the few user
   * actions that writes at all -- it is therefore one of the likeliest requests
   * in the app to be the one that wakes it.
   *
   * Worse, it is TWO sequential round trips to that compute (`setUserLocale`,
   * then `readSessionFacts` inside `refreshSession()`) with one Singapore ->
   * Tokyo Upstash hop between them, on a `max: 1` connection. Killed at ten
   * seconds the write is lost, the response never arrives, and the querent sees
   * a dead toggle. Every other slow route already declares its budget.
   */
  it('declares its runtime and a budget bigger than Hobby default', () => {
    expect(source).toMatch(/export const runtime = 'nodejs'/);
    const m = source.match(/export const maxDuration = (\d+)/);
    expect(m, 'no maxDuration declared').not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(10);
  });
});

describe('the language toggle cannot be left dead', () => {
  const source = read('components/LocaleSwitch.tsx');

  /**
   * `busy` disables both options, and `posting` only clears in the `finally`.
   * An unbounded `fetch` therefore holds the control disabled for as long as the
   * network holds the request -- with no spinner and no copy, because M14 gives
   * this component no error string. A ten-second cold start is indistinguishable
   * from a broken app.
   *
   * The bound is on the CLIENT because it is the client's liveness that is at
   * stake. `maxDuration` above lets the server finish the write; this lets the
   * user have their control back regardless of whether it did.
   */
  it('bounds the request so the control always re-arms', () => {
    expect(source).toMatch(/AbortSignal\.timeout\(/);
  });

  /**
   * And the tap has to register in the frame it happened in. Without this the
   * only feedback for the whole round trip is two greyed-out words, which is the
   * "nothing happened" the bug report describes.
   */
  it('marks the tapped locale active before the round trip returns', () => {
    expect(source).toMatch(/optimistic|chosen/i);
  });
});

describe('a locale switch reaches the generated prose, not only the chrome', () => {
  /**
   * **THE DEFECT THE HARNESS ACTUALLY CAUGHT.** Measured with
   * `_localehang.html` against the real page: after tapping EN the chrome was
   * English and the two model-written lines were still Indonesian --
   *
   *   /          "Dalam tiga belas hari terakhir, Strength dan The Star muncul…"
   *   /thessaly  "Kamu sudah punya jawaban untuk yang dipertanyakan…"
   *
   * -- because `router.refresh()` KEEPS CLIENT STATE by design and neither
   * effect had `locale` in its dependency array, so neither could ever refetch.
   * `frequency_verdicts` and `daily_summaries` are both keyed on locale, so the
   * English row does not exist until something asks for it.
   */
  for (const [file, extra] of [
    ['components/FrequencyLine.tsx', 'the frequency verdict'],
    ['components/DaySummary.tsx', 'the day summary'],
  ] as const) {
    it(`refetches ${extra} when the locale changes`, () => {
      const source = read(file);
      expect(source, `${file} must read the locale`).toMatch(/useLocale/);
      const withLocale = effectDeps(source).filter((d) => /\blocale\b/.test(d));
      expect({ [file]: withLocale.length }, 'no effect depends on locale').not.toEqual({
        [file]: 0,
      });
    });

    /**
     * AND IT KEEPS THE OLD LINE UP WHILE THE NEW ONE GENERATES (Miftah's call).
     *
     * A cold verdict is a real model call -- measured at 1.8s for the frequency
     * line and 1.2s for the summary -- so clearing on switch would blank a
     * paragraph for two seconds. Both components only ever assign on success,
     * which is what makes "keep the old line visible" fall out for free. A reset
     * to `null`/`''` anywhere would take it away again.
     */
    it(`does not blank ${extra} while the new language generates`, () => {
      expect(code(file)).not.toMatch(/set(Line|Text)\(\s*(null|''|""|``)\s*\)/);
    });
  }
});
