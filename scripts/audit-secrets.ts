/**
 * The tripwire. Runs on every `npm run build`, including Vercel's (W7-D15).
 *
 *   npm run audit:secrets     re-run against the existing .next, no rebuild
 *
 * Miftah's requirement: *"make sure all our technical secrets (passwords,
 * private tokens, api keys) and business secrets (every llm prompt) cannot be
 * exposed through frontend."* A read-through satisfies that today and is
 * worthless tomorrow. **THE DELIVERABLE IS THE CHECK, NOT THE READ-THROUGH.**
 *
 * ---
 *
 * **THE SCAN SET IS WRITTEN OUT RATHER THAN `grep -r .next`, AND THE EXCLUSION
 * IS THE WHOLE REASON.** Measured against a real build:
 *
 *   .next/static/**                    ships to the browser        SCAN
 *   .next/server/app/**.html           prerendered, served as-is   SCAN
 *   .next/server/app/**.rsc|.meta      the RSC flight payload      SCAN  <- forgotten
 *   public/**                          served raw                  SCAN
 *   .next/server/chunks/**             server only                 EXCLUDE
 *
 * `Kamu adalah pembaca tarot` lives in `.next/server/chunks/` and is SUPPOSED
 * to. A scanner that flags it is a scanner somebody switches off within a week,
 * and then the whole thing is decoration. **Do not "fix" that exclusion.**
 *
 * The `.rsc` payloads are the row people forget. A server component that reads
 * `process.env.LLM_MODEL` and passes it as a prop does not put the value in
 * `.next/static` -- it serializes it into the flight payload, which the browser
 * downloads on navigation. A scanner that only looks at `static` reports green
 * on a real leak.
 *
 * **THE NEEDLES ARE DERIVED, NOT HARDCODED** (W7-D16). The script imports every
 * module under `src/lib/prompt/**` and `src/lib/moderation/**` and extracts
 * needles from their exported strings. A hardcoded list goes stale the first
 * time somebody rewords a persona paragraph, and a stale tripwire is worse than
 * none because it reads as green.
 *
 * **NEVER ECHO A MATCH.** A CI log is a disclosure channel; printing the matched
 * text turns the tripwire into the leak. Findings report the needle's ORIGIN,
 * the file and the byte offset.
 *
 * ---
 *
 * **PROVEN TO FIRE, 2026-07-27. An untested tripwire is decoration.**
 *
 * Control: import `BASE_CONTRACT_ID` into `ReadingPanel.tsx` (a `'use client'`
 * component) and render 220 characters of it. Result: six findings across
 * `.next/static/chunks/`, naming `base.id.ts#BASE_CONTRACT_ID`,
 * `base.id.ts#FORMAT_RULES_ID` and their `base.ts` re-exports; **exit code 1**,
 * so `next build && npm run audit:secrets` fails and Vercel does not deploy.
 * Reverted, rebuilt, exit code 0.
 *
 * **THE FIRST CONTROL DID NOT FIRE, AND THAT IS WORTH KNOWING.** It was
 * `export const LEAK = BASE_CONTRACT_ID.slice(0, 220)` with nothing importing
 * `LEAK` -- Next tree-shook the unused export and the string never reached the
 * bundle. The audit was right to stay silent. **This scans what SHIPS, not what
 * is imported**, which is the correct scope and also a stated limit: dead code
 * referencing a secret is not a finding, and `clientBoundary.test.ts` plus
 * `server-only` are the layers that cover the source side.
 *
 * **THE BOUNDARY WALK WAS CONTROLLED SEPARATELY, AND IT IS THE HALF THAT CLOSES
 * A KNOWN GAP.** Control: a throwaway `src/lib/_control.ts` importing
 * `base.id.ts`, imported in turn by `ReadingPanel.tsx`. `clientBoundary.test.ts`
 * PASSED all six of its tests -- it only sees DIRECT imports, and says so in its
 * own header. The walk failed with the whole chain named:
 *
 *   Draw.tsx -> ReadingPanel.tsx -> lib/_control.ts -> lib/prompt/base.id.ts
 *
 * That path is the deliverable. "Something reaches the prompt layer" is not
 * fixable; that line is.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

const ROOT = process.cwd();

type Finding = { rule: string; detail: string; file: string; offset: number };

const findings: Finding[] = [];
const warnings: string[] = [];

function fail(rule: string, detail: string, file: string, offset: number) {
  findings.push({ rule, detail, file, offset });
}

// ---------------------------------------------------------------------------
// The scan set (§6.1)
// ---------------------------------------------------------------------------

/** Extensions worth reading. Fonts and images cannot carry a prompt usefully. */
const TEXTUAL = new Set(['.js', '.mjs', '.cjs', '.css', '.map', '.json', '.html', '.rsc', '.meta', '.segments', '.txt', '.svg', '.webmanifest', '']);

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function scanSet(): string[] {
  const files: string[] = [];

  files.push(...walk(join(ROOT, '.next', 'static')));

  /*
   * `.next/server/app/**`, but only the artefacts that reach a browser. The
   * sibling `.js` files in that directory are server modules and carry the
   * prompt legitimately, exactly like `chunks/`.
   */
  for (const file of walk(join(ROOT, '.next', 'server', 'app'))) {
    if (/\.(html|rsc|meta|segments)$/.test(file)) files.push(file);
  }

  files.push(...walk(join(ROOT, 'public')));

  return files.filter((f) => TEXTUAL.has(extname(f).toLowerCase()));
}

// ---------------------------------------------------------------------------
// (a) Derived prompt needles (§6.2a, W7-D16)
// ---------------------------------------------------------------------------

const NEEDLE_LENGTH = 48;
const MIN_STRING = 80;

/** Every string reachable from a module's exports, one level into records and arrays. */
function stringsIn(value: unknown, depth = 0): string[] {
  if (typeof value === 'string') return [value];
  if (depth > 2 || value === null || typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>).flatMap((v) => stringsIn(v, depth + 1));
}

/** First 48 characters, 48 from the midpoint, last 48. */
function needlesFrom(text: string): string[] {
  if (text.length < MIN_STRING) return [];
  const mid = Math.floor((text.length - NEEDLE_LENGTH) / 2);
  return [
    text.slice(0, NEEDLE_LENGTH),
    text.slice(mid, mid + NEEDLE_LENGTH),
    text.slice(-NEEDLE_LENGTH),
  ];
}

/**
 * Letters, digits and single spaces, lowercased.
 *
 * The second matching pass runs on this form. A bundler that re-escapes a quote,
 * a non-ASCII dash or a newline breaks a verbatim match while leaving the words
 * intact -- the skeleton survives all three, at the cost of some precision it
 * does not need, because a 48-character run of prompt prose does not occur by
 * accident.
 */
function skeleton(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function derivedNeedles(): Promise<{ needle: string; origin: string }[]> {
  /**
   * **TWO MODULES ARE EXCLUDED, AND IT IS THE SAME KIND OF DECISION AS
   * EXCLUDING `.next/server/chunks/**`:** they are SUPPOSED to be in the client
   * bundle, so needling them would make the audit red forever and the audit
   * would then be switched off.
   *
   *   moderation/resources.ts  the refusal renders hotline numbers in the
   *                            browser (W7-D14's third exception). A phone
   *                            number is public information -- publishing it is
   *                            the feature.
   *   moderation/types.ts      the category union is rendered by the client.
   *
   * Caught on the audit's first run: six findings, all of them
   * `ALL_CRISIS_RESOURCES` in `.next/static`, all of them correct behaviour.
   *
   * Note the asymmetry that makes this safe: `blocklist.ts`, `classify.ts` and
   * `gate.ts` are NOT excluded, so the pattern list and the classifier prompt --
   * the parts that are genuinely secret -- are still needled.
   */
  const CLIENT_BY_DESIGN = ['moderation/resources.ts', 'moderation/types.ts'];

  /*
   * ── `src/lib/chat/**` JOINED THE LIST IN v0.7.0, AND IT WAS THE MOST IMPORTANT
   *    OF THE RECONCILIATION'S NINE UNOWNED FILES (§4, F3's finding) ────────
   *
   * **THIS SCRIPT DERIVED ITS NEEDLES FROM TWO DIRECTORIES ONLY, SO NON-NEGOTIABLE 2
   * WAS UNENFORCED FOR EVERY STRING THE CHAT PROMPT LAYER WRITES** — and the
   * `derived ZERO needles` guard below could not fire, because the two old
   * directories keep it comfortably non-zero. The audit would have gone on passing
   * while the surface it most needed to cover shipped unwatched.
   *
   * **THE CHAT IS THE SURFACE WHERE THIS IS EASIEST TO BREAK, BECAUSE THE PROMPT IS
   * THE PRODUCT** (§0.3): three persona blocks, a director prompt, an address-form
   * list and — under `C-D8` — a block built from six raw onboarding answers. A voice
   * prompt leaking into a client bundle would put the querent's own `worst_thing`
   * answer in a file a browser caches.
   *
   * F1 owns the edit; F3 supplied the path. `src/lib/chat/types.ts` is deliberately
   * NOT excluded the way `moderation/types.ts` is — a client component names its
   * types, but the file carries no prose (its contract test asserts exactly that), so
   * it contributes no needles and needs no exception.
   */
  const modules = [
    ...walk(join(ROOT, 'src', 'lib', 'prompt')),
    ...walk(join(ROOT, 'src', 'lib', 'moderation')),
    ...walk(join(ROOT, 'src', 'lib', 'chat')),
  ].filter(
    (f) =>
      /\.ts$/.test(f) &&
      !/\.test\.ts$/.test(f) &&
      !CLIENT_BY_DESIGN.some((c) => f.endsWith(c.replace('/', sep))),
  );

  const out: { needle: string; origin: string }[] = [];

  for (const file of modules) {
    const rel = relative(ROOT, file);
    let mod: Record<string, unknown>;
    try {
      mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    } catch (err) {
      /*
       * A module that cannot be imported contributes NO NEEDLES, which makes the
       * audit quietly weaker. Warn loudly rather than failing: the usual cause is
       * a module that reaches the database driver, and blocking a deploy on that
       * would get the whole script disabled.
       */
      warnings.push(`could not import ${rel} for needles: ${(err as Error).message.slice(0, 100)}`);
      continue;
    }

    for (const [name, value] of Object.entries(mod)) {
      for (const text of stringsIn(value)) {
        for (const needle of needlesFrom(text)) {
          out.push({ needle, origin: `${rel}#${name}` });
        }
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// (b) Environment variable names and VALUES (§6.2b)
// ---------------------------------------------------------------------------

const SECRET_ENV = [
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'LLM_PROVIDER',
  'MODERATION_MODEL',
  'LOTUS_MODEL',
  'AUTH_SECRET',
  'AUTH_USERS',
  'AUTH_GOOGLE_SECRET',
  'AUTH_GOOGLE_ID',
  'FIELD_ENCRYPTION_KEY',
  'DATABASE_URL',
  'TEST_DATABASE_URL',
  'CRON_SECRET',
  /*
   * V9. `UPSTASH_REDIS_REST_TOKEN` is the credential; the URL is not secret but
   * it NAMES THE DATASTORE, which is the same reasoning that already puts
   * `LLM_BASE_URL` and `DATABASE_URL` on this list.
   */
  'UPSTASH_REDIS_REST_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  /*
   * v0.5.0 / A1, licensed by reconciliation R20. **An operator's email address is
   * a better candidate for this list than either of the two above:** `toViewer()`
   * drops `email` from every session on the stated ground that *"the email is the
   * one field with a real disclosure cost if it leaks into a bundle or a
   * screenshot"*, and `ADMIN_EMAILS` is that field for the one account that can
   * read everybody's.
   *
   * A1's plan declined to make this edit and flagged it instead, because
   * `audit-secrets.ts` was not in roadmap §6's table of shared files and an
   * unlisted edit to one is itself a reconciliation defect. R20 added the file to
   * §6 under A1 and licensed the line.
   */
  'ADMIN_EMAILS',
];

/**
 * A value is worth searching for only if a coincidence is implausible.
 *
 * `LLM_PROVIDER=zai` is three characters and appears inside ordinary words; a
 * value grep on it would fail every build for nothing. The NAME grep still
 * covers it.
 */
const MIN_VALUE_LENGTH = 12;

function valueForms(value: string): string[] {
  const forms = new Set<string>([value]);
  forms.add(Buffer.from(value, 'utf8').toString('base64'));
  forms.add(Buffer.from(value, 'utf8').toString('base64url'));
  forms.add(encodeURIComponent(value));
  // A bundler escapes `/` in a string literal inside a script sometimes.
  forms.add(value.replace(/\//g, '\\/'));
  return [...forms].filter((f) => f.length >= MIN_VALUE_LENGTH);
}

// ---------------------------------------------------------------------------
// (c) Shapes, regardless of name (§6.2c)
// ---------------------------------------------------------------------------

const SHAPES: { name: string; re: RegExp; warn?: true; credential?: true }[] = [
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, credential: true },
  { name: 'anthropic key', re: /sk-ant-[A-Za-z0-9_-]{20,}/, credential: true },
  { name: 'google client SECRET', re: /GOCSPX-[A-Za-z0-9_-]{20,}/, credential: true },
  { name: 'google api key', re: /AIza[0-9A-Za-z_-]{35}/, credential: true },
  { name: 'bcrypt hash', re: /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/, credential: true },
  { name: 'jwt', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, credential: true },
  { name: 'dsn with inline password', re: /postgres(?:ql)?:\/\/[^\s"']+:[^\s"'@]+@/, credential: true },
  /*
   * Business information rather than credentials, and they FAIL anyway: the
   * client has no business knowing which provider or which model writes its
   * readings.
   */
  { name: 'provider endpoint', re: /api\.z\.ai/ },
  { name: 'model name', re: /\bglm-4/ },
  /*
   * **WARNS, DOES NOT FAIL, AND THE REASON IS IN THIS COMMENT SO NOBODY
   * "FIXES" IT.** The Google OAuth CLIENT ID is public by design -- it is in
   * every authorization URL the browser follows -- so it may legitimately
   * appear. Promoting this to a failure gets the finding suppressed globally,
   * which would also suppress the client SECRET pattern above it.
   */
  { name: 'google client id (public by design)', re: /[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com/, warn: true },
];

// ---------------------------------------------------------------------------
// (d) The NEXT_PUBLIC_ proof (§6.2d)
// ---------------------------------------------------------------------------

/**
 * **JMTarot DECLARES EXACTLY ONE `NEXT_PUBLIC_` VARIABLE, AND IT IS READ IN
 * EXACTLY ONE FILE.** Anything so prefixed is inlined into the client bundle by
 * Next at build time -- that is its entire purpose, and it is the single easiest
 * way to leak a key.
 *
 * **THIS LIST WAS EMPTY UNTIL v0.4.0 AND THE SENTENCE ABOVE IT SAID "HAS NO".**
 * S-D11 introduced `NEXT_PUBLIC_SITE_ORIGIN`, and reconciliation R10 both
 * confirmed the name and explained why it is misleading: the other three rungs of
 * `siteOrigin()`'s chain -- `AUTH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`,
 * `VERCEL_URL` -- carry no prefix, so the function is server-only IN PRACTICE
 * despite the variable it is named after. Renaming across a doc, `.env.example`
 * and the Vercel dashboard buys nothing; R10 says so and keeps the name.
 *
 * **SO THIS IS NOT A SUPPRESSION, AND THE TWO THINGS THAT MAKE IT NOT ONE ARE
 * BOTH BELOW.** The value is a public origin -- it is in the manifest, in both
 * legal pages and in every canonical tag by design, which is the same argument
 * this file already makes for `NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL`. And
 * the fence R10 actually asks for is a CLIENT-BOUNDARY fence, not an
 * environment one: `lib/seo/origin.ts` is in `FORBIDDEN` below, so the
 * transitive walk fails the build if any client component ever reaches it.
 */
const NEXT_PUBLIC_ALLOWLIST: string[] = ['NEXT_PUBLIC_SITE_ORIGIN'];

/**
 * Which file may READ each allowlisted variable. **A VARIABLE, A FILE, AND
 * NOTHING WIDER.**
 *
 * A bare name-allowlist would let any of forty-odd modules read
 * `NEXT_PUBLIC_SITE_ORIGIN` directly, which is precisely the second-function-
 * decides-the-origin failure S-D11 exists to prevent -- and it would land here as
 * a green build. Pairing the name with its one legitimate reader keeps the check
 * strictly stronger than "no NEXT_PUBLIC_ reads" was for every other variable,
 * and it is the mechanical form of `origin.ts`'s own "there is one chain, here".
 */
const NEXT_PUBLIC_READERS: Record<string, string> = {
  NEXT_PUBLIC_SITE_ORIGIN: 'lib/seo/origin.ts',
};

/**
 * **THE PLATFORM'S OWN NAMESPACE, AND IT IS NOT OURS TO EMPTY.** Broke the first
 * real Vercel deploy (2026-07-27, commit `0b4e4a0`): nineteen findings, every one
 * of them `NEXT_PUBLIC_VERCEL_*`, none of them from this repo.
 *
 * Vercel duplicates its system environment variables under a `NEXT_PUBLIC_`
 * prefix -- `..._URL`, `..._ENV`, `..._GIT_COMMIT_MESSAGE`, `..._PROJECT_ID`,
 * and a dozen more. The build container is not an environment this repository
 * controls, so the `process.env` enumeration was checking a machine somebody
 * else provisions. Turning off "Automatically expose System Environment
 * Variables" in the dashboard removes most of them and is worth doing anyway,
 * but it is an invisible setting that a re-created project silently loses, and
 * at least `NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG` arrives from the
 * build pipeline regardless. A tripwire hostage to a checkbox is one somebody
 * switches off -- the same reasoning that excludes `.next/server/chunks/**`.
 *
 * **THIS COSTS THE AUDIT ALMOST NOTHING, AND HERE IS WHY.** Being *set* was only
 * ever a proxy. Next inlines a `NEXT_PUBLIC_` value at the point something READS
 * it, not because it exists, and the read check below scans all of `src/**` and
 * is untouched -- so an actual leak of one of these still fails the build. The
 * values themselves are commit metadata and deployment URLs, not credentials.
 *
 * **DO NOT VALUE-SCAN THEM INTO `SECRET_ENV` "to be thorough".**
 * `NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL` is `www.jmtarot.site`, which is in
 * the manifest and in both legal pages by design. That is a guaranteed red build
 * on correct code, which is how a tripwire gets deleted.
 *
 * `NEXT_PUBLIC_ALLOWLIST` above stays EMPTY. The rule it encodes -- JMTarot
 * declares no `NEXT_PUBLIC_` variable of its own -- is still true and still
 * enforced. This is a separate list because it means a different thing.
 */
const NEXT_PUBLIC_PLATFORM_PREFIXES = ['NEXT_PUBLIC_VERCEL_'];

function checkNextPublic() {
  let platform = 0;
  for (const key of Object.keys(process.env)) {
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    if (NEXT_PUBLIC_ALLOWLIST.includes(key)) continue;
    if (NEXT_PUBLIC_PLATFORM_PREFIXES.some((p) => key.startsWith(p))) {
      platform += 1;
      continue;
    }
    fail('NEXT_PUBLIC_', `${key} is set and not on the allowlist`, '(process.env)', 0);
  }
  // One line, not nineteen. Visible enough to notice the namespace growing,
  // quiet enough that nobody starts scrolling past the audit's output.
  if (platform > 0) {
    warnings.push(`${platform} platform-injected NEXT_PUBLIC_VERCEL_* vars present (not read by src/**)`);
  }

  /*
   * **`process.env.NEXT_PUBLIC_`, NOT A BARE `NEXT_PUBLIC_`.** The first version
   * matched the bare prefix and immediately fired on `src/lib/i18n/resolve.ts`,
   * whose doc comment explains why `LOCALE_SWITCHER` deliberately does NOT carry
   * the prefix. A tripwire that fires on a comment warning against the thing it
   * checks for is the definition of one people delete.
   *
   * What is actually dangerous is a READ, because that is what Next inlines.
   *
   * **TEST FILES ARE SKIPPED (v0.4.0), FOR THE REASON THE PARAGRAPH ABOVE
   * GIVES.** Nothing imports a `*.test.ts` from a route, so Next never compiles
   * one and there is nothing to inline. Three of them set or assert
   * `NEXT_PUBLIC_SITE_ORIGIN` -- and `layout.contract.test.ts`'s read is inside a
   * `.not.toContain(...)`, i.e. a test asserting the layout must NOT read it.
   * Firing on that is the same shape as firing on `resolve.ts`'s comment: a
   * tripwire that reports the fence as the breach. `checkClientBoundary` below is
   * what actually decides whether a value can reach a browser, and it already
   * excludes tests for the same reason.
   *
   * **AN ALLOWLISTED VARIABLE IS STILL A FINDING OUTSIDE ITS ONE READER.** The
   * pair, not the name, is what is permitted -- see `NEXT_PUBLIC_READERS`.
   */
  for (const file of walk(join(ROOT, 'src'))) {
    if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
    const rel = relative(ROOT, file).replace(/^src\//, '');
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(
      /process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)|process\.env\[['`"](NEXT_PUBLIC_[A-Z0-9_]+)/g,
    )) {
      const name = m[1] ?? m[2];
      if (NEXT_PUBLIC_READERS[name] === rel) continue;
      fail('NEXT_PUBLIC_', `a NEXT_PUBLIC_ read in source (${name})`, relative(ROOT, file), m.index);
    }
  }
}

// ---------------------------------------------------------------------------
// The static client-boundary walk (§6.3)
// ---------------------------------------------------------------------------

/**
 * **TRANSITIVE, WHICH IS THE WHOLE POINT.** `clientBoundary.test.ts` already
 * checks DIRECT imports and says so in its own header: "a client component
 * importing a plain module that imports the prompt layer would pass this and
 * still bundle it. That is a real gap." This closes it.
 *
 * It reports the PATH THROUGH THE GRAPH rather than the endpoint, because
 * "Draw.tsx -> useThing.ts -> helper.ts -> @/lib/prompt/base" is fixable and
 * "something reaches the prompt layer" is not.
 *
 * Complementary to `server-only`, not a duplicate of it: the marker fails at
 * BUILD with the importing file named, and this fails in one second with the
 * whole chain named. Two halves of the same fence.
 */
const FORBIDDEN: { prefix: string; allow: string[] }[] = [
  // `sanitize.ts` is the documented exception: Draw.tsx needs MAX_QUESTION_LENGTH
  // for the input's maxLength, and it must be the SAME constant the server
  // rejects against. `budget.ts` is word ceilings -- numbers, no prose.
  { prefix: 'lib/prompt/', allow: ['lib/prompt/sanitize.ts', 'lib/prompt/budget.ts'] },
  { prefix: 'lib/llm/', allow: [] },
  { prefix: 'lib/db/', allow: [] },
  // W7-D14's two deliberate exceptions: a category name is not a secret, and a
  // hotline number is public information the refusal has to render.
  { prefix: 'lib/moderation/', allow: ['lib/moderation/types.ts', 'lib/moderation/resources.ts'] },
  // `viewer.tsx` IS the client context, and `gate.ts`/`token.ts` are pure
  // decision functions with no credential in them.
  { prefix: 'lib/auth/', allow: ['lib/auth/viewer.tsx', 'lib/auth/gate.ts', 'lib/auth/token.ts'] },
  /*
   * **v0.4.0 / S-D11. THE FENCE RECONCILIATION R10 ASKS FOR, AND THE REASON IT
   * HAS TO BE HERE RATHER THAN ONLY IN `clientBoundary.test.ts`.**
   *
   * `siteOrigin()`'s chain reads `AUTH_URL`, `VERCEL_PROJECT_PRODUCTION_URL` and
   * `VERCEL_URL`, none of which carries a `NEXT_PUBLIC_` prefix -- so in a
   * browser bundle all three inline as `undefined` and the chain collapses
   * SILENTLY to `http://localhost:3001`. A client component that called it would
   * hand a visitor a canonical, a share URL or an `hreflang` pointing at their
   * own machine, and nothing would look wrong. `resolve.ts`'s header records
   * `localeSwitcherEnabled()` making exactly this mistake and living in
   * `LocaleSwitch.tsx` for about ten minutes.
   *
   * `clientBoundary.test.ts` fences the DIRECT import; this walk is TRANSITIVE,
   * which is the half that matters once S3, S4 and S6 start mounting client
   * components inside content pages. A client component takes a finished URL as
   * a prop -- `PublicShare` is the worked example.
   *
   * The prefix is the FILE, not `lib/seo/`: `jsonld.ts` is pure, takes the origin
   * as an argument and reads no environment, so a client component importing it
   * is harmless. Same split as `moderation/types.ts` against `blocklist.ts`.
   */
  { prefix: 'lib/seo/origin.ts', allow: [] },
  /*
   * **v0.7.0 / `[F3-19]`. THE OTHER HALF OF THE CHAT FENCE.**
   *
   * F1 taught the needle derivation about `src/lib/chat/**` (see `deriveNeedles`), which
   * is what makes a leaked chat prompt DETECTABLE in a built bundle. This is what makes
   * it detectable in the SOURCE, transitively, in one second, with the whole chain
   * named — and it is the half that catches the mistake before the bundle exists.
   *
   * **THE PROMPT IS THE PRODUCT ON THIS SURFACE, AND UNDER `C-D8` IT CARRIES THE SIX
   * RAW ONBOARDING ANSWERS.** A client component that reached `@/lib/chat/context` or
   * `@/lib/chat/prompt/**` — even through two harmless-looking hops — would put a
   * querent's own `worst_thing` answer in a file a browser caches. That is the one
   * failure non-negotiable 2 exists for.
   *
   * FIVE EXCEPTIONS, AND EVERY ONE OF THEM IS A FILE F4 HAS TO NAME:
   *
   *   types.ts          the DTOs and `AdvanceReply`. A leaf by contract, no prose.
   *   attachmentView.ts F6's projection for the bubble. `'use client'` names it.
   *   machine.ts        F1's pure state decision, no clock and no handle.
   *   address.ts        PURE, a LEAF, zero imports.
   *   voices/pace.ts    the pace. F4 honours `delayMs`, so it may want the function.
   *
   * **`validate.ts` IS NOT ON THE LIST, AND THAT IS DELIBERATE.** It reaches
   * `@/lib/prompt/lotus` for `properNames` and `sharesNgram`, so it carries the reading
   * prompt layer behind it; the smoke script imports it under
   * `--conditions=react-server` and a client component has no business checking a
   * bubble it did not generate.
   */
  {
    prefix: 'lib/chat/',
    allow: [
      'lib/chat/types.ts',
      'lib/chat/attachmentView.ts',
      'lib/chat/machine.ts',
      'lib/chat/address.ts',
      'lib/chat/voices/pace.ts',
    ],
  },
];

/** Resolve an import specifier to a file under src/, or null if it leaves the tree. */
function resolveSpec(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(ROOT, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = join(fromFile, '..', spec);
  else return null;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Import specifiers that survive to runtime.
 *
 * **`import type` IS SKIPPED, BECAUSE IT IS ERASED AT COMPILE TIME.** It bundles
 * nothing. `src/lib/auth/viewer.tsx` does `import type { Viewer } from
 * './server'` and reported as a boundary violation on the first run -- a client
 * component naming a server type is correct and common, and flagging it would
 * push people toward duplicating the type instead.
 */
function importsOf(source: string): string[] {
  return [...source.matchAll(/^\s*import\s+(?:([^'"]*?)\sfrom\s+)?['"]([^'"]+)['"]/gm)]
    .filter((m) => !/^\s*type\b/.test(m[1] ?? ''))
    .map((m) => m[2]);
}

/**
 * A `'use server'` module is an RPC BOUNDARY, not an import.
 *
 * Next replaces the import with a fetch stub, so nothing the server action
 * reaches is bundled for the browser -- that is the entire point of a server
 * action, and it is the sanctioned way for a client component to call server
 * code. The walk therefore stops here rather than descending.
 *
 * Found on the first run: `SessionRepair.tsx -> actions.ts -> @/lib/auth/auth.ts`
 * reported as a violation. It is the intended pattern, and a scanner that flags
 * the intended pattern is one people switch off.
 */
function isServerAction(source: string): boolean {
  return /^\s*(['"])use server\1/m.test(source.split('import')[0]);
}

function checkClientBoundary() {
  const all = walk(join(ROOT, 'src')).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

  const clients = all.filter((f) => {
    const src = readFileSync(f, 'utf8');
    return /^\s*(['"])use client\1/m.test(src.split('import')[0]);
  });

  if (clients.length < 8) {
    // A directive that moved, or quoting that changed, would make every
    // assertion below pass for the wrong reason.
    fail('boundary', `found only ${clients.length} client components`, 'src/', 0);
  }

  for (const entry of clients) {
    // Depth-first, remembering the path so the report is actionable.
    const seen = new Set<string>();
    const stack: { file: string; path: string[] }[] = [{ file: entry, path: [relative(ROOT, entry)] }];

    while (stack.length > 0) {
      const { file, path } = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);

      let source: string;
      try {
        source = readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      /*
       * THE RPC-BOUNDARY CHECK RUNS BEFORE THE PREFIX RULE, AND THE ORDER IS THE
       * WHOLE FIX (V4).
       *
       * It used to run after, which made the two disagree for any server action
       * living under a FORBIDDEN prefix: the walk failed the file before ever
       * asking whether it was a boundary. W3's `app/onboarding/actions.ts` never
       * exposed this because `app/` is not a forbidden prefix.
       *
       * V4 hit it head-on. Sign out has to call @auth/core's `signOut`, the
       * sanctioned way for a client component to reach server code is a server
       * action, and the honest place for a session-clearing action is
       * `lib/auth/` -- which is forbidden, correctly, for everything that is not
       * one. So the rule as ordered banned the correct implementation of the
       * feature from the correct directory, and the two alternatives were both
       * worse: put session-clearing code somewhere nobody will look for it, or
       * suppress a finding.
       *
       * NOTHING IS WEAKENED. `isServerAction` is not a suppression a caller can
       * assert; it is a fact about how Next compiles the module. Every export of
       * a `'use server'` file becomes a server reference and the import site
       * gets a fetch stub, so the transitive graph is not bundled for the
       * browser -- which is exactly what this walk is looking for. Marking a
       * module `'use server'` to dodge the scanner is not possible either: Next
       * refuses to build a `'use server'` file that exports anything but async
       * functions.
       *
       * This is also W7's own principle about `.next/server/chunks/**`, applied
       * one directory over: a scanner that flags the intended pattern is a
       * scanner somebody switches off, and then nothing is checked at all.
       */
      if (file !== entry && isServerAction(source)) continue;

      const rel = relative(ROOT, file).replace(/\\/g, '/').replace(/^src\//, '');
      const rule = FORBIDDEN.find((r) => rel.startsWith(r.prefix));
      if (rule && !rule.allow.includes(rel) && file !== entry) {
        fail('boundary', path.join(' -> '), relative(ROOT, entry), 0);
        continue;
      }

      for (const spec of importsOf(source)) {
        const next = resolveSpec(file, spec);
        if (next) stack.push({ file: next, path: [...path, relative(ROOT, next)] });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// (e) .env hygiene (§6.6)
// ---------------------------------------------------------------------------

function checkEnvHygiene() {
  const example = join(ROOT, '.env.example');
  if (existsSync(example)) {
    const text = readFileSync(example, 'utf8');
    /*
     * **CREDENTIAL SHAPES ONLY.** The business-information shapes (`api.z.ai`,
     * `glm-4`) exist to catch a model name reaching the BROWSER; `.env.example`
     * is where those values are supposed to be documented, and failing on them
     * here would mean deleting the documentation to satisfy the scanner.
     *
     * The DSN pattern needs one more carve-out for the same reason: the example
     * file documents the local Docker credential, `postgres://jmtarot:jmtarot@127.0.0.1`.
     * It is a DSN with an inline password and it is also the intended content of
     * the file. A LOOPBACK host is the discriminator -- a real leaked DSN points
     * somewhere reachable.
     */
    const LOOPBACK = /postgres(?:ql)?:\/\/[^\s"']+@(?:127\.0\.0\.1|localhost|db)[:/]/;
    for (const shape of SHAPES) {
      if (shape.warn || !shape.credential) continue;
      const m = shape.re.exec(text);
      if (!m) continue;
      /*
       * Tested against the surrounding text, NOT `m[0]`: the DSN pattern stops
       * at the `@`, so the host -- the only part that says whether this is a
       * placeholder -- is not inside the match. Getting that wrong made the
       * carve-out silently inert on the first attempt.
       */
      if (shape.name.startsWith('dsn') && LOOPBACK.test(text.slice(m.index, m.index + 120))) continue;
      // A real key pasted into the committed example file is a classic.
      fail('.env.example', `contains a ${shape.name}`, '.env.example', m.index);
    }
  }

  try {
    execFileSync('git', ['check-ignore', '-q', '.env.local'], { cwd: ROOT });
  } catch {
    fail('.env hygiene', '.env.local is NOT gitignored', '.gitignore', 0);
  }

  const tracked = execFileSync('git', ['ls-files', '--', '.env*'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && f !== '.env.example');
  for (const f of tracked) {
    fail('.env hygiene', 'a .env file other than .env.example is tracked', f, 0);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const files = scanSet();
  if (files.length === 0) {
    console.error('audit-secrets: the scan set is EMPTY. Run `npm run build` first.');
    process.exit(1);
  }

  const needles = await derivedNeedles();
  if (needles.length === 0) {
    /*
     * A tripwire with no needles passes everything. That is the exact failure
     * mode W7-D16 exists to prevent, so it is fatal rather than a warning.
     */
    console.error('audit-secrets: derived ZERO prompt needles. The audit cannot pass vacuously.');
    process.exit(1);
  }

  const skeletonNeedles = needles.map((n) => ({ ...n, skel: skeleton(n.needle) }));

  const envPairs: { name: string; form: string }[] = [];
  for (const name of SECRET_ENV) {
    const value = process.env[name];
    if (!value) continue;
    for (const form of valueForms(value)) envPairs.push({ name, form });
  }

  for (const file of files) {
    const rel = relative(ROOT, file);
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const skel = skeleton(text);

    // (a) prompt needles, verbatim then skeleton
    for (const { needle, origin, skel: needleSkel } of skeletonNeedles) {
      const at = text.indexOf(needle);
      if (at !== -1) {
        fail('prompt text', origin, rel, at);
        continue;
      }
      if (needleSkel.length >= 24) {
        const skelAt = skel.indexOf(needleSkel);
        if (skelAt !== -1) fail('prompt text (skeleton)', origin, rel, skelAt);
      }
    }

    // (b) env names, then env values
    for (const name of SECRET_ENV) {
      const at = text.indexOf(name);
      if (at !== -1) fail('env name', name, rel, at);
    }
    for (const { name, form } of envPairs) {
      const at = text.indexOf(form);
      // NEVER the value, only which variable it was.
      if (at !== -1) fail('env VALUE', name, rel, at);
    }

    // (c) shapes
    for (const shape of SHAPES) {
      const m = shape.re.exec(text);
      if (!m) continue;
      if (shape.warn) warnings.push(`${shape.name} in ${rel} at ${m.index}`);
      else fail('shape', shape.name, rel, m.index);
    }
  }

  checkNextPublic();
  checkClientBoundary();
  checkEnvHygiene();

  console.log(
    `audit-secrets: ${files.length} files, ${needles.length} derived needles, ` +
      `${envPairs.length} env value forms.`,
  );

  for (const w of warnings) console.warn(`  warn: ${w}`);

  if (findings.length > 0) {
    console.error(`\naudit-secrets: ${findings.length} FINDING(S)\n`);
    for (const f of findings) {
      // Origin, file and offset. Never the matched text.
      console.error(`  [${f.rule}] ${f.detail}\n      ${f.file} @ byte ${f.offset}`);
    }
    console.error(
      '\nIf a finding is legitimate, do not add a suppression -- work out how the value\n' +
        'reached the browser. The usual causes are a server component passing an env var\n' +
        'as a prop (it lands in the .rsc payload, not in .next/static) and a client\n' +
        "component importing a module it should not. `.next/server/chunks/**` is\n" +
        'excluded on purpose and is not a finding.\n',
    );
    process.exit(1);
  }

  console.log('audit-secrets: clean.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
