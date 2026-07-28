import { redirect } from 'next/navigation';
import { signIn } from '@/lib/auth/auth';
import { ERASURE_GRACE_DAYS } from '@/lib/account/grace';
import { LocaleSwitch } from '@/components/LocaleSwitch';
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

        <form
          className={styles.form}
          action={async () => {
            'use server';
            await signIn('google', { redirectTo });
          }}
        >
          <button className={styles.submit} type="submit">
            <GoogleMark />
            {t('login.google')}
          </button>
        </form>

        {/* Four keys rather than one sentence, because two of its words are
            links and `t()` returns a string. The limitation is real and named in
            `id.ts`: a locale wanting a different clause order cannot get one
            from these parts. W7 owns the documents behind the two hrefs. */}
        <p className={styles.legal}>
          {t('login.legal.lead')} <a href="/terms">{t('common.terms')}</a>{' '}
          {t('login.legal.and')} <a href="/privacy">{t('common.privacy')}</a>.
        </p>

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
