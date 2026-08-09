# An installable web app can never sign in with Google on iOS

**Postmortem — 2026-08-09. Written to be portable: nothing below is specific to
JMTarot except the worked example, and it is meant to be copied into the next
mobile-web-app project before that project meets this bug.**

---

## Executive summary

**Problem.** A web app installed to the iPhone home screen (`display: standalone`)
could complete Google sign-in and remain signed out **for ever**, through every
retry, while the consent screen succeeded every single time. The only way to use
the product was in a Safari tab, where browser chrome eats roughly a third of the
screen — which is the exact thing installing it was supposed to fix.

**Root cause.** iOS gives an installed web app **its own cookie jar**, seeded from
Safari **at install time** and diverging from then on, and it hands a cross-origin
navigation (`accounts.google.com`) to a browser overlay. The session cookie is
therefore set in a jar the standalone shell cannot read. **This is storage, not
routing, not OAuth configuration, and not a redirect-URI mistake** — every one of
which it looks like from the outside.

**Resolution.** Do not try to move a cookie between jars; nothing can. Get the
installed app to make **one request of its own** that the server answers with a
session cookie, and use a short-lived database row to carry the "a sign-in
finished" fact across the boundary. Five minutes, single use, two halves neither
of which is a capability alone.

**Impact.** Total, for the delivery model. The app was installable and unusable.
It had been shipping in that state for three releases.

**Duration.** Suspected for three releases and recorded as *"the largest unverified
risk in the project"*. Measured, designed, built, tested and confirmed in
production on one day.

---

## Timeline

| Phase | What happened |
|---|---|
| **~3 releases** | Suspected in prose. The guess in the project's `CLAUDE.md` was *"the session cookie can land in a jar the standalone shell cannot see"* — **which was exactly right** — followed by *"only a real iPhone against a Vercel preview can test it"*, which is why nobody did. |
| **Discovery** | Reported as a UI complaint: *"Safari's header and footer cover 30% of my screen."* The chrome was the symptom. The cause was that the chrome-free app could not be signed into. |
| **Investigation** | Two throwaway HTML probes served from a path excluded from the auth middleware, installed to a real home screen, plus one test against the real app. Seven questions, seven answers (below). The probes were deleted in the commit that wrote them up: **the measurements were the artefact, the HTML was only the instrument.** |
| **Design** | One document, written before any code. |
| **Implementation** | ~770 lines across 30 files, including tests and prose. |
| **Verification** | Local wire tests for everything a dev server can answer; **the acceptance test was a person with a phone.** |
| **Confirmed** | Works in production. |

---

## The measurements

**Every one of these cost a real device and none of them can be obtained any other
way.** They are the reusable part of this document.

| # | Question | Answer |
|---|---|---|
| 1 | Does iOS honour the manifest `start_url` on Add to Home Screen? | **Yes.** Installed from a plain URL, the app launched at `?src=pwa`. |
| 2 | Is `navigator.standalone` reliable? | **Yes**, with `display-mode: standalone` agreeing. |
| 3 | Does a cookie set *inside* the installed app survive a full quit and relaunch? | **Yes.** |
| 4 | Does dismissing the browser overlay return you to a live page? | **Yes.** `visibilitychange → visible` fires. |
| 5 | Is the returned-to page restored from the back/forward cache? | **Yes.** `pageshow` with `persisted === true`. |
| 6 | Does an out-of-scope **same-origin** navigation go to the overlay? | **No.** It stays in the app. |
| 7 | Does a cookie written **after** install cross into the app's jar? | **NO. This is the bug.** |

### Finding 6 is the one nobody predicts, and it is what makes a fix possible

**The manifest's `scope` does not govern what iOS hands to the overlay. The ORIGIN
does.** A navigation to any path on your own origin stays inside the standalone app
however far outside `scope` it is; only a genuinely cross-origin hop is punted.

The probe that found this was built on the opposite assumption — it opened a
same-origin page expecting an overlay, and rendered full-screen with no dismiss
button. **The probe failing is what proved the property**, and that property is the
entire licence for the fix: it is why an in-app `fetch` to your own API is
guaranteed to be made by the app, in the app's jar.

### Finding 7 is the bug, and finding 5 was a live alternative until it wasn't

Because dismissing the overlay restores cached HTML, the signed-out page could have
been **replayed rather than re-fetched** — the session might have arrived and the
app simply never asked. That was worth ruling out, because it would have made this a
ten-line fix.

It was ruled out the cheapest possible way: sign in for real, dismiss, **fully quit
the app**, relaunch. **A relaunch cannot serve bfcache.** The server returned the
signed-out page. The cookie is not there.

### The anomaly that explains everything

The first standalone launch already carried a cookie that had been set in **Safari,
before install**. So iOS **seeds a new web app's jar from Safari at install time**,
and the two diverge from then on. Every observation fits: cookies written before
install cross, cookies written after install never do, and the app in question had
been installed long before the sign-in that failed.

**This also yields a free stopgap for any project that hits this and needs a working
build today:** sign in in Safari, delete the home-screen icon, Add to Home Screen
again. The fresh install inherits the session. **It is not a fix** — it cannot
survive a sign-out or a session expiry, and it asks a user to reinstall an app in
order to log in — but it unblocks you, and it confirms the theory for free.

---

## Why this is so hard to diagnose

Write these down; each one sends a competent person to the wrong file for hours.

1. **Google says yes every time.** The consent screen succeeds, the token exchange
   succeeds, the callback runs, the user row is written. Every log is green.
2. **It works perfectly in Safari on the same phone.** So it reads as an install
   problem, a manifest problem, or "PWAs are flaky".
3. **It works perfectly in every desktop browser and every headless harness**, because
   those have **one cookie jar** and iOS has two. No CI, no Playwright, no CDP driver
   and no `curl` can reproduce it. If your test strategy is "drive a real browser",
   your test strategy is blind to this by construction.
4. **It presents as a UI complaint.** The report you get is about browser chrome
   taking up the screen, because that is the only part the user can see.
5. **The nearest plausible explanations are all wrong and all cheap to test**, so you
   burn the day on them: redirect URI mismatch, `SameSite`, `Secure`, `__Host-`
   prefixes, the OAuth `state` parameter, service-worker caching, bfcache.

---

## The fix, as a portable pattern

**Name it: a sign-in handoff.** Nothing moves a cookie between jars. Instead the app
makes one request the server answers with a session cookie — **a cookie set on a
response to the app's own request is in the app's jar by definition** — and a
short-lived row carries the fact that a sign-in completed.

### The four steps

```
1. MARK THE INSTALLED APP
   manifest start_url = "/?src=pwa"
   server sees the marker on that launch, sets `app_device` :
     256 random bits, httpOnly, Secure, SameSite=Lax, long-lived.
   It exists ONLY in the standalone jar. It authenticates nobody.

2. MINT A HANDOFF AT SIGN-IN
   The sign-in POST is made by the app, so it carries `app_device`.
   Server writes a row:  { challenge, sha256(app_device), user_id=NULL,
                           expires_at = now + 5 min, claimed_at = NULL }
   and sends the IdP `/handoff?c=<challenge>` as the return address.
   NO COOKIE IS SET ON THE REDIRECT RESPONSE — that response's URL is what
   iOS hands to the overlay, and you cannot promise the Set-Cookie is applied
   before the handoff.

3. BIND IT (this runs in the OVERLAY, which has the session)
   GET /handoff?c=...   ->  update ... set user_id = <session user>
                             where challenge = ?
                               and user_id is null        <-- see Traps
                               and claimed_at is null
                               and expires_at > now()
   Render: "You're signed in. Return to the app."

4. CLAIM IT (this runs in the APP)
   POST /api/auth/handoff   carrying `app_device` and nothing else.
   update ... set claimed_at = now()
    where claimed_at is null
      and challenge = (select challenge from handoffs
                        where device_hash = sha256(app_device)
                          and claimed_at is null
                          and user_id is not null
                          and expires_at > now()
                        order by created_at desc limit 1)
   returning user_id
   -> mint the session cookie ON THIS RESPONSE.
```

### The security argument, in one sentence

**The overlay knows the challenge and never the device secret; the app knows the
device secret and never sees the overlay; a usable session needs both to have
happened** — so neither half is a capability on its own, and the only value that
ever appears in a URL (the challenge) grants nothing but the right to bind a row
somebody else must still collect.

### When to fire the claim

Three triggers, and each covers a case the others do not:

- **On mount** — the app may have been *evicted from memory* while the overlay was
  open, and relaunches cold with no event to hear.
- **`visibilitychange → visible`** — the ordinary return (finding 4).
- **`pageshow` with `event.persisted`** — the bfcache restore (finding 5), which does
  **not** fire `visibilitychange` on every engine.

Guard with one in-flight flag and one done-forever flag: the last two can fire
together, and without the second guard a slow reload lets a second claim run against
a row the first already spent.

---

## Traps

Each of these ships silently. None fails a build, a type check or a test suite.

### 1. There is exactly one place the device cookie can be written, and it is not the obvious one

If your middleware strips `Set-Cookie` from public/cacheable responses — a very
common and correct privacy/CDN measure — **the app's launch URL is very likely one
of those responses.** Every natural implementation of *"set the cookie on that
launch"* puts it in the one place guaranteed to remove it, four lines above the
delete, **with the feature looking implemented**.

Write it downstream of the strip, and **assert the source ordering in a test**. It is
crude and it is the only thing assertable, because middleware is usually not
exercisable in a unit runner.

### 2. The app never learns the challenge

The design instinct is to key the claim on `(challenge, device_hash)`. **The app
cannot supply the challenge** — it was minted during a request whose only response is
the redirect you are forbidden from setting a cookie on, and that response goes to
the overlay. Key the claim on the device hash and resolve the newest eligible
challenge in a subquery. The security property is unchanged.

### 3. `user_id is null` in the bind's WHERE clause is load-bearing

The challenge is the only value this mechanism ever writes down. Without that clause,
anyone who comes by it can **re-point a bound row at their own account**, and the
victim's installed app collects a session belonging to a stranger — silently, on a
screen that says they are signed in. That is login CSRF, and it is one clause.

### 4. The first sign-in is a different case, and it is the one that fails

If your app has an onboarding gate, a **brand-new** user has `onboarded === false` at
exactly the moment the overlay lands on `/handoff`. The default gate sends them to
onboarding **inside the browser overlay** — where they answer everything into a
session the app can never see.

**The feature then fails for every new user and works for every returning one, which
is the worst available way for it to fail: it works for whoever built it.** The
handoff route must be exempt from the onboarding redirect while still requiring a
session.

### 5. Do not put the claim endpoint behind the session gate

Its entire problem is that it has no session. If your gate has an "auth routes are
open" prefix, put it there. *Public* must mean *no session required*, never
*unauthenticated*: what replaces the session is a 256-bit httpOnly cookie that must
also match a row another browser bound after the IdP said yes.

### 6. Every unsuccessful claim must be the same answer

No row, expired, already claimed, unbound, user since deleted — one `204`. Anything
that distinguishes them is an oracle for probing the table, and the user cannot act
on the difference anyway.

### 7. Store the hash, never the secret

`sha256(device_secret)`. A dump of the table must not be replayable into a session.
Assert it against the **row**, not against the code: the failure mode of storing the
secret is invisible until somebody has the dump.

### 8. Single use belongs to the database

One `update … where claimed_at is null … returning`. A check-then-update is the same
code with a window in it, and the window opens exactly when a user double-taps —
which they will, because the claim fires from a `visibilitychange` handler.

### 9. Use a database, not an in-memory or best-effort cache

If your rate limiter or cache can silently fall back to per-instance memory (the
common failure: an environment variable missing from a dashboard), a handoff written
on one instance and claimed on another means **sign-in works about one time in three,
with nothing logged.** Use the store that is already a hard dependency of your auth
path.

### 10. Mind the marker's blast radius

Honour the launch marker **only on the exact `start_url` path**, and only when the
cookie is absent. That keeps the write to once per install and stops a shared
`?src=pwa` link planting the cookie in an ordinary browser tab.

### 11. If you hand-roll the session token, do it in exactly one place

Session libraries commonly derive the encryption key using the **cookie name as the
HKDF salt**. Encode with the wrong salt and you get a cookie that decrypts to
nothing, which presents identically to a wrong secret and sends you looking in the
wrong file. Two hand-rolled copies are two ways to get it wrong.

---

## The one thing that did not go to plan

**The design named the overlay's copy as the only new user-visible surface it added,
and got that copy wrong on the first real device.**

The page says *"Press **Done** at the top left to return to the app."* Alongside it,
as a deliberately quiet fallback for "the visitor this page was not written for", was
a link: *"Or continue here."*

On the device that confirmed the fix, **there was no Done button.** The user tapped
the fallback link, and *that* is what completed the flow. The control written as an
afterthought was the control that did the work.

Two mechanisms fit the observation and **this postmortem does not claim to know which**:

- **(a) The overlay was dismissed when the navigation returned to the app's own
  origin**, handing control back to the standalone shell — where the visibility
  handler then claimed the session. The link is what triggered the return.
- **(b) The overlay never appeared for the return leg at all**, and the handoff page
  rendered somewhere with a session already in it.

**The discriminating experiment is cheap and has not been run:** sign out *inside the
installed app*, sign in again from the app, and note whether a dismiss control
appears at all and whether the app signs itself in without touching the link.

### Three lessons that generalise past this bug

1. **A fallback you wrote for the case you did not design for can be the primary
   path.** Ship it, and never delete it on the grounds that it is unused — you do not
   yet know that it is.
2. **Copy that names a control belonging to the OPERATING SYSTEM is a claim you cannot
   verify from your own codebase.** The word is rendered by the OS, in the *device's*
   language, in a position the OS chooses, and it may not be rendered at all. Name the
   button **and** the corner, and always offer an in-page control that does the same
   job.
3. **"It works" and "it works for the reason I designed" are different claims.** The
   product outcome here is confirmed. The mechanism is not, and saying so is the
   difference between a postmortem and a press release.

---

## What can and cannot be tested

**Testable in a unit/integration suite** — and worth it, because these are all
`WHERE` clauses and a `WHERE` clause is where this design can silently rot:

- the launch marker the manifest emits is the marker the server recognises
  (*if these two literals ever disagree, the entire feature is dead and every other
  test stays green*);
- the hash is deterministic, matches a fixed vector, and leaks no part of the secret;
- single use, expiry measured against the **database's** clock, refusing an unbound
  row, refusing another device's row, refusing to re-bind;
- the cascade when a user is deleted, and the expiry sweep — including that a row
  **inside** its window survives.

**Not testable anywhere but a real device:**

- whether an installed iPhone web app can sign in.

That is the whole lesson of finding 7. **The acceptance test is one sentence and a
person has to run it:**

> Install to the home screen, sign in, return to the app, and be signed in — then
> **fully quit the app, relaunch, and still be signed in.**

The second half is not optional. Without the quit-and-relaunch you have not
distinguished a real session from a cached page.

---

## Checklist for the next app

Before you ship an installable web app that signs in with a third-party IdP:

- [ ] Install it to a real home screen and **sign in from the installed app**, not
      from a tab. Do this on day one, not at release.
- [ ] **Fully quit and relaunch** before believing it worked.
- [ ] Put a launch marker in `start_url` from the beginning. It costs nothing and it
      is the only way the server can ever tell a home-screen launch from a tab.
- [ ] Know where your middleware strips cookies, and check whether the launch URL is
      one of those responses.
- [ ] Check what your gate does to a **brand-new** user on the return leg.
- [ ] Assume `scope` does not mean what you think on iOS. **The origin is the
      boundary.**
- [ ] Do not trust any headless browser, CI job or CDP harness to reproduce a
      cookie-jar bug. **They have one jar.**

---

## Follow-up

**Done**

- [x] Measured on hardware, designed, implemented, unit + integration tested, shipped.
- [x] Confirmed working in production.
- [x] The three-release-old prose that called this *"the largest unverified risk"* and
      said only a device could test it was **corrected rather than left standing** —
      both sentences were false the moment it was measured.
- [x] The privacy policy's cookie list gained the third cookie. **A list that is short
      by one is the thing that document can least afford.**

**Open**

- [ ] **Run the discriminating experiment above** and settle which mechanism is real.
- [ ] **Reconsider the overlay copy**: promote the in-page link to a primary control
      and demote the OS-button instruction to a hint. Held back deliberately — the
      flow currently works, and changing user-visible navigation copy on one
      observation and two competing explanations is the mistake this repo's rules
      exist to prevent.
- [ ] **No metric.** A run of handoff rows that are minted and never claimed is the
      exact signature of a broken claim leg, and nothing reports it as a rate. Today
      the only instrument is a person with a phone.
- [ ] The install-time-copy stopgap is still formally unverified (though the
      confirming session strongly suggests it holds: a fresh install landed signed
      in).

---

## Reference: the implementation in this repository

Kept as a worked example. Nothing here is required by the pattern.

| Piece | File |
|---|---|
| Names, marker, Web Crypto (edge-safe leaf) | `src/lib/auth/handoff.ts` |
| The mint, called from the sign-in action | `src/lib/auth/handoffMint.ts` |
| The shared session-token encode | `src/lib/auth/mint.ts` |
| The four statements | `src/lib/db/queries/handoff.ts` |
| Table + migration | `auth_handoffs`, `0015` |
| The overlay page | `src/app/handoff/page.tsx` |
| The claim endpoint | `src/app/api/auth/handoff/route.ts` |
| The claim listener | `src/components/HandoffClaim.tsx` |
| Marker emitted / recognised | `src/app/manifest.ts`, `src/middleware.ts` |
| Gate exemption | `src/lib/auth/gate.ts` |
| Tests | `handoff.test.ts`, `handoff.contract.test.ts`, `handoff.integration.test.ts` |

The design document is
`docs/plans/2026-08-09-standalone-signin-handoff-design.md` (§1 holds the seven
measurements, §8 the divergences found while building). The narrative account is in
`docs/workstream-notes.md` under *The standalone sign-in handoff*. Commit `4c3968d`.

**Two notes for anyone porting this:** the edge-safe module uses **Web Crypto**
(`crypto.getRandomValues`, `crypto.subtle.digest`) and never `node:crypto`, because
middleware runs it; and the mint function **never throws** — a handoff that cannot be
written degrades to the behaviour of the day before, because a sign-in that 500s
turns a bug affecting one platform into an outage affecting everybody.
