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
    heroAlt: 'Teks alternatif gambar',
    heroAltHint:
      'Gambarkan lukisannya untuk orang yang tidak bisa melihatnya, jangan ulangi nama kartunya — namanya sudah ada di judul dan di teks. Minimal 60 karakter.',

    blocks: 'Blok',
    addBelow: 'Tambah blok di bawah',
    moveUp: '↑',
    moveDown: '↓',
    remove: '⨯',
    kind: {
      heading: 'Judul bagian',
      paragraph: 'Paragraf',
      list: 'Daftar',
      quote: 'Kutipan',
      cardRef: 'Kartu',
    } satisfies Record<string, string>,
    level: 'Tingkat',
    anchorId: 'id (anchor)',
    ordered: 'Bernomor (<ol>)',
    orderedHint: 'Semantik, bukan gaya. Lima langkah berurutan yang dirender sebagai bulan adalah prosedur yang berbohong.',
    quoteSource: 'Sumber',
    listItem: 'Butir',
    addItem: 'Tambah butir',
    cardSlug: 'Kartu',
    spanKind: { text: 'teks', em: 'miring', strong: 'tebal', link: 'tautan' } satisfies Record<
      string,
      string
    >,
    addSpan: 'Tambah span',
    spanPath: 'path',
    plainToggle: 'teks biasa',
    plainHint: 'Simpan sebagai satu string, tanpa penekanan dan tanpa tautan.',
    /** A6-31. The strip is the diff. */
    joined: 'Hasil gabungan',
    joinedHint:
      'Titik tengah menandai spasi di batas antar-span. Spasi itu tidak ditambahkan oleh apa pun — kalau hilang, dua kata menempel jadi satu.',
    glued: 'Dua span menempel jadi satu kata di sini.',

    // ── auto-translate ────────────────────────────────────────────────────
    translate: 'Terjemahkan otomatis',
    /**
     * **THE ARGUMENT IS THE TAB YOU ARE ON, AND THE ANSWER NAMES THE OTHER ONE.** The
     * first draft returned the tab's own language, so the English tab offered
     * *"terjemahkan otomatis dari bahasa Inggris"* — translate English from English.
     * Caught by reading the heading in a screenshot, which is the only place a label
     * that is wrong-but-plausible ever shows up.
     */
    translateFrom: (currentTab: string) =>
      currentTab === 'id' ? 'dari bahasa Inggris' : 'dari Bahasa Indonesia',
    translateHint:
      'Mengisi formulir ini dari versi bahasa lain memakai model. Hasilnya BELUM tersimpan — baca, perbaiki, lalu Simpan. Tulisan bahasa Inggris seharusnya ditulis ulang, bukan diterjemahkan, jadi anggap ini titik awal dan bukan hasil akhir.',
    translateNoSource: 'Belum ada versi bahasa lain untuk diterjemahkan.',
    translating: 'Menerjemahkan…',
    translateDone: (n: number) => `Selesai: ${n} potongan teks terisi. Belum tersimpan.`,
    translateFailed: 'Terjemahan gagal.',
    translateTimedOut:
      'Permintaan melewati batas waktu. Tidak ada yang berubah — artikel panjang bisa makan waktu, coba lagi.',
    /** The overwrite guard Miftah asked for. Two taps, and the second one names the cost. */
    translateConfirmTitle: 'Formulir ini sudah ada isinya.',
    translateConfirmBody:
      'Terjemahan otomatis akan MENIMPA seluruh isi formulir bahasa ini — judul, deskripsi, dan semua blok. Yang sudah tersimpan di basis data tidak ikut berubah sampai kamu menekan Simpan.',
    translateConfirmYes: 'Ya, timpa formulirnya',
    translateConfirmNo: 'Batal',
    /** Reported, never blocking — see `verifyBlogTranslation`. */
    translateUntranslated: (n: number) =>
      `${n} potongan kembali sama persis dengan aslinya. Biasanya wajar (nama diri, angka), sesekali berarti modelnya melewatkan baris itu.`,

    save: 'Simpan',
    saving: 'Menyimpan…',
    saved: 'Tersimpan.',
    saveFailed: 'Gagal menyimpan.',
    saveTimedOut:
      'Permintaan melewati batas waktu. Tidak ada yang tersimpan — coba lagi; basis data mungkin sedang bangun dari tidur.',

    lintTitle: 'Lint',
    lintClean: 'Bersih.',
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
    /** A6-32, amended. See the page's header: `Prose` is a SERVER component. */
    previewStale:
      'Pratinjau menampilkan versi yang TERSIMPAN, bukan yang sedang kamu ketik. Simpan untuk memperbaruinya.',
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
