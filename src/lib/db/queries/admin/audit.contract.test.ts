import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADMIN_RESOURCES } from './audit';

const SRC = readFileSync('src/lib/db/queries/admin/audit.ts', 'utf8');

describe('the audit primitive is APPEND-ONLY (A1-14, roadmap §9.14)', () => {
  it('has no update and no delete path', () => {
    // "A delete button on an audit trail is the audit trail's absence" (A-D16).
    // The table has no `updated_at` for the same reason: a column that exists
    // invites a write.
    expect(SRC).not.toMatch(/\.update\(/);
    expect(SRC).not.toMatch(/\.delete\(/);
  });
});

describe('the audit primitive NEVER touches plaintext (A1-13)', () => {
  it('imports nothing from the field-encryption module', () => {
    expect(SRC).not.toMatch(/@\/lib\/db\/crypto/);
    expect(SRC).not.toMatch(/decryptField|encryptField/);
  });

  it('does not name the encrypted columns', () => {
    // `resource_key` is a QUESTION KEY or a FLAG ID. A plaintext answer inside an
    // append-only table that survives account erasure would be the worst row in
    // this database.
    expect(SRC).not.toMatch(/answerText|answer_text|questionHmac/);
  });
});

describe('the resource set is closed and A1 owns it', () => {
  it('is exactly the four names roadmap §3.1 lists', () => {
    expect([...ADMIN_RESOURCES]).toEqual([
      'onboarding_answer',
      'moderation_question',
      'user_detail',
      'reading_body',
    ]);
  });
});

describe('the write does NOT swallow its own failure (A1-11, R30)', () => {
  it('contains no try/catch and no rejection handler', () => {
    /*
     * **THIS INVERTS W4's RULE ON PURPOSE.** `persistReading`, `flushEvents` and
     * every `after()` in this project fail silently and log, because analytics
     * must never be on the path of a byte the user is waiting for. A-D16 says the
     * opposite here: *a failed audit write is a failed reveal*, and a swallowed
     * rejection added for consistency would produce a reveal with no record and
     * nothing on fire.
     *
     * R30 is the ruling and it names the failure mode: written in house style,
     * A5's invariant becomes unimplementable AND LOOKS IMPLEMENTED.
     */
    expect(SRC).not.toMatch(/catch\s*\(/);
    expect(SRC).not.toMatch(/\.catch\(/);
  });
});
