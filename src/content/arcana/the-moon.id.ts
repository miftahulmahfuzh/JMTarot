import type { LoreDoc } from '@/content/types';

/**
 * The Moon (XVIII), Indonesian. **THE SOURCE DOCUMENT OF THE PAIR.**
 *
 * Research, confirmed before writing:
 *   - Golden Dawn title "Ruler of Flux and Reflux", Hebrew letter Qoph, path
 *     Netzach -> Malkuth, sign Pisces.
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Waite on the crayfish, and the Rider-Waite composition.
 *     https://www.occult.live/index.php?title=The_Moon
 *   - Our painting, looked at directly (`public/cards/18_moon.webp`): the moon's
 *     face is turned DOWN; both towers are ruined; a wolf howls left and a paler
 *     dog right; a skull sits on the right-hand stonework; the cobbled road runs
 *     dead straight to a city that is rubble; the pool is fouled with blood.
 *
 * MALAY CHECK: no `kerjaya`, `hala tuju`, `sembang`, `awak`, `tempoh`, `kerana`,
 * `iaitu`, `ianya`, `manakala`, `seronok`, `kelmarin`. `kamu` throughout.
 * NO THERAPY, DIAGNOSIS OR HEALING LANGUAGE. `Major Arcana` stays English.
 * CARD NAMES STAY ENGLISH -- `The Moon`, never `Sang Bulan` and never `Pulan`.
 *
 * AGREES WITH THE ENGINE: yesno `no` upright, `yes` reversed (`effectiveYesNo`
 * flips it, and `lore.test.ts` asserts these two fields against it). Polarity
 * `shadow` upright, `light` reversed. Root card The Hermit, from `reduce(18) = 9`.
 */
export const theMoonId: LoreDoc = {
  slug: 'the-moon',
  locale: 'id',
  cardId: 18,
  anchor: 'goldenDawnTitle',

  title: 'Arti Kartu The Moon (XVIII) — Tarot Major Arcana',
  description:
    'The Moon (XVIII) bicara soal yang belum jelas: mimpi, ilusi, dan pasang yang ' +
    'naik tanpa diminta. Arti tegak, terbalik, dan lambang Pisces di baliknya.',
  h1: 'Arti Kartu The Moon (XVIII)',
  standfirst:
    'Kartu kedelapan belas Major Arcana. Bukan kartu kebohongan — kartu cahaya yang ' +
    'tidak cukup untuk melihat, dan keputusan yang tetap harus diambil di dalamnya.',
  imageAlt:
    'Bulan penuh berwajah menunduk tergantung di antara dua menara yang sudah runtuh; ' +
    'seekor serigala dan seekor anjing melolong dari dua sisi jalan batu, dan seekor ' +
    'udang karang merangkak keluar dari kolam gelap di depan.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Moon tidak menuduh siapa-siapa berbohong. Dia cuma memberi tahu ' +
        'bahwa penerangannya kurang. Jalannya masih jalan yang sama dan tujuannya belum ' +
        'pindah; yang berubah adalah seberapa jauh ke depan kamu bisa melihat malam ini.',
    },
    {
      kind: 'paragraph',
      text:
        'Apa yang sedang dibisikkan oleh hal yang belum jelas biasanya benar sebagian, ' +
        'dan justru "sebagian" itu masalahnya. Kalau dibuang, kamu ikut membuang sinyal ' +
        'yang sungguhan. Kalau dituruti seluruhnya, kamu menyusun rencana di atas ' +
        'keterangan yang separuhnya belum masuk.',
    },
    {
      kind: 'paragraph',
      text:
        'Karena itu kartu ini jarang menyuruh menunggu sampai semuanya pasti. Sering ' +
        'kali kepastian itu memang tidak akan datang. Yang dia tawarkan adalah izin ' +
        'untuk melangkah sambil tahu bahwa kamu sedang menebak — dan itu jauh lebih ' +
        'aman daripada menebak sambil merasa yakin.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, arahnya membalik. Bukan lagi hal samar yang berbicara kepadamu, ' +
        'tapi rasa takutmu sendiri yang berbicara, dan kamu memperlakukannya sebagai ' +
        'pertanda.',
    },
    {
      kind: 'paragraph',
      text:
        'Ini kartu jam dua pagi. Membaca ulang satu pesan sampai tujuh kali. Menyusun ' +
        'cerita yang lengkap dari satu kalimat yang terpotong. Bedanya dengan intuisi ' +
        'tidak ada di rasanya — rasanya persis sama dari dalam — tapi di apa yang ' +
        'terjadi kalau kamu memeriksanya: intuisi bertahan dan makin jelas, ketakutan ' +
        'berubah ceritanya setiap kali ditanya kedua kali.',
    },
    {
      kind: 'paragraph',
      text:
        'Jadi kartu ini terbalik jarang minta kamu berani. Dia minta kamu memeriksa. ' +
        'Satu pertanyaan yang jawabannya bisa dicek hari ini lebih berguna daripada ' +
        'satu malam penuh menebak.',
    },
  ],

  yesno: {
    upright: 'no',
    reversed: 'yes',
    note:
      'Tegak, jawabannya tidak: keterangannya belum cukup untuk memutuskan. Terbalik, ' +
      'kartu ini justru membalik jadi ya — ya yang bersyarat, karena yang menahan ' +
      'ternyata cerita yang kamu percayai dan bukan keadaannya, dan cerita lebih murah ' +
      'diperiksa daripada keadaan.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Penguasa pasang dan surut' },
    {
      kind: 'paragraph',
      text:
        'Dalam susunan Golden Dawn, kartu kedelapan belas diberi judul Ruler of Flux ' +
        'and Reflux — penguasa pasang dan surut. Bukan penguasa kebohongan. Penguasa ' +
        'hal yang naik lalu turun lagi tanpa pernah minta izin, dan yang kadarnya ' +
        'tidak pernah sama dua malam berturut-turut.',
    },
    {
      kind: 'paragraph',
      text:
        'Huruf Ibrani yang dipasangkan padanya adalah Qoph, yang secara tradisi ' +
        'dikaitkan dengan bagian belakang kepala dan dengan tidur: bagian dirimu yang ' +
        'menyerap dulu dan berpikir belakangan. Untuk kartu ini itu bacaan yang jujur, ' +
        'dan sekaligus peringatannya.',
    },

    { kind: 'heading', level: 2, text: 'Pisces, air, dan yang tidak mau dipatok' },
    {
      kind: 'paragraph',
      text:
        'Lambangnya Pisces: air, dan mutable. Air mengikuti bentuk wadahnya dan ingat ' +
        'lama apa yang pernah ditampungnya; mutable berarti dia akan berubah bentuk ' +
        'lagi daripada berhenti. Itu deskripsi yang tepat untuk keadaan yang belum ' +
        'jelas, dan juga untuk versi ceritamu tentang keadaan itu — yang menjelaskan ' +
        'kenapa kartu ini sering terbaca sebagai keduanya sekaligus.',
    },

    { kind: 'heading', level: 2, text: 'Dua menara, dua binatang, satu jalan' },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami bulannya menunduk. Wajahnya ada, tapi tidak menatap balik. Dua ' +
        'menara di kiri dan kanan sudah runtuh sebagian, panji-panjinya tinggal ' +
        'sobekan, dan jalan batu di antaranya tetap lurus dan tetap terbaca — menuju ' +
        'kota yang sudah jadi puing. Jalannya masih jelas; tujuannya tidak.',
    },
    {
      kind: 'paragraph',
      text:
        'Di dua sisi jalan ada serigala dan anjing, dan keduanya melolong ke arah yang ' +
        'sama. Yang satu belum pernah dijinakkan, yang satu pernah. Pada penerangan ' +
        'sebesar ini kamu tidak bisa membedakan dorongan yang liar dari kebiasaan yang ' +
        'sudah dilatih, dan dua-duanya milikmu.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang paling tua di gambar itu ada paling depan: udang karang yang merangkak ' +
        'keluar dari kolam. Dia tidak berniat apa-apa. Dia naik karena airnya bergerak.',
    },
    {
      kind: 'quote',
      text: 'sesuatu yang letaknya lebih dalam daripada binatang buas',
      source: 'A. E. Waite, tentang makhluk di kolam kartu The Moon',
    },

    { kind: 'heading', level: 2, text: 'Angka delapan belas' },
    {
      kind: 'paragraph',
      text:
        'Delapan belas dilipat menjadi sembilan, dan sembilan adalah The Hermit. Kartu ' +
        'yang membawa lampunya sendiri berdiri persis di belakang kartu yang cahayanya ' +
        'bukan pilihannya. Jarak antara keduanya itulah ukuran kartu ini: The Hermit ' +
        'memilih gelapnya. The Moon tidak.',
    },
    { kind: 'cardRef', slug: 'the-hermit', text: 'Baca lore The Hermit (IX)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, The Moon biasanya bukan ramalan kejadian. Dia catatan soal ' +
        'kondisi penglihatanmu hari itu: hari yang bukan untuk memutuskan hal besar, ' +
        'dan hari yang bagus untuk mengumpulkan satu keterangan yang bisa dicek.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, posisinya mengubah artinya lebih banyak daripada ' +
        'biasanya. Di posisi yang sudah lewat, dia bilang keputusan sebelumnya diambil ' +
        'dengan keterangan yang tidak lengkap — itu penjelasan, bukan tuduhan. Di ' +
        'posisi yang menanti di depan, artinya paling sederhana: keterangannya belum ' +
        'lengkap dan belum akan lengkap sebelum kamu bergerak.',
    },
  ],

  questions: [
    {
      q: 'The Moon kartu buruk atau bukan?',
      a:
        'Bukan. Dia tidak meramalkan kerugian. Dia melaporkan bahwa keterangan yang ' +
        'kamu punya belum lengkap, dan laporan itu paling berguna justru ketika kamu ' +
        'sedang mau memutuskan sesuatu yang besar.',
    },
    {
      q: 'Kalau The Moon keluar soal orang lain, artinya dia menyembunyikan sesuatu?',
      a:
        'Biasanya bukan itu. Lebih sering artinya kamu belum tahu apa yang sedang dia ' +
        'hadapi, dan cerita yang kamu susun untuk menutup kekosongan itu terasa ' +
        'lengkap justru karena kamu sendiri yang menulisnya.',
    },
    {
      q: 'Untuk pertanyaan ya atau tidak, The Moon jawabannya apa?',
      a:
        'Tegak, tidak. Terbalik, kartu ini membalik jadi ya, dengan syarat: yang ' +
        'selama ini menahan adalah ketakutan yang kamu baca sebagai pertanda, dan ' +
        'begitu itu diperiksa, jalannya biasanya terbuka.',
    },
    {
      q: 'Bedanya The Moon dan The Star apa?',
      a:
        'The Star adalah harapan yang tenang setelah semuanya berantakan; kamu tahu ' +
        'apa yang kamu tuju. The Moon adalah malam sebelum itu, waktu kamu belum tahu ' +
        'mana cahaya yang benar.',
    },
  ],
};

export default theMoonId;
