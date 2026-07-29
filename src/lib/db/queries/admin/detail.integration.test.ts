/**
 * `detail.ts` against a real Postgres. v0.5.0 / A5, task 2.
 *
 * **REQUIRED RATHER THAN THOROUGH, AND `answersUpdatedAt` IS WHY.** V8 typed a
 * `max(timestamptz)` as `sql<Date>`, the compiler believed it, and postgres.js returned a
 * STRING — so `personaStaleness` compared a string to a Date with `>`, which coerces and
 * answers *something*. **Every answer edit was judged wrongly with a green typecheck and a
 * green unit suite.** Only an integration test calling `.getTime()` saw it.
 *
 * So every assertion below that touches a timestamp asserts the JavaScript TYPE, not just
 * the value, and `answersLastChanged` — the one raw aggregate in that file — is asserted
 * with `instanceof Date` and `.getTime()`.
 *
 * The second subject of this file is **ownership as a predicate** (A5-16): every function
 * is asked for a second user's row and must return `[]` or `null`. The failure mode is not
 * a 403 — it is the wrong person's data under the right person's URL.
 */
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  dailySummaries,
  events,
  frequencyVerdicts,
  lotusAvatars,
  onboardingAnswers,
  personas,
  readings,
  shareLinks,
  translations,
  users,
} from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import {
  answerStatesForAdmin,
  answersLastChanged,
  dailySummariesForAdmin,
  eventsForAdmin,
  frequencyVerdictsForAdmin,
  lotusForAdmin,
  shareLinksForAdmin,
  translationsForAdmin,
  userIdentityForAdmin,
  adminEmailsByIds,
} from './detail';

afterAll(closeTestDb);

let n = 0;

async function seedUser(tx: Tx, tag: string): Promise<string> {
  n += 1;
  const [row] = await tx
    .insert(users)
    .values({
      googleSub: `a5detail:${tag}:${n}`,
      email: `a5-${tag}-${n}@example.com`,
      displayName: `A5 ${tag}`,
      locale: 'id',
    })
    .returning({ id: users.id });
  return row.id;
}

async function seedReading(tx: Tx, userId: string, over: Record<string, unknown> = {}) {
  const [row] = await tx
    .insert(readings)
    .values({
      userId,
      readerId: 'thessaly',
      serviceId: 'daily',
      locale: 'id',
      question: 'apa kabar hari ini',
      status: 'ok',
      body: 'satu paragraf',
      gist: 'ringkas',
      model: 'glm-4.6',
      promptVersion: 'p1',
      localDate: '2026-07-20',
      ...over,
    })
    .returning({ id: readings.id });
  return row.id;
}

describe('userIdentityForAdmin -- every column, and no deleted_at filter (R29)', () => {
  it('returns a SOFT-DELETED user, which is the whole point', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx, 'gone');
      await tx.execute(sql`update users set deleted_at = now() where id = ${id}`);

      const row = await userIdentityForAdmin(tx, id);
      expect(row).not.toBeNull();
      // If this ever fails, `getUserById`'s `isNull(deletedAt)` has been reused here and
      // the thirty-day restore window has become invisible.
      expect(row!.deletedAt).toBeInstanceOf(Date);
      expect(row!.createdAt).toBeInstanceOf(Date);
      expect(row!.lastSeenAt).toBeInstanceOf(Date);
    }));

  it('resolves locale_source through the helper, so NULL reads as chosen', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx, 'nullsrc');
      const row = await userIdentityForAdmin(tx, id);
      // NULL means `'chosen'`. `raw ?? 'default'` is what a reasonable person writes
      // without `effectiveLocaleSource`, and it would tell the operator that a preference
      // nobody set can be overwritten -- for every pre-v0.3.0 row.
      expect(row!.localeSource).toBe('chosen');
    }));

  it('is null for a malformed uuid rather than raising 22P02 (A5-17)', () =>
    withRollback(async (tx) => {
      expect(await userIdentityForAdmin(tx, 'banana')).toBeNull();
      expect(await userIdentityForAdmin(tx, '')).toBeNull();
    }));
});

describe('answerStatesForAdmin -- presence, in catalog order, decrypting nothing', () => {
  it('tells asked / answered / skipped apart and carries updated_at', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx, 'answers');
      await tx.insert(onboardingAnswers).values([
        { userId: id, questionKey: 'best_thing', answerText: 'v1.aaa.bbb.ccc' },
        { userId: id, questionKey: 'worst_thing', skipped: true },
        { userId: id, questionKey: 'color', answerChoice: 'black' },
      ]);

      const states = await answerStatesForAdmin(tx, id);
      // CATALOG order, not row order.
      expect(states.map((s) => s.key)).toEqual([
        'best_thing',
        'worst_thing',
        'most_loved',
        'introversion',
        'color',
        'willow_wish',
      ]);

      const by = new Map(states.map((s) => [s.key, s]));
      expect(by.get('best_thing')).toMatchObject({ asked: true, answered: true, hasText: true });
      expect(by.get('worst_thing')).toMatchObject({ asked: true, answered: false, skipped: true });
      expect(by.get('color')).toMatchObject({ asked: true, answered: true, hasText: false });
      expect(by.get('most_loved')).toMatchObject({ asked: false, answered: false });

      // `sql<boolean>` wrapped in `Boolean(...)`: a real boolean under `typeof`, not the
      // string `'t'`.
      expect(typeof by.get('best_thing')!.hasText).toBe('boolean');
      expect(by.get('best_thing')!.updatedAt).toBeInstanceOf(Date);
      expect(by.get('most_loved')!.updatedAt).toBeNull();
    }));

  it('returns NO ciphertext and no answer_text key at all (A5-9)', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx, 'cipher');
      await tx
        .insert(onboardingAnswers)
        .values({ userId: id, questionKey: 'worst_thing', answerText: 'v1.iv.ct.tag' });

      const states = await answerStatesForAdmin(tx, id);
      const row = states.find((s) => s.key === 'worst_thing')!;
      expect('answerText' in row).toBe(false);
      expect('text' in row).toBe(false);
      // The whole object, serialised, must not contain a v1 envelope.
      expect(JSON.stringify(states)).not.toContain('v1.');
    }));
});

describe('answersLastChanged -- the aggregate V8 got wrong', () => {
  it('is a real Date and answers .getTime()', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx, 'agg');
      await tx
        .insert(onboardingAnswers)
        .values({ userId: id, questionKey: 'best_thing', answerText: 'v1.a.b.c' });

      const at = await answersLastChanged(tx, id);
      // **THE ASSERTION THAT WOULD HAVE CAUGHT V8's BUG.** `sql<Date>` would pass a
      // `toBeTruthy()` and fail this.
      expect(at).toBeInstanceOf(Date);
      expect(Number.isFinite(at!.getTime())).toBe(true);
    }));

  it('is null for a user with no answers', () =>
    withRollback(async (tx) => {
      expect(await answersLastChanged(tx, await seedUser(tx, 'noagg'))).toBeNull();
    }));
});

describe('ownership is a predicate, not an assertion afterwards (A5-16)', () => {
  it('returns nothing about a user for the OTHER user id', () =>
    withRollback(async (tx) => {
      const mine = await seedUser(tx, 'mine');
      const theirs = await seedUser(tx, 'theirs');

      await tx.insert(lotusAvatars).values({
        userId: theirs,
        summary: { id: 'ringkas', en: 'brief' },
        traits: { color: 'black', introversion: 50 },
        sourceVersion: 1,
        inputHash: 'hash',
        model: 'glm-4.6',
      });
      await tx.insert(dailySummaries).values({
        userId: theirs,
        readerId: 'thessaly',
        localDate: '2026-07-20',
        locale: 'id',
        body: 'ringkasan',
        sourceReadingIds: [],
        promptVersion: 'p1',
      });
      await tx.insert(frequencyVerdicts).values({
        userId: theirs,
        windowKey: 'w',
        locale: 'id',
        fingerprint: 'fp',
        topCardId: 1,
        secondCardId: 2,
        body: 'verdict',
        model: 'glm-4.6',
        promptVersion: 'p1',
      });
      await tx.insert(shareLinks).values({
        slug: `slug${n}`,
        userId: theirs,
        entity: 'reading',
        entityId: await seedReading(tx, theirs),
      });
      await tx
        .insert(events)
        .values({ userId: theirs, name: 'reading.completed', localDate: '2026-07-20' });

      expect(await lotusForAdmin(tx, mine)).toBeNull();
      expect(await dailySummariesForAdmin(tx, mine)).toEqual([]);
      expect(await frequencyVerdictsForAdmin(tx, mine)).toEqual([]);
      expect(await shareLinksForAdmin(tx, mine)).toEqual([]);
      expect(await eventsForAdmin(tx, mine)).toEqual([]);
      expect(await translationsForAdmin(tx, mine)).toEqual([]);

      // And each returns the OWNER's row, so the emptiness above is a predicate and not a
      // broken query.
      expect(await lotusForAdmin(tx, theirs)).not.toBeNull();
      expect(await dailySummariesForAdmin(tx, theirs)).toHaveLength(1);
      expect(await frequencyVerdictsForAdmin(tx, theirs)).toHaveLength(1);
      expect(await shareLinksForAdmin(tx, theirs)).toHaveLength(1);
      expect(await eventsForAdmin(tx, theirs)).toHaveLength(1);
    }));
});

describe('shareLinksForAdmin -- live is derived, NULL locale is as-written', () => {
  it('derives live from revoked_at and keeps a NULL locale NULL', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx, 'share');
      /*
       * TWO readings, not one. `share_links` carries
       * `unique nulls not distinct (user_id, entity, entity_id, locale)` -- V7's clause,
       * whose whole purpose is that a legacy `locale = NULL` row still collides -- so two
       * links for one reading with no locale pin raise `23505` by design.
       */
      const kept = await seedReading(tx, id);
      const revoked = await seedReading(tx, id);
      await tx.insert(shareLinks).values([
        { slug: `live${n}`, userId: id, entity: 'reading', entityId: kept },
        {
          slug: `dead${n}`,
          userId: id,
          entity: 'reading',
          entityId: revoked,
          revokedAt: new Date(),
        },
      ]);

      const rows = await shareLinksForAdmin(tx, id);
      expect(rows).toHaveLength(2);
      const live = rows.find((r) => r.revokedAt === null)!;
      const dead = rows.find((r) => r.revokedAt !== null)!;
      expect(live.live).toBe(true);
      expect(dead.live).toBe(false);
      // NULL means as-written and must not be defaulted to a locale by the query.
      expect(live.locale).toBeNull();
    }));
});

describe('translationsForAdmin -- both arms, and the staleness comparand differs', () => {
  it('matches a reading row through the user, and a persona row through user_id', () =>
    withRollback(async (tx) => {
      const mine = await seedUser(tx, 'tr-mine');
      const theirs = await seedUser(tx, 'tr-theirs');
      const myReading = await seedReading(tx, mine);
      const theirReading = await seedReading(tx, theirs);

      await tx.insert(personas).values({
        userId: mine,
        body: 'sosok',
        locale: 'id',
        facts: {},
        inputHash: 'h',
        sourceVersion: 1,
        model: 'glm-4.6',
        promptVersion: 'p1',
      });

      await tx.insert(translations).values([
        {
          entity: 'reading',
          entityId: myReading,
          field: 'body',
          sourceLocale: 'id',
          locale: 'en',
          body: 'mine translated',
          model: 'glm-4.6',
          promptVersion: 'translate-v1',
        },
        {
          entity: 'reading',
          entityId: theirReading,
          field: 'body',
          sourceLocale: 'id',
          locale: 'en',
          body: 'theirs translated',
          model: 'glm-4.6',
          promptVersion: 'translate-v1',
        },
        {
          entity: 'persona',
          entityId: mine,
          field: 'body',
          sourceLocale: 'id',
          locale: 'en',
          body: 'persona translated',
          model: 'glm-4.6',
          promptVersion: 'translate-v1',
        },
      ]);

      const rows = await translationsForAdmin(tx, mine);
      expect(rows.map((r) => r.body).sort()).toEqual(['mine translated', 'persona translated']);
      for (const r of rows) {
        expect(r.updatedAt).toBeInstanceOf(Date);
        expect(r.sourceUpdatedAt).toBeInstanceOf(Date);
        expect(typeof r.stale).toBe('boolean');
      }
    }));

  it('flags stale when the translation predates its source', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx, 'stale');
      const reading = await seedReading(tx, id);
      await tx.insert(translations).values({
        entity: 'reading',
        entityId: reading,
        field: 'body',
        sourceLocale: 'id',
        locale: 'en',
        body: 'older',
        model: 'glm-4.6',
        promptVersion: 'translate-v1',
      });
      // The comparand for a reading is `readings.created_at`, because a reading is
      // immutable once written. Push the translation into the past.
      await tx.execute(
        sql`update translations set updated_at = now() - interval '1 day' where entity_id = ${reading}`,
      );

      const [row] = await translationsForAdmin(tx, id);
      expect(row.stale).toBe(true);
    }));
});

describe('adminEmailsByIds -- the audit trail attribution join', () => {
  it('resolves the ids it knows and silently drops the ones it does not', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx, 'admin');
      const map = await adminEmailsByIds(tx, [id, 'banana', '00000000-0000-0000-0000-000000000000']);
      expect(map.get(id)).toContain('@example.com');
      expect(map.size).toBe(1);
      expect(await adminEmailsByIds(tx, [])).toEqual(new Map());
    }));
});
