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
});
