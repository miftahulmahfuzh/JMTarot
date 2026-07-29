import Link from 'next/link';
import type { ReactNode } from 'react';
import { ContentLocaleLink } from '@/components/ContentLocaleLink';
import { TrackLink } from '@/components/TrackLink';
import type { Locale } from '@/lib/i18n/locale';
import { getT } from '@/lib/i18n/t';
import styles from './PublicShell.module.css';

/**
 * The frame around every public content page: the entertainment-only disclaimer,
 * the legal links, the other-language link, and one way into the app.
 *
 * ── THE CROSS-LINKS ARE GONE, AND THIS PARAGRAPH USED TO ARGUE FOR THEM ─────
 *
 * It said: *"Jodith asked for a footer on the landing, blog and article pages.
 * What makes it worth more than decoration is the internal linking: twenty-two
 * lore pages that each link to the gallery and the blog, and a gallery that links
 * back, is the shape of a site that gets crawled completely."*
 *
 * **Miftah's ruling, 2026-07-29, on a phone: the homepage and the card pages
 * should look clean.** `Galeri / Arti kartu / Tulisan` appeared under the landing
 * page and under all 22 lore pages, and the two that are navigation rather than
 * content -- `/gallery` and `/blog` -- **moved into the account menu, below
 * Reading History**. `AccountMenu`'s header records the decision.
 *
 * **THE CRAWL ARGUMENT SURVIVES THE CHANGE, WHICH IS WHY IT COST NOTHING.** What a
 * crawler follows here was never this footer: `sitemap.xml` lists every public URL,
 * `hreflang` names both locale trees, `/gallery` links to all 22 lore pages, each
 * lore page links to its neighbours, its correspondences AND `/gallery`
 * (`arcana.gallery`), and the landing page's own sections link to all three. Every
 * public page is still reachable, and no page is now a leaf. What is gone is a
 * duplicate of those links in chrome.
 *
 * **`/` STAYS, AS THE ONE CONVERSION LINK.** It is the dual render: a stranger sees
 * the landing, a signed-in reader sees the picker. That is the link the footer is
 * FOR -- a stranger who has just read a card page and wants the app -- and it is
 * the only one the account menu cannot carry, because a stranger has no account.
 *
 * **`surface` IS KEPT THOUGH NOTHING FILTERS ANY MORE.** It is `public.link_clicked`'s
 * `from`, which is the one number telling `to: 'sign_in'` apart per surface -- the
 * conversion measurement §7 names. A prop that looks unused is worth one sentence;
 * deleting it would delete the funnel.
 *
 * ── IT IS A SERVER COMPONENT AND IT HAS NO SESSION (S-D10) ──────────────────
 *
 * No `currentUser()`, no `fetch`, no `'use client'`. These are the pages whose
 * TTFB a crawler measures and whose responses must be CDN-cacheable, and both
 * properties die the moment output varies by session. `/s/[slug]`'s page header has
 * the long version of this argument.
 *
 * The one client component below it is `TrackLink`, which V7 and the reader picker
 * already mount and which needs no session.
 *
 * ── IT TAKES A `path`, NOT AN `alternate` (R17) ─────────────────────────────
 *
 * **S1's plan gave this an `alternate: { href, label } | null` prop and expected
 * every content page to supply the href. Reconciliation R17 deleted it**, because
 * S3 found S1 and S2 disagreeing about a shape that did not exist on S2's side:
 * S2 ships a `ContentLocaleLink` component instead. S3's instinct -- fill the prop
 * from `contentAlternates().languages`, so the anchor and the `hreflang` tag come
 * out of ONE function and cannot drift -- was right, and it left four content pages
 * each writing the same three lines.
 *
 * So the shell takes the path it is mounted at and mounts
 * `<ContentLocaleLink path={path} />` itself. One function behind both the anchor
 * and the tag, one prop, one mount, zero duplicated decisions.
 *
 * **S2 HAS LANDED IT AND THE HOLE IS FILLED.** This paragraph used to say the
 * component did not exist and that the mount point below was a marked hole rather
 * than a placeholder `<a>` -- kept, rewritten, because the reason it gave is the
 * reason there is still exactly one anchor: a local link written "for now" is the
 * second definition R17 exists to prevent, and it is the one nobody deletes.
 * `<ContentLocaleLink path={path} />` reads `localePath` from the same leaf
 * `contentAlternates()` uses, so the anchor and the `hreflang` tag cannot drift.
 *
 * ── NO LOCALE PROP (LocaleProvider's rule) ──────────────────────────────────
 *
 * It calls `getT()` itself. On a content page the page's language IS what
 * middleware forwarded in `x-jmt-locale` -- after S2's rewrite, that is the
 * language the URL prefix names. **`/s/[slug]` needed a nested `LocaleProvider`
 * because its language comes from a database row rather than from the request; a
 * content page has no such problem and must not copy that mechanism.**
 *
 * ── THE SWITCHER IS A LINK, NEVER A POST (§4.2) ─────────────────────────────
 *
 * `LocaleSwitch` POSTs `/api/locale`, which re-mints the session and writes a
 * cookie. On a content page there is often no session, and the mechanism is wrong
 * regardless: **the sibling URL is the other language.** A real `<a href>` is also
 * the only form a crawler follows, which is how the other locale tree gets
 * discovered at all. The accepted cost -- a signed-in reader who switches here is
 * still in the old language inside the app -- is §4.2's, stated so nobody fixes it.
 *
 * ── AND `PublicShare` DOES NOT GO IN HERE ───────────────────────────────────
 *
 * It is a client component, and mounting it in the shell would force a hydration
 * boundary onto the landing page, which today ships zero client JavaScript except
 * analytics. S3/S4/S6 mount it inside `children`.
 */

export type PublicSurface = 'landing' | 'gallery' | 'arcana' | 'blog_index' | 'blog_post';

export type PublicShellProps = {
  /**
   * Which page is mounting it. **`public.link_clicked`'s `from`, and since the
   * cross-links moved out (see the header) that is its only job** -- there is one
   * link left and every page renders it, so nothing filters on this any more. It is
   * kept because `to: 'sign_in'` per surface is the conversion number §7 names.
   *
   * A CLOSED UNION AND NOT A PATHNAME -- events rule 2, and V4's `account.opened`
   * is the precedent: the mounting page passes its own, so there is no pathname to
   * parse and no `/arcana/[slug]` to explode into twenty-two values.
   */
  surface: PublicSurface;
  /**
   * The BARE path this page is served at -- `/gallery`, `/arcana/the-moon`, `/`.
   * Never prefixed: `localePath` derives the `/en/` twin and throws on an
   * already-prefixed argument precisely so a canonical cannot come out as
   * `/en/en/gallery`.
   *
   * **A PATH, NOT A URL AND NOT A LOCALE.** `LocaleProvider`'s header says NO
   * LOCALE PROP IS DRILLED ANYWHERE, and an absolute URL would have to be built
   * by `siteOrigin()`, which is fenced out of client components.
   */
  path: string;
  /**
   * The locales this path is actually served in. **v0.5.0 / A6, reconciliation R45.**
   *
   * Passed straight to `ContentLocaleLink`, which defaults it to `LOCALES`. **Only an
   * ARTICLE needs to supply it**: every other caller's two addresses are one route
   * file that middleware rewrites, so neither can 404. An article's `en` document can
   * be unpublished between two page views, and the footer would otherwise offer
   * *English* to a page that answers 404 — a reader-facing dead link A6 creates.
   *
   * The same set the page hands `contentAlternates()`, derived in SQL from published
   * rows that have a body (A6-6), so the anchor and the `hreflang` tag cannot disagree
   * — which is R17's whole reason for the shell mounting the control itself.
   */
  locales?: readonly Locale[];
  children: ReactNode;
};

/*
 * THE `LINKS` TABLE IS DELETED, NOT EMPTIED. It held `/gallery`,
 * `/arcana/the-moon` and `/blog` with a `surfaces` list each so a page could omit
 * its own -- see the header for the ruling that removed them and for why the crawl
 * does not depend on them. An empty array with the filter still around it would
 * read as a feature somebody switched off and invite a "fix".
 *
 * `public.footer.{gallery,arcana,blog}` STAY IN THE CATALOG: `public.footer.app`
 * and `public.footer.brandLine` are still rendered here, `catalog.test.ts` does not
 * require every key to have a live reader, and the three are the obvious strings to
 * reuse if a future release wants a cross-link block back on ONE surface rather
 * than on all five.
 */

export async function PublicShell({ surface, path, locales, children }: PublicShellProps) {
  const t = await getT();

  return (
    <div className={styles.frame}>
      {children}

      <footer className={styles.footer} data-path={path}>
        {/*
          **A PAGE STILL NEVER LINKS TO ITSELF, AND THAT IS THE WHOLE OF WHAT IS
          LEFT OF THE FILTER.** The one remaining link is `/`, so the surface it
          must be suppressed on is the landing -- which is `/`. `PublicShell.test.ts`
          asserts the mechanism, and it FAILED on the first version of this change:
          the cross-links went, the filter went with them, and the landing page's
          footer quietly grew a link to itself. The landing carries its own sign-in
          call to action anyway, so it loses nothing.
        */}
        {surface === 'landing' ? null : (
        <nav className={styles.links} aria-label={t('public.crumb.home')}>
          {/* The conversion link, and now the only one. `/` is the dual render: a
              stranger sees the landing, a signed-in reader sees the picker, and the
              gate decides -- which is exactly what `TryItYourself` already relies
              on. `to: 'sign_in'`'s sibling and the reason `surface` is still a
              prop. */}
          <TrackLink
            href="/"
            className={styles.link}
            name="public.link_clicked"
            props={{ from: surface, to: 'app', slug: null }}
          >
            {t('public.footer.app')}
          </TrackLink>
        </nav>
        )}

        {/*
          THE OTHER-LANGUAGE LINK (R17). One mount, here, rather than three lines
          in each of four content pages -- and it takes the same bare `path` those
          pages pass to `contentAlternates`, so the anchor and the `hreflang` tag
          come out of one leaf and cannot disagree.

          It renders nothing when `LOCALE_SWITCHER=0`, and English stays reachable
          by URL regardless: the switch gates the CONTROL, never the address, and
          `hreflang` names the other tree to a crawler whatever the UI offers.
        */}
        <ContentLocaleLink path={path} locales={locales} />

        <nav className={styles.legal} aria-label={t('common.terms')}>
          <Link href="/terms">{t('common.terms')}</Link>
          <Link href="/privacy">{t('common.privacy')}</Link>
        </nav>

        <p className={styles.brand}>{t('public.footer.brandLine')}</p>
        {/* §8.3. W7's rule reaches the pages a stranger meets first, where the
            exposure is higher rather than lower because there is no account. */}
        <p className={styles.disclaimer}>{t('common.disclaimer.short')}</p>
      </footer>
    </div>
  );
}
