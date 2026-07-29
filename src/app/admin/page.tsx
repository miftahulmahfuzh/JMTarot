/**
 * `/admin` -- the index. v0.5.0 / A1 ships the FILE; **A4 owns what is inside it.**
 *
 * `requireAdminPage()` here as well as in the layout, and that is A1-8 rather than
 * belt-and-braces theatre: the layout is not a security boundary. This is the line
 * A4 must not delete when it replaces everything below it, so it is at the top and
 * the comment says why.
 *
 * `notFound()` and never a redirect, never a 403 (A-D2). A signed-in querent who
 * types this URL sees the same 404 as a typo.
 *
 * **WHAT A4 REPLACES AND WHAT IT MUST KEEP:** the body. The gate call, `runtime`,
 * `maxDuration`, the absence of a `<main>` and the absence of a `robots` field are
 * all asserted by `adminSurface.test.ts`, and the hero figure is calls-in-window
 * over 280 rather than notional spend (reconciliation R14).
 */
import { requireAdminPage } from '@/lib/admin/identity';
import { AdminPageViewed } from './AdminPageViewed';

export const runtime = 'nodejs';
export const maxDuration = 30;

export default async function AdminOverviewPage() {
  await requireAdminPage();

  return (
    <>
      <AdminPageViewed page="/admin" />
      <h1>Ringkasan</h1>
      {/* A4 (charts) and A3 (the queries behind them) fill this in. */}
      <p>Belum ada angka di sini. A3 dan A4 mengisinya.</p>
    </>
  );
}
