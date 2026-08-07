/**
 * The one place a chat failure is logged. **`[F1-23]`, and it is a privacy control
 * rather than a convenience.**
 *
 * ── NEVER LOG A DRIVER ERROR FROM A PATH THAT RUNS A CHAT QUERY ────────────
 *
 * **A postgres error quotes the failing statement AND ITS BOUND PARAMETERS**, and
 * `chat_messages.body` is one of them — text a person typed into a room where they
 * were invited to talk about the worst thing they have ever seen. `CLAUDE.md` states
 * the generalisation as the audit to perform: *"which of my bound parameters came from
 * a person."* On this surface the answer is: the body, the reply snippet, and —
 * through the prompt — six onboarding answers.
 *
 * So production logs **ids, an attempt number and SQLSTATE**; development prints the
 * whole thing, because there is nobody to leak it to. That asymmetry is `flush.ts`'s,
 * `moderation/log.ts`'s, `auth.ts`'s and V2's translate path's, and this is the fifth
 * member of the family rather than a new idea.
 *
 * ── A LEAF ON PURPOSE ─────────────────────────────────────────────────────
 *
 * No imports. Every route handler and `run.ts` reach it, including from inside a
 * `catch` that may itself be running after the response has flushed, and a logger that
 * could throw is a logger that turns a handled failure into an unhandled rejection.
 */

/**
 * SQLSTATE, if this is a postgres error. `sqlstate` is duplicated across this
 * project rather than imported, for `auth.ts`'s reason: a bundle should not acquire
 * an analytics module for six lines.
 */
function sqlstate(err: unknown): string | null {
  const code = (err as { code?: unknown })?.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

/**
 * Log a chat failure without logging what the querent wrote.
 *
 * `where` is a short machine-written classifier — `'advance'`, `'post'`, `'state'` —
 * and `ids` holds uuids and counters only. **A caller passing a body here has defeated
 * the whole file**, which is why the signature takes a `Record<string, string | number
 * | null>` rather than an `unknown` bag: a type that cannot hold the querent's
 * sentence is cheaper to keep honest than a rule about one that can.
 */
export function logChatFailure(
  where: string,
  err: unknown,
  ids: Record<string, string | number | null> = {},
): void {
  if (process.env.NODE_ENV !== 'production') {
    // Development only. There is nobody here to leak it to, and the bound parameters
    // are exactly what makes a driver error worth reading.
    console.error(`[chat] ${where} failed`, ids, err);
    return;
  }

  console.error(`[chat] ${where} failed`, {
    ...ids,
    name: err instanceof Error ? err.name : typeof err,
    sqlstate: sqlstate(err),
  });
}
