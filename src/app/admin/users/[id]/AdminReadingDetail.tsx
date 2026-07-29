/**
 * One reading, rendered by A5's own component. **NOT `ReadingView`** (A5-21, R27, §11.5).
 * v0.5.0 / A5, task 13.
 *
 * ── WHY NOT MOUNT THE SHARED RENDERER ───────────────────────────────────────
 *
 * `ReadingView`'s header says *"ONE RENDERER, THREE MOUNTS"* and its four rules are each
 * justified by the public mount. Four reasons, and **the second is the binding one:**
 *
 *  1. Mounting it here makes a documented invariant list wrong in its first line, and the fix
 *     would be editing a component whose fences were written surface by surface.
 *  2. **What an admin page must show is a superset that would have to become
 *     `ReadingViewProps`** — `status`, `model`, `prompt_version`, tokens, `latency_ms`,
 *     `session_id`, `has_gist`, `shared_at`, the per-reading `llm_calls` rollup, `local_date`
 *     beside `created_at`. **Adding any of those to the shared component puts operator-only
 *     fields on the component that renders `/s/<slug>` to strangers**, and a props type
 *     carrying `session_id` is one careless spread away from a public RSC payload. That is the
 *     VD8 hazard shape, which is why this is not a taste question.
 *  3. **`ReadingView` never receives a `blocked` reading and A5 must show them** (A5-22). All
 *     three of its callers filter `status <> 'blocked'`; a blocked row has no `reading_cards`,
 *     so `Slots` would render three empty boxes under slot labels — the component being handed
 *     input no caller was ever supposed to hand it.
 *  4. It renders everything through `useT()`, so an operator with `locale = 'en'` would read an
 *     English panel inside an Indonesian dashboard (A-D12). The weakest of the four, and stated
 *     as such: the catalog is available on `/admin` because `LocaleProvider` is in the root
 *     layout.
 *
 * ── THE TWO RULES WORTH KEEPING, KEPT ──────────────────────────────────────
 *
 * **`lang` ON THE BODY, NONE ON `choice`.** The body's language is `reading.locale` — what the
 * prose came out in. The choice is a slice of the *question*, which the querent may have typed
 * in Indonesian into the English app, so it carries no `lang` and matches the question block.
 * (The body itself is behind the audited reveal, so `AdminReveal` carries the `lang`.)
 *
 * **CARDS ARE ASSIGNED INTO A SPARSE ARRAY BY `position`.** `flatMap` compacts and a renderer
 * reads `picks[i]`, so a missing middle card lands the third under the second slot's label with
 * nothing on screen looking wrong. A hole stays a hole.
 *
 * This is a SERVER component — the plan's file map said `'use client'`, and it does not need to
 * be: nothing here is stateful, and the one interactive part is `AdminReveal`, which is its own
 * client boundary. A server component is the smaller bundle and the smaller fence.
 */
import type { AdminCard, AdminReadingRow, ReadingCost } from '@/lib/db/queries/admin/readings';
import { cardById } from '@/data/deck';
import { int, ms } from '../../format';
import { DETAIL, U } from '../copy';
import { AdminReveal } from './AdminReveal';
import styles from './detail.module.css';
import { Badge } from './sections/kit';

/** The three slots of a `spread3`; `daily` and `yesno` draw one. The array is sized from the
 *  highest position actually present, so a hole in the middle is visible AS a hole. */
function sparse(cards: AdminCard[]): Array<AdminCard | null> {
  const size = cards.reduce((max, c) => Math.max(max, c.position + 1), 0);
  const out: Array<AdminCard | null> = Array.from({ length: size }, () => null);
  for (const c of cards) if (c.position >= 0 && c.position < size) out[c.position] = c;
  return out;
}

/** **Card names stay English in both locales** (CLAUDE.md, `## Card data`): a reading refers
 *  to The Moon, and a card labelled anything else disagrees with the text underneath it.
 *  `cardById` returns undefined for an id the deck does not contain, which the seeded
 *  three-card test in `readings.integration.test.ts` relies on. */
function cardName(cardId: number): string {
  return cardById(cardId)?.name ?? DETAIL.readings.unknownCard;
}

export function AdminReadingDetail({
  reading,
  cost,
  userId,
}: {
  reading: AdminReadingRow;
  cost: ReadingCost | undefined;
  userId: string;
}) {
  const c = DETAIL.readings;
  const blocked = reading.status === 'blocked';

  return (
    <article className={styles.reading}>
      <header className={styles.readingHead}>
        {/*
          * **BOTH TIMESTAMPS ARE LABELLED, AND THE 1440px SHOT IS WHY.** The first draft put
          * `created_at` and `local_date` side by side bare -- `2026-07-29 02:12:00  2026-07-29`
          * -- and nothing on screen said which was which. They are different KINDS of thing: one
          * is a real instant in UTC, the other is the querent's own calendar day as a string, and
          * §4.6's whole reason for showing them together is that *the operator's question is
          * often "what does the gap between these two mean"* (A5-15). Unlabelled, that question
          * is unanswerable and the pair reads as a rendering bug.
          */}
        <span className={styles.readingWhen}>
          <span className={styles.whenLabel}>utc</span>{' '}
          {reading.createdAt.toISOString().replace('T', ' ').slice(0, 19)}
        </span>
        <span className={styles.readingWhen}>
          <span className={styles.whenLabel}>hari querent</span> {reading.localDate}
        </span>
        <span className={styles.readingMeta}>
          {reading.readerId} · {reading.serviceId} · {reading.locale}
        </span>
        <Badge tone={blocked || reading.status === 'failed' ? 'warn' : 'neutral'}>
          {reading.status}
        </Badge>
        {reading.sharedAt ? <Badge tone="good">{c.columns.shared}</Badge> : null}
      </header>

      {/* The QUESTION is inline and unencrypted by design, and no `lang` (§4.6). */}
      {reading.question ? <p className={styles.question}>{reading.question}</p> : null}
      {reading.verdict ? (
        <p className={styles.verdict}>
          {c.columns.verdict}: {reading.verdict}
        </p>
      ) : null}
      {/* NO `lang`, matching the question: a choice is a slice of what the querent typed. */}
      {reading.choice ? (
        <p className={styles.verdict}>
          {c.columns.choice}: {reading.choice}
        </p>
      ) : null}

      {blocked ? <p className={styles.note}>{c.blocked}</p> : null}
      {reading.status === 'partial' ? <p className={styles.note}>{c.partial}</p> : null}

      <ul className={styles.cards}>
        {sparse(reading.cards).length === 0 ? (
          <li className={styles.cardHole}>{c.noCards}</li>
        ) : (
          sparse(reading.cards).map((card, i) =>
            card === null ? (
              // A HOLE, at its own slot. Not a gap closed by sliding the others left.
              <li key={i} className={styles.cardHole}>
                {c.slot(i)}: {U.empty}
              </li>
            ) : (
              <li key={i} className={styles.card}>
                <span className={styles.cardSlot}>{c.slot(i)}</span>
                <span className={styles.cardName}>{cardName(card.cardId)}</span>
                <span className={styles.cardOrient}>
                  {card.reversed ? c.reversed : c.upright}
                </span>
              </li>
            ),
          )
        )}
      </ul>

      <dl className={styles.readingFields}>
        <Row label={c.columns.model} value={reading.model} />
        <Row label={c.columns.promptVersion} value={reading.promptVersion} />
        {/* **TTFT IN THOSE LETTERS** -- two columns named `latency_ms` with two meanings now
            exist in one schema, and a dashboard is where they get confused. */}
        <Row label={c.columns.ttft} value={ms(reading.latencyMs)} />
        <Row
          label={c.columns.tokens}
          value={`${int(reading.tokenInput)} / ${int(reading.tokenOutput)}`}
        />
        <Row label={c.columns.session} value={reading.sessionId ?? U.empty} />
        <Row
          label={c.costLabel}
          value={
            cost === undefined
              ? U.empty
              : `${int(cost.calls)} panggilan · ${int(cost.inputTokens)} / ${int(
                  cost.outputTokens,
                )} token · ${ms(cost.totalMs)}${
                  cost.untokenized > 0 ? ` · ${int(cost.untokenized)} tanpa token` : ''
                }`
          }
        />
        <Row label="gist" value={reading.hasGist ? c.hasGist : c.noGist} />
      </dl>

      {reading.hasBody ? (
        <AdminReveal
          href={`/api/admin/users/${userId}/reading/${reading.id}`}
          label={c.revealBody}
          field="body"
          emptyLabel={c.noBody}
          // The body's language is what the PROSE came out in.
          lang={reading.locale}
        />
      ) : (
        <p className={styles.note}>{c.noBody}</p>
      )}
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <dt className={styles.fieldLabel}>{label}</dt>
      <dd className={styles.fieldValue}>{value}</dd>
    </div>
  );
}
