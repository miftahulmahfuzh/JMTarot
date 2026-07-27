/**
 * The pure half of the translator: the registry, the prompt, the sanitizer, the
 * invariant checker.
 *
 * SPLIT FROM `translate.ts` the way `lotus.ts` is split from `lotus.generate.ts`
 * and `prompt/memory.ts` from `gist.generate.ts`, and for the identical reason:
 * everything here has an interesting failure mode and is unit-testable with no
 * provider and no database, and the moment a model call lives beside it that stops
 * being true.
 *
 * ── WHY THE TRANSLATION PROMPT IS NOT "TRANSLATE THIS TO ENGLISH" ─────────────
 *
 * Roadmap §7's first trap, and the code somebody writes from a one-line summary of
 * it is wrong. This is the worst-shaped injection surface in the project:
 *
 *   THE INPUT IS MODEL OUTPUT THAT WAS ITSELF GENERATED FROM USER TEXT. The
 *   querent's typed question already passed `sanitizeQuestion`, but a reading body
 *   is a MODEL's rendering of it — so a reading whose injection partly succeeded
 *   wrote prose that is now handed to a second model as content.
 *
 *   THE OUTPUT GOES STRAIGHT TO A SCREEN, with no reader, no persona and no
 *   contract between it and the querent.
 *
 * So the prompt carries the target locale's format rules, the target locale's
 * forbidden vocabulary, the target reader's voice rules, the word ceiling and the
 * card-name rule — because NONE OF THAT SURVIVES a naive translate instruction.
 * CLAUDE.md records the specific failure: the model invents "Pulan" for The Moon.
 * A rule against a failure the model was never going to make does nothing; a
 * missing rule against a failure it WILL make is a shipped bug.
 *
 * NO `import 'server-only'`, DELIBERATELY. W7's `vitest.config.ts` aliases that
 * package away so the marker would be free here — but `scripts/smoke-llm.ts`
 * imports this module for `npm run smoke -- --translate`, and scripts still throw.
 * The marker goes on `translate.ts`, where the provider and the database actually
 * are. The client fence is `clientBoundary.test.ts`'s job and it names this
 * directory with no exception.
 */
import { CARDS } from '@/data/deck';
import { READERS } from '@/data/readers';
import type { Locale, ReaderId, ServiceId } from '@/data/types';
import { EN_TICS, MALAY, THERAPY_EN, THERAPY_ID } from '@/lib/copy/vocab';
import { FORMAT_RULES } from '@/lib/prompt/base';
import { budgetFor, type LengthBudget } from '@/lib/prompt/budget';
import { MEMORY_GIST_MAX_WORDS } from '@/lib/prompt/memory';
import { readerPrompt } from '@/lib/prompt/readers';
import { stripUntrusted } from '@/lib/prompt/sanitize';
import { SUMMARY_MAX_WORDS } from '@/lib/prompt/summary';
import type { CompletionPrompt } from '@/lib/llm/types';
import type { FieldSpec } from './keys';

/*
 * THE REGISTRY AND THE KEY TYPES LIVE IN `./keys`, AND ARE RE-EXPORTED HERE.
 *
 * They were in this file until `src/lib/db/queries/translations.ts` needed
 * `TRANSLATABLE_ENTITIES` — and this module imports `@/lib/prompt/base`, which
 * carries `import 'server-only'`, so a query module would have picked the marker up
 * transitively. `queries/contract.test.ts` rule 3 exists to prevent exactly that:
 * those modules run in `scripts/db-seed.ts`, which has no React runtime.
 *
 * Re-exported rather than relocated in the interface, so that V3/V6/V7/V8 import
 * from `@/lib/translate/contract` exactly as V2's plan declares and do not have to
 * know which of the two files a name lives in.
 */
export {
  TRANSLATABLE,
  TRANSLATABLE_ENTITIES,
  TRANSLATION_PROMPT_VERSION,
  isTranslatableKey,
  type FieldSpec,
  type TranslatableEntity,
  type TranslatableField,
  type TranslatableKey,
} from './keys';

// ---------------------------------------------------------------------------
// The source
// ---------------------------------------------------------------------------

/**
 * Clean the source prose, PRESERVING ITS PARAGRAPHS (T6).
 *
 * NEVER `stripUntrusted(whole)`. That is `gistUserTurn`'s trap arriving a second
 * time and it is worth the four extra lines: `stripUntrusted` collapses `\r\n\t` to
 * spaces, so a four-paragraph reading arrives as one paragraph, the prompt's
 * "produce exactly N paragraphs" instruction becomes "produce exactly 1", and the
 * output is a wall of text that reads as a PROMPT failure rather than a sanitizer
 * failure. Paragraph structure is the one structural invariant a translation has.
 *
 * Empty paragraphs are dropped rather than kept: a paragraph made entirely of a
 * delimiter would otherwise survive as an empty one, be counted in N, and ask the
 * model for a paragraph there is no material for.
 */
export function sanitizeSource(raw: string): string {
  return raw
    .split(/\n\s*\n/)
    .map((paragraph) => stripUntrusted(paragraph))
    .filter((paragraph) => paragraph.length > 0)
    .join('\n\n');
}

/** How many paragraphs the model must produce. Counted in code, never asked for. */
export function paragraphsOf(source: string): string[] {
  return source
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Every proper name in the source that must survive verbatim.
 *
 * CARD NAMES ARE ENGLISH IN BOTH LOCALES (Localization rule 1), and so are reader
 * names, so this invariant is DIRECTION-SYMMETRIC and exactly checkable with
 * `includes()` — no NLP, one comparison per name. That is what makes T4 a
 * mechanical post-check rather than only a prompt rule, and the prompt rule alone
 * is what produced "Pulan".
 *
 * LONGEST FIRST, and each name once. "The Empress" is not a substring of "The
 * Emperor", but the general shape is real, and reporting a shorter name that only
 * appeared inside a longer one would demand a string the output legitimately does
 * not contain — a false `card_name` violation, which under T5 costs a correct
 * translation its cache row.
 *
 * CASE-SENSITIVE AND WORD-BOUNDED. `moon` in "a moonlit night" is not a card.
 */
const PROPER_NAMES: readonly string[] = [
  ...CARDS.map((c) => c.name),
  ...READERS.map((r) => r.name),
].sort((a, b) => b.length - a.length);

export function namesIn(source: string): string[] {
  const found: string[] = [];
  /*
   * Names already claimed are blanked out of the haystack as they are found, so a
   * shorter name that exists only inside a longer one is not reported a second
   * time. Blanking with spaces rather than deleting keeps every remaining word
   * boundary where it was.
   */
  let haystack = source;
  for (const name of PROPER_NAMES) {
    const at = boundedIndexOf(haystack, name);
    if (at === -1) continue;
    found.push(name);
    haystack = haystack.replaceAll(name, ' '.repeat(name.length));
  }
  // Source order, so the prompt's names block reads in the order the model will
  // meet them. `found` is in longest-first order at this point.
  return found.sort((a, b) => boundedIndexOf(source, a) - boundedIndexOf(source, b));
}

/** `indexOf` that refuses a match glued to a letter on either side. */
function boundedIndexOf(haystack: string, needle: string): number {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return -1;
    const before = haystack[at - 1];
    const after = haystack[at + needle.length];
    if (!isWordChar(before) && !isWordChar(after)) return at;
    from = at + 1;
  }
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type ViolationKind =
  | 'card_name'
  | 'reader_name'
  | 'paragraphs'
  | 'markdown'
  | 'emoji'
  | 'forbidden'
  | 'tic'
  | 'malay'
  | 'budget'
  | 'empty';

export type Violation = { kind: ViolationKind; detail: string };

/** The regexes, lifted from `scripts/smoke-llm.ts`'s `check()` rather than rewritten. */
const MARKDOWN = /\*\*|(?:^|\s)\*\w|^#{1,6}\s|^\s*[-•]\s|^\s*\d+\.\s/m;
const EMOJI = /\p{Extended_Pictographic}/u;
const CLOSING_OFFER = /\b(let me know|feel free to|if you'?d like|happy to|i hope this helps)\b/i;

const READER_NAMES: readonly string[] = READERS.map((r) => r.name);

/**
 * Which ceiling applies, resolved through `budgetFor` so Margaret's per-reader
 * override binds here exactly as it binds in the prompt.
 *
 * THE SAME RESOLVED OBJECT THE PROMPT INTERPOLATES. That is the whole point of
 * `budget.ts` existing: a check that asserted a different number from the one the
 * prose asked for would fail on correct behaviour, and a check that fails on
 * correct behaviour is one people learn to ignore.
 */
function ceilingFor(
  spec: FieldSpec,
  target: Locale,
  readerId: ReaderId | null,
  serviceId: ServiceId | null,
): LengthBudget {
  if (spec.budget === 'gist') {
    return {
      maxParagraphWords: MEMORY_GIST_MAX_WORDS,
      minTotalWords: 1,
      maxTotalWords: MEMORY_GIST_MAX_WORDS,
    };
  }
  if (spec.budget === 'summary') {
    return { maxParagraphWords: SUMMARY_MAX_WORDS, minTotalWords: 1, maxTotalWords: SUMMARY_MAX_WORDS };
  }
  /*
   * A `service` budget with no reader or service is not a shape the registry can
   * produce — `reading.body` always has both — but the arguments are nullable
   * because the gist and the persona have neither, so the fallback is stated
   * rather than asserted. `spread3` and the default reader give the tightest
   * honest ceiling.
   */
  return budgetFor(target, serviceId ?? 'spread3', readerId ?? 'thessaly');
}

/**
 * Every invariant the base contract enforces, re-enforced on the translation.
 *
 * THE FUNCTION EVERY TEST IN THIS WORKSTREAM LEANS ON, and the one that decides
 * what gets persisted: `translate.ts` writes a row only when this returns empty.
 *
 * `empty` SHORT-CIRCUITS EVERYTHING ELSE. An empty output trivially fails the
 * name, paragraph and budget checks too, and four violations for one failure would
 * make `translation.generated`'s `violation` prop meaningless — it carries the
 * FIRST kind, so the first one has to be the true one.
 */
export function verifyTranslation(args: {
  source: string;
  output: string;
  spec: FieldSpec;
  target: Locale;
  readerId: ReaderId | null;
  serviceId: ServiceId | null;
}): Violation[] {
  const { source, output, spec, target, readerId, serviceId } = args;
  const out: Violation[] = [];
  const text = output.trim();

  if (text.length === 0) return [{ kind: 'empty', detail: 'nothing usable came back' }];

  /*
   * T4. The mechanical half of the card-name rule. Every name the source used must
   * appear verbatim, because card and reader names are English in both locales.
   */
  for (const name of namesIn(source)) {
    if (text.includes(name)) continue;
    out.push({
      kind: READER_NAMES.includes(name) ? 'reader_name' : 'card_name',
      detail: name,
    });
  }

  /*
   * The one structural invariant. `ReadingView` renders paragraph for paragraph, so
   * a 4 -> 1 collapse is a wall of text where a spread should be.
   */
  const want = paragraphsOf(source).length;
  const got = paragraphsOf(text).length;
  if (want !== got) {
    out.push({ kind: 'paragraphs', detail: `source has ${want}, output has ${got}` });
  }

  if (MARKDOWN.test(text)) out.push({ kind: 'markdown', detail: 'markdown found' });
  if (EMOJI.test(text)) out.push({ kind: 'emoji', detail: 'emoji found' });

  /*
   * THE THERAPY LIST BINDS IN BOTH LOCALES — it is the one content rule that is not
   * a locale tic — and each locale gets its OWN list. The English one is longer, not
   * a translation, and it is the one that applies when translating INTO English.
   */
  for (const word of target === 'en' ? THERAPY_EN : THERAPY_ID) {
    if (matchesWord(text, word)) out.push({ kind: 'forbidden', detail: word });
  }

  /*
   * THE MALAY GREP IS `id`-ONLY AND THE TIC LIST IS `en`-ONLY (W6 rule 4). Running
   * `kerana` against English output is theatre, and running `dear one` against
   * Indonesian output is the same theatre mirrored. Whichever locale we translate
   * INTO gets that locale's list.
   */
  if (target === 'id') {
    for (const word of MALAY) {
      if (matchesWord(text, word)) out.push({ kind: 'malay', detail: word });
    }
  } else {
    for (const tic of EN_TICS) {
      // The apostrophe class, from the smoke script: `soul's journey` must also
      // catch the typographic form.
      if (new RegExp(tic.replace(/'/g, "['’]"), 'i').test(text)) {
        out.push({ kind: 'tic', detail: tic });
      }
    }
    if (CLOSING_OFFER.test(text)) out.push({ kind: 'tic', detail: 'closing offer' });
  }

  const budget = ceilingFor(spec, target, readerId, serviceId);
  for (const [i, paragraph] of paragraphsOf(text).entries()) {
    const words = paragraph.split(/\s+/).filter(Boolean).length;
    if (words > budget.maxParagraphWords) {
      out.push({
        kind: 'budget',
        detail: `paragraph ${i + 1} is ${words} words, ceiling ${budget.maxParagraphWords}`,
      });
    }
  }

  return out;
}

/**
 * `\b` around a phrase, with the phrase's own regex characters escaped.
 *
 * `hala tuju` and `inner child` are two words, so a naive `\b${word}\b` is right
 * but only if nothing in the word is a metacharacter. Nothing in the lists is
 * today; escaping costs one line and means a word added later cannot silently turn
 * into a pattern.
 */
function matchesWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
}

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------

/**
 * The token ceiling. A RUNAWAY GUARD, NOT THE LENGTH CONTROL — the same
 * relationship `MAX_TOKENS.spread3` has to the 40-word rule, and the word ceiling
 * in the prose is what actually binds.
 *
 * Indonesian tokenizes at roughly 3.2 characters per token on an English-tuned BPE
 * and English at roughly 4, so `chars / 2` is comfortably double in both
 * directions. The floor keeps a one-clause gist from being cut off; the cap keeps
 * a pathological source from asking for a novel.
 */
export function translationMaxTokens(sourceChars: number): number {
  return Math.min(1200, Math.max(180, Math.ceil(sourceChars / 2)));
}

const LANGUAGE_NAME: Record<Locale, Record<Locale, string>> = {
  id: { id: 'bahasa Indonesia', en: 'bahasa Inggris' },
  en: { id: 'Indonesian', en: 'English' },
};

/**
 * Build the translation prompt.
 *
 * ── THE ORDER THE MODEL READS IT IN, AND WHY EACH PIECE IS THERE ─────────────
 *
 *  1. THE TASK, STATED AS A RE-ISSUE AND NOT AS A TRANSLATION. "Produce the
 *     English the reader would have written, not a rendering of the Indonesian."
 *     This framing is the single biggest lever on whether Margaret comes back as
 *     Margaret or as Thessaly with longer words, which is roadmap §9's named risk.
 *  2. `readerPrompt(reader, target)` when the field is voiced — the target
 *     locale's persona block, verbatim, the same string a native reading of that
 *     reader would have carried.
 *  3. `FORMAT_RULES[target]`, and NOT `baseContract`. Telling a model it is a
 *     tarot reader writing one reading in one pass, while asking for a
 *     translation, produces a new reading. Same call `side.ts` and W5 made.
 *  4. THE NAMES BLOCK — every name `namesIn` found, listed explicitly with the
 *     rule stated against it. Handing the model the list is what makes T4's
 *     mechanical check PASS rather than merely detect.
 *  5. THE WORD CEILING, from the same resolved `LengthBudget` the verifier
 *     asserts against, RESTATED LAST — after the thing that invites elaboration.
 *     That is the pattern `services.ts`, the day summary and the frequency verdict
 *     all converged on independently, and W5 recorded both of its generated
 *     prompts overshooting on the first real run until it was applied.
 *  6. THE PARAGRAPH COUNT, counted in code and interpolated. Without it a
 *     four-paragraph spread comes back as one block.
 *
 * The user turn is the sanitized source inside `<terjemahan>` and nothing else:
 * rules where rules live, material where material lives (M10). Same shape as
 * `<pertanyaan>`.
 */
export function buildTranslationPrompt(args: {
  source: string;
  sourceLocale: Locale;
  target: Locale;
  spec: FieldSpec;
  readerId: ReaderId | null;
  serviceId: ServiceId | null;
  /** Set on the repair pass only. Names what the first pass got wrong. */
  repairing?: Violation[];
}): CompletionPrompt {
  const { source, sourceLocale, target, spec, readerId, serviceId, repairing } = args;

  const names = namesIn(source);
  const paragraphs = paragraphsOf(source).length;
  const budget = ceilingFor(spec, target, readerId, serviceId);
  const voice = spec.voiced && readerId ? readerPrompt(readerId, target) : null;

  const blocks: string[] = [
    target === 'id'
      ? taskId({ sourceLocale, paragraphs, voiced: voice !== null })
      : taskEn({ sourceLocale, paragraphs, voiced: voice !== null }),
  ];

  if (voice) blocks.push(voice);

  blocks.push(FORMAT_RULES[target]);

  if (names.length > 0) blocks.push(namesBlock(names, target));

  if (repairing && repairing.length > 0) blocks.push(repairBlock(repairing, target));

  /*
   * LAST, AND LAST ON THE REPAIR PASS TOO — which is why the repair block goes
   * above rather than below. "Fix all of these and change nothing else" is exactly
   * the kind of instruction that invites elaboration, and one of the things it may
   * be asking the model to fix IS the ceiling. A repair pass that restated the
   * violations after the limit would put the limit back where W5 measured it not
   * working.
   */
  blocks.push(lengthBlock({ target, paragraphs, maxParagraphWords: budget.maxParagraphWords }));

  return {
    system: blocks.join('\n\n'),
    user: `<terjemahan>\n${source}\n</terjemahan>`,
    maxTokens: translationMaxTokens(source.length),
  };
}

function taskId(a: { sourceLocale: Locale; paragraphs: number; voiced: boolean }): string {
  const from = LANGUAGE_NAME.id[a.sourceLocale];
  const who = a.voiced
    ? 'Kamu adalah pembaca yang menulisnya, dan gayamu ada di bawah ini.'
    : 'Suaranya netral — bukan suara pembaca mana pun.';
  return `TUGAS: teks di dalam <terjemahan> ditulis dalam ${from}. Tulis ulang teks itu dalam bahasa Indonesia.

${who}

Ini BUKAN penerjemahan kata per kata. Tulis apa yang akan kamu tulis kalau dari awal kamu menulisnya dalam bahasa Indonesia: isinya sama, urutannya sama, tapi kalimatnya kalimat Indonesia, bukan kalimat ${from} yang dipindahkan.
${a.voiced ? `\n${REGISTER_ID}\n` : ''}
Keluarkan HANYA teks hasilnya. Jangan beri pengantar, jangan beri catatan, jangan sebut bahwa ini terjemahan, dan jangan sertakan teks aslinya.`;
}

function taskEn(a: { sourceLocale: Locale; paragraphs: number; voiced: boolean }): string {
  const from = LANGUAGE_NAME.en[a.sourceLocale];
  const who = a.voiced
    ? 'You are the reader who wrote it, and your voice rules are below.'
    : 'The voice is neutral — it is no reader’s voice.';
  return `TASK: the text inside <terjemahan> was written in ${from}. Re-write it in English.

${who}

This is NOT a word-for-word translation. Produce the English you would have written had you written it in English from the start: the same content in the same order, but English sentences, not ${from} sentences moved across.
${a.voiced ? `\n${REGISTER_EN}\n` : ''}
Output ONLY the resulting text. No preamble, no notes, no mention that this is a translation, and do not include the original.`;
}

/**
 * REGISTER IS NOT CARRIED BY THE PERSONA BLOCK ALONE, AND MEASUREMENT IS WHY THIS
 * PARAGRAPH EXISTS.
 *
 * `npm run smoke -- --translate`, first real run: Adrian's English TRANSLATIONS came
 * back at **0.00 contractions per 100 words** while his native English generation
 * uses them freely ("What's done", "isn't a tragedy"). His `readers.en.ts` block says
 * *"Contractions throughout"* in as many words and was being carried verbatim — the
 * model simply weighted the act of translating above it, which is the register every
 * translation drifts toward.
 *
 * That is roadmap §9's named risk arriving exactly as predicted — *"Margaret
 * translated by a generic prompt comes back as Thessaly with longer words"* — and it
 * is invisible to every other check: a flattened Adrian still reproduces every card
 * name, still hits the paragraph count, still avoids every forbidden word. The
 * contraction proxy is the only thing that sees it.
 *
 * So the voice rules are stated to OUTRANK the source, explicitly, rather than merely
 * being present. `--translate`'s contraction proxy is what says whether this is still
 * working; if it regresses, this paragraph is the thing to strengthen, not the check.
 */
const REGISTER_EN = `YOUR VOICE RULES OUTRANK THE SOURCE. The text you are reading has its own register, and it is not yours. Punctuation, sentence length, formality, and contractions are governed by your voice rules below and NOT by how the original happened to sound. If your rules ask for contractions, write them throughout even where the source has none; if your rules forbid them, use none even where the source is full of them.`;

const REGISTER_ID = `ATURAN SUARAMU MENGALAHKAN TEKS ASLINYA. Teks yang kamu baca punya register sendiri, dan itu bukan registermu. Panjang kalimat, tanda baca, dan tingkat formalitas ditentukan oleh aturan suaramu di bawah, BUKAN oleh bagaimana teks aslinya terdengar. Kalau aturanmu meminta bahasa sehari-hari, tulis begitu meskipun aslinya kaku; kalau aturanmu meminta kalimat panjang beranak kalimat, tulis begitu meskipun aslinya pendek-pendek.`;

/**
 * The names block. HANDING THE MODEL THE LIST is what makes the mechanical check
 * pass rather than merely detect.
 *
 * The rule names all three failure shapes rather than one, because a rule against
 * a failure the model was never going to make is a rule that does nothing:
 * translating the name is the Indonesian failure ("Pulan"), and glossing it in
 * brackets or lowercasing it are the English ones. `base.en.ts`'s header already
 * spends a paragraph on exactly this asymmetry.
 */
function namesBlock(names: readonly string[], target: Locale): string {
  const list = names.map((n) => `- ${n}`).join('\n');
  return target === 'id'
    ? `NAMA YANG MUNCUL DI TEKS DI BAWAH:
${list}

Tulis setiap nama itu SAMA PERSIS, dalam bahasa Inggris, lengkap dengan "The" dan huruf besarnya. Jangan menerjemahkan satu pun, jangan mengarang nama lain, jangan menambah keterangan dalam tanda kurung, dan jangan mengubah huruf besar-kecilnya.`
    : `NAMES THAT APPEAR IN THE TEXT BELOW:
${list}

Reproduce each one EXACTLY, in English, with its article and its capitals. Never translate one, never invent another, never gloss one in brackets, and never lowercase one.`;
}

/**
 * The length ceiling, stated as the pattern that works: N sentences AND M words,
 * whichever comes first, restated after the thing that invites elaboration.
 *
 * `maxParagraphWords` is the RESOLVED value, including Margaret's override, so the
 * number in the prose and the number `verifyTranslation` asserts are the same
 * object. Two copies of a tuned number is what `budget.ts` exists to prevent.
 */
function lengthBlock(a: { target: Locale; paragraphs: number; maxParagraphWords: number }): string {
  return a.target === 'id'
    ? `BENTUK: tepat ${a.paragraphs} paragraf, urutannya sama seperti aslinya. Jangan menggabungkan dua paragraf jadi satu, dan jangan memecah satu jadi dua.

PANJANG: maksimal ${a.maxParagraphWords} kata per paragraf. Hitung sambil menulis. Kalau kalimatmu memang panjang, tulis lebih sedikit kalimat — jangan lewati batas katanya.`
    : `SHAPE: exactly ${a.paragraphs} paragraphs, in the same order as the original. Do not merge two into one, and do not split one into two.

LENGTH: at most ${a.maxParagraphWords} words per paragraph. Count as you write. If your sentences run long, write fewer of them — do not go over the word limit.`;
}

/**
 * The repair pass names what the first pass got wrong (T5).
 *
 * Without this, the second call is the first call again and a `repaired` outcome
 * would be indistinguishable from luck. The violation DETAILS are safe to
 * interpolate — they are card names, reader names, forbidden words and paragraph
 * counts, all from closed sets — but they are the only part of a violation that
 * ever reaches a prompt.
 */
function repairBlock(violations: readonly Violation[], target: Locale): string {
  const list = violations.map((v) => `- ${v.kind}: ${v.detail}`).join('\n');
  return target === 'id'
    ? `PERCOBAAN SEBELUMNYA GAGAL pada hal-hal berikut. Perbaiki semuanya, dan jangan ubah apa pun yang lain:
${list}`
    : `A PREVIOUS ATTEMPT FAILED on the following. Fix all of them, and change nothing else:
${list}`;
}
