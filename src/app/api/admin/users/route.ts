/**
 * `GET /api/admin/users` — the paged list, as JSON. v0.5.0 / A5, task 6.
 *
 * Roadmap §4.1 declares it and A5 owns it. **The page does not call it**: `/admin/users`
 * renders `adminUserListPage()` server-side, because the range and the query come from
 * `searchParams` and a filter change is a NAVIGATION — the pattern A4 established and the
 * one R21 struck `/api/admin/metrics/[metric]` for. This route is the same projection,
 * over HTTP, and it is where the payload contract is asserted end to end: **`'body' in
 * item === false` for every prose column name in the schema** (A5-8).
 *
 * `?q=` matches EMAIL ONLY. A5-13 permits email and display name and forbids everything
 * else, forever — no `readings.question`, no `body`, no `gist`, no `daily_summaries.body`,
 * no `personas.body`, no answer column. **A free-text search over what querents wrote is a
 * different product with a different privacy policy, and it is one `or(...)` away at all
 * times.** What ships is narrower than A5-13 permits, because A3's `adminUserList` matches
 * `u.email` and that file is A3's.
 *
 * The accepted cost, recorded so it is a decision: `?q=` puts an email address in the URL
 * and therefore in the platform access log. One admin, one operator.
 */
import { db } from '@/lib/db/client';
import { withAdminRead } from '@/lib/db/queries/admin/timeout';
import { adminUserListPage, normalizeQuery, USERS_PAGE } from '@/lib/admin/userList';
import {
  logAdminFailure,
  ok,
  refuseMethod,
  requireAdmin,
  unavailable,
} from './shared';
import { parseRange } from '@/app/admin/range';

export const runtime = 'nodejs';
/**
 * **A LITERAL, NOT `ADMIN_MAX_DURATION_SECONDS`, AND THE FENCE IS WHY.**
 * `adminSurface.test.ts` matches `/export const maxDuration = \d+/` against the SOURCE —
 * because Next reads these exports at build time from the module's static shape, and an
 * imported identifier is exactly the kind of value that can be right in TypeScript and
 * absent in the build manifest. It must stay equal to `ADMIN_MAX_DURATION_SECONDS` (30);
 * A3's `timeout.ts` owns the number and the ordering it sits in.
 */
export const maxDuration = 30;

/** A-D2: an unimplemented verb answers 404, not 405. See `refuseMethod`. */
export const POST = refuseMethod;
export const PUT = refuseMethod;
export const PATCH = refuseMethod;
export const DELETE = refuseMethod;

export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  // The same parser the pages use, so a range in a URL means one thing on this surface.
  // It never throws and falls back to the default window on anything unusable.
  const { range } = parseRange(params, todayUtc());
  const q = normalizeQuery(url.searchParams.get('q'));
  const offset = Number(url.searchParams.get('offset') ?? 0);

  try {
    const page = await withAdminRead(db, (tx) =>
      adminUserListPage(tx, { q, limit: USERS_PAGE, offset, range }),
    );
    return ok({
      items: page.items,
      nextCursor: page.nextOffset === null ? null : String(page.nextOffset),
      aggregateCapped: page.aggregateCapped,
    });
  } catch (err) {
    // THE ERROR OBJECT IS NOT LOGGED (A5-18). `?q=` is a bound parameter and it is an
    // email address.
    logAdminFailure('users list', err, { adminUserId: gate.user.id });
    return unavailable();
  }
}

/** `'YYYY-MM-DD'` in UTC. The range endpoints are calendar days and never instants; A4's
 *  pages derive theirs the same way. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
