import type { LoreDoc } from '@/content/types';

/**
 * Wheel of Fortune (X), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Jupiter; Hebrew letter Kaph (the open palm); Golden Dawn title "Lord of the
 *     Forces of Life".
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: a wheel in the sky lettered TARO/ROTA, a sphinx above it, a
 *     serpent descending on the left and Anubis rising on the right, the four
 *     living creatures reading in the corners.
 *   - Our painting (`public/cards/10_wheel_of_fortune.webp`): the wheel is a
 *     HEAVY WOODEN CARTWHEEL, on the ground, being turned by a hooded figure with
 *     both hands; it stands over a round stone WELL that is full of blood; a
 *     skull and a fallen crown lie on the rim; two candles burn on the wall;
 *     bodies are heaped at the lower left and a bowl of blood sits in front.
 *
 * ROOT CARD: `reduce(10)` is 1, so this folds to The Magician -- the traditional
 * "the Wheel is the Magician at a higher octave", and a real internal link.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS.
 *
 * ENGINE: **polarity `neutral`, which does not flip; `yesno` is `maybe` in BOTH
 * orientations.** Element `fire`, stage `trial`.
 */
export const wheelOfFortuneId: LoreDoc = {
  slug: 'wheel-of-fortune',
  locale: 'id',
  cardId: 10,
  anchor: 'number',

  title: 'Arti Kartu Wheel of Fortune (X) — Tarot Major Arcana',
  description:
    'Wheel of Fortune (X) adalah putaran yang memang sedang tiba giliranmu. Arti ' +
    'tegak, terbalik, dan kenapa sepuluh melipat kembali ke The Magician.',
  h1: 'Arti Kartu Wheel of Fortune (X)',
  standfirst:
    'Kartu kesepuluh Major Arcana. Bukan kartu keberuntungan — kartu waktu, dan ' +
    'waktu tidak menunggu kamu selesai bersiap.',
  imageAlt:
    'Sesosok bertudung memutar sebuah roda pedati kayu yang berat dengan kedua ' +
    'tangan di atas sebuah sumur batu yang penuh darah; sebuah tengkorak dan ' +
    'sebuah mahkota tergeletak di bibir sumur, dan dua lilin menyala di dinding.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, kartu ini bilang giliranmu sedang datang, dan tidak menanyakan ' +
        'apakah kamu siap. Itu bagian yang sering diabaikan: putaran ini bukan ' +
        'hadiah atas persiapan, dan bukan hukuman atas kelalaian. Dia cuma sampai.',
    },
    {
      kind: 'paragraph',
      text:
        'Karena itu jawabannya belum jelas di kedua arah, dan itu jujur. Kartu ini ' +
        'tidak tahu ke arah mana putarannya membawa. Yang dia tahu cuma bahwa posisi ' +
        'yang sekarang tidak akan bertahan, dan itu keterangan yang tetap berguna.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang bisa kamu kerjakan bukan putarannya. Yang bisa kamu kerjakan adalah ' +
        'seberapa cepat kamu mengenali bahwa dia sudah berputar — dan orang yang ' +
        'mengenalinya sebulan lebih awal biasanya berakhir di tempat yang sangat ' +
        'berbeda dari orang yang menyangkalnya sampai jelas.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, menahan putaran yang sudah waktunya berjalan. Muatannya tetap ' +
        'netral dan jawabannya tetap belum jelas; yang berubah cuma siapa yang ' +
        'sedang mengeluarkan tenaga.',
    },
    {
      kind: 'paragraph',
      text:
        'Menahan itu mahal dengan cara yang tidak kelihatan. Tidak ada satu pun hari ' +
        'yang terasa seperti perlawanan besar; yang ada adalah tenaga yang habis ' +
        'setiap hari untuk membuat sesuatu tetap sama, sampai tidak ada yang tersisa ' +
        'untuk apa pun yang lain.',
    },
    {
      kind: 'paragraph',
      text:
        'Kartu ini terbalik jarang menyuruh melepaskan seluruhnya. Dia menyarankan ' +
        'satu hal yang lebih kecil: pilih bagian mana dari keadaan lama yang memang ' +
        'pantas dibawa, dan berhenti membayar untuk sisanya.',
    },
  ],

  yesno: {
    upright: 'maybe',
    reversed: 'maybe',
    note:
      'Belum jelas di kedua arah, dan bukan karena kartunya menghindar: dia melapor ' +
      'bahwa keadaannya sedang berubah dan tidak mengaku tahu ke arah mana. Yang ' +
      'pasti cuma bahwa posisi sekarang tidak akan bertahan.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Sepuluh, dan lipatannya ke satu' },
    {
      kind: 'paragraph',
      text:
        'Sepuluh adalah angka pertama yang memakai dua digit, dan begitu dilipat dia ' +
        'kembali jadi satu. Itu bukan permainan angka: kartu nomor satu adalah The ' +
        'Magician, dan tradisi lama memang membaca kartu ini sebagai The Magician ' +
        'pada tingkat yang lebih tinggi.',
    },
    {
      kind: 'paragraph',
      text:
        'Bedanya persis satu hal, dan itu seluruh isi kartunya. The Magician ' +
        'memegang alatnya sendiri dan memilih arahnya. Di sini alatnya jauh lebih ' +
        'besar daripada orang yang memegangnya, dan yang bisa dipilih tinggal ' +
        'kapan tangannya ditaruh.',
    },
    { kind: 'cardRef', slug: 'the-magician', text: 'Baca lore The Magician (I)' },

    { kind: 'heading', level: 2, text: 'Jupiter, dan telapak yang terbuka' },
    {
      kind: 'paragraph',
      text:
        'Planetnya Jupiter — yang paling besar, dan yang dalam tradisi dikaitkan ' +
        'dengan pertambahan. Yang jarang disebut: Jupiter menambah apa pun yang sudah ' +
        'ada, tanpa memilih. Dia memperbesar keadaan baik dan keadaan buruk dengan ' +
        'kecepatan yang sama.',
    },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Kaph, yang berarti telapak tangan yang terbuka. Telapak terbuka ' +
        'bisa menerima dan bisa melepaskan, dan tidak bisa menggenggam. Untuk kartu ' +
        'ini itu bukan kebetulan.',
    },

    { kind: 'heading', level: 2, text: 'Roda pedati, dan sumur di bawahnya' },
    {
      kind: 'paragraph',
      text:
        'Di kartu yang lebih dikenal, rodanya melayang di langit dan tidak ada yang ' +
        'memutarnya. Di kartu kami dia roda pedati kayu yang berat, ada di tanah, dan ' +
        'ada sesosok bertudung yang memutarnya dengan kedua tangan.',
    },
    {
      kind: 'paragraph',
      text:
        'Itu perubahan yang besar. Roda yang melayang berarti nasib. Roda yang ' +
        'diputar orang berarti sesuatu yang berat, yang bisa diputar, oleh seseorang ' +
        'yang tidak akan memberi tahu kamu kapan.',
    },
    {
      kind: 'paragraph',
      text:
        'Rodanya berdiri di atas sumur batu yang penuh darah. Di bibirnya ada ' +
        'tengkorak dan sebuah mahkota yang jatuh. Kartu ini menaruh yang pernah di ' +
        'atas dan yang sudah selesai pada satu tepi yang sama, dan itu keseluruhan ' +
        'gagasannya.',
    },
    {
      kind: 'quote',
      text: 'the wheel of fortune turns, and the sphinx keeps its balance above it',
      source: 'A. E. Waite, tentang kartu kesepuluh',
    },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia menandai hari yang keluar dari kebiasaan tanpa diminta. ' +
        'Yang berguna hari itu bukan rencana yang rapi, tapi kesediaan mengubah satu ' +
        'rencana yang sudah dibuat.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang menanti di depan dia paling sering ' +
        'benar dan paling sering tidak enak: sesuatu akan berubah, dan kartu ini ' +
        'tidak bersedia menebak arahnya.',
    },
  ],

  questions: [
    {
      q: 'Wheel of Fortune berarti saya akan beruntung?',
      a:
        'Bukan itu yang dia janjikan. Dia bilang keadaannya akan berubah, dan ' +
        'jawabannya belum jelas di kedua arah justru karena dia tidak mengaku tahu ' +
        'ke arah mana.',
    },
    {
      q: 'Apa yang bisa saya lakukan kalau semuanya soal waktu?',
      a:
        'Satu hal, dan itu bukan hal kecil: mengenali putarannya lebih awal. Selisih ' +
        'sebulan antara mengenali dan menyangkal biasanya menentukan seluruh ' +
        'hasilnya.',
    },
    {
      q: 'Kenapa kartu ini melipat ke The Magician?',
      a:
        'Karena sepuluh dilipat jadi satu, dan tradisi membaca keduanya sebagai satu ' +
        'gagasan pada dua tingkat: alat yang kamu pegang, dan alat yang jauh lebih ' +
        'besar daripada kamu.',
    },
    {
      q: 'Terbalik, apa artinya saya sedang menolak perubahan?',
      a:
        'Biasanya ya, dan biasanya tanpa merasa sedang menolak apa-apa. Tandanya ' +
        'bukan perlawanan besar; tandanya tenaga yang habis setiap hari untuk ' +
        'membuat sesuatu tetap sama.',
    },
  ],
};

export default wheelOfFortuneId;
