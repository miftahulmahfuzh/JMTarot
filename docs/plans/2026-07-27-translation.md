# V2 — Locale-Tagged Generation & Translation Implementation Plan

> ### AMENDED 2026-07-27 AFTER RECONCILIATION — READ BEFORE THE PLAN BELOW
> `docs/plans/2026-07-27-RECONCILIATION-v0.3.0.md` outranks this file.
>
> 1. **`TRANSLATABLE` covers TWO entities, not four: `reading` and `persona`**
>    (reconciliation §5.1). Drop `daily_summary` and `frequency_verdict`
>    entirely — `daily_summaries` is unique on
>    `(user_id, reader_id, local_date, locale)` and `frequency_verdicts` on
>    `(user_id, window_key, locale)`, so **both are already keyed by locale** and
>    a language switch there is an ordinary cache miss followed by regeneration
>    *in the target language*: one model call, the same cost a translation would
>    have been, and better prose than translating a 45-word greeting. That is
>    VD6's own argument; V3 noticed it reaches two more tables. `readings` cannot
>    regenerate (VD7) and `personas.user_id` is a PK with one `locale` column, so
>    a switch there would overwrite rather than sit beside. Those two keep it.
>    Fields reduce to `reading.body`, `reading.gist`, `persona.body`.
> 2. **The staleness rule you found is ADOPTED** (§5.2) and gets simpler:
>    `translations.updated_at < source.updated_at`, needed only for `personas`
>    (maintains `updated_at` by hand) and `readings` (immutable → compare
>    `created_at`). The `check (source_locale <> locale)` is adopted too.
> 3. **Your event-count worry was unfounded.** Roadmap §6 never listed
>    `translation.failed`; the fifteen fixed names total 59 and
>    `translation.generated` with an `outcome` prop is the shape we want (§4).
> 4. **V7 will NOT call your translator** (§5.5). `/s/[slug]` renders
>    `readings.body` verbatim and does not even read a cached `translations` row:
>    a public page that can trigger a model call is a bill with no ceiling
>    reachable by anyone holding a slug. Remove that line from
>    `## Interfaces I export`'s V7 note.
> 5. The sweep's fourth delete keeps its `to_regclass` guard and keeps
>    `'persona'` in the allowlist from day one, inert until V8 lands. Adopted.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** every piece of generated prose in JMTarot records the language it came
out in, and a language switch **translates** what already exists instead of
showing Indonesian text inside an English app. Plus the bug underneath the
complaint "the language setting resets": a brand-new `en-GB` user is snapped to
Indonesian at row creation by a column default that was never a choice (VD11).

**Architecture:** one generic `translations` table keyed
`(entity, entity_id, field, locale)` (VD5), a **pure** translation contract that
re-enforces every invariant the base contract enforces, a server-only translator
that calls the model and upserts, one streaming `POST /api/translate`, a fourth
delete in the daily sweep that reaps orphans, and two lines in the sign-in upsert
that stamp `users.locale` + `users.locale_source` at creation **only**.

**Tech Stack:** unchanged. Drizzle + postgres.js, `LLMProvider` from
`@/lib/llm`, Vitest (unit + integration), no new dependency of any kind.

---

**Governing documents, highest first:**
`docs/plans/2026-07-27-RECONCILIATION-v0.3.0.md` (not written yet) →
`PUBLIC_RELEASE_ROADMAP_v0.3.0.md` → this file. Everything in `CLAUDE.md`,
`PUBLIC_RELEASE_ROADMAP.md` and `docs/plans/2026-07-26-RECONCILIATION.md` still
binds. VD5, VD6, VD7, VD8 and VD11 are **fixed decisions** — this plan
implements them and does not relitigate them.

**Owns:** `src/lib/translate/**`, `src/lib/db/queries/translations.ts`, the
`translations` table, `users.locale_source`, `src/app/api/translate/route.ts`,
the `<terjemahan>` alternative in `src/lib/prompt/sanitize.ts`, the fourth delete
in `src/app/api/cron/sweep/route.ts`, and the VD11 edits to
`src/lib/db/queries/profile.ts` and `src/app/api/locale/route.ts`.

**Depends on:** W1 (schema, client, harness), W2 (the sign-in path), W4 (the
event taxonomy, `track`, `defer`), W6 (`Locale`, `getLocale`, `resolve.ts`).
**V3, V6, V7 and V8 all call this workstream's translator** — see
`## Interfaces I export`, which is written for them and is the part of this file
they should read first.

---

## 1. What is actually broken, in three parts

### 1.1 There is no way to read yesterday's reading in today's language

`readings.locale` has been correct since W4 and immutable since forever, which
is right (VD7): it is the analytics dimension saying which prompt fork produced
the prose, and overwriting it makes every historic row a different measurement —
the same argument that fixed `latency_ms` as time-to-first-token. What it also
means today is that a querent who reads in Indonesian for a month, then presses
`EN`, gets an English interface wrapped around a month of Indonesian prose. V6's
history screen and V7's share page both make that visible at scale; right now it
is only visible on the post-reading screen, which nobody revisits.

The fix is a **derived row**, never a rewrite (R2, VD7).

### 1.2 The translator is the worst-shaped injection surface in the project

Roadmap §7's first trap, and it deserves restating in this file because the code
that gets written from a one-line summary of it will be wrong:

- **The input is model output that was itself generated from user text.** The
  querent's typed question already passed `sanitizeQuestion`, but the reading
  body is a *model's* rendering of it, and a model that was successfully
  prompt-injected wrote prose that will now be fed to a second model as content.
- **The output goes straight to a screen**, with no reader, no persona and no
  contract between it and the querent.

So the translation prompt is **not** "translate this to English". It carries the
target locale's format rules, the target locale's forbidden vocabulary, the
target reader's voice rules, the word ceiling, and the card-name rule — because
**none of that survives a naive translate instruction**, and `CLAUDE.md` records
the specific failure: the model invents `Pulan` for The Moon. A rule against a
failure the model was never going to make is a rule that does nothing; a missing
rule against a failure it *will* make is a shipped bug.

### 1.3 A new user's language is decided by a column default

`users.locale` is `text not null default 'id'`. The `loc` claim is **first** in
the resolution chain, ahead of the cookie and `Accept-Language`
(`resolveForMiddleware`, D6). So:

```
en-GB browser hits /            -> middleware negotiates 'en', sets jmt_locale=en
                                -> redirect /login, rendered in English
user signs in with Google       -> upsertUserOnSignIn inserts a row
                                -> locale takes the column default: 'id'
                                -> jwt callback sets carried.loc = row.locale = 'id'
next navigation                 -> middleware reads loc='id' FIRST
                                -> the whole app flips to Indonesian
```

**Verified against the code, not assumed.** `upsertUserOnSignIn`'s insert column
list is `(google_sub, email, email_verified, display_name, avatar_url)` and its
`do update set` branch names `email`, `email_verified`, `display_name`,
`avatar_url`, `last_seen_at`, `deleted_at`. `locale` appears in neither. So an
existing user's choice is already safe and **only row creation is wrong** —
which is exactly what VD11 says, and it is why this fix is two lines of SQL and
one column rather than a redesign.

---

## 2. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| T1 | Stream or whole | **Mirror the source artifact, per field.** `reading.body`, `daily_summary.body` and `persona.body` STREAM. `frequency_verdict.body` and `reading.gist` come back WHOLE. | VD8 says "streamed, exactly like a reading", and `CLAUDE.md` records that `DaySummary` streaming while `FrequencyLine` does not was decided separately rather than by consistency: the verdict is one clause of ≤25 words that exists to be read whole, and streaming it buys a second of half-written sentence. A translation of it has exactly the same shape as the thing it translates. Deciding per field rather than per route is what keeps that reasoning intact instead of overriding it by accident. |
| T2 | One content type | **Always `text/plain; charset=utf-8`.** A buffered response is a stream that arrives in one chunk. | The caller writes one reader for both. Two response shapes in one route means two client paths, and the one nobody exercises is the one that breaks. |
| T3 | The prompt | **Not a generic translator. A re-issue of the target locale's contract, with the source as material.** It carries `FORMAT_RULES[target]`, the target reader's `readerPrompt()` block when the field has a reader, the resolved `LENGTH_BUDGET`, and the card/reader-name rule. | §7 trap 1. Every invariant the base contract enforces must be re-enforced, because none of it survives "translate this". The English forbidden list is the longer one, and it is the one that applies when translating *into* English. |
| T4 | Card names | **A mechanical post-check, not only a prompt rule.** Every card name and reader name that appears verbatim in the source MUST appear verbatim in the output. | Card names are English in BOTH locales (Localization rule 1), so this invariant is direction-symmetric and exactly checkable — no NLP, one `includes()` per name. The prompt rule alone is what produced `Pulan`. |
| T5 | Invariant failure | **Never persist it. Repair in `after()`, so the second view is right.** Stream on, verify the accumulated body, and on failure: do not write the row, fire `outcome: 'invalid'`, and run one repair pass off the response path whose result IS persisted. | This is the sharpest trade in the plan and it has a named residual cost — see §4.4. Buffering to verify before the first byte would trade VD8 away; caching an unverified body would trade §7 away. Repairing behind the response keeps both and makes the failure self-healing. |
| T6 | Sanitizing the source | **Strip delimiters PER PARAGRAPH and rejoin. Never `stripUntrusted` on the whole body.** | The exact trap W5 paid for with `gistUserTurn`: `stripUntrusted` collapses newlines, and a reading body without paragraph breaks cannot be translated paragraph-for-paragraph, which is the one structural invariant the output has. The failure would read as a bad prompt, not a bad sanitizer. |
| T7 | The fence | **`<terjemahan>`, one new alternative in `sanitize.ts`'s `DELIMITER`.** Both locales, exactly as `riwayat` was added. | R17's reasoning, unchanged: one token per purpose across both locales. This fences a fifth purpose (model prose being handed back to a model), so it is a fifth alternative and not a locale variant of an existing one. `<translation>` is what an English querent would type, which is precisely why the Indonesian-looking token is the safer one. |
| T8 | Cache validity | **`translations.updated_at < source.updated_at` means stale.** No `source_hash` column. | Roadmap §4's table does not mention this and it is a real gap: `readings.body` is immutable (VD7) so a translation of it can never go stale, but `daily_summaries.body` and `frequency_verdicts.body` are BOTH regenerated in place, and their stale translations would be served forever. Both those tables already carry `updated_at` maintained by hand inside `onConflictDoUpdate` (the `$onUpdate()` trap), so the comparison is free and needs no new column. `readings` has no `updated_at`; it is immutable, so `created_at` is the correct comparand for it. |
| T9 | Authorization | **Ownership is resolved server-side per entity, and a row you do not own 404s exactly like a row that does not exist.** | Without it `/api/translate` is an oracle: POST a uuid, get somebody else's reading back in your language. Distinguishing 403 from 404 would confirm the uuid exists, which is the same reasoning V7 applies to share slugs. |
| T10 | Whose locale | **`await getLocale()`. Never `user.locale`.** | `CLAUDE.md`'s trap, learned three times already (`/api/reading` and both `/api/memory/*`). They agree for a real user because the claim is first in the chain; they diverge under `?lang=`, which is exactly when a screenshot loop is watching. |
| T11 | Rate limiting | **`hit('translate:<uid>')` AND `hitGlobal()`, both checked.** | A translation is an authenticated model call with a user-supplied uuid. `hit` bounds one person; `hitGlobal` bounds a crowd of throwaway accounts. `ratelimit.ts`'s own header says to call both. |
| T12 | `reading.gist` | **Translated opportunistically, off the request path, and the chain block uses whatever exists.** Never blocks a reading. | The gist is prompt input, not screen output. Translating it on the reading path would put a model call in front of a byte the user is waiting for. If no translation exists, the chain uses the original and the base contract's own rule — *"Write in ENGLISH even if the text you are reading is written in another language"* — already covers it. That rule exists for exactly this. |
| T13 | Events | **One new name, `translation.generated`, with an `outcome` prop.** No `translation.failed`. | Roadmap §6 fixes fifteen names and reconciliation checks the count reaches 59. A sixteenth would break that count. `memory.gist_failed`'s `fell_back` is the precedent for carrying the failure in a prop. Flagged in `## Open questions` in case reconciliation prefers a 60th name. |
| T14 | The orphan sweep | **LAST of the four deletes, and forward-compatible via `to_regclass`.** | Order is not alphabetical and the existing header says so: the user purge runs first and CASCADEs readings away, so translations orphaned by that purge are reaped in the SAME invocation rather than a day later. `to_regclass` is what lets V2 write the delete before V8's `personas` table exists without V8 having to come back and edit it. |
| T15 | VD11 | **Stamp `locale` + `locale_source` on INSERT only. Never in the conflict branch.** Both creation paths: the CTE and `purgeAndRecreate`. | Roadmap §4's note. Stamping over `'chosen'` would silently overwrite an explicit choice every time someone signs in from a foreign browser. |
| T16 | `locale_source` NULL | **Treated as `'chosen'`.** Nothing overwrites it today. | Roadmap §4: pre-v0.3.0 rows have been using the app in whatever it gave them and may well have pressed the toggle. The conservative reading is the only safe one, and the helper exists so a future writer cannot get it wrong by reading the column raw. |
| T17 | `'negotiated'` vs `'default'` | **`'default'` when there was NO signal at all** — no header, no cookie, no `Accept-Language`. | Otherwise the column lies. `negotiate(null)` returns `'id'`, and stamping that as `'negotiated'` records a negotiation that never happened — which destroys the column's only purpose, which is telling a default apart from a decision. This is why VD11's enum has three values and not two. |

---

## 3. The `translations` table and its query module

### 3.1 The table

Roadmap §4 verbatim; the drizzle definition is in `## Schema deltas`. Three
things about it that are load-bearing:

**`entity_id` has no foreign key and that is a deliberate cost.** Postgres cannot
declare a polymorphic FK. Orphans are possible and §8 is the answer. The
alternative — four nullable typed FK columns, or four tables — is four migrations
for every future artifact, against one cleanup statement.

**`source_locale` is stored, not derived.** It is what the row was translated
FROM, and it is the only thing that makes the row auditable after the source is
gone: a translation whose `source_locale` equals its `locale` is a bug, and there
is a check constraint saying so.

**`prompt_version` is hand-bumped, not hashed.** `MEMORY_PROMPT_VERSION`'s
reasoning applies exactly: `readings.prompt_version` is a hash because a
reading's prompt is three independently-changing layers and nobody would bump a
constant; the translation prompt is one function in one file, and the column is
read to decide whether a CACHED ROW is stale. A hash would invalidate every
translation in the table on a whitespace edit.

### 3.2 The query module

`src/lib/db/queries/translations.ts`. **Every rule in `profile.ts`'s header
binds**, and `contract.test.ts` enforces the sharpest one mechanically: its regex
is `export\s+(?:async\s+)?function\s+(\w+)\s*\(\s*(\w+)` and it asserts the first
parameter is literally named `db`. Two consequences worth stating before anyone
writes a line:

- **No arrow-function exports.** `export const getTranslation = async (db, …)`
  slips past that regex entirely, which means it is *unchecked*, not allowed.
  Declarations only.
- **Nothing stateful lives here.** Same wall W3 hit with the Lotus cache and W5
  hit with `windowBounds`: a function with no handle to take does not belong in
  `queries/`. `TRANSLATABLE`, the invariant checker and the prompt all live in
  `src/lib/translate/contract.ts`.

Four functions, and no fifth:

```ts
getTranslation(db, key)                 -> Translation | null
putTranslation(db, input)               -> Translation      // upsert, updatedAt by hand
deleteTranslationsFor(db, entity, id)   -> number            // V7/V8 revocation + tests
deleteOrphanTranslations(db)            -> number            // §8
```

`putTranslation` sets `updatedAt: new Date()` **inside** `onConflictDoUpdate`.
Drizzle's `$onUpdate()` does not fire there — it applies to `db.update()` only —
and for this table that column is the *entire* staleness mechanism (T8), so
dropping the line freezes it at the first insert and every regenerated summary
serves a stale translation forever.

---

## 4. The translator

### 4.1 The split, and why it is forced

```
src/lib/translate/
  contract.ts    PURE. The registry, the prompt, the sanitizer, the invariant
                 checker, the fallback. No DB, no provider, no server-only.
  translate.ts   server-only. The model call, the verification, the repair pass,
                 the upsert, the event.
```

Identical to `lotus.ts` / `lotus.generate.ts` and `memory.ts` /
`gist.generate.ts`, and for the identical reason: everything with an interesting
failure mode — the prompt, the sanitizer, the card-name check — is unit-testable
with no provider and no database, and the moment a model call lives beside it
that stops being true.

`contract.ts` carries prompt prose, so it **must** be fenced from the client. Add
`@/lib/translate/` to `clientBoundary.test.ts`'s prompt-layer rule (Task 6).
It does not carry `import 'server-only'`: W7's `vitest.config.ts` aliases that
package away, so the marker is free, but `contract.ts` is imported by
`scripts/smoke-llm.ts` and the smoke script sets
`NODE_OPTIONS=--conditions=react-server` for exactly this. Put the marker on
`translate.ts` only, where the provider and the database actually are.

### 4.2 The registry

One const in `contract.ts` naming what is translatable and how each field
behaves. Everything else reads it, including the route, the sweep and the tests:

```ts
export type TranslatableEntity =
  | 'reading' | 'daily_summary' | 'frequency_verdict' | 'persona';

export type TranslatableField = 'body' | 'gist';

export type FieldSpec = {
  /** T1. Does the SOURCE artifact stream? Then so does its translation. */
  stream: boolean;
  /** Does the source have a reader whose voice rules must be carried? */
  voiced: boolean;
  /** Which ceiling applies. `null` = the source's own length is the ceiling. */
  budget: 'service' | 'summary' | 'frequency' | 'gist';
};

export const TRANSLATABLE: Record<`${TranslatableEntity}.${TranslatableField}`, FieldSpec>
```

`reading.body` `{stream: true, voiced: true, budget: 'service'}`;
`reading.gist` `{stream: false, voiced: false, budget: 'gist'}`;
`daily_summary.body` `{stream: true, voiced: true, budget: 'summary'}`;
`frequency_verdict.body` `{stream: false, voiced: false, budget: 'frequency'}`;
`persona.body` `{stream: true, voiced: false, budget: 'summary'}` — house voice,
VD16.

### 4.3 The prompt

`buildTranslationPrompt(args): CompletionPrompt`. Structure, in the order the
model reads it:

1. **The task, stated as a re-issue and not as a translation.** *"You are
   re-writing this reading in English. It was written in Indonesian by the same
   reader. Produce the English the reader would have written, not a rendering of
   the Indonesian."* This framing is the single biggest lever on whether Margaret
   comes back as Margaret or as Thessaly with longer words (roadmap §9's risk).
2. **`readerPrompt(reader, target)`** when `spec.voiced`. The target locale's
   persona block, verbatim — the same string a native reading of that reader
   would have carried.
3. **`FORMAT_RULES[target]`.** Not `BASE_CONTRACT` — this is not a reading and
   telling a model it is a tarot reader writing one reading in one pass while
   asking for a translation produces a new reading. Same call `side.ts`/W5 made.
4. **The names block.** The card names and reader names extracted from the source
   by `namesIn(source)`, listed explicitly, with the rule stated against them:
   *"These appear in the text below. Reproduce each EXACTLY, in English, with its
   article and capitals. Never translate one, never invent another, never gloss
   one in brackets."* Handing the model the list is what makes rule 4's mechanical
   check pass rather than merely detect.
5. **The word ceiling**, from `budgetFor(target, service, reader)` for
   `budget: 'service'`, `SUMMARY_MAX_WORDS` for `'summary'`,
   `FREQUENCY_MAX_WORDS` for `'frequency'`, and the gist cap for `'gist'` —
   restated LAST, after the thing that invites elaboration. That is the pattern
   `services.ts`, the day summary and the frequency verdict all converged on
   independently, and W5 recorded that both of its generated prompts overshot on
   the first real run until it was applied.
6. **Paragraph structure.** *"The text below has N paragraphs. Produce exactly
   N, in the same order."* N is counted in code and interpolated. Without it a
   four-paragraph spread comes back as one block and V6's `ReadingView` renders
   a wall.

The user turn is the sanitized source inside `<terjemahan>…</terjemahan>`, and
nothing else. Same shape as `<pertanyaan>`: rules where rules live, material
where material lives (M10).

`maxTokens` is `translationMaxTokens(sourceChars)`:
`min(1200, max(180, ceil(sourceChars / 2)))`. **A runaway guard, not the length
control** — the same relationship `MAX_TOKENS.spread3` has to the 40-word rule.
Indonesian tokenizes at roughly 3.2 characters per token on an English-tuned BPE
and English at roughly 4, so `chars / 2` is comfortably double in both
directions.

### 4.4 Verification, repair, and the residual cost

`verifyTranslation(source, output, spec, target): Violation[]` — pure, and it is
the function every test in this workstream leans on:

| Violation | Check |
|---|---|
| `card_name` | every name from `namesIn(source)` appears verbatim in `output` |
| `reader_name` | same, for `Thessaly` / `Margaret` / `Adrian` |
| `paragraphs` | paragraph count matches the source's |
| `markdown` / `emoji` | the smoke script's own regexes, lifted |
| `forbidden` | the target locale's therapy list |
| `tic` | the `en` generic-mystic list, when target is `en` |
| `malay` | the eleven Malay words, **when target is `id` only** (W6 rule 4) |
| `budget` | paragraph ceiling and total band for the resolved budget |
| `empty` | nothing usable came back |

The flow in `translate.ts`:

```
cached & fresh                    -> return it, outcome 'cached', no model call
generate  ->  verify  ->  clean   -> persist, outcome 'ok'
                      ->  dirty   -> DO NOT persist, outcome 'invalid',
                                     defer() one repair pass naming the
                                     violations; if the repair verifies,
                                     persist it, outcome 'repaired'
call throws / empty               -> DO NOT persist, outcome 'failed',
                                     caller falls back to the SOURCE
```

**The residual cost, stated out loud:** on a streamed field, the first viewer of
a failed translation sees the failed translation once. The stream is already on
the wire by the time the body is complete enough to check, and the two
alternatives are both worse — buffering to verify before the first byte trades
VD8 away for every translation to protect the failing minority, and caching an
unverified body trades §7 away permanently. Repairing behind the response means
the cache is never poisoned and the second view is correct.

**If the measured `invalid` rate is above about 2%, fix the prompt, not the
architecture.** `translation.generated`'s `outcome` prop is how that rate is
knowable at all; a design where failures are invisible is the one that would
justify buffering.

**Never log the driver error, and never log the LLM client error.** A postgres
error quotes its bound parameters and one of them is the translated body — a
rendering of a reading that answered the querent's typed question. An LLM client
error can carry the whole prompt, which contains the source verbatim. Production
logs the error's class; development prints everything, because there is nobody to
leak it to. Same rule and same reason as `flush.ts`, `log.ts` and
`gist.generate.ts`.

### 4.5 The fence

One character-level change in `sanitize.ts`:

```ts
const DELIMITER = /<\s*\/?\s*(?:pertanyaan|penanya|jawaban|riwayat|terjemahan)(?:[^>]*)>/gi;
```

and a paragraph in that file's header comment following `riwayat`'s exactly:
what the tag fences, why it is one token in both locales, and why it is a fifth
purpose rather than a locale variant. The multi-pass loop already covers the new
alternative for free — it loops over the whole alternation precisely so that the
two halves left by removing one tag cannot spell a different one.

`sanitize.ts` is the ONE prompt module a client component may import
(`Draw.tsx` reads `MAX_QUESTION_LENGTH`), and `clientBoundary.test.ts` keeps
that exception honest by asserting the file carries no prompt prose. A regex
alternative and a doc comment are not prose; the sentinels are unaffected.

### 4.6 Sanitizing the source

`sanitizeSource(raw): string` in `contract.ts`:

```
split on /\n\s*\n/  ->  stripUntrusted each paragraph  ->  drop empties
                    ->  rejoin with '\n\n'
```

Never `stripUntrusted(whole)`. This is `gistUserTurn`'s trap arriving a second
time and it is worth the two extra lines: `stripUntrusted` collapses `\r\n\t` to
spaces, so a four-paragraph reading arrives as one paragraph, the "produce
exactly N paragraphs" instruction becomes "produce exactly 1", and the output is
a wall of text that looks like a prompt failure rather than a sanitizer failure.

---

## 5. `POST /api/translate`

```
POST /api/translate
{ "entity": "reading", "entityId": "<uuid>", "field": "body" }
->  200 text/plain     the translation (streamed iff TRANSLATABLE[k].stream)
->  204                the source is ALREADY in the viewer's locale: render it as-is
->  400                unknown entity/field pair, or a malformed uuid
->  404                no such artifact, OR not yours (T9 — they are the same answer)
->  429                rate limited
```

- `requireUser()` first, `hit()` + `hitGlobal()` second, both before any read.
- `const locale = await getLocale()` — **T10**, and the reason it matters here is
  the same one that made the first English screenshot lie.
- Ownership: `resolveTranslatable(db, entity, entityId, userId)` returns
  `{ body, sourceLocale, readerId, serviceId, sourceUpdatedAt } | null`. One
  query per entity, each one filtering on `user_id` in the same statement — never
  "fetch then compare", which is one refactor away from not comparing.
- `zod` for the body, exactly like `/api/onboarding/*` and `/api/auth/dev-session`
  already do. The uuid shape is checked before it reaches a query so a malformed
  id is a 400 and not a driver error carrying the parameter into a log.
- `maxDuration = 30`, `runtime = 'nodejs'`, `cache-control: private, no-store`,
  `x-accel-buffering: no` on the streamed path — the `/api/memory/summary`
  header set, unchanged.
- The write is in `after()`. Nothing about persistence is on the path of a byte.

**The streamed path pulls the first chunk before the headers go out**, exactly as
`/api/memory/summary` does, so a call that dies before its first token becomes a
clean fallback rather than a 200 with an empty body that the client has to
special-case.

**V7's public share page must NOT call this route.** `/s/[slug]` has no session,
so `requireUser()` would 401 it, and loosening that would hand the world an
oracle. V7 authorizes through the slug and calls `translateOrCached()` directly —
see `## Interfaces I export`.

---

## 6. VD11 — locale at row creation

### 6.1 The cookie IS available in the Node sign-in path. Verified.

The brief asked me to verify this rather than rely on it. The chain, each link
checked against the file:

1. `src/middleware.ts`'s matcher is
   `'/((?!_next/|cards/|dukuns/|favicon|icon|apple-icon|manifest|sitemap|robots).*)'`.
   `/api/auth/callback/google` matches — nothing in that negative lookahead
   excludes it.
2. `gate.isPublic()` returns true for `/api/auth/`, so the request is `{kind:
   'next'}` and `respond()` returns
   `NextResponse.next({ request: { headers } })` with `x-jmt-locale` set.
3. Middleware sets `jmt_locale` on the response whenever it disagrees with the
   request — including on the `NextResponse.redirect` that sends a signed-out
   visitor from `/` to `/login`. So by the time anyone reaches a sign-in button
   the cookie exists.
4. The cookie is `sameSite: 'lax'`, and Google's callback is a top-level GET
   navigation, which is precisely the case `lax` permits. It is sent.
5. `src/app/api/auth/[...nextauth]/route.ts` is `runtime = 'nodejs'` and exports
   Auth.js's handlers directly; the `jwt` callback runs inside that request's
   async context, so `await headers()` and `await cookies()` from `next/headers`
   resolve there.

**Two independent signals, so link 5 is not load-bearing on its own.** The helper
reads, in order: the `x-jmt-locale` header middleware forwarded, then the
`jmt_locale` cookie, then `Accept-Language` (which Google's callback carries from
the browser regardless of any of the above), then `'default'`. Task 15's test
covers all four rungs as a pure function, and Task 17 verifies the real thing
through `POST /api/auth/dev-session` with an `Accept-Language: en-GB` header —
which exercises the same `upsertUserOnSignIn` the Google callback uses.

**If link 5 turns out to be false** — if `headers()` throws inside the callback
because @auth/core has stepped outside the request context — the alternative is
already sketched and costs one file: wrap `handlers.GET/POST` in
`route.ts` with an `AsyncLocalStorage` that captures the negotiated locale from
the `Request` before delegating, exactly as `withAnalytics` captures its context.
Do not reach for that first; it is more machinery, and the measurement in Task 17
will say whether it is needed.

### 6.2 The shape

```ts
// src/data/types.ts — beside Locale, for the same reason Locale lives there:
// schema.ts must reach it without @/lib/db acquiring an @/lib dependency.
export type LocaleSource = 'default' | 'negotiated' | 'chosen';

// src/lib/i18n/resolve.ts — PURE, edge-safe, no next/headers.
export function resolveForSignIn(
  headerLocale: string | null | undefined,
  cookieLocale: string | null | undefined,
  acceptLanguage: string | null | undefined,
): { locale: Locale; source: 'negotiated' | 'default' };

// src/lib/i18n/locale.ts — T16, so nobody reads the column raw.
export function effectiveLocaleSource(v: string | null | undefined): LocaleSource;
```

`resolveForSignIn` returns `source: 'default'` **only** when all three inputs are
absent or unusable — T17. `effectiveLocaleSource(null)` is `'chosen'` — T16.

### 6.3 The edits

**`SignInUpsertInput`** gains `negotiatedLocale: Locale` and
`localeSource: 'negotiated' | 'default'`. Required, not optional: an optional
field is one that three of the four call sites forget.

**The CTE** gains two columns in the INSERT list and nothing in `do update set`:

```sql
insert into users (google_sub, email, email_verified, display_name, avatar_url,
                   locale, locale_source)
values (…, ${input.negotiatedLocale}, ${input.localeSource})
on conflict (google_sub) do update set
  email = excluded.email, …            -- UNCHANGED. locale is NOT here and
  …                                    -- must never be. T15.
```

**`purgeAndRecreate`** gains the same two on its `.insert(users).values({…})`.
It is a second creation path and roadmap §4 says so explicitly; a fix that covers
one of two creation paths is a fix that works until someone rage-quits and comes
back.

**`setUserLocale`** gains a **required** fourth parameter:

```ts
setUserLocale(db, userId, locale, source: LocaleSource): Promise<void>
```

and sets both columns. Required rather than defaulted, because the default that
would be chosen (`'chosen'`) is right for today's one call site and wrong for
whichever one is added next.

**`POST /api/locale`** passes `'chosen'`, and **the ordering constraint in its
header is untouched**: `setUserLocale` before `refreshSession()`, never in
`after()`. That header explains why at length — the jwt `update` branch ignores
its payload and re-reads the row, so a deferred write means the refresh
re-stamps exactly the stale claim the route exists to replace, the cookie is
right, middleware reads the claim, and the switch reverts with nothing logged.
Adding a parameter to the call does not move the call. **Do not move the call.**

**`auth.ts`** reads the negotiated locale once, in the `trigger === 'signIn'`
branch, before the upsert, and passes it through. It reads `await headers()`;
if that throws, it falls back to `{ locale: DEFAULT_LOCALE, source: 'default' }`
rather than failing the sign-in — the whole point of the column is that
`'default'` is an honest value.

---

## 7. The locale-tag audit (VD6, and `readings.gist`)

| Artifact | Locale tag | Status |
|---|---|---|
| `readings.body` | `readings.locale` | ✓ present, immutable (VD7) |
| `readings.gist` | **inherits `readings.locale`** | ✓ confirmed — see below |
| `daily_summaries.body` | `daily_summaries.locale` | ✓ present, in the unique key |
| `frequency_verdicts.body` | `frequency_verdicts.locale` | ✓ present, in the unique key |
| `lotus_avatars.summary` | jsonb keyed by locale | **GRANDFATHERED (VD6)** |
| `personas.body` | `personas.locale` | V8 adds it |
| `translations.body` | `locale` + `source_locale` | this workstream |

**`readings.gist` has no locale column and does not need one — confirmed by
reading the code, not by assuming.** `extractGist({ readingId, body, locale })`
is called with the reading's own locale, and `gistPrompt(locale)` is
locale-forked, so the gist is by construction in the same language as the body it
was distilled from. A separate column would be a second place for one fact to be
recorded and a first place for the two to disagree. **Write that in
`schema.ts`'s comment on the column**, because the absence currently looks like
an oversight and the next person to notice it will add the column.

**`lotus_avatars.summary` stays `jsonb` keyed by locale, and the asymmetry is
deliberate (VD6).** It is not translated; it is *distilled per locale from the
same source answers*, which produces better prose than translating one into the
other, and it is already built and shipped. Widening `translations` to cover it
would mean rewriting a working W3 path for symmetry alone. **Say this in
`schema.ts` next to the column**, in those words — VD6 explicitly asks for it,
because the asymmetry looks like an oversight to anyone who arrives at this table
from `translations`.

Task 4 turns this table into a test that reads `schema.ts` off disk, in the
`contract.test.ts` style — cheap, no database, and it fails when a future
workstream adds a generated-prose table without a locale tag.

---

## 8. The sweep's fourth delete

W7 owns `src/app/api/cron/sweep/route.ts`; **V2 writes the delete and V7 reviews
it** (roadmap §4). The route gains one `try` block calling one query function,
and its header comment gains a fourth numbered paragraph. The count in the
response object gains `orphanedTranslations`.

**It runs LAST.** The existing header says the order matters and is not
alphabetical: erasure runs first so a purged user's rows are gone before the
other sweeps walk the same tables. That argument extends exactly — the user purge
CASCADEs `readings`, `daily_summaries` and `frequency_verdicts` away, and their
translations become orphans *during this invocation*. Reaping last catches them
the same night; reaping first leaves them a day.

`deleteOrphanTranslations(db)` is one statement per entity, each guarded by
`to_regclass` so a table that does not exist yet is skipped rather than raising:

```sql
delete from translations t
 where t.entity = 'reading'
   and not exists (select 1 from readings r where r.id = t.entity_id)
```

plus a final arm that deletes rows whose `entity` is not in
`TRANSLATABLE_ENTITIES` at all — a value that no longer means anything can never
be resolved and would otherwise accumulate forever.

**The `to_regclass` guard is what makes `'persona'` safe before V8 lands.**
Without it there are two bad options: leave `persona` out of the allowlist, in
which case the unknown-entity arm deletes every persona translation the moment
V8 ships one; or leave it in with no orphan check, in which case V8 has to
remember to come back. The guard means `'persona'` is in the allowlist from day
one, its orphan arm is written from day one, and it simply does nothing until the
table exists.

---

## 9. Verification

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm test -- translate            # contract, invariants, sanitizer, registry
npm test -- i18n                 # resolveForSignIn, effectiveLocaleSource
npm test -- sanitize             # the fifth alternative, and the multi-pass loop
npm run db:up && npm run test:integration -- 'translations|profile|sweep'
npm run smoke -- --translate     # SIX real translations. READ THEM.
npm run build                    # never skip it: typecheck green is not enough
```

### `npm run smoke -- --translate`

Roadmap §8: *"take one Indonesian reading of each reader, translate it, and run
the English tic list and the card-name check over the result."* What it actually
runs, and it runs both directions:

- **Three `id -> en`.** One `spread3` per reader, FIXED hands (the `--fixed`
  dealer, so two runs are comparable), generated live and then translated. Both
  texts printed adjacently.
- **Three `en -> id`.** The same three hands the other way. **This is where the
  Malay grep belongs** — the eleven words run against the `id` OUTPUT, which is
  W6 rule 4 applied correctly rather than as theatre. Running Malay words against
  English output would be the theatre.
- Over every translation: card names verbatim against the picks, reader names,
  markdown, emoji, paragraph count against the source, the target locale's
  therapy list, and — `en` targets only — the generic-mystic tic list and the
  closing-offer check.
- **The two voice proxies from `--all`, over the translations rather than over
  native output**, because roadmap §9's named risk is *"Margaret translated by a
  generic prompt comes back as Thessaly with longer words"* and that risk is
  invisible to every check above:
  - contraction rate on the `en` translations: Adrian > 0, Margaret == 0. FAIL.
  - mean sentence words: Margaret ≥ 1.5 × Thessaly. FAIL.
- The paragraph ceiling from `budgetFor(target, 'spread3', reader)`: FAIL.
- The total band: FAIL, **and if the first run fails on the band that is data,
  not a bug.** Record the numbers and tune once, exactly as Margaret's 55 was
  tuned across five runs. Do not widen the band to make the run green.
- A closing instruction in the same register as `--summary`'s: *cover the names
  and read the three translations. Can you still tell who wrote which? If not,
  the fix is the persona blocks the translation prompt carries, not the code.*

It calls `buildTranslationPrompt` and the provider directly — **no database, no
route** — exactly as `--summary` and `--frequency` do.

### What cannot be automated

**Stop the database and open a translated reading.** It must fall back to the
source prose with nothing but a log line. That is the literal statement of the
requirement, it takes ten seconds, and it is the check that found W4's real bugs.

---

## Tasks

Each task: write the failing test, run it, watch it fail for the right reason,
write the minimal implementation, run it, commit. Every npm call is prefixed
`export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH`.

### Task 1 — `LocaleSource`, and the NULL rule

1. `src/lib/i18n/locale.test.ts` — a NEW file; `negotiate.test.ts` already
   covers `locale.ts`'s other half and should not grow a second concern:
   `effectiveLocaleSource(null)` and
   `effectiveLocaleSource(undefined)` are `'chosen'`; `'default'`,
   `'negotiated'` and `'chosen'` round-trip; anything else is `'chosen'`.
2. `npm test -- i18n` → red.
3. Add `LocaleSource` to `src/data/types.ts` beside `Locale`, and
   `effectiveLocaleSource` to `src/lib/i18n/locale.ts`.
4. `npm test -- i18n` → green. Commit.

### Task 2 — `resolveForSignIn`

1. `src/lib/i18n/resolve.test.ts`: header wins over cookie wins over
   `Accept-Language`; a bad header falls through to the cookie rather than to the
   default; `('en','en','id')` → `{locale:'en', source:'negotiated'}`;
   `(null,null,'en-GB,en;q=0.9')` → `{locale:'en', source:'negotiated'}`;
   **`(null,null,null)` → `{locale:'id', source:'default'}`** and NOT
   `'negotiated'` (T17); `(null,null,'zz')` → `'default'`, because an
   unparseable header is not a negotiation.
2. Red. Implement in `resolve.ts` using the existing `isLocale` and `negotiate`.
   No `next/headers`, no `server-only` — this file is edge middleware's
   dependency and must stay importable by Vitest.
3. Green. Commit.

### Task 3 — the `translations` table

1. Append `translations` to `schema.ts` exactly as `## Schema deltas` states,
   plus `locale_source` on `users`, plus the two comment paragraphs §7 requires
   on `readings.gist` and `lotus_avatars.summary`.
2. `npm run db:generate -- --name v2-translations-and-locale-source`
3. Read the generated `.sql` before applying it. Confirm: no `pgEnum`, the unique
   constraint and index are both there, `entity_id` has **no** FK, and
   `locale_source` is nullable with no default.
4. `npm run db:up && npm run db:migrate`
5. Commit `schema.ts`, the `.sql` **and** `meta/` together — a `.sql` without its
   journal entry is invisible to the migrator and a journal entry without its
   `.sql` crashes it.

**`drizzle-kit push` is banned.** `generate` + `migrate` only.

### Task 4 — the locale-tag audit test

1. `src/lib/db/locale-tag.test.ts` (unit; reads `schema.ts` off disk, the
   `contract.test.ts` technique): every table in a named list declares a
   `locale` column; `lotus_avatars` is asserted to be the ONE exception AND to
   carry the VD6 comment; `personas` is asserted only if the table exists.
2. Red on `translations` if Task 3's comment work was skipped; green after.
   Commit.

### Task 5 — the `<terjemahan>` fence

1. `src/lib/prompt/sanitize.test.ts`: `<terjemahan>` and `</terjemahan>` are
   stripped in any casing and with attributes; the multi-pass case
   `'</terje<terjemahan>mahan>halo'` → `'halo'`; the cross-tag case
   `'</terje<pertanyaan>mahan>halo'` → `'halo'`.
2. Red. Add one alternative to `DELIMITER` and one paragraph to the header.
3. Green. Also re-run `npm test -- clientBoundary` — the sentinel test asserts
   `sanitize.ts` carries no prompt prose, and a doc comment about a tag is not
   prose. Commit.

### Task 6 — fence `@/lib/translate/**` from the client

1. `src/lib/clientBoundary.test.ts`: extend the prompt-layer rule to
   `@/lib/translate/`, no exception.
2. Green immediately (nothing imports it yet) — that is fine; this is the fence
   going up before the wall, on purpose. Commit.

### Task 7 — the registry and `sanitizeSource`

1. `src/lib/translate/contract.test.ts`: `TRANSLATABLE` has exactly the five
   keys; `reading.body.stream` is true and `frequency_verdict.body.stream` is
   false; **`sanitizeSource` preserves paragraph breaks** on a four-paragraph
   body (the `gistUserTurn` trap) while `stripUntrusted` on the same input does
   not; a `<terjemahan>` inside a paragraph is stripped; empty paragraphs are
   dropped.
2. Red. Implement `contract.ts`'s registry and `sanitizeSource`.
3. Green. Commit.

### Task 8 — `namesIn` and `verifyTranslation`

1. Same test file: `namesIn` finds every card name present in a body and nothing
   else (`'The Moon'` yes, `'moon'` no, a reader's name yes);
   `verifyTranslation` returns `[]` on a clean pair; returns `card_name` when
   `The Moon` became `Pulan`; returns `paragraphs` on a 4→1 collapse; returns
   `malay` **only** when the target is `id`; returns `tic` only when the target
   is `en`; returns `budget` when a paragraph is over the resolved ceiling.
2. Red. Implement. Lift the regexes from `scripts/smoke-llm.ts`'s `check()`
   rather than rewriting them — two copies of the Malay list is how `tempoh`
   went missing the first time.
3. Green. Commit.

### Task 9 — `buildTranslationPrompt`

1. Same test file: the target reader's persona block appears verbatim for a
   voiced field and is absent for an unvoiced one; `FORMAT_RULES[target]` is
   present and `BASE_CONTRACT` is **not**; every name from `namesIn(source)`
   appears in the names block; the resolved `maxParagraphWords` is interpolated
   and equals `budgetFor(...)` — the `LENGTH_BUDGET` drift guard, applied here
   the same way the smoke script applies it to readings; the source appears
   inside `<terjemahan>` and nowhere else; the paragraph count is stated;
   **a `Localized<>` object never reaches a template literal** (grep the built
   system string for `[object Object]` — W6 shipped that into all nine prompts
   with a green typecheck).
2. Red. Implement. `npm test -- translate` green. Commit.

### Task 10 — the query module

1. `src/lib/db/queries/translations.integration.test.ts` (`npm run db:up`
   required): `getTranslation` misses cleanly; `putTranslation` inserts;
   a second `putTranslation` on the same key UPDATES and **moves `updated_at`**
   (the `$onUpdate()`-inside-`onConflictDoUpdate` trap — assert the timestamp
   actually moved, not merely that the body changed);
   `deleteTranslationsFor` removes both fields of one entity and nothing else.
2. Red. Implement `queries/translations.ts`. **Declarations only, `db` first** —
   `contract.test.ts` will fail the build otherwise.
3. `npm run test:integration -- translations` green. `npm test -- contract` green.
   Commit.

### Task 11 — `deleteOrphanTranslations`

1. Same integration file: a translation whose `reading` was deleted is reaped; a
   translation whose reading still exists is not; a row with
   `entity = 'nonsense'` is reaped; a row with `entity = 'persona'` is
   **untouched** while the `personas` table does not exist (the `to_regclass`
   guard, and this is the assertion that stops V8 losing data).
2. Red. Implement. Green. Commit.

### Task 12 — the sweep's fourth delete

1. Extend `src/app/api/cron/sweep/*.integration.test.ts` (or add one in its
   style): the response body carries `orphanedTranslations`, and a translation
   orphaned by the **user purge in the same invocation** is gone by the end of
   it — which is the assertion that pins the ordering.
2. Red. Add the fourth `try` block, LAST, plus the fourth numbered paragraph in
   the route header. Log the error's CLASS only.
3. Green. Commit.

### Task 13 — `translation.generated`

1. `src/lib/analytics/events.test.ts`: the name is in `EVENT_NAMES`, the map has
   a shape for it, both compile-time guards still hold, **and the total is 45**
   (44 + 1; reconciliation checks the release total reaches 59 across all eight
   workstreams).
2. Red. Add the name and the prop shape from `## Event deltas`. **No free text**
   — `chars` is a length and `outcome` is a closed classifier.
3. Green. Commit.

### Task 14 — `translate.ts`

1. `src/lib/translate/translate.test.ts` with a fake provider (`src/lib/llm/fake.ts`
   already exists): a clean generation persists and returns `'ok'`; a dirty one
   does **not** persist and returns `'invalid'`; a throwing provider returns
   `'failed'` and persists nothing; a fresh cached row short-circuits with **no
   provider call at all** (assert the call count — this is the one that decides
   whether the feature costs one model call or one per view); a row older than
   its source's `updated_at` is treated as stale and regenerated (T8).
2. Red. Implement `translate.ts`: `import 'server-only'`, dynamic
   `import('@/lib/db/client')` for the handle with an optional handle parameter
   last (W4's `flush.ts` shape, so the integration suite can pass its
   rolled-back transaction in), the repair pass in `defer()`, the event, and
   `logFailure` printing only the error's class in production.
3. Green. Commit.

### Task 15 — the sign-in stamp

1. `src/lib/db/queries/profile.integration.test.ts`: a **created** row carries
   the negotiated locale and `locale_source = 'negotiated'`; a created row with
   no signal carries `'default'`; **a second sign-in with a different negotiated
   locale does NOT move `users.locale` and does NOT move `locale_source`** —
   this is T15 and it is the assertion that stops a future tidy-up from adding
   `locale` to the conflict branch; `purgeAndRecreate` stamps both (drive it by
   inserting a row with `deleted_at` older than the grace period).
2. Red. Add the two columns to the CTE's insert list and to
   `purgeAndRecreate`'s `.values({…})`. Add the two required fields to
   `SignInUpsertInput`. **Do not touch `do update set`.**
3. Green. Commit.

### Task 16 — `setUserLocale` and `POST /api/locale`

1. Integration: `setUserLocale(db, id, 'en', 'chosen')` writes both columns; a
   soft-deleted user is still excluded.
2. Red. Add the required fourth parameter. Update the one call site in
   `/api/locale` to pass `'chosen'`, **without moving it** — it stays before
   `refreshSession()` and out of `after()`, for the reason that route's header
   spends twenty lines on.
3. Green. `npm run typecheck` catches any missed call site. Commit.

### Task 17 — the sign-in path, end to end

1. `auth.ts`'s `trigger === 'signIn'` branch reads the negotiated locale via
   `await headers()` and passes it to the upsert, with a `try/catch` falling back
   to `{ locale: DEFAULT_LOCALE, source: 'default' }` rather than failing the
   sign-in.
2. **Verify link 5 of §6.1 for real**, because it is the one claim that cannot be
   unit-tested:

   ```sh
   npm run db:up && npm run dev
   curl -i -X POST localhost:3001/api/auth/dev-session \
        -H 'content-type: application/json' \
        -H 'accept-language: en-GB,en;q=0.9' \
        -d '{"username":"v2test"}'
   npm run db:studio     # users where google_sub = 'dev:v2test'
   ```

   Expect `locale = 'en'`, `locale_source = 'negotiated'`. If `headers()` throws
   inside the callback, the row will say `'id'`/`'default'` — take the
   `AsyncLocalStorage` alternative in §6.1 and record the measurement in this
   file.
3. Commit.

### Task 18 — `resolveTranslatable` and the route

1. Integration: `resolveTranslatable` returns the row for its owner and **null
   for a different user's uuid**, for all four entities (persona guarded on
   table existence). This is T9 and it is the security-relevant test in this
   workstream.
2. Red. Implement in `queries/translations.ts`.
3. Add `src/app/api/translate/route.ts`: `requireUser`, `hit` + `hitGlobal`,
   zod, `await getLocale()`, 204 when `sourceLocale === locale`, 404 for
   not-found and not-yours alike, streamed iff `TRANSLATABLE[k].stream`, first
   chunk pulled before the headers.
4. `npm run build`. Commit.

### Task 19 — the gist path

1. Unit: `chain.ts`'s block builder prefers a cached translation of the gist when
   one exists for the target locale, uses the original when it does not, and
   **never awaits a model call**.
2. Red. Implement the read. Schedule the translation with `defer()` from the
   reading's existing `after()`, never inline.
3. Green. Commit. **`chain.ts` never throws** — that property is older than this
   workstream and must survive it.

### Task 20 — `npm run smoke -- --translate`

1. Add `runTranslate()` to `scripts/smoke-llm.ts` in `runSummary`'s shape, and
   the `--translate` branch in `main()`. Six translations, both directions, the
   checks in §9.
2. `npm run smoke -- --translate`. **Read the output.** Record the observed word
   counts, the contraction rates and the mean sentence lengths in this file
   under `## Measured`, the way W5 recorded its control-vs-block table. A number
   nobody wrote down is a number that gets re-measured badly in three months.
3. Commit.

### Task 21 — `.env.example` and the docs

1. `.env.example` gains `TRANSLATION_MODEL=` with the "defaults to `LLM_MODEL`"
   comment and the `\$` warning that has already bitten this project — **and the
   reminder not to escape in the Vercel dashboard.**
2. `docs/DEPLOY-VERCEL.md`: one line in the env table.
3. `CLAUDE.md`: a `## Translation (V2)` section in the register of the existing
   workstream sections — the module map, the five things a future session will
   otherwise undo (the fence, the mechanical name check, repair-not-buffer, the
   stale comparison, `locale_source` NULL meaning `'chosen'`), and the
   verification commands. Commit.

### Task 22 — the whole loop

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm test && npm run typecheck && npm run build
npm run db:up && npm run test:all
npm run smoke -- --translate
npm run smoke -- --all --locale en      # unaffected: nothing here touches the nine
```

The last line matters. W7's plan makes the same assertion about moderation and it
was worth checking: **nothing in V2 may change a single byte of the eighteen
readings.** `sanitize.ts` gains an alternative that no reading prompt emits;
`schema.ts` gains a table no reading path reads. If `--all` output moves,
something is wrong.

---

## Schema deltas

Appended to `src/lib/db/schema.ts`. Roadmap §4 verbatim; conventions unchanged
(snake_case, plural, `timestamptz`, no `pgEnum`).

```ts
/**
 * VD5. Every piece of derived prose, keyed (entity, entity_id, field, locale).
 *
 * ONE GENERIC TABLE, not a jsonb column per artifact. Five artifacts need it and
 * five jsonb columns is five migrations, five upsert paths and five places to
 * forget updated_at. A translation also carries its own model, prompt_version
 * and timestamps, which a jsonb value cannot.
 *
 * `entity_id` HAS NO FOREIGN KEY, and that is a deliberate cost: Postgres cannot
 * declare a polymorphic one. Orphans are possible and the daily sweep's fourth
 * delete is the answer (V2, reviewed by V7).
 *
 * `lotus_avatars.summary` is GRANDFATHERED (VD6) and is not in here.
 */
export const translations = pgTable(
  'translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 'reading' | 'daily_summary' | 'frequency_verdict' | 'persona'.
     *  Bare text: V2 owns the union (`TranslatableEntity`), and narrowing it
     *  here would make schema.ts depend on a workstream that depends on it. */
    entity: text('entity').notNull(),
    /** NO FK. Polymorphic. See the header. */
    entityId: uuid('entity_id').notNull(),
    /** 'body' | 'gist'. Same reasoning as `entity`. */
    field: text('field').notNull(),
    /** What it was translated FROM. Stored, never derived: it is the only thing
     *  that keeps the row auditable after the source is gone. */
    sourceLocale: text('source_locale').$type<Locale>().notNull(),
    /** What it was translated INTO. */
    locale: text('locale').$type<Locale>().notNull(),
    body: text('body').notNull(),
    model: text('model').notNull(),
    /** Hand-bumped (`TRANSLATION_PROMPT_VERSION`), not hashed. Same reasoning as
     *  MEMORY_PROMPT_VERSION: this column decides whether a CACHED row is stale,
     *  and a hash would invalidate the table on a whitespace edit. */
    promptVersion: text('prompt_version').notNull(),
    createdAt: tsCol('created_at').notNull().defaultNow(),
    /** THE STALENESS MECHANISM. A translation is stale when this is older than
     *  its source's updated_at (readings: created_at; readings are immutable).
     *  Set BY HAND in the upsert -- $onUpdate() does not fire inside
     *  onConflictDoUpdate. */
    updatedAt: tsCol('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('translations_entity_entity_id_field_locale_uq').on(
      t.entity,
      t.entityId,
      t.field,
      t.locale,
    ),
    /** The orphan sweep and V6/V7's per-artifact reads. */
    index('translations_entity_lookup_idx').on(t.entity, t.entityId),
    /** A row translated into its own source language is a bug, not data. */
    check('translations_locale_differs_ck', sql`${t.sourceLocale} <> ${t.locale}`),
  ],
);

export type Translation = typeof translations.$inferSelect;
export type NewTranslation = typeof translations.$inferInsert;
```

One new column on `users`:

```ts
  /**
   * VD11. 'default' | 'negotiated' | 'chosen'. NULL on pre-v0.3.0 rows and
   * TREATED AS 'chosen' -- the conservative reading. Read it through
   * `effectiveLocaleSource()`, never raw.
   *
   * Without it a sign-in cannot tell "this row says id because the column
   * defaults to id" from "this row says id because the user pressed ID".
   * Stamped at row CREATION only, in both creation paths; never in the conflict
   * branch, or a sign-in from a foreign browser silently overwrites a choice.
   */
  localeSource: text('locale_source').$type<LocaleSource>(),
```

Two comment-only changes, both required by VD6 and §7 — no column moves:
`readings.gist` gains *"no locale of its own: it inherits `readings.locale`,
because `extractGist` is called with the reading's locale and `gistPrompt` is
locale-forked. A second column would be a second place for one fact and a first
place for the two to disagree."* `lotus_avatars.summary` gains VD6's paragraph in
VD6's words.

**Nothing else in `schema.ts` is touched.** `share_links` is V7's,
`personas` and `readings.shared_at` are V8's and V7's.

---

## Event deltas

One new name in `src/lib/analytics/events.ts` (44 → 45; the release total is 59).

```ts
  // — translation (V2) —
  'translation.generated',
```

```ts
  /*
   * ONE NAME, NOT TWO. Roadmap §6 fixes fifteen names and reconciliation checks
   * the total reaches 59, so a `translation.failed` would break the count.
   * `outcome` carries the failure instead -- `memory.gist_failed`'s `fell_back`
   * is the precedent for putting the interesting distinction in a prop.
   *
   * NO FREE TEXT (rule 1). `chars` is a length, `outcome` and the two locales
   * are closed sets, and `entity_id` is a uuid -- the same shape `reading_id`
   * already has in six other events, and it is what makes a lost translation
   * joinable back to its artifact.
   *
   * `outcome`:
   *   'cached'    served from the table. No model call. The common case.
   *   'ok'        generated and verified first time.
   *   'repaired'  first pass failed verification; the deferred repair passed
   *               and IS what got persisted.
   *   'invalid'   both passes failed verification. NOTHING was persisted and
   *               the viewer saw one bad translation. This is the rate that
   *               decides whether the prompt needs work (§4.4).
   *   'failed'    the call threw or came back empty. Nothing persisted; the
   *               caller fell back to the source prose.
   */
  'translation.generated': {
    entity: string;
    entity_id: string;
    field: string;
    source_locale: string;
    locale: string;
    outcome: 'cached' | 'ok' | 'repaired' | 'invalid' | 'failed';
    /** The first violation kind, or null. A classifier, never a message. */
    violation: string | null;
    chars: number;
    streamed: boolean;
    total_ms: number;
  };
```

---

## Interfaces I export

**V3, V6, V7 and V8: this is the contract. It does not change without a note in
the reconciliation.**

```ts
// ── src/lib/translate/contract.ts — PURE ─────────────────────────────────────

export type TranslatableEntity =
  | 'reading' | 'daily_summary' | 'frequency_verdict' | 'persona';
export type TranslatableField = 'body' | 'gist';
export type TranslatableKey = `${TranslatableEntity}.${TranslatableField}`;

export const TRANSLATABLE_ENTITIES: readonly TranslatableEntity[];
export const TRANSLATABLE: Record<TranslatableKey, FieldSpec>;
export const TRANSLATION_PROMPT_VERSION: string;   // 'translate-v1'

export function isTranslatableKey(v: unknown): v is TranslatableKey;

export function sanitizeSource(raw: string): string;
export function namesIn(source: string): string[];

export type ViolationKind =
  | 'card_name' | 'reader_name' | 'paragraphs' | 'markdown' | 'emoji'
  | 'forbidden' | 'tic' | 'malay' | 'budget' | 'empty';
export type Violation = { kind: ViolationKind; detail: string };

export function verifyTranslation(args: {
  source: string;
  output: string;
  spec: FieldSpec;
  target: Locale;
  readerId: ReaderId | null;
  serviceId: ServiceId | null;
}): Violation[];

export function buildTranslationPrompt(args: {
  source: string;
  sourceLocale: Locale;
  target: Locale;
  spec: FieldSpec;
  readerId: ReaderId | null;
  serviceId: ServiceId | null;
  /** Set on the repair pass only. Names what the first pass got wrong. */
  repairing?: Violation[];
}): CompletionPrompt;

export function translationMaxTokens(sourceChars: number): number;

// ── src/lib/translate/translate.ts — server-only ─────────────────────────────

export type TranslateOutcome =
  'cached' | 'ok' | 'repaired' | 'invalid' | 'failed';

export type TranslateResult = {
  /** The translation, or the SOURCE on 'failed'. Never null, never empty. */
  body: string;
  outcome: TranslateOutcome;
  /** True when `body` is the untranslated source. Render it as-is. */
  fellBack: boolean;
};

/**
 * The one call V3/V6/V7/V8 make. Cache-first, generates on a miss, verifies,
 * persists only what verified, and NEVER THROWS -- a failure returns the source.
 *
 * `handle` is OPTIONAL AND LAST, like W4's writers: this is not a query module,
 * it reaches the singleton by dynamic import, and the parameter is how the
 * integration suite passes a rolled-back transaction in.
 */
export function translateOrCached(args: {
  entity: TranslatableEntity;
  entityId: string;
  field: TranslatableField;
  source: string;
  sourceLocale: Locale;
  sourceUpdatedAt: Date;
  target: Locale;
  readerId: ReaderId | null;
  serviceId: ServiceId | null;
}, handle?: DbOrTx): Promise<TranslateResult>;

/**
 * The streamed form. Same semantics; yields chunks and resolves `result` when
 * the stream ends. On a cache hit it yields the cached body as ONE chunk, so
 * the caller has one code path (T2).
 */
export function translateStream(args: /* same */, handle?: DbOrTx):
  AsyncIterable<string> & { result: Promise<TranslateResult> };

// ── src/lib/db/queries/translations.ts — handle FIRST, always ────────────────

export function getTranslation(db: DbOrTx, key: {
  entity: TranslatableEntity; entityId: string;
  field: TranslatableField; locale: Locale;
}): Promise<Translation | null>;

export function putTranslation(db: DbOrTx, input: NewTranslation): Promise<Translation>;

export function deleteTranslationsFor(
  db: DbOrTx, entity: TranslatableEntity, entityId: string,
): Promise<number>;

export function deleteOrphanTranslations(db: DbOrTx): Promise<number>;

/** T9. Returns null for "does not exist" AND for "not yours" — the same answer. */
export function resolveTranslatable(db: DbOrTx, args: {
  entity: TranslatableEntity; entityId: string;
  field: TranslatableField; userId: string;
}): Promise<{
  body: string; sourceLocale: Locale; sourceUpdatedAt: Date;
  readerId: ReaderId | null; serviceId: ServiceId | null;
} | null>;

// ── i18n / auth ──────────────────────────────────────────────────────────────

// src/data/types.ts
export type LocaleSource = 'default' | 'negotiated' | 'chosen';

// src/lib/i18n/locale.ts — NULL means 'chosen'. T16.
export function effectiveLocaleSource(v: string | null | undefined): LocaleSource;

// src/lib/i18n/resolve.ts — PURE, edge-safe.
export function resolveForSignIn(
  headerLocale: string | null | undefined,
  cookieLocale: string | null | undefined,
  acceptLanguage: string | null | undefined,
): { locale: Locale; source: 'negotiated' | 'default' };

// src/lib/db/queries/profile.ts — CHANGED SIGNATURES
export type SignInUpsertInput = {
  googleSub: string; email: string; emailVerified: boolean;
  displayName: string | null; avatarUrl: string | null;
  negotiatedLocale: Locale;                        // NEW, required
  localeSource: 'negotiated' | 'default';          // NEW, required
};
export function setUserLocale(
  db: DbOrTx, userId: string, locale: Locale, source: LocaleSource,  // NEW 4th, required
): Promise<void>;
```

**Three things the consumers must not do:**

1. **V7's `/s/[slug]` must not call `POST /api/translate`.** It has no session.
   Authorize through the slug and call `translateOrCached()` directly.
2. **Nobody calls `putTranslation` directly.** `translateOrCached` is the only
   writer, because it is the only place verification happens, and an unverified
   row in that table is the failure §7 exists to prevent.
3. **Nobody translates in bulk** (VD8). A history list renders metadata the
   catalog already localizes; prose is translated when an item is *opened*.

---

## Interfaces I need

**From V1 (numerology):** nothing. V2 does not consume the engine.

**From V3 (mystical verdicts):** `frequency_verdicts.body` and
`daily_summaries.body` stay single-language columns with a `locale` beside them.
If V3 restructures either into a per-locale shape, `resolveTranslatable`'s
`frequency_verdict` and `daily_summary` arms both break — **say so in
reconciliation before doing it.** V3 also inherits an obligation: whatever the
new verdict prompt is, its output must survive `verifyTranslation` in the other
locale. A verdict naming a card the source did not name will fail the
`card_name` check, correctly.

**From V6 (history):** the caller of `POST /api/translate`. V6 owns the client
hook and the shimmer; V2 owns the endpoint. V6 must send `entity`, `entityId`,
`field` and nothing else — **not a target locale**, which is resolved server-side
by `getLocale()` (T10).

**From V7 (sharing):** two things. It **reviews** the sweep's fourth delete
(roadmap §4). And when a share link is revoked or its artifact deleted it should
call `deleteTranslationsFor()` in the same transaction — a translation of a
deleted artifact is reaped by the sweep within a day, but a share page resolving
to a 404 while its translation still sits in the table is a day of avoidable
storage and a confusing row in a dump.

**From V8 (`/account` & persona):** the `personas` table with a `locale` column
(VD15 already specifies it) and `user_id` as the primary key —
`resolveTranslatable`'s persona arm and `deleteOrphanTranslations`'s persona arm
are both written against `personas.user_id`, guarded by `to_regclass` so they are
inert until the table lands. If V8 keys the table on a surrogate `id` instead,
both arms need one line each; **name it in reconciliation.** V8 also owns account
deletion (VD13): `redactForUser()` runs in the same transaction that sets
`deleted_at`, and translations are reached by the cascade only *indirectly* —
they have no FK — so **V8's deletion path must call `deleteTranslationsFor()`
for the user's artifacts inside that transaction**, or a deleted account's
translated prose survives until the next sweep.

**From W7 (already shipped):** `/api/cron/sweep` is edited by V2 with W7's
conventions intact — counts in the response, the error's class in the log, 500 on
any failure.

---

## Open questions

1. **Should a sign-in upgrade `locale_source` from `'default'` to
   `'negotiated'`?** A row created with no signal at all sits at `'default'`
   forever, even after the same user signs in from a browser that does send
   `Accept-Language`. Upgrading only when the current value is exactly
   `'default'` is safe by construction and would fix a small real case. It is
   not implemented, because it means touching the conflict branch that T15
   exists to protect, and one exception in that branch is how the next one gets
   added. **Miftah's call.**

2. **Does `translation.generated` need a sibling `translation.failed`?** T13
   folds the failure into `outcome` to keep the roadmap's count at 59.
   Reconciliation may prefer a 60th name and a corrected count; either is fine,
   but it should be decided once rather than by whoever writes the query.

3. **The `en → id` word band.** The Indonesian budget was calibrated on native
   Indonesian generation. A translation is a different job and may land outside
   it consistently — Indonesian's affixation makes it 5–15% longer in words than
   English for the same content, so `en → id` is the direction most likely to
   overshoot. Task 20 measures it. If it does overshoot consistently, the answer
   is a per-direction entry in the budget with the measurement written down, not
   a widened band.

4. **Is `reading.gist` worth translating at all?** T12 makes it opportunistic
   and free, but the base contract already says *"write in ENGLISH even if the
   text you are reading is written in another language"*, which may make the
   whole path unnecessary. Measure it: compare chained readings whose block
   carried a translated gist against ones that carried the original, the way W5
   measured the chain block against its control. If there is no difference,
   delete the path and shrink the table's `field` union to `'body'`.

5. **Should a translation carry its own `readings.status`-like column?** A
   translation of a `partial` reading is a translation of prose that ends
   mid-sentence, and the `[Bacaan terputus…]` notice is deliberately never in
   `readings.body`. Today the translator will faithfully translate an unfinished
   reading and V6 will render it under the same partial-reading affordance the
   original gets, which seems right. Flagged because "why does my English
   reading stop mid-sentence" is a support question somebody will ask.

6. **Week-one operational question: what is the actual `invalid` rate?** §4.4
   commits to fixing the prompt rather than the architecture if it exceeds ~2%,
   but that threshold is a guess until there is a week of
   `translation.generated` rows. Add it to `docs/analytics-queries.md` as query
   nine.
