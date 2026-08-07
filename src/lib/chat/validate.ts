import { CARDS } from '@/data/deck';
import { READERS } from '@/data/readers';
import type { Locale, ReaderId } from '@/data/types';
import { MALAY, EN_TICS, THERAPY_EN, THERAPY_ID } from '@/lib/copy/vocab';
import { BANNED_ROOTS_ID, NGRAM, properNames, sharesNgram } from '@/lib/prompt/lotus';
import type { ChatLengthBudget } from '@/lib/prompt/budget';

/**
 * ONE BUBBLE, CHECKED BEFORE IT IS STORED. `C-D3`'s buffering is what buys this.
 *
 * ── IT REFUSES SHAPE, NOT TRUTH, AND IT SAYS SO (`[F3-12]`) ─────────────────
 *
 * `validateInsight`'s ruling verbatim: there is no cheap test for *"this sentence about
 * a person is true"*, and the honest instruments are the smoke run and the blind read.
 * §10.2 of F3's plan lists what this deliberately does NOT refuse, and the list is the
 * point: a boring bubble, a short one, one that answers nothing, one that repeats
 * another reader, an emoji, and a bubble in the wrong language. **Silence and brevity
 * are features here** (`C-N1c`), not defects.
 *
 * ── SAME SHAPE AS `validateChoice`, OPPOSITE TUNING, AND THE DIFFERENCE IS
 *    ENTIRELY WHAT THE FAILURE COSTS ───────────────────────────────────────
 *
 * `choice.ts` says of `MULTI_OPTION`: *"BIASED TOWARDS REJECTING… a false rejection
 * costs the box and nothing else — the reading still names the choice in its prose —
 * while a false acceptance ships the reported bug."* **Here every term of that sentence
 * flips.**
 *
 *  - A false rejection costs **a bubble**. The retry is a second model call inside a
 *    budget `C-D6` has already halved; a second failure means `beats_done` advances and
 *    **nobody speaks**, indistinguishable from `C-R6`'s legitimate silence — so an
 *    operator cannot even see it happening without `chat.turn_generated.reject_reason`.
 *  - A false acceptance costs **one slightly-off bubble in a stream of them**, which the
 *    next message buries. There is no highlighted box, no public page, no stored
 *    verdict, and the querent can answer it.
 *  - And the objective is asymmetric in the same direction: **`[C-N1]` is measured by
 *    whether the room feels alive**, and a validator that makes it quieter fails the
 *    release at exactly the point it thinks it is protecting it.
 *
 * **THE TWO FUNCTIONS LOOK ALIKE ENOUGH THAT SOMEBODY WILL WANT TO MAKE THEM
 * CONSISTENT. Do not.**
 *
 * ── THREE REFUSALS OVERRIDE THE ACCEPT BIAS, AND ONLY THREE ────────────────
 *
 * `banned_word`, `answer_name_leak` and `verbatim_ngram`. Their false-acceptance cost is
 * *not* bounded by the next message: a diagnosis, a name lifted from a stored answer, or
 * a sentence quoted back at the person who typed it is **a promise broken, and a promise
 * broken does not scroll away.** The first is non-negotiable 13; the other two are what
 * keep `onboarding.q.most_loved.hint`'s published promise mechanical rather than hoped
 * for (`[F3-8]`).
 *
 * ── PURE, AND `scripts/` IMPORTS IT ────────────────────────────────────────
 *
 * `choice.ts`'s precedent: no `server-only` marker of its own, so the smoke script can
 * import the register lists rather than keeping a second copy — which is how `tempoh`
 * went missing the first time. **It does acquire the marker transitively through
 * `@/lib/prompt/lotus`**, and that is deliberate rather than overlooked: `properNames`
 * and `sharesNgram` are `lotus.ts`'s judgements and re-deriving them here would give
 * this release its own definition of *"is this a quotation"*. Scripts run with
 * `--conditions=react-server` and Vitest aliases the marker away, so both loops reach
 * it; a CLIENT component may not, and none needs to.
 */

// ---------------------------------------------------------------------------
// The register lists (§7). TWO LISTS THAT ARE NOT THE SAME LIST.
// ---------------------------------------------------------------------------

/**
 * `validateTurn`'s half refuses ONE BUBBLE, so it is short and position-anchored. The
 * smoke script's half judges a WHOLE RUN, costs nothing, and includes everything that is
 * a stylistic tell rather than a violation. **Both live here and the smoke script
 * imports them**, because a second copy is how a word goes missing.
 */

/** Markdown, restated from `contract.ts`'s `MARKDOWN` — the same regex, one surface over. */
const MARKDOWN = /\*\*|(?:^|\s)\*\w|^#{1,6}\s|^\s*[-•]\s|^\s*\d+[.)]\s/m;
const ANGLE = /[<>]/;
/** Smoke-only. §7.5: the contract forbids it, this does not, and the script PRINTS the rate. */
export const CHAT_EMOJI = /\p{Extended_Pictographic}/u;
/** Smoke-only. An essay wearing a bubble. */
export const CHAT_MULTI_DASH = /(—[^—]*){2,}/;
const CHOICE_MARKER = /^(?:PILIHAN|CHOICE):/im;

/** Openers, matched at the START of the bubble. Anchoring is what makes them shape. */
export const CHAT_OPENERS_ID: readonly string[] = [
  'baik,',
  'baiklah',
  'oke, jadi',
  'oke jadi',
  'jadi begini',
  'mari kita',
  'menarik sekali',
  'pertanyaan yang bagus',
  'pertanyaan bagus',
  'izinkan aku',
  'sebelum menjawab',
  'kalau boleh aku',
  'aku mengerti perasaanmu',
  'aku paham',
  'wah, ini',
  'terima kasih sudah',
];

/** Closers, matched in the LAST SENTENCE. */
export const CHAT_CLOSERS_ID: readonly string[] = [
  'kalau ada yang mau ditanya',
  'kalau ada yang ingin',
  'kalau butuh apa-apa',
  'aku di sini kalau',
  'kami di sini kalau',
  'jangan ragu',
  'semoga membantu',
  'semoga bermanfaat',
  'semangat ya',
  'yang penting kamu',
];

export const CHAT_OPENERS_EN: readonly string[] = [
  'right,',
  'okay so',
  'ok so',
  'alright',
  'sure,',
  "let's unpack",
  'let us unpack',
  "that's a great question",
  'great question',
  'i hear you',
  'i hear that',
  "what i'm hearing is",
  'if i understand correctly',
  'thank you for sharing',
  'thanks for sharing',
  'i want to acknowledge',
  'it sounds like',
  'i appreciate you',
];

export const CHAT_CLOSERS_EN: readonly string[] = [
  'let me know if',
  'feel free to',
  "i'm here if",
  "i'm here for you",
  'we are here if',
  'happy to',
  'i hope this helps',
  'hope that helps',
  'you got this',
  "you've got this",
  'take care of yourself',
];

/**
 * SMOKE-ONLY. A stylistic tell rather than a violation, so it costs a FAIL over a whole
 * scripted run and never a bubble in production.
 */
export const CHAT_TICS_ID: readonly string[] = [
  'pertama,',
  'kedua,',
  'ketiga,',
  'intinya,',
  'singkatnya,',
  'pada dasarnya,',
  'kesimpulannya',
  'yang kamu rasakan adalah',
  'sepertinya kamu merasa',
  'jadi kamu merasa',
  'kalau aku simpulkan',
  'kalau aku rangkum',
  'sebagai pembaca',
  'sebagai ai',
  'aku hanyalah',
  'aku tidak bisa',
  'perlu diingat bahwa',
  'penting untuk diingat',
];

/**
 * SMOKE-ONLY, and §7.4's two recorded near misses live here:
 *
 *  - **`sit with` IS ABSENT, DELIBERATELY.** `readers.en.ts` says Margaret *"closes with
 *    something to sit with"* — it is her own register, not a therapy tic, and banning it
 *    would delete the move that distinguishes her from Thessaly. Same shape as `anxiety`
 *    being deliberately absent from the therapy lists.
 *  - **`journey` IS PRESENT**, while `soul's journey` is on the shared `EN_TICS`. The
 *    bare word is here and not there because `EN_TICS` is shared with the reading path,
 *    where *"the journey home"* in a Fool's-Journey context is legitimate; in a group
 *    chat nobody says "journey".
 */
export const CHAT_TICS_EN: readonly string[] = [
  'firstly',
  'secondly',
  'first of all',
  'to summarise',
  'to summarize',
  'to sum up',
  'in short',
  'essentially,',
  'ultimately,',
  'at the end of the day',
  'as a reader',
  'as an ai',
  "i'm just an",
  'i cannot',
  "it's important to note",
  'based on what you',
  'you mentioned',
  'you said earlier',
  'from what you shared',
  "that's completely valid",
  "that's valid",
  'delve',
  'navigate this',
  'journey',
  'safe space',
  'lean into',
];

/**
 * `[F3-9]`. **THE HIGHEST-VALUE GREP IN THE RELEASE, AND IT IS A REFUSAL RATHER THAN A
 * WARNING.**
 *
 * The failure this release can produce is not a forbidden word; it is a reader saying
 * *"kamu pernah bilang neneknya meninggal waktu kamu SMA"* — true, sourced, correctly
 * recalled, and the single ugliest sentence available to it. `base.id.ts`'s `<penanya>`
 * rule already names this failure at one remove — the line that *"turns uncanny into
 * surveillance"* — and `C-D8` moved it to zero remove.
 */
export const CHAT_SOURCE_TELLS_ID: readonly string[] = [
  'kamu pernah bilang',
  'kamu pernah cerita',
  'kamu pernah menulis',
  'kamu tulis',
  'kamu isi',
  'di jawabanmu',
  'jawaban kamu',
  'dari jawabanmu',
  'aku baca',
  'kami baca',
  'tercatat',
  'datamu',
  'catatan kami',
  'waktu itu kamu',
  'yang kamu isi',
];

export const CHAT_SOURCE_TELLS_EN: readonly string[] = [
  'you told us',
  'you told me',
  'you said before',
  'you said earlier',
  'in your answers',
  'from your answers',
  'you wrote',
  'i read that',
  'we read that',
  'on file',
  'our records',
  'what you filled in',
  'you filled in',
  'from what you told',
];

/**
 * `BANNED_ROOTS_ID` MINUS `cemas`, AND THE SUBTRACTION IS A RULE RATHER THAN A TASTE.
 *
 * `CLAUDE.md`: *"`anxiety` is deliberately NOT forbidden — 'that low-grade anxiety
 * before you send the text' is legitimate in Adrian's voice; the rule is against
 * DIAGNOSIS."* `lotus.ts` includes the root anyway because a stored Lotus summary is
 * read into **every reading prompt** and is written once and never looked at again — a
 * different cost from one bubble in a stream of them. Here the accept bias governs, and
 * refusing *"kamu kayaknya cemas banget"* would delete a sentence Adrian's own persona
 * block licenses.
 */
const CHAT_BANNED_ROOTS_ID = BANNED_ROOTS_ID.filter((root) => root !== 'cemas');

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

export type TurnRejectReason =
  | 'empty'
  | 'too_long'
  /** `[R19]`: a beat may write TWO bubbles, never three. */
  | 'too_many_bubbles'
  | 'markdown'
  | 'angle_bracket'
  | 'address_form'
  | 'self_address'
  | 'card_name'
  | 'reading_shape'
  | 'banned_word'
  | 'malay_word'
  | 'tic_phrase'
  | 'register'
  | 'source_tell'
  | 'answer_name_leak'
  | 'verbatim_ngram';

export type TurnContext = {
  locale: Locale;
  reader: ReaderId;
  /** `chatBudgetFor(locale, reader)` — the SAME resolved object the prompt interpolated. */
  budget: ChatLengthBudget;
  /** `addressForms(nickname)`, verbatim. Element zero is the nickname (`[F3-2]`). */
  addressForms: string[];
  /** The decrypted free-text answers. **Never logged, never returned.** */
  rawAnswers: string[];
  /** Every message body in the window, for the "already said in the room" carve-out. */
  conversation: string[];
};

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-folded, punctuation-stripped word sequence. `lotus.ts`'s `words`, locally. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function matchesWord(haystack: string, needle: string): boolean {
  return new RegExp(`\\b${escapeRe(needle)}\\b`, 'i').test(haystack);
}

/**
 * A tic with a capital in it is matched CASE-SENSITIVELY, and one without is not.
 *
 * `personaSafetyCheck`'s rule and its worked near miss: `EN_TICS` writes `the Universe`
 * with a capital U because that is the mystical noun, and *"the universe of small
 * decisions"* is ordinary English that must pass.
 */
function matchesTic(haystack: string, tic: string): boolean {
  const hasCapital = /\p{Lu}/u.test(tic);
  return new RegExp(escapeRe(tic), hasCapital ? '' : 'i').test(haystack);
}

/**
 * Tokens in a VOCATIVE POSITION: the first word of the bubble, and any word adjacent to
 * a comma. That is where a name goes when somebody is being addressed, and restricting
 * the check to those positions is what makes it shape rather than a hunt for a substring.
 */
function vocativeTokens(body: string): string[] {
  const out: string[] = [];
  const bare = (token: string) => token.replace(/[^\p{L}\p{N}'-]/gu, '');

  const sentences = body.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const tokens = sentence.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    // The opener, with or without its comma.
    out.push(bare(tokens[0]));
    tokens.forEach((token, index) => {
      if (token.endsWith(',')) out.push(bare(token));
      if (index > 0 && tokens[index - 1].endsWith(',')) out.push(bare(token));
    });
  }
  return out.filter((t) => t.length > 0);
}

const READER_NAMES: Record<string, string> = Object.fromEntries(
  READERS.map((r) => [r.id, r.name]),
);

/**
 * A near miss on the querent's own name, in a vocative slot.
 *
 * **THE TWO-LETTER PREFIX PLUS THE LENGTH BOUND IS WHAT KEEPS THIS NARROW** (`[F3-3]`):
 * an unrelated capitalised word shares neither, so `Minggu depan, …` passes while
 * `Mi, …` does not. A form no longer than the nickname is the only thing a clipping can
 * be.
 */
function invalidAddress(body: string, allowed: string[]): boolean {
  const nickname = allowed[0];
  if (!nickname || nickname.length < 2) return false;
  const prefix = nickname.slice(0, 2).toLowerCase();
  const permitted = new Set(allowed.map((f) => f.toLowerCase()));

  for (const token of vocativeTokens(body)) {
    const lower = token.toLowerCase();
    if (permitted.has(lower)) continue;
    if (!lower.startsWith(prefix)) continue;
    /*
     * A form no LONGER than the nickname is a clipping. A longer one is only a near miss
     * if it starts with the whole nickname — which is the `Miftahku` case `[F3-3]` names
     * by hand, an invented affix rather than an unrelated word. `Minggu` shares the
     * prefix, is longer, and is not an extension, so it passes.
     */
    if (lower.length <= nickname.length || lower.startsWith(nickname.toLowerCase())) return true;
  }
  return false;
}

/**
 * A card name in the wrong shape.
 *
 * **A LOWERCASE PHRASE IS ORDINARY PROSE IN A CHAT AND IS NOT REFUSED.** Everybody types
 * lowercase in a group, so *"the moon kelihatan terang"*, *"kamu butuh strength"* and
 * *"di bawah the sun"* all have to pass — and refusing them would be exactly the false
 * rejection `[F3-12]` forbids. What is refused is a MIXED-CASE near miss (`the Moon`,
 * `The MOON`) or a capitalised bare distinctive word (`Moon`), which is the shape of a
 * model mangling a name rather than of a person typing quickly.
 *
 * **AN INVENTED INDONESIAN CARD NAME IS UNDETECTABLE AND THIS SAYS SO** — `namesIn`'s
 * limitation. The prompt rule alone produced *"Pulan"* for The Moon, and the only
 * mechanical half available is the one above.
 */
function manglesCardName(body: string): boolean {
  for (const card of CARDS) {
    const exact = card.name;
    const re = new RegExp(escapeRe(exact), 'gi');
    for (const match of body.match(re) ?? []) {
      if (match !== exact && /\p{Lu}/u.test(match)) return true;
    }

    const distinctive = exact.replace(/^The\s+/, '');
    if (distinctive === exact) continue;
    /*
     * The bare distinctive word, capitalised and not sentence-initial. `properNames`'
     * sentence-initial carve-out, for its reason: a word is not a card merely for
     * starting a sentence.
     */
    const bare = new RegExp(
      `(?<![Tt]he\\s)(?<![.!?]\\s)(?<!^)\\b${escapeRe(distinctive)}\\b`,
      'gm',
    );
    for (const match of body.match(bare) ?? []) {
      if (match === distinctive) return true;
    }
  }
  return false;
}

/** Three exact card names in one bubble is a spread, not a remark (`[F3-20]`). */
function countsAsSpread(body: string): boolean {
  const named = CARDS.filter((c) => body.includes(c.name)).length;
  return named >= 3;
}

/**
 * `[R19]`. **TWO BUBBLES, NEVER THREE**, and the separator is a blank line.
 *
 * A blank line is what a model produces when it wants a break, and it is the one shape
 * that cannot arrive from anywhere else: `stripUntrusted` collapses newlines out of
 * every user-derived string in this app, so a blank line in a completion is the model's
 * own punctuation and not something the querent could have typed.
 *
 * **A SINGLE NEWLINE IS NOT A BOUNDARY** — that is a model wrapping a line, and treating
 * it as two messages would turn one thought into two bubbles that read as a layout bug.
 */
export function splitBubbles(raw: string): string[] {
  return raw
    .split(/\n\s*\n+/)
    .map((part) => part.replace(/\s*\n\s*/g, ' ').trim())
    .filter((part) => part.length > 0);
}

/**
 * ONE BUBBLE. `{ ok: true }` or a CLOSED reason — never a message, because the reason
 * reaches `events.props` and non-negotiable 5 forbids free text there.
 */
export function checkTurn(
  body: string,
  ctx: TurnContext,
): { ok: true; body: string } | { ok: false; reason: TurnRejectReason } {
  const text = body.trim();

  if (text.length === 0) return { ok: false, reason: 'empty' };

  /*
   * CHECKED FIRST, and `personaSafetyCheck`'s ordering is why: a surviving angle bracket
   * means either a delimiter attack that got through the sanitizer or a malformed
   * generation, and in both cases the material and the instruction may already have been
   * confused. Nothing after this point is worth knowing about such a string.
   */
  if (ANGLE.test(text)) return { ok: false, reason: 'angle_bracket' };

  const wordCount = words(text).length;
  if (wordCount > ctx.budget.maxWords || text.length > ctx.budget.maxChars) {
    return { ok: false, reason: 'too_long' };
  }
  /* NO FLOOR BRANCH. `[F3-10]`, and its absence is the enforcement. */

  if (MARKDOWN.test(text)) return { ok: false, reason: 'markdown' };

  if (invalidAddress(text, ctx.addressForms)) return { ok: false, reason: 'address_form' };

  const self = READER_NAMES[ctx.reader];
  if (self && vocativeTokens(text).some((t) => t.toLowerCase() === self.toLowerCase())) {
    return { ok: false, reason: 'self_address' };
  }

  if (manglesCardName(text)) return { ok: false, reason: 'card_name' };
  if (CHOICE_MARKER.test(text) || countsAsSpread(text)) {
    return { ok: false, reason: 'reading_shape' };
  }

  // OVERRIDES THE ACCEPT BIAS. Non-negotiable 13.
  const therapy = ctx.locale === 'en' ? THERAPY_EN : THERAPY_ID;
  for (const word of therapy) {
    if (matchesWord(text, word)) return { ok: false, reason: 'banned_word' };
  }
  if (ctx.locale === 'id') {
    /*
     * Indonesian is agglutinative, so a word-boundary list is porous in a way an English
     * one is not: `\bsembuh\b` does not match `penyembuhan`. `lotus.ts`'s reasoning,
     * with `cemas` removed — see `CHAT_BANNED_ROOTS_ID`.
     */
    const roots = new RegExp(`[a-z]*(?:${CHAT_BANNED_ROOTS_ID.join('|')})[a-z]*`, 'i');
    if (roots.test(text)) return { ok: false, reason: 'banned_word' };

    // W6 rule 4: the Malay grep is `id`-only. Running it against English is theatre.
    for (const word of MALAY) {
      if (matchesWord(text, word)) return { ok: false, reason: 'malay_word' };
    }
  } else {
    for (const tic of EN_TICS) {
      if (matchesTic(text, tic)) return { ok: false, reason: 'tic_phrase' };
    }
  }

  const openers = ctx.locale === 'id' ? CHAT_OPENERS_ID : CHAT_OPENERS_EN;
  const closers = ctx.locale === 'id' ? CHAT_CLOSERS_ID : CHAT_CLOSERS_EN;
  const lower = text.toLowerCase();
  if (openers.some((phrase) => lower.startsWith(phrase))) return { ok: false, reason: 'register' };
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const last = (sentences[sentences.length - 1] ?? text).toLowerCase();
  if (closers.some((phrase) => last.includes(phrase))) return { ok: false, reason: 'register' };

  const tells = ctx.locale === 'id' ? CHAT_SOURCE_TELLS_ID : CHAT_SOURCE_TELLS_EN;
  if (tells.some((phrase) => lower.includes(phrase))) return { ok: false, reason: 'source_tell' };

  /*
   * OVERRIDES THE ACCEPT BIAS, and **the carve-out is load-bearing**: the querent may
   * type a friend's name in the room, and a reader repeating a name that has been said
   * out loud is natural and correct. What is refused is a name that arrived from a stored
   * answer and has never been said — which is what
   * `onboarding.q.most_loved.hint` promised would never happen.
   *
   * Case-SENSITIVE, `lotus.ts`'s rule: the relation word a correct bubble contains
   * ("ibu") differs from the name it must not ("Sari"), and a case-insensitive match
   * would reject the correct output.
   */
  const spokenInRoom = new Set(
    ctx.conversation.flatMap((message) => properNames(message).map((n) => n.toLowerCase())),
  );
  for (const answer of ctx.rawAnswers) {
    for (const name of properNames(answer)) {
      if (spokenInRoom.has(name.toLowerCase())) continue;
      if (new RegExp(`\\b${escapeRe(name)}\\b`).test(text)) {
        return { ok: false, reason: 'answer_name_leak' };
      }
    }
    // OVERRIDES THE ACCEPT BIAS. Six words is `lotus.ts`'s judgement, reused not re-derived.
    if (sharesNgram(words(answer), words(text), NGRAM)) {
      return { ok: false, reason: 'verbatim_ngram' };
    }
  }

  return { ok: true, body: text };
}

/**
 * A whole turn: one or two bubbles, each checked.
 *
 * **THE FIRST FAILURE IS THE TURN'S FAILURE.** A turn whose second bubble is refused is
 * not partially stored — `C-R7`'s retry is over the whole turn, and half a turn in the
 * room is a reader who trailed off.
 */
export function checkTurnBodies(
  raw: string,
  ctx: TurnContext,
): { ok: true; bodies: string[] } | { ok: false; reason: TurnRejectReason } {
  const parts = splitBubbles(raw);
  if (parts.length === 0) return { ok: false, reason: 'empty' };
  if (parts.length > 2) return { ok: false, reason: 'too_many_bubbles' };

  const bodies: string[] = [];
  for (const part of parts) {
    const checked = checkTurn(part, ctx);
    if (!checked.ok) return checked;
    bodies.push(checked.body);
  }
  return { ok: true, bodies };
}

/**
 * Which class of address the turn used, for `chat.turn_generated.address_form`.
 *
 * **A CLASS, NEVER THE WORD** (`[F3-24]`): `mif`, `tah` and `jo` are slices of a nickname
 * a person typed, and `events` rows survive account erasure with `user_id` nulled. The
 * numerator and the denominator of `C-N1e`'s rate are one table scan either way.
 */
export function addressFormUsed(
  bodies: string[],
  addressForms: string[],
): 'nickname' | 'clipped' | 'none' {
  const text = bodies.join(' ');
  const [nickname, ...clips] = addressForms;
  if (nickname && matchesWord(text, nickname)) return 'nickname';
  if (clips.some((clip) => matchesWord(text, clip))) return 'clipped';
  return 'none';
}
