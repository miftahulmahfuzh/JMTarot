import type { LoreDoc } from '@/content/types';

/**
 * The High Priestess (II), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Luna; Hebrew letter Gimel (the camel); Golden Dawn title "Priestess of the
 *     Silver Star". https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: seated between the pillars Boaz and Jachin, a veil of
 *     pomegranates behind her, a crescent at her feet, a scroll marked TORA half
 *     hidden in her lap.
 *   - Our painting (`public/cards/02_high_priestess.webp`): she is VEILED to the
 *     point of having no face at all, seated under a stone arch; the two pillars
 *     are topped with SKULLS rather than letters; the floor is flooded and the
 *     water is dark with blood; a single crescent lies flat in the water in front
 *     of her, and there is no scroll.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS
 * LANGUAGE. Card names, reader names and `Major Arcana` stay English.
 *
 * ENGINE: polarity `neutral`, which DOES NOT FLIP -- so the reversed section must
 * not lean on a change of charge that did not happen. yesno `maybe` in BOTH
 * orientations, for the same reason.
 */
export const theHighPriestessId: LoreDoc = {
  slug: 'the-high-priestess',
  locale: 'id',
  cardId: 2,
  anchor: 'sign',

  title: 'Arti Kartu The High Priestess (II) — Tarot Major Arcana',
  description:
    'The High Priestess (II) adalah sesuatu yang sudah kamu tahu tapi belum kamu ' +
    'ucapkan. Arti tegak, terbalik, dan kenapa jawabannya selalu belum jelas.',
  h1: 'Arti Kartu The High Priestess (II)',
  standfirst:
    'Kartu kedua Major Arcana. Bukan kartu rahasia orang lain — kartu keterangan ' +
    'yang sudah ada padamu dan belum pernah kamu keluarkan.',
  imageAlt:
    'Sesosok berkerudung tanpa wajah duduk di bawah lengkung batu di antara dua ' +
    'pilar bertengkorak; lantainya tergenang dan gelap, dan sebuah bulan sabit ' +
    'terbaring rata di dalam air di depannya.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, kartu ini tidak menjanjikan wahyu. Dia menunjuk sesuatu yang sudah ' +
        'kamu simpan dan belum kamu keluarkan — bukan karena kamu takut, sering kali, ' +
        'tapi karena begitu diucapkan dia jadi harus ditindaklanjuti.',
    },
    {
      kind: 'paragraph',
      text:
        'Itu sebabnya kartu ini terasa seperti diam yang sabar dan bukan seperti ' +
        'teka-teki. Yang diam bukan semesta. Yang diam kamu, dan kamu punya alasan ' +
        'yang cukup masuk akal untuk itu.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang dia minta bukan keberanian besar. Cukup satu kalimat yang benar, ' +
        'diucapkan satu kali, pada satu orang yang tepat. Setelah itu kartu ini ' +
        'selesai tugasnya dan kartu lain yang mengambil alih.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, muatannya tidak berubah — kartu ini netral dan tetap netral di ' +
        'kedua arah. Yang berubah adalah siapa yang tidak mendengar. Suaranya masih ' +
        'ada di tempat yang sama; kamu yang terus melewatinya.',
    },
    {
      kind: 'paragraph',
      text:
        'Bentuk paling umumnya bukan penolakan, tapi kesibukan. Jadwal yang penuh ' +
        'sampai tidak ada satu pun jam yang cukup sepi untuk mendengar hal yang tidak ' +
        'enak. Dan itu bekerja: hal yang tidak enak itu memang tidak muncul.',
    },
    {
      kind: 'paragraph',
      text:
        'Jawabannya tetap belum jelas, dan di sini itu jujur. Kartu ini tidak ' +
        'menahan jawabannya darimu. Dia melaporkan bahwa jawabannya belum diucapkan, ' +
        'dan yang harus mengucapkannya bukan dia.',
    },
  ],

  yesno: {
    upright: 'maybe',
    reversed: 'maybe',
    note:
      'Belum jelas, di kedua arah, dan itu satu-satunya jawaban yang jujur untuk ' +
      'kartu ini: keterangannya sudah ada padamu tapi belum kamu keluarkan, jadi ' +
      'yang menentukan bukan keadaan melainkan kalimat yang belum diucapkan.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Bulan, dan kartu yang netral' },
    {
      kind: 'paragraph',
      text:
        'Lambangnya Bulan — bukan The Moon si kartu kedelapan belas, tapi benda ' +
        'langitnya, yang dalam tradisi astrologi disebut Luna supaya tidak tertukar. ' +
        'Luna tidak punya cahaya sendiri. Yang dia lakukan adalah memantulkan, dan ' +
        'seberapa banyak yang terlihat bergantung pada posisi, bukan pada niat.',
    },
    {
      kind: 'paragraph',
      text:
        'Kartu ini juga satu dari sedikit kartu bermuatan netral: dia tidak terang ' +
        'dan tidak gelap, dan membaliknya tidak mengubah itu. Kebanyakan kartu ' +
        'berpihak. Yang ini menolak, dan penolakan itu bagian dari isinya.',
    },

    { kind: 'heading', level: 2, text: 'Gimel, dan perjalanan yang panjang' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Gimel, yang dalam tradisi berarti unta. Unta adalah hewan yang ' +
        'membawa bekalnya di dalam badannya sendiri dan menyeberangi tempat yang ' +
        'tidak menyediakan apa-apa. Untuk kartu tentang keterangan yang kamu bawa ' +
        'diam-diam, itu gambaran yang tepat sekali.',
    },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn menyebutnya Priestess of the Silver Star. Perak, bukan emas: ' +
        'logam yang memantulkan dan bukan yang menyala.',
    },

    { kind: 'heading', level: 2, text: 'Dua pilar, dan tidak ada gulungan' },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami wajahnya tidak ada. Bukan tertutup sebagian — tidak ada. Kain ' +
        'itu jatuh lurus dari kepala sampai ke pangkuan, dan yang tersisa dari ' +
        'sosoknya cuma bentuk duduk.',
    },
    {
      kind: 'paragraph',
      text:
        'Dua pilar di kiri dan kanan berujung tengkorak. Dalam susunan yang lebih ' +
        'dikenal, pilar-pilar itu diberi huruf dan berarti dua kutub yang harus ' +
        'dilewati di antaranya. Di sini yang duduk di puncaknya adalah orang-orang ' +
        'yang sudah lewat.',
    },
    {
      kind: 'paragraph',
      text:
        'Dan tidak ada gulungan di pangkuannya. Di kartu yang lebih dikenal, ada ' +
        'gulungan setengah tersembunyi — pengetahuan yang disimpan. Di kartu kami ' +
        'tangannya kosong, dan yang tergeletak di air di depannya cuma bulan sabit. ' +
        'Tidak ada dokumen. Yang disimpan tidak berbentuk benda.',
    },

    { kind: 'heading', level: 2, text: 'Angka dua' },
    {
      kind: 'paragraph',
      text:
        'Dua adalah angka yang paling pertama membuat perbandingan mungkin: satu ' +
        'hanya bisa ada, dua bisa berbeda. Itu sebabnya kartu ini duduk tepat setelah ' +
        'The Magician. Yang satu memilih dan bertindak; yang ini menahan dan ' +
        'membandingkan, dan keduanya diperlukan.',
    },
    { kind: 'cardRef', slug: 'the-moon', text: 'Baca lore The Moon (XVIII)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia jarang meramalkan kejadian. Lebih sering dia menandai ' +
        'hari yang bagus untuk mendengarkan dan hari yang buruk untuk mengumumkan.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, dia paling sering muncul di posisi yang sedang ' +
        'berjalan: bukan sesuatu yang akan terjadi, melainkan sesuatu yang sedang ' +
        'kamu tahan sekarang. Di posisi yang menanti di depan, artinya sederhana — ' +
        'yang belum diucapkan itu belum akan selesai sendiri.',
    },
  ],

  questions: [
    {
      q: 'The High Priestess artinya ada yang menyembunyikan sesuatu dari saya?',
      a:
        'Biasanya bukan orang lain. Kartu ini menunjuk ke arahmu: keterangan yang ' +
        'sudah kamu punya dan belum kamu keluarkan, sering kali karena mengucapkannya ' +
        'akan membuatnya harus ditindaklanjuti.',
    },
    {
      q: 'Kenapa jawabannya belum jelas, bukan ya atau tidak?',
      a:
        'Karena kartu ini netral di kedua arah, dan itu bukan kelemahan. Yang ' +
        'menentukan bukan keadaan di luar, melainkan satu kalimat yang belum ' +
        'diucapkan — jadi jawabannya belum ada, bukan disembunyikan.',
    },
    {
      q: 'Kalau saya benar-benar tidak merasa tahu apa-apa?',
      a:
        'Coba pertanyaan yang lebih sempit. Bukan "apa yang harus saya lakukan", ' +
        'tapi "apa yang sudah saya putuskan dan belum saya akui". Kartu ini hampir ' +
        'selalu punya jawaban untuk yang kedua.',
    },
    {
      q: 'Bedanya The High Priestess dan The Moon apa?',
      a:
        'The High Priestess adalah sesuatu yang sudah kamu tahu dan belum kamu ' +
        'ucapkan. The Moon adalah sesuatu yang belum diketahui siapa pun di ruangan ' +
        'itu, termasuk kamu.',
    },
  ],
};

export default theHighPriestessId;
