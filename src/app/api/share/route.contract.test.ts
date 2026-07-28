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
    expect(ROUTE).toContain('export async function GET');
    expect(ROUTE).toContain('export async function POST');
    expect(ROUTE).toContain('export async function DELETE');
    expect(ROUTE.length).toBeGreaterThan(2000);
    expect(CODE).toContain('requireUser');
    expect(CODE.length).toBeGreaterThan(1000);
  });

  it('requires a session on ALL THREE verbs, before anything else', () => {
    /*
     * `/s/` is a prefix in `isPublic()` and `/api/share` is deliberately outside
     * it. If `requireUser()` ever leaves this file, minting becomes something a
     * stranger can do -- and revoking becomes something a stranger can do to
     * somebody else's link.
     *
     * **`GET` JOINED THE LIST 2026-07-28 AND IT IS THE ONE MOST WORTH ASSERTING**,
     * because it is the only verb here that neither writes nor charges a budget, so
     * it is the one whose guard looks most droppable. Without it, `entity_id` is a
     * uuid a stranger could brute-force into "does this reading have a live public
     * URL, and what is it" -- an oracle handing out the capability itself.
     *
     * **SLICED BY THE NEXT `export async function`**, not to the end of the file:
     * the old version sliced POST to EOF, so it passed on the strength of DELETE's
     * guard and would have kept passing had POST's been deleted.
     */
    const bodyOf = (verb: string) => {
      const start = CODE.indexOf(`export async function ${verb}`);
      expect(start).toBeGreaterThan(-1);
      const rest = CODE.slice(start + 1);
      const next = rest.indexOf('export async function');
      return next === -1 ? rest : rest.slice(0, next);
    };
    for (const verb of ['GET', 'POST', 'DELETE']) {
      const half = bodyOf(verb);
      expect(half).toContain('await requireUser()');
      expect(half).toContain('if (!auth.ok) return auth.response');
    }
  });

  it('validates GET\'s query with zod and narrows the entity through the guard', () => {
    /*
     * `searchParams.get()` returns `string | null`, so a missing parameter without
     * this becomes a lookup for the literal string "null" -- which is not a uuid, so
     * the query module's `UUID_RE` would answer `[]` and the route would 200 with an
     * empty list. A 400 is the honest answer and the only one a caller can act on.
     */
    const get = CODE.slice(CODE.indexOf('export async function GET'));
    expect(get).toContain('ListQuery.safeParse');
    expect(get).toContain('isShareEntity');
    expect(CODE).toMatch(/entity_id: z\.string\(\)\.uuid\(\)/);
  });

  it('scopes GET to the session user and never to a body-supplied id', () => {
    /*
     * `liveSharesFor` puts `user_id` in the `where` (rule 1 of the query module), and
     * the id it is given must be `auth.user.id`. A route that passed a caller-named
     * user id would be a link-enumeration endpoint for the whole table.
     */
    const get = CODE.slice(CODE.indexOf('export async function GET'));
    expect(get).toMatch(/liveSharesFor\(\s*auth\.user\.id/);
  });

  it('revokes ARTIFACT-WIDE and fires one event per address', () => {
    /*
     * Miftah's consent ruling, 2026-07-28. A reading can hold an English and a
     * Bahasa address, so a revoke that killed one would let the querent believe the
     * reading is private while a URL is still serving the public internet.
     *
     * Asserted on the LOOP rather than on the helper name, because the failure mode
     * is somebody "simplifying" the loop back to a single `track()` after the
     * artifact-wide revoke is already in place -- which reads as tidy and silently
     * drops every address but one from the funnel.
     */
    const dels = CODE.slice(CODE.indexOf('export async function DELETE'));
    expect(dels).toMatch(/for \(const address of result\.revoked\)/);
    expect(dels).toContain("track('share.revoked'");
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
    /*
     * **`address.id` AND NOT `parsed.data.id`, CHANGED 2026-07-28.** The revoke is
     * artifact-wide now — one request names an anchor row and turns off every
     * language of that reading — so the request's `id` describes at most one of the
     * addresses being revoked. Reporting it for all of them would attribute one
     * address's `age_hours` and `view_count` to another, and the funnel would stop
     * being able to say how much reach a revoke took away.
     */
    expect(CODE).toMatch(/share_id: address\.id/);
    expect(CODE).not.toMatch(/share_id: parsed\.data\.id/);

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

  it('PINS the locale from getLocale() and never from the request body', () => {
    /*
     * **DESIGN A's ONE WIRE-FORMAT RULE.** The pinned locale is resolved on the
     * server, exactly as V2 resolves `/api/translate`'s target, and for V2's
     * reason: a client-supplied locale can disagree with the session claim and
     * with the dev-only `?lang=` override, and the client would then appear to be
     * choosing what language the link records.
     *
     * So `CreateBody` gains NO locale field. A `locale` key in the schema is the
     * regression, and it would look like a helpful explicit API.
     */
    /*
     * ASSERTED ON THE `createShareLink` ARGUMENT LIST, not on the file. The route
     * already resolved `getLocale()` for the analytics context long before design
     * A, so a file-wide `toContain('getLocale')` passes vacuously — it did, on the
     * first run of this test, which is the whole reason the slice is here.
     */
    const call = CODE.slice(CODE.indexOf('createShareLink({'));
    const args = call.slice(0, call.indexOf('});') + 1);
    expect(args).toContain('createShareLink({');
    expect(args).toMatch(/locale:/);
    expect(args.length).toBeLessThan(400); // it really is the argument list

    // And the client does not get to say. `CreateBody` gains no locale field.
    expect(CODE).not.toMatch(/include_locale|body\.locale/);
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
