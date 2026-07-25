# JMTarot — Design

**Date:** 2026-07-25
**Authors:** Miftah, Jodith
**Status:** Validated, ready for implementation

An iOS tarot reading app. Three reader personas, three reading services, 22 Major
Arcana cards. Fully offline, no accounts, no server, free.

**JMTarot** — Jodith Miftah Tarot. This is the name everywhere: App Store
listing, `app.json`, bundle identifier, repository. The word "dukun" survives
only as internal shorthand for a reader (and as the `assets/dukuns/` directory
name); it is never user-facing branding.

---

## 1. Decisions

Each of these was an open fork; recording the reasoning so we don't relitigate.

| Decision | Choice | Why |
|---|---|---|
| Platform | React Native + Expo | No Mac available; EAS Build compiles and submits iOS from Linux |
| Reading text | Pre-written static JSON | No backend, no API keys, no per-reading cost, works offline |
| Monetization | Free | No StoreKit, no tax forms, no Paid Apps Agreement. Validate demand first |
| Deck | 22 Major Arcana | Matches the art we have. Cuts copy from ~19k to ~11k words |
| Reversals | Included | Doubles variety on a small deck; upright+reversed seeds already written |
| Question input | None | Static copy cannot answer typed text. "Hold it in mind" is the honest framing |
| Language | Indonesian | Matches our first market; reader voices land more naturally |
| Combination panel | Rule-based synthesis | 78³ (or 22³) pre-written combos is impossible; rules stay offline |
| Draw layout | Slots top, fan bottom | Most faithful portrait adaptation of the approved design |
| Result | Separate screen | Room for three readings plus the combination panel |
| Reader #2 | Margaret | Matches the generated portrait; Old Soul persona unchanged |
| Analytics | None in MVP | Preserves a "Data Not Collected" privacy label and the simplest review |
| Name | JMTarot | Jodith Miftah Tarot |
| Bundle ID | `com.jmtarot.app` | Brand-aligned. **Immutable** once the app exists in App Store Connect |

### Explicitly out of scope

Chat follow-up, Love/partner two-person spread, iPad, Android, onboarding
carousel, reading history, notifications, sharing.

---

## 2. Architecture

```
Expo (managed) + TypeScript
expo-router                    file-based navigation
react-native-reanimated        fan geometry + flip, all on the UI thread
react-native-gesture-handler   drag-to-lift and tap-to-pick
@react-native-async-storage    four keys, nothing more
expo-haptics                   selection feedback
expo-font                      Cinzel + Cormorant Garamond, bundled
expo-image                     card rendering
```

**Zero network calls.** Content JSON is `import`ed so it compiles into the
bundle. No fetch, no loading states, works in airplane mode.

### Persistence

Four AsyncStorage keys. That is the entire persistence layer.

| Key | Shape | Purpose |
|---|---|---|
| `user.name` | `string` | Greeting |
| `user.birthDate` | `ISO date` | Birth card derivation |
| `daily.lastPull` | `{ date, cardId, reversed }` | One Daily Card per calendar day |
| `reader.preferred` | `readerId` | One-tap daily shortcut target |

Device-local calendar date, no timezone handling.

---

## 3. Data model

### `cards.json` — 22 entries

```json
{
  "id": 0,
  "slug": "00_fool",
  "numeral": "0",
  "name": "The Fool",
  "nameId": "Si Pandir",
  "glyph": "✧",
  "element": "air",
  "stage": "beginning",
  "polarity": "light",
  "yesno": "yes",
  "keywords": ["lompatan", "kepolosan", "percaya"],
  "image": "00_fool.webp"
}
```

`stage` partitions the Fool's Journey: **beginning** 0–7, **trial** 8–14,
**reckoning** 15–21. `polarity` is `light` / `shadow` / `neutral`, and a reversal
flips light↔shadow. Both feed the combination engine.

`yesno` is card-level because a card's polarity does not change by reader — only
the wording does. A reversal inverts `yes`↔`no`; `maybe` stays `maybe`.

### `readers.json` — 3 entries

| Reader | Persona | Specialties |
|---|---|---|
| **Thessaly** — The Grounded Guide | Serious but close to daily life; intuition plus logic, clear and grounded | Career decisions, life direction, problem-solving |
| **Margaret** — The Old Soul | Veteran of decades; mystical and deep, old symbolism and life philosophy, not quick answers | Self-discovery, inner reflection, family relationships |
| **Adrian** — The Modern Mystic | Casual and approachable, like a psychologically-savvy friend; direct but empathetic | Love and relationships, emotion and self-worth, short-term decisions |

Each also carries `positionFraming`, so every reader labels the spread in their
own register — Margaret says *"Yang telah berlalu"*, Adrian says *"Yang udah lewat"*.

> **Copy constraint:** Margaret's original spec listed "trauma & healing".
> Reworded to "inner reflection". Apple scrutinises anything implying therapy,
> and we are not a therapy app. No reader copy may imply diagnosis or treatment.

### `copy/{reader}.json` — 22 blocks × 3 readers

```json
"00_fool": {
  "daily":          { "upright": "...", "reversed": "..." },
  "yesno":          { "upright": "...", "reversed": "..." },
  "interpretation": { "upright": "...", "reversed": "..." }
}
```

`interpretation` is reused across all three spread positions, prefixed by the
reader's `positionFraming`. **132 blocks, ~11k words.** This is the single
largest task in the project.

**Author it offline with Claude, then human-edit.** Persona-consistent copy at
volume with no runtime API call, no cost, no latency, and no App Review
AI-content exposure. Ship the reviewed result as static JSON.

### `combinations/{reader}.json` — the rule engine

Majors have no suits, so the signature keys off journey structure instead:

| Dimension | Values |
|---|---|
| `dominantStage` | `beginning` / `trial` / `reckoning` / `null` (all three differ) |
| `netPolarity` | `light` / `shadow` / `mixed`, after applying reversals |
| `reversedCount` | 0–3 |
| `arc` | `ascending` / `descending` / `mixed` by numeral in draw order |
| `bookend` | contains Fool (0), World (21), both, or neither |
| `dominantElement` | fire / earth / air / water / `null` |

Rules are an ordered list of `{ when, slot, text }` where `slot` is `core` or
`modifier`. Composition takes the highest-priority `core` match plus up to two
`modifier` matches, yielding 2–3 sentences.

**One rule must always match as a fallback**, so no draw can ever render empty.

Roughly 6 core × 8 modifier rules per reader ≈ **40 templates × 3 = 120**.

**Exhaustively testable.** `C(22,3) = 1,540` draws × 8 reversal permutations =
**12,320 states**. A single test enumerates every one and asserts non-empty,
fully-slotted output — eliminating the whole class of "some rare draw renders
blank" bugs.

### Birth card

Digit-sum the birth date, reduce to 0–21, map to a Major. Deterministic,
offline, and it lands perfectly because our deck *is* the 22 Majors.

---

## 4. Screens

```
app/
  _layout.tsx          hydrate storage, gate on onboarding
  onboarding.tsx       Nama + TGL lahir → "Mulai"
  (main)/
    index.tsx          reader picker + one-tap daily shortcut
    [reader]/
      index.tsx        service picker
      draw.tsx         ?service=daily|spread3|yesno
      result.tsx
  about.tsx            disclaimer, credits, privacy link
```

**Onboarding** shows once; the root layout redirects past it when `user.name`
exists. Name and birth date personalize the greeting and derive the birth card.
Nothing else, and nothing leaves the device.

**Reader picker** — vertically stacked wide banner cards. The reader art is 2:1
landscape environmental portraiture, which suits banners and would not work as
side-by-side columns. A **Daily Card widget pinned at the top** uses
`reader.preferred` and drops straight into the draw, making the daily habit one
tap instead of three.

**Service picker** — Daily Card (1 card), 3-Card Spread (3), Yes or No (1).

**Draw** — portrait adaptation, see §5.

**Result** — reader banner across the top, the drawn cards, per-position
readings, then the combination panel. Scrollable. Back returns to the service
picker, never the draw screen, so a stray back-swipe cannot produce a confusing
re-draw.

**Daily Card gating** — if `daily.lastPull.date` is today, skip the draw
entirely and show the stored card with a *"kembali besok"* note. Same card all
day; that is the point of a daily hook.

---

## 5. The draw screen

The approved design is desktop-shaped: `FAN_W 1100 × FAN_H 820`, cards 160×260,
three slots with 100px gaps spanning 680px. Its own `fit()` clamps to a `0.42`
scale floor, which on a 390pt iPhone yields ~67pt cards — unreadable. Portrait
needs a real re-layout, not a scale-down.

```
┌──────────────────────┐
│ ── THE MAJOR ARCANA ─│
│   Draw Three Cards   │
│  slide a card upward │
│  ┌──┐ ┌──┐ ┌──┐      │  slots 90×135
│  └──┘ └──┘ └──┘      │
│  PAST  PRES  FUTUR   │
│       ╱▔▔▔▔▔▔╲       │
│     ╱ 22 cards ╲     │  fan span ~50°
│    │ face-down  │    │
│ ─── 0 of 3 drawn ─── │
└──────────────────────┘
```

**Geometry.** All 22 cards render (no windowing needed at this count). Card `i`
sits at `rotate((i - (n-1)/2) · span/(n-1))` about a `transform-origin` well
below the screen, producing the arc. A single `scrollOffset` shared value
rotates the whole fan.

**Every transform lives in Reanimated shared values and worklets — zero React
re-renders during gesture.** That is the difference between 60fps and jank, and
it is the main thing the source HTML does *not* do (it `setState`s per pointer
move, which is fine in a browser and fatal in RN).

**Interaction**, preserved from the design: drag a card upward *or* tap it to
lift it into the next slot; tap a slotted card to return it to the fan; once
three are drawn, remaining cards dim to `brightness(.55) saturate(.7)`.

**Flip** on `rotateY` with `backfaceVisibility` — a real 3D flip. The back is
drawn procedurally (gold crosshatch, ✧ medallion), so it costs no asset; the
front is the card WebP.

**Reversal** renders as a 180° rotation of the card image.

`expo-haptics` on every selection: one line, disproportionate perceived quality.

**Reduce Motion** — respect `AccessibilityInfo.isReduceMotionEnabled` with a
tappable grid fallback, no fan and no flip.

**Build this first as a standalone spike.** If the fan does not feel right,
nothing downstream matters.

---

## 6. Design tokens

Extracted from the approved HTML; the source of truth for every screen it does
not cover.

```ts
canvas:    '#0a0812'
bgRadial:  ['#221a3a', '#130f22', '#08060f']   // 120% 90% at 50% 4%
gold:      '#c9a227'   goldLift: '#d8b76a'
goldPale:  '#f0dfae'   goldText: '#f2e7c9'
text:      '#e6dcc4'   muted: '#9c93b4'
label:     '#7a7192'   faint: '#6f668a'
cardBack:  ['#1d1636', '#291f4a', '#17112b']   border '#4a3d72'
cardFace:  ['#fbf4e2', '#f1e6cb']              border '#c9a227'
```

**Display:** Cinzel — 10px, `.34em` tracking, uppercase, gold. Used for labels,
eyebrows, buttons.
**Body:** Cormorant Garamond 300, often italic, 17–19px.
Both are Google Fonts under OFL, safe to bundle.

**Motion:** card `.62s cubic-bezier(.22,.9,.24,1)`, flip `.62s
cubic-bezier(.3,.85,.3,1)`.

**Card geometry:** 2:3, `radius 10`. The design's 160×260 is 1:1.63 and would
stretch the art — corrected to **160×240**.

Recurring motifs to carry across new screens: gold hairline dividers flanking
Cinzel eyebrow text, the twinkling starfield layer, and generous vertical
breathing room.

---

## 7. Asset pipeline

`tools/normalize_cards.py` — idempotent, re-runnable when art is regenerated.

Source art arrived in three generations (848×1264 RGBA, 1024×1536 RGB,
~1027×1531 RGB) with different mat widths. The script flattens alpha, trims the
dark mat, then pads symmetrically back to exactly 2:3 at 800×1200 WebP.

**Padding, never cropping** — cropping to 2:3 would clip the card titles on the
1024×1536 generation.

Result: **60.8MB → 4.23MB**, and `assets/cards/NN_slug.webp` in Fool's Journey
order, replacing filenames like `The devil.png` and `wheel_of_fortune.png`.

The card art is a *finished card face* — its own frame, numeral and title. So it
replaces the design's procedural cream front rather than nesting inside it. The
procedural back is kept as-is.

### Known issue: art inconsistency

Three visually distinct generations, matching the three pixel groups exactly:

- **Warm** (0–10): cream/gold frames, sepia-purple palette, ornate flourishes
- **Cool** (12–16, 18–21): navy palette, thin gold frame, dark title bar
- **Odd** (11 Justice, 17 Star): navy with a third frame treatment

A 3-card spread will routinely mix warm and cool cards side by side and read as
a bug. The cool group additionally repeats one composition (star, mountains,
lake, flowers) across all nine.

Regenerating for a single consistent treatment is the highest-leverage art fix
available, and it is cheaper before the copy is written. Not a blocker — the
pipeline is one command.

---

## 8. Shipping

Because there is no server, no login and no payment, most of the usual burden is
gone. What remains:

**Accounts.** Apple Developer Program, $99/yr, individual enrollment. Organization
enrollment needs a D-U-N-S number and ~2 extra weeks; only worth it to show a
company name as seller.

**No Mac** is handled by EAS Build, which compiles and submits from Linux. It
does *not* remove the need for a **physical iPhone** — with no Mac there is no
Simulator, so testing happens on device via a dev build. JS still reloads over
the network; native rebuilds are only needed when adding native modules.

**Required metadata**

- Privacy policy URL — mandatory even at zero collection. GitHub Pages is fine.
- Support URL.
- App Privacy label: **Data Not Collected** (holds only while we ship no analytics).
- `PrivacyInfo.xcprivacy` privacy manifest.
- `ITSAppUsesNonExemptEncryption = false` — no encryption beyond HTTPS.
- App icon 1024×1024, **no alpha channel**.
- Screenshots at current required iPhone sizes. iPhone-only, no iPad.
- Age rating questionnaire.

**Review risks, in order**

1. **Guideline 4.3 — Spam/duplicate.** The real risk. Tarot is among the most
   crowded App Store categories and thin entries get rejected as duplicates. The
   three-reader-persona angle is the differentiator; it must be visible in the
   screenshots and the description, not buried.
2. **Health claims.** No reader copy may imply therapy, diagnosis or treatment.
   Ship an "entertainment purposes only" disclaimer in onboarding, on the result
   screen footer, and in the About screen.
3. **Guideline 2.1 — completeness.** No placeholder copy, no dead ends.

Ship to TestFlight first (internal: 100 testers, no review). Review is usually
under 48h. **Budget for one or two rejections on the first submission.**

---

## 9. Build order

1. Expo scaffold, fonts, design tokens, `cards.json` from the HTML dataset
2. **Fan spike** — the whole app's feel rests here
3. Onboarding, reader picker, service picker
4. Result screen, per-position readings
5. Combination rule engine + the 12,320-state exhaustive test
6. Content authoring — the ~11k words
7. Daily gating, birth card, About, disclaimers
8. Icon, screenshots, privacy policy, EAS Build → TestFlight
