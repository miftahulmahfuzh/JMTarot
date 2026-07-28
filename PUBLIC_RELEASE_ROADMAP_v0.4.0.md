# JMTarot — Public Release Roadmap v0.4.0: The Indexable Surface

**Status:** planning. Nothing here is built yet.
**Date opened:** 2026-07-28.
**Branch:** `feat/v0.4.0-seo`, worktree `.worktrees/v0.4.0-seo`, off `origin/main` @ `02b4d23`.

> **RECONCILED 2026-07-28. `docs/plans/2026-07-28-RECONCILIATION-v0.4.0.md` NOW
> OUTRANKS THIS FILE** wherever they differ, and it found **six defects in this
> document**. Read it first. The amendments are marked *(amended)* below and the
> reasoning lives there, not here — a corrected document whose correction is
> invisible invites somebody to re-derive the original mistake.
>
> Defects, in one line each: §3.1 contradicted §6.1 about `/arcana` (R6); §6.2 was
> wrong that the middleware matcher need not change (R7); §7's S3/S5 download
> split was ambiguous enough that both plans claimed it (R8); §12 named two seams
> and there are four (R9); §9's origin chain was missing the `AUTH_URL` rung
> (R10); §6.5 put the prefix helpers in a file `gate.ts` cannot import (R11); and
> §11.4 was written against a premise that had already been fixed (R13). **§5 rule
> 3 was challenged and SURVIVED — measured, not argued (R1).**
>
> **Precedence, highest first:** the reconciliation → this file → the individual
> workstream plan. Where a workstream plan disagrees with this file, **the plan is
> wrong**.
>
> `PUBLIC_RELEASE_ROADMAP.md` (v0.2.0) and
> `docs/plans/2026-07-27-RECONCILIATION-v0.3.0.md` still bind everything they
> cover. **This file overturns exactly one of their decisions — D6 — and only
> for the routes named in §3.** Every other decision in them stands.

This is the umbrella document for v0.4.0. It fixes the route table, the locale
mechanism, the content model and the gate change, so that six detailed plans
written in parallel compose into one codebase instead of six.

---

## 0. How to execute this roadmap

**If you were told `execute PUBLIC_RELEASE_ROADMAP_v0.4.0.md S<n>`, this section
is your entry point. Read it before anything else.**

### 0.1 The plan index

Each workstream has one plan file. **The plan is the task list; this file is the
contract between plans; the reconciliation outranks both.**

| ID | Workstream | Plan file (`docs/plans/`) | Tasks |
|---|---|---|---|
| **S1** | Public surface + technical SEO foundation | `2026-07-28-seo-foundation.md` | 22 |
| **S2** | Locale-addressable public content (`/en/`, hreflang) | `2026-07-28-content-locale-urls.md` | 9 |
| **S3** | The Gallery | `2026-07-28-gallery.md` | 19 |
| **S4** | Card lore pages | `2026-07-28-arcana-lore.md` | 34 |
| **S5** | HQ wallpaper downloads | `2026-07-28-wallpapers.md` | 7 |
| **S6** | The blog | `2026-07-28-blog.md` | 15 |
| — | **The reconciliation. Read first, always.** | `2026-07-28-RECONCILIATION-v0.4.0.md` | — |

**106 tasks.** S4's 34 includes 21 one-card tasks (13–33) that share one template
rather than 21 written-out headers — that granularity is argued in its own plan
and is deliberate.

**`2026-07-28-share-live-locale-design.md` and
`2026-07-28-share-per-locale-links-design.md` ARE NOT PART OF v0.4.0.** They carry
the same date because they shipped the same day this roadmap opened, and they will
look like siblings in a directory listing. They are **v0.3.0** design records for
V7's share links. Do not execute them and do not read them as v0.4.0 scope. They
are still authoritative for `/s/`, which v0.4.0 does not touch.

### 0.2 The read order, every time

Do not skip a step and do not reorder them:

1. **`docs/plans/2026-07-28-RECONCILIATION-v0.4.0.md`** — the whole file. It
   overrides both this document and your plan, it records **six defects this
   document carried**, and §5's single-definition register tells you which symbols
   you may author and which you must import.
2. **This file** — §2's sixteen decisions, §3's route table, and the §6 row that
   names your files. **A file with another workstream's name on it is not yours to
   edit; put the change in your plan's `## Deltas requested`.**
3. **Your plan file**, from the top. Its `## Preconditions` or Task 1 states what
   must already exist.
4. **`CLAUDE.md`**, then the sections of `docs/workstream-notes.md` your plan
   names. Non-negotiable: it is long and every paragraph was paid for in a real
   bug.

Then use the **`superpowers:executing-plans`** skill and work task by task.

### 0.3 Two workstreams split in half, and `execute S1` is ambiguous without this

Reconciliation §6 corrects §12's sequencing. **S1 and S4 each split, because part
of each blocks other workstreams and part blocks nobody.**

```
S1a  origin leaf, metadataBase, jsonld module, PublicShell, events.ts, catalog
 │
 ├── S2   prefix.ts ─┐   S1's GATE task needs prefix.ts -- so S1 is NOT "first and alone"
 │                   ├── S1b  gate.ts, decide(), robots, sitemap, headers
 │                   │
 └── S4a  cardUrlSlug / cardByUrlSlug / content/types.ts / Prose.tsx
          │
          ├── S3   gallery      (needs cardUrlSlug + S5's WallpaperDownload)
          ├── S4b  22 id docs, then 22 en docs        (per-card English -- R2)
          ├── S5   pipeline + WallpaperDownload       (needs cardUrlSlug)
          └── S6   two articles (needs content/types.ts + Prose)
```

So:

- **`execute … S1`** means S1a, then stop at the gate task and check whether S2's
  `src/lib/i18n/prefix.ts` exists. If it does not, **do S2 Tasks 1–3 first** or
  come back. Do not invent a second prefix helper.
- **`execute … S4`** means S4a (Tasks 1–4) then S4b (the documents). S4a unblocks
  three workstreams; do it even if the writing waits.
- **`execute … S3`**, **`S5`**, **`S6`** each require S1a and S4a to have landed.
  Their Task 1 asserts it. If the assertion fails, the answer is to land the
  dependency, never to write a local copy — reconciliation §5 is the register and
  a second definition of anything on it is a reconciliation failure.

### 0.4 Four things that are true of every workstream

- **Nothing in v0.4.0 calls a model** (S-D7), touches the database or adds a
  migration (S-D14), adds a dependency, or sets a cookie on a public page
  (S-D10).
- **New i18n keys go in `src/lib/i18n/locales/id.ts` first**, so a missing English
  string is a red typecheck. **Chrome keys only — no prose** (S-D6).
- **`npm run build` is not optional.** A green `npm run typecheck` is not an
  answer (the TypeScript trap), and `audit:secrets` runs inside the build. Node 24
  must be on PATH: `export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH`.
- **Run `npm test` and `npm run test:integration` SEPARATELY.**
  `npm run test:all` fails 12–22 of V9's limiter tests as a harness race and its
  red means nothing. Baseline at the time of planning: **1632 unit tests, 88
  files, green.**

### 0.5 The one thing that is not a task in any plan

**S1 must not be deployed alone, and no test can catch it.** Its landing page
links to `/gallery`, `/arcana/the-moon` and `/blog`, none of which exist until S3,
S4 and S6 land. A homepage linking to three 404s is worse than the redirect it
replaced. **Merging S1 to `main` is fine; deploying a build where
`tools/seo/crawl.sh` reports 404 on those three paths is not** — the pages are
*meant* to be missing at that point in the sequence, which is exactly why no unit
test can see it.

---

## 1. What v0.4.0 is, and the one number that explains it

**Today a search engine can see three pages of this application, and one of them
is a login form.**

That is not a figure of speech. `src/lib/auth/gate.ts:isPublic()` is a
seven-entry allowlist and `src/middleware.ts` 302s everything else to `/login`.
A crawler, which carries no cookie, gets:

| Route | What Googlebot receives today |
|---|---|
| `/` | **302 → `/login`** |
| `/[reader]`, `/[reader]/[service]` | **302 → `/login`** |
| `/history`, `/history/[id]`, `/account`, `/onboarding` | **302 → `/login`** |
| `/s/[slug]` | 200, and `noindex, nofollow, noarchive` — **correct, deliberate, keep it** |
| `/login`, `/terms`, `/privacy` | 200. **The entire indexable site.** |

So the addressable surface is one login form and two legal documents. There is
no `sitemap.xml`. There is no `metadataBase`, so every canonical and every
`og:image` resolves relative. There is no structured data anywhere. There is no
`hreflang`, and **D6 makes it impossible to add**, because locale is a cookie
and a session claim and never a URL — two languages cannot occupy one address in
an index.

`evatarot.net` does not outrank us on craft. It outranks us because it has
hundreds of crawlable pages — one per card, one per spread — accumulated over
roughly fifteen years, and we have three. **Google has never seen the fan, the
art, or a single generated reading.** No amount of UI quality competes with
content that exists, because the comparison never happens.

### The five things v0.4.0 has to land

1. **A homepage a stranger can read**, and a technical SEO foundation under it:
   sitemap, canonicals, structured data, an `Organization` identity.
2. **Per-locale URLs for public content**, so both halves of a bilingual site
   are indexable — the first and only breach of D6, fenced to §3's route list.
3. **A gallery** of the 22 Major Arcana, which is the one asset a competitor
   cannot copy.
4. **Twenty-two card pages**, each a real answer to a real long-tail query.
   This — not the blog — is what structurally competes with evatarot.
5. **A blog**, and high-quality wallpaper downloads of the art.

### Why the card pages matter more than the blog

Jodith's message proposed a blog and per-card SEO content. The blog is the
smaller half. Twenty-two cards × two locales is **forty-four substantial pages**,
each targeting a query somebody actually types — `arti kartu the moon tarot`,
`the moon tarot meaning`, `kartu death tarot artinya` — and each internally
linking to the other twenty-one and to the gallery. That is the shape of the
site that outranks us. A blog with one article is a single page.

**Indonesian is the priority locale and English is upside.** English "tarot"
head terms are contested by Reddit, Vogue, Biddy and Labyrinthos; we will not
win them in this release and should not plan as if we might. Indonesian
long-tail is thin, and we have native Indonesian copy in three authored voices
that nobody else has. **When effort has to be cut, `id` ships complete and `en`
waits.**

### What v0.4.0 is NOT

- Not a rewrite of the app's locale handling. D6 survives for all nine app
  routes (S-D1).
- Not a content-generation feature. **Nothing in v0.4.0 calls a model, at build
  time or at request time** (S-D7).
- Not a schema change. No table, no column, no migration (S-D14).
- Not paid acquisition, backlink outreach, or a rank-tracking dashboard.
- Not a search feature. We will not emit `SearchAction` markup for a search box
  that does not exist.

---

## 2. Decisions already taken

Settled with Miftah on 2026-07-28. Do not relitigate; raise a flag in your
plan's `## Flags` section instead.

### S-D1 — The locale prefix applies to public content ONLY, and D6 survives everywhere else

Indonesian serves at the bare path; English serves at an `/en/` prefix.
**Only the routes in §3 gain a prefix.** The nine app routes keep resolving
locale from the session claim, then the cookie, then `Accept-Language` — exactly
as W6 built it.

```
https://www.jmtarot.site/arcana/the-moon        →  id   (canonical, x-default)
https://www.jmtarot.site/en/arcana/the-moon     →  en   (canonical)

/                /thessaly           /history            ← D6 INTACT.
/thessaly/daily  /account            /history/<id>         No prefix. No change.
```

The rejected alternatives, with the reason each lost:

- **Indonesian only, D6 untouched.** Cedes English search entirely, and
  retrofitting `/en/` after Google has indexed the bare paths means
  re-canonicalising a live index.
- **`/en/` across the whole app.** Reopens W6, V2 and V7 simultaneously —
  every `<Link>`, the session `loc` claim, `POST /api/locale`, and V7's
  per-locale share-link identity — to add prefixes to nine routes that are
  gated and will never be indexed anyway.

### S-D2 — The prefix is a MIDDLEWARE REWRITE, not a duplicated route tree and not a `[locale]` segment

`/en/gallery` is rewritten to `/gallery` with `x-jmt-locale: en` forwarded on
the request. **There is one route tree.** `await getT()` and `await getLocale()`
already read that header — W6 built exactly this pipe — so every content page is
locale-agnostic code that renders whatever the header says.

```ts
// The shape. S2 owns the real thing.
const stripped = stripLocalePrefix(pathname);          // '/en/gallery' -> { locale: 'en', path: '/gallery' }
if (stripped.locale) {
  const url = request.nextUrl.clone();
  url.pathname = stripped.path;
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, stripped.locale);
  return NextResponse.rewrite(url, { request: { headers } });   // ← `request:` or the RSC tree never sees it
}
```

**`NextResponse.rewrite(url, { request: { headers } })` is the only form that
mutates what a server component sees.** `middleware.ts` already records this trap
for `NextResponse.next()`; it is the same trap and the same silent failure —
`getLocale()` falls through to the cookie and *appears* to work, so the bug
presents as a page that is occasionally in the wrong language.

A `[locale]` dynamic segment was rejected because it makes the segment
mandatory, which puts Indonesian at `/id/gallery` and either forfeits the bare
path or needs the rewrite anyway. Duplicating the tree under `app/en/` was
rejected because twenty-two lore pages become forty-four route files.

### S-D3 — The public content routes are exactly these, and `/cards/` is FORBIDDEN

`/`, `/gallery`, `/arcana/[slug]`, `/blog`, `/blog/[slug]`, plus the `/en/`
twin of each. Nothing else becomes public in v0.4.0.

**`/cards/[slug]` IS NOT AVAILABLE AND THE REASON IS NOT OBVIOUS.**
`public/cards/` already serves 22 `.webp` files at `/cards/*`, **and
`middleware.ts`'s matcher excludes `cards/` by negative lookahead** — twice
over, per its own comment, because the iframe harnesses live there. A page route
under `/cards/` would therefore be un-gated, would never receive
`x-jmt-locale`, and would race a static file for the same path. It would look
like it worked in development and be a different bug on each of three fronts.

`/arcana/` is free, semantically exact, and carries the keyword.

### S-D4 — URL slugs are hyphenated English card names, never the art filename

`the-moon`, not `18_moon`. `wheel-of-fortune`, not `10_wheel_of_fortune`.

`Card.slug` stays what it is — it matches the art filename and 22 committed
assets depend on it. The URL slug is a **second, derived identifier**, and the
two are separate on purpose: one addresses a file, the other addresses a
document a person found by typing words. Underscores and a leading number are
worth nothing in a URL and cost a keyword.

Card names are English in both locales (`## Card data`), so the slug is
identical in both — which is what makes the `hreflang` pair a clean
`/arcana/X` ↔ `/en/arcana/X` mapping with no per-locale slug table.

The full mapping is §3.2. It is derived by a pure function, asserted against a
committed table, and **the assertion is the point**: a slug is a permanent
public address, so a rename is a 301 nobody will remember to write.

### S-D5 — `/` dual-renders, and it is NOT added to `isPublic()`

Signed out: a static, crawlable landing page. Signed in: the reader picker,
byte-for-byte as today.

**DO NOT ADD `'/'` TO `isPublic()`.** That function short-circuits `decide()`
before the onboarding check, so a signed-in user who has not finished
onboarding would stop being redirected to `/onboarding` and would land on the
picker instead — a route that assumes a completed profile. The correct change is
a **new, explicit clause in `decide()`**: no session and `pathname === '/'`
→ `{ kind: 'next' }`, leaving the signed-in-but-not-onboarded arm exactly where
it is. See §6.1; this is the most security-relevant change in the release and
S1 owns it alone.

This also closes a blocker recorded in CLAUDE.md for two releases: *"What blocks
publishing is Google's branding requirement of an app homepage that is not a
login page."* One change, two problems.

### S-D6 — Lore and article prose NEVER enter the i18n catalog

I9: the client is shipped exactly one catalog, as JSON, from the server.
Twenty-two lore pages × two locales inside `src/lib/i18n/locales/id.ts` would
ship every word of every card's lore to **every visitor of every page**,
including the draw screen. `id.ts` is 843 lines today; this content is an order
of magnitude larger.

Prose lives in `src/content/**`, one module per locale per artifact, imported
only by the page that renders it, rendered on the server. **Only chrome keys**
— `gallery.title`, `arcana.upright`, `blog.readMore` — go in the catalog, and
they go in `id.ts` first so a missing English string is a red typecheck (I2).

### S-D7 — Every byte of public content is authored once and committed. No model call on any public route, at any time

VD7, unchanged and absolute. `/s/` established it: a session-less public route
with a model call behind it is `LLM_WINDOW_CALL_CEILING` with no gate in front
of it. The lore and the article are written during implementation, reviewed by
a human, and committed as source. **No `/api/` route is added for content in
v0.4.0**, and no build step calls a model.

Corollary for the authoring itself: the copy constraints in `## Copy
constraints` bind this content exactly as they bind a generated reading —
Indonesian is Indonesian and not Malay, and **no therapy, diagnosis, treatment
or trauma-healing language, in either locale**. The English tic list applies
too. §11.4 makes this a test rather than a promise.

### S-D8 — The share button on a public page is Web Share API plus clipboard, and never `/api/share`

`SHARE_ENTITIES` is **not** extended. `src/lib/share/**` mints 60-bit capability
URLs for private artifacts and requires a session; a lore page's URL is already
public and is already its canonical address. Minting a `/s/<slug>` for it would
manufacture a **`noindex` duplicate of a page we are trying to get indexed** —
the opposite of the release's purpose — and would spend a rate-limit budget to
do it.

The control is `navigator.share()` where available, `navigator.clipboard`
otherwise, on the canonical URL of the page you are standing on. No session, no
network, no row.

### S-D9 — Wallpapers are derivatives of the committed source art. The art is NEVER regenerated

`assets/major_arcanas/*.png` — 22 files, 1024×1536, ~3MB each, committed, and
**not currently reachable from the browser**. The pipeline reads those and
writes `public/wallpapers/`. Constraints, all three load-bearing:

- **No regeneration.** Generating the deck is expensive and the current art is
  the product's best asset. `npm run assets` and `tools/gen_card_art.py` are not
  invoked by anything in v0.4.0.
- **No upscaling and no cropping.** 1024×1536 is the true resolution; a 2× export
  is a lie in a filename. Cropping to a phone aspect clips the composition
  (`## Assets` records that the art pads rather than crops for exactly this
  reason). A phone-shaped variant is the native card **centred on a backdrop**,
  not a crop.
- **A new path with its own cache header.** `/wallpapers/*`, never under
  `/cards/*`. That rule is `immutable` for a year on non-content-hashed
  filenames, which `next.config.ts` flags as a real cost; a new asset class with
  a different lifecycle gets its own entry.

### S-D10 — Public content pages set NO cookies and must be CDN-cacheable

`/s/` established the rule and the reason: a stranger who never agreed to
anything should leave with nothing in their jar, and `/privacy` §4.4 is honest
only because that is true. Reading a blog post must also not silently change
the language of a signed-in user's app.

The mechanical reason is as strong: **a `Set-Cookie` makes a response
uncacheable at the edge**, and these are the pages whose TTFB a crawler
measures. `Cache-Control: public, s-maxage=…, stale-while-revalidate=…` on the
content routes, with no `Set-Cookie`, is what makes them fast.

`middleware.ts` already has the precedent — `if (!pathname.startsWith('/s/'))`
guards the cookie write. That condition grows to cover the content routes.

**The root layout stays dynamic (ƒ) and that is accepted, not overlooked.** It
awaits `getLocale()` for `<html lang>` and `## Localization` rule 5 forbids
"fixing" that. Multiple root layouts via route groups would make content pages
statically renderable and were **rejected**: it means deleting the single
`app/layout.tsx`, duplicating `<html>`, the font loading and `LocaleProvider`,
and it puts the app's shell and the content shell permanently out of sync. CDN
caching gets the same TTFB for a crawler at none of that cost.

### S-D11 — One leaf module owns the site origin, and `sitemap.ts` must stay a leaf

`src/app/robots.ts` carries an explicit refusal to import `shareOrigin()` from
`@/lib/share/links`, because that pulls `server-only`, `queries/share.ts` and
the whole Drizzle schema into a route whose output is four lines of text. **The
same argument now binds `sitemap.ts`, `metadataBase`, and every content page's
`generateMetadata`** — and those are the highest-traffic, most cacheable
responses on the domain.

So: a new leaf, `src/lib/seo/origin.ts`, reading `process.env` and nothing else.
**`shareOrigin()` must then delegate to it rather than duplicate it** — two
functions that independently decide what this site's origin is will disagree the
first time the domain changes, and the symptom is a canonical tag pointing at
the wrong host, which is the single worst class of SEO bug because it
de-indexes the correct page.

### S-D12 — `/s/`'s `noindex` must not spread, and the header-ordering trap applies

`next.config.ts` applies **every** matching `headers()` entry and a later one
with the same key wins. `/s/:path*` sits after `/(.*)` on purpose so
`referrer-policy: no-referrer` overrides the global value there. Any new entry
that carries `x-robots-tag` and matches broadly would silently `noindex` the
whole site, and `src/lib/headers.test.ts` is the only thing that would notice.

New rules go **after** `/(.*)` and **before or after `/s/:path*` as their
specificity requires** — and every one of them gets a `headers.test.ts` case
asserting both that it applies where intended and that `/s/` is still
`noindex, nofollow, noarchive`.

### S-D13 — `events.ts` has one owner for v0.4.0, and it is S1

`src/lib/analytics/events.ts` is the closed taxonomy — 60 names, a prop shape
each, two compile-time guards, and **no imports, because it is the data
dictionary people read**. Six workstreams editing it in parallel is the "seven
agents inventing `user_id`" failure the v0.2.0 roadmap names.

Every workstream declares its events in its plan's **`## Analytics deltas`**
section. S1 folds them all in, in one edit. The same rule the v0.2.0 roadmap
applies to `schema.ts`.

Two constraints inherited and easy to breach here: **no free text in
`events.props`, ever** (a lore slug is a closed set and is fine; a search query
or a referrer string is not), and public-page events carry a null `user_id` the
way `share.viewed` does.

### S-D14 — No schema deltas. No migration

All content is static, and downloads are anonymous. If a workstream believes it
needs a column, it says so under **`## Schema deltas`** and stops — a migration
in v0.4.0 also drags in the trap that took production down on 2026-07-28
(`npm run build` applies migrations on Vercel and fails the build if it cannot),
for a release that does not otherwise touch the database at all.

### S-D15 — One helper emits canonical and hreflang. Never hand-written per page

Forty-four pages hand-writing three `<link rel="alternate">` tags is
forty-four chances to emit a non-reciprocal pair, which Google discards
silently — the whole tag set stops working and nothing reports it. `hreflang`
must be reciprocal and must include `x-default`. One function, one test, called
by every content page's `generateMetadata`.

### S-D16 — Structured data we will emit, and the one we will not

`Organization` and `WebSite` on `/`; `BreadcrumbList` on every content page;
`ImageGallery` + `ImageObject` on `/gallery`; `Article` + `ImageObject` on
`/arcana/[slug]`; `Blog` and `BlogPosting` on the blog.

**No `SearchAction`** — there is no site search, and marking up one we do not
have is a lie a crawler can check.

**`FAQPage` markup is not a goal.** Google restricted FAQ rich results to
authoritative government and health sites in August 2023, so the markup buys
approximately nothing for us. Q&A *content* on a lore page is still worth
writing for the reader and for long-tail matching — write the content, do not
build an architecture around the schema.

---

## 3. The route table — the contract every workstream shares

### 3.1 Routes

`P` = public (no session). `A` = app (gated, unchanged). `→` = has an `/en/` twin.

| Route | Kind | Owner | Notes |
|---|---|---|---|
| `/` | **P** → | S1 | Dual render. Landing signed out, picker signed in. **Not** in `isPublic()` (S-D5). |
| `/en/` | P | S2 | Rewrite of `/`. English landing. Signed-in behaviour identical. |
| `/gallery` | **P** → | S3 | 2 × 11 grid, all 22 cards. |
| `/arcana/[slug]` | **P** → | S4 | 22 pages. `[slug]` is S-D4's hyphenated name. |
| `/blog` | **P** → | S6 | Index. |
| `/blog/[slug]` | **P** → | S6 | One article in v0.4.0. |
| `/sitemap.xml` | P | S1 | `src/app/sitemap.ts`. Both locales. |
| `/robots.txt` | P | S1 | Existing `robots.ts`, amended. |
| `/wallpapers/*` | P | S5 | Static assets, own cache header. |
| `/login`, `/terms`, `/privacy` | P | — | Unchanged. Gain a public footer (S1). |
| `/s/[slug]` | P | — | **Unchanged. Stays `noindex`.** |
| `/[reader]`, `/[reader]/[service]` | A | — | Unchanged. D6 intact. |
| `/history`, `/history/[id]`, `/account`, `/onboarding` | A | — | Unchanged. |
| `/api/**` | — | — | **No new route in v0.4.0** (S-D7). |

**`/arcana` with no slug is a 404, deliberately** — `/gallery` is the index and
two indexes of one collection compete with each other. If a future release wants
`/arcana` it 301s to `/gallery`.

*(amended — R6.)* **This sentence contradicted §6.1, which listed `/arcana` as a
negative control, i.e. NOT public — and a non-public path inside the matcher is a
302 to `/login`, not a 404.** S1 read §6.1 and accepted a soft 404; S4 read this
line and asked for a real one. **S4 wins:** `/arcana` is the parent of 22 indexed
URLs and a parent that redirects to a login form is the failure §1's table exists
to describe. `isPublic()` gains `/arcana` as an exact match, `src/app/arcana/page.tsx`
calls `notFound()`, and §6.1's negative controls become `/arcanax` and `/arcana-foo`.

### 3.2 The 22 URL slugs (S-D4)

Derived by a pure function, asserted against this table. **This table is the
contract; a mismatch is a failing test, not a judgement call.**

| id | numeral | `Card.slug` (art) | URL slug |
|---|---|---|---|
| 0 | 0 | `00_fool` | `the-fool` |
| 1 | I | `01_magician` | `the-magician` |
| 2 | II | `02_high_priestess` | `the-high-priestess` |
| 3 | III | `03_empress` | `the-empress` |
| 4 | IV | `04_emperor` | `the-emperor` |
| 5 | V | `05_hierophant` | `the-hierophant` |
| 6 | VI | `06_lovers` | `the-lovers` |
| 7 | VII | `07_chariot` | `the-chariot` |
| 8 | VIII | `08_strength` | `strength` |
| 9 | IX | `09_hermit` | `the-hermit` |
| 10 | X | `10_wheel_of_fortune` | `wheel-of-fortune` |
| 11 | XI | `11_justice` | `justice` |
| 12 | XII | `12_hanged_man` | `the-hanged-man` |
| 13 | XIII | `13_death` | `death` |
| 14 | XIV | `14_temperance` | `temperance` |
| 15 | XV | `15_devil` | `the-devil` |
| 16 | XVI | `16_tower` | `the-tower` |
| 17 | XVII | `17_star` | `the-star` |
| 18 | XVIII | `18_moon` | `the-moon` |
| 19 | XIX | `19_sun` | `the-sun` |
| 20 | XX | `20_judgement` | `judgement` |
| 21 | XXI | `21_world` | `the-world` |

Four cards carry no article (`strength`, `justice`, `death`, `temperance`) and
one drops `of` nowhere (`wheel-of-fortune` keeps it). Both follow from
lowercasing the English name and hyphenating; neither is a special case in code.

---

## 4. The locale mechanism, in one place

Everything in this section is S2's to build and everything else consumes it.

### 4.1 Resolution order on a content route

**The URL wins, and it is the only input.** There is no fallback chain on a
content page, because a page whose language depends on the visitor's cookie
cannot be cached at the edge and cannot be canonicalised.

```
/gallery      → id.  Always. Regardless of cookie, header or session.
/en/gallery   → en.  Always.
```

That is a deliberate departure from `resolveForMiddleware`'s chain, which
remains correct for the app. **A visitor whose browser says `en-GB` landing on
`/gallery` gets Indonesian and is not redirected.** Auto-redirecting a crawler
by `Accept-Language` is how sites accidentally hide half their content from an
index; the language switcher and `hreflang` are the supported answers.

### 4.2 The switcher on a content page is a LINK

`LocaleSwitch` today `POST`s `/api/locale`, which re-mints the session and
writes the cookie. On a content page there is often no session, and the
mechanism is wrong regardless: the sibling URL *is* the other language.

So content pages get a link — `/gallery` ↔ `/en/gallery` — and it must be a
real `<a href>`, so a crawler follows it and discovers the other locale tree.

**The accepted cost, stated so nobody "fixes" it:** a signed-in user who
switches to English while reading the blog and then opens the app is still in
Indonesian there. Making the link also `POST /api/locale` would couple a
CDN-cached public page to a session write — S-D10 — and the app carries its own
switcher in the account menu. `LOCALE_SWITCHER` gates rendering the control, as
it does everywhere; English stays reachable by URL with it off.

### 4.3 `?lang=` still exists and must not fight the prefix

`?lang=en` overrides everything but only when `NODE_ENV !== 'production'`.
On a prefixed path the prefix must win — a rewrite that then gets overridden by
a query parameter is a development-only inconsistency that will waste an hour.

---

## 5. Where prose lives

```
src/content/
  arcana/
    index.ts          the registry: url slug -> loader. PURE, no prose.
    the-moon.id.ts    ONE CARD, ONE LOCALE. Server-imported only.
    the-moon.en.ts
    ...               44 files
  blog/
    index.ts          the registry: slug, date, locales available.
    how-to-read-tarot.id.ts
    how-to-read-tarot.en.ts
  types.ts            PURE. LoreDoc, BlogDoc, the block union.
```

Rules, all of them S-D6 or S-D7 in mechanical form:

1. **No content module is imported by a client component**, and
   `clientBoundary.test.ts` gains `src/content/**` to its fenced list. A lore
   page renders on the server; the zoom overlay in the gallery is a client
   component and receives only what it displays.
2. **`src/content/types.ts` is pure and client-importable**; the prose modules
   are not. Same split as `moderation/types.ts` vs `blocklist.ts`.
3. **Prose is structured data, not a string of HTML.** A typed block union —
   heading, paragraph, list, quote, card-reference — rendered by one component.
   No `dangerouslySetInnerHTML` anywhere in v0.4.0: the CSP is
   `script-src 'self' 'unsafe-inline'` in report-only and the goal is to tighten
   it, not to acquire a new reason it can never be enforced.

   *(challenged and UPHELD — R1.)* S1 asked to carve out JSON-LD, claiming React
   HTML-escapes a `<script>` text child into invalid JSON; S6 independently
   claimed the opposite mechanism. **Both were wrong, and the four-line
   measurement is in the reconciliation:** on react-dom 19.2.8 a plain text child
   round-trips through `JSON.parse` intact. The rule stands with no exception.
   `JsonLd.tsx` additionally pre-escapes `& < >` to `\uXXXX` — not for
   correctness, but because the behaviour is an unspecified React implementation
   detail and a release must not depend on one.
4. **MDX is not added.** `src/app/terms/terms.id.tsx` and `privacy.id.tsx` are
   the existing precedent for long-form bilingual prose in this codebase, and
   they are TSX. A new toolchain, a new build step and a new CSP question buys
   authoring convenience for 45 files written once.

---

## 6. The changes to existing files, and who may make them

**A file listed here has exactly one owner in v0.4.0.** If your plan needs a
change to a file you do not own, put it in your plan's `## Deltas requested`
section and name the owner.

### 6.1 `src/lib/auth/gate.ts` — owner S1. THE SECURITY-RELEVANT ONE

Three changes, and the order matters:

1. `isPublic()` gains `/gallery`, `/arcana/`, `/blog` — **as exact matches and
   one narrow prefix each**, never a widened prefix. `isPublic` is a function
   and not a regex precisely so this reads as code (see its header).
2. `decide()` gains the `/` clause from S-D5. **`'/'` does not go in
   `isPublic()`.**
3. The `/en/` prefix. The gate sees the **rewritten** path if middleware
   rewrites before calling `decide()`, or the raw path if after. **Pick one,
   write it down, and test both spellings** — `/en/gallery` reaching `decide()`
   un-stripped and matching nothing is a 302 to `/login` on an indexable page,
   which is exactly the bug this release exists to remove.

`gate.test.ts` gains a case per new path **and a negative control per path**:
`/gallerywhatever`, `/arcana`, `/blogroll`, `/en/history`, `/en/account`.
**`/en/history` must not be public.** A prefix-stripping bug that makes the
whole app reachable under `/en/` is the worst outcome available in this release,
and it would look like a working feature.

### 6.2 `src/middleware.ts` — owner S2

The rewrite (S-D2), and the cookie-write guard growing from `/s/` to `/s/` plus
the content routes (S-D10). ~~The matcher itself should not need to change; if a
plan thinks it does, that is a flag.~~

*(amended — R7.)* **The matcher MUST change: `wallpapers/` is absent from the
negative lookahead, so a signed-out stranger is 302'd to `/login` on every
wallpaper request.** Verified against the regex. S5 raised the flag this sentence
invited and was right. **Do not add `/wallpapers` to `isPublic()` instead** — that
returns 200 but leaves middleware running, so the locale-cookie write fires and
puts a `Set-Cookie` on a ~550KB static response, making it edge-uncacheable.

*(also amended — R22.)* The guard grows to cover **`/api/events`** as well. It is
in `isPublic()` and *inside* the matcher, so today the beacon collects the locale
cookie that `/s/` refused to set — V7's "a third party must leave with nothing in
their jar" is already narrower than it reads.

### 6.3 `src/app/layout.tsx` — owner S1

`metadataBase` (S-D11). Nothing else. Every existing field has a recorded
reason and `appleWebApp`, `other` and the `viewport` export must survive the
edit — dropping `other` turns Add to Home Screen into a Safari bookmark on iOS
below 17.4.

### 6.4 `next.config.ts` — owner S1

Cache headers for the content routes and `/wallpapers/*`. S-D12's ordering
trap. S5 declares the wallpaper header in its plan; S1 writes it.

### 6.5 Others

| File | Owner | Change |
|---|---|---|
| `src/app/robots.ts` | S1 | `sitemap:` directive. Keep the leaf property (S-D11). |
| `src/app/page.tsx` | S1 | Dual render. |
| `src/lib/analytics/events.ts` | S1 | Everyone's events, one edit (S-D13). |
| `src/lib/i18n/locales/{id,en}.ts` | S1 | Everyone's chrome keys, one edit. `id.ts` first. |
| `src/data/deck.ts` | S4 | `cardUrlSlug`, `cardByUrlSlug`. Pure, no new import. |
| `src/lib/i18n/resolve.ts` | S2 | Prefix strip/build helpers. **Must stay edge-safe: no `server-only`.** |
| `src/components/LocaleSwitch.tsx` | S2 | The link variant. `localeSwitch.test.ts` must stay green. |
| `package.json` | S5 | The wallpaper script. |
| `src/lib/headers.test.ts` | S1 | New cases, and `/s/` still asserted. |
| `src/lib/db/**` | **nobody** | S-D14. |
| `src/lib/share/**` | **nobody** | S-D8. `SHARE_ENTITIES` is not extended. |
| `src/lib/prompt/**`, `src/lib/llm/**` | **nobody** | S-D7. |

---

## 7. The six workstreams

Written in parallel, reconciled after. **§0.1 is the plan index and §0.3 is the
execution order; this section is the scope statement each plan was written
against.** The scope below is what the plan must cover — where the plan and this
section differ on a *detail*, the plan is wrong; where they differ because the
reconciliation changed something, the reconciliation wins.

### S1 — Public surface and technical SEO foundation
**Plan: `docs/plans/2026-07-28-seo-foundation.md` — 22 tasks. Splits into S1a/S1b
(§0.3).**

**The keystone. Every other workstream is blocked on its route table and its
helpers.**

The gate change (S-D5, §6.1). `/` dual render with a real landing page. A
shared public shell — header, the footer Jodith asked for, the entertainment-only
disclaimer, cross-links to gallery/lore/blog. `metadataBase` and the canonical
helper. `src/lib/seo/origin.ts` (S-D11) and the `shareOrigin()` delegation.
`src/app/sitemap.ts`. `robots.ts`'s `sitemap:` line. The JSON-LD builders
(S-D16) as pure functions with tests. Cache headers (S-D10, S-D12). Search
Console verification and the submission procedure, documented in
`docs/DEPLOY-VERCEL.md`.

**Explicitly not S1's:** the `/en/` prefix (S2), any content.

### S2 — Locale-addressable public content
**Plan: `docs/plans/2026-07-28-content-locale-urls.md` — 9 tasks. Tasks 1–3
(`prefix.ts`) BLOCK S1's gate task (§0.3).**

§4, entire. The rewrite. `stripLocalePrefix` / `localePath` as pure, edge-safe,
tested functions. The `hreflang` + canonical + `x-default` helper (S-D15). The
switcher-as-link. The sitemap's second locale — S1 owns the file, S2 owns the
locale expansion, and this is the seam most likely to produce a conflict, so
say precisely which lines each writes.

### S3 — The Gallery
**Plan: `docs/plans/2026-07-28-gallery.md` — 19 tasks. Needs S1a, S4a and S5's
`WallpaperDownload`.**

`/gallery`. 2 columns × 11 rows (§8.1), complete at every width. Existing
`public/cards/thumb/*.webp` at 240×360 — **no new image asset**. Tap to zoom:
name, numeral, keywords, the upright/reversed gloss via `cardMeaning`. A
*Read Lore* link to `/arcana/<slug>`. The download entry point (S5 owns the
asset and the pipeline; S3 owns the control). `ImageGallery` + `ImageObject`.

**Reuse `CardFace` and `CardDetail`.** The `next/image` constraint is real and
recorded on `AccountCard`: `cardThumb` appends `?v=`, and `next/image` refuses a
local `src` with a query string unless `images.localPatterns` is configured.
`CardFace` uses a plain `<img>` and is the answer, not the workaround.

### S4 — Card lore pages
**Plan: `docs/plans/2026-07-28-arcana-lore.md` — 34 tasks (13–33 are one card
each, one shared template). Splits into S4a/S4b; S4a BLOCKS S3, S5 and S6
(§0.3). The largest workstream in the release.**

`/arcana/[slug]`, 22 × 2. `cardUrlSlug` / `cardByUrlSlug` and the §3.2
assertion. The content model (§5) and **44 authored documents**. Each page:
the art, numeral, element, stage, polarity, glyph, upright and reversed
readings, the lore, and honest internal links to the neighbouring cards and the
gallery. `generateStaticParams` over 22 slugs. `Article` + `ImageObject` +
`BreadcrumbList`. The share control (S-D8).

The correspondence engine is already built and grounds this content in
something real rather than invented: `src/lib/numerology/` gives arcana
reduction, `astrology.ts` maps the `glyph` to a sign with element and modality,
and `cards.json` carries `stage`, `polarity`, `element` and a distinct
upright/reversed gloss pair per locale. **Use them. A lore page that contradicts
`cardMeaning()` contradicts the reading the app just gave.**

Miftah's ruling: the lore may be invented where tradition is silent — but it
must not spill how the app works, and **it must not read as filler**. This is
the largest writing task in the release and its quality is the release.

### S5 — High-quality wallpaper downloads
**Plan: `docs/plans/2026-07-28-wallpapers.md` — 7 tasks. Needs S4a's
`cardUrlSlug`. Owns the `WallpaperDownload` component that S3 mounts (R8).**

S-D9, entire. A script under `tools/`, idempotent, in the shape of
`normalize_cards.py`, reading `assets/major_arcanas/` and writing
`public/wallpapers/`. Two variants per card, both derived, neither upscaled nor
cropped. A `package.json` script. The download control's copy in both locales,
the licence line (what a person may do with the image), and the analytics event.
The `/wallpapers/*` cache header declared for S1 to write.

**Size is a real constraint and belongs in the plan, measured rather than
guessed:** 22 cards × 2 variants committed to git and served from Vercel.
Report the total before committing it, and if it is large, say what the
alternative is.

### S6 — The blog
**Plan: `docs/plans/2026-07-28-blog.md` — 15 tasks. Needs S4a's
`src/content/types.ts` and `Prose.tsx`. TWO articles, not one (R5) — the plan was
written for one and the second is purely additive.**

`/blog` and `/blog/[slug]`, both locales. The content model shared with S4 (§5),
so **coordinate with S4 on `src/content/types.ts` — one of you writes it and the
other imports it**. One launch article, `how-to-read-tarot`, in both locales:
general, widely-known method that any tarot reader would recognise, and
**nothing about how JMTarot builds a prompt, chains a reading, or scores a
card's frequency**. `Blog` and `BlogPosting`. Dates, and an author identity
consistent with S1's `Organization`.

---

## 8. Settled design details

### 8.1 The gallery grid is 2 × 11

22 has exactly four divisors — 1, 2, 11, 22 — so 2 columns and 11 columns are
the only column counts that produce a complete rectangle. Miftah's ruling:
**2 columns × 11 rows**, in a phone-width column centred at wider viewports.
No filler tiles, no fake cards, complete at every breakpoint, and consistent
with an app that is deliberately phone-shaped.

11 columns was rejected: each card becomes a ~90px sliver and it reads as a
filmstrip. A 4 × 6 grid with two non-card tail tiles was offered and refused.

**Verify the grid with loop 4, not a screenshot.** `## How to verify things
here` is explicit: neither Chrome available here gives a real phone width — both
floor at ~500px — so a screenshot that *looks* like a phone is not one. A
fixed-width container plus `getBoundingClientRect` and
`scrollWidth > clientWidth` at 320/360/390 is exact for container-driven layout,
and that is precisely what this grid is.

### 8.2 English content is rewritten, not translated

`## Localization` rule 3, applied to static content. The English lore for a card
is authored in English, and the enforcement mechanism generalises: an English
document that reads as a translation of the Indonesian one is a defect a
reviewer can see in five seconds.

### 8.3 The disclaimer appears on every public content page

`common.disclaimer.short` at minimum. W7's constraint is that an
entertainment-only disclaimer appears under every reading and on both pickers;
extending it to pages a stranger reaches first is the same argument, and the
legal exposure is higher, not lower, when the reader has no account.

---

## 9. Environment variables

No new **required** variable. One new optional one, and one existing one whose
scope grows.

```
NEXT_PUBLIC_SITE_ORIGIN=      # S-D11. The canonical origin, e.g.
                              # https://www.jmtarot.site . Falls back to
                              # AUTH_URL's ORIGIN (added by R10 -- production
                              # already sets it, and without this rung a deploy
                              # that forgets the variable emits canonicals at a
                              # vercel.app host, which DE-INDEXES the correct
                              # page and reports nothing), then
                              # VERCEL_PROJECT_PRODUCTION_URL, then VERCEL_URL,
                              # then http://localhost:3001. Absent is fine
                              # locally and WRONG in production: a canonical tag
                              # pointing at a preview host de-indexes the real
                              # page, and nothing reports it.
                              # THE NEXT_PUBLIC_ PREFIX IN THIS NAME IS
                              # MISLEADING AND IS KEPT ANYWAY (R10). AUTH_URL
                              # carries no prefix, so siteOrigin() is
                              # server-only in practice. The fence is what
                              # matters: never import it from a client
                              # component -- it collapses to
                              # http://localhost:3001 in a browser bundle.
                              # PublicShare takes a finished URL as a prop.

LOCALE_SWITCHER=1             # UNCHANGED, scope grows. Still rendering-only,
                              # and English on a content page stays reachable
                              # by URL with it off -- which is now the whole
                              # point, because `hreflang` names that URL to a
                              # crawler regardless of what the UI offers.
```

`GOOGLE_SITE_VERIFICATION` is deliberately **not** a variable: Next's
`verification.google` metadata field takes it, but a DNS TXT record or the
Search Console HTML file is a one-time act, not configuration. S1 documents the
procedure in `docs/DEPLOY-VERCEL.md` and picks one.

---

## 10. Non-negotiables

Inherited from v0.2.0 §1 and still binding: no DB read on the request-render
path, no DB write blocking a response, no prompt text or key in the browser,
Indonesian is not Malay, no therapy or diagnosis language.

New in v0.4.0:

- **No model call on a public route, at build time or request time** (S-D7).
- **No cookie set on a public content page** (S-D10).
- **No prose in the i18n catalog** (S-D6).
- **`/s/` stays `noindex`, and no new route acquires it by accident** (S-D12).
- **No new dependency.** Not MDX, not a schema library, not an image CDN.
  v0.3.0 shipped a CDP client over Node's global `WebSocket` rather than add
  Puppeteer; the bar is that high on purpose.
- **No new design token.** `src/theme/tokens.ts` first, then mirror
  `tokens.css`. No new hex, font size or easing curve without a written reason.
- **A public page must not be able to 500 on a database outage**, because there
  is no database on its path at all. If a content page reads the database,
  something is wrong with the plan. (Three routes already carry this bug —
  `/api/memory/{frequency,summary}` and `/api/persona` 500 instead of 204 — and
  v0.4.0 must not add a fourth.)

---

## 11. Verification

### 11.1 The loops, applied

1. **Vitest** owns everything logic-shaped and it is most of the release: the
   gate's new cases and their negative controls, `stripLocalePrefix` /
   `localePath`, `cardUrlSlug` against §3.2's table, the sitemap's URL set, every
   JSON-LD builder, the canonical/`hreflang` reciprocity, `headers.test.ts`,
   `clientBoundary.test.ts` over `src/content/**`.
2. **Integration** — expected to be untouched. S-D14 means no query changes. If
   a plan adds an integration test, that is a flag.
3. **Loop 4 (fixed-width container + `getBoundingClientRect`)** for the gallery
   grid and for every new page at 320/360/390. §8.1.
4. **Loop 5 (real Chrome over CDP)** for "does the page agree with what it
   sends": the signed-out `/` actually rendering the landing, `/en/gallery`
   actually coming out in English, the switcher link navigating, the download
   actually downloading. **Not for width** — it does not give a phone viewport.
5. **`curl -i`** is the right instrument for most of this release and the
   cheapest: status codes, `Cache-Control`, `Set-Cookie` (there must be none),
   `x-robots-tag`, the canonical and `hreflang` tags in the HTML, and
   `/sitemap.xml` parsing as XML.

### 11.2 A signed-out crawl is the acceptance test

The single check that matters, and it must be run with **no cookie jar**:

```sh
# Every one of these must be 200, must carry no Set-Cookie, and must not
# mention /login.
for p in / /en /gallery /en/gallery /arcana/the-moon /en/arcana/the-moon \
         /blog /en/blog /sitemap.xml /robots.txt; do
  curl -sS -o /dev/null -w "%{http_code} %{url_effective}\n" -L "$BASE$p"
done
```

A 302 anywhere in that list is the release failing at its only purpose.

### 11.3 The tests that must still pass, unchanged

`gate.test.ts` (extended, never weakened), `headers.test.ts` (both `/s/`
assertions), `accountSurface.test.ts`, `localeSwitch.test.ts`,
`page.contract.test.ts` for `/s/`, `clientBoundary.test.ts`,
`queries/contract.test.ts`. **`npm run build` is not optional** — the
TypeScript trap means a green `npm run typecheck` is not an answer, and
`audit:secrets` runs inside the build.

Run `npm test` and `npm run test:integration` **separately**. `npm run test:all`
fails 12–22 of V9's limiter tests as a harness race and its red means nothing.

### 11.4 Two new checks this release needs

- **A copy lint over `src/content/**`.** The Malay grep and the
  therapy/diagnosis list currently run in `npm run smoke -- --all`, against
  *generated* readings. Static content is not generated, so nothing checks it —
  and it is the copy a stranger reads first and the copy that is permanent. A
  unit test over the content modules, reusing the existing word lists rather
  than copying them.

  *(amended — R13.)* **The extraction this asked for has already happened:
  `src/lib/copy/vocab.ts` exports `MALAY`, `THERAPY_ID`, `THERAPY_EN` and
  `EN_TICS`**, deliberately without `server-only` so scripts and tests can both
  import it. Import it; copy nothing. **Two inline copies survive and BOTH stay** —
  `scripts/smoke-llm.ts`'s, because pointing it at `vocab.ts` makes a live LLM
  check stricter in a release that touches no prompt; and `catalog.test.ts`'s,
  because three of its extra words (`kereta`, `bilik`, `cuba`) are ordinary
  Indonesian and merging them would produce false positives against generated
  prose. A false positive in a shared list is how a check gets switched off.
- **A "no prose in the catalog" guard.** S-D6 is the kind of rule that decays;
  a test asserting no value in `locales/{id,en}.ts` exceeds a sane length makes
  it mechanical.

---

## 12. Sequencing

```
S1  ─────────────────────────────────►   keystone. Route table, gate, helpers.
     └── S2 ──────────────────────────►   needs S1's routes; owns the prefix.
     └── S3 ──────────────┐
     └── S4 ──────────────┤              content, parallel once S1 lands
     └── S5 ──────┐       │
     └── S6 ──────┴───────┴──────────►
                          └── RECONCILIATION ──► docs/plans/2026-07-28-RECONCILIATION-v0.4.0.md
```

S1 first and alone. S2 immediately after, because every content page's metadata
depends on its `hreflang` helper. S3–S6 in parallel, with two named seams: S3↔S5
on the download control, S4↔S6 on `src/content/types.ts`.

*(amended — R9. **This diagram is superseded by reconciliation §6.**)* There are
**four** seams, not two, and both S1 and S4 split in half. The two this file
missed: **`cardUrlSlug` has three consumers** (S3, S4, S5) and both S3 and S5
wrote a fallback permitting themselves to author it — two definitions of a
permanent public address, which is the "seven agents inventing `user_id`" failure
this project already documents; and **`jsonld.ts` plus `SITEMAP_PATHS` take
appends from four workstreams**, which conflict textually and must be sequenced so
a sitemap path lands only after its page exists. S1's gate task also blocks on
S2's `prefix.ts` (R11), so "S1 first and alone" is wrong as written.

Plans are written in parallel now, before any code. **The reconciliation is not
optional** — v0.2.0's seven-plan reconciliation is the reason that release
composed, and §6's single-owner table is the thing it will be checking.

---

## 13. Open questions, and what is explicitly out of scope

**Open, and someone must decide before the relevant workstream ships:**

- **Search Console verification method** — DNS TXT vs the HTML file vs the
  metadata tag. S1 picks and documents it. **STILL OPEN.**
- ~~**The committed weight of `public/wallpapers/`.**~~ **CLOSED (R3):** measured
  at **23.77 MB**, 44 files, and Miftah ruled both variants ship. The reduction to
  12.32 MB by dropping the redundant `card` variant was offered and refused.
- ~~**How many blog articles v0.4.0 ships.**~~ **CLOSED (R5): two.** The second is
  `apa-itu-tarot` / `what-tarot-is`, which is what Jodith actually asked for; §7's
  "One launch article" is amended and S6's footer anchors move onto it.
- ~~**`Article` vs `CreativeWork` for a lore page.**~~ **CLOSED:** `Article`.
  `CreativeWork` is its parent, so choosing it communicates strictly less. The
  argument for it was right about the wrong slot — the card is the `about` and our
  painting is the `image`. Consequence: the `BreadcrumbList` middle rung is
  `/gallery`, **never `/arcana`**, because naming a 404 is a machine-readable
  claim that a page exists.
- **NEW, and it is the biggest one (R2):** the lore ships **all 22 cards,
  Indonesian first, English following PER CARD** — not per release. A `hreflang`
  pair naming an English URL that 404s is non-reciprocal, Google discards the
  whole set silently, and nothing reports it. `alternates()` therefore takes the
  set of locales that actually **exist** for a path, not `LOCALES`.
- **NEW (R21), and four plans flagged it independently:** whether a
  `next.config.ts` `Cache-Control` survives a dynamically rendered App Router
  response is **unverified**, and S-D10's whole TTFB argument depends on it. Until
  `docs/workstream-notes.md` records a measured `s-maxage` on the wire, **assume
  the content routes are not edge-cached.** `curl -sI` against a Vercel preview,
  not `npm run dev` — the dev server has no CDN in front of it.
- **NEW (R4):** `/terms` and `/privacy` stop being `noindex`, join the sitemap,
  and get their hardcoded Indonesian `<title>` fixed. All three in one commit.

**Out of scope, recorded so it is not smuggled in:**

- Site search, comments, an email list, an RSS feed.
- Minor Arcana. The deck is 22 cards and every part of this app assumes it.
- Regenerating the art (S-D9), even though `docs/art-inconsistency.md` still
  names it the highest-leverage art fix. It is not v0.4.0's.
- User-generated content of any kind. Every page here is authored and committed.
- Backlink outreach, paid acquisition, rank tracking.
- The three routes that 500 instead of 204 on a database outage. Real, known,
  and not this release's — but do not add a fourth (§10).
