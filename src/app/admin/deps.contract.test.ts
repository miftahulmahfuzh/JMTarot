/**
 * A4's blocking precondition check. Task 1, and it is the first file in the
 * workstream on purpose.
 *
 * ── WHY THIS IS A TEST AND NOT A COMMENT ─────────────────────────────────────
 *
 * A4 depends on A1's shell and A3's query shapes. Roadmap §0.0 step 2: *"A4 and A5
 * against an unmerged A3 means writing against an imagined signature. Ask rather
 * than guess -- a guessed signature is the seam defect §11 exists to prevent."*
 *
 * The failure mode this replaces is a `Cannot find module '@/lib/db/queries/admin/
 * metrics'` stack in the middle of a page render, which names a path and not a
 * workstream -- so the reader's first move is to create the file, which is how two
 * workstreams end up owning one module. **Every assertion below fails with the name
 * of the workstream that owes the surface.**
 *
 * ── IT ASSERTS NAMES, NOT SIGNATURES, AND THE DIFFERENCE IS DELIBERATE ───────
 *
 * A3 shipped a metric catalogue whose function names are NOT the ones A4's plan §10
 * asked for -- there is no `dailySeries`, no `groupedTotals`, no `windowCalls`, no
 * `heatCells`, no `topUsers`. That is not a defect in either workstream: A3's plan
 * named its own eleven tasks and reconciliation §8 bound it to R15/R19/R22/R24/R25/
 * R26/R29, none of which mention A4's requested names. **A4 adapts in
 * `src/app/admin/metrics.ts`, which its own plan calls "the ONE file an A3 shape
 * change touches".** So this test pins the names A4 actually imports, measured
 * against the merged tree, rather than the names its plan predicted.
 *
 * The one requirement A4 restated and A3 met differently, recorded because the
 * difference reaches the screen:
 *
 *   - `heatCells` does not exist. §1.7's Jakarta-pinned weekday x hour heatmap has
 *     no query behind it, and A4 does not add one -- `src/lib/db/queries/admin/**`
 *     is A3's. The card is built against `readingsByLocalDate`'s weekday half only
 *     where it can be honest; see `src/app/admin/tokens/page.tsx`.
 *   - `forecast()` returns THREE variants (`insufficient | flat | trend`), where
 *     the plan's §10 predicted two. `Trajectory` handles all three, and `flat` is
 *     the one a two-variant renderer would have crashed on.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Fail with the workstream, never with a module path. */
function owes(ws: string, what: string): string {
  return `${what} is missing -- it is ${ws}'s and ${ws} has not landed. Do not create it here.`;
}

function source(file: string): string {
  expect(existsSync(file), owes('A1 or A3', file)).toBe(true);
  return readFileSync(file, 'utf8');
}

describe('A1 owes A4 the gate and the shell', () => {
  it('exports requireAdminPage and requireAdmin from @/lib/admin/identity', () => {
    const src = source('src/lib/admin/identity.ts');
    expect(src, owes('A1', 'requireAdminPage')).toMatch(/export (async )?function requireAdminPage/);
    expect(src, owes('A1', 'requireAdmin')).toMatch(/export (async )?function requireAdmin\b/);
    expect(src, owes('A1', 'adminNotFound')).toMatch(/export function adminNotFound/);
  });

  it('ships the /admin route group with a layout that owns the only <main>', () => {
    const src = source('src/app/admin/layout.tsx');
    expect(src, owes('A1', 'the <main> in the admin layout')).toContain('<main');
    expect(src, owes('A1', 'the noindex metadata')).toMatch(/robots\s*:/);
  });

  it('ships the closed page-template list R32 requires', () => {
    const src = source('src/app/admin/pages.ts');
    // A4's two pages must already be named here, or `AdminPageViewed` cannot be
    // mounted with a typed prop and somebody reaches for `usePathname()`.
    expect(src, owes('A1', "'/admin' in ADMIN_PAGES")).toContain("path: '/admin'");
    expect(src, owes('A1', "'/admin/tokens' in ADMIN_PAGES")).toContain("path: '/admin/tokens'");
  });

  it('declares admin.page_viewed in the taxonomy', () => {
    const src = source('src/lib/analytics/events.ts');
    expect(src, owes('A1', 'admin.page_viewed')).toContain("'admin.page_viewed'");
  });
});

describe('A3 owes A4 the read layer', () => {
  it('exports the metric catalogue A4 actually calls', () => {
    const src = source('src/lib/db/queries/admin/metrics.ts');
    for (const fn of [
      'callsByUtcDay',
      'callsByLocalDate',
      'tokensByBucketAndModel',
      'callsByOp',
      'peakWindow5h',
      'readingsByLocalDate',
      'activeUsers',
      'modelsSeen',
    ]) {
      expect(src, owes('A3', `metrics.${fn}`)).toMatch(new RegExp(`export async function ${fn}\\b`));
    }
  });

  it('exports the composite rollup and its asserted round-trip count', () => {
    const src = source('src/lib/db/queries/admin/rollup.ts');
    expect(src, owes('A3', 'fleetRollup')).toMatch(/export async function fleetRollup\b/);
    expect(src, owes('A3', 'FLEET_ROLLUP_QUERIES')).toContain('FLEET_ROLLUP_QUERIES');
  });

  it('exports the read-only, time-bounded transaction wrapper', () => {
    const src = source('src/lib/db/queries/admin/timeout.ts');
    expect(src, owes('A3', 'withAdminRead')).toMatch(/export async function withAdminRead\b/);
    // I-24's client bound and §4.2's pairing rule both read these two numbers.
    expect(src, owes('A3', 'ADMIN_MAX_DURATION_SECONDS')).toContain('ADMIN_MAX_DURATION_SECONDS');
    expect(src, owes('A3', 'ADMIN_CLIENT_ABORT_MS')).toContain('ADMIN_CLIENT_ABORT_MS');
  });

  it('exports the per-user league A4 renders as a table (§1.11)', () => {
    const src = source('src/lib/db/queries/admin/users.ts');
    expect(src, owes('A3', 'userCostLeague')).toMatch(/export async function userCostLeague\b/);
  });

  it('exports the PURE folds outside /queries/ (R22)', () => {
    const src = source('src/lib/analytics/rollup.ts');
    for (const fn of [
      'slotFor',
      'foldOps',
      'priceRollup',
      'periodDelta',
      'meanCallsPerDay',
      'burstiness',
      'dailyEquivalentCeiling',
    ]) {
      expect(src, owes('A3', `rollup.${fn}`)).toMatch(new RegExp(`export function ${fn}\\b`));
    }
    expect(src, owes('A3', 'OP_ORDER')).toContain('export const OP_ORDER');
  });

  it('exports the forecast with its THREE variants and a banded projection', () => {
    const src = source('src/lib/analytics/forecast.ts');
    expect(src, owes('A3', 'forecast()')).toMatch(/export function forecast\b/);
    expect(src, owes('A3', 'crossing()')).toMatch(/export function crossing\b/);
    expect(src, owes('A3', 'horizon()')).toMatch(/export function horizon\b/);
    expect(src, owes('A3', 'MIN_FORECAST_DAYS')).toContain('MIN_FORECAST_DAYS');
    // The variant A4's plan did not predict. A renderer written from §10's
    // two-variant union would fall through to `never` on a genuinely flat series,
    // which is the commonest series a new deployment has.
    expect(src, owes('A3', "the 'flat' forecast variant")).toContain("kind: 'flat'");
  });

  it('exports the range guard and the retention-matched range cap', () => {
    const src = source('src/lib/analytics/series.ts');
    expect(src, owes('A3', 'isUsableRange')).toMatch(/export function isUsableRange\b/);
    expect(src, owes('A3', 'enumerateDays')).toMatch(/export function enumerateDays\b/);
    // R19: 400 equals LLM_CALLS_RETENTION_DAYS so the dashboard cannot offer a
    // range whose data was already swept.
    expect(src, owes('A3', 'MAX_RANGE_DAYS')).toContain('MAX_RANGE_DAYS = 400');
  });
});

describe('A2 owes A4 nothing at runtime, and that is asserted too', () => {
  it('keeps the price table pure and the notional model a human decision', () => {
    // §10: "From A2: nothing at runtime." A4 never sees a model string in an
    // arithmetic context -- `notionalUsd` is A3's to call. The assertion exists so
    // that if `NOTIONAL_MODEL` is ever filled in, nobody expects A4 to change.
    const src = source('src/lib/llm/prices.ts');
    expect(src).toContain('export const NOTIONAL_MODEL');
    expect(src).toMatch(/export function notionalUsd\b/);
  });
});
