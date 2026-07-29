import type { LoreDoc } from '@/content/types';

/**
 * The World (XXI), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Saturn; Hebrew letter Tau (the mark or cross); Golden Dawn title "The Great
 *     One of the Night of Time".
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: a dancing figure inside a laurel wreath, a wand in each hand,
 *     and the four living creatures of Ezekiel in the corners -- man, lion, ox,
 *     eagle.
 *   - Our painting (`public/cards/21_world.webp`): a pale figure floats with arms
 *     open inside an oval wreath of THORNS rather than laurel; at the four corners
 *     the living creatures are ANIMAL SKULLS -- horned ox, maned lion, ram, and a
 *     beaked bird; a dark globe hangs beneath her feet. She holds nothing.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS.
 *
 * ENGINE: yesno `yes` -> `no`; polarity `light` -> `shadow`; stage `reckoning`.
 * Root card: `reduce(21)` is 3, The Empress.
 */
export const theWorldId: LoreDoc = {
  slug: 'the-world',
  locale: 'id',
  cardId: 21,
  anchor: 'sign',

  title: 'Arti Kartu The World (XXI) — Tarot Major Arcana',
  description:
    'The World (XXI) adalah lingkaran yang akhirnya tertutup. Arti tegak, ' +
    'terbalik, dan lambang Saturnus serta unsur tanah yang berdiri di baliknya.',
  h1: 'Arti Kartu The World (XXI)',
  standfirst:
    'Kartu terakhir Major Arcana. Bukan kartu kemenangan — kartu penutupan, dan ' +
    'penutupan adalah hal yang paling jarang benar-benar diselesaikan orang.',
  imageAlt:
    'Sesosok pucat melayang dengan kedua tangan terbuka di dalam karangan duri ' +
    'berbentuk lonjong; di empat sudutnya ada tengkorak binatang — lembu, singa, ' +
    'domba jantan, dan seekor burung — dan sebuah bola gelap menggantung di bawah ' +
    'kakinya.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The World bicara soal penutupan, dan penutupan bukan hal yang sama ' +
        'dengan selesai. Banyak hal selesai. Yang jarang terjadi adalah ada yang ' +
        'mengucapkan bahwa hal itu selesai, dan sesudahnya tidak ada lagi yang ' +
        'menggantung.',
    },
    {
      kind: 'paragraph',
      text:
        'Kebanyakan hal di hidup orang tidak ditutup; mereka cuma berhenti diurus. ' +
        'Selisihnya kelihatan setahun kemudian, waktu yang tidak ditutup masih ' +
        'sesekali muncul dan meminta sedikit perhatian, dan yang ditutup tidak pernah ' +
        'muncul lagi sama sekali.',
    },
    {
      kind: 'paragraph',
      text:
        'Karena itu jawabannya ya, dan ya-nya untuk pekerjaan penutupan itu sendiri: ' +
        'satu percakapan terakhir, satu berkas yang diarsipkan, satu kalimat yang ' +
        'diucapkan supaya semua orang di ruangan tahu bahwa yang tadi memang sudah ' +
        'berakhir.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, akhir yang diumumkan terlalu cepat. Semua bentuknya sudah ada — ' +
        'perpisahannya, ucapan terima kasihnya, pindahannya — dan satu bagian di ' +
        'dalamnya masih berjalan.',
    },
    {
      kind: 'paragraph',
      text:
        'Bentuk yang paling sering adalah bagian yang tidak enak dibicarakan: satu ' +
        'utang kecil, satu janji yang tidak pernah dicabut, satu orang yang belum ' +
        'diberi tahu. Semua yang mudah sudah ditutup, dan yang tersisa persis yang ' +
        'membuat penutupannya belum berlaku.',
    },
    {
      kind: 'paragraph',
      text:
        'Jawabannya membalik jadi tidak, dan yang ditolak bukan akhirnya. Yang ' +
        'ditolak adalah menganggapnya sudah lewat, karena satu bagian yang masih ' +
        'terbuka cukup untuk membuat seluruhnya masih terbuka.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Tegak, ya, untuk pekerjaan penutupannya sendiri — bukan untuk sesuatu yang ' +
      'baru. Terbalik jadi tidak, karena satu bagian yang masih terbuka sudah cukup ' +
      'untuk membuat seluruhnya belum tertutup.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Saturnus, dan tanah' },
    {
      kind: 'paragraph',
      text:
        'Planetnya Saturnus dan unsurnya tanah. Saturnus adalah planet batas — dalam ' +
        'tabel lama dia yang paling jauh, jadi orbitnya adalah tepi dari segala ' +
        'sesuatu yang bisa dilihat.',
    },
    {
      kind: 'paragraph',
      text:
        'Menempatkan kartu terakhir di bawah planet terjauh adalah keputusan yang ' +
        'rapi. Yang menutup sebuah lingkaran memang batasnya, dan batas selalu ' +
        'terasa seperti kekurangan sampai kamu sadar bahwa tanpa batas tidak ada ' +
        'satu pun bentuk yang mungkin.',
    },

    { kind: 'heading', level: 2, text: 'Tau, tanda' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Tau, huruf terakhir dalam abjad Ibrani, yang berarti tanda atau ' +
        'silang. Tau adalah goresan yang dibuat untuk menandai bahwa sesuatu sudah ' +
        'dihitung.',
    },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn menyebutnya The Great One of the Night of Time. Malam dari ' +
        'waktu: bukan puncaknya siang, melainkan ujung sebuah hari yang panjang.',
    },

    { kind: 'heading', level: 2, text: 'Duri, dan empat tengkorak' },
    {
      kind: 'paragraph',
      text:
        'Di kartu yang lebih dikenal, sosoknya menari di dalam karangan daun salam, ' +
        'membawa satu tongkat di tiap tangan, dan di empat sudutnya ada empat ' +
        'makhluk hidup: manusia, singa, lembu, dan rajawali.',
    },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami karangannya duri, dan keempat makhluk itu tinggal tengkorak. ' +
        'Sosoknya tidak menari dan tidak memegang apa-apa; tangannya terbuka dan ' +
        'kosong, dan sebuah bola gelap menggantung di bawah kakinya.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang dilakukan perubahan itu bukan membuat kartunya suram. Dia membuat ' +
        'harganya kelihatan. Sebuah lingkaran yang benar-benar tertutup ditutup di ' +
        'atas sesuatu, dan yang di empat sudut itu adalah apa yang tidak ikut sampai ' +
        'ke ujung.',
    },

    { kind: 'heading', level: 2, text: 'Dua puluh satu, dan nol' },
    {
      kind: 'paragraph',
      text:
        'Dua puluh satu dilipat menjadi tiga, dan tiga adalah The Empress — kartu ' +
        'tentang sesuatu yang tumbuh karena dirawat, berdiri di belakang kartu ' +
        'tentang sesuatu yang selesai tumbuh. Dan di ujung yang lain ada The Fool, ' +
        'nomor nol, yang belum berangkat.',
    },
    { kind: 'cardRef', slug: 'the-fool', text: 'Baca lore The Fool (0)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya menunjuk pada satu hal yang tinggal ' +
        'diselesaikan sedikit lagi dan sudah lama berhenti di situ. Menutupnya hari ' +
        'ini biasanya memakan waktu jauh lebih sedikit daripada yang kamu kira.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang menanti di depan dia bukan janji ' +
        'keberhasilan — dia menandai bahwa sesuatu akan benar-benar berakhir. Di ' +
        'posisi yang sudah lewat, dia menunjuk pada penutupan yang mungkin belum ' +
        'kamu akui sebagai penutupan.',
    },
  ],

  questions: [
    {
      q: 'The World berarti saya berhasil?',
      a:
        'Dia berarti sesuatu tertutup. Itu sering bersamaan dengan berhasil dan ' +
        'tidak selalu — penutupan yang benar juga terjadi pada hal-hal yang tidak ' +
        'berjalan seperti yang diharapkan.',
    },
    {
      q: 'Kenapa empat makhluk di sudutnya jadi tengkorak?',
      a:
        'Supaya harganya kelihatan. Di kartu lama keempatnya hidup dan menyaksikan; ' +
        'di sini mereka yang tidak ikut sampai ke ujung, dan itu bagian dari apa yang ' +
        'membuat sebuah lingkaran benar-benar tertutup.',
    },
    {
      q: 'Kalau kartu ini keluar, apakah artinya sesuatu akan dimulai lagi?',
      a:
        'Biasanya belum. Kartu berikutnya adalah The Fool, dan di antara keduanya ' +
        'tidak ada apa-apa. Kartu ini soal menutup, dan yang memulai kartu yang lain.',
    },
    {
      q: 'Terbalik, bagaimana saya tahu bagian mana yang masih terbuka?',
      a:
        'Cari yang paling tidak enak dibicarakan. Semua yang mudah biasanya sudah ' +
        'ditutup, jadi yang tersisa hampir selalu satu percakapan yang ditunda dengan ' +
        'alasan yang masuk akal.',
    },
  ],
};

export default theWorldId;
