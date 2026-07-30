import { signIn } from '@/lib/auth/auth';
import { track } from '@/lib/analytics/track';
import { getT } from '@/lib/i18n/t';
import styles from './SignInForm.module.css';

/**
 * The one sign-in control in this app, on two surfaces since 2026-07-30.
 *
 * ── WHY IT MOVED OFF `/login` ────────────────────────────────────────────────
 *
 * The landing page's CTA was a `<Link href="/login">`, so a returning querent
 * whose session had lapsed paid TWO taps to get back in. Nothing was broken --
 * `/` has dual-rendered correctly since S-D5 -- but a 24-hour idle timeout used to
 * present as a login form and now presents as a page addressed to a stranger. The
 * timeout moved to seven days (`ttl.ts`) and the button moved here.
 *
 * ── `/login` STAYS, AND THREE MECHANISMS ARE WHY ─────────────────────────────
 *
 * This is a SECOND entry point, never a replacement, whatever "skip the login page
 * altogether" sounds like it means. `middleware.ts` redirects every gated path to
 * `/login?callbackUrl=…`; `pages.signIn` points there; and `pages.error` points
 * there too, which is the one that keeps a failed token exchange off @auth/core's
 * unstyled English 500 page.
 *
 * ── THE CONSENT LINE IS PART OF THIS COMPONENT, NOT OF ITS CALLERS ───────────
 *
 * It is where agreement to the Terms is collected, so it travels with the button
 * rather than staying behind on the page the button left. One owner, because the
 * failure mode of two is a second copy that drifts -- one naming a document the
 * other does not, in the only copy on screen with legal weight. There is a grep in
 * `SignInForm.test.ts` and it names the three files it checks.
 *
 * ── A SERVER COMPONENT, AND THE ANALYTICS EVENT IS SERVER-SIDE TOO ───────────
 *
 * No `'use client'`, no `next-auth/react`, no `useState`. The landing page's
 * previous `TrackLink` was a client component firing `track()` from an `onClick`
 * racing a navigation; firing it inside the action instead is strictly more
 * reliable and leaves the landing page with no client JavaScript on its primary
 * control at all. `track()` returns void and must never be awaited (CLAUDE.md);
 * the buffered row is flushed by the request's own `after()`.
 *
 * **`from` IS `'landing'` OR ABSENT, NEVER `'login'`** -- `public.link_clicked`'s
 * prop union does not contain that value, and this measures the PUBLIC funnel.
 * The taxonomy is unchanged at 70 names with no new entry (S-D13).
 */
export async function SignInForm({
  redirectTo,
  from,
}: {
  /**
   * Where to land after Google returns. `/login` passes its validated
   * `callbackUrl`; the landing page passes `/`.
   *
   * A PROP AND NOT A DEFAULT, because a component that hardcoded one surface's
   * answer would silently discard the other's -- and the one it would discard is
   * the deep link somebody followed before being asked to sign in.
   */
  redirectTo: string;
  /** The public surface this was tapped from, for `public.link_clicked`. */
  from?: 'landing';
}) {
  const t = await getT();

  return (
    <form
      className={styles.form}
      action={async () => {
        'use server';
        if (from) track('public.link_clicked', { from, to: 'sign_in', slug: null });
        await signIn('google', { redirectTo });
      }}
    >
      <button className={styles.submit} type="submit">
        <GoogleMark />
        {t('login.google')}
      </button>

      {/* Four keys rather than one sentence, because two of its words are links
          and `t()` returns a string. The limitation is real and named in `id.ts`:
          a locale wanting a different clause order cannot get one from these
          parts. W7 owns the documents behind the two hrefs. */}
      <p className={styles.legal}>
        {t('login.legal.lead')} <a href="/terms">{t('common.terms')}</a>{' '}
        {t('login.legal.and')} <a href="/privacy">{t('common.privacy')}</a>.
      </p>
    </form>
  );
}

/**
 * Google's four-colour "G".
 *
 * THE ONE PLACE IN THIS APP WITH HEX VALUES THAT ARE NOT DESIGN TOKENS, and it is
 * not an oversight: this is a trademark asset and the colours are Google's, not
 * ours to harmonise. Do not "fix" it to var(--gold).
 *
 * Inline rather than fetched, because a strict no-external-hosts posture is already
 * load-bearing here -- next/font self-hosts, the art is local -- and a remote logo
 * would be the only third-party request the app makes, on its most sensitive page.
 */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
