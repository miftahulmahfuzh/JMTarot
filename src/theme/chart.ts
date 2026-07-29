/**
 * The chart palette. A-D9 licenses these hex values and §5.1 of the v0.5.0 roadmap
 * validated every one of them against `#130f22` in dark mode. `chart.palette.test.ts`
 * re-runs the six checks on every `npm test` -- read its header before changing a hex.
 *
 * ── WHY THIS IS NOT IN `tokens.ts` ───────────────────────────────────────────
 *
 * JMTarot has ONE accent hue and gold means "a card goes here" -- `tokens.ts` says so
 * at `cardEdge`, in capitals. `muted` and `label` are lavender-grays below the chroma
 * floor, and `danger` is the one destructive colour and is reserved. **One hue cannot
 * carry three readers, three services and two token directions.**
 *
 * Keeping the chart palette in its own file also stops a screen reaching for
 * `--chart-cat-2` as a UI colour: these values are licensed for MARKS on a chart
 * surface and for nothing else, and a file boundary is the cheapest way to say so.
 *
 * ── DARK MODE IS THE ONLY MODE (roadmap §5.4) ────────────────────────────────
 *
 * JMTarot has no light theme, so there is nothing to flip and every number here was
 * validated against the real surface. **Do not add a light variant "for
 * completeness"** -- an unvalidated second palette is worse than one mode.
 *
 * ── PURE, AND THE `tokens.ts` IMPORT IS THE POINT ────────────────────────────
 *
 * No `server-only`, no `process.env`, no React, no `next/*` (I-3). This file is
 * imported by a test, by server components and by one client component, so it has to
 * be reachable from all three -- the `swipeDeck.ts` / `lines.ts` precedent. The one
 * import exists so that two identities are enforced by the COMPILER rather than by a
 * comment: `CHART_SURFACE === color.bgRadial[1]` and `DIVERGING.mid === color.label`.
 * Written as literals they would be two more hexes to keep in step by hand.
 */
import { color } from './tokens';

/**
 * The chart panel's background. **OPAQUE, AND THAT IS A CONTRAST REQUIREMENT, NOT A
 * STYLE** (I-4, reconciliation R8 -- the release's closest call).
 *
 * `Backdrop` paints a viewport-FIXED radial, `#221a3a 0% -> #130f22 42% -> #08060f
 * 100%`, so **the colour behind a chart depends on where that chart sits on SCREEN,
 * not on which page it is.** A transparent panel at the top of the viewport -- where a
 * KPI row and the hero figure go -- sits on `#221a3a`.
 *
 * Measured: `SEVERITY[3]` is **2.66:1** against `#221a3a` -- below the 3:1 mark floor
 * -- and **3.04:1** against this value. A margin of 0.04. And the ordinal check passes
 * either way, because its own light-end floor is 2.0, **so the test A-D9 asks for
 * would have been GREEN while the mark was under-contrast on screen.**
 *
 * So: no `rgba`, no `opacity` on a chart panel, no `backdrop-filter`. Any translucency
 * invalidates the entire §5.1 validation run, and the failure looks like nothing at
 * all. `chart.palette.test.ts` ships the negative control.
 */
export const CHART_SURFACE = color.bgRadial[1]; // '#130f22'

/**
 * Fixed order, four slots, **NEVER cycled, NEVER indexed by rank.**
 *
 * | slot | hex | reads as | assigned to |
 * |---|---|---|---|
 * | 0 | `#ab8b20` | dim gold | `thessaly` · `daily` · `input` |
 * | 1 | `#2fa4a0` | teal | `margaret` · `spread3` · `output` |
 * | 2 | `#8b7bd8` | violet | `adrian` · `yesno` |
 * | 3 | `#d2707f` | rose | "Other" |
 *
 * **Slot 0 is `#ab8b20`, not the token `gold #c9a227`** -- measured at L=0.728, outside
 * the dark band `[0.48, 0.67]`. It is the token darkened into the band, and that is the
 * whole delta. Worst adjacent pair: violet<->teal ΔE 10.5 (deutan).
 *
 * At `--pairs all` the teal<->rose pair is ΔE 6.5, a WARN that **exits 0**. A4's
 * response is structural rather than a cap: **no all-pairs form ships at all** -- no
 * scatter, no bubble, no small multiples -- and `chart.contract.test.ts` asserts their
 * absence by filename.
 */
export const CATEGORICAL = ['#ab8b20', '#2fa4a0', '#8b7bd8', '#d2707f'] as const;

/**
 * Magnitude. One hue, light -> dark.
 *
 * **THE DIMMEST STEP IS THE ONE THAT MUST CLEAR A DARK CANVAS** (4.02:1) -- the
 * opposite of the light-mode intuition, where the lightest step is the risk. §5.1
 * records a first attempt ending at `#3d3272` that failed at **1.70:1**.
 *
 * Validated with `--ordinal`; run through the categorical six it FAILS by design, and
 * `chart.palette.test.ts` asserts that failure so nobody "fixes" a good ramp.
 */
export const SEQUENTIAL = ['#d8cdf7', '#c0b0ee', '#a996e4', '#9382cf', '#7a68b8'] as const;

/**
 * Ordinal severity, one hue, four steps, terminating on the app's one destructive
 * colour -- so `danger` is the deep end of a scale rather than a fifth unrelated value.
 *
 * **ADJACENT NORMAL-VISION ΔE IS 7.5, SO COLOUR ALONE MAY NEVER CARRY THE STATE.** An
 * icon and a word, always (`Meter` takes both as required props). §5.2 measured that a
 * four-hue good/warning/serious/critical traffic light is **unbuildable on this
 * canvas** -- amber<->orange is ΔE 2.3 under protanopia -- and the negatives are pinned
 * in the palette test so "adding a warning colour" fails a test that names the number.
 */
export const SEVERITY = ['#e0a49c', '#cd8078', '#b85c52', '#a3423a'] as const;

/** Binary status, with an icon and a label always. ΔE 24.7 normal, 11.8 deutan. */
export const STATUS = { good: '#4f9d6b', critical: '#a3423a' } as const;

/**
 * Growth up vs down. Two hues + a **NEUTRAL GRAY midpoint**, ΔE 27.2 on the poles.
 *
 * **The midpoint is BELOW the chroma floor (C=0.051) and that is the requirement, not
 * a defect**: the middle of a diverging scale must read as "nothing". `color.label` is
 * already documented as a lavender-gray, so this spends no new value and no palette
 * slot. It is validated as a text/neutral token and **never as a categorical slot**;
 * a test asserting the trio passes the categorical six is wrong about the design.
 */
export const DIVERGING = { down: '#2fa4a0', mid: color.label, up: '#a3423a' } as const;

/**
 * De-emphasis: a sparkline's body, the meter's empty track, a series pushed back so
 * one can come forward.
 *
 * **Legal as a MARK (4.11:1 on the surface); ILLEGAL as tick text** (I-12), which
 * needs 4.5:1 and gets it from `--muted` at 6.47:1. Same hex, two verdicts, because
 * WCAG asks a different question of a 2px rule than of an 11px glyph.
 */
export const DEEMPH = color.label; // '#7a7192'

/**
 * The three entity dimensions, keyed by the slug the data layer actually returns.
 *
 * **COLOUR FOLLOWS THE ENTITY, NEVER ITS RANK** (A-D11). `adrian` is slot 2 whether or
 * not `thessaly` is on screen, so filtering to two readers cannot repaint the
 * survivors. `entityColor.test.ts` names that exact failure.
 *
 * The keys are the bare slugs -- `thessaly`, `spread3` -- because those are what
 * `readers.json`, `services.json` and A3's `group by` produce. A display name here
 * would need a lookup at every call site and would drift from the data.
 */
export const READER_SLOT = { thessaly: 0, margaret: 1, adrian: 2 } as const;
export const SERVICE_SLOT = { daily: 0, spread3: 1, yesno: 2 } as const;
export const DIRECTION_SLOT = { input: 0, output: 1 } as const;

/** Slot 3 **is** "Other" (R11), which is why a 4-slot form folds to top-3 + Other and
 *  never to "4 + Other" -- that needed five slots and there are four. */
export const OTHER_SLOT = 3;

/**
 * **THE ONLY PLACE `CATEGORICAL` IS INDEXED, and `chart.contract.test.ts` asserts
 * it.**
 *
 * Callers pass a slot resolved from one of the maps above, so **no code path can
 * colour a series by its position in an array.** That is what makes "colour follows
 * the entity, never its rank" structural rather than a convention -- a rule enforced
 * by a comment is a rule the next `series.map((s, i) => CATEGORICAL[i])` breaks
 * silently, and on screen it looks like a chart with colours.
 *
 * **IT THROWS ABOVE SLOT 3 RATHER THAN WRAPPING.** A modulo is how a fifth series
 * silently reuses slot 0 and two entities become one colour; A-D9 makes a fifth
 * categorical hue *"a reconciliation question, not an authoring convenience"*, and a
 * throw is that sentence in code. `-1` -- `slotFor`'s answer for an unknown entity --
 * is `OTHER_SLOT`, because a caller that could not identify an entity has one, and
 * crashing a dashboard over an unrecognised reader slug would be the worse failure.
 */
export function slotColor(slot: number): string {
  if (slot === -1) return CATEGORICAL[OTHER_SLOT];
  if (!Number.isInteger(slot) || slot < 0 || slot >= CATEGORICAL.length) {
    throw new RangeError(
      `chart slot ${slot} is out of range: the categorical palette is ${CATEGORICAL.length} wide ` +
        'and is never cycled. Fold to top-3 + Other (A-D9, R11).',
    );
  }
  return CATEGORICAL[slot];
}
