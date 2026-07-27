/**
 * The moderation vocabulary. CLIENT-IMPORTABLE, and deliberately so.
 *
 * NO `server-only` HERE (W7-D14's second exception). The refusal renders in the
 * browser, so `ModerationCategory` and `RefusalPayload` cross the boundary --
 * and a category name is not a secret. What must never cross is the pattern
 * list, the classifier prompt and the `patternId` that says which rule fired;
 * those live in `blocklist.ts`, `classify.ts` and `gate.ts`, all of which do
 * carry `server-only`.
 *
 * NO IMPORTS FROM THIS MODULE except the `Locale` leaf. It is the data
 * dictionary for a workstream three other files depend on, in the same spirit as
 * `src/lib/analytics/events.ts` -- something a person reads to learn what the
 * gate can say, not only something code imports.
 */

/**
 * The closed set. Eight harm categories plus two operational values.
 *
 * **THE GATE REFUSES HARM, NOT SENSITIVITY** (W7-D1), and this list is where
 * that judgement is written down. Grief, illness, the death of someone else,
 * divorce, abuse someone is trying to LEAVE, curses and `santet`, sex between
 * adults, money trouble and legal trouble are all the ordinary subject matter of
 * tarot and none of them are here. If the gate refuses those, there is no app
 * left, and refusing a question about escaping a violent partner is not neutral
 * -- it reads as "even the tarot app will not touch this".
 *
 * What is here is the short list of requests where **the answer itself would be
 * the harm**. Adding a ninth category is a product decision, not a tuning one.
 *
 * `other` and `unclear` are not harms:
 *   - `other`   the classifier saw something off the list. Blocks only above a
 *               confidence threshold (§3.3), because it is the weakest signal.
 *   - `unclear` NOTHING classified it. It is the fail-closed-on-timeout value
 *               (W7-D7), reached when the classifier did not answer AND the
 *               blocklist had already flagged a Tier-B suspicion.
 */
export const CATEGORIES = [
  'self_harm',
  'violence_others',
  'extremism',
  'sexual_minor',
  'illegal_harm',
  'hate_targeted',
  'nonconsent',
  'system_abuse',
  'other',
  'unclear',
] as const;

export type ModerationCategory = (typeof CATEGORIES)[number];

export function isModerationCategory(value: unknown): value is ModerationCategory {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

/**
 * Which layer decided.
 *
 * `timeout` is a source in its own right rather than a flag on `classifier`,
 * because the two are tuned by different people looking at different things: a
 * spike in `classifier` blocks is a prompt problem, a spike in `timeout` blocks
 * is an infrastructure problem, and collapsing them hides which one you have.
 */
export type ModerationSource = 'blocklist' | 'classifier' | 'timeout';

/**
 * The T&C clause each category refuses under.
 *
 * **THIS IS AN INTERFACE, NOT A CONVENIENCE.** The refusal renders
 * `/terms#6-2` as a link, so renumbering clause 6 in `terms.id.tsx` silently
 * points every self-harm refusal at nothing. `terms.test.ts` asserts that every
 * value here has a matching heading id in both locale documents.
 *
 * `other` and `unclear` point at 6.1 -- the general clause -- because there is
 * no specific rule to cite when the app is not sure what it refused.
 */
export const CLAUSE_FOR: Record<ModerationCategory, string> = {
  self_harm: '6.2',
  violence_others: '6.3',
  extremism: '6.4',
  sexual_minor: '6.5',
  illegal_harm: '6.6',
  hate_targeted: '6.7',
  nonconsent: '6.8',
  system_abuse: '6.9',
  other: '6.1',
  unclear: '6.1',
};

/** `6.2` -> `6-2`, the anchor form. One function so the two spellings cannot drift. */
export function clauseAnchor(clause: string): string {
  return clause.replace(/\./g, '-');
}

/**
 * What the gate concluded, whether or not it refused.
 *
 * A CLEAN VERDICT IS STILL A VERDICT AND STILL CARRIES A CATEGORY. That is not
 * redundancy: the classifier returning `other` at 0.4 confidence is a near-miss
 * we let through, it is written to `moderation_flags` with
 * `action: 'allowed_flagged'`, and without it every row in that table is a block
 * and the FALSE-NEGATIVE side of tuning is invisible forever (W7's §3.3).
 */
export type ModerationVerdict =
  | {
      blocked: false;
      source: 'none' | 'classifier' | 'timeout';
      category: ModerationCategory | null;
      confidence: number | null;
      latencyMs: number;
    }
  | {
      blocked: true;
      source: ModerationSource;
      category: ModerationCategory;
      confidence: number | null;
      patternId: string | null;
      clause: string;
      latencyMs: number;
    };

export type BlockedVerdict = Extract<ModerationVerdict, { blocked: true }>;

/**
 * What a refused request gets as its `403` body.
 *
 * **KEYS AND A CLAUSE, NEVER PROSE** (W7-D8). The copy lives in W6's catalog
 * where it is reviewable in a diff and exists in both locales by construction; a
 * server that ships the sentence has to know the querent's language twice and
 * will eventually disagree with itself.
 *
 * `patternId` IS ABSENT ON PURPOSE (W7-D13). Telling the client which rule fired
 * turns the refusal endpoint into a free oracle for mapping the blocklist. The
 * category is the most the client is told, and it is logged with the pattern id
 * server-side so tuning still has what it needs.
 *
 * DECLARED HERE RATHER THAN IN `gate.ts`, WHICH IS WHERE W7'S PLAN PUT IT.
 * `Draw.tsx` has to name this type to parse the body, `gate.ts` carries
 * `server-only`, and while `import type` is erased at compile time,
 * `clientBoundary.test.ts` matches import specifiers with a regex and cannot
 * tell a type import from a value one. Rather than teach the fence an exception,
 * the type lives on the client-importable side of the wall.
 */
export type RefusalPayload = {
  error: 'moderation_blocked';
  category: ModerationCategory;
  /** e.g. `6.2`. The client renders `/terms#${clauseAnchor(clause)}`. */
  clause: string;
  /** W6 catalog key for the body copy. */
  messageKey: string;
  /**
   * True only for `self_harm`.
   *
   * A separate flag rather than the client re-deriving it from `category`,
   * because the ORDERING it controls is a product decision (W7-D10: resources
   * first, refusal second, the T&C link last and small) and it should be
   * changeable in one place if a second category ever deserves the same
   * treatment.
   */
  showCrisisResources: boolean;
};
