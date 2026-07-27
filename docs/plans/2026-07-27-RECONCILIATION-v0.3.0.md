# v0.3.0 Reconciliation

**Date:** 2026-07-27.
**Inputs:** `PUBLIC_RELEASE_ROADMAP_v0.3.0.md` and the eight workstream plans
written against it, in parallel, by agents that could not talk to each other.

> **THIS FILE OUTRANKS EVERYTHING.** Precedence, highest first: this file →
> `PUBLIC_RELEASE_ROADMAP_v0.3.0.md` → the individual workstream plan →
> `PUBLIC_RELEASE_ROADMAP.md` (v0.2.0) → `docs/plans/2026-07-26-RECONCILIATION.md`.
> Where a workstream plan disagrees with this file, **the plan is wrong and
> should be fixed in place**, not worked around.
>
> Read **§0 first.** It records four defects in shipped code that the planning
> pass found. One makes a v0.2.0 feature permanently broken in a way no test
> notices, and one is a **live security defect**: the rate limiter on the app's
> only public write endpoint can be bypassed with a request header.

---

## 0. Fix these before anything else

Four findings about code that is already deployed. None of them is v0.3.0's work
in the sense of being new; all four are things v0.3.0 would otherwise build on
top of. **§0.4 is a live security defect and is the only one that is exploitable
right now.**

### 0.1 `MEMORY_PROMPT_VERSION` invalidates nothing. Live bug.

`src/app/api/memory/frequency/route.ts`:

```ts
const fresh = cached?.fingerprint === result.fingerprint;
```

`fresh` short-circuits the `||` before `promptVersion` is ever compared — only
`stillTrue` checks it. So for any user whose window has not moved, the cached
`memory-v1` row is served forever, and **bumping the constant changes nothing
for exactly the people who already have one cached.**

That is bad on its own and fatal for V3, whose entire deliverable is replacing
the text those rows contain. Fix it first, in its own commit, and **watch it
fail before fixing it** — write the test that proves a `promptVersion` mismatch
is currently ignored, see it pass against the bug, then fix.

Owner: **V3, Task 4.** Do not let it be folded into a larger commit; the diff
is one line and it should be readable as one line forever.

### 0.2 Four of the six day-summary worked examples recite a tally

`SUMMARY_DELTAS` in `src/lib/prompt/summary.ts` contains
`"Tiga kali hari ini…"`, `"twice it was The Hanged Man"`,
`"The Moon keluar dua kali"`, `"turned up twice"`.

That file's own header says the worked example does more work than the
description. **The examples have been teaching the model the exact behaviour
this release exists to remove.** Rewriting the task instruction while leaving
these in place would have produced a confusing partial fix and a plausible
conclusion that the prompt "just does not listen".

Owner: **V3**, own commit, with a test asserting no `SUMMARY_DELTAS` string
trips the tally grep.

### 0.3 `scripts/smoke-llm.ts` hardcodes the word ceilings

It checks `words > 25` and `words > 45` as literals rather than importing
`FREQUENCY_MAX_WORDS` and `SUMMARY_MAX_WORDS`. That is the fourth-copy drift
`src/lib/prompt/budget.ts` was created to prevent, in the one file whose job is
catching drift. V3 changes both numbers, so this must be fixed in the same
release or the checks silently stop binding.

Owner: **V3, Task 13.**

### 0.4 The `/api/events` rate limiter is bypassable with a request header. LIVE.

Found by V9. **Verified in the file before being written here**, because it is a
security claim about deployed code — `src/app/api/events/route.ts:71-75`:

```ts
function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();   // <-- LEFTMOST
  return request.headers.get('x-real-ip') ?? 'unknown';
}
```

`x-forwarded-for` is a **client-appendable** header, and the leftmost entry is
the one the *caller* supplies. A different value per request is a different
limiter key per request, so the per-IP budget on **the only endpoint in this app
a stranger can write to** is one header away from unlimited. It also prefers the
spoofable header over `x-real-ip`, which is the wrong way round.

The function's own comment argues the endpoint is not worth abusing — only names
from the closed taxonomy are ever written, and `user_id` comes from the session
and never from the body. **That was a defensible v0.2.0 position and v0.3.0
retires it.** V7 makes the app publicly linkable and fires `share.viewed` through
this endpoint anonymously, so its reachability changes by an order of magnitude
in the same release.

Fix, owned by **V9**: a shared `clientIp(h: Headers)` that prefers `x-real-ip`,
falls back to the **last** XFF entry rather than the first, and normalises IPv6
to a /64 — one subscriber is routinely handed 2^64 addresses, so a per-address
budget is no budget at all. It takes `Headers` rather than `Request` so V7's page
and a route handler can share one implementation.

**V9's own `clientIp` is written to be correct whether Vercel appends to or
overwrites `x-forwarded-for`**, because that fact is gated behind its Task 0 (see
§6) rather than assumed.

---

## 1. What the parallel pass got right, and why that matters

Recorded because it is evidence about the method, and because a future session
will otherwise assume the reconciliation is where all the thinking happened.

- **V1 and V3 independently derived the same edge case.** The Shadow Arcana
  collides with the pair exactly when The Fool is in it, because
  `x + 0 ≡ x (mod 22)` and `0` is its only solution in `0..21`. Neither knew the
  other existed. They also split it correctly without coordination: V1 reports
  `shadowIsInPair`, V3 owns what to *say*. That is the seam this reconciliation
  would have drawn anyway.
- **V7 read the satori bundle rather than trusting the brief.** See §5.9.
- **V2 verified VD11's premise in SQL** instead of accepting it from the
  roadmap, and separately found a hole in the roadmap's own schema (§5.2).
- **V8 found a 30-day disclosure hole** in the deletion path that the roadmap's
  VD13 did not see (§5.6).

The conflicts below are the cost of the method. There are eleven and all eleven
are settleable; none required a plan to be rewritten.

---

## 2. Conflicts, resolved

### 5.1 — The `translations` entity set shrinks to two

**Conflict.** V2 implemented roadmap §4 as written: `translations` covers
`reading`, `daily_summary`, `frequency_verdict`, `persona`. V3 asked, as a
*negative* requirement, that `daily_summaries` and `frequency_verdicts` never be
routed through it.

**Resolved: V3 wins. The entity set is `reading` and `persona`.**

`daily_summaries` is unique on `(user_id, reader_id, local_date, locale)` and
`frequency_verdicts` on `(user_id, window_key, locale)`. **Both are already
keyed by locale**, so a language switch is an ordinary cache miss followed by a
regeneration *in the target language* — one model call, exactly what a
translation would have cost, producing better prose than a translation of a
45-word greeting could. This is VD6's own argument, and VD6 already applies it
to `lotus_avatars`; V3 simply noticed it reaches two more tables.

`readings` cannot regenerate — the prose is the artifact, and VD7 makes it
immutable. `personas.user_id` is a **primary key** with a single `locale`
column, so a locale switch there would *overwrite* the persona rather than sit
beside it. Those two need `translations`; the other two do not.

**Consequences.** V2 trims `TRANSLATABLE` to two entities and three fields
(`reading.body`, `reading.gist`, `persona.body`). V2's staleness rule —
`translations.updated_at < source.updated_at` — survives and simplifies:
`personas` maintains `updated_at` by hand, and `readings` is immutable so
`created_at` is its comparand. The roadmap's §4 comment listing four entities is
amended in §6 below.

### 5.2 — `translations` had no staleness key. Roadmap gap, closed.

**Not a conflict — a hole V2 found in my §4.** The table as I specified it could
cache a translation of a body that was later regenerated in place. Resolved with
**no new column**: a translation is stale iff
`translations.updated_at < source.updated_at`. After §5.1 this only has to hold
for `personas` (which maintains `updated_at` by hand inside
`onConflictDoUpdate`, per the `$onUpdate` trap) and `readings` (immutable →
compare `created_at`).

Adopted. V2 also adds `check (source_locale <> locale)`, which is free and
correct.

### 5.3 — `reduce(11)` — the roadmap's formula was wrong

**Conflict with reality, caused by my §5 wording.** I wrote that master numbers
are "preserved only when they appear as a *sum*, never as an input". V1
implemented that literally and flagged the consequence: **November contributes 2
to a life path while the 29th contributes 11.** No November-born person can
reach a master life path through their month.

**Resolved: the roadmap's formula is amended. `reduce` is idempotent — master
numbers are fixed points.**

```
reduce(29) = 11      (unchanged)
reduce(39) = 3       (unchanged: 39 → 12 → 3, and 12 is not a master)
reduce(11) = 11      (WAS 2)
reduce(22) = 22      (WAS 4)
reduce(33) = 33      (WAS 6)
```

This is both simpler to state — *repeatedly sum the digits, halting at 11, 22 or
33* — and what standard Pythagorean practice actually does with an 11th month.
It removes the special case rather than adding one, and `reduce` becomes total
and idempotent, which is a property worth having in a function two workstreams
call.

**Settle this before V8 builds.** Changing it later invalidates every stored
`personas.facts` and every cached verdict. Nothing is built yet, so the cost is
one test in V1.

V1's related note is **accepted as-is**: `birthCard()` in `src/data/deck.ts`
already reduces a birth date by a *different* rule (folds to 0–21, no master
halt) and the two deliberately disagree. Neither is rewritten in terms of the
other. **Write that into `src/lib/numerology/index.ts`'s header**, or someone
will "unify" them.

### 5.4 — Dominance and the composed frequency type: V1 vs V3

**Conflict.** V1 exports `dominanceFor`, `Dominance` and a composed
`frequencyCorrespondence`. V3 keeps `dominanceOf` in
`src/lib/memory/frequency.ts` and composes in `src/lib/memory/shadow.ts`.

**Resolved: V3 owns dominance. V1 drops it.**

V1 itself records that its thresholds are unmeasured guesses and that V3 will
tune them. A constant that one workstream owns and another tunes is the wrong
seam — and dominance is frequency-specific product judgement, which belongs
beside `passesGate`, not in a pure correspondence library that V8 also imports
and has no use for.

**V1's exports lose:** `Dominance`, `dominanceFor`, `frequencyCorrespondence`,
and `dominance` from `ShadowResult`. `shadowArcana(top, second)` keeps returning
`{ top, second, shadow, shadowIsInPair, pulse }`.

**V3 gains the obligation** V1 was carrying: `src/lib/memory/shadow.ts`'s
composed type must itself assert **no count-bearing field of any kind**, with an
exact-key-set test. That assertion is VD2's mechanical enforcement and it must
not be lost in the move — it is the thing that makes it *impossible* for the
prompt to interpolate a tally, rather than merely forbidden.

### 5.5 — The public share page does not translate. V7 overrules V2.

**Conflict.** V2's interface note says V7 should call `translateOrCached()` after
authorizing by slug. V7 refuses to call the translator at all, and refuses even
to *read* an existing `translations` row.

**Resolved: V7 wins, on both halves.**

A public page that can trigger a model call is **a bill with no ceiling,
reachable by anyone holding a slug** — and V7's own §5.11 finding makes that
worse, not better. Reading a cached row is separately refused for a product
reason: the share sheet promises "this is exactly what they will see", and a row
that may or may not exist at view time makes that promise false.

`/s/[slug]` renders `readings.body` verbatim in `readings.locale`, wrapped in
`<div lang>`, with one line of viewer-locale chrome explaining the mismatch.

**Cross-check that must not be missed:** V6's `ReadingView` treats *omitted*
`prose` on a foreign-locale reading as `translating` — so a public page that
passes nothing would spin forever for a stranger. **V7 must pass
`prose={{ kind: 'original' }}` explicitly.** Both plans flagged the risk from
their own side; this is the resolution.

### 5.6 — `share_links` revocation must be inside the deletion transaction

**Not a conflict — a hole in VD13 that V8 found.** `share_links` is
`on delete cascade` from `users`, and that cascade fires at the **hard** delete,
30 days later. So an erasure request would leave a shared persona URL serving
the public for thirty more days.

**Adopted.** The deletion transaction is, in order: **revoke share links →
`redactForUser()` → set `deleted_at`.** V8's ordering argument is also adopted:
redaction runs *before* the flag so that a failure in the statement that
actually removes text aborts the whole thing, rather than marking an account
deleted with a self-harm disclosure intact.

**V7 must export `revokeAllForUser(db: DbOrTx, userId: string): Promise<number>`
and V8 must call it.** Neither may merge without the other; this is the one
hard ordering dependency between two workstreams in the release. V7 is last in
the build order, so **V8 ships the call site behind the import and V7's merge
completes it** — with an integration test in V8 that fails until it does.

V8's two related judgements are **accepted**: `clearFreeTextAnswers()` is
deliberately *not* called (the cascade handles it at the hard delete, and
clearing it now would break the 30-day restore the confirmation copy promises —
the asymmetry with `moderation_flags` is the asymmetry in the foreign keys), and
the session cookie is cleared server-side because there is no JWT revocation.

### 5.7 — The all-time queries move to V8

**Conflict.** Roadmap §6 assigns "all-time top card" to V3 as a `frequency.ts`
extension. V8 wrote `src/lib/db/queries/allTime.ts`.

**Resolved: V8 owns `src/lib/db/queries/allTime.ts`.** V8 is its only consumer,
and the v0.2.0 `queries/` contract says one file per read concern — an unbounded
all-time aggregate is a different concern from a windowed one. §6 is amended.

V8's "no new index" argument is **accepted and is the correct reading of
`schema.ts`**: `reading_cards_user_date_card_idx` is
`(user_id, local_date, card_id)`, and the comment on that index already argues
that its leading-column prefix serves anything `(user_id, card_id)` would. This
is that case.

### 5.8 — `/api/persona` buffers, it does not stream

**Conflict.** Roadmap §6 implies a streaming route. V8 buffers.

**Resolved: V8 wins.** A safety check that must run before the first byte
reaches a browser means the response is buffered regardless; declaring it a
stream would be a lie in the type and an invitation to remove the check. §6 is
amended.

### 5.9 — `next/og` is available; satori cannot decode WebP

**Not a conflict — a defect V7 prevented.** V7 read the allowed-format list out
of the satori bundled in `next@16.2.11`: `[png, apng, jpeg, gif, svg+xml]`, with
`image/webp` explicitly detected and thrown on. **Every card in `public/cards/`
is WebP.** The naive OG image throws at request time, in the one code path
nobody looks at, and the only symptom is a broken preview inside somebody else's
WhatsApp.

**Adopted:** `public/cards/og/<slug>.png` at 200×300, generated by the existing
idempotent `tools/normalize_cards.py`, referenced by absolute URL rather than
`readFile` (`public/` on the function filesystem is untraced). Committed, like
the rest of `public/cards/`, so the deploy does not need Python.

**Note for `next.config.ts`:** `/cards/*` is served with a one-year `immutable`
cache on slug-based, non-content-hashed filenames. The new `og/` subtree
inherits that, which is correct and is also a trap if the art is ever
regenerated — the existing warning in CLAUDE.md now covers one more directory.

### 5.10 — `src/app/[reader]/page.tsx` is edited by both V4 and V5

**Conflict of assumption, not of code.** V5 asks V4 to confirm the account
button lives in an app-wide header slot. **It does not** — V4 chose per-page
mount, deliberately, and its reasoning is adopted (§6): a layout cannot see the
pathname, so suppressing the button on public pages would require a
hand-maintained second copy of `isPublic()`.

The two edits are textually disjoint — V4 adds one import and one line near the
top; V5 replaces the block between the banner wrap and `<Eyebrow>`. **V5 lands
first** (it is the larger change to that file), then V4 adds its line.

**V5's secondary warning is the substantive one and is adopted as a
requirement:** V4's bottom sheet must have a `position: fixed` backdrop that
swallows pointer events, or a horizontal drag intended for the sheet lands in
V5's snap track underneath it. V4 already portals the menu to `document.body`;
the backdrop must additionally set `touch-action: none`.

### 5.11 — The rate limiter's own upgrade trigger has fired

**Not a conflict. The most important open item in the release.**
`src/lib/ratelimit.ts`'s header states the trigger verbatim:

> Swap `hit()`'s body for `@upstash/ratelimit` on Redis **the day a link to the
> app is posted anywhere public** — not at a user count, not at a bill
> threshold.

**V7 is that day, by construction.** V7 raised it; it is escalated to §7 as a
decision for Miftah rather than settled here, because it costs money and adds a
dependency.

Two things that shrink it, both worth recording so the decision is made on the
facts: V7's design means **`/s/[slug]` makes no model call at all** (§5.5), so
the direct unbounded-bill surface the header worries about is not created by the
share page itself. The residual risk is indirect — a public URL means strangers,
some of whom sign up, and the *reading* path's key space is unbounded because
anyone with a Gmail address is a user. That was already true; sharing raises its
likelihood, not its shape.

The header also says the primary control is not code: **a hard spend cap at
z.ai**, which `docs/DEPLOY-VERCEL.md` §2b lists as a required deployment step
and which CLAUDE.md still records as unverified. **That must be confirmed done
before V7 ships**, independent of the Redis decision.

---

## 3. The folded schema

Three new tables and two new columns, unchanged from roadmap §4 except as
noted. **`schema.ts` is still W1's file and still has one owner**; these land as
generated, committed migrations, `generate` + `migrate`, never `push`.

| Table / column | Owner | Amendments from §4 |
|---|---|---|
| `translations` | V2 | `check (source_locale <> locale)` added. `entity` narrows to `'reading' \| 'persona'` (§5.1). Staleness is `updated_at` comparison, no column (§5.2). |
| `share_links` | V7 | Unchanged. Slug is 12 chars, Crockford base32 lowercase, 60 bits (§4 said "opaque"; V7 sized it). |
| `personas` | V8 | Unchanged. `facts` holds V1's `PersonNumbers`, which is **locale-free** so `input_hash` does not churn on a language switch. |
| `users.locale_source` | V2 | Unchanged. Nullable, no default, `$type<LocaleSource>()`. NULL is read as `'chosen'`. |
| `readings.shared_at` | **V6 adds, V7 writes** | V6 lands first and only reads it; a column V6 references must exist in V6's migration. |

**Two type moves into `src/data/types.ts`**, which is W1-owned and has no
imports — that property is what makes both safe:

- `LocaleSource` (V2).
- `ReadingStatus` **moves** from `schema.ts`, with a re-export left behind
  (V6). Required, not cosmetic: `clientBoundary.test.ts` forbids `@/lib/db/` in
  a client component and **its regex matches `import type`**, so `ReadingView`
  cannot name the status union at its current home.

Both are additive edits to one file. V2 lands first.

---

## 4. The event taxonomy: 44 → 61

*(Was 59. **V9 adds two**, after it was created by §7.2's ruling:
`ratelimit.backend_degraded` and `llm.ceiling_reached`. Both earn it. Without the
first, a fall-back to per-instance memory is **invisible**, and the whole of V9
silently reverts to v0.2.0 behaviour for as long as an outage lasts — which could
be weeks, because nothing else about the app changes when it happens. The second
is stated in its own comment as **the replacement for a billing alert, and there
is no other one**: a fixed subscription means abuse produces an exhausted quota
rather than an invoice, and an exhausted quota is invisible until a querent's
reading fails.*

*V9 also adds one prop to an existing name — `reading.rate_limited` gains
`limit: 'user' | 'refusal' | 'global' | 'daily'`. The route deliberately answers
all four ceilings with identical copy, because telling the querent which one they
hit tells a prober which one to work around; **the event is server-side and a
prober cannot read it**, so the data has no reason to be as coy as the response.
Without it, query 9 cannot tell "one user is hammering" from "the day's quota is
gone".)*

Each plan counted only its own additions against 44, so the summaries report
44→45, 44→46, 44→47 and 44→48 independently. **They do not conflict.** The union
is fifteen names — exactly the fifteen roadmap §6 fixed — and the total is 59.

One name is declared by one workstream and fired by another; that is the only
collision:

| Event | Declares | Fires |
|---|---|---|
| `account.opened` | V4 | V4 |
| `account.details_viewed` | **V4** | **V8** |
| `account.deleted` | V8 | V8 |
| `persona.generated` / `persona.viewed` | V8 | V8 |
| `history.viewed` / `history.filtered` / `history.item_opened` | V6 | V6 |
| `share.created` / `.revoked` / `.copied` / `.viewed` / `.cta_clicked` | V7 | V7 |
| `translation.generated` | V2 | V2 |
| `reader.panel_swiped` | V5 | V5 |
| `ratelimit.backend_degraded` / `llm.ceiling_reached` | V9 | V9 |

**V2's `translation.failed` is correctly absent** — failure is an `outcome` prop
on `translation.generated`, which is the better shape. V2 flagged this as
possibly breaking the 59 target; it does not. Roadmap §6 never listed it.

**Two prop rulings:**

- **`reading_id` in `history.item_opened` is fine.** V6 was right to include it
  and right to check: seven existing W4 events already carry `reading_id`, and
  `events.ts`'s own comment says "the ids themselves are recoverable by joining
  `readings` on `reading_id`". Established precedent, scalar, no free text.
- **V7's rule stands for a different reason than V6's precedent suggests.**
  `share.*` events carry `share_links.id` and **never the slug** — not because
  ids are banned, but because a slug is a *capability*. `events` rows survive
  account erasure with `user_id` nulled, so a slug in `props` leaves a live,
  working, public URL in a table that outlives the account that revoked it.

**V4 additionally fires two names that were declared and then orphaned.**
`locale.changed` (W6) and `auth.signed_out` (W4) have both been in the taxonomy
with no call site — the second because **the app has no sign-out control at
all**, which is §7.1. Neither is a new name; both are worth a changelog line,
because "declared and never fired" is a thing this taxonomy can now be audited
for and two is already too many.

**V9 was created after this section was written** and may add names of its own —
a limiter that trips silently is a limiter nobody tunes. Its plan states them and
this table is what has to balance.

---

## 5. Shared files, and who touches them in what order

The five files more than one workstream edits. **Order matters; conflicts here
are the single most likely way this release becomes a mess**, which is the same
sentence v0.2.0's §3 opened with and it was right then too.

| File | Touched by | Order and note |
|---|---|---|
| `src/lib/analytics/events.ts` | V2, V4, V5, V6, V7, V8 | Additive to one type map. Any order; §4 above is the register. W4 still owns the file's rules. |
| `src/data/types.ts` | V2 (`LocaleSource`), V6 (`ReadingStatus`) | V2 then V6. Both additive. |
| `src/lib/prompt/sanitize.ts` | V2 (`terjemahan`), V8 (`sosok`) | The `DELIMITER` alternation currently fences **four** tags — `pertanyaan\|penanya\|jawaban\|riwayat` — and becomes **six**. Both must update the header's count and the test that asserts the set. V2 then V8. |
| `src/lib/i18n/format.ts` | V6 (`formatTime`), possibly V2 and V8 | V6 owns `formatTime`. Anyone else needing a formatter asks rather than adding a second one. |
| `src/app/page.tsx` | V4 (footer switcher removed, `.shell` padding 28→64px) | **Unowned in §8. Assigned to V4.** V3's `FrequencyLine` renders here but V3 does not edit the file. |
| `src/app/[reader]/page.tsx` | V5 then V4 | §5.10. |
| `src/app/api/cron/sweep/route.ts` | V2 (fourth delete) | W7's route. V2's `to_regclass` guard means `'persona'` is in the allowlist from day one and inert until V8 lands — adopted, that is the right shape for a job that must not fail on a table that does not exist yet. |
| `scripts/smoke-llm.ts` | V2, V3, V8 | V3 first (§0.3 plus the shared vocab module below). |
| `src/lib/ratelimit.ts` | **V9 alone** | Its two-function interface (`hit`, `hitGlobal`) is **kept**, which is what makes the swap local — the file's own header says the interface exists for exactly this. V7 and V2 consume it; neither edits it. |
| `src/lib/ratelimit.ts` header, `docs/DEPLOY-VERCEL.md` §2b, `CLAUDE.md`'s spend-cap line | V9 | All three name a z.ai hard spend cap as the primary control and **all three are now factually wrong** (§7.2). V9 carries the exact replacement text. |

### The shared vocabulary module

V1 found that its gloss tests would have to **copy** the Malay list, the therapy
list and the `en` tic list out of `scripts/smoke-llm.ts` — a fourth copy — and
recommended extracting them. V8 independently needs the same lists at *write*
time, because a smoke run three days later cannot un-share a persona.

**Adopted. V3 creates `src/lib/copy/vocab.ts`** (it is already in the smoke
script for §0.3), a plain pure module with **no `server-only` marker** — scripts
import it and `server-only` throws outside a Next server bundle. Consumers: the
smoke script, V1's `glosses.test.ts`, V8's write-time safety checks.

---

## 6. Amendments to `PUBLIC_RELEASE_ROADMAP_v0.3.0.md`

Apply these to the roadmap; they are already binding by this file's precedence.

1. **§5, reduction.** `reduce` is idempotent; 11, 22 and 33 are fixed points.
   Delete "preserved only when they appear as a sum, never as an input" (§5.3).
2. **§5, the frequency mechanic.** Dominance is V3's, not V1's (§5.4).
3. **§4, `translations.entity`.** Two entities, not four (§5.1). Add the
   staleness rule (§5.2) and the `source_locale <> locale` check.
4. **§4, `readings.shared_at`.** Added by V6's migration, written by V7.
5. **§6, module map.** `queries/frequency.ts  V3 EXTENDS (all-time top card)` →
   `queries/allTime.ts  V8. New read concern.` (§5.7)
6. **§6, `/api/persona`.** Buffers, does not stream (§5.8).
7. **§6, add** `src/lib/copy/vocab.ts` (V3), `src/lib/history/` (V6),
   `src/lib/account/delete.ts` (V8), `src/app/s/[slug]/adapt.ts` (V7).
8. **§7, new trap.** Satori cannot decode WebP (§5.9).
9. **§8, build order.** V3 is **not** blocked on V2 — after §5.1, V3 and V2 no
   longer interact. V3 needs V1 only. New order below.
10. **§8, ownership.** Sign-out is V4's (§7.1). `src/app/page.tsx` is V4's.

### Revised build order

```
V1  V9                      parallel, both first. See below for why V9 is here
                            and not in wave 2.
V2  V4  V5                  parallel. No shared files except events.ts.
V3                          needs V1 only (was: V1 + V2).
V6  V8                      need V4's menu for their entry points.
V7                          last. Mounts V6's ReadingView, shares V8's persona,
                            completes V8's revokeAllForUser call site, and is
                            the reason V9 exists.
```

**V9 moved from wave 2 to wave 1 on V9's own argument, and it is a good one:
`hit()` becomes `async`.** V7's plan already contains four synchronous call
sites. Landing V9 after V7 means editing a file V7 has just written, in a
workstream that is already the most security-sensitive in the release — so the
ordering that looks natural (build the thing, then protect it) is the one that
creates the churn. V9 has no dependency on V1 and shares no file with it, so the
two run together at no cost.

### One render-path exemption, granted twice

`/history/[id]` (V6) and `/s/[slug]` (V7) each do **one awaited primary-key read
on the render path**. Both asked; both are granted, on the same ground the
`/onboarding` page already stands on: *the row is the page*. There is nothing to
render without it, so deferring the read buys a spinner and costs a round trip.
v0.2.0 §6's rule bars a DB read that is *in the way of* a byte the user is
waiting for; this is the byte.

`/history` itself reads nothing on the server — the querent's "today" is a fact
the server cannot compute (roadmap §7, `todayKey()`), so the list is
client-fetched. That is correct and is not an exemption.

---

## 7. Rulings — all five settled by Miftah, 2026-07-27

**These were open questions for about an hour. All five are now decided, and the
subsections below are kept as the reasoning that produced each answer, not as
live questions.**

| # | Question | Ruling |
|---|---|---|
| 7.1 | Sign out belongs to nobody | **Build it in v0.3.0.** Fourth item in V4's menu. |
| 7.2 | Redis swap before V7? | **Do the swap.** New workstream **V9**, lands before V7. Plus a fact that changes the threat model — see below. |
| 7.3 | Per-answer clearing on `/account` | **Ships in v0.3.0**, in V8. Decided on evidence: `/privacy` promises it in clauses 3 and 7, both locales. |
| 7.4 | May Margaret be longer? | **Yes, by 30%.** `MARGARET_MULTIPLIER = 1.3` in `budget.ts`, replacing the hand-set `spread3: 55`. |
| 7.5 | A share viewer is cookied without agreeing | **Acknowledged, and hardened.** V7 gains an eight-point security amendment; the third party now gets no cookie at all. |

### V9 asserts no unverified fact, and Task 0 is why

Worth recording because it is the right handling of a research gap rather than a
defect. V9 needed z.ai's subscription terms, Upstash's actual free-tier limits
and Vercel's `x-forwarded-for` ordering; its research subagent had not reported
when the plan was finished. **So the plan asserts none of them.** Thirteen
numbered facts sit in its §1, gated behind **Task 0**, which writes the answers
into the file before any code is written; §0.1 spells out both branches of the
spend-cap question; and `clientIp` is written to be correct whether Vercel
appends to or overwrites the header.

**Do not skip Task 0**, and do not let a later session assume the numbers in §1
were measured. Two of them decide whether Upstash's free tier is viable at all.

### 7.2 changes the threat model, and three documents are now wrong

Miftah's answer carried a fact nothing in the repo records: **the z.ai key is a
fixed annual subscription for coding — not a wallet, not pay-as-you-go.**

That inverts the risk this codebase has been designed against. `ratelimit.ts`'s
header, `docs/DEPLOY-VERCEL.md` §2b and `CLAUDE.md` all name **a hard spend cap
at z.ai as the primary control**, and on a fixed subscription there is probably
no such setting and certainly no bill to cap. **The exposure is not an invoice —
it is quota exhaustion, which is a denial of service against the querent**, and
it is *less* visible than a bill because no billing alert fires. The rate limiter
stops being best-effort insurance and becomes the primary control. V9 owns
correcting all three documents.

There is also a terms question worth stating once, plainly: a subscription sold
for *coding* is backing a public consumer product, and `LLM_API_KEY` is the
single backbone for readings, moderation, gists, summaries, translations and the
persona. If that key is ever revoked, the entire app stops — not one feature.
That is a business risk, not an engineering one, and it is recorded rather than
argued.

---

### The reasoning behind each ruling

### 7.1 Sign out belongs to nobody, and now it does

V4 found that **the app has no sign-out control at all.** `auth.signed_out` is
in the taxonomy and nothing fires it. V4 flagged it specifically so it would not
fall between two workstreams the way `/account` fell between W3 and W7 for an
entire release.

**Assigned to V4**, as a fourth item in the account menu. Recorded here rather
than silently, because the assignment is this file's decision and not the
roadmap's.

### 7.2 The Redis swap — a real decision with a cost

§5.11. The limiter's own header names the trigger and V7 fires it. The options
are: swap to `@upstash/ratelimit` before V7 ships (a dependency and a bill);
ship V7 with the in-memory limiter and accept a best-effort ceiling that
serverless makes per-instance; or ship V7 with sharing behind
`SHARING_ENABLED=0` until the swap lands.

**Independent of that choice: confirm the z.ai hard spend cap is actually set.**
The header calls it the primary control, `DEPLOY-VERCEL.md` §2b calls it
required, and CLAUDE.md still lists it as an unverified deployment step. Nothing
in this repo can enforce it.

### 7.3 Per-answer clearing on `/account` — it ships, and the evidence decided it

Miftah delegated this one. The check I recommended was run, and it answers
itself: **`/privacy` promises per-answer clearing twice, in both locales.**

- Clause 3: *"**You can clear it at any time**, one answer at a time, without
  deleting your account."* / *"**Bisa kamu hapus kapan saja**, satu per satu,
  tanpa menghapus akun."*
- Clause 7, *Your choices*: *"Clear a single answer later, without deleting your
  account."* / *"Menghapus satu jawaban belakangan, tanpa menghapus akun."*

That is a published promise of a control the user cannot perform — **the exact
mistake `/account` itself made for a whole release**, which is the thing V8
exists to end. Deferring it would be committing it a second time while fixing the
first. So: **V8 ships it.** The backend is already built and tested — `DELETE
/api/onboarding/answer/[key]` and `deleteAnswer()` — so this is UI plus wiring.

Two requirements folded into V8's plan, because both are traps it already knows
from another direction: a cleared answer must call `generateLotus` **directly**
and never `scheduleLotusRefresh` (W3's cooldown swallowed exactly this edit once,
leaving `input_hash` byte-identical and the delete button a lie), and the same
reasoning bars `PERSONA_MIN_AGE_SECONDS` from guarding a user-caused
regeneration.

### 7.4 Margaret is allowed to be 30% longer. Closed, in one place.

Miftah: *"based on her character, i think it is fine if she spouts 30% longer
bullshit."* This closes the question `budget.ts` has carried since W6 **and**
V3's restatement of it, which is the point of deciding it once.

**`MARGARET_MULTIPLIER = 1.3`, applied in `budget.ts` to every reader-voiced
ceiling**, replacing the hand-set `spread3: 55`. `spread3` 40 → 52; `daily` and
`yesno` × 1.3; the day summary × 1.3 on top of V3's raise, so 50 → **65** for
Margaret only. The frequency verdict is house voice (M6) and is unaffected.

A multiplier rather than a second hand-set number, because the reason is a fact
about the *reader* and not about `spread3` — her voice rules mandate long
subordinated sentences, and that is equally true of every service she speaks in.
The current 55-against-40 was already 37.5%, so this is close to what was
measured and is now a rule instead of a constant. V3 owns the change; it lands in
`budget.ts` and nowhere else, which is what that file is for.

**The English `spread3` calibration stays unconverged** — Margaret has come in at
157–243 words across runs — and this ruling does not pretend to fix that. It
fixes what the ceiling *should* be; whether she obeys it is still a measurement.

### 7.5 A share viewer is a third party — acknowledged, and hardened

Miftah: *"i understand. please make sure this system can be implemented as secure
as possible."*

Acknowledged as a product fact, and turned into work. V7's plan gains an
eight-point security amendment; the two that matter most were not in any plan
before this ruling:

- **`noindex, nofollow, noarchive` on `/s/*`, plus `Disallow: /s/`.** A 60-bit
  slug is unguessable but not unindexable. Every argument about the slug being a
  capability silently assumes nobody publishes it — one crawler-reachable paste
  and "I sent this to one friend" becomes "this is on Google, permanently, and
  revoking leaves a cache".
- **`Referrer-Policy: no-referrer`.** The slug is in the URL, so any outbound
  navigation leaks the capability in a `Referer` header. This is the only place
  in the app where the URL itself is the secret.

And the direct answer to the concern as stated: **`/s/` is excluded from
middleware's `jmt_locale` cookie write, so a third party now gets no cookie at
all**, with `share.viewed` carrying `user_id: null` and `session_id: null` — a
count, not a tracker. That keeps the sentence V7 is putting in `/privacy` §4.4
true rather than merely honest.

One hole found while writing it: **`view_count` is an unauthenticated write**,
and anyone holding one valid slug can drive unbounded `UPDATE`s. It moves into
`after()` behind V9's limiter and is documented as approximate — or is dropped,
since it is the least valuable thing on the page and the only unauthenticated
write in the release.

---

## 8. Verification, folded

The four smoke additions from roadmap §8, plus what the plans added:

```sh
npm run smoke -- --frequency        # FAILS on a digit or a spelled-out tally,
npm run smoke -- --summary          #   both locales. Window phrases stripped first.
npm run smoke -- --translate        # six real translations, 3 id->en, 3 en->id,
                                    #   fixed hands. Malay grep on id targets ONLY.
npm run smoke -- --persona          # one real persona, whole. READ IT.
```

Three points where the plans strengthened the brief and the strengthening should
survive review:

- **V3's tally check is a pure module, not a word list in the script.** Unlike
  the eleven Malay words, this list has false positives — `sekali` also means
  "very", `once` also means "as soon as", and banning bare `dua` would ban
  `dua kartu itu`. That is the `lagi` trap in a new costume, and it gets the
  same treatment: two tiers, a PASS corpus written alongside the FAIL corpus,
  and the window phrase stripped first because `Tiga belas hari terakhir` is a
  spelled-out number **the prompt instructs**.
- **V7's privacy test asserts `.toSQL()`, not the returned object.**
  `expect(row.question).toBeNull()` passes for a query that selected the column
  and dropped it — by which point it is already in the flight payload. With a
  control proving the query *can* select it.
- **A share link must be opened with no session, in a browser, not with curl.**
  The failure mode is a client component reaching for a session that is not
  there, and curl will not show it. `x-frame-options: SAMEORIGIN` and
  `frame-ancestors 'self'` **must not** become `DENY`/`'none'` — a security
  review of a newly-public page will say otherwise, and the iframe harness is
  this project's only way to drive its own UI.
