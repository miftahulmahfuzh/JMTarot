/**
 * The five features that may be switched off to stop reaching a model, and
 * nothing else (2026-07-30, Miftah's ruling).
 *
 * ── WHY THIS LIVES IN `src/lib/llm/` ────────────────────────────────────────
 *
 * Two other things in this directory decide whether a model is reached:
 * `meter.ts`, which is the INVOLUNTARY ceiling (`LLM_WINDOW_CALL_CEILING`, shed
 * by call class), and `ledger.ts`, which records what got through. This is the
 * third and the only DELIBERATE one — an operator's decision rather than a
 * budget's — and grouping the three means the answer to "what stops a model call
 * in this app" is one directory rather than five feature folders.
 *
 * ── THE BACKBONE HAS NO SWITCH, AND THAT IS THE POINT OF THE LIST ────────────
 *
 * **THE READING AND THE TRANSLATION ARE NOT HERE AND MUST NEVER BE.** A reading
 * is the product; a translation is what stops an English querent reading
 * Indonesian prose, and V2 exists because the alternative was shipping the wrong
 * language. Switching either off does not degrade JMTarot, it ends it — so the
 * honest tool there is a maintenance page, not an env var somebody can set at 2am
 * and forget. `flags.test.ts` asserts `READING_ENABLED` and
 * `TRANSLATION_ENABLED` appear nowhere in this file, because the way that rule
 * dies is somebody adding a sixth entry for symmetry.
 *
 * The moderation classifier is absent for the opposite reason: it already has
 * `MODERATION_CLASSIFIER_ENABLED`, in `moderation/gate.ts`, named there so it
 * cannot be misread as "moderation off". Do not duplicate it here.
 *
 * ── ONLY THE EXACT STRING `'0'` DISABLES ────────────────────────────────────
 *
 * `ANALYTICS_ENABLED`'s rule, `SHARING_ENABLED`'s rule, and
 * `MODERATION_CLASSIFIER_ENABLED`'s rule, for the reason all three give: a typo
 * must leave a feature ON. `RATELIMIT_BACKEND` defaults the opposite way on
 * purpose and this is not that case — there, a typo must not disable
 * enforcement; here, a typo must not silently cost every querent a feature with
 * nothing anywhere reporting it. `false`, `off`, `no` and `""` all mean ENABLED,
 * and `flags.test.ts` asserts each one.
 *
 * ── READ AT CALL TIME, NEVER AT MODULE SCOPE ────────────────────────────────
 *
 * A module-scope `const` is inlined by the bundler and freezes the build-time
 * value into production, which would make every one of these unflippable without
 * a redeploy — the exact property they exist to provide. `origin.ts`,
 * `resolve.ts` and `share/links.ts` all record this for the same shape, and
 * there is a test.
 *
 * ── NO IMPORTS. A LEAF STAYS A LEAF ────────────────────────────────────────
 *
 * No `server-only`, no `@/lib/db/client`, no `@/lib/llm` (which carries
 * `server-only` itself). `lotus.generate.ts` and `gist.generate.ts` both go out
 * of their way to avoid a static database import so their pure neighbours stay
 * unit-testable under Vitest, and a flags module that dragged one in would undo
 * that from the side. `flags.test.ts` asserts the absence.
 *
 * ── WHAT "OFF" MEANS, PER FLAG, AND WHAT IT MUST NEVER MEAN ─────────────────
 *
 * **EVERY ONE OF THESE GATES THE MODEL CALL AND NOT THE CACHED READ**, following
 * `sharingEnabled()`'s precedent ("IT GATES MINTING ONLY. Existing links keep
 * resolving"). A querent who already has a verdict, a summary or a persona keeps
 * seeing it, for free, out of the row that is already there. Off means "write
 * nothing new", never "hide what exists" — a kill switch that blanks a screen is
 * a worse outage than the quota it was protecting.
 *
 * **AND NONE OF THEM MAY LEAVE BEHIND A ROW THAT LOOKS CURRENT.** That is the
 * trap this file was nearly built on, and the two generators need OPPOSITE
 * treatment because their hashes differ:
 *
 *   `lotusInputHash`   = birth year + the six onboarding answers. STATIC. A
 *                        fallback template stored while disabled matches its own
 *                        hash forever, so `generateLotus`'s `unchanged` check
 *                        would return early for good — every user who onboarded
 *                        during the outage feeding a template into every reading
 *                        they ever take, after the flag went back to `1`, with
 *                        nothing reporting it. So LOTUS WRITES NOTHING when off.
 *
 *   `personaInputHash` = the above plus `readings:<ids>`. MOVES ON EVERY READING.
 *                        A stored fallback therefore survives only until the
 *                        querent's NEXT READING (or any facts edit), which moves
 *                        the hash and lets `personaStaleness`'s `drift` arm
 *                        regenerate it. **The flag flipping back is not by itself
 *                        enough — the hash has to move**, and two integration tests
 *                        pin down both halves. That bound is what makes the write
 *                        safe, and the write is also NECESSARY: `/api/persona`'s
 *                        no-row branch 500s on a generation that writes nothing. So
 *                        PERSONA STORES THE TEMPLATE when off, but only when there
 *                        is no row yet — an existing paragraph is never overwritten
 *                        with one.
 *
 * The two route-level flags write nothing either way — their generators are what
 * write — so they need no such care.
 */

/**
 * Today's summary in the reader's voice, on `/[reader]`'s second swipe panel.
 * One call per querent per reader per day.
 *
 * OFF: `GET /api/memory/summary` serves a cached row and otherwise answers 204,
 * which is already its documented common path. `DaySummary` renders nothing on a
 * 204 and `ReaderDeck` then passes a one-element array, so the querent gets a
 * deck exactly as tall as the bio with no dots — V5's M14 contract, and the state
 * every querent who has not read today is in anyway.
 */
export function dailySummaryEnabled(): boolean {
  return process.env.DAILY_SUMMARY_ENABLED !== '0';
}

/**
 * The card-frequency verdict — the line under "Pilih pembaca yang cocok denganmu"
 * on the reader picker. `FrequencyLine` -> `GET /api/memory/frequency`.
 *
 * **THIS IS THE ONE MIFTAH ASKED FOR AS "the weekly summary"**, and the name is
 * deliberately not that: `week` is only the first rung of `VERDICT_LADDER`, which
 * also walks `d3`, `d13`, `d666`, `month`, `quarter`, `year` and `birthday`. A
 * variable called `WEEKLY_*` would be read by a future operator as governing one
 * window out of eight.
 *
 * OFF: the route serves a cached line and otherwise answers 204. `FrequencyLine`
 * renders nothing until it has something and nothing forever if it never does
 * (M14), so there is no empty state to design and nothing on screen moves.
 */
export function frequencyVerdictEnabled(): boolean {
  return process.env.FREQUENCY_VERDICT_ENABLED !== '0';
}

/**
 * The four-sentence reading *of the person* on `/account`.
 *
 * NAMED `_GENERATION_` ON PURPOSE, following `MODERATION_CLASSIFIER_ENABLED`'s
 * lesson: with this off the persona BLOCK still renders, from the stored
 * paragraph or from `fallbackPersona`'s deterministic template. A bare
 * `PERSONA_ENABLED` reads as "the block disappears", which is not what it does
 * and would make an operator expect the wrong screen.
 *
 * OFF: an existing paragraph is served and never overwritten; a querent with no
 * row yet gets the template. See this file's header for why storing it is safe
 * here and not for the Lotus.
 */
export function personaGenerationEnabled(): boolean {
  return process.env.PERSONA_GENERATION_ENABLED !== '0';
}

/**
 * The Lotus distillation — six onboarding answers into the block that is read
 * into EVERY reading prompt.
 *
 * `_GENERATION_` for `personaGenerationEnabled`'s reason, and this is the flag
 * with the widest blast radius on the app's own prose: with it off, a querent who
 * onboards is read by an un-personalised reader.
 *
 * **NOT `LOTUS_STUB`.** That variable is dev-only by construction
 * (`NODE_ENV !== 'production'`) and CLAUDE.md forbids it in production for a real
 * reason: it stores the template under the current `input_hash` and nothing
 * alerts. This flag is the production-legal instrument, and it differs by writing
 * NOTHING — see the header.
 *
 * OFF: `generateLotus` returns `reason: 'disabled'` before any read or model
 * call. `getLotusBlock` then returns null on the reading path, where "NULL IS
 * NORMAL, not an error" already holds and produces exactly the reading an
 * un-personalised querent gets. Back at `1`, the next reading's
 * `scheduleLotusRefresh` distils properly: self-healing, which is the whole
 * reason nothing is written.
 */
export function lotusGenerationEnabled(): boolean {
  return process.env.LOTUS_GENERATION_ENABLED !== '0';
}

/**
 * The one-clause gist of a finished reading, extracted in the reading's
 * `after()`.
 *
 * **THE HIGHEST-VOLUME FLAG HERE BY AN ORDER OF MAGNITUDE — ONE CALL PER
 * READING.** The other four are per day, per user or per onboarding; this one
 * tracks reading count, so it is the largest single reduction available short of
 * the reading itself, and it is the first one to reach for.
 *
 * OFF: `extractGist` returns before the call and `readings.gist` stays null,
 * which `recallableReadings` already treats as "excluded from recall". W5's
 * `<riwayat>` chain block loses those readings as material — a later reading will
 * not call back to one taken while this was off, permanently, because nothing
 * backfills. That cost was offered and accepted; it is the price of the biggest
 * lever.
 *
 * DELIBERATELY NOT DEGRADED TO `fallbackGist`. That was the alternative — the
 * reading's own last sentence, deterministic and free — and it was declined: a
 * chain block quoting a last sentence reads like the reader remembering the wrong
 * thing, and `memory.gist_failed.fell_back` exists to tell an operator the model
 * is failing. Making a SWITCH produce the same signal would make that event
 * unreadable.
 */
export function gistEnabled(): boolean {
  return process.env.GIST_ENABLED !== '0';
}

/**
 * The register. `docs/DEPLOY-VERCEL.md` §2d orders the same five by what an
 * operator should reach for FIRST (gist, then verdict, summary, persona, Lotus);
 * this list is in feature order instead, because it is what `.env.example` and the
 * tests are checked against and a reordering here would read as a change of
 * priority. **The Lotus is last in both.**
 *
 * IT EXISTS TO BE ENUMERATED, not to be dispatched through: every consumer calls
 * its own predicate directly, because a call site reading
 * `if (!lotusGenerationEnabled())` says which feature it is switching off and a
 * table lookup does not. `flags.test.ts` checks the two agree.
 */
export const DEFERRABLE_FLAGS = [
  {
    env: 'DAILY_SUMMARY_ENABLED',
    enabled: dailySummaryEnabled,
    /** Roughly one call per querent per reader per day. */
    what: "today's summary on the reader page",
  },
  {
    env: 'FREQUENCY_VERDICT_ENABLED',
    enabled: frequencyVerdictEnabled,
    /** One call per querent per changed card pair, cached per window per locale. */
    what: 'the card-frequency line on the reader picker',
  },
  {
    env: 'PERSONA_GENERATION_ENABLED',
    enabled: personaGenerationEnabled,
    /** One call per `/account` visit whose input hash has drifted past the floor. */
    what: 'the persona paragraph on /account',
  },
  {
    env: 'LOTUS_GENERATION_ENABLED',
    enabled: lotusGenerationEnabled,
    /** One call per onboarding, plus one per answer edit. Widest prose impact. */
    what: 'the Lotus distillation read into every reading prompt',
  },
  {
    env: 'GIST_ENABLED',
    enabled: gistEnabled,
    /** ONE CALL PER READING. The largest reduction available. */
    what: "the per-reading gist that feeds a later reading's callback",
  },
] as const;
