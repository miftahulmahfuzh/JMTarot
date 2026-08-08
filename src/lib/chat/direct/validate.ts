/**
 * `checkPlan` — the director's answer, policed.
 *
 * ── PURE. No `server-only`, no `process.env`, no `@/lib/llm`, no clock. ─────
 *
 * ── `[F2-6]` IT REFUSES SHAPE, NOT TRUTH, AND THIS FILE SAYS SO IN THOSE WORDS
 *
 * `validateInsight`'s ruling verbatim, and it is worth restating because the temptation
 * here is stronger than it was there. **There is no cheap mechanical test for *"is
 * Margaret the right reader for this question"*, none at all for *"does this plan read as
 * natural"*, and none for *"is this angle a good angle"*.** The honest instruments for
 * those are the blind read, F7's cast-distribution and silence-rate panels, and a person
 * opening the room because they want to.
 *
 * What it can catch is shape: a reader who does not exist, an intent outside the union, a
 * reply target that is not in the window, a cast over the caps, an angle that is a
 * paragraph, and a language that is not one of the two.
 *
 * **IT MUST NEVER GROW A "IS THIS PLAN ANY GOOD" JUDGEMENT.** If it starts refusing plans
 * a person would call correct, **loosen it and fix the prompt** — `validateInsight`'s
 * closing instruction, and it binds harder here because a refusal costs a whole run.
 *
 * ── THE BIAS IS SET PER RULE, AND THE TWO DIRECTIONS ARE NOT A MUDDLE ──────
 *
 * A dropped beat costs one bubble. A refused *plan* costs the run and buys the fallback's
 * single beat. So the rules that can null a FIELD and keep the beat all do
 * (`target_missing`, `self_reply`, `old_reply`, `angle`, `to`, `locale`), and only the
 * rules where the beat is unexecutable drop it (`reader`, `intent`) or where the shape of
 * the room forbids it (`adjacent`, `per_reader`, `too_many`).
 *
 * ── `[F2-7]` A PLAN THAT PARSES WITH NO BEATS IS SILENCE; ONE THAT FAILS TO
 *    PARSE IS THE FALLBACK. THESE MUST NEVER BE MERGED ────────────────────
 *
 * `C-R6` makes *"nobody replies"* a valid and desirable plan, and F7 measures the silence
 * rate as the release's own scorecard for whether the director is really deciding.
 * Indistinguishable **from the room** is correct (`C-R7`); indistinguishable **in the
 * data** is a catastrophe: a silence rate that quietly included every parse failure would
 * read as a healthy, thoughtful director on a day the model had stopped emitting JSON.
 * `chat.run_planned.outcome` is what separates them, and it is not optional.
 */
import { isReaderId } from '@/data/readers';
import type { Locale, ReaderId } from '@/data/types';
import { LOCALES } from '@/lib/i18n/locale';
import { stripUntrusted } from '@/lib/prompt/sanitize';
import type { Beat, BeatIntent } from '../types';
import { BEAT_INTENTS } from '../types';
import type { PlanCaps } from './caps';
import { resolveOrdinal, type WindowEntry } from './window';

/**
 * WHY THE WHOLE PLAN WENT. **A CLOSED SET, NEVER A MESSAGE** — it reaches
 * `chat.run_planned.reject_reason` and `events.props` may hold no free text.
 */
export type PlanRefusal = 'unparseable' | 'shape' | 'no_usable_beat';

/** What was fixed. Same rule: closed, and the FIRST one is what F7 would read. */
export type PlanRepair =
  | 'malformed'
  | 'reader'
  | 'intent'
  | 'adjacent'
  | 'per_reader'
  | 'too_many'
  | 'target_missing'
  | 'self_reply'
  | 'old_reply'
  | 'angle'
  | 'to'
  | 'locale';

export type PlanCheckResult =
  | {
      ok: true;
      beats: Beat[];
      locale: Locale;
      repairs: PlanRepair[];
      /** Beats removed, for `dropped` at the event layer. Field-nulls are not drops. */
      dropped: number;
    }
  | { ok: false; reason: PlanRefusal };

export type PlanCheckContext = {
  window: readonly WindowEntry[];
  /** `users.locale`, per `C-D9`'s fallback. Used when the model's `locale` is unusable. */
  fallbackLocale: Locale;
  caps: PlanCaps;
};

/**
 * Find the JSON, in the three shapes a model actually answers in.
 *
 * A leading ` ```json ` fence is a formatting habit and not a refusal to answer, so it is
 * stripped; a sentence before the object is the same kind of habit, so the widest
 * `{ … }` span is tried last. **This accommodation can admit nothing the per-beat rules
 * do not already police** — everything inside is checked field by field — which is the
 * whole reason it is safe to be generous here and strict below.
 */
function parseObject(raw: string): Record<string, unknown> | null | 'shape' {
  const unfenced = raw
    .trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const candidates = [unfenced];
  const first = unfenced.indexOf('{');
  const last = unfenced.lastIndexOf('}');
  if (first > 0 && last > first) candidates.push(unfenced.slice(first, last + 1));

  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return 'shape';
    return parsed as Record<string, unknown>;
  }
  return null;
}

function isIntent(value: unknown): value is BeatIntent {
  return typeof value === 'string' && (BEAT_INTENTS as readonly string[]).includes(value);
}

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The angle, or null.
 *
 * **SANITIZED AT THE POINT OF PRODUCTION RATHER THAN AT THE POINT OF USE** (`[F2-12]`),
 * which is what stops F3 having to remember: a stored `chat_runs.beats` row can then
 * never carry a delimiter, whoever reads it later. It is model output derived from user
 * text flowing into a second model's prompt — `<terjemahan>`'s shape exactly.
 *
 * **THE NEWLINE IS CHECKED BEFORE THE STRIP, AND THAT ORDER IS LOAD-BEARING**:
 * `stripUntrusted` collapses `\n` to a space, so a check afterwards could never fire. A
 * newline means the model wrote *lines* — a message, or a list — and an angle is a
 * subject.
 */
function checkAngle(
  value: unknown,
  caps: PlanCaps,
): { angle: string | null; repaired: boolean } {
  if (value === null || value === undefined) return { angle: null, repaired: false };
  if (typeof value !== 'string') return { angle: null, repaired: true };
  if (value.trim() === '') return { angle: null, repaired: false };
  if (/[\r\n]/.test(value)) return { angle: null, repaired: true };
  if (value.length > caps.maxAngleChars) return { angle: null, repaired: true };
  const clean = stripUntrusted(value);
  if (clean === '') return { angle: null, repaired: true };
  return { angle: clean, repaired: false };
}

/**
 * WHO THE BEAT IS TALKING TO.
 *
 * **`to` IS `[R9]`'s FIELD AND THE PLAN'S §6.1 PREDATES IT.** F2 designed the beat
 * without it and the reconciliation admitted F1's `to` on the ground that *"a beat may
 * address Margaret without quoting her, and may quote a message while addressing the
 * querent about it — two facts, two fields"*. So the JSON contract carries one more key
 * than §6.1 shows, and the director decides it rather than code deriving it: it is a
 * decision, and `build.ts` renders it as `Bicara kepada:` in the voice's own
 * instruction, where it decides whether the querent is addressed by name at all.
 *
 * **AN ABSENT OR SELF-NAMING `to` IS DERIVED, NOT REFUSED** — the addressee of a beat
 * that quotes a reader is that reader, and otherwise it is the querent. A dropped beat
 * over a missing key would be a refusal for a habit.
 */
function checkTo(
  value: unknown,
  reader: ReaderId,
  quotedAuthor: 'user' | ReaderId | null,
): { to: 'user' | ReaderId; repaired: boolean } {
  const derived: 'user' | ReaderId =
    quotedAuthor !== null && quotedAuthor !== 'user' && quotedAuthor !== reader
      ? quotedAuthor
      : 'user';
  if (value === 'user') return { to: 'user', repaired: false };
  if (typeof value === 'string' && isReaderId(value) && value !== reader) {
    return { to: value, repaired: false };
  }
  return { to: derived, repaired: value === undefined || value === null ? false : true };
}

/**
 * The model's text in, a beat sheet out.
 *
 * `beats: []` is accepted and **is the single most important acceptance in this
 * function** (`C-R6`). Unknown keys — on the object or on a beat — are ignored: the
 * parser reads the fields it knows and nothing else, because refusing a plan for an extra
 * key is refusing it for a habit.
 */
export function checkPlan(raw: string, ctx: PlanCheckContext): PlanCheckResult {
  const parsed = parseObject(raw);
  if (parsed === null) return { ok: false, reason: 'unparseable' };
  if (parsed === 'shape') return { ok: false, reason: 'shape' };

  const repairs: PlanRepair[] = [];

  /*
   * **AN ABSENT `beats` KEY IS `shape`, AND ONLY AN EXPLICIT `[]` IS SILENCE.** The
   * plan's R2 is written as *"`beats` is present and is not an array"*, which would admit
   * `{}` as a deliberate silence — and that is precisely the confusion `[F2-7]` exists to
   * forbid. The two rules disagreed; `[F2-7]` is the load-bearing one, because a model
   * that omitted the only key it was asked for did not answer the question.
   */
  if (!Array.isArray(parsed.beats)) return { ok: false, reason: 'shape' };
  const proposed = parsed.beats as unknown[];

  let locale: Locale;
  if (isLocale(parsed.locale)) {
    locale = parsed.locale;
  } else {
    locale = ctx.fallbackLocale;
    if (proposed.length > 0) repairs.push('locale');
  }

  const kept: Beat[] = [];
  const perReader = new Map<ReaderId, number>();
  let oldReplies = 0;
  let dropped = 0;

  for (const [index, candidate] of proposed.entries()) {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      repairs.push('malformed');
      dropped += 1;
      continue;
    }
    const beat = candidate as Record<string, unknown>;

    const reader = beat.reader;
    if (typeof reader !== 'string' || !isReaderId(reader)) {
      repairs.push('reader');
      dropped += 1;
      continue;
    }
    if (!isIntent(beat.intent)) {
      repairs.push('intent');
      dropped += 1;
      continue;
    }

    /* `P5`. Two bubbles in a row from one reader is one message split in half — and
     * `[R19]` already gives a reader two bubbles inside ONE beat when they have more to
     * say, which is the shape that should win. */
    if (kept.length > 0 && kept[kept.length - 1].reader === reader) {
      repairs.push('adjacent');
      dropped += 1;
      continue;
    }
    if ((perReader.get(reader) ?? 0) >= ctx.caps.maxBeatsPerReader) {
      repairs.push('per_reader');
      dropped += 1;
      continue;
    }
    /*
     * `P7`. **TRUNCATION, NOT REFUSAL, AND EVERYTHING AFTER GOES TOO** — the array is
     * ordered, so the beats past the cap are the ones the director thought least
     * important. Checked AFTER `per_reader` (`P6`) so the fifth beat of
     * `A B A B A` is dropped for the reason that actually applies to it.
     */
    if (kept.length >= ctx.caps.maxBeats) {
      dropped += proposed.length - index;
      for (let i = index; i < proposed.length; i += 1) repairs.push('too_many');
      break;
    }

    let replyTo: string | null = null;
    const rawReply = beat.reply ?? beat.replyTo ?? null;
    if (rawReply !== null && rawReply !== undefined) {
      const resolved = resolveOrdinal(rawReply, ctx.window);
      const target = resolved === null ? null : ctx.window.find((e) => e.id === resolved);
      if (target === undefined || target === null) {
        /* `P3`. A hallucinated `#99`. The beat still has something to say; it just stops
         * quoting. */
        repairs.push('target_missing');
      } else if (target.author === reader) {
        /* `P4`. A reader does not reply to their own message. */
        repairs.push('self_reply');
      } else if (
        target.ageMinutes >= ctx.caps.oldReplyMinAgeMinutes &&
        oldReplies >= 1
      ) {
        /*
         * `P8`. **AT MOST ONE OLD QUOTE PER RUN**, and the repair is to null the pointer
         * rather than drop the beat: *"a room where everybody is discussing yesterday is
         * not a lively room, it is a stuck one"* — but the beat itself is fine, it just
         * stops quoting last Tuesday.
         */
        repairs.push('old_reply');
      } else {
        replyTo = target.id;
        if (target.ageMinutes >= ctx.caps.oldReplyMinAgeMinutes) oldReplies += 1;
      }
    }

    const quotedAuthor =
      replyTo === null ? null : (ctx.window.find((e) => e.id === replyTo)?.author ?? null);
    const to = checkTo(beat.to, reader, quotedAuthor);
    if (to.repaired) repairs.push('to');

    const angle = checkAngle(beat.angle, ctx.caps);
    if (angle.repaired) repairs.push('angle');

    kept.push({ reader, to: to.to, replyTo, intent: beat.intent, angle: angle.angle });
    perReader.set(reader, (perReader.get(reader) ?? 0) + 1);
  }

  /*
   * **THE NEGATIVE CONTROL FOR `[F2-7]`, AND IT IS THE ONE REFUSAL WHOSE ABSENCE WOULD BE
   * INVISIBLE IN PRODUCTION.** A plan whose every beat named a fourth reader is a model
   * that misunderstood the task; returning it as `{ ok: true, beats: [] }` would file it
   * under `C-R6`'s deliberate silence and inflate the metric that exists to prove the
   * director is deciding.
   */
  if (proposed.length > 0 && kept.length === 0) return { ok: false, reason: 'no_usable_beat' };

  return { ok: true, beats: kept, locale, repairs, dropped };
}
