/**
 * One blog document, translated by a model. **v0.5.0 / A6, added 2026-07-30.**
 *
 * **IT RETURNS A DOCUMENT AND STORES NOTHING.** The route hands it to the editor, the
 * admin reads it and edits it, and `POST /api/admin/blog` is still the only thing that
 * writes — with the same zod parse, the same lint and the same resolution every hand-typed
 * save goes through. Machine output gets no shortcut past the gates.
 *
 * ── IT SEEDS A DRAFT, AND §8.2 SURVIVES ────────────────────────────────────
 *
 * `## Localization` rule 3 and S6 §8.2 say the English is **rewritten, not translated**.
 * A button that produces English from Indonesian is in tension with that, and
 * `blogTranslate.ts`'s header states the tension rather than papering over it. What
 * resolves it is that this fills a FORM: the admin edits afterwards, which is what a
 * human translator does anyway, and `divergenceAdvisory()` still reports at publish time
 * if the result reads as a translation. **The blank page is what is being removed.**
 *
 * ── THE `op` IS `'translation'`, AND THE ATTRIBUTION CAVEAT IS RECORDED ────
 *
 * Roadmap §11.3: *"A3 groups by `op` and must not invent a tenth value or an alias.
 * Nine, closed."* This is a translation, so it reuses the value rather than proposing a
 * tenth — that would be a reconciliation question, not a local call.
 *
 * **THE COST OF THAT, SAID OUT LOUD:** one article is ~3,000 input and ~3,000 output
 * tokens against a reading translation's ~150 words, so A3's *cost per `translation`*
 * mixes two quantities of very different size. What distinguishes them today is
 * `llm_calls.user_id` — an operator here, a querent there — and there is exactly one
 * operator. **If A3's breakdown ever reads wrong, this is why**, and the fix is a tenth
 * `op` through reconciliation rather than a filter somebody adds to one query.
 *
 * ── `callClass: 'deferred'`, WHICH IS NOT THE OBVIOUS CHOICE ───────────────
 *
 * The admin IS waiting, so `'interactive'` looks right. It is wrong: that tier exists so
 * a reading a QUERENT is waiting for is shed last, and `LLM_WINDOW_CALL_CEILING` is
 * fleet-wide. **An operator convenience must be shed before somebody's reading is**, and
 * the cost of being right about that is a button that occasionally says "try again
 * later" — which is exactly what it should say when the window is nearly spent.
 */
import 'server-only';

import { getProvider } from '@/lib/llm';
import type { Locale } from '@/lib/i18n/locale';
import {
  applySegments,
  buildBlogTranslationPrompt,
  extractSegments,
  MAX_SEGMENTS,
  namesInDocument,
  parseSegments,
  verifyBlogTranslation,
  type BlogTranslationViolation,
} from '@/lib/content/blogTranslate';
import type { LintDoc } from '@/lib/content/lint';

export type AutoTranslateResult =
  | { ok: true; doc: LintDoc; violations: BlogTranslationViolation[]; segments: number }
  | { ok: false; reason: 'empty' | 'too-long' | 'unparseable' | 'count' | 'failed'; detail: string };

/**
 * Translate `source` into `to`. Never throws; every failure is a stated reason the
 * editor renders as a sentence.
 *
 * **A REFUSAL IS THE GOOD OUTCOME WHEN ANYTHING IS OFF.** Half a translated document is
 * worse than none, because it looks finished — so a truncated reply, a dropped segment
 * or an unparseable one all come back as `ok: false` and the form is left alone.
 */
export async function autoTranslateDocument(
  source: LintDoc,
  to: Locale,
): Promise<AutoTranslateResult> {
  const segments = extractSegments(source);

  if (segments.every((s) => s.trim().length === 0)) {
    return { ok: false, reason: 'empty', detail: 'Dokumen sumber masih kosong.' };
  }
  /*
   * A single call keeps the whole article in one context, which is what lets the register
   * stay consistent across sixty segments — chunking gives paragraph one one voice and
   * paragraph forty another. The cost is a ceiling, and **the honest answer above it is to
   * say so** rather than translate the first half.
   */
  if (segments.length > MAX_SEGMENTS) {
    return {
      ok: false,
      reason: 'too-long',
      detail: `Artikel ini punya ${segments.length} potongan teks, di atas batas ${MAX_SEGMENTS}. Terjemahkan per bagian.`,
    };
  }

  const prompt = buildBlogTranslationPrompt({
    segments,
    from: source.locale,
    to,
    names: namesInDocument(segments),
  });

  let raw: string;
  try {
    const { text } = await getProvider().complete(prompt, {
      op: 'translation',
      callClass: 'deferred',
    });
    raw = text;
  } catch (err) {
    /*
     * **THE ERROR OBJECT IS NOT LOGGED.** Nothing here binds a database parameter, but an
     * LLM error can carry the request body — which on this path is the whole article —
     * and the rule is applied without exception because this is not the file in which to
     * reason about one.
     */
    console.error('[blog-translate] provider failed', {
      name: err instanceof Error ? err.name : typeof err,
      segments: segments.length,
    });
    return { ok: false, reason: 'failed', detail: 'Model tidak menjawab. Coba lagi.' };
  }

  const parsed = parseSegments(raw, segments.length);
  if (!parsed.ok) {
    return parsed.reason === 'unparseable'
      ? { ok: false, reason: 'unparseable', detail: 'Jawaban model tidak bisa dibaca. Coba lagi.' }
      : {
          ok: false,
          reason: 'count',
          detail: `Model mengembalikan ${parsed.got} dari ${parsed.expected} potongan — kemungkinan jawabannya terpotong. Tidak ada yang diubah.`,
        };
  }

  const violations = verifyBlogTranslation({ source: segments, translated: parsed.texts });

  /*
   * **A CARD NAME LOST IS A REFUSAL, NOT A WARNING.** `## Card data`: a reading refers to
   * The Moon, and a card labelled anything else disagrees with the text underneath it —
   * and the `card-names` lint would refuse the save anyway, so accepting it here would
   * only move the failure to a place with less context. The other two kinds are reported
   * and the document is returned.
   */
  const lostNames = violations.filter((v) => v.kind === 'card_name');
  if (lostNames.length > 0) {
    return {
      ok: false,
      reason: 'failed',
      detail: `Model menerjemahkan nama kartu (${[...new Set(lostNames.map((v) => v.detail))].join(', ')}). Tidak ada yang diubah.`,
    };
  }

  /*
   * `applySegments` throws only on a count mismatch, which `parseSegments` has already
   * ruled out — so this cannot throw today. It is inside the guard anyway: the day
   * somebody adds a transform between the two, the failure should be a stated refusal
   * rather than a 500 on an admin page.
   */
  try {
    return {
      ok: true,
      doc: { ...applySegments(source, parsed.texts), locale: to },
      violations,
      segments: segments.length,
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'count',
      detail: err instanceof Error ? err.message : 'Struktur dokumen tidak cocok.',
    };
  }
}
