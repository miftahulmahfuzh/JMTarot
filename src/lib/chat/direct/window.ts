/**
 * THE ROOM AS THE DIRECTOR SEES IT: numbered lines, prose ages, and one flag.
 *
 * ── PURE. Its inputs are rows and a clock; its output is a string and a lookup.
 *
 * ── `[F2-15]` THE PROMPT SPEAKS IN ORDINALS, `#1..#n`, AND NEVER IN uuids ───
 *
 * **The most load-bearing small decision in this workstream.** A `chat_messages.id` is
 * a uuid: 36 characters the model must reproduce byte-exactly, times up to 24 lines it
 * might choose from. A single mistyped character is an unresolvable reply target — and
 * worse, it is unresolvable in a way that looks like a hallucination rather than a typo,
 * so the honest repair (null it, `P3`) would fire on beats the model got substantively
 * right.
 *
 * An ordinal is one or two characters, it is trivially checkable against the window that
 * produced it, and `checkPlan` owns the mapping back. **It is also what makes the worked
 * example possible at all**: `#2` appearing in a three-line window and then in the plan
 * below it is the blog editor's `[0] → at:0` lesson — *an index rule needs a worked
 * example, not a definition* — and there is no way to show that with uuids.
 *
 * **THE STORED SHAPE NEVER SEES AN ORDINAL.** `checkPlan` resolves before a `Beat`
 * exists, so F3 joins on a real id and `chat_messages.reply_to_message_id` can never
 * take a `#`.
 *
 * ── AND IT IS NOT F3's `roomBlock`, WHICH IS A DIFFERENT WINDOW ────────────
 *
 * `prompt/build.ts`'s director branch renders `[<uuid> | 3 jam lalu]` per line. That is
 * F3's file and F3's shape for the block F3 writes; **the director's prompt is F2's**,
 * and the two differ on exactly the point above. Both are correct for their own reader:
 * a uuid is unusable to a model that must *emit* one and harmless to a model that only
 * *reads* it. Nothing here edits that file.
 */
import type { Locale, ReaderId } from '@/data/types';
import { stripUntrusted } from '@/lib/prompt/sanitize';
import { localDayDelta, resolveChatClock } from '../clock';
import type { Beat, ChatAuthor, ChatClock, DayPart, KnownChatClock } from '../types';
import type { PlanCaps } from './caps';
import type { Affinity, AffinityBucket } from './affinity';

/** One `chat_messages` row, as much of it as a routing decision needs. */
export type WindowSource = {
  id: string;
  author: ChatAuthor;
  body: string;
  /** ISO. Rendered as an AGE — a prose bucket, never a timestamp. See `ageBucket`. */
  createdAt: string;
};

/** One line of the rendered window, plus what `checkPlan` needs to police it. */
export type WindowEntry = {
  /** 1-based, stable within one render. The `#n` the model may point at. */
  ordinal: number;
  id: string;
  author: ChatAuthor;
  /** Stripped, and truncated unless this is the trigger message. */
  body: string;
  ageLabel: string;
  ageMinutes: number;
  /** `P8`'s input and prompt rule 8's marker. Computed here, never inferred there. */
  unanswered: boolean;
};

/**
 * `[F2-16]` AGES ARE PROSE BUCKETS, NEVER TIMESTAMPS. **THREE REASONS WERE GIVEN AND ONE
 * OF THEM IS NOW FALSE. IT IS RECORDED HERE RATHER THAN DELETED.**
 *
 * 1. **A timestamp invites the model to mention it.** *"Seperti yang kamu bilang jam
 *    14.22"* is the surveillance tell `base.id.ts` already forbids in as many words, and
 *    an `angle` is 90 characters — a timestamp fits comfortably. **STILL TRUE, AND IT IS
 *    NOW THE PRIMARY REASON.** It is why the clock is stated ONCE, in one line above the
 *    window, and never stamped on a transcript line.
 * 2. **A bucket cannot be recited as a figure.** V3's rule in a third place: the model
 *    cannot do date arithmetic it was never handed the inputs for. **STILL TRUE, AND
 *    `window.test.ts` STILL ASSERTS NO BUCKET STRING CONTAINS A DIGIT** — the assertion
 *    was kept and extended to the clocked path rather than relaxed. Every phrase added
 *    below is a word.
 * 3. *"The server does not know the querent's timezone … which is why the list stops at
 *    kemarin and contains no 'pagi tadi', a phrase that would need a wall clock the server
 *    has not got."* **FALSE SINCE 2026-08-30.** The browser reports an offset,
 *    `chat_threads.utc_offset_minutes` has held the column since `0014` (`[R17]` folded it
 *    in *"so that ruling the other way later is one line rather than a migration"*), and
 *    the wall clock this file now takes is that line being cashed. `docs/workstream-notes.md`
 *    carries the reversal and the reported bug that forced it.
 *
 * ── WHAT THE CLOCK BUYS, AND WHAT IT DOES NOT ──────────────────────────────
 *
 * With a clock, *kemarin* becomes a **derived calendar fact** rather than a 20–30 hour
 * duration approximation — which removes the reason the old bucket was *"kept deliberately
 * narrow … because it is the one bucket a reader could repeat to the querent as a fact"*.
 * A reader repeating it is now repeating something true.
 *
 * **IT DOES NOT FIX THE REPORTED BUG BY ITSELF.** *"Perut kosong jam 5 nanti"* at 08:39
 * was a clock time named INSIDE a message, not the age of one; the fix for that is the
 * `<waktu>` block and the contract's `WAKTU:` section. This is the second-order half: a
 * director that can tell *pagi tadi* from *beberapa jam lalu* stops treating a nine-hour-old
 * line as fresh.
 *
 * ── AND `pagi tadi` IS INDONESIAN. `kelmarin` IS MALAY AND IS ON THE GREP ──
 *
 * `MALAY` in `src/lib/copy/vocab.ts` lists `kelmarin`. Every phrase below was checked
 * against that list; this is the single most likely place in the release for a Malay word
 * to arrive, because the vocabulary of *yesterday* and *this morning* is where the two
 * languages sit closest.
 */

/** Two known clocks: when the message was written, and when now is. Both or neither. */
export type AgeSpan = { at: KnownChatClock; now: KnownChatClock } | null;

/**
 * Same local day, a part of it that has already passed. **NO MEMBER IS NULL**, and the
 * unreachable cases are handled where they belong: `anchoredBucket` returns null when the
 * message and now are in the SAME part, which is what the old `night: null` was standing in
 * for under a different set of boundaries.
 *
 * Keyed on the five parts `@/lib/chat/types`' `DayPart` declares — phase 7's, because those
 * five tokens are persisted inside a `tod:` `material_key`.
 */
const EARLIER_TODAY: Record<Locale, Record<DayPart, string>> = {
  id: {
    morning: 'pagi tadi',
    midday: 'siang tadi',
    afternoon: 'sore tadi',
    evening: 'tadi malam',
    late: 'dini hari tadi',
  },
  en: {
    morning: 'earlier this morning',
    midday: 'earlier today',
    afternoon: 'this afternoon',
    evening: 'earlier this evening',
    late: 'in the small hours',
  },
};

/**
 * The previous local day. Two phrases only: the evening of it, and the rest of it.
 * *semalam* is Indonesian for *last night*; **`kelmarin` is the Malay word and is on the
 * grep**, so the plain form here is `kemarin`.
 */
const YESTERDAY: Record<Locale, { evening: string; plain: string }> = {
  id: { evening: 'semalam', plain: 'kemarin' },
  en: { evening: 'last night', plain: 'yesterday' },
};

/**
 * The calendar-anchored bucket, or null to fall through to the duration ladder.
 *
 * **NULL IS THE COMMON ANSWER AND THE LADDER IS NOT A FALLBACK FOR FAILURE.** Same day and
 * the same part of it (*an hour ago, still morning*) has no calendar phrase that says
 * anything a duration does not, and two days back has no phrase at all.
 */
function anchoredBucket(
  span: { at: KnownChatClock; now: KnownChatClock },
  locale: Locale,
): string | null {
  const delta = localDayDelta(span.at.localDate, span.now.localDate);
  if (delta === null || delta < 0) return null;
  if (delta === 0) {
    /* Still inside the same part of the day: a duration says more than a name does. */
    if (span.at.part === span.now.part) return null;
    return EARLIER_TODAY[locale][span.at.part];
  }
  if (delta === 1) {
    /* The evening AND the small hours of yesterday both read as *semalam*. */
    return span.at.part === 'evening' || span.at.part === 'late'
      ? YESTERDAY[locale].evening
      : YESTERDAY[locale].plain;
  }
  return null;
}

/**
 * How old a line is, in the locale's own words.
 *
 * **THE FIRST TWO RUNGS ARE UNCONDITIONAL AND THE CLOCK CANNOT OVERRIDE THEM.** *baru
 * saja* and *beberapa menit lalu* are true in every calendar and are the two the director
 * acts on most; routing them through day-part arithmetic could only make them worse.
 * Above 45 minutes the calendar knows more than the duration does, so it wins when it has
 * something to say.
 *
 * `span` is OPTIONAL and defaults to null, which is the pre-clock behaviour byte for byte.
 * Every existing caller and every existing assertion is unaffected.
 */
export function ageBucket(minutes: number, locale: Locale, span: AgeSpan = null): string {
  const hours = minutes / 60;
  const days = hours / 24;
  if (minutes < 2) return locale === 'id' ? 'baru saja' : 'just now';
  if (minutes < 45) return locale === 'id' ? 'beberapa menit lalu' : 'a few minutes ago';

  if (span !== null) {
    const anchored = anchoredBucket(span, locale);
    if (anchored !== null) return anchored;
  }

  if (hours < 2.5) return locale === 'id' ? 'sekitar sejam lalu' : 'about an hour ago';
  if (hours < 20) return locale === 'id' ? 'beberapa jam lalu' : 'a few hours ago';
  if (hours < 30) return locale === 'id' ? 'kemarin' : 'yesterday';
  if (days < 7) return locale === 'id' ? 'beberapa hari lalu' : 'a few days ago';
  if (days < 21) return locale === 'id' ? 'minggu lalu' : 'last week';
  return locale === 'id' ? 'lama sekali' : 'a long time ago';
}

/** How the window names each author. **These are the tokens the model must emit.** */
const AUTHOR_WORD: Record<Locale, string> = { id: 'penanya', en: 'the querent' };

export function authorLabel(author: ChatAuthor, locale: Locale): string {
  return author === 'user' ? AUTHOR_WORD[locale] : author;
}

const UNANSWERED_MARK: Record<Locale, string> = {
  id: '[belum dijawab]',
  en: '[unanswered]',
};

/**
 * Does this message end in a question?
 *
 * **A QUESTION MARK IS WHAT A QUESTION LOOKS LIKE IN BOTH LOCALES**, which is why the
 * test is mechanical and needs no join against `chat_runs.beats` to recover a beat's
 * `intent`. Trailing emoji, format characters and combining marks are stripped first —
 * *"kapan? 😅"* is a question — and nothing else is: a `?` in the middle of a paragraph
 * is a rhetorical aside, not a message left hanging.
 */
function endsWithQuestion(body: string): boolean {
  return /\?$/.test(body.replace(/[\s\p{So}\p{Sk}\p{Cf}\p{M}]+$/gu, ''));
}

function side(author: ChatAuthor): 'user' | 'reader' {
  return author === 'user' ? 'user' : 'reader';
}

/**
 * Build the window. Oldest first, ordinals 1-based, newest last — so `#n` grows in the
 * direction the conversation did and the trigger message is the highest number.
 *
 * ── THE `unanswered` PREDICATE, AND THE TWO PLACES IT DIVERGES FROM THE PLAN ─
 *
 * §10 of the plan writes it as four clauses. Two of them cannot be built as written and
 * both divergences are recorded rather than quietly dropped:
 *
 *   - *"no later message has `reply_to_message_id = m.id`"* — **the data is not here.**
 *     `ChatTranscriptEntry` (F3's type, seam S2) carries `replyToAuthor` and not the
 *     quoted id, and widening it is an edit to F3's file. The clause below is strictly
 *     weaker and errs toward NOT flagging, which is the direction the plan asks for.
 *   - *"no later message exists whose author is on the OTHER side"* — **the trigger
 *     message is excluded from `later`.** Without that exclusion the clause could never
 *     fire on a `user_message` run at all: the run's own trigger is by definition a
 *     later message from the other side, so every hanging reader question would go
 *     unmarked on precisely the runs where prompt rule 5 needs it. The plan's own worked
 *     example (§6.3) marks Thessaly's question `[belum dijawab]` beside the querent's
 *     brand-new reply, which is only consistent with this reading.
 *
 * **BIASED HARD TOWARD NOT FLAGGING**, and the asymmetry decides the shape: a false flag
 * pushes the director to re-answer something already answered, which reads to the
 * querent as not listening — the exact opposite of the effect `C-D11` exists to produce.
 * A missed flag costs one nice moment.
 */
export function buildWindow(args: {
  messages: readonly WindowSource[];
  locale: Locale;
  caps: PlanCaps;
  /** Never truncated: it is the thing being answered. */
  triggerMessageId: string | null;
  now: number;
  /**
   * The querent's clock, resolved once per advance in `run.ts` (phase 1).
   *
   * **OPTIONAL, AND THE DEFAULT IS THE PRE-CLOCK BEHAVIOUR.** Twelve fixtures across
   * `window.test.ts`, `system.test.ts` and `validate.test.ts` build these args, and making
   * it required would edit all twelve for no signal. The wiring is asserted instead, on
   * the source, in `direct/contract.test.ts` — this codebase's idiom for exactly this.
   *
   * A `known: false` clock behaves exactly as an absent one: the duration ladder answers.
   */
  clock?: ChatClock;
}): WindowEntry[] {
  const { locale, caps, triggerMessageId, now } = args;
  const offsetMinutes = args.clock?.known ? args.clock.offsetMinutes : null;
  const nowClock = resolveChatClock({ offsetMinutes, now: new Date(now) });

  const ordered = [...args.messages]
    .sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id),
    )
    .slice(-caps.windowMessages);

  return ordered.map((m, index) => {
    const isTrigger = m.id === triggerMessageId;
    const clean = stripUntrusted(m.body);
    const body =
      isTrigger || clean.length <= caps.windowBodyChars
        ? clean
        : `${clean.slice(0, caps.windowBodyChars)}…`;
    const at = Date.parse(m.createdAt);
    const ageMinutes = Math.max(0, Math.round((now - at) / 60000));

    /*
     * Both clocks or neither. A message whose `created_at` does not parse gets no span and
     * falls to the duration ladder, which is what it did before there was a clock at all.
     *
     * **THE `Number.isNaN` GUARD IS LOAD-BEARING AND THE PLAN'S SUBSTITUTION TABLE DID NOT
     * NAME IT.** The cancelled `wallClockAt` returned `null` on a bad instant; phase 1's
     * `resolveChatClock` deliberately does NOT — it falls back to the real now rather than
     * throw inside `advance()`. Without this line an unparseable `created_at` would be
     * clocked at today and could render a confident *pagi tadi* on a row whose age is
     * unknown, which is worse than the *lama sekali* it fell to before there was a clock.
     */
    const atClock =
      offsetMinutes === null || Number.isNaN(at)
        ? null
        : resolveChatClock({ offsetMinutes, now: new Date(at) });
    const span: AgeSpan =
      nowClock.known && atClock !== null && atClock.known ? { at: atClock, now: nowClock } : null;

    const laterOtherSide = ordered
      .slice(index + 1)
      .some((later) => later.id !== triggerMessageId && side(later.author) !== side(m.author));

    return {
      ordinal: index + 1,
      id: m.id,
      author: m.author,
      body,
      ageLabel: ageBucket(ageMinutes, locale, span),
      ageMinutes,
      unanswered:
        !isTrigger &&
        endsWithQuestion(clean) &&
        ageMinutes >= caps.oldReplyMinAgeMinutes &&
        !laterOtherSide,
    };
  });
}

/**
 * The `<obrolan>` block.
 *
 * **THE FENCE IS WRITTEN HERE AND ITS MATERIAL IS STRIPPED IN `buildWindow`** —
 * `buildLotusPrompt`'s precedent: *the builder that writes a fence is the one that
 * strips it*. `stripUntrusted` is idempotent, so the assembler having stripped too costs
 * nothing, and a literal `</obrolan>` typed by a querent cannot close the block early
 * and put the rest of their sentence where the rules live.
 *
 * `obrolan` is one token in both locales (R17): an English querent will never type
 * *"obrolan"* and would absolutely type *"chat"*, so the Indonesian-looking tag is the
 * one that carries no injection surface.
 */
export function renderWindow(entries: readonly WindowEntry[], locale: Locale): string {
  if (entries.length === 0) return '';
  const lines = entries.map((e) => {
    const mark = e.unanswered ? `   ${UNANSWERED_MARK[locale]}` : '';
    return `#${e.ordinal}  ${authorLabel(e.author, locale)}  ${e.ageLabel}   ${e.body}${mark}`;
  });
  return `<obrolan>\n${lines.join('\n')}\n</obrolan>`;
}

/**
 * `#3` → a `chat_messages.id`, or null.
 *
 * Tolerant of the shapes a model actually returns — `3`, `"#3"`, `" #03 "` — because
 * refusing a plan over a missing `#` would be refusing it for a habit (`P3`'s bias).
 * **Intolerant of everything else**, including a uuid: a model that answered with an id
 * did not read the window, and a uuid that exists in another querent's thread is
 * indistinguishable from a hallucinated one to anything but a lookup. The window IS the
 * lookup, and it is scoped to one `user_id` by construction because F3's assembler built
 * it.
 */
export function resolveOrdinal(raw: unknown, entries: readonly WindowEntry[]): string | null {
  if (typeof raw === 'number') {
    return entries.find((e) => e.ordinal === raw)?.id ?? null;
  }
  if (typeof raw !== 'string') return null;
  const match = /^\s*#?\s*(\d{1,3})\s*$/.exec(raw);
  if (!match) return null;
  const ordinal = Number(match[1]);
  return entries.find((e) => e.ordinal === ordinal)?.id ?? null;
}

/**
 * The reader with the strongest claim on the first beat: the one whose question is still
 * hanging. **The most recent such reader, because the older one has been overtaken.**
 *
 * *"A reader who asks and then never refers to the answer is worse than one who never
 * asked"* (`C-N1d`), and this line plus prompt rule 5 are what close that loop.
 */
export function awaitingReader(entries: readonly WindowEntry[]): ReaderId | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (e.unanswered && e.author !== 'user') return e.author;
  }
  return null;
}

/**
 * Who spoke last time — the previous run's cast, derived rather than queried.
 *
 * Walk back from the newest message, skip the querent's own trailing messages (the
 * trigger, and anything they typed before anybody answered), then take the readers up to
 * the next thing the querent said. **`chat_runs` is not consulted**: a run id is not on
 * `ChatTranscriptEntry`, and the trailing block of reader bubbles *is* the previous run
 * by construction, since one room has one live run at a time (`mintRun`).
 */
export function recentlySpoke(entries: readonly WindowEntry[]): ReaderId[] {
  const cast: ReaderId[] = [];
  let seenReader = false;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const { author } = entries[i];
    if (author === 'user') {
      if (seenReader) break;
      continue;
    }
    seenReader = true;
    if (!cast.includes(author)) cast.push(author);
  }
  return cast;
}

const BUCKET_WORD: Record<Locale, Record<AffinityBucket, string>> = {
  id: { strong: 'kuat', some: 'sedikit', none: 'tidak' },
  en: { strong: 'strong', some: 'some', none: 'none' },
};

/**
 * `[F2-5]` THE AFFINITY LINE OMITS `none` READERS, AND IS OMITTED WHOLLY WHEN NOTHING
 * MATCHED.
 *
 * A proactive run has no message to score. **A model shown three negatives concludes
 * something is wrong with the querent; a model shown nothing decides on other grounds**,
 * which is what it should be doing. Same rule as `MENUNGGU JAWABAN`: an absent line is
 * silence, and a line saying *tidak ada* is a fact the model will reason about.
 */
export function renderAffinity(affinity: Affinity, locale: Locale): string {
  const parts = (['thessaly', 'margaret', 'adrian'] as const)
    .filter((reader) => affinity.by[reader] !== 'none')
    .map((reader) => `${reader}=${BUCKET_WORD[locale][affinity.by[reader]]}`);
  return parts.join('  ');
}

/**
 * A beat sheet as a human reads it — `npm run smoke -- --chat --director` prints one of
 * these above every exchange, and §15.4 is the five questions to ask of it.
 *
 * **FOR A LOG AND FOR THE SMOKE SCRIPT, NEVER FOR A QUERENT** (`[F2-2]`). It is the only
 * place a beat sheet becomes text, and nothing in `src/app/**` may call it.
 */
export function renderBeatSheet(args: {
  label: string;
  trigger: string;
  locale: Locale;
  source: 'model' | 'fallback';
  beats: readonly Beat[];
  affinity?: Affinity;
  window?: readonly WindowEntry[];
}): string {
  const head = [
    args.label,
    `trigger=${args.trigger}`,
    `locale=${args.locale}`,
    `source=${args.source}`,
    args.affinity ? `affinity: ${renderAffinity(args.affinity, args.locale) || '-'}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join('   ');

  if (args.beats.length === 0) return `${head}\n  (no beats -- C-R6, and this is a GOOD outcome)`;

  const lines = args.beats.map((beat, index) => {
    const target = args.window?.find((e) => e.id === beat.replyTo);
    const quote = beat.replyTo === null ? '' : `-> ${target ? `#${target.ordinal}` : beat.replyTo}`;
    return [
      `  ${index + 1}`,
      beat.reader.padEnd(9),
      beat.intent.padEnd(10),
      `to=${beat.to}`.padEnd(14),
      quote.padEnd(8),
      beat.angle === null ? '' : `"${beat.angle}"`,
    ].join(' ');
  });

  return `${head}\n${lines.join('\n')}`;
}
