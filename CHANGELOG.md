# Changelog

All notable changes to JMTarot are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.2.0] - 2026-07-27

The public-release run: seven workstreams (W1–W7) planned in
`PUBLIC_RELEASE_ROADMAP.md`, reconciled in
`docs/plans/2026-07-26-RECONCILIATION.md`, and merged in order. JMTarot goes
from a two-user demo with no persistence to an app with real accounts, a
database, memory, two languages and a trust-and-safety layer.

**This release reverses two decisions v0.1.0 documented.** There is a Postgres
database now, and readings are stored. `localStorage` stops being the source of
truth for the profile and becomes a cache of what the server already knows.

### Added

- **The data layer (W1).** Postgres 16 — Docker locally, Neon in production —
  with Drizzle ORM over postgres.js. Ten tables realised from the
  reconciliation's §3 in one baseline migration; `drizzle-kit push` is banned
  and only `generate` + `migrate` are used. `src/lib/db/client.ts` is the only
  place the driver is named. Every function under `src/lib/db/queries/**` takes
  its database handle as the first argument, enforced by
  `queries/contract.test.ts`, so nothing needs the `server-only` singleton.
  AES-256-GCM field encryption (`v1.<iv>.<ct>.<tag>`, base64url) covers the two
  most sensitive columns.
- **Google sign-in (W2).** Auth.js v5 with JWT sessions and no database read on
  the request path: one `users` row per Google account, a 24-hour sliding idle
  timeout inside a 30-day hard cap, and a pure routing decision in
  `src/lib/auth/gate.ts` that Vitest owns. `requireUser()` / `currentUser()` are
  the only sanctioned way to ask "who is this, on the server".
  `POST /api/auth/dev-session` mints a genuine Auth.js JWE for local
  verification and 404s unless `DEV_PASSWORD_LOGIN=1`.
- **Onboarding and the Lotus distillation (W3).** Nine screens asked exactly
  once — the invitation, three facts, six personal questions, a closing card —
  with the resume point *derived* (the first key with no row) rather than
  stored, so a skipped question is never skipped forever. Answers are encrypted
  at rest; a skip is `answer_text IS NULL`, never an encrypted empty string.
  `profiles.completed_at` is the only completion marker, and the completion
  route reads the answer set back from the database rather than trusting the
  client to say it finished. The Lotus is a pure prompt/parser/safety module
  plus a separate impure generator that calls the model, caches, and repairs.
- **Analytics and reading persistence (W4).** A closed event taxonomy of 44
  names with a prop shape each and two compile-time guards; server-side buffering
  onto one `after()` per request; a batched client collector (2s debounce, flush
  at 20, queue capped at 200, `sendBeacon` on the hide path); a public
  `/api/events` that always answers 204. Readings and their cards are one
  transaction with a bounded retry. The reading body is captured by a manual
  fan-out — never `tee()` — with the client branch enqueued first, so nothing is
  on the path of a byte the user is waiting for. Eight operator queries in
  `docs/analytics-queries.md`, every one of them executed.
- **The three memory features (W5).** A card-frequency verdict on the reader
  picker, readings that reference the last reading through a `<riwayat>` block,
  and a per-day summary in the chosen reader's own voice — all reading from
  `readings` and `reading_cards`. Eight window specs, an M4 gate, a
  regeneration throttle, and a recall path that never throws (it returns
  `null`). Plus `/api/memory/frequency` and `/api/memory/summary`.
- **English and Indonesian, interface and readings (W6).** Two locales, `id`
  the default and the source language. Locale is never a URL segment: nine
  routes stay nine, and resolution happens once in middleware — session `loc`
  claim → `jmt_locale` cookie → `Accept-Language` → `id`. `locales/id.ts` owns
  the key set (118 keys) and `en.ts` is typed *from* it, so a missing string is
  a red typecheck rather than `undefined`. The prompt layer forks per locale
  behind a facade holding a `Record<Locale, …>`. An optional language toggle
  behind `LOCALE_SWITCHER`.
- **Trust, safety and secrets (W7).** A moderation gate that refuses harm
  without refusing sensitivity — eight categories where the answer itself would
  be the harm, a small proximity-anchored blocklist with a near-miss test per
  pattern, and a classifier on `glm-4.5-flash` at temperature 0 behind a
  1500ms timeout, both numbers measured against live z.ai rather than guessed.
  The gate primes the reading before awaiting the verdict, so the classifier is
  not the latency. Crisis resources carry a `verifiedOn` date that warns at 180
  days and fails at 365. `/terms` (17 clauses) and `/privacy` (12 sections),
  both locales, both public. `scripts/audit-secrets.ts` runs inside
  `npm run build` and fails it if a prompt or a key ever reaches the browser.
  One daily cron doing three deletes: expired soft-deleted accounts, moderation
  question redaction, and the 180-day `events` TTL.
- **`error.tsx` and `not-found.tsx`**, so a thrown render and a bad URL are not
  Next's unstyled defaults.
- **Development commands.** `db:up` / `db:migrate` / `db:seed` / `db:studio` /
  `db:down` / `db:nuke`, a test suite split into a `unit` project that needs no
  Docker and an `integration` project that does, `npm run audit:secrets`,
  `npm run probe:moderation`, and new smoke modes: `--all` (eighteen readings,
  both locales), `--lotus`, `--memory`, `--gist`, `--fixed`, `--summary`,
  `--frequency`. `npm run smoke -- --all` ends with a blind read — three
  readings per locale, names covered, shuffled — and fails loudly on three voice
  proxies.
- **Release documentation.** `PUBLIC_RELEASE_ROADMAP.md`, seven workstream
  plans and the reconciliation under `docs/plans/`, plus
  `src/lib/db/migrations/README.md` and `docs/analytics-queries.md`.

### Changed

- **Readings are persisted and the profile lives on the server.** v0.1.0's "no
  database: profile and daily state live in `localStorage`, and a reading is not
  persisted at all" is reversed. `todayKey()` stays and its comment is
  load-bearing: `local_date` is the *querent's* calendar day, sent by the
  client, and is `string` rather than `Date` on purpose — a `Date` renders in
  the server's zone and is a day out for anyone in Jakarta before 07:00. An
  integration test fails if anyone "fixes" the column.
- **Every word ceiling moved into one place.** `LENGTH_BUDGET` in
  `src/lib/prompt/budget.ts` is interpolated into the prompt and asserted by the
  smoke script, so the two cannot drift. `daily` and `yesno` gained ceilings
  they never had — a sentence count alone does not bind — and Margaret carries a
  per-reader override of 55 words on `spread3`, from measurement, because her
  voice rules mandate long subordinated sentences.
- **The English prompt layer is rewritten, not translated.** Each worked example
  deliberately uses a different card from its Indonesian counterpart (id: The
  Tower, The Hermit, The Lovers reversed; en: The Hierophant, The High
  Priestess, The Devil reversed) so a translated example is visible in five
  seconds. There is a test asserting it. The English forbidden-vocabulary list
  is longer than the Indonesian one, and the English half of the smoke grep has
  its own tic list — running the Malay words against English is theatre.
- **The rate limiter and the middleware were largely rewritten** for the
  Auth.js gate, locale resolution, and per-route limits.
- **`next.config.ts` sets security headers**, with `x-frame-options:
  SAMEORIGIN` and `frame-ancestors 'self'` — never `DENY` / `'none'`, because
  this project's only way to drive its own UI is a same-origin iframe harness.
  `src/lib/headers.test.ts` asserts both.
- **`npm run build` now runs the secrets audit**, and every npm script that
  touches the network sets `RES_OPTIONS=no-aaaa` — AAAA lookups hang 4–12s in
  this WSL image, which broke Google sign-in with a 10s undici connect timeout
  and looks exactly like a bad client secret.
- **The production database decision (roadmap D5) is resolved: Neon**, free
  plan, Singapore, Postgres 16. The pooled connection string is for Vercel only;
  migrations, `db:studio` and `pg_dump` take the direct one. `client.ts`'s three
  knobs (`max 1`, `prepare false`, `ssl require`) are conditional on `VERCEL`,
  not on `NODE_ENV`, because a preview build is also `NODE_ENV=production`.
- **The domain is `www.jmtarot.site`**, bought and live; the apex 308-redirects
  to the `www` host, and only one is ever served — an OAuth redirect URI is a
  string comparison.
- Dependencies added: `drizzle-orm`, `drizzle-kit`, `next-auth@5.0.0-beta.32`,
  `postgres`, `server-only`, `dotenv`.

### Fixed

- **`token.sub` is not the provider's `sub`.** @auth/core overwrites `user.id`
  with a fresh `crypto.randomUUID()` on every sign-in, so using it as
  `google_sub` meant the upsert's conflict target never matched and **every
  sign-in inserted a new row** — silently, with memory features reading an empty
  history forever. `readExternalSub()` reads `account.providerAccountId` and
  refuses a uuid-shaped value.
- **An infinite redirect loop between `/` and `/login`**, from putting a pure
  `session` callback only in `auth.ts`: middleware builds its NextAuth instance
  from `authConfig` alone, so the callback was absent on the edge and every
  session looked signed out. Nothing logged. Anything pure now lives in
  `config.ts`, which both import.
- **A silently stripped session.** Middleware re-issues the session cookie from
  whatever the `jwt` callback returns, so a plausible `return { ...token, x }`
  in the edge config dropped `uid` and `onb` on the user's next navigation.
- **A stale `onb` claim could not be fixed by redirecting** — a server
  component cannot write cookies, so `redirect('/')` bounced off middleware's
  identical stale claim and looped. The completion path re-mints first and
  navigates only when the claim is actually true.
- **The Lotus cooldown swallowed user-caused regenerations.** Its ten minutes
  are meant to bound the *speculative* repair the reading path fires; armed by
  the first of six onboarding writes, it silently discarded an answer edit
  minutes later — which made the delete button a lie. Write paths now call
  `generateLotus` directly.
- **`order by created_at desc` is not a total order.** `created_at` is
  transaction-start time, so rows written in one transaction share it exactly;
  `recallableReadings` orders by `created_at desc, id desc`. Two integration
  tests failed on this.
- **Drizzle's `$onUpdate()` does not fire inside `onConflictDoUpdate`**, so
  every upsert sets `updatedAt` by hand. For `daily_summaries` that is exactly
  the column the regeneration throttle compares against.
- **Every abandoned reading was recorded as failing for an unknown reason.**
  `tee.ts`'s `finish()` read its outcome fields *after* an `await`, by which
  time a cancelled controller had made the next `enqueue` throw and the catch
  block had overwritten `errorKind`. Mutable state is snapshotted before the
  await now, and the cancel test asserts `errorKind` and not only `status`.
- **JSX strips the leading whitespace of a text node that spans more than one
  line**, so `www.jmtarot.siteand` and `happen."We` appeared and disappeared
  with code formatting. It shipped three times. A render test does not catch it —
  Vite's JSX transform keeps the space and Next's SWC drops it — so the guard is
  a source-level check in `legal.test.ts` requiring an explicit `{' '}` at every
  wrapping boundary.
- **The first real Vercel deploy failed on nineteen findings from the
  platform's own environment.** Vercel duplicates its system env under a
  `NEXT_PUBLIC_` prefix; the audit was enumerating a `process.env` this
  repository does not own. It now warns on that prefix in one line, and the read
  grep over `src/**` — the half that matters, since Next inlines a value where
  something *reads* it — is untouched and verified by a control.
- **`[object Object]` in all nine system prompts, with a green typecheck.** A
  template literal stringifies a `Localized<>` object happily. Grep for
  `${…​.name|tagline|bio}` after any such change.
- **`Intl.PluralRules` answers whether the noun inflects, and nothing else.**
  CLDR gives `id` only `other`, so a plural family rendered `Ketuk 1 kartu` at
  every count; `draw.hint.tap` is `.single`/`.many` with an explicit
  `cardCount === 1` check, which keeps the spelled-out `satu`.
- **`?lang=` only affects the request that carries it**, so client components
  that fetch resolved from the session claim instead and showed an Indonesian
  frequency verdict under an English hint. And `POST /api/locale` must write
  `users.locale` *before* `refreshSession()`, never in `after()` — the jwt
  update branch re-reads the row, so a deferred write makes the switch silently
  revert.
- **A bare `lagi` in the callback detector fires on most sentences of casual
  Indonesian** — it is also the progressive aspect marker — and reported a ~90%
  callback rate that was entirely noise, on the ratio deciding whether chaining
  gets cut. Every Indonesian pattern is now multi-word or hyphenated. Same class
  as the Malay grep missing `tempoh`, which is also fixed (eleven words now, not
  four).
- **The blocklist runs both locales' patterns under both locales.** `locale` is
  the UI preference, not a declaration of what language the querent types.
  Caught on the live route: `gimana cara bunuh diri` under `en` fell through
  Tier A and cost a classifier call instead of a free deny.
- **`server-only` no longer breaks Vitest**: `vitest.config.ts` aliases the
  package to its own `empty.js`, the file the bundler picks under the
  `react-server` condition. Nothing is weakened — the throw's value is the build
  error, which is untouched.

### Removed

- **The two hardcoded users and the signed-cookie login.**
  `src/lib/auth/session.ts` and its test, `/api/auth/login` and
  `/api/auth/logout` are deleted: with Auth.js owning sessions nothing called
  the jose helpers, and a function named `verifySession` in this codebase would
  send someone to the wrong file at the worst moment. `AUTH_USERS` survives as
  fuel for a dev-only Credentials provider and nothing else.
- `src/lib/prompt/side.ts`, folded into the per-locale prompt fork by W6.
- Both W3/W5 staging-post copy modules, migrated into the i18n catalogs.
- `docs/seed-meanings.en.json`.
- **The `backup/main-ios-2026-07-25` branch**, as redundant — the rewrite was a
  linear continuation, so `feat/ios` is an ancestor of `main` and the whole iOS
  history is reachable from `main` regardless. v0.1.0's entry above names that
  branch as a preservation point; it is no longer one. Recreate the label with
  `git branch backup/main-ios-2026-07-25 cfa9f29` if you want it back.

### Security

- **Field encryption at rest** for onboarding answers and birth date.
  Losing `FIELD_ENCRYPTION_KEY` does not break the app — encrypted answers
  decrypt to `null` and read as "skipped" — but the data is gone for good, and
  there is deliberately no re-encryption path.
- **No free text in `events.props`, ever.** `events` rows survive account
  erasure with `user_id` nulled, and that is only honest because
  `sanitizeProps()` provably strips everything that could identify anybody: it
  drops non-scalars, truncates strings to 120 characters, caps at 24 keys, and
  rejects `__proto__`, `constructor` and `prototype` by name.
- **Never log a driver error from an analytics or moderation path.** A postgres
  error quotes the failing statement *and its bound parameters*, and the
  querent's typed question is one of them — so `console.error('…', err)` would
  put it in the platform log. Production logs ids, attempt and SQLSTATE;
  development prints everything, because there is nobody to leak it to. Asserted
  by canary tests in `log.test.ts` and `leak.test.ts`.
- **The querent's question stays in the user turn only**, inside delimiters the
  sanitizer strips, never in the system prompt. Verified against a real
  injection attempt.
- **A build-time tripwire** (`scripts/audit-secrets.ts`) that fails the build if
  a prompt layer or a secret reaches the client bundle, with source-side fences
  (`clientBoundary.test.ts`) covering what a bundle scan cannot see because it
  was tree-shaken.
- `CRON_SECRET` guards the daily sweep; `TEST_DATABASE_URL` is a separate
  variable and both the harness and the global setup refuse any value whose
  database name does not end in `_test`, because the integration suite
  `TRUNCATE`s.
- `client_secret*.json` and `public/cards/_*.html` are gitignored — the OAuth
  client download lands in whatever directory you were in, and anything under
  `public/` is served to the internet.

### Known gaps at this tag

- **`/account` does not exist.** `/privacy` §8 describes a deletion the user
  cannot yet perform. Everything underneath it exists — `users.deleted_at`, the
  cascade, the lazy purge, `redactForUser()`, the daily sweep — but the button
  does not. Whoever builds it must call `redactForUser()` in the same
  transaction that sets `deleted_at`.
- **The OAuth consent screen is still in Testing mode**, so only manually-added
  test accounts can sign in. Google's remaining branding requirement is an app
  homepage that is not a login page.
- **Signing in with Google from a home-screen installed instance, in standalone
  mode, is unverified** and is the largest untested risk in the project. It
  cannot be tested in WSL — only on a real iPhone against a Vercel preview.
  Touch behaviour, safe-area insets and Add to Home Screen are likewise
  unverified on hardware.
- **T&C clauses 10, 11 and 12 need a lawyer**, and the Jakarta district in
  `src/app/terms/operator.ts` needs confirming against the operator's deed.
- **Margaret's English `spread3` length is not converged** (157–243 words across
  runs), and her 312-word Indonesian control run is a pre-existing regression
  against the 128–169 band v0.1.0 recorded.
- **A hard spend cap at z.ai is a required deployment step** and nothing in this
  repo can enforce it.

## [v0.1.0] - 2026-07-25

First tagged release. The tree began as an Expo/React Native iOS app and was
rewritten mid-history into a mobile-first website; this entry describes the web
app as it now stands. The iOS tree is preserved on `feat/ios` and
`backup/main-ios-2026-07-25`.

### Added

- **Next.js app** (App Router, TypeScript, `src/`) replacing the Expo scaffold:
  reader picker (`/`), service picker (`/[reader]`) and the draw screen
  (`/[reader]/[service]`).
- **Authentication.** Two hardcoded users behind a signed-cookie login —
  `src/lib/auth/session.ts` (HMAC session tokens), `src/lib/auth/users.ts`
  (bcrypt password checking), `/api/auth/login`, `/api/auth/logout`, and a
  login page.
- **Route gate** at `src/middleware.ts`, redirecting unauthenticated requests
  to `/login`.
- **The draw interaction.** A 22-card fan with settled geometry (88x132, 64°
  span, 272px pivot, verified against `getBoundingClientRect`), pick, return,
  a one-rotation 3D card flip using `preserve-3d`, filled slots, and a
  reduced-motion grid fallback (`FanGrid`, `StillMode`).
- **Card detail overlay** (`CardDetail`). Tapping a picked card opens its full
  art and its Indonesian meaning; returning it to the deck moved into a button
  inside the overlay, offered only while the reading is idle.
- **Card data** for the 22 Major Arcana in Fool's Journey order, with
  reversals, `stage`/`polarity`/`element` grounding, and a distinct pair of
  Indonesian one-line meanings per card (upright and reversed) read through
  `cardMeaning()`.
- **Derived yes/no verdict.** `effectiveYesNo()` decides it in code, including
  the reversal flip, and hands the model the word — never the reverse.
- **LLM provider interface** (`src/lib/llm/`) — one adapter serving both
  `anthropic` and `zai`, streaming, proven against the live endpoint.
- **Three-layer prompt builder** (`src/lib/prompt/`): `base.ts` (format,
  language, safety) + `readers.ts` (persona, one worked example paragraph each)
  + `services.ts` (the task), assembled by `build.ts`. The querent's question
  goes in the user turn only, inside `<pertanyaan>` delimiters, after
  sanitization.
- **Streaming reading endpoint** at `/api/reading`, with a best-effort
  in-process rate limiter.
- **Web app manifest** (`src/app/manifest.ts`) and a generated home-screen
  icon, making the site installable to the iPhone home screen.
- **Design tokens** as the single source of truth — `src/theme/tokens.ts`
  mirrored into `src/theme/tokens.css` — plus self-hosted fonts via
  `next/font/google` and the starfield backdrop.
- **Vitest suite** covering deck maths, `togglePick`, prompt assembly, question
  sanitization, session tokens, password checking and the rate limiter.
- **Verification tooling in place of Playwright** (Chromium cannot launch in
  this WSL image): `tools/shot.sh` drives Windows Chrome headless against the
  WSL dev server.
- **Asset pipeline.** Idempotent `tools/normalize_cards.py` (source PNGs →
  800x1200 and 240x360 WebP, padding rather than cropping),
  `tools/generate_cards.py` (rebuilds `src/data/cards.json`) and
  `tools/make_icons.py`. `public/cards/` is committed so the deploy needs no
  Python.
- **Documentation.** `docs/plans/2026-07-25-jmtarot-web-rewrite.md` (every
  decision and why), `docs/DEPLOY-VERCEL.md` (a from-scratch Vercel deploy),
  `docs/art-inconsistency.md` (the measured art inconsistency), plus a
  rewritten `CLAUDE.md` and `README.md`.
- `npm run smoke` — one live LLM call to check key/baseURL/model — and
  `npm run smoke -- --all`, which generates all nine reader x service readings
  and greps them for eleven Malay-only words.

### Changed

- **Reading length is controlled per paragraph, not per reading.** A
  whole-reading word budget did not hold: Margaret ran 238–298 words against a
  stated 140–180 while Adrian obeyed at 128. A ceiling the model can count as
  it writes — 2–3 sentences and at most 40 words per paragraph — landed all
  three readers at 128–169 words, and `MAX_TOKENS.spread3` came down from 1100
  to 650 as a runaway guard rather than a length control.
- **Card names stay English** because the artwork has its title rendered into
  the image. This is an explicit prompt rule; the model otherwise invents names
  like "Pulan" for The Moon.
- All reader-facing copy is Indonesian, not Malay: `karier`, `arah hidup`,
  `ngobrol`, `kamu`.
- The no-therapy/no-diagnosis constraint moved from authoring time to
  generation time, enforced in `src/lib/prompt/base.ts`.
- `next.config.ts` serves `/cards/*` with a one-year `immutable` cache.

### Fixed

- **The draw screen read the wrong cards.** Caught by driving the real page in
  a same-origin iframe and diffing the outgoing request body against the
  rendered `alt` text — the page looked correct and the request was wrong.
- **Hydration mismatch from shuffling in a `useState` initialiser.**
  `shuffleDeck()` is impure, so it produced one deck on the server and another
  on the client; the querent saw one spread and was read a different one. The
  deck now starts in fixed order and shuffles in an effect.
- **The fan was dead in development.** A side effect inside a `setState`
  updater fired twice under StrictMode and cancelled itself out. The drag is
  read from a ref instead.
- **`container-type` does not make an element its own container.** `CardBack`
  is split into `.back` (declares the container) and `.plate` (a descendant, so
  its `cqw` resolves as intended).
- The production build was unblocked by pinning TypeScript to 5.x — 7.x ships
  no full compiler JS API and dies in `next build` after a green `typecheck`.
- Control characters in the committed design export are written as escapes.

### Removed

- The Expo/React Native toolchain, EAS, TestFlight and the App Store path,
  along with `docs/TESTING-MACOS.md`. All still present on `feat/ios`.
- Two superseded design exports; the Clickable export is the single visual
  reference. Both remain in history at `d7fdd89`.

[v0.2.0]: https://github.com/miftahulmahfuzh/JMTarot/releases/tag/v0.2.0
[v0.1.0]: https://github.com/miftahulmahfuzh/JMTarot/releases/tag/v0.1.0
