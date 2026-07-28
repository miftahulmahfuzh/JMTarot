import { Fragment } from 'react';

import { LOCALES } from '@/lib/i18n/locale';
import { localePath } from '@/lib/i18n/prefix';
import { localeSwitcherEnabled } from '@/lib/i18n/resolve';
import { getLocale, getT } from '@/lib/i18n/t';
import styles from './LocaleSwitch.module.css';

/**
 * The language control on a public content page. **A LINK, NOT A TOGGLE**
 * (v0.4.0 §4.2).
 *
 * ── WHY THIS IS NOT A `LocaleSwitch` VARIANT ────────────────────────────────
 *
 * `LocaleSwitch` POSTs `/api/locale`, which re-mints the session and writes the
 * cookie. On a content page there is usually no session, and the mechanism is
 * wrong regardless: **the sibling URL IS the other language.** A session write
 * would also couple a CDN-cached public page to a database round trip, which
 * S-D10 forbids. And `LocaleSwitch` is `'use client'` -- a variant would ship two
 * deadlines, a retry, a `useTransition` and the analytics batcher to the pages
 * whose TTFB a crawler measures. Roadmap §6.5 asked for that variant and
 * reconciliation R12 replaced it with this.
 *
 * So: a server component, no JavaScript, and the markup and CSS of the `names`
 * variant.
 *
 * ── THE ACCEPTED COST, QUOTED FROM §4.2 SO NOBODY "FIXES" IT ────────────────
 *
 *   "The accepted cost, stated so nobody 'fixes' it: a signed-in user who
 *   switches to English while reading the blog and then opens the app is still in
 *   Indonesian there. Making the link also `POST /api/locale` would couple a
 *   CDN-cached public page to a session write -- S-D10 -- and the app carries its
 *   own switcher in the account menu. `LOCALE_SWITCHER` gates rendering the
 *   control, as it does everywhere; English stays reachable by URL with it off."
 *
 * The same asymmetry reaches a stranger: nothing a visitor chooses by URL on a
 * content page carries into `/login`, because no cookie is written. `/login`
 * negotiates from `Accept-Language` exactly as W6 built it.
 *
 * ── TWO THINGS THAT MUST NOT CHANGE ─────────────────────────────────────────
 *
 * **A PLAIN `<a>`, NEVER `next/link`.** A client-side navigation to `/en/gallery`
 * resolves -- after middleware's rewrite -- to the SAME route under the SAME root
 * layout, so Next does not re-render the layout: `<html lang>` and
 * `LocaleProvider`'s catalog would keep their old values and the page would come
 * out half-translated. A full document load is the mechanism, and a plain anchor
 * is what performs one. Crawlability is NOT the reason -- `next/link` renders a
 * real anchor too.
 *
 * **`path` IS A PROP AND `usePathname()` IS NOT AN OPTION.** On `/en/gallery` the
 * browser URL is `/en/gallery` and the rendered route is `/gallery`, so a
 * client-side computation builds `/en/en/gallery` and disagrees with the server
 * about it. The server page knows its own bare route; that is the only correct
 * source. `localePath` throws on an already-prefixed argument, which is what
 * turns a mistake here into a loud one.
 *
 * ── NO NEW CATALOG KEY ──────────────────────────────────────────────────────
 *
 * `locale.name.*` and `locale.switch.aria` already exist and are written
 * identically in both catalogs. `LocaleSwitch`'s header argues full names belong
 * "where the control has to introduce itself"; a stranger on a page in a language
 * they may not read is exactly that person.
 *
 * `LOCALE_SWITCHER` gates RENDERING ONLY, as everywhere. With it off, `/en/…`
 * still serves and `hreflang` still names it to a crawler -- which is now the
 * whole point rather than a side effect.
 *
 * @param path the BARE content path this page renders: `/`, `/gallery`,
 *             `/arcana/the-moon`. Never a prefixed form.
 */
export async function ContentLocaleLink({ path }: { path: string }) {
  if (!localeSwitcherEnabled()) return null;

  const [locale, t] = await Promise.all([getLocale(), getT()]);

  return (
    <div className={styles.row} role="group" aria-label={t('locale.switch.aria')}>
      {LOCALES.map((option, i) => (
        <Fragment key={option}>
          {i > 0 ? (
            <span className={styles.sep} aria-hidden="true">
              ·
            </span>
          ) : null}
          {option === locale ? (
            /*
             * A `<span>`, not a link to the page you are on. `aria-current` tells
             * a screen reader which is selected, and a self-link is a crawl
             * instruction to nowhere. Same reasoning as `LocaleSwitch`'s
             * non-button.
             */
            <span className={`${styles.option} ${styles.active}`} aria-current="true">
              {t(`locale.name.${option}`)}
            </span>
          ) : (
            <a
              className={`${styles.option} ${styles.link}`}
              href={localePath(option, path)}
              /* `rel`/`hrefLang` so the relationship is machine-readable in the
                 body as well as in the head. Never `nofollow`: a crawler
                 following this is the point. */
              rel="alternate"
              hrefLang={option}
            >
              {t(`locale.name.${option}`)}
            </a>
          )}
        </Fragment>
      ))}
    </div>
  );
}
