import type { ServiceId, YesNo } from '@/data/types';
import { midpoint, type LengthBudget } from './budget';

/** How the code-derived verdict is spelled to the model and to the querent. */
export const VERDICT_WORD_ID: Record<YesNo, string> = {
  yes: 'Ya',
  no: 'Tidak',
  maybe: 'Belum jelas',
};

/**
 * The task layer, in Indonesian. Moved here verbatim by W6 Task 9.
 *
 * Word counts are given as a range rather than a number because models treat
 * an exact count as a target to pad toward, and padding is the main way a
 * short reading goes bad.
 *
 * THE NUMBERS COME FROM `LENGTH_BUDGET` NOW, INTERPOLATED. They used to be typed
 * into the prose -- `40` twice and `130` once -- and Task 11's smoke assertion
 * would have carried its own copy. `LENGTH_BUDGET` is the one place, so "re-verify
 * the word counts" becomes a thing you run rather than a thing you remember, and
 * the number in the prompt cannot drift from the number in the check. The rendered
 * text is byte-identical to what was typed there, which the snapshot proves.
 */
export function servicePromptId(
  service: ServiceId,
  budget: Record<ServiceId, LengthBudget>,
  verdict?: YesNo,
): string {
  const b = budget[service];
  switch (service) {
    case 'daily':
      return `TUGASMU: bacaan Kartu Harian, satu kartu.

PANJANG: tepat dua paragraf, masing-masing 2 sampai 4 kalimat. Jangan lebih.

Paragraf pertama: energi hari ini lewat kartu itu.
Paragraf kedua: satu hal kecil yang konkret untuk diperhatikan hari ini. Satu saja, bukan daftar.

Tutup dengan membumi. Ini satu hari, bukan seluruh hidup, dan nada penutupmu harus terasa seukuran itu -- bukan ramalan besar, bukan janji.`;

    case 'spread3':
      return `TUGASMU: bacaan Tiga Kartu.

PANJANG: tepat empat paragraf. Tiap paragraf 2 sampai 3 kalimat DAN maksimal ${b.maxParagraphWords} kata -- yang mana pun tercapai lebih dulu, di situ paragrafnya berhenti. Seluruh bacaan jadi sekitar ${midpoint(b)} kata. Ini bacaan pendek; kalau bisa lebih ringkas, lebih baik.

Batas 40 kata itu berlaku untuk semua pembaca, termasuk yang gayanya berkalimat panjang dan beranak kalimat. Kalau kalimatmu memang panjang, tulis dua kalimat saja di paragraf itu, bukan tiga; jangan lewati batas katanya.

Cara memendekkannya: satu gagasan per paragraf, bukan tiga. Jangan mengulang gagasan yang sama dengan kalimat lain, jangan menjelaskan ulang apa arti kartunya setelah kamu sudah mengatakannya, dan buang perumpamaan kedua kalau perumpamaan pertama sudah kena.

Tiga paragraf pertama untuk tiga posisi, sesuai urutannya. MULAILAH tiap paragraf dengan nama posisinya persis seperti yang tertulis di pesan berikutnya, lalu lanjutkan kalimatnya. Jangan menggantinya dengan "masa lalu", "masa kini", atau "masa depan".

SEBUT nama kartunya di kalimat pertama paragraf itu juga, persis seperti tertulis, dan tambahkan "(terbalik)" kalau kartunya terbalik. Memendekkan bacaan bukan alasan untuk menghilangkan nama kartu: penanya melihat kartunya di layar dan harus tahu paragraf mana bicara tentang yang mana.

Paragraf keempat -- dan ini bagian terpenting -- MENYATUKAN ketiganya menjadi satu benang merah. Bukan ringkasan yang mengulang tiga paragraf tadi, melainkan satu pengertian yang hanya muncul kalau ketiga kartu dibaca bersama-sama: bagaimana yang pertama menjelaskan yang kedua, dan ke mana keduanya mengarahkan yang ketiga. Paragraf ini juga tetap 2 sampai 3 kalimat dan maksimal ${b.maxParagraphWords} kata.

Kalau ketiga kartu tampak bertentangan, jangan diperhalus. Pertentangan itu justru sering isi bacaannya.`;

    case 'yesno': {
      const word = verdict ? VERDICT_WORD_ID[verdict] : VERDICT_WORD_ID.maybe;
      return `TUGASMU: bacaan Ya atau Tidak, satu kartu.

JAWABANNYA SUDAH DITENTUKAN: "${word}".

Jawaban itu berasal dari kartu dan orientasinya, bukan dari penilaianmu. Kamu TIDAK boleh mengubahnya, melunakkannya, atau membantahnya di kalimat berikutnya.

Mulai bacaanmu dengan kata "${word}" sebagai kata pertama. Lalu 2-3 kalimat tentang mengapa kartu ini berkata begitu.

PANJANG: satu paragraf, 3 sampai 4 kalimat. Singkat memang wujud layanan ini.${
        verdict === 'maybe'
          ? '\n\n"Belum jelas" bukan sikap ragu-ragu darimu. Itu memang isi kartunya: keadaannya belum matang untuk dijawab. Katakan begitu dengan yakin, dan sebutkan apa yang masih perlu terjadi.'
          : ''
      }`;
    }

    default: {
      const exhaustive: never = service;
      throw new Error(`Unknown service: ${String(exhaustive)}`);
    }
  }
}
