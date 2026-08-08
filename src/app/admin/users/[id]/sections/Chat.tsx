/**
 * `chat_threads`, `chat_runs` and `chat_messages` for one person. **F7, v0.7.0.**
 *
 * ── COUNTS AND TIMESTAMPS. NO PROSE, NO REVEAL, NO CONTROL (`[R15]`, `[F7-13]`) ──
 *
 * Roadmap Q4 asked whether this section shows message bodies and Miftah ruled **counts
 * and no text.** The argument F7 added, which the roadmap did not have: `A-D16`'s
 * audited one-key-per-request reveal *was built for a thing you read ONE of* — six
 * onboarding answers is at most six audit rows, and a conversation would be two hundred
 * for one act of reading. An audit trail that over-records is honest; one that records
 * two hundred reads for one is noise the operator learns to scroll past.
 *
 * **AND `chat_messages.body` IS PLAINTEXT** (`C-D20`), where
 * `onboarding_answers.answer_text` is AES-256-GCM encrypted at rest. The protection here
 * is that nothing reads it — a property of the code, not of the data — and a reveal
 * component is precisely the code that would change it. `queries/admin/chat.ts` never
 * selects the column, so this file could not render one.
 *
 * ── THE THREAD BLOCK IS THE OPERATIONALLY USEFUL HALF ──────────────────────
 *
 * It answers *"is the throttle set right for this person"* — the same question
 * `answersLastChanged` answers for the Lotus, and the same reason `detail.ts` prefers a
 * query to an events aggregation for it. It contains no text at all.
 *
 * **NO AUDIT ROW IS WRITTEN, BECAUSE NOTHING IS REVEALED.** That matches the existing
 * ruling that the user LIST page has no `resource` value — *"50 audit rows per page load
 * would make the audit panel unreadable"*.
 */
import type { ChatSummaryForAdmin } from '@/lib/db/queries/admin/chat';
import { DETAIL } from '../../copy';
import { DataTable, Empty, Field, Fields, Panel } from './kit';

/** `'2026-08-07T12:04:11Z'` -> `'2026-08-07 12:04:11'`. The page's own convention for a
 *  `timestamptz`, and it stays UTC: this is a row's clock, not a wall clock a person asks
 *  a question about, which is the one case `stamp()` exists for. */
function at(iso: string | null): string {
  return iso === null ? '—' : iso.replace('T', ' ').replace('Z', '').slice(0, 19);
}

export function Chat({ summary }: { summary: ChatSummaryForAdmin }) {
  const c = DETAIL.chat;
  const hasAnything =
    summary.byAuthor.length > 0 || summary.runsByTrigger.length > 0 || summary.thread !== null;

  if (!hasAnything) {
    return (
      <Panel id="obrolan" heading={c.heading} note={c.note}>
        <Empty>{c.noRow}</Empty>
      </Panel>
    );
  }

  return (
    <Panel id="obrolan" heading={c.heading} note={c.note}>
      {summary.byAuthor.length > 0 ? (
        <DataTable
          caption={c.heading}
          columns={[
            { label: c.authorColumns.author },
            { label: c.authorColumns.messages, numeric: true },
            { label: c.authorColumns.firstAt },
            { label: c.authorColumns.lastAt },
          ]}
          rows={summary.byAuthor.map((a) => [a.author, a.messages, at(a.firstAt), at(a.lastAt)])}
        />
      ) : null}

      {summary.runsByTrigger.length > 0 || summary.runsByStatus.length > 0 ? (
        <DataTable
          caption={c.runColumns.key}
          columns={[{ label: c.runColumns.key }, { label: c.runColumns.runs, numeric: true }]}
          /* Triggers and statuses in ONE table rather than two: they are the same rows
             counted two ways, and two three-row tables side by side reads as two facts. */
          rows={[
            ...summary.runsByTrigger.map((r) => [r.trigger, r.runs]),
            ...summary.runsByStatus.map((r) => [r.status, r.runs]),
          ]}
        />
      ) : null}

      {summary.reply.length > 0 ? (
        <DataTable
          caption={c.replyHeading}
          columns={[
            { label: c.replyColumns.trigger },
            { label: c.replyColumns.delivered, numeric: true },
            { label: c.replyColumns.replied, numeric: true },
            { label: c.replyColumns.pending, numeric: true },
          ]}
          rows={summary.reply.map((r) => [r.trigger, r.delivered, r.replied, r.pending])}
        />
      ) : null}

      {summary.thread ? (
        <Fields>
          <Field label={c.lastReadAt} value={at(summary.thread.lastReadAt)} />
          <Field label={c.lastUserMessageAt} value={at(summary.thread.lastUserMessageAt)} />
          <Field label={c.lastReaderMessageAt} value={at(summary.thread.lastReaderMessageAt)} />
          <Field label={c.lastProactiveAt} value={at(summary.thread.lastProactiveAt)} />
          <Field label={c.proactiveCountToday} value={String(summary.thread.proactiveCountToday)} />
          {/* A `'YYYY-MM-DD'` STRING, printed as it is stored. Rendering it through a
              `Date` would put it a day out for anyone in Jakarta between midnight and
              07:00 — which is exactly the window this throttle is about. */}
          <Field label={c.proactiveCountDate} value={summary.thread.proactiveCountDate ?? '—'} />
          <Field
            label={c.utcOffsetMinutes}
            value={
              summary.thread.utcOffsetMinutes === null
                ? '—'
                : String(summary.thread.utcOffsetMinutes)
            }
          />
        </Fields>
      ) : (
        <Empty>{c.neverOpened}</Empty>
      )}
    </Panel>
  );
}
