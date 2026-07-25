# JMTarot

An offline iOS tarot app. Three reader personas, three services, the 22 Major
Arcana. No accounts, no server, no network calls at runtime, free.

**Read `docs/plans/2026-07-25-tarot-mvp-design.md` before starting work.** It
records every design decision and why, including the ones that look arbitrary.
Do not relitigate decisions in that table without asking.

## Environment

React Native 0.86 requires Node `^20.19.4 || ^22.13.0 || ^24.3.0 || >=25`. It
hard-fails on anything older, including Node 20.11.x.

On Miftah's machine the default `node` on PATH is 20.11.1 and will be rejected;
Node 24 lives at `~/tools/node-v24.18.0-linux-x64/bin` and must be prepended to
PATH for every npm/npx/expo call. Check `node -v` before assuming a build failure
is a code problem.

```sh
npm install
npm run typecheck   # tsc --noEmit
npm run web         # fastest way to see the UI: no Mac, no device
npm start           # then scan the QR with Expo Go on a physical iPhone
```

There is **no iOS Simulator** — neither of us has a Mac. iOS builds and App Store
submission go through EAS Build on hosted macOS. To sanity-check that a change
still bundles for iOS without a device:

```sh
npx expo export --platform ios --output-dir /tmp/jmtarot-export
```

## Do not undo these

Two fixes look like mistakes and will be "corrected" back into bugs if you are
not warned:

1. **Fonts are imported per weight, not from the package barrel.**
   `@expo-google-fonts/cinzel`'s index `require`s every weight at module scope,
   so Metro bundles all 16 TTFs (5.83MB) when only six are used. The subpath
   imports in `src/app/_layout.tsx` cost 1.97MB. Keep them.

2. **The card flip rotates each face separately, 180deg apart.** React Native has
   no `transform-style: preserve-3d`, so flipping a shared parent does not work
   on native. `backfaceVisibility: 'hidden'` on both faces is what makes it read
   as one card. See `src/components/CardFan.tsx`.

Also: `StyleSheet.absoluteFillObject` no longer exists in RN 0.86. Use
`...StyleSheet.absoluteFill`, which is a plain frozen object.

## Styling

`src/theme/tokens.ts` is the single source of truth — colours, typography
(Cinzel + Cormorant Garamond), motion curves. It is a transcription of
`Major Arcana Spread.html`, a Claude Design export kept in the repo as the
visual reference.

**Compose new screens from tokens. Do not introduce new hex values, font sizes or
easing curves** without a reason worth writing down. The design covers only the
3-card draw screen; everything else extends its language.

## Assets

```
assets/major_arcanas/   SOURCE art. Never edit in place, never delete.
assets/cards/           GENERATED, committed. Never hand-edit.
assets/dukuns/          reader portraits, 2:1 landscape scenes
assets/ui/              generated textures
```

Regenerate with the idempotent scripts, never by hand:

```sh
npm run assets   # source PNGs -> uniform 2:3 WebP (60.8MB -> 4.1MB)
npm run cards    # rebuild src/data/cards.json
```

`assets/cards/` is committed on purpose so EAS can build without Python.

The art pads rather than crops to reach 2:3 — cropping clips the card titles on
the 1024x1536 source generation.

**Known issue:** the source art is three visually inconsistent generations (warm
cream frames for cards 0-10, cool navy for 12-21, a third treatment for 11 and
17). A 3-card spread will mix them. Regenerating for one consistent treatment is
the highest-leverage art fix and is cheaper before the reading copy is written.

## Card data

The deck is the 22 Majors, ids 0-21 in Fool's Journey order. Reversals are in.

Card **names stay English** because the artwork has its title rendered into the
image — an Indonesian display name would contradict the card on screen. Keywords
and every word of reading copy are **Indonesian**.

`stage`, `polarity` and `element` exist to feed the combination rule engine
(Majors have no suits, so it keys off journey structure instead). Reversal flips
`polarity` light↔shadow and `yesno` yes↔no; see `src/data/deck.ts`.

## Copy constraints

No reader copy may imply therapy, diagnosis, treatment or healing of trauma.
Apple scrutinises this and JMTarot is not a therapy app. Margaret's specialty was
reworded from "trauma & healing" to "inner reflection" for exactly this reason.

An "entertainment purposes only" disclaimer belongs in onboarding, the result
screen footer, and About.

## Current state

Built: scaffold, design tokens, card dataset, deck logic, `CardFan`, `CardBack`,
`Backdrop`.

Not built: onboarding, reader picker, service picker, result screen, the
combination rule engine, and the ~11k words of reading copy.

**The fan's on-screen geometry is unverified** — it was derived on paper
(`FAN_SPAN 64°`, `PIVOT_D 340`, 88×132 cards) and has never been rendered. Check
it with `npm run web` before building screens on top of it. The ~18pt reveal per
card is the specific thing to judge.
