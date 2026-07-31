/**
 * `POST /api/admin/insight` — generate one panel's insight and store it.
 * **A7, 2026-07-31.**
 *
 * `docs/plans/2026-07-31-admin-panel-insights-design.md`.
 *
 * ── THE BODY CARRIES NO NUMBERS, AND THAT IS THE POINT ─────────────────────
 *
 * `{ panel, from, to, force }`. The panel's figures are re-derived here from the ledger,
 * by the same registry the page renders from, so **nothing a browser posted reaches a
 * prompt.** W3's completion route makes the same move — *the client is trusted to say
 * what it answered, never that it finished* — and a model prompt is the last place to
 * relax it. The cost is one extra composite read per button press, for one operator.
 *
 * ── THE READ IS READ-ONLY AND THE WRITE CANNOT BE ──────────────────────────
 *
 * `withAdminRead` sets `transaction_read_only = on`, so `putInsight` inside it fails at
 * the database with `25006` — the wrapper working. The block ends before the write.
 * **Do not "tidy" the two into one transaction.**
 *
 * ── A CACHE HIT IS NOT A MODEL CALL ────────────────────────────────────────
 *
 * If the stored row's `input_hash` already equals the current one and the caller did not
 * ask for a refresh, `generateInsight` answers `unchanged` and reaches no model at all.
 * That is what makes a double-tap on a fresh panel free. `force` is what the button
 * sends once there IS an insight, because by then its word has changed to *Perbarui
 * insight* and pressing it is a deliberate ask.
 *
 * ── §4.2: `runtime`, `maxDuration`, AND THE CLIENT'S OWN BOUND ─────────────
 *
 * **Every admin request is a cold one** — one admin, no warm instance — and this one
 * additionally waits on a model, which is why `maxDuration` is 60 here against the other
 * admin routes' 30. `InsightBox` carries `AbortSignal.timeout(45s)` and a stated failure
 * state, because a bigger `maxDuration` unpaired with a client bound has only made the
 * hang longer. The three numbers keep A3's ordering, with the model call inserted:
 *
 *     statement_timeout 10s  <  client abort 45s  <  maxDuration 60s
 *
 * ── EVERY RESPONSE COMES FROM `./shared` ───────────────────────────────────
 *
 * This file imports no `next/server` and writes no `NextResponse.json(`, which
 * `page.contract.test.ts` asserts over the whole `/api/admin/**` tree: the `no-store`
 * header is attached in one place so a handler cannot forget it.
 */
import { generateInsight } from '@/lib/admin/insight';
import { isPanelId, panelFacts } from '@/app/admin/insight/panels';
import {
  insightsForRange,
  putInsight,
  type StoredInsight,
} from '@/lib/db/queries/admin/insights';
import { withAdminRead } from '@/lib/db/queries/admin/timeout';
import { db } from '@/lib/db/client';
import { dayCount, isUsableRange } from '@/lib/analytics/series';
import { adminNotFound, ok, refuseMethod, requireAdmin, unavailable } from './shared';

export const runtime = 'nodejs';
/** A LITERAL, NOT AN IMPORTED CONSTANT — Next reads these from the module's static
 *  shape at build time, and both fences match the SOURCE. 60 rather than
 *  `ADMIN_MAX_DURATION_SECONDS`' 30 because this one waits on a model; see the header. */
export const maxDuration = 60;

export const GET = refuseMethod;
export const PUT = refuseMethod;
export const PATCH = refuseMethod;
export const DELETE = refuseMethod;

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return adminNotFound();
  }

  /*
   * **A MALFORMED BODY IS THE REFUSAL 404, NOT A 400.** Every answer this tree gives to
   * something it will not serve has one shape (A5-1), so *"does this route exist"* stays
   * unanswerable from outside — and the only caller is our own component, for which a
   * 400 would be no more diagnosable than a 404.
   */
  const parsed = parseBody(raw);
  if (!parsed) return adminNotFound();

  const { panel, range, force } = parsed;

  let facts: Awaited<ReturnType<typeof panelFacts>>;
  let cached: StoredInsight | null = null;
  try {
    const loaded = await withAdminRead(db, async (tx) => {
      const [f, stored] = await Promise.all([
        panelFacts(tx, panel, range),
        insightsForRange(tx, range, [panel]),
      ]);
      return { f, row: stored.get(panel) ?? null };
    });
    facts = loaded.f;
    cached = loaded.row;
  } catch {
    /*
     * **NOTHING FROM THE DRIVER IS LOGGED.** A postgres error quotes the failing
     * statement and its bound parameters; this path binds two dates and a panel id
     * today, and the rule is absolute rather than case-by-case because the next query
     * a renderer acquires may not be.
     */
    return unavailable();
  }

  /*
   * The hash is over the facts, so the cache decision cannot be made before they are
   * built — but it IS made before the model call, inside `generateInsight`, which is the
   * only module that serializes.
   */
  const result = await generateInsight(
    facts,
    { from: range.from, to: range.to, days: dayCount(range.from, range.to) },
    { cachedHash: cached?.inputHash ?? null, force },
  );

  /*
   * **A FAILURE IS A 200 WITH A NAMED REASON, NOT A 5xx.** The box renders a sentence per
   * reason and keeps whatever prose it already had; a 503 here would be indistinguishable
   * from the database being down, which is the one case that gets `unavailable()` above.
   * `ceiling` in particular is a correct, expected outcome — the fleet-wide limiter
   * shedding an operator convenience before a querent's reading, exactly as designed —
   * and answering it as a server error would put it in the wrong column of every log.
   */
  if (result.kind === 'failed') return ok({ status: 'error', reason: result.reason });

  if (result.kind === 'unchanged') {
    /*
     * `cached` is non-null here by construction — that arm only fires when this handler
     * handed a hash over, and the hash comes off the row. **The fallback is a stated
     * failure rather than a `!`**, because an assertion here becomes a 500 under a button
     * on the day the construction changes, and this route's whole contract is that a
     * press always gets an answer the box can render.
     */
    if (!cached) return ok({ status: 'error', reason: 'failed' });
    return ok({
      status: 'unchanged',
      body: cached.body,
      inputHash: result.inputHash,
      updatedAt: cached.updatedAt.toISOString(),
    });
  }

  const now = new Date();
  const answer = {
    status: 'ok',
    body: result.body,
    inputHash: result.inputHash,
    updatedAt: now.toISOString(),
  } as const;

  try {
    await putInsight(db, {
      panelId: panel,
      range,
      body: result.body,
      inputHash: result.inputHash,
      model: result.model,
    });
  } catch {
    /*
     * **THE PROSE IS RETURNED ANYWAY.** The model call already happened and already cost
     * quota; discarding it because the cache write failed would charge the operator twice
     * for one press. What is lost is the row, so the next page load shows the empty state
     * again — a cache write that fails is a cache MISS, which is V2's rule for the same
     * shape one directory over.
     */
    return ok(answer);
  }

  return ok(answer);
}

/**
 * The body, narrowed. **`isUsableRange`, never `parseLocalDate`** — that helper's ±1-day
 * bound answers *"is this plausibly the querent's today"* and would refuse every
 * interesting range, which is the trap already written down on `/api/history` and again
 * in `queries/admin/metrics.ts`.
 */
function parseBody(
  raw: unknown,
): {
  panel: Parameters<typeof panelFacts>[1];
  range: { from: string; to: string };
  force: boolean;
} | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { panel, from, to, force } = raw as Record<string, unknown>;
  if (!isPanelId(panel)) return null;
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  if (!isUsableRange(from, to)) return null;
  return { panel, range: { from, to }, force: force === true };
}
