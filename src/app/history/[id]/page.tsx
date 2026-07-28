/**
 * One past reading, reconstructed (VD14).
 *
 * ONE AWAITED READ, DELIBERATELY, against `/history`'s zero. The reading IS the
 * page — nothing else renders first and nothing streams in — and the query is
 * `where id = $1 and user_id = $2` on the primary key. This is the exemption
 * reconciliation §6 granted twice, on the ground `/onboarding` already stands
 * on: v0.2.0 §6 bars a read that is IN THE WAY OF a byte the user is waiting
 * for, and this is the byte. Mounting empty and fetching would trade a
 * sub-millisecond read for a round trip, a loading state and a layout shift, to
 * satisfy a rule whose purpose is preventing exactly those.
 *
 * A READING THAT IS NOT YOURS AND A READING THAT DOES NOT EXIST BOTH 404, and
 * they are indistinguishable on purpose — the same rule V7 needs for share
 * slugs, because a distinguishable "exists but is not yours" turns a uuid guess
 * into an existence oracle. `readingWithCards` makes ownership a `where`
 * predicate so the only failure mode is a null.
 *
 * `blocked` READINGS 404 TOO. The query filters them out (H5): there are no card
 * rows to reconstruct, so the detail would be an empty slot row over a refusal.
 *
 * NO ACCOUNT BUTTON HERE, unlike `/history`. The back link is the affordance
 * this screen needs, and the reading below it may be mid-translation — a locale
 * flip during that stream is the one thing `LocaleSwitch`'s header warns about,
 * in the one place on this feature where something streams.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { currentUser } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { readingWithCards } from '@/lib/db/queries/history';
import { getTranslation } from '@/lib/db/queries/translations';
import { getLocale, getT } from '@/lib/i18n/t';
import { logHistoryFailure } from '@/app/api/history/log';
import { HistoryDetail } from './HistoryDetail';
import styles from './page.module.css';

export const runtime = 'nodejs';

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  /*
   * Middleware already gated this path, so `currentUser()` cannot be null in
   * practice. Checked anyway, and with `notFound()` rather than a redirect: a
   * server component cannot set cookies, and a redirect from here into a stale
   * middleware decision is the loop W3 paid for.
   */
  const user = await currentUser();
  if (!user) notFound();

  /*
   * `await getLocale()`, NOT `user.locale`. They agree for a real user because
   * the `loc` claim is first in the chain -- and they diverge under `?lang=`,
   * which is exactly when a screenshot harness is watching. `/api/reading`, both
   * `/api/memory/*` routes and `/api/translate` each learned this separately.
   */
  const [locale, t] = await Promise.all([getLocale(), getT()]);

  const reading = await readingWithCards(db, user.id, id);
  if (!reading) notFound();

  /*
   * THE CACHED TRANSLATION IS READ HERE, ON THE SERVER, NOT FETCHED BY THE
   * CLIENT — so the second time an English viewer opens an Indonesian reading
   * there is no spinner and no flash. It is one lookup on the
   * `(entity, entity_id, field, locale)` unique index, in a request that was
   * already reading the reading. A miss is null and the client streams one; that
   * path costs a model call, which is what makes the hit worth a query.
   *
   * WRAPPED, BECAUSE A CACHE READ THAT FAILS IS A CACHE MISS AND NEVER AN ERROR.
   * The reading above is the page and is allowed to take the page down with it;
   * this is an optimisation and must not.
   */
  let cached: string | null = null;
  if (reading.locale !== locale && reading.body !== null) {
    try {
      const row = await getTranslation(db, {
        entity: 'reading',
        entityId: reading.id,
        field: 'body',
        locale,
      });
      cached = row?.body ?? null;
    } catch (err) {
      logHistoryFailure('detail', err);
    }
  }

  return (
    <main className={styles.shell}>
      <Link href="/history" className={styles.back}>
        {t('history.detail.back')}
      </Link>
      <HistoryDetail reading={reading} cachedTranslation={cached} />
    </main>
  );
}
