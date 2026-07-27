import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The sweep route's statements are duplicated in `sweep.integration.test.ts`,
 * and this is what stops the copies drifting apart.
 *
 * **DUPLICATION WAS THE LESSER EVIL.** Importing the route into Vitest pulls in
 * `next/server` and the `server-only` database singleton, so the SQL would go
 * untested -- and the SQL is the only part that can be wrong in a way nobody
 * notices for thirty days. So the integration test re-declares each statement,
 * and this file asserts the route still contains the clause that makes each one
 * what it is.
 *
 * If a statement changes, both files change. That is the intended friction: an
 * edit to a `DELETE` that runs unattended against production should cost a
 * second file.
 */
const ROUTE = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'cron', 'sweep', 'route.ts'),
  'utf8',
);

describe('the cron sweep route', () => {
  it('does all three deletes, not one', () => {
    // Reconciliation §7.8: ONE job, THREE deletes. Three separate cron entries
    // would be three things to notice have stopped working.
    expect(ROUTE).toContain('delete from users');
    expect(ROUTE).toContain('update moderation_flags');
    expect(ROUTE).toContain('delete from events');
  });

  it('casts every interval parameter to int', () => {
    /*
     * **THE ONE THAT FAILS THIRTY DAYS AFTER LAUNCH.** A bound parameter reaches
     * Postgres as `text` and `make_interval` has no `text` overload, so an
     * uncast parameter is a runtime error on a path that first executes a month
     * in, inside a job nobody is watching.
     */
    /*
     * One level of nesting allowed: two of the three arguments are function
     * CALLS, so a plain `[^)]*` stops at their own closing paren and reports
     * `${moderationRetentionDays(` as uncast against a route that is fine.
     */
    const intervals = [
      ...ROUTE.matchAll(/make_interval\(days => ((?:[^()]|\([^()]*\))*)\)/g),
    ].map((m) => m[1]);
    expect(intervals.length).toBe(3);
    for (const arg of intervals) {
      expect({ arg, cast: arg.includes('::int') }).toEqual({ arg, cast: true });
    }
  });

  it('purges users by deleted_at, never by created_at', () => {
    // Deleting by `created_at` would erase every account older than thirty days
    // -- which is to say, all of them. It is one word.
    /*
     * `[^`]*` and not `[\s\S]*`: the loose form runs past the end of this
     * statement and finds the events sweep's `where created_at`, so the negative
     * assertion failed against a correct route. Bounding the match to one
     * template literal keeps it about the statement it names.
     */
    expect(ROUTE).toMatch(/delete from users[^`]*deleted_at is not null/);
    expect(ROUTE).not.toMatch(/delete from users[^`]*where created_at/);
  });

  it('redacts moderation text rather than deleting the row', () => {
    // The row is the tuning signal and is not personal data once the text is
    // gone. A `delete from moderation_flags` would throw away the only record of
    // how often the gate fires and how often it is wrong.
    expect(ROUTE).not.toContain('delete from moderation_flags');
    expect(ROUTE).toContain('set question = null, redacted_at = now()');
  });

  it('never puts readings on the events clock', () => {
    /*
     * §7.9b, and the privacy policy says it in those words. Every memory feature
     * reads `readings`; expiring them at 180 days would silently amputate the
     * app's memory and make the policy wrong at the same time.
     */
    expect(ROUTE).not.toContain('delete from readings');
    expect(ROUTE).not.toContain('delete from reading_cards');
  });

  it('refuses to run without CRON_SECRET, and compares it in constant time', () => {
    // An open endpoint that deletes rows is worse than a sweep that never runs.
    expect(ROUTE).toContain('CRON_SECRET');
    expect(ROUTE).toContain('503');
    expect(ROUTE).toContain('timingSafeEqual');
  });

  it('logs error classes, never the error object', () => {
    /*
     * A postgres error quotes the failing statement AND its bound parameters,
     * and one of these statements is about `moderation_flags`. `console.error(…,
     * err)` here would put the most sensitive text in the product into the
     * platform log -- outside the retention policy this very job enforces.
     */
    expect(ROUTE).not.toMatch(/console\.error\([^)]*,\s*err\s*\)/);
    expect(ROUTE).toContain("err instanceof Error ? err.name : 'unknown'");
  });
});

describe('vercel.json', () => {
  const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));

  it('schedules the sweep once a day', () => {
    /*
     * `vercel.json` cannot hold comments, so the reasoning lives here.
     *
     * **03:17 UTC is 10:17 in Jakarta and is deliberately not on the hour.**
     * Every cron on every platform fires at :00, so an off-minute avoids the
     * worst of the shared-infrastructure contention. Daily rather than hourly
     * because all three deletes are keyed to day-granularity windows -- running
     * it twelve times more often would do the same work twelve times.
     */
    expect(config.crons).toEqual([{ path: '/api/cron/sweep', schedule: '17 3 * * *' }]);
  });

  it('schedules exactly one job', () => {
    // §7.8: one job, three deletes. Not three jobs.
    expect(config.crons).toHaveLength(1);
  });
});
