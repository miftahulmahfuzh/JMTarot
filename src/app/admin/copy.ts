/**
 * Every user-visible string on `/admin` and `/admin/tokens`. **Indonesian, hardcoded, never
 * the i18n catalog** (A-D12).
 *
 * ── WHY NOT THE CATALOG ─────────────────────────────────────────────────────
 *
 * R33 corrects A-D12's stated reason while keeping the rule. The claimed saving --
 * *"the catalog ships to the browser as JSON on every page"* -- **does not exist**:
 * `LocaleProvider` is mounted in the root layout, so the catalog already ships here. The
 * real reasons are the authoring cost of ~150 strings in two locales for a surface with
 * exactly one reader, and that `id.ts` OWNS THE KEY SET -- so every admin string would force
 * an English twin somebody has to write and keep true.
 *
 * **So the `t()` grep in `adminSurface.test.ts` and `adminCopy.test.ts` is the WHOLE
 * enforcement, not a belt on a stronger argument.** It must not be described as defence in
 * depth, because that is how a reviewer concludes it is redundant.
 *
 * ── INDONESIAN PROSE, ENGLISH TERMS OF ART ──────────────────────────────────
 *
 * `token`, `p95`, `input`, `output`, `uplift`, `op`, `model` stay English, because that is how
 * the language is actually spoken about software. A-D12 names the failure mode: pretending
 * otherwise produces `keluaran token` on a chart axis.
 *
 * `## Copy constraints` binds the READER-FACING half of this app and not this file -- there
 * is no reader here and no persona -- but the Indonesian-not-Malay rule is about the language
 * itself and applies everywhere: `karier` not `kerjaya`, `kamu` not `awak`. Nothing below is
 * addressed to a querent, so the second person barely appears.
 */

/** Shared by both pages: the frame's furniture and the words a primitive cannot spell. */
export const COMMON = {
  tableToggle: 'Lihat tabel',
  /*
   * The day column's header. **A table's `<caption>` is already the chart's title, so a
   * first column labelled with that title prints it TWICE** -- seen at 1440 in
   * `/tmp/admin-1440.png`, where "PANGGILAN MODEL PER HARI" appeared as the caption and
   * again as the header of the column holding dates. Only a screenshot shows that.
   */
  dayColumn: 'Hari',
  emptyCell: '—',
  /** For a table row whose `user_id` is NULL. See `format.shortId`. */
  unattributed: '(terhapus / sistem)',
  chartFailed: 'Angka ini tidak bisa dibaca sekarang.',
  chartFailedDetail: 'Kueri melewati batas waktu atau basis data tidak menjawab. Muat ulang halaman.',
  loading: 'Memuat…',
  /** The range filter. */
  rangeLabel: 'Rentang',
  rangeDays: (n: number) => `${n} hari`,
  rangeCustom: 'Rentang lain',
  rangeFrom: 'Dari',
  rangeTo: 'Sampai',
  rangeApply: 'Terapkan',
  rangeFellBack: 'Rentang di URL tidak bisa dipakai, jadi ini rentang bawaan.',
  rangeShown: (from: string, to: string) => `${from} – ${to}`,
} as const;

/**
 * `/admin` -- "is anything wrong right now".
 *
 * The hero is CALLS-IN-WINDOW over 280 and not notional spend (R14). Its label says
 * *rolling five hours* out loud, because that window is the one counter in this app that is
 * not the querent's calendar day and every reader will assume "today" unless told.
 */
export const OVERVIEW = {
  title: 'Ringkasan',
  heroLabel: 'Puncak 5 jam berjalan',
  heroSub: (calls: string, ceiling: string, pct: string) => `${calls} / ${ceiling} · ${pct}`,
  /**
   * R26's optimism sentence, and **it goes on the page rather than only in the plan**.
   * Three reasons the ledger is a LOWER bound on what Redis holds: the write is inside
   * `after()`, which is not a guarantee; `reserveModelCall` charges the window *before* the
   * call, so a call that then throws charged it anyway; and this can only see windows that
   * ended inside the range.
   */
  meterCaveat:
    'Angka ini batas bawah: pencatatan berjalan setelah respons, dan kuota sudah terpotong ' +
    'sebelum panggilan dijalankan. Kalau meleset, arahnya selalu terlalu rendah.',
  meterStates: {
    0: { icon: '●', label: 'Aman' },
    1: { icon: '◆', label: 'Naik' },
    2: { icon: '▲', label: 'Perlu dilihat' },
    3: { icon: '■', label: 'Kritis' },
  },
  kpi: {
    spend: 'Biaya notional',
    /**
     * A-D7: **a cost is never quoted over an incomplete denominator.** `NOTIONAL_MODEL` is
     * deliberately unset today, so `notionalUsd()` returns null and this is what the tile
     * says -- an honest empty state, committed on day one rather than drifted into.
     */
    spendUnpriced: (n: string) => `${n} panggilan belum berharga`,
    spendUnset:
      'Belum berharga: harga provider cadangan belum pernah dibaca orang (prices.ts, NOTIONAL_MODEL).',
    calls: 'Panggilan model',
    tokens: 'Token (input + output)',
    /** z.ai returns `input_tokens: 0`, stored NULL, so this column is structurally
     *  half-blind on the current provider and the tile has to say so. */
    tokensNullNote: (n: string) => `${n} panggilan tanpa laporan token`,
    readings: 'Bacaan selesai',
    p95: 'p95 panggilan bacaan',
    p95Note: 'Total waktu panggilan, bukan waktu ke token pertama.',
    deltaVs: (days: number) => `vs ${days} hari sebelumnya`,
  },

  callsTitle: 'Panggilan model per hari',
  callsSubtitle: 'Dikelompokkan per hari UTC — ini seri yang sebanding dengan kuota.',
  callsSeries: 'Panggilan',
  callsHoverLabel: 'Geser untuk membaca angka per hari',

  /**
   * §6.1 row 4, retitled for what it actually counts: `ttftByService` counts rows in
   * `readings`, not model calls, and the two differ in both directions -- a blocked reading
   * makes no call at all, and one reading makes several.
   *
   * **THERE IS NO `readerTitle`, AND ITS ABSENCE IS THE RECORD.** §6.1 row 5 asked for
   * "which reader is consuming the calls"; A3's catalogue has no per-reader aggregate --
   * `readings.reader_id` exists and nothing groups by it -- and `queries/admin/**` is A3's by
   * §7. A copy key for a card that does not exist is how a future session concludes one
   * shipped and goes looking for the bug.
   */
  serviceTitle: 'Bacaan per layanan',
  /**
   * R25 reaching the screen: a fleet-wide `local_date` bucket **sums two calendar systems**,
   * because a call with no querent behind it stores the UTC date. Stated on the chart and not
   * only in A3's metric catalogue -- an unstated mixture is how a number becomes untrustworthy
   * later.
   */
  querentDayCaveat:
    'Hari penanya. Panggilan tanpa penanya (perbaikan latar) memakai hari UTC, jadi seri ini ' +
    'mencampur dua kalender.',

  statusTitle: 'Bagaimana panggilan berakhir',
  /**
   * §1.6: five statuses, four palette slots, and §5.2 proves a four-hue traffic light is
   * unbuildable on this canvas. So this is a TABLE and takes no colour at all.
   */
  statusSubtitle: 'Tabel, bukan grafik: lima status tidak punya lima warna yang bisa dibedakan.',
  statusColumns: { op: 'Op', failed: 'Gagal', aborted: 'Ditinggalkan', calls: 'Total' },

  readingsSubtitle:
    'Dari tabel readings, bukan dari ledger: bacaan yang ditolak moderasi tidak memanggil model ' +
    'dan tetap terjadi.',
} as const;

/** `/admin/tokens` -- "where is this going". No hero: the trajectory is the lead. */
export const TOKENS = {
  title: 'Token',

  ioTitle: 'Input vs output per hari',
  /** Two series, ONE axis: they share a unit (A-D11, I-7). */
  ioSubtitle: 'Dua seri, satu sumbu — keduanya token.',
  ioInput: 'Input',
  ioOutput: 'Output',
  ioHoverLabel: 'Geser untuk membaca token per hari',
  /**
   * **THE OLD TEXT SAID THE INPUT SERIES WAS STRUCTURALLY BLIND ON z.ai, AND THAT WAS
   * NEVER TRUE** -- `anthropic.ts` read the count from the wrong SSE event. Corrected
   * 2026-07-30. The count itself stays on screen: it is still the honest denominator,
   * it is just no longer nearly every row.
   */
  ioNullNote: (n: string) => `${n} panggilan tidak melaporkan token sama sekali.`,
  /**
   * The cache-hit rate, over MEASURED rows only.
   *
   * Worth a line of its own because a prompt-layer change can destroy cache locality
   * without moving the token chart at all -- and on a per-token provider a cache read
   * bills at a fraction of a fresh one.
   */
  cacheTitle: 'Prompt dari cache',
  cacheRate: (pct: string) => `${pct} token input dilayani dari cache`,
  cacheBasis: (n: string) => `Dihitung dari ${n} token input yang melaporkan angka cache.`,
  /**
   * **AN EMPTY STATE, NEVER "0%".** A range with no measured rows -- anything before
   * 2026-07-30 -- has no rate to report, and 0% would read as "caching is not
   * working", which is a different and false claim.
   */
  cacheUnmeasured: 'Belum ada panggilan yang melaporkan angka cache dalam rentang ini.',

  trajectoryTitle: 'Menuju batas kuota',
  trajectorySubtitle: 'Garis putus-putus adalah proyeksi, bukan pengukuran.',
  ceilingLabel: 'Batas',
  /** A-D8: below the minimum n the forecast is **not rendered at all**, and the empty state
   *  says how many more days it needs. */
  trajectoryInsufficient: (need: number, have: number) =>
    `Belum cukup data untuk memproyeksikan: ada ${have} hari, perlu ${need}. Tunggu ` +
    `${Math.max(0, need - have)} hari lagi.`,
  trajectoryFlat: 'Seri ini datar, jadi tidak ada tren untuk diproyeksikan.',
  /** `n`, R² and `k` travel with the forecast (A-D8, R26). `k` is displayed because one
   *  abusive script shifts it with no visible change in the daily series at all. */
  trajectoryFootnote: (n: number, r2: string, k: string) =>
    `n = ${n} hari · R² = ${r2} · k (keberkumpulan) = ${k}. Proyeksi memakai OLS dengan band ` +
    'residual 95%; tanggal yang dilaporkan adalah rentang, bukan satu hari.',
  trajectoryCrossing: (earliest: string, central: string) =>
    `Band atas menyentuh batas pada ${earliest}; garis tengah pada ${central}.`,
  trajectoryCrossingEarliestOnly: (earliest: string) =>
    `Band atas menyentuh batas pada ${earliest}; garis tengah belum dalam setahun.`,
  trajectoryNotApproaching: 'Tren sekarang tidak menuju batas.',
  trajectoryAlreadyAbove: 'Proyeksi sudah berada di atas batas.',
  trajectoryBeyond: (days: number) => `Batas tidak tersentuh dalam ${days} hari ke depan.`,

  opTitle: 'Biaya per keperluan',
  /** §1.5 / R11: nine `op` values is nine, and >7 meaningful classes is a table. */
  opSubtitle: 'Sembilan op adalah tabel, bukan grafik — lebih dari tujuh kelas tidak punya warna.',
  opColumns: {
    op: 'Op',
    calls: 'Panggilan',
    input: 'Input',
    output: 'Output',
    p95: 'p95',
    share: 'Porsi',
  },

  leagueTitle: 'Pengguna dengan token terbanyak',
  /**
   * §1.11: an id prefix and a link, no email and no nickname. A3's `userCostLeague` groups
   * per `(user, model)` because a sum across models is unpriceable -- A-D7 prices per model
   * per period.
   */
  leagueSubtitle:
    'Per (pengguna, model), karena harga dihitung per model. Tanpa email dan tanpa nama — ' +
    'identitas ada di halaman pengguna, yang mencatat setiap pembukaan.',
  leagueColumns: { user: 'Pengguna', model: 'Model', calls: 'Panggilan', tokens: 'Token' },
  /** A consequence A3 requires the page to state: a hard delete moves history from an
   *  attributed row to an unattributed one, so cost-per-user denominators shift over time. */
  leagueCaveat:
    'Penghapusan akun memindahkan riwayat ke baris tanpa atribusi, jadi pembagi "per pengguna" ' +
    'menyusut dari waktu ke waktu.',

  modelsTitle: 'Model yang berjalan',
  modelsSubtitle: 'Yang belum punya baris harga muncul di sini — perbaikannya lima menit.',
  modelsColumns: { model: 'Model', calls: 'Panggilan', firstSeen: 'Pertama terlihat', priced: 'Harga' },
  modelPriced: 'ada',
  modelUnpriced: 'belum ada',

  /**
   * ── THE HEATMAP SHIPS AS WEEKDAY x WEEK, NOT WEEKDAY x HOUR, AND THAT IS AN
   *    IMPROVEMENT RATHER THAN A CONCESSION ─────────────────────────────────
   *
   * §5.3 asked for *"readings per weekday x hour"*. §1.7 established that the hour half is
   * **not derivable from `llm_calls`**: `local_date` is a date with no time and `created_at`
   * is UTC, so a querent's local hour does not exist in the ledger. R12 ruled it ships
   * *"Jakarta-pinned with the axis LABELLED as such, or not at all"*, and §10 asked A3 for a
   * `heatCells(db, range)` doing `created_at AT TIME ZONE 'Asia/Jakarta'`.
   *
   * **A3 shipped no such query**, and `src/lib/db/queries/admin/**` is A3's by §7. Adding a
   * file there is precisely the unlisted cross-workstream edit §6 exists to prevent -- A1
   * declined to touch `scripts/audit-secrets.ts` on that rule and reconciliation granted it
   * rather than blessing the edit after the fact.
   *
   * So the hour axis is **not built**, and it is recorded as a stated gap (R24's precedent:
   * *the honest form of a known gap is preferred to a silent one*). What ships instead is the
   * half §1.7 itself calls exact -- *"weekday comes from `local_date` (correct, no zone
   * involved)"* -- crossed with the ISO week: a calendar heatmap over the range, derived in
   * `metrics.ts` from A3's dense daily series with **no new query, no approximation and no
   * label narrowing a claim.**
   *
   * It answers a slightly different question -- "which days are busy" rather than "which
   * hours" -- and answers it truthfully. The hour version needs a column nobody has asked
   * for, or A3's next commit.
   */
  heatTitle: 'Kapan app dipakai',
  heatSubtitle:
    'Hari dalam seminggu (dari hari penanya, tanpa zona waktu) per pekan. Versi per jam butuh ' +
    'kueri yang belum ada — jam lokal penanya tidak tersimpan di ledger.',
  heatCell: (day: string, week: string, calls: string) => `${day}, pekan ${week} — ${calls} panggilan`,
  heatScaleMin: '1',
  heatWeekdays: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
} as const;
