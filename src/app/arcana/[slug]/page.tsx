import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

import type { Locale, YesNo } from '@/data/types';
import {
  CARD_URL_SLUGS,
  cardByUrlSlug,
  cardImage,
  cardImagePath,
  cardMeaning,
  cardUrlSlug,
  effectiveYesNo,
} from '@/data/deck';
import {
  arcanaFactsFor,
  neighboursOf,
  relatedByElement,
  relatedByStage,
} from '@/lib/arcana/correspondence';
import { loreFor } from '@/content/arcana';
import { Prose } from '@/components/Prose';
import { Eyebrow } from '@/components/Eyebrow';
import { JsonLd } from '@/components/JsonLd';
import { PublicShell } from '@/components/PublicShell';
import { PublicShare } from '@/components/PublicShare';
import { TrackView } from '@/components/TrackView';
import { TrackLink } from '@/components/TrackLink';
import { getLocale, getT } from '@/lib/i18n/t';
import { localePath } from '@/lib/i18n/prefix';
import { contentAlternates } from '@/lib/seo/alternates';
import { absoluteUrl, siteOrigin } from '@/lib/seo/origin';
import { ArcanaFacts } from './ArcanaFacts';
import { arcanaGraph } from './jsonld';
import styles from './page.module.css';

/**
 * `/arcana/<url slug>` -- one Major Arcana card, in one language, for a stranger.
 *
 * ── FOUR FENCES THAT STOP EXISTING HERE, AS THEY DO ON `/s/[slug]` ─────────────
 *
 *   1. `requireUser()` never runs, so NOTHING here may assume a `CurrentUser`.
 *   2. The onboarding gate never runs, so nothing may assume a `profiles` row.
 *   3. There is no session to key anything on.
 *   4. **THERE IS NO DATABASE ON THIS PATH AT ALL** (roadmap §10), which is what
 *      makes "a public page must not be able to 500 on a database outage" true by
 *      construction rather than by a try/catch. Three routes already carry that
 *      bug; this must not be the fourth.
 *
 * **`currentUser()` IS NEVER CALLED, AND `curl` CANNOT SEE THE FAILURE IF IT IS.**
 * `/s/[slug]`'s header records the exact shape: a client component reaching for a
 * session context renders correct HTML on the server and throws during hydration,
 * so `curl` reports 200 with the page in the body and the page is dead in a
 * browser. `page.contract.test.ts` fences the whole subtree and loop 5 is the
 * check.
 *
 * **NO COOKIE** (S-D10). Also mechanical: a `Set-Cookie` makes the response
 * uncacheable at the edge whatever `Cache-Control` says, and these are the pages
 * whose TTFB a crawler measures. Middleware's cookie guard covers the content
 * routes and the outer wrapper strips what the `auth()` wrapper appends after it.
 *
 * **NOTHING HERE GENERATES ANYTHING** (S-D7, VD7). Every byte is authored and
 * committed. A session-less public route with a model call behind it is
 * `LLM_WINDOW_CALL_CEILING` with no gate in front of it.
 *
 * ── AND ONE THING THE ROADMAP'S WORDING INVITES YOU TO GET WRONG ───────────────
 *
 * **`generateStaticParams` DOES NOT MAKE THIS PAGE STATIC.** `app/layout.tsx`
 * awaits `getLocale()` for `<html lang>` and `## Localization` rule 5 forbids
 * "fixing" that, so `headers()` is read above every page and the whole tree
 * renders per request. **The build output shows `ƒ` and that is the symptom of the
 * rule working, not a defect.** What `generateStaticParams` + `dynamicParams =
 * false` buys is a **404 at the routing layer** for any slug outside the
 * twenty-two, before this module runs. The TTFB story is entirely S1's
 * `Cache-Control`, which is exactly the trade S-D10 takes over multiple root
 * layouts.
 */

export const runtime = 'nodejs';

/**
 * The twenty-two, derived. NOT `LORE_SLUGS`: a slug with no document must 404
 * rather than fall through to a catch-all, and `notFound()` below is what answers
 * it. **The SITEMAP takes `LORE_SLUGS` instead**, so an unwritten page is never
 * advertised to a crawler.
 */
export function generateStaticParams() {
  return CARD_URL_SLUGS.map((slug) => ({ slug }));
}

/** Anything outside the twenty-two is a 404 before this module runs. */
export const dynamicParams = false;

/**
 * `YesNo` -> catalog key, SPELLED OUT, because a template literal is not a
 * `MessageKey`.
 *
 * `t()` is typed over `keyof typeof id` and `` t(`reading.verdict.${verdict}`) ``
 * widens to `string`, which does not satisfy that union -- so it is a red
 * typecheck if you are lucky and, if the signature is ever loosened, an unknown
 * key at runtime. I3 is explicit that an unknown key returns THE KEY on purpose,
 * so the failure mode is `reading.verdict.no` rendered as the verdict on a public
 * page. Three lines of lookup buys the compile-time check back.
 *
 * **REUSING `reading.verdict.*` RATHER THAN ADDING `arcana.verdict.*`**: these
 * must be the SAME WORDS the app prints after a real yes/no reading, and a second
 * key is how the lore page and the reading eventually disagree about what `maybe`
 * is called.
 */
const VERDICT_KEY = {
  yes: 'reading.verdict.yes',
  no: 'reading.verdict.no',
  maybe: 'reading.verdict.maybe',
} as const satisfies Record<YesNo, string>;

/**
 * Which locales actually have a document for this card (R2).
 *
 * **NEVER `LOCALES`.** A `hreflang` pair naming a URL that 404s is
 * non-reciprocal, and Google discards THE WHOLE SET silently -- so a card with no
 * English document must emit `id` + `x-default` only. Today every card has both,
 * which is exactly when somebody simplifies this to `LOCALES` and nothing fails.
 */
function localesFor(slug: string): Locale[] {
  return (['id', 'en'] as const).filter((l) => loreFor(slug, l) !== undefined);
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const card = cardByUrlSlug(slug);
  const doc = card ? loreFor(slug, locale) : undefined;
  if (!card || !doc) return {};

  return {
    title: doc.title,
    description: doc.description,
    /*
     * **ONE HELPER, NEVER HAND-WRITTEN** (S-D15). Forty-four pages emitting three
     * `<link rel="alternate">` tags by hand is forty-four chances at a
     * non-reciprocal pair, which Google discards SILENTLY -- the whole tag set
     * stops working and nothing reports it. The slug is identical in both locales
     * (S-D4), which is what makes this a clean `/arcana/X` <-> `/en/arcana/X`
     * mapping with no per-locale slug table.
     */
    alternates: contentAlternates({
      origin: siteOrigin(),
      path: `/arcana/${slug}`,
      locale,
      locales: localesFor(slug),
    }),
    openGraph: {
      type: 'article',
      title: doc.title,
      description: doc.description,
      locale: locale === 'en' ? 'en_US' : 'id_ID',
      images: [{ url: cardImage(card.slug), width: 800, height: 1200, alt: doc.imageAlt }],
    },
    /*
     * NO `robots` FIELD. The default is indexable and that is the point of the
     * release; S-D12's trap runs the other way -- a broadly-matching
     * `x-robots-tag` that silently `noindex`es the site. `headers.test.ts` is the
     * only thing that would notice.
     */
  };
}

export default async function ArcanaPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const card = cardByUrlSlug(slug);
  if (!card) notFound();

  const locale = await getLocale();
  const t = await getT();
  const doc = loreFor(slug, locale);
  /*
   * A card written in one locale and not the other 404s rather than falling back.
   * **NO CROSS-LOCALE FALLBACK** (I3's argument, applied to content): an
   * Indonesian document served under an English URL is a bug that ships, and
   * `hreflang` would be claiming a translation that does not exist. The
   * completeness assertion in `lore.test.ts` is what makes this branch unreachable
   * at release.
   */
  if (!doc) notFound();

  const origin = siteOrigin();
  const facts = arcanaFactsFor(card, locale, slug);
  const { previous, next } = neighboursOf(card);
  const canonical = contentAlternates({
    origin,
    path: `/arcana/${slug}`,
    locale,
    locales: localesFor(slug),
  }).canonical;

  /*
   * THE LINK GRAPH, DERIVED. Deduplicated by card id because a card can be both
   * the root and an element sibling, and a page linking twice to one card spends
   * a row saying the same thing.
   */
  const related = [
    ...(facts.root ? [{ card: facts.root, kind: 'root' as const }] : []),
    ...relatedByElement(card).map((c) => ({ card: c, kind: 'element' as const })),
    ...relatedByStage(card).map((c) => ({ card: c, kind: 'stage' as const })),
  ].filter((r, i, all) => all.findIndex((x) => x.card.id === r.card.id) === i);

  const RELATED_KEY = {
    root: 'arcana.related.root',
    element: 'arcana.related.element',
    stage: 'arcana.related.stage',
  } as const;

  return (
    <PublicShell surface="arcana" path={`/arcana/${slug}`}>
      <TrackView
        name="public.page_viewed"
        props={{ page: 'arcana', locale, slug, referrer_kind: 'direct' }}
      />

      <JsonLd
        node={arcanaGraph({
          card,
          doc,
          canonical,
          origin,
          locale,
          imageUrl: absoluteUrl(cardImagePath(card.slug)),
          homeLabel: t('public.crumb.home'),
          homeUrl: `${origin}${localePath(locale, '/')}`,
          galleryLabel: t('public.crumb.gallery'),
          galleryUrl: `${origin}${localePath(locale, '/gallery')}`,
        })}
      />

      <article className={styles.doc}>
        <Eyebrow>{t('common.majorArcana')}</Eyebrow>

        {/* THE SINGLE `<h1>`. Nothing else on this page may emit one. */}
        <h1 className={styles.h1}>{doc.h1}</h1>
        <p className={styles.standfirst}>{doc.standfirst}</p>

        {/*
          A plain `<img>`, never `next/image`. `cardImage()` appends `?v=` and
          `next/image` refuses a local `src` with a query string when no
          `images.localPatterns` is configured -- the constraint `AccountCard`
          records, satisfied rather than dodged. `width`/`height` are set so there
          is no layout shift, and the art is already an optimised WebP at exactly
          this size, so the optimiser has nothing to improve and would only add a
          serverless invocation per card.

          `fetchPriority="high"` because it is the largest contentful paint on the
          page and there is nothing above it.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element -- see above. */}
        <img
          className={styles.art}
          src={cardImage(card.slug)}
          alt={doc.imageAlt}
          width={800}
          height={1200}
          fetchPriority="high"
          decoding="async"
        />

        <ArcanaFacts facts={facts} />

        {/*
          **THE TWO GLOSSES SIT DIRECTLY ABOVE THE AUTHORED SECTIONS, AND THAT
          ADJACENCY IS THE ENFORCEMENT.** Roadmap §7: a lore page that contradicts
          `cardMeaning()` contradicts the reading the app just gave. There is no
          test for semantic agreement between one line and four paragraphs, so the
          page is built so that a contradiction is a reading defect a reviewer
          MEETS rather than a hidden one. `page.contract.test.ts` asserts both
          orientations are rendered, so nobody tidies this away as duplication.
        */}
        <section className={styles.section}>
          <h2 className={styles.h2}>{t('arcana.upright')}</h2>
          <p className={styles.gloss}>{cardMeaning({ card, reversed: false }, locale)}</p>
          <Prose blocks={doc.upright} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>{t('arcana.reversed')}</h2>
          <p className={styles.gloss}>{cardMeaning({ card, reversed: true }, locale)}</p>
          <Prose blocks={doc.reversed} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>{t('arcana.verdict')}</h2>
          {/*
            The verdict words come from `effectiveYesNo` at RENDER time and from
            the catalog, never from the document -- `doc.yesno` exists to be
            ASSERTED against the engine in the lint, not to be displayed. So the
            words on screen are the same words the app prints after a yes/no
            reading, by construction.
          */}
          <dl className={styles.verdict}>
            <dt>{t('arcana.upright')}</dt>
            <dd>{t(VERDICT_KEY[effectiveYesNo({ card, reversed: false })])}</dd>
            <dt>{t('arcana.reversed')}</dt>
            <dd>{t(VERDICT_KEY[effectiveYesNo({ card, reversed: true })])}</dd>
          </dl>
          <p className={styles.p}>{doc.yesno.note}</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>{t('arcana.lore')}</h2>
          <Prose blocks={doc.lore} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>{t('arcana.inSpread')}</h2>
          <Prose blocks={doc.inSpread} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>{t('arcana.questions')}</h2>
          {/*
            Q&A CONTENT WITH NO `FAQPage` MARKUP (S-D16). Google restricted FAQ
            rich results to authoritative government and health sites in August
            2023, so the schema buys approximately nothing -- but the content
            still earns its place, for the reader and for long-tail matching.
            `<h3>` per question so the heading order stays semantic.
          */}
          {doc.questions.map((qa, i) => (
            <div key={i} className={styles.qa}>
              <h3 className={styles.h3}>{qa.q}</h3>
              <p className={styles.p}>{qa.a}</p>
            </div>
          ))}
        </section>

        {/*
          S-D8's control, and it is S1's `PublicShare` rather than one of S4's own
          (register §5). **The canonical arrives as a PROP** -- `siteOrigin()`
          reads three variables with no `NEXT_PUBLIC_` prefix, so in a browser
          bundle the chain collapses to `http://localhost:3001` and the querent
          shares a link to their own laptop. It is also the same string
          `generateMetadata` put in `<link rel="canonical">`, which
          `window.location.href` would not be: that carries whatever query string a
          campaign appended.
        */}
        <PublicShare url={canonical} title={doc.h1} surface="arcana" slug={slug} />

        {/*
          THE LINK GRAPH. Twenty-two pages each linking to several others is the
          structure that competes with a fifteen-year-old site; a page with one
          outbound link is a leaf. Derived rather than authored, so no link can
          rot, and DETERMINISTIC, so the set does not change between builds and
          churn a crawl. Between eight and twelve internal links per page.
        */}
        <nav className={styles.links} aria-label={t('arcana.related')}>
          <h2 className={styles.h2}>{t('arcana.neighbours')}</h2>
          <ul className={styles.linkList}>
            {[previous, next].map((c) => (
              <li key={c.id}>
                <Link
                  href={localePath(locale, `/arcana/${cardUrlSlug(c)}`)}
                  prefetch={false}
                >
                  {c.numeral} · {c.name}
                </Link>
              </li>
            ))}
          </ul>

          <h2 className={styles.h2}>{t('arcana.related')}</h2>
          <ul className={styles.linkList}>
            {related.map(({ card: c, kind }) => (
              <li key={c.id}>
                <Link
                  href={localePath(locale, `/arcana/${cardUrlSlug(c)}`)}
                  prefetch={false}
                >
                  {c.numeral} · {c.name}
                </Link>
                <span className={styles.linkWhy}>{t(RELATED_KEY[kind])}</span>
              </li>
            ))}
          </ul>

          <TrackLink
            className={styles.gallery}
            href={localePath(locale, '/gallery')}
            name="public.link_clicked"
            props={{ from: 'arcana', to: 'gallery', slug }}
          >
            {t('arcana.gallery')}
          </TrackLink>
        </nav>

        {/*
          §8.3. `common.disclaimer.long` and not `.short`: the constraint is that
          an entertainment-only disclaimer appears under every reading and on both
          pickers, and the legal exposure is HIGHER on a page a stranger reaches
          first with no account. (`PublicShell`'s footer carries `.short` for every
          public page; this is the page's own, adjacent to the prose.)
        */}
        <aside className={styles.disclaimer}>{t('common.disclaimer.long')}</aside>
      </article>
    </PublicShell>
  );
}
