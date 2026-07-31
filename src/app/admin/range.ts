/**
 * The date range both admin pages read, parsed from `searchParams`. **PURE.**
 *
 * ── THE DEFAULT IS COMPUTED FROM THE REQUEST, NEVER FROM `new Date()` IN A
 *    RENDER (I-20) ─────────────────────────────────────────────────────────
 *
 * `todayKey()`'s rule, which `HistoryBrowser` already pays for: **`new Date()` during
 * render differs between the server render and hydration**, and CLAUDE.md capitalises
 * *"`todayKey()` IS NEVER CALLED DURING RENDER"*. So `today` is a PARAMETER here, and the
 * page passes one value it obtained once. That also makes every boundary in this file
 * testable without freezing a clock.
 *
 * These pages are server-rendered with no client component reading a date at all, so the
 * hydration half of that trap cannot fire -- but the parameter costs nothing and the rule
 * is the one that got broken twice.
 *
 * ── A RANGE CHANGE IS A NAVIGATION, NOT A FETCH (I-20, R21) ──────────────────
 *
 * The filter is a `<form method="get">` -- **two of them**, and the split is load-bearing:
 * a preset submit sends every field in its own form, so while the date inputs shared it every
 * preset also sent the `from`/`to` pair on screen, which WINS below. See `RangeFilter.tsx`.
 * A preset is a link-shaped submit and the new range arrives as a fresh server render. That
 * deletes `/api/admin/metrics/[metric]`
 * (R21 struck it), deletes the client fetch, deletes the "hold the previous render at
 * reduced opacity" requirement -- there is no refetch -- and is why nothing on either page
 * needs hydration.
 *
 * ── IT CLAMPS TO `MAX_RANGE_DAYS`, AND THAT NUMBER IS RETENTION ──────────────
 *
 * 400 days is `LLM_CALLS_RETENTION_DAYS` and `HISTORY_DAY_LIMIT` too (R19), so **the
 * dashboard can never offer a range whose data was already swept** -- which would produce
 * a chart that looks broken and reads as a bug in the chart. A range that fails
 * `isUsableRange` is REPLACED by the default rather than refused: an operator who hand-edits
 * a URL should get the dashboard, not a 400.
 */
import { MAX_RANGE_DAYS, dayCount, isUsableRange } from '@/lib/analytics/series';

/** An inclusive `'YYYY-MM-DD'` range, the shape every A3 query takes. */
export type AdminRange = { from: string; to: string };

/**
 * The presets, in the order they render. **Presets before a custom range** (I-20): the
 * operator's question is almost always "the last week" or "the last month", and a date
 * picker as the primary control makes the common case the expensive one.
 *
 * 14 days is deliberately in the list because `MIN_FORECAST_DAYS` is 14: it is the shortest
 * range on which the trajectory chart renders anything at all, so an operator who picks it
 * sees a forecast rather than an empty state, and one who picks 7 learns why.
 */
export const RANGE_PRESETS = [7, 14, 30, 90] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** The default window. 30 days: long enough for `forecast()` to fit (n=30 against a
 *  minimum of 14) and short enough that a day is a readable column at 320px. */
export const DEFAULT_DAYS = 30;

/** The search param both pages use. **One name, so the two cannot disagree about the
 *  range when an operator navigates between them.** */
export const RANGE_PARAM = { days: 'd', from: 'from', to: 'to' } as const;

/**
 * `'YYYY-MM-DD'`, `n` days before `day`. Explicit UTC arithmetic, for `series.ts`'s stated
 * reason: the date-only `Date` form is implementation-defined and has been read as local
 * time, while `T00:00:00Z` plus 86_400_000 per step is exact.
 */
function shift(day: string, byDays: number): string {
  const t = new Date(`${day}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t + byDays * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The range as a query string, for a LINK that must land on the window the operator is
 * already looking at.
 *
 * ── IT EMITS `from`/`to` AND NEVER `d`, AND THAT IS THE WHOLE POINT ──────────
 *
 * `d=30` is RELATIVE to the receiving page's own `todayUtc()`, so a drill-down carrying it
 * would resolve against a *different* today whenever the two renders straddle UTC midnight --
 * and the destination would show a window one day off the one the link was clicked from, with
 * both pages looking perfectly healthy. An explicit pair is absolute, and `parseRange` gives it
 * precedence, so the two pages cannot disagree about what they are counting.
 *
 * It also does not lose a CUSTOM range: `preset` is `null` for anything not exactly 7/14/30/90,
 * and `d` cannot express those at all. **The destination's pressed state still lights up**,
 * because `presetFor(dayCount(from, to))` recovers the preset from the pair.
 *
 * No leading `?`: the caller owns the separator, because it may already be appending to a path
 * that carries a cursor.
 */
export function rangeQuery(range: AdminRange): string {
  return new URLSearchParams({
    [RANGE_PARAM.from]: range.from,
    [RANGE_PARAM.to]: range.to,
  }).toString();
}

/** A window of `days` ending on `today`, inclusive -- so `days: 7` is seven columns and
 *  not eight. Off-by-one here would put an eighth bar on every "7 days" chart. */
export function windowEndingOn(today: string, days: number): AdminRange {
  const n = Math.max(1, Math.min(Math.floor(days), MAX_RANGE_DAYS));
  return { from: shift(today, -(n - 1)), to: today };
}

export type ParsedRange = {
  range: AdminRange;
  /** Which preset is active, for the filter's own pressed state. `null` for a custom
   *  range -- the control must not claim a preset the range does not match. */
  preset: RangePreset | null;
  days: number;
  /** True when the request asked for something unusable and got the default instead.
   *  The page says so rather than pretending the URL was honoured. */
  fellBack: boolean;
};

/**
 * Parse `searchParams` into a usable range.
 *
 * Precedence: an explicit `from`/`to` pair, then `d=<days>`, then the default. **The filter no
 * longer submits both** (two forms), so a request carrying both is a hand-edited URL and the
 * explicit pair is the more specific thing the operator asked for. Do not flip this to make a
 * preset win: that was the other candidate fix for the dead preset buttons, and it leaves
 * `?d=14&from=…&to=…` in the address bar with `from`/`to` naming a range nobody is looking at.
 * An explicit pair that is not usable -- reversed, malformed, or longer than retention -- **falls back
 * and says so** via `fellBack`, because an operator who hand-edited a URL is better served
 * by a working dashboard plus a note than by an error page.
 *
 * `searchParams` is typed loosely (`string | string[] | undefined`) because that is what
 * Next hands a page, and taking the first element of an array is the right answer for a
 * repeated param: `?d=7&d=90` is a malformed request, and 7 is what the control that
 * produced it meant.
 */
export function parseRange(
  params: Record<string, string | string[] | undefined>,
  today: string,
): ParsedRange {
  const from = first(params[RANGE_PARAM.from]);
  const to = first(params[RANGE_PARAM.to]);

  if (from && to) {
    if (isUsableRange(from, to)) {
      const days = dayCount(from, to);
      return { range: { from, to }, preset: presetFor(days), days, fellBack: false };
    }
    return { ...fallback(today), fellBack: true };
  }

  const raw = first(params[RANGE_PARAM.days]);
  if (raw !== undefined) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0 && n <= MAX_RANGE_DAYS) {
      const range = windowEndingOn(today, n);
      return { range, preset: presetFor(n), days: n, fellBack: false };
    }
    return { ...fallback(today), fellBack: true };
  }

  return fallback(today);
}

function fallback(today: string): ParsedRange {
  const range = windowEndingOn(today, DEFAULT_DAYS);
  return { range, preset: presetFor(DEFAULT_DAYS), days: DEFAULT_DAYS, fellBack: false };
}

/** Only an exact match counts. A 31-day custom range must not light up the 30-day preset:
 *  a control that lies about which filter is active is worse than no pressed state. */
function presetFor(days: number): RangePreset | null {
  return (RANGE_PRESETS as readonly number[]).includes(days) ? (days as RangePreset) : null;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The previous equal-length period, for a delta.
 *
 * **EQUAL LENGTH AND IMMEDIATELY BEFORE**, so `periodDelta` compares like with like. The
 * tempting alternative -- "the same range last month" -- is a different number of days
 * whenever a month boundary is involved, and a delta over two different denominators is
 * the kind of wrong number that survives review.
 */
export function previousPeriod(range: AdminRange): AdminRange {
  const n = dayCount(range.from, range.to);
  if (n <= 0) return range;
  const to = shift(range.from, -1);
  return { from: shift(to, -(n - 1)), to };
}
