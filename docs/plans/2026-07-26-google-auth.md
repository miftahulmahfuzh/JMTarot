# W2 — Google auth & session

> **RECONCILED 2026-07-26. `docs/plans/2026-07-26-RECONCILIATION.md` outranks
> this file.**
>
> Resolutions that change this plan:
> - **R12 — `AUTH_URL` is `http://localhost:3001`, not `:3000`.** W1 probed the
>   machine: port 3000 is permanently held by another project's Grafana
>   container. Google OAuth redirect URIs are exact-match strings, so register
>   `http://localhost:3001/api/auth/callback/google`. Your §4 Google Console
>   walkthrough needs the same edit.
> - **R1** — your naming wins over W4's `getSessionUser()`. Export **both**
>   `currentUser()` (nullable) and `requireUser()` (the `hit()`-shaped guard).
> - **R10** — your divergences are **accepted**: keep `users.ts`, use a
>   Credentials provider, delete the password route outright. Roadmap D2 is
>   amended to match. Add `NODE_ENV !== 'production'` to the flag.
> - **R11** — `SESSION_ABSOLUTE_TTL_DAYS=30` is **accepted**. Flagged to Miftah
>   as informational only, since he specified one knob.
> - **R13** — your open question 3 is answered: W7's erasure runs in-app from an
>   authenticated account screen, not an emailed link. **No caller remains for
>   `session.ts`'s jose helpers — delete the file and its test.**
> - **R21** — the three answers you needed from W7, decided: **do not render the
>   Google avatar** (saves a CSP `img-src` exception for a decorative element);
>   sign-in is a **full redirect**, not a popup; and `x-frame-options: SAMEORIGIN`,
>   **never `DENY`** — `DENY` kills this project's own iframe verification harness.
> - **R22** — `/onboarding` is not re-runnable, as you decided. W3's edit path is
>   a separate `/account`. Your `decide()` needs no special case.
> - **You now own the first-sign-in T&C acceptance screen** and its three `users`
>   columns (`terms_accepted_at`, `terms_version`, `age_confirmed_at`). W7 owns
>   the copy and the justification.
> - Your open question 8 (`ratelimit.ts` unowned) is resolved: **W7 owns it.**
> - **Your open questions 5 and 7 are ANSWERED** (reconciliation §7.2 and §7.8,
>   settled 2026-07-26):
>   - **Domain: `www.jmtarot.com`**, canonical, with the apex 308-redirecting to
>     it. **Production `AUTH_URL=https://www.jmtarot.com`**; redirect URI
>     `https://www.jmtarot.com/api/auth/callback/google`; Google Authorized
>     Domain is the registrable `jmtarot.com`. Serve one host, never both — the
>     callback is a string comparison. **Not purchased yet**, so the consent
>     screen stays in Testing mode and only manually-added test accounts can sign
>     in. Build against that.
>   - **Erasure: a 30-day grace period, then a hard purge.** Replace your
>     outright refusal. Sign-in against a soft-deleted row **within** 30 days
>     clears `deleted_at` and restores the account; **past** 30 days it
>     hard-deletes the row and creates a fresh user in the same transaction.
>     That lazy purge is your safety net; W7 owns the daily sweep that makes the
>     erasure promise true for users who never come back. W1's rejected partial
>     unique index on `google_sub` stays rejected and is now correct by
>     construction, since no soft-deleted row outlives 30 days.
> - **§7.9a — `AUTH_SECRET_1..3` and `AUTH_REDIRECT_PROXY_URL` are cut.**
>   Rotation machinery for an unscheduled rotation, and a preview-only variable
>   whose own note said not to set it before there is a production domain.
>   `SESSION_TTL_HOURS` **and** `SESSION_ABSOLUTE_TTL_DAYS` both survive — they
>   are orthogonal, and your `@auth/core` finding is exactly why the second is
>   not redundant.
> - **§7.6 — the age bar is 18.** Your first-sign-in acceptance screen writes
>   `age_confirmed_at` against that; W7 owns the copy.

**Status: BUILT, 2026-07-26**, on `feat/w2-google-auth`. Tasks 1 and 3–11 are
done; Task 2 (Google Cloud console) was done by hand against project `jmtarot`.
**Task 12 is outstanding** — the Vercel variables and the real-iPhone checks,
above all sign-in from a home-screen installed instance in standalone mode.

Google sign-in is verified end to end locally: the consent screen renders as
JMTarot, the callback completes, one `users` row appears with the right
`google_sub`, and the gate then sends the un-onboarded user to `/onboarding`
(which 404s until W3 exists — correct behaviour, not a bug).

Four corrections this plan needed, all recorded inline where they belong rather
than only here: `@auth/core` does not force-append `state` to `checks` (§1); the
sign-in identity is `account.providerAccountId` and **never** `token.sub`, which
this plan did not anticipate and which silently created a new user on every
sign-in; the pure `session` callback must live in `config.ts` or middleware and
the pages disagree about who is signed in; and `pages.error` has to be set or a
failed token exchange renders Auth.js's own 500 page. The last three are in
`CLAUDE.md`'s `## Auth` section, with the mechanism for each.

W1 never shipped the two queries this plan's *Interfaces I need* asked for, so W2
wrote them: `upsertUserOnSignIn` and `readSessionFacts` in
`src/lib/db/queries/profile.ts`, **handle-first** per the query-module contract
rather than the handle-less signatures below, and following reconciliation §7.8's
grace-period erasure rather than §5.3's outright refusal — so the function never
returns null and the nullable is gone.

**Date opened:** 2026-07-26.
**Owns:** `src/lib/auth/**`, `src/middleware.ts`, `src/app/login/**`,
`src/app/api/auth/**`.
**Depends on:** W1 for the `users` and `profiles` tables and the one query
named in *Interfaces I need*.
**Contract:** `PUBLIC_RELEASE_ROADMAP.md`. Where this file contradicts it, this
file is wrong. Everything below that *extends* the roadmap is flagged in
*Schema deltas*, *New environment variables* or *Open questions*.

This plan replaces the auth described in §5 of
`docs/plans/2026-07-25-jmtarot-web-rewrite.md`. That section is not deleted and
is not wrong — it was correct for two people and no database. It is simply the
previous threat model.

---

## 0. What is here today, and what survives

Today: `AUTH_USERS` is a JSON array of two bcrypt hashes in an env var;
`/api/auth/login` compares a password and signs an HS256 JWT with `jose`;
`src/middleware.ts` verifies that signature on the edge and returns a username;
`/api/reading` re-parses the same cookie by hand out of the `cookie` header. A
session lasts thirty days. There is no user record anywhere.

What survives contact with this plan, and why:

| Thing | Fate |
|---|---|
| `src/middleware.ts` at `src/`, not the repo root | **Unchanged rule.** At the root it is not an error, it is silently never executed and every route is open. This is the single worst failure mode in the file. |
| The `isPublic` **function**, not a regex | **Kept, and its comment is extended.** See §8. |
| The `matcher` static-prefix exclusions | **Kept verbatim.** Gating `/cards` looks like missing artwork, not an auth bug — and CLAUDE.md's iframe harness lives under `public/cards/` precisely because that prefix is excluded. Tightening the matcher would silently destroy the only way this project can drive its own UI. |
| The API-vs-page branch (401 for `/api/*`, redirect for pages) | **Kept, and extended** with a 403 for the onboarding gate. Its comment — a fetch that gets an HTML redirect looks like it succeeded and then dies on JSON parsing — is now true of three status codes instead of one. |
| `src/lib/auth/session.ts` | **Kept, renamed, demoted.** See §9.4. |
| `src/lib/auth/users.ts` and `users.test.ts` | **Kept, dev-only.** The decoy-hash timing comment still earns its place. See §9. |
| `src/app/api/auth/login/route.ts`, `logout/route.ts` | **Deleted.** Their jobs move inside Auth.js. See §9. |
| `src/app/login/page.tsx` | **Rewritten.** Two fields and a submit become one button. |
| The hand-rolled cookie parse in `/api/reading` | **Deleted**, replaced by `requireUser()`. |

---

## 1. Why a library, when we already have working jose helpers

`session.ts` is 53 lines and it is good code. It is also the entire auth
surface we currently have to get right, and it gets to stay small because
password-in / cookie-out is a two-step protocol.

OIDC is not a two-step protocol. Between the button and the cookie sit
`state`, PKCE `code_verifier`/`code_challenge`, `nonce`, the token exchange, the
`id_token` signature check against Google's rotating JWKS, and the `iss`/`aud`/
`azp`/`exp` claim checks. Every one of them is quietly catastrophic to get
wrong: a missing `state` is CSRF-on-login, a missing `nonce` is an id_token
replay, an unchecked `aud` accepts a token minted for a *different* Google
client. None of them produce a visible symptom when they are wrong. The app
works perfectly and is broken.

That is the argument in D1, and it is the whole argument. We are not adopting
Auth.js for convenience — the convenience is roughly neutral, since it brings
its own edge/Node split to reason about. We are adopting it because it owns the
six checks above and we would rather not.

Verified against the actual package rather than the docs
(`next-auth@5.0.0-beta.32`, `@auth/core@0.41.3`):

- `peerDependencies.next` is `^14.0.0-0 || ^15.0.0 || ^16.0.0`. We are on Next
  16.2.11. This is supported, not merely tolerated.
- The Google provider is `type: "oidc"` with issuer discovery against
  `https://accounts.google.com`, and `checks` defaults to `["pkce"]`.

  > **CORRECTED DURING IMPLEMENTATION, 2026-07-26.** This line originally said
  > `"state"` was *force-appended*. It is not. `@auth/core/lib/utils/providers.js:52`
  > reads `const checks = c.checks ?? ["pkce"]` and appends `"state"` **only
  > inside `if (c.redirectProxyUrl)`** — and reconciliation §7.9a cut
  > `AUTH_REDIRECT_PROXY_URL`, so we never set it. Observed on the wire: the
  > authorization URL carries `response_type`, `client_id`, `redirect_uri`,
  > `code_challenge`, `code_challenge_method=S256` and `scope`, and **no `state`
  > and no `nonce`**; the cookie jar gets `authjs.pkce.code_verifier`,
  > `authjs.csrf-token` and `authjs.callback-url`, and no `authjs.state`.
  >
  > **This is not a hole, and the fix is to not "fix" it.** PKCE covers state's
  > CSRF role here: the callback requires *this browser's* `code_verifier`
  > cookie, so a code minted in the attacker's flow fails the token exchange
  > with `invalid_grant`, and a browser with no verifier cookie is refused by
  > `useCookie` before any exchange happens. @auth/core cites the reasoning in
  > its own source (`lib/actions/callback/oauth/checks.js:80`, linking
  > danielfett.de's PKCE-vs-nonce article). `nonce` is OPTIONAL for the
  > authorization-code flow in OIDC and REQUIRED only for implicit/hybrid, which
  > we do not use — the `id_token` arrives from Google's token endpoint over TLS,
  > not from the browser, so there is no id_token to replay.
  >
  > Do not add `checks: ['pkce', 'state', 'nonce']`. It would work, and it would
  > add two more cookies that have to survive the round trip — which is the
  > largest unverified risk in this workstream (§11's iOS standalone item), paid
  > for a property PKCE already provides.
  >
  > §1's argument for adopting a library is otherwise unaffected: the token
  > exchange, the JWKS signature check and the `iss`/`aud`/`azp`/`exp` claim
  > checks are still the library's, and they are still the part nobody should
  > hand-roll.
- The default scope for an OIDC provider is literally `openid profile email`
  (`lib/utils/providers.js:48`). The minimum we want is the default. We add
  nothing.
- The session cookie is a **JWE**, not a signed JWT: `dir` + `A256CBC-HS512`,
  key derived from `AUTH_SECRET` by HKDF salted with the cookie name. It is
  encrypted, so the claims are not readable by the browser or by anything on
  the wire. That is a real improvement on what we have — the current
  `jmtarot_session` is a plain HS256 JWT with the username in cleartext base64.

`5.0.0-beta.32` is a beta and has been for two years. Pin it exactly. See D-8.

---

## 2. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| W2-1 | Library | `next-auth@5.0.0-beta.32`, **pinned exactly**, no caret | It is a beta with a two-year history of breaking changes between betas. A caret range means a `npm install` unrelated to auth can change how sessions are minted. |
| W2-2 | Config split | **Three modules**: `config.ts` (edge-safe), `auth.ts` (Node), `gate.ts` (pure) | §3. This is not stylistic. Middleware executes `callbacks.jwt`, so a DB import anywhere in the config middleware sees is a DB import in the edge bundle. |
| W2-3 | `config.ts` declares **no** `jwt` callback except the pure absolute-expiry check | Middleware re-encodes the cookie on every matched request. A `jwt` callback in the edge config that returns a *new* object silently strips `uid` and `onb` from the cookie on the user's next navigation. §3.3. |
| W2-4 | The `users` write | **`callbacks.jwt`, `trigger === "signIn"` only**, one statement, `returning` the id | Doing it in `callbacks.signIn` would mean writing there and reading back in `jwt` — two round trips for one row. §5.3. |
| W2-5 | `callbacks.signIn` | Pure refusal only: reject `email_verified === false`. No DB. | It is the one check that can be made before any I/O, and an unverified Google email is not an identity. |
| W2-6 | What is in the token | `sub`, `uid`, `email`, `name`, `onb`, `loc`, `abs`, `iat`/`exp`/`jti`. **`picture` is stripped.** | Measured: 548 B of cookie with it stripped, 676 B with it kept. No screen in the design renders a user avatar. `users.avatar_url` still stores it. §5.2. |
| W2-7 | Session TTL | **`SESSION_TTL_HOURS`, default 24, sliding (idle timeout)** | D3. Sliding is what the library actually does on the JWT path — `updateAge` is ignored there and the cookie is re-issued on every session read. §6. |
| W2-8 | Absolute cap | **Ship it.** `SESSION_ABSOLUTE_TTL_DAYS`, default 30. | A purely sliding session that an attacker keeps warm never expires. The cap is five pure lines in `config.ts` and it is the only thing that bounds a stolen cookie. §6, §7. |
| W2-9 | Onboarding flag refresh | `unstable_update()` server-side, and the `trigger === "update"` branch **re-reads the DB and ignores the client's payload** | The same callback is reachable from the browser via `POST /api/auth/session`. Trusting the payload is a one-request onboarding bypass. §5.4. |
| W2-10 | Dev password login | A **Credentials provider** gated by `DEV_PASSWORD_LOGIN=1`, not the old hand-rolled route | D2 keeps the capability. Two session cookie formats in one app is how you get a hole. A dev login that produces a *different* kind of session also stops exercising the code that matters. §9. |
| W2-11 | `DEV_PASSWORD_LOGIN` also requires `NODE_ENV !== 'production'` | Belt and braces | Vercel preview builds are `NODE_ENV=production`. This makes the flag impossible to turn on in *any* deployment, including by accident in the dashboard. |
| W2-12 | Login page | **Server component, Server Action form.** No `next-auth/react`, no `SessionProvider`. | It is the first paint a stranger sees, on a phone. It ships zero auth JavaScript. §10. |
| W2-13 | Client-side access to the user | A `ViewerProvider` context filled by the **owning server page**, never by the root layout | `/terms` and `/privacy` sit under the root layout and must stay statically renderable. Calling `auth()` in the root layout makes the entire app dynamic to serve a flag two components want. §11 of *Interfaces I export*. |
| W2-14 | Preview deployments | **Register the stable Vercel *branch* alias** now; move to `AUTH_REDIRECT_PROXY_URL` when a production domain exists | §4.4. |
| W2-15 | Revocation | **Not built.** Short TTL + absolute cap + secret rotation is the whole answer. | §7 says plainly what that costs and what would have to change. |

---

## 3. The edge / Node split, concretely

This is the single most common way an Auth.js + middleware integration breaks,
and it breaks in two directions — one loud, one silent. Both are worth naming
before any code exists.

### 3.1 The loud failure

The naive shape is one file:

```
src/lib/auth/auth.ts
  └── imports @/lib/db/client        (W1)
        └── imports drizzle-orm/node-postgres
              └── imports pg
                    └── imports node:net, node:tls, node:dns
```

and then `src/middleware.ts` does `export { auth as middleware } from '@/lib/auth/auth'`.

Next compiles `middleware.ts` for the edge runtime. The build dies with
`Module not found: Can't resolve 'net'`, or Next's friendlier variant, *"The
edge runtime does not support Node.js 'net' module."* This one is fine, because
it is a build error and `npm run build` catches it.

**A `runtime = 'nodejs'` export on the middleware makes the error go away and
makes the problem worse.** Next 16 supports Node middleware — it is stable, and
`loadNodeMiddleware` is right there in `next-server.js`. So the build passes,
and now a Postgres pool is instantiated inside the function that runs on every
single request that the matcher does not exclude. The gate exists to be cheap.
Do not do this.

### 3.2 The quiet part people miss

It is tempting to think the DB import is safe because the write is guarded:

```ts
async jwt({ token, trigger }) {
  if (trigger === 'signIn') {
    await upsertUserOnSignIn(...)   // only on sign-in, so middleware never runs it
  }
  return token
}
```

That guard is a **runtime** guard and the import is **static**. The bundler
pulls `pg` into the edge chunk whether or not the branch is taken.

Worse, the premise is also false. I traced it in the installed package:
`next-auth/lib/index.js#handleAuth` → `getSession()` → `Auth(request, config)`
→ `lib/actions/session.js`, which on the JWT path calls
`callbacks.jwt({ token })` **unconditionally**. The `jwt` callback runs inside
middleware, on every matched request, for the entire life of the session. There
is no "only on sign-in" anywhere in this system.

### 3.3 The silent failure: middleware strips your claims

Same code path, five lines further down (`lib/actions/session.js`, JWT branch):

```js
const token = await callbacks.jwt({ token: payload, ... })
const newExpires = fromDate(sessionMaxAge)
...
const newToken = await jwt.encode({ ...jwt, token, salt })
const sessionCookies = sessionStore.chunk(newToken, { expires: newExpires })
response.cookies?.push(...sessionCookies)
```

and in `next-auth/lib/index.js#handleAuth`:

```js
const finalResponse = new Response(response?.body, response)
for (const cookie of sessionResponse.headers.getSetCookie())
  finalResponse.headers.append("set-cookie", cookie)
```

**Middleware re-encodes and re-issues the session cookie on every matched
request, from whatever `callbacks.jwt` in the edge config returns.**

The default callback is `({ token }) => token` (`@auth/core/lib/init.js:30`),
which is why the naive split works at all. But the moment someone adds a
plausible-looking `jwt` callback to the *edge* config —

```ts
// config.ts — LOOKS FINE. IS A BUG.
jwt({ token, user }) {
  return { ...token, name: user?.name }   // new object, uid and onb not copied
}
```

— every claim that the Node callback added is dropped from the cookie on the
user's next page navigation. The symptom: sign-in works, the first page works,
and then `requireUser()` starts returning null (or worse, a user with
`id: undefined` that reaches a SQL query) with nothing in any log. Nobody finds
this quickly.

**Rule, and it goes in the file header of `config.ts`: `config.ts` defines
exactly one `jwt` callback, it is pure, it takes no arguments other than
`token`, and it returns either the same `token` object or `null`. Additions
happen in `auth.ts`, which composes on top.**

### 3.4 The three modules

```
src/lib/auth/
  gate.ts      PURE. No next-auth, no next/server, no DB. The routing decision.
  ttl.ts       PURE. Env -> seconds, defensively.
  token.ts     PURE. The claim shape and its runtime narrowing.
  config.ts    EDGE-SAFE. The shared NextAuthConfig. Imports gate/ttl/token
               and next-auth only. NEVER imports @/lib/db.
  auth.ts      NODE-ONLY. NextAuth(config + the DB-touching callbacks).
               Exports handlers / auth / signIn / signOut / unstable_update.
  server.ts    NODE-ONLY. currentUser(), requireUser(). What other workstreams
               import. Deliberately does not re-export `handlers`.
  viewer.tsx   'use client'. The context other client components read.
  users.ts     DEV-ONLY after D2. Unchanged.
  session.ts   KEPT, renamed. §9.4.
```

`src/middleware.ts` imports `config.ts` and `gate.ts` and nothing else:

```ts
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/config';
const { auth } = NextAuth(authConfig);
export default auth((req) => { /* translate gate.decide() into a response */ });
```

Two initialisations of `NextAuth` with two configs is not a mistake and does not
need to be reconciled. Decoding is symmetric: it depends on `AUTH_SECRET` and
the cookie name (used as the HKDF salt), not on the providers array. Middleware
never handles `/api/auth/*` — that path is public — so it never needs the
Credentials provider or Google's client secret. It only decodes, decides, and
re-encodes.

**One thing that must match across the two:** `session.maxAge`. It is read from
`SESSION_TTL_HOURS` inside `config.ts`, which both sides import, so it matches
by construction. Do not override it in `auth.ts`.

### 3.5 The env-var trap that follows from the split

Middleware runs in the edge bundle. Auth.js reads `AUTH_SECRET` through
`envObject.AUTH_SECRET` where `envObject` is `process.env` passed as a value —
so Next's build-time inlining of statically-referenced `process.env.X` cannot
help it. On Vercel this works because the edge runtime populates `process.env`
at request time, but it means:

- **`AUTH_SECRET` must be set in the Preview environment as well as
  Production.** Missing it does not produce a clear error. `@auth/core` returns
  a 500 whose body is `{ message: "There was a problem with the server
  configuration..." }`, and `next-auth`'s `parseSessionResponse` correctly
  treats any non-OK response as "no session" so that auth fails closed. The
  user-visible symptom is therefore: sign-in appears to work, and then every
  page bounces straight back to `/login`, forever, with a 200 in the access log.
- Name env vars **statically** in `config.ts` (`clientId: process.env.AUTH_GOOGLE_ID`)
  rather than relying on Auth.js's dynamic `AUTH_${ID}_ID` lookup. It costs one
  line and it makes the value inlineable. Auth.js's own lookup is fine on the
  Node side; this is insurance for the edge side.
- Changing `SESSION_TTL_HOURS` in the Vercel dashboard **requires a redeploy**
  for the middleware half to see it.

---

## 4. Google Cloud, assume nothing

You have never opened this console. Neither had I. The UI was renamed in 2025:
what the Auth.js docs call *APIs & Services → OAuth consent screen* is now
**Google Auth Platform**, with the old single page split into *Branding*,
*Audience*, *Clients* and *Data Access*. Both names appear below.

### 4.1 Project

1. <https://console.cloud.google.com> → sign in with the Google account that
   should **own** this. Not a throwaway. Losing it means losing the OAuth client
   and every user's ability to sign in.
2. Project picker (top bar) → **New Project** → name `jmtarot` → Create.
3. Make sure the project picker now says `jmtarot` before doing anything else.
   Everything below is per-project and it is easy to configure the wrong one.

### 4.2 Branding and Audience

**Google Auth Platform → Get started / Branding.**

- App name: `JMTarot`. This is the string on the consent screen. A stranger
  sees it before they see the app.
- User support email: Miftah's.
- App logo: optional, and **uploading one triggers brand verification**, which
  is a review queue. Skip it for now.
- App home page / Privacy policy / Terms of service: leave blank while in
  Testing. They become required to publish (§4.5), and they are W7's `/terms`
  and `/privacy`.
- Authorized domains: **leave empty while in Testing.** You cannot verify
  `vercel.app` — it is a public suffix that Google will not let you claim in
  Search Console — so there is no way to list it. This is the reason the
  Testing/Production split in §4.5 exists rather than being an afterthought.

**Audience:** *External*. (*Internal* requires a Google Workspace and restricts
sign-in to that workspace's domain.) While the publishing status is **Testing**,
only accounts listed under **Test users** can sign in — add Miftah and Jodith,
and anyone doing hardware testing. Up to 100.

Testing mode has one documented consequence that does not affect us: Google
expires *refresh tokens* issued to a Testing app after 7 days. We never request
one. Do **not** add `access_type: 'offline'` or `prompt: 'consent'` to the
authorization params — we have no use for offline access to a Google account,
and asking for it makes the consent screen worse and the failure modes real.

### 4.3 Data Access (Scopes)

**Google Auth Platform → Data Access → Add or remove scopes.** Add exactly
three:

```
openid
.../auth/userinfo.email
.../auth/userinfo.profile
```

All three are **non-sensitive**. That single fact is why this app can be
published without a Google verification review or a third-party security
assessment. Adding any fourth scope — Calendar, Drive, Contacts, anything —
changes that. There is no reason a tarot app needs one.

These three are also exactly what `@auth/core` requests by default
(`scope=openid profile email`), so **do not configure `authorization.params.scope`
in the provider at all.** Writing it out by hand only creates an opportunity to
drift from what is registered.

### 4.4 The OAuth client, and the redirect URIs

**Google Auth Platform → Clients → Create client.**

- Application type: **Web application**.
- Name: `JMTarot web` (internal label only; the consent screen shows the *app*
  name from Branding).
- **Authorized JavaScript origins: leave empty.** These are for browser-side
  flows. Ours is the server-side authorization-code flow; Auth.js never calls
  Google from the browser.
- **Authorized redirect URIs.** Exact-match, no wildcards, no fragments, https
  only — with `http://localhost` as Google's documented exception.

```
http://localhost:3000/api/auth/callback/google
http://localhost:3001/api/auth/callback/google
https://jmtarot-git-main-<scope>.vercel.app/api/auth/callback/google
https://<production-domain>/api/auth/callback/google
```

Notes on that list, each of which is a real trip hazard:

- `3001` is there because CLAUDE.md says so: `npm run dev` moves to 3001 when
  3000 is taken. A missing entry produces Google's `redirect_uri_mismatch`
  error page, which is Google-side and gives no hint about *which* URI it
  wanted. If you hit it, the failed URI is in the `redirect_uri` query
  parameter of the URL you were sent to — read it and paste that exact string.
- `127.0.0.1` is a **different URI** from `localhost` and would need its own
  entry. Pick one and stick to it.
- `/api/auth/callback/google` is fixed by `basePath` (`/api/auth`) plus the
  provider id (`google`). Do not invent a prettier path.
- Google caps a client at 100 redirect URIs.

Copy the **Client ID** and **Client secret** immediately into `.env.local` as
`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. The secret is shown once. Neither
value contains a `$`, but the `\$` rule for `.env` files still applies to the
file as a whole and to `AUTH_USERS` in particular.

**The preview-URL problem.** Vercel gives every *deployment* its own hostname
(`jmtarot-<hash>-<scope>.vercel.app`). Google needs an exact match. You cannot
register a hash you do not have yet, and you cannot wildcard. Three answers:

1. **Stable branch alias — do this now.** Vercel also aliases every *branch* to
   a stable hostname, `jmtarot-git-<branch>-<scope>.vercel.app`, which points at
   that branch's latest deployment. Register one per long-lived branch. Then set
   `AUTH_URL` in Vercel's **Preview** environment to that alias, so Auth.js
   builds the callback against the stable host even when you arrived via the
   per-deployment URL — you get bounced onto the alias and stay there, which is
   fine. **Read the alias out of the Vercel dashboard rather than constructing
   it**: branch names with slashes or over the length limit get mangled, and a
   constructed guess fails as `redirect_uri_mismatch`. Limitation: a throwaway
   branch cannot do Google login. That is acceptable — it can still be
   screenshotted, and hardware testing happens on a named branch.
2. **`AUTH_REDIRECT_PROXY_URL` — do this once production exists.** This is
   Auth.js's purpose-built answer and it is real: `redirectProxyUrl` is on
   `AuthConfig`, defaulted from that env var, and `init.js` computes
   `isOnRedirectProxy` by comparing its origin against the request's. You
   register **one** redirect URI with Google (production's). Preview deployments
   set `AUTH_REDIRECT_PROXY_URL=https://<production-domain>/api/auth`; the OAuth
   dance runs against production, which forwards the user back to the preview
   origin. Requirements: production must be deployed and reachable, and **both
   environments must share `AUTH_SECRET`** (the return URL is encrypted into the
   `state`). Understand what you are enabling: a preview deployment obtains a
   session minted through production's OAuth client. Only ever for previews of
   this repo.
3. **`DEV_PASSWORD_LOGIN` on previews — rejected.** W2-11 makes the flag
   inoperative when `NODE_ENV === 'production'`, which Vercel previews are. That
   is the point of W2-11, not an obstacle to work around.

### 4.5 Publishing

While in **Testing**, everything above works and only test users can sign in.
That is the correct posture through hardware testing.

To go public: get a real domain, point it at Vercel, verify it in Google Search
Console, add it as an Authorized domain, fill in App home page + Privacy policy
(`/privacy`) + Terms of service (`/terms`) on the Branding page, then
**Publish app** → *In production*. Because the scopes are all non-sensitive,
this does **not** enqueue a verification review and there is no security
assessment. The unverified-app interstitial ("Google hasn't verified this app")
goes away when the app is published, not when it is verified — verification is
a scopes thing.

There is no way to skip the real domain. `*.vercel.app` cannot be an authorized
domain, so "public release" and "buy a domain" are the same task. Flagged in
*Open questions*.

---

## 5. The token

### 5.1 Claims

Set once, at sign-in, in `auth.ts`'s `jwt` callback:

| Claim | Type | Source | Why it is worth its bytes |
|---|---|---|---|
| `sub` | string | Auth.js, from Google's `sub` | Set automatically. The real external identity. Never a foreign key. |
| `uid` | uuid | `users.id`, from the sign-in upsert | **The only key anything in the database uses.** Everything W3–W7 writes is keyed on this. |
| `onb` | boolean | `profiles.completed_at IS NOT NULL` | The onboarding gate runs in middleware. Without this it is a DB read per request. |
| `loc` | `'id' \| 'en'` | `users.locale` | W6 resolves locale as profile → cookie → `Accept-Language` → `'id'`. This is the "profile" step, free. |
| `abs` | number (epoch s) | now + `SESSION_ABSOLUTE_TTL_DAYS` | §6. The only bound on a stolen cookie. |
| `email` | string | Google | The "signed in as …" line and support. ~30 B. The cookie is encrypted, so this is not a disclosure. |
| `name` | string | Google `name` | Greeting copy. Short. |
| `picture` | — | **stripped to `null`** | See below. |
| `iat`/`exp`/`jti` | — | Auth.js | `jti` is a fresh uuid per re-encode, so it is not a stable session identifier and cannot be used for a revocation denylist across the sliding rotations. |

### 5.2 What it costs, measured

Not estimated. Encoded with `jose`'s `EncryptJWT` using the same header
`@auth/core` uses (`alg: dir`, `enc: A256CBC-HS512`, a 43-char `kid`
thumbprint), a 21-digit Google `sub`, a 29-char email, a 16-char name, and a
real-shaped `lh3.googleusercontent.com` avatar URL:

```
 176 B plaintext ->  441 B cookie value   Auth.js default, no picture
 279 B plaintext ->  569 B cookie value   Auth.js default + picture
 260 B plaintext ->  548 B cookie value   OURS, picture stripped     <-- ship this
 363 B plaintext ->  676 B cookie value   OURS + picture

chunk threshold: 4096 - 160 = 3936 B   (@auth/core lib/utils/cookie.js)
```

So the four claims we add cost **107 bytes** on every request, and stripping
`picture` gives 128 of them back. That is why W2-6 strips it: nothing in the
design renders a user avatar, `users.avatar_url` keeps the value, and it is the
single largest claim.

548 B is comfortably under 3936, so the cookie is **not chunked** — Auth.js
splits an oversized session into `authjs.session-token.0`, `.1`, … which works
but multiplies the per-request header cost and makes every future debugging
session harder. Task 3 adds a vitest that asserts the encoded length stays
below the threshold, so that a future claim addition fails a test instead of
silently chunking.

### 5.3 The `users` upsert, and how it obeys §6

Roadmap §6 says the auth path does not touch the database. The very first
sign-in must create a `users` row. These are not in conflict once you separate
the two paths:

- **The sign-in path** runs once per session — at most once per user per
  `SESSION_TTL_HOURS`, and in practice once a day. It is already a multi-second
  round trip through Google's consent screen. One indexed write is invisible
  inside it.
- **The request path** — every page render, every `POST /api/reading`, every
  middleware invocation — reads `uid` and `onb` out of the decoded token and
  touches nothing. That is the property §6 protects, and it is preserved
  exactly.

The write lives in `callbacks.jwt` under `trigger === 'signIn'`, not in
`callbacks.signIn`, because `signIn` returns a boolean and gives no way to
carry the resulting `users.id` into the token — you would have to write there
and read back here, two round trips for one row. `callbacks.signIn` is kept for
the one check that needs no I/O at all: refusing an unverified Google email.

It must be **one statement**. W1 owns it (see *Interfaces I need*), and it
should be a single insert-with-conflict-update that also joins `profiles`, so
sign-in costs one round trip and not three:

```sql
with u as (
  insert into users (google_sub, email, email_verified, display_name, avatar_url)
  values ($1, $2, $3, $4, $5)
  on conflict (google_sub) do update set
    email         = excluded.email,
    email_verified= excluded.email_verified,
    display_name  = excluded.display_name,
    avatar_url    = excluded.avatar_url,
    last_seen_at  = now()
  where users.deleted_at is null          -- a soft-deleted account does not resurrect
  returning id, locale
)
select u.id, u.locale, (p.completed_at is not null) as onboarded
from u left join profiles p on p.user_id = u.id;
```

Two properties worth naming:

- The `where users.deleted_at is null` on the conflict branch means a
  soft-deleted account **returns no row**, and the callback then refuses the
  sign-in. Erasure that can be undone by signing in again is not erasure, and
  W7's privacy policy will say so. Note the SQL subtlety: this is `do update …
  where`, which suppresses the update *and the `returning`* — it does not raise.
  Flagged for W1 to test explicitly, because "silently returns zero rows" is
  easy to get wrong.
- The upsert also refreshes `last_seen_at`, which §6 otherwise defers to
  `after()`. That is fine and cheaper — it is already in the statement.

Failure policy: **if the upsert throws, the sign-in fails.** This is the one
place in the app where a DB error must not be swallowed. A session with no
`uid` is worse than no session: every downstream write would take `undefined`
as a foreign key. Log it and return `null` from the callback.

### 5.4 Refreshing `onb` when onboarding completes

`onb` is in the token, so flipping it means re-minting the token. `NextAuth()`
returns `unstable_update` (verified on `NextAuthResult`), which is the
server-side path: W3's "onboarding complete" Server Action calls it, the `jwt`
callback runs with `trigger: 'update'`, the cookie is re-encoded, done. No
`SessionProvider`, no client round trip.

**The trap.** That same callback branch is reachable from the browser:
`POST /api/auth/session` with a JSON body is exactly what `useSession().update()`
does, and the body arrives as the `session` argument. A signed-in user who has
not done onboarding can therefore ask for `{ onboardingComplete: true }`. If the
callback trusts it, onboarding is one `curl` away from being optional — and
since the flag also gates `/api/reading`, that is the whole gate.

So the `trigger === 'update'` branch **ignores its payload entirely** and
re-reads the truth:

```ts
if (trigger === 'update') {
  const uid = readUid(token);
  if (!uid) return null;
  const gate = hit(`session-update:${uid}`, Date.now(), 20);  // existing limiter
  if (!gate.ok) return token;                                 // stale is fine, DoS is not
  token.onb = await isOnboardingComplete(uid);                // one indexed PK lookup
  token.loc = await ... ;                                     // same query, see W1 iface
  return token;
}
```

This costs one indexed primary-key lookup, on a path a user takes once in their
life, and it is unforgeable. `unstable_update({})` with an empty payload is
enough to trigger it, which is a good sign that the design is right: the client
supplies no data because none of it would be believed.

It reuses `src/lib/ratelimit.ts`'s `hit()` — W2 does not own that file, only
calls it — because otherwise an authenticated user can spin DB reads by
spamming the session endpoint. The key is namespaced so it does not share a
budget with the reading limiter.

`unstable_` is a real prefix on a real beta. If it is renamed or removed, the
fallback is the same DB read triggered from the client with
`useSession().update()`, which needs a `SessionProvider` around the onboarding
subtree only. The *callback* does not change either way, which is the point of
putting the truth in the callback rather than in the caller.

---

## 6. `SESSION_TTL_HOURS`, and the two expiries

`SESSION_MAX_AGE = 60 * 60 * 24 * 30` in `session.ts` dies here, along with its
comment ("Long on purpose: two people, each typing their password once"), which
is an honest description of a threat model that no longer applies.

### Where it plugs in

One place: `session.maxAge`, in seconds, in `config.ts`. Do **not** also set
`jwt.maxAge` — `@auth/core/lib/init.js:83` already defaults it to
`config.session?.maxAge`, and setting both is two places to forget.

```ts
session: { strategy: 'jwt', maxAge: sessionMaxAgeSeconds(process.env.SESSION_TTL_HOURS) }
```

`sessionMaxAgeSeconds()` lives in `ttl.ts`, is pure, and is defensive: a
missing, empty, zero, negative, non-numeric or absurd value falls back to 24
hours rather than producing a session that expires immediately or in the year
3000. It is unit-tested, because `SESSION_TTL_HOURS=` (set but empty, which is
what the roadmap's `.env.example` line literally shows for
`DEV_PASSWORD_LOGIN`) is an easy accident.

### How it interacts with `exp`

`session.maxAge` sets *both* the JWE's `exp` claim and the cookie's `Expires`
attribute, from the same `newExpires`. They cannot drift. Good.

### Sliding or hard?

**Sliding.** Not by preference — by what the library does.

`session.updateAge` (default 24h) is documented as the throttle on session
refresh. On the **database** path it is honoured. On the **JWT** path it is
never read: `lib/actions/session.js` unconditionally computes
`newExpires = fromDate(sessionMaxAge)`, re-encodes, and re-issues the cookie.
And because `handleAuth` copies those `Set-Cookie` headers onto the middleware
response, this happens on **every matched request** — every page navigation,
every non-excluded API call.

So `SESSION_TTL_HOURS=24` is a **24-hour idle timeout**, not a 24-hour cap. A
user who opens JMTarot once a day never signs in again. Setting `updateAge` will
not change this; do not add it and expect it to.

**Recommendation: keep it sliding.** For an app whose core loop is a daily card,
a hard 24-hour cap would sign people out mid-reading roughly once a day, and
the fix they would reach for is "make the TTL longer", which is worse.

### And therefore the absolute cap (W2-8)

Sliding alone has a bad property that §7 spells out: a cookie an attacker keeps
*using* never expires. So ship the cap too. It is genuinely five lines, and
crucially they are **pure**, so they live in `config.ts` and run on the edge:

```ts
// config.ts
callbacks: {
  jwt({ token }) {
    // Returning null makes @auth/core clean the session cookies (verified:
    // lib/actions/session.js, the `else` branch of `if (token !== null)`).
    if (absoluteCapExpired(token, nowSeconds())) return null;
    return token;   // SAME object. See §3.3.
  },
},
```

`token.abs` is *set* at sign-in in `auth.ts` (Node) and *checked* everywhere
(edge). Default 30 days, `SESSION_ABSOLUTE_TTL_DAYS`, and unset-or-zero means
no cap so the escape hatch exists.

Summary of the two numbers, because they are easy to conflate:

| | Env | Default | Meaning |
|---|---|---|---|
| Idle | `SESSION_TTL_HOURS` | 24 | Stop using the app for this long and you sign in again. Resets on every request. |
| Absolute | `SESSION_ABSOLUTE_TTL_DAYS` | 30 | You sign in again after this long no matter what. Never resets. |

---

## 7. What JWT sessions cannot do

Plainly, because this is the cost of D1's latency win and it should be written
down before anyone is surprised by it.

**There is no server-side revocation.** `signOut()` deletes the cookie in *that
browser*. It does not invalidate the token. A cookie copied off a device —
exfiltrated by malware, lifted from a backup, read out of a shared machine —
stays valid until it expires, and nothing the server does can stop it. There is
no "sign out everywhere", no admin kill switch, no "this phone was stolen"
button, and no session list. If the database is wiped and rebuilt, existing
cookies still authenticate; `uid` will simply point at nothing.

**Sliding makes the first half worse, which is why W2-8 exists.** With a
sliding 24-hour idle timeout and nothing else, a stolen cookie that the attacker
touches once a day is valid *forever*. The idle timeout bounds the exposure of a
cookie nobody is using, which is the case you care least about. The absolute cap
is what actually bounds the other one, and 30 days is the real number: that is
the worst case for a stolen session.

**The only global kill switch is rotating `AUTH_SECRET`, and it signs out
everyone.** `@auth/core` supports an ordered secret array for graceful rotation
(`AUTH_SECRET`, plus `AUTH_SECRET_1/2/3` which are unshifted to the front, so
the highest-numbered one present mints new sessions while the others still
decrypt old ones). Graceful rotation is for key hygiene. **Revocation** means
dropping the old secret immediately, and every user on the app is signed out
mid-session. That is the break-glass procedure and it should be written into the
runbook as such rather than discovered during an incident.

**What would have to change if revocation is ever needed**, cheapest first:

1. **A `users.token_version` integer**, bumped by "sign out everywhere", copied
   into the token at sign-in, compared in the `jwt` callback. Correct, simple,
   and costs a DB read on every request unless cached — which violates §6's
   first non-negotiable. Only viable with a cache in front, and now you have a
   cache invalidation problem.
2. **A denylist of revoked sessions** in edge-reachable KV with a TTL equal to
   the session max age. Cheap per request, but note that `jti` is **regenerated
   on every re-encode** (`setJti(crypto.randomUUID())` in `@auth/core/jwt.js`),
   so it is not a stable session identifier — you would have to add your own
   stable `sid` claim at sign-in first.
3. **`strategy: 'database'` plus a Drizzle adapter and a `sessions` table.**
   Real revocation, real session list, and a DB read on literally every request.
   This is the thing D1 was chosen to avoid.

None of these now. If one is ever needed, (2) with an added `sid` claim is the
one that does not break §6.

---

## 8. `src/middleware.ts`

### What it must keep

It stays at `src/middleware.ts`. CLAUDE.md is right and the reason is worth
repeating in the file: at the repo root it is **not an error**. Next finds
nothing, logs nothing, and every route in the application is open. There is no
symptom. Do not move it, and if a tool ever "helpfully" relocates it, the way to
notice is the smoke check in Task 11 — `curl -i localhost:3000/api/reading -X POST`
returning anything other than 401.

The `matcher` is unchanged:

```
'/((?!_next/|cards/|dukuns/|favicon|icon|apple-icon|manifest|sitemap|robots).*)'
```

with its existing comment, plus one addition: `cards/` is excluded *twice over*
— once because gating the art looks like missing artwork rather than an auth
bug, and once because CLAUDE.md's iframe-harness technique puts a scratch HTML
file under `public/cards/` specifically to land outside this matcher. That
harness is how the two worst bugs in this project were found. Narrowing the
matcher would remove the project's only way to drive its own UI, and the
connection is not obvious from either file alone.

### `isPublic` stays a function

The existing comment explains why: the obvious matcher — exclude `login` and the
static prefixes — still gates `/api/auth/login`, because that path does not
begin with `login`. The result is a login endpoint that 401s everyone, and the
failure looks like a wrong password.

**That reasoning gets stronger under Auth.js, and the comment should say so.**
Google's callback lands on `/api/auth/callback/google`. Gate it and the failure
is a *loop*: middleware sends the callback to `/login`, `/login` shows a button,
the button goes to Google, Google returns to `/api/auth/callback/google`,
middleware sends it to `/login`. Forever. Nothing logs an error and the only
visible fact is "Google login doesn't work". Deciding this in readable code
rather than inside a negative-lookahead regex is what makes it survivable.

New public set:

```ts
function isPublic(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/terms' ||
    pathname === '/privacy' ||
    pathname.startsWith('/api/auth/')
  );
}
```

`/terms` and `/privacy` must be public because the login page links to them and
a stranger has to be able to read the terms before agreeing to them. They are
also the two pages that stay statically renderable (W2-13).

### The onboarding gate

A signed-in user with `onb === false` is redirected to `/onboarding`. The check
reads `onb` from the decoded token, so it costs nothing (§5.1, §5.4).

Three exemptions, and each one is an infinite loop if forgotten:

- `/onboarding` itself, or the redirect targets itself.
- `/api/onboarding/*` (W3's), or the questionnaire cannot submit.
- everything in `isPublic`, which is already handled first.

And the inverse: a signed-in user with `onb === true` who visits `/onboarding`
is redirected to `/`. Onboarding is asked *exactly once* (§1 of the roadmap) and
leaving the route reachable invites a second run that would collide with
`profiles`' primary key. Whether W3 wants a deliberate re-run path is an open
question.

### The decision function

The routing logic is pure and lives in `gate.ts` so vitest can own it. Nothing
in it knows about `NextRequest` or `NextResponse`:

```ts
export type GateInput = { pathname: string; signedIn: boolean; onboarded: boolean };

export type GateDecision =
  | { kind: 'next' }
  | { kind: 'redirect'; to: '/login' | '/onboarding' | '/' }
  | { kind: 'json'; status: 401 | 403; error: string };

export function decide(input: GateInput): GateDecision;
```

`middleware.ts` is then a translator: call `decide`, build the response, and
attach `?callbackUrl=` on the `/login` redirect. It also keeps the existing
`url.search = ''` before setting that one parameter, so a stale query from the
original request cannot ride along.

The API/page split from the current file survives and gains a third case:

| Situation | Page request | `/api/*` request |
|---|---|---|
| No session | redirect `/login?callbackUrl=…` | `401 {"error":"Unauthorized"}` |
| Session, not onboarded | redirect `/onboarding` | `403 {"error":"Onboarding required"}` |
| Session, onboarded, on `/onboarding` | redirect `/` | n/a (exempt) |

401 and 403 are distinguished on purpose: the client needs to tell "your session
died, sign in again" from "finish onboarding first", and they lead to different
screens.

### One thing to leave alone

Middleware also evicts the legacy cookie. Anyone signed in to the current
deployment is carrying a `jmtarot_session` that nothing will ever read again;
delete it on the response so it does not sit in the jar for thirty days. Three
lines, and it is the only remaining use of `SESSION_COOKIE`.

---

## 9. Retiring the password login (D2)

### 9.1 Why not simply 404 the existing route

D2 says the route 404s without `DEV_PASSWORD_LOGIN=1`. Taken literally that
means keeping `src/app/api/auth/login/route.ts` behind a flag. That is wrong,
and the reason is worth spelling out because it looks like extra work for
nothing.

The old route mints a `jmtarot_session` cookie. The app now reads
`authjs.session-token`. So a flag-gated old route means the application accepts
**two different session formats**, one of which is a plain signed JWT and one of
which is an encrypted JWE with a completely different claim set — and middleware
would have to try both. Two session formats in one app is how holes happen.

It is also self-defeating: the dev login would no longer exercise the sign-in
upsert, the token shape, the onboarding flag or the gate. Every bug in the paths
that matter would be invisible locally and appear only in production.

### 9.2 What to build instead

A **Credentials provider**, registered only when the flag is on, added in
`auth.ts` and *not* in `config.ts`:

```ts
// auth.ts  (Node only)
const devLogin =
  process.env.DEV_PASSWORD_LOGIN === '1' && process.env.NODE_ENV !== 'production';

providers: [Google({ clientId: ..., clientSecret: ... }), ...(devLogin ? [Credentials({ ... })] : [])]
```

Its `authorize()` calls the existing `verifyCredentials()` unchanged and, on
success, returns a user whose id is a **synthetic sub**: `dev:miftah`. That
value flows into the same `jwt` callback, the same upsert, the same
`users.google_sub` column, and produces a real `users` row with a real uuid,
real onboarding and a real 548-byte JWE cookie. Local development exercises
production's code path end to end, which is the entire point.

`dev:` cannot collide with a real Google `sub` — Google's are digit strings —
and the prefix makes dev rows greppable in a local database. `users.email` is
`not null`, so use `<username>@localhost`.

Consequences:

- `src/app/api/auth/login/route.ts` and `src/app/api/auth/logout/route.ts` are
  **deleted**. Login is `signIn('credentials', …)`; logout is `signOut()`,
  which Auth.js handles at `/api/auth/signout`.
- Without the flag the provider is never registered, so
  `/api/auth/callback/credentials` resolves to no provider and Auth.js refuses
  it. That is strictly stronger than a 404 shim: the endpoint does not exist,
  rather than existing and lying. It is also not literally a 404, so it is
  flagged in *Open questions* for reconciliation to accept or veto.
- `middleware.ts` does not import the Credentials provider, so `bcryptjs`
  never enters the edge bundle. That is the whole reason the provider array
  differs between the two configs.

### 9.3 `bcryptjs`, `AUTH_USERS`, `users.ts`

- **`bcryptjs` stays in `dependencies`.** It is statically imported by
  `users.ts`, which `auth.ts` imports, so it ships in the Node lambda even when
  the flag is off — about 30 KB of pure JS, on a route that already pulls in the
  Anthropic SDK. Moving it to `devDependencies` would make `npm run build`
  resolve it (Vercel installs devDependencies at build time) and then ship a
  broken import. Not worth the cleverness.
- **`AUTH_USERS` stays**, dev-only, still needing `\$` escaping in `.env.local`
  and no escaping in the Vercel dashboard. **It must be deleted from Vercel's
  Production and Preview environments** as part of Task 12. Leaving a live
  password list in production for a route that no longer exists is the kind of
  thing that is embarrassing rather than dangerous right up until it is not.
  `.env.example` keeps it under a heading that says *local development only*.
- **`src/lib/auth/users.ts` and `users.test.ts` survive unchanged**, gaining a
  file header saying they are dev-only. Roadmap §4 marks `users.ts` as
  REPLACED; this plan keeps it, which is flagged in *Open questions*. The
  constant-time decoy hash and the fail-closed `parseUsers` are still correct
  and their comments are still the best explanation in the repo of why both
  matter.

### 9.4 What happens to `session.ts`

Roadmap §4 says KEPT. I checked what still calls it, and the honest answer is:
after this plan, **`SESSION_COOKIE` is the only export with a live caller** —
middleware, to evict the legacy cookie (§8).

`signSession` and `verifySession` have no remaining caller. I am not going to
invent one, and I am not going to leave a function named `verifySession` in a
codebase where Auth.js owns sessions — that name will send someone to the wrong
file at the worst possible moment. So:

- Rename the exports: `signSession` → `signToken`, `verifySession` →
  `verifyToken`, `SESSION_MAX_AGE` → deleted, `SESSION_COOKIE` →
  `LEGACY_SESSION_COOKIE`.
- Update the file header to say what it now is: the project's general-purpose
  HS256 sign/verify pair for short-lived signed strings that are deliberately
  **not** sessions.
- `session.test.ts` survives with the same assertions and a mechanical rename.
  Every one of its tests is still exactly the right test — especially
  *"returns null rather than throwing on junk input"* and *"rejects a token
  carrying no subject"*, whose comments explain a class of bug that applies to
  any token verifier.

The one concrete consumer in this release is **W7's account-erasure
confirmation link**, which wants a short-lived signed token that must not be a
session cookie. If W7 confirms it does not need it, delete `session.ts` and
`session.test.ts` at reconciliation rather than keeping them out of sentiment.
Flagged in *Open questions*.

---

## 10. The login page

One button. It is the first screen a stranger sees, on a phone, and it is the
only screen in the app whose job is to be trusted.

### Shape

A **server component** with a Server Action form (W2-12). No `'use client'`, no
`useState`, no `useRouter`, no `next-auth/react`, no `SessionProvider`. The
page ships zero auth JavaScript and works before hydration.

```tsx
// src/app/login/page.tsx  — server component
export default async function Login({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  if (await auth()) redirect('/');          // a signed-in user must not see a dead button
  // ...
  <form action={async () => { 'use server'; await signIn('google', { redirectTo }); }}>
}
```

`redirectTo` comes from `?callbackUrl=`, which middleware attached. **Validate
it**: accept only a string starting with a single `/` and not `//`. Auth.js's
default `redirect` callback already restricts to same-origin, but an open
redirect on a login page is worth two checks rather than one.

### Structure and slots

W7 writes the copy; W6 owns the catalog. This plan specifies the slots and where
they sit, top to bottom:

| Slot | Content | Notes |
|---|---|---|
| `login.eyebrow` | "Major Arcana" | Existing `.eyebrow`, gold hairlines both sides. Unchanged. |
| `login.title` | "JMTarot" | Existing `.title`. Unchanged. |
| `login.tagline` | one line, what this is | New. A stranger arrives with no context; the current page assumes you already know. |
| `login.googleButton` | "Masuk dengan Google" / "Continue with Google" | The button. |
| `login.error.*` | one line per Auth.js error code | See below. |
| `login.legal` | sentence with **two inline links** to `/terms` and `/privacy` | Must render as one sentence with two anchors, not three separate lines. |
| `login.disclaimer` | the entertainment-only line | CLAUDE.md requires it under every reading and on both pickers. This is the third place, and the first one anybody sees. |

Errors: when `pages.signIn` is set to `/login`, Auth.js sends failures back
there as `?error=<code>`. Handle at minimum `AccessDenied` (our `signIn`
callback refused — unverified email, or a soft-deleted account) and a generic
fallback covering `Configuration`, `OAuthCallbackError`, `Verification` and
anything future. **Never render the raw code.** Reuse the existing `.error`
element and its `role="alert" aria-live="polite"`.

### Styling

Everything from `src/theme/tokens.css`. `.shell`, `.card`, `.eyebrow` and
`.title` are reused verbatim. `.form`, `.field`, `.label` and `.input` are
deleted. The button reuses `.submit`'s exact declarations — `var(--gold-border)`,
`var(--gold-wash)`, `var(--ls-button)`, `var(--radius-chip)` — with
`display:flex; align-items:center; gap:10px; justify-content:center` for the
mark. Two new rules, both composed from existing custom properties:
`.legal` (`--font-body`, `--muted`, links in `--gold`, centred, ~13px) and
`.tagline` (`--fs-hint`, `--muted`, italic). No new hex values.

**One exception, stated so nobody "fixes" it:** Google's four-colour "G" is a
trademark asset, not a design token, and its hexes are Google's. It goes in as
an **inline SVG** at 18px inside the button, with a comment saying exactly that.
Inline, because a strict no-external-hosts posture is already load-bearing here
and a remote logo would be the only third-party request the app makes.

---

## 11. Testing without a browser

There is no Playwright and there must not be. Chromium cannot launch in this
WSL image. The honest division:

### Unit-testable, and therefore mandatory (vitest)

1. **`gate.decide()`** — the whole point of extracting it. A table, one row per
   line of the §8 table, plus: `/` signed out; `/login` signed out (`next`) and
   signed in (`redirect '/'` — handled in the page, so `decide` returns `next`
   and the page redirects); `/terms` and `/privacy` signed out; `/api/auth/callback/google`
   signed out; `/api/reading` signed out (401) and un-onboarded (403);
   `/onboarding` un-onboarded (`next`) and onboarded (`redirect '/'`);
   `/api/onboarding/answer` un-onboarded (`next`). If a future change to the
   public set breaks the Google callback, this test says so in milliseconds.
2. **`sessionMaxAgeSeconds()`** — `undefined`, `''`, `'0'`, `'-1'`, `'abc'`,
   `'Infinity'`, `'0.5'`, `'24'`, `'100000'`. Default 24 h, clamped, never NaN.
3. **`absoluteCapExpired(token, now)`** — absent `abs`, future `abs`, past
   `abs`, `abs` of the wrong type.
4. **`readToken(unknown)`** — the runtime narrowing. Must reject a token with
   no `uid`, a `uid` that is not a uuid, and a token minted before this change.
   This is what stops `undefined` reaching a SQL query as a foreign key.
5. **`maySignIn({ emailVerified })`** — pure, and it is a security control.
6. **The cookie size** (`token.size.test.ts`). Encode a representative claim set
   with `@auth/core/jwt`'s real `encode`, assert the result is under 3936 bytes.
   Turns §5.2's measurement into a regression test: a future claim addition
   fails here rather than silently chunking the session cookie.
7. **`users.test.ts` and `session.test.ts`** — both still pass, modulo the
   rename in §9.4. If they do not, something moved that should not have.

`decide()` and `readToken()` between them mean the gate — the security-relevant
half of this workstream — is covered without a browser at all.

### Semi-automatable

CLAUDE.md's **iframe harness** under `public/cards/` still works, once it can
plant a valid cookie. That needs a dev-only route (Task 11):
`POST /api/auth/dev-session`, gated by the same
`DEV_PASSWORD_LOGIN && NODE_ENV !== 'production'` predicate, which mints a real
Auth.js JWE with `@auth/core/jwt`'s `encode` (salt = the cookie name) and sets
it. Without this the harness dies with the password login, and with it the
project loses the technique that caught its two worst bugs. This route is not
optional.

`curl` covers the rest of the gate: 401 on `/api/reading` with no cookie, 403
with an un-onboarded one, 200 with a good one, and a 302 to `/login` on `/`.

### Genuinely requires a human clicking Google, once

Nothing below can be faked and each has caught real deployments:

- **The consent screen renders and says "JMTarot".** A wrong project or a blank
  Branding page shows a raw client id to a stranger.
- **`redirect_uri_mismatch`.** Google-side, unreproducible locally, and the
  error page does not tell you which URI it wanted (it is in the `redirect_uri`
  query parameter of the URL you were sent to).
- **A `users` row appears with the right `google_sub`,** and a second sign-in
  updates rather than duplicates it.
- **PKCE / state / nonce cookies survive the round trip on iOS Safari.** They
  are `SameSite=Lax` with a 15-minute max-age; Google returns via GET so Lax is
  correct in theory, but ITP is worth one real check.
- **Add to Home Screen, then sign in from standalone mode.** *This is the
  largest unverified risk in W2.* In iOS standalone mode, navigating to another
  origin (accounts.google.com) can hand the user to Safari or an in-app browser,
  and the session cookie can land in a jar the standalone shell cannot see. The
  failure is "sign-in works in Safari, and the installed app can never sign in",
  which would break the product's whole delivery model. It cannot be tested in
  WSL, in Windows Chrome, or on a simulator that does not exist. It belongs
  alongside Task 15 of the rewrite plan, on real hardware, against a preview
  URL, before anything is called done.

### And always

`npm run build`, not just `npm run typecheck`. CLAUDE.md explains the
TypeScript-7 trap; this workstream adds a second reason, which is that the
edge/Node split of §3 is a **bundling** property. `tsc --noEmit` is perfectly
happy with a `pg` import in middleware. Only the build is not.

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck && npm test && npm run build
```

---

## Tasks

### Task 1 — Install and pin, and lay in the environment

**Files:** `package.json`, `.env.example`, `.env.local` (untracked), `docs/DEPLOY-VERCEL.md`

**Build.** `npm install next-auth@5.0.0-beta.32` — **exact, no caret** (W2-1).
Confirm `node -v` is 24.18.0 first; a Next 16 install under node 20 fails in a
way that looks like a dependency problem. Add the new keys to `.env.example`
under an *Auth (Google)* heading, next to the existing `\$`-escaping warning,
which now also has to say that `AUTH_USERS` is local-only. Update
`docs/DEPLOY-VERCEL.md`'s six-variable table.

**Verify.** `npm run build` passes with nothing yet importing next-auth (this
establishes the baseline — if it fails here it is not your code). `git diff
package-lock.json` shows a pinned `5.0.0-beta.32` and `@auth/core@0.41.3`.

---

### Task 2 — Google Cloud console

**Files:** none. This is §4, executed, by a human, once.

**Build.** §4.1 through §4.4. Project, Branding, Audience → External →
Testing → test users, three non-sensitive scopes, one Web application client,
the four redirect URIs. Put the client id and secret in `.env.local`.

**Verify.** In the Clients list, the redirect URI list contains
`http://localhost:3000/api/auth/callback/google` character for character. Take a
screenshot of the scopes page — it is the artefact that proves nothing sensitive
was requested, and it is what you will want when publishing.

---

### Task 3 — The pure core, test-first

**Files:** create `src/lib/auth/ttl.ts`, `gate.ts`, `token.ts` and a `.test.ts`
beside each.

**Build.** Write the tests from §11 items 1–5 first and watch them fail.
`ttl.ts` exports `sessionMaxAgeSeconds()` and `absoluteCapSeconds()`. `gate.ts`
exports `isPublic()`, `isOnboardingExempt()` and `decide()`. `token.ts` exports
the `JmtarotToken` type, `readToken()`, `readUid()`, `absoluteCapExpired()` and
`maySignIn()`. **None of these three files imports `next-auth`, `next/server`,
or anything under `@/lib/db`** — that constraint is what makes them testable and
what keeps the edge bundle small, and it is worth an assertion in the file
headers.

**Verify.** `npm test -- auth`. All green, and `grep -rn "next-auth\|@/lib/db"
src/lib/auth/{ttl,gate,token}.ts` returns nothing.

---

### Task 4 — `config.ts`, the edge-safe half

**Files:** create `src/lib/auth/config.ts`.

**Build.** `authConfig: NextAuthConfig` with `providers: [Google({ clientId:
process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })]`
(statically named — §3.5), `session: { strategy: 'jwt', maxAge:
sessionMaxAgeSeconds(...) }`, `pages: { signIn: '/login' }`, and the single pure
`jwt` callback of §6 that returns `token` or `null`. **No `authorized` callback**
— the gate is `decide()` in middleware, where it can build a `?callbackUrl`, and
splitting the decision across two mechanisms would be worse than either.
The file header carries the §3.3 rule verbatim.

**Verify.** `npm run build`. Nothing imports it yet, but a stray Node-only
import shows up now rather than in Task 7.

---

### Task 5 — `auth.ts`, the Node half, and the route handler

**Files:** create `src/lib/auth/auth.ts`,
`src/app/api/auth/[...nextauth]/route.ts`.

**Build.** `NextAuth({ ...authConfig, callbacks: { ...authConfig.callbacks,
signIn, jwt, session } })`, where `jwt` **awaits `authConfig.callbacks.jwt`
first** and returns `null` if it did (composition, not replacement — §6). The
`trigger === 'signIn'` branch calls W1's `upsertUserOnSignIn`, sets `uid`/`onb`/
`loc`/`abs`, and nulls `picture`. The `trigger === 'update'` branch does §5.4.
`signIn` refuses unverified emails. Export `handlers`, `auth`, `signIn`,
`signOut`, `unstable_update`. The route handler is
`export const runtime = 'nodejs'; export const { GET, POST } = handlers;`.

Blocked on W1's query. Until it lands, stub it behind the exact signature in
*Interfaces I need* so the rest of the workstream is not blocked.

**Verify.** `npm run build`. Then, once W1 has landed, sign in for real and
`select id, google_sub, email, last_seen_at from users;` shows exactly one row.
Sign in a second time: still one row, `last_seen_at` moved.

---

### Task 6 — `server.ts` and `viewer.tsx`

**Files:** create `src/lib/auth/server.ts`, `src/lib/auth/viewer.tsx`.

**Build.** Exactly the signatures in *Interfaces I export*. `server.ts`
deliberately does **not** re-export `handlers` — the only importer of those is
the route handler, and keeping them apart means a page that imports
`requireUser` does not drag the whole OAuth machine into its module graph.
`viewer.tsx` is `'use client'` and is *not* mounted in the root layout (W2-13).

**Verify.** `npm run build`, and confirm `/terms` and `/privacy` (once W7 has
them) still appear as static in the build output's route table. If they went
dynamic, something called `auth()` above them.

---

### Task 7 — Rewrite `src/middleware.ts`

**Files:** edit `src/middleware.ts`.

**Build.** §8. `NextAuth(authConfig).auth(...)` as the wrapper, `decide()` for
the logic, the `?callbackUrl` attachment, the legacy-cookie eviction, and the
matcher and both long comments preserved and extended.

**Verify.** `npm run build` — this is the build that catches a bad split, and it
is the reason §3 is written the way it is. Then by hand, in a clean profile:
`/` → `/login`; `curl -i -X POST localhost:3000/api/reading` → 401 not 500;
`/cards/the-fool.webp` → 200 with no redirect; `/terms` → 200 signed out.

---

### Task 8 — The login page

**Files:** rewrite `src/app/login/page.tsx`, edit `src/app/login/login.module.css`.

**Build.** §10. Delete the two fields, the client directive and the fetch. Add
the Server Action form, the inline Google mark, the legal slot and the
disclaimer. Delete `.form`, `.field`, `.label`, `.input` from the CSS.

**Verify.** `tools/shot.sh /login 390 844 /tmp/login.png` and read it back —
but read `tools/shot.sh`'s header first, because Windows clamps a Chrome window
to ~500px and a `--window-size=375` shot is a crop, not a phone. Then check the
computed styles against `tokens.css` and confirm the button's tap target is at
least 44px tall. `grep -c '#' src/app/login/login.module.css` should not have
grown except for the SVG, which is in the TSX.

---

### Task 9 — `/api/reading` and the rate-limit key

**Files:** edit `src/app/api/reading/route.ts`.

**Build.** Delete the hand-rolled cookie split and `verifySession` call. Replace
with:

```ts
const gate = await requireUser();
if (!gate.ok) return gate.response;
const rl = hit(gate.user.id);
```

**The rate-limit key changes from a username to `users.id`.** It must be
`user.id`, not `googleSub` — everything else in the system keys on `users.id`
and a second identity for one purpose is a bug waiting to be written. The
`{ ok: true | false }` shape of `requireUser` deliberately mirrors `hit()`'s, so
the two guards at the top of the handler read the same way. Keep the existing
comment about why the username (now the id) rather than an IP.

**Verify.** `npm test` (the ratelimit tests are key-agnostic and must still
pass), then a real reading end to end, then `curl` with no cookie → 401.

---

### Task 10 — Retire the password login

**Files:** delete `src/app/api/auth/login/route.ts`,
`src/app/api/auth/logout/route.ts`. Edit `src/lib/auth/auth.ts`,
`src/lib/auth/users.ts` (header only), `src/lib/auth/session.ts`,
`src/lib/auth/session.test.ts`.

**Build.** §9. The Credentials provider behind
`DEV_PASSWORD_LOGIN === '1' && NODE_ENV !== 'production'`, the `dev:` synthetic
sub, the `session.ts` rename, dev-only headers on `users.ts`.

**Verify.** With the flag set, a dev login produces an `authjs.session-token`
cookie and a `users` row with `google_sub = 'dev:miftah'`. With the flag unset,
`curl -i -X POST localhost:3000/api/auth/callback/credentials` does not
authenticate. `npm test` — `users.test.ts` and `session.test.ts` both still
green.

---

### Task 11 — The dev session route, and drive the real page

**Files:** create `src/app/api/auth/dev-session/route.ts`, and a scratch harness
under `public/cards/`.

**Build.** §11's semi-automatable section. The route mints a real Auth.js JWE
with `@auth/core/jwt`'s `encode` (salt = the cookie name, `maxAge` = the
configured TTL) and sets the cookie. Gated by the same predicate as Task 10 and
**never** reachable in a deployment. The harness plants a cookie via that route,
loads the app in a same-origin iframe, and asserts the gate behaves.

**Verify.** The harness, run against `npm run dev`, reaches the draw screen
without Google. Then confirm the route 404s when the flag is unset — this one
really must be a 404, because unlike the credentials provider it is a route we
wrote.

---

### Task 12 — Deploy, and hardware

**Files:** `docs/DEPLOY-VERCEL.md`.

**Build.** In Vercel: set `AUTH_SECRET` (Production **and** Preview — §3.5),
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `SESSION_TTL_HOURS`,
`SESSION_ABSOLUTE_TTL_DAYS`, and `AUTH_URL` per environment. **Delete
`AUTH_USERS` from Production and Preview**, and leave `DEV_PASSWORD_LOGIN`
unset everywhere. Remember: **no `\$` escaping in the Vercel dashboard**, the
values there are literal. Register the branch alias with Google (§4.4).

**Verify.** Everything in §11's *requires a human* list, on a real iPhone,
against the preview URL — including, above all, sign-in from a home-screen
installed instance in standalone mode.

---

## Schema deltas

**None.** This workstream reads and writes only §3's `users` and reads
`profiles.completed_at`, both exactly as §3 defines them. No new tables, no new
columns, no changed types.

Three notes on §3's `users` that this workstream depends on and that W1 should
therefore not soften:

- **`google_sub text unique not null`** — the `unique` is the conflict target of
  the sign-in upsert. Without it the upsert cannot be one statement and every
  sign-in creates a duplicate row.
- **`locale text not null default 'id'`** — read at sign-in into the `loc`
  claim. The default matters: a brand-new user has no `profiles` row and no
  stated preference, and `'id'` is the correct fallback per D6.
- **`deleted_at`** — the sign-in upsert's `where users.deleted_at is null`
  makes a soft-deleted account unable to resurrect itself by signing in again
  (§5.3). If W7's erasure design wants different semantics, this is the one
  line to change.

If W3 discovers it needs a value in the token beyond `onb`, that is a token
delta rather than a schema delta and it goes through W2 — see *Open questions*.

---

## Interfaces I export

### Server: the current user

```ts
// src/lib/auth/server.ts        NODE ONLY. Never import from middleware.
import type { NextResponse } from 'next/server';

export type Locale = 'id' | 'en';

export type CurrentUser = {
  /** users.id. The ONLY key any table in the schema is joined on. */
  id: string;
  /** Google's OIDC `sub`, or `dev:<name>` under DEV_PASSWORD_LOGIN.
   *  Stable, but never a foreign key. Use `id`. */
  googleSub: string;
  email: string;
  displayName: string | null;
  locale: Locale;
  onboardingComplete: boolean;
};

/**
 * The current user, or null. Never throws. Reads the JWE cookie only — NO
 * DATABASE. Safe in a server component, a route handler, or a server action.
 */
export function currentUser(): Promise<CurrentUser | null>;

/**
 * The route-handler form. The `{ ok }` shape deliberately mirrors
 * `hit()` in src/lib/ratelimit.ts, so the two guards at the top of a handler
 * read identically:
 *
 *   const gate = await requireUser();
 *   if (!gate.ok) return gate.response;
 *   const rl = hit(gate.user.id);
 *   if (!rl.ok) return ...
 *
 * `requireOnboarding` defaults to TRUE. Fail closed: a handler that forgets to
 * think about onboarding gets the safe behaviour.
 */
export type AuthGate =
  | { ok: true; user: CurrentUser }
  | { ok: false; response: NextResponse };

export function requireUser(opts?: { requireOnboarding?: boolean }): Promise<AuthGate>;
```

**Every other workstream that needs "who is this, on the server" calls
`requireUser()` in a route handler or `currentUser()` in a server component.
Nothing else. Do not call `auth()` directly and do not read the cookie.**

### Server: the Auth.js handles

```ts
// src/lib/auth/auth.ts          NODE ONLY.
export const handlers: { GET: (req: NextRequest) => Promise<Response>;
                         POST: (req: NextRequest) => Promise<Response> };
export const auth: /* NextAuthResult['auth'] */;
export const signIn:  NextAuthResult['signIn'];
export const signOut: NextAuthResult['signOut'];

/**
 * W3 calls this from its "onboarding complete" server action. The payload is
 * IGNORED by design (§5.4) — pass {}. It forces the jwt callback to re-read
 * onboarding state from the database and re-mint the cookie.
 */
export const refreshSession: () => Promise<Session | null>;   // wraps unstable_update({})
```

### Client components

```tsx
// src/lib/auth/viewer.tsx       'use client'
export type Viewer = {
  id: string;
  displayName: string | null;
  locale: Locale;
  onboardingComplete: boolean;
};

export function ViewerProvider(props: { value: Viewer | null; children: ReactNode }): JSX.Element;

/** Throws if there is no provider or no viewer. For signed-in subtrees only. */
export function useViewer(): Viewer;

/** For subtrees that also render signed-out — /login, /terms, /privacy. */
export function useOptionalViewer(): Viewer | null;

/** Narrows a CurrentUser to what is safe to hand a client component. */
export function toViewer(u: CurrentUser | null): Viewer | null;   // exported from server.ts
```

**Mounting rule, and it is a rule, not a preference (W2-13):** the provider is
mounted by the **server page that owns the client subtree**, never by
`src/app/layout.tsx`. Calling `auth()` in the root layout makes the whole app
dynamic — including `/terms` and `/privacy`, the two pages a stranger loads and
the two that should be static. `email` is deliberately absent from `Viewer`;
if a client component needs it, that is a conversation, not a field addition.

```tsx
// the pattern, in a server page:
const user = await currentUser();
return <ViewerProvider value={toViewer(user)}><Draw /></ViewerProvider>;
```

`next-auth/react`'s `SessionProvider` and `useSession` are **not used anywhere**
and should not be introduced. They add the library to the client bundle and a
`/api/auth/session` fetch on mount to deliver data the server already had.

### Pure helpers, importable from anywhere including the edge

```ts
// src/lib/auth/gate.ts
export type GateInput    = { pathname: string; signedIn: boolean; onboarded: boolean };
export type GateDecision =
  | { kind: 'next' }
  | { kind: 'redirect'; to: '/login' | '/onboarding' | '/' }
  | { kind: 'json'; status: 401 | 403; error: string };

export function isPublic(pathname: string): boolean;
export function isOnboardingExempt(pathname: string): boolean;
export function decide(input: GateInput): GateDecision;

// src/lib/auth/ttl.ts
export function sessionMaxAgeSeconds(raw?: string): number;   // default 86400
export function absoluteCapSeconds(raw?: string): number;     // default 2592000, 0 = no cap

// src/lib/auth/token.ts
export type JmtarotToken = {
  sub: string; uid: string; email: string; name: string | null;
  onb: boolean; loc: Locale; abs?: number;
};
export function readToken(t: unknown): JmtarotToken | null;
export function readUid(t: unknown): string | null;
export function absoluteCapExpired(t: unknown, nowSeconds: number): boolean;
export function maySignIn(p: { emailVerified: boolean }): boolean;
```

### Constants other workstreams may need

```ts
// src/lib/auth/config.ts
export const SESSION_COOKIE_NAME: string;   // 'authjs.session-token', '__Secure-'-prefixed on https

// src/lib/auth/session.ts   (see §9.4)
export const LEGACY_SESSION_COOKIE = 'jmtarot_session';
export function signToken(subject: string, secret?: string, expiresIn?: string | number): Promise<string>;
export function verifyToken(token: string | undefined, secret?: string): Promise<string | null>;
```

---

## Interfaces I need

### From W1 — data layer

**One query, and it is on the sign-in critical path, so it should be one
statement (§5.3):**

```ts
// src/lib/db/queries/profile.ts
export type SignInUpsertResult = {
  id: string;                 // users.id
  locale: 'id' | 'en';
  onboardingComplete: boolean;  // profiles.completed_at IS NOT NULL
};

/** Returns null when the account exists but is soft-deleted. Throws on a real
 *  DB error — the caller turns that into a failed sign-in, never a session
 *  with no user id. */
export function upsertUserOnSignIn(input: {
  googleSub: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}): Promise<SignInUpsertResult | null>;
```

**And one read, for the `trigger === 'update'` branch (§5.4):**

```ts
export function readSessionFacts(userId: string): Promise<{
  locale: 'id' | 'en';
  onboardingComplete: boolean;
} | null>;
```

Both live under `src/lib/db/queries/`, which W1 owns. Neither is called from
middleware; both are called only from `src/lib/auth/auth.ts`, which is Node-only
— **W1 must not import `src/lib/auth/**` in return**, or the module graph loops
back into the edge bundle and §3 unravels.

I also need `src/lib/db/client.ts` to be safe to import from a route handler
without a top-level connection attempt, so that `npm run build` does not need a
database.

### From W3 — onboarding

- After onboarding completes, **call `refreshSession()`** from the server action
  that sets `profiles.completed_at`. Do not set the flag any other way — the
  token is the gate and the DB is the truth, and `refreshSession()` is what
  reconciles them.
- Tell me the exact prefix of onboarding's API routes so `isOnboardingExempt()`
  can list it. I have assumed `/api/onboarding/`.
- Confirm `/onboarding` never needs to be reachable by a user who has already
  completed it, or tell me what the re-run path is (see *Open questions*).
- If onboarding needs anything from the token beyond `onb`, ask — do not add a
  claim. Every claim is bytes on every request and §5.2 has the numbers.

### From W6 — i18n

- `Locale = 'id' | 'en'` should be **W6's exported type**, and `server.ts`,
  `viewer.tsx` and `token.ts` should import it rather than each declaring a
  union. Until W6 lands I declare it locally; swapping it is a one-line change
  in three files.
- `users.locale` is read at sign-in into the `loc` claim, so W6's `resolve.ts`
  gets the profile-level locale free from `currentUser().locale` with no DB
  read. Cookie and `Accept-Language` remain W6's steps.
- The login page, `/terms` and `/privacy` render **before** there is a session,
  so their locale must resolve from cookie/`Accept-Language` only. W6 owns that
  fallback; I own calling it.
- If a user changes locale, `users.locale` changes and `loc` in the token goes
  stale. `refreshSession()` fixes it the same way onboarding does.

### From W7 — trust, safety, copy

- The copy for every slot in §10's table, in both locales, plus the
  Auth.js error strings.
- `/terms` and `/privacy` must be **statically renderable** — no `auth()`, no
  `cookies()`, no `currentUser()` in them or in any layout above them. They are
  the only two pages a stranger loads and Google's Branding page will link to
  them.
- Confirm whether the account-erasure flow needs `signToken`/`verifyToken` from
  `session.ts`. If not, that file and its test should be deleted (§9.4).
- The secrets audit should specifically check that `AUTH_GOOGLE_SECRET` and
  `AUTH_SECRET` never appear in a client bundle. The `ViewerProvider` value is
  the one auth-shaped object that deliberately crosses to the client; it carries
  four fields, no email, and no token.

---

## New environment variables

Beyond roadmap §4. Everything in §4 is used as specified; these are additions
and clarifications.

```
SESSION_ABSOLUTE_TTL_DAYS=30    # NEW (W2-8). Hard cap, never slides. 0 or unset = no cap.
                                # The only thing that bounds a stolen cookie (§7).

AUTH_SECRET_1=                  # NEW, optional. Graceful secret rotation.
AUTH_SECRET_2=                  # @auth/core unshifts these ahead of AUTH_SECRET, so the
AUTH_SECRET_3=                  # HIGHEST-NUMBERED one present mints new sessions and the
                                # rest still decrypt old ones. Leave unset normally.

AUTH_REDIRECT_PROXY_URL=        # NEW, optional, PREVIEW ONLY. §4.4 option 2. Do not set
                                # until there is a production domain. Requires the same
                                # AUTH_SECRET as production.
```

Clarifications to §4's existing names, all of which are load-bearing:

| Name | Clarification |
|---|---|
| `AUTH_SECRET` | Must be set in **Preview** as well as Production. Missing it produces "signed in, then bounced to /login forever" with a 200 in the log, not an error (§3.5). |
| `AUTH_URL` | Per-environment. Local `http://localhost:3000`. Preview: the **stable branch alias**, not the per-deployment URL (§4.4). Production: the real domain. On Vercel it also implies `trustHost`. |
| `SESSION_TTL_HOURS` | Idle timeout, sliding, **not** a cap. Read at module scope in `config.ts`, which the edge bundle inlines, so changing it in the Vercel dashboard **needs a redeploy**. |
| `DEV_PASSWORD_LOGIN` | `'1'` only, **and** `NODE_ENV !== 'production'` (W2-11). Inoperative in any Vercel deployment, preview included. Never set it there. |
| `AUTH_USERS` | Local development only after D2. **Delete it from Vercel Production and Preview** (Task 12). Keeps its `\$` escaping in `.env.local`, keeps its literal `$` in the dashboard for as long as it is still there. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Referenced **statically** in `config.ts` rather than left to Auth.js's dynamic `AUTH_${ID}_ID` lookup, so Next can inline them into the edge bundle (§3.5). |

---

## Open questions for reconciliation

1. **`users.ts` is marked REPLACED in roadmap §4; I am keeping it.** §9 argues
   that a dev login which does not produce a real Auth.js session is worse than
   no dev login, and the cleanest way to get one is a Credentials provider
   calling the existing `verifyCredentials()`. That keeps `users.ts`,
   `users.test.ts` and `bcryptjs`. Raising this rather than quietly diverging.
2. **D2 says the password route "404s" without the flag; I am deleting the route
   entirely.** With a Credentials provider the endpoint does not exist at all
   when the flag is off, which is stronger — but it is not literally a 404, and
   D2 is a settled decision. Accept or veto.
3. **`session.ts`'s jose helpers have no caller after this plan.** §9.4 keeps
   and renames them on the assumption that W7's account-erasure link wants a
   short-lived signed non-session token. **W7 must confirm.** If not, delete
   `session.ts` and `session.test.ts` and amend §4 of the roadmap.
4. **`SESSION_ABSOLUTE_TTL_DAYS` is a new variable and D3 only named one.** §6
   and §7 argue it is necessary — a purely sliding session that an attacker keeps
   warm never expires — and it is five pure lines. Confirm 30 days, or set a
   different number. It is the single number that bounds a stolen cookie.
5. **A production domain is not optional and is not currently anywhere in the
   roadmap.** `*.vercel.app` cannot be a Google Authorized domain (it is a
   public suffix and cannot be verified in Search Console), so publishing the
   consent screen out of Testing requires a real domain with `/terms` and
   `/privacy` on it. This is a purchase and a DNS change, and it sits between
   "everything is built" and "a stranger can sign in". D5 defers the *database*
   host; it does not cover this. Needs a decision and an owner.
6. **Should `/onboarding` be re-runnable?** I redirect a completed user to `/`,
   because §1 says onboarding is asked exactly once and `profiles` is keyed on
   `user_id`. If W3 wants an "edit your answers" path it needs a different route
   or a query flag, and `decide()` needs to know about it.
7. **Erasure semantics.** §5.3's upsert refuses a soft-deleted account rather
   than resurrecting it. That is my reading of what a "right to erasure" in the
   T&C has to mean, but it is W7's call, and it determines whether a user who
   deletes their account can ever come back — including as a *new* user, which
   they currently cannot, because `google_sub` is unique and the old row still
   holds it. That is a real product question, not a schema detail.
8. **Who owns `src/lib/ratelimit.ts`?** No workstream claims it. W2 calls it
   from the `trigger === 'update'` branch with a namespaced key, and W4 will
   want to count against it too. It probably wants a named owner before three
   plans each add a key format.
9. **`next-auth@5.0.0-beta.32` is a two-year-old beta.** Pinning is the right
   move now. But there is no v5 stable and no date for one, and pinning a beta
   forever is a decision with a shelf life. Worth a note in the risk table
   rather than a surprise in six months.

---

## Summary for the other six workstreams

**What I decided.** Auth.js v5 pinned at `5.0.0-beta.32`, Google only, JWT
sessions. The config splits three ways — `gate.ts`/`ttl.ts`/`token.ts` pure,
`config.ts` edge-safe, `auth.ts` Node-only — because middleware executes
`callbacks.jwt` on every request and re-issues the session cookie from whatever
it returns. The `users` row is written once, in the `signIn` branch of the jwt
callback, in one statement; `users.id` lands in the token as `uid` and every
later request is database-free. Sessions are 24-hour sliding idle timeouts
(`SESSION_TTL_HOURS`) with a 30-day hard cap (`SESSION_ABSOLUTE_TTL_DAYS`, new).
The password login becomes a dev-only Credentials provider so local development
exercises the real path; both hand-rolled auth routes are deleted.

**The three things you need from me.**

1. **Server-side user:** `import { requireUser } from '@/lib/auth/server'` in a
   route handler, `currentUser()` in a server component. Both are DB-free.
   `requireUser()` returns `{ ok: true, user }` or `{ ok: false, response }` —
   the same shape as `hit()` — and it requires completed onboarding by default.
   **`user.id` is `users.id` and it is the only key anything joins on.** Do not
   call `auth()` yourself and do not read the cookie.
2. **Client-side user:** `useViewer()` from `@/lib/auth/viewer`, filled by the
   server page that owns the subtree via `<ViewerProvider value={toViewer(user)}>`.
   Never mount it in the root layout — `/terms` and `/privacy` must stay static.
   No `SessionProvider`, no `useSession`.
3. **Locale and onboarding both live in the token.** W6 gets
   `currentUser().locale` free. W3 must call `refreshSession()` after setting
   `profiles.completed_at`, or the middleware gate will keep redirecting a
   finished user back to onboarding. W6 must do the same if a user changes
   locale.

**Two things that will bite you if I do not say them here.** Anything imported
by `src/middleware.ts` — transitively, through `config.ts` — lands in the edge
bundle, so **W1 must never import `src/lib/auth/**`**, or the loop pulls `pg`
onto the edge. And `npm run typecheck` cannot see any of this: the split is a
bundling property, so `npm run build` is the only check that catches it.

**Open, and blocking someone.** W1 owes me two queries
(`upsertUserOnSignIn`, `readSessionFacts`) — Task 5 is stubbed until they land.
W7 owes me every string on the login page, and a yes/no on whether
`session.ts`'s jose helpers have a consumer. And someone owes the project a
**real domain**: `*.vercel.app` cannot be a Google Authorized domain, so the gap
between "built" and "a stranger can sign in" is a purchase, not a deploy.
