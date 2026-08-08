/**
 * The panel registry: what each `Insight` button is a button FOR, and what facts the
 * model is given about it. **A7, 2026-07-31.**
 *
 * `docs/plans/2026-07-31-admin-panel-insights-design.md` §2.
 *
 * ── THIS FILE IS WHY THE ROUTE NEVER TRUSTS THE CLIENT ─────────────────────
 *
 * `POST /api/admin/insight` carries `{ panel, from, to }` and no numbers. The route
 * re-runs the same composite the page ran and comes here, so **the block handed to the
 * model is one the server built from the ledger**, not a string a browser posted. W3's
 * completion route makes the same move for the same reason: *the client is trusted to
 * say what it answered, never that it finished* — and a prompt is the last place to
 * relax it.
 *
 * The cost is a second read of eight or six statements per button press, inside
 * `withAdminRead`'s 10s budget, for one operator who pressed a button. That is the
 * cheap side of the trade.
 *
 * ── TWO LOADERS, THIRTEEN RENDERERS ────────────────────────────────────────
 *
 * A loader runs a page's whole composite once; a renderer is PURE and turns it into
 * `PanelFacts`. The split is what keeps a button on `/admin` from issuing
 * `/admin/tokens`' six heavier queries, and it is what lets `panels.test.ts` exercise
 * every renderer against a literal with no database.
 *
 * ── THE FACTS ARE NOT THE PANEL'S TABLE, AND `insightPrompt.ts` SAYS WHY ───
 *
 * Short form: the on-screen table is written for somebody looking at that chart and
 * omits, on purpose, what a model most needs — the previous period, the 280 ceiling,
 * `k`, the denominators that live in a footnote. Every renderer below adds those and
 * formats its numbers with `../format`, the same functions the panel itself used, so
 * the box and the chart cannot print one figure two ways.
 *
 * ── THE KEY SET IS ASSERTED AGAINST THE PAGES ──────────────────────────────
 *
 * `panels.test.ts` greps both `page.tsx` files for `<InsightBox panel="…">` and
 * requires the two sets to be EQUAL, in `callClass.test.ts`'s idiom. A button with no
 * renderer 404s the route under a control that looks live; a renderer with no button is
 * dead code that reads as a shipped panel. Neither is visible in a diff.
 */
import { callTotals } from '@/lib/db/queries/admin/calls';
import { chatRollup, type ChatRollup } from '@/lib/db/queries/admin/chat';
import {
  callsByOp,
  callsByUtcDay,
  modelsSeen,
  peakWindow5h,
  tokensByBucketAndModel,
  type Range,
} from '@/lib/db/queries/admin/metrics';
import { fleetRollup, type FleetRollup } from '@/lib/db/queries/admin/rollup';
import { userCostLeague } from '@/lib/db/queries/admin/users';
import type { DbOrTx } from '@/lib/db/types';
import { burstiness, meanCallsPerDay, periodDelta, priceRollup } from '@/lib/analytics/rollup';
import { MIN_FORECAST_DAYS, crossing, forecast, horizon } from '@/lib/analytics/forecast';
import { dayCount } from '@/lib/analytics/series';
import { _ceilings } from '@/lib/llm/meter';
import { NOTIONAL_MODEL, priceFor } from '@/lib/llm/prices';
import type { StoredInsight } from '@/lib/db/queries/admin/insights';
import {
  insightInputHash,
  serializePanelFacts,
  type PanelFacts,
} from '@/lib/admin/insightPrompt';
import { CHAT, COMMON, OVERVIEW, TOKENS } from '../copy';
import { compact, dayWithYear, int, ms, oneDp, pct, shortId, signedPct, usd } from '../format';
import {
  callSeries,
  league,
  opRows,
  tokenSeries,
  ttftOverall,
  ttftServices,
  weekdayHeat,
} from '../metrics';
import { previousPeriod } from '../range';
import {
  beatFold,
  castFold,
  fleetShare,
  healthFold,
  intentFold,
  latencyFold,
  replyFold,
  runFold,
  tokenFold,
} from '../chat/series';
import { CHAT_OP_ORDER, TRIGGER_ORDER } from '../chat/slots';

/** What `/admin`'s `Body` computes, recomputed here. */
type OverviewData = {
  rollup: FleetRollup;
  prev: FleetRollup;
  cost: ReturnType<typeof priceRollup>;
};

/**
 * What `/admin/chat`'s `Body` computes, recomputed here.
 *
 * **THE PAGE'S COMPOSITE IS THE TYPE**, rather than a hand-listed struct like the two
 * above it: `/admin/chat` loads exactly one thing, so a drift between the page and this
 * loader is impossible by construction rather than by a matching pair of literals. The
 * two older shapes predate their pages having a single composite and are left alone.
 */
type ChatData = ChatRollup;

/** What `/admin/tokens`' `Body` computes, recomputed here. */
type TokensData = {
  tokens: Awaited<ReturnType<typeof tokensByBucketAndModel>>;
  utc: Awaited<ReturnType<typeof callsByUtcDay>>;
  ops: Awaited<ReturnType<typeof callsByOp>>;
  models: Awaited<ReturnType<typeof modelsSeen>>;
  leagueRows: Awaited<ReturnType<typeof userCostLeague>>;
  peak: Awaited<ReturnType<typeof peakWindow5h>>;
};

/**
 * The price lookup for the spend figure.
 *
 * **A COPY OF `/admin/page.tsx`'s `notionalLookup`, AND THE DUPLICATION IS DELIBERATE.**
 * Exporting it from the page would make this module import a file that exports a React
 * component and a `maxDuration`, which is the kind of edge that turns a route handler's
 * bundle into a page's. Three lines and a shared reason, stated in both places: **every
 * model is priced at `NOTIONAL_MODEL`'s rate, not at its own**, because every z.ai row
 * is priced at zero on purpose and a real figure under the word "notional" reads as *we
 * are spending nothing*. `NOTIONAL_MODEL` is unset, so this returns `null` today and the
 * facts say so rather than saying `US$0,00`.
 */
function notionalLookup(_model: string, on: string) {
  return NOTIONAL_MODEL === null ? null : priceFor(NOTIONAL_MODEL, on);
}

function sum(values: readonly (number | null)[]): number {
  return values.reduce<number>((a, v) => (v === null || !Number.isFinite(v) ? a : a + v), 0);
}

// ---------------------------------------------------------------------------
// The two loaders
// ---------------------------------------------------------------------------

/** Handle first, `contract.test.ts`'s rule — even though this is not under
 *  `queries/`, because the route hands in `withAdminRead`'s transaction. */
async function loadOverview(db: DbOrTx, range: Range): Promise<OverviewData> {
  const previous = previousPeriod(range);
  const [rollup, prev, totals] = await Promise.all([
    fleetRollup(db, range),
    fleetRollup(db, previous),
    callTotals(db, range),
  ]);
  return { rollup, prev, cost: priceRollup(totals, notionalLookup) };
}

async function loadTokens(db: DbOrTx, range: Range): Promise<TokensData> {
  const [tokens, utc, ops, models, leagueRows, peak] = await Promise.all([
    tokensByBucketAndModel(db, range),
    callsByUtcDay(db, range),
    callsByOp(db, range),
    modelsSeen(db, range),
    userCostLeague(db, range),
    peakWindow5h(db, range),
  ]);
  return { tokens, utc, ops, models, leagueRows, peak };
}

/**
 * `/admin/chat`'s composite, run again for a button press.
 *
 * **ONE STATEMENT SET FOR ALL NINE PANELS**, the same trade A7 already priced: a press
 * costs one extra composite read inside `withAdminRead`'s 10s budget, for one operator,
 * and what the model is handed is a block **the server built from the tables** rather
 * than a string a browser posted. `POST /api/admin/insight` carries `{ panel, from, to }`
 * and no figures — W3's completion-route rule, applied to a prompt.
 */
async function loadChat(db: DbOrTx, range: Range): Promise<ChatData> {
  return chatRollup(db, range);
}

// ---------------------------------------------------------------------------
// /admin -- Ringkasan
// ---------------------------------------------------------------------------

function quotaFacts({ rollup }: OverviewData): PanelFacts {
  const ceiling = _ceilings().hard;
  const used = rollup.peak5h?.calls ?? null;
  return {
    title: OVERVIEW.heroLabel,
    purpose:
      'Berapa panggilan model terjadi di jendela 5 jam berjalan yang paling padat dalam ' +
      'rentang ini, dibanding batas kuota provider. Ini satu-satunya angka di dasbor yang ' +
      'bisa mematikan aplikasi kalau tersentuh.',
    headline: [
      { label: 'Puncak 5 jam berjalan', value: int(used, '(tidak ada data)') },
      { label: 'Batas', value: int(ceiling) },
      {
        label: 'Terpakai',
        value: used === null || ceiling <= 0 ? '(tidak ada data)' : pct(used / ceiling),
      },
    ],
    columns: [],
    rows: [],
    notes: [
      OVERVIEW.meterCaveat,
      used === null
        ? 'Puncaknya null: itu berarti TIDAK ADA DATA, bukan nol panggilan. Jangan bilang kuota aman kalau angkanya null.'
        : 'Jendela 5 jam berjalan, bukan hari kalender.',
    ],
  };
}

function kpiFacts({ rollup, prev, cost }: OverviewData): PanelFacts {
  const calls = sum(rollup.callsByUtcDay.map((r) => r.calls));
  const prevCalls = sum(prev.callsByUtcDay.map((r) => r.calls));
  const tokens = tokenSeries(rollup.tokens, rollup.range.from, rollup.range.to);
  const prevTokens = tokenSeries(prev.tokens, prev.range.from, prev.range.to);
  const tokenTotal = sum(tokens.input) + sum(tokens.output);
  const prevTokenTotal = sum(prevTokens.input) + sum(prevTokens.output);
  const readings = sum(rollup.readings.map((r) => r.ok + r.partial));
  const prevReadings = sum(prev.readings.map((r) => r.ok + r.partial));
  const p95 = rollup.byOp.find((r) => r.op === 'reading')?.p95Ms ?? null;
  const ttftP95 = ttftOverall(rollup.ttft)?.p95Ms ?? null;

  const delta = (a: number, b: number) => {
    const d = periodDelta(a, b);
    return d === null ? '(tidak bisa dibandingkan)' : signedPct(d);
  };

  return {
    title: 'Angka utama',
    purpose:
      'Enam angka teratas halaman ringkasan, masing-masing dibanding periode sepanjang ' +
      'yang sama tepat sebelumnya.',
    headline: [
      { label: OVERVIEW.kpi.spend, value: usd(cost.costUsd, '(belum berharga)') },
      { label: OVERVIEW.kpi.calls, value: int(calls) },
      { label: 'Panggilan periode sebelumnya', value: int(prevCalls) },
      { label: 'Perubahan panggilan', value: delta(calls, prevCalls) },
      { label: OVERVIEW.kpi.tokens, value: int(tokenTotal) },
      { label: 'Token periode sebelumnya', value: int(prevTokenTotal) },
      { label: 'Perubahan token', value: delta(tokenTotal, prevTokenTotal) },
      { label: OVERVIEW.kpi.readings, value: int(readings) },
      { label: 'Bacaan periode sebelumnya', value: int(prevReadings) },
      { label: 'Perubahan bacaan', value: delta(readings, prevReadings) },
      { label: OVERVIEW.kpi.ttftP95, value: ms(ttftP95) },
      { label: OVERVIEW.kpi.p95, value: ms(p95) },
    ],
    columns: [],
    rows: [],
    notes: [
      OVERVIEW.kpi.p95Note,
      OVERVIEW.kpi.ttftNote,
      `${int(tokens.nullInputCalls)} panggilan tidak melaporkan token sama sekali, jadi total token adalah batas bawah.`,
      cost.costUsd === null ? OVERVIEW.kpi.spendUnset : OVERVIEW.kpi.spendUnpriced(int(cost.unpricedCalls)),
      'p95 TTFT dan p95 panggilan bacaan mengukur dua hal berbeda dan tidak boleh disamakan.',
      /*
       * ── THE HIGHEST-RISK SITE OF SEAM S10 IS A PROMPT, NOT AN ARITHMETIC (F7) ──
       *
       * This block puts a COST and a READING COUNT in one `headline` list, and
       * `INSIGHT_SYSTEM`'s rule 1 only forbids citing a number that is **not** in the
       * block — which a quotient of two numbers that are is not. There is no
       * cost-per-reading figure anywhere in this repository; the one place it could be
       * invented is here, by a model, in prose that is then stored in
       * `admin_insights.body`, a column with no redaction path.
       */
      'Biaya, panggilan dan token dihitung atas SELURUH op. Empat dari tiga belas op tidak punya penanya di belakangnya — insight, blog_format, chat_plan, chat_turn — jadi angka-angka ini tidak boleh dibagi dengan "Bacaan selesai". Hasilnya bukan biaya per bacaan.',
    ],
  };
}

function callsFacts({ rollup }: OverviewData): PanelFacts {
  const values = callSeries(rollup.callsByUtcDay);
  const buckets = rollup.callsByUtcDay.map((r) => r.bucket);
  return {
    title: OVERVIEW.callsTitle,
    purpose: 'Deret panggilan model per hari UTC — satu-satunya deret harian yang sebanding dengan kuota.',
    headline: [
      { label: 'Total panggilan', value: int(sum(values)) },
      { label: 'Hari', value: int(buckets.length) },
    ],
    columns: [COMMON.dayColumn, OVERVIEW.callsSeries],
    rows: buckets.map((b, i) => [b, int(values[i])]),
    notes: [OVERVIEW.callsSubtitle],
  };
}

function serviceFacts({ rollup }: OverviewData): PanelFacts {
  const known = ttftServices(rollup.ttft);
  return {
    title: OVERVIEW.serviceTitle,
    purpose: 'Berapa bacaan selesai per layanan. Ini menghitung BACAAN, bukan panggilan model.',
    headline: [{ label: 'Total bacaan', value: int(sum(known.map((r) => r.readings))) }],
    columns: ['Layanan', OVERVIEW.kpi.readings],
    rows: known.map((r) => [r.serviceId, int(r.readings)]),
    notes: [
      OVERVIEW.readingsSubtitle,
      'Satu bacaan bisa memicu beberapa panggilan model, dan bacaan yang ditolak moderasi memicu nol. Jangan samakan dengan jumlah panggilan. Sebaliknya, empat op — insight, blog_format, chat_plan, chat_turn — tidak diakibatkan bacaan sama sekali, jadi jumlah panggilan bukan jumlah bacaan dari dua arah sekaligus.',
    ],
  };
}

function ttftFacts({ rollup }: OverviewData): PanelFacts {
  const services = ttftServices(rollup.ttft);
  const overall = ttftOverall(rollup.ttft);
  return {
    title: OVERVIEW.ttftTitle,
    purpose:
      'Jeda antara penanya menekan tombol dan huruf pertama muncul, per layanan. Makin kecil makin baik.',
    headline: [
      { label: 'p50 semua layanan', value: ms(overall?.p50Ms ?? null) },
      { label: 'p95 semua layanan', value: ms(overall?.p95Ms ?? null) },
      { label: 'Bacaan terukur', value: int(overall?.readings ?? null) },
    ],
    columns: [
      OVERVIEW.ttftColumns.service,
      OVERVIEW.ttftColumns.readings,
      OVERVIEW.ttftColumns.p50,
      OVERVIEW.ttftColumns.p95,
    ],
    rows: services.map((r) => [r.serviceId, int(r.readings), ms(r.p50Ms), ms(r.p95Ms)]),
    notes: [
      OVERVIEW.ttftSubtitle,
      'Baris "semua layanan" dihitung Postgres atas seluruh populasi. Itu BUKAN rata-rata dari tiga baris di atasnya, dan jangan diperlakukan begitu.',
    ],
  };
}

function statusFacts({ rollup }: OverviewData): PanelFacts {
  return {
    title: OVERVIEW.statusTitle,
    purpose: 'Bagaimana panggilan model berakhir, per op: total, gagal, ditinggalkan.',
    headline: [
      { label: 'Total panggilan', value: int(sum(rollup.byOp.map((r) => r.calls))) },
      { label: 'Gagal', value: int(sum(rollup.byOp.map((r) => r.failed))) },
      { label: 'Ditinggalkan', value: int(sum(rollup.byOp.map((r) => r.aborted))) },
    ],
    columns: [
      OVERVIEW.statusColumns.op,
      OVERVIEW.statusColumns.calls,
      OVERVIEW.statusColumns.failed,
      OVERVIEW.statusColumns.aborted,
    ],
    rows: rollup.byOp.map((r) => [r.op, int(r.calls), int(r.failed), int(r.aborted)]),
    notes: [
      '"Ditinggalkan" berarti penanya menutup halaman di tengah bacaan. Itu perilaku normal, bukan error.',
    ],
  };
}

// ---------------------------------------------------------------------------
// /admin/tokens -- Token
// ---------------------------------------------------------------------------

function ioFacts({ tokens }: TokensData, range: Range): PanelFacts {
  const series = tokenSeries(tokens, range.from, range.to);
  return {
    title: TOKENS.ioTitle,
    purpose: 'Token input dan output per hari. Keduanya satuan yang sama, jadi satu sumbu.',
    headline: [
      { label: 'Total input', value: int(sum(series.input)) },
      { label: 'Total output', value: int(sum(series.output)) },
    ],
    columns: [COMMON.dayColumn, TOKENS.ioInput, TOKENS.ioOutput],
    rows: series.buckets.map((b, i) => [b, int(series.input[i]), int(series.output[i])]),
    notes: [
      TOKENS.ioNullNote(int(series.nullInputCalls)),
      'Baris sebelum 2026-07-30 tidak mencatat token input untuk panggilan streaming, dan tidak ada backfill. Rentang yang melewati tanggal itu mencampur dua pengukuran.',
    ],
  };
}

function cacheFacts({ tokens }: TokensData, range: Range): PanelFacts {
  const series = tokenSeries(tokens, range.from, range.to);
  const measured = series.cachedBasisTokens > 0;
  return {
    title: TOKENS.cacheTitle,
    purpose:
      'Berapa banyak token input yang dilayani dari cache prompt provider. Perubahan di lapisan prompt bisa merusak cache locality tanpa menggeser grafik token sama sekali.',
    headline: [
      {
        label: 'Porsi dari cache',
        value: measured ? pct(series.cacheReadTokens / series.cachedBasisTokens) : '(belum terukur)',
      },
      { label: 'Token cache terbaca', value: int(series.cacheReadTokens) },
      { label: 'Penyebut (token input yang melaporkan angka cache)', value: int(series.cachedBasisTokens) },
    ],
    columns: [],
    rows: [],
    notes: [
      measured ? TOKENS.cacheBasis(compact(series.cachedBasisTokens)) : TOKENS.cacheUnmeasured,
      'Penyebutnya hanya baris yang MELAPORKAN angka cache, bukan seluruh token input. Kalau penyebutnya nol, itu berarti belum terukur — bukan 0%.',
    ],
  };
}

function trajectoryFacts({ utc, peak }: TokensData): PanelFacts {
  const values = callSeries(utc);
  const buckets = utc.map((r) => r.bucket);
  const fit = forecast(values.map((v, t) => ({ t, y: v ?? 0 })));
  const perDay = meanCallsPerDay(sum(values), dayCount(buckets[0] ?? '', buckets[buckets.length - 1] ?? ''));
  const k = burstiness(peak?.calls ?? null, perDay);
  const windowCeiling = _ceilings().hard;
  const dailyCeiling = k === null || k <= 0 ? null : (windowCeiling * (24 / 5)) / k;
  const projection = horizon(fit, buckets[buckets.length - 1] ?? '', 30);
  const cross =
    dailyCeiling === null ? null : crossing(fit, dailyCeiling, buckets[buckets.length - 1] ?? '');

  const headline: PanelFacts['headline'] = [
    { label: 'Rata-rata panggilan per hari', value: oneDp(perDay) },
    { label: 'k (keberkumpulan)', value: oneDp(k) },
    {
      label: 'Batas kuota dalam satuan panggilan per hari',
      value: dailyCeiling === null ? '(tidak bisa dihitung)' : int(Math.round(dailyCeiling)),
    },
    { label: 'Bentuk tren', value: fit.kind },
  ];
  if (fit.kind === 'trend') {
    headline.push({ label: 'n (hari)', value: int(fit.n) }, { label: 'R²', value: oneDp(fit.r2) });
  }

  const notes = [
    TOKENS.trajectorySubtitle,
    /*
     * **THE CEILING IS INTERPOLATED, NEVER TYPED.** `adminCopy.test.ts` bans a literal
     * `280` anywhere under `src/app/admin/**` for the reason §10 gave: the derivation
     * (400 prompts x 70%) lives beside `_ceilings()` in `meter.ts`, and a copy here is
     * the number that goes stale the day the plan tier changes. The sentence a model
     * reads has to carry the real one or its arithmetic is about a different app.
     */
    `Batas aslinya adalah ${int(windowCeiling)} panggilan per 5 jam berjalan. Angka "per hari" di atas adalah konversi yang memakai k yang diukur, bukan pembagian rata.`,
  ];
  if (fit.kind === 'insufficient') notes.push(TOKENS.trajectoryInsufficient(MIN_FORECAST_DAYS, fit.have));
  if (cross?.kind === 'crossing') {
    notes.push(
      cross.central
        ? TOKENS.trajectoryCrossing(dayWithYear(cross.earliest.day), dayWithYear(cross.central.day))
        : TOKENS.trajectoryCrossingEarliestOnly(dayWithYear(cross.earliest.day)),
    );
    notes.push('Tanggal perpotongan selalu RENTANG, bukan satu hari. Jangan sebut satu tanggal saja.');
  }
  if (cross?.kind === 'already-above') notes.push(TOKENS.trajectoryAlreadyAbove);
  if (cross?.kind === 'beyond-horizon') notes.push(TOKENS.trajectoryBeyond(cross.days));

  return {
    title: TOKENS.trajectoryTitle,
    purpose:
      'Apakah tren panggilan harian sedang menuju batas kuota, dan kalau ya, kapan bandnya menyentuh batas itu.',
    headline,
    columns: [COMMON.dayColumn, TOKENS.opColumns.calls],
    rows: [
      ...buckets.map((b, i) => [b, int(values[i])]),
      ...projection.map((p) => [
        `${p.day} (proyeksi)`,
        `${int(Math.round(p.lower))}–${int(Math.round(p.upper))}`,
      ]),
    ],
    notes,
  };
}

function opFacts({ ops }: TokensData): PanelFacts {
  const rows = opRows(ops);
  return {
    title: TOKENS.opTitle,
    purpose: 'Biaya per keperluan: berapa panggilan dan token yang dihabiskan tiap op.',
    headline: [{ label: 'Op yang berjalan', value: int(rows.length) }],
    columns: [
      TOKENS.opColumns.op,
      TOKENS.opColumns.calls,
      TOKENS.opColumns.input,
      TOKENS.opColumns.output,
      TOKENS.opColumns.p95,
    ],
    rows: rows.map((r) => [
      r.op,
      int(r.calls),
      int(r.inputTokens),
      int(r.outputTokens),
      ms(r.p95Ms),
    ]),
    notes: [
      'op `translation` mencampur dua ukuran yang sangat berbeda: terjemahan bacaan (~150 kata) dan terjemahan artikel blog (~3.000 token tiap arah). Yang membedakannya cuma llm_calls.user_id.',
      /*
       * **A CLASS STATEMENT, NOT A NOTE ABOUT ONE OP** (F7, seam S10). This line used to
       * say only *"op `insight` adalah tombol Insight di dasbor ini sendiri"*, which was
       * true and named one of four.
       *
       * The last sentence also pre-empts the contradiction a reviewer would otherwise
       * see: line 653 below records *"exclude `op: 'insight'` from the metric queries"*
       * as a **rejected** fix for the staleness problem, and F7 does not reverse it. The
       * table showing what these four cost is the entire argument that earned each of
       * those four values.
       */
      'Empat op tidak diakibatkan penanya: insight (tombol di dasbor ini), blog_format (tombol Auto Format), chat_plan dan chat_turn (grup obrolan). Tabel ini sengaja tidak menyaringnya — justru menampilkan biayanya adalah alasan keempat op itu ada.',
    ],
  };
}

function leagueFacts({ leagueRows }: TokensData): PanelFacts {
  const top = league(leagueRows, 10);
  return {
    title: TOKENS.leagueTitle,
    purpose: 'Sepuluh pasangan (pengguna, model) dengan token terbanyak dalam rentang ini.',
    headline: [{ label: 'Baris ditampilkan', value: int(top.length) }],
    columns: [
      TOKENS.leagueColumns.user,
      TOKENS.leagueColumns.model,
      TOKENS.leagueColumns.calls,
      TOKENS.leagueColumns.tokens,
    ],
    /*
     * `shortId` AND NOT `r.userId`. The panel renders an eight-character prefix (A5's
     * §1.11: no email and no nickname on this surface), and the block must not carry
     * more identity than the screen does — a full uuid in a prompt is an identifier
     * this feature has no use for. `null` becomes the unattributed label, which is a
     * hard-deleted user whose tokens survive with the attribution gone.
     */
    rows: top.map((r) => [
      shortId(r.userId, COMMON.unattributed),
      r.model,
      int(r.calls),
      int(r.tokens),
    ]),
    notes: [
      TOKENS.leagueCaveat,
      'ID pengguna sengaja dipotong delapan karakter. Jangan menebak siapa orangnya.',
    ],
  };
}

function modelFacts({ models }: TokensData, range: Range): PanelFacts {
  return {
    title: TOKENS.modelsTitle,
    purpose:
      'Model mana yang berjalan, dan mana yang belum punya baris harga — daftar yang mengubah "kenapa biayanya null" jadi perbaikan lima menit.',
    headline: [
      { label: 'Model berbeda', value: int(models.length) },
      {
        label: 'Model tanpa harga',
        value: int(models.filter((m) => priceFor(m.model, range.to) === null).length),
      },
    ],
    columns: [
      TOKENS.modelsColumns.model,
      TOKENS.modelsColumns.calls,
      TOKENS.modelsColumns.firstSeen,
      TOKENS.modelsColumns.priced,
    ],
    rows: models.map((m) => [
      m.model,
      int(m.calls),
      m.firstSeen.slice(0, 10),
      priceFor(m.model, range.to) ? TOKENS.modelPriced : TOKENS.modelUnpriced,
    ]),
    notes: [TOKENS.modelsSubtitle],
  };
}

function heatFacts({ utc }: TokensData): PanelFacts {
  const heat = weekdayHeat(
    utc.map((r) => r.bucket),
    callSeries(utc),
  );
  const perWeekday = TOKENS.heatWeekdays.map((label, row) => {
    const cells = heat.cells.filter((c) => c.row === row);
    return [label, int(cells.reduce((a, c) => a + c.value, 0)), int(cells.length)];
  });
  return {
    title: TOKENS.heatTitle,
    purpose: 'Hari dalam seminggu mana yang ramai, dilipat dari deret harian.',
    headline: [{ label: 'Sel terpadat', value: int(heat.max) }],
    columns: [COMMON.dayColumn, 'Total panggilan', 'Jumlah pekan'],
    rows: perWeekday,
    notes: [
      TOKENS.heatSubtitle,
      'Versi per jam tidak ada dan tidak bisa dihitung: jam lokal penanya tidak tersimpan. Jangan menyimpulkan apa pun soal jam.',
    ],
  };
}

// ---------------------------------------------------------------------------
// /admin/chat -- Obrolan
//
// **A `PanelFacts` BLOCK CARRIES ONLY WHAT THE PANEL ALREADY RENDERS, PLUS THE
// CAVEATS** (`[F7-14]`), and it binds harder here than anywhere because the subject is
// a conversation. **No message body, no nickname, no email, not even a sample bubble
// "for context"** -- `admin_insights.body` is a column with no redaction path, and a
// querent's words in a prompt whose output is stored there is the one leak this page
// could produce. The `notes` below are `copy.ts`'s `CATATAN DARI PANEL` arrays
// verbatim, which is the contract rather than a summary of it.
// ---------------------------------------------------------------------------

function replyFacts(data: ChatData): PanelFacts {
  const fold = replyFold(data.reply);
  return {
    title: CHAT.replyTitle,
    purpose:
      'Apakah penanya menjawab pesan yang tidak ia minta, dalam 24 jam. Ini papan skor ' +
      'rilis ini: satu-satunya pengukuran berkelanjutan atas "proaktif".',
    headline: [
      { label: CHAT.replyHeroLabel, value: pct(fold.rate, '(belum bisa dinilai)') },
      { label: CHAT.replyDelivered, value: int(fold.delivered) },
      { label: CHAT.replyReplied, value: int(fold.replied) },
      { label: CHAT.replyPending, value: int(fold.pending) },
    ],
    columns: [
      CHAT.replyColumns.trigger,
      CHAT.replyColumns.delivered,
      CHAT.replyColumns.replied,
      CHAT.replyColumns.pending,
      CHAT.replyColumns.rate,
    ],
    rows: fold.rows.map((r) => [
      r.trigger,
      int(r.delivered),
      int(r.replied),
      int(r.pending),
      pct(r.rate),
    ]),
    notes: [...CHAT.replyNotes],
  };
}

function runsFacts(data: ChatData): PanelFacts {
  const fold = runFold(data.runs, data.range.from, data.range.to);
  return {
    title: CHAT.runsTitle,
    purpose: 'Berapa banyak run per hari UTC, dan berapa yang tanpa diminta penanya.',
    headline: [
      { label: 'Total run', value: int(fold.total) },
      { label: CHAT.runsSeries.reactive, value: int(fold.totals.user_message) },
      {
        label: CHAT.runsSeries.proactive,
        value: int(fold.total - fold.totals.user_message),
      },
    ],
    columns: [COMMON.dayColumn, ...TRIGGER_ORDER],
    rows: fold.buckets.map((b, i) => [b, ...TRIGGER_ORDER.map((t) => int(fold.byTrigger[t][i]))]),
    notes: [...CHAT.runsNotes],
  };
}

function beatsFacts(data: ChatData): PanelFacts {
  const fold = beatFold(data.beats);
  return {
    title: CHAT.beatsTitle,
    purpose:
      'Sebaran beat per run yang sudah selesai, dan seberapa sering sutradara memutuskan ' +
      'tidak ada yang menjawab.',
    headline: [
      { label: CHAT.beatsSilence, value: pct(fold.silence, '(belum ada run selesai)') },
      { label: CHAT.beatsMean, value: oneDp(fold.mean, '(belum ada run selesai)') },
      { label: 'Run selesai atau ditinggalkan', value: int(fold.total) },
    ],
    columns: [CHAT.beatsColumns.bucket, CHAT.beatsColumns.runs],
    rows: fold.buckets.map((b) => [CHAT.beatsBucket(b.bucket), int(b.runs)]),
    notes: [...CHAT.beatsNotes],
  };
}

function castFacts(data: ChatData): PanelFacts {
  const fold = castFold(data.cast);
  return {
    title: CHAT.castTitle,
    purpose:
      'Siapa yang bicara dan kepada siapa. Kalau "ke pembaca lain" nol, ruangan ini tiga ' +
      'monolog dan bukan satu grup.',
    headline: [
      { label: 'Total gelembung pembaca', value: int(fold.total) },
      { label: CHAT.castTopShare, value: pct(fold.topShare, '(belum ada gelembung)') },
      { label: CHAT.castSeries.reader, value: pct(fold.readerToReader, '(belum ada gelembung)') },
    ],
    columns: [
      CHAT.castColumns.reader,
      CHAT.castColumns.querent,
      CHAT.castColumns.reader2,
      CHAT.castColumns.none,
      CHAT.castColumns.total,
    ],
    rows: fold.rows.map((r) => [r.author, int(r.querent), int(r.reader), int(r.none), int(r.total)]),
    notes: [...CHAT.castNotes],
  };
}

function intentFacts(data: ChatData): PanelFacts {
  const fold = intentFold(data.intents);
  return {
    title: CHAT.intentTitle,
    purpose:
      'Untuk apa tiap beat direncanakan. Porsi "ask" adalah angka yang dipakai rilis ini ' +
      'untuk menilai apakah pembaca benar-benar bertanya balik.',
    headline: [
      { label: CHAT.intentAskShare, value: pct(fold.askShare, '(belum ada beat)') },
      { label: 'Total beat', value: int(fold.total) },
    ],
    columns: [CHAT.intentColumns.intent, CHAT.intentColumns.beats],
    rows: fold.rows.map((r) => [r.intent ?? CHAT.intentUnrecorded, int(r.beats)]),
    notes: [...CHAT.intentNotes],
  };
}

function chatTokensFacts(data: ChatData): PanelFacts {
  const fold = tokenFold(data.tokens, data.range.from, data.range.to);
  const cost = priceRollup(data.callTotals, notionalLookup);
  const share = fleetShare(fold, data.fleetByOp);
  return {
    title: CHAT.tokensTitle,
    purpose:
      'Berapa token dan berapa panggilan yang dihabiskan obrolan, dipisah antara sutradara ' +
      'dan suara. Panel ini mengukur; ia tidak membatasi apa pun.',
    headline: [
      { label: CHAT.tokensKpi.tokens, value: int(fold.tokens) },
      { label: 'Panggilan obrolan', value: int(fold.calls) },
      { label: 'Panggilan chat_plan', value: int(fold.totals.chat_plan.calls) },
      { label: 'Panggilan chat_turn', value: int(fold.totals.chat_turn.calls) },
      { label: CHAT.tokensKpi.cost, value: usd(cost.costUsd, '(belum berharga)') },
      { label: 'Panggilan belum berharga', value: int(cost.unpricedCalls) },
      { label: CHAT.tokensKpi.callShare, value: pct(share.calls, '(tidak ada panggilan)') },
      { label: CHAT.tokensKpi.tokenShare, value: pct(share.tokens, '(tidak ada token)') },
    ],
    columns: [COMMON.dayColumn, ...CHAT_OP_ORDER],
    rows: fold.buckets.map((b, i) => [b, ...CHAT_OP_ORDER.map((op) => int(fold.byOp[op][i]))]),
    notes: [
      ...CHAT.tokensNotes,
      `${int(fold.untokenized)} panggilan obrolan tidak melaporkan token sama sekali, jadi total token adalah batas bawah.`,
    ],
  };
}

function chatLatencyFacts(data: ChatData): PanelFacts {
  const fold = latencyFold(data.latency, data.range.from, data.range.to);
  return {
    title: CHAT.latencyTitle,
    purpose:
      'Berapa lama panggilan model obrolan berlangsung. Ini BUKAN waktu yang dirasakan ' +
      'penanya — jeda mengetik antar-beat tidak tercatat di mana pun.',
    headline: CHAT_OP_ORDER.flatMap((op) => [
      { label: `${op} p50`, value: ms(fold.overall[op].p50Ms) },
      { label: `${op} p95`, value: ms(fold.overall[op].p95Ms) },
      { label: `${op} panggilan`, value: int(fold.overall[op].calls) },
    ]),
    columns: [COMMON.dayColumn, ...CHAT_OP_ORDER.map((op) => `${op} p95`)],
    rows: fold.buckets.map((b, i) => [b, ...CHAT_OP_ORDER.map((op) => ms(fold.p95[op][i]))]),
    notes: [...CHAT.latencyNotes],
  };
}

function healthFacts(data: ChatData): PanelFacts {
  const fold = healthFold(data.health);
  return {
    title: CHAT.healthTitle,
    purpose:
      'Run yang tidak sampai ke layar. Satu-satunya tempat beat yang jatuh karena gagal ' +
      'validasi bisa dibedakan dari sutradara yang memang memutuskan diam.',
    headline: [
      { label: CHAT.healthKpi.dropped, value: int(fold.dropped) },
      { label: CHAT.healthKpi.fallback, value: pct(fold.fallbackRate, '(belum ada run selesai)') },
      { label: 'Rencana fallback', value: int(fold.fallbackPlans) },
      { label: CHAT.healthKpi.stuck, value: int(fold.stuck) },
      { label: 'Beat direncanakan', value: int(data.health.beatsPlanned) },
      { label: 'Gelembung tersimpan', value: int(data.health.bubbles) },
    ],
    columns: [CHAT.healthColumns.status, CHAT.healthColumns.runs, CHAT.healthColumns.stuck],
    rows: fold.statuses.map((s) => [s.status, int(s.runs), int(s.stuck)]),
    notes: [
      ...CHAT.healthNotes,
      /*
       * `[R19]` grants one beat two bubbles, so the raw difference is signed. The TILE
       * clamps at zero; the block says which side it fell on, because a model told only
       * the clamped number could read "0 dropped" as "validation never fails" when the
       * truth is "readers said more than they were asked to".
       */
      fold.droppedRaw < 0
        ? `Selisih mentahnya ${int(fold.droppedRaw)}: gelembungnya LEBIH BANYAK daripada beatnya, yang sah karena satu beat boleh menghasilkan dua gelembung. Tidak ada beat yang jatuh dalam rentang ini.`
        : `Selisih mentahnya ${int(fold.droppedRaw)} dan tidak dijepit.`,
    ],
  };
}

function chatQuotaFacts(data: ChatData): PanelFacts {
  const ceilings = _ceilings();
  const chatUsed = data.chatPeak?.calls ?? null;
  const fleetUsed = data.fleetPeak?.calls ?? null;
  return {
    title: CHAT.quotaTitle,
    purpose:
      'Apakah obrolan pernah mendekati sub-anggarannya, dan berapa porsinya di dalam ' +
      'jendela armada. Ini yang membuat janji "run obrolan tidak boleh membuat bacaan gagal" ' +
      'bisa diperiksa.',
    headline: [
      { label: CHAT.quotaChatLabel, value: int(chatUsed, '(tidak ada data)') },
      { label: 'Batas obrolan', value: int(ceilings.chat) },
      { label: CHAT.quotaFleetLabel, value: int(fleetUsed, '(tidak ada data)') },
      { label: 'Batas armada', value: int(ceilings.hard) },
      {
        label: CHAT.quotaShare,
        value:
          chatUsed === null || fleetUsed === null || fleetUsed === 0
            ? '(tidak ada data)'
            : pct(chatUsed / fleetUsed),
      },
    ],
    columns: [],
    rows: [],
    notes: [
      OVERVIEW.meterCaveat,
      ...CHAT.quotaNotes,
      chatUsed === null
        ? 'Puncaknya null: itu berarti TIDAK ADA DATA, bukan nol panggilan. Jangan bilang kuota aman kalau angkanya null.'
        : 'Jendela 5 jam berjalan, bukan hari kalender.',
    ],
  };
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/**
 * The two loaders, keyed by the page whose composite they run.
 *
 * **NOT ONE LOADER WITH A UNION RETURN.** The route picks by the panel's `page`, so a
 * renderer can only ever be handed the shape its own loader produced — and the compiler
 * checks that pairing, which is the whole reason the registry is two records rather
 * than one with a `data: unknown`.
 */
const OVERVIEW_PANELS = {
  'overview.quota': quotaFacts,
  'overview.kpis': kpiFacts,
  'overview.calls': callsFacts,
  'overview.services': serviceFacts,
  'overview.ttft': ttftFacts,
  'overview.status': statusFacts,
} as const satisfies Record<string, (data: OverviewData, range: Range) => PanelFacts>;

const TOKEN_PANELS = {
  'tokens.io': ioFacts,
  'tokens.cache': cacheFacts,
  'tokens.trajectory': trajectoryFacts,
  'tokens.ops': opFacts,
  'tokens.league': leagueFacts,
  'tokens.models': modelFacts,
  'tokens.heat': heatFacts,
} as const satisfies Record<string, (data: TokensData, range: Range) => PanelFacts>;

/**
 * **A THIRD RECORD AND A THIRD LOADER, MIRRORING THE TWO ABOVE.** F7, v0.7.0.
 *
 * All NINE panels get a button, and the binding argument is not symmetry: `panels.test.ts`
 * asserts an EQUALITY between the ids a page mounts and the ids the registry declares. A
 * page with a box on six of nine forces that assertion down to a subset check, and a
 * subset check cannot see a renderer with no button (dead code that reads as a shipped
 * panel) or a button with no renderer (a 404 under a control that looks live).
 * **Weakening a fence to allow a design choice is how this codebase loses fences**, and
 * the cost of keeping it is three renderers nobody presses.
 */
const CHAT_PANELS = {
  'chat.reply': replyFacts,
  'chat.runs': runsFacts,
  'chat.beats': beatsFacts,
  'chat.cast': castFacts,
  'chat.intent': intentFacts,
  'chat.tokens': chatTokensFacts,
  'chat.latency': chatLatencyFacts,
  'chat.health': healthFacts,
  'chat.quota': chatQuotaFacts,
} as const satisfies Record<string, (data: ChatData, range: Range) => PanelFacts>;

export type OverviewPanelId = keyof typeof OVERVIEW_PANELS;
export type TokenPanelId = keyof typeof TOKEN_PANELS;
export type ChatPanelId = keyof typeof CHAT_PANELS;
export type PanelId = OverviewPanelId | TokenPanelId | ChatPanelId;

/** The ids each page mounts, in render order. **The page imports these** rather than
 *  spelling its own strings, so `panels.test.ts`'s grep and the registry cannot drift
 *  in spelling — only in membership, which is what the grep is for. */
export const OVERVIEW_PANEL_IDS = Object.keys(OVERVIEW_PANELS) as OverviewPanelId[];
export const TOKEN_PANEL_IDS = Object.keys(TOKEN_PANELS) as TokenPanelId[];
export const CHAT_PANEL_IDS = Object.keys(CHAT_PANELS) as ChatPanelId[];
export const PANEL_IDS: PanelId[] = [
  ...OVERVIEW_PANEL_IDS,
  ...TOKEN_PANEL_IDS,
  ...CHAT_PANEL_IDS,
];

/** Runtime narrowing for the route's body, which arrives as `unknown`. */
export function isPanelId(value: unknown): value is PanelId {
  return typeof value === 'string' && (PANEL_IDS as string[]).includes(value);
}

/**
 * One renderer, by id, against data the caller already has. **PURE.**
 *
 * The annotation on each lookup is load-bearing: indexing a record with a UNION key
 * gives a union of function types, and a renderer that ignores `range` has arity 1 — so
 * the union's call signature takes one argument and `(data, range)` is a compile error
 * on a call that is perfectly sound. Naming the wider type accepts every member, because
 * a function of fewer parameters is assignable to one of more.
 */
export function overviewFacts(panel: OverviewPanelId, data: OverviewData, range: Range): PanelFacts {
  const render: (d: OverviewData, r: Range) => PanelFacts = OVERVIEW_PANELS[panel];
  return render(data, range);
}

export function tokenFacts(panel: TokenPanelId, data: TokensData, range: Range): PanelFacts {
  const render: (d: TokensData, r: Range) => PanelFacts = TOKEN_PANELS[panel];
  return render(data, range);
}

export function chatFacts(panel: ChatPanelId, data: ChatData, range: Range): PanelFacts {
  const render: (d: ChatData, r: Range) => PanelFacts = CHAT_PANELS[panel];
  return render(data, range);
}

/**
 * Load and render one panel's facts.
 *
 * **Handle first**, and the handle is `withAdminRead`'s transaction: this issues eight
 * or six SELECTs and nothing else, so it belongs inside the read-only block. The WRITE
 * that follows cannot be — see `queries/admin/insights.ts`.
 */
export async function panelFacts(
  db: DbOrTx,
  panel: PanelId,
  range: Range,
): Promise<PanelFacts> {
  /*
   * The annotations are load-bearing. Indexing the record with a UNION key gives a
   * union of function types, and a renderer that ignores `range` has arity 1 — so the
   * union's call signature takes one argument and `(data, range)` is a compile error on
   * a call that is perfectly sound. Naming the wider type is what accepts every member,
   * because a function of fewer parameters is assignable to one of more.
   */
  if (panel in OVERVIEW_PANELS) {
    return overviewFacts(panel as OverviewPanelId, await loadOverview(db, range), range);
  }
  if (panel in TOKEN_PANELS) {
    return tokenFacts(panel as TokenPanelId, await loadTokens(db, range), range);
  }
  return chatFacts(panel as ChatPanelId, await loadChat(db, range), range);
}

// ---------------------------------------------------------------------------
// What the PAGE needs: the stored row, plus whether it still describes the numbers
// ---------------------------------------------------------------------------

/** What one `InsightBox` is handed. `null` is the empty state — no button copy changes,
 *  no timestamp, no box. */
export type InsightState = {
  body: string;
  /** ISO. **The server never formats a date for a client component** — see `stamp()`. */
  updatedAt: string;
  /** The facts have moved since this prose was written. The prose still renders. */
  stale: boolean;
} | null;

/**
 * Decide, for every panel of one page, what its box should show.
 *
 * ── THE STALENESS CHECK IS DONE HERE AND NOT IN SQL ────────────────────────
 *
 * It cannot be: it compares a stored hash against a hash of numbers that only exist
 * once the rollup has been rendered into facts. The page already holds that rollup, so
 * this costs one serialization and one sha256 per panel THAT HAS A ROW — panels with no
 * insight are skipped entirely, which is every panel on a range nobody has pressed a
 * button on.
 *
 * **A ROW WHOSE HASH HAS MOVED IS RENDERED, FLAGGED, AND NEVER HIDDEN.** Off means
 * "write nothing new", never "hide what exists" — `sharingEnabled()`'s rule, and the
 * same reason `/api/memory/*` serves its cached row before it 204s.
 *
 * ── A RANGE ENDING TODAY IS NEVER FLAGGED, AND A LIVE RUN IS WHAT FOUND IT ──
 *
 * **PRESSING THE BUTTON CHANGES THE PANEL IT DESCRIBES.** An insight is a model call
 * with `op: 'insight'` and today's `local_date`, so the `llm_calls` row it writes lands
 * inside any range ending today — which is nine of the thirteen panels and the default
 * filter. Measured 2026-07-31 against the dev database: press, reload, and the box read
 * *"the numbers have changed"* under prose written four seconds earlier, because the
 * total had gone 53 → 54 and the fifty-fourth call was the press.
 *
 * Three fixes were available and two are worse:
 *
 *   - **Exclude `op: 'insight'` from the metric queries.** It would work and it undoes
 *     the entire argument for spending the tenth `op` — the dashboard has to be able to
 *     say what its own button costs. It is also an edit to `queries/admin/**`, which is
 *     A3's by §7.
 *   - **Drop the flag.** Then a settled month's insight can be silently wrong about a
 *     range that was backfilled or corrected, which is the case the flag exists for.
 *   - **Only flag a CLOSED range**, which is what ships. The question the flag answers
 *     is *"has a settled period been re-measured since this was written?"* — and a range
 *     ending today is not settled by anybody's definition. It moves whenever a querent
 *     takes a reading, so the flag would be noise there even if the button cost nothing.
 *     **The timestamp is what does the work on a live range**, which is what it is for.
 *
 * `today` is threaded from the page rather than read here, because `todayUtc()` is
 * called ONCE PER REQUEST at the top of a page — CLAUDE.md's rule, and this function
 * runs during render.
 */
function statesFor<K extends string, D>(
  panels: Record<K, (data: D, range: Range) => PanelFacts>,
  data: D,
  range: { from: string; to: string; days: number },
  stored: Map<string, StoredInsight>,
  today: string,
): Record<K, InsightState> {
  const out = {} as Record<K, InsightState>;
  const settled = range.to < today;
  for (const key of Object.keys(panels) as K[]) {
    const row = stored.get(key);
    if (!row) {
      out[key] = null;
      continue;
    }
    const stale =
      settled && insightInputHash(serializePanelFacts(panels[key](data, range), range)) !== row.inputHash;
    out[key] = { body: row.body, updatedAt: row.updatedAt.toISOString(), stale };
  }
  return out;
}

export function overviewInsightStates(
  data: OverviewData,
  range: { from: string; to: string; days: number },
  stored: Map<string, StoredInsight>,
  today: string,
): Record<OverviewPanelId, InsightState> {
  return statesFor(OVERVIEW_PANELS, data, range, stored, today);
}

export function tokenInsightStates(
  data: TokensData,
  range: { from: string; to: string; days: number },
  stored: Map<string, StoredInsight>,
  today: string,
): Record<TokenPanelId, InsightState> {
  return statesFor(TOKEN_PANELS, data, range, stored, today);
}

export function chatInsightStates(
  data: ChatData,
  range: { from: string; to: string; days: number },
  stored: Map<string, StoredInsight>,
  today: string,
): Record<ChatPanelId, InsightState> {
  /*
   * ── `[F7-9]`: A PRESS MOVES EXACTLY ONE PANEL HERE, AND `statesFor` ALREADY
   *    HANDLES IT ──────────────────────────────────────────────────────────
   *
   * A7 measured that the button's own `llm_calls` row — `op: 'insight'`, today's
   * `local_date` — lands inside any range ending today, so nine of thirteen panels
   * described themselves changing. On this page **seven of the nine filter to
   * `op in ('chat_plan','chat_turn')` and are structurally insulated**; only
   * `chat.quota`'s fleet meter counts every call and therefore moves.
   *
   * `settled = range.to < today` is unchanged and is still the whole fix. **Re-deriving
   * it here as "exclude `op:'insight'` from the chat queries" would be a NO-OP that
   * reads as a fix** — and `panels.ts`'s own record of that exclusion as a REJECTED
   * route (for a different reason) is how a second, differently-argued exclusion undoes
   * the first.
   */
  return statesFor(CHAT_PANELS, data, range, stored, today);
}

/** The three data shapes, exported so each page can declare that what it already loaded
 *  IS what the renderers take — a compile error rather than a runtime surprise the day
 *  a page's composite and a loader here drift apart. */
export type { OverviewData, TokensData, ChatData };
