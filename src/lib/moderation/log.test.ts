/**
 * The moderation write path, without a database.
 *
 * **THE CANARY TESTS ARE THE POINT OF THIS FILE.** The rule they enforce -- "the
 * question text never reaches `console`" -- is the one that cannot be checked by
 * reading the code, because the leak is not in code anybody wrote. A postgres
 * error quotes the failing statement AND its bound parameters, so a single
 * `console.error('...', err)` in a catch block puts the querent's question into
 * the Vercel platform log, which is a second copy living entirely outside every
 * retention control this module implements. W4 found exactly this bug in
 * `flush.ts` by running the database-down check rather than by reading the file.
 *
 * The database itself is covered by `log.integration.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { questionHmac, recordModerationFlag, redactForUser, sweepRedactions } from './log';
import type { ModerationVerdict } from './types';

const CANARY = 'CANARY_bunuh_diri_karena_hutang_di_bank';

const blocked: ModerationVerdict = {
  blocked: true,
  source: 'blocklist',
  category: 'self_harm',
  confidence: null,
  patternId: 'id.self_harm.method',
  clause: '6.2',
  latencyMs: 3,
};

/** A handle whose every method throws, to drive the catch path. */
const explodingDb = () => ({
  insert: () => {
    throw new Error(
      // A realistic postgres error: it quotes the statement AND the parameters.
      `insert into "moderation_flags" ... parameters: $1 = '${CANARY}'`,
    );
  },
  execute: vi.fn(),
});

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('FIELD_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64url'));
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const everythingLogged = () =>
  [...warn.mock.calls, ...error.mock.calls, ...log.mock.calls]
    .flat()
    .map((v) => (v instanceof Error ? `${v.name} ${v.message} ${v.stack}` : String(v)))
    .join('\n');

describe('the question text never reaches the console', () => {
  it('survives a driver error that quotes the bound parameters', async () => {
    /*
     * THE EXACT SHAPE OF THE BUG. The driver error carries the question; the
     * catch must log the error's CLASS and nothing else. If this ever fails, the
     * fix is to stop logging the error object -- not to loosen the assertion.
     */
    await recordModerationFlag(
      { userId: 'u1', question: CANARY, verdict: blocked, locale: 'id', action: 'blocked' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      explodingDb() as any,
    );

    expect(everythingLogged()).not.toContain(CANARY);
    expect(everythingLogged()).not.toContain('bunuh_diri');
    // It still says SOMETHING -- a silent failure is its own bug.
    expect(warn).toHaveBeenCalled();
  });

  it('survives a missing encryption key', async () => {
    vi.stubEnv('FIELD_ENCRYPTION_KEY', '');
    const db = { insert: vi.fn(() => ({ values: vi.fn() })), execute: vi.fn() };

    await recordModerationFlag(
      { userId: 'u1', question: CANARY, verdict: blocked, locale: 'id', action: 'blocked' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
    );

    expect(everythingLogged()).not.toContain(CANARY);
  });
});

describe('questionHmac', () => {
  it('is stable and equal for the same question', () => {
    expect(questionHmac('cara bunuh diri')).toBe(questionHmac('cara bunuh diri'));
  });

  it('is computed over the NORMALIZED form, so a full stop cannot defeat it', () => {
    /*
     * A dedupe key that `c.a.r.a b.u.n.u.h d.i.r.i` slips past would not detect
     * the repeat probing it exists to detect -- which is the entire reason it
     * survives redaction.
     */
    expect(questionHmac('c.a.r.a b.u.n.u.h d.i.r.i')).toBe(questionHmac('CARA BUNUH DIRI'));
  });

  it('differs for different questions', () => {
    expect(questionHmac('cara bunuh diri')).not.toBe(questionHmac('apakah dia jodohku'));
  });

  it('is KEYED, so the same text under a different key does not collide', () => {
    /*
     * The claim in the column comment. A bare SHA-256 of a 200-character phrase
     * is reversible by guessing, so if this ever stops depending on the key,
     * "this is a dedupe key and not anonymization" becomes "this is neither".
     */
    const a = questionHmac('cara bunuh diri');
    vi.stubEnv('FIELD_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64url'));
    expect(questionHmac('cara bunuh diri')).not.toBe(a);
  });

  it('returns an obvious sentinel rather than throwing when the key is missing', () => {
    // Throwing would fail a write that runs inside after(), where the throw is
    // invisible, and would lose the tuning row over a missing hash.
    vi.stubEnv('FIELD_ENCRYPTION_KEY', '');
    expect(questionHmac('anything')).toBe('nokey');
  });
});

describe('what gets stored', () => {
  const capture = () => {
    const values = vi.fn();
    return { db: { insert: vi.fn(() => ({ values })), execute: vi.fn() }, values };
  };

  it('encrypts the question rather than storing it in the clear', async () => {
    const { db, values } = capture();
    await recordModerationFlag(
      { userId: 'u1', question: CANARY, verdict: blocked, locale: 'id', action: 'blocked' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
    );

    const row = values.mock.calls[0][0];
    expect(row.question).not.toContain(CANARY);
    // The `v1.` envelope is greppable on purpose -- see crypto.ts. The audit
    // query for "is this column actually encrypted" relies on it.
    expect(row.question.startsWith('v1.')).toBe(true);
  });

  it('NEVER stores the text for sexual_minor, at any retention', async () => {
    /*
     * W7-D19, and the one category with no thirty-day grace. Storing that text
     * IS the exposure and there is no tuning benefit worth it. `redacted_at`
     * stays null, which is what distinguishes "never stored" from "stored and
     * later removed" -- without it the retention policy is unverifiable from
     * the data.
     */
    const { db, values } = capture();
    await recordModerationFlag(
      {
        userId: 'u1',
        question: CANARY,
        verdict: { ...blocked, category: 'sexual_minor', clause: '6.5' },
        locale: 'id',
        action: 'blocked',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
    );

    const row = values.mock.calls[0][0];
    expect(row.question).toBeNull();
    expect(row.redactedAt).toBeUndefined();
    // The HMAC is still written: it is the only thing left to dedupe on.
    expect(row.questionHmac).not.toBe('noquestion');
    expect(row.questionHmac.length).toBeGreaterThan(10);
  });

  it('writes the near-miss row too', async () => {
    /*
     * Without `allowed_flagged`, every row in the table is a block and the
     * false-negative side of tuning is invisible forever.
     */
    const { db, values } = capture();
    await recordModerationFlag(
      {
        userId: 'u1',
        question: 'sesuatu yang aneh',
        verdict: {
          blocked: false,
          source: 'classifier',
          category: 'other',
          confidence: 0.42,
          latencyMs: 700,
        },
        locale: 'en',
        action: 'allowed_flagged',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
    );

    expect(values.mock.calls[0][0]).toMatchObject({
      action: 'allowed_flagged',
      category: 'other',
      confidence: 0.42,
      locale: 'en',
      patternId: null,
    });
  });

  it('writes nothing at all when there is no category to tune on', async () => {
    const { db, values } = capture();
    await recordModerationFlag(
      {
        userId: 'u1',
        question: 'apakah dia jodohku',
        verdict: { blocked: false, source: 'classifier', category: null, confidence: 1, latencyMs: 500 },
        locale: 'id',
        action: 'allowed_flagged',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
    );
    expect(values).not.toHaveBeenCalled();
  });

  it('records the pattern id for a blocklist deny and null for a classifier one', async () => {
    const { db, values } = capture();
    await recordModerationFlag(
      { userId: null, question: 'x', verdict: blocked, locale: 'id', action: 'blocked' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
    );
    // `user_id` null is legitimate: the FK is ON DELETE SET NULL and the row
    // outlives the account. `moderationFlagAad` spells the 'anon' case so no
    // caller interpolates the literal `null`.
    expect(values.mock.calls[0][0]).toMatchObject({ userId: null, patternId: 'id.self_harm.method' });
  });
});

describe('the sweep statements', () => {
  it('filters on question is not null, so it never rewrites a redacted row', async () => {
    const execute = vi.fn().mockResolvedValue({ count: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sweepRedactions({ execute } as any);

    const query = JSON.stringify(execute.mock.calls[0][0]);
    expect(query).toContain('question is not null');
    expect(query).toContain('redacted_at');
  });

  it('redacts one user immediately, ignoring the age window', async () => {
    /*
     * `on delete set null` orphans the row rather than removing it, so without
     * this an erased account leaves a self-harm disclosure sitting in the table
     * for up to thirty more days -- exactly what "delete my data" is meant to
     * prevent.
     */
    const execute = vi.fn().mockResolvedValue({ count: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await redactForUser({ execute } as any, 'u1');

    const query = JSON.stringify(execute.mock.calls[0][0]);
    expect(query).toContain('user_id');
    expect(query).not.toContain('make_interval');
  });
});
