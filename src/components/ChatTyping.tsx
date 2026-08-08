'use client';

import type { ReaderId } from '@/data/types';
import { useT } from '@/lib/i18n/LocaleProvider';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import { ChatAvatar } from './ChatAvatar';
import styles from './ChatTyping.module.css';

/**
 * *"Thessaly lagi ngetik…"* — the pause between one bubble and the next.
 *
 * ── IT IS A ROW IN THE LIST, NOT AN OVERLAY (F4 §2.2) ──────────────────────
 *
 * If it floated, the anchoring rule would not see the list grow when it appears, and
 * the querent would be pushed by a bubble they never saw coming. Being the last row
 * means *"was I at the bottom"* is answered about a list that already contains it.
 *
 * ── THE DELAY IS THE SERVER'S; THIS IS ONLY THE DRAWING (`C-R4`, seam S3) ──
 *
 * F3 computes `delayMs`, F1 returns it in `AdvanceReply.next`, F4 waits it out.
 * **Under `prefers-reduced-motion` the dots do not animate — and the delay still
 * applies** (`F4-7`), because the inter-turn beat is conversational pacing rather
 * than decoration. Somebody who folds the delay into the animation gives a
 * reduced-motion querent three bubbles at once.
 *
 * `usePrefersReducedMotion()` and not a media query, for that hook's own reason: the
 * reduced-motion path renders a DIFFERENT thing (a naming line at full opacity, no
 * dots), and CSS cannot swap a component.
 *
 * ── `aria-live="polite"` ───────────────────────────────────────────────────
 *
 * A notification about something that is ABOUT to happen, which is exactly the case
 * `FrequencyLine`'s *"not `aria-live`"* comment carves out: that paragraph is
 * ambient and announcing it would be the accessibility equivalent of a callback tic.
 * This one tells a querent who cannot see the dots that the room is not stuck.
 */
export function ChatTyping({ reader }: { reader: ReaderId }) {
  const t = useT();
  const reduce = usePrefersReducedMotion();
  // Reader names are DATA and stay English in both locales (`## Localization`).
  const name = reader.charAt(0).toUpperCase() + reader.slice(1);

  return (
    <li className={styles.row} aria-live="polite" aria-label={t('chat.typing.aria', { name })}>
      <ChatAvatar author={reader} />
      <div className={styles.body}>
        {reduce ? null : (
          <span className={styles.dots} aria-hidden="true">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </span>
        )}
        <span className={styles.label}>{t('chat.typing.reader', { name })}</span>
      </div>
    </li>
  );
}
