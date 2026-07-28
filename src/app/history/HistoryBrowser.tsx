'use client';

/**
 * The date filter and the day's list.
 *
 * **`todayKey()` IS NOT CALLED DURING RENDER, AND THAT IS THE WHOLE SHAPE OF
 * THIS COMPONENT.** It reads `new Date()`, which differs between the server
 * render and the client hydration, and React cannot patch a mismatch — the same
 * trap as `shuffleDeck()` in a `useState` initialiser, where the DOM kept the
 * server's cards while state held the client's. So `today` starts null, an
 * effect sets it, and everything downstream waits. Nothing flashes, because
 * there was never any content to replace. **Do not "simplify" this into
 * `useState(() => todayKey())`.**
 *
 * TWO REQUESTS ON MOUNT: the days that have readings (once, for the filter
 * strip) and the selected day's items (again on every filter change). Both are
 * indexed reads of the querent's own rows; neither is rate limited (H12).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { LOCAL_DATE_HEADER, SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId, track } from '@/lib/analytics/track.client';
import { dayOffset, isHistoryDate } from '@/lib/history/dates';
import { emptyState } from '@/lib/history/empty';
import { formatLocalDate } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/LocaleProvider';
import { todayKey } from '@/lib/storage';
import type { HistoryItem } from '@/lib/history/types';
import { DateFilter } from './DateFilter';
import { HistoryItemRow } from './HistoryItemRow';
import styles from './HistoryBrowser.module.css';

type Load = { status: 'idle' } | { status: 'ok'; items: HistoryItem[] } | { status: 'error' };

export function HistoryBrowser() {
  const t = useT();
  const [today, setToday] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  /** `null` until the days request lands. NOT the same as `[]` — see `emptyState`. */
  const [days, setDays] = useState<string[] | null>(null);
  const [load, setLoad] = useState<Load>({ status: 'idle' });
  /** StrictMode double-invokes effects; `history.viewed` must fire once. */
  const viewedFired = useRef(false);

  // Step 1: learn what day it is, on the client, once.
  useEffect(() => {
    const now = todayKey();
    const q = new URL(window.location.href).searchParams.get('date');
    setToday(now);
    /* H13: `?date=` is READ on mount. Validated against the same function the
       route uses, so a hand-edited URL cannot put the page in a state the
       server will then 400. */
    setSelected(isHistoryDate(q, now) ? q : now);
  }, []);

  // Step 2: which days have anything. Fetched once; the strip is built from it.
  useEffect(() => {
    if (!today) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/history/days', {
          headers: { [SESSION_HEADER]: getSessionId(), [LOCAL_DATE_HEADER]: today },
          signal: controller.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { days: string[] };
        setDays(body.days);
        if (!viewedFired.current) {
          viewedFired.current = true;
          track('history.viewed', {
            day_count: body.days.length,
            has_any: body.days.length > 0,
            /*
             * `document.referrer` is a URL and would be free text; the ORIGIN
             * comparison is a boolean dressed as an enum, which is rule 2 of the
             * taxonomy. V4's menu link is same-origin; a bookmark is not.
             */
            source: sameOrigin(document.referrer) ? 'menu' : 'direct',
          });
        }
      } catch {
        /* The list's own error state covers the page; a dead days-strip is
           survivable, and `days` staying null keeps the empty state honest. */
      }
    })();
    return () => controller.abort();
  }, [today]);

  // Step 3: the selected day's items. Re-runs on every filter change.
  useEffect(() => {
    if (!selected || !today) return;
    const controller = new AbortController();
    setLoad({ status: 'idle' });
    void (async () => {
      try {
        const res = await fetch(`/api/history?date=${encodeURIComponent(selected)}`, {
          headers: { [SESSION_HEADER]: getSessionId(), [LOCAL_DATE_HEADER]: today },
          signal: controller.signal,
        });
        if (!res.ok) {
          setLoad({ status: 'error' });
          return;
        }
        const body = (await res.json()) as { items: HistoryItem[] };
        setLoad({ status: 'ok', items: body.items });
      } catch {
        // An abort is a normal path -- StrictMode, and every filter change.
        if (!controller.signal.aborted) setLoad({ status: 'error' });
      }
    })();
    return () => controller.abort();
  }, [selected, today]);

  const choose = useCallback(
    (date: string, via: 'chip' | 'picker') => {
      if (!today) return;
      setSelected(date);
      track('history.filtered', {
        offset_days: dayOffset(today, date),
        had_readings: (days ?? []).includes(date),
        via,
      });
      /*
       * `replaceState`, NOT `router.replace` (H13). A Next navigation per chip
       * tap re-runs middleware and an RSC render to change a client-side filter.
       * This makes the URL shareable and reload-correct for free, and browser
       * back deliberately leaves `/history` rather than stepping through filter
       * states -- which is what a thumb on a phone expects.
       */
      const url = new URL(window.location.href);
      url.searchParams.set('date', date);
      window.history.replaceState(null, '', url);
    },
    [days, today],
  );

  /* The pre-hydration render and the first frame after it. No children, so
     there is nothing to replace when `today` arrives. */
  if (!today || !selected) return <div className={styles.shell} aria-busy="true" />;

  return (
    <div className={styles.shell}>
      <DateFilter today={today} selected={selected} days={days ?? []} onChoose={choose} />

      {load.status === 'error' ? <p className={styles.error}>{t('history.error')}</p> : null}

      {load.status === 'ok' && load.items.length > 0 ? (
        <>
          <p className={styles.count}>{t.plural('history.count', load.items.length)}</p>
          <ol className={styles.list}>
            {load.items.map((item) => (
              <HistoryItemRow key={item.id} item={item} today={today} />
            ))}
          </ol>
        </>
      ) : null}

      {load.status === 'ok' && load.items.length === 0 ? (
        <Empty selected={selected} days={days} onChoose={choose} />
      ) : null}
    </div>
  );
}

/**
 * H9 / §4.8. TWO EMPTY STATES, AND TELLING THEM APART IS THE POINT.
 *
 * The decision itself is `emptyState` in `@/lib/history/empty`, tested there
 * without a DOM. This is only its rendering.
 */
function Empty({
  selected,
  days,
  onChoose,
}: {
  selected: string;
  days: string[] | null;
  onChoose: (date: string, via: 'chip' | 'picker') => void;
}) {
  const t = useT();
  const state = emptyState(days, selected);

  if (state.kind === 'never') {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>{t('history.empty.never.title')}</p>
        <p className={styles.emptyBody}>{t('history.empty.never.body')}</p>
        <a className={styles.emptyAction} href="/">
          {t('history.empty.never.action')}
        </a>
      </div>
    );
  }

  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>
        {t('history.empty.day', { date: formatLocalDate(selected, t.locale, true) })}
      </p>
      {state.nearest ? (
        <button
          type="button"
          className={styles.emptyAction}
          onClick={() => onChoose(state.nearest as string, 'chip')}
        >
          {t('history.empty.nearest', { date: formatLocalDate(state.nearest, t.locale, true) })}
        </button>
      ) : null}
    </div>
  );
}

function sameOrigin(referrer: string): boolean {
  try {
    return new URL(referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}
