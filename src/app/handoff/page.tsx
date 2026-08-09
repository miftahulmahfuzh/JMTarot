import type { Metadata } from 'next';
import { CHALLENGE_PARAM } from '@/lib/auth/handoff';
import { currentUser } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { bindHandoff } from '@/lib/db/queries/handoff';
import { getT } from '@/lib/i18n/t';
import styles from './handoff.module.css';

/**
 * **THE ONLY USER-VISIBLE SURFACE THE STANDALONE SIGN-IN HANDOFF ADDS**, and it
 * is a page nobody reaches on purpose. `src/lib/auth/handoff.ts` carries the whole
 * mechanism; this is step 3 of it.
 *
 * The querent is in an `SFSafariViewController` sheet, has just finished with
 * Google, and is being asked to press a button that belongs to iOS and not to us.
 * That is the entire content, and §6 of the design named the copy as the one
 * thing it deliberately did not decide.
 *
 * ── FOUR THINGS ABOUT THIS PAGE THAT ARE NOT OBVIOUS ────────────────────────
 *
 * 1. **IT IS GATED, AND `isPublic()` MUST NEVER LEARN IT.** It needs a session --
 *    binding one is its job. What it also needs is to be reachable by a querent
 *    who has NOT onboarded, because a first sign-in is exactly when that is true,
 *    so it is on `isOnboardingExempt()`'s list instead. Sending a new querent to
 *    `/onboarding` inside the overlay would have them answer nine screens in a
 *    browser whose session the app can never see -- the feature failing for every
 *    new user and working for every returning one, which is the worst available
 *    way for it to fail.
 *
 * 2. **THE BIND HAPPENS DURING RENDER, WHICH IS A WRITE IN A SERVER COMPONENT.**
 *    Named rather than hidden: this is a redirect target reached exactly once, by
 *    a top-level navigation, never prefetched and never a form target, and the
 *    statement is idempotent by construction -- `bindHandoff`'s `user_id is null`
 *    clause means a second render binds nothing. The alternative is a route
 *    handler that redirects here, which is one more hop inside an overlay for a
 *    page whose whole job is to be reached quickly.
 *
 * 3. **A FAILED BIND IS A DIFFERENT SENTENCE, NOT A SILENT ONE.** Telling
 *    somebody they are signed in and to press `Done` when no row was bound sends
 *    them back to an app that is still signed out, with nothing to do about it.
 *    Expired, already used, already bound, or a challenge that never existed all
 *    read the same to the querent -- *try again from the app* -- because the
 *    remedy is identical and the distinctions would only be useful to somebody
 *    probing the table.
 *
 * 4. **THE `Or continue here` LINK IS FOR THE VISITOR THIS PAGE WAS NOT WRITTEN
 *    FOR.** In an overlay it is unused. In an ordinary Safari tab that somehow
 *    carries the marker cookie -- a `?src=pwa` URL somebody shared -- there is no
 *    `Done` button to press, and without this link the page is a dead end for a
 *    person who is, in fact, signed in.
 */

/**
 * **`noindex`, AND IT IS NOT DECORATION.** This URL only exists as an OAuth return
 * address; it renders a sentence about a button and nothing else, and it is
 * exactly the kind of thin page a crawler that finds it would hold against the
 * site. Gated routes are unreachable to a crawler anyway -- this is the belt.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** It writes. Nothing about it may be cached or prerendered. */
export const dynamic = 'force-dynamic';

export default async function Handoff({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [t, user, params] = await Promise.all([getT(), currentUser(), searchParams]);

  const raw = params[CHALLENGE_PARAM];
  const challenge = typeof raw === 'string' ? raw : null;

  /*
   * `user` cannot be null in production -- the gate answered before this rendered
   * -- but a component that reads a session must not assume the gate ran, because
   * the day somebody adds this path to `isPublic()` the assumption becomes a crash
   * on a page whose whole audience has just successfully signed in.
   *
   * IT NEVER THROWS. A database that is down here costs the querent one retry;
   * a 500 costs them the sentence telling them what to do next.
   */
  let bound = false;
  if (challenge && user) {
    try {
      bound = await bindHandoff(db, challenge, user.id);
    } catch (err) {
      console.error(
        '[auth] handoff bind failed',
        err instanceof Error ? err.name : 'unknown',
      );
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <span className={styles.eyebrow}>{t('common.majorArcana')}</span>
        <h1 className={styles.title}>{t('app.title')}</h1>

        {bound ? (
          <>
            <p className={styles.instruction}>{t('handoff.ready.title')}</p>
            {/* The word `Done` is iOS's own and is rendered by iOS in the DEVICE's
                language, which is usually but not always this one. So the copy
                names the button AND says where it is: a querent who cannot match
                the word can still find the corner. */}
            <p className={styles.instruction}>
              <strong>{t('handoff.ready.action')}</strong>
            </p>
          </>
        ) : (
          <p className={styles.instruction}>{t('handoff.stale.body')}</p>
        )}

        <p className={styles.fallback}>
          <a href="/">{t('handoff.continue')}</a>
        </p>
      </div>
    </main>
  );
}
