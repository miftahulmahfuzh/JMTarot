import type { LoreDoc } from '@/content/types';

/**
 * The Tower (XVI), Indonesian. THE SOURCE DOCUMENT OF THE PAIR.
 *
 * Research, confirmed before writing:
 *   - Mars; Hebrew letter Peh (the mouth); Golden Dawn title "Lord of the Hosts of
 *     the Mighty". https://angelorum.co/topics/divination/golden-dawn-astrologica/
 *   - Rider-Waite: a crown blown off a tower struck by lightning, two figures
 *     falling head first, twenty-two yods in the air.
 *   - Our painting (`public/cards/16_tower.webp`): the tower is split TOP TO
 *     BOTTOM by a single strike and the stone is bursting outward in a spray; two
 *     figures fall on either side; fire shows in the window slits; blood runs down
 *     the rubble at the base. **There is no crown.**
 *
 * MALAY CHECK: none of the eleven. `kamu` throughout. NO THERAPY OR DIAGNOSIS.
 *
 * **ENGINE: POLARITY `shadow` UPRIGHT AND `light` REVERSED; yesno `no` -> `yes`.**
 * Root card: `reduce(16)` is 7, The Chariot.
 */
export const theTowerId: LoreDoc = {
  slug: 'the-tower',
  locale: 'id',
  cardId: 16,
  anchor: 'sign',

  title: 'Arti Kartu The Tower (XVI) — Tarot Major Arcana',
  description:
    'The Tower (XVI) adalah keruntuhan yang memang perlu terjadi. Arti tegak, ' +
    'terbalik, dan lambang Mars serta unsur api yang berdiri di baliknya.',
  h1: 'Arti Kartu The Tower (XVI)',
  standfirst:
    'Kartu keenam belas Major Arcana. Bukan kartu bencana acak — kartu bangunan ' +
    'yang sudah lama retak dan akhirnya diperiksa oleh sesuatu yang tidak sabar.',
  imageAlt:
    'Sebuah menara batu terbelah dari atas ke bawah oleh satu sambaran petir, ' +
    'batunya berhamburan ke luar; dua sosok jatuh di kedua sisinya, api terlihat ' +
    'di celah jendela, dan darah mengalir turun di reruntuhan bawahnya.',

  upright: [
    {
      kind: 'paragraph',
      text:
        'Tegak, The Tower melaporkan bahwa sesuatu roboh, dan yang paling sering ' +
        'salah dibaca adalah waktunya. Petirnya kelihatan seperti sebab. Petir bukan ' +
        'sebab; dia yang terakhir datang.',
    },
    {
      kind: 'paragraph',
      text:
        'Yang roboh selalu sudah retak sebelumnya, dan retaknya biasanya sudah ' +
        'diketahui. Ada yang menyebutnya sekali, dua tahun lalu, dan tidak ada yang ' +
        'menindaklanjuti karena bangunannya masih berdiri dan masih dipakai setiap ' +
        'hari.',
    },
    {
      kind: 'paragraph',
      text:
        'Karena itu jawabannya tidak, dan penolakannya bukan pada rencanamu. Yang ' +
        'ditolak adalah membangun apa pun di atas bagian yang baru saja terbukti ' +
        'tidak menahan. Kartu ini tidak melarang membangun; dia melarang membangun ' +
        'di situ.',
    },
  ],

  reversed: [
    {
      kind: 'paragraph',
      text:
        'Terbalik, muatannya jadi terang — kartu ini bayangan waktu tegak. Yang dia ' +
        'tunjuk adalah peringatan yang terus dilewatkan, dan itu berarti robohnya ' +
        'belum terjadi.',
    },
    {
      kind: 'paragraph',
      text:
        'Bentuknya bukan kelalaian. Bentuknya adalah biaya kecil yang dibayar ' +
        'berulang supaya bangunannya tetap terlihat utuh: satu perbaikan darurat ' +
        'setiap beberapa bulan, satu penjelasan yang selalu sama, satu orang yang ' +
        'setiap kali menutup lubangnya sendirian.',
    },
    {
      kind: 'paragraph',
      text:
        'Dan jawabannya membalik jadi ya. Bukan ya untuk merobohkannya sendiri — ya ' +
        'untuk memeriksa retaknya sekarang, selagi pemeriksaan itu masih bisa ' +
        'dijadwalkan olehmu dan bukan oleh sesuatu yang lain.',
    },
  ],

  yesno: {
    upright: 'no',
    reversed: 'yes',
    note:
      'Tegak, tidak, dan yang ditolak adalah membangun di atas bagian yang baru ' +
      'saja terbukti tidak menahan. Terbalik membalik jadi ya — ya untuk memeriksa ' +
      'retaknya sekarang, selagi jadwalnya masih milikmu.',
  },

  lore: [
    { kind: 'heading', level: 2, text: 'Mars, dan api' },
    {
      kind: 'paragraph',
      text:
        'Planetnya Mars dan unsurnya api, dan itu satu-satunya kartu di tumpukan ini ' +
        'yang mendapat keduanya sekaligus tanpa perantara lambang zodiak. Mars tidak ' +
        'menunda apa pun. Yang dia lakukan adalah mempercepat hal yang memang sudah ' +
        'akan terjadi.',
    },
    {
      kind: 'paragraph',
      text:
        'Itu penting untuk membaca kartunya dengan benar. Mars tidak menciptakan ' +
        'retaknya. Dia cuma memastikan bahwa retak itu tidak bisa lagi diperpanjang ' +
        'masa berlakunya.',
    },

    { kind: 'heading', level: 2, text: 'Peh, mulut' },
    {
      kind: 'paragraph',
      text:
        'Hurufnya Peh, yang berarti mulut. Untuk kartu tentang bangunan yang roboh, ' +
        'itu pilihan yang mengejutkan dan sangat tepat: yang paling sering ' +
        'meruntuhkan sebuah bangunan bukan petir, melainkan seseorang yang akhirnya ' +
        'mengatakan hal yang sudah lama diketahui semua orang.',
    },
    {
      kind: 'paragraph',
      text:
        'Golden Dawn menyebutnya Lord of the Hosts of the Mighty. Hosts di situ ' +
        'berarti pasukan — bukan satu kekuatan, melainkan banyak sekaligus, yang ' +
        'kebetulan tiba pada hari yang sama.',
    },

    { kind: 'heading', level: 2, text: 'Tidak ada mahkota' },
    {
      kind: 'paragraph',
      text:
        'Di kartu yang lebih dikenal, hal pertama yang terjadi adalah mahkota di ' +
        'puncak menara terlempar. Isyaratnya jelas: yang runtuh adalah kekuasaan, ' +
        'atau kesombongan, atau sesuatu yang memang pantas jatuh.',
    },
    {
      kind: 'paragraph',
      text:
        'Di kartu kami tidak ada mahkota. Menaranya terbelah dari atas sampai ke ' +
        'bawah oleh satu sambaran, batunya berhamburan ke luar, dan dua sosok jatuh ' +
        'di kedua sisi. Api terlihat di celah jendela — jadi ada yang tinggal di ' +
        'dalamnya.',
    },
    {
      kind: 'paragraph',
      text:
        'Menghapus mahkotanya menghapus pelajaran moralnya. Yang roboh di sini bukan ' +
        'kesombongan siapa-siapa. Dia cuma bangunan, dan ada orang di dalamnya, dan ' +
        'itu bacaan yang jauh lebih sering benar.',
    },

    { kind: 'heading', level: 2, text: 'Enam belas, dan akarnya' },
    {
      kind: 'paragraph',
      text:
        'Enam belas dilipat menjadi tujuh, dan tujuh adalah The Chariot. Kartu ' +
        'tentang sesuatu yang melaju dan masih bisa dikemudikan berdiri tepat di ' +
        'belakang kartu ini, dan jarak antara keduanya adalah jawaban atas ' +
        'pertanyaan "apa yang terjadi kalau tidak ada yang memegang kemudinya cukup ' +
        'lama".',
    },
    { kind: 'cardRef', slug: 'the-chariot', text: 'Baca lore The Chariot (VII)' },
  ],

  inSpread: [
    {
      kind: 'paragraph',
      text:
        'Di Kartu Harian, dia jarang berarti hari yang hancur. Lebih sering dia ' +
        'menandai satu hal yang akhirnya diucapkan hari ini, dan yang setelah ' +
        'diucapkan tidak bisa dikembalikan ke keadaan sebelumnya.',
    },
    {
      kind: 'paragraph',
      text:
        'Di bacaan tiga kartu, di posisi yang sudah lewat dia hampir selalu sesuatu ' +
        'yang sekarang kamu syukuri, walaupun waktu itu tidak. Di posisi yang ' +
        'menanti di depan, dia bukan vonis — dia menunjuk pada retak yang masih bisa ' +
        'kamu periksa sendiri.',
    },
  ],

  questions: [
    {
      q: 'The Tower berarti akan ada musibah?',
      a:
        'Bukan itu bacaannya. Kartu ini soal bangunan yang sudah retak dan akhirnya ' +
        'diperiksa. Petirnya datang terakhir, bukan pertama, dan retaknya biasanya ' +
        'sudah pernah disebut orang.',
    },
    {
      q: 'Apa yang bisa dilakukan kalau kartunya sudah keluar tegak?',
      a:
        'Berhenti membangun di bagian yang baru saja terbukti tidak menahan. Kartu ' +
        'ini tidak melarang membangun sama sekali; dia melarang membangun di tempat ' +
        'yang sama dengan alasan bahwa dulu sempat berdiri.',
    },
    {
      q: 'Kenapa kartu kami tidak punya mahkota?',
      a:
        'Karena mahkota di kartu lama membuat robohnya terasa pantas. Tanpa mahkota, ' +
        'yang tersisa cuma bangunan dan orang-orang di dalamnya — dan itu bacaan ' +
        'yang jauh lebih sering benar.',
    },
    {
      q: 'Bedanya The Tower dan Wheel of Fortune apa?',
      a:
        'Wheel of Fortune berputar dan akan berputar lagi; tidak ada yang hancur. ' +
        'The Tower menghapus bangunannya, dan tidak ada putaran berikutnya yang bisa ' +
        'ditunggu.',
    },
  ],
};

export default theTowerId;
