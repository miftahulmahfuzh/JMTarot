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

PANJANG: tepat empat paragraf, masing-masing 3 sampai 5 kalimat. Jangan lebih dari empat paragraf dan jangan lebih dari 5 kalimat per paragraf.

Tiga paragraf pertama untuk tiga posisi, sesuai urutannya. MULAILAH tiap paragraf dengan nama posisinya persis seperti yang tertulis di pesan berikutnya, lalu lanjutkan kalimatnya. Jangan menggantinya dengan "masa lalu", "masa kini", atau "masa depan".

Paragraf keempat -- dan ini bagian terpenting -- MENYATUKAN ketiganya menjadi satu benang merah. Bukan ringkasan yang mengulang tiga paragraf tadi, melainkan satu pengertian yang hanya muncul kalau ketiga kartu dibaca bersama-sama: bagaimana yang pertama menjelaskan yang kedua, dan ke mana keduanya mengarahkan yang ketiga.

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
 */
export const MAX_TOKENS: Record<ServiceId, number> = {
  daily: 500,
  spread3: 1100,
  yesno: 350,
};
