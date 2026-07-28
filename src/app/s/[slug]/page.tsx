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
 * **THE BODY IS RENDERED IN THE LANGUAGE THE SHARER WAS READING, AND NOTHING HERE
 * EVER GENERATES IT.** This header used to say "verbatim in `readings.locale` and
 * NEVER translated"; design A (2026-07-28) replaced that with a pinned
 * `share_links.locale` and a READ of the `translations` row the sharer's own
 * viewing had already produced. `adapt.ts` carries the mechanism, and the reason
 * that survived unchanged is the one above: reading is free, generating is a quota
 * with no gate on it.
 *
 * **THE CHROME IS THE VIEWER'S AND THE `lang` ATTRIBUTE IS THE PROSE'S**, which is
 * `renderedLocale(reading, translation)` and never `reading.locale`. A NULL pin,
 * i.e. every link minted before design A, still renders as-written.
 *
 * **THERE IS NO OTHER-LANGUAGE NOTICE ANY MORE** (Miftah's ruling, 2026-07-28).
 * CLAUDE.md said in capitals that it "MUST NOT BE DELETED", and this is the
 * amendment rather than an oversight. The argument for it was that a stranger
 * meeting foreign prose under their own chrome deserves an explanation; the
 * argument against it is what design A changed underneath it — **the page no
 * longer shows "whatever language the reading was generated in", it shows the
 * language the sharer was reading**, so the sentence "this reading was written in
 * another language and is shown as it was written" describes a mechanism that is
 * no longer the one running. It fired on the residue: a NULL pin, or an
 * English-pinned link opened by an Indonesian reader. Both are honest situations
 * and neither is what that sentence claimed.
 *
 * **WHAT CARRIES THE HONESTY NOW IS `lang={shownLocale}` ALONE**, and it is not
 * decoration — it is what makes a screen reader pronounce the prose correctly and
 * what points the browser's own translate offer at the right language. Deleting
 * THAT is the thing that would leave a stranger with no way through. Design C —
 * generating both locales at mint — remains the only way to make the mismatch
 * itself impossible, and it still costs one model call per share.
 */
import { cache } from 'react';
import { after } from 'next/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ReadingView } from '@/components/ReadingView';
import { TryItYourself } from '@/components/TryItYourself';
import { Eyebrow } from '@/components/Eyebrow';
import { catalogFor, tFor } from '@/lib/i18n/catalog';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
import { getLocale, getT } from '@/lib/i18n/t';
import { clientIp } from '@/lib/ratelimit/clientIp';
import { consume, hit, SHARE_VIEW_GLOBAL_MAX } from '@/lib/ratelimit';
import { resolveShare, shareOrigin } from '@/lib/share/links';
import { adaptSharedReading, renderedLocale, sharedNickname } from './adapt';
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
/**
 * The gate and the resolve, ONCE PER REQUEST, shared by `generateMetadata` and the
 * page component.
 *
 * ── WHY THIS IS ONE `cache()`d FUNCTION AND NOT TWO CALLS ────────────────────
 *
 * The `<title>` has to follow the reading's language (see `generateMetadata`), and
 * the only thing that knows that language is the pinned `share_links` row. So
 * metadata needs the resolve too — and Next runs `generateMetadata` and the page in
 * the same request but as separate functions, so the naive version does the work
 * twice.
 *
 * **THE LIMITER IS INSIDE, AND THAT IS THE WHOLE REASON THIS IS SHAPED LIKE THIS.**
 * `page.contract.test.ts` asserts both budgets are checked BEFORE the database,
 * because this is the app's only unauthenticated read path and the ordering IS the
 * defence: a request over budget must cost one Redis lookup rather than a query. A
 * resolve placed in `generateMetadata` alongside the existing one would have put a
 * database read in FRONT of that guard — one query per request for an enumeration
 * attempt, forever, defeating the thing the limiter exists to do. Wrapping the gate
 * and the resolve together keeps the counts exactly what they were:
 *
 *   allowed request  ->  1 limiter spend, 1 resolve   (unchanged)
 *   refused request  ->  1 limiter spend, 0 resolves  (unchanged)
 *
 * **`cache()` IS REQUEST-SCOPED AND KEYED ON THE ARGUMENTS**, so `ip` is passed in
 * rather than read inside: two calls must agree on the key or the dedupe silently
 * does not happen and both the budget and the query run twice. Verified by counting,
 * not assumed — see `docs/workstream-notes.md`.
 */
const gateAndResolve = cache(async (slug: string, ip: string) => {
  /*
   * THE LIMITER RUNS BEFORE THE DATABASE, ALWAYS.
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
    hit(`share:view:${ip}`, Date.now(), VIEW_PER_IP, HOUR_MS),
    consume('share:view:_global', SHARE_VIEW_GLOBAL_MAX, HOUR_MS),
  ]);
  if (!perIp.ok || !perFleet.ok) return { busy: true as const, resolved: null };

  return { busy: false as const, resolved: await resolveShare(slug) };
});

/**
 * **THE `<title>` FOLLOWS THE READING'S LANGUAGE, NOT THE VIEWER'S** (Miftah, on
 * Vercel, 2026-07-28 — the third report in this thread).
 *
 * The page went monolingual and the browser tab did not: a Bahasa-pinned link
 * opened with the app set to English kept every word of the page in Indonesian and
 * put "A shared reading" in the tab. The document title is the one string on a
 * monolingual page that was still coming from `accept-language`, and `og:title`
 * shares the value, so chat previews had it too.
 *
 * **THIS FILE PREVIOUSLY ARGUED THE OPPOSITE, AND THE ARGUMENT WAS WRONG ABOUT ITS
 * OWN COST.** It said making the card follow the pin "doubles the database reads on
 * the one uncapped public route". It does not, because `gateAndResolve` is
 * `cache()`d and the page was going to resolve anyway — the real objection was that
 * a resolve here would sit in front of the rate limiter, and that is fixed by
 * putting the limiter inside the cached function rather than by giving up.
 *
 * **THE OG IMAGE IS UNAFFECTED AND NEEDS NO CHANGE**: it draws only `MAJOR ARCANA`,
 * which is English in both locales, and VD18 keeps the question and the prose out of
 * it deliberately.
 *
 * A slug that does not resolve, is over budget, or is a persona keeps the viewer's
 * locale — there is no reading whose language to follow, exactly as the 429 page has
 * none.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const h = await headersOf();
  const gate = await gateAndResolve(slug, clientIp(h));

  const t =
    gate.resolved?.entity === 'reading'
      ? tFor(renderedLocale(gate.resolved.reading, gate.resolved.translation))
      : await getT();

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
   * THE GATE AND THE RESOLVE, from the request-scoped `cache()` above.
   * `generateMetadata` already called this with the same arguments, so the budgets
   * were spent once and the query ran once — see that function's header for why the
   * limiter lives inside it rather than here.
   */
  const gate = await gateAndResolve(slug, clientIp(h));
  if (gate.busy) return <ShareBusy />;

  const resolved = gate.resolved;
  /*
   * FIVE DIFFERENT FAILURES, ONE PAGE — invalid slug, no row, revoked, artifact
   * deleted, artifact not shareable. `not-found.tsx` says nothing about which,
   * because a stranger able to tell a typo from a revocation from an erased
   * account has an existence oracle for other people's readings.
   */
  if (!resolved) notFound();

  /*
   * THE CHROME IS THE VIEWER'S. Middleware resolved that locale from the
   * `Accept-Language` header (there is no cookie on this path and no session), and
   * `resolve.test.ts` proves that rather than assuming it.
   *
   * **THE VIEWER'S LOCALE IS READ AGAIN, AND FOR EXACTLY ONE THING THAT IS NOT
   * RENDERING.** This comment used to say it was not read at all — true between the
   * notice's deletion and the monolingual ruling, and false now.
   *
   * The property the header's cache-key argument wants is **that the rendered output
   * does not vary by who is looking**, and that is now MORE true than when this
   * comment was written: the chrome used to follow `accept-language` and no longer
   * does, so two viewers of one slug get byte-identical markup. What `viewerLocale`
   * decides is only whether a second, output-EQUIVALENT `LocaleProvider` is worth its
   * bytes — measured at +3.3KB gzipped, a 30% increase on the transferred page, which
   * is why the guard exists on the one route strangers open on mobile data.
   *
   * So: never read the viewer's locale to choose what LANGUAGE to render. Reading it
   * to choose what to SEND, when both choices render the same, is the exception and
   * the only one.
   */
  const t = await getT();

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
  /*
   * THE LOCALE ON SCREEN, which is the pinned one when a translation was found and
   * the source otherwise. `reading.locale` was right for two workstreams and is now
   * wrong for exactly the case design A exists to serve — see `renderedLocale`.
   */
  const shownLocale = renderedLocale(reading, translation);

  /*
   * ── THE WHOLE PAGE IS IN ONE LANGUAGE, AND IT IS THE READING'S ──────────────
   *
   * **Miftah's ruling, 2026-07-28, and it reverses what `share-check.py` asserted
   * both ways for two workstreams ("chrome follows the viewer").** The report: an
   * English-pinned link opened with the app set to Indonesian rendered English prose
   * under `Bacaan yang dibagikan`, `Bacaan untuk Mif` and `Kartu Harian` — a page in
   * two languages, which reads as half-translated rather than as considerate.
   *
   * The alternative was offered and refused: keep the disclaimer and the CTA on the
   * viewer so a stranger who cannot read the prose can still read the warning and
   * still find the way into the app. **The cost of the ruling is stated so nobody
   * rediscovers it as a bug:** an Indonesian visitor opening an English link now has
   * nothing on the page they can read, `common.disclaimer.long` and
   * `share.public.cta` included. That is the accepted trade, not an oversight.
   *
   * ── HOW, WITHOUT BREAKING I9 ────────────────────────────────────────────────
   *
   * `LocaleProvider`'s header says **"NO LOCALE PROP IS DRILLED ANYWHERE"** and I9
   * says the client ships exactly ONE catalog — the resolved one, as JSON from the
   * server, never a client-side `catalogFor()` import. A `locale` prop on
   * `ReadingView` would have broken both, and `ReadingView` is the one renderer
   * three surfaces mount (VD10), so it would have leaked this page's problem into
   * `/history` and the draw screen.
   *
   * A NESTED PROVIDER breaks neither. The catalog crosses as JSON exactly as the
   * root layout's does, `useT()` inside reads the nearest one, and **`ReadingView`,
   * `TryItYourself` and `Eyebrow` are untouched** — `t.locale` inside `ReadingView`
   * becomes `shownLocale`, so the service name, the date, the slot labels, the
   * disclaimer and `resolveProse`'s viewer comparison all follow in one move.
   *
   * **MOUNTED ONLY ON A MISMATCH.** When the pin equals the viewer's locale — the
   * common case, because the sharer is normally reading in the language they shared
   * — the root layout's provider is already correct and a second identical catalog
   * would be pure duplicated JSON on the one public, uncapped route.
   */
  const viewerLocale = await getLocale();
  const shownT = shownLocale === viewerLocale ? t : tFor(shownLocale);

  /*
   * `lang` ON `<main>`, WIDENED FROM THE PROSE WRAPPER. It used to sit on the body
   * div because the prose was the only thing in the reading's language; now the whole
   * page is, so the attribute belongs where the page is.
   *
   * **`<html lang>` STILL FOLLOWS THE VIEWER AND CANNOT BE CHANGED FROM HERE** — the
   * root layout emits `<html>` and no page can override it in the App Router. The
   * innermost `lang` is what assistive tech and the browser's translate offer use, so
   * this is correct rather than merely adequate; it is simply not as tidy as it
   * sounds, and the residual is one attribute on an element with no text of its own.
   *
   * `ReadingView`'s `as-written` branch ALSO tags its paragraph, so there is one
   * level of redundancy on purpose: this wrapper keeps the language declared if a
   * future edit to that branch drops the attribute, and a nested identical `lang`
   * costs nothing.
   */
  const page = (
    <main className={styles.shell} lang={shownLocale}>
      <ShareViewed
        shareId={link.id}
        entity={link.entity}
        hasQuestion={link.includeQuestion}
      />

      <header className={styles.head}>
        <Eyebrow>{shownT('share.public.eyebrow')}</Eyebrow>
        {nickname ? (
          <p className={styles.forWhom}>
            {shownT('share.public.forNickname', { nickname })}
          </p>
        ) : null}
      </header>

      <div className={styles.body}>
        <ReadingView
          {...props}
          footer={<TryItYourself shareId={link.id} entity={link.entity} />}
        />
      </div>
    </main>
  );

  if (shownLocale === viewerLocale) return page;

  return (
    <LocaleProvider locale={shownLocale} messages={catalogFor(shownLocale)}>
      {page}
    </LocaleProvider>
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
