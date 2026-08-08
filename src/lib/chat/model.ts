/**
 * Which model the group chat calls, and the one input the readers may be denied.
 *
 * ── PURE. NO `server-only`, NO IMPORTS ─────────────────────────────────────
 *
 * `src/lib/admin/model.ts`'s shape and `flags.ts`'s shape, for their reason: env in,
 * a value out, so `npm test` can drive every branch. The two files that call
 * `chatModel()` carry the `server-only` marker themselves.
 *
 * ── `CHAT_MODEL` POINTS AWAY FROM `LLM_MODEL`, FOR THE OPPOSITE REASON ─────
 *
 * `C-D4`, Miftah's ruling: *"i would like you to set the LLM for the chat group
 * (planner and readers) to be GLM 5.2. the best model we have."*
 *
 * It follows `ADMIN_MODEL`'s shape and points the same way — away from `LLM_MODEL`,
 * toward the better model — **but for the opposite reason.** `ADMIN_MODEL` points
 * away because nothing on that surface is in a reader's voice; this points away
 * because **everything on this surface is.** Unset falls back to `LLM_MODEL`, so the
 * four-variable Gemini emergency fallback covers the chat with no fifth variable.
 *
 * **ONE VARIABLE FOR BOTH THE DIRECTOR AND THE VOICES.** `ADMIN_MODEL`'s precedent:
 * one variable for the whole class. A `CHAT_PLANNER_MODEL` would be a fourth model
 * variable whose only effect is to let somebody make the director dumber than the
 * readers it is directing, at 2am, and never notice. If measurement later shows the
 * director is fine on a cheaper model, that is a *new* variable with a measurement
 * behind it, argued in the reconciliation.
 *
 * **`glm-5.2` IS ALREADY CALLED IN PRODUCTION AND THIS IS A MEASUREMENT, NOT AN
 * ASSUMPTION.** `ADMIN_MODEL=glm-5.2` is set and the Insight button works, and
 * `prices.ts` carries a `glm-5.2` row verified 2026-08-01. **Read `CLAUDE.md`'s
 * `## The z.ai plan` before touching a price or a ceiling because of this release.**
 * One thing there is worth repeating: the legacy plan predates GLM-5.2 and the
 * *current* plan's supported set is GLM-5.2, GLM-5-Turbo and GLM-4.7 — so the chat,
 * by accident, is on the **right** side of the ~February 2027 line that
 * `LLM_MODEL=glm-4.6` is on the wrong side of.
 *
 * **`npm run probe:usage` after this variable lands.** It is a provider/model change
 * and this repo has been wrong about what a provider reports for a whole release.
 *
 * ── READ AT CALL TIME, NEVER AT MODULE SCOPE (`[F1-17]`) ───────────────────
 *
 * A module-scope `const` is inlined by the bundler and freezes the build-time value
 * into production, which would make every one of these unflippable without a
 * redeploy — the exact property they exist to provide.
 */

/**
 * The per-call override, or `undefined` to leave `LLM_MODEL` in charge.
 *
 * **`||`, NOT `??`** (`[F1-16]`). An empty string is what a Vercel variable added and
 * then cleared looks like, and `CHAT_MODEL=''` reaching an adapter is a 400 that
 * reads like a bad key. Every other model variable in this project narrows the same
 * way.
 */
export function chatModel(): string | undefined {
  return process.env.CHAT_MODEL || undefined;
}

/**
 * The resolved name, for a row that has to say which model wrote the prose —
 * `chat_runs.plan_model` and `chat_messages.model`.
 *
 * **IT RESTATES `ledger.ts`'s `||` CHAIN DELIBERATELY** rather than importing it,
 * because that module reaches `@/lib/llm` and therefore `server-only`. `[F1-15]`: the
 * two must stay identical, or **a stored row and the `llm_calls` row written beside it
 * name different models** — which is worse than either being wrong alone.
 * `model.test.ts` pins the chain.
 */
export function chatModelName(): string {
  return chatModel() || process.env.LLM_MODEL || 'unknown';
}

/**
 * **MAY THE READERS SEE THE SIX RAW ONBOARDING ANSWERS?** (`C-D8`, granted by
 * reconciliation `[R14]`.)
 *
 * ── DELIBERATELY NOT A `flags.ts` ENTRY, AND THE DISTINCTION IS THE POINT ───
 *
 * Every member of `DEFERRABLE_FLAGS` gates a **model call**: off means "write nothing
 * new", and `flagCoverage.test.ts` asserts each one has a call site. This gates an
 * **input to a prompt**. The call still happens, the room still answers, the readers
 * simply know less about you. Putting it in `flags.ts` would make
 * *"the set of model call sites is exactly its two tables"* answerable in two
 * incompatible ways.
 *
 * ── WHY IT EXISTS AT ALL ───────────────────────────────────────────────────
 *
 * `C-D8` is the highest-consequence decision in the release: it amends `A5`'s *"THE
 * PERSONA PROMPT NEVER RECEIVES A RAW ONBOARDING ANSWER"* so that Thessaly can ask
 * *"emang nenek kamu meninggalnya kapan?"* — which **is** the product. The
 * reconciliation granted it **on condition it be reversible without redeploying the
 * prompt layer**, because the two onboarding hints amended in the same release
 * promised the opposite while the querent was typing the answer.
 *
 * **OFF DOES NOT CLOSE THE ROOM.** F3's assembler omits the six-answer block; the
 * Lotus summary, the engine facts and the transcript are untouched, which is exactly
 * the material the persona prompt has always had. `[F1-31]` still applies to the
 * block when it IS included: a skipped answer stays skipped, and the prompt is told
 * the set is partial.
 *
 * `ANALYTICS_ENABLED`'s rule — **only the exact string `'0'` disables** — so a typo
 * leaves the feature on rather than silently costing every querent the thing the
 * release was built for.
 */
export function chatAnswersEnabled(): boolean {
  return process.env.CHAT_ANSWERS_ENABLED !== '0';
}
