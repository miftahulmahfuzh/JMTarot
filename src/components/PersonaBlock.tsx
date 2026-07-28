'use client';

import { useEffect, useRef, useState } from 'react';

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
 * ── THE BODY IS TRANSLATED NOW, AND THE NOTICE IS THE DEGRADED STATE ─────────
 *
 * **THIS FILE USED TO SAY "V2's translator is the next step; until it is wired,
 * this is the honest state rather than a broken one". IT IS WIRED** (2026-07-28).
 * `personas.locale` is still the language the prose came out in and is still
 * immutable — the fix for an untranslated persona is a TRANSLATION and never a
 * regeneration, which is the whole reason `personaInputHash` carries no locale — but
 * the querent no longer reads Indonesian prose inside an English page. The wrapper
 * posts to `/api/translate`, exactly as `HistoryDetail` does for a reading, and the
 * registry already declared `'persona.body'` streamable.
 *
 * **`account.persona.otherLanguage` SURVIVES AND IS NOW THE FAILURE STATE.** It
 * renders when the prose is foreign AND no translation was supplied: V7's
 * server-rendered share mount, which has no session to translate with, and the case
 * where the translation 204'd, errored, or fell back to the source. Deleting it would
 * mean a stranger meets prose in another language with nothing saying so — which is
 * `ReadingView`'s rule 4 and the reason the `/s/` reading notice's deletion did NOT
 * reach this one.
 */
export type PersonaView = {
  body: string;
  /** The locale the BODY is in. May differ from the viewer's. */
  locale: Locale;
  /** True when the body is the deterministic template. Not shown; kept for V7. */
  fallback?: boolean;
};

/**
 * What to render instead of `view.body`, if anything.
 *
 * **A DELIBERATELY SMALLER UNION THAN `ReadingProse`**, which has five members. It
 * has no `original` (that is what an omitted prop means here) and no `unavailable`:
 * `/api/persona` always answers with a body because the fallback is a real block
 * (A9), so "there is nothing to show" is a state this artifact does not have. Adding
 * members to match `ReadingProse` shape-for-shape would be inventing states to be
 * symmetrical with a different artifact.
 *
 * **OMITTING THE PROP MEANS `as-written`, AND V7's MOUNT RELIES ON THAT.** The share
 * page passes no prose and must keep rendering exactly what it renders today.
 */
export type PersonaProse =
  | { kind: 'as-written' }
  | { kind: 'translating'; text: string }
  | { kind: 'translated'; locale: Locale; text: string };

export function PersonaBlock({
  view,
  viewerLocale,
  prose = { kind: 'as-written' },
}: {
  view: PersonaView;
  /**
   * The VIEWER's locale, passed rather than read, so the presentational component
   * has no context dependency and V7's server-rendered mount can supply it.
   */
  viewerLocale: Locale;
  prose?: PersonaProse;
}) {
  const t = useT();

  /*
   * THE NOTICE IS GATED ON `as-written` AS WELL AS ON THE MISMATCH, and both halves
   * do work. Without the first, a successfully translated persona would still carry
   * "this was written in another language" over prose in the reader's own language --
   * which is precisely the bug that got the `/s/` notice deleted. Without the second,
   * V7's mount would lose its only explanation.
   */
  const foreign = view.locale !== viewerLocale && prose.kind === 'as-written';

  /* Which text, and which language to declare it in. `translating` shows the partial
     translation rather than the source, so the paragraph does not swap languages
     under the reader's eyes halfway through. */
  const shown =
    prose.kind === 'as-written'
      ? { text: view.body, lang: view.locale }
      : prose.kind === 'translated'
        ? { text: prose.text, lang: prose.locale }
        : { text: prose.text, lang: viewerLocale };

  return (
    <div className={styles.block}>
      {foreign ? <p className={styles.foreign}>{t('account.persona.otherLanguage')}</p> : null}

      {/*
        THE PULSING PLACEHOLDER UNTIL THE FIRST TRANSLATED TOKEN, not the source
        prose. Showing the Indonesian and replacing it word by word with English
        would be two languages in one paragraph for as long as the stream lasts;
        `history.translating` is the treatment the reading screen already uses for
        the same moment.
      */}
      {prose.kind === 'translating' && shown.text === '' ? (
        <p className={styles.placeholder} role="status">
          {t('history.translating')}
        </p>
      ) : (
        /*
          `lang` IS THE TEXT'S OWN LOCALE, NOT ALWAYS THE VIEWER'S. A screen reader
          picks its voice from this attribute, and Indonesian prose announced by an
          English synthesiser is unintelligible rather than merely accented. It is
          the viewer's only when what is on screen really is in their language.
        */
        <p
          className={styles.body}
          lang={shown.lang}
          aria-label={t('account.persona.a11yLabel')}
        >
          {shown.text}
        </p>
      )}
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
  const [view, setView] = useState<Fetched | null>(null);
  const [failed, setFailed] = useState(false);
  const [prose, setProse] = useState<PersonaProse>({ kind: 'as-written' });

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

        const data = (await res.json()) as {
          body?: string;
          locale?: string;
          fallback?: boolean;
          entityId?: string;
          translation?: string | null;
        };
        if (typeof data.body !== 'string' || data.body.length === 0) {
          setFailed(true);
          return;
        }
        // Trust the route's own answer, and fall back to the VIEWER's locale
        // rather than to `'id'`: an absent field must not make a correct English
        // body render the "written in another language" line.
        const bodyLocale =
          data.locale === 'id' || data.locale === 'en' ? data.locale : viewerLocale;

        const cached =
          typeof data.translation === 'string' && data.translation.length > 0
            ? data.translation
            : null;

        setView({
          body: data.body,
          locale: bodyLocale,
          fallback: data.fallback === true,
          entityId: typeof data.entityId === 'string' ? data.entityId : null,
          cachedTranslation: cached,
        });

        /*
         * THE THREE OPENING STATES, DECIDED HERE RATHER THAN IN A SECOND EFFECT.
         *
         * A cached translation arrives WITH the persona — `/api/persona` reads it
         * server-side, and checks its staleness against `personas.updated_at`, which
         * `/history/[id]` does not have to because a reading's body is immutable. So
         * the common case of a returning English reader has no spinner and no second
         * request at all.
         */
        if (bodyLocale === viewerLocale) {
          setProse({ kind: 'as-written' });
        } else if (cached) {
          setProse({ kind: 'translated', locale: viewerLocale, text: cached });
        } else {
          setProse({ kind: 'translating', text: '' });
        }
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

  /*
   * ── THE TRANSLATION, IN ITS OWN EFFECT ──────────────────────────────────────
   *
   * Separate from the fetch above because it is gated on that fetch's RESULT: only a
   * foreign-locale persona with nothing cached needs it, and that is not knowable
   * until the body is in hand. Same division `HistoryDetail` has, where the page
   * above it supplies the reading and the component owns only the translation.
   */
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    /*
     * **GATED ON THE FETCHED DATA AND NEVER ON `prose`.** Reading `prose.kind ===
     * 'translating'` here would be the natural way to express "the state machine says
     * translate now", and it puts `prose` in the dependency list — so the effect
     * re-runs on EVERY STREAMED CHUNK, since each one is a new `prose` object. The
     * `attempted` guard would swallow the re-entry and nothing would look wrong,
     * which is exactly the sort of dependency-list bug `SwipeDeck` and
     * `FrequencyLine` both paid for. These three fields are the whole condition.
     */
    if (!view || view.entityId === null) return;
    if (view.locale === viewerLocale) return;
    if (view.cachedTranslation !== null) return;

    /*
     * ONE ATTEMPT PER (persona, target locale), BECAUSE EACH ONE IS A MODEL CALL.
     * Keyed rather than a bare boolean: switching to English, back to Indonesian and
     * to English again must not be one attempt, and `HistoryDetail`'s `started` ref
     * would make it one.
     */
    const key = `${view.entityId}:${viewerLocale}`;
    if (attempted.current === key) return;
    attempted.current = key;

    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [SESSION_HEADER]: getSessionId(),
            [LOCAL_DATE_HEADER]: todayKey(),
          },
          signal: controller.signal,
          /*
           * NO `targetLocale` IN THE BODY. V2's route resolves the target from
           * `await getLocale()` and never from anything the client says --
           * deliberately, because that is the only way the dev-only `?lang=`
           * override and the session claim cannot disagree. Sending one would be
           * ignored, which is worse than not sending it: it would read as though
           * this component chose the language.
           *
           * `entityId` IS THE QUERENT'S OWN USER ID. `personas.user_id` is the
           * primary key, so it is the persona's entity id too -- see
           * `resolveTranslatable`'s persona arm and `/api/persona`'s `json`.
           */
          body: JSON.stringify({
            entity: 'persona',
            entityId: view.entityId,
            field: 'body',
          }),
        });

        /*
         * 204 IS A REAL ANSWER FROM THIS ROUTE, NOT AN EMPTY 200. V2 returns it when
         * the source is already in the viewer's locale -- unreachable here, since the
         * gate above required a mismatch -- and when the translation produced nothing
         * at all. `res.ok` is TRUE for a 204, so checking only that would leave the
         * screen on a spinner forever.
         *
         * FALLING BACK MEANS `as-written`, WHICH RE-ARMS THE NOTICE. It does NOT mean
         * `unavailable`: the persona has a true body in another language, and showing
         * it labelled is strictly better than showing the retry affordance for prose
         * that arrived successfully.
         */
        if (!res.ok || res.status === 204 || !res.body) {
          setProse({ kind: 'as-written' });
          return;
        }

        const stream = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let acc = '';
        for (;;) {
          const { done, value } = await stream.read();
          if (done) break;
          acc += value;
          /*
           * Set the accumulated string, never `setProse(p => ...)`. StrictMode
           * double-invokes updaters and would duplicate every chunk in
           * development -- the same trap `DaySummary` records.
           */
          setProse({ kind: 'translating', text: acc });
        }

        setProse(resolveStreamed(acc, view.body, viewerLocale));
      } catch {
        if (controller.signal.aborted) {
          /*
           * **THE ABORT CLEARS THE GUARD, AND THIS IS THE ONE PLACE THIS COMPONENT
           * DOES NOT COPY `HistoryDetail`.** Its `started` ref is set before the
           * fetch and never cleared, so under StrictMode -- setup, cleanup, setup --
           * the first run arms the guard, the cleanup aborts the request, and the
           * second run returns early: the block would sit on the translating
           * placeholder forever, in development only. Clearing here lets the remount
           * retry, and the retry is nearly free because `translateOrCached` writes
           * the row even though this client stopped listening.
           */
          attempted.current = null;
          return;
        }
        setProse({ kind: 'as-written' });
      }
    })();

    return () => controller.abort();
  }, [view, viewerLocale]);

  if (view) return <PersonaBlock view={view} viewerLocale={viewerLocale} prose={prose} />;

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

/**
 * `PersonaView` plus the two fields only the wrapper needs. Never rendered, and
 * deliberately not part of `PersonaView` — V7's mount supplies neither and must not
 * have to.
 */
type Fetched = PersonaView & {
  /** The querent's own `users.id`; `personas.user_id` is the primary key. */
  entityId: string | null;
  /** Read server-side and already staleness-checked. Null means "go translate". */
  cachedTranslation: string | null;
};

/**
 * What the finished stream actually was.
 *
 * **`translateStream` YIELDS THE SOURCE VERBATIM ON FAILURE** and the route returns
 * it as an ordinary 200 (`TranslateResult.fellBack`), so a caller that renders it as
 * `translated` breaches the honesty rule through the path meant to protect it —
 * `ReadingView`'s rule 4, and `resolveStreamed` in `HistoryDetail` is the same six
 * lines for the same reason. Here the fallback is `as-written`, which re-arms the
 * notice, rather than `unavailable`.
 */
function resolveStreamed(streamed: string, source: string, target: Locale): PersonaProse {
  const text = streamed.trim();
  if (!text) return { kind: 'as-written' };
  if (text === source.trim()) return { kind: 'as-written' };
  return { kind: 'translated', locale: target, text: streamed };
}
