---
name: test-prod-using-headless-chrome
description: Use when verifying JMTarot end to end in a real browser against production or a Vercel preview - a signed-in flow, the Google sign-in itself, a bug that only reproduces deployed, a phone-width screenshot of a gated page, or a check that the UI agrees with the request it sends. Also use when a check needs a real session cookie, real touch events, or the deployed lambda rather than the dev server.
---

# Testing production in a real browser

## Overview

A real Chrome runs inside this WSL image and is driven over CDP from the agent
session. It holds a persistent Google session, so a signed-in production flow can
be exercised repeatedly without anyone typing a password again.

**Core principle: the human authenticates, the harness never holds a credential.**
There is no verb that accepts a password and none that prints a session cookie's
value. Sign-in happens in a visible window the human types into.

## This supersedes two claims in CLAUDE.md

CLAUDE.md's `## How to verify things here` and `tools/shot.sh`'s header both say a
browser cannot be driven here. **The diagnosis was right; the conclusion is now
wrong**, and both files point at this skill.

| The old claim | What is actually true |
|---|---|
| "Chromium cannot launch in this WSL image — needs `libasound2t64`, which needs sudo" | Exactly ONE library was missing. `apt-get download` + `dpkg-deb -x` into `~/tools/chrome-libs` needs **no sudo**. `tools/e2e/setup.sh` does it. |
| "Windows clamps a Chrome window to ~500px, so a 375px shot is a crop, not a layout" | **THIS ROW WAS WRONG AND IS KEPT AS THE CORRECTION.** It claimed a Linux Chrome with no window manager honours 390 exactly. **Measured 2026-07-28: `--width 390` gives `innerWidth === outerWidth === 500`**, so the shot is a ~500px layout cropped to look narrow — the same failure attributed to Windows Chrome above. Cause unconfirmed; a saved window bound in the persistent profile is the likeliest. **Use loop 4 for width** (constrain the element, read `scrollWidth > clientWidth`); use this harness for behaviour. |
| "CDP over `--remote-debugging-address=0.0.0.0` is blocked by the Windows firewall" | That was reaching *Windows* Chrome across the WSL NAT. This Chrome is a local process; CDP is on `127.0.0.1` and nothing filters it. |

`tools/shot.sh` is still there on purpose — no dependencies beyond a Windows
install, and the fallback if `~/.cache/puppeteer` is ever cleared.

**What is NOT superseded:** "There is no Playwright and there must not be." Still
true. `tools/e2e/chrome.mjs` uses Node 24's global `WebSocket` and adds no
dependency to `package.json`.

## When to use

- A bug that reproduces **only** in production (`/api/locale`'s cold-start hang was one)
- Anything behind the gate: `/`, `/[reader]`, the draw, `/account`, `/onboarding`
- The Google sign-in path itself, including its cold callback
- A screenshot of a page `shot.sh` cannot reach because it cannot plant a cookie — **but
  at ~500px, not a phone width; see the corrected row above**
- "Does the UI agree with what it sends?" — `net` shows request bodies

**Do not use for:** logic (that is `npm test`), database queries (integration
tests), prompt output (`npm run smoke`), or anything a fixed-width container and
`getBoundingClientRect` answers exactly. Driving a browser is the most expensive
loop here; it is the fifth one, not the first.

**It still cannot replace a real iPhone.** `100dvh`, safe-area insets, real touch
and Add to Home Screen need hardware. Crucially, the **iOS standalone sign-in
risk** CLAUDE.md calls the project's largest unverified risk is invisible here:
this Chrome has one cookie jar, and that bug is about two.

## Quick reference

```sh
tools/e2e/setup.sh                       # once, idempotent; verifies libs + WSLg
tools/e2e/run.sh launch --headed         # window on the Windows desktop (WSLg)
tools/e2e/run.sh login                   # you type into it; polls for the cookie
tools/e2e/run.sh whoami                  # session? whose? never prints the value

tools/e2e/run.sh kill
tools/e2e/run.sh launch                  # headless, SAME profile, still signed in
tools/e2e/run.sh goto /margaret
tools/e2e/run.sh text                    # visible text
tools/e2e/run.sh shot out.png [--full]
tools/e2e/run.sh tap 'SIGN IN WITH GOOGLE'
tools/e2e/run.sh eval 'location.href'
tools/e2e/run.sh net --for 15            # requests + POST bodies
tools/e2e/run.sh wait '/margaret' --for 30
tools/e2e/run.sh reset                   # wipe the profile = sign out of Google
```

Point it somewhere else:

```sh
E2E_BASE=http://localhost:3001 tools/e2e/run.sh launch      # the dev server
tools/e2e/run.sh launch --base https://<preview>.vercel.app # a preview
```

## The workflow

1. **`setup.sh`** if `run.sh` says the binary will not start. Idempotent.
2. **`launch --headed`**, then **`login`**. Ask the human to sign in, then stop and
   wait — `login` blocks until the cookie appears and reports the session.
3. **`kill` and `launch`** (headless) for the actual testing. The profile persists,
   so the session survives. Headless is faster and needs no window.
4. Drive it: `goto`, `tap`, `text`, `shot`, `net`, `eval`, `wait`.
5. **Leave it running** between agent turns. Each verb attaches to the daemon, so
   state — cookies, current page, a half-finished flow — carries across commands.

## Why a persistent profile is load-bearing

The profile at `~/.cache/jmtarot-e2e-profile` is what makes one typed password
last for weeks. A fresh profile per run would mean asking a human to authenticate
on every test — **and that pressure is exactly how a credential ends up in an
environment variable.** The design removes the temptation rather than resisting it.

So `reset` is a separate verb and is never a side effect of `kill`. It signs the
human out of Google.

## Common mistakes

| Mistake | What happens |
|---|---|
| Letting headed mode use the GPU | **The window freezes while you type.** WSLg advertises a GPU it cannot serve: `ContextResult::kTransientFailure: Failed to send GpuControl.CreateCommandBuffer`. The window still maps, so it looks like a working browser and then stops repainting — and that is indistinguishable from "the site hung". It caused a wrong diagnosis of a production bug during development. `--disable-gpu` is passed in **both** modes for this reason; do not "optimise" it back. |
| Adding `--no-sandbox` | Not needed here — tested, not assumed. It also raises Chrome's yellow "unsupported command-line flag" infobar, which reads as the harness being broken. `E2E_NO_SANDBOX=1` exists for an image that genuinely needs it. |
| Calling `login` on a headless instance | Nothing to type into. It warns, then times out with no session. |
| `reset` when you meant `kill` | Google session gone; the human has to authenticate again. |
| Waiting on `load` instead of hydration | A real click lands on a real button and nothing happens. `settle()` polls for React's `__reactFiber$`; CLAUDE.md's `_onb.html` note is the same finding. |
| Using `element.click()` instead of `tap` | A synthetic click does not focus its target — which *is* the Safari bug `AccountMenu`'s `returnFocusTo` exists for. `tap` dispatches real Input-domain events. |
| Printing the session cookie | It is a bearer credential for the whole account. `whoami` prints length and expiry only, deliberately. |
| Adding `--enable-automation` | Sets `navigator.webdriver`; Google's sign-in reads it and can answer "this browser or app may not be secure" — breaking the one flow this harness exists to drive. |
| Reading production while `.env.local` points at prod Upstash | Local dev then spends the production fleet-wide limiter. Keep `UPSTASH_REDIS_REST_URL` on the local SRH. |

## Reading production evidence

`net` is the verb that replaces the `public/cards/_*.html` iframe harnesses for
deployed code — it shows status, timing and POST bodies without patching `fetch`.

**A warm lambda hides cold-path bugs.** Repeated hits keep a Vercel function warm,
so timings after the first are not evidence about the failure a user hits after a
quiet spell — especially on a free-plan Neon compute that suspends when idle. To
measure cold, leave it alone for 15+ minutes first, and expect the route that
*writes* to be the one that wakes the database.

`vercel logs <deployment-url>` (CLI installed globally) is the other half: this
harness sees the browser's view, and the log sees the lambda's.
