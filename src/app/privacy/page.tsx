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

/**
 * **INDEXABLE SINCE v0.4.0, AND THE TITLE NOW FOLLOWS THE DOCUMENT** —
 * reconciliation R4, and `src/app/terms/page.tsx` carries the full argument for
 * both halves. In short: the `noindex` field's premise was "an app behind auth",
 * which S-D5 ends; and a hardcoded `Kebijakan Privasi — JMTarot` sat above an
 * English document for every English reader, which is the `<title>`-resolved-
 * from-the-wrong-input bug `/s/` was fixed for on 2026-07-28.
 *
 * `src/app/sitemap.ts` lists this path in the same commit. Do not do one half.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${t('common.privacy')} — ${t('app.title')}` };
}

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
