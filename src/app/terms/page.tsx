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

export const metadata: Metadata = {
  title: 'Syarat & Ketentuan — JMTarot',
  /*
   * `noindex` deliberately. The consent-screen reviewer reaches this by URL and
   * a signed-out stranger reaches it from the login page; neither needs it in a
   * search index, and an indexed legal page for an app behind auth is noise.
   */
  robots: { index: false, follow: false },
};

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
