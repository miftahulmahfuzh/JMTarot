/**
 * The publish / unpublish state machine, per `(post, locale)`. **v0.5.0 / A6, §8.**
 *
 * PURE, unit-tested, no `server-only`. The `swipeDeck.ts` precedent: *the whole
 * policy in a pure module is the part `npm test` can reach*, and here the policy is
 * the release's most dangerous interaction (roadmap §11.6, A-D15).
 *
 * ── A6-9. `'unpublished'` IS NOT `'draft'` ──────────────────────────────────
 *
 * A draft was never public. An unpublished article **was** public, may be in
 * Google's index, may be in somebody's group chat, and its URL must now answer 404.
 * They differ in the sitemap, in `hreflang`, in `blogIndexNode.blogPost`, and in
 * whether the transition is reversible without a new `date_published`. Collapsing
 * them to a boolean `published` loses the distinction the whole reciprocity argument
 * is built on.
 *
 * ── A6-21. THERE IS NO PATH BACK TO `draft` ─────────────────────────────────
 *
 * `draft` means NEVER PUBLIC, and that is the property A-D15 leans on. An admin who
 * can relabel an unpublished article `draft` **has laundered a public URL into a
 * private one with nothing recording the change** -- the URL is still in somebody's
 * chat history and may still be in an index. The editor offers *Tarik dari
 * publikasi* and never *Jadikan draf*.
 *
 * ── A6-7. PUBLISHING `en` BEFORE `id` IS A 500 ON A SITEMAPPED URL ──────────
 *
 * `alternates.ts:115-120` **throws** without an `id` document: *"a content path with
 * an English document and no Indonesian one is not a state this project has."*
 * That was true of committed files and **A6 makes it reachable with one toggle.**
 * Reconciliation R42 asks for two independent defences and this is the first --
 * `canTransition` refuses. The second is the public loader, which returns `null`
 * rather than throwing if the state is reached another way, because a validation is
 * something somebody routes around (a direct SQL fix, a future bulk tool) and the
 * loader is the defence that holds then.
 *
 * ── A6-17. ERRORS REFUSE A SAVE; WARNINGS REFUSE A PUBLISH ──────────────────
 *
 * This function is the publish half. It refuses on EITHER class when the target is
 * `published`, because a word floor, a description band and a title length are
 * properties of a FINISHED article -- and refusing to save a 200-word draft is
 * refusing to let somebody write, which ends with the whole thing pasted in at the
 * end, unreviewed.
 */
import type { LintViolation } from './lint';
import type { Locale } from '@/lib/i18n/locale';

export const BLOG_STATUSES = ['draft', 'published', 'unpublished'] as const;
export type BlogStatus = (typeof BLOG_STATUSES)[number];

export function isBlogStatus(v: unknown): v is BlogStatus {
  return typeof v === 'string' && (BLOG_STATUSES as readonly string[]).includes(v);
}

/**
 * Why a transition was refused. **A CLOSED SET, AND EACH IS RENDERED AS A SENTENCE
 * THE OPERATOR CAN ACT ON** -- `reason: 'refused'` on a toggle that does nothing is
 * how somebody concludes the button is broken and edits the row in `db:studio`,
 * which is the path both of A6-7's defences exist to survive.
 */
export type TransitionRefusal =
  | 'no-path-back-to-draft'
  | 'never-published'
  | 'empty-body'
  | 'lint-violations'
  | 'id-not-published';

export type TransitionInput = {
  from: BlogStatus;
  to: BlogStatus;
  locale: Locale;
  /** The sibling `id` row's status, or `'draft'` if there is no row. */
  idStatus: BlogStatus;
  bodyBlocks: number;
  violations: readonly LintViolation[];
};

export type TransitionResult =
  | { ok: true; noop: boolean }
  | { ok: false; reason: TransitionRefusal };

/**
 * May this `(post, locale)` go from `from` to `to`?
 *
 * `{ ok: true, noop: true }` for `X → X`. **A NO-OP IS A 200 AND FIRES NO EVENT**
 * (§8.1): a double-tapped toggle would otherwise write a second
 * `admin.blog_status_changed` and read as two decisions.
 */
export function canTransition(input: TransitionInput): TransitionResult {
  const { from, to, locale, idStatus, bodyBlocks, violations } = input;

  if (from === to) return { ok: true, noop: true };

  if (to === 'draft') return { ok: false, reason: 'no-path-back-to-draft' };

  if (to === 'unpublished') {
    // A draft was never public, so "withdraw it from publication" is a state that
    // would be a lie about a URL nobody has ever been able to open.
    if (from !== 'published') return { ok: false, reason: 'never-published' };
    return { ok: true, noop: false };
  }

  // to === 'published'
  if (bodyBlocks < 1) return { ok: false, reason: 'empty-body' };
  /*
   * EITHER CLASS. A-D15's *"a published `en` with no body, or a body that fails the
   * lint, must be unreachable"*, made a refusal rather than a filter -- the filter
   * exists too (A6-6's SQL predicate covers the body), and this is the half that
   * tells the author WHY instead of silently not listing the page.
   */
  if (violations.length > 0) return { ok: false, reason: 'lint-violations' };
  /*
   * A6-7 / R42, defence one. `en` may not lead. The message the editor renders says
   * so in Indonesian, because *"the toggle did nothing"* is the state in which
   * somebody reaches for `db:studio`.
   */
  if (locale !== 'id' && idStatus !== 'published') {
    return { ok: false, reason: 'id-not-published' };
  }
  return { ok: true, noop: false };
}

/**
 * Is this `(locale, idStatus)` pair REACHABLE by a reader?
 *
 * **A6-22. UNPUBLISHING `id` UNPUBLISHES NOTHING ELSE AUTOMATICALLY, AND THE `en`
 * URL THEN 404s BY DERIVATION RATHER THAN BY A CASCADE.** The `en` row still says
 * `published` and that is correct: it records what the admin asked for, and
 * re-publishing `id` restores `en` without a second decision. **The alternative --
 * cascading the write -- is V7's "two kinds of stop sharing" problem**, a UI in
 * which the operator taps the wrong one and believes something is private when it is
 * not. Here the derivation is the safe direction, because the derived answer is
 * *less* public rather than more.
 *
 * The editor labels an `en` row in this state **Tidak terjangkau — `id` belum
 * publik**, or nobody will understand why the page 404s.
 *
 * **THE PUBLIC QUERY DOES THIS IN SQL AND THIS FUNCTION IS THE ADMIN UI's COPY OF
 * THE RULE.** Two spellings of one predicate is a real risk and it is taken
 * knowingly: the query must filter in `WHERE` (A6-6, *"a caller that forgets the
 * filter is exactly the shape that ships"*), and the editor must explain the state
 * without issuing a second query per row. `blog.integration.test.ts` asserts the two
 * agree on every combination.
 */
export function isReachable(locale: Locale, status: BlogStatus, idStatus: BlogStatus): boolean {
  if (status !== 'published') return false;
  return locale === 'id' || idStatus === 'published';
}
