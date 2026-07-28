import type { LoreDoc } from '@/content/types';

/**
 * The Fool (0), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Hebrew letter Aleph, Golden Dawn title "Spirit of Aether", and the
 *     attribution is the ELEMENT Air rather than a planet -- Uranus is a modern
 *     addition the sources themselves flag as outside the original system, which
 *     is why `cards.json` carries the aether mark and not a planet glyph.
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: a youth at a precipice with a white dog, a knapsack on a staff,
 *     a white rose, the sun behind.
 *   - Our painting, looked at directly (`public/cards/00_fool.webp`): the figure is
 *     RAGGED and barefoot, mid-stride with one foot already past the edge; the dog
 *     is small and pale and is barking rather than playing; the slope below is a
 *     scree of SKULLS AND BONES with a red trail running down it; the sky is storm
 *     and the far peaks are black.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS
 * LANGUAGE. Card names and `Major Arcana` stay English.
 *
 * ENGINE: yesno `yes` upright, `no` reversed. Polarity `light` -> `shadow`.
 * NO ROOT CARD -- `reduce(0)` is 0 and zero is not a numerological quality, so
 * there is no "folds to" paragraph and inventing one would be filler.
 */
export const theFoolId: LoreDoc = {
  slug: 'the-fool',
  locale: 'id',
  cardId: 0,
  anchor: 'element',

  title: 'Arti Kartu The Fool (0) — Tarot Major Arcana',
  description:
    'The Fool (0) adalah langkah pertama yang diambil karena percaya, bukan karena ' +
    'yakin. Arti tegak, terbalik, dan kenapa kartu ini satu-satunya tanpa planet.',
  h1: 'Arti Kartu The Fool (0)',
  standfirst:
    'Kartu bernomor nol. Bukan kartu kebodohan — kartu keberangkatan yang diambil ' +
    'sebelum semua syaratnya sempat dilengkapi.',
  imageAlt:
    'Sesosok bertelanjang kaki melangkah melewati bibir jurang dengan satu kaki ' +
    'sudah menggantung di udara; seekor anjing pucat menyalak di sampingnya, dan ' +
    'lereng di bawahnya tertutup tulang dan tengkorak sampai ke dasar.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Fool bukan kartu orang yang tidak tahu apa-apa. Dia kartu orang ' +
        'yang tahu cukup banyak dan tetap berangkat. Bedanya tipis dan penting: ' +
        'yang pertama tidak melihat jurangnya, yang kedua melihat dan menghitung ' +
        'bahwa menunggu lebih mahal.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang dia tawarkan bukan jaminan, tapi izin. Izin untuk memulai dengan ' +
        'perlengkapan yang belum lengkap, karena sebagian perlengkapan itu memang ' +
        'baru bisa dikumpulkan di jalan. Rencana yang menunggu semua kolomnya terisi ' +
        'biasanya tidak pernah berangkat.',
    },
    {
      kind: 'paragraph',
      text:
        'Dan dia menagih sesuatu. Kalau kamu berangkat begini, kamu kehilangan hak ' +
        'untuk kaget waktu ada yang salah. Itu harga yang jujur, dan orang yang ' +
        'membayarnya di depan biasanya bertahan lebih lama daripada orang yang ' +
        'mengira dirinya sudah siap.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, langkahnya tetap diambil tapi alasannya berubah. Bukan lagi ' +
        'berangkat karena percaya; berangkat karena bosan menunggu, dan dua hal itu ' +
        'terlihat sama persis dari luar.',
    },
    {
      kind: 'paragraph',
      text:
        'Pertanyaan pemeriksanya satu: kalau semuanya berjalan lancar, apa yang kamu ' +
        'dapat? Kalau jawabannya jelas, ini keberangkatan. Kalau jawabannya cuma ' +
        '"setidaknya bukan yang sekarang", ini pelarian yang sedang memakai baju ' +
        'keberanian.',
    },
    {
      kind: 'paragraph',
      text:
        'Terbalik juga membalik jawabannya jadi tidak. Bukan karena rencanamu buruk, ' +
        'tapi karena kartu ini terbalik biasanya keluar saat dorongannya datang dari ' +
        'apa yang mau kamu tinggalkan, bukan dari apa yang mau kamu tuju.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Tegak, ya — dan ya yang paling awal dari semua kartu: berangkatlah, ' +
      'perlengkapannya menyusul. Terbalik jadi tidak, karena yang mendorong bukan ' +
      'tujuannya melainkan keadaan yang mau kamu tinggalkan, dan itu bukan arah.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Satu-satunya yang bukan planet' },
    {
      kind: 'paragraph',
      text:
        'Dua puluh satu kartu Major Arcana lainnya dipasangkan dengan sebuah planet ' +
        'atau sebuah lambang zodiak. Yang ini tidak. Yang dipasangkan padanya adalah ' +
        'unsur itu sendiri: udara, eter, yang tidak punya bentuk dan ada di ' +
        'mana-mana. Golden Dawn menyebutnya Spirit of Aether.',
    },
    {
      kind: 'paragraph',
      text:
        'Kelihatannya seperti kekurangan data, dan sebetulnya itu justru ' +
        'keterangannya. Sebuah planet menempatkan kartu pada satu tempat di langit. ' +
        'Kartu ini tidak ditempatkan di mana-mana karena belum berada di mana-mana; ' +
        'dia keadaan sebelum penempatan.',
    },

    { kind: 'heading', level: 2, text: 'Aleph, dan angka yang bukan angka' },
    {
      kind: 'paragraph',
      text:
        'Huruf yang dipasangkan padanya adalah Aleph, huruf pertama, yang secara ' +
        'tradisi tidak berbunyi sendiri — dia hanya membuka jalan bagi bunyi ' +
        'berikutnya. Nomornya nol, dan nol bukan kuantitas. Dia posisi sebelum ' +
        'hitungan dimulai, dan itulah kenapa kartu ini kadang ditaruh di depan ' +
        'tumpukan dan kadang di belakang.',
    },

    { kind: 'heading', level: 2, text: 'Yang ada di gambar' },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami sosoknya compang-camping dan tidak beralas kaki, dan satu ' +
        'kakinya sudah lewat dari bibir tebing. Tidak ada matahari di belakangnya. ' +
        'Yang ada langit badai dan puncak-puncak hitam di kejauhan.',
    },
    {
      kind: 'paragraph',
      text:
        'Anjing di sisinya kecil dan pucat, dan dia menyalak. Di kartu-kartu yang ' +
        'lebih ramah, hewan itu melompat-lompat girang. Di sini dia jelas sedang ' +
        'memperingatkan, dan sosok itu tetap melangkah. Itu keseluruhan kartunya ' +
        'dalam satu gambar.',
    },
    {
      kind: 'paragraph',
      text:
        'Dan lereng di bawahnya bukan rumput. Dia tulang, bertumpuk sampai ke dasar, ' +
        'dengan satu jejak merah menurun di tengahnya. Orang lain sudah pernah ' +
        'melangkah dari sini. Kartu ini tidak menyembunyikannya darimu.',
    },

    { kind: 'heading', level: 2, text: 'Nol dan dua puluh satu' },
    {
      kind: 'paragraph',
      text:
        'Karena nol bukan kuantitas, kartu ini tidak melipat ke kartu mana pun — ' +
        'satu-satunya dari dua puluh dua yang tidak punya akar angka. Pasangannya ' +
        'ada di ujung yang lain: The World, nomor dua puluh satu, lingkaran yang ' +
        'akhirnya tertutup. Yang satu belum berangkat, yang satu sudah pulang.',
    },
    { kind: 'cardRef', slug: 'the-magician', text: 'Kartu berikutnya: The Magician (I)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, The Fool jarang berarti hari yang ringan. Lebih sering dia ' +
        'menandai hari di mana sesuatu dimulai tanpa upacara: satu pesan yang dikirim, ' +
        'satu formulir yang diisi, satu percakapan yang akhirnya dibuka.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, dia paling tajam di posisi yang menanti di depan — ' +
        'karena di situ dia bukan ramalan, tapi tawaran. Di posisi yang sudah lewat, ' +
        'dia menunjuk keputusan yang dulu diambil tanpa jaminan, dan biasanya kamu ' +
        'sudah tahu keputusan yang mana.',
    },
  ],

  questions: [
    {
      q: 'The Fool artinya saya ceroboh?',
      a:
        'Tidak. Kartu ini membedakan berangkat tanpa jaminan dari berangkat tanpa ' +
        'melihat, dan hanya yang kedua yang ceroboh. Anjing di gambarnya menyalak; ' +
        'kartu ini tahu ada peringatan dan tetap melangkah.',
    },
    {
      q: 'Kenapa nomornya nol dan bukan satu?',
      a:
        'Karena nol bukan urutan, dia posisi sebelum hitungan dimulai. Itu sebabnya ' +
        'kartu ini kadang diletakkan paling depan dan kadang paling belakang, dan ' +
        'keduanya bisa dipertahankan.',
    },
    {
      q: 'Kalau The Fool keluar untuk pertanyaan pekerjaan, artinya saya harus pindah?',
      a:
        'Belum tentu. Dia bilang langkahnya bisa diambil sebelum semua syaratnya ' +
        'lengkap, bukan bahwa langkah itu harus diambil sekarang. Pertanyaan yang ' +
        'lebih berguna: apa yang paling mahal, mencoba atau menunggu setahun lagi?',
    },
    {
      q: 'Bedanya The Fool dan The Magician apa?',
      a:
        'The Fool belum punya apa-apa di tangannya dan berangkat. The Magician sudah ' +
        'punya alatnya di meja dan tinggal memilih mau diarahkan ke mana.',
    },
  ],
};

export default theFoolId;
