/**
 * What a model call costs. **PURE. ZERO IMPORTS. HAND-MAINTAINED.**
 *
 * A2, v0.5.0, decision A-D7. Read this header before adding a row.
 *
 * ── WHY THIS IS A TABLE AND NOT A COLUMN ─────────────────────────────────────
 *
 * `llm_calls` stores tokens and the resolved model, and **cost is computed at read
 * time from here.** A `cost_usd` column would be a lie the day a price changed, and
 * back-filling it would rewrite history. Tokens and the model are the facts; a price
 * is an opinion with a date on it.
 *
 * So a price change is a **NEW ROW, never an edit** -- `effectiveFrom` is what makes a
 * historical range priceable with the prices of its own period. Editing a row in place
 * silently re-prices every month that came before it.
 *
 * ── AN UNKNOWN MODEL IS `null`, NEVER 0 ──────────────────────────────────────
 *
 * A zero silently understates the bill. A null shows up on screen as "unpriced" and
 * gets fixed. **And every cost figure must be rendered beside the count of calls it
 * could not price** -- `callTotals().untokenized` is that count for missing tokens,
 * and an unpriced *model* needs the same treatment, or a cost is quoted over an
 * incomplete denominator and reads as complete.
 *
 * ── THE 365-DAY TRIPWIRE, AND WHY IT IS DELIBERATE ───────────────────────────
 *
 * `prices.test.ts` **FAILS** on a row whose `verifiedOn` is more than 365 days old.
 * That is the `resources.ts` precedent, which says the same thing about a crisis
 * hotline: *nothing unverified enters it, and no number lives anywhere else.* A price
 * nobody has re-read is a number the dashboard is quietly asserting to the one person
 * who would act on it. The fix is five minutes on a pricing page.
 *
 * **DO NOT SILENCE IT BY BUMPING `verifiedOn` WITHOUT OPENING THE PAGE.** That
 * converts a tripwire into a lie with a fresh date on it, which is strictly worse than
 * the stale number it replaced.
 *
 * ── AND `bodyHash`'s LESSON APPLIES: SOMEBODY WILL WANT TO DELETE THIS FILE ───
 *
 * It is manual bookkeeping with no automatic source, exactly as `dateModified` was.
 * There is no API this project can call to learn what it is being charged. **The
 * honest alternative is not automating it -- it is rendering no cost at all**, which
 * is a legitimate choice and is in fact where this file starts (see `NOTIONAL_MODEL`).
 * What is not legitimate is emitting a number nobody maintains.
 */

export type ModelPrice = {
  /** The RESOLVED model string, matched exactly as `llm_calls.model` stores it. */
  model: string;
  /**
   * `'YYYY-MM-DD'`. From when this price applied.
   *
   * **A PRICE CHANGE IS A NEW ROW, NEVER AN EDIT.** Editing re-prices history.
   */
  effectiveFrom: string;
  /** USD per 1,000,000 tokens. Never null -- omit the row instead of guessing. */
  inputPerMTok: number;
  outputPerMTok: number;
  /** When a human last read this off the provider's own page. */
  verifiedOn: string;
  /** Where they read it. Must be an https URL a reviewer can open. */
  source: string;
  note?: string;
};

/**
 * Every price this project knows. Ordered by model, then by `effectiveFrom`.
 *
 * **z.ai's ROWS ARE ZERO AND THAT IS A FACT, NOT A PLACEHOLDER.** `LLM_API_KEY` is a
 * fixed annual Coding Plan subscription, not a wallet: no per-token charge exists, so
 * the marginal cost of a token really is zero and any other number here would be
 * invented. The risk that subscription carries is **quota exhaustion and key
 * revocation**, which is a count and not a cost -- which is why
 * `LLM_WINDOW_CALL_CEILING` is measured in calls and why reconciliation R14 made the
 * dashboard's headline figure a call count.
 *
 * **THE FALLBACK PROVIDER'S ROWS ARE DELIBERATELY ABSENT.** See `NOTIONAL_MODEL`.
 */
export const PRICES: readonly ModelPrice[] = [
  {
    model: 'glm-4.6',
    effectiveFrom: '2026-01-01',
    inputPerMTok: 0,
    outputPerMTok: 0,
    verifiedOn: '2026-07-30',
    source: 'https://docs.z.ai/devpack/overview',
    note:
      'ZERO ON PURPOSE, and verifiable: the Coding Plan is a fixed annual subscription ' +
      'with no per-token charge, so the marginal cost of a token is genuinely zero. ' +
      'Any figure derived from these rows is therefore not a bill -- see notionalUsd(). ' +
      'What this key can cost is the whole app at once, through revocation.',
  },
  {
    model: 'glm-4.5-flash',
    effectiveFrom: '2026-01-01',
    inputPerMTok: 0,
    outputPerMTok: 0,
    verifiedOn: '2026-07-30',
    source: 'https://docs.z.ai/devpack/overview',
    note: 'The moderation classifier (MODERATION_MODEL). Same subscription, same zero.',
  },
];

/**
 * The provider a notional cost is quoted against -- **what these tokens WOULD cost if
 * the fallback had to serve them.**
 *
 * That is the number worth watching, because a z.ai key revocation lands on the
 * fallback and turns a subscription into a bill overnight. It is the one cost figure
 * this project can act on.
 *
 * **AND IT IS DELIBERATELY UNSET, WITH `notionalUsd()` RETURNING `null` UNTIL A HUMAN
 * FILLS IT IN.** Nobody has read a current price page for `gemini-3.5-flash-lite` or
 * `gpt-5.6-luna`, and this file's own rule is that nothing unverified enters it. An
 * invented rate would produce a plausible dashboard number with no provenance, which
 * is the exact failure the 365-day tripwire exists to prevent -- committed on day one
 * rather than drifted into.
 *
 * **To turn it on:** open the provider's pricing page, add a `PRICES` row with a real
 * `verifiedOn` and `source`, and set this to that model string. Nothing else changes;
 * `notionalUsd()` starts answering. Until then A4's headline must be a call count
 * (R14 already requires that independently), and an honest empty state beats a
 * confident wrong figure.
 */
export const NOTIONAL_MODEL: string | null = null;

/**
 * The selection, over an arbitrary table. **EXPORTED SO THE PERIOD BOUNDARY IS
 * TESTABLE AGAINST SHIPPED CODE.**
 *
 * `PRICES` ships one row per model today, so a test of `priceFor` alone could not
 * exercise the case this function exists for -- and the first version of
 * `prices.test.ts` reimplemented the selection locally and asserted *that*, which is a
 * test that stays green while the real function is broken. **A test of a copy is not a
 * test.** Taking the table as a parameter is what makes "a range spanning a price
 * change is priced with the prices of its own period" a claim about this file.
 *
 * Both dates are `'YYYY-MM-DD'` and the comparison is a **string comparison**, which is
 * correct rather than lazy: ISO dates sort lexicographically, and parsing them into
 * `Date`s would reintroduce a timezone into a function whose entire input is a calendar
 * day. Same reason `local_date` is a string in the schema.
 */
export function pickPrice(
  rows: readonly ModelPrice[],
  model: string,
  on: string,
): ModelPrice | null {
  let best: ModelPrice | null = null;
  for (const row of rows) {
    if (row.model !== model) continue;
    if (row.effectiveFrom > on) continue;
    // Later `effectiveFrom` wins, so the array's own order does not matter -- a table
    // sorted by hand is a table somebody will eventually sort differently.
    if (best === null || row.effectiveFrom > best.effectiveFrom) best = row;
  }
  return best;
}

/**
 * The latest row for `model` whose `effectiveFrom <= on`. `null` for an unknown model,
 * and `null` for a date before the earliest row -- a range that predates the first
 * recorded price is unpriceable, and answering with today's rate would re-price
 * history.
 */
export function priceFor(model: string, on: string): ModelPrice | null {
  return pickPrice(PRICES, model, on);
}

/**
 * What a call actually cost, in USD. **`null` -- never 0 -- for an unknown model.**
 *
 * `null` also for tokens that were never reported, and the two nulls mean different
 * things a caller must not conflate: an unknown MODEL means "we cannot price this",
 * and null TOKENS mean "the provider told us nothing". Both are unpriceable, and both
 * belong in the count rendered beside the figure.
 *
 * **A null on ONE side does not zero that side.** `input: 1200, output: null` returns
 * null rather than pricing the input alone, because a half-priced call presented as a
 * cost is wrong in the direction that matters -- it understates. Partial data is not a
 * partial price.
 *
 * **PRICE OVER SUMS, NOT PER ROW.** `callTotals` groups by `(model, local_date, op)`
 * first; call this once per group. 100k rows then cost 100k additions and a few dozen
 * lookups rather than 100k table scans.
 */
export function costUsd(
  model: string,
  on: string,
  input: number | null,
  output: number | null,
): number | null {
  const price = priceFor(model, on);
  if (price === null) return null;
  if (input === null || output === null) return null;
  return (input * price.inputPerMTok + output * price.outputPerMTok) / 1_000_000;
}

/**
 * What these tokens would cost at `NOTIONAL_MODEL`'s rate. **The watchable number.**
 *
 * `null` while `NOTIONAL_MODEL` is unset, which is today. See its comment: that is an
 * honest empty state and not an unfinished one.
 *
 * **LABEL IT AS NOTIONAL ON SCREEN.** It is a counterfactual -- what a revocation
 * would start costing -- and presenting it as spend invites somebody to reconcile it
 * against an invoice that does not exist.
 */
export function notionalUsd(
  on: string,
  input: number | null,
  output: number | null,
): number | null {
  if (NOTIONAL_MODEL === null) return null;
  return costUsd(NOTIONAL_MODEL, on, input, output);
}
