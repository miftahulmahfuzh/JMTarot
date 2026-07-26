# JMTarot — Public Release Roadmap

**Status:** planning. Nothing here is built yet.
**Date opened:** 2026-07-26.

> **Reconciled 2026-07-26.** Seven workstream plans were written against this
> document and then reconciled. **`docs/plans/2026-07-26-RECONCILIATION.md`
> outranks this file** wherever they differ; the amendments it made are marked
> *(amended)* below. Read it before implementing anything, and read its §0
> first — it records two live bugs in `src/lib/prompt/sanitize.ts` that must be
> fixed before W1 starts.
**Supersedes nothing.** `docs/plans/2026-07-25-jmtarot-web-rewrite.md` remains
the record of how the current app got here; its decision table still stands
except where this document explicitly overturns a line, and every overturn is
named in §2.

This is the umbrella document. It fixes the decisions that more than one
workstream depends on — the schema, the module map, the environment variables,
the naming — so that seven detailed plans written in parallel compose into one
codebase instead of seven. **Each workstream has its own plan file under
`docs/plans/`; this file is the contract between them.** When a detail
contradicts a workstream plan, this file wins, and the workstream plan is
wrong and should be fixed.

---

## 1. What "public release" means here

Today JMTarot is two hardcoded users behind a password, no database, and a
reading that evaporates when you close the tab. The goal is an app a stranger
can sign into with Google, that remembers them, that speaks their language, and
that is safe and lawful to put a link to in public.

Six things have to land. They are not independent, which is why the schema and
the write path are settled in this file rather than in any one of them.

1. **Google login** replaces the password. Session TTL becomes configurable.
2. **Onboarding**, asked exactly once: name, nickname, birth date, and six
   personal questions that build the *Inner Heavenly Lotus Avatar*.
3. **Analytics and reading history** — every reading, every choice, every
   timestamp, persisted, and never on the response's critical path.
4. **Memory features** built on that history: card-frequency verdicts, readings
   that reference the last reading, and a per-day reader summary.
5. **English and Indonesian**, interface *and* readings.
6. **Terms & Conditions**, plus a moderation gate that refuses questions the
   T&C forbids, and a secrets audit so no prompt or key reaches the browser.

### The non-negotiables

Every plan inherits these. A plan that violates one is wrong.

- **No DB read on the request-render path** unless the page cannot exist
  without it. Sessions are stateless JWTs; the profile is read once and cached.
- **No DB write blocks a response.** Writes go through `after()` (§6).
- **No prompt text, no API key, no model name reaches the browser.** The
  client sends card ids and orientation and receives prose. That property is
  load-bearing today and survives every feature below.
- **`localStorage` stops being the source of truth** for the profile. It
  becomes a cache of what the server already knows. `todayKey()` stays.
- **Indonesian copy is Indonesian, not Malay.** The eleven-word grep in
  `npm run smoke -- --all` still runs, now only against the `id` locale.
- **No therapy, no diagnosis, no trauma-healing language**, now in both
  locales and in the distillation prompt as well as the reading prompts.

---

## 2. Decisions already taken

Settled with Miftah on 2026-07-26. Do not relitigate these; raise a flag
instead if a plan hits a wall against one.

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Auth | **Auth.js v5, Google provider only, JWT session strategy** | One provider, no signup flow to build. JWT strategy keeps the auth path off the database, which is the latency budget we actually care about. The library owns `state`/`nonce`/PKCE/`id_token` verification — the parts that are quietly catastrophic to hand-roll. |
| D2 | Password login | **Removed once Google works**, kept behind `DEV_PASSWORD_LOGIN=1` for local development only | Local dev and Vitest should not need a Google round-trip. *(amended, R10: it becomes a **Credentials provider** producing a real Auth.js session, not a flag-gated route minting a second cookie format. The route is deleted outright rather than 404-ing, `users.ts` survives, and the flag additionally requires `NODE_ENV !== 'production'`.)* |
| D3 | Session TTL | **`SESSION_TTL_HOURS`, default 24** | Miftah's call. The current 30-day constant was sized for two people typing a password once; a public app is a different threat model. *(amended, R11: `session.updateAge` is **ignored** on the JWT path — JWT sessions always slide — so this is an idle timeout, not a cap. `SESSION_ABSOLUTE_TTL_DAYS`, default 30, is the hard ceiling that bounds a stolen cookie.)* |
| D4 | Database | **Postgres via Drizzle ORM** | Typed schema, SQL-shaped queries, generated migrations, no query engine binary and so no cold-start tax on Vercel. Local `psql` now; the cloud host is a later session's problem and Drizzle makes it a driver swap. |
| D5 | Hosting the DB in prod | **Deferred, explicitly** | Local development only for now. Every plan must keep the driver behind `src/lib/db/client.ts` so the swap is one file. |
| D6 | i18n mechanism | **Typed static catalogs in-repo**, locale from profile + cookie, **not** a URL segment | Copy is reviewable in a diff and versioned with the code that uses it. No cache layer, no fallback chain, no DB round-trip to render a button. The app is behind auth, so there is no SEO argument for `/en/...`. |
| D7 | i18n scope | **Interface *and* readings** | An English app that reads your cards in Indonesian is not an English app. This means an English fork of the entire prompt layer, including rewritten worked-example paragraphs for all three readers. |
| D8 | Moderation | **Deterministic blocklist, then a concurrent classifier with a gated flush** | The blocklist rejects the obvious at zero cost. Otherwise the classifier runs *in parallel* with the reading call and the stream buffers until the verdict lands — the classifier normally returns before the reading's first token, so the added latency is near zero and no unsafe text can leak. *(amended, R8: the buffer sits **before the response headers**, not inside the stream. Same perceived latency, but it recovers a real `403 application/json` — and the refusal must be able to render "Terms & Conditions" as a link, which a `text/plain` stream cannot. Consequence: the reading route no longer always returns 200.)* |
| D9 | Analytics write path | **`after()` from `next/server`** | There are no goroutines on Vercel. `after()` runs work after the response is flushed, in the same invocation. A real queue is the escape hatch if a write ever grows teeth, and §6 says where it would go. |
| D10 | Onboarding answers in prompts | **Distilled once into a compact Lotus block, cached in the DB. Raw answers are never sent to the reading model.** | Bounded tokens, better voice, and it keeps the rawest text — question 3b especially — out of nine prompts a day. Regenerable by bumping a version column. |
| D11 | Sensitive answers | **Encrypted at rest, application-level, skippable, and named in the privacy policy** | See §8. This is the highest-liability data in the product. |
| D12 | Reading persistence | **Reversed from the rewrite plan: readings are now stored** | The old "reading history: not stored" line was correct when there was no database. Every memory feature in §5 of this file is a consequence of storing them. |

### Deliberately still out of scope

Birth card, the daily-card server-side lock, sharing, chat follow-up, a second
LLM provider, an admin dashboard, push notifications, payment. Onboarding is
now *in* scope; the rest of the rewrite plan's deferred list stands.

---

## 3. The canonical schema

**This is the single source of truth for table and column names.** Workstream
plans MUST NOT redefine these tables. A plan that needs a new table or column
puts it in a section headed `## Schema deltas` in its own file, naming the
table, the columns, the types, and why — and reconciliation folds those deltas
into the data-layer plan. This rule exists because seven agents inventing
`user_id` vs `userId` vs `uid` is the single most likely way this goes wrong.

**Conventions.** `snake_case` tables and columns. Plural table names. Every
table has `id` and `created_at`. Timestamps are `timestamptz`, always UTC,
never a bare `timestamp`. Money and duration columns do not exist yet. Foreign
keys are `<singular>_id` and are declared with `references()` in Drizzle so the
relations come out typed.

```
users
  id                  uuid pk default gen_random_uuid()
  google_sub          text unique not null      -- the OIDC `sub`, the real identity
  email               text not null
  email_verified      boolean not null default false
  display_name        text                      -- from Google, not the onboarding answer
  avatar_url          text
  locale              text not null default 'id'   -- 'id' | 'en'
  created_at          timestamptz not null default now()
  last_seen_at        timestamptz not null default now()
  deleted_at          timestamptz               -- soft delete, for the T&C erasure right

profiles                                        -- one row per user, written by onboarding
  user_id             uuid pk references users(id) on delete cascade
  full_name           text not null
  nickname            text not null
  birth_date          date not null
  onboarding_version  integer not null default 1
  completed_at        timestamptz
  created_at          timestamptz not null default now()
  updated_at          timestamptz not null default now()

onboarding_answers                              -- the six mysterious questions
  id                  uuid pk
  user_id             uuid not null references users(id) on delete cascade
  question_key        text not null             -- 'best_thing' | 'worst_thing' | 'most_loved'
                                                -- | 'introversion' | 'color' | 'willow_wish'
  answer_text         text                      -- NULL when skipped; ENCRYPTED (§8)
  answer_choice       text                      -- for the closed questions: 'black'|'white'|'grey',
                                                -- and the introversion scale value
  skipped             boolean not null default false
  created_at          timestamptz not null default now()
  unique (user_id, question_key)

lotus_avatars                                   -- the distilled persona block (D10)
  user_id             uuid pk references users(id) on delete cascade
  summary             jsonb not null            -- (amended, R6) {"id": "...", "en": "..."} -- the compact
                                                -- block injected into prompts, one column per locale key.
                                                -- WAS summary_id/summary_en: `<singular>_id` means a
                                                -- foreign key everywhere else in this schema, and a
                                                -- locale suffix wearing that name is a trap.
  traits              jsonb not null            -- structured, for analytics: {color, introversion, ...}
  source_version      integer not null          -- bump to force regeneration
  model               text not null             -- which model distilled it
  created_at          timestamptz not null default now()

readings                                        -- one row per completed reading (D12)
  id                  uuid pk
  user_id             uuid not null references users(id) on delete cascade
  reader_id           text not null             -- 'thessaly' | 'margaret' | 'adrian'
  service_id          text not null             -- 'daily' | 'spread3' | 'yesno'
  locale              text not null
  question            text                      -- the querent's text, sanitized, may be NULL
  question_blocked    boolean not null default false
  verdict             text                      -- yes/no services only
  body                text                      -- the generated prose, NULL if the stream died
  model               text not null
  prompt_version      text not null             -- so a prompt change is visible in the data
  latency_ms          integer
  token_input         integer
  token_output        integer
  local_date          date not null             -- the querent's OWN calendar day, see §7
  created_at          timestamptz not null default now()

reading_cards                                   -- the draw, normalized so frequency queries are cheap
  id                  uuid pk
  reading_id          uuid not null references readings(id) on delete cascade
  user_id             uuid not null references users(id) on delete cascade   -- denormalized on purpose
  card_id             integer not null          -- 0..21
  reversed            boolean not null
  position            integer not null          -- 0-based slot in the spread
  created_at          timestamptz not null default now()

events                                          -- the analytics firehose (§4)
  id                  uuid pk
  user_id             uuid references users(id) on delete set null
  session_id          text                      -- per browser session, not the auth session
  name                text not null             -- from the closed taxonomy in the analytics plan
  props               jsonb not null default '{}'
  locale              text
  local_date          date not null
  created_at          timestamptz not null default now()

daily_summaries                                 -- the "reader remembers your day" feature (§5)
  id                  uuid pk
  user_id             uuid not null references users(id) on delete cascade
  reader_id           text not null
  local_date          date not null
  locale              text not null
  body                text not null             -- 1-3 sentences
  source_reading_ids  uuid[] not null           -- what it summarized, so staleness is detectable
  created_at          timestamptz not null default now()
  unique (user_id, reader_id, local_date, locale)

moderation_flags                                -- what got refused and why (§8)
  id                  uuid pk
  user_id             uuid references users(id) on delete set null
  question            text not null
  category            text not null             -- 'self_harm' | 'violence' | 'sexual_minor' | ...
  source              text not null             -- 'blocklist' | 'classifier'
  confidence          real
  created_at          timestamptz not null default now()
```

**Indexes that are not optional.** `readings (user_id, created_at desc)`,
`readings (user_id, local_date)`, `reading_cards (user_id, card_id)`,
`events (user_id, created_at desc)`, `events (name, created_at desc)`.
The card-frequency feature is a `group by card_id` over `reading_cards`
filtered by `user_id` and a date window; it must not table-scan.

---

## 4. Module map

New paths, fixed here so seven plans do not each invent their own.

```
src/lib/db/
  client.ts          the Drizzle instance and the pool. THE ONLY PLACE the driver is named.
  schema.ts          Drizzle table definitions, mirroring §3 exactly
  queries/           one file per read concern: profile.ts, history.ts, frequency.ts, summary.ts
  migrations/        generated by drizzle-kit, committed

src/lib/auth/
  config.ts          the Auth.js configuration object
  session.ts         KEPT. Its jose helpers stay for anything Auth.js does not own.
  users.ts           REPLACED. bcrypt user list dies with D2.

src/lib/analytics/
  track.ts           the one function everything calls. Never awaited by a handler.
  events.ts          the closed event-name union and each event's prop shape
  flush.ts           the after()-side writer and its batching

src/lib/i18n/
  locales/id.ts      typed message catalog
  locales/en.ts      typed message catalog, same keys, checked by the type system
  resolve.ts         profile -> cookie -> Accept-Language -> 'id'
  t.ts               the lookup used by server and client components alike

src/lib/prompt/
  base.ts            BECOMES base.id.ts + base.en.ts behind base.ts
  readers.ts         same, and the worked examples are rewritten, not translated
  services.ts        same
  lotus.ts           NEW. Distills onboarding answers into the Lotus block (D10).
  memory.ts          NEW. Builds the "what came before" block (§5).
  summary.ts         NEW. The per-day reader summary prompt.

src/lib/moderation/
  blocklist.ts       deterministic patterns, per locale
  classify.ts        the concurrent classifier call
  gate.ts            the buffered-flush orchestration (D8)

src/app/onboarding/   the once-only questionnaire
src/app/terms/        the T&C page
src/app/privacy/      the privacy policy the T&C links to
src/app/api/auth/[...nextauth]/route.ts
```

**Environment variables.** New names are fixed here. `.env.example` gets all of
them, with the `\$` escaping warning that already bit this project once.

```
DATABASE_URL=postgres://...            # local psql for now
AUTH_SECRET=...                        # EXISTING, now also Auth.js's secret
AUTH_URL=http://localhost:3000         # Auth.js callback base
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
SESSION_TTL_HOURS=24                   # D3
DEV_PASSWORD_LOGIN=                    # D2, unset in production
FIELD_ENCRYPTION_KEY=...               # 32 bytes base64, for §8
MODERATION_MODEL=                      # defaults to LLM_MODEL if unset
LLM_PROVIDER / LLM_BASE_URL / LLM_API_KEY / LLM_MODEL   # EXISTING, unchanged
AUTH_USERS=...                         # EXISTING, dev-only after D2
```

---

## 5. The memory features, in dependency order

These are the reason the database exists. All three read from `readings` and
`reading_cards` and all three are cheap once §3's indexes are in.

**Card-frequency verdict.** Count a user's `reading_cards` over a window, take
the top two, and write a line: *"Minggu ini semesta membacamu sebagai Strength
di atas The Hanged Man."* The windows Miftah named — this week, last 3 days,
last 13 days, last 666 days, this month, quarter, year, since your last
birthday — are all the same query with a different lower bound, so they are
configuration and not code. The prose around the pair is generated, not
templated, or it will read identically the fourth time you see it.

**Chained readings.** The current reading's prompt gains a short block naming
what the last one or two readings drew and concluded — cards and a one-clause
gist, not the full prose, or the token budget explodes. The reader is told to
reference it *only when it is genuinely relevant*, because a forced callback in
every reading is worse than none. This is `src/lib/prompt/memory.ts`.

**The per-day reader summary.** After the user picks a reader, that reader
opens with 1–3 sentences summarizing every reading the user has had *that day*,
in that reader's own voice. Generated once per (user, reader, day, locale) and
cached in `daily_summaries`, because it is read on a page load and must not
cost an LLM call every time. Nothing to summarize means nothing is shown — an
empty state that says "you haven't read today" destroys the effect.

**Why this order.** Frequency needs only `reading_cards`. Chaining needs
`readings.body`. The summary needs both plus a cache and a generation trigger.
Build them in that order.

---

## 6. Latency architecture

Miftah's requirement, restated as an engineering rule: **the database must
never be in the way of a byte the user is waiting for.**

There are no goroutines on Vercel. The equivalent is `after()` from
`next/server`, which runs a callback once the response has been flushed, inside
the same serverless invocation.

```
POST /api/reading
  ├─ verify session          in-memory, JWT, no DB
  ├─ rate limit              in-memory, no DB
  ├─ blocklist check         pure function, no DB
  ├─ read Lotus block        DB — but see below
  ├─ start classifier   ─┐   parallel
  ├─ start reading call ─┘   parallel
  ├─ buffer until the classifier verdict lands, then stream
  └─ after(): write readings, reading_cards, events, update last_seen_at
```

The one unavoidable read is the Lotus block and the chained-reading context.
Both are per-user and change rarely, so they are fetched **in parallel with
nothing else blocking** and cached: the Lotus block in the JWT is tempting and
wrong (it is too large and it goes stale), so it goes in a short-lived
in-process cache keyed by user id, with the DB as the miss path. A cache miss
costs one indexed primary-key lookup.

**Page loads** get the same treatment. The reader picker needs the daily
summary; if it is not in `daily_summaries`, the page renders *without* it and
the summary streams in, rather than the page waiting.

**Failure policy: analytics writes fail silently.** A dropped event is
invisible; a 500 because the event table was busy is not. Every `after()` write
is wrapped and logs on failure. The `readings` write is the one exception worth
retrying, because the memory features degrade without it.

**The escape hatch.** If `after()` ever proves insufficient — a batch job, a
write that outlives the invocation — the replacement is a queue (Vercel Queues
or Upstash QStash) behind the same `track()` interface in
`src/lib/analytics/track.ts`. Nothing outside that file should need to change.
Do not build it now.

---

## 7. Two traps every plan must respect

**The user's calendar day is not UTC and not the server's.** `todayKey()` in
`src/lib/storage.ts` already solves this on the client and its comment explains
why: `toISOString()` rolls the day over at 07:00 in Jakarta. Every server-side
feature keyed to "today" — the daily summary, the daily-card lock, the
"this week" frequency window — needs the *querent's* local date, which the
server does not know. **The client sends its local date; the server stores it
in `local_date` and never recomputes it from `created_at`.** Getting this wrong
means the daily summary appears at 7am and the day's readings split across two
rows.

**The existing prompt-injection defence must survive.** The question goes in
the user turn, inside `<pertanyaan>`, never in the system prompt. Three new
things now also flow into prompts — the Lotus block, the chained-reading
context, and the daily summary's source material — and **all three are derived
from user-typed text.** They are model-facing content, not instructions, and
they must be delimited and labelled as such exactly the way `<pertanyaan>` is.
The Lotus distillation (D10) helps here: it launders free text into a bounded
description before it ever reaches a reading prompt.

---

## 8. Sensitive data, stated plainly

Onboarding question 3b asks the user to describe the most terrible thing they
have witnessed, and names rape, suicide, murder and domestic violence as
examples. Question 3c asks who they love most. This is the most sensitive data
in the product and it is being collected to make a tarot app feel spooky.

That is a legitimate product goal and the plans should deliver it. It also
carries obligations that are not optional:

- **`onboarding_answers.answer_text` is encrypted at rest** with
  `FIELD_ENCRYPTION_KEY`, application-level, so a database dump is not a
  disclosure. AES-256-GCM, key never in the repo.
- **Every free-text question is skippable** and the app works without it. A
  user who declines to describe a trauma still gets a Lotus avatar.
- **The raw answers never reach a reading prompt** (D10). Only the distilled
  block does, and the distillation prompt is explicitly instructed to abstract
  rather than restate — "carries a heavy memory of loss", not the incident.
- **The T&C and the privacy policy name this collection specifically**, say
  what it is used for, and say how to delete it. *(amended, R9: `users.deleted_at`
  does **not** cascade uniformly — that was too blunt. There is a per-table
  erasure contract: `events` survives with `user_id` nulled, which is only
  honest because its props are scalars-only and enforced at runtime, and
  `moderation_flags.question` is redacted immediately. The privacy policy must
  describe the real per-table behaviour, not a blanket cascade.)*
- **The no-therapy rule now binds the distillation too.** A Lotus block that
  says "trauma" hands the reading model a word the base contract forbids.

The moderation gate (D8) and the T&C page are the other half of this: the app
asks about self-harm in onboarding and must refuse to read cards about it in a
reading. That is not a contradiction — one is a fixed, answerable,
skippable question with a stored answer; the other is an open-ended request for
guidance the app is not qualified to give — but the T&C has to articulate the
difference, because a user will notice.

---

## 9. Workstreams

Seven plans, one file each, written in parallel and reconciled against this
document. Ownership is exclusive: if two plans both want to edit
`src/lib/prompt/base.ts`, the owner writes it and the other one describes what
it needs.

| # | Workstream | Plan file | Owns | Depends on |
|---|---|---|---|---|
| W1 | Data layer & schema | `docs/plans/2026-07-26-data-layer.md` | `src/lib/db/**`, every migration, §3, **`src/data/types.ts`** | — |
| W2 | Google auth & session | `docs/plans/2026-07-26-google-auth.md` | `src/lib/auth/**`, `middleware.ts`, `/login`, **the first-sign-in T&C acceptance** | W1 (`users`) |
| W3 | Onboarding & Lotus avatar | `docs/plans/2026-07-26-onboarding-lotus.md` | `src/app/onboarding/**`, `src/lib/prompt/lotus.ts`, **`/account`** | W1, W2 |
| W4 | Analytics & reading history | `docs/plans/2026-07-26-analytics.md` | `src/lib/analytics/**`, the `after()` write path, **`src/lib/llm/**` (the whole interface change, R3)** | W1, W2 |
| W5 | Memory & engagement | `docs/plans/2026-07-26-memory-features.md` | `src/lib/prompt/memory.ts`, `summary.ts`, `queries/frequency.ts` | W1, W4 |
| W6 | Internationalization | `docs/plans/2026-07-26-i18n.md` | `src/lib/i18n/**`, the `.en`/`.id` prompt fork, **`src/lib/prompt/build.ts` + `PromptContext`** | W1 (`users.locale`) |
| W7 | Trust, safety & secrets | `docs/plans/2026-07-26-trust-safety.md` | `src/lib/moderation/**`, `/terms`, `/privacy`, the secrets audit, **`src/lib/ratelimit.ts`** | W1, W6 (bilingual copy) |

*(amended, §2 of the reconciliation: the five bolded entries are files this table
originally left unowned. `build.ts` was the worst of them — three workstreams
each needed to add a field to it and none owned it.)*

### Build order

W1 first and alone — everything imports its schema. Then W2. Then W3, W4 and
W6 in parallel. Then W5, which needs W4's history to exist. W7 last, because
its copy has to be bilingual and its gate wraps a reading path the others have
finished changing.

### Verification

Unchanged from `CLAUDE.md`: Vitest for anything logic-shaped, Windows-Chrome
screenshots for layout, fixed-width containers plus `getBoundingClientRect` for
phone-width geometry, a real iPhone against a Vercel preview for anything
touch-, inset- or install-related. **There is still no Playwright and there
must still not be.** Two additions for this phase:

- **The database makes integration tests possible for the first time.** A
  local `psql` with a test schema, torn down per run. Anything touching
  `src/lib/db/queries/**` gets one.
- **`npm run smoke -- --all` doubles.** Nine readings in Indonesian and nine in
  English, with the Malay grep applied only to the Indonesian half and a new
  check that the three readers are still distinguishable in English.

---

## 10. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| The English readers are flat | The personas' worked examples do the heavy lifting. Translated, they will read as translated. | W6 *rewrites* them natively and the smoke check compares all three side by side with the names covered. |
| The Lotus block makes every reading sound the same | Injecting a fixed persona description into nine prompts a day is a strong attractor. | Keep the block short, tell the model it is background and not the subject, and read the smoke output before believing it works. |
| The chained-reading callback becomes a tic | "As we saw yesterday…" in every single reading destroys the effect it is there to create. | Relevance-gated in the prompt, and worth measuring: log whether the callback appeared. |
| `after()` silently drops writes | Vercel can end an invocation. A missing `readings` row breaks the memory features, not just the analytics. | Log every failure. Treat the `readings` write as the one that gets a retry. |
| Sensitive-answer disclosure | §8. | Encryption, skippability, distillation, and a privacy policy that says so. |
| Schema drift across seven plans | The most likely way this becomes a mess. | §3 is canonical; plans propose deltas, they do not redefine tables. |
