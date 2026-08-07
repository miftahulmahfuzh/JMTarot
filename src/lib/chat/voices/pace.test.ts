import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ReaderId } from '@/data/types';
import type { Beat } from '../types';
import { pace } from './pace';

const beat = (reader: ReaderId, over: Partial<Beat> = {}): Beat => ({
  reader,
  to: 'user',
  replyTo: null,
  intent: 'answer',
  angle: null,
  ...over,
});

describe('pace', () => {
  /** `[F3-14]`: pure, so `npm test` can assert something about the pacing at all. */
  it('is pure across a thousand different beats', () => {
    for (let i = 0; i < 1000; i += 1) {
      const b = beat('adrian', { angle: `angle ${i}`, replyTo: `m${i}` });
      expect(pace({ next: b, previousChars: i })).toBe(pace({ next: b, previousChars: i }));
    }
  });

  /**
   * **`MIN_MS` IS NEVER ZERO.** A bubble that arrives with no pause is two messages
   * rendering in one frame, which reads as a layout bug rather than as two people.
   */
  it('stays inside its floor and ceiling for every input it could get', () => {
    for (const reader of ['thessaly', 'margaret', 'adrian'] as ReaderId[]) {
      for (const chars of [null, 0, 1, 40, 120, 260, 2000]) {
        const ms = pace({ next: beat(reader), previousChars: chars });
        expect(ms).toBeGreaterThanOrEqual(700);
        expect(ms).toBeLessThanOrEqual(6000);
      }
    }
  });

  /**
   * `READER_TEMPO`, and it is the claim `readers.{id,en}.ts` makes in prose: *"you speak
   * least often and slowest"*, *"you are not competing for a turn"*.
   */
  it('makes Margaret slower than Thessaly for identical inputs', () => {
    for (const chars of [0, 40, 90]) {
      expect(pace({ next: beat('margaret'), previousChars: chars })).toBeGreaterThan(
        pace({ next: beat('thessaly'), previousChars: chars }),
      );
    }
  });

  /**
   * `previousChars === null` IS beat zero, which is how the signature F1 owns still
   * expresses *"the querent just pressed send and is watching"*.
   */
  it('answers the querent’s own message faster than it answers another reader’s bubble', () => {
    expect(pace({ next: beat('thessaly'), previousChars: null })).toBeLessThan(
      pace({ next: beat('thessaly'), previousChars: 40 }),
    );
  });

  /** A longer bubble takes longer to read, which is most of what the pause is. */
  it('grows with the previous bubble’s length', () => {
    const short = pace({ next: beat('adrian'), previousChars: 10 });
    const long = pace({ next: beat('adrian'), previousChars: 200 });
    expect(long).toBeGreaterThan(short);
  });

  /**
   * `[F3-15]`. **NEVER A CONSTANT**, and the assertion is over distinct values rather
   * than over the formula: a function that returns one number for every beat is what
   * would survive a "simplification" during a latency investigation.
   */
  it('is not a constant, across readers and across beats', () => {
    const seen = new Set<number>();
    for (const reader of ['thessaly', 'margaret', 'adrian'] as ReaderId[]) {
      for (const chars of [null, 5, 20, 60, 120]) {
        seen.add(pace({ next: beat(reader), previousChars: chars }));
      }
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  /**
   * The jitter has to actually jitter — `angleIndexFor`'s test shape: *a rotation that
   * does not rotate is not rotating*. Two beats that differ only in what they are about
   * must not arrive on the same millisecond.
   */
  it('varies with the beat, not only with the reader and the length', () => {
    const values = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((angle) =>
        pace({ next: beat('adrian', { angle }), previousChars: 80 }),
      ),
    );
    expect(values.size).toBeGreaterThan(3);
  });

  /**
   * `[F3-14]`, asserted over the source because that is the only thing that can see it.
   *
   * **THE COMMENTS ARE STRIPPED FIRST, AND THAT IS NOT A WEAKENING**: the header names
   * `Math.random` in order to forbid it, exactly as `base.id.ts` names the Malay words it
   * refuses and `prompt.test.ts` carves them out of its own grep. A test that made the
   * rule undocumentable would get the documentation deleted instead.
   */
  it('calls no Math.random', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/chat/voices/pace.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('Math.random');
    expect(src).toContain('Math.random');
  });

  /**
   * A worked case, so the numbers are readable rather than only bounded: Thessaly
   * answering a 90-character bubble lands in the two-to-five-second band a person would
   * recognise as somebody typing a short reply.
   */
  it('lands in a plausible band for the case §11 works through', () => {
    const ms = pace({ next: beat('thessaly'), previousChars: 90 });
    expect(ms).toBeGreaterThan(2000);
    expect(ms).toBeLessThan(5000);
  });
});
