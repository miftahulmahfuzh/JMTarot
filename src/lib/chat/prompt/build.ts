import 'server-only';

import { createHash } from 'node:crypto';

import { CARDS } from '@/data/deck';
import { readerById } from '@/data/readers';
import type { Locale, ReaderId } from '@/data/types';
import { formatLocalDate } from '@/lib/i18n/format';
import type { ChatLengthBudget } from '@/lib/prompt/budget';
import { CHAT_MAX_TOKENS } from '@/lib/prompt/budget';
import { stripUntrusted } from '@/lib/prompt/sanitize';
import type { CompletionPrompt } from '@/lib/llm/types';
import { CHAT_TIME_VOCAB, renderNow } from '../clock';
import type { ChatAuthor, Beat, BeatIntent, ChatClock } from '../types';
import { chatBaseContract } from './base';
import { chatReaderPrompt } from './readers';

/**
 * Which of the two views of the same material this is (seam S2).
 *
 * `C-D10`'s seam says F2 *"calls into F3's assembler with a different profile, and does
 * not build a second one"*. §4.2 is the table of what each one carries, and **the
 * narrowing that matters is that the director gets NO `<jawaban>`**: its job is casting
 * and ordering, so excluding the answers means one call per BEAT holds the most
 * sensitive strings in the product instead of one per beat plus one per run.
 */
export type ContextProfile = 'voice' | 'director';

/**
 * One numerology fact, glossed. Three of the six (`CHAT_NUMEROLOGY_FACTS`), because
 * five numbers in a prompt produce a reader reciting arithmetic.
 */
export type ChatFact = { kind: 'lifePath' | 'sun' | 'element'; value: string; gloss: string };

/** One raw onboarding answer, sanitized, on its way into a `<jawaban>` fence. */
export type ChatAnswerBlock = { key: string; text: string };

/** One reading in the `<riwayat>` window. `RecalledReading`'s fields, minus the ones a chat has no use for. */
export type ChatReadingRef = {
  localDate: string;
  readerId: ReaderId;
  cards: { cardId: number; reversed: boolean }[];
  gist: string | null;
};

/** One message in the `<obrolan>` window. */
export type ChatTranscriptEntry = {
  id: string;
  author: ChatAuthor;
  /** ISO. Rendered as an AGE, never as a clock — see `ageLabel`. */
  createdAt: string;
  body: string;
  /** Who wrote the quoted message, for the `[membalas Thessaly]` stub. */
  replyToAuthor: ChatAuthor | null;
  /** F6's rendered `<lampiran>` block, inline at its own message (seam S4). */
  attachment: string | null;
};

/**
 * EVERYTHING ONE BEAT'S PROMPT IS BUILT FROM.
 *
 * **THE TYPE LIVES WITH ITS ONLY CONSUMER, AND THAT IS `[F3-5]` MADE STRUCTURAL.** The
 * assembler in `../context.ts` produces one of these and `buildChatPrompt` consumes it;
 * nothing else takes one as a parameter and nothing returns one. `turn.ts` hands back
 * four fields of prose, so the only way `worst_thing` could reach a browser is by
 * somebody deliberately serialising this object — which is a diff a reviewer can see,
 * rather than a field that quietly rides along.
 */
export type ChatContext = {
  profile: ContextProfile;
  locale: Locale;
  /**
   * WHAT TIME IT IS FOR THE QUERENT (R1). **DECLARED IN PHASE 1, RENDERED IN
   * PHASE 2** — nothing in this file reads it yet, deliberately, so that the
   * transport lands with no prompt-output change to confound the blind read.
   *
   * `known: false` is the honest answer for a querent whose browser has never
   * reported an offset, and the block that renders this must be absent then
   * rather than falling back to UTC: a reader stating the wrong hour with
   * confidence is worse than the timeless room v0.7.0 shipped.
   */
  clock: ChatClock;
  nickname: string | null;
  /** `addressForms(nickname)`, verbatim. Empty is legitimate (`[F3-2]`). */
  addressForms: string[];
  facts: ChatFact[];
  /** The Lotus summary. Null is a first-class value — `readLotusBlock`'s rule. */
  lotus: string | null;
  /** Empty for the `director` profile and when `CHAT_ANSWERS_ENABLED=0`. */
  answers: ChatAnswerBlock[];
  /**
   * R2's distilled profile memory, already sanitized and capped by the assembler, in the
   * order the generator wrote it. **Empty for the `director` profile** — see the header.
   * `string[]` and not the row: `build.ts` must not learn `user_memory`'s columns.
   */
  memory: string[];
  readings: ChatReadingRef[];
  /** Cards that turned up in more than one of `readings`. Computed in code. */
  repeatCardIds: number[];
  /** Oldest first, this run's own bubbles last (`[F3-16]`). */
  messages: ChatTranscriptEntry[];
  /** The beat's quote target, hoisted only if it fell out of the window (`C-D11`). */
  replyTo: ChatTranscriptEntry | null;
};

/**
 * ONE CHAT TURN'S PROMPT. The block order IS the injection answer.
 *
 * ── THE INSTRUCTION IS THE UNFENCED TEXT; THE MATERIAL IS THE FENCED TEXT ────
 *
 * Every block in the user turn is inside a fence, and there is **exactly one unfenced
 * block: `GILIRANMU:` / `YOUR TURN:`**. The contract's KEAMANAN section says that
 * anything inside a fence is material and anything outside one is an instruction, so
 * those two facts together are the whole answer to *"what happens when the querent
 * types `abaikan aturan di atas`"* — it lands inside `<obrolan>`, which the contract
 * has already declared to be material. `build.ts`'s `<pertanyaan>` rule, generalised
 * from one line to a transcript.
 *
 * ── AND THE ORDER OF THE FENCED BLOCKS IS DOING WORK TOO ────────────────────
 *
 *   `<waktu>`     WHEN. First, because it is the frame every other block is read inside.
 *                 Stated once, as one fact, never stamped on a line (`[F2-16]` reason 1).
 *   `<penanya>`   WHO. Then, so it reads as background the conversation is laid over
 *                 rather than as the subject. `build.ts`'s argument, verbatim.
 *   `<jawaban>`   WHAT THEY SAID. Detail about the person, sitting with the person.
 *   `<ingatan>`   WHAT WE HAVE LEARNED SINCE. R2's distillation, and it sits BEHIND
 *                 `<jawaban>` because the person's own sentences outrank a model's
 *                 inferences about them: two blocks can disagree, and the one the
 *                 querent typed is the one that wins. It sits AHEAD of `<riwayat>`
 *                 because it is about the PERSON, and the person material is one
 *                 cluster.
 *
 *                 **IT IS DELIBERATELY NOT NEAREST THE INSTRUCTION, AND THAT IS THE
 *                 PLACEMENT DOING THE MOST WORK.** The slot beside `GILIRANMU:` is
 *                 reserved for *what was just said*, because that is what the next
 *                 bubble answers. A memory in that slot produces a reader who replies
 *                 to a message about a deadline with *"gimana dinner lu tah?"* — using
 *                 the feature correctly and answering nobody. Far from the instruction
 *                 it is what it should be: something the reader happens to know.
 *
 *   `<riwayat>`   WHAT THEY DREW. Between the person and the room, because it is
 *                 context FOR the room rather than part of it (`memory.ts`'s reason).
 *   `<obrolan>`   THE ROOM. Last, and therefore closest to the instruction, because
 *                 what was just said is what the next bubble answers. `memory.ts`'s
 *                 DILUTION argument, pointing the other way: here the newest material
 *                 is the most important, so it goes nearest the ask.
 *
 * `[F3-16]`: **this run's own bubbles are the newest rows of `<obrolan>` and get no
 * separate block.** A `<giliran-ini>` block would make the model treat them as a
 * script it is completing rather than as things that were said.
 *
 * ── WHAT THIS FUNCTION IS THE ONLY CONSUMER OF, AND WHY THAT MATTERS ────────
 *
 * `[F3-5]`: `ChatContext` carries the six decrypted onboarding answers, and **it is
 * consumed here and nowhere else.** This returns `{ system, user, maxTokens }` — three
 * strings and a number — so the only way a decrypted answer could reach a browser is
 * by somebody serialising a `ChatContext` on purpose. `prompt.test.ts`'s canary is the
 * assertion; `clientBoundary.test.ts` and `audit-secrets.ts` are the fences.
 */

/** Model-facing vocabulary, never UI copy — `TURN_LABELS`' rule. */
const LABELS: Record<
  Locale,
  {
    now: string;
    nickname: string;
    address: string;
    lifePath: string;
    sign: string;
    element: string;
    background: string;
    again: string;
    gist: string;
    reversed: string;
    attachedBy: string;
    attachedByThem: string;
    replyMark: string;
    gap: (label: string) => string;
    turn: string;
    you: string;
    speakingTo: string;
    replyingTo: string;
    intent: string;
    angle: string;
    length: string;
    repair: string;
    theQuerent: string;
  }
> = {
  id: {
    now: 'Sekarang, di tempat orang itu:',
    nickname: 'Nama panggilan:',
    address: 'Sapaan yang boleh dipakai:',
    lifePath: 'Angka jalan hidup:',
    sign: 'Tanda kelahiran:',
    element: 'Unsur:',
    background: 'Latar:',
    again: 'ULANG:',
    gist: 'inti',
    reversed: ' (terbalik)',
    attachedBy: 'melampirkan bacaan',
    attachedByThem: 'melampirkan bacaan',
    replyMark: 'membalas',
    gap: (label) => `--- ${label} kemudian ---`,
    turn: 'GILIRANMU:',
    you: 'Kamu:',
    speakingTo: 'Bicara kepada:',
    replyingTo: 'Membalas:',
    intent: 'Maksud:',
    angle: 'Soal:',
    length: 'Panjang: paling banyak',
    repair: 'PERCOBAAN KEDUA. Pesan pertamamu ditolak karena',
    theQuerent: 'orang itu',
  },
  en: {
    now: 'Where they are, it is now:',
    nickname: 'Nickname:',
    address: 'Forms you may use:',
    lifePath: 'Life path number:',
    sign: 'Birth sign:',
    element: 'Element:',
    background: 'Background:',
    again: 'AGAIN:',
    gist: 'gist',
    reversed: ' (reversed)',
    attachedBy: 'attached a reading',
    attachedByThem: 'attached a reading',
    replyMark: 'replying to',
    gap: (label) => `--- ${label} later ---`,
    turn: 'YOUR TURN:',
    you: 'You:',
    speakingTo: 'Speaking to:',
    replyingTo: 'Replying to:',
    intent: 'Intent:',
    angle: 'About:',
    length: 'Length: at most',
    repair: 'SECOND ATTEMPT. Your first message was refused because',
    theQuerent: 'the person',
  },
};

/**
 * The six intents, in the model's language.
 *
 * **F2 OWNS THE MEMBERS AND F3 OWNS THEIR WORDS.** A `Record<BeatIntent, string>` per
 * locale, so a seventh intent is a compile error here rather than an English word
 * arriving in an Indonesian prompt — `[R9]` says a new member is a reconciliation
 * question, and this is the file where that would otherwise be discovered silently.
 */
const INTENT_WORDS: Record<Locale, Record<BeatIntent, string>> = {
  id: {
    answer: 'jawab',
    ask: 'tanya balik, satu pertanyaan pendek',
    react: 'tanggapi singkat',
    tease: 'goda',
    agree: 'setuju, dengan caramu sendiri',
    push_back: 'tidak setuju',
  },
  en: {
    answer: 'answer',
    ask: 'ask back, one short question',
    react: 'react briefly',
    tease: 'tease',
    agree: 'agree, in your own words',
    push_back: 'push back',
  },
};

/** How the transcript names each author. Reader names stay English (`## Card data`). */
function displayName(entry: ChatTranscriptEntry, nickname: string | null, locale: Locale): string {
  if (entry.author === 'user') return nickname ?? LABELS[locale].theQuerent;
  return readerById(entry.author)?.name ?? entry.author;
}

function cardName(cardId: number, reversed: boolean, locale: Locale): string {
  return `${CARDS[cardId]?.name ?? `#${cardId}`}${reversed ? LABELS[locale].reversed : ''}`;
}

/**
 * `<waktu>` — WHAT TIME IT IS, WHERE THE QUERENT IS. **FIRST, AND THE FIRST BLOCK FOR A
 * REASON.**
 *
 * `<penanya>` is first *"so it reads as background the conversation is laid over rather
 * than as the subject"*. The clock is background to the background: it is the frame every
 * other block is read inside, including `<penanya>` itself. So it goes above it, and
 * `<obrolan>` stays last, nearest the instruction, exactly as `memory.ts`'s dilution
 * argument requires.
 *
 * ── WHY THIS BLOCK EXISTS: THE BUG, VERBATIM ───────────────────────────────
 *
 * 2026-08-30T01:39:48Z, which is **08:39 WIB**. The room had agreed 05:00 was the querent's
 * run time; the reading on the table was about lunch. Thessaly wrote *"makan tetap, mif.
 * Perut kosong jam 5 nanti malah kepala pusing, lari gimana mau jalan."* Two errors in one
 * bubble: **`nanti` about a time three hours and forty minutes past**, and **the wrong five
 * o'clock**. Nothing in the prompt could have prevented either, because nothing in the
 * prompt said what time it was — the newest transcript line is *"just now"*, the number `5`
 * is a token, and `nanti` is the statistically ordinary continuation.
 *
 * ── ONE BLOCK, ONE FACT, AND NEVER A STAMP PER LINE ────────────────────────
 *
 * `[F2-16]` reason 1 survives the reversal intact: *a timestamp invites the model to
 * mention it*, and *"seperti yang kamu bilang jam 14.22"* is the surveillance tell the
 * contract already forbids by name. So the clock is stated once, as the frame, and the
 * transcript keeps prose ages. `prompt.test.ts` still asserts no `[HH:MM]` appears on a
 * transcript line.
 *
 * ── NULL RENDERS NOTHING ───────────────────────────────────────────────────
 *
 * A thread that predates Phase 1, or a querent whose client never reported an offset,
 * gets no block. **Not a UTC clock, and not "waktu tidak diketahui"** — the first is the
 * exact failure the old ruling feared, and the second is a fact the model will reason
 * about and hedge around. `assemble.ts`'s silence rule.
 *
 * `stripUntrusted` is applied though every byte here is code-derived, because **the builder
 * that writes a fence is the one that strips its material** (`buildLotusPrompt`'s
 * precedent) and that invariant is worth more as a mechanical rule than as a case-by-case
 * judgement. It is idempotent and costs nothing.
 */
function timeBlock(ctx: ChatContext): string {
  if (!ctx.clock.known) return '';
  const line = `${LABELS[ctx.locale].now} ${renderNow(ctx.clock, ctx.locale)}`;
  return `<waktu>\n${stripUntrusted(line)}\n</waktu>`;
}

/**
 * `<penanya>` — the person, as background.
 *
 * Three numerology facts and not five (`CHAT_NUMEROLOGY_FACTS`): `/account` shows five
 * because it is a page about numbers, and a chat prompt handed five produces a reader
 * reciting arithmetic — V3's whole finding, that *"the app has stopped doing arithmetic
 * out loud"*. **Glosses, never raw arithmetic** (VD1).
 *
 * The Lotus summary sits here rather than being replaced by the six answers: **the
 * summary is the shape and the answers are the detail.** A reader with only the detail
 * writes about incidents; a reader with only the shape asks nothing specific.
 */
function personBlock(ctx: ChatContext): string {
  const L = LABELS[ctx.locale];
  const lines: string[] = [];
  if (ctx.nickname) lines.push(`${L.nickname} ${ctx.nickname}`);
  /*
   * The forms are listed even when there is only one, because the contract says *"use
   * ONE of them, or none at all"* and a list of one is what makes that rule readable.
   * `[F3-2]`: a one-element list is a correct outcome, not a missing feature.
   */
  if (ctx.addressForms.length > 0) lines.push(`${L.address} ${ctx.addressForms.join(', ')}`);
  for (const fact of ctx.facts) {
    const label = fact.kind === 'lifePath' ? L.lifePath : fact.kind === 'sun' ? L.sign : L.element;
    lines.push(`${label} ${fact.value} -- ${fact.gloss}`);
  }
  if (ctx.lotus) lines.push(`${L.background} ${ctx.lotus}`);
  if (lines.length === 0) return '';
  return `<penanya>\n${lines.join('\n')}\n</penanya>`;
}

/**
 * `<jawaban kunci="…">`, one block per answer, rendered **exactly as
 * `buildLotusPrompt` renders it** — deliberately, so the inbound defence is the same
 * function and a reviewer comparing the two sees one shape.
 *
 * `[F3-7]`: **a skipped answer produces no block and its key appears nowhere.** This
 * diverges from `buildLotusPrompt`, which renders `(dilewati)`, and the divergence is
 * the point: the distiller needs a stable prompt shape so two querents get comparable
 * distillations, and the chat needs the model never to learn that a question exists and
 * was declined. A reader who asks about the one thing you refused to answer is
 * `C-D8`'s *"worst possible version of this feature"*.
 */
function answerBlocks(ctx: ChatContext): string {
  return ctx.answers
    .map((a) => `<jawaban kunci="${a.key}">\n${stripUntrusted(a.text)}\n</jawaban>`)
    .join('\n');
}

/**
 * `<ingatan>` — what this room has learned about them, distilled.
 *
 * ── THE SAME TAG IN BOTH LOCALES, AND `<riwayat>`'s REASON IS WHY ───────────
 *
 * `R17`: an English querent will never type *"riwayat"* and will absolutely type
 * *"history"*, so the English-looking tag is the one carrying injection surface. Identical
 * here — *"memory"* is a word somebody types, *"ingatan"* is not — and the second reason is
 * plainer: two spellings of one fence means two names in every rule, two names in every test,
 * and a locale in which one of them was forgotten.
 *
 * ── PLAIN LINES, NOT BULLETS ────────────────────────────────────────────────
 *
 * `historyBlock`'s shape, reused rather than re-derived. A leading `- ` would be a markdown
 * list in a prompt whose FORM RULES forbid the model from writing one, which is asking a
 * model to read a shape it has just been told not to produce. The contract has enough to do.
 *
 * ── STRIPPED HERE, BY THE FENCE'S WRITER ────────────────────────────────────
 *
 * `roomBlock`'s rule and `buildLotusPrompt`'s precedent: **the builder that writes a fence is
 * the one that strips its material.** The assembler strips too; the pass is idempotent, and
 * the guarantee lives with the fence rather than with a caller's discipline.
 */
function memoryBlock(ctx: ChatContext): string {
  if (ctx.memory.length === 0) return '';
  const lines = ctx.memory.map((line) => stripUntrusted(line)).filter((line) => line.length > 0);
  if (lines.length === 0) return '';
  return `<ingatan>\n${lines.join('\n')}\n</ingatan>`;
}

/**
 * `<riwayat>` — what they drew. W5's `src/lib/prompt/memory.ts` block's line shape, reused
 * rather than re-derived, so the two blocks a model may see in this app look alike.
 * **That is W5's `memoryBlock`, not the one directly above** — R2 gave this file a function
 * of the same name, and the two are unrelated.
 *
 * The `ULANG` / `AGAIN` marker is **computed in code** (`memory.ts`'s rule) and here it
 * means *a card that turned up in more than one of these readings* — which is the
 * legitimate version of *"you drew The Tower three times this month"*. There is no
 * current draw in a chat to compare against, so the repetition is inside the window.
 */
function historyBlock(ctx: ChatContext): string {
  if (ctx.readings.length === 0) return '';
  const L = LABELS[ctx.locale];
  const lines = ctx.readings.map((r) => {
    const cards = r.cards.map((c) => cardName(c.cardId, c.reversed, ctx.locale)).join(', ');
    const when = formatLocalDate(r.localDate, ctx.locale);
    const who = readerById(r.readerId)?.name ?? r.readerId;
    const gist = r.gist ? ` — ${L.gist}: ${r.gist}` : '';
    return `${when} (${who}): ${cards}${gist}`;
  });
  if (ctx.repeatCardIds.length > 0) {
    lines.push(
      `${L.again} ${ctx.repeatCardIds.map((id) => CARDS[id]?.name ?? `#${id}`).join(', ')}`,
    );
  }
  return `<riwayat>\n${lines.join('\n')}\n</riwayat>`;
}

/**
 * How long ago, in the locale's own words.
 *
 * **NO CLOCK TIME ON A TRANSCRIPT LINE — AND THE REASON CHANGED WITHOUT THE RULE
 * CHANGING.**
 *
 * This header used to say: *"THE SERVER DOES NOT KNOW THE QUERENT'S TIMEZONE — only
 * `local_date` does, and only because a client sends it — so a clock time in this prompt
 * would be Jakarta's or the lambda's, and a reader remarking that it is late at night to
 * somebody eating lunch is worse than a reader with no clock at all."* **That premise is
 * false as of 2026-08-30** and `<waktu>` above is the clock it said could not exist. The
 * old argument is kept here and at length in `docs/workstream-notes.md` because it was
 * correct about the world it was written in.
 *
 * **THE RULE SURVIVES ON ITS OTHER LEG**, which is `[F2-16]`'s reason 1: a timestamp on a
 * line invites the model to quote it, and *"seperti yang kamu bilang jam 14.22"* is the
 * surveillance tell the contract forbids by name. So the clock is stated ONCE, as a frame,
 * and each line still carries a relative age — which is also the thing the model actually
 * needs here, since `C-D11`'s *"out of nowhere"* reply is about an old message and not
 * about 14:02.
 *
 * **DIGITS HERE ARE DURATIONS AND THEY STAY.** *3 jam lalu* is true under every offset and
 * was never the problem; converting it to prose buckets would be `window.ts`'s job in
 * `window.ts`'s file, and would change the shape the director's own window renders in.
 * Nothing about this function moved in this phase, deliberately.
 */
function ageLabel(fromIso: string, now: number, locale: Locale): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(fromIso)) / 60000));
  if (minutes < 1) return locale === 'id' ? 'baru saja' : 'just now';
  if (minutes < 60) return locale === 'id' ? `${minutes} menit lalu` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return locale === 'id' ? `${hours} jam lalu` : `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return locale === 'id' ? `${days} hari lalu` : `${days} d ago`;
}

/**
 * The same unit, as a gap between two messages: `--- 3 jam kemudian ---`.
 *
 * **UNCHANGED BY THE CLOCK, AND IT IS THE ONE AGE THE VOICE ALREADY SAW.** A gap is a
 * duration between two lines of the transcript, true in every zone, and it is rendered for
 * both profiles. It was already the counterexample to *"the voice gets no ages"*, and it
 * remains one.
 */
function gapLabel(minutes: number, locale: Locale): string {
  if (minutes < 60) return locale === 'id' ? `${minutes} menit` : `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return locale === 'id' ? `${hours} jam` : `${hours} hours`;
  const days = Math.round(hours / 24);
  return locale === 'id' ? `${days} hari` : `${days} days`;
}

/** A gap this long between two messages gets a marker of its own. */
const GAP_MINUTES = 60;

/**
 * `<obrolan>` — the room, oldest first, closest to the instruction.
 *
 * **AN ATTACHMENT IS RENDERED INLINE AT ITS OWN MESSAGE AND IS NEVER HOISTED** (seam
 * S4, F6's shape and F3's placement): *position is the meaning*, and hoisting a reading
 * attached ten messages ago to the top of the prompt would make it read as the current
 * subject.
 *
 * **THE DIRECTOR PROFILE GETS IDS AND AGES; THE VOICE PROFILE GETS NEITHER** (§4.2).
 * `C-D11` lets the director point a beat at any id in this window, so it needs them; a
 * voice does not, and would only be tempted to write one into its bubble.
 */
function roomBlock(ctx: ChatContext, now: number): string {
  if (ctx.messages.length === 0) return '';
  const L = LABELS[ctx.locale];
  const forDirector = ctx.profile === 'director';
  const lines: string[] = [];

  let previous: number | null = null;
  for (const m of ctx.messages) {
    const at = Date.parse(m.createdAt);
    if (previous !== null) {
      const gap = Math.round((at - previous) / 60000);
      if (gap >= GAP_MINUTES) lines.push(L.gap(gapLabel(gap, ctx.locale)));
    }
    previous = at;

    const who = displayName(m, ctx.nickname, ctx.locale);
    const head = forDirector ? `[${m.id} | ${ageLabel(m.createdAt, now, ctx.locale)}] ` : '';
    const quote =
      m.replyToAuthor === null
        ? ''
        : `[${L.replyMark} ${displayName(
            { ...m, author: m.replyToAuthor },
            ctx.nickname,
            ctx.locale,
          )}] `;
    const attached = m.attachment === null ? '' : `[${L.attachedBy}] `;
    /*
     * **THE BODY IS STRIPPED HERE, AND THE FENCE'S WRITER IS WHY.** `chat_messages.body`
     * is stored verbatim (`C-D20`) — it is text a person typed, exactly like
     * `readings.question` — so the string that could close `<obrolan>` early arrives
     * from the database rather than from a parameter. `buildLotusPrompt` sets the
     * precedent: the builder that writes a fence is the one that strips its material.
     * Idempotent, so the assembler stripping too costs nothing.
     */
    lines.push(`${head}${who}: ${quote}${attached}${stripUntrusted(m.body)}`.trim());
    /*
     * The block goes on its OWN lines under the message that carries it, so the
     * transcript still reads as a sequence of messages and the reading does not become
     * part of somebody's sentence.
     */
    if (m.attachment !== null) lines.push(m.attachment);
  }

  return `<obrolan>\n${lines.join('\n')}\n</obrolan>`;
}

/**
 * The one unfenced block. **Instructions live outside a fence; material lives inside
 * one.**
 *
 * `Membalas:` names the quoted message by its author and a short slice, which is what
 * a person sees when they look at a quote stub — **never by id**, because an id in the
 * voice's prompt is a string it might write into a bubble.
 */
function instruction(args: {
  ctx: ChatContext;
  self: ReaderId;
  beat: Beat;
  budget: ChatLengthBudget;
  repairReason: string | null;
}): string {
  const { ctx, self, beat, budget, repairReason } = args;
  const L = LABELS[ctx.locale];
  const lines = [L.turn, `${L.you} ${readerById(self)?.name ?? self}`];

  const to =
    beat.to === 'user'
      ? (ctx.nickname ?? L.theQuerent)
      : (readerById(beat.to)?.name ?? beat.to);
  lines.push(`${L.speakingTo} ${to}`);

  if (beat.replyTo) {
    const quoted = ctx.messages.find((m) => m.id === beat.replyTo) ?? ctx.replyTo;
    if (quoted) {
      const who = displayName(quoted, ctx.nickname, ctx.locale);
      /*
       * Stripped BEFORE it is sliced, because a slice through a half-written tag is
       * exactly the shape the fixpoint loop exists for — and this line is unfenced.
       */
      const clean = stripUntrusted(quoted.body);
      const snippet = clean.slice(0, QUOTE_SNIPPET_CHARS);
      lines.push(
        `${L.replyingTo} ${who} — "${snippet}${clean.length > QUOTE_SNIPPET_CHARS ? '…' : ''}"`,
      );
    }
  }

  lines.push(`${L.intent} ${INTENT_WORDS[ctx.locale][beat.intent]}`);
  /*
   * The angle is model output, capped at `MAX_ANGLE_CHARS` and stripped by F2's
   * `validatePlan` (`[R9]`). Stripped again here because this line is UNFENCED: it sits
   * in the instruction block, which is the one place in the prompt where text is read
   * as a command, so it is the last place to trust a caller's discipline.
   */
  if (beat.angle) lines.push(`${L.angle} ${stripUntrusted(beat.angle)}`);
  lines.push(
    `${L.length} ${budget.maxWords} ${ctx.locale === 'id' ? 'kata.' : 'words.'}`,
  );

  /*
   * `C-R7`'s ONE retry, and the repair line names the REASON rather than repeating the
   * rule: the rules are already in the system prompt, and a model that has just broken
   * one is better served by being told which. The reason is a member of a closed set,
   * so nothing user-derived arrives here.
   */
  if (repairReason) lines.push(`${L.repair} ${repairReason}.`);

  return lines.join('\n');
}

/** Enough of a quoted message to recognise it, never enough to be a second copy. */
const QUOTE_SNIPPET_CHARS = 80;

/**
 * `chat-v1.<sha8>`, over the STATIC layers only — `build.ts`'s scheme.
 *
 * **WHAT IS DELIBERATELY NOT HASHED: every per-user block.** The person, the answers,
 * the history and the transcript all vary per request, and including them would turn a
 * version into a per-row nonce: `group by prompt_version` would return one row per
 * bubble and the column would answer nothing.
 *
 * The intent words ARE hashed, because changing what `push_back` tells a model to do is
 * exactly the kind of prompt change this column exists to make visible.
 */
export function chatPromptVersion(locale: Locale, self: ReaderId, budget: ChatLengthBudget): string {
  const digest = createHash('sha256')
    .update(
      [
        locale,
        chatBaseContract(locale, budget, self),
        chatReaderPrompt(self, locale),
        JSON.stringify(INTENT_WORDS[locale]),
        JSON.stringify(LABELS[locale]),
        /*
         * **THE WEEKDAY AND DAY-PART WORDS ARE A STATIC LAYER AND ARE HASHED; THE RENDERED
         * CLOCK IS PER-REQUEST AND IS NOT.** Same rule as every block above: including a
         * per-user value would turn the version into a per-row nonce and
         * `group by prompt_version` would return one row per bubble.
         */
        JSON.stringify(CHAT_TIME_VOCAB[locale]),
      ].join('\0'),
    )
    .digest('hex');
  return `chat-v1.${digest.slice(0, 8)}`;
}

export type BuildChatPromptArgs = {
  ctx: ChatContext;
  /** The beat's reader. `VoiceInput.beat.reader`, never guessed. */
  self: ReaderId;
  beat: Beat;
  budget: ChatLengthBudget;
  /** `C-R7`'s second attempt: the closed reason the first was refused for. */
  repairReason?: string | null;
  /** Injected so the ages are testable. Defaults to now. */
  now?: number;
};

/**
 * THE PROMPT. `{ system, user, maxTokens }` and nothing else (`[F3-5]`).
 *
 * The system prompt is the contract plus this reader's chat block: rules, in the place
 * rules live. The user turn is the fenced blocks plus one unfenced instruction:
 * material, in the place material lives. **The count is deliberately not written here** —
 * it has moved twice in one release, and the block-order list in the file header is the one
 * place that has to be right. **`[F3-6]`: not one byte of the six answers is
 * in the system prompt**, which `prompt.test.ts`'s canary asserts by name.
 */
export function buildChatPrompt(args: BuildChatPromptArgs): CompletionPrompt {
  const { ctx, self, beat, budget } = args;
  const now = args.now ?? Date.now();

  const system = `${chatBaseContract(ctx.locale, budget, readerById(self)?.name ?? self)}\n\n${chatReaderPrompt(self, ctx.locale)}`;

  const user = [
    timeBlock(ctx),
    personBlock(ctx),
    answerBlocks(ctx),
    memoryBlock(ctx),
    historyBlock(ctx),
    roomBlock(ctx, now),
    instruction({ ctx, self, beat, budget, repairReason: args.repairReason ?? null }),
  ]
    .filter((block) => block.length > 0)
    .join('\n\n');

  return { system, user, maxTokens: CHAT_MAX_TOKENS };
}
