# The card art inconsistency, measured

Written during Task 4 of the web rewrite. `CLAUDE.md` has carried a rough
description of this since the iOS build; this is the version with numbers
against it, and it corrects the description in two places.

## What is actually there

Three groups, not the three that were previously recorded.

**Cards 0–10 — cream frames.** Ivory/parchment borders with a decorative gold
rule, warm palette, each card its own setting and composition. Frame luminance
sits at **44–49%**, red-minus-blue **+70 to +79**.

**Card 11, Justice — alone.** A dark pillared interior with drapery. Neither the
cream family nor the landscape family. This is the only genuine singleton.

**Cards 12–21 — navy frames, and one shared backdrop.** Dark blue-black borders
with a gold hairline. Frame luminance **8–29%**, red-minus-blue **−9 to +9**.

## Two corrections to CLAUDE.md

1. **The Star (17) is not a third treatment.** It sits squarely in the 12–21
   family — same navy frame, same mountain-and-lake composition. Only Justice
   (11) stands alone. The old note named "11 and 17" together; that is wrong.

2. **The break is luminance, not hue.** It was recorded as "warm cream vs cool
   navy", which undersells it. The frames differ by roughly **5x in
   brightness** (48% vs 10%). Against the `--canvas` background, cream-framed
   cards read as bright rectangles while navy-framed ones nearly merge into the
   page. A spread of The Fool + Death + The Star puts one glowing card beside
   two that recede. That is the thing that reads as broken, and a hue-matching
   pass would not fix it.

## A third problem nobody had noted

Cards 12–21 **share a single background composition** — the same mountain
range, the same lake with a reflection, the same star. Only the figure changes.
Ten of the twenty-two cards are reskins of one scene.

This is invisible one card at a time and obvious in a three-card spread: draw
three from that range and the reader sees the same landscape three times. The
cream group does not have this problem — those eleven are compositionally
distinct.

## What this means for the fix

Regenerating for one consistent treatment stays the highest-leverage art fix,
and it is now clear what "consistent" has to mean:

- Match frame **luminance** first. Hue is secondary.
- Give 12–21 **distinct compositions**. Matching the frames while leaving ten
  cards sharing one backdrop would fix the spread's colour and leave it
  repetitive.

Doing this before the app is in daily use is still much cheaper than after —
and note that `next.config.ts` serves `/cards/*` with a one-year `immutable`
cache on slug-based filenames. Regenerating means changing the filenames or
shortening that header first, or existing installs keep the old art.

## Reproducing the measurement

The frame sample is a band just inside the top and bottom card edges, across
the middle 64% of the width to avoid the padding bars:

```python
from PIL import Image
from pathlib import Path
for p in sorted(Path("public/cards/thumb").glob("*.webp")):
    im = Image.open(p).convert("RGB"); w, h = im.size; px = im.load()
    s = [px[x, y] for x in range(int(w*.18), int(w*.82))
                  for y in list(range(8, 16)) + list(range(h-24, h-16))]
    r, g, b = (sum(c[i] for c in s)/len(s) for i in range(3))
    print(f"{p.stem:22s} lum={(r+g+b)/3/255*100:5.1f}%  R-B={r-b:+6.0f}")
```
