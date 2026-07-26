/**
 * Application-level field encryption for the highest-liability columns in the
 * product: `onboarding_answers.answer_text` (roadmap §8/D11) and
 * `moderation_flags.question` (reconciliation R15).
 *
 * STORED FORMAT
 *
 *     v1.<base64url iv, 12 bytes>.<base64url ciphertext>.<base64url tag, 16 bytes>
 *
 * A 7-character answer produces a 53-character value; the overhead is a flat
 * ~60 characters. Four reasons for this shape over one opaque blob:
 *
 *   1. `v1.` IS GREPPABLE. The audit query for "is this column actually
 *      encrypted" is
 *        select count(*) from onboarding_answers
 *         where answer_text is not null and answer_text not like 'v1.%';
 *      and it can be run by someone who has never read this file. It must
 *      return 0.
 *   2. BASE64URL HAS NO `+`, `/`, `=` OR `$`. Safe in a log line, a URL, a JSON
 *      body and a .env file, with no quoting and no escaping -- which matters
 *      in this project specifically, where a `$` in a .env value is expanded
 *      away by Next and arrives mangled.
 *   3. THE VERSION PREFIX IS THE ROTATION SEAM. A `v2` with a new key or a new
 *      cipher can be read alongside `v1` with no backfill.
 *   4. THE IV TRAVELS WITH THE CIPHERTEXT, so nothing else in the schema -- no
 *      extra column, no side table -- has to know GCM exists.
 *
 * THE ASYMMETRY IS THE DESIGN. `encryptField` throws; `decryptField` returns
 * null. Reverse either one and you get, in order: a column of plaintext trauma
 * descriptions, or an onboarding page that 500s for every user the moment a
 * key is rotated. Roadmap §8 makes every free-text answer skippable and
 * requires the app to work without it, so an undecryptable answer takes the
 * same path as a skipped one.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { requireEnv } from '@/lib/env';

const VERSION = 'v1';
const IV_BYTES = 12; // 96-bit nonce: the size GCM is specified for
const KEY_BYTES = 32; // AES-256

/*
 * Memoized against the SOURCE STRING, not unconditionally.
 *
 * A plain `if (cached) return cached` would make key rotation invisible until
 * the process restarted, and -- more immediately -- would make the tests that
 * delete or replace the env var pass spuriously off a warm cache. Keying the
 * cache on the raw value costs one string comparison and cannot go stale.
 *
 * A test-only `__resetKeyCache()` export would also work and is not used
 * deliberately: a test-only export is a foothold for production code.
 */
let cachedSource: string | null = null;
let cachedKey: Buffer | null = null;

function key(): Buffer {
  const raw = requireEnv('FIELD_ENCRYPTION_KEY');
  if (cachedKey && raw === cachedSource) return cachedKey;

  // Buffer's base64 decoder accepts the URL-safe alphabet too, so a key
  // generated as either base64 or base64url works.
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== KEY_BYTES) {
    throw new Error(
      `FIELD_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${decoded.length}`,
    );
  }

  cachedSource = raw;
  cachedKey = decoded;
  return decoded;
}

/**
 * The AAD for an onboarding answer.
 *
 * Exported so W3 cannot invent its own format: the AAD is part of the
 * ciphertext's identity, and two callers disagreeing about it is
 * indistinguishable from data loss. Binding it to the row means a ciphertext
 * copied from one user's row into another's fails to decrypt instead of
 * quietly reading as that user's answer.
 */
export function answerAad(userId: string, questionKey: string): string {
  return `onboarding_answers:${userId}:${questionKey}`;
}

/**
 * The AAD for a moderation flag's question text (reconciliation R15).
 *
 * `moderation_flags.user_id` is nullable -- it is ON DELETE SET NULL, so the
 * row outlives the account -- and the AAD still has to be a defined string.
 * `'anon'` is that value, spelled here once so a caller cannot end up
 * interpolating the literal `null` or `undefined`.
 *
 * Note that redaction nulls the column rather than re-encrypting it, so a row
 * whose user was erased is never re-keyed and never needs to be.
 */
export function moderationFlagAad(userId: string | null | undefined): string {
  return `moderation_flags:${userId ?? 'anon'}`;
}

/**
 * Encrypt a value for storage.
 *
 * THROWS if the key is missing or malformed. It must never fall back to
 * plaintext: the alternative is silently writing readable text into the column
 * the privacy policy promises is encrypted.
 */
export function encryptField(plaintext: string, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    tag.toString('base64url'),
  ].join('.');
}

/**
 * Decrypt a stored value, or return null.
 *
 * NEVER THROWS. Returns null on a missing key, a wrong key, a wrong AAD, a
 * truncated value, a tampered tag or ciphertext, and a version this build does
 * not know.
 *
 * The failure is logged -- the AAD and the reason, never the ciphertext and
 * never the key -- because a missing FIELD_ENCRYPTION_KEY would otherwise be a
 * silent column of nulls that reads exactly like a column of skipped answers.
 */
export function decryptField(stored: string | null | undefined, aad: string): string | null {
  if (!isEncrypted(stored)) {
    if (stored != null && stored !== '') {
      console.warn(`decryptField: value is not a ${VERSION} envelope [aad=${aad}]`);
    }
    return null;
  }

  const [, ivPart, ctPart, tagPart] = stored.split('.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivPart, 'base64url'));
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (err) {
    // The message, not the error: a thrown crypto error's stack is noise, and
    // the two cases worth telling apart -- no key at all, versus a key that
    // does not open this value -- are both in the message.
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`decryptField: failed [aad=${aad}] ${reason}`);
    return null;
  }
}

/**
 * `true` if the value is in the v1 envelope. The audit helper, and the guard
 * `decryptField` uses before it touches the key at all.
 *
 * Declared as a type predicate rather than plain `boolean` so that narrowing
 * survives the guard -- otherwise every caller needs a second null check that
 * can never fire.
 */
export function isEncrypted(stored: string | null | undefined): stored is string {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('.');
  // The ciphertext part is allowed to be empty -- encrypting '' is legitimate
  // and means "answered with nothing", which is not the same as skipped.
  return (
    parts.length === 4 &&
    parts[0] === VERSION &&
    parts[1].length > 0 &&
    parts[3].length > 0
  );
}
