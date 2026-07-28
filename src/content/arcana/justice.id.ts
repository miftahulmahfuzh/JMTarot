import type { LoreDoc } from '@/content/types';

/**
 * Justice (XI), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Libra, cardinal air; Hebrew letter Lamed (the ox-goad); Golden Dawn title
 *     "Daughter of the Lords of Truth, the Ruler of the Balance".
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - The Marseille swap is told from the ENGLISH side of this pair and from the
 *     Indonesian side of Strength, so the story appears twice in the release and
 *     never twice in one language.
 *   - Our painting (`public/cards/11_justice.webp`): a crowned, veiled figure
 *     enthroned in carved stone; the SWORD IS POINT-DOWN and resting on the floor,
 *     not raised; the scales hang from the other hand; blood is pooling around the
 *     sword's point.
 *
 * **JUSTICE HAS NO ROOT CARD AND THAT IS A TAUTOLOGY, NOT A GAP.** `reduce(11)` is
 * 11 -- the master numbers are FIXED POINTS since v0.3.0 reconciliation §5.3 -- so
 * `arcanaFor(11)` maps back to Justice and `rootCardFor` suppresses it. **Do not
 * write a "folds to" paragraph here**, and do not "fix" `reduce`: that would
 * silently rewrite every stored `frequency_verdicts` and `personas` row.
 *
 * ENGINE: element `air` -- `SIGNS.libra.element` is `air`, asserted. **Polarity
 * `neutral`, which does not flip. yesno `maybe` in BOTH orientations.**
 */
export const justiceId: LoreDoc = {
  slug: 'justice',
  locale: 'id',
  cardId: 11,
  anchor: 'sign',

  title: 'Arti Kartu Justice (XI) — Tarot Major Arcana',
  description:
    'Justice (XI) adalah perhitungan yang jujur, apa adanya. Arti tegak, terbalik, ' +
    'dan lambang Libra serta unsur udara yang berdiri di baliknya.',
  h1: 'Arti Kartu Justice (XI)',
  standfirst:
    'Kartu kesebelas Major Arcana. Bukan kartu hukuman — kartu penjumlahan, dan ' +
    'penjumlahan tidak berpihak pada siapa pun yang menghitungnya.',
  imageAlt:
    'Sosok bermahkota dan berkerudung duduk di singgasana batu berukir, memegang ' +
    'timbangan di satu tangan sementara pedangnya berdiri terbalik bertumpu di ' +
    'lantai; darah menggenang di sekeliling ujung pedang itu.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, Justice adalah penjumlahan. Bukan hukuman, bukan pembalasan — ' +
        'penjumlahan. Apa yang dimasukkan selama ini keluar dalam bentuk angka, dan ' +
        'angkanya tidak menanyakan apakah kamu bermaksud baik.',
    },
    {
      kind: 'paragraph',
      text:
        'Itu terdengar dingin dan sebetulnya melegakan. Sebuah perhitungan yang ' +
        'jujur berlaku dua arah: kalau yang kamu masukkan memang banyak, itu ikut ' +
        'terhitung, dan kartu ini tidak mengurangi apa pun demi kerendahan hati.',
    },
    {
      kind: 'paragraph',
      text:
        'Muatannya netral dan jawabannya belum jelas di kedua arah, dan itu bukan ' +
        'kelemahan. Kartu ini tidak tahu jawabannya karena jawabannya tergantung ' +
        'sepenuhnya pada apa yang sebenarnya sudah kamu masukkan — dan itu ' +
        'keteranganmu, bukan keterangannya.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, timbangan yang dimiringkan oleh rasa takut. Muatannya tetap ' +
        'netral: yang berubah bukan sifat kartunya, melainkan siapa yang sedang ' +
        'memegang timbangannya.',
    },
    {
      kind: 'paragraph',
      text:
        'Kemiringannya hampir selalu ke satu arah yang sama, dan bukan ke arah yang ' +
        'diduga orang. Orang yang takut biasanya memberatkan dirinya sendiri, bukan ' +
        'membebaskan dirinya sendiri — dan hasilnya terlihat seperti kejujuran, jadi ' +
        'tidak ada yang mengoreksinya.',
    },
    {
      kind: 'paragraph',
      text:
        'Jawabannya tetap belum jelas, karena perhitungannya belum selesai. Yang ' +
        'perlu dilakukan bukan menghukum diri lebih keras dan bukan membebaskan diri; ' +
        'yang perlu dilakukan adalah menyerahkan angkanya pada satu orang lain yang ' +
        'tidak punya kepentingan.',
    },
  ],

  yesno: {
    upright: 'maybe',
    reversed: 'maybe',
    note:
      'Belum jelas di kedua arah, dan itu jawaban yang jujur, bukan penghindaran: ' +
      'kartu ini menghitung apa yang sudah dimasukkan, jadi jawabannya ada pada ' +
      'catatan yang kamu punya dan bukan pada kartunya.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Libra, udara yang kardinal' },
    {
      kind: 'paragraph',
      text:
        'Lambangnya Libra: udara, dan kardinal. Udara adalah unsur pembedaan — ' +
        'memilah, membandingkan, memisahkan satu hal dari hal lain — dan itu tepat ' +
        'untuk kartu yang pekerjaannya menimbang.',
    },
    {
      kind: 'paragraph',
      text:
        'Kardinal berarti memulai. Jadi kartu ini bukan kartu penilaian yang sudah ' +
        'lama berjalan; dia kartu penilaian yang baru dibuka, dan itulah kenapa ' +
        'jawabannya belum jelas. Perhitungan yang baru dimulai memang belum punya ' +
        'hasil.',
    },
    {
      kind: 'paragraph',
      text:
        'Libra juga satu-satunya lambang zodiak yang bukan makhluk hidup. Yang ' +
        'lain binatang atau orang; yang ini alat. Timbangan tidak punya kepentingan, ' +
        'dan itulah satu-satunya alasan orang mau memakainya.',
    },

    { kind: 'heading', level: 2, text: 'Lamed, tongkat penggiring' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Lamed, yang berarti tongkat penggiring sapi. Bukan cambuk dan ' +
        'bukan pedang: alat yang dipakai untuk mengarahkan hewan yang jauh lebih ' +
        'besar dan lebih kuat daripada orang yang memegangnya, dengan sentuhan kecil ' +
        'yang diulang.',
    },
    {
      kind: 'paragraph',
      text:
        'Untuk kartu keadilan, itu gambaran yang sangat jauh dari palu hakim. Yang ' +
        'diarahkan bergerak sendiri; yang dilakukan alat itu cuma membelokkannya ' +
        'sedikit, berkali-kali.',
    },

    { kind: 'heading', level: 2, text: 'Pedang yang menghadap ke bawah' },
    {
      kind: 'paragraph',
      text:
        'Di hampir semua tumpukan, pedang kartu ini terangkat tegak. Di kartu kami ' +
        'ujungnya menancap ke lantai dan tangannya cuma bertumpu di gagangnya.',
      },
    {
      kind: 'paragraph',
      text:
        'Timbangan masih tergantung di tangan yang satunya, jadi bagian menimbangnya ' +
        'sedang berlangsung. Yang sedang tidak berlangsung adalah pemotongannya. ' +
        'Pedang yang diistirahatkan bukan pedang yang dibuang.',
    },
    {
      kind: 'paragraph',
      text:
        'Dan ada darah menggenang di sekeliling ujung pedang itu. Pedang ini sudah ' +
        'pernah dipakai. Kartu ini tidak berpura-pura bahwa perhitungan yang jujur ' +
        'tidak pernah melukai siapa-siapa.',
    },

    { kind: 'heading', level: 2, text: 'Sebelas, dan angka yang tidak melipat' },
    {
      kind: 'paragraph',
      text:
        'Sebelas adalah salah satu angka yang dalam susunan ini tidak dilipat lagi. ' +
        'Akibatnya kartu ini tidak punya kartu akar: sebelas kembali ke sebelas, dan ' +
        'sebelas adalah Justice. Satu-satunya kalimat yang bisa ditulis di sini ' +
        'adalah bahwa dia berdiri di atas dirinya sendiri, yang untuk kartu ini ' +
        'kebetulan pas.',
    },
    { kind: 'cardRef', slug: 'strength', text: 'Baca lore Strength (VIII)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya menandai hari untuk membuka catatan yang ' +
        'sudah lama tidak dibuka: tagihan, janji, atau satu percakapan yang ' +
        'kesimpulannya tidak pernah ditulis.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang sudah lewat dia menunjuk pada sebab, ' +
        'bukan pada kesalahan. Di posisi yang menanti di depan, dia berarti angkanya ' +
        'akan keluar, dan bukan berarti angkanya akan buruk.',
    },
  ],

  questions: [
    {
      q: 'Justice berarti saya akan dihukum?',
      a:
        'Tidak. Kartu ini menghitung, dan penjumlahan berlaku dua arah. Yang kamu ' +
        'masukkan ikut terhitung, dan kartu ini tidak mengurangi apa pun demi ' +
        'kerendahan hati.',
    },
    {
      q: 'Kenapa jawabannya belum jelas dan bukan ya atau tidak?',
      a:
        'Karena hasilnya bergantung pada catatan yang kamu punya, bukan pada ' +
        'keadaan di luar. Kartu ini netral di kedua arah dan jujur tentang tidak ' +
        'mengetahui isi catatan itu.',
    },
    {
      q: 'Kalau saya jelas-jelas dirugikan orang lain?',
      a:
        'Kartu ini tetap tidak menjanjikan pembalasan. Yang dia janjikan adalah ' +
        'bahwa angkanya bisa dihitung, dan menghitungnya di depan satu orang yang ' +
        'tidak punya kepentingan biasanya langkah yang paling berguna.',
    },
    {
      q: 'Bedanya Justice dan Judgement apa?',
      a:
        'Justice menghitung apa yang sudah terjadi. Judgement memanggilmu untuk ' +
        'menjawab, dan panggilan itu tidak menunggu perhitungannya selesai.',
    },
  ],
};

export default justiceId;
