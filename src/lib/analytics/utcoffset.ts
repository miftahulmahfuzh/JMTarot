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
 *
 * **THE `=== 0` BRANCH IS NOT DEFENSIVE PADDING, IT IS THE REASON `SHAPE`
 * REFUSES `-0`.** Negating `getTimezoneOffset()`'s `0` yields `-0`, so in UTC
 * this function's naive form emits the one value the parser is written to
 * reject -- and it does so *invisibly*, because `String(-0)` is `'0'` and the
 * wire looks correct. It surfaces on the JS side instead, where `Object.is(-0,
 * 0)` is false: a stored `-0` compares unequal to a fresh `0` in the state
 * route's `movedOffset` check, so London would write its offset on every single
 * badge poll for ever. Normalised here, at the one producer, so the parser's
 * refusal stays a refusal of junk rather than of our own client.
 */
export function localUtcOffsetMinutes(date: Date = new Date()): number {
  const minutes = -date.getTimezoneOffset();
  return minutes === 0 ? 0 : minutes;
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
