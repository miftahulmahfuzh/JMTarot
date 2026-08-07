import 'server-only';

import { CARDS } from '@/data/deck';
import {
  isFreeText,
  ONBOARDING_MAX_ANSWER_CHARS,
  ONBOARDING_QUESTION_KEYS,
} from '@/data/onboarding';
import type { Locale } from '@/data/types';
import { attachmentBlock } from './attachmentBlock';
import { addressForms } from './address';
import { chatAnswersEnabled } from './model';
import { listMessages, messagesForRun } from '@/lib/db/queries/chat';
import { readingWithCards, recallableReadings } from '@/lib/db/queries/history';
import { readLotusBlock } from '@/lib/db/queries/lotus';
import { getAnswers } from '@/lib/db/queries/onboarding';
import { getProfile } from '@/lib/db/queries/profile';
import { getTranslation } from '@/lib/db/queries/translations';
import type { DbOrTx } from '@/lib/db/types';
import { correspondencesFor } from '@/lib/numerology';
import { sanitizeAnswer } from '@/lib/prompt/sanitize';
import type {
  ChatAnswerBlock,
  ChatContext,
  ChatFact,
  ChatReadingRef,
  ChatTranscriptEntry,
  ContextProfile,
} from './prompt/build';

/**
 * WHAT ONE BEAT KNOWS. The assembler, and the one place in this app that decrypts an
 * onboarding answer for a chat.
 *
 * ── `C-D8` CONDITION 1, AND IT IS THE WHOLE REASON THIS FILE IS ONE FILE ────
 *
 * `[F3-4]`: the six answers are decrypted **in exactly one new place, and that place is
 * `assembleChatContext`, through `getAnswers(db, userId)`.** `queries/onboarding.ts`
 * stays *"the only module that encrypts or decrypts that column"*; there is no second
 * decrypt path, no bulk route, and no new export from that module. The audit question —
 * *"does anything else open this column?"* — has to stay answerable by reading one file,
 * and `context.contract.test.ts` is what keeps it so.
 *
 * ── AND CONDITION 2 IS STRUCTURAL, NOT A PROMISE ────────────────────────────
 *
 * `[F3-5]`: what this returns is consumed by `buildChatPrompt` and by nothing else, and
 * that function returns three strings and a number. `turn.ts` hands back prose. So a
 * decrypted answer reaching a browser requires somebody to serialise a `ChatContext` on
 * purpose — a diff a reviewer can see — rather than a field quietly riding along.
 *
 * ── NO NEW QUERY MODULE AND NO NEW INDEX (`[F3-23]`) ────────────────────────
 *
 * Six existing reads, every one of them taking its handle first: `getProfile`,
 * `getAnswers`, `readLotusBlock`, `recallableReadings`, `listMessages` /
 * `messagesForRun`, and — only when a message carries an attachment —
 * `readingWithCards` plus `getTranslation`. A `queries/chatContext.ts` would duplicate
 * five of them and drift from all five.
 *
 * ── IT NEVER THROWS, AND THAT IS `chain.ts`'s RULE ─────────────────────────
 *
 * This is on the request path of `POST /api/chat/advance`. A failed read degrades the
 * context — fewer facts, no history, no attachment — and the room still answers. **A
 * cache read that fails is a cache MISS, never an error** (V2's rule), and the same is
 * true of every optional block here. The only thing that cannot degrade is the
 * transcript, and a room with no transcript is a room with nothing to answer.
 *
 * **NO DRIVER ERROR IS LOGGED FROM ANY PATH HERE** (non-negotiable 6, `C-D20`). A
 * postgres error quotes its bound parameters, and on this surface those are a person's
 * own sentences and their six answers.
 */

/**
 * Read at CALL TIME, never at module scope (roadmap §8): a module-scope `const` is
 * inlined by the bundler and freezes the build-time value into production.
 *
 * A number variable **falls back rather than becoming zero**, per `auth/ttl.ts` and
 * `meter.ts` — a window of `0` here would silently delete the feature's memory.
 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * **40 MESSAGES, SIZED AGAINST THE OUTPUT RATHER THAN AGAINST THE MODEL.** A bubble is
 * ≤ 22 words, so forty of them is ≈ 1,000 tokens — the largest single block in the
 * prompt, and correctly so, because *what was just said* is what a reply is about. Below
 * ~20 a reader loses the thread inside one sitting; above ~60 the oldest messages start
 * competing with `<jawaban>` for attention and this run's bubbles sit further from the
 * instruction.
 */
export const CHAT_CONTEXT_MESSAGES_DEFAULT = 40;

/**
 * **FIVE READINGS**, which is `MEMORY_CHAIN_COUNT`'s 2 widened: a chat is a longer-lived
 * relationship than one reading's callback, and *"you drew The Tower three times this
 * month"* is a legitimate thing for a friend to notice. Beyond five the block stops being
 * memory and becomes a log.
 */
export const CHAT_CONTEXT_READINGS_DEFAULT = 5;

/**
 * **THIRTY DAYS, AND `MEMORY_CHAIN_LOOKBACK_DAYS` IS FOURTEEN FOR A REASON THAT DOES NOT
 * APPLY HERE.** That one bounds an automatic callback the querent did not ask for; a chat
 * message is a person choosing to mention something, so it can reach further. Thirty and
 * not further, because *"a callback to something five weeks old is not memory, it is
 * surveillance"* still holds and this release is already spending that budget elsewhere.
 */
export const CHAT_READING_LOOKBACK_DAYS_DEFAULT = 30;

/**
 * **THREE NUMEROLOGY FACTS OF SIX**, and V3's finding is why: `/account` shows five
 * because it is a page about numbers, and a chat prompt handed five produces a reader
 * reciting arithmetic — *"the app has stopped doing arithmetic out loud"*. Three is enough
 * for one grounded aside a season apart. **Glosses, never raw arithmetic** (VD1).
 */
const CHAT_NUMEROLOGY_FACTS = 3;

/** `YYYY-MM-DD`, `days` earlier. `local_date` is a STRING and stays one. */
function shiftLocalDate(localDate: string, days: number): string {
  const at = Date.parse(`${localDate}T00:00:00Z`);
  if (Number.isNaN(at)) return localDate;
  return new Date(at - days * 86400000).toISOString().slice(0, 10);
}

/** Cards that turned up in more than one reading in the window. `ULANG`'s input. */
function repeatedCards(readings: ChatReadingRef[]): number[] {
  const counts = new Map<number, number>();
  for (const reading of readings) {
    for (const id of new Set(reading.cards.map((c) => c.cardId))) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => id)
    .filter((id) => CARDS[id] !== undefined)
    .sort((a, b) => a - b);
}

/**
 * How the querent answered the introversion scale, as a WORD.
 *
 * The number is deliberately not rendered: `35` in a prompt is arithmetic the model can
 * recite, and V3 deleted exactly that from two other prompts. Three bands, because the
 * question has three readable answers and a slider has 21 meaningless ones.
 *
 * **`color` IS DELIBERATELY ABSENT.** It is the lotus colour, and the Lotus summary in
 * `<penanya>` was distilled from it — rendering it again would put the same fact in the
 * prompt twice, in a block whose whole argument is that it is short.
 */
function introversionWord(raw: string | null, locale: Locale): string | null {
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (value <= 33) return locale === 'id' ? 'lebih suka menyendiri' : 'prefers their own company';
  if (value >= 67) return locale === 'id' ? 'lebih hidup di antara orang' : 'comes alive around people';
  return locale === 'id' ? 'di tengah-tengah' : 'somewhere in between';
}

function factsFor(
  profile: { fullName: string; nickname: string; birthDate: string } | null,
  locale: Locale,
): ChatFact[] {
  if (!profile) return [];
  const c = correspondencesFor(profile, locale);
  const out: ChatFact[] = [];
  if (c.lifePath) {
    out.push({ kind: 'lifePath', value: String(c.lifePath.value), gloss: c.lifePath.gloss });
  }
  if (c.sun) {
    out.push({ kind: 'sun', value: c.sun.sign, gloss: c.sun.signGloss });
    out.push({ kind: 'element', value: c.sun.element, gloss: c.sun.elementGloss });
  }
  return out.slice(0, CHAT_NUMEROLOGY_FACTS);
}

/**
 * The six answers, fenced-ready.
 *
 * **A SKIPPED ANSWER IS OMITTED ENTIRELY AND ITS KEY IS NEVER NAMED** (`[F3-7]`,
 * `C-D8` condition 5). This diverges from `buildLotusPrompt`, which renders
 * `(dilewati)`, and the divergence is the point: the distiller needs a stable prompt
 * shape so two querents get comparable distillations, and the chat needs the model never
 * to learn that a question exists and was declined. **A reader who asks about the one
 * thing you refused to answer is `C-D8`'s "worst possible version of this feature".**
 *
 * `sanitizeAnswer` is the inbound half of the two-sided defence, exactly as it is in
 * `buildLotusPrompt`: it strips every delimiter the prompt layer writes — `<jawaban>` and
 * now `<obrolan>` included — so a querent cannot close their own block early. `build.ts`
 * strips again when it writes the fence; the pass is idempotent and the fence's writer
 * owns the fence.
 */
function answerBlocksFrom(
  answers: Array<{ key: string; text: string | null; choice: string | null; skipped: boolean }>,
): ChatAnswerBlock[] {
  const byKey = new Map(answers.map((a) => [a.key, a]));
  const out: ChatAnswerBlock[] = [];
  for (const key of ONBOARDING_QUESTION_KEYS.filter(isFreeText)) {
    const answer = byKey.get(key);
    if (!answer || answer.skipped) continue;
    const clean = sanitizeAnswer(answer.text, ONBOARDING_MAX_ANSWER_CHARS);
    if (clean === null) continue;
    out.push({ key, text: clean });
  }
  return out;
}

export type { ContextProfile };

export type AssembleArgs = {
  userId: string;
  /** The RUN's locale (`C-D9`). Never `user.locale`, never `getLocale()`. */
  locale: Locale;
  profile: ContextProfile;
  /** The run being executed, so this run's own bubbles are in the window (`C-R5`). */
  runId: string | null;
  /** The message a beat is pointed at (`C-D11`). */
  replyToMessageId: string | null;
  /** The querent's calendar day, from the client. **NEVER a `Date`.** */
  localDate: string;
};

/**
 * Everything one beat's prompt is built from, in one pass.
 *
 * **THE `director` PROFILE CARRIES NO `<jawaban>` AND THAT IS THE NARROWING THAT
 * MATTERS** (§4.2, seam S2). The director's job is casting and ordering; it needs none of
 * the six answers. Excluding them means **one call per beat holds the most sensitive
 * strings in the product instead of one per beat plus one per run** — a ~25% reduction in
 * how often they cross a wire, for zero loss of function. It also gets no numerology, for
 * the same reason: it decides *who speaks*, not *what they say*.
 */
export async function assembleChatContext(db: DbOrTx, args: AssembleArgs): Promise<ChatContext> {
  const { userId, locale, profile } = args;
  const forVoice = profile === 'voice';

  const messagesWanted = envInt('CHAT_CONTEXT_MESSAGES', CHAT_CONTEXT_MESSAGES_DEFAULT);
  const readingsWanted = envInt('CHAT_CONTEXT_READINGS', CHAT_CONTEXT_READINGS_DEFAULT);
  const lookback = envInt('CHAT_READING_LOOKBACK_DAYS', CHAT_READING_LOOKBACK_DAYS_DEFAULT);

  /*
   * **CONCURRENT, AND EVERY ONE OF THEM SWALLOWED SEPARATELY.** `Promise.all` would make
   * one failed optional read lose the whole context; `allSettled` lets the room answer
   * with less. The transcript is the only block worth degrading over, and even it comes
   * back empty rather than throwing.
   */
  const [profileRow, answerRows, lotus, readingRows, page, runRows] = await Promise.all([
    getProfile(db, userId).catch(() => null),
    /*
     * **THE ONE DECRYPT** (`[F3-4]`), and behind `chatAnswersEnabled()` (`[R14]`'s
     * reversal). Off does not close the room: the Lotus summary, the engine facts and the
     * transcript are untouched, which is exactly the material the persona prompt has
     * always had. The read is skipped entirely rather than filtered afterwards, so the
     * ciphertext is not even fetched.
     */
    forVoice && chatAnswersEnabled() ? getAnswers(db, userId).catch(() => []) : Promise.resolve([]),
    readLotusBlock(db, userId, locale).catch(() => null),
    recallableReadings(db, {
      userId,
      limit: readingsWanted,
      sinceLocalDate: shiftLocalDate(args.localDate, lookback),
    }).catch(() => []),
    listMessages(db, userId, { limit: Math.min(messagesWanted, 50) }).catch(() => ({
      messages: [],
      hasMore: false,
    })),
    args.runId ? messagesForRun(db, args.runId).catch(() => []) : Promise.resolve([]),
  ]);

  /*
   * **THIS RUN'S OWN BUBBLES ARE UNIONED IN RATHER THAN APPENDED** (`C-R5`, `[F3-16]`).
   * `listMessages` already returns them — they are the newest rows — so the union is
   * belt and braces for the one case that would otherwise lose them: a window smaller
   * than the run. They are ordinary rows of `<obrolan>` and get no block of their own.
   */
  const byId = new Map<string, (typeof page.messages)[number]>();
  for (const m of [...page.messages, ...runRows]) byId.set(m.id, m);
  const ordered = [...byId.values()]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))
    .slice(-messagesWanted);

  const entries: ChatTranscriptEntry[] = await Promise.all(
    ordered.map(async (m) => ({
      id: m.id,
      author: m.author,
      createdAt: m.createdAt,
      body: m.body,
      replyToAuthor: m.replyTo?.author ?? null,
      attachment: m.attachedReadingId
        ? await renderAttachment(db, userId, m.attachedReadingId, locale, forVoice)
        : null,
    })),
  );

  const readings: ChatReadingRef[] = readingRows.map((r) => ({
    localDate: r.localDate,
    readerId: r.readerId,
    cards: r.cards,
    gist: r.gist,
  }));

  const nickname = lotus?.nickname ?? profileRow?.nickname ?? null;
  const facts = forVoice
    ? factsFor(
        profileRow && profileRow.birthDate
          ? {
              fullName: profileRow.fullName,
              nickname: profileRow.nickname,
              birthDate: profileRow.birthDate,
            }
          : null,
        locale,
      )
    : [];

  /*
   * The introversion answer as a word, appended to the facts because it is a fact about
   * the person of exactly the same kind — a closed value, glossed, never a number.
   */
  if (forVoice) {
    const raw = answerRows.find((a) => a.key === 'introversion')?.choice ?? null;
    const word = introversionWord(raw, locale);
    if (word) facts.push({ kind: 'element', value: word, gloss: word });
  }

  return {
    profile,
    locale,
    nickname,
    /* `[F3-2]`: an empty derived list is correct, and an absent nickname yields none. */
    addressForms: forVoice && nickname ? addressForms(nickname) : nickname ? [nickname] : [],
    facts: facts.slice(0, CHAT_NUMEROLOGY_FACTS + 1),
    lotus: lotus?.summary?.trim() ? lotus.summary.trim() : null,
    answers: answerBlocksFrom(answerRows),
    readings,
    repeatCardIds: repeatedCards(readings),
    messages: entries,
    /*
     * **THE HOIST IS A LOOKUP IN THE WINDOW AND NOTHING MORE.** `C-D11` asks that a beat
     * pointed at an old id sees the message it quotes. The director chose that id from
     * *this same forty-row window*, and a run is at most four beats, so a target that has
     * scrolled out is unreachable in practice. Fetching it by id would need a
     * `messageById` read in `queries/chat.ts`, which is F1's file — recorded as an open
     * item rather than added here (§0.0 rule 5).
     */
    replyTo: args.replyToMessageId
      ? (entries.find((e) => e.id === args.replyToMessageId) ?? null)
      : null,
  };
}

/**
 * F6's `<lampiran>` block for one attached reading (seam S4).
 *
 * **READ, NEVER GENERATED** (`[F6-10]`): the translation is a cache lookup, wrapped and
 * swallowed, because *a cache read that fails is a cache MISS and never an error*. `C-D6`
 * is the binding argument against generating one here — a run is already 2–5 calls
 * against a fleet-wide 280 per rolling five hours, and the next call refused would be
 * somebody's reading.
 *
 * **THE DIRECTOR GETS ONE TOO, DELIBERATELY.** §4.2 gives it *"cards + first line"*, and
 * the honest way to do that with one owner of the shape is to hand it the same block: the
 * fields are ordered cheapest-to-read-first by F6 precisely so a reader that stops early
 * still knows what the reading was.
 */
async function renderAttachment(
  db: DbOrTx,
  userId: string,
  readingId: string,
  locale: Locale,
  forVoice: boolean,
): Promise<string | null> {
  void forVoice;
  const reading = await readingWithCards(db, userId, readingId).catch(() => null);
  /*
   * **A DELETED READING LEAVES THE BUBBLE AND LOSES THE BLOCK.** `on delete set null`
   * means a bubble can outlive its reading, and a prompt that claimed a reading it cannot
   * read would invite the model to invent one. F6's renderer owns what the SCREEN shows;
   * this owns what the model is told, and the answer is nothing.
   */
  if (!reading) return null;

  const translated =
    reading.locale === locale
      ? null
      : await getTranslation(db, {
          entity: 'reading',
          entityId: reading.id,
          field: 'body',
          locale,
        })
          .then((row) => row?.body ?? null)
          .catch(() => null);

  try {
    return attachmentBlock({ reading, locale, translatedBody: translated });
  } catch {
    return null;
  }
}
