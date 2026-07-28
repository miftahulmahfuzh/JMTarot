import type { Metadata } from 'next';
import Link from 'next/link';
import { TrackView } from '@/components/TrackView';
import styles from '@/components/Legal.module.css';
import { getLocale, getT } from '@/lib/i18n/t';
import { termsVersion } from '@/lib/legal';
import { TermsEn } from './terms.en';
import { TermsId } from './terms.id';

/**
 * `/terms`. **PUBLIC, AND THAT IS LOAD-BEARING.**
 *
 * `isPublic()` in `src/lib/auth/gate.ts` already exempts this path -- W2 owns
 * that file and W7 does not edit it. Three separate things depend on the
 * exemption: the login page links here before anyone has signed in, a moderation
 * refusal links to `#6-2`, and Google's OAuth consent-screen review requires
 * reachable terms. **A T&C you must log in to read is not a T&C.**
 *
 * Rendered per locale by picking a whole document, not by looking up 4,000 words
 * of catalog keys (I15). A 2,000-word clause as one catalog value is
 * unreviewable in a diff; only the chrome around it is keyed.
 *
 * Dynamic rather than static, and for the same reason the root layout is: it
 * awaits `getLocale()`, so the correct language is in the SSR'd markup rather
 * than patched on after hydration. The build output showing `ƒ` here is this
 * working.
 */

/**
 * **TWO THINGS CHANGED HERE IN v0.4.0, AND THEY ARE ONE CHANGE (reconciliation
 * R4). BOTH REVERSE WHAT THIS FILE USED TO DO.**
 *
 * 1. **The `robots: { index: false, follow: false }` field is GONE.** Its
 *    recorded reason was *"an indexed legal page for an app behind auth is
 *    noise."* **The app stops being behind auth in this release** — `/` renders a
 *    landing page signed out (S-D5) — so the premise expired with it. A public
 *    site normally wants its terms indexed: Google's trust signals look for
 *    them, and `jsonld.ts` points a licence at `/terms#9`, which a de-indexed
 *    page cannot serve as a licence target. `src/app/sitemap.ts` lists this path
 *    in the same commit; doing one half leaves a sitemap naming a noindex page,
 *    which Search Console reports against the whole file.
 *
 * 2. **`static metadata` became `generateMetadata`, because the title was
 *    hardcoded Indonesian while the body renders per locale.** An English reader
 *    got an English document under a browser tab reading
 *    `Syarat & Ketentuan — JMTarot`, and `og:title` shares it, so every chat
 *    preview said it too. **This is the same bug class fixed on `/s/` on
 *    2026-07-28**: `<title>` was the last string resolved from the wrong input.
 *    It needed no new key — `common.terms` is the words on the link that brought
 *    the reader here, which is the right thing for the tab to agree with.
 *
 * The page STAYS `ƒ`, as it already was: it awaited `getLocale()` for the
 * document choice before this edit and `generateMetadata` awaits `getT()` for the
 * same reason. Nothing about the dynamic/static story changed.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${t('common.terms')} — ${t('app.title')}` };
}

export default async function TermsPage() {
  const locale = await getLocale();
  const t = await getT();
  const version = termsVersion();
  const effective = t('legal.effective', { version });

  return (
    <main>
      {/*
        `from` is where the reader came from, which is the only interesting thing
        about a terms view: arriving from `/login` is a stranger deciding whether
        to sign up, and arriving from a refusal is somebody checking whether they
        were treated fairly. Those are different problems.
      */}
      <TrackView name="terms.viewed" props={{ version, from: 'direct' }} />

      <Link className={styles.back} href="/">
        {t('legal.back')}
      </Link>

      {locale === 'en' ? <TermsEn effective={effective} /> : <TermsId effective={effective} />}
    </main>
  );
}
