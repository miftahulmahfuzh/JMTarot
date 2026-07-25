import bcrypt from 'bcryptjs';

export type User = { u: string; h: string };

/**
 * A bcrypt hash of a password nobody has, compared against when the username
 * is unknown.
 *
 * Without this, an unknown username returns immediately while a known one
 * spends ~100ms in bcrypt, and the difference tells an attacker which of the
 * two usernames exist. With two accounts that is a small leak, but the fix is
 * three lines. Generated once at module load, not per request.
 */
const DECOY_HASH = bcrypt.hashSync('decoy-password-for-constant-time-behaviour', 12);

/**
 * Parse AUTH_USERS, or throw.
 *
 * Every failure mode here throws rather than returning an empty list, and that
 * is the whole point. A parsing bug that yields no users fails closed and is
 * merely confusing; one that yields a malformed entry could compare loosely
 * and admit anyone. Both must surface immediately and by name -- a login that
 * works locally and fails in production should point straight at this JSON.
 */
export function parseUsers(raw: string | undefined): User[] {
  if (!raw) throw new Error('AUTH_USERS is not set');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('AUTH_USERS is not valid JSON');
  }

  if (!Array.isArray(parsed)) throw new Error('AUTH_USERS must be a JSON array');
  if (parsed.length === 0) throw new Error('AUTH_USERS is empty, so nobody could log in');

  return parsed.map((entry, i) => {
    const ok =
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as User).u === 'string' &&
      typeof (entry as User).h === 'string' &&
      (entry as User).u.length > 0 &&
      (entry as User).h.startsWith('$2');
    if (!ok) {
      throw new Error(`AUTH_USERS entry ${i} must be {"u": string, "h": bcrypt hash}`);
    }
    return { u: (entry as User).u, h: (entry as User).h };
  });
}

/**
 * Check a username and password, returning the username on success.
 *
 * Unknown user and wrong password take the same path and the same time, and
 * the caller returns the same message for both, so the response never reveals
 * which usernames exist.
 */
export async function verifyCredentials(
  username: string,
  password: string,
  raw = process.env.AUTH_USERS,
): Promise<string | null> {
  const users = parseUsers(raw);
  const found = users.find((u) => u.u === username);
  const ok = await bcrypt.compare(password, found?.h ?? DECOY_HASH);
  return ok && found ? found.u : null;
}
