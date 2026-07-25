# Changelog

All notable changes to JMTarot are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.1.0] - 2026-07-25

First tagged release. The tree began as an Expo/React Native iOS app and was
rewritten mid-history into a mobile-first website; this entry describes the web
app as it now stands. The iOS tree is preserved on `feat/ios` and
`backup/main-ios-2026-07-25`.

### Added

- **Next.js app** (App Router, TypeScript, `src/`) replacing the Expo scaffold:
  reader picker (`/`), service picker (`/[reader]`) and the draw screen
  (`/[reader]/[service]`).
- **Authentication.** Two hardcoded users behind a signed-cookie login —
  `src/lib/auth/session.ts` (HMAC session tokens), `src/lib/auth/users.ts`
  (bcrypt password checking), `/api/auth/login`, `/api/auth/logout`, and a
  login page.
- **Route gate** at `src/middleware.ts`, redirecting unauthenticated requests
  to `/login`.
- **The draw interaction.** A 22-card fan with settled geometry (88x132, 64°
  span, 272px pivot, verified against `getBoundingClientRect`), pick, return,
  a one-rotation 3D card flip using `preserve-3d`, filled slots, and a
  reduced-motion grid fallback (`FanGrid`, `StillMode`).
- **Card detail overlay** (`CardDetail`). Tapping a picked card opens its full
  art and its Indonesian meaning; returning it to the deck moved into a button
  inside the overlay, offered only while the reading is idle.
- **Card data** for the 22 Major Arcana in Fool's Journey order, with
  reversals, `stage`/`polarity`/`element` grounding, and a distinct pair of
  Indonesian one-line meanings per card (upright and reversed) read through
  `cardMeaning()`.
- **Derived yes/no verdict.** `effectiveYesNo()` decides it in code, including
  the reversal flip, and hands the model the word — never the reverse.
- **LLM provider interface** (`src/lib/llm/`) — one adapter serving both
  `anthropic` and `zai`, streaming, proven against the live endpoint.
- **Three-layer prompt builder** (`src/lib/prompt/`): `base.ts` (format,
  language, safety) + `readers.ts` (persona, one worked example paragraph each)
  + `services.ts` (the task), assembled by `build.ts`. The querent's question
  goes in the user turn only, inside `<pertanyaan>` delimiters, after
  sanitization.
- **Streaming reading endpoint** at `/api/reading`, with a best-effort
  in-process rate limiter.
- **Web app manifest** (`src/app/manifest.ts`) and a generated home-screen
  icon, making the site installable to the iPhone home screen.
- **Design tokens** as the single source of truth — `src/theme/tokens.ts`
  mirrored into `src/theme/tokens.css` — plus self-hosted fonts via
  `next/font/google` and the starfield backdrop.
- **Vitest suite** covering deck maths, `togglePick`, prompt assembly, question
  sanitization, session tokens, password checking and the rate limiter.
- **Verification tooling in place of Playwright** (Chromium cannot launch in
  this WSL image): `tools/shot.sh` drives Windows Chrome headless against the
  WSL dev server.
- **Asset pipeline.** Idempotent `tools/normalize_cards.py` (source PNGs →
  800x1200 and 240x360 WebP, padding rather than cropping),
  `tools/generate_cards.py` (rebuilds `src/data/cards.json`) and
  `tools/make_icons.py`. `public/cards/` is committed so the deploy needs no
  Python.
- **Documentation.** `docs/plans/2026-07-25-jmtarot-web-rewrite.md` (every
  decision and why), `docs/DEPLOY-VERCEL.md` (a from-scratch Vercel deploy),
  `docs/art-inconsistency.md` (the measured art inconsistency), plus a
  rewritten `CLAUDE.md` and `README.md`.
- `npm run smoke` — one live LLM call to check key/baseURL/model — and
  `npm run smoke -- --all`, which generates all nine reader x service readings
  and greps them for eleven Malay-only words.

### Changed

- **Reading length is controlled per paragraph, not per reading.** A
  whole-reading word budget did not hold: Margaret ran 238–298 words against a
  stated 140–180 while Adrian obeyed at 128. A ceiling the model can count as
  it writes — 2–3 sentences and at most 40 words per paragraph — landed all
  three readers at 128–169 words, and `MAX_TOKENS.spread3` came down from 1100
  to 650 as a runaway guard rather than a length control.
- **Card names stay English** because the artwork has its title rendered into
  the image. This is an explicit prompt rule; the model otherwise invents names
  like "Pulan" for The Moon.
- All reader-facing copy is Indonesian, not Malay: `karier`, `arah hidup`,
  `ngobrol`, `kamu`.
- The no-therapy/no-diagnosis constraint moved from authoring time to
  generation time, enforced in `src/lib/prompt/base.ts`.
- `next.config.ts` serves `/cards/*` with a one-year `immutable` cache.

### Fixed

- **The draw screen read the wrong cards.** Caught by driving the real page in
  a same-origin iframe and diffing the outgoing request body against the
  rendered `alt` text — the page looked correct and the request was wrong.
- **Hydration mismatch from shuffling in a `useState` initialiser.**
  `shuffleDeck()` is impure, so it produced one deck on the server and another
  on the client; the querent saw one spread and was read a different one. The
  deck now starts in fixed order and shuffles in an effect.
- **The fan was dead in development.** A side effect inside a `setState`
  updater fired twice under StrictMode and cancelled itself out. The drag is
  read from a ref instead.
- **`container-type` does not make an element its own container.** `CardBack`
  is split into `.back` (declares the container) and `.plate` (a descendant, so
  its `cqw` resolves as intended).
- The production build was unblocked by pinning TypeScript to 5.x — 7.x ships
  no full compiler JS API and dies in `next build` after a green `typecheck`.
- Control characters in the committed design export are written as escapes.

### Removed

- The Expo/React Native toolchain, EAS, TestFlight and the App Store path,
  along with `docs/TESTING-MACOS.md`. All still present on `feat/ios`.
- Two superseded design exports; the Clickable export is the single visual
  reference. Both remain in history at `d7fdd89`.

[v0.1.0]: https://github.com/miftahulmahfuzh/JMTarot/releases/tag/v0.1.0
