import { bullets, cardRef, em, h2, h3, link, para, s, steps, strong } from '../blocks';
import type { BlogDoc } from '../types';

/**
 * `what-tarot-is`, Indonesian. **THE SOURCE ARTICLE for the second piece.**
 *
 * ── WHY THIS ARTICLE EXISTS AT ALL ──────────────────────────────────────────────
 *
 * **Reconciliation R5.** S6's plan shipped one article and flagged, honestly, that a
 * link labelled *"apa itu tarot"* landing two-thirds of the way into a 2,400-word how-to
 * is a compromise rather than a design. Jodith's request was specific:
 *
 * > *"gw lg mikir ada footer di landing page kita/blog/artikel, khusus org baca" sedikit
 * > ada pemahamannya jg — ttg mitos, fakta, tarot itu apa. manfaat apa"*
 *
 * That is a request for **orientation for a reader who arrived knowing nothing**, and R5
 * ruled it deserves a page rather than three anchors inside somebody else's page. So this
 * document answers exactly those three questions, in that order, and `#what-tarot-is` /
 * `#myths-and-facts` / `#what-its-for` are its first three sections rather than its
 * middle.
 *
 * ── ONE SLUG, ENGLISH, IN BOTH LOCALES ─────────────────────────────────────────
 *
 * R5 wrote it as *"`apa-itu-tarot` / `what-tarot-is`"*, which reads as one slug per
 * locale. **It cannot be**: `contentAlternates()` derives the `/en/` twin from one bare
 * path, so a per-locale slug needs a per-locale path table that nothing in this release
 * has. One slug, and the English one, exactly as `/history` stayed `/history` rather than
 * becoming `/jejak`.
 *
 * ── AUTHORED, NOT TRANSLATED (roadmap §8.2) ────────────────────────────────────
 *
 * `./what-tarot-is.en.ts` is a different article about the same subject: it opens on the
 * objection a sceptic actually has, carries a section on why a deck of pictures works at
 * all and one addressed to somebody who does not believe in any of it, and drops the
 * historical section this one leads its second half with. No worked card is shared and no
 * recommended card page is shared; `blog.content.test.ts` fails by SAMENESS on all of it.
 *
 * MALAY CHECK: `karena` throughout, `kamu` throughout, no `kerana`/`iaitu`/`tempoh`.
 * NOTHING HERE DESCRIBES THE PRODUCT — see `./how-to-read-tarot.id.ts`'s header.
 */
export const whatTarotIsId: BlogDoc = {
  slug: 'what-tarot-is',
  locale: 'id',
  title: 'Apa Itu Tarot: Mitos, Fakta, dan Manfaatnya',
  description:
    'Penjelasan tarot untuk yang belum pernah menyentuhnya: apa isinya, dari mana asalnya, mitos apa yang salah, dan apa yang sebenarnya bisa kamu dapat darinya.',
  hero: { cardUrlSlug: 'the-world', alt: 'The World' },
  body: [
    h2('what-tarot-is', 'Tarot itu apa'),
    para(
      s(
        'Tarot adalah setumpuk kartu bergambar yang dipakai untuk memikirkan sesuatu dengan lebih jelas. Itu jawaban paling pendek yang masih jujur, dan sengaja tidak dibuat lebih megah daripada itu.',
      ),
    ),
    para(
      s(
        'Setumpuk lengkap berisi 78 kartu. Lima puluh enam di antaranya disebut Minor Arcana dan tersusun seperti kartu remi: empat rangkaian, masing-masing dari As sampai Sepuluh, ditambah empat kartu tokoh. Dua puluh dua sisanya disebut Major Arcana, dan itulah kartu yang gambarnya paling dikenal orang — The Fool, The Lovers, Death, The Star, The World.',
      ),
    ),
    para(
      s(
        'Major Arcana tidak punya rangkaian dan tidak punya angka yang bisa dijumlahkan. Masing-masing berdiri sendiri sebagai satu adegan: seseorang melangkah dari tepi jurang, dua orang berdiri di bawah cahaya, sebuah menara yang runtuh. Kalau kamu menyusun ke-22 kartu itu berurutan dari nol sampai dua puluh satu, kamu mendapatkan sesuatu yang mirip satu hidup manusia dari awal sampai selesai — dan itu sebabnya banyak orang, termasuk kami, memakai Major Arcana saja.',
      ),
    ),
    cardRef(
      'the-fool',
      'The Fool, nomor nol: orang yang belum tahu apa-apa dan tetap melangkah.',
    ),
    para(
      s('Kalau kamu penasaran seperti apa ke-22 kartu itu, '),
      link('/gallery', 'galerinya ada di sini'),
      s(
        ' — satu halaman, semua gambar, tanpa perlu tahu apa pun lebih dulu. Melihatnya lebih dulu adalah cara masuk yang paling masuk akal, karena yang bekerja dalam tarot adalah gambarnya.',
      ),
    ),

    h2('myths-and-facts', 'Mitos dan fakta'),
    para(
      s(
        'Kebanyakan yang orang tahu tentang tarot datang dari film, dan film butuh peramal. Lima koreksi, dan yang pertama membuat empat sisanya lebih mudah dimengerti.',
      ),
    ),
    bullets(
      [
        strong('Mitos: tarot meramal masa depan.'),
        s(
          ' Tarot tidak memberi tahu apa yang akan terjadi. Ia menggambarkan apa yang sedang berjalan sekarang, dan ke mana arahnya kalau tidak ada yang berubah. Sebuah bacaan yang baik menyebut satu hal yang bisa kamu kerjakan minggu ini, bukan satu tanggal yang harus kamu tunggu.',
        ),
      ],
      [
        strong('Mitos: ada kartu baik dan kartu buruk.'),
        s(' Tidak ada. '),
        link('/arcana/wheel-of-fortune', 'Wheel of Fortune'),
        s(
          ' bisa berarti keberuntungan yang datang tiba-tiba atau kehilangan kendali atas jadwalmu sendiri, dan keduanya kartu yang sama. Yang menentukan bukan kartunya, melainkan pertanyaan yang kamu bawa dan kartu di sebelahnya.',
        ),
      ],
      [
        strong('Mitos: kamu harus punya bakat khusus.'),
        s(
          ' Yang dibutuhkan adalah perhatian dan kejujuran. Orang yang paling sulit membaca tarot bukan orang yang tidak berbakat, melainkan orang yang sudah tahu jawaban yang ia inginkan sebelum kartunya dibuka.',
        ),
      ],
      [
        strong('Mitos: tarot bertentangan dengan agama atau dengan akal sehat.'),
        s(
          ' Kamu tidak perlu percaya apa pun yang bersifat gaib untuk mendapat sesuatu dari selembar gambar yang memaksa kamu menyebut apa yang sedang kamu hindari. Sebagian orang memakainya sebagai laku spiritual; sebagian memakainya seperti buku catatan. Keduanya sah.',
        ),
      ],
      [
        strong('Mitos: kalau kartunya jelek, sebaiknya tarik ulang.'),
        s(
          ' Kalau kartu bisa dibatalkan, tidak ada bacaan yang pernah berarti apa pun. Menarik ulang bukan memperbaiki bacaan; itu cara paling halus untuk memilih jawaban sendiri lalu menyebutnya sebagai jawaban kartu.',
        ),
      ],
    ),
    para(
      strong('Dan satu fakta yang paling sering hilang:'),
      s(
        ' arti sebuah kartu tidak tetap. Kartu yang sama bisa berarti "sabarlah" pada satu bacaan dan "kamu sedang menunda" pada bacaan berikutnya. Daftar arti kartu adalah titik awal untuk mulai bicara, bukan kamus untuk dicocokkan.',
      ),
    ),

    h2('what-its-for', 'Manfaatnya apa'),
    para(
      s(
        'Ini pertanyaan yang paling pantas dijawab langsung, karena di sinilah tarot paling sering dijual berlebihan. Ada tiga hal yang benar-benar ia lakukan.',
      ),
    ),
    para(
      strong('Ia memberi nama pada sesuatu yang belum punya nama.'),
      s(
        ' Ada perasaan yang sudah beberapa minggu kamu bawa dan belum pernah kamu ucapkan sebagai satu kalimat. Sebuah gambar memberi pegangan untuk mengucapkannya, dan begitu sesuatu punya nama, ia bisa dibicarakan dengan orang lain.',
      ),
    ),
    para(
      strong('Ia memaksa kamu merumuskan pertanyaanmu.'),
      s(
        ' Untuk menarik kartu, kamu harus lebih dulu memutuskan apa yang sebenarnya kamu tanyakan. Pekerjaan itu terdengar remeh dan sering kali sudah menyelesaikan separuh persoalannya sebelum kartu pertama dibuka — dan ini satu-satunya manfaat yang tetap ada bahkan kalau kamu tidak percaya sedikit pun pada kartunya.',
      ),
    ),
    para(
      strong('Ia memberi jarak.'),
      s(
        ' Membicarakan gambar di atas meja lebih mudah daripada membicarakan diri sendiri. Orang menyebut hal-hal tentang hidupnya sambil menunjuk '),
      link('/arcana/the-lovers', 'The Lovers'),
      s(
        ' yang tidak akan ia sebut kalau ditanya langsung. Jarak sekecil itu ternyata cukup.',
      ),
    ),
    para(
      s(
        'Kalau kamu mengharapkan lebih dari tiga hal itu, kemungkinan besar kamu akan kecewa — dan kalau kamu mengharapkan kurang, kamu akan meremehkan alat yang sudah dipakai orang selama lima ratus tahun untuk pekerjaan yang sama.',
      ),
    ),

    h2('not-for', 'Yang tarot bukan'),
    para(
      s(
        'Satu bagian pendek, dan ini bagian yang paling penting untuk pembaca yang baru sama sekali.',
      ),
    ),
    para(
      s(
        'Tarot bukan pengganti nasihat medis, hukum, atau keuangan. Kalau sebuah pertanyaan punya jawaban yang bisa dicari — berapa sisa cicilanmu, apa isi kontrakmu, apa kata pemeriksaan — cari jawabannya. Kartu tidak punya akses ke informasi itu dan tidak berpura-pura punya. Tarot juga bukan tempat menaruh keputusan yang seharusnya kamu ambil sendiri: sebuah sebaran boleh mengubah pikiranmu, tapi ia tidak boleh menggantikan pikiranmu.',
      ),
    ),
    para(
      s(
        'Dan satu aturan sopan yang bukan takhayul: jangan membaca kartu untuk orang yang tidak memintanya. Membaca tanpa diminta, lalu menyampaikan hasilnya, adalah cara memaksa seseorang mendengar pendapatmu tentang hidupnya dengan pembungkus yang terlihat netral.',
      ),
    ),

    h2('origins', 'Dari mana tarot datang'),
    para(
      s(
        'Ini bagian yang paling sering dikaburkan, dan sejarahnya sebenarnya lebih menarik daripada versi yang dikaburkan.',
      ),
    ),
    para(
      s(
        'Kartu bergambar seperti ini muncul di Italia utara pada pertengahan abad kelima belas, dan pada mulanya bukan alat ramal sama sekali: itu permainan kartu untuk kalangan istana, dengan satu rangkaian bergambar yang berfungsi sebagai kartu penakluk. Namanya sampai sekarang masih menyimpan jejak itu — dalam bahasa Italia permainannya disebut ',
      ),
      em('tarocchi'),
      s(
        ', dan di beberapa tempat di Eropa orang masih memainkannya sebagai permainan, bukan sebagai ramalan.',
      ),
    ),
    para(
      s(
        'Pemakaiannya untuk membaca keadaan seseorang baru berkembang sekitar akhir abad kedelapan belas, di Prancis, dan menjadi seperti yang kita kenal sekarang pada awal abad kedua puluh di Inggris — ketika satu setumpuk yang gambarnya dirancang ulang menjadi begitu populer sehingga hampir semua setumpuk sesudahnya mengikuti komposisinya. Itu sebabnya kartu-kartu tarot dari penerbit yang berbeda sering terlihat mirip: mereka mengutip satu setumpuk yang sama.',
      ),
    ),
    para(
      s(
        'Kenapa ini perlu diketahui? Karena mitos "tarot berasal dari Mesir kuno" masih beredar, dan mitos itu dibuat pada abad kedelapan belas oleh orang yang menjualnya. Tarot tidak perlu berumur lima ribu tahun untuk berguna. Lima ratus tahun sudah cukup lama, dan itu angka yang benar.',
      ),
    ),

    h2('major-minor', 'Major Arcana dan Minor Arcana'),
    para(
      s(
        'Perbedaan keduanya paling mudah dijelaskan begini: Minor Arcana bicara tentang kejadian, Major Arcana bicara tentang apa arti kejadian itu.',
      ),
    ),
    bullets(
      [
        strong('Minor Arcana'),
        s(
          ' — empat rangkaian, masing-masing punya nada sendiri: pekerjaan dan uang, perasaan, pikiran dan perkataan, dorongan dan keberanian. Kartunya bicara tentang hal-hal sehari yang bisa dihitung. Sebuah tagihan, sebuah percakapan, sebuah tawaran.',
        ),
      ],
      [
        strong('Major Arcana'),
        s(
          ' — dua puluh dua kartu tanpa rangkaian. Kartunya bicara tentang babak: sesuatu yang selesai, sesuatu yang dimulai, keberanian yang akhirnya datang, kebohongan yang akhirnya terbuka. Kalau sebuah bacaan penuh Major Arcana, biasanya yang sedang dibicarakan bukan minggu ini, melainkan tahun ini.',
        ),
      ],
    ),
    para(
      s('Kami memakai ke-22 Major Arcana saja, dan itu pilihan sadar. Dua puluh dua kartu cukup sedikit untuk dikenali satu per satu dalam beberapa minggu — mulai dari '),
      link('/arcana/the-magician', 'The Magician'),
      s(
        ' kalau kamu ingin melihat contoh kartu yang artinya sering disalahpahami — dan cukup luas untuk menjawab hampir semua pertanyaan yang benar-benar mengganggu seseorang.',
      ),
    ),

    h2('first-steps', 'Langkah pertama, kalau kamu mau mencoba'),
    para(
      s(
        'Tidak perlu membeli apa pun untuk memulai, dan tidak perlu menghafal apa pun lebih dulu.',
      ),
    ),
    steps(
      [
        s('Lihat gambarnya dulu. Buka '),
        link('/gallery', 'galeri ke-22 kartu'),
        s(' dan berhenti pada satu kartu yang membuat kamu ingin melihat lebih lama.'),
      ],
      [
        s(
          'Baca halaman kartu itu. Setiap kartu punya halamannya sendiri, dengan arti tegak, arti terbalik, dan asal-usulnya.',
        ),
      ],
      [
        s('Susun satu pertanyaan yang tidak bisa dijawab "ya" atau "tidak". '),
        link('/blog/how-to-read-tarot', 'Panduan cara membaca tarot'),
        s(' punya satu bagian khusus tentang ini, dengan contoh sebelum dan sesudah.'),
      ],
      [
        s(
          'Tarik tiga kartu dan bicarakan satu per satu sampai selesai sebelum membuka yang berikutnya.',
        ),
      ],
    ),
    h3('one-more-thing', 'Satu hal terakhir'),
    para(
      s(
        'Bacaan pertama hampir selalu terasa mengecewakan, dan itu normal. Bukan karena kartunya salah, tetapi karena membaca gambar adalah keterampilan yang dilatih, seperti membaca partitur: mula-mula kamu mengeja, lalu suatu hari kamu tidak mengeja lagi. Beri waktu sebulan, satu kartu sehari, dan lihat lagi.',
      ),
    ),
  ],
};
