/**
 * The pure half of the writer: what may reach the database, and what is worth
 * retrying when it does not.
 *
 * No database here. `flush.ts` reaches `@/lib/db/client` through a dynamic
 * import precisely so this file can exist -- a static one would pull in
 * `server-only`, which throws under Vitest, and these two functions would go
 * untested.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTransient, sanitizeProps, withRetry } from './flush';

/**
 * THIS IS THE PRIVACY GUARANTEE (roadmap §8, plan A16, reconciliation R9).
 *
 * `events` rows survive account erasure with `user_id` nulled, and the privacy
 * policy says in those words that they contain no text the user wrote. That
 * claim is honest ONLY because of `sanitizeProps`. Do not relax any assertion
 * below for convenience: if an event needs text, the text belongs in a real
 * column with a real retention story.
 */
describe('sanitizeProps -- the privacy guarantee', () => {
  it('keeps scalars exactly as they are', () => {
    expect(sanitizeProps({ card_id: 0, reversed: false, reader_id: 'adrian', second: null })).toEqual(
      { card_id: 0, reversed: false, reader_id: 'adrian', second: null },
    );
  });

  it('drops everything that could hide free text', () => {
    const out = sanitizeProps({
      ok: 1,
      nested: { question: 'the thing they actually typed' },
      list: ['a', 'b'],
      fn: () => {},
      nothing: undefined,
      huge: BigInt(4),
      sym: Symbol('s'),
    });
    expect(out).toEqual({ ok: 1 });
  });

  it('truncates a long string to 120 characters', () => {
    const out = sanitizeProps({ version: 'x'.repeat(5000) });
    expect((out.version as string).length).toBe(120);
  });

  it('caps the object at 24 keys', () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 100; i++) wide[`k${i}`] = i;
    expect(Object.keys(sanitizeProps(wide))).toHaveLength(24);
  });

  it('drops prototype keys and anything not lower_snake', () => {
    const out = sanitizeProps(
      JSON.parse('{"__proto__":"evil","constructor":"evil","BadKey":1,"_leading":2,"ok_key":3}'),
    );
    expect(out).toEqual({ ok_key: 3 });
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });

  it('drops NaN and Infinity, which are not JSON', () => {
    expect(sanitizeProps({ a: NaN, b: Infinity, c: 1 })).toEqual({ c: 1 });
  });

  it('returns an empty object for anything that is not one', () => {
    for (const v of [null, undefined, 'text', 42, ['a'], true]) {
      expect(sanitizeProps(v), String(v)).toEqual({});
    }
  });
});

describe('isTransient', () => {
  const err = (code: string) => Object.assign(new Error('x'), { code });

  it('retries connection, resource and serialization failures', () => {
    for (const code of ['08006', '08003', '53300', '40001', '40P01', '57P01', '57P03']) {
      expect(isTransient(err(code)), code).toBe(true);
    }
  });

  it('retries the driver-level codes too', () => {
    for (const code of ['ECONNRESET', 'ETIMEDOUT', 'CONNECT_TIMEOUT', 'CONNECTION_ENDED']) {
      expect(isTransient(err(code)), code).toBe(true);
    }
  });

  it('refuses anything deterministic', () => {
    // Retrying a not-null violation three times is three seconds of a paid
    // invocation and a log line that hides the real error twice over.
    for (const code of ['23505', '23502', '22001', '42703', '42P01']) {
      expect(isTransient(err(code)), code).toBe(false);
    }
  });

  it('refuses an error with no code at all', () => {
    // Unknown means unknown. Do not spend the invocation guessing.
    expect(isTransient(new Error('something happened'))).toBe(false);
    expect(isTransient(null)).toBe(false);
    expect(isTransient('a string')).toBe(false);
  });
});

describe('withRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the value on the first success without waiting', async () => {
    const fn = vi.fn(async () => 'written');
    await expect(withRetry(fn)).resolves.toBe('written');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('tries three times against a persistently transient error', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('gone'), { code: '08006' });
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const promise = withRetry(fn, { budgetMs: 5000 });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(3);
    error.mockRestore();
  });

  it('tries ONCE against a permanent one', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(withRetry(fn)).resolves.toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('does not start a wait it cannot finish inside the budget', async () => {
    // after() is not infinite and holding an invocation open costs money.
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('gone'), { code: '08006' });
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const promise = withRetry(fn, { budgetMs: 100 });
    await vi.runAllTimersAsync();
    await promise;

    // The second attempt would sleep ~250ms into a 100ms budget.
    expect(fn).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('recovers on a later attempt', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('deadlock'), { code: '40P01' });
      return 'written on the third';
    });

    const promise = withRetry(fn, { budgetMs: 5000 });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('written on the third');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
