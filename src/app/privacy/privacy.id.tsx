import Link from 'next/link';
import { Callout, Clause, LegalDoc, List, P, SubClause } from '@/components/Legal';
import { OPERATOR } from '../terms/operator';
import { PROVIDER, RETENTION } from './facts';

/**
 * Kebijakan Privasi. **VERSI INI YANG BERLAKU** (W7-D20), sama seperti Syarat &
 * Ketentuan.
 *
 * ---
 *
 * **THE RETENTION TABLE MUST MATCH WHAT THE CODE ACTUALLY DOES.** Every number
 * in section 6 comes from `./facts.ts`, which reads the same environment
 * variables the sweep reads. A policy that promises a SHORTER retention than the
 * code delivers is worse than one that promises nothing, and hand-typing `180`
 * here is how the two drift.
 *
 * **THE z.ai CLAUSE IN SECTION 4 IS SOURCED AND CONSTRAINED** (reconciliation
 * §7.1). Three things it must get right and one it must not do:
 *
 *   - The protection is **API-specific**. The same document reserves the
 *     opposite right for individual, non-API users, so a blanket "z.ai does not
 *     train on your data" would be false and trivially disprovable by a reader
 *     who opens the page. Write it as the API terms.
 *   - It is **opt-in**. Training needs affirmative agreement, so the standing
 *     obligation on us is simply never to agree.
 *   - **No retention period and no processing location are published.** The
 *     policy therefore states neither on the provider's behalf. It says the
 *     provider publishes none, and that the data may be processed outside
 *     Indonesia -- which their general terms do acknowledge.
 *   - **Do not invent a country.** "Transmitted to a third-party provider and
 *     may be processed outside Indonesia" is what can be evidenced.
 *
 * MALAY CHECK: `jangka waktu` / `masa simpan`, never `tempoh`. This document is
 * about retention on almost every line, so it is where that word would land.
 */
export function PrivacyId({ effective }: { effective: string }) {
  return (
    <LegalDoc title="Kebijakan Privasi" effective={effective}>
      <Clause id="1" n="1." title="Siapa kami dan cara menghubungi kami">
        <P>
          JMTarot dioperasikan oleh {OPERATOR.legalName}, Indonesia. Untuk pertanyaan apa pun
          tentang data pribadimu, tulis ke{' '}
          <a href={`mailto:${OPERATOR.contactEmail}`}>{OPERATOR.contactEmail}</a>.
        </P>
      </Clause>

      <Clause id="2" n="2." title="Apa yang kami kumpulkan">
        <SubClause id="2-1" n="2.1" title="Yang diberikan Google saat kamu masuk">
          <P>Empat hal dan satu penanda, tidak lebih:</P>
          <List
            items={[
              'Pengenal tetap yang Google berikan untuk akunmu. Ini identitas sebenarnya di sistem kami.',
              'Alamat emailmu.',
              'Penanda apakah menurut Google alamat itu sudah terverifikasi.',
              'Nama tampilan dan tautan foto profilmu.',
            ]}
          />
          <P>
            Bukan kata sandimu. Bukan kontak, kalender, atau apa pun yang lain &mdash; kami tidak
            meminta izin apa pun di luar itu.
          </P>
        </SubClause>

        <SubClause id="2-2" n="2.2" title="Yang kami tanyakan sekali di awal">
          <P>
            Nama lengkap, nama panggilan, tanggal lahir, dan enam pertanyaan pribadi. Salah satunya
            berbunyi: <em>&ldquo;Hal paling berat yang pernah kamu saksikan.&rdquo;</em>{' '}Kami
            mengutipnya di sini apa adanya, karena kebijakan yang menyebutnya &ldquo;refleksi
            pribadi tertentu&rdquo; lebih buruk daripada tidak ada kebijakan sama sekali.
          </P>
          <P>Empat hal yang perlu kamu tahu tentang jawaban itu:</P>
          <List
            items={[
              <>
                <strong>Boleh dilewati</strong>, dan aplikasi ini bekerja sepenuhnya tanpanya.
              </>,
              <>
                <strong>Disimpan dalam bentuk terenkripsi</strong>{' '}dengan AES-256-GCM, memakai
                kunci yang tidak ada di dalam kode program dan tidak ada di dalam basis data.
              </>,
              <>
                <strong>Hanya ringkasan abstraknya yang sampai ke model bahasa.</strong>{' '}Penyulingan
                itu diperintahkan untuk mengabstraksi, bukan mengulang: yang sampai ke sebuah bacaan
                berbentuk seperti &ldquo;membawa ingatan kehilangan yang berat&rdquo;, bukan
                peristiwanya. Nama orang yang kamu sebut tidak pernah ikut.
              </>,
              <>
                <strong>Bisa kamu hapus kapan saja</strong>, satu per satu, tanpa menghapus akun.
              </>,
            ]}
          />
          <P>
            Kenapa kami menanyakannya sama sekali, padahal kami menolak membaca kartu tentang hal
            serupa, dijelaskan di <Link href="/terms#7">Syarat &amp; Ketentuan klausul 7</Link>.
          </P>
        </SubClause>

        <SubClause id="2-3" n="2.3" title="Bacaan">
          <Callout>
            <P>
              <strong>Setiap bacaan disimpan dan tidak dihapus otomatis.</strong>{' '}Ini kebalikan dari
              perilaku versi lama aplikasi ini, yang tidak menyimpan bacaan sama sekali &mdash; jadi
              kalau kamu pengguna lama, ini berubah.
            </P>
          </Callout>
          <P>
            Yang disimpan: pembaca yang kamu pilih, jenis bacaannya, kartu yang keluar beserta
            posisinya tegak atau terbalik, pertanyaan yang kamu ketik, teks bacaannya, model yang
            menulisnya, dan tanggal kalender di perangkatmu.
          </P>
          <P>
            Alasannya satu dan terus terang: <strong>itulah yang membuat aplikasi ini mengingatmu</strong>{' '}
            &mdash; kesimpulan tentang kartu yang sering muncul, bacaan yang menyinggung bacaanmu
            sebelumnya, dan ringkasan harian dari si pembaca.
          </P>
        </SubClause>

        <SubClause id="2-4" n="2.4" title="Analitik">
          <P>
            Layar mana yang kamu buka, pembaca dan jenis bacaan mana yang kamu pilih, kapan, dan
            hasil setiap bacaan. Kami menyimpan kategori peristiwa, bukan teks bebas: tidak ada
            kalimat yang kamu ketik yang masuk ke catatan analitik.
          </P>
          <P>
            Tidak ada analitik pihak ketiga, tidak ada iklan, tidak ada piksel pelacak, dan tidak
            ada pelacakan lintas situs.
          </P>
        </SubClause>

        <SubClause id="2-5" n="2.5" title="Moderasi">
          <P>
            Kalau sebuah pertanyaan ditolak, kami mencatat pertanyaannya, kategorinya, apakah yang
            menolak adalah daftar kata atau pemeriksa otomatis, dan kapan &mdash; supaya kami bisa
            menemukan dan memperbaiki penolakan yang keliru.
          </P>
          <P>
            Teks pertanyaannya disimpan terenkripsi dan{' '}
            <strong>dihapus setelah {RETENTION.moderationQuestionDays} hari</strong>; kategori dan
            waktunya kami simpan seterusnya. Untuk kategori konten seksual yang melibatkan anak,
            teksnya <strong>tidak pernah disimpan sama sekali</strong>.
          </P>
        </SubClause>

        <SubClause id="2-6" n="2.6" title="Data teknis">
          <P>
            Cookie sesi (httpOnly, berisi pengenal akunmu dan waktu kedaluwarsanya), cookie bahasa,
            dan catatan permintaan yang disimpan penyedia hosting kami &mdash; alamat IP, jenis
            peramban, dan alamat halaman.
          </P>
          <P>
            {/*
              NEEDS VERIFICATION and deliberately hedged until it is done: Vercel's
              log retention period, and whether the platform logs POST bodies. We
              do not log question text ourselves, and the policy may only claim
              that if the platform does not either -- so it claims only our half.
            */}
            Kami sendiri tidak pernah mencatat isi pertanyaanmu ke dalam log.
          </P>
        </SubClause>
      </Clause>

      <Clause id="3" n="3." title="Kenapa kami memakainya">
        <List
          items={[
            'Data dari Google: supaya kamu bisa masuk dan supaya kami tahu akun ini akunmu.',
            'Jawaban awal: supaya bacaanmu terasa ditujukan kepadamu dan bukan kepada orang umum.',
            'Bacaan: supaya aplikasi ini mengingat apa yang sudah kamu tanyakan.',
            'Analitik: supaya kami tahu bagian mana yang rusak dan bagian mana yang dipakai.',
            'Moderasi: supaya penolakan yang keliru bisa ditemukan dan diperbaiki.',
          ]}
        />
        <P>
          Singkatnya: karena kamu memintanya, dan karena Layanan tidak bisa bekerja tanpanya.
        </P>
      </Clause>

      <Clause id="4" n="4." title="Siapa lagi yang melihatnya">
        <P>Tiga pihak, dan tidak ada yang lain.</P>

        <SubClause id="4-1" n="4.1" title={`Penyedia model bahasa (${PROVIDER.name})`}>
          <Callout>
            <P>
              <strong>Pertanyaanmu meninggalkan Indonesia.</strong>{' '}Untuk membuat setiap bacaan dan
              untuk memeriksa setiap pertanyaan, kami mengirimkan pertanyaanmu, kartu yang kamu
              tarik, dan ringkasan abstrak dari jawaban awalmu ke {PROVIDER.name}.
            </P>
          </Callout>
          <P>
            {/*
              RECONCILIATION §7.1, written to its three constraints. API-specific,
              opt-in, and no retention period or processing location asserted on
              the provider's behalf.
            */}
            <strong>
              Ketentuan API penyedia ini melarang penggunaan materi yang kami kirim untuk melatih
              atau memperbaiki model mereka, kecuali kami menyetujuinya secara tegas.
            </strong>{' '}
            Kami tidak pernah dan tidak akan menyetujuinya. Perlindungan ini melekat pada layanan
            API yang kami pakai, bukan pada produk konsumen mereka. Sumbernya:{' '}
            <a href={PROVIDER.termsUrl} target="_blank" rel="noreferrer">
              {PROVIDER.termsLabel}
            </a>
            , diperiksa {PROVIDER.verifiedOn}.
          </P>
          <P>
            Dua hal yang tidak bisa kami janjikan atas nama mereka, karena mereka memang tidak
            menyatakannya: <strong>berapa lama mereka menyimpan</strong>{' '}materi yang dikirim lewat
            API, dan <strong>di negara mana</strong>{' '}materi itu diproses. Ketentuan umum mereka
            memang menyebut kemungkinan pemrosesan di luar wilayah tempat kamu mengakses layanan.
            Kami menuliskan ini sebagai hal yang belum diketahui, bukan menebaknya.
          </P>
        </SubClause>

        <SubClause id="4-2" n="4.2" title="Google">
          <P>
            Hanya untuk proses masuk. Kami tidak mengirimkan apa pun tentang bacaanmu kepada
            Google.
          </P>
        </SubClause>

        <SubClause id="4-3" n="4.3" title="Penyedia hosting">
          <P>Vercel menjalankan aplikasi ini, sehingga setiap permintaan melewati mereka.</P>
        </SubClause>

        {/*
          4.4. **SHARING IS LITERALLY A FOURTH ANSWER TO "WHO ELSE SEES IT"**, so
          it goes here rather than in a new section. One new anchor per locale,
          nothing renumbered, and it is where a reader looking for it would look.

          THE SECOND PARAGRAPH IS THE ONE THAT MATTERS AND IT IS NEW GROUND: a
          share-page visitor is a THIRD PARTY who never agreed to anything, and
          §2.4/§2.6 describe an account-holder's analytics. What we say has to be
          exactly true of what the code does. `/s/` IS excluded from middleware's
          `jmt_locale` write and `share.viewed` DOES carry no `session_id` -- but
          the first draft of this clause said "no cookie at all", and MEASURING IT
          against a real dev server showed two `authjs.*` cookies on every matched
          path, `/terms` and `/login` included. They are @auth/core's, they are set
          by the middleware wrapper before any of our code runs, and they carry no
          identity -- so the honest sentence names them rather than omitting them.
          Written down because the false version was more flattering and read
          perfectly well.
        */}
        <SubClause id="4-4" n="4.4" title="Siapa pun yang kamu kirimi tautan">
          <P>
            Kalau kamu membuat tautan bagikan untuk sebuah bacaan, halaman itu bisa dibuka siapa
            pun yang punya alamatnya, tanpa akun. Yang terlihat: kartu-kartunya, arah kartunya,
            teks bacaannya, nama pembacanya, tanggalnya,{' '}
            <strong>dan pertanyaan yang kamu tulis</strong> &mdash; pertanyaannya ikut supaya
            bacaannya bisa diikuti. Sebelum tautannya dibuat, halaman itu kami tampilkan dulu
            kepadamu apa adanya, jadi kamu tahu persis apa yang akan terbaca. Rinciannya ada di{' '}
            <Link href="/terms#18">ketentuan klausul 18</Link>.
          </P>
          <P>
            Orang yang membuka halaman itu <strong>ikut tercatat, tanpa identitas</strong>. Kami
            menambah satu hitungan pada tautannya, dan mencatat satu peristiwa{' '}
            <em>share.viewed</em> yang tidak terhubung ke akun mana pun &mdash; tanpa id akun,
            tanpa id sesi.{' '}
            <strong>
              Kami tidak menaruh cookie bahasa di peramban mereka, tidak seperti halaman lain
            </strong>{' '}
            &mdash; sehingga tidak ada apa pun yang bisa dipakai untuk menghubungkan satu kunjungan
            dengan kunjungan lain. Yang tetap ada hanyalah dua cookie teknis dari pustaka masuk
            akun, yang berlaku di seluruh situs: satu token pengaman formulir dan satu alamat
            kembali. Keduanya tidak berisi identitas dan tidak menyimpan sesi. Yang kami dapat
            adalah sebuah angka, bukan sebuah jejak.
          </P>
          <P>
            Gambar pratinjau yang dibuat aplikasi pesan berisi kartu dan nama pembacanya saja
            &mdash; <strong>tidak berisi pertanyaanmu dan tidak berisi teks bacaannya</strong>,
            meskipun keduanya ada di halamannya. Itu disengaja: gambar pratinjau disimpan setiap
            aplikasi pesan yang melihat tautannya, sebelum ada yang membukanya. Kami tidak mengatur
            berapa lama aplikasi itu menyimpan gambarnya.
          </P>
        </SubClause>

        <P>
          <strong>
            Tidak ada pengiklan, tidak ada pialang data, dan tidak ada penjualan data dalam bentuk
            apa pun.
          </strong>{' '}
          Kami menuliskannya secara tegas karena banyak orang menganggap yang sebaliknya.
        </P>
      </Clause>

      <Clause id="5" n="5." title="Keamanan">
        <P>
          Jawaban awal yang bersifat sensitif dan teks pertanyaan yang ditolak dienkripsi di tempat
          penyimpanan dengan AES-256-GCM. Semua lalu lintas memakai TLS. Kuncinya hanya ada di
          lingkungan tempat aplikasi dijalankan, tidak di dalam kode dan tidak di dalam basis data.
        </P>
        <P>
          Batasnya kami sebutkan juga, karena klaim keamanan tanpa batas adalah klaim yang tidak
          jujur: enkripsi kolom melindungi dari salinan basis data yang bocor, bukan dari aplikasi
          yang sedang berjalan dan berhasil dibobol.
        </P>
      </Clause>

      <Clause id="6" n="6." title="Berapa lama kami menyimpannya">
        <List
          items={[
            'Akun, profil, jawaban awal, dan avatar Lotus: selama akunmu ada.',
            <>
              <strong>Bacaan dan kartunya: selama akunmu ada</strong>, dan sengaja tidak mengikuti
              jangka waktu di bawah &mdash; setiap fitur ingatan membacanya.
            </>,
            'Ringkasan harian: selama akunmu ada.',
            <>
              Catatan analitik: <strong>{RETENTION.eventsDays} hari</strong>, lalu dihapus.
            </>,
            <>
              Catatan moderasi: teks pertanyaannya{' '}
              <strong>{RETENTION.moderationQuestionDays} hari</strong>, barisnya sendiri
              seterusnya tanpa teks.
            </>,
            <>
              Tautan bagikan: selama akunmu ada.{' '}
              <strong>Tautan yang dimatikan tetap disimpan dalam keadaan mati</strong>, tidak
              dihapus, supaya alamat itu tidak bisa diberikan lagi ke bacaan lain.
            </>,
          ]}
        />
      </Clause>

      <Clause id="7" n="7." title="Pilihanmu">
        <List
          items={[
            'Melewati pertanyaan awal mana pun.',
            'Menghapus satu jawaban belakangan, tanpa menghapus akun.',
            'Mengganti bahasa aplikasi kapan saja.',
            <>
              Mematikan tautan bagikan, dari bacaan yang sama tempat kamu membuatnya.{' '}
              <strong>Mematikannya tidak menarik kembali tangkapan layar</strong> yang sudah
              diambil orang.
            </>,
            'Menghapus akunmu.',
          ]}
        />
      </Clause>

      <Clause id="8" n="8." title="Menghapus akunmu, secara persis">
        <P>
          Saat kamu meminta penghapusan, akunmu langsung berhenti bekerja dan datamu tidak lagi bisa
          dijangkau lewat aplikasi. Teks pertanyaan yang pernah ditolak{' '}
          <strong>dihapus saat itu juga</strong>, tanpa menunggu jangka waktu{' '}
          {RETENTION.moderationQuestionDays}{' '}hari.
        </P>
        <P>
          <strong>Dalam {RETENTION.erasureGraceDays} hari</strong>{' '}berikutnya, penghapusan
          sesungguhnya dijalankan: profil, jawaban awal, avatar Lotus, seluruh bacaan dan kartunya,
          serta ringkasan harian dihapus dari basis data. Dalam jangka waktu itu kamu masih bisa
          membatalkannya dengan masuk kembali.
        </P>
        <P>
          Yang tetap ada: catatan analitik dan catatan moderasi, tanpa kaitan ke akunmu &mdash;
          kolom penggunanya dikosongkan, dan catatan moderasi sudah tidak berisi teks. Kami
          menyebutkannya karena mengatakan &ldquo;semua data kamu dihapus&rdquo; tidak akan benar,
          dan orang memeriksanya.
        </P>
      </Clause>

      <Clause id="9" n="9." title="Anak-anak">
        <P>
          Layanan ini untuk usia 18 tahun ke atas; lihat{' '}
          <Link href="/terms#3">Syarat &amp; Ketentuan klausul 3</Link>. Kalau kamu yakin ada anak
          di bawah umur yang punya akun di sini, beri tahu kami di{' '}
          <a href={`mailto:${OPERATOR.contactEmail}`}>{OPERATOR.contactEmail}</a>{' '}dan akun itu kami
          hapus.
        </P>
      </Clause>

      <Clause id="10" n="10." title="Perubahan kebijakan ini">
        <P>
          Kebijakan ini bernomor versi bersama Syarat &amp; Ketentuan. Perubahan yang berarti
          diumumkan di dalam aplikasi dan meminta persetujuanmu lagi.
        </P>
      </Clause>

      <Clause id="11" n="11." title="Kenapa kami bertanya hal berat tapi menolak membacanya">
        <P>
          Versi lengkapnya ada di{' '}
          <Link href="/terms#7">Syarat &amp; Ketentuan klausul 7</Link>. Singkatnya: yang satu
          pertanyaan tertutup yang boleh kamu lewati dan hanya kami simpan; yang lain permintaan
          nasihat terbuka tentang keselamatanmu, yang akan dijawab oleh model bahasa tanpa
          kualifikasi apa pun. Kami bersedia mendengar, tidak bersedia menebak.
        </P>
      </Clause>

      <Clause id="12" n="12." title="Bahasa">
        <Callout>
          <P>
            Kebijakan ini tersedia dalam Bahasa Indonesia dan bahasa Inggris.{' '}
            <strong>Versi Bahasa Indonesia yang berlaku.</strong>
          </P>
        </Callout>
      </Clause>
    </LegalDoc>
  );
}
