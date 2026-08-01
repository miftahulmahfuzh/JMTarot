/**
 * Which model the admin surface calls. **`ADMIN_MODEL`, 2026-08-01, Miftah's ruling.**
 *
 * ── PURE. NO `server-only`, NO IMPORTS ─────────────────────────────────────
 *
 * `flags.ts`'s shape and for its reason: env in, a string out, so `npm test` can drive
 * every branch. The three files that call it all carry the marker themselves.
 *
 * ── ONE VARIABLE FOR THE CLASS, NOT THREE ──────────────────────────────────
 *
 * There are exactly three model call sites whose caller is the operator rather than a
 * querent — `insight.ts`, `blogFormat.ts` and `blogAutoTranslate.ts` — and
 * `flagCoverage.test.ts` already names them as one class in its `EXEMPT` table, with
 * the note that a fourth must collapse all three into a single switch. This is the same
 * class seen from the other side: **what runs the dashboard and the CMS is a deployment
 * decision about the admin surface, not three independent model choices**, and three
 * variables is three chances for the surface to answer in two different voices.
 *
 * So a fourth admin-only call site gets this variable too, and does not bring its own.
 *
 * ── AND IT REVERSES `insight.ts`'s "NO `INSIGHT_MODEL` VARIABLE" ───────────
 *
 * That header argued the case honestly and left the door open in as many words: *"A
 * variable can be added the day somebody measures a reason for it."* The reason is the
 * one it predicted — this is analysis over numbers, which is the work a cheap model does
 * worst, and the reading model is chosen for a reader's voice rather than for reading a
 * table. **The admin surface is also the one place a model change cannot reach a
 * querent**, so it is the cheapest place in this app to run something else.
 *
 * ── TWO FUNCTIONS, AND THE SECOND IS NOT A CONVENIENCE ─────────────────────
 *
 * `adminModel()` is the OVERRIDE and answers `undefined` when unset, which is
 * `moderationModel()`'s shape exactly: `LLMCallOpts.model` is optional, and
 * `ledger.ts` resolves an absent one as `opts.model || LLM_MODEL || 'unknown'`. Handing
 * it the literal string `'unknown'` would send `model: "unknown"` to the provider.
 *
 * `adminModelName()` is what a caller RECORDS — `insights.model` and the
 * `InsightResult` — and it **restates `ledger.ts`'s resolution deliberately** rather
 * than importing it, because that module reaches `@/lib/llm` and therefore
 * `server-only`. The two must stay identical: a stored row claiming one model while the
 * ledger row beside it claims another is worse than either being wrong alone, and
 * `model.test.ts` pins the `||` chain for exactly that reason.
 */

/**
 * The per-call override, or `undefined` to leave `LLM_MODEL` in charge.
 *
 * **`||`, NOT `??`.** An empty string is what a Vercel variable added and then cleared
 * looks like, and `ADMIN_MODEL=''` reaching an adapter is a 400 that reads like a bad
 * key. Every other model variable in this project narrows the same way.
 */
export function adminModel(): string | undefined {
  return process.env.ADMIN_MODEL || undefined;
}

/**
 * The resolved name, for a row that has to say which model wrote the prose.
 *
 * `'unknown'` matches `personaModel()`: a row naming a model is worth more than a row
 * naming nothing, and an unset `LLM_MODEL` is already a broken deployment.
 */
export function adminModelName(): string {
  return adminModel() || process.env.LLM_MODEL || 'unknown';
}
