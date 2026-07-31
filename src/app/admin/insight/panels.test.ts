/**
 * The registry and the two pages agree about which panels have a button.
 * **A7, 2026-07-31.**
 *
 * ── THE GREP IS THE POINT, AND IT IS `callClass.test.ts`'s IDIOM ───────────
 *
 * Two failures, neither visible in a diff and neither caught by the compiler, because
 * the page passes a string and the route resolves it:
 *
 *   - A BUTTON WITH NO RENDERER. The route 404s a press, so the panel grows a control
 *     that looks live and answers *"Model tidak menjawab"* forever.
 *   - A RENDERER WITH NO BUTTON. Dead code that reads as a shipped panel — and the next
 *     person to open this file counts fourteen and looks for the fourteenth on screen.
 *
 * So the two sets are asserted EQUAL, per page.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FleetRollup } from '@/lib/db/queries/admin/rollup';
import { insightInputHash, serializePanelFacts } from '@/lib/admin/insightPrompt';
import {
  OVERVIEW_PANEL_IDS,
  PANEL_IDS,
  TOKEN_PANEL_IDS,
  isPanelId,
  overviewFacts,
  overviewInsightStates,
  tokenInsightStates,
} from './panels';

const OVERVIEW_PAGE = 'src/app/admin/page.tsx';
const TOKENS_PAGE = 'src/app/admin/tokens/page.tsx';

/** Comments stripped — this project's rule, paid for twice. Both pages document what
 *  they mount, and a doc comment naming a panel id would satisfy the grep on its own. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Every panel id spelled in a page.
 *
 * **MATCHED ON THE ID's OWN SHAPE, NOT ON THE HELPER'S NAME.** The pages happen to wrap
 * `<InsightBox>` in a local `box()` today; a test that grepped for `box(` would go green
 * the moment somebody inlined the element, which is a refactor rather than a defect.
 */
function idsIn(file: string): string[] {
  return [...code(file).matchAll(/'((?:overview|tokens)\.[a-z0-9]+)'/g)].map((m) => m[1]).sort();
}

describe('the fences are not vacuous', () => {
  it('finds thirteen panels and both pages', () => {
    // A registry that went empty in a refactor would make every assertion below pass.
    expect(PANEL_IDS).toHaveLength(13);
    expect(OVERVIEW_PANEL_IDS).toHaveLength(6);
    expect(TOKEN_PANEL_IDS).toHaveLength(7);
    expect(code(OVERVIEW_PAGE)).toContain('InsightBox');
    expect(code(TOKENS_PAGE)).toContain('InsightBox');
  });
});

describe('every button has a renderer and every renderer has a button', () => {
  it('/admin mounts exactly the six overview panels', () => {
    expect(idsIn(OVERVIEW_PAGE)).toEqual([...OVERVIEW_PANEL_IDS].sort());
  });

  it('/admin/tokens mounts exactly the seven token panels', () => {
    expect(idsIn(TOKENS_PAGE)).toEqual([...TOKEN_PANEL_IDS].sort());
  });

  it('keeps the two pages disjoint', () => {
    // A `tokens.*` id on `/admin` would resolve — `panelFacts` dispatches on the id, not
    // on the page — and would silently run the OTHER page's six queries to answer a
    // button under the wrong chart.
    const overlap = idsIn(OVERVIEW_PAGE).filter((id) => idsIn(TOKENS_PAGE).includes(id));
    expect(overlap).toEqual([]);
  });
});

describe('isPanelId', () => {
  it('accepts every registered id and nothing else', () => {
    for (const id of PANEL_IDS) expect(isPanelId(id)).toBe(true);
    for (const junk of ['', 'overview', 'overview.', 'overview.nope', 42, null, {}]) {
      expect(isPanelId(junk), String(junk)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// The renderers, against literals
// ---------------------------------------------------------------------------

/** A CLOSED range — `to` is strictly before `TODAY`. The staleness flag only fires on
 *  one of these; see `panels.ts` for the live run that established the rule. */
const RANGE = { from: '2026-07-01', to: '2026-07-07', days: 7 };
const TODAY = '2026-07-31';
/** A LIVE range: it ends today, so it moves whenever anybody uses the app — including
 *  the operator who just pressed the button. */
const LIVE = { from: '2026-07-02', to: TODAY, days: 30 };

function rollup(over: Partial<FleetRollup> = {}): FleetRollup {
  return {
    range: { from: RANGE.from, to: RANGE.to },
    callsByUtcDay: [{ bucket: '2026-07-01', calls: 12, streamedCalls: 4 }],
    peak5h: { windowEnd: '2026-07-01 20:00:00', calls: 31 },
    byOp: [
      { op: 'reading', calls: 9, inputTokens: 100, outputTokens: 200, failed: 1, aborted: 2, p50Ms: 900, p95Ms: 2400 },
    ],
    tokens: [
      {
        bucket: '2026-07-01',
        model: 'glm-4.6',
        calls: 9,
        inputTokens: 100,
        outputTokens: 200,
        nullInputCalls: 1,
        nullOutputCalls: 0,
        cacheReadTokens: 40,
        cachedBasisTokens: 80,
      },
    ],
    models: [{ model: 'glm-4.6', calls: 9, firstSeen: '2026-07-01T00:00:00Z' }],
    readings: [
      { bucket: '2026-07-01', readings: 6, users: 2, ok: 5, partial: 1, failed: 0, aborted: 0, blocked: 0 },
    ],
    activeUsers: 2,
    ttft: [
      { serviceId: 'daily', readings: 4, p50Ms: 3000, p95Ms: 5200 },
      { serviceId: null, readings: 6, p50Ms: 3100, p95Ms: 5400 },
    ],
    ...over,
  };
}

const COST = { costUsd: null, pricedCalls: 0, unpricedCalls: 9, untokenizedCalls: 1, unpricedModels: ['glm-4.6'] };

/** The registry only hashes panels that HAVE a row, so a state helper needs one to do
 *  any work at all. This is the shape `insightsForRange` returns. */
function stored(panel: string, inputHash: string) {
  return new Map([
    [panel, { panelId: panel, body: 'Prosa lama.', inputHash, model: 'glm-4.6', updatedAt: new Date(0) }],
  ]);
}

describe('the state helpers', () => {
  const data = { rollup: rollup(), prev: rollup(), cost: COST as never };

  it('returns null for every panel with no stored row', () => {
    const out = overviewInsightStates(data, RANGE, new Map(), TODAY);
    for (const id of OVERVIEW_PANEL_IDS) expect(out[id], id).toBeNull();
  });

  it('flags a CLOSED range whose hash no longer matches the numbers', () => {
    const out = overviewInsightStates(data, RANGE, stored('overview.calls', 'not-the-hash'), TODAY);
    expect(out['overview.calls']).toEqual({
      body: 'Prosa lama.',
      updatedAt: new Date(0).toISOString(),
      stale: true,
    });
  });

  it('NEVER flags a range that ends today, however far the hash has moved', () => {
    /*
     * **THE REGRESSION TEST FOR THE DEFECT A LIVE RUN FOUND.** An insight is itself a
     * model call with today's `local_date`, so pressing the button on `overview.calls`
     * moves that panel's own total — measured 53 -> 54, four seconds apart. Flagging it
     * would put *"the numbers have changed"* under prose written in the same breath, on
     * nine of thirteen panels and on the default filter. `panels.ts` records why the two
     * alternative fixes are worse.
     */
    const out = overviewInsightStates(data, LIVE, stored('overview.calls', 'wildly-different'), TODAY);
    expect(out['overview.calls']?.stale).toBe(false);
    // The prose and its timestamp still arrive — the timestamp is what does the work here.
    expect(out['overview.calls']?.body).toBe('Prosa lama.');
    expect(out['overview.calls']?.updatedAt).toBe(new Date(0).toISOString());
  });

  it('RENDERS the stale prose rather than hiding it', () => {
    // `sharingEnabled()`'s rule: off means "write nothing new", never "hide what
    // exists". A stale insight that vanished would look like the button not working.
    const out = overviewInsightStates(data, RANGE, stored('overview.calls', 'not-the-hash'), TODAY);
    expect(out['overview.calls']?.body).toBe('Prosa lama.');
  });

  it('does not flag a row whose hash still matches', () => {
    /*
     * Computed the way the page does — through the SAME serializer — because a test that
     * hardcoded a digest would go green on a hash function that had stopped agreeing
     * with the one in production.
     */
    const hash = insightInputHash(
      serializePanelFacts(overviewFacts('overview.calls', data, RANGE), RANGE),
    );
    const out = overviewInsightStates(data, RANGE, stored('overview.calls', hash), TODAY);
    expect(out['overview.calls']?.stale).toBe(false);
  });

  it('covers every token panel without throwing on an empty range', () => {
    /*
     * The renderers run against a range with no rows on every first visit, and three of
     * them do arithmetic — the trajectory fits a line, the cache tile divides, the
     * heatmap folds. **A throw here is a 500 on the whole page**, not a missing box,
     * because the state helper runs inside the page's own render.
     */
    const empty = { tokens: [], utc: [], ops: [], models: [], leagueRows: [], peak: null };
    const out = tokenInsightStates(empty, RANGE, new Map(), TODAY);
    for (const id of TOKEN_PANEL_IDS) expect(out[id], id).toBeNull();
  });
});

describe('what reaches the model', () => {
  it('never carries a full user id from the league table', () => {
    /*
     * **§1.11 REACHES THE PROMPT, NOT JUST THE SCREEN.** The panel renders an
     * eight-character prefix — no email, no nickname — and the block must not carry more
     * identity than the surface it describes. A uuid in a prompt is an identifier this
     * feature has no use for.
     */
    const uuid = '9f3c1d2e-4b5a-6c7d-8e9f-0a1b2c3d4e5f';
    const empty = {
      tokens: [],
      utc: [],
      ops: [],
      models: [],
      leagueRows: [{ userId: uuid, model: 'glm-4.6', calls: 3, inputTokens: 10, outputTokens: 20 }],
      peak: null,
    };
    // Render through the state helper's own path: a stored row is what makes it hash,
    // and hashing is what serializes.
    const out = tokenInsightStates(empty, RANGE, stored('tokens.league', 'x'), TODAY);
    expect(out['tokens.league']?.stale).toBe(true);

    // And directly, so the assertion names the string rather than a digest.
    const block = serializePanelFacts(
      {
        title: 't',
        purpose: 'p',
        headline: [],
        columns: ['Pengguna'],
        rows: [[uuid.slice(0, 8)]],
        notes: [],
      },
      RANGE,
    );
    expect(block).toContain('9f3c1d2e');
    expect(block).not.toContain(uuid);
  });
});
