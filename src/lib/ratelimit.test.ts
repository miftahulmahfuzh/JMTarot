import { beforeEach, describe, expect, it } from 'vitest';
import { _reset, hit } from './ratelimit';

const T0 = 1_700_000_000_000;

describe('rate limit', () => {
  beforeEach(_reset);

  it('allows up to the limit then rejects', () => {
    for (let i = 0; i < 3; i++) expect(hit('a', T0, 3).ok).toBe(true);
    expect(hit('a', T0, 3).ok).toBe(false);
  });

  it('keeps users separate', () => {
    for (let i = 0; i < 3; i++) hit('a', T0, 3);
    expect(hit('b', T0, 3).ok).toBe(true);
  });

  it('slides: an old hit stops counting once it leaves the window', () => {
    for (let i = 0; i < 3; i++) hit('a', T0, 3, 1000);
    expect(hit('a', T0 + 500, 3, 1000).ok).toBe(false);
    expect(hit('a', T0 + 1001, 3, 1000).ok).toBe(true);
  });

  it('reports when to retry, based on the oldest hit in the window', () => {
    for (let i = 0; i < 3; i++) hit('a', T0, 3, 60_000);
    const result = hit('a', T0 + 10_000, 3, 60_000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryAfterSeconds).toBe(50);
  });

  it('never reports a retry-after of zero', () => {
    // A zero would tell the client to retry immediately, into another 429.
    for (let i = 0; i < 2; i++) hit('a', T0, 2, 1000);
    const result = hit('a', T0 + 999, 2, 1000);
    if (!result.ok) expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });
});
