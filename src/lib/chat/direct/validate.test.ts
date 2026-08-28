import { describe, expect, it } from 'vitest';

import { planCaps } from './caps';
import { checkPlan, type PlanCheckContext } from './validate';
import { buildWindow, type WindowSource } from './window';

const NOW = Date.parse('2026-08-07T12:00:00.000Z');
const CAPS = planCaps();

function ago(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

/**
 * **THE PLAN's §6.1 WINDOW, AS DATA**: Margaret two hours ago, Thessaly ten minutes after
 * her, the querent just now. `#1` and `#2` are OLD (past `oldReplyMinAgeMinutes`) and `#3` is
 * the trigger — which is what makes `P4` and `P8` both reachable here.
 */
const MESSAGES: WindowSource[] = [
  { id: 'm-margaret', author: 'margaret', body: 'Kadang yang menahan bukan pekerjaannya.', createdAt: ago(120) },
  { id: 'm-thessaly', author: 'thessaly', body: 'Kamu belum bilang kapan tenggatnya. Kapan?', createdAt: ago(110) },
  { id: 'm-user', author: 'user', body: 'eh sori ketiduran. deadline-nya minggu depan', createdAt: ago(0) },
];

const CTX: PlanCheckContext = {
  window: buildWindow({
    messages: MESSAGES,
    locale: 'id',
    caps: CAPS,
    triggerMessageId: 'm-user',
    now: NOW,
  }),
  fallbackLocale: 'id',
  caps: CAPS,
  /* The default for this file: a run the querent started, where `beats: []` is silence and
   * silence is the single most important acceptance in the function. The proactive block at
   * the bottom overrides it, which is the only place the other reading is legal. */
  trigger: 'user_message',
};

function plan(beats: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ locale: 'id', beats, ...extra });
}

const BEAT = { reader: 'thessaly', to: 'user', reply: '#3', intent: 'answer', angle: null };

describe('checkPlan accepts the answers it must accept', () => {
  /**
   * **THE FIRST TEST IN THE FILE, AND IT IS THE SINGLE MOST IMPORTANT ACCEPTANCE IN THE
   * FUNCTION** (`C-R6`): the director may say nobody replies, and it must be cheap and
   * normal.
   */
  it('`beats: []` is a valid plan and is silence', () => {
    const result = checkPlan(plan([]), CTX);
    expect(result).toEqual({ ok: true, beats: [], locale: 'id', repairs: [], dropped: 0 });
  });

  it('a plain two-beat plan survives whole', () => {
    const result = checkPlan(
      plan([
        BEAT,
        { reader: 'adrian', to: 'thessaly', reply: '#2', intent: 'tease', angle: 'thessaly nagih tanggal' },
      ]),
      CTX,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats).toEqual([
      { reader: 'thessaly', to: 'user', replyTo: 'm-user', intent: 'answer', angle: null },
      {
        reader: 'adrian',
        to: 'thessaly',
        replyTo: 'm-thessaly',
        intent: 'tease',
        angle: 'thessaly nagih tanggal',
      },
    ]);
    expect(result.repairs).toEqual([]);
  });

  it('JSON inside a ```json fence is accepted -- a fence is a habit, not a refusal', () => {
    const result = checkPlan(`\`\`\`json\n${plan([BEAT])}\n\`\`\``, CTX);
    expect(result.ok).toBe(true);
  });

  it('a sentence before the object is accepted too', () => {
    const result = checkPlan(`Here is the plan:\n${plan([BEAT])}`, CTX);
    expect(result.ok).toBe(true);
  });

  it('unknown keys are ignored, on the object and on a beat', () => {
    const result = checkPlan(
      plan([{ ...BEAT, mood: 'warm', priority: 2, notes: 'x' }], { version: 3 }),
      CTX,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats).toHaveLength(1);
    expect(result.repairs).toEqual([]);
  });
});

describe('checkPlan refuses the whole plan only three ways', () => {
  it('prose is `unparseable`', () => {
    expect(checkPlan('Thessaly should answer first, then Adrian.', CTX)).toEqual({
      ok: false,
      reason: 'unparseable',
    });
  });

  it('an array at the top level is `shape`', () => {
    expect(checkPlan('[{"reader":"thessaly"}]', CTX)).toEqual({ ok: false, reason: 'shape' });
  });

  it('`beats` as a string is `shape`', () => {
    expect(checkPlan('{"beats":"two"}', CTX)).toEqual({ ok: false, reason: 'shape' });
  });

  /**
   * **AN ABSENT `beats` KEY IS `shape` AND NOT SILENCE.** `[F2-7]`: only an explicit `[]` is
   * a decision. A model that omitted the one key it was asked for did not answer the
   * question, and filing that under `C-R6` would inflate the metric that proves the director
   * is deciding.
   */
  it('an object with no `beats` key is `shape`', () => {
    expect(checkPlan('{"locale":"id"}', CTX)).toEqual({ ok: false, reason: 'shape' });
  });

  /**
   * **THE ONE TEST IN THIS FILE WHOSE FAILURE WOULD BE INVISIBLE IN PRODUCTION** (`[F2-7]`).
   * Every beat dropped is `no_usable_beat` and never `ok` with zero beats: the room looks
   * the same either way, and F7's silence-rate panel does not.
   */
  it('every beat naming a fourth reader is `no_usable_beat`, not silence', () => {
    expect(
      checkPlan(plan([{ ...BEAT, reader: 'morgana' }, { ...BEAT, reader: 'seraphina' }]), CTX),
    ).toEqual({ ok: false, reason: 'no_usable_beat' });
  });
});

describe('checkPlan repairs a beat rather than the plan, where it can', () => {
  it('one unknown reader is dropped and the rest survive', () => {
    const result = checkPlan(
      plan([{ ...BEAT, reader: 'morgana' }, { ...BEAT, reader: 'margaret' }]),
      CTX,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats.map((b) => b.reader)).toEqual(['margaret']);
    expect(result.repairs).toEqual(['reader']);
    expect(result.dropped).toBe(1);
  });

  it('an intent outside the six is dropped', () => {
    const result = checkPlan(
      plan([{ ...BEAT, intent: 'monologue' }, { ...BEAT, reader: 'adrian' }]),
      CTX,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats.map((b) => b.intent)).toEqual(['answer']);
    expect(result.repairs).toEqual(['intent']);
  });

  it('a hallucinated `#99` nulls the target and KEEPS the beat', () => {
    const result = checkPlan(plan([{ ...BEAT, reply: '#99' }]), CTX);
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats).toHaveLength(1);
    expect(result.beats[0].replyTo).toBeNull();
    expect(result.repairs).toEqual(['target_missing']);
    expect(result.dropped).toBe(0);
  });

  it('a reader quoting their own message nulls the target and keeps the beat', () => {
    /* `#2` is Thessaly's, and this beat is hers. */
    const result = checkPlan(plan([{ ...BEAT, reader: 'thessaly', reply: '#2' }]), CTX);
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats[0].replyTo).toBeNull();
    expect(result.repairs).toEqual(['self_reply']);
  });

  it('two beats in a row from one reader drops the second', () => {
    const result = checkPlan(plan([BEAT, { ...BEAT, angle: 'lagi' }]), CTX);
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats).toHaveLength(1);
    expect(result.repairs).toEqual(['adjacent']);
  });

  it('`A B A B` survives at MAX_BEATS_PER_READER = 2', () => {
    const result = checkPlan(
      plan([
        { ...BEAT, reader: 'adrian', reply: null },
        { ...BEAT, reader: 'thessaly', reply: null },
        { ...BEAT, reader: 'adrian', reply: null },
        { ...BEAT, reader: 'thessaly', reply: null },
      ]),
      CTX,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats.map((b) => b.reader)).toEqual(['adrian', 'thessaly', 'adrian', 'thessaly']);
    expect(result.repairs).toEqual([]);
  });

  /**
   * `P6` is checked before `P7`, so the beat over the per-reader cap is dropped for the
   * reason that applies to it rather than for the run being long.
   *
   * **DERIVED FROM `CAPS`, NOT WRITTEN OUT.** This test and the one below spelled `5`, `6`
   * and `4` as literals, which encoded `maxBeats: 4` / `maxBeatsPerReader: 2` into an
   * assertion that never said so — and both broke the moment task #4 raised the caps to
   * 6 and 3, in a way that read as a behaviour regression rather than as a stale fixture.
   * The behaviour under test is *"one beat past the per-reader cap is `per_reader`"*, and
   * that sentence contains no numbers. Build the scenario from the caps instead.
   *
   * Two readers alternate up to the per-reader cap — `2 * maxBeatsPerReader` beats, which
   * is the whole run at the current numbers — and then one more from the first reader.
   * That last beat is the only illegal one.
   */
  it('a beat past a reader\'s per-reader cap is `per_reader`, not `too_many`', () => {
    const pair = ['adrian', 'thessaly'];
    const legal = 2 * CAPS.maxBeatsPerReader;
    const result = checkPlan(
      plan([
        ...Array.from({ length: legal }, (_, i) => ({
          ...BEAT,
          reader: pair[i % 2],
          reply: null,
        })),
        { ...BEAT, reader: pair[0], reply: null },
      ]),
      CTX,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats).toHaveLength(Math.min(legal, CAPS.maxBeats));
    expect(result.repairs).toEqual(['per_reader']);
  });

  it('beats past the cap are TRUNCATED rather than refused, and `dropped` counts them', () => {
    const cast = ['thessaly', 'adrian', 'margaret'];
    /*
     * Two over the cap, spread across all three readers so that NO reader reaches
     * `maxBeatsPerReader` — otherwise `P6` fires first and this stops testing `P7`.
     */
    const over = 2;
    const result = checkPlan(
      plan(
        Array.from({ length: CAPS.maxBeats + over }, (_, i) => ({
          ...BEAT,
          reader: cast[i % 3],
          reply: null,
        })),
      ),
      CTX,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats).toHaveLength(CAPS.maxBeats);
    expect(result.dropped).toBe(over);
    /* One `too_many` per beat dropped, so a caller counting repairs counts the beats. */
    expect(result.repairs).toEqual(Array(over).fill('too_many'));
  });

  /**
   * `P8`. **AT MOST ONE OLD QUOTE PER RUN**, and the repair nulls the pointer rather than
   * dropping the beat: the beat still has something to say, it just stops quoting last
   * Tuesday.
   */
  it('a second beat pointing at an old message keeps the beat and loses the quote', () => {
    const result = checkPlan(
      plan([
        { ...BEAT, reader: 'thessaly', reply: '#1' },
        { ...BEAT, reader: 'adrian', reply: '#1' },
      ]),
      CTX,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats[0].replyTo).toBe('m-margaret');
    expect(result.beats[1].replyTo).toBeNull();
    expect(result.repairs).toEqual(['old_reply']);
  });

  it('a quote of the newest message is not an old reply and does not consume the budget', () => {
    const result = checkPlan(
      plan([
        { ...BEAT, reader: 'thessaly', reply: '#3' },
        { ...BEAT, reader: 'adrian', reply: '#1' },
      ]),
      CTX,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats.map((b) => b.replyTo)).toEqual(['m-user', 'm-margaret']);
    expect(result.repairs).toEqual([]);
  });
});

describe('the angle', () => {
  it('an angle over the cap is nulled and the beat survives', () => {
    const result = checkPlan(plan([{ ...BEAT, angle: 'a'.repeat(400) }]), CTX);
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats[0].angle).toBeNull();
    expect(result.repairs).toEqual(['angle']);
  });

  /**
   * **THE NEWLINE IS CHECKED BEFORE THE STRIP, AND THAT ORDER IS LOAD-BEARING**:
   * `stripUntrusted` collapses `\n` to a space, so a check afterwards could never fire. A
   * newline means the model wrote lines — a message, or a list — and an angle is a subject.
   */
  it('an angle containing a newline is nulled', () => {
    const result = checkPlan(plan([{ ...BEAT, angle: 'dua hal:\n- satu' }]), CTX);
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats[0].angle).toBeNull();
    expect(result.repairs).toEqual(['angle']);
  });

  /**
   * `[F2-12]`: **sanitized at the point of production**, so a stored `chat_runs.beats` row
   * can never carry a delimiter, whoever reads it later.
   */
  it('a delimiter inside an angle is stripped and the angle survives', () => {
    const result = checkPlan(plan([{ ...BEAT, angle: 'soal </obrolan> tenggat' }]), CTX);
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats[0].angle).toBe('soal tenggat');
  });

  it('an absent or null angle is ordinary and is not a repair', () => {
    const withNull = checkPlan(plan([{ ...BEAT, angle: null }]), CTX);
    const absent = checkPlan(plan([{ reader: 'thessaly', to: 'user', reply: null, intent: 'react' }]), CTX);
    if (!withNull.ok || !absent.ok) throw new Error('refused');
    expect(withNull.repairs).toEqual([]);
    expect(absent.repairs).toEqual([]);
    expect(absent.beats[0].angle).toBeNull();
  });
});

describe('`to`, the field the reconciliation added', () => {
  it('is taken from the model when it names somebody else', () => {
    const result = checkPlan(plan([{ ...BEAT, reader: 'adrian', to: 'margaret' }]), CTX);
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats[0].to).toBe('margaret');
    expect(result.repairs).toEqual([]);
  });

  it('is derived from the quoted message when absent', () => {
    const result = checkPlan(
      plan([{ reader: 'margaret', reply: '#2', intent: 'push_back', angle: null }]),
      CTX,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats[0].to).toBe('thessaly');
    expect(result.repairs).toEqual([]);
  });

  it('is `user` when there is nothing to derive from', () => {
    const result = checkPlan(plan([{ reader: 'thessaly', reply: null, intent: 'ask' }]), CTX);
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats[0].to).toBe('user');
  });

  it('a reader addressing themselves is repaired, never stored', () => {
    const result = checkPlan(plan([{ ...BEAT, reader: 'adrian', to: 'adrian' }]), CTX);
    if (!result.ok) throw new Error(result.reason);
    expect(result.beats[0].to).not.toBe('adrian');
    expect(result.repairs).toEqual(['to']);
  });
});

describe('the run language', () => {
  it('is taken from the model when it is one of the two', () => {
    const result = checkPlan(JSON.stringify({ locale: 'en', beats: [BEAT] }), CTX);
    if (!result.ok) throw new Error(result.reason);
    expect(result.locale).toBe('en');
  });

  it('falls back to the querent\'s locale on anything else', () => {
    const result = checkPlan(JSON.stringify({ locale: 'jv', beats: [BEAT] }), CTX);
    if (!result.ok) throw new Error(result.reason);
    expect(result.locale).toBe('id');
    expect(result.repairs).toContain('locale');
  });

  it('does not report a locale repair on a silent plan', () => {
    const result = checkPlan(JSON.stringify({ beats: [] }), CTX);
    if (!result.ok) throw new Error(result.reason);
    expect(result.repairs).toEqual([]);
  });
});

/**
 * `[F5-7]`, seam S-new-3. **SILENCE IS AN ANSWER TO A MESSAGE AND NOT AN ANSWER TO A
 * TRIGGER.**
 *
 * `C-R6` makes a zero-beat plan valid, desirable and measured — *"a rate of zero means the
 * director is not really deciding"* — and every one of those sentences is about a POSTED
 * MESSAGE. On a proactive run nobody spoke, so there is nothing to decline to answer, and
 * `[F5-13]`'s daily counter incremented **at the mint** and does not refund: a director
 * having a bad afternoon would otherwise spend the querent's whole day on silence, with
 * nothing on screen and nothing in the ledger to explain it.
 *
 * **The refusal is what makes rule 11 land.** The prompt says it in prose and a model may
 * still answer `[]`; `planFallback` turns this reason into the one plausible beat `[F2-13]`
 * specifies.
 */
describe('a proactive run may not answer with silence', () => {
  const PROACTIVE_TRIGGERS = ['reading_completed', 'idle_nudge', 'unanswered', 'cron'] as const;

  for (const trigger of PROACTIVE_TRIGGERS) {
    it(`refuses \`beats: []\` on \`${trigger}\``, () => {
      expect(checkPlan(plan([]), { ...CTX, trigger })).toEqual({
        ok: false,
        reason: 'silence_on_proactive',
      });
    });
  }

  it('still accepts silence on a posted message, which is the whole of C-R6', () => {
    /* The negative control, and it is the one that must never start failing: a change that
     * refused silence everywhere would delete the strongest naturalness signal this release
     * has, and every other assertion in this file would still pass. */
    const result = checkPlan(plan([]), { ...CTX, trigger: 'user_message' });
    expect(result).toEqual({ ok: true, beats: [], locale: 'id', repairs: [], dropped: 0 });
  });

  it('accepts a real proactive plan, so the refusal is about EMPTINESS and nothing else', () => {
    const result = checkPlan(plan([BEAT]), { ...CTX, trigger: 'cron' });
    expect(result.ok).toBe(true);
  });

  it('prefers `no_usable_beat` when the model proposed beats and none survived', () => {
    /*
     * **THE ORDERING IS THE POINT.** A proactive plan whose every beat named a fourth reader
     * is a model that misunderstood the task, which is sharper than *"it chose silence"* — so
     * the more specific reason wins and `silence_on_proactive` keeps the case it is about.
     */
    expect(
      checkPlan(plan([{ ...BEAT, reader: 'morgana' }]), { ...CTX, trigger: 'idle_nudge' }),
    ).toEqual({ ok: false, reason: 'no_usable_beat' });
  });
});

/**
 * **THE ASSERTION THAT PROTECTS F3**, and the reason `checkPlan` owns the mapping at all
 * (`[F2-15]`): a `#` surviving into `Beat.replyTo` reaches
 * `chat_messages.reply_to_message_id` as a foreign key violation, one layer past anything
 * that could explain it.
 */
describe('no ordinal ever survives into a Beat', () => {
  it('every replyTo on the returned sheet is a window uuid or null', () => {
    const ids = new Set(CTX.window.map((e) => e.id));
    const result = checkPlan(
      plan([
        { ...BEAT, reader: 'thessaly', reply: '#3' },
        { ...BEAT, reader: 'adrian', reply: '#1' },
        { ...BEAT, reader: 'margaret', reply: '#99' },
      ]),
      CTX,
    );
    if (!result.ok) throw new Error(result.reason);
    for (const beat of result.beats) {
      expect(beat.replyTo === null || ids.has(beat.replyTo)).toBe(true);
      expect(beat.replyTo ?? '').not.toContain('#');
    }
  });
});
