# Deploying JMTarot to Vercel

Enough to get your own copy running from scratch. Free on Vercel's Hobby plan.

## 1. Import the repo

1. **vercel.com** → Sign Up → **Continue with GitHub**.
2. **Add New… → Project** → find the repo → **Import**. You may need to
   "Adjust GitHub App Permissions" to grant access to it.
3. Framework Preset should auto-detect **Next.js**. Root Directory `./`. Leave
   the build, output and install commands at their defaults.
4. **Set the environment variables before deploying** (next section). A deploy
   without them builds fine and then 500s on every login.

Importing installs a GitHub webhook, and that is the whole CI/CD pipeline —
there is no workflow file to write:

| You do | Vercel does |
|---|---|
| push to `main` | deploys to **Production** |
| push any other branch, or open a PR | builds a **Preview** at its own URL |

### The build command runs the secrets tripwire, and it can fail the deploy

`npm run build` is `next build && npm run audit:secrets`, so a deployment can
fail **after** `Compiled successfully` and after the route table has printed.
That is deliberate — the tripwire's whole job is to stop a leak reaching a
browser — but it means a red build is not necessarily a red *build*. Read past
the route table before assuming Next failed.

**Turn OFF "Automatically expose System Environment Variables"** in Project
Settings → Environment Variables. Nothing in this app reads a `NEXT_PUBLIC_`
variable, and leaving it on makes Vercel duplicate its whole system namespace
under that prefix — `NEXT_PUBLIC_VERCEL_URL`, `..._GIT_COMMIT_MESSAGE`,
`..._PROJECT_ID` and a dozen more — where any code that reads one would inline
it into the client bundle.

**It broke the first production deploy** (`0b4e4a0`, 2026-07-27): nineteen
findings, every one of them `NEXT_PUBLIC_VERCEL_*`, none of them from this repo,
against a build that was clean locally. `audit-secrets.ts` now warns on that
prefix in one line rather than failing on each — the build container is not an
environment this repository provisions, and at least
`NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG` arrives regardless of the
setting. The check that matters is untouched: **Next inlines a `NEXT_PUBLIC_`
value where something READS it, not because it is set**, and the audit still
greps all of `src/**` for that read.

So the setting is defence in depth rather than the fix, which is why it is a
recommendation here and not a prerequisite. A finding that is *not*
`NEXT_PUBLIC_` is a real one — most likely an env value reaching the `.rsc`
payload — and `scripts/audit-secrets.ts`'s header says how to read it.

## 2. Environment variables

Fourteen, all needed, for **Production** *and* **Preview**:

```
LLM_PROVIDER               zai
LLM_BASE_URL               https://api.z.ai/api/anthropic
LLM_MODEL                  glm-4.6
LLM_API_KEY                <your provider token>
AUTH_SECRET                <32+ random bytes, base64>
AUTH_GOOGLE_ID             <client id>.apps.googleusercontent.com
AUTH_GOOGLE_SECRET         <client secret>
AUTH_URL                   per environment -- see below
DATABASE_URL               Neon's POOLED string -- see §6
FIELD_ENCRYPTION_KEY       <32 random bytes, base64url>
MODERATION_MODEL           glm-4.5-flash -- REQUIRED, and it is not a default
CRON_SECRET                <32 random bytes, base64>
UPSTASH_REDIS_REST_URL     https://<name>.upstash.io -- V9, see below
UPSTASH_REDIS_REST_TOKEN   <the REST token from the same page>
```

**THIS LIST HAS NOW BEEN WRONG THREE TIMES, ALWAYS THE SAME WAY: a variable
whose absence breaks nothing loudly.** It said eight until 2026-07-27, then ten,
then twelve; the last two are V9's and were missing on the day V9 merged. Every
omission was a variable the app runs perfectly well without — which is exactly
what makes it easy to omit and pointless to discover later. **When you add a
variable whose absence is silent, it belongs in THIS list, not the optional one.**

**Omitting `DATABASE_URL` and
`FIELD_ENCRYPTION_KEY` was wrong from W2 onward, not from W3.**
`src/lib/auth/auth.ts` imports `db` and the `jwt` callback calls
`upsertUserOnSignIn`, so **Google sign-in itself reads the database** — a
deployment without `DATABASE_URL` 500s on the first login, not on some later
feature. W3 then added the onboarding writes, which is what needs
`FIELD_ENCRYPTION_KEY`.

**The last two are W7's, and this list omitted them until the first real deploy.**
Neither fails loudly, which is exactly why they belong in the required list
rather than the optional one below:

- **`MODERATION_MODEL`** unset falls back to `LLM_MODEL`, and the gate then adds
  its own latency to every reading instead of hiding inside the reading's TTFT.
  Measured, not asserted — §2b and `.env.example` carry the numbers. The app
  works; it just gets slower in a way no error surfaces.
- **`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`** are V9's, and
  **without them the app looks completely healthy while doing none of what V9
  built.** Every budget silently falls back to per-instance memory — v0.2.0's
  behaviour — so a stated limit of 30 readings an hour becomes "30 times however
  many instances Vercel has warm", unknowable and largest under exactly the load
  it exists to catch. **And it takes the model-call ceiling with it:**
  `LLM_WINDOW_CALL_CEILING=280` is enforced through the same limiter, so unset,
  the control that REPLACED the z.ai spend cap (§2b) is also per-instance. There
  is no error, no log line, and nothing on screen. `ratelimit.backend_degraded`
  and query 9 are the only way to see it, and they will show *nothing at all*
  here — an unconfigured limiter is not a degraded one, it simply never tries.

  Create a free database at console.upstash.com; both values are on its page.
  **Pick `ap-southeast-1` (Singapore) — the same region as the functions.**
  *(Corrected 2026-07-29. This said “there is no Singapore region”, verified
  2026-07-27, and it was wrong: production's database is `ap-southeast-1`, Global
  tier, read off the Upstash console. The wrong claim reached five places in this
  repo and justified two decisions, so it is inverted rather than deleted.)* The
  hop is intra-region and its real cost is **unmeasured** — do not repeat the old
  ~80–120ms Tokyo figure as if it applied. The free tier (500K commands/month) is far above this app's
  volume — `/api/events`, the one high-volume caller, is deliberately kept off
  Redis. **Do not escape `$` in the token here**, per the rule below: dashboard
  values are literal, and a mangled token is an *error*, which falls back to
  memory and therefore looks exactly like working.

- **`CRON_SECRET`** is what Vercel Cron presents as `Authorization: Bearer …` on
  the daily call to `/api/cron/sweep` that `vercel.json` registers. Unset, the
  route **503s rather than running unauthenticated** — which is the right
  failure, but it means the retention sweep silently never runs and `/privacy`'s
  thirty-day promise quietly stops being true. Generate with
  `openssl rand -base64 32`.

`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` come from a Google Cloud OAuth client.
**`docs/plans/2026-07-26-google-auth.md` §4 is the assume-nothing walkthrough** —
project, Branding, Audience, the three non-sensitive scopes, and the redirect
URIs — and it is worth following rather than improvising, because the console's UI
was renamed in 2025 and no longer matches the Auth.js docs.

The rest are optional and all have working defaults. Set them when you want a
number other than the default, and remember that `SESSION_TTL_HOURS` is read at
module scope in `config.ts`, so **a dashboard change needs a redeploy** before
middleware sees it:

```
SESSION_TTL_HOURS               24          idle timeout, slides on every request
SESSION_ABSOLUTE_TTL_DAYS       30          hard ceiling, never slides
LOTUS_MODEL                     --          falls back to LLM_MODEL
TRANSLATION_MODEL               --          falls back to LLM_MODEL. V2. Wants the
                                            READING model, not a cheap one: it is
                                            prose a person reads, in a reader's voice
ADMIN_MODEL                     --          falls back to LLM_MODEL. ONE variable for
                                            all three admin model calls: the Insight
                                            button, Auto Format and Terjemahkan
                                            otomatis. Points AWAY from the reading
                                            model on purpose -- nothing here is in a
                                            reader's voice. Production AND Preview
ANALYTICS_STREAM_TIMEOUT_MS     45000       how long after() waits for the stream
ANALYTICS_RETRY_BUDGET_MS       5000        ceiling on the readings-insert retry
MODERATION_TIMEOUT_MS           1500        backstop for a hung classifier, not a target
MODERATION_CLASSIFIER_ENABLED   1           `0` = blocklist only. The 2am kill switch
MODERATION_QUESTION_RETENTION_DAYS  30      before the sweep nulls the stored text
TERMS_VERSION                   2026-07-27  a BUMP FORCES RE-ACCEPTANCE for everyone
EVENTS_RETENTION_DAYS           180         `readings` is deliberately NOT on this clock
LLM_WINDOW_CALL_CEILING         280         model calls per ROLLING 5h. Replaced the spend cap
LLM_WINDOW_CALL_SOFT            196         70% of it; above this, deferred work is shed
RATELIMIT_GLOBAL_HOURLY         1200        the crowd burst guard, fleet-wide
RATELIMIT_TIMEOUT_MS            1000        bounds a hung limiter call, not a target
RATELIMIT_BACKEND               --          `memory` forces local. The 2am kill switch
RATELIMIT_EVENTS_BACKEND        --          `redis` moves /api/events off memory
```

**`LLM_WINDOW_CALL_CEILING`'s default of 280 is correct for the z.ai plan we are
on and is worth setting EXPLICITLY anyway**, because it is the number that
replaced the spend cap and a value visible in the dashboard is one somebody can
reason about at 2am. It is read per call rather than at module scope, so unlike
`SESSION_TTL_HOURS` it takes effect **without a redeploy** — which is the property
you want from a lever you might pull during an incident. Its derivation is the
Pro tier's ~400 prompts per 5 hours × 70%; re-derive it if the plan tier changes,
and re-check `meter.ts`'s weekly arithmetic while you are there.

**`TEST_UPSTASH_REDIS_REST_URL` / `TEST_UPSTASH_REDIS_REST_TOKEN` must NOT be set
in Vercel.** They point at the local `serverless-redis-http` container from
`docker-compose.yml` and exist only so `npm run test:integration` needs no
account.

`.env.example` is the complete list with the reasoning for each, including W5's
three `MEMORY_*` knobs and W6's `LOCALE_SWITCHER`; the ones above are the ones
worth knowing exist before you need them. **Two of those defaults are load-bearing
promises rather than preferences:** `/privacy` states
`MODERATION_QUESTION_RETENTION_DAYS` and `EVENTS_RETENTION_DAYS` as numbers, so
changing either in the dashboard without changing the policy makes the policy a
lie.

**`ANALYTICS_ENABLED` needs no entry: only the literal `'0'` disables writes**,
so a deployment that never mentions it collects data. That default is
deliberate — a typo should over-collect rather than silently collect nothing —
but it does mean you cannot turn analytics off by deleting the variable.

### Three that must be *absent*, not merely falsy

`AUTH_USERS` and `DEV_PASSWORD_LOGIN` are covered below. `LOTUS_STUB` joins
them: `1` skips the model call and writes the deterministic template, so a
production value would give **every** user the fallback with nothing alerting on
it. Like `DEV_PASSWORD_LOGIN` it additionally requires
`NODE_ENV !== 'production'` and is therefore inoperative in any Vercel build —
belt and braces, not a reason to set it. `ANALYTICS_DEBUG` logs every event with
its props and belongs nowhere near production either.

`LLM_PROVIDER` may also be `anthropic`; the same adapter serves both, and you
drop `LLM_BASE_URL` for Anthropic proper.

**`DATABASE_URL` needs the right one of Neon's two endpoints.** See §6.

### Two that must be *removed*, not set

- **`AUTH_USERS`** — delete it from Production and Preview. The password login
  is gone; it is now local-only fuel for `DEV_PASSWORD_LOGIN`.
- **`DEV_PASSWORD_LOGIN`** — leave it unset everywhere. It additionally requires
  `NODE_ENV !== 'production'`, and every Vercel build is production, so setting
  it does nothing except look alarming in an audit.

### `AUTH_URL` is per environment, and it is exact-match

A Google OAuth redirect URI is a string comparison, so this value is not
cosmetic:

| Environment | Value |
|---|---|
| Local | `http://localhost:3001` — 3000 is permanently taken, see CLAUDE.md |
| Preview | the **stable branch alias**, `https://jm-tarot-git-<branch>-<scope>.vercel.app` |
| Production | `https://www.jmtarot.site` — the **`www` host**, never the apex |

**Production is the `www` host and this is not a detail.** The apex
308-redirects to it, so setting `AUTH_URL` to `https://jmtarot.site` produces a
sign-in that looks like it should work: the browser lands on `www` after the
redirect, but the `redirect_uri` Auth.js already sent Google was the apex, and
Google refuses it. See §7.2 of the reconciliation.

**Read the preview alias out of the Vercel dashboard rather than constructing
it.** Branch names containing slashes, or over the length limit, get mangled,
and a constructed guess fails as Google's `redirect_uri_mismatch` — an error page
that does not tell you which URI it wanted. (It is in the `redirect_uri` query
parameter of the URL you were sent to; read it and paste that exact string.)
Worked example, and note that *nothing* about it is guessable — the Vercel
project is `jm-tarot` and the scope is `jmt-arot`:

```
branch  chore/production-db
alias   https://jm-tarot-git-chore-production-db-jmt-arot.vercel.app
```

**A Preview `AUTH_URL` left at the production value is the most likely way to
see `redirect_uri_mismatch`**, because everything else looks configured. Read
the `redirect_uri=` parameter in Google's error page: it names the host the app
actually asked for, which is the one variable that is wrong. And remember that
environment variables are bound to a build — **changing one in the dashboard
does nothing until you redeploy.**

Every one of those hosts, plus `http://localhost:3001`, needs its own
`…/api/auth/callback/google` entry in the Google console's Authorized redirect
URIs. Google caps a client at 100 of them. A throwaway branch therefore cannot
do Google login — that is acceptable, since it can still be screenshotted and
hardware testing happens on a named branch.

`*.vercel.app` **cannot** be a Google Authorized domain: it is a public suffix,
so Search Console will not let anyone verify it. It is fine as a *redirect URI*,
which is why preview sign-in works at all — a preview alias is one label below
the public suffix and so is itself a top private domain. The two fields have
different rules and it is worth not conflating them.

**`jmtarot.site` was bought on 2026-07-27 and solves the Authorized domain
problem** (this paragraph used to say the release was waiting on
`www.jmtarot.com`, which was never purchased). The consent screen nonetheless
stays in **Testing** — ≤100 manually-added test accounts — until Google's
branding requirements are met: an app homepage that is **not** a login page,
plus a privacy policy and terms.

**Two of those three are now done.** W7 shipped `/privacy` and `/terms`, both
public and reachable with no session cookie — `isPublic()` in
`src/lib/auth/gate.ts` is what keeps them that way, and §3 verifies it. This
paragraph used to say they still 404. **What remains is the homepage:** signed
out, `/` redirects to `/login`, so there is nothing else to show a reviewer.

Generate the secret locally:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # AUTH_SECRET
```

`AUTH_SECRET` is the HKDF input for the key that encrypts the session cookie, so
**changing it signs everybody out**. That is also the only global kill switch
this design has: JWT sessions cannot be revoked server-side.

### The `$` trap — it now applies to `.env.local` only

**Values set in the Vercel dashboard are literal. Never escape anything there.**
Values in a `.env` file are not: Next expands `$VAR` when it loads one, so a
`$`-bearing value has to be written `\$` in `.env.local` and plainly in the
dashboard.

Nothing in §2's list contains a `$`, so this trap no longer bites a deployment.
It still bites locally, because `AUTH_USERS` is a JSON array of bcrypt hashes and
a hash contains `$2b$` and `$12$`:

| Where | How to write the hash |
|---|---|
| `.env.local` on your machine | escaped: `\$2b\$12\$...` |
| Vercel | not at all — the variable is deleted from both environments |

The symptom of getting it wrong is a 500 about a malformed `AUTH_USERS` on a hash
that parses perfectly when you read the file yourself. The same trap reaches
`DATABASE_URL`, where a `$` in the password fails auth against a password that is
demonstrably correct.

### Verify a value survived

The dashboard is not proof. Read it back:

```sh
npm i -g vercel
vercel login          # opens a URL to confirm in a browser
vercel link           # connect this folder to the project
vercel env pull /tmp/check.env
grep -E 'AUTH_(SECRET|GOOGLE|URL|USERS)' /tmp/check.env
rm /tmp/check.env
```

`AUTH_USERS` appearing in that output is a finding, not a reassurance — delete it.

## 2b. There is no spend cap, and the controls that replace it — REQUIRED

**THIS SECTION USED TO SAY "Set a hard spend cap at z.ai — REQUIRED".** It was
written on the assumption that `LLM_API_KEY` was a pay-as-you-go wallet. **It is
not: it is a fixed annual subscription sold for coding.** A subscription is a
prepaid quota, so there is no monthly bill to cap, and — verified 2026-07-27
against z.ai's own FAQ — **no such setting exists on this plan**, nor is there a
pay-as-you-go balance to overflow into: when the quota is spent you wait for the
next cycle and *"the system will not deduct from your account balance"*. The
instruction was impossible to follow and nobody followed it, which is worth
knowing before you go looking for a step that was skipped.

**The risk did not go away; it changed shape, and the new shape is worse.**
Abuse does not produce an invoice — it produces an exhausted quota, which is a
denial of service against every user of the app. A bill announces itself. A
quota that runs flat at 4pm on a Tuesday announces itself as readings that fail,
for everybody, with nothing in any dashboard. **There is no alert to miss,
because there is no alert.**

And it takes the whole product, not one feature: `LLM_API_KEY` is the single
backbone for readings, the moderation classifier, gists, day summaries, frequency
verdicts, the Lotus distillation, translations and the persona. One visit can be
six model calls.

### The three controls that replace it, all of them code

1. **`src/lib/ratelimit/` is fleet-wide.** As of V9 it is Upstash Redis over
   HTTP, so a limit of 30 readings an hour is 30 and not "30 times however many
   instances Vercel has warm". Set `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` in §2 — **without them the app still works and the
   limiter silently reverts to per-instance memory**, which is v0.2.0's
   behaviour and is not what you want in production. **Choose the
   `ap-southeast-1` (Singapore) region — the same one the functions run in.**
   *(Corrected 2026-07-29; this said there is no Singapore region and that was
   wrong. See §2.)*
2. **`LLM_WINDOW_CALL_CEILING` bounds the window.** It counts model *calls*, not
   readings, over **a rolling five hours** — which is the shape of the quota it
   protects, because z.ai meters prompts per rolling 5-hour cycle. A calendar-day
   bucket could not do the job: a script burns the whole cycle in five minutes
   while a daily counter still reads 400/4000. Two tiers — below
   `LLM_WINDOW_CALL_SOFT` everything runs; above it, deferred work (gists,
   summaries, verdicts, the speculative Lotus repair) is shed and nobody notices;
   above the hard ceiling, readings get a 429. Its `retry-after` comes from the
   limiter and is anywhere from seconds to the full five hours -- Upstash's
   sliding window reports the start of the next sub-window rather than an exact
   expiry -- so treat it as "not yet" rather than as a countdown.
   **The shipped 280 is derived, not guessed**: the Pro tier's ~400 prompts per
   5h × 70%, with the headroom deliberate because we could not observe what
   exhaustion looks like on the wire without causing it. **If the plan tier ever
   changes, re-derive it and put the derivation in the commit message** — and
   re-check `meter.ts`'s weekly arithmetic, which holds only at Pro.
3. **Query 9 in `docs/analytics-queries.md` is how you find out.** Two event
   names, `llm.ceiling_reached` and `ratelimit.backend_degraded`. Run it weekly.
   `tier: 'soft'` appearing is the warning; `tier: 'hard'` is the outage; a
   steady `degraded_minutes` means the limiter is not actually fleet-wide.

### What is still not enforceable from here

**IF THE KEY DIES, THIS IS THE FAILOVER, AND IT IS FOUR LINES:**

```
LLM_PROVIDER=gemini
LLM_API_KEY=<your Google AI Studio key>
LLM_MODEL=gemini-3.5-flash-lite
MODERATION_MODEL=gemini-3.5-flash-lite
```

No base URL: `gemini` is the OpenAI adapter pointed at Google's
OpenAI-compatible endpoint, and it is a named provider precisely so this path has
nothing to forget.

**USE THE PAID TIER — a privacy requirement, not a quota one.** Google marks
free-tier content as used to improve its products; paid tier is excluded. Every
request carries the querent's typed question, including the ones routed to the
self-harm classifier, so the free tier contradicts `/privacy` directly. The free
limits would be adequate; the terms are not. Enable billing on the project before
you paste the key.

Readings will be **shorter and stream in fewer, larger chunks** than z.ai — ~6
chunks against 173, arriving as whole clauses rather than prose writing itself,
though the whole reading lands in ~1.3s. Two open caveats are in
`docs/provider-comparison.md` §§14–16: that streaming behaviour has not been
judged on a real phone, and Gemini produced one Malay word the `id` grep cannot
catch (`memulakannya` — a morphological leak, not a lexical one).

**THE RUNG BELOW IS `gpt-5.6-luna`, and it takes a FIFTH line:**

```
LLM_PROVIDER=openai
LLM_MODEL=gpt-5.6-luna
MODERATION_MODEL=gpt-5.6-luna
OPENAI_REASONING_EFFORT=none      # NOT OPTIONAL
```

Without the fifth line roughly two readings in nine come back completely blank,
with the stream closing normally so nothing reports it, and the classifier 400s.
The adapter refuses to start rather than let that happen, but set it deliberately
rather than discovering the guard.

**Nothing in this repository can stop the key being revoked**, and this is no
longer hypothetical: z.ai's FAQ says the Coding Plan is *"strictly limited to use
within officially supported tools and products"*, and JMTarot is not one of them.
A public consumer product on a coding subscription is a plausible reason for
revocation, and the consequence is not a warning or an overage charge — it is the
entire application down at once. `LLM_PROVIDER` already has an `anthropic` branch
and one adapter serves both; **a second funded key is the only mitigation that
exists, and it does not exist yet.** Read the plan's acceptable-use terms and
decide before the app is linked anywhere public.

`MODERATION_MODEL=glm-4.5-flash` draws less quota per classification than the
reading model, **but that is a side effect and not the reason.** It is in §2's
required list because on the reading model the classifier's p95 exceeds the
reading's own p50 TTFT and the gate becomes the latency. Do not reason about it
as a quota lever, or the first person optimising for quality will move it back.

**The rate limiter's upgrade trigger fired and was acted on.** It said "swap
`hit()`'s body for `@upstash/ratelimit` on Redis the day a link to the app is
posted anywhere public". V7 is that day by construction, and V9 did the swap
before V7 shipped.

## 2c. Prove the limiter is actually on Redis — REQUIRED after setting §2's last two

**SETTING THE TWO VARIABLES IS NOT ENOUGH, AND THE FAILURE IS SILENT IN BOTH
DIRECTIONS.** The app works identically whether Redis is reached or not. There is
no error, no log line on the request path, and — the trap — **`query 9` shows
nothing either**, because `ratelimit.backend_degraded` fires when Redis FAILS, and
an unconfigured limiter never tries. So "no degradation events" is not evidence.

### First: REDEPLOY. This is the usual reason it does not work.

**Vercel environment variables are bound to a deployment.** Adding them in the
dashboard does not change the deployment already serving traffic. Until you
redeploy — Deployments → ⋯ → Redeploy, or any push — production is still running
with them absent, and every check below will correctly tell you it is on memory.

### Then: the decisive check. Look for our keys in your Upstash database.

Take one reading on `https://www.jmtarot.site`, then ask Upstash directly. Use the
**production** URL and token from §2:

```sh
curl -s "$UPSTASH_REDIS_REST_URL/scan/0/match/jmt:rl:*/count/100" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
```

**Keys that begin `jmt:rl:` are written by nothing but this app.** Their presence
in your production database is proof that production wrote them. Expect:

```
jmt:rl:30:3600:read:<your users.id>     the per-user reading budget
jmt:rl:1200:3600:global                 the crowd burst guard
jmt:rl:280:18000:llm:window             THE MODEL-CALL CEILING
```

The third is the one to care about most: it is the control that replaced the z.ai
spend cap (§2b), and its presence is the proof that the ceiling is fleet-wide
rather than per-instance. `18000` is the rolling five hours; `280` is the budget.

An empty `scan` result after a reading means production is **not** using Redis.
Recheck that you redeployed, then that the token survived paste — a mangled token
is an *error*, and an error falls back to memory, which looks exactly like
working. `vercel env pull` and compare bytes rather than eyeballing the dashboard.

### Passively, from then on: the daily cron says so

`/api/cron/sweep` reports it once a day, because nothing else does:

```
[cron] sweep {"purgedUsers":0,...,"limiter":"redis","ms":412}
```

**`"limiter":"memory"` in a production log line is the alarm.** It is the one
signal that distinguishes "never configured" from "working", and it costs no
extra job, no extra query and no extra endpoint.

### What does NOT prove it

- **The app working normally.** It works either way; that is the entire problem.
- **No `ratelimit.backend_degraded` events.** Silence means "Redis never failed"
  OR "Redis was never contacted", and those are opposite conclusions.
- **Upstash's own usage graph being non-zero**, if you have ever run the
  integration suite or a local `npm run dev` against the same database. Use a
  separate database for production, or trust the key scan instead.

---

## 2d. Shedding features to save quota — the eight kill switches

**THIS IS THE THING TO DO WHEN §2b's RISK ACTUALLY ARRIVES**, and it needs no
deploy, no code change and no database work: eight environment variables in the
Vercel dashboard, each of which stops one feature from reaching a model. Set,
Redeploy, done.

**FIVE BECAME SEVEN IN v0.7.0** (`C-D15`): `CHAT_ENABLED` and
`CHAT_PROACTIVE_ENABLED` joined the list, and **the second one is now the first
thing to reach for.** **AND SEVEN BECAME EIGHT ON 2026-08-30** with R2's profile
memory. See the table below.

§2b's controls are all *automatic* — the limiter, the rolling ceiling, the soft
tier. They protect the quota without anybody watching, and by the time you are
reading this section they have not been enough. These five are the manual lever:
you decide which features are worth their model calls this week.

`src/lib/llm/flags.ts` holds them, `.env.example` carries the full annotation for
each, and `flagCoverage.test.ts` is what stops a future feature from quietly
becoming unswitchable.

### The rule they all share

**ONLY THE EXACT STRING `0` DISABLES.** `ANALYTICS_ENABLED`'s convention, and note
it points the *opposite* way to `RATELIMIT_BACKEND`: there a typo must not disable
enforcement, so only `memory` does anything; here a typo must not silently cost
every querent a feature, so only `0` does. **`false`, `off`, `no`, `FALSE` and an
empty value all leave the feature ON.** If you mean to switch something off, type
a zero and nothing else.

**Unset is also enabled** — the code needs no variable to run a feature. But **all
eight are nevertheless SET TO `1` in Production and Preview** (five as of
2026-07-30, the two chat flags with v0.7.0, the profile memory on 2026-08-30), and
that is deliberate: a kill switch nobody can find is not a kill switch. They are in
the dashboard so that whoever needs one at 2am sees eight named rows and changes a
`1` to a `0`, instead of having to know from a document that eight variables could
have existed.

**So the lifecycle is edit-in-place, never add-and-delete.** Change the `1` to a
`0` to shed a feature; change it back to `1` to restore it. **Do not delete the
rows** — deleting works (unset means enabled) and it would quietly undo the
discoverability they were added for.

**AND A CHANGE TAKES EFFECT ONLY ON THE NEXT DEPLOYMENT.** Vercel injects
environment variables at build time, so setting a `0` does nothing to the lambdas
already running: **Save, then Redeploy.** This is also why setting them all to `1`
did not require a redeploy of its own — `1` and unset behave identically, so there
was nothing to propagate.

### What to reach for, in order

Work down this table. It is ordered by **quota saved per unit of harm**, which is
not the order the features were built in and not the order they appear in
`.env.example`'s file layout.

| # | Variable | Volume | What a querent loses |
|---|----------|--------|----------------------|
| 0 | `CHAT_PROACTIVE_ENABLED=0` | **2–5 calls per unprompted run, up to five times per querent per day, with nobody waiting** | Nothing they asked for. A posted message still gets answered; the readers just stop speaking first. |
| 0a | `PROFILE_MEMORY_ENABLED=0` | **one call per completed chat run whose transcript moved, nobody waiting** | Nothing today. Every fact the room already remembers still reaches every prompt; the readers just stop learning new ones. Nothing backfills, so facts stated during the outage are lost for good unless the querent says them again. |
| 0b | `CHAT_ENABLED=0` | **2–5 calls per posted message** | The room still opens and every past message still renders; the composer is disabled with one line of copy. |
| 1 | `GIST_ENABLED=0` | **one call per reading** | Nothing they can see today. A future reading will not call back to one taken during the outage. |
| 2 | `FREQUENCY_VERDICT_ENABLED=0` | per changed card pair, per window, cached | The line under *"Pilih pembaca yang cocok denganmu"*. Cached lines keep showing. |
| 3 | `DAILY_SUMMARY_ENABLED=0` | per querent, per reader, per day | The second swipe panel on the reader page. Today's, if already generated, keeps showing. |
| 4 | `PERSONA_GENERATION_ENABLED=0` | per `/account` visit past the staleness floor | Their persona paragraph stops updating. The one they have is kept, unchanged. |
| 5 | `LOTUS_GENERATION_ENABLED=0` | per onboarding, per answer edit | **Every reading they take is less personal.** Reach for this last. |

**`CHAT_PROACTIVE_ENABLED` FIRST, AND IT IS THE ONE ROW ABOVE THE FIVE FOR A
REASON.** Proactive runs are the only model calls in this app **with no human
waiting on them** — nobody is watching a spinner, nobody asked, and nothing on any
screen changes when they stop. Every other switch in this table costs a querent
something they can notice. This one costs the readers their initiative, which is
half of what v0.7.0 was built for, so it is not free — but per call saved it is
the cheapest harm available, and it is the switch to reach for before any of the
five below.

**`CHAT_ENABLED=0` IS A DIFFERENT ORDER OF THING and belongs second only because
the chat is the app's most expensive surface.** A run is 2–5 model calls where a
reading is one, so an active room outspends the reading path several times over.
**It gates the model call and never the cached read**: the room opens, the whole
history renders, and the composer is disabled with one line of copy — *a kill
switch that blanks a screen is a worse outage than the quota it protects.*

**AND THE CHAT IS ALREADY SHEDDING ITSELF BEFORE YOU GET HERE.** Both chat call
sites are `callClass: 'deferred'`, so `meter.ts` drops them at the **soft** ceiling
— 70% of `LLM_WINDOW_CALL_CEILING` — while a reading keeps going to the hard one.
The chat also has its own sub-budget, `LLM_WINDOW_CHAT_CEILING`, defaulting to half
the hard ceiling and checked first. **A shed chat turn is not an error**: the run
stays open with beats remaining and the querent's next visit delivers them, which
is why the automatic controls are usually enough and this row is for when they are
not.

**`GIST_ENABLED` first among the five, and it is not close.** It is the only one whose volume
tracks *reading count* rather than user count or day count, so on any busy day it
is worth more than the other four together — and it is the one nobody notices,
because the gist is prompt material for a later reading and never appears on a
screen.

**`LOTUS_GENERATION_ENABLED` last.** The Lotus block is read into *every* reading
prompt, so switching it off degrades the actual product for anyone who onboards
while it is off, in a way that shows up in the prose rather than in a missing
panel.

### What none of them do

**They gate the model call, not the cached read.** `SHARING_ENABLED`'s rule
("existing links keep resolving"). A querent who already has a verdict, a summary
or a persona keeps seeing it, served free out of the row that is already there.
Off means *write nothing new*, never *hide what exists* — a kill switch that blanks
a screen is a worse outage than the quota it was protecting.

**They never leave a row behind that will look current later.** This is the part
that took the most care, and the two generators behave differently on purpose:

- `LOTUS_GENERATION_ENABLED=0` **writes nothing at all.** `lotusInputHash` digests
  the birth year and the six onboarding answers and nothing else, so it never
  moves again — a template stored under it would still match after the flag went
  back to `1`, and that querent would feed a template into every reading they ever
  took. Writing nothing makes it self-healing: the next reading distils properly.
- `PERSONA_GENERATION_ENABLED=0` **stores the template on a first visit only**, and
  never overwrites a paragraph that already exists. It has to write something —
  `/api/persona` answers 500 with no row — and it is safe to, because
  `personaInputHash` includes the reading list and therefore moves on the querent's
  next reading.
- `PROFILE_MEMORY_ENABLED=0` **writes nothing either, and it is a THIRD shape rather
  than a copy of the Lotus.** There are two independent questions — is storing a
  fallback SAFE (does the hash move off it?) and is it NECESSARY (does a reader break
  without a row?) — and the two generators above happen to answer both the same way,
  which is why this section used to read as though there were one question. The
  profile memory's hash is the newest chat message id, so it MOVES on the querent's
  next sentence and storing would be safe; but nothing 500s on a missing row, so it is
  not necessary, and **there is no honest template version of a memory** — a memory is
  by definition what the querent actually said, and `/account` labels the row *what the
  room believes about you*. Self-healing on the way back, like the Lotus.

### Turning them back on

Set the value back to `1` and **Redeploy** — do not delete the row, for the reason
above. Nothing needs backfilling:

- **Gists** do not backfill. Readings taken during the outage stay unrecallable,
  permanently. That is the accepted cost of the biggest lever.
- **Frequency verdicts** and **day summaries** generate on the next request that
  needs one.
- **Personas** and the **Lotus** regenerate on the querent's next reading, which is
  what moves the hash. A querent who never reads again keeps what they have.
- **The profile memory does not backfill, and unlike the two above it does not heal
  on its own timetable either.** The next completed chat run after the flag returns to
  `1` finds a moved hash and extracts normally — but it extracts over the last
  `PROFILE_MEMORY_WINDOW` messages, so a fact stated early in a long outage may have
  fallen out of that window and is lost unless the querent says it again. Nothing on
  any screen reports that.
- **Chat runs do not backfill and do not need to.** A run minted while
  `CHAT_ENABLED` was off was never minted at all; a run that was shed mid-flight is
  still sitting there `pending` or `running` and the next visit picks it up, unless
  the nudge cron has aged it out at `PROACTIVE_RUN_TTL_HOURS` (24). **That TTL is
  the thing to think about before a long outage**: a week of shedding would
  otherwise deliver week-old greetings the moment the ceiling cleared.

### The three cron jobs, and two of them are the nudge

`vercel.json` schedules three, and **Vercel cron schedules are always UTC**:

| Path | Schedule | WIB | What |
|---|---|---|---|
| `/api/cron/sweep` | `17 3 * * *` | 10:17 | The five retention deletes, plus the size probe and the ceiling report |
| `/api/cron/nudge?slot=pagi` | `0 1 * * *` | 08:00–08:59 | Ages out stale chat runs, then mints and warms up to `NUDGE_MAX_USERS` unprompted runs |
| `/api/cron/nudge?slot=malam` | `0 12 * * *` | 19:00–19:59 | The same job, in the evening |

**All three authenticate with the same `CRON_SECRET` and all three 503 without it.**
One secret, deliberately: a second is a second thing to rotate and a second thing to
have unset.

**Hobby allows 100 cron jobs per project**, verified 2026-08-07 against
`vercel.com/docs/cron-jobs/usage-and-pricing` and the changelog entry *"Cron jobs
now support 100 per project on every plan"* (2026-01-20) — minimum interval once
per day, scheduling precision ±59 minutes. **That once-per-day minimum is why a
louder cadence needed a second entry rather than a shorter schedule.**

**`0 12` IS STILL NOT NOON**, and `0 1` is not one in the morning: the first is
19:00 in Jakarta and the second is 08:00, which are the two hours a person
actually messages you.

**THE MORNING SLOT IS NEW IN THIS RELEASE AND IT IS ONLY SAFE BECAUSE QUIET HOURS
ARE LIVE.** 01:00 UTC is 08:00 in Jakarta and 02:00 in Berlin. Until 2026-08-30
there was no quiet-hours predicate — by ruling, because the other two proactive
sources only fire while the querent is demonstrably in the app and this one's
single schedule *was* the mechanism. **A schedule stops being the mechanism the
moment there is more than one of them**, so `CHAT_QUIET_FROM_HOUR` /
`CHAT_QUIET_TO_HOUR` (defaults 22 and 7, in the querent's own zone, read off
`chat_threads.utc_offset_minutes`) now refuse a nudge that would land at night.
**A querent whose browser has never reported an offset is treated as awake** —
never blocked on an unknown — so the morning slot can still reach somebody at a
bad hour if we have never seen their clock. The instrument is
`chat.proactive_skipped` with `reason: 'quiet_hours'`; if that rate is high the
window is too wide, and the fix is `CHAT_QUIET_TO_HOUR`, one variable.

**The `slot` query parameter is a log label and nothing else.** No branch reads
it. If a deploy is ever rejected for it, drop it from both entries: the two jobs
become identical apart from their schedules and the only thing lost is being able
to tell them apart in the log.

**Its log line is `[cron] nudge`** and it reports counts and never rows:
`candidates`, `minted`, `advanced`, `abandoned`, `skipped`, `failures`. Zeroes
forever means it has silently stopped matching anything; a non-empty `failures`
turns the response red so the cron dashboard shows it.

### Checking it worked

**`llm_calls` is the instrument, not the analytics events.** Query 9 in
`docs/analytics-queries.md` breaks model calls down by `op`; with a flag off, that
`op` should go to zero and stay there. The feature-level events are deliberately
quieter — `persona.generated` does **not** fire for a switched-off persona, because
an event claiming a generation that never happened would inflate exactly the number
you are checking.

---

## 3. Verify the deployment

- **`/` returns 200 and shows the LANDING PAGE while signed out.** It used to
  redirect to `/login` and this line used to say so; S-D5 changed it deliberately
  in v0.4.0. This is also what unblocks publishing the OAuth consent screen —
  Google's branding requirement is an app homepage that is not a login page.
  Signed IN, `/` is still the reader picker, byte for byte.
- **`curl -s https://www.jmtarot.site/sitemap.xml | head -5` names
  `https://www.jmtarot.site`** and no `vercel.app` host. See §7a — a canonical at
  the wrong host de-indexes the right page and nothing reports it.
- **`tools/seo/crawl.sh` prints `crawl: clean.`** It is the release's acceptance
  test: every public path 200 with no redirect, no `Set-Cookie`, no `noindex`, and
  `/s/` still `noindex, nofollow, noarchive`.
- The login page shows one **Continue with Google** button, and links to
  `/terms` and `/privacy` that both load **while signed out**
- `curl -sI https://www.jmtarot.site/terms` shows `x-frame-options: SAMEORIGIN`,
  `strict-transport-security`, and both `content-security-policy` and
  `content-security-policy-report-only` (W7 §6.5)
- A question containing an obvious Tier-A phrase returns **403** with
  `{"error":"moderation_blocked"}` and no reading text
- `GET /api/cron/sweep` without the bearer token returns **401**. A **503** there
  is the other outcome and it is not an error in the route: it means
  `CRON_SECRET` is unset, so the daily sweep is refusing to run rather than
  running unauthenticated
- The build log ends with `audit-secrets: clean.` — see §1. It runs *after*
  `next build`, so a green Next build is not a green deploy
- Google's consent screen says **JMTarot**, not a raw client id
- Sign in returns you to the app, and a `users` row appears with the right
  `google_sub`. Sign in a second time and it is still **one** row, with
  `last_seen_at` moved
- One reading completes for each service: Kartu Harian, Tiga Kartu, Ya atau Tidak

Two failures worth recognising on sight:

- **`redirect_uri_mismatch`** is Google-side and means the registered URI does not
  match `AUTH_URL` character for character. The URI it wanted is in the
  `redirect_uri` query parameter of the URL you were sent to.
- **"Sign-in works, then every page bounces back to `/login` forever"**, with a
  200 in the access log, is almost always `AUTH_SECRET` missing from that
  environment. Auth fails closed and nothing logs an error.

### One thing only a phone can verify

**Add to Home Screen, then sign in from standalone mode.** This is the largest
unverified risk in the auth work. In iOS standalone mode, navigating to another
origin (`accounts.google.com`) can hand the user to Safari or an in-app browser,
and the session cookie can land in a jar the standalone shell cannot see. The
failure mode is "sign-in works in Safari and the installed app can never sign
in", which breaks the product's whole delivery model. It cannot be tested in WSL,
in Windows Chrome, or on a simulator that does not exist here.

## 4. Install on a phone

Open the **production** URL in Safari → Share → **Add to Home Screen**.

Not a preview URL: an installed web app pins whichever `start_url` it was added
from, so it would keep opening that one preview forever.

Expect these two, neither of which is a bug:

- **You log in again after installing.** Standalone mode has its own cookie
  jar, separate from Safari's.
- **No browser back button.** Every screen below the root has its own back
  control for this reason.

## 5. Housekeeping

- **The provider controls are in §2b, and they are not a spend cap.** That
  bullet used to say "Set a spend cap at your LLM provider. The app's rate
  limiter is in-memory, so serverless cold starts reset it." Both halves are now
  wrong: the plan has no spend cap to set, and the limiter is Upstash-backed and
  fleet-wide as of V9. What survives is the habit — check query 9 weekly.
- **Rotate a token the moment it is pasted anywhere shared** — a chat, an
  issue, a screenshot.

### Sharing (V7)

**`SHARE_BASE_URL` IS UNSET IN PRODUCTION AND IN PREVIEW.** `AUTH_URL` is already
`https://www.jmtarot.site` and one host is the rule — the apex 308-redirects to
`www`, and an OAuth redirect URI is a string comparison. `shareOrigin()` takes
`AUTH_URL`'s ORIGIN, so a share URL is `https://www.jmtarot.site/s/<12 chars>`,
39 characters, with nothing to set.

Set it only if the share host ever genuinely differs from the app host. **On a
PREVIEW deployment it is also unset**, which means preview share links point at
whatever `AUTH_URL` says there — deliberately, because a preview minting links
against the production host would put preview rows behind production URLs.

`SHARING_ENABLED` is unset (i.e. on). Only the exact string `0` turns minting off,
and it does not affect links that already exist — see `.env.example`.

**NOTHING ELSE IS NEEDED FOR THE PUBLIC PAGE**, and two things are worth knowing
before the first shared link goes out:

- `/s/*` carries `X-Robots-Tag: noindex, nofollow, noarchive` and
  `Referrer-Policy: no-referrer` from `next.config.ts`, and `robots.txt` disallows
  the prefix. A 60-bit slug is unguessable but not unindexable.
- **`UPSTASH_REDIS_REST_URL` matters more once this ships than it did before.**
  `/s/[slug]` is the app's only unauthenticated read path and its per-IP limit is
  what makes the slug's entropy arithmetic true; without Upstash the limiter is
  per-instance memory, so "120 views per IP per hour" becomes 120 × warm
  instances — and the instance count is largest under exactly the load an
  enumeration attempt produces.

## 6. The production database: Neon

**This section used to say the database was local-only and that `DATABASE_URL`
must not be set in Vercel. That is obsolete** — roadmap D5 was resolved on
2026-07-27 — and it is rewritten rather than deleted because "nothing deployed
reads it yet" was never quite true: `src/lib/auth/auth.ts` has imported `db`
since W2, so sign-in itself needs a database.

Neon, free plan, **AWS ap-southeast-1 (Singapore)**, **Postgres 16** to match
`docker-compose.yml`. Roadmap §2's *D5 resolved* has the reasoning — including
why not Supabase, why not Postgres 18, and why **Neon Auth must stay off**. What
follows is the procedure.

### Set it up from scratch

1. [neon.com](https://neon.com) → **Create project**. Name it, pick Singapore,
   pick **Postgres 16**, and **leave Neon Auth unchecked**.
2. Copy both connection strings from the dashboard. There are two, and using the
   wrong one is the whole failure mode of this section:

   | Endpoint | Host | Used by |
   |---|---|---|
   | **Pooled** | contains `-pooler` | `DATABASE_URL` in Vercel |
   | **Direct** | no `-pooler` | migrations, `db:studio`, `pg_dump`, any script |

3. Apply the schema, with the **direct** string:

   ```sh
   export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
   DATABASE_URL='postgresql://…neon.tech/neondb?sslmode=require' npm run db:migrate
   ```

   Expect `migrations applied (10 tables in public)`. It is idempotent, and it
   is what runs after every future migration — `drizzle-kit push` stays banned,
   for the reasons in `src/lib/db/migrations/README.md`.

   **A shell-set `DATABASE_URL` wins over `.env.local`**, because
   `scripts/db-migrate.ts` calls dotenv's `config()`, which does not override an
   existing value. That is what makes this line safe to run from a working tree
   pointed at Docker.

4. **Do not run `npm run db:seed`.** It refuses anything but `127.0.0.1`, so it
   will stop you — but the point stands: the two dev users are meant not to
   exist in production. **No migration in this project inserts a row**, so there
   is no seed data that can leak into production by accident.
5. Put the **pooled** string in Vercel as `DATABASE_URL`, and set
   `FIELD_ENCRYPTION_KEY` alongside it (§2).
6. **The region is pinned by `"regions": ["sin1"]` in `vercel.json`, not by the
   dashboard.** The dashboard's Functions → region control is what this step used
   to name, and **naming it here is what let the whole app run in Washington DC
   for the project's entire life.** Measured 2026-08-19: every route answered
   `x-vercel-id: sin1::iad1::…` — edge Singapore, function Virginia — while
   `serverlessFunctionRegion` in the project settings read `iad1`, the default.
   So every query crossed the Pacific to a Neon compute in `ap-southeast-1` and
   back, ~230ms each way, and the app's round trips are sequential. A key in
   `vercel.json` is the fix because it is **in the repository**: it ships with
   the code, it is reviewable, it survives a project being relinked or recreated,
   and it overrides the dashboard. A checklist step somebody has to remember to
   click is not a mechanism. Single-region is allowed on Hobby. **Verify after
   deploying** with `curl -4 -sI https://www.jmtarot.site/login | grep x-vercel-id`
   and look for `sin1::sin1::`.

### The three driver knobs, and why they are keyed off `VERCEL`

`src/lib/db/client.ts` is still the only file that names the driver. All three
of the settings its comment block predicted are now set, conditionally:

1. `max` → **1** on Vercel, 10 locally. Each serverless invocation is its own
   isolate, and a pool of ten per isolate exhausts Postgres' connection limit in
   seconds. One long-lived local process wants the pool.
2. `prepare` → **false** on Vercel, because Neon's pooled endpoint is PgBouncer
   in **transaction mode**. A prepared statement does not survive its connection
   being handed to another client mid-session, and the symptom is `prepared
   statement "s1" already exists` under load and never in testing.
3. `ssl` → **`'require'`** on Vercel.

The condition is `process.env.VERCEL`, **not `NODE_ENV`**: a Vercel *preview*
build is also `NODE_ENV=production` and also serverless, while a local `npm run
build && npm start` is neither.

The one case this gets wrong is running a **local** process against the
**pooled** URL — `VERCEL` is unset, `prepare` stays on, and you get the
`s1 already exists` error locally. Use the direct string locally, which is what
migrations want anyway.

### Backups, and getting off Neon

Free-tier history retention is short. Turn on whatever backup/PITR window the
plan allows; it is the difference between undoing a bad migration and not.

The exit is a plain `pg_dump`, and it works because nothing here is
Neon-specific — see roadmap §2 *D5 resolved* for the audit and the three rules
that keep it that way. Note that **`pg_dump` cannot read a server newer than
itself**, and the only `pg_dump` on this machine is inside the
`postgres:16-alpine` container. That is why production is Postgres 16.

```sh
docker compose exec db pg_dump --no-owner --no-privileges --format=custom "$OLD" -f /tmp/jmtarot.dump
docker compose exec db pg_restore --no-owner --no-privileges -d "$NEW" /tmp/jmtarot.dump
```

### Still true: do not point a deployment at the local database

It binds to `127.0.0.1` inside WSL and is unreachable from Vercel by design. A
`DATABASE_URL` set to it in the dashboard is a connection that times out, not
one that fails loudly.

### 6a. `ADMIN_EMAILS` IS PRODUCTION ONLY, AND THE REASON IS THIS FILE'S SUBJECT

**v0.5.0 / A1, reconciliation R37.** Set `ADMIN_EMAILS` in **Production** and
**nowhere else** — not Preview, not Development.

**Because Preview shares `DATABASE_URL` with Production** (§2 says to set the same
keys in both, and that is right for every other variable). So an `ADMIN_EMAILS` set
on Preview gives **every push-triggered preview deployment a live `/admin` over real
querent data** — including the audited PII reveal — on a URL that gets pasted into
PR comments and is in nobody's threat model. The gate is the same gate, so this is
not an authorisation hole; it is a surface-area increase nobody chose, and no plan
was positioned to see it because each saw only its own half.

Two consequences worth stating rather than discovering:

- **Loop 5's admin flow runs locally**, against `E2E_BASE=http://localhost:3001`.
  What it runs against a real deployment are the **signed-out and non-admin refusal
  cases**, which need no admin identity — and those are the half that actually
  needs a deployment, because `tools/admin/probe.sh` measures the refusal on the
  real Vercel edge.
- **An admin session cookie would not travel to a preview anyway.** It is
  `Domain`-scoped to `www.jmtarot.site`, so a preview admin has to sign in there
  separately — which means the residual risk is Google's consent screen accepting a
  preview URL as a redirect target, **a configuration nobody has audited.** One more
  reason the variable stays off Preview.

Two smaller notes: **an empty or unset value means nobody is an admin**, never
everybody (the `RATELIMIT_BACKEND` direction), so there is no `ADMIN_ENABLED` kill
switch and none is wanted. And **if `/admin` redirects you to `/onboarding`, the
allowlist is probably correct** — the onboarding gate runs above the admin check, so
a fresh operator account presents exactly like a misspelt address here.

## 7. Search Console and the sitemap — REQUIRED once, after the first deploy

### 7a. `NEXT_PUBLIC_SITE_ORIGIN` — set it, and then look at the sitemap

**`NEXT_PUBLIC_SITE_ORIGIN=https://www.jmtarot.site` in Production. Set it in
Preview too, to the preview host or not at all — never to production.**

Every canonical tag, every `hreflang`, every `og:image` and every URL in
`sitemap.xml` resolves against `siteOrigin()`. Absent, it falls to `AUTH_URL`
(which production sets to the same value, so you are covered twice), then to
`VERCEL_PROJECT_PRODUCTION_URL`, then to `VERCEL_URL` — **and a canonical tag
pointing at `jmtarot-abc123.vercel.app` de-indexes the real page.** Nothing
reports that; it is the single worst class of SEO bug available.

**IT IS SET IN PRODUCTION AS OF 2026-07-29**, by
`vercel env add NEXT_PUBLIC_SITE_ORIGIN production --value https://www.jmtarot.site
--no-sensitive` — and `--no-sensitive` is the part worth copying. This project's
Vercel team defaults new variables to **Sensitive**, which means Vercel never hands
the value back: `vercel env pull` writes the literal string `[SENSITIVE]`, and the
one variable whose whole purpose is to be a public URL becomes the one variable
nobody can verify without a deploy. (Ask how that was discovered: a `curl` to
Upstash with a "token" 11 characters long, `[S…`, which is `[SENSITIVE]`.) Store
every secret sensitive and this one readable.

**So check it, in two commands, and do not skip it:**

```sh
curl -s https://www.jmtarot.site/sitemap.xml | head -5
curl -s https://www.jmtarot.site/robots.txt  | grep -i sitemap
```

Both must name `https://www.jmtarot.site`. A `vercel.app` host in either is the
misconfiguration, visible before Google ever sees it.

**On a PREVIEW deployment a `vercel.app` origin is CORRECT** — a preview emitting
production canonicals would ask Google to index the production URL from a page
that is not it.

### 7b. Verify the domain with a DNS TXT record, not the HTML file

**Use a Domain property on `jmtarot.site`, verified by DNS TXT.** Roadmap §13 left
the method open; this is the decision. Three reasons, and the second is specific
to this app:

1. A Domain property covers the apex, `www`, and both schemes in one. **The apex
   308-redirects to `www`**, so a URL-prefix property on `https://www.jmtarot.site`
   leaves the host a stranger actually types unverified.
2. **The HTML-file method DOES NOT WORK HERE AND THE FAILURE LOOKS LIKE A MISSING
   FILE.** It wants `public/google<token>.html` served at `/google<token>.html`.
   `src/middleware.ts`'s matcher is
   `'/((?!_next/|cards/|dukuns/|favicon|icon|apple-icon|manifest|sitemap|robots).*)'`
   — which **matches that path** — and `isPublic()` in `src/lib/auth/gate.ts` does
   not name it, so Googlebot, which carries no cookie, is 302'd to `/login`.
   Verification fails, the error says the file was not found, and the file is
   right there in `public/`. Making it work would mean a permanent entry in the
   session allowlist for a one-time act.
3. It survives every rebuild, every route change, every gate change and every
   matcher change. There is nothing in the repo to keep in step, which is why
   roadmap §9 declines to make `GOOGLE_SITE_VERIFICATION` a variable at all.

Procedure:

1. Search Console → **Add property** → **Domain** → `jmtarot.site` (no scheme, no
   `www`).
2. Copy the `google-site-verification=…` string.
3. At the registrar, add a **TXT** record on the apex — host `@`, value the whole
   string. Leave any existing TXT records alone; a domain may hold several.
4. Wait for propagation and check it yourself before pressing Verify:

   ```sh
   RES_OPTIONS=no-aaaa dig +short TXT jmtarot.site
   ```

   If `dig` is unavailable, `getent` will not do this — use
   `curl -s 'https://dns.google/resolve?name=jmtarot.site&type=TXT'`.
5. Press **Verify**. **Do not delete the TXT record afterwards** — Search Console
   re-checks it and un-verifies the property when it disappears.

### 7c. Submit the sitemap, once

Search Console → **Sitemaps** → `sitemap.xml`. One file, both locales; `robots.txt`
also names it, which is how every other crawler finds it.

**Then read the two reports that actually say whether v0.4.0 worked**, and do not
expect either on day one — indexing takes days to weeks:

- **Pages** → the count of indexed URLs. The release's whole thesis is §1's number:
  three pages before, forty-six or so after. If `Excluded → Alternate page with
  proper canonical` is large, the `hreflang` pairs are not reciprocal and Google
  has picked one side; `sitemap.test.ts` asserts reciprocity, so that would mean
  the emitted tags and the sitemap disagree.
- **Pages → Not indexed → Page with redirect.** **Any content route here means the
  gate is refusing a crawler**, which is exactly the failure this release exists to
  remove. `tools/seo/crawl.sh` answers the same question in two seconds and without
  waiting for Google.

### 7d. Do not deploy S1 alone

`Landing.tsx` links to `/gallery`, `/arcana/the-moon` and `/blog`, which S3, S4 and
S6 own. **A homepage linking to three 404s is worse than the redirect it
replaced**, and no unit test can see it — the pages are *meant* to be missing at
that point in the sequence. Merging to `main` is fine; deploying a build where
`tools/seo/crawl.sh` reports 404 on those three paths is not.

## Deploying from the terminal

`vercel --prod` uploads whatever is on your disk, so production can end up
matching no commit on `main` — confusing exactly when you are debugging. Push
to `main` and let the pipeline do it. Keep `--prod` for emergencies.

Genuinely useful CLI commands:

```sh
vercel logs <deployment-url>   # runtime logs; where console.error lands
vercel ls                      # recent deployments
vercel env pull .env.local     # sync env vars down (overwrites the file)
vercel                         # preview deploy from local, uncommitted code
```
