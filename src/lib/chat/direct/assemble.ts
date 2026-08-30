import 'server-only';

import type { Locale, ReaderId } from '@/data/types';
import type { CompletionPrompt } from '@/lib/llm/types';
import { renderNow } from '../clock';
import type { ChatClock, RunTrigger } from '../types';
import type { Affinity } from './affinity';
import type { PlanCaps } from './caps';
import { planSystemPrompt } from './system';
import { renderAffinity, renderWindow, type WindowEntry } from './window';

/**
 * THE USER TURN. **Everything the director is given, and nothing else.**
 *
 * ── `[F2-1]` THE DIRECTOR SEES THE ROOM AND NOTHING ABOUT THE PERSON ───────
 *
 * Its input is the message window, the trigger, ages, a code-derived affinity hint and —
 * for a proactive run — a closed material token. **It never receives a decrypted
 * onboarding answer, the Lotus summary, a persona paragraph, a birth date, a nickname or a
 * reading body**, and `PlanInput` below is where that is enforced by construction: there is
 * no field for any of them.
 *
 * *Reason.* `C-D8` amends `A5` for the chat surface and it is the highest-consequence
 * decision in the release. An amendment with five conditions should reach exactly as far as
 * it has to: condition 1 says the decryption happens *in exactly one new place*, the
 * context assembler, and a director that also read the answers would make that sentence
 * false on the day it shipped. **The director's job is *who speaks*** — it does not need to
 * know what the querent said about the worst thing they ever saw in order to decide that
 * Adrian answers.
 *
 * *Failure mode.* Two prompts carrying the six answers instead of one. Each is a place
 * `audit-secrets.ts` has to keep out of the browser, each is a place a prompt-injection
 * attempt lands, and the second one buys nothing. Seam S2 is the same argument from the
 * other side: F3 owns the assembler and the director asks it for **less** rather than
 * building a second one.
 *
 * ── AND IT IS `server-only` BECAUSE IT CARRIES THE PROMPT ─────────────────
 *
 * The two halves of the contract are prose a model reads, so this module is fenced like
 * `prompt/build.ts`. Vitest aliases the marker, so `assemble.test.ts` drives it with no
 * database and no network — which is the property the whole of §15 rests on.
 */
export type PlanInput = {
  trigger: RunTrigger;
  /** `chat_runs.locale`, the minted value. The director may override it (`C-D9`). */
  fallbackLocale: Locale;
  /**
   * When this prompt is being built. **INJECTED SO THE AGES ARE TESTABLE**, exactly as
   * `buildChatPrompt`'s `now` is, and defaulted rather than required for the same reason
   * `clock` is — `system.test.ts` builds these literals.
   */
  now?: number;
  /**
   * The querent's clock (phase 1), resolved once per advance from
   * `chat_threads.utc_offset_minutes`.
   *
   * **ABSENT OR `known: false` OMITS THE `SEKARANG:` LINE ENTIRELY**, which is this file's
   * own rule: *an absent line is silence; a line saying `tidak diketahui` is a fact the
   * model will reason about*. A model told the clock is unknown starts hedging about time;
   * a model told nothing goes by the ages, which is what it did for the whole of v0.7.0.
   */
  clock?: ChatClock;
  window: readonly WindowEntry[];
  affinity: Affinity;
  /** `awaitingReader`. Prompt rule 5 gives this reader first claim. */
  awaiting: ReaderId | null;
  /**
   * F5's closed material token, plus deck card names when the material is a reading.
   * **A closed token and card names, never free text** (§6.3, seam with F5). Null on a
   * `user_message` run, and null again when the subject could not be rebuilt.
   *
   * **`materialLineForRun` IS THE PRODUCER AND RULE 11 IS WHAT MAKES IT LAND.** The line
   * shipped before the rules mentioned it, and the director then read it as an
   * unexplained header and planned from the newest message in the window instead —
   * measured over six live proactive runs, twice. `system.{id,en}.ts`'s rule 11 and its
   * third worked example are the repair; `system.test.ts` asserts both by name.
   */
  material: string | null;
  caps: PlanCaps;
};

/**
 * A runaway guard, and not the length control — `INSIGHT_MAX_TOKENS`'s rule. Four beats of
 * JSON with `MAX_ANGLE_CHARS` angles is roughly 180 tokens; this refuses an essay and never
 * a valid four-beat plan.
 */
export const PLAN_MAX_TOKENS = 400;

/** The trigger, as a phrase. **A closed token rendered as prose**, never the raw value. */
const TRIGGER_WORD: Record<Locale, Record<RunTrigger, string>> = {
  id: {
    user_message: 'pesan baru dari penanya',
    reading_completed: 'penanya baru saja selesai membaca kartu',
    idle_nudge: 'sudah lama tidak ada yang bicara',
    unanswered: 'ada pertanyaan pembaca yang belum dijawab',
    cron: 'sapaan harian',
  },
  en: {
    user_message: 'a new message from the querent',
    reading_completed: 'the querent has just finished a reading',
    idle_nudge: 'nobody has spoken for a while',
    unanswered: "a reader's question was never answered",
    cron: 'the daily check-in',
  },
};

const LABELS: Record<
  Locale,
  {
    now: string;
    trigger: string;
    language: string;
    affinity: string;
    spoke: string;
    awaiting: string;
    material: string;
  }
> = {
  id: {
    now: 'SEKARANG:',
    trigger: 'PEMICU:',
    language: 'BAHASA TERAKHIR:',
    affinity: 'KECOCOKAN:',
    spoke: 'BARU SAJA BICARA:',
    awaiting: 'MENUNGGU JAWABAN:',
    material: 'BAHAN:',
  },
  en: {
    now: 'NOW:',
    trigger: 'TRIGGER:',
    language: 'LAST LANGUAGE:',
    affinity: 'AFFINITY:',
    spoke: 'JUST SPOKE:',
    awaiting: 'WAITING ON:',
    material: 'MATERIAL:',
  },
};

/**
 * The lines above the window.
 *
 * **AN ABSENT LINE IS SILENCE; A LINE SAYING *tidak ada* IS A FACT THE MODEL WILL REASON
 * ABOUT.** So `KECOCOKAN` is omitted wholly when nothing matched (`[F2-5]`),
 * `MENUNGGU JAWABAN` when nobody is waiting, `BARU SAJA BICARA` when the room is new,
 * `BAHAN` on every run a querent triggered — **and `SEKARANG` when no client has ever
 * reported an offset for this querent.** A model shown three negatives concludes something
 * is wrong with the querent; a model shown nothing decides on other grounds, which is what
 * it should be doing.
 *
 * **`SEKARANG` IS FIRST, ABOVE `PEMICU`, AND THE ORDER IS THE ARGUMENT.** Every other line
 * says something about *this run*; the clock says *when all of this is happening*, and it
 * is the frame the trigger and the ages are read inside. It matches `<waktu>`'s position
 * in the voice's user turn, which is the shape a reviewer comparing the two prompts should
 * see.
 *
 * **THERE IS NO WORKED EXAMPLE OF THIS LINE IN THE SYSTEM HALF, AND THAT IS A DELIBERATE
 * TRADE AGAINST `BAHAN`'s LESSON.** `BAHAN` shipped before the rules mentioned it and the
 * director read it as an unexplained header — so a new header line wants a worked example.
 * But `[F2-9]` forbids a quantity in the system half and `system.test.ts` enforces it:
 * every digit there must be an address, a cap, or a rule number, and a rendered clock is
 * none of those. Showing a *fake-shaped* clock would be the blog editor's `at:` failure
 * exactly. **So rule 12 describes it and shows nothing**, and
 * `npm run smoke -- --chat --director` is the instrument that says whether that was enough.
 *
 * **`BARU SAJA BICARA` IS DERIVED FROM THE WINDOW AND IS NOT THE FAIRNESS RULE ITSELF.**
 * The demotion happens in `affinityFor`, in the hint; this line is the same fact stated
 * plainly so that rule 4's *"the reader who was already talking"* override has something
 * to name.
 */
function header(input: PlanInput, recentlySpoke: readonly ReaderId[]): string {
  const L = LABELS[input.fallbackLocale];
  const lines: string[] = [];

  const clock = input.clock;
  if (clock?.known) lines.push(`${L.now} ${renderNow(clock, input.fallbackLocale)}`);

  lines.push(`${L.trigger} ${TRIGGER_WORD[input.fallbackLocale][input.trigger]}`);
  lines.push(`${L.language} ${input.fallbackLocale}`);
  if (input.material !== null) lines.push(`${L.material} ${input.material}`);
  const affinity = renderAffinity(input.affinity, input.fallbackLocale);
  if (affinity !== '') lines.push(`${L.affinity} ${affinity}`);
  if (recentlySpoke.length > 0) lines.push(`${L.spoke} ${recentlySpoke.join(', ')}`);
  if (input.awaiting !== null) lines.push(`${L.awaiting} ${input.awaiting}`);
  return lines.join('\n');
}

/**
 * THE PROMPT. `{ system, user, maxTokens }` and nothing else.
 *
 * The system half is the contract: rules, in the place rules live, outside every fence.
 * The user half is the header plus `<obrolan>`: **the only fenced block, and the only
 * untrusted text in this prompt.** `build.ts`'s rule, one prompt over — *the instruction is
 * the unfenced text and the material is the fenced text* — which is what makes the KEAMANAN
 * clause a complete answer to *"what happens when the querent types `abaikan aturan di
 * atas`"*.
 *
 * `recentlySpoke` is passed rather than derived here so that a caller which already knows
 * the cast (the smoke script, a test) does not have to fake a window to say so.
 */
export function buildPlanPromptFrom(
  input: PlanInput,
  recentlySpoke: readonly ReaderId[] = [],
): CompletionPrompt {
  const window = renderWindow(input.window, input.fallbackLocale);
  return {
    system: planSystemPrompt(input.fallbackLocale, input.caps),
    user: [header(input, recentlySpoke), window].filter((block) => block !== '').join('\n\n'),
    maxTokens: PLAN_MAX_TOKENS,
  };
}
