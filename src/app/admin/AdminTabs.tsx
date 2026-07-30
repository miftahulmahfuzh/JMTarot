/**
 * The `/admin` tab row. 2026-07-30.
 *
 * ── IT LIVES IN THE PAGES, NOT IN THE LAYOUT, AND THAT IS THE WHOLE DESIGN ───
 *
 * A tab row has to know which tab is on. The obvious implementation is
 * `usePathname()` in a client component, and `adminSurface.test.ts` bans that string
 * across this entire tree — because a resolved path on `/admin/users/<uuid>` reaching
 * `admin.page_viewed.page` puts a subject's uuid into `events.props`, and **`events`
 * rows survive that subject's account erasure with `user_id` nulled** (R32, and the
 * header of `pages.ts`).
 *
 * So the page names its own tab, exactly as it already names its own template one
 * line away:
 *
 *     <AdminTabs active="/admin/tokens" />
 *     <AdminPageViewed page="/admin/tokens" />
 *
 * `active` is `AdminPagePath`, so a misspelling is a compile error rather than a nav
 * row with nothing lit. **This stays a SERVER component with no client JavaScript** —
 * the whole admin tree is server-rendered and a tab highlight is not worth being the
 * first exception. The cost of moving out of the layout is that a new page could ship
 * without a tab row, and `adminSurface.test.ts` asserts every `page.tsx` mounts this
 * exactly once with an `active` matching its `AdminPageViewed`.
 *
 * ── `aria-current` IS NOT DECORATION HERE ────────────────────────────────────
 *
 * The four visible `<h1>`s were removed in the same change — each was a
 * character-for-character copy of its own nav label, so the page said its name twice
 * and marked it zero times. Each page keeps that string as a **visually-hidden**
 * `<h1>`, and this row carries `aria-current="page"`. The curve is one channel and
 * `aria-current` is the other; a highlight with only the first is a highlight half
 * the operators cannot perceive.
 *
 * **NO `t()`, NO `getT()`** (A-D12). Labels come from `pages.ts`, hardcoded
 * Indonesian, and `adminCopy.test.ts` greps this file for the machinery.
 */
import Link from 'next/link';
import styles from './AdminTabs.module.css';
import { ADMIN_TABS, tabFor, type AdminPagePath } from './pages';

export function AdminTabs({ active }: { active: AdminPagePath }) {
  const on = tabFor(active);

  return (
    <nav className={styles.tabs} aria-label="Navigasi admin">
      {ADMIN_TABS.map((p) => {
        const current = p.path === on;
        return (
          <Link
            key={p.path}
            href={p.path}
            prefetch={false}
            className={current ? `${styles.tab} ${styles.on}` : styles.tab}
            aria-current={current ? 'page' : undefined}
          >
            {p.label}
          </Link>
        );
      })}
      {/*
       * The rest of the separating rule, across whatever width the tabs did not use.
       * An element and not a pseudo because only the flex layout knows how wide "the
       * rest" is; `aria-hidden` and empty because it is a rule, not a control. See the
       * stylesheet's header.
       */}
      <span className={styles.rail} aria-hidden="true" />
    </nav>
  );
}
