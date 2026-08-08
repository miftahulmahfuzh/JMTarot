'use client';

/**
 * F6, task 5. *Bahas di grup* — the control that carries a reading into the room.
 *
 * Two mounts: `/history/[id]`'s footer slot, and the finished reading on the draw
 * screen. Both are `[F6-3]`/`[F6-12]`-gated by their host (F6's tasks 6 and 7), not
 * by this component — `attachable()` is a pure predicate with a unit test, and a
 * control that decided for itself whether to render would put that decision in a
 * `.tsx` where `npm test` cannot reach it.
 *
 * ── `[F6-4]` A NAVIGATION, NEVER A POST ─────────────────────────────────────────
 *
 * One `<Link>`. No fetch, no `AbortSignal.timeout`, no addition to F4's asserted fetch
 * count, no second `RefusalNotice` mount. Three separate rules land on that:
 *
 *   - §0.3: no database write on the path of a byte the querent is waiting for;
 *   - `C-D13` puts the moderation gate on `POST /api/chat/message`, so a composer
 *     here would need a refusal state ON THE DRAW SCREEN, which already has its own
 *     for its own question — and the querent would meet two refusal surfaces with
 *     different copy on one page;
 *   - the blog editor's lesson: every client fetch is a timeout somebody has to
 *     choose, bound and assert.
 *
 * **THE COMMENT IS TYPED IN THE CHAT COMPOSER, NOT HERE, AND THAT IS THE PRODUCT
 * DECISION THIS FILE IS SMALL BECAUSE OF** (§3.1). Requirement 7 says it *"feels like
 * attaching an image/file in a chat group"*: you pick the file, it lands in the
 * composer, and you decide whether to caption it. A sheet with a textarea and a
 * *Kirim* button — which `ShareFooter` is sitting right there as a template for —
 * makes the no-text case read as a slip, when *"look at this"* is a perfectly good
 * conversational move that must produce a run.
 *
 * ── `[F6-5]` THE ATTACHMENT IS STAGED IN THE URL ────────────────────────────────
 *
 * `/chat?attach=<readings.id>&from=history|draw`. No `sessionStorage`, no context,
 * no POST-then-redirect. The id is not a secret — it is the address bar of
 * `/history/[id]` — and ownership is re-checked server-side at post time and again at
 * assembly time, always as a `where` predicate (`[F6-6]`). A query param survives a
 * reload and a back button, which `sessionStorage` does not do predictably on iOS,
 * and **loop 5 can read it off the wire**, which is the only loop that answers *"does
 * the UI agree with what it sends"* — the shape of the two worst bugs in this repo.
 */
import Link from 'next/link';

import { useT } from '@/lib/i18n/LocaleProvider';
import styles from './AttachReadingLink.module.css';

type Props = {
  /** `readings.id`. The host has it; this component never resolves it. */
  readingId: string;
  /**
   * Which control was tapped. **A CLOSED TWO-VALUE SET, so it is not free text** —
   * rule 2 of the taxonomy. It rides the URL and the room posts it as `attach_from`,
   * where F1's route puts it on `chat.message_sent`.
   *
   * **`'draw'` AND NOT F6's PLAN's `'reading'`.** F1 owns `events.ts` and folded
   * `chat.attachment_added` into `chat.message_sent.attached_from`, whose union is
   * `'history' | 'draw' | null` — and `POST /api/chat/message`'s zod enum matches it.
   * A plan-spelled `'reading'` would have ridden the URL, failed the route's parse,
   * and 400'd every draw-screen attach: **a value that is only wrong on one of the
   * two surfaces, on the surface a querent reaches most often.** The catalog copy
   * and the analytics union are what the rest of the release reads; the plan's word
   * was the odd one out.
   */
  from: 'history' | 'draw';
};

export function AttachReadingLink({ readingId, from }: Props) {
  const t = useT();

  return (
    <div className={styles.wrap}>
      {/*
        `prefetch={false}`, S3's tile rule: `/chat` is a gated, dynamic page that reads
        `chat_messages`, and prefetching it from every history detail and every
        finished reading puts a database read behind a screen the querent may never
        open.

        A `<Link>` AND NOT A `TrackLink`. No client event fires here (§9, §11.1): a tap
        that navigates and is then abandoned is not an attachment, and counting it
        would put the abandonment in the numerator of the only rate this feature has.
        `chat.attachment_added` is fired by the SERVER, inside the request that minted
        the row — `ShareFooter`'s precedent, in that file's own words.

        No `returnFocusTo`: Safari's not-focusing-a-button trap is about restoring
        focus after a dialog, and this opens no dialog.
      */}
      <Link
        href={`/chat?attach=${readingId}&from=${from}`}
        className={styles.action}
        prefetch={false}
      >
        {t('chat.attach.action')}
      </Link>
      {/*
        **THE HINT NAMES THE THREE READERS, AND IT IS THE DISCLOSURE THAT MAKES THIS
        BUTTON HONEST** rather than decoration. This control sits directly above
        `ShareFooter`'s and looks like it, and `[F6-11]` is the sentence that has to
        exist because of that adjacency: attaching shows a reading to three characters
        who already hold the querent's six onboarding answers; sharing puts it on the
        public internet. The copy is what keeps them apart — `Bahas di grup` names a
        room, `Bagikan` names an act.
      */}
      <p className={styles.hint}>{t('chat.attach.hint')}</p>
    </div>
  );
}
