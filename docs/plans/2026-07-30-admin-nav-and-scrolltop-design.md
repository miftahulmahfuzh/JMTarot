# Admin: the folder-tab nav, and a way back to the top

2026-07-30. Two reports from the operator, both about scrolling and orientation on
`/admin`:

- **6.a** — `/admin/users/[id]` puts `Bacaan` sixth of fourteen sections, and it is the
  paginated one, up to fifty readings long. Everything after it is buried. And there is
  no way back to the top of any admin page except flicking.
- **6.b** — nothing tells you which tab you are on. Every page's `<h1>` is a verbatim
  copy of its own nav label, so the page says its name twice and marks it zero times.

Both are answered here. Neither adds a dependency, a token or a model call.

---

## 1. The title was already redundant, so the tab can carry it

The four nav pages render an `<h1>` that is character-for-character its nav label:

| Route           | Nav label   | `<h1>`      |
| --------------- | ----------- | ----------- |
| `/admin`        | `Ringkasan` | `Ringkasan` |
| `/admin/tokens` | `Token`     | `Token`     |
| `/admin/users`  | `Pengguna`  | `Pengguna`  |
| `/admin/blog`   | `Tulisan`   | `Tulisan`   |

So the operator's instinct is exactly right: **removing the title loses nothing, and
marking the tab replaces it.** The separating rule detours around the active tab, which
makes the tab part of the page rather than a control above it — one mark doing the job
two pieces of text were doing badly.

Three routes have no nav entry: `/admin/users/[id]`, `/admin/blog/new` and
`/admin/blog/[slug]`. Their parent tab curves open, so the rule always names a section.
The subject's email on `/admin/users/[id]` is the one title that was *not* a duplicate;
it moves to a line beside the back link.

### The `<h1>` is hidden, not deleted, and that is not a hedge

**Dropping every heading outright leaves each admin page with no level-1 heading at
all**, and a screen-reader operator navigates by heading. So each page keeps its
`copy.ts` title as a visually-hidden `<h1>`, and the active tab carries
`aria-current="page"`.

That second attribute is what makes the curve a *state* rather than a decoration: the
curve is the visual channel, `aria-current` is the other one, and a highlight with only
the first is a highlight half the operators cannot perceive. Keeping the strings also
keeps `adminCopy.test.ts`'s *"the strings all live in copy.ts"* honest — no copy is
orphaned by this change.

---

## 2. Each page names its own tab, and `usePathname()` stays banned

**The obvious implementation is a deliberately red test.** `adminSurface.test.ts` asserts
that the string `usePathname` appears in no file under `src/app/admin/**`, and `pages.ts`
records the reason: a resolved path on `/admin/users/<uuid>` reaching
`admin.page_viewed.page` would put a subject's uuid into `events.props`, and **`events`
rows survive that subject's account erasure with `user_id` nulled.** The fence is
protecting an erasure promise.

Three ways out, and the one taken is the only one that leaves the promise absolute:

| Option                                          | Why not                                                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Narrow the fence to "no resolved path reaches an analytics call" | The invariant survives but stops being absolute, and every future reader has to reconstruct the exception before trusting it. |
| Move a client nav to `src/components/`          | Satisfies the test by leaving its glob. The rule is unchanged in spirit and the test no longer says so — fence laundering.          |
| **Each page names its own tab**                 | **Taken.**                                                                                                                         |

Every admin page **already** declares its own template, for this exact reason:
`<AdminPageViewed page="/admin/users/[id]" />`. `AdminTabs` takes the same value.

```tsx
<AdminTabs active="/admin/tokens" />
<AdminPageViewed page="/admin/tokens" />
```

`active` is typed `AdminPagePath`, so a misspelling is a compile error rather than a tab
row with nothing lit. The component stays a **server** component with no client
JavaScript, which is what the whole admin tree is today.

The cost is that `layout.tsx` stops owning the nav, and a new admin page could ship
without one. Two new assertions in `adminSurface.test.ts` close that:

1. Every `page.tsx` under `src/app/admin/**` mounts `AdminTabs` exactly once.
2. The `active` it passes equals the `page` its `AdminPageViewed` passes — so a page
   cannot light the wrong tab while reporting the right one.

`layout.tsx` keeps `<main lang="id">`, the `robots` metadata and the gate. It also keeps
`ScrollTop` (§4), so "the shell owns what is on every page" still holds; only the nav
moved, because only the nav needs to know where it is.

---

## 3. The rule is not drawn under the active tab, rather than erased

The first construction that comes to mind is: keep `.nav { border-bottom }`, give the
active tab a top/left/right border, and paint over the segment underneath. **It cannot
work here.** `Backdrop` paints `--bg-radial` at `position: fixed`, so the admin shell is
transparent over a gradient that is `#221a3a` at the top of the viewport. Any opaque
patch — `--canvas` is `#0a0812` — reads as a dark block sitting in the nav.

So the rule is composed rather than interrupted:

- `.nav` has **no** `border-bottom`. Each tab draws its own 1px slice with a
  pseudo-element spanning its full inline size. Tabs abut horizontally (padding, not
  `gap`), so the slices form one unbroken rule. Two pseudo-elements on `.nav` cover its
  own inline padding at each end.
- The **active** tab draws no slice. It gets `border` on top/left/right,
  `border-radius: var(--radius-card) var(--radius-card) 0 0`, and no bottom border.
- Its `::before` and `::after` — freed by having no slice to draw — become the two
  concave fillets, in the inline margin it reserves for them.

```
        ╭───────────╮
────────╯ RINGKASAN ╰────── TOKEN ── PENGGUNA ── TULISAN ──────
```

A fillet is a `--radius-card` square with one rounded corner and two borders, which
should render as a single quarter-arc from the horizontal rule up into the tab's side
border. **That claim is measured, not recalled** (`## Traps`, *framework behaviour is
measured here*): a harness under `public/cards/` reproduces the markup and the CSS, so
the arc is verified without needing an admin session, and then the real page is read at
1440px — the instrument `layout.module.css` already names for itself.

**No new token.** `--radius-card` (10px) for the top corners and the fillet radius,
`--gold-hairline` for every stroke, `--gold-text` and `--label` for the two label states.
`## Styling`'s rule holds: no new hex, no new font size, no new curve.

### What the harness actually found

Three defects, none visible at 1x until the pixels were cropped and upscaled, and the
last two were invisible in the *first* harness shot too:

1. **The rule broke between every pair of tabs.** An absolutely positioned child resolves
   its insets against the **padding** box, and every tab carries a 1px border — so
   `inset-inline: 0` left each slice 1px short at both ends.
2. **Each fillet landed beside the tab's side border, not on it**, for the same reason: a
   1px jog at the join and a 1px hole in the rule.
3. **The rule stopped after the last tab**, leaving a disconnected stub at the far right
   of a 1200px nav. Fixed with `.rail`, a `flex: 1` span — an element and not a
   pseudo-element, because only the flex layout knows how wide "the rest" is.

A fourth is **accepted rather than fixed**: a half-pixel softening survives where the
antialiased arc meets the crisp border. The 1px overlap takes it to the antialiasing
boundary, which is the floor for two separately-composited boxes; removing the last of it
means an inline SVG or a mask, which is not worth it for a hairline at the bottom of a
nav.

The harness is `public/cards/_admintabs.html` and is **gitignored**, like every
`public/cards/_*.html` — scratch by project convention, not committed. The real page was
then read at 1440px through loop 5, signed in as a local admin.

`flex-wrap: wrap` stays. Because each tab owns its slice, a wrapped row grows its own
rule instead of leaving one row underlined and the other floating.

---

## 4. `ScrollTop`, and the trap it was warned about by name

`src/app/admin/ScrollTop.tsx`, client, mounted once in `layout.tsx` so it reaches all
seven pages. 44px square — `layout.module.css` already argues that number for the nav
links, on the grounds that the operator may well be on a phone looking at why something
broke. Fixed bottom-right, above `env(safe-area-inset-bottom)`. It fades in past **one** screen of
scroll, so it is absent exactly where it would do nothing and cover content; the listener
is passive and rAF-throttled.

**The threshold was 1.5 screens and driving the real page disproved it.** At 1440x1200 —
the shape of the screen this dashboard is read on — `/admin/users/[id]` is 2774px tall, so
its maximum `scrollY` is about 1717 and the 1800px that 1.5 screens demands is
*unreachable*: **the button never appeared on the page whose scrolling was the report.**
One viewport is "the top of the page is no longer on screen", which still requires a page
twice the viewport's height, so `/admin/blog/new` never shows one. No unit test could have
caught this — it needs a real viewport with a real page height in it.

**`SwipeDeck.module.css` predicted this component:** *"the same trap will catch the next
component that auto-scrolls."* This is that component. A JS `scrollTo({ behavior })`
**overrides** CSS `scroll-behavior` rather than defaulting from it, so
`html[data-still]` in a stylesheet has no say over this call. `ScrollTop` therefore reads
`data-still` itself and honours `usePrefersReducedMotion()`, mirroring `goTo`'s line
verbatim:

```ts
behavior: reduce || still ? 'auto' : 'smooth'
```

Without it, every 1440px admin screenshot would photograph the page mid-glide, and no
stylesheet rule could have prevented it.

The `aria-label` is Indonesian and hardcoded in `copy.ts` — A-D12, no `t()`.

---

## 5. `Bacaan` becomes section 14

`['bacaan', …]` moves to the end of `SECTIONS` and `<Readings …>` to after
`<AccessLog …>`. The other thirteen panels are short and scannable, so nothing is buried
under fifty readings any more, and the anchor nav still jumps straight there.

`page.contract.test.ts`'s fourteen-sections assertion is presence-only, so it stays green
— and it should: it is asserting that no panel is orphaned, not what order they sit in.

**One thing this breaks, fixed in the same change.** `Bacaan`'s next-page link is
`?before=<cursor>` on the same route, so paging is a navigation that lands the operator
at the top of a page whose readings are now at the very bottom — the exact complaint 6.a
opened with, reintroduced through the back door. The `nextHref` carries `#bacaan`, so
paging lands on the section.

---

## 6. What this does not do

- **No search-engine surface changes.** `/admin` is `noindex` and behind the gate; none
  of this reaches `isPublic()`.
- **No write, no model call, no query change.** `A5-24` and `A5-25` hold untouched — the
  only files with new behaviour are chrome.
- **`layout.module.css` stays a guess and is still recorded as one.** Its own header says
  nobody has looked at this dashboard on the machine it will be used from, and this
  change does not close that; it settles the nav's active state and nothing else about
  the shell.
