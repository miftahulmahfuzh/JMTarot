# Phase 8: The proactive policy: real quiet hours, a louder cadence

**Plan set:** `CHAT_TIME_AWARENESS_USER_MEMORY_PROACTIVE_PLAN.md`
**Analysis:** `20260830-085616-B4K2_code_analyzer.md`
**Satisfies:** R3 — *"i want the readers to be much more PROACTIVE ... keep coming back to the chat group as often as possible"*
**Depends on:** Phase 1 (the offset is written), Phase 7 (two new material kinds give the louder cadence something to be about)
**Difficulty:** NORMAL
**Package:** `src/lib/chat/proactive`

---

## Reconciliation (round 1 — BINDING, overrides the body where they disagree)

**The cadence numbers land as written — 1h gap, cap 5, TTL 24h, fan-out 20, the morning slot —
but the ARGUMENT that defends them was falsified by phase 7 and has been repaired rather than
waived.** Three rulings, one of them the most consequential in the set:

1. **`maxPerDay`'s defence rested on `no_material` being the binding gate, and phase 7's
   `time_of_day` kind has, in its own words, UNLIMITED KEY SUPPLY** — a fresh
   `tod:<date>:<part>` in every part of every day. With that kind in the ladder the cap becomes
   the binding gate at exactly 5, and *"up to five on a day the ladder has five distinct things
   to say"* stops being true. **The brake is restored inside phase 7**, where the supply is:
   `detectTimeOfDay` refuses when a `tod:` key has already been used for that querent on that
   local day, so at most **one** of the five runs is ever the calendar. `MATERIAL_ORDER`'s
   placement protects ranking; this protects volume. **Do not raise `CHAT_PROACTIVE_MAX_PER_DAY`
   further without checking that brake is still there, and do not remove that brake without
   moving this number.**
2. **THE ARITHMETIC IN `maxPerDay`'s DOC IS STALE AND MUST BE REWRITTEN, NOT COPIED.** It says
   *"a run is up to four bubbles from three readers, so five runs is a theoretical twenty."*
   Phase 9 raises `CHAT_MAX_BEATS` 6 → 8, which would make it forty — and forty is a notification
   machine by this phase's own standard. **What keeps the defended bound at ~twenty is phase 9's
   rule 11**, which stops capping a proactive run at *"satu beat, kadang dua"* and lands it at
   **two to four beats** — the eight-beat cap is for a run the querent triggered. So the line
   becomes: *a PROACTIVE run is two to four beats, so five runs is a theoretical twenty
   unprompted bubbles in a day, which is the bound v0.7.0 defended and this release keeps.*
   **That makes rule 11's beat range load-bearing for VOLUME and not only for naturalness**, and
   the plan index carries it as an exit criterion on phase 9.
3. **`quietHoursFor` reads the offset off the local phase 7 already added.** Phase 7 lands first
   and puts `const utcOffsetMinutes = thread?.utcOffsetMinutes ?? null;` beside the
   `[thread, openRun]` destructure (plus a `clock` derived from it for its detectors). Use that
   local; do not re-read the thread and do not add a second one.

**Confirmed, no edit needed:**

- **The dependency claim holds.** Phase 1 adds `threadOffsetMinutes` as a *separate* narrow reader
  and **does not narrow `getThread`'s `.select()`**, so `thread?.utcOffsetMinutes` is a
  `number | null` before and after phase 1. This phase's caveat — *"if phase 1 changes
  `getThread`'s projection to a named column list, it must keep `utcOffsetMinutes` in it"* — is
  recorded in phase 1's plan as a binding constraint.
- **The sign convention agrees across phases 1, 2, 7 and 8**: minutes to ADD to UTC, Jakarta
  `+420`, and `inQuietHours`'s `now.getTime() + offsetMinutes * 60_000` is the arithmetic every
  other phase matched itself to.
- **`quiet_hours` needs no new event name.** It is an existing `reason` value on an existing
  declaration, and this phase's only `events.ts` edit is a doc comment. Phase 4 spends the
  taxonomy's last headroom (77 → 78); nothing here touches the ceiling.
- **`DEFAULT_QUIET_FROM_HOUR = 22` and phase 1's `DayPart.late` starting at 22 agree by
  construction**, which is why phase 7's day-part boundaries won over the competing set. Worth
  keeping true if either moves.

---

## Goal

After this phase the room speaks first **more often and never at 3 a.m.** `inQuietHours` —
written, exported, unit-tested and **shipped dead** since `[R17]` for want of a UTC offset — is
wired into `mint.ts` against the offset phase 1 persists, and `[R17]`'s Option A is reversed in
writing rather than silently edited. The cadence is retuned under Miftah's ruling: the silence gap
falls from three hours to one, the daily cap rises from two to five, and the nudge cron gains a
second slot so a dormant querent can be greeted in the **morning** — which is the only way phase
7's *"njir, udah senin aja"* material can ever reach somebody who is not already in the app.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing. No symbol, no column, no env key is removed.

**Renames:** none.

**Creates:**
- `resolveQuietWindow(fromRaw, toRaw, offsetMinutes)` — `src/lib/chat/proactive/eligibility.ts` (PURE)
- `DEFAULT_QUIET_FROM_HOUR` / `DEFAULT_QUIET_TO_HOUR` — `src/lib/chat/proactive/eligibility.ts`
- `quietHoursFor(offsetMinutes)` — `src/lib/chat/proactive/mint.ts`
- `slotOf(request)` (module-private) — `src/app/api/cron/nudge/route.ts`
- Env keys `CHAT_QUIET_FROM_HOUR`, `CHAT_QUIET_TO_HOUR` (both optional, both fall back to the
  default for that variable and **never to `0`**)
- One `vercel.json` cron entry: `/api/cron/nudge?slot=pagi` at `0 1 * * *`

**Signature changes:** none. `checkEligibility(input: EligibilityInput): Eligibility` is unchanged
in shape; `EligibilityInput.quietHours` stops being `null` on every call. `ThreadState` gains **no**
field — the offset reaches the predicate through `EligibilityInput.quietHours`, never through the
thread state.

**Behaviour changes (the ones another phase can trip over):**
- `minGapSeconds()` default `10_800` → `3_600`
- `maxPerDay()` default `2` → `5`
- `runTtlHours()` default `48` → `24`
- `maxUsers()` default `8` → `20`
- Gate 5 (`quiet_hours`) is live for `source === 'tick'` and `source === 'cron'`, and is
  **exempt for `source === 'reading'`** — the same exemption, and the same argument, as gate 6.
- `REFUSAL_ORDER` is **unchanged**, `no_material` still last, so `mint.ts`'s probe-then-detect
  optimisation survives untouched.

**Requires (from earlier phases):**
- **Phase 1** — `chat_threads.utc_offset_minutes` is actually written. The read signature this
  phase quotes already exists on `main`: `getThread(db, userId)` does `.select()` (all columns) and
  returns `ChatThread | null`, so `thread?.utcOffsetMinutes` is a `number | null` **today**
  (`src/lib/db/queries/chat.ts:147-155`, `src/lib/db/schema.ts:1695`). **This phase therefore
  compiles and passes tests with or without phase 1**; what phase 1 buys is that the column stops
  being NULL for everybody, which is the difference between quiet hours working and quiet hours
  being permanently `false`. **If phase 1 changes `getThread`'s projection to a named column list,
  it must keep `utcOffsetMinutes` in it.**
- **Phase 7** — two new material kinds. This phase's gates run **before and after** detection and
  do not name any kind; `MaterialKind` is imported by `eligibility.ts` only as the type of
  `EligibilityInput.materialKind`, and `triggerFor` already routes every kind that is not
  `'unanswered'` to `'idle_nudge'`, so a seventh and eighth kind need **no edit here**.

**Leaves alone (owned by others):**
- `src/lib/chat/proactive/{material,detect,brief,notes.ts,notes.id.ts,notes.en.ts}.ts` — Phase 7
- Every prompt string, in every file under `src/lib/chat/prompt/**` and `src/lib/chat/direct/**` — Phases 2, 5, 9
- `src/lib/chat/direct/caps.ts`, `src/lib/prompt/budget.ts` — Phase 9
- `src/lib/db/queries/chat.ts` and `src/lib/db/queries/chat.integration.test.ts` — Phase 1
  (including the now-stale test title on `:103`, see **Handoffs**)
- `src/components/ChatButton.tsx`, `src/app/chat/ChatRoom.tsx` — Phase 1
- `src/lib/analytics/events.ts`'s **prop shapes** — untouched. This phase edits **one doc comment**
  in that file and nothing else; the taxonomy is not widened, no name is added, `events.test.ts`'s
  ceiling does not move.

## Files

| File | Action | What changes |
|---|---|---|
| `src/lib/chat/proactive/eligibility.ts` | modify | `QuietHours` doc, `resolveQuietWindow` + the two defaults, `inQuietHours` doc, gate 5 gains the `reading` exemption, `EligibilityInput.quietHours` doc |
| `src/lib/chat/proactive/eligibility.test.ts` | modify | the live gate in both directions, the null offset, the `reading` exemption, `resolveQuietWindow`'s refusals |
| `src/lib/chat/proactive/mint.ts` | modify | `quietHoursFor()`, the wiring, `minGapSeconds` 3h→1h, `maxPerDay` 2→5, the `ALWAYS_RECORDED` volume argument |
| `src/lib/chat/proactive/mint.integration.test.ts` | modify | a live quiet-hours refusal end to end, and a reading passing through it |
| `src/app/api/cron/nudge/route.ts` | modify | two slots in the header, the re-examined `localDate` argument, `slotOf`, TTL 48→24, `NUDGE_MAX_USERS` 8→20 |
| `vercel.json` | modify | a second `/api/cron/nudge` entry at `0 1 * * *` |
| `src/lib/analytics/events.ts` | modify | one doc comment: `reason: 'quiet_hours'` is emitted now |
| `.env.example` | modify | the Proactivity block: two new keys, four retuned annotations |
| `docs/DEPLOY-VERCEL.md` | modify | the kill-switch table row, the TTL figure, the two-cron table and the `0 12` paragraph |
| `docs/workstream-notes.md` | modify | **records the `[R17]` reversal** as a new section at the end of F5 |

**No `CLAUDE.md` edit.** `## The group chat (v0.7.0)` states no cadence number, no cap and no quiet
hours, so nothing there becomes false and invariant 11's net-neutral obligation is not triggered.
If the reconciler decides the reversal deserves a line in `CLAUDE.md`, it must compress one out in
the same commit — this phase does not spend that budget.

---

## Implementation Steps

### Step 1: The quiet window becomes a resolvable value, and the gate stops being dead

**File:** `src/lib/chat/proactive/eligibility.ts:79-95` (the `QuietHours` block) and `:141-159`
(`inQuietHours`)

**Change:** Replace the `[R17]`-Option-A doc on `QuietHours` with the reversal, add the pure
resolver and its two defaults, and rewrite `inQuietHours`'s header so it no longer claims to be
dead. **The module stays PURE**: no `server-only`, no `next/*`, no `@/lib/db/**`, no `process.env`,
no `new Date()`. `resolveQuietWindow` takes the raw strings; `mint.ts` is what reads the
environment.

**Code:** replace lines 79-95 with:

```ts
/**
 * §5, Option B's shape — **AND IT IS LIVE SINCE 2026-08-30, WHICH REVERSES `[R17]`.**
 *
 * `[R17]` ruled Option A: no local quiet hours, on the argument that sources 1 and 2
 * only fire while the querent is demonstrably in the app and **source 3's quiet hours
 * ARE its schedule** — one cron, at one carefully chosen hour. That argument was correct
 * and it has expired, for two reasons that landed in the same release:
 *
 *   - **THE SCHEDULE IS NO LONGER ONE HOUR.** `vercel.json` now runs the nudge twice, so
 *     "the schedule is the mechanism" stops being a true sentence about it.
 *   - **THE CADENCE IS LOUDER.** The gap is one hour and the cap is five, so a tick at
 *     03:00 is no longer a once-in-a-blue-moon event bounded by a three-hour silence.
 *
 * The reversal is recorded in `docs/workstream-notes.md` rather than by deleting
 * `[R17]`'s argument, and it cost one line plus a resolver because `[R17]` folded
 * `chat_threads.utc_offset_minutes` into `0014` for exactly this day.
 */
export type QuietHours = {
  /** Inclusive local hour the quiet window opens, 0–23. */
  fromHour: number;
  /** Exclusive local hour it closes, 0–23. May be LESS than `fromHour` (it wraps). */
  toHour: number;
  /** The querent's offset from UTC in minutes, or null when nobody has told us. */
  offsetMinutes: number | null;
};

/** 22:00 local. The hour after which an unprompted message reads as an alarm. */
export const DEFAULT_QUIET_FROM_HOUR = 22;

/**
 * 07:00 local, exclusive. **The known cost is the 05:00 runner** — the querent whose
 * transcript motivated R1 is up for subuh and runs at five — and the escape hatch is one
 * variable rather than a code change: `CHAT_QUIET_TO_HOUR=5`.
 */
export const DEFAULT_QUIET_TO_HOUR = 7;

/**
 * Turn two raw environment strings and an offset into a window. **PURE — the caller
 * reads `process.env`, this does not** (`[F5-2]`).
 *
 * **EVERY BAD VALUE FALLS BACK TO THE DEFAULT FOR ITS OWN VARIABLE, NEVER TO `0`.**
 * `Number('') === 0`, and `.env.example` ships both keys with empty values, so the naive
 * `Number(raw)` a reasonable person writes turns a copied `.env.example` into a quiet
 * window that opens at midnight. `auth/ttl.ts`'s rule with a sharper edge: here the
 * wrong fallback does not merely disable a feature, it invents a policy nobody chose.
 *
 * **SETTING BOTH TO THE SAME HOUR DISABLES QUIET HOURS**, because a non-wrapping window
 * of zero length matches no hour at all. That is the documented off switch and it needs
 * no third variable.
 */
export function resolveQuietWindow(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  offsetMinutes: number | null,
): QuietHours {
  return {
    fromHour: quietHourOr(fromRaw, DEFAULT_QUIET_FROM_HOUR),
    toHour: quietHourOr(toRaw, DEFAULT_QUIET_TO_HOUR),
    offsetMinutes,
  };
}

/** An integer hour in 0–23, or the fallback. Nothing else is accepted. */
function quietHourOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
}
```

and replace lines 141-159 (`inQuietHours`'s doc and body) with:

```ts
/**
 * Is `now` inside the querent's quiet window? **LIVE since 2026-08-30; it shipped dead
 * under `[R17]` and was unit-tested anyway, which is why turning it on was one line.**
 *
 * A null offset means nobody has told us the querent's zone, and the answer is **false**
 * — never mint-blocking on an unknown. The alternative (*"do not mint"*) silences the
 * feature for everybody whose browser has not reported yet, which is a bigger outage
 * than the thing it prevents. **That is the safe direction and it must survive any
 * future edit to this function.**
 *
 * The arithmetic is untouched from the dead version and its tests are untouched with it:
 * a window that wraps midnight (22 → 7) is the normal case, so it is the branch written
 * out rather than the one forgotten.
 */
export function inQuietHours(now: Date, quiet: QuietHours): boolean {
  if (quiet.offsetMinutes === null) return false;
  const localHour = Math.floor(
    (((now.getTime() + quiet.offsetMinutes * 60_000) / 3_600_000) % 24 + 24) % 24,
  );
  return quiet.fromHour <= quiet.toHour
    ? localHour >= quiet.fromHour && localHour < quiet.toHour
    : localHour >= quiet.fromHour || localHour < quiet.toHour;
}
```

**Impact:** `eligibility.ts` gains two exports and stays a pure leaf. Nothing changes behaviourally
until step 2 supplies a non-null window. The existing four `inQuietHours` unit tests keep passing
byte for byte, which is the evidence that the arithmetic was not touched while turning it on.

---

### Step 2: Gate 5 goes live, and it exempts a finished reading exactly as gate 6 does

**File:** `src/lib/chat/proactive/eligibility.ts:135-136` (the field doc) and `:211-214` (the gate)

**Change:** Rewrite the `quietHours` field's doc — it currently says *"null under Option A, which is
every call today"* — and add the `source !== 'reading'` guard to the gate. **The exemption lives in
the predicate and not in `mint.ts`**, because `[F5-2]`'s whole justification is that every branch is
enumerated in `npm test` with a fake clock; an exemption applied by the caller is an exemption no
test at this boundary can see.

**Code:** replace lines 135-136:

```ts
  /**
   * §5. **NON-NULL ON EVERY CALL SINCE 2026-08-30** (`[R17]` reversed). Resolved by the
   * caller from `CHAT_QUIET_{FROM,TO}_HOUR` and `chat_threads.utc_offset_minutes`, which
   * is why the offset arrives here rather than on `ThreadState`: the predicate is asked
   * *"is this hour quiet"*, never *"what timezone is this person in"*.
   */
  quietHours: QuietHours | null;
```

and replace lines 211-214 (gate 5) with:

```ts
  /*
   * 5. §5, and **`[R17]`'s Option A is reversed here.** A room that messages somebody at
   *    3 a.m. loses them, and until this release the only thing standing between a
   *    querent and that message was the nudge cron's single well-chosen hour — which
   *    stopped being the mechanism the moment there were two slots and a one-hour gap.
   *
   *    **IT IS SKIPPED ENTIRELY FOR A FINISHED READING, WHICH IS GATE 6's EXEMPTION AND
   *    GATE 6's ARGUMENT.** Somebody who takes a reading at 02:00 is awake, in the app,
   *    and has just done a discrete thing with a subject; refusing Adrian's reaction to
   *    it because of the hour is the feature not working. A TICK is not that: it is a
   *    page load, and the querent who opened `/history` at 3 a.m. did not ask three
   *    readers to start a conversation.
   *
   *    A null offset means **not quiet** (see `inQuietHours`) — never blocked.
   */
  if (
    input.source !== 'reading' &&
    input.quietHours &&
    inQuietHours(input.now, input.quietHours)
  ) {
    return { ok: false, reason: 'quiet_hours' };
  }
```

**Impact:** `REFUSAL_ORDER` is unchanged and `no_material` is still last, so `mint.ts`'s probe is
still sound. Gate 5 now refuses before gate 6, which means a night-time tick that used to be
recorded as `too_soon` is recorded as `quiet_hours` — see step 4 for why that is left in
`ALWAYS_RECORDED`.

---

### Step 3: `mint.ts` resolves the window, and the cadence is retuned

**File:** `src/lib/chat/proactive/mint.ts:45-56` (the import), `:61-104` (the two knobs), `:176-186`
(`common`)

**Change:** Import the resolver, add `quietHoursFor`, and replace `quietHours: null`. Retune the
two numbers under the ruling, keeping the labelled-guess convention rather than deleting it.

**Code:** replace the `./eligibility` import block at lines 51-56 with:

```ts
import {
  checkEligibility,
  resolveQuietWindow,
  type EligibilityRefusal,
  type ProactiveSource,
  type ProactiveTrigger,
  type QuietHours,
} from './eligibility';
```

replace lines 61-104 (`minGapSeconds` and `maxPerDay`, doc comments included) with:

```ts
/**
 * **ONE HOUR, SINCE 2026-08-30. IT WAS THREE.** How quiet the room must be before a
 * reader speaks unprompted.
 *
 * **THE CHANGE IS A RULING, NOT A MEASUREMENT**, and the old argument is kept rather
 * than deleted because three of its four legs still hold:
 *
 *   - **The lower bound is still what reads as a machine.** *"There is no version of
 *     'Adrian thought of you' that is true twenty minutes after Adrian last spoke."*
 *     True at twenty minutes; not true at an hour, which is an ordinary interval between
 *     two messages from a friend who was doing something else.
 *   - **The upper bound is still the cron.** Unchanged.
 *   - **It is still not the reading path's gate** (`[F5-12]`), which is what stops this
 *     number having to be short.
 *   - **What changed is the third leg.** *"Three hours is the shortest interval over
 *     which 'it has gone quiet' is a true statement about a group chat"* was written
 *     when a proactive run could land at any hour of the night. Quiet hours are live
 *     now, so the interval no longer has to carry the whole burden of not being
 *     obnoxious — and Miftah's ruling is explicit: *much more proactive.*
 *
 * **AND IT IS STILL A GUESS, STILL LABELLED ONE.** `PERSONA_MIN_AGE_SECONDS=3600`'s
 * precedent. The only instrument that can move it is `C-N2f`'s proactive reply rate on
 * `/admin/chat` over weeks. **Measure before moving it.**
 */
export function minGapSeconds(): number {
  const raw = Number(process.env.CHAT_PROACTIVE_MIN_GAP_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : 3_600;
}

/**
 * **FIVE PER QUERENT PER THEIR CALENDAR DAY, SINCE 2026-08-30. IT WAS TWO.**
 *
 * The v0.7.0 argument — *"1 is a newsletter, 3 or more is a notification machine"* — was
 * written **before Miftah ruled**, and it is kept here rather than deleted because its
 * arithmetic is still the thing to watch. **THE ARITHMETIC HAS BEEN REDONE FOR THIS
 * RELEASE AND THE ANSWER IS THE SAME NUMBER:** `CHAT_MAX_BEATS` is 8 now, but that
 * ceiling is for a run the querent triggered — a PROACTIVE run is two to four beats by
 * `system.{id,en}.ts` rule 11, so five runs is a theoretical **twenty** unprompted
 * bubbles in a day, which is exactly the bound v0.7.0 defended.
 *
 * **THAT MAKES RULE 11's BEAT RANGE LOAD-BEARING FOR VOLUME AND NOT ONLY FOR TONE.** If a
 * later session lets a proactive run reach the full eight-beat cap, the worst case here
 * doubles to forty and this number must come down in the same commit.
 *
 * **THREE THINGS MAKE FIVE PAYABLE WHERE THREE WAS NOT:**
 *
 *   - **THE CAP IS ALMOST NEVER THE BINDING GATE — `no_material` IS.** `C-N2e`: a
 *     trigger with no material does not fire, one material per run, and a spent
 *     `material_key` is spent for that querent for ever. Raising the cap does not
 *     produce five runs; it produces *up to* five **on a day the ladder has five
 *     distinct things to say**, which is rare and is exactly the day worth speaking on.
 *     **THIS IS TRUE ONLY BECAUSE `time_of_day` IS CAPPED AT ONE RUN PER LOCAL DAY** in
 *     `detectTimeOfDay` (F7). That kind's key is fresh in every part of every day, so
 *     without the brake it alone would supply every one of the five and `no_material`
 *     would never fire again. **Do not raise this number without checking that brake, and
 *     do not remove that brake without lowering this number.**
 *   - **QUIET HOURS ARE LIVE.** The twenty-bubble worst case is now compressed into the
 *     waking window rather than smeared across the night, which is the difference
 *     between a busy friend and an alarm clock.
 *   - **THE RULING.** *"i want the readers to be much more PROACTIVE ... keep coming
 *     back to the chat group as often as possible."*
 *
 * A number variable **falls back rather than becoming zero** (`auth/ttl.ts`, `meter.ts`):
 * a cap of `0` would silence the feature completely, which is a typo taking half the
 * release down.
 */
export function maxPerDay(): number {
  const raw = Number(process.env.CHAT_PROACTIVE_MAX_PER_DAY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5;
}

/**
 * The querent's quiet window, resolved AT CALL TIME from the environment and the offset
 * their browser last reported.
 *
 * **READ AT CALL TIME, NEVER AT MODULE SCOPE**, for the reason the flags are: a
 * module-scope `const` is inlined by the bundler and freezes the build-time value, and
 * the whole point of these two keys is that an operator can narrow the window from the
 * Vercel dashboard when a querent says the readers woke them up.
 *
 * The parsing, the fallbacks and the disable-by-equal-hours escape hatch are
 * `resolveQuietWindow`'s, in the pure module, where the tests are.
 */
export function quietHoursFor(offsetMinutes: number | null): QuietHours {
  return resolveQuietWindow(
    process.env.CHAT_QUIET_FROM_HOUR,
    process.env.CHAT_QUIET_TO_HOUR,
    offsetMinutes,
  );
}
```

and replace the `common` object at lines 176-186 with:

```ts
    const common = {
      source: input.source,
      thread: state,
      localDate: input.localDate,
      enabled,
      minGapSeconds: minGapSeconds(),
      maxPerDay: maxPerDay(),
      /*
       * §5, and **`[R17]`'s Option A is reversed** (2026-08-30). The offset is read off
       * the thread row rather than off a header, which is what makes this work for the
       * cron — the one source with no client and therefore no `x-jm-local-date` — and it
       * is the reason `[R17]` folded `utc_offset_minutes` into `0014` in the first place.
       *
       * **NULL IS NORMAL AND MEANS NOT QUIET.** A querent whose browser has not reported
       * an offset yet behaves exactly as they did before this line existed.
       *
       * **THE WINDOW IS SUPPLIED FOR EVERY SOURCE, INCLUDING `reading`.** The exemption
       * lives in the predicate (gate 5), not here, so that `npm test` can see it —
       * `[F5-2]`'s rule that a heuristic's every branch is enumerated with a fake clock.
       */
      /* **PHASE 7's LOCAL, REUSED.** One thread row, one offset, one clock per mint. */
      quietHours: quietHoursFor(utcOffsetMinutes),
      now,
    };
```

**Impact:** every mint now evaluates quiet hours **in the probe**, before detection is paid for —
which is the cheap-gate ordering working as designed. A reading-triggered mint is unaffected. A
tick or cron mint for a querent with a known offset inside 22:00–07:00 local refuses with
`quiet_hours`.

---

### Step 4: The skip event keeps firing from a tick, and the volume argument is written down

**File:** `src/lib/chat/proactive/mint.ts:383-390`

**Change:** `'quiet_hours'` is already in `ALWAYS_RECORDED` and the set is **left as it is** — but
the reason has inverted, so the comment must say so. Until this phase it was in the set because it
could never fire; from this phase it is in the set because it is the only measurement of whether
the window is too wide.

**Code:** replace lines 383-390 with:

```ts
/**
 * Refusals worth a row from a per-page-view source. The cron records all of them.
 *
 * **`quiet_hours` STAYS IN THIS SET NOW THAT IT CAN ACTUALLY FIRE, AND THAT IS A
 * DELIBERATE EXCEPTION TO THE ARGUMENT THAT KEEPS `open_run` AND `gap` OUT** (§18).
 * Those two refuse the *overwhelming majority of all ticks, all day*, which is an
 * `events` row per page view of the app against a 180-day TTL on Neon free's 0.5 GB.
 * `quiet_hours` refuses only ticks fired **between 22:00 and 07:00 in the querent's own
 * zone**, and `ChatButton` has no polling loop — one fetch on mount, one on
 * `visibilitychange` — so the volume is bounded by night-time app opens rather than by
 * page views.
 *
 * **AND IT IS THE ONLY INSTRUMENT THE WINDOW HAS.** If the rate is high the window is
 * too wide and `CHAT_QUIET_TO_HOUR` should come down; drop the row and there is nothing
 * to read but a silence that looks identical to `no_material`.
 */
const ALWAYS_RECORDED: ReadonlySet<MintRefusal> = new Set<MintRefusal>([
  'flag_off',
  'quiet_hours',
  'daily_cap',
  'no_material',
  'duplicate',
]);
```

**Impact:** no behaviour change; the set is byte-identical. This step exists so the next person to
read §18's fold-by-dropping argument does not delete the row that measures the gate.

---

### Step 5: The taxonomy's comment stops claiming the event is never emitted

**File:** `src/lib/analytics/events.ts:1146-1148`

**Change:** One doc comment. **No prop shape moves, no name is added, `events.test.ts`'s ceiling
does not move** — `events.ts` is the closed taxonomy with one owner per release and this is not a
declaration change. It is a sentence that is now false, in the file whose whole value is that its
annotations are true.

**Code:** replace lines 1146-1148 (the third paragraph of the `chat.proactive_skipped` doc block —
the sentences beginning *"Both unions closed."* and ending *"It is never emitted today."*) with:

```ts
   * Both unions closed. `reason: 'quiet_hours'` was present-but-dead when this was
   * written, because `[R17]` ruled Option A — no local quiet hours — and folded
   * `utc_offset_minutes` into `0014` so that ruling the other way later was one line.
   * **It was ruled the other way on 2026-08-30 and this reason is now emitted**: from
   * the cron always, and from a tick that fired inside the querent's own 22:00–07:00.
   * **A high rate here means the quiet window is too wide, not that the gate is broken.**
```

**Impact:** none at runtime.

---

### Step 6: The nudge cron gets a morning slot, a shorter backlog and a wider fan-out

**File:** `src/app/api/cron/nudge/route.ts` — the header at `:1-45`, `runTtlHours` at `:78-81`,
`maxUsers` at `:83-87`, the `localDate` comment at `:129-145`, and the response body at `:235`

**Change:** four edits in one file.

**6a. The header's schedule paragraph.** Replace lines 12-23 (the block beginning *"AND `0 12 * * *`
IS 19:00–19:59 WIB"* and ending *"source 3's quiet hours *are* its schedule."*) with:

```
 * ── TWO SLOTS, BOTH UTC, AND `0 12` IS STILL NOT NOON ─────────────────────
 *
 * Vercel cron schedules are **always UTC** (`[R4]`) — the same fact that makes `sweep`'s
 * `17 3 * * *` 10:17 WIB rather than the 3am the roadmap built an argument on.
 *
 *   `0 12 * * *`  ->  19:00–19:59 WIB, evening, after work.  `?slot=malam`
 *   `0  1 * * *`  ->  08:00–08:59 WIB, morning, on the way in.  `?slot=pagi`
 *
 * **THE MORNING SLOT IS R3's, AND IT IS THE ONLY WAY A MONDAY-MORNING GREETING CAN REACH
 * SOMEBODY WHO IS NOT ALREADY IN THE APP.** The brief's own worked example is *"njir,
 * udah senin aja. mager ga lu ngantor?"*, which is a thing you say before noon; with one
 * evening slot the cron could never say it to a dormant querent, and the tick only fires
 * for somebody who has already opened the app.
 *
 * **AND IT IS ONLY PAYABLE BECAUSE QUIET HOURS ARE LIVE** (`[R17]` reversed, 2026-08-30).
 * 01:00 UTC is 08:00 in Jakarta and 02:00 in Berlin, so a second fixed hour would have
 * been a message in the middle of the night for anyone outside the zone the schedule was
 * chosen for. `eligibility.ts`'s gate 5 is what makes the hour safe for every querent
 * whose browser has reported an offset — **and it is exactly the reason a schedule stops
 * being the quiet-hours mechanism the moment there is more than one of them.**
 *
 * **THE `slot` QUERY PARAMETER IS A LOG LABEL AND NOTHING ELSE.** No branch reads it, so
 * the two invocations are byte-identical in behaviour; it exists so `[cron] nudge` can be
 * told apart in the log, and it makes the two entries distinct paths. If the platform
 * ever strips or refuses it, both entries fall back to a `null` slot and the only thing
 * lost is the label.
 *
 * A run minted here has nobody present to warm it, which is what phase 3 below is for.
```

**6b. The TTL.** Replace lines 68-81 with:

```ts
/**
 * **THE BACKLOG BOUND** (`[F5-5]`). Under quota pressure the app accumulates pending runs
 * rather than losing them (`C-D6` consequence 3) — the single best argument for the run
 * engine — but a backlog delivered late is worse than never having spoken.
 *
 * **TWENTY-FOUR HOURS SINCE 2026-08-30. IT WAS FORTY-EIGHT**, and the reason it came down
 * is that the material got day-shaped. A `reading` follow-up is still roughly true two
 * days later; *"udah senin aja"* delivered on Wednesday is not, and a time-anchored
 * greeting arriving a day late is the exact failure R1 exists to prevent, arriving
 * through the back door. One day is also the interval over which the cron itself is
 * guaranteed to have run — twice, now — so nothing is aged out that was never offered a
 * second chance to be warmed.
 *
 * The cost is real and is recorded: a quota outage longer than a day now loses the runs
 * it sheds instead of holding them. **That is the right trade for a run nobody was
 * waiting for and the wrong one for a reading**, which is why it applies here and to
 * nothing else.
 *
 * Falls back rather than becoming zero, per `auth/ttl.ts`: a TTL of `0` would abandon
 * every run the instant it was minted, and the symptom is a chat that silently never
 * answers anybody.
 */
function runTtlHours(): number {
  const raw = Number(process.env.PROACTIVE_RUN_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
}
```

**6c. The fan-out.** Replace lines 83-87 with:

```ts
/**
 * How many querents one invocation will **mint** for. Twenty since 2026-08-30; it was
 * eight.
 *
 * **THE OLD NUMBER CONFLATED TWO DIFFERENT LIMITS AND THE RE-DERIVATION IS THE POINT.**
 * Eight came from *"~6s per model call against a 45s wall clock"* — but that budget bounds
 * **phase 3, the warm**, and it already enforces itself: the loop checks
 * `WALL_CLOCK_BUDGET_MS` before every `advance` and stops advancing while it keeps
 * minting. A mint is three indexed reads and one transaction, ~100ms, so twenty of them
 * is ~2s of the invocation and leaves the rest of the budget for warms exactly as before.
 *
 * **THE CONSEQUENCE, STATED:** roughly seven of the twenty get a bubble tonight and the
 * rest stay `pending` — which the route's phase-3 comment already calls the correct
 * outcome, because *"a run that was minted and not warmed is not lost"* and the querent's
 * next tick warms it. Minting for more people than can be warmed is strictly better than
 * minting for fewer, since an unminted run is gone until the material is found again.
 *
 * At a scale where twenty is too few the fix is **still not a bigger number** — it is
 * that the cron mints only and a queue drains it, a v0.8.0 mechanism named here so nobody
 * invents it in an emergency (`[F5-Q5]`).
 */
function maxUsers(): number {
  const raw = Number(process.env.NUDGE_MAX_USERS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20;
}

/** The two scheduled slots. A LOG LABEL, closed, and no branch reads it. */
type NudgeSlot = 'pagi' | 'malam';

/**
 * **A CLOSED SET, NEVER THE RAW STRING.** This value goes into `console.log`, and the
 * route is reachable by anybody holding `CRON_SECRET`; free text from a query parameter
 * in a log line is the same class of thing `sanitizeProps` refuses in `events.props`.
 */
function slotOf(request: Request): NudgeSlot | null {
  const raw = new URL(request.url).searchParams.get('slot');
  return raw === 'pagi' || raw === 'malam' ? raw : null;
}
```

**6d. The `localDate` argument, re-examined as the phase scope requires.** Replace lines 129-145
with:

```ts
  /*
   * **THE QUERENT'S CALENDAR DAY IS THE ONE THING THE CRON CANNOT KNOW** (§4.8). Sources
   * 1 and 2 have a client and therefore a `LOCAL_DATE_HEADER`; this has neither.
   *
   * **THE CONSEQUENCE, STATED SO NOBODY "FIXES" IT INTO THE OTHER ONE:** for a querent in
   * UTC+7, between 00:00 and 07:00 WIB the cron's UTC date is still *yesterday*, so if
   * `proactive_count_date` already reads today-in-WIB the counter resets and grants **one
   * extra** run. **The failure is a bounded overcount of one, never an undercount that
   * silences the feature** — which is the safe direction, and one both schedules avoid:
   * `0 12` UTC is 19:00 WIB and `0 1` UTC is 08:00 WIB, the same calendar day in both
   * zones.
   *
   * **RE-EXAMINED 2026-08-30, WHEN `chat_threads.utc_offset_minutes` STOPPED BEING NULL,
   * AND THE ANSWER IS STILL NO.** The offset would let this route compute each
   * candidate's true day — but `localDate` is also `nudgeCandidates`' own selection
   * predicate (`proactive_count_date is distinct from :localDate or
   * proactive_count_today = 0`), so deriving a different day inside `mintProactiveRun`
   * would let the mint stamp a day the selector did not select on. **That trades a
   * bounded overcount of one for an undercount that silences the feature**, which is the
   * wrong direction, and the whole correction is to a case the schedules already avoid.
   * The honest version is to derive the day in `nudgeCandidates` and the mint together,
   * in one change, once offset coverage is high enough to be worth it. Declined again,
   * and recorded again.
   *
   * **QUIET HOURS DO NOT HAVE THIS PROBLEM AND ARE NOT AFFECTED BY IT.** They ask what
   * *hour* it is, not what day, and `mintProactiveRun` reads the offset off the thread
   * row it is already loading.
   */
  const localDate = utcDateString(now);
```

**6e. The log line.** Replace line 235 with:

```ts
  const body = { ...result, slot, generating, localDate, failures, ms: Date.now() - startedAt };
```

and add, immediately after `const denied = await authorize(request); if (denied) return denied;`
(i.e. after line 123):

```ts
  /* A label for the log, resolved once. No branch below reads it. */
  const slot = slotOf(request);
```

**Impact:** two invocations a day instead of one, twenty mints instead of eight, a 24-hour backlog
instead of 48, and a log line that says which slot produced which counts.

---

### Step 7: `vercel.json` schedules the morning slot

**File:** `vercel.json:4-13`

**Change:** one entry added; the existing evening entry keeps its schedule and gains only the label.

**Code:** the whole file:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["sin1"],
  "crons": [
    {
      "path": "/api/cron/sweep",
      "schedule": "17 3 * * *"
    },
    {
      "path": "/api/cron/nudge?slot=pagi",
      "schedule": "0 1 * * *"
    },
    {
      "path": "/api/cron/nudge?slot=malam",
      "schedule": "0 12 * * *"
    }
  ]
}
```

**Impact:** three cron jobs against a verified Hobby allowance of 100 per project (2026-08-07,
`vercel.com/docs/cron-jobs/usage-and-pricing` plus the 2026-01-20 changelog entry), each still at
the once-per-day minimum interval with ±59 minutes of precision.

**The one unverified platform fact, named:** whether Vercel accepts a query string in a cron `path`,
and whether it accepts two entries whose path differs only by one. **The failure mode is loud, not
silent** — `vercel.json` is validated at deploy, so a rejection is a failed deploy with a message,
never a cron that quietly does not exist. **If it is rejected, the fallback is two entries with the
bare path `/api/cron/nudge` and `slotOf` returning `null`**, which costs the log label and nothing
else; nothing in step 6 branches on the slot. Verify in the Vercel dashboard's Cron Jobs list after
the first deploy that three jobs are listed.

---

### Step 8: `.env.example` — two new keys and four retuned annotations

**File:** `.env.example:1120-1162`

**Change:** replace the whole `── Proactivity (F5) ──` block. `.env.example` is the reference and
every variable carries its shape, its default and its full annotation.

**Code:** replace lines 1120-1162 with:

```
# ── Proactivity (F5; retuned 2026-08-30 for R3) ─────────────────────────────
# CHAT_PROACTIVE_ENABLED is in flags.ts and is above. These SEVEN shape WHEN an
# unprompted run is allowed to exist. All seven are read AT CALL TIME. The five
# numeric ones fall back rather than becoming zero -- a gap of 0 makes three
# readers message you every time you load a page, and a cap of 0 deletes the
# feature; the two hour variables fall back to THEIR OWN DEFAULT rather than to
# 0, because `Number('') === 0` and this file ships them empty.
#
# THE 2026-08-30 RETUNE IS A RULING, NOT A MEASUREMENT. Miftah: "i want the
# readers to be much more PROACTIVE ... keep coming back to the chat group as
# often as possible." The gap came down 3h -> 1h, the cap went up 2 -> 5, the
# backlog TTL came down 48h -> 24h and the cron fan-out went 8 -> 20. WHAT MAKES
# ALL OF THAT PAYABLE IS THE TWO CHAT_QUIET_* KEYS BELOW, which are live for the
# first time in this release: before them the only thing standing between a
# querent and a 3 a.m. message was the nudge cron's single well-chosen hour.

# F5. How quiet the room must be before a reader speaks unprompted. ONE HOUR
# since 2026-08-30; it was three. Still a GUESS with an argument --
# PERSONA_MIN_AGE_SECONDS' precedent. Twenty minutes reads as a notification
# engine and that bound has not moved; twenty-four hours would make the daily
# cron the only source that ever fires, which the roadmap calls wrong.
# It does NOT gate a run triggered by a finished reading: that is a thing the
# querent just did, at a moment they are demonstrably present, and making Adrian
# wait to react to it is the feature not working.
# The only instrument that can move it is the proactive reply rate on
# /admin/chat over WEEKS. Measure before moving it.
CHAT_PROACTIVE_MIN_GAP_SECONDS=

# F5. Unprompted runs per querent per THEIR calendar day -- proactive_count_date
# is a 'YYYY-MM-DD' string, never a Date, for local_date's reason. FIVE since
# 2026-08-30; it was two. It counts runs MINTED and it does not refund.
# THE CAP IS ALMOST NEVER THE BINDING GATE -- no_material is. One material per
# run, and a spent material_key is spent for that querent for ever, so five
# means "up to five on a day the ladder has five distinct things to say". That
# holds ONLY because the time_of_day material is capped at one run per local day
# in detectTimeOfDay: its key is fresh in every part of every day and without
# that brake it alone would supply all five.
# The old ceiling's arithmetic still applies and is still the thing to watch: a
# PROACTIVE run is two to four beats (rule 11) rather than the eight-beat cap a
# querent-triggered run may reach, so five runs is a theoretical twenty
# unprompted messages in a day -- the bound v0.7.0 defended.
CHAT_PROACTIVE_MAX_PER_DAY=

# F5, and the reversal of [R17]. The querent's LOCAL quiet window: inclusive
# start hour, exclusive end hour, both 0-23. Defaults 22 and 7. A window that
# wraps midnight is the normal case.
#
# THE OFFSET COMES FROM chat_threads.utc_offset_minutes, which the browser
# reports. A NULL OFFSET MEANS NOT QUIET, NEVER BLOCKED -- a querent whose
# browser has not reported yet behaves exactly as they did before this shipped.
#
# IT DOES NOT GATE A RUN TRIGGERED BY A FINISHED READING, for the same reason
# the gap does not: somebody who takes a reading at 02:00 is awake and in the
# app. It DOES gate a tick, which is a page load rather than a request for a
# conversation.
#
# THE KNOWN COST IS THE 05:00 RUNNER, and the escape hatch is this variable
# rather than a code change: CHAT_QUIET_TO_HOUR=5.
#
# TO DISABLE QUIET HOURS ENTIRELY, SET BOTH TO THE SAME NUMBER. A non-wrapping
# window of zero length matches no hour, so there is no third variable for it.
# An empty value, a non-integer or anything outside 0-23 falls back to the
# DEFAULT for that key -- never to 0.
CHAT_QUIET_FROM_HOUR=
CHAT_QUIET_TO_HOUR=

# F5. After this long, an unanswered reader question is not "still unanswered",
# it is over. Following up on something asked last Tuesday reads as a cron job
# that found a row. Default 48.
UNANSWERED_MAX_AGE_HOURS=

# F5. A run left pending or running for this long is abandoned by the nudge
# cron, BEFORE it mints anything. TWENTY-FOUR since 2026-08-30; it was 48, and
# it came down because the material got day-shaped: a "udah senin aja" greeting
# delivered on Wednesday is worse than silence. The cost is recorded rather than
# hidden -- a quota outage longer than a day now loses the runs it sheds instead
# of holding them, which is the right trade for a run nobody was waiting for.
# Default 24.
PROACTIVE_RUN_TTL_HOURS=

# F5. How many querents /api/cron/nudge will MINT for in one 60s invocation.
# Twenty since 2026-08-30; it was 8, and the old number conflated two limits.
# The 45s wall-clock budget bounds the WARM and enforces itself -- the loop stops
# advancing while it keeps minting. A mint is ~100ms, so twenty is ~2s and the
# rest of the budget still buys the same ~7 warms; the other thirteen runs stay
# `pending` and the querent's next tick delivers them. At a scale where this is
# too few the fix is NOT a bigger number -- it is that the cron mints only and a
# queue drains it, a v0.8.0 mechanism named here so nobody invents it in an
# emergency. Default 20.
NUDGE_MAX_USERS=
```

**Impact:** documentation only. Every key stays optional and unset in production, so the defaults
in code govern — which is the same arrangement as today.

---

### Step 9: `docs/DEPLOY-VERCEL.md` — the operator's three stale figures

**File:** `docs/DEPLOY-VERCEL.md:568`, `:648`, `:652-676`

**Change:** three edits.

**9a.** Replace line 568 (the kill-switch table's row 0) with:

```
| 0 | `CHAT_PROACTIVE_ENABLED=0` | **2–5 calls per unprompted run, up to five times per querent per day, with nobody waiting** | Nothing they asked for. A posted message still gets answered; the readers just stop speaking first. |
```

**9b.** In the sentence at line 648, change `PROACTIVE_RUN_TTL_HOURS` `(48)` to `(24)`.

**9c.** Replace the section from line 652 (`### The two cron jobs, and the second one is the nudge`)
through line 676 (the end of the `0 12` paragraph, ending *"this one's schedule *is* the
mechanism."*) with:

```
### The three cron jobs, and two of them are the nudge

`vercel.json` schedules three, and **Vercel cron schedules are always UTC**:

| Path | Schedule | WIB | What |
|---|---|---|---|
| `/api/cron/sweep` | `17 3 * * *` | 10:17 | The five retention deletes, plus the size probe and the ceiling report |
| `/api/cron/nudge?slot=pagi` | `0 1 * * *` | 08:00–08:59 | Ages out stale chat runs, then mints and warms up to `NUDGE_MAX_USERS` unprompted runs |
| `/api/cron/nudge?slot=malam` | `0 12 * * *` | 19:00–19:59 | The same job, in the evening |

**All three authenticate with the same `CRON_SECRET` and all three 503 without it.**
One secret, deliberately: a second is a second thing to rotate and a second thing to
have unset.

**Hobby allows 100 cron jobs per project**, verified 2026-08-07 against
`vercel.com/docs/cron-jobs/usage-and-pricing` and the changelog entry *"Cron jobs
now support 100 per project on every plan"* (2026-01-20) — minimum interval once
per day, scheduling precision ±59 minutes. **That once-per-day minimum is why a
louder cadence needed a second entry rather than a shorter schedule.**

**`0 12` IS STILL NOT NOON**, and `0 1` is not one in the morning: the first is
19:00 in Jakarta and the second is 08:00, which are the two hours a person
actually messages you.

**THE MORNING SLOT IS NEW IN THIS RELEASE AND IT IS ONLY SAFE BECAUSE QUIET HOURS
ARE LIVE.** 01:00 UTC is 08:00 in Jakarta and 02:00 in Berlin. Until 2026-08-30
there was no quiet-hours predicate — by ruling, because the other two proactive
sources only fire while the querent is demonstrably in the app and this one's
single schedule *was* the mechanism. **A schedule stops being the mechanism the
moment there is more than one of them**, so `CHAT_QUIET_FROM_HOUR` /
`CHAT_QUIET_TO_HOUR` (defaults 22 and 7, in the querent's own zone, read off
`chat_threads.utc_offset_minutes`) now refuse a nudge that would land at night.
**A querent whose browser has never reported an offset is treated as awake** —
never blocked on an unknown — so the morning slot can still reach somebody at a
bad hour if we have never seen their clock. The instrument is
`chat.proactive_skipped` with `reason: 'quiet_hours'`; if that rate is high the
window is too wide, and the fix is `CHAT_QUIET_TO_HOUR`, one variable.

**The `slot` query parameter is a log label and nothing else.** No branch reads
it. If a deploy is ever rejected for it, drop it from both entries: the two jobs
become identical apart from their schedules and the only thing lost is being able
to tell them apart in the log.
```

**Impact:** documentation only.

---

### Step 10: `docs/workstream-notes.md` records the `[R17]` reversal

**File:** `docs/workstream-notes.md` — insert between line 11351 (the blank line after F5's closing
`---`) and line 11352 (`## The \`BAHAN\` rule — an F2 amendment …`)

**Change:** a new top-level section. **The reversal is recorded rather than the old argument being
edited** (plan invariant 11), and `[R17]`'s reasoning is quoted so a future session can see it was
right when it was made.

**Code:** insert:

```markdown
## `[R17]` reversed — real quiet hours, and a louder cadence (2026-08-30, R3 phase 8)

**`inQuietHours` shipped DEAD in v0.7.0 and is live from this release.** `[R17]` Q2 ruled Option A
— *no local quiet hours* — and the argument was correct when it was made, so it is quoted here
rather than deleted:

> Sources 1 and 2 only fire when the querent is demonstrably in the app, and source 3 is a UTC cron
> whose schedule (`0 12 * * *` = 19:00 WIB) **is** the mechanism.

`[R17]` also folded `chat_threads.utc_offset_minutes` into migration `0014` *"so that ruling the
other way later is one line rather than a migration"*. **It was one line.** That is the part worth
learning from: a column nobody reads costs nothing, and the ruling it anticipated arrived one
release later.

### What made the argument expire

Two things, in the same release, and **neither of them is "we changed our minds"**:

1. **The schedule stopped being one hour.** `vercel.json` now runs `/api/cron/nudge` twice — 08:00
   and 19:00 WIB — because R3's own worked example (*"njir, udah senin aja. mager ga lu ngantor?"*)
   is a thing you say before noon, and with a single evening slot the cron could never say it to a
   querent who is not already in the app. **A schedule stops being the quiet-hours mechanism the
   moment there is more than one of them**, and 01:00 UTC is 02:00 in Berlin.
2. **The cadence got loud enough that "they are in the app" stopped covering it.** The silence gap
   fell from three hours to one and the daily cap rose from two to five, under Miftah's ruling
   (*"i want the readers to be much more PROACTIVE"*). At three hours and two runs a day, a 3 a.m.
   tick was a rarity the gap itself throttled; at one hour and five it is not.

### What the gate does, exactly

- **It exempts `source === 'reading'`, which is gate 6's exemption and gate 6's argument** — a
  querent who takes a reading at 02:00 is awake, in the app, and has just done a discrete thing
  with a subject. **A tick is not that**: it is a page load, and somebody who opened `/history` at
  3 a.m. did not ask three readers to start a conversation. The exemption lives in the **predicate**
  and not in `mint.ts`, because `[F5-2]`'s justification is that every branch is enumerated in
  `npm test` with a fake clock, and an exemption applied by the caller is one no test at that
  boundary can see.
- **A null offset means NOT QUIET, never blocked.** The alternative silences the feature for
  everybody whose browser has not reported yet, which is a bigger outage than the thing it
  prevents. It is also what makes this release a no-op for every existing row until the offset
  lands.
- **`REFUSAL_ORDER` did not move.** `no_material` is still last, so `mint.ts`'s
  probe-with-`hasMaterial:true` optimisation — pay for detection only when nothing else refuses —
  is untouched.
- **`resolveQuietWindow` falls back to the DEFAULT for each key, never to `0`.** `Number('') === 0`
  and `.env.example` ships both keys empty, so the naive `Number(raw)` a reasonable person writes
  turns a copied `.env.example` into a quiet window opening at midnight. `auth/ttl.ts`'s rule with
  a sharper edge: the wrong fallback here does not disable a feature, it invents a policy nobody
  chose.
- **Both hours equal disables it.** A non-wrapping window of zero length matches no hour, so there
  is no third variable and no `CHAT_QUIET_ENABLED`.

### The numbers that moved, and the one instrument that can move them back

| Knob | Was | Is | Why it was payable |
|---|---|---|---|
| `CHAT_PROACTIVE_MIN_GAP_SECONDS` | 10800 (3h) | 3600 (1h) | The *"twenty minutes reads as a machine"* lower bound has not moved; three hours was carrying the whole burden of not being obnoxious, and quiet hours carry half of it now |
| `CHAT_PROACTIVE_MAX_PER_DAY` | 2 | 5 | **The cap is almost never the binding gate — `no_material` is.** One material per run and a spent `material_key` is spent for ever, so five means *up to* five on a day the ladder has five distinct things to say. **RECONCILED: that premise is only true because phase 7's `time_of_day` is capped at one run per local day** (`usedTimeOfDayToday`) — without it `tod:` has unlimited supply and the sentence above is false, which is conflict #14. Read `maxPerDay`'s doc comment before moving this number |
| `PROACTIVE_RUN_TTL_HOURS` | 48 | 24 | The material got day-shaped; a time-anchored greeting delivered a day late is R1's bug arriving through the back door |
| `NUDGE_MAX_USERS` | 8 | 20 | **The old number conflated two limits.** 45s of wall clock bounds the *warm* and enforces itself; a mint is ~100ms, so twenty mints cost ~2s and the same ~7 warms still happen. The rest stay `pending` and the next tick delivers them |

**Every one of these is still a guess with an argument, and the instrument is still `C-N2f`'s
proactive reply rate on `/admin/chat` over weeks.** Nothing here was measured; a ruling was
applied. `[F5-Q1]` and `[F5-Q2]`'s *"labelled a guess"* convention is kept rather than quietly
upgraded to a finding.

### The one thing that was re-examined and deliberately NOT changed

**The cron still passes `utcDateString(now)` as every candidate's `localDate`**, though the offset
would now let it compute each querent's true day. `nudgeCandidates` selects on that same
`localDate` (`proactive_count_date is distinct from :localDate or proactive_count_today = 0`), so
deriving a different day inside `mintProactiveRun` would let the mint stamp a day the selector did
not select on: **it would trade a bounded overcount of one for an undercount that silences the
feature**, which is the wrong direction. The honest version moves the selector and the mint in one
change. Declined again, recorded again — `route.ts`'s comment carries the same paragraph.

### And `chat.proactive_skipped`'s `quiet_hours` row is kept on purpose

§18's fold-by-dropping argument keeps `open_run` and `gap` out of `ALWAYS_RECORDED` because they
refuse the majority of *all* ticks, all day. `quiet_hours` refuses only ticks fired between 22:00
and 07:00 in the querent's own zone, and `ChatButton` has no polling loop — one fetch on mount, one
on `visibilitychange` — so the volume is bounded by night-time app opens. **It is also the only
instrument the window has**: drop the row and a window that is too wide looks exactly like a
querent with nothing to talk about.

---
```

**Impact:** documentation only.

---

### Step 11: The tests

**File:** `src/lib/chat/proactive/eligibility.test.ts` — append two describe blocks and amend one

**Change:** the existing `describe('inQuietHours (§5, dead under [R17] and tested anyway)')` block
keeps every assertion and loses only its title's *"dead under"*. Add the live gate in both
directions, the source exemption, and `resolveQuietWindow`'s refusals.

**Code:** replace the describe title on line 237 with:

```ts
describe('inQuietHours (§5, LIVE since 2026-08-30 — [R17] reversed)', () => {
```

and append at the end of the file:

```ts
describe('the quiet-hours gate ([R17] reversed, 2026-08-30)', () => {
  /** 22:00 -> 07:00 in Jakarta. 18:30Z is 01:30 the next morning there. */
  const WIB = 7 * 60;
  const NIGHT = new Date('2026-08-07T18:30:00.000Z');
  const window = { fromHour: 22, toHour: 7, offsetMinutes: WIB };

  it('refuses a tick and the cron at 01:30 local', () => {
    expect(refusal({ source: 'tick', quietHours: window, now: NIGHT })).toBe('quiet_hours');
    /* The cron needs an opened room to get past gate 4. The fixture has one. */
    expect(refusal({ source: 'cron', quietHours: window, now: NIGHT })).toBe('quiet_hours');
  });

  it('exempts a finished reading, which is gate 6’s exemption and gate 6’s argument', () => {
    /*
     * Somebody who takes a reading at 01:30 is awake, in the app, and has just done a
     * discrete thing with a subject. **A tick is a page load and is not that.**
     */
    expect(refusal({ source: 'reading', quietHours: window, now: NIGHT })).toBeNull();
  });

  it('lets everything through in the daytime', () => {
    /* 05:00Z is 12:00 WIB. Nothing about that hour is quiet. */
    const noon = new Date('2026-08-07T05:00:00.000Z');
    for (const source of ['tick', 'cron', 'reading'] as const) {
      expect(refusal({ source, quietHours: window, now: noon })).toBeNull();
    }
  });

  it('treats an unknown offset as AWAKE, never as blocked', () => {
    /*
     * **The safe direction, and it must survive every future edit.** Mint-blocking on an
     * unknown silences the feature for everybody whose browser has not reported yet.
     */
    const unknown = { fromHour: 22, toHour: 7, offsetMinutes: null };
    expect(refusal({ source: 'tick', quietHours: unknown, now: NIGHT })).toBeNull();
  });

  it('refuses BEFORE the gap, and leaves REFUSAL_ORDER alone', () => {
    /*
     * A room that is both inside the gap and inside the window answers `quiet_hours`,
     * because gate 5 is above gate 6 — and `no_material` is still last, which is the
     * only ordering property `mint.ts`'s probe depends on.
     */
    const busy = thread({ lastReaderMessageAt: new Date(NIGHT.getTime() - 60_000) });
    expect(refusal({ source: 'tick', thread: busy, quietHours: window, now: NIGHT })).toBe(
      'quiet_hours',
    );
    expect(REFUSAL_ORDER[REFUSAL_ORDER.length - 1]).toBe('no_material');
  });
});

describe('resolveQuietWindow (PURE, and every bad value falls back to its OWN default)', () => {
  it('defaults to 22 -> 7 when nothing is set', () => {
    expect(resolveQuietWindow(undefined, undefined, 420)).toEqual({
      fromHour: DEFAULT_QUIET_FROM_HOUR,
      toHour: DEFAULT_QUIET_TO_HOUR,
      offsetMinutes: 420,
    });
  });

  it('treats an EMPTY STRING as unset, because `Number("")` is 0', () => {
    /*
     * `.env.example` ships both keys empty, so the naive `Number(raw)` turns a copied
     * example file into a quiet window opening at midnight. **This is the assertion that
     * stops somebody "simplifying" the guard away.**
     */
    expect(resolveQuietWindow('', '  ', null)).toEqual({
      fromHour: 22,
      toHour: 7,
      offsetMinutes: null,
    });
  });

  it('refuses a non-integer, a negative and anything past 23', () => {
    for (const bad of ['x', '7.5', '-1', '24', '100', 'NaN']) {
      expect(resolveQuietWindow(bad, bad, 0)).toEqual({ fromHour: 22, toHour: 7, offsetMinutes: 0 });
    }
  });

  it('accepts the edges, and equal hours are the documented OFF switch', () => {
    expect(resolveQuietWindow('0', '23', 0)).toMatchObject({ fromHour: 0, toHour: 23 });
    /* A non-wrapping window of zero length matches no hour at all. */
    const off = resolveQuietWindow('0', '0', 420);
    expect(inQuietHours(new Date('2026-08-07T18:30:00.000Z'), off)).toBe(false);
    expect(inQuietHours(new Date('2026-08-07T05:00:00.000Z'), off)).toBe(false);
  });
});
```

and widen the import at lines 14-20 to:

```ts
import {
  checkEligibility,
  DEFAULT_QUIET_FROM_HOUR,
  DEFAULT_QUIET_TO_HOUR,
  inQuietHours,
  REFUSAL_ORDER,
  resolveQuietWindow,
  type EligibilityInput,
  type ThreadState,
} from './eligibility';
```

**File:** `src/lib/chat/proactive/mint.integration.test.ts` — one new case and two new `beforeEach`
deletes

**Change:** prove the wiring end to end: the offset is read off the thread row, the tick refuses,
nothing is written, and the reading path still mints at the same instant.

**Code:** replace the `beforeEach` at lines 35-39 with:

```ts
beforeEach(() => {
  delete process.env.CHAT_PROACTIVE_ENABLED;
  delete process.env.CHAT_ENABLED;
  delete process.env.CHAT_PROACTIVE_MAX_PER_DAY;
  /* The defaults (22 -> 7) are what this file asserts, so a local .env must not win. */
  delete process.env.CHAT_QUIET_FROM_HOUR;
  delete process.env.CHAT_QUIET_TO_HOUR;
});
```

and append inside `describe('mintProactiveRun', ...)`:

```ts
  it('refuses a tick inside the querent’s own night and lets a reading through ([R17] reversed)', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx);
      const readingId = await makeReading(tx, userId);
      /*
       * **THE OFFSET IS READ OFF THE THREAD ROW, WHICH IS WHY THIS WORKS FOR THE CRON.**
       * `[R17]` folded `utc_offset_minutes` into `0014` for exactly this call.
       */
      await upsertThread(tx, userId, { utcOffsetMinutes: 420 });

      /* 18:30Z is 01:30 the next morning in Jakarta — inside the default 22 -> 7. */
      const night = new Date('2026-08-07T18:30:00.000Z');
      const tick = await mintProactiveRun({
        userId,
        source: 'tick',
        localDate: TODAY,
        now: night,
        handle: tx,
      });
      expect(tick).toEqual({ minted: false, reason: 'quiet_hours' });

      /* **NOTHING IS WRITTEN.** The refusal happens in the probe, before detection. */
      expect(await runsOf(tx, userId)).toHaveLength(0);
      expect((await threadOf(tx, userId))?.proactiveCountToday).toBe(0);

      /*
       * **AND THE READING PATH IS EXEMPT.** No `now` is passed, because the exemption is
       * what is being asserted and not the hour: a querent who just finished a reading is
       * awake whatever the clock says.
       */
      const reading = await mintProactiveRun({
        userId,
        source: 'reading',
        localDate: TODAY,
        readingId,
        handle: tx,
      });
      expect(reading).toMatchObject({ minted: true, trigger: 'reading_completed' });
    }));

  it('treats an unreported offset as awake, so nothing regresses before the header lands', () =>
    withRollback(async (tx) => {
      const userId = await makeUser(tx);
      const readingId = await makeReading(tx, userId);
      /* No `upsertThread` call: `utc_offset_minutes` is NULL, which is every row today. */
      const night = new Date('2026-08-07T18:30:00.000Z');
      const result = await mintProactiveRun({
        userId,
        source: 'reading',
        localDate: TODAY,
        readingId,
        now: night,
        handle: tx,
      });
      expect(result).toMatchObject({ minted: true });
    }));
```

**Impact:** the two cases that fail by *accepting* — a night-time tick that mints, and a null offset
that blocks — are both covered.

---

## Verification

**Build:** `export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH && npm run build`
(**not** `npm run typecheck` alone — the TypeScript trap means a green typecheck is not evidence.
Retry once on a `@vercel/turbopack-next/internal/font/google/font` resolve error: that is the AAAA
trap, not a code failure.)

**Tests:**
```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm test -- src/lib/chat/proactive        # unit: eligibility, material
npm run db:up
npm run test:integration -- src/lib/chat/proactive/mint.integration.test.ts
npm test                                   # the whole unit suite, separately
npm run test:integration                   # the whole integration suite, separately
```
**Never `npm run test:all`** — it fails 12–22 of V9's limiter tests on a harness race and its red
means nothing.

**Manual check:**
1. `grep -n "quietHours: null" src/lib/chat/proactive/mint.ts` returns **nothing**. That single
   line is the whole of `[R17]`'s Option A and its absence is what "the gate is live" means.
2. `grep -n "server-only\|next/\|process\.env\|new Date()" src/lib/chat/proactive/eligibility.ts`
   returns **nothing**. `[F5-2]`'s purity is a source-level property and this is how it is checked.
3. `npm run smoke -- --chat --proactive` still produces runs and the blind read still works. **The
   smoke script does not exercise this phase** — it does not go through `mintProactiveRun` — so
   this is a no-regression check, not the gate. Phase 9 owns the gate.
4. **After deploy:** the Vercel dashboard's Cron Jobs list shows **three** jobs. If the deploy is
   rejected on the `?slot=` path, apply step 7's recorded fallback (bare paths, `slotOf` returns
   `null`) — nothing branches on it.
5. **After deploy, the one production instrument:**
   ```sql
   select props->>'reason' as reason, props->>'source' as source, count(*)
     from events
    where name = 'chat.proactive_skipped'
      and occurred_at > now() - interval '7 days'
    group by 1, 2 order by 3 desc;
   ```
   A high `quiet_hours` count means the window is too wide; the fix is `CHAT_QUIET_TO_HOUR`, one
   variable and a redeploy.

**Exit criteria:**
- `eligibility.test.ts` covers the live gate in **both** directions, covers a null offset meaning
  *not quiet* rather than *blocked*, and covers the `reading` exemption.
- `REFUSAL_ORDER` still asserts `no_material` last — `mint.ts`'s probe-then-detect optimisation is
  untouched, and both existing assertions of the full order pass unmodified.
- The daily cap's enforcement is still the `bumpProactiveCount` UPSERT's
  `where proactive_count_date is distinct from :localDate or proactive_count_today < :maxPerDay`
  plus `returning`. **`bumpProactiveCount` is not edited in this phase at all**; only the number it
  is handed changed.
- A tick at 01:30 in the querent's own zone mints nothing and writes no counter; a reading at the
  same instant mints.
- `vercel.json` schedules three jobs and the nudge route logs which slot it ran as.
- `docs/workstream-notes.md` records the `[R17]` reversal with `[R17]`'s own argument quoted.

## Handoffs

- **To Phase 1 — a stale test title.** `src/lib/db/queries/chat.integration.test.ts:103` reads
  *"carries utc_offset_minutes though nothing reads it yet ([R17])"*. Phase 8 makes the second half
  false and Phase 1 makes the first half a real feature. **Phase 1 owns that file**; the title
  should become something like *"round-trips utc_offset_minutes, which the quiet-hours gate reads
  ([R17] reversed)"*. Phase 8 does not touch it, to avoid two phases editing one test.
- **To Phase 1 — keep `utcOffsetMinutes` in `getThread`'s projection.** `mint.ts` now reads
  `thread?.utcOffsetMinutes`. `getThread` is a bare `.select()` today, so this holds by default;
  it becomes a real constraint only if phase 1 narrows the projection.
- **To Phase 7 — the daily-cap arithmetic depends on material scarcity.** This phase's argument for
  a cap of five is *"`no_material` is the binding gate, not the cap"*. That is true because a
  `material_key` is spent for ever. **Phase 7's time-anchored kind must self-expire its key** (the
  plan index already requires this, `occasion:return:<day>`'s shape) — if it does, the room gets a
  fresh daily opener and five becomes reachable; if the key were *permanent*, the new kind would
  fire once in a querent's life and the cap change would buy nothing.
- **To Phase 9 — the cap is not the ceiling on bubbles; `planCaps()` and rule 11 are.** Five runs
  times four beats is twenty bubbles in a theoretical worst case. Phase 9 owns the beat count and
  rule 11's *"satu beat, kadang dua"*; **the two knobs multiply**, so whoever loosens rule 11 should
  read this phase's cap first.
- **To the reconciler — `docs/workstream-notes.md` insertion point.** This phase inserts a new
  top-level section between F5's closing `---` (line 11351) and
  `## The \`BAHAN\` rule` (line 11352). Phases 2, 5 and 7 also append to that file. Order them; the
  content does not conflict.
- **Declined and recorded, not deferred silently:** deriving each cron candidate's true calendar
  day from the stored offset. The full argument is in step 6d and in the notes section; the honest
  version moves `nudgeCandidates`' selection predicate and the mint together, in one change.
- **Not done, deliberately:** `WALL_CLOCK_BUDGET_MS` stays 45 000 against `maxDuration = 60`. It
  bounds the warm loop and already enforces itself; raising it eats the 15s of headroom that keeps
  a lambda from being killed mid-`advance`, which leaves a leased run to age out.

## Rollback

**Revert the commit.** Every change in this phase is code, config or prose — no migration, no
column, no schema delta, no new `LLMOp`, no new flag in `flags.ts`.

**Without a deploy**, in order of bluntness:
1. `CHAT_QUIET_FROM_HOUR=0` and `CHAT_QUIET_TO_HOUR=0` → quiet hours off, exactly the `[R17]`
   Option A behaviour, in one setting.
2. `CHAT_PROACTIVE_MIN_GAP_SECONDS=10800` and `CHAT_PROACTIVE_MAX_PER_DAY=2` → the v0.7.0 cadence.
3. `PROACTIVE_RUN_TTL_HOURS=48`, `NUDGE_MAX_USERS=8` → the v0.7.0 cron.
4. `CHAT_PROACTIVE_ENABLED=0` → no unprompted runs at all. A posted message is still answered.

Each needs **Save then Redeploy** — environment variables are read at build time on Vercel, so
setting a value does nothing to lambdas already running.

**The cron slot is reverted separately** by deleting the `?slot=pagi` entry from `vercel.json`; the
route tolerates its absence (`slotOf` returns `null`) and nothing branches on it.
