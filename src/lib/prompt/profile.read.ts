import 'server-only';

import { db } from '@/lib/db/client';
import { getUserMemory } from '@/lib/db/queries/memory';
import { selectProfileNotes } from './profile';

/**
 * The reading route's read of R2's `user_memory` (card #34).
 *
 * SEPARATE FROM `profile.ts` FOR `lotus.generate.ts`'s REASON: that file holds the
 * database and the model, `lotus.ts` holds the pure renderer, and the split is what
 * lets `profile.test.ts` cover the selection policy and the fence with no Docker and
 * no `server-only` shim. Everything in here needs a database; nothing in there does.
 *
 * NO CACHE, DELIBERATELY, AND IT IS THE ONE PLACE THIS DIFFERS FROM `getLotusBlock`.
 * That function caches for sixty seconds and its header argues the case: a block one
 * minute stale is invisible. It does not hold here, because the thing that changes
 * this row is the QUERENT PRESSING DELETE on `/account`, and `queries/memory.ts` rule
 * 3 already ruled on exactly this: *"a cache that served a just-deleted item back
 * into a prompt would be the delete button lying through a second door."* One indexed
 * primary-key lookup per reading is the price of that, and it is small next to the
 * model call it precedes.
 */

/**
 * `READING_PROFILE_ENABLED`. Only the exact string `'0'` disables.
 *
 * ── WHY IT IS NOT IN `src/lib/llm/flags.ts` ─────────────────────────────────
 *
 * That file is *"the features that may be switched off to stop reaching a model, and
 * nothing else"*, `flagCoverage.test.ts` asserts its set is exactly its two tables,
 * and **the reading has no flag by rule** — `flags.test.ts` asserts `READING_ENABLED`
 * appears nowhere in it, because switching the reading off does not degrade JMTarot,
 * it ends it. A flag here would either breach that test or read as *"readings off"*,
 * and both are worse than the variable living where its feature does.
 *
 * What this gates is whether a BLOCK OF MATERIAL is assembled, which is
 * `CHAT_ANSWERS_ENABLED`'s shape exactly: env-only, in the feature's own module
 * (`chat/model.ts`), never in `flags.ts`. That variable exists as C-D8's reversal —
 * a way to stop sending the six answers into the room without a prompt-layer
 * redeploy — and this is the same need one surface over. **`/privacy` now describes
 * this behaviour, so the ability to stop it in one dashboard edit is part of what
 * makes that description safe to publish.**
 *
 * `!== '0'` is `ANALYTICS_ENABLED`'s rule and it defaults ON: a typo must not
 * silently cost every querent a feature with nothing anywhere reporting it.
 */
export function readingProfileEnabled(): boolean {
  return process.env.READING_PROFILE_ENABLED !== '0';
}

/**
 * The notes for one reading. `[]` IS NORMAL AND IS NOT AN ERROR.
 *
 * Four ways to reach empty and all four are ordinary: the querent has never opened
 * the chat, they have deleted everything on `/account`, the extractor has not run
 * yet, or the flag is off. All four produce exactly the reading an un-chatted querent
 * gets, which is the reading this app shipped for its whole life before this card.
 *
 * THE FLAG IS CHECKED BEFORE THE READ, so `READING_PROFILE_ENABLED=0` costs zero
 * queries rather than one wasted one.
 *
 * A DATABASE HICCUP MUST NOT COST THE USER THEIR READING — `getLotusBlock` and
 * `recallChain`'s rule, and the reason both of them swallow. Returns `[]` rather
 * than throwing.
 */
export async function getProfileNotes(userId: string): Promise<string[]> {
  if (!readingProfileEnabled()) return [];

  try {
    const row = await getUserMemory(db, userId);
    return row ? selectProfileNotes(row.items) : [];
  } catch (err) {
    /*
     * SQLSTATE AND THE ERROR'S CLASS, NEVER THE ERROR — CLAUDE.md's *"never log a
     * driver error from any path that runs a query"*, whose audit question is
     * *"which of my bound parameters came from a person"*.
     *
     * **HERE THE ANSWER IS NONE OF THEM**, and that is worth writing down rather
     * than leaving for the next reader to re-derive: `getUserMemory` binds exactly
     * one parameter, a uuid. So a driver error on this path could be printed whole
     * without leaking anything. It is still not printed whole, because the audit is
     * about the query as it stands today and `queries/memory.ts` is one column away
     * from binding a note — and a `catch` that was safe when it was written is
     * exactly the shape that becomes a leak silently.
     */
    if (process.env.NODE_ENV !== 'production') {
      console.error('[profile] user_memory read failed', err);
    } else {
      const code = (err as { code?: unknown })?.code;
      console.error('[profile] user_memory read failed', {
        name: err instanceof Error ? err.name : typeof err,
        sqlstate: typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : null,
      });
    }
    return [];
  }
}
