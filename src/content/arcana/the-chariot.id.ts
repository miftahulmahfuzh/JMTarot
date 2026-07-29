import type { LoreDoc } from '@/content/types';

/**
 * The Chariot (VII), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Cancer, cardinal water; Hebrew letter Cheth (the fence or enclosure); Golden
 *     Dawn title "Lord of the Triumph of Light".
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: a crowned charioteer under a starry canopy, drawn by a black
 *     and a white sphinx, holding no reins.
 *   - Our painting (`public/cards/07_chariot.webp`): an armoured rider on a heavy
 *     war chariot drawn by TWO STONE SPHINXES, tattered banners on a long pole,
 *     a CITY BURNING on the horizon behind him; shields, bodies and mud beneath
 *     the wheels, and the ground is red.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS.
 *
 * ENGINE: element `water` -- `SIGNS.cancer.element` is `water`, asserted. yesno
 * `yes` -> `no`; polarity `light` -> `shadow`; stage `beginning`.
 */
export const theChariotId: LoreDoc = {
  slug: 'the-chariot',
  locale: 'id',
  cardId: 7,
  anchor: 'goldenDawnTitle',

  title: 'Arti Kartu The Chariot (VII) — Tarot Major Arcana',
  description:
    'The Chariot (VII) adalah dorongan yang masih bisa kamu kemudikan. Arti tegak, ' +
    'terbalik, dan judul Triumph of Light yang diberikan padanya.',
  h1: 'Arti Kartu The Chariot (VII)',
  standfirst:
    'Kartu ketujuh Major Arcana. Bukan kartu kemenangan — kartu kecepatan yang ' +
    'sudah terlanjur ada, dan pertanyaan apakah kamu masih memegangnya.',
  imageAlt:
    'Penunggang berbaju zirah berdiri di atas kereta perang yang ditarik dua sfinks ' +
    'batu, panji-panji robek di tiangnya; di kejauhan sebuah kota terbakar, dan di ' +
    'bawah roda-rodanya ada perisai dan tanah yang merah.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Chariot bukan kartu tentang memulai. Sesuatu sudah bergerak ' +
        'sebelum kartu ini keluar, dan yang dia tanyakan cuma satu: apakah kamu masih ' +
        'yang mengemudikannya, atau kamu sedang ikut karena sudah terlanjur cepat.',
    },
    {
      kind: 'paragraph',
      text:
        'Perbedaan itu bisa diperiksa dengan satu pertanyaan yang tidak enak. Kalau ' +
        'kamu memutuskan berhenti minggu ini, apa yang terjadi? Kalau jawabannya bisa ' +
        'kamu sebutkan, kamu masih memegang. Kalau jawabannya "tidak mungkin ' +
        'berhenti", yang mengemudikan bukan kamu.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang dia tawarkan bukan tambahan tenaga. Tenaganya sudah cukup, kadang ' +
        'berlebih. Yang dia tawarkan adalah arah, dan arah cuma bisa dipasang oleh ' +
        'orang yang mau memikul akibat kalau arahnya keliru.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, tenaga besar yang tidak punya arah. Semua bagian dari kartunya ' +
        'masih ada — kereta, kuda, kecepatan — dan yang hilang cuma tangan yang ' +
        'memegang, jadi dari luar dia masih terlihat seperti kemajuan.',
    },
    {
      kind: 'paragraph',
      text:
        'Bentuk yang paling sering: pekerjaan yang jam kerjanya naik terus dan tidak ' +
        'ada satu pun yang selesai, atau kesibukan yang setiap minggunya terasa ' +
        'mendesak dan tidak satu pun bisa disebut namanya kalau ditanya untuk apa.',
    },
    {
      kind: 'paragraph',
      text:
        'Jawabannya membalik jadi tidak, dan penolakannya spesifik: bukan "jangan", ' +
        'tapi "belum, sampai ada yang memegang kemudinya". Menambah kecepatan pada ' +
        'sesuatu yang tidak diarahkan cuma memindahkan tabrakannya lebih dekat.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Tegak, ya — dan ya untuk sesuatu yang sudah berjalan, bukan untuk sesuatu ' +
      'yang baru. Terbalik jadi tidak, karena menambah tenaga pada sesuatu yang ' +
      'tidak diarahkan hanya memajukan jadwal tabrakannya.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Triumph of Light' },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn menyebutnya Lord of the Triumph of Light. Kata yang paling ' +
        'penting di situ bukan Triumph, tapi Lord — dia penguasa atas kemenangan itu, ' +
        'bukan kemenangan itu sendiri. Kartunya soal siapa yang memegang, bukan soal ' +
        'siapa yang menang.',
    },
    {
      kind: 'paragraph',
      text:
        'Itu juga yang membedakannya dari kartu-kartu di sekitarnya. Kemenangan ada ' +
        'di banyak kartu; kendali atas sesuatu yang sudah bergerak hanya ada di sini.',
    },

    { kind: 'heading', level: 2, text: 'Cancer, air yang kardinal, di balik baju zirah' },
    {
      kind: 'paragraph',
      text:
        'Lambangnya Cancer: air, dan kardinal. Ini penempatan yang paling sering ' +
        'membuat orang berhenti sejenak, karena kartunya kelihatan seperti kartu api. ' +
        'Tapi Cancer adalah tanda cangkang: yang lunak dilindungi oleh yang keras.',
    },
    {
      kind: 'paragraph',
      text:
        'Baju zirah di kartu ini bukan tanda kekuatan. Dia tanda bahwa ada sesuatu di ' +
        'dalamnya yang perlu dilindungi supaya bisa terus maju. Orang yang benar-benar ' +
        'tidak bisa dilukai tidak perlu memakai apa-apa.',
    },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Cheth, yang berarti pagar atau tempat berpagar. Sekali lagi ' +
        'cangkang, bukan senjata.',
    },

    { kind: 'heading', level: 2, text: 'Sfinks batu, dan kota yang terbakar' },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami yang menarik kereta itu dua sfinks batu, dan keduanya tidak ' +
        'memandang ke arah yang sama. Di susunan yang lebih dikenal, keduanya hitam ' +
        'dan putih dan penunggangnya tidak memegang tali kekang sama sekali — dia ' +
        'mengarahkan dengan kehendak, kata para penafsirnya.',
    },
    {
      kind: 'paragraph',
      text:
        'Di belakangnya ada kota yang terbakar. Kartu ini tidak memberi tahu apakah ' +
        'dia baru saja meninggalkan kota itu atau baru saja membakarnya, dan itu ' +
        'bukan kelalaian pelukisnya. Kemajuan cepat hampir selalu punya sesuatu di ' +
        'belakangnya yang tidak ikut.',
    },
    {
      kind: 'paragraph',
      text:
        'Panji-panji di tiangnya sudah robek. Dia masih membawanya.',
    },

    { kind: 'heading', level: 2, text: 'Angka tujuh' },
    {
      kind: 'paragraph',
      text:
        'Tujuh datang setelah enam menyusun bagian-bagian jadi satu bentuk, dan ' +
        'sebelum delapan menguji apakah bentuk itu tahan. Dalam banyak susunan tujuh ' +
        'adalah angka kemenangan yang belum diuji, dan itu tepat: kartu ini bergerak ' +
        'cepat dan belum tahu ke mana.',
    },
    { kind: 'cardRef', slug: 'the-tower', text: 'Baca lore The Tower (XVI)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya menandai hari yang sudah penuh sebelum kamu ' +
        'bangun. Yang berguna hari itu bukan menambah, tapi memilih satu hal yang ' +
        'dipegang sampai selesai.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang sedang berjalan dia hampir selalu ' +
        'akurat dan tidak nyaman: ada sesuatu yang sedang melaju sekarang. Di posisi ' +
        'yang menanti di depan, dia bukan janji menang — dia peringatan bahwa ' +
        'kecepatannya akan naik.',
    },
  ],

  questions: [
    {
      q: 'The Chariot berarti saya akan menang?',
      a:
        'Bukan itu yang dia janjikan. Judul tradisionalnya menyebut penguasa atas ' +
        'kemenangan, bukan kemenangan, dan kartunya soal kendali atas sesuatu yang ' +
        'sudah berjalan.',
    },
    {
      q: 'Kenapa unsurnya air padahal kartunya keras?',
      a:
        'Karena lambangnya Cancer, tanda cangkang. Baju zirah di gambarnya bukan ' +
        'tanda kebal; dia tanda ada yang perlu dilindungi di dalamnya supaya ' +
        'perjalanannya bisa diteruskan.',
    },
    {
      q: 'Terbalik, apa saya harus berhenti total?',
      a:
        'Biasanya tidak. Terbalik dia menunjuk pada arah yang hilang, bukan pada ' +
        'kecepatan yang salah. Satu jam untuk menyebutkan tujuannya biasanya lebih ' +
        'berguna daripada satu minggu untuk melambat.',
    },
    {
      q: 'Bedanya The Chariot dan The Tower apa?',
      a:
        'The Chariot masih bisa dikemudikan. The Tower adalah apa yang terjadi pada ' +
        'sesuatu yang tidak dikemudikan cukup lama.',
    },
  ],
};

export default theChariotId;
