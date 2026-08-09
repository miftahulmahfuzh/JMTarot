# Sign-in from the installed app (2026-08-09)

**The home-screen app cannot sign in, and it never could.** CLAUDE.md has carried this
for three releases as *"the largest unverified risk in the project"*, guessed at in the
right terms — *"the session cookie can land in a jar the standalone shell cannot see"* —
and unverified because loop 5 has one cookie jar and iOS has two. It was reproduced and
measured on an iPhone (iOS 18.7, Safari 18.7.6) on 2026-08-09. It is real, it is
storage, and this document is how it gets fixed.

**It breaks the product's whole delivery model.** The manifest exists so JMTarot installs
to the home screen and opens without browser chrome; a querent who installs it and then
cannot sign in has an app that shows them a landing page forever.

## 1. What was measured, and why each number is here

Two throwaway probes under `public/cards/` — a path the middleware matcher excludes, so
they load with no gate and no stray cookies — plus one test against the real app. They
are deleted in the commit that adds this file; **the measurements are the artefact, and
this section is the only place they survive.**

| # | Question | Answer |
|---|---|---|
| 1 | Does iOS honour the manifest `start_url` on Add to Home Screen? | **Yes.** Installed from a plain URL, the app launched at `?src=pwa`. |
| 2 | Is `navigator.standalone` reliable? | **Yes.** `true`, with `display-mode: standalone` agreeing. |
| 3 | Does a cookie set *inside* the app survive a full quit and relaunch? | **Yes.** `b00cf1c2` → `4b52e339` across launches. |
| 4 | Does pressing `Done` return to a live page? | **Yes.** `visibilitychange -> visible` fires. |
| 5 | Is the page restored from the back/forward cache? | **Yes.** `pageshow persisted=true`. |
| 6 | Does an out-of-scope **same-origin** navigation go to the overlay? | **No.** It stays in the app. |
| 7 | Does a cookie written after install cross into the app's jar? | **NO. This is the bug.** |

**Finding 6 is the one nobody would predict, and it corrects the probe that found it.**
`scope` in the manifest does **not** govern what iOS punts to `SFSafariViewController`.
**The origin does.** A navigation to any path on `www.jmtarot.site` stays inside the
standalone app however far outside `scope` it is; only a cross-origin hop —
`accounts.google.com` — is handed to the overlay. Probe 2 was built on the opposite
assumption, opened a same-origin page expecting an overlay, and rendered full-screen with
no `Done` button. **That failure is why the claim endpoint in §2 is known to work.**

**Finding 7 is the bug and finding 5 was a live alternative until it wasn't.** Returning
from the overlay restores cached HTML, so the signed-out landing page could have been
*replayed* rather than *re-fetched* — the session might have arrived and the app simply
never asked. That was worth ruling out, because it would have made this a ten-line fix.
It was ruled out the cheapest possible way: sign in for real, press `Done`, **fully quit
the app**, relaunch. A relaunch cannot serve bfcache. The server returned the signed-out
landing page. **The cookie is not there.**

**One anomaly, explained, and it pays for itself below.** Probe 1's first standalone
launch already carried a cookie set in **Safari** before install. So iOS **seeds a new
web app's jar from Safari at install time**, and the two diverge from then on. Every
observation fits: cookies written before install cross, cookies written after install
never do, and JMTarot was installed long before the sign-in that failed.

- **The immediate workaround, and it needs no code.** Sign in at `www.jmtarot.site` in
  ordinary Safari, delete the home-screen icon, and Add to Home Screen again. The fresh
  install inherits Safari's session. **Untested** — offered as a stopgap, and confirming
  it also confirms the install-time-copy theory.
- **It is not the fix.** It cannot survive a sign-out, a session expiry (seven days,
  sliding) or the absolute cap (thirty days), and it asks a querent to reinstall an app
  to log in.

## 2. The design

**We never move a cookie between jars. We get the installed app to make one request the
server answers with a session cookie** — a cookie set on a response to the PWA's own
request lands in the PWA's jar by definition. Finding 6 is what guarantees that request
never leaves the app.

1. **Mark the installed app.** `manifest.ts` gets `start_url: '/?src=pwa'`. On that
   launch the server sets `jmt_pwa` — a 256-bit opaque value, httpOnly, long-lived. It
   exists only in the standalone jar. **No client JavaScript**, so `SignInForm` stays the
   pure server component its header argues for.

2. **Mint a handoff at sign-in.** The form POST already runs on a request from the PWA —
   the punt happens on the *redirect*, not the POST. Seeing `jmt_pwa`, the server writes a
   row holding `sha256(jmt_pwa)` and a fresh random `challenge`, and passes the challenge
   to Google as the return path. **No cookie is set on the redirect response**, because
   iOS hands that response's URL to the overlay and we cannot promise the `Set-Cookie` is
   applied first.

3. **Bind the completed sign-in.** Google returns into the overlay at
   `/handoff?c=<challenge>`. That request carries a valid session, so the server fills in
   `user_id` and renders *"Signed in — press Done to return to JMTarot"*.

4. **Claim it.** Back in the standalone app, `visibilitychange` (finding 4) and a check on
   load both fire a POST carrying `jmt_pwa` from the app's own jar. The server mints the
   session cookie on **that** response.

**The overlay knows the challenge and never the device secret; the app knows the device
secret and never sees the overlay. A claim needs both**, so neither half is a capability
alone.

## 3. Schema delta

Per CLAUDE.md, a column goes in a workstream plan's `## Schema deltas` and reconciliation
folds it in. **One new table, no change to any existing one.**

```
auth_handoffs
  challenge    text primary key    -- random, travels in the URL, secret to nobody
  device_hash  text not null       -- sha256(jmt_pwa), authorises the claim
  user_id      uuid → users        -- null until the overlay fills it in
  created_at   timestamptz not null
  expires_at   timestamptz not null
  claimed_at   timestamptz
```

**Postgres, not Redis.** `redisConfigured()` can be false and the limiter silently falls
back to per-instance memory; a handoff on that path is written on one lambda and claimed
on another, so sign-in would work roughly one time in three with nothing logged. Postgres
is already a hard dependency.

Single use is enforced by the database, not by application ordering:

```sql
update auth_handoffs set claimed_at = now()
 where challenge = $1 and device_hash = $2
   and claimed_at is null and expires_at > now() and user_id is not null
returning user_id
```

Expired rows are swept by `src/app/api/cron/sweep/route.ts`, which already exists.

## 4. Security

- The device secret is 256 bits, httpOnly, `Secure`, `SameSite=Lax`.
- **Only the challenge appears in a URL**, and it grants nothing without the device
  secret — so server logs and any `Referer` carry a useless value.
- Five-minute expiry, single use, and the claim additionally requires `jmt_pwa` to match.
- **The capability lives in exactly one place — the standalone jar's cookie.** The
  boundary that caused this bug is what contains it.

**Blast radius.** No `jmt_pwa` cookie means no handoff row is ever written, so Safari,
Chrome, desktop and every existing session stay on a byte-identical path to today.

## 5. Failure modes

| What happens | Result |
|---|---|
| `Done` never pressed | Row expires in five minutes. Nothing else. |
| App evicted while in the overlay | The claim runs on load as well as on `visibilitychange`. |
| Claim finds no row | Landing page, exactly as today. |
| Not a PWA | No cookie, no row, no change. |
| Two sign-ins racing | `claimed_at is null` in the `where` clause; one wins. |

## 6. Open, and deliberately not decided here

- **The overlay page's copy.** A querent who has just signed in is looking at a page
  telling them to press a button belonging to iOS. It needs writing in both locales and it
  is the only user-visible surface this design adds.
- **Whether the claim should be silent.** Currently the app claims and re-renders with no
  announcement. That is probably right and is untested on a person.
- **The install-time-copy stopgap in §1 is unverified.**
- **`SESSION_TTL_HOURS` is unset in Vercel**, so production runs the 168-hour default.
  This design does not change it, but a handoff is how a lapsed standalone session gets
  renewed, so the two are now related.

## 7. How it gets verified

**Loop 6, on a real iPhone, and nothing else can do it.** Loop 5 has one cookie jar; unit
and integration tests can cover `auth_handoffs`'s single-use guarantee and the pure hash
derivation, and cannot see the thing that matters. The acceptance test is one sentence:
**install to the home screen, sign in, press `Done`, and be signed in** — then fully quit,
relaunch, and still be signed in.
