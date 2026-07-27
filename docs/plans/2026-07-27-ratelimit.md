# V9 — Distributed Rate Limiting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the per-instance in-memory sliding windows in
`src/lib/ratelimit.ts` with a fleet-wide limiter that actually binds, and
replace the *primary* abuse control — a hard spend cap at z.ai that **does not
exist on the plan Miftah is actually on** — with something this repository can
enforce: a global daily ceiling on model calls, a non-spoofable IP key, and an
event that makes a degraded limiter visible instead of silent.

**Architecture:** `src/lib/ratelimit.ts` becomes `src/lib/ratelimit/`, a facade
over two interchangeable backends. The four exported functions keep their names,
their positional arguments and their `RateLimitResult` shape; they become
`async`. The Redis backend is Upstash over HTTP. **The Redis backend never fails
the request — it fails over to the in-memory backend it replaced**, which is
exactly the posture that shipped in v0.2.0 and was considered acceptable then. A
new `src/lib/llm/meter.ts` holds a UTC-day ceiling on model calls with two
tiers: deferred work is shed first, interactive work last.

**Tech Stack:** `@upstash/ratelimit` + `@upstash/redis` (**the one new runtime
dependency v0.3.0 permits** — §2 argues it against the Postgres we already
have), the existing `hit()` interface, `src/lib/analytics/events.ts`,
`src/lib/llm/`, Vitest unit + integration, `serverless-redis-http` in
`docker-compose.yml` so `npm run test:integration` needs no network account.

---

## Verified 2026-07-27 (Task 0)

**The questions in §1 are NOT deleted; this is the answer sheet beside them.** A
future session needs to know what was checked as much as what was found. Three
answers change something in the plan and are marked **→**; two facts could not be
established from this machine and are marked **OPEN**, with what they block.

### Verified by reading this repository — all six hold

1. **`hit()` has seven call sites, all inside `async` functions.**
   `api/reading/route.ts:188` (`hit`), `:191` (`refusalsExhausted`), `:200`
   (`hitGlobal`), `:473` (`hitRefusal`); `api/events/route.ts:82`;
   `api/onboarding/shared.ts:44`; `lib/auth/auth.ts:245`. Confirmed by grep. The
   `hit(` matches in `lib/moderation/blocklist.test.ts` are a local test helper of
   the same name, not this module.
2. **Nothing on the edge calls the limiter.** `src/middleware.ts` imports
   `next-auth`, `next/server`, `@/lib/auth/{config,gate,token}` and
   `@/lib/i18n/resolve` — nothing else. All eleven route handlers under
   `src/app/api/**` declare `export const runtime = 'nodejs'`.
3. **`/api/events`'s `clientIp()` keys on the leftmost `x-forwarded-for` value**
   — `forwarded.split(',')[0].trim()` at `route.ts:73`, exactly as §6 quotes it.
   The defect is real and is V9's to fix.
4. **`hit(user.id)` and `hitRefusal(user.id)` pass the same bare key string**,
   kept apart only by `hits` and `refusals` being two different `Map`s. Trap 1 in
   §4 is real.
5. **`src/lib/llm/index.ts` is a 27-line choke point.** `getProvider()` is the
   only way to reach a model; its own header already says "no caller changes —
   that is the point of the interface".
6. **`SECRET_ENV` in `scripts/audit-secrets.ts:234` is a hand-maintained list of
   exactly fourteen names.** Task 18 makes it sixteen.

### z.ai

1. **The Anthropic-compatible endpoint works on this subscription, and it covers
   both models.** `npm run smoke`: `provider=zai model=glm-4.6
   baseURL=https://api.z.ai/api/anthropic`, 80 chunks, first token at 3123ms,
   `tokens in=null out=81` (the `input_tokens: 0` behaviour CLAUDE.md records).
   `npm run probe:moderation -- --stability`: `glm-4.5-flash` answered a
   non-streaming `complete()` in **759ms** and produced **1 distinct output over
   10 runs** at temperature 0, 0 parse failures. **W7's production requirement
   holds on this plan.**
2. **No spend cap, and no pay-as-you-go overflow to cap. This is Branch A.**
   z.ai's own FAQ (`docs.z.ai/devpack/faq`): when the Coding Plan quota is used
   up *"you'll need to wait until the next 5-hour cycle for it to refresh. The
   system will not deduct from your account balance."* A prepaid quota with no
   overflow has no bill to cap. §0.1's Branch A applies and `## Doc amendments`
   §2 is used as written, without the Branch B variant.
3. **→ THE QUOTA IS A ROLLING 5-HOUR WINDOW PLUS A ROLLING 7-DAY ONE. IT IS NOT
   A DAILY QUOTA.** Published tiers: ~80 prompts / 5h (Lite), ~400 (Pro), ~1600
   (Max); weekly ~400 / ~2000 / ~8000. **This is exactly the condition open
   question 2 names**, so `meter.ts`'s shape is a decision and not a
   transcription — see `### The one thing Task 0 changed` below. **Which tier
   this key is on is OPEN** (see below), so `LLM_DAILY_CALL_CEILING`'s real value
   is still underived.
4. **Exhaustion on the wire is OPEN, and not worth inducing to find out.** The
   FAQ documents error `1113 Insufficient Balance` for a *balance* condition and
   says nothing about the shape of a quota-exhaustion response. It could not be
   observed without burning the live quota, which is the outage this workstream
   exists to prevent. **What this blocks:** §1's fact (4) worry — that
   `anthropic.ts` classifies a 429 as transient and retries it against a quota
   that will not refill for hours. Left as a known unknown; the meter is what
   keeps us away from the boundary, and `## Open questions` gains a line.
5. **→ THE ACCEPTABLE-USE ANSWER IS UNFAVOURABLE, WHICH IS THE ONE THING TASK 0
   MOST NEEDED TO KNOW.** The FAQ states the Coding Plan is *"strictly limited to
   use within officially supported tools and products"* and enumerates the
   coding tools and endpoints it may be configured in. **JMTarot is not one of
   them.** Open question 1 asked for this to be read and recorded; it has been,
   and the answer moves *"fund a second provider before V7 ships"* from a
   contingency to a live recommendation. **Nothing in V9 changes because of it**
   — V9 is what makes the app survive the quota, not the terms — but it belongs
   in front of Miftah before V7, and it is now stated as fact rather than risk.

### Upstash

6. **Free tier: 500K commands/month** (~16.6K/day) on the pricing page, against
   **10K/day** in the older FAQ; the conservative number is 10K/day. Exhaustion
   *"return[s] exception"* — i.e. an error, which under §3 lands on the memory
   backend rather than on the querent, which is the right shape. Free databases
   are **archived after ≥30 days of inactivity** with warning emails and no data
   loss — **not** idle-suspended, so fact (9)'s cold-start-every-morning worry
   does not apply.
7. **Commands per `limit()` is OPEN and bounded above.** Upstash does not publish
   a per-algorithm figure; its own docs only warn that *multi-region* sliding
   window *"results in large number of commands"*, and we are single-region.
   Taking the pessimistic reading of 4 commands per call, §2.1's four calls per
   reading is 16, so 10K/day still buys ~600 readings a day — far above anything
   this app sees, and `events:` staying on memory (§2.1) is what keeps the
   unbounded caller off the budget entirely. **Re-measure from Upstash's own
   usage graph after a week rather than from documentation.**
8. **→ THERE IS NO SINGAPORE REGION. The nearest is `ap-northeast-1` (Tokyo).**
   Upstash's FAQ lists AWS us-east-1, us-west-1, eu-west-1 and apn-ne-1, plus GCP
   us-central-1. So a limiter call from a Vercel Singapore function pays a
   SG↔Tokyo round trip, ~70–90ms of network before TLS and HTTP framing — not the
   *"~10–30ms"* §8's `RATELIMIT_TIMEOUT_MS` comment assumes, and not the
   trans-Pacific hop §1's fact (8) feared either. **`RATELIMIT_TIMEOUT_MS=1000`
   is kept**: it is still ~8× the expected warm value, and §3's whole argument is
   that overshooting it costs a degraded limiter and never a failed request. The
   env comment's number is corrected in Task 18.
9. Answered inside (6): archival at 30 days, not idle suspension.
10. `slidingWindow`'s duration argument and `getRemaining`'s return shape are
    **verified at Task 9 against the installed package**, not from documentation
    — the docs confirm `getRemaining` exists and that its `reset` is the *start
    of the next window* rather than an exact expiry, which is fine for a
    `retryAfterSeconds` that is only ever floored at 1.

### Vercel

11. **→ VERCEL OVERWRITES `x-forwarded-for`; IT DOES NOT APPEND.** From
    `vercel.com/docs/headers/request-headers`: *"If you are trying to use Vercel
    behind a proxy, we currently overwrite the `X-Forwarded-For` header and do
    not forward external IPs. This restriction is in place to prevent IP
    spoofing."* `x-real-ip` and `x-vercel-forwarded-for` are both documented as
    *identical to* `x-forwarded-for`, with the difference that
    `x-vercel-forwarded-for` survives a proxy placed **on top of** Vercel, which
    could overwrite the other two. **§6's code is correct as written** — §6 says
    so itself: a one-element list's last element is its only element. Two small
    consequences, both in Task 6: the comment `// Vercel APPENDS` is factually
    wrong and must say *overwrites*, and `x-vercel-forwarded-for` is preferred
    ahead of `x-real-ip` because it is the only one of the three Vercel
    guarantees under a front proxy.
12. **`NextRequest` has no `ip` field in the installed `next@16.2.11`** —
    confirmed by reading
    `node_modules/next/dist/server/web/spec-extension/request.d.ts`, which
    declares `cookies`, `nextUrl`, `page`, `ua` and `url` and nothing else.
    **`@vercel/functions` is not installed and is not being added**: §6 reads
    headers directly, which works identically on Vercel, under `npm run dev`, and
    in a unit test holding a hand-built `Headers`. A dependency for one
    `ipAddress()` call that would still need the header path underneath it is not
    worth it.
13. **`@vercel/firewall`'s plan gating is OPEN**, so the code comment says
    nothing about it. §2.3's rejection stands on its first two grounds, which are
    the ones that do not depend on the answer: it cannot express a budget keyed on
    `users.id`, still less a second tighter budget on the same identity, and there
    is no local equivalent so `npm test` would cover none of it.

### The one thing Task 0 changed

**Fact (3) fires open question 2's conditional.** The plan says: *"If the quota is
a rolling 5-hour window rather than a daily one, `meter.ts`'s UTC-day bucket is
the wrong shape and should become a rolling window with the same two tiers — a
two-line change while nothing depends on the shape, and a migration of a live
counter afterwards."* The quota is a rolling 5-hour window. Nothing depends on
the shape yet, so this is the only cheap moment, and it is Miftah's call because
the *ceiling number* is his to supply either way.

**Everything in Tasks 1–12 is shape-independent** and is built as written.

### Still OPEN, and what each blocks

- **Which Coding Plan tier this key is on (Lite / Pro / Max).** Blocks a real
  value for the ceiling; the shipped default stays a tripwire until it lands, and
  §5 and `## Doc amendments` both already say so in caps.
- **What quota exhaustion looks like on the wire.** Blocks knowing whether
  `anthropic.ts` will retry into a wall. Not inducible without causing the outage.
- **Commands per `limit()` call.** Blocks nothing; re-measure from Upstash's usage
  graph after a week.
- **`@vercel/firewall`'s plan gating.** Blocks nothing; the rejection does not
  rest on it.

---

## 0. Read this before Task 1. The threat model changed underneath the file.

### 0.1 The primary control does not exist, and three documents say it does

`src/lib/ratelimit.ts`'s header, in caps:

> **THE PRIMARY CONTROL IS NOT IN THIS FILE AND IS NOT CODE: a hard spend cap
> set in the z.ai dashboard.**

`docs/DEPLOY-VERCEL.md` §2b makes it a required deployment step and tells you to
"set a hard monthly spend limit". §5 repeats it. `CLAUDE.md` lists it as still
unverified. Reconciliation §5.11 and §7.2 both say it must be confirmed done
before V7 ships, *independent of the Redis decision*.

**Miftah has stated that `LLM_API_KEY` is a fixed annual subscription sold for
coding. Not a wallet. Not pay-as-you-go.** A subscription is a prepaid quota,
and a prepaid quota has no monthly bill to cap. On such a plan a "hard monthly
spend limit" is very likely **not a setting that exists**, and the required
deployment step in §2b is an instruction to do something impossible.

> **DO NOT ASSERT WHICH. VERIFY IT AT TASK 0 AND WRITE DOWN WHAT YOU SAW.** Two
> branches, and the doc amendments in `## Doc amendments` are written for both:
>
> - **Branch A — the dashboard offers no spend cap on a subscription plan.**
>   §2b is replaced wholesale. Its replacement text is written below.
> - **Branch B — the account carries a subscription *and* a pay-as-you-go
>   balance that overflow calls draw on.** Then a cap still exists, it still
>   matters, and §2b keeps its instruction but stops being described as *the
>   primary* control — because the subscription quota is exhausted long before
>   the overflow starts costing money, and quota exhaustion is the failure that
>   actually reaches a user.
>
> In both branches the sentence "the primary control is not in this file" is
> false and must go.

### 0.2 What the risk becomes

**Abuse no longer produces an invoice. It produces an app that stops
answering.**

That is worse in two specific ways and the plan is shaped around both.

1. **It is less visible.** A runaway bill announces itself: a billing alert, a
   number that goes up, an email from the provider. A quota that runs flat at
   4pm announces itself as *readings that fail*, for everybody, with the same
   `[Bacaan terputus…]` notice the app already shows for a dropped stream. There
   is no alert to miss because there is no alert. **This is why V9 ships two new
   events and a documented query and not just a limiter** — see `## Event
   deltas`. A limiter that trips silently is a limiter nobody tunes; a quota
   that empties silently is an outage nobody attributes.

2. **The blast radius is the whole product, not one feature.** `LLM_API_KEY` is
   the single backbone for readings (W4), the moderation classifier (W7), gists
   and day summaries and frequency verdicts (W5), the Lotus distillation (W3),
   V2's translations and V8's persona. There is one provider configured and no
   second one funded. When the quota is out, JMTarot is a card-flipping
   animation with a spinner underneath it.

**And the multiplier is worse than the header records.** The header says each
reading is two model calls (reading + classifier). By v0.3.0 a single visit can
be: classifier, reading, gist (`after()`), day summary, frequency verdict, and —
if the viewer switches language — a translation. Six, from one tap. The daily
ceiling in §5 counts calls, not readings, for that reason.

### 0.3 What replaces the spend cap

Three things, and none of them is one thing.

| Control | Where | What it bounds |
|---|---|---|
| **The distributed limiter** | `src/lib/ratelimit/` | one caller, and one crowd, per hour — *fleet-wide*, not per instance |
| **The global daily ceiling** | `src/lib/llm/meter.ts` | total model calls per UTC day, in two tiers |
| **Visibility** | two events + one log line + one query in `docs/analytics-queries.md` | nothing. It is how anybody finds out either of the above fired |

The limiter stops being best-effort decoration and becomes load-bearing. That
promotion is the whole reason the fail-open decision in §3 is the most
consequential line in the file.

### 0.4 Build order: **V9 lands before V7, and it should land alongside V1**

Reconciliation's revised order is `V1 / V2 V4 V5 / V3 / V6 V8 / V7`. **V9 slots
in at the front, in parallel with V1**, and the reason is mechanical rather than
conceptual:

- V9 depends on nothing. It touches no schema, no prompt, no i18n catalog.
- **`hit()` becomes `async`.** V7's plan (`docs/plans/2026-07-27-sharing.md`
  §4.4, and Task 17 at line 1506) already contains four synchronous `hit()` call
  sites written against today's signature. If V9 lands *after* V7, V9's diff
  edits a file V7 wrote last week, and V7's own §4.4 caveat paragraph — which
  quotes the in-memory header verbatim — is wrong on the day it merges.
- If V9 lands *first*, V7 is written against `await hit(...)` from the start and
  its §4.4 loses the caveat instead of gaining a correction.

```
V1  V9                      parallel. Neither imports the other.
V2  V4  V5                  parallel.
V3                          needs V1.
V6  V8                      need V4's menu.
V7                          last. Now written against an async, fleet-wide hit().
```

**The only file V9 shares with anyone is `src/lib/analytics/events.ts`**, and
that is additive to one type map, like the other six workstreams.

---

## 1. Facts. Verified, and to be verified at Task 0.

**This section is the plan's evidence base and half of it is a research task,
not a claim.** Reconciliation asked for the branch-both-ways treatment; this is
it. Nothing below marked `VERIFY` may be relied on until Task 0 records a value.

### Verified by reading this repository

- **`hit()` has seven call sites**, all inside `async` functions, so making it
  `async` costs seven `await` keywords and zero restructuring:
  `src/app/api/reading/route.ts` (×4: `hit`, `refusalsExhausted`, `hitGlobal`,
  `hitRefusal`), `src/app/api/events/route.ts` (×1),
  `src/app/api/onboarding/shared.ts` (×1), `src/lib/auth/auth.ts:245` (×1, in
  the `jwt` callback's `update` branch). V7 adds four more.
- **Nothing on the edge calls the limiter.** Every route handler declares
  `export const runtime = 'nodejs'`, and `src/middleware.ts` imports
  `@/lib/auth/config` and `@/lib/i18n/resolve` and nothing else. Edge
  compatibility is therefore a nice-to-have for the backend, not a requirement.
  It is still the tiebreaker in §2, because V7's `/s/[slug]` is the first page
  anyone would ever want to move to the edge.
- **`/api/events`'s `clientIp()` keys on the LEFTMOST `x-forwarded-for` value,
  which the caller chooses.** `forwarded.split(',')[0].trim()`. An attacker
  sends `X-Forwarded-For: <random>` and gets a fresh 60-request budget on every
  single request. **The limiter on the app's one public write endpoint is
  currently bypassable in one header.** This is a defect V9 fixes, not a
  refinement it makes — see §6.
- **`hit(user.id)` and `hitRefusal(user.id)` use the same bare key string** and
  are kept apart only by being two different `Map`s. In one shared Redis
  keyspace they collide. See the trap in §4.
- **`src/lib/llm/index.ts` is a real choke point.** `getProvider()` is the only
  way to reach a model, and `LLMProvider` has exactly two methods,
  `streamReading` and `complete`.
- **`scripts/audit-secrets.ts`'s `SECRET_ENV` is a hand-maintained list of
  fourteen names.** A new credential that is not added to it is not scanned for.

### `VERIFY` at Task 0 — z.ai

1. Does the GLM Coding Plan subscription expose the Anthropic-compatible
   endpoint at `https://api.z.ai/api/anthropic`, and does it cover `glm-4.6`
   *and* `glm-4.5-flash`? **`MODERATION_MODEL=glm-4.5-flash` is a production
   requirement (W7), and if the subscription does not include it the moderation
   gate becomes the reading's latency.** Test it: `npm run smoke` and
   `npm run probe:moderation` both make real calls and both already print the
   model.
2. **Is there a spend-cap setting at all?** Screenshot or say plainly that there
   is not. This decides Branch A vs Branch B in §0.1.
3. **What is the quota, in what unit, over what window?** Prompts per 5 hours? A
   daily cap? A monthly token pool? Concurrency? **`LLM_DAILY_CALL_CEILING`'s
   default in §5 is a guess and must be replaced by a number derived from this.**
4. **What does exhaustion look like on the wire** — status code, error body, and
   whether it hard-fails or degrades. `src/lib/llm/anthropic.ts` classifies
   errors; if exhaustion arrives as a 429 it is already handled as transient and
   will be retried, which is the wrong behaviour against a quota that will not
   refill for hours.
5. **The acceptable-use terms.** See `## Open questions`.

### `VERIFY` at Task 0 — Upstash

6. **Free-tier command budget**, in commands per day or per month, and what
   happens on exhaustion (throttle, 429, or a suspended database). §2.1 does the
   arithmetic against this number and it is the number that decides whether
   `/api/events` stays on the memory backend.
7. **How many Redis commands one `Ratelimit.limit()` costs.** It is a Lua
   `EVAL`; Upstash may bill it as one command or as the number of operations
   inside it. This is the multiplier on (6).
8. **Region.** Is there an `ap-southeast-1` (Singapore) region, matching Neon
   and matching the Vercel function region? If not, every limiter call pays a
   trans-Pacific round trip and the fail-open timeout in §3 has to be widened.
9. **Whether a free database auto-suspends on inactivity**, and the cold-start
   penalty if so. A limiter that takes 800ms to answer on the first request
   after a quiet night is a limiter that is timing out into the memory fallback
   every morning.
10. **`Ratelimit.slidingWindow`'s duration argument format** in the installed
    version — `"1 h"` / `"3600 s"` / a raw millisecond number. §4's code uses
    `` `${Math.ceil(windowMs / 1000)} s` ``; if that is rejected, fix it there.

### `VERIFY` at Task 0 — Vercel

11. **Which header carries the non-spoofable client IP, and where in it.** The
    candidates are `x-real-ip`, `x-vercel-forwarded-for` and the *last* entry of
    `x-forwarded-for`. §6 is written to prefer the first two and to take the
    **last** entry of `x-forwarded-for` only as a fallback, which is safe under
    every documented behaviour — but confirm it, because a limiter keyed on an
    attacker-controlled header is theatre and this is the line that decides.
12. **`NextRequest.ip` was removed** (Next 15). Confirm, and confirm whether
    `@vercel/functions`'s `ipAddress()` is the sanctioned replacement. §6 does
    not depend on it — it reads headers directly, which works identically on
    Vercel, locally, and in a unit test with a hand-built `Headers` — but if
    `ipAddress()` is available and cheap, `clientIp()` should defer to it and
    keep the header logic as the non-Vercel path.
13. **`@vercel/firewall`'s `checkRateLimit()` plan gating.** §2.3 rejects it on
    design grounds regardless, but the rejection should say "and it is Pro-only"
    only if that is true.

**How to record the answers.** Add a `## Verified 2026-07-…` block at the top of
this file with one line per numbered item. Do not delete the questions; a future
session needs to know what was checked as much as what was found.

---

## 2. The backend decision

### 2.1 Chosen: Upstash Redis over HTTP, via `@upstash/ratelimit`

`src/lib/ratelimit.ts`'s header names it, so this is the default answer and the
burden is on the alternatives. It survives the burden for four reasons that are
about *this* codebase, not about Redis in general.

1. **HTTP, not a socket.** `src/lib/db/client.ts`'s comment block is a monument
   to what connection pooling costs in serverless: `max: 1`, `prepare: false`,
   keyed off `VERCEL` and not `NODE_ENV` because a preview build is also
   `NODE_ENV=production`. A REST client has none of that surface. There is no
   pool to size, no connection to leak, and nothing to reason about when the
   function is frozen mid-request.
2. **It works from the edge.** Nothing needs it today (§1). But V7's
   `/s/[slug]` is a public, read-mostly, cache-friendly page and it is the first
   thing anyone will ever want to move to the edge runtime, and its per-IP
   limiter is precisely the thing that would then have to move with it.
   Postgres cannot follow it there; an HTTP limiter can.
3. **The sliding window is atomic and server-side.** A Lua script, one round
   trip, no read-modify-write race between two concurrent invocations. The
   in-memory version has the same property only because a single instance is
   single-threaded.
4. **`ephemeralCache` is the flood absorber.** `@upstash/ratelimit` accepts an
   in-process `Map`; once an identifier is blocked, further requests from it are
   rejected locally with **zero** Redis commands until its reset time. The
   command count therefore does *not* scale with the size of an attack, which is
   the exact failure mode "a limiter that runs out of its own quota" describes.

**The command-budget arithmetic**, to be completed at Task 0 against fact (6):

```
per reading            3 limit() calls  (hit, refusalsExhausted-as-peek, hitGlobal)
                     + 1 reserve        (the daily ceiling)
                     = 4 calls x (commands per EVAL, fact 7)
per share view (V7)    2 calls          (share:view:<ip>, share:view:_global)
per events batch       1 call           -- BUT SEE BELOW
per onboarding write   1 call
per session refresh    1 call
```

`/api/events` is the volume driver and the only one whose count is unbounded by
anything a human does: `track.client.ts` flushes on a 2s debounce, at 20 events,
and on the hide path. A busy session produces ten or more batches. **So
`events:` stays on the memory backend by default** (§4, `MEMORY_ONLY`), which is
defensible on its own merits and not only as a budget dodge: `/api/events`
always answers 204, only writes names from a closed taxonomy, never reads a user
id from the body, and W4's own route header says "the real protection is that
there is nothing worth doing with this endpoint". The cost of abusing it is
bounded rows, not model calls. It is one env var away from Redis if that stops
being true.

### 2.2 Rejected, with a real argument: a Postgres-backed counter

This deserved a genuine look and it nearly won. The case for it is strong:

- **We already have Neon**, already have a client, already have a migrations
  discipline and a `queries/` contract. No new service, no new secret, no new
  free tier to run out of, no new vendor to be down.
- **Warm latency is better, not worse.** Neon Singapore from a Vercel Singapore
  function is single-digit milliseconds; an Upstash HTTP round trip is that plus
  TLS and HTTP framing.
- **The statement is easy and atomic.** A fixed-window bucket is one
  `insert … on conflict do update set n = counters.n + 1 returning n`. A sliding
  window is two buckets in one CTE. There is no correctness problem here.
- **Adding a runtime dependency has a real cost** in a project whose
  `package.json` has eleven of them and whose CLAUDE.md is largely a list of
  things that broke.

It loses on three grounds, and the third is decisive.

1. **Neon's free plan scales to zero.** A limiter is the *first* statement in a
   request, before anything else touches the database. On `/api/events` — which
   currently touches Postgres only inside `after()`, i.e. after the 204 has been
   sent — a Postgres-backed limiter moves the database wake onto the response
   path of the app's highest-volume endpoint. That is the shape of thing v0.2.0
   §6's non-negotiable exists to forbid.

2. **It makes the database the DoS target.** The purpose of the limiter is to
   absorb a flood cheaply. A flood that lands as writes into Neon burns the free
   plan's compute-hours, competes with the app's real queries for the connection
   budget that `max: 1` was carefully sized against, and turns "somebody is
   hammering `/api/events`" into "the reading path is slow". The thing you use
   to absorb an attack should not be the thing the attack damages.

3. **It collapses two failure domains into one, and W4 bought that separation
   deliberately.** `CLAUDE.md`'s W4 section states the requirement in one
   sentence: *"stop the database and take a reading. It must stream and complete
   exactly as normal."* A Postgres-backed limiter forces the fail-open/fail-closed
   question in §3 onto the reading path during a **database** outage, and both
   answers are bad: fail open and the app is unlimited exactly when it is already
   sick; fail closed and W4's guarantee — which has a manual test and a paragraph
   of CLAUDE.md — is simply false. **An independent limiter store keeps
   "Postgres is down" meaning exactly what W4 promised it means.** That is worth
   a dependency.

The counter-argument, stated so nobody has to rediscover it: this adds a second
service that can be down. It is answered by §3 — an Upstash outage degrades the
limiter to what shipped in v0.2.0, and never to nothing.

**Do not revisit this by half.** A Postgres counter *behind the `RateLimitBackend`
interface* is thirty lines and someone will propose it as "we already have the
seam". The seam exists to make the memory fallback honest, and adding a third
backend means three code paths to reason about during an incident. If Upstash is
ever dropped, the replacement replaces it — it does not join it.

### 2.3 Rejected, briefly

- **Vercel KV.** It is Upstash, sold through the Vercel Marketplace, with an
  extra billing relationship in the middle. Choosing it is choosing Upstash and
  paying for the introduction. `VERIFY` its current status at Task 0; if it has
  become a distinct product the argument changes, but the default assumption is
  that it has not.
- **`@vercel/firewall`'s `checkRateLimit()` / WAF rate-limit rules.** Three
  reasons, and the first two hold regardless of what fact (13) turns up.
  (a) **It cannot express our keys.** The budgets here are keyed on `users.id`,
  and one of them — the refusal sub-limit — is a *second, tighter* budget on the
  same identity with different semantics (`hitRefusal` records, `refusalsExhausted`
  reads). An edge firewall keyed on IP and path cannot say any of that.
  (b) **It is untestable here.** There is no local equivalent, so `npm test`
  covers nothing and the only way to find out whether a rule works is production.
  This project's entire verification discipline (`CLAUDE.md`, "How to verify
  things here") is built on the opposite premise.
  (c) It is very likely plan-gated. Say so in the code comment only if Task 0
  confirms it.
- **Keeping the in-memory limiter.** The trigger has fired; that is why this
  plan exists. Worth recording what it would actually mean: with N warm
  instances, every stated limit is silently N times larger. **V7's slug
  arithmetic is the concrete casualty** — see §7.

---

## 3. Fail-open or fail-closed. The single most consequential line.

### How this codebase resolves the tension elsewhere

It does not have one rule. It has one *method*, and the method is what V9
inherits.

- **Analytics fails silently and completely.** `track()` returns `void`, the
  whole body of `flush.ts` is inside a try/catch, and the acceptance test is
  "stop the database and take a reading". Cost of being wrong: some rows are
  missing. Cost of the alternative: a reading fails because a metric could not be
  written. Not close.
- **The moderation gate fails *conditionally*, and its comment is the model for
  this section.** `src/lib/moderation/gate.ts`: a silent classifier over a
  **clean** blocklist fails OPEN; a silent classifier over a **suspect**
  blocklist fails CLOSED as `unclear`. Its stated reasoning: *"Flat fail-closed
  is wrong because the classifier is a network call to the same provider... Flat
  fail-open is wrong because a timeout you can induce is a bypass. The cost of
  being wrong is deliberately asymmetric."*

**The method: decide by the asymmetry of the cost of being wrong, using whatever
local signal you already have.** Not by a principle about limiters.

### The decision

> ## **EVERY LIMITER FAILS OPEN — TO THE IN-MEMORY LIMITER IT REPLACED. NEVER TO NOTHING.**

Not fail-open-to-unlimited. Not fail-closed. A third answer that the moderation
gate's method produces once you notice we have a local signal sitting right
there: **the old implementation**, still compiled in, still correct, merely
weaker.

Work the asymmetry:

| | Redis reachable | Redis down |
|---|---|---|
| **fail closed** | exact fleet-wide limits | **JMTarot is 100% down.** An Upstash free tier has no SLA. The limiter becomes the app's availability floor. |
| **fail open to nothing** | exact fleet-wide limits | unlimited, precisely when something is already going wrong |
| **fail open to memory** | exact fleet-wide limits | **per-instance best-effort — i.e. exactly what v0.2.0 shipped and Miftah accepted** |

The third row is never worse than the status quo ante, at any moment, in any
state. There is no argument for either of the others once it is on the table.

Three consequences, each of which someone will otherwise get wrong:

- **DO NOT USE `@upstash/ratelimit`'s built-in `timeout` OPTION.** It exists, it
  looks like exactly what we want, and it is the wrong one: on expiry it returns
  `success: true`, which is fail-open-to-**unlimited**. Race it ourselves against
  `RATELIMIT_TIMEOUT_MS` and fall through to `memoryBackend`. There is a test
  named for this.
- **The daily ceiling degrades the same way and has no exception.** It is
  tempting to argue that a *quota* ceiling must fail closed because the whole
  point is protecting a finite resource. It must not: fail-closed there is
  fail-closed for the app, since the ceiling sits in front of every model call.
  It degrades to a per-instance daily counter, and the real backstop when even
  that is wrong is the provider itself — an exhausted quota returns an error and
  the reading fails, which is the outcome we were trying to ration anyway.
- **The fallback must be LOUD.** A silent fallback is how the fleet-wide limiter
  becomes per-instance memory again for three weeks without anybody knowing.
  `ratelimit.backend_degraded` (§`Event deltas`) plus one `console.warn`, both
  throttled to once per instance per minute so that an outage does not produce a
  million events *through the analytics path we just said must never be on the
  request path*.

---

## 4. The interface, and what it costs to keep it

### The module layout

`src/lib/ratelimit.ts` becomes a directory. **Every existing import — `import
{ hit } from '@/lib/ratelimit'` — resolves unchanged** to `index.ts`. That is
deliberate: the point of this workstream is that the swap stays local, and a
path rename would put V9's fingerprints on seven files for no reason.

```
src/lib/ratelimit/
  types.ts       LEAF. RateLimitResult, RateLimitBackend. NO IMPORTS.
  memory.ts      v0.2.0's implementation, moved VERBATIM. Still synchronous
                 inside; the facade awaits it. THIS IS THE FALLBACK AND IT IS
                 NOT DEAD CODE -- see the header note in Task 2.
  redis.ts       @upstash/{redis,ratelimit}. Lazily constructed, never at module
                 scope. The ONLY file that names the vendor.
  index.ts       THE FACADE. hit / hitGlobal / hitRefusal / refusalsExhausted /
                 peek. Backend selection, the race, the fallback, the namespaces.
  clientIp.ts    The non-spoofable client address. Takes a Headers, not a
                 Request, so a page (`await headers()`) and a route handler
                 (`request.headers`) and a unit test all call it the same way.
```

### What is preserved, and the one thing that is not

Preserved: the names, the positional argument order `(key, now, max, windowMs)`,
the `RateLimitResult` union, the `{ ok }` shape that
`src/lib/auth/server.ts`'s header deliberately mirrors, and the four default
constants.

**Not preserved: they are `async`.** There is no way around it and no point
pretending. A network-backed limiter returns a promise. The cost is seven
`await` keywords at existing call sites plus four in V7 — which is why V9 goes
first (§0.4).

### The one widening, and its argument

One new export: **`peek(key, max, windowMs)` — a read that records nothing.**

This is not new surface, it is the generalisation of surface that already
exists. `refusalsExhausted()` is documented as *"A READ, recording nothing…
calling `hitRefusal()` to ask the question would consume the budget it is asking
about"*. The daily ceiling in §5 needs the identical thing for the identical
reason: deferred work must ask "are we past the soft line?" without spending a
slot on the asking. `refusalsExhausted()` is reimplemented as a two-line wrapper
over `peek()`, so the count of *distinct ideas* in the module goes down.

### The two traps this restructuring pays for

> **TRAP 1 — `hit(user.id)` AND `hitRefusal(user.id)` ARE THE SAME KEY STRING.**
> Today they are kept apart by being two different `Map`s in one module. In a
> single Redis keyspace they are one counter: five refusals would eat five of
> thirty readings, and thirty readings would exhaust the refusal budget six times
> over — which means a heavy legitimate user gets treated as somebody mapping the
> blocklist. **The facade prefixes every key by budget** (`rl:read:`,
> `rl:refuse:`, `rl:global`) and the prefix is applied in `index.ts`, not by
> callers, so it cannot be forgotten at a call site. There is a test that passes
> the same identifier to both and asserts they do not interfere.

> **TRAP 2 — `now` IS ADVISORY UNDER REDIS AND AUTHORITATIVE UNDER MEMORY.**
> `hit(key, T0, 3, 1000)` with a synthetic `T0` is how every existing test drives
> the window, and it works because the memory implementation does the arithmetic
> itself. Redis uses **its own** clock. The parameter stays in the signature
> because dropping it would break every call site's positional access to `max`,
> and because the memory backend still honours it. **A test that pins time is a
> test of the memory backend only.** The Redis backend is tested by the
> integration suite against a real server and by unit tests against a fake
> `Ratelimit`, never by pinning `now`.

### `src/lib/ratelimit/types.ts`

```ts
/**
 * The two shapes everything else in this directory is written against.
 *
 * LEAF MODULE. NO IMPORTS, DELIBERATELY, and not merely as tidiness: `index.ts`
 * imports both backends and `redis.ts` pulls in the vendor SDK, so a type
 * imported from either of those would drag `@upstash/redis` into anything that
 * wanted to name a `RateLimitResult` -- including, eventually, a client
 * component. Same reasoning as `src/lib/db/types.ts` and `src/data/types.ts`.
 */

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

/**
 * One budget, consulted or consumed.
 *
 * `consume` records; `peek` does not. That asymmetry is the whole reason W7's
 * `refusalsExhausted()` exists as a separate function, and it is lifted into
 * the interface here so both backends have to implement it rather than one of
 * them faking it with a consume-and-refund.
 *
 * `now` IS HONOURED BY THE MEMORY BACKEND AND IGNORED BY REDIS, which uses the
 * server's clock. See the trap in the plan; do not "fix" it by sending `now`
 * over the wire, which would let a caller with a wrong clock -- or a caller
 * choosing one -- move their own window.
 */
export interface RateLimitBackend {
  readonly name: 'memory' | 'redis';
  consume(key: string, max: number, windowMs: number, now: number): Promise<RateLimitResult>;
  peek(key: string, max: number, windowMs: number, now: number): Promise<RateLimitResult>;
}
```

### `src/lib/ratelimit/index.ts` — the shape it lands in

Written out in full because the fallback logic is the part that must not be
paraphrased.

```ts
/**
 * Fleet-wide sliding windows, with the per-instance ones underneath as the
 * failure mode.
 *
 * ── WHAT CHANGED, AND WHY THE OLD HEADER'S PRIMARY CONTROL IS GONE ──────────
 *
 * v0.2.0's version of this file said the primary control was "a hard spend cap
 * set in the z.ai dashboard". **THAT SENTENCE IS FALSE AND WAS NEVER ACTED ON.**
 * `LLM_API_KEY` is a FIXED ANNUAL SUBSCRIPTION sold for coding, not a wallet.
 * There is no monthly bill to cap, and there is very likely no such setting.
 *
 * So the risk is not an invoice. **The risk is quota exhaustion, which is a
 * denial of service against the querent** -- and it is strictly worse than a
 * bill, because a bill announces itself and an empty quota just makes every
 * reading fail at 4pm on a Tuesday with nothing in any dashboard. There is one
 * provider configured, and readings, moderation, gists, day summaries,
 * frequency verdicts, translations and the persona all draw on the one key.
 *
 * The primary control is now three things, all of them code:
 *   1. THIS FILE, fleet-wide rather than per-instance -- it is load-bearing now
 *      rather than best-effort, which is what the fail-open rule below is about.
 *   2. `src/lib/llm/meter.ts`, a global ceiling on model calls per UTC day, in
 *      two tiers so deferred work is shed before a querent notices anything.
 *   3. `ratelimit.backend_degraded` and `llm.ceiling_reached`, because a control
 *      nobody can see firing is a control nobody tunes. Query 9 in
 *      `docs/analytics-queries.md`.
 *
 * ── THE FAIL-OPEN RULE. READ IT BEFORE CHANGING ANYTHING BELOW. ─────────────
 *
 * **WHEN REDIS IS UNREACHABLE, EVERY LIMITER FALLS BACK TO `memory.ts`. NEVER
 * TO UNLIMITED, AND NEVER TO A REFUSAL.**
 *
 * Fail-closed makes an Upstash outage a JMTarot outage, on a free tier with no
 * SLA. Fail-open-to-nothing makes the limiter decorative at the exact moment
 * something is already wrong. Falling back to the per-instance windows is never
 * worse than what v0.2.0 shipped -- which was considered acceptable then -- so
 * the degraded state has a floor rather than being a hole.
 *
 * **DO NOT USE `@upstash/ratelimit`'s BUILT-IN `timeout` OPTION.** It looks like
 * exactly this and is not: on expiry it returns `success: true`, i.e. fail-open
 * to unlimited. We race it ourselves. `index.test.ts` has a test named for this.
 *
 * ── THE KEY NAMESPACES ARE APPLIED HERE, NOT BY CALLERS ─────────────────────
 *
 * `hit(user.id)` and `hitRefusal(user.id)` are the SAME STRING. Under two Maps
 * that was fine; under one keyspace it is one counter, and a heavy reader would
 * be treated as somebody probing the blocklist. Prefixing in the facade is what
 * makes that unforgettable.
 */
import { track } from '@/lib/analytics/track';
import { memoryBackend, _resetMemory, _memorySizes } from './memory';
import { redisBackend, redisConfigured } from './redis';
import type { RateLimitBackend, RateLimitResult } from './types';

export type { RateLimitResult } from './types';

const HOUR_MS = 60 * 60 * 1000;

/** Unchanged from v0.2.0. The number, not the enforcement, is what was weak. */
const MAX_PER_WINDOW = 30;

/**
 * The crowd ceiling. **RAISED FROM 400, AND THE RAISE IS NOT A LOOSENING.**
 *
 * 400 was 400 *per instance*, so the real fleet ceiling was 400 x however many
 * instances Vercel had warm -- unknowable, and larger under exactly the load it
 * was meant to catch. Making it fleet-wide at 400 would be a large, silent,
 * untested tightening on launch day. 1200/h is roughly the old number against
 * three warm instances, and the daily ceiling in `meter.ts` -- which 1200/h
 * cannot reach in a day without also tripping -- is now the real bound. This one
 * is a BURST guard.
 */
const GLOBAL_MAX_PER_WINDOW = num('RATELIMIT_GLOBAL_HOURLY', 1200);

/** Unchanged (W7-D13). Deliberately NOT a ban; T&C clause 8. */
const MAX_REFUSALS_PER_WINDOW = 5;

/** How long a limiter may take before we stop waiting and use memory. */
const TIMEOUT_MS = num('RATELIMIT_TIMEOUT_MS', 1000);

/**
 * Budgets that are NOT worth a network round trip.
 *
 * **`events:` IS HERE ON PURPOSE AND IT IS NOT ONLY A COST DECISION.**
 * `/api/events` is the highest-volume caller in the app by an order of magnitude
 * -- `track.client.ts` flushes on a 2s debounce, at 20 buffered events, and on
 * the hide path -- and it is the lowest-value budget: the route always answers
 * 204, writes only names from a closed taxonomy, and never reads a user id from
 * the body. W4's route header says it plainly: there is nothing worth doing with
 * that endpoint. Putting it on Redis would let one browser tab dominate the
 * limiter's own command budget, which is the "a limiter that runs out of quota
 * is worse than no limiter" failure in its purest form.
 *
 * Set RATELIMIT_EVENTS_BACKEND=redis to move it, the day that stops being true.
 */
const MEMORY_ONLY: readonly string[] =
  process.env.RATELIMIT_EVENTS_BACKEND === 'redis' ? [] : ['events:'];

function num(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/**
 * Which backend a key uses.
 *
 * `RATELIMIT_BACKEND=memory` forces everything local -- for `npm run dev`
 * without an Upstash account, and as the 2am kill switch if the limiter itself
 * is the problem. Same shape and same reason as
 * `MODERATION_CLASSIFIER_ENABLED`.
 */
let override: RateLimitBackend | null = null;

function backendFor(key: string): RateLimitBackend {
  if (override) return override;
  if (process.env.RATELIMIT_BACKEND === 'memory') return memoryBackend;
  if (!redisConfigured()) return memoryBackend;
  if (MEMORY_ONLY.some((p) => key.startsWith(p))) return memoryBackend;
  return redisBackend();
}

/**
 * Run one backend operation, and fall back to memory on ANY failure.
 *
 * Note what is NOT here: no retry. A limiter that retries turns one slow round
 * trip into two before answering, on the request path, during an incident. One
 * attempt, a short deadline, then the local answer.
 */
async function guarded(
  op: 'consume' | 'peek',
  key: string,
  max: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult> {
  const backend = backendFor(key);
  if (backend.name === 'memory') return memoryBackend[op](key, max, windowMs, now);

  try {
    return await withTimeout(backend[op](key, max, windowMs, now), TIMEOUT_MS);
  } catch (err) {
    degraded(key, err);
    return memoryBackend[op](key, max, windowMs, now);
  }
}

const TIMED_OUT = Symbol('ratelimit-timeout');

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const race = await Promise.race([
    p,
    new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), ms);
    }),
  ]);
  clearTimeout(timer);
  if (race === TIMED_OUT) throw new Error('timeout');
  return race as T;
}

/**
 * Announce the degradation -- at most once a minute, per instance.
 *
 * **THE THROTTLE IS NOT POLITENESS.** An Upstash outage means every request
 * degrades, and an untrhottled event here would push one analytics row per
 * request into the very `after()` batch that W4 built to keep analytics off the
 * request path. One a minute is enough to see it in query 9 and cheap enough
 * that the outage does not become a second outage.
 *
 * NEVER LOG THE ERROR OBJECT. Same rule as `flush.ts` and the moderation path:
 * a driver or fetch error can quote its request, and one of these keys is a
 * `users.id`. The KIND, and nothing else.
 */
let lastDegradedAt = 0;
const DEGRADE_NOTICE_MS = 60_000;

function degraded(key: string, err: unknown) {
  const now = Date.now();
  if (now - lastDegradedAt < DEGRADE_NOTICE_MS) return;
  lastDegradedAt = now;

  const reason = err instanceof Error && err.message === 'timeout' ? 'timeout' : 'error';
  // The PREFIX only. The rest of the key is a users.id or an IP.
  const surface = key.slice(0, Math.max(0, key.indexOf(':')));
  console.warn(`[ratelimit] redis ${reason}; falling back to per-instance memory`);
  track('ratelimit.backend_degraded', { backend: 'redis', reason, surface });
}

/**
 * One reading attempt by one user.
 *
 * **THE KEY IS `users.id`.** Not the Google sub, and not an IP: a household
 * behind one NAT is one address and three people, and a phone hopping cell
 * towers is one person and three addresses. Unchanged from v0.2.0.
 */
export function hit(
  key: string,
  now = Date.now(),
  max = MAX_PER_WINDOW,
  windowMs = HOUR_MS,
): Promise<RateLimitResult> {
  return guarded('consume', `read:${key}`, max, windowMs, now);
}

/**
 * The whole FLEET, ignoring who. **Read the constant's comment before retuning.**
 *
 * CALL IT ALONGSIDE `hit()`, NOT INSTEAD OF IT, and check both: the per-user
 * limit is what stops one person, and this is what stops a crowd.
 */
export function hitGlobal(
  now = Date.now(),
  max = GLOBAL_MAX_PER_WINDOW,
  windowMs = HOUR_MS,
): Promise<RateLimitResult> {
  return guarded('consume', 'global', max, windowMs, now);
}

/** One refusal by one user (W7-D13). Recorded AFTER the verdict. */
export function hitRefusal(
  key: string,
  now = Date.now(),
  max = MAX_REFUSALS_PER_WINDOW,
  windowMs = HOUR_MS,
): Promise<RateLimitResult> {
  return guarded('consume', `refuse:${key}`, max, windowMs, now);
}

/**
 * A budget consulted without being spent. The generalisation of
 * `refusalsExhausted()`, which is now written in terms of it.
 *
 * The daily ceiling needs exactly this: deferred work asks "are we past the soft
 * line?" and must not burn a slot on the asking.
 */
export function peek(
  key: string,
  max: number,
  windowMs = HOUR_MS,
  now = Date.now(),
): Promise<RateLimitResult> {
  return guarded('peek', key, max, windowMs, now);
}

/** Has this user used up their refusal budget? A READ, recording nothing. */
export async function refusalsExhausted(
  key: string,
  now = Date.now(),
  max = MAX_REFUSALS_PER_WINDOW,
  windowMs = HOUR_MS,
): Promise<{ ok: false; retryAfterSeconds: number } | null> {
  const r = await peek(`refuse:${key}`, max, windowMs, now);
  return r.ok ? null : r;
}

/** Test seams. `_setBackend(null)` restores selection by env. */
export function _reset() {
  _resetMemory();
  lastDegradedAt = 0;
}
export function _setBackend(b: RateLimitBackend | null) {
  override = b;
}
export function _sizes() {
  return _memorySizes();
}
```

**`peek()` on the memory backend cannot be `refusals.get(key)` any more**, since
the memory backend now holds one map for every namespace. That is fine and is
simpler: `memory.ts` keeps a single `Map<string, number[]>` keyed by the already
prefixed key, and `peek` is `consume` without the `push`. Task 2 does this and
the existing tests are what prove it did not change behaviour.

---

## 5. The global daily ceiling

### Where it lives, and why not in the route

**`src/lib/llm/meter.ts`, consulted through `getProvider()`.** The ceiling
counts *model calls*, not readings, because a single visit in v0.3.0 can be six
(§0.2). Putting it in `/api/reading` would count one of those six.

`src/lib/llm/index.ts`'s own header already claims the choke point: *"Adding
Gemini or OpenAI means one new file implementing LLMProvider and one new case
here. No caller changes — that is the point of the interface."* The meter is a
decorator on that interface.

> **`complete()` IS WRAPPED BY THE DECORATOR. `streamReading()` IS METERED AT
> THE ROUTE, AND THE ASYMMETRY IS DELIBERATE.**
>
> `LLMStream` is an intersection of `AsyncIterable` and `{ usage }`, and
> `types.ts` states in caps that **`usage` must always settle and must never
> reject** — nothing awaits it on the hot path, so a rejection is an unhandled
> promise rejection. Wrapping a stream means rebuilding that contract by hand
> inside a decorator, and getting it subtly wrong there produces a process
> warning under load and nothing at all in a test. It is not worth it for one
> call site.
>
> So: `complete()` gets one `await reserveModelCall(...)` in the decorator, which
> covers the classifier, the gist, the day summary, the frequency verdict, the
> Lotus distillation, V2's translations and V8's persona — everything except the
> reading. **The reading reserves explicitly in `/api/reading`, next to the three
> budgets that are already there**, which is also where its 429 has to be
> constructed anyway. `meter.test.ts` asserts the route calls it.

### The design

```ts
/**
 * A global ceiling on model calls per UTC day, in two tiers.
 *
 * **THIS REPLACES THE Z.AI SPEND CAP, WHICH DOES NOT EXIST.** See
 * `src/lib/ratelimit/index.ts`'s header for why. The subscription is a prepaid
 * quota; exhausting it does not produce a bill, it produces an app that stops
 * answering, for everybody, with no billing alert to notice it by.
 *
 * ── WHY UTC AND NOT THE QUERENT'S LOCAL DATE ────────────────────────────────
 *
 * `local_date` is the querent's calendar day and that is load-bearing
 * everywhere else in this codebase -- `todayKey()`'s comment, the `string` type
 * on the column, an integration test that fails if anyone "fixes" it. **A
 * PROVIDER QUOTA IS NOT A PROPERTY OF THE QUERENT'S CALENDAR.** Two people in
 * two zones would disagree about which bucket to increment, so the counter would
 * be double-counted across a six-hour band every single day. This is the one
 * date in the app that is deliberately the server's, and the trap is that it
 * looks exactly like the one thing CLAUDE.md says never to do.
 *
 * ── WHY TWO TIERS ───────────────────────────────────────────────────────────
 *
 * Not everything that calls a model is something a person is watching. Shedding
 * the deferred half first buys hours of headroom that the querent cannot feel,
 * and the app already degrades gracefully for every one of them by
 * construction: `chain.ts` returns null and never throws, `daily_summaries` and
 * `frequency_verdicts` have cache-miss paths, and the Lotus has a template
 * fallback. So the soft tier costs a *slightly worse* reading; the hard tier
 * costs a 429.
 *
 * ── WHAT HAPPENS WHEN THE CLASSIFIER IS SHED ────────────────────────────────
 *
 * Nothing new. `complete()` throws, `classifyQuestion` surfaces it as a
 * `ClassifierError`, and W7's gate applies its existing asymmetric rule: a clean
 * blocklist fails OPEN, a Tier-B suspicion fails CLOSED as `unclear`. That
 * composition is why the classifier is `interactive` and not `deferred` -- it is
 * shed only at the hard ceiling, when readings are being refused anyway.
 */
import { hit, peek } from '@/lib/ratelimit';
import { track } from '@/lib/analytics/track';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Interactive = a person is looking at a spinner. Deferred = it happens in
 * `after()`, or its absence is a cache miss nobody can name.
 *
 * THE RULE, for whoever adds the next model call: if a user is waiting for the
 * bytes, it is interactive. Everything else is deferred, including work that
 * feels important.
 */
export type CallClass = 'interactive' | 'deferred';

export class ModelCeilingError extends Error {
  constructor(readonly tier: 'soft' | 'hard') {
    super(`model call ceiling reached (${tier})`);
    this.name = 'ModelCeilingError';
  }
}

/**
 * **THE DEFAULT IS A GUESS AND MUST BE REPLACED.** It is sized so that it is
 * unreachable by honest traffic at today's user count and reachable by a script,
 * which makes it a tripwire rather than a budget. Task 0 fact (3) is what turns
 * it into a real number: divide the subscription's actual quota by a safety
 * factor and put THAT here, in the Vercel dashboard, with the derivation in the
 * commit message.
 */
function hardCeiling(): number {
  const raw = Number(process.env.LLM_DAILY_CALL_CEILING);
  return Number.isFinite(raw) && raw > 0 ? raw : 4000;
}

/** Defaults to 70% of hard. Below this, deferred work still runs. */
function softCeiling(): number {
  const raw = Number(process.env.LLM_DAILY_CALL_SOFT);
  return Number.isFinite(raw) && raw > 0 ? raw : Math.floor(hardCeiling() * 0.7);
}

/** `llm:day:2026-07-27`. See the header for why this is UTC. */
export function dayKey(now = Date.now()): string {
  return `llm:day:${new Date(now).toISOString().slice(0, 10)}`;
}

/** Seconds to the next UTC midnight. What a 429's `retry-after` should say. */
export function secondsToReset(now = Date.now()): number {
  const next = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate() + 1,
  );
  return Math.max(1, Math.ceil((next - now) / 1000));
}

export type Reservation = { ok: true } | { ok: false; tier: 'soft' | 'hard'; retryAfterSeconds: number };

export async function reserveModelCall(cls: CallClass, now = Date.now()): Promise<Reservation> {
  const key = dayKey(now);
  const hard = hardCeiling();

  /*
   * Deferred work checks the soft line with a READ FIRST, and this ordering is
   * the point of `peek()` existing. Consuming and then deciding to refuse would
   * charge the day for a call that was never made -- which, sustained across an
   * afternoon at the soft line, walks the counter into the hard ceiling on work
   * that was already being declined. Two round trips, off the response path.
   */
  if (cls === 'deferred') {
    const seen = await peek(key, hard, DAY_MS, now);
    const used = seen.ok ? hard - seen.remaining : hard;
    if (used >= softCeiling()) {
      track('llm.ceiling_reached', { tier: 'soft', call_class: cls, used, ceiling: hard });
      return { ok: false, tier: 'soft', retryAfterSeconds: secondsToReset(now) };
    }
  }

  const gate = await hit(key, now, hard, DAY_MS);
  if (!gate.ok) {
    track('llm.ceiling_reached', { tier: 'hard', call_class: cls, used: hard, ceiling: hard });
    return { ok: false, tier: 'hard', retryAfterSeconds: secondsToReset(now) };
  }
  return { ok: true };
}
```

### How anybody finds out

**There is no alerting infrastructure in this project and V9 must not pretend to
build one.** Three mechanisms, all of them already-existing machinery:

1. **`llm.ceiling_reached` and `ratelimit.backend_degraded`** in `events`, with
   query 9 in `docs/analytics-queries.md`.
2. **A `console.warn` with a greppable prefix** — `[ratelimit]`, `[llm]` — in
   the Vercel log. Same convention as `[analytics]` and `[moderation]`, and the
   same limitation: it is a log, and nobody reads logs.
3. **The daily cron.** `/api/cron/sweep` already runs once a day with
   `CRON_SECRET`, and its header says "ONE CRON JOB, THREE DELETES. Not three
   jobs. Vercel's free plan allows a small number of cron invocations." **V9 does
   not add a fourth job and does not add a delete.** It adds one `console.warn`
   at the end of the existing one reporting yesterday's `llm.ceiling_reached`
   count. That is a `SELECT` in a job that is already running, and it is the only
   thing in this design that fires on a day when nobody visits.

**Say plainly what this is not:** it is not paging, it is not email, and it will
not wake anybody up. Making it do that means a service this project does not
have. The honest statement is in `## Open questions`.

---

## 6. The client IP

### The defect

```ts
// src/app/api/events/route.ts, today
function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
```

`x-forwarded-for` is a list that each proxy **appends** to. The leftmost entry is
whatever the *original client* sent — which, when the original client is an
attacker, is whatever they like. Every request can carry a different one, so
every request gets a fresh 60-batch budget. **The limiter on the app's only
public write endpoint does not currently limit anything an attacker cares
about.**

It has never mattered because there was nothing worth doing with `/api/events`
and because the counter was per-instance anyway. It matters now for two reasons:
V9 is what makes these numbers mean something, and V7 is about to add three more
IP-keyed budgets, one of which (`share:view:<ip>`) is the sole enforcement behind
V7's 60-bit slug arithmetic.

### The rule

> **NEVER THE FIRST ENTRY OF `x-forwarded-for`. ONLY A VALUE THE PLATFORM
> APPENDED OR SET.**

```ts
/**
 * The client address, as far as the platform will vouch for it.
 *
 * **THE LEFTMOST `x-forwarded-for` ENTRY IS ATTACKER-CONTROLLED.** It is
 * whatever the original caller sent, and each hop APPENDS. Keying a limiter on
 * it means one header per request buys an unlimited number of budgets, which is
 * a limiter that limits only honest users. That is what shipped in
 * `/api/events` from W4 until V9; it was harmless while the budget was
 * per-instance and there was nothing worth doing with the endpoint, and it stops
 * being harmless the moment V7 makes a page public.
 *
 * On Vercel the trustworthy value is the one Vercel itself wrote:
 * `x-real-ip`, or equivalently the LAST entry of `x-forwarded-for`. Off Vercel
 * -- `npm run dev`, an iframe harness -- there is no proxy and no attacker, so
 * the leftmost entry is fine and everything collapses to `local`.
 *
 * TAKES A `Headers`, NOT A `Request`, so a server component (`await headers()`),
 * a route handler (`request.headers`) and a unit test all call it identically.
 * V7's `/s/[slug]` is a page and would otherwise need a second copy.
 */
export function clientIp(h: Headers): string {
  const onVercel = process.env.VERCEL === '1';

  if (onVercel) {
    const real = h.get('x-real-ip')?.trim();
    if (real) return normalize(real);

    // Vercel APPENDS. The last entry is the one it wrote.
    const chain = h.get('x-forwarded-for');
    if (chain) {
      const parts = chain.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) return normalize(parts[parts.length - 1]);
    }
    return UNKNOWN;
  }

  const local = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip')?.trim();
  return local ? normalize(local) : 'local';
}

/**
 * **AN IPv6 /64 IS ONE CUSTOMER, AND A SINGLE SUBSCRIBER HAS 2^64 ADDRESSES.**
 * Per-address limiting on IPv6 is not a weak limit, it is no limit: a phone on a
 * mobile network can walk a new source address per request without trying. The
 * /64 is the smallest unit a residential or mobile allocation is handed out in,
 * so it is the smallest unit that corresponds to a caller. IPv4 is left alone --
 * a /24 there is a whole neighbourhood, not one household.
 */
function normalize(ip: string): string {
  if (!ip.includes(':')) return ip;
  const groups = ip.split(':');
  // Refuse to guess at a compressed form; a `::` means the /64 is ambiguous
  // without expansion, and an ambiguous key is worse than a coarse one.
  if (ip.includes('::')) return ip;
  return groups.slice(0, 4).join(':') + '::/64';
}

/**
 * The bucket for a request whose address we could not establish.
 *
 * ON VERCEL THIS SHOULD NEVER HAPPEN, and if it does it is worth seeing. It gets
 * its own key rather than being folded into `local`, and it shares one budget --
 * which is the conservative choice and has a known cost: an attacker who could
 * strip the platform's own headers would exhaust it for everyone in the same
 * state. They cannot, on Vercel. If this ever appears in query 9 with volume,
 * that assumption has broken and it is the finding, not the noise.
 */
const UNKNOWN = 'unknown';
```

`VERIFY` fact (11) before shipping. If it turns out Vercel *overwrites*
`x-forwarded-for` with a single trusted value rather than appending, the `last
entry` branch is still correct — a one-element list's last element is its only
element. **That is why the code is written this way round:** it is right under
both behaviours, and the `x-real-ip` preference means the ambiguous case is only
ever a fallback.

---

## 7. Every budget in the app, after V9

| Key | Max | Window | Backend | Change |
|---|---|---|---|---|
| `read:<users.id>` | 30 | 1 h | redis | **now fleet-wide.** Number unchanged. |
| `global` | **1200** | 1 h | redis | was 400 **per instance**; see the constant's comment |
| `refuse:<users.id>` | 5 | 1 h | redis | unchanged (W7-D13) |
| `read:onboarding:<users.id>` | 60 | 1 h | redis | unchanged |
| `read:session-update:<uid>` | 20 | 1 h | redis | unchanged |
| `read:events:<ip>` | 60 | 1 h | **memory** | key is now non-spoofable (§6); backend per `MEMORY_ONLY` |
| `llm:day:<utc>` | `LLM_DAILY_CALL_CEILING` | 24 h | redis | **new** |
| `read:share:view:<ip>` | **120** | 1 h | redis | **V7's number, unchanged. See below.** |
| `read:share:og:<ip>` | 60 | 1 h | redis | V7's, unchanged |
| `read:share:view:_global` | **10000** | 1 h | redis | was 3000 **per instance** |
| `read:share:create:<users.id>` | 20 | 1 h | redis | V7's, unchanged |

### V7's 120 is kept, and V9 is what makes its arithmetic true

`docs/plans/2026-07-27-sharing.md` §2.2 sizes the 60-bit slug against §4.4's
120 views/IP/hour and concludes that a 10,000-node botnet at the full limit needs
**55 years** to find one live reading.

**That number was optimistic, and V9 is the reason it stops being.** With
per-instance memory, one botnet node's requests land on however many warm
instances Vercel has, and each grants it a fresh 120. The effective rate was
`120 x instances`, unknowable and largest under exactly the load an enumeration
attack produces. Fleet-wide enforcement makes 120 mean 120 for the first time.

**So: keep 120, change nothing in V7's §2.2, and tell reconciliation that V7's
enumeration budget went from aspirational to enforced without a line of V7
changing.** That is the cleanest possible interaction between the two
workstreams and it is worth saying out loud, because the obvious instinct on
reading "V9 changes the rate limiter" is to go re-derive the slug length.

`share:view:_global` is raised because it is a **database-read guard, not a
quota guard** — V7's §5.5 and reconciliation §5.5 establish that `/s/[slug]`
makes no model call at all, so a viral link costs one indexed single-row lookup
per view. 3000/h fleet-wide would throttle a genuinely popular link into a 429
that reads as "your friend's link is broken". 10,000/h still bounds a scraper.

---

## 8. Environment variables

```
# --- V9: the distributed rate limiter -------------------------------------

# Upstash Redis, REST. Both or neither: with either missing, every limiter runs
# on the per-instance in-memory windows -- which is what v0.2.0 shipped, so a
# local dev environment needs no account and `npm test` needs no network.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# The 2am kill switch. `memory` forces every budget local, fleet-wide
# enforcement included. Same shape and same reason as
# MODERATION_CLASSIFIER_ENABLED: when the limiter is the thing that is broken,
# the alternative should not be a deploy.
#
# NOTE THE DEFAULTING RULE IS THE OPPOSITE OF ANALYTICS_ENABLED'S, on purpose.
# There, a typo must over-collect. Here, a typo must not silently disable
# enforcement -- so only the exact string `memory` does anything, and anything
# else (including a typo) leaves Redis on.
RATELIMIT_BACKEND=

# How long a limiter may take before we stop waiting and answer from memory.
# NOT a target: a warm Upstash round trip from the same region is ~10-30ms, so
# this is ~30x the expected value and exists only to bound a hung fetch. It is
# the same kind of number as MODERATION_TIMEOUT_MS and it is chosen the same
# way -- from a measurement, once Task 0 has one.
RATELIMIT_TIMEOUT_MS=1000

# The crowd ceiling, per hour, FLEET-WIDE. 400 in v0.2.0 meant 400 per warm
# instance; 1200 is roughly that against three. A burst guard -- the real bound
# is LLM_DAILY_CALL_CEILING below.
RATELIMIT_GLOBAL_HOURLY=1200

# `redis` moves /api/events onto the shared limiter. Left unset it stays on
# per-instance memory, deliberately: it is the highest-volume and lowest-value
# budget in the app, and letting one browser tab dominate the limiter's own
# command budget is the failure mode the limiter exists to prevent.
RATELIMIT_EVENTS_BACKEND=

# --- V9: the global model-call ceiling ------------------------------------

# **THIS REPLACES THE Z.AI SPEND CAP, WHICH DOES NOT EXIST ON A SUBSCRIPTION.**
# LLM_API_KEY is a fixed annual plan, so abuse does not produce a bill -- it
# produces an exhausted quota, which is a denial of service against the querent
# with no billing alert to notice it by.
#
# Counts MODEL CALLS, not readings: one visit can be six (classifier, reading,
# gist, day summary, frequency verdict, translation).
#
# THE DEFAULT IS A GUESS. Replace it with the subscription's real quota divided
# by a safety factor, and put the derivation in the commit message -- the same
# instruction DEPLOY-VERCEL.md 2b used to give about the spend cap, for the
# same reason: the next person needs to know what was chosen, not whether
# anything was.
LLM_DAILY_CALL_CEILING=4000

# The soft tier. Below it, everything runs. Above it, DEFERRED work is shed --
# gists, day summaries, frequency verdicts, the speculative Lotus refresh -- and
# a querent notices nothing except a slightly less specific reading. Defaults to
# 70% of the hard ceiling.
LLM_DAILY_CALL_SOFT=
```

**The `$` trap applies to `UPSTASH_REDIS_REST_TOKEN`.** Escape it as `\$` in
`.env.local`; **do not escape in the Vercel dashboard**, where values are
literal. This is the same trap that mangles a bcrypt hash and a `DATABASE_URL`
password, and an Upstash token is long, opaque, and impossible to eyeball for a
missing character — the symptom is a limiter that is silently 100% degraded,
because a bad token is an error and an error falls back to memory. **Verify with
the `vercel env pull` recipe in `DEPLOY-VERCEL.md` §2's "Verify a value
survived", not by looking at the dashboard.**

**`UPSTASH_REDIS_REST_TOKEN` goes into `scripts/audit-secrets.ts`'s
`SECRET_ENV`.** That list is hand-maintained and a credential missing from it is
a credential the tripwire does not scan for. `UPSTASH_REDIS_REST_URL` goes in
too — it is not a secret but it names the datastore, and the list already
carries `LLM_BASE_URL` and `DATABASE_URL` on exactly that reasoning.

---

## 9. Tasks

Every `npm`/`npx` invocation is preceded by
`export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH`. Check `node -v` before
concluding a failure is a code problem.

---

### Task 0 — Verify §1 before writing a line

**No code. This is the task the rest of the plan is conditional on.**

Work through §1's numbered facts. For z.ai, the fastest evidence is the
dashboard plus two commands you already have:

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run smoke                # one live call: is the key/baseURL/model right?
npm run probe:moderation     # does glm-4.5-flash answer on this plan?
```

Then add a `## Verified 2026-07-…` block at the **top of this file** with one
line per fact, and commit it alone.

```sh
git add docs/plans/2026-07-27-ratelimit.md
git commit -m "V9 Task 0: record what z.ai, Upstash and Vercel actually do"
```

**If fact (2) says a spend cap does exist (Branch B), stop and re-read §0.1** —
the doc amendments change, and `## Doc amendments` has both texts.

---

### Task 1 — `types.ts`, the leaf

**Test first.** `src/lib/ratelimit/types.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('types.ts has no imports -- it is the leaf', () => {
  // Same fence as src/data/types.ts and src/lib/db/types.ts, same reason: a
  // type imported from index.ts would drag @upstash/redis into every consumer.
  const src = readFileSync(new URL('./types.ts', import.meta.url), 'utf8');
  expect(src).not.toMatch(/^\s*import\s/m);
});
```

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm test -- ratelimit     # RED: no such file
```

Create `src/lib/ratelimit/types.ts` with the contents from §4.

```sh
npm test -- ratelimit && npm run typecheck
git commit -am "V9: RateLimitResult and RateLimitBackend, as a leaf module"
```

---

### Task 2 — Move the in-memory implementation, unchanged

`git mv src/lib/ratelimit.ts src/lib/ratelimit/memory.ts` and
`git mv src/lib/ratelimit.test.ts src/lib/ratelimit/memory.test.ts`.

Then rework `memory.ts` into a `RateLimitBackend`:

- one `Map<string, number[]>` instead of `hits` + `refusals` (namespacing moved
  to the facade in Task 4);
- `consume` is today's `record`; `peek` is `record` without the `push`;
- `globalHits` folds into the same map under the key `global`;
- `sweep` is unchanged, still time-guarded, still 60s;
- exports become `memoryBackend`, `_resetMemory`, `_memorySizes`.

**Replace the header wholesale.** The new one leads with:

```
/**
 * The per-instance sliding windows. **THIS IS NOT DEAD CODE AND IT IS NOT
 * LEGACY.** It is the fallback the whole design rests on: when Upstash is
 * unreachable, `index.ts` answers from here rather than failing open to
 * unlimited or closed to an outage. See `index.ts`'s header for the argument.
 *
 * Everything below is v0.2.0's implementation with the namespacing lifted out
 * and `peek` added. The eviction sweep is still TIME-guarded and not
 * SIZE-guarded, and the reason is still that the old `if (hits.size > 1000)`
 * form swept on every request forever once an instance crossed the line, and
 * freed nothing, because active keys are not expired.
 */
```

`memory.test.ts` keeps every existing assertion; adapt only the import and the
call shape (`memoryBackend.consume('a', 3, 1000, T0)`). **The eviction tests are
the ones that must not be weakened** — they encode a regression.

```sh
npm test -- ratelimit && npm run typecheck
git commit -am "V9: move the in-memory limiter behind RateLimitBackend"
```

At this point `@/lib/ratelimit` does not resolve and the build is broken. That is
fine and Task 3 closes it in one commit.

---

### Task 3 — The async facade, over memory only

Write `src/lib/ratelimit/index.ts` from §4, but with `backendFor()` hardcoded to
`memoryBackend` and the `redis.ts` import absent. **One behavioural change and
one only: the functions are async.**

Then `npm run typecheck` drives the call-site edits — it names all seven:

```
src/app/api/reading/route.ts:188   const perUser = await hit(user.id);
src/app/api/reading/route.ts:191   const probing = await refusalsExhausted(user.id);
src/app/api/reading/route.ts:200   const perInstance = await hitGlobal();
src/app/api/reading/route.ts:473   void hitRefusal(user.id);   <-- SEE BELOW
src/app/api/events/route.ts:82     const gate = await hit(...);
src/app/api/onboarding/shared.ts:44 const gate = await hit(...);
src/lib/auth/auth.ts:245           const gate = await hit(...);
```

> **`hitRefusal()` AT `route.ts:473` IS THE ONE THAT IS NOT A PLAIN `await`.**
> It is called *after* the verdict, on the refusal path, and the response is
> already being assembled. Awaiting it adds a Redis round trip to the latency of
> a 403 that a person is waiting for, in order to record something nothing reads
> until their next request. **Fire it into the request's `after()` with
> `defer()`** (`@/lib/analytics/track`), which is exactly what that function is
> for: *"work that must outlive the response"*. `defer` never throws and logs its
> own failures.
>
> Do NOT write a bare `void hitRefusal(...)`: a floating promise in a serverless
> function is a promise that may be frozen before it resolves, and the refusal
> budget would then silently not record — turning off the anti-oracle control
> W7-D13 exists for, invisibly.

Also in this task: **`/api/reading`'s `hit` and `refusalsExhausted` become one
`Promise.all`.**

```ts
/*
 * Concurrent, and that is EXACTLY equivalent to the sequential form it
 * replaces: `hit()` records unconditionally today too -- it is checked first
 * and `refusalsExhausted()` is a read -- so neither's outcome can change the
 * other's effect. `hitGlobal()` still runs LAST and still runs alone, because
 * it RECORDS, and letting one user's rejected requests eat the instance's
 * budget is a self-inflicted denial of service for everyone else.
 */
const [perUser, probing] = await Promise.all([hit(user.id), refusalsExhausted(user.id)]);
```

```sh
npm test && npm run typecheck && npm run build
git commit -am "V9: the rate limiter is async; seven call sites and one defer()"
```

---

### Task 4 — Namespaced keys, and the collision test

**Test first.** `src/lib/ratelimit/index.test.ts`:

```ts
it('a reading budget and a refusal budget do not share a counter', async () => {
  /*
   * **THE TRAP.** `hit(user.id)` and `hitRefusal(user.id)` are the SAME STRING.
   * Two Maps kept them apart; one Redis keyspace would not. Five refusals would
   * eat five of thirty readings and thirty readings would exhaust the refusal
   * budget six times over -- so a heavy legitimate user would be handled as
   * somebody mapping the blocklist.
   */
  _reset();
  for (let i = 0; i < 5; i++) await hitRefusal('u1');
  expect((await hitRefusal('u1')).ok).toBe(false);
  expect((await hit('u1')).ok).toBe(true);          // budget untouched
  expect(await refusalsExhausted('u1')).not.toBeNull();
});
```

Add the `read:` / `refuse:` / `global` prefixes in the facade. Verify RED first
by prefixing nothing.

```sh
npm test -- ratelimit
git commit -am "V9: prefix every budget in the facade, not at the call site"
```

---

### Task 5 — `peek()`, and `refusalsExhausted` on top of it

**Test first:** `peek` twice in a row returns the same `remaining`; `consume`
between them moves it.

Implement per §4. `refusalsExhausted` becomes the two-line wrapper.

```sh
npm test -- ratelimit && npm run typecheck
git commit -am "V9: peek() -- a budget consulted without being spent"
```

---

### Task 6 — `clientIp`, and the header it must not trust

**Test first.** `src/lib/ratelimit/clientIp.test.ts` — write the *attack* case
first and watch it fail:

```ts
it('IGNORES the leftmost x-forwarded-for entry, which the caller chooses', () => {
  // The defect V9 fixes. An attacker sends a different first entry per request
  // and gets a fresh budget every time; Vercel's own value is APPENDED.
  vi.stubEnv('VERCEL', '1');
  const h = new Headers({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' });
  expect(clientIp(h)).toBe('203.0.113.7');
});

it('prefers x-real-ip over the chain', () => { … });
it('falls back to `local` off Vercel', () => { … });
it('returns `unknown` on Vercel with no address at all', () => { … });
```

```sh
npm test -- clientIp     # RED
```

Implement §6's `clientIp` (without `normalize` yet).

```sh
npm test -- clientIp
git commit -am "V9: clientIp() -- never the attacker-chosen x-forwarded-for entry"
```

---

### Task 7 — IPv6 /64

**Test first:**

```ts
it('keys an IPv6 caller by /64, because one subscriber has 2^64 addresses', () => {
  vi.stubEnv('VERCEL', '1');
  const a = new Headers({ 'x-real-ip': '2001:db8:1234:5678:1:2:3:4' });
  const b = new Headers({ 'x-real-ip': '2001:db8:1234:5678:9:9:9:9' });
  expect(clientIp(a)).toBe(clientIp(b));
});

it('leaves IPv4 alone -- a /24 is a neighbourhood, not a household', () => { … });

it('does not guess at a compressed form', () => {
  // `::` makes the /64 ambiguous without expansion, and an ambiguous key is
  // worse than a coarse one: two different callers could normalize together.
  vi.stubEnv('VERCEL', '1');
  const h = new Headers({ 'x-real-ip': '2001:db8::1' });
  expect(clientIp(h)).toBe('2001:db8::1');
});
```

```sh
npm test -- clientIp
git commit -am "V9: normalize IPv6 to /64"
```

---

### Task 8 — Wire it into `/api/events`, delete the local copy

Replace the local `clientIp` in `src/app/api/events/route.ts` with the import,
and **replace its doc comment** — the existing one says "Best-effort client
address" and cites the honest caveat, which is now half wrong. New text:

```
/*
 * The address comes from `@/lib/ratelimit/clientIp`, which refuses the leftmost
 * `x-forwarded-for` entry. THE OLD LOCAL COPY HERE TOOK EXACTLY THAT VALUE and
 * was therefore bypassable in one header -- harmless while there was nothing
 * worth doing with this endpoint, and not worth leaving in place once V9 made
 * the numbers mean something.
 *
 * This budget stays on the PER-INSTANCE backend (`MEMORY_ONLY` in
 * `ratelimit/index.ts`) and that is a decision, not an oversight: it is the
 * highest-volume and lowest-value budget in the app.
 */
```

```sh
npm test && npm run typecheck && npm run build
git commit -am "V9: /api/events keys on an address the caller cannot choose"
```

---

### Task 9 — The dependency, and a client that is never built at module scope

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm install @upstash/ratelimit @upstash/redis
```

**Test first.** `src/lib/ratelimit/redis.test.ts`:

```ts
it('constructs nothing at module scope', async () => {
  /*
   * A `new Redis(...)` at module scope throws when the env vars are absent --
   * which is `npm test`, `npm run dev` without an account, and every script. It
   * would also make `redisConfigured()` unreachable, since the throw happens on
   * import. Same discipline as `src/lib/db/client.ts`'s lazy singleton.
   */
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  const mod = await import('./redis');
  expect(mod.redisConfigured()).toBe(false);
});
```

Write `src/lib/ratelimit/redis.ts`:

```ts
/**
 * The ONLY file in this repository that names Upstash.
 *
 * Lazy, like `src/lib/db/client.ts`, and for the same reason: a client built at
 * module scope throws on import when the env is absent, which is `npm test`,
 * `npm run dev` without an account, and every script under `scripts/`.
 *
 * **ONE `Ratelimit` PER (max, window) PAIR, AND THE PREFIX CARRIES BOTH.**
 * `hit()` takes max and window per call, and `@upstash/ratelimit` binds them at
 * construction. Without the numbers in the prefix, `hit(k, now, 30, HOUR)` and
 * `hit(k, now, 5, HOUR)` would share a counter -- which is the same class of
 * bug the namespacing in `index.ts` fixes, one layer down.
 *
 * `analytics: false`: Upstash's own analytics writes a second sorted set per
 * call. We have `events` and query 9; paying twice for the same fact out of a
 * command budget we are already reasoning carefully about is not worth it.
 *
 * `ephemeralCache` IS THE FLOOD ABSORBER AND IS NOT AN OPTIMISATION. Once an
 * identifier is blocked it is rejected from this Map with ZERO Redis commands
 * until its reset. Without it, an attack scales the limiter's own command
 * consumption linearly with the attack -- "a limiter that runs out of its own
 * quota is worse than no limiter", exactly.
 *
 * **THE `timeout` OPTION IS DELIBERATELY UNSET.** On expiry it returns
 * `success: true` -- fail-open to UNLIMITED. `index.ts` races it instead and
 * falls back to per-instance memory. See its header.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { RateLimitBackend, RateLimitResult } from './types';

export function redisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

let client: Redis | null = null;
const ephemeralCache = new Map<string, number>();
const limiters = new Map<string, Ratelimit>();

function redis(): Redis {
  client ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  return client;
}

function limiterFor(max: number, windowMs: number): Ratelimit {
  const seconds = Math.max(1, Math.ceil(windowMs / 1000));
  const id = `${max}:${seconds}`;
  let l = limiters.get(id);
  if (!l) {
    l = new Ratelimit({
      redis: redis(),
      limiter: Ratelimit.slidingWindow(max, `${seconds} s`),
      prefix: `jmt:rl:${id}`,
      analytics: false,
      ephemeralCache,
    });
    limiters.set(id, l);
  }
  return l;
}

/** `reset` is a unix ms timestamp. Never zero seconds -- that is a retry loop. */
function toResult(r: { success: boolean; remaining: number; reset: number }): RateLimitResult {
  if (r.success) return { ok: true, remaining: r.remaining };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)) };
}

export function redisBackend(): RateLimitBackend {
  return {
    name: 'redis',
    async consume(key, max, windowMs) {
      // `now` is IGNORED: Redis uses its own clock, deliberately. See types.ts.
      return toResult(await limiterFor(max, windowMs).limit(key));
    },
    async peek(key, max, windowMs) {
      const r = await limiterFor(max, windowMs).getRemaining(key);
      return r.remaining > 0
        ? { ok: true, remaining: r.remaining }
        : { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)) };
    },
  };
}

/** Test seam: drop the memoised client and limiters between env stubs. */
export function _resetRedis() {
  client = null;
  limiters.clear();
  ephemeralCache.clear();
}
```

`VERIFY` fact (10) here: if `slidingWindow`'s duration format is rejected, fix
this one line. And confirm `getRemaining` exists and returns `{ remaining,
reset }` in the installed version; if it does not, `peek` becomes a raw
`redis().get()` of the window key and the plan should say so.

```sh
npm test -- ratelimit && npm run typecheck && npm run build
git commit -am "V9: the Upstash backend, lazily constructed"
```

---

### Task 10 — Backend selection

**Test first**: with `UPSTASH_*` set, an `events:` key uses memory and a `read:`
key uses redis; with `RATELIMIT_BACKEND=memory`, everything uses memory. Assert
via `_setBackend` spies or by observing that the fake redis backend was called.

Wire `backendFor()` and `MEMORY_ONLY` per §4.

```sh
npm test -- ratelimit && npm run typecheck
git commit -am "V9: choose the backend per key, and the events exception"
```

---

### Task 11 — **The fallback.** The most important test in this workstream.

**Test first**, all three:

```ts
it('falls back to the in-memory limiter when Redis REJECTS', async () => {
  _setBackend({ name: 'redis', consume: () => Promise.reject(new Error('boom')), peek: … });
  const r = await hit('u', Date.now(), 2, 60_000);
  expect(r.ok).toBe(true);                 // NOT refused
  await hit('u', Date.now(), 2, 60_000);
  expect((await hit('u', Date.now(), 2, 60_000)).ok).toBe(false);  // AND STILL LIMITED
});

it('falls back when Redis HANGS, inside RATELIMIT_TIMEOUT_MS', async () => {
  vi.useFakeTimers();
  _setBackend({ name: 'redis', consume: () => new Promise(() => {}), peek: … });
  const p = hit('u');
  await vi.advanceTimersByTimeAsync(1001);
  expect((await p).ok).toBe(true);
});

it('NEVER fails open to unlimited', async () => {
  /*
   * The line this whole workstream turns on. Fail-closed makes an Upstash
   * outage a JMTarot outage on a tier with no SLA; fail-open-to-nothing makes
   * the limiter decorative exactly when something is already wrong. The third
   * answer -- fall back to what v0.2.0 shipped -- is never worse than the
   * status quo ante at any moment. If this test is deleted, so is the argument.
   */
  _setBackend({ name: 'redis', consume: () => Promise.reject(new Error('boom')), peek: … });
  for (let i = 0; i < 30; i++) await hit('u');
  expect((await hit('u')).ok).toBe(false);
});
```

The second assertion of the first test is the one that matters: it is easy to
write a fallback that returns `{ ok: true, remaining: max }` and calls it a day.

```sh
npm test -- ratelimit
git commit -am "V9: Redis failures fall back to memory, never to unlimited"
```

---

### Task 12 — `ratelimit.backend_degraded`

Add the name and prop shape to `src/lib/analytics/events.ts` (see `## Event
deltas` for the exact text and placement).

**Test first**: one degraded call fires one event; a hundred in the same minute
fire one; the props contain the key **prefix** and never the key.

```ts
it('never puts the key in the event -- it is a users.id or an IP', async () => {
  // Same rule as flush.ts and the moderation path. `events` rows survive
  // account erasure with user_id nulled; a raw key would undo that.
  … expect(props.surface).toBe('read');
});
```

```sh
npm test -- ratelimit && npm run typecheck
git commit -am "V9: a degraded limiter is loud, once a minute"
```

---

### Task 13 — `meter.ts`

**Test first.** `src/lib/llm/meter.test.ts`:

- `dayKey` is UTC and rolls at UTC midnight, not at Jakarta midnight. Include a
  case at `2026-07-27T18:00:00Z` (= 01:00 on the 28th in Jakarta) asserting the
  key is still `2026-07-27` — **that assertion is the guard against somebody
  "fixing" this to `local_date`**, and its comment must say so.
- `secondsToReset` is never zero.
- Under the soft ceiling: both classes reserve.
- Between soft and hard: `interactive` reserves, `deferred` does not.
- At hard: neither.
- **A refused `deferred` reservation does not consume a slot.** Peek, then
  refuse, then assert the counter did not move.

Implement §5.

```sh
npm test -- meter && npm run typecheck
git commit -am "V9: a global model-call ceiling per UTC day, in two tiers"
```

---

### Task 14 — `callClass` on `LLMCallOpts`, and the `complete()` decorator

Add to `src/lib/llm/types.ts`:

```ts
  /**
   * Which half of the daily ceiling this call draws on (`meter.ts`).
   *
   * DEFAULT IS `interactive` AND THAT IS THE SAFE DEFAULT: a new call site that
   * forgets to say is treated as something a person is waiting for, so the
   * failure of omission is "shed too late", never "shed a reading early".
   *
   * THE RULE: if a user is watching a spinner for these bytes, it is
   * interactive. Everything that happens in `after()`, or whose absence is a
   * cache miss nobody can name, is deferred -- and deferred is shed FIRST, so
   * that a quota running low costs a slightly less specific reading rather than
   * a 429.
   */
  callClass?: CallClass;
```

Wrap `complete()` in `getProvider()`. **Include the paragraph from §5 explaining
why `streamReading` is not wrapped** — the `usage`-must-always-settle contract —
directly above the decorator, or somebody will "finish the job".

**Test**: `complete()` throws `ModelCeilingError` at the ceiling and does not
reach the provider (assert with a fake provider that records calls).

```sh
npm test && npm run typecheck && npm run build
git commit -am "V9: meter every complete() call through the provider"
```

---

### Task 15 — `/api/reading` reserves, and the fourth 429

In the existing three-budget block:

```ts
    /*
     * FOUR BUDGETS NOW (V9), and they still answer with the same copy on
     * purpose: telling the querent WHICH ceiling they hit tells a prober which
     * one to work around. The EVENT distinguishes them -- see `limit` below --
     * because that is server-side and a prober cannot read it.
     *
     *   hit()               one person holding the button down.
     *   refusalsExhausted() somebody mapping the blocklist (W7-D13). A READ.
     *   hitGlobal()         a crowd. Now fleet-wide rather than per-instance.
     *   reserveModelCall()  THE DAY'S QUOTA. **This is the one that replaces
     *                       the z.ai spend cap, which does not exist on a
     *                       subscription plan.** Last, and it RECORDS.
     */
```

`tooManyRequests` gains a `limit` argument, threaded into
`reading.rate_limited`'s new prop. `retry-after` for the ceiling is
`secondsToReset()` — potentially hours, which is correct and is the honest
answer.

**Test**: four separate cases, each asserting a 429 and the right `limit` prop.

```sh
npm test && npm run typecheck && npm run build
git commit -am "V9: the reading path reserves against the daily ceiling"
```

---

### Task 16 — Mark the deferred call sites

`callClass: 'deferred'` on: `src/lib/memory/gist.generate.ts`, the day-summary
generation, the frequency-verdict generation, and **`scheduleLotusRefresh`'s
speculative path only** — `generateLotus` called from an onboarding write is
interactive, because a user just pressed a button.

> **DO NOT MARK THE MODERATION CLASSIFIER DEFERRED.** It is a network call that
> gates a reading a person is waiting for, and shedding it at the soft ceiling
> would silently move the app into blocklist-only moderation for the busy half of
> every day — which is `MODERATION_CLASSIFIER_ENABLED=0`, arrived at by accident,
> with nothing saying so. It is `interactive` and it is shed only at the hard
> ceiling, by which point readings are being refused anyway.

**Test**: a table-driven assertion listing every `complete()` call site in
`src/**` and its expected class, in the `clientBoundary.test.ts` idiom — a grep
over the source, so a *new* unmarked call site is a visible default rather than
an invisible one.

```sh
npm test && npm run typecheck
git commit -am "V9: shed deferred model calls first"
```

---

### Task 17 — Retune the fleet-wide numbers

`RATELIMIT_GLOBAL_HOURLY` 1200, `share:view:_global` 10000 (a constant V7 will
read; leave it in this plan's `## Interfaces I export` so V7 picks it up rather
than inventing 3000 again).

```sh
npm test && npm run typecheck
git commit -am "V9: fleet-wide numbers -- 400/instance was never 400"
```

---

### Task 18 — Env, `.env.example`, the tripwire

Add §8's block to `.env.example`. Add `UPSTASH_REDIS_REST_TOKEN` and
`UPSTASH_REDIS_REST_URL` to `SECRET_ENV` in `scripts/audit-secrets.ts`.

**Test first** — `scripts/audit-secrets.ts` has no test file; add the assertion
to `src/lib/headers.test.ts`'s neighbours instead, as a source-level check in the
`legal.test.ts` idiom:

```ts
it('every credential env var this app reads is in the tripwire list', () => {
  // SECRET_ENV is hand-maintained, and a credential missing from it is a
  // credential the audit does not scan the client bundle for. The failure is
  // silent and the tripwire still says `clean`.
  const audit = readFileSync('scripts/audit-secrets.ts', 'utf8');
  for (const name of ['UPSTASH_REDIS_REST_TOKEN', 'UPSTASH_REDIS_REST_URL']) {
    expect(audit).toContain(`'${name}'`);
  }
});
```

```sh
npm test && npm run build      # build runs audit:secrets
git commit -am "V9: env vars, .env.example, and the secrets tripwire"
```

---

### Task 19 — Integration: a real REST-protocol Redis, offline

Add to `docker-compose.yml`:

```yaml
  redis:
    image: redis:7-alpine
    ports: ['127.0.0.1:6379:6379']
  srh:
    # serverless-redis-http speaks Upstash's REST protocol against a real
    # Redis, so the integration suite exercises the ACTUAL Lua sliding window
    # rather than a mock of it -- and needs no Upstash account and no network
    # beyond the one-time image pull, same as postgres:16.
    image: hiett/serverless-redis-http:latest
    ports: ['127.0.0.1:8079:80']
    environment:
      SRH_MODE: env
      SRH_TOKEN: jmtarot-test-token
      SRH_CONNECTION_STRING: redis://redis:6379
    depends_on: [redis]
```

`.env.local` / CI:

```
TEST_UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079
TEST_UPSTASH_REDIS_REST_TOKEN=jmtarot-test-token
```

`src/lib/ratelimit/redis.integration.test.ts`, **skipped when the var is
absent** so `npm run test:integration` still passes for somebody who only ran
`db:up` on an older compose file:

```ts
const url = process.env.TEST_UPSTASH_REDIS_REST_URL;
describe.skipIf(!url)('the redis backend, against a real REST server', () => {
  // Unique key prefix per test; there is no transaction to roll back here,
  // which is the one place this suite differs from the Postgres one.
  it('allows up to the limit and then rejects', …);
  it('two "instances" share one counter -- THE WHOLE POINT OF V9', …);
  it('peek does not consume', …);
  it('reports a retry-after that is never zero', …);
});
```

> **`VERIFY` at this task: does SRH implement `EVAL` well enough for
> `@upstash/ratelimit`'s Lua script?** If not, delete the two services and gate
> the suite on a real Upstash *development* database instead, with the
> credentials in `.env.local` and a line in `DEPLOY-VERCEL.md` saying they exist.
> **Do not fake it with a mock and call the suite an integration test** — the
> only thing worth testing here is the atomic behaviour of the real script.

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run db:up && npm run test:integration
git commit -am "V9: integration tests against a real REST-protocol Redis"
```

---

### Task 20 — The doc amendments

Apply `## Doc amendments` verbatim: `src/lib/ratelimit/index.ts`'s header
(already written in Task 3), `docs/DEPLOY-VERCEL.md` §2b and §5, and the
`CLAUDE.md` lines. **One commit, so the correction is readable as one thing.**

```sh
git commit -am "V9: the z.ai spend cap does not exist; correct three documents"
```

---

### Task 21 — Query 9

Add to `docs/analytics-queries.md`, and **execute it** (the file's own standard
is "eight queries, all of them executed"):

```sql
-- 9. Is either global control firing, and is the limiter degraded?
--
-- THE ONLY WAY ANYBODY FINDS OUT. There is no billing alert any more, because
-- there is no bill: LLM_API_KEY is a subscription. A quota running out looks
-- like readings failing, with nothing in any dashboard, so these two names are
-- the whole early-warning system.
select
  date_trunc('hour', created_at)                              as hour,
  count(*) filter (where name = 'llm.ceiling_reached'
                     and props->>'tier' = 'soft')             as soft,
  count(*) filter (where name = 'llm.ceiling_reached'
                     and props->>'tier' = 'hard')             as hard,
  count(*) filter (where name = 'ratelimit.backend_degraded') as degraded_minutes,
  count(*) filter (where name = 'reading.rate_limited')       as rate_limited
from events
where created_at > now() - interval '7 days'
  and name in ('llm.ceiling_reached', 'ratelimit.backend_degraded', 'reading.rate_limited')
group by 1
order by 1 desc;
```

> **`degraded_minutes` IS A COUNT OF MINUTES, NOT OF REQUESTS**, because the
> event is throttled to one per instance per minute (and the instance count is
> unknown, so it is a lower bound on instances-times-minutes). **A steady
> non-zero value here means the fleet-wide limiter is not fleet-wide** and
> everything else on this page is measuring per-instance windows.

```sh
git commit -am "V9: query 9 -- the ceiling and the degraded limiter"
```

---

### Task 22 — Verify the whole thing

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
node -v                       # must be 24.x
npm run typecheck
npm test                      # unit only; must still need no Docker, no network
npm run db:up && npm run test:all
npm run build                 # DO NOT SKIP -- and it runs audit:secrets
npm run audit:secrets
npm run smoke                 # one live call; the meter must not break it
```

Then the three checks that are not automatable and take a minute each:

1. **Pull the Upstash credentials and watch it degrade.** Comment out
   `UPSTASH_REDIS_REST_URL` in `.env.local`, restart `npm run dev`, take a
   reading. It must complete normally, with `[ratelimit] redis …` in the log at
   most once a minute. **This is the V9 equivalent of W4's "stop the database and
   take a reading", and it is the requirement this workstream exists to satisfy.**
2. **Point at a bad token.** Same result, different `reason` in the event.
3. **Trip the ceiling.** `LLM_DAILY_CALL_CEILING=1 npm run dev`, take two
   readings. The second is a 429 with the ordinary rate-limit copy, a
   `retry-after` measured in hours, and `reading.rate_limited` with
   `limit: 'daily'`.

```sh
git commit --allow-empty -m "V9: verified -- degraded limiter, bad token, tripped ceiling"
```

---

## Schema deltas

**None.** V9 chose Upstash over a Postgres counter (§2.2), so `schema.ts` is
untouched, no migration is generated, and W1 remains the file's single owner.

The one place V9 comes near the database is `src/lib/db/testing/harness.ts`'s
`resetDb()` TRUNCATE list, and it does not touch that either — the list is
deliberately exhaustive so a forgotten table shows up as leaked state, and V9
adds no table.

---

## Event deltas

**The taxonomy is 44 in v0.2.0 and reconciliation §4 fixes v0.3.0 at 59. V9
makes it 61.** Reconciliation must update the count; the two names are below
with the argument for each, because "a limiter that trips silently is a limiter
nobody tunes" cuts both ways and a taxonomy that grows by habit is worse than
one that grows by need.

### Two new names

```ts
  // — limits and quota (V9) —
  'ratelimit.backend_degraded',
  'llm.ceiling_reached',
```

```ts
  /*
   * The distributed limiter fell back to per-instance memory. **WITHOUT THIS
   * EVENT THE FALL-BACK IS INVISIBLE**, and the whole of V9 silently reverts to
   * v0.2.0's behaviour for as long as the outage lasts -- which could be weeks,
   * because nothing else about the app changes when it happens.
   *
   * THROTTLED TO ONE PER INSTANCE PER MINUTE. An Upstash outage degrades every
   * request, and one row per request would push the analytics path into exactly
   * the load W4 built `after()` to keep off it. `surface` is the key PREFIX and
   * never the key: the rest of it is a `users.id` or an IP, and `events` rows
   * survive account erasure with `user_id` nulled.
   */
  'ratelimit.backend_degraded': { backend: 'redis'; reason: 'timeout' | 'error'; surface: string };

  /*
   * The global daily ceiling refused a model call. **THIS IS THE REPLACEMENT
   * FOR A BILLING ALERT, AND THERE IS NO OTHER ONE.** `LLM_API_KEY` is a fixed
   * subscription, so abuse produces an exhausted quota rather than an invoice,
   * and an exhausted quota is invisible until a querent's reading fails.
   *
   * `tier: 'soft'` means deferred work is being shed and nobody has noticed
   * anything -- it is the warning. `tier: 'hard'` means readings are being
   * refused -- it is the outage. Query 9.
   */
  'llm.ceiling_reached': { tier: 'soft' | 'hard'; call_class: 'interactive' | 'deferred';
                           used: number; ceiling: number };
```

Both satisfy the five rules in `events.ts`'s header: no free text (`surface` is a
prefix from a closed set of eight), no unbounded cardinality, no ids that are not
ids, one event with props rather than five events, and no optional props.

### One prop addition to an existing name

`reading.rate_limited` gains `limit: 'user' | 'refusal' | 'global' | 'daily'`.

**Not a new name and not a widening of what is collected about a person.** The
route deliberately answers all four ceilings with identical copy, because telling
the querent which one they hit tells a prober which one to work around. **The
event is server-side and a prober cannot read it**, so there is no reason for the
data to be as coy as the response — and without it, `reading.rate_limited` in
query 9 cannot distinguish "one user is hammering" from "the day's quota is
gone", which are the two most different things it can mean.

---

## Doc amendments

Three documents are factually wrong. Exact replacement text follows.

### 1. `src/lib/ratelimit.ts`'s header

Written out in full in §4 as `src/lib/ratelimit/index.ts`'s new header. The two
paragraphs being **deleted** are:

> **THE PRIMARY CONTROL IS NOT IN THIS FILE AND IS NOT CODE: a hard spend cap
> set in the z.ai dashboard.** Nothing in this repo can bound the bill; a
> provider-side cap can, absolutely. `docs/DEPLOY-VERCEL.md` lists it as a
> required deployment step.
>
> **THE UPGRADE TRIGGER IS AN EVENT, NOT A NUMBER.** Swap `hit()`'s body for
> `@upstash/ratelimit` on Redis **the day a link to the app is posted anywhere
> public** — not at a user count, not at a bill threshold. […]

The first is false. The second has **fired and been acted on**, and the new
header should record that it fired rather than deleting it silently — a future
session finding no trace of the trigger will wonder whether it was ever taken
seriously.

`memory.ts` keeps the three-failure-modes analysis, which is still exactly right
and is the best statement of the problem in the repository.

### 2. `docs/DEPLOY-VERCEL.md` §2b — **replaced wholesale (Branch A)**

```markdown
## 2b. There is no spend cap, and the controls that replace it — REQUIRED

**THIS SECTION USED TO SAY "Set a hard spend cap at z.ai — REQUIRED".** It was
written on the assumption that `LLM_API_KEY` was a pay-as-you-go wallet. **It is
not: it is a fixed annual subscription sold for coding.** A subscription is a
prepaid quota, so there is no monthly bill to cap, and — verified 2026-07-… —
[no such setting exists on this plan / a cap exists only over the pay-as-you-go
overflow, see below]. The instruction was impossible to follow and nobody
followed it, which is worth knowing before you go looking for a step that was
skipped.

**The risk did not go away; it changed shape, and the new shape is worse.**
Abuse does not produce an invoice — it produces an exhausted quota, which is a
denial of service against every user of the app. A bill announces itself. A
quota that runs flat at 4pm on a Tuesday announces itself as readings that fail,
for everybody, with nothing in any dashboard. **There is no alert to miss,
because there is no alert.**

And it takes the whole product, not one feature: `LLM_API_KEY` is the single
backbone for readings, the moderation classifier, gists, day summaries, frequency
verdicts, the Lotus distillation, translations and the persona.

### The three controls that replace it, all of them code

1. **`src/lib/ratelimit/` is fleet-wide.** As of V9 it is Upstash Redis over
   HTTP, so a limit of 30 readings an hour is 30 and not "30 times however many
   instances Vercel has warm". Set `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` in §2 — **without them the app still works and the
   limiter silently reverts to per-instance memory**, which is v0.2.0's
   behaviour and is not what you want in production.
2. **`LLM_DAILY_CALL_CEILING` bounds the day.** It counts model *calls*, not
   readings: one visit can be six. Two tiers — below `LLM_DAILY_CALL_SOFT`
   everything runs; above it, deferred work (gists, summaries, verdicts) is shed
   and nobody notices; above the hard ceiling, readings get a 429.
   **The shipped default of 4000 is a guess.** Derive a real one from the
   subscription's actual quota, divide by a safety factor, set it in the
   dashboard, and **put the derivation in the commit message** — the next person
   needs to know what was chosen and why, not merely whether anything was.
3. **Query 9 in `docs/analytics-queries.md` is how you find out.** Two event
   names, `llm.ceiling_reached` and `ratelimit.backend_degraded`. Run it weekly.
   `tier: 'soft'` appearing is the warning; `tier: 'hard'` is the outage; a
   steady `degraded_minutes` means the limiter is not actually fleet-wide.

### What is still not enforceable from here

**Nothing in this repository can stop the key being revoked**, and a subscription
sold for coding, powering a public consumer product, is a plausible reason for
that to happen. `LLM_PROVIDER` already has an `anthropic` branch and one adapter
serves both; a second funded key is the only mitigation that exists, and it does
not exist yet.

`MODERATION_MODEL=glm-4.5-flash` is roughly six times cheaper per classification
than the reading model, **but that is a side effect and not the reason.** It is
in §2's required list because on the reading model the classifier's p95 exceeds
the reading's own p50 TTFT and the gate becomes the latency. Do not reason about
it as a quota lever, or the first person optimising for quality will move it back.

**The rate limiter's upgrade trigger fired and was acted on.** It said "swap
`hit()`'s body for `@upstash/ratelimit` on Redis the day a link to the app is
posted anywhere public". V7 is that day by construction, and V9 did the swap
before V7 shipped.
```

**Branch B variant:** keep the four numbered steps of the old §2b under a
heading of *"If your account carries a pay-as-you-go balance as well, cap
that too"*, and place it **after** the three controls above, not before —
because on a subscription the quota empties long before the overflow costs
money, so the cap protects the wallet and the ceiling protects the users, and
only one of those two is the failure that reaches a person.

### 3. `docs/DEPLOY-VERCEL.md` §5 — first bullet, replaced

```markdown
- **The provider controls are in §2b, and they are not a spend cap.** That
  bullet used to say "Set a spend cap at your LLM provider. The app's rate
  limiter is in-memory, so serverless cold starts reset it." Both halves are now
  wrong: the plan has no spend cap to set, and the limiter is Upstash-backed and
  fleet-wide as of V9. What survives is the habit — check query 9 weekly.
```

### 4. `CLAUDE.md`

**In `## Trust, safety and secrets (W7)` → "Still open":** replace

> - **A hard spend cap at z.ai is a required deployment step** and nothing in
>   this repo can enforce it. `docs/DEPLOY-VERCEL.md` §2b.

with

> - **THERE IS NO HARD SPEND CAP AT Z.AI AND THERE WAS NEVER GOING TO BE.**
>   `LLM_API_KEY` is a fixed annual subscription sold for coding, not a wallet, so
>   there is no bill to cap. V9 replaced it: a fleet-wide Upstash limiter, a
>   global daily ceiling on model calls (`LLM_DAILY_CALL_CEILING`), and query 9.
>   `docs/DEPLOY-VERCEL.md` §2b is rewritten. **The risk is now quota exhaustion,
>   which is a denial of service against the querent and has no billing alert
>   attached** — see `docs/plans/2026-07-27-ratelimit.md` §0.

**In `## Environment variables`,** after the `ANALYTICS_*` block:

```
UPSTASH_REDIS_REST_URL=       # V9. Both or neither. WITHOUT THEM THE LIMITER
UPSTASH_REDIS_REST_TOKEN=     # SILENTLY REVERTS to per-instance memory --
                              # which is fine locally and is not fine in prod.
RATELIMIT_BACKEND=            # `memory` forces local. The 2am kill switch.
                              # ONLY that exact string does anything -- the
                              # OPPOSITE defaulting rule to ANALYTICS_ENABLED,
                              # on purpose: a typo must not disable enforcement.
LLM_DAILY_CALL_CEILING=4000   # MODEL CALLS per UTC day, not readings. THIS IS
                              # WHAT REPLACED THE SPEND CAP. The default is a
                              # guess; derive it from the subscription's quota.
LLM_DAILY_CALL_SOFT=          # defaults to 70%. Above it, DEFERRED work is shed.
```

**In `## Current state`,** append to the "Built and working end to end" list:
`**a fleet-wide rate limiter and a global daily model-call ceiling (V9)**`.

**New trap in `## Traps` → "These will bite you":**

```
- **The rate limiter's fallback is silent to the user and loud only in one
  event.** When Upstash is unreachable every budget falls back to per-instance
  memory — never to unlimited, never to a refusal — so the app looks completely
  healthy while every stated limit is quietly multiplied by the number of warm
  instances. `ratelimit.backend_degraded` and query 9 are the only way to see it.
  A steady non-zero `degraded_minutes` means the fleet-wide limiter is not
  fleet-wide.

- **`llm:day:` is UTC and that is the ONE date in this app that is deliberately
  not the querent's.** Everything else — `local_date`, `todayKey()`, the `string`
  column type, an integration test that fails if anyone "fixes" it — is the
  querent's calendar day. A provider quota is not: two people in two zones would
  disagree about which bucket to increment and the counter would be double-counted
  across a six-hour band every day. `meter.test.ts` pins a case at 18:00 UTC
  (01:00 in Jakarta) for exactly this reason.
```

---

## Interfaces I export

For V7, which is the only workstream downstream of this one.

```ts
// @/lib/ratelimit  -- SAME PATH, SAME NAMES, SAME ARGUMENT ORDER. NOW ASYNC.
export function hit(key: string, now?: number, max?: number, windowMs?: number): Promise<RateLimitResult>;
export function hitGlobal(now?: number, max?: number, windowMs?: number): Promise<RateLimitResult>;
export function hitRefusal(key: string, now?: number, max?: number, windowMs?: number): Promise<RateLimitResult>;
export function refusalsExhausted(key: string, now?: number, max?: number, windowMs?: number):
  Promise<{ ok: false; retryAfterSeconds: number } | null>;
export function peek(key: string, max: number, windowMs?: number, now?: number): Promise<RateLimitResult>;
export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

// @/lib/ratelimit/clientIp
/** NEVER the leftmost x-forwarded-for entry. Takes Headers, so a page and a
 *  route handler call it identically. IPv6 is keyed by /64. */
export function clientIp(h: Headers): string;

// @/lib/llm/meter
export type CallClass = 'interactive' | 'deferred';
export class ModelCeilingError extends Error { readonly tier: 'soft' | 'hard' }
export function reserveModelCall(cls: CallClass, now?: number): Promise<Reservation>;
export function secondsToReset(now?: number): number;

// @/lib/llm/types -- additive
export type LLMCallOpts = { …; callClass?: CallClass };
```

**Four notes for V7 specifically:**

1. **Your four `hit()` calls need an `await` and nothing else.** §4.4's key
   strings, maxes and windows are unchanged.
2. **`share:view:<ip>` stays at 120** — your §2.2 slug arithmetic is untouched,
   and V9 is what makes it true rather than aspirational. See §7.
3. **`share:view:_global` is 10000, not 3000.** 3000 was per-instance; fleet-wide
   3000 would 429 a genuinely popular link, which reads to a stranger as "your
   friend sent you a broken link". It is a database-read guard, not a quota guard
   — your §5.5 establishes that `/s/[slug]` makes no model call at all.
4. **Delete §4.4's caveat paragraph**, the one quoting the in-memory header
   verbatim, and **close your open question 8**. Replace with: *"Fleet-wide via
   Upstash as of V9, which landed first for this reason. On an Upstash outage
   these budgets degrade to per-instance memory — never to unlimited."*

---

## Open questions

### 1. The terms-of-service risk on `LLM_API_KEY`

**Stated once, as a fact with a consequence.** The z.ai key is a subscription
sold for **coding**. JMTarot is a public consumer product, and that key is the
single backbone for readings, moderation, gists, day summaries, frequency
verdicts, translations and the persona. If that use falls outside the plan's
intended scope, the consequence is not a warning and not an overage charge — it
is **key revocation, which takes the entire application down at once**, with no
second provider configured and no fallback prose anywhere except the Lotus
template.

Two things follow, neither of which V9 can do:

- **Read the plan's acceptable-use terms** and record the answer (Task 0, fact 5).
- **If the answer is unfavourable or unclear, fund a second provider before V7
  ships**, not after. `LLM_PROVIDER` already has an `anthropic` branch and the
  same adapter serves both, so the code cost is an env var. The cost of
  discovering this the hard way is the app, on the day a link is first posted
  publicly.

### 2. `LLM_DAILY_CALL_CEILING`'s real value

4000 is a tripwire, not a budget. It needs the subscription's actual quota, in
the unit the subscription actually meters (prompts per 5 hours? tokens per
month? concurrent requests?). **If the quota is a rolling 5-hour window rather
than a daily one, `meter.ts`'s UTC-day bucket is the wrong shape** and should
become a rolling window with the same two tiers — a two-line change while
nothing depends on the shape, and a migration of a live counter afterwards.

### 3. There is no alerting, and V9 does not build any

Query 9 is a query somebody has to run. The cron log line is a log line nobody
reads. **Nothing pages anybody.** That is honest for a project with no
observability stack, and it is a real gap the day the hard ceiling first trips.
The cheapest real fix is probably a webhook from the existing daily cron into
whatever Miftah already looks at; it is a decision about tooling, not code, and
it is not V9's to make.

### 4. The Upstash free tier may not be enough, and the answer is not "upgrade"

If Task 0's fact (6) shows the command budget is tight, the levers in order of
preference are: keep `events:` on memory (already the default), lengthen
`ephemeralCache`'s reach, and **move `session-update:` to memory too** — it is a
throttle on a database read, not on a model call, and 20/hour per instance is
already ample. Only then consider paying. **Do not answer a tight budget by
disabling limiters**; answer it by moving the cheap ones back to memory, which
is the same trade §2.1 already makes for `/api/events`.

### 5. Whether `hitGlobal` should exist at all now

The daily ceiling does what `hitGlobal()` was invented for — bounding N throwaway
accounts — and does it better, because it counts model calls rather than
requests. `hitGlobal` survives as a *burst* guard at 1200/h, which is a different
job. It may turn out to be redundant once there is a week of query 9 data. Worth
deciding on evidence rather than now; deleting it is a one-line change and it
keeps the interface honest until then.

### 6. `RATELIMIT_EVENTS_BACKEND` defaults to memory, and that is a judgement

§2.1 argues it: `/api/events` is the highest-volume, lowest-value budget, and
letting it dominate the limiter's own command budget is the failure mode the
limiter exists to prevent. But it is also **the app's only public write
endpoint**, and V7 is about to make the app much more publicly visible. If the
first thing that happens after a link is posted is somebody firehosing
`/api/events`, the answer is one env var — but somebody should decide the
threshold at which they would flip it *before* the night it is needed, which is
the same request V7's own open question 5 makes about `SHARE_RESOLVE_CACHE_MS`.
