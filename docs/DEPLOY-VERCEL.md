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

## 2. Environment variables

Ten, all needed, for **Production** *and* **Preview**:

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
```

**This list said eight until 2026-07-27, and omitting the last two was wrong
from W2 onward, not from W3.** `src/lib/auth/auth.ts` imports `db` and the `jwt`
callback calls `upsertUserOnSignIn`, so **Google sign-in itself reads the
database** — a deployment without `DATABASE_URL` 500s on the first login, not on
some later feature. W3 then added the onboarding writes, which is what needs
`FIELD_ENCRYPTION_KEY`.

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
SESSION_TTL_HOURS            24     idle timeout, slides on every request
SESSION_ABSOLUTE_TTL_DAYS    30     hard ceiling, never slides
LOTUS_MODEL                  --     falls back to LLM_MODEL
ANALYTICS_STREAM_TIMEOUT_MS  45000  how long after() waits for the stream
ANALYTICS_RETRY_BUDGET_MS    5000   ceiling on the readings-insert retry
```

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
| Preview | the **stable branch alias**, `https://jmtarot-git-<branch>-<scope>.vercel.app` |
| Production | `https://www.jmtarot.com` |

**Read the preview alias out of the Vercel dashboard rather than constructing
it.** Branch names containing slashes, or over the length limit, get mangled,
and a constructed guess fails as Google's `redirect_uri_mismatch` — an error page
that does not tell you which URI it wanted. (It is in the `redirect_uri` query
parameter of the URL you were sent to; read it and paste that exact string.)

Every one of those hosts, plus `http://localhost:3001`, needs its own
`…/api/auth/callback/google` entry in the Google console's Authorized redirect
URIs. Google caps a client at 100 of them. A throwaway branch therefore cannot
do Google login — that is acceptable, since it can still be screenshotted and
hardware testing happens on a named branch.

`*.vercel.app` **cannot** be a Google Authorized domain: it is a public suffix,
so Search Console will not let anyone verify it. That is why the consent screen
stays in **Testing** mode — where only the ≤100 manually-added test accounts can
sign in — until `www.jmtarot.com` is bought and pointed at Vercel. "Public
release" and "buy the domain" are the same task.

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

## 3. Verify the deployment

- `/` redirects to `/login`
- The login page shows one **Continue with Google** button, and links to
  `/terms` and `/privacy` that both load **while signed out**
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
