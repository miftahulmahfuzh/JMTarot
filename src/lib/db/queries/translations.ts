/**
 * `translations`. A new read concern (V2).
 *
 * EVERY RULE IN `profile.ts`'s HEADER BINDS, and `contract.test.ts` enforces the
 * sharpest one mechanically. Two consequences worth stating before anyone adds a
 * line:
 *
 *   NO ARROW-FUNCTION EXPORTS. The contract test's regex is
 *   `export\s+(?:async\s+)?function\s+(\w+)\s*\(\s*(\w+)`, so
 *   `export const getTranslation = async (db, …)` slips past it entirely — which
 *   means it is UNCHECKED, not allowed. Declarations only.
 *
 *   NOTHING STATEFUL LIVES HERE. Same wall W3 hit with the Lotus cache and W5 hit
 *   with `windowBounds`: a function with no handle to take does not belong in this
 *   directory. `TRANSLATABLE`, the invariant checker and the prompt are all in
 *   `@/lib/translate/contract`.
 *
 * ── WHY `to_regclass` GUARDED THE PERSONA ARMS, AND WHICH ONE STILL NEEDS IT ──
 *
 * `personas` was V8's table and V2 landed first. Without the guard there were two bad
 * options: leave `persona` out of the registry, in which case the unknown-entity arm
 * of `deleteOrphanTranslations` deletes every persona translation the moment V8
 * ships one; or leave it in with no orphan check, in which case V8 has to remember
 * to come back. The guard meant the entity was in the registry from day one, its arms
 * were written from day one, and they simply did nothing until the table existed.
 *
 * **V8 SHIPPED THE TABLE, SO ONE OF THE TWO GUARDS IS GONE.** `resolvePersona` is an
 * ordinary query-builder select now, because 2026-07-28 put it on the request path of
 * a language switch (`PersonaBlockClient` translates the persona) and a probe round
 * trip there costs a querent latency to insure against a migration that has run.
 * **`deleteOrphanTranslations` KEEPS ITS GUARD, and for a different reason** — its is
 * about Postgres resolving relations at parse time inside one statement, which was
 * never about whether V8 shipped. Its header has the detail. Do not "finish the job"
 * by deleting that one too.
 */
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import type { Locale, ReaderId, ServiceId } from '@/data/types';
/*
 * `@/lib/translate/keys` AND NOT `@/lib/translate/contract`, WHICH IS THE SAME
 * NAMES FROM THE SAME LAYER AND A COMPLETELY DIFFERENT DEPENDENCY GRAPH.
 *
 * `contract.ts` imports `@/lib/prompt/base`, which carries `import 'server-only'`,
 * so importing the registry from there gives this module the marker transitively —
 * exactly what rule 3 of `profile.ts`'s header forbids, because these modules run in
 * `scripts/db-seed.ts` and in Vitest and neither has a React runtime. `keys.ts` is
 * the dependency-free leaf that exists for this import.
 * `contract.test.ts`'s transitive check is what keeps it honest.
 */
import {
  TRANSLATABLE_ENTITIES,
  type TranslatableEntity,
  type TranslatableField,
} from '@/lib/translate/keys';
import type { DbOrTx } from '../types';
import { personas, readings, translations, type NewTranslation, type Translation } from '../schema';

export type TranslationKey = {
  entity: TranslatableEntity;
  entityId: string;
  field: TranslatableField;
  /** The locale translated INTO. The other three plus this are the unique key. */
  locale: Locale;
};

export async function getTranslation(
  db: DbOrTx,
  key: TranslationKey,
): Promise<Translation | null> {
  const [row] = await db
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.entity, key.entity),
        eq(translations.entityId, key.entityId),
        eq(translations.field, key.field),
        eq(translations.locale, key.locale),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Insert or update one translation.
 *
 * `updatedAt: new Date()` IS SET BY HAND AND MUST STAY THAT WAY. Drizzle's
 * `$onUpdate()` applies to `db.update()` and does NOT fire inside
 * `onConflictDoUpdate` — and for this table that column is the ENTIRE staleness
 * mechanism (a translation is stale iff `updated_at < source.updated_at`). Drop the
 * line and the column freezes at the first insert, every regenerated source serves
 * its first translation forever, and nothing about it looks wrong.
 *
 * NOBODY CALLS THIS DIRECTLY except `translateOrCached`. It is the only place
 * verification happens, and an unverified row in this table is precisely the failure
 * the whole prompt-hardening story exists to prevent.
 */
export async function putTranslation(
  db: DbOrTx,
  input: NewTranslation,
): Promise<Translation> {
  const [row] = await db
    .insert(translations)
    .values(input)
    .onConflictDoUpdate({
      target: [
        translations.entity,
        translations.entityId,
        translations.field,
        translations.locale,
      ],
      set: {
        body: input.body,
        sourceLocale: input.sourceLocale,
        model: input.model,
        promptVersion: input.promptVersion,
        // BY HAND. See the header above this function.
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/**
 * Every translation of one artifact, gone. Returns how many.
 *
 * V7 calls it when a share link's artifact is deleted and V8 calls it inside the
 * account-deletion transaction — translations have no FK, so the `users` cascade does
 * NOT reach them, and without this call a deleted account's translated prose survives
 * until the next nightly sweep.
 */
export async function deleteTranslationsFor(
  db: DbOrTx,
  entity: TranslatableEntity,
  entityId: string,
): Promise<number> {
  const rows = await db
    .delete(translations)
    .where(and(eq(translations.entity, entity), eq(translations.entityId, entityId)))
    .returning({ id: translations.id });
  return rows.length;
}

/**
 * The daily sweep's fourth delete: rows whose artifact is gone, and rows whose
 * entity means nothing.
 *
 * `entity_id` has no foreign key — Postgres cannot declare a polymorphic one — so
 * this is the price of the one generic table. It is one statement per entity plus a
 * final arm for values that are not in the registry at all: an entity nothing can
 * resolve would otherwise accumulate forever.
 *
 * ── THE `to_regclass` GUARD CANNOT LIVE INSIDE THE STATEMENT ─────────────────
 *
 * V2's plan §8 sketches it as a WHERE clause:
 *
 *     delete from translations t
 *      where t.entity = 'persona'
 *        and to_regclass('public.personas') is not null
 *        and not exists (select 1 from personas p where p.user_id = t.entity_id)
 *
 * THAT DOES NOT WORK. Postgres resolves every relation named in a statement at
 * PARSE time, before any predicate is evaluated, so the `not exists` subquery
 * raises `relation "personas" does not exist` and the guard beside it never runs.
 * The guard has to decide whether the statement is ISSUED, which means it is a
 * separate round trip from the app. Two cheap queries against `to_regclass`, once
 * a night, is the whole cost.
 */
export async function deleteOrphanTranslations(db: DbOrTx): Promise<number> {
  let deleted = 0;

  /*
   * `readings.id` for a reading; `personas.user_id` for a persona — V8 keys that
   * table on the user, per VD15, so the entity id IS the user id. If V8 keys it on
   * a surrogate `id` instead, this is the one line that changes.
   */
  const ARMS: ReadonlyArray<{ entity: TranslatableEntity; table: string; column: string }> = [
    { entity: 'reading', table: 'readings', column: 'id' },
    { entity: 'persona', table: 'personas', column: 'user_id' },
  ];

  for (const arm of ARMS) {
    // The guard, as its own statement. See the header above.
    if (!(await tableExists(db, arm.table))) continue;

    /*
     * `sql.raw` because a relation name is not a bind parameter. Safe: both values
     * are literals in the array above and never anything a caller supplies.
     */
    const rows = await db.execute(sql`
      delete from ${translations} t
       where t.entity = ${arm.entity}
         and not exists (
           select 1 from ${sql.raw(`public.${arm.table}`)} a
            where a.${sql.raw(arm.column)} = t.entity_id
         )
    `);
    deleted += countOf(rows);
  }


  /*
   * The final arm. An entity that is not in the registry can never be resolved by
   * anything, so the row is dead weight with a body in it.
   */
  const rows = await db
    .delete(translations)
    .where(sql`${translations.entity} not in ${TRANSLATABLE_ENTITIES}`)
    .returning({ id: translations.id });

  return deleted + rows.length;
}

/** `db.execute` reports affected rows on a driver-specific shape. */
function countOf(rows: unknown): number {
  return (rows as { count?: number }).count ?? 0;
}

/**
 * Does a relation exist? **`deleteOrphanTranslations` IS NOW THE ONLY CALLER**, which
 * is why this sits beside it rather than at the bottom of the file.
 *
 * `resolvePersona` used to call it too and no longer does: V8 built `personas`, and
 * that function is now on the request path of a language switch, so a probe round trip
 * there was cost with nothing left to buy. The sweep keeps it for a reason that is
 * about SQL rather than about V8 — see `deleteOrphanTranslations`'s header — so
 * deleting it along with the other call site would have broken the nightly job.
 */
async function tableExists(db: DbOrTx, table: string): Promise<boolean> {
  const rows = (await db.execute(
    sql`select to_regclass(${`public.${table}`}) is not null as present`,
  )) as unknown as Array<{ present: boolean }>;
  return rows[0]?.present === true;
}

export type ResolvedTranslatable = {
  /** The source prose. Never null and never empty — a missing body resolves to null. */
  body: string;
  sourceLocale: Locale;
  /**
   * What `translations.updated_at` is compared against to decide staleness.
   *
   * For a reading this is `created_at`, because VD7 makes the prose immutable and
   * the row has no `updated_at` at all. That is not a shortcut: an immutable source
   * cannot go stale, so its creation time is the correct and permanent comparand.
   */
  sourceUpdatedAt: Date;
  /** Null for the persona, which is house voice (VD16). */
  readerId: ReaderId | null;
  serviceId: ServiceId | null;
};

/**
 * Resolve what is to be translated, AND that the caller owns it (T9).
 *
 * "DOES NOT EXIST" AND "NOT YOURS" ARE THE SAME ANSWER — null — and the route turns
 * both into a 404. Distinguishing them would confirm the uuid exists, which is the
 * reasoning V7 applies to share slugs; and without the check at all, POST a uuid and
 * `/api/translate` hands you somebody else's reading in your language.
 *
 * THE OWNERSHIP FILTER IS IN THE SAME STATEMENT, never fetch-then-compare. The
 * second shape is one refactor away from not comparing, and the refactor looks like
 * a tidy-up.
 */
export async function resolveTranslatable(
  db: DbOrTx,
  args: {
    entity: TranslatableEntity;
    entityId: string;
    field: TranslatableField;
    userId: string;
  },
): Promise<ResolvedTranslatable | null> {
  if (args.entity === 'reading') {
    const column = args.field === 'gist' ? readings.gist : readings.body;
    const [row] = await db
      .select({
        body: column,
        sourceLocale: readings.locale,
        sourceUpdatedAt: readings.createdAt,
        readerId: readings.readerId,
        serviceId: readings.serviceId,
      })
      .from(readings)
      .where(
        and(
          eq(readings.id, args.entityId),
          eq(readings.userId, args.userId),
          isNotNull(column),
        ),
      )
      .limit(1);

    if (!row?.body) return null;
    return { ...row, body: row.body };
  }

  return resolvePersona(db, args);
}

/**
 * The persona arm.
 *
 * **THE `to_regclass` GUARD AND THE RAW SQL ARE BOTH GONE, AND THIS FILE TOLD THE
 * NEXT PERSON TO DELETE THEM.** It said: *"Raw SQL rather than the query builder for
 * one reason: `schema.ts` has no `personas` table yet … When V8 adds it this becomes
 * an ordinary select and the guard can go — but not before."* V8 added the table, and
 * 2026-07-28 put this function on a live path for the first time — `PersonaBlockClient`
 * now posts here on a language switch — so the guard had stopped being free insurance
 * and become a wasted round trip on something a querent is waiting for.
 *
 * `deleteOrphanTranslations`'s `to_regclass` guards STAY. That is not an
 * inconsistency: the guard there is inside one statement over several tables and its
 * header records a real SQL evaluation-order reason, which has nothing to do with
 * whether V8 shipped.
 *
 * **`entityId` IS A `users.id`, NOT AN ARTIFACT ID**, because `personas.user_id` is
 * the primary key — one persona per person. That is why the `where` reads as a
 * tautology: `entityId` is what the caller asked for and `userId` is who is asking,
 * and they are compared to the same column precisely so a request for somebody
 * else's persona resolves to null instead of to their prose (T9). Do not "simplify"
 * either half away.
 *
 * `field` is not read: the persona has exactly one translatable field, `body`, and
 * the registry is what enforces that. A `persona.gist` is not a key.
 */
async function resolvePersona(
  db: DbOrTx,
  args: { entityId: string; userId: string },
): Promise<ResolvedTranslatable | null> {
  const [row] = await db
    .select({
      body: personas.body,
      sourceLocale: personas.locale,
      sourceUpdatedAt: personas.updatedAt,
    })
    .from(personas)
    .where(and(eq(personas.userId, args.entityId), eq(personas.userId, args.userId)))
    .limit(1);

  if (!row?.body) return null;
  return {
    body: row.body,
    sourceLocale: row.sourceLocale,
    sourceUpdatedAt: row.sourceUpdatedAt,
    /* VD16: house voice. There is no reader and no service. */
    readerId: null,
    serviceId: null,
  };
}

/**
 * Which of a set of readings already has a translation of its gist in one locale.
 *
 * For W5's chain block (T12): the reading path prefers a cached translation and
 * NEVER waits on a model call. One `in` over at most `MEMORY_CHAIN_COUNT` ids, which
 * is 2, served by `translations_entity_lookup_idx`.
 */
export async function gistTranslations(
  db: DbOrTx,
  readingIds: readonly string[],
  locale: Locale,
): Promise<Map<string, string>> {
  if (readingIds.length === 0) return new Map();

  const rows = await db
    .select({ entityId: translations.entityId, body: translations.body })
    .from(translations)
    .where(
      and(
        eq(translations.entity, 'reading'),
        eq(translations.field, 'gist'),
        eq(translations.locale, locale),
        inArray(translations.entityId, [...readingIds]),
      ),
    );

  return new Map(rows.map((r) => [r.entityId, r.body]));
}
