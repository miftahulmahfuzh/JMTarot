/**
 * The client address, as far as the platform will vouch for it.
 *
 * **THE LEFTMOST `x-forwarded-for` ENTRY IS ATTACKER-CONTROLLED.** It is
 * whatever the original caller sent, and each hop APPENDS. Keying a limiter on
 * it means one header per request buys an unlimited number of budgets, which is
 * a limiter that limits only honest users. That is what shipped in
 * `/api/events` from W4 until V9; it was harmless while the budget was
 * per-instance and there was nothing worth doing with the endpoint, and it stops
 * being harmless the moment V7 makes a page public.
 *
 * ── WHAT VERCEL ACTUALLY DOES, VERIFIED 2026-07-27 ──────────────────────────
 *
 * It **overwrites** `x-forwarded-for` rather than appending to it: *"If you are
 * trying to use Vercel behind a proxy, we currently overwrite the
 * X-Forwarded-For header and do not forward external IPs. This restriction is in
 * place to prevent IP spoofing."* So in production the chain is one entry that
 * Vercel wrote, and the multi-entry case below should not arise at all.
 *
 * **TAKING THE LAST ENTRY IS CORRECT UNDER BOTH BEHAVIOURS** -- a one-element
 * list's last element is its only element -- and that is deliberately why it is
 * written this way round. It does not depend on which one Vercel does this year.
 *
 * `x-real-ip` and `x-vercel-forwarded-for` are both documented as *identical to*
 * `x-forwarded-for`, with one difference that fixes the order: the first two
 * *"could be overwritten if you're using a proxy on top of Vercel"* and
 * `x-vercel-forwarded-for` is the one Vercel guarantees. JMTarot has no such
 * proxy; preferring the guaranteed header costs one lookup and means adding one
 * later cannot silently regress the limiter.
 *
 * Off Vercel -- `npm run dev`, an iframe harness under `public/cards/` -- there
 * is no proxy and no attacker, so the leftmost entry is fine and everything
 * collapses to `local`.
 *
 * TAKES A `Headers`, NOT A `Request`, so a server component (`await headers()`),
 * a route handler (`request.headers`) and a unit test all call it identically.
 * V7's `/s/[slug]` is a page and would otherwise need a second copy.
 */

/**
 * The bucket for a request whose address we could not establish.
 *
 * ON VERCEL THIS SHOULD NEVER HAPPEN, and if it does it is worth seeing. It gets
 * its own key rather than being folded into `local`, and it shares one budget --
 * which is the conservative choice and has a known cost: an attacker who could
 * strip the platform's own headers would exhaust it for everyone in the same
 * state. They cannot, on Vercel. If this ever appears in query 9 with volume,
 * that assumption has broken and it is the finding, not the noise.
 */
const UNKNOWN = 'unknown';

export function clientIp(h: Headers): string {
  const onVercel = process.env.VERCEL === '1';

  if (onVercel) {
    // The one header a proxy placed on top of Vercel cannot overwrite.
    const vercelChain = lastEntry(h.get('x-vercel-forwarded-for'));
    if (vercelChain) return normalize(vercelChain);

    const real = h.get('x-real-ip')?.trim();
    if (real) return normalize(real);

    // Vercel OVERWRITES rather than appends, so this is normally one entry. The
    // last one is Vercel's either way; the first one is the caller's if anything.
    const chain = lastEntry(h.get('x-forwarded-for'));
    if (chain) return normalize(chain);

    return UNKNOWN;
  }

  const local = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim();
  return local ? normalize(local) : 'local';
}

/** The rightmost non-empty entry of a comma-separated forwarding chain. */
function lastEntry(chain: string | null): string | undefined {
  if (!chain) return undefined;
  const parts = chain
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : undefined;
}

/**
 * **AN IPv6 /64 IS ONE CUSTOMER, AND A SINGLE SUBSCRIBER HAS 2^64 ADDRESSES.**
 * Per-address limiting on IPv6 is not a weak limit, it is no limit: a phone on a
 * mobile network can walk a new source address per request without trying. The
 * /64 is the smallest unit a residential or mobile allocation is handed out in,
 * so it is the smallest unit that corresponds to a caller. IPv4 is left alone --
 * a /24 there is a whole neighbourhood, not one household.
 */
function normalize(ip: string): string {
  if (!ip.includes(':')) return ip;
  const groups = ip.split(':');
  // Refuse to guess at a compressed form; a `::` means the /64 is ambiguous
  // without expansion, and an ambiguous key is worse than a coarse one.
  if (ip.includes('::')) return ip;
  return groups.slice(0, 4).join(':') + '::/64';
}
