/**
 * Who is an admin, as a pure function. v0.5.0 / A1, decision A-D1.
 *
 * ── ZERO IMPORTS, AND NO ENVIRONMENT READ. BOTH ARE STRUCTURAL ───────────────
 *
 * **ZERO IMPORTS** so `npm test` can reach this decision. `requireAdmin()` needs
 * `currentUser()`, which imports `@/lib/auth/auth`, which calls `NextAuth(...)`
 * at module scope and imports `@/lib/db/client` -- and that file opens with
 * `import 'server-only'`. Putting the allowlist parse in the same module as the
 * session read is how the security-relevant half of this workstream ends up
 * untestable, which is the argument `gate.ts`'s header makes for `decide()` and
 * `src/lib/seo/origin.ts` makes for the origin. This is that split, one workstream
 * later, and reconciliation R23 is the ruling that made it two files.
 *
 * **NO ENVIRONMENT READ** for `prefix.ts`'s recorded reason: a non-`NEXT_PUBLIC_`
 * variable inlines as `undefined` in a client bundle, so a module that reads the
 * environment cannot safely be imported by anything that might one day be a client
 * component. The raw string is a PARAMETER. `identity.ts` reads `ADMIN_EMAILS`,
 * once, on the server.
 *
 * Both properties are asserted against this file's SOURCE in `allowlist.test.ts`,
 * which is also why neither the forbidden env accessor nor the forbidden array
 * helpers are spelled out anywhere above: a fence that reads the whole file cannot
 * tell prose from code, and the prose is the cheaper half to reword.
 *
 * ── THE DEFAULT DIRECTION IS THE OPPOSITE OF `ANALYTICS_ENABLED`'s ───────────
 *
 * Unset, empty, whitespace or all-commas => **nobody is an admin.** Roadmap §8 and
 * A-D1: `ANALYTICS_ENABLED` is written so a typo COLLECTS DATA rather than silently
 * collecting none; `RATELIMIT_BACKEND` is written so a typo CANNOT disable
 * enforcement. This is the second kind. There is no input to `parseAdminAllowlist`
 * for which it gives up and admits everyone.
 *
 * ── EXACT, AND THAT MEANS NO PROVIDER-SPECIFIC NORMALISATION ─────────────────
 *
 * Trimmed and lowercased, and nothing else. `a.b@gmail.com` and `ab@gmail.com` are
 * the same Google mailbox and are NOT the same entry here: normalising them would
 * make the allowlist match an address nobody wrote into it, which is a privilege
 * grant arrived at by being helpful. Write the address you actually sign in with.
 *
 * `toLowerCase()` and never `toLocaleLowerCase()`: the locale-sensitive form maps
 * `I` to `ı` in Turkish, so `ADMIN@X.COM` would stop matching `admin@x.com` on a
 * machine whose ICU default changed. A locale-sensitive fold inside a security
 * decision is a bug waiting for a deploy region.
 */

/** `ADMIN_EMAILS` -> a trimmed, lowercased, de-duplicated list. Never null. */
export function parseAdminAllowlist(raw: string | null | undefined): readonly string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const entry = part.trim().toLowerCase();
    if (entry === '') continue;
    let seen = false;
    for (const already of out) if (already === entry) seen = true;
    if (!seen) out.push(entry);
  }
  return out;
}

/**
 * Length-and-content compare with no early exit.
 *
 * **NOT A CRYPTOGRAPHIC GUARANTEE, AND THE COMMENT SAYS SO ON PURPOSE.** A JS
 * string compare under a JIT is not rigorously constant-time. What this does buy
 * is that the loop count does not depend on where the first differing character
 * is, and that `isAdminEmail` scans every entry rather than stopping at the match
 * -- so neither the position of an entry nor its similarity to the candidate is
 * observable in the obvious way. A-D1 asks for a constant-time compare; this is
 * the honest version of that at zero dependency cost.
 *
 * `node:crypto`'s `timingSafeEqual` is the rigorous answer and is deliberately not
 * used: it would be the one import in this file, and the file's zero-import
 * property is worth more than the difference (see the header, and the threat note
 * in `allowlist.test.ts`).
 */
function equalsNoShortCircuit(a: string, b: string): boolean {
  const n = a.length > b.length ? a.length : b.length;
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Is this signed-in email on the allowlist?
 *
 * `email` is `CurrentUser.email`, which came off a verified session -- so this
 * answers "is the person we already identified an admin", never "does this string
 * look like an admin". An empty or absent email is `false`, which is the same
 * fail-closed answer an empty allowlist gives.
 *
 * **SCANS THE WHOLE LIST. DO NOT ADD A `break`, AND DO NOT REWRITE THE LOOP AS AN
 * ARRAY MEMBERSHIP HELPER** -- the three obvious ones all short-circuit. There is a
 * source-level test for both halves.
 */
export function isAdminEmail(
  email: string | null | undefined,
  allowlist: readonly string[],
): boolean {
  if (!email) return false;
  const candidate = email.trim().toLowerCase();
  if (candidate === '') return false;
  let hit = false;
  for (const entry of allowlist) {
    if (equalsNoShortCircuit(entry, candidate)) hit = true;
  }
  return hit;
}
