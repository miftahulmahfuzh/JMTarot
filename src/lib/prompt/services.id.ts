import 'server-only';

import type { ServiceId, YesNo } from '@/data/types';
import { CHOICE_MARKER } from '../reading/choice';
import { midpoint, type LengthBudget } from './budget';

/** How the code-derived verdict is spelled to the model and to the querent. */
export const VERDICT_WORD_ID: Record<YesNo, string> = {
  yes: 'Ya',
  no: 'Tidak',
  maybe: 'Belum jelas',
};

/**
 * CHOOSE ONE (Miftah's ruling, 2026-07-29).
 *
 * The report was a reading of *"mending makan ayam atau ikan nanti siang?"* that
 * spent four paragraphs on surrender and appetite and never said ayam or ikan. A
 * reader who will not choose between two lunches is not being mystical, it is
 * being useless, and that is the one thing a tarot app can be about a question
 * this small.
 *
 * ── WHY THIS IS IN THE TASK LAYER AND NOT `base.{id,en}.ts` ──────────────────
 *
 * It reads like a base-contract rule and it is not, for two reasons that each
 * decide it on their own:
 *
 *   1. **IT MUST NOT REACH `yesno`.** That service's answer is already decided in
 *      code by `effectiveYesNo()` and the prompt hands the model the word. A
 *      second answer line there gives one reading TWO verdict boxes, and they
 *      would disagree -- `Ya` is not an answer to "ayam atau ikan". So the rule is
 *      interpolated into `daily` and `spread3` and nowhere else.
 *   2. **`BASE_CONTRACT` IS SHARED WITH THE THREE SIDE PROMPTS** via
 *      `FORMAT_RULES` -- the gist, the day summary and the frequency verdict -- and
 *      not one of them reads a question. A rule about `<pertanyaan>` in a contract
 *      used by prompts that have none is a rule applied to nothing.
 *
 * ── WHERE IT SITS INSIDE EACH TASK, WHICH IS NOT ARBITRARY ───────────────────
 *
 * After the LENGTH block and BEFORE the structural instructions, so the word
 * ceiling stays the most recent thing the model has read when it starts writing.
 * That is `build.ts`'s dilution argument for putting the memory instruction last,
 * applied in the opposite direction: appending this at the end would displace
 * `spread3`'s closing restatement of the ceiling, which exists because all three
 * readers overran paragraph four until it was added.
 *
 * ── THE MARKER LINE ──────────────────────────────────────────────────────────
 *
 * `PILIHAN:` is ONE TOKEN IN BOTH LOCALES and is `CHOICE_MARKER`, imported rather
 * than typed -- the lesson this file already paid for with `Batas 40 kata`, where
 * three of four copies of a number were replaced by a constant and the fourth
 * stood for a release. A marker spelled here and parsed there is the same defect
 * with a worse symptom: the querent reads `PILIHAN: Ayam` above their reading.
 *
 * **"Salin PERSIS" IS A PROMPT RULE AND IS NOT TRUSTED.** `validateChoice` refuses
 * anything that is not a word-bounded slice of the question, so the instruction
 * buys a higher hit rate and nothing else. See `@/lib/reading/choice`.
 */
const CHOICE_RULE_ID = `PERTANYAAN YANG MENAWARKAN PILIHAN:
Kalau di dalam <pertanyaan> penanya menyebutkan dua pilihan atau lebih -- "A atau B", "A apa B", tiga sekaligus, apa pun bentuknya -- kamu WAJIB memilih SATU. Bukan dua, bukan "dua-duanya baik", bukan "tergantung kamu", bukan "yang mana pun yang terasa benar". Kartunya yang memilih; kamu yang menyampaikan.
Sebut pilihan itu di PARAGRAF TERAKHIR, dengan kata yang sama seperti yang ditulis penanya. Bukan di mana saja, bukan tersirat -- di paragraf terakhir, supaya bacaannya sendiri yang menjawab, bukan cuma baris di atasnya. Orang yang cuma membaca prosanya harus bisa tahu kamu memilih apa.
Lalu, TERPISAH dari itu, tulis satu baris penanda sebagai BARIS PALING PERTAMA dari jawabanmu -- sebelum paragraf pertama, bukan di tengah, dan JANGAN PERNAH di akhir. Setelah baris itu, satu baris kosong, baru bacaannya:

${CHOICE_MARKER} <satu pilihan saja, disalin persis dari pertanyaannya>

Baris penanda itu bukan bagian dari bacaan dan tidak masuk hitungan batas kata. Salin pilihannya PERSIS seperti tertulis di pertanyaan: jangan diterjemahkan, jangan dibetulkan ejaannya, jangan ditambahi kata apa pun.
Yang ditulis di baris itu HANYA nama satu pilihan, sesingkat mungkin -- misalnya "ayam", bukan "makan ayam atau ikan nanti siang". Kalau di baris itu masih ada kata "atau" atau "apa", berarti kamu belum memilih. Jangan menyalin seluruh pertanyaannya, dan jangan menyebut pilihan yang tidak kamu ambil.
Kalau <pertanyaan> tidak menawarkan pilihan apa pun, JANGAN tulis baris itu. Mulai langsung dari bacaannya.`;

/**
 * The task layer, in Indonesian. Moved here verbatim by W6 Task 9.
 *
 * Word counts are given as a range rather than a number because models treat
 * an exact count as a target to pad toward, and padding is the main way a
 * short reading goes bad.
 *
 * THE NUMBERS COME FROM `LENGTH_BUDGET` NOW, INTERPOLATED. They used to be typed
 * into the prose -- `40` FOUR times and `130` once -- and Task 11's smoke assertion
 * would have carried its own copy. `LENGTH_BUDGET` is the one place, so "re-verify
 * the word counts" becomes a thing you run rather than a thing you remember, and
 * the number in the prompt cannot drift from the number in the check. The rendered
 * text is byte-identical to what was typed there, which the snapshot proves.
 *
 * TASK 9 CAUGHT ONLY THREE OF THE FOUR. It replaced "maksimal 40 kata" (twice) and
 * "sekitar 130 kata", and left "Batas 40 kata" standing -- a literal that would have
 * stayed at 40 while the constant moved, in the one sentence whose whole job is to
 * bind the ceiling on the long-sentence reader. Found by grepping for `\b40\b` after
 * a tuning pass, not by reading the file. Grep for the number, not for the phrase.
 */
export function servicePromptId(
  service: ServiceId,
  b: LengthBudget,
  verdict?: YesNo,
): string {
  switch (service) {
    case 'daily':
      return `TUGASMU: bacaan Kartu Harian, satu kartu.

PANJANG: tepat dua paragraf. Tiap paragraf 2 sampai 3 kalimat DAN maksimal ${b.maxParagraphWords} kata -- yang mana pun tercapai lebih dulu, di situ paragrafnya berhenti. Batas katanya yang menang, bukan jumlah kalimatnya.

${CHOICE_RULE_ID}

Paragraf pertama: energi hari ini lewat kartu itu.
Paragraf kedua: satu hal kecil yang konkret untuk diperhatikan hari ini. Satu saja, bukan daftar.

Tutup dengan membumi. Ini satu hari, bukan seluruh hidup, dan nada penutupmu harus terasa seukuran itu -- bukan ramalan besar, bukan janji.`;

    case 'spread3':
      return `TUGASMU: bacaan Tiga Kartu.

PANJANG: tepat empat paragraf. Tiap paragraf 1 sampai 2 kalimat DAN maksimal ${b.maxParagraphWords} kata -- yang mana pun tercapai lebih dulu, di situ paragrafnya berhenti. Seluruh bacaan jadi sekitar ${midpoint(b)} kata. Ini bacaan pendek; kalau bisa lebih ringkas, lebih baik.

Batas ${b.maxParagraphWords} kata itu berlaku untuk semua pembaca, termasuk yang gayanya berkalimat panjang dan beranak kalimat. Kalau kalimatmu memang panjang, tulis SATU kalimat saja di paragraf itu, bukan dua. Satu kalimat panjang yang masih di dalam batas kata lebih baik daripada dua kalimat yang melewatinya. Batas katanya yang menang, bukan jumlah kalimatnya.

Cara memendekkannya: satu gagasan per paragraf, bukan tiga. Jangan mengulang gagasan yang sama dengan kalimat lain, jangan menjelaskan ulang apa arti kartunya setelah kamu sudah mengatakannya, dan buang perumpamaan kedua kalau perumpamaan pertama sudah kena.

${CHOICE_RULE_ID}

Tiga paragraf pertama untuk tiga posisi, sesuai urutannya. MULAILAH tiap paragraf dengan nama posisinya persis seperti yang tertulis di pesan berikutnya, lalu lanjutkan kalimatnya. Jangan menggantinya dengan "masa lalu", "masa kini", atau "masa depan".

SEBUT nama kartunya di kalimat pertama paragraf itu juga, persis seperti tertulis, dan tambahkan "(terbalik)" kalau kartunya terbalik. Memendekkan bacaan bukan alasan untuk menghilangkan nama kartu: penanya melihat kartunya di layar dan harus tahu paragraf mana bicara tentang yang mana.

Paragraf keempat -- dan ini bagian terpenting -- MENYATUKAN ketiganya menjadi satu benang merah. Bukan ringkasan yang mengulang tiga paragraf tadi, melainkan satu pengertian yang hanya muncul kalau ketiga kartu dibaca bersama-sama: bagaimana yang pertama menjelaskan yang kedua, dan ke mana keduanya mengarahkan yang ketiga. Paragraf ini juga tetap 1 sampai 2 kalimat dan maksimal ${b.maxParagraphWords} kata.

Kalau ketiga kartu tampak bertentangan, jangan diperhalus. Pertentangan itu justru sering isi bacaannya.

EMPAT paragraf, bukan tiga. Paragraf keempat wajib ada; tanpa penyatuan itu, bacaan ini cuma tiga keterangan kartu yang berdiri sendiri.
Dan paragraf keempat TIDAK lebih panjang dari tiga paragraf sebelumnya: maksimal ${b.maxParagraphWords} kata, sama seperti yang lain.`;

    case 'yesno': {
      const word = verdict ? VERDICT_WORD_ID[verdict] : VERDICT_WORD_ID.maybe;
      return `TUGASMU: bacaan Ya atau Tidak, satu kartu.

JAWABANNYA SUDAH DITENTUKAN: "${word}".

Jawaban itu berasal dari kartu dan orientasinya, bukan dari penilaianmu. Kamu TIDAK boleh mengubahnya, melunakkannya, atau membantahnya di kalimat berikutnya.

Mulai bacaanmu dengan kata "${word}" sebagai kata pertama. Lalu 1-2 kalimat tentang mengapa kartu ini berkata begitu.

PANJANG: satu paragraf, 2 sampai 3 kalimat DAN maksimal ${b.maxParagraphWords} kata -- yang mana pun tercapai lebih dulu. Singkat memang wujud layanan ini.${
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
