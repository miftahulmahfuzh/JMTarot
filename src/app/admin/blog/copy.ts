/**
 * Every user-visible string on `/admin/blog`. **Indonesian, hardcoded, never the i18n
 * catalog** (A-D12, and `src/app/admin/copy.ts`'s header has the full argument).
 *
 * R33 corrects A-D12's stated reason while keeping the rule: the catalog already ships
 * on every page because `LocaleProvider` is mounted in the root layout, so there is no
 * payload saving. What is real is the authoring cost of a second locale for a surface
 * with one reader, and that `id.ts` owns the key set — so every admin string would force
 * an English twin somebody has to keep true. **The `t()` grep is the whole enforcement.**
 *
 * **INDONESIAN PROSE, ENGLISH TERMS OF ART.** `slug`, `draft`, `blok`, `lint`, `id`/`en`
 * stay as they are; `keluaran token` on a chart axis is the failure A-D12 names.
 *
 * ── THE REFUSAL SENTENCES ARE THE MOST LOAD-BEARING STRINGS HERE ────────────
 *
 * A6-7's whole second defence exists because *"the toggle did nothing"* is the state in
 * which somebody opens `db:studio` and edits a row by hand. Every `TransitionRefusal`
 * gets a sentence that says what happened AND what to do about it.
 */
import type { TransitionRefusal } from '@/lib/content/blogStatus';
import type { LintRule } from '@/lib/content/lint';

export const BLOG = {
  title: 'Tulisan',
  lede: 'Buat, sunting, terbitkan, dan tarik artikel — tanpa deploy.',
  newArticle: 'Tulisan baru',
  backToList: '← Semua tulisan',

  // ── the list ──────────────────────────────────────────────────────────────
  colSlug: 'slug',
  colPublished: 'Terbit',
  colStatus: 'Status',
  colUpdated: 'Diubah',
  colWords: 'Kata',
  colBlocks: 'Blok',
  colActions: '',
  empty: 'Belum ada tulisan. Mulai dari “Tulisan baru”.',
  edit: (locale: string) => `Sunting ${locale}`,
  create: (locale: string) => `Tulis ${locale}`,
  /** No delete control anywhere; `unpublished` is the removal path (A6-21). */
  noDelete:
    'Tidak ada tombol hapus. Artikel yang pernah publik ditarik, bukan dihapus — URL-nya mungkin masih ada di indeks Google dan di percakapan orang.',

  // ── status ────────────────────────────────────────────────────────────────
  status: {
    draft: 'Draf',
    published: 'Publik',
    unpublished: 'Ditarik',
  } satisfies Record<string, string>,
  publish: 'Terbitkan',
  unpublish: 'Tarik dari publikasi',
  /**
   * The `Publik` chip is a LINK to the page it describes, in a new tab — the one thing
   * this list could not do was let the operator read what they had just published.
   *
   * **It says "tab baru" because it opens one**, and a link that opens a tab without
   * saying so is the one an operator middle-clicks a second time. Rendered as `title`
   * and folded into the accessible name, because `Publik` alone is not a link label.
   */
  openPublic: 'Buka halaman publiknya di tab baru',
  /**
   * A6-22. **The `en` row says `published` and the URL still 404s**, because
   * reachability is derived from `id` rather than cascaded. Nobody will understand the
   * page 404ing without this label.
   */
  unreachable: 'Tidak terjangkau — `id` belum publik',
  unreachableWhy:
    'Barisnya tetap “Publik”, dan itu benar: ia mencatat apa yang kamu minta. Menerbitkan ulang `id` akan mengembalikannya tanpa keputusan kedua.',

  refusal: {
    'no-path-back-to-draft':
      'Tidak bisa dikembalikan ke draf. “Draf” berarti belum pernah publik, dan URL ini pernah — mengubah labelnya akan menyembunyikan fakta itu.',
    'never-published': 'Belum pernah publik, jadi tidak ada yang bisa ditarik.',
    'empty-body': 'Badan artikel masih kosong.',
    'lint-violations': 'Masih ada temuan lint. Perbaiki dulu, lalu terbitkan.',
    'id-not-published':
      'Terbitkan versi `id` lebih dulu. Halaman `en` tanpa dokumen `id` membuat canonical-nya gagal dibangun, dan itu 500 di URL yang ada di sitemap.',
  } satisfies Record<TransitionRefusal, string>,

  // ── the editor ────────────────────────────────────────────────────────────
  editor: {
    fields: 'Kolom dokumen',
    slug: 'slug',
    slugFrozen:
      'Terkunci: sudah ada versi yang publik. Slug adalah alamat permanen — ada di indeks Google, di sitemap, di `@id` JSON-LD, dan di setiap tautan yang pernah dikirim orang. Proyek ini tidak punya tabel redirect.',
    slugHint: 'Huruf kecil dan tanda hubung. Sama di kedua bahasa, dan dalam bahasa Inggris.',
    localeTab: (l: string) => (l === 'id' ? 'Bahasa Indonesia' : 'English'),
    articleTitle: 'Judul',
    /** Says the field may be left empty, because that is now a supported path rather than a 422. */
    titleAutoHint: 'Boleh dibiarkan kosong — Format otomatis akan menuliskannya dalam bahasa artikel ini.',
    titleHint:
      'Judul artikel. Ini yang muncul sebagai baris pertama di hasil pencarian Google, jadi tulis kalimatnya untuk orang yang belum tahu apa-apa soal isinya.',
    /** The heading BLOCK's own text. Not the document's title — see `BlockFields`. */
    headingText: 'Teks judul bagian',
    description: 'Deskripsi (meta)',
    /**
     * **THE FIELD MOST LIKELY TO BE FILLED IN WRONG, AND THE BAND IS INVISIBLE WITHOUT
     * THIS.** It is not a summary of the article — it is the two lines Google prints
     * UNDER the title, and the only job of those two lines is to earn the click.
     *
     * The numbers are not arbitrary and the hint says why in the operator's own terms:
     * under 80 characters Google ignores it and pulls a sentence out of the body
     * instead, over 158 it truncates mid-word. A bare "80–158" tells somebody the rule
     * without telling them the reason, and a rule with no reason is one people round
     * off.
     */
    descriptionHint:
      'Dua baris yang muncul DI BAWAH judul di hasil pencarian Google. Bukan ringkasan artikel — ini kalimat yang bikin orang mau mengklik.',
    descriptionBand:
      'Panjangnya harus 80–158 karakter. Di bawah 80, Google mengabaikannya dan mengambil kalimat acak dari isi artikel; di atas 158, kalimatnya dipotong di tengah.',
    /** `126 / 80–158 karakter`, so the target is on screen beside the count. */
    charsOf: (n: number, min: number, max: number) => `${n} / ${min}–${max} karakter`,
    charsMax: (n: number, max: number) => `${n} / maks. ${max} karakter`,
    charsMin: (n: number, min: number) => `${n} / min. ${min} karakter`,
    tooShort: 'terlalu pendek',
    tooLong: 'terlalu panjang',
    justRight: 'pas',
    chars: (n: number) => `${n} karakter`,
    heroCard: 'Gambar utama',
    heroNone: '(tanpa gambar)',
    /*
     * `heroAlt` and `heroAltHint` are DELETED, not emptied. The field asked an admin to
     * write a string that already exists in the card's own lore document, and all four
     * committed articles answered it with the card's name -- the one thing
     * `LoreDoc.imageAlt` forbids. `@/lib/content/heroAlt` derives it now.
     */
    heroDerived: 'Teks alternatifnya diambil dari halaman kartu ini, jadi tidak perlu ditulis.',

    /*
     * ── THE BLOCK EDITOR'S COPY IS DELETED ──────────────────────────────────
     *
     * `blocks`, `addBelow`, `moveUp`, `moveDown`, `remove`, `kind`, `level`, `anchorId`,
     * `ordered`, `orderedHint`, `quoteSource`, `listItem`, `addItem`, `cardSlug`,
     * `spanKind`, `addSpan`, `spanPath`, `plainToggle`, `plainHint`, `joined`,
     * `joinedHint` and `glued` all went with `BlockEditor.tsx`.
     *
     * **A6-31's `joined`/`joinedHint`/`glued` ARE THE ONES WORTH NAMING.** The middle-dot
     * strip existed because an HTML form field shows a trailing space no more than it
     * trims one, so `para(s('Lihat '), link('/gallery', 'galeri'))` rendered `Lihatgaleri`
     * with nothing on screen saying so. **In markdown the space is IN the text**, in the
     * position a diff would show it — `Lihat [galeri](/gallery)` — and `parseMarkdown`
     * cannot produce a glued pair from it at all. The rule did not go: `spansSeparate` and
     * the save-time refusal are untouched, and `markdown.test.ts` asserts the parse never
     * emits an adjacent pair the lint would object to, over the four real documents.
     */

    // ── the markdown editor ────────────────────────────────────────────────
    content: 'Konten',
    contentHint:
      'Tempelkan tulisannya di sini, markdown atau teks biasa. "## " di depan judul bagian, "- " untuk daftar, "**tebal**", "[teks](/path)" untuk tautan. Kalau belum ada judul bagian, tekan Format otomatis dan biarkan model yang menandainya.',
    /**
     * **THE SUFFIX HAS TO BE EXPLAINED SOMEWHERE OR IT READS AS A TYPO**, and it appears in
     * the textarea on every existing article: the four committed ones are English ids on
     * Indonesian headings, which `slugify` cannot derive. An anchor is a permanent address.
     */
    anchorSyntaxHint:
      '"## Judul {#anchor-id}" mengunci anchor-nya. Tanpa itu, anchor diambil dari judulnya sendiri. Anchor adalah alamat permanen di URL — jangan diubah setelah artikelnya terbit.',
    seoSection: 'SEO',
    seoSummary: (n: number) =>
      n === 0 ? 'deskripsi belum ada' : `deskripsi terisi · ${n} karakter`,

    // ── auto-format ────────────────────────────────────────────────────────
    format: 'Format otomatis',
    formatting: 'Memformat…',
    /**
     * **IT SAYS "DAN MENYIMPAN", BECAUSE IT DOES.** This is the one admin button that
     * writes as a side effect of a model call, and `Terjemahkan otomatis` right beside it
     * does the opposite — so a label that did not say so would leave two adjacent buttons
     * with opposite storage behaviour and no way to tell.
     */
    formatHint:
      'Membaca Konten, merapikan strukturnya, membuat daftar isi dari judul-judul bagian, lalu MENYIMPAN sebagai draf. Kalau Judul masih kosong, atau tulisannya belum punya judul bagian, atau deskripsinya belum ada — satu panggilan model dipakai untuk mengisi itu. Judul yang sudah kamu tulis tidak akan diubah.',
    formatDone: (blocks: number, headings: number, titleWritten: boolean) => {
      const parts = [`${blocks} blok`];
      if (headings > 0) parts.push(`${headings} judul bagian ditambahkan`);
      if (titleWritten) parts.push('judul artikel ditulis otomatis');
      return headings > 0 || titleWritten
        ? `Tersimpan: ${parts.join(', ')}.`
        : `Tersimpan: ${blocks} blok. Strukturnya sudah rapi, model tidak dipakai.`;
    },

    /*
     * ── EVERY FAILURE SAYS WHICH FAILURE IT IS (2026-07-31, Miftah's report) ──
     *
     * **`formatFailed` WAS THE ONLY THING FOUR DIFFERENT OUTCOMES PRINTED**, and *"Format
     * otomatis gagal."* on its own tells an operator nothing they can act on and tells a
     * future session nothing it can debug. It is kept as the last-resort arm and every
     * distinguishable case now has its own sentence with the one fact that narrows it: an HTTP
     * status, the stage the server reached, the error's class, or the count of lint violations
     * and the fields they are on.
     *
     * The rule this does NOT break: the server still never returns the driver's words. A
     * postgres error quotes its bound parameters, and on this path those are a whole article.
     * `stage` is a literal we wrote and `errorClass` is `err.name`, which cannot carry one —
     * the same two things CLAUDE.md already permits to be logged.
     */
    formatFailed: 'Format otomatis gagal, tanpa keterangan dari server. Lihat log dev server.',
    /** A 422: the lint or zod refused. The panel below has the words; this says where to look. */
    formatInvalid: (n: number, fields: string) =>
      `Ditolak sebelum disimpan: ${n} masalah pada ${fields}. Rinciannya ada di daftar di bawah — tidak ada yang tersimpan.`,
    /** Any other non-2xx. The status code is the single most useful thing here. */
    formatHttp: (status: number) =>
      status === 503
        ? `Database tidak bisa dihubungi (HTTP 503).`
        : status === 404
          ? `Server menolak permintaan ini (HTTP 404) — slug atau bahasanya tidak dikenali.`
          : `Server menjawab HTTP ${status}.`,
    /**
     * Appended to the 503 line. `stage`, `errorClass` and `errorCode` come from the route and
     * never from the driver's message — see `shared.ts`'s `unavailable()`.
     *
     * **`errorCode` IS THE USEFUL ONE AND IT IS PRINTED FIRST.** With the database unreachable
     * postgres.js throws a plain `Error`, so the class reads `Error` and says nothing while the
     * code reads `ECONNREFUSED` and answers the question outright.
     */
    formatStage: (stage: string, errorClass: string, errorCode?: string) =>
      `Tahap: ${stage}. ${errorCode ? `Kode: ${errorCode}. ` : ''}Jenis: ${errorClass}. Kalau kodenya ECONNREFUSED, jalankan \`npm run db:up\`.`,
    /** The response was not JSON at all — usually a crash page or a proxy in the way. */
    formatUnreadable: (status: number) =>
      `Jawaban server (HTTP ${status}) bukan JSON. Kemungkinan route-nya error sebelum menjawab — lihat log dev server.`,
    /** The fetch never completed: offline, DNS, connection refused. */
    formatNetwork: (name: string) =>
      `Permintaan tidak sampai ke server (${name}). Cek apakah dev server masih jalan.`,
    formatTimedOut:
      'Permintaan melewati batas waktu 45 detik. Draf MUNGKIN sudah tersimpan — muat ulang halaman ini dan lihat.',
    /** What `validateAdvice` threw away, listed rather than counted. */
    formatRejected: (n: number, first: string) =>
      `${n} saran dari model dibuang karena bentuknya tidak sah (${first}). Isi tulisannya tidak berubah.`,

    // ── auto-translate ────────────────────────────────────────────────────
    translate: 'Terjemahkan otomatis',
    /**
     * **IT NAMES THE DESTINATION, BECAUSE THE BUTTON PUSHES RATHER THAN PULLS
     * (2026-07-31).** The first version was mounted on the target tab and said *"dari
     * Bahasa Indonesia"*, which meant the workflow was: finish the Indonesian, navigate to
     * an empty English tab, press a button, press Simpan. **The starting point is that the
     * other article does not exist yet, and nobody navigates to a blank tab to create one.**
     *
     * The older note below it is kept because the trap it records is still live: the first
     * draft of the label returned the tab's OWN language, so the English tab offered
     * *"terjemahkan otomatis dari bahasa Inggris"*. A label that is wrong-but-plausible only
     * shows up when somebody reads it, so the direction is spelled from `currentTab` once.
     */
    translateTo: (currentTab: string) =>
      currentTab === 'id' ? 'ke bahasa Inggris' : 'ke Bahasa Indonesia',
    translateHint:
      'Menerjemahkan artikel ini ke bahasa yang satu lagi memakai model, lalu MENYIMPANNYA sebagai draf di sana. Tab yang kamu buka sekarang tidak berubah. Tulisan bahasa Inggris seharusnya ditulis ulang dan bukan diterjemahkan, jadi anggap hasilnya titik awal — buka tabnya dan perbaiki sebelum diterbitkan.',
    translateNoSource:
      'Simpan dulu artikel ini (Format otomatis atau Simpan), baru bisa diterjemahkan.',
    translating: 'Menerjemahkan…',
    translateDone: (n: number) => `Selesai: ${n} potongan teks diterjemahkan dan disimpan sebagai draf.`,
    translateFailed: 'Terjemahan gagal.',
    translateTimedOut:
      'Permintaan melewati batas waktu. Tidak ada yang berubah — artikel panjang bisa makan waktu, coba lagi.',
    /** What the target tab is called, for the note that says where the draft landed. */
    translateOtherTab: (currentTab: string) => (currentTab === 'id' ? 'English' : 'Bahasa Indonesia'),
    /** The overwrite guard Miftah asked for. Two taps, and the second one names the cost. */
    /*
     * **THE GUARD MOVED FROM THE FORM TO THE TARGET ROW (2026-07-31).** It used to warn that
     * *"this form already has content"*, because the button filled the form you were looking
     * at. Now it writes the OTHER locale, so what is at risk is a stored article in a tab the
     * operator is not looking at — which is strictly more worth confirming, and it is the only
     * thing on this surface that can destroy work without showing it happening.
     */
    translateConfirmTitle: 'Versi bahasa lain sudah ada isinya.',
    translateConfirmBody:
      'Menerjemahkan sekarang akan MENIMPA artikel yang sudah tersimpan di tab bahasa satunya, termasuk suntingan yang sudah kamu buat di sana. Yang sudah terbit tetap terbit, tapi teksnya berubah.',
    translateConfirmYes: 'Ya, timpa versi bahasa lain',
    translateConfirmNo: 'Batal',
    /** Reported, never blocking — see `verifyBlogTranslation`. */
    translateUntranslated: (n: number) =>
      `${n} potongan kembali sama persis dengan aslinya. Biasanya wajar (nama diri, angka), sesekali berarti modelnya melewatkan baris itu.`,

    save: 'Simpan',
    saving: 'Menyimpan…',
    saved: 'Tersimpan.',
    /*
     * **THE SAME COMPLAINT APPLIES HERE AND IS FIXED THE SAME WAY.** *"Gagal menyimpan."* was
     * one sentence for a 422, a 409, a 404, a 503 and a dead network. `saveFailed` stays as the
     * last-resort arm; the reusable `format*` builders above are shared rather than duplicated,
     * because two spellings of *"HTTP 503"* on one screen is how they drift.
     */
    saveFailed: 'Gagal menyimpan, tanpa keterangan dari server. Lihat log dev server.',
    saveExists: 'Sudah ada dokumen untuk bahasa ini (HTTP 409). Muat ulang halaman lalu edit yang ada.',

    /*
     * ── SIMPAN & TERBITKAN, AND THE LINK THAT FOLLOWS IT (2026-07-31) ────────
     *
     * The workflow Miftah described ends with *"Check the new published article on a new
     * tab"*, and until now that meant: save, go back to the list, find the row, press the
     * Publik chip. Two of those four steps are navigation.
     *
     * **IT IS A SECOND BUTTON RATHER THAN A CHANGE TO `Simpan`.** Publishing is a state
     * change with its own event, its own refusals and no way back to draft (A6-21), so a
     * single button that sometimes published would be the one control on this surface whose
     * effect the operator could not predict from its label.
     */
    savePublish: 'Simpan & terbitkan',
    savePublishing: 'Menerbitkan…',
    savePublished: 'Terbit.',
    /** After a publish, and whenever the row is already published. */
    viewArticle: 'Lihat artikel',
    viewArticleTitle: 'Buka halaman publiknya di tab baru',
    /**
     * A publish refusal that is NOT about the prose. `RULE_LINE` covers the lint; these are
     * the state-machine ones, and `id-not-published` is the one an operator will actually
     * hit — the English cannot go out before the Indonesian.
     */
    publishRefused: (reason: string) => `Belum bisa diterbitkan: ${reason}`,
    saveTimedOut:
      'Permintaan melewati batas waktu. Tidak ada yang tersimpan — coba lagi; basis data mungkin sedang bangun dari tidur.',

    /*
     * **`lintClean` IS DELETED WITH THE STANDING PANEL (2026-07-31).** The panel renders only
     * when there is something to say, so there is no state in which "Bersih." appears — and a
     * copy key with no call site is a key somebody re-adds a render for.
     */
    lintTitle: 'Lint',
    lintErrors: (n: number) => `${n} kesalahan — menolak simpan`,
    lintWarnings: (n: number) => `${n} peringatan — menolak terbit, bukan simpan`,
    field: {
      title: 'Judul',
      description: 'Deskripsi',
      body: 'Badan',
      hero: 'Gambar',
      slug: 'slug',
    } satisfies Record<string, string>,

    previewTitle: 'Pratinjau',
    /*
     * **`previewStale` IS DELETED, NOT REWORDED.** It said *"satu simpan di belakang"* and
     * that stopped being true when `Format otomatis` began writing the draft row and
     * navigating (design R5). A hint that describes a staleness the pane no longer has
     * teaches an operator to distrust what they are looking at, which is worse than no hint.
     *
     * `Simpan` also navigates on a create, and on an update the pane re-renders from the
     * server on the next load — so the only way to see stale prose here is to type without
     * pressing either button, which is the state the two buttons exist to leave.
     */
    /** The label above the previewed outline. A PROP to `ArticleToc`, so it needs no `t()`. */
    previewToc: 'Di dalam tulisan ini',
    /**
     * **THIS ONE STAYS.** `Prose` resolves the locale itself, so an `en` document previewed
     * by an Indonesian admin shows `/arcana/the-moon` where the live page shows
     * `/en/arcana/the-moon`. A6 accepted that and put the sentence on screen; the markdown
     * editor changes nothing about it.
     */
    previewHref:
      'Tautan di pratinjau memakai bahasa admin, bukan bahasa dokumen. Bentuk path-nya tetap diperiksa oleh lint.',
    previewEmpty: 'Belum ada yang tersimpan untuk bahasa ini.',
  },
} as const;

/**
 * One line per rule, for the lint panel. **The rule name alone is not a sentence a
 * person can act on**, and the editor is where the author is still writing.
 *
 * Falls back to the rule name rather than throwing: a new rule with no line here is a
 * slightly worse message, not a broken panel.
 */
export const RULE_LINE: Partial<Record<LintRule, string>> = {
  malay: 'Kata Melayu, bukan Indonesia.',
  therapy: 'Bahasa terapi, diagnosis, atau penyembuhan.',
  tics: 'Kosakata mistik generik (`en`).',
  'closing-offer': 'Tawaran bantuan di penutup (`en`).',
  'card-names': 'Nama kartu diterjemahkan atau dikarang.',
  markup: 'Ada tag atau entitas HTML di dalam teks.',
  'app-secrets': 'Menjelaskan cara kerja aplikasi ini.',
  'span-adjacency': 'Dua span menempel jadi satu kata.',
  'bare-path': 'Path harus telanjang: tanpa awalan bahasa, tanpa http, tanpa huruf besar.',
  'dead-anchor': 'Anchor ini tidak menunjuk judul mana pun di dokumen ini.',
  'heading-id': 'Ada judul tingkat 2 tanpa id — daftar isi akan bolong.',
  'heading-id-unique': 'Dua judul memakai id yang sama.',
  'title-length': 'Judul lebih dari 110 karakter.',
  'description-band': 'Deskripsi di luar 80–158 karakter.',
  'quote-source': 'Kutipan tanpa sumber.',
  'hero-pair': 'Teks alternatif gambar terlalu pendek atau hanya mengulang nama kartu.',
  'orientation-anchors': 'Artikel peluncuran ini wajib punya tiga anchor orientasi.',
  'word-floor': 'Artikel peluncuran ini di bawah 1100 kata.',
};
