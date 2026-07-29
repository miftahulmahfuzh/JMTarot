/**
 * **THE AUDIT ORDERING, AS AN EXECUTABLE CLAIM.** v0.5.0 / A5, tasks 7–9.
 *
 * A-D16: *a failed audit write is a failed reveal.* Reconciliation R30 calls this the
 * highest-value seam in the release, and the reason is that getting it wrong LOOKS RIGHT:
 * written in house style — swallow and log, like `flushEvents` and every `after()` block —
 * the reveal would work, the audit row would silently not exist, and the only evidence
 * would be a log line nobody reads.
 *
 * **So the invariant is proved the way `delete.integration.test.ts` proves
 * `redactForUser()`'s ordering: with a `pg_temp` trigger that raises on the audit insert.**
 * The reveal must FAIL, and no plaintext may appear in what it returns. Then the trigger is
 * dropped and the same call must succeed and leave exactly one row.
 *
 * That instrument is the reason the ordering lives in `@/lib/admin/reveal` rather than
 * inline in three route handlers: a route imports `next/server` and the `server-only`
 * singleton, and this repo's own precedent for that is
 * `sweep.retention.integration.test.ts` — *"the route is not exercised … so the statement is
 * duplicated here"*. **Duplicating an ORDERING is worse than duplicating a `DELETE`,
 * because the copy can be right while the original is wrong.**
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encryptField, answerAad, moderationFlagAad } from '@/lib/db/crypto';
import { moderationFlags, onboardingAnswers, readings, users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { revealAnswer, revealFlag, revealReading, recordUserDetailView } from './reveal';

afterAll(closeTestDb);

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64');
});

let n = 0;

async function seedUser(tx: Tx, tag: string): Promise<string> {
  n += 1;
  const [row] = await tx
    .insert(users)
    .values({ googleSub: `a5reveal:${tag}:${n}`, email: `a5reveal-${tag}-${n}@example.com` })
    .returning({ id: users.id });
  return row.id;
}

/** The instrument: any INSERT into `admin_access_log` raises. */
async function breakTheAuditLog(tx: Tx): Promise<void> {
  await tx.execute(sql`
    create function pg_temp.audit_boom() returns trigger language plpgsql as
      $$ begin raise exception 'audit unavailable'; end $$`);
  await tx.execute(sql`
    create trigger t_audit_boom before insert on admin_access_log
      for each row execute function pg_temp.audit_boom()`);
}

async function fixTheAuditLog(tx: Tx): Promise<void> {
  await tx.execute(sql`drop trigger t_audit_boom on admin_access_log`);
}

/**
 * **A HANDLE WHOSE `insert()` THROWS AND WHOSE READS ALL WORK.**
 *
 * ── THE `pg_temp` TRIGGER ALONE PASSES FOR THE WRONG REASON, AND THAT WAS MEASURED ──
 *
 * The trigger below makes the audit INSERT raise, which **aborts the whole Postgres
 * transaction** — so every later statement answers `25P02` and the reveal rejects *whatever the
 * ordering is*. Verified by injecting the house-style version of `recordAdminAccess` (a `try`
 * that logs and continues) on 2026-07-29: **all twelve tests still passed.** The instrument
 * could not see the one defect it exists to catch, which is R30's own warning arriving in the
 * test file rather than in the code.
 *
 * In production there is no wrapping transaction, so a swallowed audit failure lets the decrypt
 * proceed and returns plaintext with no record. **This proxy is that situation:** the write
 * fails, the reads keep working, and a swallowing `recordAdminAccess` therefore RESOLVES with
 * the plaintext — which is what the assertions below refuse.
 *
 * Both instruments ship. The trigger proves the real driver path raises; the proxy proves the
 * ordering is load-bearing.
 */
function auditWriteFails(tx: Tx): Tx {
  return new Proxy(tx, {
    get(target, key, receiver) {
      if (key === 'insert') {
        return () => {
          throw new Error('audit unavailable');
        };
      }
      return Reflect.get(target, key, receiver);
    },
  }) as Tx;
}

/**
 * Run `fn` inside a SAVEPOINT and assert it rejects, leaving the outer transaction usable.
 *
 * **WITHOUT THE SAVEPOINT THE ASSERTIONS AFTER THE FAILURE CANNOT RUN.** A raised exception
 * aborts the whole transaction — every subsequent statement answers `25P02 current
 * transaction is aborted` — so `expect(auditRows(tx)).toHaveLength(0)` after a thrown reveal
 * fails on the *probe*, not on the claim, and the failure reads as a broken test rather than
 * as a broken invariant. `withAdminRead` opens a savepoint for its own reasons and
 * `delete.integration.test.ts` gets this for free because `deleteAccount` opens one; the
 * reveals deliberately do not (they must not run inside a read-only wrapper, because the
 * audit row is a WRITE), so the test opens it instead.
 */
async function rejectsInside(tx: Tx, fn: (inner: Tx) => Promise<unknown>): Promise<void> {
  await expect(tx.transaction(async (inner) => void (await fn(inner)))).rejects.toThrow();
}

async function auditRows(tx: Tx): Promise<Array<Record<string, unknown>>> {
  const rows = await tx.execute(sql`select * from admin_access_log order by created_at`);
  return rows as unknown as Array<Record<string, unknown>>;
}

describe('an onboarding answer reveal (A5-10)', () => {
  it('FAILS, and returns no plaintext, when the audit write raises', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      await tx.insert(onboardingAnswers).values({
        userId: subject,
        questionKey: 'worst_thing',
        answerText: encryptField('yang paling berat', answerAad(subject, 'worst_thing')),
      });

      await breakTheAuditLog(tx);

      /*
       * **THE ASSERTION THE WHOLE FILE EXISTS FOR.** If `recordAdminAccess` ever acquires
       * a `.catch()` or moves into an `after()`, this resolves with the plaintext instead
       * of rejecting — and nothing else in the suite would notice.
       */
      await rejectsInside(tx, (inner) =>
        revealAnswer(inner, { adminUserId: admin, subjectUserId: subject }, 'worst_thing'),
      );

      await fixTheAuditLog(tx);
      // Nothing was written, so there is nothing to have leaked.
      expect(await auditRows(tx)).toHaveLength(0);
    }));

  it('FAILS when ONLY the write fails and every read still works', () =>
    withRollback(async (tx) => {
      /*
       * **THE ASSERTION THAT ACTUALLY BINDS.** See `auditWriteFails`: the trigger test above
       * passes even against a swallowing `recordAdminAccess`, because the raised exception
       * poisons the transaction and the decrypt cannot run either. Here the reads work, so a
       * swallowed rejection would resolve with `text: 'yang paling berat'` and this rejects.
       */
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      await tx.insert(onboardingAnswers).values({
        userId: subject,
        questionKey: 'worst_thing',
        answerText: encryptField('yang paling berat', answerAad(subject, 'worst_thing')),
      });

      await expect(
        revealAnswer(
          auditWriteFails(tx),
          { adminUserId: admin, subjectUserId: subject },
          'worst_thing',
        ),
      ).rejects.toThrow('audit unavailable');
      expect(await auditRows(tx)).toHaveLength(0);
    }));

  it('succeeds once the audit log works, leaving exactly one row with the KEY', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      await tx.insert(onboardingAnswers).values({
        userId: subject,
        questionKey: 'worst_thing',
        answerText: encryptField('yang paling berat', answerAad(subject, 'worst_thing')),
      });

      const result = await revealAnswer(
        tx,
        { adminUserId: admin, subjectUserId: subject },
        'worst_thing',
      );
      expect(result).toEqual({
        ok: true,
        value: {
          key: 'worst_thing',
          freeText: true,
          text: 'yang paling berat',
          choice: null,
          skipped: false,
        },
      });

      const rows = await auditRows(tx);
      expect(rows).toHaveLength(1);
      expect(rows[0].resource).toBe('onboarding_answer');
      // `resource_key` IS A KEY, NEVER A VALUE. This is the assertion that catches somebody
      // "helpfully" logging what was read.
      expect(rows[0].resource_key).toBe('worst_thing');
      expect(rows[0].admin_user_id).toBe(admin);
      expect(rows[0].subject_user_id).toBe(subject);
      expect(JSON.stringify(rows)).not.toContain('yang paling berat');
    }));

  it('is notFound for a question the stepper never reached, and writes NO row', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');

      const result = await revealAnswer(
        tx,
        { adminUserId: admin, subjectUserId: subject },
        'worst_thing',
      );
      expect(result).toEqual({ ok: false, reason: 'notFound' });
      // A 404 that logged an access would let anybody holding the admin's session salt the
      // subject's own audit trail with reads that never happened.
      expect(await auditRows(tx)).toHaveLength(0);
    }));

  it('returns text: null for a SKIP, and still records the read', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      await tx
        .insert(onboardingAnswers)
        .values({ userId: subject, questionKey: 'worst_thing', skipped: true });

      const result = await revealAnswer(
        tx,
        { adminUserId: admin, subjectUserId: subject },
        'worst_thing',
      );
      expect(result).toMatchObject({ ok: true, value: { text: null, skipped: true } });
      /*
       * A row for a reveal that turned out to have nothing to reveal. Deliberate: whether
       * it was a skip is not knowable without the decrypt this row records, and *an audit
       * trail that over-records is honest; one that under-records is not* (`audit.ts`).
       */
      expect(await auditRows(tx)).toHaveLength(1);
    }));
});

describe('a moderation-question reveal (A5-11)', () => {
  it('writes a row for `available` and returns the plaintext', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      const [flag] = await tx
        .insert(moderationFlags)
        .values({
          userId: subject,
          question: encryptField('teks yang ditandai', moderationFlagAad(subject)),
          questionHmac: 'hmac0123456789abcdef',
          category: 'self_harm',
          source: 'classifier',
          locale: 'id',
        })
        .returning({ id: moderationFlags.id });

      const result = await revealFlag(tx, { adminUserId: admin, subjectUserId: subject }, flag.id);
      expect(result).toEqual({
        ok: true,
        value: { flagId: flag.id, state: 'available', question: 'teks yang ditandai' },
      });

      const rows = await auditRows(tx);
      expect(rows).toHaveLength(1);
      expect(rows[0].resource).toBe('moderation_question');
      expect(rows[0].resource_key).toBe(flag.id);
    }));

  it('writes NO row for `redacted` or `never_stored` (A5-11)', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      const [redacted] = await tx
        .insert(moderationFlags)
        .values({
          userId: subject,
          question: null,
          redactedAt: new Date(),
          questionHmac: 'hmacredacted00000000',
          category: 'self_harm',
          source: 'classifier',
          locale: 'id',
        })
        .returning({ id: moderationFlags.id });
      const [never] = await tx
        .insert(moderationFlags)
        .values({
          userId: subject,
          question: null,
          questionHmac: 'hmacnever00000000000',
          category: 'sexual_minor',
          source: 'classifier',
          locale: 'id',
        })
        .returning({ id: moderationFlags.id });

      const a = await revealFlag(tx, { adminUserId: admin, subjectUserId: subject }, redacted.id);
      const b = await revealFlag(tx, { adminUserId: admin, subjectUserId: subject }, never.id);
      expect(a.ok && a.value.state).toBe('redacted');
      expect(b.ok && b.value.state).toBe('never_stored');

      /*
       * **COUNTED, BEFORE AND AFTER.** Padding the log with no-op reads makes "what has been
       * read about me" wrong in the alarming direction, and that answer is the whole reason
       * `admin_access_log_subject_created_idx` exists.
       */
      expect(await auditRows(tx)).toHaveLength(0);
    }));

  it('FAILS when only the write fails, so no flagged question is decrypted', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      const [flag] = await tx
        .insert(moderationFlags)
        .values({
          userId: subject,
          question: encryptField('teks yang ditandai', moderationFlagAad(subject)),
          questionHmac: 'hmacproxy0000000000',
          category: 'self_harm',
          source: 'classifier',
          locale: 'id',
        })
        .returning({ id: moderationFlags.id });

      await expect(
        revealFlag(auditWriteFails(tx), { adminUserId: admin, subjectUserId: subject }, flag.id),
      ).rejects.toThrow('audit unavailable');
      expect(await auditRows(tx)).toHaveLength(0);
    }));

  it('is notFound for another user flag, though the caller is an admin (A5-16)', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      const other = await seedUser(tx, 'other');
      const [flag] = await tx
        .insert(moderationFlags)
        .values({
          userId: other,
          question: encryptField('rahasia', moderationFlagAad(other)),
          questionHmac: 'hmacother00000000000',
          category: 'self_harm',
          source: 'classifier',
          locale: 'id',
        })
        .returning({ id: moderationFlags.id });

      const result = await revealFlag(tx, { adminUserId: admin, subjectUserId: subject }, flag.id);
      expect(result).toEqual({ ok: false, reason: 'notFound' });
      expect(await auditRows(tx)).toHaveLength(0);
    }));
});

describe('a reading-body reveal (R28)', () => {
  it('audits every 200, including a failed reading with a NULL body', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      const [reading] = await tx
        .insert(readings)
        .values({
          userId: subject,
          readerId: 'adrian',
          serviceId: 'yesno',
          locale: 'id',
          question: 'apakah dia akan kembali',
          status: 'failed',
          body: null,
          model: 'glm-4.6',
          promptVersion: 'p1',
          localDate: '2026-07-20',
        })
        .returning({ id: readings.id });

      const result = await revealReading(
        tx,
        { adminUserId: admin, subjectUserId: subject },
        reading.id,
      );
      expect(result).toMatchObject({
        ok: true,
        // The QUESTION is still returned, which is why the reveal is audited
        // unconditionally: that is plaintext the operator has now read.
        value: { body: null, question: 'apakah dia akan kembali', status: 'failed' },
      });

      const rows = await auditRows(tx);
      expect(rows).toHaveLength(1);
      expect(rows[0].resource).toBe('reading_body');
      expect(rows[0].resource_key).toBe(reading.id);
    }));

  it('FAILS and reads nothing when the audit write raises', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      const [reading] = await tx
        .insert(readings)
        .values({
          userId: subject,
          readerId: 'adrian',
          serviceId: 'yesno',
          locale: 'id',
          question: 'q',
          body: 'empat paragraf yang tidak boleh keluar',
          model: 'glm-4.6',
          promptVersion: 'p1',
          localDate: '2026-07-20',
        })
        .returning({ id: readings.id });

      await breakTheAuditLog(tx);
      await rejectsInside(tx, (inner) =>
        revealReading(inner, { adminUserId: admin, subjectUserId: subject }, reading.id),
      );
      await fixTheAuditLog(tx);
      // And the body never left: with the log broken there is no row, so nothing recorded a
      // read -- which is the property, not the status code.
      expect(await auditRows(tx)).toHaveLength(0);
    }));

  it('FAILS when only the write fails, so no body is read', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      const [reading] = await tx
        .insert(readings)
        .values({
          userId: subject,
          readerId: 'adrian',
          serviceId: 'yesno',
          locale: 'id',
          question: 'q',
          body: 'empat paragraf yang tidak boleh keluar',
          model: 'glm-4.6',
          promptVersion: 'p1',
          localDate: '2026-07-20',
        })
        .returning({ id: readings.id });

      await expect(
        revealReading(
          auditWriteFails(tx),
          { adminUserId: admin, subjectUserId: subject },
          reading.id,
        ),
      ).rejects.toThrow('audit unavailable');
      expect(await auditRows(tx)).toHaveLength(0);
    }));

  it('is notFound for another user reading, writing no row', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      const other = await seedUser(tx, 'other');
      const [reading] = await tx
        .insert(readings)
        .values({
          userId: other,
          readerId: 'adrian',
          serviceId: 'yesno',
          locale: 'id',
          body: 'rahasia',
          model: 'glm-4.6',
          promptVersion: 'p1',
          localDate: '2026-07-20',
        })
        .returning({ id: readings.id });

      expect(
        await revealReading(tx, { adminUserId: admin, subjectUserId: subject }, reading.id),
      ).toEqual({ ok: false, reason: 'notFound' });
      expect(await auditRows(tx)).toHaveLength(0);
    }));
});

describe('opening the detail page is itself a read', () => {
  it('writes user_detail with a NULL resource_key', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      await recordUserDetailView(tx, { adminUserId: admin, subjectUserId: subject });

      const rows = await auditRows(tx);
      expect(rows).toHaveLength(1);
      expect(rows[0].resource).toBe('user_detail');
      expect(rows[0].resource_key).toBeNull();
    }));

  it('throws when the audit log is unavailable, so the page cannot render its panels', () =>
    withRollback(async (tx) => {
      const admin = await seedUser(tx, 'admin');
      const subject = await seedUser(tx, 'subject');
      await breakTheAuditLog(tx);
      await rejectsInside(tx, (inner) =>
        recordUserDetailView(inner, { adminUserId: admin, subjectUserId: subject }),
      );
      await fixTheAuditLog(tx);
      expect(await auditRows(tx)).toHaveLength(0);
    }));
});
