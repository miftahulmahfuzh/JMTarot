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

Six, all needed, for **Production** *and* **Preview**:

```
LLM_PROVIDER    zai
LLM_BASE_URL    https://api.z.ai/api/anthropic
LLM_MODEL       glm-4.6
LLM_API_KEY     <your provider token>
AUTH_SECRET     <32+ random bytes, base64>
AUTH_USERS      [{"u":"miftah","h":"$2b$12$..."},{"u":"jodith","h":"$2b$12$..."}]
```

`LLM_PROVIDER` may also be `anthropic`; the same adapter serves both, and you
drop `LLM_BASE_URL` for Anthropic proper.

Generate the secrets locally — one hash per person, each choosing their own
password:

```sh
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" 'the-password'
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # AUTH_SECRET
```

### The `$` trap — read this before pasting `AUTH_USERS`

A bcrypt hash contains `$2b$` and `$12$`, and **every dotenv-style parser tries
to expand those as variables**, silently deleting them. The same value
therefore needs two different spellings:

| Where | How to write the hash |
|---|---|
| `.env.local` on your machine | escaped: `\$2b\$12\$...` |
| Vercel's **Key / Value** fields | literal: `$2b$12$...`, no backslashes |

**Do not use Vercel's bulk `.env` paste box for `AUTH_USERS`.** It wants
`KEY=value` lines, so a bare JSON array is rejected outright — and if it does
accept something, you cannot tell from the dashboard whether the `$` sequences
survived. Use the individual **Key** and **Value** inputs, where the value is
taken literally.

### Bulletproof alternative: the CLI

This avoids both the dashboard parser and shell expansion, because the value
never passes through a shell.

```sh
npm i -g vercel
vercel login          # opens a URL to confirm in a browser
vercel link           # connect this folder to the project

# The QUOTED heredoc is load-bearing: unquoted, bash eats $2b and $12
# before the file is even written.
cat > /tmp/au.txt <<'EOF'
[{"u":"miftah","h":"$2b$12$..."},{"u":"jodith","h":"$2b$12$..."}]
EOF

vercel env add AUTH_USERS production < /tmp/au.txt
vercel env add AUTH_USERS preview    < /tmp/au.txt
rm /tmp/au.txt
```

### Verify the value survived

The dashboard is not proof. Read it back:

```sh
vercel env pull /tmp/check.env
grep -o 'AUTH_USERS=.*' /tmp/check.env    # the hashes must still contain $2b$12$
rm /tmp/check.env
```

If the `$2b$12$` prefixes are missing, the value was mangled in transit and
every login will fail with a generic "wrong password".

## 3. Verify the deployment

- `/` redirects to `/login`
- Both accounts log in; a wrong password gives the generic error
- One reading completes for each service: Kartu Harian, Tiga Kartu, Ya atau Tidak

A login that works locally but fails in production almost always means
`AUTH_USERS` is malformed. It fails closed by design — see
`src/lib/auth/users.ts`.

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
