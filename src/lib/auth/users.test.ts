import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { parseUsers, verifyCredentials } from './users';

/* Cost 4, not 12: these run on every test invocation and the cost factor is
   irrelevant to what is being tested. Production hashes are generated at 12. */
const HASH = bcrypt.hashSync('correct horse', 4);
const USERS = JSON.stringify([{ u: 'miftah', h: HASH }]);

describe('parseUsers', () => {
  it('reads a well-formed list', () => {
    expect(parseUsers(USERS)).toEqual([{ u: 'miftah', h: HASH }]);
  });

  /*
   * These are the tests that matter. A parsing bug that quietly yields an
   * empty list would make every password wrong -- annoying but safe. A bug
   * that yields a malformed entry which then compares loosely could admit
   * anyone. Both must be loud, at load, rather than at the first login.
   */
  it('throws on malformed JSON rather than failing open', () => {
    expect(() => parseUsers('{not json')).toThrow(/AUTH_USERS/);
  });

  it('throws when the value is not an array', () => {
    expect(() => parseUsers('{"u":"miftah","h":"x"}')).toThrow(/AUTH_USERS/);
  });

  it('throws on an entry missing its hash', () => {
    expect(() => parseUsers('[{"u":"miftah"}]')).toThrow(/AUTH_USERS/);
  });

  it('throws on an empty list, which would lock everyone out silently', () => {
    expect(() => parseUsers('[]')).toThrow(/AUTH_USERS/);
  });

  it('throws when unset', () => {
    expect(() => parseUsers(undefined)).toThrow(/AUTH_USERS/);
  });
});

describe('verifyCredentials', () => {
  it('accepts the right password', async () => {
    expect(await verifyCredentials('miftah', 'correct horse', USERS)).toBe('miftah');
  });

  it('rejects the wrong password', async () => {
    expect(await verifyCredentials('miftah', 'wrong horse', USERS)).toBeNull();
  });

  it('rejects an unknown username', async () => {
    expect(await verifyCredentials('nobody', 'correct horse', USERS)).toBeNull();
  });

  it('rejects an empty password against a real user', async () => {
    expect(await verifyCredentials('miftah', '', USERS)).toBeNull();
  });

  it('is case-sensitive on the username', async () => {
    expect(await verifyCredentials('Miftah', 'correct horse', USERS)).toBeNull();
  });
});
