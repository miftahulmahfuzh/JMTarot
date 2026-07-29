/**
 * `admin_access_log` against a real Postgres. v0.5.0 / A1.
 *
 * **THE FIRST TWO TESTS ARE THE ONES THAT MATTER AND THEY FAIL AGAINST ROADMAP
 * §3.1's ORIGINAL SCHEMA.** §3.1 declared `admin_user_id` NOT NULL with an FK
 * action of `on delete set null`; that combination raises `23502` when the
 * referenced user is hard-deleted, so the erasure `/privacy` clause 8 promises
 * would abort for exactly the users an admin had looked at. Plan §1.1 and
 * reconciliation R3 resolve it to nullable. This is that resolution as an
 * executable claim rather than a paragraph -- see `docs/workstream-notes.md`
 * for the actual `23502` text from breaking it on purpose.
 */
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { accessesForSubject, recentAccesses, recordAdminAccess } from './audit';

afterAll(closeTestDb);

let n = 0;

async function seedUser(tx: Tx, tag: string): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `audit:${tag}:${n}`, email: `audit-${tag}-${n}@example.com` })
    .returning({ id: users.id });
  return user.id;
}

describe('the FK actions do not veto erasure (§12.1, plan §1.1, R3)', () => {
  it('lets a SUBJECT be hard-deleted, keeping the row with a null subject', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      await recordAdminAccess(tx, {
        adminUserId: admin,
        subjectUserId: subject,
        resource: 'onboarding_answer',
        resourceKey: 'worst_thing',
      });

      // The sweep's statement, and it must SUCCEED.
      await tx.execute(sql`delete from users where id = ${subject}`);

      const rows = await tx.execute(sql`select * from admin_access_log`);
      expect(rows).toHaveLength(1);
      const row = rows[0] as Record<string, unknown>;
      expect(row.subject_user_id).toBeNull();
      expect(row.admin_user_id).toBe(admin);
      expect(row.resource_key).toBe('worst_thing');
    }));

  it('lets an ADMIN be hard-deleted, keeping the row with a null admin', () =>
    withRollback(async (tx) => {
      // The half §3.1 got wrong. Under NOT NULL this DELETE raises 23502.
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      await recordAdminAccess(tx, {
        adminUserId: admin,
        subjectUserId: subject,
        resource: 'user_detail',
        resourceKey: null,
      });

      await expect(tx.execute(sql`delete from users where id = ${admin}`)).resolves.toBeDefined();

      const rows = await tx.execute(sql`select * from admin_access_log`);
      const row = rows[0] as Record<string, unknown>;
      expect(row.admin_user_id).toBeNull();
      expect(row.subject_user_id).toBe(subject);
    }));

  it('leaves the unattributed row readable, because A5 has to render it (R3)', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      await recordAdminAccess(tx, {
        adminUserId: admin,
        subjectUserId: subject,
        resource: 'reading_body',
        resourceKey: '9f3c1d2e-0000-4000-8000-000000000000',
      });
      await tx.execute(sql`delete from users where id = ${admin}`);

      const recent = await recentAccesses(tx, 10);
      expect(recent).toHaveLength(1);
      expect(recent[0].adminUserId).toBeNull();
      // NULL means *the admin's row is gone*, never *unknown admin*, and the
      // resource and its key survive -- which is what makes the row still worth
      // reading and what A5 must not render as a blank line.
      expect(recent[0].resource).toBe('reading_body');
      expect(recent[0].resourceKey).toBe('9f3c1d2e-0000-4000-8000-000000000000');
    }));

  it('a hard-deleted subject can no longer be told what was read about them', () =>
    withRollback(async (tx) => {
      // The cost of `set null`, asserted rather than promised. `/privacy` clause
      // 8.1 says this in prose, and a policy sentence with no test behind it is
      // how the two drift.
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      await recordAdminAccess(tx, {
        adminUserId: admin,
        subjectUserId: subject,
        resource: 'onboarding_answer',
        resourceKey: 'worst_thing',
      });
      expect(await accessesForSubject(tx, subject)).toHaveLength(1);
      await tx.execute(sql`delete from users where id = ${subject}`);
      expect(await accessesForSubject(tx, subject)).toHaveLength(0);
    }));
});

describe('a failed audit write fails the reveal (A-D16, A1-11/A1-12, R30)', () => {
  it('propagates the error instead of swallowing it', () =>
    withRollback(async (tx) => {
      /*
       * `delete.integration.test.ts` proves its ordering with a trigger, and this
       * is the same move: make the audit insert impossible, then assert the
       * caller's sequence never reaches the read. A unit test with a mocked db
       * cannot see this, because the thing under test is that nothing catches.
       */
      const admin = await seedUser(tx, 'admin');
      await tx.execute(sql`
        create or replace function jmt_block_audit() returns trigger as $$
        begin raise exception 'blocked'; end; $$ language plpgsql`);
      await tx.execute(sql`
        create trigger jmt_block_audit before insert on admin_access_log
        for each row execute function jmt_block_audit()`);

      let decrypted = false;
      const reveal = async () => {
        await recordAdminAccess(tx, {
          adminUserId: admin,
          subjectUserId: null,
          resource: 'user_detail',
          resourceKey: null,
        });
        decrypted = true; // stands in for A5's decrypt
      };

      await expect(reveal()).rejects.toThrow();
      expect(decrypted).toBe(false);
    }));
});

describe('the indexes serve the queries they were added for', () => {
  it('uses admin_access_log_subject_created_idx for a subject lookup', () =>
    withRollback(async (tx) => {
      /*
       * V8's technique: `enable_seqscan = off` is how you assert an index SERVES a
       * predicate rather than merely EXISTS. On a table with three rows the
       * planner picks a seq scan whatever the index says.
       *
       * **THE PREDICATE IS A LITERAL AND NOT `gen_random_uuid()`, AND THAT IS THE
       * WHOLE TEST.** The first version used the function -- which is VOLATILE, so
       * Postgres cannot use it as an index key at all and planned a Seq Scan even
       * with seqscan disabled and a cost of 1e10. The assertion failed against a
       * perfectly good index. Anyone copying this technique to a new index needs a
       * STABLE comparand.
       */
      await tx.execute(sql`set local enable_seqscan = off`);
      const plan = await tx.execute(sql`
        explain (format text)
        select * from admin_access_log
         where subject_user_id = '9f3c1d2e-0000-4000-8000-000000000000'::uuid
         order by created_at desc limit 10`);
      expect(JSON.stringify(plan)).toContain('admin_access_log_subject_created_idx');
    }));
});
