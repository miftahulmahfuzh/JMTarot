/**
 * The `/admin/users` projection, in one place, for its two consumers. v0.5.0 / A5.
 *
 * The page renders this server-side (no client fetch — A4 established that pattern and
 * R21 struck the metrics route for it) and `GET /api/admin/users` returns the same
 * object. **One projection, two consumers**, so the payload fence (A5-8) is asserted
 * against the same code the page renders — a route whose shape can drift from the page's
 * is a fence that guards nothing.
 *
 * ── WHAT IS IN HERE AND WHAT IS DELIBERATELY NOT ────────────────────────────
 *
 * **No prose field exists on `AdminUserListItem`, not even a nullable one** (A5-8, V6's
 * precedent): *the binding reason is VD8, not bytes* — a query that fetched
 * `readings.body` and nulled it has already put the prose in the payload. Absence is
 * structural, which is what makes `'body' in item === false` assertable.
 *
 * **A5 writes no per-user aggregate of its own** (R22, and `queries/admin/users.ts`'s
 * header says so in capitals). The figures come from A3's `userCostLeague`, folded per
 * user here. That has two consequences the page states on screen rather than hiding:
 *
 *   1. **A user outside the league's cap carries `null`, not `0`.** The league is
 *      `(user, model)` pairs ordered by output tokens and capped at `USER_LIST_MAX`; a
 *      quiet user beyond it has no row. `null` renders as an em dash and the note says
 *      "kosong — bukan nol", because a zero there reads as *this person costs nothing*.
 *   2. **`unpricedCalls` is not derivable per user.** The league carries no `local_date`
 *      and no `untokenized` count, so A-D7's denominator cannot be attached per row. The
 *      page carries the caveat once, above the table, and the per-user page — which has
 *      `callTotalsForUser`, with both — carries the count properly.
 *
 * **Cost is priced at `NOTIONAL_MODEL`'s rate and never at each row's own model** (A-D7,
 * and A4 paid for this at 1440px): every z.ai row is priced at zero *on purpose*, because
 * the Coding Plan is a fixed annual subscription with no per-token charge — so pricing
 * per model produced `US$0,00` under the word "notional", which is the one reading an
 * operator must not take from it. `NOTIONAL_MODEL` is unset today, so `notionalUsd`
 * returns null for everything and the column is honestly empty.
 */
import type { Range } from '@/lib/db/queries/admin/users';
import { adminUserList, userCostLeague, USER_LIST_MAX } from '@/lib/db/queries/admin/users';
import { notionalUsd } from '@/lib/llm/prices';
import type { DbOrTx } from '@/lib/db/types';
import type { AdminUserListItem } from './types';

/** Fifty is the operator's screenful. The hard ceiling is A3's `USER_LIST_MAX`. */
export const USERS_PAGE = 50;

/** `?q=` is capped and trimmed. A term shorter than 2 characters is IGNORED rather than
 *  refused: a 400 on a keystroke reads as a broken box (§5.3). */
export function normalizeQuery(raw: string | undefined | null): string | undefined {
  const q = (raw ?? '').trim().slice(0, 120);
  return q.length >= 2 ? q : undefined;
}

export type AdminUserListPage = {
  items: AdminUserListItem[];
  /** Offset paging, not keyset — see `copy.ts`'s `offsetNote` for the hazard and why it
   *  is accepted. `null` when this is the last page. */
  nextOffset: number | null;
  /** True when the aggregate query returned its maximum, so some `null` figures mean
   *  "outside the cap" rather than "no calls". */
  aggregateCapped: boolean;
};

export async function adminUserListPage(
  db: DbOrTx,
  opts: { q?: string; limit?: number; offset?: number; range: Range },
): Promise<AdminUserListPage> {
  const limit = clamp(opts.limit, USERS_PAGE, USER_LIST_MAX);
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));

  const [rows, league] = await Promise.all([
    // One more than asked for, so "is there a next page" is an observation rather than a
    // `count(*)` over `users`.
    adminUserList(db, { search: opts.q, limit: limit + 1, offset }),
    userCostLeague(db, opts.range, USER_LIST_MAX),
  ]);

  const totals = new Map<string, { calls: number; input: number; output: number }>();
  for (const r of league) {
    // `user_id IS NULL` is a REAL row — `llm_calls.user_id` is `on delete set null`, so a
    // hard-deleted user's tokens survive with the attribution gone and they were still
    // spent. It belongs to nobody on this page, so it is skipped here and shown on
    // `/admin/tokens`'s league, where A4 labels it.
    if (r.userId === null) continue;
    const acc = totals.get(r.userId) ?? { calls: 0, input: 0, output: 0 };
    acc.calls += r.calls;
    acc.input += r.inputTokens;
    acc.output += r.outputTokens;
    totals.set(r.userId, acc);
  }

  const page = rows.slice(0, limit);
  const items: AdminUserListItem[] = page.map((r) => {
    const t = totals.get(r.id) ?? null;
    return {
      id: r.id,
      email: r.email,
      displayName: r.displayName,
      nickname: r.nickname,
      locale: r.locale,
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt,
      deletedAt: r.deletedAt,
      deleted: r.deleted,
      onboardedAt: r.onboardedAt,
      readings: r.readings,
      calls: t?.calls ?? null,
      inputTokens: t?.input ?? null,
      outputTokens: t?.output ?? null,
      notionalUsd: t === null ? null : notionalUsd(opts.range.to, t.input, t.output),
    };
  });

  return {
    items,
    nextOffset: rows.length > limit ? offset + limit : null,
    aggregateCapped: league.length >= USER_LIST_MAX,
  };
}

function clamp(n: unknown, fallback: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.floor(v), max);
}
