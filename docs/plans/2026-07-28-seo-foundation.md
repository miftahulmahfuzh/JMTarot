# S1 — Public Surface and Technical SEO Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn a three-page addressable site — one of which is a login form — into a
crawlable public surface: a signed-out homepage a stranger can read, one leaf that
owns the site's origin, a sitemap, canonicals, JSON-LD, cache headers, a shared
public footer, and a gate change that opens exactly five paths and provably does not
open `/history`.

**Architecture:** `src/lib/seo/origin.ts` is a new leaf (env only, no imports) that
`sitemap.ts`, `robots.ts`, `layout.tsx`'s `metadataBase` and — by delegation —
`shareOrigin()` all read, so the origin is decided in one place. `src/lib/seo/jsonld.ts`
is a second leaf of pure builders that `src/components/JsonLd.tsx` serialises into one
`<script type="application/ld+json">`. `src/lib/auth/gate.ts` gains four `isPublic()`
clauses and one explicit `decide()` clause for `/`; `src/app/page.tsx` becomes a
two-arm dispatcher over `currentUser()` — `./Landing` signed out, today's picker
signed in — and `src/components/PublicShell.tsx` wraps every public content page in
the footer Jodith asked for.

**Tech Stack:** Next 16 App Router, React 19, TypeScript 5.9, Vitest 4. **No new
dependency.** No MDX, no schema library, no image CDN, no `next-sitemap`. Verification
is the six loops in `CLAUDE.md` `## How to verify things here`, with `curl -i` and no
cookie jar as the primary instrument.

---

## 0. Contract and precedence

`PUBLIC_RELEASE_ROADMAP_v0.4.0.md` outranks this file. Where this plan disagrees with
it, **this plan is wrong** — except where a disagreement is recorded in `## Flags`,
which the reconciliation pass will rule on.

Everything in `PUBLIC_RELEASE_ROADMAP.md` (v0.2.0) and
`docs/plans/2026-07-27-RECONCILIATION-v0.3.0.md` still binds, except D6 and only for
the routes in v0.4.0 §3.

**S1 lands first and alone (§12), and it must not deploy alone.** The landing page
links to `/gallery`, `/arcana/the-moon` and `/blog`, which S3, S4 and S6 own. Merging
S1 to `main` is fine; **pushing a deployment that serves a homepage linking to three
404s is not.** The release ships as one.

### What S1 owns, exhaustively

| File | Change |
|---|---|
| `src/lib/seo/origin.ts` | **Create.** The origin leaf (S-D11). |
| `src/lib/seo/jsonld.ts` | **Create.** Three pure builders (S-D16). |
| `src/components/JsonLd.tsx` | **Create.** The injection point. |
| `src/components/PublicShell.tsx` + `.module.css` | **Create.** Header/footer shell. |
| `src/components/PublicShare.tsx` + `.module.css` | **Create.** S-D8's control. |
| `src/app/Landing.tsx` + `Landing.module.css` | **Create.** The signed-out homepage. |
| `src/app/sitemap.ts` | **Create.** |
| `src/app/page.tsx` | Dual render (S-D5). |
| `src/app/layout.tsx` | `metadataBase`, **and nothing else** (§6.3). |
| `src/app/robots.ts` | `sitemap:` directive. |
| `src/lib/auth/gate.ts` | §6.1, all three changes. |
| `next.config.ts` | Cache headers (§6.4, S-D10, S-D12). |
| `src/lib/analytics/events.ts` | Everyone's events, one edit (S-D13). |
| `src/lib/i18n/locales/{id,en}.ts` | Everyone's chrome keys, one edit. `id.ts` first. |
| `src/lib/share/links.ts` | **One function body only:** `shareOrigin()` delegates. |
| `src/lib/headers.test.ts` | New cases; `/s/` still asserted. |
| `src/components/accountSurface.test.ts` | One denylist entry. |
| `src/content/copy.test.ts` | **Create.** §11.4's copy lint. |
| `src/lib/i18n/prose.test.ts` | **Create.** §11.4's catalog guard. |
| `tools/seo/crawl.sh`, `tools/seo/fit.sh` | **Create.** §11.2 and loop 4. |
| `docs/DEPLOY-VERCEL.md`, `.env.example`, `CLAUDE.md`, `docs/workstream-notes.md` | Documentation. |

**Explicitly not S1's:** the `/en/` prefix and the rewrite (S2), `src/middleware.ts`
(S2), `src/lib/i18n/resolve.ts` (S2), the canonical/`hreflang` helper (S2), any
content (S3/S4/S6), `src/data/deck.ts` (S4), the wallpaper pipeline (S5).

---

## 1. The two decisions this plan makes that everything else hangs off

### 1.1 The gate never sees a locale prefix, and the failure mode is chosen

§6.1 item 3 says: pick one, write it down, test both spellings. **The decision:
middleware strips the prefix BEFORE calling `decide()`, and `isPublic()` learns no
`/en/` spelling whatsoever.**

```
request  /en/gallery
         → stripLocalePrefix -> { locale: 'en', path: '/gallery' }     (S2)
         → decide({ pathname: '/gallery', ... })  ->  next
         → NextResponse.rewrite('/gallery', { request: { headers } })  (S2)
```

The alternative — teaching `isPublic()` both spellings — is rejected because it
requires the function to grow a second copy of every clause, and the way that goes
wrong is somebody writing `pathname.startsWith('/en/')` for convenience. **That one
line makes the entire application reachable under `/en/`**, which §6.1 names as the
worst outcome available in this release.

**The failure mode is therefore chosen rather than accidental.** If S2's stripping
breaks, `decide()` receives `/en/gallery`, matches nothing, and 302s an indexable page
to `/login`. That costs us an unindexed page and is loudly visible in §11.2's crawl.
The opposite failure — a prefix that fails *open* — would expose `/history` and
`/account`, and nothing would look wrong.

Two assertions in `gate.test.ts` are the fence, and they are the reason this decision
is testable at all before S2 exists:

```ts
expect(isPublic('/en/gallery')).toBe(false);
expect(at('/en/history', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
```

They read as odd ("but `/en/gallery` is supposed to be public") and they are correct:
**the gate is downstream of the strip, so a prefix reaching it is already a bug.**
Write that sentence into the test.

### 1.2 `/` is deliberately uncacheable, and that is the cost of S-D5

Every other public content route is session-invariant and gets
`Cache-Control: public, s-maxage=…`. `/` cannot, for three independent reasons, and
all three would have to be solved together:

1. **It dual-renders by session** (S-D5). A shared CDN entry would serve the landing
   page to a signed-in user, or the picker to a stranger.
2. **It is inside the middleware matcher and middleware writes `jmt_locale`.** A
   `Set-Cookie` makes a response uncacheable at the edge regardless of what we say in
   `Cache-Control` (S-D10 says so in as many words).
3. **Its locale follows D6's chain, not the URL** — because the signed-in arm is an
   app route and D6 survives there (S-D1). So its rendered language varies by cookie
   and session even when the markup does not vary by anything else.

So `/` gets **no** cache entry in `next.config.ts` and keeps Next's dynamic default.
The crawler's TTFB on the homepage is a warm lambda in `sin1`, which is the same TTFB
`/login` has today and nobody has complained about. Recorded in `## Flags` with the
one design that would fix it, so it is not rediscovered as an oversight.

---

## 2. Tasks

### Task 1: `src/lib/seo/origin.ts` — the origin leaf

**Files**
- Create: `src/lib/seo/origin.ts`
- Test: `src/lib/seo/origin.test.ts`

**Steps**

1. Write the failing test.

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { absoluteUrl, siteOrigin } from './origin';

const KEYS = [
  'NEXT_PUBLIC_SITE_ORIGIN',
  'AUTH_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL',
] as const;

let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('siteOrigin', () => {
  it('prefers NEXT_PUBLIC_SITE_ORIGIN', () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://www.jmtarot.site';
    process.env.AUTH_URL = 'https://wrong.example';
    expect(siteOrigin()).toBe('https://www.jmtarot.site');
  });

  it('takes AUTH_URL next, and its ORIGIN rather than its string', () => {
    // AUTH_URL is allowed to carry a path. `shareOrigin()` learned this the hard
    // way -- concatenation would give `https://host/some/path/sitemap.xml`.
    process.env.AUTH_URL = 'https://www.jmtarot.site/some/path';
    expect(siteOrigin()).toBe('https://www.jmtarot.site');
  });

  it('adds the scheme Vercel omits', () => {
    // BOTH Vercel variables are bare hosts. A canonical of `www.jmtarot.site`
    // with no scheme is not a URL and `new URL()` throws on it.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'www.jmtarot.site';
    expect(siteOrigin()).toBe('https://www.jmtarot.site');
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.VERCEL_URL = 'jmtarot-abc123.vercel.app';
    expect(siteOrigin()).toBe('https://jmtarot-abc123.vercel.app');
  });

  it('prefers the PRODUCTION url over the per-deployment one', () => {
    // VERCEL_URL is the immutable per-deployment host. A canonical pointing at
    // it de-indexes the real page, which is the worst class of SEO bug.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'www.jmtarot.site';
    process.env.VERCEL_URL = 'jmtarot-abc123.vercel.app';
    expect(siteOrigin()).toBe('https://www.jmtarot.site');
  });

  it('falls back to the dev origin, which is 3001 and not 3000', () => {
    expect(siteOrigin()).toBe('http://localhost:3001');
  });

  it('never returns a trailing slash, for any rung', () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://www.jmtarot.site/';
    expect(siteOrigin()).toBe('https://www.jmtarot.site');
  });

  it('always returns something `new URL()` accepts', () => {
    // `metadataBase` is `new URL(siteOrigin())`. A throw there is a 500 on every
    // page in the app, so the leaf must be total.
    for (const bad of ['', '   ', 'not a url', '///']) {
      process.env.NEXT_PUBLIC_SITE_ORIGIN = bad;
      expect(() => new URL(siteOrigin())).not.toThrow();
    }
  });

  it('is read at CALL time, not module scope', () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://a.example';
    expect(siteOrigin()).toBe('https://a.example');
    process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://b.example';
    expect(siteOrigin()).toBe('https://b.example');
  });
});

describe('absoluteUrl', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://www.jmtarot.site';
  });

  it('joins without doubling the slash', () => {
    expect(absoluteUrl('/gallery')).toBe('https://www.jmtarot.site/gallery');
    expect(absoluteUrl('gallery')).toBe('https://www.jmtarot.site/gallery');
  });

  it('renders the root as a bare origin plus one slash', () => {
    // `https://host` and `https://host/` are the same page and DIFFERENT strings.
    // A sitemap and a canonical that disagree about the slash are a self-referential
    // canonical that does not match, which Google reports as a duplicate.
    expect(absoluteUrl('/')).toBe('https://www.jmtarot.site/');
  });

  it('refuses to build a URL from an absolute one', () => {
    expect(() => absoluteUrl('https://evil.example/x')).toThrow(/relative path/);
  });
});
```

2. Run it and see it fail.

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm test -- origin
```

Expected: `Failed to resolve import "./origin"`.

3. Implement.

```ts
/**
 * The one place that decides what this site's origin is.
 *
 * ── WHY THIS FILE EXISTS AT ALL (S-D11) ─────────────────────────────────────
 *
 * `src/app/robots.ts` carried an explicit refusal to import `shareOrigin()` from
 * `@/lib/share/links`, because that pulls `server-only`, `queries/share.ts` and
 * the whole Drizzle schema into a route whose entire output is four lines of
 * text. That refusal was right and it left a hole: `sitemap.ts`, `metadataBase`
 * and forty-four content pages' `generateMetadata` all need the same answer, and
 * the alternative to a leaf is each of them reading `process.env` its own way.
 *
 * **TWO FUNCTIONS THAT INDEPENDENTLY DECIDE THIS SITE'S ORIGIN WILL DISAGREE THE
 * FIRST TIME THE DOMAIN CHANGES, AND THE SYMPTOM IS A CANONICAL TAG POINTING AT
 * THE WRONG HOST — WHICH DE-INDEXES THE CORRECT PAGE.** That is the single worst
 * class of SEO bug available and nothing reports it. So there is one chain, here,
 * and `shareOrigin()` delegates to it.
 *
 * ── NO IMPORTS. A LEAF STAYS A LEAF ─────────────────────────────────────────
 *
 * No `server-only`, no `@/lib/db`, no `@/lib/i18n`, no `next/*`. `robots.ts`,
 * `sitemap.ts` and `layout.tsx` all import it and each of those is a route whose
 * module graph is worth keeping small. `origin.test.ts` also asserts the absence,
 * because "it imports nothing" is the property, not the current line count.
 *
 * ── READ AT CALL TIME, NEVER AT MODULE SCOPE ────────────────────────────────
 *
 * A module-scope `const` is inlined by the bundler and freezes the local value
 * into the production build. `resolve.ts` and `share/links.ts` both record this
 * for the same shape; there is a test.
 *
 * ── THE CHAIN, AND THE ONE RUNG THE ROADMAP DID NOT NAME ────────────────────
 *
 *   NEXT_PUBLIC_SITE_ORIGIN          the explicit answer. What production sets.
 *   AUTH_URL                         **NOT IN ROADMAP §9. SEE `## Flags`.**
 *   VERCEL_PROJECT_PRODUCTION_URL    the project's production host, bare.
 *   VERCEL_URL                       the per-deployment host, bare. LAST RESORT.
 *   http://localhost:3001            dev. 3001 because port 3000 is permanently
 *                                    held by another project's Grafana container.
 *
 * `AUTH_URL` is a rung because production already sets it to
 * `https://www.jmtarot.site` and `docs/DEPLOY-VERCEL.md` §5 leans on exactly that
 * for `shareOrigin()`. Without it, a deployment that forgot
 * `NEXT_PUBLIC_SITE_ORIGIN` falls through to a Vercel host and silently emits
 * canonicals for a domain nobody typed. With it, the app has to be misconfigured
 * in two places before that can happen.
 *
 * **NOTHING UNDER `'use client'` MAY CALL THIS.** `AUTH_URL` and both Vercel
 * variables carry no `NEXT_PUBLIC_` prefix, so in a browser bundle they inline as
 * `undefined` and the chain silently collapses to `http://localhost:3001` — the
 * exact trap `localeSwitcherEnabled()` recorded when it "lived in
 * `LocaleSwitch.tsx` for about ten minutes". A client component that needs an
 * absolute URL is handed one as a prop by the server page that owns it, which is
 * how `shareUrl()` already works. `clientBoundary.test.ts` gains the fence in
 * Task 12.
 */

/** The dev origin. 3001, never 3000 — see CLAUDE.md `## Traps`. */
const DEV_ORIGIN = 'http://localhost:3001';

export function siteOrigin(): string {
  const explicit = normalize(process.env.NEXT_PUBLIC_SITE_ORIGIN);
  if (explicit) return explicit;

  const authUrl = normalize(process.env.AUTH_URL);
  if (authUrl) return authUrl;

  /*
   * Both Vercel variables are BARE HOSTS with no scheme. `new URL('www.x.site')`
   * throws, and a canonical without a scheme is not a URL at all.
   */
  const production = normalize(process.env.VERCEL_PROJECT_PRODUCTION_URL, 'https://');
  if (production) return production;

  const deployment = normalize(process.env.VERCEL_URL, 'https://');
  if (deployment) return deployment;

  return DEV_ORIGIN;
}

/**
 * `${siteOrigin()}${path}`, with exactly one slash between them.
 *
 * REFUSES AN ABSOLUTE INPUT rather than passing it through. Every caller is
 * building a canonical, an `hreflang` or a sitemap entry from a route this app
 * owns; an absolute string arriving here means somebody is about to canonicalise
 * a page at a host we do not control, and returning it unchanged would make that
 * silent.
 */
export function absoluteUrl(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) {
    throw new Error(`absoluteUrl expects a relative path, got: ${path}`);
  }
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${siteOrigin()}${suffix}`;
}

/**
 * Trim, prefix a scheme if asked, take the ORIGIN, drop a trailing slash.
 *
 * TOTAL BY CONSTRUCTION. `metadataBase` is `new URL(siteOrigin())` and a throw
 * there is a 500 on every page in the app, so an unparseable value falls to the
 * next rung rather than propagating.
 */
function normalize(raw: string | undefined, scheme = ''): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return new URL(value.includes('://') ? value : `${scheme}${value}`).origin;
  } catch {
    return null;
  }
}
```

4. Run it green.

```sh
npm test -- origin
```

Expected: 12 passing.

5. Add the leaf assertion to the same file, and see it pass:

```ts
it('imports nothing', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/seo/origin.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Comments stripped first: the header names `@/lib/share/links` and
  // `server-only` while explaining why neither may be imported, and a rule that
  // fires on prose describing the rule is a rule people delete.
  // (`queries/contract.test.ts` records the same lesson.)
  expect(code).not.toMatch(/^\s*import\s/m);
  expect(code).toContain('VERCEL_PROJECT_PRODUCTION_URL'); // not vacuous
});
```

6. Commit.

```sh
git add src/lib/seo/origin.ts src/lib/seo/origin.test.ts
git commit -m "S1: one leaf owns the site's origin (S-D11)"
```

---

### Task 2: `shareOrigin()` delegates to the leaf

**Files**
- Modify: `src/lib/share/links.ts:103-117` (the `shareOrigin` body and its doc comment)
- Test: `src/lib/share/links.test.ts` (add cases; existing ones must stay green)

**Steps**

1. Read the existing test first, so you can see which assertions must keep passing.

```sh
npm test -- links
```

Expected: green before you touch anything. Note the count.

2. Add the failing case.

```ts
it('falls through to siteOrigin(), so the two never disagree (S-D11)', () => {
  delete process.env.SHARE_BASE_URL;
  delete process.env.AUTH_URL;
  process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://www.jmtarot.site';
  // Before delegation this returned the hardcoded `http://localhost:3001`.
  expect(shareOrigin()).toBe('https://www.jmtarot.site');
  expect(shareOrigin()).toBe(siteOrigin());
});

it('still lets SHARE_BASE_URL override, because the share host may differ', () => {
  process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://www.jmtarot.site';
  process.env.SHARE_BASE_URL = 'https://s.example';
  expect(shareOrigin()).toBe('https://s.example');
});
```

3. Run it and see it fail.

```sh
npm test -- links
```

Expected: `expected 'http://localhost:3001' to be 'https://www.jmtarot.site'`.

4. Implement. Replace the function body and **amend** the comment; do not delete the
   `AUTH_URL`-origin paragraph, which records a real bug.

```ts
/**
 * The origin a share URL is built against.
 *
 * **READ AT CALL TIME, NEVER AT MODULE SCOPE.** A module-scope `const` is
 * inlined by the bundler and freezes the local value into the production build —
 * `resolve.ts` records the same reason for the same shape.
 *
 * `SHARE_BASE_URL` first, because the share host is allowed to differ from the
 * app host and `docs/DEPLOY-VERCEL.md` §5 explains when you would want that.
 *
 * **EVERYTHING AFTER IT IS NOW `siteOrigin()`'s (S-D11), AND THE TWO RUNGS THIS
 * FUNCTION USED TO OWN MOVED THERE RATHER THAN BEING DELETED.** `AUTH_URL`'s
 * ORIGIN and `http://localhost:3001` are both in that chain, in that order, for
 * the reasons this comment used to give: `AUTH_URL` is allowed to carry a path,
 * so a share URL built by concatenation would come out as
 * `https://host/some/path/s/<slug>`, and `npm run dev` lands on 3001 because port
 * 3000 is permanently held by another project's Grafana container.
 *
 * **WHY DELEGATE RATHER THAN KEEP A SECOND COPY.** Two functions that
 * independently decide this site's origin disagree the first time the domain
 * changes, and the symptom is a canonical tag pointing at the wrong host, which
 * de-indexes the correct page. A share URL and a canonical URL naming different
 * hosts is the same bug wearing a different hat: the `Try It Yourself` button on
 * `/s/` would send a stranger to a domain the sitemap says does not exist.
 *
 * Never a trailing slash, because `${origin}/s/${slug}` would otherwise double it
 * and a doubled slash in a capability URL is a 404 somebody has to debug from a
 * chat message. `siteOrigin()` guarantees that property; there is a test.
 */
export function shareOrigin(): string {
  const explicit = process.env.SHARE_BASE_URL?.trim();
  if (explicit) return trimOrigin(explicit);
  return siteOrigin();
}
```

Add `import { siteOrigin } from '@/lib/seo/origin';` to the import block. **`trimOrigin`
stays** — `SHARE_BASE_URL` still needs it and deleting a helper with one caller is not
worth the diff.

5. Run green, and run the whole suite because `shareUrl()` has many callers.

```sh
npm test -- links && npm test
```

Expected: `links` green with two more cases; the full unit suite still at its prior
count plus the new files.

6. Commit.

```sh
git add src/lib/share/links.ts src/lib/share/links.test.ts
git commit -m "S1: shareOrigin() delegates to the origin leaf, so the two cannot disagree"
```

---

### Task 3: `metadataBase` in the root layout, and nothing else

**Files**
- Modify: `src/app/layout.tsx:47-69` (inside `generateMetadata`, one field)
- Test: `src/app/layout.contract.test.ts` (create)

**Steps**

1. Write the failing test. It is a **source-level contract test**, not a render: the
   layout awaits `getLocale()`, which needs `next/headers`.

```ts
/**
 * The root layout, checked at the source level.
 *
 * **EVERY FIELD IN `generateMetadata` HAS A RECORDED REASON AND §6.3 GIVES S1 EXACTLY
 * ONE ADDITION.** `other: { 'apple-mobile-web-app-capable': 'yes' }` is the one most
 * likely to be dropped in an edit, and losing it turns Add to Home Screen into a
 * Safari bookmark on iOS below 17.4 — a regression nothing in WSL can see, on the
 * one platform this app is built for.
 *
 * The file is not rendered here for the same reason `/s/`'s contract test does not
 * render its page: `next/headers` and React `cache()` do not belong in Vitest, and
 * the properties worth protecting are all one deleted line away from being gone.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the root layout', () => {
  it('reads the file at all, so nothing below passes vacuously', () => {
    expect(CODE).toContain('export async function generateMetadata');
    expect(CODE).toContain('export default async function RootLayout');
  });

  it('sets metadataBase from the origin leaf, never from process.env directly', () => {
    // Every canonical, every `og:image` and every `hreflang` in the app resolves
    // against this. Reading `process.env` here would be the second function that
    // decides the origin, which is the whole thing S-D11 forbids.
    expect(CODE).toContain('metadataBase');
    expect(CODE).toContain("from '@/lib/seo/origin'");
    expect(CODE).not.toContain('process.env.NEXT_PUBLIC_SITE_ORIGIN');
  });

  it('keeps the four fields whose loss is invisible in WSL', () => {
    expect(CODE).toContain("'apple-mobile-web-app-capable': 'yes'");
    expect(CODE).toContain('appleWebApp');
    expect(CODE).toContain("icon: '/icon.png'");
    expect(CODE).toContain('export const viewport');
    expect(CODE).toContain("viewportFit: 'cover'");
  });

  it('still resolves the locale per request, so <html lang> is right on first paint', () => {
    // `## Localization` rule 5. The build output flipping to ƒ is this working.
    expect(CODE).toContain('getLocaleBundle');
    expect(CODE).toContain('<html lang={locale}');
  });

  it('NEVER calls currentUser() — the mount seam is the owning page', () => {
    // `src/lib/auth/server.ts` says so in as many words: calling it here makes
    // `/terms` and `/privacy` dynamic too. S-D5's dual render lives in
    // `src/app/page.tsx`, and this assertion is what keeps it there.
    expect(CODE).not.toContain('currentUser');
    expect(CODE).not.toContain('requireUser');
  });
});
```

2. Run and see it fail.

```sh
npm test -- layout.contract
```

Expected: three failures — `metadataBase`, `@/lib/seo/origin`.

3. Implement. Add the import and **one field**. Change nothing else in the file.

```ts
import { siteOrigin } from '@/lib/seo/origin';
```

```ts
  return {
    /*
     * S1 (S-D11). **EVERY CANONICAL, EVERY `og:image` AND EVERY `hreflang` IN THE
     * APP RESOLVES AGAINST THIS**, so a relative `alternates.canonical` in a page's
     * `generateMetadata` becomes an absolute URL at the right host — which is what
     * makes S-D15's one helper possible at all.
     *
     * WITHOUT IT, NEXT WARNS AND GUESSES. The guess is `VERCEL_URL` (the immutable
     * per-deployment host) or `http://localhost:3000`, and a canonical at either
     * de-indexes the real page. Nothing reports it.
     *
     * `new URL()` and not a string: that is the type Next wants, and `siteOrigin()`
     * is total by construction precisely so this line cannot throw — a throw here
     * is a 500 on every page in the app. `origin.test.ts` asserts it.
     *
     * THIS ALSO REACHES `/s/`, which the v0.4.0 route table calls unchanged, and the
     * change there is strictly an improvement rather than an exception: its
     * `opengraph-image` stops resolving against Next's guess and starts resolving
     * against the real host. VD18 is untouched — the image still draws only
     * `MAJOR ARCANA` and carries neither the question nor the prose.
     */
    metadataBase: new URL(siteOrigin()),
    title: t('app.title'),
    /* ...everything else exactly as it was... */
  };
```

4. Run green, then build — this is the file where a green typecheck is least
   trustworthy, because `metadataBase` is consumed by the metadata compiler.

```sh
npm test -- layout.contract && npm run typecheck && npm run build
```

Expected: 6 passing; build succeeds; **the route list still shows `ƒ` for `/`,
`/terms` and `/privacy`.** If the build dies with
`Can't resolve '@vercel/turbopack-next/internal/font/google/font'`, that is the AAAA
trap — retry the build.

5. Verify on the wire, which is the only thing that proves the tag changed.

```sh
npm start &            # or: npx next start
curl -s http://localhost:3001/s/abcdefghjkmn | grep -o '<meta property="og:image[^>]*>'
# Expect an ABSOLUTE http://localhost:3001/... URL, not a relative path.
pkill -f next-server   # NOT `pkill -f "next start"` -- see headers.test.ts's header
```

6. Commit.

```sh
git add src/app/layout.tsx src/app/layout.contract.test.ts
git commit -m "S1: metadataBase, and a contract test around the fields that must survive it"
```

---

### Task 4: `isPublic()` learns the content surface

**Files**
- Modify: `src/lib/auth/gate.ts:62-120` (four clauses inside `isPublic`)
- Test: `src/lib/auth/gate.test.ts` (new `describe` block)

**Steps**

1. Write the failing tests, negative controls first.

```ts
describe('isPublic -- v0.4.0 opens the content surface (S-D3)', () => {
  it('opens exactly five paths', () => {
    expect(isPublic('/gallery')).toBe(true);
    expect(isPublic('/arcana/the-moon')).toBe(true);
    expect(isPublic('/arcana/wheel-of-fortune')).toBe(true);
    expect(isPublic('/blog')).toBe(true);
    expect(isPublic('/blog/how-to-read-tarot')).toBe(true);
  });

  it('does not widen a prefix -- THE NEGATIVE CONTROLS', () => {
    /*
     * Each of these is a hole if the clause is written as the obvious prefix.
     *
     * `/gallery` is an EXACT match because nothing lives under it today, and a
     * prefix would silently make a future `/gallery/<anything>` public.
     * `/arcana` with no slug is a deliberate 404 (§3.1: `/gallery` is the index
     * and two indexes of one collection compete), so the clause is `/arcana/`.
     */
    expect(isPublic('/gallerywhatever')).toBe(false);
    expect(isPublic('/gallery/secret')).toBe(false);
    expect(isPublic('/arcana')).toBe(false);
    expect(isPublic('/arcanaz')).toBe(false);
    expect(isPublic('/blogroll')).toBe(false);
    expect(isPublic('/blogs')).toBe(false);
  });

  it('KNOWS NOTHING ABOUT THE /en/ PREFIX, AND THAT IS THE DESIGN', () => {
    /*
     * §6.1 item 3, decided in this plan's §1.1: **middleware strips the prefix
     * BEFORE calling `decide()`.** So a path reaching this function with a locale
     * prefix still on it is already a bug, and the honest answer is `false`.
     *
     * Teaching this function `/en/` spellings is what eventually produces
     * `pathname.startsWith('/en/')` for convenience -- one line that makes the
     * WHOLE APPLICATION reachable under `/en/`, which §6.1 names as the worst
     * outcome available in this release. The chosen failure mode is the other
     * one: a stripping bug 302s an indexable page to /login, which costs an
     * unindexed page and is loudly visible in §11.2's signed-out crawl.
     */
    expect(isPublic('/en/gallery')).toBe(false);
    expect(isPublic('/en/arcana/the-moon')).toBe(false);
    expect(isPublic('/en/blog')).toBe(false);
    // And the ones that must NEVER be public under any spelling:
    expect(isPublic('/en/history')).toBe(false);
    expect(isPublic('/en/account')).toBe(false);
    expect(isPublic('/en/onboarding')).toBe(false);
  });

  it('still does not make the app public by accident', () => {
    // V6 rule 5 and V7's assertion, restated from S1's side. `/history` is
    // somebody's entire reading history.
    expect(isPublic('/history')).toBe(false);
    expect(isPublic('/history/abc')).toBe(false);
    expect(isPublic('/account')).toBe(false);
    expect(isPublic('/api/reading')).toBe(false);
  });
});
```

2. Run and see it fail.

```sh
npm test -- gate
```

Expected: the first block fails five assertions; every negative control already
passes (they are the pre-change behaviour), which is what makes them worth having.

3. Implement. Insert **after** the `/s/` clause and **before**
   `pathname.startsWith('/api/auth/')`, so the reading order is
   oldest-to-newest and the `/api/` clauses stay together at the end.

```ts
    /*
     * ── v0.4.0 / S1. THE INDEXABLE CONTENT SURFACE (S-D3) ────────────────────
     *
     * Today a search engine can see three pages of this application and one of
     * them is a login form. These four clauses are most of the fix.
     *
     * **EXACT MATCHES AND ONE NARROW PREFIX EACH, NEVER A WIDENED PREFIX.** This
     * is a function and not a regex precisely so that reads as code (see the
     * header), and each shape is chosen rather than defaulted:
     *
     *   `/gallery`   EXACT. Nothing lives under it, and a prefix would make a
     *                future `/gallery/<anything>` public with no further edit.
     *   `/arcana/`   PREFIX, and never the bare `/arcana`. §3.1 makes `/arcana`
     *                a deliberate 404 -- `/gallery` is the index of the
     *                collection and two indexes compete with each other -- so
     *                the trailing slash is load-bearing, exactly as it is on
     *                `/s/` for a different reason. There is a test.
     *   `/blog`      EXACT for the index, plus `/blog/` for the articles. Two
     *                clauses rather than one prefix, so `/blogroll` cannot
     *                become public by looking like `/blog`.
     *
     * **THIS FUNCTION KNOWS NOTHING ABOUT `/en/`, AND THAT IS THE DESIGN.** S2's
     * middleware strips the locale prefix BEFORE `decide()` runs (S-D2, and the
     * decision is written down in the S1 plan §1.1), so `/en/gallery` arrives
     * here as `/gallery`. A prefix reaching this function un-stripped is already
     * a bug, and answering `false` makes that bug a 302 on an indexable page --
     * visible, cheap, and recoverable. The alternative failure, an `/en/` clause
     * written broadly enough to be convenient, makes `/en/history` public and
     * looks like a working feature.
     *
     * **`'/'` IS DELIBERATELY ABSENT (S-D5).** It dual-renders, and this function
     * short-circuits `decide()` before the onboarding check -- so adding it here
     * would stop sending a signed-in, un-onboarded querent to `/onboarding` and
     * would land them on a picker that assumes a completed profile. The `/`
     * clause is in `decide()` instead, where the signed-in arms still run.
     */
    pathname === '/gallery' ||
    pathname.startsWith('/arcana/') ||
    pathname === '/blog' ||
    pathname.startsWith('/blog/') ||
```

4. Run green.

```sh
npm test -- gate
```

Expected: all four new blocks pass, and **every pre-existing test in the file still
passes** — the file is extended, never weakened (§11.3).

5. Commit.

```sh
git add src/lib/auth/gate.ts src/lib/auth/gate.test.ts
git commit -m "S1: isPublic() opens /gallery, /arcana/ and /blog, with a negative control each"
```

---

### Task 5: `decide()` gains the explicit `/` clause (S-D5)

**Files**
- Modify: `src/lib/auth/gate.ts:153-186` (one clause in `decide`)
- Test: `src/lib/auth/gate.test.ts` (new `describe` block)

**Steps**

1. Write the failing tests. **The signed-in-but-not-onboarded assertion is the
   security-relevant one**; write it first.

```ts
describe('decide -- S-D5 makes / dual-render', () => {
  it('lets a stranger reach the landing page', () => {
    // This is the whole change: signed out, `/` renders instead of bouncing.
    // It also closes the blocker CLAUDE.md has carried for two releases --
    // "Google's branding requirement of an app homepage that is not a login
    // page" -- because signed out, `/` no longer redirects to `/login`.
    expect(at('/', signedOut)).toEqual({ kind: 'next' });
  });

  it('STILL sends a signed-in, un-onboarded querent to /onboarding', () => {
    /*
     * **THE ASSERTION THIS WHOLE TASK EXISTS FOR.** `isPublic()`
     * short-circuits `decide()` before the onboarding check, so putting `'/'`
     * in that function -- the obvious one-line version of this change --
     * would land a half-onboarded querent on the reader picker, a route that
     * assumes a completed `profiles` row. The clause is here, below
     * `isPublic()` and gated on `!signedIn`, so both signed-in arms are
     * untouched.
     */
    expect(at('/', halfway)).toEqual({ kind: 'redirect', to: '/onboarding' });
  });

  it('still lets a settled querent reach the picker', () => {
    expect(at('/', settled)).toEqual({ kind: 'next' });
  });

  it('keeps / OUT of isPublic(), which is what makes the above true', () => {
    // A negative control on the mechanism rather than on the behaviour: this is
    // the assertion that fails if somebody later "simplifies" the clause into
    // `isPublic`, and the failure message names the reason.
    expect(isPublic('/')).toBe(false);
  });

  it('does not open anything else that merely starts with a slash', () => {
    expect(at('/thessaly', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/history', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/account', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/onboarding', signedOut)).toEqual({ kind: 'redirect', to: '/login' });
    expect(at('/api/reading', signedOut)).toEqual({
      kind: 'json',
      status: 401,
      error: 'Unauthorized',
    });
  });
});
```

2. Run and see it fail.

```sh
npm test -- gate
```

Expected: exactly one failure —
`at('/', signedOut)` returns `{ kind: 'redirect', to: '/login' }`. Every other
assertion in the block already holds, which is the point: this change must move one
cell of the table and nothing else.

3. Implement. **Between** `isPublic()` and the `!signedIn` branch.

```ts
export function decide(input: GateInput): GateDecision {
  const { pathname, signedIn, onboarded } = input;

  if (isPublic(pathname)) return { kind: 'next' };

  /*
   * ── S-D5. `/` DUAL-RENDERS, AND THIS IS WHY IT IS NOT IN `isPublic()` ──────
   *
   * Signed out, `/` is a static, crawlable landing page. Signed in, it is the
   * reader picker, byte for byte as before. `src/app/page.tsx` decides which by
   * calling `currentUser()`, which is database-free.
   *
   * **`isPublic()` WOULD HAVE BEEN THE ONE-LINE VERSION AND IT IS WRONG.** That
   * function short-circuits this one ABOVE the onboarding check, so `'/'` in the
   * public set would stop redirecting a signed-in, un-onboarded querent to
   * `/onboarding` and would land them on the picker -- a route that assumes a
   * completed `profiles` row, in an app where onboarding is asked exactly once.
   * There is a test named for exactly that case.
   *
   * `!signedIn &&` is therefore the whole guard: both signed-in arms below run
   * unchanged, and the only cell of the decision table that moves is
   * (signed out, `/`).
   *
   * It also closes a blocker CLAUDE.md has carried for two releases -- Google's
   * branding requirement is an app homepage that is not a login page, and
   * publishing the OAuth consent screen was blocked on `/` redirecting to
   * `/login`. One change, two problems.
   */
  if (!signedIn && pathname === '/') return { kind: 'next' };

  if (!signedIn) {
    /* ...unchanged... */
  }
  /* ...unchanged... */
}
```

4. Run green, and run the whole suite: `decide()` is the most-depended-on pure
   function in the app.

```sh
npm test -- gate && npm test
```

5. Commit.

```sh
git add src/lib/auth/gate.ts src/lib/auth/gate.test.ts
git commit -m "S1: decide() lets a stranger reach / , without touching the onboarding arm (S-D5)"
```

---

### Task 6: `robots.ts` gains the `sitemap:` directive

**Files**
- Modify: `src/app/robots.ts` (the whole file is 42 lines; amend the header and add one field)
- Test: `src/app/robots.test.ts` (create)

**Steps**

1. Write the failing test.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import robots from './robots';

describe('robots.txt', () => {
  it('still disallows /s/ and /api/ -- THE LINE THAT MATTERS', () => {
    // V7's three halves: this `Disallow`, the `x-robots-tag` header, and the
    // `<meta>` twin. None of the three is redundant; a `Disallow` is the only
    // one that prevents the fetch at all.
    const rule = robots().rules;
    const first = Array.isArray(rule) ? rule[0] : rule;
    expect(first.disallow).toContain('/s/');
    expect(first.disallow).toContain('/api/');
    expect(first.allow).toBe('/');
  });

  it('names the sitemap ABSOLUTELY, because the directive requires it', () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://www.jmtarot.site';
    expect(robots().sitemap).toBe('https://www.jmtarot.site/sitemap.xml');
  });

  it('imports the ORIGIN LEAF and nothing heavier', () => {
    /*
     * This file's header refused `shareOrigin()` because it pulls `server-only`,
     * `queries/share.ts` and the whole Drizzle schema into a route whose output
     * is four lines of text. That refusal STANDS. `@/lib/seo/origin` exists so
     * the refusal does not also mean "no origin at all".
     */
    const source = readFileSync(join(process.cwd(), 'src/app/robots.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain("from '@/lib/seo/origin'");
    expect(code).not.toContain('@/lib/share');
    expect(code).not.toContain('@/lib/db');
    expect(code).not.toContain('server-only');
  });
});
```

2. Run and see it fail.

```sh
npm test -- robots
```

Expected: `expected undefined to be 'https://www.jmtarot.site/sitemap.xml'`.

3. Implement. Amend the last paragraph of the header — **do not delete it**, invert it.

```ts
import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo/origin';
```

Replace the final header paragraph with:

```
 * **IT USED TO IMPORT NOTHING, AND THE REFUSAL IS AMENDED RATHER THAN REVERSED.**
 * The obvious first draft set `host: shareOrigin()`, which pulls
 * `@/lib/share/links` -- and with it `server-only`, `queries/share.ts` and the
 * whole schema -- into a route whose entire output is four lines of text. `host`
 * is a non-standard directive Google ignores outright, so that import bought
 * nothing and cost a static route its independence.
 *
 * `sitemap:` is different in exactly the way that matters: **the directive is
 * specified to take an ABSOLUTE URL**, so it genuinely needs the origin and there
 * is no version of this line that does not. S-D11 is the answer --
 * `@/lib/seo/origin` is a leaf with no imports of its own, and `origin.test.ts`
 * asserts that. A leaf stays a leaf; it does not have to stay alone.
```

Then:

```ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/s/', '/api/'],
      },
    ],
    /*
     * ONE SITEMAP, AND `sitemap.ts` DECIDES WHAT IS IN IT. A second entry here
     * for a per-locale sitemap would be a second place that has to agree about
     * the route set; S2 expands the locales inside that one file instead.
     *
     * The middleware matcher already excludes `sitemap` and `robots`, so neither
     * path needs a session and neither appears in `isPublic()`.
     */
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
```

4. Run green.

```sh
npm test -- robots
```

5. Commit.

```sh
git add src/app/robots.ts src/app/robots.test.ts
git commit -m "S1: robots.txt names the sitemap, through the origin leaf"
```

---

### Task 7: `src/app/sitemap.ts`

**Files**
- Create: `src/app/sitemap.ts`
- Test: `src/app/sitemap.test.ts`

**The S1 / S2 / S3 / S4 / S6 seam, stated before the code so no two plans write the
same line.**

| Who | Writes |
|---|---|
| **S1** | The whole file: `SITEMAP_PATHS`, `CONTENT_UPDATED_AT`, `entry()`, `EN_PREFIX`, the default export. Plus `sitemap.test.ts` with the permanent exclusion assertions and an **exact** assertion on the current path set. |
| **S2** | Deletes `const EN_PREFIX = '/en'` and imports `localePath` from `@/lib/i18n/resolve` in its place. **A two-line diff in one place.** S2 owns no other line of this file. |
| **S3** | Adds `'/gallery'` to `SITEMAP_PATHS`, and the matching line to the test's exact set. |
| **S4** | Adds `...arcanaSlugs().map((s) => \`/arcana/${s}\`)`, importing `@/content/arcana` (which §5 requires to be pure and prose-free). Plus the test line. |
| **S6** | Adds `'/blog'` and the article paths from `@/content/blog`. Plus the test line. |

**S1 ships `SITEMAP_PATHS = ['/']` and nothing more**, because a sitemap that
advertises `/gallery` before S3 lands is a sitemap that advertises a 404 — and
Search Console reports that as an error against the whole file. The test asserting
the **exact** set is what forces each later workstream to update both halves in one
commit.

**Steps**

1. Write the failing test.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import sitemap from './sitemap';

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_ORIGIN = 'https://www.jmtarot.site';
});

const urls = () => sitemap().map((e) => e.url);

describe('sitemap.xml', () => {
  /**
   * **THE EXACT SET, NOT A SUPERSET.** S3, S4 and S6 each add one line to
   * `SITEMAP_PATHS` and one line here, in the same commit. A `toContain` here
   * would let a workstream add a path without noticing it also has to exist, and
   * a sitemap naming a 404 is an error Search Console reports against the whole
   * file rather than against the row.
   */
  it('lists exactly the routes that exist today, in both locales', () => {
    expect(urls()).toEqual([
      'https://www.jmtarot.site/',
      'https://www.jmtarot.site/en',
      // S3 adds /gallery and /en/gallery.
      // S4 adds 22 /arcana/<slug> and 22 /en/arcana/<slug>.
      // S6 adds /blog, /en/blog and the articles.
    ]);
  });

  it('EXCLUDES /s/, /api/ and every gated route -- permanently', () => {
    /*
     * `/s/` is `noindex, nofollow, noarchive` and a 60-bit slug in a sitemap
     * would be publishing the capability itself. `/api/` holds no documents and
     * `/api/events` would have a crawler writing analytics rows.
     *
     * `/login`, `/terms` and `/privacy` are excluded for a THIRD reason worth
     * writing down: all three are `robots: { index: false }` today (see their
     * `generateMetadata`), and a sitemap entry for a noindex page is a
     * contradiction Google reports as an error. If a future release wants the
     * legal pages indexed, the `robots` field changes first and this list second.
     */
    for (const forbidden of [
      '/s/',
      '/api',
      '/history',
      '/account',
      '/onboarding',
      '/login',
      '/terms',
      '/privacy',
      '/thessaly',
      '/margaret',
      '/adrian',
    ]) {
      expect(urls().filter((u) => u.includes(forbidden))).toEqual([]);
    }
  });

  it('pairs every entry with a RECIPROCAL hreflang set including x-default', () => {
    /*
     * S-D15. Google discards a non-reciprocal `hreflang` set SILENTLY -- the
     * whole set stops working and nothing reports it. Asserted here rather than
     * only in S2's helper because the sitemap is the one place the full graph is
     * visible at once.
     */
    for (const e of sitemap()) {
      const langs = e.alternates?.languages;
      expect(langs, e.url).toBeDefined();
      expect(Object.keys(langs!).sort()).toEqual(['en', 'id', 'x-default']);
      // x-default is the Indonesian URL: `id` is the default and the source
      // language (`## Localization`), and x-default is what a visitor whose
      // language we do not serve should land on.
      expect(langs!['x-default']).toBe(langs!.id);
      // Reciprocity: every entry names the same pair, so both rows agree.
      expect(urls()).toContain(langs!.id);
      expect(urls()).toContain(langs!.en);
    }
  });

  it('is byte-stable across calls', () => {
    /*
     * `lastModified: new Date()` is the obvious line and it makes every fetch of
     * the sitemap report every page as changed just now, which is a spam signal
     * and destroys the field's only use. A COMMITTED constant is the honest
     * answer: it changes when the content changes, in a diff.
     */
    expect(JSON.stringify(sitemap())).toBe(JSON.stringify(sitemap()));
  });

  it('stays a LEAF (S-D11)', () => {
    /*
     * This is the highest-traffic, most-cacheable response on the domain and it
     * must not acquire `server-only`, the Drizzle schema or the message catalog.
     * `@/data/**` and `@/lib/seo/origin` are permitted -- both are pure data --
     * and `@/content/*/index.ts` will be, because §5 requires those registries
     * to hold no prose.
     */
    const source = readFileSync(join(process.cwd(), 'src/app/sitemap.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of [
      'server-only',
      '@/lib/db',
      '@/lib/auth',
      '@/lib/share',
      '@/lib/i18n/catalog',
      '@/lib/i18n/t',
      'next/headers',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
    expect(code).toContain("from '@/lib/seo/origin'"); // not vacuous
  });
});
```

2. Run and see it fail.

```sh
npm test -- sitemap
```

Expected: `Failed to resolve import "./sitemap"`.

3. Implement.

```ts
import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo/origin';

/**
 * `sitemap.xml`, both locales.
 *
 * ── IT IS A LEAF AND IT HAS TO STAY ONE (S-D11) ─────────────────────────────
 *
 * `robots.ts` refused to import `shareOrigin()` because that pulls `server-only`,
 * `queries/share.ts` and the whole Drizzle schema into a static route. **The same
 * argument binds harder here**, because this is the response a crawler fetches
 * first and the one that must never 500: there is no database on its path, so a
 * database outage cannot reach it. `@/lib/seo/origin` and `@/data/**` are the only
 * import families permitted; `sitemap.test.ts` asserts the absence of the rest.
 *
 * ── WHAT IS DELIBERATELY NOT IN HERE ────────────────────────────────────────
 *
 * `/s/<slug>` -- a 60-bit slug is a capability and a sitemap is publication. It
 * carries `x-robots-tag: noindex, nofollow, noarchive` and `robots.txt` disallows
 * the prefix; listing it here would undo all three.
 *
 * `/api/**` -- nothing under it is a document, and a crawler walking
 * `/api/events` would be writing analytics rows.
 *
 * Every gated route -- `/history`, `/history/[id]`, `/account`, `/onboarding`,
 * `/[reader]`, `/[reader]/[service]`. A crawler carries no cookie, so each is a
 * 302 to `/login`; a sitemap full of redirects is worse than a short sitemap.
 *
 * `/login`, `/terms` and `/privacy` -- ALL THREE ARE `robots: { index: false }`
 * TODAY, in their own `generateMetadata`. A sitemap entry for a noindex page is a
 * contradiction Search Console reports against the whole file. If a future release
 * wants the legal pages indexed, that field changes FIRST.
 *
 * ── THE SEAM WITH S2 IS ONE CONSTANT ────────────────────────────────────────
 *
 * `EN_PREFIX` is a local constant so that S1 can ship both locales before S2's
 * `stripLocalePrefix` / `localePath` exist. **S2 deletes it and imports
 * `localePath` from `@/lib/i18n/resolve` in its place** -- a two-line diff, in one
 * file, and S2 owns no other line here. That is the whole coordination.
 *
 * ── `lastModified` IS A COMMITTED CONSTANT, NEVER `new Date()` ───────────────
 *
 * `new Date()` reports every page as changed on every fetch, which is a spam
 * signal and throws away the field's only use. A constant changes when the content
 * changes, in a diff a reviewer can see. `sitemap.test.ts` asserts byte-stability
 * across two calls, which is the mechanical form of that rule.
 */

/** Bump when the content behind these paths changes. Not a build timestamp. */
const CONTENT_UPDATED_AT = '2026-07-28';

/**
 * The Indonesian paths. **The `/en/` twin of each is derived, never listed** --
 * S-D4 makes the URL slug identical in both locales precisely so that the
 * `hreflang` pair is a clean mapping with no per-locale slug table.
 *
 * S3 adds `/gallery`. S4 spreads the 22 `/arcana/<slug>`. S6 adds `/blog` and the
 * articles. Each also adds its line to `sitemap.test.ts`'s exact set, in the same
 * commit -- a path here with no page behind it is a 404 in a sitemap.
 */
const SITEMAP_PATHS: readonly string[] = ['/'];

/** S2 DELETES THIS and imports `localePath` instead. See the header. */
const EN_PREFIX = '/en';

/**
 * `/` is the one path whose English twin is not `${EN_PREFIX}${path}`.
 *
 * `'/en' + '/'` is `'/en/'`, and `/en/` and `/en` are two URLs for one page --
 * which is the duplicate a canonical exists to resolve, arriving from the file
 * whose job is to prevent it.
 */
function enPath(path: string): string {
  return path === '/' ? EN_PREFIX : `${EN_PREFIX}${path}`;
}

function entry(path: string): MetadataRoute.Sitemap[number] {
  const id = absoluteUrl(path);
  const en = absoluteUrl(enPath(path));
  return {
    url: id,
    lastModified: CONTENT_UPDATED_AT,
    /*
     * `changeFrequency` and `priority` are HINTS Google has said publicly it
     * ignores. They are here because Bing and smaller crawlers still read them
     * and they cost nothing -- not because they do anything for the ranking that
     * matters.
     */
    changeFrequency: 'monthly',
    priority: path === '/' ? 1 : 0.7,
    /*
     * **RECIPROCAL, AND `x-default` IS THE INDONESIAN URL.** `id` is the default
     * and the source language (`## Localization`), so a visitor whose language we
     * do not serve belongs there. A non-reciprocal set is discarded SILENTLY by
     * Google -- the whole set stops working and nothing reports it -- which is why
     * both rows are emitted from one function over one pair.
     */
    alternates: { languages: { id, en, 'x-default': id } },
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_PATHS.flatMap((path) => {
    const both = entry(path);
    return [both, { ...both, url: both.alternates!.languages!.en as string }];
  });
}
```

4. Run green.

```sh
npm test -- sitemap
```

Expected: 6 passing.

5. Verify it parses as XML, which no unit test can tell you.

```sh
npm run build && npm start &
curl -s http://localhost:3001/sitemap.xml | python3 -c \
  'import sys,xml.dom.minidom as m; print(m.parseString(sys.stdin.read()).toprettyxml()[:900])'
# Expect <urlset>, two <url> blocks, and three <xhtml:link rel="alternate"> per block.
pkill -f next-server
```

6. Commit.

```sh
git add src/app/sitemap.ts src/app/sitemap.test.ts
git commit -m "S1: sitemap.xml as a leaf, both locales, with the S2 seam at one constant"
```

---

### Task 8: `src/lib/seo/jsonld.ts` — the three pure builders (S-D16)

**Files**
- Create: `src/lib/seo/jsonld.ts`
- Test: `src/lib/seo/jsonld.test.ts`

**S3, S4 and S6 build on this**, so the exported types are part of the contract:

```ts
export type JsonLdNode = { '@type': string; [key: string]: unknown };
export function organization(a: OrganizationArgs): JsonLdNode;
export function website(a: WebSiteArgs): JsonLdNode;
export function breadcrumbList(items: readonly Crumb[]): JsonLdNode;
export function graph(nodes: readonly JsonLdNode[]): JsonLdNode;   // one @context
export function serializeJsonLd(node: JsonLdNode): string;
```

S3 adds `imageGallery` / `imageObject`, S4 adds `article`, S6 adds `blog` /
`blogPosting`, **each into this file**, each pure, each with a test. Nobody hand-writes
a `<script>`.

**Steps**

1. Write the failing test.

```ts
import { describe, expect, it } from 'vitest';
import {
  breadcrumbList,
  graph,
  organization,
  serializeJsonLd,
  website,
} from './jsonld';

const ORIGIN = 'https://www.jmtarot.site';

describe('organization', () => {
  it('names the operator and the logo, both absolute', () => {
    const o = organization({
      origin: ORIGIN,
      name: 'JMTarot',
      legalName: 'PT Citra Suka Buana',
      logo: '/icon.png',
      description: 'Bacaan tarot Major Arcana bersama tiga pembaca.',
    });
    expect(o['@type']).toBe('Organization');
    expect(o['@id']).toBe(`${ORIGIN}/#organization`);
    expect(o.url).toBe(`${ORIGIN}/`);
    expect(o.logo).toBe(`${ORIGIN}/icon.png`);
    expect(o.legalName).toBe('PT Citra Suka Buana');
  });

  it('omits sameAs rather than emitting an empty array', () => {
    // There are no social accounts. `sameAs: []` is a claim about nothing and
    // Google's validator flags it; an absent field is the honest shape.
    const o = organization({ origin: ORIGIN, name: 'JMTarot', logo: '/icon.png' });
    expect('sameAs' in o).toBe(false);
    expect('legalName' in o).toBe(false);
  });
});

describe('website', () => {
  it('links itself to the organization by @id, not by repeating it', () => {
    const w = website({
      origin: ORIGIN,
      name: 'JMTarot',
      description: 'x',
      inLanguage: 'id-ID',
    });
    expect(w['@type']).toBe('WebSite');
    expect(w['@id']).toBe(`${ORIGIN}/#website`);
    expect(w.publisher).toEqual({ '@id': `${ORIGIN}/#organization` });
    expect(w.inLanguage).toBe('id-ID');
  });

  it('EMITS NO SearchAction, EVER (S-D16)', () => {
    /*
     * There is no site search. Marking up one we do not have is a lie a crawler
     * can check by following the `target` template and getting a 404 -- and the
     * only outcome is that every other claim in our markup is trusted less.
     *
     * Asserted on the serialized string as well as on the object, because the
     * shape somebody reaches for is a nested `potentialAction`.
     */
    const w = website({ origin: ORIGIN, name: 'x', description: 'x', inLanguage: 'id-ID' });
    expect('potentialAction' in w).toBe(false);
    expect(serializeJsonLd(w)).not.toContain('SearchAction');
  });
});

describe('breadcrumbList', () => {
  it('numbers positions from 1', () => {
    const b = breadcrumbList([
      { name: 'JMTarot', url: `${ORIGIN}/` },
      { name: 'Galeri', url: `${ORIGIN}/gallery` },
      { name: 'The Moon', url: `${ORIGIN}/arcana/the-moon` },
    ]);
    expect(b['@type']).toBe('BreadcrumbList');
    const items = b.itemListElement as { position: number; name: string }[];
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items[2].name).toBe('The Moon');
  });

  it('refuses an empty trail', () => {
    // A BreadcrumbList with no items is invalid markup and the caller that
    // produced it has a bug worth failing on rather than shipping.
    expect(() => breadcrumbList([])).toThrow(/at least one/);
  });

  it('refuses a relative url, so a crumb cannot be half-absolute', () => {
    expect(() => breadcrumbList([{ name: 'x', url: '/gallery' }])).toThrow(/absolute/);
  });
});

describe('graph', () => {
  it('carries exactly one @context, at the top', () => {
    // Two nodes each with their own @context is valid and doubles the bytes on
    // the one public route strangers open over mobile data.
    const g = graph([
      organization({ origin: ORIGIN, name: 'x', logo: '/icon.png' }),
      website({ origin: ORIGIN, name: 'x', description: 'x', inLanguage: 'id-ID' }),
    ]);
    expect(g['@context']).toBe('https://schema.org');
    expect((g['@graph'] as unknown[]).length).toBe(2);
    expect(serializeJsonLd(g).match(/@context/g)).toHaveLength(1);
  });
});

describe('serializeJsonLd', () => {
  it('cannot be closed out of its own script tag -- THE CANARY', () => {
    /*
     * `</script>` inside a JSON string ENDS THE SCRIPT ELEMENT as far as the HTML
     * parser is concerned, regardless of the JSON quoting -- the parser does not
     * know it is inside a string. Everything after it is parsed as markup.
     *
     * Every input today is authored or derived, so this is defence in depth. It is
     * here because the day somebody passes an article title through is the day it
     * stops being.
     */
    const s = serializeJsonLd(
      breadcrumbList([{ name: '</script><img src=x onerror=alert(1)>', url: `${ORIGIN}/` }]),
    );
    expect(s).not.toContain('</script');
    expect(s).not.toContain('<img');
    expect(s).toContain('\\u003c');
    // And it is still valid JSON afterwards -- an escape that broke the parse
    // would trade an injection for a silently ignored block.
    expect(JSON.parse(s)['@type']).toBe('BreadcrumbList');
  });

  it('escapes the two line separators that break inline JS', () => {
    // Legal in a JSON string and line terminators in JavaScript, so an unescaped
    // one is a syntax error in an inline block. Written as escapes in the SOURCE
    // of this test too, or the next person's editor eats them.
    const name = 'a\u2028b\u2029c';
    const s = serializeJsonLd(breadcrumbList([{ name, url: `${ORIGIN}/` }]));
    expect(s).not.toMatch(/[\u2028\u2029]/);
    expect(s).toContain('\\u2028');
    expect(s).toContain('\\u2029');
  });
});
```

2. Run and see it fail.

```sh
npm test -- jsonld
```

Expected: `Failed to resolve import "./jsonld"`.

3. Implement.

```ts
/**
 * The structured data this site emits, as pure builders.
 *
 * ── WHY BUILDERS AND NOT LITERALS IN EACH PAGE (S-D16) ──────────────────────
 *
 * Forty-four content pages hand-writing JSON-LD is forty-four chances to emit a
 * node whose `@id` does not match the one the homepage published, and the failure
 * is that Google stops joining the graph and quietly treats every page as an
 * unattributed document. One function per type, one test per function, and a page
 * calls it.
 *
 * **PURE. NO IMPORTS.** No `next/*`, no catalog, no `@/lib/seo/origin` -- the
 * origin arrives as an argument. That is not fussiness: it makes every builder
 * testable with a literal origin, and it keeps the module importable from a
 * client component if a future release ever needs one (nothing does today).
 *
 * ── WHAT WE EMIT, AND THE TWO WE REFUSE ─────────────────────────────────────
 *
 * `Organization` and `WebSite` on `/`; `BreadcrumbList` on every content page.
 * S3 adds `ImageGallery`/`ImageObject`, S4 `Article`, S6 `Blog`/`BlogPosting` --
 * INTO THIS FILE, each pure, each tested.
 *
 * **NO `SearchAction`.** There is no site search, and marking up one we do not
 * have is a lie a crawler can check by following the `target` template into a 404.
 * The cost is not the missing feature; it is that every other claim in our markup
 * is trusted less. There is a test on the serialized string, because the shape
 * somebody reaches for is a nested `potentialAction`.
 *
 * **NO `FAQPage`.** Google restricted FAQ rich results to authoritative
 * government and health sites in August 2023, so the markup buys approximately
 * nothing for us. Q&A *content* on a lore page is still worth writing -- write the
 * content, do not build an architecture around the schema.
 *
 * ── `@id` IS THE JOIN, AND IT ENDS IN A FRAGMENT ────────────────────────────
 *
 * `${origin}/#organization` and `${origin}/#website` are the conventional
 * self-referential ids. Every other node points at them by `@id` rather than
 * repeating the object, which is what makes one `Organization` in the graph rather
 * than forty-four slightly different ones.
 */

export type JsonLdNode = { '@type': string; [key: string]: unknown };

export type Crumb = { name: string; url: string };

export type OrganizationArgs = {
  /** No trailing slash. `siteOrigin()`'s output. */
  origin: string;
  name: string;
  /** Absolute, or a path this function makes absolute. */
  logo: string;
  description?: string;
  /**
   * `PT Citra Suka Buana`, from `src/app/terms/operator.ts`.
   *
   * OPTIONAL, and `/` passes it. The operator's legal name is settled by
   * reconciliation §7.3; the `forum` string in that file is the one still needing
   * confirmation against the deed, and it is not emitted here.
   */
  legalName?: string;
};

export function organization(a: OrganizationArgs): JsonLdNode {
  const node: JsonLdNode = {
    '@type': 'Organization',
    '@id': orgId(a.origin),
    name: a.name,
    url: `${a.origin}/`,
    logo: abs(a.origin, a.logo),
  };
  if (a.description) node.description = a.description;
  if (a.legalName) node.legalName = a.legalName;
  /*
   * `sameAs` IS OMITTED, NOT EMPTIED. There are no social accounts to name, and
   * `sameAs: []` is a claim about nothing that Google's validator flags. Add the
   * field the day there is an account, not before.
   */
  return node;
}

export type WebSiteArgs = {
  origin: string;
  name: string;
  description: string;
  /** `intlTag(locale)`: `id-ID` or `en-GB`. The caller resolves it. */
  inLanguage: string;
};

export function website(a: WebSiteArgs): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': `${a.origin}/#website`,
    name: a.name,
    url: `${a.origin}/`,
    description: a.description,
    inLanguage: a.inLanguage,
    /* By reference. See the header: one Organization in the graph, not forty-four. */
    publisher: { '@id': orgId(a.origin) },
  };
}

/**
 * The trail, positions numbered from 1.
 *
 * THROWS ON AN EMPTY TRAIL AND ON A RELATIVE URL. Both are caller bugs that would
 * otherwise ship as markup Google silently discards -- and a half-absolute
 * breadcrumb is the specific way a page ends up claiming a crumb at a host we do
 * not control.
 */
export function breadcrumbList(items: readonly Crumb[]): JsonLdNode {
  if (items.length === 0) throw new Error('breadcrumbList needs at least one item');
  for (const item of items) {
    if (!/^https?:\/\//.test(item.url)) {
      throw new Error(`breadcrumbList needs an absolute url, got: ${item.url}`);
    }
  }
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** One `@context` over N nodes. Two contexts is valid and doubles the bytes. */
export function graph(nodes: readonly JsonLdNode[]): JsonLdNode {
  return { '@context': 'https://schema.org', '@type': 'ItemList', '@graph': nodes } as JsonLdNode;
}

/**
 * JSON, hardened for an inline `<script>`.
 *
 * **`</script>` INSIDE A JSON STRING ENDS THE SCRIPT ELEMENT.** The HTML parser
 * does not know it is inside a string, so everything after it is parsed as markup.
 * `<` and `>` become `<`/`>`, which JSON.parse turns back into the same
 * characters -- the escape costs nothing and closes the hole. `&` goes too, so an
 * entity cannot be assembled across the boundary.
 *
 * U+2028 and U+2029 are legal in JSON strings and are line terminators in
 * JavaScript, so an unescaped one is a syntax error in an inline block.
 *
 * The order matters and is safe: the `<`/`>` passes emit no `&`, and the `&` pass
 * emits no `<`/`>`.
 */
export function serializeJsonLd(node: JsonLdNode): string {
  return JSON.stringify(node)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function orgId(origin: string): string {
  return `${origin}/#organization`;
}

function abs(origin: string, pathOrUrl: string): string {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${origin}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}
```

4. Run green.

```sh
npm test -- jsonld
```

Expected: 10 passing, including both canaries.

5. Commit.

```sh
git add src/lib/seo/jsonld.ts src/lib/seo/jsonld.test.ts
git commit -m "S1: pure JSON-LD builders, no SearchAction, with a </script> canary"
```

---

### Task 9: `src/components/JsonLd.tsx` — the one injection point, and the CSP argument

**Files**
- Create: `src/components/JsonLd.tsx`
- Test: `src/components/JsonLd.test.ts`

**Steps**

1. Write the failing test. It is a source-level contract test plus a re-assertion of
   the serializer, because rendering JSX is not something this suite does.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(join(process.cwd(), 'src/components/JsonLd.tsx'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the JSON-LD mount', () => {
  it('is a SERVER component -- no directive, no hook', () => {
    /*
     * Structured data is decided entirely on the server and read only by
     * crawlers. A `'use client'` here would ship a hydration bundle for a block
     * nobody interacts with, on the one route strangers open over mobile data --
     * the same argument `Legal.tsx` makes for the terms documents.
     */
    expect(CODE).not.toMatch(/^\s*(['"])use client\1/m);
    expect(CODE).not.toContain('useT(');
  });

  it('serializes through the hardened function and never JSON.stringify', () => {
    // `{JSON.stringify(node)}` as a text child is the version that looks right
    // and is broken twice over: React HTML-escapes text children, so every `"`
    // becomes `&quot;` and the block is invalid JSON; and it does not escape
    // `</script`.
    expect(CODE).toContain('serializeJsonLd');
    expect(CODE).not.toContain('JSON.stringify');
  });

  it('is the ONLY place in src/ that writes an ld+json script tag', () => {
    /*
     * S-D16 has four more node types arriving from S3, S4 and S6. If any of them
     * writes its own `<script>`, the day `script-src` gets a nonce is the day
     * somebody has to find all five.
     */
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(full);
      }
      return out;
    };
    const offenders = walk(join(process.cwd(), 'src'))
      .filter((p) => !p.endsWith(join('components', 'JsonLd.tsx')))
      .filter((p) => readFileSync(p, 'utf8').includes('application/ld+json'));
    expect(offenders).toEqual([]);
  });
});
```

2. Run and see it fail.

```sh
npm test -- JsonLd
```

3. Implement.

```tsx
import { serializeJsonLd, type JsonLdNode } from '@/lib/seo/jsonld';

/**
 * One `<script type="application/ld+json">`, and the only one in the app.
 *
 * ── WHY `dangerouslySetInnerHTML`, AND WHY THAT IS NOT §5 RULE 3's TARGET ────
 *
 * `<script>{JSON.stringify(node)}</script>` is the version that looks right and is
 * broken twice: **React HTML-escapes text children**, so every `"` in the JSON
 * becomes `&quot;` -- and HTML entities are NOT decoded inside a `<script>`, so the
 * block is simply invalid JSON that no crawler parses. `dangerouslySetInnerHTML` is
 * the only way to emit a data block from React, which is why every site on the web
 * does it this way.
 *
 * Roadmap §5 rule 3 says "no `dangerouslySetInnerHTML` anywhere in v0.4.0". Its
 * subject is **authored prose** -- the reason given there is that lore must be a
 * typed block union rather than a string of HTML, so that a content author cannot
 * inject markup. That reason does not reach this file: the input is a plain object
 * built by pure functions from a closed set of fields, and `serializeJsonLd` escapes
 * `<`, `>` and `&` to `\uXXXX` so that a `</script>` in ANY field cannot close the
 * element. There is a canary test. See the S1 plan's `## Flags`.
 *
 * ── AND WHY THIS MAKES TIGHTENING `script-src` EASIER, NOT HARDER ────────────
 *
 * `next.config.ts` ships `script-src 'self' 'unsafe-inline'` in REPORT-ONLY and says
 * the enforced version needs a per-request nonce generated in middleware. **A block
 * whose `type` is not a JavaScript MIME type is a data block, not a script, and is
 * not executed** -- but the safe assumption is that a future strict policy will want
 * a nonce on it anyway.
 *
 * **THAT IS THE WHOLE REASON THIS IS A COMPONENT AND NOT INLINE JSX PER PAGE.** When
 * the nonce lands, it is ONE prop threaded into ONE file, not a hunt across
 * forty-four `generateMetadata` functions. `JsonLd.test.ts` asserts this is the only
 * file in `src/` that writes the tag, so that stays true as S3, S4 and S6 add node
 * types.
 *
 * ── IT IS A SERVER COMPONENT ────────────────────────────────────────────────
 *
 * No `'use client'`. Structured data is decided on the server and read only by
 * crawlers; a hydration bundle for a block nobody interacts with is waste on the one
 * page a stranger reads over mobile data. Same argument `Legal.tsx` makes.
 */
export function JsonLd({ node }: { node: JsonLdNode }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- see the header. The only way to
      // emit a data block from React, and the payload is escaped by construction.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(node) }}
    />
  );
}
```

4. Run green, then typecheck and build.

```sh
npm test -- JsonLd && npm run typecheck
```

5. Commit.

```sh
git add src/components/JsonLd.tsx src/components/JsonLd.test.ts
git commit -m "S1: one JSON-LD mount, so a future script-src nonce is one prop in one file"
```

---

### Task 10: The catalog — S1's chrome keys, `id.ts` first

**Files**
- Modify: `src/lib/i18n/locales/id.ts` (the source catalog — **write this first**)
- Modify: `src/lib/i18n/locales/en.ts` (rewritten, not translated, where it is prose)
- Test: `src/lib/i18n/catalog.test.ts` (existing; may need one `SAME_ON_PURPOSE` entry)

**Steps**

1. Write the Indonesian keys **only**, then run the typecheck and read the error. That
   red is the mechanism (I2), not an obstacle.

```sh
npm run typecheck
```

Expected: `TS2739: Type '{ ... }' is missing the following properties from type
'Record<MessageKey, string>'` naming every key you just added.

2. The key set S1 adds. **Twenty-six keys.** Grouped as `id.ts` groups things, with the
   section comment in the register that file uses.

```ts
  // --- The public surface (v0.4.0 / S1) -------------------------------------
  //
  // CHROME ONLY (S-D6). Lore and article prose live in `src/content/**`, one
  // module per locale, imported by the page that renders it -- because this
  // catalog is shipped ENTIRE, as JSON, to every visitor of every page including
  // the draw screen, and 22 lore documents × 2 locales is an order of magnitude
  // more than the 242 short strings here. `src/lib/i18n/prose.test.ts` makes that
  // mechanical: a value over 320 characters, or a catalog over 20,000 bytes,
  // fails.
  //
  // These are the shared keys. S3, S4, S6 and S5 add their own page's chrome to
  // THIS EDIT (S1 folds them in, one file, one commit) -- see `## Analytics
  // deltas` for the same rule applied to `events.ts`.

  /** The landing hero. `app.title` is the <h1>; this is the line under it. */
  'landing.tagline': 'Dua puluh dua Major Arcana, dibacakan oleh tiga pembaca.',
  'landing.lede':
    'Tarik kartumu, ajukan pertanyaanmu, dan dapatkan satu bacaan yang ditulis khusus untuk hari itu — dalam bahasa Indonesia atau Inggris.',
  'landing.signIn': 'Masuk untuk membaca',
  'landing.hero.alt': 'Kartu {name}',

  /** Three blocks, each one link. The order on screen is the order here. */
  'landing.gallery.title': 'Lihat dua puluh dua kartunya',
  'landing.gallery.body':
    'Setiap Major Arcana, digambar ulang untuk aplikasi ini. Ketuk satu kartu untuk melihatnya besar.',
  'landing.gallery.link': 'Buka galeri',
  'landing.arcana.title': 'Arti setiap kartu',
  'landing.arcana.body':
    'Satu halaman per kartu: angka, unsur, lambang, arti tegak dan terbalik, serta ceritanya.',
  'landing.arcana.link': 'Mulai dari The Moon',
  'landing.readers.title': 'Tiga pembaca, tiga suara',
  'landing.readers.body':
    'Thessaly, Margaret dan Adrian membaca kartu yang sama dengan cara yang tidak sama.',
  'landing.blog.title': 'Tulisan',
  'landing.blog.body': 'Cara membaca tarot, dijelaskan tanpa istilah yang membingungkan.',
  'landing.blog.link': 'Baca tulisannya',

  /** The shared public footer (S1), mounted by every public content page. */
  'public.footer.gallery': 'Galeri',
  'public.footer.arcana': 'Arti kartu',
  'public.footer.blog': 'Tulisan',
  'public.footer.app': 'Buka aplikasinya',
  'public.footer.brandLine': 'JMTarot — bacaan Major Arcana.',
  /** The other-language sibling. S2 supplies the href; this is the label. */
  'public.footer.otherLanguage': 'English',

  /** S-D8's control. NOT `/api/share` -- the page's own URL is already public. */
  'public.share.button': 'Bagikan halaman ini',
  'public.share.copied': 'Tautan disalin.',
  'public.share.failed': 'Tidak bisa menyalin. Salin dari bilah alamat.',

  /** Breadcrumb labels. English card names stay English (`## Card data`). */
  'public.crumb.home': 'JMTarot',
  'public.crumb.gallery': 'Galeri',
  'public.crumb.blog': 'Tulisan',
```

3. Write the English. **Rewritten where it is prose, not translated** (§8.2, and
   `## Localization` rule 3). The enforcement is that a reviewer can see a translation
   in five seconds — so the English lede leads with a different fact than the
   Indonesian one does.

```ts
  'landing.tagline': 'The twenty-two Major Arcana, read aloud by three readers.',
  'landing.lede':
    'Pick your cards, ask what you came to ask, and read one interpretation written for that draw and no other — in English or Indonesian.',
  'landing.signIn': 'Sign in to read',
  'landing.hero.alt': 'The {name} card',

  'landing.gallery.title': 'See all twenty-two',
  'landing.gallery.body':
    'Every Major Arcana, drawn for this app. Tap any card to see it full size.',
  'landing.gallery.link': 'Open the gallery',
  'landing.arcana.title': 'What each card means',
  'landing.arcana.body':
    'One page per card: the numeral, the element, the glyph, upright and reversed, and where the card sits in the sequence.',
  'landing.arcana.link': 'Start with The Moon',
  'landing.readers.title': 'Three readers, three voices',
  'landing.readers.body':
    'Thessaly, Margaret and Adrian read the same three cards and do not say the same thing.',
  'landing.blog.title': 'Writing',
  'landing.blog.body': 'How to read tarot, explained without the vocabulary.',
  'landing.blog.link': 'Read it',

  'public.footer.gallery': 'Gallery',
  'public.footer.arcana': 'Card meanings',
  'public.footer.blog': 'Writing',
  'public.footer.app': 'Open the app',
  'public.footer.brandLine': 'JMTarot — Major Arcana readings.',
  'public.footer.otherLanguage': 'Bahasa Indonesia',

  'public.share.button': 'Share this page',
  'public.share.copied': 'Link copied.',
  'public.share.failed': "Couldn't copy. Take it from the address bar.",

  'public.crumb.home': 'JMTarot',
  'public.crumb.gallery': 'Gallery',
  'public.crumb.blog': 'Writing',
```

4. Run the catalog suite. **Two existing assertions will bite**, and both are correct:

```sh
npm test -- i18n
```

- `has no English value left identical to the Indonesian one` fails on
  `public.crumb.home` (`JMTarot` both sides). Add it to `SAME_ON_PURPOSE` with the
  reason already established for `app.title`: **the brand is not translated.**
- `public.footer.otherLanguage` is `English` in `id.ts` and `Bahasa Indonesia` in
  `en.ts` — different strings, so it passes. That is deliberate and is the same rule
  `locale.name.*` follows: **a language is named in its own language**, because the
  reader of the control cannot read the locale they are currently in.

5. Check the Malay grep and the therapy rule by hand as well as by test — the catalog
   test's word list is not the shared one (see `## Flags`).

```sh
npm test -- catalog
grep -nE 'kerjaya|hala tuju|sembang|awak|tempoh|kerana|iaitu|ianya|manakala|seronok|kelmarin' \
  src/lib/i18n/locales/id.ts
grep -niE 'therap|trauma|heal|diagnos|clinical|inner child|shadow work|nervous system' \
  src/lib/i18n/locales/en.ts
```

Expected: no output from either grep. `menyembuhkan` and `penyembuhan` are the
Indonesian entries — neither appears above.

6. Typecheck and commit.

```sh
npm run typecheck && npm test -- i18n
git add src/lib/i18n/locales/id.ts src/lib/i18n/locales/en.ts src/lib/i18n/catalog.test.ts
git commit -m "S1: 26 chrome keys for the public surface, Indonesian first, English rewritten"
```

---

### Task 11: `PublicShell` and the footer Jodith asked for

**Files**
- Create: `src/components/PublicShell.tsx`, `src/components/PublicShell.module.css`
- Test: `src/components/PublicShell.test.ts`

**The props are the contract. S3, S4 and S6 consume this definition:**

```ts
export type PublicSurface = 'landing' | 'gallery' | 'arcana' | 'blog_index' | 'blog_post';

export type PublicShellProps = {
  /**
   * Which page is mounting it. Decides which cross-link is omitted (a page never
   * links to itself) and is the `from` prop on `public.link_clicked`.
   *
   * A CLOSED UNION AND NOT A PATHNAME -- events rule 2, and V4's `account.opened`
   * is the precedent: the mounting page passes its own, so there is no pathname to
   * parse and no `/arcana/[slug]` to explode into twenty-two values.
   */
  surface: PublicSurface;
  /**
   * The sibling URL in the other language, or null.
   *
   * **A URL, NEVER A LOCALE.** `LocaleProvider`'s header says NO LOCALE PROP IS
   * DRILLED ANYWHERE, and this shell obeys it: it calls `getT()`/`getLocale()`
   * itself, because on a content page the page's language IS what middleware
   * forwarded. The only locale-shaped thing crossing this boundary is an href.
   *
   * `null` until S2 lands, and `null` afterwards for any document with no twin.
   * The control is a REAL `<a href>` and never a POST (§4.2): the sibling URL *is*
   * the other language, and a crawler has to be able to follow it to discover the
   * other locale tree.
   */
  alternate: { href: string; label: 'id' | 'en' } | null;
  children: ReactNode;
};
```

**Steps**

1. Write the failing test.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import id from '@/lib/i18n/locales/id';

const SOURCE = readFileSync(join(process.cwd(), 'src/components/PublicShell.tsx'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('PublicShell', () => {
  it('is a SERVER component with no session and no fetch', () => {
    /*
     * It wraps the routes a stranger reaches first. `currentUser()` here would
     * make every content page's cache key vary by session -- S-D10 -- and a
     * `'use client'` would ship a hydration bundle for a footer.
     */
    expect(CODE).not.toMatch(/^\s*(['"])use client\1/m);
    expect(CODE).not.toContain('currentUser');
    expect(CODE).not.toContain('requireUser');
    expect(CODE).not.toContain('useViewer');
    expect(CODE).not.toContain('fetch(');
    expect(CODE).not.toContain('@/lib/db');
  });

  it('drills no locale prop, and resolves the language itself', () => {
    // LocaleProvider's header: NO LOCALE PROP IS DRILLED ANYWHERE. `alternate`
    // carries an href and a label, which is a URL and not a language choice.
    expect(CODE).toContain('getT');
    expect(CODE).not.toMatch(/locale\s*:\s*Locale/);
  });

  it('carries the entertainment-only disclaimer (§8.3)', () => {
    /*
     * W7's constraint is a disclaimer under every reading and on both pickers.
     * §8.3 extends it to the pages a stranger reaches FIRST, where the legal
     * exposure is higher rather than lower because the reader has no account.
     */
    expect(CODE).toContain("common.disclaimer.short");
  });

  it('uses only keys that exist in the source catalog', () => {
    // A `t()` on a missing key renders THE KEY (I3), on purpose, and on a public
    // page that is a bug report in a search result.
    const used = [...CODE.matchAll(/t\('([a-z][a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(5);
    for (const key of used) expect(Object.keys(id), key).toContain(key);
  });

  it('never links to the page it is mounted on', () => {
    // Cheap source-level check on the mechanism: the footer link list is built by
    // filtering on `surface`, not written out five times.
    expect(CODE).toContain('surface');
    expect(CODE).toMatch(/filter|!==\s*surface|surface\s*!==/);
  });

  it('introduces no new design token', () => {
    // `## Styling`: change `tokens.ts` first, then mirror. Every custom property
    // used here must already exist in `src/theme/tokens.css`.
    const tokens = readFileSync(join(process.cwd(), 'src/theme/tokens.css'), 'utf8');
    const css = readFileSync(
      join(process.cwd(), 'src/components/PublicShell.module.css'),
      'utf8',
    );
    for (const v of [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1])) {
      expect(tokens, v).toContain(v);
    }
  });
});
```

2. Run and see it fail.

```sh
npm test -- PublicShell
```

3. Implement.

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import { TrackLink } from '@/components/TrackLink';
import { getT } from '@/lib/i18n/t';
import styles from './PublicShell.module.css';

/**
 * The frame around every public content page: the brand line, the cross-links,
 * the entertainment-only disclaimer, and the other-language link.
 *
 * ── THE FOOTER IS THE ASK, AND THE CROSS-LINKS ARE THE POINT ────────────────
 *
 * Jodith asked for a footer on the landing, blog and article pages. What makes it
 * worth more than decoration is the internal linking: twenty-two lore pages that
 * each link to the gallery and the blog, and a gallery that links back, is the
 * shape of a site that gets crawled completely. A footer is the cheapest place to
 * guarantee every public page is two clicks from every other.
 *
 * **A PAGE NEVER LINKS TO ITSELF.** `surface` filters the list. A self-link is not
 * harmful to a crawler and it is confusing to a person, and the filter is one line.
 *
 * ── IT IS A SERVER COMPONENT AND IT HAS NO SESSION (S-D10) ──────────────────
 *
 * No `currentUser()`, no `fetch`, no `'use client'`. These are the pages whose
 * TTFB a crawler measures and whose responses must be CDN-cacheable, and both
 * properties die the moment output varies by session. `/s/[slug]`'s page header has
 * the long version of this argument.
 *
 * The one client component below it is `TrackLink`, which V7 and the reader picker
 * already mount and which needs no session.
 *
 * ── NO LOCALE PROP (LocaleProvider's rule) ──────────────────────────────────
 *
 * It calls `getT()` itself. On a content page the page's language IS what
 * middleware forwarded in `x-jmt-locale` -- after S2's rewrite, that is the
 * language the URL prefix names. `alternate` crosses the boundary as an href plus a
 * two-letter label, which is a URL and not a language choice.
 *
 * ── THE SWITCHER IS A LINK, NEVER A POST (§4.2) ─────────────────────────────
 *
 * `LocaleSwitch` POSTs `/api/locale`, which re-mints the session and writes a
 * cookie. On a content page there is often no session, and the mechanism is wrong
 * regardless: **the sibling URL is the other language.** A real `<a href>` is also
 * the only form a crawler follows, which is how the other locale tree gets
 * discovered at all. The accepted cost -- a signed-in reader who switches here is
 * still in the old language inside the app -- is §4.2's, stated so nobody fixes it.
 */

export type PublicSurface = 'landing' | 'gallery' | 'arcana' | 'blog_index' | 'blog_post';

export type PublicShellProps = {
  surface: PublicSurface;
  alternate: { href: string; label: 'id' | 'en' } | null;
  children: ReactNode;
};

/** Which footer link belongs to which surface, so a page can omit its own. */
const LINKS = [
  { surfaces: ['gallery'], href: '/gallery', key: 'public.footer.gallery' },
  { surfaces: ['arcana'], href: '/arcana/the-moon', key: 'public.footer.arcana' },
  { surfaces: ['blog_index', 'blog_post'], href: '/blog', key: 'public.footer.blog' },
] as const;

export async function PublicShell({ surface, alternate, children }: PublicShellProps) {
  const t = await getT();

  return (
    <div className={styles.frame}>
      {children}

      <footer className={styles.footer}>
        <nav className={styles.links} aria-label={t('public.crumb.home')}>
          {LINKS.filter((l) => !(l.surfaces as readonly string[]).includes(surface)).map((l) => (
            <TrackLink
              key={l.href}
              href={l.href}
              className={styles.link}
              name="public.link_clicked"
              props={{ from: surface, to: l.href.startsWith('/arcana') ? 'arcana' : l.href.slice(1), slug: null }}
            >
              {t(l.key)}
            </TrackLink>
          ))}
          {/* The conversion link. `/` is the dual render: a stranger sees the
              landing, a signed-in reader sees the picker, and middleware decides
              -- which is exactly what `TryItYourself` already relies on. */}
          <TrackLink
            href="/"
            className={styles.link}
            name="public.link_clicked"
            props={{ from: surface, to: 'app', slug: null }}
          >
            {t('public.footer.app')}
          </TrackLink>
        </nav>

        {/* S2 supplies the href. A real anchor, never a button. */}
        {alternate ? (
          <a className={styles.language} href={alternate.href} hrefLang={alternate.label}>
            {t('public.footer.otherLanguage')}
          </a>
        ) : null}

        <nav className={styles.legal} aria-label={t('common.terms')}>
          <Link href="/terms">{t('common.terms')}</Link>
          <Link href="/privacy">{t('common.privacy')}</Link>
        </nav>

        <p className={styles.brand}>{t('public.footer.brandLine')}</p>
        {/* §8.3. W7's rule reaches the pages a stranger meets first, where the
            exposure is higher rather than lower because there is no account. */}
        <p className={styles.disclaimer}>{t('common.disclaimer.short')}</p>
      </footer>
    </div>
  );
}
```

4. The CSS. **Every value is an existing token** — no new hex, font size or curve.

```css
/*
 * The public frame. Composed entirely from `src/theme/tokens.css`; `## Styling`
 * requires `tokens.ts` to change first and there was no reason to change it.
 *
 * The link row WRAPS rather than scrolling. Four to six short labels at 320px is
 * two rows and that is fine; a horizontally scrolling footer hides links from a
 * thumb and from a crawler's rendered snapshot. `tools/seo/fit.sh` measures it.
 */
.frame {
  min-height: 100dvh;
  max-width: 520px;
  margin: 0 auto;
  padding: 64px 16px calc(40px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.footer {
  margin-top: auto;
  padding-top: 20px;
  border-top: 1px solid var(--gold-hairline);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.links,
.legal {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 16px;
}

.links a,
.legal a,
.language {
  font-family: var(--font-display), serif;
  font-size: 10px;
  letter-spacing: 2.6px;
  text-transform: uppercase;
  color: var(--gold-pale);
  text-decoration: none;
}

.links a:hover,
.legal a:hover,
.language:hover {
  color: var(--gold-text);
}

.language {
  border: 1px solid var(--gold-border);
  background: var(--gold-wash);
  border-radius: var(--radius-chip);
  padding: 4px 7px;
}

.brand,
.disclaimer {
  font-family: var(--font-body), Georgia, serif;
  font-style: italic;
  font-size: 13px;
  color: var(--faint);
  margin: 0;
}
```

5. Run green.

```sh
npm test -- PublicShell && npm run typecheck
```

6. Commit.

```sh
git add src/components/PublicShell.tsx src/components/PublicShell.module.css src/components/PublicShell.test.ts
git commit -m "S1: the shared public shell and the footer, no session, no new token"
```

---

### Task 12: `PublicShare` — S-D8's control

**Files**
- Create: `src/components/PublicShare.tsx`, `src/components/PublicShare.module.css`
- Test: `src/components/PublicShare.test.ts`
- Modify: `src/lib/clientBoundary.test.ts` (one new fence)

**Steps**

1. Write the failing test — the fence first, because it is the whole reason this
   component takes a `url` prop instead of computing one.

```ts
describe('PublicShare', () => {
  it('takes the URL as a PROP and never builds one', () => {
    /*
     * S-D8: the control shares the canonical URL of the page you are standing on.
     * That URL comes from the server, because `siteOrigin()`'s chain reads
     * `AUTH_URL` and both Vercel variables -- none of which carries a
     * `NEXT_PUBLIC_` prefix, so in a browser bundle they inline as `undefined` and
     * the chain silently collapses to `http://localhost:3001`.
     *
     * That is not hypothetical: `resolve.ts`'s header records
     * `localeSwitcherEnabled()` making exactly this mistake and living in
     * `LocaleSwitch.tsx` for about ten minutes.
     */
    expect(CODE).not.toContain('@/lib/seo/origin');
    expect(CODE).not.toContain('process.env');
    expect(CODE).toContain('url');
  });

  it('never touches /api/share or the share library', () => {
    /*
     * S-D8. Minting a `/s/<slug>` for a page whose URL is ALREADY public and
     * already canonical would manufacture a `noindex` duplicate of a page we are
     * trying to get indexed -- the opposite of this release's purpose -- and would
     * spend a rate-limit budget to do it.
     */
    expect(CODE).not.toContain('/api/share');
    expect(CODE).not.toContain('@/lib/share');
    expect(CODE).not.toContain('SHARE_ENTITIES');
  });

  it('reports which affordance worked, and `manual` when neither did', () => {
    // `share.copied`'s precedent: `navigator.share` is what "send it to WhatsApp"
    // is on a phone, clipboard is the desktop path, and `manual` means the querent
    // was left selecting the address bar. Without the third value the failure is
    // invisible.
    expect(CODE).toContain("'webshare'");
    expect(CODE).toContain("'clipboard'");
    expect(CODE).toContain("'manual'");
    expect(CODE).toContain('public.link_shared');
  });
});
```

2. Add the clientBoundary fence in the same step, so the rule exists before the
   component does.

```ts
  /*
   * S1's Task 12. **`@/lib/seo/origin` READS `AUTH_URL`, `VERCEL_URL` AND
   * `VERCEL_PROJECT_PRODUCTION_URL`, NONE OF WHICH CARRIES A `NEXT_PUBLIC_`
   * PREFIX** -- so a client component calling `siteOrigin()` would silently get
   * `http://localhost:3001` in production and hand a visitor a canonical, a share
   * URL or an `hreflang` pointing at their own machine.
   *
   * Unlike `@/lib/share/links` this module has NO `server-only` marker, on purpose
   * -- it is imported by `robots.ts` and `sitemap.ts`, and `server-only` throws
   * under Vitest for anything `vitest.config.ts` does not alias. So this test is
   * the only fence there is, which makes it stronger than a nicety.
   *
   * `@/lib/seo/jsonld` is deliberately NOT matched: it is pure, takes the origin as
   * an argument, and reads no environment. Same split as `moderation/types.ts`
   * against `blocklist.ts`.
   */
  it('lets no client component import the origin leaf', () => {
    for (const file of CLIENT) {
      const offending = importsOf(file.source).filter((spec) => spec === '@/lib/seo/origin');
      expect({ [file.path]: offending }).toEqual({ [file.path]: [] });
    }
  });
```

3. Run and see both fail.

```sh
npm test -- PublicShare clientBoundary
```

4. Implement.

```tsx
'use client';

import { useState } from 'react';
import { useT } from '@/lib/i18n/LocaleProvider';
import { track } from '@/lib/analytics/track.client';
import type { PublicSurface } from './PublicShell';
import styles from './PublicShare.module.css';

/**
 * Share a public page. **Web Share API, then clipboard, then nothing (S-D8).**
 *
 * ── IT NEVER TOUCHES `/api/share`, AND `SHARE_ENTITIES` IS NOT EXTENDED ─────
 *
 * `src/lib/share/**` mints 60-bit capability URLs for PRIVATE artifacts and
 * requires a session. A lore page's URL is already public and is already its own
 * canonical address, so minting a `/s/<slug>` for it would manufacture a
 * **`noindex` duplicate of a page we are trying to get indexed** -- the exact
 * opposite of this release's purpose -- and would spend a per-user rate-limit
 * budget to do it. No session, no network, no row.
 *
 * ── THE URL IS A PROP, AND THAT IS THE WHOLE DESIGN ─────────────────────────
 *
 * `siteOrigin()`'s chain reads `AUTH_URL`, `VERCEL_PROJECT_PRODUCTION_URL` and
 * `VERCEL_URL`. None carries a `NEXT_PUBLIC_` prefix, so **in this bundle they are
 * `undefined` and the chain collapses to `http://localhost:3001`** -- and the
 * querent shares a link to their own laptop. `resolve.ts`'s header records
 * `localeSwitcherEnabled()` making precisely this mistake. So the server page,
 * which already computed the canonical for its `<link rel="canonical">`, passes the
 * same string down. `clientBoundary.test.ts` fences the import.
 *
 * ── `manual` IS NOT A GAP ───────────────────────────────────────────────────
 *
 * `navigator.share` is unavailable on desktop and `navigator.clipboard` needs a
 * secure context and a user gesture. When both fail the querent is left selecting
 * the address bar, and reporting that honestly is the only way the ratio is ever
 * visible -- `share.copied`'s `method` prop set that precedent.
 */
export function PublicShare({
  url,
  title,
  surface,
  slug,
}: {
  /** The page's canonical, absolute. Computed on the server. */
  url: string;
  /** What a share sheet shows as the title. The page's own <h1> text. */
  title: string;
  surface: PublicSurface;
  slug: string | null;
}) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function onShare() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title, url });
        track('public.link_shared', { from: surface, method: 'webshare', slug });
        return;
      } catch {
        /* A dismissed sheet lands here too, so fall through rather than reporting
           a failure the querent caused on purpose. */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      track('public.link_shared', { from: surface, method: 'clipboard', slug });
    } catch {
      setState('failed');
      track('public.link_shared', { from: surface, method: 'manual', slug });
    }
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.button} onClick={onShare}>
        {t('public.share.button')}
      </button>
      {state !== 'idle' ? (
        <p className={styles.status} role="status" aria-live="polite">
          {t(state === 'copied' ? 'public.share.copied' : 'public.share.failed')}
        </p>
      ) : null}
    </div>
  );
}
```

CSS: one outlined button and one status line, from existing tokens (`--gold-border`,
`--gold-wash`, `--gold-pale`, `--faint`, `--radius-chip`). Same shape as
`PublicShell.module.css`'s `.language`.

5. Run green.

```sh
npm test -- PublicShare clientBoundary && npm run typecheck
```

6. Commit.

```sh
git add src/components/PublicShare.tsx src/components/PublicShare.module.css \
        src/components/PublicShare.test.ts src/lib/clientBoundary.test.ts
git commit -m "S1: the public share control (S-D8) and a fence around the origin leaf"
```

---

### Task 13: `src/app/Landing.tsx` — the signed-out homepage

**Files**
- Create: `src/app/Landing.tsx`, `src/app/Landing.module.css`
- Test: `src/app/Landing.test.ts`
- Modify: `src/components/accountSurface.test.ts` (one denylist entry)

**Why it lives at `src/app/Landing.tsx`.** The house convention is that a
page-specific component sits beside its route — `src/app/history/HistoryBrowser.tsx`,
`src/app/[reader]/[service]/Draw.tsx`. The route folder for `/` is `src/app/` itself,
and `page.module.css` and `error.module.css` are already there. `Landing.tsx` is not a
reserved filename, so it registers no route. **A `src/app/_landing/` folder would also
work and is worse**: CLAUDE.md records that a `_`-prefixed folder registers no route
*and the path falls through to `[reader]/[service]`*, so `/_landing` would 302 to
`/login` as if it were a reader — a harmless but confusing artefact.

**Steps**

1. Write the failing test.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import id from '@/lib/i18n/locales/id';

const SOURCE = readFileSync(join(process.cwd(), 'src/app/Landing.tsx'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('the landing page', () => {
  it('reads the file, so nothing below passes vacuously', () => {
    expect(CODE).toContain('export async function Landing');
    expect(CODE.length).toBeGreaterThan(800);
  });

  it('is a SERVER component that ships no auth, no DB and no model', () => {
    /*
     * Roadmap §10: no database read on any public page, and a public page must not
     * be able to 500 on a database outage BECAUSE THERE IS NO DATABASE ON ITS PATH
     * AT ALL. `currentUser()` is the dispatcher's, in `page.tsx` -- this component
     * is reached only when there is no session, so reading one again would be a
     * second decode that could disagree with the first.
     */
    expect(CODE).not.toMatch(/^\s*(['"])use client\1/m);
    expect(CODE).not.toContain('currentUser');
    expect(CODE).not.toContain('@/lib/db');
    expect(CODE).not.toContain('@/lib/llm');
    expect(CODE).not.toContain('@/lib/prompt');
    expect(CODE).not.toContain('@/lib/translate');
    expect(CODE).not.toContain('@/components/AccountButton');
  });

  it('links to exactly the route table spellings (§3.1)', () => {
    /*
     * THESE THREE PAGES DO NOT EXIST UNTIL S3, S4 AND S6 LAND. That is fine on
     * `main` and NOT fine in production: a homepage linking to three 404s is worse
     * than no homepage. The release ships as one -- see the plan's §0.
     *
     * `/arcana/the-moon` and not `/arcana`: §3.1 makes the bare path a deliberate
     * 404, and S-D4 fixes the slug as the hyphenated English name.
     */
    expect(CODE).toContain('href="/gallery"');
    expect(CODE).toContain('href="/arcana/the-moon"');
    expect(CODE).toContain('href="/blog"');
    // And never a locale-prefixed one: S1 owns no `/en/` link (that is S2's).
    expect(CODE).not.toContain('/en/');
  });

  it('offers a sign-in route to /login and nothing cleverer', () => {
    // A `signIn()` server action here would put @auth/core's provider machinery --
    // and therefore bcryptjs -- into the homepage's module graph. `/login` already
    // owns the one button and ships zero auth JavaScript; link to it.
    expect(CODE).toContain('href="/login"');
    expect(CODE).not.toContain("from '@/lib/auth/auth'");
  });

  it('uses only keys that exist in the source catalog', () => {
    const used = [...CODE.matchAll(/t\('([a-z][a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(10);
    for (const key of used) expect(Object.keys(id), key).toContain(key);
  });

  it('has exactly one <h1>', () => {
    // One page, one H1. Two is the commonest on-page SEO defect and it is
    // invisible in a browser.
    expect([...CODE.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
  });

  it('uses the versioned art helper, not a hand-written /cards path', () => {
    // `cardImage()` appends `?v=3`, which is the whole cache story for art served
    // with `max-age=31536000, immutable` on non-content-hashed filenames.
    expect(CODE).toContain('cardImage');
    expect(CODE).not.toMatch(/["']\/cards\//);
  });

  it('introduces no new design token', () => {
    const tokens = readFileSync(join(process.cwd(), 'src/theme/tokens.css'), 'utf8');
    const css = readFileSync(join(process.cwd(), 'src/app/Landing.module.css'), 'utf8');
    for (const v of [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1])) {
      expect(tokens, v).toContain(v);
    }
  });
});
```

2. Run and see it fail.

```sh
npm test -- Landing
```

3. Implement.

```tsx
import { CARDS } from '@/data/deck';
import { cardImage } from '@/data/deck';
import { Eyebrow } from '@/components/Eyebrow';
import { JsonLd } from '@/components/JsonLd';
import { PublicShell } from '@/components/PublicShell';
import { TrackLink } from '@/components/TrackLink';
import { TrackView } from '@/components/TrackView';
import { OPERATOR } from '@/app/terms/operator';
import { graph, organization, website } from '@/lib/seo/jsonld';
import { siteOrigin } from '@/lib/seo/origin';
import { intlTag } from '@/lib/i18n/locale';
import { getLocale, getT } from '@/lib/i18n/t';
import styles from './Landing.module.css';

/**
 * The homepage a stranger sees, and the first page in this project's history that
 * Google is allowed to index.
 *
 * ── WHY IT EXISTS (S-D5) ────────────────────────────────────────────────────
 *
 * Before this, `/` 302'd to `/login` for anyone with no cookie, so the addressable
 * site was one login form and two `noindex` legal documents. It also closes a
 * blocker CLAUDE.md has carried for two releases: **Google's OAuth branding
 * requirement is an app homepage that is not a login page**, and publishing the
 * consent screen was blocked on exactly that.
 *
 * ── FOUR RULES, ALL OF THEM ROADMAP §10 ─────────────────────────────────────
 *
 * 1. **No session.** `currentUser()` is the dispatcher's, in `page.tsx`. This
 *    component renders only when there is none, and reading one again would be a
 *    second decode that could disagree with the first.
 * 2. **No database, at all.** Not "wrapped in a try" -- absent. A public page must
 *    not be able to 500 on a database outage, and three routes in this app already
 *    carry that bug (`/api/memory/{frequency,summary}`, `/api/persona`); v0.4.0
 *    must not add a fourth.
 * 3. **No model call, ever** (S-D7). This is a session-less public route, so a
 *    model call here is `LLM_WINDOW_CALL_CEILING` with no gate in front of it --
 *    which since V9 is the app's primary abuse control rather than a cost question.
 *    Every word on this page is a catalog key.
 * 4. **Server component, zero client JavaScript except analytics.** `TrackView` and
 *    `TrackLink` are the only client components below here and neither needs a
 *    session. `/login` set the precedent and the reason: the screen a stranger
 *    meets first should work before hydration.
 *
 * ── THE HERO IS EXISTING ART AND NOTHING WAS GENERATED ──────────────────────
 *
 * `cardImage(THE_STAR.slug)`, which appends `?v=3`. **Never a hand-written
 * `/cards/...` path**: `next.config.ts` serves that prefix with
 * `max-age=31536000, immutable` on filenames that are NOT content-hashed, and the
 * `?v=` query is the entire cache-busting story (`deck.ts`'s `ART_VERSION`). A plain
 * `<img>` and not `next/image`, for the reason `AccountCard` records: `next/image`
 * refuses a local `src` carrying a query string unless `images.localPatterns` is
 * configured, and `CardFace` -- which is a client component and would drag
 * `useT()` in here -- uses a plain `<img>` for the same reason.
 *
 * ── THE THREE OUTBOUND LINKS BELONG TO OTHER WORKSTREAMS ────────────────────
 *
 * `/gallery` (S3), `/arcana/the-moon` (S4), `/blog` (S6). They are written here
 * because the route table is S1's contract, and they are 404s until those land.
 * **The release ships as one; S1 must not deploy alone.**
 *
 * The Moon rather than an arbitrary card: it is the highest-volume Major Arcana
 * query in both languages and it is already this codebase's canonical worked
 * example everywhere else.
 */

/** The hero card. The Star -- upright, unambiguous, and the least ominous face
 *  to put in front of somebody who has not decided whether to trust us. */
const HERO = CARDS.find((c) => c.slug === '17_star')!;

export async function Landing() {
  const t = await getT();
  const locale = await getLocale();
  const origin = siteOrigin();

  return (
    <PublicShell surface="landing" alternate={null /* S2 supplies /en */}>
      <TrackView
        name="public.page_viewed"
        props={{ page: 'landing', locale, slug: null, referrer_kind: 'direct' }}
      />

      {/*
        `Organization` + `WebSite`, in ONE `@graph` with ONE `@context` (S-D16).
        No `SearchAction`: there is no site search and marking up one we do not
        have is a lie a crawler can check.

        `legalName` comes from `src/app/terms/operator.ts`, which is the single
        source of truth for it across four legal documents. The `forum` string in
        that file is the one still awaiting confirmation against the deed and is
        deliberately NOT emitted here -- structured data is machine-readable and a
        wrong court in it is worse than no court.
      */}
      <JsonLd
        node={graph([
          organization({
            origin,
            name: t('app.title'),
            legalName: OPERATOR.legalName,
            logo: '/icon.png',
            description: t('meta.description'),
          }),
          website({
            origin,
            name: t('app.title'),
            description: t('meta.description'),
            inLanguage: intlTag(locale),
          }),
        ])}
      />

      <Eyebrow>{t('common.majorArcana')}</Eyebrow>
      <h1 className={styles.title}>{t('app.title')}</h1>
      <p className={styles.tagline}>{t('landing.tagline')}</p>

      <div className={styles.hero}>
        {/* eslint-disable-next-line @next/next/no-img-element -- see the header:
            `cardImage()` carries `?v=` and next/image refuses a local src with a
            query string unless `images.localPatterns` is configured. */}
        <img
          src={cardImage(HERO.slug)}
          alt={t('landing.hero.alt', { name: HERO.name })}
          width={800}
          height={1200}
        />
      </div>

      <p className={styles.lede}>{t('landing.lede')}</p>

      <TrackLink
        href="/login"
        className={styles.cta}
        name="public.link_clicked"
        props={{ from: 'landing', to: 'sign_in', slug: null }}
      >
        {t('landing.signIn')}
      </TrackLink>

      <section className={styles.block}>
        <h2>{t('landing.gallery.title')}</h2>
        <p>{t('landing.gallery.body')}</p>
        <TrackLink
          href="/gallery"
          name="public.link_clicked"
          props={{ from: 'landing', to: 'gallery', slug: null }}
        >
          {t('landing.gallery.link')}
        </TrackLink>
      </section>

      <section className={styles.block}>
        <h2>{t('landing.arcana.title')}</h2>
        <p>{t('landing.arcana.body')}</p>
        <TrackLink
          href="/arcana/the-moon"
          name="public.link_clicked"
          props={{ from: 'landing', to: 'arcana', slug: 'the-moon' }}
        >
          {t('landing.arcana.link')}
        </TrackLink>
      </section>

      <section className={styles.block}>
        <h2>{t('landing.readers.title')}</h2>
        <p>{t('landing.readers.body')}</p>
      </section>

      <section className={styles.block}>
        <h2>{t('landing.blog.title')}</h2>
        <p>{t('landing.blog.body')}</p>
        <TrackLink
          href="/blog"
          name="public.link_clicked"
          props={{ from: 'landing', to: 'blog', slug: null }}
        >
          {t('landing.blog.link')}
        </TrackLink>
      </section>
    </PublicShell>
  );
}
```

4. The CSS. Existing tokens only. The hero is `max-width: 240px` centred with
   `aspect-ratio: 2 / 3` — the deck's true ratio, per `CARD_RATIO`.

5. Add the denylist entry, because "no session here" should be enforced and not merely
   true.

```ts
    const FORBIDDEN = [
      'app/[reader]/[service]/', // THE DRAW SCREEN. See above.
      'app/login/',
      'app/terms/',
      'app/privacy/',
      'app/onboarding/',
      'app/s/', // V7's public share page. Named before it exists.
      'app/Landing.tsx', // S1's signed-out homepage. No session by construction:
                         // `page.tsx` renders it only when `currentUser()` is null,
                         // so an account circle here would be a control with
                         // nothing behind it.
      'app/layout.tsx', // the mount seam is the owning page, never the root layout
    ];
```

6. Run green.

```sh
npm test -- Landing accountSurface && npm run typecheck
```

7. Commit.

```sh
git add src/app/Landing.tsx src/app/Landing.module.css src/app/Landing.test.ts \
        src/components/accountSurface.test.ts
git commit -m "S1: the signed-out landing page, no session, no database, no model"
```

---

### Task 14: `src/app/page.tsx` dual-renders

**Files**
- Modify: `src/app/page.tsx` (add a dispatcher; the picker body moves into a local function, unchanged)
- Test: `src/app/page.contract.test.ts` (create)

**Steps**

1. Write the failing test.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('/ dual render (S-D5)', () => {
  it('branches on currentUser() and on nothing else', () => {
    /*
     * `currentUser()` AND NOT `auth()`: `src/lib/auth/server.ts` is explicit that
     * everything needing "who is this, on the server" goes through it, and
     * `/login` records what happens when two surfaces use two predicates -- a
     * redirect loop with nothing logged.
     *
     * It is DATABASE-FREE (that file says so), which is what makes this branch
     * legal on a public page at all: roadmap §10 forbids a database read on the
     * request-render path of a public route.
     */
    expect(CODE).toContain('currentUser()');
    expect(CODE).not.toContain('auth()');
    expect(CODE).not.toContain('cookies()');
    expect(CODE).toContain('<Landing');
  });

  it('does NOT read the session inside generateMetadata', () => {
    /*
     * The <title>, the description and the canonical must be the same for both
     * arms. A session read there would be a second decode that can disagree with
     * the page's, and it would make the ONE piece of this route that a crawler
     * caches vary by cookie.
     */
    const meta = CODE.slice(CODE.indexOf('generateMetadata'));
    const body = meta.slice(0, meta.indexOf('export default'));
    expect(body).not.toContain('currentUser');
  });

  it('sets a self-referential canonical', () => {
    // Relative, resolved by `metadataBase`. S2 replaces it with S-D15's helper,
    // which adds the hreflang pair -- one line, in this file.
    expect(CODE).toContain('canonical');
  });

  it('keeps the picker arm intact', () => {
    // Byte-for-byte behaviour, asserted on the pieces that would go missing in a
    // careless refactor: the account button with its surface, the frequency line,
    // the three reader banners and the disclaimer.
    expect(CODE).toContain('surface="reader_picker"');
    expect(CODE).toContain('showLanguage={localeSwitcherEnabled()}');
    expect(CODE).toContain('<FrequencyLine />');
    expect(CODE).toContain('READERS.map');
    expect(CODE).toContain("t('common.disclaimer.short')");
  });
});
```

2. Run and see it fail.

```sh
npm test -- page.contract
```

3. Implement. **The picker's JSX is moved, not rewritten** — keep the diff to the new
   dispatcher, the new import lines and one level of indentation.

```tsx
import type { Metadata } from 'next';
import { Landing } from './Landing';
import { currentUser } from '@/lib/auth/server';
/* ...the existing imports, unchanged... */

/**
 * `/` — the one route in this app that renders two different pages (S-D5).
 *
 * Signed out: a static, crawlable landing page. Signed in: the reader picker,
 * exactly as before.
 *
 * ── WHY THE BRANCH IS HERE AND NOT IN THE GATE ──────────────────────────────
 *
 * `gate.ts`'s `decide()` gained one clause -- no session and `pathname === '/'` is
 * `next` -- and `'/'` is deliberately NOT in `isPublic()`, because that function
 * short-circuits above the onboarding check and a half-onboarded querent would land
 * on this picker, which assumes a completed `profiles` row. So the gate lets the
 * request through and this component decides what it means. `gate.test.ts` has the
 * assertion named for that case.
 *
 * `currentUser()` and not `auth()`: `src/lib/auth/server.ts` says everything needing
 * "who is this, on the server" goes through it, and `/login`'s header records what
 * happens when two surfaces use two predicates. **It is DATABASE-FREE**, which is
 * what makes this branch legal on a public route -- roadmap §10 forbids a database
 * read on a public page's render path, and this reads a decoded JWT.
 *
 * ── THIS ROUTE IS DELIBERATELY UNCACHEABLE, AND THAT IS S-D5's PRICE ────────
 *
 * `next.config.ts` gives `/gallery`, `/arcana/*` and `/blog*` a `s-maxage`; it gives
 * `/` nothing. Three independent reasons, and all three would have to be solved
 * together: the output varies by session; middleware writes `jmt_locale` here, and a
 * `Set-Cookie` makes a response uncacheable at the edge whatever `Cache-Control`
 * says; and its LANGUAGE follows D6's chain rather than the URL, because the
 * signed-in arm is an app route where D6 survives (S-D1). The crawler pays a warm
 * `sin1` lambda, which is what `/login` has always cost. The plan's `## Flags` names
 * the design that would fix it.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    /*
     * SESSION-INVARIANT ON PURPOSE. The title, the description and the canonical
     * are the same for both arms -- a session read here would be a second decode
     * that can disagree with the page's, and it would make the one part of this
     * route a crawler caches vary by cookie. There is a test.
     *
     * `title` is absent: the root layout already sets `t('app.title')` and a
     * duplicate here would be the same string twice in a diff.
     *
     * RELATIVE, resolved by `metadataBase` (Task 3). **S2 REPLACES THIS WITH
     * S-D15's `canonicalAndHreflang('/')`**, which adds the reciprocal `id`/`en`/
     * `x-default` set. One line, in this file, and it is the only line S2 owns here.
     */
    alternates: { canonical: '/' },
    description: t('meta.description'),
  };
}

export default async function Home() {
  const user = await currentUser();
  if (!user) return <Landing />;
  return <ReaderPicker />;
}

/**
 * Reader picker — the root screen for a signed-in querent. **UNCHANGED by S1**
 * apart from being given a name.
 *
 * Plain interpolated hrefs. The expo-router trap recorded in CLAUDE.md, where
 * `/${reader.id}` failed typed-route validation and the object form was required,
 * was specific to expo-router's typedRoutes and does not apply here.
 */
async function ReaderPicker() {
  /* ...the entire previous body of `Home()`, verbatim... */
}
```

4. Run green, typecheck, build.

```sh
npm test -- page.contract && npm test && npm run typecheck && npm run build
```

Expected: the build's route list still shows `ƒ /`. **If it shows `●`, something has
made the root layout static and `## Localization` rule 5 has been broken** — that is
the assertion to read the output for.

5. **The check that matters, and no unit test can make it.** Loop 5, both arms.

```sh
tools/e2e/setup.sh                       # idempotent
E2E_BASE=http://localhost:3001 tools/e2e/run.sh launch
tools/e2e/run.sh reset                   # no session
tools/e2e/run.sh goto /
tools/e2e/run.sh text | head -30         # expect the landing's <h1> and tagline
tools/e2e/run.sh eval "document.querySelectorAll('script[type=\"application/ld+json\"]').length"
# 1. And it must PARSE:
tools/e2e/run.sh eval "JSON.parse(document.querySelector('script[type=\"application/ld+json\"]').textContent)['@graph'].map(n=>n['@type']).join()"
# Organization,WebSite
tools/e2e/run.sh login                   # headed WSLg window; the human types
tools/e2e/run.sh goto /
tools/e2e/run.sh text | head -20         # expect the three reader names
```

6. And the cheapest instrument, which is the one §11.2 is built on:

```sh
curl -sD - -o /dev/null http://localhost:3001/ | head -20
# 200. NOT 302. And note whether a Set-Cookie: jmt_locale appears -- it will,
# until S2's cookie guard lands. See `## Deltas requested`.
```

7. Commit.

```sh
git add src/app/page.tsx src/app/page.contract.test.ts
git commit -m "S1: / renders the landing signed out and the picker signed in (S-D5)"
```

---

### Task 15: `tools/seo/fit.sh` — loop 4, committed

**Files**
- Create: `tools/seo/fit.sh`

**Why a committed tool and not a scratch HTML file.** `.gitignore` line 50 is
`public/cards/_*.html`, so every existing width harness is uncommitted and its numbers
survive only in `docs/workstream-notes.md`. The measurement this release needs is run
by six workstreams at three widths, so it is worth committing — and `tools/e2e/chrome.mjs`
already has an `eval` verb, which is loop 4 executed through loop 5's driver. CLAUDE.md
names exactly this technique: *"constraining the element under test plus reading
`scrollWidth > clientWidth` measures overflow at 320/360/390 without needing a viewport
at all."*

**Neither Chrome here gives a phone width** — both floor at ~500px — so a screenshot
that looks like a phone is not one. This is the loop that answers the width question.

**Steps**

1. Write the script.

```sh
#!/usr/bin/env bash
# Loop 4: does a public page fit a phone?
#
# NOT A SCREENSHOT. CLAUDE.md `## How to verify things here`: neither Chrome
# available in this image gives a real phone width -- both floor at ~500px, so
# `--window-size=390` lays out at 500 and merely CROPS. A shot that looks like a
# phone is not one, and that mistake has been made in this project twice.
#
# What this does instead is exact for container-driven layout: constrain the
# element under test to a fixed inline size, then read `scrollWidth` against
# `clientWidth`. No viewport required.
#
# Usage:  tools/seo/fit.sh /gallery
#         tools/seo/fit.sh /                  # the landing
#         E2E_BASE=https://www.jmtarot.site tools/seo/fit.sh /blog
set -euo pipefail

PATHNAME="${1:?usage: tools/seo/fit.sh <path> [selector]}"
SELECTOR="${2:-main, .frame}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$HERE/e2e/run.sh" goto "$PATHNAME"

for WIDTH in 320 360 390; do
  "$HERE/e2e/run.sh" eval "
    (() => {
      const root = document.querySelector('${SELECTOR}');
      if (!root) return 'NO MATCH for ${SELECTOR}';
      const prev = { w: root.style.width, mw: root.style.maxWidth };
      root.style.width = '${WIDTH}px';
      root.style.maxWidth = '${WIDTH}px';
      // Force layout before measuring.
      void root.offsetWidth;
      const over = [];
      for (const el of root.querySelectorAll('*')) {
        if (el.scrollWidth > el.clientWidth + 1) {
          over.push(el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '')
            + ' ' + el.scrollWidth + '>' + el.clientWidth);
        }
      }
      const rootOver = root.scrollWidth > root.clientWidth + 1;
      root.style.width = prev.w; root.style.maxWidth = prev.mw;
      return JSON.stringify({ width: ${WIDTH}, rootOverflows: rootOver, offenders: over.slice(0, 8) });
    })()
  "
done
```

2. Make it executable and run it against the landing and a page mounting the shell.

```sh
chmod +x tools/seo/fit.sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run dev &
tools/e2e/setup.sh
E2E_BASE=http://localhost:3001 tools/e2e/run.sh launch
tools/seo/fit.sh /
```

Expected at all three widths: `{"width":320,"rootOverflows":false,"offenders":[]}`.

**The two things that will actually overflow**, so look for them by name:
- `.links` in the footer, if `flex-wrap` is missing — it is present, and this is the
  assertion that keeps it there.
- The hero `<img>`, if `max-width: 100%` is missing. The card is declared at
  `width={800}`.

3. Record the numbers in `docs/workstream-notes.md` (Task 22), because a gitignored
   measurement is a measurement nobody can reproduce.

4. Commit.

```sh
git add tools/seo/fit.sh
git commit -m "S1: a committed loop-4 width check, because neither Chrome here gives a phone width"
```

---

### Task 16: Cache headers in `next.config.ts` (S-D10, S-D12)

**Files**
- Modify: `next.config.ts` (new entries, after `/(.*)` and before `/s/:path*`)
- Test: `src/lib/headers.test.ts` (new cases; **both `/s/` assertions must still pass**)

**Read S-D12 before writing a line.** Next applies **every** matching `headers()` entry
and a later one with the same key wins. `/s/:path*` sits after `/(.*)` on purpose so
`referrer-policy: no-referrer` overrides the global value there, and `headers.test.ts`
asserts that ordering because reversing the two is a silent no-op that reads as correct.

**The new entries carry `cache-control` and NOTHING ELSE.** In particular no
`x-robots-tag`: an entry with that key matching broadly would silently `noindex` the
whole site, and this test file is the only thing that would notice.

**Steps**

1. Write the failing tests.

```ts
describe('the content cache rules (S1, S-D10)', () => {
  const CONTENT = 'public, s-maxage=3600, stale-while-revalidate=86400';

  async function ruleFor(source: string) {
    return (await rules()).find((r) => r.source === source);
  }

  it('caches every session-invariant content route, in both locales', async () => {
    for (const source of [
      '/gallery',
      '/en/gallery',
      '/arcana/:slug',
      '/en/arcana/:slug',
      '/blog',
      '/en/blog',
      '/blog/:slug',
      '/en/blog/:slug',
    ]) {
      const rule = await ruleFor(source);
      expect(rule, source).toBeDefined();
      expect(rule!.headers).toEqual([{ key: 'cache-control', value: CONTENT }]);
    }
  });

  it('gives / NO cache entry, and that is S-D5s price', async () => {
    /*
     * `/` dual-renders by session, middleware writes `jmt_locale` on it (so the
     * response carries a Set-Cookie and is uncacheable at the edge regardless), and
     * its LANGUAGE follows D6's chain rather than the URL because the signed-in arm
     * is an app route. A shared CDN entry would serve the landing to a signed-in
     * user or the picker to a stranger.
     *
     * Asserted as an ABSENCE, because the tempting edit is to add `/` to the list
     * above and it would look symmetrical.
     */
    expect(await ruleFor('/')).toBeUndefined();
    expect(await ruleFor('/en')).toBeUndefined();
  });

  it('carries cache-control and NOTHING else on those entries (S-D12)', async () => {
    /*
     * An entry carrying `x-robots-tag` that matched broadly would silently
     * `noindex` the whole site, and this file is the only thing that would notice.
     * A `referrer-policy` here would fight `/s/`'s override.
     */
    for (const rule of await rules()) {
      if (rule.source.startsWith('/s/') || rule.source === '/(.*)') continue;
      const keys = rule.headers.map((h) => h.key);
      expect({ [rule.source]: keys }).toEqual({ [rule.source]: ['cache-control'] });
    }
  });

  it('serves /wallpapers/* immutably, on its own entry (S-D9)', async () => {
    /*
     * S5 declares this and S1 writes it. **A NEW ASSET CLASS GETS ITS OWN ENTRY**
     * rather than joining `/cards/*`, so its lifecycle can change independently --
     * and the caveat `/cards/*` records applies here too and is worse, because a
     * wallpaper is something somebody DOWNLOADED: the filenames are not
     * content-hashed, so regenerating means changing the filenames or shortening
     * this header first.
     */
    const rule = await ruleFor('/wallpapers/:path*');
    expect(rule?.headers).toEqual([
      { key: 'cache-control', value: 'public, max-age=31536000, immutable' },
    ]);
  });

  it('adds every new entry AFTER the catch-all (S-D12)', async () => {
    const all = await rules();
    const security = all.findIndex((r) => r.headers.some((h) => h.key === 'x-frame-options'));
    for (const source of ['/gallery', '/wallpapers/:path*']) {
      expect(all.findIndex((r) => r.source === source), source).toBeGreaterThan(security);
    }
  });

  it('leaves /s/ exactly as V7 left it', async () => {
    /*
     * Restated from S1's side, because this release adds five entries to a file
     * whose ordering is load-bearing and whose most important property is that
     * `noindex` does NOT spread.
     */
    const share = (await rules()).find((r) => r.headers.some((h) => h.key === 'x-robots-tag'))!;
    expect(share.source).toBe('/s/:path*');
    const h = Object.fromEntries(share.headers.map((x) => [x.key, x.value]));
    expect(h['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    expect(h['referrer-policy']).toBe('no-referrer');
    // And no CONTENT route acquired an x-robots-tag by accident.
    const tagged = (await rules()).filter((r) => r.headers.some((h2) => h2.key === 'x-robots-tag'));
    expect(tagged.map((r) => r.source)).toEqual(['/s/:path*']);
  });
});
```

2. Run and see it fail.

```sh
npm test -- headers
```

Expected: the four new blocks fail; **all thirteen pre-existing assertions pass.**

3. Implement. Insert between the `/(.*)` block and the `/s/:path*` block.

```ts
      /*
       * ── v0.4.0 / S1. THE CONTENT ROUTES ARE CDN-CACHEABLE (S-D10) ──────────
       *
       * These are the pages whose TTFB a crawler measures, and they are
       * session-invariant by construction: `PublicShell` calls no `currentUser()`,
       * `ReadingView` is not mounted, and after S2's rewrite the LANGUAGE comes
       * from the URL prefix rather than from a cookie. That last property is what
       * makes an edge cache correct rather than merely fast -- **a page whose
       * language depends on the visitor's cookie cannot be cached and cannot be
       * canonicalised** (§4.1).
       *
       * `s-maxage` and not `max-age`: the shared cache holds it for an hour, the
       * browser revalidates. `stale-while-revalidate=86400` means a crawler after
       * the hour is up gets the stale copy immediately and the refresh happens
       * behind it, which is the whole point on a Hobby lambda in `sin1`.
       *
       * **NO `x-robots-tag` ON ANY OF THESE, AND THAT IS S-D12.** Next applies
       * every matching entry and a later one with the same key wins, so a
       * broadly-matching entry carrying that header would silently `noindex` the
       * site. `headers.test.ts` asserts these entries carry `cache-control` and
       * nothing else, and that `/s/:path*` is the only entry in the file with an
       * `x-robots-tag`.
       *
       * **`/` AND `/en` ARE DELIBERATELY ABSENT.** `/` dual-renders by session
       * (S-D5), middleware writes `jmt_locale` on it -- and a `Set-Cookie` makes a
       * response uncacheable at the edge whatever this header says -- and its
       * language follows D6's chain because the signed-in arm is an app route
       * (S-D1). All three would have to be solved together. The test asserts the
       * absence, because adding `/` here would look symmetrical.
       *
       * **BOTH LOCALES ARE LISTED, AND THAT IS NOT REDUNDANT.** Next's `headers()`
       * matches the INCOMING request path, before middleware's rewrite -- ordering
       * is headers → redirects → middleware → rewrites -- so `/en/gallery` never
       * matches `/gallery`. Verified on the wire in step 5, not assumed.
       */
      { source: '/gallery', headers: CONTENT_CACHE },
      { source: '/en/gallery', headers: CONTENT_CACHE },
      { source: '/arcana/:slug', headers: CONTENT_CACHE },
      { source: '/en/arcana/:slug', headers: CONTENT_CACHE },
      { source: '/blog', headers: CONTENT_CACHE },
      { source: '/en/blog', headers: CONTENT_CACHE },
      { source: '/blog/:slug', headers: CONTENT_CACHE },
      { source: '/en/blog/:slug', headers: CONTENT_CACHE },
      {
        /*
         * S5's asset class, declared in its plan and written here (§6.4).
         *
         * ITS OWN ENTRY RATHER THAN JOINING `/cards/*` (S-D9), so the two
         * lifecycles can diverge -- and the caveat `/cards/*` records is WORSE
         * here, because a wallpaper is a file somebody chose to download: these
         * filenames are not content-hashed either, so regenerating means changing
         * the filenames or shortening this header first. The source art is never
         * regenerated in v0.4.0, which is what makes a year safe today.
         */
        source: '/wallpapers/:path*',
        headers: [{ key: 'cache-control', value: 'public, max-age=31536000, immutable' }],
      },
```

with, above `nextConfig`:

```ts
/**
 * One hour at the edge, a day of stale-while-revalidate.
 *
 * A CONSTANT because eight entries share it and eight hand-typed copies is eight
 * chances for one to say `s-maxage=360`. `headers.test.ts` asserts the value.
 */
const CONTENT_CACHE = [
  { key: 'cache-control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' },
];
```

4. Run green.

```sh
npm test -- headers
```

5. **Verify on the wire. THIS IS THE STEP MOST LIKELY TO FAIL, and the plan is honest
   about it rather than assuming.** Next sets its own `Cache-Control` for dynamic
   routes, and the root layout is dynamic — so a config-level `cache-control` may lose.

```sh
npm run build && npm start &
# `/` -- expect Next's dynamic default, NOT ours:
curl -sD - -o /dev/null http://localhost:3001/          | grep -i '^cache-control'
# A route that exists today and is in the list once S3 lands. Until then, prove the
# MECHANISM on a path that does exist by temporarily pointing one entry at /terms:
curl -sD - -o /dev/null http://localhost:3001/terms     | grep -i '^cache-control'
# And that /s/ is untouched:
curl -sD - -o /dev/null http://localhost:3001/s/abcdefghjkmn | grep -iE 'robots|referrer'
pkill -f next-server    # NOT `pkill -f "next start"` -- the process renames itself
```

**If Next's dynamic `Cache-Control` wins**, the config entries are inert and this task
is not done. Three fallbacks, in order of preference, and **none of them is "give up
and leave the inert entries in place"**:

1. Set the header in **middleware** on the content routes (S2's file — `## Deltas
   requested` names it), which runs after `headers()` and can write on the response.
2. `export const dynamic = 'force-static'` on the content pages — **impossible while
   the root layout awaits `getLocale()`**, and S-D10 already rejected multiple root
   layouts. Recorded so it is not re-proposed.
3. Ship without edge caching and record it as open. A crawler on a warm `sin1` lambda
   is the status quo, not a regression.

Whichever happens, write the measured `cache-control` values into
`docs/workstream-notes.md`. **A cache header nobody curled is a cache header nobody
has.**

6. Commit.

```sh
git add next.config.ts src/lib/headers.test.ts
git commit -m "S1: CDN cache headers for the content routes and /wallpapers, / deliberately excluded"
```

---

### Task 17: `events.ts` — the v0.4.0 taxonomy, in one edit (S-D13)

**Files**
- Modify: `src/lib/analytics/events.ts` (`EVENT_NAMES` and `EventMap`)
- Test: `src/lib/analytics/events.test.ts` (the count) + `npm run typecheck` (the two guards)

**S1 is the only workstream that touches this file.** Every other plan declares its
events in its own `## Analytics deltas` and S1 folds them in here. Five names go in;
`locale.changed`'s prop shape widens by one union member. **61 → 66.**

**Steps**

1. Update the count assertion first and watch it fail.

```sh
npm test -- events
```

Then change the expected count to 66 and re-run — it fails with 61, which is the
failing test.

2. Add the names. One block, at the end of the domain list, before
   `// — the app shell —`.

```ts
  // — the public content surface (v0.4.0) —
  'public.page_viewed',
  'public.link_clicked',
  'public.link_shared',
  'public.card_zoomed',
  'wallpaper.downloaded',
```

3. Add the prop shapes.

```ts
  /*
   * ── v0.4.0's FIVE, AND WHY THERE ARE FIVE RATHER THAN FIFTEEN ──────────────
   *
   * Rule 4: prefer one event with props over five events. Six workstreams are
   * shipping public pages simultaneously, and the version where each declares its
   * own `gallery.viewed` / `arcana.viewed` / `blog.viewed` gives
   * `where name like 'public.%'` five sevenths of the surface and makes "how do
   * people move through the content?" a five-way union. So `page` is a prop.
   *
   * **`slug` IS A CLOSED SET AND THEREFORE NOT FREE TEXT.** Rules 1 and 2 together
   * are what make this legal: the value space is 22 card slugs (S-D4's table, §3.2)
   * plus a handful of article slugs, all of them committed source. It is emphatically
   * NOT a search query, a referrer, a title or a heading -- `events` rows SURVIVE
   * ACCOUNT ERASURE with `user_id` nulled, and that is only honest because there is
   * provably nothing identifying in them.
   *
   * **EVERY ONE OF THESE FIRES WITH A NULL `user_id`**, exactly like `terms.viewed`
   * and `share.viewed`: the public pages have no session by construction (S-D10) and
   * `/api/events` is already public for this reason, so no route change is needed.
   *
   * `locale` is the CLOSED two-value set, as a string because this file has no
   * imports by design -- `moderation.refused.category` set that precedent. It is the
   * language the PAGE was rendered in, which after S2's rewrite is the language the
   * URL prefix names, and it is the number that answers the release's own question:
   * §1 says Indonesian is the priority and English is upside, and this is how we find
   * out whether that was right.
   */
  'public.page_viewed':        { page: 'landing' | 'gallery' | 'arcana' | 'blog_index' | 'blog_post';
                                 locale: string; slug: string | null;
                                 referrer_kind: 'direct' | 'internal' | 'external' };

  /*
   * `to` IS A DESTINATION CLASS, NOT AN HREF. An href is a URL and therefore
   * unbounded (rule 2), and the interesting question is which of six destinations a
   * reader chose -- `sign_in` against `gallery` against `arcana` is the funnel.
   *
   * `to: 'sign_in'` IS THE CONVERSION AND IS THE ONLY NUMBER IN THIS RELEASE THAT
   * MEASURES WHETHER IT WORKED. Forty-four indexable pages that nobody signs in from
   * is a different outcome from forty-four pages nobody visits, and without this prop
   * the two look identical.
   */
  'public.link_clicked':       { from: 'landing' | 'gallery' | 'arcana' | 'blog_index' | 'blog_post' | 'footer';
                                 to: 'sign_in' | 'app' | 'gallery' | 'arcana' | 'blog' | 'terms' | 'privacy' | 'wallpaper' | 'locale';
                                 slug: string | null };

  /*
   * S-D8's control. **A DIFFERENT NAME FROM `share.copied`, AND NOT BY PREFERENCE.**
   * `share.copied` requires a `share_id`, and S-D8's control mints no `share_links`
   * row at all -- it shares the canonical URL of a page that is already public. There
   * is no id to send, and reusing the name would put a null in a prop every existing
   * query treats as present.
   *
   * `method` is `share.copied`'s union verbatim, for its reason: `webshare` is what
   * "send it to WhatsApp" is on a phone, `clipboard` is the desktop path, and
   * `manual` means both failed and the reader was left selecting the address bar.
   * Without the third value that failure is invisible.
   */
  'public.link_shared':        { from: 'landing' | 'gallery' | 'arcana' | 'blog_index' | 'blog_post';
                                 method: 'clipboard' | 'webshare' | 'manual';
                                 slug: string | null };

  /*
   * S3 fires it, S1 declares it (S-D13). `card_id` is the INTEGER and never the name
   * (rule 3): display names are translated and the data must not be.
   *
   * `surface` is a closed union with one member today. It is here rather than implied
   * by the name because the draw screen's `draw.card_detail_opened` is the same
   * gesture on a different page, and the day somebody wants both in one query the prop
   * is what makes it possible without renaming an event.
   */
  'public.card_zoomed':        { card_id: number; surface: 'gallery' | 'arcana' };

  /*
   * S5 fires it, S1 declares it. `variant` is the closed set S5's pipeline produces,
   * and `card_id` is the integer.
   *
   * NO FILENAME, NO BYTE COUNT AND NO USER AGENT. A filename is derivable from
   * `(card_id, variant)`, a byte count is a fact about the pipeline rather than about
   * a person's choice, and a user agent is free text with unbounded cardinality --
   * rules 1 and 2 together. If "which variant do phones take" is ever the question,
   * the honest answer is a second closed prop, not a UA string.
   */
  'wallpaper.downloaded':      { card_id: number; variant: 'native' | 'phone' };
```

4. Widen `locale.changed` — **S2 needs this and must not edit this file for it.**

```ts
  /*
   * `surface` GAINED `'content'` IN v0.4.0 (S2's switcher-as-link, §4.2).
   *
   * A content page's switcher is an `<a href>` to the sibling URL and does NOT
   * `POST /api/locale`, because there is often no session and because the sibling
   * URL *is* the other language -- so this event fires from a navigation rather than
   * from a write, and separating it from `'settings'` is what stops the two being
   * averaged into one meaningless rate.
   */
  'locale.changed':            { from: string; to: string;
                                 surface: 'settings' | 'onboarding' | 'auto' | 'content' };
```

5. Run green. **The two exhaustiveness guards are types, so `typecheck` is their test.**

```sh
npm test -- events && npm run typecheck
```

Expected: `EVENT_NAMES.length === 66`; no TS error. A name in `EVENT_NAMES` with no
prop shape is a `never` nobody notices, and an `EventMap` key not in the array compiles
fine and produces an event the collector silently drops — both guards catch those.

6. Commit.

```sh
git add src/lib/analytics/events.ts src/lib/analytics/events.test.ts
git commit -m "S1: five public-surface events and one widened union, 61 -> 66 (S-D13)"
```

---

### Task 18: The copy lint over `src/content/**` (§11.4)

**Files**
- Create: `src/content/copy.test.ts`

**The word lists already exist and must not be copied.** §11.4 says "reusing the
existing word lists rather than copying them" and assumes the extraction is still owed.
**It is not: `src/lib/copy/vocab.ts` exists** and exports `MALAY`, `THERAPY_ID`,
`THERAPY_EN` and `EN_TICS`, with no `server-only` marker precisely so scripts and tests
can import it. This test imports it. See `## Flags` for the two files that still carry
inline copies and why S1 does not merge them.

**The test must bind before any content exists**, which is the whole difficulty: S4 and
S6 write the documents and S1 lands first. So the machinery is proven by a **negative
control on the checker itself** — a synthetic document containing a Malay word and a
therapy word, which the checker must report. Same shape as `clientBoundary.test.ts`'s
*"found the client components, so the test is not vacuously passing"*, except the
fixture is inline.

**Steps**

1. Write the test.

```ts
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EN_TICS, MALAY, THERAPY_EN, THERAPY_ID } from '@/lib/copy/vocab';

/**
 * The copy constraints, applied to STATIC content (§11.4).
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * The Malay grep and the therapy list run in `npm run smoke -- --all`, against
 * GENERATED readings. Static content is not generated, so nothing checked it -- and
 * it is the copy a stranger reads FIRST and the copy that is PERMANENT. A reading
 * with a Malay word in it is one reading; a lore page with one is a sentence in
 * Google's index for as long as the page exists.
 *
 * ── THE LISTS ARE IMPORTED, NEVER COPIED ────────────────────────────────────
 *
 * `src/lib/copy/vocab.ts` already holds all four. Its header records why it has no
 * `server-only` marker (scripts import it) and why `anxiety` is deliberately absent
 * from both therapy lists -- "that low-grade anxiety before you send the text" is
 * legitimate in Adrian's voice and the rule is against DIAGNOSIS, which is why
 * `anxiety disorder`, `clinical` and `diagnosed` are the entries that are there.
 *
 * ── IT BINDS BEFORE THERE IS ANY CONTENT, AND THAT IS DELIBERATE ────────────
 *
 * S1 lands first; S4 writes 44 lore documents and S6 writes the articles. A test
 * that silently passes on an empty directory is a test nobody notices has stopped
 * working, so the checker is proven against a SYNTHETIC document that must be
 * rejected. The real files start being checked the moment the first one lands, with
 * no further edit.
 *
 * ── STRING LITERALS ONLY, NOT THE WHOLE SOURCE ──────────────────────────────
 *
 * Matching the raw file would fire on identifiers and on comments -- and a rule that
 * fires on prose describing the rule is a rule people delete
 * (`queries/contract.test.ts` records that lesson twice). So comments are stripped
 * and only quoted strings and template literals are searched.
 *
 * WHEN `src/content/types.ts` LANDS, importing the registry and walking the typed
 * block union is strictly better than this regex -- it cannot miss a string and
 * cannot false-positive on an identifier. That is S4's improvement to make; this
 * shape is what is available before the type exists.
 */

const CONTENT = join(process.cwd(), 'src', 'content');

/** Every quoted string and template literal in a module, comments removed. */
function stringsIn(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? '',
  );
}

type Doc = { path: string; locale: 'id' | 'en'; strings: string[] };

/** The forbidden words for a document, by its locale. */
function forbidden(locale: 'id' | 'en'): readonly string[] {
  return locale === 'id'
    ? [...MALAY, ...THERAPY_ID]
    : // The Malay grep is `id`-ONLY (`## Localization` rule 4): `kerana` is not a
      // risk in English and running it there is theatre. The English half has its
      // own tic list instead, and it is longer -- English tarot writing is
      // saturated with that vocabulary in a way Indonesian is not.
      [...THERAPY_EN, ...EN_TICS];
}

function violations(doc: Doc): string[] {
  const found: string[] = [];
  for (const word of forbidden(doc.locale)) {
    // Word-bounded and case-insensitive, exactly as `smoke-llm.ts` matches. The
    // apostrophe class is for `soul's journey` against a curly quote.
    const re = new RegExp(`\\b${word.replace(/'/g, "['’]")}\\b`, 'i');
    for (const s of doc.strings) if (re.test(s)) found.push(`${word} in "${s.slice(0, 60)}"`);
  }
  return found;
}

function docs(): Doc[] {
  if (!existsSync(CONTENT)) return [];
  const out: Doc[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.ts$/.test(entry) || /\.test\.ts$/.test(entry)) continue;
      if (entry === 'index.ts' || entry === 'types.ts') continue;
      const m = /\.(id|en)\.ts$/.exec(entry);
      if (!m) continue; // reported by the naming test below
      out.push({
        path: full.slice(process.cwd().length + 1),
        locale: m[1] as 'id' | 'en',
        strings: stringsIn(readFileSync(full, 'utf8')),
      });
    }
  };
  walk(CONTENT);
  return out;
}

describe('the content copy lint', () => {
  it('REJECTS a synthetic document, so it is never vacuously passing', () => {
    /*
     * The negative control on the checker, and the only assertion in this file
     * that does any work before S4 and S6 land. If the extraction, the regex or
     * the locale split ever breaks, this fails -- rather than the whole file
     * quietly reporting that 44 documents are clean.
     */
    const bad: Doc = {
      path: 'synthetic.id.ts',
      locale: 'id',
      strings: ['Kartu ini bicara soal kerjaya kamu.', 'Ini bukan terapi.'],
    };
    expect(violations(bad)).toHaveLength(2);

    const badEn: Doc = {
      path: 'synthetic.en.ts',
      locale: 'en',
      strings: ['Dear one, this card is about healing.', 'kerana'],
    };
    // Two English hits -- `dear one` and `healing`. `kerana` must NOT fire: the
    // Malay grep is `id`-only, and running it against English is theatre.
    expect(violations(badEn)).toHaveLength(2);
  });

  it('names every document by locale, so none can escape the lint', () => {
    /*
     * §5's convention is `the-moon.id.ts` / `the-moon.en.ts`, and the lint derives
     * the locale from the filename -- so a file named `the-moon.ts` would be
     * skipped silently. Assert the convention rather than trusting it.
     */
    if (!existsSync(CONTENT)) return;
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        if (statSync(full).isDirectory()) walk(full, out);
        else out.push(full.slice(process.cwd().length + 1));
      }
      return out;
    };
    const stray = walk(CONTENT).filter(
      (p) =>
        /\.tsx?$/.test(p) &&
        !/\.test\.tsx?$/.test(p) &&
        !/\/(index|types)\.ts$/.test(p) &&
        !/\.(id|en)\.ts$/.test(p),
    );
    expect(stray).toEqual([]);
  });

  it('has no forbidden word in any authored document', () => {
    for (const doc of docs()) {
      expect({ [doc.path]: violations(doc) }).toEqual({ [doc.path]: [] });
    }
  });

  it('spells card names in English, in both locales', () => {
    /*
     * `## Card data`: a reading refers to The Moon, and a lore page that calls it
     * anything else contradicts the reading the app just gave. V2's translator
     * learned this mechanically -- the prompt rule alone produced "Pulan" -- and
     * static content deserves the same check.
     *
     * Asserted as an ABSENCE of the invented forms rather than a presence of the
     * right one, because a lore page legitimately may not name every card.
     */
    for (const doc of docs()) {
      const joined = doc.strings.join(' ');
      for (const invented of ['Pulan', 'Bulan Tarot', 'Sang Bulan', 'Kartu Bulan']) {
        expect({ [doc.path]: joined.includes(invented) }).toEqual({ [doc.path]: false });
      }
    }
  });
});
```

2. Run it.

```sh
npm test -- content/copy
```

Expected: 4 passing — the negative control does the work; the other three pass over an
empty (or absent) `src/content/`.

3. Commit.

```sh
git add src/content/copy.test.ts
git commit -m "S1: the copy lint for src/content, negative-controlled, reusing vocab.ts"
```

---

### Task 19: The "no prose in the catalog" guard (§11.4, S-D6)

**Files**
- Create: `src/lib/i18n/prose.test.ts`

**A separate file, not an addition to `catalog.test.ts`**, so S1's edit does not conflict
with any other workstream touching that file. The numbers are **measured, not guessed**:
today's longest value is `onboarding.intro.body` at **269** characters and each catalog
serializes to **~14.3KB**.

**Steps**

1. Write the test.

```ts
import { describe, expect, it } from 'vitest';
import en from './locales/en';
import id from './locales/id';
import type { MessageKey } from './locales/id';

/**
 * S-D6, made mechanical.
 *
 * ── WHY A LENGTH RULE IS THE RIGHT SHAPE ────────────────────────────────────
 *
 * **THE CLIENT IS SHIPPED EXACTLY ONE CATALOG, ENTIRE, AS JSON, ON EVERY FULL PAGE
 * LOAD** (I9, and `LocaleProvider`'s header says so). That is fine at 242 short
 * strings and it is the reason twenty-two lore documents may never live here: they
 * would reach every visitor of every page, including the draw screen, for a page
 * that renders none of them.
 *
 * S-D6 is the kind of rule that decays -- somebody pastes one paragraph in because
 * it is "basically chrome", and the next person has precedent. Two ceilings make it
 * mechanical.
 *
 * ── BOTH NUMBERS ARE MEASURED, AND THEY ARE CEILINGS RATHER THAN TARGETS ────
 *
 * Measured 2026-07-28 at 242 keys: the longest value is `onboarding.intro.body` at
 * 269 characters, and `id` serializes to 14,326 bytes (`en` 14,066).
 *
 *   MAX_VALUE  320    269 plus headroom. Catches a pasted paragraph.
 *   MAX_BYTES  20000  ~40% headroom. **This is the load-bearing one**, because the
 *                     per-value ceiling alone would let 44 documents of 320
 *                     characters in and double the payload.
 *
 * TIGHTENED WHEN THE CATALOG SHRINKS, NEVER WIDENED WITHOUT A WRITTEN REASON --
 * `LENGTH_BUDGET`'s rule, for the same reason: a ceiling raised on one inconvenient
 * commit is not a ceiling.
 */

const MAX_VALUE = 320;
const MAX_BYTES = 20_000;

describe('the catalog holds chrome, not prose (S-D6)', () => {
  it('has no value longer than the ceiling', () => {
    for (const [name, catalog] of [
      ['id', id],
      ['en', en],
    ] as const) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ [`${name}:${key}`]: value.length <= MAX_VALUE }).toEqual({
          [`${name}:${key}`]: true,
        });
      }
    }
  });

  it('names the longest value, so a regression says what it displaced', () => {
    // Not a redundant assertion: it fails when a NEW value becomes the longest,
    // which is the moment to ask whether it is chrome. Update the name and the
    // number together, in the same commit, with a reason.
    const longest = (Object.entries(id) as [MessageKey, string][]).sort(
      (a, b) => b[1].length - a[1].length,
    )[0];
    expect(longest[0]).toBe('onboarding.intro.body');
    expect(longest[1].length).toBeLessThanOrEqual(280);
  });

  it('keeps each catalog under the payload ceiling', () => {
    // THE ONE THAT MATTERS. The per-value ceiling alone would let 44 documents of
    // 320 characters in.
    for (const [name, catalog] of [
      ['id', id],
      ['en', en],
    ] as const) {
      const bytes = JSON.stringify(catalog).length;
      expect({ [name]: bytes < MAX_BYTES }, `${name} is ${bytes} bytes`).toEqual({
        [name]: true,
      });
    }
  });

  it('holds no paragraph breaks except the one that is framing', () => {
    /*
     * Prose has paragraphs; chrome does not. Two exemptions, each earned:
     *
     *   `reading.error.midStream`  OPENS with `\n\n[...]`, and `catalog.test.ts`
     *                             asserts that shape -- the blank line and the
     *                             brackets are what make a mid-stream notice read
     *                             as a system message rather than as the reader
     *                             suddenly saying something strange.
     *   `onboarding.intro.body`   Genuinely two paragraphs, and it is the invitation
     *                             screen rather than a label. It is also the longest
     *                             value in the catalog, which is not a coincidence:
     *                             it is the boundary case this whole file exists to
     *                             keep from becoming a precedent.
     */
    const EXEMPT = new Set<string>(['reading.error.midStream', 'onboarding.intro.body']);
    for (const [name, catalog] of [
      ['id', id],
      ['en', en],
    ] as const) {
      for (const [key, value] of Object.entries(catalog)) {
        if (EXEMPT.has(key)) continue;
        expect({ [`${name}:${key}`]: value.replace(/^\n\n/, '').includes('\n\n') }).toEqual({
          [`${name}:${key}`]: false,
        });
      }
    }
  });

  it('holds no markup, because a catalog value is a STRING and not HTML', () => {
    /*
     * `t()` returns a string and React escapes it. A value containing `<p>` or
     * `<a href` is somebody reaching for `dangerouslySetInnerHTML`, which §5 rule 3
     * forbids for authored copy -- and `/login`'s four-key legal line is the
     * sanctioned pattern for a sentence with a link in it, with its limitation
     * recorded in `id.ts`.
     */
    for (const catalog of [id, en]) {
      for (const [key, value] of Object.entries(catalog)) {
        expect({ [key]: /<\/?[a-z][^>]*>/i.test(value) }).toEqual({ [key]: false });
      }
    }
  });
});
```

2. Run it.

```sh
npm test -- prose
```

Expected: 5 passing, including S1's 26 new keys (the longest is
`landing.lede` at ~140 characters).

3. Commit.

```sh
git add src/lib/i18n/prose.test.ts
git commit -m "S1: a measured ceiling on catalog values and payload, so S-D6 cannot decay"
```

---

### Task 20: `tools/seo/crawl.sh` — the signed-out crawl (§11.2)

**Files**
- Create: `tools/seo/crawl.sh`

**§11.2 calls this "the acceptance test" and "the single check that matters".** It ships
as a committed tool rather than a snippet in a document, because a snippet in a document
is run once by the person who wrote it.

**Steps**

1. Write it.

```sh
#!/usr/bin/env bash
# THE ACCEPTANCE TEST FOR v0.4.0 (roadmap §11.2).
#
# Every path below must be 200, must carry NO Set-Cookie, must not mention /login,
# and must not carry an x-robots-tag. **A 302 anywhere in this list is the release
# failing at its only purpose.**
#
# WITH NO COOKIE JAR, WHICH IS THE ENTIRE POINT. `curl` sends none unless told to,
# and this script never writes one -- a crawler carries no cookie, and every bug
# this release exists to fix was invisible to a signed-in browser.
#
# `-L` follows redirects and `%{url_effective}` prints where it landed, so a 302 to
# /login shows up as a 200 at the WRONG URL rather than as a red status code. Both
# are printed.
#
#   tools/seo/crawl.sh                                # production
#   tools/seo/crawl.sh http://localhost:3001          # a local `npm start`
#   tools/seo/crawl.sh https://<preview>.vercel.app   # a Vercel preview
#
# RES_OPTIONS=no-aaaa for the reason every npm script here sets it: AAAA lookups
# hang 4-12s in this WSL image and every cold outbound connection pays it.
set -uo pipefail
export RES_OPTIONS=no-aaaa

BASE="${1:-https://www.jmtarot.site}"
FAIL=0

# The public surface. `/en` twins included -- they are S2's, and a 404 here before
# S2 lands is expected and is not a pass.
PATHS=(
  /
  /en
  /gallery
  /en/gallery
  /arcana/the-moon
  /en/arcana/the-moon
  /blog
  /en/blog
  /sitemap.xml
  /robots.txt
)

printf '%-26s %-4s %-4s %s\n' PATH CODE HOPS NOTES
for p in "${PATHS[@]}"; do
  # -D - dumps the FIRST response's headers even when -L follows, which is what
  # makes "no Set-Cookie" checkable on the response the crawler actually got.
  headers="$(curl -sS -o /tmp/jmt-crawl-body -D /tmp/jmt-crawl-head \
    -w '%{http_code} %{num_redirects} %{url_effective}' "$BASE$p" 2>/dev/null)"
  code="${headers%% *}"
  rest="${headers#* }"
  hops="${rest%% *}"
  final="${rest#* }"

  notes=""
  [ "$code" = "200" ] || { notes+="NOT 200; "; FAIL=1; }
  [ "$hops" = "0" ] || { notes+="REDIRECTED to $final; "; FAIL=1; }
  case "$final" in *"/login"*) notes+="LANDED ON LOGIN; "; FAIL=1;; esac
  if grep -qi '^set-cookie:' /tmp/jmt-crawl-head; then
    # S-D10. A stranger who never agreed to anything must leave with nothing in
    # their jar, and a Set-Cookie makes the response uncacheable at the edge.
    notes+="SET-COOKIE ($(grep -i '^set-cookie:' /tmp/jmt-crawl-head | \
      sed 's/=.*//' | tr -d '\r' | paste -sd,)); "
    FAIL=1
  fi
  if grep -qi '^x-robots-tag:.*noindex' /tmp/jmt-crawl-head; then
    # S-D12: `/s/`'s noindex must not spread. One broadly-matching headers() entry
    # would do it and `headers.test.ts` is the only other thing that would notice.
    notes+="NOINDEX; "
    FAIL=1
  fi
  printf '%-26s %-4s %-4s %s\n' "$p" "$code" "$hops" "${notes:-ok}"
done

echo
echo "── /s/ must STILL be noindex (S-D12) ──"
# A negative control on the whole script: if this prints nothing, the crawl above
# proves less than it looks like it does.
curl -sS -o /dev/null -D - "$BASE/s/abcdefghjkmn" 2>/dev/null \
  | grep -iE '^(HTTP/|x-robots-tag|referrer-policy)' | tr -d '\r' \
  || { echo "COULD NOT READ /s/ HEADERS"; FAIL=1; }

echo
echo "── the sitemap parses as XML and names the right host ──"
curl -sS "$BASE/sitemap.xml" 2>/dev/null | python3 -c '
import sys, xml.dom.minidom as m
d = m.parseString(sys.stdin.read())
urls = [n.firstChild.data for n in d.getElementsByTagName("loc")]
print(len(urls), "urls;", urls[0] if urls else "NONE")
' || { echo "SITEMAP DID NOT PARSE"; FAIL=1; }

echo
echo "── robots.txt names the sitemap ──"
curl -sS "$BASE/robots.txt" 2>/dev/null | grep -i '^sitemap:' \
  || { echo "NO SITEMAP DIRECTIVE"; FAIL=1; }

echo
if [ "$FAIL" = "0" ]; then echo "crawl: clean."; else echo "crawl: FAILED."; fi
exit "$FAIL"
```

2. Make it executable and run it against a local build. **Expect failures until S2, S3,
   S4 and S6 land** — that is the tool working.

```sh
chmod +x tools/seo/crawl.sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run build && npm start &
tools/seo/crawl.sh http://localhost:3001
pkill -f next-server
```

Expected after S1 alone: `/` is 200 with **`SET-COOKIE (set-cookie: jmt_locale)`**
until S2's guard lands (`## Deltas requested`); `/en`, `/gallery`, `/arcana/the-moon`
and `/blog` are 404 or 302; `/sitemap.xml` and `/robots.txt` are clean. **Record that
output in `docs/workstream-notes.md`** as S1's baseline, so the reconciliation pass can
see which lines each later workstream turned green.

3. Commit.

```sh
git add tools/seo/crawl.sh
git commit -m "S1: the signed-out crawl as a committed tool, not a snippet in a doc"
```

---

### Task 21: Search Console verification, and the two deploy checks that catch a wrong origin

**Files**
- Modify: `docs/DEPLOY-VERCEL.md` (a new `## 7` after `## 6`, plus two bullets in `## 3`)
- Modify: `.env.example` (one new variable, beside `LOCALE_SWITCHER`)

**The decision: a DNS TXT record, as a Search Console *Domain property* on
`jmtarot.site`.** §13 leaves the method open and asks S1 to pick and justify one. The
other two lose, and one of them loses for a reason specific to this codebase:

- **The HTML file method is actively broken here.** It wants
  `public/google<token>.html` served at `/google<token>.html`. The middleware matcher is
  `'/((?!_next/|cards/|dukuns/|favicon|icon|apple-icon|manifest|sitemap|robots).*)'` —
  which **matches that path** — and `isPublic()` does not name it, so a signed-out
  Googlebot gets a 302 to `/login`. Verification fails, the error message says the file
  was not found, and the file is right there in `public/`. That is an hour of somebody's
  life, and the fix would be a permanent hole in the allowlist for a one-time act.
- **The metadata tag** needs an edit to `layout.tsx`, and §6.3 gives S1 exactly one field
  in that file. §9 also says `GOOGLE_SITE_VERIFICATION` is deliberately not a variable,
  and a hardcoded token in a committed file is a token nobody rotates.
- **DNS TXT verifies the apex and `www` together**, which is the property that matters
  here and nowhere else in the docs: the apex 308-redirects to the `www` host, so a
  URL-prefix property on `https://www.jmtarot.site` alone leaves the redirecting apex
  unverified — and the apex is where a stranger types the domain. It also survives every
  rebuild, cannot be broken by a route change, a gate change or a matcher change, and
  needs no code at all.

**Steps**

1. Add `## 7` to `docs/DEPLOY-VERCEL.md`, in the register the rest of that file uses.

```markdown
## 7. Search Console and the sitemap — REQUIRED once, after the first deploy

### 7a. `NEXT_PUBLIC_SITE_ORIGIN` — set it, and then look at the sitemap

**`NEXT_PUBLIC_SITE_ORIGIN=https://www.jmtarot.site` in Production. Set it in Preview
too, to the preview host or not at all — never to production.**

Every canonical tag, every `hreflang`, every `og:image` and every URL in
`sitemap.xml` resolves against `siteOrigin()`. Absent, it falls to `AUTH_URL` (which
production sets to the same value, so you are covered twice), then to
`VERCEL_PROJECT_PRODUCTION_URL`, then to `VERCEL_URL` — **and a canonical tag pointing
at `jmtarot-abc123.vercel.app` de-indexes the real page.** Nothing reports that; it is
the single worst class of SEO bug available.

**So check it, in one command, and do not skip it:**

```sh
curl -s https://www.jmtarot.site/sitemap.xml | head -5
curl -s https://www.jmtarot.site/robots.txt  | grep -i sitemap
```

Both must name `https://www.jmtarot.site`. A `vercel.app` host in either is the
misconfiguration, visible before Google ever sees it.

**On a PREVIEW deployment, a `vercel.app` origin is CORRECT** — a preview emitting
production canonicals would ask Google to index the production URL from a page that is
not it.

### 7b. Verify the domain with a DNS TXT record, not the HTML file

**Use a Domain property on `jmtarot.site`, verified by DNS TXT.** Three reasons, and
the second is specific to this app:

1. A Domain property covers the apex, `www`, and both schemes in one. **The apex
   308-redirects to `www`**, so a URL-prefix property on `https://www.jmtarot.site`
   leaves the host a stranger actually types unverified.
2. **The HTML-file method does not work here and the failure looks like a missing
   file.** `src/middleware.ts`'s matcher matches `/google<token>.html`, and
   `isPublic()` in `src/lib/auth/gate.ts` does not name it — so Googlebot, which
   carries no cookie, is 302'd to `/login`. Making it work means a permanent entry in
   the session allowlist for a one-time act.
3. It survives every rebuild and every route change. There is nothing in the repo to
   keep in step, which is why §9 of the roadmap declines to make it a variable.

Procedure:

1. Search Console → **Add property** → **Domain** → `jmtarot.site` (no scheme, no
   `www`).
2. Copy the `google-site-verification=…` string.
3. At the registrar, add a **TXT** record on the apex — host `@`, value the whole
   string. Leave any existing TXT records alone; a domain may hold several.
4. Wait for propagation and check it yourself before pressing Verify:

   ```sh
   RES_OPTIONS=no-aaaa dig +short TXT jmtarot.site
   ```

   If `dig` is unavailable, `getent` will not do this — use
   `curl -s 'https://dns.google/resolve?name=jmtarot.site&type=TXT'`.
5. Press **Verify**. **Do not delete the TXT record afterwards** — Search Console
   re-checks it and un-verifies the property when it disappears.

### 7c. Submit the sitemap, once

Search Console → **Sitemaps** → `sitemap.xml`. One file, both locales; `robots.txt`
also names it, which is how every other crawler finds it.

**Then read the two reports that actually say whether v0.4.0 worked**, and do not
expect either on day one — indexing takes days to weeks:

- **Pages** → the count of indexed URLs. The release's whole thesis is §1's number:
  three pages today, forty-six or so after. If `Excluded → Alternate page with proper
  canonical` is large, the `hreflang` pairs are not reciprocal and Google has picked one
  side; §11's `sitemap.test.ts` asserts reciprocity, so that would mean the emitted tags
  and the sitemap disagree.
- **Pages → Not indexed → Page with redirect.** **Any content route here means the gate
  is refusing a crawler**, which is exactly the failure this release exists to remove.
  `tools/seo/crawl.sh` answers the same question in two seconds and without waiting for
  Google.
```

2. Add two bullets to `## 3. Verify the deployment`, so the origin check sits with the
   other post-deploy checks and not only in §7.

```markdown
- **`/` returns 200 and shows the landing page while signed out** — it used to 302 to
  `/login`, and S-D5 changed that deliberately. This is also what unblocks publishing
  the OAuth consent screen: Google's branding requirement is an app homepage that is
  not a login page.
- **`curl -s https://www.jmtarot.site/sitemap.xml | head -5` names
  `https://www.jmtarot.site` and no `vercel.app` host.** See §7a — a canonical at the
  wrong host de-indexes the right page and nothing reports it.
- **`tools/seo/crawl.sh` prints `crawl: clean.`** It is the release's acceptance test:
  every public path 200, no `Set-Cookie`, no `noindex`, and `/s/` still
  `noindex, nofollow, noarchive`.
```

3. Fix the now-wrong first bullet of `## 3`, which reads `/` redirects to `/login`. Do
   not delete it — **replace it**, because somebody reading the old line will conclude
   the gate is broken.

4. Add to `.env.example`, beside `LOCALE_SWITCHER`:

```
NEXT_PUBLIC_SITE_ORIGIN=      # v0.4.0 / S-D11. The canonical origin, e.g.
                              # https://www.jmtarot.site . Falls back to AUTH_URL's
                              # ORIGIN, then VERCEL_PROJECT_PRODUCTION_URL, then
                              # VERCEL_URL, then http://localhost:3001.
                              #
                              # ABSENT IS FINE LOCALLY AND WRONG IN PRODUCTION: a
                              # canonical tag pointing at a preview host de-indexes
                              # the real page, and NOTHING REPORTS IT. The check is
                              # one curl and it is in docs/DEPLOY-VERCEL.md §7a.
                              #
                              # On a PREVIEW, unset or the preview host -- never
                              # production. A preview emitting production canonicals
                              # asks Google to index a URL the page is not at.
                              #
                              # NEXT_PUBLIC_ ON PURPOSE (roadmap §9), and yet
                              # `siteOrigin()` is STILL server-only in practice: the
                              # other three rungs carry no NEXT_PUBLIC_ prefix, so in
                              # a browser bundle they inline as undefined and the
                              # chain collapses to localhost. A client component is
                              # handed a finished URL as a prop --
                              # `clientBoundary.test.ts` fences the import.
```

5. There is nothing to run. Read the diff, and confirm the two `curl` lines against a
   local `npm start` so the commands in the document are known to work.

6. Commit.

```sh
git add docs/DEPLOY-VERCEL.md .env.example
git commit -m "S1: Search Console by DNS TXT, and the curl that catches a wrong canonical host"
```

---

### Task 22: Documentation — `CLAUDE.md` and `docs/workstream-notes.md`

**Files**
- Modify: `CLAUDE.md`
- Modify: `docs/workstream-notes.md`

**Steps**

1. `CLAUDE.md`. Five edits, each **amending rather than deleting**, because every
   sentence below is one somebody will otherwise restore.

- **The last paragraph of `## Onboarding and the Lotus (W3)`** ends: *"What blocks
  publishing is Google's branding requirement of an app homepage that is not a login
  page — signed out, `/` redirects to `/login`."* Rewrite the second clause:
  **"Signed out, `/` now renders a landing page (v0.4.0, S-D5), so that blocker is
  closed; what remains is pressing Publish on the consent screen."**
- **`## Localization (W6)`**, which opens *"Locale is **never** a URL segment (D6): nine
  routes stay nine."* Append: **"v0.4.0 breaches D6 for FIVE PUBLIC CONTENT ROUTES AND
  NOTHING ELSE (S-D1). The nine app routes are untouched and `router.push('/en/...')`
  is still wrong in every one of them. The prefix is a middleware REWRITE, not a route
  segment, so there is still one route tree."**
- **A new short section, `## The public surface (v0.4.0)`**, after `## Sharing (V7)`:
  the file map, the gate's two changes, `origin.ts`'s single-owner rule, and the three
  sentences a future session would otherwise undo — *`'/'` is not in `isPublic()`*,
  *the gate never sees a locale prefix*, and *`/` is deliberately uncacheable*.
- **`## Traps`** gains one entry: **the HTML-file Search Console method is 302'd by the
  middleware matcher**, which is a trap in exactly this file's register — a working-looking
  configuration whose failure names the wrong cause.
- **The event count.** `## Analytics and reading history (W4)` says *"the closed
  taxonomy: 60 names"*; it is 61 today and 66 after Task 17. Fix the number and note
  that S1 is the single owner for v0.4.0 (S-D13).

Also fix one stale number while you are in the file: `## Localization` says
`locales/id.ts` has **118 keys**; it has 242, and 268 after Task 10.

2. `docs/workstream-notes.md`. A new `## S1 — public surface and technical SEO` section
   holding the **evidence**, which is what that file is for and this one is not:

- The measured `cache-control` values from Task 16 step 5, and **whether Next's dynamic
  default won**. That is the single most consequential unknown in this plan.
- `tools/seo/crawl.sh`'s output at S1 alone, as the baseline the later workstreams turn
  green.
- `tools/seo/fit.sh`'s numbers for the landing and the footer at 320/360/390.
- The `og:image` before/after from Task 3 step 5, which is the only visible evidence
  `metadataBase` reached `/s/`.
- The catalog's measured size and longest value, so Task 19's ceilings can be audited
  rather than trusted.
- **Why the HTML-file verification method was rejected**, with the matcher quoted. It is
  a five-line finding that saves an hour.

3. Verify the whole suite and the build, one last time, in the order that matters.

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm test                       # unit only. Expect the prior count + S1's new files.
npm run typecheck
npm run build                  # NOT OPTIONAL -- a green typecheck is not an answer,
                               # and `audit:secrets` runs inside it.
npm run db:up && npm run test:integration   # expected UNTOUCHED (§11.2)
```

**Run the two projects separately.** `npm run test:all` fails 12–22 of V9's limiter
tests as a harness race and its red means nothing.

4. Commit.

```sh
git add CLAUDE.md docs/workstream-notes.md
git commit -m "S1: document the public surface, the closed branding blocker and the measurements"
```

---

## 3. Verification, loop by loop

Which loop answers which question, because the expensive ones are expensive.

| Question | Loop | How |
|---|---|---|
| Does the gate open five paths and only five? | **1 — Vitest** | `gate.test.ts`, with a negative control per path and the two `/en/` fences. |
| Does the origin chain do what §9 says? | **1** | `origin.test.ts`, 12 cases, including totality. |
| Is the JSON-LD injectable and un-closeable? | **1** | `jsonld.test.ts`'s `</script>` canary. |
| Is the sitemap complete, exclusive and reciprocal? | **1** | `sitemap.test.ts`, exact set + permanent exclusions. |
| Did `noindex` spread? | **1** | `headers.test.ts`: `/s/:path*` is the only entry with `x-robots-tag`. |
| Is there prose in the catalog? | **1** | `prose.test.ts`, two measured ceilings. |
| Is there Malay or therapy language in the content? | **1** | `content/copy.test.ts`, negative-controlled against a synthetic document. |
| **Does anything overflow a phone?** | **4** | `tools/seo/fit.sh` at 320/360/390. **NOT a screenshot** — both Chromes here floor at ~500px, so a shot that looks like a phone is not one. |
| Does signed-out `/` actually render the landing? | **5 — real Chrome over CDP** | `run.sh reset`, `goto /`, `text`. Then `login` and `goto /` again for the picker arm. |
| Does the JSON-LD parse in a real DOM? | **5** | `run.sh eval "JSON.parse(...)['@graph']..."`. |
| **Status codes, `Set-Cookie`, `x-robots-tag`, canonical, sitemap XML** | **`curl -i`, no cookie jar** | `tools/seo/crawl.sh`. The cheapest and most important instrument in this release. |
| Do the headers survive a real build? | **`npm start` + curl** | Task 16 step 5. A config `cache-control` on a dynamic route is **not** assumed to win. |
| Does Add to Home Screen still work after the `metadataBase` edit? | **6 — a real iPhone** | The only loop that can see it. `other: { 'apple-mobile-web-app-capable' }` is the field at risk. |
| Does the landing read well on glass? | **6** | Also the only loop for `100dvh` and the safe-area insets on a page with a full-bleed card image. |

**The one number that decides whether the release worked is not in this table**, because
no loop here can produce it: Search Console's indexed-page count, days to weeks after
the deploy. §7c names the two reports.

---

## Schema deltas

**None (S-D14).**

No table, no column, no migration, no `resetDb()` change, no integration test. S1 reads
no database on any path it touches: `currentUser()` decodes a JWT and
`src/lib/auth/server.ts` says in as many words that both its functions are database-free.

Two properties this preserves and that are worth stating rather than assuming:

- **No public page can 500 on a database outage, because there is no database on its
  path at all.** Not "wrapped in a try" — absent, and `Landing.test.ts` asserts the
  absence of the import. Roadmap §10 notes that three routes already carry that bug
  (`/api/memory/{frequency,summary}` and `/api/persona` return 500 instead of 204);
  v0.4.0 does not add a fourth.
- **No migration means the 2026-07-28 outage class cannot recur in this release.** `npm
  run build` applies migrations on Vercel and fails the build rather than skipping; a
  release with nothing to apply cannot ship code and schema on different rails.

`npm run test:integration` is expected to pass **unchanged**. If any workstream's plan
adds an integration test, §11.1 says that is a flag.

---

## Analytics deltas

S1 is the **single owner** of `src/lib/analytics/events.ts` for v0.4.0 (S-D13). Every
other workstream declares its events here-shaped in its own plan and **S1 folds them in
during Task 17, in one edit.** Do not open that file in another branch.

**`EVENT_NAMES` moves 61 → 66.** Five names, and one existing prop shape widens.

### The five names, with their prop shapes

```ts
// — the public content surface (v0.4.0) —
'public.page_viewed':   { page: 'landing' | 'gallery' | 'arcana' | 'blog_index' | 'blog_post';
                          locale: string; slug: string | null;
                          referrer_kind: 'direct' | 'internal' | 'external' };

'public.link_clicked':  { from: 'landing' | 'gallery' | 'arcana' | 'blog_index' | 'blog_post' | 'footer';
                          to: 'sign_in' | 'app' | 'gallery' | 'arcana' | 'blog' | 'terms'
                            | 'privacy' | 'wallpaper' | 'locale';
                          slug: string | null };

'public.link_shared':   { from: 'landing' | 'gallery' | 'arcana' | 'blog_index' | 'blog_post';
                          method: 'clipboard' | 'webshare' | 'manual';
                          slug: string | null };

'public.card_zoomed':   { card_id: number; surface: 'gallery' | 'arcana' };

'wallpaper.downloaded': { card_id: number; variant: 'native' | 'phone' };
```

### One widening

```ts
'locale.changed':       { from: string; to: string;
                          surface: 'settings' | 'onboarding' | 'auto' | 'content' };
//                                                              ^^^^^^^^^ S2's
//                                                              switcher-as-link
```

### Who fires what

| Event | Fired by | Notes |
|---|---|---|
| `public.page_viewed` | S1 (landing), S3 (gallery), S4 (arcana), S6 (blog) | One name for four surfaces (rule 4). `page` is the prop. |
| `public.link_clicked` | S1's `PublicShell` and `Landing`, plus any page's own links | `to: 'sign_in'` is **the conversion number** and the only measure of whether the release worked as a funnel. |
| `public.link_shared` | S3/S4/S6 via S1's `PublicShare` | **Not `share.copied`:** that requires a `share_id` and S-D8 mints no row. |
| `public.card_zoomed` | S3 | `card_id` is the integer, never the name (rule 3). |
| `wallpaper.downloaded` | S5 | No filename, no byte count, no user agent. |
| `locale.changed` | S2, with `surface: 'content'` | Separating a link-navigation from a session write stops the two being averaged. |

### The two constraints that bind here and are easy to breach

- **No free text in `events.props`, ever.** A `slug` is a closed set — 22 committed card
  slugs plus a handful of article slugs — and is fine. **A search query, a page title, a
  heading or a `document.referrer` is not**, and `referrer_kind` is the collapsed
  three-value form `app.launched` and `share.viewed` already use. `events` rows survive
  account erasure with `user_id` nulled, and that is only honest because
  `sanitizeProps()` provably strips everything identifying.
- **Every public-page event carries a null `user_id`**, the way `share.viewed` and
  `terms.viewed` do. `/api/events` is already public for exactly this, so **no route
  change is needed** — and no new `/api/` route is added in v0.4.0 (S-D7).

### What another workstream should ask for rather than invent

If a plan wants a prop this list does not have, put it in that plan's
`## Analytics deltas`, not in a branch that edits `events.ts`. Two shapes to expect and
the answer to each in advance:

- **A per-card or per-article view count** — already answerable from
  `public.page_viewed` with `page` + `slug`. No new name.
- **Scroll depth or dwell time** — refused for now, on `history.item_closed`'s
  precedent: both need a listener per page and neither answers a question anybody has
  asked. Say so in the plan rather than adding a name nothing queries.

---

## Deltas requested

Changes S1 needs in files it does not own. Each names the owner and the exact predicate,
because "the cookie guard grows" is not a specification.

### From S2 — `src/middleware.ts`: the strip runs BEFORE `decide()`

**This is the one delta S1 cannot work around, and §1.1 is the whole argument.**

```ts
// BEFORE the gate, not after.
const stripped = stripLocalePrefix(request.nextUrl.pathname);
const decision = decide({
  pathname: stripped.path,        // '/gallery', never '/en/gallery'
  signedIn: viewer !== null,
  onboarded: viewer?.onb === true,
});
```

`isPublic()` learns no `/en/` spelling, and `gate.test.ts` asserts
`isPublic('/en/gallery') === false` and `at('/en/history', signedOut) === redirect
/login`. Those two assertions read as odd and are correct: **the gate is downstream of
the strip.** If S2 places the strip after the gate instead, both assertions become
wrong and S2 must say so in its plan — do not quietly satisfy them by teaching
`isPublic()` a prefix.

### From S2 — `src/middleware.ts`: the cookie-write guard, and the predicate is NOT the obvious one

§6.2 says the guard grows from `/s/` to `/s/` plus the content routes. **The naive
version breaks the signed-in app**, so here is the predicate:

```ts
// WRONG -- this stops refreshing `jmt_locale` for a signed-in querent whose
// landing page IS `/`, so their chosen language lags one navigation behind
// everywhere in the app.
if (!isContentPath(pathname) && cookieDisagrees) { ... }

// RIGHT. Middleware has already decoded the token, so "is there a session" is free.
const skipCookie = pathname.startsWith('/s/') || (isPublicContentPath(pathname) && viewer === null);
if (!skipCookie && request.cookies.get(LOCALE_COOKIE)?.value !== locale) { ... }
```

`/` is the reason the session term is needed: it is a **content route signed out and an
app route signed in** (S-D5), and it is the only path in the app with that property.

**Why S1 needs it at all:** `tools/seo/crawl.sh` fails on `/` with
`SET-COOKIE (jmt_locale)` until this lands, and S-D10 is explicit that a stranger who
never agreed to anything leaves with nothing in their jar — `/privacy` §4.4 is honest
only because that is true on `/s/`, and a landing page is a stranger's page too.

### From S2 — the locale on a content route must ignore the cookie (§4.1)

**This is the most dangerous interaction between S1's cache headers and S2's resolver,
and it is worth reading twice.** S1 gives `/gallery`, `/arcana/*` and `/blog*` a
`s-maxage=3600` on the premise that they are **viewer-invariant**. §4.1 says the URL
wins and is the only input. If `resolveForMiddleware`'s ordinary chain still runs on a
content route, then a visitor carrying `jmt_locale=en` gets English at `/gallery` — and
**the CDN caches that response and serves English to everybody**, including the
crawler, at the URL whose canonical says it is Indonesian.

So: on a content route the locale comes from the prefix alone. Not from the session
claim, not from the cookie, not from `Accept-Language`. `/gallery` is `id` always;
`/en/gallery` is `en` always.

**`/` is exempt and must stay exempt**, for S-D1: its signed-in arm is an app route and
D6 survives there. That is also why `/` gets no cache entry (§1.2).

### From S2 — `?lang=` must lose to the prefix (§4.3)

A rewrite that a query parameter then overrides is a development-only inconsistency
that costs an hour. S1 has nothing to do here; it is named so the reconciliation pass
sees that S1 read §4.3.

### From S2 — one line in `src/app/page.tsx` and one constant in `src/app/sitemap.ts`

Both seams are deliberately one edit each, in a file S1 owns:

- `page.tsx`'s `generateMetadata` has `alternates: { canonical: '/' }`. **Replace it
  with S-D15's helper**, which adds the reciprocal `id`/`en`/`x-default` set.
- `sitemap.ts` has `const EN_PREFIX = '/en'`. **Delete it and import `localePath` from
  `@/lib/i18n/resolve`.** S2 owns no other line of that file.

And `PublicShell` takes `alternate: { href, label } | null`. S2 supplies the href;
until then every page passes `null` and the control does not render.

### From S3, S4 and S6 — three lines each, and both halves in one commit

- **One line in `SITEMAP_PATHS`** (`src/app/sitemap.ts`) **and one line in
  `sitemap.test.ts`'s exact set.** The test asserts the exact set rather than a superset
  precisely so the two cannot drift: a path in the sitemap with no page behind it is a
  404 Search Console reports against the whole file.
- **One event declaration**, in the plan's `## Analytics deltas` — **not in
  `events.ts`** (S-D13). S1 has already declared `public.page_viewed`,
  `public.link_clicked`, `public.link_shared` and `public.card_zoomed`; if those cover
  it, say so and add nothing.
- **Chrome keys in the plan, not in `id.ts`.** S1 folds every workstream's keys in
  during Task 10, Indonesian first. A page-specific key belongs in that plan's own
  section with both locales written out.

### From S4 — `cardUrlSlug` / `cardByUrlSlug`, and one assertion S1 wrote against a literal

`Landing.tsx` links to `/arcana/the-moon` and `Landing.test.ts` asserts the literal
string. **When `cardByUrlSlug` exists, tighten that assertion to call it** — the literal
is a placeholder for a function that does not exist yet, and a permanent public address
deserves the §3.2 table behind it rather than a string somebody typed.

### From S5 — confirm the `/wallpapers/*` header value

S1 wrote `public, max-age=31536000, immutable`, matching `/cards/*`. **S-D9 says a new
asset class gets its own entry precisely so its lifecycle can differ**, so if S5's
pipeline produces filenames that could change — anything not keyed purely on
`(slug, variant)` — say so and give the value you want. The caveat is worse here than
for `/cards/*`: a wallpaper is a file somebody chose to download.

### From nobody — three things S1 deliberately did NOT request

Recorded so they are not offered as helpful additions:

- **A change to `src/middleware.ts`'s matcher.** §6.2 says it should not need one and if
  a plan thinks it does, that is a flag. S1 checked: `sitemap` and `robots` are already
  excluded, and the content routes need middleware to run so the gate and the locale
  header work.
- **Extending `SHARE_ENTITIES`** (S-D8). The share control is `navigator.share` plus
  clipboard on the page's own canonical URL.
- **A `/api/` route of any kind** (S-D7). Nothing in v0.4.0 has a server dependency at
  request time beyond the page render.

---

## Flags

Blunt. Each is either a place the roadmap looks wrong, or something a sibling workstream
must know before it writes a line.

### 1. `src/lib/copy/vocab.ts` ALREADY EXISTS, so §11.4's premise is stale — and there are still two inline copies S1 will not merge

§11.4 says the Malay grep and the therapy list "currently run in `npm run smoke -- --all`"
and asks for "a unit test over the content modules, reusing the existing word lists
rather than copying them". **The extraction already happened**: `src/lib/copy/vocab.ts`
exports `MALAY`, `THERAPY_ID`, `THERAPY_EN` and `EN_TICS`, with no `server-only` marker
so that scripts and tests can both import it. Task 18 imports it and copies nothing.

**Two inline copies survive, and S1 is deliberately leaving both:**

- **`scripts/smoke-llm.ts` still carries its own.** `vocab.ts`'s own header says *"V3
  owns pointing it here"* and V3 did not. It is a real debt and it is not S1's — pointing
  the smoke script at `vocab.ts` would make the check strictly stricter (`EN_TICS` has
  three entries the script lacks: `divine timing`, `higher self`, `sacred`) and would
  change what a live LLM run rejects, in a release that touches no prompt.
- **`src/lib/i18n/catalog.test.ts` carries a DIFFERENT Malay list**, and merging it would
  be wrong. It has six words `vocab.MALAY` does not — `boleh jadi`, `kereta`, `pejabat`,
  `bilik`, `cuba`, `tetapi begitu` — and **at least three are ordinary Indonesian**:
  `kereta` is a train, `bilik` is a chamber, and `cuba` is also the country. They are
  safe against 242 short reviewed strings and would produce false positives against
  generated reading prose, which is where `vocab.MALAY` is used. **A false positive in a
  shared list is how a check gets switched off.** Two lists with two scopes is the right
  answer; it just needs saying, because the next person will "tidy" them together.

### 2. §5 rule 3's "no `dangerouslySetInnerHTML` anywhere in v0.4.0" is unachievable, and Task 9 breaches it deliberately

JSON-LD cannot be emitted any other way. React HTML-escapes text children, so
`<script>{JSON.stringify(x)}</script>` turns every `"` into `&quot;` — and HTML entities
are not decoded inside a `<script>`, so the block is invalid JSON no crawler parses.

**The rule's stated reason does not reach this case.** §5 gives it as: prose is a typed
block union, not a string of HTML, and the CSP is `script-src 'self' 'unsafe-inline'` in
report-only with the goal of tightening it. Neither applies to a data block built by
pure functions from a closed set of fields and escaped with `<`/`>`/`&`.

**Proposed amendment:** rule 3 reads *"no `dangerouslySetInnerHTML` for authored
prose"*, and `src/components/JsonLd.tsx` is the single sanctioned exception, fenced by a
test asserting it is the only file in `src/` writing an `ld+json` tag. That test is also
what makes a future `script-src` nonce one prop in one file rather than a hunt across
forty-four pages — so the exception makes tightening **easier**, which is the outcome
rule 3 was protecting.

### 3. `siteOrigin()` has a rung roadmap §9 does not list — `AUTH_URL` — and the alternative is a de-indexing waiting to happen

§9 specifies `NEXT_PUBLIC_SITE_ORIGIN` → `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL`
→ `http://localhost:3001`. **Task 1 inserts `AUTH_URL`'s ORIGIN second.**

Why: production already sets `AUTH_URL=https://www.jmtarot.site` and
`docs/DEPLOY-VERCEL.md` §5 leans on exactly that for `shareOrigin()`. Without the rung,
a deployment that forgets `NEXT_PUBLIC_SITE_ORIGIN` emits canonicals at a `vercel.app`
host — which **de-indexes the correct page, and nothing reports it**. With it, the app
has to be misconfigured twice. And S-D11's whole point is that `shareOrigin()` must not
keep a second chain; the only way to delegate honestly is for the leaf to hold every
rung `shareOrigin()` had.

**The cost, stated:** `AUTH_URL` carries no `NEXT_PUBLIC_` prefix, so `siteOrigin()` is
server-only in practice despite the variable name §9 chose. Task 12 fences the import
from client components and `PublicShare` takes a finished URL as a prop instead. **The
`NEXT_PUBLIC_` prefix in §9's name is therefore misleading and the plan keeps it
anyway** — renaming a variable across a doc, an example file and a Vercel dashboard buys
nothing, and the fence is real.

### 4. `/` cannot be CDN-cached, and if that is unacceptable the design has to change, not the header

Three independent blockers (§1.2): the dual render, middleware's `Set-Cookie`, and a
language that follows D6's chain rather than the URL. **The only design that fixes all
three is a middleware rewrite of signed-out `/` to an internal, session-invariant,
prefix-pinned path** — the shape S2 is already building for `/en/*`. It was not proposed
here because it would put S1's most security-relevant route behind S2's rewrite and
because §12 has S1 landing first and alone. **If a crawler's homepage TTFB turns out to
matter, that is the change to make, and it belongs to S2's file.**

### 5. A config-level `cache-control` may lose to Next's dynamic default, and this plan does not pretend to know

Every route in this app is `ƒ` because the root layout awaits `getLocale()`, and Next
sets its own `Cache-Control` on dynamic responses. **Task 16 step 5 curls the real
thing and names three fallbacks.** ISR is not one of them — it needs a static root
layout, and S-D10 already rejected multiple root layouts by route group.

**Every other workstream should assume the content routes are NOT edge-cached until
`docs/workstream-notes.md` records a measured `s-maxage` on the wire.** In particular,
do not build anything whose correctness depends on the cache (a per-page counter, a
"popular cards" list). Nothing in v0.4.0 does today.

### 6. `/arcana` with no slug is a soft 404, and that was accepted rather than missed

§6.1 names `/arcana` as a negative control, so `isPublic('/arcana')` is `false` — which
means a signed-out visitor gets **302 → `/login`**, not the 404 §3.1 asks for. Google
calls that a soft 404 and it is mildly bad.

**Accepted, because the alternative is worse:** making `/arcana` public to get an honest
404 widens the allowlist by a path that has no page, and `isPublic` growing entries for
routes that do not exist is how it stops being readable. Nothing links to `/arcana`, it
is in no sitemap, and if a future release wants it, §3.1 already says the answer is a
301 to `/gallery` — which is a route, not an allowlist entry.

### 7. `/terms` and `/privacy` are `noindex` today, and the sitemap therefore excludes them — somebody should decide whether that is still right

Both set `robots: { index: false, follow: false }` in their own `generateMetadata`, with
a recorded reason: *"an indexed legal page for an app behind auth is noise."* **The app
is not behind auth any more.** A public site with a real homepage normally wants its
terms and privacy policy indexed — Google's trust signals look for them, and §7b's
consent-screen review reaches them by URL either way.

S1 did not change it, because §3 lists all three as "Unchanged" and the sitemap
excluding a noindex page is the only self-consistent state. **This is a one-line
decision for the reconciliation pass:** flip the `robots` field on both pages and add
them to `SITEMAP_PATHS`, or leave both. Do not do one half.

### 8. The catalog is 242 keys and 14.3KB, not the 118 keys CLAUDE.md claims — and S-D6's real cost is the payload, not the line count

S-D6 argues from `id.ts` being "843 lines today". The number that matters is that
**every visitor of every page downloads the whole catalog as JSON** (I9), which is
14,326 bytes for `id` and 14,066 for `en`. Task 19's ceilings are measured against those:
320 characters per value (the longest today is 269) and 20,000 bytes per catalog.

**Both are ceilings, tightened when the catalog shrinks and never widened without a
written reason** — `LENGTH_BUDGET`'s rule. A workstream whose chrome keys would breach
either has content in the wrong place.

### 9. S1 must not deploy alone, and no test can catch it

`Landing.tsx` links to `/gallery`, `/arcana/the-moon` and `/blog`, none of which exists
until S3, S4 and S6 land. A homepage linking to three 404s is worse than the redirect it
replaced, and **Google penalises exactly this** — a new indexable page whose outbound
links 404.

Merging S1 to `main` is fine. **Deploying a build where `tools/seo/crawl.sh` reports 404
on those three paths is not.** The crawl script is the check; there is no unit test that
can see it, because the pages are meant to be missing at this point in the sequence.

### 10. Two things later workstreams will get wrong about `PublicShell`, stated in advance

- **Do not add a `locale` prop.** `LocaleProvider`'s header says NO LOCALE PROP IS
  DRILLED ANYWHERE, and the shell resolves the language itself via `getT()` — which is
  correct on a content page because the page's language *is* what middleware forwarded.
  `/s/[slug]` needed a nested `LocaleProvider` because its language comes from a database
  row rather than from the request; **a content page has no such problem and must not
  copy that mechanism.**
- **Do not put `PublicShare` inside the shell.** It is a client component; mounting it in
  the shell would force a hydration boundary onto the landing page, which today ships
  zero client JavaScript except analytics. S3/S4/S6 mount it inside the shell's
  `children`, and it takes the canonical URL as a **prop** — never `siteOrigin()`, which
  collapses to `http://localhost:3001` in a browser bundle.

### 11. `metadataBase` reaches `/s/`, which §3 calls unchanged

Setting it in the root layout changes one thing on the share page: `og:image` stops
resolving against Next's guess and starts resolving against the real origin. **That is
an improvement and VD18 is untouched** — the image still draws only `MAJOR ARCANA` and
carries neither the question nor the prose. Verified by curl in Task 3 step 5 rather than
reasoned about. Named here so the reconciliation pass does not read it as S1 editing a
route it does not own.
