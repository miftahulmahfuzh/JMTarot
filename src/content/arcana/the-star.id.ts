import type { LoreDoc } from '@/content/types';

/**
 * The Star (XVII), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Aquarius, fixed air; Hebrew letter Tzaddi (the fish-hook); Golden Dawn title
 *     "Daughter of the Firmament, the Dweller between the Waters".
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: a naked woman kneeling by a pool, one foot on the water and one
 *     on land, pouring from two jugs; one large star and seven smaller above; an
 *     ibis in the tree.
 *   - Our painting (`public/cards/17_star.webp`): she kneels IN the shallows of a
 *     black pool; what she pours from both jugs is DARK RED, one stream into the
 *     water and one onto the bank; one large star and seven smaller ones above; a
 *     bare dead tree on the left. Her reflection is in the water.
 *
 * **THE ENGLISH DOCUMENT MAY NOT USE `heal` OR `healing`** -- both on
 * `THERAPY_EN`, and this is the other card (with Temperance) that reaches for
 * them. Indonesian: no `menyembuhkan`, no `penyembuhan`.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout.
 *
 * ENGINE: element `air` -- `SIGNS.aquarius.element` is `air`, asserted. yesno
 * `yes` -> `no`; polarity `light` -> `shadow`; stage `reckoning`.
 * Root card: `reduce(17)` is 8, Strength.
 */
export const theStarId: LoreDoc = {
  slug: 'the-star',
  locale: 'id',
  cardId: 17,
  anchor: 'number',

  title: 'Arti Kartu The Star (XVII) — Tarot Major Arcana',
  description:
    'The Star (XVII) adalah harapan yang tenang setelah semuanya berantakan. Arti ' +
    'tegak, terbalik, dan kenapa tujuh belas melipat kembali ke Strength.',
  h1: 'Arti Kartu The Star (XVII)',
  standfirst:
    'Kartu ketujuh belas Major Arcana. Bukan kartu keberuntungan yang datang — ' +
    'kartu yang datang sesudah, waktu keadaannya sudah terjadi dan sudah lewat.',
  imageAlt:
    'Seorang perempuan berlutut di tepi kolam hitam sambil menuangkan cairan merah ' +
    'pekat dari dua kendi, satu ke dalam air dan satu ke tanah; di atasnya satu ' +
    'bintang besar dan tujuh yang lebih kecil, dan sebatang pohon kering di kiri.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Star datang setelah The Tower, dan urutan itu bukan kebetulan. ' +
        'Harapan yang dia bawa bukan harapan bahwa sesuatu tidak akan terjadi. ' +
        'Sesuatu itu sudah terjadi.',
    },
    {
      kind: 'paragraph',
      text:
        'Itu jenis harapan yang berbeda, dan jauh lebih kuat, karena dia tidak bisa ' +
        'dibatalkan oleh kabar buruk berikutnya. Yang paling buruk sudah lewat, dan ' +
        'kamu masih di sini, dan itu bukan perasaan — itu keterangan.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang dia minta sesuai dengan itu: sesuatu yang kecil, yang diulang, tanpa ' +
        'tanda apa pun bahwa dia sedang bekerja. Kartu ini tidak menjanjikan bahwa ' +
        'kamu akan merasakan kemajuannya. Dia menjanjikan bahwa kemajuannya ada.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, harapan yang ditaruh pada cahaya yang keliru. Bukan kehilangan ' +
        'harapan — kartu ini terbalik jarang soal orang yang berhenti berharap. Dia ' +
        'soal harapan yang masih penuh dan sedang diarahkan ke tempat yang tidak ' +
        'akan menjawabnya.',
    },
    {
      kind: 'paragraph',
      text:
        'Tandanya bisa dilihat dari luar: satu hal yang setiap kali hampir terjadi, ' +
        'dan setiap kali batal karena alasan baru yang selalu masuk akal. Yang ' +
        'membuatnya bertahan lama justru bahwa alasannya selalu masuk akal.',
    },
    {
      kind: 'paragraph',
      text:
        'Jawabannya membalik jadi tidak, dan yang ditolak bukan harapannya. Yang ' +
        'ditolak adalah arahnya. Harapan yang sama, dipindahkan ke tempat yang bisa ' +
        'menjawab, biasanya cukup.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Tegak, ya, dan ya yang pelan: ya untuk sesuatu yang kemajuannya tidak akan ' +
      'terasa selama dikerjakan. Terbalik jadi tidak — bukan karena harapannya ' +
      'keliru, tapi karena arahnya, dan arah bisa dipindahkan.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Tujuh belas, dan lipatannya ke delapan' },
    {
      kind: 'paragraph',
      text:
        'Tujuh belas dilipat menjadi delapan, dan delapan adalah Strength. Itu ' +
        'pasangan yang paling menjelaskan kartu ini dari seluruh tabelnya.',
    },
    {
      kind: 'paragraph',
      text:
        'Strength adalah tangan yang tetap terbuka di depan sesuatu yang sanggup ' +
        'melukainya, setiap hari, tanpa ada yang memuji. The Star adalah hal yang ' +
        'sama diletakkan setelah kehancuran: pengulangan kecil yang tidak terasa ' +
        'berhasil, dilakukan lagi besok. Kartu yang terlihat paling lembut di ' +
        'tumpukan ini berdiri di atas kartu yang paling menuntut.',
    },
    { kind: 'cardRef', slug: 'strength', text: 'Baca lore Strength (VIII)' },

    { kind: 'heading', level: 2, text: 'Aquarius, udara yang tetap' },
    {
      kind: 'paragraph',
      text:
        'Lambangnya Aquarius: udara, dan tetap. Aquarius digambarkan dengan orang ' +
        'yang menuang air dan bukan dengan air itu sendiri — dia tanda udara, dan itu ' +
        'sering mengejutkan orang.',
    },
    {
      kind: 'paragraph',
      text:
        'Udara yang tetap berarti satu gagasan yang dipegang lama. Bukan perasaan ' +
        'yang bertahan; gagasan. Untuk kartu tentang harapan setelah kehancuran, ' +
        'perbedaan itu penting: yang bertahan bukan suasana hatinya, melainkan ' +
        'kesimpulan yang sudah kamu ambil dan tidak kamu tarik lagi.',
    },

    { kind: 'heading', level: 2, text: 'Tzaddi, kail' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Tzaddi, yang dalam beberapa tradisi berarti kail ikan. Sebuah kail ' +
        'adalah alat yang dipakai di tempat yang tidak bisa dilihat isinya, dan yang ' +
        'bekerja dengan cara menunggu.',
    },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn menyebutnya Daughter of the Firmament, the Dweller between the ' +
        'Waters. Yang tinggal di antara dua air: satu kaki di kolam, satu di tanah, ' +
        'dan itu memang posisinya di gambar.',
    },

    { kind: 'heading', level: 2, text: 'Yang dituang, dan pohon yang kering' },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami dia berlutut di air dangkal kolam yang hitam, dan yang ' +
        'dituangkan dari kedua kendinya merah pekat — satu aliran ke air, satu ke ' +
        'tanah. Satu bintang besar dan tujuh yang kecil ada di atasnya, persis ' +
        'seperti di kartu yang lama.',
    },
    {
      kind: 'paragraph',
      text:
        'Pohon di kiri sudah kering. Di kartu yang lebih dikenal ada burung di ' +
        'dahannya. Di sini dahannya kosong, dan yang tersisa dari gambar aslinya ' +
        'adalah bintang-bintangnya dan gerakan menuangnya.',
    },
    {
      kind: 'paragraph',
      text:
        'Bayangannya ada di air, dan itu satu-satunya hal di kartu ini yang ' +
        'menghadap ke arah kita.',
    },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya bukan kabar. Dia izin untuk mengerjakan satu ' +
        'hal kecil yang hasilnya tidak akan kelihatan minggu ini, dan tetap ' +
        'mengerjakannya.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang menanti di depan dia jarang berarti ' +
        'peristiwa. Dia berarti keadaan sesudahnya. Di posisi yang sudah lewat, dia ' +
        'menunjuk pada masa pemulihan yang waktu itu tidak terasa seperti pemulihan.',
    },
  ],

  questions: [
    {
      q: 'The Star berarti keberuntungan akan datang?',
      a:
        'Bukan begitu. Dia kartu yang datang sesudah, bukan sebelum. Harapan yang ' +
        'dia bawa bertumpu pada sesuatu yang sudah terjadi dan sudah kamu lewati, ' +
        'bukan pada sesuatu yang diharapkan tidak terjadi.',
    },
    {
      q: 'Kenapa dia menuang ke tanah juga, bukan cuma ke air?',
      a:
        'Karena setengah dari apa yang kamu keluarkan memang tidak kembali ke ' +
        'tempatnya. Kartu ini tidak berpura-pura bahwa semua yang dituang terpakai, ' +
        'dan tetap menyuruh menuang.',
    },
    {
      q: 'Terbalik, apakah artinya saya harus berhenti berharap?',
      a:
        'Tidak. Terbalik dia menunjuk pada arahnya, bukan pada harapannya. Harapan ' +
        'yang sama, dipindahkan ke tempat yang bisa menjawab, biasanya sudah cukup.',
    },
    {
      q: 'Bedanya The Star dan The Sun apa?',
      a:
        'The Sun terang dan tidak menyisakan bayangan; semuanya kelihatan. The Star ' +
        'redup dan jauh, dan yang dia tawarkan cuma cukup arah untuk berjalan malam ' +
        'ini.',
    },
  ],
};

export default theStarId;
