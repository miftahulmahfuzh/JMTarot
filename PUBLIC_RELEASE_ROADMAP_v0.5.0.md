# JMTarot — Public Release Roadmap v0.5.0: The Operator's Surface

> **RECONCILED 2026-07-30. `docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md` OUTRANKS THIS
> FILE.** The six plans returned **51 defects in this roadmap**, nineteen verified against
> running code. **Four would have shipped:** `admin_access_log` aborting every hard delete
> with `23502` (R3); the chart palette validated against a surface `Backdrop` does not
> paint (R8); `drain()` silently orphaning three of nine ledger ops (R17); and
> `getUserById` hiding the soft-deleted users the admin page exists to show (R22).
> **The outright factual errors below are patched in place and marked `[R#]`.** Design
> amendments live in the reconciliation only.

**v0.4.0 built the surface a stranger can see. v0.5.0 builds the surface the operator
can see.** Six workstreams, `A1`–`A6`, behind one `/admin` tree that no crawler, no
querent and no signed-in user without an allowlisted email may know exists.

**The thesis, and the one number that explains it: this application makes nine distinct
LLM calls and records the token cost of exactly one of them.** `/api/reading` threads
`usage` from the provider through `tee.ts` into `readings.token_input` /
`token_output`. The moderation classifier, the gist extractor, the day summary, the
frequency verdict, the Lotus distillation, the persona generator and both translation
paths all receive a fully-populated `usage` object from the adapter and destructure it
away. **The provider side is already built and correct — `anthropic.ts` and `openai.ts`
resolve `usage` on every exit path including a consumer `break`.** What is missing is a
ledger and eight one-line reads. Until that exists there is no answer to "what does a
user cost", which is the question a public release is about to start asking every day.

**The second thesis: `LLM_API_KEY` is a fixed annual subscription sold for coding, not a
wallet, and there is no hard spend cap and never was.** V9 replaced the cap with
`LLM_WINDOW_CALL_CEILING=280` model calls per rolling five hours. That ceiling is a
count, not a cost, and it is fleet-wide — so today nobody can answer "which user burned
the window", "is consumption growing", or "when does the current trajectory hit the
ceiling". The risk V9 named is **quota exhaustion, a denial of service against the
querent with no billing alert attached**, and the comedown is worse: enforcement means
key revocation, which takes the whole app down at once. A trajectory chart is the only
early warning this project can have.

**The third: prose that only a git commit can change is prose that does not get
written.** Two articles ship. Both were authored by an agent in a worktree. The blog
tab exists so the next twenty are authored by a person in a browser — and it must hold
the copy lint while doing it, because `src/content/types.ts` says in capitals that
**the lint is the reason the prose is data**, and a lint needs exact strings.

---

## 0. How to execute this roadmap

### 0.1 The plan index

| WS | Plan file | Owns | Depends on |
|---|---|---|---|
| **A1** | `docs/plans/2026-07-30-admin-foundation.md` | `requireAdmin()`, the `/admin` gate, the shell, `admin_access_log`, the audit primitive, `/privacy` §3+§8, `events.ts` for this release | — |
| **A2** | `docs/plans/2026-07-30-llm-ledger.md` | `llm_calls`, the `op` identity, all 9 call sites, the price table, the cost model | **— `[R47]`** (A-D18 dropped `llm.call_recorded`, so A2 declares no event and never imports the taxonomy; only migration ordering binds) |
| **A3** | `docs/plans/2026-07-30-analytics-aggregation.md` | `src/lib/db/queries/admin/**`, bucketing, rollups, trajectory + forecast, the sweep additions | A2 |
| **A4** | `docs/plans/2026-07-30-chart-primitives.md` | `src/components/chart/**`, the chart tokens, `/admin` overview | A1, A3 |
| **A5** | `docs/plans/2026-07-30-admin-user-detail.md` | `/admin/users`, `/admin/users/[id]`, the audited PII reveal | A1, A2, A3 |
| **A6** | `docs/plans/2026-07-30-blog-cms.md` | `blog_posts`, `blog_post_locales`, the lint move, the editor, publish/unpublish | A1 |

**Reconciliation is `docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md` and it outranks
every plan above.** v0.4.0's reconciliation found six defects in the roadmap it was
reconciling; v0.3.0's found more. Assume this file is wrong somewhere and that the
reconciliation is where that is recorded.

### 0.2 The read order, every time

1. `CLAUDE.md` — the invariants. Not optional and not skimmable.
2. **This file, §2 and §3.** §2 is the decisions; §3 is the schema and it is the only
   place a new table is described.
3. `docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md` where it exists.
4. Your own plan.
5. **The section of `docs/workstream-notes.md` for every workstream whose files you
   touch.** A2 touches nine call sites owned by W4, W5, W7, V2, V8 and W3. A6 touches
   S1, S2 and S6. Neither may be written from this file alone.

### 0.3 Four things that are true of every workstream

1. **`npm run build` before believing a green typecheck.** TypeScript must stay on 5.x;
   the native 7.x port passes `tsc --noEmit` and dies in the build.
2. **A new integration test is named `*.integration.test.ts` or the unit project picks
   it up and fails without a database.**
3. **`npm test` and `npm run test:integration` are run SEPARATELY.** `npm run test:all`
   fails ~12–22 of V9's limiter tests as a harness race; its red means nothing.
4. **Every query module takes its handle first** and never imports
   `@/lib/db/client` — that file starts with `import 'server-only'`.

### 0.4 Migration numbers are assigned here, so two agents cannot both write `0009`

| Migration | Owner | Contents |
|---|---|---|
| `0009_v12-admin-access-log.sql` | **A1** | `admin_access_log` |
| `0010_v12-llm-calls.sql` | **A2** | `llm_calls` |
| `0011_v12-blog-cms.sql` | **A6** | `blog_posts`, `blog_post_locales` |

**No migration in this project inserts a row** — a migration runs in production too.
A6's two committed articles are migrated by a **script**, `scripts/blog-import.ts`,
following the `db:seed` precedent exactly.

**And the rail matters more than the number.** A committed migration nobody applied
took production down on 2026-07-28 and the app looked perfectly healthy while it did.
`npm run build` runs `scripts/db-migrate-deploy.ts` first and fails rather than skips.
Two things it still does not fix, both live for this release: concurrent builds could
both apply one migration, and **a destructive migration still deploys ahead of the code
that tolerates it.** Nothing in v0.5.0 is destructive. Keep it that way — A6 in
particular must ADD tables and leave `src/content/blog/**` importable until the import
script has run in production.

### 0.5 The one thing that is not a task in any plan

**Nobody has looked at this dashboard on the machine it will be used from.** Loop 5
gives a ~500px layout cropped to look narrow and cannot answer a width question; loop 4
(`getBoundingClientRect` in a fixed-width container) is the loop for width and is the
one A4 must use. But a dashboard is the first surface in this project that is
**desktop-first**, and the only instrument for "is this readable at 1440px" is a
browser at 1440px. That is loop 3 (`tools/shot.sh`) at a large size, and it is A4's
acceptance step.

---

## 1. What v0.5.0 is

Five things have to land.

1. **An admin surface that is invisible to everyone else.** Not "protected" —
   invisible. A signed-in querent who types `/admin` gets the same 404 as a typo.
2. **A token ledger with one row per LLM call**, covering all nine call sites, with
   input and output tokens, the model, the purpose, the user, and the latency.
3. **Aggregation over an arbitrary date range**, per user and fleet-wide, with a
   growth trajectory and a stated forecast — the "when do we hit the ceiling" answer.
4. **A per-user page holding everything**: the profile, the six answers, the persona,
   every reading with its cards and its cost, the share links, the moderation history.
5. **A blog tab that can create, edit, publish and unpublish an article** without a
   deploy, without losing the copy lint, and without breaking `hreflang` reciprocity.

### What v0.5.0 is NOT

- **Not multi-tenant, not role-based, and not a permission system.** There is one class
  of admin. `ADMIN_EMAILS` is a list, not a role model. A second class of admin is a
  v0.6.0 question and inventing one now costs a schema.
- **Not a write surface over querent data.** Admin reads. The only admin writes are
  blog rows and the audit log. **An admin may not edit a reading, a profile, an answer
  or a persona** — there is no honest UI for "we changed what you said", and the
  `input_hash` mechanisms behind Lotus and the persona would silently disagree with the
  rows they were built from.
- **Not a moderation console.** `moderation_flags` is *visible* on a user's page
  because the ask was "everything". Actioning a flag — suspending an account, clearing
  a strike — is a product decision nobody has taken.
- **Not an export.** No CSV, no JSON dump, no "download all users". An export is a copy
  of the most sensitive data in the product living in a Downloads folder, and it defeats
  the one-key-per-request rule A1 is built around. `db:studio` and `pg_dump` over the
  direct connection string already serve the legitimate case.
- **Not a cost cap or a kill switch.** v0.5.0 *observes*. `LLM_WINDOW_CALL_CEILING`
  remains the only enforcement. A per-user cost budget is the obvious v0.6.0 feature and
  A3's rollups are deliberately the shape it would need.
- **Not real-time.** No websockets, no polling, no live tail. The freshest number on the
  dashboard is as fresh as the last request that wrote a row.

---

## 2. Decisions already taken

These are settled. A plan that contradicts one is wrong, and a plan that
*relitigates* one costs the reconciliation a section.

### A-D1 — Admin identity is `ADMIN_EMAILS`. No column, no claim, no role

An env allowlist of email addresses, compared server-side.

**Why not a JWT claim.** `src/lib/auth/token.ts` carries six claims plus one optional,
and `token.size.test.ts` asserts the encoded total stays under @auth/core's 3936-byte
chunking threshold — **adding a claim fails a test, by design.** Worse, there is no
server-side revocation on the JWT path, so demoting an admin would wait up to
`SESSION_TTL_HOURS`. That is the exact trap W3 hit with `onb`: *a stale claim cannot be
fixed by redirecting.*

**Why not `users.is_admin`.** It needs an env bootstrap for the first admin anyway, so
you end up with both mechanisms and two places to look. And it makes privilege
escalation a database write.

**The consequences, stated so nobody is surprised:**
- **Revocation is a redeploy.** Accepted. There is one admin.
- **Email is not the identity — `google_sub` is** (`schema.ts:79`). If the admin's
  Google email changes they lose access until the env changes. **Fail-closed, and
  correct.** Do not "fix" this by matching on `users.id`, which would put a uuid in an
  env var nobody can read.
- **The comparison is constant-time and case-folded**, over a parsed, trimmed list. An
  empty or unset `ADMIN_EMAILS` means **nobody is an admin** — never everybody. This is
  the opposite default from `ANALYTICS_ENABLED` and the same as `RATELIMIT_BACKEND`:
  a typo must not open the door.

### A-D2 — `/admin` answers **404** to a non-admin, never 403

A 403 confirms the surface exists. A 404 does not, and the whole tree is one
`notFound()` away from being indistinguishable from a typo.

- **Pages** call `requireAdmin()` and `notFound()` on refusal.
- **API routes** return `404` with the same body shape a missing route would produce.
  This is a deliberate departure from `requireUser()`, which returns 401/403 so that
  *"a caller cannot tell whether middleware or the handler refused it"* — here the goal
  is the opposite, and the plan must say so at the call site or somebody will
  "fix" it back for consistency.
- **`isPublic()` MUST NEVER LEARN `/admin`.** It short-circuits `decide()` above the
  onboarding check. `/admin` is an ordinary gated path: a signed-out visitor is
  redirected to `/login` by the existing chain, and `requireAdmin()` is what turns a
  signed-in non-admin into a 404. `gate.test.ts` gets a case named for the worst
  outcome, exactly as `/en/history` has one.
- **`/en/admin` is not a route and must not become one.** It is not a content path, so
  `contentRewrite()` never sees it and `stripLocalePrefix` is never applied to it —
  it reaches `decide()` spelled as requested and matches nothing. **The G2 contract
  binds: only the content clause strips a prefix.**

### A-D3 — `/admin` is in the middleware matcher, and carries `noindex`

Two separate mechanisms, both required.

- **In the matcher**, because middleware is what redirects a signed-out visitor. The
  R7 exclusions (`wallpapers/`, `cards/`, `dukuns/`) exist to stop a `Set-Cookie` on a
  550KB static response; an admin page is neither static nor large.
- **`noindex, nofollow` on every admin route**, via the route group's `metadata`.
  Belt and brace to the 404: a crawler has no session, so it gets `/login`, but the
  header costs nothing and the S-D12 precedent (`/s/`'s `noindex` must not spread) shows
  this project already reasons about header scope.
- **`/admin` never reaches `sitemap.ts`, and `contentAlternates()` must throw on it.**
  It already throws on a non-content path — A1 adds the assertion, it does not add the
  behaviour.

### A-D4 — The ledger is a new table, `llm_calls`. It is NOT `events`

`events` is wrong for this and the reasons are structural, not stylistic:

- `events.props` is `jsonb` behind `sanitizeProps()`, which **silently drops
  non-scalars, caps at 24 keys and truncates strings to 120 characters.** Aggregating
  `sum((props->>'token_input')::int)` over millions of rows is a cast per row on an
  unindexed jsonb field.
- `events.user_id` is `on delete set null` because **events survive account erasure**,
  and that is only honest because props are provably scalar. A ledger wants FK
  integrity and its own retention.
- `events.name` is a **closed 67-name taxonomy that people read as a data dictionary.**
  A row per LLM call is not an event in that taxonomy's sense; it is a fact table.

`llm_calls` gets real integer columns, real indexes, and a retention policy of its own.

### A-D5 — Token capture has exactly two mechanisms, and no third

1. **Buffered calls: one chokepoint.** `metered()` in `src/lib/llm/index.ts` already
   wraps **every** `complete()` call in the app, because `getProvider()` is the only way
   to reach a provider. It gains a required call-site identity and records the ledger
   row itself. **All six buffered sites are covered with no caller edits beyond passing
   `op`.**
2. **Streaming calls: threaded by hand at three sites.** `streamReading` is
   deliberately not wrapped by `metered()`, and `index.ts` says why in capitals:
   wrapping a stream means rebuilding `usage`'s always-settles/never-rejects contract
   inside a decorator, and "finishing the job" there produces **two reservations per
   reading**. Do not wrap it. The three sites are `/api/reading` (already threaded —
   A2 adds the ledger write beside the existing `persistReading`), `/api/memory/summary`
   and `translate.ts`'s `openStream`.

**There is no third mechanism.** Nothing re-reads a provider response anywhere else,
and `callClass.test.ts` already enumerates and enforces the nine sites by grep — A2
extends that test rather than writing a new one.

### A-D6 — `usage` MUST ALWAYS SETTLE AND MUST NEVER REJECT, and the ledger write is never on the request path

`types.ts:133-138` states the contract in capitals: nothing awaits `usage` on the hot
path, so a rejection is an unhandled rejection, and a stream that failed resolves with
nulls.

- **A2 may not change that contract.** Every ledger write is inside `after()` or
  `defer()`, bounded, and failure is logged and swallowed — the W4 rule that *writes go
  through one `after()` per request* and *everything else fails silently and logs*.
- **The acceptance test is W4's, verbatim: stop the database and take a reading.** It
  must stream and complete exactly as normal, with nothing but a log line.
- **`tee.ts`'s 2000ms `USAGE_TIMEOUT_MS` is the precedent and the cap.** A ledger row
  with null tokens is a fact; a request held open for a token count is a bug.
- **Snapshot before the await.** `tee.ts`'s `finish()` read mutable fields *after*
  `await source.usage` and recorded every abandoned reading as failing for an unknown
  reason. Any new code that awaits `usage` and then reads state has the same bug.

### A-D7 — Tokens are stored; **cost is computed at read time** from a committed, versioned price table

A `cost_usd` column would be a lie the day a price changes, and back-filling it would
rewrite history. Storing tokens and the model is storing the facts.

- `src/lib/llm/prices.ts` is **PURE, zero imports, and hand-maintained** — the
  `resources.ts` precedent (*nothing unverified enters it, and no number lives anywhere
  else*) and the `bodyHash` precedent (*manual bookkeeping somebody will want to
  delete*).
- Keyed by model string, with an `effective_from` date, so a price change is additive
  and a historical range is priced with the prices of its own period.
- **An unknown model prices as `null`, never as zero.** A zero silently understates the
  bill; a null shows up on screen as "unpriced" and gets fixed. The dashboard renders
  the unpriced call *count* beside every cost figure, so a cost is never quoted over an
  incomplete denominator.
- **z.ai is a fixed annual subscription and its marginal cost per token is genuinely
  zero.** Price it at zero *explicitly and with a comment*, and label the figure on
  screen as **notional** — what these calls would cost at the fallback provider's rate.
  That is the number worth watching, because the fallback is where a revocation lands.

### A-D8 — Forecasting is ordinary least squares in a pure module, with a stated band, and never a model call

- `src/lib/analytics/forecast.ts` — **PURE, unit-tested, no `server-only`, no
  `process.env`.** The `swipeDeck.ts` precedent: the whole policy in a pure module is
  the part `npm test` can reach.
- **OLS on daily totals, plus a residual-based band.** No ARIMA, no Prophet, no
  seasonal decomposition, no dependency. Seven data points do not support a seasonal
  model and pretending otherwise is the failure mode.
- **A forecast is NEVER rendered without its band and its n.** A point estimate from
  nine days of data, shown alone, is the chart lying with a straight face.
- **Below a stated minimum n the forecast is not rendered at all** — the empty state
  says how many more days it needs. Same discipline as V5's M14 contract: *a deck
  rendering two panels with the second one blank IS the empty state roadmap forbids.*
- **`tally.ts`'s rule applies: a heuristic may fail a build; it may not fail a person.**
  A forecast that throws must degrade to "not enough data", never to a 500.

### A-D9 — The chart palette is new hex, it is licensed here, and it is **validated by a committed script**

`## Styling` says compose from tokens and do not introduce new hex values *without a
reason worth writing down*. Here is the reason: **JMTarot has one accent hue.** Gold
means "a card goes here". `muted` and `label` are lavender-grays below the chroma floor.
`danger` is the one destructive colour and is reserved. **One hue cannot carry three
readers, three services and two token directions.**

So `src/theme/chart.ts` is a new token file, mirrored into `tokens.css`, and **§5 holds
the validated values plus the exact command that validated them.** Two rules:

- **The validator run is a committed test.** `chart.palette.test.ts` re-runs the six
  checks over the shipped values. A palette that passed once and drifted is the failure
  this prevents, and it is the same move `blog.content.test.ts` makes with `bodyHash`.
- **A fifth categorical hue is a reconciliation question, not an authoring
  convenience** — the R16 precedent for `callout`. §5 records that a 4-state
  good/warning/serious/critical hue ramp **was measured and is not achievable on this
  canvas**, and what to do instead.

### A-D10 — No charting library. Hand-rolled, server-rendered SVG

Three reasons, and the second is binding:

1. `next.config.ts`'s CSP is `script-src 'self' 'unsafe-inline'` **in report-only, and
   the stated goal is to TIGHTEN it.** `src/content/types.ts` refuses an `html` block
   kind on exactly this ground: *what it costs is not a theoretical injection on prose
   we wrote — it is a permanent new reason the policy can never be enforced.*
2. **`scripts/audit-secrets.ts` runs inside `npm run build`** and a chart library is a
   new client bundle to audit and a new supply-chain surface on the one route that
   renders every user's data.
3. A bar, a line, a stacked bar, a donut and a heatmap in SVG are each under 80 lines,
   and **server-rendered SVG needs no hydration at all** — which is the whole reason the
   dashboard can be fast on a cold lambda.

**The hover layer is the one part that needs JavaScript** and it is a small client
component per chart, taking already-rendered geometry as props. `interaction.md`'s
default stands: line and area get a crosshair and tooltip, bar/dot/cell get a per-mark
tooltip, a bare stat tile gets none.

### A-D11 — Never a dual-axis chart. Not once

Two y-scales is the single most common charting mistake and it is banned outright.
Token input against token output is **two series on one axis** (they share a unit).
Tokens against cost, or calls against latency, is **two charts or an indexed common
base** — never two scales in one frame.

Also non-negotiable, from `dataviz`:
- **Categorical hues in fixed order, never cycled.** A 5th series folds into "Other" or
  becomes small multiples.
- **Colour follows the entity, never its rank.** Filtering to two readers must not
  repaint the survivors — `thessaly` is slot 1 whether or not she is on screen.
- **Sequential is one hue light→dark. Diverging is two hues with a NEUTRAL GRAY
  midpoint.** Never a rainbow, never a hue at the midpoint.
- **Text wears text tokens, never the series colour.**
- **A legend is always present for ≥2 series** (a single series needs none — the title
  names it), and ≤4 series are *also* direct-labelled, so identity is never
  colour-alone.

### A-D12 — Admin copy is **Indonesian, hardcoded, and never in the i18n catalog**

S-D6 settled the shape of this: *lore and article prose never enter the i18n catalog*,
because **the catalog is shipped to the browser as JSON on every page.** A dashboard is
~150 strings. Putting them in `locales/id.ts` and `en.ts` would ship every one of them
to every querent on every page load, and would double the authoring cost of a surface
with exactly one reader.

- Admin strings live beside their components under `src/app/admin/**`.
- **Indonesian prose, English technical terms where those are the terms of art** —
  `token`, `p95`, `input`, `output`, `uplift`. That is how the language is actually
  spoken about software and pretending otherwise produces `keluaran token` on a chart
  axis.
- **`LocaleSwitch` does not mount on `/admin`** and `LOCALE_SWITCHER` is irrelevant
  there. The switcher's three mount points are unchanged.
- **`t()` is not called in `src/app/admin/**`.** A test asserts it, because the
  reflex to reach for `useT()` in a new component is strong and the failure is silent
  catalog growth.

### A-D13 — Blog articles move to Postgres, and **the lint moves with them**

`src/content/types.ts`: *"Anyone converting these files to TSX for authoring comfort
switches the release's only quality gate off, silently."* A database row is the same
hazard wearing different clothes, so the lint is extracted before anything else
happens.

- **`src/lib/content/lint.ts` is PURE and has `[R43]` THREE callers, not two**: the
  existing vitest suite over `src/content/arcana/**`'s 44 lore documents; `POST
  /api/admin/blog` over the submitted body; **and a third over the DATABASE ROWS, run by
  the sweep cron and reported.** Same word lists, same function. Bad prose is refused on
  save with the offending word and its location, which is a *better* gate than CI because
  it reaches the author while they are still writing.
- **`[R43]` THE THIRD CALLER IS WHAT KEEPS THIS DECISION HONEST.** All 36 of
  `blog.content.test.ts`'s cases derive from `BLOG_ARTICLES`, so once the prose is in
  Postgres **CI lints nothing that ships.** Without the third caller, "the lint survives the
  move to Postgres" is true of new writes and false of everything already published — and
  the failure is invisible, because the lint would be **passing on an empty set.** It runs
  in the cron and not in vitest, because the unit project has no database and must not
  acquire one.
- **`[R44]` THE RULES SPLIT IN TWO, OR THE EDITOR REFUSES VALID ARTICLES.** The three
  orientation anchors, the ~1100-word floor and the divergence proof are facts about **the
  two launch articles**, not about an article — applied to every future row they refuse
  most of them, since an article about one card needs no `#what-tarot-is`. So:
  **`ARTICLE_RULES`** (bind every row: the Malay grep, the tic lists, the therapy list, the
  description band, the block vocabulary, bare paths) and **`LAUNCH_ARTICLE_RULES`** (bind
  the two imported slugs only, by name). Merged, the author disables the lint; dropped, the
  two best articles lose their guarantees.
- **`EN_TICS` bans The Empress's own English keyword and the lint's scope stays
  `src/content/**` plus submitted bodies only.** `abundance`, `sacred`, `heal`,
  `shadow work` are generated card keywords in `cards.json`. **Anyone who widens the
  lint to the rendered page fails on data the blog does not own, concludes the lint is
  broken, and switches it off.** This is recorded in CLAUDE.md and it applies verbatim.
- **`plainText()` joins spans with the empty string, and R16's condition still binds:**
  if `doc.test.ts`'s joining assertion or `blog.content.test.ts`'s adjacency case is
  deleted, revert to `text: string`. A6 inherits that condition; it does not get to
  discharge it.
- **`bodyHash` and the manual `dateModified` are DELETED, and that is the one thing
  this change makes genuinely better.** They exist because *"there is no truthful
  automatic source for `dateModified`"* — an mtime is a checkout artefact, `git log` is
  unavailable at request time. **A row's `updated_at` is a truthful source.** Say so in
  the plan, because deleting a tripwire looks exactly like deleting a tripwire.

### A-D14 — The `Block` union is **not widened**, and there is no markdown field

- **No `html`, no `raw`, no `markdown` variant, ever** (§5 rule 3 of v0.4.0, and the CSP
  argument in A-D10). The editor is a **structured block editor** producing the existing
  five kinds. It is not a textarea of markdown, and it is not a contenteditable
  rich-text field.
- **No sixth kind.** `callout` is the ask R16 refused, and
  `types.contract.test.ts` asserts its absence *because the failure mode of a refused
  ask is somebody granting it quietly.* A6 does not grant it.
- **Every submitted body is validated with zod before it is stored.** zod is already a
  dependency. A stored `Block[]` the renderer cannot render is a 500 on a public page,
  and the row would already be committed.
- **`link.path` is a bare path, never a prefixed one** — `Prose.tsx` applies
  `localePath()`. The editor must refuse `/en/...` on save, and must resolve
  `cardRef.slug` through `cardByUrlSlug` on save rather than at render.

### A-D15 — Publish/unpublish must keep `hreflang` reciprocal. **This is the most dangerous interaction in the release**

`contentAlternates()` takes **the locales that actually exist (R2)**, not `LOCALES`,
and *"a pair naming a URL that 404s makes Google discard the whole set silently."*
Today `entry.locales` is a hand-written array in a committed file. After A6 it is a
**query result that an admin can change with a toggle.**

- **Unpublishing `en` while `id` stays published must remove `en` from the alternates
  set, from the sitemap, and from `blogIndexNode`'s `blogPost` list, in the same
  request.** All three already derive from one field; A6's job is that the new field is
  the *only* source and that nothing caches a stale copy of it.
- **Unpublishing the last locale of an article removes the article from the sitemap
  entirely** and its URL must 404, not 200-with-empty.
- **A published `en` with no body, or a body that fails the lint, must be
  unreachable** — the `locales` set is derived from *published rows that have a body*,
  never from an intent field.
- **`sitemapLanguages()` and `contentAlternates()` must stay the same function**, which
  is what makes the two `hreflang` sets unable to disagree. A6 changes what feeds them.
  It does not fork them.
- **A test asserts the negative control: a draft article appears in no sitemap, no
  index, no alternates set, and its URL 404s.**
- **`[R42]` THIS DECISION REASONED ONLY ABOUT UNPUBLISHING, AND THE OPPOSITE DIRECTION IS A
  500 ON A SITEMAPPED URL.** `alternates.ts:115-120` **throws** without an `id` document —
  deliberately, per R2 of v0.4.0, because a wrong canonical de-indexes the correct page. So
  **publishing `en` first crashes the page.** Defended twice: the status route **refuses** a
  transition that would publish `en` with no published `id`, **and** the loader **404s**
  rather than throwing if the state is reached another way. Two defences because one is a
  validation somebody will route around — a direct SQL fix, a future bulk tool — and the
  second is the one that holds then.
- **`[R41]` `generateStaticParams` AND `dynamicParams = false` ARE DELETED, AND NOTHING IS
  LOST.** From `blog/[slug]/page.tsx:46-53` and `workstream-notes.md:5834-5837`:
  *"`generateStaticParams` DOES NOT MAKE THIS PAGE STATIC … what it buys with
  `dynamicParams = false` is a 404 at the routing layer."* And R21 of v0.4.0, closed
  2026-07-29 against the real Vercel CDN: **all four blog URLs answer `private, no-cache,
  no-store` with `x-vercel-cache: MISS` twice running** — every content entry inert. ISR was
  never available (*"it needs a static root layout, and S-D10 already refused multiple root
  layouts"*). **The only thing given up is the build-time slug closure — which is precisely
  what would prevent publishing without a deploy — and `notFound()` is already the belt.**
  Recorded because a future session will otherwise "restore" the static params and re-break
  publishing.

### A-D16 — Full PII access, one key per request, every reveal audited, and `/privacy` amended in both locales

The ask was "every personal data". Granted, with the architecture that already exists
for it.

- **`worst_thing`'s plaintext leaves the server only one key at a time.** CLAUDE.md:
  *"there must NEVER be a bulk variant, because a six-answer read for a browser puts
  the most sensitive string in the product into the response to opening a page."*
  The admin endpoint is `GET /api/admin/users/<id>/answer/<key>`, `private, no-store`,
  one key, and **`queries/onboarding.ts` remains the only module that decrypts that
  column.**
- **The user page renders presence, not content.** A tap reveals one answer. This is
  the same amendment V8 made for the querent's own `/account`, and the same placement
  argument answers it: nothing is revealed until asked.
- **Every reveal writes an `admin_access_log` row**, in the same request, before the
  response. A failed audit write is a failed reveal — the `redactForUser()` ordering
  precedent, where redaction runs *before* the flag so a failure aborts the whole thing.
- **`moderation_flags.question` is revealable on the same terms**, and the 30-day
  redaction sweep is untouched. An admin cannot un-redact, and A1 must not add a way to.
- **`/privacy` clause 3 and clause 8 gain a sub-clause in `id` AND `en`.** The policy is
  live in production in two languages and currently describes a system in which nobody
  reads your answers. Shipping admin access without amending it makes a live legal
  document false. **A1 owns this and it is a release blocker, not a follow-up.**
- **`admin_access_log` is append-only and no admin UI deletes from it.** It is the
  audit trail; a delete button on an audit trail is the audit trail's absence.

### A-D17 — `readings.token_input` / `token_output` **stay**, and `llm_calls` is the ledger beside them

They are read by `docs/analytics-queries.md` and by the existing `reading.completed`
event. Removing them is a destructive migration for no gain.

- `llm_calls.reading_id` is nullable and set for the reading call only.
- **The duplication is deliberate and has precedent**: `reading_cards.user_id` is
  denormalized on purpose, and `readings.shared_at` is denormalized from `share_links`.
- **A consistency query goes in `docs/analytics-queries.md`** and must return 0 rows —
  the `onboarding_answers` encryption-audit precedent, where the check lives beside the
  schema and has a stated expected answer.
- **`[R15]` IT MUST USE `IS DISTINCT FROM`, NOT `<>`.** Both columns are nullable and
  `a <> b` is `NULL` — not `true` — when either side is NULL, **so a `<>` version returns 0
  rows unconditionally and is indistinguishable from a passing check.** The query carries a
  one-line note saying why; this is the `moderation_flags` partial-index class of subtlety,
  where the obvious spelling is silently vacuous.
- **`[R16]` AND IT DEPENDS ON §12.6 BEING FIXED RATHER THAN DOCUMENTED.** If
  `anthropic.ts`'s buffered path keeps storing `0` where the streamed path stores `NULL`,
  this check returns rows by design and the two decisions contradict each other.

### A-D18 — `events.ts` has **one owner for v0.5.0, and it is A1**. Expect to FOLD

S-D13's rule, and the 66→67 lesson: *"Four names were drafted and ONE landed… Expect to
FOLD rather than add, and write down what you folded."*

The declared additions are **three**, taking the taxonomy 67 → 70:

| Name | Props | Owner declaring it |
|---|---|---|
| `admin.page_viewed` | `{ page: string }` | A1 |
| `admin.blog_saved` | `{ slug: string; locale: Locale; action: 'create' \| 'update'; blocks: number; lint_violations: number }` | A6 |
| `admin.blog_status_changed` | `{ slug: string; locale: Locale; from: string; to: string }` | A6 |

**What was folded out, and why, so nobody re-adds it:**
- **`admin.pii_revealed` — dropped.** `admin_access_log` is the record of truth for a
  reveal, and a second copy in `events` buys nothing while putting a resource key into
  a table whose rows survive erasure.
- **`admin.user_viewed` — dropped.** Opening a page changes no decision, and it is the
  same argument that killed `revealed` in v0.4.0: request volume in the platform log
  answers the privacy question.
- **`llm.call_recorded` — dropped.** That is a row in `llm_calls`, not an event. A fact
  table and an event stream recording the same fact is how they drift.

**A `slug` in `events.props` looks like a violation of "no free text, ever" and is
not** — the rule is about *querent* text, and a blog slug is admin-authored public
content already in a URL. Say this at the declaration site or a reviewer will flag it.

---

## 3. Schema deltas — the only place a new table is described

`schema.ts` has **ONE OWNER** and *"if you need a column, it goes in your workstream
plan's `## Schema deltas` section and reconciliation folds it in."* This section is
what reconciliation folds. **Three new tables, thirteen → sixteen. No column is added
to any existing table.**

Conventions that bind (`schema.ts:16-34`): snake_case, plural, every table has `id` and
`created_at`, timestamps are `timestamptz` via `tsCol`, dates are `'YYYY-MM-DD'`
strings via `dateCol`, FKs are `<singular>_id` declared with `references()`,
**no `pgEnum` anywhere** — `text().$type<...>()` with the value set in a comment, and
narrowed only where W1 owns the value set.

### 3.1 `admin_access_log` — owner A1, migration `0009`

Append-only. One row per privileged read of another person's data.

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `defaultRandom()` | PK |
| `admin_user_id` | uuid | **NULL `[R3]`** | — | FK→`users.id` **on delete set null** |
| `subject_user_id` | uuid | NULL | — | FK→`users.id` **on delete set null** |
| `resource` | text | NOT NULL | — | bare; A1 owns the set: `onboarding_answer`, `moderation_question`, `user_detail`, `reading_body` |
| `resource_key` | text | NULL | — | the answer key, or the flag id. **NEVER the decrypted value** |
| `created_at` | timestamptz | NOT NULL | `defaultNow()` | |

- **`[R3]` RESOLVED, AND IT WAS AN ERASURE BUG, NOT AN ATTRIBUTION QUESTION.** The
  original `NOT NULL` + `on delete set null` does not merely read oddly — it **raises
  `23502` at delete time, so the hard delete of any user an admin had ever read about
  ABORTS.** That is `/privacy` clause 8's erasure promise failing for exactly the
  population most likely to invoke it, visible only in a cron log. **Both FK columns are
  nullable with `on delete set null`, as `events.user_id` is: the audit trail outlives the
  account and loses its attribution rather than blocking an erasure.** The integration
  test asserts the `DELETE` **succeeds**, and it fails against the original schema — which
  is what makes it a test rather than a comment. A5 must render the unattributed case.
- `index('admin_access_log_subject_created_idx').on(subjectUserId, createdAt.desc())` —
  "what has been read about this person", the query a subject access request needs.
- `index('admin_access_log_admin_created_idx').on(adminUserId, createdAt.desc())`.
- **No `updated_at`.** Append-only tables do not have one, and its presence would
  invite an update.

### 3.2 `llm_calls` — owner A2, migration `0010`

One row per model call. **The fact table this release exists for.**

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `defaultRandom()` | PK |
| `user_id` | uuid | NULL | — | FK→`users.id` **on delete set null**. NULL for a call with no querent behind it |
| `reading_id` | uuid | NULL | — | FK→`readings.id` **on delete set null**. Set for the reading call only |
| `op` | text | NOT NULL | — | bare; **A2 owns the set** — see §3.2.1 |
| `model` | text | NOT NULL | — | the resolved model string, never the env var name |
| `call_class` | text | NOT NULL | — | `'interactive' \| 'deferred'`, mirroring `CallClass` |
| `streamed` | boolean | NOT NULL | — | no default; the caller knows |
| `input_tokens` | integer | NULL | — | **NULL, never 0, when the provider reports nothing** |
| `output_tokens` | integer | NULL | — | same |
| `total_ms` | integer | NULL | — | **`[R5]` RENAMED from `latency_ms`.** Total, not TTFT, and it times **the call, not the request** |
| `status` | text | NOT NULL | — | bare; **four values `[R4]`** — `'ok' \| 'partial' \| 'failed' \| 'aborted'`. `tee.ts`'s vocabulary verbatim |
| `error_kind` | text | NULL | — | the `tee.ts` vocabulary, never a message and never a driver error |
| `locale` | text `$type<Locale>` | NULL | — | |
| `local_date` | date (string) | NOT NULL | — | **the querent's calendar day**, via `dateCol` |
| `created_at` | timestamptz | NOT NULL | `defaultNow()` | |

- **`[R5]` RESOLVED: the column is `total_ms`.** `readings.latency_ms` is time to first
  token, and two columns with one name and two meanings in one schema is the trap.
  `reading.completed` already distinguishes the two words, so this table uses that
  vocabulary. **And it is timed from a timestamp taken immediately above `gateReading`,
  NOT from `outcome.totalMs`** — which starts at the handler top and includes four budget
  round trips plus the classifier. **Expect `llm_calls.total_ms <
  reading.completed.total_ms`, and A3 must NOT reconcile them.**
- **`[R4]` `'refused'` IS STRUCK.** A `reserveModelCall()` refusal never reaches a
  provider, so there is no call to record — and a row for it would destroy `count(*)` as
  "calls made", which is the quantity the 280 ceiling is expressed in, while duplicating
  `llm.ceiling_reached` that A-D18 forbids.
- **`local_date` is the querent's day, sent by the client, and must never be recomputed
  from `created_at`** — the trap that makes a Jakarta reading a day out between midnight
  and 07:00. For a call with no querent (a cron-driven repair pass) use the UTC date and
  say so.
- `index('llm_calls_created_idx').on(createdAt.desc())` — the fleet time series.
- `index('llm_calls_user_created_idx').on(userId, createdAt.desc())` — the per-user one.
- `index('llm_calls_op_created_idx').on(op, createdAt.desc())` — cost by purpose.
- `index('llm_calls_local_date_idx').on(localDate)` — the day bucket.
- **`reading_id` needs its own index**: it is an FK, and *Postgres does not index an FK
  for you* — the `reading_cards_reading_idx` lesson, where a cascade performed one
  sequential scan **per deleted parent row**.

#### 3.2.1 The `op` value set — A2 owns it, and it is closed

`reading`, `moderation`, `gist`, `day_summary`, `frequency`, `lotus`, `persona`,
`translation`, `translation_repair`.

Nine values for nine call sites, and `translation_repair` is separate from
`translation` because *a repair pass is a second call the querent never waited for* and
folding them hides the cost of V2's repair architecture. **`callClass.test.ts` already
enumerates the nine sites by grep; A2 extends it to assert the `op` at each.**

### 3.3 `blog_posts` and `blog_post_locales` — owner A6, migration `0011`

Two tables, because an article is one thing published once and N locale documents with
independent bodies, statuses and timestamps. One table with `..._id`/`..._en` column
pairs is the shape R6 already rejected for `lotus_avatars.summary`.

**`blog_posts`**

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `defaultRandom()` | PK |
| `slug` | text | NOT NULL | — | **UNIQUE.** Hyphenated lowercase, English, identical in both locales |
| `date_published` | date (string) | NULL | — | **NULL until first publish.** Locale-invariant: the article was published once |
| `created_at` | timestamptz | NOT NULL | `defaultNow()` | |
| `updated_at` | timestamptz | NOT NULL | `defaultNow()` | `$onUpdate` — **and set by hand in every upsert** |

**`blog_post_locales`**

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `defaultRandom()` | PK |
| `post_id` | uuid | NOT NULL | — | FK→`blog_posts.id` **cascade** |
| `locale` | text `$type<Locale>` | NOT NULL | — | |
| `status` | text | NOT NULL | `'draft'` | bare; A6 owns it: `'draft' \| 'published' \| 'unpublished'` |
| `title` | text | NOT NULL | — | |
| `description` | text | NOT NULL | — | the 80–158 char band is enforced by the lint, not by the column |
| `hero_card_slug` | text | NULL | — | resolved through `cardByUrlSlug` **on save** |
| `hero_alt` | text | NULL | — | both-or-neither with `hero_card_slug`; a CHECK is cheap insurance |
| `body` | jsonb `$type<Block[]>` | NOT NULL | — | the existing five kinds. Validated by zod on save |
| `created_at` | timestamptz | NOT NULL | `defaultNow()` | |
| `updated_at` | timestamptz | NOT NULL | `defaultNow()` | `$onUpdate` — **this is `dateModified`.** Set by hand in every upsert |

- `unique('blog_post_locales_post_locale_uq').on(postId, locale)`.
- `index('blog_post_locales_status_idx').on(status)` — the public list filters on it.
- `check` that `hero_card_slug` and `hero_alt` are both null or both present.
- **`$onUpdate()` DOES NOT FIRE INSIDE `onConflictDoUpdate`.** It applies to
  `db.update()` only. Every upsert sets `updatedAt` by hand — and here that is not
  hygiene, it is **the entire `dateModified` mechanism and V2's translation staleness
  rule.** Drop the line and the column silently freezes at the first insert.
- **`status` is three values and `'unpublished'` is not `'draft'`.** A draft was never
  public; an unpublished article was, may be indexed, and its URL must now 404. They
  differ in the sitemap, in `hreflang`, and in whether anybody has the link.

### 3.4 What does NOT change

No column on `users`. No column on `readings`. No column on `events`. **No `is_admin`,
no `role`, no `adm` claim** (A-D1). `src/content/blog/**` stays importable until the
import script has run in production, then is deleted in a **separate commit** (A-D13,
and the non-destructive rule in §0.4).

---

## 4. The route table

### 4.1 New routes

| Path | Kind | Gate | Notes |
|---|---|---|---|
| `/admin` | page | `requireAdmin()` → `notFound()` | The overview. A4 |
| `/admin/users` | page | ″ | List + search. A5 |
| `/admin/users/[id]` | page | ″ | The everything page. A5 |
| `/admin/tokens` | page | ″ | Consumption, trajectory, forecast. A4 |
| `/admin/blog` | page | ″ | List, status toggles. A6 |
| `/admin/blog/new` | page | ″ | A6 |
| `/admin/blog/[slug]` | page | ″ | Editor, per locale. A6 |
| `/api/admin/users` | route | ″, **404 on refusal** | Paged list. A5 |
| `/api/admin/users/[id]/answer/[key]` | route | ″ | **One key. `private, no-store`. Audited.** A1 contract, A5 caller |
| `/api/admin/users/[id]/moderation/[flagId]` | route | ″ | Same terms. A5 |
| `/api/admin/blog` | route | ″ | POST create, PUT update. **Lint runs here.** A6 |
| `/api/admin/blog/[slug]/status` | route | ″ | Publish / unpublish. A6 |

### 4.2 Rules over the whole tree

- **Every one of these is gated, `noindex`, and absent from `sitemap.ts`** (A-D3).
- **Every one declares `runtime` and `maxDuration`.** `POST /api/locale` was *the only
  database-writing route declaring neither*, and Vercel's Hobby default of ten seconds
  lost the write on a cold lambda plus a suspended Neon compute. **A dashboard query is
  slower than a locale write and every admin request is a cold one**, because there is
  one admin and no warm instance. This is the single most likely live failure in v0.5.0.
- **A bigger `maxDuration` must be paired with a bound on the client**, or you have only
  made the hang longer. A3's queries get a stated timeout and the UI gets a stated
  failure state.
- **`/admin` is not a content path.** `isContentPath`'s tables (`CONTENT_EXACT`,
  `CONTENT_TREES`) are not touched, and A1 adds the negative-control test.
- **`[R21]` THERE IS NO `/api/admin/metrics/[metric]` ROUTE.** It was assigned to
  "A3/A4" — an unowned route §11 did not list as a seam — and A4 established it needs no
  client fetch at all: pages read ranges from GET params and query server-side. An
  unowned route nobody needs is the cheapest defect here to fix and the likeliest to have
  been built twice.
- **`[R36]` THE REFUSAL CODE DEPENDS ON SESSION STATE, AND §10.2 NEEDS BOTH.**
  Signed-out `/api/admin/**` gets **401** from `decide()`; a signed-in non-admin gets
  **404** from `requireAdmin()`. A crawl script treating 401 as failure reds on correct
  behaviour, which is how an acceptance test gets disabled.

---

## 5. The chart system

### 5.1 The validated palette

**Surface: `#130f22`** — already a token, `color.bgRadial[1]`. No new value.

### `[R8]` THE CHART PANEL MUST PAINT THAT SURFACE **OPAQUELY**. THIS IS AN INVARIANT

**The palette is validated against `#130f22`, and a validated palette names a surface —
so a surface is a promise the layout has to keep.** `Backdrop` is
`position: fixed; inset: 0` painting
`radial-gradient(120% 90% at 50% 4%, #221a3a 0%, #130f22 42%, #08060f 100%)`, so a
**transparent** panel at the top of the viewport — where a KPI row and the hero figure go
— sits on `#221a3a`, not `#130f22`. Measured:

| Mark | vs `#221a3a` (backdrop top) | vs `#130f22` (opaque panel) |
|---|---|---|
| `#a3423a` — `critical`, severity step 4, **and a diverging pole** | **2.66:1** | **3.04:1** |

**2.66:1 is below the 3:1 mark floor, and the ordinal check passes either way because its
own light-end floor is 2.0 — so the A-D9 test would have been GREEN while the mark was
under-contrast on screen.** Every chart panel therefore sets
`background: var(--chart-surface)` with `--chart-surface: #130f22`, and **a chart may
never be transparent over `Backdrop`.** A4's test asserts the computed background is
opaque, because a missing `background` is the failure and it looks like nothing.

### The commands, per set — `[R9]` one command does not fit all five

Three of the five sets require `--ordinal`; run bare, each exits 1 with three FAILs, and
an implementer following a single command writes a red test over correct values.

```sh
# categorical (adjacent), and the two 2-slot sets
node scripts/validate_palette.js "<hexes>" --mode dark --surface "#130f22"
# sequential and severity -- --ordinal IS REQUIRED
node scripts/validate_palette.js "<hexes>" --ordinal --mode dark --surface "#130f22"
# categorical for all-pairs forms (scatter / bubble / small multiples)
node scripts/validate_palette.js "<hexes>" --pairs all --mode dark --surface "#130f22"
```

**`chart.palette.test.ts` re-runs these and fails on drift** (A-D9).

**Categorical — fixed order, four slots, never cycled.** `ALL CHECKS PASS`, adjacent.

| Slot | Hex | Reads as | Assigned to |
|---|---|---|---|
| 1 | `#ab8b20` | dim gold | `thessaly` · `daily` · `input` |
| 2 | `#2fa4a0` | teal | `margaret` · `spread3` · `output` |
| 3 | `#8b7bd8` | violet | `adrian` · `yesno` |
| 4 | `#d2707f` | rose | "Other" |

- **Slot 1 is `#ab8b20`, not the token `gold #c9a227`** — measured at L=0.728, outside
  the dark band `[0.48, 0.67]`. It is the token darkened into the band, and that is the
  whole delta.
- **Worst adjacent pair: violet↔teal ΔE 10.5 (deutan).** Comfortable.
- **At `--pairs all` the teal↔rose pair is ΔE 6.5 — a WARN, and `[R10]` A WARN EXITS 0.**
  The run passes; the obligation is **mandatory direct labels**. So **all-pairs forms
  (scatter, bubble, small multiples) cap at THREE series**, and any four-series form
  carries direct labels. This is the `choosing-a-form.md` ladder applied, not an opinion.
  A test asserting this run *fails* would be red on correct data.

**Sequential — magnitude, one hue, light→dark.** `ALL CHECKS PASS`.

```
#d8cdf7  #c0b0ee  #a996e4  #9382cf  #7a68b8
```

The dimmest step clears the canvas at 4.02:1. **A first attempt ending at `#3d3272`
failed at 1.70:1** — on a dark surface the *dimmest* step is the one that must clear the
background, which is the opposite of the light-mode intuition. Recorded because it will
be re-derived wrongly otherwise.

**Severity — ordinal, one hue, four steps.** `ALL CHECKS PASS`.

```
#e0a49c  #cd8078  #b85c52  #a3423a
```

Terminates on the existing `color.danger` token, so the app's one destructive colour is
the deep end of the severity scale rather than a fifth unrelated value.

**Binary status — good vs critical, with icon and label.** `ALL CHECKS PASS`, ΔE 24.7.

```
good #4f9d6b     critical #a3423a
```

**Diverging — growth up vs down, neutral gray midpoint.** ΔE 27.2 **on the two poles**.

```
#2fa4a0   <-  #7a7192 (token color.label)  ->   #a3423a
```

**`[R10]` THE "ALL CHECKS PASS" ABOVE IS THE TWO POLES ONLY.** The trio including the
midpoint **fails the chroma floor on `#7a7192` (C=0.051) — and that failure IS the
requirement**, because a diverging midpoint must be neutral. The midpoint is validated as
a text/neutral token, **never as a categorical slot**, and a test asserting the trio
passes is wrong about the design.

### 5.2 The negative finding, recorded so it is not re-attempted

**A four-state `good / warning / serious / critical` hue ramp is NOT achievable on this
canvas.** Measured, three ways:

- amber `#ab8b20` ↔ orange `#d4813c` — **ΔE 8.0 normal vision, 2.3 protan.** Hard fail.
- gold `#ab8b20` ↔ green `#4f9d6b` — **ΔE 12.3 normal vision.** Hard fail (floor is 15).
- brick `#a3423a` ↔ orange `#c2703f` — **ΔE 12.9 normal vision.** Hard fail.

The dark band `[0.48, 0.67]` plus the chroma floor leaves too little room between amber,
orange, gold and green. **So severity is ordinal (one hue, §5.1) or binary plus an icon,
and never a four-hue traffic light.** Anyone who "adds a warning colour" will produce
one of the three failing pairs above.

### 5.3 The forms, chosen before the colours

Per `choosing-a-form.md`, and the answer is sometimes *not a chart*:

| What the operator must learn | Form | Colour job |
|---|---|---|
| Tokens today, and the trend | **stat tile** — value, delta, sparkline | 1 categorical |
| The five headline numbers | **KPI row** of stat tiles | — |
| Tokens per day over a range | **line**, area for one series | sequential or 1 categorical |
| Input vs output over time | **two lines, ONE axis** (shared unit) | 2 categorical |
| Cost split by `op` | **a TABLE** — nine classes exceeds the >7 rule `[R11]` | sequential, inline bar |
| Share by reader / service | **stacked bar**, not a pie | categorical |
| Calls against the 280 ceiling | **meter**, same-hue track | sequential |
| Readings per weekday × hour | **heatmap**, `[R12]` **Jakarta-pinned and LABELLED as such** | sequential |
| Trajectory to the ceiling | **line + band + a dashed projection** | 1 hue + gray |
| Per-user cost league | **table**, with an inline bar column | sequential |

- **`[R11]` ANY 4-SLOT CATEGORICAL FORM IS TOP-3 + OTHER**, because slot 4 **is** Other.
  An earlier "folded to 4 + Other" needed five slots and there are four.
- **`[R12]` THE HEATMAP'S LOCAL HOUR IS AN APPROXIMATION.** `local_date` carries no time
  and `created_at` is UTC, so a querent's local hour is not derivable from `llm_calls`. It
  ships pinned to `Asia/Jakarta` **with the axis labelled** — an unlabelled local-hour axis
  derived from UTC is a chart that lies, and the label is the whole difference.
- **`[R13]` THE HERO FIGURE IS CINZEL, NOT "SANS".** This project has two serifs and no
  third family, and `## Styling` forbids a new font as firmly as a new hex.
- **`[R14]` THE HERO NUMBER IS CALLS-IN-WINDOW OVER 280, NOT NOTIONAL SPEND.** z.ai's
  marginal cost per token is genuinely zero, so spend is a counterfactual that A-D7
  already requires be labelled *notional* **and** shown beside an unpriced count — and a
  hero figure needing two disclaimers is a KPI tile. The release's stated risk is quota
  exhaustion and key revocation, which is metered in calls per rolling five hours.
  **`peakWindow5h` reconstructs exactly what Redis holds** (`RANGE BETWEEN INTERVAL
  '5 hours' PRECEDING` over `created_at`) and is the only quantity directly comparable
  to 280. Notional spend is KPI tile 1. §12.5 closed.

- **A pie chart appears nowhere.** The brief asks for "circle chart, pie graph" and the
  honest answer is that a stacked bar beats a pie at every part-to-whole job except one
  slice against a limit — which is a **meter**, and there is one. A donut is permitted
  in exactly one place if A4 wants it: a single ratio in a stat tile. **Nine `op`
  categories in a pie is unreadable and would breach the >7-classes rule, which says
  use a table.**
- **More than ~7 meaningful classes is a table**, not more colours. The nine `op`
  values are a table, or a stacked bar folded to 4 + Other.
- **A hero figure for the one number the dashboard leads with**, ≥48px. That number is
  notional spend for the selected range (A-D7).

### 5.4 Marks, and the accessibility floor

From `marks-and-anatomy.md` and `interaction.md`, binding on A4:

- Thin marks. **2px lines, ≥8px markers, 4px rounded data-ends anchored to the
  baseline, a 2px surface gap between adjacent fills and stacked segments**, a 2px
  surface ring on overlapping marks.
- **Recessive grid and axes.** Selective direct labels — **never a number on every
  point.**
- **Legend always present for ≥2 series; none for one.** ≤4 series also direct-labelled.
- **A table view exists for every chart.** This is the relief the contrast and CVD WARNs
  oblige, and it is also how a screen reader reads a chart.
- **Texture is available** for the full-CVD, print and `forced-colors` cases — one
  directional fill at 45°/135°, never decorative.
- **Dark mode is the only mode.** JMTarot has no light theme, so there is nothing to
  flip and §5.1 is validated against the real surface. **Do not add a light variant
  "for completeness"** — an unvalidated second palette is worse than one mode.

---

## 6. Changes to existing files, and who may make them

Everything else is additive. These are the shared files, and **an unlisted edit to one
of them is a reconciliation defect.**

| File | Owner | The change, and the one risk |
|---|---|---|
| `src/lib/auth/gate.ts` | **A1** | **SECURITY-RELEVANT. `[R1]` ZERO PRODUCTION LINES** — tests only. If a plan proposes editing `isPublic`, that plan is wrong |
| `src/middleware.ts` | **A1** | **`[R1]` ZERO LINES.** The matcher is a NEGATIVE-LOOKAHEAD EXCLUSION list (`'/((?!_next/\|cards/\|…).*)'`), so `/admin` is **already covered** — adding `admin/` would **stop middleware running on it** and invert A-D3. A1's acceptance criterion is `git diff --stat` on this file and `gate.ts` being **empty** |
| `src/lib/analytics/events.ts` | **A1** | Three folded-in names (A-D18). A6 declares two of them and A1 transcribes them without narrowing |
| `src/lib/db/schema.ts` | **A1 (W1's role)** | The three tables in §3, verbatim. **No column on any existing table** |
| `src/lib/llm/index.ts` | **A2** | `metered()` gains `op` and the ledger write. **Do NOT wrap `streamReading`** |
| `src/lib/llm/types.ts` | **A2** | `LLMCallOpts` gains `op`. **`ReadingUsage` and the `usage` contract are untouched** |
| `src/lib/llm/callClass.test.ts` | **A2** | Extend the existing grep enumeration to assert `op` per site |
| The 8 discarding call sites | **A2** | One-line reads. **No behaviour change, no new await on a hot path** |
| ~~`src/lib/analytics/tee.ts`~~ | **`[R2]` NOBODY** | **ZERO LINES.** `teeReading` is pure over an async iterable and `ReadingOutcome` already carries status, `errorKind`, `totalMs` and `usage`. The reading's row goes in `/api/reading`'s existing `defer()`, beside `persistReading` |
| `src/lib/analytics/track.ts`, `flush.ts` | **`[R17]` A2** | **WAS MISSING AND THE EDIT IS UNAVOIDABLE.** `drain()` does `store.deferred.splice(0)` and iterates the removed copy, so **a `defer()` from inside a deferred job is silently orphaned** — `gist`, `translation_repair` and `frequency` all run there, so **three of nine ops would record nothing with a green suite.** The ledger rides its own `store.calls` buffer flushed AFTER the deferred loop. **A2 does NOT make `defer()` re-entrant** — that is a W4 change with its own blast radius |
| `src/lib/db/testing/harness.ts` | **`[R7]` A1** | `resetDb()`'s TRUNCATE list gains all three tables, in `0009`'s commit. Was assigned to nobody, so it would have gone stale silently |
| `scripts/audit-secrets.ts` | **`[R20]` A1** | `ADMIN_EMAILS` joins `SECRET_ENV` — the same reasoning that makes `toViewer()` drop `email` |
| `package.json` | **`[R50]` A2** | `npm run smoke` and `probe:moderation` set `ANALYTICS_ENABLED=0`, or a smoke run attempts ~18 ledger inserts against whatever `DATABASE_URL` points at |
| `src/theme/tokens.css` | **A4** | Mirror `chart.ts`. `tokens.ts` itself is untouched — chart tokens are their own file |
| `src/app/api/cron/sweep/route.ts` | **A3** | Retention for `llm_calls`. **Never for `admin_access_log`** |
| `docs/analytics-queries.md` | **A3** | New queries, incl. the A-D17 consistency check |
| `src/content/types.ts` | **A6** | **Nothing above the marker. No sixth kind. No widening.** Ideally zero edits |
| `src/app/blog/**`, `src/lib/seo/blog.ts` | **A6** | Source becomes a query. **`contentAlternates()` and `sitemapLanguages()` stay one function and A6 changes NEITHER** |
| `src/app/sitemap.ts` + `sitemap.test.ts` | **A6, `[R39]`** | **THE ROADMAP'S LARGEST OMISSION.** `sitemap.ts:11-19` calls itself a LEAF that *"must never 500"* and `sitemap.test.ts:181-191` **bans `@/lib/db`** — while A-D15 made its contents a query result. **One NAMED import added to the allowlist, never a loosened rule, plus a narrow `catch` so an outage costs the blog rows and not the file.** This deliberately inverts the pages' rule: a sitemap that 500s costs the crawl of 54 URLs; one missing two blog rows costs two |
| `src/app/blog/blog.contract.test.ts` | **A6, `[R40]`** | It bans `@/lib/db` across `src/app/blog/**` **and asserts `generateStaticParams` + `dynamicParams = false` are PRESENT** — so it is **red on the correct implementation**, which is the state in which somebody deletes it. Both fences amended; the "no fourth route that 500s" rationale **REWRITTEN, not deleted** |
| `src/components/ContentLocaleLink.tsx` | **A6, `[R45]`** | Was missing. It links `/en/blog/<slug>` unconditionally, so on an Indonesian-only article the public footer offers a **reader-facing 404 that A6 creates.** Gains a `locales` prop |
| `src/app/privacy/**` | **A1** | Clause 3 + 8, **both locales**. Release blocker (A-D16) |
| `.env.example` | **A1** | `ADMIN_EMAILS`, fully annotated |
| `CLAUDE.md` | **reconciliation only** | No workstream edits it. New traps go to `docs/workstream-notes.md` |

---

## 7. The six workstreams

### A1 — Admin foundation, the gate, and the audit trail

**The security-relevant one.** Everything else mounts inside what this builds.

Builds: **`[R23]` TWO files, not one** — `src/lib/admin/allowlist.ts` (**ZERO imports**:
the parse and the constant-time compare) and `src/lib/admin/identity.ts` (`requireAdmin`,
`requireAdminPage`, `adminNotFound`). One file cannot hold both, because
`requireAdmin()` → `currentUser()` → `@/lib/auth/auth` → `NextAuth()` at module scope →
`@/lib/db/client` → `import 'server-only'`, which throws under Vitest. Precedent:
`origin.ts`, `keys.ts`, `lines.ts`. **A5 imports names from both, which is why this was
blocking rather than a local call.** Then: the `/admin` route group and
its shell, `admin_access_log` + `src/lib/db/queries/admin/audit.ts`, the `noindex`
metadata, the `/privacy` amendment in both locales, `ADMIN_EMAILS` in `.env.example`,
migration `0009`, and `events.ts`'s three names.

Must prove: a signed-in non-admin gets **404** on every page and every API route; a
signed-out visitor gets `/login`; `/en/admin` matches nothing; `isPublic('/admin')` is
false and `isPublic('/en/admin')` is false; `contentAlternates('/admin')` throws;
`/admin` is absent from `sitemap.ts`; an empty `ADMIN_EMAILS` admits nobody; a failed
audit write fails the reveal.

### A2 — The LLM call ledger

**Nine call sites, one of which is already done.** The provider layer is correct and
must not change.

Builds: migration `0010` and `llm_calls`; `op` on `LLMCallOpts`; `metered()` recording
all six buffered sites; hand threading at `/api/memory/summary` and `translate.ts`;
the ledger row beside `/api/reading`'s existing `persistReading`;
`src/lib/llm/prices.ts` (PURE, zero imports) and the notional cost model;
`src/lib/db/queries/admin/calls.ts`.

Must prove: **stop the database and take a reading** — it streams and completes with
nothing but a log line; a z.ai `input_tokens: 0` stores **NULL, not 0**, on the buffered
path too (`anthropic.ts:149-152` does not apply `nonZero()` today and that asymmetry is
A2's to fix or to document); a cancelled stream still writes a row with the right
`error_kind`; `usage` still never rejects; the reservation count per reading is
**unchanged** — one, not two; an unknown model prices `null`; `callClass.test.ts` asserts
the `op` at all nine sites.

**Read `docs/workstream-notes.md` on W4's `tee.ts` and V2's `bindAnalyticsScope()`
before touching either.** A `ReadableStream`'s `pull()` is not in a request scope, and
every streamed translation silently lost its analytics event for as long as V2 had
shipped.

### A3 — Aggregation, trajectory, and the query layer

Builds: `src/lib/db/queries/admin/{metrics,users,rollup}.ts` — **handle first, always**
— **plus `[R22]` `src/lib/analytics/rollup.ts` for the PURE folds**, because
`queries/contract.test.ts` enforces handle-first on every export in a `/queries/` module
and a pure fold has no handle. Same wall W3 hit with the Lotus cache and W5 with
`windowBounds`. Also **`[R29]` `adminUserById`/`adminUserList` MUST NOT filter
`deleted_at`** — `getUserById` does (`profile.ts:68`), and reusing it makes §7's
"visible AND LABELLED" fail silently as a 404 that reads like a bad id. Then:
day/week bucketing on the querent's `local_date`, never on `created_at` in the server's
zone; per-user aggregates; `src/lib/analytics/forecast.ts` (PURE, OLS + residual band,
minimum-n empty state); `docs/analytics-queries.md` additions; `llm_calls` retention in
the sweep.

Must prove: a range spanning a DST-free but timezone-shifted day buckets by the
querent's day; `sql<T>` is **not** trusted — `answersUpdatedAt` typed its aggregate
`unknown` and converted by hand *because Drizzle returns a string from a raw `sql`
template and the compiler believed the assertion*, so every answer edit was judged
wrongly with a green typecheck and a green unit suite. **Only an integration test calling
`.getTime()` saw it.** Every aggregate in A3 needs that integration test.
Forecast: n below the minimum renders the empty state, never a line; a degenerate series
(all zeros, one point) does not throw.

### A4 — Chart primitives and the overview

Builds: `src/theme/chart.ts` + the `tokens.css` mirror; `chart.palette.test.ts`;
`src/components/chart/**` (hand-rolled SVG: stat tile, KPI row, hero figure, line, area,
stacked bar, meter, heatmap, sparkline, table view, legend, tooltip layer); `/admin` and
`/admin/tokens`.

Must prove: **no new dependency** in `package.json`; the palette test passes the six
checks; **no dual-axis chart exists** — a grep-based test is appropriate here, the
`callClass.test.ts` precedent; a legend renders for every ≥2-series chart and none for a
1-series one; every chart has a table view; colour follows the entity under filtering
(filter to two readers, assert slot assignment is unchanged); **loop 4 for width** at
320/360/390 for the phone case and **loop 3 at 1440px** for the desktop case, because
this is the project's first desktop-first surface and loop 5 cannot give a width.

### A5 — The per-user everything page

Builds: `/admin/users`, `/admin/users/[id]`, `/api/admin/users/**`, the audited reveal
components, per-user token series, **`[R28]` `GET /api/admin/users/[id]/reading/[readingId]`**
(§3.1 declared `resource = 'reading_body'` and §4.1 had no route that could ever write it —
a dead audit value reads as a capability that exists), and **`[R27]` its own
`AdminReadingDetail`** rather than mounting `ReadingView`.

**`[R51]` "PER-READING TOKEN COST" IS NOT ACHIEVABLE AND THE FIGURE IS "BIAYA GENERASI".**
The moderation classifier runs **before** the `readings` row exists, so it can never carry
`reading_id`. A2 sets `reading_id` on `gist`, which it can. A per-reading *total* including
moderation would need a request id threaded through both, which nobody asked for.

**`[R27]`'s binding reason is narrower and harder than §11.5's arity argument:** the admin
page needs `status`, `model`, `prompt_version`, tokens, `total_ms`, `session_id` and
`shared_at`, and **adding any of those to `ReadingViewProps` puts operator-only fields on
the component that renders `/s/<slug>` to strangers** — a props type carrying `session_id`
is one spread away from a public RSC payload. Supporting: `ReadingView` never receives a
`blocked` reading (all three callers filter it) and A5 must show them; and it renders
through `useT()`, so an `en` admin would read an English panel inside an Indonesian
dashboard. `AdminReadingDetail` keeps the two rules worth keeping — `lang` on the body,
none on `choice`, and cards assigned into a sparse array by `position`.

Must prove: the list payload carries **no** `body`, no `gist`, no decrypted answer —
asserted on the returned object (`'body' in item` is false), the V6 precedent, and *the
binding reason is VD8, not bytes*; the reveal is **one key per request** and writes an
audit row before responding; a soft-deleted user is visible **and labelled**, because
hiding them is how a 30-day restore window becomes invisible; `moderation_flags` whose
`question` is redacted render as redacted, and no path un-redacts; nothing on these pages
calls `t()` (A-D12).

**`ReadingView`'s four rules bind here if A5 mounts it** — no session, no fetch, no
`@/lib/db/**` import even as `import type`, and **rule 4: it never renders
`reading.body` when the locale differs from the viewer's and no translation was
supplied.** An admin page is a fourth surface for a component whose header says three.
**A5 should render admin reading detail with its own component rather than mounting
`ReadingView`**, and say why — the alternative is quietly making a shared component's
invariant list wrong.

### A6 — The blog CMS

Builds: migration `0011`; `blog_posts` + `blog_post_locales`;
`src/lib/content/lint.ts` (PURE, two callers); `src/lib/db/queries/admin/blog.ts`;
the zod body schema; the structured block editor; `/admin/blog/**`;
`/api/admin/blog/**`; `scripts/blog-import.ts`; and the rewiring of `src/app/blog/**`,
`sitemap.ts` and `src/lib/seo/blog.ts` onto the new source.

Must prove: the lint refuses `tempoh` and every other Malay word on save, in the `id`
half only; the English tic list applies to the `en` half only — **running the Malay
words against English is theatre**; a draft appears in **no** sitemap, **no** index,
**no** alternates set, and its URL 404s; unpublishing `en` removes it from the
`hreflang` set **and** from `blogPostingUrl`'s siblings **and** from `blogIndexNode`
in the same request (A-D15); the two imported articles render byte-identically to
today's output — **that is the acceptance test for the whole workstream**, and it is
checkable because `Prose.tsx` is unchanged; `plainText()` still joins with the empty
string; no sixth `Block` kind; `link.path` with an `/en/` prefix is refused on save.

**`src/content/blog/**` is deleted in a separate commit, after the import has run in
production.** Non-destructive rail, §0.4.

---

## 8. Environment variables

**`[R20]` TWO new variables, not one.** `.env.example` is the reference and A1 writes the
full annotations.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ADMIN_EMAILS` | **PRODUCTION ONLY `[R37]`** | unset = **nobody** | Comma-separated, trimmed, case-folded, constant-time compared. **Fails CLOSED** — the `RATELIMIT_BACKEND` direction, not the `ANALYTICS_ENABLED` one. **Not `NEXT_PUBLIC_`**, and `NEXT_PUBLIC_SITE_ORIGIN` remains the only `NEXT_PUBLIC_` variable this project declares |
| `LLM_CALLS_RETENTION_DAYS` | no | `400` | **`[R19]`** A3's sweep. 400 equals `HISTORY_DAY_LIMIT` and `MAX_RANGE_DAYS` **so the dashboard can never offer a range whose data was already swept** — a smaller number produces a chart that looks broken. The binding input is **Neon free's 0.5 GB**, not a row rate that does not exist yet: at ~450 B/row, 400 days at 1000 calls/day is ~180 MB. Revisit at 100 MB |

### `[R37]` `ADMIN_EMAILS` MUST NOT BE SET ON PREVIEW, AND NOBODY HAD MADE THIS CALL

**Preview shares `DATABASE_URL` with production.** §10.1 wants the variable on Preview for
loop 5 — which would make **every push-triggered preview URL serve the full admin surface
over real user data**, on a URL that is effectively public and in nobody's threat model.
Each plan saw only its own half of this.

**Production only. Loop 5 runs the signed-in admin flow against
`E2E_BASE=http://localhost:3001`, and runs the signed-out and non-admin refusal cases
against production** — which need no admin identity and are the half that actually needs a
real deployment. **This also belongs in `docs/DEPLOY-VERCEL.md`** beside the
`MIGRATE_DATABASE_URL` rules: a variable whose correct value differs per environment is
exactly the class that file exists for.

- **Escape `$` as `\$` in `.env` files** and **do not escape in the Vercel dashboard**,
  where values are literal. An email has no `$`, but the annotation sits beside
  variables that do and the rule is one line.
- **No new price variable.** Prices are a committed constant (A-D7), not configuration —
  a price in an env var is a number with no history and no review.
- **No `ADMIN_ENABLED` kill switch.** An empty `ADMIN_EMAILS` is the kill switch and a
  second mechanism is a second thing to get wrong.

---

## 9. Non-negotiables

1. **A non-admin never learns `/admin` exists.** 404, never 403. `isPublic()` never
   learns it either.
2. **No admin write to querent data.** Reads, blog rows, audit rows. Nothing else.
3. **No bulk decrypt, ever.** One key per request, `private, no-store`, audited.
4. **`/privacy` is amended in both locales in the same release.** A live legal document
   must not describe a system that no longer exists.
5. **`usage` always settles and never rejects.** No ledger write on a request path.
6. **No dual-axis chart. No cycled categorical hue. No rainbow sequential.**
7. **No new runtime dependency.** No chart library, no markdown parser, no date library.
8. **No `html` / `raw` / `markdown` block kind, and no sixth `Block` kind.**
9. **The copy lint survives the move to Postgres, with the same word lists.**
10. **`hreflang` stays reciprocal through every publish and unpublish.**
11. **No migration inserts a row.** The blog import is a script.
12. **Nothing new in `CLAUDE.md` from a workstream.** Traps and evidence go to
    `docs/workstream-notes.md`; this file and the reconciliation carry the rules.
13. **Admin copy never enters the i18n catalog.**
14. **`admin_access_log` is append-only and has no delete path.**

---

## 10. Verification

### 10.1 The loops, applied

- **Loop 1 (vitest)** — `isAdminEmail`, the allowlist parse, `forecast.ts`, bucketing
  boundaries, `prices.ts`, the lint, the zod body schema, `chart.palette.test.ts`, the
  no-dual-axis grep, the `t()`-absence grep.
- **Loop 2 (integration)** — every A3 aggregate (**required**, per the `sql<T>` trap),
  the audit-write-before-response ordering, publish/unpublish → sitemap/alternates,
  `llm_calls` retention, the A-D17 consistency query.
- **Loop 3 (`tools/shot.sh`)** — **at 1440px.** The desktop instrument, and A4's
  acceptance step.
- **Loop 4 (`getBoundingClientRect` in a fixed-width container)** — **the loop for
  width**, at 320/360/390, for the phone case.
- **Loop 5 (CDP over `tools/e2e/run.sh`)** — the signed-in admin flow against a
  preview, and the one loop that can prove the 404 to a real non-admin session.
  **It does not give a phone width**; both `innerWidth` and `outerWidth` are 500
  whatever `--width` says.
- **Loop 6 (a real iPhone against a preview)** — only for the cold-path question in
  §4.2. `maxDuration` on a suspended Neon compute is the failure a warm WSL request
  cannot see, and it is the same class as `POST /api/locale`'s.

### 10.2 The acceptance test for the release

A signed-out crawl, extended from v0.4.0's. Every content URL still 200s with no
`Set-Cookie` and no mention of `/login`; **every `/admin` URL 302s to `/login`; every
`/api/admin/**` URL 404s or 401s and never 200s; and with an ordinary signed-in session,
every one of them 404s.**

Plus: the two imported blog articles render byte-identically to their committed
counterparts, and `npm test` + `npm run test:integration` are green **run separately**.

---

## 11. The seams — where two workstreams meet and both think they own it

1. **`events.ts`.** A1 owns the file; A6 declares two of the three names. **Folding a
   declaration in means transcribing it, not narrowing it.**
2. **`llm_calls.total_ms` vs `readings.latency_ms`.** Two meanings, one word, one
   schema. §3.2 names it and reconciliation decides.
3. **A2's `op` set and A3's grouping.** A3 groups by `op` and must not invent a tenth
   value or an alias. Nine, closed.
4. **A4's chart tokens and `tokens.css`.** A4 mirrors into a file A1 does not touch.
5. **A5 and `ReadingView`.** §7 recommends A5 does not mount it. If A5 disagrees, that
   is a reconciliation question, not a local call — the component's invariant list would
   have to change.
6. **A6 and S1/S2's `contentAlternates()`.** The single highest-risk seam in the release
   (A-D15). The function does not fork; its input changes.
7. **A6 and the lint's scope.** `src/content/**` plus submitted bodies. **Never the
   rendered page** — that fails on `cards.json` keywords and gets the lint switched off.
8. **A1's `/privacy` amendment and A5's reveal.** The clause must describe what A5
   actually built. Written last, from the code, not first from the plan.

---

## 12. Open questions — **six of seven CLOSED by reconciliation**

**All rulings are in `docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md`.**

1. ~~`admin_access_log.admin_user_id` nullability~~ — **CLOSED `[R3]`. Both FK columns
   nullable.** And it was never an attribution question: `NOT NULL` + `on delete set null`
   **raises `23502`, aborting the hard delete of any user an admin had read about.**
2. ~~`total_ms` vs `latency_ms`~~ — **CLOSED `[R5]`. `total_ms`, timed at the call**, from a
   timestamp above `gateReading`, not from `outcome.totalMs`.
3. ~~Does A5 mount `ReadingView`?~~ — **CLOSED `[R27]`. Its own `AdminReadingDetail`**,
   because operator-only fields on `ReadingViewProps` would reach the component that renders
   `/s/<slug>` to strangers.
4. ~~`llm_calls` retention~~ — **CLOSED `[R19]`. 400 days.** The honest input was never the
   row rate: it is **Neon free's 0.5 GB**, and 400 matches `MAX_RANGE_DAYS` so the dashboard
   cannot offer a range whose data was already swept.
5. ~~Notional spend or call count as the headline?~~ — **CLOSED `[R14]`. Call count.** Spend
   is a counterfactual needing two disclaimers, and this release's own risk — quota
   exhaustion, key revocation — is metered in calls per rolling five hours.
6. ~~`anthropic.ts:149-152` and `nonZero()`~~ — **CLOSED `[R16]`. FIX IT.** The roadmap's
   hesitation was the argument *for* doing it now, before six consumers exist — and leaving
   it would have made A-D17's consistency check return rows **by design**.
7. **STILL OPEN: nobody has read this dashboard on a screen.** §0.5, undischarged by any of
   the six — and **`[R8]` is the evidence that a surface question cannot be answered from a
   plan.** Loop 3 at 1440px is the instrument and it has not been run.

**Eight further items are open after reconciliation** — see its §9, chiefly that `drain()`'s
orphaning is **worked around, not fixed** `[R17]`, and that the audit trail has no
`resource` value for the user LIST page (deliberate: 50 audit rows per page load would make
the audit panel unreadable).
