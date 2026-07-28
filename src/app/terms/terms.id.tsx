import Link from 'next/link';
import { Callout, Clause, LegalDoc, P, SubClause } from '@/components/Legal';
import { OPERATOR } from './operator';

/**
 * Syarat & Ketentuan. **VERSI INI YANG BERLAKU** (W7-D20).
 *
 * The Indonesian document is authoritative and the English one is a natively
 * written companion, which clause 16 states in both. Two natively-written legal
 * documents WILL drift; naming the governing one is a two-line clause now and an
 * unanswerable question later.
 *
 * ---
 *
 * **THREE THINGS A FUTURE SESSION MUST NOT DO TO THIS FILE.**
 *
 * 1. **Do not renumber clause 6.** Its sub-clause ids are an INTERFACE: the
 *    moderation refusal renders `/terms#6-2`, and `CLAUSE_FOR` in
 *    `src/lib/moderation/types.ts` is the map. `legal.test.ts` fails if any
 *    category's clause has no matching heading here or in `terms.en.tsx`.
 *
 * 2. **Do not add a statute, an article number or a court name that nobody has
 *    read.** Indonesia's personal-data law has provisions about children's data
 *    and reconciliation §7.6 explicitly left that unverified: "no article number
 *    is cited in the T&C unless someone has read the article". The age bar is a
 *    floor we set, not one we have confirmed is sufficient.
 *
 * 3. **Clauses 10, 11 and 12 NEED A LAWYER.** Disclaimer of warranties,
 *    limitation of liability, indemnity. The substance below is drafted and its
 *    ENFORCEABILITY IS NOT ASSESSED. That is a known, accepted gap at launch --
 *    recorded here rather than in a tracker, because the person who needs to
 *    know is whoever next opens this file.
 *
 * MALAY CHECK: no `kerjaya`, `hala tuju`, `sembang`, `awak`, `tempoh`. `kamu`
 * throughout. Retention language is `jangka waktu` / `masa simpan`, never
 * `tempoh` -- which is the single easiest Malay word to reach for when writing
 * about retention, and is exactly why the original four-word grep missed it.
 */
export function TermsId({ effective }: { effective: string }) {
  return (
    <LegalDoc title="Syarat & Ketentuan" effective={effective}>
      <Clause id="1" n="1." title="Siapa kami">
        <P>
          {OPERATOR.legalName}{' '}(&ldquo;kami&rdquo;) mengoperasikan JMTarot, sebuah situs tarot
          yang dapat kamu buka di {OPERATOR.domain}{' '}dan pasang di layar utama ponselmu
          (&ldquo;Layanan&rdquo;). Kamu bisa menghubungi kami di{' '}
          <a href={`mailto:${OPERATOR.contactEmail}`}>{OPERATOR.contactEmail}</a>.
        </P>
        <P>
          Dalam dokumen ini, &ldquo;kamu&rdquo; berarti orang yang memakai Layanan.
          &ldquo;Bacaan&rdquo; berarti teks yang dihasilkan Layanan setelah kamu menarik kartu.
          &ldquo;Pertanyaan&rdquo; berarti kalimat yang kamu ketik sendiri sebelum bacaan dibuat.
        </P>
      </Clause>

      <Clause id="2" n="2." title="Persetujuan dan perubahan">
        <P>
          Dengan memakai Layanan, kamu setuju pada Syarat &amp; Ketentuan ini. Kalau kamu tidak
          setuju, jangan memakainya.
        </P>
        <P>
          Kami bisa mengubah dokumen ini. Perubahan yang berarti akan kami umumkan di dalam
          aplikasi dan kamu diminta menyetujuinya lagi sebelum melanjutkan. Kami mencatat kapan
          kamu menyetujui dan versi mana yang kamu setujui.
        </P>
      </Clause>

      <Clause id="3" n="3." title="Umur">
        <P>
          <strong>Layanan ini untuk usia 18 tahun ke atas.</strong>{' '}Saat pertama kali masuk, kamu
          diminta menyatakan bahwa kamu sudah berumur 18 tahun atau lebih.
        </P>
        <P>
          Alasannya bukan kartunya. Alasannya pertanyaan pembuka yang kami ajukan sekali di awal:
          salah satunya menyangkut peristiwa berat yang pernah kamu saksikan, dan jawabannya kami
          simpan. Mengumpulkan hal seperti itu dari anak-anak adalah risiko yang berbeda sama
          sekali, dan tidak ada enkripsi yang mengubahnya. Penjelasan lengkapnya ada di klausul 7.
        </P>
        <P>
          Kami tidak memverifikasi umur, dan kami menyatakannya terus terang di sini. Kalau kami
          tahu seorang pengguna berumur di bawah 18 tahun, akunnya kami hapus.
        </P>
      </Clause>

      <Clause id="4" n="4." title="Apa itu Layanan ini">
        <Callout>
          <P>
            <strong>Layanan ini hiburan.</strong>{' '}Tarot tidak punya daya ramal, dan kami tidak
            mengklaim sebaliknya. Jangan mengambil keputusan penting hanya berdasarkan bacaan di
            sini.
          </P>
        </Callout>
        <SubClause id="4-2" n="4.2" title="Bukan nasihat profesional">
          <P>
            Layanan ini bukan nasihat medis, kesehatan jiwa, psikologis, psikiatris, hukum,
            keuangan, pajak, atau konseling hubungan, dan bukan pengganti dari semua itu. Tidak
            ada apa pun di sini yang mendiagnosis, mengobati, atau menyembuhkan apa pun.
          </P>
        </SubClause>
        <SubClause id="4-3" n="4.3" title="Bacaan ditulis oleh model bahasa">
          <P>
            Setiap bacaan dibuat oleh sebuah model bahasa pada saat kamu memintanya. Bacaan
            bersifat tidak pasti: kartu dan pertanyaan yang sama bisa menghasilkan teks yang
            berbeda. Bacaan bisa keliru secara faktual, dan tidak ada manusia yang menulis atau
            memeriksanya sebelum kamu membacanya.
          </P>
        </SubClause>
        <SubClause id="4-4" n="4.4" title="Para pembaca adalah tokoh fiksi">
          <P>
            Thessaly, Margaret, dan Adrian adalah persona, bukan orang. Mereka tidak punya
            kualifikasi apa pun dan tidak memberikan pendapat profesional.
          </P>
        </SubClause>
        <SubClause id="4-5" n="4.5" title="Tidak ada hasil yang dijanjikan">
          <P>Kami tidak menjanjikan hasil apa pun dari bacaan mana pun.</P>
        </SubClause>
      </Clause>

      <Clause id="5" n="5." title="Akunmu">
        <P>
          Masuk hanya lewat Google. Satu orang satu akun. Keamanan akun Google-mu adalah tanggung
          jawabmu.
        </P>
        <P>
          Kami mengenalimu lewat pengenal tetap yang diberikan Google, bukan lewat alamat email.
          Jadi kalau kamu mengganti alamat email di Google, akunmu di sini tetap akun yang sama.
        </P>
      </Clause>

      <Clause id="6" n="6." title="Pertanyaan dan perbuatan yang tidak kami layani">
        <SubClause id="6-1" n="6.1" title="Umum">
          <P>
            Layanan menolak pertanyaan dalam kategori di bawah ini, secara otomatis, dan
            kadang-kadang keliru. <strong>Penolakan bukan tuduhan</strong>{' '}dan tidak dicatat
            sebagai pelanggaran atas namamu. Kalau pertanyaanmu ditolak padahal wajar, tulis ulang
            dengan kalimat lain, atau beri tahu kami di{' '}
            <a href={`mailto:${OPERATOR.contactEmail}`}>{OPERATOR.contactEmail}</a>.
          </P>
          <P>
            Sebaliknya, hal-hal berikut <strong>boleh</strong>{' '}kamu tanyakan dan memang bagian dari
            wilayah tarot: duka, kematian orang lain, penyakit, perceraian, perselingkuhan,
            kehilangan pekerjaan, utang, masalah hukum, guna-guna atau santet, dan pertanyaan
            tentang meninggalkan pasangan yang kasar.
          </P>
        </SubClause>
        <SubClause id="6-2" n="6.2" title="Menyakiti diri sendiri dan bunuh diri">
          <P>
            Jangan meminta Layanan menasihati, memutuskan, mendorong, atau memberi cara maupun
            waktu untuk mengakhiri hidupmu atau melukai dirimu sendiri. Lihat klausul 7.
          </P>
        </SubClause>
        <SubClause id="6-3" n="6.3" title="Kekerasan terhadap orang lain">
          <P>
            Jangan meminta Layanan menasihati, memutuskan, atau merestui tindakan melukai atau
            membunuh siapa pun.
          </P>
        </SubClause>
        <SubClause id="6-4" n="6.4" title="Terorisme dan ekstremisme">
          <P>
            Tidak ada perencanaan serangan, tidak ada pembuatan senjata atau bahan peledak, dan
            tidak ada pemuliaan atas keduanya.
          </P>
        </SubClause>
        <SubClause id="6-5" n="6.5" title="Konten seksual yang melibatkan anak">
          <P>
            Mutlak. Tidak ada pengecualian, tidak ada konteks, tidak ada fiksi. Selalu ditolak, dan
            berbeda dari kategori lain, teks pertanyaannya sama sekali tidak kami simpan.
          </P>
        </SubClause>
        <SubClause id="6-6" n="6.6" title="Perbuatan melawan hukum yang mencelakai orang">
          <P>
            Meracuni, perdagangan orang, penipuan yang menyasar orang tertentu, senjata ilegal, dan
            sejenisnya. <strong>Ini bukan larangan bertanya soal masalah hukum yang sedang kamu
            hadapi sendiri</strong>{' '}&mdash; pertanyaan seperti itu boleh.
          </P>
        </SubClause>
        <SubClause id="6-7" n="6.7" title="Kebencian dan perendahan martabat">
          <P>
            Serangan terhadap orang karena ras, agama, suku, kewarganegaraan, disabilitas, jenis
            kelamin, atau orientasi seksual.
          </P>
        </SubClause>
        <SubClause id="6-8" n="6.8" title="Pemaksaan, penguntitan, dan pelanggaran persetujuan">
          <P>
            Jangan meminta Layanan membantumu mengikuti, menekan, menipu, atau mengabaikan
            penolakan orang lain.
          </P>
        </SubClause>
        <SubClause id="6-9" n="6.9" title="Mengakali Layanan">
          <P>
            Jangan mencoba mengubah, menampilkan, mengambil, atau menyalin instruksi, prompt, atau
            pengaman Layanan, dan jangan membuatnya bertindak di luar perannya.
          </P>
        </SubClause>
        <SubClause id="6-10" n="6.10" title="Akses otomatis">
          <P>
            Tidak boleh melakukan scraping, kueri otomatis, penjualan ulang bacaan, atau rekayasa
            balik.
          </P>
        </SubClause>
      </Clause>

      <Clause
        id="7"
        n="7."
        title="Kenapa kami bertanya soal hal berat, tapi tidak mau membaca kartu tentangnya"
      >
        {/*
          DRAFTED VERBATIM IN W7's PLAN §4.2 AND TRANSCRIBED, NOT REWRITTEN. It is
          the clause roadmap §8 asks for, it is linked from the privacy policy,
          and it answers a contradiction a user WILL notice.

          The self-harm refusal deliberately does NOT link here -- it links to
          6.2. A person in crisis does not need an explanation of our data model.
        */}
        <P>
          Waktu kamu pertama kali masuk, kami menanyakan satu hal yang berat: peristiwa paling
          mengerikan yang pernah kamu saksikan. Pertanyaan itu boleh kamu lewati, jawabannya
          disimpan dalam bentuk terenkripsi, dan yang sampai ke model bahasa hanya ringkasan
          abstraknya &mdash; bukan kalimatmu.
        </P>
        <P>
          Tapi kalau kamu meminta bacaan kartu tentang mengakhiri hidupmu sendiri, kami menolak.
          Dua hal ini kelihatan bertentangan. Sebenarnya tidak.
        </P>
        <P>
          Yang pertama adalah satu pertanyaan tertutup, kamu jawab sekali, boleh tidak dijawab, dan
          jawabannya hanya kami simpan. Kami tidak menanggapinya, tidak menilainya, dan tidak
          memberi saran apa pun atasnya.
        </P>
        <P>
          Yang kedua adalah permintaan nasihat terbuka tentang keselamatanmu &mdash; dan jawabannya
          akan ditulis oleh sebuah model bahasa yang tidak tahu apa pun tentang keadaanmu, tidak
          bisa mengecek keadaanmu, dan tidak punya kualifikasi apa pun untuk menjawabnya.
        </P>
        <P>
          <strong>Kami bersedia mendengar. Kami tidak bersedia menebak.</strong>
        </P>
      </Clause>

      <Clause id="8" n="8." title="Penolakan, penangguhan, dan penghentian akun">
        <P>
          Kami boleh menolak pertanyaan apa pun. Kami boleh menangguhkan atau menghentikan akun
          karena pelanggaran klausul 6 yang berulang dan disengaja.
        </P>
        <P>
          {/*
            W7's plan §4.1 clause 8 and its open question 10: NO automatic strike
            counting and NO automatic ban at launch. An auto-ban triggered by a
            false positive is unrecoverable, and the gate is brand new. Manual
            termination only, with moderation_flags as the evidence trail.
          */}
          Kami tidak menghitung pelanggaran secara otomatis dan tidak memblokir akun secara
          otomatis. Penghentian dilakukan manusia setelah melihat riwayatnya.
        </P>
        <P>
          Kamu boleh menghentikan akunmu sendiri kapan saja. Cara dan akibatnya dijelaskan di{' '}
          <Link href="/privacy#8">Kebijakan Privasi bagian 8</Link>.
        </P>
      </Clause>

      <Clause id="9" n="9." title="Hak kekayaan intelektual">
        <P>
          Milik kami: gambar kartu, persona para pembaca beserta tulisannya, prompt dan instruksi
          sistem, kode program, dan nama JMTarot.
        </P>
        <P>
          Milikmu: pertanyaan yang kamu ketik, dan pertanyaan itu tetap milikmu. Kamu memberi kami
          izin untuk memproses dan menyimpan pertanyaan serta bacaanmu sebagaimana dijelaskan di
          Kebijakan Privasi, untuk menjalankan dan mempersonalisasi Layanan &mdash; dan tidak untuk
          hal lain.
        </P>
        <P>Bacaan adalah untuk keperluan pribadimu, bukan untuk keperluan komersial.</P>
      </Clause>

      <Clause id="10" n="10." title="Tanpa jaminan">
        {/* NEEDS LEGAL REVIEW -- substance drafted, enforceability not assessed. */}
        <P>
          Layanan disediakan apa adanya. Kami tidak menjamin bahwa Layanan akan selalu tersedia,
          bebas dari kesalahan, akurat, atau cocok untuk keperluan tertentu.
        </P>
      </Clause>

      <Clause id="11" n="11." title="Batas tanggung jawab">
        {/* NEEDS LEGAL REVIEW -- substance drafted, enforceability not assessed. */}
        <P>
          Kami tidak bertanggung jawab atas keputusan yang kamu ambil berdasarkan sebuah bacaan,
          maupun atas kerugian tidak langsung yang timbul dari pemakaian Layanan.
        </P>
        <P>
          Layanan ini gratis, sehingga batas tanggung jawab kami bersifat nominal. Tidak ada bagian
          dari klausul ini yang membatasi tanggung jawab yang menurut hukum tidak boleh dibatasi.
        </P>
      </Clause>

      <Clause id="12" n="12." title="Ganti rugi">
        {/* NEEDS LEGAL REVIEW -- substance drafted, enforceability not assessed. */}
        <P>
          Kamu setuju mengganti kerugian kami yang timbul karena kamu memakai Layanan dengan cara
          yang melanggar Syarat &amp; Ketentuan ini.
        </P>
      </Clause>

      <Clause id="13" n="13." title="Privasi">
        <P>
          <Link href="/privacy">Kebijakan Privasi</Link>{' '}menjelaskan data apa yang kami kumpulkan,
          untuk apa, siapa saja yang melihatnya, dan berapa lama kami menyimpannya. Kebijakan itu
          merupakan bagian dari Syarat &amp; Ketentuan ini.
        </P>
      </Clause>

      <Clause id="14" n="14." title="Ketersediaan dan perubahan Layanan">
        <P>
          Layanan gratis. Kami bisa mengubahnya atau menghentikannya. Kami tidak menjamin Layanan
          selalu bisa diakses, dan tidak menjamin datamu tersimpan lebih lama daripada jangka waktu
          yang disebut di Kebijakan Privasi.
        </P>
      </Clause>

      <Clause id="15" n="15." title="Hukum yang berlaku dan penyelesaian sengketa">
        <P>Syarat &amp; Ketentuan ini tunduk pada hukum Republik Indonesia.</P>
        <P>
          {/*
            RECONCILIATION §7.3, with its correction applied. Miftah answered
            "Pengadilan Tinggi Jakarta"; a Pengadilan Tinggi is APPELLATE and
            cannot be a filing venue, so a clause naming one names a court nobody
            can use. The city was the part actually needed.

            NEEDS CONFIRMATION, and it is a one-word fill-in: Jakarta has five
            district courts. Jakarta Pusat is the conventional default and is
            what is drafted. If PT Citra Suka Buana's deed of establishment gives
            a domicile in a different Jakarta district, swap the word -- parties
            may elect any forum, but matching the company's own domicile is the
            unarguable choice.
          */}
          Para Pihak sepakat memilih domisili hukum yang umum dan tetap pada Kepaniteraan{' '}
          {OPERATOR.forum}.
        </P>
      </Clause>

      <Clause id="16" n="16." title="Bahasa">
        <Callout>
          <P>
            Syarat &amp; Ketentuan ini tersedia dalam Bahasa Indonesia dan bahasa Inggris.{' '}
            <strong>Versi Bahasa Indonesia yang berlaku.</strong>{' '}Kalau ada perbedaan arti antara
            kedua versi, versi Bahasa Indonesia yang dipakai.
          </P>
        </Callout>
      </Clause>

      <Clause id="17" n="17." title="Kontak">
        <P>
          {OPERATOR.legalName} &mdash;{' '}
          <a href={`mailto:${OPERATOR.contactEmail}`}>{OPERATOR.contactEmail}</a>
        </P>
      </Clause>

      {/*
        18, APPENDED. **NOT INSERTED BETWEEN 9 AND 10, WHERE IT WOULD READ
        BETTER.** `CLAUDE.md`'s "Still open" section says "Clauses 10, 11 and 12
        need a lawyer", and reconciliation records the same -- renumbering would
        make that sentence point at three different clauses, silently, in a file
        nobody re-reads. Anchors are append-only in this project and this is what
        append-only costs.
      */}
      <Clause id="18" n="18." title="Membagikan bacaan">
        <P>
          Kamu bisa membuat satu tautan untuk sebuah bacaan. Yang ikut terbuka lewat tautan itu:
          kartu-kartunya, arah kartunya, teks bacaannya, nama pembacanya, tanggalnya,{' '}
          <strong>dan pertanyaan yang kamu tulis</strong>. Pertanyaannya ikut karena tanpa itu
          bacaannya tidak bisa diikuti orang lain &mdash; tiga kartu dan empat paragraf tanpa
          pertanyaan tidak memberi tahu siapa pun bacaan ini tentang apa.
        </P>
        <P>
          Sebelum tautannya dibuat, kami menampilkan halaman itu apa adanya kepadamu, lengkap
          dengan pertanyaanmu, supaya kamu tahu persis apa yang akan terbaca. Kalau ada
          pertanyaan yang tidak ingin kamu bagikan,{' '}
          <strong>jangan buat tautan untuk bacaan itu</strong>.
        </P>
        <P>
          Siapa pun yang punya tautannya bisa membuka halaman itu tanpa akun, dan bisa
          meneruskannya ke orang lain. Kami tidak tahu siapa saja yang membukanya.
        </P>
        <P>
          Kamu bisa mematikan tautan itu kapan saja dari bacaan yang sama. Mematikannya membuat
          alamat itu mati untuk selamanya:{' '}
          <strong>membagikan lagi akan membuat alamat baru, bukan menghidupkan yang lama.</strong>{' '}
          Itu disengaja, supaya tautan yang kamu matikan tidak bisa berfungsi kembali.
        </P>
        <Callout>
          <P>
            <strong>Mematikan tautan tidak menarik kembali apa yang sudah keluar.</strong>{' '}
            Tangkapan layar yang sudah diambil orang tetap ada, pesan yang sudah diteruskan tetap
            terkirim, dan gambar pratinjau yang sudah disimpan aplikasi pesan bisa bertahan sampai
            sehari. Anggap tautan sebagai sesuatu yang kamu kirim, bukan sesuatu yang kamu pinjamkan.
          </P>
        </Callout>
        <P>
          Halaman yang dibagikan tetap tunduk pada klausul 6 seperti bagian Layanan lainnya, dan
          kamu tidak boleh memakai tautan bagikan untuk mengganggu, menekan, atau mempermalukan
          siapa pun.
        </P>
      </Clause>
    </LegalDoc>
  );
}
