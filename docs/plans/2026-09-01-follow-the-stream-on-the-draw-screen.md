# Follow the stream on the draw screen

**Card:** [#32](https://github.com/miftahulmahfuzh/JMTarot/issues/32) — *Auto-scroll
the draw screen as the reading streams in*. Round 1, 2026-09-01.
**Branch:** `task/32-auto-scroll-the-draw-screen-as-the`, off `origin/main` at `d1477fa`.

## The report

The reading streams in four paragraphs, token by token. `ReadingPanel` scrolls itself
into view **once**, at the first content, and then never again — so the querent reads
about two lines and scrolls the rest of the way by hand.

## What is being reversed, and what replaces it

The one-shot scroll is not an oversight. `ReadingPanel.tsx` carried:

> Scroll the panel into view ONCE, when the first content appears -- not on every
> chunk. Following the stream would drag the page out from under a thumb that is
> trying to read what already arrived.

That harm is real and this change does not dismiss it — it answers it. **The panel now
follows the stream only while the querent has not scrolled away, and stops the instant
they do.** Scrolling up to re-read is a release; scrolling back to the bottom is a
re-acquire. The old comment is rewritten rather than deleted, because prose claiming a
rule the code no longer follows is worse than no prose.

## The decision: `scrollY` is the witness, not a pre-growth measurement

`ChatRoom` solves the same shape and its rule is **read the distance from the bottom
BEFORE the DOM grows** (`ChatRoom.tsx:380-397`), because after the commit
`scrollHeight` already includes the new content and every reader looks scrolled-away.
The card proposed porting that: read the distance in `Draw.tsx`'s stream loop, just
before `setReading`, and thread the decision down.

**That is not needed here, and the reason is a real difference between the two
surfaces: `ChatRoom` also PREPENDS** — `loadOlder` puts history above the viewport and
genuinely moves `scrollTop` under the querent, which is why that component carries a
`prependedFromRef` compensation as well. **The draw screen only ever appends.** Appended
content cannot move `scrollY`. So the last value *we* wrote with `scrollTo` is a
complete witness:

| `scrollY` vs. the last value we set | What happened | Follow? |
|---|---|---|
| equal | the page grew under a querent who did not move | yes |
| smaller | the querent scrolled up to re-read | no — release |
| anything, and now within 48px of the bottom | they scrolled back down | yes — re-acquire |

No pre-growth read, no state threaded through an 851-line component, no props boundary
crossed. The whole mechanism is one ref and one layout effect inside the component that
owns the prose.

### Approaches that lost

- **Port `ChatRoom`'s read-before-growth into `Draw.tsx`'s stream loop** (what the card
  suggested). *Scope*: it puts scroll bookkeeping inside the chunk loop — a function
  whose comments are already entirely about the choice marker's wire format — and then
  has to carry the answer across a props boundary. It buys nothing the `scrollY`
  comparison does not already give, because the surface never prepends.
- **A passive window `scroll` listener that releases on any user scroll.**
  *Verifiability*: it cannot tell our own programmatic scroll from the querent's, so it
  needs a suppression flag around every `scrollTo` — and the flag is only correct if
  scroll events coalesce, which no spec promises. The `lastFollowY` comparison reaches
  the same answer with no listener and nothing to get wrong.
- **Import `shouldStickToBottom` from `@/lib/chatSurface`.** *Convention*: that
  module's own header declares it *the chat surface's* decisions, and it imports
  `@/lib/chat/types`. This repo already keeps one pure module per surface —
  `swipeDeck.ts`, `chatSurface.ts`, `draw.ts` — so a third is the pattern rather than a
  duplication. The threshold is re-derived for prose rather than copied for bubbles.
- **Anchor on the bottom of the panel element instead of the document.** *Scope*: it
  needs an element ref and `getBoundingClientRect` arithmetic to reach a worse place.
  `.shell` already carries `padding-bottom: calc(96px + env(safe-area-inset-bottom))`
  to clear the **fixed** `.footer`, so the document bottom lands the newest line exactly
  above that footer, with breathing room, for free.

## `'auto'`, always — and that is stronger than reading the two globals

The card names the trap correctly: **a JS `scrollTo({ behavior })` OVERRIDES CSS
`scroll-behavior` rather than defaulting from it**, so `prefers-reduced-motion` and
`html[data-still]` have to be read in JS — `reduce || isStill() ? 'auto' : 'smooth'`,
as in `ChatRoom.tsx:827`, `SwipeDeck.tsx:110` and `admin/ScrollTop.tsx:85`.

**The follow passes `'auto'` unconditionally, so there is nothing to read.** Two
reasons, and the first is not about accessibility at all:

1. **A per-chunk `smooth` scroll never lands.** Chunks arrive every few tens of
   milliseconds and each `scrollTo` restarts the animation from wherever the last one
   got to, so the viewport permanently trails the text and jitters. `smooth` is right
   for one discrete jump — a new chat message, a back-to-top tap — and wrong for a
   continuous crawl. The deltas here are a few words, so an instant scroll per chunk
   *reads* as smooth.
2. `'auto'` is exactly what `reduce` and `data-still` would have asked for. Hardcoding
   the answer they would give cannot drift out of step with them; a conditional can.

## `done` is excluded on purpose

The follow runs for `status === 'streaming'` only. The `done` commit is not just the
last few words — it also mounts `AttachReadingLink`, `ReadingActions` and the
disclaimer. Following the document bottom through that commit would scroll the querent
past the final paragraph they are mid-sentence in, to land on a row of buttons: the
precise harm the original comment named, at the one moment it would be most annoying.
The residue given up is the flush delta after the loop (`decoder.decode()` with no
pending bytes returns `''`), which is normally nothing.

## Scope

**The draw screen only.** The card asked for `/history/[id]`'s refill to be checked
deliberately rather than by accident: it was, and it **does not mount `ReadingPanel`**
— `HistoryDetail` streams a refill through `ReadingView` — so it inherits nothing from
this change. The other reading of the card was to extend the follow to that path too;
it loses because it is a different renderer on a much rarer path and was not what was
reported. If it is wanted, it is a card. `/s/<slug>` never streams.

## Files

| File | Change |
|---|---|
| `src/lib/readingScroll.ts` | **new.** PURE — no React, no DOM, no `next/*`. The predicate and its threshold. |
| `src/lib/readingScroll.test.ts` | **new.** The predicate's table, including the release and both re-acquire paths. |
| `src/components/ReadingPanel.tsx` | the one-shot effect becomes acquire-then-follow; the comment is rewritten. |
| `src/components/readingScroll.test.ts` | **new.** Source-level contract on the component, `readingRhythm.test.ts`'s idiom. |

## Verifying it

`npm test` reaches the predicate and the source contract, and that is all it can reach —
there is no jsdom, no Testing Library and no browser in this project, and none may be
added. The behaviour that actually matters is loop 5 (`tools/e2e/run.sh` with
`E2E_BASE=http://localhost:3001`) for the mechanics, and **loop 6, a real iPhone**, for
the judgement: momentum scrolling and a chunk landing mid-drag are the inputs WSL cannot
produce. Recorded as unmeasured rather than claimed.
