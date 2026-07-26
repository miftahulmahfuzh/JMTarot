# W2 — Google auth: implementation review

**Written 2026-07-26, immediately after the workstream was built, for whoever
touches this code next.** It is a companion to
`docs/plans/2026-07-26-google-auth.md`, not a replacement: the plan is still the
argument for every decision, and it has been corrected inline where it was wrong.
This file records what actually happened — what cost time, what shipped broken and
looked fine, and what is still unverified.

Read in this order:

1. `CLAUDE.md`'s `## Auth` section and the AAAA trap in `## Traps`. Both are the
   compressed version of this file and both are the version that gets read.
2. The plan. Its header now says **BUILT** and lists four corrections; §1 carries
   an inline `CORRECTED DURING IMPLEMENTATION` block about `checks`.
3. This file, for the reasoning behind those corrections and for the WSL section,
   which is not in the plan at all because nobody could have planned it.

Precedence is unchanged: `docs/plans/2026-07-26-RECONCILIATION.md` → the roadmap →
the plan. This review outranks nothing. Where it contradicts the code, the code is
right and this file is stale.

**Final state.** `npm run typecheck` clean. 142 unit tests in 12 files, 17
integration tests, `npm run build` clean. Google sign-in verified end to end
locally against Google Cloud project `jmtarot`, consent screen External +
**Testing**, three non-sensitive scopes, client id
`657723640479-eivprlefar0ppb6v386p4dc1oqb3moqu.apps.googleusercontent.com`.
`next-auth@5.0.0-beta.32` pinned exactly, resolving `@auth/core@0.41.3`. Node
24.18.0 from `~/tools/node-v24.18.0-linux-x64/bin`, WSL2 on Windows 11, dev server
on 3001 because 3000 is permanently held by another project's Grafana container.
Task 2 was done by hand. **Task 12 — the Vercel variables and the real-iPhone
checks — is outstanding.**

---

## The WSL problem, which cost more time than every real bug combined

This is the headline, and it deserves to be, because it is not an auth bug and it
**masqueraded as one three separate times**. Two of those three times it was
diagnosed as a bad `AUTH_GOOGLE_SECRET`. It is not a code defect anywhere in this
repository. If you are here because Google sign-in is failing, read this section
before you read any of the four bugs below.

### Root cause

**The WSL DNS proxy at `10.255.255.254` answers A records instantly and never
answers AAAA at all.** glibc then waits out its default `timeout:5 attempts:2`
before giving up on the AAAA half. `dns.lookup` — which is what undici, and
therefore `fetch`, uses — asks for both families. So **every cold outbound
connection in this image pays 4–12 seconds**, and it pays it silently.

Measured, all real:

```
curl timing, https://<host>/
  accounts.google.com    dns=0.018s  tcp=0.038s  tls=0.066s
  oauth2.googleapis.com  dns=0.017s  tcp=0.037s  tls=0.060s
  www.googleapis.com     dns=15.792s tcp=15.815s tls=15.840s   <-- DNS is the whole cost

by address family
  getent ahostsv4 www.googleapis.com    0.01s
  getent ahostsv6 www.googleapis.com   10.02s
  getent ahostsv6 accounts.google.com   11.79s
  getent ahostsv6 oauth2.googleapis.com  3.84s

from inside the Next dev server (a temporary diagnostic route)
  discovery  (accounts.google.com/.well-known/openid-configuration)   87ms
  token      (oauth2.googleapis.com/token)                          3025ms
  JWKS       (www.googleapis.com/oauth2/v3/certs)                    8483ms
```

The OAuth callback makes all three of those calls, in that order: issuer
discovery, the token exchange, then the JWKS fetch that verifies the `id_token`
signature. **undici's connect timeout is 10 s**, so the third one died with
`UND_ERR_CONNECT_TIMEOUT` / `TypeError: fetch failed` on a network that was
completely healthy. The user-visible symptom was `?error=Configuration` on the
login page — **indistinguishable from a wrong client secret**, which is exactly
what it was wrongly diagnosed as.

### Fix

`RES_OPTIONS=no-aaaa`. glibc (2.39 here) reads it directly out of the environment,
so it needs no sudo and no config file, and it is prefixed onto `dev`, `build`,
`start` and `smoke` in `package.json`. Measured effect: `getent hosts` 5.61s →
0.02s, and the JWKS fetch 8483ms → 112ms.

IPv6 egress is separately broken in this image — `curl -6` fails in 25 ms with
exit 7 — so skipping AAAA loses nothing that worked.

The permanent fix is a real resolver: `generateResolvConf = false` in
`/etc/wsl.conf` plus `nameserver 1.1.1.1` in `/etc/resolv.conf`. That needs sudo
and a `wsl --shutdown`, and it would let every `RES_OPTIONS=` prefix be deleted.
**This is expected to be a non-issue on Vercel, and that assumption is untested** —
it is one of the things Task 12 will find out.

### Two dead ends, recorded so nobody retries them

- **`--dns-result-order=ipv4first` does not work.** It reorders the results; it
  still issues the AAAA query, and the wait is in the query. Worse, the hypothesis
  behind reaching for it — "IPv6 is being tried first" — was simply false: DNS
  already returned IPv4 first, verified over 8 consecutive lookups.
- **Retrying does not work, and it looks like it does.** Once a Node process
  finally resolves a name it caches it, so the second attempt inside one session is
  fast and the first attempt after any restart is not. **This wasted the most
  time.** It was diagnosed as "cold-path slowness, just retry" twice, and failed
  both times. Warming DNS from a *different process* than the dev server is
  likewise useless, which was another wasted attempt.

### On the first failure, measure

Do not retry, and do not form a hypothesis first. Two commands separate the whole
space:

```sh
curl -w 'dns=%{time_namelookup} tcp=%{time_connect} tls=%{time_appconnect}\n' -o /dev/null -s https://www.googleapis.com/
getent ahostsv4 www.googleapis.com   # then ahostsv6
```

The first splits DNS from TCP in one request. The second names the address family.

### And the single most valuable diagnostic in this workstream

`?error=Configuration` has two completely different causes — bad credentials and
no connectivity — and the login page deliberately renders one sentence for both.
This separates them in one request:

POST a **deliberately bad authorization code** to Google's token endpoint with the
real client id and secret.

| Response | Meaning |
|---|---|
| `invalid_grant` — "Malformed auth code" | **The credentials are good.** Google got them, accepted them, and rejected the code. The problem is elsewhere; go read the WSL section. |
| `invalid_client` — "The provided client secret is invalid" | The secret is wrong. |

One request, and it costs nothing. Reach for it before touching any code.

---

## The four bugs

### Bug 1 — `token.sub` is not the provider's `sub`. It shipped silently.

`@auth/core/lib/actions/callback/oauth/callback.js:218`:

```js
const userFromProfile = await provider.profile(OAuthProfile, tokens);
const user = {
    ...userFromProfile,
    // The user's id is intentionally not set based on the profile id, as
    // the user should remain independent of the provider and the profile id
    // is saved on the Account already, as `providerAccountId`.
    id: crypto.randomUUID(),
```

`token.sub` is set from `user.id`. So **`token.sub` is a fresh random UUID on
every sign-in**, by design, and the library's own comment tells you where the real
value went.

The implementation originally read `carried.sub ?? account?.providerAccountId`.
That reads like a safe fallback and is not one: `token.sub` is *always* set, so the
correct value on the right-hand side was never reached. `users.google_sub` got a
new UUID each sign-in, the upsert's `on conflict (google_sub)` never matched, and
**every sign-in INSERTed a new row.**

There was no error. The app worked. Observed in the database — two rows, one
email, two UUID-shaped subs:

```
google_sub                            email                created_jkt
e364eac1-57f2-4040-883c-917e935e3599  mahfuzh74@gmail.com  2026-07-26 20:30:00
6e1ee160-049d-451a-9db9-927894c395d6  mahfuzh74@gmail.com  2026-07-26 20:46:11
```

What breaks is every memory feature in roadmap §5: yesterday's readings belong to
yesterday's row, so history reads empty forever. Nothing in the browser can show
you that. It was found by reading the table.

Fixed by `readExternalSub(account)` in `src/lib/auth/token.ts:168`, called from
`src/lib/auth/auth.ts:149`. Two properties of that function are deliberate:

- **It takes the account and nothing else.** Not a token, not a user, not an
  either-or. There is no call site at which the two can be confused, which is what
  the original `??` expression got wrong.
- **It refuses a uuid-shaped value** (`token.ts:172`). `@auth/core` uses the same
  `randomUUID()` fallback for `providerAccountId` when a profile arrives without a
  `sub`, and that fallback has the identical non-repeating disease — accepting it
  would let this bug back in through the side door. No legitimate value here is
  uuid-shaped: Google's subs are decimal strings and ours are `dev:`-prefixed.
  Refusing means a failed sign-in the user can retry, rather than an account they
  can never return to.

Four tests cover it. `src/lib/auth/auth.ts:193` additionally overwrites
`carried.sub` with the real external identity, so `currentUser().googleSub` means
what `JmtarotToken.sub` says it means instead of handing every caller a uuid that
changes on each sign-in. Nothing on the JWT path reads `sub` — there is no adapter
— so the overwrite is safe.

**The general lesson, and it is the one worth carrying forward: the browser cannot
verify a data-layer bug.** Sign-in succeeded, the gate worked, the reading
streamed, and the schema was being corrupted the entire time. The only check that
would have caught this earlier is asserting that a *second* sign-in produces
*one* row. Write that assertion for any flow that writes an identity.

### Bug 2 — the redirect loop between `/` and `/login`

The `session` callback was in `auth.ts` only. Middleware runs
`NextAuth(authConfig)` — a *second* instance, built from the shared config alone —
so `request.auth.user` carried only Auth.js's defaults: `name`, `email`, `image`,
and no `uid`. `readToken` rejected it, middleware concluded the user was signed
out and redirected `/` to `/login`; `/login` called `auth()`, saw a perfectly valid
session, and redirected back to `/`.

Symptom: `ERR_TOO_MANY_REDIRECTS` after a sign-in that had actually succeeded, with
**nothing in any log**. Neither side thought it had done anything unusual.

Two fixes, and both were needed:

- The pure `session` callback moved to `src/lib/auth/config.ts:177`, which both
  instances import. The rule it teaches: **anything pure belongs in `config.ts`.**
  `config.ts` is the only place that can guarantee the two instances agree about
  what a session contains.
- `/login` switched from `auth()` to `currentUser()`
  (`src/app/login/page.tsx:67`), so both halves of the loop use **one** predicate.
  Middleware decides "signed in" by narrowing with `readToken`; a login page that
  decides it differently is a loop waiting for the two to disagree.

`src/lib/auth/config.test.ts` asserts both halves end to end: line 36 that
`authConfig.callbacks.session` exists at all, and lines 43–57 that its output
satisfies `readToken`. The second is the one that survives a renamed claim.

**Nothing existing caught this.** `decide()` was correct. `readToken` was correct.
`npm run typecheck` and `npm run build` both passed. What was wrong was *where a
pure callback lived*, which is not a property any of those four can see.

### Bug 3 — `pages.error` unset

`pages: { signIn: '/login' }` alone is not enough. A failed token exchange raises
`CallbackRouteError`, `@auth/core` routes that to `pages.error`, and with `error`
unset it falls back to Auth.js's own page: unstyled, in English, "There is a
problem with the server configuration", HTTP 500. That is the wrong thing to show
a querent for any reason, and there are several — a wrong secret, an expired
secret, and a revoked client all land there.

Both now point at `/login` (`src/lib/auth/config.ts:149`), so every failure arrives
as `?error=<code>` on a page that renders one Indonesian sentence and offers the
button again. The raw code is never rendered: it is English, it means nothing to
the querent, and it names the library.

### Bug 4 — the plan was factually wrong about `checks`

Plan §1 originally claimed `checks` defaults to `["pkce"]` with `"state"`
force-appended. It is not force-appended.
`@auth/core/lib/utils/providers.js:52` reads `const checks = c.checks ?? ["pkce"]`
and appends `state` **only inside `if (c.redirectProxyUrl)`** — and reconciliation
§7.9a cut `AUTH_REDIRECT_PROXY_URL`, so we never set it.

Observed on the wire. The authorization URL carries `response_type`, `client_id`,
`redirect_uri`, `code_challenge`, `code_challenge_method=S256` and `scope`, and
**no `state` and no `nonce`**. The cookie jar gets `authjs.pkce.code_verifier`,
`authjs.csrf-token` and `authjs.callback-url`, and no `authjs.state`.

**This is not a hole.**

- **PKCE covers state's CSRF role here.** The callback requires *this browser's*
  `code_verifier` cookie, so a code minted in an attacker's flow dies at the token
  exchange with `invalid_grant`, and a browser carrying no verifier cookie is
  refused before any exchange happens. `@auth/core` cites the reasoning in its own
  source at `lib/actions/callback/oauth/checks.js:80`.
- **`nonce` is OPTIONAL for the authorization-code flow** in OIDC and REQUIRED only
  for implicit and hybrid, which we do not use. The `id_token` arrives from
  Google's token endpoint over TLS, not through the browser, so there is no
  id_token to replay.

**And adding them would be a net loss.** `checks: ['pkce', 'state', 'nonce']`
would work, and it would add two more cookies that have to survive the round trip
— against the largest unverified risk in this workstream, which is precisely
whether cookies survive the round trip in iOS standalone mode. Do not "fix" this.

§1's argument for adopting a library is untouched: the token exchange, the JWKS
signature check and the `iss`/`aud`/`azp`/`exp` claim checks are still the
library's, and they are still the part nobody should hand-roll.

---

## What W2 changed against the plan

### W1 owed two queries and never shipped them

`upsertUserOnSignIn` and `readSessionFacts` were written by W2 in
`src/lib/db/queries/profile.ts`. Three deliberate divergences from the plan's
*Interfaces I need*:

- **Handle-first `(db, input)`**, not the plan's handle-less signatures. That is
  the enforced query-module contract — `contract.test.ts` checks it — and it is
  what lets the integration suite pass a rolled-back transaction.
- **Reconciliation §7.8's grace-period erasure**, not plan §5.3's outright refusal:
  restore within 30 days, hard-delete-and-recreate past it. R23 is why. Under the
  strict design the dead row held the `google_sub` forever, so a user who
  rage-quit could never come back **even as a new user**.
- **Therefore the function never returns null**, and the nullable was removed
  rather than left as a dead branch. `Promise<SignInUpsertResult | null>` with null
  meaning "soft-deleted, refused" describes a case that no longer exists, and a
  branch nothing can reach is a branch someone will later trust.

The common path is **one round trip**: a data-modifying CTE
(`profile.ts:187`) whose `on conflict do update ... where` (`profile.ts:202`)
suppresses the update **and the `RETURNING`**, so zero rows is the signal to take
the purge path. It does not raise. **That zero-rows behaviour cannot be confirmed
by reading it** — it is a Postgres subtlety, not a Drizzle one — so both branches
have an integration test.

The rare purge path (`profile.ts:248`) uses a transaction rather than one clever
statement, because a DELETE and an INSERT on the same unique key inside a single
statement is exactly the case Postgres' documentation warns about: the
sub-statements share a snapshot, and whether the insert sees the delete is not
something to be confident about by reading. That path runs at most once per
returning user, so being unambiguous costs nothing.

### `session.ts` deleted

Reconciliation R13. W7's erasure runs in-app from an authenticated account screen,
not from an emailed link, so no caller remained for the jose helpers. The file is
deleted along with its test, and the reason it is deleted rather than kept and
renamed is that **a function named `verifySession` in a codebase where Auth.js owns
sessions sends someone to the wrong file at the worst possible moment.** The
legacy `jmtarot_session` cookie name survives as `LEGACY_SESSION_COOKIE` in
`src/lib/auth/gate.ts`, and middleware evicts it
(`src/middleware.ts:59`).

### A `_`-prefixed folder under `src/app/` registers no route

A temporary diagnostic route at `src/app/api/_netcheck/` silently did not exist:
Next treats a folder whose name begins with `_` as **private**. The path then fell
through to `[reader]/[service]` and 404'd via `isReaderId` validation, which looks
exactly like a route that is there but broken. This cost real confusion in the
middle of diagnosing the WSL problem. `public/cards/_gate.html` is fine — that is
`public/`, not `src/app/`, and different rules apply.

### A CSS regression the tests could never catch

Deleting `.form` along with the username and password fields left the Google button
**240px wide inside a 340px card**. `.card` is a centred flex column, so a bare
`<form>` shrink-wraps to its content. The rule is back, with a comment saying why
(`src/app/login/login.module.css:50`).

It was found by taking a screenshot and looking at it. Note the limit of that
loop: `tools/shot.sh`'s header warns that Windows clamps a Chrome window to
~500px, so a narrow `--window-size` lays out at ~500 and crops. **It is for
looking, not for measuring.** Anything whose only input is its container's inline
size gets a fixed-width container and `getBoundingClientRect` instead.

---

## What is verified, and what is not

### Verified

The gate, in both directions, driven through `POST /api/auth/dev-session` and
`public/cards/_gate.html` — a same-origin iframe harness under a path the
middleware matcher excludes, which is the only reason either loads at all. The
dev-session route mints a **genuine** Auth.js JWE against a **genuine** `users`
row through the same upsert the Google callback uses; a fake cookie would defeat
the purpose, since the harness exists to exercise the real gate.

| Case | Observed |
|---|---|
| `/api/reading`, signed out | 401 |
| `/api/reading`, signed in, not onboarded | 403 |
| `/api/reading`, onboarded | 200 — reaches body validation, which proves it passed `requireUser()` and `hit(user.id)` |
| `/`, signed in, not onboarded | redirect `/onboarding` |
| `/login`, signed in | redirect `/` |
| `/cards/*` | 200, ungated |
| `POST /api/auth/dev-session` with the flag unset | 404 |
| provider list with the flag unset | only `google` registered |

Google sign-in itself: verified **locally only**. The consent screen renders as
JMTarot, the callback completes, one `users` row appears with the right
`google_sub`, and a second sign-in updates rather than duplicates it.

### Not verified

**Anything on Vercel.** Task 12 has not run. `AUTH_SECRET` in particular must be
set in **Preview** as well as Production: missing it produces "sign-in appears to
work, then every page bounces to `/login` forever" with a 200 in the access log,
not an error.

**Sign-in from a home-screen installed instance, in iOS standalone mode. This is
the largest unverified risk in the project.** Navigating to another origin
(`accounts.google.com`) from standalone mode can hand the user to Safari or an
in-app browser, and the session cookie can land in a jar the standalone shell
cannot see. The failure is "sign-in works in Safari and the installed app can
never sign in", which breaks the product's whole delivery model. It cannot be
tested in WSL, in Windows Chrome, or on a simulator that does not exist here —
only on a real iPhone against a Vercel preview. It is also the reason Bug 4's
answer is "do not add two more cookies to the round trip".

### Still blocked on a purchase

`*.vercel.app` cannot be a Google Authorized Domain: it is a public suffix, so it
cannot be verified in Search Console, so it cannot be claimed. The consent screen
therefore stays in **Testing**, only manually-added test accounts can sign in at
all, and **"public release" and "buy www.jmtarot.com" are the same task.** This is
a purchase and a DNS change sitting between "everything is built" and "a stranger
can sign in".

### Routes that 404 on purpose

`/onboarding` (W3), `/terms` and `/privacy` (W7) do not exist yet. The gate
correctly redirects an un-onboarded user to `/onboarding`, which currently falls
through to the `[reader]` dynamic segment and 404s there. That is correct
behaviour and not a bug: when W3 adds `src/app/onboarding/`, the static segment
wins over the dynamic one and the redirect lands.

---

## If you are picking this up next

1. **Task 12.** The Vercel variables (`AUTH_SECRET` in Preview *and* Production,
   `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `SESSION_TTL_HOURS`,
   `SESSION_ABSOLUTE_TTL_DAYS`, `AUTH_URL` per environment; **delete `AUTH_USERS`**
   and leave `DEV_PASSWORD_LOGIN` unset), then the real iPhone. Standalone-mode
   sign-in first — everything else in that list is cheaper to fix than to discover.
2. **If sign-in fails, measure before you theorise.** The bad-code POST to
   Google's token endpoint separates credentials from connectivity in one request,
   and `curl -w 'dns=… tcp=…'` splits DNS from TCP. Both are above. Do not retry.
3. **Assert the second sign-in.** Any change to the sign-in path should be checked
   by signing in twice and counting rows in `users`, not by looking at the browser.
   That is the only assertion that would have caught Bug 1.
4. **Keep pure things in `config.ts`.** Both NextAuth instances import it; only one
   imports `auth.ts`. A pure callback in the wrong file is an unlogged redirect
   loop.
5. **Plan §11 item 6 was not built.** There is no `token.size.test.ts` — the 548 B
   / 3936 B measurement lives only in `token.ts`'s header comment, so a future
   claim addition will silently chunk the session cookie into
   `authjs.session-token.0`, `.1`, … rather than failing a test. Worth twenty
   minutes if you are adding a claim.
6. **W3 must call `refreshSession()`** after setting `profiles.completed_at`, or
   the gate keeps redirecting a finished user back to onboarding. W6 must do the
   same when a user changes locale. `onb` and `loc` live in the cookie; the
   database changing does not move them.
7. **Do not add `state` or `nonce`, and do not "fix" `readExternalSub` to accept
   `token.sub`.** Both look like tidying. Both are documented above as the bug.
