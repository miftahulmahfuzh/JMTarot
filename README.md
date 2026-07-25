# JMTarot

*Jodith Miftah Tarot* — an iOS tarot reading app.

Three reader personas, three reading services, the 22 Major Arcana. Fully
offline: no accounts, no server, no network calls, free.

## Status

Early. The project scaffold, design system, card dataset and the card-fan draw
interaction exist. The reader picker, service picker, result screen, combination
rule engine and reading copy do not yet.

See [`docs/plans/2026-07-25-tarot-mvp-design.md`](docs/plans/2026-07-25-tarot-mvp-design.md)
for the full design and the reasoning behind every decision.

## Setup

Requires Node `^20.19.4 || ^22.13.0 || ^24.3.0 || >=25` — React Native 0.86 will
refuse to build on anything older.

```sh
npm install
npm run web      # fastest way to see the fan, no Mac or device needed
npm start        # then scan the QR with Expo Go on a physical iPhone
```

There is no iOS Simulator without a Mac. Builds and App Store submission go
through EAS Build, which compiles on hosted macOS.

## Layout

```
src/app/            expo-router screens
src/components/     CardFan, CardBack, Backdrop
src/data/           card dataset, deck logic (shuffle, reversals, birth card)
src/theme/          design tokens — the single source of truth for styling
assets/cards/       normalized card art, generated (committed for EAS)
assets/major_arcanas/  source art, never edited in place
assets/dukuns/      reader portraits
tools/              asset and dataset generators
docs/plans/         design documents
```

## Regenerating assets

Both scripts are idempotent — safe to re-run whenever the source art changes.

```sh
npm run assets   # source PNGs -> normalized 2:3 WebP (60.8MB -> 4.1MB)
npm run cards    # rebuild src/data/cards.json
```

## Design provenance

The visual language comes from `Major Arcana Spread.html`, a Claude Design
export kept in the repo as the reference. `src/theme/tokens.ts` is the
transcription of it — colours, typography (Cinzel + Cormorant Garamond) and
motion curves. New screens compose from those tokens rather than inventing
values.

The card artwork is a *finished* card face: its own frame, numeral and title are
part of the image. That is why the design's procedural cream card front was
dropped while the procedural back was kept.

## Licence

Not yet chosen. The bundled fonts are Google Fonts under the SIL Open Font
License.
