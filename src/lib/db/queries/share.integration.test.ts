/**
 * V7's share queries against a real Postgres.
 *
 * **THE QUESTION IS NOW ALWAYS SHARED (Miftah, 2026-07-28), AND THE SQL-LEVEL
 * ASSERTIONS STAY.** They no longer guard the default -- the default is `true` --
 * but they are what keeps the CAPABILITY to exclude the column real and working,
 * which is the mechanism if the ruling is ever revisited. Asserted against the
 * EMITTED SQL rather than the returned object, because
 * `expect(row.question).toBeNull()` passes for a query that selected the column
 * and then dropped it, and by then the value has been through the driver and into
 * the RSC flight payload.
 *
 * The rotation test is the second one: un-revoking instead of rotating is a
 * one-line "simplification" that resurrects a killed capability, and the
 * assertion that catches it is that the OLD slug stays dead.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { profiles, shareLinks, users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { ReadingStatus } from '@/data/types';
import type { Tx } from '@/lib/db/types';
import { insertReading } from './history';
import {
  bumpShareViewCount,
  insertOrRotateShareLink,
  liveShareLinkFor,
  markReadingShared,
  publicPersonaForShare,
  publicReadingForShare,
  publicReadingQuery,
  revokeAllForUser,
  revokeShareLink,
  shareLinkById,
  shareLinkBySlug,
} from './share';

afterAll(closeTestDb);

const A = 'aaaaaaaaaaaa';
const B = 'bbbbbbbbbbbb';
const C = 'cccccccccccc';
/** Planted so the SQL and payload assertions have something unmistakable to grep. */
const SENTINEL = 'sentinel-question-haruskah-aku-pindah-kerja';

async function makeUser(tx: Tx, sub: string, nickname?: string): Promise<string> {
  const [u] = await tx
    .insert(users)
    .values({ googleSub: sub, email: `${sub}@example.com` })
    .returning();
  if (nickname) {
    await tx.insert(profiles).values({
      userId: u!.id,
      fullName: 'Sebuah Nama Lengkap',
      nickname,
      birthDate: '1990-04-11',
      completedAt: new Date(),
    });
  }
  return u!.id;
}

async function reading(
  tx: Tx,
  userId: string,
  o: { status?: ReadingStatus; body?: string | null; question?: string | null } = {},
): Promise<string> {
  const row = await insertReading(
    tx,
    {
      userId,
      readerId: 'thessaly',
      serviceId: 'spread3',
      locale: 'id',
      model: 'test',
      promptVersion: 'id-v1.testtest',
      localDate: '2026-07-28',
      body: o.body === undefined ? 'sebuah bacaan yang utuh' : o.body,
      status: o.status ?? 'ok',
      question: o.question ?? null,
      verdict: null,
    },
    [
      { cardId: 16, reversed: false, position: 0 },
      { cardId: 9, reversed: true, position: 1 },
      { cardId: 6, reversed: false, position: 2 },
    ],
  );
  return row.id;
}

// ---------------------------------------------------------------------------
// create and rotate
// ---------------------------------------------------------------------------

describe('insertOrRotateShareLink', () => {
  it('inserts a live link', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-insert');
      const r = await reading(tx, user);
      const row = await insertOrRotateShareLink(tx, {
        slug: A,
        userId: user,
        entity: 'reading',
        entityId: r,
        includeQuestion: false,
        includeNickname: true,
      });
      expect(row.revokedAt).toBeNull();
      expect(row.slug).toBe(A);
      expect(row.viewCount).toBe(0);
    });
  });

  it('ROTATES the slug on re-share instead of reviving the old one', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-rotate');
      const r = await reading(tx, user);
      const base = {
        userId: user,
        entity: 'reading',
        entityId: r,
        includeQuestion: false,
        includeNickname: true,
      };

      const first = await insertOrRotateShareLink(tx, { ...base, slug: A });
      expect(await revokeShareLink(tx, first.id, user)).toBe(1);

      const second = await insertOrRotateShareLink(tx, { ...base, slug: B });

      expect(second.id).toBe(first.id); // one row per artifact
      expect(second.slug).toBe(B); // a NEW address
      expect(second.revokedAt).toBeNull();
      // THE ASSERTION THAT MATTERS: the old URL is dead forever.
      expect(await shareLinkBySlug(tx, A)).toBeNull();
      expect(await shareLinkBySlug(tx, B)).not.toBeNull();
    });
  });

  it('DEFAULTS include_question to TRUE, which is the 2026-07-28 ruling', async () => {
    /*
     * The column default, checked through an insert that does not mention it --
     * because that is the only thing standing behind a future writer that is not
     * the share sheet. It was `false` under VD9 and is `true` now: the question is
     * part of the reading, so a shared reading without it cannot be followed.
     * `schema.ts`'s comment records what the reversal costs.
     */
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-q-default');
      const r = await reading(tx, user, { question: SENTINEL });
      const [row] = await tx
        .insert(shareLinks)
        .values({ slug: A, userId: user, entity: 'reading', entityId: r })
        .returning();
      expect(row!.includeQuestion).toBe(true);
      expect(row!.includeNickname).toBe(true);
    });
  });

  it('carries the new toggles through a rotation', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-toggles');
      const r = await reading(tx, user, { question: SENTINEL });
      const base = { userId: user, entity: 'reading', entityId: r };

      await insertOrRotateShareLink(tx, {
        ...base,
        slug: A,
        includeQuestion: false,
        includeNickname: true,
      });
      const second = await insertOrRotateShareLink(tx, {
        ...base,
        slug: B,
        includeQuestion: true,
        includeNickname: false,
      });
      expect(second.includeQuestion).toBe(true);
      expect(second.includeNickname).toBe(false);
    });
  });

  it('sets updated_at by hand, because $onUpdate does not fire in onConflictDoUpdate', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-updated');
      const r = await reading(tx, user);
      const base = {
        userId: user,
        entity: 'reading',
        entityId: r,
        includeQuestion: false,
        includeNickname: true,
      };
      const a = await insertOrRotateShareLink(tx, { ...base, slug: A });
      await new Promise((res) => setTimeout(res, 5));
      const b = await insertOrRotateShareLink(tx, { ...base, slug: B });
      expect(b.updatedAt.getTime()).toBeGreaterThan(a.updatedAt.getTime());
    });
  });

  it('gives two users their own row for the same artifact id', async () => {
    /*
     * The unique is (user_id, entity, entity_id) and NOT (entity, entity_id).
     * Nothing in the app shares another person's reading, but the constraint
     * being user-scoped is what makes `revokeAllForUser` a safe blanket update.
     */
    await withRollback(async (tx) => {
      const one = await makeUser(tx, 'dev:v7-two-a');
      const two = await makeUser(tx, 'dev:v7-two-b');
      const r = await reading(tx, one);
      await insertOrRotateShareLink(tx, {
        slug: A,
        userId: one,
        entity: 'reading',
        entityId: r,
        includeQuestion: false,
        includeNickname: true,
      });
      await insertOrRotateShareLink(tx, {
        slug: B,
        userId: two,
        entity: 'reading',
        entityId: r,
        includeQuestion: false,
        includeNickname: true,
      });
      expect(await shareLinkBySlug(tx, A)).not.toBeNull();
      expect(await shareLinkBySlug(tx, B)).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// resolve, revoke, count
// ---------------------------------------------------------------------------

describe('shareLinkBySlug / revokeShareLink', () => {
  it('does not resolve a revoked slug', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-revoked');
      const r = await reading(tx, user);
      const link = await insertOrRotateShareLink(tx, {
        slug: A,
        userId: user,
        entity: 'reading',
        entityId: r,
        includeQuestion: false,
        includeNickname: true,
      });
      expect(await shareLinkBySlug(tx, A)).not.toBeNull();
      await revokeShareLink(tx, link.id, user);
      expect(await shareLinkBySlug(tx, A)).toBeNull();
      // The row survives, so the slug can never be re-issued.
      expect(await shareLinkById(tx, link.id, user)).not.toBeNull();
    });
  });

  it('does not resolve an unknown slug', async () => {
    await withRollback(async (tx) => {
      expect(await shareLinkBySlug(tx, C)).toBeNull();
    });
  });

  it("refuses to revoke another user's link", async () => {
    /*
     * The WHERE clause carries user_id. Without it, `share_links.id` is a
     * capability of its own -- and it is in the client bundle as an analytics
     * prop, so a revoke keyed on the id alone would be a revoke token anybody
     * could read out of a network tab.
     */
    await withRollback(async (tx) => {
      const owner = await makeUser(tx, 'dev:v7-owner');
      const other = await makeUser(tx, 'dev:v7-other');
      const r = await reading(tx, owner);
      const link = await insertOrRotateShareLink(tx, {
        slug: A,
        userId: owner,
        entity: 'reading',
        entityId: r,
        includeQuestion: false,
        includeNickname: true,
      });

      expect(await revokeShareLink(tx, link.id, other)).toBe(0);
      expect(await shareLinkBySlug(tx, A)).not.toBeNull();
      expect(await shareLinkById(tx, link.id, other)).toBeNull();

      expect(await revokeShareLink(tx, link.id, owner)).toBe(1);
      // Already revoked: still zero, so the route's 404 is the same answer for
      // "not yours", "gone" and "already off".
      expect(await revokeShareLink(tx, link.id, owner)).toBe(0);
    });
  });

  it('revokes every live link for one user, and only that user', async () => {
    await withRollback(async (tx) => {
      const mine = await makeUser(tx, 'dev:v7-all-mine');
      const theirs = await makeUser(tx, 'dev:v7-all-theirs');
      const r1 = await reading(tx, mine);
      const r2 = await reading(tx, mine);
      const r3 = await reading(tx, theirs);
      const mk = (userId: string, slug: string, entityId: string) =>
        insertOrRotateShareLink(tx, {
          slug,
          userId,
          entity: 'reading',
          entityId,
          includeQuestion: false,
          includeNickname: true,
        });
      await mk(mine, A, r1);
      await mk(mine, B, r2);
      await mk(theirs, C, r3);

      expect(await revokeAllForUser(tx, mine)).toBe(2);
      expect(await shareLinkBySlug(tx, A)).toBeNull();
      expect(await shareLinkBySlug(tx, B)).toBeNull();
      expect(await shareLinkBySlug(tx, C)).not.toBeNull();
      // Idempotent: nothing live is left.
      expect(await revokeAllForUser(tx, mine)).toBe(0);
    });
  });

  it('increments the view count without touching updated_at', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-views');
      const r = await reading(tx, user);
      const link = await insertOrRotateShareLink(tx, {
        slug: A,
        userId: user,
        entity: 'reading',
        entityId: r,
        includeQuestion: false,
        includeNickname: true,
      });
      await new Promise((res) => setTimeout(res, 5));
      await bumpShareViewCount(tx, link.id);
      await bumpShareViewCount(tx, link.id);

      const after = await shareLinkById(tx, link.id, user);
      expect(after!.viewCount).toBe(2);
      /*
       * `updated_at` is what `share.revoked`'s age is computed against and what
       * any future staleness question reads. A crawler is not an edit -- and
       * `db.update()` DOES fire $onUpdate, unlike the upsert, so this only holds
       * because `bumpShareViewCount` pins the column to itself.
       */
      expect(after!.updatedAt.getTime()).toBe(link.updatedAt.getTime());
    });
  });
});

describe('liveShareLinkFor', () => {
  it('finds the live link for an artifact and forgets a revoked one', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-live-for');
      const r = await reading(tx, user);
      const link = await insertOrRotateShareLink(tx, {
        slug: A,
        userId: user,
        entity: 'reading',
        entityId: r,
        includeQuestion: false,
        includeNickname: true,
      });
      expect((await liveShareLinkFor(tx, user, 'reading', r))?.id).toBe(link.id);
      await revokeShareLink(tx, link.id, user);
      expect(await liveShareLinkFor(tx, user, 'reading', r)).toBeNull();
      // Not a uuid: null without a round trip, not a driver error.
      expect(await liveShareLinkFor(tx, user, 'reading', 'not-a-uuid')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// the question. §5.1 and §5.2.
// ---------------------------------------------------------------------------

describe('publicReadingForShare', () => {
  it('CAN be built without readings.question, and then never selects it', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-sql');
      const r = await reading(tx, user, { question: SENTINEL });

      /*
       * ASSERTED AGAINST THE EMITTED SQL, NOT THE RETURNED OBJECT.
       *
       * `expect(row.question).toBeNull()` passes for a query that selected the
       * column and then dropped it -- and that IS the bug, because by then the
       * value has been through the driver, through this process, and into the RSC
       * flight payload the browser downloads. The only assertion that covers the
       * requirement is one that reads the statement.
       */
      const { sql: text } = publicReadingQuery(tx, r, false).toSQL();
      expect(text).not.toMatch(/\bquestion\b/);

      /*
       * THE CONTROL. Without it, a typo in the projection builder makes the
       * assertion above pass by selecting nothing at all.
       */
      const withIt = publicReadingQuery(tx, r, true).toSQL();
      expect(withIt.sql).toMatch(/\bquestion\b/);
    });
  });

  it('NEVER SELECTS profiles.nickname when include_nickname is false', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-nick-sql', 'Mif');
      const r = await reading(tx, user);
      expect(publicReadingQuery(tx, r, false, false).toSQL().sql).not.toMatch(/\bnickname\b/);
      expect(publicReadingQuery(tx, r, false, true).toSQL().sql).toMatch(/\bnickname\b/);
    });
  });

  it('omits the KEY, not merely the value', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-keys', 'Mif');
      const r = await reading(tx, user, { question: SENTINEL });

      const without = await publicReadingForShare(tx, r, false, false);
      expect(without).not.toBeNull();
      expect('question' in without!).toBe(false);
      expect('nickname' in without!).toBe(false);
      // The whole serialized payload, which is what actually reaches a browser.
      expect(JSON.stringify(without)).not.toContain(SENTINEL);
      expect(JSON.stringify(without)).not.toContain('Mif');

      const withBoth = await publicReadingForShare(tx, r, true, true);
      expect(withBoth!.question).toBe(SENTINEL);
      expect(withBoth!.nickname).toBe('Mif');
    });
  });

  it('returns nothing for a blocked / failed / aborted / partial reading', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-status');
      for (const status of ['blocked', 'failed', 'aborted', 'partial'] as const) {
        const r = await reading(tx, user, { status });
        expect(await publicReadingForShare(tx, r, false)).toBeNull();
      }
      // The control: `ok` does resolve, so the four above failed on status and
      // not on the fixture.
      const ok = await reading(tx, user, { status: 'ok' });
      expect(await publicReadingForShare(tx, ok, false)).not.toBeNull();
    });
  });

  it('returns nothing for an ok reading with no body', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-nobody');
      const r = await reading(tx, user, { body: null });
      expect(await publicReadingForShare(tx, r, false)).toBeNull();
    });
  });

  it('returns the cards in slot order', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-cards');
      const r = await reading(tx, user);
      const got = await publicReadingForShare(tx, r, false);
      expect(got!.cards.map((c) => c.position)).toEqual([0, 1, 2]);
      expect(got!.cards.map((c) => c.cardId)).toEqual([16, 9, 6]);
      expect(got!.cards.map((c) => c.reversed)).toEqual([false, true, false]);
    });
  });

  it('is a null for a malformed id, not a driver error', async () => {
    await withRollback(async (tx) => {
      expect(await publicReadingForShare(tx, "' or 1=1--", false)).toBeNull();
    });
  });

  it('resolves to null for the orphan case, and does not throw', async () => {
    /*
     * `share_links.entity_id` has no foreign key (roadmap §4), so a deleted
     * reading leaves its link behind BY CONSTRUCTION. A 500 here is the bug.
     */
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-orphan');
      const r = await reading(tx, user);
      await insertOrRotateShareLink(tx, {
        slug: A,
        userId: user,
        entity: 'reading',
        entityId: r,
        includeQuestion: false,
        includeNickname: true,
      });
      await tx.execute(`delete from readings where id = '${r}'`);
      const link = await shareLinkBySlug(tx, A);
      expect(link).not.toBeNull(); // the link survives its artifact
      expect(await publicReadingForShare(tx, r, false)).toBeNull();
    });
  });
});

describe('publicPersonaForShare', () => {
  it('answers null, because V8 has not shipped `personas`', async () => {
    /*
     * Asserted rather than left implicit: `'persona'` is a live value in
     * `SHARE_ENTITIES` and in the route's schema, so the honest behaviour of the
     * whole path today is "mints nothing, resolves to the same 404 as an orphan".
     * When V8 lands, THIS test is what says the placeholder is gone.
     */
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-persona');
      expect(await publicPersonaForShare(tx, user)).toBeNull();
    });
  });
});

describe('markReadingShared', () => {
  it('sets shared_at once and never moves it', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-shared-at');
      const r = await reading(tx, user);

      await markReadingShared(tx, r, user);
      const [first] = await tx.execute<{ shared_at: Date }>(
        `select shared_at from readings where id = '${r}'`,
      );
      expect(first!.shared_at).not.toBeNull();

      await new Promise((res) => setTimeout(res, 5));
      await markReadingShared(tx, r, user);
      const [second] = await tx.execute<{ shared_at: Date }>(
        `select shared_at from readings where id = '${r}'`,
      );
      // `where shared_at is null` makes it first-mint-only with no read first.
      expect(new Date(second!.shared_at).getTime()).toBe(new Date(first!.shared_at).getTime());
    });
  });

  it("will not stamp another user's reading", async () => {
    await withRollback(async (tx) => {
      const owner = await makeUser(tx, 'dev:v7-stamp-owner');
      const other = await makeUser(tx, 'dev:v7-stamp-other');
      const r = await reading(tx, owner);
      await markReadingShared(tx, r, other);
      const [row] = await tx.execute<{ shared_at: Date | null }>(
        `select shared_at from readings where id = '${r}'`,
      );
      expect(row!.shared_at).toBeNull();
    });
  });
});

describe('the row itself', () => {
  it('refuses a second live link for the same artifact through a raw insert', async () => {
    /*
     * The unique constraint, not the code path -- so that a future writer that
     * skips `insertOrRotateShareLink` cannot end up with two live addresses for
     * one reading, which would make revoke a lie.
     */
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-uniq');
      const r = await reading(tx, user);
      const values = {
        userId: user,
        entity: 'reading',
        entityId: r,
        includeQuestion: false,
        includeNickname: true,
      };
      await tx.insert(shareLinks).values({ ...values, slug: A });
      await expect(tx.insert(shareLinks).values({ ...values, slug: B })).rejects.toThrow();
    });
  });
});
