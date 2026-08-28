# Phase 4: Retry — the `Coba ulang` control, copy, docs

**Plan set:** `HISTORY_RETRY_AND_SOFT_DELETE_PLAN.md`
**Analysis:** `20260828-145716-GEV5_code_analyzer.md`
**Depends on:** Phase 3
**Difficulty:** NORMAL
**Package:** `src/app/history/[id]`

---

## Goal

`/history/[id]` gains a `Coba ulang` control on a reading with no prose, and pressing it
streams a fresh reading over the same stored hand into the same page. The list row says so
in one sentence so the querent knows where to press. `reading.retried` learns which surface
fired it — **the name already exists and is already fired**, so this phase adds **zero** event
names. And the four documents that still say a `body IS NULL` reading has no way forward are
edited rather than left standing.

---

## Interface Contract

**Creates:**
- `refillView` (`src/app/history/[id]/HistoryDetail.tsx`) — PURE, exported for its own test.
  The rule-4 truth table for a refilled reading.
- `src/app/history/[id]/HistoryDetail.module.css` (new file).
- `src/app/history/[id]/HistoryDetail.test.ts` (new file).
- i18n keys, in both catalogs, Indonesian first:
  `history.retry.action`, `history.retry.hint`, `history.retry.waiting`,
  `history.retry.otherLanguage`, **`history.retry.stale`** (added in reconciliation, for the
  `404` / `409` terminal answers this plan originally let fall into the generic error branch).

**Signature changes:**
- `EventProps['reading.retried']`
  `{ reader_id: string; service_id: string; attempt: number }`
  ->
  `{ reader_id: string; service_id: string; attempt: number; surface: 'draw' | 'history';
     reading_id: string | null; prior_status: ReadingStatus | null; age_days: number }`
  (`src/lib/analytics/events.ts:367`). **`EVENT_NAMES` IS NOT TOUCHED BY THIS PHASE.** It is
  76 on `origin/main` and **77 once Phase 2 lands `history.item_deleted`** — this phase adds
  zero names and moves the count by zero, and **must not touch `events.test.ts`'s ceiling**,
  which Phase 2 moves 76 -> 77 with its register entry.

**Deletes:** nothing.

**Renames:** nothing.

**Copy amended (not added):** `history.item.unfinished` in both catalogs gains a second
sentence. **This is the whole of the list-row hint** — see Step 6 for why it is a string change
and not a `HistoryItemRow.tsx` change.

**Requires (from earlier phases):**
- **Phase 3** exports `isRetryable` from `src/lib/reading/retryable.ts`, PURE, callable from a
  `'use client'` file. **RECONCILED — THE DRAFT SIGNATURE HERE WAS WRONG IN BOTH DIRECTIONS AND
  WOULD NOT HAVE COMPILED.** Phase 3's actual shape is

  ```ts
  type RetryCandidate = {
    status: ReadingStatus;
    hasBody: boolean;
    cardCount: number;                       // REQUIRED — this draft omitted it
    deletedAt?: Date | string | null;        // OPTIONAL — this draft passed it
  };
  ```

  `cardCount` is required (a `blocked` reading has `body IS NULL` and **no `reading_cards` rows
  at all**, so `hasBody` alone would admit it and `buildPrompt` would throw on `picks[0]`), and
  `deletedAt` is **optional precisely so that a client omits it**. Step 1's call is corrected
  accordingly.
- **Phase 3** serves `POST /api/reading/retry/[id]` with:
  `text/plain; charset=utf-8` streaming body, an `x-reading-id` header, **`x-reading-locale`**,
  `401`, `403` + `{ error: 'moderation_blocked', … }`, `404` `not_found`, `409`
  `not_retryable`, `429` with `retry-after`, `500` and `503` `unavailable`.
  **RECONCILED: NO LONGER AN ASSUMPTION.** This is Phase 3's Interface Contract table verbatim,
  and Step 1 now branches on every status it emits — see the note in `runRetry` below. The
  409 in particular was absent from this plan's original `requires` list.
- **Phase 1** filters `readingWithCards` on `deleted_at IS NULL`, so a reading reaching this
  page is never deleted — which is why Step 1 **omits `deletedAt` entirely** rather than
  hardcoding `null`: a caller asserting a fact it cannot observe is the thing the optional
  property exists to prevent.

**Leaves alone (owned by others):**
- `src/app/history/HistoryItemRow.tsx` and its `.module.css` — **Phase 2, outright. This phase
  makes ZERO edits to either file.** (Phase 2's own handoff table originally reserved a marked
  insertion point inside `.text` for this phase's hint; **the reconciler removed it** — Step 6
  makes the hint a change to `history.item.unfinished`'s VALUE, so there is nothing to insert.)
- `src/app/history/HistoryBrowser.tsx`, `src/lib/history/swipe.ts` — Phase 2.
- `src/lib/db/**` except the ONE comment line at `queries/history.ts:323`.
- Every API route.

**Collides with (the reconciler must merge):**
- `src/lib/analytics/events.ts` — Phase 2 adds the NAME `history.item_deleted` (`:135`) and its
  prop shape (`:668`); this phase widens the SHAPE of `reading.retried` (`:367`) and edits its
  name's line comment (`:79`). Different lines, no textual conflict.
  **RESOLVED: Phase 2 moves `events.test.ts:129`'s ceiling 76 -> 77 with the register entry
  (its Step 6c, which the reconciler added — it was missing), and this phase touches that test
  not at all.**
- `src/lib/i18n/locales/id.ts` and `en.ts` — Phase 2 adds eight `history.item.delete.*` keys in
  the same `history.*` block, immediately after `'history.item.shared'`. This phase also
  **amends** `history.item.unfinished`, which Phase 2 does not touch. **THE TWO REGIONS ARE
  DISJOINT IN INTENT AND ADJACENT ON DISK, SO STEPS 7 AND 8 ANCHOR ON A STRING AND NEVER ON A
  LINE RANGE** — Phase 2 lands first, so `origin/main`'s `:904-916` / `:468-475` no longer name
  what they named, and replacing those ranges literally would take Phase 2's eight keys out with
  them.
- `src/lib/db/queries/history.ts` — Phase 1 adds `softDeleteReading` and the read filters,
  Phase 3 adds `refillReading`. This phase edits **one comment line, `:323`**, inside
  `readingsForDay`'s header.
- `src/app/[reader]/[service]/Draw.tsx:678-686` — **OUT OF THIS PHASE'S DECLARED SCOPE AND
  EDITED ANYWAY**, because widening `reading.retried`'s props makes that call site a compile
  error. Four added lines, no behaviour change. Nobody else in this plan set touches Draw.tsx.
  Recorded here so the reconciler can see it rather than discover it.
- `CLAUDE.md` — **this phase makes the only edit in the plan set**, and it binds **both**
  rulings. **RESOLVED: Phase 1's handoff claimed a ruling of its own** (the delete revokes share
  links **and clears the day summaries**, in one transaction, before the flag) **and Step 12 has
  absorbed it, re-measured, and now lands at exactly net ZERO** — +131 in `## History (V6)`,
  −131 in the W4 `events.ts` bullet, file 142,385 before and after. Phase 1 writes no
  `CLAUDE.md` line. Phases 1–3 must not add one or the arithmetic is wrong.

---

## Files

| File | Action | What changes |
|---|---|---|
| `src/app/history/[id]/HistoryDetail.tsx` | modify | the whole file is rewritten: the retry stream, `refillView`, the refusal mount |
| `src/app/history/[id]/HistoryDetail.module.css` | create | the control, the pulsing label, the hint |
| `src/app/history/[id]/HistoryDetail.test.ts` | create | `refillView`'s truth table — the rule-4 regression |
| `src/lib/analytics/events.ts:79,367` | modify | widen `reading.retried`'s props; the fold ledger in the comment |
| `src/app/[reader]/[service]/Draw.tsx:678-686` | modify | four props at the existing `reading.retried` call — compile fix |
| `src/lib/i18n/locales/id.ts` (the `history.*` block; **anchor on `'history.item.unfinished'`, not on `:904-916` — Phase 2 has already grown that range**) | modify | amend `history.item.unfinished`; **five** `history.retry.*` keys — `.action`, `.hint`, `.waiting`, `.otherLanguage` and **`.stale`** (the fifth, added in reconciliation) |
| `src/lib/i18n/locales/en.ts` (same anchor rule) | modify | the same **six** strings |
| `src/lib/db/queries/history.ts:323` | modify | one comment line that is now false |
| `docs/plans/2026-07-27-history.md:111,3046` | modify | VD14's narrow amendment; open question 7 answered |
| `docs/workstream-notes.md:1216` | modify | V6's evidence: the amendment, the boundary, the measurements |
| `CLAUDE.md:1137,1201` | modify | **the only `CLAUDE.md` edit in the plan set**; two rulings in (retry, and the delete INCLUDING Phase 1's day-summary clear), **net ZERO bytes**: +131 / −131 |

---

## Implementation Steps

### Step 1: Rewrite `HistoryDetail.tsx`

**File:** `src/app/history/[id]/HistoryDetail.tsx` (whole file, currently 226 lines)

**Change:** The component already owns one async source of prose (V2's translation). This adds
a second, and the two are kept apart by one property that must not be lost:

> **`needs` IS COMPUTED FROM THE SERVER PROP `reading`, NEVER FROM THE REFILLED VIEW.** The
> retry deliberately does not call `router.refresh()`, so `reading.body` stays `null` for the
> life of the page and `needs` stays `false`. The translation effect therefore cannot fire
> during or after a retry, and the two sources cannot fight. If somebody later adds a refresh,
> **that** is the line that breaks.

Rule 4 is held by `refillView`, which is exported and unit-tested. `resolveProse`'s branch 1
(`reading.body === null -> unavailable`) is why the streamed prose has to go into a **copy of
the reading**, not into the `prose` prop: handing `{ kind: 'translated' }` for a row whose
`body` is null yields `unavailable` and paints nothing, which is the bug this shape avoids.

**No `router.refresh()`, deliberately.** Phase 3 writes the row in the response's own
`defer()`, so a refresh fired when the stream ends races the write and would very likely re-read
the OLD row — repainting *"Tidak ada teks yang tersimpan"* over prose the querent just watched
arrive. `Draw.tsx` never refetches either, and `ShareFooter`'s three-attempt 250ms retry exists
because of the same race. The optimistic view stands until the querent navigates; the next open
reads the stored row.

**Code:**

```tsx
'use client';

/**
 * The thin client wrapper that owns the TRANSLATION and, since the retry work,
 * the REFILL. Nothing else.
 *
 * WHY IT EXISTS AT ALL: `ReadingView` takes prose as data (H2) so V7 can mount
 * it on a page with no session, and a streaming translation needs client state.
 * This file is that state, and everything visual is still in `ReadingView`,
 * which is the point of VD10.
 *
 * ── TWO ASYNC SOURCES OF PROSE, AND WHY THEY CANNOT FIGHT ──────────────────
 *
 * `needs` is computed from the SERVER PROP `reading`, never from `view`. The
 * retry deliberately does not call `router.refresh()` (see `runRetry`), so
 * `reading.body` stays null for the life of the page and `needs` stays false —
 * the translation effect cannot fire during or after a refill. A reading that
 * HAS prose is never retryable, so the reverse pairing is unreachable by
 * construction. **If somebody later adds a refresh here, this is the sentence
 * that stops being true.**
 *
 * ── RULE 4 IS HELD BY `refillView`, NOT BY THIS COMPONENT'S DISCIPLINE ──────
 *
 * `resolveProse` short-circuits on `reading.body === null`, so a refill cannot
 * be delivered through the `prose` prop — it has to become a COPY of the
 * reading. That copy carries the locale the prose was actually generated in,
 * and `refillView` is the one place that decides what `prose` goes with it. It
 * is exported and has its own truth table test.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AttachReadingLink } from '@/components/AttachReadingLink';
import { ReadingView, type ReadingProse, type ReadingViewData } from '@/components/ReadingView';
import { RefusalNotice } from '@/components/RefusalNotice';
import { ShareFooter } from '@/components/ShareFooter';
import type { Locale } from '@/data/types';
import { LOCAL_DATE_HEADER, SESSION_HEADER } from '@/lib/analytics/localdate';
import { getSessionId, track } from '@/lib/analytics/track.client';
import { attachable } from '@/lib/chat/attachmentView';
import { dayOffset } from '@/lib/history/dates';
import { isLocale } from '@/lib/i18n/locale';
import { useT } from '@/lib/i18n/LocaleProvider';
import type { RefusalPayload } from '@/lib/moderation/types';
import { splitChoiceMarker, validateChoice } from '@/lib/reading/choice';
import { isRetryable } from '@/lib/reading/retryable';
import { todayKey } from '@/lib/storage';
import styles from './HistoryDetail.module.css';

/**
 * What a completed (or in-flight) refill is holding.
 *
 * `locale` IS THE LANGUAGE THE PROSE CAME BACK IN, which is not necessarily
 * `reading.locale` and not necessarily the viewer's. It is read off the
 * response and defaulted to `reading.locale`; `refillView` is what decides what
 * may be painted from it.
 */
type Refill = { text: string; locale: Locale; choice: string | null };

/**
 * The control's own state. Separate from `Refill` because the two answer
 * different questions: `Refill` is "what prose do we hold", this is "what does
 * the button say".
 *
 * `painted` means the prose slot is already showing the stream, so the pulsing
 * label must get out of the way. It is false for the whole of a refill whose
 * language the viewer is not reading.
 */
type RetryState =
  | { kind: 'idle' }
  | { kind: 'running'; painted: boolean }
  | { kind: 'done' }
  | { kind: 'error'; message: string }
  /**
   * **A TERMINAL REFUSAL, AND THE REASON IT IS NOT `error` (reconciled).** Phase
   * 3's route answers `409 not_retryable` when the reading exists and is the
   * querent's and may not be retried anyway — it already has prose, or its stored
   * draw is unusable — and `404 not_found` when it has gone, which on this page
   * means another tab deleted it. Both are ANSWERS rather than failures, so
   * "try again in a moment" would be false and the button would be a loop. This
   * member exists to take the control away and ask for a reload.
   */
  | { kind: 'stale' }
  | { kind: 'blocked'; payload: RefusalPayload };

/**
 * RULE 4 FOR A REFILLED READING, IN ONE FUNCTION. Read it before changing
 * anything in this file.
 *
 * `resolveProse`'s branch 1 returns `unavailable` whenever `reading.body` is
 * null, WHATEVER the caller passed — which is correct, and which means a refill
 * cannot be handed in through `prose`. It has to arrive as a copy of the
 * reading. Three outcomes:
 *
 *   1. No refill -> the row exactly as the server sent it, and the caller's own
 *      translation state.
 *   2. A refill in the viewer's language -> the copy, and `null` prose, so
 *      `resolveProse` lands on `original` by its own branch 3.
 *   3. A refill in the OTHER language -> the copy, and an explicit
 *      `{ kind: 'as-written' }`. That is V7's member and it is the right one:
 *      the page has DECIDED to render foreign prose, `ReadingView` puts a `lang`
 *      attribute on it, and rule 4 is satisfied by naming the decision rather
 *      than bypassed. `{ kind: 'original' }` here would be the breach —
 *      `resolveProse` treats it exactly like an omitted prop.
 *
 * It never returns `translated`: nothing was translated. The `otherLanguage`
 * line in the footer is what tells the querent that, and it is the one branch
 * that asks the querent to reopen the page — where `page.tsx`'s cached lookup
 * and V2's stream take over normally.
 *
 * `status: 'ok'` on the copy is the same claim `Draw.tsx` makes and carries the
 * same caveat: the tee may independently have written `partial`. The client
 * cannot know, does not guess, and the divergence is information rather than a
 * contradiction. It matters here because `attachable()` and `ShareFooter`'s
 * condition both read it.
 *
 * Exported for its own test. This is the part with a truth table and it should
 * not need a DOM to check.
 */
export function refillView(
  reading: ReadingViewData,
  refill: Refill | null,
  viewer: Locale,
): { view: ReadingViewData; prose: ReadingProse | null } {
  if (refill === null) return { view: reading, prose: null };
  const view: ReadingViewData = {
    ...reading,
    body: refill.text,
    locale: refill.locale,
    status: 'ok',
    choice: refill.choice ?? reading.choice,
  };
  return { view, prose: refill.locale === viewer ? null : { kind: 'as-written' } };
}

export function HistoryDetail({
  reading,
  cachedTranslation,
  nickname,
}: {
  reading: ReadingViewData;
  /** Read on the server from `translations`, so a second view has no spinner. */
  cachedTranslation: string | null;
  /**
   * V7. `profiles.nickname`, for the share sheet's preview of the
   * "A reading for {nickname}" line the public page renders.
   *
   * Passed in rather than fetched: this is a client component, and the page above
   * it is already doing one primary-key read.
   */
  nickname: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const needs = reading.locale !== t.locale && reading.body !== null;

  const [prose, setProse] = useState<ReadingProse>(() => {
    if (!needs) return { kind: 'original' };
    if (cachedTranslation) return { kind: 'translated', locale: t.locale, text: cachedTranslation };
    return { kind: 'translating', text: '' };
  });

  const [refill, setRefill] = useState<Refill | null>(null);
  const [retry, setRetry] = useState<RetryState>({ kind: 'idle' });

  const started = useRef(false);
  const retryAbort = useRef<AbortController | null>(null);
  /** `reading.retried.attempt`, so a retry loop is visible as one. */
  const attempt = useRef(0);
  /** The refusal, for the one scroll it needs. See the mount below. */
  const refusalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!needs || cachedTranslation) return;
    // StrictMode mounts, unmounts and remounts. EACH RUN HERE IS A MODEL CALL.
    if (started.current) return;
    started.current = true;

    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [SESSION_HEADER]: getSessionId(),
            [LOCAL_DATE_HEADER]: todayKey(),
          },
          signal: controller.signal,
          /*
           * NO `targetLocale` IN THE BODY. V2's route resolves the target from
           * `await getLocale()` and never from anything the client says --
           * deliberately, because that is the only way the dev-only `?lang=`
           * override and the session claim cannot disagree. Sending one would be
           * ignored, which is worse than not sending it: it would read as though
           * this component chose the language.
           */
          body: JSON.stringify({ entity: 'reading', entityId: reading.id, field: 'body' }),
        });

        /*
         * 204 IS A REAL ANSWER FROM THIS ROUTE, NOT AN EMPTY 200. V2 returns it
         * when the source is already in the viewer's locale -- unreachable here,
         * since `needs` gated the call -- and when the translation produced
         * nothing at all. `res.ok` is TRUE for a 204, so checking only that would
         * leave the screen on a spinner forever.
         */
        if (!res.ok || res.status === 204 || !res.body) {
          setProse({ kind: 'unavailable' });
          return;
        }

        const stream = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let acc = '';
        for (;;) {
          const { done, value } = await stream.read();
          if (done) break;
          acc += value;
          /*
           * Set the accumulated string, never `setProse(p => ...)`. StrictMode
           * double-invokes updaters and would duplicate every chunk in
           * development -- the same trap `DaySummary` records.
           */
          setProse({ kind: 'translating', text: acc });
        }

        setProse(resolveStreamed(acc, reading.body, t.locale));
      } catch {
        if (!controller.signal.aborted) setProse({ kind: 'unavailable' });
      }
    })();

    return () => controller.abort();
  }, [needs, cachedTranslation, reading.id, reading.body, t.locale]);

  /*
   * Abort an in-flight refill if the querent navigates away. A refill that
   * nobody is watching is a `reading.aborted { reason: 'user' }`, exactly as it
   * is on the draw screen -- and the SERVER still finishes and stores it,
   * because the route's write is in its own `defer()`. Leaving is not
   * cancelling.
   */
  useEffect(() => () => retryAbort.current?.abort(), []);

  /*
   * THE REFILL. `Draw.tsx`'s `requestReading` is the reference implementation
   * and every branch below is carried over from it deliberately.
   *
   * THREE THINGS ARE NOT CARRIED OVER, and each is a fact about this surface:
   *
   *   - NO `picks` AND NO `question` IN THE BODY. The hand comes from
   *     `reading_cards` and the question from `readings.question`, server-side.
   *     A tampered client cannot re-draw. The body is `{}` and exists only so a
   *     route that parses JSON has something to parse.
   *   - NO `router.refresh()` WHEN IT FINISHES. The route writes the row in its
   *     own `defer()`, so a refresh fired here races the write and would very
   *     likely re-read the OLD row -- repainting "no text was kept" over prose
   *     the querent just watched arrive. `Draw.tsx` never refetches either, and
   *     `ShareFooter`'s three 250ms attempts exist because of the same race. The
   *     optimistic view stands until they navigate.
   *   - NO `reading.first_token`. That event is the SERVER's, keyed to the
   *     `readings` row; `Draw.tsx` does not fire it from the browser and neither
   *     does this.
   *
   * `reading.completed` and `reading.failed` ARE fired, with `source: 'client'`,
   * because that pairing is the whole loss-detection mechanism and a refill is
   * exactly the kind of write worth detecting the loss of. The consequence is
   * written down rather than avoided: **a retried reading has TWO client
   * `reading.completed` rows for one `reading_id`**, and `reading.retried` with
   * `surface: 'history'` is the discriminator that says which is the second.
   */
  const runRetry = useCallback(async () => {
    retryAbort.current?.abort();
    const controller = new AbortController();
    retryAbort.current = controller;

    attempt.current += 1;
    track('reading.retried', {
      reader_id: reading.readerId,
      service_id: reading.serviceId,
      attempt: attempt.current,
      surface: 'history',
      reading_id: reading.id,
      /*
       * The status the row carried BEFORE this press. `aborted` and `failed` are
       * indistinguishable from the screen -- both are `body IS NULL` -- and this
       * is the only instrument that says whether that was the right call. If
       * nearly every retry is on an `aborted` row, somebody walked away and came
       * back, which is a different feature from recovering a dead stream.
       */
      prior_status: reading.status,
      /*
       * `todayKey()` IN A HANDLER, NEVER DURING RENDER. It reads `new Date()`,
       * which differs between the server render and hydration -- the trap
       * `HistoryBrowser` records. `Draw.tsx` reads it in exactly this position
       * for exactly this reason.
       */
      age_days: dayOffset(todayKey(), reading.localDate),
    });

    setRetry({ kind: 'running', painted: false });

    const requestedAt = Date.now();
    let firstByteMs: number | null = null;

    try {
      const res = await fetch(`/api/reading/retry/${reading.id}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: getSessionId(),
          // The device's own calendar day. A refill must NOT move
          // `readings.local_date`, but the pipeline still reads the header, and
          // omitting it would make this the one model call in the app that
          // cannot report the querent's day.
          [LOCAL_DATE_HEADER]: todayKey(),
        },
        signal: controller.signal,
        body: '{}',
      });

      if (res.status === 401) {
        // The cookie expired mid-session. Nothing to show; send them back.
        track('auth.session_expired', { at_path: window.location.pathname });
        router.replace('/login');
        return;
      }
      if (res.status === 429) {
        track('reading.rate_limited', {
          reader_id: reading.readerId,
          service_id: reading.serviceId,
          retry_after_s: Number(res.headers.get('retry-after') ?? 0),
          /*
           * `'unknown'` because the browser IS NOT TOLD which of the four
           * ceilings it hit, deliberately: all four answer with identical copy
           * so that telling the querent does not tell a prober which one to work
           * around. The server's own copy of this event carries the real value.
           */
          limit: 'unknown',
        });
        setRetry({ kind: 'error', message: t('reading.error.rateLimit') });
        return;
      }
      /*
       * THE MODERATION REFUSAL (W7). **THIS BRANCH MUST STAY ABOVE THE `!res.ok`
       * CHECK BELOW**, which would otherwise swallow it as `http_403` and show
       * the generic "could not start" error -- losing the clause link, the crisis
       * resources, and any sign that the app made a deliberate decision rather
       * than falling over.
       *
       * `403` is also what an un-onboarded caller gets from middleware, so the
       * body is what distinguishes them: a refusal carries
       * `error: 'moderation_blocked'`, and anything else 403-shaped falls
       * through to the generic path on purpose.
       *
       * A REFUSAL HERE IS A CORRECT OUTCOME AND NOT A REGRESSION. The question
       * was classified once, before the first attempt, and the classifier is
       * allowed to have moved. The row is left exactly as it was, so the control
       * comes back and nothing was lost.
       */
      if (res.status === 403) {
        const payload = await res.json().catch(() => null);
        if (payload?.error === 'moderation_blocked') {
          // No `track()`. The SERVER emitted `moderation.refused` with the
          // source, the category and the confidence bucket -- it is the only
          // side that knows them.
          setRetry({ kind: 'blocked', payload });
          return;
        }
      }

      /*
       * THE TWO TERMINAL ANSWERS, ADDED IN RECONCILIATION. This plan's original
       * `requires` list named only 401/429/403 and let 404, 409, 500 and 503 all
       * fall into the generic branch below.
       *
       * **404 AND 409 ARE ANSWERS, NOT FAILURES, AND THE GENERIC BRANCH LIES
       * ABOUT BOTH.** `409 not_retryable` means the row already has prose or its
       * stored draw is unusable; `404 not_found` collapses "gone", "not yours",
       * "blocked" and "deleted" into one non-oracle. In every one of those cases
       * the honest thing is to take the control AWAY -- "Bacaan tidak bisa
       * dimulai" beside a live button is an invitation to press it again for ever.
       *
       * A 404 here is very nearly always the querent's own other tab: they
       * swiped the row away on `/history` while this page was open. That is why
       * the copy asks for a reload rather than reporting an error.
       *
       * **500 AND 503 STAY IN THE GENERIC BRANCH ON PURPOSE.** Those mean the
       * model call died before the verdict, or the driver failed -- transient, the
       * row is untouched, and pressing again is the correct next move. `!res.ok`
       * records them as `http_500` / `http_503`, which is the classifier that
       * tells the two apart in `reading.failed`.
       */
      if (res.status === 404 || res.status === 409) {
        setRetry({ kind: 'stale' });
        return;
      }

      if (!res.ok || !res.body) {
        track('reading.failed', {
          reading_id: reading.id,
          reader_id: reading.readerId,
          service_id: reading.serviceId,
          stage: 'connect',
          chars_before_failure: 0,
          // A short classifier, never a message: rule 2 of the taxonomy.
          error_kind: `http_${res.status}`,
          source: 'client',
        });
        setRetry({ kind: 'error', message: t('reading.error.start') });
        return;
      }

      /*
       * THE LANGUAGE THE PROSE CAME BACK IN. **NO LONGER AN ASSUMPTION: PHASE 3
       * SENDS `x-reading-locale` AND ITS ROUTE HEADER SAYS SO** (reconciled).
       *
       * **A RETRY DOES NOT MOVE `readings.locale`.** Phase 3's `ReadingRefill`
       * has no `locale` field, so `refillReading` cannot write the column; the
       * route splits `readLocale` (the prompt, the Lotus block, the recall chain,
       * the mid-stream notice, the gist) from `viewLocale` (the 429, the 500, the
       * refusal payload), and the prose comes back in the reading's own language
       * whatever the app is set to now. That is what keeps V2's translation of
       * this reading valid: `ReadingView`'s rule 4 keys off exactly this column,
       * and `translations` has no `source_hash` that could catch a language swap.
       *
       * **THE HEADER IS STILL READ FIRST, AND THAT IS NOT BELT-AND-BRACES.** The
       * route reuses `/api/reading`'s pipeline, whose locale comes from
       * `await getLocale()`, so it is one incautious "simplification" away from
       * generating in the VIEWER's language -- and on that day the prose and this
       * header change together while `reading.locale` does not. Reading the
       * header is what keeps the page honest without an edit.
       *
       * An absent or malformed value falls back to the stored locale, which is
       * the conservative answer: at worst the prose is held behind a notice
       * rather than painted into the wrong language silently.
       */
      const declared = res.headers.get('x-reading-locale');
      const generated: Locale = isLocale(declared) ? declared : reading.locale;
      const live = generated === t.locale;

      const decoder = new TextDecoder();
      const readerStream = res.body.getReader();
      /*
       * `raw` IS THE WIRE AND `text` IS THE SCREEN, AND KEEPING THEM APART IS THE
       * WHOLE OF THE CHOICE MARKER'S CLIENT SIDE. The reader may open with
       * `PILIHAN: Ayam\n\n` -- a protocol line, not prose -- and it arrives split
       * across chunks at an arbitrary byte. `splitChoiceMarker` is handed the
       * text accumulated SO FAR, not the delta, which is what makes it pure and
       * idempotent. The server runs the same function once over the finished
       * body; a server-side stream transform cannot work here, because the choice
       * arrives long after the response headers.
       *
       * `reading.question` and not a textarea: this surface has no input, and the
       * stored question is the same sanitized string the server validates
       * against.
       */
      let raw = '';
      let text = '';
      let painted = false;

      for (;;) {
        const { done, value } = await readerStream.read();
        if (done) break;
        if (firstByteMs === null) firstByteMs = Date.now() - requestedAt;
        raw += decoder.decode(value, { stream: true });
        const split = splitChoiceMarker(raw, false, reading.question);
        if (split.pending) continue;
        text = split.body;
        /*
         * ONLY PAINTED WHEN THE VIEWER READS THE LANGUAGE IT IS ARRIVING IN.
         * Rule 4 permits `as-written` for a NAMED decision, and that is what the
         * finished refill gets -- but streaming a paragraph the viewer cannot
         * read, one chunk at a time, is noise rather than a decision. The
         * mismatch branch waits and delivers it whole.
         */
        if (live && text) {
          setRefill({ text, locale: generated, choice: null });
          if (!painted) {
            painted = true;
            setRetry({ kind: 'running', painted: true });
          }
        }
      }
      raw += decoder.decode();

      /*
       * `done: true` IS THE FLUSH. A stream that died four characters into the
       * marker must still show what it managed to send, so nothing may be held
       * back here.
       */
      const finalSplit = splitChoiceMarker(raw, true, reading.question);
      text = finalSplit.body;
      /*
       * VALIDATED ON THIS SIDE TOO, against the same stored question the server
       * validates against. This is NOT the authority -- the server's row is --
       * but rendering the model's unvalidated word would put model-controlled
       * text in a highlighted box on the querent's screen.
       */
      const choice = validateChoice(finalSplit.choice, reading.question);

      setRefill({ text, locale: generated, choice });
      setRetry({ kind: 'done' });

      track('reading.completed', {
        reading_id: reading.id,
        reader_id: reading.readerId,
        service_id: reading.serviceId,
        latency_ms: firstByteMs ?? -1,
        total_ms: Date.now() - requestedAt,
        chars: text.length,
        // The client cannot know the token counts and deliberately does not guess.
        token_input: null,
        token_output: null,
        truncated: false,
        status: 'ok',
        source: 'client',
        choice: finalSplit.choice === null ? 'none' : choice === null ? 'invalid' : 'valid',
        choice_length: finalSplit.choice?.length ?? 0,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        track('reading.aborted', {
          reading_id: reading.id,
          chars_before_abort: 0,
          reason: 'user',
          source: 'client',
        });
        return;
      }
      console.error(err);
      track('reading.failed', {
        reading_id: reading.id,
        reader_id: reading.readerId,
        service_id: reading.serviceId,
        stage: firstByteMs === null ? 'connect' : 'stream',
        chars_before_failure: 0,
        error_kind: 'network',
        source: 'client',
      });
      setRetry({ kind: 'error', message: t('reading.error.network') });
    }
  }, [reading, router, t]);

  /*
   * THE REFUSAL SCROLLS ITSELF INTO VIEW, ONCE. The control that produced it is
   * at the bottom of a page that is taller than a phone, and the answer renders
   * at the top -- see the mount below for why it cannot render at the bottom.
   * `ReadingPanel` does the same thing for the same reason.
   */
  useEffect(() => {
    if (retry.kind !== 'blocked') return;
    refusalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [retry.kind]);

  const { view, prose: refillProse } = refillView(reading, refill, t.locale);
  /*
   * The refill's decision WINS when there is one, and the translation state is
   * what governs otherwise. They are never both live: see the header.
   */
  const shownProse = refillProse ?? prose;

  /*
   * WHETHER THE CONTROL IS OFFERED AT ALL, and it asks Phase 3's pure predicate
   * rather than restating it. That is the whole point of `retryable.ts` being a
   * LEAF: this browser and that route ask ONE function, so a button that offers a
   * retry the endpoint then refuses is unreachable by construction.
   *
   * `hasBody` IS DERIVED FROM THE SERVER ROW, NOT FROM `view`, so a successful
   * refill takes the button away without a refetch.
   *
   * `cardCount` IS NOT OPTIONAL AND IT IS NOT DECORATION. A `blocked` reading has
   * `body IS NULL` and **no `reading_cards` rows at all**, so `hasBody` alone
   * would call it retryable; the predicate refuses it here as well as at the
   * route, and `reading.cards` is already on `ReadingViewData`.
   *
   * **`deletedAt` IS DELIBERATELY NOT PASSED.** It is optional on
   * `RetryCandidate` precisely so a client omits it: `HistoryItem` and
   * `ReadingDetail` carry no such field and must not gain one, because a deleted
   * reading never reaches a client in the first place -- `readingWithCards`
   * filters `deleted_at IS NULL`, so this component does not exist for one.
   * Hardcoding `deletedAt: null` here would be this file asserting a server fact
   * it cannot observe, which is exactly the habit `x-reading-locale` below exists
   * to break.
   */
  const canRetry = isRetryable({
    status: reading.status,
    hasBody: reading.body !== null,
    cardCount: reading.cards.length,
  });

  return (
    <>
      {/*
        THE REFUSAL RENDERS ABOVE `ReadingView`, NOT IN ITS `footer` SLOT, AND
        THAT IS A W7 RULE RATHER THAN A LAYOUT PREFERENCE. `ReadingView` renders
        `common.disclaimer.long` immediately before `footer`, so a refusal in
        that slot would sit directly under "for entertainment only" -- which
        `ReadingPanel`'s own header calls obscene for the self-harm category and
        merely noise for the rest. Above the reading, the disclaimer stays
        attached to the reading it belongs to.
      */}
      {retry.kind === 'blocked' ? (
        <div ref={refusalRef}>
          <RefusalNotice payload={retry.payload} />
        </div>
      ) : null}

      <ReadingView
        reading={view}
        prose={shownProse}
        footer={
          <>
            {/*
              F6's TASK 7. *Bahas di grup*, and this page's ONLY route into the
              room — `C-D17` puts the chat button on `/history` and deliberately
              NOT on `/history/[id]`. `attachable()` and not a second copy of the
              condition below, although the two happen to admit the same rows.

              **IT READS `view`, NOT `reading`, AND THAT IS THE POINT.** A
              refilled reading is a reading with prose; refusing to let the
              querent attach or share it until they reload would be a control
              correctly withheld and then granted for no reason they can see.
              `createShareLink` and the attach route both re-check server-side
              against the stored row, which is what makes this a UI decision
              rather than the enforcement — and the row IS `ok` by then, because
              the route wrote it in its own `defer()`.

              **ABOVE `ShareFooter`.** The private action above the public one.
            */}
            {attachable(view) ? (
              <AttachReadingLink readingId={view.id} from="history" />
            ) : null}
            {view.status === 'ok' && view.body !== null ? (
              <ShareFooter
                entity="reading"
                entityId={view.id}
                preview={view}
                /*
                 * **THE SAME `prose` THIS COMPONENT IS RENDERING**, which is what
                 * makes the sheet's "exactly what they will see" true rather than
                 * nearly true.
                 */
                prose={shownProse}
                nickname={nickname}
              />
            ) : null}

            {/*
              THE RETRY BLOCK. It lives in the `footer` slot because that slot is
              empty for exactly the rows that can be retried — `attachable()` and
              the share condition both need a body — so nothing competes with it,
              and `ReadingView` learns nothing about retrying, which is VD10.

              `canRetry` is the SERVER row's answer, so the control disappears the
              moment a refill lands and never returns for this page's life.
            */}
            {canRetry ? (
              <div className={styles.retryBlock}>
                {retry.kind === 'running' && !retry.painted ? (
                  <p className={styles.waiting}>{t('history.retry.waiting')}</p>
                ) : null}

                {retry.kind === 'error' ? (
                  <p className={styles.error}>{retry.message}</p>
                ) : null}

                {/*
                  THE TERMINAL ANSWER (404 / 409). It renders in the `error` slot
                  and the button below does NOT come back for it -- `'stale'` is
                  absent from the branch that renders the control, which is the
                  whole reason it is its own member of `RetryState`.
                */}
                {retry.kind === 'stale' ? (
                  <p className={styles.error}>{t('history.retry.stale')}</p>
                ) : null}

                {/*
                  THE ONE BRANCH THAT ASKS THE QUERENT TO DO SOMETHING. It fires
                  only when the refill came back in a language the viewer is not
                  reading -- `refillView` has already put a `lang` attribute on
                  the prose, so this line says what that attribute means. Opening
                  the page again is a real instruction rather than a hedge: the
                  row is stored by then, `page.tsx` reads the cached translation
                  and V2 streams one if there is none.
                */}
                {retry.kind === 'done' && refill !== null && refill.locale !== t.locale ? (
                  <p className={styles.otherLanguage}>{t('history.retry.otherLanguage')}</p>
                ) : null}

                {retry.kind === 'idle' || retry.kind === 'error' ? (
                  <>
                    <button
                      type="button"
                      className={styles.retry}
                      onClick={() => void runRetry()}
                    >
                      {t('history.retry.action')}
                    </button>
                    <p className={styles.hint}>{t('history.retry.hint')}</p>
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        }
        onCardOpened={(c) =>
          track('draw.card_detail_opened', {
            card_id: c.cardId,
            reversed: c.reversed,
            slot: c.position,
            /*
             * FALSE, AND IT IS NOT A LIE. `during_reading` asks whether the
             * stream was live when the card was opened. In history it never is --
             * and a refill does not change that: the querent is looking at a card
             * on a history page, not drawing one.
             */
            during_reading: false,
          })
        }
      />
    </>
  );
}

/**
 * WHAT THE TRANSLATION STREAM ACTUALLY DELIVERED, AND THE ONE CASE THE WIRE
 * CANNOT TELL US.
 *
 * `translateStream` **yields the source verbatim on every failure it knows
 * about** — that is V2's deliberate choice, so a viewer sees prose rather than
 * nothing, and it is documented on `TranslateResult.fellBack`. The route then
 * returns it as an ordinary 200, so a fallback and a success are byte-identical
 * on the wire.
 *
 * For `/history/[id]` that would be a direct breach of H3: the English app would
 * show the Indonesian body, arriving through the very path that exists to
 * prevent exactly that. We can detect it exactly and for free, because this
 * component is holding the source — if what came back IS the source, no
 * translation happened.
 *
 * Compared after trimming and nothing else. A translation that happened to equal
 * its source would be a translation into the same language, which the route's
 * own 204 branch and the table's `source_locale <> locale` check both forbid.
 */
function resolveStreamed(
  streamed: string,
  source: string | null,
  target: Locale,
): ReadingProse {
  const text = streamed.trim();
  if (!text) return { kind: 'unavailable' };
  if (source !== null && text === source.trim()) return { kind: 'unavailable' };
  return { kind: 'translated', locale: target, text: streamed };
}
```

**Impact:** `/history/[id]` gains a control, a stream, a refusal mount and a fragment return.
Nothing on the page changes for a reading that has prose — `canRetry` is false, the footer
block does not render, and `refillView` returns the row untouched.

---

### Step 2: `HistoryDetail.module.css`

**File:** `src/app/history/[id]/HistoryDetail.module.css` (new)

**Change:** Four classes, built from existing tokens only. **The button clears 44px explicitly**
— `PublicShare`'s 36px control is a recorded defect and a second one must not ship. The `.retry`
values are `ReadingPanel.module.css`'s verbatim so the two controls read as the same act.

**Code:**

```css
/*
 * The refill control on `/history/[id]`.
 *
 * `.retry` IS `ReadingPanel.module.css`'s `.retry`, VALUE FOR VALUE, and that is
 * deliberate: on the draw screen it means "the stream broke, send it again", and
 * here it means "the stream broke months ago, send it again". One act, one
 * shape. It is not imported, because a CSS module cannot be, and it is not moved
 * into a shared file, because two call sites is not a pattern yet.
 *
 * `min-height: 44px` IS EXPLICIT AND NOT LEFT TO THE PADDING. The padding gets
 * there today (14 + 14 + a ~13px line box), which is exactly how `PublicShare`
 * ended up at 36px and is a known defect on twenty-three pages. A number that
 * has to be true is written down.
 *
 * No new hex values, font sizes or easing curves.
 */
.retryBlock {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin-top: 6px;
}

.retry {
  align-self: flex-start;
  min-height: 44px;
  font-family: var(--font-display), serif;
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--ls-button);
  text-transform: uppercase;
  color: var(--button-text);
  border: 1px solid var(--gold-border);
  background: var(--gold-wash);
  border-radius: var(--radius-chip);
  padding: 14px 18px;
}

.retry:hover {
  background: var(--gold-wash-strong);
}

.retry:focus-visible {
  outline: 2px solid var(--gold-border);
  outline-offset: 2px;
}

/* The same pulsing eyebrow the reading and the translation both use. A refill is
   a full generation, so this holds the screen for the same 2.7s/5.4s/11.6s the
   argument in `ReadingPanel.module.css` is about. */
.waiting {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-family: var(--font-display), serif;
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--ls-section-label);
  text-transform: uppercase;
  color: var(--gold);
  animation: breathe 2.4s ease-in-out infinite;
}

@keyframes breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .waiting {
    animation: none;
    opacity: 1;
  }
}

.hint,
.otherLanguage {
  margin: 0;
  font-family: var(--font-body), Georgia, serif;
  font-style: italic;
  font-size: 13px;
  color: var(--faint);
}

.error {
  margin: 0;
  font-family: var(--font-body), Georgia, serif;
  font-size: 15px;
  color: var(--muted);
}
```

**Impact:** one new stylesheet, no existing selector touched.

---

### Step 3: `refillView`'s truth table test

**File:** `src/app/history/[id]/HistoryDetail.test.ts` (new)

**Change:** `vitest.config.ts` sets `environment: 'node'`, so there is no DOM and hooks cannot
run — which is why the rule-4 decision was extracted into a pure exported function in the first
place. This is loop 1 and it is the only automated test that can see the invariant.

**Code:**

```ts
import { describe, expect, it } from 'vitest';

import { resolveProse, type ReadingViewData } from '@/components/ReadingView';
import { refillView } from './HistoryDetail';

/**
 * `refillView` IS RULE 4 FOR A REFILLED READING, so this file is the contract
 * rather than a smoke test. The assertion that matters is the last one: a
 * refill that came back in the language the viewer is NOT reading must never
 * reach `resolveProse`'s `original` branch.
 *
 * Rendering is not needed and not available -- the unit project runs in `node`.
 * That is the whole reason the decision lives in a pure function instead of
 * inside the component's JSX.
 */
const EMPTY: ReadingViewData = {
  id: '11111111-1111-4111-8111-111111111111',
  readerId: 'thessaly',
  serviceId: 'spread3',
  localDate: '2026-08-20',
  createdAtIso: '2026-08-20T04:00:00.000Z',
  locale: 'id',
  status: 'failed',
  verdict: null,
  question: 'mending makan ayam atau ikan?',
  choice: null,
  sharedAt: null,
  cards: [{ cardId: 0, reversed: false, position: 0 }],
  body: null,
};

describe('refillView', () => {
  it('returns the row untouched when there is no refill', () => {
    const { view, prose } = refillView(EMPTY, null, 'id');
    expect(view).toBe(EMPTY);
    expect(prose).toBeNull();
  });

  it('keeps the id, the cards and the question, and never invents a verdict', () => {
    const { view } = refillView(EMPTY, { text: 'Ayam.', locale: 'id', choice: 'ayam' }, 'id');
    expect(view.id).toBe(EMPTY.id);
    expect(view.cards).toBe(EMPTY.cards);
    expect(view.question).toBe(EMPTY.question);
    expect(view.localDate).toBe(EMPTY.localDate);
    expect(view.createdAtIso).toBe(EMPTY.createdAtIso);
    expect(view.verdict).toBeNull();
    expect(view.choice).toBe('ayam');
    expect(view.status).toBe('ok');
  });

  it('keeps the stored choice when the refill produced none', () => {
    const stored: ReadingViewData = { ...EMPTY, choice: 'ikan' };
    const { view } = refillView(stored, { text: 'Sesuatu.', locale: 'id', choice: null }, 'id');
    expect(view.choice).toBe('ikan');
  });

  it('paints a same-language refill through resolveProse as `original`', () => {
    const { view, prose } = refillView(EMPTY, { text: 'Kartunya bicara.', locale: 'id', choice: null }, 'id');
    expect(prose).toBeNull();
    expect(resolveProse(view, prose ?? undefined, 'id')).toEqual({ kind: 'original' });
  });

  /**
   * THE REGRESSION THIS FILE EXISTS FOR. An English viewer retried an Indonesian
   * reading and the route generated in the reading's own language. Rendering it
   * as `original` would put an Indonesian paragraph in an English app through
   * the one path built to prevent that -- and `{ kind: 'original' }` would do
   * exactly that, because `resolveProse` treats it identically to an omitted
   * prop.
   */
  it('names an other-language refill `as-written` and never `original`', () => {
    const { view, prose } = refillView(EMPTY, { text: 'Kartunya bicara.', locale: 'id', choice: null }, 'en');
    expect(prose).toEqual({ kind: 'as-written' });
    expect(resolveProse(view, prose ?? undefined, 'en')).toEqual({ kind: 'as-written' });
  });

  it('never returns a paintable view whose language the viewer is not reading', () => {
    for (const viewer of ['id', 'en'] as const) {
      for (const generated of ['id', 'en'] as const) {
        const { view, prose } = refillView(EMPTY, { text: 'x'.repeat(40), locale: generated, choice: null }, viewer);
        const shown = resolveProse(view, prose ?? undefined, viewer);
        if (shown.kind === 'original') expect(view.locale).toBe(viewer);
      }
    }
  });
});
```

**Impact:** one new unit test file, ~7 assertions, no database.

---

### Step 4: Widen `reading.retried` — the fold, and the count that does not move

**File:** `src/lib/analytics/events.ts:79` (comment only) and `:367` (the prop shape)

**Change.** **`reading.retried` ALREADY EXISTS, AT LINE 79, AND IS ALREADY FIRED** — by
`Draw.tsx:680`, on the draw screen's error-panel Retry button. The analysis and the plan index
both say "fold in `reading.retried`" on the belief that it is new; it is not, and the correct
move is better than the one they asked for:

- **`EVENT_NAMES` stays at 76.** This phase contributes **zero** names.
- **`events.test.ts`'s ceiling is 76 and `EVENT_NAMES.length` is 76** (both measured this
  session). So the taxonomy is AT its ceiling, and **Phase 2's `history.item_deleted` is the
  name that has to move it 76 -> 77 with a register entry.** This phase must not touch that
  test, and Phase 2 must not assume somebody else already did.
- **What was considered and rejected:** a new name `history.reading_refilled`. It would have
  meant one more name at a ceiling that is already binding, and — worse — it would have put the
  history refill outside `where name = 'reading.retried'`, which is the query somebody runs to
  ask "how often does a retry happen at all". Same argument that killed `chat.message_blocked`
  in favour of `moderation.refused { surface: 'chat' }`. **Two props instead of a name**, which
  is this file's own rule 4 and the 66 -> 67 precedent verbatim.
- **What was considered and dropped from the shape:** an `outcome` prop. A refill's outcome is
  already `reading.completed` / `reading.failed` with `source: 'client'` and the same
  `reading_id`, and a fact recorded twice is how two records drift.

**Code — replace line 367:**

```ts
  /**
   * ── `surface`, `reading_id`, `prior_status` AND `age_days` (2026-08-28) ────
   *
   * **FOUR PROPS AND NOT A SECOND NAME, AT A CEILING THAT IS ALREADY BINDING.**
   * `/history/[id]` gained a `Coba ulang` control for a reading stored with
   * `body IS NULL`, and it is a retry: same reader, same service, same act. A
   * `history.reading_refilled` was drafted and dropped, because it would have
   * taken the taxonomy to 77 for nothing AND put the refill outside
   * `where name = 'reading.retried'` — which is the query that answers "how
   * often does anybody retry at all". Same reasoning that folded
   * `chat.message_blocked` into `moderation.refused.surface`.
   *
   * `reading_id` IS NULL ON THE DRAW SCREEN AND IT IS NOT A GAP. A draw-screen
   * retry re-sends `/api/reading` and mints a NEW `readings.id`, which does not
   * exist when the button is pressed; a history refill keeps the id it is
   * refilling. So the column separates the two mechanics as well as the two
   * surfaces, and `surface` says which without a join.
   *
   * `prior_status` IS THE ONE MEASUREMENT THIS FEATURE OWES ITSELF. Retryability
   * is `body IS NULL` and deliberately not a status list, so `aborted` (the
   * querent walked away) and `failed` (the stream died) are indistinguishable
   * from the screen. This is the only instrument that says whether that was the
   * right call. Null on the draw screen, where there is no stored row yet.
   *
   * `age_days` IS `dayOffset(today, local_date)` AND IS 0 ON THE DRAW SCREEN,
   * which is true rather than a filler: the reading being retried there is
   * seconds old. It answers whether anybody comes back to a week-old empty
   * reading, which is the difference between a recovery affordance and an
   * archaeology one.
   *
   * **`attempt` MEANS SOMETHING SLIGHTLY DIFFERENT ON EACH SURFACE AND THAT IS
   * WRITTEN DOWN RATHER THAN NORMALISED.** On the draw screen it is a ref that
   * counts presses within one draw. On `/history/[id]` it counts presses within
   * one page view; nothing stores how many times a reading has been refilled, so
   * a second visit starts at 1 again. Group by `reading_id` for the true total.
   */
  'reading.retried':           { reader_id: string; service_id: string; attempt: number;
                                 surface: 'draw' | 'history'; reading_id: string | null;
                                 prior_status: 'ok' | 'partial' | 'failed' | 'aborted' | 'blocked' | null;
                                 age_days: number };
```

**Also edit the name's own line comment at `:79`** (inside `// — the reading —`), leaving the
name itself untouched:

```ts
  'reading.aborted',
  /* TWO SURFACES SINCE 2026-08-28 — the draw screen's error panel and
     `/history/[id]`'s refill. See its prop shape for why that is `surface` and
     not a second name. */
  'reading.retried',
  'reading.rate_limited',
```

**Impact:** `Draw.tsx:680` stops compiling until Step 5. `EVENT_NAMES.length` is unchanged, so
`events.test.ts` stays green from this phase's side.

---

### Step 5: The compile fix at the existing call site

**File:** `src/app/[reader]/[service]/Draw.tsx:678-686`

**Change:** Four props, no behaviour change. **This file is outside this phase's declared scope
and is edited anyway**, because Step 4 makes it a type error and a phase must build on its own.
Nobody else in this plan set touches Draw.tsx.

**Code — replace the `onRetry` handler:**

```tsx
      <ReadingPanel
        state={reading}
        onRetry={() => {
          attempt.current += 1;
          track('reading.retried', {
            reader_id: reader.id,
            service_id: service.id,
            attempt: attempt.current,
            /*
             * THE FOUR PROPS `/history/[id]`'s REFILL ADDED. Three of them are
             * null-or-zero here and none of them is a filler: this retry mints a
             * NEW `readings.id` that does not exist yet, there is no stored row
             * to have had a status, and the reading being retried is seconds
             * old. See the shape in `events.ts`.
             */
            surface: 'draw',
            reading_id: null,
            prior_status: null,
            age_days: 0,
          });
          requestReading(picks, question);
        }}
      />
```

**Impact:** the tree compiles. No runtime change on the draw screen.

---

### Step 6: The list-row hint — a string, and no `HistoryItemRow.tsx` edit

**Decision.** The phase scope asks "whether the list row HINTS that a retry is available", and
recommends a hint rather than a second control. **It hints, and the hint is a change to the
sentence the row already renders, so `HistoryItemRow.tsx` and its `.module.css` are not touched
at all.** Three reasons:

1. **`!item.hasBody` is already exactly the retry predicate.** `hasBody` is `body is not null`
   computed in SQL, and retryability is `body IS NULL`. The row is already rendering a line on
   precisely the set of rows that can be retried; the line just does not say what to do next.
2. **One place to press.** A control in the row would be a second destination for the same act,
   next to a swipe-to-delete control Phase 2 is adding to the same 88px of screen — one
   destructive gesture and one generative one, on the same row, on a phone.
3. **Phase 2 is rewriting that file into a swipe container.** A phase that can hit its exit
   criteria with zero edits to a file another phase is restructuring should take that deal.

The old string states a fact and stops. The new one states the fact and names the one place the
querent can act on it.

**Impact:** the collision on `HistoryItemRow.tsx` and `HistoryItemRow.module.css` **does not
exist**. Phase 2 owns both files outright.

---

### Step 7: `src/lib/i18n/locales/id.ts` — Indonesian first

**File:** `src/lib/i18n/locales/id.ts`, the `history.*` block — **BY ANCHOR, NOT BY LINE
NUMBER.** On `origin/main` this block is `:904-916`; **Phase 2 lands before this phase and
inserts eight `history.item.delete.*` keys immediately after `'history.item.shared'`, so by the
time this step runs the range has grown and a literal `904-916` replacement would DELETE THOSE
EIGHT KEYS.** `id.ts` owns the key set, so that is not a silent loss: `en.ts` goes red as a
superset and every `t('history.item.delete.…')` call in `HistoryItemRow` renders the key.
**Find `'history.item.unfinished'` and edit outward from it**, and keep Phase 2's block exactly
where it is — the placeholder line in the code below marks the spot.

**Change:** amend one string, add five. Indonesian is written first and the red typecheck on
`en.ts` is the feature (I3), not a nuisance.

Checked against the constraints that bind: none of the eleven Malay-only words
(`kerjaya`, `hala tuju`, `sembang`, `awak`, `tempoh`, `kerana`, `iaitu`, `ianya`, `manakala`,
`seronok`, `kelmarin`) appears; nothing implies therapy, diagnosis, treatment or healing; card
and reader names do not occur.

**Code — the block, post-Phase-2 (the placeholder is not a line to type):**

```ts
  // A row whose reading never finished. It is SHOWN -- the querent drew those
  // cards, and the frequency verdict already counts them -- so it has to say why
  // there is no text behind it, or opening it reads as a bug.
  //
  // THE SECOND SENTENCE IS THE WHOLE OF THE LIST'S RETRY HINT (2026-08-28), and
  // it is a string change rather than a control because `!hasBody` is already
  // exactly the retryable set. A button here would be a second place to press
  // for one act, on the same row as a swipe-to-delete.
  'history.item.unfinished': 'Bacaan ini tidak selesai. Buka untuk coba ulang.',
  'history.item.shared': 'Dibagikan',

  // ⟨PHASE 2'S EIGHT `history.item.delete.*` KEYS STAY HERE, UNTOUCHED.⟩

  'history.detail.back': '← Jejak',
  'history.detail.question': 'Pertanyaanmu',
  'history.detail.noBody': 'Tidak ada teks yang tersimpan untuk bacaan ini.',
  // The pulsing label while V2's translator streams. Same register and same job
  // as `reading.waiting`: it has to hold a screen for several seconds without
  // looking hung.
  'history.translating': 'Menerjemahkan…',

  // ── The refill (2026-08-28) ───────────────────────────────────────────────
  //
  // `Coba ulang` IS MIFTAH'S WORD AND IS NOT `common.retry`, which reads
  // `Coba lagi`. The two are one letter apart in Indonesian and a world apart in
  // meaning: `common.retry` sits under an error and means "send that request
  // again", while this sits under a reading that never arrived and means "write
  // this one now". Reusing the generic key would have made the page say
  // `Coba lagi` under prose that never existed to be tried.
  //
  // THE HINT IS THE PROMISE THE FEATURE HAS TO KEEP: the hand does not move.
  // `refillReading` never touches `reading_cards`, so this sentence is
  // enforced by the query rather than by the copy -- which is exactly why it can
  // be said out loud.
  'history.retry.action': 'Coba ulang',
  'history.retry.hint': 'Kartunya tetap sama. Hanya teksnya yang ditulis ulang.',
  'history.retry.waiting': 'Menulis ulang bacaan…',
  // The rare branch: the refill came back in the reading's own language and the
  // app is in the other one. `ReadingView` has already put a `lang` attribute on
  // it; this line says what that means. Opening the page again is a real
  // instruction rather than a hedge -- the row is stored by then, and the
  // ordinary translation path takes over.
  'history.retry.otherLanguage':
    'Teksnya ditulis dalam bahasa asli bacaan ini. Buka lagi halaman ini untuk melihat terjemahannya.',
  // THE TERMINAL ANSWER (reconciled): Phase 3's `409 not_retryable` and
  // `404 not_found`. Both mean this page is looking at a row that is no longer
  // what it thought, most often because the querent deleted it in another tab or
  // a first refill has already landed. It must NOT say "coba lagi": the button
  // is gone by the time this renders, and asking somebody to retry a thing that
  // answered "no" is the loop this member exists to break. It does not say WHICH
  // of the four things happened, because the route deliberately does not tell it.
  'history.retry.stale': 'Bacaan ini sudah tidak bisa diulang. Muat ulang halaman ini.',
```

**Impact:** `en.ts` stops compiling with TS2739 naming all five missing keys.

---

### Step 8: `src/lib/i18n/locales/en.ts`

**File:** `src/lib/i18n/locales/en.ts`, the `history.*` block — **BY ANCHOR, NOT BY LINE
NUMBER**, for Step 7's reason exactly: `:468-475` is the `origin/main` range and Phase 2 has
already inserted its eight keys after `'history.item.shared'` (`:469`). Find
`'history.item.unfinished'` and edit outward from it.

**Change:** the same six strings. Written as English, not translated from the Indonesian.
Checked against the English tic list: no `dear one`, no `the Universe`, no `soul's journey`, no
closing offer, and nothing from the therapy list.

**Code — the block, post-Phase-2 (the placeholder is not a line to type):**

```ts
  'history.item.unfinished': 'This reading did not finish. Open it to try again.',
  'history.item.shared': 'Shared',

  // ⟨PHASE 2'S EIGHT `history.item.delete.*` KEYS STAY HERE, UNTOUCHED.⟩

  'history.detail.back': '← History',
  'history.detail.question': 'What you asked',
  'history.detail.noBody': 'No text was kept for this reading.',
  'history.translating': 'Translating…',

  // ── The refill (2026-08-28). See id.ts for why this is not `common.retry`. ──
  'history.retry.action': 'Try again',
  'history.retry.hint': 'The cards stay as they were. Only the text is written again.',
  'history.retry.waiting': 'Writing the reading…',
  'history.retry.otherLanguage':
    'This came back in the language the reading was written in. Open the page again to see it translated.',
  // See id.ts: this is the terminal answer, and it must not say "try again".
  'history.retry.stale': 'This reading can no longer be retried. Reload the page.',

```

**Impact:** the catalogs typecheck. `npm test -- i18n` covers the pair.

---

### Step 9: The comment at `queries/history.ts:323` that is now false

**File:** `src/lib/db/queries/history.ts:319-325` (inside `readingsForDay`'s header)

**Change:** line 323 currently reads *"They render with a 'this reading did not finish' line and
no retry (VD14)."* Both halves have moved: the line gained a second sentence and the retry
exists. **Edited, not deleted** — the sentence is where a future reader learns that `failed` and
`aborted` are shown on purpose.

**Code — replace lines 319-325:**

```ts
 * `failed` and `aborted` STAY. The querent drew those cards, R7 already counts
 * them toward the frequency verdict, and a History that hides a draw the
 * frequency feature counted makes two features disagree about the same past --
 * which is precisely the class of failure the memory workstream exists to avoid.
 * They render with a "this reading did not finish" line that now also offers a
 * REFILL -- `/history/[id]`'s `Coba ulang`, which regenerates prose in place over
 * the stored hand. **THAT IS A NARROW AMENDMENT TO VD14 AND NOT A REVERSAL:**
 * VD14's argument is that a regeneration would make the querent's memory of the
 * reading and the app's disagree, and a row with `body IS NULL` has no
 * remembered text to disagree with. Retryability is `body IS NULL` and never a
 * status list -- see `src/lib/reading/retryable.ts`.
 * `partial` is shown as normal: it has real prose, and the `[Bacaan terputus…]`
 * notice deliberately never reached `readings.body` -- so it is also never
 * retryable.
```

**Impact:** comment only. The other edits to this file are Phase 1's (`softDeleteReading`, the
read filters) and Phase 3's (`refillReading`); this touches neither.

---

### Step 10: `docs/plans/2026-07-27-history.md`

**File:** `docs/plans/2026-07-27-history.md:111-118` and `:3046-3050`

**Change A — VD14, at line 111.** The statement stands; the amendment is bounded and is written
next to it rather than in place of it. **Append after line 118** (leave 111-118 byte-identical):

```markdown
**AMENDED 2026-08-28, NARROWLY, AND THE BOUND IS THE WHOLE OF IT.** VD14's argument
is about a reading that HAS prose — *"the querent's memory of what they were told and
the app's would disagree"* — and it does not reach a row stored with `body IS NULL`,
where there is nothing remembered for a regeneration to disagree with. `/history/[id]`
therefore offers `Coba ulang` on exactly that set and on no other:
`src/lib/reading/retryable.ts` answers from `body IS NULL`, **never from a status
list**, so `partial` — which has real prose that simply stops — is never retryable.
The refill updates the row in place and never touches `reading_cards`, so the
reconstruction VD14 is really about is unchanged: same cards, same orientations, same
slots. Everything else in this paragraph is intact — no fan, no reshuffle, no
return-card button, and `CardDetail` is still mounted without `onReturn`.
```

**Change B — open question 7, at lines 3046-3050.** Answered. **Replace those five lines:**

```markdown
7. **Should the detail screen offer "read again with the same cards"?** VD14 says
   the replay does not re-run the reading, and I have built exactly that. A
   *separate, clearly-labelled* action that starts a NEW reading from the same
   hand is a different feature and might be a good one — it is the most obvious
   thing a querent will reach for on this screen. Out of scope, worth recording.

   **ANSWERED 2026-08-28, AND THE ANSWER IS NARROWER THAN THE QUESTION.** Miftah
   asked for it against three production rows rendering *"Bacaan ini tidak
   selesai"*. It shipped as `Coba ulang` on `/history/[id]`, restricted to
   `body IS NULL` — so it is not "a NEW reading from the same hand" but the
   ORIGINAL reading finally getting its prose: same `readings.id`, same
   `reading_cards`, every foreign key still pointing where it pointed. A reading
   that already has prose still offers nothing, which is VD14 unamended. The
   plan is `HISTORY_RETRY_AND_SOFT_DELETE_PLAN.md`, the predicate is
   `src/lib/reading/retryable.ts`, the endpoint is
   `POST /api/reading/retry/[id]`, and the amendment is written beside VD14 at
   the top of this file.
```

**Impact:** documentation. No code depends on either line.

---

### Step 11: `docs/workstream-notes.md` — where the evidence goes

**File:** `docs/workstream-notes.md`, V6's section. **Insert immediately before line 1216's
`### Still open, and none of it is V6's to close`**, so the new material sits inside V6 and
above what is still open.

**Change:** this is where the new evidence lives. CLAUDE.md gets the two rulings and nothing
else (Step 12).

**Code:**

```markdown
### The refill and the delete (2026-08-28)

Miftah pulled production and found three rows rendering *"Bacaan ini tidak selesai"*, and
separately asked for a swipe-to-delete because *"sometimes user asked some embarrassing
questions in the past"*. Two features, one surface, four phases.

**VD14 IS AMENDED AND THE BOUND IS `body IS NULL`.** VD14's argument is that regenerating
prose the querent already read makes their memory and the app's disagree — and that argument
never reached a row with no prose in it, because there is nothing remembered to disagree with.
`src/lib/reading/retryable.ts` is the predicate and it is PURE, so the browser and the route
ask the same question of the same function. **It is not a status list, and widening it to one
is the way this feature breaks:** `partial` has real prose that stops mid-sentence, `aborted`
and `failed` are indistinguishable from the row, and the screen has only ever said "this
reading did not finish". A status the UI never shows must not silently change what a button
does. `docs/plans/2026-07-27-history.md`'s open question 7 asked for exactly this in 2026-07
and deferred it; it is answered there, in place, rather than in a new document.

**THE REFILL KEEPS `readings.id` AND NEVER TOUCHES `reading_cards`.** That is what makes the
hint copy (*"Kartunya tetap sama"*) a promise the query keeps rather than a sentence somebody
has to remember. Six foreign keys point at that id — `reading_cards`, `llm_calls`,
`chat_messages.attached_reading_id`, `chat_runs.trigger_reading_id`, `translations.entity_id`,
`share_links.entity_id` — and an insert-a-new-row design would have orphaned all of them.

**A RETRIED READING CARRIES TWO `llm_calls` ROWS AND TWO CLIENT `reading.completed` EVENTS FOR
ONE `reading_id`, AND BOTH ARE RECORDED RATHER THAN FIXED.** `readingCostsFor` folds every
`reading_id`-bearing row with no `op` predicate, so `/admin` shows the sum of both attempts —
which is arguably right, because both were paid for. On the events side, `reading.retried` with
`surface: 'history'` is the discriminator that says which `reading.completed` is the second.
Do not "deduplicate" either without deciding what the number is supposed to mean.

**`reading.retried` WAS ALREADY IN THE TAXONOMY AND WAS ALREADY FIRED, BY `Draw.tsx`.** The
analysis said to fold a new name in; the file said the name exists. So the release added
**zero** names and widened one shape instead — `surface`, `reading_id`, `prior_status`,
`age_days` — which is `events.ts`'s own rule and the 66 -> 67 precedent. It also mattered
arithmetically: `EVENT_NAMES.length` and `events.test.ts`'s ceiling were **both 76** when this
work opened, so the taxonomy was at its cap and the delete's `history.item_deleted` is what had
to move it. **`[R1]`'s lesson repeated: a session trusting a prose count instead of the
register would have added a name, gone red, and looked for the cause in its own diff.**

**`prior_status` IS THE MEASUREMENT THE `body IS NULL` RULING OWES ITSELF.** If nearly every
refill turns out to be on an `aborted` row, the feature is somebody wandering back to a reading
they walked out on, which is a different product from recovering a dead stream — and the
ruling should be revisited on that evidence rather than on taste.

#### `HistoryDetail` now has two async sources of prose, and one line keeps them apart

`needs` is computed from the SERVER PROP `reading`, never from the refilled view, and the retry
deliberately does **not** call `router.refresh()`. So `reading.body` stays null for the life of
the page, `needs` stays false, and V2's translation effect cannot fire during or after a refill.
A reading that has prose is never retryable, so the reverse pairing is unreachable. **If
somebody adds a refresh, that is the sentence that stops being true.**

**THE REFRESH IS ABSENT FOR A SECOND REASON AND IT IS THE STRONGER ONE.** The retry route
writes its row in the response's own `defer()`, exactly as `/api/reading` does — so a
`router.refresh()` fired when the stream ends races the write and would very likely re-read the
OLD row, repainting *"Tidak ada teks yang tersimpan"* over prose the querent just watched
arrive. `ShareFooter`'s three 250ms attempts exist because of that same race. The optimistic
view stands until they navigate; the next open reads the stored row.

**RULE 4 SURVIVES THE REFILL BECAUSE OF `refillView`, NOT BECAUSE OF THE COMPONENT'S CARE.**
`resolveProse` short-circuits on `reading.body === null`, so a refill cannot be delivered
through the `prose` prop at all — it has to become a COPY of the reading carrying the language
the prose was generated in. `refillView` is that copy plus the decision, it is exported, and
`HistoryDetail.test.ts` is its truth table. The mismatch branch returns `{ kind: 'as-written' }`
— V7's member, a NAMED decision that `ReadingView` renders with a `lang` attribute — and never
`{ kind: 'original' }`, which `resolveProse` treats identically to an omitted prop and which
would put an Indonesian paragraph in an English app through the path built to prevent it.

**THE REFUSAL RENDERS ABOVE `ReadingView`, NOT IN ITS `footer` SLOT.** `ReadingView` renders
`common.disclaimer.long` immediately before `footer`, so a refusal there would sit directly
under *"for entertainment only"* — which `ReadingPanel`'s header calls obscene for the self-harm
category. It scrolls itself into view once, because the control that produced it is at the
bottom of a page taller than a phone.

**THE 403 BRANCH SITS ABOVE `!res.ok`, AND A REFUSAL ON RETRY IS A CORRECT OUTCOME.** The
question was classified once, before the first attempt; the classifier is allowed to have moved,
and one `glm-4.5-flash` call per refill is the price of not regenerating a stored question with
no gate. The row is left exactly as it was, so the control comes back.

#### The list row hints in a string, and `HistoryItemRow.tsx` was not edited for it

`history.item.unfinished` gained a second sentence — *"Buka untuk coba ulang."* — instead of the
row growing a control. `!item.hasBody` is already exactly the retryable set, so the row was
already rendering a line on precisely the right rows and only needed to say what to do next.
The other two reasons: one place to press, and the same 88px was simultaneously growing a
swipe-to-delete, so a generative control and a destructive one would have shared a row on a
phone.

#### What only a real iPhone can answer

The button is 44px by explicit `min-height` rather than by arithmetic on its padding —
`PublicShare`'s 36px control is the recorded defect that rule exists because of — but **nobody
has pressed this on glass.** Loop 4 measures the width at 320/360/390; loop 5 can drive the real
button and read the outgoing request and gives a ~500px layout whatever `--width` says. What is
open: the thumb reach of a control at the bottom of a long scroll, whether the pulsing label
reads as progress or as a hang across a real generation on a cold Neon compute, and whether the
refusal's `scrollIntoView` lands somewhere sensible on a phone-height viewport.
```

**Impact:** documentation only.

---

### Step 12: `CLAUDE.md` — two rulings in, EXACTLY net zero

**File:** `CLAUDE.md:1137-1142` and `:1201-1223`

**RECONCILED, AND THE V6 BLOCK GREW BY 56 BYTES AGAINST THE DRAFT.** Phase 1 earned a ruling of
its own — *a reading delete revokes its share links and **clears the day summaries written
about it**, in the same transaction, before the flag* — and the draft's V6 replacement named
only the revoke. **`isStale` cannot see a REMOVED source id**, so without `clearDaySummaries`
the read filter alone leaves a reader's paragraph describing a reading the querent just
deleted, for ever. That is exactly the class of fact this file is for, so it is bound here and
Phase 1 writes no `CLAUDE.md` line of its own. **ONE FILE, ONE OWNER, ONE MEASUREMENT** — two
phases both editing it is how the byte count goes wrong.

**Change:** net-neutral, measured with `wc -c` (not Python's `len()`, which reads ~700 lower
because the em-dashes are multi-byte). All four numbers **re-measured by the reconciler in the
worktree**, not carried over from the draft:

| Block | Before | After | Delta |
|---|---|---|---|
| `## Analytics and reading history (W4)`, the `events.ts` bullet, lines 1137-1142 | 501 | 370 | **−131** |
| `## History (V6)`, lines 1201-1223 | 1718 | 1849 | **+131** |
| | | **NET** | **0** |

`CLAUDE.md` is **142,385** bytes before this edit and **142,385** after, against a 150k
rejection threshold. **This is net-neutral in the strict sense the rule asks for**: a ruling
added here compressed one out in the same commit, byte for byte, and the ledger above is the
proof rather than the claim. **Phases 1–3 must not add a CLAUDE.md bullet of their own.**

**What is displaced, and why it is a deduplication rather than a loss.** The W4 bullet **said
`67 names` while the file held 76** — a stale count of exactly the kind the group-chat section
already ruled against (*"the same rule was stated in prose four times and three of the four were
stale; do not restate the count"*, whose answer was `src/lib/admin/ops.ts`). `events.test.ts` is
the machine-checked register for this one, so the line now points at it instead of restating it.
On the V6 side, the sentence *"which is what stops a caller shipping the bug by forgetting a
prop"* and the `as-written` clause both survive verbatim in `docs/workstream-notes.md` at 12556
and 12562 and in `ReadingView.tsx`'s own header; the section's pointer line names them.

**Code — replace `CLAUDE.md:1137-1142`:**

```markdown
- **`events.ts` IS THE CLOSED TAXONOMY: a prop shape each, NO IMPORTS, ONE OWNER PER RELEASE.**
  `events.test.ts`'s ceiling is the machine-checked register and holds the fold ledger; folding
  a declaration in means TRANSCRIBING it, not narrowing it, and expect to FOLD rather than add.
  **Do not restate the count here** — this line said 67 while the file held 76.
```

**Code — replace `CLAUDE.md:1201-1223`:**

```markdown
## History (V6)

`/history` lists the querent's readings by day; `/history/[id]` reconstructs the draw, refills
an unfinished one, and a row swipes left to a soft delete. `src/lib/history/**`,
`src/lib/reading/retryable.ts`, `src/lib/db/queries/history.ts`, `src/app/history/**`,
`src/app/api/{history,reading/retry}/**`. **The rest — `parseLocalDate` vs `isHistoryDate`, the
`todayKey()` trap, rule 4's `as-written` hatch and every measurement — is in
`docs/workstream-notes.md`.** What stays here reaches outside V6:

- **`ReadingView` IS THE ONE RENDERER THREE SURFACES MOUNT (VD10)**, so its four rules bind the
  draw screen, `/history/[id]` and `/s/<slug>` together: no session, no fetch, and no
  `@/lib/db/**` import *even as `import type`*. **Rule 4 is the one to protect: it NEVER renders
  `reading.body` when `reading.locale` differs from the viewer's and no translation was
  supplied** — it renders the translating state. The component's invariant, not the caller's
  discipline; **a refilled reading is in `readings.locale` like any other.**
- **THE `blocked` FILTER IS SECURITY-ADJACENT** — that `question` is text W7 redacts from
  `moderation_flags` at 30 days. `failed` and `aborted` ARE shown.
- **RETRY IS `body IS NULL`, NEVER A STATUS LIST. A DELETE REVOKES EVERY SHARE LINK AND CLEARS
  THE DAY SUMMARIES WRITTEN ABOUT IT, IN ONE TRANSACTION, BEFORE THE FLAG.** VD14 argues about
  prose the querent already read, so it never reached an empty row; `retryable.ts` is the
  predicate both sides ask, a refill keeps `readings.id`, and `partial` has prose and never
  retries. `redactForUser`'s order, because the feature is embarrassment, not disk — `isStale`
  cannot see a removed source id — and there is no restore, so the copy must not imply one.
- **`/history` IS GATED AND `isPublic()` MUST NEVER LEARN IT.**
```

**Impact:** two rulings bound (including Phase 1's day-summary clear), one stale count killed,
and the file exactly the size it was — 142,385 bytes before and after.

---

## Verification

**Build:**
```sh
export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH
npm run typecheck
npm run build          # NOT optional — the TypeScript 5.x trap. Retry once on
                       # `Can't resolve '@vercel/turbopack-next/internal/font/google/font'`,
                       # which is the AAAA-lookup trap and not a code failure.
wc -c CLAUDE.md        # must read 142385 — UNCHANGED. Net zero, not net negative:
                       # the V6 block gained 131 and the W4 bullet gave up 131.
```

**Tests:**
```sh
npm test               # unit only, no Docker. 3681 in 193 files on this base,
                       # plus this phase's HistoryDetail.test.ts
npm test -- i18n       # the catalogs, format, resolve and the length budget
npm test -- events     # THIS phase adds no name: 76 before Phase 2, 77 after it, and
                       # the ceiling is Phase 2's to move. Red here means somebody
                       # added a name in this phase.
npm run test:integration   # needs `npm run db:up`; unchanged by this phase
```
**Run the two projects separately.** `npm run test:all` fails 12–22 of V9's limiter tests as a
known harness race and its red does not mean anything.

**Which loop verifies what, and what none of them can:**

- **Loop 1 (Vitest, `environment: 'node'`).** `refillView`'s truth table — including the one
  assertion that matters, that a refill in the language the viewer is not reading never reaches
  `resolveProse`'s `original` branch. The unit project has **no DOM**, so it cannot render
  `HistoryDetail`, cannot run the effect, and cannot see the stream. That is exactly why the
  decision was extracted into a pure exported function; a test that could only assert the first
  static render would assert nothing about the bug worth preventing.
- **Loop 4 (fixed-width container + `getBoundingClientRect`, `tools/seo/fit.sh`'s technique).**
  The width of the control and of the two prose lines at 320/360/390. `history.retry.hint` and
  especially `history.retry.otherLanguage` are the long strings; measure `scrollWidth >
  clientWidth` on the block. **THIS IS THE LOOP FOR WIDTH and loop 5 is not.**
- **Loop 5 (real Chrome over CDP, `tools/e2e/run.sh`).** The end-to-end press against a preview
  or `E2E_BASE=http://localhost:3001` with a real session: that the button appears only on a
  `body IS NULL` row, that the outgoing request is `POST /api/reading/retry/<uuid>` with **no
  picks and no question in the body**, that prose streams into the page, and that a reload shows
  the stored version. It can also reproduce the Safari focus trap class of bug, since a
  programmatic `.click()` does not focus a button either. **It does NOT give a phone width** —
  `innerWidth` and `outerWidth` are both 500 whatever `--width` says.
- **Loop 6 (a real iPhone against a Vercel preview) — and be honest that this is the gate.**
  Only hardware answers: whether the 44px control is reachable by thumb at the bottom of a long
  scroll; whether the pulsing `Menulis ulang bacaan…` reads as progress or as a hang across a
  real generation on a cold Neon compute (the route is `maxDuration = 60` and the querent is
  watching); whether the refusal's `scrollIntoView` lands somewhere sensible on a phone-height
  viewport; and safe-area behaviour with the control near the bottom inset. **No unit test and
  no WSL loop stands in for any of these.**

**Manual check:**
1. Seed or find a reading with `body IS NULL` (`npm run db:seed` writes two weeks of history;
   null one row's `body` and `gist` by hand in `db:studio` if none is there).
2. Open `/history` — the row must read *"Bacaan ini tidak selesai. Buka untuk coba ulang."*
3. Open it. The control is under the disclaimer with its one-line hint. Press it.
4. Watch prose arrive. Reload: the same prose comes from the stored row with no spinner.
5. Press it on a reading that HAS prose: **there must be no control at all.**
6. Force a refusal: temporarily set the reading's `question` to something Tier A and press. It
   must render `RefusalNotice` **above** the reading, with the clause link, and never the
   generic *"Bacaan tidak bisa dimulai"*.
7. Switch the app to English on an Indonesian empty reading and press. The prose must not appear
   raw; either it paints (route generated in `en` and said so) or the `otherLanguage` line
   appears and a reload shows a translation.

**Exit criteria:**
- The control appears on exactly the readings `isRetryable` admits and on no others.
- Pressing it streams prose into the page and a reload shows the stored version.
- A moderation refusal renders `RefusalNotice` above the reading and not a generic error, and
  the row is unchanged.
- A viewer in the other locale never sees raw foreign prose from a refill.
- Both catalogs typecheck; **this phase moves `EVENT_NAMES.length` by zero** and never touches
  `events.test.ts`.
- `wc -c CLAUDE.md` reads **142,385 — exactly what it read before the phase.** Net-neutral in
  the strict sense: +131 in `## History (V6)`, −131 in the W4 `events.ts` bullet.

---

## Handoffs

- **`x-reading-locale` — GRANTED, AND THE LOCALE QUESTION IS ANSWERED** (reconciled). Phase 3's
  route now sends `x-reading-locale: <readings.locale>` and its Interface Contract lists it.
  **`refillReading` does NOT update `readings.locale`: it is immutable, and the prose is
  regenerated in it.** `ReadingRefill` carries no `locale` field, so the column cannot move even
  by mistake, and the route's `readLocale` / `viewLocale` split keeps the prose in the reading's
  language while the chrome follows the querent's UI. **The plan index's invariant 7 has been
  amended to name `locale` on the must-not-touch side**, which is where the gap was.
- **`events.test.ts`'s ceiling is 76 and `EVENT_NAMES.length` is 76.** Phase 2's
  `history.item_deleted` moves it to 77 **and writes the register entry**, per `[R1]` — that
  sub-step was missing from Phase 2's plan and the reconciler added it (Phase 2, Step 6c). This
  phase deliberately does not touch that test.
- **Every status Phase 3 emits is now branched on** (reconciled). 401 -> `/login`; 429 ->
  `reading.rate_limited` + the rate-limit copy; 403 + `moderation_blocked` -> `RefusalNotice`,
  **above the `!res.ok` check**; **404 and 409 -> `{ kind: 'stale' }`, which takes the control
  away and asks for a reload**; 500 and 503 -> the generic `reading.failed` branch, which is
  correct because both are transient and the row is untouched.
- **`Draw.tsx:678-686` is edited by this phase** and by nobody else in the set. If the
  reconciler moves the `events.ts` widening to another phase, that edit moves with it.
- **Not done, deliberately:** no retry control on `/history` itself, no bulk retry, no retry on
  a reading that has prose, no `attempt` persisted anywhere. `attempt` counts presses within one
  page view; group by `reading_id` for the true total.
- **Not done, and worth a card:** `GET /api/persona` and both `/api/memory/*` routes still 500
  when the database is down instead of 204. Unrelated to this work and already recorded twice in
  the notes; noticed again while reading the history routes, which do 503 correctly.

---

## Rollback

`git revert` of this phase's commit alone. Nothing in it changes the schema, adds a migration,
adds an event name or moves a test ceiling.

Three things to know before reverting:

1. **It reverts the `reading.retried` widening and therefore the `Draw.tsx` call site with it**,
   which is consistent — the two are one commit for exactly that reason. Any `events` rows
   already written with `surface: 'history'` stay in the table and are readable; jsonb does not
   care that the type narrowed back.
2. **It leaves Phase 3's route live and unreachable from the UI**, which is the same state Phase
   3's own exit criteria describe. Nothing calls it, no querent can spend a budget through it.
3. **The doc edits revert with it, including the CLAUDE.md compression.** If the intent is to
   drop the control but keep the rulings, revert the code hunks and keep the `docs/` and
   `CLAUDE.md` hunks — the rulings are true regardless of whether the button is on screen, and
   the stale `67 names` fix is worth keeping either way. **Note that the delete half of the V6
   ruling is Phase 1's, not this phase's**: reverting this commit whole would un-bind a ruling
   about code that is still live. That is the strongest argument for the patch revert.
