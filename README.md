# JMTarot

*Jodith Miftah Tarot* — a mobile-first tarot website, installable to the iPhone
home screen.

Three reader personas, three reading services, the 22 Major Arcana. Readings
are written by an LLM at request time, in Indonesian, in the voice of whichever
reader you picked. Private: two accounts behind a login, no database, and a
reading is never stored.

> This was an offline Expo/React Native iOS app until 2026-07-25. The App Store
> costs $99/yr; a website costs nothing and ships from Linux in one `git push`.
> Everything that mattered survived — the readers, the deck, the Indonesian
> copy, the fan draw — and one thing got better: with a server in the loop,
> readings are generated instead of pre-written.
>
> The iOS tree is preserved on [`feat/ios`](../../tree/feat/ios). The rewrite is
> planned in full in
> [`docs/plans/2026-07-25-jmtarot-web-rewrite.md`](docs/plans/2026-07-25-jmtarot-web-rewrite.md).

## Status

Walkable end to end: log in, pick a reader, pick a service, optionally type a
question, draw from the fan, and read a streamed response.

Deliberately not built yet: onboarding, birth card, the once-per-day card lock,
an About page, and reading history.

Not yet verified on real hardware — touch behaviour, safe-area insets and Add
to Home Screen all need a physical iPhone.

## Setup

Requires Node 20.19+, 22.13+ or 24+. TypeScript is pinned to 5.x on purpose:
7.x is the native port and `next build` cannot use it.

```sh
npm install
cp .env.example .env.local     # then fill it in — see below
npm run dev                    # http://localhost:3000
```

Other scripts:

```sh
npm test          # Vitest — deck, prompt, auth, rate limiter
npm run typecheck # tsc --noEmit
npm run build     # production build; run before trusting a green typecheck
npm run smoke     # one live LLM call: are the key, base URL and model right?
npm run smoke -- --all   # all nine reader x service readings, plus checks
```

### Environment

`.env.example` documents every variable and how to generate the secrets. The
short version:

| Variable | What it is |
|---|---|
| `LLM_PROVIDER` | `zai` or `anthropic` — one adapter serves both |
| `LLM_BASE_URL` | omit for Anthropic proper |
| `LLM_API_KEY` | |
| `LLM_MODEL` | e.g. `glm-4.6` |
| `AUTH_SECRET` | 32+ random bytes, base64 — signs the session cookie |
| `AUTH_USERS` | JSON array of `{u, h}` with bcrypt hashes, cost 12 |

**Escape every `$` as `\$` in `.env` files** — the loader expands `$VAR`, which
silently mangles a bcrypt hash. Do *not* escape when pasting into a hosting
dashboard, where values are literal.

## Deploying

Vercel, from `main` — pushing to `main` deploys to production, and every other
branch gets its own preview URL. No workflow file required.

**[`docs/DEPLOY-VERCEL.md`](docs/DEPLOY-VERCEL.md)** is the step-by-step
version, including the `$`-in-bcrypt-hash trap that will otherwise cost you an
afternoon.

## Layout

```
src/app/              routes: pickers, draw screen, login, API
src/components/       Fan, Slots, CardFace, CardBack, ReadingPanel, Backdrop
src/data/             card dataset, deck logic (shuffle, reversals, birth card)
src/lib/auth/         session signing (jose) and password checking (bcryptjs)
src/lib/llm/          provider interface + the Anthropic-wire adapter
src/lib/prompt/       the three prompt layers and the question sanitizer
src/middleware.ts     the auth gate
src/theme/            design tokens — the single source of truth for styling
public/cards/         normalized card art, generated but committed
assets/major_arcanas/ source art, never edited in place
tools/                asset, icon and dataset generators
docs/plans/           design documents
```

## Regenerating assets

All idempotent — safe to re-run whenever the source art changes.

```sh
npm run assets              # source PNGs -> 800x1200 and 240x360 WebP
npm run cards               # rebuild src/data/cards.json
python3 tools/make_icons.py # home-screen icons
```

`public/cards/` is committed so deploys do not need Python. The pipeline turns
60.8MB of source PNGs into 4.2MB of full-size WebP plus 494KB of thumbnails —
the thumbnails exist because the fan draws all 22 cards at once and the
full-size art would be 4.2MB to paint them.

The art is three visually inconsistent generations, measured and written up in
[`docs/art-inconsistency.md`](docs/art-inconsistency.md). Regenerating it for a
single consistent treatment is the highest-leverage improvement left.

## Design provenance

The visual language comes from `Major Arcana Spread-Real Cards-Card
Clickable.html`, a Claude Design export kept in the repo as the reference — the
three-card fan plus the card detail overlay. `src/theme/tokens.ts` is the
transcription — colours, typography (Cinzel + Cormorant Garamond) and motion
curves — and `src/theme/tokens.css` mirrors it for CSS. New screens compose
from those tokens rather than inventing values.

The card artwork is a *finished* card face: its own frame, numeral and title
are part of the image. That is why the design's procedural cream card front was
dropped while the procedural back was kept, and why card names stay in English
— an Indonesian caption would contradict the title printed on the card.

## Licence

Not yet chosen. The bundled fonts are Google Fonts under the SIL Open Font
License.
