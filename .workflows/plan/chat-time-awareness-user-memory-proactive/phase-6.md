# Phase 6: The querent can read it, edit it and delete it

**Plan set:** `CHAT_TIME_AWARENESS_USER_MEMORY_PROACTIVE_PLAN.md`
**Analysis:** `20260830-085616-B4K2_code_analyzer.md`
**Satisfies:** R2 — *a persisted, model-written profile memory of the querent* — this phase owns
the half of R2 the querent can see, read and destroy.
**Depends on:** Phase 3 (the `user_memory` table and `src/lib/db/queries/memory.ts`), Phase 4 (the
extractor that puts rows in it)
**Difficulty:** NORMAL
**Package:** `src/app/account`, `src/app/api/account/memory`, `src/app/privacy`, `src/lib/i18n`

---

## Reconciliation (round 1 — BINDING, overrides the body where they disagree)

**Phase 3's payload shape is settled, so this phase's "design for both shapes" hedge is spent.**
The blob arm is dead: `user_memory.items` is a `jsonb` array of `UserMemoryItem`
(`{ id, kind, text, lastSeen }`), and `user_memory.dismissed_ids` is a second `jsonb` column of
item ids. Five rulings:

1. **`memoryView.ts` keeps its structural read and DROPS the blob arm.** `WHOLE_MEMORY_ID` and the
   `{ body?: unknown }` branch are cancelled — there is no blob and there never will be, and a
   dead branch in an adapter is a branch somebody later "fixes" into existence. The structural
   read (accepting `{ items?: unknown }` and narrowing each element rather than importing a
   type) **stays**, for its stated reason: jsonb is not validated by postgres and these rows are
   written from model output. Use phase 3's `isUserMemoryItem` as the narrower — it is a
   zero-import leaf, so a client component may hold it.
2. **`isMemoryItemId()` matches phase 3's `USER_MEMORY_ITEM_ID_RE` — twelve lowercase hex.**
3. **THE THREE FUNCTIONS THIS PHASE ASKED FOR DO NOT EXIST. Call phase 3's:**
   - list → `getUserMemory(db, userId)` → `UserMemory | null` (null is normal)
   - **forget one** → `dismissUserMemoryItems(db, userId, [itemId])` → the row as it now stands,
     or `null`. It returns the new state, so the route renders it without a second read; "did
     anything change" is `before.items.length !== after.items.length`, not a boolean from the
     query.
   - **forget everything** → `dismissUserMemoryItems(db, userId, <every current item id>)` —
     **NOT `redactUserMemory`.** This is the one ruling worth reading twice: `redactUserMemory`
     empties `items` and does **not** tombstone, because on the *erasure* path a restored account
     is meant to have its memory rebuilt. On *this* path nothing is being erased and the
     transcript that produced every fact is still in `chat_messages`, so a non-tombstoning "forget
     everything" is a button that lies until the next extraction — `lotus_avatars.input_hash`'s
     rule, one release later. Two buttons, two verbs, one mechanism, and **no new query.**
   Neither call changes `input_hash`, which is what stops the deletion triggering an immediate
   regeneration (phase 4, Decision B).
4. **THE ID IS STABLE AND THAT IS NOW A GUARANTEE, NOT A REQUEST.** Phase 3's contract is
   ``id = sha256(kind + '\u001f' + normalise(text))`` truncated to twelve hex, and phase 4
   implements exactly that. Phase 4's original *"NOT stable across regenerations"* comment is
   cancelled. **The known gap, stated on the surface this phase owns:** a re-derivation that
   rewords the fact past `normalise`, or refiles it under a different `kind`, hashes differently
   and can come back. **The copy must not promise permanence** — say the reader will stop using
   it, not that it can never be learned again.
5. **`clientBoundary.test.ts` is written by phases 4, 6 and 7 in that order**, one `it()` each.
   Phase 4 fences `@/lib/memory/profile/**` with `/types` as the named exception — so this phase's
   client component may import `isUserMemoryItem` from that leaf and nothing else from that tree.

**Unchanged and confirmed:** Step 0's ruling (no edit control ships; correction is deletion), the
zero event names, and the `2-8` SubClause in both locales.

---

## Goal

After this phase, a querent can open `/account`, tap once, and read every sentence a language model
has written about them out of the group chat — and delete any of them, or all of them, in one tap
each. `/privacy` names the table, says a **model** wrote it, says it is built from what they type in
the room, and says it can be wrong. The `chat.first_open.notice` — the sentence a person actually
reads, standing in the room — says the readers keep notes, which is `C-D8`'s load-bearing half
repeated for a second disclosure.

**Nothing in this phase writes prose into the memory.** Read and erase only; the argument is in
Step 0.

---

## Step 0 — the one product decision, made in writing

**THE PHASE TITLE SAYS "EDIT" AND NO EDIT CONTROL SHIPS. THAT IS A DECISION, NOT AN OMISSION, AND
IT IS RECORDED HERE BECAUSE THE NEXT SESSION WILL READ THE TITLE FIRST.**

V8's L13 was reversed — *"the six are deletable and NOT editable"* died on Miftah's ruling, because
a querent must be able to see what they said and fix it. The reversal does **not** transfer here,
and the difference is authorship:

- The six onboarding answers are **text the querent wrote.** Editing one is correcting your own
  sentence.
- A `user_memory` item is **a sentence a model wrote about a person.** Editing one is not
  correcting your own words; it is dictating what three readers believe about you, in prose that
  goes straight into a model prompt.

Three consequences fall out, and each is a whole other workstream:

1. **An edited item is untrusted text on a prompt path**, so it needs W7's gate (`moderate()`), the
   `stripUntrusted` fence, and a length cap — the `chat_messages` treatment, not the
   `onboarding_answers` treatment.
2. **The extractor would have to learn a `source: 'model' | 'user'` flag** or it overwrites the
   querent's sentence on the next run. That flag lives in Phase 3's payload and Phase 4's staleness
   resolver, neither of which is mine.
3. **The erasure and disclosure DUTY is fully discharged by read + delete.** The user did not ask
   for this surface at all; it follows from storing model-written inferences about a person. The
   smallest honest version is: *you can see it, and you can destroy it.*

So: **correction here is deletion.** If Miftah wants authorship, it is a follow-up that opens with
`moderate()` and a `source` column — see **Handoffs**.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts.

**Creates:**
- `src/lib/account/memoryView.ts` — `MemoryItemView`, `MemoryRowLike`, `memoryItems()`,
  `isMemoryItemId()`. **No `WHOLE_MEMORY_ID`** — the blob arm is cancelled. **PURE**: no `server-only`, no `process.env`, no
  `@/lib/db/**` import, so a client component may hold the shape.
- `src/lib/account/memoryView.test.ts`
- `src/app/api/account/memory/route.ts` — `GET` (the list) and `DELETE` (forget everything)
- `src/app/api/account/memory/[item]/route.ts` — `DELETE` (forget one)
- `src/app/api/account/memory/route.test.ts` — source-level contract test
- `src/components/AccountMemory.tsx` — `'use client'`
- `src/components/AccountMemory.module.css`
- Message keys, both catalogs: `account.memory.{heading,hint,reveal,loading,empty,failed,itemAria,
  remove,removing,forgetAll,forgetAllConfirm}` (11 keys × 2)
- `/privacy` SubClause anchor **`2-8`**, in **both** locales (`legal.test.ts` asserts anchor-set
  equality — an anchor added to one document only turns that test red)

**Renames:** none
**Deletes:** none

**Signature changes:** none. `src/app/account/page.tsx` gains one `<section>`; it reads nothing new
on the server.

**Amends (copy, in place, with the old text kept in the comment):**
- `chat.first_open.notice`, both catalogs — it currently enumerates what the readers see (answers,
  readings, the chat) and must now say they also keep notes.
- `/privacy` clause 3's list (one item), clause 6's list (one item), clause 7's list (one item),
  clause 8's first paragraph (one clause), both locales.

**Requires (from earlier phases) — READ THIS BEFORE IMPLEMENTING:**

From **Phase 3**, `src/lib/db/queries/memory.ts`, handle-first (**RECONCILED — these are the real
names; `forgetUserMemoryItem` and `clearUserMemory` do not exist**):

| Function | Signature | Semantics |
|---|---|---|
| `getUserMemory` | `(db: DbOrTx, userId: string) => Promise<UserMemory \| null>` | null is normal — nobody has a row until the extractor first runs |
| `dismissUserMemoryItems` | `(db: DbOrTx, userId: string, ids: string[]) => Promise<UserMemory \| null>` | one statement: filters `items` **and** appends to `dismissed_ids`, so the deletion survives the next extraction. Returns the row as it now stands. Malformed ids are dropped, not refused. Does not touch `input_hash`. |

**Forget one** passes `[itemId]`; **forget everything** passes every current item id. There is no
second query and `redactUserMemory` is not called from this surface — see the reconciliation block.

`UserMemory.items` is `UserMemoryItem[]`; `memoryView.ts` still reads it structurally and narrows
each element, because a jsonb column holds whatever was written into it.

From **Phase 4**: nothing at implementation time. Phase 4 must *consume* the tombstone signal this
phase's deletion emits — see **Handoffs**.

**Leaves alone (owned by others):**
- `src/lib/db/schema.ts`, migration `0017`, `src/lib/db/queries/memory.ts`, `src/lib/account/delete.ts` (Phase 3)
- `src/lib/llm/**`, `src/lib/memory/profile/**`, `src/lib/admin/ops.ts` (Phase 4)
- `src/lib/chat/**` in its entirety, including `prompt/build.ts` (Phases 2, 5, 7, 8, 9)
- `src/lib/analytics/events.ts` — **this phase declares zero event names**, see Step 6

---

## The payload-shape assumption, and how it is neutralised

Phase 3 decides whether the payload is **a list of addressable items** or **one prose blob**. The
plan index tells me to design for both, and this is how:

**RECONCILED: PHASE 3 CHOSE THE ITEM LIST, SO THE BLOB ARM IS CANCELLED.** `WHOLE_MEMORY_ID` and
the `{ body?: unknown }` branch are not written — a dead branch in an adapter is a branch somebody
later restores by "fixing" it.

What survives, and is worth more now than the hedge was: `memoryView.ts` still reads the row
**structurally, not by imported table type.** It accepts `{ items?: unknown }`, narrows each
element (phase 3's `isUserMemoryItem`, a zero-import leaf a client component may hold) and returns
one `MemoryItemView` per surviving item, keyed by the item's own `id`. **`$type<>` is an assertion
the driver is not obliged to honour** and these rows are written from model output, so the
narrowing is load-bearing rather than defensive.

**THE ITEM ID IS DERIVED FROM THE ITEM'S CONTENT, NOT MINTED RANDOMLY — GRANTED.** Phase 3's
contract, phase 4's implementation. A deletion has to survive the next extraction run, and the only
way a tombstone can recognise a re-extracted fact is if the same fact hashes to the same id.

**THE TOMBSTONE STORES A HASH, NEVER THE SENTENCE — GRANTED, as `user_memory.dismissed_ids`.**
A list of ids is an erasure; a list of texts would be the deleted sentence still sitting in the
row, which is the opposite of what the button says it does.

---

## Files

| File | Action | What changes |
|---|---|---|
| `src/lib/account/memoryView.ts` | create | the pure adapter and the id narrowing. **No blob arm, no `WHOLE_MEMORY_ID`** |
| `src/lib/account/memoryView.test.ts` | create | the item shape and every refusal (a malformed item, a bad id, an absent row) |
| `src/app/api/account/memory/route.ts` | create | `GET` list, `DELETE` all |
| `src/app/api/account/memory/[item]/route.ts` | create | `DELETE` one |
| `src/app/api/account/memory/route.test.ts` | create | source-level contract, `route.test.ts`'s register |
| `src/components/AccountMemory.tsx` | create | the reveal, the rows, the two erasures |
| `src/components/AccountMemory.module.css` | create | tokens only, no new hex |
| `src/app/account/page.tsx` | modify | one import (`:35`) + one `<section>` after the answers block (`:298`) |
| `src/lib/i18n/locales/id.ts` | modify | 11 keys after `account.answers.note` (`:1183`); amend `chat.first_open.notice` (`:643`) |
| `src/lib/i18n/locales/en.ts` | modify | the same 11 keys after `account.answers.note` (`:648`); amend `chat.first_open.notice` (`:353`) |
| `src/app/privacy/privacy.id.tsx` | modify | new SubClause `2-8` after `:236`; clause 3 list `:243`; clause 6 list `:489`; clause 7 list `:522`; clause 8 `:534` |
| `src/app/privacy/privacy.en.tsx` | modify | the same five edits (`:207`, `:215`, `:429`, `:452`, `:463`) |
| `src/app/legal.test.ts` | modify | one `describe` block after the admin amendment (`:392`) |
| `src/lib/clientBoundary.test.ts` | modify | two tests: fence `@/lib/account/delete`, keep `memoryView` earned |

---

## Implementation Steps

### Step 1: The pure adapter

**File:** `src/lib/account/memoryView.ts` (new)
**Change:** One module that turns Phase 3's row — whatever shape it took — into a list a browser
can render, and narrows an id arriving from a URL path.

**Why it is its own file and not in the component:** `clientBoundary.test.ts` forbids a client
component importing `@/lib/db/**`, so the browser cannot name Phase 3's row type. `grace.ts` is the
precedent one directory over — a value that both a server route and a client component need, moved
out of the query layer for exactly this reason. `persona/lines.ts` is the other: the one
client-importable module in a server-only directory, held honest by a test that asserts what it
does *not* contain.

**Code:**

```ts
/**
 * What the querent sees on `/account` when they ask what the room has noted about
 * them, and the narrowing the delete route applies to an id off a URL path.
 *
 * **PURE, AND CLIENT-IMPORTABLE ON PURPOSE.** No `server-only`, no `process.env`,
 * no `@/lib/db/**` — `clientBoundary.test.ts` forbids the last of those in a client
 * component, so without this module the browser could not name the shape it
 * renders. `@/lib/account/grace.ts` moved out of `queries/profile.ts` for the same
 * constraint from the same side, and `@/lib/persona/lines.ts` is the other
 * precedent: one client-importable module beside server-only ones, kept honest by a
 * test asserting what it does not contain rather than by its filename.
 *
 * ── IT READS THE ROW STRUCTURALLY, AND THAT IS THE WHOLE DESIGN ──────────────
 *
 * Phase 3 owns `user_memory` and its payload is a LIST OF ADDRESSABLE ITEMS —
 * `user_memory.items`, one `UserMemoryItem` per remembered fact, each with a stable
 * content-derived `id`. One view row per item, keyed by that id.
 *
 * **THE READ IS STILL STRUCTURAL, AND THAT IS NOW LOAD-BEARING RATHER THAN A HEDGE.**
 * `$type<>` is an assertion the driver is not obliged to honour (`answersUpdatedAt`'s
 * lesson), and these rows are written from MODEL OUTPUT, so a row written before a
 * value set changed can hold anything. Narrowing per item is the only honest read.
 *
 * **DO NOT "TIDY" THIS INTO AN IMPORT OF `UserMemory` FROM `@/lib/db/schema`.**
 * That import is what the client fence forbids — its regex does not know the `type`
 * keyword — which is why phase 3's shape lives in a zero-import leaf at
 * `@/lib/memory/profile/types` and why `isUserMemoryItem` may be imported here.
 *
 * ── EVERY CEILING HERE IS A DISPLAY CEILING, NEVER A VALIDATION ONE ──────────
 *
 * The row was written by our own extractor, so this is not a trust boundary; it is
 * a rendering boundary. A payload that somehow held four hundred items would make
 * `/account` unusable and the fetch large, so the list is capped and each line is
 * clipped. Both are silent, because a person cannot act on "the machine wrote too
 * much about you" and the honest control — delete it — is right there.
 */

/* RECONCILED: `WHOLE_MEMORY_ID` and the prose-blob arm are cancelled — phase 3 chose the
 * item list, and a dead branch in an adapter is a branch somebody later "fixes" into
 * existence. */

/** One line on screen, and the id that deletes it. */
export type MemoryItemView = { id: string; text: string };

/**
 * What `getUserMemory` is expected to return, named STRUCTURALLY.
 *
 * Both fields are optional and both are `unknown`: this module is handed a row it
 * did not define, and narrowing is its job rather than the caller's.
 */
export type MemoryRowLike = { items?: unknown };

/**
 * `/account` is a phone screen and the payload is model output. Sixty lines is far
 * past anything the extractor should produce and still renders; four hundred
 * characters is roughly three lines at `--fs-hint`.
 */
const MAX_ITEMS = 60;
const MAX_TEXT = 400;

/**
 * Twelve lowercase hex characters — phase 3's `USER_MEMORY_ITEM_ID_RE`, duplicated here
 * rather than imported so this module keeps its zero-dependency reach into a client
 * component, and because a narrower guard here refuses a delete, which is visible.
 * **WORD-BOUNDED AND LOWERCASE**, because this is
 * also what the DELETE route narrows a path segment with: an id it did not
 * recognise must never reach a query, which is `isOnboardingQuestionKey`'s rule on
 * `/api/onboarding/answer/[key]` — an unknown key that reaches the delete matches
 * nothing and returns a cheerful 404, which reads as "already deleted" and hides a
 * client bug.
 */
export function isMemoryItemId(value: string): boolean {
  return /^[0-9a-f]{12}$/.test(value);
}

/** One item of a list payload, or null if it is not one. */
function asItem(raw: unknown): MemoryItemView | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === 'string' ? rec.id : '';
  const text = typeof rec.text === 'string' ? rec.text.trim() : '';
  if (id.length === 0 || !isMemoryItemId(id) || text.length === 0) return null;
  return { id, text: text.slice(0, MAX_TEXT) };
}

/**
 * Every line the room has noted, in the order Phase 3 stored them.
 *
 * **NOT SORTED, NOT DEDUPED, NOT REWRITTEN.** The querent is being shown what is in
 * the row; anything this function improved would be a discrepancy between what they
 * read and what they can delete, on the one screen where those two must be the same
 * thing.
 */
export function memoryItems(row: MemoryRowLike | null | undefined): MemoryItemView[] {
  if (!row || !Array.isArray(row.items)) return [];
  const out: MemoryItemView[] = [];
  for (const raw of row.items) {
    const item = asItem(raw);
    if (item) out.push(item);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
```

**Impact:** Nothing imports it yet. It is the seam every later step in this phase uses.

---

### Step 2: The adapter's unit tests

**File:** `src/lib/account/memoryView.test.ts` (new)
**Change:** Pin both payload shapes and every refusal. `npm test`, no database.

**Code:**

```ts
import { describe, expect, it } from 'vitest';

import {
  isMemoryItemId,
  memoryItems,
  type MemoryRowLike,
} from './memoryView';

/**
 * The adapter is the only thing standing between Phase 3's payload decision and
 * every string of copy in this phase, so the two shapes are tested as PEERS rather
 * than one being the happy path.
 */
describe('memoryItems', () => {
  it('returns nothing for no row', () => {
    expect(memoryItems(null)).toEqual([]);
    expect(memoryItems(undefined)).toEqual([]);
    expect(memoryItems({})).toEqual([]);
  });

  it('reads a LIST payload item by item, in stored order', () => {
    const row: MemoryRowLike = {
      items: [
        { id: 'a'.repeat(12), text: 'Lari pagi, idealnya jam lima.' },
        { id: 'b'.repeat(12), text: 'Suka menyendiri.' },
      ],
    };
    expect(memoryItems(row)).toEqual([
      { id: 'a'.repeat(12), text: 'Lari pagi, idealnya jam lima.' },
      { id: 'b'.repeat(12), text: 'Suka menyendiri.' },
    ]);
  });

  it('answers empty when there is no items array at all', () => {
    /*
     * RECONCILED: the two cases here used to be the prose-blob arm and a
     * both-shapes-present tie-break. Phase 3 chose the item list and the blob arm is
     * cancelled, so what is left to assert is that anything which is NOT a list reads as
     * nothing rather than as one mysterious line.
     */
    expect(memoryItems({} as MemoryRowLike)).toEqual([]);
    expect(memoryItems({ items: 'nope' } as unknown as MemoryRowLike)).toEqual([]);
    expect(memoryItems(null)).toEqual([]);
    expect(memoryItems(undefined)).toEqual([]);
  });

  it('drops a malformed item rather than the whole list', () => {
    /*
     * One bad row must not blank the screen: the querent came here to delete
     * something, and an empty list would tell them there is nothing to delete
     * while the prompt still reads the rest.
     */
    const row: MemoryRowLike = {
      items: [null, 42, { id: 'c'.repeat(12), text: 'nyata' }, { id: 'd'.repeat(12), text: '   ' }, { text: 'no id' }],
    };
    expect(memoryItems(row)).toEqual([{ id: 'c'.repeat(12), text: 'nyata' }]);
  });

  it('caps the list and clips each line', () => {
    const many = Array.from({ length: 90 }, (_, i) => ({ id: `i${i}`, text: 'x' }));
    expect(memoryItems({ items: many })).toHaveLength(60);
    const long = 'y'.repeat(900);
    expect(memoryItems({ items: [{ id: 'i', text: long }] })[0].text).toHaveLength(400);
  });

  it('drops an item whose id would not survive the URL narrowing', () => {
    // The id round-trips through a path segment on the delete route, so an id this
    // module renders and that route refuses would be a delete button that 400s.
    const row: MemoryRowLike = { items: [{ id: '../../etc', text: 'nope' }] };
    expect(memoryItems(row)).toEqual([]);
  });
});

describe('isMemoryItemId', () => {
  /**
   * **PHASE 3's `USER_MEMORY_ITEM_ID_RE`, DUPLICATED RATHER THAN IMPORTED**, and the
   * duplication is safe in exactly one direction: a narrower guard here refuses a delete,
   * which the querent sees, while a wider one would let an unrecognised segment reach a
   * query. `isOnboardingQuestionKey`'s rule on `/api/onboarding/answer/[key]`.
   */
  it('admits a content-derived item id: twelve lowercase hex', () => {
    for (const ok of ['a'.repeat(12), '0123456789ab', 'deadbeefcafe']) {
      expect({ ok, admitted: isMemoryItemId(ok) }).toEqual({ ok, admitted: true });
    }
  });

  it('refuses everything else, including the cancelled reserved word', () => {
    for (const bad of [
      '',
      ' ',
      'whole',
      'A'.repeat(12),
      'a'.repeat(11),
      'a'.repeat(13),
      'ab-cd',
      'has space',
      '../x',
      'é'.repeat(12),
    ]) {
      expect({ bad, admitted: isMemoryItemId(bad) }).toEqual({ bad, admitted: false });
    }
  });
});
```

**Impact:** Green with no database — the adapter reads the row structurally and narrows per item.

---

### Step 3: The list-and-forget-everything route

**File:** `src/app/api/account/memory/route.ts` (new)
**Change:** `GET` returns every note, `private, no-store`; `DELETE` empties the row.

**The reveal is ONE request for the whole list, and that is NOT `worst_thing`'s rule being
relaxed.** `/api/onboarding/answer/<key>` is one key per request with no bulk variant, because
`/account` can render six *labelled* rows — the question titles — without decrypting anything, so
the label is a legitimate non-revealing handle and the text can wait for a tap. **A memory item has
no label. Its text IS its identity.** A per-item reveal here would render twelve rows saying
"Catatan 1 … Catatan 12", each needing a tap to become readable — theatre that costs the querent
twelve taps and protects nothing. What the `worst_thing` rule actually protects is *"the sensitive
text is not in the response to merely OPENING a page"*, and that property is kept exactly: the
server component reads nothing, the text is not in `/account`'s HTML, and the fetch fires only when
the querent presses the button.

**Code:**

```ts
/**
 * `GET /api/account/memory` — what the room has noted about the querent.
 * `DELETE /api/account/memory` — forget all of it.
 *
 *   GET     -> 200 { items: [{ id, text }] }   `private, no-store`
 *           -> 401 no session
 *           -> 403 onboarding not finished
 *           -> 429 rate limited
 *           -> 500 the read failed
 *   DELETE  -> 200 { ok: true }
 *           -> 404 there was nothing stored
 *           -> 401 / 403 / 429 / 500 as above
 *
 * ── WHY THE WHOLE LIST COMES BACK IN ONE REQUEST ─────────────────────────────
 *
 * **THIS IS NOT `/api/onboarding/answer/<key>`'s RULE BEING RELAXED. IT IS THE SAME
 * RULE APPLIED TO A PAYLOAD WITH NO LABELS.** That route is one key per request and
 * says there must never be a bulk variant, because `/account` can render six rows
 * labelled by QUESTION while decrypting nothing — so the plaintext of `worst_thing`
 * genuinely can wait for a tap on the row that names it.
 *
 * A memory item has no question above it. Its text is its identity. Twelve rows
 * reading "Catatan 1 … Catatan 12", each needing its own tap and its own request,
 * would cost the querent twelve taps and protect nothing at all.
 *
 * What the rule is FOR survives untouched, and it is the property to protect if
 * this route is ever changed: **the sensitive text is never in the response to
 * merely opening a page.** `/account` reads nothing here on the server, the notes
 * are absent from its HTML, and this handler runs only because somebody pressed
 * `Lihat catatannya`. That press is the asking, which is reconciliation §7.3's
 * standard and V8's *"a tap on a question is asking"* one surface over.
 *
 * ── NO ANALYTICS, DELIBERATELY ───────────────────────────────────────────────
 *
 * `withAnalytics`, `track()`, `x-jm-session` and `x-jm-local-date` are all absent,
 * and that is a decision recorded in this phase's plan rather than an omission:
 * this phase declares ZERO new event names. `events.test.ts`'s ceiling is at its
 * bound and the register's own guidance is to FOLD rather than add — and every
 * available fold here is the one that register has already refused twice
 * (`history.item_opened` gaining an `action`, `moderation.refused` aside). A
 * look-and-close changes no decision (`account.answer_revealed`'s precedent), and a
 * deletion is visible in the row itself. If an operator later needs the number, it
 * belongs beside Phase 4's extractor event, with the ceiling moved ONCE and the
 * accounting written down.
 */
import { NextResponse } from 'next/server';

import { memoryItems } from '@/lib/account/memoryView';
import { requireUser } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { dismissUserMemoryItems, getUserMemory } from '@/lib/db/queries/memory';
import { hit } from '@/lib/ratelimit';

/** Reads and writes the database. Never the edge. */
export const runtime = 'nodejs';

/**
 * One indexed read, or one small write. Milliseconds warm — and nothing like that
 * on a cold lambda in front of a suspended Neon compute, which is what killed
 * `POST /api/locale` at Vercel's Hobby default of ten seconds. The DELETE is a user
 * action that WRITES, which is one of the few requests likely to be the one that
 * wakes the compute.
 */
export const maxDuration = 20;

/**
 * Per user per hour, its own namespace. `hit()` prefixes `read:`, so the effective
 * key is `read:account:memory:<uid>` and a burst here cannot spend the budget that
 * lets somebody take a reading. Sixty is generous for a screen with one button on
 * it; it exists because this is reachable with a session, not because anybody reads
 * their notes sixty times an hour.
 */
const MEMORY_MAX = 60;
const HOUR_MS = 3_600_000;

type Gate =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * The two verbs' shared opening. `requireUser()`'s fail-closed default is KEPT —
 * unlike `/api/onboarding/*` and `DELETE /api/account`, there is nothing to read or
 * erase here before onboarding is finished, because the room does not open until
 * then.
 */
async function gate(): Promise<Gate> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, response: auth.response };

  // AWAITED. `hit()` is async since V9 and an un-awaited Promise is truthy, i.e.
  // never refuses.
  const limit = await hit(`account:memory:${auth.user.id}`, Date.now(), MEMORY_MAX, HOUR_MS);
  if (!limit.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'too many requests' },
        { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
      ),
    };
  }

  return { ok: true, userId: auth.user.id };
}

export async function GET() {
  const g = await gate();
  if (!g.ok) return g.response;

  let row;
  try {
    row = await getUserMemory(db, g.userId);
  } catch (err) {
    logFailure('read', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  }

  /*
   * A MISSING ROW IS AN EMPTY LIST AND A 200, NOT A 404. Nobody has a row until the
   * extractor first runs, so "nothing noted yet" is the ordinary resting state of
   * this feature and the component renders real copy for it. A 404 would put the
   * failure affordance on screen for a querent who has simply not talked yet.
   */
  return NextResponse.json(
    { items: memoryItems(row) },
    {
      /*
       * `private, no-store`. Per-user, and it is a machine's inferences about a
       * person: no shared cache, no disk, no history entry.
       */
      headers: { 'cache-control': 'private, no-store' },
    },
  );
}

export async function DELETE() {
  const g = await gate();
  if (!g.ok) return g.response;

  let cleared: boolean;
  try {
    /*
     * **FORGET EVERYTHING IS A TOMBSTONING DELETE, NOT `redactUserMemory`.** Every current
     * item id goes into `dismissed_ids` in the same statement that empties `items`, because
     * the transcript that produced every one of these facts is still in `chat_messages` and
     * a non-tombstoning clear is a button that lies until the next extraction
     * (`lotus_avatars.input_hash`'s rule). `redactUserMemory` is the ERASURE path's function
     * and deliberately does not tombstone — a restored account is meant to rebuild.
     */
    const before = await getUserMemory(db, g.userId);
    const ids = memoryItems(before).map((item) => item.id);
    const after = ids.length === 0 ? before : await dismissUserMemoryItems(db, g.userId, ids);
    cleared = ids.length > 0 && memoryItems(after).length === 0;
  } catch (err) {
    logFailure('clear', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  }

  if (!cleared) {
    /*
     * 404 rather than a cheerful 200, `DELETE /api/onboarding/answer/[key]`'s rule:
     * reporting success for an erasure that erased nothing is the wrong answer to
     * give about somebody's data. The client reports it as a failure, which is the
     * safe direction.
     */
    return NextResponse.json({ error: 'nothing to forget' }, { status: 404 });
  }

  /*
   * NOTHING ELSE HAPPENS HERE, AND THAT IS THE POINT OF READING THE ROW RATHER THAN
   * A COPY OF IT. Phase 5 reads `user_memory` when it assembles the chat context,
   * so the next prompt is built without what was just removed — no cache to
   * invalidate, no regeneration to schedule, no second table to reach into. That is
   * the whole reason this deletes the row rather than hiding it behind a flag.
   */
  return NextResponse.json({ ok: true });
}

/**
 * NEVER LOG THE DRIVER ERROR IN PRODUCTION.
 *
 * A postgres error quotes the failing statement AND its bound parameters, and on
 * the write path one of those is the memory payload — sentences a model wrote about
 * this person's life. `flush.ts`, `moderation/log.ts` and `auth.ts` all carry this
 * rule and `auth.ts` earned it in production on 2026-07-28. Development prints the
 * whole thing, because there is nobody to leak it to.
 */
function logFailure(what: 'read' | 'clear' | 'forget', err: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[memory] ${what} failed`, err);
  } else {
    console.error(`[memory] ${what} failed`, {
      name: err instanceof Error ? err.name : typeof err,
    });
  }
}
```

**Impact:** New public API surface behind `requireUser()`. `isPublic()` must never learn it — it is
under `/api/account/`, which is not in the allowlist, so nothing is needed beyond not adding it.

---

### Step 4: The forget-one route

**File:** `src/app/api/account/memory/[item]/route.ts` (new)
**Change:** `DELETE` one note by id. The id is in the PATH, not a query parameter, for
`/api/onboarding/answer/[key]`'s reason: it is part of the resource's identity, and a bulk variant
then has to be written on purpose rather than reached by widening a filter.

**Code:**

```ts
/**
 * `DELETE /api/account/memory/<id>` — forget one note.
 *
 *   -> 200 { ok: true, id }
 *   -> 400 the id is not one this app issues
 *   -> 401 / 403 / 429 as on the parent route
 *   -> 404 nothing matched — already forgotten, or never written
 *   -> 500 the write failed
 *
 * **THE ID IS A PATH SEGMENT, NOT A QUERY PARAMETER**, which is
 * `/api/onboarding/answer/[key]`'s call: it is part of the resource's identity, and
 * it means a bulk operation is a route somebody has to write deliberately rather
 * than a filter somebody widens.
 *
 * **AND IT IS NARROWED BEFORE IT REACHES A QUERY.** An id the app never issued
 * would otherwise match nothing and return a cheerful 404 — which reads as "already
 * deleted" and hides a client bug. `isMemoryItemId` is the same shape of guard as
 * `isOnboardingQuestionKey`, and it is shared with the component that rendered the
 * button, so a row this app displays can never carry an id this route refuses.
 *
 * **NO REGENERATION IS SCHEDULED, UNLIKE THE ANSWER DELETE.** That route calls
 * `generateLotus` in an `after()` because the deleted material is also PARAPHRASED
 * into `lotus_avatars.summary`, which every reading prompt reads — nulling one
 * column there would be half an erasure. This artifact has no paraphrase anywhere:
 * Phase 5 reads `user_memory` directly at prompt-assembly time, so removing the item
 * IS the erasure and the next prompt is built without it. **If a future phase ever
 * caches or distils this payload into a second table, this route grows an `after()`
 * in the same commit or the delete button becomes a lie.**
 */
import { NextResponse } from 'next/server';

import { isMemoryItemId } from '@/lib/account/memoryView';
import { requireUser } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { dismissUserMemoryItems, getUserMemory } from '@/lib/db/queries/memory';
import { hit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 20;

/** The SAME namespace as the parent route, so one budget covers the whole screen. */
const MEMORY_MAX = 60;
const HOUR_MS = 3_600_000;

export async function DELETE(_request: Request, ctx: { params: Promise<{ item: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // AWAITED. `hit()` is async since V9; an un-awaited Promise never refuses.
  const limit = await hit(`account:memory:${auth.user.id}`, Date.now(), MEMORY_MAX, HOUR_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'too many requests' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  const { item } = await ctx.params;
  if (!isMemoryItemId(item)) {
    // Deliberately opaque. The client is our own component, which does not read the
    // message, and a validation detail is a free description of the id scheme.
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  let existed: boolean;
  try {
    /*
     * **ONE STATEMENT, AND THAT IS PHASE 3's DELIBERATE SHAPE**: filter `items` and append to
     * `dismissed_ids` together, correlated against the row being updated, so this cannot lose
     * a race with the extractor's `after()` in another tab. It does not touch `input_hash`,
     * which is what stops the deletion triggering an immediate regeneration (phase 4,
     * Decision B).
     */
    const before = await getUserMemory(db, auth.user.id);
    const after = await dismissUserMemoryItems(db, auth.user.id, [item]);
    existed = memoryItems(before).length !== memoryItems(after).length;
  } catch (err) {
    /*
     * THE ERROR OBJECT IS NOT LOGGED IN PRODUCTION. The bound parameters of this
     * statement include the payload being rewritten, which is prose about this
     * person's life.
     */
    if (process.env.NODE_ENV === 'development') {
      console.error('[memory] forget failed', err);
    } else {
      console.error('[memory] forget failed', {
        name: err instanceof Error ? err.name : typeof err,
      });
    }
    return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  }

  if (!existed) {
    // 404 rather than a cheerful 200: claiming an erasure that did not happen is
    // the wrong answer to give about somebody's data.
    return NextResponse.json({ error: 'nothing to forget' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: item });
}
```

**Impact:** Depends on `dismissUserMemoryItems` existing — **it does; phase 3 ships it, and the
repair this paragraph anticipated is not needed.** The rule it states still binds: a
read-modify-write must not be inlined here — a query module is where
the handle-first convention and the UUID guard live, and `queries/contract.test.ts` enforces both.

---

### Step 5: The source-level route contract test

**File:** `src/app/api/account/memory/route.test.ts` (new)
**Change:** The `src/app/api/account/route.test.ts` register, applied to both handlers. Comments are
stripped first, for the lesson `contract.test.ts` and `clientBoundary.test.ts` both record: a rule
that fires on the prose describing the rule is a rule people delete.

**Code:**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Source-level assertions over the two memory routes, in `route.test.ts`'s
 * register. They exist to stop the properties this phase argued for being kept
 * green by other means — a bulk read moving onto the page's render path, a raw
 * driver error reaching a production log, a limiter that is called and not awaited.
 *
 * COMMENTS ARE STRIPPED FIRST: a rule that fires on the prose describing the rule
 * is a rule people delete.
 */
const strip = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const LIST = strip(readFileSync('src/app/api/account/memory/route.ts', 'utf8'));
const ONE = strip(readFileSync('src/app/api/account/memory/[item]/route.ts', 'utf8'));
const PAGE = readFileSync('src/app/account/page.tsx', 'utf8');

describe('the memory routes', () => {
  it('read the files at all, so nothing below passes vacuously', () => {
    expect(LIST.length).toBeGreaterThan(500);
    expect(ONE.length).toBeGreaterThan(300);
    expect(LIST).toContain('export async function GET');
    expect(LIST).toContain('export async function DELETE');
    expect(ONE).toContain('export async function DELETE');
  });

  it('serves the notes `private, no-store`', () => {
    // Per-user, and a machine's inferences about a person. No shared cache, no
    // disk, no history entry.
    expect(LIST).toContain("'cache-control': 'private, no-store'");
  });

  it('never renders the notes on the server', () => {
    /*
     * **THE PROPERTY `/api/onboarding/answer/<key>` ACTUALLY PROTECTS**, kept here
     * by a different mechanism because the payload has no labels: the text is not in
     * the response to merely OPENING a page. `/account` must not read the table.
     */
    expect(PAGE).not.toContain('queries/memory');
    expect(PAGE).not.toContain('memoryItems');
  });

  it('requires a session on every verb, with the fail-closed default kept', () => {
    // Unlike `/api/onboarding/*` and `DELETE /api/account`, there is nothing here to
    // read or erase before onboarding: the room does not open until then.
    expect(LIST).toContain('requireUser()');
    expect(ONE).toContain('requireUser()');
    expect(LIST).not.toContain('requireOnboarding: false');
    expect(ONE).not.toContain('requireOnboarding: false');
  });

  it('rate limits, and awaits the limiter', () => {
    // `hit()` is async since V9; an un-awaited Promise is truthy, i.e. never
    // refuses.
    expect(LIST).toMatch(/await\s+hit\(/);
    expect(ONE).toMatch(/await\s+hit\(/);
  });

  it('declares runtime and maxDuration on both', () => {
    for (const [name, src] of [['list', LIST], ['one', ONE]] as const) {
      expect({ name, ok: src.includes("export const runtime = 'nodejs'") }).toEqual({
        name,
        ok: true,
      });
      expect({ name, ok: /export const maxDuration = \d+/.test(src) }).toEqual({ name, ok: true });
    }
  });

  it('narrows the id before it reaches a query', () => {
    // An unrecognised id would match nothing and return a cheerful 404, which reads
    // as "already deleted" and hides a client bug.
    const guardIndex = ONE.indexOf('isMemoryItemId');
    const queryIndex = ONE.indexOf('dismissUserMemoryItems');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(queryIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(queryIndex);
  });

  it('404s an erasure that erased nothing, on both delete paths', () => {
    // Reporting success for a deletion that deleted nothing is the wrong answer to
    // give about somebody's data.
    expect(LIST).toMatch(/status:\s*404/);
    expect(ONE).toMatch(/status:\s*404/);
  });

  it('never logs a raw error object in production', () => {
    /*
     * A postgres error quotes its bound parameters, and on the write path one of
     * those is the payload — prose a model wrote about this person's life.
     */
    for (const [name, src] of [['list', LIST], ['one', ONE]] as const) {
      const guarded = src.includes("process.env.NODE_ENV === 'development'");
      expect({ name, guarded }).toEqual({ name, guarded: true });
      // The bare `console.error('...', err)` form, outside the development branch.
      expect({ name, bare: /console\.error\([^)]*,\s*err\s*\)/.test(src.split('development')[0]) })
        .toEqual({ name, bare: false });
    }
  });

  it('declares no analytics event', () => {
    /*
     * This phase adds ZERO names to `events.ts`, deliberately — the register's own
     * guidance is to fold rather than add, and every available fold here is one it
     * has already refused. If a number is ever needed, it lands beside the
     * extractor's event with the ceiling moved once and the accounting written.
     */
    for (const src of [LIST, ONE]) {
      expect(src).not.toContain('withAnalytics');
      expect(src).not.toMatch(/\btrack\(/);
    }
  });
});
```

**Impact:** Fails loudly if a later session moves the read onto the render path.

---

### Step 6: The client component

**File:** `src/components/AccountMemory.tsx` (new)
**Change:** The reveal, the list, the per-item remove, and the two-step forget-everything.

**Simpler than `AccountAnswers` on purpose.** There is no sheet, so there is no
`document.activeElement` trap, no `returnFocusTo` prop and no Escape handler — Safari's
does-not-focus-a-button behaviour costs nothing when nothing steals focus. That is what
"proportionate" means here: the smallest surface that discharges the duty.

**Code:**

```tsx
'use client';

import { useState } from 'react';

import type { MemoryItemView } from '@/lib/account/memoryView';
import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './AccountMemory.module.css';

/**
 * What the room has noted about the querent, on `/account` — and both ways to
 * destroy it.
 *
 * ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────
 *
 * **NOBODY ASKED FOR THIS SCREEN. IT IS A DUTY THAT FOLLOWS FROM THE FEATURE
 * BESIDE IT.** The group chat now stores model-written inferences about a real
 * person — habits, food, who annoys them at work — and re-reads them into every
 * future prompt. That is a stronger claim on somebody than anything else in this
 * database: `readings.question` and `chat_messages.body` are text the QUERENT
 * typed, and the six onboarding answers are theirs too. A sentence a machine wrote
 * ABOUT them is neither, and the two honest answers to it are *you can see it* and
 * *you can destroy it*.
 *
 * ── NOTHING IS ON SCREEN UNTIL IT IS ASKED FOR ───────────────────────────────
 *
 * The section mounts with a heading, a hint and one button. `/account`'s server
 * component reads nothing: the notes are absent from the page's HTML and arrive
 * only in the response to a press. **That press is the asking**, which is
 * reconciliation §7.3's standard and `AccountAnswers`' *"a tap on a question is
 * asking"* one section up.
 *
 * **THE LIST ARRIVES WHOLE, AND THAT IS ARGUED IN THE ROUTE'S HEADER, NOT HERE.**
 * Short version: `/api/onboarding/answer/<key>`'s one-per-request rule works
 * because a question TITLE is a non-revealing handle. A note has no title. Twelve
 * rows saying "Catatan 1 … Catatan 12" would cost twelve taps and protect nothing.
 *
 * ── THERE IS NO EDIT CONTROL, AND THAT IS A DECISION ─────────────────────────
 *
 * V8's L13 was reversed for the six answers — *"a querent must be able to see what
 * they said and fix it"* — and the reversal does NOT transfer, because those are
 * words the querent WROTE. Editing a note here is not correcting your own sentence;
 * it is dictating what three readers believe about you, in prose that goes straight
 * into a model prompt. That needs W7's gate, a `source: 'model' | 'user'` flag the
 * extractor respects, and a length cap — three things owned by other files. **The
 * correction offered here is deletion**, and it is a complete one.
 *
 * ── THE COPY SAYS A MACHINE WROTE IT, IN THE HINT, ABOVE THE BUTTON ──────────
 *
 * `account.memory.hint` is the load-bearing string, `C-D8`'s finding applied a
 * second time: **nobody re-reads `/privacy` and everybody reads the hint in front
 * of them.** It must keep saying who wrote these sentences and that they can be
 * wrong. Softening it into "to personalise your experience" is the sentence this
 * project exists not to write.
 */
type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; items: MemoryItemView[] }
  | { kind: 'failed' };

export function AccountMemory() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  /** The id currently being removed, or `'all'` for the whole payload. */
  const [busy, setBusy] = useState<string | null>(null);
  /** The forget-everything control's second step. */
  const [confirming, setConfirming] = useState(false);
  /** A failure AFTER the list is on screen, which must not blank it. */
  const [writeFailed, setWriteFailed] = useState(false);

  async function reveal() {
    if (phase.kind === 'loading') return;
    setPhase({ kind: 'loading' });
    try {
      const res = await fetch('/api/account/memory', {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) {
        setPhase({ kind: 'failed' });
        return;
      }
      const data = (await res.json()) as { items?: unknown };
      /*
       * NARROWED AT THE BOUNDARY, `PersonaBlockClient`'s habit. The route builds this
       * with the same pure function, so a mismatch means a deploy skew rather than a
       * malformed row — and rendering `undefined.map` would take the whole page down
       * for a section nobody has to use.
       */
      const items = Array.isArray(data.items)
        ? (data.items.filter(
            (i): i is MemoryItemView =>
              typeof i === 'object' &&
              i !== null &&
              typeof (i as MemoryItemView).id === 'string' &&
              typeof (i as MemoryItemView).text === 'string',
          ) as MemoryItemView[])
        : [];
      setPhase({ kind: 'ready', items });
    } catch {
      setPhase({ kind: 'failed' });
    }
  }

  async function forgetOne(id: string) {
    if (busy || phase.kind !== 'ready') return;
    setBusy(id);
    setWriteFailed(false);
    try {
      const res = await fetch(`/api/account/memory/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        /*
         * A 404 means there was nothing to remove, which is indistinguishable from a
         * real failure here and is reported as one — `AccountAnswers`' call, and the
         * safe direction: claiming an erasure that did not happen is the wrong answer
         * to give about somebody's data.
         */
        setWriteFailed(true);
        setBusy(null);
        return;
      }
      /*
       * THE ROW LEAVES THE LIST LOCALLY, NOT BY REFETCHING. `AccountAnswers`' reason:
       * this page's persona block would fire its own fetch on a `router.refresh()`,
       * and re-rendering four other blocks to remove one line is the wrong trade. The
       * server is authoritative on the next visit.
       *
       * **UNDER A BLOB PAYLOAD THE ONE ROW IS THE WHOLE MEMORY**, so removing it
       * leaves the empty state — which is exactly right: there is nothing left.
       */
      setPhase({ kind: 'ready', items: phase.items.filter((i) => i.id !== id) });
      setBusy(null);
    } catch {
      setWriteFailed(true);
      setBusy(null);
    }
  }

  async function forgetAll() {
    if (busy) return;
    setBusy('all');
    setWriteFailed(false);
    try {
      const res = await fetch('/api/account/memory', { method: 'DELETE' });
      if (!res.ok) {
        setWriteFailed(true);
        setBusy(null);
        setConfirming(false);
        return;
      }
      setPhase({ kind: 'ready', items: [] });
      setBusy(null);
      setConfirming(false);
    } catch {
      setWriteFailed(true);
      setBusy(null);
      setConfirming(false);
    }
  }

  return (
    <div className={styles.wrap}>
      {/* THE DISCLOSURE, ABOVE THE CONTROL AND BEFORE ANY CONTENT. It says who wrote
          these sentences and that they can be wrong, and it is on screen whether or
          not the querent ever presses the button. */}
      <p className={styles.hint}>{t('account.memory.hint')}</p>

      {phase.kind === 'idle' ? (
        <button type="button" className={styles.reveal} onClick={() => void reveal()}>
          {t('account.memory.reveal')}
        </button>
      ) : null}

      {phase.kind === 'loading' ? (
        <p className={styles.loading} role="status">
          {t('account.memory.loading')}
        </p>
      ) : null}

      {phase.kind === 'failed' ? (
        <p className={styles.failed} role="alert">
          {t('account.memory.failed')}
        </p>
      ) : null}

      {phase.kind === 'ready' && phase.items.length === 0 ? (
        <p className={styles.empty}>{t('account.memory.empty')}</p>
      ) : null}

      {phase.kind === 'ready' && phase.items.length > 0 ? (
        <>
          <ul className={styles.rows}>
            {phase.items.map((item) => (
              <li key={item.id} className={styles.row}>
                {/*
                  `lang` IS DELIBERATELY ABSENT. A note is written in whatever
                  language the querent was typing in the room, which is not
                  necessarily the language of this page — and unlike a persona there
                  is no `locale` column to read it off, because `C-D9` keeps this
                  material out of `TRANSLATABLE` entirely. Declaring the viewer's
                  locale over Indonesian prose would make a screen reader mispronounce
                  it, which is worse than declaring nothing.
                */}
                <p className={styles.text}>{item.text}</p>
                <button
                  type="button"
                  className={styles.remove}
                  /* Names WHAT is being removed: a column of identical `Hapus`
                     buttons is a column of identical announcements otherwise. */
                  aria-label={t('account.memory.itemAria', { text: item.text })}
                  onClick={() => void forgetOne(item.id)}
                  disabled={busy !== null}
                >
                  {busy === item.id
                    ? t('account.memory.removing')
                    : t('account.memory.remove')}
                </button>
              </li>
            ))}
          </ul>

          {writeFailed ? (
            <p className={styles.failed} role="alert">
              {t('account.memory.failed')}
            </p>
          ) : null}

          {/*
            FORGET EVERYTHING IS TWO STEPS, AND IT IS THE ONLY TWO-STEP CONTROL ON
            THIS BLOCK. One row is one sentence and is cheap to lose; the whole
            payload is weeks of the room's sense of somebody, and there is no
            restore. `DeleteAccount` is the precedent for the shape — a destructive
            control that asks once — and `account.facts.cancel` is reused rather than
            given a twelfth key, the way `/account` already reuses `history.home`.

            **THE ROW WITH ONE ITEM UNDER A BLOB PAYLOAD STILL GETS BOTH CONTROLS,
            and that is not a bug.** They do the same thing, they say the same thing,
            and a component that hid one of them would need to know which payload
            shape Phase 3 chose — which is exactly what `memoryView` exists to stop
            it needing to know.
          */}
          {confirming ? (
            <div className={styles.confirm}>
              <button
                type="button"
                className={styles.forgetAllConfirm}
                onClick={() => void forgetAll()}
                disabled={busy !== null}
              >
                {busy === 'all'
                  ? t('account.memory.removing')
                  : t('account.memory.forgetAllConfirm')}
              </button>
              <button
                type="button"
                className={styles.cancel}
                onClick={() => setConfirming(false)}
                disabled={busy !== null}
              >
                {t('account.facts.cancel')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.forgetAll}
              onClick={() => setConfirming(true)}
              disabled={busy !== null}
            >
              {t('account.memory.forgetAll')}
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}
```

(The `WHOLE_MEMORY_ID` import guard this paragraph described is moot — the constant is cancelled.
Original note, for the record: it was imported only if the implementer kept a
reference to it; if TypeScript reports it unused, **drop the import rather than inventing a use** —
the component is deliberately blind to which payload shape it is rendering.

**Impact:** One new client component, mounted once.

---

### Step 7: The stylesheet

**File:** `src/components/AccountMemory.module.css` (new)
**Change:** Tokens only. No new hex, no new font size, no new curve — `AccountAnswers.module.css`'s
rule, and every value below already exists in that file or in `tokens.css`.

**Code:**

```css
/*
 * What the room has noted, on `/account`.
 *
 * NO NEW HEX, NO NEW FONT SIZE, NO NEW CURVE. `--danger` is reused for the two
 * destructive controls and for the failure line, which are the only places on this
 * block where something is destroyed or went wrong -- `AccountAnswers.module.css`'s
 * rule and its palette.
 *
 * **EVERY CONTROL CLEARS 44px**, which is the iOS minimum `PublicShare`'s 36px
 * button already fails on twenty-three pages. The remove button sits at the END of a
 * row whose text can be three lines, so the row is a flex container that WRAPS: a
 * long note must take the width and push the button under it rather than squeezing
 * it below its own minimum.
 */

.wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hint,
.empty {
  margin: 0;
  font-family: var(--font-body), Georgia, serif;
  font-style: italic;
  font-size: var(--fs-hint);
  line-height: 1.4;
  color: var(--muted);
}

.empty {
  color: var(--faint);
}

.loading {
  margin: 0;
  font-family: var(--font-body), Georgia, serif;
  font-style: italic;
  font-size: var(--fs-hint);
  color: var(--faint);
}

.failed {
  margin: 0;
  font-family: var(--font-body), Georgia, serif;
  font-style: italic;
  font-size: var(--fs-hint);
  color: var(--danger);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--gold-hairline);
}

.row:last-child {
  border-bottom: none;
}

/*
 * `min-width: 0` AND `overflow-wrap: anywhere`, both load-bearing. The note is model
 * output and may hold a long unbroken token; `ChatComposer` paid for exactly this
 * with `Kirim` disappearing off the edge at 320px, and `break-word` is NOT a
 * substitute -- only `anywhere` changes min-content width.
 */
.text {
  flex: 1 1 12rem;
  min-width: 0;
  margin: 0;
  font-family: var(--font-body), Georgia, serif;
  font-size: var(--fs-hint);
  line-height: 1.5;
  color: var(--text-warm);
  overflow-wrap: anywhere;
}

.reveal,
.remove,
.forgetAll,
.forgetAllConfirm,
.cancel {
  flex: 0 0 auto;
  min-height: 44px;
  padding: 0 14px;
  font-family: var(--font-display), serif;
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--ls-button);
  text-transform: uppercase;
  border-radius: var(--radius-chip);
  cursor: pointer;
}

/* The one control on the block before anything is revealed. Gold, because it is
   the reason the section is here. */
.reveal {
  align-self: flex-start;
  color: var(--gold);
  border: 1px solid var(--gold-border);
  background: var(--gold-wash);
}

/*
 * QUIET, NOT `--danger`. Per-row removal is a right the querent is exercising over
 * something a machine wrote about them, and colouring twelve rows as warnings would
 * scold them for it. That is V8's argument for its own clear button, and it applies
 * harder here because there are many rows rather than one.
 */
.remove {
  color: var(--muted);
  border: 1px solid var(--gold-hairline);
  background: transparent;
}

/* The whole payload, and there is no restore. `--danger` earns its place on the
   second step, where the only question is whether this is the irreversible one. */
.forgetAll {
  align-self: flex-start;
  color: var(--muted);
  border: 1px solid var(--gold-hairline);
  background: transparent;
}

.forgetAllConfirm {
  color: var(--danger);
  border: 1px solid var(--danger);
  background: transparent;
}

.cancel {
  color: var(--muted);
  border: 1px solid var(--gold-hairline);
  background: transparent;
}

.confirm {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.reveal:focus-visible,
.remove:focus-visible,
.forgetAll:focus-visible,
.forgetAllConfirm:focus-visible,
.cancel:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--gold-border);
}

.reveal:disabled,
.remove:disabled,
.forgetAll:disabled,
.forgetAllConfirm:disabled,
.cancel:disabled {
  /* One write at a time. Two concurrent deletes would race each other's
     read-modify-write of the same payload. */
  cursor: default;
  color: var(--faint);
  border-color: var(--gold-hairline);
  background: transparent;
}
```

**Impact:** New stylesheet, no global changes.

---

### Step 8: Mount it on `/account`

**File:** `src/app/account/page.tsx:35` (import) and `:298` (the section)
**Change:** One import and one `<section>`, **after** the answers block and **before**
`<DeleteAccount />`.

**Placement is the argument, exactly as it is for the answers.** The section sits at the bottom of
the page with the other erasure control, below the persona and below the six answers, because it is
the most sensitive block on the page and because `/account`'s first screen is meant to be the card,
the reader and the Lotus — not a settings list.

**Code — the import, added alphabetically beside the others at `:28`:**

```tsx
import { AccountMemory } from '@/components/AccountMemory';
```

**Code — the section, inserted between the answers `</section>` and `<DeleteAccount />`:**

```tsx
      {/*
        WHAT THE ROOM HAS NOTED ABOUT THEM, AND BOTH WAYS TO DESTROY IT (R2).
        Nobody asked for this block; it follows from storing model-written
        inferences about a person and re-reading them into every future prompt.

        **THE SERVER READS NOTHING HERE, AND THAT IS THE PROPERTY TO PROTECT.** The
        five reads above are `/account`'s render-path exemption; this block is not
        one of them, and the notes are deliberately absent from this page's HTML.
        They arrive only in the response to a press — which is the asking, in
        reconciliation §7.3's sense. `AccountMemory` is a client component for
        exactly that reason and not for the persona's latency one.

        BELOW THE ANSWERS AND ABOVE `DeleteAccount`: the two erasure controls sit
        together, at the bottom, where L13's "do not turn the rite into a settings
        page" argument put the first of them.
      */}
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>{t('account.memory.heading')}</h2>
        <AccountMemory />
      </section>
```

**Impact:** `/account` gains one section and no new query. Its `Promise.all` is untouched.

---

### Step 9: The Indonesian catalog

**File:** `src/lib/i18n/locales/id.ts` — 11 keys inserted after `'account.answers.note'` (`:1183`),
and one amendment at `'chat.first_open.notice'` (`:643`).

**`id.ts` OWNS THE KEY SET AND THE RED TYPECHECK IS THE FEATURE.** Write these first; TS2739 then
names every missing English string. Do not add a cross-locale fallback — an unknown key returns THE
KEY (I3), on purpose.

**Code — the new block, after `account.answers.note`:**

```ts
  // ==========================================================================
  // R2 — what the room has noted about the querent, on `/account`.
  //
  // **THIS IS A DISCLOSURE BLOCK, NOT A FEATURE BLOCK, AND THE REGISTER IS
  // DIFFERENT BECAUSE OF IT.** Every other heading on this page is possessive and
  // slightly mystical -- `Kartumu`, `Jalanmu`, `Teratai Batin`, `Jawabanmu`. This
  // one says plainly what it is, because the querent is being told that a machine
  // has been writing about them and the one thing that copy must not do is sound
  // charming about it.
  //
  // `account.memory.hint` IS THE LOAD-BEARING STRING, and it is `C-D8`'s finding
  // applied a second time: **nobody re-reads `/privacy`; everybody reads the hint
  // in front of them.** It states three things and must keep stating all three --
  // a model wrote it, it came from what you type in the group, and it can be
  // wrong. **It must never be softened into "untuk menyesuaikan pengalamanmu"**:
  // that is the sentence this project exists not to write, and it is why clause
  // 2.2 of `/privacy` quotes the hardest onboarding question word for word instead
  // of calling it "refleksi pribadi tertentu".
  //
  // NO EDIT COPY, DELIBERATELY. V8's L13 reversal made the six answers editable
  // because they are the querent's own words; a note here is a sentence a machine
  // wrote ABOUT them, and offering to rewrite it would be offering to dictate what
  // three readers believe about you, straight into a prompt. The correction on
  // offer is deletion.
  //
  // `account.facts.cancel` IS REUSED for the second step of `forgetAll` rather than
  // given a twelfth key -- `history.home` is already reused on this page, and a
  // second string for the same control is how two screens come to disagree about
  // what `Batal` is called.
  // ==========================================================================
  'account.memory.heading': 'Catatan tentangmu',
  'account.memory.hint':
    'Ditulis oleh model bahasa, bukan olehmu, dari apa yang kamu ketik di grup. Bisa saja keliru, dan bisa kamu hapus satu per satu.',
  'account.memory.reveal': 'Lihat catatannya',
  'account.memory.loading': 'Membuka…',
  'account.memory.empty': 'Belum ada yang dicatat.',
  'account.memory.failed': 'Belum bisa dibuka. Coba lagi sebentar lagi.',
  'account.memory.itemAria': 'Hapus catatan: {text}',
  'account.memory.remove': 'Hapus',
  'account.memory.removing': 'Menghapus…',
  'account.memory.forgetAll': 'Lupakan semuanya',
  'account.memory.forgetAllConfirm': 'Ya, lupakan semuanya',
```

**Code — the amendment to `chat.first_open.notice`.** Replace the value and put the old text in the
comment above it, keeping the existing header:

```ts
  /*
   * ── AMENDED FOR R2, AND THE OLD TEXT IS KEPT HERE RATHER THAN DELETED ──────
   *
   * It read: *"Di ruang ini ketiga pembaca bisa melihat jawaban awalmu, bacaanmu,
   * dan obrolan ini sendiri — supaya mereka menjawab kamu, bukan orang umum."*
   *
   * **THAT SENTENCE ENUMERATES WHAT THE READERS SEE, AND THE ENUMERATION BECAME
   * INCOMPLETE THE DAY R2 SHIPPED.** The readers now also keep notes — written by a
   * model, out of this room, kept after the conversation scrolls away. A list that
   * names three sources and omits the fourth is worse than a list that never
   * existed, because a reader who checked it once will not check it again.
   *
   * **THIS IS THE LOAD-BEARING HALF OF THE PAIR, EXACTLY AS `C-D8` FOUND FOR THE
   * ONBOARDING HINTS.** Amending `/privacy` clause 2.8 was necessary and is not
   * sufficient: nobody re-reads `/privacy`, and everybody reads this. Where to look
   * is in the same sentence, because the control is on a page they can reach.
   *
   * **IT IS STILL A NOTICE AND NOT A CONSENT MODAL.** If it ever grows an "I agree"
   * button it has become the modal the original ruling refused.
   */
  'chat.first_open.notice':
    'Di ruang ini ketiga pembaca bisa melihat jawaban awalmu, bacaanmu, dan obrolan ' +
    'ini sendiri, dan mereka mencatat hal-hal tentangmu dari obrolan ini. Catatannya ' +
    'bisa kamu baca dan hapus di halaman Dirimu.',
```

**Impact:** `en.ts` goes red with TS2739 naming eleven keys. That red is the next step.

---

### Step 10: The English catalog

**File:** `src/lib/i18n/locales/en.ts` — the same eleven keys after `'account.answers.note'`
(`:648`), and the amendment at `:353`.

**WRITTEN, NOT TRANSLATED.** There is a test asserting no English value is byte-identical to its
Indonesian counterpart.

**Code — the new block:**

```ts
  // R2 — what the room has noted about the querent. `id.ts` carries the full
  // account: why the register is plain rather than mystical, why the hint is the
  // load-bearing string, and why there is no edit control.
  'account.memory.heading': 'Notes about you',
  'account.memory.hint':
    'Written by a language model, not by you, from what you type in the group. It can be wrong, and you can delete any of it.',
  'account.memory.reveal': 'Show the notes',
  'account.memory.loading': 'Opening…',
  'account.memory.empty': 'Nothing has been noted yet.',
  'account.memory.failed': 'That did not open. Try again in a moment.',
  'account.memory.itemAria': 'Delete this note: {text}',
  'account.memory.remove': 'Delete',
  'account.memory.removing': 'Deleting…',
  'account.memory.forgetAll': 'Forget all of it',
  'account.memory.forgetAllConfirm': 'Yes, forget all of it',
```

**Code — the amendment:**

```ts
  /*
   * AMENDED FOR R2. The Indonesian catalog carries the full account, including why
   * this is the load-bearing half of the pair and why it is still a notice rather
   * than a consent modal. It read: *"In this room the three readers can see your
   * opening answers, your readings, and this conversation — so they answer you
   * rather than anybody."*
   */
  'chat.first_open.notice':
    'In this room the three readers can see your opening answers, your readings and ' +
    'this conversation, and they keep notes about you from it. You can read and delete ' +
    'those notes on the About You page.',
```

**Impact:** Typecheck green. **MEASURE THE CATALOG SIZE** — see Verification.

---

### Step 11: `/privacy`, Indonesian

**File:** `src/app/privacy/privacy.id.tsx` — five edits.

**11a — a new SubClause `2-8`, immediately after `2-7`'s closing tag (`:236`), inside clause 2:**

```tsx
        {/*
          2.8 — R2. **A NEW ANCHOR IS FREE; RENUMBERING IS NOT** (the T&C precedent:
          a refusal renders `/terms#6-2`), so this is appended after 2.7 rather than
          inserted anywhere earlier. `legal.test.ts` asserts the two documents
          declare the SAME anchor set, so the English document gains `2-8` in the
          same commit or that test goes red.

          **THIS IS THE FIRST THING IN THIS DATABASE THAT A MACHINE WROTE ABOUT A
          PERSON**, and clause 2's other subclauses are all about text the querent
          typed. So the clause leads with authorship, states plainly that it can be
          wrong, and names the page where it can be read and deleted -- because a
          policy describing a control nobody can perform is the exact mistake
          `/account` made for a release and that clause 2.2 has promised twice.
        */}
        <SubClause id="2-8" n="2.8" title="Catatan yang ditulis mesin tentangmu">
          <Callout>
            <P>
              <strong>
                Para pembaca menyimpan catatan tentangmu, dan yang menulisnya adalah model
                bahasa &mdash; bukan kamu, dan bukan manusia
              </strong>
              . Catatan itu dibuat dari apa yang kamu ketik di ruang obrolan, dan tetap ada
              setelah percakapannya sendiri lewat.
            </P>
          </Callout>
          <P>
            Isinya kalimat-kalimat pendek tentang kebiasaanmu, hal yang kamu suka atau tidak,
            dan apa yang sedang terjadi di hidupmu &mdash; hal-hal yang membuat pertanyaan
            &ldquo;gimana kabarmu&rdquo; berlanjut dari yang terakhir, bukan mulai dari nol
            setiap kali. Disimpan apa adanya, tanpa enkripsi, sama seperti pesanmu sendiri.
          </P>
          <P>
            <strong>Catatan itu bisa saja keliru.</strong>{' '}Mesin menyimpulkan, dan
            kesimpulannya kadang salah &mdash; kadang juga terlalu tepat. Keduanya alasan
            kenapa kamu harus bisa melihatnya.
          </P>
          <P>
            Kamu bisa membaca semuanya dan menghapusnya, satu per satu atau sekaligus, di
            halaman <strong>Dirimu</strong>. Yang kamu hapus tidak ikut dibaca para pembaca
            pada percakapan berikutnya. Tidak ada cara mengembalikannya.
          </P>
          <P>
            Tidak ada manusia yang membacanya, dan catatannya tidak diterjemahkan. Lihat{' '}
            <Link href="#3-1">klausul 3.1</Link>.
          </P>
        </SubClause>
```

**11b — clause 3's list (`:243`), one item, after the `Ruang obrolan` line:**

```tsx
            'Catatan tentangmu: supaya percakapan berikutnya nyambung dengan hidupmu dan tidak mulai dari nol setiap kali.',
```

**11c — clause 6's list (`:489`), one item, after the `Ruang obrolan` row:**

```tsx
            <>
              <strong>Catatan tentangmu: selama akunmu ada</strong>, tanpa penyapuan otomatis.
              Yang menghapusnya adalah kamu &mdash; satu per satu atau sekaligus, di halaman
              Dirimu.
            </>,
```

**11d — clause 7's list (`:522`), one item, after the answer-clearing line:**

```tsx
            'Membaca dan menghapus catatan yang ditulis mesin tentangmu, satu per satu atau sekaligus, tanpa menghapus akun.',
```

**11e — clause 8's first paragraph (`:534`), extended.** Replace the paragraph with:

```tsx
        <P>
          Saat kamu meminta penghapusan, akunmu langsung berhenti bekerja dan datamu tidak lagi bisa
          dijangkau lewat aplikasi. Teks pertanyaan yang pernah ditolak{' '}
          <strong>dihapus saat itu juga</strong>, tanpa menunggu jangka waktu{' '}
          {RETENTION.moderationQuestionDays}{' '}hari, dan{' '}
          <strong>catatan yang ditulis mesin tentangmu juga dihapus saat itu juga</strong>{' '}
          &mdash; bukan dalam {RETENTION.erasureGraceDays} hari, melainkan di transaksi yang sama.
        </P>
```

**THIS SENTENCE IS A CLAIM ABOUT PHASE 3'S CODE AND MUST MATCH IT.** The plan index says Phase 3
clears `user_memory` inside the same transaction that sets `deleted_at`. If Phase 3 instead lets the
hard delete's cascade do it — which is what `chat_messages` does, to keep the thirty-day restore
meaningful — then **this paragraph is wrong and must be reverted to its original text, with the
notes named in the second paragraph's cascade list instead.** See **Assumptions**.

**Impact:** Five copy edits, one new anchor. The Malay grep and the "no unread statute" checks in
`legal.test.ts` still pass — nothing above uses `tempoh`, `kerjaya`, `hala tuju`, `sembang` or
`awak`, and no article number is cited.

---

### Step 12: `/privacy`, English

**File:** `src/app/privacy/privacy.en.tsx` — the same five edits. **Rewritten, not translated**
(S-D6's habit), but every claim is the same claim, including the uncomfortable one about being
right.

**12a — SubClause `2-8`, after `2-7` (`:207`):**

```tsx
        {/*
          2.8 — R2. The SAME ANCHOR SET as the Indonesian document or
          `legal.test.ts` goes red, which is what makes "both locales" mechanical.
          The prose is written rather than translated; every claim is the same
          claim, including the uncomfortable one about a note being right.
        */}
        <SubClause id="2-8" n="2.8" title="Notes a machine writes about you">
          <Callout>
            <P>
              <strong>
                The readers keep notes about you, and a language model writes them &mdash; not
                you, and not a person
              </strong>
              . They are made from what you type in the chat, and they outlast the conversation
              itself.
            </P>
          </Callout>
          <P>
            They are short sentences about your habits, what you like and do not like, and what
            is going on in your life &mdash; the things that let &ldquo;how have you been&rdquo;
            carry on from last time instead of starting from nothing. Stored as written,
            unencrypted, exactly like your own messages.
          </P>
          <P>
            <strong>A note can be wrong.</strong>{' '}A machine is inferring, and an inference is
            sometimes mistaken &mdash; and sometimes uncomfortably accurate. Both are reasons you
            should be able to see them.
          </P>
          <P>
            You can read every one of them and delete them, one at a time or all at once, on the{' '}
            <strong>About You</strong> page. Anything you delete is not read by the readers in the
            next conversation. There is no way to get it back.
          </P>
          <P>
            No human reads them, and they are not translated. See{' '}
            <Link href="#3-1">clause 3.1</Link>.
          </P>
        </SubClause>
```

**12b — clause 3's list (`:215`):**

```tsx
            'The notes about you: so the next conversation carries on from your life instead of starting from nothing each time.',
```

**12c — clause 6's list (`:429`):**

```tsx
            <>
              <strong>The notes about you: for the life of your account</strong>, with no
              automatic sweep. You are what deletes them &mdash; one at a time or all at once,
              on the About You page.
            </>,
```

**12d — clause 7's list (`:452`):**

```tsx
            'Read and delete the notes a machine writes about you, one at a time or all at once, without deleting your account.',
```

**12e — clause 8's first paragraph (`:463`):**

```tsx
        <P>
          When you ask us to delete it, the account stops working immediately and your data becomes
          unreachable through the app. The text of any refused question is{' '}
          <strong>redacted at that moment</strong>, without waiting for the{' '}
          {RETENTION.moderationQuestionDays}-day schedule, and{' '}
          <strong>the notes a machine wrote about you are erased at that moment too</strong>{' '}
          &mdash; not in {RETENTION.erasureGraceDays} days, but in the same transaction.
        </P>
```

The same Phase 3 caveat applies verbatim.

**Impact:** Anchor sets match; `legal.test.ts`'s parity assertion stays green.

---

### Step 13: The legal tests

**File:** `src/app/legal.test.ts` — one `describe` block, added after the admin-amendment block
(`:392`).

**Code:**

```ts
  /*
   * ── R2: THE MACHINE-WRITTEN NOTES ──────────────────────────────────────────
   *
   * **THE FIRST THING IN THIS DATABASE THAT A MACHINE WROTE ABOUT A PERSON.**
   * Everything clause 2 described before it is text the querent typed. A policy
   * that folded these into 2.7's "the group chat" would be describing a room that
   * forgets, which is the property this workstream removed.
   *
   * Three claims are asserted because each is one somebody would soften: WHO wrote
   * it, that it can be WRONG, and WHERE the control is. The last is the one that
   * turns the clause from a disclosure into a promise the code has to keep --
   * `/privacy` promising per-answer clearing that nobody could perform is the exact
   * mistake `/account` exists to have ended.
   */
  describe('the machine-written notes (R2)', () => {
    it('gives the notes their own subclause in BOTH locales', () => {
      expect(anchorsIn(PRIVACY_HTML['privacy.id'])).toContain('2-8');
      expect(anchorsIn(PRIVACY_HTML['privacy.en'])).toContain('2-8');
    });

    it('says a MODEL wrote them, not the querent and not a person', () => {
      expect(PRIVACY['privacy.id']).toContain('model bahasa');
      expect(PRIVACY['privacy.en']).toMatch(/a language model writes them/i);
    });

    it('says they are built from what the querent types in the room', () => {
      expect(PRIVACY['privacy.id']).toContain('dari apa yang kamu ketik di ruang obrolan');
      expect(PRIVACY['privacy.en']).toMatch(/from what you type in the chat/i);
    });

    it('admits a note can be wrong', () => {
      // The least comfortable sentence in the clause and the one most likely to be
      // cut, on the `refused question` precedent one describe up. It is also the
      // whole reason the delete control exists.
      expect(PRIVACY['privacy.id']).toContain('bisa saja keliru');
      expect(PRIVACY['privacy.en']).toMatch(/A note can be wrong/i);
    });

    it('names the page where they can be read and deleted', () => {
      // A policy describing a control nobody can perform is the mistake `/account`
      // was built to end. `AccountMemory` is what makes this sentence true.
      expect(PRIVACY['privacy.id']).toContain('Dirimu');
      expect(PRIVACY['privacy.en']).toContain('About You');
    });

    it('never says the notes personalise anything', () => {
      /*
       * **THE SENTENCE THIS PROJECT EXISTS NOT TO WRITE.** Clause 2.2 quotes the
       * hardest onboarding question word for word rather than calling it "certain
       * personal reflections", for the same reason.
       */
      for (const [name, text] of Object.entries(PRIVACY)) {
        for (const phrase of [
          'menyesuaikan pengalaman',
          'personalise your experience',
          'personalize your experience',
        ]) {
          expect({ name, phrase, present: text.includes(phrase) }).toEqual({
            name,
            phrase,
            present: false,
          });
        }
      }
    });
  });
```

**Impact:** Green once Steps 11 and 12 land; red if either locale is amended alone.

---

### Step 14: The client fence

**File:** `src/lib/clientBoundary.test.ts` — two tests, added after the `@/lib/share/slug` pair
(`:398`).

**Why now:** this phase puts a client-importable module into `src/lib/account/`, a directory that
already holds `delete.ts` — which reaches `@/lib/db/queries/share` and carries the whole account
erasure. `grace.ts` is already imported by `DeleteAccount.tsx`, so a blanket fence on the directory
would fail on the design; the narrow one is `@/lib/share/links`' shape.

**Code:**

```ts
  /*
   * R2's task. `src/lib/account/` now holds THREE modules with three different
   * boundaries: `grace.ts` is a LEAF that `DeleteAccount.tsx` legitimately imports,
   * `memoryView.ts` is pure and is imported by both a route and a client component,
   * and `delete.ts` reaches `@/lib/db/queries/share` and performs the whole account
   * erasure. A directory glob would fail on the first two; naming the third is the
   * `@/lib/share/links` shape, and the value of the fence is that it says WHY.
   */
  it('lets no client component import the account deleter', () => {
    for (const file of CLIENT) {
      const offending = importsOf(file.source).filter((spec) => spec === '@/lib/account/delete');
      expect({ [file.path]: offending }).toEqual({ [file.path]: [] });
    }
  });

  it('keeps `@/lib/account/memoryView` pure, so its client import stays earned', () => {
    /*
     * The other half of the rule, asserted on the SOURCE with comments stripped --
     * `sanitize`, `persona/lines` and `share/slug` all use this shape, for the lesson
     * `queries/contract.test.ts` records: a rule that fires on the prose describing
     * the rule is a rule people delete.
     *
     * The moment somebody imports `UserMemory` from `@/lib/db/schema` here "so the
     * types line up", the client fence above stops protecting anything and the
     * structural read that makes this module payload-shape-agnostic is gone with it.
     */
    const raw = readFileSync(join(ROOT, 'lib/account/memoryView.ts'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const sentinel of ["import 'server-only'", 'process.env', '@/lib/db/', 'next/']) {
      expect({ sentinel, present: code.includes(sentinel) }).toEqual({
        sentinel,
        present: false,
      });
    }
    // The stripper must not have eaten the code it is checking.
    expect(code).toContain('export function memoryItems');
  });
```

**Impact:** Two more source-level guards; no runtime change.

---

## Verification

**Build:**
```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
npm run build        # DO NOT SKIP — a green typecheck is not evidence (the TypeScript trap)
```

**Tests:**
```sh
npm test -- memoryView
npm test -- legal
npm test -- clientBoundary
npm test -- prose          # THE CATALOG BYTE CEILING. See below.
npm test -- i18n
npm test                   # the whole unit project
```

**THE ONE MEASUREMENT THIS PHASE MUST TAKE, AND IT IS NOT OPTIONAL.**
`src/lib/i18n/prose.test.ts` caps the serialized catalog at **23,000 bytes**, ~8.7% of headroom over
the 21,161 measured on 2026-08-08, and it says in its own header that the next workstream to add a
screen's worth of keys should meet the test and answer it **in writing**. This phase adds 11 keys ×
2 catalogs plus ~70 bytes of amended notice — an estimated ~800 bytes on `id`, landing near 22.0k.
That should pass, and if it does not, **the answer is shorter copy, never a raised ceiling**: the
hint and the two forget-all labels are where the bytes are, and `account.memory.hint` is the one
string that may not be shortened at the cost of a claim. Report the measured figure in the commit
message either way — `prose.test.ts` prints it.

**Manual check (loop 4, then loop 5):**
1. `npm run dev`, sign in with `POST /api/auth/dev-session`, seed a `user_memory` row by hand
   (`npm run db:studio`) in whichever shape Phase 3 shipped.
2. `curl -sI http://localhost:3001/account` and read the HTML: **the note text must not be in it.**
   That is the property Step 5's test asserts and this is the confirmation.
3. Open `/account`, scroll to *Catatan tentangmu*, press *Lihat catatannya*, delete one row, reload:
   it stays gone. Press *Lupakan semuanya*, confirm, reload: the empty state.
4. Switch to `EN` and repeat: eleven English strings, no key rendered as its own name.
5. `tools/seo/fit.sh`-style width check at 320px on the row: a long unbroken token in a note must
   wrap rather than pushing the *Hapus* button off the edge (`ChatComposer`'s bug).

**Exit criteria:**
- `/account` renders a labelled section that discloses, in the viewer's language, that a language
  model writes notes about the querent from the group chat, and that they can be wrong.
- The note text is **absent from `/account`'s server-rendered HTML** and arrives only in the
  response to a press.
- Deleting one note 200s and it does not come back on reload; deleting everything 200s and leaves
  the empty state.
- A deletion is reflected in the next chat prompt with no further action, because Phase 5 reads the
  row rather than a copy of it.
- `/privacy` declares `2-8` in both locales and `legal.test.ts` asserts authorship, fallibility and
  the location of the control.
- `chat.first_open.notice` names the notes in both locales.
- `npm test`, `npm run typecheck` and `npm run build` are green.

---

## Handoffs

**To Phase 3 — three requirements this phase places on the payload, in priority order:**

1. ~~**`forgetUserMemoryItem` / `clearUserMemory`**~~ — **RECONCILED: both are
   `dismissUserMemoryItems`, which phase 3 ships. The rule this item stated is granted and the
   functions belong in
   `src/lib/db/queries/memory.ts`, not in my routes.** That directory is where the handle-first
   convention and the UUID guard live, and `queries/contract.test.ts` enforces both. If Phase 3
   ships only `getUserMemory` + an upsert, the reconciler should move these two into Phase 3 rather
   than let a route do a read-modify-write.
2. **AN ITEM ID MUST BE DERIVED FROM THE ITEM'S CONTENT — a stable, truncated hash of the
   normalised text — NEVER a random uuid.** A deletion has to survive the next extraction run, and
   the only way a tombstone can recognise a re-extracted fact is if the same fact hashes to the same
   id. `isMemoryItemId` admits a 64-character lowercase slug for exactly this.
3. **THE TOMBSTONE IS A LIST OF IDS AND MUST NEVER HOLD THE TEXT.** A `forgotten: string[]` of
   hashes is an erasure; a `forgotten` list of sentences is the deleted sentence still sitting in
   the row, which is the opposite of what the button says it does. **RECONCILED:
   `dismissUserMemoryItems` does both halves in one statement.** The original note said it should clear
   the tombstones with the payload — a querent who forgets everything is not asking us to keep a
   ledger of what they forgot.

**To Phase 4 — the signal, and what it obliges:**
- A deletion is a **tombstone in the same row**: the item leaves `items` and its id joins
  `forgotten`. **The extractor must never re-mint an item whose id is in `forgotten`**, and that
  check belongs in Phase 4's generator, before the upsert.
- **Known limitation, stated rather than hidden:** an extractor that rewords the same fact produces
  a different hash and therefore a new item, which the tombstone will not catch. That is accepted
  for this release. If it turns out to matter in practice, the fix is a similarity check in Phase
  4's generator, not a text-bearing tombstone here.
- Phase 4 must also decide whether a *forget everything* resets its `input_hash` — if the hash is
  computed over the transcript rather than the payload, an empty row plus an unchanged hash means
  the extractor writes nothing and the memory never comes back at all. That is Phase 4's staleness
  resolver, not mine.

**To Phase 5:** nothing. A deletion is reflected in the next prompt automatically, precisely
because this phase deletes the row's item rather than hiding it behind a flag — which is why there
is no "hidden" state anywhere in this plan.

**Left deliberately undone:**
- **Editing a note** (see Step 0). The follow-up, if Miftah wants it, opens with `moderate()` on the
  submitted text, a `source: 'model' | 'user'` flag in Phase 3's payload that the extractor
  respects, and a length cap — and it is a `POST` route, not a widening of these two.
- **An analytics event.** `events.test.ts`'s ceiling is at its bound and the register's guidance is
  to fold rather than add. Drafted and dropped: `account.memory_viewed` (a look-and-close changes no
  decision — `account.answer_revealed`'s precedent) and `account.memory_forgotten` (the only
  available fold, an `action` prop on `account.answer_changed`, would silently change what months of
  "answers changed" rows mean — the fold that register already refused for `history.item_opened`).
  If an operator needs the number, it lands **beside Phase 4's extractor event**, with the ceiling
  moved **once** and the accounting written down in `events.test.ts`'s register, per its own ritual.
- **A `CHAT_MEMORY_*` kill switch on this surface.** The flag is Phase 4's and gates the model call;
  `sharingEnabled()`'s rule is that a flag never gates the cached read, so with extraction off this
  section still shows and still deletes what exists. Nothing to add.
- **A phone measurement of the row at 320px with a long note.** Loop 4 can measure the width; only
  loop 6 can say whether a twelve-row list under two other blocks reads as a page or as a dump.

---

## Rollback

Revert the commit. There is no schema change, no migration, no environment variable and no flag in
this phase — it is one pure module, two routes, one component, one stylesheet, twenty-two catalog
strings and two documents.

Reverting alone is safe with Phases 3, 4 and 5 still in place: the table keeps filling, the prompt
keeps reading it, and the only thing lost is the querent's ability to see and erase it. **That is
exactly the state this phase exists to prevent, so a revert of this phase alone should be paired
with `CHAT_MEMORY_ENABLED=0`** (Phase 4's flag) until it lands again — storing model-written
inferences about a person with no way to read or delete them is the one configuration this
workstream must not ship.
