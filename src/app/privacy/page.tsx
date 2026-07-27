import type { Metadata } from 'next';
import Link from 'next/link';
import { TrackView } from '@/components/TrackView';
import styles from '@/components/Legal.module.css';
import { getLocale, getT } from '@/lib/i18n/t';
import { termsVersion } from '@/lib/legal';
import { PrivacyEn } from './privacy.en';
import { PrivacyId } from './privacy.id';

/**
 * `/privacy`. Public, for the same three reasons `/terms` is.
 *
 * **STATICALLY RENDERABLE, DELIBERATELY** (reconciliation R14). The account
 * erasure controls live at `/account`, which is W3's and is not built; this page
 * DESCRIBES deletion and links to it rather than offering a button. Keeping the
 * policy free of session state is what lets Google's consent-screen reviewer,
 * and anyone deciding whether to sign up, read it without an account.
 *
 * In practice it still builds as `ƒ` because it awaits `getLocale()` for the
 * document choice -- the same reason the root layout is dynamic, and the same
 * correct answer: the right language belongs in the SSR'd markup, not patched on
 * after hydration.
 */

export const metadata: Metadata = {
  title: 'Kebijakan Privasi — JMTarot',
  robots: { index: false, follow: false },
};

export default async function PrivacyPage() {
  const locale = await getLocale();
  const t = await getT();
  const version = termsVersion();
  const effective = t('legal.effective', { version });

  return (
    <main>
      <TrackView name="privacy.viewed" props={{ version, from: 'direct' }} />

      <Link className={styles.back} href="/">
        {t('legal.back')}
      </Link>

      {locale === 'en' ? <PrivacyEn effective={effective} /> : <PrivacyId effective={effective} />}
    </main>
  );
}
