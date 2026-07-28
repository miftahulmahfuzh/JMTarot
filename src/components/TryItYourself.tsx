'use client';

/**
 * The stranger's CTA. The only outbound path from the public tree.
 *
 * **AN `<a>` AND NOT `next/link`, DELIBERATELY.** A `Link` does a client-side RSC
 * navigation out of a public tree into a gated one, carrying this page's router
 * cache with it. A document load boots the app with a fresh session read, which is
 * what somebody who has just decided to sign up should get. It is also the one
 * navigation in the app where the destination's *gate decision* is the whole
 * point, and a soft navigation asks middleware a question it has already cached an
 * answer to.
 *
 * **THE TARGET IS `/` AND MIDDLEWARE DECIDES THE REST** — verified against
 * `gate.decide()` rather than assumed:
 *
 *   signed out            not public, not signed in, not /api/ -> redirect /login
 *                         with `callbackUrl=/`
 *   signed in, onboarded  next -> the reader picker
 *   signed in, mid-onboarding -> redirect /onboarding
 *
 * Three cases and no code. Do not "improve" this into a link to `/login`: that
 * sends an already-signed-in querent to a sign-in page.
 *
 * `share.cta_clicked` is buffered rather than sent — `track()` returns void, and
 * the batcher's `pagehide` handler covers a navigation that tears the page down
 * before the two-second debounce fires. Same reasoning `TrackLink`'s header
 * records; this one cannot USE `TrackLink`, because that wraps `Link`.
 */
import type { ShareEntity } from '@/lib/share/slug';
import { track } from '@/lib/analytics/track.client';
import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './TryItYourself.module.css';

export function TryItYourself({
  shareId,
  entity,
}: {
  /** `share_links.id`. NEVER the slug — see `events.ts`. */
  shareId: string;
  entity: ShareEntity;
}) {
  const t = useT();

  return (
    <div className={styles.cta}>
      <p className={styles.lead}>{t('share.public.ctaLead')}</p>
      <a
        href="/"
        className={styles.button}
        onClick={() => track('share.cta_clicked', { share_id: shareId, entity })}
      >
        {t('share.public.cta')}
      </a>
    </div>
  );
}
