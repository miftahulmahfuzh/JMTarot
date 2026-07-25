/**
 * A per-user sliding window held in module scope.
 *
 * BE CLEAR ABOUT WHAT THIS IS. Serverless instances do not share memory and
 * cold starts reset the map, so a determined caller spread across instances
 * gets more than the limit. This is best-effort, not a guarantee.
 *
 * That is acceptable here because it is not the real protection. The login
 * gate is, and a spend cap set at the provider is the backstop. This exists to
 * stop one person holding the button down, which with two accounts is the only
 * realistic failure.
 *
 * If it ever needs to be real, swap the body of `hit()` for an Upstash Redis
 * call. The interface is one function precisely so that swap stays local.
 */

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 30;

const hits = new Map<string, number[]>();

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

export function hit(
  key: string,
  now = Date.now(),
  max = MAX_PER_WINDOW,
  windowMs = WINDOW_MS,
): RateLimitResult {
  const cutoff = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= max) {
    // Room frees up when the oldest hit in the window falls out of it.
    const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
    // Store the pruned list even on rejection, so the window keeps sliding.
    hits.set(key, recent);
    return { ok: false, retryAfterSeconds };
  }

  recent.push(now);
  hits.set(key, recent);

  /*
   * Keep the map from growing without bound across a long-lived instance.
   * Two users make this theoretical, but a map that only ever grows is the
   * kind of thing that is free to prevent and expensive to notice.
   */
  if (hits.size > 1000) {
    for (const [k, times] of hits) {
      if (times.every((t) => t <= cutoff)) hits.delete(k);
    }
  }

  return { ok: true, remaining: max - recent.length };
}

/** Test seam. */
export function _reset() {
  hits.clear();
}
