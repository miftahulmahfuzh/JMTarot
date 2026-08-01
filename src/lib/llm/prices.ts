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
  /**
   * USD per 1,000,000 input tokens served from the provider's prompt cache.
   *
   * **ABSENT MEANS "BILL THEM AT THE FULL INPUT RATE", AND THAT IS DELIBERATE
   * RATHER THAN A GAP.** Providers discount cache reads heavily -- often to a tenth
   * -- so guessing a discount is guessing in the direction that UNDERSTATES, and
   * `costUsd`'s header says understating is the failure that matters here. A number
   * enters this field only when a human has read it off the pricing page, like
   * every other rate in this file.
   */
  cachedInputPerMTok?: number;
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
 * Coding Plan subscription, not a wallet: no DOLLAR is charged per token, so the marginal
 * cost of a token really is zero and any other number here would be invented. The risk
 * that subscription carries is **quota exhaustion and key revocation**, which is a count
 * and not a cost -- which is why reconciliation R14 made the dashboard's headline figure
 * a call count.
 *
 * ── THE PLAN IS A LEGACY ONE AND `docs.z.ai` DESCRIBES A DIFFERENT ONE. ────
 * ── READ THIS WHOLE BLOCK BEFORE "CORRECTING" ANY ZERO BELOW (2026-08-01) ──
 *
 * **A session that reads z.ai's current docs and stops there will conclude these zeros are
 * wrong. They are not. This block exists because that inference was drawn once already, in
 * this file, and it took Miftah's account history to undo.**
 *
 * THE PLAN: **an annual Pro Coding Plan, bought February 2026 for US$180** (50% off, which
 * z.ai was running then). A fixed fee for a year. **There is no wallet, no top-up and no
 * pay-as-you-go balance on this account** -- Miftah paid once and has not funded a balance
 * since.
 *
 * WHAT THE CURRENT DOCS SAY, which is NOT what this account is on:
 *
 * - `docs.z.ai/devpack/overview` describes a **CREDIT** system --
 *   `(input x in_mult + cached x cached_mult + output x out_mult) / 10,000`, Pro at 12,000
 *   per rolling 5h and 60,000 weekly, multipliers GLM-5.2 `6.9/1.7/24`, GLM-5-Turbo
 *   `5.7/1.5/21`, GLM-4.7 `4.6/1.2/16`.
 * - `docs.z.ai/devpack/faq` lists three conditions for a call to draw on the plan rather
 *   than on account balance, and **this app fails two of them**: it is not an *"officially
 *   supported tool"*, and `LLM_MODEL=glm-4.6` is not one of *"GLM-5.2, GLM-5-Turbo and
 *   GLM-4.7"*. (It passes the third: the base URL really is `api.z.ai/api/anthropic`.)
 * - The documented consequence of failing them is *"account balance deducted"* or
 *   **error `1113 Insufficient Balance`**.
 *
 * ── WHY THE ZEROS ARE STILL RIGHT, AND THIS IS THE ARGUMENT TO RE-RUN ──────
 *
 * **THE ABSENCE OF A WALLET IS THE EVIDENCE.** If `glm-4.6` calls were being routed to
 * account balance, they would fail with `1113` against a balance that was never funded.
 * They do not fail; production readings work. **So the calls are being served by the plan,
 * no dollar is charged per token, and zero is the true figure.**
 *
 * `docs.z.ai/devpack/transition` is the reason: legacy plans *"without weekly usage
 * limits"* had auto-renew cancelled on **30 April 2026**. A Pro annual bought in February
 * 2026 is one of those, and it predates GLM-5.2 entirely -- **GLM-4.6 was the coding model
 * when this plan was sold.** The three-model rule and the credit formula are terms of the
 * CURRENT plan, and they do not appear to have been applied retroactively to a paid annual
 * term.
 *
 * **AND THE BALANCE WAS CHECKED: IT IS ZERO.** Miftah opened
 * `z.ai/manage-apikey/billing` on 2026-08-01 and confirmed it. That was the one open
 * falsifier -- a trial credit quietly draining would have meant the calls were never
 * plan-served -- and it is now closed. **Zero balance, calls succeeding: the argument above
 * is a measurement rather than an inference, and this question does not need re-opening.**
 *
 * **THE ONLY REMAINING FALSIFIER IS READINGS BEGINNING TO FAIL WITH `1113`.** If that ever
 * happens the calls stopped being plan-served on that date, and the repair is NEW ROWS at
 * z.ai's pay-as-you-go rates -- `glm-4.6` at US$0.60 / 0.11 / 2.20, `glm-4.5-flash` free --
 * dated from then. **Never an edit to the rows below; editing re-prices every month that
 * came before it.**
 *
 * **A ZERO BALANCE ALSO MEANS THERE IS NO SOFT LANDING.** With, say, US$20 sitting there,
 * the day the plan stopped covering `glm-4.6` would be a silent drawdown and days of
 * warning. With zero it is an instant outage on the first call. The cliff below has no
 * grace period, and that is a consequence of the same fact that proves the zeros correct.
 *
 * ── THE CLIFF IS DATED, AND IT IS THE REASON THIS BLOCK IS LONG ────────────
 *
 * The risk is not live, it is **scheduled**. Auto-renew is already cancelled, so continuing
 * past the annual term (~February 2027) means re-subscribing onto the CURRENT plan, and
 * three things bite in the same instant:
 *
 * 1. `LLM_MODEL=glm-4.6` stops being callable -- every reading fails with `1113`.
 * 2. `MODERATION_MODEL=glm-4.5-flash` likewise. (It is free pay-as-you-go, so it is the
 *    cheap half of the problem -- but a gate that 1113s is still a gate that is down.)
 * 3. Metering becomes credit-based, so **`LLM_WINDOW_CALL_CEILING=280` loses its
 *    denominator.** It is derived as *"the Pro tier's ~400 prompts per 5 hours x 70%"*; a
 *    credit is token-weighted, so a four-paragraph `spread3` and a one-line classifier reply
 *    stop being one unit, and at a 24x output multiplier they are very far apart.
 *    **Re-derive against credits -- raising the number would treat a units error as a
 *    capacity problem.**
 *
 * `ADMIN_MODEL=glm-5.2` is, by accident, the only model setting already on the right side of
 * that line. The migration is `LLM_MODEL=glm-4.7` (same pay-as-you-go rate as 4.6, and inside
 * the three) plus a moderation model from the supported set -- and per `## Providers`, a model
 * change means `npm run probe:usage` and `npm run smoke -- --all` with the blind read as the
 * gate, because it changes the readers' voices.
 *
 * **THE FALLBACK PROVIDER'S ROWS ARE DELIBERATELY ABSENT.** See `NOTIONAL_MODEL`.
 */
export const PRICES: readonly ModelPrice[] = [
  {
    model: 'glm-4.6',
    effectiveFrom: '2026-01-01',
    inputPerMTok: 0,
    outputPerMTok: 0,
    // Explicit rather than defaulted: a subscription charges nothing either way, and
    // an omission here would read as "nobody has looked up the cache rate yet".
    cachedInputPerMTok: 0,
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
    // Explicit rather than defaulted: a subscription charges nothing either way, and
    // an omission here would read as "nobody has looked up the cache rate yet".
    cachedInputPerMTok: 0,
    verifiedOn: '2026-07-30',
    source: 'https://docs.z.ai/devpack/overview',
    note: 'The moderation classifier (MODERATION_MODEL). Same subscription, same zero.',
  },
  {
    /*
     * **`ADMIN_MODEL`'s model, added 2026-08-01 with the pricing page open.**
     *
     * ZERO FOR THE OTHER TWO ROWS' REASON: the header's *"legacy annual Pro plan, no
     * wallet, calls are plan-served"* argument covers this model too, and `costUsd`
     * measures DOLLARS. **Read that block before changing this** -- it is the one that
     * explains why z.ai's current docs make these zeros look wrong when they are not.
     *
     * This is also the ONLY model setting in the app that is already inside the current
     * plan's supported three, so it is the one that survives the renewal cliff untouched.
     *
     * `effectiveFrom` IS TODAY AND NOT `2026-01-01` like its neighbours. Those two were
     * backdated to cover history that already existed; nothing in `llm_calls` names this
     * model before today, and a date earlier than the first call would be claiming
     * knowledge of a price nobody looked up.
     */
    model: 'glm-5.2',
    effectiveFrom: '2026-08-01',
    inputPerMTok: 0,
    outputPerMTok: 0,
    // Explicit rather than defaulted, exactly as above.
    cachedInputPerMTok: 0,
    verifiedOn: '2026-08-01',
    source: 'https://docs.z.ai/devpack/overview',
    note:
      'The whole admin surface (ADMIN_MODEL): the Insight button, Auto Format and the ' +
      'blog auto-translate. ZERO for the same reason as glm-4.6 -- a legacy annual Pro ' +
      'plan bills no dollar per token; see this array\'s header, which is where the whole ' +
      'argument lives. Read as a counterfactual, z.ai pay-as-you-go for this model is ' +
      'US$1.40 input, US$0.26 cached and US$4.40 output per 1M tokens -- NOT entered as ' +
      'the rate, because that is not what this key is billed and costUsd() must never ' +
      'quote a bill nobody receives. Under the CURRENT plan it is also the priciest of ' +
      'the supported three in credits (6.9 / 1.7 / 24 against GLM-4.7 at 4.6 / 1.2 / 16), ' +
      'which matters only after the renewal cliff the header dates.',
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
 * `verifiedOn` and `source`, and set this to that model string. `notionalUsd()` starts
 * answering. Until then A4's headline must be a call count (R14 already requires that
 * independently), and an honest empty state beats a confident wrong figure.
 *
 * ── AND DO ONE MORE THING, WHICH IS EASY TO MISS BECAUSE NOTHING BREAKS ──────
 *
 * **THREAD `cache_read_tokens` INTO THE TWO CALLERS.** `notionalUsd()` takes a
 * `cached` argument that defaults to `null`, and `applyPrice` prices a null split as
 * ALL-FRESH -- deliberately, because that is the conservative direction. But z.ai
 * serves the large majority of a prompt from cache (1344 of 1364, measured
 * 2026-07-30), and a fallback provider discounts cache reads to roughly a tenth. So
 * a cost quoted without the split **OVERSTATES the input half by close to an order
 * of magnitude.**
 *
 * The two callers are `admin/users/[id]/sections/Tokens.tsx` and
 * `lib/admin/userList.ts`, and both need `CallTotals` to carry a summed
 * `cacheReadTokens` first. That threading is deliberately NOT done today: it would be
 * four files of aggregation in service of a function that provably returns `null`
 * until this constant changes. **It is listed here rather than done, because the
 * failure mode is a plausible number nobody questions -- not a crash.**
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
  cached: number | null = null,
): number | null {
  const price = priceFor(model, on);
  if (price === null) return null;
  if (input === null || output === null) return null;
  return applyPrice(price, input, output, cached);
}

/**
 * The arithmetic, against a price row that is already chosen.
 *
 * **EXPORTED FOR THE REASON `pickPrice` IS: EVERY ROW THIS PROJECT SHIPS COSTS
 * ZERO.** A test of the cache split routed through `costUsd` would multiply by 0
 * and pass against any formula at all, including one that added the cached tokens
 * to the total instead of splitting them out. `prices.test.ts` drives this
 * directly, with a rate table this project does not ship -- so the claim is about
 * the code that runs rather than about a copy.
 *
 * ── `input` IS THE TOTAL AND `cached` IS A SUBSET OF IT ──────────────────────
 *
 * So the fresh half is `input - cached`. **A NULL `cached` IS PRICED AS ALL-FRESH,
 * NEVER AS ALL-CACHED**: null means the provider said nothing about caching, not
 * that nothing was cached, and the conservative reading of an unknown is the
 * expensive one. Same reason an absent `cachedInputPerMTok` bills at full rate.
 *
 * The clamp exists because `cached > input` would make the fresh half NEGATIVE and
 * silently REDUCE a fleet total. It should be unreachable -- the adapters return a
 * total that already includes the cached part -- but a wrong number that lowers the
 * bill is the one nobody investigates.
 */
export function applyPrice(
  price: ModelPrice,
  input: number,
  output: number,
  cached: number | null,
): number {
  const cachedTokens = Math.min(Math.max(cached ?? 0, 0), input);
  const freshTokens = input - cachedTokens;
  const cachedRate = price.cachedInputPerMTok ?? price.inputPerMTok;
  return (
    (freshTokens * price.inputPerMTok +
      cachedTokens * cachedRate +
      output * price.outputPerMTok) /
    1_000_000
  );
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
  cached: number | null = null,
): number | null {
  if (NOTIONAL_MODEL === null) return null;
  return costUsd(NOTIONAL_MODEL, on, input, output, cached);
}
