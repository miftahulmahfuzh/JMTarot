import type { LoreDoc } from '@/content/types';

/**
 * The Magician (I), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Mercury; Hebrew letter Beth (the house); Golden Dawn title "The Magus of
 *     Power". https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: the four suit emblems laid on a table -- cup, wand, sword,
 *     pentacle -- one hand raised holding a wand and one pointing at the ground.
 *   - Our painting (`public/cards/01_magician.webp`): the figure is HOODED and
 *     faceless, one hand raised and one lowered over a stone slab. On the slab
 *     there are only three things -- a cup, a rod and a blade -- and the stone is
 *     wet with blood that is running off the front edge. One candle on the wall.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS
 * LANGUAGE. Card names and `Major Arcana` stay English.
 *
 * ENGINE: yesno `yes` upright, `no` reversed. Polarity `light` -> `shadow`.
 * Element `air`, stage `beginning`. No root card (1-9 are their own).
 */
export const theMagicianId: LoreDoc = {
  slug: 'the-magician',
  locale: 'id',
  cardId: 1,
  anchor: 'goldenDawnTitle',

  title: 'Arti Kartu The Magician (I) — Tarot Major Arcana',
  description:
    'The Magician (I) adalah kemampuan yang akhirnya diarahkan pada sesuatu. Arti ' +
    'tegak, terbalik, dan lambang Merkurius yang berdiri di belakangnya.',
  h1: 'Arti Kartu The Magician (I)',
  standfirst:
    'Kartu pertama yang punya nomor. Bukan kartu keajaiban — kartu alat yang sudah ' +
    'ada di meja dan akhirnya dipegang salah satunya.',
  imageAlt:
    'Sesosok berjubah dan bertudung berdiri di depan meja batu dengan satu tangan ' +
    'terangkat dan satu menunjuk ke bawah; di atas batunya ada cawan, tongkat dan ' +
    'sebilah pisau, dan darah menetes dari tepi meja.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Magician bukan janji bahwa kamu akan berhasil. Dia laporan bahwa ' +
        'yang kamu butuhkan sudah ada di dekatmu. Alatnya sudah di meja. Yang belum ' +
        'terjadi adalah kamu memilih satu dan mengarahkannya.',
    },
    {
      kind: 'paragraph',
      text:
        'Karena itu kartu ini paling sering keluar bukan untuk orang yang kekurangan, ' +
        'tapi untuk orang yang punya terlalu banyak pilihan dan menyebutnya belum ' +
        'siap. Kemampuan yang dipakai untuk semuanya sekaligus tidak mengubah apa pun; ' +
        'kemampuan yang diarahkan pada satu hal mengubah hal itu.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang dia tagih adalah niat yang bisa disebut dengan kalimat. Bukan perasaan, ' +
        'bukan suasana hati — kalimat yang bisa kamu ucapkan pada orang lain dan yang ' +
        'bisa dibilang keliru kalau memang keliru.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, alatnya masih di tangan dan sasarannya yang bergeser. Bakatnya ' +
        'habis dipakai untuk terlihat mampu, bukan untuk menyelesaikan sesuatu.',
    },
    {
      kind: 'paragraph',
      text:
        'Ini bentuknya bisa halus sekali: rapat yang dijalankan dengan bagus tentang ' +
        'pekerjaan yang belum dikerjakan, penjelasan yang lebih rapi daripada barangnya, ' +
        'kesibukan yang setiap harinya terasa produktif dan setiap bulannya tidak ' +
        'meninggalkan apa-apa.',
    },
    {
      kind: 'paragraph',
      text:
        'Pemeriksaannya sederhana dan tidak nyaman: sebutkan satu hal yang sekarang ' +
        'ada di dunia karena kemampuan itu. Kalau yang muncul cuma kesan orang tentang ' +
        'kamu, kartu ini sedang menunjuk ke situ.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Tegak, ya — dan ya yang bersyarat pada satu hal saja: sebutkan sasarannya ' +
      'dulu. Terbalik jadi tidak, karena kemampuannya tidak sedang kurang, dia ' +
      'sedang dipakai untuk hal yang tidak kamu maksud.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Magus of Power' },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn memberinya judul The Magus of Power. Bukan Magus of Knowledge ' +
        'dan bukan Magus of Secrets. Kekuatan di sini artinya sempit dan tepat: ' +
        'kemampuan untuk membuat sesuatu terjadi, yang berbeda dari kemampuan untuk ' +
        'memahaminya.',
    },
    {
      kind: 'paragraph',
      text:
        'Perbedaan itu yang membuat kartu ini keras. Memahami keadaanmu tidak ' +
        'mengubah keadaanmu, dan kartu ini tidak menghitung pemahaman sebagai ' +
        'pekerjaan.',
    },

    { kind: 'heading', level: 2, text: 'Merkurius, dan huruf yang berarti rumah' },
    {
      kind: 'paragraph',
      text:
        'Planetnya Merkurius: yang mengantar, yang menerjemahkan, yang memindahkan ' +
        'sesuatu dari satu bentuk ke bentuk lain. Merkurius tidak pernah jadi sumber ' +
        'pesan, dia yang membawanya. Itu deskripsi yang jujur untuk keahlian.',
    },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Beth, yang artinya rumah. Sebuah rumah adalah tempat kosong yang ' +
        'dibatasi dengan sengaja sampai jadi berguna. Sebuah keahlian bekerja dengan ' +
        'cara yang persis sama: dia membatasi yang mungkin sampai sesuatu bisa berdiri ' +
        'di dalamnya.',
    },

    { kind: 'heading', level: 2, text: 'Tiga benda di atas batu' },
    {
      kind: 'paragraph',
      text:
        'Di kartu yang lebih dikenal ada empat benda di meja, satu untuk tiap rupa ' +
        'kartu kecil. Di kartu kami ada tiga: cawan, tongkat, dan sebilah pisau. ' +
        'Batunya basah, dan yang membasahinya menetes turun dari tepi depan.',
    },
    {
      kind: 'paragraph',
      text:
        'Sosoknya bertudung dan tidak punya wajah yang bisa dibaca. Satu tangan ke ' +
        'atas, satu menunjuk ke meja. Isyarat itu tua sekali dan artinya tetap sama: ' +
        'apa yang di atas dibawa ke bawah, dan yang membawanya harus berdiri di ' +
        'antara keduanya.',
    },
    {
      kind: 'paragraph',
      text:
        'Satu lilin menyala di dinding. Cukup untuk bekerja, tidak cukup untuk ' +
        'melihat seisi ruangan. Kartu ini tidak menjanjikan penerangan; dia ' +
        'menjanjikan bahwa yang perlu kamu pegang bisa kamu jangkau.',
    },

    { kind: 'heading', level: 2, text: 'Angka satu' },
    {
      kind: 'paragraph',
      text:
        'Satu tidak melipat ke mana-mana; dia sudah akarnya sendiri. Tapi dua kartu ' +
        'lain melipat kepadanya: Wheel of Fortune di nomor sepuluh dan The Sun di ' +
        'nomor sembilan belas. Keduanya kartu tentang tenaga yang bergerak, dan ' +
        'keduanya berdiri di atas kartu ini.',
    },
    { kind: 'cardRef', slug: 'wheel-of-fortune', text: 'Baca lore Wheel of Fortune (X)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya menunjuk pada satu hal kecil yang sudah kamu ' +
        'bisa dan belum kamu pakai hari ini. Bukan hal baru — hal yang sudah ada.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, posisinya di depan berarti tawaran; posisinya di ' +
        'belakang biasanya berarti sesuatu yang dulu kamu bangun dan sekarang jadi ' +
        'alat, walaupun waktu itu tidak terasa seperti sedang membangun apa-apa.',
    },
  ],

  questions: [
    {
      q: 'The Magician berarti saya bakal beruntung?',
      a:
        'Bukan. Kartu ini tidak bicara soal keberuntungan sama sekali. Dia bicara ' +
        'soal alat yang sudah ada dan belum diarahkan, dan itu urusan pilihan, bukan ' +
        'urusan nasib.',
    },
    {
      q: 'Kalau saya merasa belum punya keahlian apa pun, kartu ini artinya apa?',
      a:
        'Biasanya artinya daftar alatmu lebih pendek dari yang sebenarnya karena kamu ' +
        'hanya menghitung yang bergelar. Hubungan, akses, kebiasaan, dan waktu luang ' +
        'juga ada di meja itu.',
    },
    {
      q: 'The Magician untuk pertanyaan ya atau tidak?',
      a:
        'Tegak, ya, dengan satu syarat: sasarannya harus bisa kamu sebutkan dalam ' +
        'satu kalimat. Terbalik, tidak, dan biasanya karena sasarannya belum pernah ' +
        'benar-benar dipilih.',
    },
    {
      q: 'Bedanya The Magician dan The Chariot apa?',
      a:
        'The Magician soal memilih alat dan arah waktu belum ada yang bergerak. The ' +
        'Chariot soal mengemudikan sesuatu yang sudah bergerak dan tidak bisa ' +
        'dihentikan dengan mudah.',
    },
  ],
};

export default theMagicianId;
