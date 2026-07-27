import { describe, expect, it } from 'vitest';
import { EVENT_NAMES, isEventName } from './events';

describe('the event taxonomy', () => {
  it('accepts every declared name', () => {
    for (const name of EVENT_NAMES) expect(isEventName(name)).toBe(true);
  });

  it('rejects everything else', () => {
    // `reader_chosen` is the exact drift A1 is about: the same event, named the
    // way a different file would have named it.
    for (const bad of ['reader_chosen', '', 'reading.', 'Reading.Completed', null, 42, {}, []]) {
      expect(isEventName(bad), String(bad)).toBe(false);
    }
  });

  it('rejects prototype keys', () => {
    // A Set has no prototype chain to walk, unlike the object-literal lookup
    // someone will eventually refactor it into. This test is what fails then.
    expect(isEventName('__proto__')).toBe(false);
    expect(isEventName('constructor')).toBe(false);
    expect(isEventName('toString')).toBe(false);
  });

  it('has no duplicates', () => {
    // A duplicated string literal compiles fine and quietly makes the union
    // narrower than the array, so the second copy is unreachable in EventMap.
    expect(new Set(EVENT_NAMES).size).toBe(EVENT_NAMES.length);
  });

  it('names every event domain.verb_object', () => {
    // The test that stops the taxonomy drifting into three naming conventions.
    for (const name of EVENT_NAMES) {
      expect(name, name).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);
    }
  });

  it('is big enough to be the real list', () => {
    // A glob-shaped test that passes against an empty array is not a test.
    expect(EVENT_NAMES.length).toBeGreaterThan(30);
  });

  /*
   * V0.3.0's REGISTER (reconciliation §4): 44 at v0.2.0, plus the fifteen names
   * roadmap §6 fixes, plus V9's two, is 61 when the release is complete.
   *
   * A BOUND RATHER THAN AN EXACT COUNT, because five workstreams still have names to
   * add and an exact number would make each of them edit this line — which is how a
   * count assertion becomes a number people bump without reading. What is asserted
   * exactly is the ceiling: nothing may take the taxonomy past 61 without the
   * register being revisited.
   */
  it('stays inside v0.3.0’s fixed name budget', () => {
    expect(EVENT_NAMES.length).toBeGreaterThanOrEqual(44);
    expect(EVENT_NAMES.length).toBeLessThanOrEqual(61);
  });

  /*
   * V3 CONTRIBUTES ZERO NAMES, which is a claim its plan makes and this is where
   * it is checked. It widened two prop shapes instead -- `shadow_card_id` and
   * friends on `memory.frequency_generated`, `echo_count` on
   * `memory.summary_generated` -- because a derived value about an existing
   * event is a property of that event and not a new thing that happened.
   *
   * There are exactly SEVEN `memory.*` names and there were seven at W5. If an
   * eighth appears with a V3 commit, the register in reconciliation §4 is out by
   * one and nobody will notice until the count is supposed to reach 61.
   */
  it('adds no memory.* name at V3', () => {
    const memory = EVENT_NAMES.filter((n) => n.startsWith('memory.'));
    expect(memory).toEqual([
      'memory.chain_offered',
      'memory.chain_used',
      'memory.gist_failed',
      'memory.summary_shown',
      'memory.summary_generated',
      'memory.frequency_shown',
      'memory.frequency_generated',
    ]);
  });

  /*
   * V2's one name, and the absence of the one it deliberately does not have.
   *
   * `translation.failed` would be the sixteenth fixed name and break the register.
   * The failure rides on `outcome` instead — `memory.gist_failed`'s `fell_back` is
   * the precedent — and `outcome: 'invalid'` is the rate that decides whether the
   * translation prompt needs work.
   */
  it('carries translation.generated and no translation.failed', () => {
    expect(isEventName('translation.generated')).toBe(true);
    expect(isEventName('translation.failed')).toBe(false);
  });
});
