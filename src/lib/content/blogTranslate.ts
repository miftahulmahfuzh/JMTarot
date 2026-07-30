/**
 * Auto-translating one blog document into the other language. **PURE.**
 *
 * v0.5.0 / A6, added 2026-07-30 on Miftah's request: *"help admin do this easier by
 * facilitating them using LLM translation."*
 *
 * ── IT SEEDS A DRAFT. IT DOES NOT SETTLE §8.2 ───────────────────────────────
 *
 * **`## Localization` rule 3 and S6 §8.2 both say the English is REWRITTEN, NOT
 * TRANSLATED**, and `blog.content.test.ts` enforced it over the launch pair with four
 * assertions that all fail by SAMENESS — different `cardRef` cards, a section the other
 * lacks, a different recommended set, a different title and description. R44 narrowed
 * that to the two committed slugs because it is a fact about them rather than about *an*
 * article, and A6-15 made it `divergenceAdvisory()`: surfaced at publish time, never
 * blocking.
 *
 * A button that produces English from Indonesian is in tension with that rule and it
 * would be dishonest to pretend otherwise. **What resolves it is where the output goes:
 * this fills the EDITOR FORM and stores nothing.** The admin then edits — which is what
 * a human translator does anyway — and `divergenceAdvisory()` still tells them at
 * publish time if the result reads as a translation. The blank page is the thing being
 * removed, not the rewriting.
 *
 * ── THE MODEL NEVER SEES THE STRUCTURE, SO IT CANNOT BREAK IT ───────────────
 *
 * **THE LOAD-BEARING DECISION IN THIS FILE.** The obvious design hands the model the
 * `Block[]` as JSON and asks for JSON back. That design loses: it can invent a sixth
 * kind, drop a `heading.id`, translate a `link.path`, renumber a list, or return
 * something that does not parse — and every one of those is a defect in a document the
 * admin then saves.
 *
 * So the document is flattened to a NUMBERED LIST OF HUMAN-READABLE STRINGS, the model
 * returns the same numbers, and the strings are put back positionally.
 * **`applySegments` cannot change the shape of anything**: block kinds, ordering,
 * `heading.id`, `link.path`, `cardRef.slug` and `hero.cardUrlSlug` are never in the list
 * and are copied through untouched. A count mismatch is a refusal, not a merge.
 *
 * That is the same instinct as `choice.ts` — *the model picks and code validates* — and
 * `blockSchema.ts`'s, where the write path is the gate rather than the renderer.
 *
 * ── WHAT IS DELIBERATELY NOT TRANSLATED ─────────────────────────────────────
 *
 * **`heading.id` STAYS BYTE-IDENTICAL.** `blocks.ts`: *"English in both locales, like
 * every other id and slug in this app."* An anchor is an interface — `/blog/x#next` is
 * linked from elsewhere — and a per-locale anchor set would make
 * `contentAlternates()`'s clean `/blog/X` <-> `/en/blog/X` mapping a lie one level down.
 *
 * **CARD NAMES STAY ENGLISH**, which is `## Card data`'s rule and the reason V2's
 * `namesIn` exists: the prompt rule alone produced *"Pulan"* for The Moon, so the check
 * is MECHANICAL as well. Here the direction is `id` -> `en`, where a card name is
 * already English and the risk is the model helpfully re-rendering it — the check is the
 * same either way.
 */
import type { Locale } from '@/lib/i18n/locale';
import { namesIn } from '@/lib/translate/contract';

/**
 * **RE-EXPORTED, NOT REDEFINED.** The walk lives in `blogSegments.ts` because the editor
 * needs it and the editor is a client component, while this file imports
 * `@/lib/translate/contract` — which `clientBoundary.test.ts` fences from client
 * components because it carries prompt prose. Server callers get both from one import.
 */
export { applySegments, extractSegments } from './blogSegments';

/**
 * The cap, and it is a REFUSAL rather than a truncation.
 *
 * A single call keeps the whole article in one context, which is what lets the model
 * keep a consistent register across sixty segments — chunking would produce paragraph
 * one in one voice and paragraph forty in another. The cost is that a long enough
 * article does not fit, and **the honest answer to that is to say so**, not to translate
 * the first half. Sixty segments is roughly a 2,000-word article; the launch pair are 34
 * and 49 blocks.
 */
export const MAX_SEGMENTS = 120;

/** Output tokens to allow. Generous, because a refusal on truncation costs the call. */
export function blogTranslationMaxTokens(sourceChars: number): number {
  /*
   * ~4 chars per token, doubled for the target language plus the numbering, floored so a
   * short document still has room, and capped so a runaway cannot bill the whole window.
   * It is a RUNAWAY GUARD, not a length control -- the same role `MAX_TOKENS.spread3`
   * plays, and the length here is fixed by the source.
   */
  return Math.min(8000, Math.max(500, Math.ceil((sourceChars / 4) * 2.2)));
}

const LANGUAGE: Record<Locale, string> = { id: 'Indonesian', en: 'English' };

/**
 * The prompt. **RULES IN THE SYSTEM TURN, MATERIAL IN THE USER TURN** (M10), and the
 * segments are fenced — the sixth fence in this project, for V2's stated reason: *what
 * it fences is text that reaches a screen, handed to a model as material.*
 *
 * The numbering is restated three times on purpose. It is the one thing that makes the
 * output reassemblable, and a model that returns fifty-nine lines for sixty segments has
 * produced nothing usable.
 */
export function buildBlogTranslationPrompt(args: {
  segments: readonly string[];
  from: Locale;
  to: Locale;
  /** Card and reader names present in the source. Handed over so the rule can PASS. */
  names: readonly string[];
}): { system: string; user: string; maxTokens: number } {
  const { segments, from, to, names } = args;
  const chars = segments.join('').length;

  const namesBlock =
    names.length > 0
      ? `\n\nNAMA YANG TIDAK BOLEH DIUBAH, salin persis seperti tertulis:\n${names
          .map((n) => `- ${n}`)
          .join('\n')}`
      : '';

  const system = [
    `Kamu menerjemahkan artikel tentang tarot dari ${LANGUAGE[from]} ke ${LANGUAGE[to]}.`,
    '',
    `Kamu menerima ${segments.length} potongan teks bernomor. Kembalikan PERSIS ${segments.length} potongan,`,
    'dengan nomor yang sama, satu per baris, dalam format:',
    '',
    '1| <terjemahan potongan 1>',
    '2| <terjemahan potongan 2>',
    '',
    'ATURAN:',
    `- Kembalikan tepat ${segments.length} baris. Tidak lebih, tidak kurang. Jangan menggabungkan atau memecah potongan.`,
    '- Satu potongan menjadi satu baris. Jangan menambahkan baris kosong di antara potongan.',
    '- Jangan menambahkan nomor, judul, komentar, atau penjelasan apa pun di luar format itu.',
    '- Terjemahkan HANYA teksnya. Jangan menambah kalimat dan jangan meringkas.',
    '- Nama kartu tarot tetap dalam bahasa Inggris (The Moon, Death, The Fool, dan seterusnya).',
    '- Pertahankan spasi di awal dan akhir potongan persis seperti aslinya; spasi itu menyambung kata.',
    '- Tulis bahasa yang wajar, bukan terjemahan harfiah. Ini dibaca orang, bukan mesin.',
    '- Jangan memakai kosakata terapi, diagnosis, atau penyembuhan.',
    `- Jangan memakai frasa mistik generik seperti "dear one", "the Universe", "abundance", "sacred", atau "manifest".`,
    '- Jangan menutup dengan tawaran bantuan ("let me know if…", "feel free to…").',
    namesBlock,
  ].join('\n');

  const user = [
    '<terjemahan>',
    ...segments.map((s, i) => `${i + 1}| ${s}`),
    '</terjemahan>',
  ].join('\n');

  return { system, user, maxTokens: blogTranslationMaxTokens(chars) };
}

export type ParseResult =
  | { ok: true; texts: string[] }
  | { ok: false; reason: 'count' | 'unparseable'; got: number; expected: number };

/**
 * `1| text` lines back into an array. **POSITIONAL BY DECLARED NUMBER, NOT BY ORDER.**
 *
 * A model that emits the segments in order but drops one would, with an order-based
 * parse, shift every subsequent string into the wrong slot — a document where paragraph
 * nine is under heading eight, which reads as prose and is wrong everywhere. Reading the
 * number means a drop is a HOLE, and a hole is a count mismatch, and a count mismatch is
 * a refusal.
 */
export function parseSegments(raw: string, expected: number): ParseResult {
  const byIndex = new Map<number, string>();
  for (const line of raw.split('\n')) {
    const m = /^\s*(\d+)\s*\|(.*)$/.exec(line);
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 1 || n > expected || byIndex.has(n)) continue;
    /*
     * **ONLY ONE LEADING SPACE IS EATEN, AND THAT IS DELIBERATE.** The format is
     * `N| text`, so the space after the pipe is a separator; any space beyond it belongs
     * to the segment. `blocks.ts`'s trap in a new costume — `s('Lihat ')`'s trailing
     * space is load-bearing, and `.trim()` here would silently glue spans together.
     */
    byIndex.set(n, m[2].startsWith(' ') ? m[2].slice(1) : m[2]);
  }
  if (byIndex.size === 0) return { ok: false, reason: 'unparseable', got: 0, expected };
  if (byIndex.size !== expected) {
    return { ok: false, reason: 'count', got: byIndex.size, expected };
  }
  return { ok: true, texts: Array.from({ length: expected }, (_, i) => byIndex.get(i + 1)!) };
}

export type BlogTranslationViolation =
  | { kind: 'empty'; detail: string }
  | { kind: 'card_name'; detail: string }
  | { kind: 'untranslated'; detail: string };

/**
 * What the model got wrong, mechanically. `[]` is clean.
 *
 * **NOT A LINT.** `lintDocument` runs over the reassembled document afterwards and is
 * the thing that refuses a save; these are the three failures specific to *having asked
 * a model*, and they are checked on the SEGMENTS because that is where the mapping to
 * the source still exists.
 *
 * `untranslated` is a warning-shaped observation rather than an error: a segment that
 * comes back byte-identical is usually correct (a proper noun, a number, `tarocchi`),
 * and is occasionally the model giving up on one line. Counting them is how the admin
 * notices the second case; refusing on them would refuse the first.
 */
export function verifyBlogTranslation(args: {
  source: readonly string[];
  translated: readonly string[];
}): BlogTranslationViolation[] {
  const { source, translated } = args;
  const out: BlogTranslationViolation[] = [];

  for (const [i, text] of translated.entries()) {
    if (source[i].trim().length > 0 && text.trim().length === 0) {
      out.push({ kind: 'empty', detail: `segmen ${i + 1}` });
    }
    /*
     * **THE CARD-NAME CHECK IS MECHANICAL AND NOT ONLY A PROMPT RULE**, which is V2's
     * finding stated in capitals: the prompt rule alone produced *"Pulan"* for The Moon.
     * `namesIn` is `contract.ts`'s, word-bounded and case-sensitive, and it is checked
     * per segment rather than over the whole document so a name lost from paragraph
     * forty is not hidden by the same name surviving in paragraph two.
     */
    for (const name of namesIn(source[i])) {
      if (!text.includes(name)) out.push({ kind: 'card_name', detail: name });
    }
    if (source[i].trim().length > 24 && source[i] === text) {
      out.push({ kind: 'untranslated', detail: `segmen ${i + 1}` });
    }
  }
  return out;
}

/** Every name the whole document mentions, for the prompt's names block. */
export function namesInDocument(segments: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const s of segments) for (const n of namesIn(s)) seen.add(n);
  return [...seen];
}
