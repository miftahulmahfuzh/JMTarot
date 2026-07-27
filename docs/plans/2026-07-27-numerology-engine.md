# V1 — Correspondence Engine Implementation Plan

> ### AMENDED 2026-07-27 AFTER RECONCILIATION — READ BEFORE THE PLAN BELOW
> `docs/plans/2026-07-27-RECONCILIATION-v0.3.0.md` outranks this file. Three
> changes, all in §5.3 and §5.4 there:
>
> 1. **`reduce` is IDEMPOTENT. 11, 22 and 33 are fixed points.** `reduce(11) = 11`,
>    not `2`. The roadmap's "preserved only as a sum, never as an input" wording
>    was wrong and this plan implemented it faithfully; the consequence it
>    correctly flagged — November contributing 2 while the 29th contributes 11 —
>    is what killed the rule. Every test and every worked example in this plan
>    that asserts `reduce(11) === 2`, `reduce(22) === 4` or `reduce(33) === 6`
>    inverts. `reduce(29) = 11` and `reduce(39) = 3` are unchanged.
> 2. **Dominance leaves V1.** Delete `Dominance`, `dominanceFor`,
>    `frequencyCorrespondence`, and the `dominance` field of `ShadowResult` from
>    the exports and the plan. V3 owns them (`src/lib/memory/frequency.ts` and
>    `src/lib/memory/shadow.ts`), because this plan itself records that the
>    thresholds are unmeasured and that V3 will tune them — a constant one
>    workstream owns and another tunes is the wrong seam.
>    `shadowArcana(top, second)` returns `{ top, second, shadow, shadowIsInPair,
>    pulse }`. **The exact-key-set test asserting no count-bearing field goes
>    with it to V3**; it is VD2's mechanical enforcement and must not be dropped
>    in the move.
> 3. **The vocabulary lists are NOT copied into `glosses.test.ts`.** This plan's
>    open question 5 is accepted: V3 creates `src/lib/copy/vocab.ts` (plain, pure,
>    **no `server-only` marker** — scripts import it) and this plan imports from
>    it. Do not land the fourth copy.
>
> Open questions 1, 3, 6 and 7 are all resolved in reconciliation §5.3/§5.4 and
> §1. Question 2 (`lifePath` living in `astrology.ts`) is **accepted as written**.

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers-extended-cc:executing-plans` to implement this plan task-by-task.

**Goal:** build the deterministic substrate the rest of v0.3.0 stands on. Numbers
in, meanings out — a life path from a birth date, four numbers from a name, a sun
sign with its element and modality, the Shadow Arcana standing behind a pair of
cards, and **one written line per correspondence, in both locales**. Nothing in
here calls a model, touches a database, or renders anything.

**Architecture:** six files under `src/lib/numerology/`, all pure, all
unit-tested, all importable from a client component and from an edge runtime.
`index.ts` is the only module anything outside the directory may import. The
directory's single external dependency is `@/data` — `Card`, `Element`, `Locale`,
`Localized` and `CARDS`. It may not import `@/lib/db/**`, `@/lib/i18n/**`,
`@/lib/prompt/**`, `next/*`, `react` or `server-only`, and there is a test that
fails if it ever does.

**Tech Stack:** TypeScript 5.x, Vitest (`--project unit`, no Docker, no network),
no new runtime dependency. Diacritic folding uses `String.prototype.normalize`,
which has been in every Node this project runs on since v0.12.

---

## 0. Read this before anything else

**Governing documents, highest first:**
`docs/plans/2026-07-27-RECONCILIATION-v0.3.0.md` (does not exist yet) →
`PUBLIC_RELEASE_ROADMAP_v0.3.0.md` → this file. **§5 of the v0.3.0 roadmap fixes
every formula in this plan and I have not invented one.** Where this plan looks
like it is choosing a formula, read the roadmap line it is quoting; the only
things V1 genuinely chooses are the dominance thresholds (§4.3) and the gloss
copy (§6), and both are argued for below.

`CLAUDE.md` binds in full. Four of its rules are load-bearing here and each has a
test behind it:

1. **`birth_date` is a `string`, never a `Date`.** `new Date('1994-07-26')` parses
   as UTC midnight and renders in the server's zone, which is a day out for
   anyone in Jakarta between midnight and 07:00. A sun sign computed that way is
   wrong for one person in twelve on their cusp day, silently, forever. This
   module **never constructs a `Date`.** It parses `'YYYY-MM-DD'` with a regex and
   does integer arithmetic. `src/lib/memory/windows.ts` needed `Date.UTC` because
   it does day arithmetic; this module does not, so it does not get one.
2. **No therapy, diagnosis, treatment or healing language, in either locale.**
   The glosses reach a prompt (V3, V8) *and* a screen (`/account`), so both halves
   of the rule apply. There is a grep test.
3. **Indonesian is not Malay.** The eleven-word grep from
   `scripts/smoke-llm.ts` runs over the `id` glosses.
4. **The English half is WRITTEN, not translated**, and a reviewer must be able to
   tell in five seconds. §6.1 states the mechanism and §6.5 is the test that
   enforces it.

Style reference for a pure-module-with-tests pair: `src/lib/memory/windows.ts` +
`windows.test.ts`. Match its register — the *why* goes in the file, in prose, at
the point where someone would otherwise undo it.

---

## 1. Decisions

Numbered `N*` so reconciliation can cite them. None of these contradicts the
roadmap; where the roadmap already decided, the row says so and gives the
consequence a future session will otherwise "fix".

| # | Decision | Choice | Why |
|---|---|---|---|
| N1 | Master numbers as an input | **`reduce(11) === 2`.** A master is preserved only when a *summing step* lands on it. | Roadmap §5, verbatim: "Master numbers are preserved only when they appear as a *sum*, never as an input." Its consequence is counter-intuitive and is spelled out in §2.2: **November contributes 2 to a life path, but the 29th contributes 11.** That asymmetry looks like a bug and is the contract. |
| N2 | `reduce(0)` | **`0`.** Zero is already a single digit; there is nothing to sum. | The alternative — throwing, or returning 1 — hides the real question, which is "what produced a zero?". The answer is always "a name with no letters, or no vowels, or no consonants", and §2.3 handles that at the gematria layer by returning `null` instead of a number. `0` never reaches a gloss lookup, because `GlossNumber` does not include it and there is no cast anywhere in the module. |
| N3 | Bad input to `reduce` | **`RangeError`.** Non-finite, negative, or non-integer. | Every argument `reduce` receives is a sum this module computed. A negative one is a programming error, not a data error, and a silently-wrong number here becomes a wrong life path on a user's `/account` page with nothing to trace it to. Contrast `windowBounds`, which returns `null` because its inputs are user data. |
| N4 | Diacritic folding | **NFD + strip combining marks, then an explicit eight-entry table for the letters NFD does not decompose.** | `é` → `e` falls out of NFD for free. `ø`, `đ`, `ł`, `æ`, `œ`, `ð`, `þ` are *not* precomposed base+mark characters, so NFD leaves them intact and the `[^A-Z]` filter would silently delete them — turning `Bjørn` into `BJRN` and changing his Expression number. `ß` needs nothing: `'ß'.toUpperCase()` is already `'SS'` in JS. The table is small, explicit, and tested; a dependency for this would be absurd. |
| N5 | Empty / letterless names | **`null`, never `0`.** | `expression('---')` is not "the number zero", it is "there is no number". Returning `null` makes the caller branch, and makes `GlossNumber` a total type. V8's `/account` renders nothing for a null; a `0` would render a caption for a number the system does not have a gloss for. |
| N6 | Y | **A vowel iff neither neighbour is in `AEIOU`.** A `Y` next to a `Y` is still a vowel by this rule (neither neighbour is in `AEIOU`) unless the *other* neighbour is a vowel. | Roadmap §5. The three named test cases pin it: `MAYA` (one Y, both neighbours vowels → consonant), `YUDI` (Y at the start, next letter `U` → consonant), `RAYYAN` (both Ys have a vowel on one side → both consonants). See §3.3 for the worked table, because the rule reads simply and is easy to implement backwards. |
| N7 | Where `lifePath` lives | **`astrology.ts`**, not a sixth file. | Roadmap §6 fixes the file list at five plus `index.ts`, and describes `astrology.ts` as "date → sign / element / modality". Life path is also date → number, and it needs the same `'YYYY-MM-DD'` parser. One parser, one file, one place a malformed date is rejected. Adding `date.ts` would be a sixth file the module map does not have; putting the parser in `reduce.ts` would make the leaf depend on the branch. Flagged in `## Open questions` so reconciliation sees it deliberately. |
| N8 | Dominance thresholds | **Two conditions, both integer, both required.** See §4.3. | A ratio alone calls 20-vs-17 "clear"; a difference alone calls 5-vs-2 and 20-vs-17 the same thing. Neither is defensible on its own and the combination is, so both are in. Integer comparisons (`3m >= 4n`) rather than a float ratio, because a bucket that flips on a floating-point rounding is a bucket that produces two different sentences from one unchanged fact — and W5's fingerprint cache is downstream of exactly that. |
| N9 | Glosses are impersonal | **No second person, no address, no imperative. 8–16 words.** | They are dual-role copy (roadmap §5, and the `positionFraming` precedent, I14). As prompt grounding the model turns them into "you"; as an `/account` caption under the words "Life path 7" a second-person sentence reads like a fortune cookie shouting at the reader. One register that works in both places beats two strings that drift. |
| N10 | Glosses are not in the message catalog | **`Localized<string>` here, per roadmap §5.** | Same reason `positionFraming` is in `src/data/types.ts` and `cardMeaning` is in `cards.json`: splitting one string across the catalog and the prompt layer guarantees the screen and the prompt eventually disagree. `src/lib/i18n/catalog` is also forbidden to this directory (it is not a leaf), so the catalog is not even reachable. |
| N11 | The engine never returns a count | **`frequencyCorrespondence()` takes `m` and `n` and returns no number derived from them except `pulse` and `dominance`.** | VD2's mechanical enforcement, stated in roadmap §5: "It is never handed `m` or `n`. That is the mechanical enforcement of VD2 and it is stronger than any instruction: the model cannot recite a count it was never given." The type is the enforcement — V3 physically cannot interpolate a tally it does not hold. |
| N12 | `shadowIsInPair` is returned, not hidden | A boolean on the result. | `arcanaFor(a.id + b.id)` equals `a` or `b` **exactly when The Fool (id 0) is one of the pair**, because `x + 0 ≡ x (mod 22)`. "The card standing behind The Fool and The Hermit is The Hermit" is a sentence V3 must not generate. Computing it here rather than leaving V3 to rediscover `id === 0` costs one field and one test. |

---

## 2. `reduce.ts`

### 2.1 The public surface

```ts
export const MASTER_NUMBERS = [11, 22, 33] as const;
export type MasterNumber = (typeof MASTER_NUMBERS)[number];

/** Every value a gloss exists for. Deliberately excludes 0 — see N2. */
export type GlossNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | MasterNumber;

export function isMaster(n: number): n is MasterNumber;
export function isGlossNumber(n: number): n is GlossNumber;
export function reduce(n: number): number;
export function reduceToGloss(n: number): GlossNumber | null;
```

### 2.2 The rule, and the thing everyone gets wrong

```
reduce(n):
  if n is not a non-negative safe integer -> RangeError          (N3)
  if n < 10 -> n                                                 (0..9 pass through)
  loop:
    n = sum of decimal digits of n
    if n is 11, 22 or 33 -> return n                             (the HALT)
    if n < 10 -> return n
```

The halt check is **after** a summing step and never on the argument. That single
placement is the whole of N1:

| call | trace | result |
|---|---|---|
| `reduce(29)` | 2+9 = **11** → halt | `11` |
| `reduce(38)` | 3+8 = **11** → halt | `11` |
| `reduce(39)` | 3+9 = 12 → 1+2 = 3 | `3` |
| `reduce(11)` | 11 ≥ 10, so it sums: 1+1 = 2 | **`2`** |
| `reduce(22)` | 2+2 = 4 | **`4`** |
| `reduce(33)` | 3+3 = 6 | **`6`** |
| `reduce(0)` | already single-digit | `0` |
| `reduce(9)` | already single-digit | `9` |
| `reduce(499)` | 4+9+9 = **22** → halt | `22` |
| `reduce(6999)` | 6+9+9+9 = **33** → halt | `33` |

**THE CONSEQUENCE A FUTURE SESSION WILL TRY TO FIX.** A standard numerology book
keeps the master when a *component* is 11 — so someone born in November gets an
11 for the month. Under N1 they do not: `reduce(11)` is `2`. But someone born on
the 29th does, because `reduce(29)` reaches 11 by summing. **November → 2, the
29th → 11.** This is asymmetric, it is the roadmap's stated rule, V3 and V8 are
both written against it, and changing it changes every persona and every verdict
in the database. Do not change it without reconciliation. There is a test named
after this paragraph.

`reduceToGloss(n)` is `reduce(n)` narrowed: it returns `null` when the reduction
is `0` and a `GlossNumber` otherwise. **It exists so that no file in this module
ever writes `as GlossNumber`.** A cast here would be a runtime `undefined` handed
to a prompt, which — as `CLAUDE.md` records about the `Localized<>` facades —
does not throw and produces a fluent reading generated with no contract at all.

### 2.3 Tasks

---

#### Task 1 — `reduce()` and the master-number halt

**Write the failing test.** Create `src/lib/numerology/reduce.test.ts`:

```ts
/**
 * Digit reduction and the master-number rule (roadmap §5, plan §2.2).
 *
 * Every row of the trace table in the plan is a named test here, because the
 * halt-after-summing placement is invisible in the implementation and load-
 * bearing for every number the app derives.
 */
import { describe, expect, it } from 'vitest';
import { MASTER_NUMBERS, isMaster, reduce } from './reduce';

describe('reduce', () => {
  it('passes single digits through untouched', () => {
    for (let n = 0; n <= 9; n++) expect(reduce(n)).toBe(n);
  });

  it('halts on 11 when a summing step lands there: reduce(29) === 11', () => {
    expect(reduce(29)).toBe(11);
    expect(reduce(38)).toBe(11);
    expect(reduce(92)).toBe(11);
  });

  it('does NOT halt on 12, so reduce(39) === 3', () => {
    // 39 -> 12 -> 3. Twelve is not a master number and the loop must continue.
    expect(reduce(39)).toBe(3);
  });

  it('halts on 22 and on 33', () => {
    expect(reduce(499)).toBe(22);
    expect(reduce(6999)).toBe(33);
  });

  it('reduce(0) is 0 — there is nothing to sum (N2)', () => {
    expect(reduce(0)).toBe(0);
  });

  it('REDUCES A MASTER NUMBER GIVEN AS AN INPUT (N1). November is 2, the 29th is 11.', () => {
    // The rule is "preserved only as a SUM, never as an input" (roadmap §5).
    // This is the test that stops someone "fixing" the asymmetry.
    expect(reduce(11)).toBe(2);
    expect(reduce(22)).toBe(4);
    expect(reduce(33)).toBe(6);
    // And the other half of the same sentence, so the pair is visible together:
    expect(reduce(29)).toBe(11);
  });

  it('is idempotent on its own output except for the masters', () => {
    for (let n = 0; n < 2000; n++) {
      const once = reduce(n);
      if (isMaster(once)) continue;
      expect(reduce(once)).toBe(once);
    }
  });

  it('never returns anything outside 0..9 plus the masters', () => {
    const allowed = new Set<number>([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, ...MASTER_NUMBERS]);
    for (let n = 0; n < 5000; n++) expect(allowed.has(reduce(n))).toBe(true);
  });

  it('throws a RangeError on anything that is not a non-negative safe integer (N3)', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => reduce(bad)).toThrow(RangeError);
    }
  });
});
```

**Run it.** `export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH && npm test -- numerology`
— fails, no module.

**Implement.** Create `src/lib/numerology/reduce.ts`:

```ts
/**
 * Digit reduction, and the one rule everything else in this directory sits on.
 *
 * PURE. No imports at all. This is the leaf of the leaf: `gematria.ts`,
 * `astrology.ts` and `arcana.ts` all reduce, and none of them may re-implement
 * it — two implementations of a rule with a halt condition agree right up until
 * they do not, and the disagreement surfaces as one number on `/account` and a
 * different one in a persona generated the same afternoon.
 *
 * THE HALT IS CHECKED AFTER A SUMMING STEP AND NEVER ON THE ARGUMENT, and that
 * placement is the whole of the roadmap's rule: "Master numbers are preserved
 * only when they appear as a sum, never as an input" (v0.3.0 §5). So
 * `reduce(29)` is 11 and `reduce(11)` is 2.
 *
 * ITS CONSEQUENCE LOOKS LIKE A BUG AND IS NOT: a life path takes
 * `reduce(MM)`, so NOVEMBER CONTRIBUTES 2, while `reduce(DD)` for the 29th
 * CONTRIBUTES 11. A numerology book would keep the 11 in both. V3's verdicts
 * and V8's personas are both computed against this rule and stored; changing it
 * silently rewrites the meaning of every row already written. If you think it is
 * wrong, that is a reconciliation question, not a patch.
 */

export const MASTER_NUMBERS = [11, 22, 33] as const;

export type MasterNumber = (typeof MASTER_NUMBERS)[number];

/**
 * Every value a gloss exists for.
 *
 * DELIBERATELY EXCLUDES 0. `reduce(0)` is 0 — see the module header — but zero
 * is not a numerological quality, it is the signature of a name with no letters.
 * Keeping it out of this union is what makes `reduceToGloss` return `null`
 * instead of the module acquiring an `as GlossNumber` cast, and a cast here
 * would hand `undefined` to a prompt, which does not throw.
 */
export type GlossNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | MasterNumber;

const GLOSS_NUMBERS = new Set<number>([1, 2, 3, 4, 5, 6, 7, 8, 9, ...MASTER_NUMBERS]);

export function isMaster(n: number): n is MasterNumber {
  return (MASTER_NUMBERS as readonly number[]).includes(n);
}

export function isGlossNumber(n: number): n is GlossNumber {
  return GLOSS_NUMBERS.has(n);
}

/** Sum of the decimal digits. `n` must already be a non-negative integer. */
function digitSum(n: number): number {
  let total = 0;
  let rest = n;
  while (rest > 0) {
    total += rest % 10;
    rest = Math.floor(rest / 10);
  }
  return total;
}

/**
 * Fold `n` to a single digit, halting on 11, 22 or 33.
 *
 * Throws rather than returning null on bad input (plan N3): every argument this
 * function receives is a sum computed inside this module, so a negative or
 * fractional one is a programming error and a silently-wrong life path is
 * untraceable. `windowBounds` returns null because its inputs are user data;
 * these are not.
 */
export function reduce(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`reduce() needs a non-negative safe integer, got ${n}`);
  }
  let value = n;
  while (value >= 10) {
    value = digitSum(value);
    if (isMaster(value)) return value;
  }
  return value;
}

/**
 * `reduce`, narrowed to the values a gloss exists for.
 *
 * Null exactly when the reduction is 0, which happens exactly when the input is
 * 0. THIS IS THE ONLY BRIDGE FROM ARITHMETIC TO THE GLOSS TABLES, and it exists
 * so that no file in this directory writes `as GlossNumber`.
 */
export function reduceToGloss(n: number): GlossNumber | null {
  const r = reduce(n);
  return isGlossNumber(r) ? r : null;
}
```

**Run.** `npm test -- numerology` — green.

**Commit.** `git add -A && git commit -m "V1 Task 1: digit reduction with the master-number halt"`

---

#### Task 2 — `reduceToGloss` and the `GlossNumber` narrowing

**Write the failing test.** Append to `reduce.test.ts`:

```ts
import { isGlossNumber, reduceToGloss } from './reduce';

describe('reduceToGloss', () => {
  it('is null only for 0', () => {
    expect(reduceToGloss(0)).toBeNull();
    for (let n = 1; n < 500; n++) expect(reduceToGloss(n)).not.toBeNull();
  });

  it('agrees with reduce everywhere it is not null', () => {
    for (let n = 1; n < 500; n++) expect(reduceToGloss(n)).toBe(reduce(n));
  });

  it('isGlossNumber rejects 0 and 10 and accepts the masters', () => {
    expect(isGlossNumber(0)).toBe(false);
    expect(isGlossNumber(10)).toBe(false);
    expect(isGlossNumber(11)).toBe(true);
    expect(isGlossNumber(33)).toBe(true);
  });
});
```

If Task 1's implementation is as written above this is already green — that is
fine and is the point of writing it as a separate test: it pins the *contract*
`glosses.ts` depends on, so a later "simplification" of `reduce.ts` cannot drop
it silently.

**Run.** `npm test -- numerology`. **Commit.** `git commit -am "V1 Task 2: pin the GlossNumber narrowing contract"`

---

## 3. `gematria.ts`

### 3.1 The public surface

```ts
export const PYTHAGOREAN: Readonly<Record<string, number>>;   // 'A'..'Z' -> 1..9
export function normalizeName(raw: string): string;            // -> /^[A-Z]*$/
export function letterValue(letter: string): number;           // 0 for anything not A-Z
export function vowelFlags(letters: string): boolean[];        // Y resolved, per position
export function expression(fullName: string): GlossNumber | null;
export function soulUrge(fullName: string): GlossNumber | null;
export function personality(fullName: string): GlossNumber | null;
export function nicknamePulse(nickname: string): GlossNumber | null;

export type NameNumbers = {
  expression: GlossNumber | null;
  soulUrge: GlossNumber | null;
  personality: GlossNumber | null;
};
export function nameNumbers(fullName: string): NameNumbers;
```

### 3.2 Normalization (N4)

```
raw
  -> .normalize('NFD')            é (U+00E9) becomes e + U+0301
  -> strip /[̀-ͯ]/g     the combining marks NFD just exposed
  -> .toUpperCase()               'ß' becomes 'SS' here, for free
  -> fold the eight NFD misses    Ø→O  Đ→D  Ł→L  Æ→AE  Œ→OE  Ð→D  Þ→TH  Ŋ→NG
  -> .replace(/[^A-Z]/g, '')      spaces, apostrophes, hyphens, digits, CJK
```

**The order matters and the second step is why.** Uppercasing before stripping
marks would still work for Latin, but `.toUpperCase()` on a decomposed string can
recompose in some engines; stripping first means the filter only ever sees base
letters. **The eight-entry table exists because NFD does not decompose them** —
`'ø'.normalize('NFD')` is still `'ø'`, one code point, and the `[^A-Z]` filter
would delete it. `Bjørn` must be `BJORN`, not `BJRN`; the two differ by 6 in the
Expression sum, which is a different number and a different card.

Indonesian names need almost none of this. `é` and `ç` appear (`José`, `François`
in mixed families), `Ŋ` never does. The table is here because the app takes a
free-text `fullName` from anybody with a Google account, and a name silently
losing a letter is the kind of thing nobody reports and nobody notices.

### 3.3 The Y rule (N6)

`Y` is a **vowel** iff neither the character before it nor the character after it
is in `AEIOU`. Out-of-range neighbours (start/end of string) count as "not a
vowel". Everything in `AEIOU` is always a vowel; everything else is always a
consonant.

| name | normalized | per-letter | soul urge letters | personality letters |
|---|---|---|---|---|
| `MAYA` | `MAYA` | M c, A v, Y **c** (A before), A v | `A A` | `M Y A`? no — `M Y` |
| `YUDI` | `YUDI` | Y **c** (U after), U v, D c, I v | `U I` | `Y D` |
| `RAYYAN` | `RAYYAN` | R c, A v, Y **c** (A before), Y **c** (A after), A v, N c | `A A` | `R Y Y N` |
| `LYN` | `LYN` | L c, Y **v** (L and N), N c | `Y` | `L N` |
| `YSMAY` | `YSMAY` | Y **v** (start, S after), S c, M c, A v, Y **c** (A before) | `Y A` | `S M Y` |

Worked sums for the three named cases:

- `MAYA` — letters M4 A1 Y7 A1. Expression `reduce(13)` = 4. Soul urge
  `reduce(1+1)` = 2. Personality `reduce(4+7)` = `reduce(11)` = **2** (N1 again).
- `YUDI` — Y7 U3 D4 I9. Expression `reduce(23)` = 5. Soul urge `reduce(3+9)` =
  `reduce(12)` = 3. Personality `reduce(7+4)` = `reduce(11)` = **2**.
- `RAYYAN` — R9 A1 Y7 Y7 A1 N5. Expression `reduce(30)` = 3. Soul urge
  `reduce(2)` = 2. Personality `reduce(9+7+7+5)` = `reduce(28)` = `reduce(10)` =
  1.

Compute these by hand when writing the test. **Do not let the implementation
generate the expectations** — that is how a backwards Y rule gets frozen into a
passing suite.

### 3.4 Tasks

---

#### Task 3 — the Pythagorean table and `normalizeName`

**Write the failing test.** Create `src/lib/numerology/gematria.test.ts`:

```ts
/**
 * Pythagorean gematria (VD3, roadmap §5, plan §3).
 *
 * The Y-vowel table in plan §3.3 is reproduced as named tests below, and every
 * expected sum in this file was computed by hand from the letter table. If you
 * change one, recompute it by hand too.
 */
import { describe, expect, it } from 'vitest';
import { PYTHAGOREAN, letterValue, normalizeName } from './gematria';

describe('the Pythagorean table (VD3)', () => {
  it('is A=1..I=9, J=1..R=9, S=1..Z=8', () => {
    expect('ABCDEFGHI'.split('').map(letterValue)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect('JKLMNOPQR'.split('').map(letterValue)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect('STUVWXYZ'.split('').map(letterValue)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('covers all 26 letters and nothing else', () => {
    expect(Object.keys(PYTHAGOREAN)).toHaveLength(26);
  });

  it('gives 0 to anything that is not an A-Z letter', () => {
    for (const ch of ['a', ' ', '-', "'", '1', 'é', '中', '']) expect(letterValue(ch)).toBe(0);
  });
});

describe('normalizeName', () => {
  it('uppercases and drops everything that is not a letter', () => {
    expect(normalizeName("Miftahul Mahfuzh")).toBe('MIFTAHULMAHFUZH');
    expect(normalizeName("O'Brien-Smith 3rd")).toBe('OBRIENSMITHRD');
  });

  it('folds combining diacritics to ASCII', () => {
    expect(normalizeName('José')).toBe('JOSE');
    expect(normalizeName('François')).toBe('FRANCOIS');
    expect(normalizeName('Nguyễn')).toBe('NGUYEN');
    expect(normalizeName('Ångström')).toBe('ANGSTROM');
  });

  it('folds the letters NFD does NOT decompose (N4) instead of deleting them', () => {
    // 'ø'.normalize('NFD') is still one code point. Without the explicit table
    // the [^A-Z] filter deletes it and BJORN becomes BJRN, which is a different
    // Expression number for the same person.
    expect(normalizeName('Bjørn')).toBe('BJORN');
    expect(normalizeName('Łukasz')).toBe('LUKASZ');
    expect(normalizeName('Đặng')).toBe('DANG');
    expect(normalizeName('Æthel')).toBe('AETHEL');
    expect(normalizeName('Straße')).toBe('STRASSE');
  });

  it('is empty, not a throw, for a name with no Latin letters', () => {
    expect(normalizeName('   ')).toBe('');
    expect(normalizeName('王小明')).toBe('');
  });

  it('is idempotent', () => {
    const once = normalizeName('José Ångström-Bjørn');
    expect(normalizeName(once)).toBe(once);
  });
});
```

**Run.** `npm test -- numerology` — fails.

**Implement.** Create `src/lib/numerology/gematria.ts` with the header, the table,
the fold map and `normalizeName` / `letterValue`:

```ts
/**
 * Pythagorean gematria: a name -> four numbers (VD3, roadmap §5).
 *
 * ONE SYSTEM, NAMED ONCE. VD3 picked Pythagorean over Chaldean so that two
 * workstreams cannot each produce a different Expression number for one person.
 * A=1..I=9, J=1..R=9, S=1..Z=8. It is a pure lookup and it handles Indonesian
 * names without transliteration, which Chaldean does not.
 *
 * NORMALIZATION IS NFD PLUS AN EXPLICIT TABLE, AND THE TABLE IS NOT OPTIONAL.
 * `String.prototype.normalize('NFD')` splits precomposed letters into a base and
 * a combining mark, so stripping U+0300..U+036F turns é into e for free. It does
 * NOTHING for ø, đ, ł, æ, œ, ð and þ, which are single code points with no
 * decomposition — so without the table below the `[^A-Z]` filter DELETES them
 * and `Bjørn` silently becomes `BJRN`, six lower in the sum and a different
 * card. `ß` needs no entry: `'ß'.toUpperCase()` is already 'SS'.
 */
import { type GlossNumber, reduceToGloss } from './reduce';

/** A=1..I=9, J=1..R=9, S=1..Z=8. */
export const PYTHAGOREAN: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((ch, i) => [ch, (i % 9) + 1]),
  ),
);

/** The letters NFD leaves alone. See the module header. */
const FOLD: Readonly<Record<string, string>> = Object.freeze({
  Ø: 'O', Đ: 'D', Ł: 'L', Æ: 'AE', Œ: 'OE', Ð: 'D', Þ: 'TH', Ŋ: 'NG',
});

const COMBINING = /[̀-ͯ]/g;

export function letterValue(letter: string): number {
  return PYTHAGOREAN[letter] ?? 0;
}

/** Fold to `/^[A-Z]*$/`. Idempotent. Never throws. */
export function normalizeName(raw: string): string {
  const stripped = raw.normalize('NFD').replace(COMBINING, '').toUpperCase();
  let folded = '';
  for (const ch of stripped) folded += FOLD[ch] ?? ch;
  return folded.replace(/[^A-Z]/g, '');
}
```

Note `(i % 9) + 1` reproduces the table exactly: index 0..8 → 1..9, 9..17 → 1..9,
18..25 → 1..8. The test above asserts all three runs rather than trusting the
arithmetic.

**Run.** `npm test -- numerology`. **Commit.** `git commit -am "V1 Task 3: Pythagorean table and diacritic-folding normalizer"`

---

#### Task 4 — `expression` and `nicknamePulse`

**Write the failing test.** Append to `gematria.test.ts`:

```ts
import { expression, nicknamePulse } from './gematria';

describe('expression — reduce(sum of every letter of the full name)', () => {
  it('MAYA is 4', () => {
    // M4 A1 Y7 A1 = 13 -> 4. Computed by hand from the letter table.
    expect(expression('Maya')).toBe(4);
  });

  it('YUDI is 5', () => {
    // Y7 U3 D4 I9 = 23 -> 5.
    expect(expression('Yudi')).toBe(5);
  });

  it('RAYYAN is 3', () => {
    // R9 A1 Y7 Y7 A1 N5 = 30 -> 3.
    expect(expression('Rayyan')).toBe(3);
  });

  it('ignores spacing, case, punctuation and diacritics', () => {
    expect(expression('  ma-ya  ')).toBe(expression('MAYA'));
    expect(expression('Mayá')).toBe(expression('Maya'));
  });

  it('is null, not 0, for a name with no letters (N5)', () => {
    expect(expression('')).toBeNull();
    expect(expression('   ')).toBeNull();
    expect(expression('王小明')).toBeNull();
  });
});

describe('nicknamePulse', () => {
  it('is the same arithmetic as expression, on a different string', () => {
    // Separate from Expression on purpose (roadmap §5): the nickname is what
    // the reader says out loud, and both names are supposed to count.
    expect(nicknamePulse('Maya')).toBe(expression('Maya'));
  });

  it('differs from expression when the nickname is not the full name', () => {
    expect(nicknamePulse('Yudi')).not.toBe(expression('Yudi Prasetyo'));
  });

  it('is null for an empty nickname', () => {
    expect(nicknamePulse('')).toBeNull();
  });
});
```

**Implement.** Append to `gematria.ts`:

```ts
function sumOf(letters: string): number {
  let total = 0;
  for (const ch of letters) total += letterValue(ch);
  return total;
}

/**
 * Every letter of the full name, reduced.
 *
 * NULL AND NOT ZERO for a name with no Latin letters (plan N5). Zero is not a
 * numerological quality; it is "there is no number here", and the caller must
 * branch. `/account` renders nothing for a null and would render a caption for
 * a 0.
 */
export function expression(fullName: string): GlossNumber | null {
  const letters = normalizeName(fullName);
  return letters === '' ? null : reduceToGloss(sumOf(letters));
}

/**
 * The nickname's own total. Deliberately not `expression` under another name.
 *
 * Roadmap §5 keeps them separate because Miftah asked for both names to count
 * and the nickname is the one the reader actually says. They coincide only when
 * the two strings do.
 */
export function nicknamePulse(nickname: string): GlossNumber | null {
  const letters = normalizeName(nickname);
  return letters === '' ? null : reduceToGloss(sumOf(letters));
}
```

**Run.** `npm test -- numerology`. **Commit.** `git commit -am "V1 Task 4: expression and nickname pulse"`

---

#### Task 5 — the Y rule, `soulUrge` and `personality`

**Write the failing test.** Append to `gematria.test.ts`:

```ts
import { personality, soulUrge, vowelFlags } from './gematria';

describe('Y is a vowel only when it is not adjacent to a vowel (N6)', () => {
  // The table in plan §3.3, one row per test, so a failure names the case.
  const flags = (name: string) => vowelFlags(name).map((v) => (v ? 'v' : 'c')).join('');

  it('MAYA: the Y sits between two vowels, so it is a consonant', () => {
    expect(flags('MAYA')).toBe('cvcv');
  });

  it('YUDI: a leading Y followed by U is a consonant', () => {
    expect(flags('YUDI')).toBe('cvcv');
  });

  it('RAYYAN: both Ys touch a vowel on one side, so both are consonants', () => {
    expect(flags('RAYYAN')).toBe('cvccvc');
  });

  it('LYN: a Y with consonants on both sides IS a vowel', () => {
    expect(flags('LYN')).toBe('cvc');
  });

  it('YSMAY: a leading Y before a consonant is a vowel; a trailing Y after A is not', () => {
    expect(flags('YSMAY')).toBe('vccvc');
  });

  it('a lone Y is a vowel — both neighbours are out of range', () => {
    expect(flags('Y')).toBe('v');
  });
});

describe('soul urge — reduce(sum of vowels), Y resolved per N6', () => {
  it('MAYA is 2 (A + A = 2)', () => {
    expect(soulUrge('Maya')).toBe(2);
  });

  it('YUDI is 3 (U3 + I9 = 12 -> 3)', () => {
    expect(soulUrge('Yudi')).toBe(3);
  });

  it('RAYYAN is 2 (A + A = 2)', () => {
    expect(soulUrge('Rayyan')).toBe(2);
  });

  it('counts a vowel-Y: LYN is 7', () => {
    expect(soulUrge('Lyn')).toBe(7);
  });

  it('is null when the name has no vowels at all (N5)', () => {
    expect(soulUrge('Ng')).toBeNull();
    expect(soulUrge('')).toBeNull();
  });
});

describe('personality — reduce(sum of consonants)', () => {
  it('MAYA is 2 (M4 + Y7 = 11, and reduce(11) is 2 by N1)', () => {
    // Worth its own comment: 11 arrives here as an INPUT to reduce, not as a
    // digit sum, so the master is not preserved. See plan §2.2.
    expect(personality('Maya')).toBe(2);
  });

  it('YUDI is 2 (Y7 + D4 = 11 -> 2)', () => {
    expect(personality('Yudi')).toBe(2);
  });

  it('RAYYAN is 1 (R9 + Y7 + Y7 + N5 = 28 -> 10 -> 1)', () => {
    expect(personality('Rayyan')).toBe(1);
  });

  it('is null when the name is all vowels', () => {
    expect(personality('Aia')).toBeNull();
  });
});

describe('the three name numbers are internally consistent', () => {
  it('vowel sum plus consonant sum is the whole-name sum, for every test name', () => {
    // Not an identity on the REDUCED values — reduce is not additive. This
    // asserts the partition, which is the thing that can actually be wrong.
    for (const name of ['Maya', 'Yudi', 'Rayyan', 'Miftahul Mahfuzh', 'Lyn']) {
      const letters = normalizeName(name);
      const v = vowelFlags(letters);
      const vs = letters.split('').filter((_, i) => v[i]).map(letterValue);
      const cs = letters.split('').filter((_, i) => !v[i]).map(letterValue);
      const total = letters.split('').map(letterValue).reduce((a, b) => a + b, 0);
      expect(vs.reduce((a, b) => a + b, 0) + cs.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});
```

**Implement.** Append to `gematria.ts`:

```ts
const HARD_VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/**
 * Per-position vowel/consonant, with the Y rule resolved (roadmap §5, plan N6).
 *
 * Y IS A VOWEL ONLY WHEN NEITHER NEIGHBOUR IS IN AEIOU. An out-of-range
 * neighbour — the start or the end of the string — counts as "not a vowel", so a
 * lone `Y` is a vowel and `YUDI`'s leading Y is not.
 *
 * EXPORTED, and not a private helper, because the rule is the part of this file
 * most likely to be implemented backwards and the test table in the plan reads
 * it directly. `soulUrge` and `personality` are then two filters over one
 * decision, which is also what makes them provably complementary.
 *
 * `letters` must already be normalized. Anything not in A-Z is treated as a
 * consonant, which cannot happen for a normalized string and is the safe
 * direction if it ever does.
 */
export function vowelFlags(letters: string): boolean[] {
  return letters.split('').map((ch, i) => {
    if (HARD_VOWELS.has(ch)) return true;
    if (ch !== 'Y') return false;
    const before = letters[i - 1];
    const after = letters[i + 1];
    return !HARD_VOWELS.has(before ?? '') && !HARD_VOWELS.has(after ?? '');
  });
}

function partSum(letters: string, wantVowels: boolean): number {
  const flags = vowelFlags(letters);
  let total = 0;
  for (const [i, ch] of letters.split('').entries()) {
    if (flags[i] === wantVowels) total += letterValue(ch);
  }
  return total;
}

/** Vowels only, Y resolved. Null when the name has none. */
export function soulUrge(fullName: string): GlossNumber | null {
  const sum = partSum(normalizeName(fullName), true);
  return sum === 0 ? null : reduceToGloss(sum);
}

/** Consonants only, Y resolved. Null when the name has none. */
export function personality(fullName: string): GlossNumber | null {
  const sum = partSum(normalizeName(fullName), false);
  return sum === 0 ? null : reduceToGloss(sum);
}

export type NameNumbers = {
  expression: GlossNumber | null;
  soulUrge: GlossNumber | null;
  personality: GlossNumber | null;
};

/** All three at once, so a caller normalizes the name conceptually once. */
export function nameNumbers(fullName: string): NameNumbers {
  return {
    expression: expression(fullName),
    soulUrge: soulUrge(fullName),
    personality: personality(fullName),
  };
}
```

**Run.** `npm test -- numerology`. **Commit.** `git commit -am "V1 Task 5: the Y-vowel rule, soul urge and personality"`

---

## 4. `astrology.ts` and `arcana.ts`

### 4.1 The date parser — and why there is no `Date` in this file

```ts
export type IsoDateParts = { year: number; month: number; day: number };
export function parseIsoDate(iso: string): IsoDateParts | null;
```

`CLAUDE.md`: *"`local_date` and `birth_date` are `string`, not `Date`, on purpose
… a `Date` renders in the server's zone and is a day out for anyone in Jakarta
between midnight and 07:00. It looks plausible while being wrong."* A sun sign is
exactly the shape of thing that looks plausible while being wrong: a Jakarta
querent born on 23 July is a Leo, and `new Date('1994-07-23').getMonth()/getDate()`
on a server west of UTC gives 22 July and Cancer. **This module constructs no
`Date` at all** — not even `Date.UTC`, which `windows.ts` needs only because it
does day arithmetic. Validation is `daysInMonth(y, m)` with a leap-year rule, in
integer arithmetic.

Rejects: anything not matching `/^(\d{4})-(\d{2})-(\d{2})$/`, month outside 1–12,
day outside 1..`daysInMonth`, year 0. Accepts `2028-02-29`, rejects `2027-02-29`.

### 4.2 The sign table

| sign | from | to | element | modality |
|---|---|---|---|---|
| aries | Mar 21 | Apr 19 | fire | cardinal |
| taurus | Apr 20 | May 20 | earth | fixed |
| gemini | May 21 | Jun 20 | air | mutable |
| cancer | Jun 21 | Jul 22 | water | cardinal |
| leo | Jul 23 | Aug 22 | fire | fixed |
| virgo | Aug 23 | Sep 22 | earth | mutable |
| libra | Sep 23 | Oct 22 | air | cardinal |
| scorpio | Oct 23 | Nov 21 | water | fixed |
| sagittarius | Nov 22 | Dec 21 | fire | mutable |
| capricorn | Dec 22 | Jan 19 | earth | cardinal |
| aquarius | Jan 20 | Feb 18 | air | fixed |
| pisces | Feb 19 | Mar 20 | water | mutable |

These are the conventional tropical boundaries. **They are approximate and that
is fine, because VD4 already ruled out the alternative:** the true ingress moves
by up to a day year to year and pinning it needs an ephemeris, which is exactly
the "fabricated data presented as fact" VD4 refuses. A fixed table is honest
about being a table.

**Capricorn wraps the year** and is the only sign that does. The implementation
encodes a date as `month * 100 + day` and walks the eleven non-wrapping ranges;
anything that matches none is Capricorn. That is one branch instead of a
special-cased comparison, and it is the branch a test can prove exhaustively —
§4.5 Task 7 walks all 366 days of a leap year and asserts every one lands in
exactly one sign.

`Element` is imported from `@/data/types` and **not redeclared** — the card data
already uses `'fire' | 'earth' | 'air' | 'water'` and two declarations of the
same four-member union agree right up until they do not (reconciliation R4's
argument about `Locale`, applied again).

### 4.3 Dominance (N8)

Given the top card's count `m` and the runner-up's `n`, with `m >= n` guaranteed
by W5's `rankCounts` and `m >= 3, n >= 2` guaranteed by `FREQUENCY_GATE`:

```
tied           m === n
overwhelming   m >= 2n   AND   m - n >= 3
clear          3m >= 4n  AND   m - n >= 2
narrow         otherwise
```

Checked in that order. **Two conditions per bucket, both integer, because either
one alone is indefensible:**

- *Ratio alone.* `m=3, n=2` is a 1.5× ratio and would be "clear", but it is one
  extra appearance. Anyone looking at their own history would call that a
  coincidence.
- *Difference alone.* `m=5, n=2` and `m=20, n=17` are both `d=3`. The first is a
  card that came up more than twice as often; the second is a dead heat. Calling
  them the same thing is the failure that makes a generated verdict read as
  filler.

Worked buckets, all of them legal under the M4 gate:

| m | n | d | 2n | 4n/3 | bucket |
|---|---|---|---|---|---|
| 4 | 4 | 0 | — | — | `tied` |
| 3 | 2 | 1 | 4 | 2.67 | `narrow` (d < 2) |
| 4 | 3 | 1 | 6 | 4 | `narrow` (d < 2) |
| 12 | 10 | 2 | 20 | 13.3 | `narrow` (3m=36 < 4n=40) |
| 20 | 17 | 3 | 34 | 22.7 | `narrow` |
| 4 | 2 | 2 | 4 | 2.67 | `clear` (m ≥ 2n but d < 3) |
| 5 | 3 | 2 | 6 | 4 | `clear` |
| 7 | 4 | 3 | 8 | 5.33 | `clear` (d ≥ 3 but m < 2n) |
| 12 | 9 | 3 | 18 | 12 | `clear` (3m=36 = 4n=36, boundary) |
| 5 | 2 | 3 | 4 | 2.67 | `overwhelming` |
| 6 | 3 | 3 | 6 | 4 | `overwhelming` |
| 8 | 4 | 4 | 8 | 5.33 | `overwhelming` |

`3m >= 4n` rather than `m / n >= 1.333` on purpose: **a bucket that can flip on a
floating-point rounding is a bucket that produces two different sentences from
one unchanged fact**, and W5's `fingerprintOf` caches the generated line against
the facts. The integer form is exact and the `12 / 9` boundary row above is the
test that pins it.

`dominanceFor` is total: it accepts `m < n` (returns the bucket for the swapped
pair, since the arithmetic is symmetric under the guard) and negative counts
throw via `reduce`… no — it takes counts directly and does no reduction, so it
guards its own inputs: non-negative safe integers, `RangeError` otherwise, same
rule as N3.

### 4.4 The Shadow Arcana

```
shadow  = arcanaFor(top.cardId + second.cardId)
pulse   = reduce(top.count + second.count)
```

`arcanaFor(n) = CARDS[((n % 22) + 22) % 22]` — the double modulo so a negative
never indexes off the end, even though nothing in this release passes one.
`CARDS` is ordered by `id` (0–21, Fool's Journey order) and `CARDS[i].id === i` is
asserted by a test, because the whole mapping rests on that and `cards.json` is
generated.

**A master number maps through its own value** (roadmap §5): `arcanaFor(11)` is
Justice, `arcanaFor(22)` is `CARDS[0]`, The Fool. That is the traditional
correspondence and it costs nothing.

`shadowIsInPair` (N12) is `shadow.id === top.cardId || shadow.id === second.cardId`,
which happens **exactly when one of the pair is The Fool**, because `x + 0 ≡ x
(mod 22)`. There is a test asserting both directions of that equivalence over all
231 unordered pairs, because "the card behind The Fool and The Hermit is The
Hermit" is a sentence V3 must be able to avoid generating.

Pulse is never 0: the gate guarantees `m + n >= 5`.

### 4.5 Tasks

---

#### Task 6 — `parseIsoDate`

**Write the failing test.** Create `src/lib/numerology/astrology.test.ts`:

```ts
/**
 * Birth-date correspondences (VD4, roadmap §5, plan §4).
 *
 * NOT ONE `new Date()` IN THE MODULE UNDER TEST, and the last test in this file
 * is what keeps it that way. `birth_date` is a string because a Date renders in
 * the server's zone and is a day out for Jakarta — and a cusp birthday is
 * precisely where that shows up as the wrong sign.
 */
import { describe, expect, it } from 'vitest';
import { parseIsoDate } from './astrology';

describe('parseIsoDate', () => {
  it('parses a well-formed date into integers', () => {
    expect(parseIsoDate('1994-07-26')).toEqual({ year: 1994, month: 7, day: 26 });
  });

  it('rejects anything that is not exactly YYYY-MM-DD', () => {
    for (const bad of ['1994-7-26', '94-07-26', '1994/07/26', '1994-07-26T00:00:00Z',
                       ' 1994-07-26', '1994-07-26 ', '', 'yesterday']) {
      expect(parseIsoDate(bad)).toBeNull();
    }
  });

  it('rejects an out-of-range month or day', () => {
    for (const bad of ['1994-00-10', '1994-13-10', '1994-07-00', '1994-07-32',
                       '1994-04-31', '1994-02-30']) {
      expect(parseIsoDate(bad)).toBeNull();
    }
  });

  it('knows its leap years', () => {
    expect(parseIsoDate('2028-02-29')).not.toBeNull();   // divisible by 4
    expect(parseIsoDate('2027-02-29')).toBeNull();
    expect(parseIsoDate('2000-02-29')).not.toBeNull();   // divisible by 400
    expect(parseIsoDate('1900-02-29')).toBeNull();       // divisible by 100, not 400
  });
});
```

**Implement.** Create `src/lib/numerology/astrology.ts` with the header,
`parseIsoDate`, `daysInMonth` and `isLeap`.

**Run / commit.** `git commit -am "V1 Task 6: the string-only ISO date parser"`

---

#### Task 7 — `sunSign`, the cusps, and the 366-day sweep

**Write the failing test.** Append to `astrology.test.ts`:

```ts
import { SIGNS, ZODIAC, sunSign } from './astrology';

/** Shorthand: the sign for a month/day in a non-leap year. */
const at = (md: string) => sunSign(`1994-${md}`)?.sign ?? null;

describe('sun sign cusps — the whole test surface (VD4)', () => {
  // Every boundary in the table, both sides. If a row here is wrong the app
  // tells one person in twelve that they are the wrong sign, on their birthday.
  const cusps: [string, string, string, string][] = [
    ['03-20', 'pisces', '03-21', 'aries'],
    ['04-19', 'aries', '04-20', 'taurus'],
    ['05-20', 'taurus', '05-21', 'gemini'],
    ['06-20', 'gemini', '06-21', 'cancer'],
    ['07-22', 'cancer', '07-23', 'leo'],
    ['08-22', 'leo', '08-23', 'virgo'],
    ['09-22', 'virgo', '09-23', 'libra'],
    ['10-22', 'libra', '10-23', 'scorpio'],
    ['11-21', 'scorpio', '11-22', 'sagittarius'],
    ['12-21', 'sagittarius', '12-22', 'capricorn'],
    ['01-19', 'capricorn', '01-20', 'aquarius'],
    ['02-18', 'aquarius', '02-19', 'pisces'],
  ];
  for (const [lastDay, lastSign, firstDay, firstSign] of cusps) {
    it(`${lastDay} is ${lastSign} and ${firstDay} is ${firstSign}`, () => {
      expect(at(lastDay)).toBe(lastSign);
      expect(at(firstDay)).toBe(firstSign);
    });
  }

  it('Capricorn is the only sign that wraps the year', () => {
    expect(at('12-31')).toBe('capricorn');
    expect(at('01-01')).toBe('capricorn');
  });

  it('29 February is Pisces, in a leap year', () => {
    expect(sunSign('2028-02-29')?.sign).toBe('pisces');
  });

  it('assigns exactly one sign to every day of a leap year', () => {
    // 366 assertions. This is what proves there is no gap and no overlap in the
    // table, which eyeballing twelve ranges does not.
    const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let n = 0;
    for (const [i, count] of days.entries()) {
      for (let d = 1; d <= count; d++) {
        const iso = `2028-${String(i + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        expect(sunSign(iso), iso).not.toBeNull();
        n++;
      }
    }
    expect(n).toBe(366);
  });

  it('is null for an invalid date rather than guessing', () => {
    expect(sunSign('1994-02-30')).toBeNull();
    expect(sunSign('nope')).toBeNull();
  });
});

describe('element and modality', () => {
  it('gives four elements and three modalities across twelve signs', () => {
    expect(ZODIAC).toHaveLength(12);
    const els = ZODIAC.map((s) => SIGNS[s].element);
    const mods = ZODIAC.map((s) => SIGNS[s].modality);
    for (const e of ['fire', 'earth', 'air', 'water']) {
      expect(els.filter((x) => x === e)).toHaveLength(3);
    }
    for (const m of ['cardinal', 'fixed', 'mutable']) {
      expect(mods.filter((x) => x === m)).toHaveLength(4);
    }
  });

  it('walks fire-earth-air-water in zodiac order', () => {
    // The elements cycle every four signs and the modalities every three. That
    // is a real property of the zodiac and it catches a mistyped row instantly.
    expect(ZODIAC.map((s) => SIGNS[s].element)).toEqual(
      ['fire', 'earth', 'air', 'water', 'fire', 'earth', 'air', 'water',
       'fire', 'earth', 'air', 'water'],
    );
    expect(ZODIAC.map((s) => SIGNS[s].modality)).toEqual(
      ['cardinal', 'fixed', 'mutable', 'cardinal', 'fixed', 'mutable',
       'cardinal', 'fixed', 'mutable', 'cardinal', 'fixed', 'mutable'],
    );
  });

  it('Cancer is cardinal water and Leo is fixed fire', () => {
    expect(sunSign('1994-07-01')).toEqual({ sign: 'cancer', element: 'water', modality: 'cardinal' });
    expect(sunSign('1994-08-01')).toEqual({ sign: 'leo', element: 'fire', modality: 'fixed' });
  });
});

describe('the module constructs no Date', () => {
  it('has no `new Date`, no `Date.UTC` and no `Date.parse` in its source', () => {
    // CLAUDE.md's trap, asserted at the source level because the symptom is a
    // one-day error that only appears for users west of the server's zone.
    const src = readFileSync(new URL('./astrology.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/new Date|Date\.UTC|Date\.parse/);
  });
});
```

(Add `import { readFileSync } from 'node:fs';` at the top.)

**Implement.** Append `ZodiacSign`, `Modality`, `ZODIAC`, `SIGNS`, `SunFacts` and
`sunSign` to `astrology.ts`. Implementation sketch:

```ts
export const ZODIAC = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
] as const;
export type ZodiacSign = (typeof ZODIAC)[number];
export type Modality = 'cardinal' | 'fixed' | 'mutable';

export type SunFacts = { sign: ZodiacSign; element: Element; modality: Modality };

/** `[from, to]` as month*100+day. Capricorn is absent because it wraps. */
const RANGES: readonly (readonly [ZodiacSign, number, number])[] = [
  ['aries', 321, 419], ['taurus', 420, 520], ['gemini', 521, 620],
  ['cancer', 621, 722], ['leo', 723, 822], ['virgo', 823, 922],
  ['libra', 923, 1022], ['scorpio', 1023, 1121], ['sagittarius', 1122, 1221],
  ['aquarius', 120, 218], ['pisces', 219, 320],
];

export function sunSign(birthDate: string): SunFacts | null {
  const parts = parseIsoDate(birthDate);
  if (!parts) return null;
  const md = parts.month * 100 + parts.day;
  const sign = RANGES.find(([, from, to]) => md >= from && md <= to)?.[0] ?? 'capricorn';
  return { sign, ...SIGNS[sign] };
}
```

**Run / commit.** `git commit -am "V1 Task 7: sun sign, element and modality with a 366-day sweep"`

---

#### Task 8 — `lifePath`

**Write the failing test.** Append to `astrology.test.ts`:

```ts
import { lifePath } from './astrology';

describe('life path — reduce(reduce(YYYY) + reduce(MM) + reduce(DD))', () => {
  it('1994-07-26: reduce(1994)=5, reduce(7)=7, reduce(26)=8 -> reduce(20)=2', () => {
    // 1+9+9+4 = 23 -> 5.  7.  2+6 = 8.  5+7+8 = 20 -> 2.
    expect(lifePath('1994-07-26')).toBe(2);
  });

  it('preserves a master reached by the OUTER sum: 1990-05-24 is 11', () => {
    // 1+9+9+0 = 19 -> 10 -> 1.  5.  2+4 = 6.  1+5+6 = 12 -> 3.  <- not this one
    // Recompute by hand before trusting any expectation in this block.
    expect(lifePath('1990-05-24')).toBe(3);
  });

  it('NOVEMBER CONTRIBUTES 2, NOT 11 (N1). This is the asymmetry, asserted.', () => {
    // reduce(11) = 2 because 11 arrives as an INPUT. Meanwhile reduce(29) = 11
    // because it arrives as a digit SUM. Both halves in one test on purpose.
    // 2000-11-05: reduce(2000)=2, reduce(11)=2, reduce(5)=5 -> reduce(9)=9.
    expect(lifePath('2000-11-05')).toBe(9);
    // 2000-01-29: reduce(2000)=2, reduce(1)=1, reduce(29)=11 -> reduce(14)=5.
    expect(lifePath('2000-01-29')).toBe(5);
  });

  it('is null for an invalid date', () => {
    expect(lifePath('1994-02-30')).toBeNull();
    expect(lifePath('')).toBeNull();
  });

  it('is never null for a valid date — the components are all >= 1', () => {
    for (const iso of ['0001-01-01', '2028-02-29', '9999-12-31']) {
      expect(lifePath(iso)).not.toBeNull();
    }
  });
});
```

**Recompute every expectation in that block by hand before running it.** The
sketch above deliberately contains one line where the comment corrects the test
name; resolve it by arithmetic, not by running the code.

**Implement.** Append to `astrology.ts`:

```ts
/**
 * `reduce(reduce(YYYY) + reduce(MM) + reduce(DD))` — roadmap §5, verbatim.
 *
 * WHY THIS IS IN THE ASTROLOGY FILE (plan N7). §6's module map fixes five files
 * plus the facade and describes this one as "date -> sign / element / modality".
 * Life path is also date -> number and needs the same parser, and one parser is
 * the point: one place a malformed birth date is rejected, one leap-year rule.
 * A sixth file would be off the map; putting the parser in `reduce.ts` would
 * make the leaf depend on the branch.
 *
 * COMPONENTS ARE REDUCED BEFORE SUMMING and the roadmap says why: it is the
 * standard method and the only one that produces master numbers at the right
 * rate. See `reduce`'s header for the consequence about November.
 */
export function lifePath(birthDate: string): GlossNumber | null {
  const p = parseIsoDate(birthDate);
  if (!p) return null;
  return reduceToGloss(reduce(p.year) + reduce(p.month) + reduce(p.day));
}
```

**Run / commit.** `git commit -am "V1 Task 8: the life path number"`

---

#### Task 9 — `arcanaFor` and the deck invariant

**Write the failing test.** Create `src/lib/numerology/arcana.test.ts`:

```ts
/**
 * Numbers to cards, and the Shadow Arcana (roadmap §5, plan §4.4).
 */
import { describe, expect, it } from 'vitest';
import { CARDS } from '@/data/deck';
import { arcanaFor } from './arcana';

describe('arcanaFor', () => {
  it('the deck is index-addressable: CARDS[i].id === i for all 22', () => {
    // The whole mapping rests on this and `cards.json` is GENERATED, so it is
    // asserted rather than assumed.
    expect(CARDS).toHaveLength(22);
    CARDS.forEach((c, i) => expect(c.id).toBe(i));
  });

  it('maps 0..21 to themselves', () => {
    for (let n = 0; n < 22; n++) expect(arcanaFor(n).id).toBe(n);
  });

  it('wraps at 22: arcanaFor(22) is The Fool', () => {
    expect(arcanaFor(22).name).toBe('The Fool');
    expect(arcanaFor(23).name).toBe('The Magician');
    expect(arcanaFor(41).id).toBe(19);
  });

  it('maps a master number through its own value (roadmap §5)', () => {
    expect(arcanaFor(11).name).toBe('Justice');
    expect(arcanaFor(22).name).toBe('The Fool');
    expect(arcanaFor(33).id).toBe(11);
  });

  it('never indexes off the end, even for a negative', () => {
    for (let n = -50; n < 100; n++) expect(arcanaFor(n)).toBeDefined();
    expect(arcanaFor(-1).id).toBe(21);
  });
});
```

**Implement.** Create `src/lib/numerology/arcana.ts` with the header and
`arcanaFor`.

**Run / commit.** `git commit -am "V1 Task 9: number to Major Arcana"`

---

#### Task 10 — `dominanceFor`

**Write the failing test.** Append to `arcana.test.ts` — one `it` per row of the
§4.3 table, plus:

```ts
import { type Dominance, dominanceFor } from './arcana';

describe('dominance buckets (N8)', () => {
  const cases: [number, number, Dominance][] = [
    [4, 4, 'tied'],
    [3, 2, 'narrow'],
    [4, 3, 'narrow'],
    [12, 10, 'narrow'],
    [20, 17, 'narrow'],
    [4, 2, 'clear'],
    [5, 3, 'clear'],
    [7, 4, 'clear'],
    [12, 9, 'clear'],
    [5, 2, 'overwhelming'],
    [6, 3, 'overwhelming'],
    [8, 4, 'overwhelming'],
  ];
  for (const [m, n, want] of cases) {
    it(`${m} vs ${n} is ${want}`, () => expect(dominanceFor(m, n)).toBe(want));
  }

  it('20 vs 17 and 5 vs 2 have the same difference and different buckets', () => {
    // The single sentence that justifies not using the difference alone.
    expect(dominanceFor(20, 17)).toBe('narrow');
    expect(dominanceFor(5, 2)).toBe('overwhelming');
  });

  it('12 vs 9 is the exact 4:3 boundary and lands on clear', () => {
    // 3*12 === 4*9. An implementation using `m / n >= 1.333` gets this wrong.
    expect(dominanceFor(12, 9)).toBe('clear');
    expect(dominanceFor(11, 9)).toBe('narrow');
  });

  it('is symmetric under swapping, so a mis-ordered pair cannot invert the bucket', () => {
    expect(dominanceFor(2, 5)).toBe('overwhelming');
  });

  it('throws on a non-integer or negative count', () => {
    expect(() => dominanceFor(3.5, 2)).toThrow(RangeError);
    expect(() => dominanceFor(3, -1)).toThrow(RangeError);
  });
});
```

**Implement.** Append to `arcana.ts`:

```ts
export type Dominance = 'overwhelming' | 'clear' | 'narrow' | 'tied';

/**
 * How far ahead the top card is, as a BUCKET and never as a number.
 *
 * VD2 forbids a count reaching the page, and a bucket cannot accidentally be
 * recited. This is the last place `m` and `n` exist; nothing downstream of
 * `frequencyCorrespondence` ever sees them.
 *
 * TWO CONDITIONS PER BUCKET, BOTH REQUIRED, BOTH INTEGER (plan N8):
 *   - a ratio alone calls 3-vs-2 "clear", which is one extra appearance
 *   - a difference alone calls 5-vs-2 and 20-vs-17 the same thing
 * and `3 * m >= 4 * n` rather than `m / n >= 1.333` because a bucket that flips
 * on a floating-point rounding produces two different sentences from one
 * unchanged fact -- and W5's fingerprint cache is keyed on those facts.
 *
 * Symmetric under swapping: `rankCounts` guarantees `m >= n`, and a caller that
 * hands them over the other way should get the same reading of the pair rather
 * than a silently inverted one.
 */
export function dominanceFor(topCount: number, secondCount: number): Dominance {
  for (const v of [topCount, secondCount]) {
    if (!Number.isSafeInteger(v) || v < 0) {
      throw new RangeError(`dominanceFor() needs non-negative safe integers, got ${v}`);
    }
  }
  const m = Math.max(topCount, secondCount);
  const n = Math.min(topCount, secondCount);
  const d = m - n;
  if (d === 0) return 'tied';
  if (m >= 2 * n && d >= 3) return 'overwhelming';
  if (3 * m >= 4 * n && d >= 2) return 'clear';
  return 'narrow';
}
```

**Run / commit.** `git commit -am "V1 Task 10: dominance bucketing"`

---

#### Task 11 — `shadowArcana`

**Write the failing test.** Append to `arcana.test.ts`:

```ts
import { shadowArcana } from './arcana';

describe('the Shadow Arcana', () => {
  it('is arcanaFor(a.id + b.id)', () => {
    // The Empress (3) and The Chariot (7) -> 10, Wheel of Fortune.
    const r = shadowArcana({ cardId: 3, count: 5 }, { cardId: 7, count: 2 });
    expect(r?.shadow.name).toBe('Wheel of Fortune');
  });

  it('carries the pulse, reduce(m + n)', () => {
    expect(shadowArcana({ cardId: 3, count: 5 }, { cardId: 7, count: 2 })?.pulse).toBe(7);
    // 8 + 3 = 11, and 11 here is a SUM reaching reduce as an input... which N1
    // reduces to 2. Written out because it is the confusing case.
    expect(shadowArcana({ cardId: 1, count: 8 }, { cardId: 2, count: 3 })?.pulse).toBe(2);
  });

  it('carries the dominance bucket and NOT the counts', () => {
    const r = shadowArcana({ cardId: 3, count: 5 }, { cardId: 7, count: 2 });
    expect(r?.dominance).toBe('overwhelming');
    expect(Object.keys(r ?? {})).toEqual(
      expect.not.arrayContaining(['count', 'topCount', 'secondCount', 'm', 'n']),
    );
  });

  it('flags shadowIsInPair EXACTLY when The Fool is one of the pair (N12)', () => {
    for (let a = 0; a < 22; a++) {
      for (let b = a + 1; b < 22; b++) {
        const r = shadowArcana({ cardId: a, count: 3 }, { cardId: b, count: 2 });
        expect(r?.shadowIsInPair, `${a}+${b}`).toBe(a === 0 || b === 0);
      }
    }
  });

  it('is null for a card id outside 0..21 rather than wrapping silently', () => {
    expect(shadowArcana({ cardId: 22, count: 3 }, { cardId: 2, count: 2 })).toBeNull();
    expect(shadowArcana({ cardId: -1, count: 3 }, { cardId: 2, count: 2 })).toBeNull();
  });
});
```

**Implement.** Append to `arcana.ts`:

```ts
export type CountedCard = { cardId: number; count: number };

export type ShadowResult = {
  top: Card;
  second: Card;
  /** The card standing behind the pair: `arcanaFor(a.id + b.id)`. */
  shadow: Card;
  /**
   * True exactly when the shadow IS one of the pair, which happens exactly when
   * The Fool (0) is in the pair. V3 needs a different sentence for that case.
   */
  shadowIsInPair: boolean;
  pulse: GlossNumber;
  dominance: Dominance;
};

/**
 * The frequency mechanic, roadmap §5. Note what is NOT on the return type.
 */
export function shadowArcana(top: CountedCard, second: CountedCard): ShadowResult | null {
  const inDeck = (n: number) => Number.isInteger(n) && n >= 0 && n < CARDS.length;
  if (!inDeck(top.cardId) || !inDeck(second.cardId)) return null;
  const pulse = reduceToGloss(top.count + second.count);
  if (pulse === null) return null;
  const shadow = arcanaFor(top.cardId + second.cardId);
  return {
    top: CARDS[top.cardId],
    second: CARDS[second.cardId],
    shadow,
    shadowIsInPair: shadow.id === top.cardId || shadow.id === second.cardId,
    pulse,
    dominance: dominanceFor(top.count, second.count),
  };
}
```

**Run / commit.** `git commit -am "V1 Task 11: the Shadow Arcana, pulse and dominance"`

---

## 5. Interlude — the register the glosses are written in

Before writing a single line of copy, fix the register, because these 62
sentences are the part of V1 that cannot be recovered by reading the code.

**They are impersonal (N9).** No "you", no imperative, no address. A gloss is a
*caption on a quality*, not a sentence spoken to the querent. The prompt turns it
into second person; `/account` prints it under a numeral.

**Length: 8–16 words.** Long enough to say something specific, short enough that
a prompt can carry six of them without displacing the reading, and short enough
to sit under a number on a 390px screen without wrapping to four lines.

**They name a cost, not only a virtue.** "Number 4 is stable and reliable" is
horoscope filler. "Slow work that holds, bought with freedom given up early" is a
sentence a person recognises. Every gloss below has an edge in it, and the edge is
what stops V3's verdicts and V8's persona from reading as flattery — which was
the actual failure mode logged in the v0.3.0 risk table ("the mysticism reads as
generated filler").

**No therapy, no diagnosis, no healing, in either locale.** This is
`CLAUDE.md`'s constraint and it binds harder here than in a reading, because a
gloss is *reused* — one bad word appears in every persona forever. `anxiety` is
still not forbidden and is still not used.

---

## 6. `glosses.ts`

### 6.1 The written-not-translated mechanism, and how to check it in five seconds

W6's enforcement was structural: the English worked examples use *different
cards* from the Indonesian ones, so a reviewer who sees The Tower in the English
example knows it was translated. This file needs the same kind of tell, and here
it is:

> **The Indonesian half is built on concrete physical images. The English half is
> built on action and consequence. If an English gloss names the object its
> Indonesian counterpart names, it was translated.**
>
> Five-second check: pick any three number keys. Read the Indonesian — you should
> be able to *see* something (a rope, a cart wheel, a lamp on a table at night).
> Read the English — you should not see anything; you should be told what the
> number *does* and what it *costs*. If both halves show you the same rope, that
> pair is a translation and it must be rewritten in one of the two.

That is enforced by a real test, not only by this paragraph. §6.5's
`DIVERGENCE` table lists, for each of the twelve number keys, the English word
its Indonesian image would translate to, and asserts that word is absent from the
English gloss. It is hand-maintained and twelve rows long, which is small enough
to keep true and large enough to catch a lazy rewrite.

**The element glosses are exempt from `DIVERGENCE`** and the file says so: they
name the element itself (`Api:` / `Fire`), which is a fixed term and not an
image. Their divergence is in the clause after the colon and is checked by eye.

### 6.2 The tables

```ts
export const NUMBER_GLOSSES: Record<GlossNumber, Localized<string>>;
export const SIGN_GLOSSES:   Record<ZodiacSign, Localized<string>>;
export const ELEMENT_GLOSSES: Record<Element, Localized<string>>;
export const MODALITY_GLOSSES: Record<Modality, Localized<string>>;

export function numberGloss(n: GlossNumber, locale: Locale): string;
export function signGloss(s: ZodiacSign, locale: Locale): string;
export function elementGloss(e: Element, locale: Locale): string;
export function modalityGloss(m: Modality, locale: Locale): string;
```

`Record<GlossNumber, …>` and not `Record<number, …>`: a missing key is then a
compile error, which is the same argument `Localized<T>` makes one level down.
Thirty-one keys, sixty-two strings, no fallback — `catalogFor`'s I3 rule ("an
unknown key returns THE KEY, on purpose") does not apply because there are no
unknown keys by construction.

### 6.3 The copy — numbers

| n | `id` | `en` |
|---|---|---|
| 1 | Awal yang berdiri sendiri: satu langkah dulu, jalannya belakangan. | Acts first, and answers for whatever follows from acting first. |
| 2 | Dua tali yang harus ditarik bersamaan; satu tangan saja tidak cukup. | Nothing here moves until two people agree, so patience does most of the work. |
| 3 | Suara yang keluar duluan, sebelum kalimatnya selesai disusun. | Makes things by talking about them, and scatters about half of what it makes. |
| 4 | Batu, tiang, pagar — yang dipasang pelan supaya tidak roboh. | Slow work that holds, bought with freedom given up early. |
| 5 | Angin yang tidak betah diam; begitu ada celah, dia lewat. | Change arrives faster than the plan for it, and routine loses. |
| 6 | Beban yang dipikul karena sayang, bukan karena disuruh. | Takes responsibility for other people, and is tired in a way it chose. |
| 7 | Satu lampu di meja larut malam, dan pertanyaan yang dibawa masuk sendirian. | Prefers understanding to company, so the answers arrive late and arrive whole. |
| 8 | Roda gerobak yang berat: susah didorong, susah dihentikan. | Effort converts into result here, and the result is counted in public. |
| 9 | Panen terakhir, lalu ladangnya sengaja dikosongkan untuk yang berikutnya. | Finishes a thing and hands it on, which costs more than starting did. |
| 11 | Kawat telanjang: kabarnya lewat lebih dulu daripada penjelasannya. | Senses a thing before there is evidence for it, and has to live with knowing early. |
| 22 | Gambar besar di kepala yang akhirnya berdiri jadi bangunan sungguhan. | An intention big enough that most people would have left it a daydream. |
| 33 | Rumah yang pintunya selalu terbuka, dan capeknya jarang dihitung. | Care given at a scale where it stops being personal and starts being work. |

### 6.4 The copy — signs, elements, modalities

| sign | `id` | `en` |
|---|---|---|
| aries | Pemantik yang menyala di gesekan pertama. | Begins before the plan is finished, and is usually why anything began. |
| taurus | Genggaman yang tidak buru-buru dan tidak gampang dilepas. | Refuses to be hurried, and keeps whatever it has decided to keep. |
| gemini | Dua jendela dibuka sekaligus, dan anginnya masuk dari dua arah. | Thinks out loud in two directions, and changes its mind where people can see. |
| cancer | Cangkang keras di luar supaya yang di dalam boleh lunak. | Remembers what was said years ago, and stands in front of the people it keeps. |
| leo | Panggung kecil, dan orang yang benar-benar senang berdiri di atasnya. | Gives in the open, and notices exactly when nobody is looking. |
| virgo | Jarum dan benang: jahitan kecil yang tidak kelihatan tapi menahan. | Corrects the small wrong thing everyone else agreed to live with. |
| libra | Dua piring timbangan yang terus disamakan sampai tangannya pegal. | Weighs the other side so well that choosing becomes the hard part. |
| scorpio | Permukaannya tenang; yang dicari selalu ada di dasar. | Goes to the bottom of a thing, and does not report back until it has. |
| sagittarius | Anak panah yang dilepas jauh, kadang sebelum petanya dibuka. | Wants the larger point, and says the blunt part out loud on the way there. |
| capricorn | Tangga yang dinaiki satu-satu, tanpa banyak bunyi. | Plays a long game, and pays for it early rather than late. |
| aquarius | Berdiri agak jauh supaya seluruh ruangannya kelihatan. | Argues for how the thing should work for everybody, from slightly outside it. |
| pisces | Bentuknya ikut wadah, dan batasnya jadi samar. | Takes on the weather of whatever room it enters, then makes something out of it. |

| element | `id` | `en` |
|---|---|---|
| fire | Api: cepat, terang, dan cepat habis kalau tidak dijaga. | Fire moves first and asks what it cost afterwards. |
| earth | Tanah: lambat, padat, dan menahan apa pun yang ditaruh di atasnya. | Earth wants the thing to still be standing next year. |
| air | Udara: bergerak lewat kata, jarak, dan alasan. | Air explains, argues, and needs a reason before it will move. |
| water | Air: ikut bentuk, ingat lama, dan merembes ke mana-mana. | Water reads the room before anyone speaks, and remembers what it read. |

| modality | `id` | `en` |
|---|---|---|
| cardinal | Yang memulai: mendorong duluan, ributnya belakangan. | Starts the thing. Whether anyone was ready is a separate question it does not wait for. |
| fixed | Yang bertahan: sudah dipasang, susah digeser. | Keeps the position long after the argument for it has moved on. |
| mutable | Yang menyesuaikan: berubah bentuk supaya tetap bisa lewat. | Fits itself to what the situation turned into, which reads as inconsistency and is not. |

### 6.5 Tasks

---

#### Task 12 — the four gloss tables

**Write the failing test.** Create `src/lib/numerology/glosses.test.ts` with the
completeness half only:

```ts
/**
 * The correspondence glosses (roadmap §5, plan §6).
 *
 * Two kinds of test here and they do different jobs. The completeness block
 * proves nothing is missing. The GUARD block (Task 13) is the one that matters:
 * these strings reach a PROMPT as well as a screen, so the Malay grep, the
 * therapy list and the `en` tic list all bind, and there is no smoke run over a
 * static table -- this file is the only thing checking them.
 */
import { describe, expect, it } from 'vitest';
import { LOCALES } from '@/lib/i18n/locale';   // NOTE: see Task 15 -- use @/data/types instead
import { ELEMENT_GLOSSES, MODALITY_GLOSSES, NUMBER_GLOSSES, SIGN_GLOSSES,
         elementGloss, modalityGloss, numberGloss, signGloss } from './glosses';
import { MASTER_NUMBERS } from './reduce';
import { ZODIAC } from './astrology';

const ALL = [
  ...Object.values(NUMBER_GLOSSES), ...Object.values(SIGN_GLOSSES),
  ...Object.values(ELEMENT_GLOSSES), ...Object.values(MODALITY_GLOSSES),
];

describe('completeness', () => {
  it('covers 1-9 and the three masters', () => {
    for (let n = 1; n <= 9; n++) expect(NUMBER_GLOSSES[n as 1]).toBeDefined();
    for (const m of MASTER_NUMBERS) expect(NUMBER_GLOSSES[m]).toBeDefined();
    expect(Object.keys(NUMBER_GLOSSES)).toHaveLength(12);
  });

  it('covers twelve signs, four elements, three modalities', () => {
    for (const s of ZODIAC) expect(SIGN_GLOSSES[s]).toBeDefined();
    expect(Object.keys(ELEMENT_GLOSSES)).toHaveLength(4);
    expect(Object.keys(MODALITY_GLOSSES)).toHaveLength(3);
  });

  it('is 31 keys and 62 strings', () => {
    expect(ALL).toHaveLength(31);
  });

  it('has a non-empty, distinct string in both locales for every key', () => {
    for (const pair of ALL) {
      expect(pair.id.trim().length).toBeGreaterThan(0);
      expect(pair.en.trim().length).toBeGreaterThan(0);
      // Identical halves means someone pasted one into the other.
      expect(pair.id).not.toBe(pair.en);
    }
  });

  it('keeps every gloss between 6 and 20 words (N9)', () => {
    for (const pair of ALL) {
      for (const s of [pair.id, pair.en]) {
        const words = s.split(/\s+/).filter(Boolean).length;
        expect({ s, words }).toMatchObject({ words: expect.any(Number) });
        expect(words).toBeGreaterThanOrEqual(6);
        expect(words).toBeLessThanOrEqual(20);
      }
    }
  });

  it('never addresses the querent (N9)', () => {
    // Impersonal captions. A second-person gloss reads as a fortune cookie
    // under a numeral on /account, and the prompt is what turns it into "you".
    for (const pair of ALL) {
      expect(pair.en).not.toMatch(/\byou\b|\byour\b/i);
      expect(pair.id).not.toMatch(/\bkamu\b|\bmu\b|\banda\b/i);
    }
  });

  it('the accessors return the table entries', () => {
    for (const locale of ['id', 'en'] as const) {
      expect(numberGloss(7, locale)).toBe(NUMBER_GLOSSES[7][locale]);
      expect(signGloss('leo', locale)).toBe(SIGN_GLOSSES.leo[locale]);
      expect(elementGloss('water', locale)).toBe(ELEMENT_GLOSSES.water[locale]);
      expect(modalityGloss('fixed', locale)).toBe(MODALITY_GLOSSES.fixed[locale]);
    }
  });
});
```

**Implement.** Create `src/lib/numerology/glosses.ts` with the header (which must
carry the §6.1 five-second recipe verbatim) and the four tables from §6.3–§6.4.

Header, in full — it is the part that stops a future session flattening this file
into the message catalog or translating one half into the other:

```ts
/**
 * One written line per correspondence, per locale. Thirty-one keys, sixty-two
 * strings.
 *
 * WHY THESE ARE NOT IN THE MESSAGE CATALOG (roadmap §5, plan N10). They are
 * DUAL-ROLE COPY: a prompt consumes them and `/account` displays them. That is
 * the `positionFraming` precedent (I14) and the `cardMeaning` precedent, and the
 * reason is the same both times -- splitting one string across two systems
 * guarantees the screen and the prompt eventually disagree about what the number
 * means. This directory is also forbidden to import `@/lib/i18n/**`, so the
 * catalog is not even reachable from here.
 *
 * WRITTEN, NOT TRANSLATED, IN BOTH DIRECTIONS -- W6's rule 3, applied again.
 * The mechanism, so a reviewer can check it in five seconds:
 *
 *     THE INDONESIAN HALF IS BUILT ON CONCRETE PHYSICAL IMAGES.
 *     THE ENGLISH HALF IS BUILT ON ACTION AND CONSEQUENCE.
 *     If an English gloss names the object its Indonesian counterpart names,
 *     it was translated, and one of the two has to be rewritten.
 *
 * Read three number keys. The Indonesian should let you SEE something -- a rope,
 * a cart wheel, a lamp on a table late at night. The English should show you
 * nothing and tell you what the number DOES and what it COSTS. `glosses.test.ts`
 * holds a twelve-row DIVERGENCE table that fails if the English gloss contains
 * the English word for the Indonesian image.
 *
 * THE ELEMENT GLOSSES ARE EXEMPT FROM THAT TABLE, deliberately: they name the
 * element itself (`Api:` / `Fire`), which is a fixed term and not an image.
 *
 * EVERY GLOSS NAMES A COST, NOT ONLY A VIRTUE (plan §5). "Stable and reliable"
 * is horoscope filler and it is exactly the failure the v0.3.0 risk table logs
 * against this release -- replacing a tally with vague cosmic language is a
 * longer version of the same problem, not a fix.
 *
 * IMPERSONAL. No "you", no imperative. The prompt turns a gloss into second
 * person; `/account` prints it under a numeral, where an address would read as a
 * fortune cookie. There is a test.
 *
 * NO THERAPY, DIAGNOSIS OR HEALING LANGUAGE IN EITHER LOCALE, and the constraint
 * binds harder here than in a reading: a gloss is REUSED, so one bad word appears
 * in every persona forever. `anxiety` is still not forbidden and is still not
 * used. The Malay grep from `scripts/smoke-llm.ts` runs over the `id` half and
 * the `en` tic list runs over the `en` half, both in the test file, because
 * nothing else greps a static table.
 */
```

**Run / commit.** `git commit -am "V1 Task 12: the correspondence glosses, both locales"`

---

#### Task 13 — the gloss guard: Malay, therapy, tics, divergence

**Write the failing test.** Append to `glosses.test.ts`:

```ts
/**
 * THE GUARD BLOCK. Every list here is copied from `scripts/smoke-llm.ts` on
 * purpose rather than imported: that script is a `scripts/` module that reads
 * env and builds its own clients, and importing it into the unit suite would
 * drag all of that in. THE COPY IS THE COST OF THE FENCE. If the smoke lists
 * change, change these.
 */
const MALAY = ['kerjaya', 'hala tuju', 'sembang', 'awak', 'tempoh', 'kerana',
               'iaitu', 'ianya', 'manakala', 'seronok', 'kelmarin'];

const THERAPY_EN = ['trauma', 'therapy', 'therapist', 'diagnose', 'diagnosis',
  'diagnosed', 'clinical', 'healing', 'heal', 'inner child', 'mental health',
  'anxiety disorder', 'depression', 'medication', 'shadow work',
  'nervous system', 'hold space', 'regulate', 'dysregulated'];

const THERAPY_ID = ['trauma', 'terapi', 'terapis', 'diagnosis', 'menyembuhkan',
  'penyembuhan', 'inner child', 'kesehatan mental', 'depresi', 'obat', 'dokter'];

const EN_TICS = ['dear one', 'beloved', 'sweet soul', 'the Universe',
  'divine feminine', 'divine timing', 'energetically', 'vibration', 'manifest',
  'abundance', "soul's journey", 'higher self', 'sacred'];

describe('the gloss guard', () => {
  it('has no Malay in the Indonesian half', () => {
    for (const pair of ALL) {
      for (const w of MALAY) {
        expect({ gloss: pair.id, word: w, hit: new RegExp(`\\b${w}\\b`, 'i').test(pair.id) })
          .toMatchObject({ hit: false });
      }
    }
  });

  it('has no therapy, diagnosis or healing language in either locale', () => {
    for (const pair of ALL) {
      for (const w of THERAPY_ID) {
        expect({ gloss: pair.id, word: w, hit: new RegExp(`\\b${w}\\b`, 'i').test(pair.id) })
          .toMatchObject({ hit: false });
      }
      for (const w of THERAPY_EN) {
        expect({ gloss: pair.en, word: w, hit: new RegExp(`\\b${w}\\b`, 'i').test(pair.en) })
          .toMatchObject({ hit: false });
      }
    }
  });

  it('has none of the generic-mystic tics in the English half', () => {
    // The roadmap names this explicitly: "English numerology writing is as
    // saturated with `soul's journey` and `divine timing` as English tarot
    // writing is". These strings go into a prompt; a tic here seeds one in
    // every reading it grounds.
    for (const pair of ALL) {
      for (const tic of EN_TICS) {
        const re = new RegExp(tic.replace(/'/g, "['’]"), 'i');
        expect({ gloss: pair.en, tic, hit: re.test(pair.en) }).toMatchObject({ hit: false });
      }
    }
  });

  it('WAS WRITTEN, NOT TRANSLATED — the English never names the Indonesian image', () => {
    /*
     * W6's rule 3, applied to this file. The Indonesian half is concrete images;
     * the English half is action and consequence. This table names, per number
     * key, the English word(s) the Indonesian image would translate to. If one
     * shows up in the English gloss, that pair is a translation.
     *
     * Twelve rows because that is small enough to keep true. Signs, elements and
     * modalities are checked by eye against the recipe in `glosses.ts`'s header.
     */
    const DIVERGENCE: Record<number, string[]> = {
      1: ['step'],
      2: ['rope', 'hand', 'pull'],
      3: ['voice', 'sentence'],
      4: ['stone', 'pillar', 'fence'],
      5: ['wind', 'gap'],
      6: ['burden', 'load', 'carry', 'shoulder'],
      7: ['lamp', 'table', 'night'],
      8: ['cart', 'wheel', 'push'],
      9: ['harvest', 'field'],
      11: ['wire'],
      22: ['picture', 'building'],
      33: ['house', 'door'],
    };
    for (const [n, words] of Object.entries(DIVERGENCE)) {
      const en = NUMBER_GLOSSES[Number(n) as 1].en;
      for (const w of words) {
        expect({ n, w, en, hit: new RegExp(`\\b${w}s?\\b`, 'i').test(en) })
          .toMatchObject({ hit: false });
      }
    }
  });

  it('is prose: no markdown, no emoji, no trailing whitespace', () => {
    // These reach a prompt whose FORMAT RULES forbid all three, and a gloss is
    // the one place the model can be handed a violation by the system itself.
    for (const pair of ALL) {
      for (const s of [pair.id, pair.en]) {
        expect(s).not.toMatch(/[*_#`]|\p{Extended_Pictographic}/u);
        expect(s).toBe(s.trim());
      }
    }
  });
});
```

**Implement.** Nothing new — this either passes against the copy in §6.3/§6.4 or
it names the gloss to rewrite. **If a row fails, rewrite the copy, never the
list.**

**Run / commit.** `git commit -am "V1 Task 13: the gloss guard — Malay, therapy, tics, divergence"`

---

## 7. `index.ts` — the facade

### 7.1 Two composites, and why they are shaped that way

`index.ts` re-exports every leaf symbol and adds three things V3 and V8 would
otherwise each build:

```ts
export type PersonInput = { fullName: string; nickname: string; birthDate: string };

/** LOCALE-FREE. The scalars, for `personas.facts` and `personas.input_hash`. */
export type PersonNumbers = {
  lifePath: GlossNumber | null;
  expression: GlossNumber | null;
  soulUrge: GlossNumber | null;
  personality: GlossNumber | null;
  nicknamePulse: GlossNumber | null;
  sun: SunFacts | null;
};
export function personNumbers(input: PersonInput): PersonNumbers;

/** Glossed, for a prompt and for /account. */
export type NumberFact = { value: GlossNumber; gloss: string; arcana: Card };
export type SunFact = SunFacts & {
  signGloss: string; elementGloss: string; modalityGloss: string;
};
export type PersonCorrespondences = {
  lifePath: NumberFact | null;
  expression: NumberFact | null;
  soulUrge: NumberFact | null;
  personality: NumberFact | null;
  nicknamePulse: NumberFact | null;
  sun: SunFact | null;
};
export function correspondencesFor(i: PersonInput, locale: Locale): PersonCorrespondences;

export type FrequencyCorrespondence = ShadowResult & { pulseGloss: string };
export function frequencyCorrespondence(
  top: CountedCard, second: CountedCard, locale: Locale,
): FrequencyCorrespondence | null;
```

**`personNumbers` is locale-free and that is not tidiness.** `personas.facts` is
`jsonb` and `personas.input_hash` is computed over the inputs; both must be the
same whichever language the persona was generated in, or the persona regenerates
every time the user taps `EN`. A shape carrying `gloss: string` cannot be hashed
that way. So: scalars for storage, glosses for rendering, one function each.

**`NumberFact.arcana` is included even though V8 may not use it.** `arcanaFor` is
already exported and the join is one array index; making V8 write
`arcanaFor(c.lifePath.value)` at four call sites is four chances to use the wrong
number. If it turns out unused, deleting a field is cheap.

**`FrequencyCorrespondence` carries no count.** It is `ShadowResult` plus the
pulse's gloss, and `ShadowResult` has `dominance` and `pulse` and nothing derived
from `m` or `n`. That is N11 and it is the mechanical half of VD2.

---

#### Task 14 — the facade

**Write the failing test.** Create `src/lib/numerology/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  correspondencesFor, frequencyCorrespondence, personNumbers,
} from './index';

const MIFTAH = { fullName: 'Miftahul Mahfuzh', nickname: 'Miftah', birthDate: '1994-07-26' };

describe('personNumbers', () => {
  it('is locale-free and stable — the same object for the same input', () => {
    expect(personNumbers(MIFTAH)).toEqual(personNumbers(MIFTAH));
  });

  it('carries five numbers and a sun', () => {
    const p = personNumbers(MIFTAH);
    expect(p.lifePath).not.toBeNull();
    expect(p.expression).not.toBeNull();
    expect(p.sun?.sign).toBe('leo');
  });

  it('survives a profile with no usable name', () => {
    const p = personNumbers({ fullName: '王小明', nickname: '', birthDate: '1994-07-26' });
    expect(p.expression).toBeNull();
    expect(p.nicknamePulse).toBeNull();
    expect(p.lifePath).not.toBeNull();
  });

  it('survives a malformed birth date', () => {
    const p = personNumbers({ ...MIFTAH, birthDate: 'nope' });
    expect(p.lifePath).toBeNull();
    expect(p.sun).toBeNull();
    expect(p.expression).not.toBeNull();
  });

  it('is JSON-round-trippable, because it is what `personas.facts` stores', () => {
    const p = personNumbers(MIFTAH);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
});

describe('correspondencesFor', () => {
  it('attaches a gloss and an arcana to every number it has', () => {
    const c = correspondencesFor(MIFTAH, 'id');
    expect(c.lifePath?.gloss.length).toBeGreaterThan(10);
    expect(c.lifePath?.arcana.id).toBeDefined();
    expect(c.sun?.signGloss.length).toBeGreaterThan(10);
  });

  it('differs between locales in the glosses and NOWHERE ELSE', () => {
    const id = correspondencesFor(MIFTAH, 'id');
    const en = correspondencesFor(MIFTAH, 'en');
    expect(id.lifePath?.value).toBe(en.lifePath?.value);
    expect(id.sun?.sign).toBe(en.sun?.sign);
    expect(id.lifePath?.gloss).not.toBe(en.lifePath?.gloss);
  });
});

describe('frequencyCorrespondence', () => {
  it('carries the shadow, the pulse gloss and the bucket', () => {
    const r = frequencyCorrespondence({ cardId: 3, count: 5 }, { cardId: 7, count: 2 }, 'en');
    expect(r?.shadow.name).toBe('Wheel of Fortune');
    expect(r?.dominance).toBe('overwhelming');
    expect(r?.pulseGloss.length).toBeGreaterThan(10);
  });

  it('CARRIES NO COUNT ANYWHERE IN ITS OUTPUT (VD2, N11)', () => {
    // The mechanical enforcement, asserted. V3 cannot interpolate a tally it
    // does not hold, and this is the test that keeps it that way when someone
    // "helpfully" adds topCount to the return type for a debug log.
    const r = frequencyCorrespondence({ cardId: 3, count: 5 }, { cardId: 7, count: 2 }, 'id');
    const json = JSON.stringify(r);
    expect(Object.keys(r ?? {}).sort()).toEqual(
      ['dominance', 'pulse', 'pulseGloss', 'second', 'shadow', 'shadowIsInPair', 'top'],
    );
    // and no `5` or `2` smuggled in as a bare count field
    expect(json).not.toMatch(/"(count|topCount|secondCount|m|n)":/);
  });
});
```

**Implement.** Create `src/lib/numerology/index.ts`. Header must state the rule:
**everything outside this directory imports from here and never from a leaf** —
so that the leaf split can change without a cross-workstream edit.

**Run / commit.** `git commit -am "V1 Task 14: the numerology facade"`

---

#### Task 15 — the purity fence

`glosses.test.ts` as drafted in Task 12 imports `LOCALES` from
`@/lib/i18n/locale`. **Fix that in this task**: use the literal
`['id', 'en'] as const` or `Locale` from `@/data/types`. The directory may not
depend on `@/lib/i18n/**` even from a test, because a test import is how a source
import gets added next.

**Write the failing test.** Create `src/lib/numerology/purity.test.ts`:

```ts
/**
 * The correspondence engine is PURE and it must stay importable from anywhere.
 *
 * Roadmap §6: "V1. PURE. No React, no next/*, no DB, no server-only." Three
 * consumers depend on that being true and each breaks differently if it stops:
 * V8's `/account` renders glosses in a client component; V3 calls it from a
 * route handler; and `personNumbers` feeds `personas.input_hash`, which is
 * computed in a script-shaped path with no Next runtime -- exactly where
 * `server-only`'s throw would fire (CLAUDE.md: "Never import `@/lib/db/client`
 * from a script or a test").
 *
 * SOURCE-LEVEL, like `clientBoundary.test.ts`, and weaker than a build for the
 * same reason: it catches the direct import, which is how it would actually
 * happen. It runs in one second, which is why people see it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(process.cwd(), 'src/lib/numerology');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.ts'));
const SOURCES = FILES.filter((f) => !f.endsWith('.test.ts'))
  .map((f) => ({ f, src: readFileSync(join(DIR, f), 'utf8') }));

const importsOf = (src: string) =>
  [...src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

describe('src/lib/numerology is pure', () => {
  it('found the six modules, so the fence is not vacuously passing', () => {
    expect(SOURCES.map((s) => s.f).sort()).toEqual(
      ['arcana.ts', 'astrology.ts', 'gematria.ts', 'glosses.ts', 'index.ts', 'reduce.ts'],
    );
  });

  it('imports nothing outside @/data and its own directory', () => {
    for (const { f, src } of SOURCES) {
      const bad = importsOf(src).filter(
        (spec) => !spec.startsWith('./') && !spec.startsWith('@/data'),
      );
      expect({ [f]: bad }).toEqual({ [f]: [] });
    }
  });

  it('carries no `server-only` marker and no framework import', () => {
    for (const { f, src } of SOURCES) {
      expect({ [f]: /server-only|from ['"]next|from ['"]react/.test(src) })
        .toEqual({ [f]: false });
    }
  });

  it('is the same rule for the tests, because a test import becomes a source import', () => {
    for (const f of FILES.filter((x) => x.endsWith('.test.ts'))) {
      const bad = importsOf(readFileSync(join(DIR, f), 'utf8')).filter(
        (spec) => spec.startsWith('@/') && !spec.startsWith('@/data'),
      );
      expect({ [f]: bad }).toEqual({ [f]: [] });
    }
  });

  it('only `index.ts` is imported from outside the directory', () => {
    // Grepped from src/. Nothing yet at V1 time; the assertion exists so that
    // V3's and V8's first deep import fails here rather than in review.
    // (Implement as a walk of src/** excluding src/lib/numerology.)
  });
});
```

Implement the last `it` as a real walk of `src/**` — copy the `walk()` helper from
`src/lib/clientBoundary.test.ts` — asserting that no file outside the directory
imports `@/lib/numerology/<leaf>`.

**Run / commit.** `git commit -am "V1 Task 15: the purity fence"`

---

#### Task 16 — typecheck, build, and the whole suite

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm test                # the full unit project, not just -- numerology
npm run typecheck
npm run build           # DO NOT SKIP. A green typecheck is not a green build.
```

`npm run build` is mandatory per `CLAUDE.md`'s TypeScript trap. **If it fails
with 36 `@vercel/turbopack-next/internal/font/google/font` errors, retry it** —
that is the AAAA-lookup trap and not this code. Nothing in V1 is imported by a
page yet, so a build failure here is almost certainly environmental.

`npm run test:integration` is **not** required: V1 adds no database code.

**Commit.** `git commit -am "V1: correspondence engine complete"`

---

## 8. What this workstream deliberately does not do

- **No prompt text.** The glosses are *inputs* to a prompt; the sentence that
  frames them ("The card standing behind these two is…") is V3's and V8's, in
  their own files. A prompt fragment here would be a fourth place prompt prose
  lives and would need the `server-only` marker W7-D14 puts on
  `src/lib/prompt/**`, which would break the purity fence and make the engine
  unusable from a client component.
- **No `frequency_verdicts` read or write**, no `personas` read or write, no
  query module. V1 owns no table and no migration.
- **No angle rotation, no fingerprint.** W5's `fingerprintOf` and
  `angleIndexFor` already exist and V3 owns the question of whether the Shadow
  Arcana joins the fingerprint. It should — a change of pair changes the shadow —
  and it already does implicitly, because the shadow is a function of the two
  card ids the fingerprint already hashes. Noted for V3, not implemented here.
- **No `/account` rendering.** V8.
- **No birth card.** `birthCard()` already exists in `src/data/deck.ts` with a
  *different* reduction (fold to 0–21, no master halt). **The two are not the
  same function and must not be merged** — see `## Open questions`.

---

## Schema deltas

**None.** V1 adds no table, no column, no index and no migration. It reads
`src/data/cards.json` through `@/data/deck` and nothing else.

The one thing V1 hands to the schema is a shape, not a column: `PersonNumbers` is
what V8 should serialize into `personas.facts` (`jsonb`, roadmap §4). It is
locale-free and JSON-round-trippable, and there is a test asserting the second.

## Event deltas

**None.** V1 emits no analytics event. `src/lib/analytics/events.ts` is untouched
and the count stays where the roadmap's §6 leaves it; the fifteen new names all
belong to V2/V4/V6/V7/V8.

If V3 or V8 want an event when a correspondence is computed, it belongs in their
plan — the engine is called on the request path of pages that already fire
`persona.generated` and `history.viewed`, and a second event for the arithmetic
would be noise.

## Interfaces I export

Everything below is from `@/lib/numerology` (the facade). **Deep imports of
`@/lib/numerology/reduce` and friends are fenced by `purity.test.ts`'s last
assertion — import the index.**

```ts
// ---- reduce.ts (re-exported) -------------------------------------------
export const MASTER_NUMBERS: readonly [11, 22, 33];
export type MasterNumber = 11 | 22 | 33;
export type GlossNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 11 | 22 | 33;
export function isMaster(n: number): n is MasterNumber;
export function isGlossNumber(n: number): n is GlossNumber;
export function reduce(n: number): number;                 // throws RangeError on bad input
export function reduceToGloss(n: number): GlossNumber | null;

// ---- gematria.ts -------------------------------------------------------
export const PYTHAGOREAN: Readonly<Record<string, number>>;
export function normalizeName(raw: string): string;        // -> /^[A-Z]*$/
export function letterValue(letter: string): number;       // 0 for non A-Z
export function vowelFlags(letters: string): boolean[];    // input must be normalized
export function expression(fullName: string): GlossNumber | null;
export function soulUrge(fullName: string): GlossNumber | null;
export function personality(fullName: string): GlossNumber | null;
export function nicknamePulse(nickname: string): GlossNumber | null;
export type NameNumbers = {
  expression: GlossNumber | null;
  soulUrge: GlossNumber | null;
  personality: GlossNumber | null;
};
export function nameNumbers(fullName: string): NameNumbers;

// ---- astrology.ts ------------------------------------------------------
export const ZODIAC: readonly [
  'aries','taurus','gemini','cancer','leo','virgo',
  'libra','scorpio','sagittarius','capricorn','aquarius','pisces',
];
export type ZodiacSign = (typeof ZODIAC)[number];
export type Modality = 'cardinal' | 'fixed' | 'mutable';
export type SunFacts = { sign: ZodiacSign; element: Element; modality: Modality };
export const SIGNS: Record<ZodiacSign, { element: Element; modality: Modality }>;
export type IsoDateParts = { year: number; month: number; day: number };
export function parseIsoDate(iso: string): IsoDateParts | null;
export function sunSign(birthDate: string): SunFacts | null;      // null on a bad date
export function lifePath(birthDate: string): GlossNumber | null;  // null on a bad date

// ---- arcana.ts ---------------------------------------------------------
export type Dominance = 'overwhelming' | 'clear' | 'narrow' | 'tied';
export type CountedCard = { cardId: number; count: number };
export function arcanaFor(n: number): Card;                // total; wraps mod 22
export function dominanceFor(topCount: number, secondCount: number): Dominance;
export type ShadowResult = {
  top: Card;
  second: Card;
  shadow: Card;
  shadowIsInPair: boolean;   // true iff The Fool (id 0) is in the pair
  pulse: GlossNumber;
  dominance: Dominance;
};
export function shadowArcana(top: CountedCard, second: CountedCard): ShadowResult | null;

// ---- glosses.ts --------------------------------------------------------
export const NUMBER_GLOSSES: Record<GlossNumber, Localized<string>>;
export const SIGN_GLOSSES: Record<ZodiacSign, Localized<string>>;
export const ELEMENT_GLOSSES: Record<Element, Localized<string>>;
export const MODALITY_GLOSSES: Record<Modality, Localized<string>>;
export function numberGloss(n: GlossNumber, locale: Locale): string;
export function signGloss(sign: ZodiacSign, locale: Locale): string;
export function elementGloss(element: Element, locale: Locale): string;
export function modalityGloss(modality: Modality, locale: Locale): string;

// ---- index.ts composites ----------------------------------------------
export type PersonInput = { fullName: string; nickname: string; birthDate: string };

export type PersonNumbers = {              // LOCALE-FREE. For personas.facts / input_hash.
  lifePath: GlossNumber | null;
  expression: GlossNumber | null;
  soulUrge: GlossNumber | null;
  personality: GlossNumber | null;
  nicknamePulse: GlossNumber | null;
  sun: SunFacts | null;
};
export function personNumbers(input: PersonInput): PersonNumbers;

export type NumberFact = { value: GlossNumber; gloss: string; arcana: Card };
export type SunFact = SunFacts & {
  signGloss: string; elementGloss: string; modalityGloss: string;
};
export type PersonCorrespondences = {
  lifePath: NumberFact | null;
  expression: NumberFact | null;
  soulUrge: NumberFact | null;
  personality: NumberFact | null;
  nicknamePulse: NumberFact | null;
  sun: SunFact | null;
};
export function correspondencesFor(
  input: PersonInput, locale: Locale,
): PersonCorrespondences;

export type FrequencyCorrespondence = ShadowResult & { pulseGloss: string };
export function frequencyCorrespondence(
  top: CountedCard, second: CountedCard, locale: Locale,
): FrequencyCorrespondence | null;
```

`Card`, `Element`, `Locale` and `Localized` are `@/data/types`'s, unchanged and
not re-declared.

**Notes for V3.** `CardCount` from `src/lib/db/queries/frequency.ts` is
structurally assignable to `CountedCard`, so
`frequencyCorrespondence(ranked[0], ranked[1], locale)` compiles with no adapter.
The result has **no count field of any kind** and a test asserts its exact key
set — that is VD2's mechanical half. `shadowIsInPair` needs its own phrasing in
the prompt; it is true exactly when The Fool is one of the two cards.

**Notes for V8.** Call `personNumbers()` for `personas.facts` and for the
`input_hash` inputs — it is locale-free, deterministic and JSON-round-trippable,
so the persona does not regenerate when the user taps `EN`. Call
`correspondencesFor(input, locale)` for the prompt and for `/account`'s captions.
Every field is independently nullable: a user with a CJK-only `fullName` has a
life path and no expression, and a user with a malformed `birthDate` has the
reverse. **Render nothing for a null** — W5's M14 rule, and the same reason.

## Open questions

1. **`reduce(11) === 2` makes master numbers rarer than a numerology book
   implies, and produces one visible asymmetry: November contributes 2 to a life
   path while the 29th contributes 11.** This follows directly from roadmap §5
   ("preserved only when they appear as a *sum*, never as an input") and I have
   implemented it exactly, with a named test. **Flagging it rather than
   relitigating it**, because V8's persona copy may want to say something about
   an 11 life path and should know how often one actually occurs. If
   reconciliation wants component masters preserved, the change is one branch in
   `lifePath` and it invalidates every stored `personas.facts` and every cached
   frequency verdict.

2. **`lifePath` lives in `astrology.ts`, not in a sixth file (N7).** Roadmap §6
   describes that file as "date → sign / element / modality". I put life path
   there because both derive from the birth date and need the same parser, and a
   sixth file would be off the fixed module map. If reconciliation prefers
   `birthdate.ts`, it is a rename, not a redesign.

3. **`birthCard()` in `src/data/deck.ts` already reduces a birth date, with a
   DIFFERENT rule** — it folds to 0–21 with no master halt, so
   `birthCard('1994-07-26')` and `arcanaFor(lifePath('1994-07-26'))` do not agree
   and are not supposed to. The birth card is on the v0.2.0 deferred list and is
   still out of scope for v0.3.0. **Neither function should be rewritten in terms
   of the other** and neither is called by the other. Named here so a reviewer
   who spots two reductions knows it was seen.

4. **The dominance thresholds (N8) are my choice, argued from worked cases and
   not from measurement**, because there is no corpus to measure against until
   V3 runs `npm run smoke -- --frequency` over real ranked pairs. The §4.3 table
   is the record of the reasoning. If V3 finds `clear` swallowing everything, the
   knob is the `d >= 2` floor on `clear`, and it is one line with twelve tests
   around it.

5. **Nothing checks the glosses in a live run.** The Malay grep, the therapy list
   and the `en` tic list all live in `scripts/smoke-llm.ts` and run over
   *generated* text; a static table is never generated, so `glosses.test.ts`
   copies the three lists. **That copy will drift.** The honest fix is to lift the
   lists into a shared module both the script and the test import — but that
   module would be a new file in nobody's ownership, and `scripts/**` importing
   `src/lib/**` is fine while the reverse is not. **Recommendation for
   reconciliation:** V3 already touches the smoke script for the VD2 digit check;
   let V3 own extracting `scripts/vocab.ts` (or `src/lib/vocab.ts`) and have both
   the script and this test import it. Until then, the copy is documented in the
   test's header as the cost of the fence.

6. **The English gloss register is unvalidated against a model.** The roadmap's
   own risk row says the mysticism can read as generated filler, and the
   Indonesian/English split in §6.1 is a judgement about *copy*, not a
   measurement. The first real signal is V3's `npm run smoke -- --frequency` and
   V8's `npm run smoke -- --persona`. If a gloss turns out to be the thing the
   model latches onto and repeats verbatim across all three readers, the fix is
   the gloss, not the prompt — same rule as "if the three readers stop being
   distinguishable, fix the persona paragraphs, not the code".

7. **`shadowIsInPair` has no defined copy.** V1 reports the condition; what V3
   should *say* when the Shadow Arcana is one of the two cards is a product call
   V3 owns. Two obvious routes — skip the shadow sentence entirely, or lean into
   it ("the card behind the pair is the pair itself") — and I have no opinion
   worth overriding V3's.
