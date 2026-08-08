'use client';

/**
 * F6, task 4. A reading carried into the room, drawn as a compact card.
 *
 * ── `[F6-1]` THIS IS NOT A `ReadingView` MOUNT, AND NOTHING MAY MAKE IT ONE ─────
 *
 * `ReadingView` is the one renderer three surfaces mount (VD10) and its header names
 * them: `/history/[id]`, `/s/[slug]`, and the draw screen. **A chat bubble is a
 * fourth, much smaller component**, and the reason is not size:
 *
 *   - it would drag in `Slots`, `CardDetail`, the verdict box, the disclaimer and the
 *     `footer` slot — and `common.disclaimer.long` under every attachment in a
 *     scrolling log is furniture, one tap away on the page this card links to;
 *   - **RULE 4 IS THE FATAL ONE.** `ReadingView` renders the translating state for
 *     any reading whose locale differs from the viewer's unless the caller supplies
 *     `prose` — so a foreign-locale attachment would pulse forever inside a bubble,
 *     which is `C-R7`'s *"there is no error bubble"* arriving as a loading state that
 *     predates the rule.
 *
 * **NOT `Chat*.tsx`,** which F4 owns by glob (roadmap §7). The name is what keeps two
 * workstreams out of one file; F4 MOUNTS this, twice — in the log, and staged above
 * the composer.
 *
 * ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────────────
 *
 * The verdict box (a second styling of `ReadingView`'s answer element is two things
 * that look like verdicts), the choice box, the disclaimer, the slot labels,
 * `CardDetail`, the share control (`[F6-11]`: attaching shows a reading to three
 * characters who already hold the querent's six onboarding answers; sharing puts it
 * on the public internet, and the two must not converge because they are adjacent on
 * screen), and any `prose` state at all.
 *
 * ── THE GONE STATE IS THE CALLER'S, NOT THIS COMPONENT'S ────────────────────────
 *
 * §8: `chat.attachment.gone` is rendered by whoever mounts this when there is no
 * preview to mount — it is the app labelling an empty slot inside the querent's own
 * bubble, and it never reaches a `chat_messages` row a director could point a beat at.
 * A component that takes a nullable preview and renders a placeholder for it would
 * make that decision here, where F4 cannot see it.
 */
import Link from 'next/link';
import { memo } from 'react';

import { CardFace } from './CardFace';
import { cardById } from '@/data/deck';
import { readerById } from '@/data/readers';
import { serviceById } from '@/data/services';
import type { AttachmentPreview } from '@/lib/chat/attachmentView';
import { formatLocalDate } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './ReadingAttachment.module.css';

type Props = {
  preview: AttachmentPreview;
  /**
   * `/history/[id]`, or absent.
   *
   * **ABSENT MEANS NOT A LINK, AND THAT IS THE STAGED CASE.** Above the composer the
   * card is what the querent is about to send, sitting beside a *Lepas lampiran*
   * control; a tap that navigated away from a half-typed message would lose it. In
   * the log it is a link, and the whole card is the target because the parts of it a
   * thumb would aim at — a 44px thumbnail, a date — are too small to be separate ones.
   */
  href?: string;
};

/**
 * `React.memo`, because a chat log re-renders on every arriving bubble and this one
 * draws three images. `AttachmentPreview` is a plain object built once by
 * `toAttachmentPreview`, so the default shallow comparison is the right one as long
 * as the caller does not rebuild it per render — which is why the projection is a
 * pure function of a row rather than something assembled in a component body.
 */
export const ReadingAttachment = memo(function ReadingAttachment({ preview, href }: Props) {
  const t = useT();
  const service = serviceById(preview.serviceId);
  const reader = readerById(preview.readerId);

  /*
   * `ReadingView` and `HistoryItemRow`'s rule: a row naming a reader or a service
   * that no longer exists is a gap in a list, not a crash on a rendered page. In a
   * chat log it would take the whole conversation down with it.
   */
  if (!service || !reader) return null;

  /*
   * The chip renders only when the prose is in a language the viewer did not ask for
   * (§7.1). `lang` alone is what `/s/[slug]` uses, and it is right there and wrong
   * here: THAT page is monolingual in the reading's language, chrome included, so it
   * announces itself. Here the chrome is the viewer's and only two lines are foreign,
   * so `lang` alone is a machine-readable fact with no human signal at all —
   * `PersonaBlock` keeps `account.persona.otherLanguage` for exactly this shape.
   *
   * A CHIP AND NOT A SENTENCE: a bubble is small and an apologetic sentence in one is
   * furniture. Two words is what every chat client puts on a foreign-language quote.
   */
  const foreign = preview.locale !== t.locale;

  const body = (
    <>
      <div className={styles.cards}>
        {/*
          Sorted again here, not trusted. `toAttachmentPreview` already sorted, and a
          renderer that trusts its props is one prop-drilling refactor from drawing
          the future card first.

          `CardFace` at 44x66 is `HistoryItemRow`'s thumbnail, token for token — it
          needs a sized, positioned parent because it is `position: absolute; inset:
          0`, and reversed cards render reversed because an upright thumbnail under a
          reversed draw is the contradiction `cardMeaning()` exists to prevent.

          NO NAMES, NO MEANINGS AND NO PER-CARD TAP TARGETS. `CardFace` draws the
          card's name over the foot of the art at `thumb` size, at 7.6cqw — which is
          3.3px here and reads as texture rather than as text. That is exactly what
          `/history`'s list already renders at exactly this size, so it is the
          established look for a thumbnail row in this app rather than a compromise
          this component invented; changing it would mean a prop on `CardFace`, which
          is not F6's file.
        */}
        {[...preview.cards]
          .sort((a, b) => a.position - b.position)
          .map((c, i) => {
            const card = cardById(c.cardId);
            return card ? (
              <div key={`${c.cardId}-${i}`} className={styles.thumb}>
                <CardFace card={card} reversed={c.reversed} size="thumb" />
              </div>
            ) : null;
          })}
      </div>

      {/*
        The service name follows the VIEWER, because it is chrome. The reader's name
        does not change — reader names stay English in both locales (`## Card data`).
        The date comes from `local_date` with its year: an attachment can be months
        old, and "2 Agustus" with no year in September is a date read wrong out loud.
      */}
      <p className={styles.meta}>
        {service.name[t.locale]}
        {' · '}
        {reader.name}
        {' · '}
        {formatLocalDate(preview.localDate, t.locale, true)}
      </p>

      {foreign ? (
        <span className={styles.chip}>{t(`chat.attachment.language.${preview.locale}`)}</span>
      ) : null}

      {/*
        THE QUESTION CARRIES NO `lang`, AND THAT IS DELIBERATE AGAINST F6's OWN PLAN
        (§7.1, which asks for one on both). `preview.locale` is the language the PROSE
        came out in, and a querent may perfectly well type Indonesian into the English
        app — so labelling their words with the model's language is a claim we cannot
        make. `ReadingView`'s question block carries no `lang` for that reason, and
        CLAUDE.md states the same rule for the choice verdict, in those words: a
        fragment of the question must not claim more than the whole does.

        Quotation marks as literal characters rather than CSS `content`, so the text
        is quoted in the DOM a screen reader reads and not only in the paint.
      */}
      {preview.question ? (
        <p className={styles.question}>{`“${preview.question}”`}</p>
      ) : null}

      {preview.snippet ? (
        <>
          <div className={styles.rule} aria-hidden="true" />
          {/*
            The snippet IS the prose, so this is where `lang` belongs — it is what
            makes a screen reader pronounce it correctly and points the browser's
            translate offer at the right language. **AND IT IS NEVER TRANSLATED
            HERE:** `[F6-10]` — a model call on a render path, on the busiest scroll
            in the release, per bubble, for two lines of text.
          */}
          <p className={styles.snippet} lang={preview.locale}>
            {preview.snippet}
          </p>
        </>
      ) : null}
    </>
  );

  if (!href) return <div className={styles.card}>{body}</div>;

  return (
    <Link
      href={href}
      className={`${styles.card} ${styles.link}`}
      /*
       * The label, because the accessible name of this link would otherwise be three
       * card names, a service, a reader, a date, a question and two lines of prose.
       * `prefetch={false}` for S3's tile reason at one remove: the log can hold many
       * of these, and `/history/[id]` is a gated dynamic page that reads the database.
       */
      aria-label={t('chat.attachment.open')}
      prefetch={false}
    >
      {body}
    </Link>
  );
});
