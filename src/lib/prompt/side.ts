/**
 * The format contract for W5's three SIDE prompts: the gist, the frequency
 * verdict, and the per-day summary.
 *
 * WHY THIS FILE EXISTS AT ALL. W5's plan asks W6 to split `base.ts` into
 * `FORMAT_RULES[locale]` (format, language, content limits) and
 * `READING_CONTRACT[locale]` (the "you are writing one reading" framing), with
 * `BASE_CONTRACT = FORMAT_RULES + READING_CONTRACT` so the reading path is
 * unchanged. The three prompts here need the first without the second: none of
 * them is a reading, and telling a model writing a 15-word gist that it is a
 * tarot reader writing one reading in one pass produces a reading.
 *
 * W6 HAS NOT LANDED, AND `base.ts` IS W6's FILE, NOT W5's. So the rules are
 * restated here rather than forked out of `base.ts` by a workstream that does
 * not own it. WHEN W6 SPLITS `base.ts`, THIS FILE IS DELETED: replace
 * `SIDE_FORMAT_RULES[locale]` with `FORMAT_RULES[locale]` at the three call
 * sites and the duplication goes with it. It is deliberately a near-verbatim
 * subset of `BASE_CONTRACT` so that the diff at that moment is short and
 * obviously correct.
 *
 * WHAT IS DROPPED FROM `BASE_CONTRACT`, AND WHY EACH:
 *
 *   - the "you are a tarot reader writing one reading" opening -- these are not
 *     readings, and the frequency verdict is explicitly NOT in a reader's voice
 *     (M6: it sits on the reader picker, before a reader has been chosen)
 *   - "no opening pleasantries, your first sentence is already the reading" --
 *     each side prompt states its own version, because what counts as an
 *     opening differs between a one-clause gist and a three-sentence greeting
 *   - the `<pertanyaan>` and `<penanya>` safety clauses -- neither delimiter
 *     appears in any of these prompts. The two that DO carry querent-derived
 *     text state their own content-not-instructions clause over their own tag;
 *     the frequency prompt carries no user text at all and gets no clause,
 *     because a delimiter rule naming a tag that never appears is noise the
 *     model has to reconcile.
 *
 * WHAT IS KEPT, AND WHY IT IS NOT OPTIONAL:
 *
 *   - NO MARKDOWN, NO EMOJI. Every one of these strings is rendered as plain
 *     text into a `<p>`. `**Strength**` reaches the screen as asterisks.
 *   - CARD NAMES VERBATIM, IN ENGLISH. The artwork has the title rendered into
 *     the image, and glm-4.6 invents Indonesian names for cards when it is not
 *     told not to -- it produced "Pulan" for The Moon during planning.
 *   - INDONESIAN, NOT MALAY. `npm run smoke -- --all` greps generated text for
 *     eleven Malay-only words, and roadmap §1 makes the grep binding on gists
 *     and summaries too: they are generated text and can go Malay just as
 *     easily as a reading can.
 *   - NO THERAPY, NO DIAGNOSIS. Roadmap §8 makes this bind the distillation as
 *     well as the readings, and a gist is a distillation that feeds a reading
 *     prompt. A gist containing "trauma" hands the reading model a word its own
 *     base contract forbids.
 */
import type { Locale } from '@/data/types';

export const SIDE_FORMAT_RULES: Record<Locale, string> = {
  id: `ATURAN FORMAT (wajib, tanpa pengecualian):
- Tulis prosa biasa. DILARANG memakai markdown: tanpa **tebal**, tanpa *miring*, tanpa judul, tanpa tanda pagar, tanpa daftar berpoin, tanpa nomor urut.
- DILARANG memakai emoji atau emotikon apa pun.
- Nama kartu ditulis PERSIS seperti yang diberikan, dalam bahasa Inggris. Jangan pernah menerjemahkannya, jangan pernah mengarang nama Indonesia untuk sebuah kartu, dan jangan menambahkan nama alternatif dalam kurung. "The Moon" tetap "The Moon".

BAHASA:
- Bahasa Indonesia, bukan bahasa Melayu. Pakai "karier" bukan "kerjaya", "arah hidup" bukan "hala tuju", "ngobrol" bukan "sembang", "kamu" bukan "awak".
- Tulis angka dan istilah sewajarnya, seperti orang Indonesia menulis.

BATAS ISI:
- Ini hiburan. Jangan pernah mendiagnosis apa pun. Jangan menyinggung terapi, trauma, penyembuhan, penyakit, gangguan mental, atau obat.
- Jangan memberi instruksi medis, hukum, atau keuangan.
- Jangan mengaku tahu pasti perasaan orang lain atau kepastian masa depan.
- Bicara langsung kepada penanya sebagai "kamu".`,

  en: `FORMAT RULES (mandatory, no exceptions):
- Write plain prose. NO markdown: no **bold**, no *italics*, no headings, no hashes, no bullet lists, no numbering.
- NO emoji or emoticons of any kind.
- Write card names EXACTLY as given, in English. Never translate one, never invent another name for one, and never add an alternative in brackets. "The Moon" stays "The Moon".

LANGUAGE:
- English, written plainly. No archaic register and no mock-mystical diction.
- Write numbers and terms the way an ordinary person writes them.

CONTENT LIMITS:
- This is entertainment. Never diagnose anything. Never touch therapy, trauma, healing, illness, mental disorders, or medication.
- Give no medical, legal or financial instruction.
- Never claim certainty about another person's feelings or about the future.
- Address the querent directly as "you".`,
};
