# Workstream notes

The detailed record for each workstream: the traps that were paid for, how each bug
was actually found, the live measurements, and the internals of the verification
harnesses.

**`CLAUDE.md` is authoritative for the rules.** It carries every invariant a future
session could break, in a short section per workstream, and points here. This file
carries the evidence behind those rules — read the relevant section before changing
anything in the files it names, and add to it rather than to `CLAUDE.md` when you pay
for a new trap.

Order is chronological by workstream: W3, W4, W5, W6, W7, V2, V3, V5, V6, V7, V8.

## Onboarding and the Lotus (W3)

Nine screens, asked exactly once: the invitation, all three facts together, the six personal
questions, and a closing card. The word "onboarding" appears nowhere the user can see it — the
questions are meant to feel like being read, not like being onboarded.

```
src/data/onboarding.ts          the six keys, the closed sets, and the pure functions. NO
                                IMPORTS OUTSIDE @/data, so W2's gate can reach
                                `isOnboarded` on the edge.
src/app/onboarding/             the stepper. copy.ts is a STAGING POST for W6's catalog --
                                same key names, lookup called `c()` and not `t()` so the
                                migration shows in a diff.
src/app/api/onboarding/         facts / answer / complete / answer/[key] DELETE
src/lib/prompt/lotus.ts         PURE: contract, parser, safety checks, fallback
src/lib/prompt/lotus.generate.ts  everything impure AND stateful: the model call, the
                                write, the cached read, the cooldown
```

**`profiles.completed_at` is the only completion marker.** Row presence is not completion — the
facts row exists from step 1 of 9, and a half-written answer set must never count as onboarded
and must never be distilled. Gating is the `onb` claim in W2's JWT so nothing reads the database
per request; the `/onboarding` page makes the one authoritative read the roadmap's first
non-negotiable allows, and repairs a stale flag itself.

**The resume point is derived, never stored** — the first key with NO ROW, not the key after the
last one. A user who goes back to answer something they skipped leaves a gap, and resuming past
it would skip it forever.

### The traps W3 paid for

- **A stale `onb` flag cannot be fixed by redirecting.** A server component cannot write cookies,
  so `redirect('/')` from `/onboarding` bounces off middleware's identical stale claim and loops.
  `actions.ts` re-mints first and only navigates when `onb` is actually true — the jwt update
  branch is rate-limited and returns the STALE token when throttled, so navigating on that is the
  loop again.
- **`refreshSession()` does work in a route handler** (measured, not assumed). The completion
  response carries the `Set-Cookie`; with the old cookie `/` still 307s to `/onboarding`. Hence
  the close screen is a button doing `location.assign`, not a link.
- **The completion route reads the answer set back from the database** before setting
  `completed_at`. The client is trusted to say what it answered, never that it finished —
  otherwise a bare `POST` with `{}` marks a new user onboarded with nothing stored, and `onb`
  gates `/api/reading` too.
- **THE COOLDOWN MUST NOT GUARD A USER-CAUSED REGENERATION.** `scheduleLotusRefresh`'s ten
  minutes bound the SPECULATIVE repair the reading path fires. The answer route used it once and
  the first of six onboarding writes armed it, so an answer edit minutes later was silently
  swallowed — `input_hash` byte-identical, `updated_at` frozen, which is the delete button being a
  lie. Write paths call `generateLotus` directly; it is idempotent.
- **Staleness is split by where each trigger is cheap.** `source_version` is one integer in the
  row and is checked on read; `input_hash` needs the ANSWERS, so checking it per reading would
  mean decrypting six rows on the request path. It is checked inside `generateLotus`, and the
  write paths trigger it.
- **The cache cannot live in `queries/`.** Rule 1 of that directory needs the handle first and a
  cache invalidator keyed by user id cannot oblige; `contract.test.ts` fails on it. All the
  stateful machinery is in `lotus.generate.ts`.
- **A skip is `answer_text IS NULL`, never an encrypted empty string**, which would be
  indistinguishable from a real answer in a dump. The audit query is in `schema.ts` and must
  return 0.

### Verifying it

`public/cards/_onb.html` walks all nine screens with real `PointerEvent`s, patches the iframe's
`fetch`, and diffs every outgoing body against the screen — pointed at the bug class it was built
for (a skip that posts `text: ""`). `public/cards/_onbshot.html` puts `/onboarding` in a **390px
iframe** so a gated page can be screenshotted at a real phone width; `shot.sh` alone cannot,
because it cannot plant a cookie and because Windows clamps Chrome to ~500px. Both are gitignored
under `public/cards/_*.html`.

**Wait for HYDRATION, not for the iframe's `load` event.** `load` fires when the SSR HTML has
parsed, and React has not attached its delegated listener yet — a real click lands on a real
button and nothing happens, which reads as a dead stepper. Poll for React's `__reactFiber$` key
on a node.

`npm run smoke -- --lotus` runs one real distillation end to end and prints the prompt, the raw
output, the parsed result and the safety verdict. **Read it.** `npm run smoke -- --all --lotus`
injects a canned block into the nine readings and draws FIXED hands, so it can be diffed against
`npm run smoke -- --all --fixed` — two runs that drew different cards are not comparable.

**If the Lotus ever flattens the three readers, fix the persona paragraphs or the base contract's
`<penanya>` rule, never the code.** Measured when it landed: mean pairwise reader overlap on
`spread3` went 0.056 → 0.074, and no reading announced that it knew anything.

Not yet verified on hardware: touch behaviour on a real iPhone, safe-area insets, and Add to Home
Screen. Task 15 of the plan covers it.

**And now the largest unverified risk in the project: signing in with Google from a home-screen
installed instance, in standalone mode.** In iOS standalone mode, navigating to another origin
(`accounts.google.com`) can hand the user to Safari or an in-app browser, and the session cookie
can land in a jar the standalone shell cannot see. The failure is "sign-in works in Safari and
the installed app can never sign in", which breaks the product's whole delivery model. It cannot
be tested in WSL, in Windows Chrome, or on a simulator that does not exist here — only on a real
iPhone against a Vercel preview.

**The domain is `www.jmtarot.site`, bought 2026-07-27 and live.** Reconciliation §7.2 originally
said `www.jmtarot.com`; that was never purchased, and the amendment is in §7.2 itself. The apex
308-redirects to the `www` host — serve one, never both, because an OAuth redirect URI is a string
comparison and `AUTH_URL` pointed at the apex fails the callback after a redirect that looks
successful. Production `AUTH_URL=https://www.jmtarot.site`; Google's Authorized Domain is the
registrable `jmtarot.site`.

The OAuth consent screen is still in **Testing** mode, so only the manually-added test accounts
can sign in at all. **The purchase is no longer what blocks publishing** — `*.vercel.app` still
cannot be an Authorized Domain (public suffix, unverifiable in Search Console), but that is
solved. What remains is Google's branding requirement of an **app homepage that is not a login
page** — signed out, `/` redirects to `/login`, so there is nothing else to show. `/privacy` and
`/terms` no longer 404: W7 shipped both, public and reachable with no session cookie, and
`src/lib/auth/gate.ts`'s `isPublic()` keeps them that way.

`docs/TESTING-MACOS.md` was an assume-nothing guide to running Expo on a Mac. It is deleted on
this branch, because it would send Jodith chasing a toolchain that is no longer here; it still
lives on `feat/ios`. `README.md` has been rewritten for the web app.
## Analytics and reading history (W4)

W4 is done. Every reading, every card and every meaningful choice is persisted, and **none
of it is on the path of a byte the user is waiting for.**

```
src/lib/analytics/
  events.ts        the closed taxonomy: 60 names, a prop shape each, two compile-time
                   guards. NO IMPORTS -- it is the data dictionary, read by people.
  track.ts         SERVER. AsyncLocalStorage store, ONE after() per request, defer()
                   for work that must outlive the response.
  track.client.ts  'use client'. Batched: 2s debounce, flush at 20, queue capped at
                   200, fetch(keepalive) normally and sendBeacon on the hide path.
  localdate.ts     isomorphic. parseLocalDate (+/-1 day), validSessionId.
  tee.ts           the manual fan-out. The client is enqueued FIRST.
  flush.ts         the after()-side writers, sanitizeProps, the retry.
src/app/api/events/route.ts   public, always 204. W7 reviews it.
src/components/TrackView|TrackLink|AppLaunched|ReaderViewed.tsx
docs/analytics-queries.md     eight queries, all of them executed
```

**Writes go through one `after()` per request**, registered lazily by `withAnalytics`.
Deferred work runs first, then one batched insert into `events`. `readings` +
`reading_cards` are one transaction with a bounded retry (3 attempts, transient SQLSTATEs
only); everything else fails silently and logs.

**`latency_ms` is TIME TO FIRST TOKEN**, not total generation time — that is
`reading.completed.total_ms`. An ambiguous latency column is worse than none, and changing
the meaning later makes every historic row a different measurement.

**The reading body is captured by a manual fan-out, never `tee()`** — two branches with
independent queues couple their backpressure once one drains slower. And the
`[Bacaan terputus...]` notice reaches the screen but NEVER `readings.body`: a stored copy
would be quoted back at the querent by W5's chained reading as if the reader had said it.

**`reading.completed` exists twice per reading, from the server and from the client,
distinguished by `props.source`.** Not redundancy: the server's copy dies with the `after()`
that writes the row, the client's arrives through `/api/events` on a different request, and
a client copy with no matching `readings` row is the only way to detect a lost write. Query
1 of `docs/analytics-queries.md` is that alarm.

> **RETRACTED 2026-07-30.** This was a bug in `anthropic.ts`, not a provider fact. The
> adapter read `input_tokens` from `message_start`, where that wire always sends `0`; the
> real counts arrive in `message_delta`. Re-measured against the live endpoint: a cold
> prompt reports **1935**, and the same prompt re-sent reports **15 fresh + 1920 cached**,
> summing to the same total. z.ai also **honours prompt caching**, which three comments in
> this repository denied. The buffered path was never affected, which is why the claim
> survived: half the ledger looked plausible. `npm run probe:usage` re-checks it.
>
> Left standing below rather than deleted, because the wrong conclusion is one careless
> reading of `message_start` away from being re-derived.

**z.ai reports `output_tokens` but not `input_tokens`** (measured 2026-07-27). `input_tokens`
comes back `0` and is stored as NULL so no average is silently wrong; `token_output` is real.
Half a cost model, not none.

### Verifying it

`public/cards/_dev-events.html` (gitignored) taps three cards with real `PointerEvent`s and
diffs **three independent representations of one draw**: the `alt` text of the face-up
cards, the `picks` in the `/api/reading` body, and the `card_id` props of the three
`draw.card_picked` events. It also asserts three taps are ONE `/api/events` POST.

**Read the chosen FAN cards, not the slot boxes.** `querySelectorAll('img')` returns the
fan's 22 hidden faces, and `[data-slotbox] img` is empty unless reduced motion is on,
because normally the fan's own card animates into the slot. The second version "failed" an
orientation check against an app that was right — a harness reading the wrong element is
worse than no harness.

The check that matters most is not automatable and takes ten seconds: **stop the database
and take a reading.** It must stream and complete exactly as normal, with nothing but
`[analytics] ...` lines in the log.

### LIVE TRAP: `defer()` FROM INSIDE A DEFERRED JOB IS SILENTLY ORPHANED

**Recorded here by A2 (v0.5.0, reconciliation R17), because it is a fact about `drain()` and
nothing had written it down.** `drain()` does:

```ts
for (const job of store.deferred.splice(0)) { … }
```

`splice(0)` **empties the live array and returns a copy**, which is what the loop iterates.
So a `defer()` called from *inside* one of those jobs pushes onto the now-empty live array,
which nothing drains again — and `ensureRegistered` returns early, so no second `after()` is
registered either. **The job is orphaned, silently, with a green suite.**

`track()` from inside a deferred job **works**, because the event buffer is spliced after the
loop. That asymmetry is exactly what makes this hard to spot.

**A2 did not fix it.** Making `defer()` re-entrant is a W4 change with its own blast radius,
and A2 sidestepped it with a separate `store.calls` buffer flushed after the loop. **It is
still live for the next person who calls `defer()` from a deferred job** — which is a real
temptation, because `gist`, `translation_repair` and the `frequency` regeneration all run in
there.

**And A2 found a second shape of the same ordering problem**, plus `Store.drained` as the
answer: `bindAnalyticsScope()` registers the drain `after()` eagerly, so a route that
registers its own `after()` later has the drain run FIRST. Full account under *The LLM call
ledger (A2)*.

## Memory features (W5)

W5 is done. Three features, all reading from `readings` and `reading_cards`: a
card-frequency verdict, readings that reference the last reading, and a per-day summary in
the chosen reader's own voice.

```
src/lib/memory/
  windows.ts      PURE. The eight window specs and windowBounds(). No DB.
  frequency.ts    ranking, the M4 gate, the fingerprint, the ladder walk
  chain.ts        the request-path recall. NEVER THROWS -- returns null.
  gist.generate.ts  the model call + the write, in after()
  summary.ts      isStale(). The M13 throttle.
  copy.ts         STAGING POST for W6's catalog. `c()` not `t()`, like W3's.
src/lib/prompt/
  memory.ts       PURE. gist, chainRelevance, memoryBlock, detectCallback.
  summary.ts      the frequency verdict AND the day summary prompts
  side.ts         SIDE_FORMAT_RULES. DELETED BY W6 -- see its header.
src/app/api/memory/{frequency,summary}/route.ts
src/components/{FrequencyLine,DaySummary}.tsx
```

**The pure/impure split is forced, not stylistic.** `queries/contract.test.ts` requires the
database handle as the first parameter of every exported function in
`src/lib/db/queries/**`, and `windowBounds`, `passesGate` and `isStale` have no handle to
take. W5's plan puts them in `queries/frequency.ts`; the contract test wins. Same wall W3
hit with the Lotus cache.

**`<riwayat>` is the tag in BOTH locales**, and W5's plan saying `<history>` loses to R17: an
English querent will never type "riwayat" and will absolutely type "history", so the
English-looking tag is the one carrying injection surface. `riwayat` is in `sanitize.ts`'s
DELIMITER alternation, which now fences four blocks. Only the `ULANG:`/`AGAIN:` marker
INSIDE the block is localised — that is content the model reads, not a fence the sanitizer
strips.

### The traps W5 paid for

- **NEVER MATCH A BARE `lagi` IN THE CALLBACK DETECTOR.** It is also the progressive aspect
  marker: "dia lagi mikir" is "he is thinking", not "again". A bare pattern fires on most
  sentences of casual Indonesian and reports a ~90% callback rate that is entirely noise —
  and that ratio decides whether chaining is cut or tightened, so it would be a CONFIDENT
  wrong answer. Every Indonesian pattern is multi-word or hyphenated. Same class as the
  `tempoh` miss. English: `again` fires, `against` must not.
- **`gistUserTurn` must NOT use `stripUntrusted` directly.** It collapses newlines, right for
  a question and fatal here: the gist prompt's central instruction is "the conclusion is in
  the final paragraph", and a flattened body has no final paragraph. It strips per paragraph
  and rejoins. The failure would read as a bad prompt, not a bad sanitizer.
- **`sanitizeGist` TRUNCATES where `sanitizeQuestion` REJECTS.** One handles the querent's own
  words, where shortening misrepresents what they asked; the other handles model output under
  a length rule the model may have ignored, where refusing throws away a usable clause over a
  formatting failure.
- **`created_at` is TRANSACTION-START time**, so rows written in one transaction share a
  timestamp exactly and `order by created_at desc` is not a total order. Production never
  hits it; `withRollback` hits it every run. `recallableReadings` orders by
  `created_at desc, id desc`. Two integration tests failed on this.
- **A ceiling the model can count as it writes, restated LAST.** Both generated prompts
  overshot on the first real run — the day summary at 61 words against 45, the frequency line
  at 29 against 25. Fixed by the pattern `services.ts` uses: state the limit as "N sentences
  AND M words, whichever comes first", bind it explicitly on the long-sentence reader, and
  restate it AFTER the thing that invites elaboration. Margaret keeps her one long patient
  sentence and now fits it in 43 words.
- **`source_reading_ids` is `uuid[]`, not `text[]`.** Placeholder fixtures are rejected by
  Postgres, which is the column doing its job.
- **`readingsOnDay` deliberately has NO filters, unlike `recallableReadings`.** Recall feeds a
  callback, so a dead stream has nothing to quote. A day summary is a count: "you drew three
  times today" is true whether or not the third finished, and filtering would make it
  disagree with what the querent remembers.

### Verifying it

```sh
npm run smoke -- --summary            # six summaries, three readers x two locales
npm run smoke -- --frequency          # TWELVE verdicts: six card pairs x two locales
npm run smoke -- --frequency --locale id   # half of either, for iterating
npm run smoke -- --all --memory --gist  # the nine, with a chain block and real gists
npm run smoke -- --all --fixed        # the CONTROL for the above. Same hands.
```

**V3 rewrote both of these prompts.** `--frequency` was five `id` verdicts and is now twelve
across both locales, one of the six pairs is a Fool collision, and both runners fail on a
tally. `public/cards/_freqshot.html` and `_sumshot.html` (gitignored) screenshot the two
gated pickers at a real 390px with the endpoint stubbed, so neither costs a model call.

**MEASURED 2026-07-27, and it inverts what §6 predicted.** The chain block was expected to
DILUTE the 40-words-per-paragraph ceiling by pushing it back in the context. Same hands, with
and without:

```
                control    with the block
thessaly          133          136
margaret          312          216
adrian            116          152
```

The block makes Margaret 96 words SHORTER — §4.4's third paragraph, which restates the
ceiling at the point of temptation, more than pays for the added length. Reader overlap went
0.050 → 0.063, comparable to the Lotus block's 0.056 → 0.074. `chain_used / chain_offered`
was 2/9, inside the 15-60% operating band.

**AND IT FOUND A PRE-EXISTING REGRESSION THAT IS NOT W5's.** Margaret's `spread3` runs at 312
words in the CONTROL, against the 128-169 band under "The prompt". W5's system prompt with
`memory: null` is byte-identical to what shipped before it — there is a test asserting that —
so this predates the workstream. Fixing it means `readers.ts` or `services.ts` and its own
tuning loop.

### OPEN: `/api/memory/summary` IS LOSING `memory.summary_generated`. CONFIRMED, NOT SUSPECTED

**Recorded by A2 (v0.5.0, reconciliation R18), which observed it and was ruled out of scope.**
V2's bug shape exactly, one route over.

That route's `after()` calls `track('memory.summary_generated', …)`. An `after()` callback is
not guaranteed to run inside the ALS context that registered it, so `als.getStore()` misses,
`track()` takes its unbatched fallback, and that fallback calls `after()` — from inside an
`after()`.

**Measured on a real day summary, 2026-07-29:** `daily_summaries` had its row and `events`
held only `memory.summary_shown`, which fires synchronously in the handler.
`memory.summary_generated` was absent. **There was no error line to find**, because in this
Next version `after()` inside an `after()` does not throw — it silently drops the work. So
the check is *"is the events row there"*, never *"is there a log line"*.

**The remedy is one word and is already available in that function:** A2 binds
`const inScope = bindAnalyticsScope()` there for its own ledger row, so the fix is
`inScope(() => track(…))`. There is a paragraph at the call site saying so.

**Why A2 did not do it:** W5's file, W5's event, roadmap §6 assigns neither to A2, and R18
ruled it out rather than let A2's diff span a sixth workstream. It is one line for whoever
owns W5 next.

## Localization (W6) -- the traps
### Traps W6 paid for

- **`?lang=` only affects the request that carries it.** Client components that fetch
  (`FrequencyLine`, `DaySummary`) send no `lang`, so they resolve from the session claim —
  which made the first English screenshot show an Indonesian frequency verdict under an
  English hint. `public/cards/_enshot.html` posts to `/api/locale` instead, which sets the
  cookie AND re-mints the claim.
- **Anything reading "who is this" must use `await getLocale()`, not `user.locale`.** They
  agree for a real user, because the claim is first in the chain, and diverge under
  `?lang=` — exactly when a screenshot loop is watching. `/api/reading` and both
  `/api/memory/*` routes learned this separately.
- **`POST /api/locale` writes `users.locale` BEFORE `refreshSession()`, not in
  `after()`.** The plan said `after()`; it cannot be, because the jwt update branch
  deliberately ignores its payload and RE-READS the row, so a deferred write means the
  refresh re-stamps the stale claim and the switch silently reverts.
- **`router.refresh()` KEEPS CLIENT STATE, WHICH IS WHY THE SWITCHER USES IT — AND IS ALSO
  WHY EVERY `useEffect` THAT FETCHES LOCALISED CONTENT NEEDS `locale` IN ITS DEPENDENCY
  ARRAY.** The state-keeping is a feature (the frequency line does not flash away and come
  back); the cost is that a component which fetched its prose on mount **can never fetch it
  again**, because nothing remounts.

  Shipped that way and found by driving the real page: after tapping EN the chrome was
  English and both model-written lines were still Indonesian — *"Dalam tiga belas hari
  terakhir, Strength dan The Star muncul…"* on `/`, *"Kamu sudah punya jawaban untuk yang
  dipertanyakan…"* on `/thessaly`. **Forever, with nothing failing and nothing logged.**
  `FrequencyLine`'s deps were `[]` and `useDaySummary`'s were `[readerId]`;
  `frequency_verdicts` and `daily_summaries` are both keyed on locale, so the English row
  does not exist until something asks for it.

  **It costs no model call on load** — `locale` is stable for a page's lifetime, so the
  effect still fires once per mount. **And neither component may blank on switch.** Both
  assign only on success, so the old line holds the screen for the ~1.8s / ~1.2s a cold
  generation takes; a `setLine(null)` "to avoid stale text" trades a briefly-old sentence
  for two seconds of nothing, the empty state M14 forbids. **Since V5 the stakes are higher
  than cosmetic:** `ReaderDeck` builds a ONE-panel deck while the summary string is empty,
  so blanking would not empty the panel — it would REMOVE it, dropping the querent from two
  panels to one and back, mid-gesture. `localeSwitch.test.ts` fences both halves.

  **A THIRD FAILURE WAS iPHONE-ONLY:** a timed-out request used to revert the marker and
  skip the refresh while the write landed anyway, so the new language appeared only on the
  next navigation. It is retried once now, and `session-update:` left Upstash to delete a
  Tokyo hop from the path. Full write-up is the `POST /api/locale` entry under `## Traps` —
  read it before changing `SWITCH_DEADLINE_MS`, `SWITCH_RETRY_DEADLINE_MS` or the catch.

- **A template literal will stringify a `Localized<>` object and typecheck clean.**
  `` `Layanan: ${s.name}` `` shipped `[object Object]` into all nine system prompts with a
  green `npm run typecheck`. Grep for `\$\{[a-z.]*\.(name|tagline|bio)` after any
  `Localized<>` change.
- **`Intl.PluralRules` answers whether the NOUN inflects, and nothing else.** CLDR gives
  `id` only `other`, so a plural family renders `Ketuk 1 kartu` at every count.
  `draw.hint.tap` is therefore `.single`/`.many` with a `cardCount === 1` check, keeping the
  spelled-out `satu`. Do not "simplify" it into a family; a test asserts
  `draw.hint.tap.one` does not exist.
- **`server-only` USED to throw in Vitest, and W7 fixed that centrally.**
  `vitest.config.ts` aliases the package to its OWN `empty.js` — the file the bundler picks
  under the `react-server` condition — because W7-D14 puts the marker on
  `src/lib/prompt/**`, which would otherwise break `build.test.ts`, `lotus.test.ts`,
  `memory.test.ts` and the base-contract snapshot on import. Nothing is weakened: the
  throw's value is the BUILD error, untouched. `resolve.ts` still does not carry the marker
  — it is edge middleware's dependency and the fence there is `config.ts`. **Scripts still
  throw**, so `npm run smoke` and `npm run probe:moderation` set
  `NODE_OPTIONS=--conditions=react-server`.
- **The client must never import `@/lib/i18n/catalog`** — it holds both catalogs;
  `LocaleProvider` is handed the resolved one as props. `src/lib/clientBoundary.test.ts`
  fences it, along with `@/lib/prompt/**` (one exception: `sanitize`, paired with an
  assertion that `sanitize.ts` carries no prompt prose).

### Verifying it

```sh
npm run smoke -- --all              # EIGHTEEN readings, both locales
npm run smoke -- --all --locale en  # nine, for iterating
npm test -- i18n                    # catalogs, format, resolve, length budget
```

`npm run smoke -- --all` ends with a **blind read**: three readings per locale, names
covered, shuffled, key after forty blank lines. Actually guess. If you cannot get three of
three, fix the persona paragraphs.

Three voice proxies print every run and FAIL loudly: each reader's own forbidden vocabulary
against their own output, mean sentence length (Margaret must stay 1.5× Thessaly), and
contraction rate (`en` only — Adrian > 0, Margaret == 0). Measured 2026-07-27: `id`
10.2/19.1/13.8, `en` 14.5/23.9/13.4, contractions 0.66/0.00/7.85.

`public/cards/_slotfit.html` measures the slot row at 320/360/375/390 in both locales.
**English fits BETTER than Indonesian here** — every English label is one or two lines;
`Yang sedang berjalan` and `Yang menanti di depan` take three at all four widths, which
shipped and is pre-existing. `public/cards/_enshot.html` is for looking, at a real 390px.

**`LENGTH_BUDGET` in `src/lib/prompt/budget.ts` is the one place a word ceiling is
written**, interpolated into the prompt and asserted by the smoke script.
`budgetFor(locale, service, reader)` applies **`MARGARET_MULTIPLIER`** — 1.3 on every
reader-voiced ceiling, because her voice rules mandate long subordinated sentences that do
not fit 40 words. **The English `spread3` calibration is NOT converged**: she has come in
at 157–243 words across runs, and widening the band further would be chasing variance. The
frequency verdict is house voice and is unaffected.

## Trust, safety and secrets (W7)

W7 is done. A moderation gate that refuses harm without refusing tarot, two legal documents,
and a tripwire that fails the build if a prompt or a key ever reaches the browser.

```
src/lib/moderation/
  types.ts       CLIENT-IMPORTABLE. CATEGORIES, CLAUSE_FOR, RefusalPayload.
  resources.ts   CLIENT-IMPORTABLE. Crisis hotlines, each with verifiedOn.
  blocklist.ts   server-only. Two tiers, exemptions-as-mask, two haystacks.
  classify.ts    server-only. One English prompt, temperature 0, 48 tokens.
  gate.ts        server-only. screenSync -> prime -> race -> decide.
  log.ts         the moderation_flags writer + the lazy redaction sweep.
src/components/RefusalNotice.tsx     the 403, rendered. Never a reader's voice.
src/app/terms|privacy/               17 clauses, 12 sections, both locales.
src/app/api/cron/sweep/route.ts      ONE job, THREE deletes.
scripts/audit-secrets.ts             the tripwire. Runs inside `npm run build`.
scripts/probe-moderation.ts          how the model and the timeout were chosen.
```

### The gate refuses HARM, not SENSITIVITY

**This is the product judgement everything else falls out of, and the one a future session is
most likely to undo by "tightening" the list.** Tarot's actual subject matter is grief,
illness, money trouble, divorce, a dying parent, a partner who has become frightening. If the
gate refuses those, there is no app left. Refusing
`haruskah aku pergi dari suamiku yang kasar` is not neutral — it reads as "even the tarot app
will not touch this", which is an active harm.

Eight categories where **the answer itself would be the harm**, plus `other` and `unclear`.
The ALLOW section of the classifier prompt is longer than the FLAG section on purpose, and a
test asserts it stays that way. **A false positive is an accusation delivered to somebody who
did nothing wrong**, with no appeal path in a streaming UI — hence Tier A is small and
proximity-anchored, every pattern has a near-miss test written first, and the whole near-miss
corpus runs under both locales.

### What the numbers came from

Measured against live z.ai on 2026-07-27 with `npm run probe:moderation`:

```
model            p50      p95      corpus    JSON at temperature 0
glm-4.6         1764ms   7546ms    20/20     10/10 byte-identical
glm-4.5-air     1812ms   4600ms    20/20     10/10 byte-identical
glm-4.5-flash    617ms    903ms    36/42     10/10 byte-identical   n=42

reading TTFT, same session:  p50 4591ms
```

**`MODERATION_MODEL=glm-4.5-flash` IS A PRODUCTION REQUIREMENT, NOT A COST OPTIMISATION.** D8's
premise is that the classifier returns before the reading's first token; on the reading model
that is false — p95 7546ms against a p50 TTFT of 4591ms — and the gate becomes the latency.
Unset falls back to `LLM_MODEL` and silently reintroduces it. `MODERATION_TIMEOUT_MS=1500`
comes from the same measurement, not the plan's guessed 2500.

### The five things a future session will otherwise undo

1. **`.next/server/chunks/**` IS EXCLUDED FROM THE AUDIT ON PURPOSE.** The base contract
   legitimately lives there. A scanner that flags it is a scanner somebody switches off within a
   week, and then nothing is checked at all. Same reasoning excludes `moderation/types.ts` and
   `resources.ts` from needling — they are supposed to reach the client.
2. **`x-frame-options: SAMEORIGIN`, and `frame-ancestors 'self'`, never `DENY` / `'none'`.** A
   security checklist will say otherwise; `DENY` kills the same-origin iframe harnesses under
   `public/cards/` while blocking nothing that SAMEORIGIN does not. `src/lib/headers.test.ts`
   asserts both. **THE CONCLUSION IS UNCHANGED AND ONE CLAUSE OF THE REASONING IS NOT:** this
   used to say the harnesses were the only way to drive the UI because Chromium could not launch
   in this WSL image. Since 2026-07-28 a real Chrome does launch (loop 5), so they are no longer
   the *only* way — they are still a dozen committed harnesses a header change would break for no
   gain. Do not flip the header on the strength of the stale clause.
3. **The gate PRIMES the reading before awaiting the verdict.** `iterator.next()` in
   `gateReading` issues the HTTP request; deleting it looks like a tidy-up, breaks nothing, logs
   nothing, and doubles every reading's latency forever. The timing test in `gate.test.ts` was
   verified by negative control.
4. **Nothing unverified enters `resources.ts`, and no number lives anywhere else.** A hotline is
   the one string here where being out of date is a safety failure. Warn at 180 days, FAIL at
   365. Re-verifying already caught a dead Kemenkes URL and a wrong claim about the hours.
5. **T&C clause 6's sub-numbering is an interface.** The refusal renders `/terms#6-2` and
   `CLAUSE_FOR` is the map. Renumbering breaks the link silently, for somebody who has just been
   refused. `src/app/legal.test.ts` fails on it.

### Traps W7 paid for

- **JSX STRIPS THE LEADING WHITESPACE OF A TEXT NODE THAT SPANS MORE THAN ONE LINE.** A space
  after `</strong>` or after a `{expression}` survives when the sentence fits on one source line
  and vanishes when it wraps — so the bug appears and disappears with code formatting. It shipped
  three times (`www.jmtarot.siteand`, `happen."We`, `model.The`) and was found by reading a
  screenshot. **A RENDER TEST DOES NOT CATCH IT:** Vite's JSX transform keeps the space and
  Next's SWC drops it, so `renderToStaticMarkup` reported clean against a visibly broken page.
  The guard is a source-level check in `legal.test.ts` requiring an explicit `{' '}` at every
  wrapping boundary.
- **`pkill -f "next start"` DOES NOT KILL THE SERVER.** It renames itself to
  `next-server (vX.Y.Z)`, so a stale instance keeps the port and every `curl` silently tests an
  OLD BUILD. This looked exactly like "Next ignores the headers config" and nearly bought a
  pointless rewrite. Kill `next-server`, or check `ss -lptn | grep <port>`.
- **A `'use server'` module is an RPC boundary, and `import type` is erased.** The transitive
  boundary walk reported both as violations on its first run; neither is one. **AND THE TWO
  CHECKS WERE IN THE WRONG ORDER UNTIL V4, WHICH BANNED THE SANCTIONED PATTERN FROM `lib/auth/`
  SPECIFICALLY** — the `FORBIDDEN` prefix rule ran *before* `isServerAction`, so a server action
  under a forbidden prefix failed the walk before anything asked whether it was a boundary. W3's
  `app/onboarding/actions.ts` never exposed it because `app/` is not a forbidden prefix; V4's
  sign-out is, since the only honest home for a session-clearing action is `lib/auth/`. **Nothing
  is weakened by the reorder** — `isServerAction` is a fact about how Next compiles the module,
  and Next refuses to build a `'use server'` file that exports anything but async functions.
  Verified by two negative controls: a client component importing `@/lib/auth/auth` directly
  still fails, and the same action file with its directive removed still fails.
  `clientBoundary.test.ts` asserts that `isServerAction` is consulted BEFORE the prefix verdict,
  and that `lib/auth/actions.ts` stays exempt **by directive rather than by allowlist** (an
  allowlist entry would exempt that file for every reason). Asserted on the script's source,
  because `checkClientBoundary` is not exported and running the real scanner needs a build.
- **The blocklist runs BOTH locales' patterns under both locales.** W7-D3 said otherwise.
  `locale` is the UI preference, not a declaration of what language the querent types, and an
  Indonesian speaker with the interface in English is the likely `en` user of an
  Indonesian-first app. Caught on the live route: `gimana cara bunuh diri` under `en` fell
  through Tier A and cost a classifier call (967ms) instead of a free deny (24ms).
- **Never log a driver error from the moderation path** — same rule and reason as `flush.ts`
  (see `## Traps`); `log.test.ts` and `leak.test.ts` both assert it with a canary.
- **`server-only` is NOT on `src/lib/db/**`, deliberately.** W1's `contract.test.ts` forbids it
  there with a stated reason — those modules run in `scripts/db-seed.ts`, which has no React
  runtime — and W1 owns the directory. `clientBoundary.test.ts` covers the same ground.
- **VERCEL INJECTS NINETEEN `NEXT_PUBLIC_VERCEL_*` VARS, AND THEY BROKE THE FIRST REAL DEPLOY.**
  `0b4e4a0` built clean locally and failed on Vercel with nineteen findings, none from this repo
  — the platform duplicates its system env under a `NEXT_PUBLIC_` prefix, and `checkNextPublic()`
  was enumerating a `process.env` this repository does not own. `audit-secrets.ts` now warns on
  the `NEXT_PUBLIC_VERCEL_` prefix in one line instead of failing nineteen times;
  `NEXT_PUBLIC_ALLOWLIST` stays empty. **The read grep over `src/**` is untouched and is the half
  that matters** — Next inlines a value where something READS it, not because it is set —
  verified by a control that reads `process.env.NEXT_PUBLIC_VERCEL_URL` and still fails the
  build. Do not value-scan the namespace "to be thorough":
  `NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL` is `www.jmtarot.site`, which is in the manifest and
  both legal pages by design.

### Verifying it

```sh
npm run audit:secrets       # re-run the tripwire without rebuilding
npm run probe:moderation    # re-measure the classifier before changing the model
npm test -- moderation      # blocklist, classifier, gate, log, leak canaries
npm run test:integration -- 'moderation|sweep'
```

`public/cards/_refusalshot.html` (gitignored) screenshots the refusal at a real 390px in both
locales and both shapes, driving the real page with real `PointerEvent`s and stubbing only
`/api/reading`. **There is no reveal button** — the third pick submits — and an earlier version
of that harness printed a scary failure under a refusal that had rendered perfectly.

**The audit's negative control matters and is documented in its header.** An unused
`export const LEAK = BASE_CONTRACT.slice(0, 220)` is tree-shaken and correctly does NOT fire;
the leak has to actually render. That is the right scope — it scans what SHIPS — and it is why
the source-side fences exist too.

**`npm run smoke -- --all` must be unaffected by all of this.** The script sends no question,
`moderate(null, …)` returns before touching the blocklist, and the eighteen readings are
byte-for-byte the same job. Verified 2026-07-27: zero FAILs, zero moderation log lines, mean
sentence words 11.0 / 25.5 / 14.9, contractions 0.87 / 0.00 / 3.52.

### Still open, and none of it is code W7 could write

- **`/account` does not exist** — see `## Current state`. The privacy policy describes a
  deletion the user cannot yet perform.
- **Clauses 10, 11 and 12 need a lawyer.** Substance drafted, enforceability not assessed.
- **The Jakarta district needs confirming** against PT Citra Suka Buana's deed.
  `Pengadilan Negeri Jakarta Pusat` is the conventional default; if the deed says another
  district, change the one string in `src/app/terms/operator.ts`.
- **THERE IS NO HARD SPEND CAP AT Z.AI AND THERE WAS NEVER GOING TO BE.** `LLM_API_KEY` is a
  fixed annual subscription sold for coding, not a wallet, so there is no bill to cap — verified
  2026-07-27 against z.ai's FAQ, which also rules out a pay-as-you-go balance to overflow into.
  V9 replaced it: a fleet-wide Upstash limiter, a global ceiling on model calls over a rolling
  5-hour window (`LLM_WINDOW_CALL_CEILING`), and query 9. `docs/DEPLOY-VERCEL.md` §2b is
  rewritten. **The risk is now quota exhaustion, which is a denial of service against the querent
  and has no billing alert attached** — see `docs/plans/2026-07-27-ratelimit.md` §0.
- **AND THE COMEDOWN IS WORSE THAN THE CAP WAS.** The same FAQ says the Coding Plan is *"strictly
  limited to use within officially supported tools and products"*, and JMTarot is not one. The
  consequence of enforcement is not a warning or an overage — it is **key revocation, which takes
  the whole app down at once**. **`src/lib/llm/openai.ts` is the answer and it is built, tested
  and measured** (`docs/provider-comparison.md`). It is NOT switched on: OpenAI is 8× faster to
  first token, reports real `input_tokens`, and has a better classifier, but **reader overlap on
  `spread3` goes 0.050 → ~0.086**, the one metric this product is built on. The fallback exists
  and the default does not move until the persona paragraphs are tuned.
- **`findahelpline.com` and `112` are NOT in `resources.ts`** because neither could be verified —
  findahelpline returned 403 twice. Both are worth adding by hand.
- **Vercel's log retention, and whether the platform logs POST bodies**, is unverified. The
  privacy policy claims only our half: we never log question text ourselves.

## Translation (V2)

V2 is done. Every piece of generated prose records the language it came out in, and a language
switch **translates** what already exists instead of showing Indonesian text inside an English
app. Plus the bug underneath "the language resets": a brand-new `en-GB` user used to be snapped
to Indonesian at row creation by a column default that was never a choice.

```
src/lib/translate/
  keys.ts        LEAF. TRANSLATABLE, the entity/field unions, isTranslatableKey,
                 TRANSLATION_PROMPT_VERSION. NO prompt layer, NO server-only --
                 `queries/translations.ts` imports it, and rule 3 of that directory
                 forbids acquiring the marker even transitively.
  contract.ts    PURE. sanitizeSource, namesIn, verifyTranslation,
                 buildTranslationPrompt. Re-exports keys.ts, so callers import one path.
                 Carries prompt prose -> fenced from the client.
  translate.ts   server-only. translateOrCached, translateStream, the repair pass, the
                 upsert, the event.
src/lib/db/queries/translations.ts   get/put/deleteFor/deleteOrphans/resolve, plus
                 gistTranslations for the chain block.
src/app/api/translate/route.ts       POST. Streams iff the registry says so.
```

**Call `translateOrCached()` or `translateStream()`. Nothing else.** `putTranslation` has
exactly one caller, because it is the only place verification happens and an unverified row in
that table is the whole failure the workstream exists to prevent.

### OPEN: `TRANSLATION_MODEL` IS RECORDED BUT NEVER USED

**Found by A2 (v0.5.0) while threading the ledger, and not fixed — V2's file, and roadmap §6
gives A2 one-line reads here with no behaviour change.**

`persist()` writes `TRANSLATION_MODEL || LLM_MODEL || 'unknown'` into `translations.model`.
But **nothing in `translate.ts` ever passes a `model` to the provider**: `openStream` calls
`getProvider().streamReading(prompt)` with no opts at all, and `generate()` calls
`getProvider().complete(prompt, { op, callClass })` with none either. Both therefore resolve
to `LLM_MODEL` inside the adapter.

**So setting `TRANSLATION_MODEL` today changes what the column CLAIMS and not what ran.**
CLAUDE.md says the variable *"defaults to `LLM_MODEL` and WANTS the reading model"*, which is
true of the default and misleading about the override — the override is inert.

`LOTUS_MODEL` and `PERSONA_MODEL` are **not** like this: `lotus.generate.ts` and
`persona/generate.ts` both compute their model and pass it in `opts`. This is the one of the
three that does not.

**`llm_calls.model` deliberately records `LLM_MODEL` here rather than copying `persist()`.**
That column is what `prices.ts` is keyed on, so a row naming a model that did not run prices
the wrong rate — silently, in the one table whose entire purpose is cost. There is a comment
at the site saying so, and if somebody threads `TRANSLATION_MODEL` through to the provider,
that line moves with it and the two become the same value honestly.

### The five things a future session will otherwise undo

1. **`<terjemahan>` is a fifth fence, not a locale variant** (R17). What it fences is not text a
   user typed — it is MODEL OUTPUT THAT WAS ITSELF GENERATED FROM USER TEXT, handed to a second
   model as material, with the result going straight to a screen. The Indonesian-looking token is
   deliberate: an English querent will never type "terjemahan" and would absolutely type
   "translation".
2. **The card-name check is MECHANICAL, not only a prompt rule.** Card and reader names are
   English in both locales, so the invariant is direction-symmetric and exactly checkable with
   `includes()`. The prompt rule alone is what produced "Pulan" for The Moon. `namesIn` is
   case-sensitive and word-bounded on purpose: a false `card_name` violation costs a CORRECT
   translation its cache row.
3. **REPAIR, DO NOT BUFFER.** A dirty generation is never persisted; the viewer sees it once and
   a `defer()`ed repair pass is what lands in the table. Buffering the stream to verify before
   the first byte was considered and refused — it trades VD8 away for every translation to
   protect the failing minority. **If the measured `invalid` rate exceeds ~2%, fix the prompt,
   not the architecture.**
4. **Staleness is `translations.updated_at < source.updated_at`, and there is no `source_hash`
   column.** `putTranslation` sets `updatedAt` BY HAND inside `onConflictDoUpdate` —
   `$onUpdate()` does not fire there, and for this table that column is the entire mechanism.
5. **`users.locale_source` NULL means `'chosen'`.** Read it through `effectiveLocaleSource()`,
   never raw: every pre-v0.3.0 row is NULL and those users may well have pressed the toggle.
   `raw ?? 'default'` is what a reasonable person writes without the helper, and it would license
   overwriting exactly those preferences.

### Traps V2 paid for

- **`to_regclass` CANNOT GUARD A RELATION FROM INSIDE THE STATEMENT.** V2's plan §8 sketches the
  orphan sweep with `and to_regclass('public.personas') is not null` in the WHERE clause.
  Postgres resolves every relation at PARSE time, so the subquery raises
  `relation does not exist` and the guard beside it never runs. The guard has to decide whether
  the statement is ISSUED — a separate round trip. That is what lets `'persona'` sit in the
  registry from day one, inert until V8 lands.
- **`queries/**` WAS ACQUIRING `server-only` TRANSITIVELY AND NOTHING NOTICED.**
  `contract.test.ts` only checked direct imports. V2 did it via
  `translate/contract.ts -> prompt/base.ts` and fixed it by splitting `keys.ts` out; the new
  transitive check then found the SAME SHAPE pre-existing in W3's `queries/lotus.ts`, which
  reaches `prompt/lotus.ts` for one integer. That one is allowlisted by name with the fix written
  down — it is W3's file.
- **MIDDLEWARE'S FORWARDED LOCALE IS NOT EVIDENCE THAT ANYBODY NEGOTIATED.** `src/middleware.ts`
  sets `x-jmt-locale` and refreshes `jmt_locale` unconditionally, carrying `DEFAULT_LOCALE` when
  it had no signal at all. Treating either as a negotiation made `locale_source = 'default'`
  UNREACHABLE through a real sign-in, with nothing failing. Found by reading the row after a live
  `dev-session` call. `resolveForSignIn` derives the locale and the source separately.
- **`headers()` AND `cookies()` DO RESOLVE INSIDE @auth/core's jwt CALLBACK** — measured through
  the Credentials provider, which runs the same callback the Google path does. The plan held an
  `AsyncLocalStorage` wrapper in reserve; it is not needed and was not built.
- **A `sql` TEMPLATE LITERAL EATS A BACKTICK IN A COMMENT.** A doc comment inside
  `upsertUserOnSignIn`'s statement ends the template and the whole file stops parsing, with the
  error pointing at the SQL rather than the prose.
- **NEVER LOG THE DRIVER ERROR OR THE LLM CLIENT ERROR.** A postgres error quotes its bound
  parameters and one of them is the translated body; an LLM client error can carry the whole
  prompt, which holds the source verbatim.
- **THE VOICE RULES HAD TO BE STATED AS OUTRANKING THE SOURCE.** Measured: Adrian's English
  translations came back at **0.00 contractions/100w** while his native English uses them freely,
  and his persona block says "Contractions throughout" and was being carried verbatim — the model
  weighted translating above the persona. `REGISTER_EN` / `REGISTER_ID` fixed it (0.00 → 0.61,
  Margaret correctly still 0.00). That is roadmap §9's named risk, and the contraction proxy is
  the ONLY check that sees it.

### Verifying it

```sh
npm test -- translate            # contract, invariants, sanitizer, registry, wiring
npm test -- i18n                 # resolveForSignIn, effectiveLocaleSource
npm test -- sanitize             # the fifth alternative, and the delimiter SET
npm run db:up && npm run test:integration -- 'translations|profile|sweep'
npm run smoke -- --translate     # SIX REAL TRANSLATIONS, both directions. READ THEM.
```

`npm run smoke -- --translate` asserts through `verifyTranslation` — the same function
production gates on — so a pass here and a refusal in production means one of the two is wrong
and it is not the script. What it adds is the two **voice proxies applied to translations rather
than to native output**: mean sentence length (Margaret ≥ 1.5× Thessaly) and contraction rate
(`en` only, Adrian > 0, Margaret == 0). Those are the only mechanical signal that a translated
Margaret has not become Thessaly with longer words.

**Measurements in `docs/plans/2026-07-27-translation.md` under `## Measured`.** Zero card-name,
paragraph, Malay or tic failures across twelve translations, **and the tic half of that has since
been contradicted by one sample** — a `--translate` run on 2026-07-28 produced
`id->en/margaret: tic (manifest)`. See that file's `### Addendum, 2026-07-28`. It is one draw from
a non-deterministic model rather than a rate, the structural checks all still passed, and
`ceilingFor`'s `service` branch was verified byte-identical by diff — but the original sentence
read as settled and is not. **The word BAND is not converged and was deliberately not widened** —
Margaret's paragraph overruns appeared in one run and vanished in the next while Adrian's did the
reverse, which is variance.

**AND `npm run smoke -- --translate` EXITS 0 WHILE PRINTING `FAIL` LINES.** They are diagnostics
for a human — the script ends by telling you to cover the names and read the three translations —
so **a red-looking `--translate` is not a gate and is not by itself evidence of a regression.**
Establish that from `ceilingFor` and a diff, the way the 2026-07-28 check did, rather than from
this output: two consecutive runs disagree with each other against unchanged prompts. One signal is consistent and
contradicts the plan's open question 3: Thessaly `en → id` comes in SHORT (95, 86 against a floor
of 105), not long.

**Stop the database and open a translated reading.** It must fall back to the source prose with
nothing but a log line. A cache read that fails is a cache MISS, never an error.

**V2 CHANGES NO BYTE OF THE EIGHTEEN READINGS, AND THAT IS VERIFIED RATHER THAN ASSERTED.**
`sanitize.ts` gained an alternative no reading prompt emits, `schema.ts` a table no reading path
reads, and `RecalledReading` a field absent from every `memory: null` prompt. Checked by
fingerprinting all eighteen system-plus-user prompts at `4f29b4f` and at HEAD: **18/18
identical.** Do that rather than reading `npm run smoke -- --all` output for this question — the
model is non-deterministic, and two consecutive `--locale en` runs gave 5 then 4 different
violations against unchanged prompts (the known-unconverged English calibration, not a
regression).

## Mystical memory verdicts (V3)

V3 is done. **The app has stopped doing arithmetic out loud.** W5's two generated lines read
the same history and no longer recite it: *"This week The Empress is shown three times whilst
The Chariot is shown two times"* is the sentence this workstream exists to delete.

```
src/lib/memory/shadow.ts   the ONLY V3 module importing @/lib/numerology. shadowFor,
                           pulseFor, dayShadowFor, and the composed FrequencyMechanic
                           the prompt is built from.
src/lib/memory/tally.ts    PURE, no `server-only` -- the smoke script imports it. Two
                           tiers, and a window-phrase strip.
src/lib/memory/frequency.ts  GAINED dominanceOf and verdictCacheState.
src/lib/prompt/summary.ts  both prompts, the ten new angles, the six rewritten worked
                           examples, summaryMaxWords.
src/lib/prompt/budget.ts   MARGARET_MULTIPLIER (VD19).
```

### THE COUNTS ARE DELETED FROM BOTH PROMPTS, NOT FORBIDDEN IN THEM

This is the whole mechanism. The model is handed two card names, **the Shadow Arcana** —
`arcanaFor(top.id + second.id)`, the traditional quintessence — one **written pulse line**,
and one **dominance word**. It is never handed `m` or `n`. **A model cannot recite a count it
was never given**, and an instruction that merely forbids the tally is what fails under
compression pressure — the same failure that made Thessaly stop naming cards when the 40-word
ceiling landed. The instruction is the second line of defence and `tallyProblems()` in the
smoke script is the third.

`summary.test.ts` asserts **the frequency user turn contains no digit at all**, in both
locales, and is digit-free for `d666` once its window phrase is stripped. That makes the
smoke check exact: a digit in the OUTPUT was invented, never copied.

### The five things a future session will otherwise undo

1. **`FrequencyMechanic`'s key set is asserted exactly** (`shadow.test.ts`, inherited from V1
   via reconciliation §5.4). Without it VD2 degrades from "impossible" back to "merely
   forbidden", because the way a tally returns is somebody adding `topCount` for a reason that
   looks good at the time. `pulseNumber` is the one number on it, it is `reduce(m + n)` and not
   a count, and it exists for the analytics event.
2. **`dominanceOf` is a RATIO, not `m - n`** (V3-5, correcting roadmap §5). A difference is not
   scale-invariant: `10:8` is `narrow` where the difference would call it wider than `4:2`,
   which is `overwhelming`. `dominance.test.ts` names that case after the ratio so a refactor
   back fails there and nowhere else. The `m - n === 1` clause is an absolute floor and does
   real work at small counts.
3. **`tally.ts` has two tiers and a false-positive corpus, and that is not timidity.**
   `sekali` also means "very", `once` also means "as soon as", and banning a bare `dua` would
   ban `dua kartu itu` — the `lagi` trap in a new costume. Every FAIL pattern is multi-word or
   anchored to `kali`/`times`. **It never runs at request time** (V3-11): M14 says a failed
   generation renders nothing, so a false positive in the route would delete the feature for
   that user with nothing on screen. A heuristic may fail a build; it may not fail a person.
4. **The window phrase is stripped before matching**, because `d666` is `666 hari terakhir` /
   `The last 666 days` and the prompt INSTRUCTS the model to say it. A naive `/\d/` fails a
   correct line on a reachable window.
5. **The collision paragraph names POSITIONS, not cards.** The plan writes it with the card's
   name and with `The Fool` spelled out; those would be the only card names in a system prompt
   that is otherwise pure rules (M10), and there is a test. The shadow collides with the pair
   **iff The Fool is in it**, since `x + 0 ≡ x (mod 22)` — proved exhaustively over all 462
   ordered pairs.

### Traps V3 paid for

- **`MEMORY_PROMPT_VERSION` WAS INVALIDATING NOTHING ON THE FREQUENCY SIDE, AND THE BUMP ALONE
  WOULD NOT HAVE FIXED IT.** The route computed
  `const fresh = cached?.fingerprint === result.fingerprint` then
  `if (cached && (fresh || stillTrue))` — and `fresh` short-circuits the `||` **without looking
  at `promptVersion`**. A user whose window had not moved since their last visit, which is most
  users on most page loads by design, would be served their `memory-v1` tally forever.
  `daily_summaries` was always fine: `isStale()` tests the version first. The decision is now
  one pure `verdictCacheState()` with the version check **hoisted above both branches**,
  verified by reverting to the old ordering and watching the test fail.
- **THE WORKED EXAMPLES WERE TEACHING THE FAILURE.** Four of the six recited a tally, and
  `summary.ts`'s own header says the example outweighs the description — so adding
  `DILARANG MENYEBUT JUMLAH` to the task text would have lost to the paragraph underneath it.
  All six rewritten, and a test runs `tallyProblems` over each.
- **ONE OF THE FIVE ANGLES ORDERED THE RECITATION OUT LOUD.** `Sebut saja jumlahnya apa adanya`
  meant one page load in five got a prompt INSTRUCTING the tally. All ten strings replaced; the
  rotation MECHANISM kept, because it is free and cache-coherent and the shadow varies the
  nouns rather than the stance.
- **NAMING LINES INSIDE `<riwayat-hari-ini>` MADE MARGARET REPRODUCE THE BLOCK.** V3's
  day-summary task text gained three paragraphs about `BERGEMA`, `BAYANGAN HARI INI` and the
  shape word, and never said what the OUTPUT is — so the block became a structure to emit.
  Indonesian Margaret echoed the whole thing back before her answer, twice out of two, once
  narrating *"Wait, I have to check the length."* **Every unit test passed throughout; only the
  smoke run saw it.** One paragraph per locale fixes it, and 103/106 words became 45/51.
- **FORBIDDING THE PULSE GLOSS's IMAGERY IS NOT THE SAME AS FORBIDDING ITS WORDING, AND ONLY
  ONE OF THEM IS RIGHT.** The gloss was being pasted verbatim in Indonesian, semicolon and all,
  so every pair reducing to 5 would have shown the same clause. Forbidding both wording and
  imagery pushed the Indonesian half into abstraction; forbidding the **wording** and allowing
  the **image** is clean. So **V1's `glosses.ts` does not need a short form** — V3's open
  question 4 is answered, the other way from how the plan guessed.
- **`berulang-ulang` MATCHED NOTHING** because only `berkali-kali` was on §7's list. Found by
  reading, not by the grep. **The grep is a floor, not a ceiling**, and both smoke runners say
  so in their closing note.

### The numbers, and what moves them

`FREQUENCY_MAX_WORDS` is **32** (was 25: three facts became five and one is a proper noun with
an article). `SUMMARY_MAX_WORDS` is **50** (was 45), and `summaryMaxWords('margaret')` is
**65** — VD19's multiplier read out of `budget.ts` so a reader's ceiling is written once.
**Neither ceiling is tightened on one favourable run**: across three runs the frequency lines
span 19–32, mean ≈ 25, and tightening to 28 on the best of them would be the mistake
`docs/provider-comparison.md` records about z.ai's famous `0.050`.

**`MARGARET_MULTIPLIER = 1.3` replaced the hand-set `spread3: 55` and reaches EVERY
reader-voiced ceiling**, because her length is a fact about the reader and not about one
service: spread3 55→52, daily 55→72, yesno 70→91, day summary 50→65. Ceilings only — a floor
scaled by verbosity would demand length rather than permit it. **The frequency verdict is
house voice (M6) and is unaffected.** Her three prompt snapshots in `build.test.ts` were
regenerated once after diffing line by line: only interpolated numbers moved, and Thessaly's
and Adrian's six are untouched, which is the evidence it was a budget change and not a persona
regression.

**Measurements are in `docs/plans/2026-07-27-mystical-verdicts.md` under `## Measured`.** Zero
tally failures and zero digits across thirty-six live generations, and a blind read
identifying 6 of 6 readers.

### Still open, and not V3's to close

- **`GET /api/memory/frequency` RETURNS 500 WHEN THE DATABASE IS DOWN**, not 204 — the route
  has never wrapped `firstPassingWindow`/`getVerdict` in a try/catch. User-visible behaviour is
  still correct (`FrequencyLine` discards anything that is not a 200). **Pre-existing W5
  behaviour, verified against a live dev server.** **`GET /api/memory/summary` HAS THE SAME
  SHAPE, measured by V5 on 2026-07-28** — `readingsOnDay` throws straight out of the route;
  `useDaySummary` discards non-200s so the deck stays at one panel (the M14 empty state), and
  nothing sensitive is in the log because the bound parameters are a `user_id` and a
  `local_date`. Fix them together; one omission in two files.
- **Whether the mysticism LANDS is not something V3 can verify.** Roadmap §9's first risk is
  that this reads as generated filler. The Shadow Arcana being a specific card the querent
  recognises is the mitigation and the smoke run is the check, but the real check is Miftah
  reading twelve lines.

## The reader swipe deck (V5)

V5 is done. On `/[reader]` the bio and today's summary stopped being two stacked paragraphs and
became two panels of one horizontal scroll-snap track. The summary **slides itself in once**,
on the first byte, and the querent can swipe back.

```
src/lib/swipeDeck.ts          PURE. panelIndexAt + shouldAutoSlide. The whole
                              auto-slide policy, and the only part `npm test` can reach.
src/components/SwipeDeck.tsx  'use client'. GENERIC -- N panels, the dots, the aria, the
                              once-only scroll. Knows nothing about readers, summaries,
                              fetching or analytics, so V6 and V7 can mount it.
src/components/ReaderDeck.tsx 'use client'. THE POLICY MOUNT. Owns the fetch, decides
                              there are 1 or 2 panels, fires the event.
src/components/DaySummary.tsx SPLIT into `useDaySummary()` and `DaySummary`.
```

**THE CALLER'S ARRAY LENGTH IS THE M14 CONTRACT.** One panel until the first byte, so a
querent who has not read today gets no dots, no affordance and a deck exactly as tall as the
bio — verified to the pixel at all 24 width × locale × reader cells. A deck rendering two
panels with the second one blank **is** the empty state roadmap §5 forbids, wearing a dot.

### The three things V5 measured that the plan had wrong

Each was invisible to unit tests and to a screenshot, and each was found by a harness under
`public/cards/`.

- **`html[data-still] .scroller` COULD NOT WORK, and the same trap will catch the next
  component that auto-scrolls.** A JS `scrollTo({ behavior })` **overrides** CSS
  `scroll-behavior` rather than defaulting from it, and `goTo` always passes one — so the
  screenshot hook had no say over the auto-slide at all. `goTo` reads `data-still` itself now;
  the CSS rule stays because it governs the scrolls the component does not make. Surfaced as
  `case=auto` settling at scrollLeft **2** of 358, because under Chrome's
  `--virtual-time-budget` a smooth-scroll animation advances one frame and stalls — it runs on
  the compositor clock, not the task queue.

- **THE DEPENDENCY LIST IS WHAT MAKES THE DECK SLIDE ONCE, not `slidTo`.** The plan's premise —
  "the summary streams, so the effect runs again on every chunk" — is false: `panels` is a
  fresh array per chunk but is not a dependency, and `arrivedPanel` is the constant `'summary'`
  from the first byte on. Five negative controls, table in `SwipeDeck.tsx`:

  ```
  deps                    slidTo    cleanup   slides
  [arrivedPanel, goTo]    absent    absent      1     <- plan expected 3
  + panels                absent    absent      3
  + panels                present   absent      1
  + panels                present   present     0
  ```

  `slidTo` and the absent `cancelAnimationFrame` are unobservable today and are the only thing
  standing between the querent and three slides, or none, the moment somebody adds `panels` to
  that list — which `react-hooks/exhaustive-deps` will never argue about either way, because
  the body reads `panelsRef.current`.

- **`@container (max-width: 339px)` WAS A VIEWPORT NUMBER IN A CONTAINER QUERY.** The deck is
  `.shell`'s content box — `viewport - 32px` — so a 360px phone has a **328px** deck and the 339
  breakpoint caught it, handing the most common Android width a reserve meant for 320. It is
  300.

### The height reserve, and the reason it is 6 and not 8

`--summary-lines: 6`, stepping to 7 below 300px of deck. The six real summaries from
`npm run smoke -- --summary` spread **191–372 chars**, four to eight rendered lines — and no
single reserve both covers the long ones and avoids a hole under the short ones.

**An 8-line reserve was tried, measured as better, and reverted after looking at it.** Sizing
to the longest of the six makes the deck perfectly stable and puts four blank lines between a
short summary and the dots — **on the panel the querent lands on**, since the deck auto-slides
to the summary. The measurement could not catch that: `_swipefit.html` reports dead space
against the **bio**, where five lines looked survivable because a querent only meets it by
swiping back. Growth during a stream is two or three reflows over a second; a hole is
permanent. **`min-height` and not `height`** is what lets a long summary cross it and grow the
deck one extra time, which is the accepted trade.

### Verifying it

```sh
BUDGET=250000 tools/dump.sh '/cards/_swipeshot.html?case=all'
for s in empty short typical worst; do for w in 320 360 375 390; do
  BUDGET=400000 tools/dump.sh "/cards/_swipefit.html?state=$s&w=$w"; done; done
PORT=3001 BUDGET=6000 tools/shot.sh '/cards/_sumshot.html?reader=thessaly&state=present' 500 760 /tmp/x.png
```

**`tools/dump.sh` is `shot.sh`'s sibling for harnesses that report in text** rather than in
pixels: a screenshot of forty PASS/FAIL lines cannot be grepped or diffed, and a line that
scrolls off is silently lost. Set `BUDGET` generously — the dump happens when the virtual-time
budget is exhausted, so a short one truncates the report at whatever line it reached, **which
looks exactly like a hang.** Both harnesses take a filter (`?case=`, `?state=&w=`) because
against a dev server the real compile waits eat the budget non-deterministically.

**`_swipefit.html`'s `short` body is the only case that can see the reserve at all.** Against a
372-char summary a 6-line and an 8-line reserve measure identically, because the panel is sized
by its own content either way. That is how a wrong value survives review.

**`npm run smoke` is unaffected and was not re-run for the readings**: V5 touches no file under
`src/lib/prompt/**`. `--summary` was run, for the real body lengths.

## History (V6)

V6 is done. `/history` lists the querent's own readings, filtered by day and defaulting to
today; `/history/[id]` reconstructs the draw exactly as it was — same cards, orientations,
slots, prose — **read-only** (VD14). And `ReadingView`, the one renderer three surfaces mount
(VD10), which **V7 builds against**.

```
src/components/ReadingView.tsx   'use client'. THE SHARED RENDERER. No session, no fetch,
                                 no @/lib/db import, and it never shows prose in a
                                 language the viewer is not reading.
src/lib/history/dates.ts         PURE, isomorphic. isHistoryDate, dayOffset.
src/lib/history/empty.ts         PURE. Which empty state, and which day to offer.
src/lib/history/types.ts         HistoryItem / ReadingDetail, reachable from the client --
                                 the only reason they are not in queries/history.ts.
src/lib/db/queries/history.ts    GAINED readingsForDay, historyDays, readingWithCards.
src/app/history/**               the list (reads nothing) and the detail (one awaited
                                 primary-key read).
src/app/api/history/{route,days/route,log}.ts
```

### `ReadingView`'s four rules, and why V7 cannot ignore them

Each exists because of the public mount. **Rule 4 is the one to protect: `ReadingView` NEVER
renders `reading.body` when `reading.locale` differs from the viewer's and no translation was
supplied — it renders the translating state instead.** That is the component's invariant and
not the caller's discipline, which is what stops V7 shipping the bug by forgetting a prop. The
other three: no session, no fetch, and no `@/lib/db/**` import *even as `import type`* —
`clientBoundary.test.ts`'s regex does not know the `type` keyword, which is why `ReadingStatus`
moved to `@/data/types`.

**The consequence V7 must act on: passing no `prose` for a foreign-locale reading leaves a
stranger on a pulsing spinner forever.** Deciding not to translate is legitimate; falling back
to the original silently is not.

### The five things a future session will otherwise undo

1. **`todayKey()` IS NEVER CALLED DURING RENDER.** It reads `new Date()`, which differs between
   the server render and client hydration, and React cannot patch a mismatch — the same class as
   `shuffleDeck()` in a `useState` initialiser. `HistoryBrowser` starts `today` and `selected` at
   `null` and sets them in an effect; nothing flashes because the pre-hydration render has no
   children. **Do not "simplify" it into `useState(() => todayKey())`.**
2. **`parseLocalDate` MUST NOT VALIDATE THE FILTER.** Its ±1-day bound answers "is this plausibly
   the querent's TODAY"; a history filter's entire job is days that are not today, so reusing it
   makes every date older than yesterday a 400 that reads like a client bug. `/api/history` uses
   `parseLocalDate` for the header and `isHistoryDate` for the query parameter.
3. **THE `blocked` FILTER IS SECURITY-ADJACENT, NOT COSMETIC.** A blocked reading has no card
   rows (R7), so there is no draw to reconstruct — and its `question` is text W7's classifier
   flagged, which W7 redacts from `moderation_flags` at 30 days; a permanently browsable copy
   under another column name undoes a retention promise. `failed` and `aborted` ARE shown,
   because R7 already counts them in the frequency verdict and two features disagreeing about the
   same past is the failure the memory workstream exists to avoid.
4. **THE LIST PAYLOAD CARRIES NO `body` AND NO `gist`**, and the integration test asserts it on
   the returned OBJECT (`'body' in item` is false), not on a null field — a query that fetched the
   column and dropped it has already put the prose in the payload. The binding reason is VD8, not
   bytes: Indonesian prose in an English client is forbidden whether or not anything renders it.
5. **`/history` IS GATED AND `isPublic()` MUST NEVER LEARN IT.** V7 makes a page public; this one
   is somebody's entire reading history, and the only reason `requireUser()` is not in `page.tsx`
   is that middleware already ran.

### Traps V6 paid for, and three places the plan was wrong

- **`intlTag('en')` IS `en-GB`, SO `formatTime` IS A 24-HOUR CLOCK IN BOTH LOCALES.** The plan
  promised `19.40 / 7:40 PM`; measured, `id-ID` gives `19.40`, `en-GB` gives `19:40`, only `en-US`
  gives the meridiem. Kept, because it is the same decision `formatDate` records — English here is
  day-first and spelled-month precisely so `en-GB` vs `en-US` never has to be settled for a date
  the user reads, and a meridiem reopens it for a time they read. A test asserts the absence of
  AM/PM at five hours in both locales.
- **`historyDays` DOES NOT WALK AN INDEX AND STOP AT THE LIMIT.** The plan said it did;
  **Postgres 16 has no loose (skip) index scan**, so `distinct` reads every index entry in range
  and the `limit` prunes the sort, never the scan. Measured over 200k readings across 200 users:
  Bitmap Index Scan on `readings_user_created_idx` — the OTHER `user_id`-leading index — 2000 rows,
  2.243ms. Left alone: the work is bounded by one person's own reading count, and an index-only
  scan would need `status` in the index, i.e. write amplification on the app's hottest insert path
  to save two milliseconds. `readingsForDay` does plan as advertised: Index Scan using
  `readings_user_local_date_idx`, 0.038ms.
- **THE TAP LAYER IS INSIDE THE SLOT BOX, WHICH DELETED ONE OF THE PLAN'S OWN TRAPS.** §3.5
  specified a separate absolutely-positioned row mirroring `Slots.module.css`'s geometry with a
  negative margin, and §8 then listed that duplication as a trap **with no possible automated
  guard**. `Slots` gained an optional `onCardTap` rendering a full-bleed `inset: 0` button inside
  `.box`, already `position: relative` for `CardFace`. It coincides with the box *by
  construction*; one copy of the numbers, nothing to drift. `boxRefs` became optional in the same
  change.
- **A SPARSE ARRAY, NOT `flatMap`, FOR THE DRAWS.** `Slots` reads `picks[i]`, so compacting the
  array on an unknown card id slides every later card one slot left — third card under the second
  slot's label, nothing on screen looking wrong. **Counting rendered images passes for the broken
  version**, which is how the first draft of the test passed against the bug it was written for.
  The test asserts per `data-slotbox` now, verified by negative control.
- **`translateStream` YIELDS THE SOURCE VERBATIM ON FAILURE, AND THE ROUTE RETURNS IT AS AN
  ORDINARY 200.** That is V2's deliberate choice, documented on `TranslateResult.fellBack` — but
  rendered as `translated` it is a direct breach of rule 4, arriving through the path that exists
  to prevent it. `HistoryDetail` detects it exactly and for free, because it holds the source: if
  what came back IS the source, no translation happened, and it resolves to `unavailable`.
- **`POST /api/translate` TAKES NO `targetLocale`, AND 204 IS A REAL ANSWER.** V2 resolves the
  target from `getLocale()` and never from the client; sending one is silently ignored, which is
  worse than omitting it. And `res.ok` is TRUE for the 204 V2 returns when a translation produced
  nothing — checking only `res.ok` leaves the screen on a spinner forever.
- **AN UNCAUGHT THROW IN A SERVER COMPONENT IS NEXT'S TO LOG, AND `logHistoryFailure` NEVER SEES
  IT.** Measured against a production build with the database unreachable: both routes printed
  `{ name: 'Error' }` as intended and `/history/[id]` printed postgres.js's whole error, statement
  and bound parameters. Nothing sensitive was in it — the parameters are two uuids, `'blocked'`
  and `1`, while `question` and `body` are columns rather than parameters — so the fix is a
  tightening, not a leak repair. The read is wrapped and a bare `Error` rethrown, so the boundary
  still renders. **`notFound()` there would be a lie**: it would tell the querent their reading
  does not exist because the database blinked.
- **THE EMPTY-STATE HELPER FOUND A BUG BY BEING PURE.** The nearest-day fallback was `days[0]`,
  which offers the SELECTED day back to itself whenever `days` is `[selected]` — reachable when
  the list request 503s while the days request succeeds. A button to the empty page you are
  already looking at. And `null` days are deliberately not `[]`: one is the network, the other is
  the querent, and telling somebody mid-load that they have never read would flash on every visit.

### Verifying it

```sh
npm test -- 'history'                 # dates, empty, cardById
npm test -- ReadingView               # resolveProse's truth table, and rule 4
npm run test:integration -- history.v6 # 23: the blocked filter, the id desc tiebreak,
                                       # ownership as a predicate
PORT=3002 BUDGET=150000 tools/dump.sh '/cards/_history.html?v=1'
PORT=3002 tools/shot.sh '/cards/_histshot.html?state=full' 500 1150 /tmp/h.png
```

**`public/cards/_history.html` (gitignored) is the one that matters.** It diffs **three
independent representations of one past draw** — the `alt` text on the detail screen, the
`card_id`s in the recorded `/api/history` response, and the thumbnails the list row drew —
because replaying the wrong hand is V6's version of the bug that once showed The Fool while
requesting id 15: the page would look perfect and be lying about the querent's own past. It also
checks that a chip tap writes `?date=` and pushes **no** history entry, that the list payload
carries no prose, and that each tap target is concentric with its slot box.

**Its first run failed twice, honestly, and both were the harness.** The tap geometry reported
88×133 against 90×135 — that is `.box`'s 1px border, since `inset: 0` positions against the
padding box, so the assertion is now concentric-and-within-the-border rather than equal. And
`body.textContent` matched `Kocok ulang` on a page with no reshuffle control: **`textContent`
includes `<script>` contents, and the RSC flight payload carries the whole serialized message
catalog on every page in this app**, because `LocaleProvider` is handed it as props. `innerText`
is layout-based and is what to use.

`public/cards/_histshot.html` (gitignored) stubs both `/api/history*` routes and screenshots four
states at a real 390px — a full day, an empty day for someone who has read, an empty day for
someone who never has, and the detail screen mid-translation. **`&locale=en` goes through
`POST /api/locale`, not `?lang=`** (the W6 trap: `?lang=` reaches the server render and not the
client fetches, so it would photograph one language of chrome around another language of
content). **`state=xlate` uses a REAL reading**, because the detail page is a server component
doing a primary-key read and a fabricated uuid 404s.

### Still open, and none of it is V6's to close

- **`readings.shared_at` is added by V6's migration and written by V7.** V6 only reads it, to
  render the badge without joining `share_links` per row. It stays null after a revoke,
  deliberately: "was this ever public" is a different question from "is it public now".
- **Whether the question belongs in the list row** is V6's open question 1 and is Miftah's call.
  It ships, clamped to one line, because it identifies a reading far better than three card names
  do and it is the querent's own text on their own screen behind their own login. The
  counter-argument is real: a history list gets scrolled in public.
- **`/api/memory/{frequency,summary}` still 500 when the database is down**, recorded above. V6's
  routes 503 and its page scrubs.

## Sharing (V7)

V7 is done. **`/s/<12 chars>` is the first URL in this project's history that a person with no
account, no session and no relationship with us can open.** A stranger sees the reading exactly
as the querent saw it, with a *Try It Yourself* button underneath.

```
src/lib/share/slug.ts      PURE, CLIENT-IMPORTABLE, NO `process.env` EVER. Crockford
                           base32, `byte & 0x1f`, the entity union.
src/lib/share/types.ts     PURE. PublicReading / ResolvedShare. Client-reachable, so no
                           `@/lib/db` specifier -- not even `import type`.
src/lib/share/links.ts     server-only. create / resolve / revoke, sharingEnabled,
                           shareOrigin, shareUrl. Dynamic `import` of the client.
src/lib/db/queries/share.ts  handle-first. Every MUTATION carries `userId` in its `where`,
                           and `revokeAllForUser` is V8's to call.
src/app/api/share/route.ts   POST mint, DELETE revoke. Session required.
src/app/s/[slug]/          page, not-found, adapt.ts, ShareViewed, the OG image
src/components/ShareFooter.tsx   the control + the sheet. Mounted on the draw screen and
                           on `/history/[id]`; V8 adds `/account`.
src/components/TryItYourself.tsx  the stranger's CTA. An `<a>`, never a Link.
tools/share-seed.ts + tools/share-check.py   the live checks.
```

### THE QUESTION IS ON THE PUBLIC PAGE, AND THAT REVERSES VD9

**Miftah's ruling, 2026-07-28.** VD9 made `readings.question` opt-in and defaulted it off,
because it is the querent's own typed text and a shared page is public forever; the roadmap's
risk table calls a leaked question *"the single highest-consequence bug in this release"*. The
ruling is that **the question is part of the reading**: a stranger who sees three cards and four
paragraphs with no question cannot tell what any of it is about, and a shared reading nobody can
follow is not worth sharing.

What changed: `share_links.include_question` defaults to `true` (migration `0004`), and the share
sheet no longer offers a switch. **What did NOT change, and must not:**

- **The OG preview image still carries neither the question nor the prose (VD18)** — and this got
  MORE important, not less: a page is opened by somebody who chose to, while a preview image is
  cached by every messenger that merely *sees* the link, before anybody clicks.
  `page.contract.test.ts` asserts the OG route reads no `question`, no `.body`, no `nickname`.
- **`publicReadingQuery` still builds its projection conditionally**, and the `.toSQL()`
  assertions still run. They no longer guard the default; they keep the *capability* to exclude
  the column real, which is the mechanism if this is ever revisited.
- **The sheet still previews the real page**, now the ONLY consent mechanism for the question
  rather than one of four. The querent reads the exact text before the link exists, above a line
  of copy saying it goes public.
- **`include_nickname` keeps its switch.** A nickname is a name rather than context, and nothing
  in the reading depends on it.

### The four traps a future session will otherwise walk into

- **RE-SHARE ROTATES THE SLUG. DO NOT "SIMPLIFY" IT TO `revoked_at = null`.**
  `unique (user_id, entity, entity_id)` meant one row per artifact forever, so un-revoking is the
  obvious one-line version — and it **resurrects a capability the querent deliberately killed**:
  the old URL, sitting in the group chat they revoked it because of, starts working again,
  silently, for whoever still has it. `insertOrRotateShareLink` assigns a fresh slug; the
  integration test that catches a regression is the one asserting the OLD slug stays dead.
  **NARROWED 2026-07-28: the key now carries `locale`, so rotation happens WITHIN one
  language and a second language is a second row.** The trap above is unchanged for a
  re-share in the same language, which is the only case it was ever protecting. See
  `## Share links, one per language (2026-07-28)`.
- **`currentUser()` IS NEVER CALLED ON `/s/[slug]`, AND `curl` CANNOT SEE THE FAILURE.** A client
  component reaching for a session context renders correct HTML on the server and throws during
  hydration: `curl` reports 200 with the reading in the body and the page is dead in a browser.
  Verified with loop 5 against a FRESH profile — `__reactFiber$` present on `<main>`, `whoami`
  reporting signed OUT. `page.contract.test.ts` fences `currentUser`, `requireUser`,
  `ViewerProvider`, `useViewer`, `cookies()` and `@/lib/auth/*` across the whole subtree.
- **THE HEADERS MUST STAY `SAMEORIGIN` / `frame-ancestors 'self'`.** A security review of a
  newly-public page will say `DENY` and `'none'`; both would kill the iframe harnesses under
  `public/cards/` while blocking nothing SAMEORIGIN does not. V7 adds a `/s/:path*` block to
  `next.config.ts` and **that block sits AFTER the catch-all on purpose** — Next applies every
  matching entry and a later one with the same key wins, which is what makes
  `referrer-policy: no-referrer` override the global `strict-origin-when-cross-origin` on `/s/`
  and only there. Reversing the two entries is a silent no-op that reads as correct;
  `headers.test.ts` asserts the ordering. Measured on the wire: exactly one `referrer-policy`
  value comes back, and it is `no-referrer`.
- **`ImageResponse` RASTERIZES LAZILY, SO A `try`/`catch` AROUND IT CATCHES NOTHING.** The plan
  said the OG route was "wrapped, so a fetch failure degrades rather than 500s". It was not:
  `new ImageResponse(...)` returns immediately and satori runs when something reads the body, so
  the throw escaped the handler and Next answered 500 — **while a revoked slug answered 200, which
  IS the slug oracle the design forbids.** `rasterize()` reads the body to completion inside the
  `try`. Found by fetching the route, not by reading it.

### Two more findings, both measured rather than reasoned

- **SATORI THROWS ON `transform: undefined`.** `transform: reversed ? 'rotate(180deg)' :
  undefined` is the natural way to write it and it takes down every UPRIGHT card, which is most of
  them. Spread the property instead. Invisible to `npm run typecheck` and `npm run build`; the
  only symptom is a broken preview in somebody else's chat.
- **SATORI CANNOT DECODE WEBP, AND EVERY CARD IN `public/cards/` IS WEBP.** Its allowed list, read
  out of the vendored bundle, is `[png, apng, jpeg, gif, svg+xml]`; `image/webp` is *detected* and
  then thrown on. `tools/normalize_cards.py` therefore emits a THIRD format,
  `public/cards/og/<slug>.png` at 200×300, palette-quantized, 1.1MB for 22 files, committed like
  the other two so the deploy still needs no Python. It inherits `/cards/*`'s one-year `immutable`
  header — one more directory covered by the warning about regenerating the art.

### `ReadingView` gained a fifth prose state, and rule 4 is intact

**`{ kind: 'as-written' }`.** Reconciliation §5.5 told V7 to pass `prose={{ kind: 'original' }}`
and **that does not work against V6's shipped component**: `resolveProse` deliberately treats an
explicit `original` exactly like an omitted prop, with a test named for it, so following the
instruction literally would have shipped the pulsing spinner it was written to prevent — forever,
for a stranger, with nothing failing and nothing logged. Found by reading that function, because
the page LOOKS correct in Indonesian.

`as-written` says the decision out loud: the prose stays in its own language and the caller has
decided that. Rule 4 is untouched — an omitted `prose` still yields the spinner, and V6's truth
table did not lose a line. **Do not use `{ kind: 'translated' }` for this**: it renders
identically and would record in the type that a translation happened when none did.

The honesty a viewer needs is restored by CHROME, not by prose: `share.public.otherLanguage` on a
mismatch, plus `lang=` on the paragraph. **The public route must never generate anything** — VD8,
and since V9 a model call is the app's scarcest resource rather than a cost.

### Design A: the link carries the language it was shared in (2026-07-28)

**The paragraph above used to end `lang={reading.locale}` and the section used to say the body is
NEVER translated.** `share_links.locale` now pins the locale the sharer was reading and the
resolver READS that `translations` row. Full argument in
`docs/plans/2026-07-28-share-live-locale-design.md`. Four things cost something to learn:

- **THE MEASURED LATENCY COST IS ZERO, AND THAT IS AN ORDERING FACT RATHER THAN LUCK.** `/s/` was
  already three sequential DB round trips. The translation read joins `publicReadingForShare`'s
  `Promise.all` — both keyed off `link.entityId`, neither needing the other — and
  `shareLinkBySlug` has already woken the Neon compute. **The lookup is skipped only when nothing
  was pinned, never on a comparison against `reading.locale`:** that comparison needs the reading
  first, which serialises two reads to save one round trip on an open connection. A pin equal to
  the source finds no row and falls through, which is the same answer more cheaply.
- **THE ARGUMENT `adapt.ts` GAVE AGAINST THIS WAS HALF RIGHT, AND THE HALF THAT BINDS IS A CLIENT
  CHANGE.** "Reading an existing `translations` row would make the sheet's *exactly what they will
  see* a lie" holds against a *viewer-adaptive* page, and holds against design A too **until
  `ShareFooter` previews the host's prose.** It did not: `HistoryDetail` passed `preview={reading}`
  and `previewReadingView` hardcoded `as-written`, so `reading.body` — the ORIGINAL — was the
  preview. Ship the server half alone and the sheet shows Indonesian under a link that shows
  English. `previewReadingView` maps the five states rather than passing them through, because
  `translating` and `unavailable` will have no row for the resolver to find.
- **A CONTRACT TEST THAT PASSED ON ITS FIRST RUN.** The assertion that the mint resolves the pin
  from `getLocale()` was written file-wide and went green immediately — the route had resolved
  `getLocale()` for the analytics context since W4. It now slices `createShareLink`'s argument
  list. **A source-level contract test over a large file is the easiest place in this repo to
  write a vacuous assertion**, which is why `page.contract.test.ts` opens with a
  "nothing below passes vacuously" case.
- **THE FIXTURE PROVED NOTHING ON THE FIRST RUN, AND THE PAGE LOOKED RIGHT WHILE IT DID.**
  `share-seed.ts` takes the most recent shareable reading; `db:seed` writes both locales, so the
  first fixture pinned `en` onto an `en` source — a translation of English into English, a row
  that cannot exist in production. The page rendered the sentinel and the notice behaved, for the
  wrong reason. Found by querying the seeded row's `locale` **after** reading the output. The
  script now forces `locale = 'id'` as part of the fixture.

Observed live at 390px, all four cases — row 3 is the guarantee that a link minted before this
shipped renders exactly what it rendered yesterday:

```
pinned  viewer  prose        body lang  notice
en      en      translation  en         no
en      id      translation  en         YES     <- the case design A does NOT fix
NULL    en      source       id         YES     <- pre-existing links, unchanged
NULL    id      source       id         no
```

**The nickname was a consent gap, not a cosmetic defect.** `Draw.tsx` mounted `ShareFooter` with
no `nickname` prop for two workstreams, so the toggle read `disabled={... || !nickname}` and was
dead — while its state stayed `true`, so the mint posted `include_nickname: true`, the resolver
projected the column, and the public page rendered a nickname the sharer could not switch off and
that `nicknameLine` (`includeNickname && nickname`) had left out of the preview entirely. **Fixed
in both halves, because either alone still lets the wire claim a consent that never happened:**
the draw page fetches the nickname (one indexed read — the build output confirms every route was
already `ƒ`, so nothing became dynamic), and `effectiveIncludeNickname` sends `false` for a
nickname nobody was shown. **The generalisation: a disabled control keeps its state, so any
`disabled` on a form that posts must be paired with the value the post actually sends.**

### Verifying it

```sh
npm test -- 'share|slug|adapt|gate|headers|legal'   # 1489 total, unit
npm run test:integration -- share                   # 27: rotation, the .toSQL()
                                                    # assertions, the orphan case,
                                                    # and the three locale-pin cases
# The live loop. `tools/share-check.py` reports 17 PASS/FAIL lines.
npm run db:up && npm run db:seed && npx tsx tools/share-seed.ts
SHARE_BASE_URL=http://localhost:3003 PORT=3003 npm run dev
python3 tools/share-check.py http://localhost:3003
curl -s -D - -o /dev/null http://localhost:3003/s/aaaaaaaaaaaa | grep -iE 'robots|referrer'
curl -s -o /tmp/og.png http://localhost:3003/s/aaaaaaaaaaaa/opengraph-image  # THEN LOOK AT IT
```

**`SHARE_BASE_URL` MUST MATCH THE PORT THE DEV SERVER IS ON, or the OG image comes back with no
card art and no error.** `shareOrigin()` falls back to `AUTH_URL` (`localhost:3001`), and satori
logs `Can't load image … fetch failed` and renders the layout without the pictures — a 200, a
plausible PNG, and no art. 65KB against 387KB for the real thing is the fastest way to tell them
apart.

**`tools/share-check.py` strips `<script>` before grepping, and that is not cosmetic.** The RSC
flight payload carries the whole serialized message catalog on every page, so a grep over raw HTML
matches copy the page never drew — the same trap V6 recorded for `textContent`. **The 404 case is
the exception and takes the WHOLE response:** `notFound()` from a `force-dynamic` page streams
`not-found.tsx` in a later chunk, so slicing to `<body>` reported "the gone page does not render"
against a page that renders perfectly. It scopes to CSS-module class names (`goneTitle`) instead,
which only ever appear in markup the renderer emitted.

### Still open, and none of it is V7's to close

- **`share.viewed` has not been OBSERVED firing.** The code path is `track.client`'s ordinary
  batcher and the props are asserted in `page.contract.test.ts`, but the CDP recorder was started
  after the page had loaded and captured no `POST /api/events`. Worth one deliberate check before
  launch.
- **TWO `authjs.*` COOKIES REACH A THIRD PARTY, AND THE FIRST DRAFT OF `/privacy` §4.4 SAID
  OTHERWISE.** Miftah's security amendment asked for no cookie at all on `/s/`; `jmt_locale` IS
  excluded from middleware's write, and measuring the real response then showed
  `authjs.csrf-token` and `authjs.callback-url` on every matched path, `/terms` and `/login`
  included. They are @auth/core's, set by the middleware wrapper before any of our code runs, and
  neither carries an identity — so the clause names them instead of omitting them. **Suppressing
  them would mean bypassing the `auth()` wrapper for `/s/`, which is W2's file and a real blast
  radius.**
- **`readings.shared_at` is written on the FIRST mint and never cleared.** V6 reads it for the
  history badge; `share_links.revoked_at` answers "is it public now".
- **`translations` was missing from `resetDb()`'s TRUNCATE list** — V2's omission, added alongside
  `share_links`. The list is exhaustive on purpose: a forgotten table shows up as leaked state
  rather than as a query bug.
- **A fifth sweep delete, for `share_links` whose `entity_id` no longer resolves.** Harmless today
  (the resolver 404s) but they hold a `unique (user_id, entity, entity_id, locale)` slot forever
  and make `view_count` meaningless. W7 owns the route; V2 already added a fourth.
- **`personas` does not exist**, so `'persona'` is a live value in the union that resolves to null
  — inert, exactly as V2 left `'persona'` in the translation registry. `publicPersonaForShare`
  names what V8 replaces it with, and it cannot be written speculatively: `to_regclass` cannot
  guard a relation from inside the statement, because Postgres resolves relations at PARSE time.
- **No resolve cache is shipped.** `SHARE_RESOLVE_CACHE_MS` is `0` and its comment says what
  turning it on costs: a window in which a revoked link still resolves. Somebody should decide the
  acceptable window *before* the night it is needed.


## `/account` and the Inner Heavenly Lotus persona (V8)

The button `/privacy` §8 described for a whole release, and the four blocks
requirements 1–4 asked for. Deletion first, because that is the order in which it
actually gets built.

### The three defects a green build and 1,579 green tests did not notice

All three were found by loading the page. Recorded together because they are one
lesson: `npm run build` type-checks a page and never renders it.

- **`next/image` REFUSES A LOCAL `src` CARRYING A QUERY STRING** unless
  `images.localPatterns` allows it, and `next.config.ts` configures no `images`
  block at all. `cardThumb` appends `?v=<ART_VERSION>` — which is the whole cache
  story for `/cards/*`, served `immutable` for a year on non-content-hashed
  filenames — so an `<Image>` threw *Image with src
  "/cards/thumb/08_strength.webp?v=3" is using a query string which is not
  configured* at request time and took `/account` to a 500. The fix is a plain
  `<img>`, which is `CardFace`'s own rule for a second reason: these are already
  optimized WebP at exactly the two sizes we draw them at, so the optimizer has
  nothing to improve and would add a serverless invocation per card.
- **A DOUBLE FULL STOP, TWICE, IN TWO FILES.** `topCardLine` and
  `fallbackPersona` both spliced a gloss after a colon and appended `.` — and
  every gloss in `cards.json` and in `glosses.ts` is already a whole sentence.
  `lines.ts` was caught by its own unit test; `fallbackPersona` was caught by
  reading `/api/persona`'s output, because no test asserted the punctuation of a
  string it only checked for safety. Both now use a `stop()` helper that checks
  first, so a future gloss written *without* terminal punctuation still lands.
- **`Tandamu scorpio, unsurnya water`.** The sign and element enums rendered
  lower-case in reader-facing prose and read as two untranslated column values.
  The *values* stay English in both locales — `## Localization` rule 1 — but a
  proper noun in prose is capitalised in both languages, and lower case is
  exactly what makes an enum look like an enum.

### Two near-misses that would have cost a correct persona its body

Both are in `personaSafetyCheck`, and both are the shape of check that fires on
correct output.

- **CARD NAMES ARE STRIPPED BEFORE THE NAME CHECKS.** The contract *requires* the
  life-path arcana's English name, so a querent nicknamed `Star`, `Moon`, `Sun`,
  `World` or `Fool` — or whose onboarding answer capitalised any of those — would
  have had every generation rejected and would only ever have seen the fallback.
  **Silently**, because `persona.generated.fallback` is a rate and one user is not
  a trend. `withoutCardNames()` is applied to the nickname check and the
  proper-name check and deliberately to nothing else: the banned, tic, Malay,
  bracket, length and pronoun checks have no legitimate overlap with a card name,
  and narrowing a check that does not need it is how a check stops binding.
- **THE TIC CHECK IS CASE-SENSITIVE PER CHARACTER, NOT PER PHRASE.** A
  whole-phrase rule gets `the Universe` wrong in *both* directions:
  case-insensitive fires on "you live in the universe of small decisions", which
  is ordinary English; fully case-sensitive misses "The Universe keeps handing you
  this" at the start of a sentence, which is precisely the mystical usage. That
  was the first draft and its own test caught it. `vocab.ts` writes the capital U
  deliberately — the capitalisation *is* the distinction between the deity and the
  noun — and `ticRegex` encodes that instead of approximating it. Every
  all-lowercase entry is unaffected.

### `enable_seqscan = off` is how you assert an index serves a predicate

A12 claims `reading_cards_user_date_card_idx` — `(user_id, local_date, card_id)`
— serves an unbounded per-user aggregate through its leading column, so no second
`(user_id, card_id)` index is needed. The naive test asserts the `explain` plan
names the index, and it **failed**: at forty rows the planner chooses
`Seq Scan on reading_cards` and is *right* to, because the whole table is one page
and no index beats reading one page.

The claim is about the index's *usability*, not about the cost model at toy scale.
`set local enable_seqscan = off` is exactly how you ask that question, and the
measured plan is in `allTime.ts`'s header. An assertion that fails for a reason
that is not a defect is an assertion people delete.

### `ERASURE_GRACE_DAYS` moved, and the client fence is why

The constant lived in `queries/profile.ts`, reachable by the sweep, the sign-in
restore, `/privacy`'s facts table and `deleteAccount` — and by **none** of the
places that show the number to a person, because `clientBoundary.test.ts` forbids
a client component importing `@/lib/db/**` and the confirmation sheet says "for 30
days you can still get it back".

The alternatives were both worse: hardcode `30` in the copy path, which is the
drift the constant was exported to prevent, or relax the client fence for one
integer. So it became `@/lib/account/grace.ts`, a dependency-free leaf, with
`queries/profile.ts` **re-exporting** it — the same treatment V2 gave
`translate/keys.ts`. Do not "clean up" the re-export by repointing the server call
sites: it is what makes this a move rather than a fork, and `profile.ts` is where
somebody reasoning about the restore window will look.

### The deletion round trip, verified live

Driven in a real Chrome at a true 390px against the dev server, with a seeded
`moderation_flags` row still holding text and two live `share_links` rows — one
the querent's, one another user's:

```
tap "Yes, delete my account"
  -> 200, Set-Cookie clearing the session by name
  -> location.assign('/login?deleted=1'), goodbye line rendered
  -> users.deleted_at            set
     moderation_flags.question   NULL, redacted_at stamped
     share_links (mine)          revoked_at set
     share_links (another user)  UNTOUCHED
  -> POST /api/auth/dev-session  { outcome: "restored" }, deleted_at NULL again
```

**The revoked link stays revoked after the restore, and that is correct.** The
account comes back; the URL the querent deliberately killed does not. Re-sharing
rotates the slug (V7's rule), so there is no path by which an old address starts
working again — which is the safer direction and is worth knowing before somebody
reads it as a restore bug.

**The sheet, measured in the same run:** the dialog itself takes focus (not a
button — Chrome puts `:focus-visible` on programmatic focus, so focusing a button
would put a gold ring on one of two choices on a destructive sheet),
`aria-modal="true"`, `document.body.style.overflow = 'hidden'`, and **both buttons
exactly 44px** — `AccountMenu`'s `.close` measured 43.99 with the same padding and
a 10px Cinzel line box, which `_accountshot.html` correctly flagged.

### The 390px screenshot found a control that read as a heading

The facts editor's `Change` button was borderless Cinzel micro-caps in `--muted` —
**identical in treatment to the `FACTS` and `YOUR CARD` section labels directly
above and below it** — so the only control in the block read as a heading for
nothing. `AccountAnswers`' `.clear` had a border from the start and read correctly
in the same shot, which is what made the comparison obvious. Neither a unit test
nor a typecheck can see this; it took one look at the whole page.

### `npm run smoke -- --all` is unaffected, and that was proved rather than assumed

V8 edits `sanitize.ts` (a sixth delimiter) and `lotus.ts` (five `export`
keywords), both of which sit on the reading path. The nine Indonesian readings
came back with four FAILs — two word ceilings, one total, one card name — and
"that is model variance" is a claim, not a check.

**The check: hash all eighteen assembled prompts on both branches.** A throwaway
`scripts/_dumpprompts.ts` walking 2 locales × 3 readers × 3 services through
`buildPrompt` with a fixed hand, a fixed question and a fixed Lotus block:

```
clean question       main 5ffbd3d3… 103790 bytes   branch 5ffbd3d3… 103790 bytes
question containing  main 2d43a1b6… 103916 bytes   branch d27557cc… 103754 bytes
  "</sosok>"
```

Byte-identical for ordinary input; 162 bytes shorter when the question contains
`</sosok>`, which is the new fence doing precisely its job. So the four FAILs are
pre-existing, and the technique is worth reaching for again: **a prompt-layer edit
can be proved inert by hashing the assembly, which costs no model calls.**

### The persona, measured

First two real runs, `glm-4.6`, 2026-07-28:

```
id   59 words / 4 sentences / 383 chars   accepted    3.1s TTFT
en   90 words / 4 sentences / 514 chars   accepted   10.8s TTFT
```

Ceilings are 4 sentences and 95 words. Both named `The Chariot` exactly, neither
greeted, neither offered help, neither carried a name, a date or a gendered
pronoun. **Two calibration findings, recorded rather than acted on, because the
rule for the reader paragraphs applies here too — do not tighten on one run:**

1. **The Indonesian body spent two of its three sentences on `partner`** instead
   of one per facet in order. The English body got the order right
   (partner → growth → caution). If it recurs, the fix is the `BENTUK:` clause,
   not the code.
2. **The English body paraphrased the Lotus abstraction** — "the heavy memory of
   early loss" — where the contract asks it to *sharpen* rather than retell. This
   is not a D10 breach: the incident itself is nowhere near it, and the Lotus
   summary is already the safe abstraction that `lotusSafetyCheck` passed. But it
   is the boundary the contract names, and it is the sentence to watch on a page
   V7 can make public.

### Nine smaller things, each of which will otherwise be undone

- **`personaInputHash` HAS NO LOCALE, DELIBERATELY.** If it did, tapping `EN`
  would regenerate the persona and replace the prose the querent just read — and
  V2's translation, whose entire purpose is that switch, would never be used.
  `personas.facts` stores V1's locale-free `PersonNumbers` for the same reason.
- **THE STALENESS THROTTLE IS ON THE READ PATH AND NEVER INSIDE THE GENERATOR**
  (A13). `input_hash` covers the last ten reading ids, so it moves after every
  draw; without a floor, opening `/account` after a reading always pays for a
  model call. A throttle on the *reader* is a latency decision; a throttle inside
  the *generator* is W3's swallowed answer-edit bug. A **source-version** mismatch
  is not throttled at all — that is a deploy, happens once, and must reach
  everybody.
- **IDEMPOTENCE IS CHECKED ON THE HASH *AND* THE LOCALE.** Without the locale
  clause a stored `id` body satisfies a request to write the `en` one, and the
  wrong language stays stored forever.
- **`personaMaterial` NARROWS `lotus_avatars.traits` AT READ TIME.** `schema.ts`
  types `color` as `string | null` on purpose (it keeps W3's unions out of
  itself), and jsonb is not validated by Postgres — so a value outside the closed
  set would reach `COLOUR_LABEL[locale][colour]` and interpolate `undefined` into
  a prompt. Tested with `chartreuse`.
- **`generatePersona` HAS NO COOLDOWN AND NO IN-PROCESS CACHE, AND BOTH ABSENCES
  ARE THE DECISION.** `lotus.generate.ts` has a cooldown because the *reading*
  path fires a speculative repair; that path does not exist here. `getLotusBlock`
  has a cache because a *reading* needs its block on the request path; nothing
  here is.
- **A CLEARED ANSWER REGENERATES THE PERSONA TOO**, ordered after the Lotus
  because the persona reads the Lotus summary. `getLocale()` is resolved *before*
  the `after()`: it reads the request's forwarded header, and an `after()`
  callback runs once the response is on its way.
- **`answerPresence` DECRYPTS NOTHING.** It reads `answer_text IS NOT NULL` — the
  same predicate as the audit query in `schema.ts` — and there is no reveal
  control anywhere on the page, so `worst_thing`'s plaintext never leaves the
  server. V8's answer to reconciliation §7.3's "without showing their decrypted
  text until asked" is that it is never asked.
- **THE DELETION EVENT'S THREE FACTS ARE READ BEFORE THE TRANSACTION.** `readings`
  and `personas` both cascade at the *hard* delete, so reading them afterwards
  works today and silently starts reporting zeroes the day anybody makes it hard.
- **A source-level test asserts the transaction's ORDER** — revoke → redact → set
  the flag. The runtime test proves the rollback with a `pg_temp` trigger; the
  source test is what stops somebody keeping it green by refactoring the redaction
  out of the transaction. Its first draft **failed on `delete.ts`'s own doc
  comment**, which explains at length why `clearFreeTextAnswers()` is absent —
  parentheses and all. Comments are stripped first, the lesson
  `queries/contract.test.ts` and `clientBoundary.test.ts` both already record.

### Still open

- **`GET /api/persona` returns 500 when the database is down, not 204.** The
  client renders its retry affordance so the user-visible behaviour is correct and
  nothing sensitive reaches the log, but it is the same omission
  `/api/memory/frequency` and `/api/memory/summary` carry. Fix all three together.
- **V2's translator is not wired to the persona.** A foreign-locale body is served
  as written and labelled in chrome, with `lang` set to the body's own locale —
  `ReadingView`'s `{ kind: 'as-written' }` decision, made for the same reason.
  `translateOnDemand('persona', userId, 'body', …)` is the next step; the registry
  entry and the sweep's fourth delete already cover `'persona'`.
- **V7's persona share page is not built.** V8 exports `readPersonaView` and the
  presentational `PersonaBlock` for it; `'persona'` is still a live union value in
  `share/slug.ts` resolving to null.
- **`PERSONA_MIN_AGE_SECONDS=3600` IS A GUESS AND NOT A MEASUREMENT.** It decides
  how often a heavy user pays for a model call, and it cannot be calibrated before
  there is a heavy user.
- **`account.details_viewed` always reports `from: 'direct'`.** The prop's whole
  point is telling a bookmark from the menu, and doing that needs a referrer check
  in the browser that V8 did not write. One prop, one component.
- **No `_accountshot.html` iframe harness.** Loop 5 covered every question V8 had
  — a true 390px, real taps, a real session, the request bodies — so the harness
  was not written. The one thing it would add is the patched-`fetch` check that
  `DELETE /api/account` carries no nickname in its body; V8 verified that by
  reading the route, which sends no body at all.

---

## Five phone-found fixes on `/account` and `/s/`, 2026-07-28 (post-V8)

Miftah read both pages on an iPhone the day V8 and design A landed and reported five
things. Four of them **reverse a decision the code argued for in a comment**, which is why
each one is recorded with the argument it beat rather than as a changelog line. The branch
is `feat/v9-account-polish`, cut from `origin/main` at `e884b4b`.

### 1. The other-language notice is deleted, and CLAUDE.md said it must not be

`share.public.otherLanguage` and `isForeignProse` are gone. **CLAUDE.md's V7 section said
in capitals "THE NOTICE SURVIVES AND MUST NOT BE DELETED"** and `adapt.test.ts` carried a
test named for keeping it alive — so this is an amendment, not an oversight, and the
overturned argument is worth having in front of whoever reads it next.

The notice's argument was: an English-pinned link opened by an Indonesian reader is a
genuine mismatch, and a stranger meeting foreign prose under their own chrome deserves an
explanation. What overturned it is that **design A changed what the page shows underneath
a sentence describing the old mechanism.** Before design A the page rendered whatever
language the reading was *generated* in, and "this reading was written in another language
and is shown as it was written" was a true description of that. Design A pins the language
the **sharer was reading**, so the sentence now describes a mechanism that has stopped
running, and it fires only on the residue: a NULL pin (every link minted before design A),
or a viewer who reads neither. Miftah's own report was exactly that — *"this shared page
shows in the language the user had set when he created the share link, not the language the
card was predicted in"* — which is the feature working and the sentence lying about it.

**What carries the honesty now is `lang={shownLocale}` alone**, and that raises its stakes:
it is the only thing left declaring the prose's language to a screen reader and to the
browser's own translate offer. `page.contract.test.ts` still asserts it, and now also
asserts `viewer` does not appear in the page at all — the notice was the only consumer of
the viewer's locale *as a value*, and a page that reads it again is a page that branches on
who is looking, which the header's cache-key argument forbids independently.

**Three tests were INVERTED rather than deleted**, which is the part worth copying. A
deletion with no test leaves the codebase with no record that the absence was chosen, and
the failure mode of removing a paragraph of chrome is somebody adding it back in six
months. So `adapt.test.ts` gained a `describe('the other-language notice is gone')` that
asserts the adapter's export list exactly, that the catalog key is absent from **both**
locales, and that `lang={shownLocale}` survives.

**`account.persona.otherLanguage` is a different key on a different page and still
renders.** V2's translator is not wired to the persona, so `/account` genuinely does show
a foreign-locale persona as-written and label it. Deleting that one by association would
reintroduce the unexplained-prose problem the `/s/` notice was written for, on the one page
where the original argument still holds.

**Verified live**, dev server + loop 5 + `npx tsx tools/share-seed.ts`, against the
EN-pinned fixture `/s/bbbbbbbbbbbb` on an `id` reading:

```
Accept-Language: id-ID   lang wrapper: en   body: "SENTINEL-EN …"   notice: absent
Accept-Language: en-GB   lang wrapper: en   body: "SENTINEL-EN …"   notice: absent
```

**A `curl | grep` FOR THE NOTICE TEXT IS A FALSE POSITIVE AND COST A MINUTE.** Both
locales' full message catalogs are serialized into every page as `LocaleProvider`'s props,
so `grep 'written in another language'` matches the flight payload —
`account.persona.otherLanguage` — on a page that renders no notice at all. The first check
reported the notice present in both locales and the code was correct. **Grep the rendered
text (loop 5's `text` verb) or the CSS class name, never the message.**

### 2–5. `/account`

- **A way out.** The page had none: the account circle opens a sheet, and the only
  `href="/"` was inside the three empty states, so a querent *with* a card, a reader and a
  persona could leave only via the browser's back button — and in a home-screen standalone
  instance there is no visible back button. `history.home` reused rather than a new key.
  No negative `margin-top`, unlike `/history`: this `.shell` has 64px of top padding that
  V4 measured against the fixed account circle, and stealing 8px back erodes it.

- **`account.facts.nickname` is "Nickname", reversing its own comment.** The comment said
  *"What you are called" rather than "Nickname": the questionnaire asked what the reader
  should call them, not for a handle.* Correct about register, and it lost to
  `AccountFacts.module.css`'s `.label { text-transform: uppercase }` — five words became
  `WHAT YOU ARE CALLED` and wrapped to **two rows** beside a one-word value, on a phone.
  A label that wraps where the two rows either side of it do not reads as a layout bug, and
  the nuance it bought is invisible to anybody who never saw the other version. The
  Indonesian `Nama panggilan` is unchanged and never had the problem.

- **The card wears its name and opens a zoom** (`AccountCard.tsx` + its CSS module). The
  old comment argued `CardFace` was *"deliberately NOT reused: it draws the card's name
  over the art at small sizes, and the sentence beside this image already names it"* — the
  same de-duplication argument `CardDetail` makes for suppressing the caption at
  `size="full"`. It lost twice over: the sentence names the card **mid-clause, in prose**
  (`Your Inner Lotus takes the form of The Star`) rather than as a label on an object, and
  **every other 88x132 card in the product wears its name**, so the one that did not read
  as the one that failed to load its label. At that size the art is unreadable, which is
  the exact reason `CardDetail` exists on the draw screen and in `ReadingView`.

  **The `next/image` constraint that comment recorded is UNCHANGED and is satisfied rather
  than dodged.** `cardThumb` appends `ART_VERSION` as a query string; `next/image` refuses
  a local `src` carrying one unless `images.localPatterns` allows it, and `next.config.ts`
  configures no `images` block — which took the page to a 500 with a green build once
  already. Routing through `CardFace`, which uses a plain `<img>` for its own measured
  reasons, keeps that true.

  Three smaller decisions inside it: the tap target is `inset: 0` inside the box so it
  coincides with the card **by construction** (`Slots.module.css`'s `.tap` argument, and
  the reason V6's "second absolutely-positioned row mirroring the geometry" was rejected);
  `position` is the section heading `Your card` rather than a slot framing, because there
  is no spread here; and **no `onReturn`**, which is `ReadingView`'s VD14 omission — there
  is no deck on this page to return anything to.

  `topCardReversedDominant` was **hoisted out of the `topCardLine` call into one `const`
  because it now has two readers.** The gloss and the artwork must never disagree, and two
  copies of `reversedCount * 2 > count` is exactly how a card described by its reversed
  meaning ends up sitting upright.

- **The 2:1 reader portrait is gone and the name is a link.** The old comment called it
  "a stamp beside a sentence" at 120px wide. These assets are landscape *scenes*
  deliberately — it is why the picker draws readers as wide banners instead of the columns
  the original sketch showed — and a 2:1 scene at 120px is **60px tall**: too small to read
  as a place, wide enough to cost a third of the block's inline size on a 360px screen. It
  spent real width to show almost nothing, and it was the only reader-shaped element on the
  page while being completely inert. The name now links to `/{reader.id}`, that reader's
  own service picker, so the page's one claim about a preference is also the one tap that
  acts on it. `next/image` and `readerPortrait` are no longer imported by the page.

  **`linkifyName` derives the segments from the rendered string rather than the catalog
  returning `{ before, name, after }`.** Three fields would be two representations of one
  sentence and therefore two things that can drift; one mechanical split means a copy edit
  that moves the name cannot break the link. Plain `split`, no regexp — a reader name
  interpolated into a pattern buys nothing and the next name needing an escape would fail
  silently. **The empty-name guard is the one that matters:** `''.split('')` explodes a
  string into characters, so without it the page would render one `<Link>` per letter.

### The readers have fixed genders now: Thessaly female, Margaret female, Adrian male

**The bug was "Thessaly refers to herself as they".** `account.reader.line`'s English read
*"{reader} will go with you as far as they can"* — the correct default for a person whose
pronouns are unknown, and the wrong one for three authored characters. And the app already
knew: `readers.json`'s `bio.en` has said `She works…`, `Her way…` and `He is mostly here…`
since the first release, so **the page and the picker disagreed about the same three
people** and the gender existed only in three sentences of prose nothing read.

The split is the part to preserve. **`gender` is DATA** — `readers.json`, beside the name,
a two-value union so a new reader cannot omit it and a third value is a decision somebody
has to make rather than a `?? 'they'` fallback. **The pronoun WORDS are COPY** —
`reader.pronoun.{female,male}` in both catalogs. `readerPronoun()` in
`@/lib/persona/lines` is the only place the two meet; a second join is how one call site
ends up disagreeing about Thessaly. `{Subject}` is capitalised by code rather than by four
catalog keys, because both locales capitalise the same way here.

**Indonesian renders `dia` for both keys and that is not a stub.** The language is
genderless in the third person. It exists as a pair anyway so the call site is
locale-independent and so `en.ts` is not the only catalog whose sentence takes a pronoun —
the same argument the locale facades make about a missing locale being a compile error.
Two tests fence it: the Indonesian values must match **and** must not be English (identical
is only correct if it is `dia`, not if `en.ts` leaked in), and `gender` is cross-checked
against `\b(she|her)\b` / `\b(he|him|his)\b` in each `bio.en`. That cross-check is the
evidence this was a **correction rather than a choice**: the bios were written before the
column existed and independently of it, so a mismatch means either the column or years of
copy is wrong and somebody has to look.

`lines.test.ts`'s two placeholder guards were `/\{[a-z]+\}/` — **case-blind, so an
unreplaced `{Subject}` would have shipped silently.** Now `/\{\w+\}/`.

### Verified live

`npm test` 1608 passed (1598 before, +10), `npm run typecheck` clean, `npm run build`
clean including `audit:secrets`. Loop 5 at a true 390px against the dev server with a
`POST /api/auth/dev-session` session, both locales:

```
/account?lang=en   "← HOME"  "NICKNAME | Mif"  card captioned STRENGTH
                   links: ["← Home -> /", "Thessaly -> /thessaly"]
                   "A path opened toward Thessaly, … She will go with you as far as she can."
/account           "← BERANDA"  "NAMA PANGGILAN | Mif"  one row
                   "… Dia akan menemanimu sejauh yang dia bisa."
tap "See Strength larger" -> [role=dialog]: YOUR CARD / art / Strength / VIII /
                             "Gentleness that turns out to be holding the reins." / CLOSE
                             (no "Return to deck" — look-only, VD14)
```

**A `tap` at a viewport coordinate silently does nothing when the element is scrolled out
of view.** `tapIn` reads `getBoundingClientRect()` and dispatches `Input.dispatchMouseEvent`
at that x/y with no `scrollIntoView` first, so after `window.scrollTo(0, 620)` the card's
`top` was negative and the click landed outside the viewport. The verb still printed
`tapped "See Strength larger" -> [exact]` and exited 0. **Scroll to 0 before tapping, and
assert the effect (`document.querySelectorAll('[role=dialog]').length`) rather than
trusting the verb's own success line** — which is the same lesson its `substring` warning
already records for a different reason.

---

## Wiring V2's translator to the persona, 2026-07-28

*"In the About You page, please translate the untranslated prose as well. Make it
consistent with the selected language."* — Miftah. This was the last item on V8's
still-open list, and everything needed already existed: `'persona.body'` had been in V2's
registry since V2, `resolveTranslatable` had a persona arm, and the sweep had a persona
arm. **None of it had ever run.** Wiring it took one client component and one route field;
finding out that the registry entry was wrong took a live model call.

### THE BUG THAT ONLY A LIVE CALL COULD FIND

`TRANSLATABLE['persona.body'].budget` was `'summary'`. `ceilingFor` resolves that to
`SUMMARY_MAX_WORDS`, which is **50** — the day-summary ceiling. A persona is
`PERSONA_MAX_WORDS`, which is **95**.

`ceilingFor` feeds **both** `buildTranslationPrompt` (the `LENGTH:` block the model reads)
and `verifyTranslation` (the check that decides whether the row is persisted). So the model
was instructed to render a 95-word paragraph in at most 50 words, and then judged against
50. **It cannot be faithful and compliant at the same time.** Measured on the real thing:

```
source (id):  95-word persona, one paragraph
output (en):  88 words, a correct and complete translation
verdict:      violations = [{ kind: 'budget', detail: 'paragraph 1 is 88 words, ceiling 50' }]
persisted:    NO
```

**The consequence was not a visible failure, which is why it would have survived review.**
`settle()` does not persist an invalid translation, so `translations` stayed empty; the
viewer saw correct English every time, because the stream is yielded before verification
(V2's "repair, do not buffer"). The only symptom was **a fresh model call on every single
page view, forever** — the exact quota problem `LLM_WINDOW_CALL_CEILING` exists to bound,
arriving through the one path nobody had exercised.

Fixed by giving the persona its own budget tag: `keys.ts` gains `'persona'` to the tag
union, `ceilingFor` resolves it to `PERSONA_MAX_WORDS`. **No headroom added on top of 95** —
the same constant bounds the generator in both locales, so a faithful translation of a
compliant source lands near it, and a `+15%` fudge would be a second softer ceiling nobody
could find from the prompt.

**THE LESSON IS ABOUT REGISTRY ENTRIES WRITTEN AHEAD OF THEIR CONSUMER.** V2 wrote three
`persona` arms against a table V8 had not built. Two were guarded so they could not raise;
all three were unreachable, and **an unreachable registry line is a guess that reads like a
decision.** `budget: 'summary'` on a short house-voice paragraph looks perfectly sensible.
The test that now guards it asserts what the tag RESOLVES TO, through the real
`verifyTranslation`, because a test on the tag's spelling would stay green through a rename
and miss the number entirely.

### Two more things the same investigation turned up

**`settle()` RAN INSIDE THE STREAM'S `pull()`, WHICH IS OUTSIDE THE REQUEST SCOPE — V2's,
NOT THE PERSONA'S. FIXED THE SAME DAY; SEE THE NEXT SECTION.** Read straight out of the dev
log:

```
[analytics] unbatched track() outside withAnalytics: translation.generated
[analytics] track failed  Error: `after` was called outside a request scope
    at report (src/lib/translate/translate.ts:540:8)
    at settle (src/lib/translate/translate.ts:429:3)
    at iterate (src/lib/translate/translate.ts:252:19)
    at async Object.pull (src/app/api/translate/route.ts:191:24)
[analytics] defer failed   Error: `after` was called outside a request scope
    at defer (src/lib/analytics/track.ts:251:10)
    at settle (src/lib/translate/translate.ts:444:8)
```

So for **every streamed translation, including `reading.body`**: no `translation.generated`
event, and **the `defer()`ed repair pass never runs.** The valid path is unaffected because
`persist()` is awaited inline rather than deferred. Left open at the time, then fixed on
Miftah's say-so within the hour — the next section. The practical effect while it stood was
that V2's own instruction *"if the measured `invalid` rate exceeds ~2%, fix the prompt"* could
not be followed, because the measurement was not being recorded.

**TWO TESTS IN THE TRANSLATION SUITE WERE VACUOUS AND BOTH SAID SO IN THEIR OWN COMMENTS.**
Both were written for "V8 has not shipped yet" and V8 shipped:

- `translations.integration.test.ts`'s *"leaves persona rows untouched while V8's table does
  not exist"* ended with `if (exists) return;` — an escape hatch whose own comment said
  *"this test's premise is gone"*. **It had been returning before its first assertion for two
  releases, and green.** Rewritten to assert the live arm both ways: an orphan persona
  translation is reaped, a live one is spared.
- *"answers null for a persona while V8's table does not exist, rather than raising"* passed
  because the test user had no persona ROW, not because of the guard it was named for. It was
  the persona arm's only coverage. Replaced with two real tests, including the T9 ownership
  one — `resolvePersona`'s `where` compares `personas.user_id` to **both** `entityId` and
  `userId`, which reads like a tautology until you ask what happens when they differ:
  without the second clause, `POST /api/translate` with a stranger's uuid returns that
  stranger's persona in your language.

`resolvePersona`'s own `to_regclass` guard is deleted with them — V8 built the table, and
2026-07-28 put that function on the request path of a language switch, so a probe round trip
was latency insuring against a migration that has run. **`deleteOrphanTranslations` KEEPS
its guard**, for a reason that was never about V8: Postgres resolves relations at parse
time, so a `to_regclass` predicate inside the statement is evaluated after the relation has
already failed to resolve.

### `?lang=en` CANNOT VERIFY A CROSS-LOCALE TRANSLATION, AND THE FIRST ATTEMPT PROVED IT

The obvious check — load `/account?lang=en` against an Indonesian persona — showed the
Indonesian body with no translating state at all, which looks exactly like the feature not
working. It is W6's documented trap arriving somewhere new: **`?lang=` reaches only the
request that carries it.** The page rendered as `en`, so `useLocale()` gave the client `en`
and it correctly asked for a translation — but the client's `fetch('/api/persona')` and
`fetch('/api/translate')` carry no query string, so `getLocale()` answered `id` on both, the
source was already in the target language, and `/api/translate` returned a perfectly correct
**204**.

**Switch the locale the way the app does — `POST /api/locale`** — and everything works. Use
`?lang=` for looking at chrome; never for anything whose behaviour depends on a client fetch
agreeing with the page about the locale.

### Verified live, all three states

Dev server, loop 5 at a true 390px, a real `POST /api/auth/dev-session` session, real z.ai
calls (no `PERSONA_STUB`, no `LOTUS_STUB`):

```
id viewer,  id persona           -> lang=id, source prose, notice=false, no model call
en viewer,  id persona, no cache -> "Translating…" -> English streams in
                                    translations row written: 80 words, source_locale=id
                                    personas row UNCHANGED and still locale=id
en viewer,  cached               -> instant English, notice=false, ZERO /api/translate calls
back to id                       -> lang=id, source prose, notice=false
```

The `personas` row staying Indonesian is the assertion that matters most: it proves the fix
translated rather than regenerated, which is what keeps `personas.locale` honest and what
makes the cached translation reusable at all.

`npm test` 1609 (+1), `npm run test:integration` 230 (+1), `npm run typecheck` and
`npm run build` clean including `audit:secrets`.

---

## The streamed-translation analytics, 2026-07-28 (V2 follow-up)

The defect the persona wiring turned up, fixed. It was never the persona's — it had been
true of `reading.body` since V2 shipped.

### What was wrong

`translateStream` is an `async *` generator. The route calls it inside `withAnalytics`, but
a generator's body does not run until something pulls it — and after the first chunk, the
thing pulling is the `ReadableStream`'s `pull()`, which Next runs **outside the ALS context
that built the stream and outside any request scope at all**. `settle()` always runs after
the first chunk. So every time:

```
[analytics] unbatched track() outside withAnalytics: translation.generated
[analytics] track failed  `after` was called outside a request scope
    at report → settle → iterate → Object.pull
[analytics] defer failed  `after` was called outside a request scope
    at defer → settle → iterate → Object.pull
```

`track()` and `defer()` both look for `als.getStore()`, and both fall back to calling
`after()` directly when it is missing — which throws there. Consequences, for **every
streamed translation, readings included**:

- **No `translation.generated` event, ever.** V2's own header says *"if the measured
  `invalid` rate is above about 2%, fix the prompt, not the architecture"* and that
  `outcome` *"is how that rate is knowable at all"*. It was knowable in principle and
  recorded nowhere.
- **The repair pass never ran.** That is the user-visible half: an invalid translation was
  shown once and never repaired, so the cache stayed empty and the next view paid another
  model call — the same shape as the budget bug, arriving from a different direction.
- The valid path was unaffected, because `persist()` is awaited inline rather than deferred.
  Which is exactly why nobody noticed: translations were being cached and served correctly.

### The fix

`bindAnalyticsScope()` in `@/lib/analytics/track`, called **synchronously inside
`translateStream`** — the last line of that function guaranteed to still be running in the
handler. It captures the store and returns a wrapper; every reporting site in `iterate()`
goes through it.

**It registers the request's `after()` eagerly, and that is the load-bearing half.**
`als.run(store, fn)` alone would let a later `track()` push onto the buffer — but if that
were the request's *first* event, `ensureRegistered` would call `after()` from inside
`pull()` and throw exactly as before. Registering in the handler means the callback exists
before anything needs it. The cost is one `after()` on a request that emits nothing, and
`drain` returns early on an empty buffer.

**`ensureRegistered`'s own comment already recorded the sibling fact** — *"`after()`
callbacks are not guaranteed to run inside the ALS context that registered them"*, which is
why `drain` does `als.run(store, () => drain(store))`. This is that same fact one step
earlier: a stream's `pull()` is the other place work escapes the scope, and it escapes
harder, because there is no `after()` to be inside of yet. **If you write another route that
hands Next a `ReadableStream` whose producer emits analytics, it needs this too.**

**All four reporting sites are wrapped, including the two that did not need it.** The cached
branch and the failed-to-open branch both run during the route's `await iterator.next()`,
which is in scope — so wrapping them is redundant today. Deliberately: "the first pull
happens to be in scope" is an ordering fact about the caller, not a property of the module,
and the next person to yield a chunk before them would break it with nothing red.

### Why the unit suite was green through all of it, and what fixed that

**Vitest has no request scope, so the mock could not tell the difference.** The old mock
replaced `track` and `defer` with recorders; both paths recorded identically whether or not
the real thing would have thrown.

So the mock now models the scope: `bindAnalyticsScope` returns a wrapper that raises a depth
counter, every recorded call carries `inScope`, and one test asserts all of them are true.
Two details were needed to make it faithful rather than merely strict:

- **The wrapper follows the promise.** A synchronous enter/exit counter reports `false` for
  everything after the first `await` inside `settle()`, because `settle` is async — while the
  real `AsyncLocalStorage.run` propagates across awaits. A mock stricter than reality is its
  own kind of wrong.
- **Deferred bodies run *inside* the scope, because `drain()` runs them inside
  `als.run(store, …)`.** The first version called `fn()` bare and the repair pass's own event
  recorded `inScope: false` — a failure production does not have. That one cost a few minutes
  and is worth recording: **when a mock disagrees with the code, check which one is modelling
  reality before changing the code.**

**Negative control, run rather than reasoned:** with the `inScope(...)` wrapper removed from
`settle`'s call site, exactly one test fails — the new one — and the diff is
`inScope: true → false`. Every other test in the file stays green, which is precisely the
position the suite was in before.

### Verified live

Deleted the cached persona translation and every `translation.generated` row, restarted the
dev server, and drove a real streamed translation through loop 5 with a real z.ai call:

```
grep -c "outside a request scope"  dev.log  -> 0     (was 2 per translation)
grep -c "unbatched track()"        dev.log  -> 0     (was 1 per translation)

events where name='translation.generated':
  { entity: 'persona', field: 'body', source_locale: 'id', locale: 'en',
    outcome: 'ok', violation: null, streamed: true, total_ms: 2168, chars: 427 }
```

**`streamed: true` is the whole point** — that row is the one that could not exist before.
Zero rows existed at the start of the check, so the single row is the event, not a leftover.
`personas` still holds the Indonesian source and `translations` holds the English row, so the
fix changed the bookkeeping and nothing else.

The `invalid` → repair path is covered by the unit test with its negative control rather than
live: forcing a real model to violate the contract on demand is not something the harness can
do, and the deferred half is exactly what the mock now models.

`npm test` 1611 (+2), `npm run test:integration` 230, `npm run typecheck` and `npm run build`
clean including `audit:secrets`.

### The reading path, checked after the fix

The persona was what exposed the scope bug, but `reading.body` had been losing its
events for just as long — so the reading path was verified separately rather than
assumed to follow. Live on `/history/[id]`, an Indonesian `spread3` viewed in English:

```
cold view  -> streamed in; 4 paragraphs preserved 4->4; The Tower, The Hermit and
              The Lovers all carried verbatim; translations row written
              event: { entity: 'reading', field: 'body', source_locale: 'id',
                       locale: 'en', outcome: 'ok', violation: null,
                       streamed: true, total_ms: 2179, chars: 348 }
warm view  -> instant English, no spinner, event count UNCHANGED (no model call)
log        -> 0 "outside a request scope", 0 "unbatched track()"
```

**THE SEEDED READINGS ARE USELESS FOR THIS AND IT IS WORTH KNOWING BEFORE YOU TRY.**
`db:seed` writes ~100-character single-paragraph bodies with no card names in them, so a
translation of one exercises none of what makes the reading path differ from the
persona's: `voiced: true` and therefore a reader's block in the prompt, the 4→4 paragraph
check, and the mechanical card-name check. Plant a realistic four-paragraph body naming
three cards first — the check above did, onto the seeded `margaret`/`spread3` row.

**ONE MODEL CALL PER COLD PAGE LOAD, CONFIRMED SEPARATELY.** A first attempt showed
*three* `/api/translate` calls where one was expected, which looked like the StrictMode
double-mount guard failing. It was the harness: `E2E_PROFILE` is a persistent Chrome
profile, so `launch` **restored the previous session's `/account` tab** and its client
fetch raced the new navigation — two genuine page loads, both with a cold cache, both
translating. A controlled single-navigation run then recorded exactly one
`translation.generated` row. **Park the browser on an inert page before counting
anything**, or the profile's restored tab is in your measurement.

Two concurrent cold loads really do cost two model calls: both check the cache before
either persists. That is inherent to a cache-miss race, applies equally to
`HistoryDetail`, and is not worth a lock table for one developer — but it is why a raw
call count is only meaningful when the navigation count is pinned.

## Share links, one per language, 2026-07-28

The reported bug, the landmine in the obvious fix, and two things found by reading the
path. Rules and invariants are in CLAUDE.md's `### Share links, one per language`; the
argument is `docs/plans/2026-07-28-share-per-locale-links-design.md`.

### The report, and which hypothesis was right

> 1. Let's say I got a share link for card session A in English. It opened nicely.
> 2. When I changed the language and created a share link for card session A in Bahasa,
>    somehow the share link in no 1 cannot be opened again.

Two hypotheses were offered: (1) the English content was overwritten with Bahasa, or
(2) one artifact only ever gets one link. **The second, and the first is ruled out** —
`readings.body` is immutable (VD7), `translations` is keyed
`(entity, entity_id, field, locale)`, and the English row was still in the table
afterwards. Only the address was lost.

Worth recording because the two hypotheses point at completely different files, and the
evidence that separates them is two lines: the constraint
`unique (user_id, entity, entity_id)` and `insertOrRotateShareLink`'s
`set: { slug: values.slug }`. **`git grep` for the constraint answered it faster than
reading either feature.**

The behaviour was also *documented as intended*, in `queries/share.ts`: *"Re-sharing is
how a querent fixes a link they minted in the wrong language: switch language, share
again, get a new address showing the new language."* That sentence was written four days
earlier by the change that added the pin. **A comment asserting a behaviour is evidence
about intent, not about whether the intent was right** — it is the thing the bug report
overturns, so it has to be found and inverted rather than trusted as a reason not to
look.

### The landmine: `UNIQUE` treats NULLs as DISTINCT

Adding `locale` to the key is a one-line change that is **worse than doing nothing** if
written the obvious way. Every link minted before design A has `locale = NULL`, and:

1. a plain four-column unique permits unlimited NULL rows for one artifact; and
2. `onConflictDoUpdate`'s target never MATCHES a legacy NULL row, so re-sharing a
   pre-2026-07-28 link **inserts a second row instead of rotating** — leaving the old
   slug live and unreachable from the UI.

That is the capability resurrection the rotation exists to prevent, arriving through the
back door, and the whole suite stays green. `nulls not distinct` (Postgres 15+, and both
the local container and Neon are 16) makes NULL a single value for uniqueness.

**Both negative controls fail by ACCEPTING a second row, not by throwing**, which is the
only shape that catches this:

- `treats two unpinned mints as ONE row` — asserts slug A is **dead** after a second
  unpinned mint. Without the clause, A stays alive.
- `refuses a second link for the same artifact AND locale through a raw insert` — this
  test **already existed and passed before the change, for a different reason** (the
  three-column key). It has to keep passing for the new reason, and its comment now says
  so, because "it was green before and after" is exactly how this would be missed.

Postgres's `nulls not distinct` governs UNIQUENESS only. It does **not** change what `=`
means in a `where`, so `localeMatches()` exists: `eq(col, null)` compiles and is always
false, and a lookup written that way reports "no link for the as-written pin" for every
legacy row — after which the caller mints a second one it cannot see. Two separate
mechanisms that read like one.

### The sheet had no read path, which is why there was no warning

`liveShareLinkFor` existed, was documented as *"the share sheet asks, so it can open on
`live` rather than offering to mint a second one"*, and had **zero production callers**.
`ShareFooter`'s state started empty and only ever held a link minted in that mount.

So opening the sheet on a reading shared yesterday showed the *create* phase, the
querent minted, and the address they had already sent somebody was replaced with nothing
on screen having said so. **The data-layer bug and the absence of a warning were
independent**, and fixing only the first would have left a feature whose most
destructive action is still silent. `GET /api/share` is the second fix.

The generalisation: **a query with no callers is not dead code, it is a missing
feature wearing a docstring.** `git grep` for the export name, not for the file.

### What loop 5 found that nothing else could, and what loop 5 cannot do

**`share.sheet.createIn` rendered "CREATE A ENGLISH LINK".** The catalog string was
`Create a {language} link` and the parameter was `English`; both are individually
correct, so no test in 1629 could see it, and the review reading did not either. Fixed
by removing the article rather than special-casing the vowel — any phrasing with an
indefinite article beside an interpolated language name is a coin flip on the next
locale's first letter. The Indonesian counterpart needs no article and is deliberately
phrased differently; do not "align" them.

**And loop 5 does not give you a phone width, though CLAUDE.md and the skill both said
it did.** `--width 390` becomes `--window-size=390,844`, and measured here
`innerWidth === outerWidth === 500`. The screenshot looks like a phone and is a ~500px
layout cropped — the exact failure the skill's table attributes to *Windows* Chrome
while claiming immunity. Both files are corrected. **Width questions go to loop 4**:
constrain the element under test and read `scrollWidth > clientWidth`, which measured no
overflow at 320/360/390 and touch targets at 44–48px without needing a viewport at all.

### The live sequence, run end to end

Worth repeating verbatim when this area changes, because it is the report:

1. `db:seed`, then mint in `id` from `/history/<id>` — one link, labelled `INDONESIA`.
2. `POST /api/locale {locale:'en'}`, reload. The sheet now **lists** the Indonesian link
   and offers `CREATE A LINK IN ENGLISH`. (Not `?lang=en`: it reaches only the request
   that carries it, so the POST would still resolve `id`.)
3. Mint. Two links listed. **Both slugs return 200**, each rendering its own language,
   `lang="id"` and `lang="en"` on the prose.
4. `share_links` holds two live rows, and `translations` holds a real model-generated
   `en` row with `prompt_version = translate-v1` — the mint's `translateOrCached` ran,
   so the pin is honest by construction rather than by assertion.
5. `TURN ALL LINKS OFF` once → **both** slugs 404, both rows revoked, and **two**
   `share.revoked` events with their own `view_count`.
6. `share.created` shows `pinned_locale` `id` and `en` with `rotated: false` on both —
   the narrowing working, since each was the first address for its language.

`tools/share-seed.ts` plants the three-row fixture and `share-check.py` asserts all
three resolve at once. **That checker was stale on `main` before this branch touched
it**: it still expected `share.public.otherLanguage`, deleted four days earlier, so it
had been failing since. Live-check scripts are not run by CI and rot silently — read
them when the feature they check changes.

### Database down

`GET` and `POST /api/share` both **500 in ~105–120ms**. No hang, and nothing sensitive
in the log — the bound parameters on this path are ids, booleans and a locale, never
`readings.question` or a body. The 500 rather than a 204 is consistent with the three
routes CLAUDE.md already lists as open (`/api/memory/{frequency,summary}`,
`/api/persona`) and should be fixed with them.

The client degrades correctly, which is the half that was designed: a failed `GET`
returns `[]` and falls through to the create flow, and a failed `POST` shows
`share.error.generic`. **`/history/[id]` itself renders the error boundary with the
database down** — V6's awaited primary-key read, pre-existing and unrelated — so the
sheet is unreachable that way and the endpoints have to be exercised directly.

## `/s/<slug>` goes monolingual, 2026-07-28

Miftah, on Vercel, after the per-locale links shipped:

> link no 1 still exists, the card reading content (llm generated) is still english,
> but the website texts is in bahasa, it says like: bacaan yang dibagikan / bacaan
> untuk <nickname> / kartu harian
>
> i am thinking, we should have known what language this llm generated content is
> (because i think we save it during llm generation), why dont we force the full
> website texts in the shared reading page to follow this language?

The premise was exactly right — `readings.locale` is saved at generation,
`share_links.locale` pins it, and `renderedLocale()` already computed the shown
locale. The information was sitting one line above the chrome that ignored it.

### The recommendation that was refused, and why recording it matters

A narrower split was proposed and **turned down**: reading-describing chrome
(eyebrow, `forNickname`, service name, question label, slot labels, date) follows the
prose, while `common.disclaimer.long` and `share.public.cta` stay with the viewer, on
the ground that a warning in a language the reader cannot read is not a warning and
the CTA is the only thing a stranger who cannot read the prose can act on.

Ruling: the whole page. **So an Indonesian visitor opening an English link now has
nothing on the page they can read.** That is written into CLAUDE.md as an accepted
cost rather than left to be rediscovered as a bug, because the next person to notice
it will otherwise "fix" it and quietly reverse a product decision.

Worth noting what the report did NOT complain about: all three strings named were in
the reading-describing group. The narrower fix would have addressed every symptom.
The ruling went further on coherence grounds, which is a legitimate call that the
symptom list alone would not have justified.

### The mechanism, and the two rules it would have broken

The obvious implementation is a `locale` prop on `ReadingView`. It is wrong twice:

- `LocaleProvider`'s header says, in capitals, **"NO LOCALE PROP IS DRILLED
  ANYWHERE"**, and I9's argument is that the client ships exactly ONE catalog — the
  resolved one, as JSON from the server — rather than importing `catalogFor` and
  picking. An ESLint `no-restricted-imports` rule enforces the second half.
- `ReadingView` is **the one renderer three surfaces mount** (VD10). A prop would have
  put this page's problem in front of `/history` and the draw screen, where
  chrome-follows-viewer is *correct*, because the reading on those pages has already
  been translated to the viewer.

**A nested `LocaleProvider` breaks neither**, and it is one expression in `page.tsx`.
The catalog crosses as JSON exactly as the root layout's does; `useT()` reads the
nearest provider. `ReadingView`, `TryItYourself` and `Eyebrow` were not edited at all.

**The reason that is worth knowing rather than merely tidy:** `t` carries its own
`.locale`, and `ReadingView` reads `t.locale` for the service name, the slot labels,
`formatLocalDate`, `formatTime` and `resolveProse`'s viewer comparison. So one nested
provider moved things nobody had enumerated. Measured on the rendered page:

```
EN-pinned, Indonesian viewer: A shared reading | A reading for miftah | Three Cards
                              | 28 July 2026 | 9:03 | What you asked
ID-pinned, English viewer:    Bacaan yang dibagikan | Bacaan untuk miftah | Tiga Kartu
                              | 28 Juli 2026 | 9.03 | Pertanyaanmu
```

The date and time formats were not on anybody's list and followed anyway. That is the
argument for moving the boundary rather than enumerating the strings.

### The measurement that decided the guard

A nested provider is redundant when the pin equals the viewer's locale, so it is
mounted only on a mismatch. The cost of not guarding it:

```
matched   (id pin, id viewer)   raw 48734   gzip 11333   1 catalog
mismatched (en pin, id viewer)  raw 63057   gzip 14686   2 catalogs
delta                                +14323       +3353
```

**+30% on the transferred page**, on the one public route strangers open on mobile
data. That is why the guard exists — and gzipped is the number that decided it; the
raw figure had looked like an acceptable 7% against the total.

### The invariant that had to be restated rather than loosened

`page.contract.test.ts` asserted `expect(CODE).not.toMatch(/\bviewer\b/)`, with a
comment saying the page must not branch on who is looking, citing the header's
cache-key argument. The guard reintroduces exactly such a branch.

Two things came out of resolving that honestly:

1. **The old assertion would have passed vacuously anyway** — `\bviewer\b` does not
   match `viewerLocale`, because there is no word boundary between them. A test that
   cannot see the thing it forbids is worse than no test.
2. **The property that actually matters is that the rendered OUTPUT does not vary by
   viewer, and it is now MORE true than when that comment was written.** The chrome
   used to follow `accept-language`; now two viewers of one slug get byte-identical
   markup. The guard chooses what to SEND, and both branches render the same.

So the rule is stated as: *never read the viewer's locale to choose what LANGUAGE to
render; reading it to choose what to SEND, when both choices render the same, is the
only exception* — and a test walks every occurrence of `viewerLocale` and requires it
to be in the `const` or in the comparison.

### Two things that correctly keep the viewer's locale

- **The 429 page.** A rate-limited visitor has no reading, so there is no reading
  language to follow. The first version of the new contract test forbade the viewer's
  `t` outright and failed on that line — a wrong assertion caught by a legitimate use,
  which is the good direction for that to happen in.
- **`generateMetadata`.** It does not call `resolveShare` today, so making the OG card
  follow the pin would double the database reads on the one uncapped public route, for
  two generic strings that carry no reading content by VD18. Excluded on cost, and the
  exclusion is recorded because "the full website texts" arguably includes it.

### The residual, stated so it is not rediscovered as a bug

- **`<html lang>` still follows the viewer.** The root layout emits `<html>` and no
  page can override it in the App Router. `<main lang={shownLocale}>` is what assistive
  tech and the browser's translate offer read, so this is correct rather than adequate —
  but the outer attribute does disagree, on an element carrying no text of its own.
- **The share sheet's preview is now approximate in one failure path.** Its chrome is
  the sharer's UI locale, which equals the pin in every ordinary case. They diverge only
  when the sharer reads a language the reading was not generated in, no translation row
  exists, and the mint's `translateOrCached` fails — pin NULL, so the page falls back to
  the source for chrome as well as prose. The prose still matches; only the chrome
  differs. Closing it means shipping the second catalog to `/history/[id]` and the draw
  screen permanently, for a state that only exists when a model call fails.

### The browser tab, 2026-07-28 (the third report on this page)

> when i refresh share link A . everything stays in bahasa EXCEPT the text in the
> browser tab. what do we call it? tab name? it says "A shared reading"

It is the **document title** — the `<title>` element, which browsers render as the tab
label — set by `generateMetadata`. `og:title` shares the value, so chat previews carried
it too. On a page that had just been made monolingual, it was the last string still
resolved from `accept-language`.

**THE PREVIOUS SECTION'S OWN NOTE ARGUED AGAINST FIXING THIS, AND THE ARGUMENT WAS
WRONG ABOUT ITS COST.** It said making the OG card follow the pin "doubles the database
reads on the one uncapped public route". That is false: the page resolves the share
anyway, so a `cache()`d call shared between metadata and page costs nothing extra.

**The real objection was different and stronger, and it is worth keeping.**
`generateMetadata` runs *outside* the page component, so a `resolveShare` there sits in
front of both rate limiters — and `page.contract.test.ts`'s
`checks BOTH limiters, AWAITED, before it reaches the database` exists precisely because
the ordering is the defence on the app's only unauthenticated read path. Adding a resolve
to metadata would have meant one query per request for an enumeration attempt, forever.

So the fix is not "resolve twice, it's cheap" but **move the gate inside the shared
function**:

```
gateAndResolve = cache((slug, ip) => { limiters...; if over budget -> busy; resolve })
```

Both `generateMetadata` and the page call it with identical arguments. Counts:

```
allowed request  ->  1 limiter spend, 1 resolve   (unchanged)
refused request  ->  1 limiter spend, 0 resolves  (unchanged)
```

**VERIFIED BY COUNTING, NOT BY READING THE DOCS.** A temporary
`console.log` inside the cached function, one request, one line — React's `cache()` does
dedupe across the `generateMetadata`/page boundary. Worth measuring because the whole
design rests on it and the failure mode is silent: if it did not dedupe, both the budget
and the query would run twice and nothing would look wrong.

**`ip` IS A PARAMETER, NOT READ INSIDE.** `cache()` keys on arguments, so both call sites
must pass `clientIp(h)` or the dedupe silently stops. A contract test asserts the two
call sites are textually identical, which is the only cheap way to check an invariant
about argument equality.

Measured titles, all four combinations plus the residue:

```
id-pinned  EN viewer -> "Bacaan yang dibagikan"    id-pinned  ID viewer -> same
en-pinned  EN viewer -> "A shared reading"          en-pinned  ID viewer -> same
NULL pin   either    -> "Bacaan yang dibagikan"   (the source language)
unresolved either    -> "JMTarot"                 (the layout default)
```

Two things that correctly did NOT change:

- **The OG image.** It draws only `MAJOR ARCANA`, which is English in both locales, and
  VD18 keeps the question and the prose out of it deliberately.
- **The 429 page.** No reading, so no reading language.

**Two assertions failed while landing this, and both failures were the right ones.**
`checks BOTH limiters` pinned `hit(\`share:view:${clientIp(h)}\`)` inline and noticed the
move into the cached function. And the new test's first version asserted **zero**
`resolveShare` occurrences, which fails on the one legitimate call — the property is not
"nobody resolves" but "nobody resolves *outside the gate*", which is what would put a
query in front of the limiter.

---

# v0.4.0

## S1 — the public surface and the technical SEO foundation

The rules and the invariants are in `CLAUDE.md`'s `## The public surface (v0.4.0 / S1)`.
This section is the **evidence**: what was measured, on what, and what it means.

### R21 is answered locally, and it is the answer four plans wanted

**A `next.config.ts` `cache-control` DOES survive a dynamically rendered App Router
response.** Four plans flagged this independently (S1 flag 5, S2 flag 11, S3 flag 9,
S4 flag 2) and it is the premise S-D10's whole TTFB argument rests on. Nobody had
measured it, and every route in this app is `ƒ` because the root layout awaits
`getLocale()`.

Measured 2026-07-29 against a real `npx next start -p 3001` on a production build, with
a **temporary probe entry** pointing `CONTENT_CACHE` at `/terms` — a route that exists
and is dynamic, which is the whole point. The probe was removed in the same session.

```
/terms                  ƒ, WITH an entry   cache-control: public, s-maxage=3600, stale-while-revalidate=86400
/                       ƒ, no entry        Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
/cards/18_moon.webp     static, WITH one   cache-control: public, max-age=31536000, immutable
```

The middle line is the negative control and it is what makes the first line mean
something: Next's dynamic default is real and visible, and the config entry beats it.

**THIS IS NOT THE WHOLE OF R21 AND MUST NOT BE READ AS IT.** It proves the header
reaches the wire. It does **not** prove Vercel's CDN honours `s-maxage` on a function
response — the dev server has no CDN in front of it, and R21 asks for `curl -sI`
against a **Vercel preview**. Until that is recorded here, every workstream still
assumes the content routes are not edge-cached. Nothing in v0.4.0 depends on the cache
and nothing new may.

### The crawl baseline at S1 alone

`tools/seo/crawl.sh http://localhost:3001`, production build, no cookie jar,
2026-07-29. **It reports FAILED and that is correct** — it is the release's acceptance
test, not S1's, and S1 must not deploy alone (flag 9).

```
/                    200  0   SET-COOKIE (jmt_locale, authjs.csrf-token, authjs.callback-url)
/en                  200  1   REDIRECTED to /login?callbackUrl=%2Fen; LANDED ON LOGIN
/gallery             404  0   NOT 200
/en/gallery          404  0   NOT 200
/arcana/the-moon     404  0   NOT 200
/en/arcana/the-moon  404  0   NOT 200
/blog                404  0   NOT 200
/en/blog             404  0   NOT 200
/terms               200  0   SET-COOKIE (...)
/privacy             200  0   SET-COOKIE (...)
/sitemap.xml         200  0   ok
/robots.txt          200  0   ok
```

Read it line by line, because three of these are the change working:

- **`/` is 200 with 0 hops.** It was a 302 to `/login` for anyone without a cookie. This
  is the release's core change and the closed OAuth branding blocker.
- **`/gallery`, `/arcana/the-moon` and `/blog` are 404, NOT 302.** That is the gate
  change: `isPublic()` now lets them through and Next answers honestly. Before S1 they
  were login redirects, which Google reads as soft 404s. S3/S4/S6 turn these into 200s.
- **`/en` is still a login redirect** because S2's rewrite is not landed. Expected.
- **`/terms` and `/privacy` are 200 with no `noindex`** (R4).
- **`/s/` still answers `x-robots-tag: noindex, nofollow, noarchive` and
  `referrer-policy: no-referrer`.** That line is the script's own negative control: if
  it printed nothing, the crawl above would prove less than it looks like it does.

**The `Set-Cookie` on `/` is expected and is S2's** — its cookie-write guard grows from
`/s/` to `/s/` plus the content routes plus `/api/events` (R22). **But note what the
crawl actually caught, which no plan predicted: there are THREE cookies, not one.**
`jmt_locale` is S2's to suppress; `authjs.csrf-token` and `authjs.callback-url` come
from the `auth()` wrapper around middleware and will still be there afterwards. That is
the same gap `/s/` already carries and `/privacy` §4.4 already names, arriving on the
landing page. S-D10 says a stranger leaves with nothing in their jar; **after S2 lands,
that will still be false on every public page, and somebody has to decide whether it
matters.**

### The landing fits a phone — loop 4, not a screenshot

`tools/seo/fit.sh /` against the production build, 2026-07-29:

```
{"width":320,"rootOverflows":false,"offenders":[]}
{"width":360,"rootOverflows":false,"offenders":[]}
{"width":390,"rootOverflows":false,"offenders":[]}
```

**Neither Chrome here gives a phone width** — both floor at ~500px — so this is a
fixed-width container plus `scrollWidth > clientWidth`, which is exact for
container-driven layout. Two things were expected to overflow and did not: the footer's
`.links` row (it wraps) and the hero `<img>`, which is declared at `width={800}` and is
held by `max-width: 100%`. `Landing.test.ts` asserts that CSS rule directly, because
this loop needs a browser and that assertion does not.

### Loop 5: the page agrees with what it renders

`tools/e2e/run.sh` against the production build, signed out:

- `text` returns the landing's `<h1>`, tagline, lede and all four block headings.
- `document.querySelectorAll('h1').length` is **1**. Two `<h1>`s is the commonest
  on-page SEO defect and it is invisible in a browser.
- `document.querySelectorAll('script[type="application/ld+json"]').length` is **1**, and
  `JSON.parse(...)['@graph'].map(n => n['@type'])` is **`Organization,WebSite`**.

That last one is the interesting one, and it is R1's measurement repeated in a real
browser rather than in a test: the plain text child parses. Confirmed again on the raw
HTML — `publisher['@id']` matches the organization's `@id`, `inLanguage` is the bare
`id`, and `SearchAction` appears nowhere.

**One observation worth keeping: the harness reported `lang=en` on `/`.** That is
correct today and will change: signed out, `/` currently follows D6's chain, so an
`Accept-Language: en` browser gets English. After S2's `contentRewrite` reaches
middleware, signed-out `/` pins `id` (§4.1) and only the signed-in arm keeps the chain.
If it still says `en` after S2 lands, the pin is not wired.

### `metadataBase` reached `/s/`, and that is the only visible evidence it works

Before: `og:image` resolved against Next's guess. After, on the wire:

```
<meta property="og:image" content="http://localhost:3001/s/abcdefghjkmn/opengraph-image?..."/>
```

Absolute, at the origin the leaf decided. **VD18 is untouched** — the image still draws
only `MAJOR ARCANA` and carries neither the question nor the prose.

### The secrets tripwire's premise expired, and amending it was the real work

`npm run build` **failed** the first time `origin.ts` existed, with four findings. The
rule was *"JMTarot has no `NEXT_PUBLIC_` variables"* and S-D11 introduced one.

The audit's own output says *"If a finding is legitimate, do not add a suppression"*,
and that instruction is right, so the fix is not an allowlist entry:

1. **The allowlist pairs the VARIABLE with its ONE legitimate reader**
   (`NEXT_PUBLIC_READERS`), not just the name. Any other module reading
   `NEXT_PUBLIC_SITE_ORIGIN` still fails the build — which is *stricter* than the old
   rule was for every other variable, because the old one had nothing to say about
   where a permitted read may live.
2. **`lib/seo/origin.ts` joined the transitive `FORBIDDEN` client-boundary walk**, which
   is the fence R10 actually asks for. `clientBoundary.test.ts` covers the direct
   import; this covers a helper in between.
3. **Test files are skipped in the read scan.** Nothing imports a `*.test.ts` from a
   route, so Next never compiles one. Three of them tripped it, and
   `layout.contract.test.ts`'s read is inside a `.not.toContain(...)` — a test asserting
   the layout must NOT read the variable. Firing on that is the same pathology the
   scanner's own comment already describes for `resolve.ts`.

**Both new fences were negative-controlled rather than assumed**, by planting a probe
and watching the build fail:

```
src/lib/_probe.ts reading it        -> [NEXT_PUBLIC_] a NEXT_PUBLIC_ read in source (NEXT_PUBLIC_SITE_ORIGIN)
a 'use client' component importing  -> [boundary] src/components/_Probe.tsx -> src/lib/seo/origin.ts
```

### Three traps this workstream paid for

- **`pkill -f next-server` KILLED THE SHELL RUNNING IT.** `pkill -f` matches full
  command lines, and the command line *containing the pkill invocation* contains the
  string `next-server`. The compound command died at exit 144 with the config edit
  half-applied and no server running. Use `pkill -f 'next[-]server'`, which cannot
  match itself. This is a sharper version of the trap `headers.test.ts` already
  records (`pkill -f "next start"` does not work because the process renames itself).
- **`npm start` LISTENS ON 3000, AND 3000 IS PERMANENTLY HELD** by another project's
  Grafana container. `npm run dev` passes the port; `npm start` does not. The symptom
  is `EADDRINUSE ::: 3000` from a script that looks like it should work, and every
  documented local `curl` in the S1 plan assumed otherwise. Use
  `npx next start -p 3001`.
- **`*/` INSIDE A BLOCK COMMENT ENDS THE COMMENT.** `sitemap.test.ts` documented the
  permitted import families as `@/content/*/index.ts` and produced
  `[PARSE_ERROR] Unterminated string` twenty lines further down. Write the glob in
  prose, not as a glob.
- **THE UNIT PROJECT GLOBS `src/**` `/*.test.ts` ONLY.** A `.test.tsx` file is silently
  never collected — `vitest run <path>` says "No test files found" and a bare run says
  nothing at all. `JsonLd.test.ts` renders JSX through `createElement` rather than
  widening the glob for every other workstream.

### The catalog, measured

268 keys after S1's 26. `id` serializes to **15,801 bytes**, `en` to **15,527**. The
longest value is still `onboarding.intro.body` at **267** characters; the next three are
`onboarding.q.worst_thing.hint` (182), `moderation.blocked.selfHarm.closing` (168) and
`account.delete.body2` (147). `prose.test.ts`'s ceilings — 320 per value, 20,000 bytes
per catalog — are set against those, with ~21% headroom on the one that matters.

**CLAUDE.md said 118 keys for two releases** and the roadmap argues S-D6 from a line
count. The bytes are the number that reaches a phone, and they are why 44 lore documents
may never live in the catalog.

### What S1 did NOT do, and where it deviated from its own plan

- **The plan's `EN_PREFIX` placeholder in `sitemap.ts` was never written.** S2's
  `prefix.ts` had to land first anyway (R11/R14), so the sitemap imports `localePath`
  directly and the seam closed instead of being created.
- **The plan's gate tests are inverted.** §1.1 chose "the gate knows no `/en/`
  spelling", so `isPublic('/en/gallery')` would be `false`. **Reconciliation R14 kept
  S2's contract G2 instead** — the content clause strips, every other clause does not —
  and the tests assert that, plus the `/en/api/events` case that makes the narrowness
  load-bearing.
- **The plan's `dangerouslySetInnerHTML` in `JsonLd.tsx` was refused** (R1). See the
  trap above.
- **`/arcana` is public** (R6), reversing S1's flag 6, which had accepted a soft 404.
  **`src/app/arcana/page.tsx` calling `notFound()` is NOT written** — the path 404s
  today because no route file exists there at all, so the behaviour is already correct.
  It belongs to whoever owns `src/app/arcana/**`, which is S4.
- **`/terms` and `/privacy` became indexable** (R4), which S1's flag 7 raised and
  explicitly declined to do alone.

## Locale-addressable public content (S2), v0.4.0

`/gallery` is Indonesian and `/en/gallery` is English, by a middleware rewrite, for five
routes and no others. The rules and the invariants are in CLAUDE.md's `## Localization`;
this is the evidence.

### The contract

`src/lib/i18n/prefix.ts` is a pure edge-safe leaf holding both the prefix maths and the
content route table, because you cannot decide whether to honour `/en/x` without knowing
whether `/x` is content. `src/middleware.ts` calls `contentRewrite(pathname, signedIn)`
once and gets one of four answers: `passthrough` (D6 unchanged), `bare` (pin `id`),
`rewrite` (pin `en`, rewrite to the bare route), `redirect` (301 to the canonical
address).

### Contract G1: the gate sees the STRIPPED path

Resolved rather than left open (roadmap §6.1 asked for a decision). `decide()` never
receives `/en/gallery`; `isPublic()` and S-D5's `/` clause are written against bare paths.
The argument that settled it: `/en` rewrites to `/`, so S-D5's `pathname === '/'` clause
fires for the English landing **and** the signed-in-but-not-onboarded arm still redirects
to `/onboarding`. Under the other ordering that clause has to read
`'/' || '/en' || '/en/'` and the onboarding arm is missed by everybody, because nobody
tests `/en` while signed in and half-onboarded.

`isPublic()`'s content clause still strips first (contract G2), so `/en/history` is proved
non-public even though nothing can reach `decide()` with that spelling any more.

### `isContentPath` and `isPublicContentPath` differ by exactly one path

`/`. `isPublic()` short-circuits `decide()` **before** the onboarding check, so `'/'` in
that allowlist would land a signed-in half-onboarded querent on a reader picker that
assumes a completed profile — the change S-D5 forbids in capitals, arriving through a
predicate instead of through a diff. A test asserts the symmetric difference is `['/']`.

### `/` is the one path where the session is read, and it cannot be CDN-cached

S-D5 makes `/` dual-render. Pinning `id` there unconditionally hands a signed-in English
querent an Indonesian reader picker — D6 broken on the busiest screen in the app, by the
workstream that promised not to touch it. So on `/` with a session, `contentRewrite`
answers `passthrough` and the D6 chain and the cookie write behave exactly as before.

The consequence is that `/` varies by session and **S-D10's cache header must not be
applied to it**. That is true for S-D5's reasons before it is true for S2's. Every other
content route is session-invariant, and a negative-control test asserts `contentRewrite`
gives the identical answer for both values of `signedIn` on every path but `/`.

### `?lang=` is inert on a content route, by construction

`contentRewrite` takes a pathname and a boolean. There is no `NextRequest`, no
`searchParams` and no header, so the dev override cannot reach it — in development or in
production. §4.3 asked for "the prefix wins"; a function that cannot see the query cannot
be overridden by it. The override is untouched for the nine app routes. Verified on the
wire: `/?lang=en` is `id` and `/en?lang=id` is `en`.

### The 301 arm is narrower on the wire than the plan expected, and Next's 308 is why

**MEASURED, 2026-07-29, and it corrects the plan's flag 6.** That flag said both locales
would be normalised "by the same 301 rather than one of them relying on Next's own
`trailingSlash: false` 308". False: Next normalises a trailing slash **before middleware
runs**, so `contentRewrite`'s trailing-slash branch is unreachable in production and both
locales rely on the 308 after all.

```
/gallery/      308 -> /gallery          Next, before middleware
/en/gallery/   308 -> /en/gallery       Next, before middleware
/en/           308 -> /en               Next, before middleware
/id/gallery    301 -> /gallery          ours
/id            301 -> /                 ours
/id/gallery/   308 -> /id/gallery -> 301 -> /gallery   two hops, settles
```

The `canonicalise()` calls stay: they are what makes `contentRewrite` a total function on
a path it may be handed by a test, a future `basePath`, or any router that does not
normalise first — and the fixed-point test proves no input loops. But do not read the
trailing-slash 301 as a live path; the `/id/` family is the arm that actually fires.

### The gate is opening on content paths, and a 404 is the proof

With S3/S4/S6 unlanded, every content address is a **real 404** rather than a login
redirect, which is the property the release is built on:

```
/gallery /en/gallery /arcana /arcana/the-moon /blog /en/blog      404
/en/history /en/account /en/onboarding /en/api/events /en/thessaly
        307 -> /login?callbackUrl=%2Fen%2Fhistory  (etc.)
```

**The `callbackUrl` is the assertion, not the 307.** It spells the path verbatim, which
proves nothing stripped the prefix on the way to `decide()`. A `callbackUrl=%2Fhistory`
would mean the gated app had become reachable under `/en/`.

### The cookie guard, measured

The first measurement, before the second half landed:

```
GET /            set-cookie: authjs.csrf-token, authjs.callback-url        (no jmt_locale)
GET /en          set-cookie: authjs.csrf-token, authjs.callback-url        (no jmt_locale)
POST /api/events set-cookie: authjs.csrf-token, authjs.callback-url        (no jmt_locale)
GET /login       set-cookie: jmt_locale=id, authjs.csrf-token, authjs.callback-url
```

`/login` is the negative control: an app route with a disagreeing cookie still writes it,
so the guard narrowed the write rather than deleting it. `/api/events` is R22 — it was
collecting on the beacon the cookie `/s/` had just refused to set.

### The two cookies S2 does not write and still had to remove

**THE GUARD ABOVE ONLY DECIDES WHAT WE WRITE, AND S-D10 WAS STILL FALSE ON EVERY PUBLIC
PAGE.** `authjs.csrf-token` and `authjs.callback-url` are appended by the `auth()`
wrapper **after** the handler returns. Read it in `node_modules/next-auth/lib/index.js`:

```js
const finalResponse = new Response(response?.body, response);
for (const cookie of sessionResponse.headers.getSetCookie())
  finalResponse.headers.append('set-cookie', cookie);
```

So nothing inside the handler can prevent them, which is exactly why the rule read as
satisfied for two releases — `/s/`'s guard has the same shape and the same hole, and V7's
"a third party must leave with nothing in their jar" was false the whole time.

**AND THE HALF THAT LOOKED FINE WAS THE CACHE.** A `Set-Cookie` makes a response
uncacheable at the edge **whatever `Cache-Control` says**, so `next.config.ts`'s
`s-maxage` on the content routes was measured, correct, and buying nothing. R21's open
question — does the header survive a dynamic App Router response — could have been
answered `yes` and still left the pages uncached.

The fix is an **outer** wrapper, because that is the only position downstream of the
append. The inner handler marks a content response with `x-jmt-strip-cookies`; the outer
deletes every `Set-Cookie`, then the marker. Measured after:

```
GET /  /en  /gallery  /en/gallery  /blog     0 set-cookie headers
GET /id/gallery  301                         0 set-cookie headers
GET /en                                      no x-jmt-strip-cookies on the wire
GET /login    set-cookie: jmt_locale, authjs.csrf-token, authjs.callback-url   (all three)
```

Three properties to keep:

- **`content.kind !== 'passthrough'` is the whole fence, and widening it breaks two
  things at once.** A signed-in visitor on `/` is `passthrough` (S-D5), so stripping
  there would drop the `jmt_locale` sync D6 depends on *and* the sliding session cookie,
  on the busiest screen in the app. `/login` and `/api/auth/*` are `passthrough` too,
  which is what keeps the csrf token available to the sign-in POST: `Landing.tsx` links
  to `/login` rather than posting anything, so a stranger clicking through mints both
  cookies there, one request later, exactly as a cold visitor does today.
- **The marker is deleted in the same block.** A header naming our internals on the pages
  a stranger is most likely to read is not a cost worth paying for a debugging aid.
- **It costs the sliding refresh on content pages, and that is the accepted trade.**
  Reading `/blog` all day does not extend a signed-in querent's 24-hour idle timeout. The
  30-day absolute cap is untouched, browsing public content is not app activity, and the
  alternative is a `Set-Cookie` on every cacheable page in the product to keep one timer
  alive for somebody reading an article.

Verified beyond the header count: a dev-minted session survives a request to a stripped
content path and `/history` still answers 200 afterwards, so the strip removes the
*re-issued* cookie and never the one the browser already holds.

### `/id/…` 301s rather than 404s, and both locales normalise the same way

Indonesian has one address and it is the bare one. `stripLocalePrefix` still recognises
the `/id/` segment, and that is the whole reason: a path people will guess **because**
`/en/` exists gets a 301 to the address that exists, keeping whatever inbound link it
arrived with, instead of a 404. A test iterates every redirect to a fixed point and
asserts it settles in at most two steps; the wire agrees (see the table above).

### The canonical `/en` shipped for one commit was `/`, and only `curl` saw it

**THE HIGHEST-VALUE FINDING IN THIS WORKSTREAM, AND NO TEST FOUND IT.** S1 left
`alternates: { canonical: '/' }` in `src/app/page.tsx` with a comment saying S2 would
replace it. Measured before replacing it:

```
GET /      <link rel="canonical" href="http://localhost:3001"/>
GET /en    <link rel="canonical" href="http://localhost:3001"/>     <-- the defect
```

A canonical naming another URL is an instruction to drop this one, so **the English
landing page would have been de-indexed in favour of the Indonesian one, silently, in the
release whose entire purpose is being indexed** — while `sitemap.xml` simultaneously
claimed the two were a reciprocal pair. After `contentAlternates()`:

```
GET /      canonical -> /        alternate id -> /, en -> /en, x-default -> /
GET /en    canonical -> /en      alternate id -> /, en -> /en, x-default -> /
```

The alternate set is **byte-identical on both twins and only the canonical moves**, which
is what reciprocity means and the only form Google does not discard.

### Two framework details, measured rather than recalled

- **React serialises `hrefLang` as `hrefLang`, not `hreflang`**, in both
  `<a hrefLang>` and Next's `<link rel="alternate" hrefLang>`. It is correct anyway —
  HTML attribute names are ASCII case-insensitive, so the parsed DOM attribute is
  `hreflang` — and `sitemap.xml`, which is XML and *is* case-sensitive, is serialised by
  Next's own sitemap writer and comes out lowercase. Do not "fix" the JSX to a lowercase
  prop: React would treat it as an unknown attribute and the warning is the only thing
  you would gain.
- **Next strips the trailing slash from an absolute canonical.** `contentAlternates`
  returns `http://host/` for the root and the emitted tag is `href="http://host"`. Both
  denote the same resource per the URL spec, and `sitemap.xml` keeps the slash, so the
  two files disagree textually and not semantically. Recorded so it is not read as a bug
  in the helper.

### The D6 regression check, which is the only thing S2 could break that already worked

A real dev-minted session, `POST /api/locale {"locale":"en"}`, then:

```
GET /     signed in, en    <html lang="en">   page-module   (the picker)
GET /en   signed in, en    <html lang="en">   page-module   (the picker, one request)
GET /     signed out       <html lang="id">   Landing-module
```

**The plan's Task 9 check 4 has a wrong field name**: `/api/auth/dev-session` takes
`{"username": "..."}`, not `{"user": ...}`, and the wrong one is a 400 with an empty
cookie jar — which then looks like "the session did not work" rather than "the request
was rejected". The landing page also names all three readers, so grepping for `Thessaly`
is not a test of which arm rendered; `Landing-module` versus `page-module` in the class
names is.

### Loop 5: the link really does reload the document, and it is 44px tall

The behavioural half of the `next/link` trap, over CDP against `npm run dev`:

```
goto /en                            -> /en   lang=en
eval a[hreflang=id].href            -> /
tap  Indonesia                      -> /     lang=id   aria-current="Indonesia"
tap  English                        -> /en   lang=en   aria-label="Change language"
```

**`lang` flipping is the whole assertion, not the pathname.** With a `next/link` the
pathname would change and `document.documentElement.lang` would stay `en`, because the
navigation resolves to the same route under the same root layout and Next does not
re-render it — a visibly half-translated page with nothing failing anywhere.

Two things the plan's §13.2 gets wrong, both costing a few minutes:

- **`tools/e2e/run.sh tap` matches VISIBLE TEXT, not a CSS selector.** `tap
  'a[hreflang="id"]'` prints `NO element matching`, which reads like the anchor is
  missing. `tap 'Indonesia'` is the call.
- **The harness does not scroll, and a tap it reports as landed can hit nothing.** It
  filters on `getBoundingClientRect().width/height > 0`, which a below-the-fold element
  satisfies, then dispatches Input-domain events at coordinates outside the viewport. It
  printed `tapped "Indonesia" -> [exact] "indonesia"` and the URL did not change. Scroll
  first: `eval 'document.querySelector("a[hreflang=id]").scrollIntoView({block:"center"})'`.
  Worth fixing in the harness the next time somebody is in that file.

**And it answers §13.3's deferral with a number instead of an argument.** That section
says loop 4 is unnecessary because `.link` only adds `display: inline-flex`,
`align-items: center` and `text-decoration: none` to the geometry `LocaleSwitch` already
measured. Measured directly: the anchor's box is **92.67 × 44**. The 44 is the number
`.option`'s comment records as having said 44 and measured 42 for a whole workstream, so
it is the one worth having twice.

### The crawl gate, and what its FAILED means today

`tools/seo/crawl.sh http://localhost:3001` — **it defaults to production, which is still
serving v0.3.0, so an unargued run reports every content path as a login redirect and
tells you nothing about this branch.**

```
/                200  0 hops   set-cookie: authjs.csrf-token, authjs.callback-url
/en              200  0 hops   set-cookie: authjs.csrf-token, authjs.callback-url
/gallery /en/gallery /arcana/the-moon /en/arcana/the-moon /blog /en/blog     404
/terms /privacy  200  0 hops   set-cookie: jmt_locale, authjs.*
/sitemap.xml     200  4 urls   /robots.txt 200 with the Sitemap: directive
/s/              404 + x-robots-tag: noindex, nofollow, noarchive
crawl: FAILED
```

**The FAILED is §0.5's, not a regression.** The six 404s are S3, S4 and S6's pages, which
are *meant* to be missing at this point in the sequence — that is the whole reason the
script is the deploy gate and no unit test can replace it. What S2 changed is the first
two rows: `/` and `/en` are 200 at zero hops and no longer report `jmt_locale`. `/terms`
and `/privacy` still write it, correctly — R4 made them indexable but they are not
content routes, they serve both languages at one address by D6's chain, and that chain is
what the cookie is for.

### The traps

- **`NextResponse.rewrite(url)` without `{ request: { headers } }` is silent.** The right
  route renders with no `x-jmt-locale`, so `getLocale()` falls through to the
  `jmt_locale` cookie: `/en/gallery` is English for whoever has an `en` cookie and
  Indonesian for the next stranger, under a canonical that claims English. **No unit test
  in this project can see it.** The check is `curl` with a planted cookie, and it passes:
  `/` with `jmt_locale=en` is `id`, `/en` with `jmt_locale=id` is `en`.
  `middleware.ts` had carried this warning for `NextResponse.next()` since W6; it is the
  same trap one function later.
- **`next/link` must never cross the `/en/` boundary.** A client-side navigation from
  `/gallery` to `/en/gallery` resolves — after the rewrite — to the same route under the
  same root layout, so Next does not re-render the layout: `<html lang>` and
  `LocaleProvider`'s catalog keep their old values and the page comes out
  half-translated. `ContentLocaleLink` is a plain `<a>` for that reason and not for
  crawlability (`next/link` renders a real anchor).
- **`usePathname()` returns the PRE-rewrite path.** On `/en/gallery` it is `/en/gallery`
  while the rendered route is `/gallery`, so a client-side sibling computation builds
  `/en/en/gallery` and disagrees with the server about it. `ContentLocaleLink` takes the
  bare path as a prop, and `localePath` throws on an already-prefixed argument. A contract
  test forbids any `'use client'` file from importing `@/lib/i18n/prefix`.
- **Do NOT copy `/s/[slug]`'s nested `LocaleProvider`.** There, the page's language differs
  from the *request's* resolved locale, so a second catalog is the only way. Here the
  request's resolved locale IS the page's language — middleware pinned it — so the root
  layout's single provider is already correct and a nested one would ship two catalogs and
  break I9's whole argument for +3.3KB gzipped on the pages a stranger opens on mobile
  data.
- **A relative `hreflang` is discarded by Google, and so is a non-reciprocal group** —
  the whole group, not the broken edge, with nothing reporting it. `contentAlternates`
  therefore builds absolute URLs from an `origin` parameter rather than leaning on
  `metadataBase`, and its test walks the graph: every URL a page names must name that page
  back.
- **`contentAlternates` takes the locales that EXIST, and defaulting that to `LOCALES` is
  the R2 trap wearing a convenience.** The parameter is required for that reason. `/` may
  pass `LOCALES` honestly because middleware rewrites `/en` to the same route, so neither
  address can 404; the 22 cards may not.
- **A stranger's URL choice does not cross the sign-in boundary.** No content response
  writes `jmt_locale` (S-D10), so a visitor who read `/en/blog` and then clicked into
  `/login` gets whatever `Accept-Language` negotiates. Same asymmetry §4.2 states for the
  signed-in direction, and accepted for the same reason.
- **`PublicShell`'s hole test had to be INVERTED, not deleted.** S1 asserted the mount
  point was a comment, so that no local `<a>` could become the second definition R17
  exists to prevent. The half that still binds after S2 lands is that the shell mounts and
  does not implement: exactly one `<ContentLocaleLink>`, and still no bare `<a>` of its
  own.

---

## Card lore pages (S4), v0.4.0

Forty-four authored documents at twenty-two permanent addresses. `CLAUDE.md`'s
`## Card lore pages (v0.4.0 / S4)` holds the rules; this holds the evidence.

### The twelve-card element invariant, and how it was checked

`Card.glyph` had been in `cards.json` since the first release and **nothing had
ever read it** — before `src/lib/arcana/correspondence.ts`, `grep -rn glyph src`
found the type declaration and nothing else. Twenty-two committed astrological
attributions, unused.

The join is worth having because it is checkable. For the **twelve sign cards**,
`SIGNS[sign].element` in `astrology.ts` equals `card.element` in `cards.json`,
for all twelve, with no exceptions:

```
Aries/fire  Taurus/earth  Gemini/air     Cancer/water
Leo/fire    Virgo/earth   Libra/air      Scorpio/water
Sagittarius/fire  Capricorn/earth  Aquarius/air  Pisces/water
```

That single assertion is what makes the whole glyph table trustworthy: a glyph is
one non-ASCII character in a source file, so the realistic failure is a key
mangled by an editor, and a mangled key almost certainly disagrees with the card's
own element. `correspondence.test.ts` names the card when it does.

**The nine planetary cards and The Fool are deliberately unasserted**, and
Judgement is why: `cards.json` gives it `water` while the Golden Dawn attributes
the twentieth trump to Fire. Both are true. Asserting the planetary elements would
force a choice between failing the suite and editing generated data S4 does not
own.

### `LORE_ANCHORS` is what makes §8.2 mechanical rather than promised

"English is rewritten, not translated" is checked three ways, and the cheapest is
the hardest to fake: the `id` and `en` documents for one card must not share an
`anchor`. It forces the divergence to be **planned** instead of discovered
afterwards. The other two are the DIVERGENCE table and a positional Q&A
comparison.

**And it caught real translation twice, in the first two pairs written.** The Fool
and The Magician each came out with an English half that made the SAME argument in
English — "priced waiting higher" against `menghitung bahwa menunggu lebih mahal`,
and an identical check question in both halves. Both were rewritten before the
table was filled in. The lesson: **design the two halves to make different
arguments, not the same argument in two languages** — the anchor forces a
different door and does not, on its own, force a different room.

### The DIVERGENCE table's direction, which the first draft got backwards

The row lists **the English words for the INDONESIAN half's images**, forbidden in
the English `upright` and `reversed`. The first three rows listed the English
half's own words instead, which is a table that cannot fail. Filling it correctly
immediately failed The High Priestess: both halves had reached for a full diary as
the reversed mechanism, so the English one became noise instead.

**Scoped to `upright` and `reversed` only; `lore` is exempt and the exemption is
principled.** Both documents describe ONE painting and must share its nouns —
towers, wolf, dog, crayfish, skull. `glosses.ts` exempts its element glosses from
its own table for the same shape of reason.

### THE ASSERTION SHAPE, which is the finding most worth carrying forward

`lore.test.ts` was written as

```ts
expect({ slug, field, word, hit }).toMatchObject({ hit: false })
```

and it fires correctly. **Then it prints `hit: true` and nothing else** — vitest
omits the three MATCHING properties, which are exactly the three that say which
card, which field and which word. Across forty-four documents that is a failure
you cannot act on.

Found by **breaking the lint on purpose and reading the output**, which is the only
way this class of defect surfaces: the test is not wrong, it is useless. Rewritten
to collect into an array and compare against `[]`:

```
[ 'the-moon.id standfirst: "tempoh"' ]
[ 'the-moon.en upright[0]: "abundance"' ]
[ 'strength.id lore: 16 (want 6-14)' ]
```

The block-count case had the identical defect in a different costume — `expected
16 to be less than or equal to 14`, with no way to tell which of forty-four
documents — and was rewritten the same way after it fired for real.

The three deliberate breaks, run and read:

| break | output |
|---|---|
| `tempoh` in the-moon.id's standfirst | `the-moon.id standfirst: "tempoh"` |
| `yesno.reversed` flipped to `no` | `reversed: "no"` against `effectiveYesNo`'s `yes` |
| `abundance` in the-moon.en's upright | `the-moon.en upright[0]: "abundance"` |

### Three near-misses where the lint refused CORRECT prose

Each is the `sobat`/`obat` shape, and each was resolved by rewording rather than by
exempting — because an exemption would be the first on these lists and forty-four
permanent documents is the wrong surface to open that door on.

- **`dokter` is on `THERAPY_ID`, and Death's first Q&A sent a health question to
  one.** That is the correct and safe sentence, and the list is also right: it
  exists so no reader-facing copy sounds medical, and "ask a doctor" is medical
  vocabulary whichever direction it points. Reworded to `layanan kesehatan`
  (`kesehatan mental` is the banned PHRASE and does not match). **The English half
  says `doctor` and passes**, because `THERAPY_EN` has no such entry — the two
  lists are different scopes, not translations of each other.
- **`temperature` is on the product-secret list** and Strength's English lore used
  it to mean heat. Reworded. Recorded because the next writer will hit it too.
- **`the Universe` is on `EN_TICS` and appears inside a genuine Waite quotation**
  about The World. The excerpt was cut at the clause before it rather than
  exempted: a quotation is still the word landing on the page.

**And one block deleted rather than reworded.** Judgement's English half carried a
`quote` whose `source` read *"A. E. Waite, paraphrased"*. A reworded sentence under
a real author's name is VD4's fabricated-fact rule at small scale, and the
block-count ceiling made the choice for free.

### `/arcana` — the roadmap contradiction, and why the file exists

§3.1 said a real 404; §6.1's negative-control list said non-public, and a
non-public path inside the matcher is a **302 to `/login`**. R6 resolved it in
S4's favour: `/arcana` is the parent of twenty-two indexed URLs, and Google reads
a login redirect on a content path as a soft 404.

**S4's own plan asserted the ABSENCE of `src/app/arcana/page.tsx`**, because Next
404s an absent route anyway. That assertion is **inverted, not deleted**. R6
answered S1's objection — widening the allowlist for a path with no page is how
`isPublic` stops being readable — by giving the path a page, so the file existing
is the record of the ruling and its absence would read as the ruling being undone.

Measured on the wire:

```
/arcana            404, no Location header
/en/arcana         404
/arcana/not-a-card 404   (dynamicParams = false, before the module runs)
/arcanax           307   -> /login          (the negative control)
/en/history        307   -> /login          (the one that must never move)
```

### The signed-out crawl, and the head of the document

No cookie jar, dev server, 2026-07-29:

```
44/44 lore URLs        200      (22 slugs x 2 locales)
Set-Cookie             0        on every one sampled
<h1> per page          1
<link rel=alternate>   3        id, en, x-default -- reciprocal both directions
noindex                0
FAQPage                0
@type                  Article, ImageObject, CreativeWork, BreadcrumbList, ItemList, ListItem
sitemap /arcana/ lines 176      (44 entries x 1 url + 3 xhtml:link)
```

**`hreflang` is emitted by Next as `hrefLang`**, camel-cased in the HTML. HTML
attribute names are case-insensitive so this is correct, and a crawl script
grepping `hreflang="` finds nothing. Grep case-insensitively.

### Complete with JavaScript disabled

The property a crawler actually depends on, checked on the raw HTML of
`/en/arcana/the-devil` rather than on a rendered DOM:

```
h1 1   h2 12   h3 4
8 unique /en/arcana/ links + /en/gallery      (the 8-12 band)
disclaimer, share control, both cardMeaning glosses, both verdict words,
the keyword chips and all four Q&A pairs -- all present
1100 words of visible text
```

Loop 5 confirms the same page renders `lang=en` with the English `<h1>` and one
`ld+json` block in the DOM.

### Loop 4, and the widths that were expected to fail

`tools/seo/fit.sh` at 320 / 360 / 390. **NOT a screenshot** — neither Chrome here
gives a phone width and both floor at ~500px.

```
/arcana/the-moon               320,360,390  rootOverflows false, offenders []
/arcana/the-high-priestess     320,360,390  clean   (18 characters in a fact value)
/en/arcana/the-high-priestess  320,360,390  clean
/arcana/temperance             320          clean
/en/arcana/temperance          320,360,390  clean   (Sagittarius + its modality)
```

The plan predicted the fact strip would be the first thing to overflow. It does
not, because `.factValue` carries `overflow-wrap: anywhere` and the grid is
`auto-fit, minmax(140px, 1fr)` — one column at 320 rather than a fixed count.

### The build

`npm run build` exit 0, `audit-secrets: clean`, 42 files scanned.
**`/arcana/[slug]` builds as `ƒ`** — flag 2 predicted exactly this and it is the
symptom of `## Localization` rule 5 working, not a defect. `●` would mean the root
layout had stopped awaiting `getLocale()`.

### What S4 did NOT write, and where it went instead

- **The share control is S1's `PublicShare`**, mounted with the canonical as a
  prop. S4's plan specified an `ArcanaShare` of its own; the single-definition
  register put it with S1, and a second control would be two answers to "what does
  sharing a public page do".
- **The events are `public.*`, not `arcana.*`** (R18). S4's plan declared
  `arcana.viewed` / `arcana.shared` / `arcana.link_clicked`; S1 folded all of it
  into `public.page_viewed` with `page: 'arcana'`, `public.link_clicked` and
  `public.link_shared`. Three near-duplicate families is the failure S-D13 exists
  to prevent.
- **`imageObject()` is in `src/lib/seo/jsonld.ts` and S4 wrote it**, though R9
  assigns it to S3. S3 is blocked on S4a and therefore lands after; a second
  definition of one node type is the reconciliation failure whichever order they
  arrive in.

### Still open

- **Miftah reading four pages, one per stage plus Death, in both locales, on a
  phone.** No lint can tell whether a page is worth reading — every mechanical
  check passes on twenty-two documents of atmospheric nothing, and that is the
  release's first risk. This is the acceptance test and it is not automatable.
- **The Golden Dawn titles and Hebrew letters are single-sourced.** Each document
  cites `angelorum.co`'s correspondence table in its header. VD4 binds a public
  page harder than it binds `/account`; a second independent source per card would
  be the honest next pass, and **Judgement's row is the one most likely to be
  wrong** because the modern outer planets are not in the original system.
- **The lore pages are the first surface where a stranger looks at the art
  closely**, and `docs/art-inconsistency.md` measures the deck as three
  inconsistent generations. Twenty-two pages in sequence is exactly the
  presentation that makes it visible. Regenerating is out of scope (S-D9) and this
  release is what will prompt somebody to ask.
- **The `s-maxage` on `/arcana/:path*` is still unmeasured against a real CDN**
  (R21). S1 owns that check and it needs a Vercel preview.

---

## The Gallery (S3), v0.4.0

`/gallery` is 22 artworks as a 2×11 grid, complete at every phone width, with a
zoom sheet that teaches both glosses and 22 crawlable links into S4's lore pages.
The rules are in `CLAUDE.md`'s `## The Gallery (v0.4.0 / S3)`; this is the evidence.

### The two cross-page defects, and neither was visible to the suite

Both came from S3's own decision to share an `@id` with the lore page's
`ImageObject`, which is the right decision and has a cost the plan did not name:
**a shared `@id` means a consumer MERGES the two nodes, so every field they both
carry has to agree.** Google picks one value for a duplicated field and does not
report which.

1. **`url` was the lore PAGE on `/gallery` and the image FILE on
   `/arcana/<slug>`.** S3's plan argues for the page ("it is the landing page for
   that artwork, and a gallery of 22 images all pointing at `/gallery` gives Google
   Images nothing to rank per card") and S4's node had been shipped with the file,
   which is what Google documents for an `Article`'s `image`. Both are defensible
   in isolation; only one can be true of one node. **Found by reading the JSON off
   the wire** with `curl … | python3 -c 'json.load…'`, after the whole unit suite
   was green.
2. **`caption` was the keyword sentence on `/gallery` and the painting's
   description on the lore page.** Same shape, found by the test written for the
   first one. The resolution is by FIELD rather than by precedence: the lore page
   keeps `caption` (it describes the picture), the gallery carries `description`
   (the upright gloss), and the merged node ends up with one of each — both true.
   `ImageObjectArgs.caption` became optional to allow it.

**The fix that matters is structural.** The 22 image nodes moved out of the page
component into a pure `src/app/gallery/images.ts`, so `imageJoin.test.ts` can build
BOTH graphs from one card and assert the shared fields match, in both locales. That
test imports `arcanaGraph` — S4's module — deliberately: the objection to reading
another workstream's file is that the fence goes red when they edit their code, and
that is exactly the desired behaviour for an assertion whose whole subject is the
agreement between two owners.

**The generalisation worth keeping: a shared `@id` is an interface between pages,
and it needs a test that spans them.** Nothing else in this project has one.

### `referrer_kind: 'direct'` was a literal on two public surfaces

`public.page_viewed`'s `referrer_kind` is the prop that separates an organic
arrival from a reader who was already on the site — §1's whole question — and both
S1's `Landing.tsx` and S4's `/arcana/[slug]` passed the string `'direct'`. **A
constant is worse than a missing field, because it reads as data.**

The cause is structural rather than carelessness: `TrackView` takes its props from
whatever renders it, and on a content page that is a server component where
`document.referrer` does not exist. `ShareViewed` hit the same wall on `/s/` in
v0.3.0. `src/components/PublicPageViewed.tsx` is `TrackView`'s shape with one value
computed on the client, and all three surfaces now mount it.

### The grid, measured (loop 4), and the negative control that took two attempts

`tools/seo/galleryfit.sh` + `galleryfit.js`, committed. Every number S3's plan
predicted came out exactly, identically in both locales:

```
  w    col     cardH    gridH   rows perRow loreH nameLines overflow offenders
  320  138.0   207.0    3009    11   [2]    44    [1]       false    []
  360  158.0   237.0    3339    11   [2]    44    [1]       false    []
  375  165.5   248.25   3463    11   [2]    44    [1]       false    []
  390  173.0   259.5    3587    11   [2]    44    [1]       false    []
```

Plus 22 distinct lore hrefs, 22 distinct `alt` sentences and exactly one disclaimer
at every width. **The plan expected `The High Priestess` to wrap to two lines at
320 and it does not** — `CardFace`'s name plate is sized in `cqw`, so it scales with
the column instead of overflowing it.

**The negative control (`min-width: 260px` on `.tile`) reported GREEN the first
time, and that was the harness being lied to rather than the harness being wrong.**
The line went in at the top of the `.tile` block and the rule's own `min-width: 0`,
four declarations later, won. `getComputedStyle(li).minWidth` returning `0px` is how
it was caught. Placed after that declaration the control gives
`overflow: true` at all four widths with `offenders: ["ul.grid 410>288"]` at 320.
**Check the control actually applied before believing a green control** — a harness
that cannot fail looks exactly like a page that cannot break.

Two things the harness itself had to get right:

- **The JavaScript lives in a `.js` file, not in a double-quoted bash argument.**
  The first version hung `tools/e2e/run.sh eval` with no error and no output for
  three minutes — and every fragment of it worked when sent alone. Passing JS with
  backticks, `??`, regex literals and `${}` through bash quoting is a class of bug
  with no diagnostics. One `sed` substitution of `__WIDTH__` instead.
- **`nameLines` is counted with a `Range`'s line boxes, never
  `height / lineHeight`.** The division reported THREE lines for every card at
  every width, because `.name` carries padding — a confidently wrong metric that
  would have failed a check on a page where nothing wraps.
- **`.srOnly` is excluded from `offenders` by computed style, not by class name.**
  It is a 1px box with `white-space: nowrap`, so `scrollWidth > clientWidth` is true
  by design for all 22; counting them would put 22 permanent offenders in every run
  and hide the real one.

### Loop 5 reproduced the Safari focus bug in WSL Chrome, which CLAUDE.md said it could not

`CardDetail` had the latent version of the `document.activeElement` opener bug for
two releases, with the recorded consequence "smaller, because its opener is a card
in a long list". On a 3000–3600px grid it is not smaller. S3 gave it a
`returnFocusTo` prop filled from the click event's `currentTarget`.

The plan expected loop 5 to prove only that the ref path works, because "this
Chrome *does* focus a button on click". **It does not, for a programmatic
`.click()`** — measured:

```
activeBeforeTap  BODY
activeAfterTap   BODY          <- the fallback would have restored <body>
restoredTo       "Lihat The Moon lebih besar"   <- the tile's own button
```

So the ref path is proven and the fallback is proven insufficient, in WSL, without
a phone. **A synthetic click is a faithful model of Safari's refusal to focus a
tapped button** — which `_accountshot.html` noticed for `PointerEvent`s in v0.3.0
and nobody connected to this bug.

Also confirmed on the real page: tile 19 opens The Moon (`h2` The Moon, numeral
XVIII, two labelled glosses, three keywords, artwork upright, `body.overflow`
hidden), its lore link and the sheet's lore link both point at `/arcana/the-moon`,
Escape closes and restores the scroll lock, and clicking through lands on
`/arcana/the-moon` (`lang=id`, `Arti Kartu The Moon (XVIII)`) from `/gallery` and on
`/en/arcana/the-moon` (`lang=en`, `The Moon (XVIII): Tarot Card Meaning`) from
`/en/gallery`.

### The signed-out crawl, no cookie jar

```
/gallery, /en/gallery      200, NO Set-Cookie, no x-robots-tag
locale pin                 accept-language en-GB -> lang="id"
                           cookie jmt_locale=en  -> lang="id"
                           /en/gallery under accept-language id-ID -> lang="en"
internal links             22 distinct href="/arcana/…" on the id page
                           22 distinct href="/en/arcana/…" on the en page
                           0 cross-locale leak in either direction
canonical + hreflang       reciprocal both ways, x-default on the id URL
ld+json                    ImageGallery, numberOfItems 22, 22 distinct @id,
                           no query string, no `license`, no `null`
sitemap.xml                50 urls, /gallery and /en/gallery once each
negative controls          /arcana 404 with no Location; /arcanax still 307;
                           /s/<slug> still noindex, nofollow, noarchive
```

**The locale pin is the check with the highest severity and the least visibility.**
If middleware left the bare path to `resolveForMiddleware`'s chain, `/gallery` would
be viewer-variant: an `en-GB` browser gets English chrome at the Indonesian
canonical URL, and a CDN serves whichever language warmed the cache to everybody
under a canonical tag and an `hreflang` pair that both claim otherwise. It needs a
hostile cookie AND a hostile `Accept-Language`; no unit test can see it.

### What S3 did NOT build, and why each is a decision

- **No wallpaper download.** S5 has not landed, so `WallpaperDownload` and
  `wallpaperPath` do not exist. S3's plan names omitting the two lines as the
  correct temporary state: a committed `<a href>` to `/wallpapers/…` is a 404 on a
  public page, and a local `wallpaperPath()` would be a second definition of an
  address S5 owns. The placement decisions S3 *does* own are recorded in
  `GalleryGrid.tsx` so S5 does not re-derive them.
- **No `licenseUrl` in the structured data.** `/terms#9` reserves rights rather
  than granting any until S5 writes the wallpaper clause. A licence claim for a
  page that states no terms is the `SearchAction` mistake with legal consequences.
- **No `deps.contract.test.ts`.** The plan's Task 1 asserts S1/S2/S4/S5's exports
  before writing a line. S1, S2 and S4 have landed — so every assertion is also
  made by the code compiling — and S5's absence is a deliberate, documented gap
  rather than something to fail a suite over. The plan itself says that file
  deletes itself at reconciliation.
- **No share control.** S-D8 permits one; the artifact worth sharing is a card, and
  S4's lore page has `PublicShare`. A share button on the index shares the least
  interesting of the 23 URLs.
- **No `openGraph` block.** A gallery-specific preview means a satori route, and 24
  of those across `/`, `/gallery`, `/blog` and 22 lore pages is 24 lambda
  invocations drawing nearly the same picture.

### The 240px thumb is upscaled on every phone, and it is intrinsic to 2×11

The grid draws cards at 138–173 CSS px, so a DPR-2 phone wants 276–346 device px and
gets 240: a **1.15×–1.44× upscale**. A 2-column phone grid cannot be served
losslessly by a 240px source at any column width — it would need ≤ 120 CSS px, and
288px of content minus a 12px gap cannot produce that. The alternatives are the
800×1200 art (3.7MB for 22 cards, on the page whose Core Web Vitals a crawler
measures) or a new 480×720 variant (~1MB more committed, out of scope). At DPR 1 and
≥ 552px the column is 238px and the existing thumb is very nearly 1:1.
`tools/normalize_cards.py`'s `THUMB_W` comment says so.

### Gallery and Writing moved into the account menu (Miftah, 2026-07-29)

Not S3's plan; a phone report against what S1 shipped. `Galeri / Arti kartu /
Tulisan` rendered in the public footer on the landing page and under all 22 lore
pages. The ruling: **the homepage and the card pages should look clean.**

- `AccountMenu` gains `Galeri kartu` / `Card gallery` and `Tulisan` / `Writing`
  below Reading History. Its header said *"DO NOT ADD A FIFTH without a decision
  recorded against VD12"*; this is that decision, inverted rather than deleted.
- `PublicShell`'s `LINKS` table is deleted, not emptied. One link is left, `/`.
- **Deleting the filter with the table let the landing page's footer grow a link to
  itself**, caught by `PublicShell.test.ts`'s "never links to the page it is
  mounted on" — a test whose mechanism-level assertion looked like a tautology
  until the day it fired. The suppression is now `surface === 'landing'`.
- **The crawl was re-measured rather than reasoned about.** Outbound links per
  page: `/` → gallery, arcana/the-moon, blog, login, legal, `/en` (its own body
  sections, which are content); `/gallery` → 22 lore pages, `/`, `/en/gallery`,
  legal; `/arcana/the-moon` → `/`, `/gallery`, neighbours, `/en` twin, legal.
  Nothing is orphaned and no page is a leaf.
- The landing's three body sections stay: they are the homepage's content — what
  closed Google's "an app homepage that is not a login page" blocker — and the only
  public path into `/blog`.

## Wallpaper downloads (S5), v0.4.0

**Every number here was measured in this worktree on 2026-07-29 unless it is marked
as coming from the plan's own 2026-07-28 measurement pass.** CLAUDE.md's
`## Wallpaper downloads (v0.4.0 / S5)` keeps the rules; this keeps the evidence.

### The format decision, and the trick that does NOT scale

Mean over six cards at 1024x1536, PSNR against the source PNG (plan's pass):

| Encoding | mean KB | mean PSNR | p99.9 per-channel error |
|---|---|---|---|
| PNG, `optimize=True` | 2847 | ∞ | 0 |
| PNG quantized to 256 colours | 1381 | — | **17–21** |
| **JPEG q90, 4:4:4** | **555** | **38.00** | **11–13** |
| JPEG q90, 4:2:0 | 472 | 37.19 | — |
| JPEG q92, 4:4:4 | 621 | 38.94 | 10–11 |
| JPEG q95, 4:4:4 | 809 | 41.04 | 8–9 |
| WebP q90 | 471 | 38.99 | — |

1. **PNG-256 IS 2.6x LARGER THAN JPEG q90 *AND* MEASURABLY WORSE**, and this is the
   one worth knowing, because `normalize_cards.py` uses exactly that palette trick
   for `public/cards/og/` and is right to at 200x300. It does not scale: at
   1024x1536 with smooth dark gradients it bands and costs 1.4MB doing it. **Do not
   "reuse the OG approach".**
2. **WebP q90 beats JPEG q92 on both axes and is still not what ships.** The reason
   is the target platform, not the encoder: a wallpaper has to reach iOS Photos
   because *Set Wallpaper* reads nowhere else, and Photos does not treat WebP as a
   native asset type. The evidence there is anecdotal and version-dependent, which
   is exactly why the one download in this product does not bet on it.
3. **65.1% of this deck's pixels are darker than 15% luminance**, so the error that
   matters is the error in the dark: dark-region PSNR 37.64 at q85, **39.15 at q90**,
   40.02 at q92, 41.99 at q95. q92 buys ONE level of p99.9 error for +12% bytes.
   `QUALITY = 92` is the one-line lever if a real phone ever shows blocking.

### The pipeline's one real trap: `fit_to_ratio` would upscale

`normalize_cards.py`'s `fit_to_ratio` trims a dark mat and then scales the trimmed
image to the target. On art that is already correct that costs nothing — **measured
0px trimmed on all 22** — but a 4px trim would LANCZOS 1020 → 1024 and produce
exactly the upscale S-D9 forbids, **from inside the function that looks like the
right one to reuse.** So the pipeline calls `flatten`/`trim_dark_mat` as an
assertion and then encodes the untouched source pixels. This is the thing a future
session is most likely to reintroduce, because reusing the shipping pipeline's own
helper is the obviously correct instinct.

### The oracle's thresholds, each with the negative control that a wrong pipeline gives

| Check | Correct output, all 22 | Negative control | Threshold |
|---|---|---|---|
| Card MAD vs source (64x96 downsample) | **0.123–0.188** | **10.174** (crop, then rescale) | ≤ 1.0 — a 54x margin |
| Phone inner-region MAD | same | same | ≤ 1.0 |
| Left-bar stddev (x < 204) | **0.000** | **19.88** (upscaled to fill) | ≤ 1.5 |
| Left-bar mean RGB | **(10, 8, 19)** on all 22 | — | (10, 8, 18) ±3 |

**THE BAR COLOUR DRIFTS BY EXACTLY ONE LEVEL OF BLUE, ON EVERY CARD,
DETERMINISTICALLY.** `#0a0812` is (10, 8, 18) going in and (10, 8, 19) coming out,
because JPEG's DCT quantization moves it. The oracle asserts a tolerance and never
equality: an oracle written `== (10,8,18)` fails on correct output, and what
somebody does at that point is delete the check.

**And the flatness check is `check_card_art.py`'s `EDGE_UNIFORM_STDDEV` used in
reverse.** There a flat edge strip is a FAILURE — it means the source art is not
full bleed. Here a flat bar is the PROOF that the card was padded rather than scaled
to fill, which is the whole of "no upscaling". Same constant, same instrument,
opposite verdict, and a comment in both files so neither is "fixed" to agree.

### 1440x3120, and the aspect-fill arithmetic

1440 is the widest pixel width in common circulation (Galaxy S24/S25 Ultra), so **no
phone ever upscales this file** — the strongest available form of "no upscaling": we
do not do it and we do not make the device do it either. 3120 puts the aspect at
0.4615, within 0.5% of every modern iPhone (0.4603–0.4614).

The card is 1536/3120 = **49.2% of the canvas height**, so it survives an
aspect-fill crop on anything: a 16:9 screen shows 0.4615/0.5625 = **82%** of the
height, a 4:3 tablet **61.5%**. Both exceed 49.2%. Checked concretely on an iPhone
SE 3 (750x1334): scaled to fill 750px of width the image is 1625px tall, cropping
145px from each end, and the card sits y=412..1212 — inside. The card's top edge is
at 25.4% of the height and iOS puts the clock at roughly 12–20%, so they do not
collide. The card at 1024/1440 = **71.1% of screen width** reads as a framed object.

Two things deliberately not on the canvas: **no gradient** (a subtle dark gradient
in 8-bit sRGB bands on OLED, and the flat mat is nearly free — measured, the padded
1440x3120 file is only **39KB** larger than the bare card, because a flat region is
DC-only), and **no card name or glyph** (the regenerated deck carries no text at
all, and a name burned into a wallpaper cannot be undone by the person who
downloaded it).

### The weight, and idempotency proved the way that matters

`JPEG q90 4:4:4 progressive optimized`: **22 card 11.45MB + 22 phone 12.32MB =
23.77MB, 44 files, 528KB mean**, reproducing the plan's per-card table exactly. R3
ruled both variants ship and refused the reduction to 12.32MB.

Idempotency was not asserted from Pillow's documentation: `git add public/wallpapers`
then a second `npm run wallpapers` then `git status --porcelain | grep -v '^A '`
returns nothing. Every file is byte-identical.

### The live checks

**`curl -i` against `next start -p 3001`** — `npm start` binds 3000, which Grafana
holds permanently:

```
GET /wallpapers/the-moon-phone.jpg
  HTTP/1.1 200                                          not a 302
  content-type: image/jpeg      content-length: 599116
  cache-control: public, max-age=86400, stale-while-revalidate=604800
  set-cookie            0 occurrences                   S-D10
  content-disposition   0 occurrences                   W-D10
  x-robots-tag          absent                          S-D12
  x-frame-options: SAMEORIGIN, both CSP headers present  /(.*) still applies
GET /s/abcdefghijkl -> x-robots-tag: noindex, nofollow, noarchive
```

**F1 IS CONFIRMED EMPIRICALLY NOW, AND THE PLAN SAID IT WAS NOT.** Its flag ended *"I
have not confirmed the 302 empirically"*. A path one letter outside the matcher's
negative lookahead settles it:

```
/wallpapersx/the-moon-phone.jpg   307 -> /login?callbackUrl=%2Fwallpapersx%2F...
/wallpapers/the-moon-phone.jpg    200
```

So the lookahead entry is what makes the asset public, exactly as R7 reasoned, and
the failure it prevents reads as missing artwork rather than as an auth problem.

**Loop 5, every step through real Input-domain events**, body read off the wire:

```
{"name":"wallpaper.downloaded","props":{"card_id":18,"variant":"phone",
  "method":"link","from":"gallery"},"seq":3}
```

`card_id` is the integer, `variant` is spelled like the file on disk, `method` is
`link` because loop 5 is a desktop pointer — so `(pointer: coarse)` is doing its job
— and there is no free text in `props`. The `card` variant fires the same shape.

**THREE HARNESS FINDINGS, ALL OF WHICH COST TIME AND ONE OF WHICH WOULD HAVE
PRODUCED A FALSE CLAIM:**

1. **`tapIn` reads `getBoundingClientRect()` and does NOT scroll**, so a tap aimed at
   a tile **3741px down a 701px viewport** lands on nothing — and `tap` prints
   `tapped "Lihat The Moon lebih besar" -> [exact]` anyway, because the match
   succeeded and only the dispatch failed. The sheet never opened and the verb said
   it did. `scrollIntoView({block:'center'})` first; after it, `top` is 191 and the
   same real tap opens the sheet. (`innerWidth` was 500 with `--width 390`, again.)
2. **Downloads are DENIED in headless Chrome** without `Browser.setDownloadBehavior`,
   so the anchor's own request is never issued — `performance.getEntriesByType`
   shows no `/wallpapers/*` entry and the server log has none. `curl` is what proves
   the bytes. **Navigating to the URL instead renders it**: title
   `the-moon-phone.jpg (1440×3120)`, `document.contentType` `image/jpeg`,
   `naturalWidth` 1440 — which is W-D10's actual claim, that the image is viewable,
   and it also proves the delivered pixels survive Python → git → Next → decode.
3. **`net` truncates a POST body at 200 characters**, so the props were captured by
   patching `fetch` and `sendBeacon` in the page — the technique CLAUDE.md records
   for "does the UI agree with what it sends".

**Loop 4 — `tools/seo/wallpaperfit.{sh,js}`, committed beside `galleryfit`.** The
sheet width is derived, `min(340, w - 40)`, because `CardDetail`'s scrim carries 20px
of side padding: 280 / 320 / 335 / 340 at 320 / 360 / 375 / 390.

```
id   overflow false, offenders [], sameRow false, linkH 44, labelLines 1,
     dimsLines 1, licenceLines 5 4 4 4, blockH 266 247 247 247
en   the same, labelLines 1, licenceLines 4 3 3 3, blockH 247 228 228 228
```

**Negative control run and recorded**, because a harness whose red state has never
been seen cannot be trusted: `min-width: 400px` on the two anchors at w=320 gives
`overflow: true` with five named offenders (`sheet`, `zoomActions`, `downloadSeam`,
`block`, `list`, each `400>280`) — and `getComputedStyle(...).minWidth` was read back
as `400px` FIRST, which is galleryfit's own trap, where the control was silently
overridden by the rule's `min-width: 0` and the harness stayed green.

**AND THE LINE COUNT WAS WRONG TWICE BEFORE IT WAS RIGHT. This is the third time this
one metric has misled somebody in this project.**

- `range.getClientRects().length` returns one rect per line box **per fragment**, so
  a one-line anchor reported **5** (label text + `<span>` + three text nodes inside
  it, since `{width}`, `×` and `{height}` are separate nodes) and `.licence` reported
  5, 7, 8, 9 lines at **increasing** widths — the tell, since a wider box cannot wrap
  more.
- Rounding tops into 2px buckets then reported the English anchor as **2** lines: the
  10px label sits at `top` 424 and its 9px `.dims` at 425, one visual line,
  `align-items: center`, either side of a bucket edge. **A bucket edge is not a
  distance.** Clustering sorted tops with a 4px tolerance is what a line is.
- `galleryfit.js` records the sibling failure: `height / lineHeight` measured padding
  and confidently reported three lines where nothing wrapped.

### Two deltas S1 did not fold in, and one it folded in narrower

S1 is complete, so S5 landed all three itself rather than leaving the feature
uncompilable. The single-owner rule (S-D13) exists to stop six agents editing one
file in parallel; there is no parallel agent left to collide with.

- **The eight `wallpaper.*` catalog keys** (D4) were absent. Indonesian first (I2),
  under `prose.test.ts`'s 320-character and 20,000-byte ceilings, and the longest
  value in the catalog is still `onboarding.intro.body`.
- **The `/wallpapers/*` cache header** was written as `max-age=31536000, immutable`
  from `/cards/*`'s reasoning rather than from W-D4's declaration, and
  `headers.test.ts` asserted the year. Corrected in both places, plus two new cases
  and a negative control that `/cards/*` still has its year.
- **`wallpaper.downloaded` lost `method` and `from`** and had `card` renamed
  `native`. Restored with the argument in the file: a prop spelled differently from
  the asset it describes is a query written against a value that never appears, and
  `method` is the only way to see whether the iOS upgrade runs in production.

### Clause 9, and the licence claim it unlocked

F2 was real: clause 9 asserted the artwork is ours and its personal-use sentence was
scoped to **readings**, so nothing in the agreement mentioned downloading the art. One
sentence per locale, appended inside the clause with no renumbering, so
`legal.test.ts`'s clause anchors and clause-6 sub-numbering are untouched. Worded to
match `wallpaper.licence` exactly — a licence line that paraphrases the clause is a
second, slightly different licence.

That is what makes `licenseUrl: /terms#9` on the gallery's 22 `ImageObject`s honest,
and `imageJoin.test.ts`'s assertion was **inverted rather than deleted**: it read
`licenseUrl === undefined` with the comment "until S5 writes clause 9's grant".

**`contentUrl` was NOT moved to the wallpaper, and that is a decision.** D6 asks for
it and the reason is right — Google Images wants the highest honest resolution — but
this node describes ONE binary: `encodingFormat` documents `contentUrl`'s MIME type,
and `url`, `width` and `height` are the fields `/arcana/<slug>` also carries under
the same `@id`. Moving `contentUrl` alone leaves declared 800x1200 WebP dimensions
belonging to a different file, which is the same class of ambiguity as the two
`@id` collisions S3 records. Moving all four means editing S4's `jsonld.ts` in the
same commit and changing the image identity of 22 pages. Worth doing as one change.

### One thing about this branch's history

`tools/seo/wallpaperfit.{js,sh}` are committed inside **`593e1de`, a docs commit about
Upstash's Singapore region**, and its message does not mention them. Two Claude
sessions were working in this worktree at the same time and the other one's
`git add` swept S5's staged harness. Nothing is lost and no file is wrong; the record
for those two files is this section rather than their commit message.

### Still open, and only hardware can close it

**Loop 6 — a real iPhone against a Vercel preview.** Nothing above substitutes, and
CLAUDE.md gives two live bugs as proof that loop 5 cannot. Three questions:

1. **Does a downloaded `-phone.jpg` reach Photos, and does *Set Wallpaper* accept
   it?** This is the whole feature and it is a release blocker. If the share sheet's
   "Save Image" does not appear, `wallpaper.saveHint`'s long-press instruction is the
   entire mechanism.
2. **Does the card look right on a lock screen** — is 71.1% of the width correct,
   does the clock overlap the composition, is the aspect-fill crop invisible?
3. **Is q90 blocking visible in a dark gradient on OLED?** If yes, `QUALITY = 92` in
   one place and the weight goes 23.77 → ~26.6MB.

Also open: the `s-maxage`-style cache header is measured on `next start` and **not**
against a Vercel CDN (R21); `tools/check_card_art.py:mean_colour` still uses
`Image.Image.getdata`, deprecated in Pillow 12 and removed in 14 (F6, not S5's, and
the two new scripts use `load()`/`tobytes()` so they do not acquire it); and the
1440x3120 canvas is chosen against a 2026 device census, which ages (F7).

## The blog (S6), v0.4.0

CLAUDE.md's `## The blog (v0.4.0 / S6)` keeps the six rules. This is the evidence: what
the plan asked for and did not get, the three defects the suite did not notice, the loop-4
table, and the crawl.

### The seam with S4, and what actually happened to it

S6's plan opens with an `AMENDED` block conceding four things to S4 mid-draft, and
reconciliation R16 ratified the concessions and ruled on four field-level asks. **By the
time S6 was executed, S4 had landed and `src/content/types.ts` was the PRE-R16 union** —
`heading` with no `id`, `list` with no `ordered`, `paragraph.text: string`, no `Inline`.
So the ruling had to be applied to a file another workstream had already finished, which
is the state S5 was in when it landed S1's two missed deltas.

The property that made it safe, and the one to check before widening anything there
again: **every change was optional or a union with what was already there.**

| ask | R16 | how it landed |
|---|---|---|
| `heading.id?` | granted | optional — `Prose` emits the attribute only when present |
| `list.ordered` | granted | **optional**, absent means unordered |
| `paragraph.text: string \| Inline[]` | granted, with a guard | `Phrasing`, a union |
| `callout` | **refused** | no sixth kind; two asides became paragraphs |

**Not one of the forty-four lore documents needed an edit.** That is the evidence the
seam held, and `types.contract.test.ts` asserts S4's plain-string shapes still typecheck
so a future "tidy-up" to `Inline[]`-only fails rather than starting a 44-file rewrite.

R16's guard is the part most easily lost: it granted `Inline[]` **because `plainText()`
joins spans with the empty string**, so the copy lint still sees the exact reader string.
Two tests hold it — `doc.test.ts`'s direct assertion and `blog.content.test.ts`'s
adjacency case — and R16 says in those words that deleting either means reverting to
`text: string`.

### Three things the plan specified that could not be built, and why each was dropped

None of these is a shortcut; each is a consequence of S1 having closed `events.ts` first
(S-D13: **one owner per release, everyone else declares and S1 folds in**).

1. **`ScrollDepth` and `content.scrolled`.** The plan's `## Analytics deltas` declares
   four `content.*` names. The folded taxonomy has five `public.*` events and no
   scroll-depth event at all — reconciliation R18 ruled the namespace to `public.*` and
   S1 transcribed the agreed set. Adding a sixth now is editing a closed workstream's
   data dictionary, which is exactly what S-D13 exists to prevent. **The four
   `IntersectionObserver` sentinels are not built and nothing renders `data-depth`.**
2. **The delegated in-prose link listener, and `data-content-link` on every `<a>`
   `Prose` renders** (plan §D9). `public.link_clicked`'s `to` union is
   `sign_in | app | gallery | arcana | blog | terms | privacy | wallpaper | locale` —
   **no `anchor`**, and `linkKind()`'s fifth value is exactly that. So the listener would
   have needed a union widened in S1's file for an in-page jump. Dropped; in-prose
   clicks are unmeasured, **which is already true of the 44 lore pages' `cardRef`
   links**, so this is consistency rather than a new gap. The index's three orientation
   links fire the event through `TrackLink` with a literal `to`, which is what
   `/arcana/[slug]` already does for its gallery link.
3. **`content.share.action` / `.copied` and `SharePage.tsx`** (plan §D4, Task 10). S1
   shipped `PublicShare` and `public.share.{button,copied,failed}` before S6 ran. A
   second component and a second key pair for one button is the `arcana.upright`
   mistake S3 records — the gallery would have been the third spelling of one word.

### Three defects a green build did not notice

**1. `t('blog.readingTime', { minutes })` typechecked as a MISSING KEY, not as a wrong
call.** `blog.readingTime` is a plural family, so the catalog holds `.one` and `.other`
and no bare `blog.readingTime` — and `t()` is typed over `keyof typeof id`, so the error
was TS2345 naming 323 other keys. The fix is `t.plural('blog.readingTime', minutes)`,
**and the catalog parameter had to become `{count}`**: `plural()` injects the count
itself and a `{minutes}` placeholder would have rendered literally. Found by
`npm run typecheck`, which is the only thing that could have: the value reads perfectly
in the catalog and the call reads perfectly in the page.

**2. `src/content/copy.test.ts`'s locale-naming case failed on `blocks.ts`.** That case
asserts every file under `src/content/` is named `*.id.ts` or `*.en.ts`, because the
lint derives the locale from the filename and `the-moon.ts` would be skipped SILENTLY.
`blocks.ts` is legitimately locale-free. The exemption list went `(index|types)` →
`(index|types|blocks)` **and is now documented as a CLOSED SET**: not "files that happen
to be locale-free", but the three whose emptiness of prose is asserted elsewhere.
Adding a fourth name without that guarantee is how a document escapes the lint.

**3. `types.test.ts` asserted `expect(code).not.toContain('ordered')`.** S4 wrote it
with the reason *"a numbered list in lore is a how-to, and a how-to about reading tarot
is S6's article, not a card's page"* — right about lore, wrong about the union, and R16
had already granted the field. **Inverted rather than deleted**, and the replacement is
stronger than the original: it asserts `ordered?: boolean` and fails on
`ordered: boolean`, which is the property that kept 44 documents untouched.

### The lint, and the one entry that had to come out of it

`blog.content.test.ts` is 36 cases. Three worth naming:

- **The span-adjacency case has a negative control, and it needs one.** It passes on
  four correct documents, which is precisely the state in which a broken whitespace
  checker is indistinguishable from a working one. The control constructs
  `[s('Lihat'), link('/gallery', 'galeri')]` and asserts the predicate says `false`.
- **`' api '` is not in the product-secret list** (reconciliation §8, raised by S6 while
  writing). `api` is Indonesian for fire and the article names the four elements, so the
  substring check fired on `elemen api` in correct copy. `api key` and `/api/` are the
  shapes that would indicate a leak. **A lint that cries wolf is a lint somebody
  deletes.**
- **`prompt` IS in it, and it cost one English sentence.** The draft read *"the card is a
  prompt for a sentence you already had"* — an ordinary English noun, matched as a
  substring, correctly flagged. Rewritten to *"an invitation to say"*. Worth recording
  because the next English article will hit the same word.

The lint also duplicates `copy.test.ts`'s Malay/therapy/tic checks on the TYPED structure
rather than on string literals. That is not redundancy: `copy.test.ts`'s own header asks
for it — *"importing the registry and walking the typed block union is strictly better
than this regex"* — and the regex still covers a document no registry imports, which is
the state a half-finished article is in.

### The four documents, measured

| document | words | reading time | description | title |
|---|---|---|---|---|
| `what-tarot-is.id` | 1270 | 6 min | 156 chars | 43 |
| `what-tarot-is.en` | 1616 | 8 min | 157 | 56 |
| `how-to-read-tarot.id` | 1693 | 8 min | 156 | 51 |
| `how-to-read-tarot.en` | 1995 | 10 min | 157 | 53 |

**The plan predicted ~2,400 words for the how-to and the Indonesian came in at 1,693.**
Indonesian says the same thing in fewer words — no articles, fewer prepositions, heavy
compounding — so the length floor in the lint is 1100 rather than the plan's 1200, and a
word count is a poor cross-language proxy for how long a page takes to read. Nobody has
measured Indonesian reading speed; `readingMinutes` uses 200 wpm for both and the label
says *"sekitar"* / *"about"* (S6 F6, reconciliation §7).

The divergence between locales is enforced, not trusted. Per article the two documents
must share no `cardRef` card, no set of recommended `/arcana/` pages, no title and no
description, and each must have at least one level-2 section the other does not:

| article | `id`-only sections | `en`-only sections | worked card |
|---|---|---|---|
| `how-to-read-tarot` | `preparing` | `one-card`, `a-good-reading` | The Moon / Temperance |
| `what-tarot-is` | `origins`, `not-for` | `how-it-works`, `skeptics` | The Fool / Justice |

### Loop 4 — the article measure, and the thing it found

`tools/seo/blogfit.{sh,js}`, committed beside `galleryfit` and `wallpaperfit`. It
constrains `article[class*=page]` to a known width and reads a `ch`-calibrated probe
against the paragraph's own computed font — **never a hardcoded 8.4px advance**, which
silently stops being true the day `--font-body` changes.

Sixteen measurements — four widths × four documents. **`contentPx` and `chars` are
identical across all four documents at each width**, which is the point: the measure is a
function of the container and the font, never of the content.

```
  w   contentPx  chars     how-to.id  what-is.id  how-to.en  what-is.en   (h1 lines / ToC rows)
 320     288       32        4 / 11      3 / 7      4 / 12      4 / 7
 360     328       36        3 / 11      3 / 7      3 / 12      4 / 7
 375     343       38        3 / 11      3 / 7      3 / 12      3 / 7
 390     358       40        3 / 11      2 / 7      3 / 12      3 / 7

 chWidth 9.06px at every width, in both locales -- Cormorant Garamond at 19px.
 overflow false and offenders [] in all sixteen. tocDead [], proseDead [] in all
 sixteen. pageH 7351-12524px, so the how-to is about nine phone screens.
```

**`chars` is 32 at 320px against the 45-75 guideline and that is arithmetic** (S6 F4,
reconciliation §7): 288px at 9.06px per character cannot reach 45, and getting there
needs ~14px type. Padding is the lever and it is already spent, 20 → 16.

**THE LINE-COUNT METRIC IS CLUSTERED WITH A TOLERANCE, WHICH IS S5's SCAR PAID FORWARD.**
`getClientRects().length` counts fragments, so a paragraph with an inline `<a>` reports
several rects for one line; 2px buckets then split two rects either side of a bucket
edge. S5 got that metric wrong twice — *"the third time that metric has misled someone
here"* — so this clusters rect tops at half the line height. The `h1Lines` column above
is the metric that would have been wrong: four lines of a 28px display face at 320px is
correct and a fragment count would have said more.

#### The negative control FAILED TO GO RED, and fixing that fixed the harness

`min-width: 420px` on `.p` in `Prose.module.css`, measured at 320px: `contentPx` came back
**420** — a paragraph 132px wider than the page — and `overflow` came back **false** with
an empty `offenders`. `getComputedStyle(p).minWidth` returned `420px`, so the rule WAS
applied. **The control was armed and the harness could not see the defect.**

The cause is a distinction worth carrying to the next harness:

> **`scrollWidth > clientWidth` on a block answers *"does this block's CONTENT overflow
> its own box"* — not *"is this block wider than its container"*.** A `min-width` makes the
> element itself wide, so its own content fits perfectly and the overflow lands on the
> PARENT's `scrollWidth`, which is where a phone's horizontal scrollbar actually comes
> from.

And the second form is the commoner real failure: a long unbroken URL, a wide table, an
unwrapped code span. So `blogfit.js` now measures three things — a block's content against
its own box, a block's box against the body's column, and the container chain — and the
re-armed control names all three:

```
overflow true
offenders ["p box 420>288" x23, "body content 420>288", "article content 436>320"]
```

Reverted, and the four widths re-measured green with the fixed harness.
**A harness whose red state has never been seen is worth nothing, and this one was worth
nothing for about twenty minutes.**

**`chars` is ~32 at 320px against the 45-75 guideline and that is arithmetic** (S6 F4,
reconciliation §7): 288px at 9.06px per character cannot reach 45, and getting there
needs ~14px type. Padding is the lever and it is already spent, 20 → 16.

**THE LINE-COUNT METRIC IS CLUSTERED WITH A TOLERANCE, WHICH IS S5's SCAR PAID FORWARD.**
`getClientRects().length` counts fragments, so a paragraph with an inline `<a>` reports
several rects for one line; 2px buckets then split two rects either side of a bucket
edge. S5 got that metric wrong twice — *"the third time that metric has misled someone
here"* — so this clusters rect tops at half the line height.

**WHAT IT FOUND: `PublicShare`'s button is 36px tall at every width, under the 44px iOS
minimum.** It is S1's component and its own stylesheet, and it already ships under 22
lore pages, so it is pre-existing rather than S6's to fix (§6 file ownership) — but
nothing was reporting it before, and `blogfit.sh`'s `smallTargets` is now what does.

### And a second S1 finding, which contradicts a sentence in the reconciliation

**`PublicShare` RENDERS ITS BUTTON IN THE SERVER HTML, SO WITH JAVASCRIPT OFF THE
CONTROL IS PRESENT AND DEAD.** Verified by `curl` on `/blog/what-tarot-is` and on
`/arcana/the-moon` — the same markup on both:

```html
<button type="button" class="PublicShare-module__…__button">Bagikan halaman ini</button>
```

S6's plan flag 5 said the opposite would ship — *"it renders `null` until mounted… a dead
button is worse than no button"* — and **reconciliation §7 recorded it as a settled fact
about the release: *"The share control is invisible without JavaScript"***. It is not.
`PublicShare` has no `mounted` guard, no `useEffect`, and returns its markup on the first
render.

This is **pre-existing on twenty-three pages and S1's file to change**, so S6 did not
touch it. It is written down here because reconciliation §7 is the document a future
session will consult, and it currently states a property the code does not have — which
is worse than an open item, because nobody goes looking for it. The fix is four lines
(`const [mounted, setMounted] = useState(false)`, an effect, `if (!mounted) return null`)
and the decision is whether a permanently-visible control that works for ~99% of visitors
beats no control at all for the rest. **Not S6's call and not S6's file.**

### The crawl, signed out, no cookie jar

Six URLs — `/blog`, `/en/blog` and both articles in both trees. Every one **200**, every
one carrying **zero `Set-Cookie`**, **no `x-robots-tag`** (S-D12 has not spread) and no
`content-disposition`.

The locale checks, which are the ones nothing else can do:

```
Cookie: jmt_locale=en        -> /blog/how-to-read-tarot is INDONESIAN   ✓
Accept-Language: en-GB       -> INDONESIAN                              ✓
?lang=en                     -> INDONESIAN (inert on content, S2 F5)    ✓
/en/blog/how-to-read-tarot   -> ENGLISH                                 ✓
```

**All three hostile inputs lose to the URL** (§4.1), which is the property that stops a
CDN serving whichever language warmed the cache to everybody under a canonical claiming
otherwise.

Off the wire: a canonical at the bare path, three `alternate` links (`id`, `en`,
`x-default`), an Indonesian `<title>`, an unknown slug **404**, and the sitemap carrying
exactly six blog rows.

**ONE `application/ld+json` BLOCK, NOT TWO, AND THE PLAN EXPECTED TWO.** `graph()` wraps
both nodes under one `@context` — S4's pattern, and two contexts is valid markup that
doubles the bytes on the pages whose TTFB a crawler measures. Parsed off the wire:
`BlogPosting` with `inLanguage: 'id'` (the bare tag, R15 — the plan's own test spelled
`en-GB`), `wordCount: 1693`, `author` and `publisher` by `@id`, `isPartOf` the `Blog`
node, an `ImageObject` at `#hero`, and a three-rung breadcrumb `/` → `/blog` → article.
**No `&amp;` anywhere in it**, which is the failure `JsonLd.tsx`'s pre-escape exists to
make impossible and which no validator flags.

### NO CONTENT ROUTE IS CACHED IN PRODUCTION. R21 IS CLOSED, AND THE ANSWER IS "NONE OF IT"

**MEASURED AGAINST THE REAL VERCEL CDN, 2026-07-29, on the v0.4.0 production deploy.**
R21 — *"the cache-header question has ONE owner and it is a blocker on the S-D10 claim"* —
is now answered, and the answer is worse than any of the four plans that flagged it
guessed.

**EVERY** content route, in **both** trees, answers Next's dynamic default and never
caches:

```
/blog                   private, no-cache, no-store, max-age=0, must-revalidate   MISS
/en/blog                private, no-cache, no-store, max-age=0, must-revalidate   MISS
/blog/what-tarot-is     private, no-cache, no-store, max-age=0, must-revalidate   MISS
/en/blog/what-tarot-is  private, no-cache, no-store, max-age=0, must-revalidate   MISS
/gallery                private, no-cache, no-store, max-age=0, must-revalidate   MISS
/en/gallery             private, no-cache, no-store, max-age=0, must-revalidate   MISS
/arcana/the-moon        private, no-cache, no-store, max-age=0, must-revalidate   MISS
/en/arcana/the-moon     private, no-cache, no-store, max-age=0, must-revalidate   MISS

x-vercel-cache: MISS on two consecutive fetches of the same URL. Nothing warms.
```

**ALL EIGHT `next.config.ts` CONTENT ENTRIES ARE INERT — 54 indexable pages** (`/`, `/en`,
`/gallery` ×2, 22 lore pages ×2, `/blog` ×2, two articles ×2). The entire argument S-D10
made for `s-maxage` over multiple root layouts — TTFB for a crawler — buys nothing today.

#### An intermediate measurement said something different, and it was a local artifact

**This section first recorded "four of eight entries are inert and the four are exactly the
English tree", from `npx next start -p 3002`.** On that local production server the bare
paths *did* answer `public, s-maxage=3600, stale-while-revalidate=86400` and only the
`/en/` twins fell back. **On Vercel neither half survives.** Kept rather than corrected
away, because the lesson is CLAUDE.md's own and this is the fourth time it has been paid
for: **`next start` is not Vercel, and a header measured on it is a hint rather than a
fact.** Anybody re-measuring this locally will see the asymmetry again and conclude the
bare tree is fine. It is not.

#### The diagnosis, which is exact

**The middleware matcher is the discriminator, and the contrast is clean.** Paths the
matcher EXCLUDES get their configured header verbatim on the CDN:

```
/wallpapers/the-moon-phone.jpg   public, max-age=86400, stale-while-revalidate=604800  ✓ S5's
/cards/18_moon.webp              public, max-age=31536000, immutable                   ✓ S1's
/robots.txt                      public, max-age=0, must-revalidate            HIT (cached)
/sitemap.xml                     public, max-age=0, must-revalidate            HIT (cached)
```

Paths the matcher MATCHES lose `cache-control` and keep everything else. On `/blog`, the
catch-all's `content-security-policy`, `content-security-policy-report-only`,
`referrer-policy`, `x-frame-options` and `x-content-type-options` **all arrive**. So
`headers()` runs; it is `cache-control` alone that the rendered response replaces.

**`headers.test.ts` CANNOT SEE THIS AND NO CONFIG-LEVEL TEST CAN.** It asserts the eight
entries exist. They do. They are also inert, and the only instrument that reports it is
`curl -D -` against a deployed URL — which is why this belongs in the release checklist
next to `crawl.sh` rather than in the suite.

#### The candidate fix, and why S6 did not apply it

`src/middleware.ts` already discriminates a content response exactly — the outer wrapper
marks it with an internal header, strips every `Set-Cookie` from it, and is fenced by
`content.kind !== 'passthrough'` so a signed-in `/`, `/login` and `/api/auth/*` are
untouched. **Setting `Cache-Control` in that same block is one line in the one place that
provably knows the answer**, and it needs no `next.config.ts` entry at all — which would
then make all eight of those entries deletable rather than merely inert.

Not applied here because **`src/middleware.ts` is S2's file and `next.config.ts` is S1's**
(roadmap §6.2, §6.4), this is a cross-workstream design decision rather than a missed
delta, and the failure mode of getting it wrong — caching a response that carries a
session — is worse than the bug being fixed. It wants the owner, one `curl` per content
route afterwards, and a `crawl.sh` clause asserting `x-vercel-cache: HIT` on a second
fetch so the next person cannot ship this state again silently.

### Still open

- **The `/en/` cache header, above. It is the release's most consequential open item and
  it is S1/S2's.** `blogfit.sh` and `crawl.sh` both run against dev, where every route is
  `no-cache`, so neither would have found it; `npx next start -p 3002` did.
- **Nobody has read either article on a phone.** Reconciliation §8: *"no lint can tell
  whether a page is worth reading"*, and every mechanical check passes on atmospheric
  nothing. The acceptance test is Miftah reading both, in both languages, on glass.
- **No content route caches in production and all eight config entries are inert**, the
  section above. **R21 is measured and closed; the FIX is open**, and it is S1's
  `next.config.ts` and S2's `middleware.ts`. This is the release's most consequential open
  item — every other one is cosmetic beside it.
- **`PublicShare`'s 36px button and its dead no-JS state**, above. S1's file, 23 pages.
- **No RSS** (S6 F10). Out of scope, ~30 lines, no dependency, and the only excluded
  feature that costs nothing to maintain.
- **`og:image` is 2:3 card art on a page whose previews want ~1.91:1** (R20). The ruling
  is a site-level default through `metadataBase`; naming the hero is still better than
  naming nothing.

---

## The answer sheet and the choice verdict (2026-07-29)

Two changes reported together and landed on one branch, `feat/answers-and-choice`.
`/account`'s six answers became readable and editable; every reading came down 30%
and a multiple-choice question now gets one option, in the box the yes/no verdict
already had. The design is
`docs/plans/2026-07-29-answers-and-choice-design.md`; the rules are in CLAUDE.md.
This is the evidence.

### The three findings a green suite did not have

**1. `sql<Date>` LIED AND THE UNIT TESTS COULD NOT SEE IT.** `answersUpdatedAt` was
written as `select({ at: sql<Date | null>\`max(...)\` })`. Drizzle maps a timestamp to
a `Date` when it knows the COLUMN; inside a raw `sql` template there is no mapper, so
postgres.js returned a **string**. `personaStaleness` compares that value with `>`
against a real `Date`, which coerces through `ToPrimitive` and answers *something* —
so every answer edit would have been judged wrongly, with a green typecheck and a
green unit suite, because the unit tests pass real `Date`s in (that is what the type
said). Caught by the integration test asserting `.getTime()`, the only layer that sees
the driver. **The rule was already written one file over**, on `readingsForDay`'s
`hasBody`: *"`sql<boolean>` is an assertion the driver is not obliged to honour."*

**2. THE CHOICE BOX SHIPPED THE EXACT BUG IT WAS BUILT TO PREVENT, FOR ONE COMMIT.**
`validateChoice` guaranteed the box contains only the querent's own words —
word-bounded, capped at 40 characters, sliced out of `readings.question`. Measured
live on the first `npm run smoke -- --all --choice`: three of eighteen readings
answered the marker with a whole clause, `PILIHAN: makan ayam atau ikan nanti siang`.
Every check passed, because a clause from the question IS a word-bounded substring of
the question and 32 characters is inside the cap. **The box would have rendered
`makan ayam atau ikan`** — the confusing non-answer the feature exists to stop,
promoted out of the prose and into the one highlighted element on the page. The
guarantee was true and insufficient: it has to be one of the querent's *options*.
`MULTI_OPTION` is the fix, biased towards rejecting because a false rejection costs
the box and nothing else while a false acceptance ships the report.

**3. THE LOOP-4 NEGATIVE CONTROL WAS DEFEATED EXACTLY AS `galleryfit` WARNED.**
`answersfit.sh`'s header says to check `getComputedStyle` before believing a green
control. It was ignored on the first attempt: `min-width: 420px` was injected at the
top of `.question`, `overflow` stayed false, and the harness looked fine. **The block
ends with `min-width: 0`** — the flex-shrink line — so the injection lost the cascade
and `getComputedStyle(q).minWidth` read `0px`. Injected after that line it reads
`420px` and the harness reports `overflow: true, section 454>320`. A control that
cannot fail is indistinguishable from a harness that cannot see.

### Loop 4, measured

`tools/seo/answersfit.{sh,js}`, against this worktree's dev server, both locales, four
widths. **Eight cells, all clean:**

```
overflow false, offenders 0, smallTargets 0, markWidths [22]
maxTitleLines  id: 2 at 320px, 1 at 360/375/390
               en: 2 at 320px, 1 at 360/375/390
```

Both negative controls proven: `min-width: 420px` (placed to win) gives
`overflow: true` with `454>320`; removing `min-height: 44px` gives
`smallTargets: ["row 26px"] x6`.

**A TRAP THAT COST TWENTY MINUTES AND IS NOT IN ANY OTHER HARNESS: THE MEASUREMENT WAS
AGAINST THE WRONG WORKTREE.** Port 3001 was held by a dev server from
`.worktrees/v0.4.0-seo`, so `npm run dev` here auto-incremented to **3003** and said
so in output nobody read. The harness reported six `clear` buttons reading `Hapus` —
V8's component — which reads as a build cache problem and is a different branch
answering. `readlink /proc/<pid>/cwd` on the port's owner is the check.
**`E2E_BASE` DOES NOT OVERRIDE A RUNNING PROFILE'S BASE**; it is pinned at `launch`.
Pass an absolute URL to `goto` instead of relaunching a Chrome that holds a shared
Google session.

### Loop 5, the round trip

Driven on the real page, dev session planted through `POST /api/auth/dev-session`:

- Tapped a row -> sheet opens, reveals, and offers **Simpan / Tutup only** for an
  unanswered question. No Remove, because a delete on a never-answered question 404s
  honestly and reads as a broken button.
- Typed, saved -> `POST /api/onboarding/answer` body was
  `{"key":"worst_thing","text":"the afternoon the water came up over the step"}` —
  **the request agrees with the field**, which is the question this loop exists for.
- The event carried `{question_key, action: "edited", length: 45}` and **not the
  text**.
- Row's `aria-label` flipped to `Sudah dijawab`, mark to the tick.
- Reopened -> the plaintext came back through the real route, counter `45 / 500`, and
  **Hapus now appears**.
- The column: `v1.0DAuCUIReI6ED…`, 103 bytes, and
  `answer_text like '%afternoon%'` is **false**.
- Removed -> `answer_text IS NULL, skipped = true`. The honest record, not a row
  delete.

### The deferred persona, verified live on both branches

`max(onboarding_answers.updated_at) > personas.updated_at` was `t` after the edit.

- **The ordinary path.** A genuine edit, one refresh: `input_hash` moved
  `0bc194d11f -> c6e3dbffc1`, `model = glm-4.6`. One refresh, not two.
- **The idempotence hole, hit by accident and closed.** Adding an answer and then
  removing it returns the answer set to its original state, so `input_hash` came back
  **byte-identical** — `generatePersona` returned `unchanged`, wrote nothing, and the
  flag would have stayed raised on every page view forever. `touchPersona` moved
  `updated_at` (06:19:38 -> 06:43:52) with the body untouched, and the flag cleared.
  **That branch is not dead code; it is the case a querent reaches by fixing a typo
  and changing their mind.**
- **The Lotus stayed eager**, which is the erasure half: `lotus_avatars.updated_at`
  06:45:25, seconds after the write, and its summary quotes the new answer. Deferring
  it would mean a reading taken before the next `/account` visit was still generated
  from the deleted answer, which `/privacy` clause 3 promises twice.

### The 30% cut: what landed and what did not

Four `--all --choice --fixed` runs, 72 live readings.

```
                   run 1   run 3   run 4
choice violations      9       8       4
budget violations     15       6       8
```

**`spread3` LANDED.** It is coming in at 80-111 words against the old 130-200, in
both locales, with the synthesis paragraph intact and every position and card named.
`en adrian/spread3` measured 18+19+20+23 = 80 and 26+22+21+21 = 90.

**`daily` DID NOT, AND MARGARET'S `daily` IS THE WORST CASE.** It took the largest
relative cut — 55 -> 39 on a two-paragraph service, where `spread3` had four
paragraphs to spread the loss over — and she wrote 53, 84 and 67-word opening
paragraphs against a 51 ceiling **on identical fixed hands**, so that is model
variance on top of a ceiling she is ignoring. Three of run 4's four choice failures
are also `daily`: it has no synthesis paragraph, so *"name the option in your LAST
paragraph"* lands on *"one small concrete thing to watch for today"* and competes with
it.

**THIS IS RECORDED RATHER THAN FIXED, and `budget.ts` has the precedent** — it ships
saying the English `spread3` calibration is not converged. Converging `daily` needs
several more eighteen-call runs and a judgement about how much terseness to trade for
Margaret obeying a ceiling; the alternative on the table is giving `daily` back some
of its cut, which would undo part of what was asked for. **Two `card name missing`
failures are the same pressure** and `services.id.ts` already predicted it in writing:
compression made Thessaly stop naming cards once before.

**The choice-naming check was WRONG TWICE before it was right, both times by being too
strict.** An exact `includes()` failed six correct readings — `stay where I am` came
back as *"staying where you are"*. Stem matching fixed that and then failed the same
readings again, because `stay`, `take`, `go`, `new` and `where` were on the stop list:
**a verb looks generic in a stop list and is the whole answer in a choice.** What
survives is a real finding — `id thessaly/spread3` chose `makan ayam` and closed by
arguing against *ikan*, naming the option it did not pick and never the one it did.

### Still open

- **`daily`'s ceiling is not converged and Margaret ignores it**, above. The one
  number in this change that wants more measurement.
- **Nobody has read a shortened reading on a phone.** The whole point of the 30% cut
  is how it reads on glass, and reconciliation §8 binds: no lint can tell whether
  28 words reads as terse or as clipped.
- **`reading.completed.choice` cannot see a mis-spelled marker.** A model that writes
  `Pilihan -` renders as prose and reports `none`, indistinguishable from a question
  with no choice. `npm run smoke -- --all --choice` is the only instrument for the
  format; the event measures the content.
- **`yesno` asked a choice question still answers `Ya`.** Pre-existing, out of scope,
  and `CHOICE_RULE_*` is deliberately excluded from that task so it cannot grow a
  second box.
- **The sheet is unmeasured on a real phone (loop 6).** A textarea with the keyboard
  up inside a `90dvh` sheet is exactly the geometry WSL cannot answer.

# v0.5.0

## Admin foundation, the gate, and the audit trail (A1)

The surface every other v0.5.0 workstream mounts inside. Plan:
`docs/plans/2026-07-30-admin-foundation.md`, 16 tasks. **The reconciliation
(`docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md`) outranks it and thirteen of its
rulings bind A1** — the ones that changed the work are R1, R3, R7, R20, R23, R30,
R31, R32, R34, R35, R36, R37 and R38.

### The `23502` evidence, which is what makes §1.1 a resolution rather than a preference

Roadmap §3.1 declared `admin_access_log.admin_user_id` as `NOT NULL` with an FK action
of `on delete set null`, and §12.1 framed the contradiction as a question about
*attribution*. It is not. **That combination raises `23502` at delete time, so the
hard delete of any user an admin had ever read about ABORTS** — `/privacy` clause 8's
erasure promise failing for exactly the population most likely to have invoked it,
visible only in a cron log.

Reproduced on a scratch table on 2026-07-30, against the real Postgres 16 container,
rather than by temporarily breaking `schema.ts` and regenerating (same error, no risk
of committing the break):

```
code   : 23502
message: null value in column "admin_user_id" of relation "jmt_scratch_audit"
         violates not-null constraint
detail : Failing row contains (99f37176-…, null, onboarding_answer).
table  : jmt_scratch_audit
column : admin_user_id
```

**READ THE `table` AND `column` FIELDS: THE ERROR NAMES THE AUDIT TABLE, NOT `users`.**
The statement that fails is `delete from users`, and nothing in the message says so.
That is why this would have read as an unrelated audit-table bug in a cron log rather
than as an erasure failure — and it is the general shape worth remembering: **an
`ON DELETE SET NULL` cascade reports the constraint it violated, never the delete that
triggered it.**

`audit.integration.test.ts`'s first two cases are the executable form. Both fail
against §3.1's literal schema.

### `/admin` and `/en/admin` through the existing chain, so nobody re-derives it

R1: **A1's diff to `src/middleware.ts` and `src/lib/auth/gate.ts` is zero lines**, and
the acceptance criterion is `git diff --stat` on both being empty. It is. Roadmap §6
said the matcher needed to learn `/admin`; the matcher is a negative-lookahead
EXCLUSION list, so `/admin` is already covered and adding it would **stop middleware
running on it** — inverting A-D3 and removing the redirect that sends a signed-out
visitor to `/login`.

```
/admin
  contentRewrite('/admin', signedIn)  -> passthrough  (not in CONTENT_EXACT/CONTENT_TREES)
  decide({ pathname: '/admin' })
    isPublic('/admin')                -> false
    !signedIn                         -> redirect /login            (verified by curl)
    signedIn && !onboarded            -> redirect /onboarding        (R34, below)
    signedIn && onboarded             -> next
  requireAdminPage()                  -> notFound() unless allowlisted

/en/admin
  stripLocalePrefix -> { locale: 'en', path: '/admin' }
  isContentPath('/admin')             -> false
  => contentRewrite returns passthrough WITHOUT stripping            (contract G2)
  decide({ pathname: '/en/admin' })   -> matches nothing -> Next -> 404
```

**`isPublic()` gaining `/admin` is not a preference, it is a correctness failure**: that
function short-circuits `decide()` *above* the signed-out arm, so the edit that looks
like it makes the 404 come from Next also makes the surface reachable by a stranger.
`gate.test.ts` has nine assertions whose only job is to go red when somebody tries it.

### The three identities, measured

`tools/admin/probe.sh`, against a dev server with a real minted session
(`POST /api/auth/dev-session`, `DEV_PASSWORD_LOGIN=1`; the script prints the cookie's
length and never its value):

| identity | `/admin*` pages | `/api/admin/**` |
|---|---|---|
| no cookie | 302 → `/login` | **401** from `decide()` |
| signed in, onboarded, not allowlisted | **404** | **404** from `requireAdmin()` |
| signed in, onboarded, allowlisted | **200**, renders `Ringkasan` | (no route yet) |

**Identity 3 was confirmed ON PRODUCTION on 2026-07-30**, by Miftah, signing in as the
allowlisted Google account: `/admin` answers 200. That is the only check that could close
it, and it closes two things at once — **`ADMIN_EMAILS` is stored on Vercel as type
`Sensitive`, so its value cannot be read back by CLI or dashboard**, and a signed-in 200
is therefore the only available proof that the value carries no typo. It also confirms
the whole A-D2 chain on the real edge rather than on `next dev`: middleware passes the
request through, `requireAdminPage()` finds the email on the allowlist, and the page
renders. R34 did not bite, because that account had already completed onboarding.

`AUTH_USERS` was deleted from Vercel in the same session, per `docs/DEPLOY-VERCEL.md`'s
*"Two that must be removed, not set"*. **Checked before deleting rather than after:** its
only reader is `verifyCredentials` inside the `DEV_PASSWORD_LOGIN`-gated Credentials
provider, and `auth.ts:211-215` already wraps that call in a `try/catch` that logs and
returns `null` — so its absence cannot reach a production code path even if the flag were
somehow set. One Vercel entry covered both Production and Preview, so removing it once
removed both and the second call answered `env_not_found`.

Both codes matter and R36 is why: **a probe treating 401 as a failure reds on correct
behaviour, which is how an acceptance test gets disabled.**

Two things the first version of the probe got wrong, recorded because both look right:

1. **Signed out, the "refusal shape" comparison measures middleware against itself.**
   Every path — including `/api/definitely-not-a-route` — answers
   `401 {"error":"Unauthorized"}`, 24 bytes, from `decide()`. `adminNotFound()` is
   never reached, so the section now requires a cookie and says why.
2. **A 404 is ambiguous for an ADMIN while A4–A6 are unlanded, and that is A-D2
   working.** The admin sees 200 on `/admin` and 404 on `/admin/users`,
   `/admin/tokens`, `/admin/blog` — from Next's router, not from the gate. One 200 is
   what proves the identity.

**R35's residual-difference measurement is NOT YET POSSIBLE and is owed by A5.** A1
ships no `/api/admin/**` route, so nothing returns `adminNotFound()` over the wire yet.
For the record, in `next dev` an unmatched `/api/` path answers with a ~38KB
`text/html` error page; the production figure is A5's to record beside its own route.
Until then the claim is what `identity.contract.test.ts` asserts: 404, empty body, no
distinguishing header, and byte-identity explicitly not claimed.

### The nav has three dead links until A4, A5 and A6 land

`ADMIN_PAGES` is the closed route-template list (R32) and the nav renders every entry
with a label — four of them, three of which have no page yet. Deliberate: the
alternative is a second list of which pages exist, which is the drift R32 avoided by
having one list. An admin clicking `Token` before A4 lands gets a 404 they can explain.

### The constant-time compare: what it buys, and what it must not be cited as

`equalsNoShortCircuit` folds every character into an accumulator and `isAdminEmail`
scans the whole list. **A JS string compare under a JIT is not rigorously
constant-time and cannot be made so without leaving the language.** What it buys is
that the loop count does not depend on where the first differing character is, and
that neither an entry's position nor its similarity to the candidate is observable in
the obvious way.

**The threat is thin and saying so is the point.** The value is an email address, not a
secret, and an attacker learns "is X an admin" from the 404-vs-200 they get for free.
It is here because A-D1 asks for it and because it costs four lines. `node:crypto`'s
`timingSafeEqual` is the rigorous answer and is deliberately not used: it would be the
one import in a file whose zero-import property is what makes the security decision
unit-testable. **Do not delete it as theatre, and do not cite it as evidence that an
email is a credential.**

### Three source-level fences that would have failed on prose describing themselves

`allowlist.test.ts` forbids `.includes(`, `.indexOf(`, `.some(` and `process.env` in
`allowlist.ts`; `adminSurface.test.ts` forbids `getT(`, `<main` and `usePathname` under
`src/app/admin/**`. **The plan's own file bodies contained every one of those tokens,
in comments explaining why they are forbidden.** Two different resolutions, and the
difference is worth keeping:

- **`allowlist.ts`: the prose was reworded**, because the plan's acceptance criterion is
  a literal `grep -c 'process.env'` of 0 and a leaf whose whole claim is "no imports, no
  env read" is cheap to describe without naming them.
- **`adminSurface.test.ts`: the fences read COMMENT-STRIPPED source**, because three
  admin files legitimately document exactly what they forbid and the alternative is
  prose that cannot name it. This follows this project's own rule, written twice:
  `queries/contract.test.ts` parses import specifiers rather than grepping because *"a
  rule that fires on prose describing the rule is a rule people delete"* — its first
  version failed against the sentence "Never import from '../client'" in a doc comment —
  and `sitemap.test.ts`'s LEAF fence strips comments for the same reason.

All five `adminSurface.test.ts` fences were broken once, seen red, and reverted: the
gate call, a `getT()` call, a dropped `maxDuration`, a second `<main>`, and a
`usePathname()` import. **A fence nobody has seen fail is a fence nobody knows works.**

### `enable_seqscan = off` needs a STABLE comparand

V8's technique for asserting an index *serves* a predicate rather than merely exists.
The first version of the index test used `where subject_user_id = gen_random_uuid()` and
failed against a perfectly good index: **`gen_random_uuid()` is VOLATILE, so Postgres
cannot use it as an index key at all** and planned a Seq Scan even with seqscan
disabled and a cost of 1e10. A literal uuid fixes it. Anyone copying the technique to a
new index needs this.

### `resetDb()` got ONE of R7's three tables, and the reason is `TRUNCATE`

R7 assigned `harness.ts`'s TRUNCATE list to A1 and asked for all three of the release's
new tables in `0009`'s commit, on the correct ground that a list assigned to nobody goes
stale silently. **It cannot be done: `TRUNCATE` names a relation, so `llm_calls` (A2,
`0010`) and `blog_posts`/`blog_post_locales` (A6, `0011`) would make every `resetDb()`
caller fail with `42P01 undefined_table` from this commit until theirs lands.** A2 and
A6 each add their own, in the migration's commit, and the harness header names the two
owed entries so "was it forgotten?" is answerable without reading a reconciliation.

### Five `/privacy` clauses, not the two A-D16 named

R31, and the three extra are the ones a reader would point at:

| clause | before | why admin access made it misleading |
|---|---|---|
| 4 | *"Three parties, and no others."* | An answer about THIRD parties, read as the exhaustive answer to "who sees my answers" |
| 5 | the honest-limits paragraph | There is now a **second** limit, and the one paragraph about limits is the worst place to omit it |
| 6 | a retention row per data class | `admin_access_log` had none, and the sweep is forbidden to touch it, so the honest row reads *kept indefinitely* |

New sub-clauses `3-1` and `8-1` in both locales; **no existing anchor renumbered** —
`/privacy` §4.4 is cited by name in `src/middleware.ts`, and the T&C precedent is that
sub-numbering is an interface. `legal.test.ts`'s pre-existing anchor-set equality is what
makes "both locales" mechanical, **so the risk was never forgetting `en` — it was
amending too few clauses in both**, which is what eight new content assertions fence.

Written last, from the shipped code (§11 seam 8), which is why the uncomfortable
sentences are in: one key per request, no bulk read, no export, the audit row that gates
the reveal, and **that a question which was REFUSED can be read too** — R31 calls that
the sentence most likely to be omitted, and there is a test for it by name.

Loop 4 (`getBoundingClientRect` in a fixed-width container, via CDP): zero overflow at
320/360/390 in both locales, with `3-1` and `8-1` present in each. **Loop 4 is the loop
for width and a ~390px screenshot is not** — both Chromes here floor the window at
~500px. Whether the amended clause 3 is *readable* on glass is loop 6's and nobody's
task in this release.

### The three event names, and the three folded out

67 → 70. `admin.page_viewed`, `admin.blog_saved`, `admin.blog_status_changed`.

- **`admin.pii_revealed` — dropped.** `admin_access_log` is the record of truth for a
  reveal, and a second copy would put a resource key into the one table whose rows
  survive that subject's erasure.
- **`admin.user_viewed` — dropped.** Opening a page changes no decision — the argument
  that killed `revealed` in v0.4.0.
- **`llm.call_recorded` — dropped.** That is a row in `llm_calls`. **A fact table and an
  event stream recording the same fact is how they drift**, and it is why A2 imports
  nothing from `events.ts` (R47).

**R32 kept `admin.page_viewed` and struck its justification.** A-D18 dropped its sibling
for a reason that applies verbatim to it. The honest reason to keep it is not
decision-support: it is knowing which of six pages is worth maintaining, which is the
input to whether v0.6.0 keeps building this. That reason is written at the declaration,
and once the question is answered the name should go.

**A6's `locale: Locale` is spelled `string`, and that is not a narrowing.** `events.ts`
has no imports by design, so `Locale` is unavailable in it — the
`translation.generated.entity` and `moderation.refused.category` precedent, with the
closed set in the comment.

### Known and deliberate

- **R34: an un-onboarded admin cannot reach `/admin`**, and the redirect to
  `/onboarding` reads exactly like a misspelt `ADMIN_EMAILS`. Documented, not fixed:
  exempting `/admin` means `isOnboardingExempt` learning an admin path, and S-D5's whole
  argument is that this chain must not acquire special cases. The cost is one confusing
  five minutes, once, for one person, and **`.env.example`'s annotation says so, which is
  where somebody will actually be looking.**
- **R38: self-deletion is not revocation.** `requireAdmin()` reads the token, not
  `users.deleted_at`, so a soft-deleted admin keeps access for up to
  `SESSION_TTL_HOURS`. Listing it is the fix; the alternative is a database read on every
  admin request to close a hole that requires the admin to have deleted their own
  account.
- **R37: `ADMIN_EMAILS` is PRODUCTION ONLY**, because Preview shares `DATABASE_URL` with
  Production. In `docs/DEPLOY-VERCEL.md` §6a as well as `.env.example`, per the ruling.
- **The `/admin` shell's CSS is a guess and is labelled one in its own header.** Roadmap
  §0.5 and §12.7: nobody has looked at this dashboard on the machine it will be used
  from, loop 3 at 1440px is the instrument, and it is A4's acceptance step.
- **`recordAdminAccess()` throws and A5 must `await` it before the decrypt.** A1 can only
  guarantee the function throws; the ordering is a property of A5's handler. R30 calls
  this the highest-value seam in the release, because writing it in house style would
  make A5's invariant unimplementable **and looks implemented**.

### Found while verifying A1, NOT A1's and NOT NEW: `/terms` and `/privacy` still emit two cookies

`tools/seo/crawl.sh` against production on 2026-07-30, immediately after A1 deployed:
every content route is clean, and **`/terms` and `/privacy` both carry
`jmt_locale`, `__Host-authjs.csrf-token` and `__Secure-authjs.callback-url`**, so the
script reports `crawl: FAILED` on those two rows and only those two.

**It is not a regression and A1 cannot have caused it:** A1's diff to `middleware.ts`,
`gate.ts` and `prefix.ts` is zero lines (R1, `git diff --stat` empty), and the cause is
structural. `CONTENT_EXACT` is `['/', '/gallery', '/blog', '/arcana']` plus the two
trees — **`/terms` and `/privacy` are not in it**, because they serve both languages at
one address and emit no alternates. So `contentRewrite` returns `passthrough` for them,
and S-D10's cookie strip fires only on `content.kind !== 'passthrough'`. The v0.4.0
"measured after" list in the S2 section names `/ /en /gallery /en/gallery /blog` as
zero-cookie and never claimed these two.

**What IS new is knowing that the crawl script and S-D10's fence disagree.** CLAUDE.md
states the rule as *"A PUBLIC CONTENT RESPONSE CARRIES ZERO COOKIES"*; `crawl.sh` puts
`/terms` and `/privacy` in its path list and applies that assertion to them; the fence
deliberately excludes them. **So the release acceptance test has been red on two rows
since S1 shipped, with nothing recording it as expected** — which is how an acceptance
test stops being read.

Not fixed here, deliberately, and the two ways to fix it are not equivalent:

- **Adding them to `CONTENT_EXACT` is not a one-line change.** It would put them inside
  `isPublicContentPath` (i.e. inside `isPublic()`), make `/en/terms` and `/en/privacy`
  rewrite targets, and oblige an `hreflang` pair for documents that deliberately have
  none. That is S1/S2 territory and a reconciliation question.
- **Amending `crawl.sh` to record the exemption with its reason** is the cheap half, and
  `crawl.sh` is a shared tool roadmap §6 assigns to nobody in v0.5.0 — so A1 flags it
  rather than editing it, which is what §6 is for.

**The reason it is worth a paragraph rather than a shrug:** a stranger reading the
privacy policy leaves with two `authjs` cookies, on the one page in the product that
exists to tell them what they leave with. Small, but the irony is the argument for
fixing it rather than against.

### What A1 did not touch, deliberately

`gate.ts`, `middleware.ts`, `prefix.ts`, `alternates.ts`, `sitemap.ts`,
`api/cron/sweep/route.ts`, `CLAUDE.md`. Four of those got new tests and no production
lines. `admin_access_log` has no retention policy and no sweep entry on purpose —
`/privacy` clause 6 now promises *kept indefinitely*, and that is the whole policy.

---

## The LLM call ledger (A2), v0.5.0

**Before A2 this application made nine distinct LLM calls and recorded the token cost of
exactly one of them.** `/api/reading` threaded `usage` from the provider through `tee.ts`
into `readings.token_input` / `token_output`; the moderation classifier, the gist, the day
summary, the frequency verdict, the Lotus distillation, the persona and both translation
paths all received a fully-populated `usage` object from the adapter and destructured it
away. The provider layer was already correct — both adapters resolve `usage` on every exit
path including a consumer `break`. What was missing was a table and eight reads.

**Governing rulings:** R2 (`tee.ts` gets zero lines), R4 (four statuses, `'refused'`
struck), R5 (`total_ms`, timed at the call), R16 (**fix** `nonZero()`), R17 (**own
buffer**), R18, R47, R48, R49, R50, R51.

### The file map

```
src/lib/llm/prices.ts            PURE, ZERO IMPORTS. Hand-maintained price table.
src/lib/llm/prices.test.ts       The 365-day tripwire, and pickPrice's period boundary.
src/lib/llm/ledger.ts            recordCall, usageOrNulls, resolvedModel, USAGE_TIMEOUT_MS.
src/lib/llm/ledger.test.ts       The two helpers. The sink's branches live in track.test.ts.
src/lib/llm/types.ts             +LLMOp (nine, closed), +CompleteOpts (op REQUIRED).
src/lib/llm/index.ts             metered() records the six buffered sites.
src/lib/llm/callClass.test.ts    +op markers, +the closed-set assertions, both directions.
src/lib/llm/anthropic.ts         nonZero() on the buffered path (R16). Two lines.
src/lib/db/schema.ts             llmCalls. Fifteen columns, five indexes, no updated_at.
src/lib/db/migrations/0010_v12-llm-calls.sql
src/lib/db/queries/admin/calls.ts   insertCalls, callTotals, callTotalsForUser, callsForReading.
src/lib/db/testing/harness.ts    resetDb() gains llm_calls (A1's header asked A2 to).
src/lib/analytics/track.ts       Store.calls, Store.drained, bufferCall, the drain block.
src/lib/analytics/flush.ts       flushCalls.
```

Threaded by hand at the three streaming sites: `src/app/api/reading/route.ts`,
`src/app/api/memory/summary/route.ts`, `src/lib/translate/translate.ts`.

### The invariants, and why each one

1. **`usage` always settles and never rejects, and A2 did not touch that.** Nothing awaits
   it on a hot path, so a rejection is an unhandled rejection.
2. **Every `await` on `usage` is bounded at 2000ms.** *A ledger row with null tokens is a
   fact; a request held open for a token count is a bug.* `USAGE_TIMEOUT_MS` is exported
   from `ledger.ts` so there is one number; `tee.ts` keeps its own private copy because A2
   may not edit that file (R2), so the two are **equal by intent rather than by import — if
   one moves, move both.**
3. **Snapshot mutable state BEFORE awaiting `usage`.** Both new streaming sites build the
   row first and fill the two token fields last. This is `tee.ts`'s `finish()` bug, which
   recorded every abandoned reading as failing for an unknown reason.
4. **A `ReadableStream`'s `pull()` is not in a request scope**, so the streamed
   translation's write is inside `inScope(…)`.
5. **No ledger write is on the path of a byte the user is waiting for.**
6. **A failed ledger write is logged and swallowed, never retried.** W4's two policies: the
   `readings` row gets a bounded retry because a missing row breaks a user-facing memory
   feature; a ledger row breaks a dashboard.
7. **Never log a driver error from a path that runs a query.** `flushCalls` uses
   `flush.ts`'s existing `logFailure`.
8. **`error_kind` is a short classifier, never a message.** `classifyStreamError()` reused.
9. **NULL, never 0, when the provider reports nothing** — on the buffered path too.
10. **`local_date` is the querent's calendar day**, never recomputed from `created_at`.
11. **`model` is the resolved model string, never an env var name**, and never `'fallback'`.
12. **The reservation count per reading is unchanged: one.**
13. **`queries/admin/calls.ts` takes the handle first and reaches no `server-only`.**
14. **The ledger obeys `ANALYTICS_ENABLED`.**

### THE FINDING: `drain()` orphans a nested `defer()` — and a second shape of it

**R17, verified before implementation.** `track.ts`'s `drain()` does
`store.deferred.splice(0)` and iterates the **removed copy**, so a `defer()` called from
inside a deferred job pushes onto the now-empty live array, which nothing drains again —
and `ensureRegistered` returns early, so no second `after()` is registered either. `gist`,
`translation_repair` and the `frequency` regeneration all run in there, so **three of nine
ops would have recorded nothing, with a green unit suite and a green integration suite.**
Same shape as V2's lost translation events, which went unnoticed for as long as V2 had
shipped.

**A2 did NOT fix `drain()`.** Making `defer()` re-entrant is a W4 change with its own blast
radius; the ledger rides its own `store.calls` buffer, spliced **after** the deferred loop,
exactly as the event buffer already is. `track.test.ts` has a case that was run RED by
moving the block: `expected [ 'deferred', 'events' ] to deeply equal [ 'deferred', 'calls',
'events' ]`, and `expected [ 'moderation', 'reading' ] to deeply equal [ 'moderation',
'reading', 'gist' ]` — the second is the gist row vanishing, which is the production symptom
exactly. **The orphaning itself is still live for the next person who calls `defer()` from
inside a deferred job.**

**AND THERE IS A SECOND SHAPE R17 DID NOT COVER, FOUND ONLY BY RUNNING THE APP.**
`bindAnalyticsScope()` registers the drain `after()` **eagerly**, so on a route that also
registers its own `after()` afterwards — `/api/memory/summary` — Next runs the drain FIRST.
A row recorded from inside the route's own callback then landed in `store.calls` with
nothing left to visit it. **Measured: `daily_summaries` had its row, `llm_calls` had none,
and nothing was logged.**

It is not covered by `bufferCall`'s `after()`-throws catch either, because **in this Next
version `after()` called from inside an `after()` does not throw — it silently drops the
work.** That was measured twice: once from a bare `tsx` script in Task 13, and once here.

The fix is `Store.drained`, set by `drain()`, plus a `bufferCall` branch that inserts
directly when it is true — provably off the request path, because the response has already
flushed. **That branch reads `store.ctx` rather than falling through to the anonymous one**,
or the row would be a silently unattributed cost on a request that knew the querent.
Regression test run RED first: `expected "vi.fn()" to be called 1 times, but got 0 times`.

**The generalisation, which is new here: a buffer drained by an `after()` is only safe for
work that finishes before that `after()` runs.** Anything writing from a second `after()`
has to detect that and write through. `bindAnalyticsScope`'s eagerness — which exists to
stop a late `track()` throwing — is what creates the ordering.

### R18 IS CONFIRMED, NOT SUSPECTED, AND IT IS STILL W5's

The same request that lost the `day_summary` ledger row also lost
**`memory.summary_generated`**: `events` held only `memory.summary_shown`, which fires
synchronously in the handler. Same root cause, one table over.

**A2 did not fix it** — W5's file, W5's event, §6 assigns neither, and R18 ruled it out of
scope rather than let A2's diff span a sixth workstream. The remedy is now literally one
word, because `inScope` is already bound in that function for A2's row:
`inScope(() => track(...))`. There is a paragraph at the call site saying so.

**Verify it by grepping a dev log after a real day summary, not by reasoning** — that is how
V2's was found, and note that in this case there is **no** `outside a request scope` line to
grep for, because `after()` drops silently. The check is whether the `events` row exists.

### The nine call sites, as built

| # | site | op | class | streamed | row written where |
|---|---|---|---|---|---|
| 1 | `api/reading/route.ts` | `reading` | interactive | yes | the existing `defer()`, after `persistReading` |
| 2 | `moderation/classify.ts` | `moderation` | interactive | no | `metered()` |
| 3 | `memory/gist.generate.ts` | `gist` | deferred | no | `metered()`, from **inside** `drain` |
| 4 | `api/memory/summary/route.ts` | `day_summary` | deferred | yes | the existing `after()`, via the `drained` branch |
| 5 | `api/memory/frequency/route.ts` | `frequency` | deferred | no | `metered()` |
| 6 | `prompt/lotus.generate.ts` | `lotus` | threaded | no | `metered()`, **unattributed** — R49 |
| 7 | `persona/generate.ts` | `persona` | threaded | no | `metered()` |
| 8 | `translate/translate.ts` (stream) | `translation` | interactive | yes | `inScope(…)` at the end of `iterate()` |
| 9 | `translate/translate.ts` (buffered) | `translation_repair` \| `translation` | as written | no | `metered()`, repair arm from inside `drain` |

**Eight files, nine expressions** (R48): `translate.ts` holds a stream site *and* a
`complete()` site serving two ops, so its `op` is an expression, not a constant.

### The measured rows — one reading with a question

```
op         | model         | class       | streamed | status | in  | out | total_ms
moderation | glm-4.5-flash | interactive | f        | ok     | 970 | 18  | 764
reading    | glm-4.6       | interactive | t        | ok     |     | 201 | 5423
gist       | glm-4.6       | deferred    | f        | ok     | 788 | 27  | 955
```

**Three rows per reading with a question, two without one** (no classifier call), plus a day
summary, a frequency verdict, a translation pair or a persona depending on the visit. A2's
estimate for A3's retention planning: **3–6 rows per reading.**

- **`reading.input_tokens` is NULL and that is z.ai, not a bug.** It reports
  `input_tokens: 0` on the stream, which `nonZero()` turns into NULL. The buffered
  classifier reported a real 970 on one run and a real 1 on another, so the buffered path
  does report input tokens — variably.
  > **RETRACTED 2026-07-30. This was OUR bug and the observation above contains its own
  > refutation** — "the buffered path does report input tokens" is the tell, and it was
  > written down and not followed up. The stream reports them too, in `message_delta`;
  > the adapter read `message_start`. See the retraction under W4 above.
- **A2-D4 is true rather than asserted:** ledger `total_ms` **5423** < `reading.completed`'s
  `total_ms` **5487**, with TTFT **4518**. Three measurements of three different subjects.
  **A3 must not reconcile them.**

### The consistency query, and R15 demonstrated

**Owed to A3, who owns `docs/analytics-queries.md`.** A2 did not edit that file (§6).
Transcribe rather than narrow:

```sql
-- Every reading whose ledger row disagrees with its own denormalized token columns.
-- EXPECTED: ZERO ROWS.
-- `IS DISTINCT FROM`, NOT `<>` (R15): both sides are nullable and `a <> b` is NULL
-- rather than true when either is, so the `<>` spelling returns 0 rows
-- unconditionally and is INDISTINGUISHABLE FROM A PASSING CHECK.
select r.id, r.token_input, c.input_tokens, r.token_output, c.output_tokens
  from readings r
  join llm_calls c on c.reading_id = r.id and c.op = 'reading'
 where r.token_input  is distinct from c.input_tokens
    or r.token_output is distinct from c.output_tokens;
```

**Demonstrated rather than believed.** With a real disagreement injected inside a
rolled-back transaction, `IS DISTINCT FROM` returned **1** and `<>` returned **0**.

The ledger-vs-ceiling query, which needs no `status` filter because A2-D6 writes no row for
a refusal:

```sql
select count(*) from llm_calls where created_at > now() - interval '5 hours';
```

And R49's naming query, for the gap below:

```sql
select count(*) from llm_calls where op = 'lotus' and user_id is null;
```

### R49: the Lotus rows are unattributed, and it was verified

Three W3 onboarding routes have a real querent and **no `withAnalytics` scope**:

```
src/app/api/onboarding/answer/route.ts:103        after(() => generateLotus(gate.user.id));
src/app/api/onboarding/answer/[key]/route.ts:208  await generateLotus(gate.user.id).catch(…);
src/app/api/onboarding/complete/route.ts:190      after(() => generateLotus(gate.user.id));
```

A2 asked to wrap them. **R49 refused** — that is a W3 change for a reporting nicety, and
A2's diff already spans five workstreams. So the gap is accepted and recorded.

**Confirmed live:** a real answer edit produced `op: 'lotus'`, `attributed: f`,
`locale: 'id'` (not the querent's `en`), `local_date` = the UTC date. **A5's per-user cost
page must say that Lotus distillations are unattributed**, or a per-user total silently
under-reports.

### Two pre-existing defects found and NOT fixed

- **`TRANSLATION_MODEL` is recorded but never used.** `translate.ts`'s `persist()` writes
  `TRANSLATION_MODEL || LLM_MODEL` into `translations.model`, but **nothing in that file
  ever passes a `model` to the provider** — `openStream` calls `streamReading(prompt)` with
  no opts and `generate()` calls `complete(prompt, { op, callClass })` with none. So setting
  it changes what the column CLAIMS, not what runs. V2's file; §6 gives A2 one-line reads
  there and no behaviour change. **But `llm_calls.model` deliberately records `LLM_MODEL`
  instead**, because that column is what `prices.ts` is keyed on and a row naming a model
  that did not run prices the wrong rate — silently, in the one table whose purpose is cost.
- **R18's lost event**, above.

### What A2 did not touch, deliberately

`tee.ts` (R2 — zero lines), `openai.ts` (its `nonZero()` asymmetry is a fact about that
provider and its comment says so), `docs/analytics-queries.md` (A3's), the three W3
onboarding handlers (R49), W5's `track()` call (R18), `events.ts` (A-D18 dropped
`llm.call_recorded`, so A2 declares no event and never imports the taxonomy — R47),
`CLAUDE.md`.

### Still open after A2

1. **`drain()`'s original orphaning is worked around, not fixed** (R17). The next `defer()`
   from inside a deferred job hits it.
2. **R18's `memory.summary_generated` is being lost**, confirmed. One word to fix, W5's.
3. **`notionalUsd()` returns `null`** until a human reads a fallback pricing page and adds a
   `PRICES` row. Deliberate: nothing unverified enters that file. **A4's headline must be a
   call count**, which R14 independently requires.
4. **`prices.ts` fails its own suite after 365 days.** The fix is to open the pricing page,
   **not** to bump `verifiedOn` — that converts a tripwire into a lie with a fresh date.
5. **`TRANSLATION_MODEL` does nothing**, above.
6. **A connect-time failure on a stream writes no row** — the day summary's and the
   translation's `openStream` both return null with no tokens and no honest wall time. So
   **the ledger is a LOWER BOUND on the window counter**, and R26 already requires A3 to put
   that sentence on the page rather than only in a plan.
7. **`llm_calls` has no retention policy yet.** A3's, in the sweep, at
   `LLM_CALLS_RETENTION_DAYS=400` (R19). **Never `admin_access_log`.**

## Aggregation, trajectory, and the query layer (A3), v0.5.0

**A3 renders nothing and owns no route.** It is the read layer between A2's fact table and
A4's charts: bucketing, aggregates over an arbitrary range, per-user rollups, a forecast, a
retention policy, and six queries an operator runs by hand. Eleven tasks, all landed.

```
src/lib/analytics/series.ts         PURE, ZERO imports. Bucket keys, day enumeration,
                                    zero-fill, MAX_RANGE_DAYS, isUsableRange.
src/lib/analytics/forecast.ts       PURE. OLS, T95, the prediction band, crossing().
src/lib/analytics/rollup.ts         PURE. OP_ORDER, foldOps, priceRollup, periodDelta,
                                    meanCallsPerDay, burstiness, dailyEquivalentCeiling.
src/lib/db/queries/admin/timeout.ts withAdminRead + the three numbers.
src/lib/db/queries/admin/metrics.ts M1-M10, fleet-wide.
src/lib/db/queries/admin/users.ts   M11-M13 + adminUserById/adminUserList (R29).
src/lib/db/queries/admin/rollup.ts  fleetRollup -- the composite, eight statements.
src/app/api/cron/sweep/route.ts     EDITED: a fifth delete and a nightly size probe.
docs/analytics-queries.md           EDITED: queries 13-18, and query 9 corrected.
.env.example                        EDITED: LLM_CALLS_RETENTION_DAYS, handed over by A1.
```

### The five things measured here that contradicted something written down

**1. postgres.js NEVER ISSUES `RELEASE SAVEPOINT`, and that made `withAdminRead` leak.**
`scope()` in `node_modules/postgres/src/index.js` emits `savepoint sN` and, on the error
path only, `rollback to sN`. On success it simply returns. So a `SET LOCAL` made inside a
**nested** Drizzle transaction persists to the end of the OUTER transaction — and the
integration suite is one big rolled-back transaction, so it went read-only after its first
admin read and failed with `cannot execute INSERT in a read-only transaction` on a line
nowhere near this file, naming no cause.

My psql check had said the opposite, because I wrote the `RELEASE` by hand — **which is
exactly what the driver does not do.** The lesson generalises past this file: *a savepoint
experiment in psql does not model this driver's nested transactions.*

It cannot be undone by setting the GUC back either: `set local transaction_read_only = off`
inside a read-only transaction raises *"cannot set transaction read-write mode inside a
read-only transaction"* **and aborts the transaction**, which is worse than the leak.
Measured 2026-07-30. So `withAdminRead` opens its **own** savepoint and releases it, which
is what pops both settings, and there is a regression test named for the outcome.

**2. `set transaction read only` does NOT have to come first in the block.** A3's plan §1.5
said it *"comes before any other statement in the block or it errors"*. Measured on Postgres
16: the access mode may be set after a query. The "must be first" rule is the **isolation
level's**. The `SET LOCAL transaction_read_only` spelling is used anyway, because it is
explicit about the scope that matters.

**3. The `::int` cast on `make_interval` does not reproduce, and the cast stays anyway.**
Since W7 the sweep route, both its tests and its comments have said
`make_interval(days => $1)` fails without an explicit `::int` because *"a bound parameter
arrives as `text` and there is no `text` overload"* — and `sweep.contract.test.ts` fails a
build over it. **Measured against the local Postgres 16 with the shipped postgres.js on
2026-07-30: neither `${400}` nor `${'400'}` raises anything.** The driver describes the
parameter and the server infers `integer` from the signature.

**The cast is kept and its justification is REWRITTEN**, on CLAUDE.md's own rule — framework
behaviour is measured here, never recalled, and parameter type inference is an unspecified
implementation detail of a driver plus a server version. A `DELETE` that runs unattended at
03:17, whose failure would first appear a month after launch, must not rest on one. That is
the `JsonLd.tsx` argument, and it is a different argument from the one the comment used to
make. **Deleting the tripwire because its stated reason turned out to be wrong would have
been the mistake available here.**

**4. `readings_user_local_date_idx` CAN serve a fleet-wide `local_date` range — it just
cannot seek.** A3's §9.1 says it *"cannot use"* the index because the leading column is
absent. Measured:

```
set enable_seqscan = off;
explain select count(*) from readings
 where local_date >= '2026-07-20' and local_date <= '2026-07-25';

Aggregate  (cost=1664.15..1664.16 rows=1 width=8)
  ->  Index Only Scan using readings_user_local_date_idx on readings  (cost=0.14..1664.10)
        Index Cond: ((local_date >= '2026-07-20'::date) AND (local_date <= '2026-07-25'::date))
```

A **full** index-only scan with the range applied to the second column. The work is
proportional to the whole index rather than to the range, which is the same complexity as
the seq scan the planner actually prefers at this size, minus the heap. **The plan's reason
was wrong and its conclusion was right**: the candidate `readings_local_date_idx` stays
declared and unbuilt, with the trigger stated (`readings` past ~100k rows, or M6 at a
400-day range past 500ms against Neon).

**5. At 44 rows `pg_total_relation_size` is 9× the heap, not the ~2× the retention
arithmetic assumes.** 144 kB total against 16 kB heap, because five indexes each cost a page
whether or not they hold anything. The small-table ratio is overhead-dominated and says
nothing about a steady state; query 18 prints both so nobody reads one for the other.

### R15, demonstrated rather than believed

The ruling says a `<>` spelling of the A-D17 check *"can never fail"*. That is now a paste
in `docs/analytics-queries.md` §16 rather than a claim. In a rolled-back transaction with
**one** `NULL vs 0` disagreement injected — the exact shape roadmap §12.6 described, a
buffered z.ai call storing `0` where its streamed twin stored NULL:

```
=== IS DISTINCT FROM ===        === the SAME data, with <> ===
 rows_found                      rows_found
------------                    ------------
          1                               0
```

`metrics.integration.test.ts` runs the same pair as a test, with the `<>` predicate written
out beside the shipped one. **A check that cannot fail must be *seen* to be unable to fail**,
because the alternative is a green check that has never been able to go red.

### Two prose-fires-the-rule traps, in one commit

`queries/contract.test.ts` records the class in one line — *"a rule that fires on prose
describing the rule is a rule people delete"* — and A3 hit it twice on the same afternoon:

- **`forecast.test.ts` asserting the module reads no `process.env`** failed, because the
  file's own header says the words *"no `process.env`"*.
- **`sweep.contract.test.ts` counted 5 `make_interval` calls instead of 4**, because the new
  retention parser's comment quotes the `make_interval(days => 0)` disaster it prevents. And
  the `admin_access_log` negative control failed for the same reason: the route's header now
  explains **why** that table is not swept.

All three now match a **comment-stripped** copy of the source. The generalisation is worth
having: **any grep-based fence over a file whose header explains the fence has to strip
comments, or the file cannot carry its own reasoning.** The alternative people reach for is
deleting the explanation.

### The decisions A3 took that the plan did not settle

**`OP_ORDER` lives in `src/lib/analytics/rollup.ts`, not in A2's `types.ts`.** A3's §12
asked A2 for `LLM_OPS` as a **value**; A2 shipped `LLMOp` as a type only, and the nine values
exist as a value nowhere outside `callClass.test.ts`. **§6 assigns `src/lib/llm/types.ts` to
A2 and an unlisted edit to a shared file is a reconciliation defect**, so A3 declared the
order locally behind a **type-level exhaustiveness guard**:

```ts
type AssertNever<T extends never> = T;
type _MissingOps = AssertNever<Exclude<LLMOp, (typeof OP_ORDER)[number]>>;
```

Deleting `'persona'` from the array gives `Type '"persona"' does not satisfy the constraint
'never'` at that line — **stronger than `callClass.test.ts`'s runtime `includes()`, and free
at runtime.** Negative control run.

**`foldOps` cannot promise what A-D11 asks for, and the header says so.** Colour follows the
entity, never its rank — but with nine entities and four slots there is no fixed
entity→slot map, so a folded `op` chart's colours are **positional** and stable only while
the top-3 set is. That is why §5.3 makes the nine ops a **table**. `slotFor(entity, order)`
is the fixed-slot half and is what A4 uses for the sets that fit: three readers, three
services, two token directions.

**`adminUserById`/`adminUserList` were built here rather than by A5.** R29 binds A3 and names
both functions; the plan's task list does not. Roadmap §13 already said *"A5 must not write
its own per-user aggregates"*, and one metric with two owners is the seam §11 does not list.

**`priceRollup` counts unpriced calls TWO ways and does not conflate them.** An unknown
*model* means "we cannot price this"; null *tokens* mean "the provider told us nothing", and
on z.ai the second is nearly every row. `unpricedCalls` is the union, `unpricedModelCalls`
and `untokenizedCalls` are the parts, and an untokenized call inside an unpriced model is
counted once — a denominator larger than its own population is the wrong kind of honest.

### The things the integration suite caught that nothing else could

- **Four M4 tests failed for a reason that was not their subject.** Half the catalogue filters
  `created_at` (M1, M4, M5, M10) and half `local_date` (M2, M3); a seeded row left at the
  column default lands on *today*, so the `created_at` half returned nothing. The seed helper
  now pins both and says why — *an assertion that fails for a reason that is not a defect is
  an assertion people delete.*
- **A backtick inside a SQL `--` comment ends the JavaScript template literal it lives in.**
  The parse error points at the opening `` sql` `` and names nothing useful. Twenty minutes.
- **`typeof peak.calls === 'number'` is the most load-bearing assertion in A3**, because that
  value is compared with `>=` against 280. `'300' >= 280` is `true` by coercion and
  `'30' >= 280` is `false`, so a string would be **right most of the time**.

### The measured verification

All four gates, run separately, 2026-07-30:

```
npm run typecheck        clean
npm test                 132 files, 2350 tests passed
npm run test:integration  22 files,  341 tests passed
npm run build            passed; audit-secrets clean, 59 files / 51 needles
```

### Still open after A3

1. **§1.5's three numbers are unverified against real hardware.**
   `statement_timeout 10s < maxDuration 30s < client abort 15s`, and **every admin request is
   a COLD one** — one admin, no warm instance, so the first query of a session also wakes a
   suspended Neon compute. Roadmap §4.2 calls that the single most likely live failure in
   v0.5.0, and **loop 6 is the only instrument**; 1348ms warm from WSL told us nothing when
   `POST /api/locale` had the same shape.
2. **Nobody has stopped the database and opened `/admin`.** A3's plan §11 asks for it and the
   acceptance is different from a reading's: **an admin page with no database must SAY so,
   not render zeroes.** A dashboard of zeroes is indistinguishable from a quiet day, which is
   the worst available failure for a surface whose whole job is early warning. That check
   belongs to A4, which owns the page.
3. **The pasted output in `analytics-queries.md` §§13-18 is over a hand-seeded ledger.** The
   SQL, the shapes and the types are measured; **no rate or percentile there is a fact about
   traffic.** The production read is owed the same way query 12's is.
4. **`readings_local_date_idx` is declared and unbuilt** (§9.1), with the trigger stated.
5. **`llm_calls` retention is still a calculation, not a measurement** (R19). The nightly
   `[llm_calls] rows= bytes=` line is what makes the measurement start existing. Revisit at
   100 MB or 25% of the plan.
6. **`notionalUsd()` still returns `null`**, so every cost figure A4 renders is currently
   empty by design. R14 already makes the hero a call count, so this blocks nothing — but
   `priceRollup`'s `costUsd` will be `null` on every real range until somebody reads a
   fallback pricing page.
7. **`k` is assumed stationary and is the first thing to change.** One abusive script shifts
   burstiness with no visible change in the daily series at all, so the ceiling arrives early
   while the trajectory chart looks unchanged. **`k` must be a displayed number** — A3
   exports `burstiness()` and roadmap §13 makes rendering it A4's obligation.

---

## Chart primitives and the dashboard overview (A4), v0.5.0

**A4 renders. It owns no query, writes no row and adds no dependency.** Plan:
`docs/plans/2026-07-30-chart-primitives.md`, with R8, R9, R10, R11, R12, R13, R14, R21 and R33
binding it.

```
src/theme/chart.ts                  PURE. The palette, the slot maps, slotColor(). ONE import
                                    (`color` from tokens.ts) so two identities are compiler-
                                    enforced: CHART_SURFACE === color.bgRadial[1] and
                                    DIVERGING.mid === color.label.
src/theme/chart.palette.test.ts     All six §4.3 runs + §5.2's four negatives + the I-4 control
                                    + the vendored validator's own five thresholds.
tools/dataviz/validate_palette.js   VENDORED VERBATIM from the dataviz skill. Dev-only.
src/components/chart/**             18 components, geometry.ts, three fence tests. ONE
                                    'use client' file (ChartHover).
src/app/admin/{page,tokens/page}.tsx    The two pages.
src/app/admin/{range,format,metrics,copy}.ts   The pure layer between A3 and the charts.
src/app/admin/RangeFilter.tsx       SERVER. <form method="get">; a range change is a NAVIGATION.
tools/seo/chartfit.{sh,js}          Loop 4.
public/cards/_adminfit.html         Loop 4's session planter. GITIGNORED.
public/cards/_adminshot.html        Loop 3 at 1440. GITIGNORED.
```

### The architecture: SVG only where a path is diagonal

§3 of the plan is the derivation and it is the decision everything else falls out of. **The naive
design — one `<svg viewBox>` per chart at `width: 100%` — has one fatal property: everything
inside a uniformly-scaled SVG scales, including things whose specification IS a pixel count.**

Measured consequences at a ~1.3–2.1× scale factor: an 11px tick renders at 14–23px (or 2.7px with
a desktop viewBox on a phone); a bar capped at 24px becomes 31–50px; an 8px marker becomes 10–17px
and its 2px ring 2.6–4.2px; a 4px rounded data-end becomes 5–8px. `preserveAspectRatio="none"`
fixes the box and shears circles; `vector-effect="non-scaling-stroke"` rescues strokes and nothing
else. **There is no `vector-effect` for a radius.**

So: **paths and polygons in SVG; everything with an intrinsic size in HTML/CSS.** Four components
emit any SVG (`Line`, `Area`, `Sparkline`, `Trajectory`); the other fourteen are CSS. Three
consequences worth stating:

1. **Positioning HTML over the plot is exact**, because the box is known — index `i` at
   `left: (i/(n-1))*100%`, value at `top: (1 - v/yMax)*100%` of the same element. No
   `ResizeObserver`, no measurement, no hydration.
2. **The hover layer needs no SVG hit-testing.** The crosshair is a `<div>`; a heat cell is a
   real `<button>` with real focus.
3. **`tickPx` is a constant, and loop 4 measures it as one.** `[11]` at 320, 360, 390 and 1200.
   That single value existing at all is the architecture being right — under the naive design it
   would be four different numbers.

### Eight defects the two visual loops found, and nothing else could

**Loop 4** (`getBoundingClientRect` in a constrained container):

1. **`repeat(auto-fit, minmax(380px, 1fr))` does not shrink below 380px.** `auto-fit` collapses
   EMPTY tracks, not narrow ones: a 280px content box got a 380px track (`div.grid 380>280`). It
   also made the KPI row report TWO columns instead of one, because the row was inside an
   over-wide track — **one CSS defect, two wrong numbers**, and a screenshot hides it because the
   crop hides the overflow. Fixed with `minmax(min(380px, 100%), 1fr)`.
2. **`StackedBar` overflowed by its own gaps.** `flex: 0 0 <pct>%` with percentages summing to
   100, plus `(n-1) × 2px` of flex gap: `span.bar 179>175`. The code comment claimed basis *"lets
   flex subtract the gaps for us"*, which is **false with `flex-shrink: 0`** — flex subtracts gaps
   only when it has permission to shrink. Fixed with `flex: 0 1 <pct>%`.
3. **A 44px ROW does not make a 16px ANCHOR a 44px target.** The league's links measured 16px
   inside rows with `min-height: 44px`. The thing a thumb hits is the anchor.

**Loop 3** (`tools/shot.sh` at 1440, PNGs actually opened and read):

4. **The KPI row had no panel — an R8 violation in the one place R8 names.** The row sits at the
   TOP of the viewport, where `Backdrop`'s radial is `#221a3a`, and every tile carries a
   SPARKLINE, which is a `--chart-cat-*` mark validated against `#130f22`. The tiles' TEXT was
   fine, so nothing looked wrong. **This is R8's own failure mode restated: green while the mark
   was under-contrast on screen.** It took a screenshot to notice the marks had no surface at all.
5. **"Biaya notional" was rendering z.ai's REAL cost, `US$0,00`.** The page passed A2's `priceFor`
   into `priceRollup`, which prices each model at its own rate — and every z.ai row is priced
   **zero on purpose**, because the Coding Plan is a fixed subscription with no per-token charge.
   So the tile read *we are spending nothing* under a label promising a counterfactual. It now
   prices every model at `NOTIONAL_MODEL`'s rate, which is `null` today, so the tile renders the
   honest empty state plus the reason.
6. **The heatmap's labels named the wrong axis.** It flipped to 24 columns above 520px — inherited
   from §5.3's weekday × HOUR design — so **seven weekday labels sat over twenty-four columns of
   WEEKS**, and 98 cells wrapped into rows of 24 so the calendar stopped being a calendar and
   looked like missing data. Now seven columns at every width, capped at 46px cells, and the
   labels can only ever name the dimension they sit over.
7. **The meter's track read as a full bar.** At the real 15/280 = 5.4%, a full-width 12px
   `--chart-deemph` channel is the loudest thing in the card and the 5% of green reads as an
   anomaly on it — the gauge said "critical" in shape while saying "Aman" in words. §1.8 was right
   that the severity ramp's light end announces alarm at 0%; **it did not anticipate the opposite
   failure.** The track is `--chart-axis` now: an empty channel, with the fill the only mark.
8. **A table's `<caption>` is the chart's title, so a first column also labelled with that title
   printed it twice.** `COMMON.dayColumn` is the fix.

### Two things A4's own plan got wrong, both measured

- **The harness precondition names the wrong email.** Task 20 and §10 say `ADMIN_EMAILS` must
  contain `miftah@dev.local` — which is what `scripts/db-seed.ts` creates. But
  `POST /api/auth/dev-session` upserts and signs **`<username>@localhost`**, and the allowlist is
  compared against the SESSION's email. With `@dev.local` alone, every `/admin` URL answers 404 —
  the A-D2 refusal working correctly on a session that is not an admin. **Both harnesses now probe
  for that 404 and print which address is needed**, because the alternative is every measurement
  coming back empty and reading as a broken harness.
- **The suggested negative control does not fire.** Task 20 says to put `min-width: 200px` on
  `.tile` and expect overflow at 320. The KPI row spans the full grid width, so 200px fits a 280px
  box and `overflow` stays false. At 400px it fires, naming
  `div.page 417>280 / div.grid 417>280 / div.wide 400>280 / div.row 400>280`. **`getComputedStyle`
  read `200px`, so the rule WAS winning** — which is what distinguishes this from
  `galleryfit.sh`'s recorded control that did nothing because a later `min-width: 0` won. **A
  control that does nothing has two possible causes and they need telling apart.**

### CLAUDE.md is wrong about loop 5's width, and it is a floor not a clamp

`## How to verify things here` says of loop 5: *"IT DOES NOT GIVE YOU A PHONE WIDTH … `innerWidth`
and `outerWidth` are both 500 whatever `--width` says."*

**Measured 2026-07-30: `tools/e2e/run.sh launch --width 1440` gives `innerWidth === outerWidth ===
1440`.** The sentence is true BELOW 500 and false above it — ~500px is a floor, not a clamp.

**And the 500 reading reproduces exactly once: against an ALREADY-RUNNING Chrome**, where `launch`
prints `already running: Chrome/…` and silently ignores `--width`. That is the trap, and it is the
likelier explanation of the original measurement than a clamp. So **loop 5 can answer a desktop
width question** and still cannot answer a phone one. A4 used `shot.sh` for the 1440 capture
anyway, because it renders at `--force-device-scale-factor=2` and a 2× PNG of 11px ticks is the
difference between judging legibility and guessing at it.

**This is CLAUDE.md's sentence to narrow and reconciliation's to narrow it.** A4 does not edit that
file (non-negotiable 12).

### The loop-4 numbers, measured

| w | content | kpiCols | plotH | heatCols | heatCell | tickPx | overflow | panelBg |
|---|---|---|---|---|---|---|---|---|
| 320 | 280 | 1 | 200 | 7 | 33.42 | [11] | false | `rgb(19, 15, 34)` |
| 360 | 320 | 1 | 200 | 7 | 39.14 | [11] | false | ″ |
| 390 | 350 | **2** | 200 | 7 | 43.42 | [11] | false | ″ |
| 1200 | 1160 | 5 | **240** | 7 | 46.00 | [11] | false | ″ |

`barH` 20, `meterH` 12, `labelClip` 0, `offenders` [] throughout. **`kpiCols` at 390 is 2, not the
1 the plan implied** — a 350px content box fits two 169px tiles and that is `minmax(150px, 1fr)`
working; the "one column at 320" claim holds where it was made. **`heatCell` at 320 is 33.42
against a stated ≥36**, which is arithmetic rather than a defect: a heat cell is one of ~35
readouts with a CSS hover/focus tooltip, not a control, so neither 44 nor 36 governs it.

**`markBleed` is reported separately from `overflow`, and that distinction is the harness's own
correctness.** An end-dot is `--chart-mark` (8px) centred ON its data point, so at the last x half
of it sits outside the plot by 4px BY DESIGN. It makes `scrollWidth > clientWidth` true for
`.plot`, `.plotFrame` and `.body` by exactly 4 and nothing scrolls. Counting those would put three
permanent offenders in every run and **the real one becomes invisible** — `galleryfit.js`'s
`.srOnly` reason, applied.

### A3's open item #2 is discharged: the database was stopped and `/admin` opened

A3's plan asked for it and stated the acceptance, which differs from a reading's: **an admin page
with no database must SAY so, not render zeroes.** *"A dashboard of zeroes is indistinguishable
from a quiet day, which is the worst available failure for a surface whose whole job is early
warning."*

Run 2026-07-30, `docker stop jmtarot-pg`, both pages, with a session minted beforehand:

```
/admin        ⚠ Angka ini tidak bisa dibaca sekarang.
              Kueri melewati batas waktu atau basis data tidak menjawab. Muat ulang halaman.
/admin/tokens (identical)
```

Three things that run also proves, none of which was the point of it:

- **`requireAdminPage()` works with the database down**, because A-D1 puts admin identity in an env
  allowlist compared against a JWT claim and there is no per-request DB read. The gate held while
  every query failed.
- **The `catch` logs nothing from the driver.** CLAUDE.md's rule — *a postgres error quotes the
  failing statement AND its bound parameters*, and *every `catch` that touches the database is a
  potential PII sink* — is honoured by catching without inspecting. The page's parameters are two
  dates today; the rule is absolute because the next query added there may not be.
- **The harness cannot mint a session with the database down**, because `dev-session` does a real
  upsert. The session has to be established first, then the database stopped. Worth writing down:
  the obvious order fails with `dev-session 500` and reads like a harness fault.

### What A4 did not build, and why each is a stated gap rather than a silent one

Both are A3-shaped, and both follow R24's form — *the honest form of a known gap is preferred to a
silent one* — and A1's precedent of declining an unlisted shared-file edit and flagging it.

1. **No weekday × HOUR heatmap.** §1.7 established the querent's local hour is not derivable from
   `llm_calls` (`local_date` has no time, `created_at` is UTC); R12 ruled it ships Jakarta-pinned
   and LABELLED, or not at all; §10 asked A3 for `heatCells(db, range)` doing
   `created_at AT TIME ZONE 'Asia/Jakarta'`. **A3 shipped no such query, and
   `src/lib/db/queries/admin/**` is A3's by §7.** So what ships is the axis §1.7 itself calls
   exact — *"weekday comes from `local_date`, correct, no zone involved"* — crossed with the ISO
   week, folded in `metrics.ts` from A3's dense daily series. **No new query, no approximation, and
   no label narrowing a claim.** It answers "which days are busy" truthfully instead of "which
   hours" with a caveat.
2. **No per-reader card.** §6.1 row 5 wants a stacked bar over three readers. `readings.reader_id`
   exists and **nothing in A3's catalogue groups by it.** The SERVICE dimension is answerable from
   `ttftByService` and ships **labelled as readings rather than as calls**, because that is what it
   counts — a blocked reading makes no model call at all, and one reading makes several. There is
   deliberately **no `readerTitle` in `copy.ts`**: a copy key for a card that does not exist is how
   a future session concludes one shipped and goes looking for the bug.

### `adminCopy.test.ts`'s I-16 fence took four drafts, and each was wrong in a way worth keeping

The fence forbids a user-visible string literal in `src/components/chart/**`. Getting it right is
the same problem `queries/contract.test.ts` solved by parsing rather than grepping, and it took the
same route:

1. **Filtered candidates by prefix, then grew one exclusion per false positive** — CSS-module class
   composition, SVG path builders, an `aria-label` composed from two props. **A fence maintained
   that way is a list of the things somebody happened to write**, and it fails on the next correct
   line.
2. **Found the right discriminator — *what is left when the interpolations are gone* — but applied
   it per literal, after a regex had extracted them.** That regex cannot parse a nested template:
   in `` `${styles.cell}${b === null ? ` ${styles.empty}` : ''}` `` the inner backtick ends the
   outer match early, leaving a fragment with a dangling `${`.
3. **Lexed with a regex at all.** In `deltaKind === 'good' ? STATUS.good : deltaKind === 'bad'` it
   paired the CLOSING quote of one literal with the OPENING quote of the next and reported
   ` ? STATUS.good : deltaKind === ` as prose. **Every quote-pairing regex has that failure.**
   Replaced with a 20-line scanner that tracks quote state and escapes.
4. **Stripped interpolations and therefore could not see prose INSIDE one.** The negative control
   injected `aria-label={`${stateLabel ?? "Kuota hampir habis sekarang"} …`}` — a hardcoded
   27-character Indonesian sentence in a chart primitive — and **the fence stayed GREEN.** Now the
   candidates for one literal are *the literal with interpolations removed* plus *every string
   literal found inside those interpolations*, and both controls fire naming the string.

The generalisation, which is this project's own twice over: **a fence whose red state has never
been produced is a fence nobody can trust**, and the cheapest way to find out is to break the code
on purpose rather than to reason about the regex.

### `audit-secrets` fails the build on an env var NAME inside `public/`

Both harnesses failed `npm run build` on their first commit, and the finding was correct:

```
audit-secrets: 3 FINDING(S)
  [env name] DATABASE_URL   public/cards/_adminfit.html @ byte 1735
  [env name] ADMIN_EMAILS   public/cards/_adminfit.html @ byte 736
  [env name] ADMIN_EMAILS   public/cards/_adminshot.html @ byte 1831
```

They were **names in a comment**, in gitignored files, explaining a precondition — no value
anywhere. But `scripts/audit-secrets.ts` scans `public/`, A1 added `ADMIN_EMAILS` to `SECRET_ENV`
(R20), and being strict about a directory whose contents can be served is right. **The script's own
message says not to add a suppression**, and the alternative — an exclusion for `_*.html` — would
have been an edit to `audit-secrets.ts`, which §6 assigns to A1.

So the variables are **described rather than named** in both harnesses, with a header saying why and
pointing at `.env.example`. Worth writing down because the failure is surprising: a documentation
comment in a dev-only file can fail a production build, and the fix is not to weaken the scanner.

`DEV_PASSWORD_LOGIN` is named freely in every harness under `public/cards/` and always has been —
it is not in `SECRET_ENV`, and that asymmetry is what makes the finding legible rather than
arbitrary.

### Six other things that were nearly wrong

- **`niceTicks` printed half a model call.** The textbook 1-2-5 progression scales by
  `10^floor(log10(raw))`, which goes below 1 for a small max: `max = 1` over four ticks gives a step
  of **0.5**, so a count axis reads `0 · 0,5 · 1`. **One call on one day is the commonest series a
  fresh deployment has.** The step is floored at 1, and 2.5 is deliberately absent from the
  progression for the same reason even though it would give tighter axes.
- **`assertDense` reported an UNUSABLE range as dense.** `enumerateDays` returns `[]` for a
  reversed, malformed or over-retention range, and an empty bucket list matched it exactly — so
  `?from=2026-07-31&to=2026-07-01` rendered an empty chart AS IF IT WERE CORRECT. `parseRange`
  refuses such a range first, so this is the belt; it is also the only one of the two a
  hand-written call site could bypass.
- **`Intl`'s compact notation separates with U+00A0.** The first assertion failed with
  `Expected: "12,9 rb" / Received: "12,9 rb"` — two identical-looking strings. Pinned explicitly,
  because that output reads as a test framework bug and is not one.
- **A3's `Forecast` has THREE variants and A4's plan predicted two.** `insufficient | flat | trend`
  — and **`flat` is the one a two-variant renderer would have crashed on.** It is what `forecast()`
  returns when every y is identical, *including all zeros, which is the honest reading of "nothing
  happened"*. `Trajectory` draws the actual series and NO projection for it: a flat series has no
  trajectory, and a horizontal dashed line to the horizon is a forecast of nothing wearing the
  costume of one.
- **My own `deltaE` extractor read a hex code.** `worst adjacent #c2703f↔#a3423a ΔE 12.9` with a
  bare `\d+(\.\d+)?` returns **2703**. It passed on the sets whose hexes start with a letter and
  failed on the others, which reads exactly like a palette defect and was a defect in the ruler.
- **A `noDualAxis` assertion counted a function parameter as a second axis.** `/\byMax\b\s*:/`
  matched both the props member and `markLast(actual, n, yMax: number)`, reporting two y-domains
  for `Trajectory`. A fence that goes red on a refactor is a fence somebody deletes.

### Still open after A4

1. **`notionalUsd()` returns `null`, so every cost figure is empty by design.** `NOTIONAL_MODEL` is
   unset because nobody has read a current price page for `gemini-3.5-flash-lite` or
   `gpt-5.6-luna`, and `prices.ts`'s own rule is that nothing unverified enters it. R14 already
   makes the hero a call count, so this blocks nothing — the tile says why.
2. **`a.navLink 42` is 2px under the iOS floor, in A1's `layout.module.css`**, whose own comment
   claims *"44px of tap target"*. §6 assigns that file to A1 and A4 does not edit it.
3. **Loop 6 is undischarged, and §4.2 calls it the most likely live failure in v0.5.0.**
   `maxDuration = 30` against a suspended Neon compute cannot be measured in WSL, because Docker
   Postgres never sleeps. Every admin request is a cold one — there is one admin and no warm
   instance — and the first query of a session also wakes the compute.
4. **Nobody has read this dashboard on a phone.** Loop 4 measures its width and says nothing about
   whether a 33px heat cell or a 200px plot is worth looking at on glass.
5. **`ChartHover` is untested by anything but a fence.** Its keyboard/pointer parity is true by
   construction — one `index` state, one renderer — and that is an argument rather than a test;
   the unit project has no DOM for a `pointermove`.
6. **The trajectory's band is a sliver at the ceiling-dominated scale.** With a 370-call daily
   equivalent and ~35 calls a day, the residual band is a few pixels tall. That is honest — the
   band IS that tight relative to the distance — but A-D8's *"never a point estimate without its
   band"* is satisfied in the markup rather than in the reader's eye. Revisit when the two numbers
   are within an order of magnitude of each other.
7. **The 1440px layout is A1's 1200px `max-width` plus A4's `minmax(min(380px, 100%), 1fr)`**, and
   at 1440 that leaves ~120px of margin each side. It reads well and it is a guess A1 recorded as
   one; nobody has tried it at 2560.

### The range presets were dead for the whole release, and one form is the reason (2026-07-30)

Reported as *"in admin page, the date range shortcut does not seem to work. i clicked 14 hari but the
date range didn't do shit"*, with a second half: highlight the active preset, and move `Dari`/`Sampai`
to match it.

**Both halves were already implemented and both were correct.** `RangeFilter` set `styles.active` and
`aria-current` from `parsed.preset`, and the date inputs took `defaultValue={range.from}` — the
resolved range, not the submitted params. Nothing about either needed a line of code.

**The cause is that a submit sends every field in its form.** The presets and the two date inputs
shared one `<form method="get">`, so pressing `14 hari` sent `d=14` **together with** the `from`/`to`
pair on screen — and `parseRange` gives an explicit pair precedence over `d`. Every preset navigated
to a URL that re-selected the range already being shown. The dates did not move, the pressed state did
not move, and the URL changed, which is why it reads as "the button does nothing" rather than as a
crash.

Measured in the browser rather than argued, by stashing the fix against the running dev server
(loop 5, `E2E_BASE=http://localhost:3001`, a dev-session cookie planted by `eval`-ing a `fetch` to
`/api/auth/dev-session` — `.env.local` has `DEV_PASSWORD_LOGIN=1` and an `ADMIN_EMAILS` entry ending
`@localhost`, so `{"username":"miftah"}` is an admin):

```
before   forms: [["d","d","d","d","from","to"]]        <- one form, the bug
after    forms: [["d","d","d","d"], ["from","to"]]
tap "14 hari"  ->  url /admin?d=14   active ["14 hari"]   from 2026-07-17  to 2026-07-30
```

**The fix is a second form, and the two alternatives are both worse.** Clearing the date inputs on a
preset press needs JavaScript on a page that deliberately ships none (I-20, R21). Flipping the
precedence in `parseRange` leaves `?d=14&from=…&to=…` in the address bar with `from`/`to` naming a
range nobody is looking at, and it would make a hand-edited URL's explicit pair lose to a `d` the
operator did not type. `RangeFilter.test.ts` asserts **no form holds both a preset and a date input**,
named for the shape rather than the count, so splitting the filter differently still passes and
merging it back does not.

**Wrapped height is unchanged at every phone width** — 320: 240px, 360: 192px, 390: 192px, identical
before and after, no overflow — because `.filter` became a `<div>` carrying the gap its children used
to get from the form. The two-form split costs nothing in layout.

Two generalisations worth more than the bug:

1. **A dead control is not evidence that the dead-looking half is broken.** The report named the
   highlight and the dates; both were faithful renderings of a range the button had failed to change.
   Fixing what the report points at would have produced a filter that lies.
2. **`RangeFilter` had no test at all, and the four grep-shaped fences over `src/app/admin/**` could
   not see this** — they read source text, and this bug is a property of the rendered form tree.
   `renderToStaticMarkup` plus "what does a submit send" is the cheap instrument; `ReadingView.test.ts`
   and `legal.test.ts` were already the precedent for it in a `environment: 'node'` project.

**Still open, and deliberately not fixed here:** on `/admin/users` a preset press drops `?q=` (the
search term) and vice versa, because the search box is a third GET form and neither preserves the
other's params. Dropping `offset` on a range change is right; dropping the search is not. It is a
different file (`AdminUserTable.tsx`, A5) and a different decision — hidden inputs in both forms —
and it was not part of the report.

### The league row is a drill-down now, and Chrome's fragment scroll turned out to be a RACE (2026-07-31)

Reported as *"di /admin/tokens subpanel Pengguna dengan token terbanyak harusnya bisa diklik. admin klik
row akan redirect to /admin/users/&lt;hash&gt; plus auto scroll ke subpanel konsumsi token"*, with the
condition that **the date filter must persist so the numbers are consistent.**

Three separate things, and only the first was the shape of the report.

**1. The row, not the label.** `InlineBars` wrapped the eight hex characters in an `<a>` inside a
`<div class="inlineRow">`; the bar and the token count — the two things an operator is actually pointing
at — were dead. The anchor now **is** the grid row (`<a class="inlineRow inlineRowLink">`), which also
retires the trap `page.module.css` recorded: *"the row being 44px does not make the link 44px"*, measured
at 16px once. With one box there is no second height to drift. Hit-tested at five points across the
438×44 row — label, bar centre, value, top edge, bottom edge — all `elementFromPoint` to the same link.
The `.inlineLink` rule is deleted and `ScrollToHash.test.ts` asserts its absence, because a dead rule in
a stylesheet is how the old shape comes back.

**2. The range travels as `from`/`to`, never as `d`.** `rangeQuery()` in `range.ts`. A drill-down
carrying `d=7` would resolve against the *receiving* page's own `todayUtc()`, so a click either side of
UTC midnight lands on a different window than the row clicked — with both pages looking healthy. An
explicit pair is absolute, `parseRange` gives it precedence, and `presetFor(dayCount(from, to))` recovers
the pressed state, so sending dates costs the destination's filter nothing. It also carries a **custom**
range, which `d` cannot express at all.

The control that makes this more than a tidy-up, measured with 40 calls inside a 7-day window and 10 more
20 days back:

```
league row (7 days)                    99,4 rb
-> /admin/users/<id>?from=…&to=…#token  40 calls   78,3 rb in   21 rb out   filter 25 Jul – 31 Jul
-> /admin/users/<id>#token              50 calls  168,3 rb in   71 rb out   filter 02 Jul – 31 Jul
```

**3. `#token` did not work, and the reason is worse than "Suspense".** This page streams its whole body
inside `<div hidden id="S:0">` and reveals it with an inline script ~70KB later, so when the parser meets
`id="token"` the element has no scroll box, and the reveal is a mutation rather than a parse. The first
measurement said exactly that — `{ hash: '#token', scrollY: 0, tokenTop: 2699 }`. **But two consecutive
loads of the same URL disagreed:**

```
run 1 -> { y: 0,    tokenAbs: 2699 }     // never scrolled
run 2 -> { y: 2699, tokenAbs: 2699 }     // scrolled, and ignored the sticky bar
```

So Chrome sometimes wins the race and sometimes does not. **The first version of `AdminScrollToHash`
only scrolled, and lost:** it landed on 2508 (its own sticky-bar arithmetic) and Chrome's late scroll
then moved the page to 2699, parking the panel heading back under the 191px table of contents. The
instrumented mount recorded the collision in one line — `off=191 top=191 y=2508` — an effect firing at a
scroll position it had itself already set.

**The fix is not to win that race but to make both outcomes identical:** `scroll-margin-top` is honoured
by Chrome's native fragment scroll *and* by `scrollIntoView`, so the component publishes the measured
sticky height as `--admin-anchor-offset` and `.panel` consumes it. **The variable is the load-bearing
half; deleting it and keeping the scroll reinstates the bug intermittently**, which is the worst way to
have it. Five consecutive loads then landed on `y=2508`, `tokenTop === stickyH`, every time.

The offset is measured rather than written down because `.toc` is fourteen wrapping links — **191px at
390px wide** against a single row on a desktop — so there is no one number, and a fifteenth section
would stale any literal.

Three things not to undo:

1. **It is mounted inside `Body`, not beside `<Suspense>` in the shell.** An effect fires after commit,
   so a mount in the shell runs against the fallback, finds nothing, and returns silently — a failure
   indistinguishable from the bug. `ScrollToHash.test.ts` asserts the mount appears after `Body`'s
   declaration.
2. **It reads `matchMedia` directly rather than calling `usePrefersReducedMotion`**, which starts `false`
   and corrects in an effect — right for a component that keeps rendering, wrong for one that acts once
   at mount, where the glide would ship to an operator who asked for less motion. `data-still` is read
   for the reason `SwipeDeck` predicted by name: **a JS scroll's `behavior` overrides CSS
   `scroll-behavior` rather than defaulting from it.**
3. **The empty dependency list is the feature.** A re-run yanks an operator who has scrolled elsewhere
   back to the anchor.

**`#bacaan` on this page's own paging link had never worked either** — its comment calls it load-bearing
— and it is fixed in passing, because it is the same mechanism and not a second one. The fourteen table
of contents links stop landing behind the sticky bar for the same reason.

Two generalisations:

1. **"The browser does not do X" is a claim that needs more than one run when the timing is asynchronous.**
   One measurement said Chrome never scrolls; the truth was that it scrolls about half the time, which is
   the version that produces an intermittent bug report months later.
2. **When you cannot beat a platform behaviour, look for the input both you and it read.** The arithmetic
   version and the CSS version look equally correct in review; only one of them makes the race harmless.

**Still open:** nothing here has been seen on a phone (loop 4 measures width, not whether a 191px table
of contents above a panel is a reasonable thing to land on at 390px), and `stickyOffsetIn` counts a
`fixed` bar it has never met — there is none in the admin tree today.

## The per-user everything page (A5), v0.5.0

**`/admin/users`, `/admin/users/[id]`, four audited API routes, and the ordering that makes a
reveal fail when its audit row cannot be written.** Plan:
`docs/plans/2026-07-30-admin-user-detail.md` (20 tasks). Rulings that bound it: R3, R21, R27,
R28, R29, R30, R33, R36, R51.

### The file map

```
NEW -- the shapes and the copy
src/lib/admin/types.ts                    AdminUserListItem + the three reveal shapes.
                                          ZERO IMPORTS: `AdminReveal` is a client component
                                          and `adminCopy.test.ts` forbids any @/lib/i18n
                                          specifier in this tree, so `Locale` is restated as
                                          `AdminLocale = 'id' | 'en'`.
src/lib/admin/reveal.ts                   **THE ORDERING.** Handle-first, no next/*, no catch.
src/lib/admin/userList.ts                 the list projection, shared by the page and the route
src/app/admin/users/copy.ts               ~150 Indonesian strings. No t().
src/app/admin/users/series.ts             the per-user token fold. PURE.

NEW -- the data layer (A5 owns three files in a directory it shares)
src/lib/db/queries/admin/detail.ts        identity, answer presence, lotus, summaries,
                                          verdicts, translations, share links, events
src/lib/db/queries/admin/moderation.ts    THE ONE decrypt site for moderation_flags.question
src/lib/db/queries/admin/readings.ts      readings + cards + the per-reading ledger fold

NEW -- the pages
src/app/admin/users/page.tsx              the list. server.
src/app/admin/users/AdminUserTable.tsx    'use client' -- the search box, and nothing else
src/app/admin/users/users.module.css
src/app/admin/users/[id]/page.tsx         the everything page. one Promise.all, one failure
src/app/admin/users/[id]/detail.module.css
src/app/admin/users/[id]/AdminReveal.tsx  'use client'. THE reveal, mounted three times
src/app/admin/users/[id]/AdminReadingDetail.tsx   NOT ReadingView (R27). SERVER, not client
src/app/admin/users/[id]/sections/kit.tsx         Panel/Field/DataTable/Empty/Json/Badge
src/app/admin/users/[id]/sections/*.tsx           the fourteen, one file each

NEW -- the routes
src/app/api/admin/users/shared.ts                 the gate, the 404, UUID_RE, the header
src/app/api/admin/users/route.ts
src/app/api/admin/users/[id]/answer/[key]/route.ts
src/app/api/admin/users/[id]/moderation/[flagId]/route.ts
src/app/api/admin/users/[id]/reading/[readingId]/route.ts    <- R28's route

NEW -- the tests
src/lib/admin/reveal.integration.test.ts          the audit ordering, TWO instruments
src/lib/admin/userList.integration.test.ts        the payload fence over the real projection
src/lib/db/queries/admin/{detail,moderation,readings}.integration.test.ts
src/app/admin/users/[id]/page.contract.test.ts    the subtree fences
src/app/admin/users/series.test.ts

EDITED: nothing outside src/app/admin/users/**, src/app/api/admin/**, src/lib/admin/** and
        A5's three files in src/lib/db/queries/admin/**.
```

### The defect in A5's OWN test that the negative control found, and it is the important one

**`reveal.integration.test.ts` shipped a `pg_temp` trigger that raises on
`insert into admin_access_log`, asserted the reveal rejects, and PASSED against a
`recordAdminAccess` written in house style — a `try` that logs and continues.** All twelve tests
were green with the control removed.

The reason is that the raised exception **aborts the whole Postgres transaction**, so the
statement AFTER the audit write answers `25P02 current transaction is aborted` and the reveal
rejects *whatever the ordering is*. The instrument could not see the one defect it exists to
catch. In production there is no wrapping transaction, so a swallowed audit failure lets the
decrypt proceed and returns plaintext with no record — exactly what R30 calls the worst available
outcome, *"the reveal would work, the audit row would silently not exist"*.

**The fix is a second instrument: a `Proxy` over the handle whose `insert()` throws and whose
reads all work.** With it, a swallowing `recordAdminAccess` RESOLVES with
`text: 'yang paling berat'` and three tests go red. Verified by injecting the house-style version
on 2026-07-29:

```
× FAILS when ONLY the write fails and every read still works
× FAILS when only the write fails, so no flagged question is decrypted
× FAILS when only the write fails, so no body is read
      Tests  3 failed | 12 passed (15)
```

Both instruments ship. **The generalisation is worth more than the fix: inside
`withRollback`, "the statement raised" and "the ordering is wrong" produce the same observable,
so any ordering test built on a raising trigger is measuring the abort.** The same doubt applies
to `delete.integration.test.ts`, which is the precedent A5 copied — it gets away with it because
`deleteAccount` opens its own savepoint, so its failure is scoped, but the assertion it makes is
still about the abort rather than about the order.

### The keyset cursor that returned an empty second page, and why a `Date` cannot be one

**`timestamptz` holds MICROseconds and a JavaScript `Date` holds MILLIseconds.** The first
`readingsForAdmin` carried `{ createdAt: Date; id: string }` as its cursor, so a row stored at
`21:14:28.123456` came back as `.123` — and `created_at = $cursor` was false, `created_at <
$cursor` was false too, and the tiebreak arm of the keyset matched nothing.

Measured: five readings seeded inside one transaction (where `now()` is fixed, so all five share a
timestamp and the tiebreak is the *only* thing paging them) returned **two unique ids across three
pages instead of five**, with a non-null cursor at the end.

In production the timestamps differ, so the failure is subtler and worse: paging stops one row
early at every boundary whose microseconds are non-zero, and the operator sees a list that quietly
ends. `ReadingCursor.createdAt` is now `created_at::text` and the comparison casts it back.

### Three things measured on screen at 1440px, and none of them was visible in a test

Loop 5 with a fresh Chrome at `--width 1440` (`innerWidth === 1440`), signed in through a
gitignored `public/cards/_a5.html` that POSTs to `/api/auth/dev-session` — the `_gate.html`
precedent, because `tools/shot.sh` can hold no session and Windows floors a window at ~500px.

1. **The notional-cost column was clipped.** Ten columns came to `scrollWidth 1193` inside a
   `clientWidth 1126` panel, so the one column a cost league exists for sat behind a scrollbar.
   Fixed by dropping seconds from "terakhir terlihat" (a second answers no operator question) and
   8px cell padding instead of 10px: 40px across ten columns. Re-measured `1126/1126`.
2. **The table of contents rendered above the `<h1>`.** The nav was in the shell, above
   `<Suspense>`, and the title needs `identity.email` so it lives in `Body` — so the first thing on
   the page was a fourteen-anchor index for a page whose subject had not been named. The nav moved
   into `Body`.
3. **Two bare timestamps side by side.** `2026-07-29 02:12:00  2026-07-29` with nothing saying
   which was the instant and which the querent's calendar day — and §4.6's whole reason for showing
   both is that *the operator's question is often "what does the gap between these two mean"*. Both
   now carry a one-word label.

Plus two on the token card: the unpriced-count sentence rendered **twice** (a `StatTile` note and
the chart footnote, the same three lines on one screen), and `Line`'s end labels **collided into
one unreadable string** because the range's last day had no calls, so both series ended at 0.

### `Line`'s `showEndLabels` needs a nudge, and it is A4's file

**Flagged, not fixed** (§6): `src/components/chart/Line.tsx` places each series label at its own
last point with no collision handling, so any two series ending within a line of each other print
on top of one another. A5 works around it caller-side — `endLabelsFit()` compares the last values
against a twentieth of the domain and passes `showEndLabels={false}` below that, because **a
collided label communicates less than no label** and §5.4's obligation is met by the legend in that
case. The fix belongs in `Line`.

### `admin.page_viewed` was firing twice per page view, and `/admin` still does

A5's pages mounted A1's `<AdminPageViewed>` **and** called `track('admin.page_viewed', …)`
server-side in the body — copied from A4's `/admin/page.tsx`, which does the same. Two events per
view, and the server-side one printed
`[analytics] unbatched track() outside withAnalytics: admin.page_viewed` on every load, because a
page render is not inside a `withAnalytics` scope: each call became its own INSERT with a NULL
`user_id`.

`AdminPageViewed`'s own header calls itself *"the ONE mount for `admin.page_viewed`"*. A5 deleted
the server-side call and kept the mount; measured after, one page view is one row, attributed, with
`props = {"page": "/admin/users"}` and no uuid. **`/admin` and `/admin/tokens` still double-fire —
A4's files, so flagged rather than edited**, and anybody comparing page popularity across the four
should know that two of them count double.

### The measurement A1's probe script asked A5 for (R35)

`tools/admin/probe.sh` says *"A1 ships no `/api/admin/**` route, so that comparison is not yet
measurable … A5 lands the first real admin route and owes the measurement"*. Discharged, against
the dev server with an ordinary signed-in non-admin session:

| path | code | bytes | content-type |
|---|---|---|---|
| `/api/admin/definitely-not-a-route` | 404 | 38068 | `text/html` |
| `/api/definitely-not-a-route` | 404 | 39028 | `text/html` |
| `/api/admin/users` (unauthorised) | 404 | **0** | none |

**So byte-identity is not merely unclaimed, it is plainly false**, which is what R35 already said:
a route handler cannot render Next's not-found page. What the shape check does establish is that
`adminNotFound()` sends **no body and no JSON `{ error }`** — the tell A-D2 forbids — and that all
three answer 404. **The 38KB figure is `next dev`'s error page and is not the production number**;
measuring that needs a real admin session against a deployment, which R37 puts on production only.
Recorded as a stated gap.

Also measured, and it is the row that matters: an **onboarded** non-admin gets 404 on `/admin`,
`/admin/users`, `/admin/tokens`, `/admin/blog`, `/en/admin` and both API paths. Signed out, the
pages redirect to `/login` and the API paths answer 401 — R36's two codes, from two callers.

### An un-onboarded account is not a non-admin test subject, and the probe cannot tell

The first refusal run used `dev:jodith`, whose `profiles.completed_at` is NULL, and every page came
back **200 with one hop** — read by the script as `ADMIN (200)`. It was `/onboarding`. R34
documents that an un-onboarded admin cannot reach `/admin` and that *the redirect reads exactly like
a misspelt `ADMIN_EMAILS`*; the same shape also makes an un-onboarded account **useless as the
non-admin identity**, and `probe.sh` reports it as the opposite of what it is. `dev:walker` is
onboarded and is the right subject. Worth a line in the script's header; not edited here.

### Loop 5 honours 1440 and still floors at 500, so the earlier narrowing was itself incomplete

CLAUDE.md says loop 5 gives `innerWidth === outerWidth === 500` whatever `--width` says; A4's
session narrowed that to *"~500px is a floor, not a clamp — the 500 reading reproduces only against
an already-running Chrome, where `launch` silently ignores the flag"*. Measured 2026-07-29, with a
`kill` before each `launch`:

```
launch --width 1440 → {"iw":1440,"ow":1440}
launch --width 390  → {"iw":500}
```

**It is a floor, and it applies to a FRESH launch too.** 1440 works because it is above the floor;
390 does not. So loop 5 answers a desktop width exactly and still cannot answer a phone width, and
loop 4 remains the instrument for narrow layout — which is what CLAUDE.md concludes, for a reason
that is half wrong.

### Loop 4, applied to a whole page rather than a component

A page cannot go in a fixed-width container, so the root goes in one instead: set
`documentElement.style.width` to 320/360/390, force layout, and read `body.scrollWidth` and every
`.scroller`'s `scrollWidth > clientWidth`. Measured, both pages:

| width | body overflows | tables scrolling inside themselves |
|---|---|---|
| 320 | **no** | list 1/1, detail 9/10 |
| 360 | **no** | list 1/1, detail 9/10 |
| 390 | **no** | list 1/1, detail 8/10 |

The requirement is exactly that: **the table scrolls, the page body never does.** The tenth
scroller on the detail page is a short table that genuinely fits.

### Nine deviations from the plan, each with the reason

1. **The ordering lives in `src/lib/admin/reveal.ts`, not inline in each route.** §6.2 wrote the
   sequence into the handler and §9's A5-28 asserts it against the route's source. A source grep is
   the weakest instrument available for the release's highest-value invariant, and a route cannot be
   driven by an integration test (it imports `next/server` and the `server-only` singleton). The
   ordering is now executable; the fence still asserts the shape and additionally that no route
   calls `recordAdminAccess` at all.
2. **A thrown audit write becomes a 503, not Next's 500.** The plan wanted the exception to escape
   the handler. It is caught with the database's own failures, because both are the same failure and
   **neither returns text**. What A5-10 actually requires — no plaintext without a committed audit
   row — is enforced by the ordering in `reveal.ts` and proved by the proxy instrument.
3. **The readings cursor is text, not a `Date`.** See above; a `Date` cursor is a silently
   truncating list.
4. **The user list pages by OFFSET, not keyset (A5-D2).** A3's `adminUserList` takes
   `{ search, limit, offset }` and that file is A3's by §7. The hazard is real and is on screen:
   ordered by `last_seen_at`, which `touchLastSeen` moves, a user who is browsing can appear on two
   pages or on neither. **Nothing on this surface writes, so the cost is a confusing row and never a
   wrong action.** The fix is one `cursor` parameter in A3's file.
5. **Search matches `users.email` only, not `display_name`.** Same ownership reason. **A5-13 is a
   CEILING, not a floor** — searching less than it permits is not a violation; searching more would
   be. The label says "Cari email" rather than promising more than it does.
6. **There is no `?deleted=only|hide` filter.** A3's list query has no such parameter and filtering
   a fetched page in JavaScript would silently return eleven rows for a page of fifty. A5-14's
   actual requirement is that **no default hides them**, which "always shown, always badged"
   satisfies completely.
7. **`AdminReadingDetail` is a SERVER component**, where the file map said `'use client'`. Nothing
   in it is stateful and the one interactive part is `AdminReveal`, which is its own boundary.
8. **`answerStatesForAdmin` is A5's own presence read**, not `answerPresence` from
   `queries/onboarding.ts`. The page needs `updated_at` per row (§4.4's honest staleness signal is
   the Lotus's `updated_at` beside the answers') plus `asked` and `skipped` told apart, which
   `answerPresence` folds together. **It is a second NULLITY read and not a second decrypt site:
   A5-6 is intact**, and `page.contract.test.ts` asserts `decryptField` appears in exactly three
   files.
9. **`userIdentityForAdmin` exists beside A3's `adminUserById`.** §4.1 needs all fifteen `users`
   columns and A3's row is the LIST's eleven-field projection. Widening A3's row would edit A3's
   file for A5's page; calling both would be two reads for one row. The list calls A3's, the detail
   page calls A5's, and each returns what its own surface renders.

### The list's cost column, and the two things it cannot honestly say

`userCostLeague` returns `(user, model)` pairs with no `local_date` and no `untokenized`, so:

- **A user outside the league's 200-row cap carries `null`, not `0`**, and the note says
  *"kosong — bukan nol"*, because a zero reads as *this person costs nothing*.
- **A per-row unpriced count is not derivable**, so A-D7's denominator warning is carried once
  above the table rather than per row. The per-user page has `callTotalsForUser`, which has both,
  and shows the count properly.
- Cost is priced at `NOTIONAL_MODEL`'s rate and never at each row's own model — A4 paid for that
  distinction at 1440px, where per-model pricing rendered `US$0,00` under the word "notional".
  `NOTIONAL_MODEL` is `null` today, so the whole column is honestly empty.

### The database-down acceptance, run

W4's test applied to a read surface. `docker stop jmtarot-pg`, then:

```
/admin/users                              200  "Data pengguna ini tidak bisa dibaca sekarang"
/admin/users/<id>                         200  "Data pengguna ini tidak bisa dibaca sekarang"
/api/admin/users                          503  {"error":"unavailable"}
/api/admin/users/<id>/answer/worst_thing  503  {"error":"unavailable"}
```

Logged: `admin read failed: users list { adminUserId: …, name: 'Error' }` — the error's **class**
and the ids, nothing else. The one full driver error in the log came from W4's `flushEvents`, whose
dev-mode behaviour is to print everything; its bound parameters are `admin.page_viewed` and a
`props` object that `sanitizeProps` guarantees is non-identifying, so it is within the rule rather
than an exception to it.

### Still open

1. **Loop 6 is undischarged.** `maxDuration = 30` against a suspended Neon compute is the failure a
   warm WSL request cannot see, and §4.2 calls it the most likely live failure in the release. The
   detail page issues sixteen statements in two round trips; nobody has opened it from a phone
   against a preview after the compute has idled.
2. **The production refusal shape is unmeasured** — the 38KB figure above is `next dev`'s error
   page. Needs an admin session against a deployment, which R37 puts on production only.
3. **`/admin` and `/admin/tokens` double-fire `admin.page_viewed`** (A4's files).
4. **`Line`'s end labels have no collision nudge** (A4's file).
5. **`probe.sh` reports an un-onboarded account as an admin** (A1's file).
6. **The audit trail has no `resource` value for the LIST page** — §13.7, reconciliation §9.8, and
   it is on screen where the operator can see it. Fifty rows per page load would make §4.14
   unreadable.
7. **A per-reading total cost including moderation is not answerable** (R51). The figure on screen is
   *biaya generasi* and the complete total is in the per-op table.
8. **Nobody has read the fourteen sections on a phone.** The tables scroll inside themselves at 320
   by measurement, which is not the same claim as "an operator can use this on a phone".


## The blog CMS (A6), v0.5.0

Plan: `docs/plans/2026-07-30-blog-cms.md`, 26 tasks. **The reconciliation outranks it and
nine of its rulings bind A6** — R6, R39, R40, R41, R42, R43, R44, R45 and R46. Task 26,
the deletion of `src/content/blog/**`, is **deliberately not done**: the plan gates it on
the import having run in production, and nothing here has been deployed.

### The acceptance test, run: byte-identical on all six URLs and on the sitemap

§13.3 layer 3 is *"`curl` before and after… an empty diff on all six is the workstream's
done condition"*, and it is the cheap one. Both captures are **production builds** —
`npm run build` then `npx next start -p 3001` — because a dev server injects HMR script
tags that differ per boot and would make the diff meaningless.

```
before/  captured at HEAD~5, files still the source
after/   captured after the rewire, rows the source

IDENTICAL  /blog                        IDENTICAL  /en/blog
IDENTICAL  /blog/what-tarot-is          IDENTICAL  /en/blog/what-tarot-is
IDENTICAL  /blog/how-to-read-tarot      IDENTICAL  /en/blog/how-to-read-tarot
IDENTICAL  /sitemap.xml
```

The sitemap being in that list is worth as much as the six pages: it means the four
article URLs, their `hreflang` sets and their `lastModified` all came out the same from a
query as they did from a committed array. `lastModified` matching is not luck —
`scripts/blog-import.ts` writes the committed `2026-07-29` rather than the clock (A6-33),
which is also what keeps `dateModified` from telling every crawler that four articles
changed on migration day.

### `jsonb` REORDERS KEYS, so the four committed hashes cannot be a row-level oracle

**The obvious form of §13.3 layer 2 is to hash `[title, description, hero, body]` off the
row and compare against `fd66e5580bbb` and its three siblings. Run that way it fails on
all four — including three documents that were never touched by anything.**

```
what-tarot-is.id      row=4656c4f51eb1  committed=fd66e5580bbb  *** DIFFERS ***
what-tarot-is.en      row=cf2d135c94b8  committed=79b11b6ed3d9  *** DIFFERS ***
how-to-read-tarot.id  row=3cc24c5f1f35  committed=dd979b02e6e4  *** DIFFERS ***
how-to-read-tarot.en  row=3550d555025f  committed=9063906f8f97  *** DIFFERS ***
```

`jsonb` is not text. Postgres parses it, **normalises object key order** (by key length,
then bytewise), drops duplicate keys and canonicalises numbers — so
`JSON.stringify(row.body)` is a different STRING from `JSON.stringify(doc.body)` while
being the same VALUE. Deep equality, checked the same afternoon against the same rows,
holds on all four:

```
what-tarot-is.id      DEEP-EQUAL     how-to-read-tarot.id  DEEP-EQUAL
what-tarot-is.en      DEEP-EQUAL     how-to-read-tarot.en  DEEP-EQUAL
```

**This is why layer 1 is a UNIT test over the transform, with no database on its path,
and layer 2 is `toEqual`.** It is recorded because the hash is the obvious thing to reach
for, it fails, and what somebody concludes from a failing oracle is that the migration
was lossy. It was not — layer 3 proves the render is byte-identical, and `Prose` reads
fields by name. `blog.oracle.integration.test.ts` carries the warning in its header: a
future check over `body` must canonicalise key order first, at which point it is a slower
`toEqual`.

### The sitemap was STATIC, and the build had baked the article list into it

**The largest defect A6 found, and it is in nobody's plan.** `npm run build` printed
`○ /sitemap.xml` after the file grew a database read: a `sitemap.ts` with no async work is
a static route, and Next kept prerendering it. The build ran the query and wrote
fifty-six URLs into `.next/server/app/sitemap.xml.body`.

```
$ grep -o "blog/[a-z-]*" .next/server/app/sitemap.xml.body | sort -u
blog/how-to-read-tarot
blog/what-tarot-is
$ grep -c "<loc>" .next/server/app/sitemap.xml.body
56
```

So an article published through the editor would not have appeared in `sitemap.xml` until
the next deploy — **precisely the failure R41 identified in the other direction**
(*"the build-time slug closure is exactly what would prevent publishing without a
deploy"*), arriving through a route the reconciliation examined only for its LEAF rule.
It would have looked like everything working: the article's own URL 200s, both indexes
list it, `hreflang` is right, and only the crawler's entry point is a release behind. On
Vercel it is worse than stale — the build has `DATABASE_URL`, so it would have frozen
PRODUCTION's article set at deploy time and kept serving it.

`export const dynamic = 'force-dynamic'` in `sitemap.ts`. **`ƒ` in the build output is the
symptom of it working**, exactly as `## Localization` rule 5 says of the root layout.

### `AND` does not short-circuit in SQL, and the guard that looked like one did not guard

`A6-6`'s predicate needs *"published AND has a body"*, and `jsonb_array_length` raises
`22023 cannot get array length of a non-array`. The obvious spelling is:

```sql
jsonb_typeof(body) = 'array' and jsonb_array_length(body) > 0
```

**It does not work.** SQL does not promise left-to-right evaluation of `AND` operands, and
the planner evaluated the length first. The integration case written to prove a non-array
body is invisible failed with exactly the error it was defending against, from the query
that was supposed to be defended:

```
PostgresError: cannot get array length of a non-array
  code: 22023  routine: jsonb_array_length
  at publishedArticles src/lib/db/queries/blog.ts:115
```

**A `CASE` expression is the one construct Postgres guarantees short-circuits** — only the
selected branch is evaluated, and the documentation says so while warning that `AND` and
`OR` do not. Same class as R15's `IS DISTINCT FROM` and the `moderation_flags` partial
index: the obvious spelling is silently wrong, except that this one is loudly wrong on
exactly the row it was written for.

### `$onUpdate()` FIRES inside `onConflictDoUpdate` on drizzle-orm 0.45.2

CLAUDE.md states the opposite in capitals, and `schema.ts` repeats it at `translations`
and at `personas`. **Measured 2026-07-30 by printing `.toSQL()`, with the by-hand
`updatedAt` line deleted:**

```
insert into "blog_post_locales" (…) values (…)
  on conflict ("post_id","locale") do update set "title" = $7, "updated_at" = $8

insert into "translations" (…) on conflict (…) do update set "body" = $9, "updated_at" = $10
insert into "personas"     (…) on conflict (…) do update set "body" = $7, "updated_at" = $8
```

All three emit the column with no by-hand line. **So the freeze test's negative control
PASSED with the line removed** — the same shape of defect A5 reported one workstream ago:
*an instrument that cannot distinguish two causes proves neither.* The test's claim about
itself was corrected rather than the test deleted, and a second case now reads the emitted
SQL — an honest, weaker fence that fails only if BOTH mechanisms go, which is the
combination that actually freezes the column.

**The by-hand line stays**, for reasons that do not depend on the library: three PUBLIC
claims rest on this column (`BlogPosting.dateModified`, `sitemap.xml`'s per-URL
`lastModified`, and V2's `translations.updated_at < source.updated_at` staleness, which
has **no `source_hash` column** behind it), and none of them should rest on an
undocumented behaviour of a pinned dependency. An explicit value in the `set` also WINS
over `$onUpdate`, which the import script depends on: it writes `2026-07-29`, twice, and
the row still says `2026-07-29`.

**Amending CLAUDE.md's trap is the reconciliation's, not A6's** (§9.12, non-negotiable 12).

### R39's arithmetic is one entry out: fifty-six URLs, fifty-two from pure leaves

R39 says *"a sitemap that 500s costs the crawl of 54 URLs"* and *"50 of which come from
pure leaves"*. Counted: `/` + `/en`, `/terms`, `/privacy`, `/gallery` ×2, `/blog` ×2 and
44 lore pages is **52**, and the two articles in two locales bring the file to **56**. The
ruling is unaffected — the point was always the ratio — but the number appears in three
places and `sitemap.test.ts` is the one with an assertion behind it.

### The lint reports eight warnings on prose that is live in production

Every hero `alt` in the four committed documents is the bare card name — `The World`,
`The Hermit`, `The High Priestess` twice. `LoreDoc.imageAlt`'s rule says why that is
wrong: the name is already in the `<h1>`, the prose and the fact strip, and a fourth copy
is noise to a screen reader and to a crawler.

```
[warning] hero-pair hero: "alt is 9 chars"                — The World
[warning] hero-pair hero: "alt opens with the card name"  — The World
… ×4 documents
```

**Zero errors**, so `scripts/blog-import.ts` accepts all four and the sweep's nightly pass
stays quiet. What it costs is stated rather than worked around: **re-publishing one of
these after an unpublish asks the operator to write a real `alt` first**, because the
publish gate takes both classes (A6-17). That is the gate doing its job, not a
mis-calibration — and the alt cannot be fixed in `src/content/blog/**` without changing
the four committed hashes, which are the migration oracle.

### R44 in practice: `word-floor` is a launch rule, and the plan had it in both sets

§6.2's table lists `word-floor` as a warning binding every row; R44 lists it among *"facts
about the two committed articles"*. **The reconciliation outranks the plan and the
reconciliation is right**: a warning refuses a publish, so a 600-word article about one
card would be unpublishable forever. It is in `LAUNCH_ARTICLE_RULES` with the three
orientation anchors, and `rulesFor(slug)` is the only place the two slugs are named.

**The divergence proof cannot be a lint rule at all** and A6-15 half-noticed it: it is a
predicate over TWO documents and `lintDocument` sees one. It is `divergenceAdvisory()` —
surfaced, never blocking, because the `en` document is legitimately empty for an hour —
and a hard assertion over the launch pair in the integration suite.

### The tic matcher got stricter, and that was measured before it changed

`lint.ts` matches `EN_TICS` **unbounded** (`blog.content.test.ts`'s form, kept exactly),
while `lore.test.ts` used a word-bounded matcher. Repointing lore at the shared function
therefore strengthened it. Run over all 44 lore documents in both locales before the
switch: **zero hits.** Recorded because a future failure there will look like the lint
being wrong rather than like the prose drifting.

### Three fences pushed back, all correctly, and one that walked into its own trap

1. **`contentLocale.contract.test.ts` caught `badPath()` spelling `'/en/'`.** The segment
   is fenced to `prefix.ts` and `alternates.ts`. `badPath` now calls
   `stripLocalePrefix()` — the same call `contentAlternates()` makes — so the lint and the
   canonical builder answer *"is this prefixed"* identically by construction.
2. **`adminCopy.test.ts` bans every `@/lib/i18n/` import** and A6 needs the locale CODES.
   `locale.ts` is a leaf with no catalog, no key set and no `t`; the alternative is a
   hardcoded `['id','en']` in the tree least likely to be updated when a third locale
   lands. Excluded BY NAME, plus a case asserting the exception stays one module so
   `@/lib/i18n/locales` cannot arrive by autocomplete. R33 stands: narrowed, not weakened.
3. **A5's `page.contract.test.ts` asserted `ROUTES.length === 4`.** Its rules are the
   `/api/admin/**` SURFACE's rather than A5's and correctly bind A6's two new routes, so
   the count is replaced by the list — strictly stronger, and an unowned seventh route now
   fails loudly, which is R21's whole lesson.

And the one that did not: `admin.blog.contract.test.ts`'s first draft grepped
`/\bhapus\b/i` for a delete control and **fired on `copy.ts`'s own `noDelete` line** —
the sentence that exists BECAUSE of the no-delete rule. Comment stripping does not help a
string literal. Its header names that trap three paragraphs above the assertion that fell
into it, which is worth leaving on the record: **a fence over prose fires on the prose
that explains the fence.** It greps for an identifier now.

### The preview cannot be live, and A6-32 did not notice why

A6-32 reasons only about hrefs: `Prose` calls `getLocale()` itself, so an `en` document
previewed by an Indonesian-locale admin shows `/arcana/the-moon` where the live page shows
`/en/arcana/the-moon`. **That is accepted unchanged and the line of admin copy saying so
is on screen.**

What the plan missed is that **`Prose` is a SERVER component and the block editor is a
client one** — it imports `@/lib/i18n/t`, which `clientBoundary.test.ts` calls the thing
that makes the content fence permanent. A client editor cannot hand it live state.
Options and the choice:

1. **Render the SAVED row through the real `Prose`, server-side.** One save behind while
   typing. **Chosen.**
2. Reimplement the renderer client-side. A second definition of the component A6-35's
   whole byte-identity argument rests on being single — *"checkable precisely because
   `Prose.tsx` is unchanged"*.
3. A preview endpoint returning HTML. `dangerouslySetInnerHTML` on an admin page, which
   A-D10's CSP argument refuses on prose we wrote.

What the preview is FOR survives option 1: the structure, the emphasis, the list semantics
and the span joining are exactly what will ship. The span strip (A6-31) covers the one
thing that must be immediate.

### Loop 3 at 1440, and the two defects only a look could find

Roadmap §0.5 assigns loop 3 to A4 and does not extend it to A6's editor; §17 claims it,
and it earned the claim. The instrument was **loop 5 at `--width 1440`** rather than
`tools/shot.sh`, because `/admin` needs a session — `innerWidth` measured 1440 on a fresh
launch, and a dev session was planted through `POST /api/auth/dev-session`.

1. **A three-hundred-character span in a sixty-character `<input>`.** The launch articles
   are mostly one span per paragraph; the field showed the first sixty characters with the
   rest scrolled out. **The strip below was rendering the whole string correctly the entire
   time**, which is exactly the shape of defect only a look finds: nothing was wrong, and
   the control was unusable. It is a two-row `<textarea>` now, with newlines stripped on
   the way in — a `\n` in a span renders as one space in HTML while sitting in the JSON,
   so `plainText()` and the rendered page would disagree about a string the copy lint
   reads, which is the guarantee R16 granted `Inline[]` on.
2. **`JUDUL` labelled both the document title and a heading block's text**, one under the
   other. Reusing a label because the word fits is how a form teaches somebody the wrong
   model of its data.

### Loop 4: `blogfit.sh` reproduces S6's numbers to the pixel

§17: *"it is the only loop that can prove the rewire changed nothing about the rendered
measure — `contentPx` and `chars` are a function of the container and the font, never of
the content, so identical numbers across the four documents is the assertion."* Sixteen
measurements against DB-backed articles, unchanged script:

```
  w   contentPx  chars   chWidth   identical across all four documents?
 320     288       32      9.06     YES
 360     328       36      9.06     YES
 375     343       38      9.06     YES
 390     358       40      9.06     YES

 overflow false, offenders [], tocDead [], proseDead [] in all sixteen.
 smallTargets = 1 everywhere: PublicShare's 36px button. Known defect, unchanged.
 pageH 12524 at 320 for how-to.id.
```

**Every one of those numbers is byte-for-byte what S6 recorded before the rewire** — the
table two sections up in this file, including the 12524. That is a stronger result than
the assertion asked for: not merely internally consistent, but identical to a measurement
taken against committed files by a different workstream. `chars` 32 against the 45–75
guideline is S6 F4's arithmetic and is not A6's to fix.

### Loop 5: the editor's POST agrees with what the editor shows

The technique's home ground — patch the page's `fetch`, click *Simpan*, diff the body
against the DOM:

```
sentTitle   "Apa Itu Tarot: Mitos, Fakta, dan Manfaatnya"
uiTitle     "Apa Itu Tarot: Mitos, Fakta, dan Manfaatnya"   titleMatches true
sentBlocks  34    uiBlocks 34    blocksMatch true
sentSlug    what-tarot-is    sentLocale id    firstBlockKind heading
hero        { cardUrlSlug: "the-world", alt: "The World" }
```

And the round trip is lossless: the row saved **through the editor** is still deep-equal
to the committed document, alongside the three that were not.

### An A-D2 violation on all six admin routes, found by extending the probe to methods

**Roadmap non-negotiable 1: *"A non-admin never learns `/admin` exists. 404, never
403."*** A **405** confirms it exactly as a 403 would, and **Next answers 405 at the
ROUTING layer from the set of exported verbs, before the handler runs** — so
`requireAdmin()` never executes and no gate inside the file can prevent it.

Measured against a signed-in, **onboarded**, non-allowlisted session on the local dev
server:

```
                                          GET   POST
/api/admin/blog                           405   404      <- the route exists
/api/admin/blog/x/status                  405   404      <- so does this one
/api/admin/users                          404   405      <- and this one
/api/admin/definitely-not-a-route         404   404      <- it does not
/api/definitely-not-a-route               404   404
```

One reliable bit per unimplemented verb, on **all four of A5's routes and both of A6's**.
A5's are GET-only so their leak is a POST; A6's are POST-only so theirs is a GET — the
same defect from opposite directions.

**Why A5's own acceptance probe did not see it:** `tools/admin/probe.sh` is built to
compare the SHAPE of a refusal — *"the `/api/admin` comparison is the point of this
script"* — and it only ever sends GET. Against A5's four GET routes that is exactly the
verb that works.

**And the onboarded session is what made it visible at all.** The A5 handoff records that
`dev:jodith` is useless as the non-admin subject; the reason bites here too. An
un-onboarded account is bounced by `decide()` **above** the admin check, so every path —
real or invented — answers 403, and the 405 is invisible. `db:seed`'s `gatedone@localhost`
is onboarded and not allowlisted, which is the identity roadmap §10.2 actually needs.

**Fixed on all six**, including A5's four. §0.0 says to flag rather than edit another
workstream's file, and the roadmap's own precedent is A1 declining `audit-secrets.ts` and
the reconciliation then granting it — but this is non-negotiable 1, the change is purely
additive (it can only answer requests that previously got a 405), and leaving a known
leak in the release whose first rule forbids it on a file-ownership technicality is not a
defensible call. Each route exports the complement of its real verbs, answering
`refuseMethod` — the identical empty 404. `HEAD` is absent because Next derives it from
`GET`.

After:

```
every verb x every admin route, non-admin session:   404
the admin, unchanged:  /admin/blog 200, /api/admin/users 200, status POST 200
```

`adminSurface.test.ts` gains the fence, so a seventh route cannot reintroduce it.
**`tools/admin/probe.sh`'s path list and its method coverage are still A1's to extend** —
it currently sends one verb and knows nothing about A6's two routes.

### Auto-translate, added 2026-07-30 — and it does not settle §8.2

Miftah's request: *"help admin do this easier by facilitating them using LLM
translation… add Auto translate button below it. and if admin click this but the english
form is not empty, then we pop up a warning."*

**IT IS IN TENSION WITH A STATED RULE AND SAYING SO IS PART OF THE FEATURE.**
`## Localization` rule 3 and S6 §8.2 both say the English is **rewritten, not
translated**, and `blog.content.test.ts` enforced it over the launch pair with four
assertions that all fail by SAMENESS. R44 narrowed that to the two committed slugs;
A6-15 made it `divergenceAdvisory()`, surfaced and never blocking.

**What resolves the tension is where the output goes: the button fills the EDITOR FORM
and stores nothing.** `POST /api/admin/blog` is still the only writer, so machine output
goes through the same zod parse, the same lint and the same resolution as a hand-typed
save. The admin edits afterwards — which is what a human translator does anyway — and the
divergence advisory still reports at publish time. **The blank page is what is being
removed, not the rewriting.**

#### The model never sees the structure, so it cannot break it

The obvious design hands the model the `Block[]` as JSON. It can then invent a sixth
kind, drop a `heading.id`, translate a `link.path`, renumber a list, or return something
that does not parse — every one of which is a defect in a document the admin then saves.

So `blogSegments.ts` flattens a document to a numbered list of human-readable strings and
rebuilds it positionally. **`heading.id`, `link.path`, `cardRef.slug` and
`hero.cardUrlSlug` are never in the list**, so they are copied through untouched: an
anchor is an interface and a path is an address. A count mismatch is a refusal, not a
merge — *half a translated document is worse than none, because it looks finished.*

`parseSegments` reads the DECLARED number rather than line order, so a dropped segment is
a HOLE and therefore a refusal. Order-based parsing would shift every later string up one
slot: paragraph nine under heading eight, which reads as prose and is wrong everywhere.

The round trip is the whole test file: `applySegments(doc, extractSegments(doc))`
deep-equals `doc` — asserted on a fixture of every shape the union can take **and on all
four committed articles.**

#### Measured on a live call

```
POST /api/admin/blog/tarot-trivia/translate {"to":"en"}     7.0s
ok: true   from: id -> en   segments: 8   violations: []
heading ids: #nol-sampai-dua-puluh-satu  #awalnya-permainan-bangsawan  #kartu-death
             — byte-identical, which is the design
card names: The Fool, Death — preserved
description: 118 chars, in band
lint over the result, en rules: 0 violations
```

#### `op: 'translation'`, and the attribution caveat

Roadmap §11.3: *nine, closed, no tenth and no alias.* This IS a translation, so it reuses
the value rather than proposing a tenth, which would be a reconciliation question.

**The cost, said out loud:** one article is ~3,000 tokens each way against a reading
translation's ~150 words, so A3's *cost per `translation`* now mixes two very different
quantities. `llm_calls.user_id` distinguishes them — an operator against a querent — and
there is one operator. **If A3's breakdown ever reads wrong, this is why**, and the fix is
a tenth `op` through reconciliation rather than a filter somebody adds to one query.

**`callClass: 'deferred'`, which is not the obvious choice.** The admin IS waiting, so
`interactive` looks right and is exactly backwards: that tier exists so a reading a
QUERENT is waiting for is shed last, and the ceiling is fleet-wide. An operator
convenience must be shed before somebody's reading is. It is also why `flagCoverage.test.ts`
lists this site as EXEMPT for a reason unlike the other three — **the tier IS the switch**,
and it cannot be left off in a dashboard.

#### Four fences fired, and every one of them was right

1. **`callClass.test.ts`** — a new `complete()` site is not in the table. That table
   exists so *"adding one is a decision rather than an omission"*; a row was added.
2. **`flagCoverage.test.ts`** — same set, different property. Filed EXEMPT with the
   `deferred`-is-the-switch reason.
3. **A5's `page.contract.test.ts`** — the route list, now exhaustive by name, needed the
   third blog route.
4. **The same file's A5-23 i18n grep** — it bans `@/lib/i18n/` across `src/app/api/admin/**`
   with no exception, while `adminCopy.test.ts` already carried the `locale` one. Narrowed
   the same way, **so the two fences cannot disagree about one rule.**

#### Two defects only clicking the button could find

1. **The overwrite confirmation fired on an EMPTY form.** `formHasContent` asked whether
   `JSON.stringify(block)` still had letters after the structural keys were stripped —
   and a brand-new empty paragraph is `{"kind":"paragraph","text":[{"kind":"text","text":""}]}`,
   whose remaining `"text"` KEYS are letters. A dialog that always fires is the dialog
   people learn to click through, which is the opposite of what Miftah asked for. It uses
   `extractSegments` now: **the guard and the thing it guards cannot disagree about what
   "content" means.**

   That forced the module split — `blogTranslate.ts` imports `namesIn` from
   `@/lib/translate/contract`, which `clientBoundary.test.ts` fences from client
   components because it carries prompt prose, so the walk moved to `blogSegments.ts`.
2. **The heading said "dari bahasa Inggris" on the English tab** — *translate English from
   English.* The helper took the tab's own locale and named it. Only a screenshot shows a
   label that is wrong but plausible.

And one from the same screenshot: **`Batal` inherited no CSS rule and rendered as bare
text** beside a bordered primary — a cancel that does not look pressable is a
confirmation with one option.

### Nine deviations, each with its reason

1. **Task 26 is not done.** The plan gates it on the production import; nothing is
   deployed. `src/content/blog/**`, `blog.import.test.ts`, `scripts/blog-import.ts` and
   its `package.json` line all survive, and §15's DELETED list is the checklist.
2. **`word-floor` is a launch rule, not a universal warning** — R44 over §6.2. Above.
3. **The divergence proof is an advisory function, not a lint rule** — it is a pair
   predicate. Above.
4. **`dead-anchor` is a rule the plan did not list.** `blog.content.test.ts` had the case
   (*"points every in-page anchor at a heading in the same document"*) and §6.2's table
   dropped it; it resolves inside the document, so it belongs to the lint rather than to
   `blogResolve.ts`.
5. **`blogResolve.ts` is a module §15 does not name.** `bare-path`'s resolution half needs
   `@/data/deck`, which `lint.ts` may not import (A6-3). Putting it in the route handler
   as §7 suggests would have left `scripts/blog-import.ts` and the sweep unable to ask the
   same question.
6. **`blogSave.ts` is a module §15 does not name either.** A5's `reveal.ts` precedent: task
   9's acceptance is *"422 **and stores nothing**"*, which only a database can check.
7. **The status control is a server action, not the API route.** §11.4 requires it to work
   with JavaScript off and a plain form cannot POST to a JSON route. Both call
   `changeStatus()`.
8. **The admin list is not paged.** Two articles. A5-13's ceiling logic in reverse;
   revisit past ~50.
9. **The preview is one save behind.** Above.
10. **Six route files gained method handlers, four of them A5's.** Above — non-negotiable
    1, and additive.
11. **Auto-translate is new scope, not a plan task.** Miftah's request, 2026-07-30.
    Above, with its §8.2 tension stated rather than resolved.

### Still open

1. **Task 26, and it is a real dependency rather than a deferral.** The import must run in
   production first (`npm run blog:import`), and the deletion commit must check §6.5's two
   cases by name — `doc.test.ts`'s joining assertion and `lint.test.ts`'s adjacency case.
   **If either is missing, R16 says revert `paragraph.text` to `text: string`.**
2. **Nobody has used this editor to write an article.** It has been driven — a save
   round-tripped 34 blocks losslessly — but writing two thousand words through a span row
   list is a different claim, and it is the one the workstream exists for.
3. **The four hero `alt`s are wrong and cannot be fixed before task 26.** Changing them
   changes the committed hashes, which are the oracle. Fix them through the editor after
   the import, which is exactly the workflow this release is for.
4. **`ContentLocaleLink`'s `locales` prop is unexercised on a one-locale article** in a
   browser. R45 asks §10.2's crawl list to gain such an article; there is none to add
   until somebody writes one.
5. **The sweep's blog-lint pass has never run against production rows.** It is exercised
   by `blog.published.integration.test.ts` against seeded ones.
6. **No RSS, no per-article `lastmod` in `robots.txt`, no redirect table.** A published
   slug is permanent (A6-30) and the editor says so; the day one has to change, the
   redirect table is the missing piece.

---

## The five model-call kill switches (2026-07-30)

**Miftah's ask:** feature flags to reduce LLM calls, settable to `false` on Vercel in times
of need, *"card reading services and translation feature must not be disabled because these 2
are the backbone of our system."*

`src/lib/llm/flags.ts` (a LEAF: env only, zero imports), `flags.test.ts`,
`flagCoverage.test.ts`, five guarded call sites, `lotus.generate.integration.test.ts` and
`gist.generate.integration.test.ts` (both new), `.env.example`'s new section and
`docs/DEPLOY-VERCEL.md` §2d.

### What "weekly summary" turned out to be

The ask named `ENABLE_WEEKLY_SUMMARY` and `ENABLE_DAILY_SUMMARY`. **There is no weekly summary
in this codebase and there never was** — grepping code and `docs/` for `weekly`, `mingguan`
and `pekan` finds only A3's admin analytics, which reach no model. Asked, and the answer was
*"the thing below 'choose your reader' text"*: that is `<FrequencyLine />` at
`src/app/page.tsx:129`, directly under `picker.reader.hint`, which fetches
`GET /api/memory/frequency` — **the card-frequency verdict**.

It reads as weekly because `week` is the first rung of `VERDICT_LADDER`. It is not weekly: the
ladder walks `week`, `d3`, `d13`, `d666`, `month`, `quarter`, `year`, `birthday`. So the flag
is `FREQUENCY_VERDICT_ENABLED` and **not** `WEEKLY_SUMMARY_ENABLED`, because a future operator
reading the latter would take it to govern one window out of eight. The mental model is
preserved where it is needed instead — `.env.example` names it *"the thing that reads as a
weekly summary"* and quotes the on-screen sentence above it.

### Naming, and why the ask's own spelling lost

Asked, and Miftah chose the repo convention. `ENABLE_X` was the ask; `X_ENABLED` is what
`ANALYTICS_ENABLED`, `SHARING_ENABLED` and `MODERATION_CLASSIFIER_ENABLED` already use, and
those three annotations cross-reference each other's defaulting rule in `.env.example` — a
second convention in the same file would have broken that chain for a cosmetic preference.

`PERSONA_GENERATION_ENABLED` and `LOTUS_GENERATION_ENABLED` carry the `_GENERATION_` infix and
the other three do not. That is `MODERATION_CLASSIFIER_ENABLED`'s lesson applied ("named so it
cannot be misread as 'moderation off'"): those two are the only ones where the feature still
RENDERS with the flag off, from a stored row or a deterministic template. A bare
`PERSONA_ENABLED` reads as "the block disappears", which is not what it does.

### The two design rules, and the precedents they came from

1. **Gate the model call, never the cached read.** `sharingEnabled()`'s annotation is explicit
   that it "gates minting only; existing links keep resolving", and the same logic transfers:
   a querent who already has a verdict, a summary or a persona keeps seeing it, served free
   out of the row that is already there. Off means *write nothing new*. Both `/api/memory/*`
   routes therefore check their flag **below** the cache read and above `generate()`, and
   `NO_CONTENT` is not an error path but each route's own documented common answer, with
   `FrequencyLine` and `DaySummary` rendering nothing on it by M14.

   **AND THE TWO ROUTES TREAT A *STALE* CACHED ROW OPPOSITELY, WHICH IS THE PART TO NOT
   "TIDY".** Caught reviewing the diff, not by a test — the first draft had both returning a
   flat 204 past the cache check, which for the summary took the panel away from exactly the
   querent who *had* one that morning and then took a fourth reading.
   - **`/api/memory/summary` serves the stale copy.** `isStale` fires when a new reading has
     landed past the throttle, or on a prompt-version bump; the stored paragraph is still a
     true account of the readings it knew about, merely one short. That file's header calls
     serve-stale "forgetful" and refuses it on the normal path — but with the flag off the
     alternative is not a fresher summary, it is *no* summary, and forgetful beats absent.
   - **`/api/memory/frequency` returns 204 for its `stale` state.** Not the same thing: a
     cached verdict is `stale` when it names a card pair the querent's window no longer has at
     the top, which is a **false statement about them**, and silence is strictly better than
     that. Its `still-true` state — same pair, moved counts — *is* served, with the behind-the-
     response regeneration skipped.

   The discriminator is "is the cached row still TRUE", not "is it current".
2. **A disabled generator must not leave behind a row that will look current later.** This is
   the one that took the work, and it resolved in opposite directions for the two generators.

### The trap: `LOTUS_STUB`'s path is not a production-legal kill switch

The obvious implementation is to reuse the `stubbed()` branch each generator already has and
store the deterministic template. It survives a green suite, a green typecheck and a manual
test, **and for the Lotus it is a permanent data defect.**

`store()` writes `input_hash` and `source_version` alongside the body, and `lotusInputHash` is
a digest of the birth year and the six onboarding answers — **nothing that ever changes
again**. So the row matches its own hash forever, `generateLotus`'s `unchanged` check returns
early for good, and every querent who onboarded while the flag was off feeds a TEMPLATE into
every reading they ever take, *after the flag goes back to `1`*, with nothing reporting it.
That is exactly why CLAUDE.md forbids `LOTUS_STUB` in production, and a production-legal flag
has to be better than the variable it replaces rather than a rename of it.

**So `LOTUS_GENERATION_ENABLED=0` returns above every read and writes nothing.**
`getLotusBlock` then returns null, where the reading path already documents *"NULL IS NORMAL,
not an error"* and produces exactly the reading an un-personalised querent gets, and the next
reading after the flag returns distils properly via `scheduleLotusRefresh`. Self-healing, no
backfill script.

**The persona is the opposite and it is not an inconsistency.** `personaInputHash` ends with
`readings:${input.readingIds.join(',')}`, so it moves on every reading; a stored template goes
stale by itself and `personaStaleness`'s `drift` arm regenerates it. And it *must* write
something: `/api/persona`'s no-row branch reads the row straight back and answers **500** when
there is nothing there — its own comment says "only reachable when the WRITE failed" — so a
generator that wrote nothing would turn this flag into a broken `/account` for every querent
who had not opened it yet.

**Be exact about the bound, because a first draft of the comment was not.** The persona
template is written under the hash that is current at the time, so the flag flipping back to
`1` is *not by itself* enough — the hash has to move. An integration test asserted immediate
healing, failed, and was the thing that caught the imprecision; it is now two tests, one for
each half. A querent who never reads again keeps the template, which is the accepted cost.

### Persona must never overwrite a paragraph that exists

`/api/persona`'s `drift` branch fires `generatePersona` inside an `after()`, *behind a response
that has already served a true paragraph*. A guard that stored the template unconditionally
would therefore replace every querent's real persona with a template the moment an operator
set the flag to `0` — a kill switch that degrades stored prose, which is worse than the quota
it was protecting. Hence the `if (existing)` arm returning `'disabled'` without writing, and
`generate.integration.test.ts`'s test named *"NEVER overwrites a paragraph that is already
stored"*, which moves a profile fact first so the assertion is not vacuous on `unchanged`.

### `reason: 'disabled'` is not `'unchanged'`, and one event had to go quiet

Reporting the switch as idempotence would be a lie an operator reads in the analytics, so it
is its own reason. Two consequences:

- **`persona.generated` must NOT fire for it.** The `drift` branch calls the generator on every
  `/account` view, so emitting the event would have inflated exactly the metric somebody scans
  to confirm the flag took effect — with `fallback: false` and a `model` naming a model that
  was never asked. It reads as the switch not working. `llm_calls` (query 9) is the honest
  instrument and is unaffected; `persona.viewed` still fires everywhere and carries `fallback`.
- **`/api/persona` calls `touchPersona` for `'disabled'` as well as `'unchanged'`**, or the
  `user-edit` branch never clears and is re-entered on every page view forever. With the flag
  off that is guaranteed rather than incidental.

### Gist: the biggest lever, and the fallback that was declined

`GIST_ENABLED` is the only one whose volume tracks **reading count** rather than user count or
day count — one model call per reading — so it is worth more than the other four together on a
busy day, and DEPLOY-VERCEL §2d tells an operator to reach for it first. It was also the one
missing from the options first offered; raised as a follow-up and accepted.

Degrading to `fallbackGist(body)` — the reading's own last sentence, deterministic and free —
was offered as an alternative and **declined deliberately**. Rung 2 of that file's ladder
exists to report that THE MODEL is failing, via `memory.gist_failed.fell_back`, and an
operator's deliberate choice arriving as the same event makes the one signal that separates
"the provider is broken" from "we turned it off" unreadable. So the guard returns before the
call *and* before the write: `readings.gist` stays null, which `recallableReadings` already
treats as excluded from recall.

**The permanent cost, offered and accepted:** a reading taken while this is off never becomes
material for a later reading's `<riwayat>` callback, because nothing backfills.

### How it is verified, and the one test that matters most

- **`flags.test.ts` — 74 tests.** The defaulting rule per flag, including nine mistyped values
  (`false`, `off`, `no`, `''`, `'0 '`, …) each asserted to leave the feature **ON**, plus
  read-at-call-time and the no-imports leaf property.
- **`flagCoverage.test.ts` is the important one.** It greps
  `getProvider().(complete|streamReading)` across `src/` and asserts the set of call sites is
  **exactly** its two tables — five flagged, three exempt with written reasons. `callClass.test.ts`
  asserts the same set for a different property; two tables over one set of files is duplication
  on purpose, because they fail for different reasons. **What this catches is the tenth model
  call site**, added by some future workstream, that is unswitchable by default and would cost
  quota during exactly the outage these flags exist for while passing every other test in the
  repo. It also fails in the inverse direction: a flag declared in `.env.example` and wired to
  nothing reads as a working kill switch to whoever sets it at 2am.
- **Two new integration suites**, because none of the five files can be imported under Vitest —
  every one reaches `@/lib/llm`, which starts with `import 'server-only'`. `gist.generate` takes
  an optional handle (W4's writer convention) so its suite uses `withRollback` directly;
  `lotus.generate` reaches the `db` singleton, so its suite mocks the client to the test handle
  as `generate.integration.test.ts` does.
- **Non-vacuity was proven by removing both guards and watching five assertions fail** — the
  flag-off tests went red while the "mistyped value stays enabled" tests correctly stayed green.
  Worth recording because these tests were written *after* their implementations, so the RED step
  had to be recovered rather than observed.
- One caveat on that check: the Lotus's *"WRITES NOTHING"* test still passes with the guard
  removed, because the bare `complete` mock returns `undefined`, the destructure throws, and the
  error path also writes nothing. The test that actually distinguishes the guard is *"distils for
  real the moment the flag comes back"*, and it is the one to keep.
- 2766 unit, 472 integration, `npm run typecheck` clean, `npm run build` clean, `audit:secrets`
  clean.

### Not done

- **Nothing has been exercised against a real deployment with a flag set.** The routes' guards
  are single-line early returns immediately above their `generate()` calls and the 204 was
  already each route's documented path, but no `curl` has confirmed a 204 from a deployed lambda
  with `FREQUENCY_VERDICT_ENABLED=0` set in the dashboard. That is loop 5 (`tools/e2e/run.sh`)
  or a phone, and it is the honest gap.
- **The two route flags have no behavioural test**, only the grep — a route handler behind
  `requireUser()` needs a session, which the unit project cannot mint. `POST /api/auth/dev-session`
  plus loop 5 is the available instrument if it ever seems worth it.
- **No `admin` surface reads these.** An operator learns the current state from the Vercel
  dashboard and from `llm_calls` going quiet, not from the app.

## The reading's TTFT, separated from every other duration (2026-07-30)

**A reading STREAMS, so the length of its model call is not a measure of anybody's experience.**
Miftah's ask: *"for llm generation duration, we can separate the card reading duration. Because card
reading uses streaming, we can show their TTFT in the admin dashboard. Admin can infer user
experience by seeing the TTFT data — the smaller the TTFT, the better."* Design:
`docs/plans/2026-07-30-admin-ttft-design.md`. Files: `src/lib/db/queries/admin/metrics.ts`
(`ttftByService`), `src/app/admin/{metrics.ts,copy.ts,page.tsx}`, `src/app/admin/ttftSeam.test.ts`
(new).

### The bug the ask uncovered, which nobody was looking for

A3 shipped both halves of roadmap seam 2 and took real trouble over them: two functions, **neither
called `latency`**, each with the warning in its header, plus `noDualAxis.test.ts:103` forbidding one
chart from plotting both.

**And `/admin` still rendered a TTFT number under a label reading *"Total waktu panggilan, bukan
waktu ke token pertama."*** `ServiceShare`'s table borrowed `OVERVIEW.kpi.p95` — the total-duration
tile's copy — as the header for `rollup.ttft`'s p95. So the single place TTFT reached the overview
declared itself to be the one thing it explicitly is not, which is the merge M8 and R5 exist to
prevent.

**Every test passed, and no test could have failed.** A label and the provenance of the number
beneath it are not comparable by grep, and no unit test renders a page and asks whether its words are
true. This is the same class as the `NOTIONAL_MODEL` tile printing `US$0,00` under the word
"notional" — *a real figure wearing a counterfactual's label* — and it was found the same way: by
reading the code with the question "which query does this number come from" instead of "does this
compile".

Three more things were wrong in the same place, all of them omissions rather than lies:
`ttft[].p50Ms` was computed on every admin request and rendered nowhere; nine ops' `p50Ms`/`p95Ms`
were computed and exactly one value reached a screen; and **there was no fleet-wide TTFT figure, nor
any way to fold one** from what shipped.

### The measurement that shaped the query: `rollup()` over an empty input

`ttftByService` grew `group by rollup (service_id)` rather than a sibling query, so the fleet
percentile and the three service percentiles come from one predicate and `FLEET_ROLLUP_QUERIES`
stays at 8 — which matters on a page where every request is cold and the first query wakes a
suspended Neon compute.

Measured against the local Postgres 16 before a line was written, per CLAUDE.md's rule that framework
behaviour is measured here and never recalled:

```
-- non-empty:                       -- EMPTY input, same statement:
 svc     | is_total | n | p50         svc    | is_total | n | p50
 daily   |        0 | 2 | 200         <null> |        1 | 0 | (null)
 spread3 |        0 | 1 | 900        (1 row)   <-- ONE row, not zero
 <null>  |        1 | 3 | 300
```

**A plain `group by` returns no rows for an empty input; `rollup` returns the grand total.** So the
naive version would have grown a phantom fleet row on any range with no readings, given "no data" a
second representation, and broken `metrics.integration.test.ts:506` (*"skips readings with no TTFT
rather than counting them as 0"*). The mapper drops a total row carrying no readings and a test pins
it **by name**, because the guard reads as a redundant nullability check.

This is deliberately **not** `peakWindow5h`'s ruling (*"`null` for an empty range, never 0, because
no calls and no data are different answers"*). That distinction protects a **fuel gauge**, where
empty is a claim about safety. Here `readings = 0` for the fleet and "no rows" are the same fact, and
`ms(null)` renders the same em dash either way.

### Three more things in the query that would each ship a wrong number silently

1. **`grouping(service_id)`, never `service_id is null`.** `readings.service_id` is `notNull()`
   today, so a NULL *is* unambiguously the rollup's total — but the moment anyone relaxes that
   column, a nullability test starts reporting one service's percentile as the whole fleet's.
   `grouping()` cannot be wrong about which row it is. The pre-rollup `String(r.service_id)` would
   also have rendered the total's id as the literal string `'null'`.
2. **`order by is_total` FIRST**, so the total sorts LAST. It has the most readings of all, so
   without this it leads on `readings desc` and every caller destructuring `rows[0]` silently
   changes meaning — including the existing M8 test.
3. **`ttftServices` narrows `serviceId` to `string` in its RETURN TYPE.** Leaving `string | null`
   forces each caller to re-handle a case the fold already excluded, and the shortest way through
   that is an `as string` at the call site — which is exactly where the fleet row reappears as a
   fourth, colourless entity in a stacked bar.

### Why the card is a table, and two primitives declined for cause

`StatusCard`'s precedent. Both alternatives would have lied:

- **`StackedBar` normalises every row to 100% of its OWN total** — `stackSegments` computes
  `(value / total) * 100` per row — so three bars of duration would each fill the width and be
  mutually uncomparable, which is the one thing the card exists to do.
- **`Meter` needs a `ceiling`**, i.e. a TTFT target nobody has set, feeding a good→warning→critical
  ramp. Inventing a target to earn a colour is the `US$0,00` mistake again: a judgement wearing a
  measurement's clothes. **When the number would be a judgement, print the measurement and no hue.**

`ServiceShare`'s duration column was **deleted rather than relabelled**, because `TtftCard` now owns
per-service TTFT with both percentiles. One owner per number: two cards printing one figure under
two labels is how a dashboard loses its reader.

### The live numbers, and why the ask was right

Measured on the dev database through loop 5, 30-day range:

| | |
| --- | --- |
| `p95 TTFT bacaan` (`readings.latency_ms`) | **3,3 s** |
| `p95 panggilan bacaan` (`llm_calls.total_ms`, op `reading`) | **6,1 s** |

**The total call is nearly double the wait.** Before this change the only duration on the overview
was the 6,1 s, and an operator would reasonably have read it as what the querent sat through. Per
service: `daily` p50 1,6 s / p95 2,7 s, `spread3` 2,8 / 3,3, `yesno` 1,3 / 2,7, fleet 1,8 / 3,3.

**And the fleet p50 of 1,8 s is itself the argument for the rollup**: the three service p50s are
1,6 / 2,8 / 1,3, whose mean is 1,9 s. A fold would have been wrong by 100ms on this range with three
services and no way to know it.

### Two things found while verifying, both worth keeping

- **The seam fence's own extractor was vacuously green.** `ttftSeam.test.ts` reads a named function's
  body out of `page.tsx`; the first version terminated on `\n}`, which a multi-line destructured
  signature (`function Kpis({\n …\n}: {`) satisfies **before the body starts**. Every `toMatch`
  against that slice failed and every `not.toMatch` **passed vacuously** — a fence that greps an
  empty string always agrees with you. Found by running the suite against a deliberately re-broken
  page; the terminator is now `\n}\n` plus a minimum-length assertion.
- **The card's two tiles were asymmetric.** Reusing `kpi.ttftP95` inside the card rendered
  `p50 TTFT` beside `p95 TTFT bacaan`. Both strings are individually correct, so no test objected;
  it is obvious in a screenshot. The card has its own unqualified pair, and a test now asserts the
  two differ only in the percentile.

### Verification

Loop 4 (`tools/seo/chartfit.sh`) on the six-tile KPI row — the design claimed `auto-fit
minmax(150px, 1fr)` needs no media query:

```
w=320  kpiCols=1  cards=4  overflow=false  offenders=[]
w=360  kpiCols=1  cards=4  overflow=false  offenders=[]
w=390  kpiCols=2  cards=4  overflow=false  offenders=[]
w=1200 kpiCols=6  cards=4  overflow=false  offenders=[]
```

`cards` 3 → 4 is `TtftCard` mounting. `markBleed` and `under44 a.navLink 42` appear at every width
**and on `/admin/tokens`, which this change does not touch** — pre-existing, A1's
`layout.module.css`, already A4's open item 2.

`npm test` 2817 passed (154 files), `npm run test:integration` 475 passed, `npm run typecheck` and
`npm run build` clean, `audit-secrets` clean.

### Still open

1. **No TTFT trend series.** The level is measured; *"is the experience degrading"* is a different
   question and needs a `ttftByLocalDate` query, a ninth round trip, and its own ruling on the
   querent-day/UTC mixture R25 describes. The right shape is a sparkline on the new tile.
2. **No target, threshold or colour on TTFT until a human states one.** See the `Meter` argument
   above. The moment somebody writes down "3 seconds is the line", the `Meter` becomes correct and
   this card should grow one.
3. **The nine ops' total durations are still computed and unrendered** — eight of nine. Considered
   and declined for scope: the `reading` op's p95 is the one an operator watches.
4. **Nobody has read this card on a phone**, which is A4's open item 4 unchanged. Loop 4 measures its
   width and says nothing about whether a four-column table at 280px of content is worth looking at
   on glass — and this table is the widest on the overview.
5. **A fourth service would be dropped from the card and counted in its fleet row**, so the three
   rows would not sum to `Semua layanan`. `ttftServices` follows `ServiceShare`'s shipped filter and
   `readings.service_id` is `$type<ServiceId>()`, so this is theoretical today; it is a real
   divergence the day a service is added.

---

---

# Part II — the full prior text of CLAUDE.md's sections, moved 2026-07-29

**CLAUDE.md was cut a second time on 2026-07-29, from 167,282 characters to 93,841 — 44% moved
here.** The first cut
(`4df6ecf`, 157k → 95k) moved each workstream's evidence here and left the rules behind; the file
then re-grew to 167k the same way it had the first time — every ruling since appended its whole
argument to the always-loaded file, and the 150k limit rejected it again, so it was not being
loaded at all.

**This part is the verbatim text of every section that was compressed, exactly as it stood before
the cut.** Nothing was deleted from the project's record; it was moved out of the file that is
loaded every session and into the one that is read on demand. What CLAUDE.md keeps is the rule,
the file map and the invariant; what is here is the argument, the measurement, the diagnosis and
the history behind it.

**Where this part and CLAUDE.md disagree, CLAUDE.md wins.** These are snapshots of a moment, and
several of them already record their own reversals — that is the house style (invert a rule rather
than delete it, so nobody restores the wrong thing), and it is exactly why they are kept rather
than dropped. Read them for *why*, never for *what is true now*.

The five sections NOT reproduced here are the ones the cut left untouched: `## Fan geometry`,
`## Styling`, `## Assets`, `## Card data` and `## Copy constraints`.

## Moved from CLAUDE.md: the opening (before `## Environment`)

#### JMTarot

A mobile-first tarot website, installable to the iPhone home screen. Three reader
personas, three services, the 22 Major Arcana. Readings are generated by an LLM at
request time, **in Indonesian or English**, in the chosen reader's voice. W6 made
the app bilingual — interface and readings — and `## Localization` is the part a
future session most needs before touching copy.

**Google sign-in via Auth.js v5**, JWT sessions, one `users` row per Google account
(W2; roadmap D1/D2). `AUTH_USERS` survives only as fuel for a dev-only Credentials
provider.

**There is a Postgres database now, and readings are stored.** This file used to say
"No database … a reading is not persisted at all", and
`docs/plans/2026-07-25-jmtarot-web-rewrite.md`'s decision table still says "Reading
history — Not stored". Both were correct before `PUBLIC_RELEASE_ROADMAP.md` D12
reversed them. Recorded rather than deleted, or someone reads the rewrite plan,
believes there is no database, and writes another `localStorage` accessor. Every
memory feature in roadmap §5 is a consequence of storing readings. `localStorage` is
now a cache of what the server knows; `todayKey()` stays and its comment is
load-bearing (see the `local_date` trap).

**Read `docs/plans/2026-07-25-jmtarot-web-rewrite.md` before starting work.** It
records every decision and why, including the ones that look arbitrary. Do not
relitigate its decision table without asking.

**`docs/workstream-notes.md` is the detailed record for every workstream** — the traps
that were paid for, how each bug was actually found, the live measurements, and the
internals of the verification harnesses. This file keeps the rules and the invariants; that
one keeps the evidence. Read the relevant section there before changing anything in the
files a workstream section names, and **add new traps there rather than here**, so this
file stays short enough to be worth loading every session.

**For public-release workstreams, read `PUBLIC_RELEASE_ROADMAP.md` then
`docs/plans/2026-07-26-RECONCILIATION.md`.** Precedence, highest first:
reconciliation → roadmap → workstream plan. Where a workstream plan disagrees with
the reconciliation, the plan is wrong; W1's `schema.ts` is built from
reconciliation §3.

This was an Expo/React Native iOS app until 2026-07-25; the full tree is on
`feat/ios`. If something reads like a leftover from that era, check that branch
before assuming it was a mistake. `backup/main-ios-2026-07-25` was deleted as
redundant — `feat/ios` (`7fe0249`) is an ancestor of `main`, so the whole iOS
history is reachable regardless; recreate with
`git branch backup/main-ios-2026-07-25 cfa9f29`.

## Moved from CLAUDE.md: Environment

#### Environment

**Node 24 lives at `~/tools/node-v24.18.0-linux-x64/bin` and must be prepended to
PATH for every npm/npx call** — the default `node` is 20.11.1 and too old. Check
`node -v` before assuming a build failure is a code problem.

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm install
npm run dev          # http://localhost:3001 -- 3000 is permanently taken, see Traps
npm run typecheck    # tsc --noEmit
npm test             # vitest, UNIT ONLY. No database. Keep it that way.
npm run build        # DO NOT SKIP -- see the TypeScript trap. Since 2026-07-28 this
                     # ALSO applies migrations, but only on Vercel: locally it skips
                     # and touches no database.
npm run smoke        # one live LLM call: is the key/baseURL/model right?
npm run smoke -- --all   # EIGHTEEN readings: 2 locales x 3 readers x 3 services
npm run smoke -- --all --locale en   # nine, one locale, for iterating
npm run smoke -- --lotus # one real Lotus distillation, end to end. READ IT.
npm run smoke -- --translate  # SIX real translations, both directions. READ THEM.
npm run smoke -- --persona    # one real persona PER LOCALE, whole. READ IT.
npm run smoke -- --persona --locale en   # one, for iterating
npm run smoke -- --all --lotus   # the nine WITH a canned Lotus block, fixed hands
npm run smoke -- --all --fixed   # the nine without one, same hands, for the diff
```

**Development** runs against Postgres in Docker; `db:up` must run before `npm run
dev` and is idempotent. **Production is Neon** (free plan, Singapore, Postgres 16 —
same major as the container on purpose); roadmap D5 resolved 2026-07-27,
`docs/DEPLOY-VERCEL.md` §6 is the procedure. Neon gives **two** connection strings:
the **pooled** one (`-pooler` in the host) is for Vercel only — migrations,
`db:studio` and `pg_dump` take the direct one.

```sh
npm run db:up        # docker compose; Postgres 16 on 127.0.0.1:5432, plus V9's
                     # redis + serverless-redis-http on 8079. Redis itself is
                     # UNPUBLISHED -- 6379 is taken, see Traps.
npm run db:migrate   # apply committed migrations; idempotent
npm run db:seed      # two dev users and two weeks of fake history
npm run db:studio    # drizzle-kit studio, to read the rows by eye
npm run db:down      # stop, keeping the volume
npm run db:nuke      # stop and DROP the volume; start over

npm run db:test:reset      # drop + recreate jmtarot_test
npm run test:integration   # needs db:up
npm run test:all           # both projects -- SEE THE WARNING BELOW
```

**`npm run test:all` FAILS ~12-22 OF V9's LIMITER TESTS; IT IS A HARNESS RACE, NOT A
REGRESSION. Run the two projects SEPARATELY for a true answer.** `npm test` passes
1197, `npm run test:integration` passes 137; together they fail a shifting subset of
`src/lib/ratelimit/index.test.ts` and `src/lib/llm/meter.test.ts`, one case timing
out at 5002ms — both projects share the one `serverless-redis-http` on 8079, so the
unit tests' in-memory assumptions collide with the integration suite's real Redis.
Measured at `4f29b4f` (pre-V2): 22 failures there against 12 with V2 on top, so it is
pre-existing and non-deterministic. Fix belongs with V9's files: a per-project Redis
namespace, or `--no-file-parallelism` across projects. Until then `test:all` is the
one command here whose red does not mean anything.

`npm test` deliberately does **not** need Docker and must not start to: it is the
loop used a hundred times a day, the integration one a few times a week. Verified by
stopping the container and running it.

Miftah is on Windows 11 + WSL2. No Mac, no iOS Simulator, no EAS/TestFlight/Apple
Developer account. Deployment is `git push` to Vercel.

##### Environment variables

`.env.example` has the shapes and generation commands. Copy to `.env.local`
(gitignored) for local work; set the same keys in the Vercel dashboard for production
**and** preview. `docs/DEPLOY-VERCEL.md` walks through a deployment from scratch.

```
LLM_PROVIDER=zai                              # or `anthropic`; same adapter
LLM_BASE_URL=https://api.z.ai/api/anthropic   # unset => api.anthropic.com
LLM_API_KEY=...
LLM_MODEL=glm-4.6
AUTH_SECRET=...                               # 32+ random bytes, base64
AUTH_USERS=[{"u":"...","h":"$2b$12$..."}]     # bcrypt hashes, cost 12

DATABASE_URL=postgres://jmtarot:jmtarot@127.0.0.1:5432/jmtarot
TEST_DATABASE_URL=postgres://jmtarot:jmtarot@127.0.0.1:5432/jmtarot_test
MIGRATE_DATABASE_URL=       # REQUIRED ON VERCEL, Production AND Preview, or
                            # `npm run build` FAILS BY DESIGN. Neon's DIRECT string,
                            # WITHOUT `-pooler`. DATABASE_URL stays POOLED: right for
                            # the runtime, wrong for DDL, because pgbouncer in
                            # transaction mode does not reliably carry a migration's
                            # session state. Locally unset; the script skips
                            # off-Vercel anyway.
FIELD_ENCRYPTION_KEY=...    # 32 bytes, base64url

LOTUS_MODEL=                # defaults to LLM_MODEL
TRANSLATION_MODEL=          # V2. Defaults to LLM_MODEL, and WANTS the reading model
                            # rather than a cheap one: a translation is prose a person
                            # reads, in a reader's voice.
LOTUS_STUB=                 # 1 => skip the model, write the template. NEVER in
                            # production: every user silently gets the fallback and
                            # nothing alerts on it.
PERSONA_MODEL=              # V8. Defaults to LLM_MODEL, and WANTS the reading model:
                            # a persona is prose about a person that V7 can make
                            # public. Same argument as TRANSLATION_MODEL.
PERSONA_STUB=               # 1 => skip the model, write the template. LOTUS_STUB's
                            # exact rule and exact reason.
PERSONA_MIN_AGE_SECONDS=3600 # The floor under regeneration, checked on the READ path
                            # ONLY. `personas.input_hash` covers the last ten reading
                            # ids so it moves after every draw; this bounds the model
                            # calls. IT MUST NEVER GUARD A USER-CAUSED REGENERATION --
                            # a facts edit and a cleared answer call generatePersona
                            # DIRECTLY, because a throttle inside the generator is W3's
                            # swallowed answer-edit bug. 3600 IS A GUESS.

LOCALE_SWITCHER=1           # W6. Render the language toggle. V4 MOVED IT (v0.3.0 R1):
                            # the account menu, plus the /login footer. Not the reader
                            # picker. Now a PROP resolved by the mounting server page,
                            # because a non-NEXT_PUBLIC_ var inlines as undefined in a
                            # client component. RENDERING ONLY -- English stays
                            # reachable by Accept-Language and cookie with it off.
                            # ONLY '0' disables, same rule as below.
                            # v0.4.0: THE SCOPE GREW AND THE VARIABLE DID NOT. It still
                            # decides only whether the CONTROL renders -- a third place
                            # now, `ContentLocaleLink` in the public footer. On a public
                            # content route English lives at `/en/...` regardless, and
                            # the `hreflang` set NAMES that URL to a crawler whatever
                            # the UI offers, so `LOCALE_SWITCHER=0` no longer hides
                            # English from anybody except a person looking for a button.
                            # That is the intended reading of "RENDERING ONLY", now
                            # load-bearing.

ANALYTICS_ENABLED=1         # ONLY '0' disables writes, so a typo collects data rather
                            # than silently collecting none.
ANALYTICS_DEBUG=            # 1 => log each event as buffered
ANALYTICS_STREAM_TIMEOUT_MS=45000
ANALYTICS_RETRY_BUDGET_MS=5000

UPSTASH_REDIS_REST_URL=       # V9. Both or neither. WITHOUT THEM THE LIMITER SILENTLY
UPSTASH_REDIS_REST_TOKEN=     # REVERTS to per-instance memory -- fine locally, not
                              # fine in prod. **UPSTASH HAS A SINGAPORE REGION AND THIS
                              # LINE SAID IT DOES NOT** -- it read "No Singapore region;
                              # use Tokyo", "verified 2026-07-27", and it was WRONG.
                              # Production's database is `ap-southeast-1` Singapore,
                              # Global tier (read from the Upstash console 2026-07-29).
                              # Use Singapore: it is the SAME region as the functions
                              # (`sin1`) and as Neon, so the hop is intra-region. Four
                              # other places repeated the false claim; all corrected.
RATELIMIT_BACKEND=            # `memory` forces local. The 2am kill switch. ONLY that
                              # exact string does anything -- the OPPOSITE defaulting
                              # rule to ANALYTICS_ENABLED, on purpose: a typo must not
                              # disable enforcement.
RATELIMIT_TIMEOUT_MS=1000     # bounds a hung fetch, not a target (~80-120ms).
RATELIMIT_GLOBAL_HOURLY=1200  # fleet-wide. 400 in v0.2.0 meant 400 PER INSTANCE.
RATELIMIT_EVENTS_BACKEND=     # `redis` moves /api/events off memory.
RATELIMIT_SESSION_BACKEND=    # `redis` moves the SESSION-UPDATE budget onto Upstash.
                              # LEAVE IT UNSET: memory for LATENCY, not cost --
                              # `refreshSession()` spends one hit() and POST /api/locale
                              # pays it on the request path of a language switch.
                              # **THE SECOND HALF OF THIS ARGUMENT HAS EXPIRED AND IS
                              # KEPT INVERTED:** it said "with no Upstash Singapore
                              # region that is a sin1->Tokyo hop between a DB write and
                              # a DB read". Upstash IS in Singapore, same region as the
                              # functions, so the hop is intra-region and small. The
                              # DECISION still stands on the first half -- a per-user
                              # budget lands mostly on one warm instance, so memory
                              # costs nothing real -- but it is now a smaller win than
                              # this comment claimed, and anybody who wants the session
                              # budget fleet-wide should MEASURE rather than read this.
                              # Its OWN variable,
                              # not the one above: `memoryOnly` used to test
                              # EVENTS_BACKEND first and return early, so one variable
                              # governed every memory-only budget.
LLM_WINDOW_CALL_CEILING=280   # MODEL CALLS per ROLLING 5 HOURS, not readings and not
                              # per day. THIS REPLACED THE SPEND CAP. 280 = Pro tier's
                              # ~400/5h x 70%.
LLM_WINDOW_CALL_SOFT=         # defaults to 70%. Above it, DEFERRED work is shed.

TEST_UPSTASH_REDIS_REST_URL=  # the local serverless-redis-http from
TEST_UPSTASH_REDIS_REST_TOKEN=# docker-compose.yml. Absent => that suite SKIPS.
```

`TEST_DATABASE_URL` is a separate variable, never an override of `DATABASE_URL`: the
integration suite `TRUNCATE`s, and both the harness and the global setup refuse any
value whose database name does not end in `_test`. Losing `FIELD_ENCRYPTION_KEY` does
not break the app — encrypted onboarding answers decrypt to `null` and read as
"skipped" — but the data is gone for good, and there is deliberately no re-encryption
path.

## Moved from CLAUDE.md: How to verify things here

#### How to verify things here

**There is no Playwright and there must not be.** The sentence that used to follow —
*"Chromium cannot launch in this WSL image — it needs `libasound2t64`, which needs
sudo"* — was a correct diagnosis with a wrong conclusion, and it stood for three
workstreams. `ldd` on the Chrome already in `~/.cache/puppeteer` names **exactly one**
missing library, and a `.deb` unpacks into a home directory with no privileges:

```sh
tools/e2e/setup.sh          # does this, idempotently, and verifies it
# apt-get download libasound2t64 && dpkg-deb -x *.deb ~/tools/chrome-libs
# LD_LIBRARY_PATH=~/tools/chrome-libs/usr/lib/x86_64-linux-gnu
```

So there are **six** loops, and loop 5 found the production sign-in outage of
2026-07-28. Still no Playwright, no Puppeteer at runtime, no new dependency:
`tools/e2e/chrome.mjs` speaks CDP over Node 24's global `WebSocket`. In increasing
cost:

1. **Vitest** for anything logic-shaped: deck maths, prompt assembly, question
   sanitization, session tokens, the rate limiter, `togglePick`, field encryption, the
   query-module contract. `npm test`, `--project unit`, no database.
2. **Vitest integration tests** for anything touching `src/lib/db/**`. Needs
   `npm run db:up`. Each test runs inside an always-rolled-back transaction — ~100×
   faster than truncating ten tables, and it composes with the handle-first query rule.
   `resetDb()` is the escape hatch for code that commits its own transaction. Name the
   file `*.integration.test.ts` or the unit project picks it up and fails without a
   database.
3. **Screenshots via Windows Chrome.** `tools/shot.sh <path> <w> <h> <out.png>` drives
   `/mnt/c/.../chrome.exe` headless against the WSL dev server. **Its ~500px clamp is a
   WINDOWS limitation, not a Chrome one** — Windows refuses to size a window below
   ~500px, so `--window-size=375` lays out at ~500 and merely crops. It looks like a
   phone screenshot and is not one. **Loop 5 has no such problem**; prefer it for
   anything narrow. `shot.sh` is kept as the fallback if `~/.cache/puppeteer` is ever
   cleared, since it needs nothing but a Windows install.
4. **Fixed-width containers plus `getBoundingClientRect`** for phone-width layout. For
   anything whose only input is its container's inline size — the fan — this is exact.
5. **A real Chrome in WSL, driven over CDP.** `tools/e2e/run.sh` — see
   `/test-prod-using-headless-chrome` and `.claude/skills/`. Launch, navigate, tap with
   real Input-domain events, screenshot at ~500px (**NOT the "true 390px" this line used to
   claim — MEASURED 2026-07-28, see below**), read the DOM, list requests
   with their POST bodies. It holds a **persistent Google session**, so a signed-in
   production flow can be exercised repeatedly. Point it at production, a preview, or
   `E2E_BASE=http://localhost:3001`. **The human authenticates and the harness never holds a
   credential** — no verb accepts a password, sign-in happens in a headed WSLg window
   somebody types into, and `whoami` prints the session cookie's length, never its
   value. The most expensive automatable loop: use it when the question needs a real
   session, real touch, or the deployed lambda.

   **IT DOES NOT GIVE YOU A PHONE WIDTH, AND THIS FILE AND `.claude/skills/` BOTH SAID
   IT DID.** `--width 390` becomes `--window-size=390,844`, and **measured 2026-07-28
   `innerWidth` and `outerWidth` are both 500** — so the shot is a ~500px layout cropped
   to look narrow, which is the exact failure the skill's own table attributes to
   *Windows* Chrome and claims not to apply here. The diagnosis in that table (no window
   manager, so 390 is honoured) is wrong for this profile; a saved window bound in
   `~/.cache/jmtarot-e2e-profile` is the likeliest cause and nobody has confirmed it.
   **So loop 5 answers "does the UI agree with what it sends" and NOT "does it fit a
   phone".** For width, use **loop 4** — it is exact for container-driven layout, and
   constraining the element under test plus reading `scrollWidth > clientWidth` measures
   overflow at 320/360/390 without needing a viewport at all. Found while checking the
   share sheet's two-link list; the screenshot looked like a phone and was not one.
6. **A real iPhone against a Vercel preview URL.** Still the only way to check
   `100dvh`, safe-area insets, real touch on glass, Add to Home Screen and standalone
   mode. **Loop 5 cannot substitute, and two live bugs prove it:** the iOS standalone
   sign-in risk is about two cookie jars and loop 5 has one, and the language switch's
   iPhone timeout could not be reproduced in WSL at all, because Docker Postgres never
   sleeps and a Neon compute does.

**Driving the real page without a WebDriver.** Two of the worst bugs here were
invisible to unit tests and screenshots: the page looked correct and the outgoing
request was wrong. The technique that caught them is a scratch HTML file under
`public/cards/` (a path the middleware matcher excludes) that plants a session cookie,
loads the app in a **same-origin iframe**, dispatches real `PointerEvent`s at the
cards, patches the iframe's `fetch` to log the request body, and diffs that body
against the rendered `alt` text. Reach for it whenever "does the UI agree with what it
sends?" is the question.

## Moved from CLAUDE.md: Traps

#### Traps

##### These three warnings from the iOS era are now obsolete

Recorded rather than deleted, because each looks like a bug someone will helpfully
"fix" back into existence.

1. **Fonts no longer need per-weight subpath imports.** Metro's
   `@expo-google-fonts/cinzel` index `require`d every weight and bundled 16 TTFs;
   `next/font/google` downloads at build time and self-hosts. The *principle*
   survives: list weights explicitly in `src/app/layout.tsx`, never a whole family.
2. **The card flip is ONE rotation, not two.** React Native has no
   `transform-style: preserve-3d`, so iOS rotated each face separately, 180° apart.
   `src/components/Fan.module.css` does one `rotateY` on a shared parent with
   `backface-visibility: hidden` on both faces.
3. **Interpolated hrefs are correct now.** `router.push('/' + id)` failed under
   expo-router because `typedRoutes` validated the route pattern, not the resolved
   path. ``<Link href={`/${reader.id}`}>`` is right in Next.

##### These will bite you

- **A COMMITTED MIGRATION THAT NOBODY APPLIED TOOK PRODUCTION DOWN, AND THE APP
  LOOKED PERFECTLY HEALTHY WHILE IT DID** (2026-07-28, the worst outage this project
  has had). `0001_v2-translations-and-locale-source` was applied locally and never to
  Neon — `drizzle.__drizzle_migrations` held only `0000_baseline`:

  ```
  GET /api/auth/callback/google   error
  sign-in upsert failed; refusing the session
    [cause]: column "locale_source" of relation "users" does not exist
    code: '42703'
  ```

  `upsertUserOnSignIn` threw, `auth.ts`'s catch returned `null`, no session cookie was
  minted, the gate bounced the querent to `/login` — and **Google's consent screen
  succeeded every time**, so the OAuth round trip looked correct and the app was simply
  impossible to sign in to. **The same column killed the language switch** because
  `setUserLocale` writes `localeSource`: ONE unapplied migration presenting as TWO
  unrelated-looking bugs, neither naming a migration.

  **The class of failure: code and schema shipped on different rails.** `npm run build`
  now runs `scripts/db-migrate-deploy.ts` FIRST and **fails the build** rather than
  skipping when it cannot run (same defaulting argument as `ANALYTICS_ENABLED`). It
  needs `MIGRATE_DATABASE_URL`, refuses a `-pooler` host, and skips on a non-Vercel
  build. The guard is `VERCEL`, not `NODE_ENV`, for the reason `db/client.ts` gives.
  **Two things this does NOT fix:** concurrent builds could both apply the same
  migration (drizzle takes no advisory lock; not worth a lock table for one developer),
  and a *destructive* migration still deploys ahead of the code that tolerates it.

- **FRAMEWORK BEHAVIOUR IS MEASURED HERE, NEVER RECALLED. TWO AGENTS PRODUCED TWO
  CONFIDENT, MUTUALLY EXCLUSIVE, BOTH-WRONG ANSWERS ABOUT THE SAME FOUR LINES.**
  S1 asked to carve JSON-LD out of the "no `dangerouslySetInnerHTML`" rule, claiming
  React HTML-escapes a `<script>` text child so every `"` becomes `&quot;`; S6
  independently claimed the opposite mechanism, that `&` is doubled. **Neither failure
  mode exists.** On react-dom 19.2.8 a plain text child of `<script>` round-trips
  through `JSON.parse` intact — `&` stays literal, `"` stays `\"`, and React applies
  *script-aware* escaping to `</script` instead. Nobody ran the measurement before
  arguing. `JsonLd.tsx` therefore uses a plain child and `serializeJsonLd` pre-escapes
  `& < >` anyway — **not for correctness, but because that behaviour is an unspecified
  implementation detail and a release must not depend on one.** The test renders the
  component and parses the result, so it fails on both predicted failures *and* on a
  future React that starts escaping. Same rule `docs/provider-comparison.md` learned
  the hard way about its own numbers.

- **THE SEARCH CONSOLE HTML-FILE METHOD IS 302'd BY THE MIDDLEWARE MATCHER, AND THE
  ERROR NAMES THE WRONG CAUSE.** It wants `public/google<token>.html` served at
  `/google<token>.html`; the matcher
  `'/((?!_next/|cards/|dukuns/|favicon|icon|apple-icon|manifest|sitemap|robots).*)'`
  **matches that path**, `isPublic()` does not name it, and Googlebot carries no
  cookie — so it is sent to `/login`. Verification fails saying the file was not
  found, and the file is right there in `public/`. Use a **DNS TXT Domain property**
  instead (`docs/DEPLOY-VERCEL.md` §7b): it also covers the apex, which
  308-redirects to `www` and which a URL-prefix property would leave unverified.

- **`middleware.ts` must be at `src/middleware.ts`**, not the repo root, because the
  app lives under `src/`. At the root it is silently never executed and every route is
  open.

- **Escape `$` as `\$` in `.env` files.** Next expands `$VAR`, so a raw bcrypt hash
  loses `$2b`/`$12`; the symptom is a 500 about malformed `AUTH_USERS` on a hash that
  parses perfectly when you read the file. **Do NOT escape in the Vercel dashboard** —
  values there are literal. Same trap reaches `DATABASE_URL`, where `@ : / ?`
  additionally need percent-encoding. The dev password is alphanumeric so it never
  arises locally.

- **The rate limiter's fallback is silent to the user and loud only in one event.**
  When Upstash is unreachable every budget falls back to per-instance memory — never to
  unlimited, never to a refusal — so the app looks healthy while every stated limit is
  multiplied by the number of warm instances. `ratelimit.backend_degraded` and query 9
  are the only way to see it; a steady non-zero `degraded_minutes` means the fleet-wide
  limiter is not fleet-wide. **Never setting `UPSTASH_REDIS_REST_URL` in production**
  is the likelier way to end up there.

- **BOTH UPSTASH SDK DEFAULTS ARE WRONG FOR THIS APP, AND BOTH ARE WRONG BY BEING
  ABSENT.** `@upstash/ratelimit`'s **`timeout` defaults to ON at 5s and FAILS OPEN TO
  UNLIMITED** (`this.timeout = config.timeout ?? 5e3`; on expiry it resolves
  `{ success: true, reason: 'timeout' }` — a pass that never reached Redis). Hence
  `timeout: 0` in `redis.ts`, plus `_toResult` independently throwing on
  `reason: 'timeout'` so reinstating it degrades to memory rather than passing.
  `@upstash/redis`'s **`retry` defaults to five attempts with `Math.exp(n) * 50`
  backoff** — ~4.3s — while `ratelimit/index.ts` says this layer does not retry.
  MEASURED: with the default, an unreachable Upstash reported `reason: 'timeout'` and
  burned the whole `RATELIMIT_TIMEOUT_MS` on EVERY request; with `retry: false` the same
  failure surfaces as `reason: 'error'` immediately. Found by pointing the URL at a
  closed port.

- **THE 429's `retry-after` FROM THE CEILING IS NOT THE WINDOW LENGTH.** Measured live
  at **291 seconds** on a tripped ceiling, not five hours: `@upstash/ratelimit`'s
  sliding window reports `reset` as the start of the next sub-window, so the value is
  anywhere in (0, window]. The memory backend, which knows the oldest timestamp, gives
  the true figure. Both are honest and neither is ever zero, which is the property that
  matters. Do not "fix" it to a hardcoded window length.

- **`llm:window` IS A ROLLING FIVE HOURS, AND IT IS THE ONE COUNTER IN THIS APP THAT IS
  NOT THE QUERENT'S CALENDAR DAY.** A provider quota is not a day: z.ai meters prompts
  per rolling 5-hour cycle, so a daily bucket would never fire before the provider's own
  limit, because a script burns the cycle in five minutes while a daily counter still
  reads 400/4000. There is deliberately **no date in the key**, so no UTC-versus-local
  question to get wrong. `meter.test.ts` asserts the window slides.

- **A ROUTE THAT IS 22ms WARM CAN BE KILLED AT TEN SECONDS COLD, AND ON THIS STACK THAT
  IS THREE ROUND TRIPS AND A DATABASE WAKE.** `POST /api/locale` was reported as hanging
  in production and diagnosed as an LLM call blocking the switch — nothing on that path
  reaches a model. It was **the only database-writing route declaring neither `runtime`
  nor `maxDuration`**, and Vercel's Hobby default is ten seconds.

  Functions are Hobby in `sin1`, Neon free-plan in `ap-southeast-1`, **Upstash in
  `ap-southeast-1` Singapore too — this line said Tokyo and was wrong** (console, 2026-07-29). A
  free-plan Neon compute **suspends when idle**, so the first switch after a quiet spell
  is: a cold lambda whose graph includes @auth/core, postgres.js and — via `auth.ts` →
  `users.ts` — bcrypt; then `setUserLocale`, possibly the request that WAKES the
  compute, on a `max: 1` connection; then `refreshSession()`, one intra-region Upstash
  hop (this used to say `sin1`→Tokyo) and THEN a second query to that compute. Truncated at ten seconds the write is lost, no
  response arrives, and the querent is looking at a dead control.

  **The lesson generalises: a user action that WRITES is one of the few things likely to
  be the request that wakes a suspended compute**, so measure those cold. Warm here was
  22ms and hid all of it.

  **A BIGGER `maxDuration` IS NOT A LATENCY REGRESSION — it stops the cold path being
  truncated — BUT IT MUST BE PAIRED WITH A BOUND ON THE CLIENT**, or you have only made
  the hang longer. `LocaleSwitch` bounds its own request at six seconds and re-arms
  regardless; the lambda runs to its own budget, so the write still lands. Upstash is
  largely exonerated: `timeout: 0` and `retry: false` cost one RTT, not seconds.

  **TWO MORE THINGS LANDED 2026-07-28, AFTER THE SWITCH WAS REPORTED DEAD ON iPHONE
  SAFARI WHILE FINE ON A DESKTOP.** First, **the chain is now TWO round trips, not
  three** — `session-update:` moved to memory, deleting the Tokyo hop from between the
  write and the read. That budget only ever stopped one authenticated user spamming
  `POST /api/auth/session`, and one user's requests land mostly on one warm instance, so
  per-instance costs nothing real — unlike `global` or `llm:window`, which are
  meaningless per-instance. `RATELIMIT_SESSION_BACKEND` moves it back.

  Second, **"the write still lands" was NOT good enough, and the querent's own
  description was the diagnosis**: *"it only takes effect after we change to another
  page"* — exactly what the old catch did, treating a timeout identically to a refusal.
  **A timeout is the one outcome that means UNKNOWN**, so it is now the only one retried
  — once, with the marker KEPT, while `!response.ok` and offline still revert because
  those are answers. The retry is cheap because whatever was cold is warm by the time
  the first attempt gives up. `localeSwitch.test.ts` fences it, negative-controlled.

  **THE MEASUREMENT LESSON: 1348ms warm from WSL told us nothing.** A desktop on a LAN
  against a warm lambda cannot see this class of bug, and neither can Docker Postgres.
  **A phone is the instrument for anything on the cold path.**

- **Port 6379 is permanently occupied by another project's `chatbot-redis` container**,
  bound to `0.0.0.0`, like Grafana on 3000. This project's `docker-compose.yml`
  therefore does **not** publish its Redis port — `serverless-redis-http` reaches it over
  the compose network by service name and the integration suite only talks to SRH on
  8079. Publishing fails with "port is already allocated". SRH also rejects any request
  without `Content-Type: application/json`, which the `db:up` readiness probe found the
  hard way.

- **The native `postgresql-16` on this machine is on port 5433, has no `miftah` role,
  and its `pg_hba.conf` is root-only.** This project uses Docker on 5432. Do not
  "helpfully" point `DATABASE_URL` at 5433.

- **Port 3000 is permanently occupied by another project's Grafana container**, so
  `npm run dev` lands on 3001 — not cosmetic, because Google OAuth redirect URIs are
  exact-match strings, so `AUTH_URL` is `http://localhost:3001`.

- **AAAA lookups hang for 4-12s in this WSL image, which is why every npm script that
  touches the network sets `RES_OPTIONS=no-aaaa`.** The WSL DNS proxy at
  `10.255.255.254` answers A in 0.01s and never answers AAAA, so glibc waits out
  `timeout:5 attempts:2`. `dns.lookup` asks for both families, so **every cold outbound
  connection pays it**:

  ```
  getent ahostsv4 www.googleapis.com   0.01s
  getent ahostsv6 www.googleapis.com  10.02s
  ```

  It broke Google sign-in: the OAuth callback makes three outbound calls (discovery,
  token exchange, JWKS from `www.googleapis.com`), undici's connect timeout is 10s, so
  it died with `UND_ERR_CONNECT_TIMEOUT` while the network was fine. The symptom is
  `?error=Configuration` and `fetch failed` in the log, which reads exactly like a bad
  client secret. **Do not diagnose this by retrying** — Node caches a resolution once it
  lands, so the second attempt in a session is fast and the first after any restart is
  not. Measure: `curl -w 'dns=%{time_namelookup} tcp=%{time_connect}'` splits DNS from
  TCP, `getent ahostsv4` vs `ahostsv6` names the family.

  **`npm run build` is intermittently a victim too**, and it looks like a code failure:
  `Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'`,
  36 errors, preceded by 12 warnings about `fonts.gstatic.com`. That is `next/font`
  failing to download — Turbopack fetches fonts from its Rust side, which does **not**
  honour `RES_OPTIONS`. **Retry the build**; the font cache populates incrementally and
  the second run has always succeeded.

  `RES_OPTIONS=no-aaaa` is read by glibc directly, needs no sudo, and takes the JWKS
  fetch from 8483ms to 112ms. `--dns-result-order=ipv4first` does **not** work: it
  reorders results but still issues the AAAA query. IPv6 egress is separately broken
  here (`curl -6` fails in 25ms). The permanent fix is a real resolver —
  `generateResolvConf = false` in `/etc/wsl.conf` plus `nameserver 1.1.1.1` in
  `/etc/resolv.conf`, needing sudo and a `wsl --shutdown`.

- **`docker exec … pg_isready` races initdb.** During bootstrap the container runs a
  temporary server that reports ready and then shuts down, listening on the **unix
  socket only** — so a TCP probe cannot see it and cannot race it. The symptom of
  getting it wrong is `FATAL: the database system is shutting down` from the very next
  command. `db:up` probes over TCP.

- **`drizzle-kit` does not load `.env.local`.** It is not Next. `DATABASE_URL is
  undefined`, from a variable plainly set for `npm run dev`, is always this.
  `drizzle.config.ts` and every script under `scripts/` call dotenv's `config()`
  explicitly at `.env.local`.

- **`drizzle-kit push` is banned**; only `generate` + `migrate`. It applies a schema
  diff without writing a migration file, silently desynchronizing committed history from
  every other machine. Full rules, including the `meta/_journal.json` conflict that will
  happen, in `src/lib/db/migrations/README.md`.

- **`local_date` and `birth_date` are `string`, not `Date`**, for the reason in
  `todayKey()`'s comment: `local_date` is the *querent's* calendar day, sent by the
  client, and a `Date` renders in the server's zone and is a day out for anyone in
  Jakarta between midnight and 07:00. An integration test fails if anyone "fixes" the
  column to `mode: 'date'`.

- **Drizzle's `$onUpdate()` does not fire inside `onConflictDoUpdate`** — it applies to
  `db.update()` only. Every upsert in `src/lib/db/queries/**` sets `updatedAt` by hand;
  drop that line and the column silently freezes at the first insert. For
  `daily_summaries` that is the column the regeneration throttle compares against.

- **`track()` returns `void` and must never be awaited.** Import from
  `@/lib/analytics/track` on the server and `@/lib/analytics/track.client` in a client
  component — never the first from the second, which drags `node:async_hooks` and
  `next/server` into the browser bundle and fails the build. Both share one `TrackFn`
  type so only the import line differs. The `void` return is the enforcement: a function
  that cannot be usefully awaited does not acquire an `await` at 11pm.

- **No free text in `events.props`, ever.** `question.typed` and
  `onboarding.question_answered` carry a `length`. `events` rows SURVIVE account erasure
  with `user_id` nulled, and that is only honest because `sanitizeProps()` provably
  strips everything identifying: it drops non-scalars, truncates strings to 120
  characters, caps at 24 keys, and rejects `__proto__`, `constructor` and `prototype` by
  name — the last two are ordinary lowercase words that pass a `lower_snake` pattern.

- **Never log a driver error from any path that runs a query.** A postgres error quotes
  the failing statement *and its bound parameters*, and `readings.question` is one of
  them — so `console.error('...', err)` in `flush.ts` puts the querent's typed question
  into the platform log. Production logs ids, attempt, SQLSTATE and the error's class;
  development prints the whole thing, because there is nobody to leak it to. The same
  rule binds `moderation/log.ts`, `auth.ts` (see the fifth Auth trap) and V2's translate
  path. Found by running the database-down check, not by reading the code.

- **Snapshot mutable state BEFORE an `await`, in `tee.ts` especially.** Its `finish()`
  built the outcome object around `await source.usage`, so fields were read after the
  await — by which time a cancelled controller had made the next `enqueue` throw and the
  catch had overwritten `errorKind` with `'unknown'`. Every abandoned reading was
  recorded as failing for an unknown reason. The cancel test asserts `errorKind` and not
  only `status` precisely because that is what caught it.

- **Scripts under `scripts/` cannot use top-level `await`.** No `"type": "module"`, so
  tsx transforms to CJS. Wrap in `async function main()` and `main().catch(...)`, as
  `scripts/smoke-llm.ts` does.

- **Never import `@/lib/db/client` from a script or a test.** It starts with
  `import 'server-only'`, which throws outside a Next server bundle. Scripts build their
  own postgres.js client; tests use `src/lib/db/testing/harness.ts`, which reads
  `TEST_DATABASE_URL`. Every module under `src/lib/db/queries/**` takes its handle first
  precisely so neither needs the singleton.

- **TypeScript must stay on 5.x.** `npm install typescript` resolves to 7.x, the native
  port, which ships no full compiler JS API. `npm run typecheck` works on it;
  `npm run build` dies with "The id argument must be of type string" after claiming
  TypeScript is not installed. Run `npm run build` before believing a green typecheck.

- **Never shuffle in a `useState` initialiser.** `shuffleDeck()` is impure, so it runs
  once on the server and again on the client and produces two decks. React cannot patch
  attribute mismatches during hydration, so the DOM keeps the server's cards while state
  holds the client's — the querent sees one spread and is read a different one, with
  nothing on screen looking wrong. `src/app/[reader]/[service]/Draw.tsx` starts in fixed
  order and shuffles in an effect.

- **No side effects inside a `setState` updater.** StrictMode double-invokes updaters,
  so an `onToggle` called from inside one fires twice and cancels itself out. The fan was
  completely dead in development and would have worked in production. Read the drag from
  a ref instead.

- **SAFARI DOES NOT FOCUS A `<button>` WHEN IT IS CLICKED OR TAPPED**, so
  `const opener = document.activeElement` on the way into a dialog captures `<body>` on
  the one platform this app is built for. Only text inputs take focus from a pointer
  there; Chrome and Firefox focus buttons, which is why it looks correct in every WSL
  loop. Restoring focus to that "opener" drops the querent at the top of the document.
  `AccountMenu` takes the opener as a **prop** (`returnFocusTo`, a ref owned by
  `AccountButton`). **`CardDetail` still has the latent version** — same idiom, smaller
  consequence, because its opener is a card in a long list. Found because
  `_accountshot.html` dispatches synthetic `PointerEvent`s, which do not focus their
  target either.

- **`container-type` does not make an element its own container.** `cqw` in the
  declarations of the element that *declares* it resolves against the nearest
  **ancestor** container. `CardBack` is split into `.back` (declares the container,
  paints nothing) and `.plate` (a descendant, so its `cqw` means what it says).

- **`StyleSheet.absoluteFillObject` and all React Native APIs are gone.** If you see one,
  it came from `feat/ios`.

## Moved from CLAUDE.md: Providers

#### Providers

Two adapters, one interface, and the second is **insurance rather than a preference**.
`LLM_PROVIDER=zai|anthropic` uses `anthropic.ts` (one wire format, two services);
`openai` uses `openai.ts`. Switching is that variable plus `LLM_MODEL`, nothing else.

**THE EMERGENCY FALLBACK IS `gemini-3.5-flash-lite`, AND IT IS FOUR ENV VARS WITH NO
BASE URL:** `LLM_PROVIDER=gemini`, `LLM_API_KEY=<Google key>`,
`LLM_MODEL=gemini-3.5-flash-lite`, `MODERATION_MODEL=gemini-3.5-flash-lite`. `gemini` is
the OpenAI adapter pointed at Google's OpenAI-compatible endpoint — no third adapter
exists. It is a NAMED provider rather than `openai` plus a base URL because this is the
failover path, and forgetting the base URL would send a Google key to OpenAI and 401 in
a way that reads like a bad key.

**USE THE PAID TIER. That is a privacy requirement, not a quota one.** Google marks
free-tier content as used to improve its products; paid tier is excluded. Every request
carries the querent's typed question — including the ones routed to the self-harm
classifier — so the free tier contradicts `/privacy` directly.

**Two Gemini caveats are open (`docs/provider-comparison.md` §§14–16):** it produced one
Malay word the eleven-word grep structurally cannot catch (`memulakannya` — a
*morphological* `me-…-kan` leak, not a lexical one), and it streams in ~6 chunks against
z.ai's 173, which nobody has judged on a real phone.

**THE RUNG BELOW IS `gpt-5.6-luna`, and it takes a fifth variable:**
`OPENAI_REASONING_EFFORT=none`. Without it, roughly **two readings in nine come back
completely blank** — reasoning tokens come out of the same budget as the prose,
`MAX_TOKENS` here is 350–650, and **nothing reports it**, because the stream closes
normally: the route records a completed reading, analytics records a success, no
`[Bacaan terputus...]` fires, and the querent gets an empty page. It also 400s the
classifier, because `temperature: 0` is rejected while reasoning is on — a reasoning-MODE
restriction, not a model one (effort absent → 400, `low` → 400, `none` → 200).
**`openai.ts` REFUSES TO START on a `gpt-5`/`gpt-6`/`o`-series model with that variable
unset**; any explicit value satisfies it, including `low` — the rule is "you must have
decided". Deliberately NOT required for Gemini, measured with no thinking overhead at
these ceilings.

**`docs/provider-comparison.md` has the measurements. TWO OF ITS OWN MEASUREMENTS WERE
WRONG, WHICH IS WORTH KNOWING BEFORE YOU QUOTE IT.** `jaccard()` in `smoke-llm.ts` is a
bare set metric with no length normalisation, so it **rewards a model for writing less**
— controlling for length moved every ranking. And z.ai's famous `0.050` is a single
favourable measurement: re-run in the same session it scored **0.068**. Three rounds of
evaluation treated it as a threshold; it was a datapoint. Compare at matched length or
not at all.

Read it before changing `LLM_PROVIDER`: three numbers elsewhere in this file are z.ai
facts rather than general ones and would need re-deriving — `MODERATION_TIMEOUT_MS`
(z.ai's classifier p95), `LLM_WINDOW_CALL_CEILING` (a 5-hour prompt quota OpenAI does not
have), and DEPLOY-VERCEL §2b's claim that no spend cap is possible (**an OpenAI project
takes a hard budget cap, so that premise flips back the moment the provider does**).

**`LLM_BASE_URL` IS ANTHROPIC-ONLY.** The OpenAI adapter reads `OPENAI_BASE_URL`;
pointing the first at OpenAI silently does nothing. `npm run smoke` and
`npm run probe:moderation` USED to print `baseURL=api.anthropic.com` while talking to
somewhere else entirely — through a whole Gemini evaluation — and both now resolve the
variable the adapter will actually read.

## Moved from CLAUDE.md: The prompt

#### The prompt

Three layers in `src/lib/prompt/`, assembled by `build.ts`, **each forked per locale
behind a facade** since W6: `base.ts` -> `base.{id,en}.ts` (format, language, safety),
`readers.ts` -> `readers.{id,en}.ts` (persona), `services.ts` -> `services.{id,en}.ts`
(the task). Each facade holds a `Record<Locale, …>`, so forgetting a locale is a compile
error rather than `undefined` handed to a model — which does not throw and returns a
fluent reading generated with no contract at all. The persona blocks each carry **one
worked example paragraph**, which does more work than the description: a model told
"casual and warm" writes generic warmth; a model shown a paragraph of Adrian writes
Adrian. **If the three readers ever stop being distinguishable with the names covered,
fix those paragraphs, not the code** — run `npm run smoke -- --all` and read the
eighteen; the script covers the names for you.

The querent's question goes in the **user turn only**, inside `<pertanyaan>` delimiters,
never in the system prompt. Verified against a real injection attempt; the base
contract's last rule held.

**Length is controlled per paragraph, not per reading.** The three-card task asked for
four paragraphs of 3–5 sentences and came back at ~330 words. A whole-reading word budget
did not fix it: Margaret's persona mandates long subordinated sentences, and she ran
238–298 words against a stated 140–180 while Adrian obeyed at 128. A ceiling the model
can count as it writes — 2–3 sentences **and** at most 40 words per paragraph — landed all
three at 128–169. Two side effects: compression pressure made Thessaly stop naming the
cards, which is why the task now says so explicitly, and `MAX_TOKENS.spread3` came down
from 1100 to 650 (still roughly double the length, because that ceiling is a runaway
guard, not the length control).

**That 40 is no longer one number.** W6 moved every word ceiling into `LENGTH_BUDGET` in
`src/lib/prompt/budget.ts`, interpolated into the prompt and asserted by the smoke script
so the two cannot drift; `daily` and `yesno` gained ceilings they never had (a sentence
count does not bind); and Margaret carries a per-reader multiplier. **VD19 is Miftah's
ruling: Margaret may be 30% longer**, as `MARGARET_MULTIPLIER = 1.3` on every
reader-voiced ceiling rather than a hand-set number on one service — spread3 55→52, daily
55→72, yesno 70→91, day summary 50→65. See `## Mystical memory verdicts (V3)`.

## Moved from CLAUDE.md: Localization (W6)

#### Localization (W6)

Two locales, `id` and `en`, **interface and readings**. `id` is the default and the
source language.

**Locale is never a URL segment FOR THE NINE APP ROUTES (D6) — and IS one for public
content (v0.4.0 S-D1).** This sentence used to end at "never a URL segment", full stop,
and the exception is an **amendment rather than an oversight**: two languages cannot
occupy one address in a search index. `/gallery` is Indonesian, `/en/gallery` is
English, and inside the app `router.push('/en/...')` is still wrong and no `<Link>` is
locale-aware. `/en/history` is not a route — it reaches `decide()` spelled exactly as
the request spelled it and matches nothing. **A stripping bug that made the gated app
reachable under `/en/` is the worst outcome available in this release and would look
like a working feature.**

**v0.4.0 BREACHES D6 FOR FIVE PUBLIC CONTENT ROUTES AND NOTHING ELSE (S-D1).** The nine
app routes are untouched and `router.push('/en/...')` is still wrong in every one of
them. The prefix is a middleware **rewrite**, not a route segment, so there is still one
route tree. `src/lib/i18n/prefix.ts` is the pure leaf that owns the prefix maths *and*
the content route table — it lives there rather than in `resolve.ts` because `gate.ts`
imports it and `resolve.ts` carries a `next/server` type (R11).

**On a content route the URL is the only input, and the switcher is a LINK.**
`contentRewrite()` runs in middleware before the D6 chain and before the gate (contract
G1), pins the locale into `x-jmt-locale`, and writes **no cookie** (S-D10). So a cookie,
an `Accept-Language` and `?lang=` are all inert there — measured, in every `NODE_ENV` —
and `ContentLocaleLink` is a server-rendered `<a href>` to the sibling URL rather than a
`POST /api/locale`. `LocaleSwitch` is for the app and must not grow a `links` variant
(R12). The evidence, the traps and the wire measurements are in
`docs/workstream-notes.md`'s `## Locale-addressable public content (S2), v0.4.0`.

```
src/lib/i18n/
  locale.ts        LEAF. Locale (re-exported from @/data/types), LOCALES, isLocale,
                   Localized<T>, intlTag, negotiate. No React, no next/*, no catalog --
                   the edge middleware and db/schema.ts both import it.
  locales/id.ts    THE SOURCE CATALOG. Defines the key set. 268 keys, 15.8KB as
                   shipped JSON. (It said 118 for two releases. MEASURED.)
  locales/en.ts    typed FROM id.ts, so a missing key is a red typecheck.
  format.ts        makeT, the {param} derivation, formatDate, formatLocalDate.
                   NO runtime catalog import.
  catalog.ts       the ONLY module that loads both catalogs. catalogFor, tFor.
  resolve.ts       EDGE-SAFE. resolveForMiddleware, cookie/header names,
                   localeSwitcherEnabled. NO `server-only`.
  prefix.ts        LEAF, EDGE-SAFE, v0.4.0 S2. stripLocalePrefix, localePath,
                   isContentPath, isPublicContentPath, contentRewrite, and the
                   content route table. NO `server-only`, NO `next/*` (gate.ts
                   imports it), NO `process.env`.
  t.ts             SERVER-ONLY. getLocale (React cache()d), getT, getLocaleBundle.
  LocaleProvider.tsx  'use client'. useT, useLocale.
```

**Use `t()`.** Server components `const t = await getT()`; client components
`const t = useT()`; route handlers and anything outside a render `tFor(locale)`. The
call site is identical everywhere: `t('draw.reset')`.

Resolution, once, in middleware: **session `loc` claim → `jmt_locale` cookie →
`Accept-Language` → `id`**, forwarded to server components as `x-jmt-locale`.
`?lang=en` overrides everything but **only when `NODE_ENV !== 'production'`**.

##### The five things a future session will otherwise undo

1. **Card names stay English in both locales**, as do reader names and titles, numerals,
   glyphs, the enum values (`stage`, `polarity`, `element`, `yesno`), the `<pertanyaan>`
   tag, and every id and slug. See `## Card data`.
2. **`id.ts` owns the key set and a red typecheck is the feature.** Write the Indonesian
   first; TS2739 names every missing English string. Do not add a cross-locale fallback —
   an unknown key returns THE KEY, on purpose (I3), because `reading.error.start` on
   screen is a bug report and an Indonesian sentence in the English app is a bug that
   ships.
3. **The English worked examples are REWRITTEN, not translated, and each uses a different
   card from its Indonesian counterpart on purpose.** Indonesian: The Tower, The Hermit,
   The Lovers reversed. English: The Hierophant, The High Priestess, The Devil reversed.
   That is an enforcement mechanism — if a future English example is about The Tower and a
   job, it was translated, and a reviewer can see it in five seconds. A test asserts it.
4. **The Malay grep is `id`-only**; the English half has its own tic list. Running the
   Malay words against English is theatre.
5. **The root layout is dynamic and that is correct.** It awaits `getLocale()` for
   `<html lang>`, so every route builds as ƒ. Do not "fix" it back to a static `lang="id"`
   patched on the client: that ships the wrong language to a screen reader on first paint
   and to the SSR'd markup. The build output flipping ● → ƒ is the symptom of it working.

**The traps W6 paid for — `?lang=` reaching only the request that carries it, `await getLocale()` vs `user.locale`, the write-before-`refreshSession()` ordering, the `router.refresh()` dependency-array bug, `Localized<>` in a template literal, `Intl.PluralRules`, the `server-only` alias, and the catalog client fence — are in `docs/workstream-notes.md`. Read them before touching the switcher or a fetching client component.

##### Verifying it

```sh
npm run smoke -- --all              # EIGHTEEN readings, both locales
npm run smoke -- --all --locale en  # nine, for iterating
npm test -- i18n                    # catalogs, format, resolve, length budget
```

`npm run smoke -- --all` ends with a **blind read**: three readings per locale, names
covered, shuffled, key after forty blank lines. Actually guess. If you cannot get three of
three, fix the persona paragraphs.

Three voice proxies print every run and FAIL loudly: each reader's own forbidden vocabulary
against their own output, mean sentence length (Margaret must stay 1.5× Thessaly), and
contraction rate (`en` only — Adrian > 0, Margaret == 0). Measured 2026-07-27: `id`
10.2/19.1/13.8, `en` 14.5/23.9/13.4, contractions 0.66/0.00/7.85.

`public/cards/_slotfit.html` measures the slot row at 320/360/375/390 in both locales.
**English fits BETTER than Indonesian here** — every English label is one or two lines;
`Yang sedang berjalan` and `Yang menanti di depan` take three at all four widths, which
shipped and is pre-existing. `public/cards/_enshot.html` is for looking, at a real 390px.

**`LENGTH_BUDGET` in `src/lib/prompt/budget.ts` is the one place a word ceiling is
written**, interpolated into the prompt and asserted by the smoke script.
`budgetFor(locale, service, reader)` applies **`MARGARET_MULTIPLIER`** — 1.3 on every
reader-voiced ceiling, because her voice rules mandate long subordinated sentences that do
not fit 40 words. **The English `spread3` calibration is NOT converged**: she has come in
at 157–243 words across runs, and widening the band further would be chasing variance. The
frequency verdict is house voice and is unaffected.

## Moved from CLAUDE.md: Auth

#### Auth

W2 is done. Google sign-in, JWT sessions, no database read on the request path.

```
src/lib/auth/
  gate.ts      PURE. The routing decision. No next-auth, no next/server, no DB.
  ttl.ts       PURE. Env -> seconds, defensively. The two expiries.
  token.ts     PURE. The claim shape and its runtime narrowing.
  config.ts    EDGE-SAFE. The shared NextAuthConfig. NEVER imports @/lib/db.
  auth.ts      NODE-ONLY. NextAuth(config + the DB-touching callbacks).
  server.ts    NODE-ONLY. currentUser(), requireUser(). What everything imports.
  viewer.tsx   'use client'. The context, mounted by the OWNING SERVER PAGE.
  users.ts     DEV-ONLY. bcrypt list, fuel for the Credentials provider.
```

**Everything that needs "who is this, on the server" calls `requireUser()` in a route
handler or `currentUser()` in a server component. Nothing else.** Do not call `auth()`
directly and do not read the cookie — `requireUser()` requires completed onboarding by
default and returns `hit()`'s `{ ok }` shape so the two guards at the top of a handler read
alike. `user.id` is `users.id` and is the only key anything joins on.

`src/lib/auth/session.ts` and its test are **deleted** (R13): with Auth.js owning sessions,
nothing called the jose helpers, and a function named `verifySession` here would send
someone to the wrong file at the worst moment. `/api/auth/login` and `/logout` are deleted
too.

Sessions are a **24-hour sliding idle timeout** (`SESSION_TTL_HOURS`) with a **30-day hard
cap** (`SESSION_ABSOLUTE_TTL_DAYS`). There is no server-side revocation and there cannot be
on the JWT path — the cap is the only thing bounding a stolen cookie, and rotating
`AUTH_SECRET` is the only kill switch, which signs out everybody.

##### The four traps W2 paid for

Each produced a working-looking app and cost real time.

- **`token.sub` is NOT the provider's `sub`. Read `account.providerAccountId`.**
  @auth/core deliberately overwrites `user.id` — and therefore `token.sub` — with a fresh
  `crypto.randomUUID()` on every sign-in (`lib/actions/callback/oauth/callback.js:218`, with
  a comment saying to use the account instead). Using `token.sub` as `google_sub` means the
  upsert's conflict target never matches, so **every sign-in inserts a new row** — no error,
  just two rows with one email and memory features reading an empty history forever.
  `readExternalSub()` is the only way to get it, and it refuses a uuid-shaped value because
  @auth/core uses the same random fallback for `providerAccountId`.
- **The two NextAuth instances must agree about what a session contains.** Middleware builds
  one from `authConfig` alone; `auth.ts` builds another from `authConfig` plus DB callbacks,
  so a **pure** callback living only in `auth.ts` is absent on the edge. Putting the
  `session` callback there gave an infinite redirect loop: middleware saw no `uid`, called it
  signed out, sent `/` to `/login`; `/login` saw a valid session and sent it back. Nothing
  logged. Anything pure belongs in `config.ts`, which both import.
- **`config.ts` defines exactly one `jwt` callback, it is pure, and it returns the SAME token
  object or null.** Middleware re-encodes and re-issues the session cookie on every matched
  request from whatever that callback returns, so a plausible `return { ...token, x }` in the
  edge config silently strips `uid` and `onb` on the user's next navigation.
- **`pages.error` is not optional.** `pages.signIn` alone leaves a failed token exchange
  rendering Auth.js's unstyled English 500 page. Both point at `/login`.

Two smaller ones: `state` and `nonce` are **not** sent — `@auth/core` appends `state` to
`checks` only when `redirectProxyUrl` is set, and PKCE covers its CSRF role here. And a
folder under `src/app/` whose name starts with `_` is **private**: it registers no route, and
the path falls through to `[reader]/[service]`.

##### A fifth trap, paid for in production on 2026-07-28

**THE SIGN-IN FAILURE PATH LOGGED THE QUERENT'S EMAIL AND REAL NAME, AND THE RULE FORBIDDING
IT WAS ALREADY WRITTEN TWICE** (for `flush.ts` and `moderation/log.ts`). `auth.ts` was the
one place still doing `console.error('...', err)` on a failed upsert, and a postgres error
quotes its bound parameters — `upsertUserOnSignIn` binds nine, four of which identify a
person. Read out of a real Vercel log while diagnosing the missing migration:

```
params: 105739332935278811728,105739332935278811728,<address>@gmail.com,
        true,<full name>,https://lh3.googleusercontent.com/a/<id>=s96-c,...
```

**The leak scaled with the outage**: the failure that exposed it was a schema drift — the
case where EVERY sign-in fails — so a rule harmless for weeks started writing one row of PII
per attempt at the exact moment nobody was watching the log for privacy. `logSignInFailure`
follows `flush.ts` exactly: SQLSTATE and the error's class in production, the whole error in
development. `sqlstate` is duplicated rather than imported so the auth bundle does not
acquire an analytics module for six lines. **The generalisation: every `catch` that touches
the database is a potential PII sink, and the audit is "which of my bound parameters came
from a person".** Grep for `console.error` with an error object in any path that runs a
query.

##### Verifying the gate without Google

`gate.decide()` is pure and Vitest owns it. For the real thing,
`POST /api/auth/dev-session` mints a genuine Auth.js JWE against a genuine `users` row
through the same upsert the Google callback uses, gated by
`DEV_PASSWORD_LOGIN=1 && NODE_ENV !== 'production'` and 404 otherwise.
`public/cards/_gate.html` (gitignored) drives the app in a same-origin iframe with it. Both
live under a path the middleware matcher excludes, which is the only reason they load.

## Moved from CLAUDE.md: Current state

#### Current state

Built and working end to end: Google sign-in and the middleware gate, **onboarding + the
Lotus distillation (W3)**, **analytics and reading persistence (W4)**, **the three memory
features (W5)**, **English and Indonesian throughout (W6)**, **the moderation gate,
`/terms`, `/privacy`, the secrets tripwire and the daily sweep (W7)**, **a fleet-wide rate
limiter and a global model-call ceiling (V9)**, **the correspondence engine (V1)**,
**on-demand translation and locale-tagged generation (V2)**, **mystical memory verdicts —
the Shadow Arcana replacing the tally (V3)**, **the account shell — the circle, the bottom
sheet, and the first sign-out control this app has ever had (V4)**, **the reader swipe deck
(V5)**, **history — `/history`, `/history/[id]`, and `ReadingView` (V6)**, **sharing —
`/s/<slug>`, its OG preview, and the share sheet (V7)**, **`/account` — the deletion button, the
editable facts, per-answer clearing, and the Inner Heavenly Lotus persona (V8)**,
**the public surface and the technical SEO foundation -- a signed-out homepage, the
gate change, a sitemap, JSON-LD, canonicals and cache headers (v0.4.0 S1)**,
**locale-addressable public content -- `/en/`, the rewrite and the hreflang set (S2)**,
**the twenty-two card lore pages, forty-four authored documents (S4)**,
**the gallery -- 22 artworks, 2x11, measured at four phone widths (S3)**,
**the wallpaper downloads -- 44 committed derivatives and the control in the zoom
sheet (S5)**, **the blog -- `/blog`, `/blog/[slug]` and two articles authored twice
rather than translated once (S6)**, plus the reader picker, service
picker, the draw (fan, pick, flip, reduced-motion grid), the card detail overlay, the
streaming reading endpoint, the prompt layer, and the web app manifest.

**Tapping a picked card opens its detail, it does not return it to the deck.** Returning
moved into a button inside that overlay, because at 88x132 the art is unreadable and "what
did I just draw?" is the first thing anyone asks. The button is only offered while the
reading is idle — once a reading is running the draw is settled — so after a completed
spread the overlay is look-only. `Fan`/`FanGrid` report a tap as `onCardTap`; the draw
screen decides what it means.

## Moved from CLAUDE.md: Analytics and reading history (W4)

#### Analytics and reading history (W4)

Every reading, every card and every meaningful choice is persisted, and **none of it is
on the path of a byte the user is waiting for.** Detail, and the database-down check, in
`docs/workstream-notes.md`.

```
src/lib/analytics/
  events.ts        the closed taxonomy: 66 names, a prop shape each, two compile-time
                   guards. NO IMPORTS -- it is the data dictionary, read by people.
                   ONE OWNER PER RELEASE: S1 for v0.4.0 (S-D13). Every other
                   workstream declares its events in its plan and S1 folds them in.
  track.ts         SERVER. AsyncLocalStorage store, ONE after() per request, defer().
  track.client.ts  'use client'. Batched: 2s debounce, flush at 20, queue capped at
                   200, fetch(keepalive) normally and sendBeacon on the hide path.
  localdate.ts     isomorphic. parseLocalDate (+/-1 day), validSessionId.
  tee.ts           the manual fan-out. The client is enqueued FIRST.
  flush.ts         the after()-side writers, sanitizeProps, the retry.
src/app/api/events/route.ts   public, always 204.
src/components/TrackView|TrackLink|AppLaunched|ReaderViewed.tsx
docs/analytics-queries.md     eight queries, all of them executed
```

- **Writes go through one `after()` per request**, registered lazily by `withAnalytics`.
  `readings` + `reading_cards` are one transaction with a bounded retry (3 attempts,
  transient SQLSTATEs only); everything else fails silently and logs.
- **`latency_ms` is TIME TO FIRST TOKEN**, not total generation time — that is
  `reading.completed.total_ms`. An ambiguous latency column is worse than none, and
  changing the meaning later makes every historic row a different measurement.
- **The reading body is captured by a manual fan-out, never `tee()`** (two branches with
  independent queues couple their backpressure). The `[Bacaan terputus...]` notice
  reaches the screen but NEVER `readings.body` — a stored copy would be quoted back at
  the querent by W5's chained reading as if the reader had said it.
- **`reading.completed` exists twice per reading, server and client, distinguished by
  `props.source`** — not redundancy. A client copy with no matching `readings` row is the
  only way to detect a lost write; query 1 is that alarm.
- **z.ai reports `output_tokens` but not `input_tokens`** (measured 2026-07-27); it comes
  back `0` and is stored as NULL so no average is silently wrong. `token_output` is real.
  > **RETRACTED 2026-07-30 — a bug in `anthropic.ts`, not a provider fact. See the
  > retraction under W4.**

**The check that matters most takes ten seconds: stop the database and take a reading.**
It must stream and complete exactly as normal, with nothing but `[analytics] ...` in the
log.

## Moved from CLAUDE.md: Memory features (W5)

#### Memory features (W5)

Three features reading from `readings` and `reading_cards`: a card-frequency verdict,
readings that reference the last reading, and a per-day summary in the reader's own
voice. **V3 rewrote both generated prompts** — see that section. Traps and the measured
chain-block effect are in `docs/workstream-notes.md`.

```
src/lib/memory/
  windows.ts      PURE. The eight window specs and windowBounds(). No DB.
  frequency.ts    ranking, the M4 gate, the fingerprint, the ladder walk
  chain.ts        the request-path recall. NEVER THROWS -- returns null.
  gist.generate.ts  the model call + the write, in after()
  summary.ts      isStale(). The M13 throttle.
  copy.ts         STAGING POST for W6's catalog. `c()` not `t()`, like W3's.
src/lib/prompt/memory.ts   PURE. gist, chainRelevance, memoryBlock, detectCallback.
src/lib/prompt/summary.ts  the frequency verdict AND the day summary prompts
src/app/api/memory/{frequency,summary}/route.ts
src/components/{FrequencyLine,DaySummary}.tsx
```

- **The pure/impure split is forced, not stylistic.** `queries/contract.test.ts` requires
  the handle as the first parameter of every export in `src/lib/db/queries/**`, and
  `windowBounds`, `passesGate` and `isStale` have no handle to take. W5's plan puts them
  in `queries/frequency.ts`; the contract test wins. Same wall W3 hit with the Lotus cache.
- **`<riwayat>` is the tag in BOTH locales** (R17 beats W5's plan): an English querent will
  never type "riwayat" and will absolutely type "history", so the English-looking tag is
  the one carrying injection surface. Only the `ULANG:`/`AGAIN:` marker inside the block is
  localised — that is content the model reads, not a fence the sanitizer strips.
- **NEVER MATCH A BARE `lagi` IN THE CALLBACK DETECTOR.** It is also the progressive aspect
  marker ("dia lagi mikir" = "he is thinking"), so a bare pattern fires on most sentences
  of casual Indonesian and reports a ~90% callback rate that is entirely noise — and that
  ratio decides whether chaining is cut or tightened. Every Indonesian pattern is
  multi-word or hyphenated. English: `again` fires, `against` must not.
- **`sanitizeGist` TRUNCATES where `sanitizeQuestion` REJECTS**, and `gistUserTurn` must
  NOT use `stripUntrusted` directly — it collapses newlines, and the gist prompt's central
  instruction is "the conclusion is in the final paragraph".
- **`readingsOnDay` deliberately has NO filters, unlike `recallableReadings`.** Recall
  feeds a callback, so a dead stream has nothing to quote; a day summary is a count, true
  whether or not the third reading finished.

## Moved from CLAUDE.md: Mystical memory verdicts (V3)

#### Mystical memory verdicts (V3)

**The app has stopped doing arithmetic out loud.** W5's two generated lines read the same
history and no longer recite it. Traps, the rewritten worked examples and the live
measurements are in `docs/workstream-notes.md`.

```
src/lib/memory/shadow.ts     the ONLY V3 module importing @/lib/numerology.
src/lib/memory/tally.ts      PURE, no `server-only` -- the smoke script imports it.
src/lib/memory/frequency.ts  GAINED dominanceOf and verdictCacheState.
src/lib/prompt/summary.ts    both prompts, the ten angles, six worked examples.
src/lib/prompt/budget.ts     MARGARET_MULTIPLIER (VD19).
```

**THE COUNTS ARE DELETED FROM BOTH PROMPTS, NOT FORBIDDEN IN THEM.** The model is handed
two card names, **the Shadow Arcana** (`arcanaFor(top.id + second.id)`, the traditional
quintessence), one **written pulse line** and one **dominance word**. It is never handed
`m` or `n`. **A model cannot recite a count it was never given**, and an instruction that
merely forbids the tally is what fails under compression pressure. `summary.test.ts`
asserts the frequency user turn contains **no digit at all**, so a digit in the OUTPUT was
invented, never copied.

1. **`FrequencyMechanic`'s key set is asserted exactly** (`shadow.test.ts`). Without it VD2
   degrades from "impossible" back to "merely forbidden", because the way a tally returns
   is somebody adding `topCount` for a reason that looks good at the time. `pulseNumber` is
   `reduce(m + n)`, not a count, and exists for the analytics event.
2. **`dominanceOf` is a RATIO, not `m - n`** (V3-5, correcting roadmap §5): a difference is
   not scale-invariant, so `10:8` is `narrow` where the difference would call it wider than
   `4:2`. `dominance.test.ts` names that case. The `m - n === 1` clause is an absolute
   floor and does real work at small counts.
3. **`tally.ts` has two tiers and a false-positive corpus, and that is not timidity.**
   `sekali` also means "very", `once` also means "as soon as", and banning a bare `dua`
   would ban `dua kartu itu`. **It never runs at request time** (V3-11): a false positive in
   the route would delete the feature for that user with nothing on screen. A heuristic may
   fail a build; it may not fail a person.
4. **The window phrase is stripped before matching**, because `d666` is `666 hari terakhir`
   and the prompt INSTRUCTS the model to say it. A naive `/\d/` fails a correct line.
5. **The collision paragraph names POSITIONS, not cards** — spelling out `The Fool` would put
   the only card names into a system prompt that is otherwise pure rules (M10). The shadow
   collides with the pair **iff The Fool is in it**, since `x + 0 ≡ x (mod 22)`, proved over
   all 462 ordered pairs.

`FREQUENCY_MAX_WORDS` is **32**, `SUMMARY_MAX_WORDS` **50**, `summaryMaxWords('margaret')`
**65**. **Neither is tightened on one favourable run** — across three runs the frequency
lines span 19–32, mean ≈ 25. **`MARGARET_MULTIPLIER = 1.3` replaced the hand-set
`spread3: 55` and reaches EVERY reader-voiced ceiling**, because her length is a fact about
the reader, not one service. Ceilings only — a floor scaled by verbosity would demand
length rather than permit it. The frequency verdict is house voice (M6) and is unaffected.

**Still open, and not V3's to close:** `GET /api/memory/frequency` and
`GET /api/memory/summary` both **return 500 when the database is down**, not 204 — neither
route wraps its query. User-visible behaviour is correct (both clients discard non-200s)
and nothing sensitive reaches the log. Fix them together; one omission in two files.

## Moved from CLAUDE.md: The reader swipe deck (V5)

#### The reader swipe deck (V5)

On `/[reader]` the bio and today's summary are two panels of one horizontal scroll-snap
track. The summary **slides itself in once**, on the first byte, and the querent can swipe
back. The three things V5 measured that the plan had wrong — and the reason the height
reserve is 6 lines and not 8 — are in `docs/workstream-notes.md`.

```
src/lib/swipeDeck.ts          PURE. panelIndexAt + shouldAutoSlide. The whole auto-slide
                              policy, and the only part `npm test` can reach.
src/components/SwipeDeck.tsx  'use client'. GENERIC -- N panels, dots, aria, the
                              once-only scroll. Knows nothing about readers or fetching.
src/components/ReaderDeck.tsx 'use client'. THE POLICY MOUNT. Owns the fetch, decides
                              there are 1 or 2 panels, fires the event.
src/components/DaySummary.tsx SPLIT into `useDaySummary()` and `DaySummary`.
```

- **THE CALLER'S ARRAY LENGTH IS THE M14 CONTRACT.** One panel until the first byte, so a
  querent who has not read today gets no dots, no affordance and a deck exactly as tall as
  the bio. A deck rendering two panels with the second one blank **is** the empty state
  roadmap §5 forbids, wearing a dot.
- **THE DEPENDENCY LIST IS WHAT MAKES THE DECK SLIDE ONCE, not `slidTo`.** `slidTo` and the
  `cancelAnimationFrame` cleanup are unobservable today and are the only thing standing
  between the querent and three slides, or none, the moment somebody adds `panels` to that
  list — which `react-hooks/exhaustive-deps` will never argue about either way, because the
  body reads `panelsRef.current`. The five-case negative-control table is in `SwipeDeck.tsx`.
- **A JS `scrollTo({ behavior })` OVERRIDES CSS `scroll-behavior`** rather than defaulting
  from it, so `html[data-still] .scroller` could not govern the auto-slide. `goTo` reads
  `data-still` itself. The same trap will catch the next component that auto-scrolls.
- **`--summary-lines: 6`, stepping to 7 below 300px of deck**, and 300 is a *container*
  number: the deck is `.shell`'s content box (`viewport - 32px`), so the original 339
  breakpoint caught the most common Android width with a reserve meant for 320.
  **`min-height`, not `height`.**

## Moved from CLAUDE.md: History (V6)

#### History (V6)

`/history` lists the querent's own readings, filtered by day and defaulting to today;
`/history/[id]` reconstructs the draw exactly as it was — same cards, orientations, slots,
prose — **read-only** (VD14). And `ReadingView`, the one renderer three surfaces mount
(VD10). Traps, the query plans and the harnesses are in `docs/workstream-notes.md`.

```
src/components/ReadingView.tsx   'use client'. THE SHARED RENDERER.
src/lib/history/dates.ts         PURE, isomorphic. isHistoryDate, dayOffset.
src/lib/history/empty.ts         PURE. Which empty state, and which day to offer.
src/lib/history/types.ts         HistoryItem / ReadingDetail, client-reachable -- the
                                 only reason they are not in queries/history.ts.
src/lib/db/queries/history.ts    GAINED readingsForDay, historyDays, readingWithCards.
src/app/history/**               the list (reads nothing) and the detail (one awaited
                                 primary-key read).
src/app/api/history/{route,days/route,log}.ts
```

**`ReadingView`'s four rules.** No session, no fetch, and no `@/lib/db/**` import *even as
`import type`* (`clientBoundary.test.ts`'s regex does not know the `type` keyword, which is
why `ReadingStatus` moved to `@/data/types`). **Rule 4 is the one to protect: it NEVER
renders `reading.body` when `reading.locale` differs from the viewer's and no translation
was supplied — it renders the translating state instead.** That is the component's
invariant and not the caller's discipline, which is what stops a caller shipping the bug by
forgetting a prop. **Passing no `prose` for a foreign-locale reading leaves a stranger on a
pulsing spinner forever**; deciding not to translate is legitimate (`{ kind: 'as-written' }`,
see V7), falling back to the original silently is not.

1. **`todayKey()` IS NEVER CALLED DURING RENDER** — it reads `new Date()`, which differs
   between server render and hydration, the same class as `shuffleDeck()` in a `useState`
   initialiser. `HistoryBrowser` starts `today` and `selected` at `null` and sets them in an
   effect. **Do not "simplify" it into `useState(() => todayKey())`.**
2. **`parseLocalDate` MUST NOT VALIDATE THE FILTER.** Its ±1-day bound answers "is this
   plausibly the querent's TODAY"; a history filter's job is days that are not today, so
   reusing it makes every date older than yesterday a 400 that reads like a client bug.
   `/api/history` uses `parseLocalDate` for the header, `isHistoryDate` for the parameter.
3. **THE `blocked` FILTER IS SECURITY-ADJACENT.** A blocked reading has no card rows (R7),
   and its `question` is text W7's classifier flagged and redacts from `moderation_flags` at
   30 days — a browsable copy under another column name undoes a retention promise. `failed`
   and `aborted` ARE shown, because R7 already counts them in the frequency verdict.
4. **THE LIST PAYLOAD CARRIES NO `body` AND NO `gist`**, asserted on the returned OBJECT
   (`'body' in item` is false), not on a null field. The binding reason is VD8, not bytes.
5. **`/history` IS GATED AND `isPublic()` MUST NEVER LEARN IT.** The only reason
   `requireUser()` is not in `page.tsx` is that middleware already ran.

**Still open:** `readings.shared_at` is V6's column, written by V7, and stays null after a
revoke on purpose — "was this ever public" is a different question from "is it public now".
Whether the question belongs in the list row is Miftah's call; it ships, clamped to one line.

## Moved from CLAUDE.md: Sharing (V7)

#### Sharing (V7)

**`/s/<12 chars>` is the first URL in this project's history that a person with no account,
no session and no relationship with us can open.** A stranger sees the reading exactly as
the querent saw it, with a *Try It Yourself* button underneath. The four traps, the satori
findings and the live checks are in `docs/workstream-notes.md`.

```
src/lib/share/slug.ts      PURE, CLIENT-IMPORTABLE, NO `process.env` EVER. Crockford
                           base32, `byte & 0x1f`, the entity union.
src/lib/share/types.ts     PURE. Client-reachable, so no `@/lib/db` specifier -- not
                           even `import type`.
src/lib/share/links.ts     server-only. create / resolve / revoke, sharingEnabled,
                           shareOrigin, shareUrl. Dynamic `import` of the client.
src/lib/db/queries/share.ts  handle-first. Every MUTATION carries `userId` in its
                           `where`; `revokeAllForUser` is V8's to call.
src/app/api/share/route.ts   POST mint, DELETE revoke. Session required.
src/app/s/[slug]/          page, not-found, adapt.ts, ShareViewed, the OG image
src/components/ShareFooter.tsx / TryItYourself.tsx
tools/share-seed.ts + tools/share-check.py   the live checks.
```

**THE QUESTION IS ON THE PUBLIC PAGE, AND THAT REVERSES VD9** (Miftah's ruling,
2026-07-28): a stranger who sees three cards and four paragraphs with no question cannot
tell what any of it is about. `share_links.include_question` defaults to `true` (migration
`0004`) and the sheet no longer offers a switch. **What did NOT change, and must not:**

- **The OG preview image carries neither the question nor the prose (VD18)**, and this got
  MORE important, not less — a page is opened by somebody who chose to, while a preview
  image is cached by every messenger that merely *sees* the link. `page.contract.test.ts`
  asserts the OG route reads no `question`, no `.body`, no `nickname`.
- **`publicReadingQuery` still builds its projection conditionally** and the `.toSQL()`
  assertions still run — they keep the *capability* to exclude the column real.
- **The sheet still previews the real page**, now the ONLY consent mechanism for the
  question rather than one of four.
- **`include_nickname` keeps its switch.** A nickname is a name rather than context.

- **RE-SHARE ROTATES THE SLUG *WITHIN ONE LANGUAGE*. DO NOT "SIMPLIFY" IT TO
  `revoked_at = null`.** `unique nulls not distinct (user_id, entity, entity_id, locale)`
  means one row per artifact **per language** forever, so un-revoking is the obvious
  one-liner — and it **resurrects a capability the querent deliberately killed**: the old
  URL, in the group chat they revoked it because of, starts working again for whoever still
  has it. The regression test is the one asserting the OLD slug stays dead.
  **The narrowing is 2026-07-28's and it is the whole of `## Share links, one per language`
  below** — a *different* language is a *different row*, so it takes the insert branch and
  the first address stays alive.
- **`currentUser()` IS NEVER CALLED ON `/s/[slug]`, AND `curl` CANNOT SEE THE FAILURE.** A
  client component reaching for a session context renders correct HTML on the server and
  throws during hydration: `curl` reports 200 with the reading in the body and the page is
  dead in a browser. `page.contract.test.ts` fences `currentUser`, `requireUser`,
  `ViewerProvider`, `useViewer`, `cookies()` and `@/lib/auth/*` across the whole subtree.
- **THE HEADERS MUST STAY `SAMEORIGIN` / `frame-ancestors 'self'`** (see W7), and V7's
  `/s/:path*` block sits **AFTER** the catch-all in `next.config.ts` on purpose — Next
  applies every matching entry and a later one with the same key wins, which is what makes
  `referrer-policy: no-referrer` override the global value on `/s/` and only there.
  Reversing the two entries is a silent no-op that reads as correct; `headers.test.ts`
  asserts the ordering.
- **`ReadingView` gained a fifth prose state, `{ kind: 'as-written' }`,** because
  `resolveProse` deliberately treats an explicit `original` exactly like an omitted prop —
  so reconciliation §5.5's literal instruction would have shipped the pulsing spinner it was
  written to prevent, forever, for a stranger. Do not use `{ kind: 'translated' }` when
  nothing was translated: it renders identically and would record that a translation
  happened when none did.

##### A SHARE LINK NOW CARRIES THE LANGUAGE IT WAS SHARED IN (design A, 2026-07-28)

**This section used to say the body is rendered verbatim in `readings.locale` and NEVER
translated, and that `lang={reading.locale}`. Both are now wrong, and the third reason
`adapt.ts` gave for them has been overturned rather than forgotten.** `share_links.locale`
pins the locale the sharer was reading; the resolver reads that `translations` row and the
stranger sees what the sharer saw. `docs/plans/2026-07-28-share-live-locale-design.md` is
the full argument. What changed and what did not:

- **VD7 and VD8 still bind. THE PUBLIC ROUTE STILL MUST NEVER GENERATE ANYTHING** — it is
  the one route with no session and no per-user budget, so a model call there is
  `LLM_WINDOW_CALL_CEILING` with no gate on it. The page only ever READS.
- **The overturned reason was "reading an existing `translations` row would make the
  preview a lie."** That argument binds a *viewer-adaptive* page. It does not bind one that
  renders what the SHARER was reading — but only because `ShareFooter` now takes the host's
  `prose` and previews it. Without that, the objection stands and the sheet lies.
- **`lang` comes from `renderedLocale(reading, translation)`, never `reading.locale`.**
  Against the source, a screen reader pronounces English as Indonesian on an
  English-pinned link. It sits on **`<main>`** since the monolingual ruling below —
  widened from the prose wrapper, because the whole page is now in that language — and
  `lang={shownLocale}` is still the line in that page not to touch. **It is no longer the
  only thing declaring the prose's language**, which is what that ruling changed.
- **THE OTHER-LANGUAGE NOTICE IS DELETED, AND THIS FILE SAID IN CAPITALS THAT IT "MUST
  NOT BE" (Miftah's ruling, 2026-07-28).** `share.public.otherLanguage` and
  `isForeignProse` are both gone from the repo. The old argument was that an
  English-pinned link opened by an Indonesian reader is a genuine mismatch a stranger
  deserves an explanation for. What overturned it is that **design A changed what the
  page shows underneath a sentence describing the old mechanism**: the page no longer
  renders "whatever language the reading was generated in", it renders the language the
  sharer was reading, so *"this reading was written in another language and is shown as
  it was written"* described a mechanism that had stopped running and fired only on the
  residue — a NULL pin, or a viewer who reads neither. **Three tests were inverted
  rather than deleted** (`adapt.test.ts`'s deletion block, `page.contract.test.ts`),
  because the failure mode of removing chrome is somebody adding it back in six months.
  Design C — generating both locales at mint — is still the only way to make the
  mismatch itself impossible, and still costs one model call per share.
  **`account.persona.otherLanguage` IS A DIFFERENT KEY ON A DIFFERENT PAGE and still
  renders**; V2's translator is not wired to the persona, so `/account` labels a
  foreign-locale persona in chrome. Do not delete that one by association.
- **`NULL` locale means as-written**, which is every link minted before this shipped. There
  is deliberately no column default; the integration test named for the guarantee is what
  stops a "tidy" default silently rewriting what historic links show.

**Still open:** `share.viewed` has not been observed firing; two `authjs.*` cookies reach a
third party on `/s/` and `/privacy` §4.4 names them; no resolve cache is shipped
(`SHARE_RESOLVE_CACHE_MS` is `0`, and turning it on buys a window in which a revoked link
still resolves — **the "re-pinned locale is stale" half of that risk is GONE since
2026-07-28**, because a locale is now a row and nothing re-pins); **`'persona'` is
STILL a live union value resolving to null** — V8 shipped the persona and exports
`readPersonaView` plus the presentational `PersonaBlock` for it, but `/s/<slug>` does not
mount either yet. **Design C is the only way to make the locale mismatch itself
impossible** — the notice that used to explain it is deleted, see above — and it has still
not been costed against the ceiling.

##### `/s/<slug>` IS MONOLINGUAL, IN THE READING'S LANGUAGE (2026-07-28)

**The whole page follows the prose, chrome included, and `accept-language` no longer
changes a byte of it.** Miftah's ruling, on a phone, and it **reverses "chrome follows
the viewer"** — a rule that stood for two workstreams and that `tools/share-check.py`
asserted in both directions. The report: an English-pinned link opened with the app set
to Indonesian rendered English prose under `Bacaan yang dibagikan`, `Bacaan untuk Mif`
and `Kartu Harian`. A page in two languages reads as half-translated, not as
considerate.

- **THE COST IS REAL AND WAS ACCEPTED, NOT MISSED.** An Indonesian visitor opening an
  English link now has nothing on the page they can read — `common.disclaimer.long` and
  `share.public.cta` included. The narrower option (reading block follows the prose,
  disclaimer and CTA stay with the viewer) was offered with exactly that argument and
  refused. Do not "fix" it back without asking; it is a decision, not an omission.
- **THE MECHANISM IS A NESTED `LocaleProvider`, NEVER A `locale` PROP.** Both halves are
  load-bearing. `LocaleProvider`'s header says **"NO LOCALE PROP IS DRILLED ANYWHERE"**
  and I9 says the client ships exactly ONE catalog, as JSON from the server, never a
  client-side `catalogFor` import (an ESLint rule enforces the second). And a prop would
  have had to pass through `ReadingView`, **the one renderer three surfaces mount
  (VD10)** — so this page's problem would have reached `/history` and the draw screen,
  where chrome-follows-viewer is *correct* because the reading there is already
  translated to the viewer.
- **`ReadingView`, `TryItYourself` and `Eyebrow` ARE UNTOUCHED**, which is how you know
  the mechanism is right. `t.locale` inside `ReadingView` becomes `shownLocale`, so the
  service name, the slot labels, the disclaimer, **the date and time formats** and
  `resolveProse`'s viewer comparison all follow in one move. Measured: `28 July 2026 |
  9:03` against `28 Juli 2026 | 9.03`.
- **THE PROVIDER IS MOUNTED ONLY ON A MISMATCH, AND THAT IS THE ONE THING ON THIS PAGE
  THAT READS THE VIEWER'S LOCALE.** A second identical catalog costs **+3.3KB gzipped, a
  30% increase on the transferred page** (48734→63057 raw, 11333→14686 gzipped) on the
  one public route strangers open on mobile data. Both branches render byte-identical
  markup, so the page stays viewer-invariant and cache-safe. **The rule is: never read
  the viewer's locale to choose what LANGUAGE to render; reading it to choose what to
  SEND, when both choices render the same, is the only exception.** A contract test
  asserts `viewerLocale` appears nowhere else.
- **`<html lang>` STILL FOLLOWS THE VIEWER AND CANNOT BE CHANGED FROM THE PAGE.** The
  root layout emits `<html>` and no page overrides it in the App Router. The innermost
  `lang` is what assistive tech and the browser's translate offer use, so `<main
  lang={shownLocale}>` is correct rather than merely adequate — but the residual is real
  and is one attribute on an element carrying no text of its own.
- **THE 429 PAGE KEEPS THE VIEWER'S LOCALE, CORRECTLY.** A rate-limited visitor has no
  reading, so there is no reading language to follow. The first version of the contract
  test forbade the viewer's `t` outright and failed on exactly that line.
- **AND SO DOES THE DOCUMENT TITLE — NO LONGER. `generateMetadata` FOLLOWS THE PIN
  SINCE 2026-07-28, AND THE BULLET THAT USED TO SIT HERE WAS WRONG ABOUT ITS OWN
  COST.** It said making the card follow the pin "doubles the database reads on the one
  uncapped public route". It does not: the page was going to resolve anyway, so sharing
  one `cache()`d call costs nothing. **The real objection was different and stronger** —
  a resolve inside `generateMetadata` sits in FRONT of the rate limiter, because that
  function runs outside the page component, and the limiter-before-database ordering is
  the whole defence on this route.
  **The fix is to move the gate INTO the cached function** (`gateAndResolve`), which
  both call. Counts are unchanged and were **verified by counting executions rather
  than trusted from the docs**: one limiter spend and one resolve for an allowed
  request, one spend and no resolve for a refused one. The symptom this closed:
  everything on a Bahasa-pinned link stayed Indonesian *except the browser tab*, which
  said "A shared reading" — `<title>` was the last string resolved from
  `accept-language`, and `og:title` shares it, so chat previews had it too. **The OG
  IMAGE needed no change**: it draws only `MAJOR ARCANA`, English in both locales, and
  VD18 keeps the question and prose out of it.
- **THE SHEET'S "EXACTLY WHAT THEY WILL SEE" IS NOW APPROXIMATE IN ONE FAILURE PATH.**
  The preview renders chrome in the sharer's UI locale, which equals the pin in every
  ordinary case. They diverge only when the sharer reads a language the reading was not
  generated in, no translation row exists, AND the mint's `translateOrCached` fails — so
  the pin is NULL and the page falls back to the source for chrome as well as prose. The
  prose still matches; only the chrome differs. Closing it means shipping the second
  catalog to `/history/[id]` and the draw screen permanently, to be exact about a state
  that only exists when a model call fails.

##### Share links, one per language (2026-07-28)

**A reading holds one address PER LANGUAGE, and sharing it in a second language no longer
kills the first URL.** That was the reported bug: *"I got a share link for card session A in
English. When I changed the language and created a share link in Bahasa, the link in no 1
cannot be opened again."* `docs/plans/2026-07-28-share-per-locale-links-design.md` is the
argument. Nothing was overwritten — `readings.body` is immutable and the `translations` row
survived — the **address** was replaced, because `locale` was an attribute of the one row a
reading had rather than part of its identity.

- **`unique nulls not distinct (user_id, entity, entity_id, locale)`, AND THE CLAUSE IS THE
  WHOLE TRAP.** Postgres `UNIQUE` treats NULLs as DISTINCT and every pre-design-A link has
  `locale = NULL`, so the naive four-column key would let `onConflictDoUpdate`'s target MISS
  a legacy row and INSERT rather than rotate — leaving the old slug live and unreachable from
  the UI, which is the capability resurrection rotation exists to prevent, arriving through
  the back door with a green suite. Two integration tests are the negative control, one at
  the upsert level and one on a raw insert, and **both fail by ACCEPTING a second row.**
  A reading may hold three rows: one `en`, one `id`, one legacy `NULL`.
- **`insertOrRotateShareLink` NO LONGER WRITES `locale` IN ITS `set` CLAUSE.** It is in the
  conflict target instead, so a conflict means "same language" and re-pinning is a no-op. The
  old comment argued at length that omitting the line was the bug; it is **inverted, not
  deleted**, because the failure mode is somebody restoring it.
- **THE MINT RESOLVES THE PIN, IT DOES NOT TRUST IT** (`resolvePin`). A non-NULL
  `share_links.locale` **always has a `translations` row behind it**: the mint calls
  `translateOrCached` and pins `NULL` when it falls back, because a row claiming `en` with no
  English body is a link that lies about its own language and the notice that used to explain
  a mismatch is deleted. **`fellBack` is the check and `outcome` is not a substitute** in
  either direction — `invalid` is prose that WAS translated. **VD7 is intact**: it binds the
  session-less public page, and a mint has `requireUser()`, `share:create:` and `llm:window`
  behind it. The persona arm is unreachable today (`publicPersonaForShare` returns null) and
  is owed the same treatment on the day V7 mounts it.
- **REVOKE IS PER-ARTIFACT AND KILLS EVERY LANGUAGE** (Miftah's ruling). One control, one tap.
  A per-locale kill was offered and refused on consent grounds: two kinds of "stop sharing" is
  a UI in which the querent taps the wrong one, believes the reading is private, and is not.
  `DELETE` still names one `id` — the anchor — and the server expands it, firing **one
  `share.revoked` per address**, because `age_hours` and `view_count` are facts about an
  address rather than about the artifact.
- **`GET /api/share?entity=&entity_id=` EXISTS BECAUSE THE SHEET HAD NO READ PATH AT ALL**,
  which is why the bug arrived silently: `liveShareLinkFor` had zero production callers, so a
  reading shared yesterday looked unshared and minting replaced its address with nothing on
  screen having warned. Fetched on sheet OPEN, never on mount — this component renders under
  every completed reading. A failed read falls through to the create flow rather than erroring.
- **`ShareFooter` BOUNDS ALL THREE REQUESTS AT 8s** and `maxDuration` went 20 → 30, together.
  CLAUDE.md's `POST /api/locale` rule: a bigger server budget without a client bound only makes
  a hang longer. Giving up costs nothing now — the lambda's row still lands and the next open
  of the sheet reads it back.
- **`share.sheet.createIn` IS "Create a link in {language}" AND NOT "a {language} link".** The
  first version rendered **"CREATE A ENGLISH LINK"**, found by driving the real page and
  invisible to the whole suite because the string and the parameter are each correct on their
  own. Any phrasing with an indefinite article next to an interpolated language name is a coin
  flip. The Indonesian never had the problem and is deliberately phrased differently.

**AND ONE GAP THAT ONLY EXISTS BECAUSE V8 AND DESIGN A LANDED TOGETHER: the pinned locale
covers the READING arm only.** `share_links.locale` is written for every mint and
`resolveShare` reads a translation for `entity = 'reading'`; the persona arm returns before
that. `'persona'` is already in V2's translation registry with a `body` field, so the day
`/s/<slug>` mounts `PersonaBlock` the pin is there, unused, and a shared persona will render
in the language it was generated in rather than the one the sharer was reading. That is one
`getTranslation` call and the same `renderedLocale` treatment — do it in the same change that
mounts the block, not after somebody notices.

## Moved from CLAUDE.md: The public surface (v0.4.0 / S1)

#### The public surface (v0.4.0 / S1)

**Before this, a search engine could see three pages of this application and one of them
was a login form.** S1 is the keystone of v0.4.0: the gate change, a signed-out homepage,
one leaf that owns the site's origin, a sitemap, JSON-LD, cache headers and the shared
public footer. The evidence, the measurements and the crawl baseline are in
`docs/workstream-notes.md`.

```
src/lib/seo/origin.ts     THE ORIGIN LEAF. Env only, ZERO imports. siteOrigin,
                          absoluteUrl. `shareOrigin()` DELEGATES to it.
src/lib/seo/jsonld.ts     PURE builders. No imports, origin as an argument.
src/lib/i18n/prefix.ts    S2's leaf, landed early -- `gate.ts` imports it (R11/R14).
src/components/JsonLd.tsx the ONE ld+json mount in the whole app.
src/components/PublicShell.tsx   the frame + footer. Takes `path` (R17).
src/components/PublicShare.tsx   S-D8's control. Takes a finished URL as a PROP.
src/app/Landing.tsx       the signed-out homepage. No session, no DB, no model.
src/app/page.tsx          the dual render. `currentUser()` and nothing else.
src/app/sitemap.ts        a LEAF. Alternates are PER PATH, not per release.
src/content/copy.test.ts  the copy lint over authored content, negative-controlled.
tools/seo/crawl.sh        THE ACCEPTANCE TEST. No cookie jar.
tools/seo/fit.sh          loop 4, committed.
```

##### The six things a future session will otherwise undo

1. **`'/'` IS NOT IN `isPublic()` AND MUST NEVER BE (S-D5).** That function
   short-circuits `decide()` **above** the onboarding check, so `/` in the allowlist
   stops sending a signed-in, half-onboarded querent to `/onboarding` and lands them on
   a picker that assumes a completed `profiles` row. The clause is `!signedIn &&
   pathname === '/'` in `decide()`, below the public check. `isPublicContentPath`
   differs from `isContentPath` by exactly that one path, and both test files say so.
2. **`isPublic()`'s CONTENT CLAUSE STRIPS `/en/`; THE OTHER CLAUSES MUST NOT
   (contract G2).** Middleware strips first (G1), so in production the gate never sees
   a prefix -- this is defence in depth. **Unconditional stripping would make
   `/en/api/events` public.** `/en/history` is `false` and there is a test named for
   the worst outcome available in this release.
3. **`/arcana` IS PUBLIC THOUGH IT HAS NO PAGE (R6), so its 404 is a real 404.** It is
   the parent of 22 indexed URLs and Google reads a login redirect on a content path as
   a soft 404. The negative controls are `/arcanax` and `/arcana-foo`, never `/arcana`.
4. **`/` IS DELIBERATELY UNCACHEABLE AND HAS NO `next.config.ts` ENTRY.** Three
   independent reasons that would all have to be solved together: it dual-renders by
   session, middleware writes `jmt_locale` on it (a `Set-Cookie` makes a response
   edge-uncacheable whatever `Cache-Control` says), and its language follows D6's chain
   because the signed-in arm is an app route. Adding it to the cache list would look
   symmetrical; `headers.test.ts` asserts the absence.
5. **`inLanguage` IS THE BARE TAG -- `id` / `en`, NEVER `intlTag()` (R15).**
   `intlTag('en')` is `en-GB`, which V6 chose for date formats and which is a factual
   claim we cannot make about our prose. `id-ID` on the `WebSite` node beside `id` on
   S3's 22 `ImageObject`s in one `@graph` is what the rule prevents.
6. **`sitemap.ts` ALTERNATES ARE PER PATH, NOT PER RELEASE (R2).** `/` is localized and
   emits a reciprocal `id`/`en`/`x-default` set; `/terms` and `/privacy` have ONE address
   serving both languages and emit **none**. A `hreflang` pair naming a URL that 404s is
   non-reciprocal and **Google discards the whole set silently.** S3/S4/S6 add a path
   only in the commit that adds its page, and only with the English document written.
7. **THE ONLY WAY TO EMIT A CANONICAL OR AN `hreflang` IS `contentAlternates()`
   (S-D15), AND IT TAKES THE LOCALES THAT ACTUALLY EXIST (R2).** Not `LOCALES`, which
   is the answer that is wrong exactly when it matters — a card whose English lore is
   unwritten emits `id` + `x-default` and no `en` key. It throws on a prefixed path, on
   a non-content path, and on a canonical for a locale with no document, because a wrong
   canonical de-indexes the correct page and nothing reports it. `sitemapLanguages()` is
   the same function, so the `<xhtml:link>` set and the head's `<link rel="alternate">`
   set cannot disagree. **`/en` shipped for one commit with `/`'s canonical** — found by
   `curl`, not by a test, and now fenced in `page.contract.test.ts`.
8. **`wallpapers/` IS EXCLUDED IN THE MATCHER AND MUST NEVER BE "FIXED" IN
   `isPublic()` (R7).** Both give a 200; only the matcher stops middleware running, and
   middleware running means a `Set-Cookie` on a ~550KB static response, which makes it
   edge-uncacheable. `cards/` and `dukuns/` are there for the same reason. §6.2 said the
   matcher would not need to change; S5 raised the flag it invited and was right.

**`/terms` and `/privacy` ARE INDEXED NOW (R4).** Their `noindex` said "an indexed legal
page for an app behind auth is noise"; the app stopped being behind auth in this release.
Three things landed together and doing one half is worse than none: the `robots` field
came off, both joined `SITEMAP_PATHS`, and both hardcoded Indonesian `<title>`s became
`generateMetadata` reading the catalog -- the same `<title>`-from-the-wrong-input bug
`/s/` was fixed for on 2026-07-28.

**`NEXT_PUBLIC_SITE_ORIGIN` IS THE FIRST AND ONLY `NEXT_PUBLIC_` VARIABLE THIS PROJECT
DECLARES**, and `scripts/audit-secrets.ts`'s "JMTarot has no NEXT_PUBLIC_ variables" rule
is amended rather than suppressed: the allowlist pairs the name with its ONE legitimate
reader, so any other module reading it still fails the build, and `lib/seo/origin.ts`
joined the transitive client-boundary walk. **The prefix is misleading and kept anyway**
(R10) -- the chain's other three rungs carry no prefix, so `siteOrigin()` inlines to
`http://localhost:3001` in a browser bundle. A client component takes a finished URL as a
prop.

**`npm start` LISTENS ON 3000, WHICH IS PERMANENTLY HELD** by another project's Grafana
container. `npm run dev` passes the port and `npm start` does not, so a local production
check is `npx next start -p 3001`.

**S2 IS LANDED NOW, AND THIS PARAGRAPH USED TO LIST IT AS THE GAP.** `/en` is 200 and
renders the English landing, no content response writes `jmt_locale`, and `PublicShell`
mounts `ContentLocaleLink` in what was a marked hole. Measured on the wire, 2026-07-29 —
see `## Locale-addressable public content (S2), v0.4.0` in `docs/workstream-notes.md`.

**A PUBLIC CONTENT RESPONSE NOW CARRIES ZERO COOKIES, AND THE LAST TWO WERE NOT OURS.**
`authjs.csrf-token` and `authjs.callback-url` are appended by the `auth()` wrapper
**after** the middleware handler returns (`next-auth/lib/index.js` builds
`new Response(response?.body, response)` and then appends), so no line inside that
handler could prevent them — which is why S-D10 read as satisfied while being false on
every public page, `/s/` included. **The half that looked fine was the cache:** a
`Set-Cookie` makes a response uncacheable at the edge whatever `Cache-Control` says, so
`next.config.ts`'s `s-maxage` was measured, correct and inert.

The fix is an **outer** `export default async function middleware()` around the
`auth()`-wrapped gate: the inner handler marks a content response with an internal
header, the outer deletes every `Set-Cookie` and then the marker. Three rules on it:

- **`content.kind !== 'passthrough'` is the whole fence.** A signed-in visitor on `/`
  is `passthrough` (S-D5), so stripping there would drop the `jmt_locale` sync D6 needs
  *and* the sliding session cookie on the busiest screen in the app. `/login` and
  `/api/auth/*` are `passthrough` too, which is what keeps the csrf token available to
  the sign-in POST — a stranger clicking from `/blog` mints both at `/login`, one
  request later.
- **The marker must never be observable on the wire.** It is deleted in the same block.
- **It costs the sliding refresh on content pages, deliberately.** Reading `/blog` all
  day does not extend a 24-hour idle timeout; the 30-day absolute cap is untouched.
  Browsing public content is not app activity, and the alternative is a `Set-Cookie` on
  every cacheable page in the product to keep one timer alive.

**Still open:** the `s-maxage` is measured locally but **not** against a Vercel CDN
(R21) — and it is only now that the measurement can mean anything, because until this
landed no content response was cacheable at all.

## Moved from CLAUDE.md: Card lore pages (v0.4.0 / S4)

#### Card lore pages (v0.4.0 / S4)

**Forty-four documents, twenty-two addresses, two languages.** `/arcana/<slug>` is
the largest indexable surface this release adds and the one a competitor cannot
copy, because the art and the voice are ours. The traps, the near-misses and the
measurements are in `docs/workstream-notes.md`.

```
src/data/deck.ts                  +cardUrlSlug, +cardByUrlSlug, +CARD_URL_SLUGS.
                                  NO NEW IMPORT -- `Card` and `CARDS` were in scope.
src/lib/arcana/correspondence.ts  PURE, client-importable. The glyph table and the
                                  bridge to @/lib/numerology. NOT in @/data (cycle)
                                  and NOT in @/content (client-fenced).
src/content/types.ts              PURE, client-importable. Block + LoreDoc. S6
                                  appends BlogDoc below the marker.
src/content/arcana/index.ts       the registry. NO PROSE. Card order is asserted.
src/content/arcana/<slug>.<loc>.ts  44 documents. Server-imported only.
src/content/arcana/lore.test.ts   THE COPY LINT. The release's only quality gate.
src/components/Prose.tsx          the ONE block renderer. Server, exhaustive switch.
src/app/arcana/page.tsx           notFound(). Four lines, an honest 404 (R6).
src/app/arcana/[slug]/            page, ArcanaFacts, jsonld, page.contract.test.
```

##### The five things a future session will otherwise undo

1. **PROSE IS DATA BECAUSE THE LINT NEEDS STRINGS.** `terms.id.tsx` is the
   precedent for long-form bilingual prose and it settles a DIFFERENT question
   (MDX is not added). In a `.tsx` document a sentence is split across text nodes
   by `{' '}`, punctuation arrives as `&ldquo;`, and `\btempoh\b` can straddle a
   JSX boundary and never match. **Converting these files to TSX for authoring
   comfort switches the release's only quality gate off, silently.** Typographic
   characters go in the source literally; a test forbids a tag or an entity in any
   `text` field.
2. **`doc.yesno` IS ASSERTED AGAINST `effectiveYesNo()` AND IS NEVER WHAT IS
   RENDERED.** The page takes the verdict from the engine plus
   `reading.verdict.*`, so the words on screen are the words the app prints after
   a real yes/no reading, by construction. The field exists because the flip is
   counter-intuitive — **The Moon and The Hermit both answer `no` upright and
   `yes` reversed** — and a writer following the artwork gets it backwards.
   `page.contract.test.ts` fences both halves.
3. **`EN_TICS` BANS THE EMPRESS'S OWN ENGLISH KEYWORD, AND THE LINT'S SCOPE IS
   `src/content/**` ONLY.** `abundance` is on the tic list and is card 3's keyword
   in generated `cards.json`; the chip on the page is unaffected and the lore has
   to say what the thing IS. Same shape for `sacred` (The Hierophant),
   `heal`/`healing` (Temperance, The Star) and `shadow work` (The Devil).
   **Anyone who widens the lint to the rendered page fails on data S4 does not
   own, concludes the lint is broken, and switches it off.**
4. **`/arcana` HAS A PAGE THAT CALLS `notFound()`, AND THE FILE EXISTING IS THE
   RULING** (R6). S4's own plan asserted its ABSENCE — Next 404s an absent route
   anyway. The reconciliation answered S1's objection ("widening the allowlist for
   a path with no page is how `isPublic` stops being readable") by giving the path
   a page, so deleting the file reads as the ruling being undone. The negative
   controls are `/arcanax` and `/arcana-foo`, never `/arcana`.
5. **THE SITEMAP TAKES `LORE_SLUGS`, NEVER `CARD_URL_SLUGS`.** The deck has 22
   cards whatever is written; the registry has the ones with a document. The two
   lists are identical now, which is exactly when somebody simplifies it and
   nothing fails until the next partial release. `contentAlternates` likewise
   takes `localesFor(slug)` and not `LOCALES` (R2).

**`Article`, NOT `CreativeWork`** (roadmap §13's open question, S4's call).
`CreativeWork` is `Article`'s parent, and Google's documented eligibility is
defined over `Article` and its subtypes. The argument for `CreativeWork` is
correct and points at `about` rather than at the page type — a tarot card IS an
artefact — so the graph nests both, and the painting is the `image`. **The
breadcrumb's middle rung is `/gallery`, never `/arcana`**, because naming a
deliberate 404 in markup is a machine-readable claim that a page exists.

**Justice has no root card and it is a tautology, not a gap.** `reduce(11)` is 11,
so `arcanaFor(11)` is Justice; `rootCardFor` suppresses it in the MODULE so every
future consumer inherits the suppression. Anyone who "restores" the block renders
*"Justice reduces to Justice"*; anyone who instead changes `reduce` silently
rewrites every stored `frequency_verdicts` and `personas` row.

**`generateStaticParams` DOES NOT MAKE THIS PAGE STATIC**, and the build output
showing `ƒ` is the symptom of `## Localization` rule 5 working. What it buys with
`dynamicParams = false` is a 404 at the routing layer for any slug outside the
twenty-two. The TTFB story is entirely S1's cache headers.

**Judgement's element is `water` in `cards.json` while the Golden Dawn attributes
the trump to Fire.** Both are true, the page renders ours, and that disagreement is
the Indonesian document's own anchor. **Do not "fix" `cards.json`** — it is
generated, S4 does not own the generator, and the reading prompt has consumed
`element` since the first release. `correspondence.test.ts` asserts the element
join for the **twelve sign cards only**, all of which agree exactly; the nine
planetary ones are editorial and deliberately unasserted.

## Moved from CLAUDE.md: The Gallery (v0.4.0 / S3)

#### The Gallery (v0.4.0 / S3)

**Twenty-two artworks as a 2x11 grid, and twenty-two crawlable links into S4's lore
pages.** The grid is the shape roadmap §8.1 ruled; the links are half the reason the
page exists. The measurements, the two cross-page defects and the negative controls
are in `docs/workstream-notes.md`.

```
src/app/gallery/page.tsx          SERVER. No session, no DB, no model, no cookie.
src/app/gallery/images.ts         PURE. The 22 ImageObject args -- OUT of the page
                                  so the cross-page @id join is testable.
src/app/gallery/alt.ts            PURE. 22 localised alt sentences from ONE key.
src/app/gallery/GalleryGrid.tsx   'use client'. One open card, one opener ref,
                                  every track() call.
src/app/gallery/GalleryTile.tsx   'use client'. PRESENTATIONAL. Always upright.
src/app/gallery/imageJoin.test.ts THE CROSS-PAGE ASSERTION. Reads S4's module.
src/components/PublicPageViewed.tsx  public.page_viewed with a REAL referrer_kind.
src/lib/seo/jsonld.ts             GAINED imageGallery + eight optional ImageObject
                                  fields. S4's four-field call is byte-identical.
src/data/deck.ts                  GAINED cardImagePath / cardThumbPath.
tools/seo/galleryfit.sh + .js     Loop 4, committed. The grid, measured.
```

##### The six things a future session will otherwise undo

1. **`/gallery` AND `/arcana/<slug>` SHARE AN `@id` FOR EACH ARTWORK, SO EVERY FIELD
   THEY BOTH CARRY MUST AGREE.** A shared `@id` makes a consumer MERGE the two
   nodes and pick one value for any duplicated field, silently. That broke twice
   before it shipped -- `url` (the lore page vs the image file) and `caption` (the
   keyword sentence vs the painting's description) -- and **both were found by
   reading the JSON off the wire with a green suite.** The resolution is by field:
   the lore page keeps `caption`, the gallery carries `description`, and `url` is
   the image FILE on both. `imageJoin.test.ts` builds both graphs and asserts it;
   it imports S4's `arcanaGraph` **on purpose**, because its subject IS the
   agreement between two owners.
2. **NO `?v=` IN STRUCTURED DATA.** `cardImage`/`cardThumb` append
   `?v=${ART_VERSION}` for the browser cache; `cardImagePath`/`cardThumbPath` are
   the unversioned twins and are what an `ImageObject` may name. Google Images
   treats a changed URL as a NEW image with no history, so a version there orphans
   22 indexed images on every art regeneration and reports nothing.
3. **EVERY CARD IS UPRIGHT AND THE ZOOM SHEET LABELS BOTH GLOSSES.** `reversed` in
   this app means the card came out of the deck that way, and no card here came out
   of a deck (`/account` passes an orientation the card EARNED). `CardDetail`'s
   `bothMeanings` is what makes an upright-only catalogue honest rather than half a
   card -- and **the LABELS are what make it legal**: an unlabelled pair under
   upright art is the contradiction `cardMeaning()` exists to prevent.
4. **`CardDetail`'s `returnFocusTo` IS THE SAFARI FIX AND IT IS PROVEN, NOT
   ASSUMED.** A programmatic `.click()` in WSL Chrome does NOT focus the button, so
   loop 5 reproduced Safari's behaviour: `document.activeElement` was `<body>`
   before AND after the tap, and focus still returned to the tile. The old
   `activeElement` fallback would have dropped a keyboard user from row nine to the
   top of a 3500px page. **CLAUDE.md said loop 5 could not test this.** It can.
5. **THE 22 LORE HREFS ARE BUILT ON THE SERVER AND THE TILE IS `prefetch={false}`.**
   A client component cannot compute a locale-prefixed path (no locale prop is
   drilled anywhere), and 22 default-prefetching `<Link>`s in one grid would be 22
   RSC payloads for `ƒ` pages nobody asked for, on the page whose Core Web Vitals a
   crawler measures. The `<a href>` in the HTML is unaffected, which is the point.
6. **THE 240px THUMB IS UPSCALED 1.15x-1.44x ON EVERY PHONE AND THAT IS INTRINSIC
   TO 2x11.** The grid draws at 138-173 CSS px; a 2-column phone grid cannot be
   served losslessly by a 240px source at ANY column width. Accepted -- the
   alternatives are 3.7MB of full art or a new variant. `tools/normalize_cards.py`'s
   `THUMB_W` comment carries the arithmetic.

**`gallery.card.alt` IS THE ONE CATALOG VALUE WHOSE OUTPUT IS INDEXED CONTENT**, and
`alt.ts` derives 22 distinct sentences per locale from it plus `cards.json` -- 44
hand-written sentences in the catalog would ship to every visitor of every page
(S-D6/I9). The word ORDER differs per locale on purpose: `kartu tarot the moon`
against `the moon tarot card`.

**`arcana.upright` / `arcana.reversed` ARE DELETED.** The two orientation words are
`card.upright` / `card.reversed`, because THREE surfaces render them -- the draw
screen's overlay, this zoom sheet and the lore page's section headings. S3's delta 18
asked S4 for that before either shipped; S4 minted its own pair while `card.reversed`
had existed since W6, and the gallery would have been the third spelling.

**`referrer_kind` WAS THE LITERAL `'direct'` ON TWO PUBLIC SURFACES.** It is the prop
separating an organic arrival from a reader already on the site -- §1's whole
question -- and a constant reads as data. `TrackView` could not have got it right:
its props come from a server component, where `document.referrer` does not exist.
`PublicPageViewed` is the fix and all three surfaces mount it.

**S5 LANDED HOURS AFTER THIS SECTION WAS WRITTEN AND CLOSED TWO OF ITS THREE OPEN
ITEMS.** The paragraph here said *"no wallpaper download is mounted"*; S5 mounted
`WallpaperDownload` in `GalleryGrid`'s zoom sheet at the placement S3 had recorded
for it, added `.downloadSeam`, wrote clause 9's licence grant into
`terms.{id,en}.tsx`, and `images.ts` therefore now claims `licenseUrl: /terms#9`
honestly. **Do not read this section as if the download were still absent.**

**Still open:** `contentUrl` is STILL the 800x1200 WebP rather than the 1024x1536
wallpaper, and S5 left it deliberately with the argument in `images.ts` -- the node
describes ONE binary, so moving `contentUrl` without `url`, `width`, `height` and
`encodingFormat` leaves a node whose declared dimensions belong to a different file,
and moving all four means editing S4's `jsonld.ts` in the same commit and changing
the image identity of 22 pages. Worth doing as one change, by whoever owns both.
And the `s-maxage` on this route is measured locally, never against a Vercel CDN
(R21).

## Moved from CLAUDE.md: Wallpaper downloads (v0.4.0 / S5)

#### Wallpaper downloads (v0.4.0 / S5)

**Twenty-two pieces of commissioned art, downloadable, free, with no account** — the
one thing in this release a competitor cannot copy, handed to the reader. Two
derivatives per card, committed; a control in the gallery's zoom sheet; a licence in
clause 9. The measurements, the negative controls and the harness findings are in
`docs/workstream-notes.md`.

```
tools/make_wallpapers.py    THE PIPELINE. Idempotent, byte-identical on re-run.
tools/check_wallpapers.py   THE ORACLE. Holds its OWN table, dimensions, thresholds.
public/wallpapers/          44 JPEGs, 23.77MB, committed. `npm run wallpapers`.
src/lib/wallpaper.ts        PURE, CLIENT-IMPORTABLE LEAF. No process.env, no version.
src/components/WallpaperDownload.tsx  'use client'. Two anchors, one event.
src/components/wallpaperDownload.ts   PURE. chooseMethod, the one policy decision.
tools/seo/wallpaperfit.{sh,js}        Loop 4, committed beside galleryfit.
```

##### The six things a future session will otherwise undo

1. **NOTHING IS UPSCALED AND NOTHING IS CROPPED, AND THE TRAP IS INSIDE THE FUNCTION
   THAT LOOKS RIGHT TO REUSE** (S-D9, W-D7). `normalize_cards.py`'s `fit_to_ratio`
   trims a dark mat and then scales the result to the target, so if `trim_dark_mat`
   ever removes 4px it LANCZOSes 1020 → 1024 — the exact upscale S-D9 forbids, from
   the shipping pipeline's own helper. `make_wallpapers.py` uses
   `flatten`/`trim_dark_mat` as an **assertion** and then reads the untouched source
   pixels. A source that fails the assertion is a source to fix.
2. **`/wallpapers/*` IS DELIBERATELY NOT `immutable`, AND IT SHIPPED WRONG ONCE.**
   §6.4 gives S5 the declaration and S1 the pen; the entry was first written from
   `/cards/*`'s reasoning as a year of `immutable`, and `headers.test.ts` asserted it.
   The traffic shape is the opposite one: the fan pulls 22 thumbs on every cold draw,
   a wallpaper is fetched **once** by somebody who tapped a button. So
   `max-age=86400, stale-while-revalidate=604800`, which is also why these filenames
   carry no `?v=` and `src/lib/wallpaper.ts` has no `ART_VERSION` to forget.
3. **JPEG, NOT WEBP, AND IT IS NOT AN OVERSIGHT.** WebP q90 is 24% smaller at matched
   fidelity (measured). The one thing a wallpaper must do is reach the iOS Photos
   library, because *Set Wallpaper* reads from nowhere else, and iOS's WebP story in
   that pipeline is version-dependent. 6.6MB of git is not worth a download button
   that silently does nothing on the platform this app is built for. Same file: 4:4:4
   rather than 4:2:0, because the deck's signature is a thin gold hairline.
4. **THE ANCHOR IS THE CONTRACT; `navigator.share` IS AN UPGRADE**, gated on
   `canShare({files})` **and** `(pointer: coarse)` and never on a user-agent string.
   On iOS `<a download>` lands the file in Files while *Set Wallpaper* reads Photos;
   on a desktop, hijacking a download into an OS share sheet is worse than the
   default. **A cancelled share sheet records NOTHING** — recording it makes every
   download figure an intent figure.
5. **NO `content-disposition` ON THAT PATH** (W-D10). It would force a download and
   make the image impossible to *view*, and viewing is the precondition for iOS's
   long-press → Add to Photos, the fallback when the share sheet is unavailable.
   Verified in a real browser: navigating to the URL renders it, `1440×3120`.
6. **THE ORACLE HOLDS ITS OWN EXPECTATIONS** (W-D6) and asserts the backdrop colour
   with a **tolerance**: `#0a0812` goes in as (10, 8, 18) and comes out as
   (10, 8, 19) on every card, because JPEG's DCT quantization moves it. An oracle
   written with `== (10,8,18)` fails on correct output, and what somebody does then is
   delete the check. Its flatness check is `check_card_art.py`'s
   `EDGE_UNIFORM_STDDEV` **in reverse** — there a flat edge strip means the source is
   not full bleed and fails; here it is the proof the card was padded rather than
   scaled to fill. Same instrument, opposite verdict; do not "fix" either to agree.

**`wallpaper.downloaded` CARRIES `{ card_id, variant, method, from }`**, and the
declaration was folded into `events.ts` narrower than S5 wrote it — `method` and
`from` dropped, `card` renamed `native`. Restored, with the reason in the file:
`variant` must be spelled like the file on disk, `method` is the only way to see
whether the iOS upgrade runs in production, and `from` mirrors
`public.card_zoomed`'s `surface`. S-D13 makes S1 the owner of that file and everyone
else a declarer; **folding a declaration in means transcribing it.**

**Still open:** loop 6 — a real iPhone — is the only instrument for the three
questions that matter, and none of them is answerable here: does a downloaded
`-phone.jpg` reach Photos and does *Set Wallpaper* accept it (a release blocker), does
the card look right on a lock screen, and is q90 blocking visible in a dark gradient
on OLED (`QUALITY = 92` in one place, +2.9MB). S4 may mount this control on a lore
page and has not; `from: 'arcana'` exists for that day.

## Moved from CLAUDE.md: The blog (v0.4.0 / S6)

#### The blog (v0.4.0 / S6)

**Two articles, four documents, and the last 404 in the release's route table is
closed.** `/blog` and `/blog/[slug]` are the only v0.4.0 surface whose subject is
prose rather than a card, and they are where a stranger who has never touched a deck
lands. The traps, the measurements and the deltas from S6's plan are in
`docs/workstream-notes.md`.

```
src/content/types.ts        GAINED Inline, Phrasing, BlogDoc, and three OPTIONAL
                            widenings to Block. S4 above the marker, S6 below.
src/content/blocks.ts       PURE, NO `server-only`. Ten authoring helpers.
src/content/blog/index.ts   the registry. NO PROSE. dates, locales, bodyHash.
src/content/blog/<slug>.<loc>.ts   4 documents, 1270-1995 words each.
src/content/blog/blog.content.test.ts   THE LINT. 36 cases, before the copy.
src/lib/content/doc.ts      PURE LEAF. plainText / phrasingText / wordCount /
                            readingMinutes / headingIds / linkPaths / linkKind.
src/lib/seo/blog.ts         BlogPosting + Blog + both graphs. Into S1's directory.
src/components/Prose.tsx    GAINED spans(), <ol>, and heading ids. S4's file.
src/app/blog/**             the index, the article, its 404, the contract test.
tools/seo/blogfit.{sh,js}   Loop 4, committed beside galleryfit and wallpaperfit.
```

##### The six things a future session will otherwise undo

1. **`plainText()` JOINS SPANS WITH THE EMPTY STRING, AND THAT IS THE CONDITION
   RECONCILIATION R16 ATTACHED TO WIDENING THE UNION AT ALL.** S4's `text: string`
   existed so the copy lint sees the exact sentence a reader sees, and that argument
   is the better-stated one; it bent only because an article cannot carry bold
   lead-ins or inline links without `Inline[]`. Two tests make the guarantee
   mechanical rather than promised — `doc.test.ts` asserts the joining directly and
   `blog.content.test.ts` asserts span adjacency, negative-controlled. **R16 says in
   those words: if either is deleted, revert to `text: string`.** A `join(' ')` in
   `plainText` or a `{' '}` in `Prose` breaks both silently.
2. **`heading.id` AND `list.ordered` ARE OPTIONAL, AND THAT IS WHY 44 LORE DOCUMENTS
   NEEDED NO EDIT.** `types.test.ts`'s *"a list carries no ordering"* case is
   **inverted rather than deleted**: its reason was right about lore and wrong about
   the union. Making either required is a 44-file rewrite for no reader-visible gain.
3. **THERE IS NO `callout` KIND. S6 ASKED AND R16 REFUSED** — on S6's own
   recommendation that it was the ask to refuse first. The two asides in the launch
   article are paragraphs and read correctly as one. `types.contract.test.ts` asserts
   the absence, because the failure mode of a refused ask is somebody granting it
   quietly.
4. **`bodyHash` IS MANUAL BOOKKEEPING AND SOMEBODY WILL WANT TO DELETE IT.** Editing
   the prose fails a test whose fix is pasting a hash and bumping a date. There is no
   truthful automatic source for `dateModified` — an mtime is a checkout artefact on
   Vercel, `git log` is unavailable at request time, and either moves on a whitespace
   change. Reconciliation §7 ruled on it directly: **the honest alternative is
   dropping `dateModified` from the structured data, never emitting a date nobody
   maintains.**
5. **THE ARTICLE PAGE PASSES `entry.locales` AND THE INDEX PASSES `LOCALES`, AND THE
   DIFFERENCE IS NOT AN INCONSISTENCY** (R2). The index is chrome served by one
   rewritten route file, so neither address can 404. An article's `hreflang` must name
   only the languages it was written in, or Google discards the whole set silently.
   Both articles ship in both locales today, which is exactly when somebody
   "simplifies" the first one. `blog.contract.test.ts` asserts the two spellings.
6. **THE SECOND ARTICLE'S SLUG IS ENGLISH AND SINGULAR, AND THE RECONCILIATION WROTE
   IT AS TWO.** R5 named it *"`apa-itu-tarot` / `what-tarot-is`"*, which reads as one
   slug per locale. It cannot be: `contentAlternates()` derives the `/en/` twin from
   **one** bare path, so a per-locale slug needs a per-locale path table nothing in
   this release has. `what-tarot-is`, in both trees — the same ruling that kept
   `/history` from becoming `/jejak`.

**TWO ARTICLES, NOT ONE, AND THAT IS RECONCILIATION R5 CLOSING ROADMAP §13.** S6's
plan shipped one and flagged the reason it should be two: a link labelled *"apa itu
tarot"* landing two-thirds of the way into a 2,000-word how-to is a compromise, not a
design. Jodith's request — *"ttg mitos, fakta, tarot itu apa, manfaat apa"* — got its
own page. **Both articles carry `#what-tarot-is`, `#myths-and-facts` and
`#what-its-for` in both locales**; R5 moved the *links* onto the new article, it did
not take the sections out of the how-to, which would leave a how-to that teaches a
method without first saying what the thing is.

**THREE THINGS S6's PLAN ASKED FOR THAT ARE DELIBERATELY ABSENT, ALL BECAUSE S1
CLOSED `events.ts` FIRST (S-D13).** No `ScrollDepth` — `content.scrolled` is not in
the folded taxonomy. No delegated in-prose link listener — `public.link_clicked`'s
`to` union has no `anchor` member, so wiring one means widening a closed workstream's
data dictionary for an in-page jump. And no `content.share.*` catalog pair — S1's
`public.share.*` already exists and `PublicShare` renders it, so a second pair would
be two words for one button. In-prose link clicks are unmeasured, exactly as they
already are on the 44 lore pages; `linkKind()` survives in `@/lib/content/doc` as the
single definition for the day somebody wants it.

**THE MEASURE AT 320px IS ~32 CHARACTERS AGAINST THE 45-75 GUIDELINE, AND IT IS
ARITHMETIC RATHER THAN A DEFECT** (reconciliation §7, S6 F4). 288px of content at
~9.1px per character in Cormorant Garamond at 19px cannot reach 45; getting there
needs ~14px type, too small for two thousand words of serif. The lever used is
padding, 20 → 16. **The next person to read the guideline will reach for a new
font-size token; §10 forbids one without a written reason and `tools/seo/blogfit.sh`'s
measurement is the reason not to.**

**TWO THINGS `blogfit.sh` FOUND IN `PublicShare`, AND BOTH ARE S1's FILE ON
TWENTY-THREE PAGES RATHER THAN S6's.** Its button is **36px tall at every width**,
under the 44px iOS minimum. And it **renders in the server HTML, so with JavaScript off
the control is present and dead** — which is the state S6's plan flag 5 said must not
ship and which **reconciliation §7 records as already settled the other way**
(*"The share control is invisible without JavaScript"*). It is not; there is no
`mounted` guard. Left alone deliberately (§6 file ownership) and written up in
`docs/workstream-notes.md`, because a reconciliation stating a property the code does
not have is worse than an open item — nobody goes looking for it.

**AND THE FINDING THAT IS BIGGER THAN THIS WORKSTREAM: NO PUBLIC CONTENT ROUTE IS CACHED
IN PRODUCTION, AND R21 IS CLOSED WITH THE ANSWER "NONE OF IT".** Measured on the real
Vercel CDN, 2026-07-29: `/blog`, `/en/blog`, both articles in both trees, `/gallery`,
`/en/gallery` and `/arcana/<slug>` in both trees **all** answer
`private, no-cache, no-store, max-age=0, must-revalidate` with `x-vercel-cache: MISS` on
two consecutive fetches. **All eight content entries in `next.config.ts` are inert — 54
indexable pages** — and S-D10's whole argument for `s-maxage` over multiple root layouts
buys nothing today.

**THE DISCRIMINATOR IS THE MIDDLEWARE MATCHER, and the contrast is clean:**
`/wallpapers/*` and `/cards/*`, which the matcher EXCLUDES, get their configured headers
verbatim (`max-age=86400`, `immutable`), and `/robots.txt` and `/sitemap.xml` come back
`x-vercel-cache: HIT`. On a matched path every OTHER config header arrives — CSP,
`referrer-policy`, `x-frame-options` — so `headers()` runs and `cache-control` alone loses
to the rendered response. **`headers.test.ts` asserts the eight entries EXIST, which they
do, and no config-level test can see this**; `curl -D -` against a deployed URL is the
only instrument. **An intermediate `npx next start` measurement said only the `/en/` half
was broken — that was a local artifact and `next start` is not Vercel.** The diagnosis, the
one-line candidate fix in `src/middleware.ts`'s existing content-response block, and why
S6 left it to S1/S2 are in `docs/workstream-notes.md`.

**Still open:** No RSS (S6 F10,
out of scope and the only excluded feature that costs nothing to maintain). And nobody
has read either article on a phone — reconciliation §8's *"no lint can tell whether a
page is worth reading"* binds these two documents exactly as it binds the 22 lore
pages.

## Moved from CLAUDE.md: /account and the persona (V8)

#### /account and the persona (V8)

**The button `/privacy` §8 described for a whole release now exists**, and so do the four blocks
requirements 1–4 asked for: the three editable facts, the card that keeps arriving, the reader
whose path opened, and a generated four-sentence reading *of the person* in house voice. Plus
per-answer clearing, which `/privacy` promises twice in both locales and nobody could perform.
The three defects a green build did not notice, the two near-misses, the live deletion round trip
and the measurements are in `docs/workstream-notes.md`.

```
src/lib/account/delete.ts      the deletion TRANSACTION (VD13). Handle first.
src/lib/account/grace.ts       LEAF. ERASURE_GRACE_DAYS, re-exported by profile.ts.
src/lib/persona/prompt.ts      server-only. PURE: contracts, hash, facets, checks, fallback.
src/lib/persona/generate.ts    server-only. The model call, the write, readPersonaView.
src/lib/persona/lines.ts       PURE, CLIENT-IMPORTABLE. ALL_TIME_GATE + the two templates.
src/lib/db/queries/persona.ts  get/upsert. `updated_at` BY HAND.
src/lib/db/queries/allTime.ts  topCard / topReader / readingCount / recentReadingIds.
src/app/account/**             the page. Four server reads, one client fetch.
src/app/api/account/route.ts   DELETE. Clears the session cookie by name.
src/app/api/account/facts/     PATCH. upsertProfileFacts's FIRST caller.
src/app/api/persona/route.ts   GET. BUFFERED, not streamed.
src/components/{DeleteAccount,AccountFacts,AccountAnswers,PersonaBlock}.tsx
src/components/AccountCard.tsx  the card, with its name and its zoom. CLIENT.
```

**FIVE THINGS CHANGED ON THIS PAGE ON 2026-07-28, ALL OF THEM MIFTAH'S RULINGS ON A
PHONE, AND FOUR OF THEM REVERSE A DECISION THIS FILE OR THAT CODE ARGUED FOR.**

- **THE CARD WEARS ITS NAME AND OPENS A ZOOM.** `AccountCard` mounts `CardFace` +
  `CardDetail` where a bare `<img>` used to be. The old comment argued `CardFace` was
  "deliberately NOT reused: the sentence beside this image already names it" — a real
  de-duplication argument that lost, because the sentence names the card mid-clause in
  prose and every other 88x132 card in the product wears its name, so the one that did
  not read as the one that failed to load its label. **The `next/image` constraint that
  comment recorded is UNCHANGED and is satisfied rather than dodged**: `cardThumb`
  appends `?v=`, `next/image` refuses a local `src` with a query string when no
  `images.localPatterns` is configured, and `CardFace` uses a plain `<img>` anyway.
  `reversed` is `topCardReversedDominant`, **hoisted to one `const` because it now has
  two readers** — the gloss and the artwork, which must never disagree.
- **THE 2:1 READER PORTRAIT IS GONE, AND THE NAME IS A LINK TO `/{reader.id}`.** A
  landscape SCENE cropped to a 120px stamp is 60px tall: too small to read as a place,
  wide enough to cost a third of the block on a 360px screen. `linkifyName` splits the
  rendered line so the catalog value stays one sentence a translator can read — **the
  string is the single source of truth and the segments are derived**, because
  `{ before, name, after }` would be two representations of one sentence.
- **THE THREE READERS HAVE FIXED GENDERS: Thessaly female, Margaret female, Adrian
  male.** `readers.json`'s `gender` (a two-value union, so a new reader cannot omit it)
  meets `reader.pronoun.{female,male}` in exactly one place, `readerPronoun()`. **The bug
  was "Thessaly refers to herself as they"** — the neutral singular is right for a person
  whose pronouns are unknown and wrong for three authored characters whose `bio.en` has
  said `She`, `Her` and `He` since the first release, so the page and the picker
  disagreed about the same three people. **Indonesian renders `dia` for both keys and
  that is not a stub**; `lines.test.ts` asserts the pair matches AND that it is not
  English, and cross-checks `gender` against the pronouns in each `bio.en`.
- **`account.facts.nickname` IS "Nickname" IN ENGLISH, REVERSING ITS OWN COMMENT.** It
  said *"What you are called" rather than "Nickname": the questionnaire asked what the
  reader should call them.* `.label` is `text-transform: uppercase`, so that rendered as
  `WHAT YOU ARE CALLED` over TWO ROWS beside a one-word value. The Indonesian
  `Nama panggilan` never had the problem and is unchanged.
- **THE ACCOUNT MENU HAS SIX ITEMS SINCE 2026-07-29, AND `AccountMenu`'s HEADER
  USED TO FORBID A FIFTH.** `Galeri kartu` and `Tulisan` sit **below Reading
  History**; v0.4.0's public footer had rendered them on the landing page and under
  all 22 lore pages, and Miftah's ruling on a phone was that the homepage and the
  card pages should look clean. The comment saying *"DO NOT ADD A FIFTH without a
  decision recorded against VD12"* is **inverted rather than deleted** -- it is
  still right about the case it was made for, which is a SHARE control. Their own
  `account.menu.*` keys, never a reuse of `public.footer.{gallery,blog}`: a footer
  names a destination to a stranger and this sheet names it to somebody signed in.
  **`PublicShell`'s `LINKS` table is DELETED, not emptied**, and deleting the filter
  with it let the landing page's footer grow a link to ITSELF -- caught by
  `PublicShell.test.ts`, not by eye. The crawl was re-measured: nothing is orphaned,
  because `sitemap.xml`, `hreflang`, `/gallery`'s 22 links and each lore page's own
  `arcana.gallery` were always what a crawler follows.
- **THE PAGE HAS A WAY OUT.** `history.home` and not a new key — the same gap `/history`
  closed one release earlier, and in a standalone home-screen instance there is no
  visible back button at all.

- **`redactForUser()` AND `revokeAllForUser()` RUN IN THE SAME TRANSACTION THAT SETS
  `deleted_at`, IN THAT ORDER** (VD13, reconciliation §5.6). `moderation_flags.user_id` is
  `on delete set null` and `share_links.user_id` cascades only at the HARD delete thirty days
  later, so both rows outlive the soft delete — a self-harm disclosure and a public URL. Redaction
  runs BEFORE the flag so a failure aborts the whole thing rather than marking an account deleted
  with its text intact. **`clearFreeTextAnswers()` is deliberately NOT in there**: the asymmetry
  with `moderation_flags` is the asymmetry in the foreign keys, and clearing it now would break the
  thirty-day restore the confirmation copy promises.
- **THE ROUTE CLEARS THE SESSION COOKIE ITSELF, BY NAME.** There is no server-side revocation on
  the JWT path, so a session surviving the soft delete keeps returning the querent's data — and a
  client-side `signOut()` that fails leaves exactly that. `SESSION_COOKIE_NAME`, never a literal:
  Auth.js prefixes `__Secure-` on https, so a typed name clears the wrong cookie in production
  only and looks correct locally.
- **THE STALENESS THROTTLE IS ON THE READ PATH AND NEVER INSIDE `generatePersona`** (A13).
  `input_hash` covers the last ten reading ids — which is what makes the persona MOVE as the
  querent reads — so it changes after every draw. A throttle on the *reader* is a latency
  decision; a throttle inside the *generator* is W3's swallowed answer-edit bug. **A facts edit
  and a cleared answer both call `generatePersona` DIRECTLY.** A source-version mismatch is not
  throttled at all.
- **`personaInputHash` HAS NO LOCALE AND `personas.facts` IS LOCALE-FREE.** If either carried one,
  tapping `EN` would regenerate the persona and replace the prose the querent just read — and V2's
  translation, whose whole purpose is that switch, would never be used.
- **THE PERSONA PROMPT NEVER RECEIVES A RAW ONBOARDING ANSWER** (A5). It gets the engine facts
  (machine-built), the closed values (closed sets) and the Lotus summary (model output
  `lotusSafetyCheck` already passed). D10's abstraction rule enforced by CONSTRUCTION rather than
  by prompting, and `prompt.test.ts` asserts it with a canary. `<sosok>` is the sixth fence and is
  defence in depth *because* of that — say so, or somebody reads the fence as evidence the block
  carries raw text, or deletes it along with the rule that made it unnecessary.
- **`/api/persona` BUFFERS AND MUST NOT STREAM** (reconciliation §5.8, amending roadmap §6). A
  safety check that runs before the first byte means the body is buffered anyway; declaring it a
  stream is a lie in the type and an invitation to delete the check.
- **THE TWO TEMPLATED LINES ARE NOT GENERATED, AND THE REASON IS REGISTER** (A8).
  `frequency_verdicts` is generated because it recurs on the picker daily; `/account` is visited
  occasionally and its subject is IDENTITY, which should be stable. A line that rephrased itself
  every visit would undercut the claim it is making.
- **`lines.ts` IS THE ONE PERSONA MODULE WITHOUT `server-only`**, and `clientBoundary.test.ts`
  fences `@/lib/persona/**` with exactly that exception plus an assertion that it carries no
  contract prose. Same shape as the prompt layer's `sanitize` exception.
- **NO NEW INDEX** (A12). `reading_cards_user_date_card_idx`'s leading column serves an unbounded
  per-user aggregate, and the test proves it with `enable_seqscan = off` — because at forty rows
  the planner seq-scans one page and is right to.
- **A CARD NAME IS STRIPPED BEFORE THE NAME CHECKS.** The contract requires the life-path arcana's
  English name, so a querent nicknamed `Star` or `Moon` would otherwise have every generation
  rejected and see only the fallback, silently.
- **`answerPresence` DECRYPTS NOTHING** and there is no reveal control on the page, so
  `worst_thing`'s plaintext never leaves the server. The six are deletable and **not** editable
  (L13); the three facts are the other way round.

**V2's TRANSLATOR IS WIRED TO THE PERSONA SINCE 2026-07-28, AND FIXING IT EXPOSED A LATENT
BUG THAT MADE EVERY PERSONA TRANSLATION FAIL.** `/account` no longer shows Indonesian prose
inside an English page: `PersonaBlockClient` posts `{ entity: 'persona', entityId, field:
'body' }` to `/api/translate` and streams the result, exactly as `HistoryDetail` does for a
reading. Four things to know before touching it:

- **THE FIX FOR AN UNTRANSLATED PERSONA IS A TRANSLATION, NEVER A REGENERATION.** A
  foreign-locale body is not stale, it is untranslated — regenerating would overwrite the
  original the translation derives from and make `personas.locale` record a language the
  querent never chose. That is the whole reason `personaInputHash` carries no locale.
- **`TRANSLATABLE['persona.body'].budget` WAS `'summary'` AND IS NOW `'persona'`.**
  `'summary'` resolves to `SUMMARY_MAX_WORDS` (50); a persona is `PERSONA_MAX_WORDS` (95).
  `ceilingFor` feeds the PROMPT *and* `verifyTranslation`, so the model was told to squeeze a
  95-word paragraph into 50 words and then judged against 50. Measured live: a correct 88-word
  English translation, rejected `kind: 'budget'`, never persisted, **a fresh model call on
  every single page view.** Invisible for two releases because nothing translated a persona.
  `contract.test.ts` now asserts the RESOLVED number, not the tag's spelling.
- **`/api/persona` RETURNS `entityId` AND `translation`.** `entityId` is the querent's own
  `users.id` — `personas.user_id` is the primary key, so it *is* the entity id — and holding
  your own id grants nothing, because `/api/translate` independently matches the session user.
  `translation` is a server-side cached read, **staleness-checked against
  `personas.updated_at`**, which `/history/[id]`'s equivalent deliberately does not do because
  a reading's body is immutable and a persona's is regenerated after every draw.
- **`account.persona.otherLanguage` SURVIVES AS THE FAILURE STATE**, not the normal one: V7's
  session-less share mount, and a translation that 204'd, errored or fell back. It is gated on
  `prose.kind === 'as-written'` as well as on the locale mismatch — without the first half a
  successfully translated persona would still carry "written in another language", which is the
  bug that got the `/s/` reading notice deleted.

**Still open:** `GET /api/persona` 500s when the database is down rather than 204 — the same
omission `/api/memory/{frequency,summary}` carry, and all three should be fixed together; V7
does not mount the persona on `/s/`; `PERSONA_MIN_AGE_SECONDS=3600` is a guess;
`account.details_viewed` always reports `from: 'direct'`.

## Moved from CLAUDE.md: Trust, safety and secrets (W7)

#### Trust, safety and secrets (W7)

A moderation gate that refuses harm without refusing tarot, two legal documents, and a
tripwire that fails the build if a prompt or a key ever reaches the browser. The traps, the
classifier measurements and the audit's negative control are in `docs/workstream-notes.md`.

```
src/lib/moderation/
  types.ts       CLIENT-IMPORTABLE. CATEGORIES, CLAUSE_FOR, RefusalPayload.
  resources.ts   CLIENT-IMPORTABLE. Crisis hotlines, each with verifiedOn.
  blocklist.ts   server-only. Two tiers, exemptions-as-mask, two haystacks.
  classify.ts    server-only. One English prompt, temperature 0, 48 tokens.
  gate.ts        server-only. screenSync -> prime -> race -> decide.
  log.ts         the moderation_flags writer + the lazy redaction sweep.
src/components/RefusalNotice.tsx     the 403, rendered. Never a reader's voice.
src/app/terms|privacy/               17 clauses, 12 sections, both locales.
src/app/api/cron/sweep/route.ts      ONE job, THREE deletes.
scripts/audit-secrets.ts             the tripwire. Runs inside `npm run build`.
scripts/probe-moderation.ts          how the model and the timeout were chosen.
```

**The gate refuses HARM, not SENSITIVITY. This is the product judgement everything else
falls out of, and the one a future session is most likely to undo by "tightening" the
list.** Tarot's actual subject matter is grief, illness, money trouble, divorce, a dying
parent, a partner who has become frightening. If the gate refuses those, there is no app
left; refusing `haruskah aku pergi dari suamiku yang kasar` reads as "even the tarot app
will not touch this", which is an active harm. Eight categories where **the answer itself
would be the harm**, plus `other` and `unclear`. The ALLOW section of the classifier prompt
is longer than the FLAG section on purpose and a test asserts it stays that way. **A false
positive is an accusation delivered to somebody who did nothing wrong**, with no appeal path
in a streaming UI — hence Tier A is small and proximity-anchored, and every pattern has a
near-miss test written first.

1. **`MODERATION_MODEL=glm-4.5-flash` IS A PRODUCTION REQUIREMENT, NOT A COST
   OPTIMISATION.** D8's premise is that the classifier returns before the reading's first
   token; on the reading model that is false (p95 7546ms against a p50 TTFT of 4591ms) and
   the gate becomes the latency. Unset falls back to `LLM_MODEL` and silently reintroduces
   it. `MODERATION_TIMEOUT_MS=1500` comes from the same measurement.
2. **The gate PRIMES the reading before awaiting the verdict.** `iterator.next()` in
   `gateReading` issues the HTTP request; deleting it looks like a tidy-up, breaks nothing,
   logs nothing, and doubles every reading's latency forever.
3. **`.next/server/chunks/**` IS EXCLUDED FROM THE AUDIT ON PURPOSE** — the base contract
   legitimately lives there, and a scanner that flags it gets switched off within a week.
   Same reasoning excludes `moderation/types.ts` and `resources.ts` from needling.
4. **`x-frame-options: SAMEORIGIN`, and `frame-ancestors 'self'`, never `DENY` / `'none'`.**
   A security checklist will say otherwise; `DENY` kills a dozen committed iframe harnesses
   under `public/cards/` while blocking nothing SAMEORIGIN does not.
   `src/lib/headers.test.ts` asserts both.
5. **Nothing unverified enters `resources.ts`, and no number lives anywhere else.** A
   hotline is the one string here where being out of date is a safety failure. Warn at 180
   days, FAIL at 365.
6. **T&C clause 6's sub-numbering is an interface.** The refusal renders `/terms#6-2` and
   `CLAUSE_FOR` is the map; renumbering breaks the link silently, for somebody who has just
   been refused. `src/app/legal.test.ts` fails on it.
7. **The blocklist runs BOTH locales' patterns under both locales** (W7-D3 said otherwise).
   `locale` is the UI preference, not a declaration of what language the querent types.

**Still open, and none of it is code W7 could write:** clauses 10–12 need a lawyer; the
Jakarta district needs confirming against PT Citra Suka Buana's deed (one string in
`src/app/terms/operator.ts`); `findahelpline.com` and `112` are unverified and absent from
`resources.ts`; Vercel's log retention is unverified.

**THERE IS NO HARD SPEND CAP AT Z.AI AND THERE WAS NEVER GOING TO BE** — `LLM_API_KEY` is a
fixed annual subscription sold for coding, not a wallet. V9 replaced the idea with a
fleet-wide Upstash limiter, `LLM_WINDOW_CALL_CEILING`, and query 9. **The risk is now quota
exhaustion, which is a denial of service against the querent with no billing alert
attached.** **And the comedown is worse than the cap was:** the same FAQ says the Coding
Plan is *"strictly limited to use within officially supported tools and products"*, and
JMTarot is not one — the consequence of enforcement is **key revocation, which takes the
whole app down at once.** `src/lib/llm/openai.ts` is the answer and is built, tested and
measured; it is NOT switched on, because reader overlap on `spread3` goes 0.050 → ~0.086.

## Moved from CLAUDE.md: Translation (V2)

#### Translation (V2)

Every piece of generated prose records the language it came out in, and a language switch
**translates** what already exists instead of showing Indonesian text inside an English app.
Traps, the register measurement and the verification commands are in
`docs/workstream-notes.md`.

```
src/lib/translate/
  keys.ts        LEAF. TRANSLATABLE, the entity/field unions, isTranslatableKey,
                 TRANSLATION_PROMPT_VERSION. NO prompt layer, NO server-only --
                 `queries/translations.ts` imports it, and rule 3 of that directory
                 forbids acquiring the marker even transitively.
  contract.ts    PURE. sanitizeSource, namesIn, verifyTranslation,
                 buildTranslationPrompt. Carries prompt prose -> fenced from the client.
  translate.ts   server-only. translateOrCached, translateStream, the repair pass.
src/lib/db/queries/translations.ts   get/put/deleteFor/deleteOrphans/resolve.
src/app/api/translate/route.ts       POST. Streams iff the registry says so.
```

**Call `translateOrCached()` or `translateStream()`. Nothing else.** `putTranslation` has
exactly one caller, because it is the only place verification happens and an unverified row
in that table is the whole failure the workstream exists to prevent.

1. **`<terjemahan>` is a fifth fence, not a locale variant** (R17). What it fences is model
   output that was itself generated from user text, handed to a second model as material,
   with the result going straight to a screen. The Indonesian-looking token is deliberate.
2. **The card-name check is MECHANICAL, not only a prompt rule.** Card and reader names are
   English in both locales, so the invariant is direction-symmetric and exactly checkable
   with `includes()`; the prompt rule alone produced "Pulan" for The Moon. `namesIn` is
   case-sensitive and word-bounded, because a false violation costs a CORRECT translation
   its cache row.
3. **REPAIR, DO NOT BUFFER.** A dirty generation is never persisted; the viewer sees it once
   and a `defer()`ed repair pass lands in the table. Buffering to verify before the first
   byte trades VD8 away for every translation to protect the failing minority. **If the
   measured `invalid` rate exceeds ~2%, fix the prompt, not the architecture.**
4. **Staleness is `translations.updated_at < source.updated_at`, and there is no
   `source_hash` column.** `putTranslation` sets `updatedAt` BY HAND inside
   `onConflictDoUpdate` — `$onUpdate()` does not fire there, and for this table that column
   is the entire mechanism.
5. **`users.locale_source` NULL means `'chosen'`.** Read it through
   `effectiveLocaleSource()`, never raw: every pre-v0.3.0 row is NULL and those users may
   well have pressed the toggle. `raw ?? 'default'` is what a reasonable person writes
   without the helper, and it would license overwriting exactly those preferences.
6. **A `ReadableStream`'s `pull()` IS NOT IN A REQUEST SCOPE, AND `translateStream` HAS TO
   CAPTURE ONE.** `settle()` always runs after the first chunk, so it always ran inside
   `pull()` — outside the ALS context that built the stream and outside any request — and both
   `track('translation.generated')` and the `defer()`ed repair pass died on `` `after` was
   called outside a request scope ``. **Every streamed translation lost its event and its
   repair, silently, for as long as V2 had shipped**, which is why the ~2% rule above could
   not be followed: the measurement was not being written. The fix is
   `bindAnalyticsScope()` in `@/lib/analytics/track`, called **synchronously inside
   `translateStream`** — the one line guaranteed to still be in the handler — wrapping every
   reporting site in `iterate()`. It registers the request's `after()` eagerly, because
   otherwise a later `track()` would be the first one and `ensureRegistered` would throw from
   `pull()` all over again. `ensureRegistered`'s own comment records the sibling fact (an
   `after()` callback is not guaranteed to run in the context that registered it, hence
   `drain`'s `als.run`); this is that fact one step earlier. **The unit mock models the scope
   with a depth counter** — Vitest has no request scope, so a mock that only records calls
   cannot see this class of bug, and the suite was green throughout.

**`translateStream` yields the SOURCE VERBATIM on failure and the route returns it as an
ordinary 200** (`TranslateResult.fellBack`) — a caller that renders it as `translated`
breaches `ReadingView`'s rule 4 through the path meant to prevent it. **`POST /api/translate`
takes no `targetLocale`** (V2 resolves it from `getLocale()`; sending one is silently
ignored) **and 204 is a real answer**, so checking only `res.ok` leaves the screen on a
spinner forever.

**Stop the database and open a translated reading.** It must fall back to the source prose
with nothing but a log line: a cache read that fails is a cache MISS, never an error.

## Moved from CLAUDE.md: The data layer

#### The data layer

W1 is done, and W3 is its first consumer.

```
src/lib/db/
  client.ts      the postgres.js client + Drizzle instance. `server-only`. THE ONLY PLACE
                 THE DRIVER IS NAMED. The three knobs its comment block predicted are now
                 SET, for Neon (roadmap D5): max 1, prepare false, ssl require --
                 conditional on `VERCEL`, not NODE_ENV, because a preview build is also
                 NODE_ENV=production. Do not trim that comment.
  types.ts       Db / Tx / DbOrTx. Type-only, no runtime imports, so a query module cannot
                 acquire the singleton by accident.
  schema.ts      the tables. ONE OWNER: W1. Ten at W1; v0.3.0 added `translations`
                 (V2), `share_links` (V7) and `personas` (V8), so thirteen now.
  crypto.ts      AES-256-GCM field encryption, `v1.<iv>.<ct>.<tag>` base64url
  queries/       profile, onboarding, lotus, history, frequency, summary -- one file per
                 read concern; every function takes the handle first. `onboarding.ts` and
                 `lotus.ts` were written by W3 into W1's directory against the interface
                 W3's plan names; no table or column was redefined.
  migrations/    generated, committed. Read its README before adding one.
  testing/       harness.ts (withRollback, resetDb) and globalSetup.ts
```

**W4's writers take an OPTIONAL handle as their last argument**, not their first, because they
are not query modules — `persistReading(row, cards, handle?)` and
`flushEvents(ctx, rows, handle?)` live in `src/lib/analytics/flush.ts` and reach the singleton
through a **dynamic** `import('@/lib/db/client')`. A static import would pull in `server-only`,
which throws under Vitest, and `sanitizeProps` — the function the whole "we keep no text you
wrote" claim rests on — would have no unit test. The optional handle is how the integration
suite passes its rolled-back transaction in.

**The schema is `docs/plans/2026-07-26-RECONCILIATION.md` §3, not the roadmap's §3.** Ten tables,
not nine — `frequency_verdicts` is new, `readings` lost `question_blocked` and gained
`status`/`session_id`/`gist`, and `lotus_avatars.summary_id`+`summary_en` became one
`summary jsonb` keyed by locale.

**If you need a column, it goes in your workstream plan's `## Schema deltas` section and
reconciliation folds it in.** Do not edit `schema.ts` for a table you did not add. Seven agents
inventing `user_id`/`userId`/`uid` is the single most likely way this becomes a mess.

The two dev users are `google_sub = 'dev:miftah'` and `'dev:jodith'`, created by `npm run db:seed`
and **never by a migration** — no migration in this project inserts a row, because a migration
runs in production too and the whole point of those accounts is that they do not exist there.
Nothing was migrated out of `localStorage`; each browser held a `{name, birthDate}` pair, and
onboarding asks for more than that anyway. It will look like data loss and it is not.

Not built, deliberately deferred: birth card, the daily-card lock (`todayKey()` and `birthCard()`
are written), an About page, and a second LLM provider as the default. Onboarding left this list
with W3, the memory features with W5, and the reading-history screen with V6. The route is
`/history`, not `/jejak`, which this paragraph promised for two releases: `Jejak` is the word on
screen and the path stays English like every other one in the app.

**`/account` IS OFF THAT LIST: V8 BUILT IT, AND THE DELETION BUTTON `/privacy` §8 DESCRIBED FOR
A WHOLE RELEASE EXISTS.** This paragraph used to open *"it is the one real gap W7 leaves"* and
is kept, rewritten, because the rule it carried is still the load-bearing one: **`redactForUser()`
runs in the SAME TRANSACTION that sets `deleted_at`**, never afterwards — `moderation_flags.user_id`
is `on delete set null`, so the row outlives the account and a self-harm disclosure would otherwise
sit there for up to thirty more days. `src/lib/account/delete.ts` is the caller and
`delete.integration.test.ts` proves the boundary with a trigger. See `## /account and the persona (V8)`.

## Moved from CLAUDE.md: Onboarding and the Lotus (W3)

#### Onboarding and the Lotus (W3)

Nine screens, asked exactly once: the invitation, all three facts together, the six personal
questions, and a closing card. The word "onboarding" appears nowhere the user can see it.
Traps and the harnesses are in `docs/workstream-notes.md`.

```
src/data/onboarding.ts          the six keys, the closed sets, the pure functions. NO
                                IMPORTS OUTSIDE @/data, so W2's gate can reach
                                `isOnboarded` on the edge.
src/app/onboarding/             the stepper. copy.ts is a STAGING POST for W6's catalog.
src/app/api/onboarding/         facts / answer / complete / answer/[key] DELETE
src/lib/prompt/lotus.ts         PURE: contract, parser, safety checks, fallback
src/lib/prompt/lotus.generate.ts  the model call, the write, the cached read, the cooldown
```

- **`profiles.completed_at` is the only completion marker.** Row presence is not completion
  — the facts row exists from step 1 of 9, and a half-written answer set must never count as
  onboarded and must never be distilled. Gating is the `onb` claim in W2's JWT so nothing
  reads the database per request.
- **The resume point is derived, never stored** — the first key with NO ROW, not the key
  after the last one. A user who goes back to answer something they skipped leaves a gap,
  and resuming past it would skip it forever.
- **A stale `onb` flag cannot be fixed by redirecting.** A server component cannot write
  cookies, so `redirect('/')` from `/onboarding` bounces off middleware's identical stale
  claim and loops. `actions.ts` re-mints first and only navigates when `onb` is actually
  true — the jwt update branch is rate-limited and returns the STALE token when throttled.
- **The completion route reads the answer set back from the database** before setting
  `completed_at`. The client is trusted to say what it answered, never that it finished.
- **THE COOLDOWN MUST NOT GUARD A USER-CAUSED REGENERATION.** `scheduleLotusRefresh`'s ten
  minutes bound the SPECULATIVE repair the reading path fires; the answer route used it once
  and an edit minutes later was silently swallowed, which is the delete button being a lie.
  Write paths call `generateLotus` directly; it is idempotent.
- **A skip is `answer_text IS NULL`, never an encrypted empty string**, which would be
  indistinguishable from a real answer in a dump. The audit query is in `schema.ts` and must
  return 0.
- **If the Lotus ever flattens the three readers, fix the persona paragraphs or the base
  contract's `<penanya>` rule, never the code.** Measured when it landed: mean pairwise
  reader overlap on `spread3` went 0.056 → 0.074, and no reading announced that it knew
  anything.

**The largest unverified risk in the project: signing in with Google from a home-screen
installed instance, in standalone mode.** Navigating to `accounts.google.com` can hand the
user to Safari or an in-app browser, and the session cookie can land in a jar the standalone
shell cannot see. The failure is "sign-in works in Safari and the installed app can never
sign in", which breaks the product's whole delivery model. Only a real iPhone against a
Vercel preview can test it. Also unverified on hardware: touch behaviour, safe-area insets,
Add to Home Screen.

**The domain is `www.jmtarot.site`, bought 2026-07-27 and live** (reconciliation §7.2's
`www.jmtarot.com` was never purchased; the amendment is in §7.2). The apex 308-redirects to
the `www` host — serve one, never both, because an OAuth redirect URI is a string comparison
and `AUTH_URL` pointed at the apex fails the callback after a redirect that looks successful.
Production `AUTH_URL=https://www.jmtarot.site`; Google's Authorized Domain is the registrable
`jmtarot.site`. The consent screen is still in **Testing** mode, so only manually-added test
accounts can sign in. **What blocked publishing was Google's branding requirement of an
app homepage that is not a login page. Signed out, `/` now renders a landing page
(v0.4.0, S-D5), so that blocker is closed**; what remains is pressing Publish on the
consent screen. See `## The public surface (v0.4.0)`.

## Input tokens were always on the wire (2026-07-30)

**The request was a workaround. There was nothing to work around.**

Miftah asked for a client-side tokenizer — tiktoken or similar — to estimate the input
tokens the admin dashboard was missing, because this repository said in about twelve
places that z.ai does not report them. A probe against the live endpoint, run before
writing any code, showed the premise was false.

### What was actually wrong

`anthropic.ts` read `input_tokens` from the `message_start` SSE event. On that wire
`message_start.usage` is a placeholder sent *before the prompt has been counted*, and it
is always `{input_tokens: 0, output_tokens: 0}`. The real figures arrive in the final
`message_delta` — **the same event the adapter already opened, to read `output_tokens`
from.** One `if` block away.

Measured 2026-07-30, `glm-4.6`, via `https://api.z.ai/api/anthropic`:

```
FRESH prompt          message_delta: input_tokens=1935  cache_read=0
SAME prompt re-sent   message_delta: input_tokens=15    cache_read=1920
short prompt (81 tok) message_delta: input_tokens=81    cache_read=0
```

`15 + 1920 = 1935`. Three further facts fell out of the same run:

1. **z.ai honours prompt caching.** `types.ts`, `anthropic.ts` (twice) and CLAUDE.md all
   said it accepted the `cache_control` marker and honoured nothing. The marker was doing
   real work the whole time — for latency, for the rolling 5-hour prompt quota, and for
   what a fallback provider would bill.
2. **There is a minimum cacheable length.** An 81-token prompt cached nothing.
3. **The buffered path was never broken.** `complete()` reads
   `message.usage.input_tokens` from the non-streaming response, which returns a real
   figure. So moderation, gist, lotus and persona rows carried real input counts
   throughout, and **that is why the bug survived a release: half the ledger looked
   plausible, so the other half read as a provider limitation rather than as a defect.**

### How it was found, and the generalisation

Not by reading the adapter. By asking *"is there a cheaper source of truth than an
estimate?"* before building the estimate — which took four `fetch` calls and disproved
the thing the task was premised on.

**The original measurement was not careless. It was taken once, by hand, and written into
prose that could then never be re-checked.** When it went wrong — or was misread — nothing
could notice, and eleven copies of the sentence hardened into a fact that a workstream was
about to be designed around. The evidence was even *in the notes*: W4's own entry said
"the buffered path does report input tokens — variably", which is the refutation, written
down and not followed up.

**A number this repository asserts about a provider needs a way to be re-verified, or it
rots silently.** `scripts/probe-usage.ts` (`npm run probe:usage`) is the cheap version of
`prices.ts`'s 365-day tripwire: four small calls, ten seconds, run it after any change to
`LLM_PROVIDER`, `LLM_MODEL`, a base URL or the SDK.

Its own design has one trap worth keeping. **The first version used a single nonce**, so
the buffered call primed the cache and the "cold" stream came back with 1984 of 2028
tokens already cached — destroying the one distinction the cold probe exists to draw.
Two nonces.

### What shipped

- `ReadingUsage.cachedInputTokens`, with `inputTokens` kept as the **total** so `tee.ts`,
  `persistReading`, `callTotals` and the I/O chart needed no edit.
- **The two wire formats report caching with opposite semantics**, so each adapter converts
  itself and no shared helper does it: Anthropic's `input_tokens` EXCLUDES cache reads and
  is summed; OpenAI's `prompt_tokens` INCLUDES them and must not be. Both directions have a
  named negative control in the unit tests — the OpenAI one expects `1000`, not `1800`, and
  is what fails when somebody later makes the adapters "consistent".
- `llm_calls.cache_read_tokens` (migration `0012`), with three meaningful states: NULL
  (nothing reported), `0` (reported, nothing cached — **a measurement**) and `> 0` (a hit).
- A cache-hit rate on `/admin/tokens`, rated over `sum(input_tokens) filter (where
  cache_read_tokens is not null)` and never over total input. Verified by deleting the
  filter clause: the integration test failed with `expected 6000 to be 1000`.
- `ModelPrice.cachedInputPerMTok`, absent meaning full rate. Inert today —
  `NOTIONAL_MODEL` is null — and `NOTIONAL_MODEL`'s header now names the two callers that
  still need the split threaded through `CallTotals` on the day it is set.

**No backfill, and no tokenizer.** Every streamed row before 2026-07-30 keeps NULL input
tokens: that is the honest record of when this app started measuring, and **any average
over `input_tokens` spanning that date is two different measurements.**

## Admin panel insights (A7, 2026-07-31)

**An `Insight` button on all thirteen subpanels of `/admin` and `/admin/tokens`, with the
model's reading of that panel in a box under it and the time it was written beside the
button.** CLAUDE.md's `## Admin panel insights (A7)` is the short form; the design and the
rejected alternatives are in `docs/plans/2026-07-31-admin-panel-insights-design.md`. This
section is the account of what the build actually cost.

### The file map

```
src/lib/admin/insightPrompt.ts      PURE. PanelFacts, the serializer, the hash, the
                                    prompt, validateInsight. Everything npm test reaches.
src/lib/admin/insight.ts            server-only. The one complete() call.
src/app/admin/insight/panels.ts     The registry: 2 loaders, 13 renderers, the state
                                    helpers the pages call.
src/app/admin/InsightBox.tsx        'use client'. Button, timestamp, box, five states.
src/app/admin/InsightBox.module.css
src/app/api/admin/insight/route.ts  POST. The other four verbs are refuseMethod.
src/app/api/admin/insight/shared.ts NO_STORE, ok(), unavailable(), refuseMethod.
src/lib/db/queries/admin/insights.ts  insightsForRange (one statement per page), putInsight.
src/lib/db/migrations/0013_a7-admin-insights.sql
```

Edited: `llm/types.ts` (+`insight`), `analytics/rollup.ts` (+`OP_ORDER`), both admin
`page.tsx`, `admin/copy.ts`, `admin/format.ts` (+`stamp`), `admin/page.module.css`,
`components/chart/ChartFrame.tsx` (+an optional `insight` slot), and five test files that
exist to be updated deliberately.

### The tenth `op`, and why it was asked for rather than taken

Roadmap seam 3 says *nine, closed, no tenth and no alias*, and `A3 must not invent one`.
A7 is not A3, but the rule is about the column rather than about who writes it — so the
tenth was **put as a question and granted on 2026-07-31**.

The argument that won: the button is a **new recurring model call with no querent behind
it**, and `/admin/tokens`' own *Biaya per keperluan* table is the surface that has to be
able to say what it costs. Folding it into `translation` or `persona` would make the
dashboard hide the price of its own newest feature. `blogAutoTranslate` made the opposite
call for a one-off editor button and **recorded the cost in its own header** rather than
setting a precedent; that record is what made this decision cheap to reason about.

Spending a value is not free, and the machinery proved it: `OP_ORDER`'s
`AssertNever<Exclude<LLMOp, …>>` failed to compile the moment the union grew, and
`callClass.test.ts` stayed red until the new site declared its tier. Neither needed a
reviewer to notice anything.

### What a live run found that nothing else could

**PRESSING THE BUTTON CHANGES THE PANEL IT DESCRIBES.** An insight is a model call with
`op: 'insight'` and today's `local_date`, so its `llm_calls` row lands inside any range
ending today — nine of the thirteen panels and the default filter. Measured on the dev
database:

```
press overview.calls   -> "total 53 panggilan"      input_hash 4ceca84c0a624a96
press again, 15s later -> "total 54 panggilan"      input_hash 5ced1ba3d06b36ef
```

The fifty-fourth call **was the press.** Reloading the page put *"Angka di panel ini sudah
berubah sejak insight ini dibuat"* under prose four seconds old.

Nothing in the suite could see this. The unit tests hash literals, the integration tests
never call a model, and the typecheck has no opinion. **It took one press and one reload.**

The fix that shipped: **the stale flag only fires on a CLOSED range** (`range.to < today`).
The question it answers is *"has a settled period been re-measured since this was
written?"*, and a range ending today is not settled by anybody's definition — it moves
whenever a querent takes a reading, so the flag would be noise there even if the button
cost nothing. On a live range the **timestamp** does the work.

The two rejected fixes, for the next person who reaches for one:

- **Exclude `op: 'insight'` from the metric queries.** It works, and it undoes the entire
  argument for spending the tenth `op`. It is also an edit to `queries/admin/**`, A3's by
  §7.
- **Drop the flag.** Then a settled month's insight can be silently wrong about a range
  that was later corrected, which is the case the flag exists for.

### Three fences fired before this shipped, and all three were somebody else's

1. **`page.contract.test.ts`** (A5's, globbing the whole `/api/admin/**` tree rather than
   A5's own files) refused the route's first draft twice: it imported `next/server` and
   built a bare `NextResponse.json`. That is why `insight/shared.ts` exists, and it is the
   clearest evidence in the release that A5's decision to glob the surface was right.
2. **`adminCopy.test.ts`** refused a literal `280` in a note the model reads. The ceiling
   is interpolated from `_ceilings()` now — the derivation (400 prompts × 70%) lives beside
   it in `meter.ts` and a copy would go stale on a plan-tier change.
3. **`ttftSeam.test.ts`** pinned `<TtftCard rollup={rollup} />` character for character and
   went red on an added prop. Loosened to match the tag and its `rollup` prop only, with
   the reason written at the assertion: what that test is FOR is that the card is mounted.

A fourth, self-inflicted: **`**/` inside a block comment terminates it.** `shared.ts`'s
header said *"no file under `src/app/api/admin/**/route.ts`"* and the compiler reported
five errors on lines that were prose, ending in *"Unterminated template literal"*. The
message names nothing useful. `blog/shared.ts` avoids the sequence by accident; this one
was rewritten to say *"no `route.ts` anywhere under `src/app/api/admin`"*.

### Measured, dev database, 2026-07-31

| | |
| --- | --- |
| first press, cold | 2.9s |
| second press | 5.0s |
| input / output tokens | 830 / 138 |
| `cache_read_tokens`, second press | **448 of 830** |
| `call_class` / `status` | `deferred` / `ok` |

The cache figure is worth keeping: the system half is identical between presses, so the
provider served more than half the prompt from its own cache on the second call — the same
behaviour `types.ts` records for readings, on a prompt nobody tuned for it.

Five panels were read by hand (`overview.quota`, `overview.calls`, `tokens.trajectory`,
`tokens.cache`, `tokens.league`). Every figure cited was present in its block; the quota
panel correctly reported that the counter is a lower bound; the trajectory panel named the
converted daily ceiling and a crossing month. **`tokens.cache` came closest to the line**,
suggesting the prompt layer be inspected — grounded, because that panel's own `purpose`
names prompt-layer changes as the thing it detects, but worth re-reading after a model
change.

### Small things worth not re-deciding

- **`PanelFacts` is NOT the panel's `TableSpec`**, though every `ChartFrame` carries one
  for free (I-13). That table is written for somebody reading THAT chart and omits, on
  purpose, what a model most needs — the previous period, the ceiling, `k`, the
  denominators in a footnote. The cost is a second spelling of the labels, and
  `panels.test.ts` keeps the two sets of panels from diverging in membership.
- **`unchanged` is a guard, not a hot path.** `force` is true whenever prose is already on
  screen, so the arm needs a client with no state and a matching row — two tabs, or a lost
  render. The saving that matters is the page RELOAD, which serves the row and reaches no
  model.
- **`stamp()` is the one formatter in `format.ts` pinned to `Asia/Jakarta`.** Every other
  one is UTC because it renders `local_date`, a string; this renders an instant somebody
  asks a wall-clock question about. The explicit zone is also what makes it hydration-safe
  in a client component, where the default would be the lambda's UTC on one side and the
  operator's zone on the other.
- **`.live` is a plain flex column, not `display: none` and not `display: contents`.** A
  region announced into existence is not announced; `display: contents`'s treatment in the
  accessibility tree is inconsistent across engines. The cost is 8px of nothing under a
  button on a panel with no insight, paid deliberately.
- **`--gold-dim` IS NOT DEFINED IN `tokens.css`** and `blog.module.css` uses it six times,
  so those controls inherit their parent's colour. Noticed while writing
  `InsightBox.module.css`, which uses `--gold-text` instead. **Not fixed** — A6's file, §6
  ownership — and recorded here because it is invisible on screen and will be found again.

## The markdown editor for /admin/blog (2026-07-31)

**Design: `docs/plans/2026-07-31-blog-markdown-editor-design.md`, whose §15 records what
diverged and the live verification table. This section is the evidence.**

Miftah's report was two bugs and a request to *"discuss something more drastic"*: the
locale buttons only changed the preview; the hero alt field asked for text that should be
static; and *"writing the article is too complicated, while in actuality admin just want to
copy paste Gemini/chatgpt generated content anyway."* Five rulings came out of the
discussion (design §2) and all eight implementation steps landed the same day.

### The locale tabs were writing one locale's body into the other's row

**The report undersold it.** The tabs are `<Link>`s, so pressing one is a soft navigation
within the same route segment: the server re-renders and the preview pane updates — which is
exactly why it read as *"only Pratinjau konten changes"* — but React reconciles the editor as
the same element and every field is `useState(initial?.… ?? '')`. An initialiser runs on
mount and never again.

`save()` posts `{ slug, locale }` with the NEW locale. So `?locale=id` → **English** →
**Simpan** stored the Indonesian document as the English one, silently, on a published
article.

Three things worth keeping:

1. **The fix is `key={locale}` and the assertion is source-level**, because the behaviour
   needs a soft navigation — loop 5, not Vitest. A second case asserts the editor still
   seeds from a prop, so the guard and its precondition fail together rather than the guard
   rotting alone. Verified red with the key removed.
2. **The key survived the block editor's deletion.** The defect is not the block editor's: a
   `<textarea>` seeded from a prop has it identically.
3. **This is the third instance of one class in CLAUDE.md's traps** — `shuffleDeck()` in a
   `useState` initialiser, `todayKey()` during render, and now this. *State seeded from a
   prop that later changes.* All three present as a working-looking screen.

### The four launch articles ship a broken hero `alt`, and the gate was never on that path

Measured, not inferred:

```
what-tarot-is.id      the-world            alt: 'The World'
what-tarot-is.en      the-high-priestess   alt: 'The High Priestess'
how-to-read-tarot.id  the-hermit           alt: 'The Hermit'
how-to-read-tarot.en  the-high-priestess   alt: 'The High Priestess'
```

Nine to eighteen characters against a 60-character floor, each opening with the card name —
**both halves of `lint.ts`'s `hero-pair`, on four indexed pages.** `LoreDoc.imageAlt`
forbids exactly this in its own words: *"A DESCRIPTION OF THE PAINTING, NEVER THE CARD NAME
REPEATED … a fourth copy in `alt` is noise to a screen reader and to a crawler."*

**The generalisation is the part worth carrying forward: `hero-pair` is warning class, and
`scripts/blog-import.ts` writes `status: 'published'` directly rather than through
`changeStatus`. So the gate that would have caught it was never on the path that made the
rows.** A warning-class rule plus a write path that bypasses the gate is a rule that does
not exist. The script's own header called it *"a real defect in v0.4.0's prose"* and imported
it anyway — the note was honest and it was not a fix.

The 44 strings already existed. Deriving rather than re-authoring is the same argument the
shared-`@id` trap made twice in v0.4.0: *two owners of one fact, and a consumer picks one
silently.*

### `parse ∘ serialize` is what licensed deleting 880 lines, and it found two holes

The property is the safety net for R4, so it was written before the deletion and the
deletion waited on it. It is asserted over the four committed articles as fixtures — 33 and
55 phrasing runs, every span kind, one `cardRef` each, `bullets` and `steps`, and English
`heading.id`s against Indonesian headings so `{#…}` is exercised on every heading rather
than on a contrived one.

**Measured before trusting them as fixtures:** zero bare-string paragraphs and zero newlines
inside a span across all four, so `normalizeBlocks` is the identity there and the assertion
is exact rather than up-to-normalisation.

Two holes the first draft shipped, both silent, both firing when somebody opens a **stored**
article to fix a typo:

1. **`2 * 3 * 4`** — a regex `\*([^*]+)\*` reads `* 3 *` as an `em` span.
2. **A paragraph beginning `- lima kesalahan`** — serialized at the start of a line it comes
   back as a list. The block changes KIND, and the only witness is a preview nobody is
   looking at.

Fixed with an `ESCAPABLE` set and a hand-rolled scanner. **A regex alternation cannot be
taught to skip an escaped delimiter without placeholder substitution, which is itself a
second escaping scheme to keep correct.**

**`cardRef` is recognised exactly, and the near-miss is the load-bearing test.** The tempting
heuristic is *"contains an `/arcana/` link"*, which would swallow the six mid-sentence
`/arcana/` links inside the launch articles and tear those sentences in half. Removing the
exactness turns 7 tests red including the four-article round trip; all four negative controls
were verified red.

### The table of contents already existed and no operator had ever seen it

The request was *"the LLM automatically generate a clickable Table of Contents"*. The public
page has built one since S6, from every level-2 heading with an id, whenever there are more
than two. **Nobody authored it and nobody ever had.** What was missing was the preview, which
mounted `Prose` alone without the page chrome — so the one surface somebody looks at while
writing was the one that did not show it.

**The generalisation: a preview that renders less than the page is a feature report waiting
to be filed.** The fix was one component with two mounts, markup and CSS lifted verbatim
because the box renders on four published pages.

Its label is a **prop**, and that is two fences rather than laziness: `adminCopy.test.ts`
forbids `getT`/`useT` across the admin tree because that surface is deliberately
Indonesian-only, so a component calling `t()` could not be mounted there at all.

### The event register refused a name, and the refusal found a bug

`admin.blog_formatted` was drafted with five props. The 70-name ceiling refused it, and
trying to justify it surfaced a defect instead: **Auto Format WRITES, so a separate name
meant a save that fired no `admin.blog_saved` and an undercounted save metric.**

So `admin.blog_saved` gained `via: 'form' | 'auto_format'` and `model_called: boolean`, and
`headings_added`, `advice_rejected` and `outcome` were dropped as diagnostics the operator
already reads in the response. **Zero new names — V3's precedent, and the register's own rule
working as designed rather than as an obstacle.**

`model_called` is the instrument that decides whether the eleventh `op` was worth spending:
false on nearly every press confirms the parser is doing the work; true on nearly every press
means the parser is missing something, and *that* is the fix rather than a bigger prompt.

### The eleventh `op`, and a flag exemption stretched a third time

`LLMOp` grew twice on 2026-07-31 — `insight` then `blog_format`. **Two values in one day is
the thing to be suspicious of, so `rollup.test.ts` spells the count out rather than deriving
it**: the rule was never that ten is a magic number, it is that a new value is a question for
Miftah. Both were put and both were granted.

`flagCoverage.test.ts`'s admin-only exemption now has three members, and its own second entry
said *"if a third admin-only site ever lands, the honest move is a single
`ADMIN_MODEL_CALLS_ENABLED` covering the class — not three flags, and not this exemption
stretched a third time without saying so."* **It is stretched, and the saying-so is in the
test file**: `blogFormat` shares a surface, a gate and an editor with `blogAutoTranslate`, so
a flag covering one and not the other is a switch nobody could reason about. **The class
switch is now a debt with a trigger: the FOURTH admin-only call site must bring it and
collapse all three entries.**

### Live verification, and the one thing it caught that no test could

Driven against `localhost:3001` with a real `dev-session` admin cookie and the real provider.
The full table is in design §15. The three numbers that matter:

- **An already-sectioned paste made NO provider call** — `modelCalled: false`, 1.44s. That is
  §5.3's whole premise, and it is the difference between one model call per article and one
  per press.
- **A raw-txt paste added 4 headings with English anchor ids on Indonesian headings**, wrote a
  133-character description inside the band, rejected nothing, in 3.32s. `llm_calls` recorded
  `blog_format | deferred | ok | 798 in | 163 out`.
- **The author's prose came back byte-identical** — 5 paragraphs sent, 5 back, equal. R1's
  property, on a live call rather than on a fixture.

**What the live run caught: the model wrote *"Kartu Arcana Major"*, reversing *Major
Arcana*.** Card NAMES are protected by a prompt rule and by the `card-names` lint; *Major
Arcana* is a TERM and neither covers it. A heading that reverses it is wrong in a way no test
in this repo will catch — which is `validateInsight`'s lesson arriving in a new place:
**shape is checkable and truth is not, and the honest instrument is somebody reading the
preview.**

## `ADMIN_MODEL`, and the Insight prompt rewritten for findings (2026-08-01)

Two changes, one release, both on the admin surface. CLAUDE.md's
`### Environment variables` and `## Admin panel insights (A7)` carry the short forms.

### The report

Miftah, reading a live Insight box: *"make sure the LLM do not just tallying the number:
A is 23, followed by B total of 45."* And the other half in the same breath: *"i need
insights but we also need to avoid false positive (normal stuff being interpreted as
problems)"* — which is the harder constraint and the one that shaped the rewrite.

### It was the prompt's fault, not the model's

The first `INSIGHT_SYSTEM` asked for *"apa yang dikatakan angkanya, apa yang menonjol atau
ganjil"*. **That is an invitation to read the table out loud**, and the table was already on
screen directly under the box — so the model was answering the question it was asked and the
answer was worth nothing. The rewrite asks for a **finding**: is there a problem, what is the
evidence, what is the one thing worth doing next.

Four things the new prompt does that the old one did not:

1. **Says the job is not to restate the numbers**, in the second paragraph, before any rule.
2. **Gives the answer a SHAPE** — problem, one piece of evidence, one concrete step; or one
   or two sentences saying the panel is fine. Naming both shapes is what stops "no problem"
   reading as a failure the model should avoid.
3. **Bounds what a suggestion may be**: check another panel, widen the range, narrow to one
   op, wait for more data. The old rule 2 (*no advice needing data outside the block*)
   survives verbatim inside it — it was right, it just read as "give no advice".
4. **Lists what is NOT a problem, by name.** Aborted readings, a quiet day, a big percentage
   over a small base, unreported tokens, anything `CATATAN DARI PANEL` already explains. Plus
   the tie-breaker in one sentence: *if you are unsure whether something is a problem, it is
   not.*

**That last one is W7's trade in a new place.** The moderation gate's argument is that a false
positive is an accusation delivered to somebody who did nothing wrong; here it is an operator
sent to chase a healthy panel, who then stops reading the box at all. A missed finding costs
one press of a button — the chart is right there. **So the bias is stated in the prompt rather
than left to the model's temperament.**

### The worked example carries no digits, and that is a rule

Rule 1 says every number in the output must be findable in the block. **A figure inside a
worked example in the SYSTEM half is a number the model can copy and rule 1 would then have to
catch.** So the bad example reads *"op A sekian panggilan, op B sekian, op C sekian"* — enough
to show the shape, nothing to lift. A test asserts that line has no digit in it.

The rest of the prompt is deliberately NOT digit-free: rule 4's *"2 sampai 4 kalimat"* is the
length control, and `## The prompt`'s standing rule is that a ceiling the model can count as it
writes is the only kind that binds.

### `validateInsight` grew a `tally` refusal, and the line was drawn carefully

`validateInsight`'s documented contract is **shape, not truth**, and this file is where the
argument for stretching it lives. V3's lesson cuts toward a mechanical backstop — *an
instruction that merely forbids the tally fails under compression pressure* — but V3 could
**delete** the counts from its prompts, and here the counts are the subject. A prompt rule
alone was therefore the only control, which is exactly the situation V3 warns about.

What was added is only the recital shape that is **structural**:

- **Every sentence carries a digit, over at least three sentences.** A finding always has one
  sentence that is not a figure: the problem, or the step. A body without one has made no claim.
- **Any single sentence carries five or more numbers.** That is a list wearing a sentence.

Both tuned toward accepting, `namesIn` and `MULTI_OPTION`'s bias. Three tuning decisions worth
keeping:

- **`MIN_SENTENCES_FOR_RECITAL` is 3, not 2.** At two, *"TTFT p95 naik ke 8.200 ms. Panggilan
  turun 12%."* is an ordinary comparison and refusing it refuses a correct answer.
- **`NUMBER`'s character class contains the HYPHEN.** Without it `2026-07-28` counts as three
  numbers and `1-30 Juli` as two, so a finding that cites the day it happened plus two figures
  reaches five and is refused. There is a test named for that case.
- **A comma-joined recital of FOUR short items still gets through, and that is chosen.**
  Tightening to catch it starts refusing sentences that carry a date and a comparison. The
  prompt is the control; this is the belt.

**Two things it must never become:** a per-body digit RATIO (which punishes a short correct
answer) and a "does this sentence sound useful" check (which is truth, not shape). If the
button starts refusing correct prose, loosen this first and fix the prompt.

### `ADMIN_MODEL`: one variable for three call sites

`src/lib/admin/model.ts`, a LEAF — env in, a string out, no imports, so `npm test` drives every
branch. `insight.ts`'s header used to carry a section titled *"NO `INSIGHT_MODEL` VARIABLE"*
which argued the case honestly and left the door open in as many words: *"A variable can be
added the day somebody measures a reason for it."* The reason is the one that header predicted —
**this is analysis over numbers, which is the work a cheap model does worst, and `LLM_MODEL` is
chosen for a reader's voice rather than for reading a table.**

**One variable and not three**, because `flagCoverage.test.ts` already treats `insight.ts`,
`blogFormat.ts` and `blogAutoTranslate.ts` as one class — the only model calls whose caller is
the operator. Three variables is three chances for one dashboard to answer in two different
voices with nobody able to say which button was on which model. **A fourth admin-only call site
takes this variable too and does not bring its own** — which is the same shape as the
`ADMIN_MODEL_CALLS_ENABLED` debt that table already records, and it should collapse into that
change when it happens.

**It points the OPPOSITE way from `TRANSLATION_MODEL` and `PERSONA_MODEL`**, which exist to keep
prose a person reads in a reader's voice. Nothing on the admin surface is in a reader's voice:
the Insight button reads a table and Auto Format returns JSON metadata. And the admin surface is
the **one place in this app where a model change cannot reach a querent**, so it is both the
cheapest place to run something else and the safest place to try something new.

### Two functions, and the reason the second exists

`adminModel()` answers `undefined` when unset — `moderationModel()`'s shape, because
`LLMCallOpts.model` is optional and handing an adapter the literal string `'unknown'` sends
`model: "unknown"` to the provider. `adminModelName()` is what a **row** records
(`insights.model`) and **restates `ledger.ts`'s `opts.model || LLM_MODEL || 'unknown'` rather
than importing it**, because that module reaches `server-only`.

**A drift between the two writes a stored row naming a different model from the `llm_calls` row
beside it, and nothing on screen would show it.** `model.test.ts`'s last case is the agreement
asserted as one property over four env combinations, not as three coincidences.

### Two things this change does NOT do, recorded rather than fixed

- **`prices.ts` has no row for `glm-5.2`**, so `/admin/tokens` counts every admin call as
  UNPRICED. That is the designed empty state — *an unknown model is `null`, never 0* — and the
  file's own rule is that nothing enters it until a human has read the provider's page. It costs
  nothing today, because every z.ai row is zero on purpose. **Adding a row means opening
  <https://docs.z.ai/devpack/overview> and confirming `glm-5.2` is on the same subscription;
  do not copy `glm-4.6`'s zeros on the assumption that it is.**
- **`blogAutoTranslate` still shares `op: 'translation'` with every querent translation**, and
  now may also run on a different model — so A3's *cost per `translation`* mixes two models as
  well as two sizes. `llm_calls.model` separates them, which is strictly more than `user_id`
  gave before, so the caveat got easier to work around rather than worse.
- **The new prompt has not been run against a live panel.** Every claim above is about the text
  and the validator; whether glm-5.2 actually produces findings instead of recitals is answered
  by pressing the button on `/admin` and reading the box, and by `admin.insight` rejections
  showing `tally` if it does not.

### The `glm-5.2` price row, and what reading the pricing page turned up (2026-08-01)

Added on request, immediately after `ADMIN_MODEL` shipped. **The row itself is three lines
and the research around it is the part worth keeping.**

`prices.ts`'s own rule is that nothing enters without a human opening the provider's page,
and that bumping `verifiedOn` without doing so *"converts a tripwire into a lie with a fresh
date on it"*. So the page was opened. `docs.z.ai/devpack/overview` and
`docs.z.ai/guides/overview/pricing`, both on 2026-08-01.

**The row: `glm-5.2`, zero, `effectiveFrom: '2026-08-01'`.** Zero for the other two rows'
reason — `costUsd` measures dollars and a plan subscriber is billed none per token. Dated
today rather than backdated to `2026-01-01` like its neighbours, because those two were
backdated to cover history that already existed and nothing in `llm_calls` names this model
before today; an earlier date would claim a price nobody looked up.

The verified pay-as-you-go figures are in the row's `note` as a **counterfactual and not as
the rate**: US$1.40 input, US$0.26 cached, US$4.40 output per 1M tokens. Entering them as the
rate would make `costUsd()` quote a bill nobody receives, which is the exact separation
`notionalUsd()` exists to hold.

#### Two things the page said that this repo did not

**1. THE CODING PLAN IS CREDIT-BASED NOW, NOT A FLAT PROMPT QUOTA.** `prices.ts`'s header
said *"a fixed annual subscription with no per-token charge"* and *"which is why
`LLM_WINDOW_CALL_CEILING` is measured in calls"*. The page now describes
`credits = (input x in_mult + cached x cached_mult + output x out_mult) / 10,000`, a 5-hour
rolling allowance and a weekly one (Pro: 12,000 / 60,000), and per-model multipliers:

```
GLM-5.2       6.9 input   1.7 cached   24 output
GLM-5-Turbo   5.7         1.5          21
GLM-4.7       4.6         1.2          16
GLM-4.6V      1.2         0.3           2.7   (Vision MCP)
```

The zero survives — dollars are still not charged per token. **`LLM_WINDOW_CALL_CEILING=280`
does not.** Its derivation is *the Pro tier's ~400 prompts per 5 hours × 70%*, and that
denominator is gone. Worse, the unit changed shape: a call count treats a four-paragraph
`spread3` and a one-line classifier reply as the same thing, and at a 24× output multiplier
they are very far apart. **The ceiling is now a proxy rather than the quota, and it degrades
as the fleet's mix shifts toward long output.** Re-derive it against credits — raising the
number would be treating a units error as a capacity problem.

**This is CLAUDE.md's own trap arriving on schedule:** *a provider fact this repo asserts in
prose and cannot re-run will rot.* Twelve places once said z.ai reports `input_tokens: 0`.
This is the second instance, found the same way — by going and looking.

**2. THE SUPPORTED-MODEL LIST NAMES NEITHER OF THIS APP'S PRODUCTION MODELS.** *"All plans
support GLM-5.2, GLM-5-Turbo and GLM-4.7."* No `glm-4.6` (`LLM_MODEL`), no `glm-4.5-flash`
(`MODERATION_MODEL`).

**Left unresolved on purpose, and the two existing rows were NOT edited.** Three readings fit
the same sentence — the plan dropped them, the plan still serves them for existing keys, or
they have quietly moved to pay-as-you-go — and only the billing page can say which. **If it is
the third, those two zeros are understating a real bill**: the pay-as-you-go page lists
`glm-4.6` at US$0.60 / 0.11 / 2.20 and `glm-4.5-flash` as free, so the exposure is the reading
model, on every reading. That is the one number in this project whose being wrong is
expensive rather than merely untidy.

The repair, when the answer is known, is a **new row** and never an edit — editing re-prices
every month that came before it.

#### What the app is doing about it today: nothing, and that is visible

`glm-4.6` and `glm-4.5-flash` keep answering, so nothing is broken and nothing alerts. That is
precisely the shape of the 2026-07-28 migration outage and of the `input_tokens` rot: **the
app looks healthy while a stated fact underneath it is false.** The instrument here is a human
opening <https://z.ai/manage-apikey/billing> and reading the invoice.

### CORRECTION to the section above: the zeros are right, and here is the account (2026-08-01)

**The section immediately above reached the wrong conclusion and is left standing rather than
edited, because the way it went wrong is the thing a future session will repeat.** It read
z.ai's current docs, found that `glm-4.6` is not on the supported-model list, and concluded
that `prices.ts`'s zeros were probably understating a real bill. **They are not.** What was
missing was not on any page z.ai serves: it was the account's own history.

#### What actually settles it

**The plan is an annual Pro Coding Plan, bought February 2026 for US$180** — 50% off, which
z.ai was running at the time. A fixed fee for a year. **There is no wallet, no top-up and no
pay-as-you-go balance on this account.** Miftah paid once.

That fact is the whole argument, and it works by *modus tollens* rather than by looking
anything up:

1. `devpack/faq` says a call that fails the plan's conditions has **account balance deducted**,
   or errors **`1113 Insufficient Balance`**.
2. There is no funded balance.
3. Therefore an out-of-plan `glm-4.6` call would fail with `1113`.
4. Production readings work.
5. **Therefore the calls are plan-served, no dollar is charged per token, and zero is true.**

`devpack/transition` supplies the mechanism: legacy plans *"without weekly usage limits"* had
auto-renew cancelled on **30 April 2026**. A Pro annual bought in February 2026 is one of them,
and it **predates GLM-5.2 entirely — GLM-4.6 was the coding model when this plan was sold.**
The three-model rule and the credit formula are terms of the CURRENT plan and were evidently
not applied retroactively to a paid annual term.

#### The verbatim FAQ, because the summary of it is what misled

> **Q：Why does it still report error "1113 Insufficient Balance" after purchasing the coding
> package? Why is the account balance still deducted after purchasing the coding package?**
>
> **A：** The situation of reporting insufficient balance or deducting account balance may be
> due to not meeting the usage conditions of the GLM Coding Plan coding package:
> 1. The GLM Coding Plan is strictly limited to use within officially supported tools and
>    products.
> 2. A specific baseurl address must be configured to use it:
>    * API endpoint for Claude Code and Goose is：`https://api.z.ai/api/anthropic`
>    * API endpoint for other tools is: `https://api.z.ai/api/coding/paas/v4`
> 3. Only the following three models can be called: GLM-5.2, GLM-5-Turbo and GLM-4.7.

JMTarot fails 1 (it is not a supported tool) and 3 (`glm-4.6`), and passes 2 — `LLM_BASE_URL`
really is `https://api.z.ai/api/anthropic`. **On paper it should be drawing balance. It is not,
because there is no balance to draw and the calls succeed anyway.**

#### What would falsify it, stated so it can be checked rather than argued

- **A non-zero account balance quietly draining** — a trial credit, say. Then the calls were
  never plan-served, the drawdown has a start date, and the zeros are wrong from that date.
- **Readings beginning to fail with `1113`.** Same conclusion, arriving loudly.

Either repair is **NEW ROWS** at pay-as-you-go — `glm-4.6` US$0.60 / 0.11 / 2.20,
`glm-4.5-flash` free — dated from when the drawdown began. Never an edit; editing re-prices
every month that came before it.

#### The cliff is dated, which is the useful part

Auto-renew is already cancelled, so continuing past the annual term (**~February 2027**) means
re-subscribing onto the current plan. Three things bite in the same instant:

1. **`LLM_MODEL=glm-4.6` stops being callable** and every reading errors `1113`.
2. **`MODERATION_MODEL=glm-4.5-flash` likewise.** Free pay-as-you-go, so it is the cheap half —
   but a gate that 1113s is a gate that is down, and W7's blocklist-only fallback is not what
   happens here: the call errors rather than degrading.
3. **`LLM_WINDOW_CALL_CEILING=280` loses its denominator.** It is *the Pro tier's ~400 prompts
   per 5 hours × 70%*; the current plan meters credits, `(input×in_mult + cached×cached_mult +
   output×out_mult) / 10,000`, Pro at 12,000 per 5h and 60,000 weekly, with per-model
   multipliers (GLM-5.2 `6.9/1.7/24`, GLM-5-Turbo `5.7/1.5/21`, GLM-4.7 `4.6/1.2/16`). **A
   four-paragraph `spread3` and a one-line classifier reply stop being one unit**, and at a 24×
   output multiplier they are very far apart. Re-derive against credits — raising the number
   would treat a units error as a capacity problem.

**`ADMIN_MODEL=glm-5.2`, shipped hours earlier for unrelated reasons, is by accident the only
model setting already on the right side of that line.** The migration is `LLM_MODEL=glm-4.7`
(same pay-as-you-go rate as 4.6, inside the supported three) plus a moderation model from that
set, and per `## Providers` a model change needs `npm run probe:usage` and
`npm run smoke -- --all` with the blind read as the gate, because it changes the readers' voices.

#### The generalisation, which is the reason this is written down at all

**CLAUDE.md's standing trap is *a provider fact this repo asserts in prose and cannot re-run
will rot*. This is the mirror image of it: a provider fact the repo CAN re-run, re-run
correctly, and still get wrong — because the page describes the product being sold today and
the account is on something older.** The `input_tokens` rot was fixed by going and looking. This
one was *caused* by going and looking, and could only be fixed by asking the person who owns the
account.

**So the rule for the next session is: before concluding that a z.ai doc contradicts this repo,
check which plan this account is on and when it was bought.** Both facts are in
`## The z.ai plan` in CLAUDE.md and in `prices.ts`'s header, and neither is discoverable from
z.ai's documentation.

#### The balance was checked, and it is zero (2026-08-01)

Miftah opened `z.ai/manage-apikey/billing`. **Balance: zero.**

That closes the one open falsifier. The argument above ran on *"there is no funded balance, so
an out-of-plan call would 1113, so the calls must be plan-served"* — which was sound but rested
on the absence of something nobody had looked at. A trial credit quietly draining would have
broken it. There is none. **Zero balance, calls succeeding: this is now a measurement, and the
question does not need re-opening.** The only remaining falsifier is readings beginning to fail
with `1113`, which is loud and dated by definition.

**And the zero has a second consequence that runs the other way.** With, say, US$20 sitting in
the account, the day the plan stopped covering `glm-4.6` would present as a silent drawdown —
unpleasant, but with days of warning and a bill to notice. With zero it is an **instant outage
on the first call**, with `1113` as the only signal. So the renewal cliff has no grace period,
and **the same fact that proves the zeros correct is what removes the buffer.**

Worth stating plainly because the two read as opposites and are not: *a zero balance is good
news about the accounting and bad news about the failure mode.* Anyone tempted to "fix" the
cliff by parking US$20 in the account should know that this would (a) buy a warning period and
(b) immediately invalidate the argument that keeps `prices.ts`'s zeros honest — at which point
the pay-as-you-go rows become the truthful ones. **Do not do it without changing `prices.ts` in
the same commit.**

---

## F1 — the chat spine (v0.7.0, 2026-08-07)

**What landed:** three tables and migration `0014`; `src/lib/chat/{types,machine,model,budget,log,run}.ts`;
the two model call sites `chat/direct/plan.ts` and `chat/voices/turn.ts` with placeholder
prompts for F2 and F3; five API routes; two `LLMOp` values (11 → 13); two flags (5 → 7);
six event names (70 → 76) and three widened prop shapes; `/privacy` amended in both
locales; **both onboarding hints amended in both locales**; and `CHAT_ANSWERS_ENABLED`.

`docs/plans/2026-08-07-chat-spine.md` is the plan and `CLAUDE.md` will carry only the
rules. **What is here is what it cost to be right, and the things a future session will
otherwise re-derive.**

### The three bugs this workstream actually paid for

**1. `now()` IS FROZEN INSIDE A TRANSACTION, AND `[R19]` WALKED STRAIGHT INTO IT.**

`created_at` defaults to `defaultNow()`, which postgres resolves as
`transaction_timestamp()` — **identical for every row written in one transaction.** Every
ordering in `queries/chat.ts` breaks its tie on `id desc`, which is a random uuid.

Miftah granted F3's ask that **one beat may produce two bubbles** ("a person who has more
to say sends a second message rather than a longer one"), and `completeBeat` writes both in
one transaction. So the room would have rendered a reader's two sentences **in either
order, differently on each page load**, with nothing anywhere looking broken — a
naturalness bug arriving through the mechanism added to buy naturalness.

**It was found by the keyset-pagination test**, which is the only place five rows are ever
written in one transaction, and which failed with `['m1', 'm4']` where `['m4', 'm3']` was
expected. Fixed by stamping the bubbles of a beat one millisecond apart, explicitly, which
is also honest: the second bubble genuinely is sent after the first.

**The generalisation: any test that writes several rows through `withRollback` and asserts
an ORDER is asserting something production does not guarantee.** It is the same family as
`answersUpdatedAt`'s *"`sql<T>` is an assertion the driver is not obliged to honour"* —
a default that looks like a clock and is not.

**2. `greatest(col, $date)` IN A RAW `sql` TEMPLATE THROWS AT RUNTIME ON A GREEN
TYPECHECK.**

`markRead`'s monotonic cursor is `greatest(last_read_at, $2)`. Inside a raw `sql` template
there is **no column for drizzle to hang an encoder on**, so a JS `Date` reaches
postgres.js's serializer untouched and dies with `ERR_INVALID_ARG_TYPE: … Received an
instance of Date` — from a statement whose parameter types drizzle had already correctly
declared as `1184` (timestamptz).

The fix is `${upTo.toISOString()}::timestamptz`. **Inside a template, do the conversion
yourself.** Same file, same lesson as `answersUpdatedAt`, one direction along: there the
driver returned a string where a `Date` was asserted; here it refused a `Date` where the
template implied one.

**3. `run.ts` CANNOT BE IMPORTED UNDER VITEST, AND THE FIRST VERSION OF `run.test.ts`
DISCOVERED IT BY DYING SEVEN TIMES.**

`run.ts` reaches `@/lib/db/client`, which throws `Missing required environment variable:
DATABASE_URL` at import. **That is not a limitation to work around; it is why
`machine.ts` exists.** The state machine's decision is `nextAction()`, pure, in its own
file, and `run.test.ts` drives it with a table in `gate.decide()`'s idiom.

Fourth member of a family this repo keeps rediscovering — `swipeDeck.ts`, `choice.ts`,
`rollup.ts`, `history/dates.ts` — and the reason is always the same: **the pure part is
what tests can reach.**

### Two things the contract tests caught before they could ship

- **`beatsRemaining()` could not live in `queries/chat.ts`.** `queries/contract.test.ts`
  asserts *"the handle is the first parameter of every exported function"* over every file
  matching `/queries/`, and a pure fold has no handle to take. It went into `types.ts`,
  typed structurally so the leaf does not acquire `schema.ts`. Same wall W3, W5, V6 and A3
  each hit.
- **`types.contract.test.ts` failed on its own doc comment.** The header says the words
  `process.env` out loud while forbidding them, and the assertion matched the prose. Fixed
  by stripping comments first — `queries/contract.test.ts`'s recorded lesson, paid for
  again: *"a rule that fires on prose describing the rule is a rule people delete."*

### The lease, as shipped

Two predicates in the claim statement and **neither is redundant**:

```sql
  ... where user_id = $1
        and status in ('pending','planning','running')
        and (lease_until is null or lease_until < now())
      order by created_at asc limit 1
      for update skip locked
```

`for update skip locked` skips a row another transaction currently HOLDS — two tabs in the
same millisecond. `lease_until < now()` excludes a row whose holder has already
**COMMITTED** — two tabs a second apart, which is far more common and **is not a locked
row**. Delete either and the second tab executes the same beat: the same bubble in the room
twice.

`chat.integration.test.ts` proves it across **two real postgres connections** (it cannot
use `withRollback`, which is one transaction), and **asserts the message COUNT rather than
the run's status** — `tee.ts`'s reason: a run at `beats_done = 1` with two messages is the
exact bug, and only the count sees it. Three sibling cases cover the expired lease, the
live committed lease, and a stale `beats_done` rolling the insert back.

### The events ledger: twenty drafted, six landed

The full table is in the plan and transcribed into `events.ts` beside the names. The two
folds worth restating, because they are the ones a future session will try to re-add:

- **`chat.proactive_replied` DROPPED, `chat.message_sent` KEPT** — both duplicate a row,
  and **the line between them is the cost of writing them.** `message_sent` is a buffered
  scalar push in a handler that already holds every fact; `proactive_replied` would need
  **a join at write time** to discover which run it answers. `C-N2f`'s reply rate is a
  query, and F7 owns it.
- **`chat.message_blocked` DROPPED in favour of `surface: 'chat'`** on
  `moderation.refused`. A second name would double-count what W7 already measures **and
  would put every chat refusal outside every existing moderation query.**

`moderation.{refused,timeout,allowed_flagged}` gained `surface` and widened `reader_id` /
`service_id` to `| null`. **That prop is the only instrument a blocked chat message
leaves**: `C-D13` refuses to store the refused text, `moderation_flags` has no surface
column, so without it a spike in false positives on the chat surface is invisible.
`Q-F1-3` records the column as the better answer, deferred because the release spent its
migration.

### `LLM_WINDOW_CALL_CEILING`: re-derived 2026-08-07, unchanged at 280

`C-D6` required the exercise and **"re-derived and unchanged" is a real outcome of it.**
The argument that decided it is better than the roadmap's: **a bigger number does not
create quota.** z.ai meters prompts; raising 280 raises what this app is willing to spend,
not what the plan will serve — and `## The z.ai plan` says the far side is `1113
Insufficient Balance` on the first call, instantly, against a balance that is zero.

`LLM_WINDOW_CHAT_CEILING = 140`, **peeked before the fleet ceiling and consumed after it**,
so a call refused by either window is charged to neither. The number is resolved in
`meter.ts`'s `_ceilings()` and derived from the hard ceiling, so February 2027's credit
re-derivation moves both together.

### Six decisions worth finding again

- **`chat_messages.model` exists and is never selected by a route.** Every other table
  holding generated prose records its model; a chat bubble would have been the only one
  that could not say what wrote it, on the one surface running a model nothing else runs.
  `audit-secrets.ts` cannot see a serialised column, so **explicit projections are the
  enforcement** and `chat.contract.test.ts` greps for a bare `db.select()`.
- **No CHECK over a column carrying `ON DELETE SET NULL`** (`[R7]`). The obvious pairings —
  `(author = 'user') = (run_id IS NULL)` — live in `insertMessage`. The test for a new one
  is **whether NULL satisfies it**: `id <> reply_to_message_id` passes that test and stays.
- **`POST /api/chat/read` exists rather than folding into `state`**, because `state` is
  polled from four pages that show no messages — a GET that moved the cursor would
  **extinguish the red dot with the request that renders it.**
- **The dot is lit by a stored bubble and never by a pending run** (`[R6]`), because
  `C-R6` makes a zero-beat plan valid and a dot leading to an empty room is the opposite of
  what a dot is for.
- **`audit-secrets.ts` now walks `src/lib/chat/**`.** Before this it derived needles from
  two directories, so **non-negotiable 2 was unenforced for every string F3 will write** —
  and the `derived ZERO needles` guard could not fire, because the old directories keep the
  count comfortably non-zero. F3's finding, and the most important of the reconciliation's
  nine unowned files.
- **The placeholder director plans SILENCE and the placeholder voice REFUSES.** An
  accepting stub would store placeholder text as a bubble, and **a stored bubble is context
  for every future turn in the room** — `C-R7`'s reason for having no error bubble,
  arriving through the back door.

### Two corrections to prose the release inherited

- **`/api/cron/sweep`'s header said Vercel's free plan allows "a small number of cron
  invocations".** It allows **100 per project on every plan** (verified 2026-08-07;
  changelog 2026-01-20), so F5's nudge gets its own job. The sentence is corrected rather
  than deleted, and the conclusion survives on its other leg. **And `17 3 * * *` is 10:17
  WIB, not 03:17** — Vercel cron is always UTC, which the roadmap built an argument on.
- **`OP_ORDER`'s header said "The ten" over an eleven-member array.** One of `[R13]`'s
  three stale op counts. Now thirteen, with the count written out because **the boundary
  below it is what a reader needs, and a number that is checkable is what makes the
  boundary checkable.**

### What F1 deliberately did NOT do

- **Fix the cost-per-reading denominator** anywhere it already exists. Seam S10 gives it to
  F7, and F1 "helpfully" patching one of A3's queries is how two workstreams both half-fix
  one thing. `[R8]`'s rule — `llm_calls.reading_id` is NULL for both chat ops — is written
  at the call sites; F7 writes the negative control.
- **Touch `sanitize.ts`.** `[R2]`: `<jawaban>` is the third of six fences that already
  exist, and `C-D8`'s "a sixth fence" was a miscount. **`<obrolan>` and `<lampiran>` are
  the genuinely new ones and F3 owns that edit** (`[R12]`); adding a seventh alternative
  for `jawaban` breaks `sanitize.test.ts`'s fixpoint assertions for a reason that reads
  like a real defect.
- **Edit `gate.ts` or the middleware matcher.** `/chat` is refused by omission
  (`F1-D11`), and the deliverable is the negative controls in `gate.test.ts` — including
  **the one named for the worst outcome available in this release**, `/en/chat`.

### Still open when F1 landed

- **`Q-F1-2` — what date does `/api/cron/nudge` use for `proactive_count_date`?** It has no
  client and therefore no `x-jm-local-date` header. **`chat_threads.utc_offset_minutes` is
  the answer the reconciliation folded in** (`[R17]`, §2.3) — the cron can derive the
  querent's day from the last offset their browser reported. Nothing reads it yet; F5 owns
  the derivation.
- **`Q-F1-4` — nothing deletes a `chat_messages` row.** No status column, no soft delete,
  no unsend. A querent who posts something they regret into a room three characters will
  quote back at them has no remedy short of deleting the account. **A real product gap and
  a deliberate one**, named so the first bug report is met with a decision rather than a
  scramble.
- **`Q-F1-5` — `hit('chat:advance:<uid>', 400/h)` is on the default backend.** It is the
  highest-frequency authenticated budget this app has ever had — five round trips per
  posted message — and `events:` was moved to memory for that shape of reason. **Measure it
  on the first preview**; `RATELIMIT_CHAT_BACKEND` is reserved and deliberately unwritten.
- **`npm run probe:usage` has NOT been run for `CHAT_MODEL=glm-5.2`.** It is a model change
  and `## Providers` requires it. F1 ships nothing that calls the model in earnest — both
  prompts are placeholders — so the honest place for it is the commit that makes F2 or F3
  real.
- **Nothing has exercised these routes against a cold lambda.** `/api/chat/message` and
  `/api/chat/read` both WRITE, and **a user action that writes is one of the few things
  likely to be the request that wakes a suspended Neon compute.** 1348ms warm from WSL told
  us nothing last time.
