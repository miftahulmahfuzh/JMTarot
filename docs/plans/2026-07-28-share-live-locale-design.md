# Share links carry the language they were shared in

**Date:** 2026-07-28
**Branch:** `feat/share-live-locale`
**Status:** approved, design A of three

A shared reading renders in the language the sharer was looking at when they minted
the link, not the language the model happened to generate it in. Plus two smaller
fixes that were found while reading the share path.

---

## 1. The problem

V2 made every reading translatable on demand, so a querent whose UI is English can
read an Indonesian reading in English. V7's public page deliberately renders
`readings.body` verbatim and never translates — so the sharer reads English, shares
the link, and the stranger gets Indonesian with a notice explaining why.

`src/app/s/[slug]/adapt.ts` records three reasons for that, and two of them still
stand:

- **VD7** — `readings.body` is immutable and the original is what was shared.
- **VD8 / the quota argument** — the public route must never generate anything. It is
  the one route with no session and no per-user budget, and
  `LLM_WINDOW_CALL_CEILING` is 280 model calls per rolling five hours. One link in a
  large group chat could exhaust it.

The third reason is the one this design overturns:

> Even reading an EXISTING `translations` row would be wrong here: the page would
> then render differently depending on invisible state the sharer cannot see, which
> makes the share sheet's "this is exactly what they will see" preview a lie.

That argument is sound against a *viewer-adaptive* page. It does not bind a page that
renders what the **sharer** was reading, because that is not invisible state — it is
the state the sharer is looking at while they read the sheet. §5 is what makes that
literally true rather than nearly true.

## 2. Three designs, and why A

| | pins | notice | model call on `/s/` | schema |
|---|---|---|---|---|
| **A** | the sharer's view | kept as fallback | never | `+ share_links.locale` |
| B | nothing; serves the viewer's locale from cache | rare | never | none |
| C | A, plus both locales generated at mint | **deletable** | never (mint instead) | `+ share_links.locale` |

**A, chosen.** It matches the requirement as stated — *"show the content of language
as it is shown right now, not as it was predicted back then"* — and it is the only
one of the three that keeps the share sheet's preview promise intact, because what
gets pinned is exactly what the preview renders.

B was rejected on the `adapt.ts` argument above: it reintroduces per-viewer variation
the sharer cannot see.

C is the only design that lets the *"written in another language"* notice be deleted
outright, and it remains the upgrade path. It was not chosen now because it spends one
model call per share against a 280-per-five-hours ceiling, on a feature whose whole
point is being cheap to fan out.

**The notice therefore stays**, and its firing condition changes rather than
narrowing to nothing — see §4.

## 3. Latency

This was the question that prompted the design. Measured against the code, `/s/<slug>`
costs today:

| step | round trips |
|---|---|
| `hit()` + `consume()` | 1 (parallel pair; memory, or one `sin1`→Tokyo hop with Upstash on) |
| `shareLinkBySlug` | 1 indexed read — **this one pays the Neon compute wake** |
| `publicReadingQuery` | 1 |
| `readingCards` | 1 |

Design A adds **one indexed read** on `translations`, served by
`translations_entity_lookup_idx` on `(entity, entity_id, field, locale)`. It is issued
in the same `Promise.all` as `publicReadingForShare` — both are keyed off
`link.entityId` and neither needs the other's result — so the added wall clock is
approximately zero, and the cold path is unchanged because the compute is already
awake by then.

**When `link.locale === reading.locale` the query is wasted.** That is deliberate:
skipping it would require `publicReadingForShare` to return before the decision could
be made, which serialises the two reads to save one round trip on an already-open
connection. Wrong trade.

## 4. Server path

### 4.1 Schema delta

```sql
-- 0005_v7-share-links-locale.sql
alter table share_links add column locale text;
```

**Nullable, and `NULL` means as-written.** Every link minted before this ships has no
pinned locale and the honest behaviour for those is exactly today's behaviour. No
`default`: the correct default would be `readings.locale`, which a migration cannot
know without a join it has no business doing.

Generated with `drizzle-kit generate`, never `push`. **The code that selects this
column must not reach production ahead of the migration** — that is the 42703 outage
of 2026-07-28, where one unapplied migration presented as two unrelated-looking bugs.
`npm run build` running `scripts/db-migrate-deploy.ts` first, and failing rather than
skipping, is what covers it.

### 4.2 Mint

`POST /api/share` resolves the locale from `await getLocale()` and **never from the
request body.** This is V2's rule on `/api/translate`, for V2's reason: a
client-supplied locale can disagree with the session claim and with the dev-only
`?lang=` override, and the client would then appear to be choosing the language. The
wire format does not change.

Re-share re-pins. `insertOrRotateShareLink` already rotates the slug on re-share (and
must keep doing so — un-revoking resurrects a capability the querent deliberately
killed); `locale` joins its update set, so sharing again pins whatever is on screen
now.

### 4.3 Resolve

```ts
const [reading, translation] = await Promise.all([
  publicReadingForShare(db, link.entityId, link.includeQuestion, link.includeNickname),
  link.locale
    ? getTranslation(db, {
        entity: 'reading', entityId: link.entityId, field: 'body', locale: link.locale,
      })
    : null,
]);
```

**No staleness check, deliberately.** V2's rule is
`translations.updated_at < source.updated_at`, but VD7 makes `readings.body` immutable
and `ResolvedTranslatable.sourceUpdatedAt` is `created_at` for a reading — so a
reading's translation *cannot* go stale. A staleness branch here would never fire, and
a branch that never fires is a branch nobody can trust.

**A missing row is a normal outcome, not an error.** V2 never persists an unverified
translation (`REPAIR, DO NOT BUFFER`), and the nightly sweep deletes orphans. Miss →
`as-written` → notice. Same as today.

## 5. Rendering

### 5.1 `adapt.ts`

`adaptSharedReading(reading, translation?)` returns
`prose: { kind: 'translated', text: translation.body }` when a row came back, and
`{ kind: 'as-written' }` otherwise.

This is a **legitimate** use of `'translated'`. V7's warning is against using it when
no translation happened — because it renders identically to `as-written` and would
record a translation that did not occur. Here one did occur; it is a row in the table.

### 5.2 `isForeignProse` compares the RENDERED locale

It currently asks `reading.locale !== viewer`. The correct question is now *rendered*
locale versus viewer: `link.locale` when a translation was found, `reading.locale`
otherwise.

The same value feeds the page's `<div lang={…}>`, and that is not cosmetic — it is
what makes a screen reader pronounce English prose as English inside an Indonesian
document, and what points the browser's own translate offer at the right language.

**This is why the notice shrinks rather than disappears.** An English-pinned link
opened by an Indonesian browser is still a mismatch and still gets the notice,
correctly. Deleting the notice requires design C.

### 5.3 The share sheet's preview — the one non-mechanical change

`HistoryDetail:131` passes `preview={reading}`, and `reading.body` is the
**original**. The translated prose lives in that component's own `prose` state and is
never handed to `ShareFooter`; `previewReadingView` hardcodes
`prose: { kind: 'as-written' }`.

Today that is accurate, because the public page also renders the original. **Under
design A it becomes a lie in the opposite direction:** the public page will render
English while the preview shows Indonesian.

So `HistoryDetail` passes its resolved `prose` down, and `previewReadingView` takes it
instead of hardcoding. **A's headline property is not free, and this is the line item
that buys it.** A reviewer checking only the server half would ship a sheet whose
central promise is false.

### 5.4 `Draw.tsx` is untouched by the locale work

A freshly drawn reading is generated in the viewer's locale, so pinned == source,
no translation is looked up, `as-written` renders, and no notice fires. `HistoryDetail`
is the only mount needing the prose pass-through.

### 5.5 Unaffected, and must stay so

- **The OG image (VD18).** It carries neither question nor prose nor nickname, so
  locale is irrelevant to it. `page.contract.test.ts` asserts that and keeps asserting
  it.
- **`page.contract.test.ts`'s session fences** — `currentUser`, `requireUser`,
  `ViewerProvider`, `useViewer`, `cookies()`, `@/lib/auth/*` across the whole subtree.
- **The headers ordering** in `next.config.ts` — `/s/:path*` after the catch-all.

## 6. Two fixes found while reading the share path

### 6.1 `include_nickname` is unconfigurable on the draw screen, and ships a nickname anyway

`ShareFooter.tsx:163` disables the toggle on `!nickname`. `Draw.tsx:608` mounts
`<ShareFooter>` **with no `nickname` prop**, and `/[reader]/[service]/page.tsx` never
fetches one — where `history/[id]/page.tsx:139` does.

So on the draw screen the toggle is disabled. But `includeNickname` state is still
`true`, so `create()` sends `include_nickname: true`, `publicReadingQuery` projects the
column, and the public page renders a nickname that:

- the sharer could not switch off, and
- **never appeared in the preview** — `nicknameLine` is `includeNickname && nickname`,
  which is falsy when `nickname` is `undefined`.

**That is a consent gap, not a cosmetic defect.** Fix: fetch the nickname in
`/[reader]/[service]/page.tsx` the way the history page does, and pass it through.

### 6.2 `/history` has no way home

`/history` mounts `AccountButton` and an `<h1>`, and the only `href="/"` on the page is
inside the *empty* state (`HistoryBrowser.tsx:189`). Once the querent has readings
there is no route home but browser-back.

`history/[id]/page.tsx:146` already has the affordance — a `styles.back` link. Fix is
that same pattern on `/history`, pointing at `/`. One pattern across both history
screens rather than two.

## 7. Tests

- **`adapt` truth table**: translation present/absent × pinned locale matching/not
  matching the source. Four cases, pure, no DOM.
- **The notice's firing conditions**, against the rendered locale rather than the
  source — including the case A does *not* fix (English-pinned, Indonesian viewer).
- **A NULL `locale` renders as-written.** This is the pre-existing-links guarantee and
  the regression that matters most: it is what stops this release changing what an
  already-shared link shows.
- **The resolve fan-out is parallel** — both reads issued before either resolves.
- **`include_nickname` reaches the wire as `false`** when the toggle is off, and the
  draw-screen mount can now reach that state at all.
- **The contract tests in §5.5 stay green**, unchanged.

## 8. Open, and not this branch's to close

- **Design C** remains the only way to delete the notice. Cost is one model call per
  share against `LLM_WINDOW_CALL_CEILING`.
- **`SHARE_RESOLVE_CACHE_MS` is still `0`.** Turning it on buys a window in which a
  revoked link still resolves, and now also a window in which a re-pinned locale is
  stale. Both arguments point the same way: leave it at zero.
- **`share.viewed` has still not been observed firing** (V7's open item, untouched
  here).
