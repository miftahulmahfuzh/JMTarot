import type { Metadata } from 'next';
import Link from 'next/link';

import { ChatAvatar } from '@/components/ChatAvatar';
import { READERS } from '@/data/readers';
import { getT } from '@/lib/i18n/t';
import { ChatRoom } from './ChatRoom';
import styles from './page.module.css';

/**
 * `/chat` — the room. Three readers and the querent, and it keeps going when nobody
 * is looking at it.
 *
 * ── THIS SERVER COMPONENT READS NOTHING, AND THAT IS `H6` ONE RELEASE ON ───
 *
 * `/history`'s header carries the argument and it is stronger here: **the default
 * day separator is the QUERENT's calendar day, and the server cannot compute it.**
 * `toISOString()` rolls over at 07:00 in Jakarta, so a server-rendered *"Hari ini"*
 * would be a day out for a third of every Jakarta evening — the exact bug
 * `local_date` exists to prevent, in a page's initial state.
 *
 * The messages are a client fetch for the same reason plus one more: a room is not
 * the row, it is a paginated log that grows while you are looking at it, and roadmap
 * §0.3 forbids a database read on the render path of a page that then has to
 * subscribe to changes anyway.
 *
 * ── GATED, PRIVATE, AND `isPublic()` MUST NEVER LEARN IT (`C-D12`, `F4-1`) ─
 *
 * `CLAUDE.md`'s sentence about `/history`, with a stronger reason: **this room
 * contains a person's six onboarding answers spoken aloud by three characters**
 * (`C-D8`). `/chat` is not in `isPublic()`, is inside the middleware matcher,
 * carries `noindex`, emits no canonical and no `hreflang`, and appears in
 * `SITEMAP_PATHS` nowhere.
 *
 * **And `/en/chat` 404s** — contract `G2`: `isPublic()`'s content clause strips
 * `/en/` and the other clauses must not, so `/en/chat` reaches `decide()` spelled as
 * the request spelled it and matches nothing. `gate.test.ts` already asserts both.
 *
 * ── NO `ChatButton` HERE ───────────────────────────────────────────────────
 *
 * A badge on the page you are already looking at is a control pointing at itself.
 * `PublicShell`'s deleted `LINKS` table is the precedent, and
 * `chatSurface.test.ts` names `app/chat/` in its denylist.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export const runtime = 'nodejs';

export default async function ChatPage() {
  const t = await getT();

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          {t('chat.back')}
        </Link>

        <div className={styles.who}>
          <div className={styles.faces} aria-hidden="true">
            {READERS.map((reader) => (
              <ChatAvatar key={reader.id} author={reader.id} size="header" />
            ))}
          </div>
          <div className={styles.naming}>
            <h1 className={styles.title}>{t('chat.title')}</h1>
            <p className={styles.hint}>{t('chat.hint')}</p>
            {/*
              THE EXISTING DISCLAIMER, NOT A SECOND ONE. `SignInForm`'s consent-line
              rule: one owner, because a second copy of a sentence is how two
              surfaces end up making slightly different promises — and the room is
              where a person is most likely to forget this is entertainment.
            */}
            <p className={styles.disclaimer}>{t('common.disclaimer.short')}</p>
          </div>
        </div>
      </header>

      <ChatRoom />
    </main>
  );
}
