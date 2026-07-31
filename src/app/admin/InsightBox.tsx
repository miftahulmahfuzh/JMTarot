'use client';

/**
 * The `Insight` button, its timestamp, and the box under it. **A7, 2026-07-31.**
 *
 * `docs/plans/2026-07-31-admin-panel-insights-design.md` §1. Mounted thirteen times
 * across `/admin` and `/admin/tokens`, with nothing panel-specific in it but the id.
 *
 * ── R21 SURVIVES: THIS FETCHES NO NUMBERS ──────────────────────────────────
 *
 * `/admin`'s header states it — *every number is queried server-side and there is no
 * fetch.* The stored insight arrives as a PROP, read in the page's own `withAdminRead`
 * alongside the rollup, so the first frame is server-rendered and there is no skeleton
 * on a range change. The only request this component ever makes is the one a press
 * causes, and its body is `{ panel, from, to }` — no figures leave the browser, because
 * the route rebuilds them from the ledger.
 *
 * ── §4.2's PAIRING: THE SERVER'S 60s NEEDS A BOUND HERE ────────────────────
 *
 * *A bigger `maxDuration` is not a latency regression, but it must be paired with a
 * bound on the client, or you have only made the hang longer.* `ABORT_MS` sits under
 * the route's `maxDuration` so the browser gives up first and says something, rather
 * than spinning into a platform timeout with no copy.
 *
 * **A TIMEOUT IS THE ONE OUTCOME THAT MEANS UNKNOWN**, so its sentence says the work may
 * have completed on the server and asks for a reload before a retry — the `POST
 * /api/locale` rule, and here it matters because a blind retry spends a second model
 * call on a row that may already exist.
 *
 * ── THE OPENER IS PASSED FOR FOCUS, AND THE BOX IS A LIVE REGION ───────────
 *
 * There is no dialog here, so `returnFocusTo` does not apply — but the same underlying
 * fact does: **Safari does not focus a `<button>` when it is tapped**, so after a press
 * the operator's focus is wherever it was and nothing would announce the new paragraph.
 * `aria-live="polite"` on the box is what says it arrived, without moving focus off a
 * control they may want to press again.
 */
import { useState } from 'react';
import { INSIGHT } from './copy';
import { stamp } from './format';
import styles from './InsightBox.module.css';

/**
 * Under the route's `maxDuration` of 60s, deliberately — the server must be the one to
 * give up first when the model is slow, so the operator gets this component's sentence
 * rather than a platform error page. Above `ADMIN_CLIENT_ABORT_MS`'s 15s, because that
 * number bounds a database read and this waits on a model.
 */
const ABORT_MS = 45_000;

type ErrorKind = keyof typeof INSIGHT.error;

export type InsightBoxProps = {
  /** A key from `insight/panels.ts`. **Never rendered** — it exists to name the panel
   *  to the route, which is the only thing that resolves it. */
  panel: string;
  from: string;
  to: string;
  /** The stored row, read on the server. `null` is the empty state. */
  initial: { body: string; updatedAt: string; stale: boolean } | null;
};

export function InsightBox({ panel, from, to, initial }: InsightBoxProps) {
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorKind | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/insight', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        /*
         * `force` is `true` whenever there is already an insight on screen, because the
         * button's word has changed to *Perbarui insight* by then and pressing it is a
         * deliberate ask for a fresh reading. On a first press it is `false`, so a
         * double-tap on an empty panel costs one model call rather than two.
         */
        body: JSON.stringify({ panel, from, to, force: state !== null }),
        signal: AbortSignal.timeout(ABORT_MS),
      });

      if (!res.ok) {
        // 404 is this tree's refusal for everything (A-D2) — an expired session included.
        setError(res.status === 503 ? 'unavailable' : 'failed');
        return;
      }

      const data: unknown = await res.json();
      const parsed = readResponse(data);
      if (parsed.kind === 'error') {
        setError(parsed.reason);
        return;
      }
      // Fresh prose describes the numbers the page is rendering right now, so the stale
      // line goes away — the hash it was computed from is the one on screen.
      setState({ body: parsed.body, updatedAt: parsed.updatedAt, stale: false });
    } catch {
      /*
       * `AbortSignal.timeout` rejects with a `TimeoutError`; an offline browser rejects
       * with a `TypeError`. **Both are treated as UNKNOWN**, because neither tells us
       * whether the server finished, and the copy for the safe answer is the same.
       */
      setError('timeout');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <button className={styles.button} type="button" onClick={run} disabled={pending}>
          {pending ? INSIGHT.pending : state ? INSIGHT.regenerate : INSIGHT.generate}
        </button>
        {state ? <span className={styles.stamp}>{INSIGHT.updatedAt(stamp(state.updatedAt))}</span> : null}
      </div>

      {/*
        The live region is present even when empty, because a region ANNOUNCED into
        existence is not announced at all — screen readers watch a node that was already
        in the accessibility tree. Same reason `RefusalNotice` is not conditionally
        mounted around its own text.
      */}
      <div className={styles.live} aria-live="polite" aria-label={INSIGHT.liveLabel}>
        {state?.stale ? <p className={styles.stale}>{INSIGHT.stale}</p> : null}
        {state ? <p className={styles.body}>{state.body}</p> : null}
        {error ? (
          <p className={styles.error} role="alert">
            {INSIGHT.error[error]}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type Parsed =
  | { kind: 'ok'; body: string; updatedAt: string }
  | { kind: 'error'; reason: ErrorKind };

/**
 * The response, narrowed by hand.
 *
 * **NOT A CAST.** This is the one place where a shape the server changed and this file
 * did not would render `undefined` inside a paragraph under a timestamp claiming it is
 * current — which reads as the model having produced nothing rather than as a
 * deployment skew. An unrecognised body is `failed`, which is the sentence that asks for
 * another press.
 */
function readResponse(data: unknown): Parsed {
  if (typeof data !== 'object' || data === null) return { kind: 'error', reason: 'failed' };
  const { status, body, updatedAt, reason } = data as Record<string, unknown>;
  if ((status === 'ok' || status === 'unchanged') && typeof body === 'string' && typeof updatedAt === 'string') {
    return { kind: 'ok', body, updatedAt };
  }
  if (status === 'error' && typeof reason === 'string' && reason in INSIGHT.error) {
    return { kind: 'error', reason: reason as ErrorKind };
  }
  return { kind: 'error', reason: 'failed' };
}
