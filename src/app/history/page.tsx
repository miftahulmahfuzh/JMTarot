/**
 * The history list.
 *
 * **THIS SERVER COMPONENT READS NOTHING**, and that is roadmap §6's
 * non-negotiable plus one more argument that is stronger on its own: the default
 * filter is TODAY IN THE QUERENT'S ZONE, and the server cannot compute it.
 * `todayKey()`'s comment has the full version; the short one is that
 * `toISOString()` rolls over at 07:00 in Jakarta, so a server-rendered default
 * would show the wrong day to a third of every Jakarta evening — the exact bug
 * `local_date` exists to prevent, reintroduced in the most visible place there
 * is, a page's initial state.
 *
 * `/history/[id]` makes the OPPOSITE call and it is not an inconsistency: there,
 * the row IS the page. Here there is a title, a hint and a filter to paint first.
 *
 * THE ROUTE IS GATED BY `src/middleware.ts` — `isPublic()` does not name it, so
 * a signed-out visitor is redirected to `/login` and an un-onboarded one to
 * `/onboarding` before this function runs. Nothing here re-checks, and
 * `isPublic()` must never learn this path: this page is somebody's entire
 * reading history.
 *
 * `/history` IS A STATIC SEGMENT AND `src/app/[reader]` IS DYNAMIC. Next matches
 * static segments first at every level, so this and `/history/<uuid>` resolve
 * here and never fall through to `readerById('history')`.
 */
import { AccountButton } from '@/components/AccountButton';
import { localeSwitcherEnabled } from '@/lib/i18n/resolve';
import { getT } from '@/lib/i18n/t';
import { HistoryBrowser } from './HistoryBrowser';
import styles from './page.module.css';

export default async function HistoryPage() {
  const t = await getT();

  return (
    <main className={styles.shell}>
      {/*
        HISTORY IS NOT THE DRAW SCREEN, which is the one page `accountSurface
        .test.ts` forbids this on. Nothing streams here that a locale flip could
        tear in half, and switching language while looking at your own past is
        exactly when somebody wants to.

        `showLanguage` is resolved HERE because `LOCALE_SWITCHER` has no
        `NEXT_PUBLIC_` prefix and would inline as `undefined` inside a client
        component.
      */}
      <AccountButton surface="history" showLanguage={localeSwitcherEnabled()} />

      <h1 className={styles.title}>{t('history.title')}</h1>
      <p className={styles.hint}>{t('history.hint')}</p>
      <HistoryBrowser />
    </main>
  );
}
