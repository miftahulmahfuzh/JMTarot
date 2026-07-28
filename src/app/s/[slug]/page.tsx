/**
 * The public share page (V7). **THE FIRST URL IN THIS PROJECT'S HISTORY THAT A
 * PERSON WITH NO ACCOUNT CAN OPEN.**
 *
 * Three fences that have protected every line of code written so far stop existing
 * at this path simultaneously, and one thing that is not a fence but is worse:
 *
 *   1. `requireUser()` never runs, so NOTHING here may assume a `CurrentUser`.
 *   2. The onboarding gate never runs, so nothing may assume a `profiles` row.
 *   3. The limiter's key cannot be `users.id`, because there is no user.
 *   4. **A share link is a capability with no expiry.** The moment the URL leaves
 *      the app it is in a WhatsApp group, a screenshot, a crawler's cache and a
 *      phone backup. Revocation stops the PAGE and cannot stop any of the rest.
 *
 * ── FOUR RULES FOR THIS FILE, WRITTEN HERE BECAUSE THEY ARE INVISIBLE AT THE
 *    CALL SITE ────────────────────────────────────────────────────────────────
 *
 * **`currentUser()` IS NEVER CALLED HERE**, even though it would safely return
 * null. A page whose output varies by session is a page whose cache key varies by
 * session, and an owner-only affordance on the public page is a second renderer
 * for VD10 to keep in step. The sharer previewing their own link sees exactly what
 * everyone else sees, which is the feature rather than a limitation.
 *
 * **`ViewerProvider` IS NEVER MOUNTED BELOW HERE**, and nothing in this subtree
 * may call anything that reads it. **THIS IS THE FAILURE `curl` CANNOT SEE:** a
 * client component reaching for a session context renders correct HTML on the
 * server and throws during hydration, so `curl` reports 200 with the reading in
 * the body and the page is dead in a browser. `public/cards/_shareshot.html` is
 * the check.
 *
 * **NOTHING IN THIS SUBTREE MAY GENERATE ANYTHING.** No model call, no
 * translation, no summary. This route is reachable by anyone holding a slug, and a
 * public route that can spend a model call is a provider quota with no gate in
 * front of it — which since V9 is the app's primary abuse control.
 *
 * **THE BODY IS RENDERED VERBATIM IN `readings.locale` AND NEVER TRANSLATED.**
 * Chrome from the viewer, prose from the sharer — see `adapt.ts`, which carries
 * the three reasons and the mechanism.
 */
import { after } from 'next/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ReadingView } from '@/components/ReadingView';
import { TryItYourself } from '@/components/TryItYourself';
import { Eyebrow } from '@/components/Eyebrow';
import { getLocale, getT } from '@/lib/i18n/t';
import { clientIp } from '@/lib/ratelimit/clientIp';
import { consume, hit, SHARE_VIEW_GLOBAL_MAX } from '@/lib/ratelimit';
import { resolveShare, shareOrigin } from '@/lib/share/links';
import { adaptSharedReading, isForeignProse, renderedLocale, sharedNickname } from './adapt';
import { ShareViewed } from './ShareViewed';
import styles from './page.module.css';

export const runtime = 'nodejs';

/**
 * NEVER CACHED. A revoked link must stop working on the next request, and a
 * cached render is a link that keeps working for however long the cache lives.
 * The OG image is cached hard and separately, which is a different trade because
 * VD18 keeps the prose out of it.
 */
export const dynamic = 'force-dynamic';

/** One indexed row read plus one card read. No model call, ever. */
export const maxDuration = 15;

/** Views of one IP per hour: one host walking the slug space. */
const VIEW_PER_IP = 120;
const HOUR_MS = 3_600_000;

/**
 * `noindex`, and it is the most important line in Miftah's security amendment.
 *
 * **A 60-BIT SLUG IS UNGUESSABLE; IT IS NOT UNINDEXABLE.** The moment one link is
 * posted anywhere a crawler reaches — a public WhatsApp group with a web bridge, a
 * Telegram preview bot, a link pasted in a forum — the page enters a search index
 * and "I sent this to one friend" becomes "this is on Google, permanently, and
 * revoking it leaves a cache". Every argument about the slug being a capability
 * silently assumes nobody publishes it; this is what makes that assumption
 * survivable. `noarchive` because an index entry is recoverable and a cached copy
 * is not, and the `X-Robots-Tag` twin plus `Disallow: /s/` in `robots.ts` are the
 * other two halves — a `<meta>` tag alone is only read by a crawler that already
 * fetched and parsed the page.
 *
 * **`og:*` IS UNAFFECTED AND THAT IS THE POINT.** Messenger crawlers read those
 * regardless of `robots`, which is exactly why VD18 keeps the question and the
 * body out of the image: the preview is cached by every app that sees the link,
 * before anybody clicks.
 *
 * `metadataBase` is set on the DEEPEST segment, so the root layout is untouched.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const t = await getT();

  return {
    metadataBase: new URL(shareOrigin()),
    title: t('share.public.eyebrow'),
    description: t('share.public.ctaLead'),
    robots: { index: false, follow: false, noarchive: true },
    openGraph: {
      title: t('share.public.eyebrow'),
      description: t('share.public.ctaLead'),
      url: `/s/${slug}`,
      type: 'article',
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const h = await headersOf();

  /*
   * THE LIMITER RUNS BEFORE THE DATABASE, ALWAYS. This is the only unauthenticated
   * read path in the app, so the order is the defence: a request that is over
   * budget must cost one in-memory or one Redis lookup rather than a query.
   *
   * **BOTH ARE AWAITED** — `hit()` and `consume()` are async since V9, and a
   * forgotten `await` evaluates a Promise as truthy, i.e. never refuses.
   *
   * `consume()` and NOT `hitGlobal()`: `hitGlobal` spends the READING path's
   * budget, and a share link going viral must not stop the actual product from
   * working. `consume` names its own budget and is passed through unprefixed,
   * which is the pair `peek`/`consume` exists for.
   *
   * `SHARE_VIEW_GLOBAL_MAX` IS READ FROM V9's MODULE rather than declared here.
   * V7's plan sized 3000 per instance; fleet-wide that would 429 a genuinely
   * popular link, which reads to a stranger as "your friend sent me a broken
   * link". V9 raised it to 10,000 with the argument written down there.
   */
  const [perIp, perFleet] = await Promise.all([
    hit(`share:view:${clientIp(h)}`, Date.now(), VIEW_PER_IP, HOUR_MS),
    consume('share:view:_global', SHARE_VIEW_GLOBAL_MAX, HOUR_MS),
  ]);
  if (!perIp.ok || !perFleet.ok) return <ShareBusy />;

  const resolved = await resolveShare(slug);
  /*
   * FIVE DIFFERENT FAILURES, ONE PAGE — invalid slug, no row, revoked, artifact
   * deleted, artifact not shareable. `not-found.tsx` says nothing about which,
   * because a stranger able to tell a typo from a revocation from an erased
   * account has an existence oracle for other people's readings.
   */
  if (!resolved) notFound();

  /*
   * THE VIEWER'S LOCALE, not the sharer's. Middleware resolved it from the
   * `Accept-Language` header (there is no cookie on this path and no session), and
   * `resolve.test.ts` proves that rather than assuming it.
   */
  const [t, viewer] = await Promise.all([getT(), getLocale()]);

  /*
   * THE COUNTER IS THE ONE UNAUTHENTICATED WRITE IN THIS RELEASE. It runs in
   * `after()`, behind the per-IP limiter above, and the column is documented as
   * APPROXIMATE. A failure is swallowed with the error's CLASS only and never the
   * object — the bound parameter here is a uuid rather than a question, so the
   * specific risk `flush.ts` guards is absent, but a mechanical rule with
   * exceptions to remember is not a rule.
   */
  after(async () => {
    try {
      const { db } = await import('@/lib/db/client');
      const { bumpShareViewCount } = await import('@/lib/db/queries/share');
      await bumpShareViewCount(db, resolved.link.id);
    } catch (err) {
      console.warn('[share] view not counted', { name: (err as Error)?.name });
    }
  });

  if (resolved.entity === 'persona') {
    /*
     * UNREACHABLE TODAY. `publicPersonaForShare` answers null until V8 ships
     * `personas`, so `resolveShare` has already returned null and `notFound()`
     * fired above. Kept as an explicit branch rather than a cast, so that the day
     * V8 lands the compiler points at the one place a renderer is missing instead
     * of the page silently rendering a reading's markup around a persona.
     */
    notFound();
  }

  const { reading, link, translation } = resolved;
  const props = adaptSharedReading(reading, translation);
  const nickname = sharedNickname(reading, link.includeNickname);
  const reversed = isForeignProse(reading, viewer, translation);
  /*
   * THE LOCALE ON SCREEN, which is the pinned one when a translation was found and
   * the source otherwise. `reading.locale` was right for two workstreams and is now
   * wrong for exactly the case design A exists to serve — see `renderedLocale`.
   */
  const shownLocale = renderedLocale(reading, translation);

  return (
    <main className={styles.shell}>
      <ShareViewed
        shareId={link.id}
        entity={link.entity}
        hasQuestion={link.includeQuestion}
      />

      <header className={styles.head}>
        <Eyebrow>{t('share.public.eyebrow')}</Eyebrow>
        {nickname ? (
          <p className={styles.forWhom}>{t('share.public.forNickname', { nickname })}</p>
        ) : null}
      </header>

      {/*
        THE ONE LINE OF CHROME THAT MAKES "NEVER TRANSLATED" HONEST RATHER THAN
        SURPRISING. Shown only on a mismatch. Without it, a stranger in Jakarta
        opening an English person's link meets Indonesian chrome around English
        prose and no explanation.
      */}
      {reversed ? <p className={styles.otherLanguage}>{t('share.public.otherLanguage')}</p> : null}

      {/*
        `lang` IS NOT DECORATION. It is what makes a screen reader pronounce
        Indonesian prose as Indonesian inside an English document, and what points
        the browser's own translate offer at the right language -- which is the
        honest place for a translation to happen on a page that must not generate
        one itself.

        `ReadingView`'s `as-written` branch ALSO tags the paragraph, so this is one
        level of redundancy on purpose: the wrapper is what keeps the language
        declared if a future edit to that branch drops the attribute, and a nested
        identical `lang` costs nothing.
      */}
      <div lang={shownLocale} className={styles.body}>
        <ReadingView
          {...props}
          footer={<TryItYourself shareId={link.id} entity={link.entity} />}
        />
      </div>
    </main>
  );
}

/**
 * The 429, rendered as a page.
 *
 * **A 429 AND NOT A 404**, and the difference matters: lying to a person with a
 * 404 tells them their friend's link is broken, which is not true and which they
 * cannot act on. The enumeration defence is 60 bits of entropy, not obscurity
 * about whether a limit exists. This differs from `/api/events`, which always
 * answers 204 — that route's caller is a `sendBeacon` that cannot read a response,
 * so a status code there is a message to nobody.
 *
 * It renders inline from the page rather than through `notFound()`, because it is
 * genuinely a different fact.
 */
async function ShareBusy() {
  const t = await getT();
  return (
    <main className={styles.shell}>
      <div className={styles.gone}>
        <Eyebrow>{t('share.public.eyebrow')}</Eyebrow>
        <h1 className={styles.goneTitle}>{t('share.busy.title')}</h1>
        <p className={styles.goneBody}>{t('share.busy.body')}</p>
      </div>
    </main>
  );
}

/**
 * `headers()` behind one import, so the page body reads as a sequence rather than
 * as a `next/headers` tutorial. Also the only place this file touches request
 * state at all, which makes the "no session" rule easy to audit: there is no
 * `cookies()` call anywhere in the subtree.
 */
async function headersOf(): Promise<Headers> {
  const { headers } = await import('next/headers');
  return headers();
}
