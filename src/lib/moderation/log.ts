import { createHmac } from 'node:crypto';
import { encryptField, moderationFlagAad } from '@/lib/db/crypto';
import { moderationFlags } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';
import type { Locale } from '@/data/types';
import { normalizeForMatching } from './blocklist';
import type { ModerationVerdict } from './types';

/**
 * The `moderation_flags` write path, and the lazy retention sweep that keeps it
 * honest.
 *
 * **THIS TABLE STORES THE TEXT OF THE MOST SENSITIVE QUESTIONS ANYONE TYPES INTO
 * THIS APP.** That is the point -- you cannot tune a blocklist you cannot read
 * -- and it is also a liability that grows monotonically if nothing removes it.
 * Four controls, and all four are in this file:
 *
 *   1. `sexual_minor` NEVER stores the text. Not for thirty days, not for one.
 *   2. Everything else is ENCRYPTED at rest (reconciliation R15), so a database
 *      dump is not a disclosure.
 *   3. Text older than `MODERATION_QUESTION_RETENTION_DAYS` is nulled and
 *      `redacted_at` stamped; the row survives forever, because category /
 *      source / confidence / locale / timestamp are the tuning signal and are
 *      not personal data once the text is gone.
 *   4. `question_hmac` outlives redaction, so repeat probing is still
 *      detectable.
 *
 * **NO `server-only` HERE, DELIBERATELY, AND FOR THE REASON `flush.ts` GIVES.**
 * The database handle is reached through a DYNAMIC `import('@/lib/db/client')`
 * and the handle is an OPTIONAL LAST argument rather than a required first one.
 * A static import would pull in `server-only`, and then `questionHmac` -- the
 * function the "repeat probing stays detectable after the text is gone" claim
 * rests on -- would have no unit test. The optional handle is how the
 * integration suite passes its rolled-back transaction in. This module is a
 * writer, not a query module, so `queries/contract.test.ts` does not apply.
 */

/** Resolve the handle the same way `flush.ts` does, for the same reasons. */
async function handle(injected?: DbOrTx): Promise<DbOrTx> {
  if (injected) return injected;
  const { db } = await import('@/lib/db/client');
  return db;
}

function retentionDays(): number {
  const raw = Number(process.env.MODERATION_QUESTION_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

/**
 * A keyed dedupe key for one question. **NOT ANONYMIZATION -- SAY SO OUT LOUD.**
 *
 * A bare SHA-256 of a 200-character phrase is trivially reversible by guessing:
 * an attacker with the column and a wordlist recovers `cara bunuh diri` in
 * milliseconds. Calling that "the question is erased" would be a lie, so this is
 * HMAC-keyed with `FIELD_ENCRYPTION_KEY`, which makes it useless to anyone
 * without the key -- and still equal for two identical questions, which is the
 * one property it exists for.
 *
 * Computed over the NORMALIZED form, not the raw text, so `cara bunuh diri`,
 * `Cara Bunuh Diri` and `c.a.r.a b.u.n.u.h d.i.r.i` share a key. A dedupe key
 * that a full stop defeats would not detect the probing it is there to detect.
 *
 * `FIELD_ENCRYPTION_KEY` NOW HAS THREE CONSUMERS -- onboarding answers, this
 * column's ciphertext, and this HMAC. Rotating it makes historic HMACs
 * non-comparable, which is acceptable; being surprised by it is not, and
 * `.env.example` says so.
 */
export function questionHmac(question: string): string {
  const secret = process.env.FIELD_ENCRYPTION_KEY;
  if (!secret) {
    /*
     * Throwing here would fail a WRITE that runs inside `after()`, where a
     * throw is invisible anyway -- and it would take the flag row with it,
     * losing the tuning signal over a missing hash. A fixed sentinel is
     * honest: it is obviously not a real HMAC, it groups every affected row
     * together, and it cannot be mistaken for a value that dedupes.
     */
    console.warn('[moderation] FIELD_ENCRYPTION_KEY unset; question_hmac is a sentinel');
    return 'nokey';
  }
  return createHmac('sha256', secret).update(normalizeForMatching(question)).digest('base64url');
}

export type ModerationFlagRow = {
  userId: string | null;
  /** ALREADY SANITIZED. Null when the request carried no question. */
  question: string | null;
  verdict: ModerationVerdict;
  locale: Locale;
  action: 'blocked' | 'allowed_flagged';
};

/**
 * Write one flag, then sweep.
 *
 * **CALLED FROM `after()`, NEVER AWAITED ON THE REQUEST PATH.** It swallows its
 * own errors for the same reason every analytics write does: a dropped flag is
 * invisible, and a 500 because the moderation table was busy is not. The refusal
 * itself has already been sent by the time this runs.
 */
export async function recordModerationFlag(
  row: ModerationFlagRow,
  injected?: DbOrTx,
): Promise<void> {
  const { verdict } = row;
  const category = verdict.category;

  // A clean verdict with no category is not a flag; there is nothing to tune on.
  if (category === null) return;

  try {
    const db = await handle(injected);

    /*
     * **`sexual_minor` NEVER STORES THE TEXT** (W7-D19). Not encrypted, not for
     * thirty days -- storing it at all IS the exposure, and there is no tuning
     * benefit worth it. `redacted_at` stays NULL, which is what distinguishes
     * "we never stored this" from "we stored it and then removed it": without
     * that distinction the retention policy is unverifiable from the data.
     */
    const storeText = row.question !== null && category !== 'sexual_minor';

    await db.insert(moderationFlags).values({
      userId: row.userId,
      question: storeText ? encryptField(row.question!, moderationFlagAad(row.userId)) : null,
      // ALWAYS set, even for sexual_minor and even when there is no text to
      // store: it is the only thing that survives redaction.
      questionHmac: row.question === null ? 'noquestion' : questionHmac(row.question),
      category,
      source: verdict.source === 'none' ? 'classifier' : verdict.source,
      action: row.action,
      locale: row.locale,
      patternId: verdict.blocked ? verdict.patternId : null,
      confidence: verdict.confidence,
    });

    await sweepRedactions(db);
  } catch (err) {
    /*
     * **NEVER LOG THE DRIVER ERROR ITSELF.** A postgres error quotes the failing
     * statement AND its bound parameters -- and one of those parameters is the
     * querent's question. `console.error('...', err)` here would put the most
     * sensitive text in the product into the platform log, outside every
     * retention control this file implements. Same rule, same reason, as
     * `flush.ts`.
     */
    console.warn('[moderation] flag write failed', err instanceof Error ? err.name : 'unknown');
  }
}

/**
 * Null the text on flags older than the retention window.
 *
 * **RUNS LAZILY, INSIDE THE SAME `after()` THAT WROTE A FLAG.** Off the response
 * path by construction, no new infrastructure, self-healing. The failure mode,
 * stated plainly rather than discovered later: **if moderation never fires
 * again, old rows linger.** The daily cron sweep (reconciliation §7.8) is the
 * belt to this braces and runs the same statement; this one exists so the
 * property holds even if the scheduler is misconfigured.
 *
 * The partial index `moderation_flags_created_idx` is `where question is not
 * null`, so this only ever visits rows that still have text to remove.
 */
export async function sweepRedactions(db: DbOrTx): Promise<number> {
  const { sql } = await import('drizzle-orm');
  const result = await db.execute(sql`
    update moderation_flags
       set question = null, redacted_at = now()
     where question is not null
       and created_at < now() - make_interval(days => ${retentionDays()}::int)
  `);
  return (result as unknown as { count?: number }).count ?? 0;
}

/**
 * Redact one user's flag text immediately, whatever its age.
 *
 * **ACCOUNT DELETION MUST NOT WAIT FOR THE THIRTY-DAY CLOCK.** §3's foreign key
 * is `on delete set null`, so the row OUTLIVES the account -- which, for a row
 * still containing a self-harm disclosure, is exactly what "delete my data" is
 * supposed to prevent. Rather than change a §3 foreign key, the deletion flow
 * nulls the text on the way past. Same outcome, no schema fight.
 *
 * **THIS HAS NO CALLER IN THE APP YET, AND THAT IS A GAP, NOT A DESIGN.**
 * `/account` is W3's and was never built, so there is no user-facing deletion
 * flow to hook into. The daily cron sweep calls it for soft-deleted users, which
 * covers the promise; whoever builds `/account` must call it in the same
 * transaction that sets `users.deleted_at`, not afterwards.
 */
export async function redactForUser(db: DbOrTx, userId: string): Promise<number> {
  const { sql } = await import('drizzle-orm');
  const result = await db.execute(sql`
    update moderation_flags
       set question = null, redacted_at = now()
     where user_id = ${userId}
       and question is not null
  `);
  return (result as unknown as { count?: number }).count ?? 0;
}
