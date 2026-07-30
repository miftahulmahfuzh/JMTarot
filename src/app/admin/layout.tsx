/**
 * The `/admin` shell. v0.5.0 / A1.
 *
 * ── THREE THINGS THIS FILE IS RESPONSIBLE FOR, AND ONE IT IS NOT ─────────────
 *
 * IT IS: the `noindex` metadata (A-D3), the single `<main lang="id">` (plan §1.4),
 * and `ScrollTop`.
 *
 * ── THE NAV LEFT THIS FILE ON 2026-07-30, AND IT IS NOT COMING BACK ──────────
 *
 * It is `AdminTabs`, mounted by each page, because a tab row has to know which tab is
 * on and **a layout cannot know that**: it receives no `params`, no pathname and no
 * props from its children. The one API that would tell it is `usePathname()`, which
 * `adminSurface.test.ts` bans across this whole tree — a resolved path on
 * `/admin/users/<uuid>` reaching `events.props` outlives that subject's erasure (R32).
 *
 * So the page names its own tab, one line from where it already names its own
 * template for `AdminPageViewed`. **`ScrollTop` stayed**, because it needs to know
 * nothing: "the shell owns what is on every page and needs no context" still holds,
 * and the nav simply stopped qualifying.
 *
 * IT IS **NOT** THE GATE. `requireAdminPage()` below is defence in depth; every
 * page and every route handler under this tree calls it for itself. A layout
 * renders above its pages but is not a security boundary -- partial rendering,
 * route interception and any future parallel route can reach a page without a
 * parent layout's promise holding, and none of those look like a security change in
 * a diff. `adminSurface.test.ts` asserts the per-file call, and that assertion is
 * the one to protect.
 *
 * ── `lang="id"` ON `<main>`, AND IT IS NOT REDUNDANT ─────────────────────────
 *
 * The root layout awaits `getLocale()` for `<html lang>` -- correctly, and
 * CLAUDE.md capitalises "do not fix this back to a static lang". Admin copy is
 * Indonesian and hardcoded (A-D12). So an English-preferring operator gets
 * `<html lang="en">` wrapping Indonesian prose: a screen reader reading Indonesian
 * with English phonemes. `/s/[slug]` is the precedent, verbatim -- `lang` sits on
 * `<main>` and comes from what language the PROSE is in, never from the viewer.
 *
 * **THIS FILE OWNS THE ONLY `<main>` IN THE SUBTREE.** A page that renders its own
 * would nest two and could forget the attribute; `adminSurface.test.ts` asserts no
 * other file under `src/app/admin/**` contains one.
 *
 * ── `noindex` IS BELT AND BRACE TO THE 404, NOT THE MECHANISM ────────────────
 *
 * A crawler carries no cookie, so it gets `/login` from middleware and never sees
 * this markup. The header costs nothing and S-D12's precedent -- `/s/`'s
 * `noindex` must not spread to its neighbours -- shows this project already reasons
 * about header scope. Next merges layout metadata into child pages, so a child that
 * sets `title` alone inherits `robots`; a child that sets `robots` OVERRIDES it, so
 * `adminSurface.test.ts` asserts no other admin file mentions `robots`.
 *
 * **NO `t()`, NO `getT()`, NO `LocaleSwitch`** (A-D12, A1-17). Reconciliation R33
 * corrects the *reason* while keeping the rule: the catalog already ships on every
 * page because `LocaleProvider` is mounted in the root layout, so the payload
 * saving A-D12 claimed does not exist. What is real is the authoring cost of ~150
 * strings in two locales for a surface with one reader, and that `id.ts` owns the
 * key set -- so every admin string would force an English twin. **The grep in
 * `adminSurface.test.ts` is therefore the WHOLE enforcement, not a belt on a
 * stronger argument.**
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { requireAdminPage } from '@/lib/admin/identity';
import styles from './layout.module.css';
import { ScrollTop } from './ScrollTop';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Every route in this tree declares both (roadmap §4.2), and the reason is the
 * `POST /api/locale` postmortem: it was the only database-writing route declaring
 * neither, and Vercel's Hobby default of ten seconds lost the write on a cold
 * lambda plus a suspended Neon compute. **There is one admin, so there is never a
 * warm instance and every admin request is the cold one.**
 */
export const runtime = 'nodejs';
export const maxDuration = 30;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();

  return (
    <main lang="id" className={styles.shell}>
      {children}
      {/* Fixed, so it is last in the DOM: a keyboard operator reaches the page's own
          controls before the one that takes them back to the top of it. */}
      <ScrollTop />
    </main>
  );
}
