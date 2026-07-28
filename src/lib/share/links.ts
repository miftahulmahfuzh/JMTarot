/**
 * Mint, resolve and revoke a share link. The impure half of `src/lib/share/`.
 *
 * `server-only`, and it reaches the singleton through a **dynamic**
 * `import('@/lib/db/client')`, following `flush.ts` — a static import drags the
 * postgres driver and the `server-only` marker into anything that imports this
 * module for a type, and `server-only` throws under Vitest for the modules
 * `vitest.config.ts` does not alias.
 *
 * **THE URL BUILDER LIVES HERE AND NOT IN `slug.ts`, ON PURPOSE.**
 * `SHARE_BASE_URL` carries no `NEXT_PUBLIC_` prefix, so a client component
 * reading it would silently see `undefined` — the trap `localeSwitcherEnabled()`
 * records, which "lived in `LocaleSwitch.tsx` for about ten minutes". So the
 * client is handed the finished URL in the POST response and never builds one,
 * and `src/lib/clientBoundary.test.ts` asserts no client file imports this file.
 *
 * `revokeAllForUser` is NOT re-exported from here. It takes a handle first
 * because V8's deletion transaction must pass its own transaction in, so it lives
 * in `@/lib/db/queries/share` where the handle-first rule is enforced. V8 imports
 * it from there.
 */
import 'server-only';

import {
  anyShareLinkFor,
  insertOrRotateShareLink,
  markReadingShared,
  ownsShareableReading,
  publicPersonaForShare,
  publicReadingForShare,
  revokeShareLink,
  shareLinkById,
  shareLinkBySlug,
} from '@/lib/db/queries/share';
import type { DbOrTx } from '@/lib/db/types';
import { isShareEntity, isValidSlug, newSlug, normalizeSlug, type ShareEntity } from './slug';
import type { ResolvedShare, ShareLinkPublic } from './types';

export type { ResolvedShare, ShareLinkPublic } from './types';

/**
 * A positive resolve cache is NOT shipped, and the constant is here so the trade
 * is written down rather than rediscovered at 2am.
 *
 * Thirty seconds would absorb a viral link at the cost of a thirty-second window
 * in which a REVOKED link still resolves — and revocation is the
 * highest-consequence control in the feature. A single-row lookup on a unique
 * index is the cheapest query in the schema; buy the cache when there is load to
 * justify it, and decide the acceptable window before the night it is needed.
 */
export const SHARE_RESOLVE_CACHE_MS = 0;

/** How many times a `23505` on `slug` is worth retrying. See `slug.ts`'s table. */
const SLUG_ATTEMPTS = 3;

/** Postgres unique-violation. A collision is a retry, never a lost link. */
const UNIQUE_VIOLATION = '23505';

/**
 * The artifact-lookup retry, for the draw screen's ordering problem.
 *
 * The client knows the stream finished; `readings` is written in the response's
 * own `after()`, i.e. AFTER the bytes. So a mint fired the instant the reading
 * completes can beat its own row into the table. Two options were weighed —
 * poll `/api/share` from the client until it stops 404ing, or let the server
 * wait — and the server waiting is better: the write is already in flight, the
 * wait is bounded, and it keeps a retry loop off the happy path of a component.
 */
const ARTIFACT_ATTEMPTS = 3;
const ARTIFACT_RETRY_MS = 250;

/**
 * Is minting on? `!== '0'`, following `ANALYTICS_ENABLED`'s rule, so a typo
 * leaves the feature ON rather than silently killing it.
 *
 * **IT GATES MINTING ONLY.** Existing links keep resolving, because a kill switch
 * that breaks links people have already sent is worse than the thing it is
 * switching off — a stranger meets a dead page and blames their friend. If links
 * must actually go dark the honest tool is
 * `update share_links set revoked_at = now()`, which is a decision somebody makes
 * on purpose and which leaves the rows revoked rather than resurrectable.
 */
export function sharingEnabled(): boolean {
  return process.env.SHARING_ENABLED !== '0';
}

/**
 * The origin a share URL is built against.
 *
 * **READ AT CALL TIME, NEVER AT MODULE SCOPE.** A module-scope `const` is
 * inlined by the bundler and freezes the local value into the production build —
 * `resolve.ts` records the same reason for the same shape.
 *
 * `SHARE_BASE_URL` first, then **`AUTH_URL`'s ORIGIN and not its string**:
 * `AUTH_URL` is allowed to carry a path, and a share URL built by concatenation
 * would come out as `https://host/some/path/s/<slug>`. Never a trailing slash,
 * because `${origin}/s/${slug}` would otherwise double it and a doubled slash in
 * a capability URL is a 404 somebody has to debug from a chat message.
 */
export function shareOrigin(): string {
  const explicit = process.env.SHARE_BASE_URL?.trim();
  if (explicit) return trimOrigin(explicit);

  const authUrl = process.env.AUTH_URL?.trim();
  if (authUrl) return trimOrigin(authUrl);

  /*
   * The local default. `npm run dev` lands on 3001 because port 3000 is
   * permanently held by another project's Grafana container, and an OAuth
   * redirect URI is an exact-match string, so 3001 is the app's real dev origin
   * rather than a guess.
   */
  return 'http://localhost:3001';
}

function trimOrigin(raw: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    // Not parseable as a URL: strip a trailing slash and hand back what we were
    // given. Better a wrong-looking origin in a log than a throw on the mint path.
    return raw.replace(/\/+$/, '');
  }
}

/** `${origin}/s/${slug}`. 39 characters at the production origin. */
export function shareUrl(slug: string): string {
  return `${shareOrigin()}/s/${slug}`;
}

async function handle(): Promise<DbOrTx> {
  const { db } = await import('@/lib/db/client');
  return db;
}

export type CreateShareResult =
  | {
      ok: true;
      id: string;
      slug: string;
      url: string;
      /** True when an existing row's slug was replaced rather than inserted. */
      rotated: boolean;
      includeQuestion: boolean;
      includeNickname: boolean;
    }
  | { ok: false; reason: 'not_shareable' | 'slug_exhausted' };

/**
 * Mint a link, or rotate the existing one's slug.
 *
 * **THE ARTIFACT IS CHECKED FIRST, AND `status = 'ok'` IS CHECKED TWICE.** Here,
 * and again in the resolver's `where`. The second is not redundant: it is what
 * protects a link minted by a future code path that forgot the first check.
 *
 * `partial` is refused as well as `blocked`/`failed`/`aborted`, which VD9 does not
 * name. The reason is worth the line: a `partial` body is real prose that simply
 * stops — the `[Bacaan terputus…]` notice never reaches `readings.body` — so a
 * stranger cannot tell "the stream died" from "this reader is incoherent", and the
 * one page in the product that strangers meet should not be the one showing a
 * truncated reading. It is one predicate to relax if that is wrong.
 */
export async function createShareLink(args: {
  userId: string;
  entity: ShareEntity;
  entityId: string;
  includeQuestion: boolean;
  includeNickname: boolean;
}): Promise<CreateShareResult> {
  const db = await handle();

  const exists = await artifactExists(db, args.entity, args.entityId, args.userId);
  if (!exists) return { ok: false, reason: 'not_shareable' };

  /*
   * ANY prior row, live OR revoked. `liveShareLinkFor` cannot answer this: a
   * re-share after a revoke IS a rotation and the row it would have to see is the
   * revoked one, so using it would report `rotated: false` for exactly the case
   * the prop exists to count.
   */
  const before = await anyShareLinkFor(db, args.userId, args.entity, args.entityId);

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const slug = newSlug();
    try {
      const row = await insertOrRotateShareLink(db, {
        slug,
        userId: args.userId,
        entity: args.entity,
        entityId: args.entityId,
        includeQuestion: args.includeQuestion,
        includeNickname: args.includeNickname,
      });

      /*
       * `readings.shared_at` on the FIRST mint. Not awaited inside a transaction
       * with the insert -- the plan asked for one, and one row's timestamp is not
       * worth wrapping the mint in a transaction that would then have to be
       * threaded through `insertOrRotateShareLink`'s handle. If this write fails
       * the link is still live and V6's badge is one visit stale, which is the
       * right failure for a denormalized convenience column.
       */
      if (args.entity === 'reading') {
        try {
          await markReadingShared(db, args.entityId, args.userId);
        } catch {
          // The badge, not the link. Swallowed, and NEVER with the error object:
          // a postgres error quotes its bound parameters.
          console.warn('[share] shared_at not stamped');
        }
      }

      return {
        ok: true,
        id: row.id,
        slug: row.slug,
        url: shareUrl(row.slug),
        rotated: before !== null,
        includeQuestion: row.includeQuestion,
        includeNickname: row.includeNickname,
      };
    } catch (err) {
      /*
       * A slug collision is a `23505` and a re-roll. At a 1-in-578,000 base rate
       * over three attempts this is a probability nobody needs to write down --
       * but `slug` carries a `unique` constraint precisely so that the answer is a
       * retry rather than a lost link.
       *
       * Any OTHER unique violation is the (user_id, entity, entity_id) constraint,
       * which `onConflictDoUpdate` already targets, so it cannot be reached from
       * here and rethrowing is correct.
       */
      if (!isSlugCollision(err)) throw err;
    }
  }
  return { ok: false, reason: 'slug_exhausted' };
}

function isSlugCollision(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  const constraint = (err as { constraint_name?: unknown }).constraint_name;
  return code === UNIQUE_VIOLATION && String(constraint ?? '').includes('slug');
}

/**
 * Does the artifact exist, belong to this user, and is it shareable?
 *
 * Retried, three attempts 250ms apart, for the draw-screen ordering problem in
 * `ARTIFACT_ATTEMPTS`'s comment. The retry is only for the NEGATIVE answer: a row
 * that exists answers on the first attempt and pays nothing.
 */
async function artifactExists(
  db: DbOrTx,
  entity: ShareEntity,
  entityId: string,
  userId: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < ARTIFACT_ATTEMPTS; attempt++) {
    if (entity === 'persona') {
      // Null until V8 ships `personas`; see that query's header.
      if (await publicPersonaForShare(db, userId)) return true;
    } else if (await ownsShareableReading(db, entityId, userId)) {
      // Ownership is checked HERE AND NOWHERE ELSE -- see that query's header.
      return true;
    }
    if (attempt < ARTIFACT_ATTEMPTS - 1) {
      await new Promise((res) => setTimeout(res, ARTIFACT_RETRY_MS));
    }
  }
  return false;
}

/**
 * Resolve a slug to something renderable, or null.
 *
 * **FIVE DIFFERENT FAILURES, ONE ANSWER, and that is the design rather than
 * laziness:** invalid slug, no row, revoked, artifact deleted, artifact not
 * shareable. A caller that could tell them apart would let a stranger with a slug
 * learn that the account behind it still exists. `notFound()` renders one page for
 * all five, and `not-found.tsx` says nothing about which.
 *
 * **NEVER THROWS ON A MISSING ARTIFACT** — roadmap §4: `entity_id` has no foreign
 * key, so orphans are possible by construction and a 500 here is the bug.
 *
 * **VALIDATES BEFORE THE QUERY.** `isValidSlug` runs first and returns null
 * without touching the database, which is one fewer round trip per garbage
 * request on the one denial-of-service surface in the release.
 */
export async function resolveShare(rawSlug: unknown): Promise<ResolvedShare | null> {
  if (!isValidSlug(rawSlug)) return null;
  const slug = normalizeSlug(rawSlug);

  const db = await handle();
  const link = await shareLinkBySlug(db, slug);
  if (!link) return null;
  if (!isShareEntity(link.entity)) return null;

  const publicLink: ShareLinkPublic = {
    id: link.id,
    entity: link.entity,
    includeQuestion: link.includeQuestion,
    includeNickname: link.includeNickname,
  };

  if (link.entity === 'persona') {
    const persona = await publicPersonaForShare(db, link.userId, link.includeNickname);
    if (!persona) return null;
    return { entity: 'persona', link: publicLink, persona };
  }

  const reading = await publicReadingForShare(
    db,
    link.entityId,
    link.includeQuestion,
    link.includeNickname,
  );
  if (!reading) return null;
  return { entity: 'reading', link: publicLink, reading };
}

/**
 * Turn a link off, and report what it was worth for the analytics event.
 *
 * The row is read BEFORE the update, because `share.revoked` carries `age_hours`
 * and `view_count` and both are facts about the link's life rather than about the
 * revoke. `ok: false` covers "not yours", "does not exist" and "already off" —
 * the route answers 404 to all three, for the resolver's reason.
 */
export async function revokeShare(
  id: string,
  userId: string,
): Promise<{ ok: true; entity: string; ageHours: number; viewCount: number } | { ok: false }> {
  const db = await handle();
  const before = await shareLinkById(db, id, userId);
  if (!before || before.revokedAt !== null) return { ok: false };

  const changed = await revokeShareLink(db, id, userId);
  if (changed === 0) return { ok: false };

  return {
    ok: true,
    entity: before.entity,
    ageHours: Math.max(0, Math.round((Date.now() - before.createdAt.getTime()) / 3_600_000)),
    viewCount: before.viewCount,
  };
}
