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
import type { UserMemoryKind } from '@/lib/memory/profile/types';
import { CHAT_TIME_VOCAB, WEEKDAYS } from '../clock';
import type { MaterialNotes } from './notes';

/**
 * What a remembered fact is ABOUT, as a subject and never as a fact.
 *
 * Every line here names a topic; **none of them says anything the room actually knows.**
 * That is the seam: the sentence itself lives in phase 5's fenced `<ingatan>`, in front of
 * the reader who has to say it.
 *
 * Keyed by phase 3's `UserMemoryKind` — **one vocabulary, and it is the one persisted in
 * `user_memory.items`** (reconciliation ruling 4). A second closed set describing the same
 * item is two sets that drift.
 */
export const PROFILE_SUBJECT_ID: Record<UserMemoryKind, string> = {
  habit: 'rutinitas harian penanya',
  taste: 'apa yang disukai penanya',
  person: 'orang-orang di sekitar penanya',
  situation: 'hal yang sedang berjalan di hidup penanya',
  place: 'tempat yang sering didatangi penanya',
  trait: 'bagaimana penanya menggambarkan dirinya',
  other: 'sesuatu tentang penanya',
};

/*
 * **THE DAY WORDS ARE NOT DECLARED HERE.** `CHAT_TIME_VOCAB` in `@/lib/chat/clock` is the
 * one table for the release (reconciliation ruling 3): phase 2's `<waktu>` block states the
 * querent's weekday and hour to the voices and this note states it to the director, and two
 * independent lists is how one run says *"Monday morning"* on one line and *"siang"* on
 * another — which reads to a model as two claims about the same clock.
 */

export const MATERIAL_NOTES_ID: MaterialNotes = {
  /*
   * The cards, the service and the day are in `facts`. The note says only what KIND of
   * event this was, because a note that also listed the cards would put the same nouns
   * in the prompt twice — which is how a model decides they are the point.
   */
  reading: () => 'hal baru sejak ruangan ini terakhir bicara: penanya selesai menarik kartu',

  /*
   * **THE DIRECTION IS PART OF THE SUBJECT HERE, FOR `orphan`'s REASON AND FROM A
   * MEASUREMENT.** With the note stating only the state — *a question is hanging* — glm-5.2
   * answered `{"beats":[]}`, and that reading is coherent: the last thing said in the room
   * was a reader's question, the querent has not replied, so there is nothing to reply to.
   * `silence_on_proactive` caught it, `planFallback` would have covered it, and **a run that
   * needs the fallback every time is a prompt that is not landing.**
   *
   * `C-N1d`: *a reader who asks and then never refers to the answer is worse than one who
   * never asked* — and §7.3's own inverse, *a reader who asks and then CHASES is worse than
   * both*. So the note names the move and refuses the other one, which is exactly what the
   * `orphan` note does and for the same reason: on both materials the risk is the register.
   */
  unanswered: () =>
    'ada pertanyaan pembaca yang menggantung; bahannya untuk mendekati pertanyaan itu dari sisi lain, bukan untuk menagih jawabannya',

  /*
   * **"lanjutkan, jangan tanya kabar"** is the one note that carries a direction, and
   * it is here because M3's whole risk is the register: this material is legitimate
   * when a reader has something to ADD and illegitimate as an *"anyone there?"*. Naming
   * the subject alone would leave the second reading available.
   */
  orphan: () => 'ada pesan pembaca yang tidak dibalas siapa pun; bahannya untuk dilanjutkan, bukan untuk menagih',

  /*
   * **THE ONLY NOTE THAT NAMES ITS OWN NOUN, AND IT IS THE EXCEPTION THE `reading` NOTE'S
   * REASONING PREDICTS.** There the subject is an EVENT and the cards are texture, so
   * listing them would put the same nouns in the prompt twice and teach the model they are
   * the point. Here the card IS the point — and `top` is therefore dropped from `facts`, so
   * it still appears exactly once.
   *
   * Measured: with the note generic, the director took `dominance` into its angle and no
   * card name reached the bubble; `recurring` was the one of six materials whose run could
   * not be guessed from its own prose.
   */
  recurring: (m) =>
    `hal baru sejak ruangan ini terakhir bicara: ${m.mechanic.topName} terus muncul di bacaan penanya`,

  occasion: (m) =>
    m.occasion === 'birthday'
      ? 'hal baru hari ini: ulang tahun penanya'
      : m.occasion === 'first_reading_anniversary'
        ? 'hari ini genap setahun sejak bacaan pertama penanya'
        : 'penanya muncul lagi setelah lama tidak ke sini',

  lotus: (m) =>
    `hal baru sejak ruangan ini terakhir bicara: gambaran diri penanya berubah — ${m.summary}`,

  /*
   * **THE SUBJECT AND NOT THE FACT.** `ProfileMaterial` carries no text, so this line
   * cannot carry one either — and that is the point rather than a limitation. The director
   * casts on the subject; the reader who speaks reads the sentence itself out of the fenced
   * `<ingatan>` block and says it in their own words.
   *
   * *"sudah diketahui"* rather than *"catatan"* or *"data"*: a note that names a record is
   * a note a model will paraphrase as *"di catatanku tertulis…"*, and `C-D8`'s ban on
   * saying HOW you know is the difference between *"nasi padang lagi kan?"* and
   * surveillance.
   */
  profile: (m) =>
    `hal yang sudah diketahui ruangan ini tentang penanya: ${PROFILE_SUBJECT_ID[m.itemKind]}`,

  /*
   * **THE CLOCK AS A SUBJECT, NOT AS A GREETING.** The note states where in the week and
   * the day the querent is and stops; *"njir, udah senin aja"* is a sentence Adrian writes,
   * not one this table hands to three readers at once (`[F5-9]`).
   *
   * The second clause is the one piece of ladder state a note carries anywhere, and it
   * earns its place: this material is LAST in `MATERIAL_ORDER` precisely because it is what
   * is left when nothing happened, and a director told only *"it is Sunday afternoon"* will
   * hunt the transcript for a pretext to speak. Saying there is no other reason is what
   * licenses an opener.
   */
  time_of_day: (m) => {
    const when = `${CHAT_TIME_VOCAB.id.weekdays[WEEKDAYS.indexOf(m.weekday)]} ${CHAT_TIME_VOCAB.id.parts[m.part]}`;
    const shape =
      m.shape === 'week_start'
        ? ', awal minggu kerja'
        : m.shape === 'weekend_close'
          ? ', akhir pekan hampir habis'
          : m.shape === 'weekend'
            ? ', akhir pekan'
            : '';
    return `jam setempat penanya: ${when}${shape}; belum ada bahan lain di ruangan ini`;
  },
};
