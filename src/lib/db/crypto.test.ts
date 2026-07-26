import { randomBytes } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  answerAad,
  decryptField,
  encryptField,
  isEncrypted,
  moderationFlagAad,
} from './crypto';

const AAD = answerAad('11111111-1111-1111-1111-111111111111', 'worst_thing');

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64url');
});

/**
 * Every decrypt failure logs, deliberately -- a missing FIELD_ENCRYPTION_KEY
 * would otherwise be a silent column of nulls. That makes the expected output
 * of this file noisy, so it is captured rather than printed, and two tests
 * assert on it.
 */
function captureWarnings() {
  return vi.spyOn(console, 'warn').mockImplementation(() => {});
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the AAD helpers', () => {
  it('binds an onboarding answer to its user and its question', () => {
    expect(answerAad('u1', 'color')).toBe('onboarding_answers:u1:color');
  });

  it('binds a moderation flag to its user, and names the anonymous case', () => {
    // The column is nullable on user_id (ON DELETE SET NULL), so the AAD has
    // to have a defined value for a row with no user -- otherwise the string
    // 'null' or 'undefined' leaks in from whatever the caller happened to have.
    expect(moderationFlagAad('u1')).toBe('moderation_flags:u1');
    expect(moderationFlagAad(null)).toBe('moderation_flags:anon');
  });
});

describe('field encryption', () => {
  it('round-trips Indonesian text with accents and emoji', () => {
    const plain = 'Sesuatu yang berat, dengan tanda kutip " dan émoji 🌙';
    expect(decryptField(encryptField(plain, AAD), AAD)).toBe(plain);
  });

  it('round-trips the empty string as distinct from null', () => {
    // '' and NULL mean different things in this column: answered with nothing
    // versus skipped. If the envelope cannot carry '' they collapse.
    expect(decryptField(encryptField('', AAD), AAD)).toBe('');
  });

  it('produces a different ciphertext every time for the same plaintext', () => {
    // A fixed IV would let anyone with the dump see which users answered the
    // same thing. This asserts the IV is random, not that encryption "works".
    expect(encryptField('sama', AAD)).not.toBe(encryptField('sama', AAD));
  });

  it('carries its own IV and tag in a self-describing envelope', () => {
    const stored = encryptField('rahasia', AAD);
    expect(stored.split('.')).toHaveLength(4);
    expect(stored.startsWith('v1.')).toBe(true);
    expect(isEncrypted(stored)).toBe(true);
  });

  it('never emits a character that needs escaping in a .env, a URL or a log', () => {
    expect(encryptField('rahasia', AAD)).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['plaintext', 'not even close'],
    ['an empty string', ''],
    ['a truncated envelope', 'v1.abc'],
    ['an unknown version', 'v2.aaa.bbb.ccc'],
  ])('isEncrypted is false for %s', (_label, input) => {
    expect(isEncrypted(input as string | null | undefined)).toBe(false);
  });
});

describe('field encryption refuses what it should', () => {
  it('refuses to decrypt under a different AAD', () => {
    captureWarnings();
    const stored = encryptField('rahasia', AAD);
    expect(
      decryptField(stored, answerAad('22222222-2222-2222-2222-222222222222', 'worst_thing')),
    ).toBeNull();
  });

  it('refuses to decrypt under the same user but a different question', () => {
    captureWarnings();
    const stored = encryptField('rahasia', AAD);
    expect(
      decryptField(stored, answerAad('11111111-1111-1111-1111-111111111111', 'best_thing')),
    ).toBeNull();
  });

  it('refuses to decrypt a tampered tag', () => {
    captureWarnings();
    const parts = encryptField('rahasia', AAD).split('.');
    parts[3] = randomBytes(16).toString('base64url');
    expect(decryptField(parts.join('.'), AAD)).toBeNull();
  });

  it('refuses to decrypt a tampered ciphertext', () => {
    captureWarnings();
    const parts = encryptField('rahasia', AAD).split('.');
    parts[2] = randomBytes(8).toString('base64url');
    expect(decryptField(parts.join('.'), AAD)).toBeNull();
  });

  it('refuses to decrypt under a different key', () => {
    captureWarnings();
    const saved = process.env.FIELD_ENCRYPTION_KEY;
    const stored = encryptField('rahasia', AAD);
    process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64url');
    try {
      // Also the memoization test: if key() cached the first value and never
      // re-read process.env, this decrypts fine and the assertion fails.
      expect(decryptField(stored, AAD)).toBeNull();
    } finally {
      process.env.FIELD_ENCRYPTION_KEY = saved;
    }
  });
});

/*
 * The asymmetry below is the whole design, and reversing either half gives you,
 * in order: a column of plaintext trauma descriptions, or an onboarding page
 * that 500s for every user the moment a key is rotated.
 */
describe('decrypt degrades, encrypt refuses', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['garbage', 'not even close'],
    ['a truncated envelope', 'v1.abc'],
    ['an unknown version', 'v2.aaa.bbb.ccc'],
    ['an empty string', ''],
  ])('returns null rather than throwing for %s', (_label, input) => {
    captureWarnings();
    expect(decryptField(input as string | null | undefined, AAD)).toBeNull();
  });

  it('returns null rather than throwing when the key is gone', () => {
    const warn = captureWarnings();
    const saved = process.env.FIELD_ENCRYPTION_KEY;
    const stored = encryptField('rahasia', AAD);
    delete process.env.FIELD_ENCRYPTION_KEY;
    try {
      expect(decryptField(stored, AAD)).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      process.env.FIELD_ENCRYPTION_KEY = saved;
    }
  });

  it('logs the AAD and the reason, and never the ciphertext or the key', () => {
    const warn = captureWarnings();
    const key = process.env.FIELD_ENCRYPTION_KEY!;
    const stored = encryptField('rahasia', AAD);
    decryptField(stored, answerAad('33333333-3333-3333-3333-333333333333', 'color'));

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('onboarding_answers:33333333-3333-3333-3333-333333333333:color');
    expect(logged).not.toContain(stored);
    expect(logged).not.toContain(key);
  });

  it('THROWS rather than storing plaintext when the key is gone', () => {
    const saved = process.env.FIELD_ENCRYPTION_KEY;
    delete process.env.FIELD_ENCRYPTION_KEY;
    try {
      expect(() => encryptField('rahasia', AAD)).toThrow(/FIELD_ENCRYPTION_KEY/);
    } finally {
      process.env.FIELD_ENCRYPTION_KEY = saved;
    }
  });

  it('rejects a key that is not 32 bytes', () => {
    const saved = process.env.FIELD_ENCRYPTION_KEY;
    process.env.FIELD_ENCRYPTION_KEY = randomBytes(16).toString('base64url');
    try {
      expect(() => encryptField('x', AAD)).toThrow(/32 bytes/);
    } finally {
      process.env.FIELD_ENCRYPTION_KEY = saved;
    }
  });

  it('accepts a key generated as plain base64, not just base64url', () => {
    // Buffer's base64 decoder accepts the URL-safe alphabet too, so whichever
    // command someone ran to generate the key, it works. .env.example
    // recommends base64url only because its alphabet has no `$` to escape.
    const saved = process.env.FIELD_ENCRYPTION_KEY;
    process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    try {
      expect(decryptField(encryptField('halo', AAD), AAD)).toBe('halo');
    } finally {
      process.env.FIELD_ENCRYPTION_KEY = saved;
    }
  });
});
