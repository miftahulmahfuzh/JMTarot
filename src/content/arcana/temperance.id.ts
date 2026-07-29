import type { LoreDoc } from '@/content/types';

/**
 * Temperance (XIV), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Sagittarius, mutable fire; Hebrew letter Samekh (the prop or support);
 *     Golden Dawn title "Daughter of the Reconcilers, the Bringer Forth of Life".
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: a winged angel with one foot in a pool and one on land, pouring
 *     water between two cups, irises growing on the bank.
 *   - Our painting (`public/cards/14_temperance.webp`): the figure is HOODED and
 *     faceless with heavy dark wings; what pours between the two vessels is DARK
 *     RED, not water; one bare foot is in the stream; irises grow on the bank
 *     exactly as in the older card, and the stream runs red where it lands.
 *
 * **THE ENGLISH DOCUMENT MAY NOT USE `heal` OR `healing`** -- both are on
 * `THERAPY_EN` and this is one of the two cards (with The Star) that reaches for
 * them. Indonesian: no `menyembuhkan`, no `penyembuhan`.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout.
 *
 * ENGINE: element `fire` -- `SIGNS.sagittarius.element` is `fire`, asserted.
 * **`yesno` is `maybe` in BOTH orientations.** Polarity `light` -> `shadow`.
 * Root card: `reduce(14)` is 5, The Hierophant.
 */
export const temperanceId: LoreDoc = {
  slug: 'temperance',
  locale: 'id',
  cardId: 14,
  anchor: 'goldenDawnTitle',

  title: 'Arti Kartu Temperance (XIV) — Tarot Major Arcana',
  description:
    'Temperance (XIV) adalah jalan tengah yang butuh kesabaran. Arti tegak, ' +
    'terbalik, dan judul Daughter of the Reconcilers yang diberikan padanya.',
  h1: 'Arti Kartu Temperance (XIV)',
  standfirst:
    'Kartu keempat belas Major Arcana. Bukan kartu keseimbangan yang tenang — ' +
    'kartu takaran, dan takaran hanya bisa ditemukan dengan mencoba.',
  imageAlt:
    'Sesosok bertudung bersayap gelap menuangkan cairan merah pekat dari satu ' +
    'bejana ke bejana lain, satu kakinya telanjang di dalam aliran air; bunga iris ' +
    'tumbuh di tepian, dan airnya berubah merah di tempat tuangannya jatuh.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, Temperance bukan kartu tentang menahan diri. Dia kartu tentang ' +
        'takaran, dan takaran adalah angka yang tidak bisa dihitung di kepala. Dia ' +
        'cuma bisa ditemukan dengan menuang, melihat hasilnya, lalu menuang lagi.',
    },
    {
      kind: 'paragraph',
      text:
        'Itu sebabnya kartu ini lambat, dan lambatnya bukan kesabaran yang mulia. ' +
        'Yang dituntut adalah kesediaan menghabiskan beberapa percobaan yang salah, ' +
        'tanpa menyimpulkan setelah percobaan pertama bahwa jalan tengahnya tidak ' +
        'ada.',
    },
    {
      kind: 'paragraph',
      text:
        'Jawabannya belum jelas di kedua arah, dan di sini itu bukan penghindaran. ' +
        'Kartu ini memang tidak tahu angkanya. Yang dia tahu adalah bahwa angkanya ' +
        'ada, dan bahwa kamu belum menuang cukup banyak untuk menemukannya.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, dua hal berlawanan yang menolak menyatu. Bukan karena salah satu ' +
        'salah, tapi karena keduanya sedang dituang dari dua tangan yang berbeda ' +
        'dan tidak ada yang mengukur.',
    },
    {
      kind: 'paragraph',
      text:
        'Bentuknya yang paling umum adalah bergantian tanpa pernah dicampur: sebulan ' +
        'penuh disiplin lalu sebulan penuh dilepas, atau seminggu bekerja habis- ' +
        'habisan lalu seminggu tidak menyentuh apa pun. Rata-ratanya kelihatan ' +
        'seimbang di atas kertas, dan tidak ada satu hari pun yang seimbang.',
    },
    {
      kind: 'paragraph',
      text:
        'Jawabannya tetap belum jelas, dan itu tetap jujur. Yang perlu diubah bukan ' +
        'salah satu dari dua sisi itu, melainkan ukuran waktunya: campurannya harus ' +
        'terjadi di dalam satu minggu, bukan di dalam satu tahun.',
    },
  ],

  yesno: {
    upright: 'maybe',
    reversed: 'maybe',
    note:
      'Belum jelas di kedua arah, dan bukan karena kartunya ragu: takarannya ada ' +
      'dan belum ketemu. Yang menentukan jawabannya bukan keadaan di luar melainkan ' +
      'berapa kali kamu bersedia menuang sebelum menyimpulkan.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Daughter of the Reconcilers' },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn menyebutnya Daughter of the Reconcilers, the Bringer Forth of ' +
        'Life. Kata pendamainya jamak, dan itu detail yang mudah terlewat: yang ' +
        'mendamaikan bukan satu pihak yang berdiri di tengah, melainkan beberapa.',
    },
    {
      kind: 'paragraph',
      text:
        'Dan bagian keduanya lebih tajam. Dia bukan Daughter of the Peacemakers. ' +
        'Yang dihasilkan dari pencampuran bukan ketenangan; yang dihasilkan sesuatu ' +
        'yang hidup, dan sesuatu yang hidup selalu lebih berantakan daripada dua ' +
        'bahan yang belum dicampur.',
    },

    { kind: 'heading', level: 2, text: 'Samekh, penopang' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Samekh, yang berarti penopang atau tiang penyangga. Sebuah ' +
        'penyangga tidak mengangkat apa pun; dia menahan sesuatu supaya tidak roboh ' +
        'selama sesuatu itu mengeras.',
    },
    {
      kind: 'paragraph',
      text:
        'Untuk kartu tentang percobaan berulang, itu keterangan yang bagus. Yang ' +
        'dibutuhkan selama mencari takaran bukan dorongan, melainkan sesuatu yang ' +
        'menjaga supaya percobaan yang gagal tidak merobohkan seluruh bangunannya.',
    },

    { kind: 'heading', level: 2, text: 'Yang dituang bukan air' },
    {
      kind: 'paragraph',
      text:
        'Di kartu yang lebih dikenal, malaikatnya menuang air bening dari satu cawan ' +
        'ke cawan lain, dan yang mustahil pada gambar itu adalah sudutnya: air itu ' +
        'mengalir mendatar. Isyaratnya bahwa yang sedang terjadi bukan hal biasa.',
    },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami yang dituang merah pekat, sosoknya bertudung dan tidak punya ' +
        'wajah, dan sayapnya gelap dan berat. Satu kaki telanjang berdiri di dalam ' +
        'aliran air, dan airnya berubah merah di tempat tuangannya jatuh.',
    },
    {
      kind: 'paragraph',
      text:
        'Bunga iris masih tumbuh di tepian, persis seperti di kartu yang lama. Kartu ' +
        'ini tidak membatalkan gagasan pencampuran; dia cuma menolak berpura-pura ' +
        'bahwa yang dicampur selalu bersih.',
    },

    { kind: 'heading', level: 2, text: 'Empat belas, dan akarnya' },
    {
      kind: 'paragraph',
      text:
        'Empat belas dilipat menjadi lima, dan lima adalah The Hierophant. Itu ' +
        'pasangan yang menjelaskan sesuatu: mencari takaran sendiri dari nol itu ' +
        'mahal, dan kartu yang meneruskan cara orang lain berdiri tepat di ' +
        'belakangnya.',
    },
    { kind: 'cardRef', slug: 'the-hierophant', text: 'Baca lore The Hierophant (V)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya menyarankan setengah dari yang kamu ' +
        'rencanakan, dikerjakan hari ini juga. Bukan penundaan; pengurangan takaran.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang menanti di depan dia menandakan ' +
        'penyesuaian, bukan peristiwa. Di posisi yang sudah lewat, dia sering ' +
        'menunjuk pada masa coba-coba yang waktu itu terasa seperti tidak ada ' +
        'kemajuan.',
    },
  ],

  questions: [
    {
      q: 'Temperance berarti saya harus menahan diri?',
      a:
        'Bukan itu isinya. Kartu ini soal menemukan takaran, dan menahan diri cuma ' +
        'satu arah dari dua arah yang mungkin. Kadang takaran yang benar justru lebih ' +
        'banyak, bukan lebih sedikit.',
    },
    {
      q: 'Kenapa jawabannya belum jelas?',
      a:
        'Karena angkanya belum ketemu, dan kartu ini tidak berpura-pura tahu. Yang ' +
        'dia pastikan cuma bahwa angkanya ada — dan itu berbeda dari mengatakan ' +
        'jalannya buntu.',
    },
    {
      q: 'Terbalik, apa yang harus saya ubah lebih dulu?',
      a:
        'Ukuran waktunya. Bergantian antara dua sisi masih bisa terlihat seimbang ' +
        'kalau dilihat setahun, dan tidak seimbang sama sekali kalau dilihat ' +
        'seminggu. Perkecil jendelanya dulu, baru perbaiki isinya.',
    },
    {
      q: 'Bedanya Temperance dan Justice apa?',
      a:
        'Justice menimbang dua hal untuk memutuskan mana yang benar. Temperance ' +
        'mencampur keduanya karena keduanya memang harus ikut, dan yang dicari cuma ' +
        'perbandingannya.',
    },
  ],
};

export default temperanceId;
