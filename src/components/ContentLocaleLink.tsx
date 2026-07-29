import { Fragment } from 'react';

import { LOCALES, type Locale } from '@/lib/i18n/locale';
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
 * ── `locales` — v0.5.0 / A6, reconciliation R45 ─────────────────────────────
 *
 * **IT USED TO LOOP `LOCALES` UNCONDITIONALLY, AND A6 IS WHAT MAKES THAT A
 * READER-FACING 404.** Roadmap §1 has always permitted an Indonesian-only article,
 * but both committed ones shipped in both languages, so the sibling URL always
 * existed. **An admin can now unpublish `en` between two page views** — and the
 * footer of the Indonesian article would still offer *English*, to a page that
 * answers 404.
 *
 * That is a reader cost rather than an `hreflang` cost — `contentAlternates()` takes
 * the same derived set and gets it right either way — and it is arguably tolerable.
 * **A6 thinks not, and R45 agreed:** the one control on the page whose entire job is
 * *"read this in your language"* must not be a dead link, and this is the kind of
 * defect a signed-out crawl only finds if the crawl includes a one-locale article.
 *
 * **IT DEFAULTS TO `LOCALES`, WHICH IS THE OPPOSITE OF `contentAlternates()`'s RULE
 * AND IS CORRECT HERE.** R2 forbids defaulting there because *"a pair naming a URL
 * that 404s makes Google discard the whole set silently"* — a wrong answer is
 * invisible and permanent. Here a wrong answer is a visible dead link on one page,
 * and the default is right for the four callers whose two addresses are ONE ROUTE
 * FILE (`/`, `/gallery`, `/blog`, and `/blog`'s not-found), which cannot 404 in
 * either language. Only an ARTICLE has to pass its own set.
 *
 * @param path the BARE content path this page renders: `/`, `/gallery`,
 *             `/arcana/the-moon`. Never a prefixed form.
 * @param locales the locales this path is actually served in. Omit only where the
 *                two addresses are one route file.
 */
export async function ContentLocaleLink({
  path,
  locales = LOCALES,
}: {
  path: string;
  locales?: readonly Locale[];
}) {
  if (!localeSwitcherEnabled()) return null;

  const [locale, t] = await Promise.all([getLocale(), getT()]);

  /*
   * A one-entry group is a control that offers only the language you are reading, so
   * it renders nothing at all -- the same judgement `entriesFor` makes about a
   * one-locale `hreflang` set being *"noise a validator flags"*.
   */
  if (!locales.includes(locale) || locales.length < 2) return null;

  return (
    <div className={styles.row} role="group" aria-label={t('locale.switch.aria')}>
      {locales.map((option, i) => (
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
