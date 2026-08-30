# Phase 1: The browser reports a clock, the server stores it

**Plan set:** `CHAT_TIME_AWARENESS_USER_MEMORY_PROACTIVE_PLAN.md`
**Analysis:** `20260830-085616-B4K2_code_analyzer.md`
**Satisfies:** R1 — the readers must know what time it is; this phase is the transport and the storage, phase 2 is the prose
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `src/lib/chat` (with `src/lib/analytics`, `src/lib/db/queries`, `src/app/api/chat`)

---

## Reconciliation (round 1 — BINDING, overrides the body where they disagree)

**Phase 2 independently designed a second clock (`src/lib/chat/wallclock.ts`, `WallClock`,
`ChatContext.utcOffsetMinutes`). It does not land. `ChatClock` and `src/lib/chat/clock.ts` are the
one design, and `clock.ts` is the ONE clock module for the whole release** — phase 2's `<waktu>`
block and director header, phase 7's `time_of_day` material, and phase 8's quiet hours all resolve
their clock through it. Five consequences bind this phase:

1. **`clock.ts` is the ONE module and this phase creates it with more than `resolveChatClock`.**
   It also exports `WEEKDAYS`, `DAY_PARTS`, `dayPartOf(hour)`, `weekdayOf(localDate)` and
   `localDayDelta(from, to)`. **Phase 2 adds `renderNow()` and `CHAT_TIME_VOCAB` to this same
   file** and creates no second module. `MIN_/MAX_UTC_OFFSET_MINUTES` stay owned by
   `@/lib/analytics/utcoffset` and are the only bounds in the release.
2. **`Weekday` is a STRING union, not `0|1|…|6`.** Phase 7 puts a weekday in a `material_key` and
   in `describeMaterial`'s facts, where a closed token is required and a stored integer cannot be
   renamed later. `types.ts` declares
   `export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';` and
   `export type DayPart = 'morning' | 'midday' | 'afternoon' | 'evening' | 'late';` — both written
   out literally, so `types.contract.test.ts`'s one-import assertion still holds. `clock.ts`
   declares the runtime arrays `WEEKDAYS` / `DAY_PARTS` typed from them.
3. **`ChatClock`'s `known: true` arm gains `part: DayPart`**, and `types.ts` also exports
   `export type KnownChatClock = Extract<ChatClock, { known: true }>;` — phase 2's `AgeSpan` and
   phase 7's material both need to name a clock that is known. `weekday: Weekday` is the string
   token; `minutesOfDay` stays. **`dayPartOf`'s boundaries are phase 7's and are the release's
   only ones:** `morning` 05–10, `midday` 11–14, `afternoon` 15–17, `evening` 18–21, `late` 22–04.
   They are phase 7's because its five tokens are persisted inside a `material_key`, and because
   `late` starting at 22 makes phase 8's default quiet window (22–07) agree by construction.
4. **`weekdayOf(localDate: string): Weekday | null` is phase 7's Sakamoto function and lives
   here**, not in `proactive/material.ts`. It takes a `'YYYY-MM-DD'` STRING and never builds a
   `Date`, because `brief.ts` rehydrates a weekday from a `material_key` where no offset exists.
   Phase 7's `localStampFor()` / `LocalStamp` are **deleted before they are written**:
   `resolveChatClock({ offsetMinutes, now })` already answers `localDate` + `part`.
5. **The two fixture instants become `2026-08-07T07:05:00.000Z`** (steps 20 and 21), so the
   fixture clock is Friday 7 August 2026, 14:05 WIB, `midday` — which is the instant phase 2's
   `prompt.test.ts` assertions and its `built()` helper already pin. `CLOCK.localDate` is still
   `TODAY`, so step 21's ten call sites are unaffected.

**Also binding, from the shared-file ledger:**

- **`getThread`'s projection MUST NOT be narrowed.** Phases 7 and 8 both read
  `thread?.utcOffsetMinutes` off `getThread`'s existing `.select()` and both state that they
  compile on `main` because of it. This phase adds `threadOffsetMinutes` as a *separate* narrow
  reader and leaves `getThread` alone — recorded here because narrowing it later would break two
  downstream phases silently.
- **Phase 4 wraps `advance()`.** It extracts this phase's `advance()` body into `advanceOnce()`
  and makes `advance()` a forwarding wrapper. The clock read and `resolveChatClock` call this
  phase adds inside `advance()` end up inside `advanceOnce()`; `advance()`'s exported signature is
  unchanged by both phases and **the two compose in either order with no edit** — which is why
  phase 4 does not take a hard dependency on this one and the R1 and R2 tracks stay parallel.
  1 before 4 is simpler to read in the diff, nothing more.
- **`scripts/smoke-llm.ts` is written by four phases in order: 1 → 2 → 5 → 9.** This phase adds
  the fixture clock as `const CHAT_CLOCK` (not `CHAT_UTC_OFFSET_MINUTES` — phase 2 reuses this
  constant and adds none of its own).
- **This phase declares no new event NAME** and therefore does not touch `events.test.ts`'s
  ceiling. Phase 4 spends the last of it (77 → 78).

---

## Goal

After this phase the querent's browser reports its **UTC offset in minutes** on every chat
request, the server validates it, persists it into the already-existing
`chat_threads.utc_offset_minutes` column, and reads it back into a resolved `ChatClock`
that reaches `DirectorInput`, `VoiceInput` and `ChatContext`. The two fabricated
`new Date().toISOString().slice(0, 10)` calls in `direct/prompt.ts` and `voices/prompt.ts`
are gone, replaced by the querent's real calendar day. **`ChatButton`'s missing
`x-jm-local-date` — which put every proactive tick from `/`, `/[reader]`, `/account` and
`/history` on the UTC day, i.e. the wrong day for ~7 hours a night in Jakarta — is fixed
here.** No prompt string changes and no prompt output changes: phase 2 renders the clock.

## Interface Contract

**Creates:**
- `src/lib/analytics/utcoffset.ts` — `UTC_OFFSET_HEADER` (`'x-jm-utc-offset'`),
  `MIN_UTC_OFFSET_MINUTES` (`-720`), `MAX_UTC_OFFSET_MINUTES` (`840`),
  `type UtcOffsetResult`, `localUtcOffsetMinutes()`, `parseUtcOffset()`
- `src/lib/analytics/utcoffset.test.ts`
- `src/lib/chat/clock.ts` — **THE ONE CLOCK MODULE FOR THE RELEASE.** `resolveChatClock()`,
  `WEEKDAYS`, `DAY_PARTS`, `dayPartOf(hour)`, `weekdayOf(localDate)`, `localDayDelta(from, to)`.
  Phase 2 adds `renderNow()` and `CHAT_TIME_VOCAB` to it; phase 7 imports `WEEKDAYS`, `DAY_PARTS`
  and `weekdayOf` from it and creates no calendar helpers of its own.
- `src/lib/chat/clock.test.ts`
- `src/lib/chat/types.ts` — `type Weekday` (a STRING union), `type DayPart`, `type ChatClock`,
  `type KnownChatClock`
- `src/lib/db/queries/chat.ts` — `threadOffsetMinutes(db, userId)`

**Signature changes:**
- `AssembleArgs` (`src/lib/chat/context.ts:213`): `localDate: string` **is replaced by**
  `clock: ChatClock`. Ten call sites in `context.integration.test.ts` and the two engine
  builders move with it.
- `DirectorInput` (`src/lib/chat/types.ts:306`): gains **required** `clock: ChatClock`
- `VoiceInput` (`src/lib/chat/types.ts:332`): gains **required** `clock: ChatClock`
- `ChatContext` (`src/lib/chat/prompt/build.ts:68`): gains **required** `clock: ChatClock`
- `EventMap['chat.message_sent']` (`src/lib/analytics/events.ts:1053`): gains
  `clock: 'client' | 'absent' | 'malformed' | 'out_of_range'`
- `doPlan` / `doBeat` (`src/lib/chat/run.ts:257`, `:343`) gain a `clock` parameter — both
  are module-private.

**Deletes:** nothing. **Renames:** nothing. **No migration** — the column exists at
`src/lib/db/schema.ts:1695` (`0014_f1-chat.sql:54`), folded in by `[R17]` for this day.

**`advance()`'s public signature is UNCHANGED** — `{ userId, locale }`. The engine reads
the offset from `chat_threads`, so `onTick.ts:95`, `/api/cron/nudge:225` and
`/api/chat/advance` need no edit and the cron (which has no client) gets the same clock the
browser does.

**Requires (from earlier phases):** none.

**Leaves alone (owned by others):**
- `ageLabel` / `gapLabel` (`prompt/build.ts:311`, `:334`) and their no-clock ruling — **phase 2**
- `ageBucket` (`direct/window.ts:85`) and `[F2-16]` — **phase 2**
- every prompt string in `prompt/base.{id,en}.ts`, `direct/system.{id,en}.ts` — **phases 2, 9**
- `inQuietHours` / `QuietHours` (`proactive/eligibility.ts:88`, `:149`) and
  `quietHours: null` (`proactive/mint.ts:184`) — **phase 8**
- `proactiveTick`'s signature — **phase 8**
- `proactive/brief.ts:207`'s `now.toISOString().slice(0, 10)` — **left as is**, see Handoffs
- `src/lib/db/schema.ts` apart from one comment-only correction (see Step 12); the
  `user_memory` table is **phase 3's** and this phase claims no migration number.

## Files

| File | Action | What changes |
|---|---|---|
| `src/lib/analytics/utcoffset.ts` | create | the header name, the client producer, the server parser |
| `src/lib/analytics/utcoffset.test.ts` | create | the parser's refusals, pinned |
| `src/lib/chat/clock.ts` | create | `resolveChatClock` — offset + instant → the querent's wall clock |
| `src/lib/chat/clock.test.ts` | create | the resolver, both arms |
| `src/lib/chat/types.ts` | modify | `Weekday`, `ChatClock`; `DirectorInput`/`VoiceInput` carry it (`:306`, `:332`) |
| `src/lib/db/queries/chat.ts` | modify | `threadOffsetMinutes`, after `getThread` (`:157`) |
| `src/lib/db/queries/chat.integration.test.ts` | modify | the `[R17]` test now reads through the reader (`:104`) |
| `src/lib/chat/context.ts` | modify | `AssembleArgs.localDate` → `clock` (`:223`); the lookback floor (`:264`); return it (`:340`) |
| `src/lib/chat/prompt/build.ts` | modify | `ChatContext.clock`, declared and not rendered (`:68`) |
| `src/lib/chat/direct/prompt.ts` | modify | the fabricated date is replaced by `input.clock` (`:115`) |
| `src/lib/chat/voices/prompt.ts` | modify | the fabricated date is replaced by `input.clock` (`:89`) |
| `src/lib/chat/run.ts` | modify | resolve the clock once per advance, thread it into both inputs (`:200`, `:257`, `:343`) |
| `src/app/api/chat/message/route.ts` | modify | parse the header, persist in the existing transaction, report it (`:310`, `:330`) |
| `src/app/api/chat/state/route.ts` | modify | parse it, persist on change in `after()` before the tick (`:120`) |
| `src/app/chat/ChatRoom.tsx` | modify | send the offset on all five fetches (`:269`) |
| `src/components/ChatButton.tsx` | modify | **the defect**: send the local date and the offset (`:93`) |
| `src/components/chatSurface.test.ts` | modify | pin the badge poller's headers so the defect cannot return |
| `src/lib/analytics/events.ts` | modify | one closed-token prop on `chat.message_sent` (`:1053`) |
| `src/lib/db/schema.ts` | modify | **comment only**: `utc_offset_minutes` is read now (`:1683`) |
| `src/lib/chat/context.integration.test.ts` | modify | ten `localDate: TODAY` → `clock: CLOCK` |
| `src/lib/chat/prompt/prompt.test.ts` | modify | `ctxFixture` carries a clock (`:418`) |
| `scripts/smoke-llm.ts` | modify | `chatFixtureContext` carries a clock (`:2213`) |

---

## Implementation Steps

### Step 1: The header, the client producer and the server parser

**File:** `src/lib/analytics/utcoffset.ts` (new)
**Change:** A sibling leaf to `localdate.ts`, isomorphic and dependency-free, holding the
third untrusted clock signal. It is a **separate file rather than three more exports in
`localdate.ts`** because `localdate.ts`'s header is a sustained argument about one value
with one fallback, and this value has **no fallback at all** — the whole point is that an
absent offset stays `null` and is not silently 0 (UTC).

**Code:**

```ts
/**
 * The querent's offset from UTC, as their browser reports it. Untrusted.
 *
 * ISOMORPHIC AND DEPENDENCY-FREE, for `localdate.ts`'s reason: the client
 * computes this value, the server validates it, and both sides need the header
 * name -- so this file imports nothing and can be pulled into either bundle.
 *
 * ── WHY THIS IS A SECOND SIGNAL AND NOT A WIDENING OF `local_date` ─────────
 *
 * `local_date` answers *which calendar day is it for this person*, is stored as
 * a `'YYYY-MM-DD'` STRING and must never become a `Date`. This answers *where
 * on the clock are they right now*, which the day cannot express: 08:39 and
 * 23:39 are the same `local_date`, and the bug this exists to fix is a reader
 * saying "jam 5 nanti" at 08:39, three hours after five o'clock went past.
 *
 * ── THERE IS NO FALLBACK VALUE, AND THAT IS THE DIFFERENCE THAT MATTERS ────
 *
 * `parseLocalDate` falls back to the server's UTC date because
 * `readings.local_date` is `not null` and there is no third option. Here there
 * is: `chat_threads.utc_offset_minutes` is NULLABLE, and **absent must stay
 * distinguishable from zero**, because zero is a legitimate offset (UTC, and
 * the querent in London in winter). A defensive parse that returned 0 for a
 * missing header would tell three readers it is 01:39 in the morning while the
 * querent is having breakfast in Jakarta -- confidently wrong, which is worse
 * than the timeless room this replaces. So the absent value is `null` and
 * every consumer must have a branch for it.
 *
 * ── THE SIGN CONVENTION, WRITTEN DOWN BECAUSE IT IS BACKWARDS IN JS ────────
 *
 * `minutes EAST of UTC`: Jakarta is `+420`, New York in winter is `-300`. The
 * browser's `Date.prototype.getTimezoneOffset()` returns the OPPOSITE sign
 * (`-420` in Jakarta), which is why `localUtcOffsetMinutes()` exists rather
 * than each call site negating it and one of them forgetting.
 */

/** The querent's own offset, from `localUtcOffsetMinutes()`. */
export const UTC_OFFSET_HEADER = 'x-jm-utc-offset';

/**
 * The real range of UTC offsets, and nothing wider.
 *
 * UTC-12 (Baker Island) to UTC+14 (Line Islands). A browser can report
 * anything -- a tampered request, a broken clock, a fuzzer -- and a value
 * outside this range would render a wall-clock time that is not any place on
 * earth. Deliberately NOT additionally constrained to multiples of 15: Nepal
 * (+345), Chatham (+765) and Eucla (+525) are real, and a stricter rule would
 * refuse a legitimate querent to catch nothing.
 */
export const MIN_UTC_OFFSET_MINUTES = -720;
export const MAX_UTC_OFFSET_MINUTES = 840;

export type UtcOffsetResult =
  | { offsetMinutes: number; source: 'client'; received: string }
  | {
      /** **NEVER `0`.** See the header: absent and UTC are different facts. */
      offsetMinutes: null;
      source: 'unknown';
      reason: 'absent' | 'malformed' | 'out_of_range';
      received: string | null;
    };

/**
 * A whole number of minutes, no leading zeros, no `+`, and `-0` refused.
 *
 * `-0` is refused rather than normalised because the only producer of this
 * header is `localUtcOffsetMinutes()`, which cannot emit it: a client that does
 * is not our client, and a reader that quietly accepts junk is how a wrong
 * clock ships looking right.
 */
const SHAPE = /^(0|-?[1-9]\d{0,3})$/;

/**
 * THE CLIENT HALF. Minutes east of UTC for this device, right now.
 *
 * **NEVER CALL IT DURING RENDER** (`F4-15`, `todayKey()`'s rule): it reads the
 * device clock, so the server and the client disagree and React cannot patch a
 * hydration mismatch. Both call sites are inside effects.
 */
export function localUtcOffsetMinutes(date: Date = new Date()): number {
  return -date.getTimezoneOffset();
}

/**
 * THE SERVER HALF. Validate a client-supplied offset, or answer `null`.
 *
 * The three reasons are distinguished for `parseLocalDate`'s reason -- they
 * mean different things operationally. `absent` is a client that has not
 * shipped yet (or the badge poller before this phase); `malformed` is a client
 * that computed it wrong; `out_of_range` is a broken clock or a tampered
 * request.
 */
export function parseUtcOffset(raw: unknown): UtcOffsetResult {
  if (typeof raw !== 'string' || raw === '') {
    return { offsetMinutes: null, source: 'unknown', reason: 'absent', received: null };
  }

  if (!SHAPE.test(raw)) {
    return { offsetMinutes: null, source: 'unknown', reason: 'malformed', received: raw };
  }

  const minutes = Number(raw);
  if (minutes < MIN_UTC_OFFSET_MINUTES || minutes > MAX_UTC_OFFSET_MINUTES) {
    return { offsetMinutes: null, source: 'unknown', reason: 'out_of_range', received: raw };
  }

  return { offsetMinutes: minutes, source: 'client', received: raw };
}
```

**Impact:** New leaf. Nothing imports it yet.

---

### Step 2: The parser's refusals, pinned

**File:** `src/lib/analytics/utcoffset.test.ts` (new)
**Change:** Unit tests, `npm test`, no database.

**Code:**

```ts
import { describe, expect, it } from 'vitest';

import {
  MAX_UTC_OFFSET_MINUTES,
  MIN_UTC_OFFSET_MINUTES,
  UTC_OFFSET_HEADER,
  localUtcOffsetMinutes,
  parseUtcOffset,
} from './utcoffset';

describe('the header name', () => {
  it('is lowercase and namespaced like the other two', () => {
    expect(UTC_OFFSET_HEADER).toBe('x-jm-utc-offset');
  });
});

describe('localUtcOffsetMinutes', () => {
  /**
   * **THE SIGN IS THE WHOLE TEST.** `getTimezoneOffset()` returns UTC minus
   * local, so Jakarta reports `-420` and this must report `+420`. A negation
   * dropped here would put every Jakarta querent fourteen hours away.
   */
  it('is minutes EAST of UTC, the opposite sign to getTimezoneOffset()', () => {
    const jakarta = { getTimezoneOffset: () => -420 } as Date;
    expect(localUtcOffsetMinutes(jakarta)).toBe(420);

    const newYork = { getTimezoneOffset: () => 300 } as Date;
    expect(localUtcOffsetMinutes(newYork)).toBe(-300);

    const utc = { getTimezoneOffset: () => 0 } as Date;
    expect(localUtcOffsetMinutes(utc)).toBe(0);
  });
});

describe('parseUtcOffset', () => {
  it('accepts a real offset', () => {
    expect(parseUtcOffset('420')).toEqual({
      offsetMinutes: 420,
      source: 'client',
      received: '420',
    });
    expect(parseUtcOffset('-300').offsetMinutes).toBe(-300);
    /* The quarter-hour zones are real and must pass. */
    expect(parseUtcOffset('345').offsetMinutes).toBe(345);
    expect(parseUtcOffset('765').offsetMinutes).toBe(765);
  });

  /**
   * **ZERO IS A MEASUREMENT, NOT AN ABSENCE.** The querent is in London in
   * winter. If this ever came back `null` the room would go timeless for a
   * whole timezone; if `absent` ever came back `0` it would go confidently
   * wrong for every other one.
   */
  it('accepts zero as a value, and it is not the absent answer', () => {
    expect(parseUtcOffset('0')).toEqual({ offsetMinutes: 0, source: 'client', received: '0' });
    expect(parseUtcOffset(null).offsetMinutes).toBeNull();
    expect(parseUtcOffset(undefined).reason).toBe('absent');
    expect(parseUtcOffset('').reason).toBe('absent');
  });

  it('refuses anything that is not a bare integer', () => {
    for (const raw of ['+420', ' 420', '420 ', '07', '-0', '4.2', '420.0', 'x', '4e2', '0x1a']) {
      const parsed = parseUtcOffset(raw);
      expect({ raw, offset: parsed.offsetMinutes }).toEqual({ raw, offset: null });
      expect(parsed.source).toBe('unknown');
      if (parsed.source === 'unknown') expect(parsed.reason).toBe('malformed');
    }
  });

  it('refuses a value no place on earth has', () => {
    for (const raw of ['-721', '841', '1440', '-1440']) {
      const parsed = parseUtcOffset(raw);
      expect({ raw, offset: parsed.offsetMinutes }).toEqual({ raw, offset: null });
      if (parsed.source === 'unknown') expect(parsed.reason).toBe('out_of_range');
    }
    expect(parseUtcOffset(String(MIN_UTC_OFFSET_MINUTES)).offsetMinutes).toBe(-720);
    expect(parseUtcOffset(String(MAX_UTC_OFFSET_MINUTES)).offsetMinutes).toBe(840);
  });

  it('refuses a non-string without throwing', () => {
    for (const raw of [420, {}, [], true, Symbol('x')] as unknown[]) {
      expect(parseUtcOffset(raw).offsetMinutes).toBeNull();
    }
  });
});
```

**Impact:** None on production code.

---

### Step 3: `ChatClock` on the types leaf

**File:** `src/lib/chat/types.ts:306` (before `DirectorInput`) and `:306`/`:332` (the two inputs)
**Change:** Declare the clock **in `types.ts` itself, with no import**, because
`types.contract.test.ts` asserts `importsOf(SOURCE)).toEqual(['@/data/types'])` — the leaf
imports exactly one module and six workstreams depend on that. `ChatClock` is plain
scalars, so it costs no import; the *arithmetic* lives in `clock.ts` (step 4).

Insert immediately above `export type DirectorInput` (line 306):

**Code:**

```ts
/**
 * **A STRING TOKEN, NOT `getUTCDay()`'s INTEGER** (reconciliation, round 1). Phase 7 puts a
 * weekday inside a `material_key` and inside `describeMaterial`'s `facts`, and both are
 * persisted surfaces where a closed token is the contract and an integer is a magic number
 * nobody can rename later. Sunday-first, so `WEEKDAYS[getUTCDay()]` in `clock.ts` is the
 * only place the two representations meet.
 */
export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

/**
 * The five parts of a day, tiling all twenty-four hours. **The boundaries are phase 7's**
 * (`morning` 05–10, `midday` 11–14, `afternoon` 15–17, `evening` 18–21, `late` 22–04) for
 * two reasons: these five tokens are persisted inside a `tod:` `material_key`, and `late`
 * starting at 22 makes phase 8's default quiet window (22–07) agree with the vocabulary by
 * construction rather than by coincidence. `id` is the source language and the English
 * words in `CHAT_TIME_VOCAB` are a rewrite of these divisions, never a second scheme.
 */
export type DayPart = 'morning' | 'midday' | 'afternoon' | 'evening' | 'late';

/**
 * WHAT TIME IT IS FOR THE QUERENT. Resolved once per run by `./clock.ts`.
 *
 * **A DISCRIMINATED UNION RATHER THAN FIVE NULLABLE FIELDS, BECAUSE THE UNKNOWN
 * CASE IS A REAL CASE AND MUST NOT BE PAPERED OVER.** `chat_threads.utc_offset_minutes`
 * is nullable: a querent whose only client is an old bundle, and every row that
 * predates this release, has no offset at all. With `known: false` the room is
 * exactly as timeless as it was before this phase -- which is a degradation, not
 * a bug -- and a consumer cannot reach `localTime` without saying which case it
 * is handling. **`offsetMinutes: 0` is UTC and is `known: true`;** absent is the
 * other arm. See `@/lib/analytics/utcoffset`'s header for why that distinction
 * is the whole design.
 *
 * `localDate` is present in BOTH arms because every consumer needs it -- it is
 * the floor of the thirty-day reading lookback -- and it is a `'YYYY-MM-DD'`
 * STRING, never a `Date` (`local_date`'s trap, `[F1-21]`).
 */
export type ChatClock =
  | {
      known: true;
      /** Minutes EAST of UTC. Jakarta `+420`. */
      offsetMinutes: number;
      /** The querent's calendar day, `'YYYY-MM-DD'`. Derived from the offset. */
      localDate: string;
      /** The querent's wall clock, `'HH:MM'`, 24-hour. */
      localTime: string;
      weekday: Weekday;
      /** Which of the five parts of the day this hour falls in. `dayPartOf(hour)`. */
      part: DayPart;
      /** Minutes since the querent's local midnight, `0`–`1439`. */
      minutesOfDay: number;
    }
  | {
      known: false;
      offsetMinutes: null;
      /** The client's own day if one arrived, else the server's UTC date. */
      localDate: string;
    };

/**
 * A clock that is known. **Phase 2's `AgeSpan` and phase 7's `TimeOfDayMaterial` both need to
 * name one**, and `Extract` is how they do it without either file re-declaring the shape.
 */
export type KnownChatClock = Extract<ChatClock, { known: true }>;
```

Then extend the two inputs. `DirectorInput` (was lines 306–314) becomes:

```ts
export type DirectorInput = {
  runId: string;
  userId: string;
  trigger: RunTrigger;
  triggerMessageId: string | null;
  triggerReadingId: string | null;
  /** The querent's default, per `C-D9`'s fallback. The director may override it. */
  fallbackLocale: Locale;
  /**
   * WHAT TIME IT IS FOR THE QUERENT, resolved by the engine from
   * `chat_threads.utc_offset_minutes` (R1).
   *
   * **REQUIRED, AND THAT IS DELIBERATE.** An optional clock is a clock somebody
   * forgets to pass on the one path that needed it; the compiler naming every
   * construction site is the point. Phase 1 threads it and renders nothing with
   * it — the director's header line is phase 2's.
   */
  clock: ChatClock;
};
```

`VoiceInput` (was lines 332–342) becomes:

```ts
export type VoiceInput = {
  runId: string;
  userId: string;
  beat: Beat;
  beatIndex: number;
  locale: Locale;
  trigger: RunTrigger;
  /** `C-R5`: every beat sees every earlier beat of its own run, as ACTUAL PROSE. */
  runSoFar: ChatMessageDto[];
  attempt: 1 | 2;
  /** WHAT TIME IT IS FOR THE QUERENT (R1). `DirectorInput.clock`'s rules verbatim. */
  clock: ChatClock;
};
```

**Impact:** `types.contract.test.ts` stays green — no new import, no `process.env`, no
prompt prose. Every construction site of the two inputs is now a compile error until
step 8 lands; the only ones are `run.ts:257` and `run.ts:343`.

---

### Step 4: The resolver

**File:** `src/lib/chat/clock.ts` (new)
**Change:** The one place an offset becomes a wall clock. **PURE** — no `server-only`, no
`next/*`, no `react`, no `process.env` — so `npm test` drives it and phase 8's
`eligibility.ts` (which is pure) can import it.

**Code:**

```ts
/**
 * OFFSET + INSTANT -> THE QUERENT'S WALL CLOCK. One producer, no exceptions.
 *
 * PURE, and a leaf over two other leaves: `@/lib/chat/types` for the shape and
 * `@/lib/analytics/utcoffset` for the bounds and the UTC date. No `server-only`
 * (phase 8's `eligibility.ts` is pure and will import this), no `next/*`, no
 * `react`, no `process.env`.
 *
 * ── THE ARITHMETIC IS DONE IN UTC ON PURPOSE ───────────────────────────────
 *
 * `shifted.getUTCHours()` on an instant that has been moved forward by the
 * offset, NEVER `getHours()`, which reads the SERVER's zone -- `iad1`, `sin1`
 * or a WSL box, three different answers for one line of code. Shift, then read
 * in UTC: the standard trick, written down because the wrong version looks
 * identical and passes every test run in a UTC container.
 *
 * ── AND THE DAY COMES FROM THE OFFSET, NOT FROM THE HEADER ─────────────────
 *
 * When the offset is known, `localDate` is DERIVED rather than taken from
 * `x-jm-local-date`. Two sources for one fact is two sources that will
 * disagree, and the one that must win is the one consistent with the clock time
 * rendered beside it: a prompt saying "Sabtu, 30 Agustus, 08:39" whose day and
 * whose hour came from different places is the class of bug this phase exists
 * to end. The header's value is kept as the fallback for the `known: false`
 * arm, where it is strictly better than the server's UTC date.
 */
import { MAX_UTC_OFFSET_MINUTES, MIN_UTC_OFFSET_MINUTES } from '@/lib/analytics/utcoffset';
import type { ChatClock, Weekday } from './types';

export type ResolveClockArgs = {
  /** From `chat_threads.utc_offset_minutes`, or a freshly parsed header. */
  offsetMinutes: number | null;
  /** Injected so every test is deterministic. Defaults to now. */
  now?: Date;
  /** The client's `x-jm-local-date`, when a client sent one. Used only when the
   *  offset is unknown; the derived day wins whenever there is one. */
  fallbackLocalDate?: string | null;
};

/**
 * **IT NEVER THROWS AND NEVER RETURNS `NaN`.** It is on the path of every chat
 * model call, and `ttl.ts`'s rule applies: a defensive parse falls back, it does
 * not produce a number that is wrong in a way nothing can see. An out-of-range
 * stored offset -- which no writer can produce today, but a future one might --
 * degrades to `known: false` rather than rendering a time on no planet.
 */
export function resolveChatClock(args: ResolveClockArgs): ChatClock {
  /* An invalid `Date` makes `toISOString()` THROW. This function is called from
   * inside `advance()`, which is written not to throw at all. */
  const now =
    args.now instanceof Date && !Number.isNaN(args.now.getTime()) ? args.now : new Date();

  const offsetMinutes = args.offsetMinutes;
  const usable =
    typeof offsetMinutes === 'number' &&
    Number.isInteger(offsetMinutes) &&
    offsetMinutes >= MIN_UTC_OFFSET_MINUTES &&
    offsetMinutes <= MAX_UTC_OFFSET_MINUTES;

  if (!usable) {
    return {
      known: false,
      offsetMinutes: null,
      localDate: args.fallbackLocalDate ?? now.toISOString().slice(0, 10),
    };
  }

  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  const iso = shifted.toISOString();

  const hour = shifted.getUTCHours();
  return {
    known: true,
    offsetMinutes,
    localDate: iso.slice(0, 10),
    localTime: iso.slice(11, 16),
    /* `getUTCDay()` is 0–6 by specification and `WEEKDAYS` is Sunday-first, so this
     * index is total. **The ONE place the integer becomes the token**; nothing
     * downstream sees the integer. */
    weekday: WEEKDAYS[shifted.getUTCDay()],
    part: dayPartOf(hour),
    minutesOfDay: hour * 60 + shifted.getUTCMinutes(),
  };
}

/** Sunday-first, matching `Date.prototype.getUTCDay()`'s numbering. */
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const satisfies
  readonly Weekday[];

/** The five parts, in order. Phase 7's `MATERIAL_ORDER`-adjacent tables index off this. */
export const DAY_PARTS = ['morning', 'midday', 'afternoon', 'evening', 'late'] as const satisfies
  readonly DayPart[];

/**
 * Which part of the day an hour falls in. **Total over every integer**, so a corrupted hour
 * files under `late` rather than becoming `undefined` in a prompt.
 *
 * The boundaries are Indonesian — pagi, siang, sore, malam, larut — because `id` is the
 * source language. `late` starts at 22, which is where phase 8's default quiet window
 * starts; that agreement is deliberate and is the reason these boundaries won over the
 * other candidate set.
 */
export function dayPartOf(hour: number): DayPart {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 15) return 'midday';
  if (h >= 15 && h < 18) return 'afternoon';
  if (h >= 18 && h < 22) return 'evening';
  return 'late';
}

/**
 * The weekday of a `'YYYY-MM-DD'` string. **NOT VIA A `Date`, EVER.**
 *
 * Phase 7's function, landed here so there is one calendar in the release. `brief.ts`
 * rehydrates a `tod:<date>:<part>` key at plan time with no offset in hand, so it needs a
 * weekday from a bare string — and `local_date`'s trap (*"`getMonth()` on a server in UTC
 * wishes somebody in Jakarta a happy birthday a day early"*) eats a weekday exactly the
 * same way. This is integer arithmetic over the three numbers in the string: it has no
 * timezone, so it cannot be right in one and wrong in another.
 *
 * `null` on a malformed string rather than a throw — `brief.ts`'s rule is that an
 * unrecognised key is a run it cannot describe, not one it should fail.
 */
const SAKAMOTO = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;

export function weekdayOf(localDate: string): Weekday | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  const y = Number(localDate.slice(0, 4));
  const m = Number(localDate.slice(5, 7));
  const d = Number(localDate.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const yy = m < 3 ? y - 1 : y;
  const idx =
    (yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + SAKAMOTO[m - 1] + d) %
    7;
  return WEEKDAYS[idx];
}

/**
 * `to` minus `from`, in whole local calendar days. `0` is today, `1` is yesterday.
 *
 * Phase 2's function, landed here for the same one-calendar reason. **Two `'YYYY-MM-DD'`
 * STRINGS, and the arithmetic is done at UTC midnight** — `shiftLocalDate`'s technique in
 * `context.ts`. Both dates have already had the offset applied, so treating them as UTC
 * midnights is exact rather than approximate. `null` on anything unparseable.
 */
export function localDayDelta(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}
```

**Impact:** New pure module.

---

### Step 5: The resolver's tests

**File:** `src/lib/chat/clock.test.ts` (new)
**Change:** Unit tests. **The reported bug is the first case**, reproduced from the
production row in the analysis.

**Code:**

```ts
import { describe, expect, it } from 'vitest';

import { dayPartOf, resolveChatClock, weekdayOf } from './clock';

/** `01:39:48Z` on 2026-08-30 — the bubble that started this workstream. */
const THE_BUG = new Date('2026-08-30T01:39:48.000Z');

describe('resolveChatClock, with an offset', () => {
  it('turns the reported bug into a wall clock', () => {
    const clock = resolveChatClock({ offsetMinutes: 420, now: THE_BUG });
    expect(clock).toEqual({
      known: true,
      offsetMinutes: 420,
      localDate: '2026-08-30',
      localTime: '08:39',
      /* 2026-08-30 is a Sunday. A token, not an integer — see `Weekday`. */
      weekday: 'sun',
      part: 'morning',
      minutesOfDay: 8 * 60 + 39,
    });
  });

  /**
   * **`weekdayOf` AND `resolveChatClock` MUST NEVER DISAGREE**, and they reach the answer
   * two different ways: one shifts an instant and reads `getUTCDay()`, the other does
   * integer arithmetic on a string with no `Date` at all. Phase 7 rehydrates a weekday
   * through the second on a run the first minted, so a divergence would ship a Monday
   * greeting on a Sunday and nothing would report it.
   */
  it('agrees with weekdayOf on the day it derived', () => {
    for (const iso of ['2026-08-30T01:39:48.000Z', '2026-08-29T23:30:00.000Z', '2027-03-01T00:00:00.000Z']) {
      const clock = resolveChatClock({ offsetMinutes: 420, now: new Date(iso) });
      if (clock.known) expect(weekdayOf(clock.localDate)).toBe(clock.weekday);
    }
  });

  it('walks the five day parts in order and is total over every integer', () => {
    expect([0, 4, 5, 10, 11, 14, 15, 17, 18, 21, 22, 23].map(dayPartOf)).toEqual([
      'late', 'late', 'morning', 'morning', 'midday', 'midday',
      'afternoon', 'afternoon', 'evening', 'evening', 'late', 'late',
    ]);
    /* **RECONCILED (round 2): this expectation was `'evening'` and would have FAILED.**
     * `-1` wraps to `23` through `((h % 24) + 24) % 24`, and `evening` ends at 21 — so 23
     * is `late`, which is also what the docblock says. The case is kept because the WRAP is
     * the property worth pinning; only the expected token was wrong. */
    expect(dayPartOf(-1)).toBe('late');
    expect(dayPartOf(Number.NaN)).toBe('late');
  });

  /**
   * **THE DAY, NOT ONLY THE HOUR.** 23:00 UTC is already tomorrow in Jakarta,
   * and the thirty-day lookback floor and the daily proactive cap are both keyed
   * on this string.
   */
  it('rolls the day over at the querent’s midnight, not at UTC’s', () => {
    const clock = resolveChatClock({
      offsetMinutes: 420,
      now: new Date('2026-08-30T23:30:00.000Z'),
    });
    expect(clock.localDate).toBe('2026-08-31');
    if (clock.known) expect(clock.localTime).toBe('06:30');
  });

  it('goes the other way for a negative offset', () => {
    const clock = resolveChatClock({
      offsetMinutes: -300,
      now: new Date('2026-08-30T02:00:00.000Z'),
    });
    expect(clock.localDate).toBe('2026-08-29');
    if (clock.known) expect(clock.localTime).toBe('21:00');
  });

  it('treats zero as a known offset, because UTC is a place', () => {
    const clock = resolveChatClock({ offsetMinutes: 0, now: THE_BUG });
    expect(clock.known).toBe(true);
    expect(clock.offsetMinutes).toBe(0);
    if (clock.known) expect(clock.localTime).toBe('01:39');
  });

  it('handles a quarter-hour zone', () => {
    const clock = resolveChatClock({ offsetMinutes: 345, now: THE_BUG });
    if (clock.known) expect(clock.localTime).toBe('07:24');
  });

  it('ignores the client’s day when it can derive one', () => {
    const clock = resolveChatClock({
      offsetMinutes: 420,
      now: THE_BUG,
      fallbackLocalDate: '1999-01-01',
    });
    expect(clock.localDate).toBe('2026-08-30');
  });
});

describe('resolveChatClock, without one', () => {
  it('is not known, is not zero, and still has a day', () => {
    const clock = resolveChatClock({ offsetMinutes: null, now: THE_BUG });
    expect(clock).toEqual({ known: false, offsetMinutes: null, localDate: '2026-08-30' });
  });

  it('prefers the client’s own day to the server’s UTC one', () => {
    const clock = resolveChatClock({
      offsetMinutes: null,
      now: new Date('2026-08-30T23:30:00.000Z'),
      fallbackLocalDate: '2026-08-31',
    });
    expect(clock.localDate).toBe('2026-08-31');
  });

  /** A value no writer can produce today. It must degrade, never render. */
  it('refuses an out-of-range or non-integer stored offset', () => {
    for (const offsetMinutes of [841, -721, 4.2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveChatClock({ offsetMinutes, now: THE_BUG }).known).toBe(false);
    }
  });

  it('never throws on a broken instant', () => {
    const clock = resolveChatClock({ offsetMinutes: 420, now: new Date('nonsense') });
    /* It fell back to the real now rather than throwing inside `advance()`. */
    expect(clock.known).toBe(true);
    expect(clock.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

**Impact:** None on production code.

---

### Step 6: The read path

**File:** `src/lib/db/queries/chat.ts` — insert after `getThread` (ends line 155), before
the `ThreadTouch` comment at line 157.
**Change:** A narrow projection so the engine pays one indexed primary-key read rather
than a whole row. `ThreadTouch.utcOffsetMinutes` already exists (line 172) and
`upsertThread` already writes it, so the **write** path needs no change here at all.

**Code:**

```ts
/**
 * The querent's UTC offset, or null. **THE ONE READ R1 ADDED** (`[R17]`, closed).
 *
 * `[R17]` folded `utc_offset_minutes` into `0014` while nothing read it, so that
 * ruling the other way later would be one line rather than a migration. This is
 * that line.
 *
 * **NULL IS A FIRST-CLASS ANSWER AND NEVER ZERO** — no thread row, no offset
 * ever reported, or a malformed header that was refused rather than coerced.
 * `resolveChatClock` turns it into a `known: false` clock and the room is as
 * timeless as it was before, which is a degradation rather than a wrong answer.
 *
 * Its own projection rather than `getThread`, because the engine calls it once
 * per beat on the path of a model call: five columns this caller does not want
 * is five columns crossing a Neon link in `sin1` for nothing.
 *
 * **AND `getThread`'s OWN `.select()` IS NOT NARROWED, DELIBERATELY.** Phases 7
 * and 8 both read `thread?.utcOffsetMinutes` off it — the material detectors and
 * the quiet-hours gate — and both state they compile on `main` because that
 * projection is a bare `select()`. Adding a second, narrower reader is free;
 * narrowing the existing one would break two later phases with a green
 * typecheck in this one.
 */
export async function threadOffsetMinutes(db: DbOrTx, userId: string): Promise<number | null> {
  if (!UUID_RE.test(userId)) return null;
  const [row] = await db
    .select({ utcOffsetMinutes: chatThreads.utcOffsetMinutes })
    .from(chatThreads)
    .where(eq(chatThreads.userId, userId))
    .limit(1);
  return row?.utcOffsetMinutes ?? null;
}
```

**Impact:** `chat.contract.test.ts` stays green — the projection names its columns, does
not name `model`, and is not a bare `db.select()` over `chatMessages`.

---

### Step 7: The integration test that said nothing reads it

**File:** `src/lib/db/queries/chat.integration.test.ts:104–112`
**Change:** The existing test is named *"carries utc_offset_minutes though nothing reads it
yet ([R17])"*. That sentence is now false, and this repo's rule is that a header which
miscounts its own body is how the next person concludes the file is untrustworthy — so it
is **rewritten rather than left standing beside a new one**. Add `threadOffsetMinutes` to
the import block at line 29.

**Code (replacing the whole `it(...)` at line 104):**

```ts
  it('round-trips utc_offset_minutes through its own reader (R1, closing [R17])', () =>
    withRollback(async (tx) => {
      /*
       * `[R17]` folded this column into `0014` while nothing read it, so that
       * ruling the other way on quiet hours later would be one line rather than a
       * migration. R1 is that line: the engine resolves the querent's wall clock
       * from this value, and `/api/cron/nudge` — which has no client and therefore
       * no `x-jm-local-date` — reads it here too.
       */
      const userId = await makeUser(tx, 'offset');

      // NULL BEFORE ANYTHING WRITES IT, and null is not zero: a thread that has
      // never reported an offset is not a querent sitting in UTC.
      expect(await threadOffsetMinutes(tx, userId)).toBeNull();

      await upsertThread(tx, userId, { utcOffsetMinutes: 420 });
      expect((await getThread(tx, userId))?.utcOffsetMinutes).toBe(420);
      expect(await threadOffsetMinutes(tx, userId)).toBe(420);

      // Zero survives the round trip as zero. If the reader ever `??`s it to null
      // this goes red, which is the whole point of testing the boring value.
      await upsertThread(tx, userId, { utcOffsetMinutes: 0 });
      expect(await threadOffsetMinutes(tx, userId)).toBe(0);

      // A touch that names other fields leaves the offset alone.
      await upsertThread(tx, userId, { lastUserMessageAt: new Date() });
      expect(await threadOffsetMinutes(tx, userId)).toBe(0);
    }));

  it('answers null for an id that is not a uuid, rather than raising 22P02', () =>
    withRollback(async (tx) => {
      expect(await threadOffsetMinutes(tx, 'not-a-uuid')).toBeNull();
    }));
```

**Impact:** `npm run test:integration` needs `npm run db:up`.

---

### Step 8: The assembler takes a clock instead of a date

**File:** `src/lib/chat/context.ts:213–229` (`AssembleArgs`), `:264` (the lookback floor),
`:340` (the return)
**Change:** `localDate: string` **becomes** `clock: ChatClock`. Not *both* — two fields
carrying the querent's day is two fields that will disagree, and the derived one is the
one that has to win. Add `import type { ChatClock } from './types';` to the import block
(`context.ts` already imports from `./types`; extend that specifier rather than adding a
second).

`AssembleArgs` becomes:

```ts
export type AssembleArgs = {
  userId: string;
  /** The RUN's locale (`C-D9`). Never `user.locale`, never `getLocale()`. */
  locale: Locale;
  profile: ContextProfile;
  /** The run being executed, so this run's own bubbles are in the window (`C-R5`). */
  runId: string | null;
  /** The message a beat is pointed at (`C-D11`). */
  replyToMessageId: string | null;
  /**
   * WHAT TIME IT IS FOR THE QUERENT (R1). **This replaced a bare `localDate`**,
   * and the replacement is the point: the two builders that call this used to
   * fabricate `new Date().toISOString().slice(0, 10)` here, which was tolerable
   * only while its single use was the floor of a thirty-day lookback and
   * **nothing rendered a date to a person.** Phase 2 renders one, so the
   * permission expired and the value is now the querent's real day.
   *
   * `clock.localDate` is still a `'YYYY-MM-DD'` STRING and still never a `Date`.
   */
  clock: ChatClock;
};
```

The lookback floor at line 264 becomes:

```ts
      sinceLocalDate: shiftLocalDate(args.clock.localDate, lookback),
```

and the returned object gains one field, next to `locale` (line ~333):

```ts
  return {
    profile,
    locale,
    /* **DECLARED HERE, RENDERED IN PHASE 2.** `buildChatPrompt` is the only
     * consumer of a `ChatContext` (`[F3-5]`), so the clock reaches the prompt
     * layer by riding the object that already carries everything else. */
    clock: args.clock,
    nickname,
    /* … unchanged … */
```

**Impact:** Every caller of `assembleChatContext` is a compile error until steps 9, 10 and
19 land. There are exactly three: `direct/prompt.ts:97`, `voices/prompt.ts:75` and the ten
call sites in `context.integration.test.ts`. `context.contract.test.ts:161`'s
`/assembleChatContext\(\s*db: DbOrTx,/` is untouched.

---

### Step 9: The director's builder stops fabricating a date

**File:** `src/lib/chat/direct/prompt.ts:94–116`
**Change:** Pass `input.clock`. The comment being deleted is a permission that has
expired; it is replaced by a sentence saying so, rather than removed silently.

**Code (replacing lines 94–116, up to and including the closing `});` of the
`assembleChatContext` call):**

```ts
export async function buildPlanPrompt(input: DirectorInput): Promise<CompletionPrompt> {
  const caps = planCaps();

  const ctx = await assembleChatContext(db, {
    userId: input.userId,
    locale: input.fallbackLocale,
    profile: 'director',
    /*
     * **NULL, NOT `input.runId`.** A run being planned has written no bubbles yet, and
     * naming it here would only ask the assembler to union in rows that do not exist.
     */
    runId: null,
    replyToMessageId: null,
    /*
     * **THE QUERENT'S REAL CLOCK, AND THIS LINE USED TO BE A FABRICATION** (R1).
     * It read `new Date().toISOString().slice(0, 10)` — the SERVER's UTC day —
     * under a permission that said *"anything that RENDERS a date to a person
     * must not do this; nothing here does."* Phase 2 makes the director's header
     * line state the querent's weekday and time, so something does, and the
     * permission is spent. `advance()` resolves this once per request from
     * `chat_threads.utc_offset_minutes`; when no browser has ever reported one it
     * is `known: false` and carries the same UTC day this line used to invent,
     * which is why the change cannot regress the lookback it used to feed.
     */
    clock: input.clock,
  });
```

**Impact:** No prompt output change in this phase — `ctx.clock` is carried and not
rendered. The reading lookback floor becomes the querent's day instead of the server's.

---

### Step 10: The voice's builder, the same

**File:** `src/lib/chat/voices/prompt.ts:71–90`
**Change:** Identical treatment.

**Code (replacing lines 71–90, up to and including the closing `});`):**

```ts
export async function buildTurnPrompt(
  input: VoiceInput & { attempt: 1 | 2 },
): Promise<CompletionPrompt> {
  const budget = chatBudgetFor(input.locale, input.beat.reader);

  const ctx = await assembleChatContext(db, {
    userId: input.userId,
    locale: input.locale,
    profile: 'voice',
    runId: input.runId,
    replyToMessageId: input.beat.replyTo,
    /*
     * **THE QUERENT'S REAL CLOCK, AND THIS LINE USED TO BE A FABRICATION** (R1).
     * The deleted comment permitted the server's UTC day *"because nothing here
     * RENDERS a date to a person"*. This is the file whose output said *"jam 5
     * nanti"* at 08:39 — the reader had a transcript in which the newest message
     * is "just now" and a number `5`, and no position for either. Phase 2 gives
     * the voice a `<waktu>` block; this gives it something true to put in it.
     */
    clock: input.clock,
  });
```

**Impact:** As step 9.

---

### Step 11: The engine resolves the clock once and threads it

**File:** `src/lib/chat/run.ts` — imports, `advance()` (`:200`), `doPlan` (`:257`),
`doBeat` (`:343`)
**Change:** One read per advance, from the column. **`advance()`'s signature does not
move**, so the route, `onTick.ts:95` and `/api/cron/nudge:225` need no edit and the cron
gets a clock the same way the browser does.

Add to the query import block (alphabetical, after `runExistsForReading`):

```ts
  threadOffsetMinutes,
```

and two module imports after `import { nextAction } from './machine';`:

```ts
import { resolveChatClock } from './clock';
```

(`ChatClock` joins the existing type import: `import type { AdvanceReply, Beat, BeatSheet,
ChatClock, ChatMessageDto, RunTrigger } from './types';`)

Inside `advance()`, immediately after the `if (!run) return { state: 'idle', … }` guard and
before `const action = nextAction(run);`:

**Code:**

```ts
  /*
   * **THE CLOCK, READ FROM THE THREAD RATHER THAN FROM THIS REQUEST'S HEADERS** (R1).
   *
   * One indexed primary-key read per advance, against a request that is about to
   * spend two to five seconds in a model call — so the cost is noise, and what it
   * buys is that **the cron, the idle tick and the browser all get their clock the
   * same way.** `/api/cron/nudge` has no client and therefore no header; a design
   * in which the browser path reads a header and the cron path reads a column is
   * two mechanisms, and the second one is the one nobody tests.
   *
   * The column is kept fresh by the two routes that DO have a client:
   * `POST /api/chat/message` writes it inside the transaction it already opens, and
   * `GET /api/chat/state` writes it in `after()` when it has changed.
   *
   * **SWALLOWED, LIKE EVERY OTHER READ ON THIS PATH.** A failed clock read is a
   * timeless room, not a failed beat — and `[F1-23]`: never the error object, this
   * statement binds `users.id`.
   */
  const offsetMinutes = await threadOffsetMinutes(db, args.userId).catch((err) => {
    logChatFailure('advance.clock', err, { user: args.userId });
    return null;
  });
  const clock = resolveChatClock({ offsetMinutes });
```

`doPlan`'s call and signature:

```ts
      case 'plan':
        return await doPlan(run, owner, args.locale, clock);

      case 'execute':
        return await doBeat(run, owner, action.beat, action.index, action.total, clock);
```

```ts
/** The director. One `chat_plan` call, and one UPDATE that writes the sheet. */
async function doPlan(
  run: ClaimedRun,
  owner: string,
  fallbackLocale: Locale,
  clock: ChatClock,
): Promise<AdvanceReply> {
  const startedAt = Date.now();

  const outcome = await plan({
    runId: run.id,
    /* The ROW's answer to whose room this is, never the caller's copy. The claim
     * statement selects by `user_id`, so these cannot disagree — and if they ever
     * could, this is the one that decides whose six answers enter a prompt. */
    userId: run.userId,
    trigger: run.trigger,
    triggerMessageId: run.triggerMessageId,
    triggerReadingId: run.triggerReadingId,
    fallbackLocale: run.locale ?? fallbackLocale,
    /* Resolved once in `advance()`, so every beat of a run reads the same clock —
     * a run is serial and one beat must not be four seconds "later" than the plan
     * that ordered it. */
    clock,
  });
```

`doBeat`'s signature and the `speak()` call:

```ts
/** One beat. One `chat_turn` call, retried once inside this request (`F1-D2`). */
async function doBeat(
  run: ClaimedRun,
  owner: string,
  beat: Beat,
  index: number,
  total: number,
  clock: ChatClock,
): Promise<AdvanceReply> {
```

```ts
  const outcome = await speak({
    runId: run.id,
    userId: run.userId,
    beat,
    beatIndex: index,
    locale: run.locale,
    trigger: run.trigger,
    runSoFar,
    attempt: 1,
    clock,
  });
```

**Impact:** `run.test.ts` drives `nextAction`, `pace` and source-level assertions only — it
constructs neither input and stays green.

---

### Step 12: The message route persists the offset in the transaction it already opens

**File:** `src/app/api/chat/message/route.ts` — imports (`:41`), before `const ctx = await
context(...)` (`:210`), the `upsertThread` call (`:310`), the `track` call (`:330`)
**Change:** Free persistence: the upsert is already in the transaction. The key is
**omitted when the parse failed**, so a client that stops sending the header cannot null
out a good stored value.

Import block:

```ts
import {
  LOCAL_DATE_HEADER,
  SESSION_HEADER,
  parseLocalDate,
  validSessionId,
} from '@/lib/analytics/localdate';
import { UTC_OFFSET_HEADER, parseUtcOffset } from '@/lib/analytics/utcoffset';
```

Immediately before `const ctx = await context(request, user.id, locale);`:

```ts
  /*
   * **THE QUERENT'S CLOCK, ON THE ONE ROUTE THAT IS ALREADY WRITING** (R1).
   * Parsed here rather than inside `context()` because it is wanted twice: once as
   * a column and once as a closed token on `chat.message_sent`.
   */
  const clock = parseUtcOffset(request.headers.get(UTC_OFFSET_HEADER));
```

The thread touch (line 310) becomes:

```ts
        /*
         * **THE OFFSET RIDES THE TOUCH THAT WAS ALREADY HAPPENING**, and the key is
         * OMITTED rather than set to null when the header was absent or refused:
         * `ThreadTouch` is spread into both halves of the upsert, so writing
         * `utcOffsetMinutes: null` on every post would let one old tab erase the
         * offset every other tab reports. **Absent means "do not touch", never
         * "unset".**
         */
        await upsertThread(tx, user.id, {
          lastUserMessageAt: new Date(),
          ...(clock.offsetMinutes !== null ? { utcOffsetMinutes: clock.offsetMinutes } : {}),
        });
```

and the event (line 330) gains one prop:

```ts
      track('chat.message_sent', {
        /* `length` AND NEVER THE BODY (rule 1). */
        length: body.length,
        locale,
        reply_to: Boolean(input.reply_to_message_id),
        /* F6's folded declaration (`chat.attachment_added` became this prop). */
        attached_from: input.attached_from ?? null,
        reading_id: input.attached_reading_id ?? null,
        minted_run: runId !== null,
        /*
         * R1's own diagnostic, on `analytics.local_date_fallback`'s pattern: a
         * CLOSED token, never the received string, so a broken client is COUNTABLE
         * rather than silent. **Folded onto an event this handler already fires**
         * rather than spent as a new name — `events.ts`'s rule is to fold.
         */
        clock: clock.source === 'client' ? 'client' : clock.reason,
      });
```

**Impact:** One column written per post, no extra statement. One new prop.

---

### Step 13: `chat.message_sent` declares the prop

**File:** `src/lib/analytics/events.ts:1053–1057`
**Change:** One line on an existing declaration. **No new EVENT_NAME**, so
`events.test.ts`'s register and its 44–77 ceiling are untouched.

**Code (replacing the declaration):**

```ts
  'chat.message_sent':         { length: number; locale: string;
                                 reply_to: boolean;
                                 attached_from: 'history' | 'draw' | null;
                                 reading_id: string | null;
                                 minted_run: boolean;
                                 /**
                                  * R1. Whether the querent's browser reported a
                                  * usable UTC offset on this post, and if not, why
                                  * — `analytics.local_date_fallback`'s reason union
                                  * verbatim. **A CLOSED TOKEN AND NEVER THE
                                  * RECEIVED STRING**: the received value is a
                                  * diagnostic for one broken client, and rule 1
                                  * says no free text.
                                  *
                                  * **FOLDED RATHER THAN SPENT AS A NAME.** A
                                  * `analytics.utc_offset_fallback` event would fire
                                  * from a handler that is already pushing a
                                  * buffered scalar with every fact it needs, which
                                  * is the exact objection that killed
                                  * `chat.attachment_added`. A steady rate above
                                  * zero here means a client shipped without the
                                  * header and the room has gone timeless for those
                                  * querents — silently, because a timeless room
                                  * looks exactly like the one v0.7.0 shipped.
                                  */
                                 clock: 'client' | 'absent' | 'malformed' | 'out_of_range' };
```

**Impact:** `sanitizeProps` already handles a string scalar. No consumer breaks — every
reader of `events.props` is additive.

---

### Step 14: The state route persists it on change, before the tick

**File:** `src/app/api/chat/state/route.ts` — imports (`:38`), the tick block (`:118–133`)
**Change:** `getThread` has **already** run at line 96, so the comparison is free and the
write happens only when the offset actually moved — first ever poll, DST, a flight. **Both
side effects go in one `after()` callback, in order**, so phase 8's quiet-hours read sees
the value this request reported rather than racing it.

Imports:

```ts
import { LOCAL_DATE_HEADER, parseLocalDate } from '@/lib/analytics/localdate';
import { UTC_OFFSET_HEADER, parseUtcOffset } from '@/lib/analytics/utcoffset';
```

and `upsertThread` joins the query import:

```ts
import { activeRunFor, getThread, lastMessageAt, unreadCount, upsertThread } from '@/lib/db/queries/chat';
```

Replacing the whole `if (chatProactiveEnabled()) { … }` block:

```ts
  /*
   * **THE QUERENT'S CLOCK, WRITTEN ONLY WHEN IT MOVED** (R1). `getThread` has already
   * run above, so the comparison costs nothing and the write happens on a first
   * poll, on a DST change and on a flight — not on every badge fetch from four
   * pages. **This is the busiest route in the app and it stays a read.**
   *
   * It is `null` when the header was absent or refused, and the key is then never
   * written: **absent means "do not touch", never "unset"** — one old tab must not
   * be able to erase what every other tab reports.
   *
   * This is bookkeeping the querent did not ask for, which this route's header
   * already permits in `after()`. It is not a fact claiming the querent LOOKED,
   * which is the thing `F1-D3` forbids here.
   */
  const offset = parseUtcOffset(request.headers.get(UTC_OFFSET_HEADER)).offsetMinutes;
  const movedOffset = offset !== null && offset !== (thread?.utcOffsetMinutes ?? null) ? offset : null;
  const tick = chatProactiveEnabled();

  if (movedOffset !== null || tick) {
    const localDate = parseLocalDate(request.headers.get(LOCAL_DATE_HEADER)).date;
    const locale = await getLocale();
    /*
     * **ONE `after()`, TWO STEPS, IN ORDER.** Next makes no promise that two
     * separately registered callbacks run in sequence, and the order matters: the
     * proactive tick is where a run is minted, and phase 8's quiet-hours gate reads
     * the very column the first step writes. Two `after()`s would be a race that is
     * green on every machine that runs them fast enough.
     */
    after(async () => {
      if (movedOffset !== null) {
        try {
          await upsertThread(db, user.id, { utcOffsetMinutes: movedOffset });
        } catch (err) {
          logChatFailure('state.offset', err, { user: user.id });
        }
      }
      if (tick) {
        try {
          await proactiveTick({ userId: user.id, locale, localDate });
        } catch (err) {
          logChatFailure('state.tick', err, { user: user.id });
        }
      }
    });
  }
```

**Impact:** `proactiveTick`'s signature is untouched (phase 8's). With
`CHAT_PROACTIVE_ENABLED=0` the offset is still recorded — the clock is not a proactive
feature, and phase 2 needs it whether or not anybody is being nudged.

---

### Step 15: The room sends it

**File:** `src/app/chat/ChatRoom.tsx:13` (import) and `:267–276` (`headers`)
**Change:** One line in the one helper all five fetches already share.

Import:

```ts
import { LOCAL_DATE_HEADER, SESSION_HEADER } from '@/lib/analytics/localdate';
import { UTC_OFFSET_HEADER, localUtcOffsetMinutes } from '@/lib/analytics/utcoffset';
```

**Code (replacing `headers`):**

```ts
  const headers = useCallback(
    (json = false): Record<string, string> => ({
      [SESSION_HEADER]: getSessionId(),
      // The querent's own calendar day, which the server cannot compute.
      [LOCAL_DATE_HEADER]: todayKey(),
      /*
       * R1. The querent's offset from UTC, which the server cannot compute either
       * — and without which a reader says "jam 5 nanti" at 08:39.
       *
       * **READ HERE AND NOT IN STATE** (`F4-15`, `todayKey()`'s rule verbatim):
       * this callback runs inside a fetch, never during render, so the server and
       * the client never disagree about it in the markup. Seeding it into
       * `useState` would be a hydration mismatch React cannot patch.
       */
      [UTC_OFFSET_HEADER]: String(localUtcOffsetMinutes()),
      ...(json ? { 'content-type': 'application/json' } : {}),
    }),
    [],
  );
```

**Impact:** All five chat fetches carry it. No new fetch, no new effect.

---

### Step 16: The badge poller sends both — the defect

**File:** `src/components/ChatButton.tsx:6` (imports) and `:92–95` (the fetch)
**Change:** **The bug in the analysis.** `ChatButton` mounts on `/`, `/[reader]`,
`/account` and `/history` and sends `x-jm-session` only, so `parseLocalDate(null)` falls
back to the server's UTC date — **the wrong calendar day for roughly seven hours every
night in Jakarta**, on the four pages that fire more proactive ticks than the room does.
The daily proactive cap (`proactive_count_date`) and F5's occasion detectors are keyed on
exactly that day.

Imports:

```ts
import { LOCAL_DATE_HEADER, SESSION_HEADER } from '@/lib/analytics/localdate';
import { UTC_OFFSET_HEADER, localUtcOffsetMinutes } from '@/lib/analytics/utcoffset';
import { getSessionId } from '@/lib/analytics/track.client';
import type { ChatStateReply } from '@/lib/chat/types';
import { useT } from '@/lib/i18n/LocaleProvider';
import { todayKey } from '@/lib/storage';
import styles from './ChatButton.module.css';
```

**Code (replacing the `fetch` call, lines 92–95):**

```ts
        const res = await fetch('/api/chat/state', {
          /*
           * **ALL THREE, AND THIS COMPONENT SENT ONLY THE FIRST UNTIL R1.** The
           * proactive tick runs in this route's `after()`, and it is keyed on the
           * querent's calendar day: `proactive_count_date` is the daily cap and F5's
           * occasion detectors compare against it. With no `x-jm-local-date` the
           * route fell back to the SERVER'S UTC date, so **every tick fired from `/`,
           * `/[reader]`, `/account` and `/history` between midnight and 07:00 WIB was
           * booked on yesterday** — a cap that resets seven hours early and a
           * birthday that lands on the wrong day. `ChatRoom` always sent it, which is
           * why the room looked correct and the four pages around it did not.
           *
           * **INSIDE THE EFFECT, NEVER DURING RENDER** (`F4-15`): both helpers read
           * the device clock, and React cannot patch a hydration mismatch.
           */
          headers: {
            [SESSION_HEADER]: getSessionId(),
            [LOCAL_DATE_HEADER]: todayKey(),
            [UTC_OFFSET_HEADER]: String(localUtcOffsetMinutes()),
          },
          signal: controller.signal,
        });
```

**Impact:** Still exactly one `fetch`, one `AbortController` and one `signal` — the counted
assertions at `chatSurface.test.ts:255–258` stay green.

---

### Step 17: Pin the badge poller's headers

**File:** `src/components/chatSurface.test.ts` — inside the `describe('the chat button')`
block, after the `it('reads no session…')` case (line 259)
**Change:** A source-level assertion so the defect cannot come back. `stripComments` is
required: the comment above the fetch names the headers to explain them, and *a rule that
fires on the prose describing the rule is a rule people delete*.

**Code:**

```ts
  /**
   * **THE DEFECT R1 FOUND, ASSERTED SO IT CANNOT RETURN.** This component shipped
   * sending `x-jm-session` alone, and `/api/chat/state` runs the proactive tick in
   * its `after()` — keyed on `proactive_count_date`, the querent's own calendar
   * day. Without the header the route fell back to the server's UTC date, so every
   * tick from these four pages between midnight and 07:00 WIB was booked on
   * yesterday. `ChatRoom` sent it all along, which is exactly why nobody saw it.
   */
  it('sends all three clock headers on its one fetch (R1)', () => {
    const src = stripComments(file('components/ChatButton.tsx'));
    expect(src).toContain('[SESSION_HEADER]: getSessionId()');
    expect(src).toContain('[LOCAL_DATE_HEADER]: todayKey()');
    expect(src).toContain('[UTC_OFFSET_HEADER]: String(localUtcOffsetMinutes())');
  });

  /** `F4-15` for the second clock read, in the component that has no state to seed. */
  it('reads neither clock during render', () => {
    const src = stripComments(file('components/ChatButton.tsx'));
    expect(src).not.toMatch(/useState\(\s*\(\)\s*=>\s*(todayKey|localUtcOffsetMinutes)/);
  });
```

**Impact:** Unit only.

---

### Step 18: Correct the schema comment that says nothing reads it

**File:** `src/lib/db/schema.ts:1681–1695`
**Change:** **COMMENT ONLY — no column, no index, no migration.** The block currently
says *"FOLDED INTO `0014` THOUGH NOTHING READS IT YET"*, which stops being true in this
phase. `schema.ts` has one owner and this phase adds nothing to it; leaving a header that
miscounts its own body is the failure the file's own chat section names.

**Code (replacing the doc comment on `utcOffsetMinutes`, keeping the column line byte for
byte):**

```ts
  /**
   * The querent's offset from UTC in minutes, as their browser last reported it.
   * **Minutes EAST of UTC** — Jakarta is `+420`; see `@/lib/analytics/utcoffset`,
   * which is the only thing that validates a value on the way in.
   *
   * **FOLDED INTO `0014` BEFORE ANYTHING READ IT** (`[R17]`, reconciliation §2.3),
   * so that ruling the other way on quiet hours later would be one line rather than
   * a migration. **R1 IS THAT LINE AND THIS COLUMN IS NOW READ**, by
   * `threadOffsetMinutes` in `queries/chat.ts`: the chat engine resolves the
   * querent's wall clock from it once per advance, and `/api/cron/nudge` — which
   * has no client and therefore no `x-jm-local-date` header — is the reason it had
   * to be a column rather than a request field at all.
   *
   * **NULL IS NOT ZERO.** Zero is UTC, a place people live; null is a querent no
   * browser has reported for, and the room is timeless for them rather than
   * confidently seven hours wrong. `POST /api/chat/message` writes it inside the
   * transaction it already opens and `GET /api/chat/state` writes it only when it
   * has changed; neither ever writes null over a stored value.
   */
  utcOffsetMinutes: integer('utc_offset_minutes'),
```

**Impact:** Comment only. `drizzle-kit generate` produces no migration from a comment, and
none is to be run.

---

### Step 19: `ChatContext` declares the clock

**File:** `src/lib/chat/prompt/build.ts:68–86` (the `ChatContext` type)
**Change:** One field, declared and **not rendered**. Add
`ChatClock` to the existing `../types` type import.

**Code (inserting after `locale: Locale;` in `ChatContext`):**

```ts
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
  /* … the rest unchanged … */
```

**Impact:** `chatPromptVersion` hashes the contract, the reader prompt and two label
tables — not this file's source — so the stored `prompt_version` does not move. Every
`ChatContext` literal is now a compile error: `prompt.test.ts:418` and
`scripts/smoke-llm.ts:2213` (steps 20 and 21).

---

### Step 20: The two fixtures that build a `ChatContext` by hand

**File:** `src/lib/chat/prompt/prompt.test.ts:418` and `scripts/smoke-llm.ts:2233`
**Change:** One field each. `tsconfig.json` includes `**/*.ts`, so `scripts/` is
typechecked and the smoke script must compile.

In `prompt.test.ts`, add above `ctxFixture` and use it:

```ts
/** Friday 7 August 2026, 14:05 WIB (`midday`) — the instant phase 2's assertions pin. */
const CLOCK: ChatClock = resolveChatClock({
  offsetMinutes: 420,
  now: new Date('2026-08-07T07:05:00.000Z'),
});
```

(with `import { resolveChatClock } from '../clock';` and `ChatClock` added to the
`../types` type import), and inside `ctxFixture`'s returned object, after `locale: 'id',`:

```ts
    clock: CLOCK,
```

In `scripts/smoke-llm.ts`, inside `chatFixtureContext`'s returned object, after
`locale,`:

```ts
    /*
     * R1. **A FIXED CLOCK, LIKE EVERY OTHER FIXTURE HERE**, so two runs of the
     * smoke script differ in the sheet and in nothing else. Phase 2 renders it;
     * today it only has to exist.
     */
    clock: CHAT_CLOCK,
```

with the constant declared once beside `CHAT_NICKNAME`:

```ts
/**
 * The fixture querent's clock: **Friday 7 August 2026, 14.05 WIB, `midday`.** +420 is WIB,
 * which is where the reported bug happened; minutes EAST of UTC, so the browser's
 * `getTimezoneOffset()` reports the negative of it.
 *
 * **ONE CONSTANT FOR THE WHOLE SCRIPT.** Phase 2 renders it into `<waktu>` and into the
 * director's `SEKARANG:` line and passes it to both `buildWindow` calls; it declares no
 * `CHAT_UTC_OFFSET_MINUTES` of its own, because two fixture clocks is how the director and
 * the voice end up describing different afternoons in one printed run.
 */
const CHAT_CLOCK = resolveChatClock({
  offsetMinutes: 420,
  now: new Date('2026-08-07T07:05:00.000Z'),
});
```

with `const { resolveChatClock } = await import('@/lib/chat/clock');` added beside the
existing dynamic `buildChatPrompt` import in each of the two runners that build a context
(lines 2277 and 2797/3182), or a single top-level static import if the file has one — match
whichever idiom the surrounding runner already uses.

**Impact:** No behavioural change to the smoke output.

---

### Step 21: The assembler's ten integration call sites

**File:** `src/lib/chat/context.integration.test.ts:78` (the constant) and the ten
`localDate: TODAY,` lines (`:102`, `:128`, `:151`, `:174`, `:195`, `:254`, `:290`, `:338`,
`:360`, `:388`)
**Change:** Mechanical. Add beside `const TODAY = '2026-08-07';`:

```ts
/**
 * R1. The clock the assembler now takes instead of a bare `localDate`. Pinned to
 * Jakarta at 14:05 on `TODAY`, so `clock.localDate === TODAY` and the thirty-day
 * lookback floor every assertion below depends on does not move.
 */
const CLOCK = resolveChatClock({ offsetMinutes: 420, now: new Date(`${TODAY}T07:05:00.000Z`) });
```

with `import { resolveChatClock } from '@/lib/chat/clock';` in the import block, then
replace every occurrence of `localDate: TODAY,` with `clock: CLOCK,`.

**Impact:** Ten one-line edits; every existing assertion holds because
`CLOCK.localDate === TODAY`.

---

## Verification

**Build:**
```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck && npm run build
```
`npm run build` is not optional — the TypeScript trap means a green `typecheck` is not
evidence. If it dies on `@vercel/turbopack-next/internal/font/google/font`, that is the
AAAA-lookup trap: retry the build.

**Tests:**
```sh
npm test                      # unit; expect the two new files to add ~25 cases
npm run db:up && npm run test:integration
```
Run the two projects **separately** — `npm run test:all` fails 12–22 of V9's limiter tests
on a harness race and its red means nothing.

Targeted while iterating:
```sh
npm test -- utcoffset clock chatSurface prompt.test types.contract chat.contract
npm run test:integration -- queries/chat context
```

**Manual check:**
- `npm run dev`, open `/chat` in the browser, and confirm in DevTools → Network that all
  five chat requests carry `x-jm-utc-offset: 420` (or your own offset) beside
  `x-jm-local-date`. Then open `/history` and confirm the **badge poller's**
  `GET /api/chat/state` carries all three — that request is the defect.
- `npm run db:studio`, `chat_threads`: `utc_offset_minutes` is populated for the dev user
  after one message and after one badge poll, and does **not** flip to null on subsequent
  polls.
- `npm run smoke -- --chat` — **the output must be byte-comparable in shape to before this
  phase.** Nothing is rendered from the clock yet; a `<waktu>` block appearing here means
  phase 2 work leaked in.

**Exit criteria:**
1. The offset round-trips browser → `x-jm-utc-offset` → `parseUtcOffset` →
   `chat_threads.utc_offset_minutes` → `threadOffsetMinutes` → `resolveChatClock` →
   `DirectorInput.clock` / `VoiceInput.clock` / `ChatContext.clock`.
2. `grep -rn "new Date().toISOString().slice(0, 10)" src/lib/chat/direct/prompt.ts
   src/lib/chat/voices/prompt.ts` returns nothing.
3. `grep -n "LOCAL_DATE_HEADER" src/components/ChatButton.tsx` returns a hit.
4. An absent, malformed or out-of-range header yields `offsetMinutes: null` — never `0`,
   never `NaN` — and a `known: false` clock whose `localDate` equals what the code
   fabricated before this phase.
5. No prompt string, no prompt output and no `chatPromptVersion` value has changed.

## Handoffs

- **Phase 2** renders the clock: the `<waktu>` fenced block in the voice prompt, the
  director's header line, the widened `ageBucket` vocabulary and the `nanti`/`tadi` rule.
  It consumes `ChatContext.clock`, `DirectorInput.clock` and `VoiceInput.clock` as declared
  here, and it owns **both `known` arms** — an absent offset must render no clock at all
  rather than a UTC one. `buildChatPrompt` already takes an injected `now`
  (`build.ts:511`), which is the instant to pair with `clock.offsetMinutes` if a *"posted
  N minutes ago"* line is ever wanted.
- **Phase 8** owns quiet hours. `threadOffsetMinutes(db, userId)` is the read it needs, and
  `resolveChatClock({ offsetMinutes }).minutesOfDay` is the number `inQuietHours` wants.
  Its exit criterion — *a null offset means "not quiet" rather than "blocked"* — is exactly
  the `known: false` arm. The state route already writes the offset **before**
  `proactiveTick` runs in the same `after()`, so the mint sees this request's value.
- **Phase 7's** time-anchored material kind gets its weekday and its part-of-day from the
  same `ChatClock`. It imports `WEEKDAYS`, `DAY_PARTS`, `weekdayOf` and `resolveChatClock`
  from `clock.ts` and declares **no** calendar helper of its own — its `localStampFor` /
  `LocalStamp` / `civilFromDays` are cancelled by the reconciliation, because
  `resolveChatClock({ offsetMinutes, now })` already answers `localDate` and `part`.
  `proactiveTick`'s signature is untouched here; phase 7 resolves the clock inside `mint.ts`
  from the thread row it already reads.
- **`src/lib/chat/proactive/brief.ts:207`'s** `now.toISOString().slice(0, 10)` is
  **deliberately left alone.** It is the right-hand bound of a frequency window and renders
  no date to anybody, so the permission the two prompt builders lost has not expired here.
  It is worth revisiting in **phase 7**, which is the phase that gives that file new
  material kinds and may make it render a day.
- **The advance route keeps ignoring `x-jm-local-date`, and that is now correct** rather
  than an omission: the engine derives the day from the offset, and with no offset it falls
  back to the same UTC day the route would have produced. Nothing needs to change there.
- **No `CLAUDE.md` edit is proposed by this phase.** The rule it would add — *the browser
  reports a clock and `chat_threads.utc_offset_minutes` is read* — belongs with phase 2's
  reversal of the no-clock ruling, and `CLAUDE.md`'s net-neutral rule means the two should
  land as one edit rather than two. Phase 2 should note that `[R17]`'s *"nothing reads it
  yet"* is closed here.

## Rollback

`git revert` the phase's commit. Nothing is forward-only: no migration, no new event
**name**, no new environment variable, no flag. The `chat_threads.utc_offset_minutes`
values already written are simply unread again, exactly as they were before the phase — the
column has been nullable and ignorable since `0014`. The one thing to check on a revert is
that `chat.message_sent` rows carrying the `clock` prop remain readable: `sanitizeProps`
keeps unknown scalars out of nothing, and every consumer of `events.props` reads by key, so
an extra key in historic rows is inert.
