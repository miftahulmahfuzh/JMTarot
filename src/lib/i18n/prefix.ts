/**
 * The `/en/` prefix for public content, and the route table it applies to.
 *
 * ── WHAT THIS MODULE IS ──────────────────────────────────────────────────────
 *
 * v0.4.0 S-D1 is the FIRST AND ONLY breach of D6, and it is fenced to five
 * routes. Indonesian serves at the bare path; English serves at `/en/…`. The
 * nine app routes are untouched: `/`, `/[reader]`, `/[reader]/[service]`,
 * `/history`, `/history/[id]`, `/account`, `/onboarding`, `/login`, `/terms`,
 * `/privacy` still resolve locale from the session claim, then the cookie, then
 * `Accept-Language`, exactly as W6 built it. CLAUDE.md's `## Localization` line
 * "locale is never a URL segment" is amended, not deleted — read it there.
 *
 * ── FOUR CONSTRAINTS, ALL OF THEM STRUCTURAL ─────────────────────────────────
 *
 * **NO `server-only`.** `src/middleware.ts` imports this and runs it on the
 * edge, and this module's own test imports it under Vitest. `resolve.ts`'s
 * header records the same constraint and the reason: the package throws wherever
 * the `react-server` condition is absent.
 *
 * **NO `next/*`, NOT EVEN A TYPE.** `src/lib/auth/gate.ts` imports this
 * (S1's edit, per contract G2), and that file's header says there is not a
 * `NextRequest` or a `NextResponse` anywhere in it. A type-only import would
 * satisfy the compiler and break the promise.
 *
 * **NO `process.env`.** `localePath` is the one function here a client component
 * might reach for, and a non-`NEXT_PUBLIC_` variable inlines as `undefined` in a
 * client bundle. `resolve.ts`'s `localeSwitcherEnabled` records that this
 * already happened once, for about ten minutes.
 *
 * **THE ROUTE TABLE LIVES HERE, WITH THE PREFIX MATHS.** You cannot decide
 * whether to honour `/en/x` without knowing whether `/x` is content, and a
 * request that is one function call away from that decision must not need two
 * modules to make it.
 *
 * ── THE PARSER IS NOT THE FENCE ──────────────────────────────────────────────
 *
 * `stripLocalePrefix` is a syntactic parse: it will happily tell you that
 * `/en/history` is `en` plus `/history`. What refuses to SERVE that is
 * `isContentPath`, and the only function `middleware.ts` calls is
 * `contentRewrite`, which consults it. Read those two before concluding this
 * file guards anything.
 */
import { DEFAULT_LOCALE, isLocale, type Locale } from './locale';

/**
 * The URL segment each locale is served under. `null` means "the bare path".
 *
 * **INDONESIAN HAS EXACTLY ONE ADDRESS AND IT IS THE BARE ONE.** `id` is the
 * default and the source language (`DEFAULT_LOCALE`), the canonical and the
 * `x-default` both point at the bare path, and a `/id/` twin would be a
 * duplicate of every page in the index. `stripLocalePrefix` still RECOGNISES
 * `/id/` — that is what lets `contentRewrite` answer a guessed `/id/gallery`
 * with a 301 to the address that exists, rather than with a 404.
 *
 * A `Record<Locale, …>` and not a lookup with a fallback: a third locale must be
 * a compile error listing what to decide, not a silent `undefined`.
 */
export const LOCALE_SEGMENT: Record<Locale, string | null> = { id: null, en: 'en' };

export type StrippedPath = { locale: Locale | null; path: string };

/**
 * `/en/gallery` -> `{ locale: 'en', path: '/gallery' }`.
 *
 * TAKES A PATHNAME, not a URL and not a path-with-query. A query string rides
 * along into `path`, where `isContentPath` rejects it and the request falls
 * through to the gate — wrong, and safe. `request.nextUrl.pathname` never
 * carries one.
 *
 * ONE SEGMENT, CASE-SENSITIVELY, ON A SEGMENT BOUNDARY. `/english` is not
 * prefixed, `/EN/gallery` is not prefixed, and `/en/en/gallery` strips to
 * `/en/gallery` which is not a content path. Every one of those has a test, and
 * each of them is a way one page could otherwise acquire a second address.
 */
export function stripLocalePrefix(pathname: string): StrippedPath {
  const slash = pathname.indexOf('/', 1);
  const head = slash === -1 ? pathname.slice(1) : pathname.slice(1, slash);
  if (!isLocale(head)) return { locale: null, path: pathname };
  const rest = slash === -1 ? '' : pathname.slice(slash);
  return { locale: head, path: rest === '' ? '/' : rest };
}

/**
 * The address a bare content path has in a given locale.
 *
 * `('en', '/gallery')` -> `/en/gallery`; `('id', '/gallery')` -> `/gallery`;
 * `('en', '/')` -> `/en`, never `/en/`.
 *
 * **THROWS ON AN ALREADY-PREFIXED PATH.** Every caller has a bare path in hand,
 * because a server page knows its own route; a prefixed argument means somebody
 * passed a request path through, and the output would be `/en/en/gallery` inside
 * a canonical tag. A canonical pointing at a page that does not exist
 * de-indexes the page that does, and nothing reports it — so this fails loudly
 * at implementation time instead.
 */
export function localePath(locale: Locale, path: string): string {
  if (stripLocalePrefix(path).locale !== null) {
    throw new Error(`localePath received an already-prefixed path: ${path}`);
  }
  const segment = LOCALE_SEGMENT[locale];
  if (segment === null) return path;
  return path === '/' ? `/${segment}` : `/${segment}${path}`;
}

/**
 * Every public content route, as BARE paths (roadmap §3.1).
 *
 * `/arcana` is `exact` even though it has no page: §3.1 makes it a 404
 * "deliberately", and it has to be a 404 from Next's routing rather than a 302
 * from the gate. Same argument covers a `/blog/<slug>` nobody wrote.
 *
 * TWO SHAPES ONLY — an exact path, or one segment under a named tree. There is
 * no `startsWith` on a bare prefix anywhere in this file, because
 * `startsWith('/blog')` also matches `/blogroll`, and `gate.ts`'s header
 * explains at length why that class of mistake is worth writing code to avoid.
 */
const CONTENT_EXACT: readonly string[] = ['/', '/gallery', '/blog', '/arcana'];
const CONTENT_TREES: readonly string[] = ['/arcana/', '/blog/'];

/**
 * One trailing slash removed, except from the root.
 *
 * The canonical address of every content page has no trailing slash, and
 * `contentRewrite` 301s anything that disagrees — for BOTH locales, so that the
 * two behave identically rather than one of them relying on Next's own 308.
 */
function canonicalise(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * Is this bare path inside the public content tree?
 *
 * **BARE PATHS ONLY.** `isContentPath('/en/gallery')` is `false`, deliberately:
 * a caller strips first (`contentRewrite` does) and then asks. A version that
 * accepted both spellings is one edit away from letting `/en/history` through.
 *
 * Used by `contentRewrite` (may this prefix be honoured, and must the cookie
 * write be skipped) and — via `isPublicContentPath` — by `gate.ts`.
 */
export function isContentPath(path: string): boolean {
  // `//gallery` is not a path we serve, and it would otherwise canonicalise
  // into something that looks like one.
  if (path.startsWith('//')) return false;
  const p = canonicalise(path);
  if (CONTENT_EXACT.includes(p)) return true;
  return CONTENT_TREES.some((tree) => {
    if (!p.startsWith(tree)) return false;
    const slug = p.slice(tree.length);
    return slug.length > 0 && !slug.includes('/');
  });
}

/**
 * What `isPublic()` in `src/lib/auth/gate.ts` may add (S1's edit, contract G2).
 *
 * **`/` IS DELIBERATELY EXCLUDED, AND THIS IS THE ONE LINE IN THIS FILE TO
 * PROTECT.** `isPublic()` short-circuits `decide()` before the onboarding check,
 * so `/` in that allowlist stops a signed-in half-onboarded querent from being
 * sent to `/onboarding` and lands them on a picker that assumes a completed
 * profile. S-D5 forbids it in capitals; a predicate that quietly included it
 * would be that change with nothing in the diff to argue with. `/` is handled by
 * S-D5's own clause in `decide()`, after the onboarding arm.
 *
 * `prefix.test.ts` asserts the symmetric difference with `isContentPath` is
 * exactly `['/']`.
 */
export function isPublicContentPath(path: string): boolean {
  return isContentPath(path) && canonicalise(path) !== '/';
}

/**
 * What `src/middleware.ts` should do with this request.
 *
 * `passthrough` — not content. D6 exactly as W6 built it: resolve the chain,
 *                 write the cookie when it disagrees, no rewrite.
 * `bare`        — a content path at its canonical bare address. PIN `locale`
 *                 into `x-jmt-locale`, write NO cookie, do not rewrite.
 * `rewrite`     — a content path under `/en/`. PIN `locale`, write NO cookie,
 *                 and rewrite the request to `path`.
 * `redirect`    — a content address that is not canonical (`/id/…`, or a
 *                 trailing slash). 301 to `to`, preserving the query.
 */
export type ContentDecision =
  | { kind: 'passthrough' }
  | { kind: 'bare'; locale: Locale }
  | { kind: 'rewrite'; locale: Locale; path: string }
  | { kind: 'redirect'; to: string };

/**
 * The whole locale decision for one request path.
 *
 * ── WHY THE SIGNATURE IS `(pathname, signedIn)` AND NOT `(request)` ──────────
 *
 * **§4.3 IS SATISFIED BY CONSTRUCTION.** `?lang=` cannot reach a function that
 * is never handed a query string, so on a content route the prefix cannot be
 * overridden by a query parameter — in development or in production. A
 * development-only inconsistency in the one mechanism whose entire point is
 * URL-determinism is the hour somebody loses. The override is untouched for the
 * nine app routes, where `resolveForMiddleware` still reads it.
 *
 * ── `signedIn` IS READ FOR EXACTLY ONE PATH ──────────────────────────────────
 *
 * `/` is dual-render (S-D5): landing signed out, reader picker signed in. The
 * pin would give a signed-in English querent an Indonesian picker, so on `/`
 * with a session we fall back to the D6 chain and the cookie write. Every other
 * path answers identically for both values, and there is a test that says so.
 *
 * The cost is that `/` is not CDN-cacheable — which is true for S-D5's reasons
 * before it is true for ours, and is the one content route S-D10's cache header
 * must not be applied to.
 *
 * ── THE ORDER OF THE ARMS IS THE SECURITY PROPERTY ───────────────────────────
 *
 * A prefix is honoured only after `isContentPath` has accepted the remainder.
 * There is no reachable input for which a gated path is served under `/en/`.
 */
export function contentRewrite(pathname: string, signedIn: boolean): ContentDecision {
  const { locale, path } = stripLocalePrefix(pathname);

  if (locale === null) {
    if (!isContentPath(pathname)) return { kind: 'passthrough' };
    const canonical = canonicalise(pathname);
    if (canonical !== pathname) return { kind: 'redirect', to: canonical };
    // S-D5. The root is the app for anyone holding a session.
    if (canonical === '/' && signedIn) return { kind: 'passthrough' };
    return { kind: 'bare', locale: DEFAULT_LOCALE };
  }

  /*
   * THE PREFIX IS ONLY HONOURED FOR A CONTENT PATH. `/en/history` leaves here
   * as `passthrough`, reaches `decide()` spelled exactly as the request spelled
   * it, and matches nothing. Read the negative-control block in the test file.
   */
  if (!isContentPath(path)) return { kind: 'passthrough' };

  const canonical = canonicalise(path);

  // Indonesian has one address and it is the bare one. A 301 rather than a 404,
  // so a guessed `/id/gallery` keeps whatever inbound link it arrived with.
  if (LOCALE_SEGMENT[locale] === null) return { kind: 'redirect', to: canonical };

  const target = localePath(locale, canonical);
  if (target !== pathname) return { kind: 'redirect', to: target };

  return { kind: 'rewrite', locale, path: canonical };
}
