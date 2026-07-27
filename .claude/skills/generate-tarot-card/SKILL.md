---
name: generate-tarot-card
description: Generate and grade one Major Arcana card image for JMTarot's deck via the OpenAI image API. Use when asked to generate, regenerate, or iterate on card art - e.g. "/generate-tarot-card Strength", "regenerate The Tower", "make the Devil darker". Handles the full loop: prompt assembly from the locked style contract, generation against the deck anchor, measurement, and visual judgement.
---

# Generate a tarot card

One card per invocation. Generate it, measure it, **look at it**, judge it,
revise, repeat — up to three attempts — then report. The operator should not
have to see anything except the final card and the reason it passed.

## Before anything else

Read `.claude/skills/generate-tarot-card/style.md`. It is the contract: one
verbatim style block plus 22 per-card scene lines. **You do not write prompts
for this deck** — you assemble them from that file. If a card needs a different
scene, edit the scene line in `style.md` so the change is recorded, then
generate; never pass prose the file does not contain.

## The loop

**1. Resolve the card.** Match the operator's words against the 22 slugs in
`style.md` (`Strength` → `08_strength`, `wheel of fortune` →
`10_wheel_of_fortune`). Ambiguous or unmatched: ask, do not guess. A wrong guess
costs a paid image.

**2. Find the anchor.** `assets/major_arcanas/_anchor.png`, if it exists, is the
approved reference card and **every generation passes it with `--reference`.**
This is the mechanism the whole consistency strategy rests on: cards 2–22 are
generated against an image, not against a description of one. No anchor means
this is the anchor run — say so in the report.

**3. Generate.**

```sh
python3 tools/gen_card_art.py <slug> [--reference assets/major_arcanas/_anchor.png] [--note "..."]
```

Writes `assets/major_arcanas/_candidates/<slug>.aNN.png` plus a `.txt` sidecar
holding the exact prompt. `--dry-run` prints the prompt and spends nothing — use
it when you have edited `style.md` and want to confirm the assembly before
paying for it.

**4. Measure.**

```sh
python3 tools/check_card_art.py assets/major_arcanas/_candidates/<slug>.aNN.png \
  [--anchor assets/major_arcanas/_anchor.png]
```

Six checks. Geometry, full bleed (two independent reads), frame luminance, blood
share, corner safety, anchor agreement.

**5. LOOK AT IT.** Read the PNG. This step is not optional and the measurements
do not replace it — the failure that ruined the last deck was ten cards sharing
one mountain-and-lake backdrop, and no number above detects that. Judge:

- **Any text at all?** Instant reject. Image models put titles on tarot cards by
  reflex, and this one is asked not to.
- **Does it repeat another card's setting?** Compare against the cards already
  approved. This is the check that matters most and the easiest to skip.
- **Does it hold upside down?** The app renders a reversed card by rotating the
  art 180°. Mentally invert it; if it collapses, the scene is wrong.
- **Is the blood a mark left behind, or a wound?** The contract says stain, pool,
  drip, rill. A wound is both off-brief and the thing that gets refused.
- **Is it grave, or is it lurid?** Unflinching about a cruel world is the deck.
  Enjoying it is not, and this app has a self-harm crisis path one screen away.
- **COUNT THE LIMBS.** Arms, hands, fingers, legs, and the same for any animal.
  Trace each arm from shoulder to hand and check it belongs to the side it came
  from. The Empress shipped with two arms on her left and none on her right, and
  it got through a review that checked everything else -- anatomy is the most
  common failure of these models and the easiest to miss at thumbnail size. Zoom
  in on the figure; do not judge it from the contact sheet. **Fix it with pose
  language, never by counting** -- `one forearm on the armrest, the other hand on
  her belly` generates; `one arm to each side, both shoulders visible` and a note
  saying `no third arm` were both refused as body horror. style.md has the detail.
- **Is it actually good?**

**6. Revise, up to three attempts total.** Pass one instruction via `--note`,
naming the specific defect (`"no lettering on the banner"`, `"colder light, less
orange"`). Do not re-send an identical prompt hoping for a better roll, and do
not stack five notes — one change per attempt or you cannot tell which one
worked. On a content-policy refusal, soften the **depiction** and keep the mood;
the generator prints this reminder itself.

**7. Report.** The winning candidate's path, its measurements, what you rejected
and why, and the attempt count. Show the operator the image.

## Stop at the candidate

Two things this skill deliberately does **not** do, because both are decisions
and neither is reversible by re-running a script:

- **It never writes to `assets/major_arcanas/`.** That is source art —
  CLAUDE.md's rule is *never edit in place, never delete*. Promotion is a human
  act. Suggest it; do not do it.
- **It never runs `npm run assets`.** Regenerating `public/cards/**` has to be
  planned, because `next.config.ts` serves those files with a one-year
  `immutable` cache on slug-based, non-content-hashed filenames — existing
  installs keep the old art unless the filenames change or that header is
  shortened first. Flag it; let the operator sequence it.

Setting the anchor is also a human act: once a card is approved as the deck's
reference, the operator copies it to `assets/major_arcanas/_anchor.png`.

## Facts worth not rediscovering

- **`1024x1536` is exactly 2:3**, which is exactly what the app draws
  (`CARD_RATIO` in `src/theme/tokens.ts`, Fan `88x132`, Slots `90x135`,
  `CardDetail`'s `aspect-ratio: 2/3`). The old art was *also* 2:3 and still
  showed side gaps — the model painted a card inside a black mat, so cards 0–10
  lost 11% of their width to bars that `normalize_cards.py` then padded back.
  **The ratio was never the bug; `full bleed` is the fix**, and check step 4 is
  what proves it landed.
- **The key is `OPENAI_API_KEY`, and `.env.local` IS NOT A RELIABLE PLACE TO KEEP
  IT ON THIS MACHINE.** Something here strips that variable back out of the file:
  observed twice in one session, once between the anchor run and the batch, which
  killed all 21 cards at the first `load_key()` before spending anything. So
  **check the key is still there before a batch, and prefer passing it in for the
  duration:**

  ```sh
  OPENAI_API_KEY=sk-... python3 tools/gen_card_art.py <slug> --reference assets/major_arcanas/_anchor.png
  ```

  `gen_card_art.py` reads `.env.local` first and the environment second, and
  prints which one it used — so `key from: environment` in the log is the normal,
  working case here, not a warning. It is separate from `LLM_API_KEY`:
  `src/lib/llm/openai.ts` does not read it and must not; that adapter is the
  reading-provider fallback and has nothing to do with images.
- **Default model `gpt-image-2`**, overridable with `--model`. Also available
  here: `gpt-image-1.5`, `gpt-image-1`, `gpt-image-1-mini`.
- **Both scripts are stdlib + PIL only.** This machine has no `requests`, no
  `httpx` and no `openai` package, and the repository already argued in
  `src/lib/llm/openai.ts` why it does not want another SDK.
- **`RES_OPTIONS=no-aaaa` is set inside `gen_card_art.py`**, before any DNS, for
  the reason CLAUDE.md gives at length. Do not remove it and do not move it into
  `main()`.
- **`docs/art-inconsistency.md` is the measured account of what went wrong last
  time.** The frame-luminance band in `check_card_art.py` is that document's
  band verbatim, so the numbers are comparable across the two decks.
