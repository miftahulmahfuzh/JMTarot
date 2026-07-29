import type { LoreDoc } from '@/content/types';

/**
 * The Devil (XV), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Capricorn, cardinal earth; Hebrew letter Ayin (the eye); Golden Dawn title
 *     "Lord of the Gates of Matter, the Child of the Forces of Time".
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: a horned figure on a half-cube, two naked figures chained to
 *     the block below -- and **the chains are loose enough to lift over their
 *     heads**, which is the detail the whole card turns on. Told from the English
 *     side of this pair.
 *   - Our painting (`public/cards/15_devil.webp`): a horned figure CROUCHES on top
 *     of a stone font holding a small flame; two hooded figures kneel below with
 *     heads bowed, chained; **the chains hang slack**, and there is blood on the
 *     floor between them.
 *
 * **THE ENGLISH DOCUMENT MAY NOT USE `shadow work`** -- it is on `EN_TICS` and
 * this is the card that reaches for it. `shadow` alone is fine and is this card's
 * own English keyword.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS --
 * this card is about wanting, never about a condition.
 *
 * ENGINE: element `earth` -- `SIGNS.capricorn.element` is `earth`, asserted.
 * **POLARITY `shadow` UPRIGHT AND `light` REVERSED; yesno `no` -> `yes`.**
 * Root card: `reduce(15)` is 6, The Lovers.
 */
export const theDevilId: LoreDoc = {
  slug: 'the-devil',
  locale: 'id',
  cardId: 15,
  anchor: 'sign',

  title: 'Arti Kartu The Devil (XV) — Tarot Major Arcana',
  description:
    'The Devil (XV) adalah rantai yang sebenarnya kamu lihat sendiri. Arti tegak, ' +
    'terbalik, dan lambang Capricorn serta unsur tanah di baliknya.',
  h1: 'Arti Kartu The Devil (XV)',
  standfirst:
    'Kartu kelima belas Major Arcana. Bukan kartu kejahatan — kartu perjanjian ' +
    'yang kamu buat sendiri dan masih kamu perpanjang setiap bulan.',
  imageAlt:
    'Sesosok bertanduk berjongkok di atas bejana batu sambil memegang nyala api ' +
    'kecil; di bawahnya dua sosok berkerudung berlutut menunduk dengan rantai di ' +
    'leher, dan rantai itu tergantung kendur.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Devil menunjuk pada satu perjanjian yang kamu buat sendiri, ' +
        'sadar, dan yang syaratnya masih kamu bayar sampai sekarang. Bagian yang ' +
        'membuatnya berat bukan bahwa kamu tertipu. Bagian yang berat adalah bahwa ' +
        'kamu tidak tertipu.',
    },
    {
      kind: 'paragraph',
      text:
        'Perjanjian semacam itu hampir selalu masuk akal waktu dibuat. Ada yang ' +
        'ditukar dan ada yang didapat, dan yang didapat memang nyata. Yang berubah ' +
        'cuma harganya, yang naik pelan-pelan sampai tidak lagi sepadan, tanpa ' +
        'pernah ada satu hari pun yang bisa disebut sebagai hari keputusannya.',
    },
    {
      kind: 'paragraph',
      text:
        'Karena itu jawabannya tidak, dan yang ditolak bukan keinginanmu. Yang ' +
        'ditolak adalah memperpanjang dengan syarat yang lama tanpa pernah membaca ' +
        'ulang syaratnya.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, muatannya jadi terang — kartu ini bayangan waktu tegak dan terang ' +
        'waktu dibalik, jadi terbaliknya bukan versi yang lebih gelap. Yang dia ' +
        'tunjuk adalah keinginan yang belum berani kamu sebut namanya.',
    },
    {
      kind: 'paragraph',
      text:
        'Keinginan yang tidak disebut namanya tetap bekerja, dan bekerjanya lewat ' +
        'jalan belakang: pilihan yang kelihatan masuk akal satu per satu dan ' +
        'anehnya selalu mengarah ke tempat yang sama. Yang tidak diakui tetap ' +
        'mengemudi, cuma tanpa peta.',
    },
    {
      kind: 'paragraph',
      text:
        'Jawabannya membalik jadi ya, dan ya-nya untuk hal yang paling sederhana: ' +
        'menyebutkan keinginan itu, sekali, dengan kalimat biasa. Setelah disebut, ' +
        'dia bisa ditimbang seperti hal lain, dan sebagian besar kekuatannya memang ' +
        'berasal dari tidak pernah ditimbang.',
    },
  ],

  yesno: {
    upright: 'no',
    reversed: 'yes',
    note:
      'Tegak, tidak — dan yang ditolak perpanjangannya, bukan keinginannya. ' +
      'Terbalik membalik jadi ya, untuk satu hal yang kecil dan sulit: menyebutkan ' +
      'apa yang sebenarnya kamu mau, sekali, dengan kalimat biasa.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Capricorn, tanah yang kardinal' },
    {
      kind: 'paragraph',
      text:
        'Lambangnya Capricorn: tanah, dan kardinal. Itu gabungan yang mengejutkan ' +
        'untuk kartu ini, karena Capricorn adalah tanda yang paling sering dibaca ' +
        'sebagai disiplin — pendakian panjang, kesabaran, kerja yang tidak dilihat ' +
        'siapa-siapa.',
    },
    {
      kind: 'paragraph',
      text:
        'Dan itu justru tepat. Yang mengikat orang paling lama bukan kemalasan; ' +
        'yang mengikat paling lama adalah komitmen. Rantai yang paling sulit ' +
        'dilepas selalu dipasang oleh orang yang tekun.',
    },
    {
      kind: 'paragraph',
      text:
        'Kardinal berarti memulai. Perjanjian ini punya tanggal mulai, dan biasanya ' +
        'kamu masih ingat tanggalnya.',
    },

    { kind: 'heading', level: 2, text: 'Ayin, mata' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Ayin, yang berarti mata. Untuk kartu tentang belenggu, itu pilihan ' +
        'yang aneh sampai kamu sadar bahwa seluruh isi kartunya bergantung pada ' +
        'melihat: rantainya tidak tersembunyi, dan tidak pernah tersembunyi.',
    },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn menyebutnya Lord of the Gates of Matter, Child of the Forces of ' +
        'Time. Gerbang benda, dan anak dari kekuatan waktu — dua nama untuk hal yang ' +
        'sama: sesuatu yang mengikat karena sudah berlangsung lama.',
    },

    { kind: 'heading', level: 2, text: 'Rantai yang kendur' },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami sosok bertanduk itu berjongkok di atas bejana batu dan ' +
        'memegang nyala api yang kecil sekali. Dua sosok di bawahnya berlutut ' +
        'menunduk, dengan rantai di leher.',
    },
    {
      kind: 'paragraph',
      text:
        'Rantai itu kendur. Tidak ada yang menariknya, dan tidak ada yang perlu ' +
        'menariknya. Dua sosok itu menunduk bukan karena dipaksa turun; mereka sudah ' +
        'berada di posisi itu cukup lama sehingga posisi itu jadi cara duduk.',
    },
    {
      kind: 'paragraph',
      text:
        'Nyala di tangan sosok bertanduk itu satu-satunya cahaya di ruangan. Itu ' +
        'bagian yang paling jujur dari gambarnya: yang mengikat juga yang menerangi, ' +
        'dan itulah kenapa melepasnya tidak sesederhana yang dikira orang di luar.',
    },

    { kind: 'heading', level: 2, text: 'Lima belas, dan akarnya' },
    {
      kind: 'paragraph',
      text:
        'Lima belas dilipat menjadi enam, dan enam adalah The Lovers. Kartu tentang ' +
        'pilihan yang mengikat berdiri tepat di belakang kartu tentang ikatan yang ' +
        'tidak lagi dipilih. Jaraknya cuma waktu.',
    },
    { kind: 'cardRef', slug: 'the-lovers', text: 'Baca lore The Lovers (VI)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya menunjuk pada satu hal kecil yang otomatis ' +
        'hari ini dan yang dulu pernah kamu putuskan: satu kebiasaan, satu ' +
        'pengeluaran, satu balasan yang selalu kamu kirim.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang sedang berjalan dia jarang salah dan ' +
        'jarang disukai. Di posisi yang menanti di depan, dia bukan peringatan soal ' +
        'godaan — dia peringatan soal tanggal perpanjangan.',
    },
  ],

  questions: [
    {
      q: 'The Devil berarti ada kekuatan jahat?',
      a:
        'Tidak. Kartu ini soal perjanjian yang kamu buat sendiri dan masih kamu ' +
        'perpanjang. Sosok bertanduk di gambarnya tidak memegang rantainya; dia cuma ' +
        'memegang lampunya.',
    },
    {
      q: 'Kalau rantainya kendur, kenapa mereka tidak pergi?',
      a:
        'Karena rantainya bukan yang menahan. Yang menahan adalah bahwa perjanjian ' +
        'itu memberi sesuatu yang nyata, dan pergi berarti kehilangan itu juga. ' +
        'Kartu ini tidak berpura-pura bahwa lepas itu gratis.',
    },
    {
      q: 'Terbalik, apa langkah pertamanya?',
      a:
        'Menyebutkan keinginannya, sekali, dengan kalimat biasa dan tanpa pembelaan. ' +
        'Sebagian besar kekuatan hal yang tidak diakui berasal dari tidak pernah ' +
        'ditimbang bersama hal lain.',
    },
    {
      q: 'Bedanya The Devil dan The Tower apa?',
      a:
        'The Devil adalah perjanjian yang masih berjalan dan masih kamu bayar. The ' +
        'Tower adalah apa yang terjadi kalau perjanjian itu berakhir tanpa kamu yang ' +
        'mengakhirinya.',
    },
  ],
};

export default theDevilId;
