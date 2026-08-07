# F4 — The surface: `/chat`, the button, bubbles, avatars, reply-to

> **Read order** (roadmap §0.2): `docs/plans/2026-08-07-RECONCILIATION-v0.7.0.md` →
> `PUBLIC_RELEASE_ROADMAP_v0.7.0.md` → this file → the `CLAUDE.md` sections named
> below → `docs/workstream-notes.md`'s sections for them. Then the code.
>
> **`CLAUDE.md` sections this plan depends on and expects you to have read:**
> `## How to verify things here` (the six loops), `## Traps` (all of it — five entries
> below are quoted from it), `## Styling`, `## Localization (W6)` and its *five things
> a future session will otherwise undo*, `## The reader swipe deck (V5)`, `## History
> (V6)`, `## /account and the persona (V8)`, `## The markdown editor for /admin/blog`
> (the four-bounded-fetches convention).
>
> **Depends on F1 only.** F1 ships the three tables, the six routes and
> `src/lib/chat/types.ts`. This plan consumes those routes and builds nothing behind
> them. Where I need a field §4/§5 does not define, it is in `## Discrepancies with
> the roadmap` and **not** invented here.

**Goal.** One room, at `/chat`, that reads like a group chat on a 375px phone: the
querent and three readers, bubbles that arrive whole, a typing indicator that means
somebody is actually about to speak, a reply-to affordance a thumb can hit, and a
button in the corner of four other screens that grows a dot when there is something
to come back for.

**What I own** (roadmap §7, F4): `src/app/chat/**`; `src/components/Chat*.tsx` and
their CSS modules; `tools/make_avatars.py` and `npm run avatars`; `public/readers/**`;
the `chat.*` keys in `src/lib/i18n/locales/id.ts`; the middleware matcher entry for
`/readers/`; and an `accountSurface.test.ts` sibling.

**What I must not touch:** any route handler, any prompt, `schema.ts`,
`src/components/AccountButton.tsx` (seam S9), `src/lib/analytics/events.ts` (F1 owns
it for this release, `C-D14` — my events are declared in `## Events` for F1 to fold).

**Tech stack: unchanged, and that is a requirement.** Next 16 App Router, React 19,
CSS modules composed from `src/theme/tokens.css`, Vitest, Python + Pillow for the
asset script. **No new npm dependency of any kind** — no virtual list, no gesture
library, no date library, no markdown renderer. `VD17`'s argument against a carousel
library applies to a chat list with more force: the thing a dependency would buy here
is exactly the thing this repo has no browser to verify.

---

## 1. Numbered invariants

Each is stated as a rule, with its reason and the shape of the failure if it is
undone. These are what a future session should find first.

### `[F4-1]` `/chat` is gated, and `isPublic()` must never learn it

`C-D12`, and it is `CLAUDE.md`'s sentence about `/history` with a stronger reason:
this room contains the querent's six onboarding answers spoken aloud by three
characters. `/chat` is **not** in `isPublic()`, **is** inside the middleware matcher,
carries `robots: { index: false, follow: false }` in its `metadata`, emits no
canonical and no `hreflang`, and appears in `SITEMAP_PATHS` nowhere.

**And `/en/chat` must 404.** Contract `G2`: `isPublic()`'s content clause strips
`/en/`; the other clauses must not, and `isPublicContentPath` is an exact-match table
plus a one-segment tree check — so `/en/chat` reaches `decide()` spelled as the
request spelled it and matches nothing. `gate.test.ts` already has the test named for
the worst outcome available in v0.4.0; this release adds `/chat` and `/en/chat` to
it. **Failure mode:** a public `/chat` is a stranger reading somebody's worst thing,
and it would look like a working feature.

### `[F4-2]` `ChatButton` is mounted by the owning server page, never by `src/app/layout.tsx`, and it is **absent from the draw screen**

`C-D17`. `AccountButton`'s header states the rule and its three reasons and I am
copying all of them, including the absence:

- **Mounting it *is* the session check.** `/`, `/[reader]`, `/account` and `/history`
  are all outside `isPublic()`, so `src/middleware.ts` has already proved there is a
  signed-in, onboarded user before any of them renders. `ChatButton` reads no session,
  takes no `Viewer` and needs no `ViewerProvider`.
- **Mounting it in the root layout** would mean either an `auth()` call on every
  request the app serves — including `/terms`, `/privacy` and V7's public `/s/[slug]`
  — or a second copy of `isPublic()` kept in step by hand.
- **NOT ON THE DRAW SCREEN**, for `AccountButton`'s reason 2 verbatim: *a one-tap exit
  in the corner of a streaming page is wrong regardless.* `Draw.tsx` aborts its
  reading on unmount, so a tap here mid-stream kills the reading and records
  `reading.aborted`. The draw screen's route into the chat is F6's attachment control,
  which appears only after the reading is finished.
- **NOT ON `/chat` ITSELF.** A badge on the page you are already looking at is a
  control that points at itself, and `PublicShell`'s deleted `LINKS` table is the
  precedent — deleting the filter with it let the landing page's footer grow a link to
  itself.
- **NOT ON ANY PAGE WITHOUT A SESSION**: `app/login/`, `app/terms/`, `app/privacy/`,
  `app/onboarding/`, `app/s/`, `app/Landing.tsx`, `app/gallery/`, `app/arcana/`,
  `app/blog/`.

**The enforcement is the absence of an import, never a runtime flag**, and
`src/components/chatSurface.test.ts` is the deny-shaped guard. **Failure mode:** a
flag that can desync; a circle with nothing behind it on a stranger's page; a reading
aborted by a corner tap.

### `[F4-3]` `position: fixed` positions against the nearest transformed ancestor, not the viewport

Unchanged from `AccountButton`'s header. `fixed` resolves against the nearest ancestor
carrying a `transform`, `filter` or `perspective`, so `ChatButton` is a **direct child
of the page's shell** and never inside `.bleed` or anything under `Fan.module.css`.
It does not portal, for `AccountButton`'s reason: a portal needs a mounted flag and
the button would then pop in after hydration. **Failure mode:** the circle lands
somewhere else entirely, on one page, and looks like a CSS mistake in the wrong file.

### `[F4-4]` The badge is client-fetched, renders nothing at zero, and nothing forever if there is never anything

`C-D18` plus `M14` — `FrequencyLine`'s and `DaySummary`'s contract in a third place.
`ChatButton` renders with **no dot**, one `GET /api/chat/state` fills it in after
mount, and at `unread === 0` there is no dot, no skeleton, no reserved height and no
`0`. The button's own geometry is identical in both states, so nothing reflows.

**No server read.** Reading `chat_threads` in four server pages puts a database read
on the render path of the busiest screen in the app, which roadmap §0.3 forbids, and
it would flash a stale dot on a cached render. **Failure mode:** a `0` badge announces
that a feature exists and that this user has not earned it — roadmap §5's empty state,
wearing a dot.

### `[F4-5]` The chat is the one fetching client component in this app whose effect must **not** depend on `locale`

`FrequencyLine` and `DaySummary` both had to *acquire* `locale` in their dependency
arrays, because `frequency_verdicts` and `daily_summaries` are keyed on locale and
`router.refresh()` keeps client state by design. Both accounts are in `CLAUDE.md`.

**`ChatRoom` is the opposite case and a future session will "fix" it to match.**
`C-D9`: a chat message is written once, in the language it was written in, and stays
there; `TRANSLATABLE` gets no new entry and `translations` gets no new `entity`. So
the messages do not change when the chrome changes language, re-fetching them would
cost a request and return byte-identical rows, and mid-run it would **race the advance
loop**. The dependency array is `[]` plus the refs, and it carries a comment naming
`C-D9` and naming the two components that legitimately do the other thing.

**Failure mode:** an English switch mid-run re-mounts the loop, the lease is already
held, and a bubble either doubles or vanishes — with nothing logged.

### `[F4-6]` A bubble carries `lang`; the page does not

`C-D9`'s last clause. `<html lang>` and every piece of chrome follow the viewer's
locale through `t()`. Each bubble carries `lang={message.locale}` on its own prose
element, because a querent may type Indonesian into the English app and the readers
mirror what they were asked in. This is `ReadingView`'s question block's rule
(rendered with no `lang`) taken one step further, because here we *know* the language
of every message and store it.

**`ReadingView`'s rule 4 does not apply and must not be imported.** There is no
translating state, no spinner, no `unavailable`. A foreign-locale bubble renders as
written. **Failure mode:** somebody reaches for `resolveProse`'s shape and puts a
querent's own sentence behind a spinner that will never resolve.

### `[F4-7]` The typing delay is server-declared and client-honoured, and `prefers-reduced-motion` suppresses the animation but never the delay

`C-R4`. The server returns `delayMs`; the client waits before asking for the next
beat. The server never sleeps. Under `prefers-reduced-motion` the three-dot indicator
does not animate — it renders as a static line naming the reader — **and the delay
still applies**, because the delay is the inter-turn beat that makes the room read as
people rather than as a dump, and it is not motion.

`usePrefersReducedMotion()` already exists and is the only correct way to read it here
(a media query cannot swap a component). **Failure mode:** somebody folds the delay
into the animation, and a reduced-motion querent gets three bubbles at once.

### `[F4-8]` One `advance` call, one beat, and the loop is driven from a ref — never from `messages`

`C-R2`. The effect that drives the loop must not list `messages` in its dependency
array. `messages` is a fresh array on every render and every bubble re-renders the
room, so listing it re-enters the loop per bubble.

**This is V5's measured finding, not a style preference.** `SwipeDeck`'s header
carries the five-row table: the dependency list is the primary mechanism, `slidTo` is
the belt, and `react-hooks/exhaustive-deps` will never argue either way because the
body reads `panelsRef.current`. `ChatRoom` uses the identical shape — `messagesRef`,
`runRef`, `stateRef` — and the effect depends on the run id and nothing else.
**Failure mode:** N concurrent `advance` calls for one run; the lease saves the
database and the screen still shows a mess.

### `[F4-9]` A new bubble never yanks the querent out of history they are reading

§4. The list auto-scrolls **only** when the querent was already at the bottom, or when
the new bubble is their own. Otherwise a `Pesan baru ↓` pill appears and scrolling is
their decision. **Failure mode:** reading back through yesterday and being thrown to
the bottom by Adrian is the single most annoying thing a chat client does.

### `[F4-10]` A JS `scrollTo({ behavior })` **overrides** CSS `scroll-behavior` rather than defaulting from it

V5's `goTo` paid for this and its comment is the record: `html[data-still]
.scroller { scroll-behavior: auto }` governs a keyboard or scrollbar scroll and has
**no say at all** over a `scrollTo({behavior:'smooth'})` call. So every programmatic
scroll in `ChatRoom` reads `document.documentElement.hasAttribute('data-still')`
**itself** and passes `behavior: 'auto'` when it is set, exactly as `goTo` does.

**Found by the harness, not by reading**: under `--virtual-time-budget` a smooth
scroll advances one frame and stops, because it is driven by the compositor clock
rather than the task queue. `_chatfit.html` would photograph every list mid-glide.
**Failure mode:** every measurement in loop 4 is taken at a scroll position that does
not exist.

### `[F4-11]` Every fetch is bounded, and the **count** is asserted

The blog editor's convention (`MarkdownEditor.tsx`, `admin.blog.contract.test.ts`
lines 324–347): every `await fetch(` has a matching `signal:`, every one has its own
`AbortController` + `setTimeout`, each bound sits **under** its route's `maxDuration`
so the client's own copy wins over a platform 504, and the number of fetches is
asserted so a fifth unbounded one is red. §3.4 is the table. **Failure mode:** a hang
that reads as a dead app, with no copy on screen and a 504 nobody can diagnose.

### `[F4-12]` A timeout is the one outcome that means UNKNOWN, so it is the only one retried — once, with the run id kept

`POST /api/locale`'s third rule, verbatim. `!response.ok` and offline are **answers**
and do not retry. A timed-out `advance` may have executed its beat and written its row,
so the retry keeps the run id and the server's lease + `beats_done` accounting is what
makes it idempotent-enough. After one failed retry the loop stops and the room is
quiet — `C-R7`: **there is no error bubble in this release.**

### `[F4-13]` A failure is silence, and the *composer* is where the app speaks

`C-R7`. A run that degrades shows nothing. The only failures that get copy are the
ones the querent caused and can act on: their own message not sending, and the room
not loading. Both render **outside** the message list, in the composer area and above
it respectively, so no failure notice can ever be mistaken for something a reader
said. **Failure mode:** `[Bacaan terputus…]` in a bubble is stored as context for the
next turn and quoted back at the querent as if a reader had said it — W4's rule,
automatic in a chat.

### `[F4-14]` A refusal renders `RefusalNotice`, never a bubble, and the refused text is not added to the list

`C-D13`. It is the app speaking, never Thessaly — *a reader who refuses you is a
friend who refuses you.* The optimistic bubble for the refused message is **removed**
from the list, the composer keeps the text so the querent can see what was refused,
and `RefusalNotice` renders under the composer with its existing copy and its
`/terms#6-2` link. **No new copy keys** — W7 owns that component and its strings.
**Failure mode:** a refusal in a reader's voice, or a refused sentence sitting in the
room forever.

### `[F4-15]` `todayKey()` and `new Date()` are never called during render

`CLAUDE.md`'s trap and V6's `HistoryBrowser` shape. The day separators (*Hari ini*,
*Kemarin*, a date) need the **querent's** calendar day, which the server does not
know: `toISOString()` rolls over at 07:00 in Jakarta. `ChatRoom` starts with
`today = null`, renders the shell, and sets it in an effect — nothing flashes because
there was never any content to replace. **Failure mode:** a hydration mismatch React
cannot patch, and *Hari ini* over yesterday's messages for a third of every Jakarta
evening.

### `[F4-16]` `track()` is called in the handler body, never inside a `setState` updater

`AccountButton`'s comment in capitals, and the fan's dead-in-development bug.
StrictMode double-invokes updaters, so an event fired from inside one is doubled in
development and single in production — the worst kind of measurement bug, because the
numbers are wrong only where you look at them. Same rule for the accumulate-then-set
pattern: `setMessages(next)` with a locally built array, never
`setMessages(prev => [...prev, m])` where `m` came from a side effect.

### `[F4-17]` Compose from tokens. `tokens.ts` changes first, then `tokens.css` mirrors it

`## Styling`. Three new custom properties, all geometry, no new hex, no new font size,
no new easing curve. The one place a new value was *considered* — a red notification
dot — is argued and refused in §5.3. **Failure mode:** the corner chrome drifts out of
alignment on one screen and nobody notices because there is no test for a hex.

### `[F4-18]` `/readers/*` is excluded in the **matcher**, and is **not** `/cards/*`'s year of `immutable`

`C-D16` and `R7`. Two separate rules that look like one:

1. **The matcher.** `wallpapers/`, `cards/` and `dukuns/` are excluded in
   `src/middleware.ts`'s negative lookahead and `readers/` joins them. Adding
   `/readers` to `isPublic()` instead returns 200 and leaves middleware running — so
   the locale-cookie write fires and puts a `Set-Cookie` on a static image. **This is
   a matcher change, not an `isPublic()` change.**
2. **The cache header.** `public, max-age=86400, stale-while-revalidate=604800`, its
   own entry, **not** `/cards/*`'s year of `immutable`. That mistake has already been
   made once in this repo with `/wallpapers/`, from `/cards/*`'s reasoning rather than
   from a declaration. The crop table is hand-written and will be tuned; a year of
   `immutable` on three non-content-hashed filenames means every existing install
   keeps a bad crop until 2027.

### `[F4-19]` The querent's avatar is the lotus, and it is not a Google picture and not a letter

`C-D16`, and `AccountButton`'s header carries the full argument: `picture` was removed
from the token deliberately (reconciliation R21, the 548-vs-676-byte cookie
measurement) to avoid a CSP `img-src` exception for a decorative element; a lettered
circle reads as Gmail; and `users.display_name` is the **Google** name while the name
this app calls the querent by is the nickname from onboarding, which a render path may
not read. The lotus needs no data, no session and no network. **Failure mode:**
reintroducing the avatar is a CSP change and a cookie-size regression for decoration.

### `[F4-20]` Any dialog this surface opens takes its opener as a `returnFocusTo` **prop**

**Safari does not focus a `<button>` when it is clicked or tapped**, so
`document.activeElement` on the way into a sheet captures `<body>` on the one platform
this app is built for. `AccountMenu` and `CardDetail` both take the opener as a prop
for exactly this. F4 opens no sheet in v0.7.0 (§5 chooses an inline affordance over a
menu, partly for this reason) — **the invariant is recorded so that the first person
who adds one does not rediscover it.** If F6's attachment bubble opens a `CardDetail`,
it passes `returnFocusTo`.

---

## 2. The screen

### 2.1 `/chat` at 375px

Fixed chrome in the corner, a sticky header, one scrolling region, a composer pinned
to the bottom. Everything between the two rules scrolls; nothing else does.

```
375px · standalone · notched device
╔══════════════════════════════════════════════════════════╗
║                                            ← env(safe-area-inset-top)
║  ← Beranda                          ( ✉ )       ( ✿ )    ║  FIXED, z-index 800.
║                                       ↑ not mounted here  ║  ChatButton is ABSENT
║                                                           ║  on /chat itself (F4-2).
║  ┌─────────────────────────────────────────────────────┐  ║  Only AccountButton.
║  │  ⓣ ⓜ ⓐ   GRUP                                       │  ║  STICKY header.
║  │           Thessaly, Margaret, dan Adrian.            │  ║  Avatars 28px, -8px
║  │           Untuk hiburan semata.                      │  ║  overlap, gold hairline.
║  └─────────────────────────────────────────────────────┘  ║
║ ─────────────────────────────────────────────────────────  ║ ← hairline
║                                                     ▲     ║
║              ──────  Kemarin  ──────                │     ║  SCROLLS.
║                                                     │     ║  overscroll-behavior:
║  ⓣ ┌─────────────────────────────────┐              │     ║  contain, so the room
║    │ THESSALY                        │              │     ║  does not drag the page.
║    │ kamu masih kepikiran yang       │              │     ║
║    │ kemarin itu, mif?               │              │     ║  READER BUBBLE
║    │                          19.40  │              │     ║  left, --gold-wash,
║    └─────────────────────────────────┘              │     ║  radius 10/10/10/2
║                                                     │     ║
║              ┌──────────────────────────────────┐   │     ║  USER BUBBLE
║              │ iya. gatau mau mulai dari mana    │   │     ║  right, --gold-wash-
║              │                           19.41   │   │     ║  strong, radius
║              └──────────────────────────────────┘   │     ║  10/10/2/10, no name
║                                                     │     ║
║              ──────  Hari ini  ──────               │     ║
║                                                     │     ║
║  ⓜ ┌─────────────────────────────────┐              │     ║  QUOTE STUB inside a
║    │ MARGARET                        │              │     ║  bubble: a 2px gold
║    │ ┃ kamu · "gatau mau mulai…"     │              │     ║  left rule, the author,
║    │ mulai dari yang paling kecil.   │              │     ║  one clamped line.
║    │                          08.12  │              │     ║  TAPPABLE -> scrolls to
║    └─────────────────────────────────┘              │     ║  the quoted bubble.
║                                                     │     ║
║  ⓐ ┌─────────────────────────────────┐              │     ║  ATTACHMENT bubble
║    │ ADRIAN                          │              │     ║  (F6 renders the card;
║    │ ┌────────────────────────────┐  │              │     ║  F4 owns the SLOT and
║    │ │ ▯ ▯ ▯   Spread 3 · 26 Jul  │  │              │     ║  the bubble around it)
║    │ │ "haruskah aku pindah kerja"│  │              │     ║
║    │ └────────────────────────────┘  │              │     ║
║    │ ini yang kemarin itu ya         │              │     ║
║    │                          08.13  │              │     ║
║    └─────────────────────────────────┘              │     ║
║                                                     │     ║
║  ⓣ  ● ● ●                                           │     ║  TYPING INDICATOR.
║     Thessaly lagi ngetik…                           ▼     ║  A ROW IN THE LIST,
║                                             ┌───────────┐ ║  at the end, so the
║                                             │Pesan baru↓│ ║  anchoring rule sees it.
║                                             └───────────┘ ║  PILL: fixed above the
║ ─────────────────────────────────────────────────────────  ║  composer, only when
║  ┌─────────────────────────────────────────────────────┐  ║  scrolled away (§4).
║  │ ┃ Margaret · "mulai dari yang paling kecil."      × │  ║  REPLY-TO STUB.
║  └─────────────────────────────────────────────────────┘  ║  Only while replying.
║  ┌──────────────────────────────────┐   ┌─────────────┐   ║  COMPOSER. FIXED.
║  │ Tulis sesuatu…                   │   │   KIRIM     │   ║  textarea, 1–4 rows,
║  └──────────────────────────────────┘   └─────────────┘   ║  44px min, then grows.
║                                            ← env(safe-area-inset-bottom)
╚══════════════════════════════════════════════════════════╝
```

### 2.2 What is fixed, what scrolls

| Region | Position | Why |
|---|---|---|
| `AccountButton` | `fixed`, top right | V4's own rule, unchanged. `ChatButton` is not here (`F4-2`). |
| Header (avatars, title, disclaimer) | `position: sticky; top: 0` inside the shell | It is one 72px band naming who is in the room. Sticky rather than fixed so it participates in the shell's grid and needs no manual offset on the list. |
| Message list | the **only** scroller | `flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain`. |
| Typing indicator | the **last row of the list** | Not an overlay. If it floated, the anchoring rule (§4) would not see the list grow when it appears and the querent would be pushed by a bubble they never saw coming. |
| `Pesan baru ↓` pill | `position: absolute` inside the shell, above the composer | Absolute, not fixed — the shell is not transformed, but absolute keeps it inside the grid row and out of `F4-3`'s way entirely. |
| Reply-to stub + composer | the shell's last grid row | Not `position: fixed`. See below. |

**The composer is a grid row, not `position: fixed`, and that is the whole geometry
decision.** `fixed` positions against the *visual viewport* on iOS only when the
software keyboard is up, and against the *layout viewport* the rest of the time —
which is why every hand-rolled chat composer on the web ends up either behind the
keyboard or floating over the middle of the screen. A grid row inside a shell whose
height is the dynamic viewport height is the version that has one behaviour.

### 2.3 `100dvh` and the safe-area insets

`globals.css` already does two things this shell must not fight:

```css
body { min-height: 100dvh;
       padding-top: env(safe-area-inset-top);
       padding-bottom: env(safe-area-inset-bottom); }
```

So a child with `height: 100dvh` overflows the body by **the sum of both insets** — on
a notched iPhone in standalone that is ~59px of the room hanging below the fold, with
the composer inside it. The shell is therefore:

```css
.shell {
  display: grid;
  grid-template-rows: auto 1fr auto;   /* header · list · composer */
  height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  max-width: 520px;                    /* the app's shell width, as everywhere */
  margin: 0 auto;
  overflow: hidden;                    /* the LIST scrolls; the shell never does */
}
.list { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
```

`min-height: 0` on the list is not optional: a grid/flex item's default `min-height:
auto` refuses to shrink below its content, so without it the list grows to fit every
bubble and pushes the composer off the bottom of the screen — with no scrollbar,
because the shell is `overflow: hidden`.

`100dvh` rather than `100vh`, for the reason `globals.css` already records: Safari's
toolbar collapses on scroll, so `vh` is measured against a viewport that does not
exist yet.

**Only loop 6 can confirm any of this.** Loop 5's Chrome reports `innerWidth` and
`outerWidth` of 500 whatever `--width` says, has no software keyboard, no home
indicator, no notch and no collapsing toolbar. `env(safe-area-inset-*)` resolves to
`0px` there, so **the shell measures identically correct and identically wrong**. The
three questions that carry over to `## Verification`'s loop-6 list are: does the
composer sit above the home indicator in standalone; does `100dvh` settle or fight the
collapsing toolbar while the list is scrolled; and does the keyboard coming up shrink
`dvh` (iOS 26 behaviour) or overlay it.

### 2.4 The bubble shapes

Four shapes, one component (`ChatBubble.tsx`), a discriminated union on `author`.

| | Reader | Querent |
|---|---|---|
| Align | left, avatar in a 36px gutter | right, no avatar, no gutter |
| Fill | `--gold-wash` | `--gold-wash-strong` |
| Border | `1px solid var(--gold-hairline)` | `1px solid var(--gold-border)` |
| Radius | `10 10 10 2` (`--radius-card` / `--radius-chip`) | `10 10 2 10` |
| Name | Cinzel `--fs-eyebrow`, `--ls-button`, uppercase, `--gold` | **absent** — it is obviously you |
| Prose | `--font-body`, `--fs-hint` (17px), `--lh-reading`, `--text-warm` | same |
| Max width | `min(78%, 34ch)` | `min(78%, 34ch)` |
| Time | `--fs-eyebrow`, `--faint`, `formatTime()` | same |

**`--fs-hint` (17px), not `--fs-reading` (19px).** A reading is four paragraphs you
sit with; a chat message is a line you glance at, and 19px Cormorant at 78% of 375px
is about six words a line. No new size — `--fs-hint` is already the hint and the
question-block size.

**A bubble has `white-space: pre-wrap` and nothing else.** No markdown, no link
detection, no `dangerouslySetInnerHTML`. `A-D10`'s CSP argument and the blog editor's
*"there is no `markdown` block kind, no `raw`"* rule land here identically: a chat
bubble is model output and the querent's own text, and the only safe renderer for both
is a text node.

**The quote stub inside a bubble** is a 2px `--gold-border` left rule, the author's
name (`t('chat.reply.you')` for the querent, the reader's name otherwise) and one
`-webkit-line-clamp: 1` line of the quoted body. It is a `<button>`, 44px minimum
tall, and tapping it scrolls to the quoted bubble and flashes it. If the quoted
message is not on screen and not in the loaded page, it renders
`t('chat.reply.gone')` — see `## Discrepancies` D3, which is what the route has to
return for this to be renderable at all.

**The attachment slot** is a `<div className={styles.attachment}>` immediately above
the prose, into which F6's compact reading card renders. F4 owns the slot's box, its
inset and its border; **F6 owns everything inside it, and it is not a fourth mount of
`ReadingView`.**

### 2.5 The typing indicator

Three 5px dots on `--gold`, a 1.2s `breathe`-shaped stagger (the keyframe already
exists in `ReadingView.module.css` and `ReadingPanel.module.css` — same curve, same
opacity range, no new easing), preceded by the reader's avatar in the same 36px gutter
a bubble uses, and followed by `t('chat.typing.one', { name })`.

Under `prefers-reduced-motion` (`F4-7`) the dots do not animate; the row renders as
the naming line alone, at full opacity. **The delay is unchanged.**

`aria-live="polite"` on the indicator's container with `t('chat.typing.aria')` — it is
a notification about something that is about to happen, which is exactly the case
`FrequencyLine`'s "not `aria-live`" comment carves out.

---

## 3. The advance loop

`C-D1`, `C-R1`–`C-R7`. The client is a driver, not a scheduler: it never decides who
speaks, never decides how long to wait, and never decides whether a run continues.
Every one of those is in the reply.

### 3.1 The pure part

**`src/lib/chatSurface.ts` — PURE. No React, no DOM, no `next/*`, no
`@/lib/db/**`, no `server-only`.** `src/lib/swipeDeck.ts`'s precedent verbatim, and
its header's reason: this project has no jsdom, no Testing Library and no Playwright
and must not acquire any, so the only part of a client component `npm test` can reach
is the part that does not touch React or the DOM.

It exports:

- `type LoopState` — the union below.
- `advanceStep(state, event): LoopState` — the reducer. Every transition in §3.2 is
  one call and one assertion.
- `shouldStickToBottom(distanceFromBottom, threshold)` — §4.
- `groupByDay(messages, todayKey)` — the day separators, given today as a **string**.
- `quoteFor(message, byId)` — the stub's author and clamped text, or `null`.

`ChatRoom.tsx` is the thin part: it owns the fetches, the refs and the DOM, and every
decision it makes goes through one of the five functions above.

### 3.2 The state machine

```ts
type LoopState =
  | { kind: 'idle' }
  | { kind: 'posting' }                                     // POST /api/chat/message in flight
  | { kind: 'advancing'; runId: string; retried: boolean }   // POST /api/chat/advance in flight
  | { kind: 'waiting'; runId: string; reader: ReaderId; untilMs: number }  // delayMs held
  | { kind: 'settled' }                                     // run done, or nothing to do
  | { kind: 'offline' }
  | { kind: 'stopped'; reason: 'failed' | 'shed' };          // silence. No error bubble.
```

| Trigger | What the client does | Fetch | On success | On failure |
|---|---|---|---|---|
| **Mount** | Load the page of history, then ask for state. **In parallel**, both aborted on unmount. | `GET /api/chat/messages` and `GET /api/chat/state` | render; if `state.pendingRun` is non-null → `advancing` | `error.load` above the composer, a `Coba lagi` button. **No retry loop.** |
| **After the list has painted** | Move the read cursor. Fire-and-forget. | `POST /api/chat/read` | nothing renders | silence — a stale cursor costs a dot, not a message |
| **Composer submit** | Append an **optimistic** user bubble with a temporary id, clear the draft, clear the reply target, scroll to bottom (it is the querent's own message — always). `→ posting` | `POST /api/chat/message` | replace the optimistic bubble with the stored row; `→ advancing` with the returned `runId` | see the three rows below |
| … **403 refusal** | remove the optimistic bubble, restore the draft, render `RefusalNotice` (`F4-14`). `→ idle` | — | — | — |
| … **429** | remove the optimistic bubble, restore the draft, render the limiter's copy with its `retry-after`. **Never zero and never the window length** — the measured 291s on a tripped ceiling is why the copy says *"sebentar lagi"* and renders the header's own number rather than a hardcoded one. `→ idle` | — | — | — |
| … **timeout** | **retry once**, same body, same client-side idempotency key. `F4-12`. | — | — | after the retry: mark the optimistic bubble `unsent`, keep it, offer `Coba lagi`. **This is the one place a failure is visible in the list**, and it is the querent's own message, never a reader's. |
| **`state === 'advancing'`** | `→` fetch a beat | `POST /api/chat/advance` `{ runId }` | see the reply table below | timeout → retry once, run id **kept**; then `stopped:'failed'`. `!ok` / offline → `stopped:'failed'` immediately (`F4-12`) |
| **reply has `typingFor` + `delayMs`** | render the indicator for that reader, `→ waiting` for `delayMs`, then `→ advancing` | — | — | — |
| **reply has `message`** | append it (through the anchoring rule, §4), `beats_done` is the server's business | — | — | — |
| **reply says `done`** | `→ settled`. Move the read cursor again. | `POST /api/chat/read` | — | silence |
| **reply says shed** (`C-D6`) | `→ stopped:'shed'`. **Nothing renders.** The run is still `running` server-side with beats left, and the *next* visit's `state` call picks it up. See D2. | — | — | — |
| **`offline` event** | `→ offline`, cancel any pending `waiting` timer, render `t('chat.offline')` in the composer area | — | — | — |
| **`online` event** | if there was a run: `→ advancing` with the kept run id. Otherwise `→ idle`. | — | — | — |
| **`visibilitychange` → hidden** | **cancel the `waiting` timer and abort any in-flight `advance`.** `setTimeout` is throttled to ≥1s in a background tab and pauses entirely in an iOS background tab, so a held delay resumes at an arbitrary later moment and drops three bubbles at once when the querent comes back. The run is server-side; nothing is lost. | — | — | — |
| **`visibilitychange` → visible** | `GET /api/chat/state`. If it reports a pending run → `advancing`. **This is `C-D18`'s proactive tick and it is the same call as the mount one.** | `GET /api/chat/state` | as mount | silence — the badge is not worth an error |

**`stopped` is terminal for this mount and shows nothing** (`C-R7`, `F4-13`). A run
whose every beat failed ends `abandoned` server-side and is indistinguishable, from the
room, from the director saying nobody replies (`C-R6`) — which is deliberate and is one
of the strongest naturalness signals in the release.

### 3.3 What the querent sees while a run is in flight

Nothing, then a typing indicator, then a bubble. In that order, always.

- **Their own bubble appears instantly** (`C-R1`). It is optimistic and is on screen
  before `POST /api/chat/message` returns.
- **Between `message` returning and the first `advance` reply there is no indicator**,
  because we do not yet know who is speaking. That gap is the director's call and is
  1–3 seconds; a spinner there would be the app admitting it is thinking, and a
  *wrong* reader's indicator would be a lie the querent can catch.
- **`typingFor` is what starts the indicator.** The server knows who the next beat
  belongs to before the turn is generated, which is exactly why `C-R2` puts it in the
  reply.
- **A zero-beat plan** (`C-R6`) returns `done` on the first `advance` with no
  `message`. The querent's message sits there unanswered, which is what happens in a
  real group chat.

### 3.4 The fetches, their bounds, and the asserted count

| # | Call | Route `maxDuration` | Client bound | Why that number |
|---|---|---|---|---|
| 1 | `GET /api/chat/messages` | default | **10s** | A page of rows off a `(user_id, created_at desc)` index. 10s is generous for a cold Neon compute and is the point at which "the room did not load" is the honest thing to say. |
| 2 | `GET /api/chat/state` | default | **10s** | Same. It also carries `C-D18`'s `after()` mint, which is *after* the response, so it cannot lengthen this. |
| 3 | `POST /api/chat/message` | **20** | **18s** | Under the route ceiling so the client's copy wins over a platform 504. It gates (a bounded classifier call), stores and mints. |
| 4 | `POST /api/chat/advance` | **60** | **55s** | The blog editor's translate bound, for the same reason: 5s of headroom under the route ceiling. |
| 5 | `POST /api/chat/read` | default | **10s** | Fire-and-forget, but still bounded — an unbounded fetch on a page that lives for ten minutes is a socket held open for ten minutes. |

**`ChatRoom.tsx` has exactly FIVE `await fetch(`, FIVE `signal:` and FIVE
`AbortController`s, and `chatSurface.test.ts` asserts all three counts are equal and
equal to 5.** `ChatButton.tsx` has exactly **one** and it is bounded at 10s. That is
six in the whole workstream. `admin.blog.contract.test.ts`'s lines 324–347 are the
model and the assertion is source-level for the same reason it is there: the behaviour
needs a real browser, and a count is a thing a regex can hold.

**If F1 folds `/api/chat/read` into `state`** (§4.1 says it may), the number becomes
four and the assertion changes **in the same commit**. It is written down here so the
change is a decision rather than a green test somebody edited to make it pass.

All five read their body through **one** `readReply(res)` helper, and the test asserts
`readReply` is called exactly as many times as `fetch` — `savePublish` was written with
`.catch(() => ({}))` and the fence added hours earlier caught it.

### 3.5 The idempotency key on `POST /api/chat/message`

The one retry in `F4-12` re-posts a message that may already be stored. Without a key,
a timeout on a slow-but-successful write puts the querent's sentence in the room twice
— and both copies become context for every future turn (`C-R5`).

The client generates a `crypto.randomUUID()` per submit, keeps it across the retry, and
sends it. **This is a field §4 does not define** — see `## Discrepancies` D1. If F1
refuses it, the fallback is that `POST /api/chat/message` **is not retried at all** and
a timeout renders `unsent` with a `Coba lagi` the querent presses — which is worse
(`F4-12`: a timeout means unknown, and asking a person to resolve an unknown is asking
them to guess) but is at least honest. **The plan does not resolve this; the
reconciliation does.**

---

## 4. Scroll anchoring

### 4.1 The rule

> **The list scrolls itself to the bottom only when the querent is already at the
> bottom, or when the new message is their own. Otherwise it does not move, and a
> `Pesan baru ↓` pill appears.**

*Already at the bottom* means `scrollHeight - scrollTop - clientHeight <= 48`. 48px is
about one line of Cormorant plus its padding — small enough that a querent who has
deliberately scrolled up by one bubble is not treated as being at the bottom, large
enough that the ~1px sub-pixel residue every browser leaves after a snap does not read
as "scrolled away". It is a named constant in `src/lib/chatSurface.ts`
(`ANCHOR_THRESHOLD_PX`) and `shouldStickToBottom` is a two-line pure function with a
unit test per boundary.

**The querent's own message always scrolls**, threshold or not. They just pressed
Kirim; not showing them the result of their own press is the one case where "do not
interrupt" is wrong.

### 4.2 The mechanism

Three pieces, and the order matters.

1. **`atBottomRef` is maintained by the list's `onScroll` handler**, a ref and not
   state — it must not re-render anything, and it must survive the re-render every
   arriving bubble causes. This is `SwipeDeck`'s `interacted` ref, for the same reason
   its comment gives.
2. **The decision is read *before* the DOM grows.** `useLayoutEffect` on
   `messages.length` runs after React has committed but before paint, so `atBottomRef`
   read there already reflects the *new* height. The read therefore happens in the
   handler that sets `messages`, into a local, and `useLayoutEffect` acts on the local.
3. **The scroll call reads `data-still` itself** (`F4-10`):

   ```ts
   const still = typeof document !== 'undefined'
     && document.documentElement.hasAttribute('data-still');
   el.scrollTo({ top: el.scrollHeight, behavior: reduce || still ? 'auto' : 'smooth' });
   ```

   `reduce` is `usePrefersReducedMotion()`. A smooth scroll is motion and a
   reduced-motion querent gets a jump.

### 4.3 Loading older messages, which is the other half and is the harder one

`GET /api/chat/messages?before=` **prepends**, and prepending moves everything the
querent is reading down by the height of what arrived.

**The compensation is manual and engine-independent:**

```
before the update:  const prevHeight = el.scrollHeight;
after the commit (useLayoutEffect):
                    el.scrollTop += el.scrollHeight - prevHeight;
```

**Deliberately not `overflow-anchor`.** CSS scroll anchoring would do this for free in
Chrome and Firefox, and this repo cannot check what Safari does with it — which is the
platform the app is built for and the one loop 5 cannot answer. The manual version
makes no claim about any engine, costs four lines, and is the same discipline
`ReadingView`'s `.taps` comment uses where a browser test is unavailable. `.list` sets
`overflow-anchor: none` so a browser that *does* implement it cannot also compensate
and double-count.

### 4.4 Two things not to do

- **No `scroll-behavior: smooth` on `.list` in CSS.** It would govern only the scrolls
  we are not making (`F4-10`) and would read as if it governed the ones we are.
- **No virtual list.** A room is a few hundred messages and a page is 40. A windowing
  library is a dependency (§0), and it is the dependency that breaks anchoring, focus
  restoration and `Ctrl-F` all at once. If a room ever gets large enough to matter, the
  answer is a smaller page, not a library.

---

## 5. The reply-to interaction

### 5.1 The choice: **a tap on the bubble reveals one `Balas` chip**

Tap a bubble → it takes a selected state (border lifts to `--gold-border`) and a single
44px `Balas` chip appears immediately below it, in the bubble's own column. Tap the
chip → the reply stub appears above the composer and the textarea focuses. Tap the same
bubble again, tap anywhere else, or press `×` on the stub → dismissed.

One control. No gesture. No sheet.

### 5.2 Why not the two obvious alternatives

**Long-press → a context menu.** This is what iOS Messages does and it is the one I
would reach for first. It is wrong here for three reasons that compound:

- **A long press on text raises iOS's own selection callout and magnifier.** The only
  way to stop it is `user-select: none` on the bubble — and `globals.css` deliberately
  scopes that to the fan rather than globally, because *"setting it here would make the
  reading panel unscrollable"* is a note in that file about a related mistake. Killing
  selection on a chat bubble also kills copy, which is a thing people do to chat
  messages constantly.
- **`contextmenu` does not fire reliably on iOS Safari**, so the implementation is a
  hand-rolled pointer-down timer — pointer geometry, in a scroll container, with a
  cancel-on-move threshold. This repo has already paid for a pointer bug it could not
  see: the fan's `onToggle` fired from inside a `setState` updater was **completely
  dead in development and would have worked in production**, and the fix was *read the
  drag from a ref instead*. That bug was caught by an iframe harness that could
  dispatch synthetic `PointerEvent`s. A long-press timer cannot be caught that way,
  because the thing that breaks it is the platform's own gesture recogniser.
- **A menu is a dialog**, and `F4-20` then applies: Safari does not focus a tapped
  button, so the menu needs a `returnFocusTo` prop and a focus trap and an Escape
  handler, all for one item.

**Swipe-to-reply.** This is what WhatsApp does and it is the most familiar of the
three. It is also the one gesture that **competes directly with the container it lives
in**: a horizontal drag inside a vertical scroller needs a direction lock, a threshold,
a rubber-band, and `touch-action` juggling per bubble — and every one of those numbers
is a feel judgement that **cannot be made in WSL at all.** Loop 5's Chrome has no
touch, loop 4 measures width, and a threshold that is wrong on glass reads as "the app
is broken", not as "the threshold is wrong".

### 5.3 Why the chip is the right trade

- It is a `<button>`. It has a 44px target, a focus ring, an accessible name, and
  VoiceOver reads it. The other two are invisible to a screen reader without extra
  work.
- It is **measurable by every loop this repo has**: loop 4 measures its width inside a
  bubble at 320px with a long reader name, loop 1 tests `quoteFor`, and loop 5 can
  `.click()` it and read the `reply_to_message_id` in the outgoing POST body — which
  is literally the question loop 5 exists to answer.
- It costs one extra tap against a swipe. In a room where the readers speak first, the
  reply-to is not the primary action; the composer is.

### 5.4 And it is unverifiable in WSL

**Say it plainly: whether this reads as natural under a thumb is a loop-6 question and
nothing else can answer it.** Loop 5 gives a 500px layout with synthetic clicks; loop 4
gives numbers. Neither can tell you whether a tap-to-select on a bubble feels like
selecting text.

**If it reads wrong on hardware, the repair is to ADD swipe as an accelerator, never to
replace the chip with it.** The chip is the accessible path and the testable path; a
gesture on top of it is an enhancement that can be measured against a working baseline.
Replacing it means the only reply-to affordance in the app is one that no loop in this
repo can see.

---

## 6. `ChatButton`

### 6.1 The mount rule, copied

`src/components/ChatButton.tsx`, `'use client'`, and its header restates `F4-2` and
`F4-3` in full — because `AccountButton`'s header is the reason those rules survived
three workstreams, and a second button in the same corner with no header is the one
that gets moved into the layout by somebody being helpful.

Four mounts, each a **direct child of the page's shell**, each beside the existing
`AccountButton` line:

| File | `surface` prop |
|---|---|
| `src/app/page.tsx` | `'reader_picker'` |
| `src/app/[reader]/page.tsx` | `'service_picker'` |
| `src/app/history/page.tsx` | `'history'` |
| `src/app/account/page.tsx` | `'account'` |

`ChatSurface` is a **closed union of exactly those four**, declared in
`ChatButton.tsx`, because `chat.opened.from` is closed. It deliberately does **not**
include `'chat'` or `'draw'`, so mounting it in either place is a type error before it
is a test failure.

**Not `/chat` itself, not the draw screen, not the root layout, not any page without a
session.** `src/components/chatSurface.test.ts` is the deny-shaped guard, modelled on
`accountSurface.test.ts` — an allowlist would have to be edited by F6 and F7 as they
land, and *an allowlist somebody has to edit to make their branch green is an allowlist
somebody widens without reading it.*

### 6.2 The geometry, and seam S9

`AccountButton` is `44×44`, `top: calc(10px + env(safe-area-inset-top))`, `right:
calc(10px + env(safe-area-inset-right))`, `z-index: 800`. `ChatButton` sits to its
left, same size, same top, same z-layer, with an 8px gap.

**I must not edit `AccountButton.tsx` or its stylesheet** (S9). So the shared numbers
become custom properties that only `ChatButton` reads, and the coupling is enforced by
a test rather than by a shared import.

**`tokens.ts` changes first** (`## Styling`):

```ts
/**
 * The corner chrome rail, top right (v0.7.0 / F4, seam S9).
 *
 * `AccountButton.module.css` still carries these as literals and F4 may not edit it,
 * so this is a ONE-WAY coupling: ChatButton computes its offset from here, and
 * `chatSurface.test.ts` asserts AccountButton's literals still match these values.
 * If the account circle ever moves, that test goes red and names this table.
 *
 * A rail rather than three ad-hoc offsets, because the next thing anybody adds to
 * this corner is a third circle.
 */
export const corner = {
  /** Distance from the viewport edge, before the safe-area inset is added. */
  inset: 10,
  /** The tap-target floor exactly. Both circles. */
  size: 44,
  /** Between two circles. Smaller than `inset` so the pair reads as one group. */
  gap: 8,
} as const;
```

**`tokens.css` mirrors it:**

```css
  /* --- Corner chrome rail (v0.7.0 / F4, seam S9) ------------------------ */
  /* MIRROR ONLY. `corner` in tokens.ts carries the reasoning. */
  --corner-inset: 10px;
  --corner-size: 44px;
  --corner-gap: 8px;
  /* Slot 0 is AccountButton's own literal. Slot 1 is ChatButton. */
  --corner-slot-1: calc(var(--corner-inset) + var(--corner-size) + var(--corner-gap));
```

`ChatButton.module.css`:

```css
.button {
  position: fixed;
  top: calc(var(--corner-inset) + env(safe-area-inset-top));
  right: calc(var(--corner-slot-1) + env(safe-area-inset-right));
  z-index: 800;
  width: var(--corner-size);
  height: var(--corner-size);
  /* …the rest is AccountButton's: 50% radius, --gold-wash, --gold-hairline,
     backdrop-filter: blur(6px), --gold-pale mark. No new hex. */
}
```

`10 + 44 + 8 = 62px`. The account circle occupies `10..54` from the right edge; the
chat circle occupies `62..106`. **The insets are added back here because
`globals.css`'s padding on `<body>` does nothing for a fixed element** —
`AccountButton.module.css` says so at length and the failure is invisible from WSL.

### 6.3 The mark, and the dot

**The mark** is a stroked speech outline, `viewBox="0 0 24 24"`, `stroke="currentColor"`,
`strokeWidth="1.2"`, round caps and joins, `aria-hidden="true"`, `focusable="false"` —
constructed exactly like `LotusMark`, so the button's own hover/expanded colours drive
it and **there is not a hex in the file.** Not a lotus: the lotus is the app's symbol
for *the querent* and `AccountButton` owns it (`F4-19`). Two lotuses in one corner is
the app disagreeing with itself about what a circle means.

**The dot** is 8px, `--gold-pale`, with a 2px `--canvas` ring so it separates from the
circle's own border, positioned at the top-right of the button.

> **It is not red, and that is a decision with a reason worth writing down.**
> The obvious colour is `--danger` (`#a3423a`). `tokens.ts` says in its own words that
> `--danger` is **the ONE destructive colour in the app**, that `/account`'s deletion
> sheet is its only consumer, and that it is **used as a border and a label, never as a
> fill** — because *a filled red button is the one a thumb goes to.* A filled red dot is
> exactly that fill, on the busiest screen in the app, meaning "Margaret said
> something". Spending the app's only stop signal on a friendly notification devalues it
> in the one place it has to work. `--gold-pale` is already the brightest ink in the
> palette and is what the mark itself uses; against `--gold-wash` at 8% it is the
> brightest thing in the corner. **No new hex.**

**No number in the dot.** At 8px there is no legible type size, and a number would need
a pill, which changes the button's width and reflows the corner between the no-dot and
dot states. The count goes where it costs nothing: `aria-label`, through
`t.plural('chat.button.aria.unread', count, { count })`, falling back to
`t('chat.button.aria')` at zero.

### 6.4 What it fetches

Exactly one bounded `GET /api/chat/state` in a mount effect, aborted on unmount,
10s bound, `SESSION_HEADER` set from `getSessionId()` like every other client fetch in
this app. On anything other than a 200 with a positive `unread`, **nothing renders**
(`F4-4`, `M14`). No retry, no polling, no interval — `C-N2a`: *there is no polling
loop.* The tick is the mount and the tab becoming visible, and that is all.

It listens for `visibilitychange → visible` and re-fetches, because that call **is
`C-D18`'s proactive tick**: it is the one request this app can rely on a returning
querent making, and `C-D7`'s minting happens in its `after()`. A querent who leaves the
tab open all afternoon and comes back gets the dot without a poll.

---

## 7. Avatars

### 7.1 `tools/make_avatars.py`

Idempotent, committed output, never hand-edited. `tools/make_icons.py` and
`tools/make_wallpapers.py` are the convention and this copies all of it: a docstring
that states the invariants, constants named after the tokens they mirror, an assertion
that proves the docstring's promise rather than trusting it, and one summary line per
file.

```
python3 tools/make_avatars.py          # npm run avatars

  public/dukuns/thessaly.jpg  1024x512  ->  public/readers/thessaly.webp  112x112
  public/dukuns/margaret.jpg  1376x768  ->  public/readers/margaret.webp  112x112
  public/dukuns/adrian.jpg    1440x720  ->  public/readers/adrian.webp    112x112
```

**Source: `public/dukuns/*.jpg`.** They are 2:1 landscape *scenes* and are never edited
in place. (`C-D16` says `assets/` → `public/readers/` in one sentence and names
`public/dukuns/*.jpg` as the source in the next; `assets/` holds only `major_arcanas`
and `ui`, so `public/dukuns/` is the only place this art exists. See D6.)

### 7.2 The crop table

**Hand-written, three entries, reviewed once by eye, checked in.** Not face detection:
three faces do not justify a dependency, and a detector that drifts by five pixels on a
regeneration is a change nobody reviewed. `(left, top, right, bottom)` in **source
pixels**, square by construction and asserted square by the script.

| Reader | Source | Box | Side | Face centre it lands on |
|---|---|---|---|---|
| Thessaly | 1024×512 | `(405, 15, 635, 245)` | 230 | ~(520, 130) — hair top at ~30, crop ends at the collar |
| Margaret | 1376×768 | `(580, 30, 880, 330)` | 300 | ~(730, 180) — clears the candelabra on both sides |
| Adrian | 1440×720 | `(565, 40, 885, 360)` | 320 | ~(725, 200) — hair top at ~95, crop ends at the denim collar |

**These three rows are the deliverable of a review, not a computation**, and the script
prints a `tools/_avatarsheet.jpg` contact strip of the three crops side by side at 4×
so the review is one file to open. The strip is gitignored; the three `.webp` are
committed.

### 7.3 Output, and the one place I diverge from `C-D16`

**112×112 WebP, quality 82, no alpha.** Roughly 3–5KB each; ~12KB for all three.

`C-D16` says *"square WebP at 2× the largest rendered size"*. The largest rendered size
is **36px** (the header row; a bubble gutter avatar is 28px), so 2× is 72px. **I am
shipping 112 and this is a deliberate divergence** — see D7. The reason is the same one
that makes 375px the binding constraint everywhere else in this project: the iPhone is
the device, and its device pixel ratio is **3**, not 2. `36 × 3 = 108`, rounded up to
112 for a number divisible by 8 and by 16. A 72px source on a 3× screen is visibly soft
on a face, which is the one subject where softness reads as a broken asset rather than
as a low-resolution one. The cost is ~7KB across the whole release.

**Nothing is upscaled and nothing is stretched.** `make_wallpapers.py`'s `S-D9` rule
applies: the script asserts every crop's side is `>= OUT` before resizing
(`230 / 300 / 320` all clear 112), so the resize is always a downsample, and it uses
`Image.LANCZOS` for it. There is no `fit_to_ratio` call and there must not be — that
helper in `normalize_cards.py` is the one that *looks* right to reuse and would LANCZOS
a source up to reach a ratio.

The script asserts, per file: the box is square, the box is inside the source, the side
is `>= OUT`, the output is `112×112`, and the output mode is `RGB`.

### 7.4 The cache header and the matcher

**Both, and they are two different rules that look like one** (`F4-18`).

`next.config.ts` gains one entry, above the `/(.*)` block:

```
source: '/readers/:path*'
cache-control: public, max-age=86400, stale-while-revalidate=604800
```

Not `/cards/*`'s `max-age=31536000, immutable`. The crop table is hand-written and will
be tuned after somebody looks at the strip on a phone; three non-content-hashed
filenames plus a year of `immutable` means every existing install keeps the bad crop
until 2027. **This exact mistake was made once already with `/wallpapers/`**, written
from `/cards/*`'s reasoning rather than from a declaration, and corrected one commit
later. `/wallpapers/`'s value is what this copies, for the same reason: a regenerated
asset must propagate on its own.

`src/middleware.ts`'s matcher gains `readers/`:

```
'/((?!_next/|cards/|dukuns/|readers/|wallpapers/|favicon|icon|apple-icon|manifest|sitemap|robots).*)'
```

**This is a matcher change, not an `isPublic()` change** (`R7`). Adding `/readers` to
the allowlist also returns 200 and leaves middleware running — so the locale-cookie
write fires and puts a `Set-Cookie` on a static image, making it edge-uncacheable. And
`/readers/*` is one of the few asset paths a signed-*in* querent hits on every chat
render, so the cookie churn would be per-message.

### 7.5 The querent's avatar

The lotus (`C-D16`, `F4-19`) — the same glyph `AccountButton` draws, at 28px, stroked
in `currentColor` inside a `--gold-wash` circle. It needs no data, no session and no
network, and it is the app's own symbol for the querent's inner shape
(`onboarding.lotusName`, *Teratai Batin*).

**`LotusMark` is a non-exported function inside `AccountButton.tsx`, which I may not
edit** (S9). Two ways out, and this plan does not choose — the reconciliation does. See
D8.

- **Preferred:** extract `LotusMark` to `src/components/LotusMark.tsx` and have
  `AccountButton` import it. Three lines of movement, no behaviour change, one glyph in
  one place.
- **Fallback if S9 is read strictly:** `ChatAvatar.tsx` declares its own `<svg>` with
  the same four `d` strings, and `chatSurface.test.ts` asserts the four path strings in
  the two files are **byte-identical**. Duplication kept survivable by a test rather
  than by a comment, which is this repo's usual answer when the alternative is two
  copies kept in step by hand.

---

## 8. i18n

**Written in Indonesian first, into `src/lib/i18n/locales/id.ts`. A red typecheck in
`en.ts` is the feature** — `id.ts` owns the key set and TS2739 names every missing
English string. **No cross-locale fallback**: an unknown key returns THE KEY, on
purpose (`I3`), because `chat.error.send` on screen is a bug report and an Indonesian
sentence in the English app is a bug that ships.

**Indonesian, not Malay.** The eleven-word grep binds this block; `mif`, `wkwk`, `ngobrol`,
`nyaut` and `kepikiran` are the register this room wants and none of them is Malay.

```ts
  // ── The group chat (v0.7.0 / F4) ────────────────────────────────────────
  //
  // THE CHROME FOLLOWS THE VIEWER; THE BUBBLES DO NOT (C-D9). Every string below
  // is chrome. A chat message is never translated and carries its own `lang`.
  //
  // The register is deliberately lower than the rest of the app. `Jejak` and
  // `Dirimu` are titles for pages you visit; this is a room you are in, and
  // `Grup` is what an Indonesian actually calls it.

  'chat.title': 'Grup',
  'chat.hint': 'Thessaly, Margaret, dan Adrian. Bertiga, bersamamu.',
  'chat.back': '← Beranda',

  // The button, on four other screens. The plural pair is the aria label only --
  // the dot itself carries no number (§6.3).
  'chat.button.aria': 'Buka grup',
  'chat.button.aria.unread.one': 'Buka grup, {count} pesan baru',
  'chat.button.aria.unread.other': 'Buka grup, {count} pesan baru',

  'chat.composer.label': 'Tulis pesan',
  'chat.composer.placeholder': 'Tulis sesuatu…',
  'chat.composer.send': 'Kirim',
  'chat.composer.sending': 'Mengirim…',
  // CHAT_ENABLED=0. The room still opens and every past message still renders;
  // only the composer is disabled (C-D15). A kill switch that blanks a screen is
  // a worse outage than the quota it protects.
  'chat.composer.closed': 'Grup lagi ditutup sebentar. Obrolan lama masih bisa dibaca.',

  'chat.reply.action': 'Balas',
  'chat.reply.cancel': 'Batal balas',
  'chat.reply.you': 'kamu',
  // The quoted message is older than the loaded page and the route did not
  // inline it. See D3 -- if F1 inlines the stub, this string never renders.
  'chat.reply.gone': 'Pesan yang dibalas nggak ketemu.',

  'chat.typing.one': '{name} lagi ngetik…',
  'chat.typing.aria': '{name} lagi menulis pesan',

  'chat.newMessages': 'Pesan baru ↓',

  'chat.older': 'Muat yang lebih lama',
  'chat.older.loading': 'Memuat…',

  // TWO FAILURE STRINGS AND NO MORE (F4-13). A degraded run shows NOTHING; only
  // the two things the querent caused and can act on get copy, and both render
  // outside the message list so neither can read as something a reader said.
  'chat.error.load': 'Obrolan nggak bisa dibuka sekarang. Coba lagi sebentar.',
  'chat.error.send': 'Pesanmu belum terkirim.',
  'chat.error.retry': 'Kirim ulang',
  'chat.offline': 'Kamu lagi offline. Pesanmu belum terkirim.',

  // M14 does NOT apply here and that is the difference between a room and a
  // decoration. FrequencyLine renders nothing when it has nothing because it is
  // ambient; an EMPTY ROOM is the whole screen, and a blank one reads as broken.
  'chat.empty.title': 'Belum ada yang ngobrol di sini.',
  'chat.empty.body': 'Sapa dulu. Mereka bertiga bakal nyaut.',

  'chat.day.today': 'Hari ini',
  'chat.day.yesterday': 'Kemarin',
```

**No `chat.disclaimer` key.** The header renders the existing
`common.disclaimer.short` (*"Untuk hiburan semata."*). The room is where a person is
most likely to forget, and a second string saying the same sentence is how two surfaces
end up making slightly different promises — `SignInForm`'s consent-line rule.

**No `chat.attachment.*` keys.** F6 owns the attachment renderer and declares its own
copy. F4 owns the slot and its box.

**No refusal or rate-limit copy.** `RefusalNotice` (W7) and the limiter's existing
strings are reused verbatim (`F4-14`).

**Card names, reader names and reader titles stay English in both locales** —
`## Localization`'s first *"thing a future session will otherwise undo"*. `Thessaly`,
`Margaret` and `Adrian` are interpolated as data, never as copy.

---

## 9. React traps that bite this screen specifically

Five, each with the file it bites and the shape of the failure. All five are already in
`CLAUDE.md`; what is new is that this screen hits **all of them at once**, which no
previous surface has.

### 9.1 Never shuffle, and never call `todayKey()`, in a render or a `useState` initialiser

**`src/app/chat/ChatRoom.tsx`.** The day separators need the querent's calendar day.
`todayKey()` reads `new Date()`, which is a different value on the server and on the
client, and **React cannot patch attribute mismatches during hydration** — the
`shuffleDeck()` case is the canonical one, where the DOM kept the server's cards and
state held the client's and *the querent saw one spread and was read a different one,
with nothing on screen looking wrong.*

`today` starts `null`, an effect sets it, `groupByDay` takes it as a parameter and
returns ungrouped messages until it is non-null. Nothing flashes, because separators
appearing one frame late is invisible and separators appearing *wrong* is not.

**Do not "simplify" this into `useState(() => todayKey())`.** `HistoryBrowser` carries
the same sentence for the same reason.

### 9.2 No side effects inside a `setState` updater

**`src/app/chat/ChatRoom.tsx`, `src/components/ChatButton.tsx`,
`src/components/ChatComposer.tsx`.** StrictMode double-invokes updaters. The fan's
`onToggle` was called from inside one and fired twice, cancelling itself out — **the
fan was completely dead in development and would have worked in production.**

Here that means: `track()` in the handler body, never inside the updater
(`AccountButton`'s comment in capitals, `F4-16`); and the arriving-bubble path uses
`setMessages(next)` with a locally built array rather than
`setMessages(prev => [...prev, m])` — `DaySummary`'s accumulate-then-set rule, whose
comment says the appending form *"would duplicate every chunk in development"*.

### 9.3 State seeded from a prop that later changes — v0.6.0's silent content loss

**`src/app/chat/ChatRoom.tsx`.** The admin blog editor's locale tabs are `<Link>`s, so
pressing one is a soft navigation within the same route segment: **React reconciles the
editor as the same element and every field is `useState(initial ?? '')`, and an
initialiser runs on mount and never again.** `save()` then posted the new locale with
the old locale's body, and **stored the Indonesian document as the English one,
silently, on a published article.** The fix was `key={locale}` and the assertion is
source-level, because the behaviour needs a soft navigation — loop 5, not Vitest.

`docs/workstream-notes.md` calls it *the third instance of one class* alongside 9.1.
`ChatRoom` is exposed to it twice over:

- **The draft and the reply target are `useState`.** If `/chat` ever grows a query
  parameter that soft-navigates (an F6 deep-link like `/chat?attach=<id>` is the
  obvious one), the room is reconciled as the same element and the draft survives
  across it. `ChatRoom` therefore **takes nothing that can change as a seed**: the
  message list is fetched, not seeded, and the reply target is set only by a tap.
- **This is also why `F4-5` is stated as an invariant rather than left implicit.**
  The instinct after reading `FrequencyLine`'s and `DaySummary`'s locale-dependency
  comments is to add `locale` here. `C-D9` is the reason not to, and the failure of
  adding it is a re-mounted advance loop against a held lease.

### 9.4 The dependency list is the primary mechanism — V5's five-row table

**`src/app/chat/ChatRoom.tsx`.** `SwipeDeck`'s header carries the measurement:

```
deps                    slidTo    cleanup   slides
[arrivedPanel, goTo]    absent    absent      1     <- plan expected 3
+ panels                absent    absent      3
+ panels                present   present     0
```

*"THE DEPENDENCY LIST IS THE PRIMARY MECHANISM, not `slidTo`"*, and
`react-hooks/exhaustive-deps` will never argue either way because the body reads
`panelsRef.current`.

The advance loop's effect depends on **`run.id` and nothing else**. `messages`,
`onSend`, `t` and the fetch helpers are all read through refs
(`messagesRef`/`stateRef`), set on every render, exactly as `panelsRef.current = panels`
is. Adding `messages` to that array is what somebody does while making the room do
something new, and at that moment the loop fires once per bubble.

**And the same trap, one layer down:** `CardDetail`'s effect depends on nothing at all
because the draw screen re-renders per streamed chunk and passes `onClose` as an inline
arrow — *"the querent would watch focus jump on every token."* The chat re-renders per
bubble; anything that focuses, scrolls or aborts must be behind the same ref discipline.

### 9.5 `requestAnimationFrame` without a cleanup, and why

**`src/app/chat/ChatRoom.tsx`.** The scroll-to-bottom after an arriving bubble happens
in a `useLayoutEffect` and does **not** need a frame — layout is committed. The
scroll-to-bottom **on first paint** does: the list has no height until the messages
have laid out.

`SwipeDeck`'s note applies verbatim and is counter-intuitive enough to restate: *no
`cancelAnimationFrame` in a cleanup, even though every lint instinct says to add one.*
A stray frame after unmount is harmless — the scroll helper returns early on a null ref
— and a cleanup is actively dangerous the moment the effect re-runs, because it cancels
the pending frame, the effect re-enters, finds the guard already set, and **the list
never scrolls at all, silently, with nothing in the log.**

---

## 10. Verification

### 10.1 Loop 1 — Vitest, for everything pure

`src/lib/chatSurface.test.ts`:

- `advanceStep` — every row of §3.2's table as one `expect`. The three that matter
  most: a timeout retries **once** and keeps the run id; a `!ok` does **not** retry;
  a shed reply lands in `stopped` and not in `settled`, so the next `state` call picks
  the run up rather than treating it as finished.
- `shouldStickToBottom` — the boundary at exactly 48, at 47, at 49, at a negative
  distance (iOS rubber-banding reports one; `panelIndexAt`'s clamp is the precedent).
- `groupByDay` — a message on the boundary of the querent's day, `today = null`
  returning ungrouped, and a set spanning midnight in Jakarta.
- `quoteFor` — a quote whose target is loaded, one whose target is not, and one whose
  target is the querent's own message.

`src/components/chatSurface.test.ts` (the `accountSurface.test.ts` sibling, deny-shaped):

- `ChatButton` is mounted at least twice, so the denylist is not vacuously passing.
- It is mounted on **none** of: `app/chat/`, `app/[reader]/[service]/`, `app/login/`,
  `app/terms/`, `app/privacy/`, `app/onboarding/`, `app/s/`, `app/gallery/`,
  `app/arcana/`, `app/blog/`, `app/Landing.tsx`, `app/layout.tsx`.
- `ChatRoom.tsx` contains exactly 5 `await fetch(`, 5 `signal:`, 5 `AbortController`
  and 5 `readReply(`; `ChatButton.tsx` exactly 1 of each (`F4-11`).
- Every literal `t('chat.…')` key in the `Chat*` files and under `app/chat/` exists in
  `id.ts` — `I3` means a typo renders the key, which is a good rule and a bad failure
  mode.
- **The S9 coupling:** `AccountButton.module.css` still contains `width: 44px` and
  `right: calc(10px +`, matching `corner.size` and `corner.inset` in `tokens.ts`. If
  the account circle moves, this goes red and names the rail.
- **The lotus:** if D8 lands on the fallback, the four `d` strings in `ChatAvatar.tsx`
  are byte-identical to those in `AccountButton.tsx`.
- `src/lib/clientBoundary.test.ts` picks up the new client components for free — no
  `@/lib/db/**` import, not even `import type`, and its regex does not know the `type`
  keyword.

Plus `npm test -- i18n` for catalog parity, which the shared `id.ts`/`en.ts` type lock
already gives.

### 10.2 Loop 4 — `public/cards/_chatfit.html`, **the only loop that answers width**

Committed under `public/cards/` because that path is excluded by the middleware matcher
and is the only reason the harness loads at all. `_slotfit.html` is the pattern and its
discipline is copied exactly: it **drives the real app in a same-origin iframe rather
than inlining a copy of the CSS**, because inlining measures a snapshot of the
stylesheet and drifts from it silently — the one failure mode that would make the
harness worse than nothing.

It mints a session with `POST /api/auth/dev-session` as `dev:miftah` (a **completed**
profile — an incomplete one 307s to `/onboarding` and presents as "found 0 bubbles",
which reads like a broken selector), loads `/chat?lang=<locale>&still=1` at each width,
waits for `load` plus **two** animation frames (not for hydration — the bubbles are
server-rendered into the initial HTML by the time they exist, and `setInterval` fights
`--virtual-time-budget`), and measures.

**4 widths × 2 locales = 8 measurements.** 320 / 360 / 375 / 390.

| Measured | FAIL | NOTE |
|---|---|---|
| Bubble row width vs. the list's content box | overflow > 0.5px | — |
| The composer row (textarea + Kirim) | overflow | — |
| The reply stub above the composer | overflow | — |
| The quote stub inside a bubble | overflow | clamps to more than 1 line |
| The header row (3 avatars + title + disclaimer) | overflow | title wraps |
| Every tap target (`Balas`, `Kirim`, the stub, `Pesan baru ↓`, `ChatButton`) | `height < 44` | — |
| The typing row with the longest reader name | overflow | wraps |

**FAIL vs NOTE is the smoke script's discipline and `_slotfit.html`'s**: overflow is a
failure because a `nowrap` row wider than its container is clipped or scrolls and
neither is a thing anybody chose; a wrap is a note, because the Indonesian slot labels
already wrap to three lines at 390 and calling that red *"is how a harness becomes
something people stop running."*

**The pathological content it must measure:**

- A 24-character nickname (`address.ts` derives clips from it; the header and every
  `chat.reply.you` line carry it).
- A 400-character single-paragraph bubble with no spaces in the longest token
  (`overflow-wrap: anywhere` is what stops a pasted URL blowing the row).
- A quote stub of a 400-character message.
- All three reader names, since `Margaret` is the longest and Cinzel at
  `--ls-button: 2.6px` is wider than it looks.
- A bubble containing an attachment slot at its declared minimum width.

**It needs seeded rows.** See D5 — F1's `npm run db:seed` is the natural owner, and the
alternative (posting real messages) costs model calls per run, which is not a thing a
width harness may do.

**And `still=1` is not optional** (`F4-10`): without it, every measurement is taken
mid-glide because a smooth scroll under `--virtual-time-budget` advances one frame and
stops.

### 10.3 Loop 5 — real Chrome over CDP: *does the UI agree with what it sends*

`tools/e2e/run.sh` against `E2E_BASE=http://localhost:3001` and then a preview.
**It does not give you a phone width** — `innerWidth` and `outerWidth` are 500 whatever
`--width` says — so it answers exactly one class of question here, and it is the class
that produced the two worst bugs in this project's history:

1. **The reply-to body.** Tap a bubble, tap `Balas`, type, send — and read
   `reply_to_message_id` out of the POST body, then diff it against the id of the
   bubble whose rendered text is in the stub. This is the *"the page looked correct and
   the outgoing request was wrong"* check, and it is the whole reason the chip beat the
   two gestures (§5.3).
2. **The advance loop's request count.** Count `POST /api/chat/advance` calls against
   the number of bubbles that appeared. `n` bubbles must be `n + 1` calls (one plan, one
   per beat, one that returns `done`). **More than that is `F4-8`'s dependency-array
   bug**, and it is invisible in the UI.
3. **The retry rule.** Force a timeout (a `fetch` patch in the harness page) and assert
   exactly **one** retry, with the same run id in the body.
4. **`key`/soft-navigation.** If F6 lands `/chat?attach=<id>`, drive the soft navigation
   and assert the draft did not survive it — §9.3's assertion, which needs a soft
   navigation and therefore cannot be a unit test.
5. **The Safari focus trap can be reproduced here** — a programmatic `.click()` does not
   focus a button either — which `CLAUDE.md` previously denied. Relevant if F6 opens a
   sheet.

### 10.4 Loop 6 — a real iPhone against a Vercel preview. **Nothing else can answer these.**

This is the list, and it is longer for this workstream than for any before it.

1. **The reply-to interaction under a thumb.** Does tap-to-select read as selecting
   text? Does the `Balas` chip appear where the thumb already is? §5.4.
2. **The composer with the keyboard up.** `CLAUDE.md` already lists the answer sheet's
   textarea as an open item — *"a textarea with the keyboard up inside a `90dvh` sheet
   is the geometry WSL cannot answer"* — and this is the same geometry with more at
   stake, because it is the primary control on the screen.
3. **`100dvh` against Safari's collapsing toolbar**, while the list is mid-scroll.
4. **Safe-area insets in standalone mode**: the composer above the home indicator, the
   two corner circles below the notch and the clock. §2.3.
5. **The badge in standalone mode**, which is a second cookie jar — the same class as
   *"the largest unverified risk in the project"*, the standalone Google sign-in.
6. **The typing indicator's rhythm on glass.** Whether `delayMs` reads as a person
   pausing or as a metronome is a judgement, and `C-R4` says a metronome is the thing
   that reads as a bot.
7. **Whether the avatar crops read as portraits at 28px on a 3× screen**, which is the
   whole reason §7.3 diverges from `C-D16`'s 2×.
8. **Overscroll**: whether `overscroll-behavior: contain` on the list actually stops the
   page rubber-banding under the room on iOS.
9. **The acceptance test.** Roadmap §10.2.3: take a reading, close the app, come back,
   find the dot; reply to a reader's bubble from yesterday; attach a reading from
   `/history`; **then keep chatting for ten minutes because you want to.**

### 10.5 The gates before this workstream is done

`npm test`, `npm run typecheck`, **`npm run build`** (never trust a green typecheck —
TypeScript stays on 5.x and the build is what catches it), `npm run test:integration`
only if something touched `src/lib/db/**` (nothing here does), `npm run avatars` and
then look at `tools/_avatarsheet.jpg`, and `_chatfit.html` green at all eight
measurements. Run `npm test` and `npm run test:integration` **separately** —
`npm run test:all` fails 12–22 of V9's limiter tests as a harness race and its red does
not mean anything.

---

## 11. Events

**Declared here for F1 to fold** (`C-D14`, seam S6). F1 owns `events.ts` and folding a
declaration in means **transcribing it**, not narrowing it. The taxonomy is at 67 names
and the ceiling moved once, by revisiting the register rather than bumping the number.
**So this section ships four names and records two that were drafted and folded**,
which is what the roadmap asks for.

**No free text, ever.** A message's *length* is a prop; its body is not. That is what
makes `/privacy`'s "we keep no text you wrote" true, and `sanitizeProps()` is the
enforcement.

| Name | Props | Why it earns a name |
|---|---|---|
| `chat.opened` | `{ from: 'reader_picker' \| 'service_picker' \| 'account' \| 'history' \| 'direct'; unread: number; had_pending_run: boolean }` | The denominator for everything. `unread` is where the badge's number goes, which is why there is no separate badge event. `had_pending_run` is `C-D7`'s delivery path firing at all. |
| `chat.message_sent` | `{ length: number; has_reply_to: boolean; has_attachment: boolean; locale: 'id' \| 'en'; reply_age_minutes: number \| null }` | The querent's side of `C-N2f`'s reply rate. `reply_age_minutes` is what makes *"they answered a bubble from an hour ago"* measurable — `C-D11`'s whole point — and it is a number, not a body. |
| `chat.turn_shown` | `{ reader_id: string; beat_index: number; trigger: string; delay_ms: number; ttfb_ms: number }` | Fired **when a bubble lands on screen**, not when it is generated. F7 measures generation from `llm_calls`; only the client can say whether the querent was there to see it, and `delay_ms` is the only place `C-R4`'s function is observable from outside the server. |
| `chat.advance_failed` | `{ reason: 'timeout' \| 'error' \| 'offline' \| 'shed'; retried: boolean; beat_index: number \| null }` | `C-R7` says a failure is silence, so **this event is the only way anyone learns it happened.** `'shed'` separates `C-D6`'s deliberate deferral from a real failure, which is the difference between "the ceiling is working" and "the room is broken". |

**Drafted and folded, written down so nobody re-adds them:**

- **`chat.badge_shown`** → folded into `chat.opened.unread`. A dot that is seen and not
  acted on is answered by request volume in the platform log; a dot that is acted on is
  `chat.opened` with a non-zero `unread`. Same fold as v0.4.0's dropped `revealed`.
- **`chat.reply_opened`** (fired when the `Balas` chip is tapped) → folded into
  `chat.message_sent.has_reply_to` and `reply_age_minutes`. A reply started and
  abandoned is not a decision anybody would change; a reply *sent* is.
- **`chat.older_loaded`** → dropped. Whether pagination is used is `GET
  /api/chat/messages?before=` request volume in the platform log, which is the
  instrument the taxonomy's own comment points at for exactly this shape of question.

All four fire from the **client**, through `@/lib/analytics/track.client` — never
`@/lib/analytics/track`, which drags `node:async_hooks` and `next/server` into the
browser bundle and fails the build. `track()` returns `void` and is never awaited, and
it is called from the handler body, never inside a `setState` updater (`F4-16`).

---

## 12. Tasks

Numbered, in build order. Each names its files. **F1 must have landed first** — tasks
5–9 consume routes that do not exist before it.

| # | Task | Files |
|---|---|---|
| **1** | **The tokens.** `corner` in `tokens.ts` with its header, then the four custom properties mirrored into `tokens.css`. **`tokens.ts` first, then the mirror** (`## Styling`, `F4-17`). No other value changes. | `src/theme/tokens.ts`, `src/theme/tokens.css` |
| **2** | **The avatars.** Write the script, run it, open the contact strip, **tune the crop table by eye and re-run**, commit the three `.webp`. Add `"avatars": "python3 tools/make_avatars.py"` to `package.json`. This is first among the code tasks because the crop table needs a human and the rest of the surface can be built against the output. | `tools/make_avatars.py`, `public/readers/*.webp`, `package.json`, `.gitignore` (the strip) |
| **3** | **The plumbing for `/readers/*`.** The matcher entry and the cache header, together, because they are two rules that look like one and shipping half of them is `F4-18`'s recorded mistake. | `src/middleware.ts`, `next.config.ts` |
| **4** | **The catalog.** Every `chat.*` key from §8 into `id.ts`. **Expect a red typecheck** naming each missing English string; that is the feature. Write `en.ts` second, and **rewrite rather than translate** where a register differs. | `src/lib/i18n/locales/id.ts`, `src/lib/i18n/locales/en.ts` |
| **5** | **The pure module and its tests, before any component.** `swipeDeck.ts`'s precedent: the interesting decisions land where `npm test` can reach them, and the component is the thin part. **Loop 1 is green at the end of this task**, on a screen that does not exist yet. | `src/lib/chatSurface.ts`, `src/lib/chatSurface.test.ts` |
| **6** | **`ChatButton` and the four mounts.** With the header restating `F4-2`/`F4-3`, the one bounded fetch, the M14 badge and the deny-shaped test. **It ships before the room**, so the dot is exercised against F1's `state` route in isolation. | `src/components/ChatButton.tsx` + `.module.css`, `src/components/chatSurface.test.ts`, `src/app/page.tsx`, `src/app/[reader]/page.tsx`, `src/app/history/page.tsx`, `src/app/account/page.tsx` |
| **7** | **The presentational components**, built against fixtures with no fetching at all: avatar, bubble (four shapes), quote stub, typing indicator, composer. | `src/components/ChatAvatar.tsx`, `ChatBubble.tsx`, `ChatTyping.tsx`, `ChatComposer.tsx` + their `.module.css` |
| **8** | **The page and the room.** The server component that reads nothing (`H6`'s argument, one release later: the default day separator is the querent's, and the server does not know it), plus the client room — the five fetches, the loop, the anchoring, the reply-to. | `src/app/chat/page.tsx`, `src/app/chat/page.module.css`, `src/app/chat/ChatRoom.tsx`, `src/app/chat/ChatRoom.module.css` |
| **9** | **The width harness**, and fix whatever it finds. Eight measurements, both locales, the pathological content from §10.2. | `public/cards/_chatfit.html` |
| **10** | **Loop 5**, against `E2E_BASE=http://localhost:3001`: the reply-to body diff and the advance-call count. | `tools/e2e/` (existing) |
| **11** | **The gates.** `npm test`, `npm run typecheck`, `npm run build`. Then the loop-6 list goes to Miftah as a written checklist against a preview URL, because **not one item on it can be answered from here.** | — |

---

## 13. Open questions

These are **for Miftah or for the reconciliation**, and this plan does not resolve one
by picking an answer.

| # | Question | Why it needs a ruling and what I did meanwhile |
|---|---|---|
| **Q-F4-1** | **Does `/chat` get a row in `AccountMenu`?** The menu has six items since 2026-07-29 and its header's *"no fifth item"* comment was **inverted rather than deleted** — it is still right about the case it was made for, which is a SHARE control. A seventh row is a product call, and `AccountMenu.tsx` is not mine. | I built the corner button, which is `C-D17`'s instruction and is the discoverable path. If a menu row is wanted it needs a `chat.*` key from §8's block, an owner for `AccountMenu.tsx`, and `chat.opened.from` gains `'menu'`. |
| **Q-F4-2** | **Does the room show read receipts or a "seen" state?** `chat_threads.last_read_at` exists for the badge; rendering it would be a second meaning for the same column and a promise about someone else's attention that this app cannot keep — there is nobody on the other end. | Built without. Nothing in the schema forecloses it. |
| **Q-F4-3** | **Can the querent send while a run is in flight?** A real group chat lets you. This app's engine is one run at a time with a lease, so a second message mid-run either queues, mints a second run, or is refused. **`C-R3` is about two tabs, not about two messages**, and §5 does not say. | Built as: the composer stays enabled, the optimistic bubble appears, and `POST /api/chat/message` is sent — because blocking the composer for 20 seconds is the single most chatbot-like thing on this list. **What the engine does with the resulting second `pending` run is F1's, and it is D4 below.** |
| **Q-F4-4** | **§5.4 asks whether the reply-to chip survives contact with a thumb.** Loop 6. | Built the chip. The repair, if it reads wrong, is to **add** swipe as an accelerator, never to replace it (§5.4). |
| **Q-F4-5** | **The avatar crops.** Three boxes chosen by eye from three scenes at three different resolutions. | The table is in §7.2 and the script prints a contact strip. **Somebody has to look at it**, and then at it on a phone at 28px. |

---

## 14. Discrepancies with the roadmap

**Each of these is a place where §4/§5 does not define something F4 has to consume, or
where this plan deliberately diverges. The reconciliation settles all of them.**

### D1 — `POST /api/chat/message` has no idempotency key, and `F4-12` needs one

`C-R2`/§4.2 say a timeout is the one outcome retried, once. On `advance` the run id
makes that safe. On `message` there is nothing: a slow-but-successful write retried
puts the querent's sentence in the room twice, and **both copies become context for
every future turn** (`C-R5`).

**Ask:** `POST /api/chat/message` accepts a client-generated `clientKey` (a
`crypto.randomUUID()`), and the route returns the existing row rather than inserting a
second one when it sees a key it has already stored. `chat_messages` would need a
nullable `client_key` column with a partial unique index — **which is a `0014` delta and
must therefore be folded before F1 builds** (§0.4).

**If refused:** `message` is not retried at all, a timeout renders the bubble `unsent`
with a `Coba lagi`, and `F4-12`'s *"a timeout means unknown"* is knowingly traded for
*"ask the person to guess"*. That trade is worse and should be made explicitly, not by
omission.

### D2 — `POST /api/chat/advance` has no way to say **"shed, come back later"**

`C-D6` consequence 3 is explicit: *"A shed chat turn is not an error. The run is left
`running` with beats remaining and picked up later."* §5's reply shape is
`{ state, message?, typingFor?, delayMs?, done }`. **None of those five fields can
express it.**

- `done: true` is wrong — the run is not done and the client would stop asking.
- `done: false` with no `message` and no `typingFor` is an instruction to loop, and the
  client would hammer `advance` against a soft ceiling until the tab closes.
- An HTTP error is wrong — `C-D6` says it is not an error, and `F4-12` would retry it.

**Ask:** the reply carries an explicit terminal-for-now discriminator. My preference is
`state: 'shed'` (or `deferred: true` beside `done: false`), on which the client goes to
`stopped: 'shed'`, renders **nothing** (`C-R7`), and the run is picked up by the next
`GET /api/chat/state`. **This is the single most important field on the list**, because
without it `C-D6`'s best argument for the run engine has no client-side expression at
all.

### D3 — `GET /api/chat/messages` must inline the quoted message's stub, or `C-D11` cannot render

`C-D11`'s whole point is that *"the director is handed the last N messages with their
ids and their ages, and may point a beat at any of them"* — Adrian answering Margaret's
bubble **from an hour ago**. A page is 40 rows. The message a beat quotes is very often
**not on the page**, and a `reply_to_message_id` pointing at a row the client does not
hold renders as nothing.

**Ask:** every row carries
`replyTo: { id, author, snippet } | null`, where `snippet` is the first ~80 characters
of the quoted body, resolved server-side in the same query. It is one self-join on an
indexed primary key.

**If refused:** the client renders `t('chat.reply.gone')` for any quote it cannot
resolve — which is a correct-looking screen that silently deletes the *"out of
nowhere"* reply, the feature `C-D11` exists for.

### D4 — What happens to a second `pending` run

Q-F4-3's engine half. If the querent sends while a run is `running`, `POST
/api/chat/message` mints a second `pending` run per §5's diagram. §5 does not say
whether `advance` picks the oldest, the newest, or refuses. **F1 owns the answer; F4
needs to know which run id to drive**, and the reply must tell it — my `advancing` state
carries a run id and would otherwise be driving a run the server has abandoned.

**Preference:** `POST /api/chat/message` returns the run id the client should drive, and
the server decides whether that is a new run or the existing one. The client never
picks.

### D5 — `npm run db:seed` must seed a chat thread, or loop 4 has nothing to measure

`_chatfit.html` drives the real `/chat` — inlining the CSS would measure a snapshot and
drift silently, which is `_slotfit.html`'s own stated failure mode. So the room must
contain the pathological content in §10.2, and the only way to put it there without a
model call per run is the seed script.

**Ask:** F1's `db:seed` adds, for `dev:miftah`, a thread with ~30 messages including a
400-character bubble, a quote stub of one, all three readers, a message crossing
midnight, and a 24-character nickname on the profile. It is dev-only data in a script
that `CLAUDE.md` says **never** becomes a migration, so it costs production nothing.

### D6 — `C-D16` names two different sources for the avatars

*"source `assets/` → `public/readers/`"* in one bullet, and *"`public/dukuns/*.jpg` are
the source and are never edited in place"* in the next. `assets/` contains only
`major_arcanas/` and `ui/`; there is no reader art there. **`public/dukuns/` is the
source** and `make_avatars.py` reads it. Recorded so nobody "fixes" the script to read
a directory that does not exist.

### D7 — The avatars are 112px, not `C-D16`'s "2× the largest rendered size"

2× of the largest rendered size (36px) is 72px. **The iPhone's device pixel ratio is 3**,
and a face at 72px on a 3× screen is soft in the one way that reads as a broken asset.
112 = `36 × 3` rounded to a multiple of 16. The cost is ~7KB across three files for the
whole release. Flagged rather than done quietly, because `C-D16` states a number.

### D8 — `LotusMark` is not exported and S9 forbids editing `AccountButton.tsx`

`C-D16` says the querent's avatar **is** the lotus, *"the same glyph `AccountButton`
draws"*. That glyph is a non-exported function inside a file F4 must not touch.

**Preferred ruling:** extract it to `src/components/LotusMark.tsx`; `AccountButton`
imports it. Three lines, no behaviour change, one glyph in one place.
**Fallback:** `ChatAvatar` declares its own `<svg>` with the same four `d` strings, and
`chatSurface.test.ts` asserts the two sets are byte-identical (§10.1). This plan builds
against whichever the reconciliation picks and does **not** edit `AccountButton.tsx`
either way.

### D9 — `src/lib/chatSurface.ts` is outside F4's stated ownership

§7 gives F4 `src/app/chat/**` and `src/components/Chat*.tsx`. The pure module has to
live outside both, or `npm test` cannot reach the only interesting decisions on this
surface — `swipeDeck.ts`'s argument verbatim. It is at `src/lib/chatSurface.ts` (not
`src/lib/chat/surface.ts`) specifically to stay out of F1/F2/F3's `src/lib/chat/`
directory, mirroring `src/lib/swipeDeck.ts`'s own placement. **Ask:** add it to F4's
ownership list.

### D10 — `next.config.ts` has no owner this release

§7 gives F4 *"the middleware matcher entry for `/readers/`"* and nothing about the cache
header, but `C-D16` requires `/readers/*` to have its own header and `F4-18` explains
why the two are one change. v0.4.0's precedent is *"S5 declares this header and S1
writes it"*.

**Ask:** F4 both declares and writes it, since no other workstream touches that file in
v0.7.0. The declared value is
`public, max-age=86400, stale-while-revalidate=604800` — `/wallpapers/*`'s, for
`/wallpapers/*`'s reason, and explicitly **not** `/cards/*`'s year of `immutable`.

### D11 — `POST /api/chat/message`'s 403 body shape

`C-D13` says a refusal renders `RefusalNotice`, which W7 built and which takes a
category so it can link `/terms#6-<n>` through `CLAUSE_FOR`. §4 does not say what the
403 body carries. **Ask:** the same shape `POST /api/reading`'s refusal already returns,
so `ChatComposer` mounts `RefusalNotice` with no new adapter and no new copy. If the
shapes differ, the two refusal surfaces will drift and one of them will link to the
wrong clause — for somebody who has just been refused.
