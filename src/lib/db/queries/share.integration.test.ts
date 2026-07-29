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
 *
 * ── AND SINCE 2026-07-28, ONE READING HOLDS ONE ADDRESS PER LANGUAGE ────────
 *
 * `KEEPS the English link alive after a Bahasa link is minted` is the reported bug,
 * executable. It failed before `locale` joined the unique key.
 *
 * **TWO TESTS HERE ARE NEGATIVE CONTROLS FOR `NULLS NOT DISTINCT` AND BOTH FAIL BY
 * ACCEPTING A SECOND ROW RATHER THAN BY THROWING** — `treats two unpinned mints as
 * ONE row` and `refuses a second link for the same artifact AND locale through a raw
 * insert`. The second **passed before this change for a different reason**, which is
 * exactly how the landmine would have been missed; its comment says so.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { profiles, shareLinks, users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { ReadingStatus } from '@/data/types';
import type { Tx } from '@/lib/db/types';
import { insertReading } from './history';
import {
  anyShareLinkFor,
  bumpShareViewCount,
  insertOrRotateShareLink,
  liveShareLinksForArtifact,
  markReadingShared,
  publicPersonaForShare,
  publicReadingForShare,
  publicReadingQuery,
  revokeAllForUser,
  revokeArtifactLinks,
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

  it('pins the locale the sharer was reading', async () => {
    /*
     * DESIGN A. The reading is `id`; the sharer was reading it in English, so the
     * link records `en` and the public page will look up that translation.
     */
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-locale-pin');
      const r = await reading(tx, user);
      const row = await insertOrRotateShareLink(tx, {
        slug: A,
        userId: user,
        entity: 'reading',
        entityId: r,
        locale: 'en',
      });
      expect(row.locale).toBe('en');
    });
  });

  it('leaves the pinned locale NULL when the mint does not name one', async () => {
    /*
     * **THE PRE-EXISTING-LINKS GUARANTEE, AND THE MOST IMPORTANT ASSERTION IN THIS
     * BLOCK.** Every link minted before `share_links.locale` existed has NULL here,
     * and NULL must mean "render as-written" -- i.e. exactly what that link showed
     * yesterday. A `default` on the column would have broken that silently for
     * every historic row, which is why there is none.
     */
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v7-locale-null');
      const r = await reading(tx, user);
      const row = await insertOrRotateShareLink(tx, {
        slug: A,
        userId: user,
        entity: 'reading',
        entityId: r,
      });
      expect(row.locale).toBeNull();
    });
  });

  it('gives a SECOND locale its OWN row, and does not re-pin the first', async () => {
    /*
     * ── THIS TEST IS THE INVERSION OF THE ONE IT REPLACED, NOT A REFINEMENT ────
     *
     * It used to assert `second.id === first.id` and `second.locale === 'id'`,
     * under the heading "RE-PINS the locale on re-share", with a comment arguing
     * that *"re-sharing is how a querent fixes a link they minted in the wrong
     * language"*. **That was the bug**, reported 2026-07-28: the querent shared a
     * reading in English, switched language, shared again, and the English URL
     * they had already sent somebody stopped resolving. Nothing was overwritten —
     * `readings.body` is immutable and the `translations` row survived — the
     * ADDRESS was replaced, because `locale` was an attribute of one row rather
     * than part of its identity.
     *
     * `locale` is now in the unique key, so a second language is a second row and
     * the first pin is untouched. The re-pinning `set` clause is therefore gone:
     * a conflict now means "same locale", where re-pinning is a no-op.
     *
     * See `docs/plans/2026-07-28-share-per-locale-links-design.md` §1.
     */
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v10-locale-second');
      const r = await reading(tx, user);
      const base = { userId: user, entity: 'reading', entityId: r };

      const first = await insertOrRotateShareLink(tx, { ...base, slug: A, locale: 'en' });
      const second = await insertOrRotateShareLink(tx, { ...base, slug: B, locale: 'id' });

      // TWO rows, not one rotated in place.
      expect(second.id).not.toBe(first.id);
      expect(first.locale).toBe('en');
      expect(second.locale).toBe('id');
    });
  });

  it('KEEPS the English link alive after a Bahasa link is minted', async () => {
    /*
     * **THE REPORTED BUG, EXECUTABLE.** Miftah, 2026-07-28:
     *
     *   1. "I got a share link for card session A in English. It opened nicely."
     *   2. "When I changed the language and created a share link for card session A
     *      in Bahasa, somehow the share link in no 1 cannot be opened again."
     *
     * Kept separate from the row-identity test above even though the same two
     * mints set it up, because THIS is the assertion a future "simplification"
     * has to get past, and it is worth failing under its own name. The one above
     * can be satisfied by two rows that both got new slugs; only this one says the
     * address the querent already sent somebody still works.
     */
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v10-en-survives');
      const r = await reading(tx, user);
      const base = { userId: user, entity: 'reading', entityId: r };

      await insertOrRotateShareLink(tx, { ...base, slug: A, locale: 'en' });
      await insertOrRotateShareLink(tx, { ...base, slug: B, locale: 'id' });

      const en = await shareLinkBySlug(tx, A);
      const id = await shareLinkBySlug(tx, B);
      expect(en?.locale).toBe('en');
      expect(id?.locale).toBe('id');
    });
  });

  it('still rotates the slug when the SAME locale is re-shared', async () => {
    /*
     * The narrowing, and the half of the old rule that survives. Rotation exists so
     * that revoke is permanent FOR AN ADDRESS -- `set revoked_at = null` alone
     * resurrects a capability the querent deliberately killed. Adding `locale` to
     * the key must not weaken that: within one language the behaviour is exactly
     * what it was.
     */
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v10-same-locale-rotate');
      const r = await reading(tx, user);
      const base = { userId: user, entity: 'reading', entityId: r, locale: 'en' as const };

      const first = await insertOrRotateShareLink(tx, { ...base, slug: A });
      expect(await revokeShareLink(tx, first.id, user)).toBe(1);
      const second = await insertOrRotateShareLink(tx, { ...base, slug: B });

      expect(second.id).toBe(first.id); // one row per (artifact, locale)
      expect(await shareLinkBySlug(tx, A)).toBeNull(); // the old URL stays dead
      expect(await shareLinkBySlug(tx, B)).not.toBeNull();
    });
  });

  it('treats two unpinned mints as ONE row -- the NULLS NOT DISTINCT control', async () => {
    /*
     * **THE LANDMINE IN THE OBVIOUS CONSTRAINT, FENCED.** Postgres `UNIQUE` treats
     * NULLs as DISTINCT, and every link minted before `share_links.locale` existed
     * has NULL here. So a plain four-column unique would let
     * `onConflictDoUpdate`'s target MISS a legacy row and INSERT a second one --
     * leaving the old slug live and unreachable from the UI, which is the exact
     * capability resurrection the rotation exists to prevent, by the back door.
     *
     * Hence `unique nulls not distinct`. **Without that clause this test fails by
     * producing two rows and leaving slug A alive**, which is the whole point of
     * writing it as an assertion about A being dead rather than about a count.
     *
     * Note that the raw-insert test at the bottom of this file is the same control
     * one layer down, and it passed BEFORE this change for a different reason (the
     * three-column key). It must keep passing for the new reason.
     */
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v10-null-not-distinct');
      const r = await reading(tx, user);
      const base = { userId: user, entity: 'reading', entityId: r };

      const first = await insertOrRotateShareLink(tx, { ...base, slug: A });
      const second = await insertOrRotateShareLink(tx, { ...base, slug: B });

      expect(first.locale).toBeNull();
      expect(second.locale).toBeNull();
      expect(second.id).toBe(first.id);
      expect(await shareLinkBySlug(tx, A)).toBeNull();
    });
  });

  it('lets a legacy unpinned link coexist with a pinned one, both resolving', async () => {
    /*
     * **THE PRE-EXISTING-LINKS GUARANTEE, EXTENDED.** A NULL pin means "render
     * as-written", i.e. exactly what that link showed yesterday, and adding
     * `locale` to the key must not make a historic address collide with a new one.
     * A reading may therefore hold three rows -- one `en`, one `id`, one legacy
     * NULL -- each its own permanent address.
     *
     * This is the test that fails if somebody "tidies" the schema by giving
     * `locale` a default: every historic row would be rewritten to a language the
     * querent never chose, and every link already out there would change what it
     * shows.
     */
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v10-legacy-coexist');
      const r = await reading(tx, user);
      const base = { userId: user, entity: 'reading', entityId: r };

      const legacy = await insertOrRotateShareLink(tx, { ...base, slug: A });
      const pinned = await insertOrRotateShareLink(tx, { ...base, slug: B, locale: 'en' });

      expect(legacy.id).not.toBe(pinned.id);
      expect((await shareLinkBySlug(tx, A))?.locale).toBeNull();
      expect((await shareLinkBySlug(tx, B))?.locale).toBe('en');
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

describe('liveShareLinksForArtifact / revokeArtifactLinks', () => {
  it('lists every live language, and skips a revoked one', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v10-list');
      const r = await reading(tx, user);
      const base = { userId: user, entity: 'reading', entityId: r };

      await insertOrRotateShareLink(tx, { ...base, slug: A, locale: 'en' });
      const idLink = await insertOrRotateShareLink(tx, { ...base, slug: B, locale: 'id' });
      const legacy = await insertOrRotateShareLink(tx, { ...base, slug: C });

      expect(
        (await liveShareLinksForArtifact(tx, user, 'reading', r)).map((l) => l.locale).sort(),
      ).toEqual(['en', 'id', null]);

      await revokeShareLink(tx, idLink.id, user);
      expect(
        (await liveShareLinksForArtifact(tx, user, 'reading', r)).map((l) => l.slug).sort(),
      ).toEqual([A, C].sort());
      expect(legacy.locale).toBeNull();
    });
  });

  it("never lists another querent's link for the same artifact id", async () => {
    await withRollback(async (tx) => {
      const mine = await makeUser(tx, 'dev:v10-list-mine');
      const theirs = await makeUser(tx, 'dev:v10-list-theirs');
      const r = await reading(tx, mine);
      await insertOrRotateShareLink(tx, {
        userId: mine,
        entity: 'reading',
        entityId: r,
        slug: A,
        locale: 'en',
      });
      await insertOrRotateShareLink(tx, {
        userId: theirs,
        entity: 'reading',
        entityId: r,
        slug: B,
        locale: 'en',
      });
      const rows = await liveShareLinksForArtifact(tx, mine, 'reading', r);
      expect(rows.map((l) => l.slug)).toEqual([A]);
    });
  });

  it('REVOKES EVERY LANGUAGE, which is what "stop sharing this" means', async () => {
    /*
     * Miftah's consent ruling, 2026-07-28. A per-locale kill would let a querent
     * tap revoke, believe the reading is private, and leave one URL serving the
     * public internet. The assertion is on `shareLinkBySlug` for all three rather
     * than on a count, because a count passing while one slug still resolves is
     * exactly the failure being prevented.
     */
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v10-revoke-all');
      const r = await reading(tx, user);
      const base = { userId: user, entity: 'reading', entityId: r };
      await insertOrRotateShareLink(tx, { ...base, slug: A, locale: 'en' });
      await insertOrRotateShareLink(tx, { ...base, slug: B, locale: 'id' });
      await insertOrRotateShareLink(tx, { ...base, slug: C });

      const revoked = await revokeArtifactLinks(tx, user, 'reading', r);
      expect(revoked).toHaveLength(3);
      // The rows carry what `share.revoked` needs, per address.
      expect(revoked.every((l) => l.createdAt instanceof Date)).toBe(true);
      expect(revoked.every((l) => l.viewCount === 0)).toBe(true);

      expect(await shareLinkBySlug(tx, A)).toBeNull();
      expect(await shareLinkBySlug(tx, B)).toBeNull();
      expect(await shareLinkBySlug(tx, C)).toBeNull();
      expect(await liveShareLinksForArtifact(tx, user, 'reading', r)).toEqual([]);
    });
  });

  it("will not revoke another querent's links", async () => {
    await withRollback(async (tx) => {
      const mine = await makeUser(tx, 'dev:v10-revoke-mine');
      const theirs = await makeUser(tx, 'dev:v10-revoke-theirs');
      const r = await reading(tx, mine);
      await insertOrRotateShareLink(tx, {
        userId: theirs,
        entity: 'reading',
        entityId: r,
        slug: B,
        locale: 'en',
      });
      expect(await revokeArtifactLinks(tx, mine, 'reading', r)).toEqual([]);
      expect(await shareLinkBySlug(tx, B)).not.toBeNull();
    });
  });

  it('is a [] for a malformed entity id, not a driver error', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v10-malformed');
      expect(await liveShareLinksForArtifact(tx, user, 'reading', 'not-a-uuid')).toEqual([]);
      expect(await revokeArtifactLinks(tx, user, 'reading', 'not-a-uuid')).toEqual([]);
    });
  });
});

describe('anyShareLinkFor', () => {
  it('distinguishes the two languages, and matches a NULL pin with `is null`', async () => {
    /*
     * **THE `localeMatches` HELPER, FENCED.** `eq(col, null)` compiles and is always
     * false in SQL, so a NULL pin would answer "no link" for every legacy row — after
     * which the caller mints a second one it cannot see. `nulls not distinct` governs
     * UNIQUENESS; it does not change what `=` means in a `where`. Two mechanisms that
     * read like one.
     *
     * On `anyShareLinkFor` rather than the deleted `liveShareLinkFor` — see that
     * function's obituary in `queries/share.ts`. This is the caller `rotated` depends
     * on, so the helper is fenced where it does real work.
     */
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v10-locale-lookup');
      const r = await reading(tx, user);
      const base = { userId: user, entity: 'reading', entityId: r };
      await insertOrRotateShareLink(tx, { ...base, slug: A, locale: 'en' });

      expect((await anyShareLinkFor(tx, user, 'reading', r, 'en'))?.slug).toBe(A);
      expect(await anyShareLinkFor(tx, user, 'reading', r, 'id')).toBeNull();
      expect(await anyShareLinkFor(tx, user, 'reading', r, null)).toBeNull();

      await insertOrRotateShareLink(tx, { ...base, slug: C });
      expect((await anyShareLinkFor(tx, user, 'reading', r, null))?.slug).toBe(C);
    });
  });

  it('SEES A REVOKED ROW, which is what makes `rotated` honest', async () => {
    /*
     * The one reader of a revoked row. A re-share after a revoke is a rotation, and a
     * live-only lookup cannot see it — so `share.created` would report
     * `rotated: false` for exactly the case the prop exists to count.
     */
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
      // `null` is the pin this mint made -- see the locale test above.
      expect((await anyShareLinkFor(tx, user, 'reading', r, null))?.id).toBe(link.id);
      await revokeShareLink(tx, link.id, user);
      expect((await anyShareLinkFor(tx, user, 'reading', r, null))?.id).toBe(link.id);
      // But it is gone from the LIVE list, which is the other half of the pair.
      expect(await liveShareLinksForArtifact(tx, user, 'reading', r)).toEqual([]);
      // Not a uuid: null without a round trip, not a driver error.
      expect(await anyShareLinkFor(tx, user, 'reading', 'not-a-uuid', null)).toBeNull();
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

  /**
   * **`readings.choice` RIDES ON `includeQuestion` AND HAS NO SWITCH OF ITS OWN
   * (2026-07-29).**
   *
   * The chosen option is a word-bounded SLICE of `readings.question`, so a link that
   * excluded the question and selected this column would put a fragment of the exact
   * string the sharer declined to publish through the driver and into the flight
   * payload — defeating mechanism 1 through the one field that reads as a verdict
   * rather than as user text.
   *
   * Sharing the question is the default since 2026-07-28 and the sheet no longer
   * offers a switch, so this arm is unreachable from the UI today. **That is exactly
   * why it is asserted**: `publicReadingQuery` keeps the CAPABILITY to exclude the
   * column real, and a capability that is correct for one field and broken for its own
   * substring is worse than not having it.
   */
  it('NEVER SELECTS readings.choice when the question is excluded', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v11-choice-sql');
      const r = await reading(tx, user, { question: SENTINEL });

      expect(publicReadingQuery(tx, r, false).toSQL().sql).not.toMatch(/\bchoice\b/);
      // THE CONTROL, without which a typo makes the line above pass for nothing.
      expect(publicReadingQuery(tx, r, true).toSQL().sql).toMatch(/\bchoice\b/);
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
  it('refuses a second link for the same artifact AND locale through a raw insert', async () => {
    /*
     * The unique constraint, not the code path -- so that a future writer that
     * skips `insertOrRotateShareLink` cannot end up with two addresses for one
     * (reading, language), which would make revoke a lie for one of them.
     *
     * **THIS TEST PASSED BEFORE `locale` JOINED THE KEY AND IT MUST KEEP PASSING
     * FOR A DIFFERENT REASON, WHICH IS WHY IT IS WORTH READING TWICE.** Both rows
     * here leave `locale` unset, i.e. NULL. Under the old three-column key it
     * threw because the locale was not in the key at all. Under a plain
     * four-column key it would NOT throw, because Postgres `UNIQUE` treats NULLs
     * as DISTINCT -- and that silent pass is the landmine. It throws today only
     * because the constraint carries `nulls not distinct`.
     *
     * So: this file has the control at two levels. Here, and
     * "treats two unpinned mints as ONE row" above.
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

  it('ACCEPTS two raw rows for one artifact when their locales differ', async () => {
    /*
     * The positive half of the constraint, at the same level. Without it the test
     * above would be satisfied by a constraint that is simply too strict -- and
     * "too strict" here means the reported bug, permanently, with a green suite.
     */
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:v10-uniq-positive');
      const r = await reading(tx, user);
      const values = { userId: user, entity: 'reading', entityId: r };
      await tx.insert(shareLinks).values({ ...values, slug: A, locale: 'en' });
      await tx.insert(shareLinks).values({ ...values, slug: B, locale: 'id' });
      expect(await shareLinkBySlug(tx, A)).not.toBeNull();
      expect(await shareLinkBySlug(tx, B)).not.toBeNull();
    });
  });
});
