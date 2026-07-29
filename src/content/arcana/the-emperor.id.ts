import type { LoreDoc } from '@/content/types';

/**
 * The Emperor (IV), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Aries, cardinal fire; Hebrew letter Heh (the window); Golden Dawn title
 *     "Sun of the Morning, Chief among the Mighty".
 *     https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: a bearded king on a stone throne carved with ram heads, an ankh
 *     sceptre, a barren mountain range behind.
 *   - Our painting (`public/cards/04_emperor.webp`): armoured and crowned, seated
 *     on a throne whose back is a crown of iron SPIKES; two RAM SKULLS on the arm
 *     rests; the throne stands at the top of a flight of stone steps and blood is
 *     running DOWN the steps; another skull at the foot of them.
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS.
 *
 * **ENGINE: POLARITY IS `neutral` AND DOES NOT FLIP.** The reversed section must
 * not lean on a change of charge that did not happen. yesno `yes` -> `no`.
 * Element `fire` -- and `SIGNS.aries.element` is `fire`, which `correspondence
 * .test.ts` asserts card by card for all twelve sign cards.
 */
export const theEmperorId: LoreDoc = {
  slug: 'the-emperor',
  locale: 'id',
  cardId: 4,
  anchor: 'sign',

  title: 'Arti Kartu The Emperor (IV) — Tarot Major Arcana',
  description:
    'The Emperor (IV) adalah struktur yang membuat pijakanmu lebih tenang. Arti ' +
    'tegak, terbalik, dan lambang Aries yang berdiri di balik kartu netral ini.',
  h1: 'Arti Kartu The Emperor (IV)',
  standfirst:
    'Kartu keempat Major Arcana. Bukan kartu kekuasaan — kartu batas, dan batas ' +
    'adalah satu-satunya hal yang membuat sesuatu bisa berdiri.',
  imageAlt:
    'Sosok berbaju zirah dan bermahkota duduk di singgasana yang sandarannya ' +
    'berupa mahkota paku besi, dengan dua tengkorak domba jantan di kedua lengan ' +
    'kursi; darah mengalir turun menyusuri anak tangga batu di bawahnya.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Emperor bukan kartu orang yang memerintah. Dia kartu pagar. ' +
        'Sesuatu di hidupmu berdiri lebih tenang minggu ini karena ada batas yang ' +
        'sudah dipasang dan tidak digeser-geser lagi.',
    },
    {
      kind: 'paragraph',
      text:
        'Batas itu jarang menyenangkan waktu dipasang. Yang membuatnya berguna justru ' +
        'sifatnya yang membosankan: dia berlaku hari Senin dan hari Jumat, waktu kamu ' +
        'sedang bersemangat dan waktu kamu sedang tidak, dan itulah yang membuat orang ' +
        'lain bisa memperhitungkanmu.',
    },
    {
      kind: 'paragraph',
      text:
        'Muatan kartu ini netral dan tetap netral. Dia tidak berpihak pada baik atau ' +
        'buruk, karena batas yang sama bisa melindungi dan bisa mengurung, dan yang ' +
        'menentukan bukan batasnya melainkan apa yang ada di dalamnya.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, muatannya tetap netral — jangan membaca ini sebagai versi yang ' +
        'lebih gelap. Yang berubah adalah apa yang dikira sebagai kekuatan. Kendali ' +
        'yang dipegang makin erat biasanya bukan tanda kuat; dia tanda takut ' +
        'kehilangan.',
    },
    {
      kind: 'paragraph',
      text:
        'Cara memeriksanya bisa dilihat dari luar: aturan yang sehat menjelaskan ' +
        'dirinya sendiri dan tetap berlaku waktu yang membuatnya sedang tidak ada. ' +
        'Aturan yang cuma kendali berhenti berlaku begitu orangnya keluar ruangan.',
    },
    {
      kind: 'paragraph',
      text:
        'Jawabannya membalik jadi tidak, dan biasanya bukan karena rencananya salah. ' +
        'Karena kartu ini terbalik keluar waktu yang kamu tambahkan adalah lapisan ' +
        'aturan lagi pada sesuatu yang sebenarnya kekurangan kepercayaan, bukan ' +
        'kekurangan struktur.',
    },
  ],

  yesno: {
    upright: 'yes',
    reversed: 'no',
    note:
      'Tegak, ya — dan ya yang khas kartu ini: ya kalau kamu bersedia menuliskan ' +
      'batasnya, bukan cuma menyetujuinya. Terbalik jadi tidak, karena yang kurang ' +
      'bukan aturan lagi melainkan kepercayaan yang tidak bisa diatur.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Aries, api yang kardinal' },
    {
      kind: 'paragraph',
      text:
        'Lambangnya Aries: api, dan kardinal. Kardinal artinya memulai — tanda-tanda ' +
        'kardinal adalah yang membuka musim. Jadi kartu ini bukan kartu orang yang ' +
        'menjaga sesuatu yang sudah lama berdiri; dia kartu orang yang memasang ' +
        'tiangnya untuk pertama kali.',
    },
    {
      kind: 'paragraph',
      text:
        'Api di bawah lambang yang netral juga menjelaskan kenapa kartu ini sering ' +
        'terasa keras. Api tidak bertanya. Yang membuatnya tidak menghanguskan bukan ' +
        'kelembutannya, melainkan bentuk yang dipasang di sekelilingnya.',
    },

    { kind: 'heading', level: 2, text: 'Heh, jendela' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Heh, yang berarti jendela. Jendela adalah lubang yang dibuat pada ' +
        'dinding dengan sengaja, dan yang membuatnya jendela dan bukan kerusakan ' +
        'adalah bahwa dindingnya tetap berdiri. Itu kartunya, dalam satu kata.',
    },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn menyebutnya Sun of the Morning, Chief among the Mighty. ' +
        'Matahari pagi, bukan matahari tengah hari — permulaan hari, bukan puncaknya.',
    },

    { kind: 'heading', level: 2, text: 'Paku, tengkorak domba, dan anak tangga' },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami sandaran singgasananya adalah mahkota paku besi yang ' +
        'menghadap ke luar. Dari depan dia terlihat seperti pancaran cahaya. Dari ' +
        'samping dia pagar berduri.',
    },
    {
      kind: 'paragraph',
      text:
        'Dua tengkorak domba jantan duduk di lengan kursi. Domba jantan adalah hewan ' +
        'Aries, dan di sini yang tersisa dari hewan itu tinggal tulangnya. Kartu ' +
        'tentang batas ini memasang sisa-sisa dorongan yang dulu tidak berbatas di ' +
        'tempat tangannya bersandar.',
    },
    {
      kind: 'paragraph',
      text:
        'Dan singgasananya ada di puncak anak tangga, dengan darah mengalir turun ' +
        'melewatinya. Ketinggian adalah bagian dari jabatannya. Yang di bawah ' +
        'menerima akibatnya lebih dulu, dan kartu ini tidak berpura-pura sebaliknya.',
    },

    { kind: 'heading', level: 2, text: 'Angka empat' },
    {
      kind: 'paragraph',
      text:
        'Empat adalah jumlah sudut yang paling sedikit untuk membuat sebuah ruangan. ' +
        'Tiga masih bisa berdiri sendiri tanpa dinding; empat sudah menutup. Dari ' +
        'sinilah semua kartu berikutnya punya tempat untuk terjadi.',
    },
    { kind: 'cardRef', slug: 'the-empress', text: 'Baca lore The Empress (III)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia biasanya menunjuk pada satu hal yang perlu dituliskan ' +
        'hari ini supaya berhenti dibicarakan ulang: satu batas, satu jadwal, satu ' +
        'angka yang disepakati.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang sudah lewat dia sering berarti aturan ' +
        'yang diwariskan padamu dan belum pernah kamu periksa. Di posisi yang menanti ' +
        'di depan, dia menawarkan struktur, dan menawarkan bukan memaksakan.',
    },
  ],

  questions: [
    {
      q: 'The Emperor berarti ada laki-laki berkuasa dalam hidup saya?',
      a:
        'Kadang, tapi jarang itu bacaan yang paling berguna. Lebih sering dia ' +
        'menunjuk pada struktur itu sendiri — aturan, jadwal, batas — dan struktur ' +
        'tidak punya jenis kelamin.',
    },
    {
      q: 'Kenapa muatannya netral padahal kartunya terasa keras?',
      a:
        'Karena batas yang sama bisa melindungi dan bisa mengurung. Kartu ini ' +
        'menyediakan bentuk; yang menentukan bacaannya adalah apa yang ada di dalam ' +
        'bentuk itu, dan itu bukan urusan kartunya.',
    },
    {
      q: 'Terbalik, apakah artinya saya harus melepas semua aturan?',
      a:
        'Bukan. Terbalik dia menunjuk pada aturan yang berhenti berlaku begitu ' +
        'pembuatnya keluar ruangan. Yang perlu dilepas cuma yang tidak bisa ' +
        'menjelaskan dirinya sendiri.',
    },
    {
      q: 'Bedanya The Emperor dan The Hierophant apa?',
      a:
        'The Emperor memasang aturan yang baru dan bisa dia ubah. The Hierophant ' +
        'meneruskan aturan yang sudah ada sebelum dia dan tidak bisa dia ubah ' +
        'sendirian.',
    },
  ],
};

export default theEmperorId;
