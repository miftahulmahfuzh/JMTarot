import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientIp } from './clientIp';

afterEach(() => vi.unstubAllEnvs());

describe('on Vercel', () => {
  const onVercel = () => vi.stubEnv('VERCEL', '1');

  it('IGNORES the leftmost x-forwarded-for entry, which the caller chooses', () => {
    /*
     * **THE DEFECT V9 FIXES.** `/api/events` took `split(',')[0]` from W4 until
     * now, so an attacker sending a different first entry per request got a fresh
     * 60-batch budget every time -- a limiter that limits only honest users.
     *
     * Vercel OVERWRITES this header rather than appending to it (verified
     * 2026-07-27: *"we currently overwrite the X-Forwarded-For header and do not
     * forward external IPs. This restriction is in place to prevent IP
     * spoofing"*), so in production a multi-entry chain should not arise at all.
     * Taking the LAST entry is right under both behaviours -- a one-element list's
     * last element is its only element -- which is why it is written this way
     * round rather than depending on which one Vercel does.
     */
    onVercel();
    const h = new Headers({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' });
    expect(clientIp(h)).toBe('203.0.113.7');
  });

  it('prefers x-vercel-forwarded-for, the only one a front proxy cannot touch', () => {
    /*
     * All three headers are documented as identical, with one difference that
     * decides the order: `x-forwarded-for` (and by extension `x-real-ip`) *"could
     * be overwritten if you're using a proxy on top of Vercel"*, and
     * `x-vercel-forwarded-for` is the one Vercel guarantees. JMTarot has no such
     * proxy today; preferring the guaranteed header costs one lookup and means
     * adding one later is not a silent regression in the limiter.
     */
    onVercel();
    const h = new Headers({
      'x-vercel-forwarded-for': '203.0.113.7',
      'x-real-ip': '9.9.9.9',
      'x-forwarded-for': '8.8.8.8',
    });
    expect(clientIp(h)).toBe('203.0.113.7');
  });

  it('prefers x-real-ip over the chain', () => {
    onVercel();
    const h = new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '9.9.9.9' });
    expect(clientIp(h)).toBe('203.0.113.7');
  });

  it('returns `unknown` on Vercel with no address at all', () => {
    /*
     * Should never happen, and is worth seeing if it does -- hence its own bucket
     * rather than being folded into `local`. It shares ONE budget, which is the
     * conservative choice with a known cost: somebody who could strip Vercel's own
     * headers would exhaust it for everybody else in the same state. They cannot.
     */
    onVercel();
    expect(clientIp(new Headers())).toBe('unknown');
  });

  it('ignores a blank platform header rather than keying on empty string', () => {
    onVercel();
    const h = new Headers({ 'x-real-ip': '   ', 'x-forwarded-for': '203.0.113.7' });
    expect(clientIp(h)).toBe('203.0.113.7');
  });

  it('ignores a trailing empty entry in the chain', () => {
    onVercel();
    const h = new Headers({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7, ' });
    expect(clientIp(h)).toBe('203.0.113.7');
  });
});

describe('IPv6 is keyed by /64', () => {
  const onVercel = () => vi.stubEnv('VERCEL', '1');

  it('keys an IPv6 caller by /64, because one subscriber has 2^64 addresses', () => {
    /*
     * **PER-ADDRESS LIMITING ON IPv6 IS NOT A WEAK LIMIT, IT IS NO LIMIT.** A
     * phone on a mobile network can walk a new source address per request without
     * trying, so every request would arrive with a fresh budget and V7's whole
     * slug-enumeration argument would rest on nothing. The /64 is the smallest
     * unit a residential or mobile allocation is handed out in, so it is the
     * smallest unit that corresponds to a caller.
     */
    onVercel();
    const a = new Headers({ 'x-real-ip': '2001:db8:1234:5678:1:2:3:4' });
    const b = new Headers({ 'x-real-ip': '2001:db8:1234:5678:9:9:9:9' });
    expect(clientIp(a)).toBe(clientIp(b));
    expect(clientIp(a)).toBe('2001:db8:1234:5678::/64');
  });

  it('keeps two different /64s apart', () => {
    // The other half: coarsening must not merge separate customers.
    onVercel();
    const a = new Headers({ 'x-real-ip': '2001:db8:1234:5678:1:2:3:4' });
    const b = new Headers({ 'x-real-ip': '2001:db8:1234:9999:1:2:3:4' });
    expect(clientIp(a)).not.toBe(clientIp(b));
  });

  it('leaves IPv4 alone -- a /24 is a neighbourhood, not a household', () => {
    onVercel();
    expect(clientIp(new Headers({ 'x-real-ip': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('does not guess at a compressed form', () => {
    /*
     * `::` makes the /64 ambiguous without expansion, and an ambiguous key is
     * worse than a coarse one: two different callers could normalize together,
     * which is one caller exhausting another's budget. Keying the full address is
     * the weaker limit and the honest one.
     */
    onVercel();
    const h = new Headers({ 'x-real-ip': '2001:db8::1' });
    expect(clientIp(h)).toBe('2001:db8::1');
  });
});

describe('off Vercel', () => {
  it('falls back to `local`', () => {
    /*
     * `npm run dev` and the iframe harnesses under `public/cards/`. There is no
     * proxy and no attacker, so there is nothing to be strict about -- and one
     * shared bucket is what makes a local rate-limit test reproducible.
     */
    expect(clientIp(new Headers())).toBe('local');
  });

  it('still reads a header when one is present, leftmost and all', () => {
    // No proxy locally, so the leftmost entry IS the client. Being strict here
    // would only make `npm run dev` disagree with production for no gain.
    const h = new Headers({ 'x-forwarded-for': '127.0.0.1' });
    expect(clientIp(h)).toBe('127.0.0.1');
  });
});
