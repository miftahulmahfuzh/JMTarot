import type { LoreDoc } from '@/content/types';

/**
 * The Lovers (VI), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Gemini, mutable air; Hebrew letter Zayin (the sword); Golden Dawn title
 *     "Children of the Voice Divine, the Oracles of the Mighty Gods".
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: a naked man and woman under the angel Raphael, a serpent in the
 *     tree behind her and a flaming tree behind him, a mountain between them.
 *   - Our painting (`public/cards/06_lovers.webp`): two figures stand side by side,
 *     hands joined and MANACLED together with a short chain; the winged shape above
 *     them is a black silhouette against the moon, not a bright angel; a black
 *     snake coils on the ground at their left; white roses grow among dead thorns;
 *     there is blood at their feet.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS.
 *
 * ENGINE: element `air` -- and `SIGNS.gemini.element` is `air`, which is the join
 * `correspondence.test.ts` asserts. yesno `yes` -> `no`; polarity `light` ->
 * `shadow`; stage `beginning`.
 */
export const theLoversId: LoreDoc = {
  slug: 'the-lovers',
  locale: 'id',
  cardId: 6,
  anchor: 'sign',

  title: 'Arti Kartu The Lovers (VI) — Tarot Major Arcana',
  description:
    'The Lovers (VI) adalah pilihan yang diambil dengan seluruh dirimu. Arti tegak, ' +
    'terbalik, dan kenapa kartu penyatuan ini justru berunsur udara.',
  h1: 'Arti Kartu The Lovers (VI)',
  standfirst:
    'Kartu keenam Major Arcana. Bukan kartu asmara — kartu keputusan yang tidak ' +
    'bisa diambil setengah, dan yang menutup pintu lain begitu diambil.',
  imageAlt:
    'Dua sosok berdiri berdampingan dengan tangan yang terikat satu sama lain oleh ' +
    'rantai pendek; di atas mereka sesosok bersayap gelap menutupi bulan, seekor ' +
    'ular hitam melingkar di tanah, dan mawar putih tumbuh di antara duri kering.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Lovers bicara soal satu pilihan yang diambil tanpa menyisakan ' +
        'cadangan. Bagian yang membuatnya berat bukan pilihannya, melainkan ' +
        'penutupannya: begitu diambil, pilihan-pilihan lain berhenti tersedia, dan ' +
        'itu terasa seperti kehilangan meskipun yang kamu pilih benar.',
    },
    {
      kind: 'paragraph',
      text:
        'Karena itu kartu ini sering keluar untuk orang yang tidak sedang bimbang ' +
        'sama sekali. Mereka sudah tahu mau yang mana. Yang belum mereka lakukan ' +
        'adalah melepaskan yang satunya, dan menahan keduanya terasa lebih murah ' +
        'daripada memutuskan.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang dia tawarkan sebagai gantinya adalah keutuhan. Orang yang sudah ' +
        'memutuskan berhenti membelanjakan tenaga untuk mengelola dua kemungkinan, ' +
        'dan tenaga yang kembali dari situ biasanya jauh lebih besar dari yang ' +
        'diperkirakan.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, diri yang terbelah di antara dua arah. Bukan karena kedua arah ' +
        'itu sama baiknya — biasanya tidak — tapi karena memilih satu berarti ' +
        'mengakui sesuatu tentang dirimu sendiri yang belum mau kamu akui.',
    },
    {
      kind: 'paragraph',
      text:
        'Bentuknya kelihatan seperti kehati-hatian dan bekerja seperti pemborosan. ' +
        'Dua kemungkinan yang dipelihara sekaligus menuntut perawatan dua-duanya, ' +
        'dan tidak ada satu pun yang tumbuh, karena tidak ada satu pun yang benar- ' +
        'benar diberi.',
    },
    {
      kind: 'paragraph',
      text:
        'Jawabannya membalik jadi tidak, dan itu bukan tentang pilihannya. Kartu ini ' +
        'terbalik bilang bahwa belum ada yang benar-benar dipilih, jadi belum ada ' +
        'yang bisa dijawab ya.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Tegak, ya, dan ya yang menuntut: ya kalau kamu ikut melepaskan yang tidak ' +
      'dipilih. Terbalik jadi tidak, karena belum ada yang benar-benar diambil — ' +
      'dua kemungkinan yang sama-sama dipelihara bukan sebuah keputusan.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Gemini, dan kenapa kartu ini udara' },
    {
      kind: 'paragraph',
      text:
        'Orang biasanya menyangka kartu penyatuan pasti berunsur air. Yang ini ' +
        'udara, karena lambangnya Gemini, dan itu bukan kekeliruan penempatan. Udara ' +
        'adalah unsur pembedaan: memilah, membandingkan, memisahkan yang ini dari ' +
        'yang itu.',
    },
    {
      kind: 'paragraph',
      text:
        'Jadi kartu ini bukan soal perasaan yang menyatu. Dia soal keputusan yang ' +
        'dibuat dengan jelas. Perasaan bisa memuat dua orang sekaligus tanpa ' +
        'kesulitan; sebuah keputusan tidak bisa.',
    },
    {
      kind: 'paragraph',
      text:
        'Dan Gemini mutable, yang artinya masih bisa berubah bentuk. Kartu ini ' +
        'menempatkan keputusan pada titik sebelum dia mengeras — masih bisa dibatalkan, ' +
        'tapi tidak gratis.',
    },

    { kind: 'heading', level: 2, text: 'Zayin, pedang' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Zayin, yang berarti pedang atau senjata. Untuk kartu yang di ' +
        'kebanyakan tumpukan bergambar dua kekasih, itu pilihan yang tampak aneh ' +
        'sampai kamu ingat apa yang dilakukan sebuah pedang: dia memisahkan satu ' +
        'benda jadi dua bagian.',
    },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn menyebutnya Children of the Voice Divine — anak-anak dari suara. ' +
        'Bukan anak-anak dari cinta. Yang menurunkan mereka adalah sesuatu yang ' +
        'diucapkan, dan ucapan memilih satu kata dan meninggalkan semua kata lain.',
    },

    { kind: 'heading', level: 2, text: 'Rantai pendek di antara dua tangan' },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami tangan keduanya tidak sekadar bergandengan; ada rantai pendek ' +
        'yang mengikat keduanya jadi satu. Sosok bersayap di atas mereka bukan ' +
        'malaikat yang bercahaya, melainkan bayangan hitam yang menutupi bulan.',
    },
    {
      kind: 'paragraph',
      text:
        'Ular yang di kartu lain melingkar di pohon, di sini ada di tanah, di sisi ' +
        'kiri, dan tidak sedang menawarkan apa-apa. Mawar putih tumbuh di antara ' +
        'duri yang sudah kering, dan tanah di kaki mereka basah.',
    },
    {
      kind: 'paragraph',
      text:
        'Gambar ini membuat satu hal jelas yang sering disamarkan: mengikatkan diri ' +
        'pada satu hal berarti kehilangan sebagian gerak. Kartunya tidak menyebut itu ' +
        'buruk. Dia cuma menolak menyembunyikannya.',
    },

    { kind: 'heading', level: 2, text: 'Angka enam' },
    {
      kind: 'paragraph',
      text:
        'Enam datang tepat setelah pergolakan lima dan sebelum kemenangan tujuh. Dia ' +
        'angka penyelarasan: bagian-bagian yang sebelumnya berlawanan disusun jadi ' +
        'satu bentuk. Yang tidak diucapkan adalah bahwa penyusunan itu selalu ada ' +
        'yang dibuang.',
    },
    { kind: 'cardRef', slug: 'the-devil', text: 'Baca lore The Devil (XV)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia jarang soal orang lain. Lebih sering dia menandai satu ' +
        'hal kecil hari ini yang sudah lama kamu tunda karena memilihnya berarti ' +
        'melepas yang lain.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang sudah lewat dia menunjuk pada satu ' +
        'keputusan lama yang masih membentuk keadaanmu sekarang. Di posisi yang ' +
        'menanti di depan, dia bukan ramalan pertemuan — dia jadwal sebuah pilihan.',
    },
  ],

  questions: [
    {
      q: 'The Lovers berarti akan ada hubungan baru?',
      a:
        'Kadang, tapi itu bacaan yang paling sempit. Kartu ini soal pilihan yang ' +
        'diambil dengan seluruh diri, dan hubungan cuma satu jenis pilihan seperti itu.',
    },
    {
      q: 'Kalau saya sedang memilih di antara dua orang?',
      a:
        'Maka kartu ini menunjuk pada bagian yang biasanya dihindari: bukan siapa ' +
        'yang lebih baik, tapi apa yang harus kamu akui tentang dirimu sendiri untuk ' +
        'memilih salah satunya.',
    },
    {
      q: 'Kenapa unsurnya udara dan bukan air?',
      a:
        'Karena lambangnya Gemini, dan udara adalah unsur pembedaan. Kartu ini bukan ' +
        'soal perasaan yang menyatu, melainkan soal keputusan yang jelas — dan hanya ' +
        'yang kedua yang bisa dilanggar.',
    },
    {
      q: 'Terbalik, apakah artinya hubungan saya akan gagal?',
      a:
        'Tidak. Terbalik dia menunjuk pada belum diambilnya keputusan, bukan pada ' +
        'buruknya hasil. Sering kali yang dia sebut justru dua kemungkinan yang ' +
        'dipelihara berbarengan, dan itu bisa diperbaiki hari ini.',
    },
  ],
};

export default theLoversId;
