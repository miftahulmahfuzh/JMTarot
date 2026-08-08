/**
 * THE INDONESIAN HALF OF THE NOTE TABLE. **The source language** — write these first,
 * and a red typecheck in `notes.en.ts` is the feature (`## Localization` rule 2).
 *
 * ── WHAT A NOTE IS, AND WHAT IT IS NOT (`[F5-9]`) ─────────────────────────
 *
 * A note **names a subject**. It is not a sentence for a reader to say, not an
 * instruction, and not an opinion about what the material means. `effectiveYesNo()`'s
 * rule in a fourth place: where code knows something, code states it and the model
 * decides how to say it.
 *
 * *Failure mode if that slips.* A model handed a sentence paraphrases it, and three
 * readers handed the same sentence paraphrase it three ways in one run — which is the
 * room agreeing with itself in three voices, the panel `C-N1c` forbids.
 *
 * ── FLAT REGISTER ON PURPOSE ──────────────────────────────────────────────
 *
 * These are the only F5 strings a model reads, and they are deliberately the dullest
 * prose in the release. Every word the querent eventually reads comes from
 * `CHAT_READER_PROMPTS_ID`; a note that had any warmth in it would leak that warmth
 * into all three readers identically.
 *
 * **Indonesian, never Malay.** The smoke script greps the eleven, and these lines are
 * inside a prompt the model may echo the vocabulary of.
 */
import type { MaterialNotes } from './notes';

export const MATERIAL_NOTES_ID: MaterialNotes = {
  /*
   * The cards, the service and the day are in `facts`. The note says only what KIND of
   * event this was, because a note that also listed the cards would put the same nouns
   * in the prompt twice — which is how a model decides they are the point.
   */
  reading: () => 'hal baru sejak ruangan ini terakhir bicara: penanya selesai menarik kartu',

  unanswered: () => 'ada pertanyaan pembaca yang menggantung, penanya belum menjawabnya',

  /*
   * **"lanjutkan, jangan tanya kabar"** is the one note that carries a direction, and
   * it is here because M3's whole risk is the register: this material is legitimate
   * when a reader has something to ADD and illegitimate as an *"anyone there?"*. Naming
   * the subject alone would leave the second reading available.
   */
  orphan: () => 'ada pesan pembaca yang tidak dibalas siapa pun; bahannya untuk dilanjutkan, bukan untuk menagih',

  recurring: () =>
    'hal baru sejak ruangan ini terakhir bicara: satu kartu terus muncul di bacaan penanya',

  occasion: (m) =>
    m.occasion === 'birthday'
      ? 'hal baru hari ini: ulang tahun penanya'
      : m.occasion === 'first_reading_anniversary'
        ? 'hari ini genap setahun sejak bacaan pertama penanya'
        : 'penanya muncul lagi setelah lama tidak ke sini',

  lotus: (m) =>
    `hal baru sejak ruangan ini terakhir bicara: gambaran diri penanya berubah — ${m.summary}`,
};
