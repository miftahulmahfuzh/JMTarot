/**
 * The share slug. PURE, runtime-neutral, and the only thing standing between a
 * stranger and somebody else's reading.
 *
 * A SLUG IS A BEARER TOKEN, NOT A PRETTY ID. `/s/<slug>` is the first URL in
 * this project's history a person with no account can open, so the slug IS the
 * authorization: `requireUser()` never runs above it, the onboarding gate never
 * runs, and there is no expiry. Every decision in this file falls out of that.
 *
 * ── THE ALPHABET: CROCKFORD BASE32, LOWERCASE ────────────────────────────────
 *
 * Thirty-two symbols -- ten digits, twenty-two letters, with `i`, `l`, `o` and
 * `u` removed. Three properties and each of them is a reason:
 *
 *   1. `i`/`l`/`1` and `o`/`0` CANNOT BE CONFUSED. Somebody will read one of
 *      these aloud over a phone call and somebody will retype one from a
 *      screenshot of a WhatsApp message. Neither is the common case; both are
 *      cheap to make survivable.
 *   2. `u` IS REMOVED, WHICH IS CROCKFORD'S OWN STATED REASON -- it is the
 *      single highest-leverage character to drop for accidental obscenity in
 *      English. It does not remove `a` and `e`, hence `SLUG_DENY` below.
 *   3. **THIRTY-TWO DIVIDES 256 EXACTLY**, so `byte & 0x1f` is a *uniform* draw
 *      with ZERO rejection sampling. Over a 36- or 62-character alphabet the
 *      same line is biased toward the head of the alphabet, and a biased CSPRNG
 *      in a capability token shortens the effective key length while being
 *      invisible in every test that does not count symbols. `slug.test.ts`
 *      counts symbols.
 *
 * Lowercase because the URL sits in a chat bubble next to lowercase prose, and
 * mixed case in a URL is where people make transcription errors.
 *
 * ── THE LENGTH: TWELVE CHARACTERS, 60 BITS, AGAINST A COMPUTED BUDGET ────────
 *
 * Budget assumption, deliberately absurd for this app: N = 2,000,000 live links
 * (100,000 users x 20 shares each). JMTarot currently has two users.
 *
 *   chars  bits  space S    birthday ~N^2/2S       blind guesses per hit ~S/N
 *      8     40  1.10e12    1.8 -- certain         5.5e5
 *     10     50  1.13e15    1.8e-3 (1 in 563)      5.6e8
 *   **12     60  1.15e18    1.7e-6 (1 in 578,000)  5.8e11**
 *     14     70  1.18e21    1.7e-9                 5.9e14
 *
 * Read the last column against the page's own limit of 120 views per IP per
 * hour. At 50 bits a 10,000-node botnet at the full limit finds one live reading
 * in 20 days, which for a token with no expiry is a countdown rather than a
 * defence. At 60 bits the same botnet needs ~55 botnet-years per expected hit.
 *
 * **THAT 55-YEAR FIGURE IS TRUE ONLY BECAUSE V9 LANDED.** As written it assumed
 * 120/IP/hour was enforced; under the per-instance limiter the effective rate
 * was 120 x however many instances Vercel had warm, and the instance count is
 * LARGEST under exactly the load an enumeration attack produces. Fleet-wide
 * enforcement makes 120 mean 120. The conclusion did not move; the arithmetic
 * behind it only became honest.
 *
 * Fourteen characters buys three more orders of magnitude against a threat
 * already 55 botnet-years away, and costs two characters of the thing the user
 * explicitly asked for -- a link that is pleasing in a WhatsApp chat.
 * `https://www.jmtarot.site/s/` is 27 characters, so twelve makes the whole URL
 * **39**, one line of a bubble at any phone width. The `/s/` prefix rather than
 * `/share/` is worth four of those characters and is why it fits.
 *
 * The birthday number is a nice-to-have rather than the control:
 * `share_links.slug` carries a `unique` constraint, so a collision is a `23505`
 * and a retry, not a lost link.
 *
 * ── NO `process.env` IN THIS FILE, EVER ──────────────────────────────────────
 *
 * `SHARE_BASE_URL` carries no `NEXT_PUBLIC_` prefix, so a client component
 * reading it through this module would silently see `undefined` -- the exact trap
 * `localeSwitcherEnabled()`'s header records, which "lived in `LocaleSwitch.tsx`
 * for about ten minutes". The URL builder lives in `links.ts` (`server-only`)
 * and **the client is handed the finished URL in the POST response**.
 *
 * This file is client-importable on purpose: `/api/share`'s zod schema needs
 * `isShareEntity`, and so does `ShareFooter`. Same split as
 * `src/lib/moderation/types.ts` being importable while `blocklist.ts` is not.
 */

/** Crockford base32, lowercase. See the header for why these 32 and not others. */
export const SLUG_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** Twelve characters, i.e. exactly 60 bits. See the header's table. */
export const SLUG_LENGTH = 12;

/**
 * The coincidence filter. **NOT A CONTENT FILTER.**
 *
 * With 2e6 links x 12 characters there are ~1e7 four-character windows in the
 * corpus, and a *specific* four-letter word appears with probability 32^-4 ~=
 * 9.5e-7 per window -- so roughly ten hits per word, per corpus. Crockford's `u`
 * exclusion removes the highest-frequency English offenders and leaves `a` and
 * `e` in, so it does not remove all of them.
 *
 * The goal is that nobody is ever handed a URL they will not send to their
 * mother, not an exhaustive lexicon of two languages. **DO NOT GROW THIS PAST A
 * SCREEN:** the cost of a miss is embarrassment and the cost of chasing it is a
 * moderation project.
 *
 * **EVERY ENTRY IS SPELLABLE IN THE ALPHABET ABOVE, AND THERE IS A TEST.** A
 * substring containing `i`, `l`, `o` or `u` can never appear in a generated slug,
 * so listing `shit` or `slut` is dead weight that reads as coverage -- the same
 * class of mistake as running the Malay grep over English output. That is also
 * why the leet spellings below are the RIGHT ones rather than a cop-out: `1`
 * reads as `l`/`i` and `0` as `o` and `v` as `u` to anybody squinting at a URL,
 * which is Crockford's own premise, so `sh1t` is exactly the form that would
 * appear and be read as the word.
 */
export const SLUG_DENY: readonly string[] = [
  'anjg',
  'anjng',
  'asem',
  'bab1',
  'bangsat',
  'bhx',
  'c0ck',
  'cnt',
  'dmn',
  'fck',
  'fvck',
  'fvk',
  'hnjr',
  'knt1',
  'ngntd',
  'nzs',
  'pntk',
  'rape',
  'sex',
  'shag',
  'sh1t',
  'skank',
  's1vt',
  't1ts',
  'wank',
];

/**
 * What a link can point at. **CLOSED, AND IT LIVES HERE RATHER THAN IN
 * `links.ts`** because `links.ts` is `server-only` and the API route's zod
 * schema needs the guard.
 *
 * `'persona'` is in the union from day one and V8 has not shipped
 * `personas` yet, so `resolveShare` answers null for it -- the same shape as an
 * orphan, which is exactly the answer a not-yet-built artifact deserves. Inert
 * rather than absent, for the same reason V2 put `'persona'` in the translation
 * registry before there was a table.
 */
export const SHARE_ENTITIES = ['reading', 'persona'] as const;

export type ShareEntity = (typeof SHARE_ENTITIES)[number];

/**
 * Runtime narrowing for the union.
 *
 * An `includes` over the literal tuple and never a property lookup on an object:
 * `'__proto__'` and `'constructor'` are ordinary lowercase words that pass a
 * `lower_snake` pattern cleanly, which is the trap `sanitizeProps()` already
 * records. `includes` cannot be fooled by either.
 */
export function isShareEntity(v: unknown): v is ShareEntity {
  return typeof v === 'string' && (SHARE_ENTITIES as readonly string[]).includes(v);
}

/** Does a candidate carry one of the denied substrings? Exported for its test. */
export function containsDenied(slug: string): boolean {
  return SLUG_DENY.some((bad) => slug.includes(bad));
}

/**
 * One slug. CSPRNG, uniform, coincidence-filtered.
 *
 * `byte & 0x1f` IS THE WHOLE TRICK AND IT IS NOT A SHORTCUT. 32 divides 256
 * exactly, so masking the low five bits of a uniform byte is itself uniform --
 * no rejection loop, no modulo bias. Over a 36- or 62-symbol alphabet the same
 * line is biased toward the head of the alphabet, which shortens the effective
 * key length of a capability token and is invisible in every test that does not
 * count symbols. There is one in `slug.test.ts` that counts them.
 *
 * `crypto.getRandomValues` is the Web Crypto GLOBAL and not `node:crypto`, so
 * this file stays runtime-neutral: it works in Node 24, in the edge runtime and
 * in Vitest, and it can be imported by a client component without dragging a
 * Node builtin into the browser bundle.
 */
export function newSlug(): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = new Uint8Array(SLUG_LENGTH);
    crypto.getRandomValues(bytes);
    let out = '';
    for (const b of bytes) out += SLUG_ALPHABET[b & 0x1f];
    if (!containsDenied(out)) return out;
  }
  // Eight consecutive denied draws is ~impossible; throwing beats looping.
  throw new Error('slug generation failed the coincidence filter eight times');
}

/**
 * Fold a slug somebody typed or pasted onto its canonical form.
 *
 * **INJECTIVE OVER THE GENERATED SET, AND THAT PROPERTY IS LOAD-BEARING.** A
 * generated slug never contains `i`, `l`, `o` or `u`, so it is a fixed point of
 * this map and no two distinct generated slugs can normalize onto each other.
 * Without that, normalization would be a way of turning one live link into a
 * lookup for a DIFFERENT one -- somebody's typo resolving to a stranger's
 * reading, which is the worst outcome this feature has.
 *
 * Crockford is case-insensitive on decode, so folding case is free. `-` and
 * whitespace go because a chat client wraps a long line and a person retyping
 * inserts a hyphen where the wrap was.
 */
export function normalizeSlug(v: string): string {
  return v
    .toLowerCase()
    .replace(/[\s-]+/g, '')
    .replace(/[il]/g, '1')
    .replace(/o/g, '0')
    .replace(/u/g, 'v');
}

/**
 * Is this something we could have minted?
 *
 * **CALLED BEFORE THE QUERY, ALWAYS.** `resolveShare` runs this first and
 * returns null without touching the database, which is one fewer round trip per
 * garbage request on the one denial-of-service surface in the release. It runs
 * on the NORMALIZED value, so a pasted `ABCD-EFGH JKMN` is accepted and a
 * `' or 1=1--` is not.
 */
export function isValidSlug(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const s = normalizeSlug(v);
  if (s.length !== SLUG_LENGTH) return false;
  for (const c of s) if (!SLUG_ALPHABET.includes(c)) return false;
  return true;
}
