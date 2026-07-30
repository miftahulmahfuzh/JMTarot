/**
 * `/admin/users/[id]` — **fourteen tables about one person, on one screen.**
 * v0.5.0 / A5, task 11.
 *
 * ── WHY ONE ROUTE AND NOT FOURTEEN (§11.1) ──────────────────────────────────
 *
 * An operator's question is almost never about one table. *"Why did this reading cost that
 * much"* spans `readings`, `llm_calls` and `translations`; *"did the delete button work"* spans
 * `users`, `share_links`, `moderation_flags` and `onboarding_answers`. **A tabbed page hides
 * exactly the adjacency that answers those**, and it costs a navigation per tab on a cold
 * lambda. One page, fourteen anchored sections.
 *
 * ── ONE `Promise.all`, ONE READ-ONLY TRANSACTION, ONE FAILURE STATE ─────────
 *
 * **Every admin request is a cold one** — there is one admin, so there is never a warm
 * instance, and the first query also wakes a suspended Neon compute, which §4.2 calls the
 * single most likely live failure in v0.5.0. `withAdminRead` bounds the database at 10s and
 * `maxDuration` bounds the function at 30.
 *
 * **A failure renders ONE state and not fourteen** (§11.1, and A4's I-24 in the other
 * direction): a page of fourteen independently-failing panels is fourteen things to read
 * before knowing that the answer is "the database is down". Nothing from the driver is
 * logged — *every `catch` that touches the database is a potential PII sink*, and these
 * statements bind a subject id with `readings.question`, `onboarding_answers.answer_text` and
 * `moderation_flags.question` among their columns.
 *
 * ── THE AUDIT ROW IS WRITTEN BEFORE ANY PANEL IS READ ───────────────────────
 *
 * `recordUserDetailView` covers the eleven sections that have no reveal of their own — the
 * questions, the Lotus, the persona, the summaries, the verdicts. It **throws** on failure
 * (reconciliation R30) and the throw lands in the same `catch`, so a page whose audit row could
 * not be written renders the failure state with **no querent data on it at all**. That is the
 * ordering `/api/admin/users/[id]/answer/[key]` uses, applied to a page.
 *
 * **IT IS NOT INSIDE `withAdminRead`.** That wrapper sets `transaction_read_only = on`, and the
 * audit row is a WRITE — the one write this whole surface performs. A read-only wrapper around
 * an audited read is the tidy-up that turns every page load into a 500.
 *
 * ── AND NOTHING HERE CALLS `t()` (A-D12, A5-3) ──────────────────────────────
 *
 * Copy is Indonesian and hardcoded in `../copy.ts`; numbers and dates go through A4's
 * `../../format.ts`, which is `Intl` with a hardcoded `id-ID` and no catalog import.
 * `adminSurface.test.ts` and `adminCopy.test.ts` both grep this tree, and R33's ruling is that
 * **the grep is the whole enforcement** rather than a belt on a stronger argument.
 */
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { requireAdminPage } from '@/lib/admin/identity';
import { recordUserDetailView } from '@/lib/admin/reveal';
import { db } from '@/lib/db/client';
import { accessesForSubject } from '@/lib/db/queries/admin/audit';
import { callTotalsForUser } from '@/lib/db/queries/admin/calls';
import {
  adminEmailsByIds,
  answerStatesForAdmin,
  answersLastChanged,
  dailySummariesForAdmin,
  eventsForAdmin,
  frequencyVerdictsForAdmin,
  lotusForAdmin,
  shareLinksForAdmin,
  translationsForAdmin,
  userIdentityForAdmin,
  DETAIL_ROW_CAP,
} from '@/lib/db/queries/admin/detail';
import { moderationFlagsForAdmin } from '@/lib/db/queries/admin/moderation';
import {
  readingCostsFor,
  readingsForAdmin,
  READINGS_PAGE,
  type ReadingCursor,
} from '@/lib/db/queries/admin/readings';
import { withAdminRead } from '@/lib/db/queries/admin/timeout';
import { getPersona } from '@/lib/db/queries/persona';
import { getProfile } from '@/lib/db/queries/profile';
import { ChartSkeleton } from '@/components/chart/ChartError';
import { AdminPageViewed } from '../../AdminPageViewed';
import { AdminTabs } from '../../AdminTabs';
import { RangeFilter } from '../../RangeFilter';
import { parseRange, type ParsedRange } from '../../range';
import { DETAIL, U } from '../copy';
import { callsByOpForUser, userTokenSeries } from '../series';
import { AccessLog } from './sections/AccessLog';
import { Answers } from './sections/Answers';
import { EventStream } from './sections/EventStream';
import { Facts } from './sections/Facts';
import { Identity } from './sections/Identity';
import { Lotus } from './sections/Lotus';
import { Moderation } from './sections/Moderation';
import { Persona } from './sections/Persona';
import { Readings } from './sections/Readings';
import { ShareLinks } from './sections/ShareLinks';
import { Summaries } from './sections/Summaries';
import { Tokens } from './sections/Tokens';
import { Translations } from './sections/Translations';
import { Verdicts } from './sections/Verdicts';
import styles from './detail.module.css';

export const runtime = 'nodejs';
/** 30, equal to A3's `ADMIN_MAX_DURATION_SECONDS`. A literal because the fence reads the
 *  source and because Next reads these exports from the module's static shape. */
export const maxDuration = 30;

/** The anchors, in render order. One list, so the nav and the sections cannot disagree. */
const SECTIONS = [
  ['identitas', DETAIL.identity.heading],
  ['data-diri', DETAIL.facts.heading],
  ['jawaban', DETAIL.answers.heading],
  ['lotus', DETAIL.lotus.heading],
  ['sosok', DETAIL.persona.heading],
  ['token', DETAIL.tokens.heading],
  ['ringkasan', DETAIL.summaries.heading],
  ['verdict', DETAIL.verdicts.heading],
  ['terjemahan', DETAIL.translations.heading],
  ['tautan', DETAIL.shareLinks.heading],
  ['moderasi', DETAIL.moderation.heading],
  ['peristiwa', DETAIL.events.heading],
  ['audit', DETAIL.access.heading],
  /*
   * **BACAAN IS LAST ON PURPOSE, AND IT IS THE ONE SECTION WHOSE POSITION IS A DECISION.**
   * 2026-07-30, the operator's report: it is the paginated one, up to `READINGS_PAGE` rows
   * long, and sixth of fourteen it buried the eight short panels after it under a screen and
   * a half of readings. Everything above is scannable in a glance; this is the one you read.
   *
   * The order here and the JSX's order are the same list twice and must stay in step --
   * `page.contract.test.ts` asserts only that all fourteen are MOUNTED, deliberately, because
   * it is guarding against an orphaned panel and not against a reordering like this one.
   */
  ['bacaan', DETAIL.readings.heading],
] as const;

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const sp = await searchParams;
  const parsed = parseRange(sp, todayUtc());

  return (
    <div className={styles.page}>
      {/* One mount, one event -- see `/admin/users/page.tsx`'s note. The prop is the TEMPLATE,
          never the resolved path, so a subject uuid cannot reach `events.props`. */}
      <AdminTabs active="/admin/users/[id]" />
      <AdminPageViewed page="/admin/users/[id]" />
      <a className={styles.back} href="/admin/users">
        {U.backToList}
      </a>
      <RangeFilter action={`/admin/users/${id}`} parsed={parsed} />
      <Suspense fallback={<ChartSkeleton height={240} label={U.loading} />}>
        <Body id={id} parsed={parsed} cursor={cursorFrom(sp)} />
      </Suspense>
    </div>
  );
}

/**
 * `?before=<iso>|<uuid>` — the readings keyset cursor, from the URL.
 *
 * **A MALFORMED CURSOR IS TREATED AS ABSENT, NEVER AS A 400**, because a broken cursor must
 * show page one rather than an error (§5.3's rule). The uuid half is validated in the query
 * module, which is where the `22P02` guard lives.
 */
function cursorFrom(sp: Record<string, string | string[] | undefined>): ReadingCursor | undefined {
  const raw = typeof sp.before === 'string' ? sp.before : undefined;
  if (!raw) return undefined;
  const at = raw.lastIndexOf('|');
  if (at <= 0) return undefined;
  return { createdAt: raw.slice(0, at), id: raw.slice(at + 1) };
}

async function Body({
  id,
  parsed,
  cursor,
}: {
  id: string;
  parsed: ParsedRange;
  cursor: ReadingCursor | undefined;
}) {
  const admin = await requireAdminPage();

  /*
   * **THE EXISTENCE CHECK COMES BEFORE THE AUDIT ROW.** An audit row for a uuid that is
   * nobody's would let anybody holding the admin's session write rows about a person who does
   * not exist -- and, worse, would make `resource = 'user_detail'` unreliable as an answer to
   * "who has been looked at".
   */
  let identity;
  try {
    identity = await withAdminRead(db, (tx) => userIdentityForAdmin(tx, id));
  } catch {
    return <Failure />;
  }
  // A5-1: the same 404 an unauthorised caller gets, so "does this user exist" is unanswerable
  // from outside. A5-17: a malformed uuid arrives here as `null`, not as `22P02`.
  if (!identity) notFound();

  let data;
  try {
    // The audit row FIRST, outside the read-only transaction, and it THROWS on failure.
    await recordUserDetailView(db, { adminUserId: admin.id, subjectUserId: id });

    data = await withAdminRead(db, async (tx) =>
      Promise.all([
        getProfile(tx, id),
        answerStatesForAdmin(tx, id),
        answersLastChanged(tx, id),
        lotusForAdmin(tx, id),
        getPersona(tx, id),
        readingsForAdmin(tx, id, { limit: READINGS_PAGE, before: cursor }),
        callTotalsForUser(tx, id, parsed.range),
        dailySummariesForAdmin(tx, id),
        frequencyVerdictsForAdmin(tx, id),
        translationsForAdmin(tx, id),
        shareLinksForAdmin(tx, id),
        moderationFlagsForAdmin(tx, id),
        eventsForAdmin(tx, id, DETAIL_ROW_CAP),
        accessesForSubject(tx, id, DETAIL_ROW_CAP),
      ]),
    );
  } catch {
    /*
     * **NOTHING FROM THE DRIVER IS LOGGED HERE** (A5-18). A postgres error quotes the failing
     * statement AND its bound parameters, and among the columns in these statements are
     * `readings.question`, `onboarding_answers.answer_text` and `moderation_flags.question`.
     * A thrown audit write lands here too, which is the point: no panel renders.
     */
    return <Failure />;
  }

  const [
    profile,
    answerStates,
    answersUpdatedAt,
    lotus,
    persona,
    readingPage,
    callTotals,
    summaries,
    verdicts,
    translations,
    shareLinks,
    flags,
    events,
    accesses,
  ] = data;

  /*
   * The reading costs and the admin emails need ids from the reads above, so they are a second
   * round trip rather than part of the `Promise.all`. Two statements, both indexed, both over
   * at most fifty ids.
   */
  let costs;
  let adminEmails;
  try {
    [costs, adminEmails] = await withAdminRead(db, async (tx) =>
      Promise.all([
        readingCostsFor(tx, readingPage.rows.map((r) => r.id)),
        adminEmailsByIds(
          tx,
          accesses.map((a) => a.adminUserId).filter((x): x is string => x !== null),
        ),
      ]),
    );
  } catch {
    return <Failure />;
  }

  const series = userTokenSeries(callTotals, parsed.range.from, parsed.range.to);

  return (
    <>
      {/*
        * **THE HEADING IS HIDDEN AND THE SUBJECT IS NAMED IN A LINE INSTEAD** (2026-07-30).
        * The four nav pages' `<h1>`s were verbatim copies of their own tab and are now
        * `srOnly`; this one was NOT a copy -- it carries the email, which no tab can -- so it
        * is still on screen, at the weight of the back link it sits under rather than as a
        * display title above a page whose own tab row is now doing the naming. The `<h1>`
        * stays in the document for the same reason it does on the other four: a page with no
        * level-1 heading leaves a screen-reader operator with no "where am I".
        */}
      <h1 className={styles.srOnly}>{DETAIL.title(identity.email)}</h1>
      <p className={styles.subject}>{DETAIL.title(identity.email)}</p>
      {/*
        * **THE ANCHOR NAV IS BELOW THE TITLE AND INSIDE `Body`, AND THE 1440px SHOT MOVED IT
        * HERE.** It was in the shell, above `<Suspense>`, which put fourteen anchors and a
        * sticky bar ABOVE the `<h1>` -- so the first thing on the page was a table of contents
        * for a page whose subject had not been named yet. The `<h1>` needs `identity.email`, so
        * it cannot move up; the nav can move down.
        */}
      <nav className={styles.toc} aria-label={DETAIL.tocLabel}>
        {SECTIONS.map(([anchor, label]) => (
          <a key={anchor} className={styles.tocLink} href={`#${anchor}`}>
            {label}
          </a>
        ))}
      </nav>
      <Identity user={identity} />
      <Facts profile={profile} />
      <Answers states={answerStates} userId={id} />
      <Lotus lotus={lotus} answersUpdatedAt={answersUpdatedAt} />
      <Persona persona={persona} answersUpdatedAt={answersUpdatedAt} />
      <Tokens
        series={series}
        byOp={callsByOpForUser(callTotals)}
        rangeEnd={parsed.range.to}
      />
      <Summaries rows={summaries} />
      <Verdicts rows={verdicts} />
      <Translations rows={translations} />
      <ShareLinks rows={shareLinks} />
      <Moderation rows={flags} userId={id} />
      <EventStream rows={events} cap={DETAIL_ROW_CAP} />
      <AccessLog rows={accesses} adminEmails={adminEmails} />
      {/* LAST -- see the note on `SECTIONS`. */}
      <Readings
        rows={readingPage.rows}
        costs={costs}
        userId={id}
        totalReadings={readingPage.rows.length + (readingPage.nextCursor ? 1 : 0)}
        /*
         * **`#bacaan` IS LOAD-BEARING NOW THAT THIS SECTION IS LAST.** Paging is a
         * navigation to this same route, so without the fragment the operator lands at the
         * top of a page whose readings are a screen and a half below -- which is the exact
         * complaint that moved this section down here, reintroduced through the back door.
         */
        nextHref={
          readingPage.nextCursor
            ? `/admin/users/${id}?before=${encodeURIComponent(
                `${readingPage.nextCursor.createdAt}|${readingPage.nextCursor.id}`,
              )}#bacaan`
            : null
        }
      />
    </>
  );
}

/** One failure state for the whole page. See the header. */
function Failure() {
  return (
    <div className={styles.panel}>
      <p className={styles.failure}>{U.readFailed}</p>
      <p className={styles.note}>{U.readFailedDetail}</p>
    </div>
  );
}

/** See A4's pages: once per request, never during a component's render — `new Date()` differs
 *  between the server render and hydration, which is the `todayKey()` trap. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
