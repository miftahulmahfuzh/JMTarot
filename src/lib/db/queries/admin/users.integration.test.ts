/**
 * `users.ts` and the composite `rollup.ts` against a real Postgres. A3, v0.5.0.
 *
 * Two subjects that are easy to get wrong quietly: **`min/max(local_date)` come back as
 * strings** (the direct descendant of V8's `answersUpdatedAt`, which asserted `Date`,
 * got a string, and judged every answer edit wrongly with a green suite), and **a
 * soft-deleted user is returned and flagged** (R29 -- reusing `getUserById`, which
 * filters `isNull(deleted_at)`, would 404 the page that exists to show them).
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { llmCalls, profiles, readings, users, type NewLlmCall } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { DbOrTx, Tx } from '@/lib/db/types';
import { FLEET_ROLLUP_QUERIES, fleetRollup } from './rollup';
import {
  USER_LIST_MAX,
  adminUserById,
  adminUserList,
  userCallsByLocalDate,
  userCostLeague,
  userTotals,
} from './users';

afterAll(closeTestDb);

let n = 0;

async function seedUser(tx: Tx, over: Partial<typeof users.$inferInsert> = {}): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `au:${n}`, email: `au-${n}@example.com`, ...over })
    .returning({ id: users.id });
  return user.id;
}

function row(over: Partial<NewLlmCall> & Pick<NewLlmCall, 'op' | 'localDate'>): NewLlmCall {
  return {
    model: 'glm-4.6',
    callClass: 'interactive',
    streamed: false,
    status: 'ok',
    locale: 'id',
    createdAt: new Date(`${over.localDate}T12:00:00Z`),
    ...over,
  };
}

const RANGE = { from: '2026-07-20', to: '2026-07-22' };

describe('M11 -- userTotals', () => {
  it("excludes the other user's rows, and the dates are STRINGS", () =>
    withRollback(async (tx) => {
      const mine = await seedUser(tx);
      const theirs = await seedUser(tx);
      await tx.insert(llmCalls).values([
        row({ op: 'reading', userId: mine, localDate: '2026-07-20', inputTokens: 100, outputTokens: 10 }),
        row({ op: 'gist', userId: mine, localDate: '2026-07-22', inputTokens: 50, outputTokens: 5 }),
        row({ op: 'reading', userId: theirs, localDate: '2026-07-21', inputTokens: 9999, outputTokens: 999 }),
      ]);

      const totals = await userTotals(tx, mine, RANGE);
      expect(totals.calls).toBe(2);
      expect(totals.inputTokens).toBe(150);
      expect(totals.outputTokens).toBe(15);
      expect(typeof totals.calls).toBe('number');
      expect(typeof totals.inputTokens).toBe('number');

      /*
       * **THE DIRECT DESCENDANT OF THE `answersUpdatedAt` BUG.** `local_date` is
       * `date` with `mode: 'string'`, but that mapping is Drizzle's and there is no
       * mapper inside a raw aggregate -- so `min()` is a string either way and the
       * type has to say so. `topCardAllTime`'s `lastSeen: sql<string>` is already
       * right for the same reason.
       */
      expect(typeof totals.firstLocalDate).toBe('string');
      expect(totals.firstLocalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(totals.firstLocalDate).toBe('2026-07-20');
      expect(totals.lastLocalDate).toBe('2026-07-22');
    }));

  it('A MALFORMED UUID RETURNS ZEROES AND THROWS NOTHING -- 22P02 never surfaces', () =>
    withRollback(async (tx) => {
      // Postgres raises 22P02 on a malformed uuid literal, so without the guard a bad
      // id in a URL is a 500 rather than an empty page.
      await expect(userTotals(tx, 'not-a-uuid', RANGE)).resolves.toEqual({
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        firstLocalDate: null,
        lastLocalDate: null,
      });
      await expect(userCallsByLocalDate(tx, 'not-a-uuid', RANGE)).resolves.toEqual([]);
      await expect(adminUserById(tx, 'not-a-uuid')).resolves.toBeNull();
    }));

  it('is zeroes with NULL dates for a user who did nothing in the range', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx);
      const totals = await userTotals(tx, id, RANGE);
      expect(totals.calls).toBe(0);
      expect(totals.firstLocalDate).toBeNull();
    }));
});

describe('M12 -- userCostLeague', () => {
  it('orders by output tokens and keeps a NULL user_id as its own row', () =>
    withRollback(async (tx) => {
      /*
       * `llm_calls.user_id` is `on delete set null`, so a hard-deleted user's history
       * survives with the attribution gone -- and **the tokens were still spent.**
       * Dropping the row would understate the fleet; the caller labels it
       * `'(deleted or system)'`. The consequence the page has to state is that
       * cost-per-user denominators shift over time.
       */
      const a = await seedUser(tx);
      const b = await seedUser(tx);
      await tx.insert(llmCalls).values([
        row({ op: 'reading', userId: a, localDate: '2026-07-20', outputTokens: 100 }),
        row({ op: 'reading', userId: b, localDate: '2026-07-20', outputTokens: 500 }),
        row({ op: 'translation_repair', localDate: '2026-07-20', outputTokens: 900 }),
      ]);

      const league = await userCostLeague(tx, RANGE);
      expect(league).toHaveLength(3);
      expect(league[0].userId).toBeNull();
      expect(league[0].outputTokens).toBe(900);
      expect(league[1].userId).toBe(b);
      expect(league[2].userId).toBe(a);
      expect(typeof league[0].outputTokens).toBe('number');
    }));

  it('splits one user across two models rather than summing them', () =>
    withRollback(async (tx) => {
      // A9: a sum across models is unpriceable, because A-D7 prices per model per
      // period.
      const a = await seedUser(tx);
      await tx.insert(llmCalls).values([
        row({ op: 'reading', userId: a, localDate: '2026-07-20', outputTokens: 100 }),
        row({ op: 'moderation', userId: a, localDate: '2026-07-20', model: 'glm-4.5-flash', outputTokens: 5 }),
      ]);
      const league = await userCostLeague(tx, RANGE);
      expect(league.map((r) => r.model)).toEqual(['glm-4.6', 'glm-4.5-flash']);
    }));

  it('CAPS THE LIMIT AT 200 even when asked for 10,000', () =>
    withRollback(async (tx) => {
      // The cap is applied in TypeScript so a caller cannot ask for the whole fleet
      // through a query shaped for a top-N.
      const a = await seedUser(tx);
      await tx.insert(llmCalls).values([row({ op: 'reading', userId: a, localDate: '2026-07-20' })]);
      // The cap is only observable through the emitted SQL at this row count, so it
      // is asserted on the constant and on the fact that a huge ask still answers.
      expect(USER_LIST_MAX).toBe(200);
      await expect(userCostLeague(tx, RANGE, 10_000)).resolves.toHaveLength(1);
    }));
});

describe('M13 -- userCallsByLocalDate', () => {
  it("returns only this user's days, as bucket strings", () =>
    withRollback(async (tx) => {
      const a = await seedUser(tx);
      const b = await seedUser(tx);
      await tx.insert(llmCalls).values([
        row({ op: 'reading', userId: a, localDate: '2026-07-20' }),
        row({ op: 'gist', userId: a, localDate: '2026-07-20' }),
        row({ op: 'reading', userId: a, localDate: '2026-07-22' }),
        row({ op: 'reading', userId: b, localDate: '2026-07-21' }),
      ]);
      const days = await userCallsByLocalDate(tx, a, RANGE);
      // NOT zero-filled, unlike M2: a sparkline for one person over a long range is
      // mostly zeroes, and the caller knows the range it asked for.
      expect(days).toEqual([
        { bucket: '2026-07-20', calls: 2 },
        { bucket: '2026-07-22', calls: 1 },
      ]);
    }));
});

describe('R29 -- a soft-deleted user is VISIBLE and LABELLED', () => {
  it('returns a soft-deleted account, flagged, from both functions', () =>
    withRollback(async (tx) => {
      /*
       * `getUserById` filters `isNull(users.deletedAt)` (`profile.ts:68`) and is right
       * to for the querent's own profile. Reusing it here would make roadmap §7's
       * "visible AND LABELLED" fail **silently**: the admin page would 404 and read
       * like a bad id, and the thirty-day restore window would be invisible with it.
       */
      const id = await seedUser(tx);
      const deletedAt = new Date('2026-07-19T10:00:00Z');
      await tx.update(users).set({ deletedAt }).where(eq(users.id, id));

      const one = await adminUserById(tx, id);
      expect(one).not.toBeNull();
      expect(one?.deleted).toBe(true);
      expect(one?.deletedAt).not.toBeNull();

      const list = await adminUserList(tx);
      expect(list.some((u) => u.id === id)).toBe(true);
      expect(list.find((u) => u.id === id)?.deleted).toBe(true);
    }));

  it('flags a live account as not deleted', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx);
      const one = await adminUserById(tx, id);
      expect(one?.deleted).toBe(false);
      expect(one?.deletedAt).toBeNull();
    }));

  it('is null for an unknown id rather than throwing', () =>
    withRollback(async (tx) => {
      await expect(
        adminUserById(tx, '00000000-0000-4000-8000-000000000000'),
      ).resolves.toBeNull();
    }));
});

describe('adminUserList', () => {
  it('CARRIES NO body, NO gist AND NO DECRYPTED ANSWER -- asserted on the object', () =>
    withRollback(async (tx) => {
      /*
       * V6's precedent, and the binding reason is VD8 rather than bytes. A decrypted
       * onboarding answer leaves the server only through the one-key endpoint; a list
       * query is exactly the shape a bulk read would arrive as.
       */
      const id = await seedUser(tx);
      await tx.insert(profiles).values({
        userId: id,
        fullName: 'Test Querent',
        nickname: 'Test',
        birthDate: '1990-01-01',
        completedAt: new Date('2026-07-01T00:00:00Z'),
      });
      await tx.insert(readings).values({
        userId: id,
        readerId: 'thessaly',
        serviceId: 'spread3',
        locale: 'id',
        localDate: '2026-07-20',
        model: 'glm-4.6',
        promptVersion: 'id-v1.testtest',
        body: 'the prose a stranger must never see in a list payload',
        gist: 'a gist',
      });

      const [item] = await adminUserList(tx, { search: 'au-' });
      expect('body' in item).toBe(false);
      expect('gist' in item).toBe(false);
      expect('question' in item).toBe(false);
      expect('answerText' in item).toBe(false);
      expect(Object.keys(item).sort()).toEqual(
        [
          'createdAt',
          'deleted',
          'deletedAt',
          'displayName',
          'email',
          'id',
          'lastSeenAt',
          'locale',
          'nickname',
          'onboardedAt',
          'readings',
        ].sort(),
      );
      expect(item.readings).toBe(1);
      expect(typeof item.readings).toBe('number');
      expect(item.onboardedAt).not.toBeNull();
    }));

  it('searches on email and escapes the LIKE metacharacters', () =>
    withRollback(async (tx) => {
      const hit = await seedUser(tx, { email: 'findme@example.com', googleSub: 'au:find' });
      await seedUser(tx, { email: 'someone@example.com', googleSub: 'au:other' });

      expect((await adminUserList(tx, { search: 'findme' })).map((u) => u.id)).toEqual([hit]);
      // `_` is a LIKE wildcard; unescaped, this would match `findme` too.
      expect(await adminUserList(tx, { search: 'find_e' })).toEqual([]);
    }));

  it('returns a user with no profile row rather than dropping them', () =>
    withRollback(async (tx) => {
      // A half-onboarded account is exactly the one an operator is looking for, and an
      // inner join would hide it.
      const id = await seedUser(tx);
      const [only] = await adminUserList(tx, { search: 'au-' });
      expect(only.id).toBe(id);
      expect(only.nickname).toBeNull();
      expect(only.onboardedAt).toBeNull();
    }));
});

describe('the composite fleetRollup', () => {
  it('issues a BOUNDED number of queries, asserted with a counting wrapper', () =>
    withRollback(async (tx) => {
      /*
       * Every admin request is a COLD one -- one admin, no warm instance -- so the
       * first query of a session also wakes a suspended Neon compute. A later "just
       * add one more metric" has to be visible as a regression rather than as a
       * slightly slower page nobody measures.
       */
      let queries = 0;
      const counting = new Proxy(tx as unknown as object, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (prop !== 'execute' || typeof value !== 'function') return value;
          return (...args: unknown[]) => {
            queries += 1;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        },
      }) as DbOrTx;

      await fleetRollup(counting, RANGE);
      expect(queries).toBe(FLEET_ROLLUP_QUERIES);
    }));

  it('composes the M-functions rather than re-writing their SQL', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx);
      await tx.insert(llmCalls).values([
        row({ op: 'reading', userId: id, localDate: '2026-07-20', outputTokens: 400 }),
        row({ op: 'gist', userId: id, localDate: '2026-07-20', outputTokens: 30 }),
      ]);
      await tx.insert(readings).values({
        userId: id,
        readerId: 'thessaly',
        serviceId: 'spread3',
        locale: 'id',
        localDate: '2026-07-20',
        model: 'glm-4.6',
        promptVersion: 'id-v1.testtest',
        latencyMs: 400,
      });

      const out = await fleetRollup(tx, RANGE);
      // Every field agrees with the function it came from -- one definition per
      // metric, or the dashboard and the documented query drift.
      expect(out.callsByUtcDay).toHaveLength(3);
      expect(out.callsByUtcDay[0].calls).toBe(2);
      expect(out.peak5h?.calls).toBe(2);
      expect(out.byOp.map((o) => o.op).sort()).toEqual(['gist', 'reading']);
      expect(out.models.map((m) => m.model)).toEqual(['glm-4.6']);
      expect(out.readings[0].readings).toBe(1);
      expect(out.activeUsers).toBe(1);
      expect(out.ttft[0].p50Ms).toBe(400);
      expect(out.range).toEqual(RANGE);
    }));

  it('answers an empty database with empty series and a NULL peak', () =>
    withRollback(async (tx) => {
      const out = await fleetRollup(tx, RANGE);
      // Zero-filled series, not an empty array -- the chart's x-axis is the range the
      // caller asked for. But the peak is null: "no calls" and "no data" differ.
      expect(out.callsByUtcDay.map((r) => r.calls)).toEqual([0, 0, 0]);
      expect(out.peak5h).toBeNull();
      expect(out.byOp).toEqual([]);
      expect(out.activeUsers).toBe(0);
    }));

  it('refuses an unusable range without touching the database twice over', () =>
    withRollback(async (tx) => {
      const out = await fleetRollup(tx, { from: '2026-07-22', to: '2026-07-20' });
      expect(out.callsByUtcDay).toEqual([]);
      expect(out.peak5h).toBeNull();
      expect(out.activeUsers).toBe(0);
      // And nothing threw -- an operator typing a backwards range gets an empty page,
      // not a 500.
      expect(out.range).toEqual({ from: '2026-07-22', to: '2026-07-20' });
    }));
});

describe('the whole thing inside withAdminRead', () => {
  it('runs read-only end to end', () =>
    withRollback(async (tx) => {
      // The composite is what `/admin` calls, and it calls it inside the read-only
      // block. Proving the two compose is cheaper than discovering they do not on a
      // cold lambda.
      const { withAdminRead } = await import('./timeout');
      const out = await withAdminRead(tx, (t) => fleetRollup(t, RANGE));
      expect(out.range).toEqual(RANGE);
      // And the surrounding transaction is still writable afterwards.
      await tx.execute(sql`select 1`);
      await seedUser(tx);
    }));
});
