# One share link per language, not one per reading

Status: designed 2026-07-28, Miftah's rulings recorded inline.
Supersedes part of `2026-07-28-share-live-locale-design.md` (design A). Design A's
resolver is **correct and untouched**; what it got wrong is how many rows may exist.

## 1. The problem, as reported

> 1. Let's say I got a share link for card session A in English. It opened nicely.
> 2. When I changed the language and created a share link for card session A in
>    Bahasa, somehow the share link in no 1 cannot be opened again.

Two hypotheses were offered. **The second is correct and the first is ruled out.**

Nothing was overwritten. `readings.body` is immutable (VD7) and `translations` is
keyed `(entity, entity_id, field, locale)`, so the English translation row is still
in the table, intact. Only the **address** was lost.

The mechanism is one constraint:

```sql
unique (user_id, entity, entity_id)      -- share_links_user_entity_uq
```

No locale. So `insertOrRotateShareLink` upserts onto it and its `set` clause assigns
**a fresh slug** (`queries/share.ts:75`). Sharing one reading a second time replaces
the address — in any language, **including re-sharing in the same one**. The old slug
is not revoked; it stops existing, because `shareLinkBySlug` matches the live `slug`
column and that column now holds the new value.

And this is currently written down as a *feature* (`queries/share.ts:80-90`):

> Re-sharing is how a querent fixes a link they minted in the wrong language: switch
> language, share again, get a new address showing the new language.

That sentence is the decision being reversed. **An English link and a Bahasa link
were mutually exclusive by construction.**

### 1.1 Two things found while reading the path

**The sheet has no read path, which is why there was no warning.**
`liveShareLinkFor` has **zero production callers** — only tests. `ShareFooter`'s
`link` state starts `null` and only ever holds a link minted in that mount. So
opening the sheet on a reading shared yesterday shows the *create* phase, with no
sign a link exists; the querent mints, the slug silently rotates, and nothing on
screen ever said the old address was about to die. Listing two links means building
that read path, and that is real scope rather than a rename.

**Translation caching already works.** `translateOrCached` is cache-first:
`readCache` → `getTranslation`, `persist` → `putTranslation`. Fresh means
`prompt_version` matches **and** `updated_at >= source.updated_at`. The second view
of one reading in one language costs no model call. Two holes remain, and neither is
this branch's to close by code — see §7.

## 2. Three designs, and why A again

| | Model | Why not |
|---|---|---|
| **A** | one link per `(artifact, locale)` | **chosen** |
| B | one link per artifact, stop rotating the slug on a live re-share | The old URL survives but **changes language**. Minimal and correct, but it does not give the querent an English link *and* a Bahasa link — which is what was asked for. |
| C | viewer-adaptive `/s/` | VD7 forbids generating on the public route, so it can only render a locale that already has a cached row — a stranger reading English still gets Indonesian on a miss. Already lost this argument on 2026-07-28. |

**A. `locale` joins the unique key.** Each language gets its own permanent address.

**Miftah's ruling on revoke: all locales, always.** Revoke is per-**artifact**, not
per-link. One control, killing every address for that reading. Per-locale revoke was
offered and refused on consent grounds: two kinds of "stop sharing" is a UI in which
a querent taps the wrong one, believes the reading is private, and is not. This also
matches V8's deletion path, which already revokes everything a user holds.

## 3. The landmine in the obvious constraint

**`UNIQUE` treats NULLs as DISTINCT in Postgres, and every link minted before design
A has `locale = NULL`.** So the naive four-column constraint would:

1. permit unlimited `locale = NULL` rows for one reading; and
2. **never match a legacy NULL row from `onConflictDoUpdate`'s target** — so
   re-sharing a pre-07-28 link would *insert a second row* instead of rotating,
   leaving the old slug live and unreachable from the UI.

That is precisely the capability-resurrection bug the rotation exists to prevent,
arriving through the back door. The fix is one clause, available because both the
local container and Neon are Postgres 16:

```sql
unique nulls not distinct (user_id, entity, entity_id, locale)
```

NULL becomes a single value for uniqueness. A reading may then hold at most three
rows — one `en`, one `id`, one legacy `NULL` (as-written) — each its own permanent
address, and the conflict target matches all three. **The negative control is a test
that fails by producing two rows** (§6).

## 4. Server path

### 4.1 Schema delta

`0007_share-links-per-locale.sql`:

```sql
alter table share_links drop constraint share_links_user_entity_uq;
alter table share_links
  add constraint share_links_user_entity_locale_uq
  unique nulls not distinct (user_id, entity, entity_id, locale);
```

No backfill and no dedup step: **widening a unique key is always safe**, because
anything unique on three columns is unique on four.

`schema.ts` gains `.nullsNotDistinct()`, and the `locale` column's comment is
rewritten — the pin has changed from *an attribute that gets overwritten* into *part
of the row's identity*.

### 4.2 `insertOrRotateShareLink`

- Conflict target gains `shareLinks.locale`.
- The `set` clause **drops** `locale`. Re-pinning is now a no-op by construction.
  Its current comment argues at length that omitting that line is a bug; **that
  argument inverts, so the comment is rewritten rather than deleted** — the failure
  mode of removing a warning is somebody restoring the behaviour it warned about.
- **The slug still rotates**, now within one locale, so revoke stays permanent for
  an address.

### 4.3 Queries

- `anyShareLinkFor` / `liveShareLinkFor` gain a `locale` parameter. `share.created`'s
  `rotated` must mean "*this locale* had a prior address", not "this reading did".
- **new** `liveShareLinksForArtifact(db, userId, entity, entityId)` → every live row.
  Feeds the sheet's list and revoke-all.
- **new** `revokeArtifactLinks(db, userId, entity, entityId)` → revokes every live
  row, **returning each**, so `share.revoked` keeps its per-address `age_hours` and
  `view_count`.
- `revokeShareLink` and V8's `revokeAllForUser` are untouched.

### 4.4 Mint resolves the pin instead of trusting it

**Miftah's ruling: translate, then pin what exists.** The invariant is *a pinned
locale always has a translation row behind it*, and it is enforced at the one moment
a session and a budget exist:

```
target = await getLocale()

reading.locale === target  ->  pin target, no work
                               (the resolver finds no row and renders as-written:
                                the same prose by a cheaper route)

otherwise                  ->  translateOrCached(reading -> target)
                                 !fellBack  ->  pin target
                                 fellBack   ->  pin NULL
```

**This does not breach VD7.** That rule binds the session-less public page, which
still only ever reads. A mint has `requireUser()`, the `share:create:` budget and
`llm:window` behind it.

`translateOrCached` is the right call and the only one permitted (`putTranslation`
has exactly one caller): cache-first, never throws, and the sharer is normally
already reading in `target`, so the common path is a cache hit costing nothing.

**Pinning `NULL` on a failure is the honest answer.** A row pinned to `en` with no
`en` body is a link that lies about its own language, and the notice that used to
explain a mismatch was deleted on 2026-07-28. `NULL` means as-written, which is true.

**The read this needs is a NEW one, not a widened `ownsShareableReading`.** That
query's comment deliberately keeps its projection to `id` so the querent's words
cannot reach a driver error's bound parameters; `translateOrCached` needs `body`,
`locale`, `reader_id`, `service_id` and `created_at`. A separate read in `links.ts`,
which is already `server-only`.

### 4.5 Latency, and the trap this repeats

A cache miss puts a model call on the mint. `maxDuration` goes **20 → 30**.

**CLAUDE.md's `POST /api/locale` lesson binds here: a bigger server budget is only
safe paired with a bound on the client, or you have merely made the hang longer.**
`ShareFooter.create()` currently has no `AbortController`. It gets one.

### 4.6 Routes

- `POST` — body unchanged (a client still cannot name the locale). Response gains
  `locale`, so the sheet can label the link.
- `DELETE` — still takes `{ id }`, now expanded server-side to every live row sharing
  that row's `(user_id, entity, entity_id)`. One `share.revoked` per row.
- **new** `GET /api/share?entity=&entity_id=` — the live links for one artifact,
  `userId` in the `where`. Fetched when the sheet **opens**, not on mount, so it
  costs nothing until the querent taps share.

### 4.7 Analytics

`events.ts` gains `pinned_locale` on `share.created`. Without it a NULL fallback is
invisible and a working pin cannot be told from a silently degraded one — the same
argument `translation.generated`'s `outcome` prop won.

## 5. Rendering

### 5.1 `/s/[slug]` is untouched

`shareLinkBySlug` → `getTranslation(link.locale)` → `renderedLocale()` already does
the right thing **per slug**. Design A built the whole resolver; it just had one row
to point at. Two rows need no resolver change, and `lang={shownLocale}` stays the
line in that page not to touch.

One knock-on: with §4.4's invariant, a pinned locale always has a row, so the
fall-through-to-as-written branch becomes a genuine edge case — a legacy `NULL` row,
or a body reaped by `deleteOrphans`. **It stays.** It is the honest failure and the
integration test named for historic links depends on it.

### 5.2 The sheet gains a list

| State | What the sheet shows |
|---|---|
| No live links | Today's flow: preview, `share.sheet.create` |
| Link exists for the current locale | That link, copy button, no mint offer |
| Links exist, none for the current locale | The list, plus `share.sheet.createIn` |
| Any link live | `share.sheet.stopAll` at the bottom |

Links are labelled with `locale.name.{id,en}`, which is **already identical in both
catalogs** — correct, because the label names the *link's* language, not the
reader's, so an English link reads "English" to an Indonesian querent.

### 5.3 Copy

New keys, **Indonesian first** so a missing English string is a red typecheck (I2):

- `share.sheet.links` — list heading
- `share.sheet.createIn` — the mint offer, naming the language
- `share.sheet.loading` — the `GET` is in flight

**TWO DEVIATIONS FROM THIS SECTION AS DESIGNED, both found while building:**

1. **`share.sheet.stopAll` WAS NOT ADDED.** `share.sheet.revoke` was repurposed
   instead — "Matikan semua tautan" / "Turn all links off" — because a new key would
   have left the old one dead, and because the string has to stay **entity-neutral**:
   this sheet also mounts with `entity="persona"`, so "stop sharing this *reading*"
   would be wrong there.
2. **`share.sheet.loading` was not in the design and is required.** The sheet opens
   into the `GET`, and a mint is one of the few actions likely to wake a suspended Neon
   compute — so without it the Share button is dead for however long that takes.

`share.sheet.revoked`'s sentence — *"sharing again mints a new address"* — stays true
**within a locale** and is kept.

**AND `createIn`'s ENGLISH WORDING IS NOT WHAT THIS DESIGN SAID.** It shipped as
`Create a link in {language}`, not `Create a {language} link`: the second rendered
**"CREATE A ENGLISH LINK"**, found by driving the real page. The suite could not see it
because the string and the parameter are each correct alone. Any phrasing with an
indefinite article beside an interpolated language name is a coin flip on the next
locale's first letter. The Indonesian needs no article and is deliberately phrased
differently.

### 5.4 Unaffected, and must stay so

- The OG image still carries neither question nor prose (VD18).
- `publicReadingQuery` still builds its projection conditionally.
- The sheet still previews the real page — still the only consent mechanism for the
  question.
- `x-frame-options: SAMEORIGIN`, `frame-ancestors 'self'`, and V7's `/s/:path*`
  header block still **after** the catch-all.
- `ShareFooter` still must not import `@/lib/share/links`.

## 6. Tests

**The regression test that is the whole point:** mint `en`, mint `id`, assert **the
`en` slug still resolves**. That is §1's report, executable. It fails today.

Integration (`share.integration.test.ts`):

- Two live rows for one reading, distinct slugs, each resolving to its own locale.
- Re-sharing the **same** locale still kills the old address — the existing
  revoke-permanence test, re-pointed rather than deleted.
- **The `nulls not distinct` negative control:** two mints with `locale: null`
  produce **one** row, the second rotating the first's slug. Without the clause this
  test fails by producing two rows and leaving the first slug live.
- A legacy `NULL` row plus an `en` mint coexist, and the `NULL` one still resolves —
  the "historic links keep working" guarantee that already has a test named for it.
- `revokeArtifactLinks` kills every locale; all slugs return null.

Unit:

- The pin resolution with `translateOrCached` mocked. Assert specifically that
  **`fellBack` → pin `NULL`**, because pinning a locale with no row behind it is the
  bug the invariant exists to prevent and is invisible otherwise.
- `route.contract.test.ts`: GET requires a session; POST carries `locale`.
- `page.contract.test.ts` and `clientBoundary.test.ts` pass **unchanged**.

Loops, in cost order:

1. `npm test` and `npm run test:integration`, **run separately** — `test:all`'s red
   is meaningless here.
2. `npm run build` — not skippable, per the TypeScript trap.
3. `tools/share-seed.ts` + `share-check.py`, extended to mint both locales for one
   reading and resolve both.
4. Loop 5 (real Chrome over CDP) at a true 390px on the sheet. "Does the UI agree
   with what it sends" is exactly this feature's failure mode.
5. The database-down check, which matters more now that the mint has a model call.

## 7. Open, and not this branch's to close by code

**The translation cache has two holes.** Miftah's ruling: **measure first.**

1. **A translation failing `verifyTranslation` twice is never persisted**, so every
   view pays a fresh model call, forever, invisibly. V2's own rule says that if the
   `invalid` rate exceeds ~2%, **fix the prompt, not the architecture** — and the
   measurement only started working on 2026-07-28 when `bindAnalyticsScope` landed,
   so **nobody has ever read this number.** `docs/analytics-queries.md` gains
   **query 12** — this design said "query 10" and there were already eleven — and it
   is the `translation.generated` outcome breakdown, split by field and by `streamed`.
   A circuit breaker was offered and deferred: it would permanently disable a
   translation that a transient provider blip failed.

   **First reading, local, n=2: no `invalid`, no `failed`.** Not a rate, and recorded
   as such. What it did show is `resolvePin` hitting the cache at 3ms with no model
   call after the page had streamed the translation — the "common case costs nothing"
   claim, observed. **The production read is still owed**; it needs Neon's direct
   string and the table only starts being meaningful from 2026-07-28.
2. `/s/` never generates (VD7), so a pin with no row renders the source. §4.4's
   invariant closes this **for new mints only**; legacy `NULL` rows are as-written by
   definition and correct.

**Mounting `PersonaBlock` on `/s/` is out of scope**, stated so it is not mistaken
for done. The schema change covers `entity='persona'` uniformly, so the pin will be
there and correct on the day V7's persona arm lands — but this branch does not land
it, and the `getTranslation` + `renderedLocale` treatment CLAUDE.md describes is
still owed.

**Design C** — generating both locales at mint — is no longer needed for the
*mismatch*, because a querent can now hold both addresses. It remains the only way to
make a link exist in a language nobody has read yet, and is still uncosted against
`LLM_WINDOW_CALL_CEILING`.
