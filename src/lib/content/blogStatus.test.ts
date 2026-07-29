import { describe, expect, it } from 'vitest';
import type { LintViolation } from './lint';
import {
  BLOG_STATUSES,
  canTransition,
  isBlogStatus,
  isReachable,
  type BlogStatus,
  type TransitionInput,
} from './blogStatus';

/**
 * **EVERY REFUSAL IN §8.1 HAS A CASE HERE**, and the two that are not obvious have
 * two: the one that keeps a public URL from being relabelled private (A6-21) and the
 * one that keeps `contentAlternates()` from throwing on a sitemapped URL (A6-7).
 */

const warn = (rule = 'description-band'): LintViolation => ({
  rule: rule as LintViolation['rule'],
  cls: 'warning',
  locale: 'id',
  field: 'description',
  detail: '12',
  excerpt: '',
});

const err = (): LintViolation => ({
  rule: 'malay',
  cls: 'error',
  locale: 'id',
  field: 'body',
  detail: 'tempoh',
  excerpt: '',
});

function input(over: Partial<TransitionInput> = {}): TransitionInput {
  return {
    from: 'draft',
    to: 'published',
    locale: 'id',
    idStatus: 'draft',
    bodyBlocks: 4,
    violations: [],
    ...over,
  };
}

describe('the allowed transitions', () => {
  it('publishes an `id` draft with a body and no violations', () => {
    expect(canTransition(input())).toEqual({ ok: true, noop: false });
  });

  it('unpublishes a published row, unconditionally', () => {
    /*
     * **NO CONDITIONS, DELIBERATELY.** Withdrawing something from publication must
     * never be refused for a lint violation: the article that most needs pulling is
     * the one with something wrong in it.
     */
    expect(
      canTransition(input({ from: 'published', to: 'unpublished', violations: [err()] })),
    ).toEqual({ ok: true, noop: false });
  });

  it('re-publishes an unpublished row on the same terms as a draft', () => {
    expect(canTransition(input({ from: 'unpublished', to: 'published' }))).toEqual({
      ok: true,
      noop: false,
    });
  });

  it('treats X → X as a no-op, so a double-tapped toggle is not two decisions', () => {
    for (const s of BLOG_STATUSES) {
      expect(canTransition(input({ from: s, to: s })), s).toEqual({ ok: true, noop: true });
    }
  });
});

describe('the refusals', () => {
  it('refuses every path back to `draft` (A6-21)', () => {
    /*
     * `draft` means NEVER PUBLIC. An admin who can relabel an unpublished article
     * `draft` has laundered a public URL into a private one with nothing recording
     * the change -- the URL is still in somebody's chat history and may still be in
     * an index.
     */
    for (const from of ['published', 'unpublished'] as BlogStatus[]) {
      expect(canTransition(input({ from, to: 'draft' })), from).toEqual({
        ok: false,
        reason: 'no-path-back-to-draft',
      });
    }
  });

  it('refuses draft → unpublished, because it was never public', () => {
    expect(canTransition(input({ from: 'draft', to: 'unpublished' }))).toEqual({
      ok: false,
      reason: 'never-published',
    });
  });

  it('refuses publishing an empty body', () => {
    expect(canTransition(input({ bodyBlocks: 0 }))).toEqual({ ok: false, reason: 'empty-body' });
  });

  it('refuses publishing over an ERROR', () => {
    expect(canTransition(input({ violations: [err()] }))).toEqual({
      ok: false,
      reason: 'lint-violations',
    });
  });

  it('refuses publishing over a WARNING too — the publish gate takes both (A6-17)', () => {
    /*
     * **THE HALF THAT MAKES THE WARNING CLASS MEAN ANYTHING.** A warning does not
     * refuse a SAVE, because a word floor and a description band are properties of a
     * finished article and refusing a 200-word draft is refusing to let somebody
     * write. It refuses a PUBLISH, because that is the moment the article claims to
     * be finished. Getting this backwards makes the editor unusable in one direction
     * or the gate decorative in the other.
     */
    expect(canTransition(input({ violations: [warn()] }))).toEqual({
      ok: false,
      reason: 'lint-violations',
    });
  });

  it('refuses publishing `en` while `id` is not published (A6-7, R42)', () => {
    /*
     * **THIS IS A 500 ON A URL IN THE SITEMAP IF IT GETS THROUGH.**
     * `contentAlternates()` throws without an `id` document -- deliberately, per R2,
     * because a wrong canonical de-indexes the correct page -- and A-D15 reasoned
     * only about UNPUBLISHING. R42 asks for two defences; this is the first.
     */
    for (const idStatus of ['draft', 'unpublished'] as BlogStatus[]) {
      expect(canTransition(input({ locale: 'en', idStatus })), idStatus).toEqual({
        ok: false,
        reason: 'id-not-published',
      });
    }
  });

  it('allows publishing `en` once `id` is published', () => {
    expect(canTransition(input({ locale: 'en', idStatus: 'published' }))).toEqual({
      ok: true,
      noop: false,
    });
  });

  it('never asks `id` about a sibling — `id` is the source language', () => {
    expect(canTransition(input({ locale: 'id', idStatus: 'draft' })).ok).toBe(true);
  });
});

describe('reachability, which is derived and never cascaded (A6-22)', () => {
  it('makes a published `en` unreachable the moment `id` leaves published', () => {
    /*
     * The `en` ROW still says `published` and that is correct: it records what the
     * admin asked for, and re-publishing `id` restores `en` without a second
     * decision. Cascading the write instead is V7's *"two kinds of stop sharing"*
     * problem, where the operator taps the wrong one and believes something is
     * private when it is not.
     */
    expect(isReachable('en', 'published', 'published')).toBe(true);
    expect(isReachable('en', 'published', 'unpublished')).toBe(false);
    expect(isReachable('en', 'published', 'draft')).toBe(false);
  });

  it('never makes a draft or an unpublished row reachable, in either locale', () => {
    for (const locale of ['id', 'en'] as const) {
      for (const status of ['draft', 'unpublished'] as BlogStatus[]) {
        expect(isReachable(locale, status, 'published'), `${locale}/${status}`).toBe(false);
      }
    }
  });

  it('asks `id` about nobody', () => {
    expect(isReachable('id', 'published', 'draft')).toBe(true);
  });
});

describe('the value set', () => {
  it('is three values, and `unpublished` is not `draft` (A6-9)', () => {
    expect([...BLOG_STATUSES]).toEqual(['draft', 'published', 'unpublished']);
    expect(isBlogStatus('unpublished')).toBe(true);
    expect(isBlogStatus('archived')).toBe(false);
    expect(isBlogStatus(null)).toBe(false);
  });
});
