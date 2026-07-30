/**
 * `/admin/users` — the list, which exists to find one person. v0.5.0 / A5, task 10.
 *
 * **IT CARRIES NO PROSE AT ALL** (A5-8) — no `body`, no `gist`, no answer, no
 * `moderation_flags` state, no `personas.body`. V6's precedent, and *the binding reason is VD8
 * rather than bytes*: a query that fetched a prose column and dropped it has already put it in
 * the payload. `AdminUserListItem` declares no such field, so absence is STRUCTURAL and
 * `'body' in item === false` is assertable.
 *
 * **SEARCH TOUCHES `users.email` AND NOTHING ELSE** (A5-13). Not `readings.question`, not
 * `body`, not `gist`, not `daily_summaries.body`, not `personas.body`, not any answer column.
 * *A free-text search over what querents wrote is a different product with a different privacy
 * policy, and it is one `or(...)` away at all times.* The accepted cost is stated on screen:
 * `?q=` puts an email address in the URL and therefore in the platform access log.
 *
 * **SOFT-DELETED USERS ALWAYS APPEAR, BADGED, AND THERE IS NO FILTER THAT HIDES THEM**
 * (A5-14). Hiding them is how the thirty-day restore window becomes invisible.
 *
 * **NO AUDIT ROW IS WRITTEN FOR THIS PAGE** (§13.7, reconciliation §9.8): fifty rows per page
 * load would make the per-user page's audit panel unreadable. That is this release's one stated
 * gap in the audit trail, and it is on screen where the operator can see it rather than only in
 * a plan.
 *
 * **THE READS ARE SERVER-SIDE AND THERE IS NO CLIENT FETCH.** The query and the range come from
 * `searchParams`, so a search or a page change is a NAVIGATION — the pattern A4 established and
 * the one R21 struck `/api/admin/metrics/[metric]` for. `AdminUserTable` owns the search box and
 * the paging links and nothing else.
 */
import { Suspense } from 'react';
import { requireAdminPage } from '@/lib/admin/identity';
import { adminUserListPage, normalizeQuery, USERS_PAGE } from '@/lib/admin/userList';
import { db } from '@/lib/db/client';
import { withAdminRead } from '@/lib/db/queries/admin/timeout';
import { ChartSkeleton } from '@/components/chart/ChartError';
import { SEQUENTIAL } from '@/theme/chart';
import { AdminPageViewed } from '../AdminPageViewed';
import { AdminTabs } from '../AdminTabs';
import { RangeFilter } from '../RangeFilter';
import { compact, int, usd } from '../format';
import { parseRange, type ParsedRange } from '../range';
import { AdminUserTable } from './AdminUserTable';
import { LIST, U } from './copy';
import styles from './users.module.css';

export const runtime = 'nodejs';
/** 30, equal to A3's `ADMIN_MAX_DURATION_SECONDS`. A literal, per the fence. */
export const maxDuration = 30;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const parsed = parseRange(sp, todayUtc());
  const q = typeof sp.q === 'string' ? sp.q : '';
  const offset = Number(typeof sp.offset === 'string' ? sp.offset : 0) || 0;

  return (
    <div className={styles.page}>
      {/*
        * **THE EVENT FIRES HERE AND NOWHERE ELSE, AND A DEV LOG IS WHY.** The first draft also
        * called `track('admin.page_viewed', …)` server-side inside `Body`, which fired the same
        * name TWICE per page view -- and printed
        * `[analytics] unbatched track() outside withAnalytics` on every load, because a page
        * render is not inside a `withAnalytics` scope, so each call was its own INSERT with a
        * NULL `user_id`.
        *
        * `AdminPageViewed`'s own header calls itself *"the ONE mount for
        * `admin.page_viewed`"* (A1-18, R32), and its `page` prop is typed `AdminPagePath` so a
        * resolved `/admin/users/<uuid>` cannot be passed. One mount, one event, no uuid in
        * `events.props` -- which matters because **`events` rows survive that subject's erasure
        * with `user_id` nulled.**
        *
        * `/admin` and `/admin/tokens` still double-fire (A4's files, §6). Flagged in
        * `docs/workstream-notes.md`, not fixed here.
        */}
      <AdminTabs active="/admin/users" />
      <AdminPageViewed page="/admin/users" />
      {/* Hidden, not deleted -- see `/admin/page.tsx`. The table keeps its own
          `<caption>`, so it is still named independently of this. */}
      <h1 className={styles.srOnly}>{LIST.title}</h1>
      <RangeFilter action="/admin/users" parsed={parsed} />
      <AdminUserTable q={q} />
      <Suspense fallback={<ChartSkeleton height={320} label={U.loading} />}>
        <Body parsed={parsed} q={q} offset={offset} />
      </Suspense>
    </div>
  );
}

async function Body({
  parsed,
  q,
  offset,
}: {
  parsed: ParsedRange;
  q: string;
  offset: number;
}) {
  let page;
  try {
    page = await withAdminRead(db, (tx) =>
      adminUserListPage(tx, {
        q: normalizeQuery(q),
        limit: USERS_PAGE,
        offset,
        range: parsed.range,
      }),
    );
  } catch {
    /*
     * **NOTHING FROM THE DRIVER IS LOGGED** (A5-18): `?q=` is a bound parameter and it is an
     * email address, and *every `catch` that touches the database is a potential PII sink*.
     */
    return (
      <div className={styles.panel}>
        <p className={styles.failure}>{U.readFailed}</p>
        <p className={styles.note}>{U.readFailedDetail}</p>
      </div>
    );
  }

  // The bar column's scale is the biggest value ON THIS PAGE, and the page says so: an inline
  // bar in a paged table cannot claim a fleet-wide denominator.
  const peak = page.items.reduce((max, i) => Math.max(max, i.outputTokens ?? 0), 0);

  const c = LIST.columns;
  return (
    <div className={styles.panel}>
      {page.items.length === 0 ? (
        <p className={styles.empty}>{U.none}</p>
      ) : (
        <div className={styles.scroller}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>{LIST.title}</caption>
            <thead>
              <tr>
                <th scope="col">{c.email}</th>
                <th scope="col">{c.name}</th>
                <th scope="col">{c.locale}</th>
                <th scope="col">{c.onboarded}</th>
                <th scope="col">{c.created}</th>
                <th scope="col">{c.lastSeen}</th>
                <th scope="col" className={styles.numeric}>
                  {c.readings}
                </th>
                <th scope="col" className={styles.numeric}>
                  {c.calls}
                </th>
                <th scope="col" className={styles.numeric}>
                  {c.tokens}
                </th>
                <th scope="col" className={styles.numeric}>
                  {c.cost}
                </th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    {/* 44px of anchor, not 44px of ROW: A4 measured a 16px link inside a 44px
                        row, and the tap target is the anchor. */}
                    <a className={styles.rowLink} href={`/admin/users/${u.id}`}>
                      {u.email}
                    </a>
                  </td>
                  <td>
                    {u.displayName ?? U.empty}
                    {u.deleted ? <span className={styles.badge}>{LIST.deletedBadge}</span> : null}
                  </td>
                  <td>{u.locale}</td>
                  <td>{u.onboardedAt === null ? LIST.onboardedNo : LIST.onboardedYes}</td>
                  <td className={styles.mono}>{u.createdAt.slice(0, 10)}</td>
                  {/* **MINUTES, NOT SECONDS.** Measured at 1440px: with seconds, ten columns
                      came to 1193px inside an 1126px panel, so the notional-cost column -- the
                      one a cost league exists for -- was clipped with a scrollbar as its only
                      cue. A second of "last seen" answers no operator question. */}
                  <td className={styles.mono}>{u.lastSeenAt.slice(0, 16).replace('T', ' ')}</td>
                  <td className={styles.numeric}>{int(u.readings)}</td>
                  {/* `null` IS "outside the aggregate cap", NEVER zero. */}
                  <td className={styles.numeric}>{u.calls === null ? U.empty : int(u.calls)}</td>
                  <td className={styles.numeric}>
                    <TokenBar
                      input={u.inputTokens}
                      output={u.outputTokens}
                      peak={peak}
                    />
                  </td>
                  <td className={styles.numeric}>{usd(u.notionalUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className={styles.paging} aria-label={LIST.page(offset / USERS_PAGE + 1)}>
        {offset > 0 ? (
          <a
            className={styles.pageLink}
            href={hrefFor({ q, offset: Math.max(0, offset - USERS_PAGE) })}
          >
            {LIST.prev}
          </a>
        ) : null}
        <span className={styles.pageNow}>{LIST.page(Math.floor(offset / USERS_PAGE) + 1)}</span>
        {page.nextOffset !== null ? (
          <a className={styles.pageLink} href={hrefFor({ q, offset: page.nextOffset })}>
            {LIST.next}
          </a>
        ) : null}
      </nav>

      <p className={styles.note}>{LIST.searchNote}</p>
      <p className={styles.note}>{LIST.deletedShownAlways}</p>
      <p className={styles.note}>{LIST.offsetNote}</p>
      <p className={styles.note}>{LIST.costNote}</p>
      {/* **NO SILENT CAPS**: if the aggregate hit its ceiling, say which rows are blank and why. */}
      {page.aggregateCapped ? <p className={styles.note}>{LIST.aggregateCapped}</p> : null}
      <p className={styles.note}>{LIST.noAuditNote}</p>
    </div>
  );
}

/** The inline bar (§5.3: *a per-user cost league is a table with an inline bar column*). One
 *  SEQUENTIAL step, so it spends no categorical slot. */
function TokenBar({
  input,
  output,
  peak,
}: {
  input: number | null;
  output: number | null;
  peak: number;
}) {
  if (input === null || output === null) return <>{U.empty}</>;
  const share = peak > 0 ? Math.min(1, output / peak) : 0;
  return (
    <span className={styles.bar}>
      <span className={styles.barTrack}>
        <span
          className={styles.barFill}
          style={{ width: `${(share * 100).toFixed(1)}%`, background: SEQUENTIAL[2] }}
        />
      </span>
      <span className={styles.barValue}>
        {compact(input)} + {compact(output)}
      </span>
    </span>
  );
}

function hrefFor({ q, offset }: { q: string; offset: number }): string {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (offset > 0) p.set('offset', String(offset));
  const qs = p.toString();
  return qs ? `/admin/users?${qs}` : '/admin/users';
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
