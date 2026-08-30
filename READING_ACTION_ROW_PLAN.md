# Plan: the post-reading action row, and the separator rhythm

**Slug:** `reading-action-row`
**Date:** 2026-08-30 19:23:35 WIB
**Analysis:** `20260830-192335-C7Q1_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/tarot_app/reading-action-row`
**Branch:** `feature/reading-action-row` (base: `origin/main` @ `edc6967`)
**Phases:** 2
**Status:** planned

---

## Why

The user's rationale, verbatim:

> 1. i feel like we need a shortcut to homepage (card reader selection) in card reading page. after user select cards, reader will interpret the cards, and in this page , we need to add some buttons (use the same theme buttons as our existing floating group chat and akun floating buttons):
> 1a. i think we need to replace "bagikan" with a share icon. and in the same row, we need to add homepage icon, and the existing akun button there.
> 1b. we need to implement the same thing in history card reading page as well.
> 1c. i think we need to keep "bahas di grup" button as text because this Grup Chat is our "competitive edge" feature, so we need to make it more highlighted to users
> 2. small UI change , checkout the spacing between the top separator line to Bahas Di Grup , and the spacing between "Margaret dan Adrian." to its bottom separator line. we need to set the spacing of these two to be the same. pull the bottom separator line closer to the text. use the same value as the top separator spacing
> 2a. the same with no 2 , the text "Bacaan ini untuk hiburan semata.." also has inconsistent spacing between the text to top separator and the text to bottom separator as well. use the same spacing value accross all texts, so they look consistent.

**1c is a reversal of a written rule and is recorded as one.** `AttachReadingLink.module.css`'s header says in its own words that neither control may be filled, *"and if a future release wants one of them emphasised, that is a decision about which, made once, in both files."* This is that release and this is that decision: `Bahas di grup` is the emphasised one, because the group chat is the product's edge. The reason the old rule can go is in the same sentence — the two stopped being siblings the moment `Bagikan` became an icon.

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | A row of circular icon controls under a finished reading, themed like the floating chat/account circles — share as an icon, plus a home icon and the account control — on the draw screen and on `/history/[id]`, with `Bahas di grup` kept as text and emphasised (1, 1a, 1b, 1c) | 1 |
| R2 | One consistent spacing value on both sides of every hairline-separated text block under a reading (2, 2a) | 2 |

## Scope

**In scope**

- A new `ReadingActions` row, mounted on the draw screen (only at `reading.status === 'done'`) and in `/history/[id]`'s `footer` slot.
- `ShareFooter`'s trigger becomes an icon button with no wrapper of its own.
- `AccountButton` gains an optional `className` that takes over placement, and two new `AccountSurface` values.
- `account.opened.surface` widened by two members.
- `AttachReadingLink`'s control becomes the filled one.
- One spacing value — **18px** — above and below every hairline in the reading tail, in four stylesheets, with a test that keeps them equal.

**Out of scope, and why**

- **The corner chrome on the four pages that already have it.** `AccountButton` and `ChatButton` stay exactly where they are on `/`, `/[reader]`, `/account` and `/history`. This change adds an in-flow row on two screens that have no corner chrome at all; it does not move or restyle the fixed circles, and `chatSurface.test.ts`'s assertions about `AccountButton.module.css`'s literals stay green untouched.
- **A `ChatButton` in the row.** `C-D17` puts the room's badge on the four picker/list screens and deliberately not on a reading; `Bahas di grup` is this screen's route into the room and it is being emphasised, not duplicated.
- **A `LOCALE_SWITCHER` row on the draw screen.** Roadmap §7 trap 4 is unresolved and this change does not resolve it — it suppresses it. See the invariants.
- **Any spacing outside the reading tail.** `.prose`/`.panel`'s 20px top padding, the slot row, the fan, the fixed draw footer and `ReadingView`'s `.head` are untouched.
- **A spacing token in `tokens.ts`.** There is no spacing family there, one value does not justify inventing one, and the four literals are held together by a test instead. See Phase 2.
- **New analytics names.** Nothing is added to the closed taxonomy — only one existing prop union is widened. The home tap fires nothing, on `AttachReadingLink`'s precedent (*a tap that navigates and is then abandoned is not the thing you wanted to count*).

## Invariants

Every phase must leave all of these true.

1. **The tree builds and `npm test` passes at the end of each phase**, and `npm run build` is run before either is called done (the TypeScript trap).
2. **Roadmap §7 trap 4 stays closed on the draw screen.** The Language row is never reachable from `/[reader]/[service]`. The suppression lives in `ReadingActions` as `surface !== 'draw'`, in code, not in a value a call site passes.
3. **The account control's presence is still enforced by imports, not by a runtime flag.** `accountSurface.test.ts` must be able to see the draw screen's mount — through the one hop `ReadingActions` introduces — or the guard has been switched off while looking green.
4. **The row renders only where a reading is finished and readable.** On the draw screen that is the existing three-clause condition, not one character wider. On `/history/[id]` it is the existing `view.status === 'ok' && view.body !== null`.
5. **No new hex, no new font size, no new easing curve.** Every value in the new stylesheet appears in `tokens.css`, `AccountButton.module.css` or `ChatButton.module.css` already.
6. **`ReadingView`'s four rules are untouched**, and the row goes in the `footer` slot — never in a wrapper appended after the component.
7. **The share sheet's behaviour does not change.** Only its trigger's markup does. `ShareFooter.test.ts`'s source-level assertions — including `onClick={() => void openSheet()}` verbatim — stay green.
8. **44px minimum tap target** on every control in the row. `PublicShare`'s 36px is a known defect and is not the thing to copy.
9. **Both stylesheets that draw the entertainment disclaimer stay byte-equal to each other** in the declarations they share. They are two copies of one visual role and they have never disagreed; the rhythm test is what keeps that true.

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | The reading action row | R1 | `src/components`, `src/app` | 11 | — | NORMAL | `.workflows/plan/reading-action-row/phase-1.md` | — | `miftahulmahfuzh/JMTarot#28` |
| 2 | One spacing value in the reading tail | R2 | `src/components` | 5 | 1 | EASY | `.workflows/plan/reading-action-row/phase-2.md` | — | `miftahulmahfuzh/JMTarot#29` |

### Phase 1 — The reading action row

**Satisfies:** R1
**Owns:** `ReadingActions.tsx` + `.module.css` (new), `ShareFooter.tsx`'s trigger and `ShareFooter.module.css`'s `.footer`/`.action`, `AccountButton.tsx`'s `className` prop and `AccountSurface`, `events.ts`'s `account.opened` prop union, the two mounts (`Draw.tsx`, `HistoryDetail.tsx`), `src/app/history/[id]/page.tsx`'s new prop, `accountSurface.test.ts`, both catalogs, and `AttachReadingLink.module.css`'s **colours only**.
**Does not touch:** any `margin-top`, `padding-top` or `gap` that governs the spacing R2 is about — `AttachReadingLink.module.css`'s `.wrap` block, `ReadingPanel.module.css`'s `.disclaimer`, `ReadingView.module.css`'s `.disclaimer`. The new `.row` carries `margin-top: 22px; padding-top: 18px` in this phase, exactly reproducing what `ShareFooter`'s `.footer` did, so the screen's rhythm is unchanged by phase 1 and every pixel R2 moves is visible in phase 2's diff alone.
**Exit criteria:** on both screens the tail ends in a centred row of three 44px circles — home, share, lotus — the share sheet and the account menu open and behave exactly as before, `Bahas di grup` is the filled control, `/[reader]/[service]` still cannot reach the Language row, and `accountSurface.test.ts` fails if somebody deletes that suppression.

### Phase 2 — One spacing value in the reading tail

**Satisfies:** R2
**Owns:** the four spacing declarations — `ReadingPanel.module.css` `.disclaimer`, `ReadingView.module.css` `.disclaimer`, `AttachReadingLink.module.css` `.wrap`, `ReadingActions.module.css` `.row` — plus a new `readingRhythm.test.ts`.
**Does not touch:** any colour, any font, any component's TSX, `.panel`/`.prose`/`.view`/`.shell`'s own `gap` or top padding.
**Exit criteria:** measured with loop 4 at 320/360/390 on both screens, every text→hairline distance in the tail is 18px, top and bottom.

## Reconciliation Log

| Conflict | Phases | Resolution |
|---|---|---|
| Both phases touch `AttachReadingLink.module.css` | 1, 2 | Split by property: phase 1 owns the `.action` colour block (R1c), phase 2 owns `.wrap`'s `margin-top`. Phase 2's plan quotes the file as phase 1 leaves it. |
| Phase 2 edits `ReadingActions.module.css`, which phase 1 creates | 1, 2 | Phase 1 ships `.row` with `margin-top: 22px`, the value `ShareFooter`'s `.footer` had, so the screen is visually unchanged; phase 2 zeroes it. Phase 2's plan quotes phase 1's file. |

## Open Questions

None. Two judgement calls were made rather than asked, and both are stated as assumptions in the analysis: **18px** is the value R2 unifies on (R2 names the `Bahas di grup` block's top spacing as the reference, and that is 18), and *"the existing akun button"* means the same component and the same menu, relocated — not a second affordance.

## Rollback

Per phase: `git revert` the phase's commit. Neither phase touches a migration, a route, a stored column or a model call, so a revert is complete on its own.

As a whole: delete the branch. `account.opened` rows carrying `surface: 'draw'` or `'history_detail'` would survive a revert in the `events` table — harmless, since `sanitizeProps()` already accepts any scalar and no query filters on that union.

## Next

    /implement -f READING_ACTION_ROW_PLAN.md
