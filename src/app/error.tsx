'use client';

import { useEffect } from 'react';

import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './error.module.css';

/**
 * The error boundary.
 *
 * A CLIENT COMPONENT BY NEXT'S CONTRACT, so it takes its copy from `useT()`. That
 * works because `LocaleProvider` sits in the ROOT LAYOUT, above this boundary —
 * and it was verified rather than assumed, because an error boundary that throws
 * on a missing context turns one failure into two and hides the first.
 *
 * THE DISTINCTION THAT MATTERS: this file is a boundary INSIDE the root layout. A
 * `global-error.tsx`, if one is ever added, REPLACES the root layout and therefore
 * has no provider — `useT()` would throw there, which is exactly why
 * `LocaleProvider`'s error message names that case.
 *
 * No `digest`, no stack, no error message on screen. Whatever went wrong is a
 * server detail and the querent can do nothing with it; the console gets the
 * object, the screen gets one sentence and a button.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error('unhandled render error', error);
  }, [error]);

  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>{t('error.crash.title')}</h1>
      <p className={styles.body}>{t('error.crash.body')}</p>
      <button type="button" className={styles.action} onClick={reset}>
        {t('error.crash.action')}
      </button>
    </main>
  );
}
