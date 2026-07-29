import type { LoreDoc } from '@/content/types';

/**
 * The Sun (XIX), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Sol; Hebrew letter Resh (the head); Golden Dawn title "Lord of the Fire of
 *     the World". https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: a child on a white horse under a large sun, a red banner, a
 *     wall of sunflowers behind.
 *   - Our painting (`public/cards/19_sun.webp`): the child rides a pale horse with
 *     both arms flung wide; the sun above is WHITE and flat rather than golden;
 *     the sunflowers behind are BLACKENED AND DEAD, and their heads are bowed; a
 *     tattered banner hangs from the horse, and a red sun-wheel is painted on the
 *     ground beneath them.
 *
 * **`Sol` IS THE LABEL FOR THIS ATTRIBUTION, NOT "THE SUN".** The label must never
 * collide with a card name, and on this page the naive spelling renders
 * "The Sun: The Sun". `correspondence.test.ts` asserts it across all twenty-two.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS.
 *
 * ENGINE: yesno `yes` -> `no`; polarity `light` -> `shadow`; stage `reckoning`.
 * Root card: `reduce(19)` is 1, The Magician.
 */
export const theSunId: LoreDoc = {
  slug: 'the-sun',
  locale: 'id',
  cardId: 19,
  anchor: 'sign',

  title: 'Arti Kartu The Sun (XIX) — Tarot Major Arcana',
  description:
    'The Sun (XIX) adalah kebenaran yang terang dan menghangatkan. Arti tegak, ' +
    'terbalik, dan lambang Sol serta unsur api yang berdiri di baliknya.',
  h1: 'Arti Kartu The Sun (XIX)',
  standfirst:
    'Kartu kesembilan belas Major Arcana. Bukan kartu kebahagiaan — kartu tengah ' +
    'hari, waktu tidak ada lagi yang bisa disembunyikan oleh siapa pun.',
  imageAlt:
    'Seorang anak menunggang kuda pucat dengan kedua tangan terentang lebar di ' +
    'bawah matahari putih yang datar; di belakangnya ladang bunga matahari yang ' +
    'sudah menghitam dan menunduk, dan di tanah ada roda matahari berwarna merah.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Sun bukan janji bahwa kamu akan senang. Dia laporan bahwa ' +
        'sesuatu akhirnya kelihatan seluruhnya. Kalau yang kelihatan itu bagus, ' +
        'kartunya terasa seperti kabar baik. Sering kali memang bagus.',
    },
    {
      kind: 'paragraph',
      text:
        'Bagian yang jarang disebut: cahaya sebesar itu tidak memilih. Yang sudah ' +
        'lama kamu tahu tapi kamu simpan di sudut ikut kelihatan, dan yang sudah lama ' +
        'ditutupi orang lain juga. Kartu ini tidak menyaring.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang dia tawarkan sebagai gantinya adalah berhentinya pekerjaan menyimpan. ' +
        'Menjaga sesuatu tetap tidak terlihat memakan tenaga setiap hari, dan tenaga ' +
        'itu kembali seluruhnya begitu tidak ada lagi yang perlu dijaga.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, silau yang justru menutupi detailnya. Cahayanya masih ada dan ' +
        'jumlahnya masih sama; yang hilang adalah kemampuan melihat bentuk di ' +
        'dalamnya.',
    },
    {
      kind: 'paragraph',
      text:
        'Bentuknya biasanya keterusterangan yang terlalu banyak. Semuanya dikatakan, ' +
        'sekaligus, dan hasilnya bukan kejelasan melainkan orang yang menutup mata. ' +
        'Terang tanpa takaran bekerja persis seperti gelap.',
    },
    {
      kind: 'paragraph',
      text:
        'Jawabannya membalik jadi tidak, dan yang ditolak bukan kejujurannya. Yang ' +
        'ditolak adalah menyampaikan semuanya sekaligus, karena yang mendengarnya ' +
        'juga punya batas dan batas itu bukan kelemahan mereka.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Tegak, ya, dan ya yang lugas: yang perlu kamu tahu sudah kelihatan. Terbalik ' +
      'jadi tidak — bukan karena kamu keliru, tapi karena menyampaikan seluruhnya ' +
      'sekaligus akan membuat orang menutup mata.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Sol, dan kenapa bukan namanya kartu ini' },
    {
      kind: 'paragraph',
      text:
        'Lambangnya matahari, dan dalam tabel astrologi dia disebut Sol. Nama Latin ' +
        'itu dipakai bukan untuk gaya-gayaan, tapi supaya tidak bertabrakan: kartu ' +
        'ini sudah bernama The Sun, dan menuliskan lambangnya sebagai The Sun juga ' +
        'akan menghasilkan baris yang berbunyi The Sun: The Sun.',
    },
    {
      kind: 'paragraph',
      text:
        'Hal yang sama berlaku untuk kartu nomor dua. Lambangnya bulan, dan disebut ' +
        'Bulan — sementara kartu nomor delapan belas bernama The Moon. Dua benda ' +
        'langit, dua kartu, dan empat nama yang harus dijaga supaya tidak tertukar.',
    },

    { kind: 'heading', level: 2, text: 'Resh, kepala' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Resh, yang berarti kepala. Bukan mata, bukan hati: kepala — bagian ' +
        'yang menyusun keterangan jadi kesimpulan. Untuk kartu tentang kejelasan itu ' +
        'pilihan yang lebih dingin daripada yang diduga orang dari gambarnya.',
    },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn menyebutnya Lord of the Fire of the World. Api dunia, bukan api ' +
        'langit: yang dimaksud panas yang jatuh ke tanah dan mengenai semua yang ada ' +
        'di sana.',
    },

    { kind: 'heading', level: 2, text: 'Bunga matahari yang sudah mati' },
    {
      kind: 'paragraph',
      text:
        'Di kartu yang lebih dikenal, ada dinding bunga matahari yang mekar penuh di ' +
        'belakang anak itu, dan semuanya menghadap kepadanya. Isyaratnya sederhana: ' +
        'semuanya baik-baik saja.',
    },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami bunga-bunga itu hitam dan menunduk. Mataharinya putih dan ' +
        'datar, bukan emas. Anaknya tetap merentangkan kedua tangan, dan panji di ' +
        'kudanya sudah robek.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang tersisa dari gagasan aslinya justru jadi lebih jelas karena itu. ' +
        'Kegembiraan anak itu tidak bergantung pada keadaan di sekelilingnya, dan ' +
        'gambar ini membuktikannya dengan cara menghapus keadaan yang mendukungnya.',
    },

    { kind: 'heading', level: 2, text: 'Sembilan belas, dan akarnya' },
    {
      kind: 'paragraph',
      text:
        'Sembilan belas dilipat menjadi satu, dan satu adalah The Magician. Dua kartu ' +
        'melipat ke sana — yang satu lagi Wheel of Fortune — dan ketiganya soal ' +
        'tenaga yang bekerja: yang dipegang, yang berputar, dan yang menyinari.',
    },
    { kind: 'cardRef', slug: 'the-magician', text: 'Baca lore The Magician (I)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya menandai satu hal yang hari ini akan berhenti ' +
        'jadi rahasia. Itu tidak selalu menyenangkan dan hampir selalu melegakan.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang menanti di depan dia salah satu kartu ' +
        'paling langsung di tumpukan: yang kamu tanyakan akan kelihatan. Di posisi ' +
        'yang sudah lewat, dia menunjuk pada masa waktu semuanya sempat jelas, dan ' +
        'itu berguna untuk dibandingkan dengan sekarang.',
    },
  ],

  questions: [
    {
      q: 'The Sun berarti semuanya akan baik-baik saja?',
      a:
        'Dia berarti semuanya akan kelihatan. Itu sering kali kabar baik dan tidak ' +
        'selalu, karena cahaya sebesar itu tidak memilih apa yang diteranginya.',
    },
    {
      q: 'Kenapa bunga mataharinya mati di kartu kami?',
      a:
        'Supaya kegembiraan anak itu berdiri sendiri. Di kartu lama, bunga yang mekar ' +
        'membuatnya masuk akal; di sini tidak ada yang mendukungnya, dan dia tetap ' +
        'merentangkan tangan.',
    },
    {
      q: 'Terbalik, apakah artinya saya harus menyembunyikan sesuatu?',
      a:
        'Tidak. Terbaliknya soal takaran, bukan soal kejujuran. Semuanya sekaligus ' +
        'membuat orang menutup mata, dan hasil akhirnya sama saja dengan tidak ' +
        'mengatakan apa-apa.',
    },
    {
      q: 'Bedanya The Sun dan Judgement apa?',
      a:
        'The Sun membuat sesuatu kelihatan. Judgement memintamu menjawabnya. Yang ' +
        'satu soal penerangan, yang satu soal panggilan.',
    },
  ],
};

export default theSunId;
