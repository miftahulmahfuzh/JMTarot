import type { LoreDoc } from '@/content/types';

/**
 * The Hierophant (V), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Taurus, fixed earth; Hebrew letter Vav (the nail); Golden Dawn title "Magus
 *     of the Eternal Gods".
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: a hierophant between two pillars, right hand raised in
 *     benediction, two tonsured ministers kneeling below, crossed keys at his feet.
 *   - Our painting (`public/cards/05_hierophant.webp`): the figure is raised on a
 *     tall stone pulpit under a ROSE WINDOW, BOTH hands lifted rather than one;
 *     TWO hooded supplicants kneel far below on a flooded floor; rows of candles
 *     line the walls; a shallow red basin sits on the pulpit's ledge, and the
 *     water on the floor is dark.
 *
 * **THE ENGLISH DOCUMENT MAY NOT USE THE WORD `sacred`** -- it is on `EN_TICS`,
 * and this is the card that reaches for it hardest. The Indonesian has no
 * equivalent restriction; `suci` is ordinary.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS.
 *
 * **ENGINE: POLARITY IS `neutral` AND DOES NOT FLIP.** yesno `yes` -> `no`.
 */
export const theHierophantId: LoreDoc = {
  slug: 'the-hierophant',
  locale: 'id',
  cardId: 5,
  anchor: 'hebrewLetter',

  title: 'Arti Kartu The Hierophant (V) — Tarot Major Arcana',
  description:
    'The Hierophant (V) adalah pelajaran yang diwariskan dan masih terpakai. Arti ' +
    'tegak, terbalik, dan huruf Vav serta lambang Taurus di baliknya.',
  h1: 'Arti Kartu The Hierophant (V)',
  standfirst:
    'Kartu kelima Major Arcana. Bukan kartu agama — kartu aturan yang sudah ada ' +
    'sebelum kamu lahir dan ternyata masih benar.',
  imageAlt:
    'Sesosok berjubah berdiri tinggi di mimbar batu di bawah jendela mawar dengan ' +
    'kedua tangan terangkat; dua orang berkerudung berlutut jauh di bawahnya di ' +
    'lantai yang tergenang, di antara deretan lilin yang menyala.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Hierophant menunjuk pada sesuatu yang sudah dicoba orang lain ' +
        'sebelum kamu, berkali-kali, dan tetap bertahan. Itu bukan alasan yang lemah. ' +
        'Aturan yang bertahan tiga generasi biasanya bertahan karena ada harganya ' +
        'kalau dilanggar, dan harga itu dibayar oleh orang yang sudah tidak ada.',
    },
    {
      kind: 'paragraph',
      text:
        'Kartu ini paling berguna waktu kamu sedang yakin bahwa keadaanmu unik. ' +
        'Kadang memang unik. Lebih sering ini keadaan yang sudah pernah terjadi ' +
        'ribuan kali, dan sudah ada orang yang menuliskan apa yang biasanya berhasil.',
    },
    {
      kind: 'paragraph',
      text:
        'Muatannya netral, dan itu tepat. Warisan tidak otomatis benar dan tidak ' +
        'otomatis salah; dia cuma tua. Kartu ini menyuruh kamu memeriksa alasannya, ' +
        'bukan menyuruh kamu patuh.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, muatannya tetap netral dan yang berubah adalah tanggal ' +
        'kedaluwarsanya. Aturan yang hidup lebih lama daripada gunanya masih ' +
        'terlihat persis sama dari luar seperti aturan yang masih bekerja.',
    },
    {
      kind: 'paragraph',
      text:
        'Cara membedakannya cuma satu dan cukup merepotkan: cari alasan aslinya. ' +
        'Kalau alasannya masih bisa disebut dan masih berlaku, aturannya hidup. ' +
        'Kalau jawaban terbaik yang bisa ditemukan siapa pun adalah "memang sudah ' +
        'begitu", yang kamu pegang adalah kebiasaan yang memakai baju aturan.',
    },
    {
      kind: 'paragraph',
      text:
        'Jawabannya membalik jadi tidak — bukan karena tradisinya buruk, tapi karena ' +
        'kartu ini terbalik keluar waktu jawaban yang kamu cari sedang diambil dari ' +
        'rak yang isinya tidak pernah diperiksa ulang.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Tegak, ya, dengan satu syarat: pinjam caranya, bukan wibawanya. Terbalik ' +
      'jadi tidak, karena yang sedang kamu ambil dari rak itu bertahan bukan karena ' +
      'masih bekerja, melainkan karena tidak pernah ada yang memeriksanya lagi.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Vav, paku' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Vav, yang berarti paku atau pasak. Sebuah paku tidak punya isi ' +
        'sendiri; kerjanya menyambungkan dua hal supaya jadi satu benda. Dalam ' +
        'tata bahasa Ibrani huruf ini juga berfungsi sebagai kata "dan".',
    },
    {
      kind: 'paragraph',
      text:
        'Untuk kartu tentang warisan, itu keterangan yang tepat dan sekaligus ' +
        'peringatannya. Sambungan bukan sumber. Yang diteruskan lewat kartu ini ' +
        'tidak berasal dari yang meneruskannya, dan orang yang lupa itu mulai ' +
        'mengira dirinya yang membuat aturannya.',
    },

    { kind: 'heading', level: 2, text: 'Taurus, tanah yang tetap' },
    {
      kind: 'paragraph',
      text:
        'Lambangnya Taurus: tanah, dan tetap. Tanda tetap adalah yang menahan musim ' +
        'di tengah, bukan yang membukanya atau menutupnya. Tanah yang tetap adalah ' +
        'hal paling lambat berubah dari dua belas kemungkinan, dan itu persis yang ' +
        'diminta dari sebuah lembaga.',
    },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn menyebutnya Magus of the Eternal Gods. Perhatikan bahwa dia ' +
        'tetap seorang magus, seperti kartu nomor satu — bedanya kartu satu ' +
        'mengarahkan kemampuannya sendiri, dan yang ini mengarahkan kemampuan yang ' +
        'diwariskan padanya.',
    },

    { kind: 'heading', level: 2, text: 'Mimbar, dan jarak ke lantai' },
    {
      kind: 'paragraph',
      text:
        'Di kartu yang lebih dikenal, dia duduk dan mengangkat satu tangan memberi ' +
        'berkat. Di kartu kami dia berdiri di mimbar yang tinggi dan mengangkat ' +
        'keduanya, dan dua orang yang berlutut ada jauh sekali di bawahnya.',
    },
    {
      kind: 'paragraph',
      text:
        'Jarak itulah isi kartunya. Ajaran yang diteruskan dari atas mimbar sampai ' +
        'ke lantai dengan utuh; yang tidak sampai adalah pertanyaan yang mau ' +
        'ditanyakan dari lantai ke atas.',
    },
    {
      kind: 'paragraph',
      text:
        'Lantainya tergenang dan airnya gelap. Deretan lilin di dinding masih ' +
        'menyala dan tidak ada yang memadamkannya. Bangunan ini masih berjalan, ' +
        'terlepas dari apa yang sudah terjadi di dalamnya.',
    },

    { kind: 'heading', level: 2, text: 'Angka lima' },
    {
      kind: 'paragraph',
      text:
        'Lima adalah angka pertama yang mengganggu: setelah empat menutup ruangan, ' +
        'lima adalah sesuatu yang tidak muat. Dalam banyak susunan, lima adalah ' +
        'angka pergolakan. Menempatkan lembaga di sini adalah pengakuan bahwa ' +
        'lembaga muncul justru karena ada yang tidak muat.',
    },
    { kind: 'cardRef', slug: 'the-emperor', text: 'Baca lore The Emperor (IV)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya menunjuk pada satu orang yang sudah pernah ' +
        'melewati apa yang kamu lewati sekarang, dan yang belum kamu tanyai.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang sudah lewat dia hampir selalu keluarga ' +
        'atau sekolah — sesuatu yang dipasang di kamu sebelum kamu sempat memilih. ' +
        'Di posisi yang menanti di depan, dia menawarkan cara yang sudah ada, dan ' +
        'menawarkan itu berbeda dari menyuruh.',
    },
  ],

  questions: [
    {
      q: 'The Hierophant berarti saya harus ikut aturan?',
      a:
        'Tidak. Dia berarti aturannya sudah ada dan pantas diperiksa sebelum ' +
        'dibuang. Kartu ini netral: memeriksa dan menolak sama sahnya dengan ' +
        'memeriksa dan memakai.',
    },
    {
      q: 'Apakah kartu ini selalu soal agama?',
      a:
        'Jarang. Dia soal apa pun yang diteruskan sebagai cara yang benar: profesi, ' +
        'keluarga, sekolah, tempat kerja. Gambarnya memakai bahasa rumah ibadah ' +
        'karena itu contoh tertua, bukan karena itu satu-satunya.',
    },
    {
      q: 'Bagaimana kalau warisan itu justru merugikan saya?',
      a:
        'Maka kartu ini terbalik untuk pertanyaanmu, dan pertanyaan pemeriksanya ' +
        'tetap sama: apa alasan aslinya, dan apakah alasan itu masih berlaku. Kalau ' +
        'tidak ada yang bisa menyebutkannya, itu sudah jawabannya.',
    },
    {
      q: 'Bedanya The Hierophant dan The High Priestess apa?',
      a:
        'The Hierophant mengucapkan yang sudah diketahui bersama, keras-keras, dari ' +
        'tempat tinggi. The High Priestess menyimpan yang hanya diketahui satu orang ' +
        'dan tidak mengucapkannya sama sekali.',
    },
  ],
};

export default theHierophantId;
