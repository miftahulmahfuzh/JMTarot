/**
 * WHAT AN UNPROMPTED RUN IS ABOUT. `C-N2e`'s enumeration, made concrete.
 *
 * ── SIX KINDS, CLOSED, AND `describeMaterial`'s SWITCH IS EXHAUSTIVE ───────
 *
 * A seventh member is a compile error at the `AssertNever` below rather than an
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
 */
import type { Locale, ReaderId, ServiceId, YesNo } from '@/data/types';
import type { FrequencyMechanic } from '@/lib/memory/shadow';
import type { WindowKey } from '@/lib/memory/windows';
import { MATERIAL_NOTES } from './notes';

/** The closed set, in no particular order — `MATERIAL_ORDER` below is the ranking. */
export type MaterialKind =
  | 'reading'
  | 'unanswered'
  | 'orphan'
  | 'recurring'
  | 'occasion'
  | 'lotus';

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

export type Material =
  | ReadingMaterial
  | UnansweredMaterial
  | OrphanMaterial
  | RecurringMaterial
  | OccasionMaterial
  | LotusMaterial;

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
 */
export const MATERIAL_ORDER = [
  'occasion',
  'reading',
  'unanswered',
  'recurring',
  'orphan',
  'lotus',
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
      return {
        kind: m.kind,
        facts: {
          top: m.mechanic.topName,
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
