/**
 * **M8's seam, where it reaches a screen.** 2026-07-30.
 *
 * ── THE BUG THIS FILE EXISTS FOR ────────────────────────────────────────────
 *
 * `readings.latency_ms` is TIME TO FIRST TOKEN -- the wait a querent watched. `llm_calls.total_ms`
 * is the whole call. One word, two meanings, one schema (roadmap seam 2), and A3 went to
 * considerable trouble over it: two functions, neither called `latency`, each with the warning in
 * its header, plus `noDualAxis.test.ts` forbidding one chart from plotting both.
 *
 * **And the overview still shipped a TTFT number under a label that read "Total waktu panggilan,
 * bukan waktu ke token pertama."** `ServiceShare`'s table borrowed `OVERVIEW.kpi.p95` -- the
 * total-duration tile's copy -- for `rollup.ttft`'s p95. Every existing test passed, because **a
 * label and the provenance of the number beneath it are not comparable by grep**, and no unit test
 * renders a page and asks whether its words are true.
 *
 * So this file fences the two places the seam can be re-merged: the COPY (two labels that must stay
 * distinct and self-describing) and the CALL SITES (which key may sit next to which query's rows).
 * It cannot prove a label is true. It can prove the specific collapse that already happened cannot
 * happen twice silently.
 *
 * Verified RED by reintroducing the mislabel before committing: assertion 5 fails with
 * `OVERVIEW.kpi.p95 used 2 times`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OVERVIEW } from './copy';

const PAGE = 'src/app/admin/page.tsx';

/** Comments stripped: this file's own header names `kpi.p95` and would match every grep. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * The body of a top-level `function <name>(` in `page.tsx`.
 *
 * **The terminator is `\n}\n`, not `\n}`, and the first version got this wrong.** A multi-line
 * destructured signature --
 *
 *     function Kpis({
 *       rollup,
 *     }: {
 *
 * -- puts a `}` at column 0 before the body even starts, so `indexOf('\n}')` returned a slice
 * containing the parameter list and nothing else. Every `expect(...).toMatch` against it then
 * failed, and every `not.toMatch` PASSED VACUOUSLY: a fence that greps an empty string always
 * agrees with you. Caught by running the suite against a deliberately re-broken page.
 */
function fn(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `${name} not found in ${PAGE}`).toBeGreaterThan(-1);
  const end = src.indexOf('\n}\n', start);
  const body = src.slice(start, end === -1 ? undefined : end);
  // A body shorter than its own signature means the terminator matched too early again.
  expect(body.length, `${name}: extracted body is implausibly short`).toBeGreaterThan(120);
  return body;
}

describe('the two duration metrics keep two labels', () => {
  it('does not let one string serve both', () => {
    // The collapse that shipped: one key, two provenances. If a future edit deletes the TTFT
    // label and points both tiles at `kpi.p95`, this is what says so.
    expect(OVERVIEW.kpi.ttftP95).not.toBe(OVERVIEW.kpi.p95);
  });

  it('makes the TTFT copy name the quantity AND its direction', () => {
    /*
     * TTFT is the one number on this dashboard where SMALLER IS BETTER, which is the opposite
     * of every other figure on the page. An operator reading a bare `5,1 s` beside `238 / 280`
     * has no way to know which way is good, so the note carries it in words.
     */
    expect(OVERVIEW.kpi.ttftNote).toMatch(/token pertama/);
    expect(OVERVIEW.kpi.ttftNote).toMatch(/[Mm]akin kecil/);
  });

  it('keeps the total-duration note denying that it is TTFT', () => {
    // This sentence predates the TTFT tile and was a claim about a quantity the page did not
    // render. It is only fully true while the sibling tile exists -- see the tile's comment.
    expect(OVERVIEW.kpi.p95Note).toMatch(/bukan waktu ke token pertama/);
  });

  it('names the source column on the card, so the provenance survives a copy edit', () => {
    expect(OVERVIEW.ttftSubtitle).toMatch(/readings\.latency_ms/);
  });

  it('keeps the card two tile labels that differ ONLY in the percentile', () => {
    /*
     * The card's pair must read as a pair. Reusing `kpi.ttftP95` for the second tile rendered
     * `p50 TTFT` beside `p95 TTFT bacaan` -- an asymmetry that is obvious in a screenshot and
     * invisible to every other test here, since both strings are individually correct.
     */
    expect(OVERVIEW.ttftP50.replace(/^p50/, '')).toBe(OVERVIEW.ttftP95.replace(/^p95/, ''));
    expect(OVERVIEW.ttftP95).not.toBe(OVERVIEW.kpi.ttftP95);
  });
});

describe('the call sites cannot re-merge the seam', () => {
  it('uses the total-duration label exactly once on the overview', () => {
    /*
     * **THIS IS THE ASSERTION THAT WOULD HAVE CAUGHT THE SHIPPED BUG.** `OVERVIEW.kpi.p95`
     * belongs to the one tile fed by `rollup.byOp`. The mislabelled version referenced it twice:
     * once there, once as `ServiceShare`'s third column header over `rollup.ttft`'s p95.
     */
    const uses = code(PAGE).match(/OVERVIEW\.kpi\.p95\b/g) ?? [];
    expect(uses, `OVERVIEW.kpi.p95 used ${uses.length} times`).toHaveLength(1);
  });

  it('keeps ServiceShare counting readings and rendering no duration', () => {
    // One owner per number. `TtftCard` owns per-service TTFT with both percentiles; two cards
    // printing one figure under two labels is how a dashboard loses its reader.
    const body = fn(code(PAGE), 'ServiceShare');
    expect(body).not.toMatch(/p50Ms|p95Ms/);
  });

  it('feeds the TTFT tile from the rollup fleet row and never from a fold of the services', () => {
    /*
     * A fleet p95 is not the mean of three service p95s. `ttftOverall` returns the row Postgres
     * computed over the whole population; anything built out of `ttftServices` would be a
     * single service's number, or an average of percentiles, under a fleet label.
     */
    const body = fn(code(PAGE), 'Kpis');
    expect(body).toMatch(/ttftOverall\(rollup\.ttft\)/);
    expect(body).toMatch(/OVERVIEW\.kpi\.ttftP95/);
    expect(body).not.toMatch(/ttftServices/);
  });

  it('mounts the TTFT card on the overview', () => {
    // A card nobody renders is the failure mode of a refused ask granted quietly in reverse:
    // the folds, the copy and the query all exist and the operator sees none of it.
    expect(code(PAGE)).toMatch(/<TtftCard rollup=\{rollup\} \/>/);
  });
});
