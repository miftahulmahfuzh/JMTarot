/**
 * `/admin/users`' projection against a real Postgres. v0.5.0 / A5, task 6.
 *
 * **THE PAYLOAD FENCE IS THE SUBJECT AND IT IS ASSERTED ON THE RETURNED OBJECT.**
 * `'body' in item === false`, not `item.body === null` — V6's precedent, whose binding reason is
 * VD8 rather than bytes: a query that fetched the column and dropped it has already put the prose
 * in the payload. The assertion runs over **every prose-bearing column name in the schema**, so a
 * future `adminUserList` that starts selecting one of them fails here rather than shipping.
 *
 * The route is not exercised — it reaches `next/server` and the `server-only` singleton, this
 * repo's standing constraint — so the projection is driven directly. `adminUserListPage` is the
 * function the PAGE renders too, which is what stops the two from drifting.
 */
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { llmCalls, readings, users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { adminUserListPage, normalizeQuery } from './userList';

afterAll(closeTestDb);

const RANGE = { from: '2026-07-01', to: '2026-07-31' };
let n = 0;

async function seedUser(tx: Tx, over: { email?: string; name?: string } = {}): Promise<string> {
  n += 1;
  const [row] = await tx
    .insert(users)
    .values({
      googleSub: `a5list:${n}`,
      email: over.email ?? `a5list-${n}@example.com`,
      displayName: over.name ?? `Pengguna ${n}`,
    })
    .returning({ id: users.id });
  return row.id;
}

describe('the list payload carries no prose (A5-8)', () => {
  it('has no key named after any prose column in the schema', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx);
      await tx.insert(readings).values({
        userId: id,
        readerId: 'thessaly',
        serviceId: 'daily',
        locale: 'id',
        question: 'pertanyaan yang tidak boleh ada di daftar',
        body: 'prosa yang tidak boleh ada di daftar',
        gist: 'ringkasan yang tidak boleh ada di daftar',
        model: 'glm-4.6',
        promptVersion: 'p1',
        localDate: '2026-07-20',
      });

      const page = await adminUserListPage(tx, { limit: 50, offset: 0, range: RANGE });
      const item = page.items.find((i) => i.id === id)!;

      for (const key of ['body', 'gist', 'question', 'answerText', 'summary', 'traits', 'facts']) {
        expect(key in item, `list item carries ${key}`).toBe(false);
      }
      // And not merely absent from the keys: absent from the whole serialisation.
      const json = JSON.stringify(page);
      expect(json).not.toContain('tidak boleh ada di daftar');
      expect(json).not.toContain('v1.');
      // The count IS carried -- a league needs numbers (§11.4).
      expect(item.readings).toBe(1);
    }));
});

describe('soft-deleted users appear, badged, always (A5-14, R29)', () => {
  it('returns a soft-deleted account with deletedAt set', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx);
      await tx.execute(sql`update users set deleted_at = now() where id = ${id}`);

      const page = await adminUserListPage(tx, { limit: 50, offset: 0, range: RANGE });
      const item = page.items.find((i) => i.id === id);
      // If this fails, `getUserById`'s `isNull(deletedAt)` has been reused and the thirty-day
      // restore window has become invisible on the one page that could show it.
      expect(item).toBeDefined();
      expect(item!.deleted).toBe(true);
      expect(item!.deletedAt).not.toBeNull();
    }));
});

describe('search touches email and nothing else (A5-13)', () => {
  it('matches an email substring', () =>
    withRollback(async (tx) => {
      await seedUser(tx, { email: 'findme-unique@example.com' });
      const page = await adminUserListPage(tx, {
        q: 'findme-unique',
        limit: 50,
        offset: 0,
        range: RANGE,
      });
      expect(page.items).toHaveLength(1);
      expect(page.items[0].email).toBe('findme-unique@example.com');
    }));

  it('matches NOTHING when pointed at a question text', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx);
      await tx.insert(readings).values({
        userId: id,
        readerId: 'thessaly',
        serviceId: 'daily',
        locale: 'id',
        question: 'kalimatrahasia',
        model: 'glm-4.6',
        promptVersion: 'p1',
        localDate: '2026-07-20',
      });

      // **A free-text search over what querents wrote is a different product**, and it is one
      // `or(...)` away at all times. This is the assertion that fires if somebody adds it.
      const page = await adminUserListPage(tx, {
        q: 'kalimatrahasia',
        limit: 50,
        offset: 0,
        range: RANGE,
      });
      expect(page.items).toHaveLength(0);
    }));

  it('ignores a term shorter than two characters rather than refusing it', () => {
    // A 400 on a keystroke reads as a broken box (§5.3).
    expect(normalizeQuery('a')).toBeUndefined();
    expect(normalizeQuery('  ')).toBeUndefined();
    expect(normalizeQuery(undefined)).toBeUndefined();
    expect(normalizeQuery('ab')).toBe('ab');
    expect(normalizeQuery('x'.repeat(500))).toHaveLength(120);
  });
});

describe('paging', () => {
  it('returns nextOffset only while there is another page, and no duplicate id', () =>
    withRollback(async (tx) => {
      const ids = new Set<string>();
      for (let i = 0; i < 5; i += 1) ids.add(await seedUser(tx));

      const first = await adminUserListPage(tx, { limit: 2, offset: 0, range: RANGE });
      expect(first.items).toHaveLength(2);
      expect(first.nextOffset).toBe(2);

      const second = await adminUserListPage(tx, { limit: 2, offset: 2, range: RANGE });
      const seen = new Set([...first.items, ...second.items].map((i) => i.id));
      expect(seen.size).toBe(4);
    }));
});

describe('the aggregate figures, and what null means', () => {
  it('carries calls and tokens for a user with ledger rows', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx);
      await tx.insert(llmCalls).values({
        userId: id,
        op: 'reading',
        model: 'glm-4.6',
        callClass: 'interactive',
        streamed: true,
        inputTokens: 900,
        outputTokens: 350,
        status: 'ok',
        localDate: '2026-07-20',
      });

      const page = await adminUserListPage(tx, { limit: 50, offset: 0, range: RANGE });
      const item = page.items.find((i) => i.id === id)!;
      expect(item.calls).toBe(1);
      expect(item.inputTokens).toBe(900);
      expect(item.outputTokens).toBe(350);
      /*
       * **`null`, NOT ZERO, AND THE REASON IS ON SCREEN.** `NOTIONAL_MODEL` is deliberately
       * unset — nobody has read a current price page for the fallback provider, and `prices.ts`'s
       * own rule is that nothing unverified enters it. A zero here would silently understate the
       * bill; the column is empty and the note says why.
       */
      expect(item.notionalUsd).toBeNull();
    }));

  it('carries null figures for a user with no ledger rows, never zero', () =>
    withRollback(async (tx) => {
      const id = await seedUser(tx);
      const page = await adminUserListPage(tx, { limit: 50, offset: 0, range: RANGE });
      const item = page.items.find((i) => i.id === id)!;
      // `null` means "not in the aggregate", which is a different claim from "made no calls" --
      // and on a capped league those are genuinely different facts.
      expect(item.calls).toBeNull();
      expect(item.inputTokens).toBeNull();
    }));
});
