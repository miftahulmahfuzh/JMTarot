import 'server-only';

/**
 * The profile-memory extraction: the contract, the hash, the staleness resolver and
 * the mechanical checks. **PURE: no DB, no fetch, no `process.env`.**
 *
 * ── WHAT THIS IS FOR ───────────────────────────────────────────────────────
 *
 * The room forgets everything past forty messages. `memory.ts`'s dilution argument
 * forbids the obvious fix -- three weeks of chatter in front of the instruction makes
 * the instruction weaker, not the reader smarter -- so the answer is a DISTILLATION,
 * which is `lotus.ts`'s answer to the same question about six onboarding answers.
 *
 * ── FOUR RULES THE CONTRACT ENFORCES, AND CODE ENFORCES THE FIRST THREE AGAIN ──
 *
 * 1. **NO ATTRIBUTION AND NO DATES.** `C-D8`: a reader never says how they know.
 *    *"nasi padang lagi kan?"* is the target; *"you told me on the 9th"* is the
 *    failure, and the cheapest way to make the second unsayable is for the MATERIAL
 *    never to carry a date. `validateExtraction` drops any item carrying a year or an
 *    ISO date or an attribution phrase, so a contract violation costs one item rather
 *    than reaching a prompt.
 * 2. **A SKIPPED ONBOARDING ANSWER STAYS SKIPPED** (`C-D8` condition 5). This
 *    extractor reads `chat_messages` and NOTHING ELSE -- not `onboarding_answers`, not
 *    `lotus_avatars`, not `profiles`. That is enforced by CONSTRUCTION, in
 *    `generate.ts`'s import list, which is `A5`'s own mechanism ("the persona prompt
 *    never receives a raw onboarding answer AT ALL"). Nothing here can reintroduce a
 *    fact the querent declined to give, because nothing here can see one.
 * 3. **A FACT, NOT A QUOTE.** An item is a third-person statement in the extractor's
 *    own words. A verbatim run lifted out of the transcript is how a reader ends up
 *    reciting the querent's sentence back at them; phase 5 refuses it on the read
 *    side, and the contract asks for it here.
 * 4. **A DELETED FACT IS NOT RE-ADDED.** The suppression list is a set of digests the
 *    model never sees; the prompt is told how many facts were declined and the code
 *    drops any returned item that matches one. `effectiveYesNo()` / `validateChoice` /
 *    `applyAdvice`'s rule in a fifth place: THE PROMPT ASKS, THE CODE ENFORCES.
 *
 * ── THE MODEL RETURNS THE WHOLE MEMORY, NEVER A DELTA ──────────────────────
 *
 * It is handed what is already remembered and the last N messages, and it returns the
 * complete list. A delta protocol would need a merge in code, and a merge in code is
 * where two facts about one habit accumulate forever. Re-derivation over a bounded
 * window with the old memory carried forward is what makes the artifact SELF-
 * CORRECTING: a fact the model invented once is not permanent, because the next
 * extraction re-reads the source.
 *
 * ── THE SHAPES ARE PHASE 3's AND ARE IMPORTED, NEVER RESTATED ──────────────
 *
 * `./types.ts` is a ZERO-IMPORT LEAF a client component may reach, which is why
 * `normaliseFact()` and `userMemoryItemId()` live HERE instead of beside the shape
 * they hash: they need `node:crypto`, and a client component must not acquire one for
 * a label. The FORMULA is phase 3's contract rather than this file's choice --
 * `sha256(kind + '\u001f' + normalise(text))`, hex, first 12 -- because
 * `user_memory.dismissed_ids`, phase 6's delete control and phase 7's
 * `profile:<itemId>` material key all index off that exact value.
 *
 * The impure half -- the read, the call, the write, the throttle -- is `generate.ts`.
 */
import { createHash } from 'node:crypto';

import type { Locale } from '@/data/types';
import { stripUntrusted } from '@/lib/prompt/sanitize';
import {
  USER_MEMORY_ITEM_MAX_CHARS,
  USER_MEMORY_KINDS,
  USER_MEMORY_MAX_ITEMS,
  USER_MEMORY_SOURCE_VERSION,
  type UserMemoryItem,
  type UserMemoryKind,
} from './types';

// ---------------------------------------------------------------------------
// Versions and budgets
// ---------------------------------------------------------------------------

/**
 * Stored on the row, as `personas.prompt_version` is: a text tag, not a number.
 *
 * **IT IS NOT THE STALENESS COMPARAND AND MUST NOT BECOME ONE.**
 * `USER_MEMORY_SOURCE_VERSION` (phase 3's leaf) is what
 * `profileMemoryStaleness` compares, because that is the number a deploy bumps
 * when *"we changed how we write memories"* has to reach everybody. This one is a
 * label on the row, for reading a ledger afterwards.
 */
export const PROFILE_MEMORY_PROMPT_VERSION = 'pm-1';

/**
 * The output ceiling. **A RUNAWAY GUARD, NOT THE LENGTH CONTROL** -- `MAX_TOKENS`'
 * relationship to `LENGTH_BUDGET`, restated because it is the thing somebody reaches
 * for when the memory comes back short. The length control is `USER_MEMORY_MAX_ITEMS`
 * and `USER_MEMORY_ITEM_MAX_CHARS`, which the contract interpolates and
 * `validateExtraction` enforces.
 *
 * Roughly double 32 items x ~35 tokens, plus the JSON scaffolding. It lives here and
 * not in `src/lib/prompt/budget.ts` on `gistPrompt`'s precedent -- that file holds the
 * WORD ceilings for reader-voiced prose, and this is neither.
 */
export const PROFILE_MEMORY_MAX_TOKENS = 2000;

/**
 * How many of the newest chat messages the extractor reads. **NOT
 * `CHAT_CONTEXT_MESSAGES`, and the two must never be unified.**
 *
 * That one is 40 and is bounded by `memory.ts`'s dilution argument: it sits in front
 * of an INSTRUCTION a reader must obey. This one sits in front of an EXTRACTION task
 * whose entire job is to read a lot and write a little, so dilution does not apply and
 * Miftah's cost ruling licenses the size. **Widening `CHAT_CONTEXT_MESSAGES` is out of
 * scope for the whole plan set; widening this is a one-line env change.**
 */
export const PROFILE_MEMORY_WINDOW_DEFAULT = 200;

/**
 * Below this the room has not met the person yet. **A HALF-WRITTEN TRANSCRIPT MUST
 * NEVER BE DISTILLED** -- `L3`'s rule about a half-written answer set, in a second
 * place. Six is two exchanges; anything less produces a memory made of hello.
 */
export const PROFILE_MEMORY_MIN_MESSAGES = 6;

// ---------------------------------------------------------------------------
// The comparison form, and the id
// ---------------------------------------------------------------------------

/**
 * The comparison form of a fact: lowercase, punctuation gone, whitespace collapsed.
 *
 * It feeds two things and both need the same answer: de-duplication within one
 * extraction, and `userMemoryItemId()`'s digest input. **Deliberately crude** -- it is
 * a cheap defence against the model returning the same fact twice in two spellings,
 * and it is honestly weak against a REWORDING. See the plan's Handoffs; a fuzzy match
 * is not available here because the deleted text is deliberately not kept.
 *
 * **IT LIVES BESIDE THE HASH IT FEEDS AND NOT BESIDE THE SHAPE IT DESCRIBES.** A
 * separate copy in `./types.ts` would be two implementations of one preimage, and the
 * two drifting is the tombstone silently emptying.
 */
export function normaliseFact(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The item's id AND its tombstone -- **one value, phase 3's contract**: a digest of
 * the item's KIND and its normalised text, never the text.
 *
 * A suppression list that stored the sentence would make "delete" mean "move to a
 * different column in the same row", which is the delete button being a lie -- W3's
 * phrase, and the property `lotusInputHash` exists to protect.
 *
 * **TWELVE hex characters, and the `kind` is in the preimage -- both are phase 3's
 * contract, not this file's choice**, because `user_memory.dismissed_ids`, phase 6's
 * delete control and phase 7's `profile:<itemId>` `material_key` all index off this
 * exact value. `USER_MEMORY_ITEM_ID_RE` is the shape.
 *
 * **STABLE ACROSS REGENERATIONS.** The model rewrites the whole memory every time, so
 * a random id would mint a new one on every extraction and a querent's deletion would
 * survive exactly until the next one. Deriving it from content is what makes a
 * tombstone mean anything at all.
 *
 * **THE KNOWN GAP, WIDER BY ONE UNDER THE MERGED ID.** A re-derivation that rewords
 * the fact past `normaliseFact` **or refiles it under a different `kind`** hashes
 * differently and can come back. Both halves are addressed in the extraction prompt --
 * prefer an existing item's wording and its kind when re-stating a fact -- and neither
 * is a schema change.
 */
export function userMemoryItemId(kind: UserMemoryKind, text: string): string {
  return createHash('sha256')
    .update(`${kind}\u001f${normaliseFact(text)}`)
    .digest('hex')
    .slice(0, 12);
}

// ---------------------------------------------------------------------------
// The input hash
// ---------------------------------------------------------------------------

/**
 * SHA-256 over `USER_MEMORY_SOURCE_VERSION` and **the id of the newest chat
 * message**, and nothing else.
 *
 * ── IT MOVES, AND IT MOVES ON THE QUERENT'S NEXT SENTENCE ──────────────────
 *
 * `personaInputHash`'s shape rather than `lotusInputHash`'s, and it has to be: the
 * INPUT is the transcript, and a transcript that has not moved is a memory that does
 * not need rewriting. A uuid changes whenever a row is inserted, so one indexed read
 * answers "has anything happened" -- there is no `count(*)` and no `max(created_at)`,
 * because both cost more and neither says anything the id does not.
 *
 * **AND YET THE FLAG WRITES NOTHING. THAT IS A THIRD SHAPE**, not the Lotus/persona
 * asymmetry being rounded off: the hash moving makes storing a fallback SAFE, and
 * nothing here makes it NECESSARY. `flags.ts`'s header carries the table.
 *
 * **THE SUPPRESSION LIST IS DELIBERATELY NOT IN THE HASH.** A querent deleting an item
 * must not trigger a regeneration -- see Decision B in the phase plan -- and the way to
 * say that is for the deletion to be invisible to staleness. Phase 6's delete route
 * writes the row WITHOUT touching `input_hash` for exactly this reason.
 *
 * **NO LOCALE.** `personaInputHash`'s capitalised rule: a language switch must not
 * rewrite a stored artifact. There is nothing to translate either -- the items are in
 * the language the querent used, `readings.choice`'s rule.
 */
export function profileMemoryInputHash(newestMessageId: string): string {
  return createHash('sha256')
    .update([`v${USER_MEMORY_SOURCE_VERSION}`, `newest:${newestMessageId}`].join('\n'))
    .digest('hex');
}

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

/**
 * **FOUR ARMS, AND THE MISSING FIFTH IS THE DESIGN.**
 *
 * `personaStaleness` has a `user-edit` arm because an onboarding-answer edit changes
 * an INPUT the persona was derived from. **Here the querent edits the OUTPUT
 * directly** -- phase 6 deletes an item out of this very row -- so there is nothing
 * to rebuild, and reporting it as stale would have a model re-read the same transcript
 * and re-derive the fact the querent just deleted. A13's rule is untouched; it simply
 * does not apply, because no user action changes this artifact's inputs.
 *
 * ── THE THROTTLE IS THE CALLER'S, NEVER THE GENERATOR'S (A13) ──────────────
 *
 * `minAgeSeconds` is an ARGUMENT. `generate.ts`'s `scheduleProfileExtraction` reads
 * the env var and calls this; `extractProfileMemory` -- the generator -- has no
 * cooldown at all and never will. **That placement is W3's trap**:
 * `scheduleLotusRefresh`'s ten minutes swallowed a user-caused answer edit and froze
 * `updated_at`, which is the delete button being a lie. A throttle on the CALLER is a
 * latency decision; a throttle inside the GENERATOR is a correctness bug.
 *
 * ── `input_hash = ''` IS A REDACTED ROW AND FALLS OUT AS `drift` ───────────
 *
 * `redactUserMemory` writes the empty string as a value that *"never matches"*, and it
 * is handled here by arithmetic rather than by a clause: no digest is ever empty, so
 * the `===` below is false and an erased-then-restored account refills on its next
 * completed run. Do not add a special case -- one would be a second thing to keep in
 * step with phase 3's reserved value.
 */
export type ProfileMemoryStaleness =
  /** No row. Extract now; this is the first time the room has enough to remember. */
  | 'absent'
  /** The contract changed under it. **Never throttled** -- a deploy must reach everybody. */
  | 'source-version'
  /** The transcript has moved. Throttled by `minAgeSeconds`. */
  | 'drift'
  /** Nothing has happened, or it happened too recently to be worth a call. */
  | 'fresh';

export function profileMemoryStaleness(
  row: { sourceVersion: number; inputHash: string; updatedAt: Date } | null,
  inputHash: string,
  minAgeSeconds: number,
  now: Date = new Date(),
): ProfileMemoryStaleness {
  if (row === null) return 'absent';
  if (row.sourceVersion !== USER_MEMORY_SOURCE_VERSION) return 'source-version';
  if (row.inputHash === inputHash) return 'fresh';

  const ageSeconds = (now.getTime() - row.updatedAt.getTime()) / 1000;
  return ageSeconds >= minAgeSeconds ? 'drift' : 'fresh';
}

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

/** The one place the transcript fence is written, for this prompt. */
const OBROLAN_OPEN = '<obrolan>';
const OBROLAN_CLOSE = '</obrolan>';
/** The one place the carried-forward memory is fenced. Phase 5 uses the same tag. */
const INGATAN_OPEN = '<ingatan>';
const INGATAN_CLOSE = '</ingatan>';

/**
 * **THE HINTS ARE PHASE 3's SEVEN KINDS AND THERE IS NO `work`.** A job fact files
 * under `situation` -- what is going on lately -- or under `other`. That is a real
 * loss of one distinction against this phase's first draft, recorded rather than
 * fixed by widening a closed set three phases index off: `kind` is half of `id`'s
 * preimage, so an eighth value would change every id and silently empty every
 * tombstone.
 *
 * Both tables are a `Record<UserMemoryKind, string>`, so an eighth kind is a compile
 * error here before it is a missing hint at runtime.
 */
const KIND_HINT_ID: Record<UserMemoryKind, string> = {
  habit: 'kebiasaan atau rutinitas -- jam bangun, ibadah, olahraga, jam tidur',
  taste: 'suka dan tidak suka -- makanan, minuman, musik',
  person: 'orang di hidupnya, dengan sebutan yang DIA pakai',
  situation: 'apa yang lagi terjadi belakangan ini -- kerjaan, kuliah, pindahan, sakit',
  place: 'tempat dia berada atau tempat yang sering dia datangi',
  trait: 'orangnya seperti apa -- caranya menghadapi sesuatu, menurut dia sendiri',
  other: 'benar, bertahan lama, dan tidak masuk ke salah satu di atas',
};

const KIND_HINT_EN: Record<UserMemoryKind, string> = {
  habit: 'habits and routines -- when they wake, pray, exercise, sleep',
  taste: 'likes and dislikes -- food, drink, music',
  person: 'somebody in their life, by the name THEY use',
  situation: 'what is going on for them lately -- work, study, a move, an illness',
  place: 'where they are, or where they keep going',
  trait: 'what they are like -- how they move through something, in their own account',
  other: 'true, durable, and none of the above',
};

const KIND_LIST = (hints: Record<UserMemoryKind, string>): string =>
  USER_MEMORY_KINDS.map((k) => `- "${k}": ${hints[k]}`).join('\n');

/**
 * A `Record<Locale, string>`, so **forgetting a locale is a compile error rather than
 * `undefined` handed to a model** -- W6's facade rule, applied to a fifth prompt.
 *
 * **THE LOCALE CHOOSES THE INSTRUCTION LANGUAGE AND NEVER THE OUTPUT LANGUAGE.** Both
 * contracts carry the same output rule: *write each fact in the language the querent
 * used for it.* That is why the hash has no locale and the row has no locale column --
 * see `./types.ts`. The two contracts are REWRITTEN rather than translated, W6's rule
 * 3, and their worked examples deliberately use different material.
 *
 * **RULE 11 IS THE MITIGATION FOR THE ID's KNOWN GAP**, and it is the only place the
 * gap can be addressed at all: an id is `sha256(kind + text)`, so a fact re-stated in
 * new words or refiled under a new kind comes back through a tombstone. Code cannot
 * fix that without keeping the deleted text, which would make deletion a lie -- so the
 * prompt asks for the old wording and the old kind, and the residue is recorded as a
 * known gap rather than papered over.
 *
 * The worked examples are real production material from this project's own room
 * (2026-08-08 -> 2026-08-30), which is what makes them worth reading.
 */
export const PROFILE_MEMORY_CONTRACT: Record<Locale, string> = {
  id: `Kamu membaca sebuah percakapan dan menuliskan apa yang layak diingat tentang SATU orang -- si penanya.

INI BUKAN RINGKASAN PERCAKAPAN DAN BUKAN BACAAN KARTU. Kamu tidak berbicara kepada siapa pun. Kamu menulis catatan pendek, seperti catatan seorang teman lama yang tahu orang ini -- bukan laporan, bukan transkrip.

APA YANG KAMU TERIMA:
- ${INGATAN_OPEN} berisi apa yang sudah diingat sebelumnya. Ini titik awalmu.
- ${OBROLAN_OPEN} berisi pesan-pesan terbaru di ruang obrolan. Baris yang diawali "penanya:" adalah kata-kata orang ini; sisanya adalah pembaca kartu dan BUKAN sumber fakta tentang dia.

APA YANG KAMU KELUARKAN:
Satu array JSON, tanpa penjelasan, tanpa pagar kode, tanpa teks lain. Setiap elemen persis berbentuk {"kind": "...", "text": "..."}.

"kind" harus salah satu dari:
${KIND_LIST(KIND_HINT_ID)}

ATURAN, DAN LIMA PERTAMA TIDAK BISA DITAWAR:

1. TULIS SELURUH INGATAN, BUKAN TAMBAHANNYA SAJA. Bawa terus fakta lama yang masih benar, buang yang sudah tidak benar, tambahkan yang baru. Yang kamu kembalikan menggantikan semuanya.
2. JANGAN PERNAH MENULIS TANGGAL, TAHUN, HARI, ATAU KAPAN SESUATU DIKATAKAN. Bukan "9 Agustus dia bilang", bukan "minggu lalu", bukan "2026". Fakta saja.
3. JANGAN PERNAH MENULIS BAHWA DIA MENGATAKANNYA. Bukan "dia bilang suka nasi padang", tapi "suka nasi padang". Bukan "katanya lari jam 5", tapi "lari pagi, idealnya jam 5; jam 7 sudah terlalu panas".
4. JANGAN MENYALIN KALIMATNYA MENTAH-MENTAH. Tulis dengan kata-katamu sendiri, satu klausa, maksimal ${USER_MEMORY_ITEM_MAX_CHARS} karakter.
5. TULIS SETIAP FAKTA DALAM BAHASA YANG DIA PAKAI UNTUK FAKTA ITU. Kalau dia bilang "nasi padang", tulis "nasi padang".

6. Maksimal ${USER_MEMORY_MAX_ITEMS} fakta. Kalau lebih, buang yang paling tidak berguna untuk mengenali orang ini, dan taruh yang paling berguna di urutan awal.
7. Satu fakta satu baris. Jangan menggabungkan dua kebiasaan yang tidak berhubungan jadi satu.
8. Hanya tulis yang DIA nyatakan tentang dirinya. Tebakan pembaca kartu bukan fakta.
9. TIDAK APA-APA MENGEMBALIKAN SEDIKIT. Array kosong adalah jawaban yang sah kalau memang tidak ada yang layak diingat. Jangan mengarang supaya kelihatan berguna.
10. Jangan menulis diagnosis, penyakit, kondisi mental, atau apa pun yang terdengar seperti rekam medis.
11. KALAU SEBUAH FAKTA SUDAH ADA DI ${INGATAN_OPEN}, PAKAI LAGI KATA-KATA DAN "kind" YANG SAMA PERSIS. Menulis ulang fakta yang sama dengan kalimat lain membuatnya terhitung sebagai fakta baru.

CONTOH KELUARAN (bahan sungguhan, bentuknya persis seperti ini):
[{"kind":"habit","text":"solat subuh, jadi bangunnya sekitar jam setengah lima"},{"kind":"habit","text":"lari pagi; idealnya jam 5, jam 7 sudah kepanasan"},{"kind":"place","text":"ngopi di Kopi Kenangan Blok M, yang sebelah XXI"},{"kind":"trait","text":"lebih senang jalan sendirian daripada ramai-ramai"}]`,

  en: `You are reading a conversation and writing down what is worth remembering about ONE person -- the querent.

THIS IS NOT A SUMMARY OF THE CONVERSATION AND IT IS NOT A CARD READING. You are not speaking to anybody. You are writing short notes, the kind an old friend keeps about someone they know -- not a report, not a transcript.

WHAT YOU ARE GIVEN:
- ${INGATAN_OPEN} holds what was already remembered. That is your starting point.
- ${OBROLAN_OPEN} holds the most recent messages in the room. Lines beginning "querent:" are this person's own words; everything else is a card reader and is NOT a source of facts about them.

WHAT YOU RETURN:
One JSON array. No explanation, no code fence, no other text. Every element is exactly {"kind": "...", "text": "..."}.

"kind" must be one of:
${KIND_LIST(KIND_HINT_EN)}

THE RULES, AND THE FIRST FIVE ARE NOT NEGOTIABLE:

1. RETURN THE WHOLE MEMORY, NOT THE ADDITIONS. Carry forward what is still true, drop what is not, add what is new. What you return replaces everything.
2. NEVER WRITE A DATE, A YEAR, A DAY, OR WHEN SOMETHING WAS SAID. Not "on the 9th", not "last week", not "2026". The fact only.
3. NEVER WRITE THAT THEY SAID IT. Not "says they like early runs", but "runs in the morning, ideally at five". Not "mentioned a colleague called Bonjeng", but "works with somebody they call Bonjeng".
4. DO NOT COPY THEIR SENTENCE. Put it in your own words, one clause, at most ${USER_MEMORY_ITEM_MAX_CHARS} characters.
5. WRITE EACH FACT IN THE LANGUAGE THEY USED FOR IT. If they said "nasi padang", write "nasi padang".

6. At most ${USER_MEMORY_MAX_ITEMS} facts. If there are more, drop the ones least useful for recognising this person, and put the most useful first.
7. One fact per entry. Do not staple two unrelated habits together.
8. Only what THEY stated about themselves. A reader's guess is not a fact.
9. RETURNING FEW IS FINE. An empty array is a valid answer when there is genuinely nothing worth remembering. Do not invent something in order to be useful.
10. Never write a diagnosis, an illness, a mental-health condition, or anything that reads like a medical record.
11. IF A FACT IS ALREADY IN ${INGATAN_OPEN}, REUSE ITS EXACT WORDING AND ITS EXACT "kind". Restating the same fact in different words makes it count as a new one.

EXAMPLE OUTPUT (exactly this shape):
[{"kind":"situation","text":"office job with a management team they find exhausting"},{"kind":"person","text":"has a colleague they call Bonjeng who is often angry"},{"kind":"taste","text":"coffee from the place next to the cinema"},{"kind":"trait","text":"prefers doing things alone"}]`,
};

// ---------------------------------------------------------------------------
// Building the prompt
// ---------------------------------------------------------------------------

/** One transcript line, as the extractor reads it. */
export type ExtractionMessage = {
  /** `'user'` for the querent; a reader id otherwise. */
  author: string;
  body: string;
};

export type ProfileMemoryInput = {
  locale: Locale;
  /** What is already remembered. Carried forward, never a delta base. */
  existing: { items: UserMemoryItem[]; dismissed: readonly string[] };
  /** Oldest first. */
  messages: ExtractionMessage[];
};

const USER_LABEL: Record<Locale, string> = { id: 'penanya', en: 'querent' };

/**
 * Assemble the user turn. **EVERY BLOCK IS FENCED AND EVERY FIELD IS
 * `stripUntrusted`ED BY THE BUILDER THAT WRITES THE FENCE** -- the plan set's
 * invariant 3, and this prompt has no unfenced material at all: the instruction is
 * the system turn.
 *
 * **`<ingatan>` IS A TENTH FENCE AND IT IS NOT DECORATION.** What it fences is model
 * output that was itself generated from user text, handed to a second model as
 * material -- which is exactly `<terjemahan>`'s argument (R17), and the reason
 * `ingatan` joins `DELIMITER` in `sanitize.ts` in this same commit rather than in
 * phase 5's.
 *
 * **THE ITEM's `kind` IS SENT AND ITS `id` AND `lastSeen` ARE NOT.** The kind is what
 * rule 11 asks the model to preserve; an id is a digest the model can do nothing with,
 * and a date is the one field `C-D8` makes unsayable. `types.ts` calls `text` *"the
 * only field that may reach a model"* and this is the write side honouring it minus
 * the one token rule 11 needs.
 */
export function buildProfileMemoryPrompt(input: ProfileMemoryInput): {
  system: string;
  user: string;
  maxTokens: number;
} {
  const who = USER_LABEL[input.locale];

  const remembered = input.existing.items.length
    ? input.existing.items.map((i) => `- [${i.kind}] ${stripUntrusted(i.text)}`).join('\n')
    : input.locale === 'id'
      ? '(belum ada)'
      : '(nothing yet)';

  /*
   * **THE DIGESTS ARE NEVER SENT.** They are useless to a model and sending them
   * would be sending a fingerprint of text the querent deleted. The COUNT is sent,
   * because "this person has removed things before" is a real instruction and the
   * enforcement is `validateExtraction`'s, not the model's.
   */
  const declined = input.existing.dismissed.length;
  const declinedLine =
    declined === 0
      ? ''
      : input.locale === 'id'
        ? `\nOrang ini pernah menghapus ${declined} catatan tentang dirinya. Kalau ada fakta yang terasa terlalu pribadi untuk diingat, jangan tulis.\n`
        : `\nThis person has previously deleted ${declined} notes about themselves. If a fact feels too private to keep, leave it out.\n`;

  const transcript = input.messages
    .map((m) => `${m.author === 'user' ? who : m.author}: ${stripUntrusted(m.body)}`)
    .join('\n');

  const user =
    `${INGATAN_OPEN}\n${remembered}\n${INGATAN_CLOSE}\n` +
    declinedLine +
    `\n${OBROLAN_OPEN}\n${transcript}\n${OBROLAN_CLOSE}\n`;

  return {
    system: PROFILE_MEMORY_CONTRACT[input.locale],
    user,
    maxTokens: PROFILE_MEMORY_MAX_TOKENS,
  };
}

// ---------------------------------------------------------------------------
// The mechanical checks
// ---------------------------------------------------------------------------

/**
 * A date in any form a model would produce. **A YEAR IS THE PROXY**, because
 * `2026-08-09` and "in 2026" are the two shapes that actually appear and a weekday
 * word ("senin", "monday") is legitimate inside a habit -- *"lari tiap senin"* is a
 * fact, not an attribution.
 */
const DATE_LIKE = /\d{4}-\d{2}-\d{2}|\b(?:19|20)\d{2}\b/;

/**
 * Attribution phrases, word-bounded, in both languages.
 *
 * **BIASED TOWARDS REJECTING ONE ITEM, NEVER THE BATCH** -- see `validateExtraction`.
 * A false rejection costs one fact; a false acceptance ships *"you told me on the
 * 9th"* into a reader's mouth, which is the failure `C-D8` exists to prevent.
 */
const ATTRIBUTION =
  /\b(?:dia bilang|dia cerita|dia sebut|katanya|menurut dia|pernah bilang|waktu itu dia|di catatanku|kamu pernah bilang|he said|she said|they said|you said|told me|mentioned that|according to them)\b/i;

/**
 * **`returned` IS ON BOTH ARMS AND IT IS THE REASON `memory.profile_written` EXISTS.**
 *
 * It is how many entries the MODEL produced, before any mechanical filter; `items` is
 * how many survived. `llm_calls` already carries the cost and the latency of this call
 * and can say nothing about the difference, and the difference is the one number that
 * distinguishes *"the model is failing"* from *"the contract is failing"* -- a
 * `dropped` trending towards `returned` means the model is writing dates or
 * attributions and the fix is the prompt, not the code.
 *
 * **REPORTING `returned` AS THE KEPT COUNT WOULD MAKE `dropped` CONSTANTLY ZERO**, and
 * an event whose only interesting field can never be non-zero is worse than no event:
 * an operator reads a flat line and concludes the extractor is clean.
 */
export type ExtractionVerdict =
  | { ok: true; items: UserMemoryItem[]; returned: number }
  | { ok: false; reason: ExtractionRejectReason; returned: number };

export type ExtractionRejectReason =
  /** Not JSON, or not an array of objects. */
  | 'unparseable'
  /** Parsed, had entries, and every single one was dropped. */
  | 'all_items_dropped'
  /** Parsed as an empty memory while a non-empty one is already stored. */
  | 'would_empty';

/**
 * **REFUSES SHAPE, NOT TRUTH, AND SAYS SO** -- `validateInsight`'s and
 * `validateAdvice`'s rule. There is no cheap test for *"this person really does run at
 * five"*; the honest instruments are phase 6's `/account` surface, where the querent
 * reads it and deletes what is wrong, and `memory.profile_written`'s counts.
 *
 * ── IT FILTERS ITEMS; IT DOES NOT REFUSE THE BATCH. THE OPPOSITE OF THE PERSONA ──
 *
 * `personaSafetyCheck` discards the whole body on any failure, because a persona is
 * ONE paragraph and a body that failed one rule is a body whose other rules are
 * suspect. **An extraction is thirty-two independent statements**, and throwing away
 * thirty-one good facts because one carried a year is a strictly worse outcome. So
 * each item is judged alone, and only three whole-batch refusals exist:
 *
 *   `unparseable`       -- nothing usable came back at all.
 *   `all_items_dropped` -- the model produced entries and every one broke a rule,
 *                          which is a signal about the CONTRACT and must not be
 *                          written as if it were a considered empty answer.
 *   `would_empty`       -- a well-formed empty array against a stored non-empty
 *                          memory. **An existing memory is never replaced by an empty
 *                          one**, which is `generatePersona`'s "an existing paragraph
 *                          is never overwritten with a template" in a new place. A
 *                          deliberately empty memory is legal for a querent who has
 *                          none yet, and that is the only case it is written.
 *
 * `dismissed` (`user_memory.dismissed_ids`) is passed in, so a fact the querent deleted
 * cannot come back through the door it was thrown out of.
 *
 * ── THE CAP TAKES THE MODEL's OWN ORDER, AND `lastSeen` CANNOT HELP ────────
 *
 * `localDate` fills each accepted item's `lastSeen`. **It is the QUERENT's calendar
 * day, never the server's** -- phase 3's `lastSeen` docblock states that in
 * `local_date`'s own words -- and the caller derives it from the thread's offset; see
 * `extractProfileMemory`.
 *
 * Phase 3's docblock offers `lastSeen` as *"how phase 4 chooses what to evict at
 * `USER_MEMORY_MAX_ITEMS`"*. **It cannot be, and the reason is the whole-memory
 * protocol rather than an omission here:** the model rewrites the entire list every
 * time, so every item written in one extraction carries the same day and the field is
 * uniform across a stored list by construction. There is nothing to sort by. So the
 * cap is the model's own ranking -- rule 6 asks for the most useful first and the
 * least useful dropped -- and `lastSeen` stays what phase 3's last sentence says it
 * is: *"when an extraction last saw it"*, a per-row age marker and not an order.
 */
export function validateExtraction(
  raw: string,
  opts: { dismissed: readonly string[]; hadItems: boolean; localDate: string },
): ExtractionVerdict {
  const parsed = parseArray(raw);
  if (parsed === null) return { ok: false, reason: 'unparseable', returned: 0 };

  const kinds = USER_MEMORY_KINDS as readonly string[];
  const dismissed = new Set(opts.dismissed);
  const seen = new Set<string>();
  const items: UserMemoryItem[] = [];

  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const bag = entry as Record<string, unknown>;
    if (typeof bag.kind !== 'string' || !kinds.includes(bag.kind)) continue;
    if (typeof bag.text !== 'string') continue;

    const text = stripUntrusted(bag.text);
    if (!text) continue;
    if (text.length > USER_MEMORY_ITEM_MAX_CHARS) continue;
    if (DATE_LIKE.test(text)) continue;
    if (ATTRIBUTION.test(text)) continue;

    const kind = bag.kind as UserMemoryKind;
    const id = userMemoryItemId(kind, text);
    if (dismissed.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({ id, kind, text, lastSeen: opts.localDate });
    if (items.length >= USER_MEMORY_MAX_ITEMS) break;
  }

  /*
   * `id` IS THE SUPPRESSION KEY, WHICH IS NOT A COINCIDENCE. Phase 6's delete route
   * receives an id and needs a digest to tombstone; deriving one from the other would
   * be two functions that must agree. They are the same value, so they cannot
   * disagree -- and it is a digest of the item's own kind and text, so it carries
   * nothing the item does not already carry.
   */

  if (items.length === 0) {
    if (parsed.length > 0) return { ok: false, reason: 'all_items_dropped', returned: parsed.length };
    if (opts.hadItems) return { ok: false, reason: 'would_empty', returned: 0 };
  }

  return { ok: true, items, returned: parsed.length };
}

/**
 * Read a JSON array out of a model reply, tolerating a fenced code block and leading
 * prose.
 *
 * **TOLERANT ON PURPOSE.** The contract says "no code fence"; a model that adds one
 * anyway has still answered correctly, and refusing that costs a whole extraction for
 * a formatting tic. `validateAdvice`'s bias, in a smaller place.
 *
 * **TOLERANT OF PROSE, NOT OF AN OBJECT WRAPPER, AND THE ASYMMETRY IS LOAD-BEARING.**
 * The two tics worth forgiving -- a fence, and a sentence before the array -- put no
 * `{` in front of the opening bracket. A reply shaped `{"items": [...]}` does, and
 * taking the inner array out of it is the one tolerance that can go badly wrong:
 * `{"items": []}` would become a well-formed EMPTY array, which
 * `validateExtraction` then reports as *a considered empty answer* -- **the model
 * saying "there is nothing worth remembering about this person"** -- from a reply
 * that was actually the wrong shape. That is exactly the confusion
 * `all_items_dropped` exists to prevent, one level up. So a `{` before the first `[`
 * is `unparseable`: nothing is written, the hash does not move, the next completed run
 * retries, and `memory.profile_written` carries an accurate reason.
 */
function parseArray(raw: string): unknown[] | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : trimmed).trim();

  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return null;
  if (body.slice(0, start).includes('{')) return null;

  try {
    const value: unknown = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
