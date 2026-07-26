import { redirect } from 'next/navigation';
import { isOnboarded, type OnboardingQuestionKey } from '@/data/onboarding';
import { currentUser } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { getOnboardingState } from '@/lib/db/queries/onboarding';
import { Onboarding } from './Onboarding';
import { SessionRepair } from './SessionRepair';

/**
 * The questionnaire, asked exactly once.
 *
 * THE ONE DB READ ON A RENDER PATH IN W3, and it is the exemption roadmap
 * non-negotiable #1 allows: this page cannot exist without knowing what has
 * already been answered. Every OTHER route stays free of it because the gate
 * reads the `onb` claim out of the session cookie instead (L4).
 *
 * WHAT THIS PAGE DOES NOT SEND TO THE BROWSER: any answer text. `answeredKeys`
 * is which questions have a row, not what is in them. Decrypting `worst_thing`
 * and shipping it back to pre-fill a textarea is not a thing this app should do,
 * and the resume case does not need it -- a revisited step shows an empty field
 * and says an answer is already saved.
 *
 * THE WORD "ONBOARDING" APPEARS NOWHERE THE USER CAN SEE IT (§1). It is in the
 * route, in the filenames and in the copy keys; it is in none of the copy. The
 * questions are supposed to feel like being read, not like being onboarded.
 */

/**
 * `?step=` — DEVELOPMENT ONLY.
 *
 * A stepper cannot be screenshotted past step 0 otherwise, and Task 4/11 of the
 * plan calls for eleven screenshots read as a sequence. Honoured only outside
 * production, so it cannot become a way to skip the facts step in a deployment.
 *
 * Parsed here rather than in the client component because the value has to be
 * refused server-side; a client that read `location.search` itself would honour
 * it in production too.
 */
function devStep(raw: string | undefined): number | null {
  if (process.env.NODE_ENV === 'production' || !raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  /*
   * `currentUser()` AND NOT `auth()`, for the reason the login page spells out:
   * middleware decides "signed in" by narrowing with `readToken()`, and a page
   * that decided it by session truthiness instead could disagree with middleware
   * and loop. One predicate on both sides.
   *
   * Middleware has already rejected anonymous callers -- this path is not public
   * -- so this is belt and braces, and it is also where the user id comes from.
   */
  const user = await currentUser();
  if (!user) redirect('/login');

  const { profile, answeredKeys } = await getOnboardingState(db, user.id);

  /*
   * THE FLAG IS A HINT; `completed_at` IS THE AUTHORITY (L4).
   *
   * Middleware already bounces a user whose token says `onb: true` away from
   * this route, so arriving here means the token says false. If the database
   * says otherwise, the token is stale and must be REPAIRED rather than
   * redirected around -- a bare `redirect('/')` here is an infinite loop,
   * because middleware would read the same stale claim and send them back.
   *
   * Middleware deliberately does not make this decision itself: doing so would
   * make a wrong flag unrecoverable, whereas the page deciding it makes a wrong
   * flag self-healing.
   */
  if (isOnboarded(profile)) return <SessionRepair />;

  const { step } = await searchParams;

  return (
    <Onboarding
      profile={profile}
      answeredKeys={answeredKeys as OnboardingQuestionKey[]}
      initialStep={devStep(step)}
    />
  );
}
