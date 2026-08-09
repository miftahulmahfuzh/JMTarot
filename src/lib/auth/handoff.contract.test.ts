import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import id from '@/lib/i18n/locales/id';

/**
 * The standalone sign-in handoff, checked at the source level.
 *
 * **EVERY PROPERTY IN THIS FILE IS ONE DELETED LINE AWAY FROM GONE, AND NONE OF
 * THEM FAILS LOUDLY.** That is the whole reason the file exists. The mechanism
 * spans a manifest, a middleware, a server action, a page, a route handler and a
 * client component; the querent it is for is on an iPhone; and loop 5 cannot
 * reproduce the bug it fixes, because loop 5 has one cookie jar and iOS has two.
 * So the acceptance test is a person with a phone, and this is what stops the
 * five files drifting apart between two of those.
 *
 * The mechanism is `src/lib/auth/handoff.ts`; the seven measurements it rests on
 * are `docs/plans/2026-08-09-standalone-signin-handoff-design.md` §1.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
/** Comments removed. `queries/contract.test.ts`'s rule: *a rule that fires on
 *  prose describing the rule is a rule people delete.* */
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const LEAF = read('src/lib/auth/handoff.ts');
const MIDDLEWARE = read('src/middleware.ts');
const MANIFEST = read('src/app/manifest.ts');
const FORM = read('src/components/SignInForm.tsx');
const CLAIMER = read('src/components/HandoffClaim.tsx');
const CLAIM_ROUTE = read('src/app/api/auth/handoff/route.ts');
const PAGE = read('src/app/handoff/page.tsx');
const QUERIES = read('src/lib/db/queries/handoff.ts');

describe('the leaf is edge-safe, because middleware imports it', () => {
  it('reads the file, so nothing below passes vacuously', () => {
    expect(strip(LEAF)).toContain('export function isPwaLaunch');
    expect(strip(LEAF)).toContain('export async function deviceHash');
  });

  it('carries no server-only marker, no next/*, and nothing from the data layer', () => {
    /*
     * `config.ts`'s split, one release later. A `@/lib/db` import here reaches
     * `postgres`, which reaches `node:net` — the build dies, which is fine — and
     * the tempting fix is `runtime = 'nodejs'` on the middleware, which passes the
     * build and instantiates a Postgres pool inside a function that runs on nearly
     * every request in the application.
     */
    const code = strip(LEAF);
    expect(code).not.toContain("import 'server-only'");
    expect(code).not.toMatch(/from '(next|next\/)/);
    expect(code).not.toContain('@/lib/db');
  });

  it('uses Web Crypto and never node:crypto', () => {
    // `randomBytes` and `createHash` do not exist on the edge. The symptom is a
    // middleware that throws on the one request this feature exists for, which is
    // a request nobody in WSL can make.
    const code = strip(LEAF);
    expect(code).not.toContain('node:crypto');
    expect(code).toContain('crypto.getRandomValues');
    expect(code).toContain('crypto.subtle.digest');
  });
});

describe('the launch marker has one owner', () => {
  it('is emitted by the manifest from the leaf, never as a literal', () => {
    /*
     * **TWO LITERALS THAT MUST AGREE ARE TWO LITERALS THAT WILL NOT.** If the
     * manifest's `start_url` and middleware's `isPwaLaunch` ever disagree, no
     * cookie is set, no row is written, and the installed app is silently back to
     * never being able to sign in — with every test in this project still green.
     */
    const code = strip(MANIFEST);
    expect(code).toContain("from '@/lib/auth/handoff'");
    expect(code).toContain('start_url: START_URL');
    expect(code).not.toMatch(/start_url:\s*['"]/);
  });

  it('is recognised by middleware through the same module', () => {
    expect(strip(MIDDLEWARE)).toContain("from '@/lib/auth/handoff'");
    expect(strip(MIDDLEWARE)).toContain('isPwaLaunch(');
  });
});

describe('middleware writes the device cookie BELOW the cookie strip', () => {
  /**
   * **THIS IS THE ASSERTION THAT PROTECTS THE ONE MISTAKE ANYBODY WOULD MAKE.**
   * A signed-out `/` is a content response, so S-D10's outer wrapper deletes
   * every `Set-Cookie` on it — and that is exactly the response the installed app
   * launches into. Writing `jmt_pwa` anywhere inside the gate puts it in the one
   * place guaranteed to remove it, silently, with the feature looking implemented
   * and the app still unable to sign in.
   *
   * Source position is crude and is the only thing assertable here: middleware
   * cannot be exercised in Vitest.
   */
  it('marks the app after the strip, not before it', () => {
    const strip_ = MIDDLEWARE.indexOf("headers.delete('set-cookie')");
    const mark = MIDDLEWARE.indexOf('markInstalledApp(request, response)');
    expect(strip_).toBeGreaterThan(-1);
    expect(mark).toBeGreaterThan(strip_);
  });

  it('appends rather than sets, so the sliding session cookie survives', () => {
    // The response may already carry a re-issued `authjs.session-token`. `set`
    // would replace every `Set-Cookie` on it and sign a returning querent out on
    // the one navigation this branch runs for.
    expect(strip(MIDDLEWARE)).toContain("headers.append('set-cookie'");
  });

  it('writes it httpOnly and skips it when the cookie already exists', () => {
    const code = strip(MIDDLEWARE);
    expect(code).toContain('HttpOnly');
    expect(code).toContain('SameSite=Lax');
    // The guard is what makes this fire once per install rather than on every
    // launch, which is what keeps a `Set-Cookie` off `/` for everybody else.
    expect(code).toContain('request.cookies.has(PWA_COOKIE)');
  });
});

describe('SignInForm owns both ends of the handoff', () => {
  it('mints through handoffRedirect rather than deciding for itself', () => {
    const code = strip(FORM);
    expect(code).toContain("from '@/lib/auth/handoffMint'");
    expect(code).toContain('await handoffRedirect(redirectTo)');
  });

  it('mounts the claimer ONLY for the installed app', () => {
    /*
     * The landing page's *"no client JavaScript on its primary control"* property
     * holds for every visitor who is not the installed app — which is every
     * crawler and every browser. Unconditional mounting would trade that away for
     * everybody to buy it for one client.
     */
    const code = strip(FORM);
    expect(code).toContain('installedApp ? <HandoffClaim /> : null');
    expect(code).toContain('cookies()).get(PWA_COOKIE)');
  });

  it('still calls signIn exactly once, through the one action', () => {
    // `SignInForm.test.ts` fences the file set; this fences the count, because a
    // second `signIn` here would be a second sign-in path with no handoff on it.
    expect([...strip(FORM).matchAll(/signIn\('google'/g)]).toHaveLength(1);
  });
});

describe('the claim route', () => {
  it('is under /api/auth/, which is already public, so the gate needed no edit', () => {
    /*
     * The caller's entire problem is that it has no session. `isPublic()` already
     * covers this prefix — the clause `dev-session` has always lived under — and
     * "public" there means *no session required*, never *unauthenticated*: what
     * replaces the session is a 256-bit httpOnly cookie that must ALSO match a row
     * another browser bound after Google said yes.
     */
    expect(read('src/lib/auth/gate.ts')).toContain("pathname.startsWith('/api/auth/')");
  });

  it('names the session cookie from config.ts, never as a literal', () => {
    /*
     * @auth/core prefixes `__Secure-` on https, so a typed name sets the wrong
     * cookie in production ONLY and looks perfectly correct locally. The same
     * constant is also the HKDF salt, so the two cannot be allowed to disagree.
     */
    const code = strip(CLAIM_ROUTE);
    expect(code).toContain('SESSION_COOKIE_NAME');
    expect(code).not.toContain('authjs.session-token');
  });

  it('encodes through the shared minter rather than calling @auth/core directly', () => {
    // Two hand-rolled encodes would be two ways to get `salt` wrong, and the
    // symptom is a cookie that decrypts to nothing and reads as a bad AUTH_SECRET.
    const code = strip(CLAIM_ROUTE);
    expect(code).toContain("from '@/lib/auth/mint'");
    expect(code).not.toContain("from '@auth/core/jwt'");
  });

  it('answers every unsuccessful outcome with the same 204', () => {
    /*
     * No row, expired, already claimed, unbound, user since deleted — one answer.
     * A route that distinguished them would be an oracle for probing the table,
     * and the querent could not act on the difference anyway.
     */
    const code = strip(CLAIM_ROUTE);
    expect(code).toContain('status: 204');
    expect([...code.matchAll(/NOTHING_TO_CLAIM\(\)/g)].length).toBeGreaterThan(4);
    expect(code).not.toMatch(/status:\s*(400|401|403|404|409|500)/);
  });

  it('reads no user id from the request, because there is no body at all', () => {
    // `/api/events`'s rule. The only input is a cookie the browser already had.
    const code = strip(CLAIM_ROUTE);
    expect(code).not.toContain('request.json');
    expect(code).not.toContain('request.text');
  });

  it('declares a runtime and a duration, because it writes on the cold path', () => {
    /*
     * CLAUDE.md's `POST /api/locale` trap: a route that WRITES is very likely the
     * request that wakes a suspended Neon compute, and Hobby's default is ten
     * seconds. This one fires seconds after a sign-in, on a phone, in an app that
     * has been closed — which is that trap's description almost word for word.
     */
    const code = strip(CLAIM_ROUTE);
    expect(code).toContain("export const runtime = 'nodejs'");
    expect(code).toContain('export const maxDuration');
  });

  it('logs error classes, never the error object', () => {
    expect(strip(CLAIM_ROUTE)).not.toMatch(/console\.error\([^)]*,\s*err\s*\)/);
  });
});

describe('the claim listener', () => {
  it('has all three triggers, and each covers a case the others do not', () => {
    /*
     * Mount covers the app having been EVICTED while the overlay was open — it
     * relaunches cold with no event to hear. `visibilitychange` is the ordinary
     * `Done` press (finding 4). `pageshow`+`persisted` is the bfcache restore
     * (finding 5), which fires no `visibilitychange` on every engine — and which
     * is also the alternative explanation §1 had to rule out before any of this
     * was built.
     */
    const code = strip(CLAIMER);
    expect(code).toContain('visibilitychange');
    expect(code).toContain('pageshow');
    expect(code).toContain('event.persisted');
    // Three call sites: the two handlers and the mount. A whitespace-insensitive
    // count, because a formatter must not be able to fail a behavioural assertion.
    expect([...code.matchAll(/void claim\(\)/g)].length).toBeGreaterThanOrEqual(3);
  });

  it('acts only on a 200, so a 204 leaves the querent where they are', () => {
    // 204 is the ordinary answer and means *nothing was waiting*. Reloading on it
    // would put an installed app into a refresh loop on every foreground.
    expect(strip(CLAIMER)).toContain('res.status !== 200');
  });

  it('bounds its own fetch and guards against a double claim', () => {
    const code = strip(CLAIMER);
    expect(code).toContain('AbortController');
    expect(code).toContain('busy.current');
    expect(code).toContain('done.current');
  });

  it('renders nothing and shows nothing', () => {
    /*
     * From inside the room the querent pressed `Done` and the app is signed in.
     * Announcing the machinery would be describing our bug in the middle of their
     * sign-in — §6 records this as untested on a person, which it still is.
     */
    expect(strip(CLAIMER)).toContain('return null;');
    expect(strip(CLAIMER)).not.toMatch(/t\(['"]/);
  });
});

describe('the overlay page', () => {
  it('is force-dynamic and noindex', () => {
    const code = strip(PAGE);
    expect(code).toContain("export const dynamic = 'force-dynamic'");
    expect(code).toContain('robots: { index: false, follow: false }');
  });

  it('never throws on a database that is down', () => {
    // A 500 here costs the querent the one sentence telling them what to do next.
    expect(strip(PAGE)).toMatch(/try\s*\{[\s\S]*bindHandoff[\s\S]*\}\s*catch/);
  });

  it('says a DIFFERENT sentence when nothing was bound', () => {
    /*
     * Telling somebody they are signed in and to press `Done` when no row was
     * bound sends them back to an app that is still signed out, with nothing to do
     * about it.
     */
    const code = strip(PAGE);
    expect(code).toContain('handoff.ready.action');
    expect(code).toContain('handoff.stale.body');
    expect(code).toContain('bound ?');
  });

  it('offers the escape hatch for the visitor who has no Done button', () => {
    // An ordinary Safari tab carrying the marker cookie — a shared `?src=pwa` URL
    // — has no sheet to dismiss, and without this the page is a dead end for
    // somebody who is in fact signed in.
    expect(strip(PAGE)).toContain('handoff.continue');
  });

  it('uses only keys that exist in the source catalog', () => {
    const used = [...strip(PAGE).matchAll(/t\('([a-z][a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(3);
    for (const key of used) expect(Object.keys(id), key).toContain(key);
  });
});

describe('the statements', () => {
  it('bind, claim and sweep all measure expiry against POSTGRES’s clock', () => {
    /*
     * `now()` and never a JS `Date` in the predicate: a lambda whose clock has
     * drifted must not be able to widen its own expiry, and a test that compares
     * two clocks fails once a year at midnight and is never reproduced.
     */
    const code = strip(QUERIES);
    expect([...code.matchAll(/expiresAt\} > now\(\)/g)].length).toBeGreaterThanOrEqual(2);
  });

  it('makes single use the database’s job, not the application’s', () => {
    // A check-then-update would be the same code with a window in it, and the
    // window would open exactly when a querent double-taps.
    const code = strip(QUERIES);
    expect(code).toContain('isNull(authHandoffs.claimedAt)');
    expect(code).toContain('.returning({ userId: authHandoffs.userId })');
  });

  it('refuses to re-bind a row that already has a user', () => {
    /*
     * The challenge travels in a URL — the one place this mechanism writes
     * anything down. Without `user_id is null` in the `where`, anybody who came by
     * it could re-point a bound row at their own account and be signed into
     * somebody else's installed app when the claim arrives.
     */
    expect(strip(QUERIES)).toContain('isNull(authHandoffs.userId)');
  });

  it('never selects or returns the device secret, which is not stored at all', () => {
    const code = strip(QUERIES);
    expect(code).not.toContain('PWA_COOKIE');
    expect(code).toContain('deviceHash');
  });
});
