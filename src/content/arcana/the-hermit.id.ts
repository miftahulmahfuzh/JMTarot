import type { LoreDoc } from '@/content/types';

/**
 * The Hermit (IX), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Virgo, mutable earth; Hebrew letter Yod (the hand); Golden Dawn title
 *     "Prophet of the Eternal, the Magus of the Voice of Power".
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: an old man on a peak, a lamp holding a six-pointed star, a
 *     staff in his other hand, facing the viewer.
 *   - Our painting (`public/cards/09_hermit.webp`): the figure is seen FROM
 *     BEHIND, walking away, hooded, with a staff and a lantern held low; he is on
 *     a snow ridge above a sea of cloud, and there is a trail of RED DROPS down
 *     the path behind him.
 *
 * **THE VERDICT IS THE COUNTER-INTUITIVE ONE.** `no` upright and `yes` reversed:
 * a wise old man reads as a yes and is not one. `lore.test.ts` asserts both
 * against `effectiveYesNo()`.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS --
 * withdrawal here is a decision, never a condition.
 *
 * ENGINE: element `earth` -- `SIGNS.virgo.element` is `earth`, asserted.
 * **Polarity `neutral`, which does not flip.** Stage `trial`.
 */
export const theHermitId: LoreDoc = {
  slug: 'the-hermit',
  locale: 'id',
  cardId: 9,
  anchor: 'sign',

  title: 'Arti Kartu The Hermit (IX) — Tarot Major Arcana',
  description:
    'The Hermit (IX) adalah menarik diri sebentar supaya semuanya jernih. Arti ' +
    'tegak, terbalik, dan kenapa jawabannya tidak — lalu membalik jadi ya.',
  h1: 'Arti Kartu The Hermit (IX)',
  standfirst:
    'Kartu kesembilan Major Arcana. Bukan kartu kesepian — kartu penundaan yang ' +
    'dipilih sendiri, dan yang punya tanggal berakhirnya.',
  imageAlt:
    'Sesosok berjubah tebal berjalan menjauh membelakangi kita di punggung bukit ' +
    'bersalju di atas lautan awan, memegang tongkat dan sebuah lentera rendah; ' +
    'ada jejak tetesan merah di jalan setapak di belakangnya.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Hermit menjawab tidak, dan itu mengejutkan orang. Sosok tua yang ' +
        'membawa lampu terlihat seperti restu. Bukan. Yang dia bilang adalah: belum, ' +
        'dan bukan karena rencanamu buruk.',
    },
    {
      kind: 'paragraph',
      text:
        'Alasannya sederhana. Kamu sedang di tengah keramaian yang membuat setiap ' +
        'pendapat terdengar sama kerasnya, dan keputusan yang diambil di keadaan itu ' +
        'hampir selalu keputusan orang lain yang kebetulan lewat.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang dia minta bukan pertapaan. Dia minta satu jarak yang cukup untuk ' +
        'mendengar pikiranmu sendiri sampai selesai — dan penting sekali bahwa jarak ' +
        'itu punya tanggal berakhir, karena tanpa tanggal itu kartunya berubah jadi ' +
        'kartu yang lain.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, menyendiri yang disamarkan jadi kebijaksanaan. Muatannya tetap ' +
        'netral — kartu ini tidak jadi lebih gelap waktu dibalik — dan yang berubah ' +
        'adalah alasan orang itu masih di atas bukit.',
    },
    {
      kind: 'paragraph',
      text:
        'Pemeriksaannya satu pertanyaan: kapan turunnya. Menarik diri yang benar ' +
        'selalu bisa menjawabnya, walaupun jawabannya masih lama. Yang tidak bisa ' +
        'menjawabnya bukan sedang berpikir; dia sedang menghindar dan sudah menemukan ' +
        'alasan yang terdengar mulia.',
    },
    {
      kind: 'paragraph',
      text:
        'Dan di sinilah jawabannya membalik jadi ya. Bukan ya untuk terus di atas — ' +
        'ya untuk hal yang selama ini kamu tunda dengan alasan belum jernih. ' +
        'Kejernihan itu sudah datang beberapa waktu lalu.',
    },
  ],

  yesno: {
    upright: 'no',
    reversed: 'yes',
    note:
      'Tegak, tidak — dan tidak yang berarti belum, bukan jangan: keputusan yang ' +
      'diambil di tengah keramaian bukan keputusanmu. Terbalik membalik jadi ya, ' +
      'karena penundaannya sudah berhenti mengumpulkan apa pun.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Virgo, tanah yang mutable' },
    {
      kind: 'paragraph',
      text:
        'Lambangnya Virgo: tanah, dan mutable. Tanah yang mutable adalah gabungan ' +
        'yang aneh — tanah seharusnya diam. Yang keluar dari gabungan itu bukan ' +
        'kekokohan, melainkan penyaringan: memisahkan yang berguna dari yang tidak, ' +
        'butir demi butir.',
    },
    {
      kind: 'paragraph',
      text:
        'Itu pekerjaan kartu ini dan itu juga kenapa dia lambat. Menyaring tidak ' +
        'bisa dipercepat dengan tenaga, dan hasilnya cuma kelihatan setelah cukup ' +
        'banyak yang dibuang.',
    },

    { kind: 'heading', level: 2, text: 'Yod, tangan' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Yod, huruf terkecil dalam abjad Ibrani, yang berarti tangan. Dalam ' +
        'tradisi, Yod adalah titik dari mana semua huruf lain dibentuk — yang paling ' +
        'kecil sekaligus yang paling awal.',
    },
    {
      kind: 'paragraph',
      text:
        'Untuk kartu tentang menarik diri, itu keterangan yang bagus: yang sedang ' +
        'dikerjakan di atas bukit bukan sesuatu yang besar. Dia sesuatu yang kecil ' +
        'dan mendahului yang lain.',
    },

    { kind: 'heading', level: 2, text: 'Punggung yang membelakangi' },
    {
      kind: 'paragraph',
      text:
        'Di kartu yang lebih dikenal, dia menghadap ke arah kita dan mengangkat ' +
        'lampunya, dan di dalam lampu itu ada bintang bersudut enam. Isyaratnya jelas: ' +
        'dia menerangi jalan untuk orang lain.',
    },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami dia membelakangi kita dan sedang berjalan menjauh. Lenteranya ' +
        'dipegang rendah, setinggi lutut, jadi yang diterangi cuma beberapa langkah ' +
        'di depan kakinya sendiri. Tidak ada yang diterangi untuk siapa pun.',
    },
    {
      kind: 'paragraph',
      text:
        'Dan ada jejak tetesan merah di jalan setapak di belakangnya. Naik ke sini ' +
        'ada ongkosnya, dan ongkos itu sudah dibayar sebelum gambar ini diambil.',
    },

    { kind: 'heading', level: 2, text: 'Angka sembilan' },
    {
      kind: 'paragraph',
      text:
        'Sembilan adalah angka terakhir sebelum hitungan berulang, jadi dia angka ' +
        'yang paling sering dibaca sebagai penyelesaian. Dua kartu melipat kembali ke ' +
        'sini, dan yang paling dekat maknanya adalah The Moon di nomor delapan belas: ' +
        'kartu yang cahayanya bukan pilihannya, berdiri di depan kartu yang membawa ' +
        'lampunya sendiri.',
    },
    { kind: 'cardRef', slug: 'the-moon', text: 'Baca lore The Moon (XVIII)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya menyarankan satu jam tanpa siapa-siapa, dan ' +
        'satu jam biasanya cukup. Kartu ini tidak menuntut sebulan di gunung.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang sudah lewat dia sering berarti masa ' +
        'sepi yang ternyata berguna, walaupun waktu itu terasa seperti kehilangan ' +
        'waktu. Di posisi yang menanti di depan, dia menjadwalkan jeda, bukan ' +
        'meramalkan kesepian.',
    },
  ],

  questions: [
    {
      q: 'Kenapa The Hermit menjawab tidak?',
      a:
        'Karena dia kartu penundaan, dan tidak di sini berarti belum. Sosok tua yang ' +
        'membawa lampu terlihat seperti restu, dan justru itu sebabnya jawabannya ' +
        'sering dibaca terbalik.',
    },
    {
      q: 'Berapa lama saya harus menarik diri?',
      a:
        'Sampai kamu bisa menyebutkan tanggal turunnya. Kartu ini terbalik begitu ' +
        'jaraknya kehilangan tanggal berakhir, jadi tanggal itu yang membedakan dua ' +
        'bacaannya.',
    },
    {
      q: 'The Hermit berarti saya akan sendirian?',
      a:
        'Tidak. Dia kartu jarak yang dipilih, bukan kartu ditinggalkan. Kalau ' +
        'kesendiriannya bukan pilihanmu, biasanya yang keluar kartu lain.',
    },
    {
      q: 'Bedanya The Hermit dan The High Priestess apa?',
      a:
        'The High Priestess menyimpan sesuatu yang sudah dia tahu. The Hermit belum ' +
        'tahu apa-apa dan sedang naik ke tempat yang cukup sepi untuk mencari tahu.',
    },
  ],
};

export default theHermitId;
