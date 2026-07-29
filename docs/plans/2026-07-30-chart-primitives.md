> **RECONCILED 2026-07-30 — `docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md` OUTRANKS THIS
> PLAN AND THE ROADMAP. Read it before implementing a single task.** The six plans returned
> **51 defects in the roadmap they were reconciling**; nineteen were verified against running
> code and **four would have shipped**.
>
> **Rulings binding on A4:** R8 (**the panel must paint an OPAQUE `#130f22`** — `#a3423a` is 2.66:1 on the backdrop), R9 (per-set validator commands; `--ordinal` required for two), R10 (a WARN exits 0; the diverging midpoint must FAIL the chroma floor), R11 (top-3 + Other), R12 (heatmap Jakarta-pinned and labelled), R13 (Cinzel, not sans), R14 (**hero = calls, not spend**), R21 (no metrics route), R33 (the `t()` grep is the WHOLE rule).
>
> Where this plan disagrees with a ruling above, **this plan is wrong.** Its unamended text is
> kept deliberately — the reconciliation is an amendment, not a rewrite (the v0.4.0 precedent).

# A4 — Chart Primitives and the Dashboard Overview

> **For Claude:** REQUIRED SUB-SKILL: use `superpowers-extended-cc:executing-plans` to
> implement this plan task-by-task.

> **Precedence.** `CLAUDE.md` outranks everything. Then
> `PUBLIC_RELEASE_ROADMAP_v0.5.0.md`, then
> `docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md` once it exists, then this file.
> **Where this plan disagrees with the roadmap, this plan is wrong** — *except* at the
> eleven points in §1 where this plan records a roadmap **defect** with a measurement
> attached. Those are for reconciliation to rule on; they are not licence to
> improvise elsewhere.
>
> **A4 depends on A1 and A3.** Task 1 is a blocking precondition check that fails
> loudly rather than letting an engineer build against imports that do not exist.

**Goal.** A chart system for `/admin`, hand-rolled, server-rendered, with **no new
dependency of any kind**, plus the two pages A4 owns: `/admin` (the overview) and
`/admin/tokens` (consumption, trajectory, forecast). Every colour comes from a palette
that a committed test re-validates on every run. Every chart has a table view. No chart
has two y-axes. Nothing in `src/components/chart/**` reads a session, a database, an
environment variable or the i18n catalog.

**Architecture, in one line:** *SVG only where a path is diagonal; everything else is
CSS; text is never inside an SVG.* §3 is the derivation and it is the single most
load-bearing decision in this plan.

---

## 0. What this plan is not allowed to do

- **No charting library, no date library, no colour library, no font.** `package.json`
  is not edited. A-D10's second reason is the binding one: `scripts/audit-secrets.ts`
  runs inside `npm run build`, and a chart library is a new client bundle to audit on
  the one route that renders every user's data. Its first reason is the CSP —
  `script-src 'self' 'unsafe-inline'` is **report-only with a stated goal of tightening
  it** (`next.config.ts:134-146`), which is verbatim the argument `src/content/types.ts`
  uses to refuse an `html` block kind.
- **No edit to `src/theme/tokens.ts`.** §6 assigns A4 exactly one shared file:
  `src/theme/tokens.css`, and only to mirror `chart.ts`.
- **No new palette derivation.** §5.1 is validated. §5.2 is a measured negative
  finding. A4 encodes them and writes the test that keeps them from drifting.
- **No light mode.** §5.4. An unvalidated second palette is worse than one mode.
- **No `t()`, no `useT`, no `getT`, no `tFor`, no `LocaleProvider`, no `LocaleSwitch`
  anywhere under `src/app/admin/**`** (A-D12). Task 19 greps for it.
- **No admin write to querent data.** A4 renders. It has no POST, no PUT, no form that
  changes a row. The one `<form>` in this plan is `method="get"` and its only effect is
  a URL.

---

## 1. Defects and gaps found in the roadmap, with the measurement attached

Every number below was produced by running the `dataviz` skill's validator on this
machine on 2026-07-29. **Nine are corrections to §5; two are missing seams.** Where
this plan proceeds on its own ruling it says so and states the alternative, so
reconciliation can overrule it in one line.

### 1.1 §5.1 prints ONE command and three of its five sets FAIL under it

§5.1 heads the section with

```
node scripts/validate_palette.js "<hexes>" --mode dark --surface "#130f22"
```

and then says every set below was validated with it. **Run bare, the 5-step sequential
ramp exits 1 with three FAILs; the 4-step severity ramp exits 1 with three FAILs.**
Both need `--ordinal`, which switches to the ramp checks (monotone L, adjacent ΔL, a
light-end contrast floor, single hue) instead of the categorical six. `color-formula.md`
states this explicitly — *"running the categorical validator on a sequential ramp will
FAIL by design … don't 'fix' a good ramp to satisfy it"* — but §5.1 as written
prescribes the wrong command for three of its five sets.

**Why it matters more than a typo:** an implementer following §5.1 literally writes a
test that is red on shipped-correct values, concludes the palette is broken, and
re-derives it. That is the exact outcome A-D9 exists to prevent. **§6.1 of this plan
carries the per-set command, and `chart.palette.test.ts` asserts the categorical
validator FAILS on the sequential ramp, on purpose, with a comment.**

### 1.2 §5.1's diverging set "ALL CHECKS PASS" is true of the poles only

`#2fa4a0 ← #7a7192 → #a3423a` through the categorical validator:

```
[FAIL] Chroma floor   below floor (reads gray): [["#7a7192",0.051]]
```

The **27.2** §5.1 quotes is the two poles alone (`#2fa4a0,#a3423a` → ΔE 27.2 normal,
16.4 deutan, ALL CHECKS PASS). The trio fails, and **the failure is the
requirement**: `color-formula.md` demands *"two hues + a neutral gray midpoint"*, and a
neutral gray is by definition below the chroma floor. CLAUDE.md already records that
`muted` and `label` are *"lavender-grays below the chroma floor"*, so the codebase and
the roadmap are consistent; §5.1 simply reported a number from a different run than the
command it printed. **The test validates the poles and asserts the midpoint is below the
floor**, with the reason, so nobody "fixes" the midpoint into a hue.

### 1.3 §5.1's `--pairs all` result is a WARN and the run PASSES

§5.1: *"At `--pairs all` the teal↔rose pair is ΔE 6.5 — a WARN, not a pass."*
Measured:

```
[WARN] CVD separation    worst all-pairs #d2707f↔#2fa4a0 ΔE 6.5 (deutan) · tritan 8.4
[PASS] Normal-vision floor  worst all-pairs #d2707f↔#ab8b20 ΔE 15.8 (normal)
  → ALL CHECKS PASS      EXIT=0
```

Exit 0. A WARN in the 6–8 floor band is **legal with mandatory secondary encoding**, and
the normal-vision floor — the hard gate — passes at 15.8. So the verdict §5.1 draws
(all-pairs forms cap at three series) is right, but its *stated reason* is wrong, and a
test written from §5.1's wording (`expect(fail).toBe(true)`) would be **red on correct
data**. The consequence A4 ships instead is structural and stronger: **A4 renders no
all-pairs form at all** — no scatter, no bubble, no small multiples — and
`chart.contract.test.ts` asserts their absence by name. The WARN's secondary-encoding
obligation is discharged three times over by direct labels, the 2px surface gap and the
table view.

### 1.4 The chart surface must be OPAQUE, and §5 never says so — the critical colour fails otherwise

`Backdrop.tsx` paints `var(--bg-radial)` at `position: fixed; inset: 0`, so **the colour
behind any chart depends on where the chart sits in the viewport, not on the page.** The
gradient runs `#221a3a 0% → #130f22 42% → #08060f 100%`. Measured WCAG contrast:

| mark | `#221a3a` (0%) | `#130f22` (42%, §5's surface) | `#08060f` (100%) |
|---|---|---|---|
| `SEVERITY[3]` = `danger` `#a3423a` | **2.66** ✗ | **3.04** ✓ | 3.26 |
| `SEQUENTIAL[4]` `#7a68b8` | 3.52 | 4.02 | 4.31 |
| `label` `#7a7192` | 3.61 | 4.11 | 4.41 |
| `faint` `#6f668a` | 3.09 | 3.52 | 3.78 |

**`#a3423a` is the `critical` status colour, the deep end of the severity ramp AND a
diverging pole, and against the top of the radial it measures 2.66:1 — below the 3:1
mark floor.** At §5's surface it clears by **0.04**.

**Ruling (I-4 below):** every chart mounts on an **opaque** panel filled with
`--chart-surface: #130f22`, which is `color.bgRadial[1]` and therefore not a new value.
No translucency, no `rgba`, no `backdrop-filter` — any of them lets the radial through
and the validated numbers stop holding. `chart.palette.test.ts` ships the negative
control: `contrast('#a3423a', '#221a3a') < 3`.

### 1.5 §5.3's "folded to 4 + Other" needs five slots and §5.1 has four

§5.1's table assigns **slot 4 = "Other"**. §5.3 says cost split by `op` is *"categorical,
folded to 4 + Other"* — which is five colours. A fifth categorical hue is explicitly
*"a reconciliation question, not an authoring convenience"* (A-D9).

**Ruling:** the fold is **top-3 + Other**, and for `op` specifically A4 does not use a
stacked bar at all. §5.3's own alternative binds — *"More than ~7 meaningful classes is
a table"* — and nine `op` values is nine. **`op` is a table with an inline bar column**
(sequential, one hue, so no categorical slot is spent). The top-3 + Other fold is
implemented in `metrics.ts` and used for `reader` and `service`, which have exactly
three members each and therefore never fold.

### 1.6 `llm_calls.status` has five values and there is no fifth hue

§3.2 gives `status` five values (`ok | partial | failed | aborted | refused`). §5.1
offers four slots, §5.2 proves a four-hue traffic light is unbuildable on this canvas,
and the severity ramp is four ordinal steps whose adjacent normal-vision ΔE is **7.5** —
a hard FAIL against the 15 floor *as a categorical set*, which is why it is ordinal.
**Ruling: the status breakdown is a TABLE.** `error_kind` (open vocabulary, `tee.ts`) is
likewise a table. Neither gets a colour.

Noted for reconciliation, not for A4: `ReadingStatus` in `src/data/types.ts` is
`ok | partial | failed | aborted | **blocked**` while §3.2's `llm_calls.status` is
`… | **refused**`. Five values each, one word apart. A2/A3's seam.

### 1.7 §5.3's weekday × hour heatmap is NOT buildable from §3.2's columns

§5.3 asks for *"Readings per weekday × hour — heatmap"*. `llm_calls` has `local_date`
(a date **string**, the querent's calendar day, and CLAUDE.md forbids recomputing it
from `created_at`) and `created_at` (`timestamptz`, UTC). **Neither carries an
hour-of-day in the querent's zone.** `local_date` has no time; `created_at` is a
different day for a Jakarta querent between midnight and 07:00 — the exact trap
`## Traps` names.

Three options were considered. Adding a `local_hour` column is out (§3.4: no column on
any existing table, and `llm_calls` is A2's settled schema). Dropping the hour axis
turns a heatmap into a 7-bar bar chart. **Ruling:** weekday comes from `local_date`
(correct, no zone involved) and hour comes from `created_at AT TIME ZONE 'Asia/Jakarta'`,
**with the axis labelled `Jam (WIB)` on screen** so the claim is the one being made.
Indonesia has no DST, so the offset is fixed and the mapping is exact for the population
that matters — and the operator asking "when is the app busy" is in Jakarta. **A
reconciliation question, flagged: is a Jakarta-pinned hour axis acceptable, or does the
heatmap wait for a column?** If it waits, delete Task 13 and the page loses one card.

### 1.8 §5.3's "meter, same-hue track" cannot state a good state

`marks-and-anatomy.md`: *"the fill carries severity (accent → warning → danger); the
unfilled track is a lighter step of the same ramp."* On this canvas the severity ramp's
lightest step is `#e0a49c`, a pale pink. **An empty track painted `#e0a49c` announces
mild alarm at 0% utilisation** — and §5.2 proves there is no green-to-red hue ramp to
reach for instead.

**Ruling and departure, stated:** the meter's **track** is `--label #7a7192` (a neutral
channel, 4.11:1 on the surface, spends no palette slot), and the **fill** starts at
`STATUS.good #4f9d6b` and steps into the severity ramp as utilisation rises. The
severity ramp's adjacent ΔE of 7.5 is exactly why **an icon and a word are mandatory on
the meter and colour never carries the state alone** — which `color-formula.md` requires
of status anyway (*"always paired with an icon + label"*).

### 1.9 §5.3's dashed projection is correct and must not be "fixed"

`anti-patterns.md` bans **dashed gridlines and axis rules** — *"dashing … reads as
'projection' or 'threshold' when it's just a grid."* That sentence **endorses** dashing
for a real projection. §5.3's *"line + band + a dashed projection"* is right. Recorded
because a reviewer reading the anti-pattern list will flag it, and the fix they reach
for is a solid projection line, which is the chart lying with a straight face.

### 1.10 The hero figure has no sans to be set in

`marks-and-anatomy.md`: the hero figure is *"in the same sans as everything else (never
a display or serif face — it reads as off-brand decoration)."* **This project has no
sans.** `layout.tsx` self-hosts exactly two families: Cinzel (display serif) and
Cormorant Garamond (body serif), by explicit weight, and `## Assets`/`## Styling` do not
license a third.

**Ruling:** the hero figure and every stat-tile value are set in **Cinzel**, because the
rule's *reason* is "off-brand decoration" and on this canvas a system sans is the
off-brand thing. Adding a third family to satisfy the letter of a guideline would be a
new font download, a new `next/font` entry and a new CSP assumption — for one number.
The rest of the figure contract is kept verbatim, including the part most easily got
wrong: **proportional figures on the hero and on tile values, `tabular-nums` only in
table rows and axis ticks.**

### 1.11 Two seams the roadmap does not assign

- **`/api/admin/metrics/[metric]` is "A3/A4"** (§4.1) and neither owns it. **Ruling: A4
  does not build it and does not need it.** Both pages are server components reading
  A3's query modules directly; the date range is a URL search param and a change of
  range is a navigation, not a fetch. That deletes a route, deletes a client fetch,
  deletes the "hold the previous render at reduced opacity" requirement (there is no
  refetch), and is the reason nothing on these two pages needs hydration. **If A5 needs
  the endpoint for its per-user series, A5 owns it.**
- **The per-user cost league.** §5.3 lists it as A4's form; §7 gives `/admin/users` to
  A5. **Ruling: A4 renders a top-10 league table on `/admin/tokens` from A3's rollup,
  keyed by a truncated user id linking to `/admin/users/<id>`, with no email and no
  nickname.** Identity display belongs to A5's audited surface; putting an email on a
  metrics page would owe an `admin_access_log` row per rendered row, which is absurd,
  and omitting the audit would breach A-D16.

---

## 2. The invariants

Numbered, with reasons. A change that contradicts one is a defect, not a preference.

**I-1. No new runtime dependency, asserted.** `package.json`'s `dependencies` and
`devDependencies` are byte-identical before and after A4. The one new non-`src` file is
`tools/dataviz/validate_palette.js`, vendored, dev-only, imported by one test — see
I-22.

**I-2. `src/theme/tokens.ts` is not edited.** Chart tokens are their own file
(`src/theme/chart.ts`) mirrored into `tokens.css`. §6 assigns A4 the mirror and nothing
else. The reason chart colour is a separate file rather than an extension of the token
set is A-D9's: **JMTarot has one accent hue and gold means "a card goes here"**; a chart
palette living in `tokens.ts` invites a screen to use `--chart-cat-2` as a UI colour.

**I-3. `chart.ts` is PURE and its only import is `color` from `tokens.ts`.** No
`server-only`, no `process.env`, no React, no `next/*`. It is imported by a test, by
server components and by one client component, so it must be reachable from all three —
the `swipeDeck.ts` / `lines.ts` precedent. The `tokens.ts` import exists solely so two
identities are enforced by the compiler rather than by a comment:
`CHART_SURFACE === color.bgRadial[1]` and `DIVERGING.mid === color.label`.

**I-4. THE CHART SURFACE IS OPAQUE `#130f22`, AND THAT IS A CONTRAST REQUIREMENT, NOT A
STYLE.** §1.4 has the table. `#a3423a` measures 2.66:1 against the top of the radial and
3.04:1 against `#130f22` — a 0.04 margin. **Any translucency on a chart panel invalidates
the entire §5.1 validation run.** No `rgba`, no `opacity` on the panel, no
`backdrop-filter`. The negative control ships in the palette test.

**I-5. Categorical hues are addressed by ENTITY KEY, never by array index.** Three frozen
maps — `READER_SLOT`, `SERVICE_SLOT`, `DIRECTION_SLOT` — plus `OTHER_SLOT = 3`, and one
accessor `slotColor(slot)`. **`CATEGORICAL[` appears in exactly one place in the whole
repo, inside `slotColor`**, and `chart.contract.test.ts` asserts it. That is what makes
"colour follows the entity, never its rank" structural: there is no code path that can
colour a series by its position in an array. Filtering to `['margaret','adrian']` yields
`#2fa4a0` and `#8b7bd8`, never `#ab8b20` and `#2fa4a0` — `entityColor.test.ts` names that
exact failure.

**I-6. One chart, one entity dimension.** Slot 1 is thessaly *and* daily *and* input; the
palette is exactly four wide and three dimensions are keyed into it. So a chart is never
keyed by two dimensions at once — no reader × service stack. A six-colour chart would need
a fifth and sixth hue, which A-D9 forbids.

**I-7. Never a dual-axis chart.** Token input against token output is two series on one
axis; they share a unit. Tokens against cost, or calls against latency, is **two charts**.
Enforced by vocabulary: no file in `src/components/chart/**` may contain
`y2`, `rightAxis`, `secondaryAxis`, `axisRight` or `dualAxis`, and every chart component
takes exactly one y-domain prop. `noDualAxis.test.ts` is honest about being a grep: it
proves the vocabulary is absent, and the vocabulary is how the concept would arrive
(`callClass.test.ts` precedent).

**I-8. Every y-axis starts at zero.** Every metric in this release is a count or a sum of
counts. A truncated baseline on a count exaggerates a change and nothing on screen says so.

**I-9. A legend renders iff there are ≥2 series, and exactly one file can render one.**
`ChartFrame` takes `series` and renders `Legend` under `series.length >= 2`. `Legend` is
imported by `ChartFrame.tsx` and by nothing else — asserted. A single series needs no
legend because the title names it, and a one-swatch box restates the title.

**I-10. ≤4 series are also direct-labelled**, so identity is never colour-alone. Since the
palette is four wide, **every multi-series chart in this release is direct-labelled**.
Labels are selective — the endpoint, the extreme, the one series the card is about — never
a number on every point.

**I-11. Text wears text tokens, never a series colour.** Identity comes from the coloured
mark *beside* the text. The one place a status colour touches type is the stat tile's
delta **glyph** (`↑`/`↓`), never the number: `#a3423a` measures 3.04:1, which clears the
3:1 mark floor and fails 4.5:1 for text.

**I-12. Axis tick text is `--muted`, not `--label`.** Measured on `#130f22`: `--label` is
**4.11:1** and fails 4.5:1 for normal-size text; `--muted` is 6.47:1. `--label` is legal
as a *mark* (the meter track, the de-emphasis series) and as large type, not as a 11px
tick.

**I-13. Every chart has a table view, and it costs zero JavaScript.**
`<details><summary>` is the toggle. `table` is a **required, non-optional** prop on
`ChartFrame`, so a chart cannot be constructed without one. This is the relief the
`--pairs all` WARN and the sub-4.5:1 tick contrast oblige, and it is how a screen reader
reads a chart.

**I-14. No pie, no donut, no scatter, no bubble, no small multiples.** §5.3 permits a
donut for a single ratio in a stat tile; **A4 declines it**, because a single ratio against
a limit is a meter and there is already a meter. Fewer forms, one mechanism.
`chart.contract.test.ts` asserts the absence by filename.

**I-15. Nothing in `src/components/chart/**` reads the world.** No `process.env`, no
`@/lib/db/**` (**not even as `import type`** — `clientBoundary`-style regexes do not know
the `type` keyword, which is why `ReadingStatus` had to move to `@/data/types`), no
`currentUser()`, no `fetch`, no `@/lib/i18n/**`. Data and strings arrive as props.

**I-16. `src/components/chart/**` hardcodes no user-visible string.** Every label, unit,
empty-state sentence and `<summary>` word is a required prop. Enforced by a fence on
string-literal length (the `content/types.ts` prose-fence precedent, single-line bound
included — see that test's header for why a newline in the regex broke the first draft).
This is what keeps admin copy out of the primitives and inside `src/app/admin/copy.ts`
where A-D12 puts it.

**I-17. Exactly ONE `'use client'` file under `src/components/chart/**`.**
`ChartHover.tsx`. Named in the contract test, so a second one fails loudly. A-D10's third
reason — *server-rendered SVG needs no hydration at all* — is the whole reason the
dashboard can be fast on a cold lambda, and it is lost one component at a time.

**I-18. No `dangerouslySetInnerHTML` anywhere under `src/components/chart/**`.**
`interaction.md`: *labels are untrusted data.* A model string, an `op` value or a
truncated user id reaching a tooltip through string concatenation is the failure. React's
`{value}` is `textContent`; the fence asserts the escape hatch is absent.

**I-19. Tooltips enhance, never gate, and keyboard shows what hover shows.** Every value a
tooltip carries is also in the table view. The line/area crosshair snaps to the nearest x
index — a reader aims at a date, never at a 2px line — and one readout lists **every**
series at that x. Bar segments and heat cells carry their own readout on `:hover` and
`:focus-visible`, in CSS, with no client component; hit areas are ≥24px including the 2px
gap, and every interactive row is ≥44px tall (the iOS floor `PublicShare`'s known 36px
defect is measured against).

**I-20. Filters: one row, above everything, scoping both pages identically.** Date range
first, presets before a custom range. It is a `<form method="get">` with preset submit
buttons; a range change is a **navigation**, so there is no refetch, no skeleton flash and
no stale-frame requirement. The default range is computed **on the server from the
request**, never from `new Date()` in a render — the `todayKey()` rule, which
`HistoryBrowser` already pays for.

**I-21. Each chart card is its own `<Suspense>` boundary with a skeleton that reserves its
exact height.** A slow A3 query delays one card, not the page, and there is no layout
jump. The skeleton's pulse is off under `html[data-still]` (`StillMode`).

**I-22. The validator is VENDORED, not shelled out to, and its thresholds are asserted.**
The skill's script lives under `/tmp/claude-1000/bundled-skills/…`, a session-scoped path
that will not exist tomorrow — so shelling out is not reproducible and the committed test
would go red for the wrong reason. Nor is it re-typed: the Machado–Oliveira–Fernandes
matrices are *part of the standard* per the script's own header, and a transcription slip
in a 3×3 matrix makes the test pass for the wrong reason. So the file is copied verbatim
into `tools/dataviz/validate_palette.js` with a provenance header, and
`chart.palette.test.ts` additionally reads its source and asserts the five thresholds
(`CVD_TARGET 8.0`, `CVD_FLOOR 6.0`, `NORMAL_FLOOR 15.0`, `CHROMA_FLOOR 0.10`,
`CONTRAST_MIN 3.0`, `BAND.dark [0.48, 0.67]`) — because the cheapest way to make a
palette test pass is to loosen the ruler. Manual bookkeeping with a stated reason: the
`bodyHash` precedent.

**I-23. `track()` is never awaited**, imported from `@/lib/analytics/track` on the server.
A4 fires A1's `admin.page_viewed` with `{ page }` from each page. No new event name — the
taxonomy is A1's for this release (A-D18) and A4 declares nothing.

**I-24. Both pages declare `runtime = 'nodejs'` and `maxDuration`, and both have a stated
failure state.** §4.2: *a dashboard query is slower than a locale write and every admin
request is a cold one, because there is one admin and no warm instance.* `maxDuration = 30`
on both. The client-side bound §4.2 demands is discharged by `loading.tsx` + per-card
`Suspense` + an `error.tsx` in A1's route group; A4 additionally renders `ChartError`
(Indonesian, hardcoded) when a query throws or returns a shape the chart cannot honour,
rather than letting a card 500 the page. **`tally.ts`'s rule applies: a heuristic may fail
a build; it may not fail a person.**

**I-25. Admin numbers are formatted with `Intl.NumberFormat('id-ID')`, hardcoded.** No
catalog, no `@/lib/i18n/format`. `1.284`, `12,9 rb`, `1,2 jt`. `Intl` is in the platform;
this adds nothing.

---

## 3. The rendering architecture, and why text is never inside an SVG

This is the decision the rest of the plan falls out of, and it was arrived at by
elimination. Read it before writing a component.

**The naive design is one `<svg viewBox="0 0 W H">` per chart with `width: 100%`.** It has
one fatal property: *everything inside a uniformly-scaled SVG scales, including things
whose specification is a fixed pixel count.* Concretely, with a phone-sized viewBox and a
desktop container the scale factor is ~1.3–2.1×, and:

- **`<text>` at 11px renders at 14–23px** (or, with a desktop-sized viewBox on a phone,
  at 2.7px). A chart whose tick labels change size with its container cannot honour I-12
  and cannot be measured by loop 4.
- **A bar capped at ≤24px thick becomes 31–50px.** The mark spec is a pixel count.
- **An ≥8px marker becomes 10–17px**, and its 2px surface ring becomes 2.6–4.2px.
- **A 4px rounded data-end becomes 5–8px.**

`preserveAspectRatio="none"` fixes the *box* but shears circles and rounded corners.
`vector-effect="non-scaling-stroke"` rescues strokes and nothing else. There is no
`vector-effect` for a radius.

**So the split is by whether a mark has an intrinsic pixel size.**

| Lives in SVG | Lives in HTML/CSS |
|---|---|
| the line path | every piece of text, everywhere |
| the area's closing polygon | markers, end-dots and their 2px surface rings |
| the sparkline path | bars and stacked segments (flex rows) |
| the forecast band polygon | the meter track and fill |
| the dashed projection path | heat cells (CSS grid) |
| — | the legend, the table view, the axes, the crosshair |

Every SVG element in that left column is **a path or a polygon with no intrinsic size**.
So each chart's SVG can use `preserveAspectRatio="none"` with a clean data-space viewBox,
a CSS-fixed rendered height, and `vector-effect="non-scaling-stroke"` — under which a 2px
stroke is drawn 2px wide perpendicular to the sheared path, which is exactly right, and a
sheared filled polygon is precisely the plot transform.

Three consequences worth stating:

1. **Positioning HTML over the plot is exact**, because the SVG's box is known: a point at
   data index `i` sits at `left: (i/(n-1))*100%` and `top: (1 - v/vmax)*100%` of the same
   box. No `ResizeObserver`, no measurement, no hydration.
2. **The hover layer is trivial and needs no SVG hit-testing.** The crosshair is an
   absolutely positioned `<div>`; the readout is a `<div>`; a bar segment and a heat cell
   are real `<button>`s with real focus.
3. **`Line`, `Area`, `Sparkline` and `Trajectory` are the only components that emit SVG at
   all.** `StackedBar`, `Meter`, `Heatmap`, `StatTile`, `KpiRow`, `Hero`, `Legend`,
   `TableView` and `Axis` are CSS. That is a much smaller surface than A-D10 assumed and it
   makes its *"each under 80 lines"* claim comfortably true.

Container behaviour: a chart card is a CSS grid cell. The plot's rendered height is a CSS
constant switched by **one container query** (`200px` at ≤520px inline size, `240px`
above), never by a media query, so a card behaves the same in a 1-up phone column and a
3-up desktop grid.

---

## 4. The chart tokens

### 4.1 `src/theme/chart.ts`

```ts
/**
 * The chart palette. A-D9 licenses these hex values and §5.1 of the v0.5.0 roadmap
 * validated every one of them against `#130f22` in dark mode. `chart.palette.test.ts`
 * re-runs the six checks on every `npm test` -- read its header before changing a hex.
 *
 * WHY THIS IS NOT IN `tokens.ts`. JMTarot has ONE accent hue and gold means "a card
 * goes here". One hue cannot carry three readers, three services and two token
 * directions. Keeping the chart palette in its own file also stops a screen reaching
 * for `--chart-cat-2` as a UI colour.
 *
 * DARK MODE IS THE ONLY MODE (roadmap §5.4). Do not add a light variant "for
 * completeness" -- an unvalidated second palette is worse than one mode.
 */
import { color } from './tokens';

/**
 * OPAQUE, AND THAT IS A CONTRAST REQUIREMENT (I-4). `Backdrop` paints a viewport-fixed
 * radial `#221a3a -> #130f22 -> #08060f`, so the colour behind a chart depends on where
 * it sits on SCREEN. `SEVERITY[3]` measures 2.66:1 against `#221a3a` -- below the 3:1
 * mark floor -- and 3.04:1 against this value, a margin of 0.04. Any translucency on a
 * chart panel invalidates the whole validation run.
 */
export const CHART_SURFACE = color.bgRadial[1]; // '#130f22'

/** Fixed order, four slots, NEVER cycled, NEVER indexed by rank. See slotColor. */
export const CATEGORICAL = ['#ab8b20', '#2fa4a0', '#8b7bd8', '#d2707f'] as const;

/** Magnitude. One hue, light -> dark. The DIMMEST step is the one that must clear a
 *  dark canvas (4.02:1) -- the opposite of the light-mode intuition. §5.1 records a
 *  first attempt ending at `#3d3272` that failed at 1.70:1. */
export const SEQUENTIAL = ['#d8cdf7', '#c0b0ee', '#a996e4', '#9382cf', '#7a68b8'] as const;

/** Ordinal severity, one hue, four steps, terminating on the app's one destructive
 *  colour. ADJACENT NORMAL-VISION ΔE IS 7.5, so colour alone may NEVER carry the
 *  state -- icon and word always. §5.2: a four-hue traffic light is unbuildable here. */
export const SEVERITY = ['#e0a49c', '#cd8078', '#b85c52', '#a3423a'] as const;

export const STATUS = { good: '#4f9d6b', critical: '#a3423a' } as const;

/** Two hues + a NEUTRAL GRAY midpoint. The midpoint is BELOW the chroma floor and that
 *  is the requirement, not a defect: the middle must read as "nothing". */
export const DIVERGING = { down: '#2fa4a0', mid: color.label, up: '#a3423a' } as const;

/** De-emphasis, for the `emphasis` form and the meter's empty track. Legal as a MARK
 *  (4.11:1); illegal as tick text (I-12). */
export const DEEMPH = color.label; // '#7a7192'

export const READER_SLOT = { thessaly: 0, margaret: 1, adrian: 2 } as const;
export const SERVICE_SLOT = { daily: 0, spread3: 1, yesno: 2 } as const;
export const DIRECTION_SLOT = { input: 0, output: 1 } as const;
export const OTHER_SLOT = 3;

/** THE ONLY PLACE `CATEGORICAL` IS INDEXED, and `chart.contract.test.ts` asserts it.
 *  Callers pass a slot resolved from one of the maps above, so no code path can colour
 *  a series by its position in an array. That is what makes "colour follows the entity,
 *  never its rank" structural rather than a convention. */
export function slotColor(slot: number): string { /* clamped; throws above 3 */ }
```

`slotColor` **throws** on a slot above 3 rather than wrapping. A modulo is how a fifth
series silently reuses slot 1.

### 4.2 The mirror in `tokens.css`

A4's one edit to a shared file. Added as its own commented block, mirroring `chart.ts`
value for value and inventing nothing.

```css
/* --- Charts (src/theme/chart.ts, v0.5.0 / A4) -------------------------- */
/* OPAQUE. See chart.ts: a translucent panel lets the radial through and
   --chart-sev-4 drops to 2.66:1 against the top stop. */
--chart-surface: #130f22;

--chart-cat-1: #ab8b20;  --chart-cat-2: #2fa4a0;
--chart-cat-3: #8b7bd8;  --chart-cat-4: #d2707f;

--chart-seq-1: #d8cdf7;  --chart-seq-2: #c0b0ee;  --chart-seq-3: #a996e4;
--chart-seq-4: #9382cf;  --chart-seq-5: #7a68b8;

--chart-sev-1: #e0a49c;  --chart-sev-2: #cd8078;
--chart-sev-3: #b85c52;  --chart-sev-4: #a3423a;

--chart-good: #4f9d6b;   --chart-critical: #a3423a;
--chart-div-down: #2fa4a0; --chart-div-mid: #7a7192; --chart-div-up: #a3423a;
--chart-deemph: #7a7192;

/* FURNITURE: NO NEW HEX. The axis rule reuses --card-edge, the pewter hairline whose
   whole job is already "the outermost millimetre" (see tokens.ts); gridlines are the
   same stroke inside a <g opacity="0.5"> so they stay one step more recessive.
   `## Styling` wants a reason for a new value and there was no reason for two. */
--chart-axis: var(--card-edge);
--chart-mark: 8px;   /* marker diameter, >= the 8px floor */
--chart-ring: 2px;   /* surface ring AND stacked-segment gap: ONE consistent width */
--chart-bar: 20px;   /* <= the 24px cap */
--chart-end: 4px;    /* rounded data-end */
```

### 4.3 The validation run, reproducible

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
V=tools/dataviz/validate_palette.js

# 1. Categorical, adjacent -- the pairlist for stacks, bars and lines.
node $V "#ab8b20,#2fa4a0,#8b7bd8,#d2707f" --mode dark --surface "#130f22"
#   [PASS] Lightness band        all 4 inside L 0.48-0.67
#   [PASS] Chroma floor          all 4 >= 0.1
#   [PASS] CVD separation        worst adjacent #8b7bd8<->#2fa4a0 dE 10.5 (deutan) · tritan 10.2
#   [PASS] Normal-vision floor   worst adjacent #d2707f<->#8b7bd8 dE 17.2 (normal)
#   [PASS] Contrast vs surface   all 4 >= 3:1
#   -> ALL CHECKS PASS   EXIT=0

# 2. Categorical, all pairs -- A WARN, AND THE RUN STILL PASSES (§1.3).
node $V "#ab8b20,#2fa4a0,#8b7bd8,#d2707f" --mode dark --surface "#130f22" --pairs all
#   [WARN] CVD separation        worst all-pairs #d2707f<->#2fa4a0 dE 6.5 (deutan) · tritan 8.4
#   [PASS] Normal-vision floor   worst all-pairs #d2707f<->#ab8b20 dE 15.8 (normal)
#   -> ALL CHECKS PASS   EXIT=0
#   Consequence: NO all-pairs form ships (no scatter, no bubble, no small multiples).

# 3. Sequential -- `--ordinal`, NOT the categorical six (§1.1).
node $V "#d8cdf7,#c0b0ee,#a996e4,#9382cf,#7a68b8" --mode dark --surface "#130f22" --ordinal
#   [PASS] Lightness monotone    steps read light->dark
#   [PASS] Adjacent dL           all gaps >= 0.06
#   [PASS] Light-end contrast    #7a68b8 at 4.02:1 vs surface
#   [PASS] Single hue            hue spread 5deg
#   -> ALL CHECKS PASS   EXIT=0
#   Bare (no --ordinal) this EXITS 1 with three FAILs. That is by design.

# 4. Severity -- ordinal, four steps, terminating on color.danger.
node $V "#e0a49c,#cd8078,#b85c52,#a3423a" --mode dark --surface "#130f22" --ordinal
#   [PASS] Lightness monotone / Adjacent dL / Single hue (spread 1deg)
#   [PASS] Light-end contrast    #a3423a at 3.04:1 vs surface
#   -> ALL CHECKS PASS   EXIT=0

# 5. Binary status.
node $V "#4f9d6b,#a3423a" --mode dark --surface "#130f22"
#   [PASS] CVD separation        dE 11.8 (deutan) · tritan 28.2
#   [PASS] Normal-vision floor   dE 24.7 (normal)
#   -> ALL CHECKS PASS   EXIT=0

# 6. Diverging -- THE POLES ONLY (§1.2). The trio FAILS the chroma floor on the
#    neutral midpoint, which is the requirement.
node $V "#2fa4a0,#a3423a" --mode dark --surface "#130f22"
#   [PASS] Normal-vision floor   dE 27.2 (normal) · deutan 16.4
#   -> ALL CHECKS PASS   EXIT=0
node $V "#2fa4a0,#7a7192,#a3423a" --mode dark --surface "#130f22"
#   [FAIL] Chroma floor          below floor (reads gray): [["#7a7192",0.051]]   EXIT=1

# 7. §5.2's negative finding, re-measured. Each of these is a HARD FAIL and the test
#    asserts it, so "adding a warning colour" fails a test that names the number.
node $V "#ab8b20,#d4813c" --mode dark --surface "#130f22"   # dE 8.0 normal / 2.3 protan
node $V "#ab8b20,#4f9d6b" --mode dark --surface "#130f22"   # dE 12.3 normal
node $V "#a3423a,#c2703f" --mode dark --surface "#130f22"   # dE 12.9 normal
node $V "#c9a227,#2fa4a0" --mode dark --surface "#130f22"   # token gold: L 0.728, out of band
```

---

## 5. The component catalogue

`series` everywhere is `{ key: string; slot: number; label: string; values: (number|null)[] }[]`.
`slot` is resolved by the *caller* from `READER_SLOT` / `SERVICE_SLOT` / `DIRECTION_SLOT`
/ `OTHER_SLOT` (I-5). Every component below is a **server** component except
`ChartHover`.

### 5.1 The frame

| | |
|---|---|
| **`ChartFrame`** | `{ title, subtitle?, series, table, footnote?, children }` |
| Geometry | `<figure>` on an **opaque** `--chart-surface` panel, `border-radius: 10px` (`--radius-card`), `padding: 16px`, `border: 1px solid var(--card-edge)`. **The height includes the x-axis band** — the container grows with its content, never a fixed height that excludes the axis (`anti-patterns.md`'s nested-scroll failure). |
| Marks | none |
| Client layer | no |
| Rules | Renders `Legend` **iff `series.length >= 2`** — the only place in the repo that does (I-9). `table` is **required** (I-13). `title` is the only place a single series is named. |

| | |
|---|---|
| **`Legend`** | `{ series, mark: 'rect' \| 'line' }` |
| Geometry | flex row, `gap: 6px 16px`, wraps. Swatch **mirrors the mark**: a `10×10` div at `border-radius: 2px` for bars/areas/heat; a `12×2` rule for lines. Label `--muted`, 11px Cinzel, uppercase, `--ls-button`. |
| Rules | Text never wears the series colour (I-11). No toggle-to-isolate: that needs a client component and I-17 caps the count at one. |

| | |
|---|---|
| **`TableView`** | `{ caption, columns, rows }` |
| Geometry | `<details><summary>` + `<table>`. `<caption>` = the chart title. Numeric cells `font-variant-numeric: tabular-nums`, right-aligned; headers `--muted`; values `--text`. Wide tables scroll inside their own `overflow-x: auto`, never the page. |
| Rules | Zero JavaScript — `<details>` **is** the toggle. |

| | |
|---|---|
| **`Axis`** (`AxisX`, `AxisY`) | `{ ticks: { at: number; label: string }[] }` |
| Geometry | HTML, absolutely positioned by percent in the plot's coordinate space. Rule: `1px solid var(--chart-axis)`, **solid, never dashed**. Ticks `--muted`, 11px, `tabular-nums`. |
| Rules | `niceTicks()` rounds to clean numbers, thousands-separated `id-ID`. Y-axis always includes 0 (I-8). |

### 5.2 The SVG four

| | |
|---|---|
| **`Line`** | `{ series, yMax, xLabels, emphasis?: string }` |
| Geometry | `<svg viewBox="0 0 1000 1000" preserveAspectRatio="none">`, CSS height `200px` / `240px` above a 520px container. `x = i/(n-1)*1000`, `y = 1000 - v/yMax*1000`. |
| Marks | **`stroke-width: 2` with `vector-effect="non-scaling-stroke"`**, `stroke-linejoin/linecap: round`. End-dots are **HTML**: `8px` (`--chart-mark`), `box-shadow: 0 0 0 2px var(--chart-surface)` (the surface ring), inside a `24px` transparent hit area. Direct end-label per series, `--text`, with a **leader line** when ends converge — never stacked labels nudged apart. |
| Client layer | **yes** — `ChartHover` for the crosshair. |
| Rules | **ONE y-domain prop and one only** (I-7). A `null` value is a genuine gap in the path (`M`, not `L`); it is not interpolated, because interpolation invents data. |

| | |
|---|---|
| **`Area`** | `{ series, yMax, xLabels }` — **exactly one series, enforced by the type** |
| Geometry | `Line`'s path plus a polygon closed to the baseline. |
| Marks | fill = the series hue at **10% opacity**, a wash. The band edge is the 2px line. |
| Rules | Stacked area is **deferred**: four hues at 10% opacity over one another is mud, and part-to-whole is `StackedBar`'s job. A single-series type parameter is what stops it arriving by accident. |

| | |
|---|---|
| **`Sparkline`** | `{ values, slot, points?: 12 }` |
| Geometry | `viewBox="0 0 240 48"`, `preserveAspectRatio="none"`, CSS `height: 24px`. No axis, no label, no tooltip. |
| Marks | the full path in `DEEMPH`; the **last segment and the end-dot** in `slotColor(slot)`. 2px non-scaling stroke. |
| Rules | Twelve points. Its values are in the parent tile's table row, so it gates nothing. |

| | |
|---|---|
| **`Trajectory`** | `{ actual, forecast, ceiling, xLabels, copy }` where `forecast` is A3's discriminated union |
| Geometry | `Line`'s box. Three layers: the actual series (2px solid, `SEQUENTIAL[4]`); the residual band as a **polygon at 10% opacity**; the projection as a **dashed** 2px path (`stroke-dasharray: 6 5`). A horizontal `ceiling` rule in `SEVERITY[3]`, solid, labelled. |
| Rules | **Never a point estimate without its band and its `n`** (A-D8) — the band and `n` are required props, not optional. On `forecast.kind === 'insufficient'` it renders **the empty state and no line at all**, saying how many more days it needs (the M14 precedent: *a deck rendering two panels with the second one blank IS the empty state*). Dashing here is correct and is §1.9's note. |

### 5.3 The CSS charts

| | |
|---|---|
| **`StackedBar`** | `{ rows: { label, segments: { key, slot, value }[] }[], total, copy }` |
| Geometry | **Horizontal only** — long names (`translation_repair`, `Margaret Thornbury`) are why. CSS grid `[label max-content, capped 40%] [bar 1fr] [value max-content]`. Bar row `display: flex; gap: 2px; height: 20px` (`--chart-bar`, under the 24px cap; the band's leftover is air, never a filled slot). |
| Marks | Each segment `flex: 0 0 <pct>%`. **Only the last segment carries `border-radius: 0 4px 4px 0`**; the baseline end is square. The `2px` flex gap **is** the surface gap — one consistent width across the stack, and no border is ever drawn around a segment. |
| Rules | **No in-segment labels, ever.** Four segments at 320px will not fit text with padding, and `overflow: hidden` cropping characters is worse than no label. The legend, the per-segment readout and the table view carry it. `stackSegments()` computes to 4dp and **gives the last segment the remainder**, so the stack always closes — a naive round leaves a sub-pixel surface sliver at the end that reads as a fifth category. |

| | |
|---|---|
| **`Meter`** | `{ used, ceiling, thresholds, icon, stateLabel, copy }` |
| Geometry | CSS. Track `height: 12px`, `border-radius: 6px`, fill inset. |
| Marks | Track = `DEEMPH`. Fill = `STATUS.good` below the first threshold, then `SEVERITY[1..3]`. §1.8 is the departure from §5.3's "same-hue track" and its reason. |
| Rules | **An icon and a word are mandatory and colour never carries the state alone** — the severity ramp's adjacent normal-vision ΔE is 7.5. The used/ceiling pair is rendered as text beside it, so the ratio is readable with no colour at all. |

| | |
|---|---|
| **`Heatmap`** | `{ cells: { row, col, value }[], rows, cols, domain, copy }` |
| Geometry | CSS grid, `gap: 2px`, `aspect-ratio: 1` per cell. **7 columns × 24 rows at ≤520px inline size** (39px cells at 320 — a real hit target) and **24 × 7 above it**, switched by one container query. |
| Marks | `SEQUENTIAL[bucketFor(value, domain)]`, five buckets. **`value === 0` is the surface with a `1px var(--chart-axis)` outline, never `SEQUENTIAL[0]`** — an empty cell painted the lowest bucket claims data. |
| Client layer | no — each cell is a `<button>` with a CSS `:hover`/`:focus-visible` readout. |
| Rules | `ScaleLegend` is **required** beside it (a sequential scale with no legend is colour-only encoding on a continuous scale). |

| | |
|---|---|
| **`ScaleLegend`** | `{ min, max, copy }` — five swatches plus both bounds |

### 5.4 The figures

| | |
|---|---|
| **`StatTile`** | `{ label, value, unit?, delta?, trend?, note? }` |
| Geometry | label (`--muted`, 11px Cinzel, uppercase, `--ls-button`, sentence case, **no trailing colon**) · value (Cinzel 28px, `--gold-text`, **proportional figures**) · delta · 24px sparkline. |
| Rules | **The delta's colour lives on the `↑`/`↓` glyph only**; the number is `--text` (I-11: `#a3423a` is 3.04:1, a legal mark and illegal text). Delta is signed and names its period. `note` is where an unpriced-call count rides (§6.1). |

| | |
|---|---|
| **`KpiRow`** | `{ children }` — `grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))`, `gap: 12px`. One column at 320, five at 1440. |

| | |
|---|---|
| **`Hero`** | `{ value, label, sub? }` — **≥48px, Cinzel, proportional figures, exactly one per view.** §1.10 is the departure from "the same sans" and its reason. |

| | |
|---|---|
| **`ChartError`** | `{ message }` — the stated failure state I-24 requires. Renders inside the frame so the card keeps its height. |
| **`ChartSkeleton`** | `{ height, label }` — reserves the **exact** height; no pulse under `html[data-still]`. |

### 5.5 The one client component

| | |
|---|---|
| **`ChartHover`** | `'use client'`. `{ points: { x: number; y: number }[][], rows: (i: number) => Readout, children }` |
| Behaviour | `pointermove` → nearest x **index** (the crosshair finds the X; a reader aims at a date, never at a 2px line) → an absolutely positioned 1px hairline in `--chart-axis` plus **one readout listing every series at that x**. `tabindex=0`; `ArrowLeft`/`ArrowRight` step the index and render the identical readout — **the same details on focus as on hover**. `Escape` clears. |
| Rules | Takes **already-computed percentage geometry as props** and computes no scale of its own — so the hairline can never disagree with the marks. Readout rows key their series with a **short stroke** of the series colour, not a filled box; **values lead and labels follow** (the legend's hierarchy inverted, because here the reader has the series and wants the number). No `dangerouslySetInnerHTML` (I-18). No `process.env`, no `@/lib/db/**`, no `@/lib/i18n/**`. |

---

## 6. Form → job, for every chart on both pages

Chosen before the colours, per `choosing-a-form.md`. **Every row names the *job*, and
three rows are deliberately *not* a chart.**

### 6.1 `/admin` — "is anything wrong right now"

| # | What the operator must learn | Form | Series | Colour job | Legend? |
|---|---|---|---|---|---|
| 0 | *(filter)* which range am I looking at | `RangeFilter`, one row, presets first | — | — | — |
| 1 | **How close is the app to key revocation** | `Hero` + `Meter` in one card | 1 | good→severity + icon + word | no |
| 2 | The five headline numbers | `KpiRow` of 5 `StatTile`s | 1 ea | 1 categorical (slot 1) | no |
| 3 | Model calls per day, and the shape | `Area` (1 series) | 1 | 1 categorical | **no** — the title names it |
| 4 | Which service is consuming the calls | `StackedBar`, horizontal | 3 | categorical, no fold needed | **yes** |
| 5 | Which reader is consuming the calls | `StackedBar`, horizontal | 3 | categorical, no fold needed | **yes** |
| 6 | How calls are ending | **`TableView` alone** — five statuses, no fifth hue (§1.6) | — | none | — |

**The hero figure is calls-in-window, not spend.** §7 is the argument. Its `sub` line
carries `238 / 280` and the percentage; the `Meter` directly beneath is the same fact as a
ratio against its limit, which is the form `choosing-a-form.md` prescribes.

The five KPI tiles: **notional spend** (with `note` = the unpriced-call count) · total
model calls · total tokens (input + output) · readings completed · p95 `total_ms` for
`op = 'reading'`. Each with a delta against the previous equal-length period and a
12-point sparkline.

**Every cost figure carries its unpriced count, enforced by the type** (A-D7: *a cost is
never quoted over an incomplete denominator*). `metrics.ts` returns
`{ usd: number | null; unpricedCalls: number }` as one required object, so a caller cannot
render the dollar figure and forget the caveat, and `usd: null` renders the word
`belum berharga` rather than `0`.

### 6.2 `/admin/tokens` — "where is this going"

| # | What the operator must learn | Form | Series | Colour job | Legend? |
|---|---|---|---|---|---|
| 0 | *(filter)* the same row, the same param | `RangeFilter` | — | — | — |
| 1 | **Input against output over time** | `Line`, **two series, ONE axis** (they share a unit) | 2 | 2 categorical, direct-labelled | **yes** |
| 2 | When do we hit the ceiling | `Trajectory` — line + band + dashed projection + `n` | 1 | 1 hue + gray | no |
| 3 | Which purpose costs what | **`TableView` with an inline bar column** — nine `op` values (§1.5) | — | sequential, one hue | — |
| 4 | Which users cost the most | **`TableView`, top 10, inline bar** — id prefix + link, no email (§1.11) | — | sequential, one hue | — |
| 5 | When is the app busy | `Heatmap`, weekday × hour, `Jam (WIB)` (§1.7) | — | sequential + `ScaleLegend` | — |

**No hero figure on `/admin/tokens`** — the trajectory is its lead, and `Hero` is *exactly
one per view*.

### 6.3 What is deliberately absent

- **No pie, no donut** (I-14). §5.3 offers a donut for one ratio in a stat tile; declined,
  because that ratio is the meter and there is already a meter.
- **No scatter, no bubble, no small multiples** — the `--pairs all` WARN caps those forms
  at three series and A4 has no job for them (§1.3).
- **No stacked area.** Part-to-whole is the stacked bar's job.
- **No dual axis, anywhere, once** (I-7). Tokens against cost would be the tempting one;
  it is two cards.
- **No value-ramp on nominal categories.** `op`, `reader` and `service` have no natural
  order, so their bars take slots, never darker-where-bigger. The inline bar in a table is
  a *length* encoding in one hue, which is a different thing.

---

## 7. Ruling on §12.5 — spend or call count?

**Call count, and specifically calls-in-window against the 280 ceiling. Notional spend is
demoted to KPI tile 1.** Five reasons.

1. **A headline number should be the one that can hurt you, and spend cannot.** A-D7:
   z.ai is a fixed annual subscription and *"its marginal cost per token is genuinely
   zero."* A notional dollar figure is a counterfactual — what these calls would cost at a
   provider we are not using. Nothing bad happens when it rises.
2. **The roadmap's own thesis names the risk and the risk is a count.** §1: *"the risk V9
   named is quota exhaustion, a denial of service against the querent with no billing alert
   attached, and the comedown is worse: enforcement means key revocation, which takes the
   whole app down at once."* Both failure modes are metered in **model calls per rolling
   five hours**. `LLM_WINDOW_CALL_CEILING=280` is the enforcement and it is a count.
3. **A headline number needs a denominator.** `238 / 280` tells you whether you are fine.
   `$4.20` does not, because there is no number it is being compared to.
4. **A notional figure at the top of the only operator screen will be read as a bill** —
   by Miftah in six months, and by anyone he shows it to. A-D7 already requires it be
   labelled *notional* **and** carry the unpriced-call count beside it. A hero figure that
   needs two disclaimers is not a hero figure; it is a tile.
5. **It fixes the form, too.** `choosing-a-form.md` gives *a single ratio against a limit*
   to the meter. Spend has no limit, so a hero figure of spend has no band and no ceiling
   and cannot be wrong-looking. Calls-in-window has both.

**This is Miftah's call and the swap is one line**, because the hero and the tile are the
same two primitives: move `notionalSpend` into `Hero` and `windowCalls` into a
`StatTile`. Recorded here so the reversal is cheap rather than argued twice.

---

## 8. File map

```
NEW — the tokens and their test
  src/theme/chart.ts                  PURE. Palette, slot maps, slotColor(). §4.1.
  src/theme/chart.palette.test.ts     The six checks + §5.2's negatives + the I-4 control.
  tools/dataviz/validate_palette.js   VENDORED VERBATIM from the dataviz skill, dev-only,
                                      imported by that one test. I-22 is the argument.

MODIFIED — A4's one shared file (roadmap §6)
  src/theme/tokens.css                Mirror only. `tokens.ts` untouched. §4.2.

NEW — src/components/chart/
  ChartFrame.tsx / .module.css        <figure>, opaque panel, legend gate, table slot.
  Legend.tsx                          rect | line-key swatches.
  TableView.tsx                       <details><table>, tabular-nums, own overflow-x.
  Axis.tsx                            AxisX / AxisY. HTML ticks by percent.
  Line.tsx                            SVG path + HTML markers + direct end labels.
  Area.tsx                            Line + closing polygon at 10%. ONE series, by type.
  Sparkline.tsx                       240x48, 24px tall, deemph + accent tail.
  Trajectory.tsx                      Actual + band + dashed projection + n; empty state.
  StackedBar.tsx                      CSS flex rows, horizontal only, 2px gap.
  Meter.tsx                           CSS. good -> severity, icon + word mandatory.
  Heatmap.tsx                         CSS grid. 7x24 phone / 24x7 desktop.
  ScaleLegend.tsx                     Required beside Heatmap.
  StatTile.tsx                        label/value/delta/sparkline. Colour on the glyph.
  KpiRow.tsx                          auto-fit minmax(150px, 1fr).
  Hero.tsx                            >= 48px Cinzel, one per view.
  ChartError.tsx                      I-24's stated failure state.
  ChartSkeleton.tsx                   Exact height, no pulse under [data-still].
  ChartHover.tsx / .module.css        'use client'. THE ONLY ONE (I-17).
  geometry.ts                         PURE. linePath, areaPath, stackSegments, bucketFor,
                                      niceTicks, scaleY, nearestIndex.
  geometry.test.ts
  types.ts                            The view shapes. No db import, not even `import type`.
  chart.contract.test.ts              The fences: one client file, no CATEGORICAL[ outside
                                      slotColor, no dangerouslySetInnerHTML, no process.env,
                                      no @/lib/db, no @/lib/i18n, no long string literals,
                                      Legend imported once, table non-optional, no
                                      pie/donut/scatter/bubble file.
  noDualAxis.test.ts                  The vocabulary grep + one-y-domain-prop check.
  entityColor.test.ts                 Filter to two readers; slots unchanged.

NEW — src/app/admin/   (A1 owns layout.tsx, the shell, error.tsx, loading.tsx and metadata)
  page.tsx / page.module.css          The overview. §6.1.
  tokens/page.tsx / page.module.css   Consumption + trajectory. §6.2.
  RangeFilter.tsx / .module.css       SERVER. <form method="get"> presets. One row.
  range.ts + range.test.ts            PURE. Parse/clamp/default the range from searchParams.
  metrics.ts + metrics.test.ts        PURE adapter: A3 rows -> chart props. The ONE file an
                                      A3 shape change touches.
  format.ts + format.test.ts          PURE. Intl.NumberFormat('id-ID'), compact + tabular.
  copy.ts                             The Indonesian strings for both pages. Hardcoded,
                                      never the catalog (A-D12).
  adminCopy.test.ts                   The t()-absence and LocaleSwitch-absence greps.
  admin.contract.test.ts              runtime / maxDuration / requireAdmin / notFound.
  deps.contract.test.ts               Task 1's blocking precondition check.

NEW — the loops
  tools/seo/chartfit.sh               Loop 4. galleryfit's shape exactly.
  tools/seo/chartfit.js               The measurement. A FILE, not a heredoc -- see
                                      galleryfit.js's header for the three-minute hang.
  public/cards/_adminshot.html        GITIGNORED. Loop 3 at 1440. Plants a dev session,
                                      iframes /admin at width 1440.
  public/cards/_adminfit.html         GITIGNORED. Loop 4's session planter.
```

---

## 9. The tasks

Each task states its acceptance criteria. `export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH`
before every npm/node call; `npm run build` before believing a green typecheck.

### Task 1 — The blocking precondition check
`src/app/admin/deps.contract.test.ts`. Assert the A1 and A3 surfaces A4 imports exist by
name: `requireAdmin` from `@/lib/admin/identity`, `src/app/admin/layout.tsx`, the A3 query
module `@/lib/db/queries/admin/metrics`, and `@/lib/analytics/forecast`. Fail with a
message naming the workstream, not a module-not-found stack.
**Also measure and record, either way:** `tools/e2e/run.sh launch --width 1440` then
`run.sh eval 'JSON.stringify({inner: innerWidth, outer: outerWidth})'`. CLAUDE.md says
*both are 500 whatever `--width` says*, a claim made from **narrow** measurements; a floor
at 500 would not clamp 1440 down. If it reports 1440, the project has gained a desktop
loop 5 and CLAUDE.md's sentence needs narrowing to "below 500" — record the number in
`docs/workstream-notes.md` under A4 regardless of the answer.
**Accept:** the test fails loudly with named workstreams when run before A1/A3 land; the
width measurement is written down.

### Task 2 — Vendor the validator
Copy the skill's `validate_palette.js` **byte-for-byte** to
`tools/dataviz/validate_palette.js` and prepend a provenance header: where it came from,
the skill version, the date, and I-22's argument for vendoring rather than shelling out or
re-typing. Do not reformat it; do not "tidy" the matrices.
**Accept:** `node tools/dataviz/validate_palette.js "#ab8b20,#2fa4a0,#8b7bd8,#d2707f"
--mode dark --surface "#130f22"` reproduces §4.3 run 1 exactly. `package.json` unchanged.

### Task 3 — `src/theme/chart.ts`
§4.1, verbatim, comments included. `slotColor` **throws** above slot 3.
**Accept:** `npm run typecheck` green. `CHART_SURFACE === color.bgRadial[1]` and
`DIVERGING.mid === color.label` hold by construction, not by a literal.

### Task 4 — `chart.palette.test.ts`, the six checks and the negatives
Import `validate`, `validateOrdinal`, `contrast` from the vendored file. Assert, each as
its own `it()` with the measured numbers pinned to a tolerance:
1. categorical adjacent — no FAIL, worst adjacent ≥ 8 (10.5), normal floor ≥ 15 (17.2);
2. categorical `--pairs all` — **no FAIL, and worst all-pairs < 8 (6.5)**, i.e. a WARN, and
   the consequence asserted: no scatter/bubble/small-multiple file exists (§1.3);
3. sequential — `validateOrdinal` passes; **and the categorical validator FAILS on it, on
   purpose, with the comment saying so** (§1.1);
4. severity — `validateOrdinal` passes; `SEVERITY[3] === color.danger`;
5. binary status — categorical passes, ΔE 24.7;
6. diverging — **the poles pass at 27.2** and the midpoint is asserted **below** the chroma
   floor, with the reason (§1.2).
Plus: `CHART_SURFACE === color.bgRadial[1]`; `contrast(SEVERITY[3], CHART_SURFACE) >= 3`
(3.04, pinned — the margin is 0.04); **the I-4 negative control**
`contrast(SEVERITY[3], color.bgRadial[0]) < 3` (2.66) with a comment naming the opaque-panel
requirement; `contrast(color.label, CHART_SURFACE) < 4.5` as the reason I-12 exists; and
§5.2's three pairs each asserted to FAIL, so "adding a warning colour" fails a test that
names the number. Finally, read the vendored source and assert its five thresholds and the
dark band (I-22).
**Accept:** `npm test -- chart.palette` green. Nudge one categorical hex by two hex digits
and watch a *named* check go red — record which, as the harness's negative control.

### Task 5 — Mirror into `tokens.css`
§4.2. A4's only edit to a shared file. Every value has a counterpart in `chart.ts`; nothing
is invented; the furniture block reuses `--card-edge` and explains why there is no new hex.
**Accept:** a grep confirms every `--chart-*` hex appears in `chart.ts`. `tokens.ts` shows
no diff.

### Task 6 — `geometry.ts` + tests
`linePath` (a `null` starts a new subpath — a gap, never an interpolation), `areaPath`,
`stackSegments` (4dp, **last segment takes the remainder** so a stack always closes),
`bucketFor` (five buckets; **`0` returns `null`**, meaning empty, not lowest), `niceTicks`,
`scaleY` (**domain always includes 0**), `nearestIndex`.
**Accept:** `stackSegments` output sums to exactly 100 for adversarial inputs
(`[1,1,1]`, `[0,0,100]`, `[33.333,33.333,33.334]`). `bucketFor(0, …) === null`.
`linePath([1,null,3])` contains two `M` commands.

### Task 7 — `ChartFrame`, `Legend`, `TableView`, `Axis`
§5.1. `table` non-optional. `Legend` imported by `ChartFrame` and nothing else.
**Accept:** a 1-series frame renders no `<ul class=legend>`; a 2-series frame does. A frame
constructed without `table` is a **type error**.

### Task 8 — `Line`, `Area`, `Sparkline`
§5.2, §3's architecture. `preserveAspectRatio="none"`, `vector-effect="non-scaling-stroke"`,
markers and every label in HTML, no `<text>` element anywhere.
**Accept:** grep `src/components/chart/**` for `<text` — zero hits. `Area`'s props type
rejects a two-element `series` array at compile time.

### Task 9 — `StackedBar`
§5.3. Horizontal only. 20px rows, 2px flex gap, `border-radius` on the last segment only,
no in-segment label, label column capped at 40% and never clipped.
**Accept:** at a 288px content box the label column does not overflow
(`scrollWidth <= clientWidth`) — Task 17 measures it.

### Task 10 — `Meter`
§5.3 and §1.8. `DEEMPH` track, `STATUS.good` → `SEVERITY[1..3]` fill, **icon and word
required props**, used/ceiling as text beside it.
**Accept:** rendering at 0%, 65%, 80%, 90% and 100% produces five distinct
`(fill, icon, word)` triples, and the word alone is sufficient to read the state with CSS
colour stripped.

### Task 11 — `StatTile`, `KpiRow`, `Hero`, `Sparkline` integration
§5.4. Proportional figures on `Hero` and tile values; `tabular-nums` nowhere near them.
Delta colour on the glyph only.
**Accept:** grep the module CSS — `tabular-nums` appears only in `TableView.module.css` and
`Axis.module.css`. `Hero`'s `font-size` is ≥ 48px.

### Task 12 — `Trajectory`
§5.2. Band and `n` required. On `{ kind: 'insufficient' }` it renders the empty state and
**no line**.
**Accept:** `insufficient` renders zero `<path>` elements and a sentence naming the number
of days still needed. A degenerate actual series (one point, all zeros) renders without
throwing.

### Task 13 — `Heatmap` + `ScaleLegend`
§5.3 and §1.7. `Jam (WIB)` on the axis, with the §1.7 reason in the file header.
`value === 0` is an outlined empty cell.
**Accept:** at a 288px content box the phone orientation gives 7 columns and ~39px cells;
above 520px it gives 24 × 7. `ScaleLegend` is a required child, not an optional one.

### Task 14 — `ChartHover`
§5.5. The **only** `'use client'` file here. Percentage geometry as props. Keyboard parity.
**Accept:** `ArrowRight` and `pointermove` produce byte-identical readout DOM.
`chart.contract.test.ts`'s single-client-file assertion passes.

### Task 15 — `ChartError`, `ChartSkeleton`, and the fences
`chart.contract.test.ts`, `noDualAxis.test.ts`, `entityColor.test.ts`. The full list is in
§8's file map; `noDualAxis` states in its header that it is a grep and what a grep can and
cannot prove.
**Accept:** each fence has been seen RED once, deliberately: add `y2` to a chart's props and
`noDualAxis` fails; add a second `'use client'` and the contract test names the file; index
`CATEGORICAL` outside `slotColor` and it fails; import `@/lib/db/schema` as `import type`
and it **still** fails.

### Task 16 — `range.ts`, `format.ts`, `metrics.ts`, `copy.ts`
The pure layer between A3 and the charts. `range.ts` clamps and defaults from
`searchParams` **on the server**, never from `new Date()` in a render. `metrics.ts` does the
top-3 + Other fold, returns `{ usd, unpricedCalls }` as one object, and **asserts A3's
daily series is dense** (one row per day in range) — returning a `ChartError` shape rather
than filling gaps, because filling a gap invents data.
**Accept:** `metrics.test.ts` covers a sparse A3 series (error, not silent fill), an
all-`null` token series, a nine-value `op` list (no fold — it is a table), and a
`usd: null` cost.

### Task 17 — `/admin`
§6.1. `requireAdmin()` → `notFound()`. `export const runtime = 'nodejs'`,
`export const maxDuration = 30`. Per-card `<Suspense>` with `ChartSkeleton`. `RangeFilter`
in one row above everything. `track('admin.page_viewed', { page: 'overview' })`, never
awaited.
**Accept:** `admin.contract.test.ts` asserts both exports by source
(`route.contract.test.ts`'s shape), that `requireAdmin` is called and `notFound()` is the
refusal, and that `t(`/`useT`/`getT`/`LocaleSwitch` appear nowhere.

### Task 18 — `/admin/tokens`
§6.2. Same route rules. Same `RangeFilter`, same search param, so the two pages cannot
disagree about the range.
**Accept:** as Task 17. Exactly zero `Hero` on this page and exactly one on `/admin`.

### Task 19 — `adminCopy.test.ts`
Grep `src/app/admin/**` and `src/components/chart/**` for `t(`, `useT`, `getT`, `tFor`,
`@/lib/i18n/`, `LocaleProvider`, `LocaleSwitch`. Plus a **not-vacuous** guard (file count
> 0, the `clientBoundary.test.ts` precedent). Plus I-16's string-literal length fence over
`src/components/chart/**`, single-line bound (see `types.contract.test.ts`'s header for why
a newline in that regex broke the first draft).
**Accept:** green; and red when `useT()` is added to any admin file.

### Task 20 — Loop 4: `tools/seo/chartfit.sh` + `chartfit.js`
`galleryfit`'s shape exactly — the JS in a **file**, `sed __WIDTH__`, one `eval`, and a
header recording why it is not a heredoc. `_adminfit.html` plants the dev session
(`POST /api/auth/dev-session` with `username: 'miftah'`; `ADMIN_EMAILS` must contain
`miftah@dev.local` locally, which the plan states as a precondition and `.env.example`
already documents as A1's variable). Measured at 320/360/390 on both pages: no element
under the card grid overflows; the KPI row is 1 column at 320; every bar row is ≤24px and
the meter 12px; every interactive target is ≥44px tall; every tick's rendered
`font-size` ≥ 11px; the stacked-bar label column does not clip; the heatmap is 7 columns
with cells ≥ 36px.
**Accept:** the numbers are printed, and **the negative control is run and recorded** — put
`min-width: 200px` on the KPI tile and confirm overflow goes true at 320 with the offender
named. Check `getComputedStyle(tile).minWidth` first: `galleryfit.sh`'s header records a
control that did nothing because a later `min-width: 0` won.

### Task 21 — Loop 3 at 1440: `public/cards/_adminshot.html`
Plants the dev session, then iframes `/admin` at `width: 1440px` inside a 1440-wide window,
killing animations before the capture (`_accountshot.html`'s ruling: measure the resting
state, do not wait for an animation that headless Chrome will not advance). Then:

```sh
PORT=3001 tools/shot.sh '/cards/_adminshot.html?page=overview' 1440 1600 /tmp/admin-1440.png
PORT=3001 tools/shot.sh '/cards/_adminshot.html?page=tokens'   1440 1600 /tmp/tokens-1440.png
PORT=3001 tools/shot.sh '/cards/_adminshot.html?page=overview&w=390' 500 1400 /tmp/admin-390.png
```

`tools/shot.sh`'s ~500px clamp is a **minimum**, so 1440 is honoured; the 390 shot is for
*looking*, and loop 4 is what measures it.
**Accept:** **the 1440 PNGs are actually opened and read**, and a note goes into
`docs/workstream-notes.md` saying what was wrong at 1440 and what was changed. §0.5 and
§12.7 are explicit that *nobody has looked at this dashboard on a screen*, and this is the
only task in the release that discharges it.

### Task 22 — Record, and hand off
`docs/workstream-notes.md` gains an A4 section: the eleven §1 defects with their
measurements, the §3 architecture derivation, the loop-4 numbers, the 1440 findings, the
Task 1 width measurement, and the seams §10 lists. **Nothing new goes into `CLAUDE.md`** —
non-negotiable 12.

---

## 10. The seams A4 hands back

Both pages are consumers, so these are stated as **requirements on A3 and A1**, not
proposals.

**From A3, in `src/lib/db/queries/admin/metrics.ts` (handle first, always):**

1. `dailySeries(db, { from, to })` → `{ localDate: string; calls: number; inputTokens: number|null; outputTokens: number|null; unpricedCalls: number }[]`, **dense: one row per calendar day in range including zeros**, bucketed on `local_date` (never on `created_at` in the server's zone). A4 will not fill gaps — filling a gap invents data — so a sparse series renders `ChartError`.
2. `groupedTotals(db, { from, to, dimension })` for `dimension ∈ 'op' | 'reader' | 'service' | 'status' | 'model'` → `{ key: string; calls: number; inputTokens: number|null; outputTokens: number|null; notionalUsd: number|null; unpricedCalls: number }[]`, **sorted descending by `calls` and NOT pre-folded** — the top-3 + Other fold is a palette decision and lives in `metrics.ts`. `key` for `reader`/`service` must be the bare slug (`thessaly`, `spread3`), because those slugs are the keys of `READER_SLOT` / `SERVICE_SLOT`.
3. `windowCalls(db)` → `{ calls: number; ceiling: number; windowSeconds: number }`. **`ceiling` is read from `LLM_WINDOW_CALL_CEILING` by A3**, because I-15 forbids `process.env` in a chart component and a hardcoded 280 in a `.tsx` is the number that goes stale.
4. `heatCells(db, { from, to })` → `{ weekday: 0..6; hour: 0..23; readings: number }[]`, weekday from `local_date`, hour from `created_at AT TIME ZONE 'Asia/Jakarta'` — **§1.7 is a reconciliation question and if it goes the other way, `heatCells` and Task 13 are deleted together.**
5. `topUsers(db, { from, to, limit })` → `{ userId: string; calls: number; tokens: number|null; notionalUsd: number|null; unpricedCalls: number }[]`. **No email, no nickname, no `worst_thing`** — identity display is A5's audited surface (§1.11).
6. Every one of the above needs an **integration** test calling `.getTime()` / `typeof` on its aggregates. `sql<T>` is an assertion the driver is not obliged to honour, and `answersUpdatedAt` proves a green typecheck and a green unit suite can both be wrong.
7. **A stated query timeout and a typed thrown error**, so A4 can render `ChartError` instead of 500ing a card (§4.2's client-side bound).

**From A3, in `src/lib/analytics/forecast.ts`:** a discriminated union,
`{ kind: 'ok'; points: {at:number; lo:number; hi:number; mid:number}[]; n: number } | { kind: 'insufficient'; n: number; need: number }`. A4 renders the empty state on the
second and **never a line without its band** (A-D8).

**From A2:** nothing at runtime. `notionalUsd` is computed by A3 from `prices.ts` at read
time (A-D7); A4 never sees a model string in an arithmetic context.

**From A1:** `requireAdmin()`; the `/admin` route group with `layout.tsx`, `loading.tsx`,
`error.tsx` and the `noindex` metadata; `admin.page_viewed` in `events.ts`; and
`ADMIN_EMAILS` annotated in `.env.example` **including the local value
`miftah@dev.local`**, which is what makes Tasks 20 and 21 runnable.

**A4 hands back:** `src/theme/tokens.css`'s `--chart-*` block (§6's assignment, a file A1
does not touch), and the two-page surface A5 and A6 mount their own pages beside.

---

## 11. The loops, mapped

| Loop | What it answers here | Instrument |
|---|---|---|
| **1 — vitest** | the palette's six checks, the §5.2 negatives, the I-4 contrast control, geometry maths, `stackSegments` closing, `bucketFor(0) === null`, the no-dual-axis grep, the `t()`-absence grep, the single-client-file fence, entity-colour-under-filter, `runtime`/`maxDuration` by source | `npm test` |
| **2 — integration** | **nothing A4 owns.** Every A3 aggregate needs one and A3 owns them | — |
| **3 — `tools/shot.sh` at 1440** | **A4's acceptance step.** Is this readable on the machine it will be used from? Nothing else can answer it | `_adminshot.html` + `tools/shot.sh … 1440 1600` |
| **4 — `getBoundingClientRect` in a fixed container** | **the loop for width**: overflow, KPI columns, bar thickness, tick font size, 44px targets, heatmap cells, at 320/360/390 | `tools/seo/chartfit.sh` |
| **5 — CDP** | **not A4's.** It cannot give a width. It is A1's instrument for proving the 404 to a real non-admin session. Task 1 measures whether `--width 1440` is honoured and records the answer | `tools/e2e/run.sh` |
| **6 — a real iPhone** | only §4.2's cold-path question: `maxDuration = 30` against a suspended Neon compute. Not dischargeable in WSL, because Docker Postgres never sleeps | a preview URL |

**Loop 5 cannot substitute for loop 3 and loop 3 cannot substitute for loop 4.** That is
the whole of §0.5 and it is why this plan commits a harness for each.

---

## 12. Open items A4 hands to reconciliation

1. **§1.1** — §5.1's single validator command is wrong for three of its five sets. Fix the roadmap or accept §4.3's per-set commands as the record.
2. **§1.2** — §5.1's diverging "ALL CHECKS PASS / ΔE 27.2" is the poles only; the trio fails the chroma floor, correctly.
3. **§1.3** — §5.1's `--pairs all` "a WARN, not a pass" is exit 0. A test written from that wording is red on correct data.
4. **§1.4** — the chart surface must be opaque; `#a3423a` is 2.66:1 against the top of the radial. §5 never states it and this is the one that would have shipped a real contrast failure.
5. **§1.5** — "folded to 4 + Other" needs a fifth slot §5.1 does not have. A4 rules top-3 + Other, and `op` is a table.
6. **§1.6** — five `status` values, four slots, and no four-hue traffic light. A4 rules table. Separately: `ReadingStatus`'s `blocked` vs `llm_calls.status`'s `refused`.
7. **§1.7** — **the weekday × hour heatmap is not buildable from §3.2's columns.** A4 ships a Jakarta-pinned hour axis; reconciliation may prefer to drop the card.
8. **§1.8** — the meter cannot have a same-hue track without announcing alarm at 0%.
9. **§1.10** — the hero figure has no sans to be set in; A4 rules Cinzel.
10. **§1.11** — `/api/admin/metrics/[metric]` is unowned and A4 does not need it; the per-user league is A4's form on A5's subject.
11. **§7 / §12.5** — A4 recommends **call count** as the headline and spend as a tile. Miftah's call; the swap is one line.
12. **§12.7 is discharged by Task 21 and by nothing else.** If Task 21 is skipped, this release ships a dashboard nobody has looked at.
