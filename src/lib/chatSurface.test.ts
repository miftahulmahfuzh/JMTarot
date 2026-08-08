import { describe, expect, it } from 'vitest';

import type { AdvanceReply, ChatMessageDto } from '@/lib/chat/types';
import {
  ANCHOR_THRESHOLD_PX,
  BUSY_RETRY_MS,
  advanceStep,
  appendMessages,
  dayKeyOf,
  groupByDay,
  optimisticMessage,
  prependMessages,
  previousDayKey,
  quoteFor,
  settleOptimistic,
  shouldStickToBottom,
  typingReader,
  type LoopState,
} from './chatSurface';

/**
 * Loop 1 for the whole chat surface. **This file is green before the screen
 * exists**, which is `swipeDeck.ts`'s discipline: the component is the thin part.
 *
 * Every row of F4 §3.2's table is one call and one assertion, and the three that
 * matter are named in `advanceStep`'s header: a timeout retries ONCE and keeps the
 * run id, a `!ok` does NOT retry, and a shed reply lands in `stopped` rather than
 * in `settled` so the next `state` call picks the run up.
 */

const NOW = 1_800_000_000_000;

function msg(over: Partial<ChatMessageDto> = {}): ChatMessageDto {
  return {
    id: 'm1',
    author: 'thessaly',
    body: 'kamu masih kepikiran yang kemarin itu, mif?',
    locale: 'id',
    replyToMessageId: null,
    replyTo: null,
    attachedReadingId: null,
    runId: 'r1',
    beatIndex: 0,
    intent: 'ask',
    createdAt: new Date(NOW).toISOString(),
    ...over,
  };
}

/** Local midnight on a given day, as the ISO instant a route would return. */
function atLocal(y: number, m: number, d: number, h = 12): string {
  return new Date(y, m - 1, d, h).toISOString();
}

describe('advanceStep — the run', () => {
  it('starts driving only when `state` reports a pending run', () => {
    expect(advanceStep({ kind: 'idle' }, { type: 'loaded', pendingRun: false, runId: null })).toEqual(
      { kind: 'idle' },
    );
    expect(advanceStep({ kind: 'idle' }, { type: 'loaded', pendingRun: true, runId: 'r1' })).toEqual({
      kind: 'advancing',
      runId: 'r1',
      retried: false,
    });
  });

  it('holds the server-declared delay after a plan, and names the reader', () => {
    const reply: AdvanceReply = {
      state: 'planned',
      runId: 'r1',
      next: { reader: 'margaret', delayMs: 2400 },
      done: false,
    };
    const next = advanceStep({ kind: 'advancing', runId: 'r1', retried: false }, {
      type: 'reply',
      reply,
      nowMs: NOW,
    });
    expect(next).toEqual({
      kind: 'waiting',
      runId: 'r1',
      reader: 'margaret',
      untilMs: NOW + 2400,
    });
    // `C-R4`, seam S3: the number is the SERVER's and the client only waits it out.
    expect(typingReader(next)).toBe('margaret');
  });

  it('waits again after a bubble, and settles when the reply says done', () => {
    const spoke = (done: boolean, next: { reader: 'adrian'; delayMs: number } | null): AdvanceReply => ({
      state: 'spoke',
      runId: 'r1',
      messages: [msg()],
      next,
      done,
    });

    expect(
      advanceStep({ kind: 'advancing', runId: 'r1', retried: false }, {
        type: 'reply',
        reply: spoke(false, { reader: 'adrian', delayMs: 900 }),
        nowMs: NOW,
      }),
    ).toEqual({ kind: 'waiting', runId: 'r1', reader: 'adrian', untilMs: NOW + 900 });

    expect(
      advanceStep({ kind: 'advancing', runId: 'r1', retried: false }, {
        type: 'reply',
        reply: spoke(true, null),
        nowMs: NOW,
      }),
    ).toEqual({ kind: 'settled' });
  });

  it('treats `silent` as a settled run and renders nothing (C-R6)', () => {
    // The director said nobody replies. That is a GOOD outcome and one of the
    // strongest naturalness signals in the release, not a failure.
    const next = advanceStep({ kind: 'advancing', runId: 'r1', retried: false }, {
      type: 'reply',
      reply: { state: 'silent', runId: 'r1', done: true },
      nowMs: NOW,
    });
    expect(next).toEqual({ kind: 'settled' });
    expect(typingReader(next)).toBeNull();
  });

  it('waits out `busy` WITHOUT naming a reader (C-R3)', () => {
    const next = advanceStep({ kind: 'advancing', runId: 'r1', retried: false }, {
      type: 'reply',
      reply: { state: 'busy', runId: 'r1', done: false },
      nowMs: NOW,
    });
    expect(next).toEqual({ kind: 'waiting', runId: 'r1', reader: null, untilMs: NOW + BUSY_RETRY_MS });
    // Naming a reader here would be a lie: another tab is writing that beat.
    expect(typingReader(next)).toBeNull();
  });

  it('lands `shed` in stopped, NOT in settled, and never retries it', () => {
    /*
     * `C-D6` consequence 3, and `[F1-6]`: the run is left `running` with beats
     * remaining and is picked up later. `settled` would say the run is finished, and
     * a retry would be a client hammering a budget that is already out.
     */
    const shed = advanceStep({ kind: 'advancing', runId: 'r1', retried: false }, {
      type: 'reply',
      reply: { state: 'shed', runId: 'r1', done: false },
      nowMs: NOW,
    });
    expect(shed).toEqual({ kind: 'stopped', reason: 'shed' });
    // Terminal for this mount: nothing but a fresh `state` call restarts it.
    expect(advanceStep(shed, { type: 'delay_elapsed' })).toBe(shed);
    expect(advanceStep(shed, { type: 'advance_failed', reason: 'timeout' })).toBe(shed);
    expect(advanceStep(shed, { type: 'loaded', pendingRun: true, runId: 'r1' })).toEqual({
      kind: 'advancing',
      runId: 'r1',
      retried: false,
    });
  });

  it('retries a TIMEOUT exactly once, keeping the run id', () => {
    const first = advanceStep({ kind: 'advancing', runId: 'r1', retried: false }, {
      type: 'advance_failed',
      reason: 'timeout',
    });
    expect(first).toEqual({ kind: 'advancing', runId: 'r1', retried: true });

    // Twice is not a retry policy, it is a loop.
    expect(advanceStep(first, { type: 'advance_failed', reason: 'timeout' })).toEqual({
      kind: 'stopped',
      reason: 'failed',
    });
  });

  it('does NOT retry an error, because an error is an answer', () => {
    expect(
      advanceStep({ kind: 'advancing', runId: 'r1', retried: false }, {
        type: 'advance_failed',
        reason: 'error',
      }),
    ).toEqual({ kind: 'stopped', reason: 'failed' });
  });

  it('advances when the held delay elapses', () => {
    expect(
      advanceStep({ kind: 'waiting', runId: 'r1', reader: 'thessaly', untilMs: NOW }, {
        type: 'delay_elapsed',
      }),
    ).toEqual({ kind: 'advancing', runId: 'r1', retried: false });
  });

  it('keeps the run id across offline and resumes it on online', () => {
    const off = advanceStep({ kind: 'waiting', runId: 'r7', reader: 'adrian', untilMs: NOW }, {
      type: 'offline',
    });
    expect(off).toEqual({ kind: 'offline', runId: 'r7' });
    expect(advanceStep(off, { type: 'online' })).toEqual({
      kind: 'advancing',
      runId: 'r7',
      retried: false,
    });
    // Offline with nothing in flight comes back to nothing in flight.
    expect(advanceStep({ kind: 'offline', runId: null }, { type: 'online' })).toEqual({
      kind: 'idle',
    });
  });

  it('drops a held delay when the tab is hidden, because setTimeout is throttled there', () => {
    expect(
      advanceStep({ kind: 'waiting', runId: 'r1', reader: 'margaret', untilMs: NOW }, {
        type: 'hidden',
      }),
    ).toEqual({ kind: 'idle' });
    expect(advanceStep({ kind: 'advancing', runId: 'r1', retried: false }, { type: 'hidden' })).toEqual(
      { kind: 'idle' },
    );
    // Nothing to cancel: leave the state alone rather than resetting `settled`.
    expect(advanceStep({ kind: 'settled' }, { type: 'hidden' })).toEqual({ kind: 'settled' });
  });
});

describe('advanceStep — the composer, mid-run (Q-F4-3)', () => {
  it('never interrupts a run in flight', () => {
    /*
     * The composer stays enabled while somebody is typing, because blocking it for
     * twenty seconds is the most chatbot-like thing available here. A send therefore
     * must not clobber `advancing` or `waiting` — the engine serialises the runs.
     */
    const advancing: LoopState = { kind: 'advancing', runId: 'r1', retried: false };
    const waiting: LoopState = { kind: 'waiting', runId: 'r1', reader: 'thessaly', untilMs: NOW };
    for (const state of [advancing, waiting]) {
      expect(advanceStep(state, { type: 'send' })).toBe(state);
      expect(advanceStep(state, { type: 'sent', runId: 'r2' })).toBe(state);
      expect(advanceStep(state, { type: 'sent', runId: null })).toBe(state);
    }
  });

  it('drives the run the route returns when nothing is in flight', () => {
    expect(advanceStep({ kind: 'idle' }, { type: 'send' })).toEqual({ kind: 'posting' });
    expect(advanceStep({ kind: 'posting' }, { type: 'sent', runId: 'r9' })).toEqual({
      kind: 'advancing',
      runId: 'r9',
      retried: false,
    });
  });

  it('goes quiet rather than looping when CHAT_ENABLED=0 mints no run', () => {
    // `[F1-19]`: the message IS stored, so this is not a failure — there is simply
    // nothing to drive, and the bubble stays where it is.
    expect(advanceStep({ kind: 'posting' }, { type: 'sent', runId: null })).toEqual({ kind: 'idle' });
  });

  it('returns to idle on a send failure — the COMPOSER speaks, not the loop', () => {
    expect(advanceStep({ kind: 'posting' }, { type: 'send_failed' })).toEqual({ kind: 'idle' });
  });
});

describe('shouldStickToBottom', () => {
  it('sticks at the threshold and one pixel under it, and lets go one over', () => {
    expect(shouldStickToBottom(ANCHOR_THRESHOLD_PX)).toBe(true);
    expect(shouldStickToBottom(ANCHOR_THRESHOLD_PX - 1)).toBe(true);
    expect(shouldStickToBottom(ANCHOR_THRESHOLD_PX + 1)).toBe(false);
  });

  it('treats a rubber-banded negative distance as the bottom', () => {
    // iOS reports one at the edge; `panelIndexAt`'s clamp is the precedent.
    expect(shouldStickToBottom(-30)).toBe(true);
  });

  it('takes an explicit threshold, so the harness can measure a different one', () => {
    expect(shouldStickToBottom(60, 100)).toBe(true);
    expect(shouldStickToBottom(120, 100)).toBe(false);
  });
});

describe('groupByDay', () => {
  it('returns the messages ungrouped until the querent’s day is known (F4-15)', () => {
    const rows = groupByDay([msg({ id: 'a' }), msg({ id: 'b' })], null);
    expect(rows.map((r) => r.kind)).toEqual(['message', 'message']);
  });

  it('opens a separator at every day change and labels today and yesterday', () => {
    const today = dayKeyOf(atLocal(2026, 8, 8));
    const rows = groupByDay(
      [
        msg({ id: 'a', createdAt: atLocal(2026, 8, 6, 21) }),
        msg({ id: 'b', createdAt: atLocal(2026, 8, 7, 9) }),
        msg({ id: 'c', createdAt: atLocal(2026, 8, 7, 23) }),
        msg({ id: 'd', createdAt: atLocal(2026, 8, 8, 8) }),
      ],
      today,
    );

    expect(rows.map((r) => (r.kind === 'day' ? `day:${r.relative}` : r.message.id))).toEqual([
      'day:null',
      'a',
      'day:yesterday',
      'b',
      'c',
      'day:today',
      'd',
    ]);
  });

  it('crosses midnight in the DEVICE’s zone, not UTC', () => {
    /*
     * The `local_date` trap, in the one place on this screen it can still bite.
     * 23:30 and 00:30 local are different days however the instants serialise; a
     * `toISOString().slice(0, 10)` implementation would put both on one day for
     * anyone east of Greenwich, which is a third of every Jakarta evening.
     */
    const late = atLocal(2026, 8, 7, 23);
    const early = atLocal(2026, 8, 8, 0);
    expect(dayKeyOf(late)).not.toEqual(dayKeyOf(early));

    const rows = groupByDay([msg({ id: 'late', createdAt: late }), msg({ id: 'early', createdAt: early })], dayKeyOf(early));
    expect(rows.filter((r) => r.kind === 'day')).toHaveLength(2);
  });

  it('walks back over a month and a year boundary', () => {
    expect(previousDayKey('2026-08-01')).toBe('2026-07-31');
    expect(previousDayKey('2026-01-01')).toBe('2025-12-31');
    expect(previousDayKey('2024-03-01')).toBe('2024-02-29'); // a leap year, by construction
  });
});

describe('quoteFor', () => {
  const byId = new Map<string, ChatMessageDto>([['m1', msg({ id: 'm1', body: 'gatau mau mulai dari mana' })]]);

  it('renders nothing when the message quotes nothing', () => {
    expect(quoteFor(msg({ id: 'x' }), byId)).toBeNull();
  });

  it('prefers the loaded message over the inlined stub', () => {
    const q = quoteFor(
      msg({
        id: 'x',
        replyToMessageId: 'm1',
        replyTo: { id: 'm1', author: 'thessaly', snippet: 'gatau mau…' },
      }),
      byId,
    );
    expect(q).toEqual({ id: 'm1', author: 'thessaly', text: 'gatau mau mulai dari mana' });
  });

  it('falls back to the inlined stub when the quoted message is off the page', () => {
    /*
     * `[R10]`, and the reason the route inlines it at all: a page is 40 rows, and
     * `C-D11`'s whole point is a beat quoting an hour-old message. Without this the
     * release's most distinctive mechanic renders as nothing.
     */
    const q = quoteFor(
      msg({
        id: 'x',
        replyToMessageId: 'old',
        replyTo: { id: 'old', author: 'user', snippet: 'yang kemarin itu' },
      }),
      byId,
    );
    expect(q).toEqual({ id: 'old', author: 'user', text: 'yang kemarin itu' });
  });

  it('resolves the querent’s own message as the quote target', () => {
    const mine = msg({ id: 'me', author: 'user', body: 'iya. gatau mau mulai dari mana' });
    const q = quoteFor(msg({ id: 'x', replyToMessageId: 'me' }), new Map([['me', mine]]));
    expect(q?.author).toBe('user');
  });

  it('clamps a long body and flattens its newlines', () => {
    const long = msg({ id: 'l', body: `${'a'.repeat(400)}\n\nmore` });
    const q = quoteFor(msg({ id: 'x', replyToMessageId: 'l' }), new Map([['l', long]]));
    expect(q!.text.length).toBeLessThanOrEqual(121);
    expect(q!.text).not.toContain('\n');
  });
});

describe('the optimistic bubble', () => {
  const base = {
    clientKey: 'ck-1',
    body: 'iya. gatau mau mulai dari mana',
    locale: 'id' as const,
    replyTo: null,
    attachedReadingId: null,
    createdAt: new Date(NOW).toISOString(),
  };

  it('is keyed by the CLIENT KEY, which is also the idempotency key', () => {
    // Reusing it as the React key means the swap from optimistic to stored replaces
    // the element rather than appending beside it.
    expect(optimisticMessage(base).id).toBe('ck-1');
    expect(optimisticMessage(base).author).toBe('user');
  });

  it('belongs to no run, which is what insertMessage enforces server-side', () => {
    const m = optimisticMessage(base);
    expect([m.runId, m.beatIndex, m.intent]).toEqual([null, null, null]);
  });

  it('carries its own quote stub so the reply renders before the POST returns', () => {
    const target = msg({ id: 'm1', author: 'margaret', body: 'mulai dari yang paling kecil.' });
    const m = optimisticMessage({ ...base, replyTo: target });
    expect(m.replyToMessageId).toBe('m1');
    expect(m.replyTo).toEqual({ id: 'm1', author: 'margaret', snippet: 'mulai dari yang paling kecil.' });
  });

  it('is replaced in place by the stored row, and REMOVED by a refusal', () => {
    const list = [msg({ id: 'a' }), optimisticMessage(base)];
    const stored = msg({ id: 'server-id', author: 'user' });
    expect(settleOptimistic(list, 'ck-1', stored).map((m) => m.id)).toEqual(['a', 'server-id']);
    // `F4-14`: a refused message leaves the room entirely; `RefusalNotice` speaks.
    expect(settleOptimistic(list, 'ck-1', null).map((m) => m.id)).toEqual(['a']);
  });
});

describe('appending and prepending', () => {
  it('ignores a bubble the list already holds', () => {
    // `F4-12`'s retry can deliver a beat whose row the timed-out attempt already
    // wrote. The server's `beats_done` decides; the client must not double-render.
    const list = [msg({ id: 'a' }), msg({ id: 'b' })];
    expect(appendMessages(list, [msg({ id: 'b' }), msg({ id: 'c' })]).map((m) => m.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('puts an older page in front, without duplicating the boundary row', () => {
    const list = [msg({ id: 'c' }), msg({ id: 'd' })];
    expect(prependMessages(list, [msg({ id: 'a' }), msg({ id: 'c' })]).map((m) => m.id)).toEqual([
      'a',
      'c',
      'd',
    ]);
  });
});
