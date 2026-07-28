/**
 * `POST` and `DELETE /api/share`, checked at the source level.
 *
 * **THE ROUTE ITSELF IS NOT EXERCISED HERE**, for the reason
 * `translate/route.contract.test.ts` gives about its own: it reaches
 * `requireUser()`, the `server-only` database singleton and a Next `Request`, none
 * of which belongs in Vitest. The behaviour that CAN be tested properly already
 * is — `share.integration.test.ts` owns rotation, ownership-as-a-predicate and the
 * `.toSQL()` question assertion, which are the security-relevant ones, and
 * `links.test.ts` owns the URL and the kill switch.
 *
 * What is left is the set of properties that are one deleted line away from a real
 * hole. Each of the assertions below is a decision the plan or Miftah's security
 * amendment spends a paragraph on.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROUTE = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'share', 'route.ts'), 'utf8');

/**
 * The route with its comments removed, FOR THE NEGATIVE ASSERTIONS ONLY.
 *
 * The header of the route says at length that it must never carry the slug into an
 * analytics prop, so a `not.toMatch(/slug/)` against the raw source fails on the
 * sentence forbidding it. `queries/contract.test.ts` records the lesson: a rule
 * that fires on prose describing the rule is a rule people delete.
 */
const CODE = ROUTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the share route', () => {
  it('reads the route at all, so nothing below passes vacuously', () => {
    expect(ROUTE).toContain('export async function POST');
    expect(ROUTE).toContain('export async function DELETE');
    expect(ROUTE.length).toBeGreaterThan(2000);
    expect(CODE).toContain('requireUser');
    expect(CODE.length).toBeGreaterThan(1000);
  });

  it('requires a session on BOTH verbs, before anything else', () => {
    /*
     * `/s/` is a prefix in `isPublic()` and `/api/share` is deliberately outside
     * it. If `requireUser()` ever leaves this file, minting becomes something a
     * stranger can do -- and revoking becomes something a stranger can do to
     * somebody else's link.
     */
    const posts = CODE.slice(CODE.indexOf('export async function POST'));
    const dels = CODE.slice(CODE.indexOf('export async function DELETE'));
    for (const half of [posts, dels]) {
      expect(half).toContain('await requireUser()');
      expect(half).toContain('if (!auth.ok) return auth.response');
    }
  });

  it('AWAITS the limiter, because hit() is async since V9', () => {
    /*
     * A forgotten `await` evaluates a Promise as truthy, so `if (!gate.ok)` is
     * never taken and the budget silently never refuses. V9 landing before V7 in
     * the build order is exactly so these call sites are written awaited from the
     * start rather than edited afterwards.
     */
    expect(CODE).toMatch(/await hit\(`share:create:\$\{user\.id\}`/);
    expect(CODE).toContain('if (!gate.ok) return tooMany(gate.retryAfterSeconds)');
    // Never bare `hit(` without an await in front of it.
    expect(CODE).not.toMatch(/[^a-z.]hit\(`[^`]*`[^)]*\)\.(ok|then)/);
  });

  it('does NOT spend the reading path\'s global budget', () => {
    /*
     * `hitGlobal()`'s budget belongs to the reading path. A mint spends no model
     * call, so charging it there would let sharing exhaust the thing that makes
     * the product work -- a worse outcome than a slow share sheet.
     */
    expect(CODE).not.toContain('hitGlobal');
  });

  it('requires BOTH booleans rather than defaulting them', () => {
    /*
     * The column defaults are a safety net, not the product rule. A `.optional()`
     * or a `.default()` here would make the route a second place the rule is
     * written, and two places is where they disagree.
     *
     * **STILL TRUE AFTER THE QUESTION BECAME ALWAYS-ON.** `ShareFooter` sends a
     * constant `true` rather than the field being dropped, precisely so the wire
     * format keeps stating the decision -- and so the route does not have to be
     * edited again if it is ever revisited.
     */
    expect(CODE).toContain('include_question: z.boolean()');
    expect(CODE).toContain('include_nickname: z.boolean()');
    expect(CODE).not.toMatch(/include_(question|nickname):\s*z\.boolean\(\)\.(optional|default)/);
  });

  it('validates the uuid before it reaches a query', () => {
    // A malformed id must be a 400, not a driver error carrying the parameter
    // into a log -- the same rule `flush.ts` follows from the other end.
    expect(CODE).toContain('entity_id: z.string().uuid()');
    expect(CODE).toContain('id: z.string().uuid()');
  });

  it('narrows the entity through V7\'s own guard', () => {
    expect(CODE).toContain('isShareEntity');
    // Never a bare string comparison, which would let `__proto__` through a
    // `lower_snake` pattern -- the trap `sanitizeProps()` already records.
    expect(CODE).not.toMatch(/entity === ['"]reading['"]/);
  });

  it('fires the two events with share_id and NEVER with the slug', () => {
    /*
     * `events` rows survive account erasure with `user_id` nulled, so a slug in
     * `props` would leave a live, working, PUBLIC URL in a table that outlives the
     * account that revoked it.
     */
    expect(CODE).toContain("track('share.created'");
    expect(CODE).toContain("track('share.revoked'");
    expect(CODE).toMatch(/share_id: result\.id/);
    expect(CODE).toMatch(/share_id: parsed\.data\.id/);

    /*
     * NARROWED TO THE `track()` CALLS, and the narrowing is the interesting part:
     * the JSON RESPONSE legitimately carries `slug` and `url`, because the sheet
     * has to show the querent the address it just minted. The rule is about the
     * `events` table, not about the wire. So the assertion reads each `track(...)`
     * argument object and nothing else -- a version that grepped the whole file
     * would either fail on the correct response or have to be deleted.
     */
    const props = [...CODE.matchAll(/track\('share\.[a-z_]+',\s*\{([\s\S]*?)\n\s*\}\)/g)];
    expect(props).toHaveLength(2);
    for (const [, block] of props) {
      expect(block).not.toMatch(/\bslug\b/);
      expect(block).not.toMatch(/\burl\b/);
    }
  });

  it('never awaits track(), which returns void', () => {
    expect(CODE).not.toMatch(/await\s+track\(/);
  });

  it('answers 404 for a disabled feature, not 503', () => {
    // A feature that is off should look absent rather than broken: a 503 invites
    // a retry loop and reads as an outage.
    expect(CODE).toContain('if (!sharingEnabled()) return notFound()');
    expect(CODE).not.toContain('503');
  });

  it('does NOT consult sharingEnabled() on the revoke path', () => {
    /*
     * Turning the feature off must never take away the off switch for links that
     * are already out there -- that would be the kill switch making the thing it
     * is killing unkillable.
     */
    const dels = CODE.slice(CODE.indexOf('export async function DELETE'));
    expect(dels).not.toContain('sharingEnabled');
  });

  it('collapses every revoke failure into one 404', () => {
    const dels = CODE.slice(CODE.indexOf('export async function DELETE'));
    expect(dels).toContain('if (!result.ok) return notFound()');
    // No second status distinguishing "not yours" from "gone".
    expect(dels).not.toMatch(/status:\s*403/);
  });

  it('reads the locale from getLocale(), never from user.locale', () => {
    // They agree for a real user and diverge under `?lang=`, which is exactly when
    // a screenshot loop is watching. Four routes learned this separately.
    expect(CODE).toContain('await getLocale()');
    expect(CODE).not.toMatch(/user\.locale/);
  });

  it('declares a runtime and a maxDuration', () => {
    /*
     * `POST /api/locale` was the only database-writing route declaring neither,
     * and Vercel's Hobby default of ten seconds truncated it on the cold path. A
     * mint is a user action that WRITES, i.e. one of the few requests likely to be
     * the one that wakes a suspended Neon compute.
     */
    expect(CODE).toContain("export const runtime = 'nodejs'");
    expect(CODE).toMatch(/export const maxDuration = \d+/);
  });

  it('answers no-store, because a mint response carries a capability', () => {
    expect(CODE).toMatch(/'cache-control': 'no-store'/);
  });

  it('never reads a table directly', () => {
    // An ad-hoc select here is how the ownership filter gets lost.
    expect(CODE).not.toContain("from '@/lib/db/schema'");
    expect(CODE).not.toContain("from '@/lib/db/client'");
    expect(CODE).not.toMatch(/from\(readings\)/);
  });
});
