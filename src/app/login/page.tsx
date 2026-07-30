import { redirect } from 'next/navigation';
import { ERASURE_GRACE_DAYS } from '@/lib/account/grace';
import { LocaleSwitch } from '@/components/LocaleSwitch';
import { SignInForm } from '@/components/SignInForm';
import { currentUser } from '@/lib/auth/server';
import type { TFunction } from '@/lib/i18n/format';
import { localeSwitcherEnabled } from '@/lib/i18n/resolve';
import { getT } from '@/lib/i18n/t';
import styles from './login.module.css';

/**
 * One button. It is the first screen a stranger sees, on a phone, and the only
 * screen in this app whose job is to be trusted.
 *
 * A SERVER COMPONENT WITH A SERVER ACTION FORM. No 'use client', no useState, no
 * useRouter, no next-auth/react, no SessionProvider. It ships zero auth JavaScript
 * and works before hydration -- which for the screen that gates everything else is
 * worth more than any interactivity it gives up.
 */

/** Auth.js appends `?error=<code>` here because `pages.signIn` points at us. */
function errorMessage(t: TFunction, code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    /*
     * Our own `signIn` callback refused: an unverified Google email, or an account
     * whose sign-in upsert failed. Deliberately vague about which -- "that address
     * is not verified" tells a stranger which addresses exist here.
     */
    case 'AccessDenied':
      return t('login.error.accessDenied');
    /*
     * Everything else: Configuration, OAuthCallbackError, Verification, and
     * whatever a future beta adds. NEVER render the raw code -- it is English,
     * it means nothing to the querent, and it leaks which library we run.
     */
    default:
      return t('login.error.generic');
  }
}

/**
 * Only a path on this origin.
 *
 * Auth.js's default `redirect` callback already restricts to same-origin, so this
 * is the second of two checks -- worth it, because an open redirect on a login page
 * is the one that gets used. The `//` case is the whole reason a bare
 * `startsWith('/')` is not enough: `//evil.example` is a protocol-relative URL that
 * a browser reads as another origin.
 */
function safeCallback(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; deleted?: string }>;
}) {
  /*
   * A signed-in user must not be shown a dead button.
   *
   * `currentUser()` AND NOT `auth()`, and the difference is a redirect loop.
   * Middleware decides "signed in" by narrowing the session with `readToken()`;
   * if this page decided it by session truthiness instead, a token that Auth.js
   * happily decodes but `readToken` rejects -- one from a previous deploy, one with
   * no `uid` -- would make middleware send `/` here and this line send it straight
   * back. ONE predicate, used on both sides, is the only version of this that
   * cannot loop.
   */
  if (await currentUser()) redirect('/');

  const t = await getT();
  const { callbackUrl, error, deleted } = await searchParams;
  const redirectTo = safeCallback(callbackUrl);
  const message = errorMessage(t, error);
  /*
   * V8's goodbye line. `DeleteAccount` sends the querent here with `?deleted=1`
   * after a 200 from `DELETE /api/account`.
   *
   * DELIBERATELY NOT THREADED THROUGH `errorMessage()`. A deletion is not an
   * error, and sharing the slot would style it as one -- which is a bad way to
   * tell somebody the thing they asked for worked. It renders ABOVE the error
   * slot and the two can coexist without contradicting each other: an erasure
   * followed by a failed sign-in is a real sequence.
   *
   * `=== '1'` rather than truthiness, so `?deleted=0` does not print a goodbye.
   * The value is in a URL a stranger can type; nothing depends on it beyond one
   * sentence, but a control that fires on any value is a control that fires by
   * accident.
   */
  const goodbye =
    deleted === '1'
      ? t('login.deleted.notice', { days: String(ERASURE_GRACE_DAYS) })
      : null;

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <span className={styles.eyebrow}>{t('common.majorArcana')}</span>
        <h1 className={styles.title}>{t('app.title')}</h1>

        <p className={styles.tagline}>{t('login.tagline')}</p>

        {goodbye ? (
          <p className={styles.notice} aria-live="polite">
            {goodbye}
          </p>
        ) : null}

        {message ? (
          <p className={styles.error} role="alert" aria-live="polite">
            {message}
          </p>
        ) : null}

        {/* THE BUTTON AND ITS CONSENT LINE MOVED TO `SignInForm` (2026-07-30), so
            the landing page can carry the same control without a second copy of
            the legal sentence. This page is unchanged pixel for pixel; the styles
            went with it. `redirectTo` is still THIS page's validated callbackUrl,
            which is the whole reason the component takes it as a prop. */}
        <SignInForm redirectTo={redirectTo} />

        <p className={styles.disclaimer}>{t('login.disclaimer')}</p>

        {/* Before there is a session, so /api/locale writes only the cookie. A
            querent whose browser says en-GB should not have to sign in through
            an Indonesian form to find this.

            THE ONE FOOTER SWITCHER LEFT (v0.3.0 R1). Everywhere else it moved
            into the account menu; here there is no session and therefore no
            account button, so the footer is the only place it can be -- and
            `variant="names"` because a stranger meeting an unlabelled control
            needs the target language's own name for itself. See the component's
            header. */}
        {localeSwitcherEnabled() ? <LocaleSwitch variant="names" /> : null}
      </div>
    </main>
  );
}
