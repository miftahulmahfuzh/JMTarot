# S5 — High-quality wallpaper downloads

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Workstream:** S5 of v0.4.0. **Contract:** `PUBLIC_RELEASE_ROADMAP_v0.4.0.md` §7 (S5),
S-D9, §6.4, §6.5's `package.json` row. **Date:** 2026-07-28.

Precedence: `PUBLIC_RELEASE_ROADMAP_v0.4.0.md` → `docs/plans/2026-07-28-RECONCILIATION-v0.4.0.md`
→ this plan. Where this plan disagrees with the roadmap, **this plan is wrong**.

---

## Goal

Twenty-two pieces of original commissioned art become something a stranger can put on
their phone, at the highest resolution we honestly have, for free, with no account —
and the pipeline that makes them is idempotent, committed, and reads the source art
without ever regenerating it.

Two files per card, both derived from `assets/major_arcanas/*.png` by a Python script in
the shape of `tools/normalize_cards.py`, both served from a **new** path with its **own**
cache header. A download control whose copy exists in both locales, a licence line that
does not contradict `/terms` clause 9, one analytics event, and a verification script in
the shape of `tools/check_card_art.py` that can prove nothing was upscaled or cropped.

**What this is not.** Not a regeneration (S-D9, and `docs/art-inconsistency.md` explains
at length why regenerating is the highest-leverage *art* fix and it is still not
v0.4.0's). Not a runtime image pipeline. Not a new dependency. Not a database row, a
model call, a cookie or a session.

---

## Architecture

```
assets/major_arcanas/NN_slug.png        SOURCE. 22 files, 1024x1536, RGB, no ICC.
        │                               Never edited, never deleted, never reachable
        │                               from the browser. MEASURED: 71.6MB total.
        ▼
tools/make_wallpapers.py                THE PIPELINE. Idempotent. Reads the source,
        │                               writes two derivatives per card. Imports
        │                               normalize_cards.py for `flatten`/`trim_dark_mat`
        │                               ONLY as an assertion, never to resample.
        ▼
public/wallpapers/<url-slug>-card.jpg   1024x1536, the native card. The honest maximum.
public/wallpapers/<url-slug>-phone.jpg  1440x3120, the same pixels UNSCALED, centred on
                                        `color.canvas` (#0a0812). 44 files, 23.77MB.
        │
        ├── tools/check_wallpapers.py   THE ORACLE. Independent of the pipeline: holds
        │                               its own expectations, imports only
        │                               normalize_cards.py. Proves no upscale, no crop.
        │
        ├── src/lib/wallpaper.ts        PURE, CLIENT-IMPORTABLE LEAF. The variant union,
        │                               the dimension table, the URL and the on-disk
        │                               filename. No `process.env`, no `server-only`.
        │
        └── src/components/WallpaperDownload.tsx
                                        'use client'. Two anchors, the licence line, one
                                        event. S3 mounts it in the gallery; S4 may mount
                                        it on a lore page. It needs no session.
```

**The three S-D9 constraints, and where each is enforced mechanically rather than
promised:**

| Constraint | Enforcement |
|---|---|
| No regeneration | The pipeline's only input is `assets/major_arcanas/*.png`. It imports nothing from `tools/gen_card_art.py`, calls no model, and `npm run assets` is never invoked. Task 2's script header records it. |
| No upscaling, no cropping | `check_wallpapers.py` §4 and §5. MEASURED separation of 54× against a cropped negative control and of >13× against an upscaled one. See `## The numbers`. |
| A new path with its own cache header | `/wallpapers/:path*`, declared in `## Deltas requested` for S1 to write into `next.config.ts`, with a `headers.test.ts` case. **It deliberately does NOT inherit `/cards/*`'s one-year `immutable`.** |

### Why `/wallpapers/*` does not get `immutable`, and why that removes the filename question

`next.config.ts`'s `/cards/:path*` comment says `immutable` "is doing real work here and
carries a real cost … if the art is ever regenerated … anyone who has loaded the app will
keep the old art for up to a year", and `src/data/deck.ts`'s `ART_VERSION` is the answer
it settled on — a `?v=N` query, chosen over content-hashing (which "would mean a generated
registry, which is the `cardArt.ts` the web rewrite deleted") and over shortening the
header (which "would pay for one regeneration by giving up caching forever").

**That trade does not transfer, because the traffic shape is the opposite one.** `/cards/*`
serves 22 thumbnails on every cold draw; caching them for a year is worth real money and
real latency. A wallpaper is fetched **once, by a person who tapped a button, and then
never again** — the gallery draws `cards/thumb`, not wallpapers, so there is no repeat
request to save. Caching a wallpaper for a year buys approximately nothing and costs the
whole documented staleness problem.

So the header is:

```
cache-control: public, max-age=86400, stale-while-revalidate=604800
```

and the consequence is that **there is no version in the filename, no content hash, and no
versioned directory** — a regenerated deck propagates within a day on its own. This is the
brief's question 5 answered by declining all three of its options: we did not repeat
`/cards/*`'s mistake, and we did not pay for a registry to avoid it either.

Two things that follow and must not be "tidied":

- **A new deployment already invalidates Vercel's edge copy** (new build, new static
  upload), so the 86400 bounds the *browser's* copy only. That is the copy that outlives a
  deploy and the only one at risk.
- **`ART_VERSION` is deliberately NOT reused.** Importing it would mean either exporting it
  from `src/data/deck.ts` (S4's file in v0.4.0) or duplicating the number, and both buy a
  cache-busting mechanism this path does not need. `src/lib/wallpaper.ts` carries no
  version and its test asserts the built URL contains no `?`.

### The seams

| Seam | Who | What crosses it |
|---|---|---|
| S5 → S1 | `next.config.ts`, `events.ts`, `locales/{id,en}.ts`, `headers.test.ts` | The cache header, one event, nine chrome keys, one header test. All in `## Deltas requested`, exact values given. |
| S5 → S2 | `src/middleware.ts` | **`wallpapers/` must join the matcher's negative lookahead.** §6.2 says a matcher change is a flag; it is F1, and the alternative is worse. |
| S5 → S3 | `WallpaperDownload` | S3 mounts it. Props are `{ cardId, urlSlug, from }`. S5 owns the component and the asset contract; S3 owns placement (§7, S3). |
| S5 → S4 | `cardUrlSlug` in `src/data/deck.ts` | `src/lib/wallpaper.ts` imports it. Task 4 states the prerequisite and the three-line fallback. |
| S5 → terms | `src/app/terms/terms.{id,en}.tsx` | Clause 9 grants no licence to the artwork. F2 and a delta. |

---

## Tech Stack

Nothing new. Python 3.11.0 + **Pillow 12.3.0**, already the toolchain for
`normalize_cards.py`, `generate_cards.py`, `make_icons.py` and `make_ui_assets.py`. Node
24.18.0 for Vitest. No `sharp`, no image CDN, no `next/image` loader, no npm dependency
(roadmap §10).

**One Pillow 12 note:** `Image.Image.getdata` is deprecated and removed in Pillow 14.
`check_card_art.py`'s `mean_colour` uses it; **new code in this plan uses `im.load()` or
`im.tobytes()` instead**, so the two new scripts do not acquire a deprecation warning that
will become an error in 2027.

---

## The numbers

Everything below was measured in this worktree on 2026-07-28. Nothing is extrapolated.

### The source, confirmed

```
assets/major_arcanas/   22 cards + _anchor.png, ALL exactly 1024x1536, mode RGB,
                        NO ICC profile (info keys: []), 2.79-3.77MB each, 71.6MB total.
public/cards/           22 WebP at 800x1200,  3.69MB,  164KB mean
public/cards/thumb/     22 WebP at 240x360,   0.29MB,   13KB mean
public/cards/og/        22 PNG  at 200x300,   1.08MB,   48KB mean
.git                    158MB today
```

### Format: every candidate, measured, at matched fidelity

Mean over six cards (`00_fool`, `11_justice`, `18_moon`, `19_sun`, `07_chariot`,
`13_death`), 1024x1536, PSNR against the source PNG:

| Encoding | mean KB | mean PSNR | min PSNR |
|---|---|---|---|
| PNG, `optimize=True` | 2847 | ∞ | ∞ |
| WebP lossless | ~2000 | ∞ | ∞ |
| PNG quantized to 256 colours | 1381 | — (see below) | — |
| **JPEG q90, 4:4:4** | **555** | **38.00** | 36.94 |
| JPEG q90, 4:2:0 | 472 | 37.19 | 36.27 |
| JPEG q92, 4:4:4 | 621 | 38.94 | 37.99 |
| JPEG q95, 4:4:4 | 809 | 41.04 | 40.26 |
| WebP q90 | 471 | 38.99 | 38.44 |
| WebP q95 | 666 | 41.12 | 40.56 |

Per-channel absolute error, sampled every 7th byte, three cards:

| Encoding | KB | p99.9 error | max error |
|---|---|---|---|
| PNG-256 | 1361–1396 | **17–21** | **69–97** |
| JPEG q90 | 491–546 | 11–13 | 18–24 |
| JPEG q92 | 554–613 | 10–11 | 16–23 |
| JPEG q95 | 730–799 | 8–9 | 13–17 |

And because **65.1% of every source card's pixels are darker than 15% luminance** — this
deck is near-black by design, frame luminance 22–25% against a `--canvas` of ~4% — the
error that matters is the error in the dark:

| Encoding | dark-region PSNR | max error in the dark |
|---|---|---|
| JPEG q85 | 37.64 | 28 |
| **JPEG q90** | **39.15** | **26** |
| JPEG q92 | 40.02 | 23 |
| JPEG q95 | 41.99 | 17 |

### The four findings that decided the format

1. **PNG-256 is 2.6× larger than JPEG q90 *and* measurably worse** (p99.9 error 17–21
   against 11–13; max 69–97 against 18–24). This kills the palette trick outright — and it
   is worth stating because `normalize_cards.py` uses exactly that trick for
   `public/cards/og/` at 200x300 and it is correct there. **It does not scale**: at 200x300
   a 128-colour palette is invisible; at 1024x1536 with smooth dark gradients it bands and
   costs 1.4MB doing it. Do not "reuse the OG approach".

2. **WebP q90 beats JPEG q92 on both axes** (471KB / 38.99dB against 621KB / 38.94dB) —
   about 24% smaller at matched fidelity. **We are not using it, and the reason is the
   target platform, not the encoder.** This product is an iPhone home-screen app. The one
   thing a wallpaper has to do is reach the Photos library, because that is the only place
   iOS's *Set Wallpaper* can read from, and iOS's WebP story in that pipeline is
   inconsistent and version-dependent: Photos does not treat WebP as a native asset type,
   `Add to Photos` on a long-pressed WebP has a history of failing, and a WebP that *did*
   reach the camera roll then failed to send from another app
   ([Signal-iOS #4572](https://github.com/signalapp/Signal-iOS/issues/4572),
   [Apple Community 254807936](https://discussions.apple.com/thread/254807936)).
   **The evidence is anecdotal and version-dependent, which is precisely why the one
   download in this product does not bet on it.** JPEG is the format every Photos app,
   every messenger, every printer and every OS accepts. The 6.6MB WebP would have saved is
   not worth a download button that silently does nothing on the platform we built for.

3. **4:4:4, not 4:2:0**, for 83KB per card. The art's distinguishing mark is a **gold
   hairline** on a navy or cream frame — a thin, high-chroma line on a low-chroma ground,
   which is the exact content chroma subsampling smears. 4:2:0 also costs 0.8dB overall
   and 0.9dB in the dark for that saving.

4. **q90 over q92 and q95.** q92 buys **one level** of p99.9 error for +12% bytes; q95
   buys three for +46% (5.5MB of git on the card variant alone). At 1024 and 1440 px wide
   on a 400–460ppi screen, one level out of 255 is not a thing anybody sees; 5.5MB in a
   repository is. **q92 is the one-line lever if a real iPhone ever shows blocking in a
   dark gradient** (loop 6, and it is the only instrument that can answer it) — change
   `QUALITY` in one place, re-run, and the weight goes 23.77MB → ~26.6MB.

### The committed weight — measured over all 22, at the recommended settings

`JPEG, quality=90, subsampling=0, progressive=True, optimize=True`:

```
  0 the-fool                 491KB     530KB      12 the-hanged-man           429KB     468KB
  1 the-magician             442KB     480KB      13 death                    539KB     577KB
  2 the-high-priestess       497KB     536KB      14 temperance               470KB     508KB
  3 the-empress              553KB     591KB      15 the-devil                469KB     507KB
  4 the-emperor              614KB     654KB      16 the-tower                440KB     478KB
  5 the-hierophant           457KB     496KB      17 the-star                 445KB     483KB
  6 the-lovers               516KB     554KB      18 the-moon                 546KB     585KB
  7 the-chariot              584KB     624KB      19 the-sun                  655KB     695KB
  8 strength                 483KB     522KB      20 judgement                523KB     561KB
  9 the-hermit               490KB     528KB      21 the-world                523KB     561KB
 10 wheel-of-fortune         505KB     544KB
 11 justice                  513KB     551KB      (columns: -card.jpg, -phone.jpg)

22 card    11.45 MB
22 phone   12.32 MB
TOTAL      23.77 MB   44 files, 528KB mean
```

**23.77MB committed.** Context: the repository already carries 71.6MB of source PNGs in
`assets/major_arcanas/` and `.git` is 158MB, so this is a **+15% increase in `.git`**, paid
once, in blobs that never change until the art does. Vercel serves them as static assets
from the CDN; they enter no function bundle.

**If that is judged too large, the levers in order of preference** — and on-the-fly
generation is not among them, because `public/cards/` is committed precisely so the deploy
needs no Python:

1. **Drop the `card` variant** (−11.45MB, → 12.32MB). The phone variant contains the same
   1024x1536 pixels, unscaled, so `card` is genuinely redundant *as pixels* — it exists so
   somebody who wants the artwork rather than a wallpaper is not handed 792px of empty
   backdrop above and below it. The roadmap fixes the count at two (§7, S5: "Two variants
   per card"), so this is Miftah's call and not the executing agent's.
2. **q88** (measure it; ~−1.5MB) or **q85** (−1.9MB, dark-region PSNR 39.15 → 37.64).
3. **4:2:0** (−3.6MB, and it is the gold hairline that pays).

### Variant B: why 1440x3120, and why nothing is upscaled

The phone variant is the native 1024x1536 card, **not resampled by a single pixel**,
centred at (208, 792) on a 1440x3120 canvas filled with `color.canvas` (`#0a0812`, from
`src/theme/tokens.ts` — no new token).

**Why not upscale, when a wallpaper narrower than the screen is the obvious complaint?**
Because 1024x1536 is the true resolution and an upscale is a lie told in a filename
(S-D9). A 2× export contains no information the 1× does not; it merely makes the file
four times larger and moves the interpolation from the device's scaler — which is
hardware, tuned, and running on the actual panel — into our build. **Padding is the honest
answer**, and it is the same answer `## Assets` already records for the 2:3 fit: "the art
pads rather than crops".

**Why 1440x3120 specifically.** Real device pixel dimensions:

| Device | pixels | aspect (w/h) |
|---|---|---|
| Galaxy S24/S25 Ultra | 1440×3120 | 0.4615 |
| iPhone 15 Plus / 16 Plus | 1290×2796 | 0.4614 |
| iPhone 15 / 16 | 1179×2556 | 0.4612 |
| iPhone 16 Pro Max | 1320×2868 | 0.4603 |
| Pixel 8 / Galaxy S24 | 1080×2400 | 0.4500 |
| iPhone SE 3 | 750×1334 | 0.5622 |

1440 is the widest pixel width in common circulation, so **no phone ever upscales this
file** — the strongest available form of "no upscaling": we do not do it, and we do not
make the device do it either. And 3120 puts the aspect at 0.4615, within **0.5%** of every
modern iPhone, so the aspect-fill crop on an iPhone is under one percent.

**The card survives an aspect-fill crop on every plausible screen, and that is arithmetic
rather than hope.** The card occupies 1536/3120 = **49.2%** of the canvas height. A device
that aspect-fills a 0.4615 image onto a 16:9 screen (0.5625) shows 0.4615/0.5625 = **82%**
of the height; onto a 4:3 tablet (0.75), **61.5%**. Both exceed 49.2%, so the whole card is
visible with margin to spare. Checked concretely on an iPhone SE 3: scaled to fill 750px
of width the image is 1625px tall against a 1334px screen, cropping 145px from each end,
and the card sits from y=412 to y=1212 — comfortably inside.

**The card at 71.1% of screen width** (1024/1440) reads as a framed object with margin,
which is what a lock screen wants: iOS puts the clock at roughly 12–20% of the height and
the card's top edge is at 792/3120 = **25.4%**, so they do not collide.

Two things deliberately *not* on the canvas:

- **No gradient.** `color.bgRadial` exists and the app paints a radial behind cards, but a
  subtle dark gradient in 8-bit sRGB bands on an OLED panel, and a flat region costs
  essentially nothing to encode — **measured: the 1440x3120 padded file is only 39KB
  larger than the bare 1024x1536 card**, because a flat area is DC-only. A gradient would
  spend real bytes to introduce a real artefact.
- **No card name, no glyph, no gold rule.** The regenerated deck carries **no text at all**
  by design (`## Card data`; `CardFace` draws the name at small sizes), so burning a name
  into a wallpaper contradicts the deck and cannot be undone by the person who downloaded
  it. `src/app/s/[slug]/Cinzel-Variable.ttf` exists and PIL could render it — recorded so
  a future session knows it is possible and was declined, not overlooked.

### The verification thresholds, and their negative controls

Every number below is measured across all 22 cards, with a negative control that a wrong
pipeline would produce:

| Check | Measured, correct output | Negative control | Threshold |
|---|---|---|---|
| Card MAD vs source (64×96 downsample) | 0.123 – 0.188 | **10.174** (crop, then rescale to 1024×1536) | **≤ 1.0** — a 54× margin |
| Phone inner-region MAD vs source | 0.123 – 0.188 | same | **≤ 1.0** |
| Left-bar stddev (x < 204) | **0.000** on all 22 | **19.88** (card upscaled to fill the width) | **≤ 1.5** |
| Left-bar mean RGB | exactly (10, 8, **19**) on all 22 | — | within **±3** of (10, 8, 18) |

**The bar colour drifts by exactly one level of blue, on every card, deterministically** —
`#0a0812` = (10, 8, 18) goes in and (10, 8, 19) comes out, because JPEG's DCT quantization
moves it. So the oracle asserts a tolerance and never equality. An oracle written with
`== (10,8,18)` fails on correct output, and the fix somebody reaches for at that point is
to delete the check.

**The bar-flatness check is `check_card_art.py`'s `EDGE_UNIFORM_STDDEV` used in reverse.**
There, a flat edge strip is a *failure* (a letterbox bar means the source is not full
bleed). Here, a flat bar is the *proof* that the card was padded rather than scaled to
fill. Same constant, same instrument, opposite verdict — worth a comment in both files so
neither is "fixed" to agree with the other.

### Idempotency, proved

Re-encoding all 44 files from the same sources and comparing SHA-256:
**`byte-identical on re-encode: True (0 differing)`.** Pillow's JPEG encoder is
deterministic for fixed parameters and writes no timestamp; `progressive`, `optimize`,
`subsampling` and `quality` are all pinned in one constant block. Task 3 proves the same
thing the way that matters here — `git status --porcelain public/wallpapers` is empty after
a second run.

---

## Decisions

- **W-D1. Two variants, `card` and `phone`.** Fixed by the roadmap (§7, S5). `card` is the
  honest maximum for anyone who wants the artwork; `phone` is the one that reaches a lock
  screen. Any third variant (tablet, desktop, an OG-sized one) is a later release's.
- **W-D2. JPEG q90, 4:4:4, progressive, optimized.** `## The numbers` finding 4.
- **W-D3. 1440x3120 phone canvas, card centred, `color.canvas` flat.** Above.
- **W-D4. No version in the URL. `cache-control: public, max-age=86400,
  stale-while-revalidate=604800`.** Above.
- **W-D5. Filenames are `<url-slug>-<variant>.jpg`, the S-D4 URL slug and never the art
  slug.** `/wallpapers/the-moon-phone.jpg`, not `18_moon`. `/wallpapers/*` is a public
  address and S-D4 governs public addresses; and a leading number with an underscore in a
  person's Downloads folder is worth nothing. **VERIFIED: deriving the URL slug from
  `Card.name` by `lower() → non-alphanumeric to hyphen → strip` reproduces roadmap §3.2's
  table exactly for all 22**, including the four that carry no article and
  `wheel-of-fortune`.
- **W-D6. The oracle does not import the pipeline.** `check_card_art.py` imports
  `normalize_cards.py` to share the mat-trimmer, and that is right for a *shared
  algorithm*. It is wrong for an *expectation*: an oracle that reads its dimensions from
  the thing it is checking cannot catch a wrong dimension. `check_wallpapers.py` holds its
  own 22-slug table, its own dimensions and its own thresholds, and imports
  `normalize_cards.py` only for `flatten`/`trim_dark_mat`.
- **W-D7. The pipeline asserts against `trim_dark_mat` and never resamples through
  `fit_to_ratio`.** This is the subtlest trap in the workstream. `normalize_cards.py`'s
  `fit_to_ratio` scales the trimmed image up to the target — so if `trim_dark_mat` ever
  removes 4px of width, `fit_to_ratio` would LANCZOS 1020→1024 and produce an upscale,
  which is precisely what S-D9 forbids, from inside the function that looks like the
  correct one to reuse. The pipeline therefore **asserts** `size == (1024, 1536)` and
  `trim_dark_mat(flatten(im))` losing ≤4px, and then uses the **untouched source pixels**.
  A source that fails the assertion is a source to fix, not a source to resample.
- **W-D8. The download is a real `<a download>`, progressively upgraded to
  `navigator.share`.** The anchor is the contract: it works with no JavaScript, needs no
  session, and is a crawlable link to an image. The upgrade exists because on iOS
  `<a download>` lands the file in **Files**, and *Set Wallpaper* can only read **Photos** —
  the share sheet's "Save Image" is the one path that gets there in one tap. `navigator.share`
  is already the sanctioned mechanism on a public page (S-D8).
- **W-D9. The upgrade is gated on `navigator.canShare({files})` **and**
  `matchMedia('(pointer: coarse)')`.** A capability test, never a UA sniff. It names the
  real condition: on a touch device the share sheet is how a file reaches a photo library;
  on a desktop, a download is what the person asked for and hijacking it into an OS share
  sheet is worse than the default.
- **W-D10. No `content-disposition: attachment` on `/wallpapers/*`.** It would force a
  download and make the image impossible to *view* — and viewing is the prerequisite for
  iOS's long-press → **Add to Photos**, the fallback when the share sheet is unavailable.
  The `download` attribute achieves the same filename without disabling the other path.
- **W-D11. `wallpaper.downloaded` carries `card_id: number`, not a slug.** `events.ts`
  rule 3: "IDS ARE IDS. `card_id` is the integer, not the name." Every existing card event
  (`draw.card_picked`, `memory.frequency_shown`) uses the integer, and the brief's word
  "slug" loses to the file's own stated rule. Both are closed sets; consistency across 60
  event names is the tiebreak.

---

## Task 1: The oracle, failing on an empty tree

**Files:** `tools/check_wallpapers.py` (new).

### The failing run

```sh
cd /home/miftah/tarot_app/.worktrees/v0.4.0-seo
python3 tools/check_wallpapers.py
```

**Expected failure:** exit 1 with `missing output directory: public/wallpapers` — the
directory does not exist, so all 44 expected files are absent. That is the oracle
correctly reporting an unbuilt tree, not a broken oracle: it imports only
`tools/normalize_cards.py`, which already exists.

### Implementation

```python
#!/usr/bin/env python3
"""Grade public/wallpapers/ against S-D9's three constraints.

The other half of tools/make_wallpapers.py, and DELIBERATELY INDEPENDENT OF IT.

`tools/check_card_art.py` imports `normalize_cards.py`, and that is right: the two
files need to agree about what "a dark mat" is, so sharing the ALGORITHM removes a
class of drift. It is the wrong pattern for an EXPECTATION. An oracle that reads
its dimensions, its slug list and its thresholds out of the pipeline cannot catch
a wrong dimension, a renamed card or a quality slip -- it can only confirm that
the pipeline agrees with itself. So this file holds its own table, its own
numbers, and imports `normalize_cards.py` for `flatten`/`trim_dark_mat` only.

    python3 tools/check_wallpapers.py

Exit 0 if every check passes, 1 otherwise. There are no advisory checks here: a
wallpaper is a file a stranger downloads once, so every property below is either
true or the download is wrong.

── WHERE THE NUMBERS COME FROM ──────────────────────────────────────────────
docs/plans/2026-07-28-wallpapers.md `## The numbers`, measured across all 22 cards
on 2026-07-28, each with a negative control that a WRONG pipeline would produce:

  card MAD vs source        0.123-0.188   crop-then-rescale scores 10.174  (54x)
  phone inner-region MAD    0.123-0.188   same control
  left-bar stddev           0.000         upscale-to-fill scores 19.88
  left-bar mean RGB         (10, 8, 19)   the token is (10, 8, 18)

THE BAR COLOUR DRIFTS BY EXACTLY ONE LEVEL OF BLUE, ON EVERY CARD. #0a0812 is
(10,8,18) going in and (10,8,19) coming out, because JPEG's DCT quantization moves
it. This check therefore asserts a TOLERANCE and never equality -- an oracle
written with `== (10,8,18)` fails on correct output, and what somebody does at
that point is delete the check.

AND THE FLATNESS CHECK IS check_card_art.py's EDGE_UNIFORM_STDDEV USED IN REVERSE.
There a flat edge strip is a FAILURE: it means the source art is not full bleed.
Here a flat bar is the PROOF that the card was padded rather than scaled to fill,
which is the whole of S-D9's "no upscaling". Same instrument, opposite verdict. Do
not "fix" either file to agree with the other.
"""

import importlib.util
import statistics
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/major_arcanas"
OUT = ROOT / "public/wallpapers"

# ── The expectations. HELD HERE, NOT IMPORTED. See the header.
CARD_W, CARD_H = 1024, 1536
PHONE_W, PHONE_H = 1440, 3120
CANVAS = (10, 8, 18)          # src/theme/tokens.ts color.canvas #0a0812
CANVAS_TOL = 3                # measured drift is exactly +1 on blue
BAR_STDDEV_MAX = 1.5          # correct: 0.000; upscale-to-fill control: 19.88
MAD_MAX = 1.0                 # correct: 0.123-0.188; crop control: 10.174

# A truncated write is a small VALID jpeg, so a floor is a real check. Measured
# range across 44 files: 429-695KB. The ceiling catches a quality slip upward.
MIN_BYTES = 150 * 1024
MAX_BYTES = 1_500 * 1024

# The total is asserted so a future quality bump cannot silently triple the
# repository. Measured 23.77MB; the budget is deliberately close.
TOTAL_BUDGET_BYTES = 30 * 1024 * 1024

# (art slug, url slug) -- roadmap v0.4.0 §3.2, WHICH IS THE CONTRACT. A mismatch
# is a failing check and not a judgement call, because a slug is a permanent
# public address and a rename is a 301 nobody will remember to write.
CARDS = [
    ("00_fool", "the-fool"),
    ("01_magician", "the-magician"),
    ("02_high_priestess", "the-high-priestess"),
    ("03_empress", "the-empress"),
    ("04_emperor", "the-emperor"),
    ("05_hierophant", "the-hierophant"),
    ("06_lovers", "the-lovers"),
    ("07_chariot", "the-chariot"),
    ("08_strength", "strength"),
    ("09_hermit", "the-hermit"),
    ("10_wheel_of_fortune", "wheel-of-fortune"),
    ("11_justice", "justice"),
    ("12_hanged_man", "the-hanged-man"),
    ("13_death", "death"),
    ("14_temperance", "temperance"),
    ("15_devil", "the-devil"),
    ("16_tower", "the-tower"),
    ("17_star", "the-star"),
    ("18_moon", "the-moon"),
    ("19_sun", "the-sun"),
    ("20_judgement", "judgement"),
    ("21_world", "the-world"),
]

OX, OY = (PHONE_W - CARD_W) // 2, (PHONE_H - CARD_H) // 2


def load_normalize():
    """Share the mat-trimmer, never the expectations. See the header."""
    spec = importlib.util.spec_from_file_location("nc", ROOT / "tools/normalize_cards.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def mad(a: Image.Image, b: Image.Image) -> float:
    """Mean absolute per-channel difference on a 64x96 downsample.

    Downsampled on purpose: this asks "is this the same COMPOSITION", not "are
    these the same bytes". JPEG noise moves it by 0.2; a crop moves it by 10.

    `tobytes()` rather than `getdata()` -- the latter is deprecated in Pillow 12
    and removed in 14, and check_card_art.py's `mean_colour` will have to follow.
    """
    A = a.convert("RGB").resize((64, 96), Image.BILINEAR).tobytes()
    B = b.convert("RGB").resize((64, 96), Image.BILINEAR).tobytes()
    return sum(abs(x - y) for x, y in zip(A, B)) / len(A)


def bar_stats(im: Image.Image) -> tuple[float, tuple[float, float, float]]:
    """Stddev and mean colour of the LEFT padding bar.

    Sampled every 37th row, because 3120 rows x 200 columns is 624k pixel reads
    per card for a number that does not move. 37 is coprime with nothing in
    particular; it just is not a factor of the height.
    """
    grey, rgb = im.convert("L").load(), im.convert("RGB").load()
    xs = range(0, OX - 4)
    ys = range(0, PHONE_H, 37)
    sd = statistics.pstdev([grey[x, y] for x in xs for y in ys])
    sample = [rgb[x, y] for x in range(0, OX - 4, 7) for y in ys]
    mean = tuple(sum(p[i] for p in sample) / len(sample) for i in range(3))
    return sd, mean


def main() -> None:
    if not OUT.is_dir():
        sys.exit(f"missing output directory: {OUT}\nrun: npm run wallpapers")
    nc = load_normalize()

    expected = {f"{u}-{v}.jpg" for _, u in CARDS for v in ("card", "phone")}
    present = {p.name for p in OUT.iterdir() if p.is_file()}

    fails: list[str] = []

    # ── 1. Completeness, and NO EXTRAS. An extra file is a stale slug left over
    # from a renamed card, which is the exact drift the /cards/* immutable
    # warning is about -- a live URL nothing in the UI links to any more.
    for name in sorted(expected - present):
        fails.append(f"missing: {name}")
    for name in sorted(present - expected):
        fails.append(f"unexpected file (stale slug?): {name}")

    total = 0
    print(f"{'file':34s} {'size':>10s} {'KB':>7s} {'MAD':>6s} {'bar sd':>7s} {'bar rgb':>16s}")

    for art, url in CARDS:
        source = Image.open(SRC / f"{art}.png")

        # ── 2. THE SOURCE IS UNTOUCHED AND FULL BLEED. Asserted here as well as
        # in the pipeline, because this is the assumption every other check rests
        # on: if the source were not exactly 1024x1536 the pipeline would have had
        # to resample, and "no upscaling" would be untestable.
        if source.size != (CARD_W, CARD_H):
            fails.append(f"{art}.png is {source.size}, want {(CARD_W, CARD_H)}")
            continue
        trimmed = nc.trim_dark_mat(nc.flatten(source))
        lost = (CARD_W - trimmed.size[0], CARD_H - trimmed.size[1])
        if lost[0] > 4 or lost[1] > 4:
            fails.append(f"{art}.png has a {lost} mat -- the pipeline would have to resample")

        for variant, want in (("card", (CARD_W, CARD_H)), ("phone", (PHONE_W, PHONE_H))):
            path = OUT / f"{url}-{variant}.jpg"
            if not path.is_file():
                continue
            n = path.stat().st_size
            total += n
            im = Image.open(path)

            # ── 3. Format, mode and geometry, exactly.
            if im.format != "JPEG":
                fails.append(f"{path.name}: format {im.format}, want JPEG")
            if im.mode != "RGB":
                fails.append(f"{path.name}: mode {im.mode}, want RGB (no alpha)")
            if im.size != want:
                fails.append(f"{path.name}: {im.size}, want {want}")
            if not (MIN_BYTES <= n <= MAX_BYTES):
                fails.append(
                    f"{path.name}: {n} bytes, want {MIN_BYTES}-{MAX_BYTES} "
                    "(a truncated write is a small VALID jpeg)"
                )

            # ── 4. NOT CROPPED. Same composition as the source, within JPEG noise.
            region = im.crop((OX, OY, OX + CARD_W, OY + CARD_H)) if variant == "phone" else im
            d = mad(source, region)
            if d > MAD_MAX:
                fails.append(
                    f"{path.name}: MAD {d:.3f} vs source > {MAD_MAX} -- cropped or "
                    "reframed (a crop-then-rescale control measures 10.17)"
                )

            # ── 5. NOT UPSCALED. A padded card leaves flat bars at the token
            # colour. A card scaled to fill has no bars at all: the control
            # measures 19.88 against 0.000 here.
            sd, mean = (bar_stats(im) if variant == "phone" else (0.0, CANVAS))
            if variant == "phone":
                if sd > BAR_STDDEV_MAX:
                    fails.append(
                        f"{path.name}: left-bar stddev {sd:.2f} > {BAR_STDDEV_MAX} -- the "
                        "card was scaled to fill rather than padded"
                    )
                if any(abs(mean[i] - CANVAS[i]) > CANVAS_TOL for i in range(3)):
                    fails.append(
                        f"{path.name}: bar mean {tuple(round(c, 1) for c in mean)} is not "
                        f"{CANVAS} +/-{CANVAS_TOL} -- wrong backdrop colour"
                    )

            print(
                f"{path.name:34s} {'x'.join(map(str, im.size)):>10s} {n/1024:>7.0f} "
                f"{d:>6.3f} {sd:>7.3f} {str(tuple(round(c) for c in mean)):>16s}"
            )

    # ── 6. The total. Asserted so a quality bump cannot silently triple the repo.
    print(f"\n{len(present)} files, {total/1e6:.2f}MB "
          f"(budget {TOTAL_BUDGET_BYTES/1e6:.0f}MB, mean {total/max(1,len(present))/1024:.0f}KB)")
    if total > TOTAL_BUDGET_BYTES:
        fails.append(f"total {total/1e6:.2f}MB exceeds the {TOTAL_BUDGET_BYTES/1e6:.0f}MB budget")

    print("=" * 72)
    if fails:
        for f in fails:
            print(f"  FAIL  {f}")
        print(f"{len(fails)} check(s) failed.")
        sys.exit(1)
    print("all checks passed.")
    print(
        "\nNOW LOOK AT tools/_wallpapersheet.jpg. No measurement here catches: a card\n"
        "that is beautiful at 88x132 and muddy at 1024x1536, a composition whose\n"
        "centre of interest sits where an iOS clock lands, or JPEG blocking in a dark\n"
        "gradient -- which only a REAL PHONE (loop 6) can answer."
    )


if __name__ == "__main__":
    main()
```

### The green run

There is none yet, by design — Task 2 makes it green. Confirm only that the failure is the
intended one and names the fix:

```sh
python3 tools/check_wallpapers.py; echo "exit=$?"
# missing output directory: .../public/wallpapers
# run: npm run wallpapers
# exit=1
```

### Commit

```
S5: the wallpaper oracle, before the wallpapers

tools/check_wallpapers.py grades public/wallpapers/ against S-D9's three
constraints. It holds its own slug table, dimensions and thresholds rather
than importing them from the pipeline: an oracle that reads its expectations
out of the thing it checks can only confirm that thing agrees with itself.

Every threshold has a measured negative control -- a crop scores MAD 10.17
against 0.19, an upscale-to-fill scores bar stddev 19.88 against 0.000.

Fails today with "missing output directory", which is the point.
```

---

## Task 2: The pipeline

**Files:** `tools/make_wallpapers.py` (new), `.gitignore` (one line).

### The failing test

```sh
python3 tools/check_wallpapers.py; echo "exit=$?"
```

**Expected failure:** the Task 1 failure, unchanged — `missing output directory:
public/wallpapers`, exit 1.

### Implementation

```python
#!/usr/bin/env python3
"""Derive downloadable wallpapers from the committed source art.

    python3 tools/make_wallpapers.py     # or: npm run wallpapers

Reads  assets/major_arcanas/NN_slug.png      (LEFT UNTOUCHED)
Writes public/wallpapers/<url-slug>-card.jpg   1024x1536, the native card
       public/wallpapers/<url-slug>-phone.jpg  1440x3120, that card UNSCALED on a mat
       tools/_wallpapersheet.jpg               for eyeballing (gitignored)

Idempotent: re-running writes byte-identical files. VERIFIED by SHA-256 over all
44 on 2026-07-28 -- Pillow's JPEG encoder is deterministic for fixed parameters
and writes no timestamp, and every parameter is pinned in ENCODE below.

── THE THREE CONSTRAINTS THIS FILE EXISTS TO HONOUR (roadmap v0.4.0 S-D9) ──────

1. **THE ART IS NEVER REGENERATED.** Generating the deck is expensive and the
   current art is the product's best asset. Nothing here imports
   tools/gen_card_art.py, calls a model, or runs `npm run assets`. The only input
   is the 22 committed PNGs.

2. **NOTHING IS UPSCALED AND NOTHING IS CROPPED.** 1024x1536 is the true
   resolution; a 2x export is a lie in a filename. So the phone variant is the
   native card CENTRED ON A MAT, and the card variant is the source pixels with
   nothing done to them but a JPEG encode.

   **AND THIS IS WHERE THE TRAP IS.** The obvious reuse is
   `normalize_cards.py`'s `fit_to_ratio`, which trims a dark mat and then scales
   the result to the target. On art that is already correct that costs nothing --
   measured 0px trimmed on all 22 -- but if the trim ever removes 4px of width,
   `fit_to_ratio` LANCZOSes 1020 -> 1024 and produces an UPSCALE, from inside the
   function that looks like the right one to call. So this file uses
   `flatten`/`trim_dark_mat` as an ASSERTION and then reads the untouched source.
   A source that fails the assertion is a source to fix.

3. **THE OUTPUT PATH IS ITS OWN, WITH ITS OWN CACHE HEADER.** `public/wallpapers/`,
   never under `public/cards/`. `/cards/*` carries `max-age=31536000, immutable` on
   non-content-hashed filenames -- correct there, because the fan pulls 22 files on
   every cold draw -- and `/wallpapers/*` carries `max-age=86400,
   stale-while-revalidate=604800` instead, because a wallpaper is fetched ONCE by
   somebody who tapped a button. That is also why there is no `?v=` and no content
   hash in these filenames: a regenerated deck propagates in a day on its own.

── WHY JPEG, WHEN WEBP IS 24% SMALLER AT MATCHED FIDELITY ──────────────────────
Measured, not assumed: WebP q90 is 471KB at PSNR 38.99 against JPEG q92's 621KB at
38.94. We ship JPEG anyway, and the reason is the target platform. The one thing a
wallpaper must do is reach the iOS Photos library, because Set Wallpaper reads
from nowhere else, and iOS's WebP story in that pipeline is inconsistent and
version-dependent -- Photos does not treat WebP as a native asset type and
"Add to Photos" on a long-pressed WebP has a history of failing. JPEG is accepted
by every Photos app, messenger, printer and OS. 6.6MB of git is not worth a
download button that silently does nothing on the platform this app is built for.

q90 rather than q92 or q95: 65.1% of this deck's pixels are darker than 15%
luminance, and the p99.9 per-channel error runs 11-13 at q90, 10-11 at q92 and 8-9
at q95. q92 buys ONE level for 12% more bytes; q95 buys three for 46%. Change
QUALITY here if a real phone (loop 6) ever shows blocking in a dark gradient --
that is the only instrument that can answer it.

4:4:4 rather than 4:2:0, for 83KB a card: this deck's signature is a thin GOLD
HAIRLINE on a navy or cream frame, which is exactly the content chroma subsampling
smears.
"""

import re
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from normalize_cards import ARCANA, flatten, trim_dark_mat  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/major_arcanas"
OUT = ROOT / "public/wallpapers"
SHEET = ROOT / "tools/_wallpapersheet.jpg"
CARDS_JSON = ROOT / "src/data/cards.json"

CARD_W, CARD_H = 1024, 1536

# 1440x3120 is 19.5:9 and the WIDEST pixel width in common circulation (Galaxy
# S24/S25 Ultra), so NO PHONE EVER UPSCALES THIS FILE -- the strongest available
# form of "no upscaling": we do not do it, and we do not make the device do it.
# Within 0.5% of every modern iPhone's aspect (0.4600-0.4614), so the aspect-fill
# crop on an iPhone is under one percent.
#
# The card is 1536/3120 = 49.2% of the height, so it SURVIVES an aspect-fill crop
# on anything: a 16:9 screen shows 82% of the height, a 4:3 tablet 61.5%. Checked
# concretely on an iPhone SE 3 (750x1334): the card lands at y=412..1212 inside a
# visible band of 145..1479.
#
# The card's top edge is at 25.4% of the height and iOS puts the clock at roughly
# 12-20%, so they do not collide.
PHONE_W, PHONE_H = 1440, 3120

# src/theme/tokens.ts `color.canvas` = #0a0812. NOT a new token, and NOT
# `color.bgRadial`: a subtle dark gradient in 8-bit sRGB bands on an OLED panel,
# and the flat mat is nearly free -- measured, the padded 1440x3120 file is only
# 39KB larger than the bare 1024x1536 card, because a flat region is DC-only.
CANVAS = (10, 8, 18)

ENCODE = dict(quality=90, optimize=True, progressive=True, subsampling=0)

VARIANTS = ("card", "phone")


def url_slug(name: str) -> str:
    """`The Moon` -> `the-moon`. Roadmap v0.4.0 S-D4.

    A SECOND identifier, derived, never the art filename: `Card.slug` addresses a
    file and this addresses a document a person found by typing words.
    Underscores and a leading number are worth nothing in a URL.

    VERIFIED to reproduce roadmap §3.2's table exactly for all 22, including the
    four cards that carry no article (strength, justice, death, temperance) and
    `wheel-of-fortune`. Neither is a special case; both fall out of the rule.
    """
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def read_names() -> dict[str, str]:
    """art slug -> English card name, from the generated deck data.

    `src/data/cards.json` rather than a table here, so the URL slug follows the
    card's name and there is one fewer hand-maintained mapping -- the thing
    normalize_cards.py's header records as having made adding a card error-prone.
    """
    import json

    return {c["slug"]: c["name"] for c in json.loads(CARDS_JSON.read_text())}


def main() -> None:
    if not SRC.is_dir():
        sys.exit(f"missing source directory: {SRC}")
    names = read_names()
    missing = [f"{s}.png" for s in ARCANA if not (SRC / f"{s}.png").is_file()]
    if missing:
        sys.exit(f"missing source art: {', '.join(missing)}")

    OUT.mkdir(parents=True, exist_ok=True)

    thumbs, totals = [], {v: 0 for v in VARIANTS}
    print(f"{'card':22s} {'url slug':20s} {'card kb':>8s} {'phone kb':>9s}")

    for art in ARCANA:
        url = url_slug(names[art])
        source = Image.open(SRC / f"{art}.png")

        # ── THE ASSERTION THAT REPLACES A RESAMPLE. See constraint 2 in the
        # header. Failing loudly here is the whole mechanism: the alternative is
        # a silent LANCZOS that turns "the honest maximum" into a 4px upscale.
        if source.size != (CARD_W, CARD_H):
            sys.exit(
                f"{art}.png is {source.size}, want {(CARD_W, CARD_H)}. "
                "This pipeline never resamples -- fix the source."
            )
        flat = flatten(source)
        trimmed = trim_dark_mat(flat)
        lost = (CARD_W - trimmed.size[0], CARD_H - trimmed.size[1])
        if lost[0] > 4 or lost[1] > 4:
            sys.exit(
                f"{art}.png carries a {lost} dark mat. Padding it back would mean "
                "scaling the artwork up, which S-D9 forbids -- fix the source."
            )

        # `flat` and not `source`: identical pixels for an RGB PNG with no alpha
        # (which all 22 are, verified -- mode RGB, no ICC profile), and it means a
        # source that ever arrives with an alpha channel is composited onto the
        # mat colour rather than onto white by the JPEG encoder.
        card = flat.convert("RGB")

        card_path = OUT / f"{url}-card.jpg"
        card.save(card_path, "JPEG", **ENCODE)
        totals["card"] += card_path.stat().st_size

        # NO RESIZE ON THIS LINE, EVER. `paste` at an offset is the whole variant.
        mat = Image.new("RGB", (PHONE_W, PHONE_H), CANVAS)
        mat.paste(card, ((PHONE_W - CARD_W) // 2, (PHONE_H - CARD_H) // 2))
        phone_path = OUT / f"{url}-phone.jpg"
        mat.save(phone_path, "JPEG", **ENCODE)
        totals["phone"] += phone_path.stat().st_size

        print(
            f"{art:22s} {url:20s} {card_path.stat().st_size/1024:>8.0f} "
            f"{phone_path.stat().st_size/1024:>9.0f}"
        )
        # The sheet shows the PHONE variant, because the mat and the centring are
        # the only things in this pipeline a number cannot judge.
        thumbs.append(mat.resize((120, 260), Image.LANCZOS))

    sheet = Image.new("RGB", (120 * 6, 260 * 4), CANVAS)
    for i, t in enumerate(thumbs):
        sheet.paste(t, (120 * (i % 6), 260 * (i // 6)))
    sheet.save(SHEET, quality=88)

    total = sum(totals.values())
    print(
        f"\n{len(ARCANA)} cards x 2 variants = {len(ARCANA)*2} files\n"
        f"  card   {totals['card']/1e6:6.2f} MB\n"
        f"  phone  {totals['phone']/1e6:6.2f} MB\n"
        f"  TOTAL  {total/1e6:6.2f} MB   ({total/(len(ARCANA)*2)/1024:.0f}KB mean)\n"
        f"contact sheet: {SHEET.relative_to(ROOT)}\n"
        "verify: python3 tools/check_wallpapers.py"
    )


if __name__ == "__main__":
    main()
```

And one line in `.gitignore`, beside the existing precedent:

```diff
 # Source art is kept, but the normalized output is generated by
 # tools/normalize_cards.py -- keep it committed so Vercel builds without Python.
 tools/_contactsheet.jpg
+# Same, for tools/make_wallpapers.py. public/wallpapers/ IS committed, for the
+# same reason public/cards/ is; only the eyeballing sheet is scratch.
+tools/_wallpapersheet.jpg
```

### The green run

```sh
python3 tools/make_wallpapers.py
python3 tools/check_wallpapers.py; echo "exit=$?"
```

**Expected:** the pipeline prints 22 rows and `TOTAL 23.77 MB` (528KB mean); the oracle
prints 44 rows with `MAD` in 0.12–0.19, `bar sd` 0.000 and `bar rgb (10, 8, 19)`, then
`all checks passed.` and `exit=0`.

**Then look at `tools/_wallpapersheet.jpg`.** The centring and the mat are the two things
no number above judges.

### Commit

The 44 assets are Task 3's; this commit is the script only.

```sh
git add tools/make_wallpapers.py .gitignore
git commit
```

```
S5: the wallpaper pipeline

tools/make_wallpapers.py reads the 22 committed source PNGs and writes two
derivatives each: the native 1024x1536 card, and that card UNSCALED on a
1440x3120 mat in color.canvas. No regeneration, no upscale, no crop.

The trap it avoids: normalize_cards.py's fit_to_ratio would LANCZOS 1020 -> 1024
if trim_dark_mat ever removed 4px, producing exactly the upscale S-D9 forbids
from inside the function that looks like the right one to reuse. So flatten and
trim_dark_mat are used as an ASSERTION and the source pixels are read untouched.

JPEG q90 4:4:4 over WebP q90, which is 24% smaller at matched fidelity: iOS
Photos is where a wallpaper has to land and its WebP support in that pipeline is
inconsistent. Measured basis in docs/plans/2026-07-28-wallpapers.md.
```

---

## Task 3: The 44 assets, the npm script, and the idempotency proof

**Files:** `package.json` (one line — S5 owns it, §6.5), `public/wallpapers/*.jpg` (44 new).

### The failing test

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run wallpapers
```

**Expected failure:** `npm error Missing script: "wallpapers"`.

### Implementation

```diff
   "cards": "python3 tools/generate_cards.py",
   "assets": "python3 tools/normalize_cards.py",
+  "wallpapers": "python3 tools/make_wallpapers.py",
```

Placed **immediately after `assets`**, because the three source→derivative scripts belong
together and `## Assets` in CLAUDE.md lists them as a group. No `RES_OPTIONS=no-aaaa`: this
script makes no network call, unlike every script that carries it.

### The green run

```sh
npm run wallpapers
python3 tools/check_wallpapers.py

# IDEMPOTENCY, PROVED THE WAY THAT MATTERS: a second run must produce no git diff.
git add public/wallpapers
npm run wallpapers
git status --porcelain public/wallpapers | grep -v '^A ' ; echo "modified-after-rerun=$?"
```

**Expected:** the oracle passes; the last command prints `modified-after-rerun=1`
(`grep` found nothing, i.e. every path is still staged-as-added and none is modified). If
any line comes back as ` M `, the encoder is not deterministic and the plan's central
claim is false — stop and find out why before committing 24MB.

Then report the weight before committing it, as §7 (S5) and §13 require:

```sh
du -sh public/wallpapers
find public/wallpapers -name '*.jpg' | wc -l
```

**Expected: 44 files, 23.77MB** (`du` will round to ~24M).

### Commit

```
S5: 44 wallpapers, 23.77MB committed

22 cards x { card 1024x1536, phone 1440x3120 }, JPEG q90 4:4:4 progressive.
Byte-identical on re-run, verified by SHA-256 over all 44 and by a second
`npm run wallpapers` producing no git diff.

WEIGHT, REPORTED BEFORE COMMITTING as roadmap §7 (S5) requires: 23.77MB, 528KB
mean. Context: assets/major_arcanas/ is already 71.6MB and .git is 158MB, so this
is +15% of .git, paid once, in blobs that change only when the art does. The
levers if that is judged too large, in order: drop the `card` variant (-11.45MB,
its pixels are the phone variant's inner region), q88/q85 (-1.5/-1.9MB), 4:2:0
(-3.6MB, and it is the gold hairline that pays). On-the-fly generation is not a
lever -- public/cards/ is committed precisely so the deploy needs no Python.

Committed rather than generated at build time for that same reason.
```

---

## Task 4: `src/lib/wallpaper.ts` — the pure leaf

**Files:** `src/lib/wallpaper.ts` (new), `src/lib/wallpaper.test.ts` (new).

**Prerequisite:** S4's `cardUrlSlug` in `src/data/deck.ts` (§6.5). **If S4 has not landed
yet**, add the three-line derivation to `wallpaper.ts` temporarily —
`name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')` — and note in the
commit that S4 deletes it in favour of the import. Do **not** ship both permanently: two
functions deciding a permanent public address will disagree, and the symptom is a 404 on a
download button.

### The failing test

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm test -- wallpaper
```

**Expected failure:** `Failed to resolve import "@/lib/wallpaper"`.

### Implementation

```ts
/**
 * The wallpaper asset contract. PURE, CLIENT-IMPORTABLE, and a LEAF.
 *
 * S5 owns the asset; S3 owns where the control is mounted (roadmap §7). This
 * module is the boundary between them: a variant name, a size, a URL, and the
 * filename the person ends up with on disk.
 *
 * **NO `process.env`, EVER**, for the reason `src/lib/share/slug.ts` gives: this
 * is imported by a client component, and an origin read here would either inline
 * a build-time value into the bundle or be `undefined` at runtime. Every path
 * below is root-relative, which is also what makes the `download` attribute work
 * -- see the note on cross-origin below.
 *
 * **NO VERSION AND NO CONTENT HASH IN THE FILENAME**, and that is a decision
 * rather than an omission. `src/data/deck.ts`'s `ART_VERSION` exists because
 * `/cards/*` is served `max-age=31536000, immutable` -- correct there, because the
 * fan pulls 22 files on every cold draw. `/wallpapers/*` is served
 * `max-age=86400, stale-while-revalidate=604800` instead, because a wallpaper is
 * fetched ONCE by somebody who tapped a button, so caching it for a year buys
 * nothing and costs the whole staleness problem that header's comment describes.
 * A regenerated deck therefore propagates on its own within a day, and there is
 * no number here to forget to bump. A test asserts the URL contains no `?`.
 */
import type { Card } from '@/data/types';
import { cardUrlSlug } from '@/data/deck';

/**
 * Two variants, and the roadmap fixes the count (§7, S5).
 *
 * `card` is the native source resolution -- the honest maximum, for somebody who
 * wants the artwork rather than a wallpaper. `phone` is those exact pixels,
 * unscaled, centred on the app's backdrop.
 */
export const WALLPAPER_VARIANTS = ['card', 'phone'] as const;
export type WallpaperVariant = (typeof WALLPAPER_VARIANTS)[number];

/**
 * The dimensions, duplicated from `tools/make_wallpapers.py` on purpose.
 *
 * They are an INTERFACE, not an implementation detail: the copy states them to
 * the person deciding whether to download ("Phone wallpaper, 1440x3120"), and
 * `srcset`-free `width`/`height` attributes need them to reserve layout. The
 * duplication is closed mechanically -- `wallpaper.test.ts` reads the committed
 * files off disk and asserts their real pixel dimensions against this table, so
 * Python and TypeScript cannot drift without a red suite.
 */
export const WALLPAPER_SIZE: Record<WallpaperVariant, { width: number; height: number }> = {
  card: { width: 1024, height: 1536 },
  phone: { width: 1440, height: 3120 },
};

/** Root-relative path to the asset. Never absolute — see the header. */
export function wallpaperPath(urlSlug: string, variant: WallpaperVariant): string {
  return `/wallpapers/${urlSlug}-${variant}.jpg`;
}

/**
 * The name the file gets in the person's Downloads or Photos.
 *
 * Prefixed `jmtarot-` because a folder full of `the-moon-phone.jpg` from four
 * different sites is a folder nobody can use. **The `download` attribute is
 * IGNORED ON A CROSS-ORIGIN URL** (same-origin-or-nothing, in every browser), so
 * this only works while the asset is served from our own origin. If wallpapers
 * ever move to an image CDN, this function's output stops being the filename and
 * a `content-disposition` on the CDN becomes the only mechanism.
 */
export function wallpaperFilename(urlSlug: string, variant: WallpaperVariant): string {
  return `jmtarot-${urlSlug}-${variant}.jpg`;
}

/** Both variants for one card, in the order they should be offered. */
export function wallpapersFor(card: Card): {
  variant: WallpaperVariant;
  href: string;
  filename: string;
  width: number;
  height: number;
}[] {
  const slug = cardUrlSlug(card);
  return WALLPAPER_VARIANTS.map((variant) => ({
    variant,
    href: wallpaperPath(slug, variant),
    filename: wallpaperFilename(slug, variant),
    ...WALLPAPER_SIZE[variant],
  }));
}
```

```ts
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARDS } from '@/data/deck';
import {
  WALLPAPER_SIZE,
  WALLPAPER_VARIANTS,
  wallpaperFilename,
  wallpaperPath,
  wallpapersFor,
} from '@/lib/wallpaper';

/**
 * The seam between `tools/make_wallpapers.py` and the TypeScript that links to
 * what it wrote.
 *
 * The Python holds its own slug derivation and its own dimensions; so does
 * `check_wallpapers.py`; so does this module. Three copies of one fact is
 * normally a smell, and here it is the design: no language can import the other,
 * so the FILESYSTEM is the shared artefact, and the check that ties them together
 * is "does the URL this module builds name a file that exists, at the size this
 * module claims". That is the assertion below, and it fails on either side
 * drifting.
 */
const PUBLIC = join(process.cwd(), 'public');

/** JPEG SOF0/SOF2 dimensions, without a decoder. Enough to prove the size. */
function jpegSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error(`no SOF marker in ${path}`);
}

describe('the wallpaper URL contract', () => {
  it('offers exactly two variants', () => {
    expect(WALLPAPER_VARIANTS).toEqual(['card', 'phone']);
  });

  it('builds a root-relative path with NO query string', () => {
    // The whole reason this path carries no `?v=` -- see the module header. A
    // query string here would also break `next/image`, which refuses a local src
    // with one unless `images.localPatterns` is configured.
    for (const { href } of wallpapersFor(CARDS[18])) {
      expect(href.startsWith('/wallpapers/')).toBe(true);
      expect(href).not.toContain('?');
      expect(href).not.toContain('http');
    }
  });

  it('names The Moon by its URL slug and never by its art slug', () => {
    expect(wallpaperPath('the-moon', 'phone')).toBe('/wallpapers/the-moon-phone.jpg');
    expect(wallpaperPath('the-moon', 'card')).toBe('/wallpapers/the-moon-card.jpg');
    expect(wallpaperFilename('the-moon', 'phone')).toBe('jmtarot-the-moon-phone.jpg');
    // The art slug addresses a FILE; this addresses a document a person found by
    // typing words. S-D4.
    expect(wallpaperPath('the-moon', 'card')).not.toContain('18_moon');
  });

  it('covers all 22 cards and both variants: 44 committed files', () => {
    const paths = CARDS.flatMap((c) => wallpapersFor(c).map((w) => w.href));
    expect(paths).toHaveLength(44);
    expect(new Set(paths).size).toBe(44);
  });

  it('every URL names a committed file that is not a 0-byte write', () => {
    for (const card of CARDS) {
      for (const { href } of wallpapersFor(card)) {
        const path = join(PUBLIC, href);
        expect(existsSync(path), `${href} is missing -- run npm run wallpapers`).toBe(true);
        expect(statSync(path).size).toBeGreaterThan(150_000);
      }
    }
  });

  it("the committed files really are the dimensions this module claims", () => {
    // THIS is what closes the Python/TypeScript duplication. A change to
    // PHONE_H in make_wallpapers.py without a change to WALLPAPER_SIZE here is
    // red, and so is the reverse.
    for (const card of CARDS) {
      for (const { href, variant, width, height } of wallpapersFor(card)) {
        expect(jpegSize(join(PUBLIC, href))).toEqual({ width, height });
        expect({ width, height }).toEqual(WALLPAPER_SIZE[variant]);
      }
    }
  });

  it('never upscales: the card variant is exactly the source resolution', () => {
    // 1024x1536 is the art's true resolution (verified: all 22 sources, mode
    // RGB, no ICC). A `card` variant at any other size means somebody resampled.
    expect(WALLPAPER_SIZE.card).toEqual({ width: 1024, height: 1536 });
  });
});
```

### The green run

```sh
npm test -- wallpaper
npm run typecheck
```

**Expected:** 7 passing tests, clean typecheck.

### Commit

```
S5: src/lib/wallpaper.ts, the asset contract

Pure, client-importable, no process.env, no server-only. The variant union, the
dimension table, the URL and the on-disk filename -- the boundary between S5's
asset and S3's placement.

No `?v=` and no content hash: /wallpapers/* is served max-age=86400 rather than
a year of `immutable`, because a wallpaper is fetched once by somebody who tapped
a button. The test asserts the URL carries no query string.

The Python and the TypeScript each hold their own dimensions and cannot import
each other, so the test reads the committed JPEGs' SOF markers off disk and
asserts the real pixel size against the table. Either side drifting is red.
```

---

## Task 5: `WallpaperDownload` — the control

**Files:** `src/components/WallpaperDownload.tsx` (new),
`src/components/WallpaperDownload.module.css` (new),
`src/components/wallpaperDownload.test.ts` (new).

**Prerequisites, both in `## Deltas requested` and both hard compile errors until S1 lands
them:** the eight chrome keys in `src/lib/i18n/locales/{id,en}.ts`, and
`'wallpaper.downloaded'` in `src/lib/analytics/events.ts`. `makeT` is typed against the
catalog's key union and `track` against the event union, so **an unlanded key is a red
typecheck, not a wrong string on screen** — which is the enforcement, and the reason this
task is sequenced after S1.

### The failing test

```sh
npm test -- wallpaperDownload
```

**Expected failure:** `Failed to resolve import "./wallpaperDownload"` — the pure policy
module the component imports does not exist.

### Implementation

The decision logic is extracted so `npm test` can reach it, exactly as `swipeDeck.ts` is
extracted from `SwipeDeck.tsx`:

```ts
/**
 * `src/components/wallpaperDownload.ts` -- PURE. The one policy decision in the
 * download control, and the only part `npm test` can reach.
 *
 * **WHY THERE IS A DECISION AT ALL.** The control is a real `<a href download>`:
 * it works with no JavaScript, needs no session, and is a crawlable link to an
 * image. But on iOS `<a download>` puts the file in **Files**, and *Set
 * Wallpaper* can only read from **Photos** -- so on the one platform this app is
 * built for, the default behaviour produces a file the person cannot use for the
 * thing they downloaded it for. `navigator.share({ files })` surfaces iOS's
 * "Save Image", which lands it in Photos in one tap. S-D8 already sanctions the
 * Web Share API on a public page.
 *
 * **AND WHY IT IS NOT SIMPLY "SHARE IF AVAILABLE".** Desktop Chrome can also
 * share files, and on a desktop a download is exactly what the person asked for;
 * hijacking it into an OS share sheet is worse than the default. So the gate is
 * two capability tests and NEVER a user-agent string:
 *
 *   - `navigator.canShare({ files })` -- can this browser share a file at all
 *   - `(pointer: coarse)` -- is the primary pointer a finger, i.e. is this a
 *     device where "the file system" is not somewhere the person can act
 *
 * No UA sniff, and nothing derived from a UA ever reaches an analytics prop.
 */
export type DownloadMethod = 'share' | 'link';

export function chooseMethod(env: {
  canShareFiles: boolean;
  coarsePointer: boolean;
}): DownloadMethod {
  return env.canShareFiles && env.coarsePointer ? 'share' : 'link';
}
```

```tsx
'use client';

/**
 * The download control. S5 owns the asset contract and this component; S3 owns
 * where it is mounted, and S4 may mount it on a lore page (roadmap §7).
 *
 * **NO SESSION, NO FETCH OF OUR OWN API, NO COOKIE.** Two anchors to two static
 * files, a licence line, and one buffered event. It renders identically for a
 * stranger and for a signed-in querent, which is what lets the page it sits on
 * stay CDN-cacheable (S-D10).
 *
 * **THE ANCHOR IS THE CONTRACT AND THE HANDLER IS AN UPGRADE.** With JavaScript
 * off, or if the share path throws, the browser's own download runs and the
 * person gets the file. `preventDefault()` is called ONLY on the branch that has
 * already decided to do something better -- see `wallpaperDownload.ts`.
 *
 * **NO `content-disposition: attachment` ON `/wallpapers/*`** (declared in this
 * workstream's plan for S1 to write). It would force a download and make the
 * image impossible to VIEW -- and viewing is the prerequisite for iOS's
 * long-press -> Add to Photos, which is the fallback when the share sheet is not
 * available. The `download` attribute gets the filename without closing that door.
 *
 * `track()` is buffered rather than sent (it returns void and must never be
 * awaited): the batcher's `pagehide` handler covers a share sheet that tears the
 * page's attention away before the two-second debounce fires. Same reasoning
 * `TryItYourself` records.
 */
import { useCallback } from 'react';
import type { Card } from '@/data/types';
import { track } from '@/lib/analytics/track.client';
import { useT } from '@/lib/i18n/LocaleProvider';
import { wallpapersFor, type WallpaperVariant } from '@/lib/wallpaper';
import { chooseMethod } from './wallpaperDownload';
import styles from './WallpaperDownload.module.css';

/** Where the control was mounted. A closed set -- `events.ts` rule 2. */
export type WallpaperSurface = 'gallery' | 'arcana';

/** Bounds the blob fetch, for `POST /api/locale`'s reason: a server budget with
 *  no client bound only makes a hang longer. 8s matches `ShareFooter`. */
const FETCH_TIMEOUT_MS = 8_000;

export function WallpaperDownload({
  card,
  from,
}: {
  card: Card;
  from: WallpaperSurface;
}) {
  const t = useT();
  const variants = wallpapersFor(card);

  /*
   * THERE IS NO FAILURE STATE ON THIS CONTROL, AND THAT IS DELIBERATE. Every
   * branch below ends in a download: the share path falls back to the browser's
   * own, and the browser's own is the default. The only outcome that produces
   * nothing is the person tapping Cancel on the share sheet, which is not a
   * failure and must not be announced as one. A `wallpaper.failed` string would
   * be a message that can never legitimately render.
   */

  const onClick = useCallback(
    async (
      event: React.MouseEvent<HTMLAnchorElement>,
      variant: WallpaperVariant,
      href: string,
      filename: string,
    ) => {
      const file = { name: filename, type: 'image/jpeg' } as const;
      const method = chooseMethod({
        canShareFiles:
          typeof navigator !== 'undefined' &&
          typeof navigator.canShare === 'function' &&
          typeof navigator.share === 'function' &&
          navigator.canShare({ files: [new File([], file.name, { type: file.type })] }),
        coarsePointer:
          typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
      });

      if (method === 'link') {
        // The anchor does the work. Do NOT preventDefault.
        track('wallpaper.downloaded', { card_id: card.id, variant, method: 'link', from });
        return;
      }

      event.preventDefault();

      let blob: Blob;
      try {
        const res = await fetch(href, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok) throw new Error(String(res.status));
        blob = await res.blob();
      } catch {
        // TWO ABORTERRORS, SEPARATED ON PURPOSE. This catch is the FETCH's --
        // a timeout or an offline device -- and the right answer is the plain
        // download. The share sheet's AbortError is the person tapping Cancel and
        // is handled below, where it must NOT fall back and must NOT be recorded.
        fallbackDownload(href, filename);
        track('wallpaper.downloaded', { card_id: card.id, variant, method: 'link', from });
        return;
      }

      try {
        await navigator.share({ files: [new File([blob], filename, { type: 'image/jpeg' })] });
      } catch (err) {
        if ((err as Error | undefined)?.name === 'AbortError') return; // cancelled, not failed
        fallbackDownload(href, filename);
        track('wallpaper.downloaded', { card_id: card.id, variant, method: 'link', from });
        return;
      }
      track('wallpaper.downloaded', { card_id: card.id, variant, method: 'share', from });
    },
    [card.id, from],
  );

  return (
    <section className={styles.block}>
      <h3 className={styles.heading}>{t('wallpaper.heading')}</h3>
      <ul className={styles.list}>
        {variants.map(({ variant, href, filename, width, height }) => (
          <li key={variant}>
            <a
              className={styles.link}
              href={href}
              download={filename}
              aria-label={t(variant === 'card' ? 'wallpaper.cardAria' : 'wallpaper.phoneAria', {
                card: card.name,
              })}
              onClick={(e) => void onClick(e, variant, href, filename)}
            >
              {t(variant === 'card' ? 'wallpaper.card' : 'wallpaper.phone')}
              <span className={styles.dims}>
                {width}&times;{height}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>{t('wallpaper.saveHint')}</p>
      <p className={styles.licence}>
        {t('wallpaper.licence')}{' '}
        <a href="/terms#9">{t('wallpaper.licenceLink')}</a>
      </p>
    </section>
  );
}

/** The browser's own download, triggered from script. Same-origin only — the
 *  `download` attribute is ignored cross-origin, which is why `wallpaperPath`
 *  returns a root-relative path and must keep doing so. */
function fallbackDownload(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}
```

The stylesheet composes from `src/theme/tokens.css` only — no new hex, no new font size, no
new easing curve (roadmap §10). Reuse the existing gold-hairline chip idiom:
`border: 1px solid var(--gold-hairline)`, `color: var(--gold-text)`, `background:
var(--gold-wash)`, `font-family: var(--font-display)` at the existing `--fs-label`.
`.licence` and `.hint` use `var(--muted)` at the existing small size. The list is a
`display: grid; gap: var(--space-2)` — one column, because two 1440×3120 labels do not fit
side by side at 320px and loop 4 is how that gets confirmed (Task 6).

```ts
import { describe, expect, it } from 'vitest';
import { chooseMethod } from './wallpaperDownload';

/**
 * The four-case table, with both negative controls.
 *
 * The two that matter are the ones that are NOT "share if you can": a desktop
 * that can share files must still download, because a download is what the person
 * asked for; and a phone that cannot share files must still download, because the
 * anchor is the contract and the share path is only ever an upgrade.
 */
describe('chooseMethod', () => {
  it('shares on a touch device that can share files -- the iOS Photos path', () => {
    expect(chooseMethod({ canShareFiles: true, coarsePointer: true })).toBe('share');
  });

  it('downloads on a DESKTOP that can share files', () => {
    expect(chooseMethod({ canShareFiles: true, coarsePointer: false })).toBe('link');
  });

  it('downloads on a touch device that cannot share files', () => {
    expect(chooseMethod({ canShareFiles: false, coarsePointer: true })).toBe('link');
  });

  it('downloads when neither is available', () => {
    expect(chooseMethod({ canShareFiles: false, coarsePointer: false })).toBe('link');
  });
});
```

### The green run

```sh
npm test -- wallpaperDownload
npm test -- clientBoundary       # @/lib/wallpaper carries no prompt text and no catalog import
npm run typecheck
npm run build                    # NOT OPTIONAL -- the TypeScript trap
```

**Expected:** 4 passing tests; `clientBoundary.test.ts` green (the new client component
imports `track.client`, never `track`, and never `@/lib/i18n/catalog`); clean typecheck;
clean build with `audit:secrets` passing.

### Commit

```
S5: the download control

Two anchors, a licence line, one buffered event. No session, no cookie, no API
of ours -- so the page it sits on stays CDN-cacheable (S-D10).

The anchor is the contract; navigator.share is an upgrade, gated on
canShare({files}) AND (pointer: coarse) and never on a user-agent string. The
reason is iOS: <a download> lands the file in Files, and Set Wallpaper reads only
from Photos, so on the platform this app is built for the default produces a file
the person cannot use for what they downloaded it for.

The two AbortErrors are separated deliberately: a fetch timeout falls back to the
plain download and records `method: 'link'`; the share sheet's Cancel records
NOTHING, because nobody downloaded anything.
```

---

## Task 6: The live checks — the ones no unit test can make

**Files:** none. This task produces evidence and a note; if anything fails it produces a
follow-up task instead of a green tick.

**Prerequisite:** S1 has written the `/wallpapers/:path*` header into `next.config.ts` and
S2 has added `wallpapers/` to the middleware matcher (both in `## Deltas requested`).
Without the second, **every check below 302s to `/login`**, which is the whole of F1.

### 6a. `curl -i` — the cheapest instrument, and the one that catches F1

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run db:up && npm run build && npm start &   # `next start`, not `next dev`:
                                                # headers() is a production concern
# THE TRAP `headers.test.ts` RECORDS: `pkill -f "next start"` does NOT kill it.
# The process renames itself to `next-server (vX.Y.Z)`. Check `ss -lptn | grep 3001`.

BASE=http://localhost:3001
curl -sS -D- -o /dev/null "$BASE/wallpapers/the-moon-phone.jpg"
```

**Every one of these must hold, with no cookie jar:**

| Assertion | Why it is here |
|---|---|
| `HTTP/1.1 200` | Not a 302. F1's failure is a redirect to `/login` on a public asset. |
| `content-type: image/jpeg` | Next infers it from the extension; a wrong type breaks iOS's long-press menu. |
| `cache-control: public, max-age=86400, stale-while-revalidate=604800` | The declared header, actually applied. |
| **no `set-cookie` at all** | S-D10, and the mechanical half: a `Set-Cookie` makes a 550KB response edge-uncacheable. This is the line F1 is about. |
| `x-frame-options: SAMEORIGIN` and the CSP present | The `/(.*)` block still applies; a narrower entry must not have displaced it. |
| **no `x-robots-tag`** | S-D12. `/s/:path*` is `noindex` and must not have leaked here — 22 pieces of original art in Google Images is upside. |
| **no `content-disposition`** | W-D10. Forcing a download closes iOS's Add to Photos path. |

```sh
# And the one that proves S-D12 in the other direction, on the same server:
curl -sS -D- -o /dev/null "$BASE/s/abcdefghijkl" | grep -i x-robots-tag
# x-robots-tag: noindex, nofollow, noarchive
```

### 6b. Loop 5 — does the download actually download

`tools/e2e/run.sh` (see `/test-prod-using-headless-chrome`). This is the loop for "does
the UI agree with what it sends", and a download is exactly that question.

```sh
E2E_BASE=http://localhost:3001 tools/e2e/run.sh   # navigate to /gallery, tap the
                                                  # download control, list requests
```

**What to confirm:** a request for `/wallpapers/the-moon-phone.jpg` appears in the request
list with a 200 and `image/jpeg`; a `POST /api/events` follows carrying
`wallpaper.downloaded` with `card_id: 18`, `variant: "phone"`, `method: "link"`,
`from: "gallery"` — and **no free text anywhere in `props`** (S-D13). Loop 5 is a desktop
pointer, so `method` must be `"link"`; a `"share"` here means `chooseMethod`'s
`(pointer: coarse)` gate is not doing its job.

**Loop 5 is NOT the instrument for width.** Measured 2026-07-28: `--width 390` gives
`innerWidth` 500. Use loop 4.

### 6c. Loop 4 — the control at 320/360/390

A fixed-width container plus `getBoundingClientRect`, and `scrollWidth > clientWidth` on
the control's own element at 320, 360 and 390. The labels are the risk: `Wallpaper ponsel`
plus `1440×3120` is a long line, and the Indonesian is longer than the English here as it
is everywhere else (`## Localization`: `Yang menanti di depan` takes three lines at all
four widths).

### 6d. Loop 6 — the only instrument for the actual product question

**A real iPhone against a Vercel preview URL, and be honest that nothing above substitutes
for it.** CLAUDE.md is explicit and gives two live bugs as proof: the standalone sign-in
risk is about two cookie jars and loop 5 has one; the language switch's iPhone timeout
could not be reproduced in WSL at all.

Three questions only hardware answers, in order of how much they would change:

1. **Does a downloaded `-phone.jpg` reach Photos, and does *Set Wallpaper* accept it?**
   This is the whole feature. If the share sheet's "Save Image" does not appear, W-D8's
   upgrade is worthless and the copy in `wallpaper.saveHint` is the entire mechanism.
2. **Does the card look right on a lock screen** — is 71.1% of the width the correct
   size, does the clock overlap the composition, and is 1440×3120's aspect-fill crop
   invisible on the specific handset?
3. **Is there visible JPEG blocking in a dark gradient at q90?** 65.1% of these pixels are
   dark and the panel is OLED. If yes, `QUALITY = 92` in one place and re-run; the weight
   goes 23.77 → ~26.6MB.

### Commit

```
S5: live verification of the wallpaper path

curl -i on `next start`: 200, image/jpeg, the declared cache-control, NO
Set-Cookie, no x-robots-tag, no content-disposition -- and /s/ still noindex.
Loop 5: the request fires and `wallpaper.downloaded` carries card_id 18,
variant phone, method link, from gallery, and no free text.
Loop 4: the control does not overflow at 320/360/390 in either locale.

Loop 6 (a real iPhone) is OPEN and is the only instrument for the three questions
that matter -- does the file reach Photos, does the card look right on a lock
screen, and is q90 blocking visible on OLED. Recorded in workstream-notes.md.
```

---

## Task 7: The record

**Files:** `docs/workstream-notes.md` (append one section).

CLAUDE.md keeps the rules; `docs/workstream-notes.md` keeps the evidence, and its own
instruction is to **add new traps there rather than here**.

### The failing test

None — this is documentation. The check is that the section names, for each claim, the
measurement that produced it. A sentence in it with an adjective and no number is the
failure mode.

### Implementation

Append a `## Wallpaper downloads (S5)` section carrying:

- The four format findings, with the tables from `## The numbers` — especially **PNG-256
  is 2.6× larger AND worse**, because that is the trick `normalize_cards.py` legitimately
  uses at 200×300 and somebody will reach for it again.
- **The `fit_to_ratio` trap** (W-D7). This is the one a future session is most likely to
  reintroduce, because reusing the shipping pipeline's own function is the obviously
  correct instinct.
- **The bar colour drifting by exactly one level of blue**, and why the oracle asserts a
  tolerance. Plus the `EDGE_UNIFORM_STDDEV`-in-reverse note.
- **The middleware matcher finding** (F1), because the failure mode — a 302 to `/login` on
  a public static asset — reads as missing artwork rather than as an auth problem, which
  is precisely what the matcher's own comment says about `cards/`.
- **The `/api/events` cookie finding** (F3), which is pre-existing on `/s/` and older than
  this workstream.
- The 1440×3120 derivation, including the aspect-fill arithmetic (49.2% of the canvas
  height survives a crop to 16:9 at 82% and to 4:3 at 61.5%).
- The measured 23.77MB and the three levers.
- **The loop-6 questions still open.**

### Commit

```
S5: the wallpaper evidence

docs/workstream-notes.md gains the measurements CLAUDE.md's rules stand on: the
format table with PNG-256 measured 2.6x larger AND worse, the fit_to_ratio
upscale trap, the one-level blue drift that makes the oracle use a tolerance, the
middleware-matcher finding, and the three loop-6 questions nothing in WSL can
answer.
```

---

## Schema deltas

**None.** S-D14 holds. No table, no column, no migration. A wallpaper download is
anonymous, and the only thing recorded about it is one `events` row through the existing
`/api/events` route — a table that already exists and whose row shape is `jsonb`.

Stated explicitly because the tempting column is a per-card download counter, which would
be a write on a public route, and roadmap §10's "a public page must not be able to 500 on
a database outage" is the reason not to have one. If that count is ever wanted, the query
is `select props->>'card_id', count(*) from events where name = 'wallpaper.downloaded'`.

---

## Analytics deltas

S1 owns `src/lib/analytics/events.ts` (S-D13). One event, folded in with everyone else's:

```ts
  /*
   * S5. A wallpaper download, from a page a stranger can reach with no session,
   * so `user_id` is null the way `share.viewed`'s is.
   *
   * `card_id` and NOT a slug: rule 3 above, "IDS ARE IDS", and every other card
   * event in this file (`draw.card_picked`, `memory.frequency_shown`) uses the
   * integer. Both are closed sets of 22; consistency across 60 names is the
   * tiebreak.
   *
   * `method` is the answer to a question the numbers alone cannot settle: the
   * control is an `<a download>` upgraded to `navigator.share` on a touch device,
   * because on iOS a download lands in Files and *Set Wallpaper* reads only from
   * Photos. If `share` never appears in production, that upgrade is not running
   * and the feature is worse on its target platform than it looks here.
   *
   * A CANCELLED SHARE SHEET FIRES NOTHING. `navigator.share` rejecting with
   * AbortError means the person tapped Cancel, and recording it would make every
   * "download" figure an "intent" figure.
   *
   * NO USER-AGENT, NO REFERRER, NO FILENAME. The first two are free text (rule 1)
   * and the third is derivable from the two props that are here.
   */
  'wallpaper.downloaded':      { card_id: number; variant: 'card' | 'phone';
                                 method: 'share' | 'link'; from: 'gallery' | 'arcana' };
```

Client-side (`@/lib/analytics/track.client`), buffered, never awaited.

---

## Deltas requested

### D1 → S1: `next.config.ts`, the `/wallpapers/*` cache header (§6.4)

Placed **after** the `/cards/:path*` and `/dukuns/:path*` entries and **before** the
`/(.*)` security block, so it reads in specificity order like its two neighbours. It shares
no key with `/(.*)` or `/s/:path*`, so S-D12's ordering trap does not bite — but the
comment must say so, because the next person to add a header here will need to know why
this one was allowed to sit above the catch-all when `/s/`'s had to sit below it.

```ts
      {
        /*
         * S5's wallpapers. **DELIBERATELY NOT `immutable`, AND THAT IS THE WHOLE
         * POINT OF GIVING THEM THEIR OWN PATH** (S-D9).
         *
         * `/cards/:path*` above carries a year of `immutable` on non-content-hashed
         * filenames, and its comment says at length what that costs: regenerate the
         * art and every existing install keeps the old images for up to a year.
         * `src/data/deck.ts`'s `ART_VERSION` is the workaround.
         *
         * That trade is right for `/cards/*` and wrong here, because the traffic
         * shape is the opposite one. The fan pulls 22 thumbnails on every cold
         * draw; a wallpaper is fetched ONCE, by somebody who tapped a button, and
         * never again -- the gallery draws `cards/thumb`, not these. So caching
         * them for a year buys approximately nothing and costs the entire staleness
         * problem. One day of freshness plus a week of stale-while-revalidate
         * means a regenerated deck propagates on its own, which is also why these
         * filenames carry no `?v=` and no content hash.
         *
         * A new deployment already invalidates Vercel's edge copy, so the 86400
         * bounds the BROWSER's copy -- the one that outlives a deploy.
         *
         * **NO `content-disposition: attachment`.** It would force a download and
         * make the image impossible to VIEW, and viewing is the prerequisite for
         * iOS's long-press -> Add to Photos, which is the fallback path when the
         * Web Share sheet is unavailable. `WallpaperDownload` sets the filename
         * with the `download` attribute instead, which costs that door nothing.
         *
         * **NO `x-robots-tag`.** These are 22 pieces of original art at high
         * resolution and Google Images is upside, not a leak. S-D12's warning is
         * about a broad entry ACQUIRING `noindex` from `/s/:path*`; this entry
         * shares no key with that one and sits above `/(.*)` rather than below it,
         * so nothing here overrides anything.
         */
        source: '/wallpapers/:path*',
        headers: [
          {
            key: 'cache-control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
```

### D2 → S1: `src/lib/headers.test.ts`, one case (§6.5)

```ts
describe('the wallpaper cache header (S5)', () => {
  it('is one day plus a week of stale-while-revalidate, NOT a year of immutable', async () => {
    /*
     * The distinction is the whole reason /wallpapers/* is a separate path from
     * /cards/*. `immutable` on a non-content-hashed filename is what makes
     * regenerating the art a year-long staleness problem, and a wallpaper is
     * fetched once so it buys nothing here. If this ever reads `immutable`,
     * somebody has "made it consistent" with the entry above it.
     */
    const all = await rules();
    const block = all.find((r) => r.source === '/wallpapers/:path*');
    expect(block, 'no /wallpapers/:path* entry').toBeDefined();
    const h = Object.fromEntries(block!.headers.map((x) => [x.key, x.value]));
    expect(h['cache-control']).toBe('public, max-age=86400, stale-while-revalidate=604800');
    expect(h['cache-control']).not.toContain('immutable');
  });

  it('sets no x-robots-tag and no content-disposition on /wallpapers/*', async () => {
    // The first is S-D12: /s/'s noindex must not spread to art we WANT indexed.
    // The second is W-D8: `attachment` closes iOS's long-press -> Add to Photos.
    const all = await rules();
    const block = all.find((r) => r.source === '/wallpapers/:path*')!;
    const keys = block.headers.map((x) => x.key);
    expect(keys).not.toContain('x-robots-tag');
    expect(keys).not.toContain('content-disposition');
  });

  it('leaves /cards/* on a year of immutable', async () => {
    // The negative control. Adding S5's entry must not have touched its neighbour.
    const all = await rules();
    const block = all.find((r) => r.source === '/cards/:path*')!;
    expect(block.headers[0].value).toBe('public, max-age=31536000, immutable');
  });
});
```

### D3 → S2: `src/middleware.ts`, the matcher. **This is F1 and §6.2 calls it a flag**

```diff
   matcher: [
-    '/((?!_next/|cards/|dukuns/|favicon|icon|apple-icon|manifest|sitemap|robots).*)',
+    '/((?!_next/|cards/|dukuns/|wallpapers/|favicon|icon|apple-icon|manifest|sitemap|robots).*)',
   ],
```

**Why it is not optional.** The matcher's own comment says static assets are excluded here
"rather than in isPublic, because middleware should not run for them at all", and that
"gating /cards or /manifest.webmanifest does not look like an auth problem, it looks like
missing artwork and a broken Add to Home Screen." `wallpapers/` is the same class of path
and is not in the list, so today every `GET /wallpapers/*.jpg` runs `decide()`, matches
nothing in `isPublic()`, and **302s a signed-out stranger to `/login`** — a download button
that is broken for exactly the audience v0.4.0 exists to serve.

**Why the matcher and not `isPublic()`.** Adding `/wallpapers` to `isPublic()` also makes
it a 200, but leaves middleware *running* on the request — which means the locale-cookie
write on line 88 fires, and **a `Set-Cookie` on a 550KB static response makes it
uncacheable at the edge**. That is the single worst place in this release to lose CDN
caching, and it breaches S-D10 on a path S-D10 was written for. The matcher exclusion
mirrors `cards/` and `dukuns/` exactly and costs one edge invocation less per download.

### D4 → S1: `src/lib/i18n/locales/id.ts` then `en.ts` (§6.5). Eight keys, Indonesian first

`id.ts` owns the key set and a red typecheck is the feature (I2). Grouped under
`wallpaper.`; no prose enters the catalog (S-D6) — every string below is chrome.

```ts
  // S5. The download control. Chrome only: no lore, no prose (S-D6).
  'wallpaper.heading': 'Unduh gambarnya',
  'wallpaper.card': 'Gambar kartu',
  'wallpaper.phone': 'Wallpaper ponsel',
  'wallpaper.cardAria': 'Unduh gambar kartu {card}, 1024 kali 1536 piksel',
  'wallpaper.phoneAria': 'Unduh wallpaper ponsel {card}, 1440 kali 3120 piksel',
  'wallpaper.saveHint':
    'Di iPhone: buka gambarnya, tekan agak lama, lalu pilih Tambahkan ke Foto.',
  'wallpaper.licence':
    'Gambar kartu ini milik JMTarot. Kamu boleh menyimpannya dan memakainya sebagai ' +
    'wallpaper pribadi. Bukan untuk dijual, ditempel ke barang dagangan, atau dipakai ' +
    'secara komersial.',
  'wallpaper.licenceLink': 'Syarat & Ketentuan bagian 9',
```

```ts
  // S5. REWRITTEN, not translated (§8.2 / `## Localization` rule 3).
  'wallpaper.heading': 'Take the artwork with you',
  'wallpaper.card': 'The card image',
  'wallpaper.phone': 'Phone wallpaper',
  'wallpaper.cardAria': 'Download the {card} card image, 1024 by 1536 pixels',
  'wallpaper.phoneAria': 'Download the {card} phone wallpaper, 1440 by 3120 pixels',
  'wallpaper.saveHint':
    'On iPhone: open the image, press and hold, then choose Add to Photos.',
  'wallpaper.licence':
    'This artwork belongs to JMTarot. You may keep it and set it as your own wallpaper. ' +
    'Not for resale, not on merchandise, and not for commercial use.',
  'wallpaper.licenceLink': 'Terms & Conditions, clause 9',
```

**There is deliberately no `wallpaper.failed`.** Every branch of the control ends in a
download — the share path falls back to the browser's own and the browser's own is the
default — so the only string that could render there would be one that never legitimately
does. The component's header records the same thing.

Checked against the copy constraints:

- **Malay grep, `id` half only.** None of the eleven appears. `ponsel` is Indonesian
  (Malay is `telefon bimbit`); `unduh`, `menyimpan`, `dijual`, `barang dagangan` and
  `sebentar lagi` are all Indonesian. Register is `kamu`, as everywhere else.
- **English tic list.** No `dear one`, no `the Universe`, no `soul's journey`, no closing
  offer. `Take the artwork with you` rather than a translated `Download the artwork`,
  because §8.2 says the English is rewritten and a heading is the cheapest place to prove
  it — and it is what a person is actually doing.
- **No therapy, diagnosis or trauma language** in either half. Nothing here goes near it.
- **`wallpaper.saveHint` names iPhone explicitly**, which is unusual for this app's copy
  and is deliberate: it is the platform where the file lands somewhere the person cannot
  use, and the sentence is the fallback mechanism when the share sheet is unavailable.

### D5 → reconciliation / Miftah: `/terms` clause 9. **This is F2**

Clause 9 today reads, in both locales: *"Ours: the card artwork …"* and *"Readings are for
your own personal, non-commercial use."* The second sentence is scoped to **readings**.
**Nothing in the T&C grants any permission to use the artwork**, and a download button is
a permission.

That is a **gap rather than a contradiction** — the button does not claim something clause
9 denies — but the licence line on screen would be the only place the permission exists,
and a permission that lives in UI copy and not in the agreement is the weaker half of the
pair. One sentence closes it, inside clause 9, appended after the existing artwork
sentence, with no renumbering (so `legal.test.ts`'s clause-anchor and clause-6-subnumbering
assertions are untouched):

```
id:  Gambar kartu boleh kamu unduh dan pakai sebagai wallpaper pribadi. Bukan
     untuk dijual, ditempel ke barang dagangan, atau dipakai secara komersial.

en:  You may download the card artwork and use it as your own wallpaper. Not for
     resale, not on merchandise, and not for commercial use.
```

**`src/app/terms/*` has no owner in v0.4.0's §6 table**, which is why this is a delta and
a flag rather than a task. The wording matches `wallpaper.licence` deliberately: a licence
line that paraphrases clause 9 is a second, slightly different licence.

Note for whoever writes it: `legal.test.ts` asserts an explicit `{' '}` at every wrapping
prose boundary in both documents, and that the Indonesian contains none of the eleven Malay
words. Both hold for the sentences above.

### D6 → S3 and S4 (advisory, not a blocker): the `ImageObject` `contentUrl`

S-D16 puts `ImageGallery` + `ImageObject` on `/gallery` and `Article` + `ImageObject` on
`/arcana/[slug]`. Google Images wants the **highest-resolution** representation in
`contentUrl`, and that is now `/wallpapers/<url-slug>-card.jpg` at 1024×1536 rather than
`/cards/thumb/<art-slug>.webp` at 240×360. `wallpaperPath()` is the call.

Two caveats: the `<img>` on the page should stay the thumb (S3's whole reason for using
the existing asset), so `contentUrl` and the rendered `src` legitimately differ; and an
image sitemap is S1's, not requested here.

### D7 → reconciliation: one line in CLAUDE.md's `## Assets`

```diff
 public/cards/thumb/     GENERATED 240x360, for the fan and slots.
+public/wallpapers/      GENERATED, COMMITTED. 22 x { 1024x1536 card, 1440x3120 phone },
+                        JPEG q90. Its own cache header -- NOT /cards/*'s year of
+                        `immutable`. Never hand-edit. `npm run wallpapers`.
 public/dukuns/          reader portraits, 2:1 landscape scenes
```

and, in the script list beside `npm run assets`:

```diff
 npm run assets    # source PNGs -> 800x1200 + 240x360 WebP
+npm run wallpapers # source PNGs -> public/wallpapers/, 44 JPEGs, 23.77MB
 npm run cards     # rebuild src/data/cards.json
```

`## Assets` is the canonical map of where art lives, and a generated-and-committed
directory missing from it is how somebody hand-edits one.

---

## Flags

**F1 — `src/middleware.ts`'s matcher must change, and §6.2 says a plan that thinks so
should flag it. This plan thinks so, and the alternative is measurably worse.**
`wallpapers/` is not in the negative lookahead, so middleware runs for every wallpaper
request, `decide()` matches nothing in `isPublic()`, and a signed-out stranger is 302'd to
`/login` — on the one asset class this workstream exists to hand to strangers. The
matcher's own comment already predicts the diagnosis cost: "gating /cards … does not look
like an auth problem, it looks like missing artwork." The alternative, adding
`/wallpapers` to `isPublic()`, yields a 200 but leaves middleware running and therefore
leaves the locale-cookie write on line 88 firing, which puts a `Set-Cookie` on a 550KB
static response and makes it **edge-uncacheable** — a direct S-D10 breach on the response
where CDN caching matters most. D3 is the one-word diff. **I have not confirmed the 302
empirically** (it needs `db:up` plus a build); the evidence is that `cards/` and `dukuns/`
are excluded for exactly this reason and are the only public directories that are.

**F2 — the download button grants a permission `/terms` does not mention, and `/terms` has
no owner in v0.4.0.** Clause 9 asserts the artwork is ours and grants no licence to it; its
personal-use sentence is scoped to readings. A licence that exists only in UI copy is the
weaker half of the pair, and this is the most copyable thing the release publishes: 22
pieces of original commissioned art at 1024×1536, free, with no account. D5 is one sentence
per locale inside clause 9, with no renumbering. **Needs Miftah, and possibly the lawyer
clauses 10–12 are already waiting on.** If it is declined, the licence line must be
softened to describe rather than grant — and then somebody should decide whether a licence
that grants nothing belongs under a download button at all.

**F3 — `POST /api/events` sets `jmt_locale` on a cookie-less stranger, which is
pre-existing on `/s/` and older than this workstream, but S5's event makes it a v0.4.0
concern.** `/api/events` is in `isPublic()` and is **inside** the matcher, so middleware's
guard — `if (!pathname.startsWith('/s/') && cookie !== locale)` — writes the locale cookie
on the analytics beacon even though the page that fired it was excluded. So V7's stated
guarantee, *"a third party must leave with nothing in their jar"*, is already narrower than
it reads: `share.viewed` fires from `/s/` and the beacon that carries it collects the
cookie the page refused. S-D10 restates that promise for every content route in v0.4.0, and
`wallpaper.downloaded` fires from one. The minimal fix is S2's line — extend the guard from
`'/s/'` to `/s/`, `/api/events` and the content routes — but it is S2's call whether it
belongs in this release. **Not confirmed on the wire; read out of `gate.ts:67` and
`middleware.ts:88`.**

**F4 — the only instrument for this feature's central question is a real iPhone, and it is
not available in this environment.** Everything above verifies that the right bytes are
produced and served. Nothing above can answer *does the file reach Photos, and does Set
Wallpaper accept it* — and if the answer is no, the feature does not work on the platform
this app is built for, no matter how green the suite is. CLAUDE.md is explicit that loop 5
cannot substitute and gives two live bugs as proof. Task 6d lists the three questions;
question 1 is a release blocker and questions 2 and 3 are one-line changes if the answer is
bad (`QUALITY = 92`; a different canvas).

**F5 — the roadmap fixes the variant count at two, and one of the two is redundant as
pixels.** `-phone.jpg` contains `-card.jpg`'s 1024×1536 pixels unscaled, so the `card`
variant costs **11.45MB of the 23.77MB** to save somebody 792px of backdrop above and below
the artwork. That is a real convenience — a card image is what you want for a print, an
avatar or a lock screen on a device we did not size for — and it is not obviously worth
half the weight. §7 (S5) says "two variants per card", so this plan ships two; the
reduction is available in one commit if Miftah would rather have 12.32MB.

**F6 — `Image.Image.getdata` is deprecated in Pillow 12 and removed in Pillow 14
(2027-10-15), and `tools/check_card_art.py:mean_colour` uses it.** The two new scripts use
`load()`/`tobytes()` instead so they do not acquire the warning, but the existing file will
break on a Pillow upgrade. Not S5's to fix — it belongs with `/generate-tarot-card`'s
files — and recorded so it is not discovered during an art regeneration, which is the one
time that script matters.

**F7 — the phone canvas is chosen against a 2026 device census, and a census ages.**
1440×3120 is the widest common pixel width today, which is what makes "no device upscales
this file" true. A future 1600-wide flagship makes it false, mildly (a 1.11× device
upscale, which is what every other wallpaper on that phone is already getting). The fix
would be a wider canvas and more backdrop, and the constraint that does not move is
1024×1536: **the real answer to a widescreen future is regenerating the art at a higher
resolution**, which `docs/art-inconsistency.md` already wants for a different and better
reason, and which S-D9 puts firmly out of v0.4.0's scope.
