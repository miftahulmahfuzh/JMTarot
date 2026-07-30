/**
 * The admin route templates. A1-18, and reconciliation R32 is the ruling that made
 * this a file rather than a `usePathname()` call.
 *
 * **TEMPLATES, NOT RESOLVED PATHS.** `/admin/users/[id]`, never
 * `/admin/users/9f3c…`. `admin.page_viewed.page` carries one of these values, and
 * a resolved path there breaks two of `events.ts`'s rules at once: the cardinality
 * rule (every `group by page` becomes useless) and the one that matters more --
 * **`events` rows SURVIVE account erasure with `user_id` nulled**, so a subject's
 * uuid in `props` is an identifier outliving that person's deletion. `usePathname()`
 * is the obvious implementation and it is the wrong one; `AdminPageViewed` takes
 * `AdminPagePath`, so the wrong one is a compile error.
 *
 * **Labels are Indonesian, hardcoded, and never in the i18n catalog** (A-D12).
 * Technical terms stay English where those are the terms of art -- `token` is
 * `token`, not `tanda`.
 *
 * A3-A6 add their entries here in the commit that adds their page. A page with no
 * entry renders no nav item and fires no event, which is a visible omission rather
 * than a silent one. **The pages below that A1 does not build are listed anyway**,
 * because the alternative is A4, A5 and A6 each discovering the nav is empty and
 * each adding a table of their own.
 *
 * ── `tab` IS WHAT LETS `AdminTabs` LIGHT A TAB WITHOUT `usePathname()` ───────
 *
 * 2026-07-30. Every entry names the nav tab it lives under, so the four routes with
 * no nav item of their own still light their parent: `/admin/users/[id]` lights
 * `Pengguna`, both blog sub-routes light `Tulisan`.
 *
 * **IT IS A COLUMN IN THIS TABLE RATHER THAN A PREFIX MATCH ON A PATHNAME, AND THAT
 * IS THE SAME RULING AS `label`'s** (R32). A resolved pathname is the obvious way to
 * decide which tab is on, and it is the wrong one for the reason the header above
 * gives: on `/admin/users/<uuid>` it carries a subject's id, and `events` rows
 * survive that subject's erasure with `user_id` nulled. `adminSurface.test.ts` bans
 * the string outright, so a future session cannot reach for it here either.
 *
 * A `tab` must name an entry that HAS a label, or it lights nothing — `pages.test.ts`
 * asserts exactly that, because the failure is a nav row with no tab on, on one route
 * only, and nothing in a diff to notice.
 */
export const ADMIN_PAGES = [
  { path: '/admin', label: 'Ringkasan', tab: '/admin' },
  { path: '/admin/tokens', label: 'Token', tab: '/admin/tokens' },
  { path: '/admin/users', label: 'Pengguna', tab: '/admin/users' },
  { path: '/admin/users/[id]', label: null, tab: '/admin/users' }, // reachable, not in the nav
  { path: '/admin/blog', label: 'Tulisan', tab: '/admin/blog' },
  { path: '/admin/blog/new', label: null, tab: '/admin/blog' },
  { path: '/admin/blog/[slug]', label: null, tab: '/admin/blog' },
] as const;

export type AdminPagePath = (typeof ADMIN_PAGES)[number]['path'];

/** The subset of `AdminPagePath` that actually renders a tab. */
export type AdminTabPath = Extract<(typeof ADMIN_PAGES)[number], { label: string }>['path'];

/** The tabs, in nav order. One filter, so the nav and this list cannot disagree. */
export const ADMIN_TABS = ADMIN_PAGES.filter(
  (p): p is Extract<(typeof ADMIN_PAGES)[number], { label: string }> => p.label !== null,
);

/**
 * Which tab is on, for a page that named itself.
 *
 * PURE, and TOTAL over `AdminPagePath` — every entry carries a `tab`, so there is no
 * fallback branch to get wrong. The non-null assertion is what that totality buys: the
 * argument is a member of this table's own union, so the `find` cannot miss, and
 * `pages.test.ts` calls it for every entry rather than trusting the `!`.
 */
export function tabFor(page: AdminPagePath): AdminTabPath {
  return ADMIN_PAGES.find((p) => p.path === page)!.tab;
}
