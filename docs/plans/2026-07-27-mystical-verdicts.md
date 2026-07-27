# V3 — Mystical Memory Verdicts Implementation Plan

> ### AMENDED 2026-07-27 AFTER RECONCILIATION — READ BEFORE THE PLAN BELOW
> `docs/plans/2026-07-27-RECONCILIATION-v0.3.0.md` outranks this file. Four
> changes, and V3 GAINS scope:
>
> 1. **V3 is no longer blocked on V2** (§5.1/§6.9). Your negative ask was
>    granted: `daily_summaries` and `frequency_verdicts` are out of the
>    `translations` table, so the two workstreams no longer interact at all.
>    Build order is now V1 → (V2, V4, V5) → **V3** → (V6, V8) → V9 → V7.
> 2. **You inherit dominance from V1** (§5.4). `dominanceOf` stays in
>    `src/lib/memory/frequency.ts` as you argued, and V1 deletes its
>    `dominanceFor` / `Dominance` / `frequencyCorrespondence`. **You also inherit
>    V1's exact-key-set test** asserting the composed type in
>    `src/lib/memory/shadow.ts` carries no count-bearing field of any kind. That
>    assertion is VD2's mechanical enforcement — without it VD2 degrades from
>    "impossible" back to "merely forbidden". Do not lose it in the move.
> 3. **`reduce` is now idempotent in V1** — `reduce(11) = 11`, not `2` (§5.3).
>    Check any pulse-gloss example in this plan that assumed otherwise.
> 4. **You create `src/lib/copy/vocab.ts`** (§5, "the shared vocabulary
>    module"). V1's gloss tests and V8's write-time safety checks were each about
>    to copy the Malay / therapy / `en`-tic lists out of `scripts/smoke-llm.ts`,
>    making four copies. Plain pure module, **no `server-only` marker** — the
>    smoke script imports it and `server-only` throws outside a Next server
>    bundle. You are already in that file for §0.3.
>
> **MIFTAH'S RULING ON MARGARET (was open question, now closed).** She is allowed
> to be longer, and the number is **30%**. Replace the hand-set `spread3: 55`
> override with a principled `MARGARET_MULTIPLIER = 1.3` applied to every
> reader-voiced ceiling: `spread3` 40 → 52, `daily` and `yesno` × 1.3, and the
> day summary × 1.3 on top of your raise (50 → **65** for Margaret only). The
> frequency verdict is house voice and is unaffected. This closes the open
> question `budget.ts` carries as well as yours — settle it in `budget.ts`, in
> one place, since that file exists precisely so a ceiling is written once.

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers-extended-cc:executing-plans` to implement this plan task-by-task.

**Goal:** stop the app doing arithmetic out loud. The card-frequency verdict and
the per-day summary keep reading the same history and stop reciting it. After
this workstream **the counts do not reach either prompt at all** — the model is
handed the two card names, the **Shadow Arcana** they add up to, the **pulse
gloss** of their combined number, and a **dominance bucket**, and it cannot
recite a tally it was never given.

**Architecture:** three derived values computed in code from facts already in
`FrequencyResult`, an adapter over V1's engine so exactly one file knows V1's
signatures, two rewritten prompts in `src/lib/prompt/summary.ts`, one new pure
module (`src/lib/memory/tally.ts`) holding the anti-tally grep so it can be
unit-tested against its own false-positive corpus, and a one-line cache-validity
fix without which `MEMORY_PROMPT_VERSION` does not invalidate anything.

**Tech Stack:** unchanged. TypeScript 5.x, Next 15 route handlers, Drizzle,
Vitest (unit + integration), `npm run smoke` against live z.ai. No new runtime
dependency, no new table, no new column, no new event name.

**Owns:** `src/lib/prompt/summary.ts`, `src/lib/memory/frequency.ts`, and two new
files — `src/lib/memory/shadow.ts` and `src/lib/memory/tally.ts`. Touches
`src/app/api/memory/frequency/route.ts` (one branch), `scripts/smoke-llm.ts`
(two runners), and the prop shapes of two `memory.*` events.

**Depends on:** **V1** hard — `reduce`, `arcanaFor` and the number glosses are
the whole mechanic and none of it can be written against a moving formula.
**V2 weakly, and possibly not at all** — see `## Interfaces I need`.

**Governing documents:** `PUBLIC_RELEASE_ROADMAP_v0.3.0.md` is the contract and
wins every conflict with this file. VD1 and VD2 are the two non-negotiables this
workstream exists to satisfy; §5 fixes the Shadow Arcana mechanic and **it is
implemented, not reinvented**. Everything in `CLAUDE.md`,
`PUBLIC_RELEASE_ROADMAP.md` and `docs/plans/2026-07-26-RECONCILIATION.md` still
binds — in particular W5's M6 (the verdict is house voice), M12 (the day summary
covers every reader), M14 (a failure renders nothing) and R16 (the Lotus block
does not reach either prompt).

---

## 1. What is actually broken, and where

Miftah's sentence names the symptom:

> *"i hate that the daily summary can output meaningless count like this: This
> week The Empress is shown three times whilst the Chariot is shown two times.
> what the fuck is this??"*

The instinct is to read that as a copy problem and rewrite the instruction. It
is not, and W5's own files say why. Three places produce the tally, and only one
of them is an instruction:

**One — the frequency prompt is handed the counts and told to rank them.**
`buildFrequencyPrompt`'s user turn is literally

```
1. Strength — muncul 5 kali (2 terbalik)
2. The Hanged Man — muncul 3 kali (0 terbalik)
```

and the system prompt says *"names both cards and puts the first one above the
second"*. The model is doing exactly what it was asked. There is no instruction
you can add to this prompt that beats deleting the numbers from it.

**Two — one of the five angles orders the tally out loud.** `FREQUENCY_ANGLES`
contains `'Sebut saja jumlahnya apa adanya, tanpa perumpamaan.'` / `'Just name
the counts plainly, with no image at all.'` One page load in five gets a
prompt that *instructs* the recitation. It was the right call at the time —
four metaphors and no plain option reads as relentlessly poetic — and it is
now the single most direct cause of the complaint.

**Three — and this is the one that would survive a careless fix — FOUR OF THE
SIX DAY-SUMMARY WORKED EXAMPLES RECITE A TALLY.**

```
thessaly/id  "Tiga kali hari ini kartunya soal menunggu, dan dua kali di antaranya The Hanged Man."
thessaly/en  "Three times today the cards came back to waiting, and twice it was The Hanged Man."
adrian/id    "The Moon keluar dua kali, dan dua-duanya soal hal yang belum kamu bilang..."
adrian/en    "The Moon turned up twice, and both times it was about something you..."
```

`summary.ts`'s own header says *"THE EXAMPLE DOES MORE WORK THAN THE
DESCRIPTION"*, and `readers.ts` paid for that lesson twice. So the six examples
are currently **teaching** the failure. You can add `DILARANG MENYEBUT JUMLAH`
to the task text and it will lose to the paragraph underneath it that
demonstrates the opposite. **Rewriting those six examples is the highest-leverage
edit in this workstream.** Do it in its own commit so it is visible in the
history.

And two smaller leaks, both of the same shape — a number stated on a line of its
own, which is the form a model reads off verbatim:

- `Bacaan dalam rentang ini: 7` and `Rentang: Minggu ini (2026-07-20 .. 2026-07-26)`
  in the frequency user turn.
- `Bacaan hari ini: 2`, `REPEATED TODAY: The Moon (2×)` and the `1.` `2.` `3.`
  list numbering in the day-summary user turn.

### The principle, stated once

**VD2 is enforced mechanically and only then by instruction.** A prompt that
merely *prefers* interpretation falls back to the tally under compression
pressure — the exact failure that made Thessaly stop naming cards when the
40-word ceiling landed (`CLAUDE.md`, `## The prompt`). Every number is deleted
from both user turns, every instruction is written anyway as a second line of
defence, and a grep in the smoke script is the third.

**Mechanical enforcement is a gradient, not a wall, and saying so is honest.**
The model can still count three bullets in `<riwayat-hari-ini>`. What it cannot
do is read `3` off a line and put it in a sentence, and the difference between
those two is the difference between the complaint and no complaint.

---

## 2. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| V3-1 | Where the counts stop | **At the prompt boundary.** `m` and `n` reach `buildFrequencyPrompt`, are consumed by `shadowFor`/`pulseFor`/`dominanceOf`, and no digit derived from them enters `prompt.user`. | Roadmap §5's last paragraph, verbatim. It is the only enforcement that cannot be eroded by a later prompt edit. |
| V3-2 | The Shadow Arcana collision | `arcanaFor(a.id + b.id)` equals `a` **iff `b` is The Fool** and equals `b` **iff `a` is The Fool** — nothing else, because `b ≡ 0 (mod 22)` has one solution in `0..21`. When it happens the prompt gets **one extra line** saying the pattern has doubled rather than a third card. | It is a real tarot fact and a good one: The Fool is 0, it adds nothing, so the pair collapses onto itself. Suppressing the shadow instead would silently give one pair in twenty-two a two-card sentence under a prompt that demands three names. |
| V3-3 | The day's shadow | `arcanaFor(sum of every card id drawn today)` — the classic quintessence of a spread, widened to a day. **Omitted entirely when it equals a card actually drawn today.** | Same borrowed practice as V3-2, so the mysticism is consistent across both features. The omission rule falls out for free: a one-card day always collides, and a reader naming the same card twice in 50 words is worse than no shadow. |
| V3-4 | No pulse in the day summary | The frequency line gets the pulse gloss; the day summary does not. | R16's argument, reapplied. The summary already carries the reader's persona, the day's real readings, an echo card and a shadow card; a fifth attractor in 50 words is how three readers converge. Two ideas is what fits. |
| V3-5 | Dominance is a bucket, ranked on a **ratio** | `tied` / `narrow` / `clear` / `overwhelming`, from `m/n` with an absolute-difference floor, not from `m - n`. | `m - n` is not scale-invariant: 4 over 2 and 10 over 8 have the same difference and are not the same fact. "Twice as often" means the same thing at 4:2 as at 20:10, which is what a ratio says and a difference does not. |
| V3-6 | The five angles **survive as a mechanism and are rewritten as strings** | `angleIndexFor` and the fingerprint rotation are unchanged. All ten strings are replaced; the plain option stays, one per locale, and it no longer says "name the counts". | Argued in full in §4. |
| V3-7 | `FREQUENCY_MAX_WORDS` 25 → **32**, 1–2 sentences | Measured back down in Task 15 if the model lands consistently under. | Argued in full in §5. |
| V3-8 | `SUMMARY_MAX_WORDS` 45 → **50**, 1–3 sentences | Same. | Argued in full in §5. |
| V3-9 | The anti-tally grep is a **module, not a string list in the smoke script** | `src/lib/memory/tally.ts`, pure, unit-tested against a false-positive corpus. | The Malay list lives in the script because eleven Malay-only words have no false positives. This list does: `sekali` also means "very", `once` also means "as soon as", and banning bare `dua` would ban "dua kartu itu". That is the `lagi` trap (`CLAUDE.md`, W5) in a new costume, and a list with false positives needs tests. |
| V3-10 | The grep FAILs in two tiers | **FAIL** on anchored tallies and digits; **WARN** on ambiguous single words. | W7's blocklist precedent and its stated reason: a scanner that flags legitimate output is a scanner somebody switches off within a week, and then nothing is checked at all. |
| V3-11 | No runtime tally rejection | The grep runs in `npm run smoke`, never in the route. | M14 says a failed generation renders nothing. A false positive at runtime would therefore delete the feature for that user with nothing on screen and nothing to tell them. A heuristic is allowed to fail a build; it is not allowed to fail a person. |
| V3-12 | `MEMORY_PROMPT_VERSION` `'memory-v1'` → `'memory-v2'` **plus a one-line route fix** | The bump alone invalidates `daily_summaries` and **does not invalidate `frequency_verdicts`**. See §6 — this is a live bug, found by checking rather than assuming. | The whole point of a hand-bumped epoch is that it invalidates when a human says so. A version that half-works is worse than none, because the half that works hides the half that does not. |
| V3-13 | Dominance and day-shape glosses live in `summary.ts`, **not** in V1's `glosses.ts` | Roadmap §5 puts the number/sign/element glosses in `src/lib/numerology/glosses.ts` because they are dual-role — a prompt consumes them *and* `/account` displays them (the I14 `positionFraming` precedent). | These four words are **single-role**: they are prompt input, they are explicitly never spoken back, and no screen renders them. Putting them in `glosses.ts` would put four strings nobody displays into the file whose contract is "these are displayed". |

---

## 3. The mechanic, as code will compute it

### 3.1 The frequency triple

Given `result.ranked[0] = a` (count `m`) and `result.ranked[1] = b` (count `n`),
both guaranteed by `passesGate`:

```
shadow    = arcanaFor(a.cardId + b.cardId)          // V1. CARDS[n % 22].
shadowIs  = shadow.id === a.cardId ? 'top'
          : shadow.id === b.cardId ? 'second'
          : null                                     // V3-2. Only when one is The Fool.
pulse     = glossForNumber(reduce(m + n), locale)    // V1. One written line.
dominance = dominanceOf(m, n)                        // V3. A bucket.
```

`a.cardId + b.cardId` ranges `1..41` for a distinct pair, so `% 22` is a real
fold and not the identity. `m + n ≥ 5` because the gate demands `m ≥ 3` and
`n ≥ 2`, so `reduce(m + n)` never hits the degenerate `reduce(1)`.

### 3.2 `dominanceOf`, and why it is a ratio

```ts
export type Dominance = 'tied' | 'narrow' | 'clear' | 'overwhelming';

export function dominanceOf(m: number, n: number): Dominance {
  if (m === n) return 'tied';
  const ratio = m / n;
  if (m - n === 1 || ratio < 1.35) return 'narrow';
  if (ratio >= 2) return 'overwhelming';
  return 'clear';
}
```

The `m - n === 1` clause is the absolute floor and it is doing real work at
small counts: `3` over `2` is a ratio of 1.5, which the ratio alone would call
`clear`, and one extra appearance out of five readings is not a clear anything.
The table it produces, over pairs the gate actually admits:

```
 3:2 narrow      4:2 overwhelming   5:2 overwhelming
 4:3 narrow      5:3 clear          7:5 clear
 6:4 clear      10:8 narrow        12:4 overwhelming
```

`10:8` landing on `narrow` where `10 - 8 = 2` would have said otherwise is the
whole argument for the ratio, in one row.

**It lives in `src/lib/memory/frequency.ts`, beside `passesGate` and
`rankCounts`.** That file's header already states its purpose — *"ranking rules
and a cache-validity hash are neither reads nor pure data access… they encode
product judgement and product judgement is what changes"*. A bucketing threshold
is exactly that, and it is frequency-specific, so it does **not** go into V1's
engine. This is the V3/V1 seam and keeping it here is what stops the two
workstreams colliding on one file.

### 3.3 The day pair

```
echo   = card ids drawn more than once today, ranked by (occurrences desc, id asc)
         -- NAMED, NEVER COUNTED. This is `repeatedToday()` with the count
         stripped from the render, not a new computation.
shadow = arcanaFor(sum of every card id drawn today)
         -- omitted when its id appears in today's cards (V3-3)
shape  = readings.length === 1 ? 'single' : readings.length <= 3 ? 'few' : 'crowded'
```

`echo` keeps the ranking so the most-repeated card is named first when there are
two — the ordering is still information even when the count is not printed.

### 3.4 The glosses that are not V1's

Prompt-only, `summary.ts`, never rendered:

```ts
const DOMINANCE_GLOSS: Record<Locale, Record<Dominance, string>> = {
  id: { tied: 'imbang', narrow: 'tipis', clear: 'jelas', overwhelming: 'telak' },
  en: { tied: 'level', narrow: 'slim', clear: 'clear', overwhelming: 'runaway' },
};

const DAY_SHAPE_GLOSS: Record<Locale, Record<DayShape, string>> = {
  id: { single: 'tunggal', few: 'beruntun', crowded: 'padat' },
  en: { single: 'single', few: 'a run', crowded: 'crowded' },
};
```

**Every one of these eight words was chosen to carry no numeral flavour.**
`sekali`, `sedikit`, `a couple`, `twice over` and `double` were all rejected for
that reason alone: the model echoing a prompt word must never be able to produce
a tally by accident. `imbang`/`level` says the pair is even without saying how
even.

---

## 4. The angles: rewritten, not deleted, and not replaced by the Shadow Arcana

The brief asks this to be argued rather than asserted, so:

**The case for deleting them.** They exist because a stateless model cannot obey
"write it differently each time", and the only two facts it had — a card, a
card, and two numbers — were identically shaped every single time. The Shadow
Arcana changes that: it is a **third, varying, semantically loaded fact**, drawn
from twenty-two possibilities, each with a gloss of its own. Content variety now
arrives for free with the material. That is a real argument and it is why the
five-metaphor scaffolding is no longer load-bearing.

**The case against deleting them.** Two things the rotation gives that the
material does not. First, the shadow varies the *nouns*, not the *stance* — five
different third cards described in the same posture is exactly "one sentence
with the nouns swapped", which is the failure `runFrequency`'s closing note is
written to catch. Second, the mechanism is free and cache-coherent: same facts →
same angle → same line, so a cached row and a fresh generation agree. Deleting a
free, correct, cache-coherent variety source because a second one arrived is
throwing away the belt for the braces.

**The case against keeping them unchanged, which is decisive.** Four of the five
frame *the pair* — a balance, a door, weather, a voice and the voice behind it.
The new material's central image is fixed and is not the pair: a third card
standing behind two. `'Bayangkan yang pertama sebagai pintu dan yang kedua
sebagai apa yang menunggu di baliknya'` plus a third card is a mixed metaphor
inside thirty-two words. And the fifth angle **orders the tally out loud** and
must go regardless.

**So: the mechanism survives, all ten strings are replaced, and the count stays
at five.** Five because `angleIndexFor` mods by the array length and a test
asserts the two locales are the same length; changing five to four would be a
change with no evidence behind it. The new angles vary **what the shadow card is
doing**, which is an axis that composes with the material instead of fighting
it, and one per locale still carries no image at all — for the reason the
original comment gives, which survives intact, minus the word "counts".

**The English five are rewritten, not translated, and use different images from
the Indonesian five on purpose.** W6's rule 3: a reviewer must be able to tell in
five seconds. If the English angle 2 is about a room, it was translated.

---

## 5. The word ceilings

### The frequency line: 25 → 32, one sentence → 1–2

Three facts have become five, and one of the new ones is a proper noun with an
article. The accounting, in words:

```
today   two card names (~5) + a ranking clause + the window phrase        = 25
after   three card names (~8) + a ranking clause + a spoken pulse clause
        + the window phrase                                              = 32
```

Seven more words for one more `The Hierophant` and the clause that carries it.
That is not a widened band, it is the same sentence plus a noun phrase.

The evidence says a ceiling is the length control and a sentence count is not
(`budget.ts`'s header: *"A SENTENCE COUNT DOES NOT BIND AND A WORD CEILING
DOES"*, measured on `daily` and `yesno`, 27 failures). So the ceiling moves and
the sentence count is loosened to `1 to 2` rather than deleted — three ideas in
one Indonesian sentence forces a subordinated clause, and Margaret's `spread3`
history is the record of what subordination does to a 40-word ceiling.

W5 measured this exact prompt overshooting at **29 words against a stated 25**,
and fixed it with §4.4's third technique: restate the ceiling *after* the thing
that invites elaboration. That technique stays, and the anti-tally rule is
restated in the same position for the same reason — the tally is what this
prompt falls back to when it is squeezed.

**32 is a starting number and Task 15 measures it.** This is `budget.ts`'s
English calibration precedent applied honestly: *"same 40, then measure. If
English lands consistently under, tighten to 35 and write down that it was
measured."* If ten lines come in at 22–26, tighten to 28 and record it in the
commit message.

### The day summary: 45 → 50

Smaller move, same reasoning: the summary gains one proper noun (the day's
shadow) and loses `(2×)`. Net one card name and its connective.

**Margaret is already straining at 45 and this does not fix that.** It is the
`spread3` situation one service down: her voice rules mandate long subordinated
sentences and those do not fit small ceilings. `budget.ts`'s `READER_OVERRIDE` is
`spread3`-only and is **DELIBERATELY SPARSE** by its own comment, so this plan
does **not** add a second override on a first guess. The shared ceiling goes to
50, Task 15 measures all six, and if Margaret is the only reader over it, a
`SUMMARY_READER_OVERRIDE` in `summary.ts` is the fix and it is an open question
below, not a decision taken here.

### Neither number moves into `budget.ts`

`LENGTH_BUDGET` is keyed by `ServiceId` and neither of these is a service. The
two constants stay exported from `summary.ts`, which V3 owns.

**But `budget.ts`'s actual lesson does apply and is currently violated.**
`scripts/smoke-llm.ts` hardcodes `if (words > 45)` and `if (words > 25)` rather
than importing the constants. That is the fourth-copy-of-a-tuned-number problem
`budget.ts` exists to prevent, sitting in the file that is supposed to be the
check. Task 13 fixes it: the script imports `FREQUENCY_MAX_WORDS` and
`SUMMARY_MAX_WORDS` so the ceiling in the prompt and the ceiling in the check
cannot drift.

---

## 6. Cache validity — verified, and one live bug

The brief says *verify, do not assume*. Verifying found something.

### 6.1 The fingerprint is still sufficient. Proved, not hoped.

```
fingerprintOf(window, readings, ranked)
  = sha256(`${window}\0${readings}\0${a.cardId}:${m},${b.cardId}:${n}`)
```

Every input to the three new derived values — `a.cardId`, `b.cardId`, `m`, `n` —
is inside that hash. So:

> fingerprint unchanged ⟹ `(a.cardId, b.cardId, m, n)` unchanged ⟹ `shadow`,
> `pulse` and `dominance` unchanged.

The implication holds because all three are **pure functions of hashed inputs**
and for no other reason, which is why Task 3 pins it as a property test rather
than a comment: if someone later derives a value from `lastSeen` or from
`reversedCount`, neither of which is hashed, the cache silently starts serving a
line that describes a fact that has changed. `reversedCount` is a live temptation
— it is right there on `CardCount` and the old prompt used it.

**No change to `fingerprintOf` is needed or made.** It is now a strict superset
of the prompt's inputs, which is the safe direction: it over-invalidates rather
than under-invalidates, and the over-invalidation lands on the route's
`stillTrue` branch, which serves the cached line and regenerates behind the
response. The cost is a background model call, not a wrong sentence. See the
open question about `readings`.

### 6.2 The bump does not invalidate `frequency_verdicts`. This is a bug.

`daily_summaries` is fine — `isStale()` tests `row.promptVersion !==
MEMORY_PROMPT_VERSION` first and returns `true` before anything else runs.

`frequency_verdicts` is **not** fine. `src/app/api/memory/frequency/route.ts`:

```ts
const fresh = cached?.fingerprint === result.fingerprint;

const stillTrue =
  cached !== null &&
  cached.promptVersion === MEMORY_PROMPT_VERSION &&   // <- only on this branch
  cached.topCardId === top.cardId &&
  cached.secondCardId === second.cardId;

if (cached && (fresh || stillTrue)) { ... return text(cached.body); }
```

`fresh` short-circuits the `||` and **`fresh` does not look at
`promptVersion`**. A user whose window has not moved since their last visit —
which is most users on most page loads, by design — gets the `memory-v1` row
served forever. Bumping the constant would change nothing for exactly the people
who have a cached tally to look at.

The fix is one line and it is Task 4:

```ts
const fresh =
  cached?.fingerprint === result.fingerprint &&
  cached.promptVersion === MEMORY_PROMPT_VERSION;
```

With both `fresh` and `stillTrue` false, the request falls to the synchronous
generate branch — which is correct and deliberate here, not merely convenient:
the `stillTrue` path exists because *"the sentence is still TRUE, just slightly
out of date"*, and a `memory-v1` sentence is not still true, it is the thing the
release exists to delete. It must not be served even once.

**Every cached row must be invalidated by this change**, which is the brief's
requirement and is what the two together deliver: `daily_summaries` by
`isStale`, `frequency_verdicts` by the repaired `fresh`.

---

## 7. The anti-tally check

`src/lib/memory/tally.ts`. Pure, no `server-only` (the smoke script imports it,
and scripts throw on that marker), no DB, no React.

```ts
export type TallyHit = { tier: 'fail' | 'warn'; pattern: string };
export function tallyProblems(
  text: string,
  opts: { locale: Locale; windowPhrase?: string },
): TallyHit[];
```

### The window phrase must be stripped first, and this is not a nicety

`memory.frequency.windows.d13` is **`Tiga belas hari terakhir`** — a spelled-out
number — and `d666` is **`666 hari terakhir`**, which contains digits. The prompt
*instructs* the model to say the phrase. So a naive `/\d/` fails a correct line,
on a window that is on `VERDICT_LADDER`. `tallyProblems` removes the exact phrase
(case-insensitive, all occurrences) before matching, and the `d13`/`d666` cases
are the first two unit tests written.

### FAIL — anchored, never bare

Both locales:

- `/\d/` after the phrase strip
- `/[×✕]|(?<=\s)x(?=\s*\d)/` — the `2×` shape

`id`:

```
/\b(dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas)\s+kali\b/i
/\bdua\s+belas\s+kali\b/i
/\bberapa\s+kali\b/i
/\b(sekali|dua\s+kali)\s+lipat\b/i
/\bdua-duanya\b/i
/\b(satu|dua|tiga|empat|lima)\s+(bacaan|kartu\s+yang\s+sama)\b/i
/\bmuncul\s+(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)\b/i
/\b(jumlahnya|hitungannya)\b/i
```

`en`:

```
/\btwice\b/i    /\bthrice\b/i
/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+times\b/i
/\bboth\s+times\b/i
/\ball\s+(three|four|five)\s+times\b/i
/\b(one|two|three|four|five)\s+(readings|draws|of\s+your\s+readings)\b/i
/\bcame\s+up\s+(one|two|three|four|five|six)\b/i
/\b(the\s+)?(count|tally)\b/i
```

### WARN — the ambiguous words, and why they are not FAILs

| word | the legitimate use that saves it |
|---|---|
| `sekali` (id) | the intensifier: `bagus sekali`, `pelan sekali`. Adrian's register uses it constantly. |
| `once` (en) | the temporal conjunction: `once you decide`, `once the week turns`. |
| `berkali-kali` (id) | a soft quantifier, not a tally. Allowed prose; worth reading. |
| `number of`, `several times` (en) | soft, but one edit away from a tally. |

**Banning a bare numeral is out of the question and this is the `lagi` trap
again.** `dua` is in `dua kartu itu` — "those two cards" — which is the most
natural way in Indonesian to refer to the pair the whole feature is about. A
pattern that fires on most correct outputs reports a confident wrong answer,
exactly as a bare `lagi` reported a ~90% callback rate that was entirely noise.
Every FAIL pattern above is multi-word or anchored to `kali`/`times`.

### Where it runs

`--frequency` and `--summary`, **both locales, both runners**. `runFrequency`
currently hardcodes `locale: 'id'` and that is a gap against VD2's *"in both
locales"*; Task 13 makes it loop, with `--locale <id|en>` to iterate on one, the
same flag `--all` already takes.

WARN hits print but do not fail. FAIL hits print `FAIL` and go in the same
`problems[]` array as the Malay grep, so they are as loud as it is.

---

## 8. The prompts, in full

### 8.1 `buildFrequencyPrompt` — Indonesian system

```
TUGASMU: satu pembacaan singkat atas pola kartu penanya.

Penanya sudah beberapa kali menarik kartu dalam satu rentang waktu. Di pesan berikutnya ada dua kartu yang paling sering datang, satu kartu ketiga yang berdiri di belakang keduanya, satu kalimat tentang denyut yang dibawa pasangan itu, dan satu kata tentang jarak di antara keduanya. Tulis 1 sampai 2 kalimat, maksimal ${FREQUENCY_MAX_WORDS} kata.

DILARANG MENYEBUT JUMLAH. Kamu tidak diberi angkanya, dan memang tidak perlu tahu. Jangan menulis berapa kali sebuah kartu datang — tidak dengan angka, tidak dengan kata seperti "dua kali", "tiga kali", atau "berapa kali". Yang kamu baca adalah artinya, bukan hitungannya.

Sebut ketiga kartu itu persis seperti tertulis, dalam bahasa Inggris. Kartu ketiga tidak pernah ditarik penanya: itu kartu yang keluar dari kedua kartu pertama kalau dijumlahkan. Perlakukan sebagai yang berdiri di belakang, bukan sebagai kartu yang ikut muncul.

Denyutnya diberikan sebagai satu kalimat. Ucapkan dengan kata-katamu sendiri, jangan disalin mentah-mentah, dan jangan dijelaskan sebagai angka.

Jaraknya diberikan sebagai satu kata: seberapa jauh kartu pertama meninggalkan kartu kedua. Biarkan kata itu mewarnai kalimatmu. Kamu boleh memakainya, tapi jangan pernah menggantinya dengan angka.

Ini bukan bacaan. Jangan menafsirkan nasib, jangan menasihati, jangan meramal, jangan menyapa, jangan bertanya balik. Cukup namai polanya.

Sebut rentang waktunya dengan kata, bukan tanggal: "${phrase}".

${angle}

Sudut pandang itu cuma cara membingkai, bukan izin untuk memanjang. Batas ${FREQUENCY_MAX_WORDS} kata tetap berlaku apa adanya — hitung sambil menulis, dan berhenti di situ. Dan sekali lagi, karena ini yang paling gampang kelewat saat kalimatmu dipadatkan: tanpa angka, tanpa jumlah.

${FORMAT_RULES.id}
```

When `shadowIs !== null`, this line is inserted immediately after the
`Sebut ketiga kartu` paragraph and the third card is not named separately:

```
Kali ini kartu yang berdiri di belakang justru kartu ${topOrSecond} itu sendiri, karena The Fool tidak membawa angka dan tidak menambah apa-apa. Perlakukan sebagai pola yang mengeras, bukan sebagai kartu ketiga — dan sebut dua nama kartu saja.
```

### 8.2 `buildFrequencyPrompt` — English system (REWRITTEN, not translated)

```
YOUR TASK: read the pattern in this querent's cards, briefly.

They have drawn several times over one stretch of time. The next message gives you the two cards that keep arriving, a third card that stands behind those two, one line about the pulse the pair carries, and one word for the distance between them. Write 1 to 2 sentences, ${FREQUENCY_MAX_WORDS} words at most.

DO NOT SAY HOW OFTEN ANYTHING HAPPENED. You have not been given the counts and you are not meant to have them. No digits, and none of "twice", "three times", "how often", "more often than". What you are reading is the meaning, not the arithmetic.

Name all three cards exactly as written. The third card was never drawn: it is the card the first two add up to. Treat it as standing behind them, not as one that came up.

The pulse is given as one line. Say it in your own words. Do not paste it back, and do not explain it as a number.

The distance is given as one word: how far the first card has pulled ahead of the second. Let it colour the sentence. You may use the word; never swap it for a figure.

This is not a reading. Do not read fortunes, do not advise, do not predict, do not greet, do not ask anything back. Name the pattern and stop.

Name the stretch of time in words, not dates: "${phrase}".

${angle}

That framing is only a way of putting it, not permission to run long. The ${FREQUENCY_MAX_WORDS}-word limit stands exactly as written — count as you write, and stop there. And once more, because this is the first thing to go when a sentence gets compressed: no counts, no numbers.

${FORMAT_RULES.en}
```

Collision line, English:

```
This time the card standing behind the pair turns out to be ${topOrSecond} itself, because The Fool carries no number and adds nothing. Read it as the pattern hardening rather than as a third card, and name only two cards.
```

### 8.3 `buildFrequencyPrompt` — the user turns

**Indonesian:**

```
Rentang: Minggu ini
Kartu yang paling sering datang: The Empress
Kartu kedua: The Chariot
Kartu yang berdiri di belakang keduanya: The Hierophant
Denyut: <pulse gloss for reduce(m + n), id>
Jarak: telak
```

**English:**

```
Stretch: This week
The card that keeps arriving: The Empress
The second card: The Chariot
The card standing behind them: The Hierophant
Pulse: <pulse gloss for reduce(m + n), en>
Distance: runaway
```

When `shadowIs !== null` the third line is omitted entirely; the system prompt's
collision paragraph carries it instead.

**Gone from the user turn, all of it:** the counts, the reversal counts, the
`Bacaan dalam rentang ini: N` denominator, the numbered `1.`/`2.` prefixes, and
the raw `(2026-07-20 .. 2026-07-26)` bounds. The dates go because the prompt says
"in words, not dates" and leaving the dates there is asking a model not to use
what you gave it — the same argument as the counts, one notch weaker.

**THE FREQUENCY USER TURN NOW CONTAINS NO DIGIT AT ALL**, except inside a window
phrase for `d666`. That is a testable invariant and Task 8 pins it both ways:
`week` produces a digit-free user turn, and `d666`'s user turn is digit-free once
the phrase is stripped. It also makes the smoke check's meaning exact — a digit
in the output was invented, never copied.

### 8.4 `buildDaySummaryPrompt` — the task text

Only the middle of the task block changes. Indonesian, replacing the two
sentences from `Bacaan-bacaan penanya hari ini` down to
`Jangan mengulang isi bacaannya`:

```
Bacaan-bacaan penanya hari ini ada di dalam <riwayat-hari-ini>. Ringkas HARINYA, bukan tiap bacaan satu per satu.

DILARANG MENYEBUT JUMLAH. Jangan menulis berapa kali penanya membuka kartu hari ini, dan jangan menulis berapa kali sebuah kartu muncul — tidak dengan angka, tidak dengan kata seperti "dua kali" atau "tiga kali". Kalau ada kartu yang kembali hari ini, kartu itu ada di baris BERGEMA. Sebut kartunya, bukan hitungannya. Itu hal yang paling layak disebut.

Baris BAYANGAN HARI INI, kalau ada, berisi satu kartu yang tidak ditarik penanya: kartu yang keluar kalau seluruh kartu hari ini dijumlahkan. Boleh kamu pakai sebagai gambaran hari, paling banyak sekali, dan jangan menjelaskan dari mana kartu itu datang.

Bentuk harinya diberikan sebagai satu kata. Itu untuk kamu rasakan, bukan untuk kamu sebut, dan bukan izin untuk menghitung.

Sebut paling banyak dua nama kartu, persis seperti tertulis, dalam bahasa Inggris. Kalau kamu menyebut dua, yang paling layak adalah kartu di baris BERGEMA dan kartu di baris BAYANGAN HARI INI.
Jangan mengulang isi bacaannya; penanya sudah membacanya.
```

English, same position:

```
Today's readings are inside <riwayat-hari-ini>. Sum up the DAY, not each reading in turn.

DO NOT SAY HOW MANY. Do not write how many times they opened the cards today, and do not write how many times a card came up — not as digits, and not as "twice" or "three times". If a card came back today it is on the ECHO line. Name the card, never the count. That is the thing most worth naming.

The SHADOW TODAY line, when there is one, holds a card they did not draw: the card that comes out when all of today's cards are added together. You may use it as an image for the day, at most once, and do not explain where it came from.

The shape of the day is given as one word. It is there for you to feel, not to say, and it is not permission to count.

Name at most two cards, exactly as written, in English. If you name two, the two worth naming are the card on the ECHO line and the card on the SHADOW TODAY line.
Do not repeat what the readings said; they have already read them.
```

The `LENGTH:` paragraph is unchanged except that `45` becomes `50` via
`SUMMARY_MAX_WORDS`, and the anti-tally rule is restated once at the very end of
the task block, after the injection clause — §4.4's "restate it after the thing
that invites elaboration", applied to the thing this prompt falls back to:

```
Sekali lagi, dan ini yang paling gampang kelewat kalau kalimatmu dipadatkan: tanpa angka, tanpa jumlah.
```

```
Once more, because it is the first thing to go when a sentence gets compressed: no counts, no numbers.
```

### 8.5 `buildDaySummaryPrompt` — the user turn

```
Hari: 26 Juli 2026
Bentuk hari: beruntun

<riwayat-hari-ini>
- Kartu Harian (Thessaly): The Moon (terbalik) — inti: kabar yang setengah belum layak dipercaya
- Tiga Kartu (Margaret): The Tower, The Hanged Man, The Star — inti: tambalan lama sudah tidak menahan apa-apa
- Ya atau Tidak (Adrian): The Moon — jawaban: Ya — inti: yang ditunda ternyata sudah diputuskan diam-diam
BERGEMA HARI INI: The Moon
BAYANGAN HARI INI: The Hermit
</riwayat-hari-ini>
```

English labels: `Day:`, `Shape of the day:`, `ECHO TODAY:`, `SHADOW TODAY:`.

Changed: `Bacaan hari ini: N` → `Bentuk hari: <word>`; `1.`/`2.`/`3.` → `- `;
`BERULANG HARI INI: The Moon (2 kali)` → `BERGEMA HARI INI: The Moon`; the
`BAYANGAN` line is new and is omitted on collision.

**The date stays.** It is not a tally, no summary has ever recited it, and
deleting it would be unrelated churn against a passing test.

### 8.6 The six worked examples — all rewritten

`SUMMARY_DELTAS`. The direction line above each example is unchanged; only the
`CONTOH:` / `EXAMPLE:` paragraph moves. Each new example demonstrates the shape
we want — an echo card named without a count, and at most one shadow image — and
**no example contains a number in any form.**

Indonesian:

```
thessaly  CONTOH: The Hanged Man kembali lagi sore tadi, setelah pagi yang sudah menyebutnya. Yang kamu tanyakan tadi pagi masih belum kamu putuskan. Di belakang semuanya ada The Hermit.

margaret  CONTOH: Sejak pagi kartu-kartumu berdiri di ambang yang sama, dan The Moon kembali menutup harinya seperti tadi membukanya — seolah hari ini disusun untuk menahanmu sebentar, dengan The Hermit menunggu di belakang semuanya.

adrian    CONTOH: The Moon nongol lagi, ya. Dari pagi kartunya nyambung terus, dan semuanya soal hal yang belum kamu bilang langsung ke orangnya.
```

English — different cards from their Indonesian counterparts, W6 rule 3:

```
thessaly  EXAMPLE: The Tower came back this afternoon after the morning had already named it. What you asked about first thing is still open. The Star stands behind the whole day.

margaret  EXAMPLE: Your cards have kept returning to the same doorway, The Empress opening the day and closing it again, as though nothing today was meant to be settled while The Star waited behind all of it.

adrian    EXAMPLE: The Devil showed up again, huh. The cards have been circling one thing all day, and it's the thing you still haven't said out loud.
```

Thessaly's Indonesian keeps her one-idea-per-sentence register and her record;
Margaret keeps one long patient sentence and now spends its length on the
shadow rather than on a tally; Adrian keeps the friend-checking-in opener. The
three are still the three, which Task 15's covered-name read is what proves.

---

## 9. Tasks

Every command in this section is preceded by:

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
```

Each task is failing test → run → minimal implementation → run → commit.

### Task 1: The V1 adapter

**Files:** create `src/lib/memory/shadow.ts`, `src/lib/memory/shadow.test.ts`

**Build:** `shadowFor(topId, secondId)`, `pulseFor(m, n, locale)`,
`dayShadowFor(cardIds)`. This file is **the only module in V3 that imports
`@/lib/numerology`** — if V1's signatures differ from the assumptions in
`## Interfaces I need`, exactly one file changes.

**Verify:** `npm test -- shadow`

- `shadowFor(3, 7)` → `CARDS[10]`, The Wheel of Fortune.
- `shadowFor(16, 12)` → `CARDS[6]`, The Lovers — the fold past 22 actually folds.
- `shadowFor(21, 20)` → `CARDS[19]`, The Sun.
- `shadowFor(5, 0).id === 5` and the returned `collision` is `'top'`; `shadowFor(0, 5)`
  gives `'second'`; every other pair gives `null`. **Exhaustive over all 462
  ordered distinct pairs**, asserting collision ⟺ one of the pair is id 0. This
  is V3-2's whole argument and it is cheap to prove rather than assert.
- `pulseFor(3, 2, 'id')` and `pulseFor(3, 2, 'en')` return non-empty, different
  strings, both ≤ 20 words.
- `dayShadowFor([18, 16, 12, 17, 18])` → sum 81, `CARDS[81 % 22]` = `CARDS[15]`,
  The Devil. Note the sum exceeds 43, which is the case `arcanaFor` must fold and
  a naive `n < 22 ? n : n - 22` would not.
- `dayShadowFor([7])` → `null` (collides with the only card drawn).
- `dayShadowFor([])` → `null`.

### Task 2: `dominanceOf`

**Files:** modify `src/lib/memory/frequency.ts`; create
`src/lib/memory/dominance.test.ts`

**Build:** the `Dominance` type and `dominanceOf`, beside `passesGate`.

**Verify:** `npm test -- dominance` — the nine rows of §3.2's table as nine
named cases, plus:
- `dominanceOf(10, 8)` is `'narrow'` and `dominanceOf(4, 2)` is
  `'overwhelming'`. **Both in one test named for the ratio**, because a later
  refactor to `m - n` passes every other case and fails this one.
- `dominanceOf(3, 3)` is `'tied'`.
- No input the gate can produce returns `undefined` — a loop over `m` 3..12,
  `n` 2..m.

### Task 3: The fingerprint is sufficient for the new inputs

**Files:** modify `src/lib/memory/frequency.test.ts`

**Build:** nothing. This task is a test and a comment.

**Verify:** `npm test -- frequency`

- A property test over ~200 generated `(a, m, b, n, readings, window)` tuples:
  equal `fingerprintOf(...)` ⟹ equal `(shadowFor(a,b).id, reduce(m+n),
  dominanceOf(m,n))`. Derived from hashed inputs only, so this must hold by
  construction; the test exists so that deriving anything from `reversedCount` or
  `lastSeen` — both on `CardCount`, neither hashed — fails here rather than in
  production.
- A negative control in the same file: a value derived from `reversedCount` is
  shown to survive a fingerprint change, with a comment naming it as the trap.

**Commit message** records §6.1's implication in one line.

### Task 4: The cache-validity bug and the version bump

**Files:** modify `src/app/api/memory/frequency/route.ts`,
`src/lib/prompt/summary.ts`; create
`src/app/api/memory/frequency/route.integration.test.ts` if none exists,
otherwise extend it

**Build:** `MEMORY_PROMPT_VERSION = 'memory-v2'`, and the `fresh` fix from §6.2.

**Verify:** `npm run db:up && npm run test:integration -- frequency`

- A row with a matching fingerprint and `prompt_version = 'memory-v1'` is **not**
  served. This test fails before the one-line fix — **run it and watch it fail
  first, or the fix is unverified.**
- A row with a matching fingerprint and `prompt_version = 'memory-v2'` **is**
  served, with no model call.
- `isStale` already returns true on a version mismatch: assert it against
  `'memory-v1'` in `src/lib/memory/summary.test.ts` so the pair of behaviours is
  visible in one place.

### Task 5: `tally.ts`

**Files:** create `src/lib/memory/tally.ts`, `src/lib/memory/tally.test.ts`

**Build:** §7's two tiers and the window-phrase strip.

**Verify:** `npm test -- tally`

FAIL corpus:
- `id`: `'The Empress muncul tiga kali minggu ini'`, `'dua kali The Moon'`,
  `'The Star datang 3 kali'`, `'The Moon (2×)'`, `'dua-duanya soal menunggu'`.
- `en`: `'The Empress showed up three times'`, `'twice it was The Moon'`,
  `'both times the same card'`, `'came up four'`, `'the count is clear'`.

**PASS corpus, which is the half that matters** — every one of these is a
correct output the check must not touch:
- `id`: `'Dua kartu itu berdiri berdampingan'`, `'bagus sekali'`,
  `'kartunya kembali berkali-kali'`, `'The Hermit menunggu di belakang keduanya'`.
- `en`: `'Those two cards stand together'`, `'once you decide, the week turns'`,
  `'The Star keeps returning'`, `'a run of days shaped the same way'`.

Window-phrase cases, first two written:
- `d13`/`id`: `'Tiga belas hari terakhir The Moon terus kembali'` with
  `windowPhrase: 'Tiga belas hari terakhir'` → clean; without the option → FAIL.
  This is the test that documents why the option exists.
- `d666`/`id`: `'666 hari terakhir ...'` → clean with the phrase, digit FAIL
  without.
- `d666`/`en`: `'The last 666 days have kept giving you The Moon'` → same. The
  English catalog is `'The last 666 days'` and `'The last thirteen days'`, so
  both locales need the strip and neither is a special case.

WARN tier: `'bagus sekali'` yields a `warn` hit and **no** `fail` hit, so a
caller filtering on `tier === 'fail'` is unaffected.

### Task 6: The new angles

**Files:** modify `src/lib/prompt/summary.ts`, `src/lib/prompt/summary.test.ts`

**Build:** the ten replacement strings from §4.

**Verify:** `npm test -- summary`
- Both locales still length 5; the rotation tests are untouched and still pass.
- The plain-option test's expected strings are updated and **neither contains
  the word `jumlah` / `counts`** — assert that directly, since the old plain
  option is precisely the string this workstream exists to delete.
- A new test: no angle in either locale contains a digit or matches
  `tallyProblems` at `fail` tier. The prompt must not itself be a tally.
- A new test: the English five and the Indonesian five use **disjoint images** —
  assert `FREQUENCY_ANGLES.en[1]` does not mention a room and
  `FREQUENCY_ANGLES.id[1]` does. Cheap, and it is W6 rule 3's five-second review
  made mechanical.

### Task 7: `buildFrequencyPrompt`

**Files:** modify `src/lib/prompt/summary.ts`

**Build:** §8.1–§8.3 in full, both locales, the collision branch,
`FREQUENCY_MAX_WORDS = 32`, `DOMINANCE_GLOSS`. Extend `frequencyFacts()` to
return `shadowName`, `shadowCollision`, `dominance` and `pulseNumber` alongside
what it already returns.

**Note while you are in there:** `frequencyFacts` is currently **exported and
called by nothing** — the route computes `angleIndexFor` itself. Wire the route's
`memory.frequency_generated` event to `frequencyFacts` in Task 14 rather than
leaving a second dead export.

**Verify:** `npm test -- summary` (updated in Task 8)

### Task 8: The frequency prompt tests

**Files:** modify `src/lib/prompt/summary.test.ts`

**Verify:** `npm test -- summary`. Replace the two count assertions with these:

- **`the user turn contains NO DIGIT AT ALL`** — `expect(p.user).not.toMatch(/\d/)`
  for a `week` result, both locales. The single most important test in this file.
- For a `d666` result, the user turn is digit-free once `windowPhrase('d666',
  locale)` is stripped.
- The user turn names all three cards; the system prompt names none of them
  (they are content, not rules — M10).
- The collision case: `ranked = [The Fool(0), The Empress(3)]` puts the collision
  paragraph in the system prompt, omits the third-card line from the user turn,
  and says `dua nama kartu saja` / `only two cards`.
- The prohibition is present in both locales and is **restated after the angle**
  — assert the last occurrence of `tanpa angka` sits after the angle string's
  index. §4.4's technique, pinned.
- `FREQUENCY_MAX_WORDS` interpolates as `32` in both locales.
- The existing `EMITS NO DELIMITER AT ALL` test still passes. Do not weaken it.
- The existing house-voice test still passes: no reader is named.

### Task 9: The day's derived values

**Files:** modify `src/lib/prompt/summary.ts`, `src/lib/prompt/summary.test.ts`

**Build:** `echoToday()` (`repeatedToday()` with the count kept internally for
ranking and dropped from the render), `dayShapeOf()`, and the
`dayShadowFor()` call.

**Verify:** `npm test -- summary`
- `echoToday` still ranks by occurrences then id, and renders `The Moon` with no
  parenthetical.
- Two echoes render `The Moon, The Tower` in rank order.
- `dayShapeOf(1) === 'single'`, `(3) === 'few'`, `(4) === 'crowded'`.
- The `BAYANGAN`/`SHADOW TODAY` line is absent when `dayShadowFor` collides, and
  absent for a single-card day.
- The existing `counts a card repeated within one spread` test survives with the
  count stripped from its expectation.

### Task 10: The six worked examples

**Files:** modify `src/lib/prompt/summary.ts`

**Build:** §8.6, on its own, in its own commit.

**Verify:** `npm test -- summary`
- A new test asserting **no `SUMMARY_DELTAS` string in either locale produces a
  `fail`-tier `tallyProblems` hit.** This is the guard that stops the tally
  walking back in through the examples, which is how it got here.
- The `gives the three readers visibly different direction` test still passes.
- A new test: the English examples name different cards from their Indonesian
  counterparts, per W6 rule 3 — assert `SUMMARY_DELTAS.en.thessaly` does not
  contain `The Hanged Man` while `.id.thessaly` does.

### Task 11: `buildDaySummaryPrompt`

**Files:** modify `src/lib/prompt/summary.ts`

**Build:** §8.4 and §8.5, both locales, `SUMMARY_MAX_WORDS = 50`.

**Verify:** `npm test -- summary` (updated in Task 12)

### Task 12: The day summary tests

**Files:** modify `src/lib/prompt/summary.test.ts`

**Verify:** `npm test -- summary`
- `BERGEMA HARI INI: The Moon` and `ECHO TODAY: The Moon`, with **no `(2 kali)`
  and no `(2×)`** — assert the absence explicitly, not just the new presence.
- `Bacaan hari ini:` / `Readings today:` are **gone** from the user turn.
- The list uses `- ` and the user turn contains no `1.` prefix.
- `SUMMARY_MAX_WORDS` interpolates as `50`.
- The `<riwayat-hari-ini>` block is still user-turn-only and the system prompt
  still carries none of its content — the existing test, unchanged.
- The six-distinct-system-prompts test still passes.
- The R16 test (`not.toContain('<penanya>')`) still passes.

### Task 13: The smoke script

**Files:** modify `scripts/smoke-llm.ts`

**Build:**
- `runFrequency` loops `['id', 'en']`, honouring `--locale`. Ten calls by
  default, five with the flag.
- Both runners import `FREQUENCY_MAX_WORDS` / `SUMMARY_MAX_WORDS` instead of
  hardcoding `25` / `45`.
- Both runners call `tallyProblems(clean, { locale, windowPhrase })` and push
  `fail` hits into `problems[]`; `warn` hits print on their own line.
- `runFrequency` prints the shadow card, the dominance bucket and the pulse
  number beside each line, so a flat set can be diagnosed.
- The Malay grep in `runSummary` stays `id`-only. **Do not run it over English.**
  W6 rule 4.
- Add one fixture pair to `runFrequency`'s five whose second card is **The
  Fool** (`[9, 4, 0, 3, 8]`), so the collision branch gets a real call and can be
  read. Six pairs, twelve calls.

**Verify:** `npm run smoke -- --frequency --locale id` — it runs, it prints, and
the checks report.

### Task 14: Events and the route

**Files:** modify `src/lib/analytics/events.ts`,
`src/app/api/memory/frequency/route.ts`, `src/app/api/memory/summary/route.ts`

**Build:** the prop deltas in `## Event deltas`. Route-side, replace the direct
`angleIndexFor` call with `frequencyFacts(result, locale)` and read the new
fields off it.

**Verify:** `npm test -- events` and `npm test -- analytics`. The taxonomy count
is **unchanged at 44** — assert it, because roadmap §6 requires reconciliation to
find 59 after all eight workstreams and V3 must contribute zero.

### Task 15: Run it, read it, tune it

**Files:** possibly `src/lib/prompt/summary.ts` (the two ceilings and the six
examples only)

```sh
npm run smoke -- --frequency
npm run smoke -- --summary
```

**This task is reading, and it is not optional.** The same instruction and the
same reason as `--lotus`.

Record in the commit message, for both locales:
- word counts for all twelve frequency lines and all six summaries;
- whether any line recites a tally the grep missed — **read for it by eye**, the
  grep is a floor and not a ceiling;
- whether the twelve frequency lines read as twelve sentences or as one sentence
  with the nouns swapped. Under twelve different angles that is a prompt problem;
  under one angle it is a fingerprint problem;
- **cover the names on the six summaries and guess the reader.** Under three of
  six, fix the paragraphs in `SUMMARY_DELTAS`, not the code. Same rule as
  `readers.ts`.

Then tune, in this order and no other: the ceiling if everything overruns; the
worked examples if a reader is unrecognisable; the angles if the set is flat.
**Never the code.**

### Task 16: The full gate

```sh
npm run typecheck
npm test
npm run db:up && npm run test:all
npm run build
npm run audit:secrets
```

`npm run build` is not skippable — `CLAUDE.md`'s TypeScript trap. If it dies on
`@vercel/turbopack-next/internal/font/google/font`, that is the AAAA DNS trap;
retry it.

Then the ten-second check that matters most, unchanged from W4: **stop the
database and load the reader picker.** The frequency line must render nothing
and the page must not break.

---

## Schema deltas

**None.** Agreeing with roadmap §4.

Every new value is a pure function of columns `frequency_verdicts` already
stores — `top_card_id`, `second_card_id` — or of counts that are recomputable
from `reading_cards` at any time. Storing `shadow_card_id` would be a
denormalization of `arcanaFor(top + second)`, which is a two-column addition and
a modulus; storing `dominance` would freeze a product threshold into rows and
mean that changing V3-5's ratio needs a backfill.

The one argument for a column is analytics: *"what does the distribution of
shadow cards look like?"* is a question someone will ask. It is answered by
`select (top_card_id + second_card_id) % 22, count(*) from frequency_verdicts
group by 1` and by the new `shadow_card_id` prop on
`memory.frequency_generated`, neither of which costs a migration.

---

## Event deltas

**No new event names.** The taxonomy stays at 44 and roadmap §6's target of 59
is untouched by V3. Two prop shapes widen, in W4's file, which reconciliation
folds:

```ts
'memory.frequency_generated': {
  window: string; top_card_id: number; second_card_id: number | null;
  sample: number; angle: number; total_ms: number;
  shadow_card_id: number;                                          // NEW
  shadow_collision: 'top' | 'second' | 'none';                     // NEW
  dominance: 'tied' | 'narrow' | 'clear' | 'overwhelming';         // NEW
  pulse: number;                                                   // NEW. reduce(m + n).
};

'memory.summary_generated': {
  reader_id: string; source_count: number; regeneration: boolean;
  generation_count: number; total_ms: number;
  shadow_card_id: number | null;                                   // NEW. Null on collision.
  echo_count: number;                                              // NEW. Distinct echo cards.
};
```

All scalars, all closed sets or small integers, no free text — `sanitizeProps()`
is untouched and the 24-key cap is nowhere near.

`sample` stays on `frequency_generated` and **that is not a VD2 violation**: VD2
forbids counts in the *output the querent reads*, not in analytics. `events` rows
are how "is the gate set right?" gets answered.

`memory.frequency_shown` and `memory.summary_shown` are unchanged. They fire on
the cached path too, where the derived values were not recomputed, and adding
fields that are sometimes absent would make every aggregate over them a
different measurement — the `latency_ms` argument.

---

## Interfaces I need

### From V1 — hard dependency, signatures assumed, **flag these**

V1's plan is being written in parallel, so these are assumptions taken from
roadmap §5 and §6. **If any signature differs, only `src/lib/memory/shadow.ts`
changes** — that is why Task 1 exists and why nothing else in V3 imports
`@/lib/numerology`.

```ts
// src/lib/numerology/index.ts — the facade, per roadmap §6
export function reduce(n: number): number;
// Digit-sum to a single digit, halting at 11/22/33. reduce(29) === 11.

export function arcanaFor(n: number): Card;
// CARDS[n % 22], from @/data/deck. RETURNS THE CARD OBJECT, not the id and not
// the name. V3 needs `.id` for the collision check and `.name` for the prompt,
// so a function returning only one of them costs V3 a second lookup.

export function glossForNumber(n: number, locale: Locale): string;
// The written line for 1-9 and 11/22/33, from glosses.ts's Localized<string>.
```

Three requirements on top of the signatures, each of which V3 will otherwise
have to work around:

1. **`glossForNumber` must be total over `reduce`'s range.** V3 calls it with
   `reduce(m + n)` for `m + n ≥ 5`, which can reach 11 and 22. A gloss table
   covering 1–9 but not the master numbers throws or returns `undefined` on a
   perfectly ordinary pair, and `undefined` interpolated into a prompt is
   `CLAUDE.md`'s `[object Object]` bug wearing a different hat.
2. **Each gloss must be ONE line of at most 20 words.** V3 interpolates it into a
   prompt with a 32-word output ceiling and instructs the model to say it in its
   own words. A three-sentence gloss will be pasted back and will blow the
   ceiling on its own. **Task 1 asserts the 20-word bound**, so a long gloss
   fails V3's tests rather than V3's smoke run.
3. **The glosses must be written per locale, not translated**, and the English
   ones must survive the `en` tic list — `soul's journey`, `divine timing`,
   `the Universe`. Roadmap §5 already says this; V3 restates it because V3's
   smoke run is where it will be caught.

`arcanaFor` is called with `a.id + b.id` (≤ 41) and with a day's card-id sum
(unbounded above; a heavy day could exceed 200). **It must fold any
non-negative integer**, not just `0..43`.

### From V2 — weak, and possibly nil

**V3 needs nothing blocking from V2, and V3 can be built as soon as V1 lands.**
Roadmap §8 lists V2 as a dependency; that appears to be conservatism rather than
a real edge, and saying so is useful to the build order.

The one place the two touch: VD5 lists `'daily_summary'` and
`'frequency_verdict'` among `translations.entity`'s values. **V3's position is
that neither should ever be translated**, and the argument is VD6's, unchanged:
both tables are **already keyed by locale**. `frequency_verdicts` is
`(user_id, window_key, locale)` and `daily_summaries` is
`(user_id, reader_id, local_date, locale)`. A locale switch is a cache miss and a
regeneration in the target locale, at the same cost as a translation call and
with better output — a line distilled in the target language beats a line
translated into it, which is exactly why `lotus_avatars.summary` is grandfathered.

So V2's concrete interface to V3 is a **negative** one, and it is the whole ask:
**do not add `source_locale` to `frequency_verdicts` or `daily_summaries`, and do
not route either through `translations`.** If V2 disagrees, it is V2's table and
reconciliation decides; V3's code is unaffected either way, because both routes
already look up by locale and already regenerate on a miss.

### From W4

`src/lib/analytics/events.ts` is W4's file. V3 contributes the two prop-shape
widenings above and adds no name.

---

## Open questions

1. **Should `readings` (the window's denominator) leave `fingerprintOf`?** It is
   now hashed but no longer reaches the prompt, so the key over-invalidates: a
   new reading that drew neither of the two cards changes the fingerprint and
   costs a background regeneration that produces the same sentence. W5 put it
   there because *"Strength five times out of seven readings and out of forty are
   different claims"* — which was true and is not any more, since the
   denominator is now deleted from the prompt. **This is a v0.2.0 decision (§3.4)
   and this plan does not touch it**; a superset key is the safe direction and the
   only cost is model calls on a path nobody waits for. Raising it because
   somebody should decide, not because V3 is blocked.

2. **Should the sample size reach the prompt as a bucket?** "This week, over five
   readings" and "this week, over forty" are genuinely different weights, and a
   bucket (`slim | steady | deep`) would carry it without carrying a number —
   exactly the dominance treatment. Not done here because it is a **sixth** idea
   in thirty-two words and V3-4's argument applies with more force to the shorter
   of the two prompts. Worth revisiting after Task 15's measurements.

3. **Does Margaret need a `SUMMARY_READER_OVERRIDE`?** She strains at 45 today
   and this workstream asks her to fit one more proper noun. 50 is the shared
   answer; if Task 15 finds her the only reader over it in both locales, the
   choice is a per-reader override in `summary.ts` mirroring `budget.ts`'s, or
   accepting that she runs long. **`budget.ts`'s open question — "whether
   Margaret is allowed to be longer than the other two" — is now open in a second
   place, and it should be answered once for both.**

4. **The pulse gloss is spoken, and a model handed a written line tends to paste
   it.** The prompt says "in your own words" twice; whether that holds is a Task
   15 reading, not a code question. If it does not, the fix is to hand the model
   the **number's keyword** rather than its sentence — which means V1's
   `glosses.ts` needs a short form alongside the long one, and that is a V1
   change. Flagging it early so V1 can decide whether to ship both shapes.

5. **`d666`'s window phrase carries digits into a prompt whose whole claim is
   that it carries none.** `tally.ts` strips it and the invariant is stated as
   "no digit except inside the window phrase", which is honest but weaker than
   what the other seven windows get. Renaming the catalog entry to
   `Hampir dua tahun terakhir` / `The last stretch of nearly two years` would
   make the invariant absolute — but the window is named `666` on purpose,
   `d666` is not on `VERDICT_LADDER`, and the message catalog is W6's file. Not
   changed here; recorded so `/jejak` does not meet it cold.

6. **Nothing in V3 verifies that the mysticism lands.** Roadmap §9's first risk
   is that this reads as generated filler — "replacing a tally with four
   sentences of vague cosmic language is not an improvement, it is a longer
   version of the same problem". The Shadow Arcana is a *specific card the
   querent recognises from their own deck*, which is the mitigation, and Task 15
   is the check. But the real check is Miftah reading twelve lines and saying
   whether it feels like perception. **That should happen before V6 and V7 build
   on top of it**, because the day summary is what V5's swipe deck slides in.

---

## Measured

Live z.ai, `glm-4.6`, 2026-07-28. Three `--frequency` runs (twelve lines each,
both locales) and three `--summary` runs (six each, both locales).

### VD2 held on every one of the thirty-six generations

**Zero tally FAILs. Zero digits. Zero counts by eye.** The mechanical half is
what did it: the counts are not in either user turn, so the model could not
recite one. No run needed the instruction to save it, which is the point — the
instruction is the second line of defence and the grep is the third.

### The frequency verdict

```
run   id words                    en words                   FAILs
1     28 30 29 28 23 26           19 23 26 27 31 21          2 (card name)
2     25 27 28 23 24 26           22 23 26 27 31 19          4 (card name)
3     24 28 26 26 26 26           21 23 21 26 27 26          0
```

Mean ≈ 25 against a ceiling of 32, but the distribution **does** reach 31–32, so
**the ceiling is not tightened.** §5's "if ten lines come in at 22–26, tighten to
28 and record it as measured" is not what happened; tightening on run 3 alone
would be chasing one favourable sample, which is exactly the mistake
`docs/provider-comparison.md` records about z.ai's famous `0.050`.

Six distinct lines per locale per run, four of the five angles reached. They read
as six sentences rather than one with the nouns swapped.

**Open question 4 is answered, and the answer is not the one the plan
predicted.** Run 1 showed the pulse gloss being **pasted verbatim** in
Indonesian — `angin yang tidak betah diam; begitu ada celah, dia lewat` is
gloss 5 including its semicolon, and it would have appeared identically for
every pair reducing to 5. The plan says the fix is V1 shipping a short form.
**It is not needed.** Run 2 forbade the wording *and* the imagery and pushed the
Indonesian half into abstraction (and a `capitals and all` clause of my own
making produced `THE HERMIT`); run 3 forbids the **wording** and allows the
**image**, and comes back clean with the cart-wheel and the late-night lamp
surviving as rebuilds rather than quotations. **V1's `glosses.ts` is unchanged.**

The four card-name FAILs across runs 1–2 were `the Hermit` (lowercase), `The
Hanged Men`, `The Foll` and `THE HERMIT`. All are the mechanical card-name check
doing its job, and all are gone in run 3.

### The day summary

**A REAL REGRESSION V3 INTRODUCED, CAUGHT BY THE SMOKE RUN AND BY NOTHING
ELSE.** Indonesian Margaret echoed the **entire `<riwayat-hari-ini>` block** back
before her answer, twice out of two, once narrating *"Wait, I have to check the
length."* — and was then cut off mid-word by `maxTokens`. Every unit test passed
throughout.

The cause is V3's own task text: it gained three paragraphs naming **lines inside
the block** (`BERGEMA`, `BAYANGAN HARI INI`, the shape word) and never said what
the OUTPUT is. The block became a structure to reproduce. One paragraph in each
locale fixes it — *"YANG KAMU TULIS HANYALAH KALIMAT SAPAANMU… tanpa menyalin
satu baris pun"*. Her totals went 103/106 → 45/51.

```
final run   id  thessaly 49  margaret 45  adrian 52     ceilings 50 / 65 / 50
            en  thessaly 24  margaret 51  adrian 40
```

One two-word overrun, on Adrian, in one run of six. That is variance and not
calibration, so `SUMMARY_MAX_WORDS` stays at 50.

**Blind read: 6 of 6 readers identified with the names covered.** Thessaly's
short declaratives, Margaret's one long subordinated sentence, Adrian's
`isn't`/`haven't`/`Just say it.` The six rewritten examples are doing their work.

**Open question 3 is closed by VD19 rather than by measurement.** Margaret gets
65 because her length is a fact about the reader, and `MARGARET_MULTIPLIER` in
`budget.ts` is the one place it is written.

### One thing the grep missed, which is why both runners say to read by eye

`berulang-ulang` is the same shape as `berkali-kali` and matched nothing, because
only the latter was in §7's list. Added at WARN with its English twins, and the
test names where it came from. **The grep is a floor, not a ceiling** — that
sentence in the plan earned itself in one run.

### The gate

`npm run typecheck` clean. `npm test` 1300 passed. `npm run test:integration`
137 passed. `npm run build` clean on the first attempt. `npm run audit:secrets`
clean — 44 files, 51 needles.

**Database-down check, run live against `npm run dev` with a real dev session:**
the reader picker renders **200** and the frequency line renders **nothing**,
which is the requirement. `GET /api/memory/frequency` returns **500** rather than
204, and `FrequencyLine` discards anything that is not a 200, so the user-visible
behaviour is correct. **That 500 is PRE-EXISTING W5 BEHAVIOUR AND NOT V3's** —
the route has never wrapped `firstPassingWindow`/`getVerdict` in a try/catch, and
V3 did not touch that. Worth someone's attention: a 204 would be the honest
status and would stop Next logging the failing query.

**And the route was exercised end to end with the database up**, on the seeded
history, which is the only check that proves the whole chain:

```
Minggu ini The Chariot dan The Hierophant menegakkan kendali telak di ladang
yang sengaja dikosongkan usai panen terakhir, ditenun oleh energi The Hanged Man.
```

Three cards, a dominance word (`telak`), a rebuilt pulse gloss, no count, no
digit. Compare with what v0.3.0 exists to delete: *"This week The Empress is
shown three times whilst The Chariot is shown two times."*
