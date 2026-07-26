import { describe, expect, it } from 'vitest';
import { absoluteCapExpired, maySignIn, readExternalSub, readToken, readUid } from './token';

const UID = '3f9a2c71-4b0e-4d21-9c88-1a2b3c4d5e6f';

function valid(over: Record<string, unknown> = {}) {
  return {
    sub: '107384726150398472615',
    uid: UID,
    email: 'someone@example.com',
    name: 'Someone Nameish',
    onb: true,
    loc: 'id',
    abs: 1_800_000_000,
    ...over,
  };
}

describe('readToken', () => {
  it('accepts a well-formed token', () => {
    expect(readToken(valid())).toEqual({
      sub: '107384726150398472615',
      uid: UID,
      email: 'someone@example.com',
      name: 'Someone Nameish',
      onb: true,
      loc: 'id',
      abs: 1_800_000_000,
    });
  });

  it('accepts a token with no absolute cap', () => {
    // SESSION_ABSOLUTE_TTL_DAYS=0 is a documented escape hatch, so `abs` is
    // legitimately absent and must not invalidate the session.
    const { abs: _abs, ...noCap } = valid();
    expect(readToken(noCap)?.abs).toBeUndefined();
  });

  it('rejects a token with no uid', () => {
    // THE reason this function exists. Without it, `user.id` is `undefined`, it
    // reaches a SQL query as a foreign key, and the rows that result are
    // unattached to any user.
    const { uid: _uid, ...noUid } = valid();
    expect(readToken(noUid)).toBeNull();
    expect(readToken(valid({ uid: undefined }))).toBeNull();
    expect(readToken(valid({ uid: null }))).toBeNull();
    expect(readToken(valid({ uid: '' }))).toBeNull();
  });

  it('rejects a uid that is not uuid-shaped', () => {
    expect(readToken(valid({ uid: 'miftah' }))).toBeNull();
    expect(readToken(valid({ uid: '107384726150398472615' }))).toBeNull(); // a Google sub
    expect(readToken(valid({ uid: `${UID}extra` }))).toBeNull();
    expect(readToken(valid({ uid: 42 }))).toBeNull();
  });

  it('rejects a token minted before this change', () => {
    // The old cookie was a plain HS256 JWT carrying a username as `sub` and
    // nothing else. It cannot decode as a JWE at all, but the claim-shape check
    // is the backstop for anything that does -- a preview deploy, a rollback.
    expect(readToken({ sub: 'miftah', iat: 1, exp: 2 })).toBeNull();
  });

  it('rejects a token whose onb is not a boolean', () => {
    // `onb` gates /api/reading. A truthy string would pass a naive `if (token.onb)`
    // and make onboarding optional.
    expect(readToken(valid({ onb: 'true' }))).toBeNull();
    expect(readToken(valid({ onb: 1 }))).toBeNull();
    expect(readToken(valid({ onb: undefined }))).toBeNull();
  });

  it('rejects an unknown locale rather than passing it to the prompt layer', () => {
    expect(readToken(valid({ loc: 'ms' }))).toBeNull(); // Malay, of all things
    expect(readToken(valid({ loc: 'ID' }))).toBeNull();
    expect(readToken(valid({ loc: undefined }))).toBeNull();
  });

  it('rejects a missing or empty email', () => {
    expect(readToken(valid({ email: '' }))).toBeNull();
    expect(readToken(valid({ email: undefined }))).toBeNull();
  });

  it('tolerates a missing name, which is the one claim nothing depends on', () => {
    expect(readToken(valid({ name: undefined }))?.name).toBeNull();
    expect(readToken(valid({ name: '' }))?.name).toBeNull();
    expect(readToken(valid({ name: 42 }))?.name).toBeNull();
  });

  it('returns null rather than throwing on junk input', () => {
    // Called with whatever arrived in the cookie. A throw here is a 500 on every
    // route in the app instead of a redirect to /login.
    for (const junk of [null, undefined, '', 'nope', 0, [], true]) {
      expect(readToken(junk), String(junk)).toBeNull();
    }
  });
});

describe('readUid', () => {
  it('reads the uid out of an otherwise stale token', () => {
    // The `trigger === 'update'` branch runs against a token whose `onb` and
    // `loc` are the stale values it is about to replace. Demanding they narrow
    // cleanly first would be asking the wrong question.
    expect(readUid({ uid: UID, onb: 'stale nonsense' })).toBe(UID);
  });

  it('refuses anything that is not a uuid', () => {
    expect(readUid({ uid: 'miftah' })).toBeNull();
    expect(readUid({})).toBeNull();
    expect(readUid(null)).toBeNull();
    expect(readUid('a string')).toBeNull();
  });
});

describe('absoluteCapExpired', () => {
  const now = 1_800_000_000;

  it('is false when there is no cap', () => {
    expect(absoluteCapExpired({ uid: UID }, now)).toBe(false);
    expect(absoluteCapExpired({ uid: UID, abs: undefined }, now)).toBe(false);
    expect(absoluteCapExpired({ uid: UID, abs: null }, now)).toBe(false);
  });

  it('is false while the cap is in the future', () => {
    expect(absoluteCapExpired({ abs: now + 1 }, now)).toBe(false);
    expect(absoluteCapExpired({ abs: now + 86_400 }, now)).toBe(false);
  });

  it('is true at and after the cap', () => {
    expect(absoluteCapExpired({ abs: now }, now)).toBe(true);
    expect(absoluteCapExpired({ abs: now - 1 }, now)).toBe(true);
  });

  it('treats a malformed cap as expired', () => {
    // Fail closed. The cost is one extra sign-in; the alternative is a corrupted
    // claim quietly exempting a cookie from the only bound this design has.
    expect(absoluteCapExpired({ abs: 'soon' }, now)).toBe(true);
    expect(absoluteCapExpired({ abs: Number.NaN }, now)).toBe(true);
    expect(absoluteCapExpired({ abs: Number.POSITIVE_INFINITY }, now)).toBe(true);
  });

  it('does not throw on junk', () => {
    expect(absoluteCapExpired(null, now)).toBe(false);
    expect(absoluteCapExpired('nope', now)).toBe(false);
  });
});

describe('readExternalSub', () => {
  it('reads account.providerAccountId', () => {
    // Google's real sub is a decimal string.
    expect(readExternalSub({ provider: 'google', providerAccountId: '107384726150398472615' })).toBe(
      '107384726150398472615',
    );
    // The dev provider's synthetic sub.
    expect(readExternalSub({ provider: 'credentials', providerAccountId: 'dev:miftah' })).toBe(
      'dev:miftah',
    );
  });

  it('REFUSES a uuid-shaped providerAccountId', () => {
    // THE REGRESSION TEST, and it cost two orphaned users to learn.
    //
    // @auth/core overwrites user.id -- and therefore token.sub -- with a fresh
    // crypto.randomUUID() on every sign-in, deliberately
    // (callback/oauth/callback.js:218). It uses the same fallback for
    // providerAccountId when the profile had no sub. Either value is different on
    // every sign-in, so storing one as google_sub makes the upsert's conflict
    // target never match: every sign-in INSERTS.
    //
    // There is no error. There are just two rows with the same email, an app that
    // works, and memory features that silently read an empty history because
    // yesterday's readings belong to yesterday's row. Refusing turns that into a
    // failed sign-in the user can retry.
    expect(readExternalSub({ providerAccountId: '4d75b44f-4928-4e9d-bba2-5c44e895388e' })).toBeNull();
    expect(readExternalSub({ providerAccountId: 'E364EAC1-57F2-4040-883C-917E935E3599' })).toBeNull();
  });

  it('does not read token.sub, even when handed a whole token', () => {
    // The bug was `token.sub ?? account.providerAccountId`: token.sub is always
    // set, so the correct value was never reached. This function takes the account
    // and nothing else, so the two cannot be confused at a call site again.
    expect(readExternalSub({ sub: '107384726150398472615' })).toBeNull();
  });

  it('returns null on junk rather than throwing', () => {
    for (const junk of [null, undefined, {}, '', 'nope', { providerAccountId: 42 }, { providerAccountId: '' }]) {
      expect(readExternalSub(junk), JSON.stringify(junk)).toBeNull();
    }
  });
});

describe('maySignIn', () => {
  it('admits a verified email and refuses everything else', () => {
    expect(maySignIn({ emailVerified: true })).toBe(true);
    expect(maySignIn({ emailVerified: false })).toBe(false);
    // Strict equality on purpose: this is a security control, and `undefined`
    // arriving from a provider that did not send the claim must not be admitted
    // by a truthiness check that happens to be written the other way round.
    expect(maySignIn({ emailVerified: undefined as unknown as boolean })).toBe(false);
    expect(maySignIn({ emailVerified: 'yes' as unknown as boolean })).toBe(false);
  });
});
