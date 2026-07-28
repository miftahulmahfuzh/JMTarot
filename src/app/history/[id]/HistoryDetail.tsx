'use client';

/**
 * The thin client wrapper that owns the TRANSLATION and nothing else.
 *
 * WHY IT EXISTS AT ALL: `ReadingView` takes prose as data (H2) so V7 can mount
 * it on a page with no session, and a streaming translation needs client state.
 * This file is that state, and it is deliberately the only thing in it —
 * everything visual is in `ReadingView`, which is the point of VD10.
 */
import { useEffect, useRef, useState } from 'react';

import { ReadingView, type ReadingProse, type ReadingViewData } from '@/components/ReadingView';
import { ShareFooter } from '@/components/ShareFooter';
import { LOCAL_DATE_HEADER, SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId, track } from '@/lib/analytics/track.client';
import { useT } from '@/lib/i18n/LocaleProvider';
import { todayKey } from '@/lib/storage';

export function HistoryDetail({
  reading,
  cachedTranslation,
  nickname,
}: {
  reading: ReadingViewData;
  /** Read on the server from `translations`, so a second view has no spinner. */
  cachedTranslation: string | null;
  /**
   * V7. `profiles.nickname`, for the share sheet's preview of the
   * "A reading for {nickname}" line the public page renders.
   *
   * Passed in rather than fetched: this is a client component, and the page above
   * it is already doing one primary-key read.
   */
  nickname: string | null;
}) {
  const t = useT();
  const needs = reading.locale !== t.locale && reading.body !== null;

  const [prose, setProse] = useState<ReadingProse>(() => {
    if (!needs) return { kind: 'original' };
    if (cachedTranslation) return { kind: 'translated', locale: t.locale, text: cachedTranslation };
    return { kind: 'translating', text: '' };
  });

  const started = useRef(false);

  useEffect(() => {
    if (!needs || cachedTranslation) return;
    // StrictMode mounts, unmounts and remounts. EACH RUN HERE IS A MODEL CALL.
    if (started.current) return;
    started.current = true;

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
           */
          body: JSON.stringify({ entity: 'reading', entityId: reading.id, field: 'body' }),
        });

        /*
         * 204 IS A REAL ANSWER FROM THIS ROUTE, NOT AN EMPTY 200. V2 returns it
         * when the source is already in the viewer's locale -- unreachable here,
         * since `needs` gated the call -- and when the translation produced
         * nothing at all. `res.ok` is TRUE for a 204, so checking only that would
         * leave the screen on a spinner forever.
         */
        if (!res.ok || res.status === 204 || !res.body) {
          setProse({ kind: 'unavailable' });
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

        setProse(resolveStreamed(acc, reading.body, t.locale));
      } catch {
        if (!controller.signal.aborted) setProse({ kind: 'unavailable' });
      }
    })();

    return () => controller.abort();
  }, [needs, cachedTranslation, reading.id, reading.body, t.locale]);

  return (
    <ReadingView
      reading={reading}
      prose={prose}
      /*
       * V7's SECOND MOUNT (VD10). Offered only for a reading a stranger could
       * actually read: `ok` and a body. `/history` deliberately SHOWS `partial`,
       * `failed` and `aborted` rows -- the querent drew those cards -- and none of
       * them is shareable, so the condition here is narrower than the list's on
       * purpose rather than by omission. `createShareLink` refuses the same set
       * server-side, which is what makes this a UI decision rather than the
       * enforcement.
       *
       * IN THE `footer` SLOT, not appended after the component: that is the slot's
       * whole reason for existing, and it keeps the disclaimer the last thing above
       * the share control in every mount.
       */
      footer={
        reading.status === 'ok' && reading.body !== null ? (
          <ShareFooter
            entity="reading"
            entityId={reading.id}
            preview={reading}
            /*
             * **THE SAME `prose` THIS COMPONENT IS RENDERING, and it is what makes
             * the sheet's "exactly what they will see" true rather than nearly
             * true.** Since design A the link pins the locale being read and the
             * public page renders that translation, so a sheet given only
             * `preview` would show `reading.body` -- the Indonesian source --
             * under a link that will show English. `previewReadingView` maps the
             * five states; this mount just has to be honest about which one it is
             * in.
             */
            prose={prose}
            nickname={nickname}
          />
        ) : null
      }
      onCardOpened={(c) =>
        track('draw.card_detail_opened', {
          card_id: c.cardId,
          reversed: c.reversed,
          slot: c.position,
          /*
           * FALSE, AND IT IS NOT A LIE. `during_reading` asks whether the stream
           * was live when the card was opened. In history it never is. Reusing
           * the existing event rather than minting a tenth name keeps "how often
           * does anyone look at a card properly" one query.
           */
          during_reading: false,
        })
      }
    />
  );
}

/**
 * WHAT THE STREAM ACTUALLY DELIVERED, AND THE ONE CASE THE WIRE CANNOT TELL US.
 *
 * `translateStream` **yields the source verbatim on every failure it knows
 * about** — that is V2's deliberate choice, so a viewer sees prose rather than
 * nothing, and it is documented on `TranslateResult.fellBack`. The route then
 * returns it as an ordinary 200, so a fallback and a success are byte-identical
 * on the wire.
 *
 * For `/history/[id]` that would be a direct breach of H3: the English app would
 * show the Indonesian body, arriving through the very path that exists to
 * prevent exactly that. We can detect it exactly and for free, because this
 * component is holding the source — if what came back IS the source, no
 * translation happened.
 *
 * Compared after trimming and nothing else. A translation that happened to equal
 * its source would be a translation into the same language, which the route's
 * own 204 branch and the table's `source_locale <> locale` check both forbid.
 */
function resolveStreamed(
  streamed: string,
  source: string | null,
  target: ReturnType<typeof useT>['locale'],
): ReadingProse {
  const text = streamed.trim();
  if (!text) return { kind: 'unavailable' };
  if (source !== null && text === source.trim()) return { kind: 'unavailable' };
  return { kind: 'translated', locale: target, text: streamed };
}
