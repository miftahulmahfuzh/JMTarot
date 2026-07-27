/**
 * What the three onboarding endpoints agree about.
 *
 * ROUTE HANDLERS, NOT SERVER ACTIONS (plan Task 6 Step 2). `/api/reading` is a
 * route handler with a zod boundary, and this is the one place in the app where
 * UNTRUSTED TEXT IS STORED -- so making that boundary explicit and reviewable is
 * worth more here than an action's ergonomics. A zod schema in a file called
 * `route.ts` is a thing a reader can find; a validated action argument is not.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ONBOARDING_MAX_ANSWER_CHARS, ONBOARDING_QUESTION_KEYS } from '@/data/onboarding';
import { requireUser, type CurrentUser } from '@/lib/auth/server';
import { getT } from '@/lib/i18n/t';
import { hit } from '@/lib/ratelimit';

/**
 * The gate every onboarding endpoint opens with.
 *
 * `requireOnboarding: false` IS MANDATORY HERE AND IS EASY TO FORGET.
 * `requireUser()` fails closed by default -- it demands completed onboarding --
 * which is right for every other handler and exactly backwards for these three:
 * the caller is a user who has not finished onboarding, and defaulting would make
 * the questionnaire unable to submit the answers that would end the redirect.
 * The symptom is a stepper whose every button 403s.
 *
 * These stay reachable AFTER completion too, because `/account` (R14) reuses them
 * to edit facts and delete answers (L13). `gate.decide()` already allows that:
 * only the /onboarding PAGE bounces a completed user, not `/api/onboarding/*`.
 *
 * The rate limit is NAMESPACED so it does not share a budget with the reading
 * limiter -- nine writes during onboarding must not eat into someone's readings
 * for the hour. 60 is generous for a nine-step flow that also re-sends everything
 * at the end, and low enough to stop a script spinning `encryptField` and
 * database writes. `src/lib/ratelimit.ts` is honest that this is best-effort:
 * instances do not share memory and a cold start resets it.
 */
export async function onboardingGate(): Promise<
  { ok: true; user: CurrentUser } | { ok: false; response: NextResponse }
> {
  const auth = await requireUser({ requireOnboarding: false });
  if (!auth.ok) return auth;

  const gate = hit(`onboarding:${auth.user.id}`, Date.now(), 60);
  if (!gate.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: (await getT())('onboarding.error.rateLimit') },
        { status: 429, headers: { 'retry-after': String(gate.retryAfterSeconds) } },
      ),
    };
  }

  return { ok: true, user: auth.user };
}

/** One JSON body, or a 400. Never throws. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/*
 * ASYNC NOW, BECAUSE THE MESSAGE IS KEYED. `getT()` is memoized per request with
 * React `cache()`, so the extra await costs one header read for the whole request
 * however many of these fire.
 *
 * `serverError` reuses `onboarding.error.saveFailed` rather than keeping its own
 * near-duplicate: the pre-W6 tree had 'Gagal menyimpan. Coba lagi.' here and
 * 'Belum tersimpan. Coba lagi.' in the stepper, two sentences saying one thing to
 * one person. One key, one string.
 */
export async function badRequest(): Promise<NextResponse> {
  // Deliberately opaque. The client is our own stepper, which does not read the
  // message, and a validation detail is a free description of the schema.
  return NextResponse.json({ error: (await getT())('onboarding.error.badRequest') }, { status: 400 });
}

export async function serverError(): Promise<NextResponse> {
  return NextResponse.json({ error: (await getT())('onboarding.error.saveFailed') }, { status: 500 });
}

/**
 * `YYYY-MM-DD`, a real date, not in the future, not absurdly old.
 *
 * A STRING THROUGHOUT, never a Date, for the reason in `todayKey()`'s comment and
 * in `schema.ts`'s `dateCol`: a Date renders in the SERVER's zone, and
 * `birth_date` is a calendar day the user typed. Parsing to a Date to validate
 * and formatting back is how a birthday moves by one day for anyone east of UTC.
 * `Date.UTC` below is used only to ask "does this y-m-d exist", and its output is
 * compared against a UTC-built bound, so no local zone enters.
 *
 * THIS IS NOT AN AGE GATE. The 18 minimum is reconciliation §7.6, enforced by
 * W2's first-sign-in checkbox and `users.age_confirmed_at`. Deriving it here too
 * would create a second age policy that drifts from the first, and this one --
 * over a number the user typed -- would be the weaker of the two.
 */
export const BirthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    if (y < 1900) return false;

    // Rejects 2026-02-30 and friends: Date.UTC rolls them over, so the
    // round-trip only matches for a date that actually exists.
    const stamp = Date.UTC(y, m - 1, d);
    const back = new Date(stamp);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
      return false;
    }

    /*
     * Tomorrow is not a birth date. One day of slack, not zero, because the
     * client sends its OWN calendar day and a querent in Jakarta is up to 7
     * hours ahead of a server on UTC -- a strict `<= today UTC` would reject a
     * real birthday typed by someone born today, at midnight, in Asia.
     */
    return stamp <= Date.now() + 24 * 60 * 60 * 1000;
  }, 'implausible birth date');

/**
 * One answer as the client sends it.
 *
 * THE CAP IS CHECKED ON THE RAW STRING, HERE, BEFORE ANY SANITIZING. That
 * ordering is what keeps "too long" and "effectively empty" distinguishable:
 * `sanitizeAnswer` returns null for both, and if an over-cap answer reached it
 * the user would be recorded as having DECLINED to answer something they in fact
 * wrote 600 characters about. Rejecting here makes that unreachable, and since
 * stripping only ever shortens a string, anything that passes this cannot fail
 * the cap downstream.
 */
export const AnswerBody = z.object({
  key: z.enum(ONBOARDING_QUESTION_KEYS),
  text: z.string().max(ONBOARDING_MAX_ANSWER_CHARS).nullish(),
  /** Closed-set values are short by construction; 16 is slack, not a limit. */
  choice: z.string().max(16).nullish(),
  skipped: z.boolean().optional(),
});

export const FactsBody = z.object({
  fullName: z.string().min(1).max(120),
  nickname: z.string().min(1).max(40),
  birthDate: BirthDate,
});
