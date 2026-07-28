import { Eyebrow } from '@/components/Eyebrow';
import { JsonLd } from '@/components/JsonLd';
import { PublicShell } from '@/components/PublicShell';
import { TrackLink } from '@/components/TrackLink';
import { TrackView } from '@/components/TrackView';
import { CARDS, cardImage } from '@/data/deck';
import { getLocale, getT } from '@/lib/i18n/t';
import { graph, organization, website } from '@/lib/seo/jsonld';
import { siteOrigin } from '@/lib/seo/origin';
import { OPERATOR } from '@/app/terms/operator';
import styles from './Landing.module.css';

/**
 * The homepage a stranger sees, and the first page in this project's history that
 * Google is allowed to index.
 *
 * ── WHY IT EXISTS (S-D5) ────────────────────────────────────────────────────
 *
 * Before this, `/` 302'd to `/login` for anyone with no cookie, so the addressable
 * site was one login form and two `noindex` legal documents. It also closes a
 * blocker CLAUDE.md has carried for two releases: **Google's OAuth branding
 * requirement is an app homepage that is not a login page**, and publishing the
 * consent screen was blocked on exactly that.
 *
 * ── FOUR RULES, ALL OF THEM ROADMAP §10 ─────────────────────────────────────
 *
 * 1. **No session.** `currentUser()` is the dispatcher's, in `page.tsx`. This
 *    component renders only when there is none, and reading one again would be a
 *    second decode that could disagree with the first.
 * 2. **No database, at all.** Not "wrapped in a try" -- absent. A public page must
 *    not be able to 500 on a database outage, and three routes in this app already
 *    carry that bug (`/api/memory/{frequency,summary}`, `/api/persona`); v0.4.0
 *    must not add a fourth. `Landing.test.ts` asserts the absence of the import.
 * 3. **No model call, ever** (S-D7). This is a session-less public route, so a
 *    model call here is `LLM_WINDOW_CALL_CEILING` with no gate in front of it --
 *    which since V9 is the app's primary abuse control rather than a cost question.
 *    Every word on this page is a catalog key.
 * 4. **Server component, zero client JavaScript except analytics.** `TrackView` and
 *    `TrackLink` are the only client components below here and neither needs a
 *    session. `/login` set the precedent and the reason: the screen a stranger
 *    meets first should work before hydration.
 *
 * ── THE HERO IS EXISTING ART AND NOTHING WAS GENERATED ──────────────────────
 *
 * `cardImage(HERO.slug)`, which appends `?v=3`. **Never a hand-written
 * `/cards/...` path**: `next.config.ts` serves that prefix with
 * `max-age=31536000, immutable` on filenames that are NOT content-hashed, and the
 * `?v=` query is the entire cache-busting story (`deck.ts`'s `ART_VERSION`). A plain
 * `<img>` and not `next/image`, for the reason `AccountCard` records: `next/image`
 * refuses a local `src` carrying a query string unless `images.localPatterns` is
 * configured, and `CardFace` -- which is a client component and would drag
 * `useT()` in here -- uses a plain `<img>` for the same reason.
 *
 * ── THE THREE OUTBOUND LINKS BELONG TO OTHER WORKSTREAMS ────────────────────
 *
 * `/gallery` (S3), `/arcana/the-moon` (S4), `/blog` (S6). They are written here
 * because the route table is S1's contract, and they are 404s until those land.
 * **The release ships as one; S1 must not deploy alone, and no test can catch it**
 * -- `tools/seo/crawl.sh` is the check, because the pages are MEANT to be missing
 * at this point in the sequence.
 *
 * The Moon rather than an arbitrary card: it is the highest-volume Major Arcana
 * query in both languages and it is already this codebase's canonical worked
 * example everywhere else. **The literal `/arcana/the-moon` is a placeholder for
 * S4's `cardUrlSlug`** -- a permanent public address deserves §3.2's table behind
 * it rather than a string somebody typed, and S1's plan asks S4 to tighten this
 * assertion when that function exists.
 */

/** The hero card. The Star -- upright, unambiguous, and the least ominous face
 *  to put in front of somebody who has not decided whether to trust us. */
const HERO = CARDS.find((c) => c.slug === '17_star')!;

export async function Landing() {
  const t = await getT();
  const locale = await getLocale();
  const origin = siteOrigin();

  return (
    <PublicShell surface="landing" path="/">
      <TrackView
        name="public.page_viewed"
        props={{ page: 'landing', locale, slug: null, referrer_kind: 'direct' }}
      />

      {/*
        `Organization` + `WebSite`, in ONE `@graph` with ONE `@context` (S-D16).
        No `SearchAction`: there is no site search and marking up one we do not
        have is a lie a crawler can check.

        `inLanguage` is the BARE tag and never `intlTag(locale)`, which would be
        `en-GB` (R15): `inLanguage` is a factual claim a crawler believes, nothing
        here was written as British English, and `id-ID` on this node beside `id`
        on S3's 22 ImageObjects in the same graph is the inconsistency the rule
        exists to prevent.

        `legalName` comes from `src/app/terms/operator.ts`, which is the single
        source of truth for it across four legal documents. The `forum` string in
        that file is the one still awaiting confirmation against the deed and is
        deliberately NOT emitted here -- structured data is machine-readable and a
        wrong court in it is worse than no court.
      */}
      <JsonLd
        node={graph([
          organization({
            origin,
            name: t('app.title'),
            legalName: OPERATOR.legalName,
            logo: '/icon.png',
            description: t('meta.description'),
          }),
          website({
            origin,
            name: t('app.title'),
            description: t('meta.description'),
            inLanguage: locale,
          }),
        ])}
      />

      <Eyebrow>{t('common.majorArcana')}</Eyebrow>
      <h1 className={styles.title}>{t('app.title')}</h1>
      <p className={styles.tagline}>{t('landing.tagline')}</p>

      <div className={styles.hero}>
        {/* eslint-disable-next-line @next/next/no-img-element -- see the header:
            `cardImage()` carries `?v=` and next/image refuses a local src with a
            query string unless `images.localPatterns` is configured. */}
        <img
          src={cardImage(HERO.slug)}
          alt={t('landing.hero.alt', { name: HERO.name })}
          width={800}
          height={1200}
        />
      </div>

      <p className={styles.lede}>{t('landing.lede')}</p>

      <TrackLink
        href="/login"
        className={styles.cta}
        name="public.link_clicked"
        props={{ from: 'landing', to: 'sign_in', slug: null }}
      >
        {t('landing.signIn')}
      </TrackLink>

      <section className={styles.block}>
        <h2>{t('landing.gallery.title')}</h2>
        <p>{t('landing.gallery.body')}</p>
        <TrackLink
          href="/gallery"
          name="public.link_clicked"
          props={{ from: 'landing', to: 'gallery', slug: null }}
        >
          {t('landing.gallery.link')}
        </TrackLink>
      </section>

      <section className={styles.block}>
        <h2>{t('landing.arcana.title')}</h2>
        <p>{t('landing.arcana.body')}</p>
        <TrackLink
          href="/arcana/the-moon"
          name="public.link_clicked"
          props={{ from: 'landing', to: 'arcana', slug: 'the-moon' }}
        >
          {t('landing.arcana.link')}
        </TrackLink>
      </section>

      <section className={styles.block}>
        <h2>{t('landing.readers.title')}</h2>
        <p>{t('landing.readers.body')}</p>
      </section>

      <section className={styles.block}>
        <h2>{t('landing.blog.title')}</h2>
        <p>{t('landing.blog.body')}</p>
        <TrackLink
          href="/blog"
          name="public.link_clicked"
          props={{ from: 'landing', to: 'blog', slug: null }}
        >
          {t('landing.blog.link')}
        </TrackLink>
      </section>
    </PublicShell>
  );
}
