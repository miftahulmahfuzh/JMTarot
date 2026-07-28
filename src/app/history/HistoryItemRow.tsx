'use client';

/**
 * One row. Cards first, because the cards are what the querent remembers.
 *
 * THE QUESTION IS SHOWN, CLAMPED TO ONE LINE. It is the querent's own text on
 * the querent's own screen behind the querent's own login, and it identifies a
 * reading far better than three card names do. Clamped because it can be 200
 * characters and this is a list. The counter-argument is real — a history list
 * gets scrolled in public — and it is recorded as V6's open question 1 rather
 * than silently resolved by a settings toggle nobody asked for.
 *
 * NO PROSE. The list payload does not carry `body` at all (H10) — not to save
 * bytes, though it does, but because shipping Indonesian prose into an English
 * client is what VD8 forbids whether or not anything renders it.
 */
import Link from 'next/link';

import { CardFace } from '@/components/CardFace';
import { cardById } from '@/data/deck';
import { readerById } from '@/data/readers';
import { serviceById } from '@/data/services';
import { track } from '@/lib/analytics/track.client';
import { dayOffset } from '@/lib/history/dates';
import { formatTime } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/LocaleProvider';
import type { HistoryItem } from '@/lib/history/types';
import styles from './HistoryItemRow.module.css';

export function HistoryItemRow({ item, today }: { item: HistoryItem; today: string }) {
  const t = useT();
  const service = serviceById(item.serviceId);
  const reader = readerById(item.readerId);
  /* Same reasoning as `ReadingView`: a row referencing a reader that no longer
     exists is a gap in a list, not a crash on a rendered page. */
  if (!service || !reader) return null;

  return (
    <li className={styles.row}>
      <Link
        href={`/history/${item.id}`}
        className={styles.link}
        onClick={() =>
          track('history.item_opened', {
            reading_id: item.id,
            reader_id: item.readerId,
            service_id: item.serviceId,
            status: item.status,
            age_days: dayOffset(today, item.localDate),
            needs_translation: item.locale !== t.locale,
          })
        }
      >
        <div className={styles.cards}>
          {[...item.cards]
            .sort((a, b) => a.position - b.position)
            .map((c, i) => {
              const card = cardById(c.cardId);
              return card ? (
                <div key={`${c.cardId}-${i}`} className={styles.thumb}>
                  <CardFace card={card} reversed={c.reversed} size="thumb" />
                </div>
              ) : null;
            })}
        </div>

        <div className={styles.text}>
          <div className={styles.top}>
            <span className={styles.service}>{service.name[t.locale]}</span>
            <span className={styles.time}>
              {formatTime(new Date(item.createdAtIso), t.locale)}
            </span>
          </div>
          <div className={styles.reader}>{reader.name}</div>
          {item.question ? <p className={styles.question}>{item.question}</p> : null}
          {/* `failed` and `aborted` are shown (H5) and must SAY so, or a row with
              no prose behind it reads as a bug the moment it is opened. */}
          {!item.hasBody ? (
            <p className={styles.unfinished}>{t('history.item.unfinished')}</p>
          ) : null}
        </div>

        {/* V7 writes `shared_at`; this only reads it. Null after a revoke too --
            "was this ever public" is a different question from "is it now". */}
        {item.sharedAt ? <span className={styles.shared}>{t('history.item.shared')}</span> : null}
      </Link>
    </li>
  );
}
