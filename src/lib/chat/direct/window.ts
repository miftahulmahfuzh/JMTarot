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
import type { Beat, ChatAuthor } from '../types';
import type { PlanCaps } from './caps';
import type { Affinity, AffinityBucket } from './affinity';

/** One `chat_messages` row, as much of it as a routing decision needs. */
export type WindowSource = {
  id: string;
  author: ChatAuthor;
  body: string;
  /** ISO. Rendered as an AGE, never as a clock — see `ageBucket`. */
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
 * `[F2-16]` AGES ARE PROSE BUCKETS, NEVER TIMESTAMPS, AND NO BUCKET NEEDS A TIMEZONE.
 *
 * Three reasons, each sufficient:
 *
 * 1. **A timestamp invites the model to mention it.** *"Seperti yang kamu bilang jam
 *    14.22"* is the surveillance tell `base.id.ts` already forbids in as many words —
 *    *"jangan menyebutkan bahwa kamu mengetahuinya"* — and it is precisely the line that
 *    turns uncanny into creepy. An angle is 90 characters and a timestamp fits inside it
 *    comfortably.
 * 2. **A bucket cannot be recited as a figure.** V3's rule, in a third place: the model
 *    cannot do date arithmetic it was never handed the inputs for. `window.test.ts`
 *    asserts **no bucket string contains a digit**.
 * 3. **The server does not know the querent's timezone.** Only `local_date` does, and
 *    only when a client sends one. **Every bucket below is computable from a duration
 *    alone** — which is why the list stops at *kemarin* and contains no *"pagi tadi"*, a
 *    phrase that would need a wall clock the server has not got.
 *
 * A bucket is an ORDER OF MAGNITUDE and not a claim about a calendar; *kemarin* is kept
 * deliberately narrow (20–30 hours) because it is the one bucket a reader could repeat
 * to the querent as a fact.
 */
export function ageBucket(minutes: number, locale: Locale): string {
  const hours = minutes / 60;
  const days = hours / 24;
  if (minutes < 2) return locale === 'id' ? 'baru saja' : 'just now';
  if (minutes < 45) return locale === 'id' ? 'beberapa menit lalu' : 'a few minutes ago';
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
}): WindowEntry[] {
  const { locale, caps, triggerMessageId, now } = args;

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
    const ageMinutes = Math.max(0, Math.round((now - Date.parse(m.createdAt)) / 60000));

    const laterOtherSide = ordered
      .slice(index + 1)
      .some((later) => later.id !== triggerMessageId && side(later.author) !== side(m.author));

    return {
      ordinal: index + 1,
      id: m.id,
      author: m.author,
      body,
      ageLabel: ageBucket(ageMinutes, locale),
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
