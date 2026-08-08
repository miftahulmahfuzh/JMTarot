import type { Metadata } from 'next';
import Link from 'next/link';

import { ChatAvatar } from '@/components/ChatAvatar';
import { READERS } from '@/data/readers';
import { requireUser } from '@/lib/auth/server';
import {
  attachable,
  toAttachmentPreview,
  type StagedReading,
} from '@/lib/chat/attachmentView';
import { logChatFailure } from '@/lib/chat/log';
import { db } from '@/lib/db/client';
import { readingWithCards } from '@/lib/db/queries/history';
import { getT } from '@/lib/i18n/t';
import { ChatRoom } from './ChatRoom';
import styles from './page.module.css';

/**
 * `/chat` — the room. Three readers and the querent, and it keeps going when nobody
 * is looking at it.
 *
 * ── THIS SERVER COMPONENT READS NOTHING **UNLESS `?attach=` IS THERE** (F6) ─
 *
 * The paragraph below is unchanged for the room itself and one clause is now added to
 * it: F6's two controls stage a reading in the URL (`[F6-5]`), and **only when that
 * parameter is present** does this component make one primary-key read. Absent is the
 * common case — every open through the corner button, every direct visit — and it
 * costs nothing.
 *
 * **THE PARAMETER IS RESOLVED HERE AND NOT IN THE BROWSER**, because the alternative
 * is a sixth fetch on a screen whose fetch count is asserted at five (`F4-11`), and
 * because ownership has to be a `where` predicate (`[F6-6]`) rather than something the
 * client asks nicely for.
 *
 * ── THIS SERVER COMPONENT READS NOTHING ELSE, AND THAT IS `H6` ONE RELEASE ON ───
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

/**
 * Where the querent came in from, decided on the SERVER and handed to the room.
 *
 * **`'attach'` IS THE PRESENCE OF `?attach=`, NOT A LITERAL `?from=attach`**, and that
 * is a correction to what F4 wrote and F6's plan implied. There is one `from` key in
 * the URL and two features wanted it: `ChatButton` sends `from=button`, and F6's
 * controls send `from=history|draw` because that value is *also* what gets posted as
 * `attach_from` (F1's `chat.message_sent` union). Read as a literal, an attach-initiated
 * open would have reported `from: 'direct'` — **the one entry point `chat.opened.from`
 * exists to distinguish, silently collapsed into the default.**
 *
 * Deriving it from the presence of the id is also the more honest reading: the querent
 * came in carrying a reading, and that fact is the id itself rather than a second
 * parameter that could disagree with it.
 */
function entryOf(params: Record<string, string | string[] | undefined>): 'button' | 'direct' | 'attach' {
  if (typeof params.attach === 'string' && params.attach.length > 0) return 'attach';
  return params.from === 'button' ? 'button' : 'direct';
}

/**
 * Which control staged this reading, for `chat.message_sent.attached_from`.
 *
 * **NARROWED HERE RATHER THAN TRUSTED AT THE POST.** The value rides a URL a person
 * can type, and F1's zod enum would 400 the whole message over a bad one — so an
 * unrecognised spelling becomes `null`, which is a legal value of the prop and means
 * *"stored, and we do not know which button"*. **Losing a dimension of one analytics
 * prop is not worth refusing to deliver the querent's message.**
 */
function attachFromOf(
  params: Record<string, string | string[] | undefined>,
): 'history' | 'draw' | null {
  return params.from === 'history' || params.from === 'draw' ? params.from : null;
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getT();
  const params = await searchParams;

  /*
   * **ONE READ, AND ONLY WHEN THE PARAMETER IS THERE.** `readingWithCards` is
   * `/history/[id]`'s own function: it takes the handle first, validates the uuid
   * shape, filters `blocked`, and makes ownership a `where` predicate — *a reading
   * that is not yours and a reading that does not exist both 404, and they are
   * indistinguishable on purpose* (`[F6-6]`). So an id typed into the address bar
   * resolves to null and the room opens with nothing staged.
   *
   * **`attachable()` FILTERS AGAIN HERE, AND IT IS THE UI PREDICATE RATHER THAN THE
   * SERVER'S** (`[F6-12]`): a `partial` reading may be POSTED — the draw screen cannot
   * know its own status — but nothing should stage a body that stops mid-sentence when
   * the status is right here in the row. The route's guard is the wider one and stays
   * wider on purpose.
   *
   * **A NULL IS IGNORED ENTIRELY: no toast, no message** (§8). The room's version of a
   * missing attachment is that there was never an attachment.
   *
   * **AND A FAILED READ IS A MISS, NOT AN ERROR.** V2's cache rule, applied to a
   * staging: the room is the product and a database hiccup must not 500 the screen the
   * querent asked for. It logs through `logChatFailure` — never the driver error whole,
   * because a postgres error quotes its bound parameters and `readings.question` is one
   * of them.
   */
  let staged: StagedReading | null = null;
  const attach = typeof params.attach === 'string' ? params.attach : null;
  if (attach) {
    const auth = await requireUser();
    if (auth.ok) {
      try {
        const reading = await readingWithCards(db, auth.user.id, attach);
        if (reading && attachable(reading)) {
          staged = { preview: toAttachmentPreview(reading), from: attachFromOf(params) };
        }
      } catch (err) {
        logChatFailure('chat.page.attach', err, { user: auth.user.id });
      }
    }
  }

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

      <ChatRoom staged={staged} entry={entryOf(params)} />
    </main>
  );
}
