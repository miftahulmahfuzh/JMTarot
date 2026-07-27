import Link from 'next/link';

import { getT } from '@/lib/i18n/t';
import styles from './error.module.css';

/**
 * 404.
 *
 * THIS FILE DID NOT EXIST AND SHOULD HAVE. `notFound()` is called from
 * `[reader]/page.tsx` and `[reader]/[service]/page.tsx` — an unknown reader id or
 * service id is one hand-typed URL away — and with no `not-found.tsx` Next renders
 * its own unstyled English boilerplate. That was already wrong in a
 * single-language Indonesian app; W6's inventory is what surfaced it, and it is a
 * real gap rather than a locale one.
 *
 * A SERVER COMPONENT, so it takes `getT()`. Next allows that for `not-found.tsx`
 * and it is the cheaper of the two options — no hook, no provider dependency.
 * `error.tsx` next door cannot do the same; the framework requires it to be a
 * client component.
 */
export default async function NotFound() {
  const t = await getT();

  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>{t('error.notFound.title')}</h1>
      <p className={styles.body}>{t('error.notFound.body')}</p>
      <Link href="/" className={styles.action}>
        {t('error.notFound.action')}
      </Link>
    </main>
  );
}
