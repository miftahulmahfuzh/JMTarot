/**
 * WHAT IS TRANSLATABLE. The leaf of the translation layer.
 *
 * ── WHY THIS IS NOT IN `contract.ts` ─────────────────────────────────────────
 *
 * V2's plan puts the registry in `contract.ts` alongside the prompt. That works
 * until `src/lib/db/queries/translations.ts` needs `TRANSLATABLE_ENTITIES` for its
 * unknown-entity sweep — and `contract.ts` imports `@/lib/prompt/base`, which
 * begins with `import 'server-only'`. So a query module would transitively acquire
 * the marker, which is exactly what `queries/contract.test.ts` rule 3 exists to
 * prevent: those modules run in `scripts/db-seed.ts` and in Vitest, and neither has
 * a React runtime. It would not have failed today — the test checks direct imports
 * and W7's vitest config aliases the package away — which is precisely what makes
 * it worth splitting rather than leaving.
 *
 * Same shape as `i18n/locale.ts` against `i18n/resolve.ts`: the dependency-free
 * leaf that the schema, the edge and the scripts can all reach, with the heavy
 * module layered on top. `contract.ts` re-exports everything here, so the interface
 * V2's plan declares is unchanged and callers do not have to know which file a name
 * lives in.
 *
 * DELIBERATELY DEPENDENCY-FREE. No prompt layer, no database, no React, no
 * `server-only`. If something here starts needing one of those, it belongs in
 * `contract.ts`.
 */

/**
 * TWO ENTITIES, NOT FOUR (reconciliation §5.1).
 *
 * Roadmap §4 listed `daily_summary` and `frequency_verdict` too. Both are already
 * keyed by locale in their own unique constraints, so a language switch there is an
 * ordinary cache miss followed by a regeneration IN the target language — one model
 * call, exactly what a translation would have cost, and better prose than
 * translating a 45-word greeting could be. That is VD6's own argument about
 * `lotus_avatars.summary`, which reaches two more tables than VD6 noticed.
 *
 * `readings` cannot regenerate: VD7 makes the prose immutable, because it IS the
 * artifact and because `readings.locale` is the analytics dimension saying which
 * prompt fork produced it. `personas.user_id` is a primary key with one `locale`
 * column, so a switch there would overwrite rather than sit beside.
 */
export type TranslatableEntity = 'reading' | 'persona';

export type TranslatableField = 'body' | 'gist';

export const TRANSLATABLE_ENTITIES = ['reading', 'persona'] as const satisfies
  readonly TranslatableEntity[];

export type FieldSpec = {
  /**
   * T1. DOES THE SOURCE ARTIFACT STREAM? THEN SO DOES ITS TRANSLATION.
   *
   * Decided per FIELD rather than per route, which is what keeps W5's reasoning
   * intact instead of overriding it by accident: `DaySummary` streams while
   * `FrequencyLine` does not, and that was decided on the shape of each artifact
   * rather than for consistency. A translation has exactly the shape of the thing
   * it translates.
   */
  stream: boolean;
  /**
   * Does the source have a reader whose voice rules must be carried?
   *
   * The persona is FALSE and that is VD16, not an oversight: it is house voice,
   * reader-agnostic, a fact about the querent rather than a reading. Handing it a
   * reader's block would make it a fourth reading.
   */
  voiced: boolean;
  /**
   * Which ceiling applies. Resolved by `ceilingFor` in `contract.ts`.
   *
   * **A TAG AND NOT A NUMBER**, because this module is deliberately dependency-free —
   * the real ceilings live in `@/lib/prompt/budget` and `@/lib/persona/prompt`, both of
   * which carry prompt prose, and `queries/translations.ts` imports this file.
   */
  budget: 'service' | 'summary' | 'gist' | 'persona';
};

/**
 * THE KEY SET IS THIS OBJECT, and `TranslatableKey` is derived FROM it rather than
 * the other way round.
 *
 * V2's plan declares `TranslatableKey = \`${TranslatableEntity}.${TranslatableField}\``
 * and `TRANSLATABLE: Record<TranslatableKey, FieldSpec>`. That is a cross product,
 * and it demands a `'persona.gist'` — an entry with no artifact behind it, since a
 * persona has no gist and never will. Satisfying the type would have meant inventing
 * a spec for a field that cannot be requested; loosening it to a `Partial<>` would
 * have made every lookup possibly-undefined and pushed a runtime check onto every
 * caller.
 *
 * So the registry is the source of truth and the union is `keyof typeof`. The
 * exported names are unchanged, `isTranslatableKey` still guards the boundary, and a
 * key that is not here is not a key — which is what the plan meant.
 */
export const TRANSLATABLE = {
  'reading.body': { stream: true, voiced: true, budget: 'service' },
  /*
   * NOT STREAMED, and it is the one field with no screen behind it: the gist is
   * PROMPT INPUT for a later reading's `<riwayat>` block. Nobody watches it arrive
   * because nobody sees it at all.
   */
  'reading.gist': { stream: false, voiced: false, budget: 'gist' },
  /*
   * **`budget: 'persona'` AND NOT `'summary'`, AND THE `'summary'` HERE WAS A LATENT
   * BUG THAT MADE EVERY PERSONA TRANSLATION FAIL** (found live 2026-07-28, the day
   * `PersonaBlockClient` became the first caller).
   *
   * `'summary'` resolves to `SUMMARY_MAX_WORDS`, which is **50** — the day-summary
   * ceiling. A persona is `PERSONA_MAX_WORDS`, which is **95**. `ceilingFor` feeds
   * BOTH the prompt and `verifyTranslation`, so the model was told to translate a
   * 95-word paragraph into at most 50 words and then judged against 50: it cannot be
   * faithful and compliant at once. Measured on a real persona — a correct English
   * translation came back at 88 words and was rejected `kind: 'budget'`, so nothing
   * was ever persisted and every single page view paid a fresh model call.
   *
   * **IT WAS INVISIBLE BECAUSE NOTHING TRANSLATED A PERSONA FOR TWO RELEASES.** The
   * registry entry, the resolver arm and the sweep arm were all written by V2 against
   * a table V8 had not built yet, and a registry line that is never resolved is a
   * guess nobody checks. `contract.test.ts` now asserts the resolved number.
   */
  'persona.body': { stream: true, voiced: false, budget: 'persona' },
} as const satisfies Record<string, FieldSpec>;

export type TranslatableKey = keyof typeof TRANSLATABLE;

export function isTranslatableKey(v: unknown): v is TranslatableKey {
  return typeof v === 'string' && Object.hasOwn(TRANSLATABLE, v);
}

/**
 * Bumped BY HAND when the prompt changes in a way that should invalidate cached
 * rows. Not a hash.
 *
 * `MEMORY_PROMPT_VERSION`'s reasoning exactly. `readings.prompt_version` is a hash
 * because a reading's prompt is three independently-changing layers and nobody would
 * remember to bump a constant; the translation prompt is one function in one file,
 * and `translations.prompt_version` is read to decide whether a CACHED row is stale.
 * A hash would invalidate every translation in the table on a whitespace edit.
 */
export const TRANSLATION_PROMPT_VERSION = 'translate-v1';
