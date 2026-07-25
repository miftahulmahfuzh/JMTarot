import type { ServiceId, YesNo } from '@/data/types';

/** How the code-derived verdict is spelled to the model and to the querent. */
export const VERDICT_WORD: Record<YesNo, string> = {
  yes: 'Ya',
  no: 'Tidak',
  maybe: 'Belum jelas',
};

/**
 * The task layer: what this particular reading has to accomplish.
 *
 * Word counts are given as a range rather than a number because models treat
 * an exact count as a target to pad toward, and padding is the main way a
 * short reading goes bad.
 */
export function servicePrompt(service: ServiceId, verdict?: YesNo): string {
  switch (service) {
    case 'daily':
      return `TUGASMU: bacaan Kartu Harian, satu kartu.

PANJANG: tepat dua paragraf, masing-masing 2 sampai 4 kalimat. Jangan lebih.

Paragraf pertama: energi hari ini lewat kartu itu.
Paragraf kedua: satu hal kecil yang konkret untuk diperhatikan hari ini. Satu saja, bukan daftar.

Tutup dengan membumi. Ini satu hari, bukan seluruh hidup, dan nada penutupmu harus terasa seukuran itu -- bukan ramalan besar, bukan janji.`;

    case 'spread3':
      return `TUGASMU: bacaan Tiga Kartu.

PANJANG: tepat empat paragraf. Tiap paragraf 2 sampai 3 kalimat DAN maksimal 40 kata -- yang mana pun tercapai lebih dulu, di situ paragrafnya berhenti. Seluruh bacaan jadi sekitar 130 kata. Ini bacaan pendek; kalau bisa lebih ringkas, lebih baik.

Batas 40 kata itu berlaku untuk semua pembaca, termasuk yang gayanya berkalimat panjang dan beranak kalimat. Kalau kalimatmu memang panjang, tulis dua kalimat saja di paragraf itu, bukan tiga; jangan lewati batas katanya.

Cara memendekkannya: satu gagasan per paragraf, bukan tiga. Jangan mengulang gagasan yang sama dengan kalimat lain, jangan menjelaskan ulang apa arti kartunya setelah kamu sudah mengatakannya, dan buang perumpamaan kedua kalau perumpamaan pertama sudah kena.

Tiga paragraf pertama untuk tiga posisi, sesuai urutannya. MULAILAH tiap paragraf dengan nama posisinya persis seperti yang tertulis di pesan berikutnya, lalu lanjutkan kalimatnya. Jangan menggantinya dengan "masa lalu", "masa kini", atau "masa depan".

SEBUT nama kartunya di kalimat pertama paragraf itu juga, persis seperti tertulis, dan tambahkan "(terbalik)" kalau kartunya terbalik. Memendekkan bacaan bukan alasan untuk menghilangkan nama kartu: penanya melihat kartunya di layar dan harus tahu paragraf mana bicara tentang yang mana.

Paragraf keempat -- dan ini bagian terpenting -- MENYATUKAN ketiganya menjadi satu benang merah. Bukan ringkasan yang mengulang tiga paragraf tadi, melainkan satu pengertian yang hanya muncul kalau ketiga kartu dibaca bersama-sama: bagaimana yang pertama menjelaskan yang kedua, dan ke mana keduanya mengarahkan yang ketiga. Paragraf ini juga tetap 2 sampai 3 kalimat dan maksimal 40 kata.

Kalau ketiga kartu tampak bertentangan, jangan diperhalus. Pertentangan itu justru sering isi bacaannya.`;

    case 'yesno': {
      const word = verdict ? VERDICT_WORD[verdict] : VERDICT_WORD.maybe;
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

/**
 * Output budget per service.
 *
 * Generous relative to the word counts above -- Indonesian runs longer in
 * tokens than English, and a reading cut off mid-sentence is far worse than a
 * few unused tokens.
 *
 * spread3 was 1100, for a four-paragraph reading of 3-5 sentences each. That
 * came back at ~330 words, which is more than anyone reads on a phone; the task
 * now asks for 140-180 and the ceiling came down with it. Still roughly double
 * what 180 Indonesian words cost, because the ceiling is a guard against a
 * runaway generation, not the length control -- the prompt is.
 */
export const MAX_TOKENS: Record<ServiceId, number> = {
  daily: 500,
  spread3: 650,
  yesno: 350,
};
