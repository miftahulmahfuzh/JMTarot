'use client';

/**
 * The 22 tiles, and the one zoom sheet.
 *
 * ── THREE THINGS THIS FILE OWNS, AND WHY IT IS ONE COMPONENT AND NOT 22 ─────
 *
 * 1. **ONE OPEN CARD.** `AccountCard` holds its own `open` because there is one
 *    card on that page. Twenty-two tiles each holding their own would make "exactly
 *    one sheet is open" an emergent property of nobody having tapped twice, rather
 *    than an invariant. `open: Card | null` makes it structural.
 * 2. **ONE OPENER REF.** Filled from the click event's `currentTarget` and handed to
 *    `CardDetail` as `returnFocusTo`. Typed `HTMLElement | null` rather than
 *    `HTMLButtonElement | null` on purpose: React's `RefObject<T>` is
 *    `{ current: T }`, which is MUTABLE and therefore invariant, so a
 *    `RefObject<HTMLButtonElement | null>` is not assignable to a
 *    `RefObject<HTMLElement | null>` and the symptom is a TS2322 that reads like a
 *    React version problem.
 * 3. **EVERY `track()` CALL.** The tile stays presentational, so there is one place
 *    to read when asking what this page records.
 *
 * THIS BEING A CLIENT COMPONENT DOES NOT HIDE THE 22 LINKS FROM A CRAWLER. Client
 * components are SERVER-RENDERED in the App Router -- the same fact that puts the
 * draw screen's slot labels in the initial HTML -- so all 22 `<a href>`s are in the
 * response body. `tools/seo/crawl.sh` asserts it with `grep -c`, which is the only
 * way worth asserting it.
 */
import Link from 'next/link';
import { useRef, useState } from 'react';

import { CardDetail } from '@/components/CardDetail';
import { cardKeywords } from '@/data/deck';
import type { Card } from '@/data/types';
import { track } from '@/lib/analytics/track.client';
import { useT } from '@/lib/i18n/LocaleProvider';
import { GalleryTile } from './GalleryTile';
import styles from './GalleryGrid.module.css';

export function GalleryGrid({
  cards,
  loreHrefs,
}: {
  /** Sorted by id by the server page. 22 of them. */
  cards: Card[];
  /** `card.id` -> the locale-prefixed lore URL. */
  loreHrefs: Record<number, string>;
}) {
  const t = useT();
  const [open, setOpen] = useState<Card | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  return (
    <>
      {/*
        A LIST, AND `role="list"` IS NOT REDUNDANT. Safari strips list semantics
        from a `<ul>` whose `list-style` is `none`, and Safari is the platform this
        app is built for -- without it VoiceOver does not announce "list, 22 items",
        which is the one piece of orientation a 3000px grid can give.
      */}
      <ul className={styles.grid} role="list">
        {cards.map((card) => (
          <GalleryTile
            key={card.id}
            card={card}
            loreHref={loreHrefs[card.id]}
            onZoom={(c, opener) => {
              openerRef.current = opener;
              setOpen(c);
              track('public.card_zoomed', { card_id: c.id, surface: 'gallery' });
            }}
            onLore={(c) =>
              /* `slug` is the URL slug and is a CLOSED SET of 22 committed values,
                 which is what makes it legal in `props` (rules 1 and 2). It is the
                 slug rather than the id here because `public.link_clicked` is
                 shared with the footer and the landing, where there is no card. */
              track('public.link_clicked', {
                from: 'gallery',
                to: 'arcana',
                slug: loreHrefs[c.id].split('/').pop() ?? null,
              })
            }
          />
        ))}
      </ul>

      {open ? (
        <CardDetail
          /*
           * `reversed: false` -- this is a catalogue and nobody dealt these.
           * `bothMeanings` is what makes that honest rather than half a card: the
           * sheet labels the upright and the reversed line, so neither is asserted
           * as THE meaning of the upright artwork above them.
           */
          draw={{ card: open, reversed: false }}
          /*
           * `position` is the label across the top of the sheet. There is no slot
           * here, so it carries the eyebrow -- `common.majorArcana` needs no new
           * key, and it is the same words `Eyebrow` prints at the top of the page.
           */
          position={t('common.majorArcana')}
          bothMeanings
          returnFocusTo={openerRef}
          onClose={() => setOpen(null)}
          /* No `onReturn`: there is no deck on this page to return anything to.
             `CardDetail` renders no button when it is absent, exactly as
             `ReadingView` and `AccountCard` already rely on. */
        >
          <ul className={styles.keywords} role="list">
            {cardKeywords(open, t.locale).map((k) => (
              <li key={k} className={styles.keyword}>
                {k}
              </li>
            ))}
          </ul>

          <div className={styles.zoomActions}>
            <Link
              className={styles.zoomLore}
              href={loreHrefs[open.id]}
              prefetch={false}
              onClick={() =>
                track('public.link_clicked', {
                  from: 'gallery',
                  to: 'arcana',
                  slug: loreHrefs[open.id].split('/').pop() ?? null,
                })
              }
            >
              {t('gallery.card.lore')}
              <span className={styles.srOnly}>{` ${open.name}`}</span>
            </Link>

            {/*
              S5's `WallpaperDownload` MOUNTS HERE, BELOW THE LORE LINK, INSIDE A
              `.downloadSeam` DIVIDER, WITH `from="gallery"` -- AND S5 HAS NOT
              LANDED, SO THE TWO LINES ARE ABSENT RATHER THAN STUBBED.

              S3's own plan names this as the correct temporary state and gives the
              reason: a committed `<a href>` to `/wallpapers/...` is a 404 on a
              public page, and inventing a local `wallpaperPath()` would be a second
              definition of an address S5 owns (reconciliation §5's register). The
              placement decisions S3 does own are recorded so S5 does not have to
              re-derive them: in the ZOOM SHEET rather than on the tile (a download
              is a secondary action, and 22 of them would compete with 22 lore links
              on a page whose subject is the art), BELOW the lore link (reading the
              card's page is the primary next step; the wallpaper is the souvenir),
              and above `.actions`, which holds Close.

              There is no `gallery.download_clicked` to add either: S5's
              `wallpaper.downloaded` already carries `{ card_id, variant }`.
            */}
          </div>
        </CardDetail>
      ) : null}
    </>
  );
}
