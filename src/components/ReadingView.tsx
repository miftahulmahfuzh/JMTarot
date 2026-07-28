'use client';

/**
 * ONE RENDERER, THREE MOUNTS (roadmap VD10). History detail, V7's public share
 * page, and -- when someone gets to it -- the post-reading screen.
 *
 * FOUR RULES, AND EACH ONE IS THERE BECAUSE OF THE PUBLIC MOUNT:
 *
 *   1. NO SESSION. No `useViewer()`, no `@/lib/auth/**`, no assumption that a
 *      cookie exists. `/s/[slug]` is in `isPublic()`, so `requireUser()` never
 *      runs above it and a component reaching for a viewer there throws for a
 *      stranger and works for everyone on the team.
 *   2. NO FETCH. The prose is handed in. The share page cannot call V2's
 *      authenticated `/api/translate`, and a component that fetched would force
 *      either an open translation endpoint or a second renderer. A second
 *      renderer is the thing VD10 exists to prevent.
 *   3. NO `@/lib/db/**` IMPORT, NOT EVEN `import type`.
 *      `src/lib/clientBoundary.test.ts` matches `from '...'` regardless of the
 *      `type` keyword. `ReadingStatus` therefore lives in `@/data/types` and the
 *      row shapes in `@/lib/history/types`.
 *   4. IT NEVER RENDERS `reading.body` IN A LANGUAGE THE VIEWER IS NOT READING.
 *      See `resolveProse`. This is the component's INVARIANT, not the caller's
 *      discipline: a caller who forgets `prose` gets the translating state, not
 *      an Indonesian paragraph inside an English app.
 *
 * **V7 ADDED A FIFTH PROSE STATE, `as-written`, AND RULE 4 IS UNCHANGED BY IT.**
 * The public page renders foreign-language prose verbatim on purpose, because it
 * cannot translate and must not generate; the caller has to NAME that, and an
 * omitted `prose` still yields the spinner. `resolveProse`'s truth table did not
 * move a line -- including the test asserting that an explicit `original` is not a
 * way around rule 4. See `ReadingProse`.
 *
 * READ-ONLY (VD14). No fan, no picking, no reshuffle, no reset, and `CardDetail`
 * is mounted WITHOUT `onReturn`, which is what removes the return-to-deck button.
 * Reconstruct, never re-run: regenerating would cost a model call and produce
 * different prose, so the querent's memory of the reading and the app's would
 * disagree -- the exact failure the memory features exist to avoid.
 *
 * DO NOT ADD A `readOnly` PROP. There is no other mode, and a boolean would
 * invite a future `readOnly={false}`.
 */
import { useState, type ReactNode } from 'react';
import { CardDetail } from './CardDetail';
import { Slots } from './Slots';
import { cardById } from '@/data/deck';
import { readerById } from '@/data/readers';
import { serviceById, slotLabels } from '@/data/services';
import type { Draw, Locale } from '@/data/types';
import type { ReadingDetail } from '@/lib/history/types';
import { formatLocalDate, formatTime } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './ReadingView.module.css';

/**
 * One card as `reading_cards` stores it. IDS, NEVER RESOLVED OBJECTS (H1).
 *
 * `cards.json` and `readers.json` are already in the client bundle. Passing three
 * full `Card` objects through the RSC payload ships their keywords and both
 * locales' meanings twice -- once in the bundle, once in the flight data -- to
 * render three images. Ids are also exactly what the table stores, so the
 * component's input shape and the row shape cannot drift.
 */
export type ReadingViewCard = {
  /** 0..21. */
  cardId: number;
  reversed: boolean;
  /** 0-based slot in the spread. Rendered in this order, not array order. */
  position: number;
};

/**
 * A completed reading, flattened for rendering. EVERY FIELD IS JSON-SAFE.
 *
 * Declared as `ReadingDetail` rather than restated, so the query layer's shape
 * and the renderer's cannot drift -- `ReadingView.test.tsx` carries the
 * assignability assertion in the other direction as well.
 *
 * `localDate` IS A STRING AND `createdAtIso` IS A STRING, for two different
 * reasons that are both worth knowing:
 *
 *   - `localDate` is the QUERENT'S calendar day (roadmap §7). A `Date` renders in
 *     the server's zone and is a day out for anyone in Jakarta between midnight
 *     and 07:00.
 *   - `createdAtIso` is a real instant and a `Date` would be correct -- but this
 *     object arrives over JSON from `/api/history` on one path and out of an RSC
 *     payload on the other, and one shape for both paths is worth more than the
 *     type. Parse it at the point of formatting.
 */
export type ReadingViewData = ReadingDetail;

/**
 * What prose to show, and whether more is coming.
 *
 * A UNION AND NOT THREE BOOLEANS: "translated but also still streaming" and
 * "original but unavailable" are states that cannot be represented, which is the
 * point.
 */
export type ReadingProse =
  | { kind: 'original' }
  /**
   * **V7. "THE PROSE STAYS IN ITS OWN LANGUAGE, AND I HAVE DECIDED THAT."**
   *
   * A FOURTH MEMBER RATHER THAN LETTING `original` MEAN IT, and the distinction is
   * the whole reason this exists. `resolveProse` deliberately treats an explicit
   * `{ kind: 'original' }` exactly like an omitted prop — there is a test named for
   * it — because rule 4's value is that a caller who FORGOT gets a spinner rather
   * than an Indonesian paragraph in an English app, and a caller who forgot and a
   * caller who typed `original` are indistinguishable in intent.
   *
   * V7's public page needs the opposite outcome and needs it deliberately:
   * `/s/[slug]` renders `readings.body` verbatim in `readings.locale` and NEVER
   * translates, because VD7 makes the prose immutable, VD8 forbids the public
   * route generating anything, and reading an existing `translations` row would
   * make the share sheet's "this is exactly what they will see" preview a lie.
   * Reconciliation §5.5 calls that legitimate — *"deciding not to translate is a
   * decision"* — and this member is what a decision looks like in the type.
   *
   * Rule 4 is not weakened: the only way to reach this branch is to name it, and
   * `resolveProse`'s truth table is unchanged (it already returns any supplied
   * non-`original` prose). The honesty the viewer needs is restored by **the `lang`
   * attribute below, which since 2026-07-28 is the WHOLE of it on `/s/`** — it used to
   * be paired with `share.public.otherLanguage` on a mismatch, and that notice is
   * deleted (see `src/app/s/[slug]/page.tsx`'s header). `lang` is what points a screen
   * reader and the browser's own translate offer at the right language, so this branch
   * MUST keep setting it. `PersonaBlock` still renders a notice of its own, for a
   * reason that is specific to the untranslated persona rather than general.
   *
   * **DO NOT USE `{ kind: 'translated' }` FOR THIS.** It renders identically and
   * would record in the type that a translation happened when none did, which is
   * the sort of near-miss that produces the next bug.
   */
  | { kind: 'as-written' }
  | { kind: 'translating'; text: string }
  | { kind: 'translated'; locale: Locale; text: string }
  | { kind: 'unavailable' };

export type ReadingViewProps = {
  reading: ReadingViewData;
  /**
   * Defaults to `{ kind: 'original' }`. Omitting it when
   * `reading.locale !== viewer locale` yields the TRANSLATING state, never the
   * original -- that is the invariant, not a caller courtesy. See rule 4.
   */
  prose?: ReadingProse;
  /**
   * Rendered under the disclaimer. V7's `ShareFooter` and `TryItYourself` go
   * here; `/history` passes nothing.
   *
   * A `ReactNode` rather than a boolean flag, so this component never learns
   * that sharing exists -- and so the disclaimer stays the last thing above the
   * CTA in all three mounts. Do not wrap `ReadingView` in a container that
   * appends a footer after it.
   */
  footer?: ReactNode;
  /**
   * Fires when the card-detail overlay opens. Both mounts want an event and the
   * two event names differ, so the name is the caller's to choose. Optional, so
   * a server component can mount the whole thing with no callback at all.
   */
  onCardOpened?: (card: ReadingViewCard) => void;
};

/**
 * RULE 4, IN ONE FUNCTION. Read it before changing anything here.
 *
 * The ORDER of the branches is the whole contract:
 *
 *   1. No stored body at all -> `unavailable`, whatever the caller said. A
 *      `failed` reading has nothing to translate, and asking V2 to translate null
 *      is a request that can only fail -- so a caller who optimistically passed
 *      `translated` for a row with no prose still gets the honest answer.
 *   2. The caller supplied a translation (or a spinner, or a refusal) -> use it.
 *   3. The prose language matches the viewer -> the original.
 *   4. Otherwise -> `translating`, NEVER the original. A caller who forgot gets a
 *      spinner, not an Indonesian paragraph in an English app.
 *
 * Exported for its own test: this is the part with a truth table, and it should
 * not need a DOM to check.
 */
export function resolveProse(
  reading: Pick<ReadingViewData, 'body' | 'locale'>,
  prose: ReadingProse | undefined,
  viewer: Locale,
): ReadingProse {
  if (reading.body === null || reading.body.trim() === '') return { kind: 'unavailable' };
  if (prose && prose.kind !== 'original') return prose;
  if (reading.locale === viewer) return { kind: 'original' };
  return { kind: 'translating', text: '' };
}

export function ReadingView({ reading, prose, footer, onCardOpened }: ReadingViewProps) {
  const t = useT();
  /** Index into the SORTED cards of the open overlay, if any. */
  const [detail, setDetail] = useState<number | null>(null);

  const reader = readerById(reading.readerId);
  const service = serviceById(reading.serviceId);
  /*
   * A reader or service id that no longer exists is a 404's worth of missing
   * data, not a crash. It can only happen if someone removes a reader while rows
   * referencing it are still in the table, and rendering nothing beats throwing
   * inside a page that has already sent its headers.
   */
  if (!reader || !service) return null;

  const labels = slotLabels(service, reader, t.locale);
  /*
   * SORTED BY `position`, NOT BY ARRAY ORDER. The query orders by position and so
   * does the API, but this object also arrives from V7's resolver and from a
   * future post-reading mount, and a spread rendered in insert order is the quiet
   * version of the bug that once showed one hand and read another.
   */
  const ordered = [...reading.cards].sort((a, b) => a.position - b.position);
  /*
   * A SPARSE ARRAY, ASSIGNED BY INDEX, AND NOT `flatMap`. An unknown card id --
   * only reachable if the deck ever shrinks under rows that reference it -- must
   * leave a HOLE at its own slot. `flatMap` or a `push` loop would compact the
   * array instead, and `Slots` reads `picks[i]`, so every later card would slide
   * one slot to the left: the third card rendered under the second slot's label,
   * with nothing on screen looking wrong. That is the same class of failure the
   * sort above exists to prevent, and it is the one the harness exists to catch.
   */
  const draws: Draw[] = [];
  ordered.forEach((c, i) => {
    const card = cardById(c.cardId);
    if (card) draws[i] = { card, reversed: c.reversed };
  });
  // `Slots` maps over `labels`, so the array must be at least as long as the
  // spread even when the last card is the missing one.
  draws.length = ordered.length;

  const shown = resolveProse(reading, prose, t.locale);
  const openCard = detail !== null ? ordered[detail] : undefined;
  const openDraw = detail !== null ? draws[detail] : undefined;

  return (
    <article className={styles.view}>
      <header className={styles.head}>
        <h1 className={styles.service}>{service.name[t.locale]}</h1>
        <p className={styles.meta}>
          {reader.name}
          {' · '}
          {formatLocalDate(reading.localDate, t.locale, true)}
          {' · '}
          {formatTime(new Date(reading.createdAtIso), t.locale)}
        </p>
      </header>

      {reading.question ? (
        <div className={styles.questionBlock}>
          <div className={styles.questionLabel}>{t('history.detail.question')}</div>
          {/*
            RENDERED AS TEXT, NEVER AS AN INPUT. An editable field here would
            imply the reading could be re-asked, which VD14 says it cannot.
          */}
          <p className={styles.question}>{reading.question}</p>
        </div>
      ) : null}

      {/*
        `showFaces` AND NO `boxRefs`. The fan is what normally animates a card
        into a slot; there is no fan here, so the slot has to draw the face itself
        -- the same branch the reduced-motion path already uses.

        `onCardTap` puts a full-bleed button inside each filled box. See
        `Slots.module.css`'s `.tap`: it coincides with the box by construction
        rather than by two copies of the same geometry agreeing.
      */}
      <Slots
        labels={labels}
        picks={draws}
        showFaces
        onCardTap={(i) => {
          setDetail(i);
          const c = ordered[i];
          if (c) onCardOpened?.(c);
        }}
        tapLabel={(i) => {
          const draw = draws[i];
          return draw
            ? t('draw.card.aria.picked', { slot: i + 1, name: draw.card.name })
            : String(i + 1);
        }}
      />

      {/*
        H4. FROM `readings.verdict`, THROUGH THE CATALOG, NEVER FROM THE PROSE.
        `effectiveYesNo()` decided this in code at draw time and it is the one
        fact about a yes/no reading that survives translation untouched -- a
        translated body's first word is whatever the translator produced.
      */}
      {reading.verdict ? (
        <div className={styles.verdict}>{t(`reading.verdict.${reading.verdict}`)}</div>
      ) : null}

      <section
        className={styles.prose}
        aria-live={shown.kind === 'translating' ? 'polite' : 'off'}
      >
        {shown.kind === 'original' ? <p className={styles.body}>{reading.body}</p> : null}

        {/*
          V7's public mount. THE SAME TEXT AS `original`, WITH `lang` ON IT --
          which is the only difference and is the point: this branch is only ever
          reached when the caller has decided to show prose the viewer does not
          read, so the attribute is what makes a screen reader pronounce it
          correctly and what points the browser's translate offer at the right
          language. `original` needs no `lang` because it agrees with the document.
        */}
        {shown.kind === 'as-written' ? (
          <p className={styles.body} lang={reading.locale}>
            {reading.body}
          </p>
        ) : null}

        {shown.kind === 'translated' ? (
          <p className={styles.body} lang={shown.locale}>
            {shown.text}
          </p>
        ) : null}

        {shown.kind === 'translating' ? (
          <>
            {/*
              The same pulsing eyebrow the reading itself uses while it waits. A
              translation takes about as long as a short generation, and this
              screen has to hold for it without looking hung -- the argument in
              `ReadingPanel.module.css` about 2.7s/5.4s/11.6s applies unchanged.
            */}
            {shown.text ? null : <div className={styles.waiting}>{t('history.translating')}</div>}
            {shown.text ? <p className={styles.body}>{shown.text}</p> : null}
          </>
        ) : null}

        {shown.kind === 'unavailable' ? (
          <p className={styles.absent}>{t('history.detail.noBody')}</p>
        ) : null}
      </section>

      <p className={styles.disclaimer}>{t('common.disclaimer.long')}</p>

      {footer}

      {openDraw && openCard ? (
        <CardDetail
          draw={openDraw}
          position={labels[openCard.position] ?? labels[0]}
          onClose={() => setDetail(null)}
          /*
            NO `onReturn`. VD14 in one omitted prop: the draw is history and
            cannot be changed. `CardDetail` renders no button when it is absent.
          */
        />
      ) : null}
    </article>
  );
}
