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
