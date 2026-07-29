> **RECONCILED 2026-07-30 — `docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md` OUTRANKS THIS
> PLAN AND THE ROADMAP. Read it before implementing a single task.** The six plans returned
> **51 defects in the roadmap they were reconciling**; nineteen were verified against running
> code and **four would have shipped**.
>
> **Rulings binding on A1:** R1 (**zero-line diff** to `middleware.ts` AND `gate.ts`), R3 (**both FK columns nullable** — `NOT NULL` aborts every hard delete with `23502`), R7 (`harness.ts` TRUNCATE list), R20 (`audit-secrets.ts`; TWO env vars), R23 (**split `allowlist.ts` / `identity.ts`**), R30 (**`recordAdminAccess()` THROWS**), R31 (**five `/privacy` clauses, not two**), R32 (closed `ADMIN_PAGES` list — no uuid in `events.props`), R34, R35, R36, R37 (**`ADMIN_EMAILS` on Production ONLY**), R38.
>
> Where this plan disagrees with a ruling above, **this plan is wrong.** Its unamended text is
> kept deliberately — the reconciliation is an amendment, not a rewrite (the v0.4.0 precedent).

# A1 — Admin Foundation, the Gate, and the Audit Trail — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the surface every other v0.5.0 workstream mounts inside, and build it so
that a signed-in querent who types `/admin` learns nothing — not a 403, not a login form,
not a slower response. Plus the append-only audit trail A5's PII reveal is required to
write before it reveals anything, the three folded event names, `ADMIN_EMAILS`, and the
`/privacy` amendment that stops a live legal document describing a system where nobody
reads your answers.

**Architecture:** `src/lib/admin/allowlist.ts` is a new **pure leaf** (zero imports, no
`process.env`) holding the allowlist parse and the constant-time compare, so the security
decision is unit-testable with no session, no database and no `next-auth` in the module
graph. `src/lib/admin/identity.ts` is the NODE-ONLY half: `requireAdmin()` for route
handlers (the `{ ok }` shape `requireUser()` and `hit()` already use) and
`requireAdminPage()` for server components (it calls `notFound()`). `src/app/admin/` is an
ordinary gated segment — **`src/middleware.ts` and `src/lib/auth/gate.ts` need no code
change at all**, which is §1.3 and is a correction to roadmap §6. `admin_access_log` +
`src/lib/db/queries/admin/audit.ts` is the one write in this project that must *not* fail
silently, and that inversion of W4's rule is stated at the call site because somebody will
otherwise "fix" it for consistency.

**Tech Stack:** Next 16 App Router, React 19, TypeScript 5.9, Vitest 4, Drizzle +
postgres.js. **No new dependency.** Verification is the six loops in `CLAUDE.md`
`## How to verify things here`.

---

## 0. Contract and precedence

`PUBLIC_RELEASE_ROADMAP_v0.5.0.md` outranks this file. Where this plan disagrees with it,
**this plan is wrong** — except where the disagreement is recorded in `## Flags`, which
`docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md` will rule on. `CLAUDE.md` outranks both.

Everything in `PUBLIC_RELEASE_ROADMAP.md` (v0.2.0), `docs/plans/2026-07-26-RECONCILIATION.md`,
`docs/plans/2026-07-27-RECONCILIATION-v0.3.0.md` and
`docs/plans/2026-07-28-RECONCILIATION-v0.4.0.md` still binds. In particular D6 still
binds for the nine app routes, S-D1's `/en/` breach is still fenced to the five content
routes, and **`/admin` is neither.**

### What A1 owns, exhaustively

| File | Change |
|---|---|
| `src/lib/admin/allowlist.ts` | **Create.** PURE LEAF. The parse and the compare. |
| `src/lib/admin/allowlist.test.ts` | **Create.** Loop 1. |
| `src/lib/admin/identity.ts` | **Create.** NODE-ONLY. `requireAdmin`, `requireAdminPage`, `adminNotFound`. |
| `src/lib/admin/identity.contract.test.ts` | **Create.** The source-level fences. |
| `src/lib/db/schema.ts` | `admin_access_log` + its two row types. **No column on any existing table.** |
| `src/lib/db/migrations/0009_v12-admin-access-log.sql` | **Create, GENERATED.** Plus `meta/`. |
| `src/lib/db/testing/harness.ts` | One table name in `resetDb()`'s `TRUNCATE`. |
| `src/lib/db/queries/admin/audit.ts` | **Create.** Handle first. |
| `src/lib/db/queries/admin/audit.contract.test.ts` | **Create.** |
| `src/lib/db/queries/admin/audit.integration.test.ts` | **Create.** Resolves §12.1 mechanically. |
| `src/app/admin/layout.tsx` + `layout.module.css` | **Create.** The shell, `noindex`, `lang="id"`. |
| `src/app/admin/page.tsx` | **Create.** The index. **A4 replaces the body, not the file.** |
| `src/app/admin/pages.ts` | **Create.** `ADMIN_PAGES`, the closed route-template list. |
| `src/app/admin/AdminPageViewed.tsx` | **Create.** The one `admin.page_viewed` mount. |
| `src/app/admin/adminSurface.test.ts` | **Create.** Four fences binding A3–A6 too. |
| `src/lib/analytics/events.ts` | Three folded-in names (A-D18), 67 → 70. |
| `src/lib/analytics/events.test.ts` | The ceiling, and the `page` prop's shape. |
| `src/lib/auth/gate.test.ts` | **New `describe` block. NO change to `gate.ts`.** |
| `src/lib/i18n/prefix.test.ts` | `/admin` negative controls. **No change to `prefix.ts`.** |
| `src/lib/seo/alternates.test.ts` | `contentAlternates('/admin')` throws (A-D3). |
| `src/app/sitemap.test.ts` | `/admin` is absent. |
| `src/app/privacy/privacy.id.tsx`, `privacy.en.tsx` | Clauses 3, 8 (required) and 4, 5, 6 (see §1.5). |
| `.env.example` | `ADMIN_EMAILS`, fully annotated. |
| `tools/admin/probe.sh` | **Create.** The three-identity probe (§5). |
| `docs/workstream-notes.md` | A1's section. |

**Explicitly not A1's:** `llm_calls` and anything about tokens (A2); every query module
under `src/lib/db/queries/admin/` except `audit.ts` (A3); `src/theme/chart.ts`,
`src/components/chart/**`, the body of `/admin` and all of `/admin/tokens` (A4);
`/admin/users`, `/admin/users/[id]`, `/api/admin/users/**` and every reveal component
(A5); the blog CMS and `src/lib/content/lint.ts` (A6). **A1 writes no chart, no table of
users, and decrypts nothing.** It writes the primitive that A5 must call before it
decrypts.

---

## 1. The five decisions this plan makes, one of which closes an open question

### 1.1 §12.1 resolved: `admin_access_log.admin_user_id` is NULLABLE, with `on delete set null`

Roadmap §3.1 says `admin_user_id` is `NOT NULL` and its FK is `on delete set null`, and
tells the plan to resolve the contradiction. **It is resolved in favour of nullable, and
the argument is stronger than the roadmap's "honest resolution" suggests: the other
reading is not merely inconsistent, it is a veto over erasure.**

`ON DELETE SET NULL` against a `NOT NULL` column is not a compile error and not a
migration error. It is a **runtime error at delete time**: Postgres attempts the update,
raises `23502 not_null_violation`, and the `DELETE` on `users` fails. So:

```
admin reads one answer belonging to user U      -> one admin_access_log row
30 days after U asks to be forgotten            -> the sweep hard-deletes U
                                                -> 23502, the transaction aborts
                                                -> U is never erased
```

The sweep would begin failing for **exactly the users an admin had looked at**, which is
the population most likely to include somebody who asked to be forgotten for a reason.
`/privacy` clause 8's *"within {ERASURE_GRACE_DAYS} days the real deletion runs"* would
silently stop being true, and the only symptom is a cron log nobody reads.

Rejected alternatives, recorded so they are not rediscovered:

- **`on delete cascade` on `admin_user_id`.** Deleting the admin's account deletes the
  audit trail. That is A-D16's *"a delete button on an audit trail is the audit trail's
  absence"* wearing a foreign key instead of a button.
- **`on delete restrict` / `no action`.** The same veto as `NOT NULL` + `set null`, just
  named honestly. Also blocks deleting an *admin's* own account forever.
- **An `admin_email` text snapshot to preserve attribution across the nulling.** It would
  work, and it is not in §3.1, and adding a column §3 does not describe is a
  reconciliation defect by §6's own rule. Recorded in `## Flags` instead.

**So both FK columns are nullable with `on delete set null`, `events.user_id` is the
precedent, and the cost is stated:** a NULL `admin_user_id` means *the admin's row is
gone*, not *unknown admin*; a NULL `subject_user_id` means *the subject was erased*. The
second one has a consequence a person can feel and clause 8.1 says so out loud — **after
erasure the audit trail can no longer tell the subject what was read about them**, because
the link to them is what was removed. Same cost `events` pays, stated in the same place.

`audit.integration.test.ts` proves this by **hard-deleting a user who has rows on both
sides and asserting the delete SUCCEEDS.** That test fails against the roadmap's literal
schema, which is the point: it is the resolution made mechanical rather than promised.

### 1.2 404 is a shape, not a status, and this deliberately departs from `requireUser()`

`requireUser()`'s header says the two statuses *"match `gate.decide()` exactly, so a
caller cannot tell whether middleware or the handler refused it"*. **A-D2 wants the
opposite property and it must be written at the call site or somebody will unify them.**
`src/lib/auth/server.ts` is a file people read for the pattern, and 401/403 is the pattern.

Three things follow, and the third is the one that is easy to get wrong:

1. **Pages** — `requireAdminPage()` calls `notFound()`. Next renders
   `src/app/not-found.tsx`, which is the same 404 an unknown reader id produces. Nothing
   in that page knows `/admin` exists.
2. **Route handlers** — `requireAdmin()` returns
   `{ ok: false, response: new NextResponse(null, { status: 404 }) }`. **No body, no
   `error` key, no header.** A JSON `{ error: 'Not Found' }` would be a body no unmatched
   route in this app produces, and *the body is the tell.*
3. **Byte-identity with Next's own 404 for an unmatched `/api/` path is NOT claimed.** A
   route handler cannot render Next's not-found page, and a plan that claims otherwise has
   not checked. What is claimed is: **same status, empty body, no distinguishing header,
   and no timing difference a prober can use** (the gate is one JWE decrypt and a string
   compare — no database, no model call). Task 15's probe prints both responses
   side by side so the residual difference is a measured fact rather than an assumption.

**The refusal must not be logged.** A `console.warn('non-admin hit /admin', { email })` is
the obvious diagnostic and it writes a querent's email into the platform log for the
crime of typing a URL — the fifth W2 trap, arriving by a different door.

### 1.3 `src/middleware.ts` and `src/lib/auth/gate.ts` need NO code change, and roadmap §6 says they do

§6's table assigns `src/middleware.ts` to A1 with the change *"Matcher covers `/admin`"*.
**It already does, and editing it would be wrong.** The matcher is an *exclusion* list
behind a negative lookahead:

```ts
matcher: [
  '/((?!_next/|cards/|dukuns/|wallpapers/|favicon|icon|apple-icon|manifest|sitemap|robots).*)',
],
```

`/admin` is not excluded, therefore middleware runs. Adding `admin` to that regex would
**stop** middleware running, which is the exact inversion of A-D3. The correct A1 change
to `src/middleware.ts` is **zero lines**, and the correct discharge of A-D3's first bullet
is a test.

The same is true of `gate.ts`. Trace `/admin` through the existing chain:

```
/admin
  contentRewrite('/admin', signedIn)   -> passthrough   (not in CONTENT_EXACT/CONTENT_TREES)
  decide({ pathname: '/admin', ... })
    isPublic('/admin')                 -> false         (no clause matches; isPublicContentPath is false)
    !signedIn && pathname === '/'      -> false
    !signedIn                          -> redirect /login          ✔ §10.2
    signedIn && !onboarded             -> redirect /onboarding
    signedIn && onboarded              -> next
  requireAdminPage()                   -> notFound() unless allowlisted   ✔ A-D2
```

```
/en/admin
  stripLocalePrefix -> { locale: 'en', path: '/admin' }
  isContentPath('/admin')              -> false
  => contentRewrite returns passthrough, WITHOUT stripping                ✔ contract G2
  decide({ pathname: '/en/admin' })    -> matches nothing
  signed in + onboarded                -> next -> Next routing -> no route -> 404   ✔
```

**`isPublic()` gains nothing, and that is not a preference — it is a correctness
requirement.** That function short-circuits `decide()` *above* the onboarding check
(S-D5's whole argument), so `/admin` in the allowlist would also make `/admin` reachable
by a signed-out visitor. There is no version of "add `/admin` to `isPublic()`" that is
safe. If a future edit appears to need it, that is a discrepancy to report, not an edit to
make.

**`isContentPath` is not touched either.** `/admin` in `CONTENT_EXACT` would make
`/en/admin` a rewrite target *and* would put `/admin` inside `isPublicContentPath`, i.e.
inside `isPublic()`, by one edit in a file whose header does not mention the gate.
`prefix.test.ts` gets the negative control.

**So A1's gate work is four test blocks and no production line.** That is the honest
shape, and Task 3's acceptance criterion is explicitly *"every new assertion passes
BEFORE any change to `gate.ts`"* — a test that only passes after an edit would mean the
trace above is wrong.

### 1.4 `/admin` is Indonesian inside an app whose `<html lang>` follows the viewer

A-D12 says admin copy is Indonesian, hardcoded, and `t()` is never called under
`src/app/admin/**`. `src/app/layout.tsx` is dynamic *because* it awaits `getLocale()` for
`<html lang>` (Localization rule 5, which capitalises "do not fix this"). Both are right,
and together they produce `<html lang="en">` wrapping Indonesian prose for an
English-preferring admin — a screen reader reading Indonesian with English phonemes, and
markup that lies about itself.

**The fix is `lang="id"` on the admin shell's `<main>`, in the layout, and no admin page
renders its own `<main>`.** V7's `/s/` is the precedent, verbatim: `lang` sits on `<main>`
and comes from *what language the prose is in*, never from the viewer. Two consequences:

- `src/app/admin/layout.tsx` owns the single `<main lang="id">`. `adminSurface.test.ts`
  asserts no file under `src/app/admin/**` contains `<main`, so a page cannot forget by
  introducing a second one.
- **`LocaleSwitch` does not mount here and `LOCALE_SWITCHER` is irrelevant** (A-D12).
  Asserted by the same test. The three mount points in the app are unchanged.

### 1.5 The `/privacy` amendment is clause 3 and clause 8, plus three sentences the roadmap did not name

A-D16 requires clause 3 and clause 8 to gain a sub-clause in both locales, and calls it a
release blocker. Both are correct: clause 3 is a purpose list and *operating the Service*
is a genuinely missing purpose; clause 8 is "what survives erasure" and
`admin_access_log` genuinely survives it.

**But the sentences a reader will point at are in clauses 4, 5 and 6, and none of them is
in A-D16's scope.** Read off the live documents:

| Where | What it says today | Why admin access makes it misleading |
|---|---|---|
| `privacy.en.tsx:148` | *"Three parties, and no others."* | A reader takes this as an exhaustive answer to "who sees my answers". It is an answer about *third parties*; a person does not read it that narrowly. |
| `privacy.en.tsx:231` | *"field encryption protects against a leaked copy of the database, not against a running application that has been compromised"* | This paragraph exists to state the limit honestly. There is now a second limit — an operator entitled to decrypt — and omitting it from the one paragraph about limits is the worst place to omit it. |
| clause 6 | A retention list, one row per data class | `admin_access_log` has no row, and this file's own header says *"the retention table must match what the code actually does"*. §6 of the roadmap forbids the sweep from ever touching this table, so its row reads *kept indefinitely* — an unusual promise, which is exactly why it must be written rather than inferred. |

So this plan amends **3, 4, 5, 6 and 8**, with the substance in 3.1 and the survival
statement in 8.1, and records the two-clause overrun in `## Flags`. A1 owns
`src/app/privacy/**` under §6, so the edit is licensed; the *scope* is wider than A-D16
describes and reconciliation should say so rather than discover it.

**No existing clause or sub-clause `id` changes.** The T&C precedent is in CLAUDE.md —
*"T&C clause 6's sub-numbering is an interface"*, because a refusal renders `/terms#6-2`.
Nothing links to `/privacy#3-1` today, so new anchors are free; renumbering `4-4` is not,
because `/privacy` §4.4 is cited by name in `src/middleware.ts`, in V7's notes and in
`gate.ts`'s neighbourhood.

**`src/app/legal.test.ts:266-267` already asserts the two privacy documents declare the
SAME anchor set.** Amending one locale and forgetting the other is therefore already a
red test. That is the mechanical form of "release blocker in both locales", and it exists;
Task 14 adds only the content assertions.

---

## 2. Invariants

Numbered, with the reason each exists. A reviewer should be able to break any of them
deliberately and see a named test go red.

**A1-1. A non-admin never learns `/admin` exists. 404 on a page, 404 with an empty body
on a route.** A 403 confirms the surface; so does a JSON error body no other unmatched
route produces. §1.2.

**A1-2. `isPublic()` learns nothing, `isContentPath` learns nothing, the matcher changes
by zero characters.** §1.3. Each of the three, edited the way it looks like it should be,
produces a *working-looking* app with `/admin` open to a stranger or with middleware not
running on it at all.

**A1-3. Unset or empty `ADMIN_EMAILS` admits nobody.** The `RATELIMIT_BACKEND` direction,
not the `ANALYTICS_ENABLED` one: a typo must not open a door. `parseAdminAllowlist('')`,
`(undefined)`, `(', ,')` and `('   ')` all yield `[]`, and `isAdminEmail(anything, [])` is
`false`.

**A1-4. The allowlist compare is case-folded, whitespace-trimmed, exact, and scans the
whole list.** Case-folded because `Miftahul.Mahfuzh@…` and `miftahul.mahfuzh@…` are one
Google account. **Exact, meaning Gmail dot-and-plus normalisation is deliberately NOT
applied** — normalising `a.b@gmail.com` to `ab@gmail.com` makes the allowlist match an
address nobody wrote in it, which is a privilege grant by helpfulness. Whole-list scan so
the number of comparisons does not depend on where the match is.

**A1-5. `toLowerCase()`, never `toLocaleLowerCase()`.** In a Turkish locale the latter
maps `I` to `ı`, so `ADMIN@X.COM` would stop matching `admin@x.com` on a machine whose
`ICU` default changed. A locale-sensitive fold inside a security decision is a bug waiting
for a deploy region.

**A1-6. `allowlist.ts` has ZERO imports and never reads `process.env`.** Zero imports so
`npm test` can reach the security decision without `next-auth` executing
`NextAuth(...)` at module scope (`src/lib/auth/auth.ts:175`) and without
`@/lib/db/client`'s `import 'server-only'`. No `process.env` for `prefix.ts`'s recorded
reason: a non-`NEXT_PUBLIC_` variable inlines as `undefined` in a client bundle, and the
one thing worse than an admin check that fails closed everywhere is one that fails closed
*only in a bundle nobody tests*. The env read happens exactly once, in `identity.ts`.

**A1-7. `identity.ts` is NODE-ONLY and nothing under `src/app/admin/**` calls
`auth()`, reads a cookie, or re-implements the check.** The W2 rule verbatim:
`requireUser()` in a handler, `currentUser()` in a server component, nothing else. A
second notion of "is this the admin" is how one of them ends up wrong.

**A1-8. THE LAYOUT IS NOT THE GATE. Every page and every route handler calls it
itself.** Next renders a layout above its pages, but a layout is not a security boundary —
partial rendering, route interception and any future parallel route can reach a page
without a parent layout's promise holding. The layout calling `requireAdminPage()` too is
defence in depth, and it costs one extra JWE decrypt per request on a dashboard with one
user, which is not a number worth optimising. `adminSurface.test.ts` asserts the per-file
call.

**A1-9. `requireAdmin()` does NOT require completed onboarding, and that is a decision
rather than an omission.** Nothing on `/admin` reads the admin's own `profiles` row, so
onboarding is orthogonal to it; middleware still redirects an un-onboarded signed-in user
away from `/admin` before the gate runs. Requiring it would make a fresh admin account's
first visit present as *"the allowlist is wrong"* — the least debuggable failure available
here. The counter-argument (fail closed by default, as `requireUser` does) is real and is
recorded; it loses because the fail-closed answer here is *indistinguishable from the
failure it is protecting against*.

**A1-10. `requireAdmin()` reads no database, and therefore a soft-deleted admin keeps
access until their session expires.** Identity stays database-free — roadmap §6's first
non-negotiable — and a database read here would lock the admin out of the dashboard
during exactly the outage they need it for. **A-D1 says revocation is a redeploy; this is
the sentence A-D1 does not say: self-deletion is not revocation either.** Recorded in
`## Flags`.

**A1-11. `recordAdminAccess()` THROWS. It does not catch, does not log-and-continue, and
must never acquire a `.catch(() => {})`.** This inverts W4's rule that analytics writes
fail silently, and the inversion is A-D16: *a failed audit write is a failed reveal.* The
comment says so in capitals at the function and again at A5's call site, because
`persistReading`, `flushEvents` and every `after()` in this project do the opposite and
consistency is the argument that will be made.

**A1-12. The audit row is written and committed BEFORE the plaintext is read.** The
`redactForUser()` ordering precedent: the destructive/consequential statement runs first
so a failure aborts the whole thing. Written after the read, a crash between them leaves a
decryption that happened with no record. The cost is a row for a reveal that then 404s
because the answer does not exist — **an audit trail that over-records is honest; one that
under-records is not.**

**A1-13. `resource_key` is a question key or a flag id. NEVER a decrypted value, never a
question, never prose.** `audit.contract.test.ts` asserts the module imports nothing from
`@/lib/db/crypto` and contains no reference to `answerText`. A plaintext answer inside the
append-only table that survives erasure would be the single worst row in this database.

**A1-14. `admin_access_log` is append-only: no `updated_at`, no `UPDATE`, no `DELETE`, and
the sweep never touches it** (roadmap §6, `## Non-negotiables` 14). The absence of
`updated_at` is itself the enforcement — a column that exists invites a write.
`audit.contract.test.ts` asserts the module never calls `.update(` or `.delete(`.

**A1-15. `contentAlternates()` throws on `/admin` and `/admin` is absent from
`sitemap.ts`.** The behaviour already exists (`alternates.ts:91-95`); A1 adds the
assertion, because A-D3 makes it a property of the release rather than a coincidence of
another workstream's guard.

**A1-16. Every route handler under `src/app/api/admin/**` declares `runtime` and
`maxDuration`.** §4.2, and roadmap §4.2 calls this *"the single most likely live failure
in v0.5.0"*: `POST /api/locale` was the only DB-writing route declaring neither, and
Vercel's Hobby ten-second default lost the write on a cold lambda plus a suspended Neon
compute. **There is one admin, so there is never a warm instance and every admin request
is the cold one.** A1 writes the grep test once; A3, A5 and A6's files must satisfy it.

**A1-17. `t()`, `getT()`, `useT()`, `LocaleSwitch` and `@/lib/i18n/locales/*` appear
nowhere under `src/app/admin/**`.** A-D12. The reflex to reach for `useT()` in a new
component is strong and the failure is silent catalog growth shipped to every querent on
every page.

**A1-18. `admin.page_viewed.page` is a ROUTE TEMPLATE from a closed list, never a resolved
pathname.** `/admin/users/[id]`, never `/admin/users/9f3c…`. A resolved path breaks event
rule 2 (unbounded cardinality) and rule 1 (`events` rows survive account erasure with
`user_id` nulled — a subject's uuid in `props` is an identifier surviving that person's
erasure). `usePathname()` is the obvious implementation and it is the wrong one.

**A1-19. No existing `/privacy` clause or sub-clause `id` changes, and both locales change
in the same commit.** `legal.test.ts:266` is the enforcement for the second half.

---

## Schema deltas

One table. **No column on any existing table.** Reconciliation folds this section into
`schema.ts`'s canonical list; this plan appends the table itself under rule 2 of
`src/lib/db/migrations/README.md` (a table A1's own `## Schema deltas` names), and touches
nothing it did not add.

### `admin_access_log` — thirteen tables become fourteen

Append after `personas` in `src/lib/db/schema.ts`, with its two row types in the
`Row types` block at the foot of the file.

```ts
// ---------------------------------------------------------------------------
// admin_access_log  (v0.5.0 / A1, roadmap §3.1)
// ---------------------------------------------------------------------------

/**
 * One row per privileged read of another person's data. APPEND-ONLY.
 *
 * **THERE IS NO `updated_at` AND THAT IS THE ENFORCEMENT, NOT AN OVERSIGHT.**
 * Every other mutable table here carries one; a column that exists invites a
 * write, and A-D16 plus roadmap §9.14 say this table has no update path and no
 * delete path. `queries/admin/audit.ts` exports no writer other than the insert,
 * and `audit.contract.test.ts` asserts the absence of `.update(` and `.delete(`.
 *
 * **BOTH FOREIGN KEYS ARE NULLABLE WITH `on delete set null`, AND ROADMAP §3.1
 * SAYS `admin_user_id` IS NOT NULL. §3.1 IS WRONG AND THE FAILURE IS NOT
 * COSMETIC** (plan §1.1, resolving open question §12.1). `ON DELETE SET NULL`
 * against a NOT NULL column raises `23502` *at delete time*, so the hard delete
 * of any user an admin had ever looked at would abort -- the erasure `/privacy`
 * clause 8 promises, failing for exactly the population most likely to have asked
 * for it, visible only in a cron log. `events.user_id` is the precedent for the
 * shape and for the cost: a deleted admin's rows lose their attribution, and a
 * deleted subject's rows can no longer tell that subject what was read about them.
 * Clause 8.1 says the second half out loud. `audit.integration.test.ts` proves the
 * delete SUCCEEDS, which is the assertion that fails against §3.1's literal text.
 *
 * `resource` and `resource_key` are BARE `text`, per this file's rule: A1 owns the
 * value set and exports it from `queries/admin/audit.ts` as `ADMIN_RESOURCES`, so
 * narrowing it here would make schema.ts depend on a module that depends on
 * schema.ts. The set is:
 *   `onboarding_answer` | `moderation_question` | `user_detail` | `reading_body`
 *
 * **`resource_key` IS A QUESTION KEY OR A FLAG ID AND NEVER A DECRYPTED VALUE.**
 * A plaintext answer in an append-only table that survives account erasure would
 * be the worst row in this database. `audit.contract.test.ts` fences the module
 * away from `@/lib/db/crypto` for exactly this.
 */
export const adminAccessLog = pgTable(
  'admin_access_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id').references(() => users.id, { onDelete: 'set null' }),
    subjectUserId: uuid('subject_user_id').references(() => users.id, { onDelete: 'set null' }),
    resource: text('resource').notNull(),
    resourceKey: text('resource_key'),
    createdAt: tsCol('created_at').notNull().defaultNow(),
  },
  (t) => [
    /** "What has been read about this person" -- the query a subject access
     *  request needs, and the only reason the subject column is indexed first. */
    index('admin_access_log_subject_created_idx').on(t.subjectUserId, t.createdAt.desc()),
    /** "What has this admin read" -- the review query. */
    index('admin_access_log_admin_created_idx').on(t.adminUserId, t.createdAt.desc()),
  ],
);
```

```ts
export type AdminAccessLogRow = typeof adminAccessLog.$inferSelect;
export type NewAdminAccessLogRow = typeof adminAccessLog.$inferInsert;
```

**`AdminAccessLogRow`, not `AdminAccessLog`** — the `EventRow` precedent one line above
it. `AdminAccessLog` reads like a service, and the suffix makes every call site say which
of the two it means.

### The migration

`0009_v12-admin-access-log.sql`, **generated, never hand-written** (README rule 3).

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run db:generate -- --name v12-admin-access-log
```

Expected output — check it, do not assume it:

```sql
CREATE TABLE "admin_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid,
	"subject_user_id" uuid,
	"resource" text NOT NULL,
	"resource_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_access_log" ADD CONSTRAINT "admin_access_log_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_access_log" ADD CONSTRAINT "admin_access_log_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_access_log_subject_created_idx" ON "admin_access_log" USING btree ("subject_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_access_log_admin_created_idx" ON "admin_access_log" USING btree ("admin_user_id","created_at" DESC NULLS LAST);
```

Three checks before committing:

1. **The file is numbered `0009`.** §0.4 assigns it; if drizzle emits `0010`, somebody
   else's migration landed first and the journal must be taken wholesale and the migration
   regenerated (README rule 6). Do not renumber by hand.
2. **`ON DELETE set null` on both constraints, and neither column is `NOT NULL`.** This is
   §1.1 on the wire.
3. **The file contains no `INSERT`.** README rule 8, roadmap §9.11. Nothing to insert
   here; the check is one grep and it costs nothing.

Commit `schema.ts`, the `.sql` and `meta/**` in **one** commit (README rule 4).

### `resetDb()`

`src/lib/db/testing/harness.ts:78-82` names every table so that *"a table added to the
schema and forgotten here shows up as leaked state rather than as a silent survivor."*
Add `admin_access_log` to the `TRUNCATE` list. It is the escape hatch, not the default
path — `withRollback` needs no change.

---

## 3. The file map

```
src/lib/admin/
  allowlist.ts                 PURE LEAF. Zero imports, no process.env. The parse and
                               the compare. THE ONLY FILE `npm test` needs for the
                               security decision.
  allowlist.test.ts            Loop 1.
  identity.ts                  NODE-ONLY. Reads ADMIN_EMAILS once. requireAdmin() for
                               handlers, requireAdminPage() for server components,
                               adminNotFound() for the response.
  identity.contract.test.ts    Source-level: no logging on refusal, no db import,
                               404 and never 403.

src/lib/db/queries/admin/
  audit.ts                     Handle first. recordAdminAccess (THROWS),
                               accessesForSubject, recentAccesses. ADMIN_RESOURCES.
  audit.contract.test.ts       No crypto, no update, no delete, closed union.
  audit.integration.test.ts    The §12.1 proof, the ordering proof, the index proof.

src/app/admin/
  layout.tsx                   The shell. requireAdminPage() (defence in depth),
                               <main lang="id">, robots: noindex nofollow, the nav.
  layout.module.css            Desktop-first. A4 owns everything inside a panel.
  page.tsx                     The index. requireAdminPage(). A4 replaces the BODY.
  pages.ts                     ADMIN_PAGES: the closed route-template list (A1-18).
  AdminPageViewed.tsx          'use client'. The one admin.page_viewed mount.
  adminSurface.test.ts         Four fences, binding A3-A6.

tools/admin/probe.sh           The three-identity probe. Loop 5's companion.
```

Modified: `src/lib/db/schema.ts`, `src/lib/db/testing/harness.ts`,
`src/lib/analytics/events.ts` + its test, `src/lib/auth/gate.test.ts`,
`src/lib/i18n/prefix.test.ts`, `src/lib/seo/alternates.test.ts`,
`src/app/sitemap.test.ts`, `src/app/privacy/privacy.{id,en}.tsx`,
`src/app/legal.test.ts`, `.env.example`, `docs/workstream-notes.md`.

**Unmodified, deliberately, and each one is a thing a reader will expect to see here:**
`src/lib/auth/gate.ts`, `src/middleware.ts`, `src/lib/i18n/prefix.ts`,
`src/lib/seo/alternates.ts`, `src/app/sitemap.ts`, `src/app/api/cron/sweep/route.ts`,
`CLAUDE.md`.

---

## 4. Tasks

### Task 1: `src/lib/admin/allowlist.ts` — the pure leaf

**Files**
- Create: `src/lib/admin/allowlist.ts`
- Create: `src/lib/admin/allowlist.test.ts`

**Steps**

1. Write the failing test first. Negative controls before positives — the fail-closed
   cases are the ones that matter.

```ts
import { describe, expect, it } from 'vitest';
import { isAdminEmail, parseAdminAllowlist } from './allowlist';

describe('parseAdminAllowlist -- unset and empty mean NOBODY (A1-3)', () => {
  /*
   * A-D1 and roadmap §8: this is the RATELIMIT_BACKEND direction, not the
   * ANALYTICS_ENABLED one. There, a typo must over-collect. Here, a typo must not
   * open a door -- so every degenerate input is the empty list and there is no
   * input for which the parse "gives up" and admits everyone.
   */
  it('yields the empty list for every degenerate input', () => {
    for (const raw of [undefined, null, '', '   ', ',', ',,', ' , , ', '\n\t']) {
      expect(parseAdminAllowlist(raw)).toEqual([]);
    }
  });
});

describe('parseAdminAllowlist -- the shape of a real value', () => {
  it('trims, lowercases and drops empties', () => {
    expect(parseAdminAllowlist(' A@X.com , b@y.CO ,, ')).toEqual(['a@x.com', 'b@y.co']);
  });

  it('de-duplicates, so a doubled entry does not double the scan', () => {
    expect(parseAdminAllowlist('a@x.com,A@X.COM')).toEqual(['a@x.com']);
  });

  it('keeps order, because the list is read by a human in a dashboard', () => {
    expect(parseAdminAllowlist('b@y.co,a@x.com')).toEqual(['b@y.co', 'a@x.com']);
  });

  it('does not accept a semicolon or a space as a separator', () => {
    // A comma is the documented separator. Accepting more of them means an
    // `a@x.com b@y.co` typo silently grants b@y.co.
    expect(parseAdminAllowlist('a@x.com;b@y.co')).toEqual(['a@x.com;b@y.co']);
    expect(parseAdminAllowlist('a@x.com b@y.co')).toEqual(['a@x.com b@y.co']);
  });
});

describe('isAdminEmail', () => {
  const LIST = parseAdminAllowlist('a@x.com, b@y.co, c@z.io');

  it('matches case-insensitively, both sides', () => {
    expect(isAdminEmail('a@x.com', LIST)).toBe(true);
    expect(isAdminEmail('A@X.COM', LIST)).toBe(true);
    expect(isAdminEmail('  a@x.com  ', LIST)).toBe(true);
  });

  it('matches an entry in ANY position, including the last', () => {
    // The whole-list scan (A1-4) is what makes position irrelevant. A version
    // that returned early would pass this and fail the source assertion below.
    expect(isAdminEmail('c@z.io', LIST)).toBe(true);
  });

  it('admits nobody against an empty list -- INCLUDING the empty email', () => {
    expect(isAdminEmail('a@x.com', [])).toBe(false);
    expect(isAdminEmail('', [])).toBe(false);
    expect(isAdminEmail('', LIST)).toBe(false);
    expect(isAdminEmail(null, LIST)).toBe(false);
    expect(isAdminEmail(undefined, LIST)).toBe(false);
  });

  it('is EXACT -- no substring, no suffix, no prefix', () => {
    expect(isAdminEmail('a@x.com.evil.io', LIST)).toBe(false);
    expect(isAdminEmail('evil.io/a@x.com', LIST)).toBe(false);
    expect(isAdminEmail('aa@x.com', LIST)).toBe(false);
    expect(isAdminEmail('a@x.co', LIST)).toBe(false);
    expect(isAdminEmail('a@x.com\n', LIST)).toBe(true); // trimmed, and that IS exact
  });

  it('does NOT normalise Gmail dots or plus-addressing (A1-4)', () => {
    /*
     * `a.b@gmail.com` and `ab@gmail.com` are the same Google mailbox, and
     * normalising them would make the allowlist match an address NOBODY WROTE IN
     * IT. That is a privilege grant by helpfulness, and the fail-closed answer is
     * "write the address you actually sign in with".
     */
    const gmail = parseAdminAllowlist('a.b@gmail.com');
    expect(isAdminEmail('ab@gmail.com', gmail)).toBe(false);
    expect(isAdminEmail('a.b+admin@gmail.com', gmail)).toBe(false);
    expect(isAdminEmail('a.b@gmail.com', gmail)).toBe(true);
  });
});

describe('the compare is written to be constant-time (A1-4)', () => {
  /*
   * A BEHAVIOURAL TEST CANNOT SEE THIS, so it is asserted against the source. The
   * property is "no early return, and the loop count does not depend on where the
   * first differing character is" -- `.includes()` and `.indexOf()` both break it
   * and both are what a tidy-up reaches for.
   *
   * **AND THE HONEST CAVEAT, WRITTEN HERE SO NOBODY OVERSELLS IT:** a JS string
   * compare in a JIT is not rigorously constant-time and cannot be made so
   * without leaving the language. The threat this defends against is thin anyway
   * -- the value is an email address, not a secret, and an attacker learns "is X
   * an admin" from the 404-vs-200 they get for free. It is here because A-D1
   * requires it and because the cost is four lines; it is NOT here because the
   * email is a credential. Do not delete it, and do not cite it as one.
   */
  const SRC = readFileSync('src/lib/admin/allowlist.ts', 'utf8');

  it('folds every comparison into an accumulator instead of returning early', () => {
    expect(SRC).toMatch(/diff \|=/);
  });

  it('does not reach for includes/indexOf/some on the allowlist', () => {
    expect(SRC).not.toMatch(/\.includes\(/);
    expect(SRC).not.toMatch(/\.indexOf\(/);
    expect(SRC).not.toMatch(/\.some\(/);
  });

  it('imports nothing at all, and reads no environment (A1-6)', () => {
    expect(SRC).not.toMatch(/^\s*import\s/m);
    expect(SRC).not.toMatch(/process\.env/);
  });
});
```

2. Run and see it fail.

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm test -- allowlist
```

Expected: every block fails on a missing module.

3. Implement.

```ts
/**
 * Who is an admin, as a pure function. v0.5.0 / A1, decision A-D1.
 *
 * ── ZERO IMPORTS, AND NO `process.env`. BOTH ARE STRUCTURAL ──────────────────
 *
 * **ZERO IMPORTS** so `npm test` can reach this decision. `requireAdmin()` needs
 * `currentUser()`, which imports `@/lib/auth/auth`, which calls `NextAuth(...)`
 * at module scope and imports `@/lib/db/client` -- and that file opens with
 * `import 'server-only'`. Putting the allowlist parse in the same module as the
 * session read is how the security-relevant half of this workstream ends up
 * untestable, which is the argument `gate.ts`'s header makes for `decide()` and
 * `src/lib/seo/origin.ts` makes for the origin. This is that split, one workstream
 * later.
 *
 * **NO `process.env`** for `prefix.ts`'s recorded reason: a non-`NEXT_PUBLIC_`
 * variable inlines as `undefined` in a client bundle, so a module that reads the
 * environment cannot safely be imported by anything that might one day be a client
 * component. The raw string is a PARAMETER. `identity.ts` reads the variable, once,
 * on the server.
 *
 * ── THE DEFAULT DIRECTION IS THE OPPOSITE OF `ANALYTICS_ENABLED`'s ───────────
 *
 * Unset, empty, whitespace or all-commas => **nobody is an admin.** Roadmap §8 and
 * A-D1: `ANALYTICS_ENABLED` is written so a typo COLLECTS DATA rather than silently
 * collecting none; `RATELIMIT_BACKEND` is written so a typo CANNOT disable
 * enforcement. This is the second kind. There is no input to `parseAdminAllowlist`
 * for which it gives up and admits everyone.
 *
 * ── EXACT, AND THAT MEANS NO PROVIDER-SPECIFIC NORMALISATION ─────────────────
 *
 * Trimmed and lowercased, and nothing else. `a.b@gmail.com` and `ab@gmail.com` are
 * the same Google mailbox and are NOT the same entry here: normalising them would
 * make the allowlist match an address nobody wrote into it, which is a privilege
 * grant arrived at by being helpful. Write the address you actually sign in with.
 *
 * `toLowerCase()` and never `toLocaleLowerCase()`: the locale-sensitive form maps
 * `I` to `ı` in Turkish, so `ADMIN@X.COM` would stop matching `admin@x.com` on a
 * machine whose ICU default changed. A locale-sensitive fold inside a security
 * decision is a bug waiting for a deploy region.
 */

/** `ADMIN_EMAILS` -> a trimmed, lowercased, de-duplicated list. Never null. */
export function parseAdminAllowlist(raw: string | null | undefined): readonly string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const entry = part.trim().toLowerCase();
    if (entry === '') continue;
    let seen = false;
    for (const already of out) if (already === entry) seen = true;
    if (!seen) out.push(entry);
  }
  return out;
}

/**
 * Length-and-content compare with no early exit.
 *
 * **NOT A CRYPTOGRAPHIC GUARANTEE, AND THE COMMENT SAYS SO ON PURPOSE.** A JS
 * string compare under a JIT is not rigorously constant-time. What this does buy
 * is that the loop count does not depend on where the first differing character
 * is, and that `isAdminEmail` scans every entry rather than stopping at the match
 * -- so neither the position of an entry nor its similarity to the candidate is
 * observable in the obvious way. A-D1 asks for a constant-time compare; this is
 * the honest version of that at zero dependency cost.
 *
 * `node:crypto`'s `timingSafeEqual` is the rigorous answer and is deliberately not
 * used: it would be the one import in this file, and the file's zero-import
 * property is worth more than the difference (see the header, and the threat note
 * in `allowlist.test.ts`).
 */
function equalsNoShortCircuit(a: string, b: string): boolean {
  const n = a.length > b.length ? a.length : b.length;
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Is this signed-in email on the allowlist?
 *
 * `email` is `CurrentUser.email`, which came off a verified session -- so this
 * answers "is the person we already identified an admin", never "does this string
 * look like an admin". An empty or absent email is `false`, which is the same
 * fail-closed answer an empty allowlist gives.
 *
 * **SCANS THE WHOLE LIST. DO NOT ADD A `break`, AND DO NOT REWRITE IT AS
 * `allowlist.includes(...)`.** There is a source-level test for both.
 */
export function isAdminEmail(
  email: string | null | undefined,
  allowlist: readonly string[],
): boolean {
  if (!email) return false;
  const candidate = email.trim().toLowerCase();
  if (candidate === '') return false;
  let hit = false;
  for (const entry of allowlist) {
    if (equalsNoShortCircuit(entry, candidate)) hit = true;
  }
  return hit;
}
```

4. Run green.

```sh
npm test -- allowlist
```

**Acceptance**
- Every assertion in Task 1's file passes.
- `grep -c '^import' src/lib/admin/allowlist.ts` is `0`.
- `grep -c 'process.env' src/lib/admin/allowlist.ts` is `0`.
- `npm test` still passes 1197+ (nothing else touched).

5. Commit.

```sh
git add src/lib/admin/allowlist.ts src/lib/admin/allowlist.test.ts
git commit -m "A1: the admin allowlist as a pure leaf -- unset means nobody"
```

---

### Task 2: `src/lib/admin/identity.ts` — `requireAdmin()`, and the 404 that departs from 401/403

**Files**
- Create: `src/lib/admin/identity.ts`
- Create: `src/lib/admin/identity.contract.test.ts`

**Steps**

1. Write the contract test. This module cannot be exercised behaviourally in the unit
   project — it reaches `auth()` — so the fences are source-level, exactly as
   `src/app/s/[slug]/page.contract.test.ts` and
   `src/app/api/share/route.contract.test.ts` already do for the same reason.

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync('src/lib/admin/identity.ts', 'utf8');

describe('the admin gate answers 404 and NEVER 403 (A-D2, A1-1)', () => {
  it('names 404 and neither 401 nor 403', () => {
    expect(SRC).toMatch(/status:\s*404/);
    expect(SRC).not.toMatch(/status:\s*401/);
    expect(SRC).not.toMatch(/status:\s*403/);
  });

  it('sends NO body with the refusal, because the body is the tell', () => {
    // `NextResponse.json({ error: ... }, { status: 404 })` is a body no unmatched
    // route in this app produces. §1.2.
    expect(SRC).toMatch(/new NextResponse\(null,\s*\{\s*status:\s*404/);
    expect(SRC).not.toMatch(/NextResponse\.json\([^)]*404/s);
  });

  it('calls notFound() for the page form', () => {
    expect(SRC).toContain("from 'next/navigation'");
    expect(SRC).toMatch(/notFound\(\)/);
  });
});

describe('the refusal path is silent (A1-1, and the fifth W2 trap)', () => {
  it('logs nothing at all', () => {
    /*
     * `console.warn('non-admin hit /admin', { email })` is the obvious diagnostic
     * and it writes a querent's email into the platform log for the crime of
     * typing a URL. CLAUDE.md states the rule three times -- flush.ts,
     * moderation/log.ts, auth.ts -- and W2 paid for it in production on
     * 2026-07-28. There is nothing here worth logging: the answer is in the 404.
     */
    expect(SRC).not.toMatch(/console\.(log|warn|error|info)/);
  });
});

describe('the module boundary', () => {
  it('reads ADMIN_EMAILS and does not re-implement the compare', () => {
    expect(SRC).toContain('process.env.ADMIN_EMAILS');
    expect(SRC).toContain("from './allowlist'");
    expect(SRC).not.toMatch(/toLowerCase\(\)/); // that lives in the leaf
  });

  it('goes through currentUser() and never auth() or a cookie (A1-7)', () => {
    expect(SRC).toContain("from '@/lib/auth/server'");
    expect(SRC).not.toMatch(/\bauth\(\)/);
    expect(SRC).not.toMatch(/cookies\(\)/);
  });

  it('touches no database', () => {
    // A1-10. Identity stays database-free (roadmap §6's first non-negotiable),
    // and a read here would lock the admin out during the outage they need the
    // dashboard for.
    expect(SRC).not.toMatch(/@\/lib\/db/);
  });
});
```

2. Run and see it fail.

3. Implement.

```ts
/**
 * "Is this the operator?" -- the admin gate. v0.5.0 / A1, decisions A-D1 and A-D2.
 *
 * NODE-ONLY. Never import this from `src/middleware.ts` and never from a client
 * component: it reaches `currentUser()`, which reaches `@/lib/auth/auth`, which
 * reaches the Postgres driver. The pure half is `./allowlist`, and that is the half
 * `npm test` covers.
 *
 * ── EVERY PAGE AND EVERY ROUTE CALLS THIS ITSELF. THE LAYOUT IS NOT THE GATE ──
 *
 * `src/app/admin/layout.tsx` calls it too, and that is defence in depth rather than
 * the mechanism. A layout renders above its pages but is not a security boundary --
 * partial rendering, route interception and any future parallel route can reach a
 * page without a parent layout's promise holding, and none of those changes look
 * like a security change in a diff. The cost of the double call is one extra JWE
 * decrypt on a dashboard with one user. `adminSurface.test.ts` asserts the per-file
 * call, and that assertion is the one to protect.
 *
 * ── IT ANSWERS 404, AND THAT IS A DELIBERATE DEPARTURE FROM `requireUser()` ───
 *
 * `src/lib/auth/server.ts` returns 401 and 403 and its header explains why: *"a
 * caller cannot tell whether middleware or the handler refused it"*. **A-D2 wants
 * the opposite property.** A 403 confirms the surface exists; a 404 does not, and
 * the whole tree is then indistinguishable from a typo. So:
 *
 *   - `requireAdminPage()` calls `notFound()`. Next renders `src/app/not-found.tsx`
 *     -- the same 404 an unknown reader id produces.
 *   - `requireAdmin()` returns a 404 with **no body**. Not
 *     `NextResponse.json({ error })`: that is a body no unmatched route in this app
 *     produces, and the body is the tell. Byte-identity with Next's own response
 *     for an unmatched `/api/` path is NOT claimed -- a route handler cannot render
 *     it -- and `tools/admin/probe.sh` prints both so the residual difference is a
 *     measured fact.
 *
 * **DO NOT "FIX" THIS BACK TO 401/403 FOR CONSISTENCY WITH `requireUser()`.**
 * That sentence is here because the inconsistency is the feature and
 * `src/lib/auth/server.ts` is the file people copy from.
 *
 * ── ONBOARDING IS NOT CHECKED, AND THAT IS A DECISION ────────────────────────
 *
 * `requireUser()` requires it by default and fails closed, which is right there.
 * Here it is orthogonal: nothing on `/admin` reads the admin's own `profiles` row,
 * and middleware already redirects a signed-in un-onboarded visitor away from
 * `/admin` before this function runs. Requiring it would make a fresh admin
 * account's first visit present as *"the allowlist is wrong"* -- the least
 * debuggable failure available here, and indistinguishable from the failure the
 * requirement would be protecting against.
 *
 * ── NO DATABASE READ, SO A SOFT-DELETED ADMIN KEEPS ACCESS ───────────────────
 *
 * Identity stays database-free (roadmap §6's first non-negotiable), and a read here
 * would lock the operator out of the dashboard during exactly the outage they need
 * it for. A-D1 accepts that **revocation is a redeploy**; this file records the
 * sentence A-D1 does not say -- **self-deletion is not revocation either**, because
 * `currentUser()` reads the token and `users.deleted_at` is in the row. The bound
 * is `SESSION_TTL_HOURS`. Recorded in the plan's `## Flags`.
 */
import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { currentUser, type CurrentUser } from '@/lib/auth/server';
import { isAdminEmail, parseAdminAllowlist } from './allowlist';

/**
 * Parsed on every call, not memoised at module scope.
 *
 * The parse is a split over a string of one or two addresses, on a route nobody
 * but the operator loads. Caching it in a module-level `const` would freeze the
 * value for the lifetime of a warm lambda -- so a redeploy that REMOVED an admin
 * would take effect on a cold start and not before, which is a revocation
 * mechanism that sometimes does not revoke. A-D1 already accepts that revocation
 * costs a redeploy; it must not also be a lottery.
 */
function allowlist(): readonly string[] {
  return parseAdminAllowlist(process.env.ADMIN_EMAILS);
}

/** The current user IF they are the operator, else null. Never throws. */
export async function currentAdmin(): Promise<CurrentUser | null> {
  const user = await currentUser();
  if (!user) return null;
  return isAdminEmail(user.email, allowlist()) ? user : null;
}

/**
 * The server-component form. Throws Next's not-found signal on refusal.
 *
 * `notFound()` never returns, so the call site reads
 * `const admin = await requireAdminPage();` with no null check -- which is what
 * stops a page from having a "signed in but not admin" branch to get wrong.
 */
export async function requireAdminPage(): Promise<CurrentUser> {
  const admin = await currentAdmin();
  if (!admin) notFound();
  return admin;
}

export type AdminGate =
  | { ok: true; user: CurrentUser }
  | { ok: false; response: NextResponse };

/**
 * The route-handler form. `{ ok }` mirrors `requireUser()` and `hit()`, so the
 * guards at the top of a handler read alike:
 *
 *     const gate = await requireAdmin();
 *     if (!gate.ok) return gate.response;
 *
 * The SHAPE matches `requireUser()`. The STATUS deliberately does not. See the
 * header.
 */
export async function requireAdmin(): Promise<AdminGate> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, response: adminNotFound() };
  return { ok: true, user: admin };
}

/**
 * The refusal, and the only 404 in this project that is a security answer.
 *
 * Empty body on purpose (§1.2). Exported so A5 and A6 can answer a *legitimate*
 * miss -- an unknown user id, an unknown slug -- with the same response an
 * unauthorised caller gets, which is what makes "does this user exist" unanswerable
 * from the outside.
 */
export function adminNotFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}
```

4. Run green, then `npm run typecheck` and `npm run build`.

**Acceptance**
- `npm test -- identity` green.
- `npm run typecheck` clean.
- **`npm run build` succeeds** — the TypeScript trap; a green typecheck is not evidence.
- `grep -n 'requireAdmin\|currentAdmin' src/lib/admin/identity.ts` shows exactly one
  `process.env.ADMIN_EMAILS` read in the file.

---

### Task 3: `gate.test.ts` — the `/admin` negative controls, with NO change to `gate.ts`

**Files**
- Modify: `src/lib/auth/gate.test.ts` (new `describe` block, appended)
- Modify: **nothing else.** §1.3.

**Steps**

1. Append the block. Note the acceptance criterion: **it must pass immediately.**

```ts
describe('v0.5.0 / A1 -- /admin is an ORDINARY GATED PATH, and isPublic() knows nothing', () => {
  /*
   * ── THIS BLOCK ASSERTS AN ABSENCE, AND IT PASSED THE DAY IT WAS WRITTEN ─────
   *
   * A-D2: **`isPublic()` MUST NEVER LEARN `/admin`.** Not as a convenience, not
   * "so the 404 comes from Next". There is no safe version of the edit, because
   * this function short-circuits `decide()` ABOVE the onboarding check and above
   * the signed-out arm -- so `/admin` in the allowlist makes it reachable by a
   * stranger, which is the whole surface this release is built to hide.
   *
   * What actually hides it is `requireAdmin()` in the handler and
   * `requireAdminPage()` in the page (A-D2, plan §1.2). Middleware's job on this
   * path is exactly what it already does for `/history` and `/account`: send a
   * signed-out visitor to `/login`.
   *
   * So there is no production change to fence, and the fence is that a future
   * "helpful" edit turns this block red.
   */
  it('never makes /admin public, under any spelling', () => {
    expect(isPublic('/admin')).toBe(false);
    expect(isPublic('/admin/')).toBe(false);
    expect(isPublic('/admin/users')).toBe(false);
    expect(isPublic('/admin/users/9f3c1d2e-0000-4000-8000-000000000000')).toBe(false);
    expect(isPublic('/admin/tokens')).toBe(false);
    expect(isPublic('/admin/blog')).toBe(false);
  });

  it('never makes /api/admin/** public', () => {
    /*
     * `/api/admin/users/<id>/answer/worst_thing` is the most sensitive endpoint
     * this project has ever had. It is not in `isPublic()` and the `/api/auth/`
     * and `/api/cron/` prefixes do not reach it -- which is worth an assertion,
     * because `startsWith('/api/')` clauses live three lines apart in that file.
     */
    expect(isPublic('/api/admin')).toBe(false);
    expect(isPublic('/api/admin/users')).toBe(false);
    expect(isPublic('/api/admin/users/abc/answer/worst_thing')).toBe(false);
    expect(isPublic('/api/admin/metrics/tokens')).toBe(false);
  });

  it('NEVER OPENS /admin UNDER /en/ EITHER -- contract G2, the worst outcome', () => {
    /*
     * Only the CONTENT clause strips a locale prefix. `/admin` is not a content
     * path, so `contentRewrite` returns `passthrough` and `decide()` receives
     * `/en/admin` spelled exactly as requested -- where it matches nothing, and
     * Next has no such route. The v0.4.0 assertion for `/en/history` is the
     * precedent and this is the same fence one release later.
     */
    expect(isPublic('/en/admin')).toBe(false);
    expect(isPublic('/en/admin/users')).toBe(false);
    expect(isPublic('/en/api/admin/users')).toBe(false);
  });

  it('does not open anything that merely LOOKS like /admin', () => {
    // The negative controls on the absence of a clause. They pass today, and
    // they are what catches somebody writing `startsWith('/admin')` -- which
    // would also open `/administrator` if such a route were ever added.
    expect(isPublic('/adminx')).toBe(false);
    expect(isPublic('/administrator')).toBe(false);
    expect(isPublic('/admins')).toBe(false);
  });

  it('sends a signed-out visitor on /admin to /login (roadmap §10.2)', () => {
    expect(decide({ pathname: '/admin', signedIn: false, onboarded: false })).toEqual({
      kind: 'redirect',
      to: '/login',
    });
    expect(decide({ pathname: '/admin/users', signedIn: false, onboarded: true })).toEqual({
      kind: 'redirect',
      to: '/login',
    });
  });

  it('gives a signed-out API caller 401, not a redirect and not a 404', () => {
    /*
     * The 404 is `requireAdmin()`'s answer to a SIGNED-IN non-admin. Middleware
     * answers a signed-out caller the way it answers every other gated endpoint,
     * because making middleware 404 here would mean teaching the edge which paths
     * are admin paths -- a second copy of the allowlist decision, on the one
     * runtime that cannot read an environment secret safely.
     */
    expect(decide({ pathname: '/api/admin/users', signedIn: false, onboarded: false })).toEqual({
      kind: 'json',
      status: 401,
      error: 'Unauthorized',
    });
  });

  it('still sends a signed-in, UN-ONBOARDED user to /onboarding', () => {
    expect(decide({ pathname: '/admin', signedIn: true, onboarded: false })).toEqual({
      kind: 'redirect',
      to: '/onboarding',
    });
  });

  it('lets a signed-in, onboarded NON-ADMIN through the gate -- AND THAT IS CORRECT', () => {
    /*
     * **`next` HERE IS NOT ACCESS.** The gate's job ends at "this request has a
     * session and a completed profile". `requireAdminPage()` is what turns this
     * querent into a 404, in the page, one layer down. Written out because a
     * reader who sees `next` for `/admin` will otherwise conclude the gate is
     * broken and will "fix" it in `isPublic()` -- the one edit that opens the
     * surface to a stranger.
     */
    expect(decide({ pathname: '/admin', signedIn: true, onboarded: true })).toEqual({
      kind: 'next',
    });
  });
});
```

2. Run.

```sh
npm test -- gate
```

**Acceptance**
- **Every new assertion passes with `src/lib/auth/gate.ts` byte-identical to `main`.**
  `git diff --stat src/lib/auth/gate.ts` is empty. If any assertion needed a production
  change, §1.3's trace is wrong and that is a finding for reconciliation, not an edit.
- All 40+ pre-existing assertions in the file still pass.

3. Commit.

```sh
git add src/lib/auth/gate.test.ts
git commit -m "A1: /admin negative controls -- isPublic() gains nothing, and a test says so"
```

---

### Task 4: `/admin` is not content, has no canonical, and is not in the sitemap

**Files**
- Modify: `src/lib/i18n/prefix.test.ts`
- Modify: `src/lib/seo/alternates.test.ts`
- Modify: `src/app/sitemap.test.ts`
- Modify: **none of the three production modules.** A-D3: *"It already throws on a
  non-content path — A1 adds the assertion, it does not add the behaviour."*

**Steps**

1. `prefix.test.ts`:

```ts
describe('v0.5.0 / A1 -- /admin is not content, and CONTENT_EXACT must never learn it', () => {
  /*
   * Adding `/admin` to `CONTENT_EXACT` does two things, and only the first is
   * visible in the diff: it makes `/en/admin` a rewrite target, AND it puts
   * `/admin` inside `isPublicContentPath`, i.e. inside `isPublic()`, from a file
   * whose header never mentions the gate. That is the S1/S2 seam running
   * backwards.
   */
  it('answers false for every admin spelling', () => {
    expect(isContentPath('/admin')).toBe(false);
    expect(isContentPath('/admin/users')).toBe(false);
    expect(isPublicContentPath('/admin')).toBe(false);
  });

  it('does not honour an /en/ prefix on it -- passthrough, never rewrite', () => {
    expect(contentRewrite('/en/admin', true)).toEqual({ kind: 'passthrough' });
    expect(contentRewrite('/en/admin', false)).toEqual({ kind: 'passthrough' });
    expect(contentRewrite('/admin', true)).toEqual({ kind: 'passthrough' });
  });

  it('does not 301 /id/admin to /admin, because /admin is not an address we publish', () => {
    // The `/id/` -> bare 301 is for CONTENT paths only. A redirect here would
    // hand a prober a positive signal that `/admin` is a route.
    expect(contentRewrite('/id/admin', false)).toEqual({ kind: 'passthrough' });
  });
});
```

2. `alternates.test.ts`:

```ts
describe('v0.5.0 / A1 -- no canonical and no hreflang for /admin (A-D3)', () => {
  /*
   * Behaviour that already exists; the assertion is what makes it a property of
   * the release. A canonical on a gated page is a claim to a search engine that a
   * URL is a document -- and `contentAlternates` throwing is what stops somebody
   * copying an `arcana` page's metadata block into an admin page and shipping a
   * canonical for `/admin` with no test to notice.
   */
  it('throws for /admin and for a nested admin path', () => {
    for (const path of ['/admin', '/admin/users', '/admin/tokens']) {
      expect(() =>
        contentAlternates({ origin: 'https://x.test', path, locale: 'id', locales: ['id'] }),
      ).toThrow(/not a content path/);
    }
  });

  it('throws for the prefixed spelling too, by the earlier guard', () => {
    expect(() =>
      contentAlternates({ origin: 'https://x.test', path: '/en/admin', locale: 'en', locales: ['en', 'id'] }),
    ).toThrow(/already-prefixed/);
  });
});
```

3. `sitemap.test.ts`:

```ts
it('lists no admin URL (A-D3)', () => {
  // A sitemap entry for a gated page is a sitemap full of 302s, and for THIS
  // subtree it is also publication of a surface whose whole property is that
  // nobody knows it is there.
  for (const entry of sitemap()) {
    expect(entry.url).not.toContain('/admin');
  }
});
```

4. Run.

```sh
npm test -- prefix alternates sitemap
```

**Acceptance**
- All three files green with zero production diff:
  `git diff --stat src/lib/i18n/prefix.ts src/lib/seo/alternates.ts src/app/sitemap.ts`
  is empty.

---

### Task 5: `schema.ts` — `admin_access_log`

**Files**
- Modify: `src/lib/db/schema.ts` (append the table after `personas`; two row types at the
  foot)

**Steps**

1. Paste the block from `## Schema deltas` verbatim, including its header comment. The
   comment is the deliverable as much as the columns are: §12.1's resolution has to be
   readable from the file somebody will edit next.
2. Add the two row types beside `Persona`/`NewPersona`.
3. `npm run typecheck`.

**Acceptance**
- `npm run typecheck` clean.
- `grep -c 'pgTable' src/lib/db/schema.ts` is `14`.
- **No diff anywhere else in the file.** `git diff src/lib/db/schema.ts` shows one added
  table and two added type lines and nothing else — §6: *"No column on any existing
  table."*
- The header comment names §12.1, the `23502` failure, and `events.user_id` as the
  precedent.

---

### Task 6: Migration `0009`, and `resetDb()`

**Files**
- Create: `src/lib/db/migrations/0009_v12-admin-access-log.sql` (**generated**)
- Modify: `src/lib/db/migrations/meta/**` (generated)
- Modify: `src/lib/db/testing/harness.ts`

**Steps**

1. Generate. `drizzle-kit` does not load `.env.local` on its own — the scripts call
   `dotenv` explicitly, so a `DATABASE_URL is undefined` here is that and nothing else.

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run db:up
npm run db:generate -- --name v12-admin-access-log
```

2. **Read the emitted SQL** against `## Schema deltas`' expected output. The three checks
   are the number, the two `ON DELETE set null` constraints with nullable columns, and
   the absence of `INSERT`.

```sh
grep -ci insert src/lib/db/migrations/0009_v12-admin-access-log.sql   # expect 0
grep -c 'ON DELETE set null' src/lib/db/migrations/0009_v12-admin-access-log.sql  # expect 2
grep -c 'NOT NULL' src/lib/db/migrations/0009_v12-admin-access-log.sql  # expect 3: id, resource, created_at
```

3. Apply, twice, because idempotence is the claim `npm run db:migrate` makes.

```sh
npm run db:migrate
npm run db:migrate
```

4. Add `admin_access_log` to `resetDb()`'s `TRUNCATE` list in
   `src/lib/db/testing/harness.ts`, keeping the alphabetical-within-group layout the file
   already has and the header comment's reasoning intact.

5. Verify by eye.

```sh
npm run db:studio   # admin_access_log exists, six columns, two indexes, zero rows
```

**Acceptance**
- The file is numbered `0009` and named `v12-admin-access-log`.
- Two `ON DELETE set null` constraints; `admin_user_id` and `subject_user_id` are
  nullable.
- Zero `INSERT` statements.
- `npm run db:migrate` twice is clean.
- `schema.ts`, the `.sql` and `meta/**` are in **one** commit (README rule 4).

6. Commit.

```sh
git add src/lib/db/schema.ts src/lib/db/migrations src/lib/db/testing/harness.ts
git commit -m "A1: admin_access_log (0009) -- both FKs nullable with set null, resolving roadmap 12.1"
```

---

### Task 7: `src/lib/db/queries/admin/audit.ts` — the primitive A5 must call

**Files**
- Create: `src/lib/db/queries/admin/audit.ts`
- Create: `src/lib/db/queries/admin/audit.contract.test.ts`

**Steps**

1. Write the contract test.

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADMIN_RESOURCES } from './audit';

const SRC = readFileSync('src/lib/db/queries/admin/audit.ts', 'utf8');

describe('the audit primitive is APPEND-ONLY (A1-14, roadmap §9.14)', () => {
  it('has no update and no delete path', () => {
    // "A delete button on an audit trail is the audit trail's absence" (A-D16).
    // The table has no `updated_at` for the same reason: a column that exists
    // invites a write.
    expect(SRC).not.toMatch(/\.update\(/);
    expect(SRC).not.toMatch(/\.delete\(/);
  });
});

describe('the audit primitive NEVER touches plaintext (A1-13)', () => {
  it('imports nothing from the field-encryption module', () => {
    expect(SRC).not.toMatch(/@\/lib\/db\/crypto/);
    expect(SRC).not.toMatch(/decryptField|encryptField/);
  });

  it('does not name the encrypted columns', () => {
    // `resource_key` is a QUESTION KEY or a FLAG ID. A plaintext answer inside an
    // append-only table that survives account erasure would be the worst row in
    // this database.
    expect(SRC).not.toMatch(/answerText|answer_text|questionHmac/);
  });
});

describe('the resource set is closed and A1 owns it', () => {
  it('is exactly the four names roadmap §3.1 lists', () => {
    expect([...ADMIN_RESOURCES]).toEqual([
      'onboarding_answer',
      'moderation_question',
      'user_detail',
      'reading_body',
    ]);
  });
});

describe('the write does NOT swallow its own failure (A1-11)', () => {
  it('contains no try/catch and no empty catch', () => {
    /*
     * **THIS INVERTS W4's RULE ON PURPOSE.** `persistReading`, `flushEvents` and
     * every `after()` in this project fail silently and log, because analytics
     * must never be on the path of a byte the user is waiting for. A-D16 says the
     * opposite here: *a failed audit write is a failed reveal*, and a
     * `.catch(() => {})` added for consistency would produce a reveal with no
     * record and nothing on fire.
     */
    expect(SRC).not.toMatch(/catch\s*\(/);
    expect(SRC).not.toMatch(/\.catch\(/);
  });
});
```

2. Implement.

```ts
/**
 * `admin_access_log`, written and read. v0.5.0 / A1, decision A-D16.
 *
 * The four rules of this directory, applied:
 *
 *   1. The handle comes FIRST, so A5's route can hand in a transaction and the
 *      integration suite can hand in a rolled-back one.
 *   2. Nothing here imports `../../client`, `react`, `next/*` or `server-only` --
 *      not even transitively. `contract.test.ts` walks the graph.
 *   3. No caching. Every read here is an operator looking at an audit trail; a
 *      stale answer to "what has been read about this person" is worse than a
 *      second indexed lookup.
 *   4. One file per read concern. A3 owns `metrics.ts`, `users.ts` and `rollup.ts`
 *      in this same directory; this file is the audit trail and nothing else.
 *
 * ── `recordAdminAccess` THROWS. IT MUST KEEP THROWING ────────────────────────
 *
 * **A FAILED AUDIT WRITE IS A FAILED REVEAL** (A-D16). Every other write in this
 * project does the opposite -- `flushEvents`, `persistReading` and the `after()`
 * blocks all fail silently and log, because analytics must never be on the path of
 * a byte the querent is waiting for. That rule does not reach here, and the
 * consistency argument is exactly how this gets broken: a `.catch(() => {})` added
 * during a tidy-up produces a decryption of somebody's worst memory with no record
 * of it and nothing on fire. `audit.contract.test.ts` asserts the absence of any
 * catch in this file.
 *
 * ── THE ROW IS WRITTEN BEFORE THE PLAINTEXT IS READ, NOT AFTER ───────────────
 *
 * `src/lib/account/delete.ts`'s ordering precedent: *"revocation and redaction run
 * BEFORE the flag, so a failure in a statement that actually removes something
 * aborts the whole thing"*. Here: the audit row commits, and only then does the
 * caller decrypt. Written after the read, a crash between the two leaves a
 * decryption that happened with no record.
 *
 * The cost is a row for a reveal that then 404s because the answer does not exist.
 * **An audit trail that over-records is honest; one that under-records is not.**
 *
 * ── `resource_key` IS A KEY, NEVER A VALUE ───────────────────────────────────
 *
 * A question key (`worst_thing`), or a `moderation_flags.id`. Never the decrypted
 * answer, never the flagged question, never prose. This table survives account
 * erasure with its user columns nulled -- the `events` bargain -- and that bargain
 * is only honest because there is provably nothing identifying in the row.
 */
import { desc, eq } from 'drizzle-orm';
import { adminAccessLog, type AdminAccessLogRow } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';

/**
 * The closed set. **A1 OWNS IT, and `schema.ts` deliberately does not narrow the
 * column** -- the `moderation_flags.category` precedent, so schema.ts does not come
 * to depend on a module that depends on schema.ts.
 *
 *   `onboarding_answer`     one of the six, decrypted. A5's reveal.
 *   `moderation_question`   one flagged question, decrypted. A5's reveal.
 *   `user_detail`           the per-user page as a whole was opened.
 *   `reading_body`          one reading's prose was read in the admin surface.
 *
 * **A FIFTH VALUE IS A RECONCILIATION QUESTION, NOT AN AUTHORING CONVENIENCE** --
 * the R16 precedent for `callout`. A5 needing a name that is not here means the
 * reveal it is building is not one of the four A-D16 licensed.
 */
export const ADMIN_RESOURCES = [
  'onboarding_answer',
  'moderation_question',
  'user_detail',
  'reading_body',
] as const;

export type AdminResource = (typeof ADMIN_RESOURCES)[number];

export type AdminAccess = {
  /** The operator's `users.id`. */
  adminUserId: string;
  /** Whose data. NULL only for a read that is about nobody in particular. */
  subjectUserId: string | null;
  resource: AdminResource;
  /** A question key or a flag id. **NEVER a decrypted value.** */
  resourceKey: string | null;
};

/**
 * Append one row. Returns its id.
 *
 * **AWAIT IT, AND AWAIT IT BEFORE THE READ IT AUDITS.** Not in an `after()`, not
 * in a `void`, not behind a `.catch()`. The id is returned so a caller can put it
 * in a log line without logging the subject.
 */
export async function recordAdminAccess(db: DbOrTx, access: AdminAccess): Promise<string> {
  const [row] = await db
    .insert(adminAccessLog)
    .values({
      adminUserId: access.adminUserId,
      subjectUserId: access.subjectUserId,
      resource: access.resource,
      resourceKey: access.resourceKey,
    })
    .returning({ id: adminAccessLog.id });
  return row.id;
}

/**
 * "What has been read about this person" -- the subject access request.
 *
 * Served by `admin_access_log_subject_created_idx`. **A subject whose account was
 * hard-deleted returns nothing**, because `subject_user_id` was set to NULL by that
 * delete; `/privacy` clause 8.1 says so out loud rather than leaving it to be
 * discovered.
 */
export async function accessesForSubject(
  db: DbOrTx,
  subjectUserId: string,
  limit = 200,
): Promise<AdminAccessLogRow[]> {
  return db
    .select()
    .from(adminAccessLog)
    .where(eq(adminAccessLog.subjectUserId, subjectUserId))
    .orderBy(desc(adminAccessLog.createdAt))
    .limit(limit);
}

/** "What has been read lately" -- the review query. Newest first. */
export async function recentAccesses(db: DbOrTx, limit = 200): Promise<AdminAccessLogRow[]> {
  return db
    .select()
    .from(adminAccessLog)
    .orderBy(desc(adminAccessLog.createdAt))
    .limit(limit);
}
```

3. Run the whole query-module contract, not just the new test — the new file must satisfy
   the existing rules (handle first, no `server-only` even transitively, no `../client`).

```sh
npm test -- contract audit
```

**Acceptance**
- `audit.contract.test.ts` green.
- `src/lib/db/queries/contract.test.ts` green **with `audit.ts` counted** — its
  `queryModules` filter is `f.includes('/queries/')`, so a file in the new `admin/`
  subdirectory is included, and `checked` must have gone up by one. If it did not, the
  glob is not seeing the subdirectory and the module is unfenced.
- Every exported function's first parameter is literally named `db`.

---

### Task 8: `audit.integration.test.ts` — the §12.1 proof and the ordering proof

**Files**
- Create: `src/lib/db/queries/admin/audit.integration.test.ts`

**Named `*.integration.test.ts`** or the unit project picks it up and fails without a
database (roadmap §0.3.2).

**Steps**

1. Write it. Four things, and the first is the resolution of §12.1 made mechanical.

```ts
/**
 * `admin_access_log` against a real Postgres. v0.5.0 / A1.
 *
 * **THE FIRST TEST IS THE ONE THAT MATTERS AND IT FAILS AGAINST ROADMAP §3.1's
 * LITERAL SCHEMA.** §3.1 declares `admin_user_id` NOT NULL with an FK action of
 * `on delete set null`; that combination raises `23502` when the referenced user is
 * hard-deleted, so the erasure `/privacy` clause 8 promises would abort for exactly
 * the users an admin had looked at. Plan §1.1 resolves it to nullable. This is that
 * resolution as an executable claim rather than a paragraph.
 */
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { recordAdminAccess, accessesForSubject } from './audit';
import { withRollback } from '@/lib/db/testing/harness';
// plus the local helpers the other integration tests use to insert a user row

describe('the FK actions do not veto erasure (§12.1, plan §1.1)', () => {
  it('lets a SUBJECT be hard-deleted, keeping the row with a null subject', async () => {
    await withRollback(async (tx) => {
      const admin = await insertUser(tx, 'dev:admin');
      const subject = await insertUser(tx, 'dev:subject');
      await recordAdminAccess(tx, {
        adminUserId: admin,
        subjectUserId: subject,
        resource: 'onboarding_answer',
        resourceKey: 'worst_thing',
      });

      // The sweep's statement, and it must SUCCEED.
      await tx.execute(sql`delete from users where id = ${subject}`);

      const [row] = await tx.execute(sql`select * from admin_access_log`);
      expect(row).toBeDefined();
      expect(row.subject_user_id).toBeNull();
      expect(row.admin_user_id).toBe(admin);
      expect(row.resource_key).toBe('worst_thing');
    });
  });

  it('lets an ADMIN be hard-deleted, keeping the row with a null admin', async () => {
    // The half §3.1 got wrong. Under NOT NULL this DELETE raises 23502.
    await withRollback(async (tx) => {
      const admin = await insertUser(tx, 'dev:admin');
      const subject = await insertUser(tx, 'dev:subject');
      await recordAdminAccess(tx, {
        adminUserId: admin,
        subjectUserId: subject,
        resource: 'user_detail',
        resourceKey: null,
      });

      await expect(tx.execute(sql`delete from users where id = ${admin}`)).resolves.toBeDefined();

      const [row] = await tx.execute(sql`select * from admin_access_log`);
      expect(row.admin_user_id).toBeNull();
      expect(row.subject_user_id).toBe(subject);
    });
  });

  it("a hard-deleted subject can no longer be told what was read about them", async () => {
    // The cost of `set null`, asserted rather than promised. `/privacy` clause 8.1
    // says this in prose, and a policy sentence with no test behind it is how the
    // two drift.
    await withRollback(async (tx) => {
      const admin = await insertUser(tx, 'dev:admin');
      const subject = await insertUser(tx, 'dev:subject');
      await recordAdminAccess(tx, {
        adminUserId: admin, subjectUserId: subject,
        resource: 'onboarding_answer', resourceKey: 'worst_thing',
      });
      expect(await accessesForSubject(tx, subject)).toHaveLength(1);
      await tx.execute(sql`delete from users where id = ${subject}`);
      expect(await accessesForSubject(tx, subject)).toHaveLength(0);
    });
  });
});

describe('a failed audit write fails the reveal (A-D16, A1-11/A1-12)', () => {
  it('propagates the error instead of swallowing it', async () => {
    /*
     * `delete.integration.test.ts` proves its ordering with a trigger, and this is
     * the same move: make the audit insert impossible, then assert the caller's
     * sequence never reaches the read. A unit test with a mocked db cannot see
     * this, because the thing under test is that nothing catches.
     */
    await withRollback(async (tx) => {
      const admin = await insertUser(tx, 'dev:admin');
      await tx.execute(sql`
        create or replace function jmt_block_audit() returns trigger as $$
        begin raise exception 'blocked'; end; $$ language plpgsql`);
      await tx.execute(sql`
        create trigger jmt_block_audit before insert on admin_access_log
        for each row execute function jmt_block_audit()`);

      let decrypted = false;
      const reveal = async () => {
        await recordAdminAccess(tx, {
          adminUserId: admin, subjectUserId: null,
          resource: 'user_detail', resourceKey: null,
        });
        decrypted = true; // stands in for A5's decrypt
      };

      await expect(reveal()).rejects.toThrow();
      expect(decrypted).toBe(false);
    });
  });
});

describe('the indexes serve the queries they were added for', () => {
  it('uses admin_access_log_subject_created_idx for a subject lookup', async () => {
    // V8's technique: `enable_seqscan = off` is how you assert an index SERVES a
    // predicate rather than merely EXISTS. On a table with three rows the planner
    // picks a seq scan whatever the index says.
    await withRollback(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      const plan = await tx.execute(sql`
        explain (format text)
        select * from admin_access_log
         where subject_user_id = gen_random_uuid()
         order by created_at desc limit 10`);
      expect(JSON.stringify(plan)).toContain('admin_access_log_subject_created_idx');
    });
  });
});
```

2. Run.

```sh
npm run db:up
npm run test:integration -- audit
```

**Acceptance**
- All six pass.
- **Deliberately break it once:** change `adminUserId` to `.notNull()` in `schema.ts`,
  regenerate against a scratch database, and confirm the second test fails with `23502`.
  Revert. That is the evidence §1.1 is a resolution and not a preference — record the
  error text in `docs/workstream-notes.md`.
- `npm run test:integration` overall still passes 137+ (+6). Run it **separately** from
  `npm test`; `test:all` red means nothing.

---

### Task 9: `src/app/admin/layout.tsx` — the shell, `noindex`, and `lang="id"`

**Files**
- Create: `src/app/admin/layout.tsx`, `src/app/admin/layout.module.css`
- Create: `src/app/admin/pages.ts`

**Steps**

1. `pages.ts` first — the closed route-template list (A1-18), which the nav and the
   analytics prop both read, so they cannot disagree.

```ts
/**
 * The admin route templates. A1-18.
 *
 * **TEMPLATES, NOT RESOLVED PATHS.** `/admin/users/[id]`, never
 * `/admin/users/9f3c…`. `admin.page_viewed.page` carries one of these values, and
 * a resolved path there breaks two of `events.ts`'s five rules at once: rule 2
 * (unbounded cardinality -- every `group by page` becomes useless) and rule 1
 * (`events` rows SURVIVE account erasure with `user_id` nulled, so a subject's
 * uuid in `props` is an identifier outliving that person's deletion). `usePathname()`
 * is the obvious implementation and it is the wrong one.
 *
 * **Labels are Indonesian, hardcoded, and never in the i18n catalog** (A-D12).
 * Technical terms stay English where those are the terms of art -- `token` is
 * `token`, not `tanda`.
 *
 * A3-A6 add their entries here in the commit that adds their page. A page with no
 * entry renders no nav item and fires no event, which is a visible omission rather
 * than a silent one.
 */
export const ADMIN_PAGES = [
  { path: '/admin', label: 'Ringkasan' },
  { path: '/admin/tokens', label: 'Token' },
  { path: '/admin/users', label: 'Pengguna' },
  { path: '/admin/users/[id]', label: null }, // reachable, not in the nav
  { path: '/admin/blog', label: 'Tulisan' },
  { path: '/admin/blog/new', label: null },
  { path: '/admin/blog/[slug]', label: null },
] as const;

export type AdminPagePath = (typeof ADMIN_PAGES)[number]['path'];
```

2. The layout.

```tsx
/**
 * The `/admin` shell. v0.5.0 / A1.
 *
 * ── THREE THINGS THIS FILE IS RESPONSIBLE FOR, AND ONE IT IS NOT ─────────────
 *
 * IT IS: the `noindex` metadata (A-D3), the single `<main lang="id">` (plan §1.4),
 * and the nav.
 *
 * IT IS **NOT** THE GATE. `requireAdminPage()` below is defence in depth; every
 * page and every route handler under this tree calls it for itself. A layout
 * renders above its pages but is not a security boundary -- partial rendering,
 * route interception and any future parallel route can reach a page without a
 * parent layout's promise holding, and none of those look like a security change in
 * a diff. `adminSurface.test.ts` asserts the per-file call, and that assertion is
 * the one to protect.
 *
 * ── `lang="id"` ON `<main>`, AND IT IS NOT REDUNDANT ─────────────────────────
 *
 * The root layout awaits `getLocale()` for `<html lang>` -- correctly, and
 * CLAUDE.md capitalises "do not fix this back to a static lang". Admin copy is
 * Indonesian and hardcoded (A-D12). So an English-preferring operator gets
 * `<html lang="en">` wrapping Indonesian prose: a screen reader reading Indonesian
 * with English phonemes. `/s/[slug]` is the precedent, verbatim -- `lang` sits on
 * `<main>` and comes from what language the PROSE is in, never from the viewer.
 *
 * **THIS FILE OWNS THE ONLY `<main>` IN THE SUBTREE.** A page that renders its own
 * would nest two and could forget the attribute; `adminSurface.test.ts` asserts no
 * file under `src/app/admin/**` contains `<main`.
 *
 * ── `noindex` IS BELT AND BRACE TO THE 404, NOT THE MECHANISM ────────────────
 *
 * A crawler carries no cookie, so it gets `/login` from middleware and never sees
 * this markup. The header costs nothing and S-D12's precedent -- `/s/`'s
 * `noindex` must not spread to its neighbours -- shows this project already reasons
 * about header scope. Next merges layout metadata into child pages, so a child that
 * sets `title` alone inherits `robots`; a child that sets `robots` OVERRIDES it, so
 * `adminSurface.test.ts` asserts no other admin file mentions `robots`.
 *
 * **NO `t()`, NO `getT()`, NO `LocaleSwitch`** (A-D12, A1-17). ~150 admin strings in
 * the catalog would be shipped to every querent on every page load, as JSON, for a
 * surface with exactly one reader. S-D6 settled the shape of this argument for lore
 * and article prose; a dashboard is the same case with a worse ratio.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireAdminPage } from '@/lib/admin/identity';
import { ADMIN_PAGES } from './pages';
import styles from './layout.module.css';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Every route in this tree declares both (roadmap §4.2), and the reason is the
 * `POST /api/locale` postmortem: it was the only database-writing route declaring
 * neither, and Vercel's Hobby default of ten seconds lost the write on a cold
 * lambda plus a suspended Neon compute. **There is one admin, so there is never a
 * warm instance and every admin request is the cold one.**
 */
export const runtime = 'nodejs';
export const maxDuration = 30;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();

  return (
    <main lang="id" className={styles.shell}>
      <nav className={styles.nav} aria-label="Navigasi admin">
        {ADMIN_PAGES.filter((p) => p.label !== null).map((p) => (
          <Link key={p.path} href={p.path} className={styles.navLink} prefetch={false}>
            {p.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
```

`prefetch={false}` on every admin link: the gallery tile precedent, and here it also
means hovering the nav does not fire seven cold lambdas on the one deployment with no
warm instance.

3. `layout.module.css` — desktop-first, composed from `src/theme/tokens.css` custom
   properties. **No new hex value** (`## Styling`); A4 licenses the chart palette in its
   own file and A1 introduces nothing. A `max-width` around 1200px, a two-row shell
   (nav, content), and `overflow-x: auto` on any wide child container so the page body
   never scrolls horizontally.

**Acceptance**
- `npm run build` succeeds and `/admin` builds as `ƒ`.
- `grep -rn 'getT\|useT\|LocaleSwitch' src/app/admin/` is empty.
- `grep -c '<main' src/app/admin/*.tsx` is `1`, in `layout.tsx`.
- No hex literal in `layout.module.css`: `grep -c '#[0-9a-fA-F]\{3,6\}'` is `0`.

---

### Task 10: `src/app/admin/page.tsx` and `AdminPageViewed`

**Files**
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/AdminPageViewed.tsx`

**Steps**

1. `AdminPageViewed.tsx` — one client component, the only `admin.page_viewed` firer.

```tsx
'use client';

/**
 * The one mount for `admin.page_viewed`. A1-18.
 *
 * A CLIENT COMPONENT WITH A CLOSED PROP, and the closure is the whole point: the
 * `page` prop is typed `AdminPagePath`, so a resolved pathname cannot be passed
 * without a compile error. `TrackView` is the general precedent; this is the
 * narrowed one, and `PublicPageViewed` is the precedent for "a purpose-built
 * tracker beats a general one when the general one cannot get a prop right".
 *
 * `track` comes from `@/lib/analytics/track.client` and NEVER from
 * `@/lib/analytics/track` -- the second drags `node:async_hooks` and `next/server`
 * into the browser bundle and fails the build. The `void` return is the enforcement
 * against an `await`.
 */
import { useEffect } from 'react';
import { track } from '@/lib/analytics/track.client';
import type { AdminPagePath } from './pages';

export function AdminPageViewed({ page }: { page: AdminPagePath }) {
  useEffect(() => {
    track('admin.page_viewed', { page });
  }, [page]);
  return null;
}
```

2. `page.tsx` — A1 ships the file and its gate call; **A4 replaces the body.**

```tsx
/**
 * `/admin` -- the index. v0.5.0 / A1 ships the FILE; **A4 owns what is inside it.**
 *
 * `requireAdminPage()` here as well as in the layout, and that is A1-8 rather than
 * belt-and-braces theatre: the layout is not a security boundary. This is the line
 * A4 must not delete when it replaces everything below it, so it is at the top and
 * the comment says why.
 *
 * `notFound()` and never a redirect, never a 403 (A-D2). A signed-in querent who
 * types this URL sees the same 404 as a typo.
 */
import { requireAdminPage } from '@/lib/admin/identity';
import { AdminPageViewed } from './AdminPageViewed';

export const runtime = 'nodejs';
export const maxDuration = 30;

export default async function AdminOverviewPage() {
  await requireAdminPage();

  return (
    <>
      <AdminPageViewed page="/admin" />
      <h1>Ringkasan</h1>
      {/* A4 (charts) and A3 (the queries behind them) fill this in. */}
      <p>Belum ada angka di sini. A3 dan A4 mengisinya.</p>
    </>
  );
}
```

**Acceptance**
- `npm run build` clean.
- Loop 5 (Task 15) shows `/admin` renders for an allowlisted session and 404s for an
  ordinary one.
- `grep -rn 'usePathname' src/app/admin/` is empty (A1-18).

---

### Task 11: `adminSurface.test.ts` — four fences that bind A3, A4, A5 and A6

**Files**
- Create: `src/app/admin/adminSurface.test.ts`

This is A1's highest-leverage artefact after the audit primitive: it is written once and
turns four of the release's rules into a red test in somebody else's workstream.
`src/components/accountSurface.test.ts` and `src/lib/clientBoundary.test.ts` are the
precedents for the shape.

**Steps**

1. Write it.

```ts
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PAGES = globSync('src/app/admin/**/page.tsx');
const ROUTES = globSync('src/app/api/admin/**/route.ts');
const ALL = globSync('src/app/admin/**/*.{ts,tsx}').concat(
  globSync('src/app/api/admin/**/*.{ts,tsx}'),
).filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));

describe('the fences are not vacuous', () => {
  it('finds the admin tree at all', () => {
    // A glob that matches nothing is a test that always passes. A1 ships one page
    // and no route; the floor rises as A3-A6 land.
    expect(PAGES.length).toBeGreaterThanOrEqual(1);
    expect(ALL.length).toBeGreaterThanOrEqual(4);
  });
});

describe('EVERY page and EVERY route calls the gate for itself (A1-8)', () => {
  it('names requireAdminPage or requireAdmin in every one', () => {
    /*
     * **THE LAYOUT IS NOT THE GATE.** It renders above these files and is not a
     * security boundary: partial rendering, route interception and any future
     * parallel route can reach a page without a parent layout's promise holding,
     * and none of those look like a security change in a diff. This assertion is
     * the fence, and "the layout already does it" is the argument that removes it.
     */
    for (const f of [...PAGES, ...ROUTES]) {
      const src = readFileSync(f, 'utf8');
      expect(/requireAdmin(Page)?\(/.test(src), `${f} does not call the admin gate`).toBe(true);
    }
  });

  it('never answers 401 or 403 from an admin route (A-D2)', () => {
    // A 403 confirms the surface exists. Every refusal in this tree is a 404, and
    // `adminNotFound()` is the only shape of it.
    for (const f of ROUTES) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/status:\s*40[13]/);
    }
  });
});

describe('EVERY admin route declares runtime and maxDuration (A1-16, §4.2)', () => {
  it('declares both, in every route file', () => {
    /*
     * Roadmap §4.2 calls this *"the single most likely live failure in v0.5.0"*.
     * `POST /api/locale` was the only database-writing route declaring neither and
     * Vercel's Hobby default of ten seconds lost the write on a cold lambda plus a
     * suspended Neon compute. **There is one admin, so there is never a warm
     * instance and every admin request is the cold one.** A dashboard query is
     * slower than a locale write.
     */
    for (const f of [...ROUTES, ...PAGES]) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f}: no runtime`).toContain("export const runtime = 'nodejs'");
      expect(src, `${f}: no maxDuration`).toMatch(/export const maxDuration = \d+/);
    }
  });
});

describe('admin copy never enters the i18n catalog (A-D12, A1-17)', () => {
  it('calls no translation function anywhere in the tree', () => {
    /*
     * The catalog is shipped to the browser as JSON on every page load. ~150 admin
     * strings there would be paid for by every querent, for a surface with exactly
     * one reader. S-D6 settled this shape for lore and article prose.
     *
     * The reflex to reach for `useT()` in a new component is strong and the failure
     * is silent -- nothing breaks, the payload just grows.
     */
    for (const f of ALL) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\bgetT\(|\buseT\(|\btFor\(/);
      expect(src, f).not.toMatch(/@\/lib\/i18n\/(t|catalog|locales)/);
      expect(src, f).not.toMatch(/LocaleSwitch|ContentLocaleLink/);
    }
  });
});

describe('the shell owns the only <main> and the only robots field (§1.4, A-D3)', () => {
  it('renders exactly one <main>, in the layout', () => {
    const withMain = ALL.filter((f) => readFileSync(f, 'utf8').includes('<main'));
    expect(withMain).toEqual(['src/app/admin/layout.tsx']);
  });

  it('declares `robots` only in the layout', () => {
    // Next merges layout metadata into children, but a child that sets `robots`
    // OVERRIDES it -- so a page copying a metadata block from `/arcana/[slug]`
    // would silently un-noindex itself.
    const withRobots = ALL.filter((f) => /robots\s*:/.test(readFileSync(f, 'utf8')));
    expect(withRobots).toEqual(['src/app/admin/layout.tsx']);
  });
});
```

**Acceptance**
- Green against A1's tree.
- **Break each fence once and see it go red** — delete the gate call from `page.tsx`; add
  `const t = await getT()`; drop `maxDuration`; add `<main>` to the page. Four red runs,
  then revert. A fence nobody has seen fail is a fence nobody knows works.

---

### Task 12: `events.ts` — the three folded names, 67 → 70

**Files**
- Modify: `src/lib/analytics/events.ts`
- Modify: `src/lib/analytics/events.test.ts`

**Steps**

1. Add the three names to `EVENT_NAMES`, in a new section comment, and their prop shapes
   to `EventMap`. **A6's two are transcribed, not narrowed** (§11 seam 1).

```ts
  // — the admin surface (v0.5.0) —
  /*
   * **THREE NAMES, 67 -> 70, AND THREE WERE FOLDED OUT RATHER THAN ADDED.** A-D18,
   * and the process the 66->67 comment below exists to force. The accounting:
   *
   *   DROPPED  `admin.pii_revealed`   -- `admin_access_log` is the record of truth
   *            for a reveal. A second copy here buys nothing and puts a resource
   *            key into a table whose rows SURVIVE account erasure.
   *   DROPPED  `admin.user_viewed`    -- opening a page changes no decision. Same
   *            argument that killed `revealed` in v0.4.0.
   *   DROPPED  `llm.call_recorded`    -- that is a row in `llm_calls`, not an event.
   *            A fact table and an event stream recording the same fact is how they
   *            drift.
   *
   * A1 owns this file for v0.5.0 (S-D13's rule). A6 declares the two `blog` names;
   * folding a declaration in means TRANSCRIBING it, not narrowing it, so their prop
   * shapes are A6's words.
   */
  'admin.page_viewed',
  'admin.blog_saved',
  'admin.blog_status_changed',
```

```ts
  /*
   * **`page` IS A ROUTE TEMPLATE FROM `ADMIN_PAGES`, NEVER A RESOLVED PATHNAME.**
   * `/admin/users/[id]`, never `/admin/users/9f3c…`. A resolved path breaks two of
   * the five rules at once: rule 2, because a uuid per row makes every
   * `group by page` useless; and rule 1, because `events` rows survive account
   * erasure with `user_id` nulled, so a SUBJECT's uuid in `props` is an identifier
   * outliving that person's deletion. `usePathname()` is the obvious implementation
   * and it is the wrong one; `AdminPageViewed` takes `AdminPagePath` so the wrong
   * one is a compile error.
   *
   * Typed `string` rather than the union, deliberately: A3-A6 add pages and this
   * file should not be edited for each. The closure is enforced at the call site
   * and by `events.test.ts`.
   *
   * **AND THE TENSION WITH `admin.user_viewed` BEING DROPPED IS REAL** (flagged in
   * A1's plan). This event is only page opens, which is the property that killed
   * that one. It survives because the decision it informs is different: not "how
   * private is this" but "is the dashboard used at all", which is the input to
   * whether v0.6.0 keeps building it. If that question is ever answered, delete
   * this name rather than keeping it out of habit.
   */
  'admin.page_viewed':         { page: string };
  /*
   * A6's declarations, transcribed. **`slug` IS NOT A VIOLATION OF "NO FREE TEXT,
   * EVER" AND A REVIEWER WILL FLAG IT** (A-D18 says to say so here): rule 1 is
   * about QUERENT text, and a blog slug is admin-authored public content that is
   * already in a URL. `lint_violations` is a COUNT and never the offending words --
   * those are prose, and prose in `props` is the thing rule 1 forbids.
   */
  'admin.blog_saved':          { slug: string; locale: Locale; action: 'create' | 'update';
                                 blocks: number; lint_violations: number };
  'admin.blog_status_changed': { slug: string; locale: Locale; from: string; to: string };
```

2. `events.test.ts` — raise the ceiling **by exactly three**, and record the accounting
   beside the existing 66→67 note rather than replacing it.

```ts
  it('stays inside the fixed name budget', () => {
    expect(EVENT_NAMES.length).toBeGreaterThanOrEqual(44);
    expect(EVENT_NAMES.length).toBeLessThanOrEqual(70);
  });
```

3. Add the A1-18 shape assertion:

```ts
it("admin.page_viewed's pages are route TEMPLATES, not resolved paths (A1-18)", () => {
  // A uuid-shaped segment here is a subject identifier in a table whose rows
  // survive that subject's erasure.
  for (const { path } of ADMIN_PAGES) {
    expect(path, path).toMatch(/^\/admin(\/(\[[a-z]+\]|[a-z][a-z-]*))*$/);
    expect(path, path).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  }
});
```

**Acceptance**
- `EVENT_NAMES.length === 70`, and the two compile-time exhaustiveness guards
  (`_noOrphans` and its twin) still hold — a name with no prop shape is a `never` nobody
  notices.
- `npm test -- events` green.
- The dropped-three accounting is written in the file, not only in the plan. §11 seam 1.

---

### Task 13: `.env.example` — `ADMIN_EMAILS`

**Files**
- Modify: `.env.example`

**Steps**

1. Add a new section at the foot, in the file's house style — the annotation carries the
   argument, not just the shape.

```
# --- v0.5.0: the admin surface -------------------------------------------------

# WHO CAN SEE /admin. Comma-separated email addresses. **UNSET OR EMPTY MEANS
# NOBODY**, and that direction is chosen (A-D1, roadmap §8).
#
# NOTE THE DEFAULTING RULE IS THE OPPOSITE OF ANALYTICS_ENABLED'S and the SAME AS
# RATELIMIT_BACKEND'S. There, a typo must over-collect. Here, a typo must not open
# a door -- so `ADMIN_EMAILS=`, `ADMIN_EMAILS=,` and a misspelt variable name all
# mean the same thing: the dashboard exists and nobody can reach it. There is no
# input for which the parser gives up and admits everyone.
#
# Trimmed, lowercased, de-duplicated, and compared without an early exit
# (src/lib/admin/allowlist.ts). **EXACT, which means Gmail dots and plus-addressing
# are NOT normalised**: `a.b@gmail.com` and `ab@gmail.com` are the same Google
# mailbox and are NOT the same entry here, because normalising them would make the
# allowlist match an address nobody wrote in it. Write the address you actually
# sign in with.
#
# **EMAIL IS NOT THE IDENTITY -- `google_sub` IS** (schema.ts). If the operator's
# Google email changes they lose access until this variable changes. Fail-closed,
# and correct. Do NOT "fix" it by matching on `users.id`, which would put a uuid in
# an env var nobody can read or verify.
#
# **REVOCATION IS A REDEPLOY.** There is no server-side revocation on the JWT path,
# so demoting an admin means changing this value and shipping. Accepted: there is
# one admin. And the sentence A-D1 does not say -- **deleting the admin's own
# account is not revocation either**, because `requireAdmin()` reads the session
# token and not `users.deleted_at`; the bound is SESSION_TTL_HOURS.
#
# NEEDS NO `$` ESCAPING (no email contains one), and the rule sits here anyway
# because the variables around it do: escape `$` as `\$` in a .env file, and do NOT
# escape in the Vercel dashboard, where values are literal.
#
# **NOT `NEXT_PUBLIC_`, and it must never become so.** NEXT_PUBLIC_SITE_ORIGIN
# remains the only NEXT_PUBLIC_ variable this project declares, and an operator's
# email address inlined into a client bundle is the one field `toViewer()` drops
# from every session for exactly this reason.
#
# **SET IT IN PRODUCTION AND IN PREVIEW.** Preview is where loop 5 exercises the
# signed-in admin flow. Read the warning in A1's plan `## Flags` first: a Vercel
# preview whose DATABASE_URL points at the production database gives every preview
# URL a live admin surface over real querent data.
#
# There is deliberately NO `ADMIN_ENABLED` kill switch (roadmap §8): an empty
# ADMIN_EMAILS is the kill switch, and a second mechanism is a second thing to get
# wrong. And no price variable -- prices are a committed constant (A-D7), because a
# price in an env var is a number with no history and no review.
ADMIN_EMAILS=
```

2. Add `ADMIN_EMAILS=miftahul.mahfuzh@…` to local `.env.local` for loop 5.

**Acceptance**
- `npm run build` still passes `scripts/audit-secrets.ts` (an empty value cannot leak).
- The annotation names: the fail-closed direction, exactness, revocation-is-a-redeploy,
  not-`NEXT_PUBLIC_`, the `$` rule, and the preview warning.
- **Flagged, not done:** `ADMIN_EMAILS` is not added to `SECRET_ENV` in
  `scripts/audit-secrets.ts` — see `## Flags` 3.

---

### Task 14: `/privacy` — clauses 3, 8, and the three sentences the roadmap did not name

**Files**
- Modify: `src/app/privacy/privacy.id.tsx` (**authoritative — write this one first**)
- Modify: `src/app/privacy/privacy.en.tsx`
- Modify: `src/app/legal.test.ts`

**A release blocker** (A-D16, roadmap §9.4). §11 seam 8: *written last, from the code, not
first from the plan.* So this task runs **after** Tasks 7 and 8 exist and after A5's
reveal endpoint is readable — if A5 has not landed, the clause describes what A1's
primitive makes possible and A5's plan must re-read it. **`npm run build` must not ship
until this is true of the code.**

**Steps**

1. `privacy.id.tsx`. Indonesian first — it governs (clause 12), and TS will not help
   here, so the enforcement is `legal.test.ts:266`'s anchor-set equality.

   **Clause 3** — one list item, then a new sub-clause after the existing `<P>`:

```tsx
            'Pengelolaan Layanan: supaya kerusakan bisa diperbaiki, permintaanmu tentang datamu bisa dijawab, dan Syarat & Ketentuan bisa ditegakkan.',
```

```tsx
        <SubClause id="3-1" n="3.1" title="Siapa di pihak kami yang bisa melihat datamu">
          <P>
            Satu orang: operator Layanan ini. Bukan sebuah tim, dan bukan pintu yang bisa dibuka
            siapa saja &mdash; daftar alamat email yang diizinkan disimpan di lingkungan tempat
            aplikasi dijalankan, dan mengubahnya berarti memasang ulang aplikasi.
          </P>
          <P>
            Yang bisa dilihat tanpa membuka apa pun: profilmu, jawaban awal yang mana saja sudah
            kamu isi (bukan isinya), bacaanmu beserta kartunya, tautan bagikan, dan catatan
            moderasi.
          </P>
          <P>
            Jawaban terbuka yang sensitif dan teks pertanyaan yang pernah ditolak berbeda. Keduanya
            disimpan terenkripsi, dan dibuka{' '}
            <strong>satu per satu, satu permintaan untuk satu jawaban</strong>. Tidak ada tombol
            yang membuka keenamnya sekaligus, dan tidak ada ekspor.
          </P>
          <P>
            <strong>Setiap kali satu jawaban dibuka, satu baris catatan ditulis</strong>: siapa yang
            membuka, milik siapa, jawaban yang mana, dan kapan. Baris itu tidak pernah memuat
            jawabannya. Kalau baris itu gagal ditulis, jawabannya tidak dibuka.
          </P>
          <P>
            Yang tidak bisa dilakukan: mengubah profilmu, jawabanmu, bacaanmu, atau sosok yang
            ditulis tentangmu. Operator hanya membaca.
          </P>
          <P>
            Kalau kamu ingin tahu apa saja yang pernah dibuka tentang kamu, tulis ke{' '}
            <a href={`mailto:${OPERATOR.contactEmail}`}>{OPERATOR.contactEmail}</a>.
          </P>
        </SubClause>
```

   **Clause 4's opening line** — `Tiga pihak, dan tidak ada yang lain.` becomes:

```tsx
        <P>
          Tiga pihak di luar kami, dan tidak ada yang lain. Siapa di pihak kami yang bisa
          melihatnya ada di <Link href="#3-1">klausul 3.1</Link>.
        </P>
```

   **Clause 5** — one paragraph after the existing honest-limit paragraph:

```tsx
        <P>
          Batas kedua, dan yang ini pilihan dan bukan kebocoran: enkripsi kolom tidak melindungimu
          dari operator yang memang berhak membukanya.{' '}
          <Link href="#3-1">Klausul 3.1</Link>{' '}menyebutkan apa yang boleh dibuka dan apa yang
          dicatat setiap kali itu terjadi.
        </P>
```

   **Clause 6** — one list item:

```tsx
            <>
              Catatan akses operator: <strong>disimpan seterusnya</strong>, tidak dihapus. Baris
              itulah yang membuat pertanyaan &ldquo;apa yang pernah dibuka tentang aku&rdquo; bisa
              dijawab; menghapusnya sama dengan tidak pernah mencatatnya. Isinya tidak pernah
              berupa teks yang kamu tulis.
            </>,
```

   **Clause 8** — a new sub-clause after the existing three paragraphs:

```tsx
        <SubClause id="8-1" n="8.1" title="Catatan akses operator, sesudah penghapusan">
          <P>
            Catatan akses operator ikut selamat dari penghapusan, sama seperti catatan analitik dan
            catatan moderasi: barisnya tetap ada, kolom penggunanya dikosongkan.
          </P>
          <P>
            Kami menyebutkannya karena akibatnya nyata dan tidak enak.{' '}
            <strong>
              Sesudah akunmu benar-benar dihapus, catatan itu tidak lagi bisa memberi tahu kamu apa
              yang pernah dibuka tentang kamu
            </strong>
            , karena kaitannya ke akunmu justru bagian yang dihapus. Kalau kamu ingin tahu,
            tanyakan sebelum meminta penghapusan.
          </P>
          <P>
            Catatan itu tidak kami hapus dan tidak ada tombol untuk menghapusnya. Tombol hapus di
            atas catatan pemeriksaan sama dengan tidak punya catatan pemeriksaan.
          </P>
        </SubClause>
```

   **Malay check** (`## Copy constraints`): `jangka waktu` and `seterusnya`, never
   `tempoh`. Register is `kamu`. `legal.test.ts:392` runs the eleven-word grep over this
   document and will catch a slip.

2. `privacy.en.tsx` — the same five edits, rewritten rather than translated where the
   English reads better, but **the same anchor set** (`3-1`, `8-1`) or
   `legal.test.ts:266` goes red. Clause 4's line becomes *"Three parties outside us, and
   no others. Who inside us can see it is clause 3.1."*; clause 5 gains *"A second limit,
   and this one is a choice rather than a leak: field encryption does not protect you from
   an operator who is entitled to open it."*; clause 6 gains *"The operator access log:
   kept indefinitely, never deleted…"*; and 8.1 says *"after your account is really gone,
   that log can no longer tell you what was read about you, because the link to you is the
   part that was removed."*

3. `legal.test.ts` — content assertions, in the existing `describe` for the policy:

```ts
it('describes admin access in BOTH locales (A-D16, release blocker)', () => {
  // The policy is live in production in two languages and currently describes a
  // system in which nobody reads your answers. Shipping A5 without this makes a
  // live legal document false.
  expect(PRIVACY['privacy.id']).toContain('satu per satu, satu permintaan untuk satu jawaban');
  expect(PRIVACY['privacy.en']).toContain('one at a time, one request per answer');
});

it('promises the audit row is written or the answer is not opened', () => {
  expect(PRIVACY['privacy.id']).toContain('Kalau baris itu gagal ditulis, jawabannya tidak dibuka');
  expect(PRIVACY['privacy.en']).toMatch(/if that row cannot be written, the answer is not opened/i);
});

it('says the operator only reads, and cannot edit', () => {
  // Roadmap §1: "not a write surface over querent data". A policy that omits this
  // leaves a reader assuming the worst available reading.
  expect(PRIVACY['privacy.id']).toContain('Operator hanya membaca');
  expect(PRIVACY['privacy.en']).toContain('The operator only reads');
});

it('stops claiming three parties are the whole answer', () => {
  expect(PRIVACY['privacy.id']).not.toContain('Tiga pihak, dan tidak ada yang lain.');
  expect(PRIVACY['privacy.en']).not.toContain('Three parties, and no others.');
});

it('gives the access log a retention row and an after-erasure statement', () => {
  expect(PRIVACY['privacy.id']).toContain('disimpan seterusnya');
  expect(PRIVACY['privacy.en']).toContain('kept indefinitely');
  expect(anchorsIn(PRIVACY_HTML['privacy.id'])).toContain('8-1');
});
```

**Acceptance**
- `npm test -- legal` green, **including the pre-existing anchor-set equality at line
  266** — that is what makes "both locales" mechanical.
- The eleven-word Malay grep still passes over `privacy.id`.
- No existing `id=` attribute changed: `git diff` shows added `SubClause`s and edited
  prose only. `4-4` in particular is untouched.
- Read both documents end to end on a 390px viewport (`tools/seo/fit.sh /privacy`). A
  legal document nobody has read on a phone is v0.4.0's §8 complaint repeating.

---

### Task 15: `tools/admin/probe.sh` — the three-identity probe

**Files**
- Create: `tools/admin/probe.sh`

The signed-out crawl (`tools/seo/crawl.sh`) is the v0.4.0 precedent and this is its A1
twin. **Roadmap §10.2 requires three identities and `curl` can only be two of them**, so
this script does the two it can and prints the exact `tools/e2e/run.sh` invocation for the
third.

**Steps**

1. Write it, following `tools/seo/crawl.sh`'s conventions: `RES_OPTIONS=no-aaaa` (AAAA
   lookups hang 4–12s in this WSL image and every cold outbound connection pays it), `-L`
   plus `%{url_effective}` so a 302 to `/login` shows as a 200 at the wrong URL rather
   than a red status, and no cookie jar unless one is passed.

```sh
#!/usr/bin/env bash
# A1's acceptance probe (roadmap §10.2). THREE IDENTITIES, and curl is two of them.
#
#   1. NO COOKIE    every /admin page must 302 to /login; every /api/admin/** must
#                   401 and never 200 and never 404 (the 404 is the SIGNED-IN
#                   answer, and middleware answers a cookieless caller the way it
#                   answers every gated endpoint).
#   2. A REAL SESSION FOR A NON-ADMIN   every one of them must 404.
#   3. A REAL SESSION FOR THE ADMIN     every one must 200.
#
# 2 and 3 need a session cookie, which this script never holds: pass one in, or use
# loop 5. THE HARNESS NEVER HOLDS A CREDENTIAL and no verb here accepts a password.
#
#   tools/admin/probe.sh                              # production, no cookie
#   tools/admin/probe.sh http://localhost:3001
#   JMT_COOKIE="authjs.session-token=…" tools/admin/probe.sh
#
# **THE `/api/admin` COMPARISON IS THE POINT OF THIS SCRIPT** and it is a
# measurement rather than an assertion: plan §1.2 does NOT claim byte-identity
# between `adminNotFound()` and Next's own 404 for an unmatched /api path. The
# script prints both so the residual difference is a fact somebody looked at.
```

Paths probed: `/admin`, `/admin/users`, `/admin/tokens`, `/admin/blog`, `/en/admin`,
`/api/admin/users`, `/api/admin/metrics/tokens`, plus the two controls
`/api/admin/definitely-not-a-route` and `/api/definitely-not-a-route`.

2. The loop-5 half, per `.claude/skills/` and `/test-prod-using-headless-chrome`:

```sh
# Loop 5, against a preview. The ONE loop that can prove the 404 to a real
# non-admin session, because it holds a persistent Google session a human signed
# in to and this project has no other way to hold one.
E2E_BASE=https://<preview>.vercel.app tools/e2e/run.sh whoami
E2E_BASE=https://<preview>.vercel.app tools/e2e/run.sh goto /admin
E2E_BASE=https://<preview>.vercel.app tools/e2e/run.sh status /api/admin/users
```

**Acceptance**
- Signed out, against a preview with `ADMIN_EMAILS` set: every `/admin*` path 302s to
  `/login`; every `/api/admin/**` is 401; nothing is 200.
- `/en/admin` is 404 for the admin and 302 for a stranger, and both are correct (§1.3).
- With a **non-admin** session (loop 5, a second Google account, or
  `POST /api/auth/dev-session` locally with `DEV_PASSWORD_LOGIN=1`): every page and route
  is 404, and **the page body is byte-identical to `/definitely-not-a-route`'s.** That
  last comparison is the one A-D2 actually asks for and the one nothing else checks.
- With the **admin** session: `/admin` is 200 and renders `Ringkasan`.
- The `/api/admin/**` refusal body is empty, and the residual difference from Next's own
  unmatched-route response is recorded in `docs/workstream-notes.md`.

---

### Task 16: Documentation

**Files**
- Modify: `docs/workstream-notes.md` (new `## Admin foundation (A1)` section)
- **Not** `CLAUDE.md`. Roadmap §9.12 and §6: *"Nothing new in `CLAUDE.md` from a
  workstream."* Reconciliation carries the rules.

**What goes in the notes, and none of it belongs anywhere else:**

- The `23502` error text from Task 8's deliberate break — the evidence for §1.1.
- §1.3's trace of `/admin` and `/en/admin` through `contentRewrite` → `decide()`, so the
  next person does not re-derive whether the matcher needs editing.
- The measured difference between `adminNotFound()` and Next's own 404 for an unmatched
  `/api/` path (Task 15).
- The threat note on the constant-time compare: what it does and does not buy, so nobody
  cites it as evidence that an email is a credential and nobody deletes it as theatre.
- Which `/privacy` clauses moved and why five rather than the two A-D16 named.
- The three event names folded out, transcribed from `events.ts` so the accounting exists
  in both places.

---

## 5. Verification, loop by loop

**Loop 1 — Vitest, `npm test`, no database.** The whole security decision:
`parseAdminAllowlist` and `isAdminEmail` (Task 1), the source-level fences on
`identity.ts` (Task 2), the `/admin` negative controls in `gate.test.ts`,
`prefix.test.ts`, `alternates.test.ts` and `sitemap.test.ts` (Tasks 3–4), the four
`adminSurface.test.ts` fences (Task 11), the taxonomy ceiling and the route-template
shape (Task 12), the two privacy documents' anchor-set equality and content (Task 14).
**This is where "an empty `ADMIN_EMAILS` admits nobody" is proved.**

**Loop 2 — Vitest integration, `npm run test:integration`, needs `npm run db:up`.**
Everything about `admin_access_log`: §12.1's resolution as a succeeding `DELETE`, the
audit-write-before-response ordering via a trigger, the subject-access read going to zero
after erasure, and `enable_seqscan = off` proving the subject index serves its predicate.
**Run separately from `npm test`; `npm run test:all` fails 12–22 of V9's limiter tests as
a harness race and its red means nothing.**

**Loop 3 — `tools/shot.sh`, at 1440px.** A1 takes one shot of `/admin` to confirm the
shell is not broken. **This is A4's acceptance step, not A1's** (§0.5): the dashboard is
this project's first desktop-first surface and "is this readable at 1440px" is A4's
question about A4's content.

**Loop 4 — `getBoundingClientRect` in a fixed-width container.** `tools/seo/fit.sh
/privacy` at 320/360/390, for Task 14. **The loop for width**, and the only one — both
Chromes here floor the viewport at ~500px, so a `--window-size=390` shot is a 500px
layout cropped to look narrow.

**Loop 5 — CDP over `tools/e2e/run.sh`.** The **only** loop that can prove A-D2's central
claim, because it is the only one that holds a real signed-in non-admin session against a
real deployment. Three checks: the admin sees `/admin`; a non-admin gets a 404 whose body
matches an unknown route's; a signed-out visitor gets `/login`. **It does not give a phone
width** — `innerWidth` and `outerWidth` are both 500 whatever `--width` says.

**Loop 6 — a real iPhone against a Vercel preview.** Not required by A1 and one thing is
worth noting rather than skipping: `/privacy` is a public page a stranger reads on a
phone, and Task 14 adds two sub-clauses and four paragraphs to it. Loop 4 answers width;
whether the amended clause 3 is *readable* is loop 6's and nobody's task in this release.

### A1's own acceptance, in one block

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
npm test                      # 1197 + ~40 new, all green
npm run db:up && npm run db:migrate && npm run db:migrate
npm run test:integration      # 137 + 6, all green. SEPARATELY.
npm run build                 # DO NOT SKIP -- the TypeScript trap
tools/admin/probe.sh http://localhost:3001
```

Then, and only then, a preview deploy and loop 5.

---

## 6. What this workstream does NOT do

- **It does not touch `src/lib/auth/gate.ts`, `src/middleware.ts`, `src/lib/i18n/prefix.ts`,
  `src/lib/seo/alternates.ts` or `src/app/sitemap.ts`.** Four test files, zero production
  lines. §1.3, and roadmap §6 says otherwise about the middleware.
- **It does not add `/admin` to `isPublic()`.** There is no safe version of that edit, and
  a plan proposing one is wrong (§6 of the roadmap says so first).
- **It decrypts nothing and reveals nothing.** A5 builds the reveal; A1 builds the row A5
  must write before it. `queries/onboarding.ts` remains the only module in this project
  that encrypts or decrypts `answer_text`, and A1 does not become a second one.
- **It renders no chart, no table of users, no number.** `/admin/page.tsx` ships with a
  placeholder paragraph and A4 replaces the body. A1 owns the file's existence and its
  gate call.
- **It adds no `is_admin` column, no `role`, no `adm` claim.** A-D1 and §3.4. A claim
  fails `token.size.test.ts` by design and would make demotion wait up to
  `SESSION_TTL_HOURS` — W3's stale-`onb` trap wearing a new name.
- **It adds no `admin_email` column** to preserve attribution across the FK nulling. §3.1
  does not describe one; `## Flags` 2 records the case for it.
- **It builds no export, no CSV, no bulk read.** Roadmap §1. `db:studio` and `pg_dump`
  over the direct connection string serve the legitimate case.
- **It gives `admin_access_log` no retention policy and no sweep entry.** Roadmap §6:
  *"Retention for `llm_calls`. **Never for `admin_access_log`**."* Clause 6 says
  *kept indefinitely*, and that is the whole policy.
- **It adds no second admin class, no permission, no `ADMIN_ENABLED`.** One class, one
  variable, one kill switch.
- **It does not edit `CLAUDE.md`.** Roadmap §9.12.
- **It does not edit `scripts/audit-secrets.ts`**, though it should — `## Flags` 3.

---

## Analytics deltas

**Three names, 67 → 70, and three were folded out.** A1 owns `src/lib/analytics/events.ts`
for v0.5.0 (A-D18, S-D13's rule); A6 declares two of the three and A1 transcribes them
without narrowing.

| Name | Props | Declared by | Fired from |
|---|---|---|---|
| `admin.page_viewed` | `{ page: string }` | A1 | `AdminPageViewed`, client, one per admin page |
| `admin.blog_saved` | `{ slug; locale; action: 'create'\|'update'; blocks; lint_violations }` | A6 | `POST/PUT /api/admin/blog` |
| `admin.blog_status_changed` | `{ slug; locale; from; to }` | A6 | `POST /api/admin/blog/[slug]/status` |

**Folded out:** `admin.pii_revealed` (`admin_access_log` is the record of truth; a second
copy puts a resource key in a table whose rows survive erasure), `admin.user_viewed`
(opening a page changes no decision — the argument that killed `revealed` in v0.4.0),
`llm.call_recorded` (a row in `llm_calls`, not an event).

**Two constraints that bind and are easy to breach:** `page` is a route template, never a
resolved pathname (A1-18); `lint_violations` is a count, never the offending words.

**What A1 deliberately did not add:** an event for a refused `/admin` hit. It would count
how often somebody probes the surface, and its `props` would want the thing that must
never be there. Request volume in the platform log answers it, which is where request
counts belong.

---

## Deltas requested

**From A5 — call `recordAdminAccess()` and await it BEFORE the decrypt.** Not in an
`after()`, not behind a `.catch()`. A-D16's *"a failed audit write is a failed reveal"* is
a property of A5's handler, not of A1's function: A1 can only guarantee that the function
throws.

**From A5 — one `resource` value per reveal, from `ADMIN_RESOURCES`.** A fifth value is a
reconciliation question (the R16 precedent), not an authoring convenience. If A5 needs a
name that is not in the four, the reveal it is building is not one A-D16 licensed.

**From A5 — `resource_key` is a question key or a flag id.** Never a decrypted value,
never a question, never a substring of one.

**From A3 — put your query modules in `src/lib/db/queries/admin/` beside `audit.ts` and
do not touch `audit.ts`.** It is append-only and has no aggregate to add; a "count of
reveals per day" is a `select` in your own file.

**From A3 — do not add `admin_access_log` to the sweep.** Roadmap §6 in as many words, and
`/privacy` clause 6 now promises it.

**From A4 — `/admin/page.tsx` and `/admin/tokens/page.tsx` must keep their
`requireAdminPage()` call, their `runtime`, their `maxDuration`, and must not render a
`<main>`.** `adminSurface.test.ts` enforces all four. Replace the body, not the file.

**From A4 — add your pages to `src/app/admin/pages.ts` in the commit that adds them**, and
pass the template to `AdminPageViewed`. A page with no entry renders no nav item, which is
the visible failure rather than the silent one.

**From A6 — your two event names are already in `events.ts`, transcribed.** If their prop
shapes changed since the roadmap was written, that is a reconciliation edit to A1's file,
not a second declaration.

**From A6 — `/admin/blog/**` inherits every fence in `adminSurface.test.ts`, including "no
`t()`".** The editor is Indonesian and hardcoded like the rest of the tree, even though
the *content* it edits is bilingual. Those are different strings.

**From reconciliation — rule on `## Flags` 1 (the file split) and 3 (`audit-secrets.ts`)
before A5 lands**, because A5 imports from whichever module name wins.

---

## Flags

Places this plan disagrees with the roadmap, or found something the roadmap did not say.

### 1. `src/lib/admin/identity.ts` is TWO files, and §7 names one

§7 says A1 builds *"`src/lib/admin/identity.ts` (`requireAdmin()`, `isAdminEmail()` —
**PURE**, so the allowlist parse is unit-testable without a session)"*. **Those two cannot
be in one module.** `requireAdmin()` needs `currentUser()`, which imports
`@/lib/auth/auth`, which calls `NextAuth(...)` at module scope and imports
`@/lib/db/client` — a file that opens with `import 'server-only'`. A unit test importing
`isAdminEmail` from that module drags all of it in.

So: `allowlist.ts` (pure leaf, zero imports) plus `identity.ts` (node-only). This is the
same split `src/lib/seo/origin.ts`, `src/lib/translate/keys.ts` and
`src/lib/persona/lines.ts` each made, for the same reason, in three previous releases.
**Reconciliation should record the two filenames**, because A5 imports one of them and a
plan naming `identity.ts` for the pure half will produce an import that pulls the
database into a test.

### 2. `admin_access_log` loses attribution when an admin is deleted, and there is no column for it

§1.1's resolution means a deleted admin's rows read `admin_user_id = NULL`, which is
indistinguishable from "unknown admin". With one admin this costs nothing. **The fix is an
`admin_email` text snapshot**, and A1 did not add it because §3 is the only place a table
is described and adding a column §3 does not name is a reconciliation defect by §6's own
rule. The trade-off is real in both directions: the column preserves attribution across
erasure, and it puts a person's email in an append-only table with no retention policy.
**Reconciliation's call.**

### 3. `ADMIN_EMAILS` is not in `scripts/audit-secrets.ts`'s `SECRET_ENV`, and it should be

`SECRET_ENV` names fourteen variables whose values the audit greps for in the client
bundle, on the stated ground that a value naming infrastructure counts
(`LLM_BASE_URL`, `UPSTASH_REDIS_REST_URL`). **An operator's email address is a better
candidate than either**: `toViewer()` drops `email` from every session for exactly this
reason — *"the email is the one field with a real disclosure cost if it leaks into a bundle
or a screenshot"* — and `ADMIN_EMAILS` is that field for the one account that can read
everybody's.

A1 did not make the edit because `scripts/audit-secrets.ts` is **not in §6's table of
shared files**, and §6 says an unlisted edit to a shared file is a reconciliation defect.
The change is one line. **Reconciliation should license it.**

### 4. A Vercel PREVIEW with `ADMIN_EMAILS` set is a live admin surface over production data

`docs/DEPLOY-VERCEL.md` and `.env.example` both say to set the same keys for Production
**and** Preview, and `DATABASE_URL` is one of them. Roadmap §10.1 requires loop 5 against
a preview, which requires `ADMIN_EMAILS` there. Together: **every preview deployment — one
per push, on a URL that is shared in PR comments and is not secret — serves `/admin` over
the production database.**

The gate is the same gate, so this is not an authorisation hole. It is a surface-area
increase nobody chose: an admin session cookie is `Domain`-scoped to
`www.jmtarot.site` and would not travel to `*.vercel.app`, so in practice a preview admin
must sign in again there — **which means the risk is Google's consent screen accepting a
preview URL as a redirect target, and that is a configuration nobody has audited.**
Recorded because the mitigation (a separate preview database, or `ADMIN_EMAILS` unset in
Preview plus a documented manual set-unset for loop 5) is a deploy decision and not A1's.

### 5. A-D18 drops `admin.user_viewed` for a reason that also applies to `admin.page_viewed`

*"Opening a page changes no decision, and it is the same argument that killed `revealed` in
v0.4.0."* `admin.page_viewed` is nothing but page opens. A1 kept it and wrote the tension
into `events.ts`: the decision it informs is *"is this dashboard used at all"*, which is
the input to whether v0.6.0 keeps building it, and that is a different question from the
privacy one that killed `revealed`. **If reconciliation disagrees, the honest outcome is
zero admin analytics names and A1 will take that** — dropping one name is cheaper than
carrying an event nobody has a question for.

### 6. A-D16 names two `/privacy` clauses; five are affected

§1.5 has the table. Clause 4's *"Three parties, and no others"*, clause 5's honest-limit
paragraph and clause 6's retention list are the three the roadmap did not name, and each
is a sentence a reader would call a lie. A1 amends all five and records the overrun here
rather than shipping a policy that is technically amended and still misleading.

### 7. §12.1's "honest resolution" understates the failure

§3.1 offers *"make it nullable … and accept that a deleted admin's rows lose their
attribution rather than deleting the audit trail"*, which frames the choice as being about
attribution. **It is about erasure.** `ON DELETE SET NULL` against `NOT NULL` raises
`23502` at delete time, so the roadmap's literal schema makes the audit trail a **veto over
the hard delete** — `/privacy` clause 8's promise failing for exactly the users an admin
had looked at, visible only in a cron log. Same resolution, much stronger reason, and
Task 8 makes it executable.

### 8. Nobody has decided what `/admin` looks like, and A1 ships a shell anyway

§0.5 says *"nobody has looked at this dashboard on the machine it will be used from"* and
calls it not-a-task-in-any-plan. A1's `layout.module.css` is therefore a guess: a
max-width, a nav row, and tokens only. It is deliberately minimal so that A4 replacing it
costs nothing, and it is recorded as a guess so that A4 does not inherit it as a decision.
