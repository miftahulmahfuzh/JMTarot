/**
 * `moderation_flags` for the operator, and **THE ONE DECRYPT SITE FOR
 * `moderation_flags.question` IN THIS PROJECT** (A5-7). v0.5.0 / A5, task 3.
 *
 * ── ONE COLUMN, ONE ENCRYPTOR, ONE DECRYPTOR ────────────────────────────────
 *
 * `src/lib/moderation/log.ts` stays the only place that ENCRYPTS it. This file is the
 * only place that DECRYPTS it. The symmetry with A5-6 — where `queries/onboarding.ts`
 * remains the only module touching `onboarding_answers.answer_text` — is the point, and
 * it is stated so it is not diluted: `page.contract.test.ts` asserts `moderationFlagAad`
 * appears in exactly three files repo-wide (`crypto.ts` where it is defined, `log.ts`
 * where it encrypts, here where it decrypts). A fourth file is a red test.
 *
 * ── THE STATE IS READ WITHOUT DECRYPTING, AND THAT IS WHAT MAKES THE AUDIT
 *    ORDERING POSSIBLE (A5-10, A5-11) ──────────────────────────────────────────
 *
 * A reveal is: **read the STATE → write the audit row → decrypt.** So this file exposes
 * the state read (`flagQuestionState`, nullity only) separately from the decrypt
 * (`revealFlagQuestion`), and `src/lib/admin/reveal.ts` composes them in that order.
 * Doing it in one function would force a choice between decrypting before the audit
 * commits, or writing an audit row for a redacted flag that has nothing to reveal —
 * and A5-11 refuses the second: *padding the log with no-op reads makes the
 * subject-access answer wrong in the alarming direction*, and that answer is the whole
 * reason `admin_access_log_subject_created_idx` exists.
 *
 * ── FOUR STATES, AND THE FOURTH IS NOT A SHRUG ──────────────────────────────
 *
 * | `question` | `redacted_at` | state |
 * |---|---|---|
 * | not null | null | `available` — offered, audited |
 * | null | **not null** | `redacted` — the 30-day sweep ran |
 * | null | null | `never_stored` — `sexual_minor`, or there was no question |
 * | not null, will not open | — | `undecryptable` — a rotated key, a wrong AAD |
 *
 * A rotated key is **not** the same fact as a redaction. Rendering `undecryptable` as
 * `redacted` would claim a retention guarantee that may not have been kept, and
 * rendering it as `available` with empty text reads as a rendering bug. `sexual_minor`
 * never stores the text at all — not encrypted, not for thirty days — because storing it
 * is the exposure, and the page says that in words rather than showing an empty field.
 *
 * ── NOTHING HERE UN-REDACTS, AND `question_hmac` IS NEVER AN ORACLE (A5-12) ──
 *
 * The 30-day sweep is untouched: no exemption, no "keep for review" flag. `question_hmac`
 * survives redaction so repeat probing stays detectable — it is a **dedupe key, not
 * anonymization** (`log.ts` says so) — so the page renders a 12-character prefix as a
 * group label and nothing anywhere compares an HMAC against a candidate string. A
 * "check whether this phrase was asked before" box is the feature that turns a dedupe
 * key into an oracle, and there is deliberately no function here that could serve one.
 *
 * ── AND THE IMPORT LIST IS A FENCE (plan §8 rule 2) ─────────────────────────
 *
 * `@/lib/moderation/blocklist`, `classify` and `gate` are all `server-only`, and
 * `queries/contract.test.ts` walks the import graph TRANSITIVELY — V2's
 * `queries/translations.ts` acquired the marker through `@/lib/translate/contract` →
 * `@/lib/prompt/base` and the direct check saw nothing. So this file imports
 * `@/lib/db/crypto` and `@/lib/db/schema` and nothing from `@/lib/moderation/**` at all.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AdminFlagReveal } from '@/lib/admin/types';
import { decryptField, moderationFlagAad } from '@/lib/db/crypto';
import { moderationFlags } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';
import type { Locale } from '@/lib/i18n/locale';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The presence row. **There is no `question` key on this type, and that is
 *  structural** (A5-8/A5-9): the integration test asserts `'question' in row === false`,
 *  which a `question: null` field would make unwritable. */
export type AdminFlagRow = {
  id: string;
  category: string;
  source: string;
  action: string;
  locale: Locale;
  patternId: string | null;
  confidence: number | null;
  /** First 12 characters only. A group label, never the digest (A5-12). */
  hmacPrefix: string;
  redactedAt: Date | null;
  createdAt: Date;
  /** Which of the four states, decided WITHOUT decrypting. `undecryptable` cannot be
   *  known from nullity, so it never appears here — only from a reveal. */
  state: 'available' | 'redacted' | 'never_stored';
};

/**
 * Every flag raised for this person, newest first. **Selects `question IS NOT NULL`,
 * never `question`** (A5-D4): a function on the page's render path must never be the
 * reason a plaintext or a ciphertext exists in memory.
 *
 * Served by `moderation_flags_user_created_idx`.
 */
export async function moderationFlagsForAdmin(
  db: DbOrTx,
  userId: string,
  limit = 200,
): Promise<AdminFlagRow[]> {
  if (!UUID_RE.test(userId)) return [];
  const n = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 200;

  const rows = await db
    .select({
      id: moderationFlags.id,
      category: moderationFlags.category,
      source: moderationFlags.source,
      action: moderationFlags.action,
      locale: moderationFlags.locale,
      patternId: moderationFlags.patternId,
      confidence: moderationFlags.confidence,
      questionHmac: moderationFlags.questionHmac,
      redactedAt: moderationFlags.redactedAt,
      createdAt: moderationFlags.createdAt,
      // Nullity, not the column. Wrapped in `Boolean(...)` below -- the
      // `readingsForDay` `hasBody` precedent, because `sql<T>` is an assertion the
      // driver is not obliged to honour.
      hasQuestion: sql<boolean>`${moderationFlags.question} is not null`,
    })
    .from(moderationFlags)
    // Ownership is a PREDICATE (A5-16). A flag whose `user_id` was nulled by a hard
    // delete is unreachable from any user page, which is correct: it is nobody's.
    .where(eq(moderationFlags.userId, userId))
    .orderBy(desc(moderationFlags.createdAt))
    .limit(n);

  return rows.map(({ questionHmac, hasQuestion, ...rest }) => ({
    ...rest,
    hmacPrefix: questionHmac.slice(0, 12),
    state: stateOf(Boolean(hasQuestion), rest.redactedAt),
  }));
}

/**
 * `available` | `redacted` | `never_stored`, from nullity alone.
 *
 * **NOT EXPORTED, AND THE REASON IS A FENCE RATHER THAN A JUDGEMENT.**
 * `queries/contract.test.ts` asserts that **every exported function in this directory
 * takes the handle as its first parameter** — rule 1, the one everything else rests on.
 * A pure two-argument helper exported from here fails that test, and the fix somebody
 * would reach for is loosening the test. So it stays private, and the four states are
 * proved over the two exported functions in `moderation.integration.test.ts`.
 */
function stateOf(
  hasQuestion: boolean,
  redactedAt: Date | null,
): 'available' | 'redacted' | 'never_stored' {
  if (hasQuestion) return 'available';
  return redactedAt === null ? 'never_stored' : 'redacted';
}

export type FlagState =
  | { state: 'available' }
  | { state: 'redacted'; redactedAt: Date }
  | { state: 'never_stored' };

/**
 * What a reveal WOULD return, without returning it. **Decrypts nothing.**
 *
 * `null` means no flag with that id belongs to this user — *"does not exist"* and *"not
 * theirs"* are the same answer, which the route turns into a 404. Distinguishing them
 * would confirm the uuid exists, which is the reasoning V7 applies to share slugs.
 */
export async function flagQuestionState(
  db: DbOrTx,
  userId: string,
  flagId: string,
): Promise<FlagState | null> {
  if (!UUID_RE.test(userId) || !UUID_RE.test(flagId)) return null;
  const [row] = await db
    .select({
      redactedAt: moderationFlags.redactedAt,
      hasQuestion: sql<boolean>`${moderationFlags.question} is not null`,
    })
    .from(moderationFlags)
    .where(and(eq(moderationFlags.id, flagId), eq(moderationFlags.userId, userId)))
    .limit(1);

  if (!row) return null;
  const state = stateOf(Boolean(row.hasQuestion), row.redactedAt);
  if (state === 'available') return { state };
  if (state === 'redacted') return { state, redactedAt: row.redactedAt as Date };
  return { state: 'never_stored' };
}

/**
 * The decrypt. **Called only after `flagQuestionState` said `available` AND the audit
 * row has committed** (A5-10) — `src/lib/admin/reveal.ts` is the only caller and holds
 * that ordering.
 *
 * `null` for a flag that is not this user's, same as `flagQuestionState`. Otherwise one
 * of the four members: the state is re-read here rather than trusted from the caller,
 * because between the two statements a sweep could have redacted the row, and returning
 * the caller's stale opinion of the state would render "available" over an empty string.
 */
export async function revealFlagQuestion(
  db: DbOrTx,
  userId: string,
  flagId: string,
): Promise<AdminFlagReveal | null> {
  if (!UUID_RE.test(userId) || !UUID_RE.test(flagId)) return null;
  const [row] = await db
    .select({
      question: moderationFlags.question,
      redactedAt: moderationFlags.redactedAt,
    })
    .from(moderationFlags)
    .where(and(eq(moderationFlags.id, flagId), eq(moderationFlags.userId, userId)))
    .limit(1);

  if (!row) return null;
  if (row.question === null) {
    return row.redactedAt === null
      ? { flagId, state: 'never_stored' }
      : { flagId, state: 'redacted', redactedAt: row.redactedAt.toISOString() };
  }

  /*
   * **THE AAD IS THE SUBJECT'S id, WHICH IS WHAT `log.ts` ENCRYPTED WITH.**
   * `moderationFlagAad` folds a NULL user to `'anon'`; a row whose `user_id` was nulled
   * by a hard delete cannot be reached by the predicate above, so the `'anon'` branch is
   * unreachable from here — deliberately, because an unattributed flag is nobody's to
   * show on a person's page.
   */
  const question = decryptField(row.question, moderationFlagAad(userId));
  if (question === null) return { flagId, state: 'undecryptable' };
  return { flagId, state: 'available', question };
}
