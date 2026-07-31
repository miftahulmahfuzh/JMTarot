/**
 * Number and date formatting for `/admin`. **PURE, hardcoded `id-ID`** (I-25).
 *
 * ── NO CATALOG, NO `@/lib/i18n/format` ──────────────────────────────────────
 *
 * A-D12: admin copy is Indonesian, hardcoded, and never in the i18n catalog. R33 corrects the
 * REASON while keeping the rule -- the catalog already ships on every page because
 * `LocaleProvider` is in the root layout, so there is no payload saving. What is real is the
 * authoring cost of ~150 strings in two locales for a surface with one reader, and that
 * `id.ts` owns the key set, so every admin string would force an English twin.
 *
 * `Intl` is in the platform, so this adds nothing to the bundle and no dependency (I-1).
 *
 * ── `1.284`, `12,9 rb`, `1,2 jt` ────────────────────────────────────────────
 *
 * Indonesian uses `.` for thousands and `,` for a decimal -- the OPPOSITE of English in both
 * positions -- so a hand-rolled `toLocaleString('en')` would render `1,284` and be read as
 * one-point-two-eight-four by the one person who uses this page. `Intl.NumberFormat('id-ID')`
 * is the whole answer.
 *
 * **`rb` AND `jt`, NOT `K` AND `M`.** `Intl`'s own `notation: 'compact'` produces `1,3 rb`
 * for `id`, which is correct Indonesian (`ribu`, `juta`) -- so the compact forms are the
 * platform's, not invented here.
 */

const INT = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const ONE_DP = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const COMPACT = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
const PCT = new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 1 });

/** A count, thousands-separated. **`emptyCell` for a null, never `0`** -- the caller passes
 *  the dash so this module holds no user-visible string of its own. */
export function int(n: number | null, empty = '—'): string {
  if (n === null || !Number.isFinite(n)) return empty;
  return INT.format(n);
}

/** A count that may be large: `12,9 rb`, `1,2 jt`. For axis ticks and tile values, where a
 *  seven-digit token total would otherwise be wider than its column. */
export function compact(n: number | null, empty = '—'): string {
  if (n === null || !Number.isFinite(n)) return empty;
  // Below 10k the exact number is both short enough and more useful: `9.842` says more than
  // `9,8 rb` and is the same width.
  return Math.abs(n) < 10_000 ? INT.format(n) : COMPACT.format(n);
}

/** One decimal place. For `k` (burstiness) and R², where the second digit is the
 *  information and the third is noise. */
export function oneDp(n: number | null, empty = '—'): string {
  if (n === null || !Number.isFinite(n)) return empty;
  return ONE_DP.format(n);
}

/**
 * A fraction as a percentage. `0.25` -> `25%`.
 *
 * **`null` RENDERS THE EMPTY STRING, AND THAT IS `periodDelta`'s RULING REACHING THE
 * SCREEN.** A3 returns `null` when the previous period was 0 -- never `Infinity`, never
 * `100%` -- because *the two plausible wrong answers are both worse than an empty state:
 * `Infinity` renders as `∞%` and `100%` reads as "doubled" when the truth is "started".*
 */
export function pct(fraction: number | null, empty = '—'): string {
  if (fraction === null || !Number.isFinite(fraction)) return empty;
  return PCT.format(fraction);
}

/** A signed percentage for a delta: `+25%`, `−8%`. The minus is U+2212, which aligns with
 *  digits where a hyphen does not. */
export function signedPct(fraction: number | null, empty = '—'): string {
  if (fraction === null || !Number.isFinite(fraction)) return empty;
  const body = PCT.format(Math.abs(fraction));
  if (fraction === 0) return body;
  return `${fraction > 0 ? '+' : '−'}${body}`;
}

/** `↑` / `↓` / `→`, to pair with `signedPct`. A separate function so a caller cannot get the
 *  glyph and the sign out of step -- `StatTile` takes them as two props and this is the one
 *  place both are derived from one number. */
export function deltaGlyph(fraction: number | null): string | undefined {
  if (fraction === null || !Number.isFinite(fraction) || fraction === 0) return undefined;
  return fraction > 0 ? '↑' : '↓';
}

/**
 * A USD figure. **`null` is the caller's problem, not this function's** -- it returns the
 * `empty` string, and A-D7 requires the unpriced count be rendered beside every cost figure
 * regardless. `metrics.ts` returns `{ usd, unpricedCalls }` as one object so that pairing
 * cannot be forgotten.
 *
 * Two decimals, and `US$` rather than `$`: this is a NOTIONAL figure quoted in dollars on an
 * Indonesian-language page, and the currency has to be unambiguous.
 */
export function usd(n: number | null, empty = '—'): string {
  if (n === null || !Number.isFinite(n)) return empty;
  return `US$${new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}`;
}

/**
 * A `'YYYY-MM-DD'` day as `7 Agu`.
 *
 * **THE STRING IS SLICED, NEVER PARSED INTO A `Date` AND FORMATTED** -- or rather, it is
 * parsed at explicit UTC midnight and formatted in UTC. `local_date` is the querent's own
 * calendar day as a STRING, and CLAUDE.md's trap is that a `Date` renders in the server's
 * zone and is a day out for anyone in Jakarta between midnight and 07:00. `timeZone: 'UTC'`
 * is what keeps the label the same day the column holds.
 */
const DAY = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function day(iso: string, empty = '—'): string {
  const t = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return empty;
  return DAY.format(t);
}

/** `7 Agu 2026`, for a range's endpoints where the year matters. */
const DAY_YEAR = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function dayWithYear(iso: string, empty = '—'): string {
  const t = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return empty;
  return DAY_YEAR.format(t);
}

/**
 * An INSTANT as `31 Jul 2026, 14.22`, pinned to Jakarta. **A7, for the insight box.**
 *
 * ── EVERY OTHER FORMATTER HERE IS UTC AND THIS ONE IS NOT, DELIBERATELY ─────
 *
 * `day` and `dayWithYear` render `local_date`, a querent's calendar day stored as a
 * string, and UTC is what keeps the label the same day the column holds. This renders a
 * `timestamptz` — a real instant — answering *"when did I last press this button?"*,
 * which is a wall-clock question asked by one person who is in Jakarta. Rendering it in
 * UTC would put a timestamp seven hours in the past under a button they pressed a minute
 * ago, which reads as the button not having worked.
 *
 * **THE ZONE IS EXPLICIT, WHICH IS ALSO WHAT MAKES IT HYDRATION-SAFE.** `InsightBox` is a
 * client component and the page server-renders its first frame; an `Intl` format with a
 * pinned `timeZone` produces the same string in both places, where the default zone would
 * be the lambda's UTC on the server and the operator's on the client — a mismatch React
 * cannot patch, on a string that looks plausible either way.
 *
 * `Asia/Jakarta` is hardcoded rather than read from the viewer, because `WIB` is printed
 * beside it by the only caller and a label that says WIB must not render another zone.
 */
const STAMP = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});

export function stamp(iso: string, empty = '—'): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return empty;
  return STAMP.format(t);
}

/**
 * A duration in ms as `1,2 s` or `840 ms`.
 *
 * The threshold is 1000ms and the unit changes with it, because `1240 ms` and `1,2 s` are the
 * same fact and the second is the one a person compares against a page load.
 */
export function ms(n: number | null, empty = '—'): string {
  if (n === null || !Number.isFinite(n)) return empty;
  return n >= 1000 ? `${ONE_DP.format(n / 1000)} s` : `${INT.format(n)} ms`;
}

/**
 * A user id, truncated to its first eight characters.
 *
 * **NO EMAIL, NO NICKNAME, ANYWHERE ON THESE TWO PAGES** (§1.11). Identity display belongs
 * to A5's audited surface: putting an email on a metrics page would owe an
 * `admin_access_log` row per RENDERED ROW, which is absurd, and omitting the audit would
 * breach A-D16. Eight hex characters is enough to tell two rows apart and to recognise one
 * you have seen, and it is a link to the page where identity is legitimately shown.
 *
 * `null` is a REAL ROW and not a gap: `llm_calls.user_id` is `on delete set null`, so a
 * hard-deleted user's tokens survive with the attribution gone -- and they were still spent.
 * The caller labels it and never drops it.
 */
export function shortId(id: string | null, deletedLabel: string): string {
  if (id === null) return deletedLabel;
  return id.slice(0, 8);
}
