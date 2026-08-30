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
