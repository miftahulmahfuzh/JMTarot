# S2 — Locale-addressable public content (`/en/` prefix + hreflang)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Indonesian serves at the bare path and English at an `/en/` prefix, for the five
public content routes and nothing else, so both halves of a bilingual site are indexable —
without touching D6 for any of the nine app routes, without a second route tree, and without
a cookie on any content response.

**Architecture:** One pure, edge-safe leaf (`src/lib/i18n/prefix.ts`) owns the prefix maths
*and* the content route table, because you cannot decide whether to honour a prefix without
knowing which routes may carry one. `src/middleware.ts` calls it once per request and
translates the answer into either a 301 (a non-canonical content address), a
`NextResponse.rewrite(url, { request: { headers } })` with the locale **pinned** from the URL,
or the existing D6 passthrough. One helper (`src/lib/seo/alternates.ts`) emits canonical +
reciprocal `hreflang` + `x-default` as absolute URLs from an origin passed in, so it stays a
leaf and never depends on S1's `origin.ts` landing. The switcher on a content page is a
server-rendered plain `<a href>` to the sibling URL — not a `next/link`, and not `LocaleSwitch`.

**Tech Stack:** Next 16 App Router, `NextResponse.rewrite` with the `request:` form, Vitest
(unit project only), TypeScript 5.x, `curl -i` with no cookie jar, and `tools/e2e/run.sh`
(CDP) for the two questions curl cannot answer. No new dependency. No schema change. No model
call.

---

## 0. Read before you start

Read these, in this order, and do not skip the third:

1. `PUBLIC_RELEASE_ROADMAP_v0.4.0.md` §§2 (S-D1, S-D2, S-D3, S-D5, S-D10, S-D11, S-D15),
   3.1, 4 entire, 6.1, 6.2, 6.5, 11. **It outranks this plan.**
2. `CLAUDE.md` `## Localization (W6)`, especially "The five things a future session will
   otherwise undo". Item 5 (the root layout is dynamic and that is correct) is load-bearing
   here: content pages are `ƒ` and that is not a regression.
3. `docs/workstream-notes.md` `## Localization (W6) -- the traps`. The `?lang=` trap, the
   `router.refresh()` dependency-array trap and the `server-only` alias all bear on this work.
4. `src/lib/i18n/resolve.ts` and `src/lib/i18n/locale.ts` — the whole of both. `resolve.ts`'s
   header explains why it carries no `server-only` marker; the same constraint binds the new
   leaf, for the same reason (the edge middleware imports it, and so does its own test).
5. `src/middleware.ts` — the whole file. The comment in `respond()`'s `next` case already
   records the exact trap S-D2 warns about, one function call earlier.
6. `src/app/s/[slug]/page.tsx` — the nested-`LocaleProvider` precedent. **You are not going to
   use it.** Read `## 9.4` below before you copy it.

### The two facts that make this workstream dangerous

**A prefix-stripping bug that makes the gated app reachable under `/en/` is the worst outcome
available in this release, and it would look like a working feature.** `/en/gallery` renders a
public page, `/en/history` must not render a private one. The defence is that
`contentRewrite()` honours a prefix **only** when the remainder is one of five known content
paths, and the negative controls for that predicate are written before the predicate.

**Getting the rewrite form wrong is silent.** `NextResponse.rewrite(url)` without
`{ request: { headers } }` serves the right route and forwards no `x-jmt-locale`; `getLocale()`
then falls through to the `jmt_locale` cookie and *appears* to work, so `/en/gallery` comes out
in English for you and in Indonesian for the next visitor whose cookie says `id`. **No test in
this plan catches that except the live one in Task 12** — a `curl` against `/gallery` with a
planted `jmt_locale=en` cookie. Do not skip it.

### Environment

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
node -v      # must print v24.x
```

Every `npm`/`npx` command below assumes that line has been run in the current shell.
`npm test` is the unit project only and needs no Docker. Run `npm run build` before believing
a green `npm run typecheck` (the TypeScript trap in CLAUDE.md).

---

## 1. The contract, in one place

Everything else in this plan is an implementation of this table. `signed` is whether
`readToken(request.auth?.user)` returned non-null.

| request | signed | 301 | rewrite | `x-jmt-locale` | `jmt_locale` written | gate sees |
|---|---|---|---|---|---|---|
| `/gallery` | either | — | — | **`id`, pinned** | **no** | `/gallery` |
| `/gallery/` | either | → `/gallery` | — | — | no | — |
| `/en/gallery` | either | — | → `/gallery` | **`en`, pinned** | **no** | `/gallery` |
| `/en/gallery/` | either | → `/en/gallery` | — | — | no | — |
| `/id/gallery` | either | → `/gallery` | — | — | no | — |
| `/arcana/the-moon` | either | — | — | `id`, pinned | no | `/arcana/the-moon` |
| `/en/arcana/the-moon` | either | — | → `/arcana/the-moon` | `en`, pinned | no | `/arcana/the-moon` |
| `/arcana` | either | — | — | `id`, pinned | no | `/arcana` → **404**, publicly |
| `/` | no | — | — | **`id`, pinned** | **no** | `/` |
| `/` | **yes** | — | — | **D6 chain** | **yes** | `/` |
| `/en`, `/en/` | no | `/en/` → `/en` | → `/` | `en`, pinned | no | `/` |
| `/en`, `/en/` | **yes** | `/en/` → `/en` | → `/` | `en`, pinned | no | `/` |
| `/thessaly`, `/history`, `/account`, `/login`, `/terms` | either | — | — | D6 chain | yes | unchanged |
| `/en/history`, `/en/account`, `/en/api/events` | either | — | — | D6 chain | yes | **`/en/history` etc., verbatim** |
| `/s/<slug>` | either | — | — | D6 chain | **no** (V7) | `/s/<slug>` |

Five things to read off it:

1. **On a content path the URL is the only input.** No cookie, no session claim, no
   `Accept-Language`, no `?lang=`. §4.1.
2. **`/` is the one exception and it is forced.** S-D5 makes `/` dual-render, so a signed-in
   English user's reader picker must stay English. `contentRewrite` therefore reads `signedIn`
   **for exactly one path**, and a test asserts every other path answers identically for both
   values. See `## 9.1`.
3. **No content response writes a cookie**, which is also why `/` signed-out writes none.
4. **The gate sees the stripped path.** Contract G1, `## 2`.
5. **A prefixed non-content path is not stripped at all.** `/en/history` reaches `decide()`
   verbatim, matches nothing, and 302s to `/login` for a stranger or 404s for a signed-in
   user. It is in no sitemap and no `hreflang`; nothing links it.

---

## 2. The gate ordering contract — resolved

> **CONTRACT G1.** `src/middleware.ts` resolves the content prefix **first** and passes the
> **stripped, prefix-free pathname** to `decide()`. `decide()` therefore never receives a path
> beginning `/en` **for a content route**. S1 writes `isPublic()` and S-D5's `/` clause against
> **bare paths only**.
>
> **CONTRACT G2 (defence in depth).** `isPublic()` must nonetheless answer `false` for
> `/en/history`, `/en/account`, `/en/onboarding` and `/en/api/*`, so that if a future edit ever
> makes stripping unconditional the gate is still a fence. The cheap way to get that, plus the
> `/en/gallery` spelling §6.1 asks to be tested, is for the **content clause only** to strip
> first:
>
> ```ts
> // in isPublic(), S1's edit — the content clause, and ONLY this clause, strips.
> isPublicContentPath(stripLocalePrefix(pathname).path)
> ```
>
> The `/login`, `/terms`, `/privacy`, `/api/events`, `/api/locale`, `/api/cron/`, `/s/` and
> `/api/auth/` clauses keep matching the **raw** path, or `/en/api/events` becomes public.

### Why strip-first, and not gate-first

Three reasons, in increasing weight.

1. **Gate-first duplicates the route list across two owners.** `isPublic()` would need
   `/en/gallery`, `/en/arcana/`, `/en/blog` written out beside the bare forms, in S1's file,
   kept in step with my table by hand. `gate.ts`'s own header explains that it is a function
   and not a regex precisely so that "never a widened prefix" reads as code — and
   `pathname.startsWith('/en/')` is the widened prefix somebody writes at 11pm.
2. **Strip-first makes the security property structural.** A path is un-prefixed only if the
   remainder is one of five known content paths. There is no reachable input for which
   `decide()` sees `/history` because the request said `/en/history`.
3. **S-D5's `/` clause only works under strip-first, and this is the argument that settles
   it.** `/en` rewrites to `/`, so the gate sees `/`:
   - `/en`, signed out → S-D5's `pathname === '/'` clause → `next` → the English landing.
   - `/en`, signed in but not onboarded → not public → `redirect('/onboarding')`. **Correct.**

   Under gate-first, S1's clause would have to read `pathname === '/' || pathname === '/en' ||
   pathname === '/en/'`, and the onboarding arm for `/en` would be missed by everybody, because
   nobody tests `/en` while signed in and half-onboarded.

The cost of strip-first is that `decide()` is no longer reachable with a prefixed content path
in production, so §6.1's "test both spellings" becomes a test of a defence rather than of a
live path. G2 keeps it real, and `## Deltas requested` D1 names the exact cases.

---

## 3. Module layout

```
src/lib/i18n/prefix.ts          NEW. PURE, EDGE-SAFE, ZERO RUNTIME IMPORTS but `./locale`.
                                LOCALE_SEGMENT, stripLocalePrefix, localePath,
                                isContentPath, isPublicContentPath, contentRewrite.
                                Imported by src/middleware.ts (edge), by src/lib/auth/gate.ts
                                (S1), by src/lib/seo/alternates.ts, and by its own test.
                                NO `server-only`. NO `next/*`. NO `process.env`.
src/lib/i18n/prefix.test.ts     NEW. The exhaustive table, the adversarial cases, the
                                negative controls, the loop-safety proof.
src/lib/i18n/contentLocale.contract.test.ts
                                NEW. Source-level contracts: the `request:` form, the call
                                ORDER in middleware, the cookie guard, no `/en/` literal
                                outside the leaf, no client import of the leaf.
src/lib/seo/alternates.ts       NEW. contentAlternates, sitemapLanguages. Absolute URLs from
                                an `origin` PARAMETER — it does not import S1's origin.ts.
src/lib/seo/alternates.test.ts  NEW. Reciprocity, x-default, and assignability to Next's own
                                Metadata / MetadataRoute.Sitemap types.
src/components/ContentLocaleLink.tsx
                                NEW. SERVER component. A plain `<a href>`. Reuses
                                LocaleSwitch.module.css. No new catalog key.
src/middleware.ts               MODIFIED (S2 owns it, §6.2). The matcher does NOT change.
src/components/LocaleSwitch.module.css
                                MODIFIED. One `.link` class, scoped to anchors.
src/components/LocaleSwitch.tsx MODIFIED. Header pointer only. `localeSwitch.test.ts` green.
src/lib/i18n/resolve.ts         MODIFIED. A pointer comment. No behaviour change.
CLAUDE.md, .env.example         MODIFIED. The D6 amendment and LOCALE_SWITCHER's scope.
docs/workstream-notes.md        MODIFIED. A new section with the traps this work paid for.
```

### Why a new leaf and not `resolve.ts` (§6.5 named `resolve.ts`)

Four reasons. This is a deliberate deviation and it is in `## Flags`.

1. **`gate.ts` must be able to import it, and `gate.ts` may not import `resolve.ts`.**
   `gate.ts`'s header says, flatly, "there is not a `NextRequest` or a `NextResponse` anywhere
   in this file". `resolve.ts` opens with `import type { NextRequest } from 'next/server'`.
   Type-only, erased, harmless to the bundle — and a grep for `NextRequest` in `gate.ts`'s
   import graph would find it, which is exactly the kind of quiet erosion that header exists to
   prevent.
2. **`resolve.ts` reads `process.env` and the new module must not.** `localeSwitcherEnabled()`
   reads a non-`NEXT_PUBLIC_` variable, and its comment records that it "lived in
   `LocaleSwitch.tsx` for about ten minutes". `localePath` is the one function here a client
   component might plausibly reach for, and putting it in a module that inlines `undefined` in
   a client bundle is the same trap wearing a different hat.
3. **They answer different questions and must not be allowed to blend.** `resolve.ts` answers
   *what language does this visitor want*; `prefix.ts` answers *what does this URL address*.
   §4.1's whole point is that on a content route the second question is the only one asked. One
   file invites a future `resolveForMiddleware` to grow a prefix arm and reintroduce the chain.
4. **The route table has to live with the prefix maths.** You cannot decide whether to honour
   `/en/x` without knowing whether `/x` is content, and a table of routes has no business in a
   locale-negotiation module.

`resolve.ts` gets a one-line pointer comment instead of a re-export: two import paths for one
function is its own smell, and the pointer is what a person following §6.5 will actually read.

---

## 4. Task 1 — `stripLocalePrefix` and `localePath`

**Files:**
- Create: `src/lib/i18n/prefix.ts`
- Create: `src/lib/i18n/prefix.test.ts`

**Step 1: Write the failing test**

Create `src/lib/i18n/prefix.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { localePath, stripLocalePrefix } from './prefix';

/**
 * The prefix parser and builder (S2, roadmap S-D1/S-D2).
 *
 * **THE PARSER IS NOT THE FENCE.** `stripLocalePrefix('/en/history')` returns
 * `{ locale: 'en', path: '/history' }` on purpose — it is a syntactic parse and
 * nothing else. What refuses to serve the gated app under `/en/` is
 * `isContentPath`, tested in the next describe, and `contentRewrite`, which is
 * the only function `middleware.ts` calls. Somebody reading only this block will
 * conclude the stripper guards the app; it does not, and that misreading is how
 * the worst failure available in this release would ship.
 */
describe('stripLocalePrefix', () => {
  it('strips the English prefix and returns the bare path', () => {
    expect(stripLocalePrefix('/en/gallery')).toEqual({ locale: 'en', path: '/gallery' });
    expect(stripLocalePrefix('/en/arcana/the-moon')).toEqual({
      locale: 'en',
      path: '/arcana/the-moon',
    });
  });

  it('reports no prefix on a bare path', () => {
    expect(stripLocalePrefix('/gallery')).toEqual({ locale: null, path: '/gallery' });
    expect(stripLocalePrefix('/')).toEqual({ locale: null, path: '/' });
  });

  /*
   * `/en` and `/en/` are the English HOME, so the remainder is `/` and not the
   * empty string. An empty string would make `isContentPath('')` false and turn
   * the English landing page into a 302 to /login, which is the exact bug this
   * release exists to remove.
   */
  it('treats a bare prefix as the root', () => {
    expect(stripLocalePrefix('/en')).toEqual({ locale: 'en', path: '/' });
    expect(stripLocalePrefix('/en/')).toEqual({ locale: 'en', path: '/' });
  });

  /*
   * INDONESIAN IS RECOGNISED THOUGH IT IS NEVER SERVED PREFIXED. The parser has
   * to see `/id/` for `contentRewrite` to be able to 301 it to the bare address;
   * refusing to parse it would make `/id/gallery` a 404 instead, which throws
   * away an inbound link for a path people will guess precisely because `/en/`
   * exists. The POLICY that `id` has one address lives in `LOCALE_SEGMENT`.
   */
  it('recognises the Indonesian segment too', () => {
    expect(stripLocalePrefix('/id/gallery')).toEqual({ locale: 'id', path: '/gallery' });
    expect(stripLocalePrefix('/id')).toEqual({ locale: 'id', path: '/' });
  });

  it('needs a whole segment, not a prefix of one', () => {
    expect(stripLocalePrefix('/english')).toEqual({ locale: null, path: '/english' });
    expect(stripLocalePrefix('/ender')).toEqual({ locale: null, path: '/ender' });
    expect(stripLocalePrefix('/identity')).toEqual({ locale: null, path: '/identity' });
  });

  /*
   * CASE-SENSITIVE, because URLs are. A case-insensitive strip would be the one
   * way `/EN/history` could become `/history`, and normalising case here would
   * also invent a second address for every page.
   */
  it('is case-sensitive', () => {
    expect(stripLocalePrefix('/EN/gallery')).toEqual({ locale: null, path: '/EN/gallery' });
    expect(stripLocalePrefix('/En/gallery')).toEqual({ locale: null, path: '/En/gallery' });
  });

  /*
   * ONE PASS, NEVER A LOOP. `/en/en/gallery` yields `/en/gallery`, which is not a
   * content path, so `contentRewrite` passes it through and the gate 404s it. A
   * recursive strip would serve one page at unboundedly many addresses.
   */
  it('strips exactly one segment', () => {
    expect(stripLocalePrefix('/en/en/gallery')).toEqual({ locale: 'en', path: '/en/gallery' });
    expect(stripLocalePrefix('/en/id')).toEqual({ locale: 'en', path: '/id' });
  });

  it('keeps a trailing slash rather than normalising it here', () => {
    // `isContentPath` normalises and `contentRewrite` 301s. Doing it in two
    // places would mean two answers to "what is the canonical address".
    expect(stripLocalePrefix('/en/gallery/')).toEqual({ locale: 'en', path: '/gallery/' });
    expect(stripLocalePrefix('/gallery/')).toEqual({ locale: null, path: '/gallery/' });
  });

  /*
   * IT TAKES A PATHNAME, AND A MISUSE FAILS CLOSED. `request.nextUrl.pathname`
   * never contains `?`, but this function is exported, so somebody will hand it a
   * full path one day. The query rides along into `path`, `isContentPath` then
   * rejects it, and the request passes through to the gate — wrong, and safe.
   */
  it('fails closed when handed a query string', () => {
    expect(stripLocalePrefix('/en/gallery?lang=id')).toEqual({
      locale: 'en',
      path: '/gallery?lang=id',
    });
  });
});

describe('localePath', () => {
  it('adds the segment for English and nothing for Indonesian', () => {
    expect(localePath('en', '/gallery')).toBe('/en/gallery');
    expect(localePath('id', '/gallery')).toBe('/gallery');
    expect(localePath('en', '/arcana/the-moon')).toBe('/en/arcana/the-moon');
  });

  it('maps the root to `/en` and `/`', () => {
    // `/en/` would be a second address for one page. `contentRewrite` 301s it.
    expect(localePath('en', '/')).toBe('/en');
    expect(localePath('id', '/')).toBe('/');
  });

  /*
   * THROWS ON AN ALREADY-PREFIXED PATH, rather than producing `/en/en/gallery`.
   * Every caller has a bare path in hand (a server page knows its own route), so
   * a prefixed argument is a programming error — and the output would be a
   * canonical tag pointing at a page that does not exist, which is the worst
   * class of SEO bug because it de-indexes the correct page.
   */
  it('refuses a path that already carries a prefix', () => {
    expect(() => localePath('en', '/en/gallery')).toThrow(/already-prefixed/);
    expect(() => localePath('id', '/id/gallery')).toThrow(/already-prefixed/);
  });
});
```

**Step 2: Run it and watch it fail**

```sh
npm test -- prefix
```

Expected: FAIL — `Failed to resolve import "./prefix" from "src/lib/i18n/prefix.test.ts"`.

**Step 3: Write `src/lib/i18n/prefix.ts`**

Only the two functions and the segment table in this task; the route table arrives in Task 2.

```ts
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
import { isLocale, type Locale } from './locale';

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
```

**Step 4: Run the test again**

```sh
npm test -- prefix
```

Expected: PASS, 12 tests.

**Step 5: Typecheck and commit**

```sh
npm run typecheck
git add src/lib/i18n/prefix.ts src/lib/i18n/prefix.test.ts
git commit -m "S2: the /en/ prefix parser and builder, as a pure edge-safe leaf"
```

---

## 5. Task 2 — the content route table, and the one-path difference that is security-relevant

**Files:**
- Modify: `src/lib/i18n/prefix.ts` (append)
- Modify: `src/lib/i18n/prefix.test.ts` (append)

**Step 1: Write the failing test**

Append to `src/lib/i18n/prefix.test.ts` (and extend the import at the top to
`import { isContentPath, isPublicContentPath, localePath, stripLocalePrefix } from './prefix';`):

```ts
/**
 * The route table (roadmap §3.1, S-D3). BARE paths only — never a prefixed one.
 *
 * `/cards/…` IS FORBIDDEN AND IS NOT AN OVERSIGHT: `public/cards/` already
 * serves 22 `.webp` files there and `middleware.ts`'s matcher excludes `cards/`
 * twice over, so a page route under it would be un-gated, would never receive
 * `x-jmt-locale`, and would race a static file. S-D3 has the full argument.
 */
describe('isContentPath', () => {
  const CONTENT = [
    '/',
    '/gallery',
    '/blog',
    '/blog/how-to-read-tarot',
    '/arcana',
    '/arcana/the-moon',
    '/arcana/wheel-of-fortune',
  ];

  it.each(CONTENT)('accepts %s', (path) => {
    expect(isContentPath(path)).toBe(true);
  });

  /*
   * `/arcana` WITH NO SLUG IS CONTENT THOUGH IT IS A 404 (§3.1: "deliberately",
   * because `/gallery` is the index and two indexes of one collection compete).
   * It is here so that a crawler which truncates `/arcana/the-moon` gets a clean
   * 404 from Next's own routing rather than a 302 to `/login` — a 302 on a path
   * a crawler constructed from an indexable one is the bug this release exists
   * to remove. Same for a `/blog/<slug>` that does not exist: S6's `notFound()`
   * answers, and the gate never sees it.
   */
  it('accepts /arcana so that its 404 is a 404 and not a login redirect', () => {
    expect(isContentPath('/arcana')).toBe(true);
    expect(isContentPath('/blog/nothing-was-ever-written-here')).toBe(true);
  });

  it('tolerates exactly one trailing slash', () => {
    expect(isContentPath('/gallery/')).toBe(true);
    expect(isContentPath('/arcana/the-moon/')).toBe(true);
  });

  /*
   * ── THE NEGATIVE CONTROLS. §6.1 names the first three by hand. ─────────────
   * A widened prefix is how this predicate would make the app public, so every
   * near-miss is written down.
   */
  it.each([
    '/gallerywhatever',
    '/galleries',
    '/blogroll',
    '/arcanas',
    '/arcana-the-moon',
    '/history',
    '/account',
    '/onboarding',
    '/login',
    '/terms',
    '/privacy',
    '/thessaly',
    '/thessaly/daily',
    '/api/events',
    '/api/reading',
    '/s/abcdefghjkmn',
    '/arcana/the-moon/extra',
    '/blog/a/b',
    '/cards/18_moon.webp',
    '/en/history',
    '/en/gallery',
    '/id/gallery',
    '//gallery',
    '/gallery?lang=en',
  ])('rejects %s', (path) => {
    expect(isContentPath(path)).toBe(false);
  });

  /*
   * `/en/gallery` AND `/id/gallery` ARE REJECTED, and that is not a bug — this
   * predicate answers about BARE paths. `contentRewrite` strips first and then
   * asks. A version of this function that accepted prefixed paths would let
   * `isPublic('/en/history')` through the moment somebody "unified" the two.
   */
  it('answers about bare paths only, so a caller must strip first', () => {
    expect(isContentPath(stripLocalePrefix('/en/gallery').path)).toBe(true);
    expect(isContentPath(stripLocalePrefix('/en/history').path)).toBe(false);
  });
});

/**
 * ── THE MOST SECURITY-RELEVANT LINE IN THIS MODULE ──────────────────────────
 *
 * `isPublicContentPath` is what S1's `isPublic()` may call. It differs from
 * `isContentPath` by exactly one path — `/` — and the reason is S-D5:
 *
 *   `isPublic()` SHORT-CIRCUITS `decide()` BEFORE THE ONBOARDING CHECK. Putting
 *   `/` in it would stop redirecting a signed-in, half-onboarded querent to
 *   `/onboarding` and would land them on the reader picker, which assumes a
 *   completed profile. S-D5 says "DO NOT ADD `'/'` TO `isPublic()`" in capitals,
 *   and a predicate that quietly includes it is that change arriving through the
 *   back door with a green suite.
 *
 * `/` is instead handled by a dedicated clause in `decide()` (S1's, S-D5) that
 * sits AFTER the onboarding arm. The test below makes the difference a fact
 * rather than an accident.
 */
describe('isPublicContentPath', () => {
  it('differs from isContentPath by exactly the root', () => {
    const corpus = [
      '/',
      '/gallery',
      '/blog',
      '/blog/x',
      '/arcana',
      '/arcana/the-moon',
      '/history',
      '/en/gallery',
      '/gallerywhatever',
    ];
    const differ = corpus.filter((p) => isContentPath(p) !== isPublicContentPath(p));
    expect(differ).toEqual(['/']);
  });

  it('is false for the root and true for the rest of the tree', () => {
    expect(isPublicContentPath('/')).toBe(false);
    expect(isPublicContentPath('/gallery')).toBe(true);
    expect(isPublicContentPath('/arcana/the-moon')).toBe(true);
  });
});
```

**Step 2: Run it and watch it fail**

```sh
npm test -- prefix
```

Expected: FAIL — `isContentPath is not a function` (or a TS resolution error naming the two
missing exports).

**Step 3: Append the implementation to `src/lib/i18n/prefix.ts`**

```ts
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
```

**Step 4: Run the test again**

```sh
npm test -- prefix
```

Expected: PASS, ~45 tests (the `it.each` blocks expand).

**Step 5: Commit**

```sh
npm run typecheck
git add src/lib/i18n/prefix.ts src/lib/i18n/prefix.test.ts
git commit -m "S2: the content route table, and the one path isPublic() must not learn"
```

---

## 6. Task 3 — `contentRewrite`, the whole decision

**Files:**
- Modify: `src/lib/i18n/prefix.ts` (append)
- Modify: `src/lib/i18n/prefix.test.ts` (append)

This is the function `middleware.ts` calls, and it is where §4.1, §4.3, S-D5 and S-D10 all
land. Read `## 1`'s table again before writing it.

**Step 1: Write the failing test**

Append to `src/lib/i18n/prefix.test.ts` (extend the import with `contentRewrite`):

```ts
/**
 * The one function `src/middleware.ts` calls (S-D2).
 *
 * PURE, AND IT TAKES A PATHNAME AND A BOOLEAN — no `NextRequest`, no
 * `searchParams`, no headers. That is how §4.3 is satisfied BY CONSTRUCTION:
 * `?lang=en` cannot reach this function, so on a content route it cannot fight
 * the prefix, in development or in production. The dev override is still alive
 * for the nine app routes, where `resolveForMiddleware` reads it.
 */
describe('contentRewrite', () => {
  describe('a bare content path pins the default locale (§4.1)', () => {
    /*
     * **THE URL IS THE ONLY INPUT.** No cookie, no session claim, no
     * `Accept-Language`. A visitor whose browser says `en-GB` landing on
     * `/gallery` gets Indonesian and is NOT redirected: auto-redirecting a
     * crawler by `Accept-Language` is how sites hide half their content from an
     * index, and a page whose language depends on the visitor's cookie can be
     * neither canonicalised nor cached at the edge.
     */
    it('answers `bare` with id for every content path', () => {
      expect(contentRewrite('/gallery', false)).toEqual({ kind: 'bare', locale: 'id' });
      expect(contentRewrite('/arcana/the-moon', false)).toEqual({ kind: 'bare', locale: 'id' });
      expect(contentRewrite('/blog', false)).toEqual({ kind: 'bare', locale: 'id' });
    });
  });

  describe('a prefixed content path is rewritten to the bare route (S-D2)', () => {
    it('rewrites and pins en', () => {
      expect(contentRewrite('/en/gallery', false)).toEqual({
        kind: 'rewrite',
        locale: 'en',
        path: '/gallery',
      });
      expect(contentRewrite('/en/arcana/the-moon', true)).toEqual({
        kind: 'rewrite',
        locale: 'en',
        path: '/arcana/the-moon',
      });
    });

    /*
     * `/en` IS THE ENGLISH HOME and rewrites to `/`. §3.1 lists the route as
     * `/en/`; `/en/` 301s here to `/en`, so §11.2's `curl -L` loop passes and
     * the sitemap and the canonical name exactly one address.
     */
    it('rewrites /en to the root', () => {
      expect(contentRewrite('/en', false)).toEqual({ kind: 'rewrite', locale: 'en', path: '/' });
    });
  });

  describe('non-canonical content addresses 301 (one issuer, both locales)', () => {
    it('sends /id/… to the bare path, because Indonesian has one address', () => {
      expect(contentRewrite('/id/gallery', false)).toEqual({ kind: 'redirect', to: '/gallery' });
      expect(contentRewrite('/id/arcana/the-moon', false)).toEqual({
        kind: 'redirect',
        to: '/arcana/the-moon',
      });
      expect(contentRewrite('/id', false)).toEqual({ kind: 'redirect', to: '/' });
      expect(contentRewrite('/id/', false)).toEqual({ kind: 'redirect', to: '/' });
    });

    /*
     * A TRAILING SLASH IS NOT A SECOND ADDRESS, and we issue the redirect for
     * the bare form too rather than leaving it to Next's `trailingSlash: false`
     * 308. Two issuers for one condition is how the two locales end up behaving
     * differently — 200 on one side, 308 on the other — for no reason anybody
     * can find later.
     */
    it('normalises a trailing slash in both locales', () => {
      expect(contentRewrite('/gallery/', false)).toEqual({ kind: 'redirect', to: '/gallery' });
      expect(contentRewrite('/en/gallery/', false)).toEqual({
        kind: 'redirect',
        to: '/en/gallery',
      });
      expect(contentRewrite('/en/', false)).toEqual({ kind: 'redirect', to: '/en' });
    });
  });

  describe('everything else is D6, untouched', () => {
    it.each([
      '/thessaly',
      '/thessaly/daily',
      '/history',
      '/history/abc',
      '/account',
      '/onboarding',
      '/login',
      '/terms',
      '/privacy',
      '/api/events',
      '/s/abcdefghjkmn',
      '/gallerywhatever',
      '/blogroll',
    ])('passes %s through', (path) => {
      expect(contentRewrite(path, false)).toEqual({ kind: 'passthrough' });
      expect(contentRewrite(path, true)).toEqual({ kind: 'passthrough' });
    });

    /*
     * ── THE WORST OUTCOME AVAILABLE IN THIS RELEASE, FENCED ─────────────────
     *
     * A prefixed NON-content path is not stripped, not rewritten and not
     * redirected. `/en/history` reaches `decide()` verbatim, matches nothing,
     * and 302s to `/login` for a stranger or 404s for a signed-in user. Nothing
     * links it, it is in no sitemap and in no `hreflang` set.
     *
     * If any of these ever returned `rewrite`, the whole gated application
     * would be reachable under `/en/` — and it would look like a working
     * feature.
     */
    it.each([
      '/en/history',
      '/en/history/abc',
      '/en/account',
      '/en/onboarding',
      '/en/login',
      '/en/terms',
      '/en/api/events',
      '/en/api/reading',
      '/en/thessaly',
      '/en/thessaly/daily',
      '/en/s/abcdefghjkmn',
      '/en/en/gallery',
      '/EN/gallery',
      '/id/history',
      '/id/account',
    ])('never lets %s become a served route', (path) => {
      expect(contentRewrite(path, false)).toEqual({ kind: 'passthrough' });
      expect(contentRewrite(path, true)).toEqual({ kind: 'passthrough' });
    });
  });

  /**
   * ── `/` IS THE ONE PATH WHERE THE SESSION IS READ, AND IT IS FORCED ────────
   *
   * S-D5 makes `/` dual-render: a static landing signed out, the reader picker
   * signed in, byte-for-byte as today. Pinning `id` there unconditionally would
   * hand a signed-in English querent an Indonesian reader picker — D6 broken on
   * the busiest screen in the app, by the workstream that promised not to touch
   * it.
   *
   * So the pin applies to `/` only when there is no session. The consequence,
   * stated because it is the thing that will look wrong later: `/` cannot be
   * CDN-cached, because it already varies by session for reasons that are
   * S-D5's, not S2's. See `## Deltas requested` D4.
   */
  describe('the root, and the only place a session is consulted', () => {
    it('pins id for a stranger', () => {
      expect(contentRewrite('/', false)).toEqual({ kind: 'bare', locale: 'id' });
    });

    it('leaves a signed-in visitor on the D6 chain', () => {
      expect(contentRewrite('/', true)).toEqual({ kind: 'passthrough' });
    });

    /*
     * NEGATIVE CONTROL, in the shape `/s/[slug]`'s contract test uses for
     * `viewerLocale`: the session must change the answer for `/` and for
     * NOTHING ELSE. Without this, a plausible future edit ("skip the pin for
     * signed-in users, they have a preference") silently turns every content
     * page into a session-varying, uncacheable response.
     */
    it('gives the identical answer for every other path, signed in or out', () => {
      for (const path of [
        '/gallery',
        '/gallery/',
        '/blog',
        '/blog/x',
        '/arcana',
        '/arcana/the-moon',
        '/en',
        '/en/',
        '/en/gallery',
        '/id/gallery',
        '/history',
        '/en/history',
      ]) {
        expect({ [path]: contentRewrite(path, true) }).toEqual({
          [path]: contentRewrite(path, false),
        });
      }
    });
  });

  /**
   * ── NO REDIRECT LOOP, PROVED RATHER THAN REASONED ─────────────────────────
   *
   * A 301 whose target 301s again is a loop the browser shows as
   * ERR_TOO_MANY_REDIRECTS and the crawler shows as nothing at all. Every
   * redirect target here must settle in at most one further step.
   */
  it('settles every address in at most two steps', () => {
    const starts = [
      '/',
      '/gallery',
      '/gallery/',
      '/en',
      '/en/',
      '/en/gallery',
      '/en/gallery/',
      '/id',
      '/id/',
      '/id/gallery',
      '/id/gallery/',
      '/arcana/the-moon/',
      '/en/arcana/the-moon/',
    ];
    for (const start of starts) {
      let path = start;
      let steps = 0;
      let decision = contentRewrite(path, false);
      while (decision.kind === 'redirect') {
        path = decision.to;
        steps += 1;
        expect({ [start]: steps }).not.toEqual({ [start]: 3 });
        decision = contentRewrite(path, false);
      }
      expect({ [start]: decision.kind }).not.toEqual({ [start]: 'redirect' });
    }
  });
});
```

**Step 2: Run it and watch it fail**

```sh
npm test -- prefix
```

Expected: FAIL — `contentRewrite is not a function`.

**Step 3: Append the implementation**

```ts
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
```

Extend the module's import line to `import { DEFAULT_LOCALE, isLocale, type Locale } from './locale';`.

**Step 4: Run the test again**

```sh
npm test -- prefix
```

Expected: PASS, ~110 tests.

**Step 5: Commit**

```sh
npm run typecheck
git add src/lib/i18n/prefix.ts src/lib/i18n/prefix.test.ts
git commit -m "S2: contentRewrite -- the whole locale decision for one request path"
```

---

## 7. Task 4 — wire it into `src/middleware.ts`

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/lib/i18n/resolve.ts` (one pointer comment)

The matcher does **not** change (§6.2: "if a plan thinks it does, that is a flag" — it does
not). `/gallery`, `/arcana/*`, `/blog*` and every `/en/` twin already match
`'/((?!_next/|cards/|dukuns/|favicon|icon|apple-icon|manifest|sitemap|robots).*)'`.

**Step 1: Replace the body of the default export**

Replace lines 37–111 of `src/middleware.ts` (from `export default auth((request) => {` to the
closing `});`) with:

```ts
export default auth((request) => {
  const { pathname } = request.nextUrl;

  /*
   * `request.auth` is the Session that @auth/core built from the decoded cookie, so
   * this is the same narrowing `currentUser()` performs and it costs no I/O. A
   * token that fails to narrow -- no `uid`, a `uid` that is not uuid-shaped, a
   * claim set from before this release -- reads as signed out, which sends the user
   * to /login rather than into a query with `undefined` as a foreign key.
   */
  const viewer = readToken(request.auth?.user);
  const signedIn = viewer !== null;

  /*
   * ── S2: THE CONTENT PREFIX, RESOLVED BEFORE ANYTHING ELSE (S-D1/S-D2) ──────
   *
   * v0.4.0's only breach of D6, fenced to the five routes in
   * `@/lib/i18n/prefix`. Indonesian serves bare, English serves under `/en/`,
   * and a content page's language comes from its URL and from nothing else.
   *
   * **THIS RUNS FIRST, AND CONTRACT G1 IS THE REASON.** `decide()` is handed the
   * STRIPPED path, so it never sees `/en/gallery` and S1's `isPublic()` is
   * written against bare paths only. Two consequences worth knowing:
   *
   *   - `/en` rewrites to `/`, so S-D5's `pathname === '/'` clause fires for the
   *     English landing AND the signed-in-but-not-onboarded arm still redirects
   *     to `/onboarding`. Under the other ordering that arm is missed and nobody
   *     tests it.
   *   - A prefixed path that is NOT content is never stripped. `/en/history`
   *     reaches `decide()` verbatim and matches nothing. A stripping bug that
   *     made the whole app reachable under `/en/` is the worst outcome available
   *     in this release and would look like a working feature.
   */
  const content = contentRewrite(pathname, signedIn);

  /*
   * A non-canonical content address: `/id/gallery`, or a trailing slash.
   *
   * RETURNED BEFORE THE GATE ON PURPOSE, and it is safe because `contentRewrite`
   * only ever redirects when the target is a PUBLIC content path -- no gated
   * route is reachable through it. `clone()` keeps the query, so a `?utm_source`
   * survives the hop. 301 and not the 307 `NextResponse.redirect` defaults to:
   * this is a permanent statement about where the page lives.
   */
  if (content.kind === 'redirect') {
    const url = request.nextUrl.clone();
    url.pathname = content.to;
    return NextResponse.redirect(url, 301);
  }

  /*
   * W6: the one place `Accept-Language` is parsed (I10) -- FOR THE NINE APP
   * ROUTES ONLY, now.
   *
   * On a content path the URL already decided (§4.1), and calling the chain here
   * would be the bug: an `en` cookie would render `/gallery` in English, which
   * cannot be canonicalised and cannot be cached at the edge. On everything else
   * this is W6 unchanged -- the claim comes off the token decoded above, so the
   * whole chain costs no I/O and no second JWE decrypt.
   */
  const locale =
    content.kind === 'passthrough'
      ? resolveForMiddleware(request, viewer?.loc ?? null)
      : content.locale;

  const decision = decide({
    // Contract G1: the STRIPPED path. `bare` and `passthrough` are already bare.
    pathname: content.kind === 'rewrite' ? content.path : pathname,
    signedIn,
    onboarded: viewer?.onb === true,
  });

  const response = respond(
    request,
    decision,
    locale,
    content.kind === 'rewrite' ? content.path : null,
  );

  /*
   * Refresh the cookie only when it disagrees, so an ordinary navigation does not
   * carry a redundant Set-Cookie. This cannot run for paths outside the matcher
   * and must not: `manifest`, `cards/`, `dukuns/` and `_next/` are excluded, which
   * is precisely why `manifest.ts` reads the cookie rather than the header (I13).
   *
   * **V7: `/s/` IS EXCLUDED, AND A THIRD PARTY MUST LEAVE WITH NOTHING IN THEIR
   * JAR.** A share page's viewer is a stranger who never agreed to anything and
   * may never come back; setting a cookie on them buys a locale preference for a
   * visit that is usually one page long, and it is the difference between
   * `/privacy` §4.4 saying "we count the view" and having to say "we also set a
   * cookie". `share.viewed` carries no `session_id` for the same reason, so there
   * is nothing to correlate on either way.
   *
   * **S2/S-D10: EVERY CONTENT RESPONSE IS EXCLUDED TOO, AND FOR A SECOND REASON
   * AS STRONG AS THE FIRST.** `content.kind !== 'passthrough'` covers `/gallery`,
   * `/en/gallery`, the 44 lore pages, the blog and the signed-out `/`:
   *
   *   1. THE PRIVACY REASON, which is V7's verbatim. `/privacy` §4.4 is honest
   *      only because a public page sets nothing, and v0.4.0 multiplies that
   *      surface from one route to forty-odd. Reading a blog post must also not
   *      silently change the language of a signed-in user's app.
   *   2. THE MECHANICAL REASON. **A `Set-Cookie` makes a response uncacheable at
   *      the edge**, and these are the pages whose TTFB a crawler measures. The
   *      whole point of pinning the locale from the URL is that the response is
   *      invariant, and a cookie is the one header that would undo it.
   *
   * A signed-in visitor on `/` takes the `passthrough` arm (S-D5: the root is
   * the app for them), so their cookie behaviour is exactly as it was.
   */
  if (
    content.kind === 'passthrough' &&
    !pathname.startsWith('/s/') &&
    request.cookies.get(LOCALE_COOKIE)?.value !== locale
  ) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: LOCALE_COOKIE_MAX_AGE,
      secure: process.env.NODE_ENV === 'production',
    });
  }

  /*
   * Evict the legacy cookie.
   *
   * Anyone signed in to the current deployment is carrying a `jmtarot_session`
   * that nothing will ever read again. Left alone it sits in the jar for thirty
   * days. Three lines, and it is the only remaining mention of that name anywhere
   * in the app.
   *
   * NOT reached on the 301 branch above, deliberately: deleting a cookie on a
   * redirect is a `Set-Cookie` on a response we want cacheable, and the next
   * request through the matcher evicts it anyway.
   */
  if (request.cookies.has(LEGACY_SESSION_COOKIE)) {
    response.cookies.delete(LEGACY_SESSION_COOKIE);
  }

  return response;
});
```

**Step 2: Replace `respond()`**

Replace the `next` case and the signature of `respond()`:

```ts
/**
 * Translate a decision into a response. The only part of the gate that knows what
 * a NextResponse is; the reasoning is in `gate.decide()`, which Vitest owns.
 *
 * `rewriteTo` is S2's: the bare route a `/en/…` request should render, or `null`
 * for every other request.
 */
function respond(
  request: Parameters<Parameters<typeof auth>[0]>[0],
  decision: ReturnType<typeof decide>,
  locale: string,
  rewriteTo: string | null,
): NextResponse {
  switch (decision.kind) {
    case 'next': {
      /*
       * `{ request: { headers } }` IS THE ONLY FORM THAT MUTATES WHAT DOWNSTREAM
       * SERVER COMPONENTS SEE -- for `NextResponse.next()` AND for
       * `NextResponse.rewrite()`. Setting a header on the plain response does
       * nothing for RSC, and the failure is silent: `getLocale()` falls through
       * to the `jmt_locale` cookie and appears to work.
       *
       * **ON THE REWRITE BRANCH THAT SILENCE IS WORSE, AND IT IS WHY S-D2 SAYS
       * SO IN CAPITALS.** `/en/gallery` would render the right route with no
       * `x-jmt-locale` at all, so the language would come from the VIEWER's
       * cookie: English for whoever is testing it, Indonesian for the next
       * stranger, on a page whose canonical says it is English. Nothing throws
       * and no test in this project's unit suite can see it. The check that
       * catches it is the live one -- `curl` `/gallery` carrying
       * `Cookie: jmt_locale=en` and reading `<html lang>`.
       */
      const headers = new Headers(request.headers);
      headers.set(LOCALE_HEADER, locale);

      if (rewriteTo === null) return NextResponse.next({ request: { headers } });

      const url = request.nextUrl.clone();
      url.pathname = rewriteTo;
      return NextResponse.rewrite(url, { request: { headers } });
    }
```

Leave the `json` and `redirect` cases exactly as they are, and extend the import block at the
top of the file:

```ts
import { contentRewrite } from '@/lib/i18n/prefix';
```

**Step 3: Add the pointer comment to `src/lib/i18n/resolve.ts`**

Immediately above `export function resolveForMiddleware(`:

```ts
/**
 * ── THE PREFIX HELPERS ARE NOT IN THIS FILE (v0.4.0 S2) ─────────────────────
 *
 * Roadmap §6.5 puts `stripLocalePrefix` / `localePath` here. They are in
 * `./prefix` instead, and the reason is `src/lib/auth/gate.ts`: it imports them
 * (contract G2) and its header says there is not a `NextRequest` or a
 * `NextResponse` anywhere in it, while this module opens with
 * `import type { NextRequest }`. This module also reads `process.env`, which is
 * the trap `localeSwitcherEnabled` below records.
 *
 * There is deliberately NO re-export: two import paths for one function is how
 * the two copies drift.
 *
 * **AND THE CHAIN BELOW IS NOT CONSULTED ON A CONTENT ROUTE.** §4.1: the URL
 * wins and is the only input there. `contentRewrite` decides that before
 * `middleware.ts` reaches this function.
 */
```

**Step 4: Typecheck, build and run the whole suite**

```sh
npm run typecheck
npm test
```

Expected: PASS. `npm test` was 1197 before this branch; it must now be 1197 plus the new
`prefix.test.ts` cases, with **nothing red**. In particular `src/lib/i18n/resolve.test.ts` and
`src/components/localeSwitch.test.ts` must be untouched and green.

```sh
npm run build
```

Expected: a successful build. If it dies with 36 `@vercel/turbopack-next/internal/font/google/font`
errors preceded by `fonts.gstatic.com` warnings, that is the AAAA/DNS trap in CLAUDE.md —
**retry the build**, it has always succeeded on the second run.

**Step 5: Commit**

```sh
git add src/middleware.ts src/lib/i18n/resolve.ts
git commit -m "S2: middleware rewrites /en/<content> and pins the locale from the URL"
```

---

## 8. Task 5 — the source-level contract test for middleware

**Files:**
- Create: `src/lib/i18n/contentLocale.contract.test.ts`

Middleware cannot be executed under Vitest (it is wrapped in `auth()` from a real NextAuth
instance and needs a `NextRequest` plus a decodable JWE), and the decisions that matter are
already pure and covered. What is left is a set of properties about the *shape* of
`middleware.ts` — the same idiom `src/components/localeSwitch.test.ts`,
`src/app/legal.test.ts` and `src/app/s/[slug]/page.contract.test.ts` use: read the source and
assert the property its own comment claims.

**Step 1: Write the failing test**

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * S2's contracts, asserted against the source.
 *
 * ── WHY SOURCE-LEVEL ────────────────────────────────────────────────────────
 *
 * `src/middleware.ts` is `auth(handler)` from a real NextAuth instance; running
 * it in Vitest means a `NextRequest`, a decodable JWE and an `AUTH_SECRET`, and
 * all of the DECISIONS it makes are already pure and exhaustively covered in
 * `prefix.test.ts`. What is left is four properties about how those decisions are
 * WIRED, each of which fails silently in production and cannot fail loudly
 * anywhere else. Same shape as `localeSwitch.test.ts` and `page.contract.test.ts`.
 */

const SRC = join(process.cwd(), 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/** Source with comments removed. See `localeSwitch.test.ts` for why this is needed. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

describe('the rewrite mutates what a server component sees (S-D2)', () => {
  const mw = code('middleware.ts');

  /**
   * **THE SILENT FAILURE THIS RELEASE IS MOST LIKELY TO SHIP.**
   *
   * `NextResponse.rewrite(url)` renders the right route and forwards no
   * `x-jmt-locale`, so `getLocale()` falls through to the `jmt_locale` cookie:
   * `/en/gallery` comes out English for whoever has an `en` cookie and
   * Indonesian for everyone else, under a canonical tag that says English.
   * `middleware.ts` already carried this warning for `NextResponse.next()`.
   */
  it('passes `request: { headers }` to rewrite, not only to next', () => {
    expect(mw).toMatch(/NextResponse\.rewrite\(\s*url\s*,\s*\{\s*request:\s*\{\s*headers\s*\}\s*\}\s*\)/);
    expect(mw).toMatch(/NextResponse\.next\(\s*\{\s*request:\s*\{\s*headers\s*\}\s*\}\s*\)/);
  });

  it('sets the locale header on the forwarded headers before either', () => {
    const setAt = mw.indexOf('headers.set(LOCALE_HEADER');
    const rewriteAt = mw.indexOf('NextResponse.rewrite');
    expect(setAt).toBeGreaterThan(-1);
    expect(rewriteAt).toBeGreaterThan(setAt);
  });
});

describe('the prefix is resolved before the chain and before the gate (contract G1)', () => {
  const mw = code('middleware.ts');

  /**
   * ORDER IS THE WHOLE CONTRACT. `contentRewrite` must run before
   * `resolveForMiddleware`, or a content page's language comes from the
   * visitor's cookie (§4.1 broken, and the page is uncacheable). And it must run
   * before `decide`, or S1's `isPublic()` is asked about `/en/gallery` and
   * S-D5's `/` clause never fires for the English landing.
   */
  it('calls contentRewrite first', () => {
    const contentAt = mw.indexOf('contentRewrite(');
    const resolveAt = mw.indexOf('resolveForMiddleware(');
    const decideAt = mw.indexOf('decide({');
    expect(contentAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeGreaterThan(contentAt);
    expect(decideAt).toBeGreaterThan(contentAt);
  });

  it('never consults the D6 chain on a content path', () => {
    // The chain is reachable only from the `passthrough` arm.
    expect(mw).toMatch(
      /content\.kind === 'passthrough'\s*\?\s*resolveForMiddleware\(/,
    );
  });

  it('hands `decide` the stripped path', () => {
    expect(mw).toMatch(/pathname:\s*content\.kind === 'rewrite' \? content\.path : pathname/);
  });

  /**
   * A 301 must not be gated. It is safe because `contentRewrite` only redirects
   * to a PUBLIC content path -- no gated route is reachable through it -- and it
   * must be, because a redirect that first 302s to `/login` is a redirect chain
   * a crawler abandons.
   */
  it('returns the 301 before the gate, as a 301 and not a 307', () => {
    const redirectAt = mw.indexOf("content.kind === 'redirect'");
    const decideAt = mw.indexOf('decide({');
    expect(redirectAt).toBeGreaterThan(-1);
    expect(decideAt).toBeGreaterThan(redirectAt);
    expect(mw).toMatch(/NextResponse\.redirect\(url,\s*301\)/);
  });
});

describe('no content response sets a cookie (S-D10)', () => {
  const mw = code('middleware.ts');

  /**
   * Two reasons, both in `middleware.ts`'s own comment: `/privacy` §4.4 is
   * honest only because a public page sets nothing, and a `Set-Cookie` makes the
   * response uncacheable at the edge on exactly the pages whose TTFB a crawler
   * measures.
   */
  it('guards the locale cookie on passthrough AND on /s/', () => {
    expect(mw).toMatch(
      /content\.kind === 'passthrough' &&\s*!pathname\.startsWith\('\/s\/'\) &&/,
    );
  });

  it('has exactly one place that writes the locale cookie', () => {
    expect(mw.match(/response\.cookies\.set\(LOCALE_COOKIE/g)).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------------- */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(SRC)
  .map((path) => ({ path: path.slice(SRC.length + 1), source: readFileSync(path, 'utf8') }))
  .filter((f) => !/\.test\.tsx?$/.test(f.path));

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('nothing hand-writes the prefix', () => {
  /** The two modules allowed to know what the segment looks like. */
  const OWNERS = ['lib/i18n/prefix.ts', 'lib/seo/alternates.ts'];

  /**
   * **ONE HELPER EMITS EVERY LOCALE-AWARE URL (S-D15).** Forty-four pages
   * hand-writing `/en/…` is forty-four chances to emit a non-reciprocal
   * `hreflang` pair, which Google discards silently -- the whole tag set stops
   * working and nothing reports it. It is also how CLAUDE.md's rule ("anything
   * reaching for `router.push('/en/...')` is wrong") gets broken inside the app,
   * where D6 still holds.
   */
  it('has no `/en` string literal outside prefix.ts and alternates.ts', () => {
    for (const file of FILES) {
      if (OWNERS.includes(file.path)) continue;
      const hits = [...stripComments(file.source).matchAll(/(['"`])\/en(\/|\1)/g)].map(
        (m) => m[0],
      );
      expect({ [file.path]: hits }).toEqual({ [file.path]: [] });
    }
  });
});

describe('no client component computes a locale URL', () => {
  const CLIENT = FILES.filter((f) =>
    /^\s*(['"])use client\1/m.test(f.source.split('import')[0]),
  );

  it('found the client components, so this is not vacuously passing', () => {
    expect(CLIENT.length).toBeGreaterThan(8);
  });

  /**
   * **`usePathname()` RETURNS THE PRE-REWRITE PATH, AND THAT IS THE TRAP.** On
   * `/en/gallery` the browser URL stays `/en/gallery` while the rendered route is
   * `/gallery`, so a client component computing a sibling URL from
   * `usePathname()` would build `/en/en/gallery` -- and would disagree with the
   * server about it, which is a hydration mismatch as well as a wrong link.
   *
   * The only correct source of the bare path is the server page, which knows its
   * own route. So `@/lib/i18n/prefix` is server-side only by convention, and this
   * is the convention. (The module itself is pure and client-SAFE; the fence is
   * about correctness, not about bundling.)
   */
  it('lets no client component import @/lib/i18n/prefix', () => {
    for (const file of CLIENT) {
      const imports = [...file.source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map(
        (m) => m[1],
      );
      expect({ [file.path]: imports.filter((s) => s.endsWith('/i18n/prefix')) }).toEqual({
        [file.path]: [],
      });
    }
  });
});
```

**Step 2: Run it**

```sh
npm test -- contentLocale
```

Expected: PASS. If the `/en` literal test fails, it will name the offending file and the
matched literal — fix the file, not the test.

**Step 3: Commit**

```sh
git add src/lib/i18n/contentLocale.contract.test.ts
git commit -m "S2: fence the rewrite form, the call order, the cookie guard and the prefix literal"
```

---

## 9. Task 6 — the canonical + `hreflang` + `x-default` helper (S-D15)

**Files:**
- Create: `src/lib/seo/alternates.ts`
- Create: `src/lib/seo/alternates.test.ts`

### 9.1 The signature, and why `origin` is a parameter

S1, S3, S4 and S6 all consume this, so the signature is a contract:

```ts
export type ContentAlternates = {
  canonical: string;
  languages: { id: string; en: string; 'x-default': string };
};

export function contentAlternates(input: {
  origin: string;
  path: string;    // the BARE path: '/', '/gallery', '/arcana/the-moon'
  locale: Locale;  // whose canonical this is
}): ContentAlternates;

export function sitemapLanguages(origin: string, path: string): ContentAlternates['languages'];
```

**`origin` is a required parameter and this module does not import S1's
`src/lib/seo/origin.ts`.** Three reasons:

1. **S-D11's leafness argument applies to this module more than to any other.** It is called by
   every content page's `generateMetadata` — the highest-traffic, most cacheable responses on
   the domain — and `origin.ts` reads `process.env`. A parameter keeps this file a pure
   function of its inputs, which is what makes the reciprocity test a table rather than a
   fixture.
2. **It unblocks S2 from S1.** `origin.ts` does not exist yet; this module and its test do not
   care.
3. **`hreflang` must be absolute, and it must not rely on `metadataBase`.** Google discards a
   relative `hreflang`. If these URLs were relative, a missing or wrong `metadataBase` would
   silently emit relative alternates and the whole tag set would stop working with nothing
   reporting it — which is the failure mode S-D15 exists to prevent. Building them absolutely,
   here, from an origin the caller had to name, makes that impossible.

Five call sites pass `origin: siteOrigin()`. If S1 wants one wrapper in its public shell, that
is welcome — see `## Deltas requested` D6.

**Step 1: Write the failing test**

Create `src/lib/seo/alternates.test.ts`:

```ts
import type { Metadata, MetadataRoute } from 'next';
import { describe, expect, it } from 'vitest';

import { LOCALES, type Locale } from '@/lib/i18n/locale';
import { stripLocalePrefix } from '@/lib/i18n/prefix';
import { contentAlternates, sitemapLanguages } from './alternates';

const ORIGIN = 'https://www.jmtarot.site';

/** Every shape of content path, including the root and both trees. */
const PATHS = ['/', '/gallery', '/blog', '/blog/how-to-read-tarot', '/arcana', '/arcana/the-moon'];

describe('contentAlternates', () => {
  it('emits absolute URLs for the canonical and every alternate', () => {
    const a = contentAlternates({ origin: ORIGIN, path: '/gallery', locale: 'id' });
    expect(a).toEqual({
      canonical: 'https://www.jmtarot.site/gallery',
      languages: {
        id: 'https://www.jmtarot.site/gallery',
        en: 'https://www.jmtarot.site/en/gallery',
        'x-default': 'https://www.jmtarot.site/gallery',
      },
    });
  });

  it('moves only the canonical when the locale changes', () => {
    const en = contentAlternates({ origin: ORIGIN, path: '/gallery', locale: 'en' });
    expect(en.canonical).toBe('https://www.jmtarot.site/en/gallery');
  });

  it('handles the root', () => {
    expect(contentAlternates({ origin: ORIGIN, path: '/', locale: 'en' })).toEqual({
      canonical: 'https://www.jmtarot.site/en',
      languages: {
        id: 'https://www.jmtarot.site/',
        en: 'https://www.jmtarot.site/en',
        'x-default': 'https://www.jmtarot.site/',
      },
    });
  });

  it('tolerates a trailing slash on the origin', () => {
    // `NEXT_PUBLIC_SITE_ORIGIN` is typed by a human into a dashboard.
    expect(
      contentAlternates({ origin: `${ORIGIN}/`, path: '/gallery', locale: 'id' }).canonical,
    ).toBe('https://www.jmtarot.site/gallery');
  });

  /**
   * ── RECIPROCITY, MECHANICALLY (S-D15) ─────────────────────────────────────
   *
   * **A NON-RECIPROCAL PAIR IS DISCARDED SILENTLY BY GOOGLE.** If `/gallery`
   * names `/en/gallery` and `/en/gallery` does not name `/gallery`, the WHOLE tag
   * set stops working -- not just the broken edge -- and nothing reports it. So
   * the property is not "each page has three tags", it is "the set is identical
   * on every page in the group".
   */
  it('emits the identical language set from every locale of the same path', () => {
    for (const path of PATHS) {
      const sets = LOCALES.map((locale) =>
        contentAlternates({ origin: ORIGIN, path, locale }).languages,
      );
      expect({ [path]: sets[1] }).toEqual({ [path]: sets[0] });
    }
  });

  it('names its own canonical inside its own language set', () => {
    for (const path of PATHS) {
      for (const locale of LOCALES) {
        const a = contentAlternates({ origin: ORIGIN, path, locale });
        expect({ path, locale, self: a.languages[locale] }).toEqual({
          path,
          locale,
          self: a.canonical,
        });
      }
    }
  });

  /**
   * THE GRAPH IS CLOSED. Walk to every URL a page names, derive that URL's own
   * path and locale, and assert its alternates name the page we came from. This
   * is the assertion that would fail if `localePath` and the canonical builder
   * ever disagreed about the root, which is the one path where they could.
   */
  it('is closed under following its own alternates', () => {
    for (const path of PATHS) {
      for (const locale of LOCALES) {
        const from = contentAlternates({ origin: ORIGIN, path, locale });
        for (const target of LOCALES) {
          const url = from.languages[target];
          const stripped = stripLocalePrefix(url.slice(ORIGIN.length) || '/');
          const back = contentAlternates({
            origin: ORIGIN,
            path: stripped.path === '' ? '/' : stripped.path,
            locale: (stripped.locale ?? 'id') as Locale,
          });
          expect({ from: from.canonical, target }).toEqual({
            from: back.languages[locale],
            target,
          });
        }
      }
    }
  });

  /**
   * `x-default` POINTS AT THE INDONESIAN URL. Roadmap S-D1's own table says so
   * ("`/arcana/the-moon` -> id (canonical, x-default)"): `id` is the default and
   * the source language, so the bare path is what a visitor whose language we
   * cannot match should be sent to.
   */
  it('points x-default at the Indonesian URL', () => {
    for (const path of PATHS) {
      const a = contentAlternates({ origin: ORIGIN, path, locale: 'en' });
      expect(a.languages['x-default']).toBe(a.languages.id);
    }
  });

  /**
   * **THROWS ON A PREFIXED OR NON-CONTENT PATH**, rather than emitting a wrong
   * canonical. A canonical pointing at a page that does not exist de-indexes the
   * page that does, and nothing reports it; a thrown error in
   * `generateMetadata` is loud at implementation time, which is the only place
   * this mistake is cheap.
   */
  it('refuses a prefixed path and a non-content path', () => {
    expect(() => contentAlternates({ origin: ORIGIN, path: '/en/gallery', locale: 'en' })).toThrow(
      /already-prefixed|not a content path/,
    );
    expect(() => contentAlternates({ origin: ORIGIN, path: '/history', locale: 'id' })).toThrow(
      /not a content path/,
    );
    expect(() => contentAlternates({ origin: ORIGIN, path: '/gallerywhatever', locale: 'id' })).toThrow(
      /not a content path/,
    );
  });

  /**
   * ASSIGNABLE TO NEXT'S OWN TYPE, checked here rather than at five call sites.
   * `Languages<T>` in `next/dist/lib/metadata/types/alternative-urls-types` is a
   * mapped type over a closed `HrefLang` union that includes `'id'`, `'en'` and
   * `'x-default'`; a Next upgrade that narrowed it would otherwise break four
   * workstreams' pages instead of one test.
   */
  it('is assignable to Metadata["alternates"]', () => {
    const alternates: NonNullable<Metadata['alternates']> = contentAlternates({
      origin: ORIGIN,
      path: '/arcana/the-moon',
      locale: 'en',
    });
    expect(alternates.canonical).toBe('https://www.jmtarot.site/en/arcana/the-moon');
  });
});

describe('sitemapLanguages', () => {
  /**
   * ONE IMPLEMENTATION, so the `<xhtml:link>` set in the sitemap and the
   * `<link rel="alternate">` set in the head cannot disagree. Google reads both
   * and treats a disagreement as a broken group.
   */
  it('is the same language set the head tags carry', () => {
    for (const path of PATHS) {
      expect(sitemapLanguages(ORIGIN, path)).toEqual(
        contentAlternates({ origin: ORIGIN, path, locale: 'id' }).languages,
      );
    }
  });

  it('is assignable to a sitemap entry', () => {
    const entry: MetadataRoute.Sitemap[number] = {
      url: `${ORIGIN}/gallery`,
      alternates: { languages: sitemapLanguages(ORIGIN, '/gallery') },
    };
    expect(entry.alternates?.languages?.en).toBe('https://www.jmtarot.site/en/gallery');
  });
});
```

**Step 2: Run it and watch it fail**

```sh
npm test -- alternates
```

Expected: FAIL — `Failed to resolve import "./alternates"`.

**Step 3: Write `src/lib/seo/alternates.ts`**

```ts
/**
 * Canonical, `hreflang` and `x-default` for a public content page (S-D15).
 *
 * ── ONE HELPER, AND THE REASON IS A FAILURE THAT REPORTS NOTHING ─────────────
 *
 * Forty-four pages hand-writing three `<link rel="alternate">` tags is
 * forty-four chances to emit a NON-RECIPROCAL pair -- and **Google discards a
 * non-reciprocal group silently**. Not the broken edge: the whole group. The
 * pages stay indexed, the language targeting simply stops existing, and there is
 * no console, no header and no report that says so. So this is one function, with
 * a test that walks the graph, called by every content page's
 * `generateMetadata()`.
 *
 * ── FOUR PROPERTIES, EACH OF WHICH IS A BUG IF LOST ─────────────────────────
 *
 * 1. **ABSOLUTE URLS, BUILT FROM AN `origin` PARAMETER.** A relative `hreflang`
 *    is discarded by Google. Next would resolve one against `metadataBase`, and
 *    depending on that puts the correctness of every alternate on a field in
 *    `layout.tsx` that S1 owns and that is absent in local development. So the
 *    caller names the origin and this function does the joining.
 * 2. **NO `process.env`, AND NO IMPORT OF `./origin`.** S-D11's leafness
 *    argument, applied to the module that runs on the most cacheable responses on
 *    the domain. It also means this file needed nothing from S1 to be written or
 *    tested.
 * 3. **`x-default` IS THE INDONESIAN URL.** S-D1's table: `id` is the default and
 *    the source language, and the bare path is where a visitor we cannot match
 *    should land.
 * 4. **IT THROWS ON A PATH IT SHOULD NOT HAVE BEEN GIVEN.** A prefixed path
 *    (`/en/gallery`) or an app path (`/history`) would produce a canonical
 *    pointing somewhere that does not exist -- and a wrong canonical de-indexes
 *    the correct page, which is the worst class of SEO bug because it looks like
 *    nothing at all. `generateMetadata` throwing during implementation is the
 *    cheap version of finding out.
 *
 * **`path` IS ALWAYS THE BARE PATH.** `/`, `/gallery`, `/arcana/the-moon`. The
 * `/en/` form is derived here and nowhere else; a contract test forbids the
 * literal anywhere outside this file and `@/lib/i18n/prefix`.
 */
import { type Locale } from '@/lib/i18n/locale';
import { isContentPath, localePath, stripLocalePrefix } from '@/lib/i18n/prefix';

export type ContentAlternates = {
  /** The absolute address of THIS locale's copy. */
  canonical: string;
  /**
   * The whole group, identical on every page in it -- which is what
   * reciprocity means, and the only form Google does not discard.
   */
  languages: { id: string; en: string; 'x-default': string };
};

export function contentAlternates(input: {
  origin: string;
  path: string;
  locale: Locale;
}): ContentAlternates {
  const { origin, path, locale } = input;

  if (stripLocalePrefix(path).locale !== null) {
    throw new Error(
      `contentAlternates received an already-prefixed path: ${path}. Pass the BARE path; ` +
        'the /en/ form is derived here.',
    );
  }
  if (!isContentPath(path)) {
    throw new Error(
      `contentAlternates received ${path}, which is not a content path. Only the routes in ` +
        'src/lib/i18n/prefix.ts may carry a canonical/hreflang group; D6 still holds for the app.',
    );
  }

  // A human types `NEXT_PUBLIC_SITE_ORIGIN` into a dashboard, so a trailing
  // slash is likely and would produce `https://host//gallery`.
  const base = origin.replace(/\/+$/, '');
  const url = (l: Locale) => `${base}${localePath(l, path)}`;

  const id = url('id');
  return {
    canonical: url(locale),
    languages: { id, en: url('en'), 'x-default': id },
  };
}

/**
 * The `<xhtml:link>` set for one sitemap entry (roadmap §7's S1/S2 seam).
 *
 * **S1 OWNS `src/app/sitemap.ts` AND WRITES ONE LINE PER ENTRY; S2 OWNS THIS
 * FUNCTION.** It delegates to `contentAlternates` rather than rebuilding the
 * URLs, so the sitemap's alternate set and the head's cannot drift -- Google
 * reads both and a disagreement is a broken group.
 */
export function sitemapLanguages(origin: string, path: string): ContentAlternates['languages'] {
  return contentAlternates({ origin, path, locale: 'id' }).languages;
}
```

**Step 4: Run the test again**

```sh
npm test -- alternates
npm run typecheck
```

Expected: PASS, 12 tests.

**Step 5: Commit**

```sh
git add src/lib/seo/alternates.ts src/lib/seo/alternates.test.ts
git commit -m "S2: one helper for canonical, reciprocal hreflang and x-default"
```

---

## 10. Task 7 — the switcher as a link

**Files:**
- Create: `src/components/ContentLocaleLink.tsx`
- Modify: `src/components/LocaleSwitch.module.css`
- Modify: `src/components/LocaleSwitch.tsx` (header only)

### 10.1 Why a separate component and not a `LocaleSwitch` variant

§6.5 expects "the link variant" in `LocaleSwitch.tsx`. This plan ships a separate,
**server-rendered** component instead, and it is in `## Flags`. Four reasons:

1. **`LocaleSwitch` is `'use client'` and its entire body is the POST state machine** — two
   deadlines, a retry, `intentRef`, `aliveRef`, `useTransition`, `router.refresh()`. A `links`
   variant would share the wrapper markup and nothing else, while shipping all of that
   JavaScript plus `track.client` (and therefore the analytics batcher) to pages whose whole
   purpose is TTFB and edge-cacheability.
2. **There is nothing to post.** On a content page the sibling URL *is* the other language. A
   session write would couple a CDN-cached public page to a database round trip — S-D10 — and
   §4.2 rules it out.
3. **`localeSwitch.test.ts` is a source-level test over that exact file**, with two
   `toHaveLength` assertions and an ordering assertion. Growing the file to serve an unrelated
   surface is how those start failing for reasons nobody can read.
4. **The path must come from the server.** See 10.2.

### 10.2 Two traps

**IT MUST BE A PLAIN `<a>`, NEVER `next/link`.** `next/link` does render a real `<a href>`, so
crawlability is not the issue. The issue is that a client-side navigation from `/gallery` to
`/en/gallery` resolves — after the rewrite — to the **same route under the same root layout**,
so Next does not re-render the root layout. `<html lang>` would keep its old value and
`LocaleProvider` would keep its old catalog: the page content would flip language and every
piece of chrome around it would not. A full document load is required, which is what a plain
`<a>` is. **No `next/link` may ever cross the `/en/` boundary**, and the `/en`-literal fence in
Task 5 is what stops one appearing.

**IT MUST TAKE `path` AS A PROP, NEVER READ `usePathname()`.** On `/en/gallery` the browser URL
is `/en/gallery` while the rendered route is `/gallery`, so `usePathname()` and the server
disagree — a wrong link *and* a hydration mismatch. The server page knows its own bare route;
that is the only correct source.

### 10.3 Zero new catalog keys

`locale.name.id` (`Indonesia`), `locale.name.en` (`English`) and `locale.switch.aria` already
exist and are identical in both catalogs. `LocaleSwitch`'s own header argues that full names
belong "where the control has to introduce itself" — a stranger meeting an unlabelled control
on a page in a language they may not read is precisely that case. So this component adds
**nothing** to `locales/{id,en}.ts` and costs S1 nothing (S-D6, §6.5's catalog row).

**Step 1: Add the anchor class to `src/components/LocaleSwitch.module.css`**

Append:

```css
/*
 * The `link` variant: an `<a href>` to the sibling URL, on a public content page
 * (v0.4.0 S2, §4.2). `ContentLocaleLink` is the component; `LocaleSwitch` never
 * renders an anchor.
 *
 * A SEPARATE CLASS RATHER THAN THREE LINES ADDED TO `.option`, so the button and
 * span variants keep the geometry that was MEASURED at 44px: `.option`'s comment
 * records that its `min-height` said 44 and measured 42 for a whole workstream,
 * and it is not worth re-deriving that against a font metric to save a selector.
 *
 * `display: inline-flex` because an anchor is inline and would ignore the
 * vertical padding, which is the whole 44px tap target. `text-decoration: none`
 * because an anchor is underlined and a button never was.
 */
.link {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}
```

**Step 2: Create `src/components/ContentLocaleLink.tsx`**

```tsx
import { Fragment } from 'react';

import { LOCALES } from '@/lib/i18n/locale';
import { localePath } from '@/lib/i18n/prefix';
import { localeSwitcherEnabled } from '@/lib/i18n/resolve';
import { getLocale, getT } from '@/lib/i18n/t';
import styles from './LocaleSwitch.module.css';

/**
 * The language control on a public content page. **A LINK, NOT A TOGGLE**
 * (v0.4.0 §4.2).
 *
 * ── WHY THIS IS NOT A `LocaleSwitch` VARIANT ────────────────────────────────
 *
 * `LocaleSwitch` POSTs `/api/locale`, which re-mints the session and writes the
 * cookie. On a content page there is usually no session, and the mechanism is
 * wrong regardless: **the sibling URL IS the other language.** A session write
 * would also couple a CDN-cached public page to a database round trip, which
 * S-D10 forbids. And `LocaleSwitch` is `'use client'` -- a variant would ship two
 * deadlines, a retry, a `useTransition` and the analytics batcher to the pages
 * whose TTFB a crawler measures.
 *
 * So: a server component, no JavaScript, and the markup and CSS of the `names`
 * variant.
 *
 * ── THE ACCEPTED COST, QUOTED FROM §4.2 SO NOBODY "FIXES" IT ────────────────
 *
 *   "The accepted cost, stated so nobody 'fixes' it: a signed-in user who
 *   switches to English while reading the blog and then opens the app is still in
 *   Indonesian there. Making the link also `POST /api/locale` would couple a
 *   CDN-cached public page to a session write -- S-D10 -- and the app carries its
 *   own switcher in the account menu. `LOCALE_SWITCHER` gates rendering the
 *   control, as it does everywhere; English stays reachable by URL with it off."
 *
 * The same asymmetry reaches a stranger: nothing a visitor chooses by URL on a
 * content page carries into `/login`, because no cookie is written. `/login`
 * negotiates from `Accept-Language` exactly as W6 built it.
 *
 * ── TWO THINGS THAT MUST NOT CHANGE ─────────────────────────────────────────
 *
 * **A PLAIN `<a>`, NEVER `next/link`.** A client-side navigation to `/en/gallery`
 * resolves -- after middleware's rewrite -- to the SAME route under the SAME root
 * layout, so Next does not re-render the layout: `<html lang>` and
 * `LocaleProvider`'s catalog would keep their old values and the page would come
 * out half-translated. A full document load is the mechanism, and a plain anchor
 * is what performs one.
 *
 * **`path` IS A PROP AND `usePathname()` IS NOT AN OPTION.** On `/en/gallery` the
 * browser URL is `/en/gallery` and the rendered route is `/gallery`, so a
 * client-side computation builds `/en/en/gallery` and disagrees with the server
 * about it. The server page knows its own bare route; that is the only correct
 * source. `localePath` throws on an already-prefixed argument, which is what
 * turns a mistake here into a loud one.
 *
 * ── NO NEW CATALOG KEY ──────────────────────────────────────────────────────
 *
 * `locale.name.*` and `locale.switch.aria` already exist and are written
 * identically in both catalogs. `LocaleSwitch`'s header argues full names belong
 * "where the control has to introduce itself"; a stranger on a page in a language
 * they may not read is exactly that person.
 *
 * `LOCALE_SWITCHER` gates RENDERING ONLY, as everywhere. With it off, `/en/…`
 * still serves and `hreflang` still names it to a crawler -- which is now the
 * whole point rather than a side effect.
 *
 * @param path the BARE content path this page renders: `/`, `/gallery`,
 *             `/arcana/the-moon`. Never a `/en/` form.
 */
export async function ContentLocaleLink({ path }: { path: string }) {
  if (!localeSwitcherEnabled()) return null;

  const [locale, t] = await Promise.all([getLocale(), getT()]);

  return (
    <div className={styles.row} role="group" aria-label={t('locale.switch.aria')}>
      {LOCALES.map((option, i) => (
        <Fragment key={option}>
          {i > 0 ? (
            <span className={styles.sep} aria-hidden="true">
              ·
            </span>
          ) : null}
          {option === locale ? (
            /*
             * A `<span>`, not a link to the page you are on. `aria-current` tells
             * a screen reader which is selected, and a self-link is a crawl
             * instruction to nowhere. Same reasoning as `LocaleSwitch`'s
             * non-button.
             */
            <span className={`${styles.option} ${styles.active}`} aria-current="true">
              {t(`locale.name.${option}`)}
            </span>
          ) : (
            <a
              className={`${styles.option} ${styles.link}`}
              href={localePath(option, path)}
              /* `rel`/`hrefLang` so the relationship is machine-readable in the
                 body as well as in the head. Never `nofollow`: a crawler
                 following this is the point. */
              rel="alternate"
              hrefLang={option}
            >
              {t(`locale.name.${option}`)}
            </a>
          )}
        </Fragment>
      ))}
    </div>
  );
}
```

**Step 3: Add the pointer to `src/components/LocaleSwitch.tsx`**

Insert into the existing header block, after the `── NOT THE DRAW SCREEN …` section:

```
 * ── AND NOT A PUBLIC CONTENT PAGE (v0.4.0 S2) ────────────────────────────────
 *
 * `/gallery`, `/arcana/<slug>`, `/blog`, `/blog/<slug>` and the signed-out `/`
 * carry `ContentLocaleLink` instead: a server-rendered `<a href>` to the sibling
 * URL. There is usually no session there, the sibling URL IS the other language,
 * and a POST from a CDN-cached page is what S-D10 forbids. Do not add a `links`
 * variant here -- this component is a state machine for a session write and that
 * page has nothing to write.
```

**Step 4: Verify nothing broke**

```sh
npm test -- localeSwitch
npm test -- contentLocale
npm run typecheck
```

Expected: `localeSwitch.test.ts` PASS, unchanged count. It reads this file's source and two of
its assertions are exact `toHaveLength` counts, so if the header text you inserted contains
`SWITCH_RETRY_DEADLINE_MS` or `track('locale.changed'` **it will fail** — the `code()` helper
strips comments for that describe, but do not rely on it: keep those strings out of the comment.

**Step 5: Commit**

```sh
git add src/components/ContentLocaleLink.tsx src/components/LocaleSwitch.module.css src/components/LocaleSwitch.tsx
git commit -m "S2: the content-page language control is a server-rendered link"
```

---

## 11. Task 8 — the documentation amendments

**Files:**
- Modify: `CLAUDE.md` (`## Localization (W6)` opening, and the `LOCALE_SWITCHER` block)
- Modify: `.env.example` (the `LOCALE_SWITCHER` comment)
- Modify: `docs/workstream-notes.md` (a new section)

These are not optional, and the first one is the most important line in this task.
`CLAUDE.md` currently says, in a section a future session is told to read twice:

> Locale is **never a URL segment** (D6): nine routes stay nine, no link is locale-aware, and
> anything reaching for `router.push('/en/...')` is wrong.

Left alone, the next session reads that, finds `contentRewrite` in middleware, and deletes it.

**Step 1: Amend `CLAUDE.md`'s `## Localization (W6)` opening**

Replace that sentence with:

```
Two locales, `id` and `en`, **interface and readings**. `id` is the default and the
source language.

**Locale is never a URL segment FOR THE NINE APP ROUTES (D6) — and IS one for public
content (v0.4.0 S-D1).** This line used to end at "never a URL segment", full stop, and
the exception is an amendment rather than an oversight: two languages cannot occupy one
address in a search index, so `/gallery` is Indonesian and `/en/gallery` is English.
**The breach is fenced to five routes** — `/`, `/gallery`, `/arcana/[slug]`, `/blog`,
`/blog/[slug]` — by `isContentPath()` in `src/lib/i18n/prefix.ts`, and
`src/middleware.ts` honours a prefix only for those. `/en/history` is not a route: it
reaches `decide()` spelled exactly as the request spelled it and matches nothing. **A
stripping bug that made the gated app reachable under `/en/` is the worst outcome
available in that release and would look like a working feature.**

Inside the app, `router.push('/en/...')` is still wrong, no `<Link>` is locale-aware, and
the nine routes still stay nine. See `## Locale-addressable public content (S2)`.
```

**Step 2: Amend the `LOCALE_SWITCHER` block in `CLAUDE.md` and `.env.example`**

Append to the existing comment (do not remove a word of it):

```
                            # v0.4.0: THE SCOPE GREW AND THE VARIABLE DID NOT. It still
                            # decides only whether the CONTROL renders. On a public
                            # content route English lives at `/en/…` regardless, and the
                            # `hreflang` set NAMES that URL to a crawler whatever the UI
                            # offers -- so `LOCALE_SWITCHER=0` no longer hides English
                            # from anybody except a person looking for a button. That is
                            # the intended reading of "RENDERING ONLY", now load-bearing.
```

**Step 3: Add the workstream-notes section**

Append to `docs/workstream-notes.md`:

```markdown
## Locale-addressable public content (S2), v0.4.0

`/gallery` is Indonesian and `/en/gallery` is English, by a middleware rewrite, for five
routes and no others. The rules and the invariants are in CLAUDE.md's `## Localization`;
this is the evidence.

### The contract

`src/lib/i18n/prefix.ts` is a pure edge-safe leaf holding both the prefix maths and the
content route table, because you cannot decide whether to honour `/en/x` without knowing
whether `/x` is content. `src/middleware.ts` calls `contentRewrite(pathname, signedIn)`
once and gets one of four answers: `passthrough` (D6 unchanged), `bare` (pin `id`),
`rewrite` (pin `en`, rewrite to the bare route), `redirect` (301 to the canonical
address).

### Contract G1: the gate sees the STRIPPED path

Resolved rather than left open (roadmap §6.1 asked for a decision). `decide()` never
receives `/en/gallery`; `isPublic()` and S-D5's `/` clause are written against bare paths.
The argument that settled it: `/en` rewrites to `/`, so S-D5's `pathname === '/'` clause
fires for the English landing **and** the signed-in-but-not-onboarded arm still redirects
to `/onboarding`. Under the other ordering that clause has to read
`'/' || '/en' || '/en/'` and the onboarding arm is missed by everybody, because nobody
tests `/en` while signed in and half-onboarded.

`isPublic()`'s content clause still strips first (contract G2), so `/en/history` is proved
non-public even though nothing can reach `decide()` with that spelling any more.

### `isContentPath` and `isPublicContentPath` differ by exactly one path

`/`. `isPublic()` short-circuits `decide()` **before** the onboarding check, so `'/'` in
that allowlist would land a signed-in half-onboarded querent on a reader picker that
assumes a completed profile — the change S-D5 forbids in capitals, arriving through a
predicate instead of through a diff. A test asserts the symmetric difference is `['/']`.

### `/` is the one path where the session is read, and it cannot be CDN-cached

S-D5 makes `/` dual-render. Pinning `id` there unconditionally hands a signed-in English
querent an Indonesian reader picker — D6 broken on the busiest screen in the app, by the
workstream that promised not to touch it. So on `/` with a session, `contentRewrite`
answers `passthrough` and the D6 chain and the cookie write behave exactly as before.

The consequence is that `/` varies by session and **S-D10's cache header must not be
applied to it**. That is true for S-D5's reasons before it is true for S2's. Every other
content route is session-invariant, and a negative-control test asserts `contentRewrite`
gives the identical answer for both values of `signedIn` on every path but `/`.

### `?lang=` is inert on a content route, by construction

`contentRewrite` takes a pathname and a boolean. There is no `NextRequest`, no
`searchParams` and no header, so the dev override cannot reach it — in development or in
production. §4.3 asked for "the prefix wins"; a function that cannot see the query cannot
be overridden by it. The override is untouched for the nine app routes.

### `/id/…` 301s rather than 404s, and both locales normalise the same way

Indonesian has one address and it is the bare one. `stripLocalePrefix` still recognises
the `/id/` segment, and that is the whole reason: a path people will guess **because**
`/en/` exists gets a 301 to the address that exists, keeping whatever inbound link it
arrived with, instead of a 404. `/en/gallery/` and `/gallery/` both 301 to the
slash-less form, so the two locales behave identically rather than one relying on Next's
own `trailingSlash: false` 308. A test iterates every redirect to a fixed point and
asserts it settles in at most two steps.

### The traps

- **`NextResponse.rewrite(url)` without `{ request: { headers } }` is silent.** The right
  route renders with no `x-jmt-locale`, so `getLocale()` falls through to the
  `jmt_locale` cookie: `/en/gallery` is English for whoever has an `en` cookie and
  Indonesian for the next stranger, under a canonical that claims English. **No unit test
  in this project can see it.** The check is `curl` against `/gallery` carrying
  `Cookie: jmt_locale=en` and reading `<html lang>`. `middleware.ts` had carried this
  warning for `NextResponse.next()` since W6; it is the same trap one function later.
- **`next/link` must never cross the `/en/` boundary.** A client-side navigation from
  `/gallery` to `/en/gallery` resolves — after the rewrite — to the same route under the
  same root layout, so Next does not re-render the layout: `<html lang>` and
  `LocaleProvider`'s catalog keep their old values and the page comes out
  half-translated. `ContentLocaleLink` is a plain `<a>` for that reason and not for
  crawlability (`next/link` renders a real anchor).
- **`usePathname()` returns the PRE-rewrite path.** On `/en/gallery` it is `/en/gallery`
  while the rendered route is `/gallery`, so a client-side sibling computation builds
  `/en/en/gallery` and disagrees with the server about it. `ContentLocaleLink` takes the
  bare path as a prop, and `localePath` throws on an already-prefixed argument. A contract
  test forbids any `'use client'` file from importing `@/lib/i18n/prefix`.
- **Do NOT copy `/s/[slug]`'s nested `LocaleProvider`.** There, the page's language differs
  from the *request's* resolved locale, so a second catalog is the only way. Here the
  request's resolved locale IS the page's language — middleware pinned it — so the root
  layout's single provider is already correct and a nested one would ship two catalogs and
  break I9's whole argument for +3.3KB gzipped on the pages a stranger opens on mobile
  data.
- **A relative `hreflang` is discarded by Google, and so is a non-reciprocal group** —
  the whole group, not the broken edge, with nothing reporting it. `contentAlternates`
  therefore builds absolute URLs from an `origin` parameter rather than leaning on
  `metadataBase`, and its test walks the graph: every URL a page names must name that page
  back.
- **A stranger's URL choice does not cross the sign-in boundary.** No content response
  writes `jmt_locale` (S-D10), so a visitor who read `/en/blog` and then clicked into
  `/login` gets whatever `Accept-Language` negotiates. Same asymmetry §4.2 states for the
  signed-in direction, and accepted for the same reason.
```

**Step 4: Commit**

```sh
git add CLAUDE.md .env.example docs/workstream-notes.md
git commit -m "S2: amend the D6 rule rather than let the next session delete the rewrite"
```

---

## 12. Task 9 — the live checks that do not need S1

**Files:** none. This task runs commands and records their output in the commit message of
Task 8 or in a follow-up note.

Two of the checks in `## 13` cannot run until S1 has landed `isPublic()`'s content clause and
S3 has built `/gallery`. These four can run now, and one of them is a regression check on
behaviour that already works.

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run db:up          # `npm run dev` needs Postgres
npm run dev            # http://localhost:3001
```

**Check 1 — `/en` reaches the gate as `/`, not as `/en`.** Before this branch, `/en` was a
404 (no route). Now:

```sh
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:3001/en
```

Expected: `307 -> http://localhost:3001/login?callbackUrl=%2Fen`. The 307 is
`NextResponse.redirect`'s default for the *gate's* redirect (unchanged W6 behaviour), and the
`callbackUrl` proves the rewrite happened and the gate saw `/`. Once S1 lands S-D5's clause
this becomes `200`.

**Check 2 — `/id/x` 301s and `/en/history` does not become a route.**

```sh
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:3001/id/gallery
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:3001/en/gallery/
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:3001/en/history
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:3001/en/account
```

Expected: `301 -> …/gallery`; `301 -> …/en/gallery`; and for the last two,
`307 -> …/login?callbackUrl=%2Fen%2Fhistory` and `…%2Fen%2Faccount` — **the callbackUrl proves
the path was never stripped.**

**Check 3 — no `Set-Cookie` on a content response.** `/gallery` does not exist yet, so use the
one content path that does — the signed-out `/`:

```sh
curl -si http://localhost:3001/ | grep -iE 'set-cookie|^HTTP'
```

Expected: one `HTTP/1.1 307` line and **no `set-cookie` naming `jmt_locale`**. Before this
branch that response carried `set-cookie: jmt_locale=id; …`. This is the S-D10 guard firing.

**Check 4 — the D6 regression check, and the one that matters most today.** A signed-in
English querent's reader picker must still be English.

```sh
# Mint a real session against a real users row (dev only; see CLAUDE.md's
# "Verifying the gate without Google").
curl -s -c /tmp/s2.jar -X POST http://localhost:3001/api/auth/dev-session \
  -H 'content-type: application/json' -d '{"user":"miftah"}'
curl -s -b /tmp/s2.jar -X POST http://localhost:3001/api/locale \
  -H 'content-type: application/json' -d '{"locale":"en"}'
curl -s -b /tmp/s2.jar http://localhost:3001/ | grep -o '<html lang="[a-z]*"'
```

Expected: `<html lang="en"`. **If this prints `id`, the `/` arm of `contentRewrite` is wrong
and you have broken D6 on the busiest screen in the app.** Then confirm the other half:

```sh
curl -s http://localhost:3001/ | grep -o '<html lang="[a-z]*"'                      # no session
curl -s -H 'accept-language: en-GB,en;q=0.9' http://localhost:3001/ | grep -o '<html lang="[a-z]*"'
curl -s -b 'jmt_locale=en' http://localhost:3001/ | grep -o '<html lang="[a-z]*"'
```

All three expected: `<html lang="id"`. The second and third are §4.1 — the URL is the only
input — and the third is the **`request: { headers }` negative control** described in `## 0`.

**Commit** (no files changed; record the results):

```sh
git commit --allow-empty -m "S2: live checks -- /en reaches the gate as /, /id 301s, no cookie on /, D6 intact for a signed-in en user"
```

---

## 13. Verification — which loop answers which question

CLAUDE.md's ladder, applied. Roadmap §11.1 assigns most of this release to loop 1 and this
workstream is no exception: every decision here is pure.

| Question | Loop | Command |
|---|---|---|
| Does the prefix parse, build and refuse correctly? | **1 (Vitest)** | `npm test -- prefix` |
| Is a gated path reachable under `/en/`? | **1** | `npm test -- prefix` (the 15-path negative-control block) |
| Does `isPublic()`'s predicate include `/`? | **1** | `npm test -- prefix` (symmetric difference `['/']`) |
| Can a redirect loop? | **1** | `npm test -- prefix` (fixed-point iteration) |
| Is the `hreflang` group reciprocal and closed? | **1** | `npm test -- alternates` |
| Does it satisfy Next's own metadata types? | **1** | `npm test -- alternates` + `npm run build` |
| Is the rewrite the `request:` form, in the right order, with the cookie guarded? | **1 (source-level)** | `npm test -- contentLocale` |
| Does anybody hand-write `/en/`? | **1 (source-level)** | `npm test -- contentLocale` |
| Did W6, V4 or V7 regress? | **1** | `npm test` — 1197 + the new cases, `localeSwitch.test.ts` and `resolve.test.ts` untouched |
| Does it compile and does the secrets tripwire still pass? | — | `npm run build` (**not optional** — the TypeScript trap) |
| **Does `/gallery` come out Indonesian for a visitor whose cookie says `en`?** | **`curl -i`, no cookie jar** | `## 12` check 4 and `## 13.1` |
| Are both twins 200, in different languages, with no `Set-Cookie` and a reciprocal alternate set? | **`curl -i`** | `## 13.1` |
| Is a signed-in English querent's picker still English? | **`curl` + dev-session**, then **loop 5** | `## 12` check 4; `tools/e2e/run.sh` with the persistent Google session |
| Does the language link actually navigate and come back in the other language? | **loop 5 (CDP)** | `## 13.2` |
| Does the control fit a phone? | **loop 4**, and it is S1's shell | see `## 13.3` |
| Anything needing a real iPhone? | **none** | see `## 13.3` |

Run `npm test` and `npm run test:integration` **separately**. `npm run test:all` fails 12–22 of
V9's limiter tests as a harness race and its red means nothing. This workstream adds **no**
integration test — S-D14 means no query changes, and roadmap §11.1 says an integration test
here would be a flag.

### 13.1 The signed-out crawl — the acceptance test (owed to the reconciliation)

Roadmap §11.2. **It cannot run until S1 lands `isPublic()`/`decide()` and S3 lands `/gallery`.**
Run it against `npm run dev` first and then against a Vercel preview.

```sh
BASE=http://localhost:3001

# 1. Every content address is 200, carries no Set-Cookie, and never mentions /login.
for p in / /en /gallery /en/gallery /arcana/the-moon /en/arcana/the-moon /blog /en/blog; do
  printf '%s  ' "$p"
  curl -sSi "$BASE$p" | awk 'NR==1{print $2} /^[Ss]et-[Cc]ookie/{print "  SET-COOKIE: " $0}'
done
# A 302/307 anywhere in that list is the release failing at its only purpose.
# A single set-cookie line is S-D10 broken.

# 2. The two twins are in DIFFERENT languages, and the language came from the URL.
curl -s "$BASE/gallery"    | grep -o '<html lang="[a-z]*"'   # id
curl -s "$BASE/en/gallery" | grep -o '<html lang="[a-z]*"'   # en

# 3. THE NEGATIVE CONTROL FOR THE `request: { headers }` FORM. Both must stay id.
curl -s -b 'jmt_locale=en' "$BASE/gallery" | grep -o '<html lang="[a-z]*"'
curl -s -H 'accept-language: en-GB,en;q=0.9' "$BASE/gallery" | grep -o '<html lang="[a-z]*"'
# And with the prefix, both must stay en.
curl -s -b 'jmt_locale=id' "$BASE/en/gallery" | grep -o '<html lang="[a-z]*"'

# 4. RECIPROCITY ON THE WIRE. The three alternate links must be BYTE-IDENTICAL
#    between the two twins, and only the canonical may differ.
for p in /gallery /en/gallery; do
  echo "--- $p"
  curl -s "$BASE$p" | grep -oE '<link rel="(canonical|alternate)"[^>]*>' | sort
done
# Expected on BOTH: hreflang="id" -> …/gallery, hreflang="en" -> …/en/gallery,
# hreflang="x-default" -> …/gallery. Canonical: …/gallery and …/en/gallery.
# Every href ABSOLUTE. A relative one is discarded by Google, silently.

# 5. The non-canonical addresses.
for p in /id/gallery /gallery/ /en/gallery/ /en/; do
  printf '%s  ' "$p"; curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' "$BASE$p"
done   # 301 each, to /gallery, /gallery, /en/gallery, /en

# 6. THE APP IS STILL THE APP.
for p in /en/history /en/account /en/onboarding /en/thessaly /en/api/events; do
  printf '%s  ' "$p"; curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' "$BASE$p"
done   # a login redirect or a 404. NEVER a 200 with app content.

# 7. /s/ is still noindex (S-D12), and nothing S2 did widened a header rule.
curl -sI "$BASE/s/abcdefghjkmn" | grep -i x-robots-tag   # noindex, nofollow, noarchive
```

### 13.2 Loop 5 — the two questions curl cannot answer

`tools/e2e/run.sh`; see `.claude/skills/` and `/test-prod-using-headless-chrome`.

```sh
tools/e2e/setup.sh
E2E_BASE=http://localhost:3001 tools/e2e/run.sh goto /en/gallery
E2E_BASE=http://localhost:3001 tools/e2e/run.sh tap 'a[hreflang="id"]'
E2E_BASE=http://localhost:3001 tools/e2e/run.sh eval 'location.pathname + " " + document.documentElement.lang'
```

Expected: `/gallery id`. **This is the check for the `next/link` trap** — if somebody replaces
the anchor with a `next/link`, `location.pathname` becomes `/gallery` and
`document.documentElement.lang` stays `en`, and the page is visibly half-translated with
nothing failing anywhere else.

Then, with the harness's persistent Google session:

```sh
tools/e2e/run.sh whoami          # prints the cookie's LENGTH, never its value
tools/e2e/run.sh goto /
tools/e2e/run.sh eval 'document.documentElement.lang'
```

Expected: whatever that account's `users.locale` says — **not** an unconditional `id`. This is
the D6 regression check against a real session rather than a dev-minted one.

**Not for width.** Both Chromes available here floor the viewport at ~500px; a screenshot that
looks like a phone is not one.

### 13.3 What is deliberately not verified here

**Loop 4 (fixed-width container + `getBoundingClientRect`)** is not needed for
`ContentLocaleLink`: it renders the markup and CSS of `LocaleSwitch`'s `names` variant, which
already ships in `/login`'s footer and has been measured at 320/360/375/390. The `.link` class
adds `display: inline-flex`, `align-items: center` and `text-decoration: none` and touches
nothing the button variant uses — which is why it is a separate class and not three lines
added to `.option`, whose `min-height: 44px` was measured the hard way. **The public shell that
contains this control is S1's, and the grid on `/gallery` is S3's; loop 4 belongs to both of
them** (roadmap §8.1, §11.1.3).

**Loop 6 (a real iPhone)** is not needed. There is no `100dvh`, no safe-area inset, no touch
target change and — crucially — **nothing on the cold path**: this workstream adds no database
read, no database write and no model call, so the class of bug that made
`POST /api/locale` unreproducible in WSL cannot arise here.

---

## Schema deltas

**None.** S-D14, and this workstream needs nothing from the database. No table, no column, no
migration. Nothing under `src/lib/db/**` is read or written by any code in this plan, and no
content page reaches a query — so §10's "a public page must not be able to 500 on a database
outage" holds by construction rather than by care.

## Analytics deltas

**None, and that is a decision rather than an omission.**

`locale.changed` means *the querent's stored preference changed* — it is fired by
`LocaleSwitch` after `POST /api/locale` succeeded, exactly once per successful switch, and
`localeSwitch.test.ts` asserts the "exactly once, from one place" property. Following
`ContentLocaleLink` changes **no** preference: no cookie, no session claim, no row. Firing
`locale.changed` there would make the event mean two different things and would corrupt the
one measurement it exists to provide.

Two smaller reasons for declaring nothing:

- **A plain `<a>` cannot fire a client event without becoming a client component.** Making it
  one to record a link click would ship the analytics batcher to every content page — the
  bytes S-D10 is trying not to spend — to learn something the destination's own page-view
  event already knows.
- **`events.ts` has one owner in v0.4.0 and it is S1** (S-D13). Declaring nothing is the
  cheapest possible seam.

What I do ask for instead is one prop on somebody else's event: see `## Deltas requested` D5.
It carries a two-value closed set and no free text (S-D13's inherited constraint).

**One observation for whoever owns the privacy copy, recorded because v0.4.0 changes its
scale rather than its truth:** the root layout mounts `AppLaunched`, so `track.client` runs on
public content pages exactly as it already does on `/s/`. That is pre-existing and correct
(`/api/events` is public precisely so pre-session events can be recorded, with a null
`user_id`), but v0.4.0 takes the public surface from one route to forty-odd. No cookie is
involved — S-D10 holds — and `sanitizeProps()` still strips everything identifying. It is a
sentence in `/privacy` §4.4 that somebody should re-read, not a defect.

## Deltas requested

Each names the file, its §6 owner, and the exact change. Where the change is code, the code is
given so the owner does not have to infer it.

**D1 — `src/lib/auth/gate.ts` (S1).** `isPublic()`'s new content clause, and only that clause,
strips the prefix. The existing clauses must keep matching the **raw** path or `/en/api/events`
becomes public.

```ts
import { isPublicContentPath, stripLocalePrefix } from '@/lib/i18n/prefix';

// …inside isPublic(), as one more clause:
    /*
     * v0.4.0 S-D1/S2. The five public content routes, as a predicate rather than
     * as a widened prefix — `startsWith('/blog')` also matches `/blogroll`, which
     * is the exact class of mistake this function is a function to avoid.
     *
     * **IT STRIPS FIRST (contract G2).** Middleware already resolved the prefix
     * and `decide()` is handed the bare path, so `/en/gallery` is unreachable
     * here — but if a future edit ever made stripping unconditional, this is the
     * second fence, and `/en/history` must still answer false. It does:
     * `isPublicContentPath('/history')` is false.
     *
     * **`isPublicContentPath` AND NOT `isContentPath`.** They differ by exactly
     * one path, `/`, and S-D5 forbids `'/'` here in capitals: this function
     * short-circuits `decide()` before the onboarding check, so `/` in the
     * allowlist lands a signed-in half-onboarded querent on a picker that
     * assumes a completed profile. `/` is handled by the clause in `decide()`.
     */
    isPublicContentPath(stripLocalePrefix(pathname).path) ||
```

`gate.test.ts` gains, per §6.1, a positive case for each of `/gallery`, `/arcana`,
`/arcana/the-moon`, `/blog`, `/blog/how-to-read-tarot` **and both spellings**
(`/en/gallery` → public, since the clause strips), plus these negative controls:
`/gallerywhatever`, `/galleries`, `/blogroll`, `/arcanas`, `/arcana/the-moon/extra`,
`/blog/a/b`, **`/en/history`, `/en/account`, `/en/onboarding`, `/en/api/events`,
`/en/login`**, and — the one that is easy to forget — **`isPublic('/')` must be `false`.**

**D2 — `src/lib/auth/gate.ts` (S1), the `decide()` clause.** S-D5's clause goes **after** the
`!onboarded` arm and matches the bare `'/'` only. Under contract G1 that is all it needs:
middleware rewrites `/en` to `/` before `decide()` runs, so the English landing is covered by
the same line, and a signed-in-but-not-onboarded visitor to `/en` still gets
`redirect('/onboarding')`. Do **not** write `pathname === '/' || pathname === '/en'` — the
second is unreachable and would read as if the ordering were the other way round.

**D3 — `src/app/sitemap.ts` (S1), the locale expansion.** This is the seam the roadmap names as
most likely to conflict, so here is the line-by-line split.

*S1 writes:* the file, the `import { sitemapLanguages } from '@/lib/seo/alternates'`, the
origin (`siteOrigin()`), the array of bare paths — `/`, `/gallery`, `/blog`, one per blog slug
(S6's registry), one per card slug (S4's `cardUrlSlug`) — and each entry's `url`,
`lastModified`, `changeFrequency` and `priority`.

*S2 owns:* `sitemapLanguages(origin, path)` and its test.

The exact shape, so there is nothing to negotiate:

```ts
// S1's file. The ONLY S2-owned line is the `alternates` one.
return PATHS.map((path) => ({
  url: `${origin}${path === '/' ? '/' : path}`,   // the `id` URL; it is the canonical one
  lastModified: LAST_MODIFIED,
  changeFrequency: 'monthly' as const,
  priority: path === '/' ? 1 : 0.7,
  alternates: { languages: sitemapLanguages(origin, path) },   // <- S2
}));
```

**One entry per artifact, not two.** The `/en/` URL is named inside that entry's
`<xhtml:link>` set, which is how Google wants an alternate group expressed in a sitemap;
listing `/en/gallery` again as its own `<url>` entry would be a second, competing declaration
of the same group. If S1 prefers two entries, both must carry the **full** language set
including `x-default` — `sitemapLanguages` returns exactly that, so it costs nothing either
way, but pick one and say so in the reconciliation.

**D4 — `next.config.ts` (S1), the cache headers.** Two things, and the first is a real
constraint rather than a preference:

1. **`/` must NOT get an `s-maxage`.** S-D5 makes it dual-render, so it varies by session — and
   `contentRewrite` therefore falls back to the D6 chain and the cookie write for a signed-in
   visitor on `/`. Caching it at the edge would serve one visitor's page to another. `/gallery`,
   `/arcana/:path*`, `/blog` and `/blog/:path*` are session-invariant and cacheable; the `/en/`
   twins share their headers because a `source: '/en/gallery'` entry would have to be written
   twice for every route.
2. **Verify on the wire that the header survives.** These routes are `ƒ` (the root layout
   awaits `getLocale()`, and `## Localization` rule 5 forbids "fixing" that), and Next sets its
   own `cache-control` on a dynamic response. A `headers()` entry may or may not win. `curl -sI`
   the built app, do not trust the config — S-D10's whole TTFB argument rests on that header
   actually being on the response.

**D5 — the content page-view events (S1, per S-D13).** Whatever event S3/S4/S6 fire for a
content page view should carry `locale: 'id' | 'en'`, taken from `await getLocale()`. Two
values, a closed set, no free text. Without it there is no way to answer "does anybody read
the English tree", which is the question that decides whether the English half is worth
maintaining — and S2 deliberately declares no event of its own (`## Analytics deltas`).

**D6 — every content page's `generateMetadata` (S1, S3, S4, S6).** The one call:

```ts
import { getLocale } from '@/lib/i18n/t';
import { contentAlternates } from '@/lib/seo/alternates';
import { siteOrigin } from '@/lib/seo/origin';   // S1's leaf

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: …,
    description: …,
    alternates: contentAlternates({ origin: siteOrigin(), path: '/gallery', locale }),
  };
}
```

Three rules: `path` is the **bare** path and never a `/en/` form (the helper throws, and a
contract test forbids the literal); `locale` comes from `await getLocale()` and never from a
`user.locale` (the W6 trap — they agree for a real user and diverge exactly when a test is
watching); and no page hand-writes `alternates` (S-D15). If S1 wants a single
`contentPageMetadata()` in its public shell that wraps this, that is welcome — the contract
S3/S4/S6 code against is `contentAlternates`.

**D7 — mounting the language control (S1's shell, or each page).** `<ContentLocaleLink path="/gallery" />`,
with the same bare path passed to `contentAlternates`. Best in S1's shared public shell so the
path is named once per page; if the shell cannot know it, each page passes it. It renders
nothing when `LOCALE_SWITCHER=0`, and English stays reachable regardless.

**D8 — do not copy `/s/[slug]`'s nested `LocaleProvider` (S1, S3, S4, S6).** On a content page
the request's resolved locale **is** the page's language, because middleware pinned it from the
URL, so the root layout's single provider is already correct. A nested one would ship two
catalogs and break I9's argument for no benefit. `/s/` needs one because there the page's
language and the request's differ; that is not this situation, and the two look identical from
a distance.

**D9 — the reconciliation.** Fold `## 2`'s contracts G1 and G2 into
`docs/plans/2026-07-28-RECONCILIATION-v0.4.0.md` §"gate ordering", and confirm or overturn the
three items in `## Flags` marked **needs a ruling**.

## Flags

Raised rather than decided, per roadmap §2. The first four are deviations from the roadmap; the
rest are accepted costs recorded so nobody rediscovers them as bugs.

1. **The prefix helpers are in a new leaf, `src/lib/i18n/prefix.ts`, not in `resolve.ts` as
   §6.5 says.** Four reasons in `## 3`; the binding one is that `gate.ts` must import them
   (contract G2) and its header forbids the `next/server` type that `resolve.ts` carries.
   `resolve.ts` gets a pointer comment and no re-export. **Reconciliation should confirm.**

2. **The content-page switcher is a new server component, `ContentLocaleLink`, not a variant of
   `LocaleSwitch` as §6.5 says.** `LocaleSwitch` is `'use client'` and its whole body is the
   POST state machine; a variant would ship two deadlines, a retry and the analytics batcher to
   the pages whose TTFB a crawler measures, to render two anchors. `localeSwitch.test.ts` is
   green and `LocaleSwitch.tsx` gains only a header pointer. **Reconciliation should confirm.**

3. **`/` reads the session, so §4.1's "the URL wins and is the only input" has exactly one
   carve-out. NEEDS A RULING.** S-D5 makes `/` dual-render, and pinning `id` there
   unconditionally would give a signed-in English querent an Indonesian reader picker. So `/`
   with a session takes the D6 path (chain + cookie) and `/` without one is pinned `id`.
   Consequences: **`/` cannot be CDN-cached** (true for S-D5's reasons before S2's — D4), and
   `/en` renders the picker in English for one request for a signed-in visitor without
   persisting anything. The alternative — pin `id` on `/` for everybody — breaks D6 visibly;
   the other alternative — never pin `/`, and let the landing page follow `Accept-Language` — is
   what §4.1 forbids. I do not think there is a fourth option, but this is the one place the
   roadmap and S-D5 pull against each other and Miftah should see it.

4. **`/id/…` 301s to the bare path rather than 404ing.** `/id/` is a path people will guess
   *because* `/en/` exists, and a 301 keeps whatever inbound link it arrived with while a 404
   discards it. It is fenced: the redirect fires only when the remainder is a public content
   path, so `/id/history` and `/id/s/<slug>` pass through to the gate and no second address for
   a share link is created. **Reconciliation should confirm** — the alternative (404) is
   defensible and simpler, and I chose the one that loses nothing.

5. **`?lang=` is inert on content routes in development too.** §4.3 asked only that the prefix
   win on a prefixed path; this goes further and makes the override unreachable on any content
   path, in any `NODE_ENV`, by not handing `contentRewrite` a query string at all. A
   development-only divergence in the one mechanism whose point is URL-determinism is the hour
   §4.3 is trying to save. The override is untouched for the nine app routes. `/en/gallery` is
   how you see the English gallery locally, and it is shorter to type.

6. **`/en/` 301s to `/en`, though §3.1 spells the route with a trailing slash.** One page, one
   address; §11.2's `curl -L` loop passes and the sitemap and canonical name only `/en`. Both
   locales are normalised by the same 301 rather than one of them relying on Next's own
   `trailingSlash: false` 308.

7. **A stranger's language choice does not survive the crossing into the app, in either
   direction.** §4.2 states the signed-in half verbatim (quoted in `ContentLocaleLink`'s
   header). The signed-out half is new and follows from S-D10: no content response writes
   `jmt_locale`, so a visitor who read `/en/blog` and then clicked into `/login` gets whatever
   `Accept-Language` negotiates — and a visitor with `en-GB` who lands on `/` gets an
   **Indonesian landing page and an English login page.** Both are direct consequences of
   settled decisions (§4.1 pins the bare path; S-D10 forbids the cookie), and neither is
   fixable without breaking one of them. Recorded so it is read as a decision. If it is judged
   unacceptable, the cheapest honest fix is S1's landing CTA linking `/login` and W6 doing what
   it already does — not a cookie on a cached page.

8. **`/en/history` gets a login redirect for a stranger and a 404 for a signed-in user.**
   Deliberate: nothing links it, it is in no sitemap and in no `hreflang` set, and §6.1's own
   requirement is that it must not be public. The roadmap's warning about "a 302 to `/login` on
   an indexable page" is about content routes, and no content route can produce one.

9. **`next/link` must never cross the `/en/` boundary, and nothing enforces that except the
   `/en`-literal fence.** A client-side navigation resolves to the same route under the same
   root layout, so Next does not re-render the layout and the page comes out half-translated
   (`<html lang>` and the catalog stale). Loop 5's two-line check in `## 13.2` is the
   behavioural half. If a future release wants prefixed links inside the app, this is the fact
   that has to be solved first.

10. **The acceptance test is owed to the reconciliation.** `## 13.1` cannot run until S1 lands
    `isPublic()`/`decide()` and S3 lands `/gallery`; `## 12` is what is verifiable today, and
    check 4 there (a signed-in English user's `<html lang>`) is the highest-value one, because
    it is the only regression this workstream can cause to something that already works.

11. **S-D10's cache header needs verifying on the wire, not in the config.** Content routes are
    `ƒ` by design and Next sets its own `cache-control` on a dynamic response, which may or may
    not beat a `next.config.ts` entry. S-D10's entire TTFB argument depends on the header being
    on the response. S1 owns the file; somebody has to `curl -sI` the built app. Named here
    because S2's contribution to that argument — no `Set-Cookie` — is worthless on its own.

12. **`track.client` runs on public content pages** (pre-existing on `/s/`; see
    `## Analytics deltas`). No cookie, no `user_id`, `sanitizeProps()` unchanged — but v0.4.0
    takes that surface from one route to forty-odd, and `/privacy` §4.4 is worth a re-read by
    whoever owns it. Not a defect and not S2's to fix.
