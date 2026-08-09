import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_PARAM,
  HANDOFF_TTL_SECONDS,
  PWA_COOKIE,
  PWA_COOKIE_MAX_AGE,
  START_URL,
  deviceHash,
  handoffPath,
  isPwaLaunch,
  newSecret,
} from './handoff';

/**
 * The edge-safe half of the standalone sign-in handoff.
 *
 * **THE THING THAT ACTUALLY MATTERS HERE CANNOT BE TESTED IN THIS FILE, AND IS
 * NOT THE FILE'S FAULT.** Whether an installed iPhone web app can sign in is
 * loop 6 and nothing else: loop 5 has ONE cookie jar and iOS has two, which is
 * precisely why the bug survived three releases as *"the largest unverified risk
 * in the project"*. What Vitest can own is the arithmetic — the marker the
 * manifest emits and middleware recognises, and the hash that keeps the device
 * secret out of the table.
 */
describe('the launch marker', () => {
  it('is recognised in exactly the shape the manifest emits', () => {
    /*
     * **THE ONE ASSERTION THAT WOULD CATCH THE WHOLE FEATURE BEING DEAD.** The
     * manifest writes `START_URL` and middleware calls `isPwaLaunch`; if the two
     * ever disagree no cookie is ever set, no handoff row is ever written, and the
     * installed app is back to never being able to sign in — with every other test
     * in this project still green, because everything downstream is reached only
     * by a browser that has the cookie.
     */
    const url = new URL(START_URL, 'https://www.jmtarot.site');
    expect(isPwaLaunch(url.pathname, url.searchParams)).toBe(true);
  });

  it('answers only for the root', () => {
    // The marker exists in one place. Honouring it elsewhere would only widen the
    // ways a shared link can plant the cookie in an ordinary browser.
    const params = new URLSearchParams('src=pwa');
    expect(isPwaLaunch('/', params)).toBe(true);
    expect(isPwaLaunch('/login', params)).toBe(false);
    expect(isPwaLaunch('/gallery', params)).toBe(false);
    expect(isPwaLaunch('/en', params)).toBe(false);
  });

  it('answers false for an ordinary visit and for a near miss', () => {
    expect(isPwaLaunch('/', new URLSearchParams())).toBe(false);
    expect(isPwaLaunch('/', new URLSearchParams('src=pwax'))).toBe(false);
    expect(isPwaLaunch('/', new URLSearchParams('source=pwa'))).toBe(false);
    expect(isPwaLaunch('/', new URLSearchParams('utm_source=pwa'))).toBe(false);
  });

  it('keeps `/` as `/`, so the landing page keeps one address', () => {
    /*
     * A QUERY PARAMETER AND NEVER A SECOND PATH. `/` carries a canonical and an
     * `hreflang` set; a `/app` twin would be a duplicate of the landing page in the
     * index, and `contentRewrite` — which is handed a pathname alone — would have
     * had to learn about it.
     */
    expect(new URL(START_URL, 'https://x.test').pathname).toBe('/');
  });
});

describe('the two opaque values', () => {
  it('mints 256 bits of base64url, with no character that needs escaping', () => {
    /*
     * base64url for `crypto.ts`'s reason: no `+`, `/`, `=` or `$`, so the value is
     * safe in a cookie, in a URL, in a JSON body and in a `.env` file — and this
     * project has already been bitten once by a `$` in a value Next expanded away.
     */
    const secret = newSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('does not repeat', () => {
    // Not a randomness test — that is `crypto.getRandomValues`'s job. This is the
    // negative control for somebody "simplifying" it into a counter or a timestamp.
    const seen = new Set(Array.from({ length: 200 }, () => newSecret()));
    expect(seen.size).toBe(200);
  });

  it('survives a round trip through a URL untouched', () => {
    const challenge = newSecret();
    const url = new URL(handoffPath(challenge), 'https://www.jmtarot.site');
    expect(url.pathname).toBe('/handoff');
    expect(url.searchParams.get(CHALLENGE_PARAM)).toBe(challenge);
  });
});

describe('deviceHash', () => {
  it('is deterministic and 64 hex characters', async () => {
    const secret = newSecret();
    expect(await deviceHash(secret)).toBe(await deviceHash(secret));
    expect(await deviceHash(secret)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches the known SHA-256 of a known input', async () => {
    // A fixed vector, so a future edit cannot quietly change the algorithm and
    // leave every EXISTING device cookie unable to match its own row.
    expect(await deviceHash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('contains no part of the secret, which is the whole reason it is stored', async () => {
    /*
     * **THE TABLE HOLDS THE HASH AND NEVER THE SECRET**, so a dump of
     * `auth_handoffs` cannot be replayed into a session. Asserted rather than
     * assumed, because the failure mode of storing the secret is invisible until
     * somebody has the dump.
     */
    const secret = newSecret();
    const hash = await deviceHash(secret);
    expect(hash).not.toContain(secret);
    expect(hash).not.toContain(secret.slice(0, 8));
  });

  it('separates two devices', async () => {
    expect(await deviceHash(newSecret())).not.toBe(await deviceHash(newSecret()));
  });
});

describe('the constants', () => {
  it('gives the handoff five minutes and the device cookie years', () => {
    /*
     * The relationship is the point, not the numbers. The device secret is the
     * standalone jar's NAME FOR ITSELF and has to outlive every session — it must
     * still be there the day a seven-day session lapses and the querent signs in
     * again. The handoff is a five-minute capability. A future edit that made them
     * comparable would have got one of the two wrong.
     */
    expect(HANDOFF_TTL_SECONDS).toBe(300);
    expect(PWA_COOKIE_MAX_AGE).toBeGreaterThan(HANDOFF_TTL_SECONDS * 1000);
  });

  it('names the cookie in this project’s own namespace', () => {
    // `jmt_locale` is the only other cookie this application writes.
    expect(PWA_COOKIE).toBe('jmt_pwa');
  });
});
