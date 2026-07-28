import type { LoreDoc } from '@/content/types';

/**
 * Death (XIII), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * **THE HIGHEST-RISK DOCUMENT IN THE RELEASE, AND THE LINT DOES NOT COVER IT.**
 * `THERAPY_ID` and `THERAPY_EN` do not contain `death`, `mati` or `meninggal`, so
 * nothing mechanical stops this page from reading as a prediction about a real
 * person. The rule is the honest line rather than a word list:
 *
 *   - **Write about endings that have ALREADY HAPPENED.** The card reports, it
 *     does not forecast a bereavement, and the reader on the other side of this
 *     page may have had one this week.
 *   - No diagnosis, no prognosis, no illness, no timing of anybody's end.
 *   - The entertainment-only disclaimer renders under this prose (§8.3) and is
 *     load-bearing here in a way it is not on the other twenty-one.
 *
 * Research, confirmed before writing:
 *   - Scorpio, fixed water; Hebrew letter Nun (the fish); Golden Dawn title "Child
 *     of the Great Transformers, the Lord of the Gate of Death".
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Marseille decks leave the thirteenth trump UNNAMED -- the card carries a
 *     number and no title. Told from the English side of this pair.
 *   - Our painting (`public/cards/13_death.webp`): a skeletal armoured rider with
 *     a scythe crosses a battlefield on a pale horse; the ground is churned mud,
 *     shields and skulls; tattered banners lean in the distance; the sun is low
 *     and the field is already over.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout.
 *
 * **AND ONE NEAR-MISS WORTH RECORDING, BECAUSE IT IS THE `sobat`/`obat` SHAPE
 * AGAIN.** The first draft of the first Q&A sent a health question to `dokter`,
 * which is the correct and safe thing to say -- and `dokter` is on `THERAPY_ID`,
 * so the lint refused it. The list is not wrong: it exists so no reader-facing
 * copy sounds medical, and "ask a doctor" is medical vocabulary whichever
 * direction it points. Reworded to `layanan kesehatan` rather than exempted,
 * because an exemption on this list would be the first one and this is the last
 * page in the release that should carry it. (`kesehatan mental` is the banned
 * PHRASE; `layanan kesehatan` does not match it.) The English half says `doctor`
 * and passes, because `THERAPY_EN` has no such entry -- the two lists are
 * different scopes, not translations of each other.
 *
 * **ENGINE: POLARITY `shadow` UPRIGHT AND `light` REVERSED; yesno `no` -> `yes`.**
 * Root card: `reduce(13)` is 4, The Emperor.
 */
export const deathId: LoreDoc = {
  slug: 'death',
  locale: 'id',
  cardId: 13,
  anchor: 'sign',

  title: 'Arti Kartu Death (XIII) — Tarot Major Arcana',
  description:
    'Death (XIII) adalah akhir yang justru membebaskan. Arti tegak, terbalik, ' +
    'lambang Scorpio di baliknya, dan kenapa kartu ini melaporkan, bukan meramal.',
  h1: 'Arti Kartu Death (XIII)',
  standfirst:
    'Kartu ketiga belas Major Arcana. Kartu ini melaporkan sesuatu yang sudah ' +
    'selesai, dan hampir tidak pernah bicara tentang kematian siapa pun.',
  imageAlt:
    'Penunggang bertulang belulang berbaju zirah membawa sabit melintasi medan ' +
    'yang sudah usai di atas seekor kuda pucat; di tanah berlumpur ada perisai dan ' +
    'tengkorak, dan panji-panji robek condong di kejauhan.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Sebelum apa pun: kartu ini hampir tidak pernah bicara tentang seseorang ' +
        'yang meninggal. Dia bicara tentang sesuatu yang sudah selesai dan belum ' +
        'diumumkan selesai, dan itu dua hal yang sangat berbeda.',
    },
    {
      kind: 'paragraph',
      text:
        'Tegak, dia melaporkan bahwa penutupan itu sudah terjadi. Bukan akan ' +
        'terjadi. Pekerjaan itu, hubungan itu, versi dirimu yang itu — sudah ' +
        'berhenti beberapa waktu lalu, dan yang masih berjalan sejak itu adalah ' +
        'kebiasaannya.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang dia bebaskan bukan perasaanmu. Yang dia bebaskan adalah tenaga yang ' +
        'selama ini dipakai untuk memelihara sesuatu yang tidak berjalan lagi. Itu ' +
        'jumlah yang biasanya jauh lebih besar dari yang diperkirakan, dan biasanya ' +
        'baru terasa seminggu setelah pengakuannya.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, muatannya jadi terang — kartu ini bayangan waktu tegak dan terang ' +
        'waktu dibalik. Yang dia tunjuk adalah menggenggam sesuatu yang sebenarnya ' +
        'sudah selesai, dan menggenggam itu memakai tenaga yang nyata setiap hari.',
    },
    {
      kind: 'paragraph',
      text:
        'Bentuknya jarang seperti penyangkalan. Lebih sering dia terlihat seperti ' +
        'kesetiaan: nomor yang tidak dihapus, jadwal yang tidak diubah, satu ruangan ' +
        'yang dibiarkan seperti dulu. Tidak ada satu pun dari itu yang salah, dan ' +
        'semuanya ada ongkosnya.',
    },
    {
      kind: 'paragraph',
      text:
        'Jawabannya membalik jadi ya, dan yang dijawab ya bukan akhirnya. Yang ' +
        'dijawab ya adalah hal berikutnya — yang selama ini kamu tunda karena ' +
        'melakukannya terasa seperti mengakui bahwa yang tadi memang sudah lewat.',
    },
  ],

  yesno: {
    upright: 'no',
    reversed: 'yes',
    note:
      'Tegak, tidak: yang kamu tanyakan bersandar pada sesuatu yang sudah tidak ' +
      'berdiri lagi. Terbalik membalik jadi ya — bukan ya untuk yang lama, tapi ' +
      'untuk hal berikutnya yang kamu tunda karena memulainya terasa seperti ' +
      'mengakui.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Scorpio, air yang tetap' },
    {
      kind: 'paragraph',
      text:
        'Lambangnya Scorpio: air, dan tetap. Air yang tetap adalah air yang tidak ' +
        'mengalir ke mana-mana — dia mendalam, bukan bergerak. Dari dua belas ' +
        'gabungan, ini yang paling tidak mudah dibujuk.',
    },
    {
      kind: 'paragraph',
      text:
        'Itu sebabnya kartu ini tidak bisa ditawar. Kartu-kartu lain menawarkan ' +
        'pilihan; yang ini melaporkan keadaan, dan keadaan yang dilaporkannya sudah ' +
        'terjadi sebelum kartunya dibalik.',
    },

    { kind: 'heading', level: 2, text: 'Nun, ikan' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Nun, yang berarti ikan. Ikan adalah hewan yang hidup di tempat ' +
        'yang tidak bisa dilihat dari permukaan, dan yang muncul tanpa memberi ' +
        'peringatan. Dalam beberapa tradisi Nun juga dikaitkan dengan pertumbuhan ' +
        'yang berlangsung di bawah.',
    },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn menyebutnya Child of the Great Transformers, Lord of the Gate ' +
        'of Death. Perhatikan kata gerbang: sebuah gerbang adalah tempat lewat, ' +
        'bukan tempat berhenti.',
    },

    { kind: 'heading', level: 2, text: 'Medan yang sudah usai' },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami penunggangnya bertulang belulang, berbaju zirah, dan membawa ' +
        'sabit. Kudanya pucat. Sejauh itu, kartunya mengikuti gambar yang sudah ' +
        'dikenal orang selama ratusan tahun.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang berbeda adalah medannya. Dia tidak sedang menyerang siapa-siapa. Yang ' +
        'ada di tanah sudah ada di tanah sebelum dia lewat: perisai, tengkorak, ' +
        'lumpur, panji-panji yang sudah robek dan condong. Pertempurannya sudah ' +
        'selesai, dan dia datang setelahnya.',
    },
    {
      kind: 'paragraph',
      text:
        'Itu perbedaan yang menentukan seluruh bacaan kartunya. Sosok ini bukan ' +
        'sebab. Dia yang lewat dan mencatat, dan matahari di belakangnya sudah rendah.',
    },

    { kind: 'heading', level: 2, text: 'Tiga belas, dan akarnya' },
    {
      kind: 'paragraph',
      text:
        'Tiga belas dilipat menjadi empat, dan empat adalah The Emperor. Pasangan ' +
        'itu tidak nyaman dan tepat: kartu yang memasang batas berdiri di belakang ' +
        'kartu yang menutup sesuatu, karena sebuah akhir adalah batas yang paling ' +
        'tidak bisa dinegosiasikan.',
    },
    { kind: 'cardRef', slug: 'the-emperor', text: 'Baca lore The Emperor (IV)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya menunjuk pada satu hal kecil yang pantas ' +
        'diakhiri hari ini dan sudah lama diperpanjang tanpa alasan: satu langganan, ' +
        'satu kebiasaan, satu percakapan yang sudah selesai isinya.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang sudah lewat dia hampir selalu benar dan ' +
        'sering melegakan. Di posisi yang menanti di depan, dia bukan ramalan ' +
        'kehilangan — dia menandai satu penutupan yang tinggal diucapkan.',
    },
  ],

  questions: [
    {
      q: 'Death berarti ada yang akan meninggal?',
      a:
        'Hampir tidak pernah, dan halaman ini tidak akan pernah membacanya begitu. ' +
        'Kartu ini melaporkan sesuatu yang sudah selesai dan belum diakui selesai. ' +
        'Untuk pertanyaan tentang kesehatan atau keselamatan siapa pun, jawabannya ' +
        'ada di layanan kesehatan dan bukan di kartu.',
    },
    {
      q: 'Kalau saya baru saja kehilangan seseorang?',
      a:
        'Maka kartu ini tidak sedang memberi tahu kamu sesuatu yang belum kamu tahu. ' +
        'Bacaan yang berguna di keadaan itu biasanya bukan tentang akhirnya, ' +
        'melainkan tentang apa yang masih kamu jalankan seperti dulu.',
    },
    {
      q: 'Bedanya Death dan The Tower apa?',
      a:
        'The Tower adalah keruntuhan yang terjadi sekarang, keras dan kelihatan. ' +
        'Death adalah sesuatu yang sudah berhenti beberapa waktu lalu dan baru ' +
        'sekarang disebut namanya.',
    },
    {
      q: 'Kenapa terbalik justru menjawab ya?',
      a:
        'Karena terbaliknya menunjuk pada genggaman, bukan pada akhirnya. Ya di situ ' +
        'adalah ya untuk hal berikutnya, yang selama ini ditunda karena memulainya ' +
        'terasa seperti mengakui bahwa yang tadi sudah lewat.',
    },
  ],
};

export default deathId;
