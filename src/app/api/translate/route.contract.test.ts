import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `POST /api/translate`, checked at the source level.
 *
 * **THE ROUTE ITSELF IS NOT EXERCISED HERE**, for the reason
 * `sweep.contract.test.ts` gives about its own route: it reaches `requireUser()`,
 * the `server-only` database singleton and a Next `Request`, none of which belongs
 * in Vitest. What CAN be checked is the set of properties that are one deleted line
 * away from a real hole, and each of the five below is a decision the plan spends a
 * paragraph on.
 *
 * The behaviour that can be tested properly already is: `translate.test.ts` owns the
 * cache, the verification and the repair pass; `translations.integration.test.ts`
 * owns `resolveTranslatable`'s ownership filter, which is the security-relevant one.
 */
const ROUTE = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'translate', 'route.ts'),
  'utf8',
);

/**
 * The route with its comments removed.
 *
 * FOR THE NEGATIVE ASSERTIONS ONLY, and it is not fussiness: this file's header
 * explains at length that the locale must NEVER come from `user.locale`, so a
 * `not.toMatch(/user\.locale/)` against the raw source fails on the sentence
 * forbidding it. `queries/contract.test.ts` records the same lesson — "a rule that
 * fires on prose describing the rule is a rule people delete" — after grepping for
 * `from '../client'` and matching a comment saying never to write it.
 *
 * The positive assertions use the raw source, where a comment cannot create a false
 * pass that matters: the strings they look for are all code.
 */
const CODE = ROUTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the translate route', () => {
  it('reads the route at all, so nothing below passes vacuously', () => {
    expect(ROUTE).toContain('export async function POST');
    expect(ROUTE.length).toBeGreaterThan(2000);
    // The comment stripper must not have eaten the code it is protecting.
    expect(CODE).toContain('requireUser');
    expect(CODE.length).toBeGreaterThan(1000);
  });

  /*
   * T9. Without `requireUser()` this endpoint spends model calls for strangers; without
   * `resolveTranslatable`'s user filter it hands one user another's reading. The
   * second is asserted properly in the integration suite — this is the fence saying
   * the route still goes through it rather than reading `readings` itself.
   */
  it('requires a user and resolves ownership through the query, not by hand', () => {
    expect(ROUTE).toContain('requireUser()');
    expect(ROUTE).toContain('resolveTranslatable');
    // No direct table read: an ad-hoc select here is how the user filter gets lost.
    expect(CODE).not.toMatch(/from\(readings\)/);
    expect(CODE).not.toContain("from '@/lib/db/schema'");
  });

  /*
   * "Does not exist" and "not yours" must be the SAME answer. A 403 anywhere in this
   * file would confirm the uuid exists, which is the reasoning V7 applies to share
   * slugs — a stranger must not be able to tell a deleted reading from an id that
   * never existed.
   */
  it('answers 404 for both not-found and not-yours, and never 403', () => {
    expect(ROUTE).toContain('status: 404');
    expect(CODE).not.toContain('status: 403');
  });

  /*
   * T11. `ratelimit.ts`'s header says to call both and never one instead of the
   * other: `hit` bounds one person, `hitGlobal` bounds a crowd of throwaway accounts.
   * This is an authenticated endpoint that spends model calls on a user-supplied
   * uuid, which is the shape both budgets exist for.
   */
  it('checks BOTH budgets, and namespaces the per-user one away from the reading', () => {
    expect(ROUTE).toContain('hitGlobal()');
    expect(ROUTE).toMatch(/hit\(`translate:\$\{user\.id\}`\)/);
    // A bare `hit(user.id)` would make reading a history eat the budget that lets
    // the same querent take a reading.
    expect(CODE).not.toMatch(/hit\(user\.id\)/);
    expect(ROUTE).toContain('retry-after');
  });

  /*
   * T10, learned three times already — `/api/reading` and both `/api/memory/*`. They
   * agree for a real user because the `loc` claim is first in the chain, and they
   * diverge under `?lang=`, which is exactly when a screenshot loop is watching.
   */
  it('resolves the locale with getLocale(), never from the user row', () => {
    expect(ROUTE).toContain('await getLocale()');
    expect(CODE).not.toMatch(/user\.locale/);
  });

  /*
   * The zod guard is what keeps a malformed uuid out of a query — and therefore out
   * of a driver error that would quote it into a log. Same rule as `flush.ts` and
   * `log.ts`, approached from the other end.
   */
  it('validates the body before anything reaches a query', () => {
    expect(ROUTE).toContain('safeParse');
    expect(ROUTE).toMatch(/uuid\(\)/);
    // And the entity/field pair is checked against the registry rather than cast.
    expect(ROUTE).toContain('isTranslatableKey');
  });

  /*
   * The registry decides which shape the caller gets (T1), not the route. A hardcoded
   * `entity === 'reading'` here would be a second opinion about something
   * `TRANSLATABLE` already answers, and the two would diverge the day V8 lands.
   */
  it('chooses streamed-or-buffered from the registry', () => {
    expect(ROUTE).toContain('spec.stream');
    expect(CODE).not.toMatch(/entity === 'reading'/);
  });

  /*
   * The `/api/memory/summary` header set, and the reason each one is there: no shared
   * cache for per-user prose, and no proxy buffering on a stream.
   */
  it('carries the streaming header set and no shared caching', () => {
    expect(ROUTE).toContain("'cache-control': 'private, no-store'");
    expect(ROUTE).toContain("'x-accel-buffering': 'no'");
  });

  it('never logs an error object', () => {
    // A postgres error quotes its bound parameters and one of them is the translated
    // body; an LLM client error can carry the whole prompt, which holds the source
    // verbatim. `translate.ts` logs the class and this route logs nothing at all.
    expect(CODE).not.toMatch(/console\.(error|log|warn)\([^)]*\berr\b/);
  });
});
