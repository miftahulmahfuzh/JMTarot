import 'server-only';

import {
  isUserMemoryItem,
  USER_MEMORY_ITEM_MAX_CHARS,
  type UserMemoryItem,
  type UserMemoryKind,
} from '@/lib/memory/profile/types';
import { sanitizeAnswer, stripUntrusted } from './sanitize';

/**
 * `<ingatan>` FOR A READING (card #34). The notes the group chat keeps about a
 * querent, carried into the prompt that writes their cards.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 *
 * Three things in this app are "what we know about the querent" and they are
 * different objects with different provenance, different privacy stories and
 * different fences. Confusing them is the main way this file gets edited wrongly:
 *
 *   `<penanya>`  W3's Lotus block. The ABSTRACT distillation of the six onboarding
 *                answers, in `lotus.ts`. `/privacy` 2.2 promises it is abstract.
 *   `<sosok>`    V8's persona prompt input. Never reaches a reading at all.
 *   `<ingatan>`  THIS. Model-written sentences extracted from what the querent
 *                typed in the group chat (R2), near-verbatim rather than abstract.
 *
 * They are deliberately NOT merged into one block. `renderLotusBlock` caps its
 * whole block at `LOTUS_MAX_CHARS` under the rule *"the summary is what gets cut"*,
 * so notes appended there would silently truncate the Lotus summary — and 2.2's
 * abstraction promise, which is true of the Lotus, would become impossible to state
 * honestly about a fence that also carried these. A separate fence buys a separate
 * switch, a separate analytics prop and a separate sentence in the policy.
 *
 * ── THE SAME TAG AS THE CHAT, AND R17 IS WHY ────────────────────────────────
 *
 * `<ingatan>` is already alternative ten of `sanitize.ts`'s delimiter set, put there
 * by R2 for the chat's voice prompts. This reuses it rather than minting a reading
 * variant: R17's rule is that doubling the surface for the SAME purpose is the
 * mistake, and this is the same purpose one surface over. It also means the fence
 * was already being stripped from user text before this file existed.
 *
 * ── WHERE THE RULE LIVES, AND WHY IT IS NOT HERE ────────────────────────────
 *
 * The safety rule for this block is a bullet in the STATIC `KEAMANAN` / `SAFETY`
 * section of `base.{id,en}.ts`, stated unconditionally — **not** appended
 * dynamically the way W5's `memoryInstruction` is. `base.id.ts`'s header carries the
 * argument, about `<penanya>`: a contract that changed depending on whether a
 * querent had been distilled yet *"would give two readings the same version with
 * different rules"*. W5 accepted exactly that for `<riwayat>` because its rule is
 * editorial (*refer back only if there is a thread*). This one is not editorial: it
 * is the surveillance rule — do not say how you know, do not make it the subject —
 * and a safety rule that is present only when its material is present is one
 * refactor from being absent when it matters.
 *
 * So `prompt_version` moves ONCE, with the bullet, and is then stable whether or not
 * a given querent has notes. That is the property this placement buys.
 */

/**
 * How many notes reach one reading.
 *
 * SIX, AGAINST THE CHAT'S TWELVE, AND THE ASYMMETRY IS `memory.ts`'s DILUTION
 * ARGUMENT. A chat run is a 40-message window and a beat of two sentences; a reading
 * is four paragraphs under a per-paragraph word ceiling the model has to count
 * against as it writes, and `LENGTH_BUDGET` came down 30% on 2026-07-29 precisely
 * because the readings were too long to read on a phone. Handing that prompt twelve
 * facts about the querent competes with the cards for the only attention there is.
 *
 * **A GUESS, AND RECORDED AS ONE.** Nothing has measured six against twelve. The
 * instrument is `npm run smoke -- --all --profile` diffed against `--all --fixed`,
 * and the failure to watch for is RECITATION: a paragraph spent listing habits is
 * worse than the untailored reading. If that appears, the fix is the contract bullet
 * or this number, in that order — never the code.
 */
export const PROFILE_NOTES_MAX = 6;

/**
 * HOW MANY NOTES EACH SERVICE ACTUALLY GETS, AND THIS IS A MEASURED CORRECTION RATHER
 * THAN A DESIGN (2026-09-01, first `--all --profile` run).
 *
 * Six notes went to all three services in the first cut. `spread3` handled it exactly as
 * intended -- one note, oblique, folded into a card's meaning -- and **`daily` used TWO
 * notes in two of three readings and restated one of them almost word for word**:
 * *"Tunggu kabar soal pindah kerja itu sampai ada surat resmi di tangan"* against a stored
 * note reading `Sedang menunggu kabar soal pindah kerja`. That is the `DILARANG
 * membacakannya` clause failing, in the one service CLAUDE.md already records as the
 * worst-calibrated (*"`daily` DID NOT LAND THE CUT AND THAT IS RECORDED RATHER THAN
 * FIXED"*).
 *
 * **THE FIX IS LESS MATERIAL, NOT A STERNER RULE.** `daily` has TWO paragraphs against
 * `spread3`'s four, so six facts is more background than the reading has room to absorb,
 * and a model handed more material than it can place spends a paragraph placing it. This
 * is W5's dilution argument arriving from the other direction: W5 answered it by moving
 * the instruction closer to the ceiling, which is not available here because the rule is
 * deliberately static -- so the lever that is left is the size of the block.
 *
 * `yesno` gets one. It is a single paragraph that opens with a verdict code already
 * derived, and a second fact competing with that verdict is the one thing that reading
 * cannot afford.
 *
 * **THESE THREE NUMBERS ARE THE FIRST THING TO MOVE IF RECITATION COMES BACK**, before
 * the contract bullet and long before the code. `npm run smoke -- --all --profile` against
 * `--all --fixed` is the instrument, and the tell is a paragraph that names a note instead
 * of using it.
 */
export const PROFILE_NOTES_BY_SERVICE: Record<string, number> = {
  daily: 2,
  spread3: 6,
  yesno: 1,
};

/** The cap for one service. Unknown ids fall back to the ceiling, never to zero. */
export function profileNotesFor(serviceId: string): number {
  return PROFILE_NOTES_BY_SERVICE[serviceId] ?? PROFILE_NOTES_MAX;
}

/**
 * The whole block's ceiling, INCLUDING the fence.
 *
 * Deliberately under `LOTUS_MAX_CHARS` (600): the Lotus stays the larger of the two
 * background blocks, because it is the one the querent explicitly sat through nine
 * screens to provide. Six notes at 140 characters could reach 840, so this binds in
 * the worst case and the per-note cap alone would not.
 */
export const PROFILE_BLOCK_MAX_CHARS = 480;

const OPEN = '<ingatan>';
const CLOSE = '</ingatan>';

/**
 * The kinds that answer the card, first.
 *
 * **A STABLE PARTITION, NOT A SCORE, AND THE DISTINCTION IS THE WHOLE JUSTIFICATION.**
 * `chat/context.ts` refuses to sort its twelve notes, in those words: *"ranking twelve
 * model-written sentences by a heuristic written here would give this release its own
 * second opinion about what matters, competing with the one the extractor already
 * formed."* That rule stands and is not being broken here — nothing is scored, nothing
 * is dropped, and two notes of the same kind keep their stored order relative to each
 * other.
 *
 * What IS done is selecting by DECLARED KIND, which is the mechanism `kind` exists for:
 * `types.ts` says *"Phase 7 decides which kinds make a good opener; `other` will not be
 * one"*, so a consumer choosing kinds is sanctioned. And these two kinds are literally
 * the words on the card — *"tailored to each user's character and daily activities"* is
 * `trait` and `habit`. Without the partition a querent whose first six notes are all
 * `taste` gets a reading tailored to their lunch order, which satisfies the letter of
 * the card and none of it.
 */
const PREFERRED_KINDS: readonly UserMemoryKind[] = ['trait', 'habit'];

/**
 * Pick the notes for one reading, from a `user_memory.items` value.
 *
 * TAKES `unknown[]` ON PURPOSE. The caller has a jsonb column written from model
 * output, and `$type<>` is an assertion the driver is not obliged to honour
 * (`answersUpdatedAt`'s lesson, `readingsForDay`'s `hasBody` before it). A signature
 * of `UserMemoryItem[]` would let a caller hand over whatever the row happened to
 * hold and have TypeScript agree, so the filter has to be inside the function that
 * cannot be bypassed.
 *
 * **A DELETED NOTE IS ALREADY GONE FROM `items`** and this function does not need to
 * know about `dismissed_ids`: `dismissUserMemoryItems` filters the array and appends
 * the tombstone in one statement, so the querent's delete is honoured by reading
 * `items` at all. That is what makes `/privacy` 2.8's promise true on this path, and
 * it is the one fact the privacy amendment rests on — if that query ever becomes
 * tombstone-only, this file has to start filtering and the policy sentence reverts
 * with it.
 *
 * `text` AND NOTHING ELSE reaches the output. Not `id`, not `kind`, not `lastSeen`.
 * `types.ts` is explicit that a date here is the material that turns *"nasi padang
 * lagi kan?"* into *"you told me on the 9th"*, and a `kind` token would let the model
 * narrate its own dossier structure back at the querent.
 */
export function selectProfileNotes(items: unknown): string[] {
  if (!Array.isArray(items)) return [];

  const valid: UserMemoryItem[] = items.filter(isUserMemoryItem);
  if (valid.length === 0) return [];

  const preferred = valid.filter((i) => PREFERRED_KINDS.includes(i.kind));
  const rest = valid.filter((i) => !PREFERRED_KINDS.includes(i.kind));

  const out: string[] = [];
  for (const item of [...preferred, ...rest]) {
    /*
     * `sanitizeAnswer` REJECTS RATHER THAN TRUNCATES, which is the right half of the
     * contract here: a note over the cap is a corrupt row rather than a long
     * sentence, because the extractor caps at `USER_MEMORY_ITEM_MAX_CHARS` on write.
     * Truncating one would put half a sentence about a real person into a prompt.
     */
    const clean = sanitizeAnswer(item.text, USER_MEMORY_ITEM_MAX_CHARS);
    if (clean === null) continue;
    out.push(clean);
    if (out.length >= PROFILE_NOTES_MAX) break;
  }
  return out;
}

/**
 * The `<ingatan>` block for the USER TURN, or null when there is nothing to say.
 *
 * NULL RATHER THAN AN EMPTY BLOCK. An empty fence is noise in the prompt and a rule
 * the reader would apply to nothing — the same reason `/api/reading` passes
 * `lotus.summary ? lotus : null` rather than the row.
 *
 * **STRIPPED HERE TOO, BY THE FENCE'S WRITER.** `renderLotusBlock`'s rule and
 * `chat/prompt/build.ts`'s: the builder that writes a fence is the one that strips its
 * material, so the guarantee lives with the fence rather than with a caller's
 * discipline. `selectProfileNotes` already stripped; the pass is idempotent, and doing
 * it once would depend on which of the two files somebody edits next.
 *
 * **PLAIN LINES, NOT BULLETS**, reusing the chat's reasoning: a leading `- ` is a
 * markdown list inside a prompt whose FORMAT RULES forbid the model from writing one,
 * which is asking a model to read a shape it was just told not to produce.
 *
 * The block is cut whole notes at a time rather than mid-sentence. Half a sentence
 * about a person is worse than one fewer sentence, and unlike the Lotus summary —
 * which is one continuous paragraph and can only be truncated — this material has
 * natural seams.
 */
export function renderProfileBlock(notes: string[]): string | null {
  const room = PROFILE_BLOCK_MAX_CHARS - OPEN.length - CLOSE.length - 2;

  const lines: string[] = [];
  let used = 0;
  for (const note of notes) {
    const clean = stripUntrusted(note);
    if (clean.length === 0) continue;
    const cost = clean.length + (lines.length === 0 ? 0 : 1);
    if (used + cost > room) break;
    lines.push(clean);
    used += cost;
  }

  if (lines.length === 0) return null;
  return `${OPEN}\n${lines.join('\n')}\n${CLOSE}`;
}
