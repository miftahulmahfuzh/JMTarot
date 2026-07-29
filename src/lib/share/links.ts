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
  liveShareLinksForArtifact,
  markReadingShared,
  ownsShareableReading,
  publicPersonaForShare,
  publicReadingForShare,
  revokeArtifactLinks,
  shareLinkById,
  shareLinkBySlug,
} from '@/lib/db/queries/share';
import { getTranslation } from '@/lib/db/queries/translations';
import type { Locale, ReaderId, ServiceId } from '@/data/types';
import type { DbOrTx } from '@/lib/db/types';
import { siteOrigin } from '@/lib/seo/origin';
import { isShareEntity, isValidSlug, newSlug, normalizeSlug, type ShareEntity } from './slug';
import type { ResolvedShare, SharedTranslation, ShareLinkPublic } from './types';

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
 * `SHARE_BASE_URL` first, because the share host is allowed to differ from the
 * app host and `docs/DEPLOY-VERCEL.md` §5 explains when you would want that.
 *
 * **EVERYTHING AFTER IT IS NOW `siteOrigin()`'s (v0.4.0 / S-D11), AND THE TWO
 * RUNGS THIS FUNCTION USED TO OWN MOVED THERE RATHER THAN BEING DELETED.**
 * `AUTH_URL`'s ORIGIN and `http://localhost:3001` are both in that chain, in
 * that order, for the reasons this comment used to give: `AUTH_URL` is allowed
 * to carry a path, so a share URL built by concatenation would come out as
 * `https://host/some/path/s/<slug>`, and `npm run dev` lands on 3001 because
 * port 3000 is permanently held by another project's Grafana container.
 *
 * **WHY DELEGATE RATHER THAN KEEP A SECOND COPY.** Two functions that
 * independently decide this site's origin disagree the first time the domain
 * changes, and the symptom is a canonical tag pointing at the wrong host, which
 * de-indexes the correct page. A share URL and a canonical URL naming different
 * hosts is the same bug wearing a different hat: the `Try It Yourself` button on
 * `/s/` would send a stranger to a domain the sitemap says does not exist.
 *
 * Never a trailing slash, because `${origin}/s/${slug}` would otherwise double it
 * and a doubled slash in a capability URL is a 404 somebody has to debug from a
 * chat message. `siteOrigin()` guarantees that property; there is a test.
 */
export function shareOrigin(): string {
  const explicit = process.env.SHARE_BASE_URL?.trim();
  if (explicit) return trimOrigin(explicit);
  return siteOrigin();
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
      /**
       * The pin that was actually written, which is **not always what the route
       * asked for** — see `resolvePin`. The sheet labels the link with it, so it
       * has to be the stored value rather than the requested one, or a link that
       * fell back to as-written would be presented as "English".
       */
      locale: Locale | null;
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
  /**
   * The language the sharer is reading, which the public page will render.
   *
   * REQUIRED, not optional. The route resolves it from `getLocale()`; making it
   * optional would let a future caller mint an unpinned link by omission and get
   * pre-design-A behaviour with nothing red — see `schema.ts` on the column.
   */
  locale: Locale;
}): Promise<CreateShareResult> {
  const db = await handle();

  const exists = await artifactExists(db, args.entity, args.entityId, args.userId);
  if (!exists) return { ok: false, reason: 'not_shareable' };

  /*
   * THE PIN IS RESOLVED, NOT TRUSTED. See `resolvePin`. It may come back NULL for
   * a locale the route asked for, and that is the honest answer rather than a
   * failure — everything downstream uses `pin`, never `args.locale`.
   */
  const pin = await resolvePin(db, args);

  /*
   * ANY prior row, live OR revoked, **for this language**. `liveShareLinkFor`
   * cannot answer this: a re-share after a revoke IS a rotation and the row it
   * would have to see is the revoked one, so using it would report
   * `rotated: false` for exactly the case the prop exists to count.
   *
   * `pin` and not `args.locale`: the row this could conflict with is the one at
   * the pin, so asking about a language we decided not to pin would report a
   * rotation of a row we are not going to touch.
   */
  const before = await anyShareLinkFor(db, args.userId, args.entity, args.entityId, pin);

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
        /*
         * THE RESOLVED PIN. `locale` is part of the unique key now, so this is
         * what decides whether the statement inserts a new address or rotates an
         * existing one — see `insertOrRotateShareLink`'s header.
         */
        locale: pin,
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
        locale: row.locale,
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

/**
 * Decide what may HONESTLY be pinned, and make it true before returning.
 *
 * ── THE INVARIANT ───────────────────────────────────────────────────────────
 *
 * **A non-NULL `share_links.locale` always has a `translations` row behind it.**
 * `/s/` cannot generate — VD7, it is the one route with no session and no
 * per-user budget — so it reads the pinned translation and, on a miss, silently
 * renders the source. Under the old one-link-per-reading model that was a
 * cosmetic edge case. Now that a querent can hold an "English link" and a
 * "Bahasa link" as separate addresses, a pin with no row behind it is **a link
 * that lies about its own language**, and the notice that used to explain a
 * mismatch was deleted on 2026-07-28. So the pin is made true here or not made.
 *
 * ── WHY THIS IS NOT A VD7 BREACH ────────────────────────────────────────────
 *
 * VD7 binds the session-less public page. A mint has `requireUser()`, the
 * `share:create:` per-user budget and `llm:window` behind it, which is every gate
 * the reading path has. The public page still only ever READS.
 *
 * ── THE THREE OUTCOMES ──────────────────────────────────────────────────────
 *
 *   source locale === target  ->  pin target, NO model call. The resolver finds
 *                                 no row (nothing translates `id` into `id`) and
 *                                 falls through to as-written, which renders the
 *                                 same prose by a cheaper route. `resolveShare`'s
 *                                 header already records this.
 *   translated                ->  pin target.
 *   fell back                 ->  pin NULL, meaning as-written. TRUE, where
 *                                 pinning the target would be false.
 *
 * `translateOrCached` is the only entry point permitted (`putTranslation` has
 * exactly one caller, because it is where verification happens) and it never
 * throws, so there is no failure path here beyond `fellBack`.
 *
 * **THE COMMON CASE COSTS NOTHING.** The sharer is looking at the reading in
 * `target` when they tap share, so the translation is already cached and this is
 * one indexed read on a connection the artifact check just opened.
 *
 * ── THE PERSONA ARM IS UNREACHABLE TODAY AND IS OWED THE SAME TREATMENT ──────
 *
 * `publicPersonaForShare` still returns null on this branch, so `artifactExists`
 * refuses a persona mint before it ever gets here. When V7 mounts `PersonaBlock`
 * on `/s/`, `'persona'` must come through this function too — `persona.body` is
 * already in V2's translation registry. Pinning it unresolved in the meantime
 * would be pre-committing to the bug this function exists to prevent, which is
 * why the non-reading branch returns the target unchanged rather than pretending
 * to have checked.
 */
async function resolvePin(
  db: DbOrTx,
  args: { entity: ShareEntity; entityId: string; userId: string; locale: Locale },
): Promise<Locale | null> {
  if (args.entity !== 'reading') return args.locale;

  const { shareableReadingSource } = await import('@/lib/db/queries/share');
  const source = await shareableReadingSource(db, args.entityId, args.userId);
  /*
   * `artifactExists` already said yes, so this is a row that vanished between two
   * statements. Pin NULL rather than the target: we cannot show that a
   * translation exists, and the mint is about to fail on the artifact anyway.
   */
  if (!source) return null;

  // Already in the sharer's language. Nothing to translate, nothing to check.
  if (source.locale === args.locale) return args.locale;

  const { translateOrCached } = await import('@/lib/translate/translate');
  const result = await translateOrCached(
    {
      entity: 'reading',
      entityId: args.entityId,
      field: 'body',
      source: source.body,
      sourceLocale: source.locale,
      // IMMUTABLE SOURCE, so `created_at` is the permanent comparand. See the query.
      sourceUpdatedAt: source.createdAt,
      target: args.locale,
      readerId: source.readerId as ReaderId,
      serviceId: source.serviceId as ServiceId,
    },
    db,
  );

  /*
   * **`fellBack` IS THE WHOLE CHECK, AND `outcome` IS NOT A SUBSTITUTE.**
   * `translateStream`/`translateOrCached` return the SOURCE VERBATIM on failure
   * with `fellBack: true`, and `outcome: 'invalid'` is a body that WAS translated
   * (the viewer sees it once, the repair pass fixes the cache) — so keying on
   * `outcome === 'ok'` would refuse a pin for a translation that exists, and
   * keying on `!== 'failed'` would grant one for prose that is the source.
   */
  return result.fellBack ? null : args.locale;
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

  /*
   * ── THE TWO READS ARE ONE FAN-OUT, AND THE MEASURED COST OF DESIGN A IS ZERO ──
   *
   * Both are keyed off `link.entityId` and neither needs the other's result, so
   * the pinned translation costs no wall clock: it is served by
   * `translations_entity_lookup_idx` on `(entity, entity_id, field, locale)`,
   * on the connection the link read already opened, and the Neon compute is
   * already awake by this point because `shareLinkBySlug` woke it.
   *
   * **THE LOOKUP IS SKIPPED ONLY WHEN NOTHING WAS PINNED**, never on a comparison
   * against `reading.locale` — that would need the reading first, which serialises
   * two reads to save one round trip on an open connection. Wrong trade. A pin
   * equal to the source finds no row (nothing translates `id` into `id`) and falls
   * through to as-written, which is the same answer by a cheaper route.
   *
   * `getTranslation` IS CALLED HERE AND NEVER FROM THE PAGE. That is what keeps
   * `page.contract.test.ts`'s "never generates anything" assertion greppable
   * against one file, and it is why the page names no `@/lib/db` specifier.
   */
  const [reading, translation] = await Promise.all([
    publicReadingForShare(db, link.entityId, link.includeQuestion, link.includeNickname),
    link.locale
      ? getTranslation(db, {
          entity: 'reading',
          entityId: link.entityId,
          field: 'body',
          locale: link.locale,
        })
      : null,
  ]);
  if (!reading) return null;

  /*
   * NO STALENESS CHECK, DELIBERATELY. V2's rule is
   * `translations.updated_at < source.updated_at`, but VD7 makes `readings.body`
   * immutable and the comparand for a reading is `created_at` — so a reading's
   * translation cannot go stale. A branch that can never fire is a branch nobody
   * can trust, and adding one here would imply the source can change.
   *
   * An EMPTY body is treated as a miss rather than rendered: `resolveProse` maps
   * empty prose to `unavailable`, and a stranger deserves the original over a
   * blank page.
   */
  const pinned: SharedTranslation =
    translation && translation.body.trim() !== ''
      ? { body: translation.body, locale: translation.locale }
      : null;

  return { entity: 'reading', link: publicLink, reading, translation: pinned };
}

/** One address that was turned off, as `share.revoked` needs to describe it. */
export type RevokedAddress = {
  id: string;
  entity: string;
  locale: Locale | null;
  ageHours: number;
  viewCount: number;
};

/**
 * Turn off EVERY live address for the artifact the named link belongs to.
 *
 * **REVOKE IS PER-ARTIFACT, NOT PER-LINK** (Miftah's ruling, 2026-07-28). A reading
 * can now hold an English address and a Bahasa address, so "stop sharing this" has
 * to mean both or the control is a trap: the querent taps it, believes the reading
 * is private, and one URL is still serving the public internet. A per-locale kill
 * was offered and refused on exactly that ground, so there is deliberately no way
 * to reach one from the app.
 *
 * **THE REQUEST STILL NAMES ONE `id` AND THAT IS NOT A LEFTOVER.** The sheet holds
 * ids, `share_links.id` is already the analytics prop, and the ownership check is
 * `shareLinkById`'s `user_id` predicate — so naming a row is the cheapest honest way
 * to say "the artifact behind this". Taking `(entity, entity_id)` from the body
 * instead would accept an artifact the caller merely guessed at and answer
 * differently for one they do not own, which is the existence oracle the whole
 * feature avoids.
 *
 * Every row is read BEFORE the update, because `age_hours` and `view_count` are
 * facts about an ADDRESS's life rather than about the revoke, and the route fires one
 * event per address. `ok: false` covers "not yours", "does not exist" and "already
 * off" — the route answers 404 to all three, for the resolver's reason.
 */
export async function revokeShare(
  id: string,
  userId: string,
): Promise<{ ok: true; revoked: RevokedAddress[] } | { ok: false }> {
  const db = await handle();
  const anchor = await shareLinkById(db, id, userId);
  if (!anchor || anchor.revokedAt !== null) return { ok: false };

  /*
   * Read the siblings before the update, for `age_hours`/`view_count`. The anchor is
   * in this list by construction — it is live and belongs to the same artifact — so
   * there is no separate case for it.
   */
  const before = await liveShareLinksForArtifact(db, userId, anchor.entity, anchor.entityId);

  const changed = await revokeArtifactLinks(db, userId, anchor.entity, anchor.entityId);
  if (changed.length === 0) return { ok: false };

  const now = Date.now();
  return {
    ok: true,
    revoked: before.map((row) => ({
      id: row.id,
      entity: row.entity,
      locale: row.locale,
      ageHours: Math.max(0, Math.round((now - row.createdAt.getTime()) / 3_600_000)),
      viewCount: row.viewCount,
    })),
  };
}

/** One live address, as the sheet needs to list it. NEVER carries the slug's row id
 *  alone — the URL is built here, because the client cannot build one (see header). */
export type LiveShareLink = {
  id: string;
  url: string;
  locale: Locale | null;
};

/**
 * Every live address the querent holds for one artifact.
 *
 * **THE SHEET HAD NO READ PATH BEFORE THIS, WHICH IS WHY THE REPORTED BUG ARRIVED
 * WITH NO WARNING.** `ShareFooter` only ever knew about a link it had just minted, so
 * opening it on a reading shared yesterday showed the *create* phase and nothing said
 * the existing address was about to be replaced. `liveShareLinkFor` looked like it
 * served this purpose and had zero production callers.
 *
 * **THE URL IS BUILT HERE AND NOT IN THE CLIENT**, same as the mint response:
 * `SHARE_BASE_URL` carries no `NEXT_PUBLIC_` prefix, so a client component assembling
 * it would read `undefined` for the origin.
 *
 * `sharingEnabled()` is NOT consulted, for `revokeShare`'s reason: turning minting off
 * must not hide the links already out there, or the kill switch makes the thing it is
 * killing unkillable.
 */
export async function liveSharesFor(
  userId: string,
  entity: ShareEntity,
  entityId: string,
): Promise<LiveShareLink[]> {
  const db = await handle();
  const rows = await liveShareLinksForArtifact(db, userId, entity, entityId);
  return rows.map((row) => ({ id: row.id, url: shareUrl(row.slug), locale: row.locale }));
}
