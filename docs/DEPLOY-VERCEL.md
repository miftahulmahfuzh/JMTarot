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

Eight, all needed, for **Production** *and* **Preview**:

```
LLM_PROVIDER               zai
LLM_BASE_URL               https://api.z.ai/api/anthropic
LLM_MODEL                  glm-4.6
LLM_API_KEY                <your provider token>
AUTH_SECRET                <32+ random bytes, base64>
AUTH_GOOGLE_ID             <client id>.apps.googleusercontent.com
AUTH_GOOGLE_SECRET         <client secret>
AUTH_URL                   per environment -- see below
```

`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` come from a Google Cloud OAuth client.
**`docs/plans/2026-07-26-google-auth.md` §4 is the assume-nothing walkthrough** —
project, Branding, Audience, the three non-sensitive scopes, and the redirect
URIs — and it is worth following rather than improvising, because the console's UI
was renamed in 2025 and no longer matches the Auth.js docs.

Two more are optional, and both have working defaults. Set them when you want a
number other than the default, and remember that `SESSION_TTL_HOURS` is read at
module scope in `config.ts`, so **a dashboard change needs a redeploy** before
middleware sees it:

```
SESSION_TTL_HOURS          24    idle timeout, slides on every request
SESSION_ABSOLUTE_TTL_DAYS  30    hard ceiling, never slides
```

`LLM_PROVIDER` may also be `anthropic`; the same adapter serves both, and you
drop `LLM_BASE_URL` for Anthropic proper.

**Note that `DATABASE_URL` is not in that list.** See §6.

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

## 6. The database is local-only, on purpose

There is a Postgres database now, and **there is no production one.**
`PUBLIC_RELEASE_ROADMAP.md` D5 defers picking a host explicitly, so
`DATABASE_URL` is deliberately absent from §2's list and must not be set in
Vercel. Nothing deployed reads it yet.

Two consequences worth stating rather than discovering:

- **Do not point a deployment at the local database.** It binds to `127.0.0.1`
  inside WSL and is unreachable from Vercel by design. A `DATABASE_URL` set in
  the dashboard would be a connection that times out, not one that fails
  loudly.
- **`FIELD_ENCRYPTION_KEY` follows the database.** It has no purpose without
  one, and setting it early is a secret in a dashboard protecting nothing.

**When a host is chosen**, the driver is named in exactly one file —
`src/lib/db/client.ts` — and its comment block names the three settings that
move and why guessing them now produces wrong values:

1. `max` → 1, because each serverless invocation is its own isolate and a pool
   of ten per isolate exhausts Postgres' 100-connection default in seconds.
2. `prepare` → false **if and only if** the host puts a transaction-mode pooler
   in front (Supabase's `:6543`, PgBouncer in transaction mode). A session-mode
   pooler or Neon's HTTP driver needs no such thing, and the symptom of getting
   it wrong is `prepared statement "s1" already exists` under load and never in
   testing.
3. `ssl` → `'require'` for every managed host.

Migrations are committed and applied with `npm run db:migrate`. Whatever host
is chosen, that command is what runs against it — `drizzle-kit push` is banned,
for the reasons in `src/lib/db/migrations/README.md`. **No migration in this
project inserts a row**, so there is no seed data to worry about leaking into
production; the two development users come from `npm run db:seed`, which
refuses to run against anything but `127.0.0.1`.

This section deliberately does not contain a deployment procedure for a host
nobody has picked.

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
