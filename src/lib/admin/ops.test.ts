/**
 * The partition is exhaustive, disjoint, and the literal twin still matches.
 *
 * **THE COMPILE GUARD IS THE REAL FENCE AND THESE ARE ITS RUNTIME HALF.**
 * `_UnclassifiedOps` fails to compile the moment `LLMOp` grows a value neither list
 * names — but `npm run typecheck` is not what a person runs after adding an op at 11pm,
 * and `Array.prototype.filter` has no type-level result, so the DERIVED array and the
 * literal it is checked against can drift with the compiler perfectly happy.
 */
import { describe, expect, it } from 'vitest';
import { OP_ORDER } from '@/lib/analytics/rollup';
import {
  NON_READING_OPS,
  READING_OPS,
  _READING_OPS_LITERAL,
  isReadingOp,
} from './ops';

describe('the partition of LLMOp', () => {
  it('covers every op exactly once', () => {
    const all = [...NON_READING_OPS, ...READING_OPS].sort();
    expect(all).toEqual([...OP_ORDER].sort());
    expect(new Set(all).size).toBe(OP_ORDER.length);
  });

  it('keeps the derived array equal to the hand-written literal', () => {
    /*
     * `OP_ORDER`'s trade, restated: the literal is what the type-level guard can
     * subtract, the derived array is what renders, and this is the only thing keeping
     * the transcription honest. Compared as SETS, because the literal is authored in
     * `OP_ORDER`'s order today and the guard does not care about order.
     */
    expect([...READING_OPS].sort()).toEqual([..._READING_OPS_LITERAL].sort());
  });

  it('renders in OP_ORDER, never in the literal\'s order', () => {
    // An order that changes with the data reads as the data changing (`opRows`' rule),
    // and a second hand-written order is a second thing to keep in step.
    const expected = OP_ORDER.filter((op) => !(NON_READING_OPS as readonly string[]).includes(op));
    expect(READING_OPS).toEqual(expected);
  });

  it('names the four the release closed on, and nothing else', () => {
    /*
     * Spelled out rather than derived: this assertion is the record of WHICH four, and
     * a fifth arriving should fail here and make somebody write down why. `insight` and
     * `blog_format` measure the dashboard and the CMS; `chat_plan` and `chat_turn`
     * measure a product feature that is not a reading.
     */
    expect([...NON_READING_OPS]).toEqual(['insight', 'blog_format', 'chat_plan', 'chat_turn']);
  });

  it('is not vacuous: both sides have members', () => {
    // A partition where one side went empty in a refactor would pass every assertion
    // above except this one.
    expect(NON_READING_OPS.length).toBeGreaterThanOrEqual(4);
    expect(READING_OPS.length).toBeGreaterThanOrEqual(9);
  });
});

describe('isReadingOp', () => {
  it('agrees with the two arrays for every op', () => {
    for (const op of OP_ORDER) {
      expect(isReadingOp(op), op).toBe(READING_OPS.includes(op));
    }
  });

  it('is false for all four dashboard, CMS and chat ops', () => {
    for (const op of NON_READING_OPS) expect(isReadingOp(op), op).toBe(false);
  });
});
