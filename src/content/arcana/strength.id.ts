import type { LoreDoc } from '@/content/types';

/**
 * Strength (VIII), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Leo, fixed fire; Hebrew letter Teth (the serpent); Golden Dawn title
 *     "Daughter of the Flaming Sword".
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - The MARSEILLE SWAP: older decks number Justice VIII and Strength XI. Waite
 *     exchanged them so that the trump order would follow the zodiac, putting Leo
 *     at eight and Libra at eleven. **This deck follows Waite**, and the story is
 *     told from the Indonesian side here and from the English side on Justice --
 *     the two documents are each other's natural `cardRef`.
 *   - Our painting (`public/cards/08_strength.webp`): a woman KNEELING beside a
 *     lion, her bare hand inside its open jaws; the lion's eyes are CLOSED; there
 *     is blood on her sleeve; a shallow bowl of blood sits in the foreground and
 *     there are bones in the dirt.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS.
 *
 * ENGINE: element `fire` -- `SIGNS.leo.element` is `fire`, asserted. yesno `yes`
 * -> `no`; polarity `light` -> `shadow`; stage `trial`.
 */
export const strengthId: LoreDoc = {
  slug: 'strength',
  locale: 'id',
  cardId: 8,
  anchor: 'marseille',

  title: 'Arti Kartu Strength (VIII) — Tarot Major Arcana',
  description:
    'Strength (VIII) adalah kelembutan yang justru memegang kendali. Arti tegak, ' +
    'terbalik, dan kenapa nomornya delapan dan bukan sebelas.',
  h1: 'Arti Kartu Strength (VIII)',
  standfirst:
    'Kartu kedelapan Major Arcana. Bukan kartu otot — kartu tangan yang tetap ' +
    'terbuka di depan sesuatu yang sanggup melukainya.',
  imageAlt:
    'Seorang perempuan berlutut di samping seekor singa dan meletakkan tangannya ' +
    'di dalam mulut binatang itu yang sedang terbuka lebar; mata singanya terpejam, ' +
    'ada darah di lengan bajunya, dan sebuah mangkuk dangkal berisi darah di depan.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, Strength menunjuk pada satu hal yang sedang kamu tahan bukan dengan ' +
        'menekannya, melainkan dengan menemaninya. Kemarahan, keinginan, ketakutan — ' +
        'kartunya tidak peduli yang mana. Dia peduli caranya.',
    },
    {
      kind: 'paragraph',
      text:
        'Dan caranya jauh lebih mahal daripada menekan. Menekan selesai dalam satu ' +
        'gerakan. Menemani berarti hadir setiap kali hal itu muncul, tanpa menang ' +
        'atasnya dan tanpa dikalahkan olehnya, dan itu berlangsung selama hal itu ' +
        'masih ada.',
    },
    {
      kind: 'paragraph',
      text:
        'Itu sebabnya kartu ini termasuk tahap ujian dan bukan tahap permulaan. ' +
        'Yang diuji bukan seberapa besar tenagamu. Yang diuji adalah apakah kamu ' +
        'sanggup mengulangi hal yang sama besok, waktu tidak ada yang melihat dan ' +
        'tidak ada yang memuji.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, keberaniannya nyata dan sasarannya keliru. Tenaga yang cukup untuk ' +
        'hal yang besar dipakai untuk hal yang tidak menuntutnya, dan itu terasa ' +
        'seperti bekerja keras.',
    },
    {
      kind: 'paragraph',
      text:
        'Sering kali yang terjadi adalah pertukaran: hal yang benar-benar sulit ' +
        'dibiarkan, dan sebagai gantinya ada satu hal lain yang dilawan mati-matian ' +
        'supaya tetap ada bukti bahwa kamu bukan orang yang menyerah.',
    },
    {
      kind: 'paragraph',
      text:
        'Jawabannya membalik jadi tidak, dan yang ditolak bukan keberaniannya. Yang ' +
        'ditolak adalah menaruh keberanian itu di tempat yang tidak akan mengubah ' +
        'apa pun.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Tegak, ya, dan ya yang panjang: ya untuk sesuatu yang harus diulang, bukan ' +
      'untuk sesuatu yang selesai sekali. Terbalik jadi tidak, karena tenaga yang ' +
      'kamu punya sedang diarahkan ke tempat yang tidak menuntutnya.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Delapan atau sebelas' },
    {
      kind: 'paragraph',
      text:
        'Di tumpukan yang lebih tua, kartu ini bernomor sebelas dan Justice bernomor ' +
        'delapan. Waite menukar keduanya, dan alasannya bukan selera: dengan susunan ' +
        'baru itu urutan kartunya mengikuti urutan zodiak, sehingga Leo jatuh di ' +
        'nomor delapan dan Libra di nomor sebelas. Tumpukan ini mengikuti Waite — bukan ' +
        'karena yang lain keliru, tapi karena satu tumpukan harus memilih satu urutan: ' +
        'angka kartu ikut dibaca, dan dua sistem dalam satu tumpukan tidak bisa dibaca ' +
        'sama sekali.',
    },
    {
      kind: 'cardRef',
      slug: 'justice',
      text: 'Sisi lain dari pertukaran itu: Justice (XI)',
    },

    { kind: 'heading', level: 2, text: 'Leo, api yang tetap' },
    {
      kind: 'paragraph',
      text:
        'Lambangnya Leo: api, dan tetap. Api yang tetap adalah gabungan yang paling ' +
        'jarang — kebanyakan api bergerak atau padam. Api yang tetap adalah bara: ' +
        'tidak menyala tinggi, tidak mati, dan panas selama berjam-jam. Itu persis yang ' +
        'diminta kartu ini: bukan ledakan keberanian sekali, melainkan panas yang sama ' +
        'setiap hari sampai keadaannya berubah.',
    },

    { kind: 'heading', level: 2, text: 'Teth, ular, dan pedang yang menyala' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Teth, yang berarti ular. Ular adalah binatang yang paling sering ' +
        'dipakai untuk menggambarkan sesuatu yang berbahaya dan sekaligus tua — ' +
        'sesuatu yang tidak bisa dijinakkan, cuma bisa dipahami.',
    },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn menyebutnya Daughter of the Flaming Sword. Perhatikan bahwa ' +
        'pedangnya ada di judulnya dan tidak ada di gambarnya. Yang tajam sudah ' +
        'diwariskan; yang dipakai di kartu ini tangan kosong.',
    },

    { kind: 'heading', level: 2, text: 'Tangan di dalam mulut' },
    {
      kind: 'paragraph',
      text:
        'Di kartu yang lebih dikenal, perempuan itu berdiri dan menutup rahang singa ' +
        'dengan tenang. Di kartu kami dia berlutut, dan tangannya ada di dalam mulut ' +
        'yang terbuka lebar.',
    },
    {
      kind: 'paragraph',
      text:
        'Mata singanya terpejam. Binatang itu tidak sedang menyerang dan tidak sedang ' +
        'jinak; dia sedang diam. Ada darah di lengan baju perempuan itu, dan darah ' +
        'itu bukan dari hari ini.',
    },
    {
      kind: 'paragraph',
      text:
        'Susunan itu memindahkan seluruh isi kartu dari kekuatan ke kepercayaan yang ' +
        'sudah dibayar. Dia tidak menahan singanya. Dia ada di posisi di mana singa ' +
        'itu bisa mengakhirinya kapan saja, dan tetap di situ.',
    },

    { kind: 'heading', level: 2, text: 'Angka delapan' },
    {
      kind: 'paragraph',
      text:
        'Delapan adalah angka pengulangan: dua kali empat, satu bentuk yang ditumpuk ' +
        'pada dirinya sendiri. Satu kartu lain melipat kembali ke sini — The Star di ' +
        'nomor tujuh belas — dan itu masuk akal, karena keduanya soal sesuatu yang ' +
        'harus dilakukan berulang tanpa jaminan.',
    },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya soal satu hal yang akan kamu temui hari ini ' +
        'dan yang paling mudah diselesaikan dengan membentak. Kartunya menyarankan ' +
        'jalan yang lebih lambat, bukan karena lebih mulia, tapi karena yang cepat ' +
        'harus diulang minggu depan.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang sedang berjalan dia hampir selalu ' +
        'menunjuk pada sesuatu yang sudah lama kamu tahan tanpa menyebutnya sebagai ' +
        'pekerjaan.',
    },
  ],

  questions: [
    {
      q: 'Kenapa Strength nomor delapan, bukan sebelas?',
      a:
        'Karena tumpukan ini mengikuti susunan Waite, yang menukar Strength dan ' +
        'Justice supaya urutan kartu mengikuti urutan zodiak — Leo di delapan, Libra ' +
        'di sebelas. Tumpukan yang lebih tua menomorinya terbalik, dan keduanya sah.',
    },
    {
      q: 'Strength berarti saya harus menahan perasaan saya?',
      a:
        'Justru sebaliknya. Menahan adalah menekan, dan kartu ini soal menemani ' +
        'sesuatu tanpa menang atasnya. Singa di gambarnya tidak diikat; matanya ' +
        'terpejam karena tidak ada yang perlu dilawan.',
    },
    {
      q: 'Kalau kartu ini keluar soal orang lain?',
      a:
        'Biasanya artinya orang itu sedang menahan sesuatu yang tidak kamu lihat, ' +
        'dan sudah cukup lama. Itu bukan izin untuk mendorongnya; itu keterangan ' +
        'tentang berapa banyak yang sudah dia bayar.',
    },
    {
      q: 'Bedanya Strength dan The Emperor apa?',
      a:
        'The Emperor memasang batas dari luar, dan batas itu bekerja walaupun dia ' +
        'tidak ada. Strength menahan dari dalam, dan berhenti bekerja begitu orangnya ' +
        'berhenti hadir.',
    },
  ],
};

export default strengthId;
