'use client';

import type { ReactNode } from 'react';

import type { ChatMessageDto } from '@/lib/chat/types';
import type { Quote } from '@/lib/chatSurface';
import { useLocale, useT } from '@/lib/i18n/LocaleProvider';
import { formatTime } from '@/lib/i18n/format';
import { ChatAvatar } from './ChatAvatar';
import styles from './ChatBubble.module.css';

export type ChatBubbleProps = {
  message: ChatMessageDto;
  /** Already resolved by `quoteFor`, so this component makes no lookup. */
  quote: Quote | null;
  /** The reader's name as DATA — English in both locales, like every reader name. */
  authorName: string;
  /** What the quote stub calls the querent, when the quoted message is theirs. */
  youName: string;
  selected: boolean;
  onSelect: () => void;
  onReply: () => void;
  onQuoteTap: (id: string) => void;
  /** F6's compact reading card. **F4 owns the slot; F6 owns everything inside it.** */
  attachment?: ReactNode;
  /** Briefly highlighted because a quote stub pointed here. */
  flashing?: boolean;
  /** The querent's own message, posted and not yet stored. */
  pending?: boolean;
};

/**
 * One bubble. Four shapes, one component, discriminated on `author`.
 *
 * ── `white-space: pre-wrap` AND NOTHING ELSE ───────────────────────────────
 *
 * No markdown, no link detection, no `dangerouslySetInnerHTML`. `A-D10`'s CSP
 * argument and the blog editor's *"there is no `markdown` block kind, no `raw`"*
 * rule land here identically, and harder: a chat bubble is model output **and** text
 * a person typed, and the only safe renderer for either is a text node.
 *
 * ── THE BUBBLE CARRIES `lang`; THE PAGE DOES NOT (`F4-6`, `C-D9`) ──────────
 *
 * `<html lang>` and every piece of chrome follow the VIEWER through `t()`. Each
 * bubble's prose carries `lang={message.locale}`, because a querent may type
 * Indonesian into the English app and the readers mirror what they were asked in.
 *
 * **`ReadingView`'s RULE 4 DOES NOT APPLY AND MUST NOT BE IMPORTED.** There is no
 * translating state, no spinner, no `unavailable`: a foreign-locale bubble renders
 * as written, because `C-D9` says a chat message is never translated. Reaching for
 * `resolveProse`'s shape here puts a querent's own sentence behind a spinner that
 * will never resolve.
 *
 * ── THERE IS NO ERROR BUBBLE IN THIS RELEASE (`C-R7`, `F4-13`) ─────────────
 *
 * A degraded run shows NOTHING. The only failure this component knows about is
 * `pending`, which is the querent's own message not yet acknowledged — never a
 * reader's — and even that is a dimmed bubble rather than a sentence. W4's rule
 * about `[Bacaan terputus…]` never reaching `readings.body` is automatic here: every
 * message IS stored and IS context for the next turn.
 *
 * ── THE REPLY AFFORDANCE IS A CHIP, NOT A GESTURE (F4 §5) ──────────────────
 *
 * Tap the bubble, a 44px `Balas` appears under it. Long-press was refused because it
 * fights iOS's own selection callout and would need `user-select: none` on the one
 * kind of text people copy constantly; swipe-to-reply was refused because a
 * horizontal drag inside a vertical scroller is four feel judgements **that cannot
 * be made in WSL at all.** The chip is a `<button>`: 44px, focusable, named, and
 * loop 5 can click it and read `reply_to_message_id` out of the outgoing POST —
 * which is the question loop 5 exists to answer.
 *
 * **If it reads wrong under a thumb (loop 6), ADD swipe as an accelerator; never
 * replace the chip with it.**
 */
export function ChatBubble({
  message,
  quote,
  authorName,
  youName,
  selected,
  onSelect,
  onReply,
  onQuoteTap,
  attachment,
  flashing = false,
  pending = false,
}: ChatBubbleProps) {
  const t = useT();
  const locale = useLocale();
  const mine = message.author === 'user';

  return (
    <li
      className={[styles.row, mine ? styles.mine : styles.theirs, flashing ? styles.flashing : '']
        .filter(Boolean)
        .join(' ')}
      /* The room scrolls to a quoted bubble by this attribute rather than by a ref
         map: the target is very often a row the list rendered before this one, and a
         ref map would have to be kept in step with pagination. */
      data-message-id={message.id}
    >
      {mine ? null : <ChatAvatar author={message.author} />}

      <div className={styles.column}>
        <div
          className={[styles.bubble, selected ? styles.selected : '', pending ? styles.pending : '']
            .filter(Boolean)
            .join(' ')}
          /*
           * `role="button"` on the bubble rather than an actual `<button>`, because a
           * `<button>` may not contain the quote stub's `<button>` — nested
           * interactive content is invalid HTML and Safari renders it unpredictably.
           * The keyboard path is the chip, which is always in the DOM and reachable
           * by Tab even when it is not visible (see `.chip` in the stylesheet).
           */
          role="button"
          tabIndex={-1}
          aria-pressed={selected}
          onClick={onSelect}
        >
          {/* The querent's own bubble carries no name: it is obviously them, and a
              second `kamu` per bubble is furniture. Reader names are DATA and stay
              English in both locales. */}
          {mine ? null : <div className={styles.name}>{authorName}</div>}

          {quote ? (
            <button
              type="button"
              className={styles.quote}
              onClick={(event) => {
                // The bubble's own `onSelect` sits on an ancestor; without this a tap
                // on the stub would both scroll away AND select the bubble it left.
                event.stopPropagation();
                onQuoteTap(quote.id);
              }}
            >
              <span className={styles.quoteAuthor}>
                {quote.author === 'user' ? youName : quote.author}
              </span>
              <span className={styles.quoteText}>{quote.text}</span>
            </button>
          ) : null}

          {/* F6's slot. F4 owns this box, its inset and its border; **it is not a
              fourth mount of `ReadingView`.** */}
          {attachment ? <div className={styles.attachment}>{attachment}</div> : null}

          {message.body ? (
            <p className={styles.prose} lang={message.locale}>
              {message.body}
            </p>
          ) : null}

          <time className={styles.time} dateTime={message.createdAt}>
            {formatTime(new Date(message.createdAt), locale)}
          </time>
        </div>

        {/*
         * ALWAYS IN THE DOM, VISIBLE ONLY WHEN THE BUBBLE IS SELECTED OR THE CHIP
         * ITSELF HAS FOCUS. Rendering it conditionally would make the only reply
         * affordance in the app unreachable by keyboard and invisible to a screen
         * reader — the same class of mistake as a gesture with no visible control.
         * The hidden state takes no space, so nothing reflows when it appears.
         */}
        <button
          type="button"
          className={`${styles.chip}${selected ? ` ${styles.chipShown}` : ''}`}
          onClick={onReply}
        >
          {t('chat.reply.action')}
        </button>
      </div>
    </li>
  );
}
