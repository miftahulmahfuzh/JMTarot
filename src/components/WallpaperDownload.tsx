'use client';

/**
 * The download control. S5 owns the asset contract and this component; S3 owns
 * where it is mounted, and S4 may mount it on a lore page (roadmap §7, R8).
 *
 * **NO SESSION, NO FETCH OF OUR OWN API, NO COOKIE.** Two anchors to two static
 * files, a licence line, and one buffered event. It renders identically for a
 * stranger and for a signed-in querent, which is what lets the page it sits on
 * stay CDN-cacheable (S-D10).
 *
 * **THE ANCHOR IS THE CONTRACT AND THE HANDLER IS AN UPGRADE.** With JavaScript
 * off, or if the share path throws, the browser's own download runs and the
 * person gets the file. `preventDefault()` is called ONLY on the branch that has
 * already decided to do something better -- see `wallpaperDownload.ts`.
 *
 * **NO `content-disposition: attachment` ON `/wallpapers/*`** (W-D10, written
 * into `next.config.ts`). It would force a download and make the image impossible
 * to VIEW -- and viewing is the prerequisite for iOS's long-press -> Add to
 * Photos, which is the fallback when the share sheet is not available. The
 * `download` attribute gets the filename without closing that door.
 *
 * `track()` is buffered rather than sent (it returns void and must never be
 * awaited): the batcher's `pagehide` handler covers a share sheet that tears the
 * page's attention away before the two-second debounce fires. Same reasoning
 * `TryItYourself` records.
 */
import { useCallback } from 'react';

import type { Card } from '@/data/types';
import { track } from '@/lib/analytics/track.client';
import { useT } from '@/lib/i18n/LocaleProvider';
import { wallpapersFor, type WallpaperVariant } from '@/lib/wallpaper';
import { chooseMethod } from './wallpaperDownload';
import styles from './WallpaperDownload.module.css';

/** Where the control was mounted. A closed set -- `events.ts` rule 2. */
export type WallpaperSurface = 'gallery' | 'arcana';

/**
 * Bounds the blob fetch, for `POST /api/locale`'s reason: a server budget with no
 * client bound only makes a hang longer. 8s matches `ShareFooter`. Giving up
 * costs the person nothing -- the fallback is the browser's own download of the
 * same URL, which is what would have happened with no JavaScript at all.
 */
const FETCH_TIMEOUT_MS = 8_000;

export function WallpaperDownload({ card, from }: { card: Card; from: WallpaperSurface }) {
  const t = useT();
  const variants = wallpapersFor(card);

  /*
   * THERE IS NO FAILURE STATE ON THIS CONTROL, AND THAT IS DELIBERATE. Every
   * branch below ends in a download: the share path falls back to the browser's
   * own, and the browser's own is the default. The only outcome that produces
   * nothing is the person tapping Cancel on the share sheet, which is not a
   * failure and must not be announced as one. A `wallpaper.failed` string would
   * be a message that can never legitimately render.
   */
  const onClick = useCallback(
    async (
      event: React.MouseEvent<HTMLAnchorElement>,
      variant: WallpaperVariant,
      href: string,
      filename: string,
    ) => {
      const method = chooseMethod({
        canShareFiles:
          typeof navigator !== 'undefined' &&
          typeof navigator.canShare === 'function' &&
          typeof navigator.share === 'function' &&
          navigator.canShare({ files: [new File([], filename, { type: 'image/jpeg' })] }),
        coarsePointer:
          typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
      });

      if (method === 'link') {
        // The anchor does the work. Do NOT preventDefault.
        track('wallpaper.downloaded', { card_id: card.id, variant, method: 'link', from });
        return;
      }

      // Synchronous, before the first await: the branch that has decided to do
      // something better than the browser's default is the only one that may
      // cancel it.
      event.preventDefault();

      let blob: Blob;
      try {
        const res = await fetch(href, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok) throw new Error(String(res.status));
        blob = await res.blob();
      } catch {
        // TWO ABORTERRORS, SEPARATED ON PURPOSE. This catch is the FETCH's --
        // a timeout or an offline device -- and the right answer is the plain
        // download. The share sheet's AbortError is the person tapping Cancel and
        // is handled below, where it must NOT fall back and must NOT be recorded.
        fallbackDownload(href, filename);
        track('wallpaper.downloaded', { card_id: card.id, variant, method: 'link', from });
        return;
      }

      try {
        await navigator.share({ files: [new File([blob], filename, { type: 'image/jpeg' })] });
      } catch (err) {
        if ((err as Error | undefined)?.name === 'AbortError') return; // cancelled, not failed
        fallbackDownload(href, filename);
        track('wallpaper.downloaded', { card_id: card.id, variant, method: 'link', from });
        return;
      }
      track('wallpaper.downloaded', { card_id: card.id, variant, method: 'share', from });
    },
    [card.id, from],
  );

  return (
    <section className={styles.block}>
      <h3 className={styles.heading}>{t('wallpaper.heading')}</h3>
      <ul className={styles.list} role="list">
        {variants.map(({ variant, href, filename, width, height }) => (
          <li key={variant}>
            <a
              className={styles.link}
              href={href}
              download={filename}
              aria-label={t(variant === 'card' ? 'wallpaper.cardAria' : 'wallpaper.phoneAria', {
                card: card.name,
              })}
              onClick={(e) => void onClick(e, variant, href, filename)}
            >
              {t(variant === 'card' ? 'wallpaper.card' : 'wallpaper.phone')}
              <span className={styles.dims}>
                {width}&times;{height}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>{t('wallpaper.saveHint')}</p>
      <p className={styles.licence}>
        {t('wallpaper.licence')} <a href="/terms#9">{t('wallpaper.licenceLink')}</a>
      </p>
    </section>
  );
}

/** The browser's own download, triggered from script. Same-origin only — the
 *  `download` attribute is ignored cross-origin, which is why `wallpaperPath`
 *  returns a root-relative path and must keep doing so. */
function fallbackDownload(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}
