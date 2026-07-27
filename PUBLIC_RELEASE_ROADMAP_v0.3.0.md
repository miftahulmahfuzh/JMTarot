# JMTarot — v0.3.0 Roadmap

**Status:** planning. Nothing here is built yet.
**Date opened:** 2026-07-27.
**Predecessor:** `PUBLIC_RELEASE_ROADMAP.md` (v0.2.0, W1–W7, all shipped).

> **This file is the contract between eight parallel workstreams.** It fixes the
> schema, the module map, the event names, the environment variables and the
> decisions more than one workstream depends on, so that eight plans written at
> the same time compose into one codebase instead of eight.
>
> **RECONCILED 2026-07-27.** The eight plans were written against this document
> and then reconciled. **`docs/plans/2026-07-27-RECONCILIATION-v0.3.0.md`
> outranks this file** wherever they differ; every amendment it made is marked
> *(amended)* below and listed in its §6. **Read its §0 first** — it records
> three defects in shipped code, one of which makes `MEMORY_PROMPT_VERSION`
> invalidate nothing at all.
>
> **Precedence, highest first:** `docs/plans/2026-07-27-RECONCILIATION-v0.3.0.md`
> → this file → the individual workstream plan. Where a workstream plan disagrees
> with this file, the plan is wrong.
>
> **Everything in `CLAUDE.md`, `PUBLIC_RELEASE_ROADMAP.md` and
> `docs/plans/2026-07-26-RECONCILIATION.md` still binds.** v0.3.0 adds; it
> repeals exactly three things, all named in §2.

---

## 1. What v0.3.0 is

v0.2.0 made JMTarot an app a stranger can sign into, that remembers them, that
speaks their language, and that is safe to link to in public. It is also,
right now, an app whose memory feature says this:

> *This week The Empress is shown three times whilst The Chariot is shown two
> times.*

That sentence is the problem this release exists to solve, and it is not a
copy problem. The app is doing arithmetic out loud. Nobody opens a tarot app to
be told a tally. **A count is an input, never an output** — the product promise
is that the system *perceives something* in the pattern, and perception means
the numbers go in and a meaning comes out.

Eight things land — **nine after reconciliation**, and two of the nine are
promises the app has already published and cannot yet keep.

1. **A correspondence engine** — numerology, gematria/onomancy, and the
   card↔number mapping — computed in code, deterministic, tested. This is the
   substrate the next two features stand on.
2. **Locale-tagged generation and on-demand translation.** Every piece of
   generated prose records the language it came out in, and a language switch
   translates it rather than showing Indonesian text inside an English app.
3. **Mystical memory verdicts.** The frequency line and the day summary stop
   reciting counts and start reading them.
4. **The account shell** — a circular account button, top right, holding User
   Details, Language, and History. The language footer moves here.
5. **The reader panel becomes a swipe deck.** Bio and today's summary sit side
   by side; the summary slides itself in when it is ready, and the querent can
   swipe back.
6. **History.** `/history`, filtered by day, defaulting to today. Opening an
   item reconstructs the exact draw.
7. **Sharing.** A short link to a view-only page that looks exactly like the
   reading did, with a *Try It Yourself* button at the bottom.
8. **`/account` and the Inner Heavenly Lotus persona** — nickname and birth
   date, the card the universe keeps handing them, the reader whose path opened
   for them, and a generated four-sentence reading *of the person*. Shareable.
   **And the account-deletion button v0.2.0 promised in `/privacy` §8 and never
   built** — plus **per-answer clearing**, which `/privacy` promises in clauses 3
   and 7, in both locales, and which is equally unbuilt *(added, R7.3)*.
9. **A rate limiter that is actually distributed** *(added, R7.2)*. Its own
   header names the trigger — "the day a link to the app is posted anywhere
   public" — and item 7 is that day.

**Two smaller things that belonged to nobody and now belong to someone.**
**Sign out does not exist**: `auth.signed_out` has been in the closed taxonomy
since W4 and nothing has ever fired it. It is V4's, and it ships *(R7.1)*. And
`src/app/page.tsx` was unowned by §8's table; it is V4's too.

### The non-negotiables

Every v0.2.0 non-negotiable still binds — no DB read on the request-render
path, no DB write blocking a response, no prompt text or key in the browser,
Indonesian is not Malay, no therapy language. Four more:

- **Arithmetic is done in code, never by the model.** Same rule and the same
  reason as `effectiveYesNo()`: a model asked to add 3 and 2 and then interpret
  the result will get one of the two wrong, confidently. See VD1.
- **No generated prose is ever shown in a language it was not generated in,
  and none is shown translated without being persisted.** See VD5–VD7.
- **A share link is a capability.** It is opaque, revocable, opt-in per
  artifact, and it never carries the querent's typed question by default. See
  VD9.
- **Nothing new goes on the render path.** `/account` and `/history` are new
  pages with new queries; they inherit §6 of the v0.2.0 roadmap exactly.

---

## 2. What v0.3.0 repeals

Three things, and each is written down so nobody "fixes" it back.

**R1. `LocaleSwitch` no longer lives in the page footer.** `CLAUDE.md` and
`src/components/LocaleSwitch.tsx` both say "two places in the whole app": the
reader-picker footer and the login page. After V4 it is **one** place plus
login: inside the account menu, rendered as `EN · ID` and not
`English · Indonesia`. The login page keeps its footer switcher — there is no
session there and therefore no account button. The component's header comment
must be rewritten, not merely moved.

**R2. "A reading keeps the locale it was generated in, permanently" gains a
second clause.** `LocaleSwitch.tsx`'s header is still right that the *draw
screen* must never offer a language toggle mid-stream, and `readings.locale`
still records the language the prose came out in and is still immutable. What
changes is that the reading is no longer *unreachable* in the other language:
a translation is a **derived row** in a new table, the original is never
overwritten, and `readings.locale` never moves. See VD7.

**R3. "Deliberately still out of scope: sharing"** (v0.2.0 roadmap §2) is
reversed. Sharing is V7. Birth card, the daily-card lock, chat follow-up, a
second LLM provider, an admin dashboard, push notifications and payment all
remain out of scope.

---

## 3. Decisions already taken

Do not relitigate. Raise a flag in your plan's `## Open questions` if you hit a
wall against one.

| # | Decision | Choice | Why |
|---|---|---|---|
| VD1 | Who does the arithmetic | **Code. Always.** The engine computes every number and resolves every correspondence to a written gloss; the prompt receives the gloss and is told to speak it. | The exact rule `effectiveYesNo()` already establishes: "letting the model choose produced answers that contradicted the card's own orientation". A model handed `The Empress ×3, The Chariot ×2` and asked for numerology will silently produce a different sum on the second run, and the cached row and the fresh generation will disagree. |
| VD2 | Raw counts in output | **Forbidden in the frequency verdict and the day summary.** The counts are prompt input; a digit or a spelled-out tally in the output is a smoke-test failure. | This is the entire complaint. A prompt that merely *prefers* interpretation will fall back to the tally under compression pressure — the same failure mode that made Thessaly stop naming cards when the word ceiling landed. It has to be a stated prohibition with a check behind it. |
| VD3 | Numerology system | **Pythagorean.** A=1…I=9, J=1…R=9, S=1…Z=8. Reduce to a single digit; **preserve 11, 22 and 33** as master numbers. Diacritics folded to ASCII, non-letters dropped. | One system, named once, so two workstreams cannot each pick a different one and produce two different life-path numbers for one person. Pythagorean is the dominant Western scheme, it is a pure lookup table, and it handles Indonesian names without transliteration. Chaldean was considered and rejected: it drops the letter `9` and needs per-language variants. |
| VD4 | Astrology scope | **Sun sign, element, and modality. Nothing else.** A date→sign table, no ephemeris, no library. | We collect a birth *date*, not a birth *time* or place, and every other placement needs both. A rising sign computed from a missing birth time is fabricated data presented as fact, which is a different thing from mysticism. |
| VD5 | Translation storage | **One generic `translations` table**, keyed `(entity, entity_id, field, locale)`. Not a jsonb column per artifact. | Five artifacts need it (reading body, day summary, frequency verdict, persona, reading gist) and five jsonb columns is five migrations, five upsert paths and five places to forget `updated_at`. A translation also has its own `model`, `prompt_version` and `created_at`, which a jsonb value cannot carry. `lotus_avatars.summary` is **grandfathered** — see VD6. |
| VD6 | `lotus_avatars.summary` | **Unchanged. Stays `jsonb` keyed by locale.** | It is not translated; it is *distilled per locale from the same source answers*, which produces better prose than translating one into the other and is already built and shipped. Widening `translations` to cover it would mean rewriting a working W3 path for symmetry alone. Say so in the file, because the asymmetry looks like an oversight. |
| VD7 | The original is immutable | **`readings.body` and `readings.locale` are never rewritten.** A translation is a derived row. | `readings.locale` is the analytics dimension that says which prompt fork produced the prose; overwriting it makes every historic row a different measurement, which is the same argument that fixed `latency_ms` as time-to-first-token. |
| VD8 | Translation trigger | **On demand, at the point of render, never eagerly and never in bulk.** Switching language does not translate a history. | A user with 200 readings would otherwise trigger 200 model calls on one tap of `EN`. What is actually rendered in a list is metadata (cards, reader, date, day) which the message catalog already localizes; prose is only rendered when an item is opened, and that is where the translation happens — streamed, exactly like a reading. |
| VD9 | Share links | **Opaque random slug, opt-in per artifact, revocable, one live link per artifact.** The question is **excluded by default**. Blocked, failed and aborted readings cannot be shared at all. | A shared page is public forever from the moment the URL leaves the app. `readings.question` is the querent's own typed text — the privacy policy names it as stored user text — and defaulting it into a public page is a disclosure the user did not ask for. A slug derived from the reading uuid would let anyone enumerate. |
| VD10 | The view-only page | **One component, three mounts.** `ReadingView` renders a completed reading; history detail, the share page and the post-reading screen all mount it. | The user's requirement is literally "the exact same UI". Two renderers guarantee they diverge, and the one that diverges is the public one nobody on the team looks at. This is the single largest efficiency in the release — V6 and V7 share their main component. |
| VD11 | Locale on first sign-in | **Stamp the negotiated locale into `users.locale` when the row is created**, instead of taking the column default. | The real bug behind "the language resets". `users.locale` defaults to `'id'`; the `loc` claim is *first* in the resolution chain, ahead of the cookie and `Accept-Language`. So an `en-GB` browser negotiates English on `/login`, signs in, and is snapped to Indonesian by a default that has never been a choice. Verified by reading `upsertUserOnSignIn` — locale is in neither the insert list nor the conflict branch, so an existing user's choice is safe; only creation is wrong. |
| VD12 | Account menu contents | **User Details (`/account`), Language, History (`/history`).** Language is `EN · ID`, not full language names. | Miftah's call. It also fixes a real inconsistency: `LocaleSwitch`'s header argues for full names in their own language, which is right for a *footer control a stranger meets on the login page* and wrong for a two-item toggle inside a menu the user opened on purpose. Both are now true in the place each applies. |
| VD13 | Account deletion | **Ships in V8. Not optional, not deferrable.** `redactForUser()` runs in the **same transaction** that sets `deleted_at`. | `CLAUDE.md` already flags this as "the one real gap W7 leaves": `/privacy` §8 describes a deletion the user cannot perform. `moderation_flags.user_id` is `on delete set null`, so the row outlives the account — a self-harm disclosure would otherwise sit there for thirty more days. The transaction boundary is the whole point. |
| VD14 | History replay | **Reconstructs the past draw read-only. It does not re-run the reading.** | "Open the card selection just like at the time they did it in the past" means *see it as it was*. Re-running costs a model call and produces different prose, so the querent's memory of the reading and the app's would disagree — which is precisely the failure the memory features exist to avoid. This is VD10's `ReadingView`. |
| VD15 | The persona | **A new `personas` table, not a widening of `lotus_avatars`.** | They are different artifacts pointed in opposite directions. `lotus_avatars.summary` is short, abstracted, and **injected into every reading prompt**; the persona is long, specific, user-facing, and names the querent's life-path number and sun sign. Merging them puts astrology into nine reading prompts a day and flattens the readers — the exact risk v0.2.0's §10 logged against the Lotus block. |
| VD16 | The persona's voice | **House voice. Reader-agnostic.** Same register as the frequency verdict, never `readerPrompt()`. | Miftah's requirement 5, and it is also correct: the persona is a fact about the querent, not a reading. Three versions of it in three voices would make it a fourth reading rather than the spine the three readings hang off. |
| VD17 | Swipe mechanism | **CSS scroll-snap. No carousel library, no drag handler.** | The project has no runtime dependencies for UI and should not acquire one for two panels. `scroll-snap-type: x mandatory` gives native momentum, native accessibility and native keyboard behaviour for free; a JS drag handler gives none of those and the project has already been bitten once by pointer handling (the `setState`-updater trap). |
| VD18 | Share previews | **`next/og` `ImageResponse`. The card art and the reader — never the question, never the body.** | "Pleasing to the eyes when people see it in their WhatsApp chat" is a link-preview requirement, not a URL-length one. A preview that renders the prose defeats VD9 by putting the content in every group chat's cache before anyone clicks. *(amended, R5.9: satori cannot decode WebP and every card is WebP — see §7.)* |
| VD19 | Margaret's length | **She may be 30% longer than the other two. `MARGARET_MULTIPLIER = 1.3` in `budget.ts`, applied to every reader-voiced ceiling.** *(added, R7.4 — Miftah's ruling.)* | It closes a question `budget.ts` has carried since W6 and that V3 reopened from a second direction. A multiplier, not a second hand-set number, because the reason is a fact about the *reader* — her voice rules mandate long subordinated sentences — and that is equally true in every service she speaks in. The existing `spread3: 55` against a base of 40 was already 37.5%, so this is close to what was measured and is now a rule rather than a constant. The frequency verdict is house voice and is unaffected. **This fixes what the ceiling should be, not whether she obeys it** — the English `spread3` calibration is still unconverged at 157–243 words. |
| VD20 | The public page's exposure | **`noindex, nofollow, noarchive` and `Disallow: /s/`; `Referrer-Policy: no-referrer`; no cookie for a third party; `view_count` in `after()` behind the limiter.** *(added, R7.5 — Miftah asked for "as secure as possible".)* | A 60-bit slug is unguessable but **not unindexable**, and every argument about the slug being a capability silently assumes nobody publishes it. One crawler-reachable paste turns "I sent this to one friend" into a permanent search result with a cache that survives revocation. The referrer header leaks the capability itself, because here the URL *is* the secret. And `view_count` was the release's only unauthenticated write, drivable without limit by anyone holding one valid slug. |

---

## 4. Canonical schema deltas

**Three new tables and two new columns. This section is the single source of
truth for their names.** A workstream that needs anything else puts it in its
plan's `## Schema deltas` section and reconciliation folds it in — the v0.2.0
rule, unchanged, and for the same reason.

Conventions are unchanged: `snake_case`, plural tables, every table has `id`
and `created_at`, timestamps are `timestamptz`, foreign keys are
`<singular>_id` declared with `references()`. **No `pgEnum`** — see
`schema.ts`'s header. `date` columns are `mode: 'string'`.

```
translations                       -- VD5. Every piece of derived prose.
  id                  uuid pk default gen_random_uuid()
  entity              text not null    -- (amended, R5.1) 'reading' | 'persona'. TWO, not four.
                                       -- WAS: + 'daily_summary' | 'frequency_verdict'.
                                       -- Both of those are ALREADY keyed by locale in their
                                       -- own unique constraints, so a language switch there
                                       -- is an ordinary cache miss and a regeneration IN the
                                       -- target language -- one model call, the same cost a
                                       -- translation would have been, and better prose than
                                       -- translating a 45-word greeting. That is VD6's own
                                       -- argument; V3 noticed it reaches two more tables.
                                       -- `readings` cannot regenerate (VD7 makes the prose
                                       -- immutable) and `personas.user_id` is a PRIMARY KEY
                                       -- with one `locale` column, so a switch there would
                                       -- OVERWRITE rather than sit beside. Those two need it.
  entity_id           uuid not null    -- NO FK: it is polymorphic. See below.
  field               text not null    -- 'body' | 'gist'
  source_locale       text not null    -- what it was translated FROM
  locale              text not null    -- what it was translated INTO
  body                text not null
  model               text not null
  prompt_version      text not null
  created_at          timestamptz not null default now()
  updated_at          timestamptz not null default now()
  unique (entity, entity_id, field, locale)
  index (entity, entity_id)
  check (source_locale <> locale)      -- (amended, R5.2)

  -- (amended, R5.2) THIS TABLE HAD NO STALENESS KEY AND NEEDED ONE. A source
  -- body can be regenerated in place underneath a cached translation. Resolved
  -- with NO NEW COLUMN: a translation is stale iff
  --     translations.updated_at < source.updated_at
  -- `personas` maintains `updated_at` by hand inside onConflictDoUpdate (the
  -- $onUpdate trap), and `readings` is immutable so `created_at` is its
  -- comparand. Found by V2 reading the table against the tables it points at.

share_links                        -- VD9.
  id                  uuid pk default gen_random_uuid()
  slug                text not null unique          -- VD8's opaque token
  user_id             uuid not null references users(id) on delete cascade
  entity              text not null                 -- 'reading' | 'persona'
  entity_id           uuid not null
  include_question    boolean not null default false   -- VD9. Opt-in only.
  include_nickname    boolean not null default true
  view_count          integer not null default 0
  revoked_at          timestamptz
  created_at          timestamptz not null default now()
  updated_at          timestamptz not null default now()
  unique (user_id, entity, entity_id)   -- one live link per artifact
  index (slug) where revoked_at is null -- the public read path

personas                           -- VD15. The Inner Heavenly Lotus.
  user_id             uuid pk references users(id) on delete cascade
  body                text not null                 -- 3-4 sentences, house voice
  locale              text not null                 -- generated in, not displayed in
  facts               jsonb not null                -- the engine's output, structured:
                                                    -- life path, expression, soul urge,
                                                    -- sun sign, top card, top reader
  input_hash          text not null                 -- see below
  source_version      integer not null
  model               text not null
  prompt_version      text not null
  created_at          timestamptz not null default now()
  updated_at          timestamptz not null default now()
```

**Two new columns on existing tables:**

```
users
  locale_source       text                          -- VD11. 'default' | 'negotiated'
                                                    -- | 'chosen'. NULL on pre-v0.3.0 rows.
readings
  shared_at           timestamptz                   -- first time a link was minted.
                                                    -- Denormalized so the history list
                                                    -- can show a share badge without
                                                    -- joining share_links per row.
                                                    -- (amended, R3) ADDED BY V6's MIGRATION,
                                                    -- WRITTEN BY V7. V6 lands first and only
                                                    -- reads it, and a column a query names
                                                    -- has to exist by then.
```

### Four notes on the above, each of which is a trap

**`translations.entity_id` has no foreign key, and that is a deliberate cost.**
Postgres cannot declare a polymorphic FK, so orphan rows are possible: deleting
a reading leaves its translations behind. Three options were weighed — four
nullable typed FK columns, four separate tables, or this — and this one wins
because the alternative to one orphan-cleanup line is four migrations for every
future artifact. **The daily sweep (`/api/cron/sweep`) gains a fourth delete**
that removes translation rows whose entity is gone. W7 owns that route; V2
writes the delete and V7 reviews it. Say this in your plan.

**`share_links` is `on delete cascade` from `users` but has no FK to the
artifact**, for the same reason. A revoked or orphaned link must resolve to a
404 and not to a 500 — the resolver checks the artifact exists *after* it
resolves the slug, and a missing artifact is indistinguishable from a bad slug
to the caller. That is intentional: a stranger must not be able to tell a
deleted reading from a slug that never existed.

**`personas.input_hash` follows `lotus_avatars.input_hash` exactly**, and for
the same reason W3 wrote it: `source_version` catches "we changed the prompt",
`input_hash` catches "the user deleted an answer". Its inputs are the profile
facts, the sanitized answer set, the closed values, **the ids of the last ten
readings**, and `PERSONA_SOURCE_VERSION`. Including the reading ids is what
makes the persona move as the querent reads more, which is the whole point of
requirement 4 — and it is why the persona regenerates naturally rather than
needing a cron job.

**`users.locale_source` is not decoration.** Without it, VD11 cannot be
implemented safely: a sign-in cannot tell "this row says `id` because the
column defaults to `id`" from "this row says `id` because the user pressed ID".
Stamping the negotiated locale over the first is right; over the second it
would silently overwrite an explicit choice every time someone signs in from a
foreign browser. Pre-v0.3.0 rows are `NULL`, which V2 must treat as `'chosen'`
— the conservative reading, because those users have been using the app in
whatever it gave them and may well have pressed the toggle.

---

## 5. The correspondence engine, fixed here

V1 builds it; V3 and V8 consume it. **The formulas are fixed in this file** so
two workstreams cannot each invent one and produce different numbers for one
querent.

### Reduction

`reduce(n)` sums decimal digits repeatedly until the result is a single digit,
**except** that it halts at 11, 22 or 33. `reduce(29) = 11`, not `2`.
`reduce(39) = 3` (39 → 12 → 3; 12 is not a master number).

*(amended, reconciliation §5.3.)* **`reduce` is idempotent: 11, 22 and 33 are
fixed points.** `reduce(11) = 11`, `reduce(22) = 22`, `reduce(33) = 33`. This
paragraph originally said master numbers are "preserved only when they appear as
a *sum*, never as an input", and V1 implemented that literally and surfaced what
it costs: **November would contribute 2 to a life path while the 29th
contributes 11**, so no November-born person could ever reach a master life path
through their month. The idempotent rule is simpler to state, removes a special
case rather than adding one, and is what standard Pythagorean practice does with
an 11th month. Settle it before V8 builds — changing it later invalidates every
stored `personas.facts` and every cached verdict.

**`birthCard()` in `src/data/deck.ts` already reduces a birth date by a
DIFFERENT rule** — it folds to 0–21 with no master halt — and the two
deliberately disagree. Neither is rewritten in terms of the other. This belongs
in `src/lib/numerology/index.ts`'s header too, or someone will unify them.

### Names (gematria / onomancy)

Given a name string: fold diacritics to ASCII, uppercase, drop everything that
is not `A`–`Z`.

- **Expression** — `reduce(sum of every letter)`. From the **full name**.
- **Soul urge** — `reduce(sum of vowels)`. `Y` is a vowel only when it is not
  adjacent to another vowel. From the **full name**.
- **Personality** — `reduce(sum of consonants)`. From the **full name**.
- **Nickname pulse** — `reduce(sum of every letter of the nickname)`. Separate
  from Expression on purpose: Miftah asked for both names to count, and the
  nickname is what the reader actually says out loud.

### Birth date

- **Life path** — `reduce(reduce(YYYY) + reduce(MM) + reduce(DD))`. Reduce each
  component *before* summing; this is the standard method and it is the only one
  that produces master numbers at the right rate.
- **Sun sign, element, modality** — a fixed date table. No time, no place (VD4).

### Numbers to cards

`arcanaFor(n) = CARDS[n % 22]`. A master number maps through its own value
(`11` → Justice, `22` → The Fool), which is the traditional correspondence and
costs nothing.

### The frequency mechanic — *the Shadow Arcana*

This is what replaces the tally. Given the ranked top card `a` (count `m`) and
second card `b` (count `n`):

- **Shadow Arcana** = `arcanaFor(a.id + b.id)`. The card standing behind the
  pair. This is the tarot "quintessence"/sum-card practice and it is a real
  one, which matters: the mysticism should be borrowed, not invented.
- **Pulse** = `reduce(m + n)` → its numerology gloss.
- **Dominance** = `m - n`, bucketed to `overwhelming | clear | narrow | tied`.
  A bucket, not a number, because VD2 forbids the number reaching the page and
  a bucket cannot accidentally be recited. *(amended, reconciliation §5.4:
  **dominance is V3's, not V1's.** It lives in `src/lib/memory/frequency.ts`
  beside `passesGate`, because the thresholds are frequency-specific product
  judgement tuned against real output — and a constant one workstream owns while
  another tunes it is the wrong seam. V1 exports `shadowArcana` returning
  `{ top, second, shadow, shadowIsInPair, pulse }` and nothing else.)*

The prompt is handed the two card names, the Shadow Arcana, the pulse gloss and
the dominance bucket. **It is never handed `m` or `n`.** That is the mechanical
enforcement of VD2 and it is stronger than any instruction: the model cannot
recite a count it was never given.

**The composed type must assert its own key set**, with an exact-key-set test —
V1 carried that obligation and V3 inherits it with dominance (reconciliation
§5.4). Without it, VD2 degrades from "impossible" back to "forbidden".

**The Shadow Arcana collides with the pair iff The Fool is in it**, since
`x + 0 ≡ x (mod 22)` and `0` is its only solution in `0..21`. V1 reports
`shadowIsInPair`; V3 owns what to say. Both workstreams derived this
independently, which is the best evidence available that it is real.

### Glosses

Every number 1–9, every master number, every sun sign, every element and every
modality needs one written line per locale. **These live in
`src/lib/numerology/glosses.ts` as `Localized<string>`, not in the message
catalog.** They are dual-role copy — a prompt consumes them *and* `/account`
displays them — which is exactly the `positionFraming` precedent from
`src/data/types.ts` (I14). Splitting one string across two systems guarantees
the screen and the prompt eventually disagree.

**Written, not translated**, in both directions, and the same enforcement W6
used applies: a reviewer must be able to tell in five seconds. The English
glosses are the harder half — English numerology writing is as saturated with
`soul's journey` and `divine timing` as English tarot writing is, and the `en`
tic list in the smoke script already greps for that vocabulary.

---

## 6. Module map

New paths, fixed here so eight plans do not each invent their own.

```
src/lib/numerology/            V1. PURE. No React, no next/*, no DB, no server-only.
  reduce.ts                    digit reduction and the master-number rule
  gematria.ts                  the Pythagorean table, name -> numbers
  astrology.ts                 date -> sign / element / modality
  arcana.ts                    number <-> Major Arcana, the Shadow Arcana
  glosses.ts                   Localized<string> per number, sign, element, modality
  index.ts                     the facade. Everything else imports this.

src/lib/translate/             V2.
  contract.ts                  PURE. The prompt, the invariants, the parser.
  translate.ts                 server-only. The model call + the upsert.

src/lib/share/                 V7.
  slug.ts                      PURE. CSPRNG, the alphabet, validation.
  links.ts                     server-only. create / resolve / revoke.

src/lib/persona/               V8.
  prompt.ts                    PURE. Assembly, the safety checks, the fallback.
  generate.ts                  server-only. The model call, the write, the cache.

src/lib/copy/vocab.ts          V3. The Malay / therapy / en-tic word lists, in ONE
                               place. NO `server-only` marker -- scripts import it.
                               (amended, R5: they were about to have a fourth copy.)
src/lib/history/               V6. PURE. dates.ts, types.ts -- a date validator has
                               no DB handle and queries/contract.test.ts demands one.
src/lib/account/delete.ts      V8. The deletion transaction (VD13).

src/lib/db/queries/
  translations.ts              V2. New read concern.
  share.ts                     V7. New read concern.
  persona.ts                   V8. New read concern.
  allTime.ts                   V8. (amended, R5.7 -- was "frequency.ts V3 EXTENDS
                               (all-time top card)". V8 is its only consumer, and an
                               unbounded aggregate is a different read concern from a
                               windowed one. No new index: schema.ts's own comment on
                               reading_cards_user_date_card_idx already argues that its
                               leading-column prefix serves this.)
  history.ts                   V6 EXTENDS (list-by-day, one-reading-with-cards).

src/components/
  AccountButton.tsx            V4. The circle, top right.
  AccountMenu.tsx              V4. The sheet it opens.
  SwipeDeck.tsx                V5. Generic. Two or more snap panels.
  ReadingView.tsx              V6. THE shared renderer (VD10). V7 mounts it too.
  ShareFooter.tsx              V7. The footer button + the sheet.
  TryItYourself.tsx            V7. The stranger's CTA.
  LocaleSwitch.tsx             V4 RELOCATES and rewrites its header (R1).

src/app/account/page.tsx       V8
src/app/history/page.tsx       V6
src/app/s/[slug]/page.tsx      V7. Public. View-only.
src/app/s/[slug]/adapt.ts      V7. Pins V6's ReadingView props in ONE file, so a
                               mismatch costs one file and not a page.
src/app/s/[slug]/opengraph-image.tsx   V7. VD18.
src/app/api/share/route.ts             V7. POST create, DELETE revoke.
src/app/api/translate/route.ts         V2. POST, streams.
src/app/api/account/route.ts           V8. DELETE. VD13.
src/app/api/persona/route.ts           V8. GET. (amended, R5.8) BUFFERS, does not
                               stream: a safety check that must run before the first
                               byte reaches a browser means the response is buffered
                               anyway, and declaring it a stream is a lie in the type
                               and an invitation to delete the check.
```

**`src/app/page.tsx` is V4's** (amended, R5): it removes the footer switcher and
takes `.shell` top padding from 28px to 64px, because the Eyebrow's hairlines run
under the account circle. §8's table left it unowned.

**Ownership is exclusive.** If two plans both want to edit
`src/lib/prompt/summary.ts`, the owner writes it and the other describes what it
needs. The owner table is §8.

### Environment variables

```
TRANSLATION_MODEL=            # defaults to LLM_MODEL
PERSONA_MODEL=                # defaults to LLM_MODEL
SHARING_ENABLED=1             # ONLY '0' disables, same rule as ANALYTICS_ENABLED
SHARE_BASE_URL=               # defaults to AUTH_URL's origin. Set it only if the
                              # share host ever differs from the app host.
PERSONA_STUB=                 # 1 => skip the model, write the template.
                              # NEVER in production. Same rule as LOTUS_STUB.
```

`.env.example` gains all five, with the `\$` warning that has already bitten
this project. **Do not escape in the Vercel dashboard.**

### Event taxonomy deltas

`src/lib/analytics/events.ts` is a closed taxonomy of 44 names and W4 owns the
file. **These fifteen names are fixed here**; each workstream adds its own to
`events.ts` with a prop shape, and reconciliation checks the count reaches 59.
*(V9 was added after this section was written and adds two —
`ratelimit.backend_degraded` and `llm.ceiling_reached` — taking the total to
**61**. Reconciliation §4 is the register that balances, and it explains why both
earn a name: without the first, a fall-back to per-instance memory is invisible;
the second is explicitly the replacement for a billing alert that a fixed
subscription will never send.)*

**Two existing names finally get fired.** `auth.signed_out` has been declared
since W4 and nothing has ever fired it, because there was no sign-out control —
V4 builds one *(R7.1)*. `locale.changed` was declared by W6 and likewise never
fired; V4's menu fires it. Neither is a new name.

```
account.opened            account.details_viewed    account.deleted
persona.generated         persona.viewed
history.viewed            history.filtered          history.item_opened
share.created             share.revoked             share.copied
share.viewed              share.cta_clicked
translation.generated     reader.panel_swiped
```

**`sanitizeProps()` still forbids free text and that rule is not relaxed.** Two
specific consequences, both easy to get wrong:

- **`share.*` events carry `share_links.id`, never `slug`.** The slug is a
  capability token (VD9). `events` rows survive account erasure with `user_id`
  nulled, so a slug in `props` would leave a live, working, public URL sitting
  in a table that outlives the account that revoked it.
- **`share.viewed` fires from the public page with no `user_id`**, exactly like
  `terms.viewed`. `/api/events` is already public for this reason.

---

## 7. The four traps this release will otherwise walk into

**A translation is a new injection surface, and it is the worst-shaped one yet.**
The translator's input is *model output that was itself generated from user
text*, and its output goes straight to a screen. Everything the base contract
enforces — card names stay English, no therapy language, no Malay, the word
ceiling — must be re-enforced on the translation, because none of it survives a
naive "translate this to English". The translation prompt is therefore **not** a
generic translator: it carries the format rules, the forbidden vocabulary for the
target locale, and the instruction that card names, reader names and numerals are
not to be translated. `sanitize.ts`'s DELIMITER alternation must learn the new
fence. **Run `npm run smoke` on a translation before believing it works** — the
model *will* invent "Pulan" for The Moon; `CLAUDE.md` records it doing exactly
that.

**A public page is outside every fence the app has.** `/s/[slug]` is in
`isPublic()`, so `requireUser()` never runs, the onboarding gate never runs, and
the locale comes from the *viewer's* browser and not the sharer's session. Three
things follow that are each a bug if missed: the page must resolve its own locale
from `Accept-Language` (a stranger in Jakarta opening an English person's link
should get Indonesian chrome around English prose, not a crash); it must never
call anything that assumes a session; and **it must be excluded from the
middleware matcher's assumptions but not from its rate limiting** — an
unauthenticated page that hits the database on every GET is the one new
denial-of-service surface in this release.

**`x-frame-options: SAMEORIGIN` must not become `DENY` and `frame-ancestors`
must not become `'none'`.** A security review of a newly-public page will say
otherwise. `src/lib/headers.test.ts` asserts both, and the reason is in
`CLAUDE.md`: the project's only way to drive its own UI is a same-origin iframe
harness, because Chromium cannot launch in this WSL image.

**The account button lands on every page, including the draw screen, and the
draw screen is the one place a language toggle must not exist.** `LocaleSwitch`'s
header is explicit: a flip mid-reading leaves streamed prose in one language and
the chrome in another.

*(amended — V4 decided, and its argument is better than the one this paragraph
made.* The framing above is about *streaming*; `LocaleSwitch`'s header is
actually about **permanence**. `router.refresh()` is used precisely because it
keeps client state, so a flip *after* the stream finishes still re-renders the
chrome in English over a finished Indonesian reading. Guarding "until the user
navigates away" is whole-button suppression with extra plumbing. **So: no account
button on `/[reader]/[service]` at all**, enforced by a source-level denylist in
the `clientBoundary.test.ts` idiom — which names `app/s/` before V7 builds it, so
V7 meets a red test rather than a comment.*)*

**THE PRIMARY CONTROL AGAINST ABUSE IS NOT A SPEND CAP, AND THREE DOCUMENTS SAY
IT IS.** *(added, R7.2.)* `src/lib/ratelimit.ts`'s header,
`docs/DEPLOY-VERCEL.md` §2b and `CLAUDE.md` all name **a hard spend cap at z.ai**
as the control that actually bounds abuse, with the limiter as best-effort
insurance around it. **Miftah has confirmed the z.ai key is a fixed annual
subscription for coding — not a wallet, not pay-as-you-go.** There is no bill to
run up and probably no cap to set. **The exposure is quota exhaustion, which is a
denial of service against the querent**, and it is *less* visible than a bill
because no billing alert fires. So the limiter stops being insurance and becomes
the control, which is why **V9 exists and why it lands before V7.** All three
documents are wrong as written and V9 corrects them.

**Satori cannot decode WebP, and every card in `public/cards/` is WebP.**
*(added, R5.9.)* `next/og` is available in `next@16.2.11` with satori, resvg,
yoga and Geist vendored — no dependency. But its allowed-format list, read out of
the bundle, is `[png, apng, jpeg, gif, svg+xml]`, and `image/webp` is explicitly
detected and then thrown on. **The naive OG image throws at request time, in the
one code path nobody looks at, and the only symptom is a broken preview inside
somebody else's WhatsApp.** V7 generates `public/cards/og/<slug>.png` at 200×300
from the existing idempotent `tools/normalize_cards.py`, referenced by absolute
URL rather than `readFile` — `public/` on the function filesystem is untraced.
The new subtree inherits `/cards/*`'s one-year `immutable` header, which is
correct and is one more directory covered by CLAUDE.md's existing warning about
regenerating the art.

---

## 8. Workstreams

Eight plans, one file each, written in parallel and reconciled against this
document.

| # | Workstream | Plan file | Owns | Depends on |
|---|---|---|---|---|
| V1 | Correspondence engine | `docs/plans/2026-07-27-numerology-engine.md` | `src/lib/numerology/**`, §5 | — |
| V2 | Locale-tagged generation & translation | `docs/plans/2026-07-27-translation.md` | `src/lib/translate/**`, `queries/translations.ts`, `translations` table, `users.locale_source`, VD11 | W1 schema |
| V3 | Mystical memory verdicts | `docs/plans/2026-07-27-mystical-verdicts.md` | `src/lib/prompt/summary.ts`, `src/lib/memory/frequency.ts`, `src/lib/memory/shadow.ts`, `src/lib/copy/vocab.ts`, the §0 fixes | V1 *(amended, R6.9: **not** V2 — after R5.1 they no longer interact)* |
| V4 | The account shell | `docs/plans/2026-07-27-account-shell.md` | `AccountButton`, `AccountMenu`, `LocaleSwitch` (relocation), **sign out** *(amended, R7.1 — it belonged to nobody)*, `src/app/page.tsx`. **Mounted per owning page, not in a layout** | — |
| V5 | Reader swipe deck | `docs/plans/2026-07-27-swipe-deck.md` | `SwipeDeck`, `src/app/[reader]/page.tsx`, `DaySummary` | — |
| V6 | History | `docs/plans/2026-07-27-history.md` | `src/app/history/**`, `ReadingView`, `queries/history.ts` extensions | V2, V4 |
| V7 | Sharing & view-only pages | `docs/plans/2026-07-27-sharing.md` | `src/lib/share/**`, `src/app/s/**`, `share_links`, `ShareFooter`, the OG image | V6 (`ReadingView`), V8 (persona sharing) |
| V8 | `/account` & the Lotus persona | `docs/plans/2026-07-27-account-persona.md` | `src/app/account/**`, `src/lib/persona/**`, `personas`, **account deletion (VD13)**, **per-answer clearing** *(added, R7.3)* | V1, V2, V4 |
| **V9** | **Distributed rate limiting** *(added after reconciliation, R7.2)* | `docs/plans/2026-07-27-ratelimit.md` | `src/lib/ratelimit.ts`, the global model-call ceiling, the IP-extraction rule, **and the correction of three documents that name a z.ai spend cap as the primary control** | — |

### Build order

*(amended, R6.9. V3 is no longer blocked on V2.)*

```
V1  V9                      parallel, both first. V9 is here and not in wave 2
                            because `hit()` becomes ASYNC and V7 already has
                            four synchronous call sites -- landing V9 after V7
                            means editing a file V7 has just written, in the
                            most security-sensitive workstream of the release.
                            V9 shares no file with V1.
V2  V4  V5                  parallel. No shared files except events.ts.
V3                          needs V1 ONLY (was: V1 + V2).
V6  V8                      need V4's menu for their entry points.
V7                          last. Mounts V6's ReadingView, shares V8's persona,
                            completes V8's revokeAllForUser call site, and is
                            the reason V9 exists.
```

**V1 first and alone** — V3 and V8 both import it and neither can be written
against a moving formula. Then **V2, V4 and V5 in parallel**. Then **V3**: after
R5.1 cut `daily_summary` and `frequency_verdict` out of the `translations` table,
V3 and V2 no longer touch each other at all. Then **V6 and V8**. **V7 last** — it
mounts V6's `ReadingView`, shares V8's persona, and it is the only workstream
that makes anything public.

**The one hard cross-workstream dependency:** V8's deletion transaction must call
V7's `revokeAllForUser(db, userId)` — `share_links` is `on delete cascade` from
`users` and that cascade fires at the **hard** delete, so without it a shared URL
serves the public for thirty days after an erasure request (R5.6). V7 is last, so
**V8 ships the call site and an integration test that fails until V7 lands.**

**One render-path exemption, granted twice.** `/history/[id]` and `/s/[slug]`
each do one awaited primary-key read on the render path. Both are granted, on the
ground `/onboarding` already stands on: *the row is the page*. v0.2.0 §6 bars a
read that is **in the way of** a byte the user is waiting for; this is the byte.
`/history` itself reads nothing on the server — the querent's "today" is a fact
the server cannot compute (§7, `todayKey()`), so the list is client-fetched.

### Verification

Unchanged from `CLAUDE.md` — Vitest for logic, integration tests for anything
under `src/lib/db/**`, Windows-Chrome screenshots for layout, `getBoundingClientRect`
for phone-width geometry, an iframe harness under `public/cards/_*.html` for
"does the UI agree with what it sends", a real iPhone for touch and insets.
**There is still no Playwright and there must still not be.** Four additions:

- **`npm run smoke -- --frequency` must fail on a digit.** VD2 is enforced by a
  check, not by a hope. The same check runs over `--summary`.
- **`npm run smoke -- --translate`** — take one Indonesian reading of each
  reader, translate it, and run the **English** tic list and the card-name check
  over the result. The Malay grep stays `id`-only (W6's rule 4).
- **`npm run smoke -- --persona`** — one real persona end to end, printed whole.
  Read it. Same instruction and same reason as `--lotus`.
- **A share link must be opened in a browser with no session.** Not a curl: the
  failure mode is a client component reaching for a session that is not there,
  and curl will not show it.

---

## 9. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| The mysticism reads as generated filler | Replacing a tally with four sentences of vague cosmic language is not an improvement, it is a longer version of the same problem. | The Shadow Arcana is a *specific card* the querent recognises from their own deck, and the pulse gloss is a written line, not a model invention. Read `--frequency` output before believing it. |
| Translation flattens the readers | Margaret translated by a generic prompt comes back as Thessaly with longer words. | The translation prompt carries the target reader's voice rules, and the contraction-rate proxy (Adrian > 0, Margaret == 0) runs over translations too. |
| A share link leaks a question | The single highest-consequence bug in this release. | Opt-in column defaulting false, a share sheet that *shows the exact page* before minting, and an integration test asserting the public route never selects `readings.question` when `include_question` is false. |
| The persona is the app's most sensitive output | It is assembled from the onboarding answers — including question 3b — and it is shareable. | The persona prompt inherits D10's rule: abstract, never restate. The safety checks are `lotus.ts`'s, reused. Sharing it is a second, separate opt-in. |
| Eight plans, three shared files | `events.ts`, `schema.ts` and `sanitize.ts` are each touched by four workstreams. | §4 and §6 fix the names up front, exactly as v0.2.0's §3 did, and reconciliation folds the deltas. |
| `/account` slips again | It slipped through all of W3 and W7 and the privacy policy has been describing it for a release. | VD13. It is a numbered deliverable of V8, not a nice-to-have, and V8's plan must lead with it. |
