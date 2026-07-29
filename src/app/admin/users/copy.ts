/**
 * Every user-visible string on `/admin/users` and `/admin/users/[id]`. **Indonesian,
 * hardcoded, never the i18n catalog** (A-D12, A5-3). v0.5.0 / A5, task 1.
 *
 * ── WHY NOT THE CATALOG, IN THE FORM R33 LEFT THE ARGUMENT ──────────────────
 *
 * A-D12 justified this partly by *"the catalog is shipped to the browser as JSON on
 * every page"*. **That saving does not exist** — `LocaleProvider` is mounted in the
 * root layout, so the catalog already ships on `/admin`. R33's ruling keeps the rule
 * and replaces the reason: the authoring cost of ~150 strings in two locales for a
 * surface with exactly one reader, and that `id.ts` OWNS THE KEY SET, so every string
 * below would force an English twin somebody has to write and keep true.
 *
 * **So `adminSurface.test.ts`'s and `adminCopy.test.ts`'s greps are the WHOLE
 * enforcement, not a belt on a stronger argument.** Do not describe them as defence
 * in depth: that is how a reviewer concludes one is redundant and deletes it.
 *
 * ── INDONESIAN PROSE, ENGLISH TERMS OF ART ──────────────────────────────────
 *
 * `token`, `input`, `output`, `op`, `model`, `TTFT`, `session`, `slug`, `HMAC` stay
 * English, because that is how the language is actually spoken about software.
 * A-D12 names the failure mode: pretending otherwise produces `keluaran token` on a
 * chart axis. `A4`'s `../copy.ts` made the same call and this file matches it.
 *
 * ── THE SENTENCES THAT ARE NOT DECORATION ───────────────────────────────────
 *
 * Four strings here are the only place a rule reaches the operator, and each was
 * argued somewhere else in the release. **Shortening them removes the argument, not
 * the wording:**
 *
 *   - `deleted.*` — A5-14. V8's `deleteAccount` already revoked every link and
 *     redacted every flag INSIDE the transaction that set `deleted_at`, and it
 *     deliberately did NOT clear the six answers (that would break the 30-day
 *     restore the confirmation copy promises). Without these four sentences the page
 *     reads as data loss.
 *   - `readings.costLabel` — R51/A5-D3. The moderation classifier runs *before* the
 *     `readings` row exists, so it can never carry a `reading_id`. *"Biaya bacaan"*
 *     would be a wrong number wearing a right label.
 *   - `moderation.neverStored` — `sexual_minor` never stores the text at all, not
 *     encrypted and not for thirty days, because storing it is the exposure.
 *   - `shareLinks.viewsApprox` — `view_count` is the one unauthenticated write in the
 *     product, incremented in `after()` behind a per-IP limiter with failures
 *     swallowed. It is a load and abuse signal, not an audience metric.
 */

/** Shared furniture. `../copy.ts`'s `COMMON` covers the two A4 pages; this covers these two. */
export const U = {
  empty: '—',
  /** A section with no rows. Never a blank panel: an empty panel reads as a failure. */
  none: 'Tidak ada baris.',
  /** The whole-page read failed. One failure state, not fourteen (§11.1). */
  readFailed: 'Data pengguna ini tidak bisa dibaca sekarang.',
  readFailedDetail:
    'Kueri melewati batas waktu atau basis data tidak menjawab. Muat ulang halaman.',
  loading: 'Memuat…',
  yes: 'ya',
  no: 'tidak',
  /** For `admin_access_log.admin_user_id IS NULL` (R3). It means the admin's row is
   *  gone — never "admin tak dikenal". */
  adminDeleted: 'admin dihapus',
  /** A `users.id` that is NULL on a row that survives its owner. */
  unattributed: '(terhapus / sistem)',
  backToList: '← Semua pengguna',
} as const;

/** `/admin/users` — the list. */
export const LIST = {
  title: 'Pengguna',
  searchLabel: 'Cari email',
  searchPlaceholder: 'email…',
  searchApply: 'Cari',
  searchClear: 'Bersihkan',
  /**
   * A5-13, stated on screen because the cost is accepted rather than missed: `?q=`
   * puts an email address in the URL and therefore in the platform access log.
   *
   * **A5-13 IS A CEILING, NOT A FLOOR, AND WHAT SHIPPED IS NARROWER THAN IT.** The plan
   * said email AND display name; A3's `adminUserList` matches `u.email` only, and
   * `src/lib/db/queries/admin/**` is A3's by §7 — so A5 says "email" on the label rather
   * than widening somebody else's query. Searching LESS than A5-13 permits is not a
   * violation of it; searching more would be.
   */
  searchNote:
    'Pencarian hanya menyentuh kolom email. Tidak ada pencarian atas pertanyaan, ' +
    'bacaan, ringkasan, atau jawaban — itu produk lain dengan kebijakan privasi lain.',
  /**
   * **THERE IS NO "SEMBUNYIKAN YANG TERHAPUS" FILTER, AND THAT IS A5-14 HELD RATHER
   * THAN A FEATURE MISSING.** The plan offered `?deleted=only|hide`; A3's list query has
   * no such parameter, and filtering a fetched page in JavaScript would silently return
   * eleven rows for a page of fifty. A5-14's actual requirement is that **no default
   * hides them**, which "always shown, always badged" satisfies completely.
   */
  deletedShownAlways:
    'Akun yang sudah dihapus (halus) selalu ikut tampil, dengan lencana. Tidak ada ' +
    'saringan yang menyembunyikannya: menyembunyikannya membuat jendela pemulihan 30 ' +
    'hari tak terlihat.',
  columns: {
    email: 'Email',
    name: 'Nama',
    locale: 'Bahasa',
    created: 'Terdaftar',
    lastSeen: 'Terlihat',
    onboarded: 'Rite',
    readings: 'Bacaan',
    calls: 'Panggilan',
    tokens: 'Token in+out',
    cost: 'Biaya notional',
  },
  onboardedYes: '✓',
  onboardedNo: '—',
  deletedBadge: 'terhapus',
  /**
   * **A-D7's denominator warning, at the only altitude this page can honestly give
   * it.** A3's `userCostLeague` carries no `local_date` and no `untokenized`, so a
   * per-row unpriced count is not derivable here; the per-user page has both and
   * shows them properly. Every figure in the cost column is `null` today because
   * `NOTIONAL_MODEL` is unset, and the tile on `/admin` says the same thing.
   */
  costNote:
    'Biaya notional dihitung dengan tarif provider cadangan, bukan tarif z.ai — ' +
    'langganan z.ai tidak menagih per token. Selama NOTIONAL_MODEL belum diisi, ' +
    'kolom ini kosong.',
  /** Roadmap §5.4's "no silent caps": say what was dropped rather than implying coverage. */
  aggregateCapped:
    'Angka panggilan dan token diambil dari 200 pasangan (pengguna, model) teratas ' +
    'pada rentang ini. Baris di luar itu kosong — bukan nol.',
  prev: '← Sebelumnya',
  next: 'Berikutnya →',
  page: (n: number) => `Halaman ${n}`,
  /**
   * **OFFSET PAGING, AND A5-D2 ASKED FOR KEYSET.** A3's `adminUserList` takes
   * `{ search, limit, offset }` and `src/lib/db/queries/admin/**` is A3's by §7. The
   * hazard A5-D2 named is real and is stated here rather than hidden: the list is ordered
   * by `last_seen_at desc`, `touchLastSeen` moves that column on every request, so a user
   * who is browsing while the operator pages can appear on two consecutive pages or on
   * neither. **Nothing on this surface writes, so the cost is a confusing row and never a
   * wrong action** — and the fix belongs in A3's file, as one `cursor` parameter.
   */
  offsetNote:
    'Halaman memakai offset, dan urutannya "terakhir terlihat". Kalau seseorang sedang ' +
    'memakai aplikasi saat kamu membalik halaman, barisnya bisa muncul dua kali atau ' +
    'terlewat. Pakai kotak cari kalau sedang mencari orang tertentu.',
  /** §13.7: a list read writes no audit row, and that is a stated gap. */
  noAuditNote:
    'Membuka daftar ini tidak menulis baris audit. Hanya halaman satu orang dan ' +
    'setiap pembukaan teks yang menulisnya.',
} as const;

/** `/admin/users/[id]` — the fourteen sections, in render order. */
export const DETAIL = {
  title: (label: string) => `Pengguna · ${label}`,
  tocLabel: 'Bagian',

  identity: {
    heading: 'Identitas',
    id: 'users.id',
    googleSub: 'google_sub',
    email: 'Email',
    emailVerified: 'Email terverifikasi',
    displayName: 'Nama tampilan',
    avatarUrl: 'avatar_url',
    locale: 'Bahasa',
    localeSource: 'Asal pilihan bahasa',
    /** `effectiveLocaleSource()` resolves NULL to `'chosen'`; the raw `?? 'default'`
     *  a reasonable person writes would license overwriting a real preference. */
    localeSourceNote:
      'NULL dibaca sebagai "dipilih sendiri" lewat effectiveLocaleSource(), bukan ' +
      '"bawaan" — baris sebelum v0.3.0 semuanya NULL dan sebagian memang menekan tombolnya.',
    createdAt: 'Terdaftar',
    lastSeenAt: 'Terakhir terlihat',
    termsAcceptedAt: 'Menyetujui S&K',
    termsVersion: 'Versi S&K',
    ageConfirmedAt: 'Konfirmasi usia',
    /** `avatar_url` is a STRING and never an `<img>`: a remote Google avatar is a
     *  third-party request from an admin page for no information gain. */
    avatarNote: 'Ditampilkan sebagai teks, bukan gambar — tidak ada permintaan ke pihak ketiga.',
  },

  deleted: {
    heading: 'Akun ini sudah dihapus (halus)',
    at: (when: string) => `Ditandai terhapus pada ${when}.`,
    restorable: (when: string) =>
      `Bisa dipulihkan sampai ${when}; setelah itu penghapusan keras menghabiskan barisnya.`,
    /** The four statements A5-14 requires, in words, because each panel below would
     *  otherwise read as emptiness. */
    what: [
      'Semua tautan bagikan sudah dicabut di dalam transaksi yang sama.',
      'Semua teks pertanyaan yang ditandai moderasi sudah diredaksi di transaksi itu juga.',
      'Enam jawaban MASIH ADA, dan itu benar: menghapusnya sekarang akan mematikan ' +
        'pemulihan 30 hari yang dijanjikan teks konfirmasi.',
      'Peristiwa (events) bertahan dengan user_id dikosongkan, jadi setelah penghapusan ' +
        'keras aliran di bawah memang kosong.',
    ],
  },

  facts: {
    heading: 'Data diri',
    fullName: 'Nama lengkap',
    nickname: 'Nama panggilan',
    birthDate: 'Tanggal lahir',
    onboardingVersion: 'Versi rite',
    completedAt: 'Rite selesai',
    createdAt: 'Dibuat',
    updatedAt: 'Diubah',
    /** Row presence is not completion — the facts row exists from step 1 of 9. */
    incomplete: 'Rite belum selesai',
    noRow: 'Belum ada baris profiles.',
  },

  answers: {
    heading: 'Enam jawaban',
    /** A5-5/A5-9 on screen, because this is where somebody would want a "reveal all". */
    note:
      'Satu kunci per permintaan, private/no-store, dan setiap pembukaan menulis baris ' +
      'audit sebelum teksnya dikirim. Tidak ada varian massal dan tidak boleh ada. ' +
      'Ciphertext tidak pernah dikirim ke halaman ini.',
    /** The questions, labelled. Copies of the rite's own wording would be nicer and
     *  live in the i18n catalog, which A-D12 forbids reaching for. */
    titles: {
      best_thing: 'Hal terbaik yang pernah terjadi',
      worst_thing: 'Hal terburuk yang pernah terjadi',
      most_loved: 'Yang paling dicintai',
      introversion: 'Skala menyendiri ↔ di antara orang',
      color: 'Warna lotus',
      willow_wish: 'Permintaan pada pohon willow',
    } as const,
    answered: 'terjawab',
    skipped: 'dilewati',
    notAsked: 'belum ditanya',
    updatedAt: 'Diubah',
    reveal: 'Buka teks',
    revealed: 'Teks jawaban',
    empty: 'Tidak ada teks — ini sebuah skip.',
    closed: 'Pertanyaan tertutup; nilainya ada di answer_choice dan tidak dienkripsi.',
    /** No write path: §1 of the roadmap, and the `input_hash` argument. */
    noEdit:
      'Tidak ada tombol ubah dan tidak ada tombol hapus di sini. Admin tidak menulis ' +
      'data querent; mekanisme input_hash di belakang Lotus dan sosok akan diam-diam ' +
      'tidak setuju dengan baris yang dibangun darinya.',
  },

  lotus: {
    heading: 'Lotus',
    summaryId: 'summary.id',
    summaryEn: 'summary.en',
    traits: 'traits',
    sourceVersion: 'source_version',
    inputHash: 'input_hash',
    model: 'model',
    createdAt: 'Dibuat',
    updatedAt: 'Diubah',
    noRow: 'Belum ada lotus_avatars.',
    /** Why the summary is shown in full and has no reveal. */
    note:
      'Ditampilkan utuh: ini keluaran model yang sudah lulus lotusSafetyCheck, dan blok ' +
      'inilah yang disuntikkan ke setiap prompt bacaan. Ia juga lapisan abstraksi antara ' +
      'enam jawaban mentah dan sosok — jadi membacanya adalah membaca lapisan yang aman.',
    /** Staleness is two timestamps side by side, never a recomputed hash: recomputing
     *  `lotusInputHash` needs the decrypted answers, which is a bulk decrypt (A5-5). */
    staleNote:
      'Tidak ada tanda "kedaluwarsa" yang dihitung di sini: menghitung ulang ' +
      'lotusInputHash butuh keenam jawaban terdekripsi, dan itu dekripsi massal. ' +
      'Bandingkan updated_at di sini dengan perubahan terakhir jawaban di atas.',
    answersUpdatedAt: 'Jawaban terakhir diubah',
  },

  persona: {
    heading: 'Sosok',
    body: 'body',
    locale: 'Bahasa',
    facts: 'facts',
    inputHash: 'input_hash',
    sourceVersion: 'source_version',
    model: 'model',
    promptVersion: 'prompt_version',
    createdAt: 'Dibuat',
    updatedAt: 'Diubah',
    noRow: 'Belum ada personas.',
    fallback: 'model = fallback: paragraf ini template, bukan keluaran model.',
    /** Shown, never computed: the user-edit arm of `personaStaleness`. */
    stale: 'Menunggu regenerasi (jawaban lebih baru dari sosok).',
    fresh: 'Selaras dengan jawaban.',
    /** §11.2 in one sentence, at the place somebody would add the button. */
    noRegen:
      'Tidak ada tombol regenerasi di halaman ini. Regenerasi yang dipicu admin adalah ' +
      'tulisan tanpa suntingan pengguna di belakangnya: ia tidak memenuhi satu pun ' +
      'prasyarat input_hash, dan untuk Lotus ia mengubah blok yang masuk ke setiap ' +
      'prompt bacaan berikutnya milik orang yang tidak meminta apa pun.',
  },

  readings: {
    heading: 'Bacaan',
    count: (n: number, total: number) => `${n} dari ${total} baris terbaru`,
    columns: {
      created: 'Waktu',
      localDate: 'Hari querent',
      reader: 'Pembaca',
      service: 'Layanan',
      locale: 'Bahasa',
      status: 'Status',
      verdict: 'Verdict',
      choice: 'Pilihan',
      question: 'Pertanyaan',
      cards: 'Kartu',
      model: 'model',
      promptVersion: 'prompt_version',
      ttft: 'TTFT',
      tokens: 'Token (in / out)',
      session: 'session_id',
      shared: 'Dibagikan',
      cost: 'Biaya generasi',
    },
    /** **TTFT in those letters** — two columns named `latency_ms` with two meanings
     *  now exist in one schema (roadmap seam 2), and a dashboard is where they get
     *  confused. */
    ttftNote:
      'TTFT = waktu sampai token pertama (readings.latency_ms), bukan lama generasi. ' +
      'Lama generasi ada di llm_calls.total_ms, di kolom biaya.',
    /** R51 / A5-D3. */
    costLabel: 'Biaya generasi',
    costNote:
      'Biaya generasi, bukan biaya bacaan: hanya panggilan yang membawa reading_id ' +
      '(bacaan itu sendiri dan gist). Classifier moderasi berjalan SEBELUM baris ' +
      'readings ada, jadi ia tidak pernah bisa membawa id-nya. Totalnya yang lengkap ' +
      'ada di tabel per-op di bawah.',
    /** A5-8: `body` and `gist` are not in the payload; the reveal is audited. */
    bodyWithheld: 'Teks bacaan tidak ada di halaman ini.',
    revealBody: 'Buka teks bacaan',
    revealedBody: 'Teks bacaan',
    noBody: 'Tidak ada body (bacaan gagal atau ditolak).',
    hasGist: 'gist ada',
    noGist: 'gist tidak ada',
    /** A5-22: blocked readings ARE shown, and V6's filter is deliberately absent. */
    blocked:
      'Ditolak moderasi. Tidak ada kartu untuk baris ini, dan pertanyaannya adalah teks ' +
      'yang ditandai classifier — halaman ini menampilkannya karena permintaannya adalah ' +
      '"semuanya" dan operator inilah yang menyetel blocklist.',
    partial: 'Terpotong. Catatan "[Bacaan terputus…]" tidak pernah masuk ke kolom body.',
    noCards: 'tidak ada kartu',
    reversed: 'terbalik',
    upright: 'tegak',
    slot: (n: number) => `slot ${n + 1}`,
    unknownCard: 'kartu tak dikenal',
  },

  tokens: {
    heading: 'Konsumsi token',
    kpiCalls: 'Panggilan',
    kpiInput: 'Token input',
    kpiOutput: 'Token output',
    kpiCost: 'Biaya notional',
    kpiUnpriced: 'Panggilan tanpa harga',
    unpricedNote: (n: number) =>
      `${n} panggilan tidak berharga (model tak dikenal atau provider tidak melaporkan token). ` +
      'Setiap angka biaya di halaman ini berjalan bersama jumlah itu.',
    seriesTitle: 'Token input vs output per hari',
    seriesSubtitle: 'Satu sumbu — keduanya satuan yang sama',
    inputLabel: 'input',
    outputLabel: 'output',
    byOpTitle: 'Panggilan per op',
    byOpSubtitle: 'Sembilan op dilipat menjadi tiga teratas + lainnya',
    tableToggle: 'Lihat tabel',
    dayColumn: 'Hari',
    opColumn: 'op',
    callsColumn: 'Panggilan',
    inputColumn: 'input',
    outputColumn: 'output',
    /** A5-15: every bucket is `local_date`, the querent's own day. */
    bucketNote:
      'Semua ember harian memakai llm_calls.local_date — hari kalender querent, bukan ' +
      'created_at di zona server.',
    /** §11.3 / A-D8: no per-user forecast, and the reason. */
    noForecast:
      'Tidak ada proyeksi per pengguna. Satu orang selama satu rentang selalu di bawah n ' +
      'minimum yang jujur; proyeksi armada ada di /admin/tokens.',
  },

  summaries: {
    heading: 'Ringkasan harian',
    columns: {
      localDate: 'Hari querent',
      reader: 'Pembaca',
      locale: 'Bahasa',
      generationCount: 'generation_count',
      updatedAt: 'Diubah',
      promptVersion: 'prompt_version',
      sources: 'Bacaan sumber',
    },
    body: 'Isi',
    /** `generation_count` exists to make "is the throttle set right?" one query. */
    note:
      'generation_count dan updated_at bersebelahan karena throttle regenerasi ' +
      'membandingkan persis dua kolom itu.',
  },

  verdicts: {
    heading: 'Kartu yang berulang',
    columns: {
      windowKey: 'window_key',
      locale: 'Bahasa',
      top: 'Kartu teratas',
      second: 'Kartu kedua',
      fingerprint: 'fingerprint',
      model: 'model',
      updatedAt: 'Diubah',
    },
    body: 'Isi',
    /** V3: the counts were deleted from both prompts rather than forbidden in them. */
    note:
      'Tidak ada hitungan m dan n di sini. V3 menghapus angkanya dari kedua prompt ' +
      'ketimbang melarangnya, dan menaruhnya di dasbor mengundang seseorang ' +
      '"memunculkannya" lagi di produk.',
  },

  translations: {
    heading: 'Terjemahan',
    columns: {
      entity: 'entity',
      entityId: 'entity_id',
      field: 'field',
      from: 'Dari',
      to: 'Ke',
      model: 'model',
      updatedAt: 'Diubah',
      stale: 'Kedaluwarsa',
    },
    body: 'Isi',
    staleYes: 'ya',
    staleNo: 'tidak',
    /** The staleness mechanism IS the timestamp comparison; there is no `source_hash`. */
    note:
      'Kedaluwarsa = translations.updated_at < updated_at sumbernya. Tidak ada kolom ' +
      'source_hash: perbandingan itulah seluruh mekanismenya, dan updated_at yang beku ' +
      'akan tampil sebagai "tidak ada yang pernah kedaluwarsa".',
    orphanNote:
      'entity_id tidak punya foreign key, jadi baris yatim mungkin ada dan tidak bisa ' +
      'dijangkau dari halaman pengguna. Sapuan harian yang membersihkannya.',
  },

  shareLinks: {
    heading: 'Tautan bagikan',
    columns: {
      slug: 'slug',
      entity: 'entity',
      entityId: 'entity_id',
      locale: 'Bahasa tautan',
      includeQuestion: 'include_question',
      includeNickname: 'include_nickname',
      views: 'Dilihat',
      revokedAt: 'Dicabut',
      createdAt: 'Dibuat',
      live: 'Hidup',
    },
    asWritten: 'as-written',
    asWrittenNote:
      'locale NULL berarti as-written — prosa apa adanya dalam readings.locale. Setiap ' +
      'tautan yang dibuat sebelum kolom itu ada bernilai NULL.',
    viewsApprox:
      'Jumlah dilihat bersifat perkiraan: satu-satunya tulisan tanpa autentikasi di ' +
      'produk ini, di dalam after(), di belakang limiter per-IP, dengan kegagalan ' +
      'ditelan. Ia sinyal beban dan penyalahgunaan, bukan metrik audiens.',
    /** No revoke control. Miftah's ruling made revoke per-artifact and it kills every
     *  language; re-sharing rotates the slug, so an admin revoke has no undo. */
    noRevoke:
      'Tidak ada tombol cabut. Pencabutan adalah hak querent, berlaku per artefak dan ' +
      'mematikan semua bahasa — dan karena berbagi ulang memutar slug, tidak ada jalan ' +
      'kembali dari tombol admin.',
    liveYes: 'hidup',
    liveNo: 'mati',
  },

  moderation: {
    heading: 'Tanda moderasi',
    columns: {
      created: 'Waktu',
      category: 'category',
      source: 'source',
      action: 'action',
      locale: 'Bahasa',
      patternId: 'pattern_id',
      confidence: 'confidence',
      hmac: 'question_hmac',
      redactedAt: 'Diredaksi',
      text: 'Teks',
    },
    available: 'ada teks',
    redacted: 'teks sudah dihapus (redaksi)',
    neverStored: 'teks tidak pernah disimpan',
    undecryptable: 'teks tidak bisa dibuka (kunci berbeda)',
    reveal: 'Buka teks',
    revealed: 'Teks pertanyaan',
    /** `sexual_minor` never stores the text at all — storing it is the exposure. */
    neverStoredNote:
      'Kategori sexual_minor tidak pernah menyimpan teksnya — tidak terenkripsi, tidak ' +
      'untuk tiga puluh hari — karena menyimpannya itulah paparannya.',
    /** A5-12: the HMAC is a dedupe key, not anonymization, and never an oracle. */
    hmacNote:
      'Hanya 12 karakter pertama question_hmac, sebagai label kelompok. HMAC di sini ' +
      'kunci deduplikasi, bukan anonimisasi, dan tidak ada jalur yang membandingkannya ' +
      'dengan teks kandidat.',
    patternNote:
      'pattern_id ada di layar karena ia mengubah "blocklist punya false positive" ' +
      'menjadi "pola id.self_harm.method punya sebelas false positive".',
    noUnredact:
      'Sapuan redaksi 30 hari tidak disentuh: tidak ada pengecualian, tidak ada tanda ' +
      '"simpan untuk ditinjau", dan tidak ada jalur yang membatalkan redaksi.',
  },

  events: {
    heading: 'Aliran peristiwa',
    cap: (n: number) => `${n} baris terbaru. Bukan seluruh riwayat.`,
    columns: {
      created: 'Waktu',
      localDate: 'Hari querent',
      locale: 'Bahasa',
      session: 'session_id',
      name: 'name',
      props: 'props',
    },
    /** `session_id` is the BROWSER session; the join with `readings.session_id` is
     *  what this section is for. */
    sessionNote:
      'session_id di sini sesi peramban, bukan sesi autentikasi. Menyamakannya dengan ' +
      'readings.session_id merekonstruksi satu interaksi — itulah gunanya bagian ini.',
    propsNote:
      'props tidak pernah berisi teks bebas: sanitizeProps() membuang non-skalar, ' +
      'memotong string pada 120 karakter, membatasi 24 kunci, dan menolak __proto__, ' +
      'constructor dan prototype berdasarkan nama.',
    purgedNote:
      'Baris events bertahan setelah penghapusan akun dengan user_id dikosongkan, jadi ' +
      'aliran kosong di samping akun hidup adalah bug, dan aliran kosong di samping akun ' +
      'yang sudah dihapus keras adalah benar.',
  },

  access: {
    heading: 'Yang sudah dibaca tentang orang ini',
    columns: {
      created: 'Waktu',
      admin: 'Admin',
      resource: 'resource',
      resourceKey: 'resource_key',
    },
    /** Why this section exists at all: it is the subject-access answer, and the only
     *  way the operator ever finds out whether the audit trail works. */
    note:
      'Ini jawaban atas "apa saja yang sudah dibaca tentang saya", dan satu-satunya cara ' +
      'operator tahu jejak auditnya bekerja. resource_key selalu kunci — kunci ' +
      'pertanyaan, id tanda, id bacaan — dan tidak pernah nilai terdekripsi.',
    noDelete:
      'Tidak ada kontrol hapus di sini, dan tidak boleh ada: tombol hapus pada jejak ' +
      'audit adalah tidak adanya jejak audit.',
    /** §13.7 again, from the subject's side. */
    listGap:
      'Membuka daftar /admin/users tidak tercatat di sini. Lima puluh baris audit per ' +
      'pembukaan halaman akan membuat bagian ini tidak terbaca — itu celah yang dinyatakan, ' +
      'bukan kelalaian.',
    purged:
      'Setelah penghapusan keras, subject_user_id dikosongkan, jadi bagian ini kosong ' +
      'untuk akun yang sudah habis masa pemulihannya.',
  },
} as const;

/** The reveal control's five states, in one place so three mounts cannot disagree. */
export const REVEAL = {
  idle: 'Buka teks',
  loading: 'Membuka…',
  failed: 'Gagal — coba lagi',
  failedFinal: 'Gagal. Tidak dicoba lagi.',
  /** A timeout is the ONE outcome that means unknown, so it is the only one retried. */
  timedOut: 'Waktu habis — coba sekali lagi',
  close: 'Tutup',
  nothing: 'Tidak ada teks untuk dibuka.',
  audited: 'Pembukaan ini tercatat di jejak audit.',
} as const;
