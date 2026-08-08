/**
 * `/admin/chat`'s folds, against literals, with no database. **F7, v0.7.0.**
 *
 * Loop 1 is where every arithmetic edge on this page lives: the reply rate is the
 * release's own scorecard, and the three `null`-not-zero rules below are the ones that
 * would otherwise manufacture a finding on an empty range.
 */
import { describe, expect, it } from 'vitest';
import { BEAT_INTENTS } from '@/lib/chat/types';
import {
  beatFold,
  castFold,
  healthFold,
  intentFold,
  latencyFold,
  replyFold,
  runFold,
  tokenFold,
} from './series';
import { INTENT_ORDER } from './slots';

const RANGE = { from: '2026-08-01', to: '2026-08-03' };

describe('replyFold -- the scorecard', () => {
  it('sums across triggers and rates over settled runs only', () => {
    const fold = replyFold([
      { trigger: 'idle_nudge', delivered: 4, replied: 1, pending: 2 },
      { trigger: 'cron', delivered: 6, replied: 4, pending: 0 },
    ]);
    expect(fold.delivered).toBe(10);
    expect(fold.replied).toBe(5);
    expect(fold.pending).toBe(2);
    expect(fold.rate).toBe(0.5);
    // The pending runs are in NEITHER the numerator nor the denominator ([F7-3]).
    expect(fold.rate).not.toBe(5 / 12);
  });

  it('returns a NULL rate for an empty range, never 0%', () => {
    // `periodDelta`'s rule. `0%` reads as "nobody ever answers"; the truth is "nothing
    // has settled yet", and an operator would act on the first.
    expect(replyFold([]).rate).toBeNull();
    expect(replyFold([{ trigger: 'cron', delivered: 0, replied: 0, pending: 3 }]).rate).toBeNull();
  });

  it('orders rows by TRIGGER_ORDER and drops user_message', () => {
    const fold = replyFold([
      { trigger: 'cron', delivered: 1, replied: 0, pending: 0 },
      { trigger: 'reading_completed', delivered: 1, replied: 1, pending: 0 },
      // The query already excludes it; this is the belt. A reactive run is not
      // proactive and would put the thing the querent asked for in the scorecard.
      { trigger: 'user_message', delivered: 99, replied: 99, pending: 0 },
    ]);
    expect(fold.rows.map((r) => r.trigger)).toEqual(['reading_completed', 'cron']);
    expect(fold.delivered).toBe(2);
  });

  it('renders no row for a trigger that fired nothing', () => {
    // M14: render nothing until there is something. A zero-length bar under a trigger
    // nobody used is furniture wearing a label.
    expect(replyFold([{ trigger: 'cron', delivered: 2, replied: 1, pending: 0 }]).rows).toHaveLength(1);
  });
});

describe('runFold', () => {
  it('builds a dense series from the RANGE and splits reactive from proactive', () => {
    const fold = runFold(
      [
        { bucket: '2026-08-01', trigger: 'user_message', runs: 3 },
        { bucket: '2026-08-01', trigger: 'cron', runs: 1 },
        { bucket: '2026-08-03', trigger: 'idle_nudge', runs: 2 },
      ],
      RANGE.from,
      RANGE.to,
    );
    expect(fold.buckets).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    // The middle day has no runs at all: a 0, not a missing column.
    expect(fold.reactive).toEqual([3, 0, 0]);
    expect(fold.proactive).toEqual([1, 0, 2]);
    expect(fold.totals.cron).toBe(1);
    expect(fold.total).toBe(6);
  });

  it('drops a row outside the enumerated range rather than appending it', () => {
    const fold = runFold([{ bucket: '2026-07-31', trigger: 'cron', runs: 5 }], RANGE.from, RANGE.to);
    expect(fold.buckets).toHaveLength(3);
    expect(fold.total).toBe(0);
  });

  it('is empty for an unusable range rather than throwing', () => {
    expect(runFold([], '2026-08-30', '2026-08-01').buckets).toEqual([]);
  });
});

describe('beatFold -- the silence rate', () => {
  it('renders every bucket, including the ones with no runs', () => {
    /*
     * **A HISTOGRAM MISSING ITS `0` BAR READS AS NO DATA**, and the `0` bar is the one
     * the operator came for: `C-R6` makes a zero silence rate a finding rather than
     * good news.
     */
    const fold = beatFold([
      { bucket: 1, runs: 6 },
      { bucket: 3, runs: 2 },
    ]);
    expect(fold.buckets.map((b) => b.bucket)).toEqual([0, 1, 2, 3, 4]);
    expect(fold.buckets.map((b) => b.runs)).toEqual([0, 6, 0, 2, 0]);
    expect(fold.silence).toBe(0);
    expect(fold.total).toBe(8);
  });

  it('computes the silence rate over terminal runs', () => {
    const fold = beatFold([
      { bucket: 0, runs: 3 },
      { bucket: 2, runs: 7 },
    ]);
    expect(fold.silence).toBeCloseTo(0.3);
    expect(fold.mean).toBeCloseTo(1.4);
  });

  it('returns NULL for an empty range rather than a 0% silence rate', () => {
    // The one place on this page where 0 and null are most easily confused, because
    // 0% silence IS the finding and an empty range would fabricate it.
    const fold = beatFold([]);
    expect(fold.silence).toBeNull();
    expect(fold.mean).toBeNull();
  });
});

describe('castFold -- is anybody talking to anybody else?', () => {
  it('folds three targets per reader and drops a reader who never spoke', () => {
    const fold = castFold([
      { author: 'thessaly', target: 'querent', messages: 4 },
      { author: 'thessaly', target: 'reader', messages: 1 },
      { author: 'adrian', target: 'none', messages: 5 },
    ]);
    expect(fold.rows.map((r) => r.author)).toEqual(['thessaly', 'adrian']);
    expect(fold.rows[0]).toEqual({
      author: 'thessaly',
      querent: 4,
      reader: 1,
      none: 0,
      total: 5,
    });
    expect(fold.total).toBe(10);
    expect(fold.topShare).toBe(0.5);
    expect(fold.readerToReader).toBe(0.1);
  });

  it('reports reader-to-reader as ZERO when it happened and NULL when nothing did', () => {
    // Zero is a real and alarming measurement here — three monologues — and null is
    // "no bubbles at all". They must not render the same.
    expect(castFold([{ author: 'margaret', target: 'querent', messages: 3 }]).readerToReader).toBe(0);
    expect(castFold([]).readerToReader).toBeNull();
    expect(castFold([]).topShare).toBeNull();
  });

  it('drops an author with no slot rather than colouring it Other', () => {
    // `READER_SLOT` has three keys and `slotColor` throws above slot 3. A fourth
    // reader is a decision somebody makes on purpose, not a row that appears.
    const fold = castFold([{ author: 'nobody' as never, target: 'querent', messages: 9 }]);
    expect(fold.rows).toEqual([]);
    expect(fold.total).toBe(0);
  });
});

describe('intentFold -- C-N1ds ask rate', () => {
  it('orders by INTENT_ORDER, never by rank', () => {
    const fold = intentFold([
      { intent: 'tease', beats: 9 },
      { intent: 'answer', beats: 1 },
    ]);
    expect(fold.rows.map((r) => r.intent)).toEqual([...INTENT_ORDER]);
    expect(fold.total).toBe(10);
  });

  it('computes the ask share, and reports 0 rather than null when beats exist', () => {
    expect(intentFold([{ intent: 'ask', beats: 3 }, { intent: 'answer', beats: 1 }]).askShare).toBe(0.75);
    // A director that never uses `ask` is the finding; an empty range is not.
    expect(intentFold([{ intent: 'answer', beats: 4 }]).askShare).toBe(0);
    expect(intentFold([]).askShare).toBeNull();
  });

  it('keeps an unrecorded intent as its own row rather than dropping it', () => {
    /*
     * If `[R9]`'s `intent` key ever moved, EVERY beat would land here — visible, and
     * visibly wrong, which is a far better failure than a panel that quietly reads as
     * empty. An intent outside the union folds into the same row for the same reason.
     */
    const fold = intentFold([
      { intent: null, beats: 2 },
      { intent: 'gossip' as never, beats: 1 },
      { intent: 'answer', beats: 1 },
    ]);
    const unrecorded = fold.rows.find((r) => r.intent === null)!;
    expect(unrecorded.beats).toBe(3);
    expect(fold.rows).toHaveLength(INTENT_ORDER.length + 1);
  });

  it('renders no unrecorded row when every beat declared one', () => {
    expect(intentFold([{ intent: 'answer', beats: 1 }]).rows).toHaveLength(INTENT_ORDER.length);
  });

  it("INTENT_ORDER is exactly F1's union -- a seventh intent must not render as nothing", () => {
    // A copy of `BEAT_INTENTS` on purpose (this is a RENDER order, not the union), so
    // this is what keeps the transcription honest.
    expect([...INTENT_ORDER].sort()).toEqual([...BEAT_INTENTS].sort());
  });
});

describe('tokenFold', () => {
  it('keeps chat_plan and chat_turn as two series and never averages them', () => {
    const fold = tokenFold(
      [
        { bucket: '2026-08-01', op: 'chat_plan', calls: 2, inputTokens: 100, outputTokens: 10, untokenized: 0 },
        { bucket: '2026-08-01', op: 'chat_turn', calls: 5, inputTokens: 500, outputTokens: 90, untokenized: 1 },
        { bucket: '2026-08-03', op: 'chat_turn', calls: 1, inputTokens: 90, outputTokens: 10, untokenized: 0 },
      ],
      RANGE.from,
      RANGE.to,
    );
    expect(fold.byOp.chat_plan).toEqual([110, 0, 0]);
    expect(fold.byOp.chat_turn).toEqual([590, 0, 100]);
    expect(fold.calls).toBe(8);
    expect(fold.tokens).toBe(800);
    // A-D7: the count of what could not be measured survives the fold.
    expect(fold.untokenized).toBe(1);
  });

  it('is all zeros on an empty range rather than an empty series', () => {
    const fold = tokenFold([], RANGE.from, RANGE.to);
    expect(fold.byOp.chat_plan).toEqual([0, 0, 0]);
    expect(fold.tokens).toBe(0);
  });
});

describe('latencyFold', () => {
  it('keeps a day with no measured call NULL, never 0ms', () => {
    const fold = latencyFold(
      [
        { bucket: '2026-08-01', op: 'chat_turn', calls: 3, p50Ms: 1200, p95Ms: 2400 },
        { bucket: null, op: 'chat_turn', calls: 4, p50Ms: 1300, p95Ms: 5200 },
      ],
      RANGE.from,
      RANGE.to,
    );
    expect(fold.p95.chat_turn).toEqual([2400, null, null]);
    // The range-wide row is Postgres's, over the whole population -- NEVER the mean of
    // the daily figures. Four calls range-wide against three on the only measured day.
    expect(fold.overall.chat_turn).toEqual({ calls: 4, p50Ms: 1300, p95Ms: 5200 });
  });

  it('leaves an op with no rows at its empty state', () => {
    const fold = latencyFold([], RANGE.from, RANGE.to);
    expect(fold.overall.chat_plan).toEqual({ calls: 0, p50Ms: null, p95Ms: null });
    expect(fold.p95.chat_plan).toEqual([null, null, null]);
  });
});

describe('healthFold -- the dropped beat', () => {
  it('orders statuses by lifecycle and sums the stuck ones', () => {
    const fold = healthFold({
      statuses: [
        { status: 'done', runs: 10, stuck: 0 },
        { status: 'running', runs: 3, stuck: 2 },
      ],
      terminalRuns: 10,
      fallbackPlans: 2,
      beatsPlanned: 24,
      bubbles: 21,
    });
    expect(fold.statuses.map((s) => s.status)).toEqual(['running', 'done']);
    expect(fold.stuck).toBe(2);
    expect(fold.dropped).toBe(3);
    expect(fold.fallbackRate).toBe(0.2);
  });

  it('CLAMPS a negative difference at zero, because one beat may produce two bubbles', () => {
    /*
     * `[R19]` granted it as *"the largest naturalness gain left"* — a person with more
     * to say sends a second message rather than a longer one. So `beats_planned -
     * bubbles` is a SIGNED quantity, and a tile reading *"beat dijatuhkan: −3"* would
     * be read as a broken dashboard rather than as a reader who had two things to say.
     * The raw value survives for the facts block, which can be honest about it.
     */
    const fold = healthFold({
      statuses: [],
      terminalRuns: 4,
      fallbackPlans: 0,
      beatsPlanned: 5,
      bubbles: 8,
    });
    expect(fold.dropped).toBe(0);
    expect(fold.droppedRaw).toBe(-3);
  });

  it('returns a NULL fallback rate for an empty range', () => {
    const fold = healthFold({
      statuses: [],
      terminalRuns: 0,
      fallbackPlans: 0,
      beatsPlanned: 0,
      bubbles: 0,
    });
    expect(fold.fallbackRate).toBeNull();
    expect(fold.total).toBe(0);
  });
});
