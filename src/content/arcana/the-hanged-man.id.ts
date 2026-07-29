import type { LoreDoc } from '@/content/types';

/**
 * The Hanged Man (XII), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Neptune (one of the two places this deck takes a MODERN planet -- the other
 *     is Judgement); Hebrew letter Mem (water); Golden Dawn title "Spirit of the
 *     Mighty Waters".
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: a man suspended by one ankle from a T-shaped living tree, hands
 *     behind his back, a halo around his head, his face serene.
 *   - Our painting (`public/cards/12_hanged_man.webp`): the tree is BARE and
 *     enormous; the figure hangs by one ankle, head down, arms loose, with NO
 *     halo; below him is a round stone basin of dark water; there are ruins on the
 *     horizon under a low, dim sky, and a skull among the roots.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS.
 *
 * **ENGINE: POLARITY IS `shadow` UPRIGHT AND `light` REVERSED.** A reversed
 * Hanged Man is the LESS dark reading by the engine's own reckoning, and the page
 * prints that strip directly above this prose -- a document calling the reversal
 * darker contradicts what the reader can see. yesno `no` -> `yes`, the same flip.
 * Root card: `reduce(12)` is 3, The Empress.
 */
export const theHangedManId: LoreDoc = {
  slug: 'the-hanged-man',
  locale: 'id',
  cardId: 12,
  anchor: 'hebrewLetter',

  title: 'Arti Kartu The Hanged Man (XII) — Tarot Major Arcana',
  description:
    'The Hanged Man (XII) adalah berhenti sejenak, dan sudut pandangnya berubah. ' +
    'Arti tegak, terbalik, dan huruf Mem serta unsur air di baliknya.',
  h1: 'Arti Kartu The Hanged Man (XII)',
  standfirst:
    'Kartu kedua belas Major Arcana. Bukan kartu hukuman — kartu berhenti yang ' +
    'dipilih sendiri, dengan harga yang dibayar di muka.',
  imageAlt:
    'Sesosok tergantung terbalik dengan satu pergelangan kaki terikat pada dahan ' +
    'pohon besar yang gundul, kedua tangannya menggantung lemas; di bawahnya ada ' +
    'bejana batu bundar berisi air gelap, dan reruntuhan di kejauhan.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Hanged Man menjawab tidak, dan penolakannya spesifik: bukan pada ' +
        'tujuanmu, tapi pada gerakan berikutnya. Sesuatu perlu berhenti dulu, dan ' +
        'berhentinya bukan istirahat.',
    },
    {
      kind: 'paragraph',
      text:
        'Bedanya begini. Istirahat adalah berhenti supaya bisa melanjutkan cara yang ' +
        'sama dengan tenaga yang lebih segar. Yang diminta kartu ini adalah berhenti ' +
        'cukup lama sampai cara yang sama berhenti terasa seperti satu-satunya cara.',
    },
    {
      kind: 'paragraph',
      text:
        'Dan itu tidak nyaman, karena selama berhenti kamu tetap kelihatan seperti ' +
        'orang yang tidak melakukan apa-apa. Kartu ini tidak menawarkan cara untuk ' +
        'terlihat sibuk selama proses itu. Bagian itu memang ongkosnya.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, muatannya justru menjadi terang — kartu ini bermuatan bayangan ' +
        'waktu tegak dan terang waktu dibalik, jadi membaca terbaliknya sebagai versi ' +
        'yang lebih buruk bertentangan langsung dengan keterangannya.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang dia tunjuk terbalik adalah menunggu yang dipakai untuk menghindar. ' +
        'Bentuknya sama persis dengan berhenti yang benar, dan bedanya cuma satu: ' +
        'berhenti yang benar mengubah cara pandang, dan menghindar mengulang cara ' +
        'pandang yang sama setiap minggu dengan kalimat yang lebih halus.',
    },
    {
      kind: 'paragraph',
      text:
        'Karena itu jawabannya membalik jadi ya. Bukan ya untuk terus menunggu — ya ' +
        'untuk hal yang sudah kamu lihat dari sudut baru beberapa waktu lalu, dan ' +
        'yang sejak itu cuma kamu tunda.',
    },
  ],

  yesno: {
    upright: 'no',
    reversed: 'yes',
    note:
      'Tegak, tidak, dan yang ditolak bukan tujuanmu melainkan gerakan berikutnya: ' +
      'ada yang harus berhenti dulu. Terbalik membalik jadi ya, karena berhentinya ' +
      'sudah selesai bekerja dan yang tersisa tinggal penundaan.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Mem, air' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Mem, yang berarti air. Dalam tradisi, Mem adalah salah satu dari ' +
        'tiga huruf induk, dan yang dia wakili adalah unsur yang tidak punya bentuk ' +
        'sendiri sama sekali — yang bentuknya selalu bentuk wadahnya.',
    },
    {
      kind: 'paragraph',
      text:
        'Untuk kartu tentang berhenti, itu keterangan yang tepat. Yang berubah selama ' +
        'jeda bukan keadaannya, melainkan wadah yang kamu pakai untuk menampungnya. ' +
        'Golden Dawn menyebutnya Spirit of the Mighty Waters.',
    },

    { kind: 'heading', level: 2, text: 'Neptunus, dan planet yang datang belakangan' },
    {
      kind: 'paragraph',
      text:
        'Planetnya Neptunus, dan ini salah satu dari dua tempat tumpukan ini memakai ' +
        'planet modern — yang satu lagi Judgement. Neptunus baru ditemukan pada abad ' +
        'kesembilan belas, jadi susunan Golden Dawn yang asli tidak memuatnya.',
    },
    {
      kind: 'paragraph',
      text:
        'Itu disebutkan di sini bukan untuk membela penempatannya, tapi karena ' +
        'menyembunyikannya akan membuat seluruh tabel di halaman ini terdengar lebih ' +
        'tua daripada yang sebenarnya.',
    },

    { kind: 'heading', level: 2, text: 'Satu pergelangan kaki, dan tidak ada lingkaran cahaya' },
    {
      kind: 'paragraph',
      text:
        'Di kartu yang lebih dikenal, pohonnya hidup dan berbentuk huruf T, tangannya ' +
        'terikat di belakang punggung, dan ada lingkaran cahaya di sekeliling ' +
        'kepalanya. Wajahnya tenang. Gambar itu bilang: dia sedang mendapatkan ' +
        'sesuatu.',
    },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami pohonnya gundul dan jauh lebih besar, tangannya menggantung ' +
        'lemas, dan tidak ada lingkaran cahaya sama sekali. Yang tersisa cuma ' +
        'posisinya.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bawahnya ada bejana batu bundar berisi air gelap, persis di titik tempat ' +
        'kepalanya akan berada kalau talinya putus. Kartu ini tidak menjanjikan bahwa ' +
        'jedanya aman.',
    },

    { kind: 'heading', level: 2, text: 'Dua belas, dan akarnya' },
    {
      kind: 'paragraph',
      text:
        'Dua belas dilipat menjadi tiga, dan tiga adalah The Empress. Itu pasangan ' +
        'yang masuk akal: kartu tentang sesuatu yang tumbuh berdiri di belakang kartu ' +
        'tentang berhenti, karena yang tumbuh tidak bisa dipercepat dan yang ' +
        'menunggunya harus diam.',
    },
    { kind: 'cardRef', slug: 'the-empress', text: 'Baca lore The Empress (III)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya menyarankan satu hal untuk tidak dikerjakan ' +
        'hari ini. Itu terdengar ringan dan biasanya justru yang paling sulit.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang sedang berjalan dia sering akurat dan ' +
        'tidak disukai: kamu memang sedang tergantung. Di posisi yang sudah lewat, ' +
        'dia menunjuk pada masa berhenti yang ternyata mengubah arah, walaupun waktu ' +
        'itu terasa seperti kalah.',
    },
  ],

  questions: [
    {
      q: 'The Hanged Man berarti saya sedang dihukum?',
      a:
        'Tidak. Di gambar aslinya posisi itu memang hukuman bagi pengkhianat, tapi ' +
        'kartunya membacanya sebagai posisi yang dipilih. Yang membedakan cuma satu: ' +
        'apakah kamu bisa turun kalau mau.',
    },
    {
      q: 'Berapa lama jedanya?',
      a:
        'Sampai cara lama berhenti terasa seperti satu-satunya cara. Itu bukan ' +
        'ukuran waktu, dan kartu ini memang tidak memberikan ukuran waktu.',
    },
    {
      q: 'Kenapa terbalik justru lebih terang?',
      a:
        'Karena muatan tegaknya bayangan, dan membalik kartu membalik muatannya. ' +
        'Terbalik dia berhenti menyuruh menunggu dan mulai menyuruh bergerak, dan ' +
        'jawabannya ikut membalik jadi ya.',
    },
    {
      q: 'Bedanya The Hanged Man dan The Hermit apa?',
      a:
        'The Hermit menjauh untuk mendengar dirinya sendiri, dan dia berjalan. The ' +
        'Hanged Man tidak ke mana-mana dan tidak melakukan apa-apa; yang berubah cuma ' +
        'arah pandangnya.',
    },
  ],
};

export default theHangedManId;
