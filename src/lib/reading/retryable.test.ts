/**
 * TWO OF THESE ARE NEGATIVE CONTROLS ON RULES STATED IN PROSE ELSEWHERE, and
 * they are the reason this file is worth more than its size suggests:
 *
 *   - `partial` is never retryable, although it is not `ok`. A status list of
 *     "everything that is not ok" breaks this one.
 *   - `failed` and `aborted` are BOTH retryable, although only one of them is a
 *     failure. A status list containing only `failed` breaks this one.
 *
 * Between them they fence the rule from both sides, which a test of the happy
 * path cannot do.
 */
import { describe, expect, it } from 'vitest';
import { isRetryable, retryable, type RetryCandidate } from './retryable';

const base: RetryCandidate = {
  status: 'failed',
  hasBody: false,
  cardCount: 3,
  deletedAt: null,
};

describe('retryable', () => {
  it('allows a failed reading with no prose and a stored draw', () => {
    expect(retryable(base)).toEqual({ ok: true });
    expect(isRetryable(base)).toBe(true);
  });

  it('allows an aborted reading on exactly the same terms', () => {
    expect(retryable({ ...base, status: 'aborted' })).toEqual({ ok: true });
  });

  it('refuses a partial reading, which has prose', () => {
    expect(retryable({ ...base, status: 'partial', hasBody: true })).toEqual({
      ok: false,
      reason: 'has_body',
    });
  });

  it('refuses a completed reading', () => {
    expect(retryable({ ...base, status: 'ok', hasBody: true })).toEqual({
      ok: false,
      reason: 'has_body',
    });
  });

  it('refuses a blocked reading even though it has no prose', () => {
    expect(retryable({ ...base, status: 'blocked', cardCount: 0 })).toEqual({
      ok: false,
      reason: 'blocked',
    });
  });

  it('refuses a soft-deleted reading before anything else', () => {
    expect(retryable({ ...base, deletedAt: new Date() })).toEqual({
      ok: false,
      reason: 'deleted',
    });
    // A string, because the column arrives as one through some paths.
    expect(retryable({ ...base, deletedAt: '2026-08-28T00:00:00Z' })).toEqual({
      ok: false,
      reason: 'deleted',
    });
  });

  it('treats an absent deletedAt as not deleted', () => {
    const { deletedAt: _omitted, ...withoutTheField } = base;
    expect(retryable(withoutTheField)).toEqual({ ok: true });
  });

  it('refuses a reading with no stored draw', () => {
    expect(retryable({ ...base, cardCount: 0 })).toEqual({ ok: false, reason: 'no_cards' });
  });
});
