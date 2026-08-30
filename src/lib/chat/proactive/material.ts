/**
 * WHAT AN UNPROMPTED RUN IS ABOUT. `C-N2e`'s enumeration, made concrete.
 *
 * ── EIGHT KINDS, CLOSED, AND `describeMaterial`'s SWITCH IS EXHAUSTIVE ─────
 *
 * A ninth member is a compile error at the `AssertNever` below rather than an
 * `undefined` handed to a director — the `Record<Locale, …>` facade argument applied to
 * a different axis. The list is closed because the failure of an open one is silent: a
 * material nobody wrote a note for produces a run with nothing in its `BAHAN:` line,
 * which is `C-N2e`'s *"hai, apa kabar?"* arriving through a hole in a switch.
 *
 * ── `[F5-8]` ONE MATERIAL PER RUN. NEVER A BUNDLE ─────────────────────────
 *
 * The selector returns `Material | null`, singular. A message that mentions your
 * reading, your recurring card and your birthday in one breath is a newsletter, and a
 * newsletter is precisely what `C-N1b` forbids at the register level. **A friend
 * messages you about one thing.**
 *
 * ── `[F5-9]` A MATERIAL IS A FACT, EXPRESSED. NEVER A SENTENCE TO SAY ──────
 *
 * `describeMaterial()` returns structured facts plus one short neutral line. It never
 * returns *"Bilang ke dia kalau The Moon muncul lagi"*. That is `effectiveYesNo()`'s
 * rule, `validateChoice`'s rule and the admin Insight prompt's rule in a fourth place:
 * **where code knows something, code states it and the model decides how to say it.**
 * A model handed a sentence will paraphrase it, and three readers handed the same
 * sentence will paraphrase it three ways in one run.
 *
 * And V3's ruling on top: **the counts are deleted from the material, not forbidden in
 * it.** `recurring` carries the Shadow Arcana, the pulse line and the dominance word
 * exactly as `frequencyMechanic()` produces them, and never `m`, `n` or `topCount` — *a
 * model cannot recite a count it was never given.*
 *
 * ── PURE. NO `server-only`, NO DATABASE, NO CLOCK ─────────────────────────
 *
 * `detect.ts` builds these from rows; this file only shapes and renders them, so
 * `npm test` can drive every note in both locales with no Docker. `tally.ts`'s rule:
 * the smoke script imports it too.
 *
 * **AND "NO CLOCK" MEANS NO `new Date(` WRITTEN HERE, NOT NO CALENDAR.** R3's
 * `time_of_day` needs a weekday from a `'YYYY-MM-DD'` string; `weekdayOf` is integer
 * arithmetic in `@/lib/chat/clock` precisely so this file can have one without
 * acquiring a timezone to be wrong in. `clientBoundary.test.ts` greps this file's own
 * source, which is what that distinction is written against.
 */
import type { Locale, ReaderId, ServiceId, YesNo } from '@/data/types';
import type { FrequencyMechanic } from '@/lib/memory/shadow';
import type { UserMemoryKind } from '@/lib/memory/profile/types';
import type { WindowKey } from '@/lib/memory/windows';
import { DAY_PARTS, weekdayOf } from '../clock';
import type { DayPart, Weekday } from '../types';
import { MATERIAL_NOTES } from './notes';

/** The closed set, in no particular order — `MATERIAL_ORDER` below is the ranking. */
export type MaterialKind =
  | 'reading'
  | 'unanswered'
  | 'orphan'
  | 'recurring'
  | 'occasion'
  | 'lotus'
  | 'profile'
  | 'time_of_day';

/** M5's three, checked in this order by `detect.ts`. */
export type OccasionKind = 'birthday' | 'first_reading_anniversary' | 'return';

/**
 * M1 — a reading since the last proactive run. **The strongest material**: the only one
 * that is about something the querent *did*, deliberately, in the last few hours, and
 * the only one whose trigger is an event rather than a scan.
 *
 * **NO `body`, AND `hadQuestion` IS A BOOLEAN RATHER THAN THE QUESTION.**
 * `RecalledReading`'s stated reason, one workstream over: the raw question is not model
 * output, and dropping it removes injection surface and tokens in one move. F3's
 * assembler decides what the *voices* see of a reading; F5's job is to name **which**
 * reading and to hand over fields cheap enough to sit in a plan prompt.
 *
 * A `PILIHAN:`/`CHOICE:` marker cannot appear here, and it is satisfied by not doing
 * anything: `readings.body` is the stripped body by construction and F5 never reads it.
 * Written down because F6 has the same rule for the attachment and somebody will wonder
 * why F5's is missing.
 */
export type ReadingMaterial = {
  kind: 'reading';
  readingId: string;
  readerId: ReaderId;
  serviceId: ServiceId;
  cards: ReadonlyArray<{ cardId: number; name: string; reversed: boolean }>;
  gist: string | null;
  verdict: YesNo | null;
  /** `readings.choice` — a slice of the querent's own question, never the model's copy. */
  choice: string | null;
  hadQuestion: boolean;
  localDate: string;
};

/**
 * M2 — a reader question the querent never answered. §7, and `C-N1d`'s other half.
 *
 * **The question's TEXT is not copied in.** `C-R5` and F3's context window already put
 * the actual message in front of the voice, and copying it would make the run's prompt
 * carry the same sentence twice — which is how a model decides the sentence is
 * important and repeats it.
 */
export type UnansweredMaterial = {
  kind: 'unanswered';
  messageId: string;
  readerId: ReaderId;
  askedAgoHours: number;
};

/**
 * M3 — a bubble nobody replied to. **Medium strength, and the director is told the
 * intent is to CONTINUE, never to check in.** In a real group a message nobody answered
 * is normal and usually stays that way; this material is legitimate when a reader has
 * something to *add*, and illegitimate as an *"anyone there?"*.
 */
export type OrphanMaterial = {
  kind: 'orphan';
  messageId: string;
  readerId: ReaderId;
  ageHours: number;
};

/**
 * M4 — a recurring card. **V3's mechanic, passed through and never rebuilt.**
 *
 * `FrequencyMechanic`'s key set is asserted exactly in `shadow.test.ts` *"because the
 * way a tally returns is somebody adding `topCount` for a good-looking reason"*, so F5
 * carries the object rather than copying fields out of it.
 */
export type RecurringMaterial = {
  kind: 'recurring';
  window: WindowKey;
  /** `fingerprintOf()`. **This is what makes M4 self-expiring** — see `materialKey`. */
  fingerprint: string;
  mechanic: FrequencyMechanic;
};

/**
 * M5 — a date that matters. **Strongest when it hits, and it almost never hits.**
 *
 * **NO AGE, EVER.** `profiles.birth_date` is a full date and the readers do not need the
 * year: a reader who knows how old you are is a reader who read your file, and it is one
 * sentence away from the register `C-N1b` forbids. `years` is present only for
 * `first_reading_anniversary`, where it is a fact about the app rather than about the
 * person.
 */
export type OccasionMaterial = {
  kind: 'occasion';
  occasion: OccasionKind;
  years: number | null;
  /** The querent's day, for the key. A STRING (`[F5-3]`). */
  localDate: string;
};

/**
 * M6 — a Lotus fact newly relevant. **The weakest of the six.**
 *
 * `lotus_avatars.summary` is model output that already passed `lotusSafetyCheck`, so
 * `A5`'s abstraction rule is satisfied without F5 touching `onboarding_answers` at all.
 * **F5 NEVER DECRYPTS ANYTHING**: `C-D8` condition 1 says the decryption happens in
 * exactly one new place and that place is F3's assembler. F5 is not it and must not
 * become it.
 */
export type LotusMaterial = {
  kind: 'lotus';
  summary: string;
  /** `lotus_avatars.updated_at`, ISO, for the key. */
  updatedAtIso: string;
};

/**
 * M7 — something the room already knows about the querent, from `user_memory` (R3).
 *
 * ── IT CARRIES NO TEXT, AND THAT IS THE WHOLE DESIGN ──────────────────────
 *
 * The remembered fact is prose a model wrote about a real person, distilled from text they
 * typed into this room. `materialLine`'s contract is *"a closed token and card names, never
 * free text"*, and the `BAHAN:` line sits in `assemble.ts`'s header — **above `<obrolan>`,
 * outside every fence** — which is exactly where `build.ts`'s rule says untrusted text may
 * not go.
 *
 * **`LotusMaterial` INTERPOLATES ITS SUMMARY AND THIS ONE MUST NOT, AND THE DIFFERENCE IS
 * THE SIZE OF THE SURFACE.** The Lotus is generated ONCE from six fixed onboarding answers
 * behind `lotusSafetyCheck`; `user_memory` is rebuilt continuously from whatever the querent
 * types. One attempt at that unfenced line versus unlimited attempts at it.
 *
 * **So the type has nowhere to put the text.** `describeMaterial` cannot leak a field the
 * object does not carry, `material.test.ts` asserts this key set exactly, and the fact
 * reaches the reader through phase 5's fenced `<ingatan>` instead — where the voice, not the
 * director, is the one that needs it. V8's `<sosok>` rule: **enforced by construction rather
 * than by prompting.**
 *
 * The obvious counter-argument is `recurring`, whose note names its card because of a
 * measurement: with a generic note no card name reached the bubble. It does not transfer.
 * There the director's angle was the voice's ONLY channel to the card name; here the voice
 * holds the fact independently, in `<ingatan>`. That measurement was about a missing
 * channel, and this kind has a second one.
 */
export type ProfileMaterial = {
  kind: 'profile';
  /**
   * The `user_memory` item's id — twelve lowercase hex characters
   * (`USER_MEMORY_ITEM_ID_RE`), so it can never contain `:` and the key's grammar holds.
   * **Content-derived and stable across regenerations is phase 3's contract**, and it is
   * what makes `chat_runs_user_material_uq` able to stop one opener firing twice.
   */
  itemId: string;
  /**
   * The item's CLOSED kind token, phase 3's `UserMemoryKind`. **The type comes from
   * `@/lib/memory/profile/types`, a zero-import leaf**, so this file stays pure.
   *
   * **ITS MEMBERSHIP IS GUARANTEED BY `isUserMemoryItem` AND NOT BY A SECOND MAPPER HERE.**
   * The draft of this phase carried a `profileKindOf()` folding anything unrecognised to
   * `'other'`, so *"a vocabulary mismatch costs precision and never a dropped item"*. That
   * is not what the release does: phase 4's parser refuses an element whose `kind` is
   * outside the set (`prompt.ts`, the `kinds.includes` guard), and phase 5's `<ingatan>` and
   * phase 6's `/account` both narrow the column with `isUserMemoryItem`, which drops it.
   * **So a drifted kind costs the ITEM, uniformly, everywhere** — and a mapper here would
   * make this the one surface that disagreed, casting the director on a subject the voice
   * cannot see.
   */
  itemKind: UserMemoryKind;
  /** The querent's month, `'YYYY-MM'`. **A STRING SLICE** (`[F5-3]`), never a `Date`. */
  month: string;
};

/**
 * M8 — what time it is where the querent is. **The ice-breaker** (R3).
 *
 * *"kamu weekend ini kemana aja?"* (Sunday afternoon) and *"njir, udah senin aja. mager ga
 * lu ngantor?"* (Monday morning) are the two examples this kind exists for, and neither is
 * derivable without phase 1's offset: without one, `nanti` and `tadi` are the bug `08:39` /
 * *"jam 5 nanti"* already proved.
 *
 * **EVERY FIELD IS A CLOSED TOKEN AND NOTHING HERE IS FREE TEXT** — which makes this the
 * easy half of the R3 pair, and the one whose `facts` line is exactly what §6.3 describes.
 *
 * **`part` COVERS ALL TWENTY-FOUR HOURS, `late` INCLUDED, ON PURPOSE.** Whether a reader
 * may speak at 03:00 is `eligibility.ts`'s quiet-hours gate; what there would be to say at
 * 03:00 is this. Two mechanisms — a detector that quietly refused the small hours would be
 * quiet hours hidden inside a material, in a file the operator cannot switch off, and
 * *"belum tidur?"* is a real thing a friend says at one in the morning.
 */
export type TimeOfDayMaterial = {
  kind: 'time_of_day';
  /** The querent's day, `'YYYY-MM-DD'`. A STRING (`[F5-3]`). */
  localDate: string;
  weekday: Weekday;
  part: DayPart;
  shape: DayShape;
};

/*
 * **THE CALENDAR IS IMPORTED, NOT DECLARED** (reconciliation ruling 1). `Weekday` and
 * `DayPart` are `@/lib/chat/types`'; `DAY_PARTS` and `weekdayOf` are `@/lib/chat/clock`'s.
 * The five day-part tokens and their boundaries are this phase's and are unchanged —
 * `morning` 05–10, `midday` 11–14, `afternoon` 15–17, `evening` 18–21, `late` 22–04 — and
 * `late` starting at 22 is what makes phase 8's default quiet window agree by construction.
 *
 * **AND THE WORDS ARE IMPORTED TOO** (ruling 3): `CHAT_TIME_VOCAB`, read by `notes.{id,en}`.
 * A second table is how one prompt says *"Monday morning"* on one line and *"siang"* on
 * another — phase 2's `<waktu>` block and this material both put a weekday in front of a
 * model, and that is not duplication to remove: one is ambient and one is the subject. But
 * the words must agree, so there is only one table.
 *
 * **AND THE PROFILE VOCABULARY IS PHASE 3's** (ruling 4). `UserMemoryKind`, not a
 * `ProfileTopic` of this phase's own: two closed sets describing one item is two sets that
 * drift, and phase 3's is the one persisted in `user_memory.items`.
 *
 * **AND THERE IS NO `profileKindOf()` MAPPER — SEE `ProfileMaterial.itemKind`.** The draft
 * carried one so an unrecognised kind would fold to `'other'` rather than dropping the item.
 * Nothing else in the release behaves that way: phase 4 refuses to write such an element and
 * phases 5 and 6 both drop it, so a mapper here would make this the one surface that
 * disagreed.
 */

/**
 * **THE JUDGEMENT, STATED BY CODE RATHER THAN INFERRED BY A MODEL.** `effectiveYesNo()`'s
 * rule again: a weekday name alone leaves *"is this the start of the working week"* to the
 * model, and the two shapes the querent's own examples name are exactly that judgement — put
 * to a director that may be reasoning about a locale it has no calendar for.
 */
export const DAY_SHAPES = ['week_start', 'weekend', 'weekend_close', 'ordinary'] as const;
export type DayShape = (typeof DAY_SHAPES)[number];

/**
 * The two shapes the querent's own examples name, plus the weekend and the ordinary day.
 *
 * **ORDER MATTERS.** Monday morning is `week_start` before it is anything else, and Sunday
 * afternoon is `weekend_close` before it is `weekend`, because *"the weekend is nearly
 * over"* is the thing worth speaking about and *"it is the weekend"* is not.
 */
export function shapeOf(weekday: Weekday, part: DayPart): DayShape {
  if (weekday === 'mon' && (part === 'morning' || part === 'midday')) return 'week_start';
  if (weekday === 'sun' && (part === 'afternoon' || part === 'evening')) return 'weekend_close';
  if (weekday === 'sat' || weekday === 'sun') return 'weekend';
  return 'ordinary';
}

/**
 * **THE ONE CONSTRUCTOR FOR M8, CALLED BY BOTH `detect.ts` AND `brief.ts`.**
 *
 * The mint and the plan are two requests hours apart and `brief.ts` rebuilds the subject
 * from `material_key` alone. Two independent derivations of `weekday` and `shape` is two
 * chances for them to disagree, and a run that changed what it was about between mint and
 * plan is the failure `brief.ts`'s header names by name. So there is one.
 *
 * `null` on a malformed day or an unknown part, never a throw: `brief.ts`'s rule is that a
 * key it cannot read is a run it cannot describe, not one it should fail.
 */
export function timeOfDayMaterial(localDate: string, part: DayPart): Material | null {
  if (!(DAY_PARTS as readonly string[]).includes(part)) return null;
  const weekday = weekdayOf(localDate);
  if (weekday === null) return null;
  return { kind: 'time_of_day', localDate, weekday, part, shape: shapeOf(weekday, part) };
}

export type Material =
  | ReadingMaterial
  | UnansweredMaterial
  | OrphanMaterial
  | RecurringMaterial
  | OccasionMaterial
  | LotusMaterial
  | ProfileMaterial
  | TimeOfDayMaterial;

/**
 * THE ORDER THE DETECTORS RUN IN. **A FIXED ORDER, NOT A SCORE** (§4.2).
 *
 * A score is a number somebody tunes, a tuned number needs a corpus, and there is no
 * corpus — this feature has never run. The order encodes three judgements that do not
 * need tuning:
 *
 *   - an occasion is rarer and more welcome than anything else;
 *   - a thing the querent just did beats a thing the app noticed;
 *   - an unanswered question is more urgent than a pattern, **because a question decays
 *     and a pattern does not.**
 *
 * No tie-break is needed: the kinds are mutually exclusive at detection and the first
 * hit wins.
 *
 * ── WHERE THE TWO R3 KINDS GO, IN THOSE SAME TERMS ────────────────────────
 *
 * **`profile` is above `recurring` and below `unanswered`.** It does not decay, so it
 * ranks under the one that does. Against `recurring` the second judgement decides it one
 * step further out: *a thing the querent said about their own life beats a thing the app
 * counted about their deck.* A friend asking how dinner went is a better reason to speak
 * than a tarot app reporting that The Moon keeps coming up — and R3 is a ruling about the
 * room feeling like friends.
 *
 * **`time_of_day` IS LAST, AND THE ARGUMENT IS STRUCTURAL BEFORE IT IS AESTHETIC.** Its
 * key is fresh in every part of every day, so it is the only material in this set with
 * **unlimited supply** — and this list is walked lazily and stops at the first unused key.
 * A material with unlimited supply placed anywhere but last starves everything below it,
 * and the ladder stops being a ranking and becomes a monopoly. The aesthetic argument
 * agrees: every other material is about a thing that happened and this one is about the
 * calendar, which is what somebody brings up when there is nothing else — the definition
 * of an ice-breaker.
 *
 * **RANKING IS NOT VOLUME, AND THIS LIST ONLY DOES THE FIRST.** `detectTimeOfDay` refuses
 * a second `tod:` key on one local day; see its own header for why that brake is what
 * keeps phase 8's daily cap honest.
 */
export const MATERIAL_ORDER = [
  'occasion',
  'reading',
  'unanswered',
  'profile',
  'recurring',
  'orphan',
  'lotus',
  'time_of_day',
] as const satisfies readonly MaterialKind[];

/**
 * THE DE-DUPLICATION KEY. *"Have I already messaged this person about this?"*
 *
 * **A UNIQUE CONSTRAINT ARBITRATES IT, NOT A CHECK-THEN-INSERT** (§4.5): the mint runs
 * from three entry points on three lambdas, and *"has this material been used"* asked
 * before an insert is a race with a window measured in milliseconds. `detect.ts` checks
 * the key as an **optimisation** — so that a used key falls through to the next
 * detector instead of costing the querent their whole run — and
 * `chat_runs_user_material_uq` is what actually settles it.
 *
 * **M4's KEY CONTAINS THE FINGERPRINT, WHICH IS WHAT MAKES IT SELF-EXPIRING.** The
 * verdict changes when the card counts change, the fingerprint moves, and a new key
 * becomes available. Until then the readers say nothing about it again, which is the
 * behaviour a person has.
 *
 * **`return` IS KEYED BY THE DAY AND THE OTHER TWO OCCASIONS BY THE YEAR**, which
 * refines §4.5's `occasion:<occasion>:<YYYY>`. A birthday happens once a year and a
 * greeting for it should too; *coming back* happens whenever somebody comes back, and a
 * once-a-year key would silently swallow the second return. The gap gate and the daily
 * cap are what bound it, not the key.
 *
 * **M8 IS `occasion:return`'s SHAPE REFINED BY ONE FIELD, AND THE PART IS WHY.** A key of
 * `tod:monday-morning` fires once in a lifetime — the room says *"udah senin aja"* one
 * Monday in 2026 and never again — and a key of `tod:<day>` alone would make a Monday
 * morning and a Monday evening the same subject, which they are not: *"udah senin aja"*
 * is false by six o'clock. `tod:2026-W36:monday-morning` sounds tidier and is wrong for a
 * third reason: an ISO week is a calendar no querent lives in. **The day plus the part is
 * the smallest thing that names the subject.** Volume is `detectTimeOfDay`'s brake, not
 * this key's — unlike `return`, whose sentence above still holds.
 *
 * **M7 IS KEYED BY THE ITEM AND THE MONTH.** By the item alone the room could ask about
 * your dinner *once ever*, which turns the whole memory into a one-shot list of maybe
 * fifteen openers and then silence. By the memory row's `updated_at` a single
 * re-extraction that rewrote an unrelated line would re-open **every** item at once. A
 * month is the granularity of the subject: asking a friend about their dinner habit once a
 * month is what a friend does and once a week is a survey. **`month` is a STRING SLICE of
 * the querent's day** — the birthday detector's discipline, never a `Date`.
 */
export function materialKey(m: Material): string {
  switch (m.kind) {
    case 'reading':
      return `reading:${m.readingId}`;
    case 'unanswered':
      return `ask:${m.messageId}`;
    case 'orphan':
      return `orphan:${m.messageId}`;
    case 'recurring':
      return `freq:${m.window}:${m.fingerprint}`;
    case 'occasion':
      return m.occasion === 'return'
        ? `occasion:return:${m.localDate}`
        : `occasion:${m.occasion}:${m.localDate.slice(0, 4)}`;
    case 'lotus':
      return `lotus:${m.updatedAtIso}`;
    case 'profile':
      return `profile:${m.itemId}:${m.month}`;
    case 'time_of_day':
      return `tod:${m.localDate}:${m.part}`;
  }
}

/**
 * WHICH `chat_messages` ROW A BEAT MAY QUOTE, or null.
 *
 * **THIS IS HOW M2 AND M3 REACH `C-D11` WITHOUT A SECOND MECHANISM.** The director is
 * already handed the last N messages with their ids and their ages and *"may point a
 * beat at any of them"*; F5 names one. **F5 does not construct a beat** — that is F2's,
 * and F5 must not touch it.
 */
export function materialReplyTo(m: Material): string | null {
  return m.kind === 'unanswered' || m.kind === 'orphan' ? m.messageId : null;
}

/**
 * WHAT THE DIRECTOR RECEIVES. §4.4.
 *
 * `facts` is **scalars only** — `sanitizeProps()`'s discipline applied to a prompt: no
 * arrays, no nesting. A card list arrives as one string built here, so the director
 * cannot receive a shape it has to parse.
 */
export type MaterialBrief = {
  kind: MaterialKind;
  facts: Record<string, string | number | boolean>;
  replyTo: string | null;
  /** ONE short neutral line, per locale, from the fixed table in `notes.{id,en}.ts`. */
  note: string;
};

/** A card list as one string. `The Moon, The Tower (terbalik), The Star`. */
export function renderCards(
  cards: ReadonlyArray<{ name: string; reversed: boolean }>,
  locale: Locale,
): string {
  const rev = locale === 'id' ? 'terbalik' : 'reversed';
  return cards.map((c) => (c.reversed ? `${c.name} (${rev})` : c.name)).join(', ');
}

/** The compiler's proof that the switch below covers the union. */
type AssertNever<T extends never> = T;

/**
 * THE BRIEF. Facts the director can read, and one line of neutral prose.
 *
 * **THE NOTE IS NEVER A LINE FOR A READER TO SAY** (`[F5-9]`). It names a subject in the
 * flattest possible register, in the run's language, so that the *director* can decide
 * who cares about it — and every word a querent eventually reads is written by a voice
 * from the persona blocks, not lifted from here.
 */
export function describeMaterial(m: Material, locale: Locale): MaterialBrief {
  const note = MATERIAL_NOTES[locale][m.kind](m as never);
  const replyTo = materialReplyTo(m);

  switch (m.kind) {
    case 'reading': {
      const facts: MaterialBrief['facts'] = {
        reader: m.readerId,
        service: m.serviceId,
        cards: renderCards(m.cards, locale),
        had_question: m.hadQuestion,
        day: m.localDate,
      };
      /* Omitted rather than sent as `null`: **an absent line is silence; a line saying
       * `tidak ada` is a fact the model will reason about** (`assemble.ts`'s rule). */
      if (m.verdict) facts.verdict = m.verdict;
      if (m.choice) facts.choice = m.choice;
      if (m.gist) facts.gist = m.gist;
      return { kind: m.kind, facts, replyTo, note };
    }
    case 'unanswered':
      return {
        kind: m.kind,
        facts: { reader: m.readerId, hours_ago: m.askedAgoHours },
        replyTo,
        note,
      };
    case 'orphan':
      return {
        kind: m.kind,
        facts: { reader: m.readerId, hours_ago: m.ageHours },
        replyTo,
        note,
      };
    case 'recurring':
      /*
       * **NO `m`, NO `n`, NO `topCount`, NO `readings` — NOTHING THAT IS A COUNT.**
       * V3's ruling in capitals: *the counts are deleted from both prompts, not
       * forbidden in them. A model cannot recite a count it was never given.*
       * `dominance` is a bucket precisely because a bucket cannot be accidentally
       * recited as a figure.
       */
      /*
       * **`top` IS ABSENT AND THE NOTE CARRIES IT INSTEAD.** The note is the line the
       * director demonstrably reads — measured: with a generic note it took `dominance`
       * into its angle and no card name reached the bubble — and naming the card in both
       * places would put the same noun in the prompt twice, which is the thing the
       * `reading` note refuses to do for the opposite reason. One noun, one place, and the
       * place is the one that works.
       */
      return {
        kind: m.kind,
        facts: {
          second: m.mechanic.secondName,
          shadow: m.mechanic.shadowName,
          pulse: m.mechanic.pulseGloss,
          dominance: m.mechanic.dominance,
        },
        replyTo,
        note,
      };
    case 'occasion': {
      const facts: MaterialBrief['facts'] = { occasion: m.occasion };
      if (m.years !== null) facts.years = m.years;
      return { kind: m.kind, facts, replyTo, note };
    }
    case 'lotus':
      /* The Lotus summary is the fact. There is nothing scalar to add, and inventing a
       * `length` would be a number in a prompt for no reader's benefit. */
      return { kind: m.kind, facts: {}, replyTo, note };
    case 'profile':
      /*
       * **ONE CLOSED TOKEN AND NOTHING ELSE. THE REMEMBERED SENTENCE IS NOT HERE AND
       * CANNOT BE** — `ProfileMaterial` has no field to hold it, so this arm could not
       * leak it if somebody wanted it to. The fact reaches the VOICE through phase 5's
       * fenced `<ingatan>`, where the reader who has to say it is the one who reads it;
       * the director needs the subject in order to cast, and knowing the sentence would
       * buy it nothing and put untrusted prose in an unfenced header.
       *
       * `month` is deliberately absent: it is a date the model could recite, for no
       * reader's benefit — `lotus`'s reason for adding no `length`, and `C-D8`'s ban on
       * saying HOW you know, which is what separates *"nasi padang lagi kan?"* from
       * *"you told me on the 9th"*.
       */
      return { kind: m.kind, facts: { kind: m.itemKind }, replyTo, note };
    case 'time_of_day':
      /*
       * **THREE CLOSED TOKENS AND NO FREE TEXT AT ALL** — the easy half of R3's pair, and
       * exactly the shape §6.3 describes. `shape` is the judgement code makes so the model
       * does not have to.
       *
       * **THE DATE IS NOT A FACT.** It is in the key, where de-duplication needs it, and
       * out of the prompt, where it is a number a reader could recite at somebody who
       * already knows what day it is.
       */
      return {
        kind: m.kind,
        facts: { weekday: m.weekday, part: m.part, shape: m.shape },
        replyTo,
        note,
      };
    default:
      return ((k: AssertNever<typeof m>) => k)(m);
  }
}

/**
 * THE ONE LINE F2's `PlanInput.material` TAKES (seam with F2, §6.3 of the director's
 * plan).
 *
 * `assemble.ts` renders it after `BAHAN:` / `MATERIAL:` and states the contract: **a
 * closed token and card names, never free text.** So this is the closed kind token, the
 * neutral note, and the scalars — and nothing that came out of a model except the gist
 * and the Lotus summary, both of which are already this app's own prose, generated under
 * the format rules and already through their own safety checks.
 *
 * ONE LINE, because the header it joins is one fact per line and a material that spanned
 * three would read as three facts.
 */
export function materialLine(brief: MaterialBrief): string {
  const facts = Object.entries(brief.facts)
    .map(([k, v]) => `${k}=${String(v).replace(/\s+/g, ' ').trim()}`)
    .join('; ');
  const tail = facts === '' ? '' : ` [${facts}]`;
  return `${brief.kind} — ${brief.note}${tail}`.replace(/\n+/g, ' ');
}
