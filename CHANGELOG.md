# Changelog

All notable changes to JMTarot are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.3.0] - 2026-07-28

Nine workstreams (V1–V9) planned in `PUBLIC_RELEASE_ROADMAP_v0.3.0.md`,
reconciled in `docs/plans/2026-07-27-RECONCILIATION-v0.3.0.md`, and merged in
order — plus a run of phone-found fixes on 2026-07-28 that reversed several of
this repository's own written arguments.

**The thesis: the app stops doing arithmetic out loud.** v0.2.0's memory feature
said *"This week The Empress is shown three times whilst The Chariot is shown two
times."* Nobody opens a tarot app to be told a tally. A count is an input, never
an output — so the counts are **deleted from both generated prompts rather than
forbidden in them**, and the model is handed the Shadow Arcana instead. A model
cannot recite a count it was never given.

**The second thesis: the app becomes something a person can hand to somebody
else.** `/s/<slug>` is the first URL in this project's history that a stranger
with no account and no session can open, and it arrives with a distributed rate
limiter and a global model-call ceiling underneath it, because the day a link is
posted anywhere public is the day a per-instance limiter stops meaning anything.

1632 unit tests across 88 files; 137 integration tests. Seven migrations on top
of the baseline; three new tables (`translations`, `share_links`, `personas`).

### Added

- **The correspondence engine (V1).** `src/lib/numerology/**` — digit reduction
  with a master-number halt, the Pythagorean gematria table behind a
  diacritic-folding normalizer, expression / soul-urge / personality / nickname
  pulse with the Y-vowel rule, a string-only birth-date parser (never a `Date`,
  for `todayKey()`'s reason), the sun-sign table, the life path, number → Major
  Arcana, and **the Shadow Arcana** — `arcanaFor(a + b)`, the traditional
  quintessence. Deterministic, pure, and fenced: a purity test asserts the whole
  directory takes no handle, reads no clock and imports nothing impure.
- **Locale-tagged generation and on-demand translation (V2).** Every piece of
  generated prose records the language it came out in, and a language switch
  **translates** what already exists instead of showing Indonesian text inside an
  English app. A `translations` table, a `TRANSLATABLE` registry, and a contract
  that is a *re-issue of the target locale's rules* rather than a translator's
  brief. `<terjemahan>` is a fifth fence — what it guards is model output
  generated from user text, handed to a second model as material, going straight
  to a screen. Verification happens **after** the stream and never poisons the
  cache: a dirty generation is seen once and a `defer()`ed repair pass lands the
  clean row. `POST /api/translate` streams iff the registry says so, and `204` is
  a real answer. `users.locale_source` tells a negotiated locale apart from a
  default, read through `effectiveLocaleSource()` because NULL means `'chosen'`.
- **Mystical memory verdicts (V3).** `src/lib/memory/shadow.ts` and the rewritten
  frequency and day-summary prompts, with all six worked examples replaced. The
  model receives two card names, the Shadow Arcana, one written pulse line and one
  dominance word — never `m`, never `n`. `dominanceOf` is a **ratio**, not a
  difference, so `10:8` is narrow where a difference would call it wider than
  `4:2`. `tally.ts` is a two-tier detector with a false-positive corpus
  (`sekali` also means "very"; `once` also means "as soon as") that runs in the
  smoke script and **never at request time** — a heuristic may fail a build, it
  may not fail a person. `MEMORY_PROMPT_VERSION` goes to `memory-v2`.
- **The account shell (V4).** A circular account button top right, a bottom
  sheet holding User Details, Language and History, and **the first sign-out
  control this app has ever had** — `auth.signed_out` had been in the closed
  taxonomy since W4 with nothing firing it. The language toggle leaves the
  `/login` footer and moves into the menu (R1). Mounted per owning page, never in
  a layout, with a denylist keeping it off the draw screen.
- **The reader swipe deck (V5).** On `/[reader]` the bio and today's summary are
  two panels of one horizontal scroll-snap track; the summary **slides itself in
  once**, on the first byte, and the querent can swipe back. `SwipeDeck` is
  generic over N panels and knows nothing about readers or fetching;
  `src/lib/swipeDeck.ts` holds `panelIndexAt` and `shouldAutoSlide` — five ways
  to say no, one to say yes — as the pure part `npm test` can reach.
- **History (V6).** `/history` lists the querent's own readings filtered by day
  and defaulting to today; `/history/[id]` reconstructs the draw exactly as it
  was, read-only. `ReadingView` is the one renderer three surfaces mount, and it
  imports nothing from `@/lib/db/**` — not even as `import type`. Its rule 4 is
  the invariant: it **never** renders a body whose locale differs from the
  viewer's without a translation, so a caller cannot ship that bug by forgetting
  a prop. `/api/history` and `/api/history/days`, three new events, and a
  `readings.shared_at` column added here and written by V7.
- **Sharing (V7).** `/s/<12 chars>` — Crockford base32 over `byte & 0x1f`, a
  view-only page that looks exactly like the reading did, a *Try It Yourself*
  button, an OG preview image, and a share sheet that previews the real page.
  `share_links` with per-artifact revocation. The public route **reads and never
  generates**: it is the one route with no session and no per-user budget, so a
  model call there would be the ceiling with no gate on it.
- **`/account` and the Inner Heavenly Lotus persona (V8).** Four blocks — the
  three editable facts, the card the universe keeps handing them, the reader
  whose path opened, and a generated four-sentence reading *of the person* in
  house voice. **The deletion button `/privacy` §8 described for a whole
  release**, and **per-answer clearing**, which `/privacy` promises twice in both
  locales and nobody could perform. `<sosok>` is the sixth fence, and it is
  defence in depth: the persona prompt receives engine facts, closed values and
  the Lotus summary, and **never a raw onboarding answer** — enforced by
  construction with a canary test, not by prompting. `GET /api/persona` buffers
  and must not stream, because a safety check before the first byte means the
  body is buffered anyway.
- **Distributed rate limiting and a global model-call ceiling (V9).**
  `src/lib/ratelimit/**` on Upstash Redis, choosing a backend per key, with a
  shared `clientIp()` and IPv6 normalised to /64. `LLM_WINDOW_CALL_CEILING`
  meters **model calls per rolling five hours** — a provider quota is not a
  calendar day, and it is the one counter in this app that is not the querent's
  — in two tiers, with deferred work shed first and the reading path reserving
  against the window. Redis failures fall back to memory, never to unlimited, and
  say so once a minute through `ratelimit.backend_degraded`. Fleet-wide numbers:
  the old `400` meant 400 *per instance*.
- **A second LLM provider, built and measured but not switched on.**
  `src/lib/llm/openai.ts`, one interface, five models measured against z.ai.
  `gemini` is a named provider rather than `openai` plus a base URL, because it
  is the failover path and forgetting the base URL would send a Google key to
  OpenAI. The adapter **refuses to start** on a `gpt-5`/`gpt-6`/`o`-series model
  with `OPENAI_REASONING_EFFORT` unset. `docs/provider-comparison.md` has the
  measurements — including the two of its own that were wrong.
- **A regenerated deck: 22 cards, one treatment, full bleed, no text.** The card
  name is drawn by the app rather than baked into the art. Plus
  `.claude/skills/generate-tarot-card/` with its locked style contract,
  `tools/gen_card_art.py` and `tools/check_card_art.py`.
- **A real Chrome in WSL, driven over CDP** — `tools/e2e/{setup,run}.sh` and
  `chrome.mjs`, no Playwright, no Puppeteer at runtime, no new dependency. The
  three-workstream-old claim that Chromium cannot launch here was a correct
  diagnosis with a wrong conclusion: `ldd` names exactly one missing library and
  a `.deb` unpacks into a home directory with no privileges. It holds a
  persistent Google session and **never holds a credential** — no verb accepts a
  password and `whoami` prints the cookie's length, never its value. Loop 5 found
  the production sign-in outage of 2026-07-28.
- **`scripts/db-migrate-deploy.ts`, run first inside `npm run build`.** It needs
  `MIGRATE_DATABASE_URL` (Neon's *direct* string), refuses a `-pooler` host,
  skips off Vercel, and **fails the build rather than skipping** when it cannot
  run.
- **New environment variables:** `TRANSLATION_MODEL`, `PERSONA_MODEL`,
  `PERSONA_STUB`, `PERSONA_MIN_AGE_SECONDS`, `SHARING_ENABLED`, `SHARE_BASE_URL`,
  `UPSTASH_REDIS_REST_URL` / `_TOKEN` (and their `TEST_` counterparts),
  `RATELIMIT_BACKEND` / `_TIMEOUT_MS` / `_GLOBAL_HOURLY` / `_EVENTS_BACKEND` /
  `_SESSION_BACKEND`, `LLM_WINDOW_CALL_CEILING` / `_SOFT`, `OPENAI_BASE_URL`,
  `OPENAI_REASONING_EFFORT`.
- **New commands:** `npm run smoke -- --translate` (six real translations, both
  directions) and `-- --persona` (one real persona per locale),
  `npm run db:migrate:deploy`, and a `srh:wait` probe folded into `db:up`.
- **Documentation:** the v0.3.0 roadmap and reconciliation, nine workstream
  plans, two share-design documents from 2026-07-28,
  `docs/provider-comparison.md`, and `docs/workstream-notes.md`.

### Changed

- **`CLAUDE.md` was split at 157k into a 95k core plus `docs/workstream-notes.md`.**
  The core keeps the rules and the invariants; the notes keep the evidence — the
  traps that were paid for, how each bug was found, the live measurements and the
  internals of the verification harnesses. New traps go in the notes, so the file
  loaded every session stays worth loading.
- **The closed event taxonomy grows from 44 names to 61**, and the message
  catalogs roughly double, 127 keys to 242. `id.ts` still owns the key set and a
  missing English string is still a red typecheck.
- **`MARGARET_MULTIPLIER = 1.3` replaces the hand-set `spread3: 55`** and reaches
  every reader-voiced ceiling, because her length is a fact about the reader and
  not about one service (VD19). Ceilings only — a floor scaled by verbosity would
  demand length rather than permit it.
- **Gold now means exactly one thing on the draw screen.** `cardFaceBorder`
  (full-strength `#c9a227`) becomes `cardEdge`, a pewter hairline keyed to the
  artwork: the regenerated deck paints its own frame, so a gold ring on top was a
  second border competing with the first, and on the darkest cards it was the
  brightest thing in the cell. `--gold-hairline` stays on the *empty* slot, so
  empty and filled stopped sharing a signal. A `danger` token is added — a
  desaturated brick, used as a border and a label and never as a fill — with
  `/account`'s deletion sheet as its only consumer.
- **The three readers carry a fixed `gender`** in `readers.json` — Thessaly
  female, Margaret female, Adrian male — meeting `reader.pronoun.{female,male}`
  in exactly one place. Indonesian renders `dia` for both, and a test asserts
  that is deliberate by cross-checking each `bio.en`.
- **There are six verification loops now, not four**, and the one that used to be
  described as giving a true 390px viewport does not: measured 2026-07-28,
  `innerWidth` and `outerWidth` are both 500 in the WSL Chrome profile. Loop 5
  answers "does the UI agree with what it sends"; **loop 4** — fixed-width
  containers and `getBoundingClientRect` — is what answers "does it fit a phone".
- **The question is on the public share page by default**, reversing VD9: a
  stranger who sees three cards and four paragraphs with no question cannot tell
  what any of it is about. The sheet's switch is gone and the preview is now the
  only consent mechanism for it. **The OG image still carries neither the
  question nor the prose** (VD18), and that matters *more*, not less — a page is
  opened by somebody who chose to, while a preview image is cached by every
  messenger that merely sees the link.
- **A share link carries the language it was shared in**, and a reading holds one
  address **per language** — `unique nulls not distinct (user_id, entity,
  entity_id, locale)`. Re-sharing rotates the slug *within one language*; a
  different language takes the insert branch and the first address stays alive.
  Revoke is per-artifact and kills every language: two kinds of "stop sharing" is
  a UI in which somebody taps the wrong one and believes a reading is private
  when it is not.
- **`/s/<slug>` is monolingual, in the reading's language** — chrome included —
  reversing "chrome follows the viewer", a rule that stood for two workstreams.
  A page in two languages reads as half-translated, not as considerate. The
  mechanism is a nested `LocaleProvider`, never a `locale` prop, so `ReadingView`,
  `TryItYourself` and `Eyebrow` are untouched. The cost was accepted, not missed:
  an Indonesian visitor opening an English link now has nothing on the page they
  can read.
- **`RATELIMIT_SESSION_BACKEND` defaults to memory, on purpose** — for latency,
  not cost. `refreshSession()` spends one `hit()` on the request path of a
  language switch, and with no Upstash Singapore region that is a `sin1`→Tokyo
  hop between a database write and a database read.
- **`POST /api/locale` declares a runtime and a `maxDuration`**, and
  `ShareFooter` bounds all three of its requests at 8s against a 30s lambda. A
  bigger server budget without a client bound only makes a hang longer.
- **`package.json` version → `0.3.0`; `API_VERSION` → `0.3.0`.**
- Dependencies added: `@upstash/ratelimit`, `@upstash/redis`.

### Fixed

- **A committed migration that nobody applied took production down, and the app
  looked perfectly healthy while it did.** `0001` was applied locally and never to
  Neon, so `upsertUserOnSignIn` threw on a missing `locale_source` column,
  `auth.ts` refused the session, and the gate bounced every querent to `/login` —
  while **Google's consent screen succeeded every time**. The same column killed
  the language switch: one unapplied migration presenting as two unrelated-looking
  bugs, neither naming a migration. `npm run build` now applies migrations first
  and fails rather than skipping.
- **`MEMORY_PROMPT_VERSION` invalidated nothing.** `fresh` short-circuited the
  `||` before the version was ever compared, so any user whose window had not
  moved was served the cached `memory-v1` row forever — fatal for a release whose
  entire deliverable is replacing that text. Fixed in its own one-line commit,
  with the test written first and watched failing (§0.1).
- **Four of the six day-summary worked examples recited a tally** — *"Tiga kali
  hari ini…"*, *"turned up twice"* — teaching the model the exact behaviour this
  release exists to remove, in the file whose own header says the example does
  more work than the description (§0.2). And `scripts/smoke-llm.ts` hardcoded the
  word ceilings as `25` and `45` rather than importing them, in the one file whose
  job is catching drift (§0.3).
- **A `ReadableStream`'s `pull()` is not in a request scope, and every streamed
  translation lost its analytics event and its repair pass** — silently, for as
  long as V2 had shipped, which is why the "fix the prompt if `invalid` exceeds
  ~2%" rule could not be followed: the measurement was not being written.
  `bindAnalyticsScope()` is called synchronously inside `translateStream`, the one
  line guaranteed still to be in the handler. The unit mock now models the scope
  with a depth counter — a mock that only records calls cannot see this class of
  bug, and the suite was green throughout.
- **Every persona translation failed, on every page view.**
  `TRANSLATABLE['persona.body'].budget` was `'summary'` (50 words) where a persona
  is 95, and `ceilingFor` feeds both the prompt and `verifyTranslation` — so the
  model was told to squeeze 95 words into 50 and then judged against 50. Measured
  live: a correct 88-word translation rejected, never persisted, a fresh model
  call every time. Invisible for two releases because nothing translated a
  persona. The contract test now asserts the resolved number, not the tag's
  spelling.
- **The language switch could not fail safely, and the querent's own description
  was the diagnosis** — *"it only takes effect after we change to another page"*.
  A timeout is the one outcome meaning **unknown**, so it is now the only one
  retried, once, with the marker kept, while `!response.ok` and offline still
  revert because those are answers. Reported dead on an iPhone while fine on a
  desktop: 1348ms warm from WSL told us nothing, because Docker Postgres never
  sleeps and a Neon compute does.
- **Both Upstash SDK defaults are wrong for this app, and both are wrong by being
  absent.** `@upstash/ratelimit`'s `timeout` defaults to 5s and **fails open to
  unlimited**; `@upstash/redis` retries five times with exponential backoff — about
  4.3s — in a layer whose own contract says it does not retry. Measured by
  pointing the URL at a closed port: with the defaults an unreachable Upstash
  burned the whole `RATELIMIT_TIMEOUT_MS` on every request.
- **`resolveBaseUrl` consulted `OPENAI_BASE_URL` before the provider**, so
  `npm run smoke` and `npm run probe:moderation` printed
  `baseURL=api.anthropic.com` while talking somewhere else entirely — through a
  whole Gemini evaluation.
- **Three defects on `/account` that a green build did not notice**, and five more
  found by loading pages on a phone rather than reading them — among them
  `WHAT YOU ARE CALLED` wrapping over two uppercase rows beside a one-word value,
  a 2:1 landscape reader portrait cropped to a 60px stamp, a card with no name
  under it, Thessaly referring to herself as *they*, and a page with no way out.
  Four of the five reverse an argument the code itself had written down.
- **`CREATE A ENGLISH LINK`.** Found by driving the real page and invisible to the
  whole suite, because the string and the parameter are each correct on their own.
  Any phrasing with an indefinite article beside an interpolated language name is
  a coin flip.
- **The browser tab was the last string resolved from `accept-language`** on a
  Bahasa-pinned share link, so everything followed the pin except `<title>` — and
  `og:title` shares it, so chat previews had it too. Fixed by moving the rate-limit
  gate *into* the cached resolve (`gateAndResolve`), which both `generateMetadata`
  and the page call: the limiter-before-database ordering is the whole defence on
  that route, and it was verified by counting executions rather than trusted from
  the docs.
- **The share sheet had no read path at all**, which is why the per-language bug
  arrived silently: `liveShareLinkFor` had zero production callers, so a reading
  shared yesterday looked unshared. `GET /api/share?entity=&entity_id=` is fetched
  on sheet open, and a failed read falls through to the create flow.
- **The 429's `retry-after` from the ceiling is not the window length** — measured
  at 291 seconds on a tripped five-hour ceiling, because a sliding window reports
  `reset` as the start of the next sub-window. Both backends are honest and neither
  is ever zero, which is the property that matters. Documented rather than
  "fixed" to a hardcoded value.
- **The Empress had no right arm**, and the gold ring made the chrome the brightest
  thing on the darkest cards. Both went with the deck regeneration.
- The event taxonomy count in `CLAUDE.md` was 43 where the file held 44; the e2e
  harness's `tap` matched the wrong control and reported success; and `.gitignore`
  ignored a `node_modules` directory but not a `node_modules` symlink.

### Removed

- **`src/lib/ratelimit.ts` and its test**, replaced by `src/lib/ratelimit/**`.
- **The other-language notice on `/s/<slug>`**, which this repository said in
  capitals must not be removed. Design A changed what the page shows underneath a
  sentence describing the old mechanism: the page no longer renders "whatever
  language the reading was generated in", so the notice described a mechanism that
  had stopped running. **Three tests were inverted rather than deleted**, because
  the failure mode of removing chrome is somebody adding it back in six months.
  `account.persona.otherLanguage` is a different key on a different page and still
  renders — as the *failure* state, gated on `prose.kind === 'as-written'`.
- **The `include_question` switch on the share sheet** (migration `0004`).
- **The 22 original source PNGs under `assets/major_arcanas/`**, replaced by the
  regenerated deck. Still in history.
- **The z.ai spend cap, as an idea.** `LLM_API_KEY` is a fixed annual subscription
  sold for coding, not a wallet; three documents naming a spend cap as the primary
  control were corrected. The replacement is `LLM_WINDOW_CALL_CEILING` and query 9.
  The residual risk is worse than the cap was: the same FAQ restricts the plan to
  officially supported tools, and the consequence of enforcement is key revocation.

### Security

- **The rate limiter on the app's only public write endpoint was bypassable with a
  request header.** `/api/events` read the **leftmost** `x-forwarded-for` entry —
  the one the caller supplies — so a different value per request was a different
  limiter key per request. It also preferred the spoofable header over
  `x-real-ip`, which is the wrong way round. The function's comment argued the
  endpoint was not worth abusing; that was a defensible v0.2.0 position and this
  release retires it, because V7 makes the app publicly linkable and fires
  `share.viewed` through that endpoint anonymously (§0.4).
- **The sign-in failure path logged the querent's email and real name**, and the
  rule forbidding it had already been written twice. A postgres error quotes its
  bound parameters and `upsertUserOnSignIn` binds nine, four of which identify a
  person. **The leak scaled with the outage** — the failure that exposed it was
  schema drift, the case where *every* sign-in fails, so a rule harmless for weeks
  started writing one row of PII per attempt at the exact moment nobody was
  watching. `logSignInFailure` logs SQLSTATE and the error's class in production.
  The generalisation: every `catch` that touches the database is a potential PII
  sink, and the audit is "which of my bound parameters came from a person".
- **`currentUser()` is never called anywhere under `/s/[slug]`**, and `curl` cannot
  see the failure: a client component reaching for a session context renders
  correct HTML on the server and throws during hydration, so `curl` reports 200
  with the reading in the body and the page is dead in a browser. A contract test
  fences `currentUser`, `requireUser`, `ViewerProvider`, `useViewer`, `cookies()`
  and `@/lib/auth/*` across the whole subtree.
- **Account deletion runs `redactForUser()` and `revokeAllForUser()` inside the
  same transaction that sets `deleted_at`, in that order.**
  `moderation_flags.user_id` is `on delete set null` and `share_links.user_id`
  cascades only at the hard delete thirty days later, so both rows outlive the soft
  delete — a self-harm disclosure and a public URL. Redaction runs *before* the
  flag, so a failure aborts the whole thing rather than marking an account deleted
  with its text intact. The route also clears the session cookie itself, by name,
  because there is no server-side revocation on the JWT path.
- **The persona prompt never receives a raw onboarding answer**, enforced by
  construction: it gets machine-built engine facts, closed-set values, and a Lotus
  summary that `lotusSafetyCheck` already passed.
- **Re-sharing rotates the slug rather than un-revoking the row.** The obvious
  one-liner — `revoked_at = null` — resurrects a capability the querent
  deliberately killed: the old URL, in the group chat they revoked it because of,
  starts working again for whoever still has it. The regression test is the one
  asserting the *old* slug stays dead.
- **`x-frame-options: SAMEORIGIN` and `frame-ancestors 'self'` survive**, and
  `/s/:path*`'s header block sits **after** the catch-all in `next.config.ts` on
  purpose — Next applies every matching entry and a later one with the same key
  wins, which is what makes `referrer-policy: no-referrer` override the global
  value on `/s/` and only there. Reversing the two entries is a silent no-op that
  reads as correct; `headers.test.ts` asserts the ordering.

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

[v0.3.0]: https://github.com/miftahulmahfuzh/JMTarot/releases/tag/v0.3.0
[v0.2.0]: https://github.com/miftahulmahfuzh/JMTarot/releases/tag/v0.2.0
[v0.1.0]: https://github.com/miftahulmahfuzh/JMTarot/releases/tag/v0.1.0
