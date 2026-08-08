'use client';

import type { ChatAuthor } from '@/lib/chat/types';
import { LotusMark } from './LotusMark';
import styles from './ChatAvatar.module.css';

/**
 * The circle beside a bubble: a reader's face, or the querent's lotus (`C-D16`).
 *
 * ── THE READERS ARE PHOTOGRAPHS AND THE QUERENT IS A GLYPH ─────────────────
 *
 * That asymmetry is the point. The three readers are authored characters with
 * portraits already in this repo; the querent is a person about whom this app
 * deliberately holds no picture — `AccountButton`'s header carries the full
 * argument, and `LotusMark`'s repeats it: `picture` was removed from the session
 * token on purpose, and a lettered circle reads as Gmail.
 *
 * ── A PLAIN `<img>`, NOT `next/image` ──────────────────────────────────────
 *
 * `CardFace`'s reason exactly: these are already-optimized WebP generated at
 * precisely the size they are drawn at, so the optimizer has nothing to improve and
 * would add a serverless invocation per face. **And here it would also cost the
 * cache header**: `/readers/*` carries its own `max-age=86400,
 * stale-while-revalidate=604800` (`F4-18`), which `/_next/image` would replace with
 * its own — the header and the file would stop being the same decision.
 *
 * ── DECORATIVE, ALWAYS ─────────────────────────────────────────────────────
 *
 * `alt=""` and `aria-hidden`: every bubble this sits beside already names its author
 * in text, and a screen reader reading *"Thessaly"* twice per bubble is the same
 * mistake `LotusMark` avoids inside a labelled button.
 */
export function ChatAvatar({ author, size = 'bubble' }: { author: ChatAuthor; size?: 'bubble' | 'header' }) {
  const className = `${styles.avatar} ${size === 'header' ? styles.header : styles.bubble}`;

  if (author === 'user') {
    return (
      <span className={`${className} ${styles.lotus}`} aria-hidden="true">
        <LotusMark size="avatar" />
      </span>
    );
  }

  return (
    <img
      /* eslint-disable-next-line @next/next/no-img-element -- see the header:
         already-optimized 112px WebP with its own cache-control entry, which
         next/image would replace with the optimizer's. */
      className={className}
      src={`/readers/${author}.webp`}
      alt=""
      aria-hidden="true"
      width={112}
      height={112}
      decoding="async"
      draggable={false}
    />
  );
}
