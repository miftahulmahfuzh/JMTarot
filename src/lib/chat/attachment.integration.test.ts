/**
 * F6's loop 2, and it is one seam rather than one function.
 *
 * `readingWithCards` is not new and V6's suite already proves ownership is a `where`
 * predicate. **What is new is the caller: a wrong answer here becomes a PROMPT** — a
 * fenced `<lampiran>` block read aloud by three characters — and a compact card in a
 * chat log. So the assertions below compose the real query with F6's pure projection
 * and ask the question in F6's own terms: *what does the room end up holding?*
 *
 * The alternative — asserting `readingWithCards` returns null again — would test V6's
 * code a second time and F6's not at all.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { insertReading, readingWithCards } from '@/lib/db/queries/history';
import { users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { attachable, attachmentsFrom, toAttachmentPreview } from './attachmentView';

afterAll(closeTestDb);

const DAY = '2026-08-02';

async function makeUser(tx: Tx, sub: string): Promise<string> {
  const [u] = await tx
    .insert(users)
    .values({ googleSub: sub, email: `${sub}@example.com` })
    .returning();
  return u.id;
}

async function reading(
  tx: Tx,
  userId: string,
  o: { body?: string | null; status?: 'ok' | 'partial' | 'failed' } = {},
): Promise<string> {
  const row = await insertReading(
    tx,
    {
      userId,
      readerId: 'margaret',
      serviceId: 'spread3',
      locale: 'id',
      model: 'test',
      promptVersion: 'id-v1.testtest',
      localDate: DAY,
      body: o.body === undefined ? 'Yang udah lewat — The Tower terbalik.\n\nJadi begitu.' : o.body,
      status: o.status ?? 'ok',
      question: 'mending resign apa bertahan tahun depan?',
      verdict: null,
    },
    [
      { cardId: 16, reversed: true, position: 0 },
      { cardId: 9, reversed: false, position: 1 },
      { cardId: 6, reversed: false, position: 2 },
    ],
  );
  return row.id;
}

describe('a reading resolved for the room', () => {
  it('projects the owner’s reading into exactly what the bubble draws', async () => {
    await withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:attach-owner');
      const id = await reading(tx, user);

      const row = await readingWithCards(tx, user, id);
      expect(row).not.toBeNull();

      const map = attachmentsFrom([row]);
      expect(Object.keys(map)).toEqual([id]);
      expect(map[id].cards).toEqual([
        { cardId: 16, reversed: true, position: 0 },
        { cardId: 9, reversed: false, position: 1 },
        { cardId: 6, reversed: false, position: 2 },
      ]);
      // The snippet is prose with the paragraph break collapsed, and the body itself
      // never crosses the wire (`[F6-8]`).
      expect(map[id].snippet).toBe('Yang udah lewat — The Tower terbalik. Jadi begitu.');
      expect('body' in map[id]).toBe(false);
      // `local_date` is the querent's day and stays a string.
      expect(map[id].localDate).toBe(DAY);
    });
  });

  it('resolves a staged attachment belonging to somebody else to NOTHING', async () => {
    /*
     * `[F6-6]`, at the seam it matters. The id rides the URL — `[F6-5]` puts it there
     * deliberately, because it is not a secret and a query param survives a reload —
     * and the only thing between a typed id and a stranger's reading entering three
     * prompts is that every read is predicated on the caller.
     *
     * **The empty map is the whole answer**: no entry means no preview, and §8's table
     * says an absent preview draws nothing at all rather than an error.
     */
    await withRollback(async (tx) => {
      const mine = await makeUser(tx, 'dev:attach-mine');
      const theirs = await makeUser(tx, 'dev:attach-theirs');
      const id = await reading(tx, theirs);

      expect(attachmentsFrom([await readingWithCards(tx, mine, id)])).toEqual({});
      // ...and the owner still resolves it, so this is not passing on a missing row.
      expect(Object.keys(attachmentsFrom([await readingWithCards(tx, theirs, id)]))).toEqual([id]);
    });
  });

  it('leaves a `failed` reading resolvable and unattachable, which is the page’s job', () => {
    /*
     * The query does NOT filter status — it filters `blocked` — so `/chat`'s staging
     * applies `attachable()` on the row it got back. Stated as a test because the two
     * filters live in different files and the second one looks redundant until you ask
     * what `?attach=<a failed reading>` would otherwise put in the composer.
     */
    return withRollback(async (tx) => {
      const user = await makeUser(tx, 'dev:attach-failed');
      const id = await reading(tx, user, { status: 'failed', body: null });

      const row = await readingWithCards(tx, user, id);
      expect(row).not.toBeNull();
      expect(attachable(row!)).toBe(false);
      // And if it ever were staged, the projection would still not throw.
      expect(toAttachmentPreview(row!).snippet).toBe('');
    });
  });
});
