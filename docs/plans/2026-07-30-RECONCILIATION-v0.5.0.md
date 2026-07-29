# Reconciliation — v0.5.0, The Operator's Surface

**This file outranks `PUBLIC_RELEASE_ROADMAP_v0.5.0.md` and every plan under
`docs/plans/2026-07-30-*.md`. Where a plan disagrees with a ruling here, the plan is
wrong.**

Six plans were written in parallel from the roadmap's §2 and §3. Between them they
returned **51 defects in the roadmap they were reconciling** — v0.4.0's reconciliation
found six. That is not six workstreams being pedantic; it is what happens when a roadmap
specifies a schema and a palette without executing either. **Nineteen of the fifty-one
were verified against the running code or the running validator before being accepted
here**, and four of those nineteen would have shipped a defect nothing would have
reported.

**The four that would have shipped:**

| # | The defect | Why nothing would have caught it |
|---|---|---|
| **R3** | `admin_access_log.admin_user_id` was `NOT NULL` with an `on delete set null` FK | The **hard delete of any user an admin had ever read about would abort with `23502`** — `/privacy` clause 8's erasure promise failing for exactly the population most likely to invoke it, visible only in a cron log |
| **R8** | The chart palette was validated against `#130f22`, but `Backdrop` paints `#221a3a` at the top of the viewport | **Measured: `#a3423a` is 2.66:1 there against 3.04:1 on an opaque panel** — below the 3:1 mark floor. A test written from §5 would have been green |
| **R17** | `drain()` does `store.deferred.splice(0)` and then iterates the spliced copy | A `defer()` from inside a deferred job is **silently orphaned**. `gist`, `translation_repair` and `frequency` all run there — **three of nine ops would have recorded nothing, with a green suite** |
| **R22** | `getUserById` filters `isNull(users.deletedAt)` | A soft-deleted user would be **invisible** on the admin page that exists to show them, contradicting §7's "visible AND LABELLED" — and the 30-day restore window would be invisible with it |

---

## 1. How to read this file

Rulings are `R1`–`R51`, grouped by what they touch. Each states the defect, the ruling,
and — where it matters — the evidence. **A ruling marked `VERIFIED` was checked against
the code or the validator in this session**; the file:line or the command is quoted.
Unmarked rulings are judgements on plans, and the reasoning is given.

The roadmap has been **patched in place** for the outright factual errors (R1, R2, R3,
R4, R8, R20, R51). Rulings that change a *design* are recorded here only — the roadmap
keeps its shape and this file is the amendment, exactly as v0.4.0's reconciliation
amended S-D1 without rewriting it.

---

## 2. Rulings that change the schema

### R1 — `middleware.ts` gets **zero lines** from A1. VERIFIED

§6 assigned A1 *"Matcher covers `/admin`"*. The matcher is a **negative-lookahead
exclusion list**, not an inclusion list:

```
src/middleware.ts:403-405
  matcher: [
    '/((?!_next/|cards/|dukuns/|wallpapers/|favicon|icon|apple-icon|manifest|sitemap|robots).*)',
  ],
```

`/admin` is **already covered**, and adding `admin/` to that list would **stop middleware
running on it** — inverting A-D3 and removing the redirect that sends a signed-out
visitor to `/login`.

**RULING: A1's diff to `src/middleware.ts` is zero lines, and the same is true of
`gate.ts`.** A1 traced `/admin` and `/en/admin` through `contentRewrite()` → `decide()`
and the existing chain already produces every outcome §7 demands. **A1's gate work is
four test files and no production line, and the acceptance criterion is
`git diff --stat` on those two files being empty.** §6 is patched.

This is the R7 pattern from v0.4.0 inverted: there, §6.2 said the matcher would not need
to change and it did. Here §6 said it would and it does not. **The lesson both times is
that the matcher is read wrongly from prose and correctly from the regex.**

### R2 — `tee.ts` gets zero lines from A2

§6 assigned it. `teeReading` is pure over an async iterable — no request scope, no
handle — and `ReadingOutcome` already carries `status`, `errorKind`, `totalMs` and
`usage`. There is nothing for a ledger to add.

**RULING: the reading's ledger row is written in `/api/reading`'s existing `defer()`,
beside `persistReading`. `tee.ts` is removed from §6.** This also preserves A-D6's
snapshot rule for free, because `tee.ts` is where that trap lives and A2 no longer edits
it.

### R3 — `admin_access_log`: **both FK columns are nullable**, and this is an erasure bug, not an attribution question. VERIFIED

§3.1 declared `admin_user_id` as `NOT NULL` while §12.1 flagged it as *"a contradiction —
resolve it in the plan"*, framing the choice as losing attribution. **The framing was
wrong and understated it.**

`NOT NULL` + `on delete set null` is not merely contradictory — it **raises `23502` at
delete time**. So the **hard delete of any user an admin had ever read about aborts.**
That is `/privacy` clause 8's erasure promise failing for precisely the population most
likely to have invoked it, and it surfaces only as a line in a cron log.

**RULING: `admin_user_id` is nullable with `on delete set null`, exactly as
`events.user_id` is, and for the same stated reason — the audit trail outlives the
account and loses its attribution rather than blocking an erasure.** `subject_user_id`
likewise. **The integration test asserts the `DELETE` SUCCEEDS**, and it fails against
§3.1's original schema, which is what makes it a test rather than a comment. §3.1 is
patched.

**A consequence A5 must render:** with both columns nullable, `/admin`'s audit panel has
an "unattributed" case. It is reachable and must not render as a blank row.

### R4 — `llm_calls.status` is **four** values. `'refused'` is struck

§3.2 listed `'ok' | 'partial' | 'failed' | 'aborted' | 'refused'`. **`'refused'` has no
producer**: a `reserveModelCall()` refusal never reaches a provider, so there is no call
to record.

Worse, a row for it would **destroy `count(*)` as "calls made"** — which is the quantity
the 280 ceiling is expressed in and the one A3's meter reconstructs — and it would
duplicate `llm.ceiling_reached`, which A-D18 itself forbids on the fold-don't-add
principle.

**RULING: four values, and they are `tee.ts`'s vocabulary verbatim.** §3.2 is patched.

### R5 — `llm_calls.total_ms`, and it measures **the call**, not the request

§12.2 asked; A2 confirmed `total_ms` and went further, correctly.

`readings.latency_ms` is **time to first token**. Two meanings under one word in one
schema is the trap, and `reading.completed` already distinguishes `latency_ms` from
`total_ms`.

**RULING: the column is `total_ms`. And it is timed from a timestamp taken immediately
above `gateReading`, NOT from `outcome.totalMs`** — which starts at the handler top and
includes four budget round trips plus the classifier. **Expect
`llm_calls.total_ms < reading.completed.total_ms`, and A3 must not reconcile them**; a
query that treats them as the same measurement is wrong about both.

### R6 — `blog_post_locales`: add the CHECK and the index

A6's §3.3 findings, all accepted: a slug-case CHECK (lowercase-hyphen only, so a
capitalised slug is a failed insert rather than a 404 nobody can explain), an index on
`post_id`, and the `hero_card_slug`/`hero_alt` both-or-neither CHECK the roadmap already
specified.

**And the same one-word-two-meanings defect as R5, one table over:** `blog_posts.updated_at`
is row bookkeeping while `blog_post_locales.updated_at` **is `dateModified`, a published
claim in structured data.** **RULING: both keep the name — they are genuinely the same
kind of thing at different grains — but `blog_post_locales.updated_at` carries a column
comment saying it is `dateModified`, because A-D13 deleted `bodyHash` and this column is
now the entire mechanism.**

### R7 — `resetDb()`'s TRUNCATE list is A1's, and §6 omitted it

`src/lib/db/testing/harness.ts` was assigned to nobody, so its list would silently go
stale for three new tables — defeating the escape hatch's stated purpose for any test
that commits its own transaction.

**RULING: A1 owns the `harness.ts` change and adds all three tables in migration
`0009`'s commit, not one per workstream.** A1 owns `schema.ts`; the TRUNCATE list is the
same kind of bookkeeping.

---

## 3. Rulings on the chart system — including the one that would have shipped

### R8 — **The chart surface must be OPAQUE `#130f22`.** VERIFIED, and this is the release's closest call

§5 validated every palette against surface `#130f22` and **never said the chart panel
must paint it.** `Backdrop` is:

```
src/components/Backdrop.module.css:12-18
.backdrop { position: fixed; inset: 0; z-index: -1; background: var(--bg-radial); }

src/theme/tokens.css:18
--bg-radial: radial-gradient(120% 90% at 50% 4%, #221a3a 0%, #130f22 42%, #08060f 100%);
```

So a transparent panel at the **top** of the viewport — where a KPI row and a hero
figure go — sits on `#221a3a`, not `#130f22`. Measured just now:

| Mark | vs `#221a3a` (backdrop top) | vs `#130f22` (opaque panel) |
|---|---|---|
| `#a3423a` — `critical`, severity step 4, **and a diverging pole** | **2.66:1** | **3.04:1** |

**2.66:1 is below the 3:1 mark floor.** The ordinal check passes either way because its
own light-end floor is 2.0 — **so the test A-D9 asks for would have been green while the
mark was under-contrast on screen.** That is the exact failure mode A-D9 exists to
prevent, and §5 walked into it.

**RULING: every chart panel paints `background: var(--chart-surface)` opaquely, and
`--chart-surface` is `#130f22`. A chart may never be transparent over `Backdrop`.**
The palette in §5.1 is correct **as validated** and needs no re-derivation — this is a
one-line CSS invariant, not a colour change. It is added to §5 as an invariant and to
A4's plan as a task with its own test (assert the computed background is opaque, since a
missing `background` is the failure and it looks like nothing).

**The generalisation, which is new to this project:** a validated palette names a
surface, and **a surface is a promise the layout has to keep.** Any future chart, badge
or meter inherits this.

### R9 — §5.1's single validator command is wrong for three of its five sets. VERIFIED

§5.1 prints one command and applies it to all five sets. **The sequential and severity
ramps require `--ordinal`**; run bare, each exits 1 with three FAILs.

An implementer following §5.1 literally writes a red `chart.palette.test.ts` **over
correct values**, concludes the palette is broken, and re-derives it — which is precisely
what A-D9 exists to stop.

**RULING: §5.1 carries the exact command per set.** For the record:

```sh
# categorical (adjacent) and the two 2-slot sets
node scripts/validate_palette.js "<hexes>" --mode dark --surface "#130f22"
# sequential and severity — --ordinal is REQUIRED
node scripts/validate_palette.js "<hexes>" --ordinal --mode dark --surface "#130f22"
# categorical for all-pairs forms (scatter/bubble/small multiples)
node scripts/validate_palette.js "<hexes>" --pairs all --mode dark --surface "#130f22"
```

### R10 — Two more §5.1 wording defects that produce red tests on correct data

- **The diverging set's "ALL CHECKS PASS, ΔE 27.2" was the two poles only.** The trio
  including the midpoint **fails the chroma floor on `#7a7192` (C=0.051)** — and **that
  failure is the requirement**, because a diverging midpoint must be neutral. A test
  asserting the trio passes is wrong about the design.
- **`--pairs all` "a WARN, not a pass"** — a WARN **exits 0**. The distinction §5.1 drew
  does not exist at the exit code.

**RULING: both corrected in §5.1. The diverging midpoint is validated as a text/neutral
token, never as a categorical slot, and the all-pairs run is recorded as passing with a
WARN whose obligation is mandatory direct labels.**

### R11 — "4 + Other" needs five slots and there are four. Top-3 + Other

§5.3 said the nine `op` values fold "to 4 + Other" while §5.1's slot 4 **is** Other.

**RULING: top-3 + Other in any 4-slot categorical form, and the nine `op` values are a
TABLE** — which §5.3 already says for >7 meaningful classes, so this is the roadmap
disagreeing with itself and the table wins.

### R12 — The weekday × hour heatmap is not buildable from `llm_calls`

`local_date` is a date with no time; `created_at` is UTC. Neither gives the querent's
local hour.

**RULING: the heatmap ships Jakarta-pinned (`Asia/Jakarta`) with the axis LABELLED as
such, or not at all.** A4 chose to ship it labelled and that is accepted — **an
unlabelled local-hour axis derived from UTC is a chart that lies**, and the label is the
whole difference. A true per-querent local hour needs a column nobody has asked for.

### R13 — The hero figure is Cinzel, not "sans"

§5.3 asked for a hero figure "≥48px, sans". **This project has two serifs and no third
family** — Cinzel for display, Cormorant Garamond for body — and `## Styling` forbids a
new font as firmly as a new hex.

**RULING: Cinzel, uppercase, at the display sizes `type.title` already establishes.**
Importing a sans for one number is a new font family for a dashboard nobody else sees.

### R14 — §12.5: the hero number is **call count**, not notional spend

A4's argument is accepted in full and it is the stronger one:

- **z.ai's marginal cost per token is genuinely zero** — a fixed annual subscription. So
  spend is a counterfactual, and A-D7 already concedes it must be labelled *notional*.
- It has no denominator, and A-D7 requires the **unpriced call count** rendered beside
  it. **A hero figure needing two disclaimers is a KPI tile, not a hero.**
- **The roadmap's own stated risk is quota exhaustion and key revocation, and that is
  metered in calls per rolling five hours** — not in dollars.

**RULING: the hero is calls-in-window over 280. Notional spend is demoted to the first
KPI tile, keeping its "notional" label and its unpriced count.** §12.5 is closed.

---

## 4. Rulings on the analytics layer

### R15 — A-D17's consistency check needs `IS DISTINCT FROM`, or it can never fail

`readings.token_input` and `llm_calls.input_tokens` are both nullable. `a <> b` is `NULL`
— not `true` — when either side is NULL, so **a `<>` version of the check returns 0 rows
unconditionally and is indistinguishable from a passing check.**

**RULING: `IS DISTINCT FROM`, and the query in `docs/analytics-queries.md` carries a
one-line note saying why** — this is the `moderation_flags` partial-index class of
subtlety, where the obvious spelling is silently vacuous.

### R16 — §12.6: **fix** `nonZero()` on the buffered path, and A-D17 depended on it

A-D17 requires the consistency check to return 0 rows. §12.6 permitted A2 to merely
*document* that `anthropic.ts:149-152` omits `nonZero()`, so a buffered z.ai call stores
`0` where a streamed one stores `NULL`. **Those two positions contradict each other:
documenting it makes A-D17's check return rows by design.**

**RULING: fix it. `nonZero()` goes on `anthropic.ts`'s buffered path.** The roadmap's
hesitation — *"changes existing behaviour on a path nothing currently reads"* — is
**the argument for doing it now**, before six consumers exist. `openai.ts` keeps its
deliberate asymmetry and its comment, because a real zero from OpenAI is a fact.

### R17 — **`defer()` from inside a deferred job is silently orphaned.** VERIFIED, and it would have silently voided a third of the ledger

```
src/lib/analytics/track.ts:122
  for (const job of store.deferred.splice(0)) {
```

`splice(0)` **empties `store.deferred` and iterates the removed copy.** A `defer()`
called from inside one of those jobs pushes onto the now-empty live array, which nothing
drains again.

`gist`, `translation_repair` and the `frequency` regeneration all run inside deferred
jobs. **Three of nine ops would have recorded no ledger row at all, with a green unit
suite and a green integration suite** — the same shape as V2's lost translation events,
which went unnoticed *for as long as V2 had shipped*.

**RULING: the ledger rides its own `store.calls` buffer, flushed AFTER the deferred loop
completes, mirroring how `track()`'s own buffer already works.** And:

- **`src/lib/analytics/track.ts` and `flush.ts` are added to §6 with A2 as owner.** They
  were unlisted and the edit is unavoidable; an unlisted edit to a shared file is a
  reconciliation defect and this is that defect being fixed rather than committed.
- **A2 does NOT fix `drain()` itself.** Making `defer()` re-entrant is a W4 change with
  its own blast radius, and A2's buffer sidesteps it without touching the ordering
  `reading.completed` depends on. **The orphaning is recorded in
  `docs/workstream-notes.md` under W4 as a live trap**, because the next person to call
  `defer()` from a deferred job will hit it.

### R18 — `/api/memory/summary` may be losing `memory.summary_generated` today. Not A2's to fix

A2 observed the V2 bug shape in W5's file and correctly did not fix it.

**RULING: record it in `docs/workstream-notes.md` under W5 as an open item with the
`bindAnalyticsScope()` remedy named. It is out of scope for v0.5.0** — it is a
pre-existing defect in a different workstream's file, and folding it into A2 would make
A2's diff span three workstreams' ownership.

### R19 — §12.4: retention is **400 days**, and the binding input is Neon's 0.5 GB, not the row rate

§12.4 said the honest input is a real row rate that does not exist yet. A3 found a
better one: **the Neon free plan is 0.5 GB.** At ~450 B/row all-in, 400 days at 1000
calls/day is ~180 MB (36% of budget); at a realistic 50/day it is ~9 MB.

**RULING: `LLM_CALLS_RETENTION_DAYS`, default 400, a fifth delete in the existing sweep
running last, plus a nightly `pg_total_relation_size` probe logged unconditionally.**
400 is chosen to equal `HISTORY_DAY_LIMIT` and A3's `MAX_RANGE_DAYS`, **so the dashboard
can never offer a range whose data was already swept** — which is the failure a smaller
number would produce, and it would look like a bug in the chart. Revisit at 100 MB.

### R20 — §8's "One new variable" is wrong. There are **two**

`LLM_CALLS_RETENTION_DAYS` (A3, R19). §8 is patched.

**And `ADMIN_EMAILS` belongs in `scripts/audit-secrets.ts`'s `SECRET_ENV`** — the same
reasoning that makes `toViewer()` drop `email`. A1 correctly declined to make that edit
because `audit-secrets.ts` is not in §6's table and the edit would itself have been a
defect. **RULING: `scripts/audit-secrets.ts` is added to §6 under A1, and A1 makes the
edit.** Declining to edit an unlisted shared file and flagging it instead is exactly the
behaviour §6 is for.

### R21 — `/api/admin/metrics/[metric]` is **deleted from the route table**

§4.1 assigned it to "A3/A4" — an unowned route, which §11 did not list as a seam. A4
then established it needs no client fetch at all: pages read ranges from GET params and
query server-side.

**RULING: the route is struck from §4.1.** An unowned route that nobody needs is the
cheapest defect in this release to fix and the most likely to have been built twice.
§4.1 is patched.

### R22 — A pure fold may not live in `queries/**`

`src/lib/db/queries/contract.test.ts` globs `src/lib/db/**` and enforces the handle-first
rule on every export in a `/queries/` module. **A pure fold has no handle.** Same wall W3
hit with the Lotus cache and W5 with `windowBounds`.

**RULING: split. The query lives in `src/lib/db/queries/admin/rollup.ts`; the folds live
in `src/lib/analytics/rollup.ts`.** §7's file list is amended. This is the same split R23
applies to A1, and the precedent both follow is `origin.ts` / `keys.ts` / `lines.ts` —
**this codebase already separates "the pure part" from "the part that touches the
world", and the reason is always that the pure part is what tests can reach.**

### R23 — `identity.ts` cannot hold both `requireAdmin()` and a pure `isAdminEmail()`

§7 asked for both in one file. `requireAdmin()` → `currentUser()` → `@/lib/auth/auth`
→ `NextAuth()` at module scope → `@/lib/db/client` → `import 'server-only'`, which
throws under Vitest. **So "PURE, unit-testable with no session" and "calls
`requireUser()`" cannot be the same module.**

**RULING: `src/lib/admin/allowlist.ts` (ZERO imports — the parse and the compare) and
`src/lib/admin/identity.ts` (`requireAdmin`, `requireAdminPage`, `adminNotFound`).**
§7 is amended. **A5 imports names from both**, which is why this had to be settled before
A5's plan was final — and it is why A1 flagged it as blocking rather than deciding
locally.

### R24 — The `readings` fleet-wide `local_date` index is an **unbuilt, declared** delta

`readings_user_local_date_idx` leads on `user_id`, so a fleet-wide `local_date` bucket
seq-scans. A3 cannot add an index (A1 owns `schema.ts`).

**RULING: not built in v0.5.0. Declared in A3's plan as an unbuilt delta with a stated
trigger** — add it when the fleet-wide daily query exceeds A3's stated timeout on real
data. **With one admin and a table this size, an index added on speculation is an index
nobody measured.** This is the honest form of a known gap and it is preferred to a
silent one.

### R25 — Two calendar systems in one bucket must be stated on screen

§3.2 has `local_date` be the UTC date for a querent-less call. So a fleet-wide
`local_date` bucket **sums two calendar systems**, and the roadmap says this nowhere.

**RULING: A3 states it in the metric catalogue, and any fleet-wide daily chart carries
it in its table view.** The alternative — a second column — is not worth a migration for
a population of cron-driven repair passes, but an unstated mixture is how a number
becomes untrustworthy later.

### R26 — Daily series vs the rolling-5h ceiling: `peakWindow5h` leads, and the bridge is measured

A3's resolution is accepted in full and it is the best piece of analysis the swarm
returned.

- **`peakWindow5h`** — a `RANGE BETWEEN INTERVAL '5 hours' PRECEDING` count over
  `created_at` — **reconstructs the exact quantity Redis holds** and is directly
  comparable to 280. It is the meter, and it leads the page (R14 makes it the hero).
- The bridge to a daily forecast is a **measured** burstiness
  `k = peak5h / (meanCallsPerDay × 5/24)`, then `dailyEquivalentCeiling = 1344 / k`.
  **Comparing calls/day to 280 is wrong by 4.8× and alarmist; dividing by 4.8 assumes
  flat traffic and is wrong in the dangerous direction.** Measuring k is the only honest
  option.
- The crossing is returned as a **date range** (upper band = earliest), with k, n and R²
  beside it, and is optimistic on four stated counts — chiefly that **the ledger is a
  lower bound on the counter, because `after()` is not a guarantee.** That sentence goes
  on the page, not just in the plan.

---

## 5. Rulings on the admin surface and its PII

### R27 — §12.3: A5 renders its own `AdminReadingDetail`

Confirmed, and A5's reason is better than the roadmap's. §7 argued from the invariant
list's arity. The binding reason is narrower and harder:

**The admin page needs `status`, `model`, `prompt_version`, tokens, `total_ms`,
`session_id` and `shared_at`. Adding any of those to `ReadingViewProps` puts
operator-only fields on the component that renders `/s/<slug>` to strangers** — and a
props type carrying `session_id` is one spread away from a public RSC payload.

Two supporting facts A5 found: `ReadingView` **never receives a `blocked` reading** (all
three callers filter it) and A5 must show them; and it renders everything through
`useT()`, so an `en` admin would read an English panel inside an Indonesian dashboard
(A-D12).

**RULING: `AdminReadingDetail`, keeping the two rules worth keeping — `lang` on the
body, none on `choice`, and cards assigned into a sparse array by `position`.**
`ReadingView`'s header stays true and its three surfaces stay three.

### R28 — `resource = 'reading_body'` needs a route, and A5 adds it

§3.1 declared four `resource` values; §4.1 had three endpoints. A dead audit value is
worse than a missing one — it reads as a capability that exists.

**RULING: A5 adds `GET /api/admin/users/[id]/reading/[readingId]` on the same terms as
the answer endpoint** (one row, `private, no-store`, audited). The alternative —
rendering bodies inline — would require striking the resource value **and** loosening
§7's payload rule together, and a reading body is exactly the thing that should cost an
audit row.

### R29 — **`getUserById` filters `isNull(deleted_at)`.** VERIFIED. A3 must not reuse it

```
src/lib/db/queries/profile.ts:68
  .where(and(eq(users.id, userId), isNull(users.deletedAt)))
```

§7 requires a soft-deleted user to be *"visible AND LABELLED"*, because hiding them makes
the 30-day restore window invisible. **If A3 reuses `getUserById` or
`findUserByGoogleSub`, that requirement fails silently** — the page 404s and reads like a
bad id.

**RULING: A3's `adminUserById` and `adminUserList` do NOT filter `deleted_at`, and each
carries a comment saying so with a pointer to this ruling.** An integration test seeds a
soft-deleted user and asserts it is returned and flagged.

**And A5 must render that state honestly rather than as empty:** V8's
`redactForUser()` and `revokeAllForUser()` already ran inside the delete transaction, so
much of the data is genuinely gone. "Deleted, and redacted on <date>" is the truth;
empty panels are not.

### R30 — `recordAdminAccess()` **THROWS**. It is the one write here that must not swallow

Every other write in this project's analytics path swallows and logs. A-D16 requires the
opposite: *a failed audit write is a failed reveal.*

**RULING: A1's `recordAdminAccess(db, row)` throws, and its doc comment says in capitals
that it is deliberately not in house style and why.** A5 `await`s it **before** the
decrypt — not in `after()`, never with `.catch()`.

**This is the highest-value seam in the release.** If A1 writes it in house style, A5's
invariant becomes unimplementable **and looks implemented** — the reveal would work, the
audit row would silently not exist, and the only evidence would be a log line nobody
reads. A1's plan carries the capitalised warning; A5's carries a test that stubs a
failing audit write and asserts **no plaintext in the response**.

### R31 — A-D16 named two `/privacy` clauses. **Five are affected**

A1 found clause 4 (*"Three parties, and no others"*), clause 5 (the honest-limits
paragraph, which now has a second limit), and clause 6 (a retention table with **no row
for `admin_access_log`** — and §6 forbids the sweep touching it, so the honest row reads
*kept indefinitely*).

**RULING: clauses 3, 4, 5, 6 and 8, both locales. Amending only 3 and 8 leaves a policy
that is technically amended and still misleading, which is worse than one that is
plainly out of date.** `src/app/legal.test.ts:266` already asserts both locales declare
the same anchor set, so the "both locales" half is mechanical — **the risk is not
forgetting `en`, it is amending too few clauses in both.**

**And the clause is written LAST, from the shipped code, not first from the plan** —
including the fact that an operator can read a question that was *refused*, which is the
least comfortable sentence in the amendment and the one most likely to be omitted.

### R32 — A-D18's `admin.page_viewed` would have put a subject uuid in `events.props`

The obvious implementation is `usePathname()`. On `/admin/users/<uuid>` that ships **a
subject's uuid** into `events.props` — breaking the cardinality rule and, worse, putting
a subject identifier in **the one table whose rows survive that subject's erasure with
`user_id` nulled.**

**RULING: a closed `ADMIN_PAGES` route-template list in `src/app/admin/pages.ts`, and
the prop is typed to it.** Not a string. The uuid never reaches the taxonomy.

**On A-D18's internal inconsistency** — it dropped `admin.user_viewed` because *"opening
a page changes no decision"*, and `admin.page_viewed` is only page opens: **RULING: keep
`admin.page_viewed`, drop the justification.** The honest reason to keep it is not
decision-support, it is knowing which of six pages is worth maintaining. That reason is
written into `events.ts` at the declaration, replacing the argument that killed its
sibling. Taxonomy stands at **70**.

### R33 — A-D12's stated reason is wrong. The rule stands on the grep alone

A-D12 justified keeping admin copy out of the catalog partly by "the catalog ships to the
browser on every page". **`LocaleProvider` is mounted in the root layout, so the catalog
already ships on admin pages** — the saving does not exist.

**RULING: the rule stands; its reason is replaced.** The real reasons are the authoring
cost of ~150 strings in two locales for a surface with one reader, and that
`id.ts` owns the key set so every admin string would force an English twin. **The `t()`
grep test is therefore the WHOLE enforcement, not a belt on a stronger argument** — A4
and A5 both carry it, and it must not be described as defence in depth.

### R34 — An un-onboarded admin cannot reach `/admin`. Documented, not fixed

`decide()` bounces a signed-in, un-onboarded user to `/onboarding` **above** any admin
check. So an admin who has not completed onboarding gets a redirect that **reads exactly
like a bad `ADMIN_EMAILS`.**

**RULING: documented, not fixed.** Exempting `/admin` from the onboarding gate means
`isOnboardingExempt` learning an admin path, and S-D5's whole argument is that this chain
must not acquire special cases. **The cost is one confusing five minutes, once, for one
person, with the answer written down.** A1's plan carries it under "known and
deliberate", and `.env.example`'s annotation mentions it — which is where somebody will
actually be looking.

### R35 — A-D2's "same body shape a missing route would produce" is not achievable

Next renders its own 404 page; a route handler cannot reproduce it.

**RULING: 404 with an EMPTY body. Byte-identity with a missing route is explicitly not
claimed**, and `tools/admin/probe.sh` measures the residual difference so the claim on
record matches what is measurable. A JSON `{ error }` body is the tell and is refused.

### R36 — §10.2 needs **two** status codes, and a script that conflates them reds on correct behaviour

Signed-out `/api/admin/**` gets **401** from `decide()`. Signed-in non-admin gets **404**
from `requireAdmin()`. §10.2 said "404s or 401s", which is true but not testable.

**RULING: §10.2 states both explicitly, per session state.** A crawl script treating 401
as failure would fail on correct behaviour, which is how an acceptance test gets
disabled.

### R37 — Preview serves `/admin` over production data. **A ruling nobody had made**

§10.1 needs `ADMIN_EMAILS` on Preview for loop 5. **Preview shares `DATABASE_URL` with
production.** So every push-triggered preview URL would serve the full admin surface over
real user data — on a URL that is effectively public and not in anybody's threat model.

**RULING: `ADMIN_EMAILS` is set on Production ONLY. Loop 5 runs against
`E2E_BASE=http://localhost:3001` for the admin flow, and against production for the
signed-out and non-admin refusal cases** (which need no admin identity and are the half
that actually needs a real deployment).

This is a genuine hole the roadmap opened and no plan was positioned to close, because
each saw only its own half. **It goes in `docs/DEPLOY-VERCEL.md` beside the
`MIGRATE_DATABASE_URL` rules, not only here** — a variable whose correct value differs
per environment is exactly the class that file exists for.

### R38 — Self-deletion is not revocation

`requireAdmin()` reads the token, not `users.deleted_at`. A soft-deleted admin keeps
access for up to `SESSION_TTL_HOURS`.

**RULING: documented in A-D1's consequence list.** It is the same shape as the `onb`
staleness and the same shape as A-D1's accepted "revocation is a redeploy" — **listing it
is the fix, because the alternative is a DB read on every admin request to close a hole
that requires the admin to have deleted their own account.**

---

## 6. Rulings on the blog CMS — the fences nobody costed

### R39 — `sitemap.ts` is a documented LEAF and `sitemap.test.ts` bans `@/lib/db`. VERIFIED

§6 and §7 handed A6 `sitemap.ts` without mentioning either:

```
src/app/sitemap.ts:11-19
 * ── IT IS A LEAF AND IT HAS TO STAY ONE (S-D11) ──
 * **The same argument binds harder here**, because this is the response a crawler
 * fetches first and the one that must never 500: there is no database on its path,
 * so a database outage cannot reach it.

src/app/sitemap.test.ts:181-191   forbids: 'server-only', '@/lib/db', '@/lib/auth', …
```

**This is the roadmap's largest single omission** — A-D15 made the sitemap's contents a
query result while a committed test forbade the import that would make it one.

**RULING: one NAMED database import added to `sitemap.test.ts`'s allowlist — never a
loosened rule — plus a narrow `catch` so an outage costs the blog rows and not the
file.** The lore pages, the gallery, the legal documents and the two locale roots keep
being emitted from pure data.

**This deliberately inverts the pages' rule** (where a DB failure should surface) and the
inversion is the point: **a sitemap that 500s costs the crawl of 54 URLs; a sitemap
missing two blog rows costs two.** The comment says so, because a bare `catch` in this
codebase reads as sloppiness and this one is a decision.

### R40 — `blog.contract.test.ts` fails on the correct implementation. VERIFIED

Two of its assertions:

```
src/app/blog/blog.contract.test.ts:100-110   forbids '@/lib/db' across src/app/blog/**
src/app/blog/blog.contract.test.ts:138-141
  expect(article).toContain('generateStaticParams');
  expect(article).toContain('dynamicParams = false');
```

**A6 must delete both, and the roadmap says so nowhere** — so the contract test is red on
a correct implementation, which is the state in which somebody deletes the test.

**RULING: both fences amended, and the `@/lib/db` ban replaced by a named allowlist
entry — not deleted.** The written rationale about "no fourth route that 500s" **has
expired and must be REWRITTEN, not removed**: the new truth is that the blog page may
500 on a database outage exactly as `/history` does, and that is acceptable for a page
whose content lives in the database, while the *sitemap* still may not (R39). **Deleting
the rationale loses the distinction; rewriting it records that the distinction was
considered.**

### R41 — `generateStaticParams` + `dynamicParams = false` are deleted, and nothing is lost. VERIFIED by A6 against the notes

The question that would otherwise block A-D13 entirely: does the rendering model permit a
database source?

**Yes, and the cost is exactly one thing.** From `src/app/blog/[slug]/page.tsx:46-53`
and `docs/workstream-notes.md:5834-5837`: *"`generateStaticParams` DOES NOT MAKE THIS
PAGE STATIC … what it buys with `dynamicParams = false` is a 404 at the routing
layer."* And **R21 of v0.4.0, closed 2026-07-29 against the real Vercel CDN: all four
blog URLs answer `private, no-cache, no-store` with `x-vercel-cache: MISS` twice
running** — all eight content entries in `next.config.ts` inert. ISR was never available
(*"it needs a static root layout, and S-D10 already refused multiple root layouts"*).

**RULING: delete both. The only thing given up is the build-time slug closure — which is
precisely what would prevent publishing without a deploy — and `notFound()` is already
the belt.** Recorded here because it is the load-bearing fact under A-D13, and a future
session will otherwise "restore" the static params and re-break publishing.

### R42 — A-D15 missed the opposite direction: publishing `en` first is a **500 on a sitemapped URL**

`alternates.ts:115-120` **throws** without an `id` document — R2 of v0.4.0, deliberately,
because a wrong canonical de-indexes the correct page. A-D15 reasoned only about
unpublishing.

**RULING: defended twice.** The status route **refuses** a transition that would publish
`en` with no published `id`, and the loader **404s** rather than throwing if the state is
reached another way. Two defences because one is a validation somebody will route
around — a direct SQL fix, a future bulk tool — and the second is the one that holds
then.

### R43 — A-D13's "two callers" leaves the shipped prose unlinted. **Three callers**

All 36 of `blog.content.test.ts`'s cases derive from `BLOG_ARTICLES`. Once the prose is
in Postgres, **CI lints nothing that ships.**

**RULING: three callers — vitest over `src/content/arcana/**` (44 lore docs), the save
endpoint over submitted bodies, and a THIRD over the database rows**, run by the sweep
cron and reported, not by vitest (which has no database in the unit project and must not
acquire one).

**This is the ruling that keeps A-D13 honest.** Without the third caller, "the lint
survives the move to Postgres" is true of new writes and false of everything already
published — and the failure is invisible, because the lint would be passing on an empty
set.

### R44 — A-D13 conflated rules about *an* article with rules about *the two launch articles*

The three orientation anchors, the ~1100-word floor and the divergence proof are facts
about the two committed articles. **Applied to every future article they refuse most of
them** — an article about one card does not need `#what-tarot-is`.

**RULING: the lint splits into `ARTICLE_RULES` (bind every row: the Malay grep, the tic
lists, the therapy list, the description band, the block vocabulary, bare paths) and
`LAUNCH_ARTICLE_RULES` (bind the two imported slugs only, by name).** Getting this wrong
in either direction is bad: merged, the editor refuses valid articles and the author
disables the lint; dropped, the two best articles lose their guarantees.

### R45 — `ContentLocaleLink` links `/en/blog/<slug>` unconditionally

§6 omitted it. It has no `locales` prop, so on an Indonesian-only article the public
footer offers a link to a URL A6 makes 404.

**RULING: it gains a `locales` prop and renders nothing when the sibling does not
exist.** This is a **reader-facing 404 that A6 creates**, which makes it A6's, and it is
the kind of defect a signed-out crawl finds only if the crawl includes an
Indonesian-only article — so §10.2's crawl list gains one.

### R46 — §10.2's byte-identity test is a migration oracle with an expiry

*"The two imported articles render byte-identically to today's output"* is the right
acceptance test **and cannot be a permanent one** — the first legitimate edit through the
editor breaks it, correctly.

**RULING: it is a one-shot import oracle, named as such, deleted in the same commit as
`src/content/blog/**`** (task 26, the release's only destructive step, gated on the
production import having run). A permanent test here would be a test that forbids editing
the articles.

---

## 7. Smaller rulings, in one line each

- **R47 — §0.1's dependency table is wrong about A2.** A-D18 dropped
  `llm.call_recorded`, so A2 declares no event, never imports the taxonomy, and does not
  depend on A1. **Only migration ordering binds.** Patched.
- **R48 — "Nine call sites" is true of expressions, false of files.** Eight files;
  `translate.ts` holds a stream site *and* a `complete()` site serving two ops, so its
  `op` is an expression (`repairing ? 'translation_repair' : 'translation'`), not a
  constant. A2's per-site table is the authority, not the count.
- **R49 — Three W3 onboarding routes have a real querent and no `withAnalytics` scope**,
  so Lotus ledger rows would land unattributed. **RULING: accept unattributed rows in
  v0.5.0 plus a naming query in `docs/analytics-queries.md`.** Adding `withAnalytics` to
  three W3 handlers is a W3 change for a reporting nicety, and A2's diff already spans
  five workstreams.
- **R50 — `npm run smoke` and `probe:moderation` do not set `ANALYTICS_ENABLED=0`** and
  would attempt ~18 ledger inserts per run against whatever `DATABASE_URL` points at.
  **RULING: both scripts set `ANALYTICS_ENABLED=0` in `package.json`. A2 owns the edit**
  and `package.json` joins §6.
- **R51 — "Per-reading token cost" is not achievable as §7 states it.** The moderation
  classifier runs **before** the `readings` row exists, so it can never carry
  `reading_id`. **RULING: the figure is "biaya generasi" (generation cost) and A2 sets
  `reading_id` on `gist`, which it can.** §7 is patched. A per-reading *total* including
  moderation would need a request id threaded through both, which nobody asked for.

---

## 8. What every plan must now change

| Plan | Rulings binding on it |
|---|---|
| A1 — admin foundation | R1 (zero-line diff), R3 (nullable both), R7 (harness), R20 (audit-secrets, two vars), R23 (file split), R30 (**throws**), R31 (five clauses), R32 (closed page list), R34, R35, R36, R37 (**Production only**), R38 |
| A2 — llm ledger | R2 (no `tee.ts`), R4 (four statuses), R5 (`total_ms`, timed at the call), R16 (**fix `nonZero`**), R17 (**own buffer**, §6 gains `track.ts`/`flush.ts`), R18, R47, R48, R49, R50, R51 |
| A3 — aggregation | R15 (`IS DISTINCT FROM`), R19 (400 days), R20, R22 (split `rollup`), R24 (unbuilt delta), R25 (two calendars), R26 (`peakWindow5h` + measured k), R29 (**no `deleted_at` filter**) |
| A4 — charts | R8 (**opaque surface**), R9 (per-set commands), R10, R11 (top-3+Other), R12 (labelled heatmap), R13 (Cinzel), R14 (**hero = calls**), R21 (no metrics route), R33 (grep is the whole rule) |
| A5 — user detail | R3 (unattributed case), R21, R27 (`AdminReadingDetail`), R28 (reading route), R29 (labelled soft-delete), R30 (`await` before decrypt), R33, R36, R51 |
| A6 — blog CMS | R6 (CHECK + index + comment), R39 (**sitemap leaf**), R40 (**contract test**), R41 (delete static params), R42 (both directions), R43 (**three callers**), R44 (rule split), R45 (`ContentLocaleLink`), R46 (one-shot oracle) |

---

## 9. What is still open after this reconciliation

1. **Nobody has read this dashboard on a screen.** §0.5 stands, undischarged by any of
   the six, and R8 is the evidence that a surface question cannot be answered from a
   plan. Loop 3 at 1440px is the instrument and it has not been run.
2. **`drain()`'s orphaning is worked around, not fixed** (R17). The next `defer()` from
   inside a deferred job hits it. Recorded in `docs/workstream-notes.md` under W4.
3. **`/api/memory/summary` may be losing an event today** (R18). Pre-existing, W5's.
4. **`llm_calls` retention is a calculation, not a measurement** (R19). Revisit at
   100 MB.
5. **The `readings` fleet-wide `local_date` index is declared and unbuilt** (R24).
6. **The Jakarta-pinned heatmap axis is a labelled approximation** (R12).
7. **A per-reading total cost including moderation is not answerable** (R51).
8. **The audit trail has no `resource` value for the user LIST page** (A5's finding).
   A5 writes none — 50 audit rows per page load would make the audit panel unreadable.
   **Recorded as a stated gap for subject-access answers**, and it is the one place this
   release's audit is deliberately incomplete.
