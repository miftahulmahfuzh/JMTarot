/**
 * `/api/cron/nudge` — the gate, and the shape of an invocation that does nothing.
 *
 * **THE SQL IS TESTED ONE DIRECTORY OVER**, in `chat/proactive/detect.integration.test.ts`:
 * the TTL reap with its leased negative control, and the candidate query with its
 * never-opened, in-flight and erased negative controls. `sweep.integration.test.ts` makes
 * the same split for the same reason — *what is tested is the thing that can actually be
 * wrong* — and what is left here is the half that only exists in the route: **the
 * authorisation, and the promise that a nudge with nobody to nudge is a clean 200 rather
 * than a 500 in a job nobody watches.**
 *
 * The route IS imported here, unlike the sweep's, because its statements live in query
 * modules rather than inline — so importing costs one module graph and buys the real
 * `authorize`. It reaches no model in any case below: two return before the database is
 * even opened, and the third runs with generation switched off.
 */
import { config } from 'dotenv';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeTestDb } from '@/lib/db/testing/harness';

config({ path: '.env.local', quiet: true });

afterAll(closeTestDb);

const SECRET = 'f5-nudge-test-secret-0000000000000';
let savedSecret: string | undefined;
let savedFlag: string | undefined;

beforeEach(() => {
  savedSecret = process.env.CRON_SECRET;
  savedFlag = process.env.CHAT_PROACTIVE_ENABLED;
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
  if (savedFlag === undefined) delete process.env.CHAT_PROACTIVE_ENABLED;
  else process.env.CHAT_PROACTIVE_ENABLED = savedFlag;
});

function call(auth?: string): Promise<Response> {
  return import('./route').then(({ GET }) =>
    GET(new Request('https://example.test/api/cron/nudge', {
      headers: auth ? { authorization: auth } : {},
    })),
  );
}

describe('the gate ([F5-16])', () => {
  it('503s when CRON_SECRET is not set, rather than running unauthenticated', async () => {
    /*
     * `sweep`'s header argues that an open endpoint which deletes rows is worse than a
     * sweep that never runs. This one does not delete — it **writes rows into other
     * people's chat rooms and fans out over every user**, so an open version of it is a
     * way to make the app message everybody.
     */
    delete process.env.CRON_SECRET;
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(503);
  });

  it('401s on a mismatch, and on a presented secret of the wrong length', async () => {
    process.env.CRON_SECRET = SECRET;
    expect((await call('Bearer wrong')).status).toBe(401);
    /* `timingSafeEqual` throws on unequal lengths, so the length is checked first rather
     * than padded around — and a missing header must not crash the route. */
    expect((await call()).status).toBe(401);
    expect((await call(`Bearer ${SECRET}x`)).status).toBe(401);
  });
});

describe('an invocation with nothing to do', () => {
  it('is a clean 200 with zeroes, not a 500', async () => {
    /*
     * *"Counts, never rows… zeroes forever is a job that has silently stopped matching
     * anything."* The distinction only means something if a quiet night is green: a job
     * that goes red when there is nothing to do is a job whose red stops being read.
     *
     * `CHAT_PROACTIVE_ENABLED=0` switches phases 2 and 3 off, **and phase 1 still runs**
     * — abandoning a stale run is bookkeeping rather than generation, and leaving a
     * backlog to rot behind a kill switch is how the switch becomes one you cannot turn
     * back on.
     */
    process.env.CRON_SECRET = SECRET;
    process.env.CHAT_PROACTIVE_ENABLED = '0';

    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.generating).toBe(false);
    expect(body.candidates).toBe(0);
    expect(body.minted).toBe(0);
    expect(body.advanced).toBe(0);
    expect(body.failures).toEqual([]);
    /* The day is the CRON's UTC day and it is reported, because §4.8's one honest
     * inaccuracy is only auditable if the log says which day it used. */
    expect(body.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
