'use client';

import { useEffect, useState } from 'react';

import { LOCAL_DATE_HEADER, SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId } from '@/lib/analytics/track.client';
import type { Locale } from '@/lib/i18n/locale';
import { useLocale, useT } from '@/lib/i18n/LocaleProvider';
import { todayKey } from '@/lib/storage';
import styles from './PersonaBlock.module.css';

/**
 * The Inner Heavenly Lotus, rendered (VD15/VD16).
 *
 * **SPLIT INTO A PRESENTATIONAL COMPONENT AND A THIN FETCHING WRAPPER, AND THE
 * SPLIT IS FOR V7.** `PersonaBlock` takes a body and renders it; `PersonaBlockClient`
 * is the signed-in wrapper that fetches `/api/persona`. V7's share page mounts the
 * FIRST one, with a body it read server-side and with `nickname: null` — it must
 * never mount the second, because a stranger's GET triggering a model call is the
 * denial-of-service surface the release worried about, and because
 * `/api/persona` requires a session that a stranger does not have. The same split
 * V5 made to `DaySummary` and for the same reason.
 *
 * ── TWO DIFFERENCES FROM `FrequencyLine`, BOTH DELIBERATE ────────────────────
 *
 * 1. **IT RENDERS A PLACEHOLDER WHILE LOADING.** M14's "render nothing" is right
 *    for a line that appears UNBIDDEN on the reader picker; this one has a heading
 *    above it that the querent came to read, and an empty space under a heading
 *    reads as broken rather than as tactful.
 * 2. **IT NEVER RENDERS NOTHING.** The endpoint always returns a body — the
 *    fallback is a real block (A9) — so a failure renders the retry affordance the
 *    catalog already has, not silence.
 *
 * ── THE BODY MAY BE IN ANOTHER LANGUAGE, AND THAT IS SAID IN CHROME ──────────
 *
 * `personas.locale` is the language the prose came out in and it is immutable
 * (VD7's argument, applied to a second artifact). A querent who switches to English
 * after their persona was written in Indonesian sees the Indonesian body with a line
 * above it saying so, and `lang` set to the body's own locale so a screen reader
 * pronounces it correctly. **That is `ReadingView`'s `{ kind: 'as-written' }`
 * decision, made here for the same reason:** falling back silently to the original
 * is the one thing that must not happen, and the honesty comes from chrome rather
 * than from prose. V2's translator is the next step; until it is wired, this is the
 * honest state rather than a broken one.
 */
export type PersonaView = {
  body: string;
  /** The locale the BODY is in. May differ from the viewer's. */
  locale: Locale;
  /** True when the body is the deterministic template. Not shown; kept for V7. */
  fallback?: boolean;
};

export function PersonaBlock({
  view,
  viewerLocale,
}: {
  view: PersonaView;
  /**
   * The VIEWER's locale, passed rather than read, so the presentational component
   * has no context dependency and V7's server-rendered mount can supply it.
   */
  viewerLocale: Locale;
}) {
  const t = useT();
  const foreign = view.locale !== viewerLocale;

  return (
    <div className={styles.block}>
      {foreign ? <p className={styles.foreign}>{t('account.persona.otherLanguage')}</p> : null}
      {/*
        `lang` IS THE BODY'S OWN LOCALE, NOT THE VIEWER'S. A screen reader picks its
        voice from this attribute, and Indonesian prose announced by an English
        synthesiser is unintelligible rather than merely accented.
      */}
      <p className={styles.body} lang={view.locale} aria-label={t('account.persona.a11yLabel')}>
        {view.body}
      </p>
    </div>
  );
}

/** The signed-in wrapper. **V7 does NOT use this one.** */
export function PersonaBlockClient() {
  const t = useT();
  /* The dependency that makes a language switch reach this block, and it is the
     bug `FrequencyLine` paid for: `router.refresh()` KEEPS client state by design,
     so with `[]` this effect could never run again and the block would keep
     whichever language it was first fetched in. */
  const viewerLocale = useLocale();
  const [view, setView] = useState<PersonaView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    /*
     * Aborted on unmount. StrictMode mounts, unmounts and remounts every effect in
     * development, so without this the page fires two requests — and the first
     * visit's request costs a model call, on a route whose whole design is about not
     * paying for one twice.
     */
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch('/api/persona', {
          headers: {
            [SESSION_HEADER]: getSessionId(),
            [LOCAL_DATE_HEADER]: todayKey(),
          },
          signal: controller.signal,
        });

        if (res.status !== 200) {
          setFailed(true);
          return;
        }

        const data = (await res.json()) as { body?: string; locale?: string; fallback?: boolean };
        if (typeof data.body !== 'string' || data.body.length === 0) {
          setFailed(true);
          return;
        }
        setView({
          body: data.body,
          // Trust the route's own answer, and fall back to the VIEWER's locale
          // rather than to `'id'`: an absent field must not make a correct English
          // body render the "written in another language" line.
          locale: data.locale === 'id' || data.locale === 'en' ? data.locale : viewerLocale,
          fallback: data.fallback === true,
        });
      } catch {
        /*
         * An abort lands here too and is not a failure. Distinguishing them costs a
         * `controller.signal.aborted` check and buys nothing: an aborted request
         * belongs to a component that is being unmounted, so nothing it sets will
         * ever render.
         */
        if (!controller.signal.aborted) setFailed(true);
      }
    })();

    return () => controller.abort();
  }, [viewerLocale]);

  if (view) return <PersonaBlock view={view} viewerLocale={viewerLocale} />;

  if (failed) {
    return (
      <p className={styles.placeholder} role="status">
        {t('common.retry')}
      </p>
    );
  }

  /*
   * The reading screen's existing `Membaca…` treatment. NOT a skeleton: the block
   * is one paragraph of variable length, and a grey box that resolves to three
   * lines of prose is a layout shift dressed as politeness.
   */
  return (
    <p className={styles.placeholder} role="status">
      {t('account.persona.loading')}
    </p>
  );
}
