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
 */
export const ADMIN_PAGES = [
  { path: '/admin', label: 'Ringkasan' },
  { path: '/admin/tokens', label: 'Token' },
  { path: '/admin/users', label: 'Pengguna' },
  { path: '/admin/users/[id]', label: null }, // reachable, not in the nav
  { path: '/admin/blog', label: 'Tulisan' },
  { path: '/admin/blog/new', label: null },
  { path: '/admin/blog/[slug]', label: null },
] as const;

export type AdminPagePath = (typeof ADMIN_PAGES)[number]['path'];
