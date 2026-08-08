'use client';

/**
 * F6, the second half. The reading sitting in the composer, waiting to be sent.
 *
 * ── IT IS THE PHOTO IN THE COMPOSER, AND THAT IS THE WHOLE PRODUCT DECISION ─────
 *
 * §3.1 argues it at length and the alternative is the one a session will reach for: a
 * sheet on `/history/[id]` with a textarea and a *Kirim* button, with `ShareFooter`
 * sitting right there as a template. Requirement 7 says it *"feels like attaching an
 * image/file in a chat group"* — **you pick the file, the file lands in the composer,
 * and you decide whether to caption it.** A modal that asks *"add a comment?"* before
 * you have seen the room is a form, not a chat, and it makes the no-text case read as
 * a slip when *"look at this"* is a perfectly good conversational move.
 *
 * ── WHY IT IS ITS OWN FILE ──────────────────────────────────────────────────────
 *
 * `ChatComposer` owns the box and F4 owns `Chat*.tsx` by glob (roadmap §7); this is
 * F6's, mounted through the composer's `staged` slot, which F4 declared and named for
 * F6 in those words. The same boundary `ReadingAttachment` keeps in the log — **F4
 * owns the slot, F6 owns everything inside it.**
 *
 * ── NO `href` ON THE CARD, AND IT IS NOT AN OVERSIGHT ───────────────────────────
 *
 * In the log the whole card is a link to `/history/[id]`. Here it must not be: a tap
 * that navigated away from a half-typed message would lose the message. That is why
 * `ReadingAttachment`'s `href` is optional rather than required, and this is the caller
 * the option exists for.
 */
import { ReadingAttachment } from './ReadingAttachment';
import type { AttachmentPreview } from '@/lib/chat/attachmentView';
import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './StagedAttachment.module.css';

type Props = {
  preview: AttachmentPreview;
  /** *Lepas lampiran*. Clears the staging; posts nothing and asks nothing. */
  onRemove: () => void;
};

export function StagedAttachment({ preview, onRemove }: Props) {
  const t = useT();

  return (
    <div className={styles.staged}>
      <div className={styles.head}>
        <span className={styles.label}>{t('chat.attach.staged')}</span>
        {/*
          A NAMED BUTTON AND NOT A BARE `×`. The reply stub above it can afford a
          glyph because the stub itself quotes the message it cancels; this control
          removes a card whose own affordances say nothing about being removable, and
          it is the only way back out of a staging the querent may have reached by
          tapping the wrong reading. 44px minimum, like every control in this room —
          `PublicShare`'s 36px is a known defect and not a precedent.
        */}
        <button type="button" className={styles.remove} onClick={onRemove}>
          {t('chat.attach.remove')}
        </button>
      </div>
      <ReadingAttachment preview={preview} />
    </div>
  );
}
