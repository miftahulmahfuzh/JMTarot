/**
 * ONE PAGE FOR FIVE DIFFERENT FAILURES, and saying nothing about which is the
 * whole design rather than laziness.
 *
 * `resolveShare` collapses: an invalid slug, no row, a revoked row, a deleted
 * artifact, and an artifact that is not shareable. If this page distinguished any
 * of them, a stranger holding one slug could learn whether the account behind it
 * still exists — which turns a link somebody revoked into an existence oracle for
 * its author. `/history/[id]` already makes the same choice for a uuid guess; this
 * is that reasoning one threat model further out, because the guesser here has no
 * account at all.
 *
 * **SO DO NOT ADD A REASON, NOT EVEN A HELPFUL ONE.** "This link was turned off"
 * is friendlier and is a disclosure. `share.gone.body` names both innocent
 * possibilities — revoked, or mistyped — without committing to either, which is
 * the most a stranger can honestly be told.
 *
 * It also fires no analytics. A 404 here is either a typo or somebody probing the
 * slug space, and neither has a `share_links.id` to attach an event to.
 */
import { Eyebrow } from '@/components/Eyebrow';
import { getT } from '@/lib/i18n/t';
import styles from './page.module.css';

export default async function ShareNotFound() {
  const t = await getT();

  return (
    <main className={styles.shell}>
      <div className={styles.gone}>
        <Eyebrow>{t('share.public.eyebrow')}</Eyebrow>
        <h1 className={styles.goneTitle}>{t('share.gone.title')}</h1>
        <p className={styles.goneBody}>{t('share.gone.body')}</p>
        {/*
          AN `<a>` AND NOT `next/link`, for `TryItYourself`'s reason: this is a
          document load out of a public tree into a gated one, and `/` is the
          target because middleware decides the three cases with no code here.
        */}
        <a href="/" className={styles.goneAction}>
          {t('share.gone.action')}
        </a>
      </div>
    </main>
  );
}
