/**
 * A CLASS of referrer, never the referrer itself.
 *
 * Rule 2 of the taxonomy: a URL is unbounded cardinality, and an external
 * referrer is somebody else's page in our table. `internal` is worth keeping
 * distinct from `external` rather than folded into it -- on `/s/` it separates the
 * sharer opening their own preview from the WhatsApp tap that page exists for, and
 * on `/gallery` it separates an organic search arrival from somebody who was
 * already on the site, which is the one number v0.4.0 exists to move.
 *
 * ── WHY THIS IS A MODULE NOW, AND THE COMMENT IT INVERTS (R19) ───────────────
 *
 * `ShareViewed.tsx` said, in as many words: *"Copied from `AppLaunched` rather
 * than shared, because the two are four lines and putting them in a module would
 * give `track.client`'s import graph a reason to grow."* That was a reasonable
 * call at n = 2 and it is **inverted rather than deleted**, because the failure
 * mode of removing a comment is somebody restoring the duplication in six months.
 *
 * Two things changed. S3 is the THIRD caller, and three hand-copied
 * implementations of a function that classifies a security-adjacent value is where
 * copies stop being cheaper than a module. And the stated cost does not apply to
 * this file: nothing imports it from `track.client`, it has NO imports of its own,
 * and it reaches the browser as four lines either way. The graph is unchanged;
 * only the copy count is.
 *
 * ISOMORPHIC, and the `typeof document` guard is why. Every caller today is a
 * client component -- but a client component is SERVER-RENDERED first, and an
 * effect is not the only place somebody will eventually call this.
 */
export type ReferrerKind = 'direct' | 'internal' | 'external';

export function referrerKind(): ReferrerKind {
  if (typeof document === 'undefined' || !document.referrer) return 'direct';
  try {
    return new URL(document.referrer).origin === window.location.origin
      ? 'internal'
      : 'external';
  } catch {
    return 'direct';
  }
}
