/**
 * THE FACADE. `base.ts` -> `base.{id,en}.ts`'s shape, applied to F5's one table of
 * prose.
 *
 * **A `Record<Locale, …>` SO A MISSING LOCALE IS A COMPILE ERROR** rather than
 * `undefined` handed to a model — which does not throw, and produces a fluent run
 * generated with no material at all (`CLAUDE.md`, `## The prompt`). The same reasoning
 * makes `MaterialNotes` a mapped type over `MaterialKind`: a seventh material cannot
 * ship without a note in both languages.
 *
 * **PURE, AND DELIBERATELY THE ONLY PROMPT PROSE IN `proactive/**`.** Everything else
 * this workstream writes is a predicate, a query or a key. `clientBoundary.test.ts`
 * fences the directory with this file, `material.ts` and `eligibility.ts` as the
 * declared pure exceptions, and `scripts/audit-secrets.ts` derives its needles from
 * `src/lib/chat/**`, so these strings are covered by the build's own tripwire.
 */
import type { Locale } from '@/data/types';
import type { Material, MaterialKind } from './material';
import { MATERIAL_NOTES_EN } from './notes.en';
import { MATERIAL_NOTES_ID } from './notes.id';

/**
 * One renderer per kind, narrowed to its own member of the union — so a note for
 * `occasion` can branch on the occasion and a note for `reading` cannot accidentally
 * reach for a field only `lotus` has.
 */
export type MaterialNotes = {
  [K in MaterialKind]: (m: Extract<Material, { kind: K }>) => string;
};

export const MATERIAL_NOTES: Record<Locale, MaterialNotes> = {
  id: MATERIAL_NOTES_ID,
  en: MATERIAL_NOTES_EN,
};
