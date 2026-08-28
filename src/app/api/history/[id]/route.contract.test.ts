/**
 * `DELETE /api/history/[id]`, checked at the source level.
 *
 * **THE ROUTE IS NOT EXERCISED HERE**, for `share/route.contract.test.ts`'s
 * reason: it reaches `requireUser()`, the `server-only` database singleton and a
 * Next `Request`, none of which belongs in Vitest. What the transaction does is
 * proven properly in `history.softDelete.integration.test.ts`. What is left is the
 * handful of properties that are one deleted line away from a real hole.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROUTE = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'history', '[id]', 'route.ts'),
  'utf8',
);

/**
 * The route with its comments removed, FOR THE NEGATIVE ASSERTIONS ONLY. The
 * header explains at length why there is no body on the 204 and why nothing is
 * logged raw, so a `not.toMatch` against the raw source fails on the sentence
 * forbidding the thing. `queries/contract.test.ts` records the lesson: a rule that
 * fires on prose describing the rule is a rule people delete.
 */
const CODE = ROUTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the history delete route', () => {
  it('reads the route at all, so nothing below passes vacuously', () => {
    expect(ROUTE).toContain('export async function DELETE');
    expect(CODE).toContain('requireUser');
    expect(CODE.length).toBeGreaterThan(400);
  });

  it('exports DELETE and nothing else', () => {
    // A GET here would be a second, session-scoped copy of the detail read that
    // `/history/[id]/page.tsx` already does as a server component.
    expect(CODE).not.toMatch(/export async function (GET|POST|PUT|PATCH)/);
  });

  it('requires a session before it looks at the path', () => {
    const body = CODE.slice(CODE.indexOf('export async function DELETE'));
    expect(body).toContain('await requireUser()');
    expect(body).toContain('if (!auth.ok) return auth.response');
    expect(body.indexOf('requireUser')).toBeLessThan(body.indexOf('ctx.params'));
  });

  it('declares runtime and maxDuration, and maxDuration clears the Hobby default', () => {
    // `POST /api/locale` was the only database-writing route declaring neither and
    // was killed at ten seconds on a cold lambda over a suspended Neon compute.
    expect(ROUTE).toContain("export const runtime = 'nodejs'");
    const m = ROUTE.match(/export const maxDuration = (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(10);
  });

  it('answers 204 with NO body, so it is not an existence oracle', () => {
    expect(CODE).toContain('status: 204');
    // The one thing that must never appear: a JSON answer on the success path.
    expect(CODE).not.toMatch(/NextResponse\.json\(\s*\{\s*deleted/);
  });

  it('logs through the helper and never the driver error', () => {
    expect(CODE).toContain("logHistoryFailure('delete', err)");
    expect(CODE).not.toMatch(/console\.(error|log|warn)\s*\(/);
  });

  it('fires no analytics event from the server', () => {
    // H11: all three history events fire from the client, and `history.item_deleted`
    // (Phase 2) joins them there. `events.ts` has one owner per release.
    expect(CODE).not.toContain('withAnalytics');
    expect(CODE).not.toMatch(/\btrack\(/);
  });
});
