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
 * Development prints everything, because there is nobody to leak it to.
 *
 * SHARED BY BOTH ROUTES AND BY THE DETAIL PAGE rather than copied three times.
 * The copy in `flush.ts` is deliberately separate — it must not acquire an
 * import from `app/` — but three copies inside one feature is how one of them
 * ends up logging the error object during a debugging session and staying that
 * way.
 */
export function logHistoryFailure(surface: 'list' | 'days' | 'detail', err: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[history] ${surface} failed`, err);
  } else {
    console.error(`[history] ${surface} failed`, {
      name: err instanceof Error ? err.name : typeof err,
    });
  }
}
