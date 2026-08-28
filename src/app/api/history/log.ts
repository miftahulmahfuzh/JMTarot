import 'server-only';

/**
 * **NEVER LOG THE DRIVER ERROR IN PRODUCTION.** CLAUDE.md records this twice
 * already — `flush.ts` and the moderation path — and the history routes are the
 * third place it bites, for a sharper reason than either.
 *
 * A postgres error quotes the failing statement AND ITS BOUND PARAMETERS.
 * `readingsForDay` selects `readings.question`, so a bare
 * `console.error('...', err)` here puts the querent's typed question into the
 * platform log. `readingWithCards` additionally selects `body`, which is the
 * whole reading.
 *
 * `'delete'` IS THE FOURTH SURFACE AND IT BINDS NO USER TEXT AT ALL --
 * `softDeleteReading` selects `local_date` and binds two uuids and a timestamp.
 * It goes through the helper anyway, because the value of this rule is that it
 * has no exceptions to remember, and because the next statement somebody adds to
 * that transaction will not come with a fresh audit.
 *
 * `'retry'` IS THE FIFTH AND IS THE SHARPEST OF ALL FIVE.
 * `POST /api/reading/retry/[id]` loads its source row through `readingWithCards`,
 * which selects `question` AND `body` -- so a raw log there would put both the
 * querent's typed question and the whole reading into the platform log, from a
 * route that is not even in this directory. Declared here rather than there
 * because a `surface` union with two owners is how a merge drops one of them.
 *
 * Development prints everything, because there is nobody to leak it to.
 *
 * SHARED BY BOTH ROUTES AND BY THE DETAIL PAGE rather than copied three times.
 * The copy in `flush.ts` is deliberately separate — it must not acquire an
 * import from `app/` — but three copies inside one feature is how one of them
 * ends up logging the error object during a debugging session and staying that
 * way.
 */
export function logHistoryFailure(
  surface: 'list' | 'days' | 'detail' | 'delete' | 'retry',
  err: unknown,
): void {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[history] ${surface} failed`, err);
  } else {
    console.error(`[history] ${surface} failed`, {
      name: err instanceof Error ? err.name : typeof err,
    });
  }
}
