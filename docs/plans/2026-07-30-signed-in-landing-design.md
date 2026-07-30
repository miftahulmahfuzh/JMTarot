# Getting a returning querent back into the app

2026-07-30. Miftah's report: *"I see we have a landing page, but can we make it so that
users that already have an active session open the Reader Selection page directly?"*

## 0. The report was real and the code was not broken

**The behaviour asked for already shipped.** `decide()` has
`if (!signedIn && pathname === '/') return { kind: 'next' }`, `page.tsx` dual-renders on
`currentUser()`, and `/login` redirects a signed-in visitor to `/`. Three tests in
`gate.test.ts` name the cases, and loop 5 confirmed it live: with a real Auth.js JWE on
`/`, the Reader Picker renders.

Four hypotheses were eliminated by measurement rather than by reading:

| Hypothesis | Evidence against it |
|---|---|
| Vercel CDN serving cached signed-out HTML to a signed-in visitor | `/` answers `private, no-cache, no-store`, `x-vercel-cache: MISS` twice, zero `Set-Cookie` |
| Middleware and the page disagreeing (two NextAuth instances) | `auth.ts`'s `jwt` does no I/O on a plain request; the `session` callback lives in `config.ts` and both instances spread it |
| The `__Secure-` prefix mishandled in production only | `SESSION_COOKIE_NAME` branches on `secureCookies`; two callers, both correct |
| A chunked session cookie | 563 B, far under the 4096 split |

**What actually happened is a 24-hour idle timeout, and S-D5 changed what it looks
like.** Before the landing page, expiry was nearly invisible: middleware 302'd to
`/login`, one tap on a Google button restored the session, and because Google's own
session persists it completed almost instantly — it *felt* like the app remembered you.
Now the same expiry lands a returning querent on a page addressed to a stranger, and
getting back in costs two taps.

**So the fix is not the routing.** It is (A) sessions that survive longer than a day, and
(B) one tap rather than two for the cases that remain.

**A note for whoever debugs the next one of these: `tools/e2e/run.sh whoami` reported
"signed IN" while driving production, from a cookie scoped to `localhost`.** It matched
`authjs.session-token` across every domain with no origin filter, and it cost this
investigation its first wrong turn. Fixed here (§3).

## 1. Part A — `SESSION_TTL_HOURS` 24 → 168

Seven days. `ttl.ts` already parses the variable and bounds it at 366 days, so this is a
value change plus a matching `DEFAULT_TTL_HOURS`, so a forgotten dashboard variable does
not silently mean 24 hours again.

`SESSION_ABSOLUTE_TTL_DAYS` stays **30**. The hard bound does not move, and keeping the
idle window meaningfully below it is what keeps the sliding timeout doing real work.

**Three things this widens. None is a surprise; all three are written down somewhere in
the repo, which is why they are repeated here rather than discovered later.**

1. **A stolen cookie** stays useful for up to seven idle days instead of one. There is no
   server-side revocation on the JWT path: the 30-day absolute cap is still the only hard
   stop and rotating `AUTH_SECRET` is still the only kill switch, which signs out
   everybody.
2. **Admin revocation** (`.env.example`, A-D1/R38). `requireAdmin()` reads the session
   token and not `users.deleted_at`, so demoting an admin — including deleting the
   admin's own account — is bounded by exactly this value. One day becomes seven.
3. **Account erasure on a second device.** `DELETE /api/account` clears the cookie it can
   see; a session in another browser survives until idle expiry. Still inside the 30-day
   restore grace, but seven days rather than one.

### 1.1 Where the value actually comes from, which is not where it looks

**`SESSION_TTL_HOURS` IS NOT SET IN VERCEL AT ALL.** Checked with `vercel env ls
production`: it is absent from Production and from Preview, so **production has been
running on `DEFAULT_TTL_HOURS` this whole time** — which independently corroborates §0's
account of the report, because that default was 24.

Two consequences, and they point in opposite directions:

- **The code change alone ships the seven days. There is no dashboard edit to make.** A
  plan that said "set it in Vercel" would have had somebody hunting for a variable that
  was never there.
- **`.env.local` DOES set it, to 24** (line 29), so **local development is unaffected by
  this commit** and will keep expiring daily. That is the trap: the unit test goes green,
  the default is 168, and a session minted locally still says 24 hours — because an
  explicitly-set variable is doing exactly its job. Measured here: a freshly minted dev
  JWE expired in 24h with `ttl.ts` already changed. Change `.env.local` too if you want
  local to match; it is gitignored and outside this branch, so this commit does not.

**If it is ever set in the dashboard, it needs a redeploy and both environments.** The
value is read at module scope in `config.ts`, which the edge bundle inlines, so a dashboard
edit alone does not reach middleware.

## 2. Part B — one tap

### 2.1 A blocker I predicted, built a fix for, and then measured away

**Recorded because the wrong model is the reusable part.** I expected a `signIn()` server
action on the landing page to be broken by S-D10, reasoned it through, wrote a pure
`stripsCookies(method, content)` predicate with six tests, wired it into `middleware.ts`,
and then **tested it and found the premise false. All of that code is reverted; S-D10 is
untouched.**

The prediction: the form posts to `/`, `contentRewrite('/', false)` answers `bare`, so the
outer wrapper deletes every `Set-Cookie` on the response — including
`authjs.pkce.code_verifier`, which OAuth initiation sets with `Max-Age=900` and which the
callback cannot proceed without, since `code_challenge_method=S256` makes PKCE mandatory
and this app sends no `state`.

Two of the three measurements were right:

```
POST /api/auth/signin/google  ->  set-cookie: authjs.callback-url=…
                                  set-cookie: authjs.pkce.code_verifier=…; Max-Age=900
GET /login  -> 3 Set-Cookie      GET / -> 0      GET /gallery -> 0
```

**The third was misread.** `POST / -> 0 Set-Cookie` looked like the strip eating the
verifier. It was a bare POST with no action fields — it rendered the page and set no
cookies in the first place, so it was never evidence about server actions at all.

The A/B that settled it replays the real native form POST (parsing the `$ACTION_REF_1`
hidden fields out of the rendered form) against both versions of the predicate:

| `stripsCookies` | result |
|---|---|
| GET/HEAD only (my "fix") | `303`, 4 `Set-Cookie`, `pkce_verifier=PRESENT` |
| method-blind (**shipped code**) | `303`, 2 `Set-Cookie`, `pkce_verifier=PRESENT` |

**Sign-in from the landing page works on the code that was already there.**

### 2.2 Why the model was wrong, which is the part worth keeping

**The outer wrapper only ever sees the response the MIDDLEWARE returned.** It can delete
cookies that middleware set and cookies `auth()` appended to it — and nothing else. A page,
a route handler or a server action sets its cookies *downstream* of that object, so S-D10
cannot reach them, in either direction.

So the fence's blast radius is narrower than its comment implies, and the difference the
A/B did show (4 cookies vs 2) is `auth()`'s own `csrf-token` and one `callback-url` being
stripped on the POST — which changes nothing, because `signIn()` runs server-side and the
callback lands on `/api/auth/*`, which is `passthrough`.

**The change was reverted rather than kept as harmless.** It modified the one mechanism
`/privacy` §4.4 rests on, its stated justification had evaporated, and CLAUDE.md is explicit
that `content.kind !== 'passthrough'` being *the whole fence* is the property worth having.
A condition nobody needs, on that line, is a condition the next reader has to re-derive.

**Standing measurement for the next person:** every public content GET (`/`, `/en`,
`/gallery`, `/blog`) carries zero `Set-Cookie` and `/login` carries three, before and after
this branch.

### 2.3 `SignInForm`

A new server component, `src/components/SignInForm.tsx`, owning three things that must not
be separated: the server-action form, the Google mark, and **the consent line**. The
sentence *"Dengan masuk, kamu setuju pada Ketentuan dan Privasi"* is where agreement is
collected, so it travels with the button rather than staying behind on `/login`. One owner
means the two surfaces cannot drift.

Mounted by `Landing` (`redirectTo="/"`) and by `/login`
(`redirectTo={safeCallback(callbackUrl)}`).

**`/login` stays.** Three mechanisms name it: middleware's `?callbackUrl=`, `pages.signIn`,
and `pages.error` — the last is what keeps a failed token exchange off Auth.js's unstyled
English 500 page. "Skip the login page altogether" is not available; a second entry point
is.

**Analytics unchanged.** The submit button fires the existing `public.link_clicked` with
`{ from: 'landing', to: 'sign_in' }` from a small client component. **No new event name**:
the taxonomy stays at 67 with S1 as its owner for this release.

### 2.4 The fence that has to be rewritten rather than dodged

`Landing.test.ts` currently asserts `not.toContain("from '@/lib/auth/auth'")`, reasoning
that a `signIn()` action there *"would put @auth/core's provider machinery — and therefore
bcryptjs — into the homepage's module graph."*

**That reasoning is already void, and the fence would have been passed by accident.**
`page.tsx` imports `currentUser` from `server.ts`, which imports `./auth`, which statically
imports `Credentials` and `verifyCredentials`; `users.ts`'s own header says it *"ships in
the Node lambda whether or not the flag is on."* The machinery is in `/`'s graph today. A
`SignInForm` import would not have matched the regex either way, so the honest move is to
restate the rule — Landing may import `SignInForm`, still not `@/lib/auth/auth` directly —
rather than slip past a stale assertion.

## 3. Part C — the harness told me the wrong thing

`whoami` in `tools/e2e/chrome.mjs` finds a session with
`cookies.find((c) => /authjs\.session-token/.test(c.name))` over `Network.getAllCookies`,
which returns every cookie in the profile for every domain. Driving production with a
leftover `localhost` cookie in the jar, it printed `signed IN`.

Scoped to the current page's origin, and the printed line names the domain, so the next
reader can see which session they have. Still never the value.

## 4. Verification

- `npm test` — unit, including the new middleware and `SignInForm` fences
- `npm run build` — required; a green typecheck is not sufficient here
- **The native form POST replay (§2.1), which is the check that matters here.** Parse the
  `$ACTION_REF_1` hidden fields out of the rendered form on `/` and POST them as
  `multipart/form-data`, exactly as a browser with no JavaScript would. Assert `303` to
  `accounts.google.com` **and `authjs.pkce.code_verifier` in the response's `Set-Cookie`
  set.** No credential involved, so it is repeatable; the script is in the session
  scratchpad and is twenty lines.
- `curl -D -` on `GET /`, `/en`, `/gallery`, `/blog` (zero `Set-Cookie` each) and `/login`
  (three). This is the S-D10 regression check and it passes unchanged, because nothing in
  this branch touches middleware.
- **Still not verified, and it needs a human:** a Google round trip completed from the
  landing button. The initiation and the cookie are verified above and the callback path is
  untouched by this branch, so the residual risk is low — but `tools/e2e/run.sh login`
  against a preview is the only thing that closes it.
- **Not verified: the button on a real phone.** Loop 5 cannot give a phone width (both
  Chromes floor at ~500px), and `SignInForm`'s 44px tap target is inherited from `/login`
  rather than re-measured.
