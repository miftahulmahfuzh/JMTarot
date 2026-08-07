import 'server-only';

/**
 * F6, task 2. The attached reading, fenced, as the three readers receive it.
 *
 * ── CLIENT-FENCED, BECAUSE IT CARRIES PROMPT PROSE ──────────────────────────────
 *
 * The labels below are model-facing vocabulary, so this module is the `contract.ts`
 * half of the pair `attachmentView.ts` opens: **the shape crosses the client
 * boundary, the prose does not.** `clientBoundary.test.ts` asserts no `'use client'`
 * file imports it, `import 'server-only'` makes the same thing a build error, and
 * `scripts/audit-secrets.ts` greps the built output for these strings — three layers,
 * because §0.3's non-negotiable 2 is easiest to break on this surface: **the chat's
 * prompt IS the product.**
 *
 * ── WHAT IT REACHES AND WHAT IT DOES NOT ────────────────────────────────────────
 *
 * No database, no environment variable, no clock. It is a pure function of a row and
 * a locale, which is what lets Vitest own every rule below.
 *
 * **IT DOES NOT IMPORT `sanitizeKeepingParagraphs`, AND THAT IS CHECKED RATHER THAN
 * ASSUMED.** That function is private to `src/lib/prompt/memory.ts`, which F6 must
 * not touch (§6 file ownership). So `stripUntrusted` runs **per paragraph** here and
 * the paragraphs are rejoined — same delimiter guarantee, structure preserved, no
 * export added to another workstream's file. It is four lines and it is a deliberate
 * duplication: if a future release wants one implementation, `memory.ts` exports its
 * version and this one is deleted, in a commit that owns both files.
 *
 * `stripUntrusted` COLLAPSES NEWLINES TO SPACES, which is right for a question and
 * catastrophic for a body — `memory.ts`'s header records paying for that lesson.
 *
 * ── WHY THIS IS NOT `memoryBlock`, AND WHY IT IS NOT `ReadingView` EITHER ───────
 *
 * `<riwayat>` compresses: two card lists and a fifteen-word gist, because its job is
 * background. `<lampiran>` is a reading the querent **pointed at**, so it carries the
 * prose whole. That is the entire reason `[F6-13]` spends a separate fence on it:
 * a deliberately-attached reading has to be distinguishable from background history,
 * and re-using the tag would make it indistinguishable in the one place it matters.
 *
 * There is no `gist` line for the same reason, and no `status` line because
 * `[F6-12]` means the row is `ok` or `partial` and nothing else can arrive — and
 * telling a reader a reading was truncated invites them to say so, which is the app's
 * plumbing in a reader's voice.
 */
import { CARDS } from '@/data/deck';
import { READERS } from '@/data/readers';
import { SERVICES } from '@/data/services';
import type { Locale, ReaderId, ServiceId, YesNo } from '@/data/types';
import { formatLocalDate } from '@/lib/i18n/format';
import type { ReadingDetail } from '@/lib/history/types';
import { stripUntrusted } from '@/lib/prompt/sanitize';
import { splitChoiceMarker } from '@/lib/reading/choice';

/**
 * The ceiling on the prose that enters a prompt (§5.5).
 *
 * **A MEASUREMENT TO RE-RUN, NOT A NUMBER TO TRUST.** `spread3` after the 2026-07-29
 * 30% cut lands at 80–170 words; the English half is uncalibrated and Margaret has
 * come in at 157–243 across runs (`## Localization`). At Indonesian's ~6.5 characters
 * per word plus spaces, 243 words is ~1,700 characters, and Margaret carries
 * `MARGARET_MULTIPLIER = 1.3` on top. So 1600 admits the ordinary reading whole,
 * clips the longest English Margaret `spread3` by a paragraph, and clips a runaway
 * hard.
 *
 * **UNMEASURED AGAINST THE REAL CORPUS AS AT 2026-08-07, AND THAT IS F6's TASK 9**,
 * which runs `max(length(body))` and the 99th percentile per service against the dev
 * seed and — with the direct Neon string — production, and writes the number here with
 * its date, `prices.ts`'s convention. If real bodies come in above 1600, **raise the
 * cap**; do not get clever with first-and-last paragraphs, which is a heuristic that
 * would fail on `daily`'s two.
 *
 * The cap is set to make clipping essentially unreachable rather than to make it
 * graceful, because `spread3`'s conclusion lives in paragraph four (`memory.ts` says
 * so at length) and a clip that drops it drops the point.
 */
export const ATTACHMENT_BODY_MAX_CHARS = 1600;

/**
 * The fence. **ONE TOKEN IN BOTH LOCALES** — R17, and `[F6-13]`.
 *
 * The Indonesian-looking word is the safe one for exactly the reason `<riwayat>` and
 * `<terjemahan>` are: an English querent will never type `lampiran` and will
 * absolutely type `attachment`, so the English-looking tag is the one carrying the
 * injection surface. Only the LABELS inside the block are localised, the way
 * `memoryBlock` localises `inti`/`gist` inside a `<riwayat>` spelled the same in both.
 */
export const ATTACHMENT_TAG = 'lampiran';

/**
 * Every field passes through here on its way into the block.
 *
 * ── THE PRIVATE COPY OF THE FENCE LOOP IS GONE, AS F6's HEADER ASKED ────────────
 *
 * This function used to run a second, module-local fixpoint stripper for
 * `lampiran`, because `stripUntrusted`'s alternation did not know the tag and F6
 * does not own `src/lib/prompt/sanitize.ts`. **F3 landed `obrolan` and `lampiran` in
 * that alternation** (reconciliation `[R12]`, header count six → eight), so
 * `stripUntrusted` now closes the hole itself and F6's instruction was explicit:
 * delete this, and the call to it, in that commit. A second implementation of a rule
 * with one owner is how the two drift — and the deleted copy would have become a
 * silent no-op, which is worse than either.
 *
 * §5.5's guarantee — *"a body that spells `</lampiran>` cannot close its own
 * fence"* — is now true where it was stated and false, and it is true for the same
 * reason every other fence in this app is: one alternation, one fixpoint loop, one
 * test block.
 */
function clean(raw: string): string {
  return stripUntrusted(raw);
}

/**
 * The labels, per locale. **PROMPT VOCABULARY, NEVER THE MESSAGE CATALOG.**
 *
 * `memoryBlock`'s `serviceName`/`reversedSuffix` are the precedent and the rule is
 * theirs: a prompt module may not reach `@/lib/i18n/catalog`, because these words are
 * read by a model and not by a person, and a catalog key implies a screen somewhere
 * renders it. It also keeps this module pure and client-fenced at once — the catalog
 * would drag both locales' strings in behind it.
 */
const LABELS: Record<Locale, Record<'language' | 'question' | 'cards' | 'answer' | 'text', string>> =
  {
    id: {
      language: 'bahasa',
      question: 'pertanyaan',
      cards: 'kartu',
      answer: 'jawaban',
      text: 'teks',
    },
    en: {
      language: 'language',
      question: 'question',
      cards: 'cards',
      answer: 'answer',
      text: 'text',
    },
  };

/**
 * The language of the prose, named in the LABEL's language.
 *
 * Two locales, four cells, and the diagonal is never rendered — the line is omitted
 * when the prose is already in the run's language (see below). The off-diagonal is
 * what `[F6-9]` is about.
 *
 * NOT `locale.name.*`, which writes each language in its OWN language ("Indonesia",
 * "English") because a switcher has to be readable by somebody who cannot read the
 * locale they are in. Nothing like that is true of a model reading a labelled block:
 * it is reading the rest of the line in one language and the label belongs in it.
 */
const LANGUAGE_NAMES: Record<Locale, Record<Locale, string>> = {
  id: { id: 'Indonesia', en: 'Inggris' },
  en: { id: 'Indonesian', en: 'English' },
};

/**
 * `readings.verdict` as a word.
 *
 * A LOCAL TWO-ENTRY MAP, not `t('reading.verdict.*')`, for `LABELS`'s reason. The
 * words differ from the catalog's on purpose: the catalog renders `Ya` / `Tidak` /
 * `Belum jelas` in a box a person reads, and this is lowercase mid-line vocabulary a
 * model reads. `maybe` is `unclear` rather than the catalog's `Not yet clear` for the
 * same reason — a prompt line is not a UI string, and neither is a translation of the
 * other.
 */
const VERDICT_WORDS: Record<Locale, Record<YesNo, string>> = {
  id: { yes: 'ya', no: 'tidak', maybe: 'belum jelas' },
  en: { yes: 'yes', no: 'no', maybe: 'unclear' },
};

/**
 * One reading, fenced, for the user turn of every beat in the run that carries it.
 *
 * ── THE FIELD ORDER IS CHEAPEST-TO-READ FIRST, AND IT IS TRUNCATION-SAFE ────────
 *
 * A model that skims the first four lines still has when, what, who asked what, which
 * cards and the answer. The only field that can be clipped is the last one, which is
 * a property of the order rather than of the clipper.
 *
 * ── `locale` IS THE RUN'S, AND IT GOVERNS THE LABELS AND NOTHING ELSE ───────────
 *
 * `C-D9`: a chat message is never translated and a turn mirrors the message it
 * answers. The prose in `teks:` is whatever language it was written in, and the
 * `bahasa:` line is what says which — see `translatedBody`.
 *
 * ── `[F6-2]`: THE BODY IS THE STORED, STRIPPED BODY ─────────────────────────────
 *
 * `persistReading` stores it after `splitChoiceMarker` removed the `PILIHAN:` /
 * `CHOICE:` line, and **the column is the authority.** The `splitChoiceMarker` call
 * below is a belt, not permission for the column to be dirty: it is pure and
 * idempotent, so a second pass cannot regress anything, and the failure it guards
 * against is Thessaly opening with *"jadi menurut PILIHAN: Ayam itu…"* — because in a
 * chat every bubble is context for the next one, so a marker that reaches a model
 * gets quoted back at the querent automatically rather than possibly.
 */
export function attachmentBlock(args: {
  /** Exactly what `readingWithCards` returned. */
  reading: ReadingDetail;
  /** The RUN's locale (`C-D9`). Governs the LABELS, never the prose. */
  locale: Locale;
  /**
   * A cached `translations` row for `reading.body`, or null.
   *
   * **READ, NEVER GENERATED** — `[F6-10]`. F3's assembler does the lookup, wrapped and
   * swallowed, because a cache read that fails is a cache MISS and never an error
   * (V2's rule, which `/history/[id]` already follows). `C-D6`'s arithmetic is the
   * binding argument against generating one here: a run is already 2–5 calls against a
   * fleet-wide 280 per rolling five hours, and the next call to be refused is
   * somebody's reading.
   */
  translatedBody: string | null;
}): string {
  const { reading, locale, translatedBody } = args;
  const L = LABELS[locale];
  const lines: string[] = [];

  // 1. When, what, and who read it. `withYear`, unlike `memoryBlock`'s dateless
  //    line: an attachment can be months old, and "2 Agustus" with no year in
  //    September is a date a reader would get wrong out loud.
  const when = formatLocalDate(reading.localDate, locale, true);
  const what = serviceName(reading.serviceId, locale);
  const who = readerName(reading.readerId);
  lines.push(
    locale === 'id' ? `${when} — ${what}, dibaca ${who}` : `${when} — ${what}, read by ${who}`,
  );

  /*
   * 2. The language of the text that is ACTUALLY BELOW. `[F6-9]`.
   *
   * Never `reading.locale` when a cached translation is being rendered, and never the
   * run's locale when the source is. This is `renderedLocale(reading, translation)`'s
   * job on `/s/[slug]`, moved into a prompt.
   *
   * OMITTED WHEN IT EQUALS THE RUN'S LOCALE, because a line saying "language:
   * Indonesian" in an Indonesian run is noise the model may repeat back — and the
   * readers are bilingual by construction, so the only thing the label buys is that
   * "kamu ambil bacaannya dalam bahasa Indonesia ya" is available to them and "why is
   * this in another language" is not something they have to guess about.
   */
  const proseLocale: Locale = translatedBody !== null ? locale : reading.locale;
  if (proseLocale !== locale) {
    lines.push(`${L.language}: ${LANGUAGE_NAMES[locale][proseLocale]}`);
  }

  // 3. The querent's own words, verbatim and never translated, on every surface.
  const question = reading.question ? clean(reading.question) : '';
  if (question) lines.push(`${L.question}: ${question}`);

  // 4. The cards, byte-for-byte `memoryBlock`'s rendering, in `position` order.
  const cards = [...reading.cards]
    .sort((a, b) => a.position - b.position)
    .map((c) => `${CARDS[c.cardId]?.name ?? `#${c.cardId}`}${reversedSuffix(c.reversed, locale)}`)
    .join(', ');
  if (cards) lines.push(`${L.cards}: ${cards}`);

  /*
   * 5. ONE ANSWER LINE AND NEVER TWO, mirroring `ReadingView`'s `else if`.
   *
   * `CHOICE_RULE_*` is interpolated into `daily` and `spread3` and deliberately never
   * into `yesno`, whose answer is already forced by `effectiveYesNo()` — so the pair
   * is unreachable by construction and this ordering is the belt to that brace. Two
   * answer lines in a prompt would let a reader quote a `ya` that answers nothing:
   * `Ya` is not an answer to "ayam atau ikan".
   *
   * The verdict goes through the map because it is a machine token from a closed set.
   * The choice does not, because it is a word-bounded slice of the question that
   * `validateChoice` cut at draw time — there is no key to look up and nothing to
   * translate. "Raw" there means UNTRANSLATED, not unsanitized: it is a slice of text
   * a person typed, so it takes the same `clean()` pass the question does.
   */
  if (reading.verdict) {
    lines.push(`${L.answer}: ${VERDICT_WORDS[locale][reading.verdict]}`);
  } else if (reading.choice) {
    const choice = clean(reading.choice);
    if (choice) lines.push(`${L.answer}: ${choice}`);
  }

  // 6. The prose, last, and the only field a clip can reach.
  const body = bodyFor(translatedBody ?? reading.body);
  if (body) lines.push(`${L.text}:\n${body}`);

  return `<${ATTACHMENT_TAG}>\n${lines.join('\n')}\n</${ATTACHMENT_TAG}>`;
}

/**
 * The body: marker stripped, sanitized per paragraph, clipped at a paragraph
 * boundary, and **saying nothing about having been clipped.**
 *
 * `[Bacaan terputus…]`'s rule, generalised one step. A notice inside material a model
 * reads gets quoted back as if a reader had said it, and in a chat every bubble is
 * context for the next — so a reader that never saw the last paragraph simply talks
 * about what it saw, which is honest, where a reader that saw *"(dipotong)"* says
 * *"bacaannya kepotong ya"*, which is the app's plumbing in a reader's voice.
 *
 * Returns `''` when there is nothing usable, and the caller omits the `teks:` line
 * entirely rather than emitting an empty one. That state is unreachable for an
 * attachable reading — `attachable()` and the route guard both require a non-empty
 * body — and a function on the request path that throws on a case its callers have
 * excluded is a 500 where there could have been a shorter block.
 */
function bodyFor(raw: string | null): string {
  if (!raw) return '';

  const stripped = splitChoiceMarker(raw, true).body;

  const paragraphs = stripped
    .split(/\n\s*\n/)
    .map((p) => clean(p))
    .filter(Boolean);
  if (paragraphs.length === 0) return '';

  const kept: string[] = [];
  let total = 0;
  for (const p of paragraphs) {
    // The separator counts, or the budget lies by two characters per paragraph.
    const cost = p.length + (kept.length > 0 ? 2 : 0);
    if (total + cost > ATTACHMENT_BODY_MAX_CHARS) break;
    kept.push(p);
    total += cost;
  }

  /*
   * A FIRST PARAGRAPH THAT ALONE EXCEEDS THE CAP IS CUT ON A WORD BOUNDARY, because
   * the alternative — keeping nothing — hands the readers a block with cards and a
   * question and no reading in it, which is the one shape guaranteed to make one of
   * them ask what the reading said.
   */
  if (kept.length === 0) return truncateWords(paragraphs[0], ATTACHMENT_BODY_MAX_CHARS);

  return kept.join('\n\n');
}

/**
 * Cut to `max` characters on a word boundary, or return the string unchanged.
 *
 * `memory.ts`'s `truncateWords`, including the 0.6 threshold, because two functions in
 * this repo that cut prose to a ceiling should behave the same way. A mid-word cut in
 * material a model will read reads as corruption, and the model may try to complete
 * the word.
 */
function truncateWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.\-–—]+$/, '');
}

function reversedSuffix(reversed: boolean, locale: Locale): string {
  if (!reversed) return '';
  return locale === 'id' ? ' (terbalik)' : ' (reversed)';
}

function readerName(id: ReaderId): string {
  return READERS.find((r) => r.id === id)?.name ?? id;
}

/**
 * The service, named the way the querent saw it — `memoryBlock`'s function, and the
 * fallback to the id survives for its reason: a `ServiceId` outside `SERVICES` cannot
 * happen, and a prompt saying `spread3` is a better failure than one saying
 * `undefined`.
 */
function serviceName(id: ServiceId, locale: Locale): string {
  return SERVICES.find((s) => s.id === id)?.name[locale] ?? id;
}
