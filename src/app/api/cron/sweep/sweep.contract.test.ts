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

/**
 * The route with every comment removed.
 *
 * **TWO ASSERTIONS HERE HAVE TO USE THIS AND THE REASON IS THIS FILE'S OWN
 * PRECEDENT.** `queries/contract.test.ts` records it in one line -- *"a rule that
 * fires on prose describing the rule is a rule people delete"* -- and A3 walked
 * into it twice in one commit: the header explains why `admin_access_log` is never
 * swept (so the string appears), and the retention parser's comment quotes the
 * `make_interval(days => 0)` disaster it prevents (so the count was 5, not 4).
 *
 * Everything else still matches the whole file, deliberately: a commented-out
 * `delete from readings` is worth failing on.
 */
const CODE = ROUTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the cron sweep route', () => {
  it('does all six deletes, not one', () => {
    // Reconciliation §7.8: ONE job, SIX deletes now. Six separate cron entries
    // would be six things to notice have stopped working.
    expect(ROUTE).toContain('delete from users');
    expect(ROUTE).toContain('update moderation_flags');
    expect(ROUTE).toContain('delete from events');
    expect(ROUTE).toContain('deleteOrphanTranslations');
    expect(ROUTE).toContain('delete from llm_calls');
    expect(ROUTE).toContain('deleteExpiredHandoffs');
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
      ...CODE.matchAll(/make_interval\(days => ((?:[^()]|\([^()]*\))*)\)/g),
    ].map((m) => m[1]);
    expect(intervals.length).toBe(4);
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
    expect(config.crons).toContainEqual({ path: '/api/cron/sweep', schedule: '17 3 * * *' });
  });

  it('schedules the sweep as ONE job, and v0.7.0 adds a SECOND job that is not it', () => {
    /*
     * §7.8's rule is unchanged: **one job, five deletes.** Five separate entries for the
     * five deletes would be five things to notice have stopped working. This case used to
     * assert `toHaveLength(1)` over the whole file, which conflated *"the sweep is one
     * job"* with *"the project has one job"* — and only the first was ever the ruling.
     *
     * **v0.7.0's `[R3]` is why the second exists.** The scarcity the old assertion was
     * written against is gone: verified 2026-08-07 against
     * `vercel.com/docs/cron-jobs/usage-and-pricing` and the changelog entry *"Cron jobs
     * now support 100 per project on every plan"* (2026-01-20) — **100 jobs on Hobby**,
     * minimum interval once per day. F5's nudge therefore gets its own entry rather than
     * folding in here, and the fold is not designed.
     *
     * **`0 12 * * *` IS 19:00 WIB, NOT NOON** (`[R4]`): Vercel cron schedules are always
     * UTC, the same fact that makes the sweep's `17 3` a mid-morning job rather than the
     * 3am the v0.7.0 roadmap built an argument on.
     */
    expect(config.crons.filter((c: { path: string }) => c.path === '/api/cron/sweep')).toHaveLength(1);
    expect(config.crons).toEqual([
      { path: '/api/cron/sweep', schedule: '17 3 * * *' },
      { path: '/api/cron/nudge', schedule: '0 12 * * *' },
    ]);
  });
});

describe('the fourth delete (V2)', () => {
  it('reaps orphaned translations, and reports the count', () => {
    // The counts are what tell you the job is alive: a key that is always zero is
    // a sweep that has silently stopped matching anything.
    expect(ROUTE).toContain('deleteOrphanTranslations');
    expect(ROUTE).toContain('orphanedTranslations');
  });

  /*
   * **IT RUNS LAST, AND THAT IS NOT ALPHABETICAL.** The user purge CASCADEs
   * `readings` away, and their translations are NOT reached by that cascade —
   * `entity_id` has no foreign key. So they become orphans DURING this invocation,
   * and reaping last catches them the same night while reaping first leaves them a
   * day.
   *
   * Asserted on source position, which is crude and is the only thing that can be
   * asserted here: the route is not exercised in tests because it reaches
   * `next/server` and the `server-only` singleton.
   */
  it('runs after the user purge, so same-invocation orphans are caught', () => {
    expect(ROUTE.indexOf('delete from users')).toBeLessThan(
      ROUTE.indexOf('deleteOrphanTranslations'),
    );
  });

  it('keeps the header’s numbered list in step with the number of deletes', () => {
    // The header opens with a stated count. It said THREE, V2 made it four, A3
    // made it five, and the standalone sign-in handoff makes it six. **A header
    // that miscounts its own body is how the next person concludes the file is
    // untrustworthy**, so the sentence is EDITED rather than appended to.
    expect(ROUTE).toMatch(/SIX DELETES/);
    expect(ROUTE).not.toMatch(/FIVE DELETES/);
    expect(ROUTE).toMatch(/^\s*\*\s*4\.\s/m);
    expect(ROUTE).toMatch(/^\s*\*\s*5\.\s/m);
    expect(ROUTE).toMatch(/^\s*\*\s*6\.\s/m);
  });
});

describe('the sixth delete (the standalone sign-in handoff)', () => {
  it('reaps expired handoffs, and reports the count', () => {
    // The counts are what tell you the job is alive. A key that is always zero is
    // a sweep that has silently stopped matching anything -- or, here, a feature
    // nobody is using, which is worth being able to tell apart.
    expect(ROUTE).toContain('deleteExpiredHandoffs');
    expect(ROUTE).toContain('expiredHandoffs');
  });

  it('takes no retention variable, because the window is a property of the row', () => {
    /*
     * `expires_at` is written at insert from `HANDOFF_TTL_SECONDS`. A
     * `HANDOFF_RETENTION_DAYS` here would be a SECOND opinion about the same
     * window, settable in a dashboard, and `llm_calls`'s own parser records what
     * happens when one of those defaults to zero.
     */
    expect(CODE).not.toContain('HANDOFF_RETENTION');
    expect(CODE).not.toMatch(/handoff[^`]*make_interval/i);
  });
});

describe('the fifth delete (A3, v0.5.0)', () => {
  it('deletes llm_calls by created_at, on its own variable, defaulting to 400', () => {
    expect(ROUTE).toContain('LLM_CALLS_RETENTION_DAYS');
    expect(ROUTE).toMatch(/delete from llm_calls[^`]*created_at < now\(\)/);
    expect(ROUTE).toContain(': 400');
  });

  it('GUARDS THE PARSE WITH BOTH HALVES, or a typo empties the table', () => {
    /*
     * `Number('abc')` is NaN and `Number('')` is 0. Without `> 0` a blank value in
     * the Vercel dashboard becomes `make_interval(days => 0)` and the first run at
     * 03:17 deletes everything. `auth/ttl.ts`'s defensiveness with a sharper
     * consequence.
     */
    expect(ROUTE).toMatch(/Number\.isFinite\(raw\) && raw > 0 \? raw : 400/);
  });

  it('runs LAST, after the orphaned-translation reap', () => {
    // The user purge CASCADEs `readings` away and both of `llm_calls`' FKs are
    // `set null`, so rows become partially unattributed DURING this invocation.
    expect(ROUTE.indexOf('deleteOrphanTranslations')).toBeLessThan(
      ROUTE.indexOf('delete from llm_calls'),
    );
  });

  it('logs the size probe UNCONDITIONALLY, because a size series is only useful as a series', () => {
    // Unlike the ceiling warning, which fires only when there is something to say.
    // This is the measurement R19's number was calculated without.
    expect(ROUTE).toContain('pg_total_relation_size');
    expect(ROUTE).toContain('[llm_calls] rows=');
    // Not inside an `if`: the log call sits directly in the try block.
    expect(ROUTE).toMatch(/console\.log\(\s*`\[llm_calls\]/);
  });

  it('NEVER SWEEPS admin_access_log -- the negative control, named for the outcome', () => {
    /*
     * §9.14: an audit trail with a delete path is the audit trail's absence, and a
     * retention policy is a delete path with a timer on it. `/privacy` clause 6's
     * row for it reads *kept indefinitely* and this is what keeps that true.
     *
     * Asserted on the COMMENT-STRIPPED source, because the header has to be able to
     * say why the table is not swept -- see `CODE` above. The plan asked for the
     * whole file; the whole file cannot carry its own reasoning if it does.
     */
    expect(CODE).not.toContain('admin_access_log');
    // And the prose IS there, so the rule is explained where somebody would look.
    expect(ROUTE).toContain('admin_access_log');
  });

  it('leaves the other four tables off any new clock', () => {
    // A3 adds ONE delete and touches none of the others.
    expect(ROUTE).not.toContain('delete from readings');
    expect(ROUTE).not.toContain('delete from reading_cards');
    expect(ROUTE).not.toContain('delete from personas');
    expect(ROUTE).not.toContain('delete from share_links');
  });
});
