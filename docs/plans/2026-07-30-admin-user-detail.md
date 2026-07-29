> **RECONCILED 2026-07-30 — `docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md` OUTRANKS THIS
> PLAN AND THE ROADMAP. Read it before implementing a single task.** The six plans returned
> **51 defects in the roadmap they were reconciling**; nineteen were verified against running
> code and **four would have shipped**.
>
> **Rulings binding on A5:** R3 (render the unattributed audit case), R21, R27 (**own `AdminReadingDetail`**), R28 (add the reading route — `resource='reading_body'` had none), R29 (**soft-deleted users visible AND labelled**), R30 (**`await` the audit BEFORE the decrypt**), R33, R36 (401 signed-out vs 404 non-admin), R51 ("biaya generasi", not per-reading total).
>
> Where this plan disagrees with a ruling above, **this plan is wrong.** Its unamended text is
> kept deliberately — the reconciliation is an amendment, not a rewrite (the v0.4.0 precedent).

# A5 — The per-user everything page

**Workstream A5 of v0.5.0.** `/admin/users`, `/admin/users/[id]`, the audited PII
reveal, and the per-user token series.

**Read before this file:** `CLAUDE.md`; `PUBLIC_RELEASE_ROADMAP_v0.5.0.md` §0, §2
(A-D2, A-D12, A-D16, A-D18), §3.1, §4, §6, §7, §9, §10, §11, §12;
`docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md` when it exists; and the **V6**,
**V8**, **W7**, **W3** and **W4** sections of `docs/workstream-notes.md`. This plan
is subordinate to all of them.

**Depends on A1** (`requireAdmin()`, the `/admin` shell, `admin_access_log`, the
audit primitive, `events.ts`), **A2** (`llm_calls`, `op`, `prices.ts`) and **A3**
(`src/lib/db/queries/admin/{metrics,users,rollup}.ts`). §12 of this file states
exactly what each seam must deliver, and A5 cannot begin task 5 onwards until A1's
audit primitive exists with the **throwing** contract §12.1 specifies.

---

## 0. What this page is, in one paragraph

**`/admin/users/[id]` renders fourteen tables about one person on one screen.** It
is the surface the ask "show me every personal data of a user" produces, built the
only way this codebase permits it: presence rather than content, one key per
request for anything encrypted, an `admin_access_log` row committed before any
plaintext crosses the wire, and a 404 for everybody who is not on `ADMIN_EMAILS`.
It writes nothing to querent data. It renders no ciphertext. It cannot un-redact.

The list at `/admin/users` exists to find that person, and it carries **no prose at
all** — the V6 precedent, whose binding reason is VD8 rather than bytes.

---

## 1. Invariants

Numbered, with the reason each one exists. **A change that breaks one of these is a
reconciliation question, not a local call.** The ones marked `†` are the ones a
future session is most likely to undo by tidying.

### 1.1 The gate and the surface

**A5-1. Refusal is 404, never 403, on every page and every route** (A-D2). A 403
confirms the surface exists. A5 never constructs a 404 itself: it calls A1's
`adminNotFound()` so that every refusal in the tree is byte-identical, because a
404 whose body differs from a missing route's body is a 404 that still confirms the
surface. **This is a deliberate departure from `requireUser()`**, which returns
401/403 precisely so *a caller cannot tell whether middleware or the handler
refused it* — there the goal is symmetry, here it is invisibility, and a reader who
does not find this sentence at the call site will "fix" it back for consistency.

**A5-2. `isPublic()` must never learn `/admin` or any path under it.** That function
short-circuits `decide()` **above** the onboarding check, so an allowlisted `/admin`
would also skip the onboarding gate. `/admin` is an ordinary gated path: middleware
redirects a signed-out visitor to `/login`, `decide()` returns
`{ kind: 'json', status: 401 }` for anything under `/api/`, and `requireAdmin()` is
what turns a signed-in non-admin into a 404. A1 owns the gate test; A5 owns not
touching `gate.ts`.

**A5-3. Nothing under `src/app/admin/**` calls `t()`, `useT()`, `getT()`, `tFor()`
or `useLocale()`** (A-D12). Copy is Indonesian, hardcoded, and lives in
`src/app/admin/users/copy.ts` beside its components. **`Intl` is not `t()`**: a
date or a number formatted with `formatLocalDate(value, 'id')` is fine, because
`format.ts` has no runtime catalog import and takes the locale as an argument. †
The reflex to reach for `useT()` in a new component is strong and the failure is
silent catalog growth; A1's grep is the whole enforcement.

**A5-4. Every page and every route declares `runtime` and `maxDuration`, and every
client fetch carries a bound** (§4.2). `POST /api/locale` was the only
database-writing route declaring neither and Vercel's Hobby default of ten seconds
lost the write on a cold lambda over a suspended Neon compute. **Every admin
request is a cold one** — there is one admin and no warm instance — and this page
issues more reads than any other in the app. A bigger `maxDuration` without a
client bound only makes the hang longer.

### 1.2 The data

**A5-5. No bulk decrypt, ever, of anything.** `worst_thing`'s plaintext leaves the
server only through `GET /api/admin/users/<id>/answer/<key>` — one key, in the
path, `private, no-store`. **There must never be a bulk variant**, because a
six-answer read for a browser puts the most sensitive string in the product into
the response to *opening a page*. `moderation_flags.question` is on identical
terms. The rule is CLAUDE.md's, verbatim, applied to a second reader.

**A5-6. `src/lib/db/queries/onboarding.ts` remains the only module that encrypts or
decrypts `onboarding_answers.answer_text`.** † A5 adds **zero** decrypt sites for
that column: the admin reveal calls the existing `getAnswer(db, subjectUserId, key)`
with the subject's id. Writing an `adminGetAnswer` that repeats the
`decryptField(row, answerAad(...))` pair would make the audit two files instead of
one, and a mismatched AAD is indistinguishable from data loss.

**A5-7. `moderation_flags.question` gets exactly ONE decrypt site, and it is
`src/lib/db/queries/admin/moderation.ts`.** `src/lib/moderation/log.ts` stays the
only ENCRYPT site. The symmetry with A5-6 is the point and is stated so it is not
diluted: one column, one encryptor, one decryptor, and a contract test asserting
`moderationFlagAad` appears in exactly three files repo-wide (`crypto.ts` where it
is defined, `log.ts` where it encrypts, `queries/admin/moderation.ts` where it
decrypts).

**A5-8. The list payload carries no `body`, no `gist` and no answer of any kind,
asserted on the returned OBJECT** — `'body' in item` is `false`, not
`item.body === null`. † V6's precedent, and *the binding reason is VD8, not
bytes*: a query that fetched the column and dropped it has already put the prose in
the payload, and Indonesian prose in an English client is forbidden whether or not
anything renders it. The detail page's server payload is asserted the same way.

**A5-9. No page and no payload ever contains a `v1.` envelope.** The presence
queries select `answer_text IS NOT NULL` and `question IS NOT NULL`, never the
column. Ciphertext on screen is useless to the operator and is an invitation to
paste it somewhere; a `v1.` string in an RSC payload is a ciphertext in a browser's
memory for no benefit at all.

**A5-10. Every reveal writes an `admin_access_log` row BEFORE the response, and a
failed audit write is a failed reveal** (A-D16). The ordering is
`redactForUser()`'s precedent: redaction runs *before* the flag so a failure aborts
the whole thing rather than leaving an account marked deleted with its text intact.
Here: decrypt → `await recordAdminAccess(...)` with **no `try`/`catch`** → respond.
An exception becomes a 500 and the plaintext is discarded unsent. †
`recordAdminAccess` must therefore **throw**, which is the opposite of every other
write in this codebase; §12.1 states it as a requirement on A1 because a primitive
that swallows its errors like `flushEvents` does makes this invariant
unimplementable, and it would look implemented.

**A5-11. The audit row is written only when plaintext is actually about to be
returned.** A reveal of a flag whose `question` is NULL — redacted at 30 days, or
never stored because the category was `sexual_minor` — returns the *state* and
writes no row. Padding the log with no-op reads makes the subject-access answer
("what has been read about me") wrong in the alarming direction, and that answer is
the whole reason `admin_access_log_subject_created_idx` exists.

**A5-12. No path un-redacts, and `question_hmac` is never used to reverse
anything.** A redacted `moderation_flags` row renders as redacted. `question_hmac`
survives redaction so repeat probing stays detectable — it is a **dedupe key, not
anonymization** (`log.ts` says so) — so the page renders a 12-character prefix as a
group label and never the full digest, and nothing anywhere compares an HMAC
against a candidate string. † A "check whether this phrase was asked before" box is
the feature that turns a dedupe key into an oracle.

**A5-13. Search covers `users.email` and `users.display_name`. Nothing else,
ever.** † Not `readings.question`, not `readings.body`, not `readings.gist`, not
`daily_summaries.body`, not `personas.body`, not any answer column. A free-text
search over what querents wrote is a different product with a different privacy
policy, and it is one `or(...)` away at all times. **The cost that is accepted
rather than missed:** `?q=` puts an email address in the URL and therefore in the
platform access log. One admin, one operator, recorded here so it is a decision.

**A5-14. A soft-deleted user is visible AND LABELLED, and the page renders what
erasure already did rather than presenting it as emptiness.** Hiding them makes the
30-day restore window invisible. But V8's `deleteAccount` already ran
`revokeAllForUser` and `redactForUser` **inside the transaction that set
`deleted_at`**, so on such a page: every `share_links` row has `revoked_at`, every
`moderation_flags` row has `question = NULL` and `redacted_at` stamped, and
`onboarding_answers` is **still there** because `clearFreeTextAnswers()` is
deliberately *not* in that transaction (it would break the 30-day restore the
confirmation copy promises). The page says all four things in words. It also shows
`deleted_at + ERASURE_GRACE_DAYS` from `@/lib/account/grace`, never a typed 30.

**A5-15. `local_date` and `birth_date` are strings and are rendered as strings.**
`local_date` is the *querent's* calendar day; parsing it to a `Date` to format it
renders in the server's zone and is a day out for anyone in Jakarta between
midnight and 07:00. Every bucket in the token series is on `llm_calls.local_date`,
never on `created_at`. `created_at` is a real instant and is rendered as one, next
to the local date, because the operator's question is often "what does the gap
between these two mean".

**A5-16. Ownership is a predicate, never an assertion afterwards.** Every read on
the detail page and in every route filters `user_id = :subjectId` inside the
`where`, the `readingWithCards` precedent: fetching by id and comparing owners in
JavaScript is one forgotten `if` away from serving the wrong person's data, and the
forgotten `if` is invisible in review. This matters more here than in V6, because
the caller is an admin and every row *is* readable — so the failure mode is not a
403, it is the wrong person's page under the right person's URL.

**A5-17. A malformed uuid is a 404, not a driver error.** `where id = 'banana'`
raises SQLSTATE `22P02`, and an unhandled one 500s and **puts the failing statement
in the platform log**. `UUID_RE` in `queries/history.ts` is the precedent; A5's
query modules apply the same guard to `[id]`, `[flagId]` and `[readingId]`.

### 1.3 Logging and events

**A5-18. Never log a driver error from any path that runs a query.** A postgres
error quotes the failing statement *and its bound parameters*. On this workstream's
paths those parameters include a subject user id, a question key, a flag id — and
on the reading route, nothing sensitive — but `readings.question`,
`onboarding_answers.answer_text` and `moderation_flags.question` are all columns in
statements A5 issues, and the rule is applied without exception because this is not
the file in which to reason about one. Production logs the error's **class** and
the resource ids; nothing else.

**A5-19. A5 fires exactly one event: `admin.page_viewed`, A1's name, with
`{ page }`.** † `page` is `'users'` or `'user_detail'` and **must never carry the
subject's id, email or any resource key.** `events` rows survive account erasure
with `user_id` nulled, so a subject id in `props` is a resource key in a table
whose retention is 180 days and whose whole honesty rests on `sanitizeProps`
proving the props are non-identifying. **That is exactly why A-D18 dropped
`admin.pii_revealed`** — `admin_access_log` is the record of truth for a reveal —
and A5 does not reinstate it under a different name.

**A5-20. `admin_access_log` is append-only and this page renders it with no delete
control.** A delete button on an audit trail is the audit trail's absence.

### 1.4 The renderer

**A5-21. A5 does NOT mount `ReadingView`. It renders `AdminReadingDetail`, its
own.** §11.5 of this plan is the full argument; §7 of the roadmap and seam §11.5 of
the roadmap both recommend it, so this agrees rather than opening §12.3.

**A5-22. `readings` with `status = 'blocked'` ARE shown, labelled, and that
knowingly widens V6's security-adjacent filter.** V6 filters them because a blocked
reading has no card rows and because its `question` is text W7's classifier flagged
— *"a permanently browsable copy under another column name undoes a retention
promise"*. On `/admin` the ask is "everything" and the operator is the person who
tunes the blocklist, so they are shown. Three things make that honest rather than a
regression: the surface is 404 to everyone else; `admin_access_log` records the
visit with `resource = 'user_detail'`; and **A1's `/privacy` amendment must say
that an operator can read questions, including refused ones**, because a live legal
document that says nobody reads them would otherwise be false (seam §11.8 of the
roadmap: *written last, from the code*).

---

## 2. Decisions

### A5-D1 — Fourteen sections, one page, server-rendered, no client data fetch except the reveals

The page is a server component that issues its reads in one `Promise.all` and
renders. The only client components are the three reveal controls and A4's tooltip
layers. **No section fetches its own data on mount.** `/account`'s block 4 is a
client fetch because it waits on a model call; nothing here does, and a page of
fourteen independently-loading panels is fourteen loading states for one operator.

**The reads are a render-path exemption and it is the same ground `/account` took:**
`/admin/users/[id]` with no rows is not a slower page, it is a blank one. What it
must not do is wait for a model call, and it never does — A5 makes no model call at
all, on any path.

### A5-D2 — Keyset pagination, never `OFFSET`

`/admin/users` orders by `last_seen_at desc, id desc` and pages on that tuple.
`OFFSET 400` re-reads four hundred rows per page and shifts under concurrent
`touchLastSeen` writes, so a row can appear on two consecutive pages or on neither.
The cursor is `<iso>|<uuid>`, opaque to the UI, validated before it reaches the
query.

### A5-D3 — Per-reading cost is labelled "biaya generasi", not "biaya bacaan"

`llm_calls.reading_id` is set **for the reading call only** (§3.2), so the
moderation classifier and the gist extractor that ran for the same reading are not
attributable to it — the classifier because it runs *before* the `readings` row
exists, and therefore cannot be. **A number labelled "the cost of this reading"
that omits two of the three calls is a wrong number wearing a right label**, so the
per-reading figure names what it is, and the unattributable ops appear in the
per-user by-op table where the total is complete. See §13.3: A5 asks A2 for
`reading_id` on the `gist` op, which it *can* set, and accepts that `moderation`
never will.

### A5-D4 — Presence is computed in SQL as nullity, never by fetching and testing

`answerPresence` reads `answer_text IS NOT NULL` — the same predicate as the audit
query in `schema.ts`. A5's moderation and reading queries do the same:
`question IS NOT NULL`, `body IS NOT NULL`. It is not an optimisation, it is the
guarantee: a function on the page's render path must never be the reason a
plaintext or a ciphertext exists in memory.

### A5-D5 — The `events` stream is capped at 200 rows and rendered as text

`props` is `jsonb` behind `sanitizeProps()`, which provably strips non-scalars,
truncates strings to 120 characters and caps at 24 keys — so rendering it is safe.
It is rendered as `JSON.stringify`'d text in a `<code>`, never interpolated as
markup, and the cap is stated on screen so 200 is not read as "that is all there
ever was". **A purged user's events are unreachable from this page** (`user_id` is
`set null`), so an empty stream beside a live account is a bug and an empty stream
beside `deleted_at` after the hard delete is correct — the page says which.

### A5-D6 — No export, no CSV, no "copy all", no print stylesheet

§1's "not an export" applies to the UI as well as to a route. An export is a copy
of the most sensitive data in the product living in a Downloads folder, and it
defeats the one-key-per-request rule the whole design rests on. `db:studio` and
`pg_dump` over the direct connection string serve the legitimate case.

### A5-D7 — Reveals are one component, `AdminReveal`, used three times

Answer, moderation question, reading body. One client component, three
configurations, so the `private, no-store` handling, the bound, the failure state
and the "nothing to reveal" state exist once. A second reveal component is how the
fourth one ships without a bound.

---

## 3. Schema deltas

**None.** A5 adds no table and no column. It consumes `admin_access_log` (A1,
migration `0009`) and `llm_calls` (A2, migration `0010`) and reads the thirteen
existing tables. If this section ever grows, that is a reconciliation question:
`schema.ts` has one owner.

---

## 4. Section-by-section catalogue of `/admin/users/[id]`

For each: the table, the query, what is shown, what is withheld and why, and
whether a reveal is audited.

Legend — **Audited**: `no` = rendered from the page's own read, covered by the one
`resource = 'user_detail'` row written when the page loads; `yes` = a separate
request that writes its own `admin_access_log` row before responding.

### 4.1 Identity — `users`

| | |
|---|---|
| **Query** | A3 `adminUserById(db, id)` — **must NOT filter `deleted_at`** (§12.3) |
| **Shown** | `id`, `google_sub`, `email`, `email_verified`, `display_name`, `avatar_url` (as a URL string, not an `<img>`), `locale`, `locale_source` through `effectiveLocaleSource()`, `created_at`, `last_seen_at`, `terms_accepted_at`, `terms_version`, `age_confirmed_at`, `deleted_at` |
| **Withheld** | Nothing. Every column is here |
| **Audited** | no |

`google_sub` is rendered in full: it is an opaque provider identifier, not a
credential, and correlating a row with the Google console is a real operator need.
It must never reach `events.props` or a URL (A5-19).

`locale_source` goes through `effectiveLocaleSource()` and never raw. **NULL means
`'chosen'`**, and `raw ?? 'default'` is what a reasonable person writes without the
helper — which on this page would render "default" over every pre-v0.3.0 row,
i.e. would tell the operator that a preference nobody set can be overwritten.

`avatar_url` is a string and not an image. `next/image` refuses a local `src` with
a query string and there is no `images` block in `next.config.ts`; a remote Google
avatar is a third-party request from an admin page for no information gain.

**Soft delete** (A5-14): when `deleted_at` is set, this block leads with a labelled
banner giving `deleted_at`, `restorableUntil = deleted_at + ERASURE_GRACE_DAYS`,
and the four statements about what erasure already did.

### 4.2 Facts — `profiles`

| | |
|---|---|
| **Query** | existing `getProfile(db, userId)` |
| **Shown** | `full_name`, `nickname`, `birth_date` (string, A5-15), `onboarding_version`, `completed_at`, `created_at`, `updated_at` |
| **Withheld** | Nothing |
| **Audited** | no |

`completed_at IS NULL` renders as **"onboarding belum selesai"** and not as a blank,
because row presence is not completion — the facts row exists from step 1 of 9 —
and a blank here would read as a missing name.

### 4.3 The six answers — `onboarding_answers`

| | |
|---|---|
| **Query** | existing `answerPresence(db, userId)` — **decrypts nothing** |
| **Shown** | six rows in catalog order, each with the question title (hardcoded Indonesian, not `t()`) and one of three states: *terjawab* / *dilewati* / *belum ditanya*. Plus `updated_at` per row from a widened presence read (§12.3) |
| **Withheld** | The plaintext, until a row is tapped. The ciphertext, always (A5-9) |
| **Audited** | **yes** — `GET /api/admin/users/[id]/answer/[key]`, `resource = 'onboarding_answer'`, `resource_key = <key>` |

This is V8's `/account` shape with one difference: the querent's own page has an
edit control and this one has none. **A5 offers no write path to any of the six**
(§1 of the roadmap: *an admin may not edit a reading, a profile, an answer or a
persona* — there is no honest UI for "we changed what you said", and the
`input_hash` mechanisms behind Lotus and the persona would silently disagree with
the rows they were built from).

The reveal calls `getAnswer(db, subjectUserId, key)` (A5-6). It distinguishes the
three states the same way that function does: **no row is a 404**, a row with
`answer_text IS NULL` is a **200 with `text: null`** (a skip), and a row whose
ciphertext will not open is **also a skip**, which is `decryptField`'s documented
asymmetry rather than a shrug.

### 4.4 The Lotus — `lotus_avatars`

| | |
|---|---|
| **Query** | A5 `lotusForAdmin(db, userId)` in `queries/admin/detail.ts` |
| **Shown** | `summary.id` and `summary.en` **in full, both locales**, `traits` as formatted JSON, `source_version`, `input_hash` (12-char prefix), `model`, `created_at`, `updated_at` |
| **Withheld** | Nothing |
| **Audited** | no |

`summary` is shown in full and that is deliberate: it is model output that
`lotusSafetyCheck` already passed, it is **injected into every reading prompt**,
and "why does this querent's readings feel like that" is answerable from nowhere
else. It is also the abstraction that stands between the six raw answers and the
persona — the D10 rule enforced by construction — so an operator reading it is
reading the safe layer, not the sensitive one. `summary` has no reveal because it
is not a secret; the six answers underneath it are, and they have one.

The block also renders **"stale"** when `input_hash` does not match a recomputation
— no. It does **not**: recomputing `lotusInputHash` needs the decrypted answers,
which is a bulk decrypt (A5-5). `updated_at` beside the six answers' `max(updated_at)`
is the honest signal and the page shows both numbers side by side and lets the
operator read them.

### 4.5 The persona — `personas`

| | |
|---|---|
| **Query** | existing `getPersona(db, userId)` |
| **Shown** | `body` in full, `locale`, `facts` as formatted JSON, `input_hash` (prefix), `source_version`, `model`, `prompt_version`, `created_at`, `updated_at` |
| **Withheld** | Nothing |
| **Audited** | no |

`facts` is the engine's structured output and is the row's audit trail: *if a
persona ever says something impossible, the first question is whether the engine or
the model produced it*. `model = 'fallback'` is labelled as such on screen, because
an operator asking "why does this read like a template" must land on the right
thing.

**Staleness is shown, not computed.** `answers_updated_at > personas.updated_at` is
the user-edit arm of `personaStaleness`, and both timestamps are already on this
page. The page renders the comparison as a label ("menunggu regenerasi") and calls
no generator. † A5 must not import `@/lib/persona/generate` — see A5-24 in §9's
fence list.

### 4.6 Readings — `readings` + `reading_cards` + `llm_calls`

| | |
|---|---|
| **Query** | A5 `readingsForAdmin(db, userId, { limit, cursor })` + `readingCostsFor(db, readingIds)` (A3 or A5, §12.3) |
| **Shown per row** | `id`, `created_at`, `local_date`, `reader_id`, `service_id`, `locale`, `status`, `verdict`, `choice`, `question` (full text, inline), `has_body`, `has_gist`, `model`, `prompt_version`, `latency_ms` (**TTFT**), `token_input`, `token_output`, `session_id`, `shared_at`, the cards as `cardId/reversed/position`, and the generation cost from `llm_calls` |
| **Withheld** | `body` and `gist` (A5-8) |
| **Audited** | list: no. **Body: yes** — `GET /api/admin/users/[id]/reading/[readingId]`, `resource = 'reading_body'`, `resource_key = <readingId>` |

**`question` renders inline and `body` does not, and the asymmetry is the
decision.** `readings.question` is plaintext in the table by design (`schema.ts`
says so and `/privacy` names it as stored user text); an audited reveal over an
unencrypted column would suggest a protection that does not exist, and it would
make the list unusable for the one thing a list is for — telling readings apart.
`body` is four paragraphs per row, it is the artifact, and withholding it is what
keeps the page payload free of prose and gives A1's `reading_body` resource value
something to be.

`latency_ms` is **time to first token**, not total generation time — that is
`reading.completed.total_ms` and, since A2, `llm_calls.total_ms`. The column header
says `TTFT` in those letters, because two columns named `latency_ms` with two
meanings now exist in one schema (roadmap seam 2) and a dashboard is exactly where
they get confused.

`status = 'blocked'` rows are shown with a label and no cards, per A5-22. `failed`
and `aborted` are shown as V6 shows them. `partial` is shown as normal, and the
`[Bacaan terputus…]` notice is **not** in `body` and must never be added to it.

`cards` are rendered as a compact id/orientation/slot list plus 240px thumbs from
`public/cards/thumb/`, and **sorted by `position`, assigned into a sparse array by
index** — the `ReadingView` lesson: `flatMap` compacts, `Slots` reads `picks[i]`,
and the third card lands under the second slot's label with nothing on screen
looking wrong.

### 4.7 Token consumption — `llm_calls`

| | |
|---|---|
| **Query** | A3 `userTokenSeries(db, userId, range)`, `userCallsByOp(db, userId, range)` |
| **Shown** | a KPI row (calls, input, output, notional cost, unpriced count); a two-series line of input vs output over the range on **one axis**; a horizontal stacked bar of calls by `op`; a table view of the same |
| **Withheld** | Nothing |
| **Audited** | no |

**Bucketed on `local_date`, the querent's day, never on `created_at`** (A5-15).
Input against output is **two series on one axis** — they share a unit — and never
a dual-axis chart (A-D11). Tokens against cost is two charts. Colours come from
A4's `chart.ts`: slot 1 `input`, slot 2 `output`, in fixed order, following the
entity and never the rank. **A5 introduces no hex value.**

Every cost figure is labelled **notional** and carries its unpriced-call count
beside it (A-D7): z.ai is a fixed annual subscription whose marginal cost per token
is genuinely zero, so the number worth watching is what these calls would cost at
the fallback provider's rate — and an unknown model prices `null`, never zero,
because a zero silently understates the bill.

**No forecast on this page.** A per-user trajectory over nine days of one person's
readings is below any honest minimum n (A-D8), and A4 owns the forecast component
and its empty state. `/admin/tokens` is where the fleet trajectory lives.

### 4.8 Day summaries — `daily_summaries`

| | |
|---|---|
| **Query** | A5 `dailySummariesForAdmin(db, userId, limit)` |
| **Shown** | `local_date`, `reader_id`, `locale`, `body` in full, `source_reading_ids`, `prompt_version`, `generation_count`, `created_at`, `updated_at` |
| **Withheld** | Nothing |
| **Audited** | no |

`generation_count` is on screen because it exists to make *"is the throttle set
right?"* one query instead of an events aggregation, and this page is where that
question gets asked. `updated_at` is what the throttle compares against, so it sits
next to it.

### 4.9 Frequency verdicts — `frequency_verdicts`

| | |
|---|---|
| **Query** | A5 `frequencyVerdictsForAdmin(db, userId)` |
| **Shown** | `window_key`, `locale`, `top_card_id`, `second_card_id` (as names), `fingerprint` (prefix), `body`, `model`, `prompt_version`, `created_at`, `updated_at` |
| **Withheld** | Nothing |
| **Audited** | no |

**The page renders no count and derives no tally.** V3 deleted the counts from both
prompts rather than forbidding them, on the ground that *a model cannot recite a
count it was never given*; a dashboard that puts `m` and `n` on screen beside the
verdict is not a breach of that, but it is the arithmetic the feature exists to
stop doing out loud, and it invites somebody to "surface" it in the product. `top`
and `second` card names, the fingerprint prefix and the prose. Nothing else.

### 4.10 Translations — `translations`

| | |
|---|---|
| **Query** | A5 `translationsForAdmin(db, userId)` — joins nothing; `entity_id` has no FK, so `reading` rows are matched against this user's reading ids and `persona` rows against `user_id` |
| **Shown** | `entity`, `entity_id`, `field`, `source_locale`, `locale`, `body` in full, `model`, `prompt_version`, `created_at`, `updated_at`, and a derived **stale** flag |
| **Withheld** | Nothing |
| **Audited** | no |

**Stale is `translations.updated_at < source.updated_at`** and there is no
`source_hash` column — that comparison *is* the entire mechanism, and
`putTranslation` setting `updatedAt` by hand inside `onConflictDoUpdate` is what
keeps it working. Rendering the flag here is the only place the mechanism is
visible, and a frozen `updated_at` shows up as "nothing is ever stale", which is
exactly how the bug would present.

**`entity_id` has no foreign key** and orphans are possible by design (the daily
sweep's fourth delete is the answer). So this query cannot join, and an orphan row
is unreachable from a user page. Stated so the absence is not read as a bug.

### 4.11 Share links — `share_links`

| | |
|---|---|
| **Query** | A5 `shareLinksForAdmin(db, userId)` |
| **Shown** | `slug`, `entity`, `entity_id`, `locale` (**NULL = as-written**), `include_question`, `include_nickname`, `view_count`, `revoked_at`, `created_at`, `updated_at`, and whether the link is live |
| **Withheld** | Nothing. **And no revoke button** |
| **Audited** | no |

`locale = NULL` renders as **"as-written"** and never as "unknown": every link
minted before that column existed is NULL and the honest behaviour for those is the
prose verbatim in `readings.locale`. A non-NULL value always has a `translations`
row behind it, because the mint resolves the pin rather than trusting it.

`view_count` is labelled **approximate**: it is the one unauthenticated write in
the product, incremented in `after()` behind the per-IP limiter with failures
swallowed, and it is *a load and abuse signal, not an audience metric*.

**No revoke control.** §1: the only admin writes are blog rows and the audit log.
Revocation is per-artifact and kills every language (Miftah's ruling) and it is the
querent's to perform; an admin revoke button is a write to querent data with no
consent path and no undo — re-sharing rotates the slug, so there is no way back.

### 4.12 Moderation — `moderation_flags`

| | |
|---|---|
| **Query** | A5 `moderationFlagsForAdmin(db, userId)` in `queries/admin/moderation.ts` — selects `question IS NOT NULL`, never `question` |
| **Shown** | `id`, `category`, `source`, `action`, `locale`, `pattern_id`, `confidence`, `created_at`, `redacted_at`, `question_hmac` prefix (12 chars), and one of three text states |
| **Withheld** | The plaintext until tapped; the ciphertext always |
| **Audited** | **yes** — `GET /api/admin/users/[id]/moderation/[flagId]`, `resource = 'moderation_question'`, `resource_key = <flagId>` |

**Three text states, and telling them apart is the point** (`redacted_at` is what
distinguishes them, and *without it the retention policy is unverifiable from the
data itself*):

| `question` | `redacted_at` | State on screen | Reveal |
|---|---|---|---|
| not null | null | *ada teks* | offered, audited |
| null | **not null** | *teks sudah dihapus (redaksi)* | **refused, 200, no audit row** (A5-11) |
| null | null | *teks tidak pernah disimpan* — `sexual_minor`, or no question | **refused, 200, no audit row** |

`sexual_minor` **never stores the text** — not encrypted, not for thirty days —
because storing it at all is the exposure. The page says so in words rather than
rendering an empty field that reads like a bug.

`pattern_id` is on screen because it turns *"the blocklist has false positives"*
into *"pattern `id.self_harm.method` has eleven false positives"*, which is the
whole reason the column exists. It is the one field here that is never returned to
a client on any other surface, and it is safe on an admin page.

**The 30-day redaction sweep is untouched.** A5 adds no exemption, no "keep for
review" flag, and no path that reads a redacted row's HMAC (A5-12).

### 4.13 The event stream — `events`

| | |
|---|---|
| **Query** | A5 `eventsForAdmin(db, userId, 200)` — `events_user_created_idx` |
| **Shown** | `created_at`, `local_date`, `locale`, `session_id`, `name`, `props` as text (A5-D5) |
| **Withheld** | Nothing — there is nothing to withhold |
| **Audited** | no |

`props` carries **no free text, ever** — `question.typed` carries a `length` —
because `sanitizeProps()` provably strips non-scalars, truncates to 120 characters,
caps at 24 keys and rejects `__proto__`, `constructor` and `prototype` by name.
That property is what makes `events` rows honest survivors of account erasure, and
it is what makes this section renderable at all.

`session_id` is the **browser** session, not the auth session, and is labelled as
such: `events.session_id = readings.session_id` reconstructs an interaction, and
that join is the one thing this section is actually for.

### 4.14 What has been read about this person — `admin_access_log`

| | |
|---|---|
| **Query** | A1 `adminAccessForSubject(db, subjectUserId, limit)` — `admin_access_log_subject_created_idx` (§12.1) |
| **Shown** | `created_at`, the admin's email (resolved from `admin_user_id`, or *"admin dihapus"* when NULL), `resource`, `resource_key` |
| **Withheld** | Nothing. `resource_key` is **never** a decrypted value by construction |
| **Audited** | no — reading the audit log is not a read of the subject's data |

This section is why the subject index exists: it is the answer to a subject access
request, and rendering it is the only way the operator ever finds out whether the
audit trail is working. **No delete control** (A5-20).

`admin_user_id` resolves to an email through a join on `users`, which for a deleted
admin is NULL — the §12.1 nullability resolution. The page renders that state
rather than hiding the row: *a deleted admin's rows lose their attribution rather
than deleting the audit trail.*

---

## 5. `/admin/users` — the list

### 5.1 What it shows

One row per user, newest-seen first:

`email` · `display_name` · `locale` · `created_at` · `last_seen_at` ·
`onboarding` (✓/—) · `readings` · `calls` · `input`+`output` tokens ·
notional cost · a `deleted` badge.

`readings`, `calls`, `tokens` and `cost` come from A3's aggregate. An inline bar
column (A4's sequential ramp) makes the cost league readable at a glance — §5.3 of
the roadmap: *per-user cost league → a **table**, with an inline bar column*.

### 5.2 What it does not show

No `body`. No `gist`. No answer. No `moderation_flags.question` state. No
`personas.body`. **Asserted on the returned object** (A5-8): the integration test
checks `'body' in item === false` and `'gist' in item === false` on every element,
and does the same for every prose-bearing column name in the schema, because a
future `adminUserList` that starts selecting one of them would otherwise pass.

### 5.3 Search and paging

`?q=` matches `email` and `display_name` only (A5-13), `ILIKE '%…%'`, capped at 120
characters, trimmed, and parameterised by Drizzle. A `q` shorter than 2 characters
is ignored rather than refused — a 400 on a keystroke reads as a broken box.

`?cursor=` is `<last_seen_at iso>|<uuid>`, validated with `UUID_RE` and
`Date.parse`; anything malformed is treated as absent, because a broken cursor
must show page one rather than a 400.

**Soft-deleted users appear** (A5-14) with a badge, and the default filter includes
them. `?deleted=only` and `?deleted=hide` are offered; there is no default that
hides them.

---

## 6. The API contracts

All four: `export const runtime = 'nodejs'`. All four open with A1's
`requireAdmin()` and return A1's `adminNotFound()` on refusal (A5-1). All four are
`GET`; **A5 defines no `POST`, `PUT`, `PATCH` or `DELETE` anywhere.**

### 6.1 `GET /api/admin/users`

```
maxDuration = 20     # one aggregate over llm_calls + readings, cold
query        ?q=<=120 chars  ?cursor=<iso>|<uuid>  ?limit=1..100 (default 50)
             ?deleted=all|only|hide (default all)
200          { items: AdminUserListItem[], nextCursor: string | null }
404          A1's adminNotFound() — non-admin, or signed-in non-admin
401          from middleware, for a signed-out caller (decide() -> kind:'json')
503          { error: 'unavailable' } on a query failure. Never a 500 with a body
headers      cache-control: private, no-store
```

`AdminUserListItem` is declared in `src/lib/admin/types.ts` (client-reachable,
zero imports) and carries **no prose field at all** — not nullable ones, not
optional ones. Absence is structural.

### 6.2 `GET /api/admin/users/[id]/answer/[key]`

**The precedent this copies is `GET /api/onboarding/answer/[key]`, exactly.**

```
maxDuration = 15
params       id  -> UUID_RE or 404
             key -> isOnboardingQuestionKey() or 404 (not 400: an unknown key on
                    an admin path is a URL that should not resolve)
200          { key, freeText, text: string|null, choice: string|null, skipped }
404          no row for (id, key) — the question was never reached
404          A1's adminNotFound()
500          { error: 'unavailable' } when the AUDIT WRITE FAILS. See below
headers      cache-control: private, no-store
```

Sequence, and the order is the contract (A5-10):

```ts
const gate = await requireAdmin();
if (!gate.ok) return gate.response;                    // 404, A1's shape

const { id, key } = await ctx.params;
if (!UUID_RE.test(id) || !isOnboardingQuestionKey(key)) return adminNotFound();

let answer;
try {
  answer = await getAnswer(db, id, key);                // the ONLY decrypt site
} catch (err) {
  // THE ERROR OBJECT IS NOT LOGGED (A5-18).
  console.error('admin answer read failed', {
    adminUserId: gate.user.id, subjectUserId: id, key,
    name: err instanceof Error ? err.name : typeof err,
  });
  return NextResponse.json({ error: 'unavailable' }, { status: 503 });
}
if (!answer) return NextResponse.json({ error: 'not found' }, { status: 404 });

/*
 * NO try/catch. A5-10: a failed audit write is a failed reveal, and the only way
 * to make that true is to let the throw escape. `recordAdminAccess` THROWS by
 * contract (§12.1) -- if A1 ever makes it swallow, this line silently stops being
 * a control and nothing fails.
 *
 * AWAITED, and not in `after()`. An `after()` callback runs once the response is
 * on its way, which is the exact opposite of "before the response".
 */
await recordAdminAccess(db, {
  adminUserId: gate.user.id,
  subjectUserId: id,
  resource: 'onboarding_answer',
  resource_key: key,
});

return NextResponse.json({ ...answer, freeText: isFreeText(key) },
  { headers: { 'cache-control': 'private, no-store' } });
```

A thrown audit write produces Next's 500. **That is the correct outcome and must
not be softened into a 200 with a warning**: the alternative is plaintext on screen
with no record that it was read.

### 6.3 `GET /api/admin/users/[id]/moderation/[flagId]`

```
maxDuration = 15
params       id, flagId -> UUID_RE or 404
200 (a)      { flagId, state: 'available', question: string }         audited
200 (b)      { flagId, state: 'redacted', redactedAt: string }        NOT audited
200 (c)      { flagId, state: 'never_stored' }                        NOT audited
404          no flag with that id AND user_id = :id  (ownership is a PREDICATE)
500          audit write failed
headers      cache-control: private, no-store
```

State (b) is `question IS NULL AND redacted_at IS NOT NULL`; (c) is both NULL.
`revealFlagQuestion(db, subjectUserId, flagId)` in
`queries/admin/moderation.ts` is the one decrypt site (A5-7) and returns the
discriminated union above, so the route never sees a raw column. An undecryptable
ciphertext returns state `'undecryptable'` — a fourth member, because a rotated key
is not the same fact as a redaction and rendering it as one would claim a retention
guarantee that did not happen.

The audit row is written **only for state (a)** (A5-11).

### 6.4 `GET /api/admin/users/[id]/reading/[readingId]` — **new, not in roadmap §4.1**

```
maxDuration = 15
params       id, readingId -> UUID_RE or 404
200          { readingId, question: string|null, body: string|null,
               gist: string|null, choice: string|null, locale: Locale }
404          no reading with that id AND user_id = :id
500          audit write failed
headers      cache-control: private, no-store
```

**Why this route exists at all:** roadmap §3.1 gives `admin_access_log.resource`
the value `reading_body`, and roadmap §4.1 lists no route that could ever write it.
One of the two is wrong. Adding the route is the resolution that keeps both the
`resource` set meaningful and A5-8's payload rule intact — the alternative is
rendering `body` inline on the detail page, which puts four paragraphs per reading
into the RSC payload of a page that already carries fourteen sections and makes
`reading_body` dead. Reported as §13.1.

Audited as `resource = 'reading_body'`, `resource_key = readingId`, always —
unlike the two above, there is no "nothing to reveal" state worth distinguishing: a
`failed` reading with `body IS NULL` still returns its `question`, which is
plaintext the operator has now read.

---

## 7. File map

```
NEW — pages and routes
src/app/admin/users/page.tsx                       list. server. requireAdmin -> notFound
src/app/admin/users/copy.ts                        Indonesian strings. NO t(). A-D12
src/app/admin/users/AdminUserTable.tsx             'use client' — search box + paging only
src/app/admin/users/page.module.css
src/app/admin/users/[id]/page.tsx                  the everything page. server
src/app/admin/users/[id]/page.module.css
src/app/admin/users/[id]/sections/                 one file per §4 section, all SERVER
    Identity.tsx  Facts.tsx  Answers.tsx  Lotus.tsx  Persona.tsx
    Readings.tsx  Tokens.tsx  Summaries.tsx  Verdicts.tsx  Translations.tsx
    ShareLinks.tsx  Moderation.tsx  EventStream.tsx  AccessLog.tsx
src/app/admin/users/[id]/AdminReveal.tsx           'use client'. THE reveal. Used 3x
src/app/admin/users/[id]/AdminReadingDetail.tsx    'use client'. §11.5. NOT ReadingView
src/app/admin/users/[id]/page.contract.test.ts     the subtree fences (§9)

src/app/api/admin/users/route.ts
src/app/api/admin/users/[id]/answer/[key]/route.ts
src/app/api/admin/users/[id]/moderation/[flagId]/route.ts
src/app/api/admin/users/[id]/reading/[readingId]/route.ts
src/app/api/admin/users/shared.ts                  the gate + the 404 + UUID_RE, once

NEW — the data layer (handle first, always)
src/lib/db/queries/admin/detail.ts                 lotus, summaries, verdicts,
                                                   translations, share links, events
src/lib/db/queries/admin/moderation.ts             THE ONE decrypt site for
                                                   moderation_flags.question (A5-7)
src/lib/db/queries/admin/readings.ts               readingsForAdmin + cards + costs
src/lib/db/queries/admin/detail.integration.test.ts
src/lib/db/queries/admin/moderation.integration.test.ts
src/lib/db/queries/admin/readings.integration.test.ts
src/lib/db/queries/admin/audit.integration.test.ts audit-before-response ordering
src/lib/admin/types.ts                             AdminUserListItem etc. ZERO imports

CONSUMED, NOT EDITED
src/lib/admin/identity.ts                          A1: requireAdmin, adminNotFound
src/lib/db/queries/admin/audit.ts                  A1: recordAdminAccess (THROWS),
                                                   adminAccessForSubject
src/lib/db/queries/admin/{users,metrics,rollup}.ts A3
src/lib/llm/prices.ts                              A2
src/components/chart/**                            A4
src/lib/db/queries/onboarding.ts                   getAnswer, answerPresence — UNCHANGED
src/lib/db/queries/{profile,persona,allTime}.ts    getProfile, getPersona — UNCHANGED
src/lib/account/grace.ts                           ERASURE_GRACE_DAYS
src/lib/i18n/format.ts                             formatLocalDate/formatTime with 'id'

EDITED BY A5 — nothing outside src/app/admin/** and src/lib/db/queries/admin/**
```

**`src/lib/db/queries/admin/` is shared with A3 and the split is by file, never by
function.** A3 owns `users.ts`, `metrics.ts`, `rollup.ts`; A5 owns `detail.ts`,
`moderation.ts`, `readings.ts`; A1 owns `audit.ts`. Two workstreams editing one
file in that directory is a reconciliation defect.

---

## 8. `queries/admin/**` — the rules that already bind

`queries/contract.test.ts` enforces all of these and will fail on any of them:

1. **The handle is the first parameter of every exported function.** A function that
   reaches for the singleton cannot be rolled back and cannot join a transaction.
2. **No `react`, no `next/*`, no `server-only`** — directly *or transitively*. V2's
   `queries/translations.ts` acquired the marker through
   `@/lib/translate/contract` → `@/lib/prompt/base`, and the direct check saw
   nothing. **A5's exposure is `queries/admin/moderation.ts`, which needs
   `normalizeForMatching`-adjacent things from `@/lib/moderation/`** — it must
   import only `@/lib/db/crypto` (which imports `@/lib/env`, a leaf) and
   `@/lib/db/schema`, and **never `@/lib/moderation/blocklist`, `classify` or
   `gate`, all of which are `server-only`**. If a value is needed from
   `moderation/types.ts` (client-importable), that is fine; anything else is a leaf
   split, the `translate/keys.ts` treatment.
3. **`import { db } from '../client'` is forbidden**, and `DbOrTx` comes from
   `../types`.
4. **A malformed uuid returns null rather than reaching the driver** (A5-17).

**And the `sql<T>` rule, which is the one that actually bit V8.** `answersUpdatedAt`
typed its aggregate `unknown` and converted by hand *because Drizzle maps a
timestamp to a `Date` only when it knows the COLUMN; inside a raw `sql` template
there is no mapper and postgres.js returns a **string***. The first version asserted
`Date`, the compiler believed it, `personaStaleness` compared a string to a Date
with `>` — which coerces and answers *something* — and every answer edit was judged
wrongly **with a green typecheck and a green unit suite**. Only an integration test
calling `.getTime()` saw it. **Every aggregate and every `is not null` A5 writes
gets an integration test that asserts the JavaScript type, not just the value**, and
every `sql<boolean>` is wrapped in `Boolean(...)` at the boundary — the
`readingsForDay` `hasBody` precedent.

---

## 9. The fences

`src/app/admin/users/[id]/page.contract.test.ts`, modelled on
`src/app/s/[slug]/page.contract.test.ts` — source-level, comments stripped for the
negative assertions (*a rule that fires on prose describing the rule is a rule
people delete*).

| # | Assertion | Why |
|---|---|---|
| A5-23 | no `useT`, `getT`, `tFor`, `useLocale`, `@/lib/i18n/t`, `@/lib/i18n/LocaleProvider` anywhere under `src/app/admin/**` | A-D12, A5-3 |
| A5-24 | no `@/lib/persona/generate`, `@/lib/prompt/**`, `@/lib/llm/**` except `prices`, `@/lib/translate/**`, `generateLotus` | **the admin tree makes no model call**, and a page that could would be `LLM_WINDOW_CALL_CEILING` with an operator's finger on it |
| A5-25 | no `db.insert`, `db.update`, `db.delete`, `.set(` outside `recordAdminAccess`'s call | §1: no admin write to querent data |
| A5-26 | no `decryptField`, `answerAad`, `moderationFlagAad` in `src/app/**` | decryption lives in `queries/`, both sites, and nowhere else |
| A5-27 | `moderationFlagAad` appears in exactly three files repo-wide | A5-7 |
| A5-28 | `recordAdminAccess` is `await`ed and is not inside a `try` in any route under `src/app/api/admin/users/**` | A5-10 — the ordering, asserted on the source, the `delete.integration.test.ts` precedent |
| A5-29 | `after(` does not appear in any `src/app/api/admin/**` route | an `after()` runs once the response is on its way, so an audit row written there is written after the plaintext left |
| A5-30 | no `revoke`, `redact`, `deleteAccount`, `clearFreeTextAnswers` import | no destructive control on this surface |
| A5-31 | every route file contains `export const runtime` and `export const maxDuration` | §4.2 |
| A5-32 | every route file contains `private, no-store` | A5-5 |
| A5-33 | `AdminReadingDetail` does not import `ReadingView`, and `ReadingView.tsx` gains no new prop | A5-21 / §11.5 |
| A5-34 | no `'body'` or `'gist'` selection in `queries/admin/users.ts`'s list projection, and no `q` parameter reaching `readings.question` | A5-8, A5-13 |

The file also asserts the positives, so nothing above passes vacuously: the page
exports a default async component, calls `requireAdmin`, and is longer than 2000
characters.

---

## 10. `AdminReveal` — the one client component

```tsx
'use client';
type Props = {
  /** The full URL. Built by the SERVER section, so the client never composes a path
   *  from a subject id it might get wrong. */
  href: string;
  /** The button's Indonesian label, from copy.ts. */
  label: string;
  /** Which field of the JSON body holds the plaintext. */
  field: 'text' | 'question' | 'body';
  /** Rendered instead of the button when there is nothing to reveal. */
  unavailable?: string;
};
```

Five states: idle · loading · revealed · empty (`text === null`, a skip) · failed.

**The bound is `AbortSignal.timeout(12_000)`, paired with the route's
`maxDuration = 15`** (§4.2 rule 2). A timeout renders "gagal — coba lagi" and is
retryable **once**; that is the one outcome that means *unknown*, which is why it is
the only one retried, while a `!res.ok` renders the error and stops, because that is
an answer.

**Nothing is fetched on mount.** The request is the asking (reconciliation §7.3's
"until asked"), and the plaintext of a row the operator never opened never leaves
the server.

**No event fires on reveal, on open or on close** (A5-19, A-D18). The button carries
a `title`-free `aria-expanded` and the revealed text is inside a
`<div aria-live="polite">`.

**Safari does not focus a `<button>` when it is tapped**, so if the reveal ever
becomes a dialog it takes the opener as a **prop** (`returnFocusTo`), never
`document.activeElement`. It is not a dialog today — it reveals in place — and that
is partly why: an admin page is desktop-first and a modal per row is nine modals.

**44px minimum tap target.** `PublicShare`'s 36px button is a known defect on
twenty-three pages; A5 does not add a twenty-fourth.

---

## 11. Three decisions that needed arguing

### 11.1 Why the page is one route and not fourteen

An operator's question is almost never about one table. "Why did this reading cost
that much" spans `readings`, `llm_calls` and `translations`; "did the delete button
work" spans `users`, `share_links`, `moderation_flags` and `onboarding_answers`. A
tabbed page hides exactly the adjacency that answers those, and it costs a
navigation per tab on a **cold lambda**. One page, fourteen sections, anchored
headings.

The cost is a large `Promise.all` on a cold read. `maxDuration = 30` covers it, the
page has a stated failure state, and §14's loop 6 is where a real cold measurement
comes from — 1348ms warm from WSL told us nothing about `POST /api/locale` either.

### 11.2 Why there is no "regenerate" button anywhere

Every generated artifact on this page has an `input_hash` and a staleness rule
behind it: `lotus_avatars` on `lotusInputHash`, `personas` on `personaInputHash`
plus `PERSONA_MIN_AGE_SECONDS` plus the `answersUpdatedAt` user-edit arm,
`daily_summaries` on `updated_at` against its throttle, `translations` on
`updated_at < source.updated_at`. **An admin-triggered regeneration is a write with
no user edit behind it**, so it satisfies none of those preconditions, moves
`updated_at` for a reason the mechanism cannot name, and — for the Lotus — changes
the block injected into every subsequent reading prompt for a querent who did not
ask. It would also spend a model call from a surface with no per-user budget on it.

### 11.3 Why the token series is per-user and the forecast is not

A5 owns "per-user token series" (§7). It does **not** own a per-user forecast:
A-D8's minimum-n discipline applies, and one person's readings over a range will
sit below it for a long time. **A point estimate from nine days of data, shown
alone, is the chart lying with a straight face**, and a per-user forecast is nine
days of one person. The fleet trajectory is A4's, on `/admin/tokens`, where the n
exists.

### 11.4 Why the list carries aggregates at all

A per-user cost league is a table with an inline bar (§5.3), and a league needs the
numbers in the list. That means A3's aggregate is on the list's hot path. **It is
capped by `limit` and keyset-paged**, so the aggregate is over the page's fifty
users and not over the fleet — which is the difference between a join and a
full-table `group by` on `llm_calls`, the one table in this release that gets big.

### 11.5 §12.3 — A5 renders `AdminReadingDetail`, not `ReadingView`

**Ruling: its own component.** Roadmap §7 recommends it and seam §11.5 says a
disagreement would be a reconciliation question; this agrees, so no question is
opened. Four reasons, and the second is the binding one.

1. **`ReadingView`'s header says "ONE RENDERER, THREE MOUNTS" and its four rules are
   each justified by the public mount.** Mounting it on `/admin` makes a documented
   invariant list wrong in the first line, and the fix would be editing a component
   whose fences (`clientBoundary.test.ts`, `page.contract.test.ts`,
   `ReadingView.test.tsx`'s truth table) were written surface by surface.

2. **What the admin page must show is a superset that would have to become
   `ReadingViewProps`.** `status`, `model`, `prompt_version`, `token_input`,
   `token_output`, `latency_ms`, `session_id`, `has_gist`, `shared_at`, the
   per-reading `llm_calls` rollup, `local_date` beside `created_at`. **Adding any of
   those to the shared component puts operator-only fields on the component that
   renders `/s/<slug>` to strangers** — a props type that carries `session_id` is
   one careless spread away from putting it in a public page's RSC payload. That is
   the VD8 hazard shape and it is why this is not a taste question.

3. **`ReadingView` never receives a `blocked` reading and A5 must show them**
   (A5-22). All three of its callers filter `status <> 'blocked'`; a blocked row has
   no `reading_cards`, so `Slots` would render three empty boxes with slot labels
   and the flagged question above them, which looks like a rendering bug and is
   actually the component being handed input no caller was ever supposed to hand it.

4. **`ReadingView` renders everything through `useT()`.** The catalog is available
   on `/admin` — `LocaleProvider` is mounted in the root layout, which is why this is
   the weakest of the four and is stated as such — but the *strings* would then
   follow the admin's own `users.locale`, so an operator with `locale = 'en'` would
   read an English reading panel inside an otherwise Indonesian dashboard. A-D12's
   rule is that admin copy is Indonesian and hardcoded; mounting a `t()`-driven
   component is that rule broken by import rather than by typing.

**What `AdminReadingDetail` does instead, and what it deliberately keeps:** it
renders `body` verbatim in `reading.locale` with `lang={reading.locale}` on the
paragraph — the honest half of `as-written`, and the attribute is what points a
screen reader and the browser's translate offer at the right language. It
**never translates and never fetches a translation**; the `translations` section
four rows down is where the operator sees what translations exist. It renders
`choice` with **no `lang` attribute**, matching the question block, because
`reading.locale` is the language the *prose* came out in and the querent may have
typed Indonesian into the English app. And it sorts cards by `position` into a
sparse array by index (§4.6).

---

## 12. Interfaces I need from other workstreams

### 12.1 From A1 — and the first item is a release blocker for A5

**1. `recordAdminAccess` MUST THROW ON FAILURE.**

```ts
// src/lib/db/queries/admin/audit.ts   — handle first
export type AdminAuditResource =
  | 'onboarding_answer' | 'moderation_question' | 'user_detail' | 'reading_body';

/**
 * THROWS. Does not swallow, does not log-and-continue, is never called from
 * `after()`. A5-10 depends on the throw: "a failed audit write is a failed reveal"
 * is only true if the failure reaches the caller.
 */
export async function recordAdminAccess(db: DbOrTx, row: {
  adminUserId: string | null;
  subjectUserId: string | null;
  resource: AdminAuditResource;
  resourceKey: string | null;
}): Promise<void>;

export async function adminAccessForSubject(
  db: DbOrTx, subjectUserId: string, limit: number,
): Promise<Array<{
  createdAt: Date; adminUserId: string | null; adminEmail: string | null;
  resource: string; resourceKey: string | null;
}>>;
```

Every other write in this codebase swallows — `flushEvents`, `recordModerationFlag`,
`track()`, the sweep — for good reasons that do **not** apply here. If A1 writes
this one in that house style, A5-10 becomes unimplementable **and looks
implemented**, which is the worst available outcome. Say it in the function's own
header.

**2. `resourceKey` is NEVER a decrypted value.** §3.1 says so; A5 passes a question
key, a flag id or a reading id and nothing else.

**3. The gate and the 404, as functions:**

```ts
// src/lib/admin/identity.ts
export function isAdminEmail(email: string | null | undefined): boolean;  // PURE
export async function requireAdmin(): Promise<
  { ok: true; user: CurrentUser } | { ok: false; response: NextResponse }>;
/** The 404 body, once, so every refusal in the tree is byte-identical (A5-1). */
export function adminNotFound(): NextResponse;
/** For pages: throws Next's notFound(). */
export async function requireAdminPage(): Promise<CurrentUser>;
```

**4. `admin.page_viewed` in `events.ts` with `{ page: string }`**, transcribed and
not narrowed (§11.1 of the roadmap). A5 passes `'users'` or `'user_detail'` and
never an id (A5-19).

**5. The `/privacy` amendment must describe what A5 actually built** (seam §11.8):
one key per request, every reveal logged, an operator can read a question including
a refused one (A5-22), and no un-redaction. **Written last, from this code.** A5
provides the sentence list; A1 owns the clause.

**6. `admin_user_id` nullable with `on delete set null`** — §12.1 of the roadmap.
A5 renders the NULL state (§4.14), so the resolution must be the nullable one or
that section renders a case that cannot occur.

**7. A ruling on the un-onboarded admin** (§13.9). A5 assumes resolution (a) — the
admin completes onboarding like anyone else — and therefore assumes
`getProfile(db, adminId)` is non-null for the caller. If reconciliation picks (b),
A5 needs one more state on the shell and Task 17's loop-5 run needs a second
account.

### 12.2 From A2

```ts
// src/lib/llm/prices.ts — PURE, zero imports
export type LlmOp = 'reading' | 'moderation' | 'gist' | 'day_summary' | 'frequency'
                  | 'lotus' | 'persona' | 'translation' | 'translation_repair';
/** null for an unknown model — NEVER zero (A-D7). */
export function priceFor(model: string, at: string): { inUsdPerMTok: number;
                                                       outUsdPerMTok: number } | null;
```

Plus: the column is **`total_ms`**, not `latency_ms` (roadmap seam 2; A2 proposes
`total_ms` and A5's column headers are written against that name). And A5 asks A2 to
set `llm_calls.reading_id` on the **`gist`** op as well as `reading` — it runs in
the same `after()` *after* `persistReading`, so the id exists — which makes the
per-reading figure in §4.6 closer to complete. `moderation` cannot and A5-D3 says so
on screen.

### 12.3 From A3

```ts
// src/lib/db/queries/admin/users.ts
export async function adminUserById(db: DbOrTx, id: string): Promise<AdminUserRow | null>;
export async function adminUserList(db: DbOrTx, args: {
  q?: string; limit: number; cursor?: { lastSeenAt: Date; id: string };
  deleted: 'all' | 'only' | 'hide';
}): Promise<{ items: AdminUserListItem[]; nextCursor: … }>;

// src/lib/db/queries/admin/metrics.ts
export async function userTokenSeries(db: DbOrTx, userId: string,
  range: { from: string; to: string }): Promise<Array<{ localDate: string;
    calls: number; inputTokens: number; outputTokens: number; unpriced: number }>>;
export async function userCallsByOp(db: DbOrTx, userId: string,
  range: { from: string; to: string }): Promise<Array<{ op: LlmOp; calls: number;
    inputTokens: number; outputTokens: number; unpriced: number }>>;
```

Four requirements on those, each of which is a bug if missed:

1. **`adminUserById` and `adminUserList` MUST NOT filter `deleted_at`.**
   `getUserById` and `findUserByGoogleSub` in `queries/profile.ts` both filter
   `isNull(users.deletedAt)`, and reusing either makes A5-14 unsatisfiable — a
   soft-deleted user simply 404s and the 30-day restore window becomes invisible.
   This is the single most likely accidental defect in the seam.
2. **Bucketing is on `llm_calls.local_date`, never on `created_at`** in the
   server's zone (A5-15, §7 of the roadmap).
3. **Every aggregate has an integration test asserting the JavaScript type**, per
   §8's `sql<T>` rule. `unknown` and convert by hand; do not "tidy" it into
   `sql<number>` or `sql<Date>`.
4. **`op` is nine values, closed.** A3 must not invent a tenth or an alias
   (roadmap seam 3), and A5's stacked bar folds to 4 + Other rather than growing a
   fifth categorical hue.

If A3 does not ship `readingCostsFor(db, readingIds)`, A5 writes it in
`queries/admin/readings.ts` — it is a single `group by reading_id` over
`llm_calls_reading_idx` and belongs with the readings it annotates.

### 12.4 From A4

`StatTile`, `KpiRow`, `LineChart` (2 series, one axis), `StackedBar` (horizontal),
`Sparkline`, `TableView`, `Legend`, `HeroFigure`. **A5 introduces no hex value and
no new dependency**, and every chart it mounts gets A4's table view — which is both
the CVD relief and how a screen reader reads a chart.

---

## 13. Discrepancies found in the roadmap

Recorded here because reconciliation folds this section.

**13.1 §4.1 has no route that can write `resource = 'reading_body'`, which §3.1
declares.** Either the resource set has a dead value or a route is missing. A5 adds
`GET /api/admin/users/[id]/reading/[readingId]` (§6.4). If reconciliation prefers
the other resolution — bodies inline on the page — then `reading_body` must be
struck from §3.1's set and A5-8's payload rule loosened for the detail page, and
**both** changes have to be made together.

**13.2 §7's "per-reading token cost" is not achievable as stated.**
`llm_calls.reading_id` is "set for the reading call only", and the moderation
classifier runs *before* the `readings` row exists, so it can never carry the id. A
figure labelled "the cost of this reading" that omits moderation and (today) the
gist is a wrong number with a right label. A5-D3 renames it and §12.2 asks A2 for
`reading_id` on `gist`.

**13.3 `getUserById` filters `deleted_at`, so §7's "a soft-deleted user is visible
AND LABELLED" fails silently if A3 reuses it.** Named in §12.3 item 1.

**13.4 A-D12's stated reason does not apply to `/admin`.** *"Putting them in
`locales/id.ts` and `en.ts` would ship every one of them to every querent on every
page load"* — true of the strings, but `LocaleProvider` is mounted in the **root
layout**, so the existing catalog already ships on `/admin` too. The rule is right;
its reasoning as applied to the admin tree is weaker than stated, which matters
because it means **the `t()`-absence grep is the whole enforcement** and not a belt
to a structural brace.

**13.5 §7's A5 acceptance "the list payload carries no decrypted answer" is
vacuous as written** — the list has no answer field to be null. Asserted properly
means asserting on the **detail** page's payload too (no `body`, no `gist`, no
`answer_text`, no `question` from `moderation_flags`), which A5-8 does.

**13.6 §10.2's "every `/api/admin/**` URL 404s or 401s" is satisfiable and the
shapes differ by caller.** Signed out, `decide()` returns
`{ kind: 'json', status: 401 }` for anything under `/api/` — so 401 from
middleware. Signed in and not an admin: 404 from `requireAdmin()`. Both are
correct; the acceptance script must expect **two** different codes for two
different callers and not treat 401 as a failure.

**13.7 §3.1's `resource` set has no value for the list page.** `/admin/users` reads
one row per user, so writing a `user_detail` row per listed user would be fifty
audit rows per page load and would make §4.14 unreadable. **A5 writes no audit row
for the list**, and records here that a list read is therefore not in the audit
trail. That is the honest trade — the list carries no prose and no PII beyond email
and display name, which the operator needs to find anybody at all — but it is a
gap somebody should know about before answering a subject access request.

**13.8 Minor: §7's A5 bullet says "nothing on these pages calls `t()` (A-D12)" and
A-D12 says the test lives in A1's scope.** A5 also asserts it locally (A5-23),
because a fence in the workstream that would break it is the fence that fires
first.

**13.9 An admin who has not completed onboarding cannot reach `/admin` at all, and
nothing in the roadmap says so.** `decide()` runs the onboarding check *below* the
signed-in check and *above* everything else: a signed-in, un-onboarded caller gets
`redirect('/onboarding')` for a page and `{ kind: 'json', status: 403 }` for
anything under `/api/`. So an operator account created purely to hold an
`ADMIN_EMAILS` address — the likeliest shape for a second admin, and for the first
one on a fresh preview database — walks the nine-screen questionnaire before it can
see the dashboard, and **the symptom is `/admin` bouncing to `/onboarding`, which
reads exactly like the allowlist being wrong.**

A5 does not fix this: `gate.ts` is A1's and §6 marks it SECURITY-RELEVANT. Two
resolutions exist and reconciliation should pick one rather than discover it on a
preview. (a) Do nothing, and write the sentence into `.env.example` beside
`ADMIN_EMAILS` — the operator completes onboarding once, which is also the only way
they ever see the product. (b) Add `/admin` to `isOnboardingExempt()`, which is a
**different function from `isPublic()`** and so is not the edit §6 forbids — but it
makes `/admin` reachable by a caller with no `profiles` row, and A5's page must then
tolerate `getProfile()` returning null for **the admin**, which is a state nothing
on this surface currently models. **(a) is the recommendation**: it costs one
sentence and no gate change, and the roadmap's own §9 item 1 is that a non-admin
never learns `/admin` exists — an exemption is one more clause in the function that
decides that.

---

## 14. Tasks

Each with an acceptance criterion that is a command or an observation, not an
opinion. **Tasks 1–4 can start before A1 lands; 5 onwards cannot.**

### Task 1 — `src/lib/admin/types.ts` and `src/app/admin/users/copy.ts`

The client-reachable shapes (zero imports, the `@/data/types` rule) and every
Indonesian string, in one file per surface.

**Accept:** `npm run typecheck` green. `grep -rn "useT\|getT\|tFor(" src/app/admin/`
returns nothing. `AdminUserListItem` declares no field named `body`, `gist`,
`question`, `answerText` or `summary`.

### Task 2 — `queries/admin/detail.ts`

`lotusForAdmin`, `dailySummariesForAdmin`, `frequencyVerdictsForAdmin`,
`translationsForAdmin`, `shareLinksForAdmin`, `eventsForAdmin`. Handle first,
`UUID_RE` guard, ownership as a predicate.

**Accept:** `npm run test:integration -- admin/detail`. Every function returns `[]`
or `null` for a uuid that exists but belongs to somebody else. `translationsForAdmin`
returns a `reading` row for this user's reading and **not** for another user's.
Every timestamp asserted with `.getTime()` (§8).

### Task 3 — `queries/admin/moderation.ts` — the one decrypt site

`moderationFlagsForAdmin` (presence only, `question IS NOT NULL`) and
`revealFlagQuestion` returning the four-member union.

**Accept:** `npm run test:integration -- admin/moderation`. Four cases, each with a
seeded row: available → plaintext; `redacted_at` set → `'redacted'` and **no
plaintext in the result object at all**; both NULL → `'never_stored'`; ciphertext
written under a **different** AAD → `'undecryptable'`. Plus: `moderationFlagsForAdmin`'s
returned objects have no `question` key (`'question' in row === false`), and
`grep -rln moderationFlagAad src/` returns exactly three files.

### Task 4 — `queries/admin/readings.ts`

`readingsForAdmin` (no `body`, no `gist`, `hasBody`/`hasGist` as SQL nullity wrapped
in `Boolean(...)`), `readingWithBodyForAdmin` (the reveal's read),
`readingCostsFor`.

**Accept:** `npm run test:integration -- admin/readings`. `'body' in item === false`
and `'gist' in item === false` on every element. A `blocked` reading **is** returned
(the V6 filter is deliberately absent) and has zero cards. `hasBody` is a real
`boolean` under `typeof`. A reading belonging to another user is not returned for a
valid uuid.

### Task 5 — `src/app/api/admin/users/shared.ts`

The gate, `adminNotFound()` re-export, `UUID_RE`, the `503` helper, and the
`private, no-store` header constant. Once, so four routes cannot drift.

**Accept:** every route imports it and constructs no `NextResponse` with a 404
status of its own (asserted in Task 15's contract test).

### Task 6 — `GET /api/admin/users`

**Accept:** `npm run test:integration -- admin/list` — `'body' in item === false`
for every prose column name in the schema; a keyset cursor round-trips and returns
no duplicate id across two pages; `?q=` matches email and display name and matches
nothing when pointed at a question's text; a soft-deleted user appears under
`deleted=all` and `deleted=only` and not under `hide`; a malformed cursor returns
page one and not a 400.

### Task 7 — `GET /api/admin/users/[id]/answer/[key]` — the audited reveal

**Accept:** `npm run test:integration -- admin/audit` proves the ordering with a
`pg_temp` trigger that raises on `insert into admin_access_log` — the request must
**fail** and no plaintext may appear in the response body. Removing the trigger,
the same request 200s and leaves exactly one row with
`resource = 'onboarding_answer'` and `resource_key = <key>`. Plus: an unknown key
404s; a key with no row 404s; a skipped answer 200s with `text: null`; `cache-control`
is `private, no-store`; the response carries no `v1.` substring.

### Task 8 — `GET /api/admin/users/[id]/moderation/[flagId]`

**Accept:** the four states from Task 3, over HTTP. **`redacted` and `never_stored`
write NO audit row** (A5-11) — asserted by counting rows before and after.
`available` writes exactly one. A flag belonging to another user 404s **even though
the caller is an admin** (ownership as a predicate, A5-16).

### Task 9 — `GET /api/admin/users/[id]/reading/[readingId]`

**Accept:** one audit row with `resource = 'reading_body'` on every 200, including
for a `failed` reading whose `body` is NULL. Trigger test as in Task 7. A reading
belonging to another user 404s.

### Task 10 — `/admin/users` page + `AdminUserTable`

Server-rendered table; the client component owns only the search box (debounced,
pushing `?q=`) and the paging links.

**Accept:** `requireAdminPage()` is the first statement. `admin.page_viewed` fires
with `{ page: 'users' }` and no id. Loop 3 at 1440×900 — the table is readable and
does not scroll horizontally. Loop 4 at 320/360/390 — the table's own
`overflow-x: auto` container scrolls and the page body does not.

### Task 11 — `/admin/users/[id]` page shell and the fourteen sections

One `Promise.all`, `runtime = 'nodejs'`, `maxDuration = 30`, anchored headings, a
stated failure state for the whole read (not fourteen).

**Accept:** every §4 field is on screen for a seeded user with rows in all thirteen
tables. `grep -c 'v1\.'` on the rendered HTML is 0. `admin.page_viewed` fires with
`{ page: 'user_detail' }`. With the database stopped the page renders its failure
state and logs the error's **class** only.

### Task 12 — `AdminReveal`, mounted three times

**Accept:** the bound is `AbortSignal.timeout(12_000)`; a timeout is retryable once
and a `!res.ok` is not; nothing is fetched on mount (asserted by a patched-`fetch`
iframe harness under `public/cards/_admin.html`, gitignored); the button is ≥44px;
no event fires on reveal.

### Task 13 — `AdminReadingDetail`

**Accept:** it does not import `ReadingView`; `ReadingView.tsx` and
`ReadingViewProps` are **unchanged** (`git diff --stat` names neither); `body`
carries `lang={reading.locale}`; `choice` carries none; a `blocked` reading renders
its label and no card boxes; three cards with positions `[2,0,1]` render in slot
order — verified with a card id the deck does not contain, which must leave a
**hole** at its own slot and not slide the others left.

### Task 14 — the token series section

**Accept:** two series on **one** axis; a legend renders (≥2 series); the table
view exists; the notional cost carries its unpriced count; buckets move when
`local_date` moves and not when `created_at` does — asserted by an integration test
seeding two calls on one UTC day with different `local_date`s.

### Task 15 — `page.contract.test.ts` — the fourteen fences of §9

**Accept:** `npm test -- admin` green, and every assertion verified by **negative
control**: temporarily introduce the violation, watch the named test fail, revert.
An assertion nobody has seen fail is an assertion that does not bind.

### Task 16 — soft-delete rendering

**Accept:** run V8's live round trip (`docs/workstream-notes.md`, "The deletion
round trip, verified live"), then open the page. It must show the banner,
`restorableUntil` from `ERASURE_GRACE_DAYS`, every share link revoked, every flag
redacted, and the six answers **still present** — with the sentence explaining why
that last one is correct and not a bug.

### Task 17 — loop 5: the 404 to a real non-admin session

**Accept:** `tools/e2e/run.sh` against a preview with an ordinary signed-in Google
session: `/admin`, `/admin/users`, `/admin/users/<uuid>` all **404**; all four
`/api/admin/**` URLs **404**; signed out, the pages 302 to `/login` and the API
routes **401** (§13.6). This is the one loop that can prove it.

### Task 18 — loop 6: the cold path

**Accept:** `/admin/users/<id>` opened from a phone against a preview after the
Neon compute has been idle long enough to suspend. It must not hang past the client
bound, and the number is recorded in `docs/workstream-notes.md`. **`maxDuration` on
a suspended Neon compute is the failure a warm WSL request cannot see**, and it is
the same class as `POST /api/locale`'s.

### Task 19 — `docs/workstream-notes.md`

An A5 section: the file map, the numbered invariants, the measurements, and every
trap this workstream paid for. **Nothing goes into `CLAUDE.md`** (§9 item 12 of the
roadmap; `CLAUDE.md` is reconciliation's only).

### Task 20 — the two checks nothing automates

1. **Read the page at 1440px and say whether an operator can find anything.**
   Fourteen sections is a lot; the honest failure mode is a wall.
2. **Stop the database and open both pages.** They must render a failure state, log
   the error's class only, and never a driver error. The W4 acceptance test, applied
   to a read surface.

---

## 15. Verification summary

| Loop | What it covers here |
|---|---|
| **1 — vitest** | the `page.contract.test.ts` fences (§9); `AdminReveal`'s state machine; the cursor codec; `q` normalisation; `AdminReadingDetail`'s slot ordering with a sparse array |
| **2 — integration** | **required, per the `sql<T>` trap.** Every query in Tasks 2–4; the audit-before-response ordering with a `pg_temp` trigger (Tasks 7–9); `'body' in item === false`; the `local_date` bucket; the four moderation states; ownership as a predicate for every route |
| **3 — `tools/shot.sh` at 1440px** | the desktop case. This is the first desktop-first surface in the project and the only instrument for "is this readable" |
| **4 — `getBoundingClientRect`** | the phone case at 320/360/390: the table scrolls inside its own container, the page body never does |
| **5 — CDP** | the 404 to a real signed-in non-admin, the 401 to a signed-out API caller, and the patched-`fetch` proof that nothing is revealed on mount. **It does not give a phone width** |
| **6 — a real iPhone** | the cold-lambda-plus-suspended-Neon path only (Task 18) |

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
npm test -- admin
npm run db:up && npm run test:integration -- admin
npm run build            # DO NOT SKIP -- the TypeScript trap
# npm run test:all is the one command whose red does not mean anything
```

---

## 16. What this does NOT do

- **No edit.** No write to `users`, `profiles`, `onboarding_answers`,
  `lotus_avatars`, `personas`, `readings`, `reading_cards`, `daily_summaries`,
  `frequency_verdicts`, `translations`, `share_links`, `moderation_flags` or
  `events`. The only insert A5 causes is `admin_access_log`. There is no honest UI
  for "we changed what you said", and the `input_hash` mechanisms would silently
  disagree with the rows they were built from.
- **No regeneration.** No Lotus, no persona, no summary, no verdict, no
  translation. §11.2. A5 makes **no model call on any path** and A5-24 fences it.
- **No export.** No CSV, no JSON dump, no "copy all", no print stylesheet.
  §1/A5-D6.
- **No moderation action.** `moderation_flags` is visible because the ask was
  "everything". Suspending an account, clearing a strike, marking a false positive
  — none of it exists, because none of it is a product decision anybody has taken.
  A "false positive" checkbox in particular is a write to a tuning table with no
  agreed semantics.
- **No un-redact, ever.** No path reads a redacted row, no path compares
  `question_hmac` against a candidate, no retention exemption, no "keep for review"
  flag. The 30-day sweep is untouched (A5-12).
- **No revoke, no delete, no restore.** Not for a share link, not for an account.
  Re-sharing rotates the slug, so an admin revoke has no undo; and restoring an
  account is a thing the querent does by signing in.
- **No `t()`, no locale switcher, no `en` surface.** A-D12.
- **No forecast, no per-user trajectory, no cap, no kill switch.** v0.5.0 observes.
- **No real-time anything.** No polling, no live tail. The freshest number is as
  fresh as the last request that wrote a row.
- **No search over querent free text.** A5-13. It is one `or(...)` away at all
  times and it is a different product.
- **No audit row for the list page**, and §13.7 records that as a stated gap rather
  than an oversight.
