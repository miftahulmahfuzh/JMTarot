# Phase 3: `user_memory` — table, migration `0017`, queries, erasure

**Plan set:** `CHAT_TIME_AWARENESS_USER_MEMORY_PROACTIVE_PLAN.md`
**Analysis:** `20260830-085616-B4K2_code_analyzer.md`
**Satisfies:** R2 — a persisted, continuously-updated model-written profile memory of the querent
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `src/lib/db` (secondary: `src/lib/memory/profile`, `src/lib/account`)

---

## Reconciliation (round 1 — BINDING)

**This phase's payload shape is the release's, unamended.** Phases 4, 5, 6 and 7 each invented
their own; all four are corrected in their own plans against this one, and the corrections are
listed here so this file is the single place the shape is stated:

- **`src/lib/memory/profile/types.ts` HAS ONE AUTHOR AND IT IS THIS PHASE.** Phase 4 also
  declared it, with a different vocabulary (`MEMORY_KINDS = habit|taste|work|people|situation|
  disposition`), a different item type (`MemoryItem`), a `ProfileMemory` wrapper, and an `id` its
  own comment described as *"NOT stable across regenerations"*. **All of that is cancelled.**
  Three later phases depend on the id being stable — phase 6's tombstone, phase 7's
  `material_key`, and this phase's `dismissed_ids` — so a non-stable id is not an alternative
  design, it is the feature not working. Phase 4 imports `UserMemoryKind`, `USER_MEMORY_KINDS`,
  `UserMemoryItem`, `isUserMemoryItem`, `USER_MEMORY_SOURCE_VERSION`, `USER_MEMORY_MAX_ITEMS`,
  `USER_MEMORY_ITEM_MAX_CHARS` and `USER_MEMORY_ITEM_ID_RE` from here and redeclares none of them.
- **THERE IS NO `ProfileMemory` WRAPPER AND NO `memory` jsonb COLUMN.** Two columns — `items` and
  `dismissed_ids` — as declared in Step 3. Phase 4's `suppressed`-inside-the-payload is the same
  mechanism in a worse place: `upsertUserMemory` would have had to write both, which is exactly
  the clobber this phase's `set` list is shaped to prevent.
- **THERE IS ONE IDENTIFIER.** Phase 4's `suppressionKey()` (16 hex over the normalised text
  alone) is cancelled in favour of this phase's `id` (12 hex over ``kind + '\u001f' + normalize(text)``).
  Phase 4 implements the derivation — it is the only writer, and `sha256` needs `node:crypto`,
  which a zero-import leaf may not have — but the formula is this phase's contract and is quoted
  in `UserMemoryItem.id`. **The known gap widens by one and is recorded rather than hidden:** a
  re-derivation that rewords the fact past `normalize` **or that files it under a different
  `kind`** hashes differently and can come back. The mitigation stays the extractor's (prefer an
  existing item's wording and kind), never a schema change.
- **PHASE 5 READS `row.items[].text`, not `row.notes[].text`.** There is no `notes` column.
- **PHASE 6 CALLS THIS MODULE'S FUNCTIONS, not `forgetUserMemoryItem` / `clearUserMemory`.**
  *Forget one* is `dismissUserMemoryItems(db, userId, [itemId])`. **_Forget everything_ is
  `dismissUserMemoryItems(db, userId, <every current item id>)` and NOT `redactUserMemory`** —
  the querent's "forget everything" must tombstone, or the next extraction rebuilds the list from
  a transcript that still contains every fact. `redactUserMemory` is the ERASURE path's function
  and deliberately does not tombstone, because a restored account is meant to have its memory
  rebuilt. Two buttons, two verbs, one mechanism; no new query is needed and none is added.
- **PHASE 7 READS `item.kind`, NOT AN `item.topic`.** Its `PROFILE_TOPICS` / `ProfileTopic` /
  `profileTopicOf` are cancelled; `UserMemoryKind` is the closed token its `BAHAN:` line carries
  and `profileKindOf(raw)` maps an unrecognised value to `'other'` — which is what `'other'` is in
  this file's set for. `UserMemoryItem` gains no `topic` field: two closed sets on one item is two
  sets that drift, and `material.ts` importing a zero-import leaf costs its purity nothing.
- **`CLAUDE.md`'s table count (Step 10) is a CORRECTION, not a rule**, so it owes no compensating
  cut under invariant 11. Phase 9 owns the one net-neutral prose edit for the release.
- **`clientBoundary.test.ts` is written by phases 4, 6 and 7 in that order**, each adding its own
  `it()`; this phase adds none, and its deferral of the `audit-secrets.ts` fence to phase 4 stands.

---

## Goal

After this phase there is a place to put what the room learns about a querent, and there is
already a way to take it away again. `user_memory` exists as the twenty-third table, migration
`0017` is committed, `src/lib/db/queries/memory.ts` reads and writes it under the four rules of
that directory, and `deleteAccount()` empties it inside the same transaction that sets
`deleted_at`. **Nothing generates a row and nothing reads one into a prompt** — that is phases 4
and 5. The erasure path lands first, deliberately, so that no row can ever exist without it.

The phase also fixes the payload **shape** — a jsonb list of individually addressable items plus a
tombstone list of dismissed item ids — because phases 4, 5, 6 and 7 all build on it and none of
them can be written until it is decided.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Creates:**

- table `user_memory` (`src/lib/db/schema.ts`), the twenty-third
- `db.userMemory` (`src/lib/db/schema.ts`) — the drizzle table object
- `db.UserMemory` / `db.NewUserMemory` (`src/lib/db/schema.ts`) — the row types
- migration `src/lib/db/migrations/0017_r2-user-memory.sql` + its `meta/0017_snapshot.json`
  + the `_journal.json` entry. **`0017` is claimed by this phase and by no other.**
- `src/lib/memory/profile/types.ts` — **A NEW PURE LEAF**, zero imports, exporting
  `UserMemoryKind`, `USER_MEMORY_KINDS`, `UserMemoryItem`, `isUserMemoryItem`,
  `USER_MEMORY_SOURCE_VERSION`, `USER_MEMORY_MAX_ITEMS`, `USER_MEMORY_ITEM_MAX_CHARS`,
  `USER_MEMORY_ITEM_ID_RE`
- `src/lib/memory/profile/types.contract.test.ts` — the purity fence for that leaf
- `src/lib/db/queries/memory.ts` — `getUserMemory`, `upsertUserMemory`, `touchUserMemory`,
  `dismissUserMemoryItems`, `redactUserMemory`
- `src/lib/db/queries/memory.integration.test.ts`

**Signature changes:**

- `DeleteOutcome` (`src/lib/account/delete.ts:48`) gains `memoryRedacted: number`.
  **Additive only.** `src/app/api/account/route.ts` names its response fields and its analytics
  props explicitly, so it needs no edit and **gets none** — see Handoffs.

**Deletes:** none.
**Renames:** none.

**Requires (from earlier phases):** nothing. This phase has no `depends_on`.

**Leaves alone (owned by others):**

- `src/lib/llm/types.ts` (`LLMOp`), `src/lib/llm/flags.ts`, `src/lib/admin/ops.ts`,
  `src/lib/analytics/rollup.ts`, `src/lib/analytics/events.ts` — **Phase 4**
- `src/lib/memory/profile/prompt.ts`, `src/lib/memory/profile/generate.ts` — **Phase 4**
  (this phase creates only `types.ts` in that directory)
- `src/lib/chat/**` in its entirety, including `context.ts` and `prompt/build.ts` — **Phases 1, 2,
  5, 7, 8, 9**
- `src/lib/db/schema.ts`'s `chat_threads.utc_offset_minutes` — **Phase 1** (an existing column;
  phase 1 claims no migration number, `0017` is this phase's)
- `src/app/account/**`, `src/app/api/account/facts`, `src/app/privacy/**`,
  `src/lib/i18n/locales/{id,en}.ts` — **Phase 6**
- `src/lib/chat/proactive/**` — **Phase 7**
- `src/lib/clientBoundary.test.ts` and `scripts/audit-secrets.ts`'s `FORBIDDEN` — **Phase 4**
  (the fence goes up in the commit that adds the prose module it fences)

### THE PAYLOAD SHAPE — the decision phases 4, 5, 6 and 7 build on

**`items` IS A `jsonb` ARRAY OF INDIVIDUALLY ADDRESSABLE ITEMS, NOT ONE PROSE BLOB.** Three
downstream requirements each independently force it, and a blob satisfies none:

1. **Phase 6 needs per-item deletion.** *"the querent can see every stored line and delete any of
   them"*. A blob offers one control: delete everything. That is not the feature.
2. **Phase 7's profile-anchored material must rehydrate from `material_key` alone at plan time**,
   and its `BAHAN:` line may carry **closed tokens and scalars only, never free text**
   (`The BAHAN rule`, `[F5]`). So the material key has to be a *reference* — `profile:<item id>` —
   and the item has to have an id that survives until the run is planned.
3. **`chat_runs_user_material_uq` is what stops the same opener firing twice.** It keys on
   `material_key`, so an item id that changes on every regeneration would let the *nasi padang*
   question be asked every day for a week.

**PER-ITEM DELETION IS ADDRESSABLE BY `item.id`, AND `id` IS DERIVED FROM THE ITEM'S CONTENT.**
`id` is `sha256(kind + '\u001f' + normalize(text))` hex-truncated to 12 characters — the
derivation is **phase 4's to implement** (it is the only writer) but it is a **contract, not a
suggestion**, because of the tombstone below. `normalize` is lowercase + whitespace collapse +
trailing-punctuation strip. Twelve hex characters, `USER_MEMORY_ITEM_ID_RE`, `share_links.slug`'s
length for `share_links.slug`'s reason: short enough to sit inside a `material_key`, long enough
that a collision inside one person's 32 items is not a thing that happens.

**`dismissed_ids` IS A SECOND jsonb COLUMN AND IT IS WHAT STOPS THE DELETE BUTTON BEING A LIE.**
This is `lotus_avatars.input_hash`'s argument (*"without it, deleted material stays paraphrased
inside a current-looking block and the delete button is a lie"*) arriving one release later in a
worse shape. The querent deletes *"suka nasi padang"*; the transcript that produced it is still
in `chat_messages`, and it cascades rather than being cleared, so **the very next extraction puts
the fact straight back**. A tombstone is the only mechanism that survives that, and a
content-derived id is the only kind of id a tombstone can match.

**THE TOMBSTONE STORES THE HASH AND NEVER THE TEXT.** A dismissal list holding the sentences the
querent deleted would be strictly worse than not offering deletion at all. The cost is exact: a
**reworded** restatement of the same fact hashes differently and can return. That is stated here
rather than hidden, and the mitigation is phase 4's — the extractor can be told to prefer an
existing item's wording — not a schema change.

**`upsertUserMemory` NEVER TOUCHES `dismissed_ids`.** The extractor writes `items`, the querent
writes `dismissed_ids`, and no statement in this codebase writes both. A generator that could
clobber a refusal is the same bug in a new place.

**NO ORDER IS PROMISED FOR `dismissed_ids`** (`jsonb_agg(distinct …)` sorts by value) and **no cap
is placed on it**: every entry is put there by a human hand tapping a control, so the column is
bounded by human effort at twelve bytes an entry. `items` **is** capped, at
`USER_MEMORY_MAX_ITEMS = 32`, because a model writes it.

**THERE IS NO `locale` COLUMN AND `input_hash` MUST CARRY NO LOCALE.** `C-D9` — a chat message is
never translated — and the plan's own scope puts *"translating the memory prose"* out of scope. A
`locale` column would invite exactly `personas`' documented trap: tapping `EN` regenerates and
replaces the prose. One row serves both locales. **The consequence phase 6 inherits:** an
English-UI querent may read an Indonesian memory line on `/account`, and the fix for that is a
translation, never a regeneration.

**AN ITEM CARRIES NO DATE THAT REACHES THE MODEL.** `lastSeen` exists so phase 4 can decide what
to evict at the cap, and **phase 5 must render `text` and nothing else** — no id, no kind, no
date. Invariant 4 (`C-D8`: *a reader never says how they know*) is the reason: *"nasi padang lagi
kan?"* is the target and *"you told me on the 9th"* is the failure, and a date in the block is the
material that produces the failure. Phase 5 owes a `prompt.test.ts` assertion that no
`YYYY-MM-DD` appears in `<ingatan>`.

### THE ERASURE RULING — and why it amends `delete.ts`'s foreign-key asymmetry

`delete.ts`'s header states a mechanical rule: *"the asymmetry with `moderation_flags` IS the
asymmetry in the foreign keys: `set null` outlives the account, `cascade` does not."*
`user_memory.user_id` is `on delete cascade`, so **by the letter of that rule this table needs no
line in the erasure transaction.** It gets one anyway, and the amendment is written into the
header rather than performed quietly.

**THE FOREIGN KEY ANSWERS "DOES IT SURVIVE", NOT "IS IT THE THING THEY MEANT".** Every other
cascading table holds either text the querent typed (`chat_messages.body`, `readings.question`,
`onboarding_answers.answer_text`) or prose about a *reading*. `user_memory.items` is the first row
in this database that is a **model's dossier about a person, assembled from things they said
without being asked, kept for the purpose of being used on them later.** When somebody presses
*delete my account*, that row is the thing they mean. Thirty more days of it is
`moderation_flags`' risk wearing a different foreign key.

**IT COSTS THE THIRTY-DAY RESTORE NOTHING, AND THAT IS WHAT MAKES IT CHEAP ENOUGH TO DO.**
`clearFreeTextAnswers()` is absent from that transaction because `onboarding_answers` is the only
copy of text a person typed — clearing it would break the restore the confirmation copy promises.
`user_memory` is **derived and regenerable**: every input is `chat_messages` and `readings`, both
of which cascade and therefore survive the soft delete, and phase 4's extractor is idempotent, so
a querent who signs back in on day 29 gets the room's memory rebuilt on the next run. **That is a
third category the header must name — derived-and-regenerable — and it is why the FK rule does not
decide this case.**

**IT IS A REDACTION, NOT A DELETE, AND THE ROW STAYS.** `redactUserMemory` empties `items`, blanks
`input_hash` and **keeps `dismissed_ids`**. Dropping the row would take the tombstones with it, so
a querent who erased their account, changed their mind on day 3 and signed back in would find the
facts they had individually deleted coming back. The tombstones carry no text — they are opaque
hashes that can only ever *prevent* a write — so keeping them costs nothing a person would object
to and it is the only way the restore is honest in both directions.

**`input_hash` IS BLANKED IN THE SAME STATEMENT, AND FORGETTING IT WOULD SILENTLY KILL THE
FEATURE.** An emptied `items` beside a matching hash means phase 4's extractor reports `unchanged`
and never writes again. Phase 4's staleness must treat `input_hash = ''` as *never matches* — that
is a required contract, restated in Handoffs.

**THIS DOES NOT LICENSE ADDING `personas` TO THAT TRANSACTION.** `personas.body` is also
model-written prose about the person, and it stays out: it is distilled from a deliberate rite the
querent walked through, it is shown *to* them on `/account` as the product, and it is not
assembled from a conversation they were having for another reason. If a future session wants to
change that, it is a ruling, not a tidy-up.

---

## Files

| File | Action | What changes |
|---|---|---|
| `src/lib/memory/profile/types.ts` | create | the pure, client-importable item shape + constants + narrowing guard |
| `src/lib/memory/profile/types.contract.test.ts` | create | the purity fence for that leaf |
| `src/lib/db/schema.ts` | modify | type import at `:75`; the `user_memory` table after `authHandoffs` (`:2153`); two row types at the end (`:2213`) |
| `src/lib/db/migrations/0017_r2-user-memory.sql` | create (generated) | `npm run db:generate -- --name r2-user-memory` |
| `src/lib/db/migrations/meta/0017_snapshot.json` | create (generated) | committed with the `.sql` |
| `src/lib/db/migrations/meta/_journal.json` | modify (generated) | the `idx: 17` entry |
| `src/lib/db/queries/memory.ts` | create | five handle-first functions, UUID-guarded, no caching |
| `src/lib/db/queries/memory.integration.test.ts` | create | upsert / `updated_at` by hand / dismiss / redact / cascade |
| `src/lib/db/testing/harness.ts` | modify | `resetDb()`'s TRUNCATE list, `:110` — twenty becomes twenty-one |
| `src/lib/account/delete.ts` | modify | header amendment + `redactUserMemory` inside the transaction, `:75` |
| `src/lib/account/delete.integration.test.ts` | modify | three new cases + the source-order assertion |
| `CLAUDE.md` | modify | `:1774` — the table count, corrected rather than appended to |
| `docs/workstream-notes.md` | modify | append the dated record of the `delete.ts` amendment |

---

## Implementation Steps

### Step 1: The pure item shape

**File:** `src/lib/memory/profile/types.ts` (new)

**Change:** A LEAF with zero imports. It has to be reachable from **both** sides of the client
boundary: `schema.ts` type-imports it for the `$type<>` narrowing, and phase 6 renders an item in a
client component with a delete control. `clientBoundary.test.ts:353` forbids any `@/lib/db/`
specifier in a client file — **including `import type`, because the regex does not know the
keyword** — and `scripts/audit-secrets.ts`'s `{ prefix: 'lib/db/', allow: [] }` fails the build
transitively for the same reach. So the shape cannot live in `schema.ts`. This is the split
`moderation/types.ts` has against `blocklist.ts`, `share/types.ts` against `share/links.ts`,
`@/content/types` against `src/content/**`, and `chat/types.ts` against `chat/prompt/**`.

**Code:**

```ts
/**
 * THE SHAPE OF WHAT THE ROOM REMEMBERS ABOUT A PERSON (R2).
 *
 * **A LEAF: ZERO IMPORTS, no `server-only`, no `process.env`, no `@/lib/db/**`, no
 * prompt prose.** `types.contract.test.ts` beside it is the fence, and the fence
 * is load-bearing in BOTH directions:
 *
 *  - `schema.ts` type-imports `UserMemoryItem` for `user_memory.items`'
 *    `$type<>`. That is allowed only because nothing here does or ever may
 *    depend on `schema.ts` -- the same argument that licenses the `Block` and
 *    `BeatSheet` type-imports at the top of that file.
 *  - A client component renders an item and offers a control to delete it.
 *    `clientBoundary.test.ts` forbids any `@/lib/db/` specifier in a client file
 *    and its regex does NOT know the `type` keyword, so even an erased
 *    `import type` from `@/lib/db/schema` would fail -- which is what makes a
 *    SEPARATE module the only way to name this shape from the browser.
 *
 * **PHASE 4's `prompt.ts` AND `generate.ts` LAND BESIDE THIS FILE AND CARRY
 * PROSE AND A PROVIDER.** They are what earns `lib/memory/profile/` a
 * `FORBIDDEN` entry in `scripts/audit-secrets.ts` with this file as the named
 * exception -- the `lib/moderation/` shape. The fence goes up in the commit that
 * adds the module it fences, not this one.
 */

/**
 * WHAT KIND OF THING THIS IS. A CLOSED SET, and closed for two reasons that are
 * not about tidiness:
 *
 *  1. A `BAHAN:` line may carry closed tokens and scalars ONLY, never free text
 *     (the `BAHAN` rule, F2/F5). `kind` is what phase 7's profile-anchored
 *     material is allowed to say about an item; the TEXT is rehydrated from this
 *     table at plan time and never travels in the key.
 *  2. It is half of `id`'s preimage, so widening it later changes every id and
 *     silently empties every tombstone. **Adding a kind is a migration of
 *     meaning even though it is not a migration of schema.**
 *
 * `other` IS THE ESCAPE HATCH AND IT IS DELIBERATE. The moderation classifier's
 * `other`/`unclear` shape: a validator with nowhere to put a legitimate fact
 * drops it, and a dropped fact is invisible. Phase 7 decides which kinds make a
 * good opener; `other` will not be one, and that is a different question from
 * whether it may be stored.
 */
export const USER_MEMORY_KINDS = [
  /** Something they do again and again: runs at five, sleeps late, solat subuh. */
  'habit',
  /** Likes and dislikes: nasi padang, KFC, the coffee place by the XXI. */
  'taste',
  /** Somebody in their life, by whatever name the querent used for them. */
  'person',
  /** What is going on lately: a job, an exam, a move, an illness. */
  'situation',
  /** Where they are or where they go: Blok M. */
  'place',
  /** A disposition they stated about themselves: "gw sukanya being by my self". */
  'trait',
  /** True, durable, and none of the above. */
  'other',
] as const;

export type UserMemoryKind = (typeof USER_MEMORY_KINDS)[number];

/** `id`'s alphabet and length. Twelve lowercase hex characters. */
export const USER_MEMORY_ITEM_ID_RE = /^[0-9a-f]{12}$/;

/**
 * `USER_MEMORY_MAX_ITEMS` IS A PROMPT BUDGET WEARING A STORAGE CAP.
 *
 * 32 items at 140 characters is ~4.5KB worst case and ~2.5KB typical, against a
 * 40-message `<obrolan>` window that is several times that. The `[!IMPORTANT]`
 * ruling licenses spending tokens; it does not repeal `memory.ts`'s dilution
 * argument, which is the reason R2 exists instead of a bigger window. A cap that
 * lets the memory outgrow the conversation would reintroduce the problem it was
 * built to solve.
 *
 * ENFORCED IN CODE (phase 4 truncates), NOT AS A `CHECK`. A generator that must
 * never throw meeting a constraint that does is how a row silently fails to
 * exist.
 */
export const USER_MEMORY_MAX_ITEMS = 32;

/** One short sentence. A tweet's worth, and the same reason: it has to be sayable. */
export const USER_MEMORY_ITEM_MAX_CHARS = 140;

/**
 * Bump to force every memory to be rebuilt, `lotus_avatars.source_version`'s
 * rule. Lives HERE rather than beside the prompt so that `queries/memory.ts` and
 * a client component can both name it without acquiring `server-only`
 * transitively -- which is exactly the defect `queries/lotus.ts` is excluded by
 * name for in `queries/contract.test.ts`.
 */
export const USER_MEMORY_SOURCE_VERSION = 1;

/**
 * One thing the room knows.
 *
 * **`text` IS MODEL PROSE ABOUT A REAL PERSON**, which is a stronger claim than
 * anything else stored here: `readings.question` and `chat_messages.body` are
 * text the querent typed, and the six onboarding answers are fenced by `C-D8`'s
 * five conditions. `schema.ts`'s header for this table carries the full
 * argument.
 */
export type UserMemoryItem = {
  /**
   * `sha256(kind + '\u001f' + normalize(text))`, hex, first 12 characters --
   * where `normalize` lowercases, collapses whitespace and strips trailing
   * punctuation. **DERIVED FROM CONTENT AND NOT RANDOM, AND THAT IS A CONTRACT
   * RATHER THAN A CONVENIENCE.** Two things rest on it:
   *
   *  - `user_memory.dismissed_ids` is a tombstone list. A random id would mint a
   *    new one on every regeneration and the querent's deletion would survive
   *    exactly until the next extraction.
   *  - Phase 7's `material_key` is `profile:<id>`, and
   *    `chat_runs_user_material_uq` is what stops one opener firing twice. An id
   *    that moves makes the unique index inert.
   *
   * The cost is exact and is not hidden: a REWORDED restatement of the same fact
   * hashes differently and can come back. The mitigation belongs to the
   * extractor, not to the schema.
   */
  id: string;
  kind: UserMemoryKind;
  /**
   * One short sentence, third person, at most `USER_MEMORY_ITEM_MAX_CHARS`.
   *
   * **THE ONLY FIELD THAT MAY REACH A MODEL.** Phase 5 renders `text` and
   * nothing else -- no id, no kind, no date -- because `C-D8`'s ban on saying
   * how you know is what separates *"nasi padang lagi kan?"* from *"you told me
   * on the 9th"*, and a date in the block is the material that produces the
   * second one.
   */
  text: string;
  /**
   * `'YYYY-MM-DD'`, the querent's calendar day, A STRING AND NEVER A `Date` --
   * `local_date`'s rule, for `local_date`'s reason.
   *
   * FOR CODE ONLY: it is how phase 4 chooses what to evict at
   * `USER_MEMORY_MAX_ITEMS`. It must not be rendered into the prompt (see
   * `text`) and it is not a claim about when the querent said the thing, only
   * about when an extraction last saw it.
   */
  lastSeen: string;
};

/**
 * **`$type<>` IS AN ASSERTION THE DRIVER IS NOT OBLIGED TO HONOUR**, which is
 * `answersUpdatedAt`'s lesson and `readingsForDay`'s `hasBody` before it: a
 * jsonb column read back is whatever is in the row, and this table's rows are
 * written from model output. So every consumer that RENDERS an item -- the
 * prompt block in phase 5, the account list in phase 6, the material rehydration
 * in phase 7 -- filters through this rather than trusting the type.
 *
 * Deliberately NOT called by `queries/memory.ts`: a query module reads and
 * writes and does not validate (rule 3 of that directory's header), and a reader
 * that silently dropped rows would hide a real corruption from the one place
 * that could report it.
 */
export function isUserMemoryItem(value: unknown): value is UserMemoryItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    USER_MEMORY_ITEM_ID_RE.test(v.id) &&
    typeof v.kind === 'string' &&
    (USER_MEMORY_KINDS as readonly string[]).includes(v.kind) &&
    typeof v.text === 'string' &&
    v.text.length > 0 &&
    v.text.length <= USER_MEMORY_ITEM_MAX_CHARS &&
    typeof v.lastSeen === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.lastSeen)
  );
}
```

**Impact:** A new directory `src/lib/memory/profile/`. Nothing imports it yet except `schema.ts`
and its own test.

---

### Step 2: The purity fence for the leaf

**File:** `src/lib/memory/profile/types.contract.test.ts` (new)

**Change:** The `@/content/types`, `persona/lines` and `attachmentView` shape — assert the
exception is earned, on the source, with comments stripped first, because the header explains at
length what may not live there and *a rule that fires on prose describing the rule is a rule
people delete*.

**Code:**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isUserMemoryItem,
  USER_MEMORY_ITEM_ID_RE,
  USER_MEMORY_ITEM_MAX_CHARS,
  USER_MEMORY_KINDS,
  USER_MEMORY_MAX_ITEMS,
  USER_MEMORY_SOURCE_VERSION,
} from './types';

const RAW = readFileSync('src/lib/memory/profile/types.ts', 'utf8');
const CODE = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the user-memory type leaf', () => {
  it('imports nothing at all', () => {
    // A LEAF. `schema.ts` type-imports it, and schema.ts's narrowing rule is that
    // it may never depend on a module that depends on schema.ts. Zero imports is
    // the only version of that promise nobody has to re-check.
    const specs = [...CODE.matchAll(/^\s*import\s.*?['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(specs).toEqual([]);
  });

  it('carries no server marker, no environment read and no database', () => {
    // A client component renders an item and offers a delete control. The first
    // would be a build error; the second reads `undefined` in the browser, which
    // is `localeSwitcherEnabled()`'s ten minutes inside `LocaleSwitch.tsx`.
    for (const sentinel of ["'server-only'", 'process.env', '@/lib/db/']) {
      expect({ sentinel, present: CODE.includes(sentinel) }).toEqual({ sentinel, present: false });
    }
    // The stripper must not have eaten the code it is checking.
    expect(CODE).toContain('USER_MEMORY_KINDS');
  });

  it('carries no prompt prose', () => {
    /*
     * Phase 4's `prompt.ts` lands beside this file. The moment a sentence of the
     * extractor's contract migrates in here "so the validator can share it", the
     * client-importability above becomes the leak rule 1 of `clientBoundary.test.ts`
     * exists to prevent.
     */
    for (const sentinel of ['ATURAN', 'Kamu adalah', 'You are a', 'Tulis ', 'Write one']) {
      expect({ sentinel, present: CODE.includes(sentinel) }).toEqual({ sentinel, present: false });
    }
  });

  it('has seven kinds, and `other` among them', () => {
    // Not a round number for its own sake: the count is asserted so that widening
    // the set is a decision somebody makes on purpose. Every id in every tombstone
    // has a kind in its preimage.
    expect(USER_MEMORY_KINDS).toHaveLength(7);
    expect(USER_MEMORY_KINDS).toContain('other');
    expect(new Set(USER_MEMORY_KINDS).size).toBe(USER_MEMORY_KINDS.length);
  });

  it('keeps the budget constants where a reviewer can see them', () => {
    expect(USER_MEMORY_MAX_ITEMS).toBe(32);
    expect(USER_MEMORY_ITEM_MAX_CHARS).toBe(140);
    expect(USER_MEMORY_SOURCE_VERSION).toBe(1);
    expect(USER_MEMORY_ITEM_ID_RE.source).toBe('^[0-9a-f]{12}$');
  });
});

describe('isUserMemoryItem', () => {
  const good = { id: '0a1b2c3d4e5f', kind: 'taste', text: 'suka nasi padang', lastSeen: '2026-08-30' };

  it('accepts a well-formed item', () => {
    expect(isUserMemoryItem(good)).toBe(true);
  });

  it('refuses everything a bad jsonb read can hand back', () => {
    for (const bad of [
      null,
      undefined,
      'a string',
      42,
      [],
      { ...good, id: 'NOTHEX' },
      { ...good, id: '0a1b2c3d4e5' }, // eleven
      { ...good, id: '0A1B2C3D4E5F' }, // uppercase; ids are lowercase hex by contract
      { ...good, kind: 'favourite' },
      { ...good, text: '' },
      { ...good, text: 'x'.repeat(USER_MEMORY_ITEM_MAX_CHARS + 1) },
      { ...good, lastSeen: new Date() },
      { ...good, lastSeen: '30-08-2026' },
    ]) {
      expect({ bad, ok: isUserMemoryItem(bad) }).toEqual({ bad, ok: false });
    }
  });
});
```

**Impact:** `npm test` gains one file. No runtime change.

---

### Step 3: The table

**File:** `src/lib/db/schema.ts` — a type import beside the existing two (after `:75`), the table
after `authHandoffs` (currently ends `:2153`), and two row types at the end of the file.

**Change (a) — the type import.** Add it directly below the `BeatIntent, BeatSheet, …` import,
with the same argument spelled out for the new module.

**Code:**

```ts
/**
 * R2's `user_memory.items` and `.dismissed_ids`. **A TYPE-ONLY IMPORT OF A LEAF**, on
 * exactly the argument the two imports above make: `src/lib/memory/profile/types.ts`
 * has ZERO imports -- not "few", none -- so it cannot depend on `schema.ts` and the
 * narrowing rule at the top of this file is satisfied by construction.
 * `types.contract.test.ts` is the fence, and it asserts the import list is empty
 * rather than merely clean.
 *
 * The shape lives THERE rather than here for a second reason this file cannot
 * satisfy: phase 6 renders an item in a client component, and
 * `clientBoundary.test.ts` forbids any `@/lib/db/` specifier in a client file with a
 * regex that does not know the `type` keyword.
 */
import type { UserMemoryItem } from '@/lib/memory/profile/types';
```

**Change (b) — the table.** Insert after the `authHandoffs` declaration and before the
`// Row types` banner.

**Code:**

```ts
// ---------------------------------------------------------------------------
// user_memory  (v0.8.0 / R2)
// ---------------------------------------------------------------------------

/**
 * WHAT THE ROOM HAS LEARNED ABOUT THE QUERENT, WRITTEN BY A MODEL.
 *
 * **THIS IS THE STRONGEST PRIVACY CLAIM IN THIS DATABASE AND IT IS A DIFFERENT
 * CLAIM FROM EVERY OTHER ONE.** `readings.question` and `chat_messages.body` are
 * text the querent TYPED; `onboarding_answers.answer_text` is encrypted and
 * fenced by `C-D8`'s five conditions. `items` is a model's INFERENCES ABOUT A
 * REAL PERSON, distilled from a conversation they were having for another
 * reason, stored so that it can be spoken back at them later. Nothing else here
 * is that. Three consequences follow and none of them is optional:
 *
 *  1. **A reader may use it and may never say how they know** (`C-D8`,
 *     invariant 4). *"nasi padang lagi kan?"* is a friend; *"you told me on the
 *     9th"* is surveillance. Phase 5 renders `text` and nothing else -- no id,
 *     no kind, no date -- and that is why an item carries no timestamp the model
 *     can see.
 *  2. **The querent can read every line and delete any of them**, which is what
 *     `id` and `dismissed_ids` exist for, and which is what phase 6 builds.
 *  3. **It is emptied at the SOFT delete**, not thirty days later at the
 *     cascade. `delete.ts`'s header carries that ruling and the amendment it
 *     makes to that file's own foreign-key rule.
 *
 * A NEW TABLE, NOT A WIDENING OF `personas`, and `personas`' own header makes
 * the same distinction one release earlier. A persona is generated ONCE from a
 * rite the querent walked through, is shown to them as the product, is written
 * in a locale and is translated on demand. This is a LIST that grows every time
 * they talk, has no locale at all, is never translated (`C-D9`), and is read
 * into a prompt rather than onto a page. Merging them would give one row two
 * lifecycles, two erasure duties and one `input_hash` serving two things that
 * move at different speeds.
 *
 * **`user_memory` IS SINGULAR AGAINST THIS FILE'S PLURAL CONVENTION, AND THAT IS
 * DELIBERATE.** The row is not one memory, it is THE memory -- a mass noun.
 * `user_memories` would read as one row per remembered fact, which is exactly
 * the shape this table is not: the facts live inside `items`, and the row is per
 * user.
 *
 * ONE ROW PER USER, so `user_id` IS the primary key and there is no `id` column
 * -- the exception `profiles`, `lotus_avatars`, `personas` and `chat_threads`
 * all take, for the reason `chat_threads` states: a surrogate key on a table
 * whose natural key is already a uuid buys nothing and costs a second unique
 * index.
 *
 * **THERE IS NO `locale` COLUMN AND `input_hash` MUST NEVER CARRY ONE**
 * (`personas`' rule, for a stronger reason). A locale here would make tapping
 * `EN` regenerate the memory and replace what the querent just read, and `C-D9`
 * plus this workstream's own scope put translating it out of scope entirely. One
 * row serves both locales; an English-UI querent may read an Indonesian line on
 * `/account`, and the fix for that is a translation, never a regeneration.
 */
export const userMemory = pgTable(
  'user_memory',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * The list. At most `USER_MEMORY_MAX_ITEMS`, capped IN CODE by the generator
     * and not by a `CHECK`: the extractor must never throw (`generatePersona`'s
     * rule), and a constraint that refuses a 33rd item would turn a model being
     * chatty into a row that silently fails to exist.
     *
     * **AN ARRAY OF ADDRESSABLE ITEMS AND NOT ONE PROSE BLOB.** Three things
     * force it and a blob satisfies none: phase 6's per-item deletion, phase 7's
     * `material_key` of `profile:<id>` which must rehydrate the text at plan
     * time from the key alone, and `chat_runs_user_material_uq`, which is what
     * stops the same opener firing twice and which keys on that string.
     *
     * `$type<>` IS AN ASSERTION THE DRIVER IS NOT OBLIGED TO HONOUR
     * (`answersUpdatedAt`'s lesson). Every consumer that RENDERS an item filters
     * it through `isUserMemoryItem`.
     */
    items: jsonb('items').$type<UserMemoryItem[]>().notNull(),
    /**
     * **THE TOMBSTONES, AND WITHOUT THEM THE DELETE BUTTON IS A LIE.**
     * `lotus_avatars.input_hash`'s argument, arriving in a worse shape: the
     * querent deletes *"suka nasi padang"*, the `chat_messages` rows that
     * produced it CASCADE rather than being cleared and are therefore still
     * there, and the next extraction puts the fact straight back. Only a
     * tombstone survives that, and only a content-derived `id` can be matched by
     * one -- which is why `UserMemoryItem.id` is a hash and not a random value.
     *
     * **HASHES, NEVER THE TEXT.** A dismissal list holding the sentences
     * somebody deleted would be worse than not offering deletion at all. The
     * exact cost is that a REWORDED restatement hashes differently and can come
     * back; that is the extractor's problem to mitigate, not a reason to store
     * the words.
     *
     * **NO ORDER IS PROMISED AND NO CAP IS APPLIED.** `dismissUserMemoryItems`
     * aggregates with `distinct`, so the array is value-ordered and set-like.
     * Every entry is put here by a human tapping a control, so the column is
     * bounded by human effort at twelve bytes an entry -- unlike `items`, which
     * a model writes and which is capped.
     *
     * **NOTHING BUT `dismissUserMemoryItems` WRITES IT.** `upsertUserMemory`
     * does not name the column at all, so the extractor cannot clobber a
     * refusal, and `redactUserMemory` deliberately KEEPS it so the thirty-day
     * restore does not resurrect facts the querent individually deleted.
     */
    dismissedIds: jsonb('dismissed_ids')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /**
     * SHA-256 over whatever the extractor read, plus `USER_MEMORY_SOURCE_VERSION`.
     * **LOCALE-FREE, see this table's header.** Whether it MOVES as the querent
     * talks (persona-shaped, so a flagged-off generation heals) or is STATIC
     * (lotus-shaped, so a flagged-off generation must write nothing) is phase 4's
     * decision; this column supports either.
     *
     * **THE EMPTY STRING IS A RESERVED VALUE MEANING "NEVER MATCHES."**
     * `redactUserMemory` writes it, and a staleness check that treated `''` as an
     * ordinary hash would leave an erased-then-restored account with an empty
     * memory that can never refill.
     */
    inputHash: text('input_hash').notNull(),
    /** Bump to force every memory to be rebuilt. `lotus_avatars`' rule. */
    sourceVersion: integer('source_version').notNull(),
    /** Which model wrote the current items. `'fallback'` if a template ever does. */
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    createdAt: tsCol('created_at').notNull().defaultNow(),
    /**
     * **SET BY HAND IN EVERY UPSERT.** `$onUpdate()` applies to `db.update()`
     * only and does NOT fire inside `onConflictDoUpdate`. `personas`' header
     * says the same thing and for this table the column is load-bearing twice:
     * it is the comparand for phase 4's staleness (so a frozen column means the
     * memory never regenerates) and it is the only column that says when the
     * current list was produced.
     */
    updatedAt: tsCol('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    /**
     * **THE PAYLOAD IS A LIST, AS A DATABASE FACT RATHER THAN A TYPESCRIPT
     * HOPE.** `$type<>` is an assertion; this is a constraint. Both columns are
     * written from model output or from a route body, and an object where an
     * array belongs would break every `jsonb_array_elements` in
     * `queries/memory.ts` with a runtime error at the worst moment.
     *
     * **NEITHER CHECK INVOLVES A COLUMN CARRYING `ON DELETE SET NULL`**
     * (`F1-D7`, `[R7]`). `user_id` cascades, and a CHECK on a `set null` column
     * fires DURING the delete and aborts the erasure -- A1's `23502` lesson.
     * There is no such column here and there must not be one added.
     */
    check('user_memory_items_array_ck', sql`jsonb_typeof(${t.items}) = 'array'`),
    check('user_memory_dismissed_array_ck', sql`jsonb_typeof(${t.dismissedIds}) = 'array'`),
  ],
);
```

**Change (c) — the row types.** Append at the very end of the file, after `NewAuthHandoff`.

**Code:**

```ts
/** `UserMemory`, singular, though the table is too: one row is one person's memory. */
export type UserMemory = typeof userMemory.$inferSelect;
export type NewUserMemory = typeof userMemory.$inferInsert;
```

**Impact:** `items` has **no default**, so it is required in `NewUserMemory` — deliberate: an
upsert whose caller forgot the list would otherwise silently write `[]` over a good memory.
`dismissed_ids` **does** have one, so no insert has to name it.

---

### Step 4: Migration `0017`

**File:** `src/lib/db/migrations/0017_r2-user-memory.sql` + `meta/0017_snapshot.json` +
`meta/_journal.json` (all generated)

**Change:** Run, with Node 24 on PATH:

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run db:generate -- --name r2-user-memory
```

**`drizzle-kit push` is banned** (README rule 7). Commit `schema.ts`, the `.sql`, the snapshot and
`_journal.json` **in one commit** (rule 4) — a `.sql` without its journal entry is invisible to
the migrator and a journal entry without its `.sql` crashes it. **No migration in this project
inserts a row** (rule 8) and this one does not.

**Expected output — verify what drizzle emits matches this, and commit what it emits, not this:**

```sql
CREATE TABLE "user_memory" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"items" jsonb NOT NULL,
	"dismissed_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"source_version" integer NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_memory_items_array_ck" CHECK (jsonb_typeof("user_memory"."items") = 'array'),
	CONSTRAINT "user_memory_dismissed_array_ck" CHECK (jsonb_typeof("user_memory"."dismissed_ids") = 'array')
);
--> statement-breakpoint
ALTER TABLE "user_memory" ADD CONSTRAINT "user_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
```

`_journal.json` gains, appended to `entries`:

```json
    {
      "idx": 17,
      "version": "7",
      "when": 0,
      "tag": "0017_r2-user-memory",
      "breakpoints": true
    }
```

(`when` is drizzle's own epoch-millisecond stamp; take whatever it writes.)

Then:

```sh
npm run db:up
npm run db:migrate     # apply
npm run db:migrate     # again -- idempotent, must be a no-op
npm run db:test:reset  # the test database gets it too
```

**If `_journal.json` conflicts at merge time, do not hand-resolve it** (rule 6): delete your own
`.sql` and snapshot, take theirs wholesale, re-run `npm run db:generate`. Phase 1 claims **no**
migration number, so the only real risk is a phase that discovers it needs a column after all —
which is why `0017` is stated as claimed in the Interface Contract.

**Impact:** `npm run build` on Vercel applies it via `scripts/db-migrate-deploy.ts` and **fails the
build** rather than skipping. Additive and non-destructive, so it is safe to deploy ahead of the
code that reads it — which is the whole reason this phase lands before phase 4.

---

### Step 5: The query module

**File:** `src/lib/db/queries/memory.ts` (new)

**Change:** Five functions, handle first and named `db`, no caching, its own `UUID_RE` (the
convention `share.ts`, `allTime.ts` and `history.ts` each follow), and no import that could carry
`server-only` — the module imports `drizzle-orm`, `@/lib/db/schema` and `@/lib/db/types` and
nothing else, so `queries/contract.test.ts`'s transitive walk passes without an exception entry.

**Code:**

```ts
/**
 * `user_memory`, read and written. ONE ROW PER USER (R2).
 *
 * The four rules of this directory, applied:
 *
 *  1. The handle comes FIRST, so `deleteAccount`'s transaction and the
 *     integration suite's rolled-back one can both be passed in. That is what
 *     makes the erasure duty testable at all.
 *  2. Nothing here imports `../client`, `react`, `next/*` or `server-only` --
 *     not even transitively. **`USER_MEMORY_SOURCE_VERSION` is deliberately NOT
 *     imported**, even though it lives in a zero-import leaf and could be: the
 *     version is the caller's to supply, exactly as `PERSONA_SOURCE_VERSION` is
 *     in `persona.ts`, because the caller has just computed the hash and holds
 *     it anyway. `queries/lotus.ts` is the one name-excluded exception in
 *     `contract.test.ts` for doing otherwise, and it is recorded there as a
 *     defect rather than a pattern.
 *  3. No caching. The readers are `/account` (occasional) and phase 5's
 *     assembler (once per run, alongside five other reads under one
 *     `Promise.all`). A cache that served a just-deleted item back into a prompt
 *     would be the delete button lying through a second door.
 *  4. One file per read concern. Per-item dismissal lives here rather than in
 *     phase 6's route because it is a WRITE to this table, and a second module
 *     writing these two columns is how `items` and `dismissed_ids` end up
 *     disagreeing.
 *
 * **NOTHING HERE VALIDATES.** `isUserMemoryItem` exists in
 * `@/lib/memory/profile/types` and is the consumer's to call. A reader that
 * silently dropped malformed rows would hide a real corruption from the only
 * layer that could report it -- and rule 2 is easier to keep when this file
 * imports nothing it does not need.
 */
import { and, eq, sql } from 'drizzle-orm';
import { userMemory, type NewUserMemory, type UserMemory } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';

/**
 * `queries/share.ts`'s guard, for its reason: `user_id` is a uuid column, and
 * postgres raises `22P02` on a malformed literal rather than returning nothing.
 * A read that 500s on a bad id turns a caller's bug into an outage.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The ids `dismissUserMemoryItems` will act on. **DUPLICATED HERE RATHER THAN
 * IMPORTED**, because rule 2 above is worth more than four characters of reuse
 * and because this is a WHERE-clause guard rather than the contract: the
 * contract's copy is `USER_MEMORY_ITEM_ID_RE`, and the two cannot drift in a way
 * that matters -- a narrower guard here refuses a delete, which is visible, and
 * `memory.integration.test.ts` pins the shape.
 */
const ITEM_ID_RE = /^[0-9a-f]{12}$/;

/** NULL IS NORMAL. Nobody has a memory until they have talked in the room. */
export async function getUserMemory(db: DbOrTx, userId: string): Promise<UserMemory | null> {
  if (!UUID_RE.test(userId)) return null;
  const [row] = await db.select().from(userMemory).where(eq(userMemory.userId, userId)).limit(1);
  return row ?? null;
}

/**
 * The extractor's one writer.
 *
 * **IT DOES NOT NAME `dismissed_ids`, AND THAT IS THE POINT.** The querent owns
 * that column and the model owns `items`; a `set` that mentioned both would let
 * one extraction quietly undo every deletion the querent had made. The insert
 * arm leaves it to the column default, and the conflict arm leaves it alone.
 *
 * `createdAt` is deliberately NOT in the conflict `set`: "when did this person
 * first get a memory" must survive every regeneration. `updatedAt` IS, BY HAND
 * -- `$onUpdate()` applies to `db.update()` only, so without that line the
 * column freezes at the first insert, silently, while every other assertion
 * about the row still passes.
 */
export async function upsertUserMemory(db: DbOrTx, row: NewUserMemory): Promise<void> {
  await db
    .insert(userMemory)
    .values(row)
    .onConflictDoUpdate({
      target: userMemory.userId,
      set: {
        items: row.items,
        inputHash: row.inputHash,
        sourceVersion: row.sourceVersion,
        model: row.model,
        promptVersion: row.promptVersion,
        updatedAt: new Date(),
      },
    });
}

/**
 * Move `updated_at` and nothing else. `touchPersona`'s function, for
 * `touchPersona`'s reason, written down here because the bug it prevents costs
 * a model call on every page view and gets misdiagnosed as caching.
 *
 * If phase 4's staleness compares a source timestamp -- the newest chat message,
 * say -- against `user_memory.updated_at`, the comparison is self-clearing in
 * every case but one: **an extraction that finds nothing new leaves
 * `input_hash` byte-identical**, so the generator returns `unchanged` and never
 * writes, leaving the source permanently ahead of the memory and a dirty flag
 * that is re-evaluated forever.
 *
 * **IT TOUCHES NOTHING ELSE.** Rewriting `items` with itself would make `model`
 * and `updated_at` claim a generation that did not happen. **IT IS NOT AN
 * UPSERT**: no row means no flag to clear, and inserting one here would create a
 * memory with no provenance. The `where` simply matches nothing, which is the
 * correct no-op.
 */
export async function touchUserMemory(db: DbOrTx, userId: string): Promise<void> {
  if (!UUID_RE.test(userId)) return;
  await db.update(userMemory).set({ updatedAt: new Date() }).where(eq(userMemory.userId, userId));
}

/**
 * **THE QUERENT'S DELETE, AND IT IS ONE STATEMENT ON PURPOSE.**
 *
 * A read-modify-write would race the extractor's `after()` and lose: two tabs,
 * or one tab and one background run, and the item comes back with nothing
 * logged. So the filter and the append both happen in SQL, correlated against
 * the row being updated.
 *
 * **BOTH HALVES ARE REQUIRED AND NEITHER IS SUFFICIENT.** Removing from `items`
 * alone means the next extraction re-adds the fact from a transcript that still
 * contains the evidence -- `lotus_avatars.input_hash`'s "the delete button is a
 * lie". Appending to `dismissed_ids` alone leaves the line on screen.
 *
 * `jsonb_exists(a, b)` IS THE FUNCTION FORM OF THE `?` OPERATOR and is used
 * deliberately: a bare `?` in a SQL string is a placeholder character in several
 * drivers, and a statement that works today because of how one driver tokenises
 * is not a statement to leave in a delete path.
 *
 * Returns the row as it now stands so a route can render the new state without
 * a second read, or `null` when there was no row -- which is the ordinary
 * outcome for a querent who has never talked in the room, and not an error.
 */
export async function dismissUserMemoryItems(
  db: DbOrTx,
  userId: string,
  ids: string[],
): Promise<UserMemory | null> {
  if (!UUID_RE.test(userId)) return null;

  /*
   * MALFORMED IDS ARE DROPPED, NOT REFUSED. They cannot match anything in
   * `items` and putting one in `dismissed_ids` would tombstone nothing forever.
   * An empty set after filtering is a read, so a route that posts junk gets the
   * current state back rather than a 500.
   */
  const wanted = [...new Set(ids.filter((id) => ITEM_ID_RE.test(id)))];
  if (wanted.length === 0) return getUserMemory(db, userId);

  const json = JSON.stringify(wanted);

  const [row] = await db
    .update(userMemory)
    .set({
      items: sql`(
        select coalesce(jsonb_agg(e), '[]'::jsonb)
        from jsonb_array_elements(${userMemory.items}) as e
        where not jsonb_exists(${json}::jsonb, e ->> 'id')
      )`,
      dismissedIds: sql`(
        select coalesce(jsonb_agg(distinct d), '[]'::jsonb)
        from jsonb_array_elements_text(${userMemory.dismissedIds} || ${json}::jsonb) as d
      )`,
      /* BY HAND. See `upsertUserMemory`. */
      updatedAt: new Date(),
    })
    .where(eq(userMemory.userId, userId))
    .returning();

  return row ?? null;
}

/**
 * **THE ERASURE DUTY. `deleteAccount()` CALLS THIS INSIDE THE TRANSACTION THAT
 * SETS `deleted_at`**, and `delete.ts`'s header carries the ruling and the
 * amendment it makes to that file's own foreign-key rule. Summarised here
 * because this is the function somebody will read first:
 *
 *  - `user_id` CASCADES, so the row is gone at the hard delete thirty days
 *    later anyway. It is emptied NOW because it is the one row in this database
 *    that is a model's dossier about a person rather than something they typed,
 *    and it is what a person means when they press the button.
 *  - **A REDACTION AND NOT A DELETE.** `dismissed_ids` is KEPT. Dropping the row
 *    would take the tombstones with it, so a querent who erased their account
 *    and signed back in on day three would find the facts they had individually
 *    deleted coming back. The tombstones are opaque hashes carrying no text and
 *    can only ever prevent a write.
 *  - **`input_hash` IS BLANKED IN THE SAME STATEMENT AND FORGETTING IT WOULD
 *    SILENTLY KILL THE FEATURE.** An empty `items` beside a matching hash means
 *    the extractor reports `unchanged` and never writes again. `''` is the
 *    reserved never-matches value; phase 4's staleness must treat it as stale.
 *  - It costs the thirty-day restore NOTHING, which is why it is cheap enough to
 *    do at all: every input is `chat_messages` and `readings`, both of which
 *    cascade and therefore survive the soft delete, so a restored account has
 *    its memory rebuilt on the next run. `clearFreeTextAnswers()` stays out of
 *    that transaction because `onboarding_answers` is the only copy of text a
 *    person typed. **Derived-and-regenerable is a third category and it is what
 *    decides this case, not the foreign key.**
 *
 * The `where` makes it idempotent and makes the count mean something --
 * `redactForUser`'s `question is not null`, in a new shape. A replayed erasure
 * reports 0, which is how the route tells "we just erased you" from "you were
 * already gone" without a second read.
 */
export async function redactUserMemory(db: DbOrTx, userId: string): Promise<number> {
  if (!UUID_RE.test(userId)) return 0;
  const rows = await db
    .update(userMemory)
    .set({ items: [], inputHash: '', updatedAt: new Date() })
    .where(
      and(
        eq(userMemory.userId, userId),
        sql`(jsonb_array_length(${userMemory.items}) > 0 or ${userMemory.inputHash} <> '')`,
      ),
    )
    .returning({ userId: userMemory.userId });
  return rows.length;
}
```

**Impact:** `queries/contract.test.ts` counts `queryModules` and asserts every exported function's
first parameter is `db`; all five satisfy it. The transitive walk needs no new exception.

---

### Step 6: `resetDb()` learns the table

**File:** `src/lib/db/testing/harness.ts:103` (the function) and `:97` (the paragraph above it)

**Change:** Append one sentence to the header and one relation to the `TRUNCATE`, following the
procedure that header established: the table joins the list **in the migration's own commit**,
never in a later reconciliation.

**Code (replace the last paragraph of the doc comment and the function):**

```ts
/**
 * **SEVENTEEN BECAME TWENTY WITH F1's `0014` (v0.7.0), IN THAT MIGRATION'S OWN
 * COMMIT**, following the procedure the two paragraphs above established rather
 * than a reconciliation. `CASCADE` would reach `chat_messages` and `chat_runs` from
 * `chat_threads`, and all three are named anyway for the same reason the blog pair
 * is. The list stays exhaustive by intent.
 *
 * **TWENTY BECAME TWENTY-ONE WITH R2's `0017`**, same procedure, same commit.
 * `user_memory` cascades from `users` and is named anyway. **`admin_insights`
 * (`0013`) and `auth_handoffs` (`0015`) are still MISSING from this list** --
 * a pre-existing gap, named here rather than fixed by a phase that owns neither,
 * so that "was it forgotten?" stays answerable.
 */
export async function resetDb(): Promise<void> {
  await testDb.execute(sql`
    TRUNCATE TABLE users, profiles, onboarding_answers, lotus_avatars,
                   readings, reading_cards, events, daily_summaries,
                   moderation_flags, frequency_verdicts, translations,
                   share_links, personas, admin_access_log, llm_calls,
                   blog_posts, blog_post_locales,
                   chat_threads, chat_messages, chat_runs,
                   user_memory
    RESTART IDENTITY CASCADE`);
}
```

**Impact:** `resetDb()` is the escape hatch used by tests that commit their own transaction. A
`user_memory` row left behind would surface as leaked state in an unrelated suite.

---

### Step 7: The erasure path

**File:** `src/lib/account/delete.ts` — header (`:21`–`:26`), imports (`:41`–`:46`), the outcome
type (`:48`), and the transaction body (`:73`–`:92`)

**Change (a) — the header.** Replace the "WHAT IS DELIBERATELY *NOT* IN HERE" paragraph with a
version that keeps every word of the existing ruling and adds the amendment beneath it. The
existing text is not deleted; a third category is named.

**Code — the full new file:**

```ts
/**
 * Account erasure (VD13). THE BUTTON `/privacy` §8 HAS DESCRIBED FOR A RELEASE.
 *
 * `redactForUser()` RUNS IN THE SAME TRANSACTION THAT SETS `deleted_at`, AND
 * THAT IS THE ENTIRE DESIGN. `moderation_flags.user_id` is `on delete set null`,
 * so the row OUTLIVES the account -- a self-harm disclosure would otherwise sit
 * there for up to thirty more days, which is exactly what "delete my data" is
 * supposed to prevent. `log.ts`'s `redactForUser` header says so in those words
 * and names this file as the caller it did not have.
 *
 * `revokeAllForUser()` IS IN HERE FOR THE SAME SHAPE OF REASON, AND V8 FOUND IT
 * RATHER THAN THE ROADMAP (reconciliation §5.6). `share_links.user_id` is
 * `on delete cascade`, and that cascade fires at the HARD delete thirty days
 * later -- so without this call a shared reading or persona keeps serving the
 * public internet for a month after somebody asked to be forgotten. V8's plan
 * §3.1 has it behind a guarded dynamic import because V7 had not landed; V7 HAS
 * landed, `queries/share.ts` exports it handle-first for exactly this caller, and
 * a static import is the honest shape now. THE GUARD WAS NEVER THE POINT -- the
 * call site was.
 *
 * WHAT IS DELIBERATELY *NOT* IN HERE: `clearFreeTextAnswers()`.
 * `onboarding_answers` is `on delete cascade`, so the thirty-day hard delete
 * removes it outright; clearing it now would buy nothing and would break the
 * restore that `upsertUserOnSignIn` implements and that the confirmation copy
 * promises. The asymmetry with `moderation_flags` IS the asymmetry in the foreign
 * keys: `set null` outlives the account, `cascade` does not.
 *
 * ── `redactUserMemory()` AMENDS THAT ASYMMETRY, AND THE AMENDMENT IS THE POINT
 *    (v0.8.0 / R2, 2026-08-30) ──────────────────────────────────────────────────
 *
 * `user_memory.user_id` CASCADES, so by the rule in the paragraph above this
 * table needs no line here. It gets one anyway.
 *
 * **THE FOREIGN KEY ANSWERS "DOES IT SURVIVE", NOT "IS IT THE THING THEY
 * MEANT".** Every other cascading table holds text the querent TYPED --
 * `chat_messages.body`, `readings.question`, `onboarding_answers.answer_text` --
 * or prose about a READING. `user_memory.items` is the first row in this
 * database that is a model's dossier ABOUT a person, assembled from a
 * conversation they were having for another reason and kept so that it can be
 * used on them later. Thirty more days of that is `moderation_flags`' risk
 * wearing a different foreign key, and it is precisely what somebody means when
 * they press the button.
 *
 * **IT COSTS THE THIRTY-DAY RESTORE NOTHING, AND THAT IS WHAT MAKES IT CHEAP
 * ENOUGH TO DO.** `clearFreeTextAnswers()` stays out because
 * `onboarding_answers` is the ONLY copy of text a person typed. `user_memory` is
 * DERIVED AND REGENERABLE: every input is `chat_messages` and `readings`, both
 * of which cascade and therefore survive the soft delete, and the extractor is
 * idempotent -- so a querent who signs back in on day 29 has the room's memory
 * rebuilt on the next run. **Derived-and-regenerable is a THIRD category, and it
 * is what decides this case rather than the foreign key.**
 *
 * **IT IS A REDACTION AND NOT A DELETE, AND `dismissed_ids` IS KEPT.** Dropping
 * the row would take the tombstones with it, so a querent who erased their
 * account and changed their mind on day three would find the facts they had
 * individually deleted coming straight back. Those are opaque hashes carrying no
 * text, and they can only ever PREVENT a write. `queries/memory.ts` carries the
 * rest, including why `input_hash` is blanked in the same statement.
 *
 * **THIS DOES NOT LICENSE ADDING `personas` HERE.** `personas.body` is also
 * model-written prose about the person and it stays out: it is distilled from a
 * rite the querent walked through, it is shown TO them on `/account` as the
 * product, and it is not assembled from a conversation they were having for
 * another reason. Changing that is a ruling, not a tidy-up.
 *
 * ORDER MATTERS AND IT IS NOT ALPHABETICAL. Revocation and redaction run BEFORE
 * the flag, so a failure in a statement that actually removes something aborts
 * the whole thing rather than leaving an account marked deleted with its text
 * intact. `delete.integration.test.ts` proves it with a trigger, and a
 * source-level test in the same file proves nobody reordered it afterwards.
 *
 * NOT A QUERY MODULE -- it is a writer, like `flush.ts` and `log.ts` -- but it
 * still takes the handle FIRST, because two conventions inside one feature is
 * worse than one applied slightly beyond its home. `memory/frequency.ts`'s header
 * makes the same call. Taking the handle is also what lets the integration suite
 * pass a rolled-back transaction in, which is the only way the boundary above is
 * testable at all.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { redactUserMemory } from '@/lib/db/queries/memory';
import { ERASURE_GRACE_DAYS } from '@/lib/db/queries/profile';
import { revokeAllForUser } from '@/lib/db/queries/share';
import { users } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';
import { redactForUser } from '@/lib/moderation/log';

export type DeleteOutcome = {
  /**
   * False when there was no live row to flag -- already deleted, or never
   * existed. The route turns that into a 404, and the two are deliberately
   * indistinguishable to the caller.
   */
  deleted: boolean;
  flagsRedacted: number;
  linksRevoked: number;
  /**
   * 1 when a memory row was emptied, 0 when there was nothing to empty --
   * `flagsRedacted`'s shape, for `flagsRedacted`'s reason: a count is the only
   * thing about an erasure that is safe to keep.
   *
   * **DELIBERATELY NOT WIRED INTO `account.deleted`.** `events.ts` is a closed
   * taxonomy with one owner per release and folding a declaration in means
   * transcribing it, not adding to it -- so the prop is a decision for whoever
   * owns that file this release, not a side effect of this one. The field earns
   * its place here regardless: it is what
   * `delete.integration.test.ts` asserts against.
   */
  memoryRedacted: number;
};

export async function deleteAccount(db: DbOrTx, userId: string): Promise<DeleteOutcome> {
  /*
   * Computed BEFORE the transaction and returned whatever happens inside it, so
   * the number the user is shown is the number the sweep will act on. The sweep
   * reads `deleted_at + ERASURE_GRACE_DAYS`; the constant is imported rather than
   * typed, because `profile.ts` exports it precisely so the copy and the cron
   * cannot disagree.
   */
  const restorableUntil = new Date(
    Date.now() + ERASURE_GRACE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const result = await db.transaction(async (tx) => {
    const linksRevoked = await revokeAllForUser(tx, userId);
    const flagsRedacted = await redactForUser(tx, userId);
    /*
     * BEFORE THE FLAG, like the two above it and for the same reason: a failure
     * here must abort the whole thing rather than leave an account marked
     * deleted with a model's dossier about it intact.
     */
    const memoryRedacted = await redactUserMemory(tx, userId);

    /*
     * `where deleted_at is null` makes this idempotent and makes the return value
     * mean something: a replayed request does not move the timestamp, so "when
     * did this person ask to be erased" stays answerable and the grace window
     * cannot be silently extended by tapping the button twice.
     */
    const flagged = await tx
      .update(users)
      /* `users` carries no `updated_at` -- W1 did not give it one -- so there is
         nothing to touch by hand here. `deleted_at` IS the timestamp. */
      .set({ deletedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning({ id: users.id });

    return { deleted: flagged.length === 1, flagsRedacted, linksRevoked, memoryRedacted };
  });

  return { ...result, restorableUntil };
}
```

**Impact:** `src/app/api/account/route.ts` needs **no** edit — its response body and its analytics
props are both named explicitly. `history.softDelete.integration.test.ts:245,281` compares against
`linksRevoked` inside object literals for `redactForUser`'s *own* return shape, not
`DeleteOutcome`'s, so it is unaffected; **re-run it to confirm** rather than assuming.
`src/app/admin/users/[id]/page.contract.test.ts:167` greps the admin subtree for
`deleteAccount|redactForUser|revokeAllForUser|clearFreeTextAnswers` and this change touches no
admin file. **The existing `expect(src).not.toMatch(/chat_?[Mm]essages|chatThreads|chatRuns/)`
still passes** — `redactUserMemory` matches none of those, which is worth knowing before running
it and being surprised.

---

### Step 8: The query module's integration test

**File:** `src/lib/db/queries/memory.integration.test.ts` (new)

**Change:** Named `*.integration.test.ts` or the unit project picks it up and fails with no
database. Runs inside `withRollback`.

**Code:**

```ts
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  dismissUserMemoryItems,
  getUserMemory,
  redactUserMemory,
  touchUserMemory,
  upsertUserMemory,
} from '@/lib/db/queries/memory';
import { userMemory, users } from '@/lib/db/schema';
import { closeTestDb, testDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import {
  USER_MEMORY_SOURCE_VERSION,
  type UserMemoryItem,
} from '@/lib/memory/profile/types';

afterAll(closeTestDb);

let n = 0;

async function seedUser(tx: Tx): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `mem:${n}`, email: `mem${n}@example.com` })
    .returning({ id: users.id });
  return user.id;
}

const item = (id: string, text: string): UserMemoryItem => ({
  id,
  kind: 'taste',
  text,
  lastSeen: '2026-08-30',
});

const NASI = item('0a1b2c3d4e5f', 'suka nasi padang buat makan malam');
const LARI = item('112233445566', 'lari pagi, idealnya jam lima');

async function seedMemory(tx: Tx, userId: string, items: UserMemoryItem[]) {
  await upsertUserMemory(tx, {
    userId,
    items,
    inputHash: 'hash-1',
    sourceVersion: USER_MEMORY_SOURCE_VERSION,
    model: 'glm-5.3',
    promptVersion: 'um-1',
  });
}

describe('getUserMemory', () => {
  it('returns null for a user with no row, which is the ordinary case', () =>
    withRollback(async (tx) => {
      expect(await getUserMemory(tx, await seedUser(tx))).toBeNull();
    }));

  it('returns null for a malformed uuid rather than raising 22P02', () =>
    withRollback(async (tx) => {
      // A read that 500s on a caller's bug is an outage. `share.ts`'s guard.
      expect(await getUserMemory(tx, 'not-a-uuid')).toBeNull();
    }));
});

describe('upsertUserMemory', () => {
  it('inserts, defaults dismissed_ids to an empty array, and round-trips the items', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI, LARI]);

      const row = await getUserMemory(tx, userId);
      expect(row?.items).toEqual([NASI, LARI]);
      expect(row?.dismissedIds).toEqual([]);
      expect(row?.inputHash).toBe('hash-1');
      expect(row?.model).toBe('glm-5.3');
    }));

  it('MOVES updated_at BY HAND on conflict and leaves created_at alone', () =>
    withRollback(async (tx) => {
      /*
       * THE ASSERTION THIS WHOLE FILE EXISTS FOR. `$onUpdate()` does not fire
       * inside `onConflictDoUpdate`, so without the explicit line the column
       * freezes at the first insert -- silently, because every other assertion
       * about the row still passes. Phase 4's staleness compares against it.
       */
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI]);
      const first = await getUserMemory(tx, userId);

      await tx.execute(sql`select pg_sleep(0.01)`);
      await upsertUserMemory(tx, {
        userId,
        items: [NASI, LARI],
        inputHash: 'hash-2',
        sourceVersion: USER_MEMORY_SOURCE_VERSION,
        model: 'glm-5.3',
        promptVersion: 'um-1',
      });
      const second = await getUserMemory(tx, userId);

      expect(second!.items).toHaveLength(2);
      expect(second!.inputHash).toBe('hash-2');
      expect(second!.createdAt.getTime()).toBe(first!.createdAt.getTime());
      expect(second!.updatedAt.getTime()).toBeGreaterThan(first!.updatedAt.getTime());
    }));

  it('NEVER CLOBBERS dismissed_ids', () =>
    withRollback(async (tx) => {
      /*
       * The querent owns that column and the model owns `items`. An extraction
       * that could undo a deletion is the delete button lying through the one
       * door the tombstone was built to close.
       */
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI, LARI]);
      await dismissUserMemoryItems(tx, userId, [NASI.id]);

      await upsertUserMemory(tx, {
        userId,
        items: [LARI],
        inputHash: 'hash-3',
        sourceVersion: USER_MEMORY_SOURCE_VERSION,
        model: 'glm-5.3',
        promptVersion: 'um-1',
      });

      expect((await getUserMemory(tx, userId))!.dismissedIds).toEqual([NASI.id]);
    }));
});

describe('the array CHECK constraints', () => {
  it('refuses a jsonb object where a list belongs', () =>
    withRollback(async (tx) => {
      // `$type<>` is an assertion the driver is not obliged to honour; this is
      // the version postgres enforces.
      const userId = await seedUser(tx);
      await expect(
        tx.execute(sql`
          insert into user_memory (user_id, items, input_hash, source_version, model, prompt_version)
          values (${userId}, '{"a":1}'::jsonb, 'h', 1, 'm', 'p')`),
      ).rejects.toThrow();
    }));
});

describe('dismissUserMemoryItems', () => {
  it('removes the item AND tombstones its id, in one statement', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI, LARI]);

      const row = await dismissUserMemoryItems(tx, userId, [NASI.id]);

      expect(row!.items).toEqual([LARI]);
      expect(row!.dismissedIds).toEqual([NASI.id]);
    }));

  it('is idempotent, and a second pass adds no duplicate tombstone', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI, LARI]);
      await dismissUserMemoryItems(tx, userId, [NASI.id]);
      const row = await dismissUserMemoryItems(tx, userId, [NASI.id]);
      expect(row!.items).toEqual([LARI]);
      expect(row!.dismissedIds).toEqual([NASI.id]);
    }));

  it('empties the list to `[]` rather than to null when the last item goes', () =>
    withRollback(async (tx) => {
      // `coalesce(..., '[]'::jsonb)`. A null here would violate the NOT NULL and
      // abort the querent's delete.
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI]);
      const row = await dismissUserMemoryItems(tx, userId, [NASI.id]);
      expect(row!.items).toEqual([]);
    }));

  it('drops a malformed id instead of tombstoning it', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI]);
      const row = await dismissUserMemoryItems(tx, userId, ['../../etc/passwd', 'ZZZZ']);
      expect(row!.items).toEqual([NASI]);
      expect(row!.dismissedIds).toEqual([]);
    }));

  it('returns null for a user with no row', () =>
    withRollback(async (tx) => {
      expect(await dismissUserMemoryItems(tx, await seedUser(tx), [NASI.id])).toBeNull();
    }));

  it('touches nobody else', () =>
    withRollback(async (tx) => {
      const mine = await seedUser(tx);
      const theirs = await seedUser(tx);
      await seedMemory(tx, mine, [NASI, LARI]);
      await seedMemory(tx, theirs, [NASI, LARI]);

      await dismissUserMemoryItems(tx, mine, [NASI.id]);

      expect((await getUserMemory(tx, theirs))!.items).toHaveLength(2);
    }));
});

describe('touchUserMemory', () => {
  it('moves updated_at and nothing else', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI]);
      const before = await getUserMemory(tx, userId);

      await tx.execute(sql`select pg_sleep(0.01)`);
      await touchUserMemory(tx, userId);
      const after = await getUserMemory(tx, userId);

      expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
      expect(after!.items).toEqual(before!.items);
      expect(after!.inputHash).toBe(before!.inputHash);
      expect(after!.model).toBe(before!.model);
    }));

  it('IS NOT AN UPSERT -- no row means no flag to clear', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await touchUserMemory(tx, userId);
      expect(await getUserMemory(tx, userId)).toBeNull();
    }));
});

describe('redactUserMemory', () => {
  it('empties items, blanks input_hash and KEEPS the tombstones', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI, LARI]);
      await dismissUserMemoryItems(tx, userId, [NASI.id]);

      expect(await redactUserMemory(tx, userId)).toBe(1);

      const row = await getUserMemory(tx, userId);
      expect(row!.items).toEqual([]);
      /*
       * BLANKED ON PURPOSE. An emptied list beside a matching hash means the
       * extractor reports `unchanged` and never writes again -- the feature dead
       * with nothing logged.
       */
      expect(row!.inputHash).toBe('');
      /*
       * KEPT ON PURPOSE. Dropping the row would resurrect, on a day-three
       * restore, exactly the facts the querent had individually deleted.
       */
      expect(row!.dismissedIds).toEqual([NASI.id]);
    }));

  it('is idempotent and reports 0 on a replay', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI]);
      expect(await redactUserMemory(tx, userId)).toBe(1);
      expect(await redactUserMemory(tx, userId)).toBe(0);
    }));

  it('reports 0 for a user with no memory and for a malformed uuid', () =>
    withRollback(async (tx) => {
      expect(await redactUserMemory(tx, await seedUser(tx))).toBe(0);
      expect(await redactUserMemory(tx, 'not-a-uuid')).toBe(0);
    }));
});

describe('the cascade', () => {
  it('takes the whole row with the account at the HARD delete', () =>
    withRollback(async (tx) => {
      /*
       * NAMED FOR THE PROMISE: `/privacy` clause 8 says everything is removed
       * from the database within thirty days, and this is the only thing that
       * makes that sentence true for this table. **`user_memory.user_id` MUST
       * STAY `on delete cascade`.** The day somebody changes it to `set null`
       * "to keep the analytics", a model's dossier about a deleted person
       * outlives them and this paragraph becomes false, silently.
       */
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI]);

      await tx.delete(users).where(sql`id = ${userId}`);

      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(userMemory)
        .where(sql`user_id = ${userId}`);
      expect(row.n).toBe(0);
    }));
});

describe('testDb is reachable', () => {
  it('answers a trivial query, so a red suite means the code and not the container', async () => {
    const rows = await testDb.execute(sql`select 1 as one`);
    expect(rows[0].one).toBe(1);
  });
});
```

**Impact:** `npm run test:integration` gains one file. Needs `npm run db:up` and
`npm run db:test:reset` first, so `0017` is present in `jmtarot_test`.

---

### Step 9: The erasure boundary, asserted

**File:** `src/lib/account/delete.integration.test.ts` — extend `seedUserWithFlag`, add three
cases, and one line to the source-order test.

**Change (a):** `seedUserWithFlag` gains a memory row, so every existing case exercises the new
statement.

**Code (replace the function and its doc comment):**

```ts
/**
 * A user, one moderation flag that still holds text, one live share link, and
 * one `user_memory` row with a line in it and a tombstone beside it.
 *
 * The flag's `question` is a placeholder rather than real ciphertext: nothing
 * under test decrypts it, and the only property that matters is "there is text
 * here and afterwards there is not". The memory row is there for the same
 * reason, plus one more -- the tombstone is what proves the erasure REDACTS
 * rather than DELETES.
 */
async function seedUserWithFlag(tx: Tx): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `del:${n}`, email: `del${n}@example.com` })
    .returning({ id: users.id });

  await tx.insert(moderationFlags).values({
    userId: user.id,
    question: 'v1.ciphertext-placeholder',
    questionHmac: `hmac-${n}`,
    category: 'self_harm',
    source: 'classifier',
    locale: 'id',
  });

  await tx.insert(shareLinks).values({
    slug: `SLUG${String(n).padStart(8, '0')}`,
    userId: user.id,
    entity: 'reading',
    entityId: user.id,
  });

  await tx.insert(userMemory).values({
    userId: user.id,
    items: [
      { id: '0a1b2c3d4e5f', kind: 'taste', text: 'suka nasi padang', lastSeen: '2026-08-30' },
    ],
    dismissedIds: ['aabbccddeeff'],
    inputHash: 'hash-1',
    sourceVersion: 1,
    model: 'glm-5.3',
    promptVersion: 'um-1',
  });

  return user.id;
}
```

The import line at `:3` becomes:

```ts
import { chatMessages, chatRuns, chatThreads, moderationFlags, shareLinks, userMemory, users } from '@/lib/db/schema';
```

**Change (b):** three new cases, appended after the existing `deleteAccount` describe block.

**Code:**

```ts
/**
 * ── R2's ERASURE DUTY (v0.8.0, 2026-08-30) ────────────────────────────────────
 *
 * **`user_memory` IS ON `moderation_flags`' SIDE OF `delete.ts`'s ASYMMETRY EVEN
 * THOUGH ITS FOREIGN KEY IS ON `readings`' SIDE**, and that is an amendment
 * rather than an oversight. The foreign key answers "does it survive"; it does
 * not answer "is this the thing they meant". `items` is a model's dossier about
 * a person, assembled from a conversation they were having for another reason --
 * the only row in this database of which that is true -- and thirty more days of
 * it is exactly what the button is supposed to prevent.
 *
 * It costs the restore nothing, which is what makes it cheap enough to do: the
 * inputs are `chat_messages` and `readings`, both of which cascade and therefore
 * SURVIVE the soft delete, so a restored account has its memory rebuilt on the
 * next run. `clearFreeTextAnswers()` stays out because `onboarding_answers` is
 * the only copy of text a person typed. `delete.ts`'s header carries the whole
 * argument, including why this does not license adding `personas`.
 */
describe('the user memory and the erasure promise', () => {
  const memoryOf = async (tx: Tx, userId: string) => {
    const [row] = await tx.execute(
      sql`select items, dismissed_ids, input_hash from user_memory where user_id = ${userId}`,
    );
    return row;
  };

  it('EMPTIES the memory in the same transaction that sets deleted_at', () =>
    withRollback(async (tx) => {
      const userId = await seedUserWithFlag(tx);
      const out = await deleteAccount(tx, userId);

      expect(out.deleted).toBe(true);
      expect(out.memoryRedacted).toBe(1);

      const row = await memoryOf(tx, userId);
      expect(row.items).toEqual([]);
      /*
       * `input_hash` BLANKED IN THE SAME STATEMENT. An emptied list beside a
       * matching hash means the extractor reports `unchanged` and never writes
       * again -- the feature dead after any erasure, with nothing logged.
       */
      expect(row.input_hash).toBe('');
      /*
       * TOMBSTONES KEPT. This is a REDACTION, not a delete. Dropping the row
       * would resurrect, on a day-three restore, exactly the facts the querent
       * had individually deleted.
       */
      expect(row.dismissed_ids).toEqual(['aabbccddeeff']);
    }));

  it('leaves deleted_at unset when the memory redaction fails', () =>
    withRollback(async (tx) => {
      /*
       * THE BOUNDARY TEST, for the new statement. `redactUserMemory` runs AFTER
       * the revocation and the flag redaction and BEFORE `deleted_at`, so a
       * failure here must unwind all three. Without this, "same transaction" is
       * a claim in a comment.
       */
      const userId = await seedUserWithFlag(tx);

      await tx.execute(sql`
        create function pg_temp.boom_mem() returns trigger language plpgsql as
          $$ begin raise exception 'boom'; end $$`);
      await tx.execute(sql`
        create trigger t_boom_mem before update on user_memory
          for each row execute function pg_temp.boom_mem()`);

      await expect(deleteAccount(tx, userId)).rejects.toThrow();

      await tx.execute(sql`drop trigger t_boom_mem on user_memory`);

      const rows = await tx.execute(sql`select deleted_at from users where id = ${userId}`);
      expect(rows[0].deleted_at).toBeNull();

      /*
       * Both EARLIER statements rolled back too, which is the assertion that
       * proves the whole thing unwound rather than that the failing statement
       * simply came last.
       */
      const flags = await tx.execute(
        sql`select question from moderation_flags where user_id = ${userId}`,
      );
      expect(flags[0].question).not.toBeNull();
      const links = await tx.execute(
        sql`select revoked_at from share_links where user_id = ${userId}`,
      );
      expect(links[0].revoked_at).toBeNull();
    }));

  it('does not touch another account memory', () =>
    withRollback(async (tx) => {
      const mine = await seedUserWithFlag(tx);
      const theirs = await seedUserWithFlag(tx);

      await deleteAccount(tx, mine);

      expect((await memoryOf(tx, theirs)).items).toHaveLength(1);
    }));
});
```

**Change (c):** one assertion added to the existing source-order test at `:177`, inside the same
`it`, after the `redact < flag` line.

**Code (replace the body of that `it`):**

```ts
  it('calls revokeAllForUser and redactForUser inside the transaction, before the flag', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/account/delete.ts', 'utf8');

    const open = src.indexOf('.transaction(');
    expect(open).toBeGreaterThan(-1);

    const body = src.slice(open);
    const revoke = body.indexOf('revokeAllForUser(');
    const redact = body.indexOf('redactForUser(');
    const memory = body.indexOf('redactUserMemory(');
    const flag = body.indexOf('deletedAt:');

    expect(revoke).toBeGreaterThan(-1);
    expect(redact).toBeGreaterThan(-1);
    expect(memory).toBeGreaterThan(-1);
    expect(flag).toBeGreaterThan(-1);

    // Reconciliation §5.6's order, plus R2's: revoke -> redact -> memory -> flag.
    // Every statement that actually removes something comes before the flag, so a
    // failure in any of them aborts rather than marking an account deleted with
    // its contents intact.
    expect(revoke).toBeLessThan(redact);
    expect(redact).toBeLessThan(memory);
    expect(memory).toBeLessThan(flag);
  });
```

**Note:** the existing `clearFreeTextAnswers` absence test at `:198` and the chat-regex test at
`:303` both still pass unchanged — `redactUserMemory` matches neither pattern. The
`clearFreeTextAnswers` test strips comments first, which matters because `delete.ts`'s new header
mentions it by name twice.

**Impact:** `npm run test:integration` grows by three cases.

---

### Step 10: `CLAUDE.md` — the count, corrected

**File:** `CLAUDE.md:1774`

**Change:** Twenty-two becomes twenty-three and the new table is named. **This is a correction of a
count, not a new rule**, so the net-neutral obligation does not bite — but the edit is written to
come out shorter than what it replaces anyway, by dropping the seven-word aside *", per the sweep
route's rule"*, which argues where the sentence after it already binds.

**Code — replace:**

```
acquire the singleton by accident. `schema.ts` has **ONE OWNER: W1** and holds **twenty-two
tables** — ten at W1, then `translations`, `share_links`, `personas`, `admin_access_log`,
`llm_calls`, `blog_posts`, `blog_post_locales`, `admin_insights`, v0.7.0's three chat tables and
`auth_handoffs`. **The count said "thirteen" for three releases and was corrected on 2026-08-09
rather than appended to**, per the sweep route's rule: a header that miscounts its own body is how
the next person concludes the file is untrustworthy.
```

**with:**

```
acquire the singleton by accident. `schema.ts` has **ONE OWNER: W1** and holds **twenty-three
tables** — ten at W1, then `translations`, `share_links`, `personas`, `admin_access_log`,
`llm_calls`, `blog_posts`, `blog_post_locales`, `admin_insights`, v0.7.0's three chat tables,
`auth_handoffs` and R2's `user_memory`. **The count said "thirteen" for three releases and was
corrected on 2026-08-09 rather than appended to**: a header that miscounts its own body is how
the next person concludes the file is untrustworthy.
```

Then confirm the file is still under budget:

```sh
wc -c CLAUDE.md    # must stay well under 150000
```

**Impact:** None at runtime. **`user_memory`'s own rules do NOT go in `CLAUDE.md` in this phase** —
the feature is not built yet, and a rule about a table nothing reads is prose that argues rather
than binds. Whoever finishes R2 adds it, net-neutrally, in the release's own commit.

---

### Step 11: Record the amendment

**File:** `docs/workstream-notes.md` — append at the end (currently `:12873`)

**Change:** Invariant 11 of the plan index: *copy that reverses a documented ruling records the
reversal.* `delete.ts`'s foreign-key asymmetry is a documented ruling and this phase amends it.

**Code:**

```markdown
## `user_memory`, and the third category in `delete.ts`'s asymmetry (2026-08-30, R2)

`src/lib/account/delete.ts`'s header has stated one rule since V8: *"the asymmetry with
`moderation_flags` IS the asymmetry in the foreign keys: `set null` outlives the account,
`cascade` does not."* It decided two cases correctly and was quoted a third time by
`F1-D10` to keep the whole group chat out of the erasure transaction. R2's `user_memory`
is the first case it decides **wrongly**, and the amendment is recorded here rather than
performed quietly in a header nobody diffs.

**The foreign key answers "does it survive". It does not answer "is this the thing they
meant."** Every cascading table this rule has been applied to holds either text the
querent typed — `chat_messages.body`, `readings.question`,
`onboarding_answers.answer_text` — or prose about a *reading*. `user_memory.items` is a
model's inferences **about a person**, assembled from a conversation they were having for
another reason, stored so a reader can use it on them later. It is the only row in this
database of which that is true, and it is precisely what somebody means when they press
*delete my account*. Thirty more days of it is `moderation_flags`' risk wearing a
different foreign key.

**What actually decides the case is a third category the header now names:
DERIVED-AND-REGENERABLE.** `clearFreeTextAnswers()` is absent from that transaction
because `onboarding_answers` is the *only copy* of text a person typed, and clearing it
would break the thirty-day restore the confirmation copy promises. `user_memory` has no
such property: every input is `chat_messages` and `readings`, both of which cascade and
therefore **survive** the soft delete, and the extractor is idempotent — so a querent who
signs back in on day 29 has the room's memory rebuilt on the next run. **Clearing it costs
the restore nothing, which is what makes it cheap enough to do at all.** That is the test
to apply to the next table somebody wants to add here, not the foreign key.

**It is a REDACTION and not a DELETE, and `dismissed_ids` is what makes that necessary.**
Emptying the row leaves the tombstones — opaque twelve-character hashes of items the
querent individually deleted, carrying no text and able only to *prevent* a write.
Dropping the row would take them too, so an erase-then-restore on day three would
resurrect exactly the facts the querent had deleted one at a time. `input_hash` is blanked
in the same statement and `''` is a reserved never-matches value: an emptied list beside a
matching hash means the extractor reports `unchanged` and never writes again — the feature
dead after any erasure, with nothing logged.

**It does not license adding `personas`.** `personas.body` is also model-written prose
about the person and it stays out of that transaction: it is distilled from a rite the
querent walked through, it is shown *to* them on `/account` as the product, and it is not
assembled from a conversation they were having for another reason. Somebody will notice
the resemblance and want symmetry; changing it is a ruling, not a tidy-up.

**Where it is enforced:** `redactUserMemory` in `src/lib/db/queries/memory.ts`, called from
`deleteAccount`'s transaction between `redactForUser` and the flag.
`delete.integration.test.ts` proves the same-transaction property with a trigger and pins
the statement ORDER on the source, so a refactor into three awaited helpers fails there
and is sent here.
```

**Impact:** Documentation only.

---

## Verification

**Build:**

```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
npm run build            # DO NOT SKIP -- a green typecheck is not evidence (the TypeScript trap)
```

**Tests — the two projects run SEPARATELY, never `test:all`:**

```sh
npm run db:up
npm run db:migrate       # twice; the second must be a no-op
npm run db:test:reset
npm test                 # unit. 3681 in 193 files + this phase's one new file
npm run test:integration # 659 in 46 + this phase's one new file and three new cases
```

Targeted, while iterating:

```sh
npm test -- contract                    # queries/contract.test.ts, clientBoundary.test.ts
npm test -- memory/profile
npm run test:integration -- memory
npm run test:integration -- delete
```

**Manual check:**

```sh
npm run db:studio        # DIRECT connection, never `-pooler`
```

Read one `user_memory` row by eye: `items` is a JSON array, `dismissed_ids` is `[]`,
`created_at` and `updated_at` are timestamptz, `input_hash` is not empty.

```sql
-- the audit query: no row may outlive its user
select count(*) from user_memory m left join users u on u.id = m.user_id where u.id is null;
-- must be 0
```

**Exit criteria:**

1. `npm run db:migrate` applies `0017` cleanly and a second run is a no-op.
2. `schema.ts` holds twenty-three tables and `CLAUDE.md:1774` says twenty-three.
3. `queries/contract.test.ts` is green with **no new entry** in `TRANSITIVE_EXCEPTIONS`.
4. `clientBoundary.test.ts` is green — nothing new reaches `@/lib/db/` from a client file.
5. The integration suite proves: the upsert moves `updated_at` by hand and leaves `created_at`;
   the upsert never touches `dismissed_ids`; a dismissal removes the item *and* tombstones its id
   in one statement; `redactUserMemory` empties `items`, blanks `input_hash` and **keeps** the
   tombstones; a soft delete does all of that inside the transaction that sets `deleted_at`; a
   failure in it leaves `deleted_at` null **and** unwinds the revocation and the flag redaction;
   a hard delete cascades the row away.
6. `npm run build` passes.

---

## Handoffs

**To phase 4 — required, not optional:**

- **`input_hash = ''` MUST BE TREATED AS "NEVER MATCHES"** by the staleness check. An
  erased-then-restored account has an empty `items` beside a blank hash and will never refill
  otherwise. This is the one contract from this phase that fails silently if ignored.
- **`UserMemoryItem.id` is `sha256(kind + '\u001f' + normalize(text))` hex-truncated to 12
  characters**, `normalize` = lowercase + whitespace collapse + trailing-punctuation strip. Not a
  suggestion: `dismissed_ids` is an exact-match tombstone list and phase 7's `material_key` is
  `profile:<id>`. A random id makes both inert.
- **The extractor must filter its output against `dismissed_ids` before writing.** The tombstone
  is inert unless the writer consults it, and `queries/memory.ts` deliberately does not — a query
  module reads and writes and does not decide.
- **Truncate to `USER_MEMORY_MAX_ITEMS` in code.** There is no `CHECK` on the length, on purpose:
  a generator that must never throw meeting a constraint that does is a row that silently fails
  to exist.
- **`USER_MEMORY_SOURCE_VERSION` is the caller's to pass**, from
  `@/lib/memory/profile/types`. Do not import it into `queries/memory.ts` — that is the defect
  `queries/lotus.ts` is excluded by name for.
- **Add `lib/memory/profile/` to `scripts/audit-secrets.ts`'s `FORBIDDEN` with `types.ts` as the
  named exception**, in the commit that adds `prompt.ts`. The `lib/moderation/` shape. Not done
  here because the fence goes up with the wall.
- The 14th `LLMOp`, `flags.ts`, `DEFERRABLE_FLAGS`, `admin/ops.ts`, `rollup.ts`'s `OP_ORDER`,
  `callClass.test.ts` and `flagCoverage.test.ts` are all untouched by this phase.

**To phase 5:**

- Render `item.text` **only**. No id, no kind, no `lastSeen`. Invariant 4 (`C-D8`) is what makes
  that a rule rather than a preference, and a date in the block is the material that produces
  *"you told me on the 9th"*. Owe a `prompt.test.ts` assertion that no `YYYY-MM-DD` reaches
  `<ingatan>`.
- Filter through `isUserMemoryItem` from `@/lib/memory/profile/types` before rendering. `$type<>`
  is an assertion the driver is not obliged to honour and this column is written from model output.
- The read goes in `assembleChatContext`'s `Promise.all` with its own `.catch()`, like the other
  six. `getUserMemory` returning `null` is the ordinary case, not a failure.

**To phase 6:**

- **Per-item deletion is addressable by `item.id` and the primitive already exists**:
  `dismissUserMemoryItems(db, userId, ids)` in `src/lib/db/queries/memory.ts`. It returns the row
  as it now stands, so the route needs no second read. Phase 6 owns the route, the UI, the
  `private, no-store` header and both locale catalogs; it should not add a second module that
  writes these two columns.
- **`redactUserMemory` is the "delete everything" primitive** if `/account` offers one.
- **There is no `locale` column**, so an English-UI querent may read an Indonesian memory line.
  That is the documented consequence of `C-D9`, not a bug, and the fix if it ever matters is a
  translation and never a regeneration.
- `/privacy` must name the table and say a **model** wrote the sentences. This phase writes no
  copy.
- `DeleteOutcome.memoryRedacted` exists and is **deliberately not wired into `account.deleted`** —
  `events.ts` is a closed taxonomy with one owner per release, and folding a declaration in means
  transcribing it. If R2 wants the prop, that is a conversation with whoever owns `events.ts`.

**To phase 7:**

- `material_key` of the form `profile:<item id>` rehydrates by reading `user_memory` and matching
  `items[].id`. The id is stable while the item's text is unchanged, which is what makes
  `chat_runs_user_material_uq` do its job, and it self-expires when the fact is reworded.
- The `BAHAN:` line may carry `kind` (a closed token) and the id (a scalar). **The text is
  rehydrated at plan time and never travels in the key.**

**Found and deliberately not done:**

- **`resetDb()`'s TRUNCATE list is missing `admin_insights` (`0013`) and `auth_handoffs`
  (`0015`).** Pre-existing, from before this workstream; named in that function's header by this
  phase so the question is answerable, and not fixed by a phase that owns neither table.
- `queries/contract.test.ts`'s `TRANSITIVE_EXCEPTIONS` still carries `queries/lotus.ts`, recorded
  there as a defect belonging to W3. Untouched.
- `src/app/api/account/route.ts` is not edited. Its response body and its analytics props are
  both named explicitly, so the new `DeleteOutcome` field reaches neither.

---

## Rollback

**Code:** `git revert` the phase's commit. Nothing in the tree reads `user_memory` after the
revert — `deleteAccount` loses one statement and `queries/memory.ts`, the type leaf and both new
test files disappear.

**Database:** the migration is **additive and stays applied**, which is the safe direction: an
unread table costs nothing, and a `DROP TABLE` migration would be a destructive migration
deploying ahead of the code that tolerates it — the second thing `scripts/db-migrate-deploy.ts`
explicitly does not fix. If the table must genuinely go, it is a **new** migration (`0018`), never
an edit to `0017` (README rule 5), and it is only safe once every branch that references
`userMemory` is merged or dead.

**Partial:** removing just the erasure line is not a rollback, it is a privacy regression. If
`redactUserMemory` ever has to be taken out of that transaction, the row must go instead —
because a table with no erasure path is the thing this phase was ordered to prevent.
