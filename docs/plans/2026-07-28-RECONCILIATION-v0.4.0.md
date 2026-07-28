# v0.4.0 Reconciliation

**Date:** 2026-07-28 (rulings), written 2026-07-29.
**Inputs:** `PUBLIC_RELEASE_ROADMAP_v0.4.0.md` and the six workstream plans written
against it in parallel.

> **THIS FILE OUTRANKS THE ROADMAP, AND THE ROADMAP OUTRANKS EVERY WORKSTREAM
> PLAN.** Where a plan disagrees with a resolution here, the plan is wrong and
> should be edited. Where the roadmap disagrees, the roadmap is wrong; the
> defects it carried are named in §3 rather than silently patched, because the
> failure mode of a corrected document is somebody re-deriving the original
> mistake.

Six plans, 16,012 lines before this pass, **123 tasks**. The swarm largely
self-reconciled — S1 pre-answered most of S2/S3/S4/S6's deltas, S3 read four
sibling plans mid-draft, and S6 revised its own `types.ts` position after S4's
landed. What remains is in this file.

**The headline: the swarm found six defects in the roadmap and two of its own
plans were wrong about the same framework behaviour in opposite directions.**
That second one is why §1 exists.

---

## 1. The measurement that settles the JSON-LD question

**R1. `<script type="application/ld+json">{JSON.stringify(x)}</script>` WORKS.
Roadmap §5 rule 3 stands UNAMENDED, and S1's requested exception is REFUSED.**

S1 flag 2 asked to amend rule 3 because "React HTML-escapes text children, so
every `"` becomes `&quot;` and the block is invalid JSON no crawler parses".
S6 independently asserted the opposite mechanism: that React escapes `&`, so
`Syarat & Ketentuan` becomes `Syarat &amp;amp; Ketentuan` and "the document
parses, every validator passes, and Google reads the entity".

**Both are false.** Measured on this tree's actual versions — react 19.2.8,
react-dom 19.2.8, next 16.2.11:

```
input   { name: 'Syarat & Ketentuan', q: 'a "quoted" thing',
          tag: '</script><script>alert(1)</script>' }

output  {"name":"Syarat & Ketentuan","q":"a \"quoted\" thing",
         "tag":"</script><script>alert(1)</script>"}

        JSON.parse  → OK.   name reads back as  "Syarat & Ketentuan"
```

React 19 does not apply HTML escaping to a text child of `<script>`. `&` stays
literal, `"` stays `\"`, and it applies **script-aware** escaping instead:
`</script` becomes `</script`, which is still valid JSON and still
neutralises the breakout. Neither agent's failure mode exists.

**Resolution.** No `dangerouslySetInnerHTML` anywhere in v0.4.0, as written.
`src/components/JsonLd.tsx` renders a plain text child.

**AND IT PRE-ESCAPES `&`, `<`, `>` TO `\uXXXX` ANYWAY**, which S6 proposed for
the wrong reason and which is right for a different one: the behaviour above is
a React *implementation detail* of how it treats raw-text elements, it is not
specified anywhere we can cite, and a release that depends on it silently breaks
on a React upgrade. Pre-escaping makes the output correct under **both**
behaviours — the escapes are ordinary JSON, so nothing downstream can tell — and
it costs one `.replace()`.

```ts
const encode = (o: unknown) =>
  JSON.stringify(o).replace(/[&<>]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
```

**The test is not "it renders".** It is: render, strip the tags, `JSON.parse` the
result, and assert a value containing `&`, `"`, `<` and the literal `</script>`
round-trips byte-identical. That test fails on both agents' predicted failures
*and* on a future React that starts HTML-escaping. S1's other point survives
and is kept: a test asserting `JsonLd.tsx` is the only file in `src/` emitting an
`ld+json` tag, so a future `script-src` nonce is one prop in one file.

**The generalisable lesson, and it is worth recording where CLAUDE.md's traps
live:** two competent agents reasoned from memory about framework escaping and
produced two confidently-argued, mutually exclusive, both-wrong answers. Neither
ran the four lines that settle it. **Framework behaviour is measured here, never
recalled** — the same rule `docs/provider-comparison.md` learned the hard way
about its own numbers.

---

## 2. Miftah's rulings, 2026-07-28

**R2. All 22 cards. Indonesian first, English follows PER CARD.**

Not per release. S4 flag 3 found the trap: `hreflang` must be reciprocal, and a
pair naming an English URL that 404s is non-reciprocal — Google discards **the
whole set** silently and nothing reports it. So the roadmap's "when effort has
to be cut, `id` ships complete and `en` waits" is correct at release granularity
and *dangerous* at page granularity.

Consequences, all of them binding:

- **`alternates()` takes the set of locales that actually exist for a path**, not
  `LOCALES`. This is a change to S2's signature and it is cheaper now than after
  22 pages exist.
- A card with no English document emits **`id` + `x-default` only**. No `en`
  alternate, no sitemap entry, no `/en/arcana/<slug>` route — it 404s, honestly.
- S4's Task 34 completeness assertion splits per locale: `id` must be complete
  at 22; `en` asserts only that every English document that exists has an
  Indonesian counterpart.
- The release is never in a broken state at any point in the writing order.

**R3. Both wallpaper variants ship. 23.77 MB committed.**

S5 flag 5 offered the reduction to 12.32 MB and it is refused. `card` at native
1024×1536 is the honest maximum resolution of the art and is what somebody wants
for a print, an avatar, or a device the `phone` canvas was not sized for. The
weight is +15% on a `.git` already carrying 71.6 MB of source PNGs.

The redundancy S5 identified is real and is **not** a reason to revisit this: the
`phone` variant contains the `card` variant's pixels unscaled, by design, because
that is what "no upscaling" means.

**R4. `/terms` and `/privacy` become indexable, and both halves happen together.**

S1 flag 7 and S3 flag 16 found this independently. Both pages carry
`robots: { index: false, follow: false }` with the recorded reason *"an indexed
legal page for an app behind auth is noise."* **The app stops being behind auth
in this release**, so the premise expires with it. Three things, in one commit:

1. Drop the `robots` field from both `generateMetadata`/`metadata` exports.
2. Add both paths to `SITEMAP_PATHS`, both locales.
3. **Fix the hardcoded Indonesian `<title>` on both.** `terms/page.tsx:29` is
   `'Syarat & Ketentuan — JMTarot'` and `privacy/page.tsx:26` is
   `'Kebijakan Privasi — JMTarot'`, as **static** `metadata` exports, while the
   body renders per locale through `getLocale()`. So an English reader gets an
   English document under an Indonesian browser tab. **This is the same bug class
   fixed on `/s/` on 2026-07-28** — `<title>` was the last string resolved from
   the wrong input, and `og:title` shares it. Not in any plan; found while
   verifying S1's flag. Convert both to `generateMetadata` and take the title
   from the catalog.

This also resolves S3 flag 16: `jsonld.ts` points `license` and
`acquireLicensePage` at `/terms#9`, and a licence target excluded from the index
was a decision nobody had made on purpose. Now it is indexed.

**R5. The second blog article ships in v0.4.0.**

S6 flag 1 recommended one article plus anchors, and flagged honestly that a
footer link labelled *"what is tarot"* landing two-thirds into a 2,400-word
how-to is a compromise rather than a design. Jodith's request —
*"ttg mitos, fakta, tarot itu apa, manfaat apa"* — gets its own page.

- `apa-itu-tarot` / `what-tarot-is`, ~1,200 words per locale, authored not
  translated (§8.2).
- S6's three footer links (`#what-tarot-is`, `#myths-and-facts`,
  `#what-its-for`) move off the how-to's anchors and onto this article.
- Purely additive to S6's plan: one registry entry, two modules, no code change.
  S6 built it that way deliberately.
- The locale-invariant-anchor test S6 wrote for the how-to applies to this
  document too.

Roadmap §13's open question "how many blog articles v0.4.0 ships" is **closed at
two**, and §7's "One launch article" is amended.

---

## 3. Defects in the roadmap, and their corrections

Named rather than patched, per this file's header.

**R6. §3.1 and §6.1 contradict each other about `/arcana`. §3.1 wins: it is a
REAL 404.**

§3.1: *"`/arcana` with no slug is a 404, deliberately."* §6.1 lists `/arcana` in
the negative-control set, i.e. `isPublic('/arcana') === false` — and a non-public
path inside the matcher is a **302 to `/login`**, not a 404. Two sections, one
URL, different behaviour. S1 read §6.1 and accepted a soft 404 (its flag 6); S4
read §3.1 and asked for a gate clause (its flag 1).

**S4 is right and S1's acceptance is overturned.** S4 named the stake exactly:
`/arcana` is the parent of 22 indexed URLs, and a parent that redirects to a
login form is the failure the roadmap's own §1 table exists to describe. Google
calls a login redirect on a content path a soft 404 and it is a bad signal on the
one subtree this release is built around.

- `isPublic()` gains `/arcana` as an **exact match** alongside the `/arcana/`
  prefix.
- `src/app/arcana/page.tsx` calls `notFound()` unconditionally. One file, four
  lines, an honest 404.
- **S1's objection is answered rather than dismissed:** it argued that widening
  the allowlist for a path with no page is how `isPublic` stops being readable.
  Correct — so the path now *has* a page, and the negative controls in
  `gate.test.ts` change from `/arcana` to `/arcanax` and `/arcana-foo`.
- §3.1's note stands: if a future release wants `/arcana` to be a real index it
  301s to `/gallery`.

**R7. §6.2 was wrong. `src/middleware.ts`'s matcher MUST change.**

§6.2: *"The matcher itself should not need to change; if a plan thinks it does,
that is a flag."* S5 flagged it and is correct. Verified directly against the
matcher regex:

```
MIDDLEWARE RUNS  /wallpapers/18_moon-card.jpg     ← the defect
excluded         /cards/18_moon.webp
excluded         /dukuns/adrian.jpg
```

`wallpapers/` is absent from the negative lookahead, so middleware runs, nothing
in `isPublic()` matches, and **a signed-out stranger is 302'd to `/login` on the
one asset class S5 exists to hand to strangers.** `cards/` and `dukuns/` are
excluded for precisely this reason, and the matcher's own comment predicts the
diagnosis cost: *"gating /cards … does not look like an auth problem, it looks
like missing artwork."*

**Add `wallpapers/` to the lookahead. Do NOT add `/wallpapers` to `isPublic()`
instead** — S5 measured why: that yields a 200 but leaves middleware running, so
the locale-cookie write still fires, putting a `Set-Cookie` on a ~550 KB static
response and making it edge-uncacheable. A direct S-D10 breach on the response
where CDN caching matters most.

**R8. §7's S3/S5 split was ambiguous and both plans claimed the download
control.**

*"S5 owns the asset and the pipeline; S3 owns the control"* — S3 read "control"
as "the component" and wrote one, then deferred after reading S5's plan. That
resolution came from an agent reading a sibling plan, not from the roadmap, so
the sentence would mislead the next release.

**Resolution: S5 owns the `WallpaperDownload` component and its policy module.
S3 owns where it is mounted and nothing else.** The residual one-line
disagreement is settled in S3's favour: S5's seam table says
`{ cardId, urlSlug, from }` and its own component code says `{ card, from }`.
**The code wins** — a `Card` object is one argument that cannot disagree with
itself, where an id and a slug passed separately can.

**R9. §12 named two seams. There are four.**

§12 named S3↔S5 (the download) and S4↔S6 (`src/content/types.ts`). Two more are
just as real, and one of them is the "seven agents inventing `user_id`" failure
the v0.2.0 roadmap warns about, arriving in v0.4.0:

- **`cardUrlSlug` / `cardByUrlSlug` in `src/data/deck.ts` has THREE consumers**
  — S3's lore links, S4 (the author), and S5's `src/lib/wallpaper.ts`. **Both S3
  and S5 wrote a fallback permitting themselves to author it per §3.2.** If both
  take their fallback there are two definitions of a permanent public address.
  **Resolution: S4 authors it, in its own first task, before S3 Task 1 and S5
  Task 4. Both fallbacks are DELETED from their plans, not left as a comment.**
- **`src/lib/seo/jsonld.ts` and `SITEMAP_PATHS` take appends from four
  workstreams** and will conflict textually in git. S1 insists the sitemap set
  stays *exact* rather than a superset, so a path must land **after** its page
  exists. **Resolution: the appends are sequenced S1 → S3 → S4 → S6, each in the
  commit that adds its page.** S3 already built this correctly (its Task 7b adds
  `/gallery` to the sitemap after the page).

**R10. §9's origin chain was missing a rung.**

S1 flag 3. Production already sets `AUTH_URL=https://www.jmtarot.site` and
`docs/DEPLOY-VERCEL.md` §5 leans on it for `shareOrigin()`. Without that rung, a
deploy that forgets `NEXT_PUBLIC_SITE_ORIGIN` emits canonicals at a `vercel.app`
host — **which de-indexes the correct page and reports nothing.**

Chain: `NEXT_PUBLIC_SITE_ORIGIN` → **`AUTH_URL`'s origin** →
`VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → `http://localhost:3001`.

And S-D11's point is answered honestly: the leaf must hold **every** rung
`shareOrigin()` had, or delegating is a behaviour change disguised as a refactor.

**The misleading name is kept.** `AUTH_URL` has no `NEXT_PUBLIC_` prefix, so
`siteOrigin()` is server-only in practice despite the variable I named
`NEXT_PUBLIC_SITE_ORIGIN`. Renaming across a doc, `.env.example` and the Vercel
dashboard buys nothing. **What is required instead is the fence:** the import is
forbidden from client components, and `PublicShare` takes a finished URL as a
prop — never `siteOrigin()`, which collapses to `http://localhost:3001` in a
browser bundle. Add a one-line warning to `.env.example` beside the variable.

**R11. §6.5 put the prefix helpers in the wrong file.**

S2 flag 1. §6.5 assigned them to `src/lib/i18n/resolve.ts`. `gate.ts` must
import them (R14's contract G2) and `gate.ts`'s header forbids the `next/server`
type `resolve.ts` carries. **New pure leaf: `src/lib/i18n/prefix.ts`**, holding
the prefix maths and the content route table. `resolve.ts` gets a pointer comment
and no re-export.

**R12. §6.5's "LocaleSwitch variant" is wrong, and R17 replaces it.**

S2 flag 2. `LocaleSwitch` is `'use client'` and its whole body is the POST state
machine with two deadlines, a retry and the analytics batcher. A variant ships
all of that to the pages whose TTFB a crawler measures, to render two anchors.
`LocaleSwitch.tsx` gains a header pointer and nothing else;
`localeSwitch.test.ts` stays green untouched.

**R13. §11.4's premise was stale.**

S1 flag 1. It told S1 to find the word lists in `scripts/smoke-llm.ts` and
`base.id.ts` and extract them. **`src/lib/copy/vocab.ts` already exists**,
exporting `MALAY`, `THERAPY_ID`, `THERAPY_EN` and `EN_TICS` with no `server-only`
marker precisely so scripts and tests can both import it. S1 imports it and
copies nothing.

**Two inline copies survive and BOTH stay, which is the non-obvious half:**

- `scripts/smoke-llm.ts` keeps its own. Pointing it at `vocab.ts` would make a
  live LLM check strictly stricter (`EN_TICS` has three entries it lacks) in a
  release that touches no prompt. Real debt, not v0.4.0's.
- **`src/lib/i18n/catalog.test.ts`'s Malay list must NOT be merged.** It holds
  six words `vocab.MALAY` does not, and **at least three are ordinary
  Indonesian** — `kereta` is a train, `bilik` is a chamber, `cuba` is also a
  country. Safe against 242 short reviewed strings; a false-positive machine
  against generated prose. *A false positive in a shared list is how a check gets
  switched off.* Two lists, two scopes, and this is the sentence that stops the
  next person tidying them together.

**R14. §4.1 has exactly one carve-out, and it is `/`.**

S2 flag 3. §4.1 says the URL is the only input on a content route. S-D5 makes
`/` dual-render, and pinning `id` there unconditionally hands a signed-in English
querent an Indonesian reader picker. Accepted as S2 resolved it: **`/` with a
session takes the D6 chain; `/` without one is pinned `id`.**

The cost is real and is accepted: **`/` alone cannot be CDN-cached** — three
independent blockers, the dual render, the cookie write, and the D6 chain.

**The alternative was considered and refused.** Moving the picker to `/readers`
so `/` is purely public, session-invariant and cacheable is architecturally
cleaner and breaks `manifest.ts`'s `start_url: '/'` — installed home-screen
instances would land on a marketing page and need a tap, and installed instances
are this product's delivery model. If a crawler's homepage TTFB later proves to
matter, S1 flag 4 names the fix (a middleware rewrite of signed-out `/` to an
internal pinned path) and it belongs in S2's file, not S1's.

**And the gate-ordering contract is S2's, unchanged: STRIP FIRST.** `decide()`
sees the prefix-free path. The argument that settled it is better than the one
the roadmap would have given: **S-D5's `/` clause only works under strip-first**,
because `/en` rewrites to `/`, so the single clause `pathname === '/'` covers the
English landing *and* keeps the signed-in-but-not-onboarded redirect. Under
gate-first, S1 writes `'/' || '/en' || '/en/'` and nobody ever tests `/en` while
half-onboarded. S2's contract G2 — `isPublic()`'s *content clause only* strips,
while `/login`, `/terms`, `/api/*` and `/s/` match the raw path — is kept as
defence in depth, and the reason is exact: unconditional stripping would make
`/en/api/events` public.

---

## 4. Cross-plan conflicts

**R15. ONE language tag convention: the bare `id` / `en`. Never `intlTag()`.**

S3 flag 13, against S1's `website()` builder. Verified:

```
locale.ts:73   return locale === 'id' ? 'id-ID' : 'en-GB';
```

`intlTag('en')` is **`en-GB`**, and V6 chose that deliberately for date and time
formats — a real decision about a real regional variant. But `inLanguage` is a
factual claim a crawler believes, nothing here was written as British English,
and the bare tag is what `<html lang>` already emits. **What must not ship is
`id-ID` on the `WebSite` node and `id` on the 22 `ImageObject`s inside the same
`@graph`.** Binds S1, S3, S4 and S6 identically. Costs nothing — `inLanguage` is
a plain string argument in every builder.

**R16. `src/content/types.ts`: S4 owns it. S6 appends below a marker. Three of
S6's four asks are granted.**

S6 wrote an S4-owns position, then S4's plan landed mid-draft with a materially
different `Block` union and S6 reconciled to it in an `AMENDED` block. Both
converged; ratified:

- S4 defines `Block`, `BlockKind`, `QA`, `LORE_ANCHORS`, `LoreAnchor`, `LoreDoc`.
- S6 appends `BlogDoc` below S4's marker comment and changes nothing above it.
- `Prose.tsx` is the one renderer, with an exhaustive `switch` and a `never`
  default. S6 mounts it and writes no second renderer.

The four field-level asks:

| ask | ruling |
|---|---|
| `heading.id?` | **Granted.** R5's footer anchors require it. |
| `list.ordered` | **Granted.** A how-to has ordered steps; `<ol>` vs `<ul>` is semantics, not styling. |
| `paragraph.text: string \| Inline[]` | **Granted, with the guard below.** |
| `callout` | **Refused.** S6 itself named it the one to refuse first, and nothing breaks. |

**The `Inline[]` ruling deserves its reasoning, because S4's counter-argument is
the better-stated one.** S4's single-string paragraph exists so the copy lint
sees the exact reader string, and that lint is the release's only quality gate on
permanent copy. S6's counter is that an article cannot carry bold lead-ins or
inline links without it — and internal linking is one of the two things the blog
is in this release to do (R5 doubles down on the other).

Granted **because `plainText()` joining spans with the empty string restores the
exact reader string**, so the lint's guarantee is preserved rather than traded.
Two tests make that mechanical rather than promised: `plainText()` asserted
directly against a known paragraph, and S6's adjacency test. **If either is
deleted, revert to S4's union** — the lint outranks the typography.

**R17. `PublicShell` takes a `path`, and mounts `ContentLocaleLink` itself.**

S3 flag 15 found S1 and S2 disagreeing: S1's shell takes
`alternate: { href, label } | null` and expects S2 to supply the href; S2 ships a
`ContentLocaleLink` component and defines no such shape. S3 satisfied S1's prop
from `contentAlternates().languages` — **which is the right instinct**, because
the anchor and the `hreflang` tag then come out of one function and cannot drift
— but it leaves four content pages each writing the same three lines.

Resolution takes both halves: **the `alternate` prop is deleted.
`<PublicShell path="/gallery">` takes the path, and the shell mounts
`<ContentLocaleLink path={path} />`, which reads `contentAlternates()`
internally.** One function behind both the anchor and the tag, one prop, one
mount, zero duplicated decisions. The link stays a real `<a href>` so a crawler
follows it into the other locale tree.

**R18. Events live in the `content.*` namespace, and S3/S4 extend a `surface`
union rather than inventing families.**

S6 flag 7. Three workstreams firing `gallery.viewed`, `arcana.viewed` and
`blog.viewed` gives reconciliation three near-duplicate families to merge — the
failure S-D13 exists to prevent, arriving through the door it left open. S3 and
S4 add `'gallery'` / `'arcana'` to the existing `surface` unions. S1 folds every
name in one edit; the count goes 61 → the agreed total, and **no free text in
`props`, ever** — a card slug and a variant name are closed sets and fine.

Also folded in: S2's D5 asks for one `locale` prop on the content page-view
events. Granted — and S2's argument for adding no event of its own is right:
`locale.changed` means *the stored preference changed*, and following a link
changes nothing.

**R19. `referrerKind()` becomes a leaf module. `ShareViewed.tsx`'s comment is
INVERTED, not deleted.**

S3 flag 3. That comment argued for copying at n = 2. S3 is the third caller and
the stated cost — *"`track.client`'s import graph"* — does not apply to a leaf
with no imports that `track.client` never imports. Accepted. The old comment is
inverted rather than removed, because the failure mode is somebody re-copying it.

**R20. Blog `og:image` inherits a site-level default from S1. No new art.**

S6 flag 2. 2:3 card art on a page whose previews want ~1.91:1 gets
portrait-cropped by every messenger that caches it. S-D9 forbids new derived art
in S6 and S5 owns the pipeline. **S6's preferred option is taken: a site-level
`openGraph` default resolved through `metadataBase`.** Adding a 1200×630 blog
card to S5's scope is the fallback if the default looks wrong, and it is one
canvas in an existing pipeline.

**R21. The cache-header question has ONE owner and it is a blocker on the S-D10
claim.**

**Four plans flagged this independently** — S1 flag 5, S2 flag 11, S3 flag 9,
S4 flag 2 — which is the strongest signal in this reconciliation. Every route in
this app is `ƒ` because the root layout awaits `getLocale()`, and Next sets its
own `Cache-Control` on a dynamic response, which may or may not beat a
`next.config.ts` entry.

- **S1 owns the verification**, since S1 owns the file.
- **It is `curl -sI` against a Vercel preview, not `npm run dev`** — the dev
  server has no CDN in front of it.
- **Until `docs/workstream-notes.md` records a measured `s-maxage` on the wire,
  every workstream assumes the content routes are NOT edge-cached.** Nothing in
  v0.4.0 depends on the cache today; nothing new may.
- ISR is not a fallback: it needs a static root layout, and S-D10 already refused
  multiple root layouts by route group.

**R22. The cookie-write guard extends to `/api/events`, and that closes a
pre-existing hole in V7's guarantee.**

S5 flag 3 and S3 flag 11 found the two halves. `/api/events` is in `isPublic()`
and **inside** the matcher, so middleware's guard —
`if (!pathname.startsWith('/s/') && cookie !== locale)` — writes `jmt_locale` on
the analytics beacon even though the page that fired it was excluded. So V7's
stated *"a third party must leave with nothing in their jar"* is **already
narrower than it reads**: `share.viewed` fires from `/s/` and the beacon collects
the cookie the page refused.

S2's guard grows from `'/s/'` to `/s/`, `/api/events` and the content routes. One
line, and it fixes a live inconsistency between `/privacy` §4.4 and the wire.
**Verify on the wire, not in the source** — both agents flagged it as unconfirmed
and both were reading `gate.ts:67` and `middleware.ts:88`, not a response.

S3 flag 11's second half stands as a watch item: if `gallery.viewed` reads zero
after the first day of traffic, it and V7's never-observed `share.viewed` are one
bug, not two — **check the beacon before the page.**

---

## 5. The single-definition register

Every symbol more than one workstream needs, with its one author. **A second
definition of anything on this list is a reconciliation failure, not a merge
conflict.**

| symbol / file | author | consumers | ordering |
|---|---|---|---|
| `cardUrlSlug`, `cardByUrlSlug` (`src/data/deck.ts`) | **S4** | S3, S5 | S4 first. Both fallbacks deleted (R9). |
| `src/lib/seo/origin.ts` → `siteOrigin()` | S1 | all | S1 first. `shareOrigin()` delegates (R10). |
| `src/lib/seo/jsonld.ts` builders | S1 | S3, S4, S6 append | sequenced S1→S3→S4→S6 (R9) |
| `SITEMAP_PATHS` (`src/app/sitemap.ts`) | S1 | S2 expands locales; S3/S4/S6 append | a path lands **after** its page (R9) |
| `src/lib/i18n/prefix.ts` | S2 | S1 (`gate.ts`) | S2 before S1's gate task (R11) |
| `contentAlternates()`, `sitemapLanguages()` | S2 | S1, S3, S4, S6 | takes the **existing** locale set (R2) |
| `ContentLocaleLink` | S2 | mounted by `PublicShell` only (R17) | — |
| `PublicShell`, footer, `PublicShare` | S1 | S3, S4, S6 | takes `path`, no `alternate` prop (R17) |
| `src/content/types.ts` | **S4** above marker | S6 appends `BlogDoc` below (R16) | S4 first |
| `Prose.tsx` | S4 | S6 mounts it | one renderer, exhaustive switch |
| `WallpaperDownload` + policy module | **S5** | S3 mounts it, props `{ card, from }` (R8) | — |
| `src/lib/analytics/events.ts` | S1 | all declare, S1 folds (R18) | S1 last |
| `src/lib/i18n/locales/{id,en}.ts` | S1 | all declare, S1 folds | `id.ts` first, always |
| `referrerKind()` | S3 | S3, `ShareViewed` | comment inverted (R19) |

---

## 6. Sequencing, corrected

§12's diagram is amended by R9's two extra seams.

```
S1a  origin leaf, metadataBase, jsonld module, PublicShell, events.ts, catalog
 │
 ├── S2   prefix.ts ─┐  (S1's gate task needs prefix.ts — R11)
 │                   ├── S1b  gate.ts, decide(), robots, sitemap, headers
 │                   │
 └── S4a  cardUrlSlug / cardByUrlSlug / content/types.ts / Prose.tsx   ← R9
          │
          ├── S3   gallery      (needs cardUrlSlug + WallpaperDownload)
          ├── S4b  22 id docs, then 22 en docs                        ← R2
          ├── S5   pipeline + WallpaperDownload  (needs cardUrlSlug)
          └── S6   two articles  (needs content/types.ts + Prose)     ← R5
```

**S1 splits in two.** Its helper work is unblocked; its gate task waits on S2's
`prefix.ts`. **S4 splits in two.** Its machinery blocks three workstreams; its
22 documents block nobody.

**And S1 must not deploy alone (S1 flag 9), which no test can catch.**
`Landing.tsx` links to `/gallery`, `/arcana/the-moon` and `/blog`, none of which
exist until S3, S4 and S6 land. **A homepage linking to three 404s is worse than
the redirect it replaced.** Merging S1 to `main` is fine; deploying a build where
`tools/seo/crawl.sh` reports 404 on those three paths is not. The crawl script is
the gate, because the pages are *meant* to be missing at that point.

---

## 7. Accepted costs, recorded so they are not rediscovered as bugs

Each was measured or argued by the plan that owns it. None is a defect.

- **The 240 px thumb is upscaled 1.15×–1.44× on every phone** (S3 F1), and it is
  intrinsic to the 2×11 ruling. A 2-column phone grid cannot be served losslessly
  by a 240 px source at any column width — it needs ≤ 120 CSS px, and 288 px of
  content minus a 12 px gap cannot produce that. Alternatives were the 800×1200
  art (3.7 MB on the page whose Core Web Vitals a crawler measures) or a new
  480×720 variant (out of scope). At ≥ 552 px the column is 238 px and the thumb
  is nearly 1:1. Amend `THUMB_W`'s comment in `tools/normalize_cards.py`.
- **`/gallery` is 3009–3587 px of grid, roughly nine phone screens** (S3 F2).
  "Every row full" is a statement about rows. **Do not paginate** — 22 items
  behind a *Load more* are 22 items a crawler may never reach.
- **The 320 px measure is ~34 characters against the 45–75 guideline** (S6 F4).
  288 px of content at ~8.4 px/char in Cormorant Garamond at 19 px cannot reach
  45; getting there needs ~14 px type, too small for 2,400 words of serif. The
  lever used is padding, 20 → 16. **The next person will reach for a new
  font-size token; §10 forbids one without a written reason and S6's measurement
  is the reason not to.**
- **A stranger's language choice does not survive into the app, either
  direction** (S2 F7). Follows from §4.1 pinning the bare path and S-D10
  forbidding the cookie. A visitor with `en-GB` gets an Indonesian landing page
  and an English login page. Not fixable without breaking one of the two.
- **`next/link` must never cross the `/en/` boundary** (S2 F9). A client-side
  navigation resolves under the same root layout, so Next does not re-render it
  and the page comes out half-translated. Nothing enforces this but the
  `/en`-literal fence and loop 5's check.
- **`/en/history` gets a login redirect for a stranger and a 404 signed in**
  (S2 F8). Deliberate: nothing links it, it is in no sitemap and no `hreflang`
  set. **No content route can produce a login redirect** — that is the property
  that matters.
- **`?lang=` is inert on content routes in every `NODE_ENV`** (S2 F5), which goes
  further than §4.3 asked. `/en/gallery` is how you see the English gallery
  locally, and it is shorter to type.
- **`/id/…` 301s to the bare path** (S2 F4) rather than 404ing, fenced to public
  content paths so `/id/history` and `/id/s/<slug>` pass through to the gate.
- **No share control on `/gallery`** (S3 F7). The artifact worth sharing is a
  card; S4 owns that page and its control.
- **Reversed artwork is absent from `/gallery`; both glosses are labelled**
  (S3 F8). A catalogue asserting an orientation nobody dealt is what the rule
  forbids. A toggle inside the zoom is a different, smaller question.
- **`bodyHash` is manual bookkeeping** (S6 F3) and is the only thing making
  `BlogPosting.dateModified` a fact. The honest alternative is dropping
  `dateModified` entirely, not emitting a date nobody maintains.
- **The share control is invisible without JavaScript** (S6 F5). A dead button is
  worse than no button.
- **`readingMinutes` uses 200 wpm for both languages and nobody has measured
  Indonesian** (S6 F6). Labelled *"sekitar"* / *"about"*, so the exposure is
  small. Same category as `PERSONA_MIN_AGE_SECONDS`.
- **`generateStaticParams` produces `ƒ`, not `●`** (S4 F2). It buys a 404 at the
  routing layer; the TTFB story is entirely R21. Tell a reviewer before they read
  the build output as a defect.

---

## 8. Content-integrity items S4 and S6 raised, which are not optional

- **The Golden Dawn titles and Hebrew letters are RESEARCH TARGETS, not verified
  facts** (S4 F9). Written from one source and from memory. VD4 — no fabricated
  data presented as fact — binds a public page harder than it binds `/account`.
  Each is confirmed by search in its own task with the URL recorded in the
  document header. **Judgement's row is the most likely to be wrong**, because
  the modern outer planets are not in the original system and sources disagree.
- **`Judgement`'s element is `water` in `cards.json` while the Golden Dawn
  attributes the trump to Fire** (S4 F6). Verified. **Do not "fix" `cards.json`**
  — it is generated, S4 does not own the generator, and the reading prompt has
  consumed `element` since the first release. The lore names ours and may note
  the tradition's. The twelve sign-attributed cards' `element` agrees exactly
  with `SIGNS[sign].element`, which is now an asserted invariant and is what
  makes the glyph table trustworthy; the nine planetary ones are editorial and
  deliberately unasserted.
- **Justice has no root card, and it is a tautology not a gap** (S4 F5).
  Verified: `reduce(11) === 11` and `arcanaFor(11)` is Justice — master numbers
  are fixed points per reconciliation §5.3. `rootCardFor` suppresses it. Anyone
  who "restores" the block renders *"Justice reduces to Justice"*; anyone who
  instead changes `reduce` silently rewrites every stored `frequency_verdicts`
  and `personas` row.
- **`EN_TICS` contains `abundance`, which is The Empress's own English keyword**
  (S4 F4). Verified — exactly one collision across all 22 cards. The lint's scope
  is `src/content/**` only; the keyword chip comes from generated `cards.json`.
  **Anyone who widens the lint to the rendered page fails on data S4 does not
  own, concludes the lint is broken, and switches it off.** Same shape for
  `sacred` (The Hierophant), `heal`/`healing` (Temperance, The Star) and
  `shadow work` (The Devil, The Moon).
- **The lint's product-secret list must not contain `' api '`** (S6). It fires on
  `elemen api` — Indonesian for fire — in correct copy. Use `api key` and
  `/api/`. Caught while writing the article, which is the only way it would have
  been caught.
- **No lint can tell whether a page is worth reading** (S4 F10). Every mechanical
  check passes on 22 documents of atmospheric nothing, and that is the release's
  first risk. **The acceptance test is Miftah reading four pages — one per stage
  plus Death — in both locales, on a phone.** Not automatable and this plan does
  not pretend otherwise.
- **The lore pages are the first surface where a stranger looks at the art
  closely** (S4 F7), and `docs/art-inconsistency.md` measures the deck as three
  inconsistent generations — cream frames at 44–49 % luminance against navy at
  8–29 %, cards 12–21 sharing one background. Twenty-two pages in sequence is
  exactly the presentation that makes it visible. **Regenerating is out of scope
  (S-D9) and this release is what will prompt somebody to ask.**

---

## 9. Still open, and who has to close it

- **`/terms` clause 9 needs one sentence per locale granting the wallpaper
  licence** (S5 F2). Clause 9 asserts the artwork is ours and grants no licence;
  its personal-use sentence is scoped to *readings*. A licence that exists only
  in UI copy is the weaker half of the pair, and this release publishes 22 pieces
  of original art at 1024×1536, free, with no account. **R4 makes this more
  pressing, not less** — the clause is now indexed. **Miftah, and possibly the
  lawyer clauses 10–12 are already waiting on.** No renumbering: clause 6's
  sub-numbering is an interface (`CLAUDE.md`, `legal.test.ts`), and clause 9 must
  gain a sentence rather than a sub-clause. If declined, the licence line must
  *describe* rather than *grant*, and somebody must then decide whether a licence
  granting nothing belongs under a download button.
- **Search Console verification method.** S1 picks and documents it in
  `docs/DEPLOY-VERCEL.md`.
- **`Image.Image.getdata` is deprecated in Pillow 12, removed in Pillow 14
  (2027-10-15), and `tools/check_card_art.py:mean_colour` uses it** (S5 F6). The
  two new scripts avoid it. Not v0.4.0's to fix; recorded so it is not discovered
  *during* an art regeneration, which is the one time that script matters.
- **The phone canvas is chosen against a 2026 device census** (S5 F7). 1440×3120
  means no device in common circulation upscales the file; a future 1600-wide
  flagship makes that mildly false. The constraint that does not move is
  1024×1536, so the real answer is regenerating the art at a higher resolution —
  which `art-inconsistency.md` already wants for a better reason.
- **RSS** (S6 F10). Out of scope, and the only one of the five excluded features
  that costs nothing to maintain. Worth revisiting after launch.
- **`GET /api/persona` and `/api/memory/{frequency,summary}` still 500 on a
  database outage.** Pre-existing. §10 forbids a fourth and v0.4.0 adds none —
  `blog.contract.test.ts` and the `/arcana` fence assert no database on any
  content route.

---

## 10. Documentation debts this pass created

To be paid in the commit that closes the release, not before:

1. **`CLAUDE.md`'s `## Localization` says the catalog is "118 keys". It is 242**,
   and 14,354 bytes for `id` / 14,094 for `en` as shipped JSON. Measured. S-D6's
   real cost is the payload, not the line count, and S1's ceilings (320 chars per
   value, longest today 267; 20,000 bytes per catalog) are measured against it.
   **Ceilings, tightened when the catalog shrinks and never widened without a
   written reason** — `LENGTH_BUDGET`'s rule.
2. **`CLAUDE.md`'s `## Assets`** gains `public/wallpapers/` (S5 D7) and the
   `THUMB_W` note from §7.
3. **`CLAUDE.md`'s `## Traps`** gains R1's lesson: framework escaping behaviour
   is measured, never recalled. Two agents, two confident answers, both wrong.
4. **A new `## SEO and the public surface` section in `CLAUDE.md`**, holding
   R6 (`/arcana` is a real 404), R7 (the matcher), R15 (bare language tags),
   R21 (the cache header is unverified until measured) and the
   `noindex`-is-gone-from-`/terms` fact. This file is the evidence; CLAUDE.md
   gets the rules.
5. **`docs/workstream-notes.md`** gains a `## v0.4.0` section per workstream, as
   every release before it has.
