# The floating scroll-to-latest arrow (card #33)

**2026-09-01, round 1.** Card:
<https://github.com/miftahulmahfuzh/JMTarot/issues/33>. Branch
`task/33-chat-floating-scroll-to-latest-arrow`.

## What was asked

> *"in chat grup, we already have 'pesan baru' button that auto scroll to the newest message.
> please also implement a small, floating, circular arrow down button that can help user quickly
> scroll down to the newest message. but dont make them redundant, if we are showing 'pesan baru'
> button, then hide the arrow down button."*

## The gap it closes, stated precisely

`newBelow` is set **only in `receive()`**, the handler that appends arriving bubbles
(`ChatRoom.tsx`, *"THE DECISION IS READ BEFORE THE DOM GROWS"*). So the `Pesan baru ↓` pill is a
function of **message arrival**, not of scroll position. A querent who scrolls up to re-read
yesterday, with nothing arriving, has no control at all to get back — only a flick.

The two controls therefore answer two different questions, and that is what makes them
non-redundant rather than a duplicate:

| Control | Question it answers | Driven by |
|---|---|---|
| `Pesan baru ↓` pill | *something was said while you were away — go read it* | `newBelow`, set on arrival |
| the arrow | *you are a long way up — go back* | scroll position |

## Approaches considered

**A. A second absolutely-positioned control inside `.listWrap`, rendered in the same ternary
chain as the pill. — CHOSEN.**

- *Convention*: `.listWrap` already exists as the pill's containing block and its header
  explains at length why an overlay here is `absolute` and never `fixed`. The arrow gets that
  reasoning for free.
- *Scope*: one state field, one predicate, one element, one stylesheet block, two copy keys.
- *Verifiability*: the mutual exclusion is a **single ternary chain**, which
  `chatSurface.test.ts` can assert at source level — the visibility predicate is pure and
  `src/lib/chatSurface.test.ts` owns it.
- *Reversibility*: one commit, no schema, no route, no model call.

**B. Morph the existing pill into a circle when there is nothing new.** Rejected. One control
with two meanings is exactly the redundancy the card is guarding against, wearing a different
coat: the pill is a *statement* (there are new messages) and the arrow is a *navigation
affordance*. Collapsing them means the querent cannot tell, from the same shape in the same
place, which of the two situations they are in.

**C. A `position: fixed` corner circle, like `ChatButton`.** Rejected on the reason already
written into `ChatRoom.module.css`: *"`position: fixed` would put it a fixed distance from a
viewport the software keyboard moves."* The room carries `--kb-inset` precisely because
`100dvh` cannot see the keyboard; a fixed control would sit behind it. The stylesheet's header
also says the two corner circles are the **only** fixed elements on this screen, and that
sentence is worth keeping true.

## The ambiguity call (step 4c)

*"small"* and the 44px iOS minimum pull against each other. **44px wins**, and the button is
made to *read* small by a 20px mark inside a low-contrast wash rather than by shrinking the
target. The narrow reading of the card is a small-looking button; the reading that loses is a
literally-36px one, and `PublicShare`'s 36px control is recorded in `CLAUDE.md` as a known
defect. If Miftah wanted a genuinely smaller target the card comes back and it is one line.

## The threshold: one screenful, not 48px

`shouldStickToBottom`'s `ANCHOR_THRESHOLD_PX = 48` is *"about one line of Cormorant plus its
padding"* — the right size for *"did the querent deliberately scroll away"*, and far too eager
for *"is a floating button worth putting in front of them"*. A querent one bubble up does not
want a control appearing over the room.

So a second, coarser predicate, in the same pure module and beside the first:

```ts
shouldOfferScrollToLatest(distanceFromBottom, viewportHeight)  // distance > viewportHeight
```

**One screenful, expressed as the list's own `clientHeight`, so it is self-scaling** — no new
magic number, correct on an iPhone SE and on a tall Android alike, and it means exactly *"the
newest message is entirely off screen and getting back is real work"*. The alternative
considered was a second fixed constant (`SCROLL_LATEST_THRESHOLD_PX = 240`); it lost because a
px figure would have to be justified against one screen size and would then be wrong on the
others.

`viewportHeight <= 0` returns `false`: before layout there is no distance to speak of, and the
guard keeps the predicate honest on the server and on the first paint.

## The mutual exclusion

```tsx
{newBelow ? <pill/> : awayFromBottom ? <arrow/> : null}
```

One expression, not two `&&` blocks. This is `ReadingView`'s yes/no-versus-choice rule in a new
place: *two answer boxes on one screen would disagree*, so the code is shaped such that they
**cannot** both render, rather than shaped such that they happen not to.

Note the chain is total in both directions: because `newBelow` can only be set while the querent
is more than 48px up, and 48px is far inside one screenful, a lit pill will usually also satisfy
the arrow's predicate — which is precisely the collision the card asked to be resolved, and the
`else` resolves it in the pill's favour.

## Where `awayFromBottom` is written, and where it is deliberately not

- **`onScroll` owns it, both directions.** It already reads `distance` for the pill; it now
  derives both flags from that one read.
- **`scrollToBottom` does NOT clear it**, unlike `newBelow`. With `behavior: 'smooth'` the scroll
  events fire *during* the animation, so clearing it up front would hide the arrow and `onScroll`
  would immediately bring it back — a flicker. Letting `onScroll` govern it alone means the arrow
  simply stays until the list arrives, which is what it should do. `newBelow` has no such problem
  because `onScroll` only ever *clears* it.
- **`receive()` does not touch it.** Appending below does not move `scrollTop`, so no scroll event
  fires — but if the querent was already more than 48px up, `newBelow` is set and the pill wins the
  ternary anyway; and if they were within 48px, `stick` is true and the list scrolls to the bottom.
  Neither branch leaves a stale arrow.

## Files

| File | Change |
|---|---|
| `src/lib/chatSurface.ts` | `shouldOfferScrollToLatest()`, beside `shouldStickToBottom` |
| `src/lib/chatSurface.test.ts` | its unit tests, including the pre-layout guard |
| `src/app/chat/ChatRoom.tsx` | `awayFromBottom` state, the `onScroll` write, the ternary arm, `ArrowDownMark` |
| `src/app/chat/ChatRoom.module.css` | `.jump`, from `ChatButton.module.css`'s palette — no new hex |
| `src/lib/i18n/locales/id.ts` | `chat.scrollToLatest` (written first; the red typecheck names the English one) |
| `src/lib/i18n/locales/en.ts` | its English string |
| `src/components/chatSurface.test.ts` | the source-level mutual-exclusion assertion |

## What the catalog ceiling cost, recorded rather than buried

`prose.test.ts`'s `MAX_BYTES` went **23,000 -> 25,000**, with the written reason the file's own
rule demands. This card did not spend the headroom: measured on `main` immediately before the
change, `id` was **22,995 bytes over 404 keys — five bytes under the ceiling.** One 16-character
`aria-label` breached it. The releases between 2026-08-08 and now consumed the 8.7% that
re-measure bought, and nothing reported it, because a ceiling with no reporting is silent until
it is a wall and then falls on whichever commit happens to be next. `MAX_VALUE` did not move and
nothing was relaxed to fit.

## Verified (loop 5, headless Chrome over CDP, against `next dev` + the local Postgres)

`tools/e2e/setup.sh` had never been run on this machine; it is idempotent and needed no sudo, so
loop 5 is now available here. 45 fixture messages seeded into the dev thread and removed
afterwards. Measurements, at `clientHeight = 577`:

| State | Distance from bottom | What rendered |
|---|---|---|
| Opened at the bottom | 0 | nothing |
| Scrolled up 300px | 300 | **nothing** — under one screenful, which is the point of the coarser threshold |
| Scrolled up 800px | 800 | the arrow alone: `44x44`, `aria-label="Ke pesan terbaru"` |
| Arrow tapped | back to 0 | nothing — it scrolled and cleared itself |
| Both flags true (probe: `onScroll` forced `setNewBelow(true)`, reverted) | 900 | **the pill alone.** The arrow was absent, which is the card's requirement |

The probe is what proves the exclusion: without forcing `newBelow`, the two conditions never
co-occur in a room where no beat is running, so the interesting state is unreachable by scrolling.

## Not done, and why

- **No unread count on the arrow.** The pill is the unread affordance; a count here would be the
  duplication the card is against, and `ChatButton.module.css` already argues at length against
  putting a number in a 44px circle.
- **Not measured on a phone.** Loop 6 owns the final placement against `--kb-inset`; WSL cannot
  answer it. The geometry is chosen to be safe by construction — absolute inside `.listWrap`,
  which is the row that shrinks when the keyboard rises.
