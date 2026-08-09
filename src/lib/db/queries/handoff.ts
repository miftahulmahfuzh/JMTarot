/**
 * `auth_handoffs`. Three statements, one sweep, and nothing else.
 *
 * The mechanism is in `src/lib/auth/handoff.ts`; the table is in `schema.ts`.
 * What lives here is the part that must be right about concurrency, because the
 * failure mode of getting it wrong is a session handed to somebody twice.
 *
 * THE QUERY-MODULE CONTRACT applies unchanged (see `profile.ts`'s header):
 * handle first, type-only imports, no React, no Next, no `server-only`.
 */
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import type { DbOrTx } from '../types';
import { authHandoffs } from '../schema';

/**
 * Record that a device started a sign-in. Called from the sign-in server action,
 * inside the app, before Google is ever reached.
 *
 * `expiresAt` is computed by the caller and passed in rather than defaulted in
 * SQL, so the TTL that applied to a row is visible in the row and one clock
 * decides — `schema.ts`'s comment on the column has the argument.
 */
export async function createHandoff(
  db: DbOrTx,
  input: { challenge: string; deviceHash: string; expiresAt: Date },
): Promise<void> {
  await db.insert(authHandoffs).values({
    challenge: input.challenge,
    deviceHash: input.deviceHash,
    expiresAt: input.expiresAt,
  });
}

/**
 * The overlay has been through Google and has a session. Attach it.
 *
 * **`user_id is null` IS IN THE `where` CLAUSE AND IS NOT DECORATION.** Without
 * it, anybody who came by the challenge — it is in a URL, which is the one place
 * this mechanism writes anything down — could re-point a bound row at their own
 * account and be signed into somebody else's app when the claim arrives. First
 * binder wins, and there is no second.
 *
 * Returns whether a row was bound, so `/handoff` can tell "you are signed in,
 * press Done" from "that link has already been used or has expired" rather than
 * showing the first sentence to somebody it is not true for.
 */
export async function bindHandoff(
  db: DbOrTx,
  challenge: string,
  userId: string,
): Promise<boolean> {
  const bound = await db
    .update(authHandoffs)
    .set({ userId })
    .where(
      and(
        eq(authHandoffs.challenge, challenge),
        isNull(authHandoffs.userId),
        isNull(authHandoffs.claimedAt),
        sql`${authHandoffs.expiresAt} > now()`,
      ),
    )
    .returning({ challenge: authHandoffs.challenge });

  return bound.length > 0;
}

/**
 * The standalone app presents its device secret's hash and collects the session.
 *
 * ── WHY THIS IS KEYED ON THE DEVICE HASH AND NOT ON THE CHALLENGE ────────────
 *
 * **THE APP NEVER LEARNS THE CHALLENGE.** It was minted during a POST whose only
 * response is a redirect to Google — a response iOS hands to the overlay, and on
 * which the design forbids setting a cookie for exactly that reason. So the one
 * value the app can present is the cookie it already had. The design document's
 * §3 sketches the statement with `challenge = $1`; that is the row lookup, and
 * the app's half of it is this hash. The security property it states is intact
 * and unchanged: the overlay's challenge binds a user and collects nothing, the
 * app's secret collects and binds nothing, and a session needs both to have
 * happened.
 *
 * ── WHY IT IS ONE STATEMENT ──────────────────────────────────────────────────
 *
 * **SINGLE USE IS THE DATABASE'S, NOT THE APPLICATION'S.** The inner select
 * picks the newest eligible row; the outer `claimed_at is null` is what makes two
 * concurrent claims produce one session and one empty result. Splitting it into a
 * read and a write would be the same code with a window in it, and the window
 * would open exactly when a querent double-taps.
 *
 * `expires_at > now()` uses POSTGRES's clock, deliberately: a lambda whose clock
 * has drifted must not be able to widen its own expiry.
 */
export async function claimHandoff(db: DbOrTx, deviceHash: string): Promise<string | null> {
  const [row] = await db
    .update(authHandoffs)
    .set({ claimedAt: new Date() })
    .where(
      and(
        isNull(authHandoffs.claimedAt),
        eq(
          authHandoffs.challenge,
          sql`(select ${authHandoffs.challenge} from ${authHandoffs}
                where ${authHandoffs.deviceHash} = ${deviceHash}
                  and ${authHandoffs.claimedAt} is null
                  and ${authHandoffs.userId} is not null
                  and ${authHandoffs.expiresAt} > now()
                order by ${desc(authHandoffs.createdAt)}
                limit 1)`,
        ),
      ),
    )
    .returning({ userId: authHandoffs.userId });

  return row?.userId ?? null;
}

/**
 * The sixth statement of the nightly sweep.
 *
 * **EXPIRED, NOT CLAIMED — the two are different and only the first is the
 * condition.** A claimed row is also worthless, but it expires within five
 * minutes anyway, and a delete keyed on `claimed_at is not null` would leave the
 * abandoned rows (the ones there are most of) behind for ever.
 *
 * `.returning()` to count, which is `deleteOrphanTranslations`'s final arm and is
 * affordable for the same reason: a row lives five minutes, so a night's backlog
 * is a night's sign-in attempts and never a table scan's worth of ids.
 */
export async function deleteExpiredHandoffs(db: DbOrTx): Promise<number> {
  const gone = await db
    .delete(authHandoffs)
    .where(lt(authHandoffs.expiresAt, sql`now()`))
    .returning({ challenge: authHandoffs.challenge });

  return gone.length;
}
