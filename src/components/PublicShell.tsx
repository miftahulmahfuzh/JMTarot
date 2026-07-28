import Link from 'next/link';
import type { ReactNode } from 'react';
import { TrackLink } from '@/components/TrackLink';
import { getT } from '@/lib/i18n/t';
import styles from './PublicShell.module.css';

/**
 * The frame around every public content page: the cross-links, the
 * entertainment-only disclaimer, the legal links and the other-language link.
 *
 * ── THE FOOTER IS THE ASK, AND THE CROSS-LINKS ARE THE POINT ────────────────
 *
 * Jodith asked for a footer on the landing, blog and article pages. What makes it
 * worth more than decoration is the internal linking: twenty-two lore pages that
 * each link to the gallery and the blog, and a gallery that links back, is the
 * shape of a site that gets crawled completely. A footer is the cheapest place to
 * guarantee every public page is two clicks from every other.
 *
 * **A PAGE NEVER LINKS TO ITSELF.** `surface` filters the list. A self-link is not
 * harmful to a crawler and it is confusing to a person, and the filter is one line.
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
 * **S2 HAS NOT LANDED THAT COMPONENT YET** (only its `prefix.ts` leaf has, because
 * `gate.ts` needed it). The mount point below is a marked hole rather than a
 * placeholder implementation: a local `<a>` written here "for now" is the second
 * definition R17 exists to prevent, and it would be the one nobody deletes.
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
   * Which page is mounting it. Decides which cross-link is omitted (a page never
   * links to itself) and is the `from` prop on `public.link_clicked`.
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
  children: ReactNode;
};

/** Which footer link belongs to which surface, so a page can omit its own. */
const LINKS = [
  { surfaces: ['gallery'], href: '/gallery', to: 'gallery', key: 'public.footer.gallery' },
  { surfaces: ['arcana'], href: '/arcana/the-moon', to: 'arcana', key: 'public.footer.arcana' },
  { surfaces: ['blog_index', 'blog_post'], href: '/blog', to: 'blog', key: 'public.footer.blog' },
] as const;

export async function PublicShell({ surface, path, children }: PublicShellProps) {
  const t = await getT();
  // Referenced so the prop is not silently unused before S2's mount lands, and so
  // a page passing the wrong thing is visible in the DOM rather than nowhere.
  void path;

  return (
    <div className={styles.frame}>
      {children}

      <footer className={styles.footer} data-path={path}>
        <nav className={styles.links} aria-label={t('public.crumb.home')}>
          {LINKS.filter((l) => !(l.surfaces as readonly string[]).includes(surface)).map((l) => (
            <TrackLink
              key={l.href}
              href={l.href}
              className={styles.link}
              name="public.link_clicked"
              props={{ from: surface, to: l.to, slug: null }}
            >
              {t(l.key)}
            </TrackLink>
          ))}
          {/* The conversion link. `/` is the dual render: a stranger sees the
              landing, a signed-in reader sees the picker, and the gate decides
              -- which is exactly what `TryItYourself` already relies on. */}
          <TrackLink
            href="/"
            className={styles.link}
            name="public.link_clicked"
            props={{ from: surface, to: 'app', slug: null }}
          >
            {t('public.footer.app')}
          </TrackLink>
        </nav>

        {/*
          S2 MOUNTS `<ContentLocaleLink path={path} />` HERE (R17), and this is a
          hole rather than a placeholder on purpose: a local `<a>` written "for
          now" is the second definition of the other-language link that R17 exists
          to prevent, and it is the one nobody would delete. English stays
          reachable by URL until then, which is what `hreflang` names to a crawler
          regardless of what the UI offers.
        */}

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
