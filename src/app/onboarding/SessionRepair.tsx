'use client';

/**
 * Rendered when `profiles.completed_at` is set but the session says otherwise.
 *
 * A SCREEN NOBODY SHOULD EVER SEE, and it still needs to exist, because the
 * alternative is `ERR_TOO_MANY_REDIRECTS`. See `actions.ts` for the mechanism.
 *
 * It is deliberately not a spinner with a promise: it says nothing about a
 * lotus, nothing about progress, and nothing about what went wrong. One line,
 * and then it is gone.
 */
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n/LocaleProvider';
import { repairSessionFlag } from './actions';
import styles from './onboarding.module.css';

export function SessionRepair() {
  const t = useT();
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  /*
   * StrictMode DOUBLE-INVOKES effects in development, and this one has a side
   * effect that costs a database read and a cookie rotation. The ref makes it
   * fire once per mount.
   *
   * This is the same discipline the fan needed for the opposite reason: there,
   * a double-invoked setState updater called `onToggle` twice and cancelled
   * itself out, which made the fan completely dead in development and would
   * have worked in production.
   */
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    void (async () => {
      let ok = false;
      try {
        ok = (await repairSessionFlag()).ok;
      } catch (err) {
        // A failed action must not leave a blank screen. Fall through to the
        // retry, which is the only useful thing left.
        console.error('session repair failed', err);
      }

      /*
       * ONLY NAVIGATE ON SUCCESS. Going to `/` with `onb` still false is the
       * exact loop this component exists to prevent -- middleware would send it
       * straight back here and we would try again, forever, with a database read
       * each time.
       */
      if (ok) router.replace('/');
      else setFailed(true);
    })();
  }, [router]);

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <p className={styles.note} role="status" aria-live="polite">
          {failed ? t('onboarding.session.repairFailed') : t('onboarding.session.repairing')}
        </p>
        {failed ? (
          <a className={styles.cta} href="/onboarding">
            {t('common.retry')}
          </a>
        ) : null}
      </div>
    </main>
  );
}
