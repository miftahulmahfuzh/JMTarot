/**
 * Every user-visible string on `/admin`, `/admin/tokens` and `/admin/chat`. **Indonesian,
 * hardcoded, never the i18n catalog** (A-D12).
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
  /*
   * `ScrollTop`'s accessible name. **A LABEL, NOT A DESCRIPTION** -- it says what the
   * control does, in the active voice, and it keeps that name wherever the button
   * appears. The button has no visible text; this is the whole of its name.
   */
  toTop: 'Ke atas halaman',
} as const;

/**
 * The insight box, on all thirteen subpanels of both pages. **A7, 2026-07-31.**
 *
 * ── ONE COPY BLOCK FOR THIRTEEN PANELS, AND THAT IS THE DESIGN ─────────────
 *
 * Nothing here names a panel. `InsightBox` takes the panel id as a prop and the id
 * never reaches the screen -- what the operator reads is this vocabulary, identically,
 * everywhere. Thirteen per-panel button labels would be thirteen strings to keep in
 * step for a control that does the same thing in every one of them.
 *
 * ── THE BUTTON CHANGES ITS WORD ONCE THERE IS AN INSIGHT ───────────────────
 *
 * `generate` -> `regenerate`. Pressing it the second time SPENDS A MODEL CALL on numbers
 * that may not have moved, so the label has to say that it is a fresh reading rather
 * than a reveal. The stale line is the other half: it is what tells the operator the
 * press is worth making.
 *
 * ── EVERY FAILURE IS A SENTENCE, AND THE SET IS CLOSED ─────────────────────
 *
 * `StatusControl`'s rule, for its reason: *"the toggle did nothing"* is the state in
 * which somebody starts editing rows by hand. `ceiling` is the one that is not a
 * failure at all -- the fleet-wide limiter shedding an operator convenience before a
 * querent's reading, exactly as designed -- so it says so rather than apologising.
 */
export const INSIGHT = {
  /** The `<h3>` over the box. Also the accessible label the button is described by. */
  heading: 'Insight',
  generate: 'Insight',
  regenerate: 'Perbarui insight',
  pending: 'Menyusun…',
  /** `stamp()` supplies the datetime; the zone is in the label because the formatter
   *  is pinned to Jakarta and a time with no zone invites the wrong arithmetic. */
  updatedAt: (when: string) => `Terakhir diperbarui ${when} WIB`,
  /**
   * The stale line. **The prose stays on screen underneath it** -- hiding it would be a
   * kill switch blanking a screen, which this project rules against everywhere else.
   *
   * **IT ONLY EVER APPEARS ON A CLOSED RANGE**, and `insight/panels.ts` carries the
   * measurement that made that rule: an insight is itself a model call dated today, so
   * on a range ending today the button invalidates its own hash within the second, and
   * this sentence would render under prose four seconds old. On a live range the
   * timestamp is what tells the operator how old the reading is.
   */
  stale: 'Angka di panel ini sudah berubah sejak insight ini dibuat.',
  /** Screen-reader only: the box fills in after a press, and a live region is what
   *  announces it without moving focus off the button. */
  liveLabel: 'Hasil insight',
  error: {
    failed: 'Model tidak menjawab. Coba lagi.',
    ceiling:
      'Kuota panggilan model sedang hampir habis, jadi permintaan ini dilewati lebih dulu ' +
      'supaya bacaan penanya tidak ikut kena. Coba lagi nanti.',
    empty: 'Model mengembalikan jawaban kosong. Coba lagi.',
    'too-long': 'Jawaban model terlalu panjang untuk kotak ini, jadi tidak disimpan.',
    format:
      'Model menjawab dengan format daftar atau markdown, bukan paragraf, jadi tidak disimpan.',
    /** The anti-recital refusal. **The copy names what the model did rather than blaming
     *  it**, because the operator's next move is simply to press again — and if it keeps
     *  happening the fix is `INSIGHT_SYSTEM`, which this sentence is the signal for. */
    tally:
      'Model hanya membacakan ulang angka di tabel, bukan menyimpulkan sesuatu, jadi tidak ' +
      'disimpan. Coba lagi.',
    unavailable: 'Angkanya tidak bisa dibaca sekarang. Muat ulang halaman.',
    /** The client's own bound fired (§4.2's pairing) or the browser is offline. **A
     *  TIMEOUT IS THE ONE OUTCOME THAT MEANS UNKNOWN**, so the copy says the request may
     *  have completed rather than telling the operator it failed. */
    timeout:
      'Permintaan melewati batas waktu. Mungkin sudah jadi di server — muat ulang halaman ' +
      'sebelum mencoba lagi.',
  },
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
    /** Calls whose provider reported no tokens at all. **No longer nearly every row**
     *  -- see `types.ts`'s ReadingUsage -- but still the denominator a total needs
     *  beside it, so the tile keeps saying so. */
    tokensNullNote: (n: string) => `${n} panggilan tanpa laporan token`,
    readings: 'Bacaan selesai',
    p95: 'p95 panggilan bacaan',
    p95Note: 'Total waktu panggilan, bukan waktu ke token pertama.',
    /**
     * **THE TTFT TILE SITS BESIDE THE `p95` TILE, AND THAT IS WHAT MAKES `p95Note` TRUE.**
     * That note has always said *"bukan waktu ke token pertama"*; until this tile shipped it
     * denied a quantity nothing on the page rendered, which is a fact with nowhere to land.
     * Two tiles, two provenances, one screen -- `readings.latency_ms` here and
     * `llm_calls.total_ms` there, the seam R5 forbids reconciling.
     */
    ttftP95: 'p95 TTFT bacaan',
    ttftNote: 'Waktu ke token pertama — yang benar-benar ditunggu penanya. Makin kecil makin baik.',
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

  /**
   * ── THE CARD THAT ANSWERS "APA PENGALAMAN PENANYA" ──────────────────────────
   *
   * **A TABLE, and the reason is the same shape as §1.6's for `statusTitle`.** Two primitives
   * could have drawn it and both would have lied: `StackedBar` normalises every row to 100% of
   * its OWN total (`stackSegments`), so three bars of duration would all fill the width and be
   * mutually uncomparable; and `Meter` needs a ceiling, i.e. a TTFT target nobody has set, and
   * its fill runs a good→critical ramp. Inventing a target to earn a colour is `NOTIONAL_MODEL`
   * printing `US$0,00` under the word "notional" -- a judgement wearing a measurement's
   * clothes.
   *
   * **`ttftTotal` IS THE ROLLUP'S OWN ROW AND NEVER A SUM OF THE THREE ABOVE IT.** A fleet p95
   * is not the mean of three service p95s; `ttftOverall` returns the row Postgres computed over
   * the whole population, or nothing.
   */
  ttftTitle: 'Waktu ke token pertama',
  ttftSubtitle:
    'Dari readings.latency_ms — jeda antara penanya menekan tombol dan huruf pertama muncul. ' +
    'Bacaan itu streaming, jadi ini ukuran pengalamannya, bukan lama panggilan model.',
  ttftColumns: { service: 'Layanan', readings: 'Bacaan', p50: 'p50', p95: 'p95' },
  /** The fleet row's label in the table. Not "Total": the number is a percentile, and a
   *  reader who sees "Total" over a duration column reads it as a sum. */
  ttftTotal: 'Semua layanan',
  /**
   * The card's own two tile labels, **unqualified on purpose**. `kpi.ttftP95` says *"p95 TTFT
   * bacaan"* because it sits in the overview's KPI row between notional spend and a call
   * duration, where "bacaan" is what distinguishes it. Inside a card already titled *"Waktu ke
   * token pertama"* the word is redundant -- and reusing the KPI key here rendered the pair as
   * `p50 TTFT` beside `p95 TTFT bacaan`, an asymmetry visible in one screenshot and in no test.
   */
  ttftP50: 'p50 TTFT',
  ttftP95: 'p95 TTFT',

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
  /**
   * §1.5 / R11: >7 meaningful classes is a table.
   *
   * **THE WORD WENT `Sembilan` -> `Sepuluh` ON 2026-07-31**, when A7 spent the tenth
   * `op` on `insight`. Counted in words rather than interpolated from `OP_ORDER.length`
   * on purpose: the sentence is an argument about why this card is a table, not a
   * readout, and a number that moved itself would stop anybody noticing that the
   * argument had been re-made.
   *
   * **AND IT WENT `Sepuluh` -> `Tiga belas` ON 2026-08-07** — `blog_format` had already
   * made it eleven the same day `insight` made it ten and this sentence missed it, then
   * v0.7.0 spent two more on the group chat. **So the argument is re-made and it is no
   * longer a close call**: at ten it was §5.3's *"more than ~7 meaningful classes"* by a
   * margin, at thirteen a chart of it would need thirteen distinguishable hues on a
   * canvas §5.2 measured as unable to carry four. The word being stale for a whole
   * release is also the case for `ops.ts` existing.
   *
   * **AND `Tiga belas` -> `Empat belas` ON 2026-08-30**, when R2's profile-memory
   * extractor spent the fourteenth. The argument does not need re-making at this size --
   * §5.2 measured this canvas as unable to carry four distinguishable hues and this is
   * fourteen -- but the word is updated in the same commit as `OP_ORDER`, because the
   * whole reason it is a word and not an interpolation is that a stale one is supposed
   * to be visible.
   */
  opSubtitle: 'Empat belas op adalah tabel, bukan grafik — lebih dari tujuh kelas tidak punya warna.',
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
  /**
   * A linked row's accessible name. **The visible row is an id prefix, a bar and a number**, so
   * a screen reader announcing it as a link reads out eight hex characters and a figure -- true,
   * and useless as a destination. This says where the row goes and that the window follows.
   */
  leagueRowLink: (user: string, model: string) =>
    `Buka halaman pengguna ${user} (${model}) di bagian konsumsi token, rentang tanggal yang sama`,
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

/**
 * `/admin/chat` -- "is the room alive". **F7, v0.7.0.**
 *
 * ── THIS PAGE MEASURES; IT NEVER RESTRAINS (`[F7-1]`) ───────────────────────
 *
 * Miftah's requirement 9 asks for the chat's token consumption to be visible and, in the
 * same breath, forbids stinting on it. There is no cap here, no kill switch and no budget
 * control -- v0.5.0 §1 already settled the general form (*"Not a cost cap or a kill switch.
 * v0.5.0 **observes**"*) and F7 inherits it unchanged. The one restraint in this release is
 * `LLM_WINDOW_CHAT_CEILING`, and its reason is `C-D6` (a chat run must never be why a
 * reading fails), not money.
 *
 * ── THE `CATATAN DARI PANEL` STRINGS ARE READ TWICE, DELIBERATELY ───────────
 *
 * Each panel's `notes` array is the `footnote` the operator reads AND the `notes` block
 * `insight/panels.ts` hands the model. One definition, so the chart and the box cannot
 * disagree about a caveat -- which is the same reason every renderer there formats its
 * numbers with `../format`, the functions the panel itself used.
 *
 * Terms of art stay English (A-D12): `token`, `op`, `model`, `p95`, `run`, `beat`,
 * `trigger`, `intent`, `lease`. Nothing on this page addresses a querent, so the second
 * person barely appears.
 */
export const CHAT = {
  title: 'Obrolan',

  // ── P1 · chat.reply -- THE SCORECARD ─────────────────────────────────────
  /**
   * `C-N2f`, and roadmap §10.3 calls this the only CONTINUOUS measurement of the release
   * once it has shipped. The blind read (§10.2) is what gates naturalness; this is what
   * says, a week later, whether the room is alive.
   */
  replyTitle: 'Balasan proaktif',
  replySubtitle:
    'Apakah penanya menjawab pesan yang tidak ia minta, dalam 24 jam. Papan skor rilis ini.',
  replyHeroLabel: 'Dibalas dalam 24 jam',
  /** `heroSub`'s shape, so **the denominator is beside the number** (`[F7-12]`). The
   *  hero needs exactly one disclaimer and this is it -- R14 refused notional spend for
   *  `/admin`'s hero because *"a hero figure needing two disclaimers is a KPI tile"*. */
  replyHeroSub: (replied: string, delivered: string, pct: string) =>
    `${replied} / ${delivered} · ${pct}`,
  replyDelivered: 'Terkirim (jendela tutup)',
  replyReplied: 'Dibalas',
  replyPending: 'Menunggu jendela 24 jam',
  replySeries: { replied: 'Dibalas', silent: 'Tidak dibalas' },
  replyColumns: {
    trigger: 'Trigger',
    delivered: 'Terkirim',
    replied: 'Dibalas',
    pending: 'Menunggu',
    rate: 'Porsi',
  },
  replyNotes: [
    'Penyebutnya hanya run proaktif yang benar-benar menghasilkan gelembung. Run yang sengaja diam (nol beat) dan run yang kehilangan semua beatnya tidak masuk hitungan — dari dalam ruangan keduanya sama-sama sunyi.',
    'Run yang jendela 24 jamnya belum tutup dikeluarkan dari pembilang DAN penyebut, dan dihitung terpisah sebagai "menunggu". Kalau angka menunggu besar, rentangnya terlalu baru untuk dinilai.',
    'Balasan diukur dari pesan penanya berikutnya, bukan dari balasan ke gelembung tertentu. Penanya yang membalas hal lain tetap dihitung membalas.',
    'Angka ini adalah papan skor rilis ini. Kalau turun, yang salah biasanya materi pemicunya, bukan penanyanya.',
  ],

  // ── P2 · chat.runs ───────────────────────────────────────────────────────
  runsTitle: 'Run per hari',
  runsSubtitle: 'Berapa banyak yang dikerjakan ruangan ini, dan berapa yang tanpa diminta.',
  runsSeries: { reactive: 'Dijawab', proactive: 'Proaktif' },
  runsColumns: { day: 'Hari', total: 'Total run' },
  /** The five-way split lives in the TABLE, not in the chart: five entities against four
   *  slots is `[F7-10]`'s wall, and §5.3's ruling for the nine ops is the precedent. */
  triggerLabels: {
    user_message: 'user_message',
    reading_completed: 'reading_completed',
    idle_nudge: 'idle_nudge',
    unanswered: 'unanswered',
    cron: 'cron',
  },
  runsNotes: [
    'Dikelompokkan per hari UTC, satu kalender. Tabel chat tidak menyimpan hari kalender penanya, jadi tidak ada dua kalender yang tercampur di halaman ini.',
    'Satu run bisa menghasilkan nol sampai empat pesan. Ini menghitung RUN, bukan gelembung.',
    'Garis "proaktif" adalah empat trigger dijumlahkan; pecahannya ada di tabel.',
    'Kalau proaktif nol sepanjang rentang, periksa CHAT_PROACTIVE_ENABLED sebelum menyimpulkan apa pun soal aturan kelayakan.',
  ],

  // ── P3 · chat.beats ──────────────────────────────────────────────────────
  beatsTitle: 'Beat per run, dan kesenyapan',
  beatsSubtitle:
    'Sebaran, bukan rata-rata. Rata-ratanya ada di sebelah sebagai pendamping, bukan pengganti.',
  beatsBucket: (n: number) => (n >= 4 ? '4+ beat' : `${n} beat`),
  beatsSilence: 'Kesenyapan',
  beatsMean: 'Rata-rata beat',
  beatsColumns: { bucket: 'Beat', runs: 'Run', share: 'Porsi' },
  beatsNotes: [
    'Nol beat berarti sutradara memutuskan tidak ada yang menjawab. Itu rencana yang sah dan diinginkan — di grup sungguhan pesan memang kadang tidak dijawab.',
    'KESENYAPAN NOL BUKAN KABAR BAIK. Kalau angkanya 0%, sutradaranya tidak benar-benar memutuskan; ia selalu menjawab.',
    'Hanya run yang sudah selesai atau ditinggalkan yang dihitung. Run yang masih berjalan punya rencana, bukan hasil.',
    'Beat yang dijatuhkan setelah dua kali gagal validasi TIDAK terlihat di sini — panelnya ada di "Kesehatan run", dan dari dalam ruangan beat yang jatuh dan keputusan diam tampak sama persis.',
  ],

  // ── P4 · chat.cast ───────────────────────────────────────────────────────
  castTitle: 'Siapa bicara, dan kepada siapa',
  /**
   * **THE SECOND SENTENCE IS THERE BECAUSE OF WHAT A 1440px SHOT SHOWED** (2026-08-08).
   * `StackedBar` normalises every row to 100% of its OWN total, so three readers'
   * bars are all full width and their LENGTHS say nothing about who talks more. That is
   * correct for this panel — the composition inside each bar is the question — but a
   * reader comparing lengths would be reading a fact that is not there, so the total is
   * printed at the end of each row and the card says which one to look at.
   */
  castSubtitle:
    'Warna adalah lawan bicaranya, bukan pembacanya — pembacanya ada di sumbu. Tiap batang ' +
    'dinormalkan ke totalnya sendiri, jadi bandingkan angkanya di ujung, bukan panjangnya.',
  castSeries: { querent: 'Ke penanya', reader: 'Ke pembaca lain', none: 'Tanpa target' },
  castTopShare: 'Porsi pembaca terbanyak',
  castColumns: { reader: 'Pembaca', querent: 'Ke penanya', reader2: 'Ke pembaca lain', none: 'Tanpa target', total: 'Total' },
  castNotes: [
    '"ke pembaca lain" adalah beat yang membalas gelembung pembaca lain. Kalau angkanya nol sepanjang rentang, ruangan ini tiga monolog dan bukan satu grup.',
    '"tanpa target" adalah beat yang tidak membalas apa pun. Itu wajar untuk beat pertama sebuah run dan untuk pesan proaktif.',
    'Satu pembaca di atas ~60% dari seluruh gelembung berarti pengecoran timpang, bukan bahwa pembaca itu lebih baik.',
    'Angka ini menghitung PESAN, bukan run. Satu run bisa memberi dua gelembung kepada satu pembaca yang sama.',
  ],

  // ── P5 · chat.intent ─────────────────────────────────────────────────────
  intentTitle: 'Maksud beat',
  intentSubtitle: 'Urutannya tetap, bukan urutan besar-kecil.',
  intentAskShare: 'Beat bertanya',
  /** A beat whose sheet carried no `intent`. **An empty panel and a mis-keyed query must
   *  not look alike**, which is why this renders rather than being dropped. */
  intentUnrecorded: '(tidak tercatat)',
  intentColumns: { intent: 'Intent', beats: 'Beat', share: 'Porsi' },
  intentNotes: [
    'Ini membaca rencana sutradara, bukan teks yang benar-benar terkirim. Beat yang gagal validasi tetap terhitung di sini.',
    'Beat "ask" adalah pembaca yang bertanya balik. Rilis ini menyebutnya bagian yang paling sulit dan paling alami; kalau porsinya nol, sutradaranya tidak pernah memakai intent itu.',
    'Pembaca yang bertanya lalu tidak pernah menyinggung jawabannya lebih buruk daripada yang tidak pernah bertanya. Panel ini tidak bisa melihat hal itu — hanya membaca percakapannya yang bisa.',
    'Urutannya tetap, bukan urutan besar-kecil, supaya perubahan angka tidak terbaca sebagai perubahan susunan.',
  ],

  // ── P6 · chat.tokens ─────────────────────────────────────────────────────
  tokensTitle: 'Token obrolan: chat_plan vs chat_turn',
  tokensSubtitle: 'Dua seri, satu sumbu — keduanya token. Biaya tidak pernah masuk grafik.',
  tokensSeries: { chat_plan: 'chat_plan', chat_turn: 'chat_turn' },
  tokensKpi: {
    tokens: 'Token obrolan',
    cost: 'Biaya notional obrolan',
    callShare: 'Porsi panggilan armada',
    tokenShare: 'Porsi token armada',
  },
  /** A-D7 / `[F7-7]`: **every cost figure renders beside the count of calls it could not
   *  price.** `prices.ts`'s zeros are a MEASUREMENT (the plan's balance was read as zero
   *  on 2026-08-01), so `US$0,00` would read as *we are spending nothing*. */
  tokensUnpriced: (n: string) => `${n} panggilan belum berharga`,
  tokensColumns: { day: 'Hari', plan: 'chat_plan', turn: 'chat_turn' },
  tokensNotes: [
    'chat_plan adalah satu panggilan sutradara per run; chat_turn adalah satu panggilan per beat. Bentuk tokennya berbeda jauh dan tidak boleh dirata-ratakan jadi satu angka.',
    'Biaya di sini notional. Setiap baris harga z.ai bernilai nol dengan sengaja — itu hasil pengukuran, bukan tempat kosong — jadi angka biaya berjalan bersama jumlah panggilan yang belum bisa diberi harga.',
    'Obrolan berjalan di CHAT_MODEL, yang bisa berbeda dari LLM_MODEL. Panel model di /admin/tokens adalah tempat memeriksa model mana yang belum punya baris harga.',
    'Porsi armada dihitung terhadap SELURUH panggilan model, termasuk moderasi, gist dan tombol Insight di dasbor ini. Itu bukan "porsi dari bacaan".',
    'Halaman ini mengukur, tidak membatasi. Satu-satunya rem di rilis ini ada di LLM_WINDOW_CHAT_CEILING, dan alasannya bukan biaya.',
  ],

  // ── P7 · chat.latency ────────────────────────────────────────────────────
  latencyTitle: 'Latensi per beat',
  latencySubtitle: 'p95 waktu panggilan model per hari UTC. Bukan waktu yang dirasakan penanya.',
  latencyTiles: { p50: 'p50', p95: 'p95' },
  latencyColumns: { day: 'Hari', plan: 'chat_plan', turn: 'chat_turn' },
  latencyNotes: [
    'Ini waktu panggilan model, bukan waktu yang dirasakan penanya. Jeda mengetik antar-beat ditentukan server lalu dijalankan di peramban, dan tidak tercatat di mana pun.',
    'Satu run dengan tiga beat membayar satu chat_plan dan tiga chat_turn, berurutan. Waktu total run adalah jumlahnya ditambah jeda, dan tidak ada di halaman ini.',
    'p95 dihitung Postgres atas seluruh populasi op itu. Itu bukan rata-rata dari baris harian di tabel.',
    'Hanya panggilan yang berstatus ok yang dihitung. Panggilan yang gagal punya durasi, tapi bukan durasi menghasilkan sesuatu.',
  ],

  // ── P8 · chat.health ─────────────────────────────────────────────────────
  healthTitle: 'Run yang tidak sampai ke layar',
  healthSubtitle: 'Satu-satunya tempat beat yang jatuh dan keputusan diam bisa dibedakan.',
  healthKpi: {
    dropped: 'Beat dijatuhkan',
    fallback: 'Rencana ditolak',
    stuck: 'Run macet',
  },
  /** The denominator beside the rate: *"n dari m run selesai"*. A bare `0` under a
   *  percentage is a number with no question attached. */
  healthFallbackNote: (n: string, of: string) => `${n} dari ${of} run selesai`,
  healthColumns: { status: 'Status', runs: 'Run', stuck: 'Macet' },
  healthNotes: [
    'Tidak ada gelembung error di rilis ini. Kegagalan adalah kesunyian — jadi beat yang jatuh dan keputusan diam terlihat sama dari dalam ruangan. Panel inilah satu-satunya tempat keduanya bisa dibedakan.',
    'Beat yang dijatuhkan dihitung dari selisih beat yang direncanakan dan gelembung yang tersimpan, pada run yang sudah selesai saja. Beat yang dibuang karena kuota meninggalkan runnya tetap "running", jadi tidak pernah masuk hitungan ini.',
    'Satu beat boleh menghasilkan dua gelembung, jadi selisihnya bisa negatif. Yang ditampilkan dijepit di nol — angka negatif di sini akan terbaca sebagai dasbor yang salah, bukan sebagai pembaca yang punya dua hal untuk dikatakan.',
    '"Run macet" adalah run yang belum selesai dan leasenya sudah lama lewat. Beberapa itu wajar: penanya menutup tab, dan run diambil lagi saat ia kembali. Yang perlu dilihat adalah kalau angkanya menumpuk dari hari ke hari.',
    '"abandoned" berarti semua beatnya gagal. Itu error, bukan penanya yang pergi — kebalikan dari arti "ditinggalkan" di panel bacaan.',
  ],

  // ── P9 · chat.quota ──────────────────────────────────────────────────────
  quotaTitle: 'Kuota: obrolan di dalam jendela armada',
  quotaSubtitle:
    'Dua meter, dua batas, masing-masing dengan bingkainya sendiri. Yang terlarang adalah dua skala dalam SATU bingkai.',
  quotaChatLabel: 'Panggilan obrolan / batas obrolan',
  quotaFleetLabel: 'Semua panggilan / batas armada',
  quotaShare: 'Porsi obrolan di jendela terburuk',
  quotaColumns: { meter: 'Meter', used: 'Terpakai', ceiling: 'Batas', pct: 'Porsi' },
  quotaNotes: [
    'Panggilan obrolan bertingkat "deferred": mereka dibuang di garis LUNAK, bukan di garis keras. Angka yang benar-benar mengikat lebih rendah dari batas yang tertulis.',
    'Meter armada di sebelah kanan adalah angka yang sama dengan angka utama di halaman Ringkasan, dari kueri yang sama. Kalau keduanya berbeda, salah satunya salah.',
    'Jendela 5 jam berjalan, bukan hari kalender. Tidak ada tanggal di kunci penghitungnya.',
    'Batas panggilan armada diturunkan ulang untuk rilis ini. Kalau meter kanan sering di atas garis lunak sementara meter kiri masih longgar, yang salah adalah batas armadanya, bukan obrolannya.',
  ],
} as const;
