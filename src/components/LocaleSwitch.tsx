'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useState, useTransition } from 'react';

import { useLocale, useT } from '@/lib/i18n/LocaleProvider';
import { LOCALES, type Locale } from '@/lib/i18n/locale';
import styles from './LocaleSwitch.module.css';

/**
 * `Indonesia · English`. Two places in the whole app, and only two.
 *
 * The reader picker footer, on the row under the disclaimer, and the login page.
 * NOT THE DRAW SCREEN: a flip mid-reading would leave streamed prose in one
 * language and the chrome in another, and `readings.locale` (I24) records the
 * language the prose came out in. A reading keeps the locale it was generated in,
 * permanently — there is no version of that screen where this control is honest.
 *
 * ── V2 GIVES THAT LAST SENTENCE A SECOND CLAUSE (roadmap R2) ─────────────────
 *
 * Still true: `readings.locale` is immutable (VD7), the prose is never rewritten in
 * place, and this control still has no business on the draw screen. What is no
 * longer true is that the reading is UNREACHABLE in the other language — a
 * translation is a DERIVED ROW in `translations`, generated on demand at the point
 * of render, and the original is never touched. See `## Translation (V2)` in
 * CLAUDE.md.
 *
 * So "permanently" describes the ROW, not the querent's options. Do not read it as
 * licence to skip the translation path, and do not read it as licence to put this
 * control on the draw screen either.
 *
 * `router.refresh()` and not `location.reload()`. The locale is resolved on the
 * server, so the page has to be re-rendered there; `refresh()` re-fetches the RSC
 * payload and keeps client state, which on the reader picker means the frequency
 * line does not flash away and come back.
 *
 * THE LANGUAGE NAMES ARE IN THEIR OWN LANGUAGE in both catalogs — `Indonesia` and
 * `English`, never `Bahasa Inggris`. It is the universal convention and the only
 * one that works for someone who cannot read the locale they are currently in,
 * which is the exact person reaching for this control.
 */
export function LocaleSwitch() {
  const t = useT();
  const active = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [posting, setPosting] = useState(false);

  const busy = pending || posting;

  async function choose(next: Locale) {
    if (next === active || busy) return;
    setPosting(true);
    try {
      const response = await fetch('/api/locale', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      });
      /*
       * NO ERROR COPY, and it is the same call M14 made for the memory features:
       * a failed language switch leaves the page in the language it was already
       * in, which is a visible, self-explanatory outcome. A red sentence saying
       * "could not change language" adds nothing the screen has not already said,
       * and it would need two more catalog keys to say it in.
       */
      if (!response.ok) return;
      startTransition(() => router.refresh());
    } catch {
      // Offline. Same reasoning: the page is unchanged and says so by being unchanged.
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className={styles.row} role="group" aria-label={t('locale.switch.aria')}>
      {LOCALES.map((locale, i) => (
        <Fragment key={locale}>
          {i > 0 ? (
            <span className={styles.sep} aria-hidden="true">
              ·
            </span>
          ) : null}
          {locale === active ? (
            /*
             * A `<span>`, not a disabled button. `aria-current` tells a screen
             * reader which is selected, and a control that does nothing when
             * pressed should be neither focusable nor pressable-looking.
             */
            <span className={`${styles.option} ${styles.active}`} aria-current="true">
              {t(`locale.name.${locale}`)}
            </span>
          ) : (
            <button
              type="button"
              className={styles.option}
              onClick={() => choose(locale)}
              disabled={busy}
            >
              {t(`locale.name.${locale}`)}
            </button>
          )}
        </Fragment>
      ))}
    </div>
  );
}
