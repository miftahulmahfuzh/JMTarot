/**
 * `[F5-2]`'s whole justification, cashed in. **Every gate, every refusal, and the
 * ORDER.**
 *
 * *"A heuristic is allowed to fail a build; it is not allowed to fail a person"* —
 * `tally.ts`'s ruling. A false positive in this predicate is a reader messaging somebody
 * at a moment that reads as tone-deaf, and there is no undo in a group chat. The only
 * way that risk is payable is if every branch is enumerated here, **with a fake clock**,
 * at the boundaries: the run at exactly `minGap`, the run on the day the counter rolls
 * over, the run for an account inside its erasure grace.
 */
import { describe, expect, it } from 'vitest';

import {
  checkEligibility,
  inQuietHours,
  REFUSAL_ORDER,
  type EligibilityInput,
  type ThreadState,
} from './eligibility';

const NOW = new Date('2026-08-07T12:00:00.000Z');
const TODAY = '2026-08-07';

/** A room in perfect health: opened, quiet for a day, nothing in flight. */
function thread(over: Partial<ThreadState> = {}): ThreadState {
  return {
    lastReadAt: new Date('2026-08-06T09:00:00.000Z'),
    lastUserMessageAt: new Date('2026-08-06T09:00:00.000Z'),
    lastReaderMessageAt: new Date('2026-08-06T09:05:00.000Z'),
    lastProactiveAt: null,
    proactiveCountToday: 0,
    proactiveCountDate: null,
    openRun: false,
    erased: false,
    ...over,
  };
}

function input(over: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    source: 'tick',
    thread: thread(),
    localDate: TODAY,
    enabled: true,
    hasMaterial: true,
    materialKind: 'reading',
    minGapSeconds: 10_800,
    maxPerDay: 2,
    quietHours: null,
    now: NOW,
    ...over,
  };
}

function refusal(over: Partial<EligibilityInput>): string | null {
  const r = checkEligibility(input(over));
  return r.ok ? null : r.reason;
}

describe('checkEligibility — the gates', () => {
  it('passes a healthy room', () => {
    const r = checkEligibility(input());
    expect(r).toEqual({ ok: true, trigger: 'idle_nudge', countedDay: TODAY, resetCounter: true });
  });

  it('refuses when either flag is off (C-D15)', () => {
    expect(refusal({ enabled: false })).toBe('flag_off');
  });

  it('never mints for a soft-deleted account ([F5-15])', () => {
    /*
     * The thirty-day grace exists so somebody can change their mind. **There is no
     * version of a friendly nudge from Thessaly to a person who pressed delete that
     * reads well.**
     */
    expect(refusal({ thread: thread({ erased: true }) })).toBe('erased');
  });

  it('refuses while a run is in flight (C-R5 makes beats serial)', () => {
    expect(refusal({ thread: thread({ openRun: true }) })).toBe('open_run');
  });

  it('lets the reading and the tick seed a never-opened room, and refuses the cron (§4.7)', () => {
    const never = thread({ lastReadAt: null, lastUserMessageAt: null, lastReaderMessageAt: null });
    /* They are in the app right now, or they just did something. */
    expect(refusal({ source: 'reading', thread: never })).toBeNull();
    expect(refusal({ source: 'tick', thread: never })).toBeNull();
    /* The one source with nobody present. A message arriving overnight into a room they
     * have never seen is the app cold-calling them. */
    expect(refusal({ source: 'cron', thread: never })).toBe('never_opened');
  });
});

describe('the gap ([F5-12])', () => {
  it('refuses a tick inside the gap and admits one exactly at it', () => {
    const busy = thread({ lastReaderMessageAt: new Date(NOW.getTime() - 3_600_000) });
    expect(refusal({ thread: busy })).toBe('gap');

    /* THE BOUNDARY, which is the whole reason the clock is injected. */
    const exactly = thread({
      lastUserMessageAt: new Date(NOW.getTime() - 10_800_000),
      lastReaderMessageAt: new Date(NOW.getTime() - 10_800_000),
    });
    expect(refusal({ thread: exactly })).toBeNull();
    const oneMsShort = thread({
      lastUserMessageAt: new Date(NOW.getTime() - 10_799_999),
      lastReaderMessageAt: null,
    });
    expect(refusal({ thread: oneMsShort })).toBe('gap');
  });

  it('exempts a finished reading entirely, and only a finished reading', () => {
    /*
     * The gap exists to stop a reader filling dead air. A finished reading is not dead
     * air — **making Adrian wait three hours to react to a reading taken three minutes
     * ago is the feature not working.**
     */
    const justSpoke = thread({ lastReaderMessageAt: new Date(NOW.getTime() - 60_000) });
    expect(refusal({ source: 'reading', thread: justSpoke })).toBeNull();
    expect(refusal({ source: 'tick', thread: justSpoke })).toBe('gap');
    expect(refusal({ source: 'cron', thread: justSpoke })).toBe('gap');
  });

  it('measures all three timestamps, not just the last proactive one', () => {
    /* A room that was busy ten minutes ago does not need somebody to break the silence. */
    const quietExceptTheQuerent = thread({
      lastUserMessageAt: new Date(NOW.getTime() - 600_000),
      lastReaderMessageAt: null,
      lastProactiveAt: null,
    });
    expect(refusal({ thread: quietExceptTheQuerent })).toBe('gap');

    const quietExceptAProactive = thread({
      lastUserMessageAt: null,
      lastReaderMessageAt: null,
      lastProactiveAt: new Date(NOW.getTime() - 600_000),
    });
    expect(refusal({ thread: quietExceptAProactive })).toBe('gap');
  });
});

describe('the daily cap ([F5-3], [F5-13])', () => {
  it('refuses at the cap and rolls the counter over on a new day', () => {
    const spent = thread({ proactiveCountToday: 2, proactiveCountDate: TODAY });
    expect(refusal({ thread: spent })).toBe('daily_cap');

    /*
     * **THE ROLLOVER, AND THE FIXTURE IS A STRING.** `proactive_count_date` is the
     * QUERENT'S calendar day: a `Date` renders in the server's zone and is a day out for
     * anyone in Jakarta between midnight and 07:00. This case fails to compile if the
     * parameter type is ever widened to accept a `Date`, which is the point of it.
     */
    const yesterday = thread({ proactiveCountToday: 9, proactiveCountDate: '2026-08-06' });
    const r = checkEligibility(input({ thread: yesterday }));
    expect(r).toEqual({ ok: true, trigger: 'idle_nudge', countedDay: TODAY, resetCounter: true });
  });

  it('does not reset for a same-day counter under the cap', () => {
    const r = checkEligibility(
      input({ thread: thread({ proactiveCountToday: 1, proactiveCountDate: TODAY }) }),
    );
    expect(r).toEqual({ ok: true, trigger: 'idle_nudge', countedDay: TODAY, resetCounter: false });
  });

  it('compares the day as a STRING and never parses it', () => {
    /*
     * `'2026-8-07'` is the same DAY and a different STRING, and the predicate must treat
     * it as a different day rather than quietly agreeing. That is the safe direction —
     * `answersUpdatedAt`'s bug was a comparison that coerced and answered *something*.
     */
    const oddlyFormatted = thread({ proactiveCountToday: 2, proactiveCountDate: '2026-8-07' });
    expect(refusal({ thread: oddlyFormatted })).toBeNull();
  });
});

describe('no material (C-N2e)', () => {
  it('refuses last, after every other gate has passed', () => {
    expect(refusal({ hasMaterial: false, materialKind: null })).toBe('no_material');
  });

  it('is the LAST branch, which is what makes §4.6 probe sound', () => {
    /*
     * `mint.ts` calls the predicate once with `hasMaterial: true` to learn whether
     * anything *else* refuses, and pays for detection only if nothing did. **Reordering
     * the branches would make the probe pass a run the real call would refuse**, so the
     * order is a contract and this asserts it by name.
     */
    expect(REFUSAL_ORDER[REFUSAL_ORDER.length - 1]).toBe('no_material');
    expect([...REFUSAL_ORDER]).toEqual([
      'flag_off',
      'erased',
      'open_run',
      'never_opened',
      'quiet_hours',
      'gap',
      'daily_cap',
      'no_material',
    ]);
  });

  it('refuses every earlier gate even when there IS material', () => {
    /* The probe is only sound if the cheap gates do not depend on the material. */
    for (const over of [
      { enabled: false },
      { thread: thread({ erased: true }) },
      { thread: thread({ openRun: true }) },
    ]) {
      expect(refusal({ ...over, hasMaterial: true })).not.toBe('no_material');
    }
  });
});

describe('the trigger a mint writes (§6.2)', () => {
  it('is the entry point for a reading and for the cron', () => {
    const reading = checkEligibility(input({ source: 'reading', materialKind: 'reading' }));
    expect(reading.ok && reading.trigger).toBe('reading_completed');
    const cron = checkEligibility(input({ source: 'cron', materialKind: 'occasion' }));
    expect(cron.ok && cron.trigger).toBe('cron');
  });

  it('depends on the MATERIAL for a tick, because chat_runs.trigger says what happened', () => {
    /*
     * `/admin/chat` groups by this column, so it must say what happened rather than which
     * entry point ran. A tick that found an unanswered reader question is an `unanswered`
     * run; a tick that found anything else is an `idle_nudge`.
     */
    const ask = checkEligibility(input({ source: 'tick', materialKind: 'unanswered' }));
    expect(ask.ok && ask.trigger).toBe('unanswered');
    for (const kind of ['reading', 'orphan', 'recurring', 'occasion', 'lotus'] as const) {
      const r = checkEligibility(input({ source: 'tick', materialKind: kind }));
      expect(r.ok && r.trigger).toBe('idle_nudge');
    }
  });
});

describe('inQuietHours (§5, dead under [R17] and tested anyway)', () => {
  it('answers false when nobody has told us the zone', () => {
    /*
     * The only alternative — *"do not mint"* — silences the feature for everybody until
     * a header ships and every querent returns, which is a bigger outage than the thing
     * it prevents.
     */
    expect(inQuietHours(NOW, { fromHour: 22, toHour: 7, offsetMinutes: null })).toBe(false);
  });

  it('wraps midnight, which is the normal shape of a quiet window', () => {
    const wib = 7 * 60;
    /* 12:00 UTC is 19:00 WIB — awake. */
    expect(inQuietHours(NOW, { fromHour: 22, toHour: 7, offsetMinutes: wib })).toBe(false);
    /* 18:00 UTC is 01:00 WIB — inside a window that wrapped. */
    const oneAm = new Date('2026-08-07T18:00:00.000Z');
    expect(inQuietHours(oneAm, { fromHour: 22, toHour: 7, offsetMinutes: wib })).toBe(true);
    /* 15:00 UTC is 22:00 WIB — the inclusive edge. */
    const tenPm = new Date('2026-08-07T15:00:00.000Z');
    expect(inQuietHours(tenPm, { fromHour: 22, toHour: 7, offsetMinutes: wib })).toBe(true);
    /* 00:00 UTC is 07:00 WIB — the exclusive edge. */
    const sevenAm = new Date('2026-08-08T00:00:00.000Z');
    expect(inQuietHours(sevenAm, { fromHour: 22, toHour: 7, offsetMinutes: wib })).toBe(false);
  });

  it('handles a non-wrapping window and a negative offset', () => {
    /* 12:00 UTC is 05:00 in Los Angeles (UTC-7). */
    expect(inQuietHours(NOW, { fromHour: 1, toHour: 9, offsetMinutes: -420 })).toBe(true);
    expect(inQuietHours(NOW, { fromHour: 9, toHour: 17, offsetMinutes: -420 })).toBe(false);
  });

  it('refuses through the predicate when a window is supplied', () => {
    expect(
      refusal({ quietHours: { fromHour: 0, toHour: 23, offsetMinutes: 0 } }),
    ).toBe('quiet_hours');
  });
});

describe('the clock is injected and nothing here reads one', () => {
  it('gives the same answer for the same inputs, whenever it is run', () => {
    /*
     * `[F5-2]`'s failure mode: a predicate that reads the clock at call time is
     * untestable at the boundaries, **and the boundaries are the whole feature.** The
     * source-level guarantee is that `new Date()` appears nowhere in the module; this is
     * the behavioural half.
     */
    const past = checkEligibility(input({ now: new Date('2026-08-07T11:59:59.999Z') }));
    const future = checkEligibility(input({ now: new Date('2027-01-01T00:00:00.000Z') }));
    expect(past.ok).toBe(true);
    expect(future.ok).toBe(true);
  });
});
