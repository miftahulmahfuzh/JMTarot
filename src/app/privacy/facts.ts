import { ERASURE_GRACE_DAYS } from '@/lib/db/queries/profile';

/**
 * The numbers and the citation the privacy policy states as fact.
 *
 * **A RETENTION PERIOD IS A PROMISE, AND A HAND-TYPED ONE IS A PROMISE THAT
 * DRIFTS.** Section 6 of the policy says analytics are kept 180 days; the daily
 * sweep is what makes that true; and if somebody changes `EVENTS_RETENTION_DAYS`
 * without opening a `.tsx` file, the policy becomes a lie in the direction that
 * matters. So every number is read from the same source the sweep reads, and
 * `ERASURE_GRACE_DAYS` is imported outright from the query module that enforces
 * it.
 *
 * The fallbacks match `.env.example`. They exist because a legal page must
 * render even when an optional variable is unset -- a `/privacy` that 500s is
 * worse than one quoting a default that is also what the code does.
 */
export const RETENTION = {
  /** Reconciliation §7.9b. `readings` is deliberately NOT on this clock. */
  get eventsDays(): number {
    const raw = Number(process.env.EVENTS_RETENTION_DAYS);
    return Number.isFinite(raw) && raw > 0 ? raw : 180;
  },
  /** W7-D19. `sexual_minor` never stores the text at all, at any retention. */
  get moderationQuestionDays(): number {
    const raw = Number(process.env.MODERATION_QUESTION_RETENTION_DAYS);
    return Number.isFinite(raw) && raw > 0 ? raw : 30;
  },
  /** Reconciliation §7.8. Imported, not restated -- one number, one owner. */
  erasureGraceDays: ERASURE_GRACE_DAYS,
} as const;

/**
 * The model provider, and the clause the policy quotes about it.
 *
 * **`verifiedOn` IS HELD TO THE SAME STANDARD AS A HOTLINE NUMBER**
 * (reconciliation §7.1's closing paragraph). Terms of use change, and a privacy
 * policy quoting a clause that was silently revised is worse than one that never
 * quoted it -- so `privacy.test.ts` runs the same 180-day warn / 365-day fail
 * check that `resources.test.ts` runs.
 *
 * **THREE THINGS THE COPY MUST NOT DO**, because the source does not support
 * them: claim a retention period for API data (none is published), name a
 * processing country (none is published), or state the protection as a general
 * fact about the company (the same document reserves the opposite right for
 * non-API consumer users, so the blanket claim would be false).
 *
 * The unresolved follow-up, and it is Miftah's to make: the terms reference a
 * **"Data Processing Addendum for API Services"** that is not published at this
 * URL. That document would answer both gaps. Requesting it is the single
 * highest-value item here.
 */
export const PROVIDER = {
  name: 'z.ai (Zhipu AI)',
  termsUrl: 'https://docs.z.ai/legal-agreement/terms-of-use',
  termsLabel: 'docs.z.ai — Additional Terms for API Services',
  verifiedOn: '2026-07-26',
} as const;
