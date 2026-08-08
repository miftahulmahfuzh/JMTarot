'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { MAX_CHAT_MESSAGE_LENGTH } from '@/lib/chat/types';
import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './ChatComposer.module.css';

/** 1–4 rows, then it scrolls. Four lines of Cormorant at 17px is about 112px, and
 *  a composer taller than that eats the room it is a composer for. */
const MAX_ROWS_PX = 112;

export type ChatComposerProps = {
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: () => void;
  /** `CHAT_ENABLED=0`. The room still opens; only this box closes (`C-D15`). */
  closed: boolean;
  sending: boolean;
  /** The stub above the box while the querent is replying to a bubble. */
  replyTo: { author: string; text: string } | null;
  onCancelReply: () => void;
  /**
   * **WHERE THE APP SPEAKS** (`F4-13`). A degraded RUN shows nothing; only the two
   * failures the querent caused and can act on get copy, and they render here —
   * outside the message list, so neither can be mistaken for something a reader
   * said. `RefusalNotice` (W7's, verbatim) mounts through `notice`.
   */
  failure: 'send' | 'rateLimit' | 'offline' | null;
  onRetry?: () => void;
  notice?: ReactNode;
  /** F6's staged attachment card, above the box. */
  staged?: ReactNode;
};

/**
 * The box, the Kirim button, and everything the app says out loud.
 *
 * ── IT IS A GRID ROW, NOT `position: fixed`, AND THAT IS THE WHOLE GEOMETRY ─
 *
 * `fixed` positions against the VISUAL viewport on iOS only while the software
 * keyboard is up, and against the LAYOUT viewport the rest of the time — which is
 * why every hand-rolled chat composer on the web ends up either behind the keyboard
 * or floating over the middle of the screen. A grid row inside a shell whose height
 * is the dynamic viewport height is the version that has one behaviour.
 *
 * **This is unverifiable from WSL and is on the loop-6 list.** `CLAUDE.md` already
 * carries the answer sheet's textarea as an open item — *"a textarea with the
 * keyboard up inside a `90dvh` sheet is the geometry WSL cannot answer"* — and this
 * is the same geometry with more at stake, because it is the primary control on the
 * screen.
 *
 * ── ENTER INSERTS A NEWLINE. THE BUTTON SENDS ──────────────────────────────
 *
 * On the phone this app is built for, the Return key on the software keyboard is a
 * newline and nothing else — binding send to it would make every paragraph a
 * misfire. `Ctrl`/`Cmd`+`Enter` sends, for the desk.
 */
export function ChatComposer({
  draft,
  onDraft,
  onSubmit,
  closed,
  sending,
  replyTo,
  onCancelReply,
  failure,
  onRetry,
  notice,
  staged,
}: ChatComposerProps) {
  const t = useT();
  const box = useRef<HTMLTextAreaElement | null>(null);

  /*
   * Grow to fit, up to four rows. The reset to `auto` first is not optional: without
   * it `scrollHeight` only ever reports the current height and the box can grow but
   * never shrink, so deleting a paragraph leaves a four-row box over an empty
   * string.
   */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`;
  }, [draft]);

  const canSend = draft.trim().length > 0 && !closed && !sending;

  return (
    <div className={styles.composer}>
      {notice}

      {failure ? (
        <p className={styles.failure} role="status">
          {failure === 'offline'
            ? t('chat.offline')
            : failure === 'rateLimit'
              ? t('chat.error.rateLimit')
              : t('chat.error.send')}
          {failure === 'send' && onRetry ? (
            <button type="button" className={styles.retry} onClick={onRetry}>
              {t('chat.error.retry')}
            </button>
          ) : null}
        </p>
      ) : null}

      {staged}

      {replyTo ? (
        <div className={styles.replyStub}>
          <span className={styles.replyAuthor}>{replyTo.author}</span>
          <span className={styles.replyText}>{replyTo.text}</span>
          <button
            type="button"
            className={styles.replyCancel}
            aria-label={t('chat.reply.cancel')}
            onClick={onCancelReply}
          >
            ×
          </button>
        </div>
      ) : null}

      <div className={styles.row}>
        <textarea
          ref={box}
          className={styles.box}
          value={draft}
          rows={1}
          /* The server refuses over this and `sanitizeAnswer` rejects rather than
             truncating, so stopping the typist at the ceiling is the honest place. */
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          disabled={closed}
          aria-label={t('chat.composer.label')}
          placeholder={closed ? t('chat.composer.closed') : t('chat.composer.placeholder')}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSend) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <button
          type="button"
          className={styles.send}
          disabled={!canSend}
          onClick={onSubmit}
        >
          {sending ? t('chat.composer.sending') : t('chat.composer.send')}
        </button>
      </div>
    </div>
  );
}
