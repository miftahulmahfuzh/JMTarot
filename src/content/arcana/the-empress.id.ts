import type { LoreDoc } from '@/content/types';

/**
 * The Empress (III), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Venus; Hebrew letter Daleth (the door); Golden Dawn title "Daughter of the
 *     Mighty Ones". https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: a crowned figure on cushions in a field of ripe wheat, a stream
 *     and trees behind her, the shield of Venus at her side.
 *   - Our painting (`public/cards/03_empress.webp`): she is VEILED and visibly
 *     pregnant, seated on a stone throne carved with skulls, one hand resting on
 *     her belly. The garden around her is DEAD THORN, crows sit in the branches,
 *     and the ground at her feet is scattered with skulls and dark earth.
 *
 * **THE ENGLISH DOCUMENT MAY NOT USE THE WORD `abundance`** -- it is on `EN_TICS`
 * and it is also this card's own English keyword in `cards.json`. The lint scans
 * `src/content/**` only, so the chip on the page is unaffected and the lore has to
 * say what abundance IS instead of naming it. That is a feature: it forces the
 * concrete register this content is supposed to be in.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS
 * LANGUAGE -- `merawat` is care and is fine; `menyembuhkan` is not.
 *
 * ENGINE: yesno `yes` -> `no`. Polarity `light` -> `shadow`. Stage `beginning`.
 */
export const theEmpressId: LoreDoc = {
  slug: 'the-empress',
  locale: 'id',
  cardId: 3,
  anchor: 'sign',

  title: 'Arti Kartu The Empress (III) — Tarot Major Arcana',
  description:
    'The Empress (III) adalah sesuatu yang tumbuh karena benar-benar dirawat. Arti ' +
    'tegak, terbalik, dan lambang Venus serta unsur tanah di baliknya.',
  h1: 'Arti Kartu The Empress (III)',
  standfirst:
    'Kartu ketiga Major Arcana. Bukan kartu kemewahan — kartu hitung-hitungan ' +
    'merawat, dan harga yang dibayar orang yang merawat.',
  imageAlt:
    'Sesosok berkerudung yang sedang mengandung duduk di singgasana batu berukir ' +
    'tengkorak, satu tangan di perutnya; di sekelilingnya semak duri yang sudah ' +
    'mati, gagak di dahan, dan tengkorak berserakan di tanah.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Empress bicara soal sesuatu yang tumbuh, dan bagian yang sering ' +
        'dilewatkan adalah kenapa dia tumbuh: karena ada yang memberinya makan tiap ' +
        'hari, tanpa jeda, dan biasanya tanpa disebut namanya.',
    },
    {
      kind: 'paragraph',
      text:
        'Itu berlaku untuk anak, untuk usaha, untuk hubungan, dan untuk keahlian. ' +
        'Semuanya patuh pada aturan yang sama dan aturannya membosankan: yang ' +
        'diberi makan tumbuh, yang tidak tidak, dan tidak ada jalan pintas yang ' +
        'pernah bekerja lebih dari satu musim.',
    },
    {
      kind: 'paragraph',
      text:
        'Jadi kalau kartu ini keluar tegak, biasanya dia bukan kabar baik yang ' +
        'datang dari luar. Dia pengakuan atas sesuatu yang sudah kamu kerjakan diam- ' +
        'diam cukup lama, dan sekarang mulai kelihatan hasilnya dari luar.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, aturannya masih sama dan yang berubah adalah siapa yang membayar. ' +
        'Merawat sampai melewati batas dirimu sendiri bukan versi merawat yang lebih ' +
        'baik; itu memindahkan kekurangan dari satu tempat ke tempat lain.',
    },
    {
      kind: 'paragraph',
      text:
        'Bentuknya jarang dramatis. Lebih sering dia terlihat seperti orang yang ' +
        'selalu bisa diandalkan dan tidak pernah bisa dimintai apa-apa untuk dirinya, ' +
        'karena permintaan itu sudah lama tidak punya tempat di jadwalnya.',
    },
    {
      kind: 'paragraph',
      text:
        'Dan jawabannya membalik jadi tidak. Bukan karena yang kamu rawat tidak ' +
        'layak, tapi karena kartu ini terbalik keluar waktu penambahan satu beban ' +
        'lagi akan diambil dari tempat yang sudah kosong.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Tegak, ya, dengan syarat yang tidak menarik: ya kalau kamu memang sanggup ' +
      'memberinya makan setiap hari untuk waktu yang lama. Terbalik jadi tidak, ' +
      'karena tambahan itu akan diambil dari tempat yang sudah kosong.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Venus, dan tanah' },
    {
      kind: 'paragraph',
      text:
        'Planetnya Venus dan unsurnya tanah, dan pasangan itu menjelaskan kartunya ' +
        'lebih baik daripada kata mana pun. Venus sering dibaca sebagai keindahan; ' +
        'tanah menariknya turun jadi sesuatu yang jauh lebih tidak romantis. Tanah ' +
        'tidak mengagumi apa pun. Dia menampung, memberi makan, dan menagih waktu.',
    },
    {
      kind: 'paragraph',
      text:
        'Itu sebabnya kartu ini bukan kartu perasaan yang sedang tinggi. Dia kartu ' +
        'pekerjaan berulang yang tidak ada yang menonton, dan hasil yang baru ' +
        'kelihatan setelah beberapa musim.',
    },

    { kind: 'heading', level: 2, text: 'Daleth, pintu' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Daleth, yang berarti pintu. Sebuah pintu adalah tempat sesuatu ' +
        'masuk ke dunia, dan pintu juga satu-satunya bagian rumah yang harus bisa ' +
        'ditutup. Kedua sifat itu ada di kartu ini, dan yang kedua yang biasanya ' +
        'dilupakan orang.',
    },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn menyebutnya Daughter of the Mighty Ones — anak perempuan dari ' +
        'yang berkuasa. Bukan penguasa itu sendiri. Yang membuat sesuatu tumbuh ' +
        'jarang orang yang memutuskannya.',
    },

    { kind: 'heading', level: 2, text: 'Kebun yang sudah mati' },
    {
      kind: 'paragraph',
      text:
        'Di kartu yang lebih dikenal, dia duduk di ladang gandum yang matang dengan ' +
        'sungai di belakangnya. Di kartu kami kebunnya duri dan sudah mati, gagak ' +
        'duduk di dahannya, dan di tanah ada tengkorak.',
    },
    {
      kind: 'paragraph',
      text:
        'Perubahan itu bukan sinisme. Dia menempatkan kartunya pada satu musim ' +
        'tertentu: bukan musim panen, melainkan musim di mana yang tumbuh masih ' +
        'sepenuhnya bergantung pada orang yang memberinya makan, dan tidak ada apa ' +
        'pun di sekitarnya yang membantu.',
    },
    {
      kind: 'paragraph',
      text:
        'Singgasananya batu dan berukir tengkorak, dan tangannya ada di perutnya. ' +
        'Kartu ini tidak memisahkan yang lahir dari yang sudah mati; dia mendudukkan ' +
        'keduanya pada satu kursi.',
    },

    { kind: 'heading', level: 2, text: 'Angka tiga' },
    {
      kind: 'paragraph',
      text:
        'Tiga adalah angka pertama yang bisa membuat sesuatu yang baru: dua bisa ' +
        'berhadapan, tiga bisa menghasilkan. Dua kartu lain melipat kembali ke sini — ' +
        'The Hanged Man di nomor dua belas dan The World di nomor dua puluh satu — ' +
        'dan keduanya soal apa yang terjadi setelah sesuatu selesai tumbuh.',
    },
    { kind: 'cardRef', slug: 'the-world', text: 'Baca lore The World (XXI)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya menunjuk pada satu hal yang perlu diberi ' +
        'sedikit hari ini — bukan diselesaikan, cuma diberi. Kartu ini menghitung ' +
        'yang kecil dan berulang, bukan yang besar dan sekali.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang sudah lewat dia hampir selalu menunjuk ' +
        'pada orang lain yang merawatmu, bukan sebaliknya. Di posisi yang menanti di ' +
        'depan, dia soal berapa lama kamu sanggup, dan itu pertanyaan yang wajar ' +
        'untuk dijawab jujur.',
    },
  ],

  questions: [
    {
      q: 'The Empress selalu berarti kehamilan?',
      a:
        'Tidak. Dia berarti sesuatu yang tumbuh karena diberi makan terus-menerus, ' +
        'dan itu bisa usaha, hubungan, atau keahlian. Kehamilan adalah satu bacaan ' +
        'yang mungkin, bukan bacaan bawaannya.',
    },
    {
      q: 'Kalau The Empress keluar untuk pertanyaan uang?',
      a:
        'Biasanya artinya penambahannya lambat dan nyata, bukan cepat dan besar. ' +
        'Kartu ini menghitung musim, bukan kejadian, jadi jawabannya hampir selalu ' +
        'soal berapa lama, bukan berapa banyak.',
    },
    {
      q: 'Terbalik, apa dia berarti saya orang yang buruk?',
      a:
        'Tidak. Dia menunjuk pada penambahan beban yang akan diambil dari tempat ' +
        'yang sudah kosong. Itu keterangan tentang persediaan, bukan tentang niat, ' +
        'dan biasanya orang yang mendapat kartu ini justru terlalu banyak memberi.',
    },
    {
      q: 'Bedanya The Empress dan The Emperor apa?',
      a:
        'The Empress soal memberi makan sesuatu sampai dia tumbuh. The Emperor soal ' +
        'memberinya batas supaya dia tidak roboh. Keduanya diperlukan dan keduanya ' +
        'gagal kalau berdiri sendiri.',
    },
  ],
};

export default theEmpressId;
