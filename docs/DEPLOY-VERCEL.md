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

Twelve, all needed, for **Production** *and* **Preview**:

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
```

**This list said eight until 2026-07-27, and omitting `DATABASE_URL` and
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
ANALYTICS_STREAM_TIMEOUT_MS     45000       how long after() waits for the stream
ANALYTICS_RETRY_BUDGET_MS       5000        ceiling on the readings-insert retry
MODERATION_TIMEOUT_MS           1500        backstop for a hung classifier, not a target
MODERATION_CLASSIFIER_ENABLED   1           `0` = blocklist only. The 2am kill switch
MODERATION_QUESTION_RETENTION_DAYS  30      before the sweep nulls the stored text
TERMS_VERSION                   2026-07-27  a BUMP FORCES RE-ACCEPTANCE for everyone
EVENTS_RETENTION_DAYS           180         `readings` is deliberately NOT on this clock
```

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

## 2b. Set a hard spend cap at z.ai — REQUIRED, and it is not code

**This is the single most important control on the bill, and nothing in this
repository can enforce it.** Do it before the app is reachable by anyone but you.

`src/lib/ratelimit.ts` is a per-instance sliding window. Serverless instances do
not share memory, so it is best-effort by construction, and Google sign-in made
its key space unbounded: fifty throwaway Google accounts get fifty independent
budgets. `hitGlobal()` bounds one instance; it cannot bound a fleet. **A
provider-side cap can, absolutely.**

The cost roughly doubled with W7, too: each reading is now **two** model calls,
because the moderation classifier runs alongside the reading.

1. Open the z.ai billing dashboard.
2. Set a hard monthly spend limit — one that you would be annoyed but not hurt
   to pay in full.
3. Set the alert threshold below it, so a runaway shows up before the cap does.
4. **Record the value in the commit message or here**, so the next person knows
   what was chosen rather than whether anything was.

`MODERATION_MODEL=glm-4.5-flash` helps the bill too, at roughly six times
cheaper per classification than the reading model — but **that is a side effect,
not the reason.** It is in §2's required list because on the reading model the
classifier's p95 exceeds the reading's own p50 TTFT and the gate becomes the
latency. Do not reason about it as a cost lever, or the first person optimising
for quality will move it back.

**The upgrade trigger for the rate limiter is an event, not a number:** the day a
link to the app is posted anywhere public, swap `hit()`'s body for
`@upstash/ratelimit` on Redis. Not at a user count, not at a bill threshold —
the moment the URL is outside your control.

## 3. Verify the deployment

- `/` redirects to `/login`
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

- **Set a spend cap at your LLM provider.** The app's rate limiter is
  in-memory, so serverless cold starts reset it. The login gate and a provider
  cap are the real protections.
- **Rotate a token the moment it is pasted anywhere shared** — a chat, an
  issue, a screenshot.

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
6. Vercel → Project Settings → Functions → region **Singapore `sin1`**. The
   default is Washington DC, which puts the Pacific between every query and its
   database.

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
